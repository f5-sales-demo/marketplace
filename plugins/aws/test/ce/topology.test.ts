import { expect, test } from 'bun:test';
import { siteBindings, siteForNode, siteTopology } from '../../src/ce/topology';
import type { AwsCePlan } from '../../src/ce/types';

const independent = {
  siteName: 'deployment',
  topology: {
    nodeCount: 3 as const,
    sites: [
      { name: 'site-a', nodeIndexes: [1] },
      { name: 'site-b', nodeIndexes: [2] },
      { name: 'site-c', nodeIndexes: [3] },
    ],
  },
};
test('distinguishes three independent sites from one three-node HA site', () => {
  expect(siteTopology(independent)).toHaveLength(3);
  expect(siteTopology({ siteName: 'ha', topology: { nodeCount: 3 } })).toEqual([
    { name: 'ha', nodeIndexes: [1, 2, 3] },
  ]);
  const plan = {
    intent: independent,
    deploymentName: 'demo',
    engine: 'native',
    accountId: '123456789012',
    region: 'us-east-1',
  } as AwsCePlan;
  expect(siteBindings(plan).map(({ binding }) => ({ site: binding.siteName, nodes: binding.nodes }))).toEqual([
    { site: 'site-a', nodes: ['demo-1'] },
    { site: 'site-b', nodes: ['demo-2'] },
    { site: 'site-c', nodes: ['demo-3'] },
  ]);
  expect(siteForNode(independent, 2).name).toBe('site-b');
});
test('rejects duplicate site names, shared nodes, unassigned nodes and unsupported two-node clusters', () => {
  for (const sites of [
    [
      { name: 'same', nodeIndexes: [1] },
      { name: 'same', nodeIndexes: [2] },
      { name: 'other', nodeIndexes: [3] },
    ],
    [
      { name: 'a', nodeIndexes: [1, 2, 3] },
      { name: 'b', nodeIndexes: [1] },
    ],
    [{ name: 'a', nodeIndexes: [1] }],
    [
      { name: 'a', nodeIndexes: [1, 2] },
      { name: 'b', nodeIndexes: [3] },
    ],
  ])
    expect(() => siteTopology({ ...independent, topology: { nodeCount: 3, sites } })).toThrow();
});
