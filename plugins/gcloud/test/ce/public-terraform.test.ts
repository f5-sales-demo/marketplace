import { expect, it } from 'bun:test';
import { fingerprint } from '../../src/ce/discovery';
import { applyPublicTerraformDeployment, planPublicTerraformDeployment } from '../../src/ce/terraform-public';
import { inspectPublicTerraformOwnership, publicTerraformCloudScope } from '../../src/ce/terraform-public-ownership';
import { planPublicTerraformTeardown } from '../../src/ce/terraform-public-teardown';
import { fixture } from './public-terraform-fixtures';

it('HA ownership preparation cannot admit public deployment or cleanup through the single-node contract', async () => {
  const f = await fixture();
  const node = f.i.sites[0].nodes[0];
  f.i.sites[0].nodes.push({ ...structuredClone(node), name: 'node-b' }, { ...structuredClone(node), name: 'node-c' });
  await expect(planPublicTerraformDeployment(f.runtime, f.platform, f.i, f.sources)).rejects.toThrow('single-node');
  await expect(planPublicTerraformTeardown(f.runtime, f.i, f.boundary, f.policy)).rejects.toThrow('single-node');
  expect(f.applies()).toBe(0);
  expect(f.followPlans()).toBe(0);
});

it('binds exact immutable review and creates once through concurrent and repeated resume', async () => {
  const f = await fixture();
  const plan = await planPublicTerraformDeployment(f.runtime, f.platform, f.i, f.sources);
  expect(plan.savedPlan.changes).toHaveLength(8);
  expect(f.applies()).toBe(0);
  const results = await Promise.allSettled([
    applyPublicTerraformDeployment(f.runtime, f.platform, f.i, plan.planHash, f.sources),
    applyPublicTerraformDeployment(f.runtime, f.platform, f.i, plan.planHash, f.sources),
  ]);
  expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
  expect(f.applies()).toBe(1);
  const done = await applyPublicTerraformDeployment(f.runtime, f.platform, f.i, plan.planHash, f.sources);
  expect(done.state).toBe('done');
  expect(f.applies()).toBe(1);
  expect(JSON.stringify(done)).not.toContain('private-token');
});
it('rejects changed reviews, bindings, documents and engines before submission', async () => {
  for (const change of [
    'intent',
    'contract',
    'policy',
    'funding',
    'byol',
    'lock',
    'configuration',
    'tamper',
    'stale',
    'engine',
    'raw-lock',
    'context',
    'context-endpoint',
  ]) {
    const f = await fixture();
    const plan = await planPublicTerraformDeployment(f.runtime, f.platform, f.i, f.sources);
    let hash = plan.planHash;
    if (change === 'intent') f.i.diskGiB = 90;
    if (change === 'engine') f.i.engine = 'native';
    if (change === 'contract') f.boundary.fingerprint = fingerprint('changed');
    if (change === 'policy') f.policy.normalizedSha256 = fingerprint('changed');
    if (change === 'funding') f.funding.policySha256 = fingerprint('changed');
    if (change === 'byol') f.byol.authorizationHash = fingerprint('changed');
    if (change === 'lock') f.original.providerLockSha256 = 'e'.repeat(64);
    if (change === 'configuration') f.original.configurationSha256 = 'e'.repeat(64);
    if (change === 'raw-lock') {
      const saved = f.files.get('gcp-terraform-session-inputs.json') as { inputs: { providerLock: string } };
      saved.inputs.providerLock = 'replacement-lock';
    }
    if (change === 'context') {
      const saved = f.files.get('gcp-terraform-input-identity.json') as { platformContext: string };
      saved.platformContext = 'replacement-context';
    }
    if (change === 'context-endpoint') f.runtime.environment.XCSH_API_URL = 'https://replacement.example.test';
    if (change === 'tamper' || change === 'stale') {
      const { planHash: _, ...body } = plan;
      const altered = {
        ...body,
        ...(change === 'stale'
          ? { createdAt: '2000-01-01T00:00:00Z' }
          : { savedPlan: { ...body.savedPlan, planSha256: 'f'.repeat(64) } }),
      };
      hash = fingerprint(altered);
      f.files.set(`gcp-tf-deploy-reviewed-${hash.slice(7)}.json`, { ...altered, planHash: hash });
    }
    await expect(applyPublicTerraformDeployment(f.runtime, f.platform, f.i, hash, f.sources)).rejects.toThrow();
    expect(f.applies()).toBe(0);
  }
});

it('recovers interrupted ownership capture by inspecting the original consumed attempt', async () => {
  const f = await fixture();
  const plan = await planPublicTerraformDeployment(f.runtime, f.platform, f.i, f.sources);
  const inspect = f.runtime.session.readApplyAttemptResourceFields;
  if (!inspect) throw new Error('fixture inspection unavailable');
  let interrupted = false;
  f.runtime.session.readApplyAttemptResourceFields = async (...args) => {
    if (!interrupted) {
      interrupted = true;
      throw new Error('ownership capture interrupted');
    }
    return inspect(...args);
  };
  expect((await applyPublicTerraformDeployment(f.runtime, f.platform, f.i, plan.planHash, f.sources)).state).toBe(
    'reconciliation-required',
  );
  expect((await applyPublicTerraformDeployment(f.runtime, f.platform, f.i, plan.planHash, f.sources)).state).toBe(
    'done',
  );
  expect(f.applies()).toBe(1);
});

it('requires reconciliation for missing state and rejects sensitive state projections', async () => {
  for (const condition of ['missing-state', 'sensitive']) {
    const f = await fixture();
    const plan = await planPublicTerraformDeployment(f.runtime, f.platform, f.i, f.sources);
    const inspect = f.runtime.session.readApplyAttemptResourceFields;
    if (!inspect) throw new Error('fixture inspection unavailable');
    f.runtime.session.readApplyAttemptResourceFields = async (...args) => {
      if (condition === 'missing-state') throw new Error('owning state unavailable');
      const projection = await inspect(...args);
      projection.resources['xcsh_token.node_a'] = {
        ...projection.resources['xcsh_token.node_a'],
        content: 'private-bootstrap-fixture',
      };
      return projection;
    };
    const result = await applyPublicTerraformDeployment(f.runtime, f.platform, f.i, plan.planHash, f.sources);
    expect(result.state).toBe('reconciliation-required');
    expect(f.files.has('gcp-tf-public-ownership.json')).toBe(false);
    expect(JSON.stringify(result)).not.toContain('private-bootstrap-fixture');
    await applyPublicTerraformDeployment(f.runtime, f.platform, f.i, plan.planHash, f.sources);
    expect(f.applies()).toBe(1);
  }
});
it('inspects interrupted complete apply and reconciles without resubmitting', async () => {
  const f = await fixture();
  const plan = await planPublicTerraformDeployment(f.runtime, f.platform, f.i, f.sources);
  f.setFail('success');
  const first = await applyPublicTerraformDeployment(f.runtime, f.platform, f.i, plan.planHash, f.sources);
  expect(first.state).toBe('done');
  expect(f.reconciles()).toBe(1);
  await applyPublicTerraformDeployment(f.runtime, f.platform, f.i, plan.planHash, f.sources);
  expect(f.applies()).toBe(1);
});
it('persists a partial disk-owning subset and never submits the consumed apply again', async () => {
  const f = await fixture();
  const plan = await planPublicTerraformDeployment(f.runtime, f.platform, f.i, f.sources);
  f.setFail('partial');
  const first = await applyPublicTerraformDeployment(f.runtime, f.platform, f.i, plan.planHash, f.sources);
  await inspectPublicTerraformOwnership(f.runtime, f.i, f.original);
  expect(first.state).toBe('partial');
  expect(f.followPlans()).toBe(0);
  expect(f.reconciles()).toBe(0);
  await applyPublicTerraformDeployment(f.runtime, f.platform, f.i, plan.planHash, f.sources);
  expect(f.applies()).toBe(1);
  const ownership = f.files.get('gcp-tf-public-ownership.json') as { addresses: string[] };
  expect(ownership.addresses).toContain('google_compute_disk.node_a');
  expect(ownership.addresses).not.toContain('google_compute_instance.node_a');
});
it('replacement identities and unidentified objects cannot acquire ownership', async () => {
  for (const change of ['xc', 'cloud', 'unidentified']) {
    const f = await fixture();
    const plan = await planPublicTerraformDeployment(f.runtime, f.platform, f.i, f.sources);
    f.setFail('partial');
    await applyPublicTerraformDeployment(f.runtime, f.platform, f.i, plan.planHash, f.sources);
    if (change === 'cloud') {
      const [key, row] = Array.from(f.live)[0];
      f.live.set(key, { ...row, id: '999' });
    }
    if (change === 'xc')
      f.fields()['xcsh_securemesh_site_v2.ce_site'] = {
        ...f.complete['xcsh_securemesh_site_v2.ce_site'],
        creation_identity_sha256: fingerprint('replacement'),
      };
    if (change === 'unidentified')
      f.live.set(publicTerraformCloudScope(f.i)[0].selfLink, {
        id: '999',
        selfLink: publicTerraformCloudScope(f.i)[0].selfLink,
      });
    const result = await applyPublicTerraformDeployment(f.runtime, f.platform, f.i, plan.planHash, f.sources);
    expect(result.state).toBe('reconciliation-required');
    expect(f.applies()).toBe(1);
  }
});

it('resumes authorization persisted before submission without applying twice', async () => {
  const f = await fixture();
  const plan = await planPublicTerraformDeployment(f.runtime, f.platform, f.i, f.sources);
  f.setFail('before');
  const first = await applyPublicTerraformDeployment(f.runtime, f.platform, f.i, plan.planHash, f.sources);
  expect(first.state).toBe('reconciliation-required');
  expect(f.applies()).toBe(0);
  expect((await applyPublicTerraformDeployment(f.runtime, f.platform, f.i, plan.planHash, f.sources)).state).toBe(
    'done',
  );
  expect(f.applies()).toBe(1);
});
it('recovers interruption during follow-up planning from frozen original ownership', async () => {
  const f = await fixture();
  const plan = await planPublicTerraformDeployment(f.runtime, f.platform, f.i, f.sources);
  const originalPlan = f.runtime.session.plan;
  let first = true;
  f.runtime.session.plan = async (...args) => {
    if (first) {
      first = false;
      throw new Error('follow-up interrupted');
    }
    return originalPlan(...args);
  };
  expect((await applyPublicTerraformDeployment(f.runtime, f.platform, f.i, plan.planHash, f.sources)).state).toBe(
    'reconciliation-required',
  );
  expect((await applyPublicTerraformDeployment(f.runtime, f.platform, f.i, plan.planHash, f.sources)).state).toBe(
    'done',
  );
  expect(f.applies()).toBe(1);
});

it('does not attest a completed deployment after owning state is lost or replaced', async () => {
  for (const change of ['missing', 'foreign', 'changed']) {
    const f = await fixture();
    const plan = await planPublicTerraformDeployment(f.runtime, f.platform, f.i, f.sources);
    expect((await applyPublicTerraformDeployment(f.runtime, f.platform, f.i, plan.planHash, f.sources)).state).toBe(
      'done',
    );
    const read = f.runtime.session.readStateIdentity;
    f.runtime.session.readStateIdentity = async () => {
      if (change === 'missing') throw new Error('Owning state unavailable');
      return { sha256: 'f'.repeat(64), lineage: change === 'foreign' ? 'foreign-lineage' : 'owned-lineage', serial: 2 };
    };
    expect((await applyPublicTerraformDeployment(f.runtime, f.platform, f.i, plan.planHash, f.sources)).state).toBe(
      'reconciliation-required',
    );
    expect(f.applies()).toBe(1);
    expect(
      (f.files.get('gcp-tf-public-deployment.json') as { completionReconciliation: boolean }).completionReconciliation,
    ).toBe(true);
    f.runtime.session.readStateIdentity = read;
    expect((await applyPublicTerraformDeployment(f.runtime, f.platform, f.i, plan.planHash, f.sources)).state).toBe(
      'done',
    );
    expect(f.applies()).toBe(1);
  }
});

it('requires stable original state throughout completion planning', async () => {
  const f = await fixture();
  const plan = await planPublicTerraformDeployment(f.runtime, f.platform, f.i, f.sources);
  const read = f.runtime.session.readStateIdentity;
  if (!read) throw new Error('Fixture state reader unavailable');
  const followUp = f.runtime.session.plan;
  f.runtime.session.plan = async (...args) => {
    const receipt = await followUp(...args);
    f.runtime.session.readStateIdentity = async () => ({ ...(await read()), sha256: 'f'.repeat(64) });
    return receipt;
  };
  expect((await applyPublicTerraformDeployment(f.runtime, f.platform, f.i, plan.planHash, f.sources)).state).toBe(
    'reconciliation-required',
  );
  expect((f.files.get('gcp-tf-public-deployment.json') as { finalState?: unknown }).finalState).toBeUndefined();
  expect(f.applies()).toBe(1);
  f.runtime.session.readStateIdentity = read;
  f.runtime.session.plan = followUp;
  expect((await applyPublicTerraformDeployment(f.runtime, f.platform, f.i, plan.planHash, f.sources)).state).toBe(
    'done',
  );
  expect(f.applies()).toBe(1);
});
