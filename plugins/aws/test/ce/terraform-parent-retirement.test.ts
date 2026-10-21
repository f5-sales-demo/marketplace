import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { link, mkdir, mkdtemp, readdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { canonicalSha256 } from '../../src/ce/canonical';
import { beginAwsTerraformRetirement } from '../../src/ce/terraform-lifecycle';
import { retireAwsTerraformParentArtifacts } from '../../src/ce/terraform-parent-retirement';
import { siteBindings } from '../../src/ce/topology';
import { foundationPlan } from './terraform-fixtures';

const roots: string[] = [];
afterEach(async () => {
  for (const r of roots.splice(0)) await rm(r, { recursive: true, force: true });
});
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
async function fixture() {
  const initial = foundationPlan();
  const { planId: _id, planSha256: _sha, ...draft } = initial;
  const material = {
    ...draft,
    deploymentName: initial.intent.deploymentName,
    accountId: initial.intent.accountId,
    region: initial.intent.region,
  };
  const sha = canonicalSha256(material);
  const base = { ...material, planSha256: sha, planId: `aws-ce-${sha.slice(0, 24)}` };
  const teardown = {
    kind: 'aws-ce-terraform-foundation-teardown',
    sourcePlanSha256: sha,
    planSha256: 'a'.repeat(64),
    planId: 'aws-ce-foundation-teardown-example',
  };
  const root = await mkdtemp(join(tmpdir(), 'parent-retirement-'));
  roots.push(root);
  const store = await CeDeploymentStore.open(root, siteBindings(base)[0].binding.owner);
  await beginAwsTerraformRetirement(base, teardown, store);
  await store.write(`${teardown.planId}.json`, teardown);
  await store.write(`${teardown.planId}-authorization.json`, {
    schemaVersion: 1,
    engine: 'terraform',
    sourcePlanSha256: sha,
    teardownPlanSha256: teardown.planSha256,
    mutations: true,
  });
  await store.write('terraform-admission.json', { bootstrapByNode: { 1: 'PRIVATE_SYNTHETIC_INPUT' } });
  await store.write('terraform-cloud-teardown-source.json', { configuration: 'PRIVATE_SYNTHETIC_CONFIGURATION' });
  await store.write('terraform-brownfield-placement.json', { schemaVersion: 1, syntheticPlacement: true });
  const makeRunner = async (directory: string) => {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const manifest = {
      schemaVersion: 1,
      deploymentId: base.deploymentName,
      engine: 'terraform',
      ...(directory.includes('/terraform-stages/') ? { stage: 'f5-resources' } : {}),
      backendIdentity: `local:${base.deploymentName}${directory.includes('/terraform-stages/') ? ':stage:f5-resources' : ''}`,
      scope: { cloud: 'aws', account: base.accountId, region: base.region },
    };
    const encoded = JSON.stringify(manifest);
    await writeFile(join(directory, 'deployment.json'), encoded, { mode: 0o600 });
    await writeFile(
      join(directory, 'artifact-retirement.json'),
      JSON.stringify({
        schemaVersion: 1,
        status: 'runner-artifacts-retired',
        manifestSha256: hash(encoded),
        evidenceSha256: 'b'.repeat(64),
        finalPlanSha256: 'c'.repeat(64),
        planReceiptSha256: 'd'.repeat(64),
        inventorySha256: hash('[]'),
        artifacts: [],
      }),
      { mode: 0o600 },
    );
  };
  await makeRunner(join(store.directory, base.deploymentName));
  return { base, teardown, store, root, makeRunner };
}
test('parent cleanup rejects a foreign stage or backend even with a matching manifest digest', async () => {
  for (const mode of ['stage', 'backend']) {
    const f = await fixture();
    const prefix = `terraform-stages/f5-resources/${f.base.deploymentName}`;
    await f.makeRunner(join(f.store.directory, prefix));
    const manifest = JSON.parse(await readFile(join(f.store.directory, prefix, 'deployment.json'), 'utf8'));
    const changed = {
      ...manifest,
      ...(mode === 'stage' ? { stage: 'foreign' } : { backendIdentity: 'local:foreign' }),
    };
    await writeFile(join(f.store.directory, prefix, 'deployment.json'), JSON.stringify(changed), { mode: 0o600 });
    const marker = JSON.parse(await readFile(join(f.store.directory, prefix, 'artifact-retirement.json'), 'utf8'));
    await writeFile(
      join(f.store.directory, prefix, 'artifact-retirement.json'),
      JSON.stringify({
        ...marker,
        manifestSha256: hash(JSON.stringify(changed)),
      }),
      { mode: 0o600 },
    );
    await expect(retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).rejects.toThrow();
    expect(await readdir(f.store.directory)).toContain('terraform-admission.json');
  }
});
test('parent retirement removes recorded sensitive journals and preserves exact terminal public bindings', async () => {
  const f = await fixture();
  for (const name of [
    'platform-drain-source.json',
    'platform-drain-progress.json',
    'platform-drain-receipt.json',
    'ingress-checkpoint-example.json',
    'ingress-origin-checkpoint-example.json',
  ])
    await f.store.write(name, { privateSyntheticLifecycle: true });
  await f.makeRunner(join(f.store.directory, 'terraform-stages/f5-resources', f.base.deploymentName));
  const result = await retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store);
  expect(result.status).toBe('deployment-artifacts-retired');
  const files = await readdir(f.store.directory);
  expect(files).not.toContain('terraform-admission.json');
  expect(files).not.toContain('terraform-cloud-teardown-source.json');
  expect(files).not.toContain('platform-drain-source.json');
  expect(files).not.toContain('ingress-origin-checkpoint-example.json');
  expect(files).toContain('terraform-brownfield-placement.json');
  expect(files).toContain(`${f.teardown.planId}.json`);
  expect(await retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).toEqual(result);
  await expect(retireAwsTerraformParentArtifacts(f.base, f.teardown, 'f'.repeat(64), f.store)).rejects.toThrow();
});
test('parent retirement refuses unresolved stages, runner artifacts, hardlinks, foreign bindings and unexpected files', async () => {
  for (const mode of ['stage', 'runner', 'hardlink', 'unknown', 'authorization', 'owner', 'digest']) {
    const f = await fixture();
    if (mode === 'stage')
      await mkdir(join(f.store.directory, 'terraform-stages/upgrade-software-example'), {
        recursive: true,
        mode: 0o700,
      });
    if (mode === 'runner')
      await writeFile(join(f.store.directory, f.base.deploymentName, 'main.tf.json'), 'PRIVATE', { mode: 0o600 });
    if (mode === 'hardlink') await link(join(f.store.directory, 'terraform-admission.json'), join(f.root, 'external'));
    if (mode === 'unknown') await writeFile(join(f.store.directory, 'unqualified.bin'), 'PRIVATE', { mode: 0o600 });
    if (mode === 'authorization') await f.store.write(`${f.teardown.planId}-authorization.json`, {});
    const base = mode === 'owner' ? { ...f.base, accountId: 'example-foreign-account' } : f.base;
    await expect(
      retireAwsTerraformParentArtifacts(base, f.teardown, mode === 'digest' ? 'unresolved' : 'b'.repeat(64), f.store),
    ).rejects.toThrow();
    expect(await readdir(f.store.directory)).toContain('terraform-admission.json');
    expect(await readdir(f.store.directory)).not.toContain('aws-terraform-parent-artifact-retirement.json');
  }
});
test('parent retirement rejects directory symlink substitution without deleting external data', async () => {
  const f = await fixture();
  const original = join(f.store.directory, f.base.deploymentName);
  const external = join(f.root, 'external-runner');
  await rename(original, external);
  await symlink(external, original);
  await expect(retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).rejects.toThrow();
  expect(await readdir(external)).toEqual(['artifact-retirement.json', 'deployment.json']);
  expect(await readdir(f.store.directory)).toContain('terraform-admission.json');
});
test('parent interrupted cleanup rejects changed preserved bindings and newly created journals', async () => {
  const f = await fixture();
  await retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store);
  const marker = (await f.store.read('aws-terraform-parent-artifact-retirement.json')) as Record<string, unknown>;
  await f.store.write('aws-terraform-parent-artifact-retirement.json', { ...marker, status: 'retiring' });
  await f.store.write('terraform-admission.json', { bootstrapByNode: { 1: 'SUBSTITUTED' } });
  await expect(retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).rejects.toThrow();
  await f.store.remove('terraform-admission.json');
  await f.store.write('terraform-new-journal.json', {});
  await expect(retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).rejects.toThrow();
  await f.store.remove('terraform-new-journal.json');
  await f.store.write('terraform-brownfield-placement.json', { changed: true });
  await expect(retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).rejects.toThrow();
});

test('parent retirement marker cannot authorize preservation of a recorded sensitive journal', async () => {
  const f = await fixture();
  await retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store);
  const marker = (await f.store.read('aws-terraform-parent-artifact-retirement.json')) as Record<string, unknown>;
  const artifacts = (marker.artifacts as Array<Record<string, unknown>>).map((row) =>
    row.path === 'terraform-admission.json' ? { ...row, preserve: true } : row,
  );
  await f.store.write('aws-terraform-parent-artifact-retirement.json', {
    ...marker,
    status: 'retiring',
    artifacts,
    inventorySha256: canonicalSha256(artifacts),
  });
  await f.store.write('terraform-admission.json', { bootstrapByNode: { 1: 'PRIVATE_SYNTHETIC_INPUT' } });
  await expect(retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).rejects.toThrow();
});

test('parent retirement removes exact site/node-bound bootstrap staging and retired site bindings', async () => {
  const f = await fixture();
  const binding = siteBindings(f.base)[0].binding;
  await f.store.write('ce-1-example-token.json', {
    tokenName: 'ce-1-example-token',
    siteName: binding.siteName,
    node: binding.nodes[0],
    jwt: 'PRIVATE_SYNTHETIC_JWT',
  });
  await f.store.write(`site-binding-${binding.siteName}.json`, {
    schemaVersion: 1,
    binding,
    siteUid: 'synthetic-retired-site',
    expectedInterfaces: [],
    tenantOrigin: 'https://synthetic.example',
    contractFingerprint: 'synthetic',
  });
  const result = await retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store);
  expect(result.status).toBe('deployment-artifacts-retired');
  expect(await readdir(f.store.directory)).not.toContain('ce-1-example-token.json');
  expect(await readdir(f.store.directory)).not.toContain(`site-binding-${binding.siteName}.json`);
});

test('parent retirement resumes after cancellation between recorded removals', async () => {
  const f = await fixture();
  const controller = new AbortController();
  const verify = f.store.verify.bind(f.store);
  let removals = 0;
  f.store.verify = async () => {
    await verify();
    const files = await readdir(f.store.directory);
    if (files.includes('aws-terraform-parent-artifact-retirement.json') && ++removals === 2) controller.abort();
  };
  await expect(
    retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store, controller.signal),
  ).rejects.toThrow();
  f.store.verify = verify;
  expect(
    ((await f.store.read('aws-terraform-parent-artifact-retirement.json')) as Record<string, unknown>).status,
  ).toBe('retiring');
  expect((await retireAwsTerraformParentArtifacts(f.base, f.teardown, 'b'.repeat(64), f.store)).status).toBe(
    'deployment-artifacts-retired',
  );
});
