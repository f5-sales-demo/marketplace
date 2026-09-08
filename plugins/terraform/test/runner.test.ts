import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Invocation, TerraformRunner, terraformExecutor } from '../src/runner';

const directories: string[] = [];
afterEach(async () => {
  for (const dir of directories.splice(0)) await rm(dir, { recursive: true });
});
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
async function fixture(planOverrides: Record<string, unknown> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'ce-tf-test-'));
  directories.push(root);
  const calls: Invocation[] = [];
  const runner = new TerraformRunner(root, async (request) => {
    calls.push(request);
    if (request.args[0] === 'plan') await writeFile(join(request.cwd, 'saved.tfplan'), 'binary-plan', { mode: 0o600 });
    return {
      code: 0,
      stdout:
        request.args[0] === 'version'
          ? JSON.stringify({ terraform_version: '1.14.0' })
          : request.args[0] === 'show'
            ? JSON.stringify({
                format_version: '1.2',
                terraform_version: '1.14.0',
                errored: false,
                complete: true,
                applyable: true, // codespell:ignore applyable
                resource_changes: [
                  {
                    address: 'terraform_data.ce',
                    mode: 'managed',
                    type: 'terraform_data',
                    change: { actions: ['create'], after: { input: 'SENSITIVE_BOOTSTRAP' } },
                  },
                ],
                output_changes: { token: { actions: ['create'], after: 'SENSITIVE_BOOTSTRAP' } },
                ...planOverrides,
              })
            : '',
    };
  });
  await runner.prepare({
    schemaVersion: 1,
    deploymentId: 'ce-test',
    engine: 'terraform',
    scope: { cloud: 'aws', account: 'demo-account', region: 'us-east-1' },
    terraformVersion: '1.14.0',
    configuration: '{"terraform":{"required_version":"= 1.14.0"}}',
    providerLock: '# fixture lock',
    backendIdentity: 'local:ce-test',
  });
  return { root, runner, calls };
}

test('isolates CLI settings and exports only a sanitized saved-plan receipt', async () => {
  const { runner, calls } = await fixture();
  const receipt = await runner.plan({
    TF_CLI_ARGS_plan: '-lock=false',
    TF_CLI_CONFIG_FILE: '/tmp/ambient',
    TF_VAR_bootstrap: 'ambient-secret',
    AWS_PROFILE: 'demo',
  });
  expect(JSON.stringify(receipt)).not.toContain('SENSITIVE_BOOTSTRAP');
  expect(receipt.planSha256).toBe(hash('binary-plan'));
  const plan = calls.find((c) => c.args[0] === 'plan');
  if (!plan?.env.TF_CLI_CONFIG_FILE) throw new Error('Plan invocation missing');
  expect(plan.args).toContain('-lock=true');
  expect(plan.args).toContain('-refresh=true');
  expect(plan.env.TF_CLI_ARGS_plan).toBeUndefined();
  expect(plan.env.TF_VAR_bootstrap).toBeUndefined();
  expect(plan.env.AWS_PROFILE).toBe('demo');
  expect(await readFile(plan.env.TF_CLI_CONFIG_FILE, 'utf8')).toContain('direct {}');
});

test('rejects malformed output changes even when resources change', async () => {
  for (const actions of [undefined, [], ['forget'], ['create', 'delete'], ['no-op,create']]) {
    const { runner } = await fixture({ output_changes: { token: { actions } } });
    await expect(runner.plan({})).rejects.toThrow('actions');
  }
});

test('rejects incomplete and non-applicable plans', async () => {
  const cannotApply = { applyable: false }; // codespell:ignore applyable
  for (const override of [{ complete: false }, cannotApply, { errored: true }]) {
    const { runner } = await fixture(override);
    await expect(runner.plan({})).rejects.toThrow();
  }
});

test('receipt field ordering does not change authorization', async () => {
  const { runner } = await fixture();
  const receipt = await runner.plan({});
  await runner.apply(Object.fromEntries(Object.entries(receipt).reverse()) as unknown as typeof receipt, {});
});

test('applies exactly the reviewed binary and refuses receipt tampering', async () => {
  const { runner, calls } = await fixture();
  const receipt = await runner.plan({});
  await expect(runner.apply({ ...receipt, planSha256: hash('other') }, {})).rejects.toThrow('receipt');
  await runner.apply(receipt, {});
  expect(calls.at(-1)?.args).toEqual(['apply', '-input=false', '-lock=true', '-lock-timeout=60s', 'saved.tfplan']);
  await expect(runner.apply(receipt, {})).rejects.toThrow('consumed');
});

test('rejects modified binary, configuration and provider lock before apply', async () => {
  for (const file of ['saved.tfplan', 'main.tf.json', '.terraform.lock.hcl']) {
    const { runner, root, calls } = await fixture();
    const receipt = await runner.plan({});
    await writeFile(join(root, 'ce-test', file), 'modified');
    await expect(runner.apply(receipt, {})).rejects.toThrow();
    expect(calls.some((c) => c.args[0] === 'apply')).toBe(false);
  }
});

test('refuses a native-owned deployment and path traversal', async () => {
  const { runner } = await fixture();
  for (const change of [{ engine: 'native' }, { deploymentId: '../escape' }]) {
    await expect(
      runner.prepare({
        schemaVersion: 1,
        deploymentId: 'other',
        engine: 'terraform',
        scope: { cloud: 'aws', account: 'demo', region: 'us-east-1' },
        terraformVersion: '1.14.0',
        configuration: '{}',
        providerLock: '# lock',
        backendIdentity: 'local:other',
        ...change,
      } as never),
    ).rejects.toThrow();
  }
});

test('executor bounds output and kills a process that ignores cancellation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ce-tf-executor-'));
  directories.push(root);
  const executable = join(root, 'terraform');
  const executor = terraformExecutor({ timeoutMs: 1000, maxOutputBytes: 64, killAfterMs: 20 });
  await writeFile(executable, '#!/bin/sh\nprintf "%0100d" 0\n', { mode: 0o700 });
  await expect(executor({ cwd: root, args: [], env: { PATH: root } })).rejects.toThrow('size limit');
  await writeFile(executable, '#!/bin/sh\ntrap "" TERM\nwhile :; do :; done\n');
  const controller = new AbortController();
  const running = executor({ cwd: root, args: [], env: { PATH: root }, signal: controller.signal });
  setTimeout(() => controller.abort(), 50);
  await expect(running).rejects.toThrow('cancelled');
  await expect(executor({ cwd: root, args: [], env: { PATH: root } })).rejects.toThrow('deadline');
});
