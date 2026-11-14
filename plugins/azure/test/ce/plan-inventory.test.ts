import { afterEach, expect, test } from 'bun:test';
import { unlinkSync, writeFileSync } from 'node:fs';
import { mkdtemp, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readAzureCePlanInventory, type SessionManagerLike, savePlanArtifact } from '../../src/ce/artifacts';
import { canonicalSha256 } from '../../src/ce/canonical';
import { compileAzureCePlan } from '../../src/ce/planner';
import { compileAzureTerraformNetworkUpdatePlan } from '../../src/ce/terraform-network-plan';
import { compileAzureTerraformNetworkReplacementPlan } from '../../src/ce/terraform-network-replacement-plan';
import { readAzureTerraformNetworkRetirementRequests } from '../../src/ce/terraform-network-retirement-requests';
import type { AzureCePlan } from '../../src/ce/types';
import { intent, observation } from './fixtures';
import { networkUpdateFixture } from './network-update-fixture';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture(persistent = true) {
  const root = await mkdtemp(join(tmpdir(), 'azure-plan-inventory-'));
  roots.push(root);
  let sequence = 0;
  const session: SessionManagerLike = {
    getSessionId: () => root,
    getArtifactsDir: () => (persistent ? root : null),
    getArtifactPath: async (id) => join(root, `${id}.azure-ce-plan.log`),
    saveArtifact: async (content, type) => {
      if (!persistent) return undefined;
      const id = String(++sequence);
      await writeFile(join(root, `${id}.${type}.log`), content);
      return id;
    },
  };
  return { root, session, save: (plan: AzureCePlan) => savePlanArtifact(session, plan, observation) };
}
const base = compileAzureCePlan(intent, observation);
test('fresh session manager inventories persisted plans without relying on publication cache', async () => {
  const f = await fixture();
  await f.save(base);
  await writeFile(join(f.root, 'unrelated.azure-ce-discovery.log'), '{');
  const fresh = { ...f.session };
  const inventory = await readAzureCePlanInventory(fresh);
  expect(inventory.plans[0].plan).toEqual(base);
  await inventory.recheck();
  await writeFile(
    join(f.root, '2.azure-ce-plan.log'),
    JSON.stringify({ kind: 'azure-ce-plan', plan: base, observation }),
  );
  expect((await readAzureCePlanInventory(fresh)).plans).toHaveLength(1);
});
for (const fault of ['added-during-read', 'deleted-during-read', 'changed-during-read'] as const) {
  test(`inventory rejects ${fault} across the initial custody boundary`, async () => {
    const f = await fixture();
    await f.save(base);
    let calls = 0;
    f.session.getSessionId = () => {
      if (++calls === 12) {
        if (fault === 'added-during-read') writeFileSync(join(f.root, '2.azure-ce-plan.log'), '{');
        if (fault === 'deleted-during-read') unlinkSync(join(f.root, '1.azure-ce-plan.log'));
        if (fault === 'changed-during-read') writeFileSync(join(f.root, '1.azure-ce-plan.log'), '{');
      }
      return f.root;
    };
    await expect(readAzureCePlanInventory(f.session)).rejects.toThrow();
    expect(calls).toBeGreaterThanOrEqual(12);
  });
}
test('network request discovery handles an empty selected lineage and seals the original request', async () => {
  const f = await fixture();
  const n = networkUpdateFixture(false, 'terraform', true, false);
  await f.save(n.original);
  const inventory = await readAzureTerraformNetworkRetirementRequests(n.original, f.session);
  expect(inventory.requests).toEqual([]);
  expect(inventory.executionHistoryQualified).toBe(false);
  await inventory.recheck();
});
function resign(plan: AzureCePlan): AzureCePlan {
  const { planId: _id, planSha256: _sha, ...draft } = structuredClone(plan);
  const sha = canonicalSha256(draft);
  return { ...draft, planId: `azure-ce-${sha.slice(0, 24)}`, planSha256: sha };
}
for (const persistent of [true, false]) {
  test(`full ${persistent ? 'persisted' : 'memory'} inventory deduplicates exact plans and seals later changes`, async () => {
    const f = await fixture(persistent);
    await f.save(base);
    await f.save(base);
    const inventory = await readAzureCePlanInventory(f.session);
    expect(inventory.plans).toEqual([{ kind: 'azure-ce-plan', plan: base, observation }]);
    expect(inventory.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    await inventory.recheck();
    inventory.plans[0].plan.siteName = 'changed-output';
    await inventory.recheck();
    await f.save(compileAzureCePlan({ ...intent, deploymentName: 'second', siteName: 'second' }, observation));
    await expect(inventory.recheck()).rejects.toThrow(/changed/);
  });
}
for (const fault of [
  'malformed',
  'invalid-plan',
  'conflicting-duplicate',
  'symlink',
  'missing-directory',
  'missing-pinned',
  'changed-pinned',
  'wrong-kind',
] as const) {
  test(`complete plan inventory rejects ${fault} rather than omitting evidence`, async () => {
    const f = await fixture();
    await f.save(base);
    const path = join(f.root, '2.azure-ce-plan.log');
    if (fault === 'malformed') await writeFile(path, '{');
    if (fault === 'wrong-kind') await writeFile(path, JSON.stringify({ kind: 'other', plan: base, observation }));
    if (fault === 'invalid-plan')
      await writeFile(
        path,
        JSON.stringify({ kind: 'azure-ce-plan', plan: { ...base, siteName: 'changed' }, observation }),
      );
    if (fault === 'conflicting-duplicate')
      await writeFile(
        path,
        JSON.stringify({
          kind: 'azure-ce-plan',
          plan: base,
          observation: { ...observation, resources: [{ synthetic: 'different' }] },
        }),
      );
    if (fault === 'symlink') await symlink(join(f.root, '1.azure-ce-plan.log'), path);
    if (fault === 'missing-directory') await rm(f.root, { recursive: true });
    if (fault === 'missing-pinned') await rm(join(f.root, '1.azure-ce-plan.log'));
    if (fault === 'changed-pinned')
      await writeFile(
        join(f.root, '1.azure-ce-plan.log'),
        JSON.stringify({ kind: 'azure-ce-plan', plan: base, observation }),
      );
    await expect(readAzureCePlanInventory(f.session)).rejects.toThrow();
  });
}
for (const fault of [
  'delete',
  'same-bytes-replacement',
  'directory-replacement',
  'callback-change',
  'session-change',
  'abort',
] as const) {
  test(`plan inventory retained witness rejects ${fault}`, async () => {
    const f = await fixture();
    await f.save(base);
    const controller = new AbortController();
    const inventory = await readAzureCePlanInventory(f.session, controller.signal);
    if (fault === 'delete') await rm(join(f.root, '1.azure-ce-plan.log'));
    if (fault === 'same-bytes-replacement') {
      const bytes = await Bun.file(join(f.root, '1.azure-ce-plan.log')).text();
      await writeFile(join(f.root, 'replacement'), bytes);
      await rename(join(f.root, 'replacement'), join(f.root, '1.azure-ce-plan.log'));
    }
    if (fault === 'directory-replacement') {
      const bytes = await Bun.file(join(f.root, '1.azure-ce-plan.log')).text();
      const displaced = `${f.root}-displaced`;
      roots.push(displaced);
      await rename(f.root, displaced);
      const { mkdir } = await import('node:fs/promises');
      await mkdir(f.root);
      await writeFile(join(f.root, '1.azure-ce-plan.log'), bytes);
    }
    if (fault === 'callback-change') f.session.saveArtifact = async () => undefined;
    if (fault === 'session-change') f.session.getSessionId = () => 'foreign';
    if (fault === 'abort') controller.abort(Error('synthetic inventory abort'));
    await expect(inventory.recheck()).rejects.toThrow();
  });
}
for (const ha of [false, true]) {
  test(`network retirement inventory includes all unstaged ${ha ? 'HA' : 'single'} branches and replacement ancestry`, async () => {
    const f = await fixture();
    const n = networkUpdateFixture(ha, 'terraform', true, false);
    const first = compileAzureTerraformNetworkUpdatePlan(n.plan, n.original);
    const next = compileAzureTerraformNetworkUpdatePlan(n.plan, first, n.original);
    const replacementBase = compileAzureCePlan(
      { ...first.intent, operation: 'replace-node', replacementNode: 1 },
      n.current,
    );
    const replacement = compileAzureTerraformNetworkReplacementPlan(replacementBase, first, n.original);
    for (const plan of [base, replacement, next, n.original, first]) await f.save(plan);
    const inventory = await readAzureTerraformNetworkRetirementRequests(n.original, f.session);
    expect(inventory.requests.map((row) => row.planSha256).sort()).toEqual(
      [first, next, replacement].map((plan) => plan.planSha256).sort(),
    );
    expect(inventory.requests.every((row) => row.execution === 'unclassified')).toBe(true);
    expect(inventory.executionHistoryQualified).toBe(false);
    expect(inventory.parentRetirementQualified).toBe(false);
    expect(inventory.requests.find((row) => row.planSha256 === replacement.planSha256)?.ancestry).toEqual([
      n.original.planSha256,
      first.planSha256,
    ]);
    await inventory.recheck();
    await f.save(compileAzureTerraformNetworkUpdatePlan(n.plan, next, n.original));
    await expect(inventory.recheck()).rejects.toThrow(/changed/);
  });
}
for (const fault of [
  'missing-original',
  'missing-predecessor',
  'foreign-owner',
  'foreign-original',
  'unresolved-network',
  'scope-change',
  'input-change',
] as const) {
  test(`network retirement request discovery rejects ${fault} before cleanup admission`, async () => {
    const f = await fixture();
    const n = networkUpdateFixture(false, 'terraform', true, false);
    const first = compileAzureTerraformNetworkUpdatePlan(n.plan, n.original);
    let selected = first;
    if (fault === 'missing-predecessor') selected = compileAzureTerraformNetworkUpdatePlan(n.plan, first, n.original);
    if (fault === 'unresolved-network') selected = n.plan;
    if (fault === 'foreign-owner') {
      selected = structuredClone(first);
      selected.deploymentName = 'foreign';
      selected = resign(selected);
    }
    if (fault === 'foreign-original') {
      selected = structuredClone(first);
      if (!selected.terraformNetworkProfile) throw Error('Synthetic network profile missing');
      selected.terraformNetworkProfile.originalPlanSha256 = 'a'.repeat(64);
      selected = resign(selected);
    }
    if (fault === 'scope-change') {
      selected = structuredClone(first);
      selected.vm.size = 'foreign';
      selected = resign(selected);
    }
    if (fault !== 'missing-original') await f.save(n.original);
    await f.save(selected);
    if (fault === 'input-change') {
      const inventory = await readAzureTerraformNetworkRetirementRequests(n.original, f.session);
      n.original.siteName = 'foreign';
      await expect(inventory.recheck()).rejects.toThrow();
    } else await expect(readAzureTerraformNetworkRetirementRequests(n.original, f.session)).rejects.toThrow();
  });
}
