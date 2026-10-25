import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireProcessLock } from '../../platform/src/ce/process-lock';
import { TerraformCommandError } from '../src/failure';
import { type Invocation, startTerraformGate, TerraformRunner, terraformExecutor } from '../src/runner';
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
  stateJson: Record<string, unknown> | string = {},
  onStateShow?: (cwd: string) => Promise<void>,
  onPlanShow?: (cwd: string) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), 'ce-tf-test-'));
  directories.push(root);
  const calls: Invocation[] = [];
  const runner = new TerraformRunner(root, async (request) => {
    calls.push(request);
    if (request.args[0] === 'apply') {
      onApply?.();
      await writeFile(
        join(request.cwd, 'terraform.tfstate'),
        JSON.stringify({ lineage: 'fixture-lineage', serial: 1 }),
        { mode: 0o600 },
      );
    }
    if (request.args[0] === 'show' && request.args[2] === 'terraform.tfstate') await onStateShow?.(request.cwd);
    if (request.args[0] === 'show' && request.args[2] === 'saved.tfplan') await onPlanShow?.(request.cwd);
    if (request.args[0] === 'plan') await writeFile(join(request.cwd, 'saved.tfplan'), 'binary-plan', { mode: 0o600 });
    return {
      code: 0,
      stdout:
        request.args[0] === 'version'
          ? JSON.stringify({ terraform_version: '1.14.0' })
          : request.args[0] === 'output'
            ? JSON.stringify(outputValues)
            : request.args[0] === 'show'
              ? request.args[2] === 'terraform.tfstate'
                ? typeof stateJson === 'string'
                  ? stateJson
                  : JSON.stringify({ format_version: '1.0', terraform_version: '1.14.0', ...stateJson })
                : JSON.stringify({
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

test('post-apply ownership capture requires the exact completed saved plan and rejects superseded or forged receipts', async () => {
  const { runner } = await fixture();
  const receipt = await runner.plan({});
  await expect(runner.assertApplied(receipt)).rejects.toThrow('applied');
  await runner.apply(receipt, {});
  await runner.assertApplied(receipt);
  await expect(runner.assertApplied({ ...receipt, planSha256: 'b'.repeat(64) })).rejects.toThrow('applied');
  await runner.plan({});
  await expect(runner.assertApplied(receipt)).rejects.toThrow('applied');
});

test('projects applied state identities from the original receipt without exporting sensitive siblings', async () => {
  const resource = {
    address: 'google_compute_instance.ce',
    mode: 'managed',
    type: 'google_compute_instance',
    values: {
      id: 'owned-vm',
      boot_disk: [{ source: 'owned-disk', key: 'PRIVATE_KEY' }],
      metadata: { token: 'PRIVATE_BOOTSTRAP' },
    },
    sensitive_values: { boot_disk: [{ key: true }], metadata: true },
  };
  const { runner, calls, root } = await fixture(
    { resource_changes: [{ address: resource.address, type: resource.type, change: { actions: ['create'] } }] },
    {},
    undefined,
    undefined,
    { values: { root_module: { resources: [resource] } } },
  );
  const receipt = await runner.plan({});
  await expect(runner.readAppliedResourceFields(receipt, { 'google_compute_instance.ce': ['id'] }, {})).rejects.toThrow(
    /applied/,
  );
  await runner.apply(receipt, {});
  const projection = await runner.readAppliedResourceFields(
    receipt,
    { 'google_compute_instance.ce': ['id', 'boot_disk.0.source', 'boot_disk.length'] },
    {},
  );
  expect(projection).toEqual({
    schemaVersion: 1,
    planSha256: receipt.planSha256,
    stateSha256: hash(JSON.stringify({ lineage: 'fixture-lineage', serial: 1 })),
    lineage: 'fixture-lineage',
    serial: 1,
    resources: {
      'google_compute_instance.ce': { id: 'owned-vm', 'boot_disk.0.source': 'owned-disk', 'boot_disk.length': 1 },
    },
  });
  expect(JSON.stringify(projection)).not.toMatch(/PRIVATE/);
  expect(calls.at(-1)?.args).toEqual(['show', '-json', 'terraform.tfstate']);
  for (const field of ['metadata', 'metadata.token', 'boot_disk', 'boot_disk.0.key', 'missing'])
    await expect(
      runner.readAppliedResourceFields(receipt, { 'google_compute_instance.ce': [field] }, {}),
    ).rejects.toThrow(/sensitive/);
  await expect(
    runner.readAppliedResourceFields(
      { ...receipt, planSha256: '0'.repeat(64) },
      { 'google_compute_instance.ce': ['id'] },
      {},
    ),
  ).rejects.toThrow(/applied/);
  await writeFile(
    join(root, 'ce-test', 'terraform.tfstate'),
    JSON.stringify({ lineage: 'fixture-lineage', serial: -1 }),
    { mode: 0o600 },
  );
  await expect(runner.readAppliedResourceFields(receipt, { 'google_compute_instance.ce': ['id'] }, {})).rejects.toThrow(
    /state identity/,
  );
}, 30_000);

test('applied state projection rejects changing state, duplicate addresses and resources outside the reviewed plan', async () => {
  const resource = {
    address: 'terraform_data.ce',
    type: 'terraform_data',
    mode: 'managed',
    values: { id: 'owned' },
    sensitive_values: {},
  };
  for (const resources of [[resource, resource], [{ ...resource, address: 'terraform_data.other' }]]) {
    const { runner } = await fixture({}, {}, undefined, undefined, { values: { root_module: { resources } } });
    const receipt = await runner.plan({});
    await runner.apply(receipt, {});
    await expect(runner.readAppliedResourceFields(receipt, { [resources[0].address]: ['id'] }, {})).rejects.toThrow(
      /ambiguous|reviewed/,
    );
  }
  const { runner } = await fixture(
    {},
    {},
    undefined,
    undefined,
    { values: { root_module: { resources: [resource] } } },
    async (cwd) => {
      await writeFile(join(cwd, 'terraform.tfstate'), JSON.stringify({ lineage: 'fixture-lineage', serial: 2 }), {
        mode: 0o600,
      });
    },
  );
  const receipt = await runner.plan({});
  await runner.apply(receipt, {});
  await expect(runner.readAppliedResourceFields(receipt, { 'terraform_data.ce': ['id'] }, {})).rejects.toThrow(
    /state changed/,
  );
}, 30_000);

test('applied projection preserves receipt authorization on resume and refuses superseded plans', async () => {
  const { runner, root } = await fixture({}, {}, undefined, undefined, { values: { root_module: { resources: [] } } });
  const receipt = await runner.plan({});
  await runner.apply(receipt, {});
  const resumed = new TerraformRunner(root, runner.execute);
  await resumed.resume('ce-test');
  expect((await resumed.readAppliedResourceFields(receipt, { 'terraform_data.ce': ['id'] }, {})).resources).toEqual({
    'terraform_data.ce': null,
  });
  await resumed.plan({});
  await expect(resumed.readAppliedResourceFields(receipt, { 'terraform_data.ce': ['id'] }, {})).rejects.toThrow(
    /applied/,
  );
}, 30_000);

test('state identity projection preserves exact 64-bit integer IDs without resubmission', async () => {
  const { runner, calls } = await fixture(
    {},
    {},
    undefined,
    undefined,
    '{"format_version":"1.0","terraform_version":"1.14.0","values":{"root_module":{"resources":[{"address":"terraform_data.ce","type":"terraform_data","mode":"managed","values":{"id":7165865203659947474,"count":2},"sensitive_values":{}}]}}}',
  );
  const receipt = await runner.plan({});
  await runner.apply(receipt, {});
  const observed = await runner.readApplyAttemptResourceFields(receipt, { 'terraform_data.ce': ['id', 'count'] }, {});
  expect(observed.resources['terraform_data.ce']).toEqual({ id: '7165865203659947474', count: 2 });
  expect(calls.filter((call) => call.args[0] === 'apply')).toHaveLength(1);
});

test('interrupted apply inspection binds the original attempt and observes state without resubmission', async () => {
  const resource = {
    address: 'terraform_data.ce',
    type: 'terraform_data',
    mode: 'managed',
    values: { id: 'owned', input: 'PRIVATE_PENDING_BOOTSTRAP' },
    sensitive_values: { input: true },
  };
  const { runner, root, calls } = await fixture({}, {}, undefined, undefined, {
    values: { root_module: { resources: [resource] } },
  });
  const receipt = await runner.plan({});
  expect((await runner.readApplyCheckpoint(receipt)).state).toBe('planned');
  await expect(runner.readApplyAttemptResourceFields(receipt, { 'terraform_data.ce': ['id'] }, {})).rejects.toThrow(
    /apply/,
  );
  await runner.apply(receipt, {});
  await writeFile(join(root, 'ce-test', 'plan-receipt.json'), JSON.stringify({ state: 'applying', receipt }), {
    mode: 0o600,
  });
  expect((await runner.readApplyCheckpoint(receipt)).state).toBe('applying');
  const observed = await runner.readApplyAttemptResourceFields(receipt, { 'terraform_data.ce': ['id'] }, {});
  expect(observed.applyState).toBe('applying');
  expect(JSON.stringify(observed)).not.toContain('PRIVATE_PENDING_BOOTSTRAP');
  await expect(runner.readApplyAttemptResourceFields(receipt, { 'terraform_data.ce': ['input'] }, {})).rejects.toThrow(
    /sensitive/,
  );
  expect(observed.resources['terraform_data.ce']).toEqual({ id: 'owned' });
  await expect(runner.readAppliedResourceFields(receipt, { 'terraform_data.ce': ['id'] }, {})).rejects.toThrow(
    /applied/,
  );
  await expect(runner.readApplyCheckpoint({ ...receipt, planSha256: '0'.repeat(64) })).rejects.toThrow(/receipt/);
  expect(calls.filter((call) => call.args[0] === 'apply')).toHaveLength(1);
  await runner.reconcileApplyFromEvidence(receipt, hash('independently-verified-outcome'));
  expect((await runner.readApplyCheckpoint(receipt)).state).toBe('applied');
}, 30_000);

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

test('projects nonsensitive nested disk identities without exposing sensitive sibling keys', async () => {
  const before = {
    boot_disk: [{ source: 'owned-disk', auto_delete: true, disk_encryption_key_raw: 'PRIVATE_KEY' }],
    network_interface: [{ network: 'owned-vpc', subnetwork: 'owned-subnet' }],
  };
  const change = {
    actions: ['delete'],
    before,
    after: null,
    before_sensitive: { boot_disk: [{ disk_encryption_key_raw: true }] },
  };
  const { runner } = await fixture({
    resource_changes: [{ address: 'google_compute_instance.ce', type: 'google_compute_instance', change }],
  });
  const receipt = await runner.plan({});
  const fields = [
    'boot_disk.length',
    'boot_disk.0.source',
    'boot_disk.0.auto_delete',
    'network_interface.length',
    'network_interface.0.network',
  ];
  const projected = await runner.readPlannedResourceFields(receipt, { 'google_compute_instance.ce': fields }, {});
  expect(projected).toEqual({
    'google_compute_instance.ce': {
      'boot_disk.length': 1,
      'boot_disk.0.source': 'owned-disk',
      'boot_disk.0.auto_delete': true,
      'network_interface.length': 1,
      'network_interface.0.network': 'owned-vpc',
    },
  });
  expect(JSON.stringify(projected)).not.toContain('PRIVATE_KEY');
  for (const field of [
    'boot_disk',
    'boot_disk.0',
    'boot_disk.0.disk_encryption_key_raw',
    'boot_disk.1.source',
    'boot_disk.0.source.length',
  ])
    await expect(
      runner.readPlannedResourceFields(receipt, { 'google_compute_instance.ce': [field] }, {}),
    ).rejects.toThrow(/unavailable or sensitive/);
  for (const field of [
    'boot_disk.*.source',
    'boot_disk.-1.source',
    'boot_disk.01.source',
    'boot_disk.constructor',
    '__proto__.source',
  ])
    await expect(
      runner.readPlannedResourceFields(receipt, { 'google_compute_instance.ce': [field] }, {}),
    ).rejects.toThrow(/fields/);
  change.before_sensitive.boot_disk = true as never;
  for (const field of ['boot_disk.length', 'boot_disk.0.source'])
    await expect(
      runner.readPlannedResourceFields(receipt, { 'google_compute_instance.ce': [field] }, {}),
    ).rejects.toThrow(/sensitive/);
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
  // Successful fixture startup must not race the assertion's deliberate deadline check.
  const executor = terraformExecutor({ timeoutMs: 5000, applyTimeoutMs: 5000, maxOutputBytes: 64, killAfterMs: 20 });
  await writeFile(executable, '#!/bin/sh\nprintf "%0100d" 0\n', { mode: 0o700 });
  await expect(executor({ cwd: root, args: [], env: { PATH: root } })).rejects.toThrow('size limit');
  await writeFile(executable, '#!/bin/sh\ntrap "" TERM\nwhile :; do :; done\n');
  const controller = new AbortController();
  const running = executor({ cwd: root, args: [], env: { PATH: root }, signal: controller.signal });
  setTimeout(() => controller.abort(), 50);
  await expect(running).rejects.toThrow('cancelled');
  const deadlineExecutor = terraformExecutor({
    timeoutMs: 50,
    applyTimeoutMs: 50,
    maxOutputBytes: 64,
    killAfterMs: 20,
  });
  await expect(deadlineExecutor({ cwd: root, args: [], env: { PATH: root } })).rejects.toThrow('deadline');
});

test('executor gives apply operations a dedicated cloud-convergence deadline', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ce-tf-apply-deadline-'));
  directories.push(root);
  const executable = join(root, 'terraform');
  await writeFile(executable, '#!/bin/sh\n/bin/sleep 0.1\nprintf success\n', { mode: 0o700 });
  const executor = terraformExecutor({
    timeoutMs: 20,
    applyTimeoutMs: 5_000,
    maxOutputBytes: 64,
    killAfterMs: 20,
  });
  await expect(executor({ cwd: root, args: ['plan'], env: { PATH: root } })).rejects.toThrow('deadline');
  expect(await executor({ cwd: root, args: ['apply'], env: { PATH: root } })).toEqual({
    code: 0,
    stdout: 'success',
  });
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

test('reconciles a lost apply response only from exact saved-plan and cloud-evidence digests', async () => {
  const evidence = hash('persisted-cloud-evidence');
  const configuration = '{"terraform":{"required_version":"= 1.14.0"}}';
  const next =
    '{"terraform":{"required_version":"= 1.14.0"},"resource":{"terraform_data":{"ce":{"input":"released"}}}}';
  const { root, runner } = await fixture({}, {}, configuration, () => {
    throw new Error('apply response lost');
  });
  const receipt = await runner.plan({});
  await expect(runner.apply(receipt, {})).rejects.toThrow('apply response lost');
  await expect(runner.reconcileApplyFromEvidence({ ...receipt, planSha256: hash('forged') }, evidence)).rejects.toThrow(
    /exact saved plan/,
  );
  await expect(runner.reconcileApplyFromEvidence(receipt, 'not-a-digest')).rejects.toThrow(/exact saved plan/);
  await runner.reconcileApplyFromEvidence(receipt, evidence);
  const journal = await readFile(join(root, 'ce-test', 'plan-receipt.json'), 'utf8');
  expect(journal).toContain(evidence);
  expect(journal).not.toContain('persisted-cloud-evidence');
  expect(await runner.reviseConfiguration(hash(configuration), next)).toBe(hash(next));
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

test('refuses recovery mutation while the original Terraform child remains alive', async () => {
  const { runner, root } = await fixture();
  const child = Bun.spawn(['/bin/sh', '-c', 'read gate'], { stdin: 'pipe', stdout: 'ignore', stderr: 'ignore' });
  const release = await acquireProcessLock(join(root, 'ce-test', '.terraform-executor-lock'), child.pid);
  try {
    await expect(runner.plan({})).rejects.toThrow('live process');
  } finally {
    child.kill('SIGKILL');
    await child.exited;
    await release();
  }
  expect((await runner.plan({})).engine).toBe('terraform');
}, 30_000);

test('rejects unselected foreign resources even alongside correctly reviewed resources', async () => {
  const owned = {
    address: 'terraform_data.ce',
    type: 'terraform_data',
    mode: 'managed',
    values: { id: 'owned' },
    sensitive_values: {},
  };
  const { runner } = await fixture({}, {}, undefined, undefined, {
    values: { root_module: { resources: [owned, { ...owned, address: 'terraform_data.foreign' }] } },
  });
  const receipt = await runner.plan({});
  await runner.apply(receipt, {});
  await expect(runner.readApplyAttemptResourceFields(receipt, { 'terraform_data.ce': ['id'] }, {})).rejects.toThrow(
    'Foreign state',
  );
  const state = await runner.readStateIdentity();
  expect(state.lineage).toBe('fixture-lineage');
  expect(state.sha256).toMatch(/^[a-f0-9]{64}$/);
}, 30_000);

test('gate deadline terminates its child and releases a late identity claim only after exit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ce-tf-gate-'));
  directories.push(root);
  const child = Bun.spawn(['/bin/sh', '-c', 'read gate'], { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' });
  let released = 0;
  await expect(
    startTerraformGate(
      child,
      async () => {
        await Bun.sleep(80);
        return async () => {
          expect(await child.exited).toBeNumber();
          released++;
        };
      },
      20,
      200,
    ),
  ).rejects.toThrow('startup deadline');
  await Bun.sleep(100);
  expect(released).toBe(1);
  expect(await child.exited).toBeNumber();
});

test('gate persistence failure after acquiring its identity releases exactly once after child exit', async () => {
  const child = Bun.spawn(['/bin/sh', '-c', 'read gate'], { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' });
  let released = 0;
  await expect(
    startTerraformGate(
      child,
      async () => async () => {
        expect(await child.exited).toBeNumber();
        released++;
      },
      200,
      200,
      async (phase) => {
        if (phase === 'identity-persisted') throw new Error('private capture interrupted');
      },
    ),
  ).rejects.toThrow('private capture interrupted');
  expect(released).toBe(1);
});

test('unresolved executor stop retains its acquired claim and blocks recovery', async () => {
  let released = false;
  const child = {
    stdin: { write: () => {}, flush: async () => {}, end: async () => {} },
    kill: () => {
      throw new Error('denied');
    },
    exited: new Promise<number>(() => {}),
  } as unknown as Bun.Subprocess<'pipe', 'pipe', 'pipe'>;
  await expect(
    startTerraformGate(
      child,
      async () => async () => {
        released = true;
      },
      20,
      20,
      async (phase) => {
        if (phase === 'identity-persisted') await new Promise(() => {});
      },
    ),
  ).rejects.toThrow('stop unresolved');
  expect(released).toBe(false);
});

test('stopped executor is killed before its process claim is released', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ce-tf-stopped-gate-'));
  directories.push(root);
  const child = Bun.spawn(['/bin/sh', '-c', 'read gate'], { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' });
  const path = join(root, '.terraform-executor-lock');
  await expect(
    startTerraformGate(
      child,
      async () => {
        const release = await acquireProcessLock(path, child.pid);
        child.kill('SIGSTOP');
        await Bun.sleep(100);
        return release;
      },
      80,
      200,
    ),
  ).rejects.toThrow('startup deadline');
  await Bun.sleep(150);
  expect(await child.exited).toBeNumber();
  expect(await lstat(path).catch(() => undefined)).toBeUndefined();
});

test('no-change state inspection keeps planned authorization and never submits', async () => {
  const resource = {
    address: 'terraform_data.ce',
    type: 'terraform_data',
    mode: 'managed',
    values: { id: 'owned', input: 'PRIVATE_NO_CHANGE' },
    sensitive_values: { input: true },
  };
  const { runner, root, calls } = await fixture(
    {
      applyable: false, // codespell:ignore applyable
      resource_changes: [{ address: resource.address, type: resource.type, change: { actions: ['no-op'] } }],
      output_changes: {},
    },
    {},
    undefined,
    undefined,
    { values: { root_module: { resources: [resource] } } },
  );
  const receipt = await runner.plan({});
  expect(receipt.noChanges).toBe(true);
  await writeFile(
    join(root, 'ce-test', 'terraform.tfstate'),
    JSON.stringify({ lineage: 'fixture-lineage', serial: 7 }),
    { mode: 0o600 },
  );
  const result = await runner.readNoChangeResourceFields(receipt, { 'terraform_data.ce': ['id'] }, {});
  expect(result.applyState).toBe('planned');
  expect(result.observation).toBe('no-change');
  expect(result.resources).toEqual({ 'terraform_data.ce': { id: 'owned' } });
  expect(result.serial).toBe(7);
  expect(JSON.stringify(result)).not.toContain('PRIVATE_NO_CHANGE');
  expect((await runner.readApplyCheckpoint(receipt)).state).toBe('planned');
  expect(calls.filter((call) => call.args[0] === 'apply')).toHaveLength(0);
  await expect(runner.readAppliedResourceFields(receipt, { 'terraform_data.ce': ['id'] }, {})).rejects.toThrow();
  await expect(runner.readApplyAttemptResourceFields(receipt, { 'terraform_data.ce': ['id'] }, {})).rejects.toThrow();
  await expect(runner.readNoChangeResourceFields(receipt, { 'terraform_data.ce': ['input'] }, {})).rejects.toThrow(
    /sensitive/,
  );
});

test('no-change state inspection refuses actionable or superseded receipts and moving state', async () => {
  const ordinary = await fixture();
  const actionable = await ordinary.runner.plan({});
  await expect(
    ordinary.runner.readNoChangeResourceFields(actionable, { 'terraform_data.ce': ['id'] }, {}),
  ).rejects.toThrow();
  const resource = {
    address: 'terraform_data.ce',
    type: 'terraform_data',
    mode: 'managed',
    values: { id: 'owned' },
    sensitive_values: {},
  };
  const f = await fixture(
    {
      applyable: false, // codespell:ignore applyable
      resource_changes: [{ address: resource.address, type: resource.type, change: { actions: ['no-op'] } }],
      output_changes: {},
    },
    {},
    undefined,
    undefined,
    { values: { root_module: { resources: [resource] } } },
    async (cwd) => {
      await writeFile(join(cwd, 'terraform.tfstate'), JSON.stringify({ lineage: 'fixture-lineage', serial: 8 }), {
        mode: 0o600,
      });
    },
  );
  const receipt = await f.runner.plan({});
  await writeFile(
    join(f.root, 'ce-test', 'terraform.tfstate'),
    JSON.stringify({ lineage: 'fixture-lineage', serial: 7 }),
    { mode: 0o600 },
  );
  await expect(
    f.runner.readNoChangeResourceFields(
      { ...receipt, planSha256: 'f'.repeat(64) },
      { 'terraform_data.ce': ['id'] },
      {},
    ),
  ).rejects.toThrow();
  await expect(f.runner.readNoChangeResourceFields(receipt, { 'terraform_data.ce': ['id'] }, {})).rejects.toThrow(
    /state changed/,
  );
  expect(f.calls.filter((call) => call.args[0] === 'apply')).toHaveLength(0);
});

test('actionable planned state inspection reads current owned identities without accepting planned replacements', async () => {
  const address = 'terraform_data.ce';
  const state = {
    values: {
      root_module: {
        resources: [
          {
            address,
            type: 'terraform_data',
            mode: 'managed',
            values: { id: 'original', input: 'PRIVATE_PLANNED_STATE' },
            sensitive_values: { input: true },
          },
        ],
      },
    },
  };
  const f = await fixture(
    {
      resource_changes: [
        {
          address,
          type: 'terraform_data',
          change: { actions: ['delete', 'create'], after: { id: 'replacement' }, after_sensitive: {} },
        },
      ],
      output_changes: {},
    },
    {},
    undefined,
    undefined,
    state,
  );
  const receipt = await f.runner.plan({});
  await writeFile(
    join(f.root, 'ce-test', 'terraform.tfstate'),
    JSON.stringify({ lineage: 'fixture-lineage', serial: 2 }),
    { mode: 0o600 },
  );
  const result = await f.runner.readPlannedStateResourceFields(receipt, { [address]: ['id'] }, {});
  expect(result.applyState).toBe('planned');
  expect(result.observation).toBe('planned-state');
  expect(result.resources).toEqual({ [address]: { id: 'original' } });
  expect(JSON.stringify(result)).not.toContain('PRIVATE_PLANNED_STATE');
  expect((await f.runner.readApplyCheckpoint(receipt)).state).toBe('planned');
  expect(f.calls.filter((c) => c.args[0] === 'apply')).toHaveLength(0);
  await expect(f.runner.readNoChangeResourceFields(receipt, { [address]: ['id'] }, {})).rejects.toThrow();
  await expect(f.runner.readApplyAttemptResourceFields(receipt, { [address]: ['id'] }, {})).rejects.toThrow();
  await expect(f.runner.readPlannedStateResourceFields(receipt, { [address]: ['input'] }, {})).rejects.toThrow(
    /sensitive/,
  );
});

test('current resource receipt inspection checks its saved plan and returns no private state', async () => {
  const f = await fixture();
  const receipt = await f.runner.plan({});
  const result = await f.runner.readCurrentResourcePlanReceipt({});
  expect(result.receipt).toEqual(receipt);
  expect(result.checkpoint).toEqual({ schemaVersion: 1, planSha256: receipt.planSha256, state: 'planned' });
  expect(JSON.stringify(result)).not.toContain('SENSITIVE_BOOTSTRAP');
  expect(f.calls.filter((c) => c.args[0] === 'apply')).toHaveLength(0);
  await writeFile(
    join(f.root, 'ce-test', 'plan-receipt.json'),
    JSON.stringify({ state: 'planned', receipt: { ...receipt, noChanges: true } }),
    { mode: 0o600 },
  );
  await expect(f.runner.readCurrentResourcePlanReceipt({})).rejects.toThrow();
});

test('current receipt recovery refuses partial planning, extra private metadata and mismatched binary bytes', async () => {
  for (const mutation of ['journal', 'private-field', 'binary', 'consumed'] as const) {
    const f = await fixture();
    const receipt = await f.runner.plan({});
    const directory = join(f.root, 'ce-test');
    if (mutation === 'journal') await writeFile(join(directory, 'plan-receipt.json'), '{', { mode: 0o600 });
    if (mutation === 'private-field')
      await writeFile(
        join(directory, 'plan-receipt.json'),
        JSON.stringify({ state: 'planned', receipt: { ...receipt, token: 'PRIVATE_RECEIPT_SENTINEL' } }),
        { mode: 0o600 },
      );
    if (mutation === 'binary') await writeFile(join(directory, 'saved.tfplan'), 'partial-plan', { mode: 0o600 });
    if (mutation === 'consumed')
      await writeFile(join(directory, 'plan-receipt.json'), JSON.stringify({ state: 'applying', receipt }), {
        mode: 0o600,
      });
    await expect(f.runner.readCurrentResourcePlanReceipt({})).rejects.toThrow();
    expect(f.calls.filter((c) => c.args[0] === 'apply')).toHaveLength(0);
  }
});

test('current resource receipt recovery refuses journal or binary movement during saved-plan inspection', async () => {
  for (const name of ['plan-receipt.json', 'saved.tfplan']) {
    let shows = 0;
    const f = await fixture({}, {}, undefined, undefined, {}, undefined, async (cwd) => {
      if (++shows === 2) {
        const path = join(cwd, name);
        await writeFile(path, (await readFile(path, 'utf8')) + ' ', { mode: 0o600 });
      }
    });
    await f.runner.plan({});
    await expect(f.runner.readCurrentResourcePlanReceipt({})).rejects.toThrow();
    expect(f.calls.filter((c) => c.args[0] === 'apply')).toHaveLength(0);
  }
});

test('destroy recovery reads the exact saved receipt and actual originals behind empty planned values', async () => {
  const address = 'terraform_data.ce';
  const state = {
    values: {
      root_module: {
        resources: [
          {
            address,
            mode: 'managed',
            type: 'terraform_data',
            values: { id: 'original', input: 'PRIVATE_DESTROY_STATE' },
            sensitive_values: { input: true },
          },
        ],
      },
    },
  };
  const f = await fixture(
    {
      resource_changes: [
        { address, type: 'terraform_data', change: { actions: ['delete'], before: { id: 'original' }, after: null } },
      ],
      planned_values: { root_module: { resources: [] } },
      output_changes: {},
    },
    {},
    undefined,
    undefined,
    state,
  );
  const receipt = await f.runner.planDestroy({});
  await writeFile(
    join(f.root, 'ce-test', 'terraform.tfstate'),
    JSON.stringify({ lineage: 'fixture-lineage', serial: 2 }),
    { mode: 0o600 },
  );
  const saved = await readFile(join(f.root, 'ce-test', 'saved.tfplan'));
  const recovered = await f.runner.readCurrentResourcePlanReceipt({});
  expect(recovered.receipt).toEqual(receipt);
  expect(recovered.receipt.operation).toBe('destroy');
  expect(recovered.checkpoint).toEqual({ schemaVersion: 1, planSha256: receipt.planSha256, state: 'planned' });
  const current = await f.runner.readPlannedStateResourceFields(receipt, { [address]: ['id'] }, {});
  expect(current.resources).toEqual({ [address]: { id: 'original' } });
  expect(current.observation).toBe('planned-state');
  expect(current.applyState).toBe('planned');
  expect(JSON.stringify({ recovered, current })).not.toContain('PRIVATE_DESTROY_STATE');
  await expect(
    f.runner.readPlannedStateResourceFields({ ...receipt, operation: undefined }, { [address]: ['id'] }, {}),
  ).rejects.toThrow();
  await expect(f.runner.readPlannedStateResourceFields(receipt, { [address]: ['input'] }, {})).rejects.toThrow(
    /sensitive/,
  );
  await expect(f.runner.readApplyAttemptResourceFields(receipt, { [address]: ['id'] }, {})).rejects.toThrow();
  expect(await readFile(join(f.root, 'ce-test', 'saved.tfplan'))).toEqual(saved);
  expect(f.calls.filter((c) => c.args[0] === 'apply')).toHaveLength(0);
  expect(f.calls.filter((c) => c.args[0] === 'plan')).toHaveLength(1);
});

test('destroy receipt recovery refuses private metadata, changed binaries, consumed plans and changed actions', async () => {
  for (const mutation of ['private-field', 'binary', 'consumed', 'actions'] as const) {
    const change = { actions: ['delete'], after: null };
    const f = await fixture({
      resource_changes: [{ address: 'terraform_data.ce', type: 'terraform_data', change }],
      output_changes: {},
    });
    const receipt = await f.runner.planDestroy({});
    const directory = join(f.root, 'ce-test');
    if (mutation === 'private-field')
      await writeFile(
        join(directory, 'plan-receipt.json'),
        JSON.stringify({ state: 'planned', receipt: { ...receipt, token: 'PRIVATE_DESTROY_RECEIPT' } }),
        { mode: 0o600 },
      );
    if (mutation === 'binary')
      await writeFile(join(directory, 'saved.tfplan'), 'changed-destroy-plan', { mode: 0o600 });
    if (mutation === 'consumed')
      await writeFile(join(directory, 'plan-receipt.json'), JSON.stringify({ state: 'applying', receipt }), {
        mode: 0o600,
      });
    if (mutation === 'actions') change.actions = ['create'];
    await expect(f.runner.readCurrentResourcePlanReceipt({})).rejects.toThrow();
    expect(f.calls.filter((c) => c.args[0] === 'apply')).toHaveLength(0);
    expect(f.calls.filter((c) => c.args[0] === 'plan')).toHaveLength(1);
  }
});
