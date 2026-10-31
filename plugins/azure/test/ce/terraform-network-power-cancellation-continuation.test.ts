import { expect } from 'bun:test';
import { chmod, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { canonicalSha256 } from '../../src/ce/canonical';
import {
  azureTerraformNetworkPowerSelections,
  validateAzureTerraformNetworkPowerProjection,
} from '../../src/ce/terraform-network-power';
import { test } from './owned-fixture-test';

import { terraformNetworkPowerCancellationFixture } from './terraform-network-power-cancellation-fixture';

const address = 'azapi_resource_action.ce_network';

async function fixture(operation: 'deallocate' | 'start' = 'deallocate', existing = true) {
  const f = await terraformNetworkPowerCancellationFixture(false, 1, operation, false, existing);
  await f.runCancellation();
  const packetName = await f.packetName();
  if (!packetName) throw Error('original cancellation packet missing');
  const packet = (await f.store.read(packetName)) as {
    evidenceSha256: string;
    originalJournalSha256: string;
    prior: Record<string, Record<string, unknown> | null>;
    provenance: { originalArchiveSha256s: string[] };
  };
  const runner = await f.resumeSelectedRunner(),
    release = await runner.plan({});
  const session = await f.cancellationTerraform.open(f.store.owner, f.selectedDeployment, 'current');
  const read = (receipt: PlanReceipt = release, signal?: AbortSignal) => {
    const method = session.readCancelledPlanContinuation;
    if (!method) throw Error('cancelled continuation provenance unavailable');
    return method.call(
      session,
      f.receipt,
      f.receipt.configurationSha256,
      release.configurationSha256,
      packet.evidenceSha256,
      receipt,
      signal,
    );
  };
  return { ...f, runner, session, release, packet, read };
}
for (const operation of ['deallocate', 'start'] as const)
  for (const state of ['planned', 'applying', 'applied'] as const)
    test(`actual original ${operation} no-op cancellation joins exact ${state} selected release without replay or outcome claims`, async () => {
      const f = await fixture(operation);
      expect(f.receipt.noChanges).toBe(true);
      expect(f.receipt.changes[0].actions).toEqual(['no-op']);
      const prior = await f.runner.readPlannedResourceFields(f.release, azureTerraformNetworkPowerSelections, {});
      const proposed = await f.runner.readProposedResourceFields(f.release, azureTerraformNetworkPowerSelections, {});
      expect(prior).toEqual(f.packet.prior);
      await validateAzureTerraformNetworkPowerProjection(
        f.plan,
        f.before,
        1,
        operation,
        f.release,
        'release',
        prior,
        proposed,
      );
      if (state === 'applying') {
        f.appliedState.loseApplyResponse = true;
        await expect(f.runner.apply(f.release, {})).rejects.toThrow('response lost');
      } else if (state === 'applied') await f.runner.apply(f.release, {});
      const beforeCommands = [...f.commands],
        beforeJournal = await readFile(join(f.directory, 'plan-receipt.json'));
      const result = await f.read();
      expect(result.scope).toBe('exact-cancelled-plan-current-continuation-provenance');
      expect(result.originalReceiptSha256).toBe(canonicalSha256(f.receipt));
      expect(result.originalArchiveSha256s).toEqual(f.packet.provenance.originalArchiveSha256s);
      expect(result.continuation.receiptSha256).toBe(canonicalSha256(f.release));
      expect(result.continuation.savedPlanSha256).toBe(f.release.planSha256);
      expect(result.continuation.state).toBe(state);
      expect(result.continuation.ordinaryRefreshEnabled).toBe(true);
      expect(result.continuation.executionSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(result.cancellationQualified).toBe(true);
      expect(result.planSemanticsQualified).toBe(false);
      expect(result.applicationOutcomeQualified).toBe(false);
      expect(result.retirementQualified).toBe(false);
      expect(f.commands).toEqual(beforeCommands);
      expect(await readFile(join(f.directory, 'plan-receipt.json'))).toEqual(beforeJournal);
      expect(f.vmPowerActions).toEqual([]);
      expect(JSON.stringify(result)).not.toContain('/synthetic/terraform');
      expect(JSON.stringify(result)).not.toContain('configuration-cancellation-');
      if (state !== 'planned')
        expect(await f.runner.readAppliedResourceFields(f.release, azureTerraformNetworkPowerSelections, {})).toEqual({
          [address]: null,
        });
    }, 60000);

test('actual cancelled create joins exact empty unsubmitted release without claiming applied outcome or retirement', async () => {
  const f = await fixture('deallocate', false),
    before = [...f.commands];
  expect(f.release.changes).toEqual([]);
  const value = await f.read();
  expect(value.continuation.state).toBe('planned');
  expect(value.applicationOutcomeQualified).toBe(false);
  expect(value.runnerRetirementQualified).toBe(false);
  expect(f.commands).toEqual(before);
}, 60000);

test('legacy unsubmitted cancellation observer still rejects a different exact changing release plan', async () => {
  const f = await fixture(),
    before = [...f.commands];
  if (!f.session.readUnsubmittedPlanCancellation) throw Error('legacy original cancellation reader missing');
  await expect(
    f.session.readUnsubmittedPlanCancellation(
      f.receipt,
      f.receipt.configurationSha256,
      f.release.configurationSha256,
      f.packet.evidenceSha256,
    ),
  ).rejects.toThrow('another submitted or changing plan');
  expect(f.commands).toEqual(before);
  expect(f.commands).not.toContain('apply');
}, 60000);

for (const defect of [
  'saved-bytes',
  'current-missing',
  'current-extra',
  'missing-execution',
  'disabled-refresh',
  'foreign-executor',
  'record-missing',
  'record-extra',
  'record-permissions',
  'archives-missing',
  'archive-bytes',
  'current-permissions',
  'current-symlink',
  'original-remnant',
  'foreign-receipt',
  'foreign-configuration',
])
  test(`exact cancelled release continuation rejects ${defect} without CLI or repair`, async () => {
    const f = await fixture(),
      journalPath = join(f.directory, 'plan-receipt.json'),
      savedPath = join(f.directory, 'saved.tfplan');
    const record = (await readdir(f.directory)).find((name) => name.startsWith('configuration-cancellation-'));
    if (!record) throw Error('actual cancellation record missing');
    if (defect === 'saved-bytes') await writeFile(savedPath, 'foreign', { mode: 0o600 });
    if (defect === 'current-missing') await rm(journalPath);
    if (['current-extra', 'missing-execution', 'disabled-refresh', 'foreign-executor'].includes(defect)) {
      const journal = JSON.parse(await readFile(journalPath, 'utf8'));
      if (defect === 'current-extra') journal.foreign = true;
      if (defect === 'missing-execution') delete journal.execution;
      if (defect === 'disabled-refresh')
        journal.execution.planArgs = journal.execution.planArgs.map((arg: string) =>
          arg === '-refresh=true' ? '-refresh=false' : arg,
        );
      if (defect === 'foreign-executor') journal.execution.terraform.sha256 = 'invalid';
      await writeFile(journalPath, JSON.stringify(journal), { mode: 0o600 });
    }
    if (defect === 'record-missing') await rm(join(f.directory, record));
    if (defect === 'record-extra') {
      const value = JSON.parse(await readFile(join(f.directory, record), 'utf8'));
      value.foreign = true;
      await writeFile(join(f.directory, record), JSON.stringify(value), { mode: 0o600 });
    }
    if (defect === 'record-permissions') await chmod(join(f.directory, record), 0o644);
    if (defect === 'archives-missing') {
      await rm(join(f.directory, 'plan-history'), { recursive: true });
      await rm(join(f.directory, 'revisions'), { recursive: true });
    }
    if (defect === 'archive-bytes') {
      const refs = await readdir(join(f.directory, 'plan-history'));
      await writeFile(join(f.directory, 'plan-history', refs[0], 'saved.tfplan'), 'foreign', { mode: 0o600 });
    }
    if (defect === 'current-permissions') await chmod(journalPath, 0o644);
    if (defect === 'current-symlink') {
      await rm(savedPath);
      await symlink(journalPath, savedPath);
    }
    if (defect === 'original-remnant') {
      await writeFile(savedPath, 'synthetic-original-unsubmitted-power-plan', { mode: 0o600 });
      await writeFile(journalPath, JSON.stringify({ state: 'planned', receipt: f.receipt }), { mode: 0o600 });
    }
    if (defect === 'foreign-configuration') await writeFile(join(f.directory, 'main.tf.json'), '{}', { mode: 0o600 });
    const before = [...f.commands];
    await expect(
      f.read(defect === 'foreign-receipt' ? { ...f.release, planSha256: 'a'.repeat(64) } : f.release),
    ).rejects.toThrow();
    expect(f.commands).toEqual(before);
    expect(f.commands).not.toContain('apply');
  }, 60000);

test('pre-aborted exact cancelled continuation rejects without observations or CLI', async () => {
  const f = await fixture(),
    before = [...f.commands],
    abort = new AbortController();
  abort.abort(Error('synthetic cancelled-continuation abort'));
  await expect(f.read(f.release, abort.signal)).rejects.toThrow('abort');
  expect(f.commands).toEqual(before);
}, 60000);

for (const missing of ['plan-receipt.json', 'saved.tfplan'])
  test(`original incomplete archive missing ${missing} cannot authorize exact release continuation`, async () => {
    const f = await fixture(),
      refs = await readdir(join(f.directory, 'revisions'));
    await rm(join(f.directory, 'revisions', refs[0], missing));
    const before = [...f.commands];
    await expect(f.read()).rejects.toThrow('archive');
    expect(f.commands).toEqual(before);
  }, 60000);

for (const changed of ['original', 'next', 'evidence'])
  test(`exact continuation rejects foreign ${changed} request binding before observations grant any claim`, async () => {
    const f = await fixture(),
      before = [...f.commands],
      method = f.session.readCancelledPlanContinuation;
    if (!method) throw Error('exact continuation service missing');
    await expect(
      method.call(
        f.session,
        changed === 'original' ? { ...f.receipt, planSha256: 'f'.repeat(64) } : f.receipt,
        f.receipt.configurationSha256,
        changed === 'next' ? 'f'.repeat(64) : f.release.configurationSha256,
        changed === 'evidence' ? 'f'.repeat(64) : f.packet.evidenceSha256,
        f.release,
      ),
    ).rejects.toThrow();
    expect(f.commands).toEqual(before);
  }, 60000);

test('owner-scoped actual service rejects changed storage owner before continuation observation', async () => {
  const f = await fixture(),
    before = [...f.commands];
  f.store.owner.account = 'example-foreign-subscription';
  await expect(f.read()).rejects.toThrow();
  expect(f.commands).toEqual(before);
}, 60000);

test('archived empty release cannot substitute for actual later current final receipt', async () => {
  const f = await fixture('deallocate', false),
    final = await f.runner.plan({}),
    before = [...f.commands];
  expect(final.noChanges).toBe(true);
  expect(final.planSha256).not.toBe(f.release.planSha256);
  await expect(f.read()).rejects.toThrow('exact current');
  const current = await f.read(final);
  expect(current.continuation.receiptSha256).toBe(canonicalSha256(final));
  expect(current.continuation.savedPlanSha256).toBe(final.planSha256);
  expect(current.originalArchiveSha256s).toEqual(f.packet.provenance.originalArchiveSha256s);
  expect(f.commands).toEqual(before);
}, 60000);
