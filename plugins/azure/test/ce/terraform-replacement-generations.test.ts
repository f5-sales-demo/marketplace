import { expect, test } from 'bun:test';
import type { ReplacementCheckpoint } from '../../src/ce/terraform-replacement';
import { fixture, historicalFixture } from './terraform-generation-fixture';

for (const ha of [false, true]) {
  test(`standard Terraform ${ha ? 'three-node' : 'single'} generation identity chain`, () => {
    const f = fixture(ha);
    expect(() => f.verify()).not.toThrow();
    expect(Object.values(f.third.checkpoint.retainedNics)).toHaveLength(ha ? 6 : 2);
    expect(
      Object.values(f.third.checkpoint.retainedNics).every((nic) => nic.ownerPlanSha256 === f.base.planSha256),
    ).toBe(true);
  });
  for (const mode of [
    'incomplete',
    'missing-checkpoint',
    'wrong-uuid',
    'foreign-site',
    'changed-nic',
    'recursive',
    'foreign-original',
  ] as const)
    test(`standard Terraform ${ha ? 'three-node' : 'single'} generation rejects ${mode}`, () => {
      const f = fixture(ha);
      if (mode === 'incomplete') {
        f.second.checkpoint.phase = 'launched';
      }
      if (mode === 'missing-checkpoint') f.checkpoints.delete(f.second.plan.planSha256);
      if (mode === 'wrong-uuid')
        f.third.checkpoint.oldVmIds[f.nodes[ha ? 1 : 0]] = '00000000-0000-4000-8000-000000000777';
      if (mode === 'foreign-site') f.second.checkpoint.siteUid = 'foreign-site';
      if (mode === 'changed-nic') f.second.checkpoint.retainedNics['1:0'].mac = '02:00:00:00:00:ff';
      if (mode === 'recursive') f.first.checkpoint.ownerPlanSha256ByNode[f.nodes[0]] = f.second.plan.planSha256;
      if (mode === 'foreign-original') f.sources.set(f.base.planSha256, f.first.plan);
      expect(() => f.verify()).toThrow();
    });
}

test('three-node generation rejects changed survivor UUID across original-owner boundaries', () => {
  const f = fixture(true);
  f.second.checkpoint.oldVmIds[f.nodes[2]] = '00000000-0000-4000-8000-000000000888';
  expect(() => f.verify()).toThrow();
});

test('three-node generation rejects owner source for the wrong selected node', () => {
  const f = fixture(true);
  f.third.checkpoint.ownerPlanSha256ByNode[f.nodes[2]] = f.first.plan.planSha256;
  expect(() => f.verify()).toThrow();
});

for (const ha of [false, true])
  for (const mode of [
    'complete',
    'incomplete-predecessor',
    'wrong-current-uuid',
    'missing-predecessor-checkpoint',
  ] as const)
    test(`actual historical preflight ${ha ? 'three-node' : 'single'} successive generations ${mode}`, () => {
      const f = historicalFixture(ha);
      if (mode === 'incomplete-predecessor') {
        f.second.checkpoint.phase = 'launched';
        f.records.delete(`${f.second.plan.planId}-terraform-replacement-final-plan.json`);
      }
      if (mode === 'missing-predecessor-checkpoint')
        f.records.delete(`${f.second.plan.planId}-terraform-replacement.json`);
      if (mode === 'wrong-current-uuid') {
        f.third.checkpoint.oldVmIds[f.nodes[ha ? 1 : 0]] = '00000000-0000-4000-8000-000000000999';
        const snapshot = f.records.get(`${f.third.plan.planId}-terraform-replacement-source.json`) as {
          preparedCheckpoint: ReplacementCheckpoint;
        };
        snapshot.preparedCheckpoint.oldVmIds = structuredClone(f.third.checkpoint.oldVmIds);
      }
      if (mode === 'complete') expect(() => f.verifyHistory()).not.toThrow();
      else expect(() => f.verifyHistory()).toThrow();
    });
