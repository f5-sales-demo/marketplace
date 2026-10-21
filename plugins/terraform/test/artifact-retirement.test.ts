import { afterEach, expect, test } from 'bun:test';
import { link, mkdir, mkdtemp, readdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
async function fixture(planOverrides: Record<string, unknown> = {}, stateOverrides: Record<string, unknown> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'tf-retirement-'));
  roots.push(root);
  const calls: Invocation[] = [];
  const runner = new TerraformRunner(root, async (request) => {
    calls.push(request);
    if (request.args[0] === 'plan') await writeFile(join(request.cwd, 'saved.tfplan'), 'private-plan', { mode: 0o600 });
    return {
      code: 0,
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
  });
  await runner.prepare(deployment);
  return { root, runner, calls, directory: join(root, deployment.deploymentId) };
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
      applyable: true,
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
