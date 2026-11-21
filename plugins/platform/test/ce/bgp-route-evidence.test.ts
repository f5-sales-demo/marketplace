import { expect, test } from 'bun:test';
import { parseBgpRoutePaths, parseBgpRoutes } from '../../src/ce/bgp-route-evidence';

const expectedNodes = ['node-one'];
const response = () => ({
  ver: [
    {
      name: 'node-one.example.test',
      ri_table: [
        {
          routing_instance: 'ves-io-slo-tenant',
          rt_table: [
            {
              name: 'inet.0',
              imported: [{ subnet: '10.20.0.0/24', path: [] }],
              exported: [{ subnet: '10.250.0.10/32', path: [] }],
            },
          ],
        },
      ],
    },
  ],
});

test('collects exact per-node imported and exported BGP prefixes without inventing convergence', () => {
  expect(parseBgpRoutes(response(), expectedNodes)).toEqual({
    status: 'observed',
    nodes: [
      {
        node: 'node-one',
        routingInstances: [
          {
            name: 'ves-io-slo-tenant',
            tables: [{ name: 'inet.0', imported: ['10.20.0.0/24'], exported: ['10.250.0.10/32'] }],
          },
        ],
      },
    ],
  });
});

test('accepts the two remaining node route tables during failover', () => {
  const value = {
    ver: ['node-two', 'node-three'].map((name) => ({
      name,
      ri_table: [
        {
          routing_instance: 'ves-io-slo-tenant',
          rt_table: [{ name: 'inet.0', imported: [], exported: [] }],
        },
      ],
    })),
  };
  expect(parseBgpRoutes(value, ['node-two', 'node-three'])).toMatchObject({
    status: 'observed',
    nodes: [{ node: 'node-two' }, { node: 'node-three' }],
  });
});

test('rejects partial, substituted, duplicate, and malformed BGP route inventories', () => {
  const variants = [
    { ...response(), next_page_token: 'more' },
    { ver: [] },
    { ver: [{ ...response().ver[0], name: 'foreign-node' }] },
    {
      ver: [
        {
          ...response().ver[0],
          ri_table: [...response().ver[0].ri_table, response().ver[0].ri_table[0]],
        },
      ],
    },
    {
      ver: [
        {
          ...response().ver[0],
          ri_table: [
            {
              ...response().ver[0].ri_table[0],
              rt_table: [
                {
                  ...response().ver[0].ri_table[0].rt_table[0],
                  imported: [{ subnet: '10.20.0.0/33' }],
                },
              ],
            },
          ],
        },
      ],
    },
  ];
  for (const value of variants) expect(() => parseBgpRoutes(value, expectedNodes)).toThrow();
});

test('empty routing instances and empty table inventories are incomplete route evidence', () => {
  const value = response();
  value.ver[0].ri_table = [];
  expect(() => parseBgpRoutes(value, expectedNodes)).toThrow('Incomplete');
  const noTables = response();
  noTables.ver[0].ri_table[0].rt_table = [];
  expect(() => parseBgpRoutes(noTables, expectedNodes)).toThrow('Incomplete');
});

const pathResponse = () => ({
  ver: [
    {
      name: 'node-one.example.test',
      ri_table: [
        {
          routing_instance: 'opaque-instance',
          rt_table: [
            {
              name: 'opaque-table',
              imported: [
                {
                  subnet: '10.20.0.0/24',
                  path: [
                    { peer: 'opaque-relay-peer', nh: ['10.20.0.20'], as_path: '65001 65515', local_pref: 100, med: 0 },
                  ],
                },
              ],
              exported: [{ subnet: '10.250.0.10/32', path: [{ peer: 'opaque-origin', nh: ['0.0.0.0'], as_path: '' }] }],
            },
          ],
        },
      ],
    },
  ],
});

test('collects exact API path attributes under opaque table names without inventing SLO or freshness semantics', () => {
  const evidence = parseBgpRoutePaths(pathResponse(), expectedNodes);
  expect(evidence).toMatchObject({
    status: 'observed',
    scope: 'unqualified',
    freshness: 'unqualified',
    traffic: 'unknown',
  });
  if (evidence.status !== 'observed') throw Error('path observation unavailable');
  expect(evidence.nodes[0].routingInstances[0]).toEqual({
    name: 'opaque-instance',
    tables: [
      {
        name: 'opaque-table',
        imported: [
          {
            subnet: '10.20.0.0/24',
            path: [{ peer: 'opaque-relay-peer', nh: ['10.20.0.20'], as_path: '65001 65515', local_pref: 100, med: 0 }],
          },
        ],
        exported: [{ subnet: '10.250.0.10/32', path: [{ peer: 'opaque-origin', nh: ['0.0.0.0'], as_path: '' }] }],
      },
    ],
  });
  expect(parseBgpRoutes(pathResponse(), expectedNodes).nodes[0].routingInstances[0].tables[0].imported).toEqual([
    '10.20.0.0/24',
  ]);
});

test('missing, empty, malformed, duplicate or partial paths remain unknown separately from prefix membership', () => {
  for (const path of [
    undefined,
    [],
    null,
    {},
    [{}],
    [{ peer: '', nh: ['10.20.0.20'] }],
    [{ peer: 'opaque', nh: [] }],
    [{ peer: 'opaque', nh: ['10.20.0.20', '10.20.0.20'] }],
    [{ peer: 'opaque', nh: ['10.20.0.20'], local_pref: 9007199254740992 }],
    [{ peer: 'opaque', nh: ['10.20.0.20'], unexpected: true }],
    [
      { peer: 'opaque', nh: ['10.20.0.20'] },
      { peer: 'opaque', nh: ['10.20.0.20'], med: 99 },
    ],
  ]) {
    const value = pathResponse();
    Object.assign(value.ver[0].ri_table[0].rt_table[0].imported[0], { path });
    expect(parseBgpRoutePaths(value, expectedNodes)).toMatchObject({
      status: 'unknown',
      scope: 'unqualified',
      freshness: 'unqualified',
      traffic: 'unknown',
    });
    expect(parseBgpRoutes(value, expectedNodes).status).toBe('observed');
  }
  expect(parseBgpRoutePaths({ ...pathResponse(), next_page_token: 'more' }, expectedNodes).status).toBe('unknown');
  expect(parseBgpRoutePaths(pathResponse(), ['foreign-node']).status).toBe('unknown');
});

test('distinct paths and complete empty inventories preserve observation without operational acceptance', () => {
  const value = pathResponse();
  value.ver[0].ri_table[0].rt_table[0].imported[0].path.push({
    peer: 'second-peer',
    nh: ['10.20.0.21'],
    as_path: '65002',
    local_pref: 100,
    med: 0,
  });
  const evidence = parseBgpRoutePaths(value, expectedNodes);
  expect(evidence.status).toBe('observed');
  if (evidence.status !== 'observed') throw Error('path observation unavailable');
  expect(evidence.nodes[0].routingInstances[0].tables[0].imported[0].path).toHaveLength(2);
  value.ver[0].ri_table[0].rt_table[0].imported = [];
  value.ver[0].ri_table[0].rt_table[0].exported = [];
  expect(parseBgpRoutePaths(value, expectedNodes)).toMatchObject({
    status: 'observed',
    scope: 'unqualified',
    freshness: 'unqualified',
    traffic: 'unknown',
  });
});
