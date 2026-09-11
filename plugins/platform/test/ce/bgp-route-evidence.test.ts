import { expect, test } from 'bun:test';
import { parseBgpRoutes } from '../../src/ce/bgp-route-evidence';

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
