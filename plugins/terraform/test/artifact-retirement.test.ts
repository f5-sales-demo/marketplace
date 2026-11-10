import { afterEach, expect, test } from 'bun:test';
import { link, mkdir, mkdtemp, readdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type CleanupRequest, encode, hash, type IndependentCleanupEvidence } from '../src/cleanup-verifier-worker';
import { type Deployment, type Invocation, TerraformRunner } from '../src/runner';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const deployment: Deployment = {
  schemaVersion: 1,
  deploymentId: 'retirement-test',
  engine: 'terraform',
  scope: { cloud: 'aws', account: 'example-account', region: 'us-east-1' },
  terraformVersion: '1.14.0',
  configuration: '{"terraform":{"required_version":"= 1.14.0"}}',
  providerLock: '# fixture lock',
  backendIdentity: 'local:retirement-test',
};
async function fixture(
  planOverrides: Record<string, unknown> = {},
  stateOverrides: Record<string, unknown> = {},
  verifierOverrides: Record<string, unknown> = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'tf-retirement-'));
  roots.push(root);
  const calls: Invocation[] = [];
  const verifications: CleanupRequest[] = [];
  let verifierFailure = false;
  const runner = new TerraformRunner(
    root,
    async (request) => {
      calls.push(request);
      if (request.args[0] === 'plan')
        await writeFile(join(request.cwd, 'saved.tfplan'), 'private-plan', { mode: 0o600 });
      return {
        code: 0,
        executable: { path: '/example/terraform', sha256: 'c'.repeat(64) },
        stdout: JSON.stringify(
          request.args[0] === 'version'
            ? { terraform_version: deployment.terraformVersion }
            : request.args[0] === 'show' && request.args.length === 2
              ? {
                  format_version: '1.0',
                  terraform_version: deployment.terraformVersion,
                  values: { root_module: { resources: [] } },
                  ...stateOverrides,
                }
              : {
                  format_version: '1.2',
                  terraform_version: deployment.terraformVersion,
                  errored: false,
                  complete: true,
                  applyable: false, // codespell:ignore applyable
                  resource_changes: [],
                  output_changes: {},
                  planned_values: { root_module: {} },
                  ...planOverrides,
                },
        ),
      };
    },
    async (request) => {
      verifications.push(request);
      if (verifierFailure) throw Error('Independent verifier unavailable');
      return {
        schemaVersion: 1,
        status: 'independently-verified',
        nonce: request.nonce,
        requestSha256: hash(encode(request)),
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        executorPid: process.pid + 1,
        parentPid: process.pid,
        manifestSha256: request.manifestSha256,
        evidenceSha256: request.evidenceSha256,
        finalPlanSha256: request.finalPlanSha256,
        planReceiptSha256: request.planReceiptSha256,
        inputInventorySha256: hash(encode(request.inputs)),
        terraformExecutableSha256: request.terraform.sha256,
        terraformExecutablePathSha256: hash(request.terraform.path),
        interpreterSha256: request.interpreter.sha256,
        workerSha256: request.workerSha256,
        terraformVersion: deployment.terraformVersion,
        stateJsonSha256: 'd'.repeat(64),
        originalPlanJsonSha256: 'e'.repeat(64),
        refreshedPlanSha256: 'f'.repeat(64),
        refreshedPlanJsonSha256: 'a'.repeat(64),
        commands: [
          ['version', '-json'],
          ['show', '-json', 'saved.tfplan'],
          ['show', '-json'],
          [
            'plan',
            '-input=false',
            '-lock=true',
            '-lock-timeout=60s',
            '-refresh=true',
            `-out=independent-cleanup-${request.nonce}.tfplan`,
          ],
          ['show', '-json', `independent-cleanup-${request.nonce}.tfplan`],
        ],
        ...verifierOverrides,
      } satisfies IndependentCleanupEvidence;
    },
  );
  await runner.prepare(deployment);
  return {
    root,
    runner,
    calls,
    verifications,
    failVerifier: () => {
      verifierFailure = true;
    },
    directory: join(root, deployment.deploymentId),
  };
}
test('terminal retirement removes private archives and permanently rejects execution', async () => {
  const { runner, root, directory, calls } = await fixture();
  await mkdir(join(directory, 'revisions', 'fixture'), { recursive: true, mode: 0o700 });
  await writeFile(join(directory, 'revisions', 'fixture', 'main.tf.json'), 'PRIVATE_ARCHIVE', { mode: 0o600 });
  const receipt = await runner.plan({});
  const result = await runner.retireArtifacts(receipt, 'a'.repeat(64), {});
  expect(result.status).toBe('runner-artifacts-retired');
  expect(result.finalPlanSha256).toBe(receipt.planSha256);
  expect((await readdir(directory)).sort()).toEqual(['artifact-retirement.json', 'deployment.json']);
  expect(JSON.stringify(result)).not.toContain('PRIVATE_ARCHIVE');
  expect(calls.some((call) => call.args[0] === 'apply')).toBe(false);
  const count = calls.length;
  await expect(runner.plan({})).rejects.toThrow('retired');
  await expect(runner.apply(receipt, {})).rejects.toThrow('retired');
  await expect(runner.readConfiguration(receipt.configurationSha256)).rejects.toThrow('retired');
  expect(await runner.retireArtifacts(receipt, 'a'.repeat(64), {})).toEqual(result);
  expect(calls).toHaveLength(count);
  const resumed = new TerraformRunner(root, async () => {
    throw Error('No executor permitted');
  });
  await resumed.resume(deployment.deploymentId, deployment, 'current');
  expect(await resumed.retireArtifacts(receipt, 'a'.repeat(64), {})).toEqual(result);
  await expect(resumed.plan({})).rejects.toThrow('retired');
  await expect(resumed.retireArtifacts(receipt, 'b'.repeat(64), {})).rejects.toThrow();
});
for (const [label, plan, state] of [
  [
    'mutating plan',
    {
      resource_changes: [{ address: 'terraform_data.ce', type: 'terraform_data', change: { actions: ['create'] } }],
      applyable: true, // codespell:ignore applyable
    },
    {},
  ], // codespell:ignore applyable
  ['planned resource', { planned_values: { root_module: { resources: [{}] } } }, {}],
  ['state resource', {}, { values: { root_module: { resources: [{}] } } }],
  ['state output', {}, { values: { root_module: {}, outputs: { private: {} } } }],
  ['malformed state', {}, { format_version: null }],
  ['partial state', {}, { values: { root_module: { resources: 'missing' } } }],
] as const)
  test(`terminal retirement rejects ${label} without deletion or marker`, async () => {
    const { runner, directory } = await fixture(plan, state);
    const receipt = await runner.plan({});
    await expect(runner.retireArtifacts(receipt, 'a'.repeat(64), {})).rejects.toThrow();
    expect(await readFile(join(directory, 'main.tf.json'), 'utf8')).toContain('required_version');
    expect(await readdir(directory)).not.toContain('artifact-retirement.json');
  });
test('terminal retirement requires exact plan and external evidence bindings', async () => {
  const { runner, directory } = await fixture();
  const receipt = await runner.plan({});
  await expect(runner.retireArtifacts(receipt, 'unresolved', {})).rejects.toThrow();
  await expect(
    runner.retireArtifacts({ ...receipt, backendIdentity: 'local:foreign' }, 'a'.repeat(64), {}),
  ).rejects.toThrow();
  await writeFile(join(directory, 'saved.tfplan'), 'substituted', { mode: 0o600 });
  await expect(runner.retireArtifacts(receipt, 'a'.repeat(64), {})).rejects.toThrow();
  expect(await readdir(directory)).not.toContain('artifact-retirement.json');
});
test('archive links are removed without following them outside the deployment', async () => {
  const { runner, root, directory } = await fixture();
  await writeFile(join(root, 'external-private'), 'EXTERNAL_PRIVATE', { mode: 0o600 });
  await symlink(join(root, 'external-private'), join(directory, 'archive-link'));
  const receipt = await runner.plan({});
  await runner.retireArtifacts(receipt, 'a'.repeat(64), {});
  expect(await readFile(join(root, 'external-private'), 'utf8')).toBe('EXTERNAL_PRIVATE');
});
test('interrupted digest-bound retirement resumes but rejects substituted or newly added artifacts', async () => {
  const { runner, root, directory } = await fixture();
  await writeFile(join(directory, 'private.txt'), 'PRIVATE_FIXTURE', { mode: 0o600 });
  const receipt = await runner.plan({});
  await runner.retireArtifacts(receipt, 'a'.repeat(64), {});
  const marker = JSON.parse(await readFile(join(directory, 'artifact-retirement.json'), 'utf8'));
  marker.status = 'retiring';
  await writeFile(join(directory, 'artifact-retirement.json'), JSON.stringify(marker), { mode: 0o600 });
  await writeFile(join(directory, 'private.txt'), 'SUBSTITUTED', { mode: 0o600 });
  const resumed = new TerraformRunner(root, async () => {
    throw Error('No executor permitted');
  });
  await resumed.resume(deployment.deploymentId, deployment, 'current');
  await expect(resumed.retireArtifacts(receipt, 'a'.repeat(64), {})).rejects.toThrow();
  await writeFile(join(directory, 'private.txt'), 'PRIVATE_FIXTURE', { mode: 0o600 });
  await writeFile(join(directory, 'unexpected.txt'), 'UNBOUND', { mode: 0o600 });
  await expect(resumed.retireArtifacts(receipt, 'a'.repeat(64), {})).rejects.toThrow();
  await rm(join(directory, 'unexpected.txt'));
  expect((await resumed.retireArtifacts(receipt, 'a'.repeat(64), {})).status).toBe('runner-artifacts-retired');
  expect((await readdir(directory)).sort()).toEqual(['artifact-retirement.json', 'deployment.json']);
});
test('terminal retirement rejects a substituted deployment directory before removal', async () => {
  const { runner, directory, root } = await fixture();
  const receipt = await runner.plan({});
  const external = join(root, 'external-deployment');
  await rename(directory, external);
  await symlink(external, directory);
  await expect(runner.retireArtifacts(receipt, 'a'.repeat(64), {})).rejects.toThrow('ownership');
  expect(await readdir(external)).not.toContain('artifact-retirement.json');
  expect(await readFile(join(external, 'main.tf.json'), 'utf8')).toBe(deployment.configuration);
});
test('terminal retirement rejects hard-linked artifacts and pre-aborted requests without marking retirement', async () => {
  const { runner, directory, root } = await fixture();
  const receipt = await runner.plan({});
  const controller = new AbortController();
  controller.abort();
  await expect(runner.retireArtifacts(receipt, 'a'.repeat(64), {}, controller.signal)).rejects.toThrow();
  await link(join(directory, 'main.tf.json'), join(root, 'shared-configuration'));
  await expect(runner.retireArtifacts(receipt, 'a'.repeat(64), {})).rejects.toThrow('ownership');
  expect(await readdir(directory)).not.toContain('artifact-retirement.json');
});

test('separate verifier failure retains all original inputs and no retirement marker', async () => {
  const { runner, directory, failVerifier, verifications } = await fixture();
  const receipt = await runner.plan({});
  failVerifier();
  await expect(runner.retireArtifacts(receipt, 'a'.repeat(64), {})).rejects.toThrow('Independent');
  expect(verifications).toHaveLength(1);
  expect(await readFile(join(directory, 'saved.tfplan'), 'utf8')).toBe('private-plan');
  expect(await readdir(directory)).not.toContain('artifact-retirement.json');
});
test('completed retirement retains independent sanitized execution before deleting original inputs', async () => {
  const { runner, directory, verifications } = await fixture();
  const receipt = await runner.plan({});
  await runner.retireArtifacts(receipt, 'a'.repeat(64), {});
  expect(verifications).toHaveLength(1);
  const marker = JSON.parse(await readFile(join(directory, 'artifact-retirement.json'), 'utf8'));
  expect(marker.independentCleanup.status).toBe('independently-verified');
  expect(marker.independentCleanupSha256).toBe(hash(encode(marker.independentCleanup)));
  expect(JSON.stringify(marker.independentCleanup)).not.toContain('/example/terraform');
});

for (const [name, override] of [
  ['foreign nonce', { nonce: 'f'.repeat(64) }],
  ['stale receipt', { completedAt: '2020-01-01T00:00:00Z' }],
  ['foreign plan', { finalPlanSha256: 'f'.repeat(64) }],
  ['same process', { executorPid: process.pid }],
  ['extra payload', { sensitivePayload: 'PRIVATE_SYNTHETIC_INPUT' }],
  ['missing hash', { stateJsonSha256: undefined }],
  ['missing refresh', { commands: [] }],
] as const)
  test(`independent ${name} rejects before deletion`, async () => {
    const { runner, directory } = await fixture({}, {}, override);
    const receipt = await runner.plan({});
    await expect(runner.retireArtifacts(receipt, 'a'.repeat(64), {})).rejects.toThrow('Independent');
    expect(await readdir(directory)).not.toContain('artifact-retirement.json');
    expect(await readFile(join(directory, 'saved.tfplan'), 'utf8')).toBe('private-plan');
  });
