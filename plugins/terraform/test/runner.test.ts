import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TerraformCommandError } from '../src/failure';
import { type Invocation, TerraformRunner, terraformExecutor } from '../src/runner';
import actionFixture from './fixtures/site-upgrade-action.json';

const directories: string[] = [];
afterEach(async () => {
  for (const dir of directories.splice(0)) await rm(dir, { recursive: true });
});
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
async function fixture(
  planOverrides: Record<string, unknown> = {},
  outputValues: Record<string, unknown> = {},
  configuration = '{"terraform":{"required_version":"= 1.14.0"}}',
  onApply?: () => void,
) {
  const root = await mkdtemp(join(tmpdir(), 'ce-tf-test-'));
  directories.push(root);
  const calls: Invocation[] = [];
  const runner = new TerraformRunner(root, async (request) => {
    calls.push(request);
    if (request.args[0] === 'apply') onApply?.();
    if (request.args[0] === 'plan') await writeFile(join(request.cwd, 'saved.tfplan'), 'binary-plan', { mode: 0o600 });
    return {
      code: 0,
      stdout:
        request.args[0] === 'version'
          ? JSON.stringify({ terraform_version: '1.14.0' })
          : request.args[0] === 'output'
            ? JSON.stringify(outputValues)
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
    scope: { cloud: 'aws', account: 'example-account', region: 'us-east-1' },
    terraformVersion: '1.14.0',
    configuration,
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

test('reads only the exact private configuration revision for lifecycle translation', async () => {
  const configuration = '{"terraform":{"required_version":"= 1.14.0"}}';
  const { runner, calls, root } = await fixture({}, {}, configuration);
  expect(await runner.readConfiguration(hash(configuration))).toBe(configuration);
  await expect(runner.readConfiguration('0'.repeat(64))).rejects.toThrow('stale');
  expect(calls).toHaveLength(0);
  await writeFile(join(root, 'ce-test', 'main.tf.json'), '{}', { mode: 0o600 });
  await expect(runner.readConfiguration(hash(configuration))).rejects.toThrow();
});

test('projects resource IDs privately from the exact saved plan and rejects sensitive IDs', async () => {
  const resource = {
    address: 'aws_instance.ce',
    type: 'aws_instance',
    change: {
      actions: ['delete'],
      before: { id: 'i-12345678', user_data: 'PRIVATE' },
      before_sensitive: { user_data: true },
      after: null,
    },
  };
  const { runner } = await fixture({ resource_changes: [resource], output_changes: {} });
  const receipt = await runner.plan({});
  expect(JSON.stringify(receipt)).not.toContain('i-12345678');
  expect(await runner.readPlannedResourceIds(receipt, ['aws_instance.ce'], {})).toEqual({
    'aws_instance.ce': 'i-12345678',
  });
  await expect(
    runner.readPlannedResourceIds({ ...receipt, planSha256: '0'.repeat(64) }, ['aws_instance.ce'], {}),
  ).rejects.toThrow('differs');
  const sensitive = await fixture({
    resource_changes: [{ ...resource, change: { ...resource.change, before_sensitive: { id: true } } }],
    output_changes: {},
  });
  const privateReceipt = await sensitive.runner.plan({});
  await expect(sensitive.runner.readPlannedResourceIds(privateReceipt, ['aws_instance.ce'], {})).rejects.toThrow(
    'sensitive',
  );
});

test('projects only requested nonsensitive teardown identity fields from an exact saved plan', async () => {
  const resource = {
    address: 'aws_route.ce',
    type: 'aws_route',
    mode: 'managed',
    change: {
      actions: ['delete'],
      before: {
        id: 'route-fixture',
        route_table_id: 'rtb-12345678',
        destination_cidr_block: '10.0.0.0/24',
        user_data: 'PRIVATE_BOOTSTRAP',
        tags: { owner: 'ce' },
      },
      before_sensitive: { user_data: true, tags: { owner: false } },
      after: null,
    },
  };
  const { runner } = await fixture({ resource_changes: [resource], output_changes: {} });
  const receipt = await runner.planDestroy({});
  expect(
    await runner.readPlannedResourceFields(receipt, { 'aws_route.ce': ['id', 'route_table_id', 'tags'] }, {}),
  ).toEqual({
    'aws_route.ce': { id: 'route-fixture', route_table_id: 'rtb-12345678', tags: { owner: 'ce' } },
  });
  expect(JSON.stringify(receipt)).not.toContain('rtb-12345678');
  for (const field of ['user_data', 'missing'])
    await expect(runner.readPlannedResourceFields(receipt, { 'aws_route.ce': [field] }, {})).rejects.toThrow(
      /unavailable or sensitive/,
    );
  await expect(
    runner.readPlannedResourceFields({ ...receipt, planSha256: '0'.repeat(64) }, { 'aws_route.ce': ['id'] }, {}),
  ).rejects.toThrow(/differs/);
  await expect(runner.readPlannedResourceFields(receipt, { 'aws_route.ce': ['id', 'id'] }, {})).rejects.toThrow(
    /fields/,
  );
});

test('rejects nested sensitivity in projected ownership and reports absent resources without fabricating fields', async () => {
  const resource = {
    address: 'aws_instance.ce',
    type: 'aws_instance',
    change: {
      actions: ['delete'],
      before: { id: 'i-12345678', tags: { owner: 'private' } },
      before_sensitive: { tags: { owner: true } },
      after: null,
    },
  };
  const { runner } = await fixture({ resource_changes: [resource], output_changes: {} });
  const receipt = await runner.planDestroy({});
  await expect(runner.readPlannedResourceFields(receipt, { 'aws_instance.ce': ['tags'] }, {})).rejects.toThrow(
    /sensitive/,
  );
  expect(await runner.readPlannedResourceFields(receipt, { 'aws_instance.absent': ['id'] }, {})).toEqual({
    'aws_instance.absent': null,
  });
});

test('authenticates an empty destroy plan before projecting a missing resource', async () => {
  const { runner } = await fixture({ resource_changes: undefined, output_changes: {} });
  const receipt = await runner.planDestroy({});
  expect(receipt.noChanges).toBe(true);
  expect(await runner.readPlannedResourceFields(receipt, { 'aws_vpc.ce': ['id'] }, {})).toEqual({ 'aws_vpc.ce': null });
  await expect(
    runner.readPlannedResourceFields({ ...receipt, planSha256: '0'.repeat(64) }, { 'aws_vpc.ce': ['id'] }, {}),
  ).rejects.toThrow(/differs/);
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

test('failed command diagnostics remain private, unique and absent from exported results', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ce-tf-private-diagnostics-'));
  directories.push(root);
  const executable = join(root, 'terraform');
  await writeFile(
    executable,
    '#!/bin/sh\nprintf "PRIVATE_BOOTSTRAP"\nprintf "VpcLimitExceeded PRIVATE_CREDENTIAL" >&2\nexit 1\n',
    { mode: 0o700 },
  );
  const executor = terraformExecutor(undefined, true);
  for (let attempt = 0; attempt < 2; attempt++)
    expect(await executor({ cwd: root, args: ['apply'], env: { PATH: root, PRIVATE_ENV: 'ENV_SECRET' } })).toEqual({
      code: 1,
      stdout: '',
      failureCategory: 'quota',
    });
  const directory = join(root, 'failure-diagnostics');
  expect((await lstat(directory)).mode & 0o777).toBe(0o700);
  const names = await readdir(directory);
  expect(names).toHaveLength(2);
  for (const name of names) {
    const path = join(directory, name);
    expect((await lstat(path)).mode & 0o777).toBe(0o600);
    const content = await readFile(path, 'utf8');
    expect(JSON.parse(content)).toMatchObject({
      operation: 'apply',
      category: 'quota',
      stdout: 'PRIVATE_BOOTSTRAP',
      stderr: 'VpcLimitExceeded PRIVATE_CREDENTIAL',
    });
    expect(content).not.toContain('ENV_SECRET');
  }
  await writeFile(executable, '#!/bin/sh\nprintf "success"\n');
  expect(await executor({ cwd: root, args: ['version'], env: { PATH: root } })).toEqual({ code: 0, stdout: 'success' });
  expect(await readdir(directory)).toEqual(names);
  await rm(directory, { recursive: true });
  const outside = await mkdtemp(join(tmpdir(), 'ce-tf-diagnostics-outside-'));
  directories.push(outside);
  await symlink(outside, directory);
  await writeFile(executable, '#!/bin/sh\nexit 1\n');
  await expect(executor({ cwd: root, args: ['apply'], env: { PATH: root } })).rejects.toThrow();
  expect(await readdir(outside)).toEqual([]);
});

test('failed executors expose only fixed categories and discard potentially sensitive output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ce-tf-errors-'));
  directories.push(root);
  const executable = join(root, 'terraform');
  const executor = terraformExecutor();
  for (const [diagnostic, category] of [
    ['API error InsufficientInstanceCapacity', 'capacity'],
    ['API error VpcLimitExceeded: The maximum number of VPCs has been reached.', 'quota'],
    ['Client.VpcLimitExceeded', 'quota'],
    ['VpcLimitExceeded and InsufficientInstanceCapacity', 'unknown'],
    ['API error AccessDenied', 'authorization'],
    ['ExpiredToken: credentials expired', 'expired'],
    ['RequestLimitExceeded', 'throttled'],
    ['Error: Missing block label', 'configuration'],
    ['\x1b[31mError:\x1b[0m Missing block label', 'configuration'],
    ['Error acquiring the state lock', 'state-lock'],
    ['AccessDenied and InsufficientInstanceCapacity', 'unknown'],
    ['unrecognized failure', 'unknown'],
  ] as const) {
    await writeFile(
      executable,
      `#!/bin/sh\nprintf 'PRIVATE_BOOTSTRAP'\nprintf '${diagnostic} PRIVATE_BOOTSTRAP' >&2\nexit 1\n`,
      { mode: 0o700 },
    );
    const result = await executor({ cwd: root, args: ['apply'], env: { PATH: root } });
    expect(result).toEqual({ code: 1, stdout: '', failureCategory: category });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_BOOTSTRAP');
    const error = new TerraformCommandError('apply', result.code, result.failureCategory);
    expect(error.category).toBe(category);
    expect(error.message).not.toContain('PRIVATE_BOOTSTRAP');
  }
  await writeFile(executable, '#!/bin/sh\nprintf "InsufficientInstanceCapacity" >&2\nprintf "ok"\n');
  expect(await executor({ cwd: root, args: ['apply'], env: { PATH: root } })).toEqual({ code: 0, stdout: 'ok' });
  await writeFile(
    executable,
    '#!/bin/sh\nprintf \'{"diagnostics":[{"severity":"error","summary":"Unsupported argument","detail":"PRIVATE_BOOTSTRAP"}]}\'\nexit 1\n',
  );
  expect(await executor({ cwd: root, args: ['validate', '-json'], env: { PATH: root } })).toEqual({
    code: 1,
    stdout: '',
    failureCategory: 'configuration',
  });
});

test('runner propagates sanitized failure category without retrying or applying', async () => {
  const { root } = await fixture();
  const operations: string[] = [];
  const runner = new TerraformRunner(root, async ({ args }) => {
    operations.push(args[0]);
    return args[0] === 'version'
      ? { code: 0, stdout: JSON.stringify({ terraform_version: '1.14.0' }) }
      : { code: 1, stdout: 'PRIVATE_BOOTSTRAP', failureCategory: 'capacity' };
  });
  await runner.resume('ce-test');
  let caught: unknown;
  try {
    await runner.plan({});
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(TerraformCommandError);
  expect((caught as TerraformCommandError).category).toBe('capacity');
  expect(String(caught)).not.toContain('PRIVATE_BOOTSTRAP');
  expect(operations).toEqual(['version', 'init']);
});

test('revises configuration while retaining state and invalidating obsolete saved plans', async () => {
  const { root, runner } = await fixture();
  const old = await runner.plan({});
  const directory = join(root, 'ce-test');
  await writeFile(join(directory, 'terraform.tfstate'), 'sensitive-state', { mode: 0o600 });
  const configuration =
    '{"terraform":{"required_version":"= 1.14.0"},"resource":{"terraform_data":{"ce":{"input":"stage-two"}}}}';
  expect(await runner.reviseConfiguration(old.configurationSha256, configuration)).toBe(hash(configuration));
  expect(await readFile(join(directory, 'terraform.tfstate'), 'utf8')).toBe('sensitive-state');
  await expect(runner.apply(old, {})).rejects.toThrow('receipt does not match');
  await expect(runner.reviseConfiguration(old.configurationSha256, '{}')).rejects.toThrow('stale');
  const current = await runner.plan({});
  expect(current.configurationSha256).toBe(hash(configuration));
  await runner.apply(current, {});
  const resumed = new TerraformRunner(root);
  await resumed.resume('ce-test');
  expect(await resumed.reviseConfiguration(hash(configuration), configuration)).toBe(hash(configuration));
});

test('configuration revision rejects backend changes and interrupted apply', async () => {
  const { root, runner } = await fixture();
  const receipt = await runner.plan({});
  for (const configuration of ['{"terraform":{"backend":{"s3":{}}}}', '{"terraform":{"cloud":{}}}', 'malformed'])
    await expect(runner.reviseConfiguration(receipt.configurationSha256, configuration)).rejects.toThrow();
  await writeFile(join(root, 'ce-test', 'plan-receipt.json'), JSON.stringify({ state: 'applying', receipt }), {
    mode: 0o600,
  });
  await expect(
    runner.reviseConfiguration(
      receipt.configurationSha256,
      '{"terraform":{"required_version":"= 1.14.0"},"output":{"stage":{"value":2}}}',
    ),
  ).rejects.toThrow('Reconcile interrupted');
});

test('resume completes a journaled revision across configuration and manifest replacement boundaries', async () => {
  for (const boundary of ['journal', 'configuration', 'manifest']) {
    const { root, runner } = await fixture();
    await runner.plan({});
    const directory = join(root, 'ce-test');
    const previous = JSON.parse(await readFile(join(directory, 'deployment.json'), 'utf8'));
    const configuration = '{"terraform":{"required_version":"= 1.14.0"},"output":{"stage":{"value":2}}}';
    const next = { ...previous, configurationSha256: hash(configuration) };
    const archiveId = '00000000-0000-0000-0000-000000000001';
    await writeFile(
      join(directory, 'configuration-transition.json'),
      JSON.stringify({ previous, next, configuration, archiveId }),
      { mode: 0o600 },
    );
    if (boundary !== 'journal') {
      const archive = join(directory, 'revisions', archiveId);
      await mkdir(archive, { recursive: true, mode: 0o700 });
      await writeFile(join(archive, 'main.tf.json'), await readFile(join(directory, 'main.tf.json')), { mode: 0o600 });
      await writeFile(join(directory, 'main.tf.json'), configuration, { mode: 0o600 });
    }
    if (boundary === 'manifest')
      await writeFile(join(directory, 'deployment.json'), JSON.stringify(next), { mode: 0o600 });
    const resumed = new TerraformRunner(root);
    await resumed.resume('ce-test');
    expect(await readFile(join(directory, 'main.tf.json'), 'utf8')).toBe(configuration);
    expect(JSON.parse(await readFile(join(directory, 'deployment.json'), 'utf8'))).toEqual(next);
    await expect(readFile(join(directory, 'configuration-transition.json'))).rejects.toThrow();
  }
});

test('pending or forged configuration transitions cannot authorize execution or engine migration', async () => {
  const { root, runner } = await fixture();
  const receipt = await runner.plan({});
  const directory = join(root, 'ce-test');
  const previous = JSON.parse(await readFile(join(directory, 'deployment.json'), 'utf8'));
  const configuration = '{}';
  await writeFile(
    join(directory, 'configuration-transition.json'),
    JSON.stringify({
      previous,
      next: { ...previous, engine: 'native', configurationSha256: hash(configuration) },
      configuration,
      archiveId: '00000000-0000-0000-0000-000000000001',
    }),
    { mode: 0o600 },
  );
  await expect(runner.apply(receipt, {})).rejects.toThrow('Resume the interrupted');
  await expect(runner.plan({})).rejects.toThrow('Resume the interrupted');
  await expect(new TerraformRunner(root).resume('ce-test')).rejects.toThrow('transition is malformed');
});

test('selects only explicitly requested non-sensitive outputs after current apply', async () => {
  const { runner } = await fixture(
    {},
    {
      ce_interfaces: { sensitive: false, type: ['object', {}], value: { eni: 'eni-12345678' } },
      bootstrap: { sensitive: true, type: 'string', value: 'secret-bootstrap' },
    },
  );
  const receipt = await runner.plan({});
  await expect(runner.readOutputs(['ce_interfaces'], {})).rejects.toThrow('applied or converged');
  await runner.apply(receipt, {});
  expect(await runner.readOutputs(['ce_interfaces'], {})).toEqual({ ce_interfaces: { eni: 'eni-12345678' } });
  await expect(runner.readOutputs(['bootstrap'], {})).rejects.toThrow('sensitive');
  await expect(runner.readOutputs(['missing'], {})).rejects.toThrow();
  await expect(runner.readOutputs(['ce_interfaces', 'ce_interfaces'], {})).rejects.toThrow('unique');
  await runner.reviseConfiguration(
    receipt.configurationSha256,
    '{"terraform":{"required_version":"= 1.14.0"},"output":{"stage":{"value":2}}}',
  );
  await expect(runner.readOutputs(['ce_interfaces'], {})).rejects.toThrow('current configuration');
});

test('revision cannot change provider scope, aliases, requirements or Terraform settings', async () => {
  const source = {
    terraform: {
      required_version: '= 1.14.0',
      required_providers: { aws: { source: 'hashicorp/aws', version: '= 6.63.0' } },
    },
    provider: { aws: { region: 'ca-west-1', profile: 'approved-profile', allowed_account_ids: ['123456789012'] } },
  };
  const configuration = JSON.stringify(source);
  const { runner } = await fixture({}, {}, configuration);
  for (const replacement of [
    { ...source, provider: { aws: { ...source.provider.aws, region: 'us-east-1' } } },
    { ...source, provider: { aws: { ...source.provider.aws, profile: 'foreign-profile' } } },
    { ...source, provider: { aws: { ...source.provider.aws, alias: 'foreign' } } },
    { ...source, provider: {} },
    { ...source, terraform: { required_version: '= 1.16.1' } },
    {
      ...source,
      terraform: { ...source.terraform, required_providers: { aws: { source: 'other/aws', version: '= 6.63.0' } } },
    },
  ])
    await expect(runner.reviseConfiguration(hash(configuration), JSON.stringify(replacement))).rejects.toThrow(
      'identity',
    );
  const admitted = JSON.stringify({ ...source, resource: { terraform_data: { ce: { input: 'stage-two' } } } });
  expect(await runner.reviseConfiguration(hash(configuration), admitted)).toBe(hash(admitted));
});

test('resume rejects journaled provider changes even after configuration was replaced', async () => {
  for (const replaced of [false, true]) {
    const { root } = await fixture();
    const directory = join(root, 'ce-test');
    const previous = JSON.parse(await readFile(join(directory, 'deployment.json'), 'utf8'));
    const configuration = '{"terraform":{"required_version":"= 1.14.0"},"provider":{"aws":{"region":"foreign"}}}';
    const archiveId = '00000000-0000-0000-0000-000000000002';
    await writeFile(
      join(directory, 'configuration-transition.json'),
      JSON.stringify({
        previous,
        next: { ...previous, configurationSha256: hash(configuration) },
        configuration,
        archiveId,
      }),
      { mode: 0o600 },
    );
    if (replaced) {
      const archive = join(directory, 'revisions', archiveId);
      await mkdir(archive, { recursive: true, mode: 0o700 });
      await writeFile(join(archive, 'main.tf.json'), await readFile(join(directory, 'main.tf.json')), { mode: 0o600 });
      await writeFile(join(directory, 'main.tf.json'), configuration, { mode: 0o600 });
    }
    await expect(new TerraformRunner(root).resume('ce-test')).rejects.toThrow('identity');
  }
});

test('failed refresh retains the prior sensitive plan and receipt in restricted immutable history', async () => {
  const { root, runner } = await fixture();
  const receipt = await runner.plan({});
  await runner.apply(receipt, {});
  const directory = join(root, 'ce-test');
  const previousJournal = await readFile(join(directory, 'plan-receipt.json'), 'utf8');
  const failing = new TerraformRunner(root, async ({ cwd, args }) => {
    if (args[0] === 'version') return { code: 0, stdout: JSON.stringify({ terraform_version: '1.14.0' }) };
    if (args[0] === 'plan') {
      await writeFile(join(cwd, 'saved.tfplan'), 'interrupted-new-plan', { mode: 0o600 });
      return { code: 1, stdout: '', failureCategory: 'capacity' };
    }
    return { code: 0, stdout: '' };
  });
  await failing.resume('ce-test');
  await expect(failing.plan({})).rejects.toThrow();
  const histories = await readdir(join(directory, 'plan-history'));
  expect(histories).toHaveLength(1);
  const archive = join(directory, 'plan-history', histories[0]);
  expect(await readFile(join(archive, 'saved.tfplan'), 'utf8')).toBe('binary-plan');
  expect(await readFile(join(archive, 'plan-receipt.json'), 'utf8')).toBe(previousJournal);
  expect((await lstat(archive)).mode & 0o077).toBe(0);
  expect((await lstat(join(archive, 'saved.tfplan'))).mode & 0o077).toBe(0);
  const inventory = JSON.parse(await readFile(join(archive, 'inventory.json'), 'utf8'));
  expect(inventory['saved.tfplan']).toBe(receipt.planSha256);
  expect(await readFile(join(directory, 'saved.tfplan'), 'utf8')).toBe('interrupted-new-plan');
  await expect(failing.plan({})).rejects.toThrow();
  expect(await readdir(join(directory, 'plan-history'))).toHaveLength(2);
  expect(await readFile(join(archive, 'saved.tfplan'), 'utf8')).toBe('binary-plan');
});

const actionConfig = { name: 'ce-one', namespace: 'system', version: 'crt-20260201-0179', force: false };
const actionIntent = {
  address: 'action.xcsh_site_upgrade_sw.ce',
  type: 'xcsh_site_upgrade_sw',
  providerName: 'registry.terraform.io/f5-sales-demo/xcsh',
  configValuesSha256: hash(
    JSON.stringify({ force: false, name: 'ce-one', namespace: 'system', version: 'crt-20260201-0179' }),
  ),
};
const actionRow = actionFixture.action;
test('serial action planning binds exactly one invocation and applies only its saved binary', async () => {
  const { runner, calls } = await fixture({
    resource_changes: [],
    output_changes: {},
    action_invocations: [actionRow],
  });
  const receipt = await runner.planAction(actionIntent, {});
  expect(receipt.noChanges).toBe(false);
  expect(receipt.actionInvocations).toEqual([actionIntent]);
  expect(JSON.stringify(receipt)).not.toContain('crt-20260201-0179');
  expect(calls.find((c) => c.args[0] === 'plan')?.args).toContain(`-invoke=${actionIntent.address}`);
  await runner.apply(receipt, {});
  expect(calls.at(-1)?.args).toEqual(['apply', '-input=false', '-lock=true', '-lock-timeout=60s', 'saved.tfplan']);
  await expect(runner.planAction(actionIntent, {})).rejects.toThrow('already recorded');
});
test('ordinary plans reject unrequested or deferred action invocations', async () => {
  for (const extra of [
    { action_invocations: [actionRow] },
    { deferred_action_invocations: [{}] },
    { action_invocations: null },
  ]) {
    const { runner } = await fixture({ resource_changes: [], output_changes: {}, ...extra });
    await expect(runner.plan({})).rejects.toThrow();
  }
});
test('action plans reject resource drift, duplicates, foreign providers, unknown inputs and wrong config', async () => {
  for (const extra of [
    { resource_changes: [{ address: 'terraform_data.ce', type: 'terraform_data', change: { actions: ['update'] } }] },
    { action_invocations: [] },
    { action_invocations: [actionRow, actionRow] },
    ...[
      { provider_name: 'registry.terraform.io/foreign/xcsh' },
      { config_unknown: { version: true } },
      { config_sensitive: { version: true } },
      { config_values: { ...actionConfig, force: true } },
      { lifecycle_action_trigger: {} },
      { invoke_action_trigger: { calling_resource_address: 'aws_instance.other' } },
    ].map((patch) => ({ action_invocations: [{ ...actionRow, ...patch }] })),
  ]) {
    const { runner, calls } = await fixture({
      resource_changes: [],
      output_changes: {},
      action_invocations: [actionRow],
      ...extra,
    });
    await expect(runner.planAction(actionIntent, {})).rejects.toThrow();
    expect(calls.some((c) => c.args[0] === 'apply')).toBe(false);
  }
});

test('rechecks action metadata at application and preserves ambiguous invocation for reconciliation', async () => {
  const overrides = { resource_changes: [], output_changes: {}, action_invocations: [] as unknown[] };
  const ordinary = await fixture(overrides);
  const receipt = await ordinary.runner.plan({});
  overrides.action_invocations = [actionRow];
  await expect(ordinary.runner.apply(receipt, {})).rejects.toThrow('unrequested');
  expect(ordinary.calls.some((call) => call.args[0] === 'apply')).toBe(false);
  let invokes = 0;
  const actionOverrides = { ...overrides };
  const action = await fixture(actionOverrides, {}, undefined, () => {
    invokes++;
    throw new Error('lost action response');
  });
  const actionReceipt = await action.runner.planAction(actionIntent, {});
  await expect(action.runner.apply(actionReceipt, {})).rejects.toThrow('lost action response');
  await expect(action.runner.apply(actionReceipt, {})).rejects.toThrow('reconciliation');
  await expect(action.runner.planAction(actionIntent, {})).rejects.toThrow('already recorded');
  // Exercise migration of a pre-ledger interrupted workspace before an ordinary refresh.
  const ledger = join(action.root, 'ce-test', 'action-attempt.json');
  await rm(ledger);
  actionOverrides.action_invocations = [];
  expect((await action.runner.plan({})).noChanges).toBe(true);
  expect(JSON.parse(await readFile(ledger, 'utf8')).legacyJournalState).toBe('applying');
  await expect(action.runner.planAction(actionIntent, {})).rejects.toThrow('already recorded');
  expect(invokes).toBe(1);
});

test('destroy plans use refresh and exact saved-plan application and reject non-delete mutations', async () => {
  const change = { address: 'terraform_data.ce', type: 'terraform_data', change: { actions: ['delete'] } };
  const { runner, calls } = await fixture({ resource_changes: [change], output_changes: {} });
  const receipt = await runner.planDestroy({});
  expect(receipt.operation).toBe('destroy');
  expect(calls.find((call) => call.args[0] === 'plan')?.args).toContain('-destroy');
  expect(calls.find((call) => call.args[0] === 'plan')?.args).toContain('-refresh=true');
  await runner.apply(receipt, {});
  expect(calls.at(-1)?.args.at(-1)).toBe('saved.tfplan');
  const invalid = await fixture({
    resource_changes: [{ ...change, change: { actions: ['delete', 'create'] } }],
    output_changes: {},
  });
  await expect(invalid.runner.planDestroy({})).rejects.toThrow();
});
