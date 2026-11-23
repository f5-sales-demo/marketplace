/** Source qualification only: actual shared file/lock inspection with synthetic cloud observations. */
import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { readOwnedInstalledInput } from '../../../terraform/src/installed-runtime';
import { TerraformRunner } from '../../../terraform/src/runner';
import { openGcpCaptureCleanupAdmission } from '../../src/ce/capture-cleanup-admission';
import { observerOwnershipFixture } from './observer-ownership-fixtures';

const roots: string[] = [];
function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('Independent source fixture value required');
  return value;
}
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

function values(fields: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(fields).sort(([a], [b]) => a.split('.').length - b.split('.').length)) {
    const keys = field.split('.');
    let cursor: Record<string, unknown> = result;
    for (let n = 0; n < keys.length - 1; n++) {
      const key = keys[n],
        next = keys[n + 1];
      if (!cursor[key]) cursor[key] = /^\d+$/.test(next) || next === 'length' ? [] : {};
      cursor = cursor[key] as Record<string, unknown>;
    }
    const last = required(keys.at(-1));
    if (last === 'length') {
      if (!Array.isArray(cursor)) throw new Error('Synthetic array field required');
      while (cursor.length < Number(value)) cursor.push({});
    } else cursor[last] = value;
  }
  return result;
}

async function fixture() {
  const f = observerOwnershipFixture();
  const root = await realpath(await mkdtemp(join(tmpdir(), 'gcp-cleanup-admission-')));
  roots.push(root);
  const runner = new TerraformRunner(root, async () => ({ code: 0, stdout: '' }));
  await runner.prepare({
    schemaVersion: 1,
    deploymentId: f.i.deploymentName,
    engine: 'terraform',
    scope: { cloud: 'gcp', account: f.i.project, region: f.i.region },
    terraformVersion: '1.17.2',
    configuration: '{}',
    providerLock: '# Synthetic source fixture',
    backendIdentity: `local:${f.i.deploymentName}`,
  });
  const directory = join(root, f.i.deploymentName);
  const manifest = JSON.parse(await readFile(join(directory, 'deployment.json'), 'utf8'));
  const state = {
    version: 4,
    terraform_version: '1.17.2',
    lineage: 'original-gcp-source',
    serial: 1,
    outputs: {},
    resources: f.addresses.map((address, n) => {
      const [type, name] = address.split('.');
      return {
        mode: 'managed',
        type,
        name,
        instances: [{ attributes: { ...values(required(f.fields[address])), id: `original-${n}` } }],
      };
    }),
  };
  const plan = Buffer.from('original-gcp-source-plan');
  const { createHash } = await import('node:crypto');
  const receipt = {
    ...f.receipt,
    configurationSha256: manifest.configurationSha256,
    providerLockSha256: manifest.providerLockSha256,
    planSha256: createHash('sha256').update(plan).digest('hex'),
  };
  await writeFile(join(directory, 'saved.tfplan'), plan, { mode: 0o600 });
  await writeFile(join(directory, 'plan-receipt.json'), JSON.stringify({ state: 'applying', receipt }), {
    mode: 0o600,
  });
  const lock = join(directory, '.terraform-executor-lock');
  await mkdir(lock, { mode: 0o700 });
  const claim = {
    schemaVersion: 2,
    token: '11111111-1111-1111-1111-111111111111',
    pid: 999999999,
    group: 999999999,
    bootId: (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim(),
    processStartTicks: '1',
  };
  for (const [name, mode, value] of [
    ['claim.json', 0o600, claim],
    ['lifetime.json', 0o400, claim],
    ['capture-unresolved.json', 0o400, { schemaVersion: 1 }],
  ] as const)
    await writeFile(join(lock, name), JSON.stringify(value), { mode });
  const inputs = Object.fromEntries(
    await Promise.all(
      [
        'deployment.json',
        'main.tf.json',
        '.terraform.lock.hcl',
        'deployment.tfrc',
        'terraform.tfstate',
        'plan-receipt.json',
        'saved.tfplan',
      ]
        .filter((name) => name !== 'terraform.tfstate')
        .map(async (name) => [name, (await readOwnedInstalledInput(join(directory, name))).binding]),
    ),
  );
  for (const name of ['claim.json', 'lifetime.json', 'capture-unresolved.json'])
    inputs[`lock:${name}`] = (await readOwnedInstalledInput(join(lock, name))).binding;
  const refreshState = async () => {
    await writeFile(join(directory, 'terraform.tfstate'), JSON.stringify(state), { mode: 0o600 });
    inputs['terraform.tfstate'] = (await readOwnedInstalledInput(join(directory, 'terraform.tfstate'))).binding;
  };
  await refreshState();
  const commands: string[][] = [],
    apiCalls: string[][] = [];
  let closureChecks = 0;
  const inspection = {
    directory,
    inputs,
    receipt,
    selections: {},
    environment: {},
    assertIndependentClosure: async () => {
      closureChecks++;
    },
    execute: async (request: { args: string[] }) => {
      commands.push(request.args);
      const rendered = {
        format_version: '1.0',
        terraform_version: '1.17.2',
        values: {
          root_module: {
            resources: state.resources.map((row) => ({
              address: `${row.type}.${row.name}`,
              mode: row.mode,
              type: row.type,
              values: row.instances[0].attributes,
              sensitive_values: {},
            })),
          },
        },
      };
      return {
        code: 0,
        stdout: JSON.stringify(request.args[0] === 'version' ? { terraform_version: '1.17.2' } : rendered),
      };
    },
  };
  const api = {
    exec: async (...args: Parameters<typeof f.runtime.api.exec>) => {
      apiCalls.push(args[1]);
      return f.runtime.api.exec(...args);
    },
  };
  const open = () =>
    openGcpCaptureCleanupAdmission({ intent: f.i, inspection, api, observePlatform: f.runtime.observePlatform });
  return {
    ...f,
    state,
    receipt,
    directory,
    lock,
    inspection,
    commands,
    apiCalls,
    refreshState,
    open,
    closureChecks: () => closureChecks,
  };
}

test('GCP cleanup admission joins all21 original state identities with independent cloud and XC observations', async () => {
  const f = await fixture(),
    failed = await readFile(join(f.lock, 'capture-unresolved.json'));
  const admission = await f.open();
  try {
    expect(admission.ownership.complete).toBe(true);
    expect(admission.recovery?.resources).toHaveLength(21);
    expect(admission.ownership.resources).toHaveLength(17);
    expect(admission.executionAuthorized).toBe(false);
    expect(f.commands.map((args) => args[0])).toEqual(['version', 'show']);
    expect(f.closureChecks()).toBeGreaterThan(1);
    expect(await admission.assertLiveOwnership()).toEqual([]);
    expect(await readFile(join(f.lock, 'capture-unresolved.json'))).toEqual(failed);
    expect(Object.isFrozen(admission.ownership)).toBe(true);
  } finally {
    admission.close();
  }
});

for (const subset of ['observer-disk', 'empty'] as const)
  test(`GCP cleanup admission inspects an original ${subset} subset without requiring guest health`, async () => {
    const f = await fixture();
    const address = `google_compute_disk.${f.observer.replaceAll('-', '_')}`;
    const keep = subset === 'observer-disk' ? [address] : [];
    f.state.resources = f.state.resources.filter((row) => keep.includes(`${row.type}.${row.name}`));
    for (const key of f.addresses) if (!keep.includes(key)) f.fields[key] = null;
    for (const [link] of f.live)
      if (!(subset === 'observer-disk' && link.endsWith(`/disks/${f.observer}`))) f.live.delete(link);
    await f.refreshState();
    const admission = await f.open();
    try {
      expect(admission.ownership.complete).toBe(false);
      expect(admission.ownership.addresses).toHaveLength(keep.length);
      expect(admission.recovery?.resources.length ?? 0).toBe(keep.length);
      expect(admission.emptyOriginalState).toBe(subset === 'empty');
      expect(admission.executionAuthorized).toBe(false);
      expect(await admission.assertLiveOwnership()).toHaveLength(21 - keep.length);
      if (subset === 'empty') {
        const recovery = required(admission.recovery);
        expect(recovery.emptyOriginal?.kind).toBe('original-empty-create-state-verification');
        const runner = new TerraformRunner(dirname(f.directory), f.inspection.execute, recovery);
        const count = f.commands.length;
        await runner.resume(f.i.deploymentName);
        await expect(runner.apply(f.receipt, {})).rejects.toThrow();
        expect(f.commands).toHaveLength(count);
      }
    } finally {
      admission.close();
    }
  });

for (const mode of ['foreign-live', 'replacement', 'reader-live', 'wrong-engine', 'changed-xc'] as const)
  test(`GCP cleanup admission refuses an ambiguous scope before any cleanup authorization: ${mode}`, async () => {
    const f = await fixture();
    if (mode === 'foreign-live') {
      const first = f.addresses[0];
      f.state.resources = f.state.resources.filter((row) => `${row.type}.${row.name}` !== first);
      f.fields[first] = null;
      await f.refreshState();
    }
    if (mode === 'replacement') required(f.live.get(f.scope[0].selfLink)).id = '999999';
    if (mode === 'reader-live')
      f.inspection.assertIndependentClosure = async () => {
        throw new Error('Original reader remains live');
      };
    if (mode === 'wrong-engine') f.i.engine = 'native';
    if (mode === 'changed-xc') {
      const original = f.runtime.observePlatform;
      f.runtime.observePlatform = async (...args) => ({
        ...(await original(...args)),
        tokenIdentitySha256: `sha256:${'f'.repeat(64)}`,
      });
    }
    await expect(f.open()).rejects.toThrow();
    expect(await readFile(join(f.lock, 'capture-unresolved.json'))).toBeDefined();
    if (mode === 'reader-live' || mode === 'wrong-engine') expect(f.apiCalls).toHaveLength(0);
  });

test('GCP cleanup admission rechecks ownership and retirement before a reviewed destroy can proceed', async () => {
  const f = await fixture(),
    admission = await f.open();
  const live = required(f.live.get(f.scope[0].selfLink)),
    originalId = live.id;
  live.id = '999999';
  await expect(admission.assertLiveOwnership()).rejects.toThrow();
  live.id = originalId;
  await expect(admission.assertLiveOwnership()).rejects.toThrow();
  await expect(required(admission.recovery).assertIndependentClosure()).rejects.toThrow();
  admission.close();
  await expect(required(admission.recovery).assertIndependentClosure()).rejects.toThrow('retired');
  await expect(admission.assertLiveOwnership()).rejects.toThrow('retired');
  expect(await readFile(join(f.lock, 'capture-unresolved.json'))).toBeDefined();
});
