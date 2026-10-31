import { expect, it } from 'bun:test';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { fingerprint } from '../../src/ce/discovery';
import { applyPublicTerraformDeployment, planPublicTerraformDeployment } from '../../src/ce/terraform-public';
import { publicTerraformAddresses } from '../../src/ce/terraform-public-ownership';
import { applyPublicTerraformTeardown, planPublicTerraformTeardown } from '../../src/ce/terraform-public-teardown';
import { fixture } from './public-terraform-fixtures';

async function cleanupFixture() {
  const f = await fixture();
  const review = await planPublicTerraformDeployment(f.runtime, f.platform, f.i, f.sources);
  f.setFail('partial');
  await applyPublicTerraformDeployment(f.runtime, f.platform, f.i, review.planHash, f.sources);
  let current: PlanReceipt | undefined,
    applyState: 'planned' | 'applying' | 'applied' = 'planned',
    deletes = 0,
    partial = false;
  const state = () => ({ sha256: fingerprint(f.fields()).slice(7), lineage: 'owned-lineage', serial: 1 });
  f.runtime.session.readStateIdentity = async () => state();
  f.runtime.session.planDestroy = async () => {
    const present = Object.entries(f.fields())
      .filter(([, value]) => value !== null)
      .map(([address]) => address);
    current = {
      ...f.original,
      planSha256: fingerprint({ present, state: state() }).slice(7),
      operation: 'destroy',
      noChanges: present.length === 0,
      changes: present.map((address) => ({ address, type: address.split('.')[0], actions: ['delete'] })),
    };
    applyState = 'planned';
    return structuredClone(current);
  };
  f.runtime.session.readPlannedResourceFields = async () => structuredClone(f.fields());
  f.runtime.session.readApplyCheckpoint = async (receipt) => {
    if (fingerprint(receipt) !== fingerprint(current)) throw new Error('changed saved binary');
    return { schemaVersion: 1, planSha256: receipt.planSha256, state: applyState };
  };
  f.runtime.session.apply = async () => {
    deletes++;
    applyState = 'applying';
    const addresses = publicTerraformAddresses(f.i);
    const removal = partial ? addresses.slice(1, 2) : addresses;
    for (const address of removal) f.fields()[address] = null;
    for (const [link] of f.live) if (!Object.values(f.fields()).some((v) => v?.self_link === link)) f.live.delete(link);
    if (partial) {
      partial = false;
      throw new Error('interrupted delete');
    }
    applyState = 'applied';
  };
  f.runtime.session.reconcileApplyFromEvidence = async () => {
    applyState = 'applied';
  };
  return {
    ...f,
    deletes: () => deletes,
    setPartial: () => {
      partial = true;
    },
  };
}
it('deletes partial disk state with separate exact authorization and all eight absence checks without billing', async () => {
  const f = await cleanupFixture();
  f.sources.funding = async () => {
    throw new Error('billing unavailable');
  };
  const plan = await planPublicTerraformTeardown(f.runtime, f.i, f.boundary, f.policy);
  expect(plan.remaining).toContain('google_compute_disk.node_a');
  expect(plan.savedPlan.changes.every((c) => c.actions.join(',') === 'delete')).toBe(true);
  const done = await applyPublicTerraformTeardown(f.runtime, f.i, f.boundary, f.policy, plan.planHash);
  expect(done.state).toBe('done');
  expect(done.absentObjects).toBe(8);
  expect(f.deletes()).toBe(1);
  await applyPublicTerraformTeardown(f.runtime, f.i, f.boundary, f.policy, plan.planHash);
  expect(f.deletes()).toBe(1);
});
it('rejects changed stable state, replacement identities, foreign state and altered cleanup reviews', async () => {
  for (const change of ['state', 'replacement', 'foreign', 'review', 'context-endpoint']) {
    const f = await cleanupFixture();
    const plan = await planPublicTerraformTeardown(f.runtime, f.i, f.boundary, f.policy);
    let hash = plan.planHash;
    if (change === 'context-endpoint') f.runtime.environment.XCSH_API_URL = 'https://replacement.example.test';
    if (change === 'state')
      f.runtime.session.readStateIdentity = async () => ({ ...plan.state, sha256: 'f'.repeat(64) });
    if (change === 'replacement') {
      const [key, value] = Array.from(f.live)[0];
      f.live.set(key, { ...value, id: '999' });
    }
    if (change === 'foreign')
      f.fields()['google_compute_disk.foreign'] = { ...f.complete['google_compute_disk.node_a'] };
    if (change === 'review') {
      const { planHash: _, ...body } = plan;
      const altered = {
        ...body,
        originalAuthorization: { ...body.originalAuthorization, planHash: fingerprint('foreign') },
      };
      hash = fingerprint(altered);
      f.files.set(`gcp-tf-public-cleanup-reviewed-${hash.slice(7)}.json`, { ...altered, planHash: hash });
    }
    await expect(applyPublicTerraformTeardown(f.runtime, f.i, f.boundary, f.policy, hash)).rejects.toThrow();
    expect(f.deletes()).toBe(0);
  }
});
it('does not replay interrupted partial deletion and reviews only remaining original identities', async () => {
  const f = await cleanupFixture();
  const plan = await planPublicTerraformTeardown(f.runtime, f.i, f.boundary, f.policy);
  f.setPartial();
  expect((await applyPublicTerraformTeardown(f.runtime, f.i, f.boundary, f.policy, plan.planHash)).state).toBe(
    'reconciliation-required',
  );
  expect((await applyPublicTerraformTeardown(f.runtime, f.i, f.boundary, f.policy, plan.planHash)).state).toBe(
    'reconciliation-required',
  );
  expect(f.deletes()).toBe(1);
  const remaining = await planPublicTerraformTeardown(f.runtime, f.i, f.boundary, f.policy);
  expect(remaining.remaining).not.toContain('google_compute_disk.node_a');
  expect((await applyPublicTerraformTeardown(f.runtime, f.i, f.boundary, f.policy, remaining.planHash)).state).toBe(
    'done',
  );
  expect(f.deletes()).toBe(2);
});

it('cannot report resumed cleanup complete without the bound empty destroy receipt', async () => {
  const f = await cleanupFixture();
  const plan = await planPublicTerraformTeardown(f.runtime, f.i, f.boundary, f.policy);
  await applyPublicTerraformTeardown(f.runtime, f.i, f.boundary, f.policy, plan.planHash);
  const name = `gcp-tf-public-cleanup-authorized-${plan.planHash.slice(7)}.json`;
  const journal = f.files.get(name) as { finalPlan?: PlanReceipt };
  delete journal.finalPlan;
  await expect(applyPublicTerraformTeardown(f.runtime, f.i, f.boundary, f.policy, plan.planHash)).rejects.toThrow();
  expect(f.deletes()).toBe(1);
});

it('requires the final empty destroy state snapshot to remain unchanged on resume', async () => {
  for (const change of ['missing', 'foreign-state']) {
    const f = await cleanupFixture();
    const plan = await planPublicTerraformTeardown(f.runtime, f.i, f.boundary, f.policy);
    await applyPublicTerraformTeardown(f.runtime, f.i, f.boundary, f.policy, plan.planHash);
    const name = `gcp-tf-public-cleanup-authorized-${plan.planHash.slice(7)}.json`;
    const journal = f.files.get(name) as { finalState?: unknown };
    if (change === 'missing') delete journal.finalState;
    else f.runtime.session.readStateIdentity = async () => ({ sha256: 'f'.repeat(64), lineage: 'foreign', serial: 2 });
    await expect(applyPublicTerraformTeardown(f.runtime, f.i, f.boundary, f.policy, plan.planHash)).rejects.toThrow();
    expect(f.deletes()).toBe(1);
  }
});
