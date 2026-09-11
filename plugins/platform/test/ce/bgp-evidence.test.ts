import { expect, test } from 'bun:test';
import { parseBgpSessions } from '../../src/ce/bgp-evidence';

const expected = [
  { node: 'node-one', interfaceName: 'slo-one', peerAddress: '10.20.0.4' },
  { node: 'node-one', interfaceName: 'slo-one', peerAddress: '10.20.0.5' },
];

const response = () => ({
  ver: [
    {
      name: 'node-one.example.test',
      peer: expected.map((session, index) => ({
        interface_name: session.interfaceName,
        peer_address: { ipv4: { addr: session.peerAddress } },
        protocol_status: 'Established',
        received_prefix_count: index + 1,
        advertised_prefix_count: index + 2,
        up_down_timestamp: '2026-09-10T12:00:00Z',
      })),
    },
  ],
});

test('binds every established BGP session to an exact node, SLO object and Route Server address', () => {
  expect(parseBgpSessions(response(), expected)).toEqual({
    status: 'healthy',
    establishedSessions: 2,
    expectedSessions: 2,
    sessions: expected.map((session, index) => ({
      ...session,
      state: 'Established',
      receivedPrefixCount: index + 1,
      advertisedPrefixCount: index + 2,
      stateChangedAt: '2026-09-10T12:00:00Z',
    })),
  });
});

test('accepts the exact four remaining sessions during a three-node failover', () => {
  const remaining = ['node-two', 'node-three'].flatMap((node) =>
    ['10.20.0.4', '10.20.0.5'].map((peerAddress) => ({ node, interfaceName: `slo-${node}`, peerAddress })),
  );
  const value = {
    ver: ['node-two', 'node-three'].map((node) => ({
      name: node,
      peer: remaining
        .filter((session) => session.node === node)
        .map((session) => ({
          interface_name: session.interfaceName,
          peer_address: { ipv4: { addr: session.peerAddress } },
          protocol_status: 'Established',
          received_prefix_count: 2,
          advertised_prefix_count: 1,
          up_down_timestamp: '2026-09-10T12:00:00Z',
        })),
    })),
  };
  expect(parseBgpSessions(value, remaining)).toMatchObject({
    status: 'healthy',
    establishedSessions: 4,
    expectedSessions: 4,
  });
});

test('reports an exact down session as degraded without weakening its identity', () => {
  const value = response();
  value.ver[0].peer[1].protocol_status = 'Active';
  expect(parseBgpSessions(value, expected)).toMatchObject({
    status: 'degraded',
    establishedSessions: 1,
    expectedSessions: 2,
  });
});

test('rejects partial, duplicated, substituted and malformed BGP evidence', () => {
  const variants = [
    { ...response(), next_page_token: 'more' },
    { ...response(), errors: [{ message: 'partial' }] },
    { ver: [] },
    { ver: [{ ...response().ver[0], peer: [response().ver[0].peer[0]] }] },
    { ver: [{ ...response().ver[0], peer: [...response().ver[0].peer, response().ver[0].peer[0]] }] },
    { ver: [{ ...response().ver[0], name: 'foreign-node' }] },
    {
      ver: [
        {
          ...response().ver[0],
          peer: response().ver[0].peer.map((peer, index) =>
            index === 0 ? { ...peer, interface_name: 'substituted-interface' } : peer,
          ),
        },
      ],
    },
    {
      ver: [
        {
          ...response().ver[0],
          peer: response().ver[0].peer.map((peer, index) =>
            index === 0 ? { ...peer, peer_address: { ipv4: { addr: '10.20.0.99' } } } : peer,
          ),
        },
      ],
    },
  ];
  for (const value of variants) expect(() => parseBgpSessions(value, expected)).toThrow();
});
