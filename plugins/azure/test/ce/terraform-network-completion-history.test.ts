import { afterEach, expect, test } from 'bun:test';
import { readdir, rm } from 'node:fs/promises';
import { canonicalSha256 } from '../../src/ce/canonical';
import type { AzureTerraformNetworkAcceptanceIdentity } from '../../src/ce/terraform-network-checkpoint';
import { readAzureTerraformNetworkCompletionHistory } from '../../src/ce/terraform-network-completion-history';
import { terraformNetworkDriverFixture } from './terraform-network-driver-fixture';
import { nicExecutionRoots } from './terraform-network-nic-execution-fixture';

afterEach(async () => {
  for (const root of nicExecutionRoots.splice(0)) await rm(root, { recursive: true });
});
async function fixture(ha = false, move = true) {
  const f = await terraformNetworkDriverFixture(ha, move);
  const run = () =>
    readAzureTerraformNetworkCompletionHistory(f.plan, f.store, f.loaders, f.dependencies.qualifyAcceptance);
  const files = async () =>
    Object.fromEntries(
      await Promise.all(
        (await readdir(f.store.directory))
          .filter((n) => n.endsWith('.json'))
          .map(async (n) => [n, canonicalSha256(await f.store.read(n))]),
      ),
    );
  return { ...f, read: run, files };
}
for (const [ha, move] of [
  [false, true],
  [false, false],
  [true, true],
] as const)
  test(
    `private completed ${ha ? 'HA' : 'single'} history move ${move} validates actual serial packets without cloud/session/write execution`,
    async () => {
      const f = await fixture(ha, move);
      const result = await f.run();
      expect(result.status).toBe('complete');
      const files = await f.files(),
        calls = [...f.calls],
        observations = [...f.observations];
      f.state.unknown = true;
      f.state.wrongConfig = true;
      f.state.cloudUnavailable = true;
      const history = await f.read();
      expect(history).toMatchObject({
        kind: 'azure-terraform-network-completion-history',
        sourcePlanSha256: f.plan.planSha256,
        currentOperationalAcceptanceQualified: false,
      });
      expect('completionSha256' in result && result.completionSha256).toBe(history.completionSha256);
      expect(history.finalConfigurationSha256).toBe(canonicalSource(history.finalSource));
      expect(Object.keys(history.inventory.nodes)).toHaveLength(ha ? 3 : 1);
      expect(await f.files()).toEqual(files);
      expect(f.calls).toEqual(calls);
      expect(f.observations).toEqual(observations);
    },
    ha ? 60000 : 15000,
  );

import { createHash } from 'node:crypto';

const canonicalSource = (s: string) => createHash('sha256').update(s).digest('hex');
test('read-only history ignores missing or forged refreshed current-final packets', async () => {
  const f = await fixture();
  await f.run();
  const original = await f.read();
  const name = `${f.plan.planId}-terraform-network-driver-current-final.json`;
  await f.store.write(name, { forged: true });
  expect(await f.read()).toEqual(original);
  await f.store.remove(name);
  expect(await f.read()).toEqual(original);
});
for (const part of [
  'source',
  'root',
  'checkpoint',
  'complete',
  'preflight',
  'revision',
  'deallocate',
  'nic',
  'restart',
  'routing',
])
  test(`missing ${part} history cannot be reconstructed from current evidence`, async () => {
    const f = await fixture();
    await f.run();
    const prefix = `${f.plan.planId}-terraform-network`;
    const names: Record<string, string> = {
      source: `${prefix}-source.json`,
      root: `${prefix}-driver-root.json`,
      checkpoint: `${prefix}-driver-checkpoint.json`,
      complete: `${prefix}-driver-complete.json`,
      preflight: `${prefix}-node-1-preflight.json`,
      revision: `${prefix}-driver-revision-0.json`,
      deallocate: `${prefix}-node-1-deallocate-final-plan.json`,
      nic: `${prefix}-node-1-final-plan.json`,
      restart: `${prefix}-node-1-start-final-plan.json`,
      routing: `${prefix}-node-1-routing-final-plan.json`,
    };
    await f.store.remove(names[part]);
    const before = await f.files();
    await expect(f.read()).rejects.toThrow();
    expect(await f.files()).toEqual(before);
  });
for (const fault of [
  'source-hash',
  'source-owner',
  'source-qualification',
  'source-output',
  'root-hash',
  'revision-link',
  'checkpoint-state',
  'completion-owner',
  'completion-plan',
  'completion-checkpoint',
  'completion-output',
  'completion-mac',
  'completion-refresh',
  'completion-evidence',
  'completion-extra',
  'preflight-source',
  'preflight-node',
  'preflight-config',
  'preflight-inventory',
  'preflight-verification',
  'preflight-extra',
])
  test(`completed history rejects ${fault} tampering without mutation`, async () => {
    const f = await fixture();
    await f.run();
    const prefix = `${f.plan.planId}-terraform-network`;
    const target = fault.startsWith('source-')
      ? `${prefix}-source.json`
      : fault.startsWith('preflight-')
        ? `${prefix}-node-1-preflight.json`
        : fault === 'root-hash'
          ? `${prefix}-driver-root.json`
          : fault === 'revision-link'
            ? `${prefix}-driver-revision-1.json`
            : fault === 'checkpoint-state'
              ? `${prefix}-driver-checkpoint.json`
              : `${prefix}-driver-complete.json`;
    const row = (await f.store.read(target)) as Record<string, unknown>;
    if (fault === 'source-hash') row.sourceConfigurationSha256 = 'a'.repeat(64);
    if (fault === 'source-owner') row.owner = { foreign: true };
    if (fault === 'source-qualification') row.qualification = { foreign: true };
    if (fault === 'source-output') row.outputs = {};
    if (fault === 'root-hash') row.initialCheckpointSha256 = 'a'.repeat(64);
    if (fault === 'revision-link') row.previousCheckpointSha256 = 'a'.repeat(64);
    if (fault === 'checkpoint-state') (row.nodes as { phase: string }[])[0].phase = 'restarted';
    if (fault === 'completion-owner') row.sourceBindingSha256 = 'a'.repeat(64);
    if (fault === 'completion-plan') row.planSha256 = 'a'.repeat(64);
    if (fault === 'completion-checkpoint') row.checkpointSha256 = 'a'.repeat(64);
    if (fault === 'completion-output') row.outputs = {};
    if (fault === 'completion-mac')
      (row.inventory as AzureTerraformNetworkAcceptanceIdentity['inventory']).nodes['1'].nics['1'].mac =
        '02:00:00:00:00:99';
    if (fault === 'completion-refresh') (row.receipt as { noChanges: boolean }).noChanges = false;
    if (fault === 'completion-evidence') row.evidenceByNode = {};
    if (fault === 'completion-extra' || fault === 'preflight-extra') row.extra = true;
    if (fault === 'preflight-source') row.sourceBindingSha256 = 'a'.repeat(64);
    if (fault === 'preflight-node') (row.identity as AzureTerraformNetworkAcceptanceIdentity).node = 2;
    if (fault === 'preflight-config')
      (row.identity as AzureTerraformNetworkAcceptanceIdentity).configurationSha256 = 'a'.repeat(64);
    if (fault === 'preflight-inventory')
      (row.identity as AzureTerraformNetworkAcceptanceIdentity).inventory.nodes['1'].nics['1'].privateIp = '10.20.0.99';
    if (fault === 'preflight-verification')
      (row.verification as { evidenceSha256: string }).evidenceSha256 = 'a'.repeat(64);
    await f.store.write(target, row);
    const files = await f.files();
    await expect(f.read()).rejects.toThrow();
    expect(await f.files()).toEqual(files);
  });
test('pending restored and final acceptance never count as complete historical execution', async () => {
  for (const purpose of ['restored', 'final']) {
    const f = await fixture();
    f.state.rejectPurpose = purpose;
    expect((await f.run()).status).toBe('operational-acceptance-pending');
    const files = await f.files();
    await expect(f.read()).rejects.toThrow();
    expect(await f.files()).toEqual(files);
  }
});
test('historical provenance verifier must cover full node/interfaces/routing/traffic scope', async () => {
  const f = await fixture();
  await f.run();
  f.state.wrongScope = true;
  await expect(f.read()).rejects.toThrow(/operational/);
});
test('changed original source public outcome rejects completed history', async () => {
  const f = await fixture();
  await f.run();
  const load = f.loaders.loadOutcome;
  f.loaders.loadOutcome = async (p) => ({ ...(await load(p)), status: 'unknown' });
  await expect(f.read()).rejects.toThrow(/execution/);
});
test('historical record changed during acceptance qualification rejects before returning source', async () => {
  const f = await fixture();
  await f.run();
  const qualify = f.dependencies.qualifyAcceptance;
  let changed = false;
  f.dependencies.qualifyAcceptance = async (...args) => {
    const result = await qualify(...args);
    if (!changed) {
      changed = true;
      const name = `${f.plan.planId}-terraform-network-source.json`;
      const row = (await f.store.read(name)) as Record<string, unknown>;
      row.sourceConfigurationSha256 = 'a'.repeat(64);
      await f.store.write(name, row);
    }
    return result;
  };
  await expect(f.read()).rejects.toThrow(/changed|differs/);
});
test('historical inspection rejects wrong engine and owning store before reading artifacts', async () => {
  const f = await fixture();
  f.store.owner.engine = 'native';
  await expect(f.read()).rejects.toThrow(/owning completed/);
});
test('historical inspection bounds a provenance verifier that ignores caller cancellation', async () => {
  const f = await fixture();
  await f.run();
  const controller = new AbortController();
  const pending = readAzureTerraformNetworkCompletionHistory(
    f.plan,
    f.store,
    f.loaders,
    () => new Promise(() => {}),
    controller.signal,
  );
  const timer = setTimeout(() => controller.abort(Error('history cancelled')), 20);
  try {
    await expect(pending).rejects.toThrow('history cancelled');
  } finally {
    clearTimeout(timer);
  }
});
test('historical inspection rejects pre-cancelled input without reading or writing storage', async () => {
  const f = await fixture();
  const controller = new AbortController();
  controller.abort(Error('history cancelled'));
  await expect(
    readAzureTerraformNetworkCompletionHistory(
      f.plan,
      f.store,
      f.loaders,
      f.dependencies.qualifyAcceptance,
      controller.signal,
    ),
  ).rejects.toThrow('history cancelled');
  expect(await readdir(f.store.directory)).not.toContain(`${f.plan.planId}-terraform-network-driver-root.json`);
});

for (const target of ['source', 'outcome'])
  test(`changed loaded predecessor ${target} during historical acceptance rejects before returning source`, async () => {
    const f = await fixture();
    await f.run();
    const qualify = f.dependencies.qualifyAcceptance;
    let changed = false;
    f.dependencies.qualifyAcceptance = async (...args) => {
      const result = await qualify(...args);
      if (!changed) {
        changed = true;
        if (target === 'source') {
          const load = f.loaders.loadSource;
          f.loaders.loadSource = async (digest) => ({ ...(await load(digest)), extra: true });
        } else {
          const load = f.loaders.loadOutcome;
          f.loaders.loadOutcome = async (owner) => ({ ...(await load(owner)), extra: true });
        }
      }
      return result;
    };
    await expect(f.read()).rejects.toThrow(/changed during/);
  });
test('historical inspection bounds an original-source loader that ignores caller cancellation', async () => {
  const f = await fixture();
  await f.run();
  const controller = new AbortController();
  f.loaders.loadSource = () => new Promise(() => {});
  const pending = readAzureTerraformNetworkCompletionHistory(
    f.plan,
    f.store,
    f.loaders,
    f.dependencies.qualifyAcceptance,
    controller.signal,
  );
  const timer = setTimeout(() => controller.abort(Error('loader cancelled')), 20);
  try {
    await expect(pending).rejects.toThrow('loader cancelled');
  } finally {
    clearTimeout(timer);
  }
});
test('acknowledgement-only historical verifier cannot qualify saved acceptance', async () => {
  const f = await fixture();
  await f.run();
  f.dependencies.qualifyAcceptance = async () =>
    ({ status: 'verified' }) as Awaited<ReturnType<typeof f.dependencies.qualifyAcceptance>>;
  await expect(f.read()).rejects.toThrow();
});
