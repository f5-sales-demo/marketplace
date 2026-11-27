import { expect, test } from 'bun:test';
import { parseBgpServiceMembership } from '../../src/ce/bgp-service-membership';

const expected = [
  { node: 'node-one', interfaceName: 'gre-one', peerAddress: '169.254.10.2' },
  { node: 'node-one', interfaceName: 'gre-one', peerAddress: '169.254.10.3' },
];
const tables = [{ node: 'node-one', routingInstance: 'ves-io-sli-tenant', table: 'inet.0' }];
function evidence() {
  return {
    peers: {
      ver: [
        {
          name: 'node-one.example.test',
          peer: expected.map((item) => ({
            interface_name: item.interfaceName,
            peer_address: { ipv4: { addr: item.peerAddress } },
            protocol_status: 'Established',
            received_prefix_count: 1,
            advertised_prefix_count: 1,
            up_down_timestamp: '2026-10-19T00:00:00Z',
          })),
        },
      ],
    },
    routes: {
      ver: [
        {
          name: 'node-one.example.test',
          ri_table: [
            {
              routing_instance: 'ves-io-sli-tenant',
              rt_table: [
                { name: 'inet.0', imported: [{ subnet: '10.210.0.0/16' }], exported: [{ subnet: '10.200.0.0/16' }] },
              ],
            },
          ],
        },
      ],
    },
  };
}
test('BGP membership distinguishes service withdrawal with established unchanged sessions', () => {
  const f = evidence();
  const active = parseBgpServiceMembership(f.peers, f.routes, expected, tables, ['10.200.0.0/16']);
  expect(active.status).toBe('active');
  expect(active.freshness).toBe('unqualified');
  expect(active.traffic).toBe('unknown');
  f.routes.ver[0].ri_table[0].rt_table[0].exported = [];
  const withdrawn = parseBgpServiceMembership(f.peers, f.routes, expected, tables, ['10.200.0.0/16']);
  expect(withdrawn.status).toBe('withdrawn');
  expect(withdrawn.sessions).toEqual(active.sessions);
});
for (const mode of [
  'missing-instance',
  'missing-table',
  'foreign-peer',
  'partial',
  'duplicate-binding',
  'unresolved-prefix',
] as const)
  test(`BGP service ${mode} rejects`, () => {
    const f = evidence();
    let bindings = tables;
    let prefixes = ['10.200.0.0/16'];
    if (mode === 'missing-instance') f.routes.ver[0].ri_table[0].routing_instance = 'foreign';
    if (mode === 'missing-table') f.routes.ver[0].ri_table[0].rt_table[0].name = 'foreign';
    if (mode === 'foreign-peer') f.peers.ver[0].peer[0].peer_address.ipv4.addr = '169.254.10.99';
    if (mode === 'partial') Object.assign(f.routes, { next_token: 'more' });
    if (mode === 'duplicate-binding') bindings = [...tables, ...tables];
    if (mode === 'unresolved-prefix') prefixes = ['__SERVICE_PREFIX__'];
    expect(() => parseBgpServiceMembership(f.peers, f.routes, expected, bindings, prefixes)).toThrow();
  });
test('BGP session interruption cannot substitute for service withdrawal', () => {
  const f = evidence();
  f.routes.ver[0].ri_table[0].rt_table[0].exported = [];
  f.peers.ver[0].peer[0].protocol_status = 'Idle';
  expect(parseBgpServiceMembership(f.peers, f.routes, expected, tables, ['10.200.0.0/16']).status).toBe('pending');
});
test('partial service prefix recovery remains pending', () => {
  const f = evidence();
  expect(
    parseBgpServiceMembership(f.peers, f.routes, expected, tables, ['10.200.0.0/16', '10.201.0.0/16']).status,
  ).toBe('pending');
});

test('more specific exported service routes prevent withdrawal qualification', () => {
  const f = evidence();
  f.routes.ver[0].ri_table[0].rt_table[0].exported = [{ subnet: '10.200.1.0/24' }];
  expect(parseBgpServiceMembership(f.peers, f.routes, expected, tables, ['10.200.0.0/16']).status).toBe('pending');
});
