import { expect, it } from 'bun:test';
import type { GcpResourceIdentity } from '../../src/ce/ownership';
import { planGcpNativePower } from '../../src/ce/power-plan';

const node: GcpResourceIdentity = {
  id: '123',
  selfLink:
    'https://www.googleapis.com/compute/v1/projects/test-project/zones/northamerica-northeast1-a/instances/node-a',
  kind: 'instance',
  project: 'test-project',
  deploymentName: 'ce-test',
  siteName: 'site-a',
  nodeName: 'node-a',
  engine: 'native',
};
function observed() {
  return {
    id: node.id,
    selfLink: node.selfLink,
    status: 'RUNNING' as const,
    machineType: 'n2-standard-8',
    observedAt: new Date().toISOString(),
  };
}
it('resize stops, changes machine and restores original running state with explicit dependencies', () => {
  const plan = planGcpNativePower('resize', [node], [observed()], {
    machineType: 'n2-standard-16',
    guestCpus: 16,
    memoryMiB: 65536,
    maxNics: 8,
    currentNicCount: 2,
  });
  expect(plan.actions.map((a) => a.id)).toEqual(['stop-node-a', 'resize-node-a', 'start-node-a']);
  expect(plan.actions[1].dependencies).toEqual(['stop-node-a']);
  expect(plan.actions[2].dependencies).toEqual(['resize-node-a']);
  expect(plan.actions[1].argv).toContain('--zone=northamerica-northeast1-a');
  expect(plan.executable).toBe(false);
});
it('idempotent start does nothing for running VM; stopped resize does not invent start', () => {
  expect(planGcpNativePower('start', [node], [observed()]).actions).toEqual([]);
  const plan = planGcpNativePower('resize', [node], [{ ...observed(), status: 'TERMINATED' }], {
    machineType: 'n2-standard-16',
    guestCpus: 16,
    memoryMiB: 65536,
    maxNics: 8,
    currentNicCount: 2,
  });
  expect(plan.actions.map((a) => a.id)).toEqual(['resize-node-a']);
});
it('rejects stale/wrong-engine/incomplete inventory and undersized resize', () => {
  expect(() => planGcpNativePower('stop', [{ ...node, engine: 'terraform' }], [observed()])).toThrow('native');
  expect(() => planGcpNativePower('stop', [node], [])).toThrow('inventory');
  expect(() => planGcpNativePower('stop', [node], [{ ...observed(), observedAt: '2000-01-01' }])).toThrow('stale');
  expect(() =>
    planGcpNativePower('resize', [node], [observed()], {
      machineType: 'n2-standard-4',
      guestCpus: 4,
      memoryMiB: 16384,
      maxNics: 2,
      currentNicCount: 2,
    }),
  ).toThrow('sizing');
});
