import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { type SessionManagerLike, savePlanArtifact } from '../../src/ce/artifacts';
import { compileAzureCePlan } from '../../src/ce/planner';
import { AzureTerraformOutcomeAbsent, saveAzureTerraformOutcome } from '../../src/ce/terraform-outcome';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { intent, observation } from './fixtures';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'azure-public-history-loaders-'));
  roots.push(root);
  const input = structuredClone(intent);
  input.engine = 'terraform';
  const plan = compileAzureCePlan(input, structuredClone(observation));
  const store = await CeDeploymentStore.open(root, azureUpgradeBinding(plan).owner);
  const directory = await mkdtemp(join(tmpdir(), 'azure-public-history-packets-'));
  roots.push(directory);
  let next = 0;
  const session: SessionManagerLike = {
    getSessionId: () => directory,
    getArtifactsDir: () => directory,
    getArtifactPath: async () => null,
    async saveArtifact(content, type) {
      const id = String(++next);
      await writeFile(join(directory, `${id}.${type}.log`), content, { mode: 0o600 });
      return id;
    },
  };
  await savePlanArtifact(session, plan, observation);
  return { plan, store, session, directory };
}
async function factory() {
  return (await import('../../src/ce/terraform-public-history-loaders')).createAzureTerraformPublicHistoryLoaders;
}
test('public history loaders resolve exact native source and public outcome without executing Terraform', async () => {
  const f = await fixture();
  const outcome = { engine: 'terraform', planId: f.plan.planId, planSha256: f.plan.planSha256, status: 'registered' };
  await saveAzureTerraformOutcome(f.session, outcome);
  const loaders = await (await factory())(f.plan, f.session, f.store);
  const loaded = await loaders.loadSource(f.plan.planSha256);
  expect(loaded).toEqual(f.plan);
  loaded.siteName = 'changed-return';
  expect(await loaders.loadSource(f.plan.planSha256)).toEqual(f.plan);
  expect(await loaders.loadOutcome(f.plan)).toEqual(outcome);
});
test('public history loaders reject unresolved execution identifiers', async () => {
  const f = await fixture();
  const loaders = await (await factory())(f.plan, f.session, f.store);
  await expect(loaders.loadSource('f'.repeat(64))).rejects.toThrow();
  await expect(loaders.loadSource('deferred')).rejects.toThrow();
});
test('public history loaders reject a real published foreign deployment', async () => {
  const f = await fixture();
  const other = compileAzureCePlan(
    { ...intent, engine: 'terraform', deploymentName: 'foreign-demo', siteName: 'foreign-demo' },
    observation,
  );
  await savePlanArtifact(f.session, other, observation);
  const loaders = await (await factory())(f.plan, f.session, f.store);
  await expect(loaders.loadSource(other.planSha256)).rejects.toThrow();
});
test('public history loaders reject changed caller source when loading an outcome', async () => {
  const f = await fixture();
  const loaders = await (await factory())(f.plan, f.session, f.store);
  await expect(loaders.loadOutcome({ ...f.plan, siteName: 'foreign-site' })).rejects.toThrow();
});
test('public history loaders recheck frozen public namespace after construction', async () => {
  const f = await fixture();
  const loaders = await (await factory())(f.plan, f.session, f.store);
  const other = compileAzureCePlan(
    { ...intent, engine: 'terraform', deploymentName: 'other-demo', siteName: 'other-demo' },
    observation,
  );
  await savePlanArtifact(f.session, other, observation);
  await expect(loaders.loadSource(f.plan.planSha256)).rejects.toThrow();
});
test('public history loaders preserve genuine exhaustive outcome absence', async () => {
  const f = await fixture();
  const loaders = await (await factory())(f.plan, f.session, f.store);
  await expect(loaders.loadOutcome(f.plan)).rejects.toBeInstanceOf(AzureTerraformOutcomeAbsent);
});
test('public history loaders reject expired cancellation and changed session', async () => {
  const f = await fixture();
  await expect(
    (await factory())(f.plan, f.session, f.store, AbortSignal.abort(Error('stop public history'))),
  ).rejects.toThrow();
  const loaders = await (await factory())(f.plan, f.session, f.store);
  f.session.getSessionId = () => 'foreign-session';
  await expect(loaders.loadSource(f.plan.planSha256)).rejects.toThrow();
});

test('public history loaders reject replacement callbacks even when session identity is preserved', async () => {
  const f = await fixture();
  const loaders = await (await factory())(f.plan, f.session, f.store);
  const id = f.session.getSessionId();
  f.session.getSessionId = () => id;
  await expect(loaders.loadSource(f.plan.planSha256)).rejects.toThrow();
});
