import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Deployment, type Invocation, TerraformRunner } from '../src/runner';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ce-prepare-runtime-'));
  roots.push(root);
  const deployment: Deployment = {
    schemaVersion: 1,
    deploymentId: 'ce-runtime-test',
    engine: 'terraform',
    scope: { cloud: 'aws', account: 'example-account', region: 'us-east-2' },
    terraformVersion: '1.17.2',
    configuration: '{"terraform":{"required_version":"= 1.17.2"}}',
    providerLock: '# fixture lock',
    backendIdentity: 'local:ce-runtime-test',
  };
  return { root, deployment };
}

test('rejects a different CLI version before publishing workspace inputs', async () => {
  const { root, deployment } = await fixture();
  const calls: Invocation[] = [];
  const runner = new TerraformRunner(root, async (request) => {
    calls.push(request);
    expect(await readdir(root)).toEqual([]);
    return { code: 0, stdout: JSON.stringify({ terraform_version: '1.17.1' }) };
  });
  await expect(runner.prepare(deployment, {})).rejects.toThrow('Terraform version');
  expect(calls.map((c) => c.args)).toEqual([['version', '-json']]);
  expect(await readdir(root)).toEqual([]);
});

test('checks the requested environment and binds the qualified executable before initialization', async () => {
  const { root, deployment } = await fixture();
  const executable = { path: '/tmp/terraform-qualified', sha256: '1'.repeat(64) };
  const calls: Invocation[] = [];
  const runner = new TerraformRunner(root, async (request) => {
    calls.push(request);
    if (calls.length === 1) {
      expect(request.args).toEqual(['version', '-json']);
      expect(request.env.PATH).toBe('/qualified-tools');
      expect(request.env.TF_CLI_ARGS_version).toBeUndefined();
      expect(await readdir(root)).toEqual([]);
      return { code: 0, stdout: JSON.stringify({ terraform_version: '1.17.2' }), executable };
    }
    return { code: 0, stdout: '', executable: { ...executable, sha256: '2'.repeat(64) } };
  });
  await runner.prepare(deployment, { PATH: '/qualified-tools', TF_CLI_ARGS_version: '-json=false' });
  expect((await readdir(join(root, deployment.deploymentId))).sort()).toEqual([
    '.terraform.lock.hcl',
    'deployment.json',
    'deployment.tfrc',
    'main.tf.json',
  ]);
  await expect(runner.plan({ PATH: '/qualified-tools' })).rejects.toThrow(/Terraform executable (changed|differs)/);
  expect(calls[1].expectedExecutable).toEqual(executable);
  expect(calls.some((c) => c.args[0] === 'plan' || c.args[0] === 'apply')).toBe(false);
});

test('a failed or malformed version probe leaves no recoverable workspace', async () => {
  for (const output of [
    { code: 1, stdout: '' },
    { code: 0, stdout: '{}' },
  ]) {
    const { root, deployment } = await fixture();
    const runner = new TerraformRunner(root, async () => output);
    await expect(runner.prepare(deployment, {})).rejects.toThrow();
    expect(await readdir(root)).toEqual([]);
  }
});

test('cancellation before preparation cannot publish an initialization intent', async () => {
  const { root, deployment } = await fixture();
  let called = false;
  const runner = new TerraformRunner(root, async () => {
    called = true;
    return { code: 0, stdout: JSON.stringify({ terraform_version: '1.17.2' }) };
  });
  const controller = new AbortController();
  controller.abort(Error('cancelled before runtime qualification'));
  await expect(runner.prepare(deployment, {}, controller.signal)).rejects.toThrow('cancelled');
  expect(called).toBe(false);
  expect(await readdir(root)).toEqual([]);
});
