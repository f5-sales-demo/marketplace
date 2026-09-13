import { isIP } from 'node:net';

type Json = Record<string, unknown>;
export interface ExpectedBgpSession {
  node: string;
  interfaceName: string;
  peerAddress: string;
}

const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed BGP session evidence');
  return value as Json;
};
const array = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) throw new Error('Incomplete BGP session evidence');
  return value;
};
const matchesNode = (expected: string, actual: unknown) =>
  actual === expected || (typeof actual === 'string' && actual.startsWith(`${expected}.`));

/** Parse a complete, exact platform BGP inventory; no caller-supplied health claims are accepted. */
export function parseBgpSessions(response: unknown, expected: ExpectedBgpSession[]) {
  if (
    ![2, 4, 6].includes(expected.length) ||
    new Set(expected.map((item) => `${item.node}/${item.interfaceName}/${item.peerAddress}`)).size !==
      expected.length ||
    expected.some(
      (item) =>
        !/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(item.node) ||
        !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(item.interfaceName) ||
        item.interfaceName.includes('__') ||
        isIP(item.peerAddress) !== 4,
    )
  )
    throw new Error('Invalid expected BGP session identity');
  const value = object(response);
  if (
    value.next_page_token ||
    value.next_token ||
    value.continuation_token ||
    value.NextToken ||
    (value.errors !== undefined && array(value.errors).length)
  )
    throw new Error('Partial BGP session evidence');
  const expectedNodes = [...new Set(expected.map((item) => item.node))];
  const nodes = array(value.ver).map(object);
  if (
    nodes.length !== expectedNodes.length ||
    expectedNodes.some((node) => nodes.filter((candidate) => matchesNode(node, candidate.name)).length !== 1)
  )
    throw new Error('BGP session node identity differs');
  const actual = nodes.flatMap((node) =>
    array(node.peer).map((item) => {
      const peer = object(item);
      const address = object(object(peer.peer_address).ipv4).addr;
      if (
        typeof node.name !== 'string' ||
        typeof peer.interface_name !== 'string' ||
        typeof address !== 'string' ||
        isIP(address) !== 4 ||
        typeof peer.protocol_status !== 'string' ||
        ![
          'Unknown',
          'Idle',
          'Connect',
          'Active',
          'OpenSent',
          'OpenConfirm',
          'Established',
          'Clearing',
          'Deleted',
        ].includes(peer.protocol_status) ||
        !Number.isInteger(peer.received_prefix_count) ||
        Number(peer.received_prefix_count) < 0 ||
        !Number.isInteger(peer.advertised_prefix_count) ||
        Number(peer.advertised_prefix_count) < 0 ||
        typeof peer.up_down_timestamp !== 'string' ||
        Number.isNaN(Date.parse(peer.up_down_timestamp))
      )
        throw new Error('Malformed BGP peer evidence');
      return {
        node: node.name,
        interfaceName: peer.interface_name,
        peerAddress: address,
        state: peer.protocol_status,
        receivedPrefixCount: Number(peer.received_prefix_count),
        advertisedPrefixCount: Number(peer.advertised_prefix_count),
        stateChangedAt: peer.up_down_timestamp,
      };
    }),
  );
  if (actual.length !== expected.length) throw new Error('BGP session count differs');
  const sessions = expected.map((item) => {
    const matches = actual.filter(
      (candidate) =>
        matchesNode(item.node, candidate.node) &&
        candidate.interfaceName === item.interfaceName &&
        candidate.peerAddress === item.peerAddress,
    );
    if (matches.length !== 1) throw new Error('BGP session identity differs');
    return { ...item, ...matches[0], node: item.node };
  });
  const establishedSessions = sessions.filter((session) => session.state === 'Established').length;
  return {
    status: establishedSessions === expected.length ? ('healthy' as const) : ('degraded' as const),
    establishedSessions,
    expectedSessions: expected.length,
    sessions,
  };
}
