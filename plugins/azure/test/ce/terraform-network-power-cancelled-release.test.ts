import { expect } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  azureTerraformNetworkPowerSelections,
  validateAzureTerraformNetworkPowerPlan,
  validateAzureTerraformNetworkPowerProjection,
} from '../../src/ce/terraform-network-power';
import { test } from './owned-fixture-test';

import { terraformNetworkPowerCancellationFixture as fixture } from './terraform-network-power-cancellation-fixture';

const address = 'azapi_resource_action.ce_network';

for (const ha of [false, true])
  for (const operation of ['deallocate', 'start'] as const)
    test(`actual cancelled ${ha ? 'HA' : 'single'} ${operation} current runner creates distinct ordinary empty release/final receipts without power replay`, async () => {
      const node = ha ? 3 : 1,
        f = await fixture(ha, node, operation);
      const cancellation = await f.runCancellation();
      const runner = await f.resumeSelectedRunner();
      const release = await runner.plan({});
      await validateAzureTerraformNetworkPowerPlan(f.plan, f.before, node, operation, release, 'release');
      expect(release.noChanges).toBe(true);
      expect(release.changes).toEqual([]);
      const prior = await runner.readPlannedResourceFields(release, azureTerraformNetworkPowerSelections, {});
      const proposed = await runner.readProposedResourceFields(release, azureTerraformNetworkPowerSelections, {});
      await validateAzureTerraformNetworkPowerProjection(
        f.plan,
        f.before,
        node,
        operation,
        release,
        'release',
        prior,
        proposed,
      );
      const releaseJournal = await runner.readCurrentPlanJournal(release.configurationSha256);
      expect(releaseJournal.state).toBe('planned');
      expect(releaseJournal.ordinaryRefreshEnabled).toBe(true);
      expect(releaseJournal.executionSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(await runner.readAppliedResourceFields(release, azureTerraformNetworkPowerSelections, {})).toEqual({
        [address]: null,
      });
      const final = await runner.plan({});
      await validateAzureTerraformNetworkPowerPlan(f.plan, f.before, node, operation, final, 'final');
      expect(final.planSha256).not.toBe(release.planSha256);
      expect(final.configurationSha256).toBe(release.configurationSha256);
      const finalJournal = await runner.readCurrentPlanJournal(final.configurationSha256);
      expect(finalJournal.receipt).toEqual(final);
      expect(finalJournal.ordinaryRefreshEnabled).toBe(true);
      const originalHistory = await runner.readPlanApplicationHistory(f.receipt);
      const packetName = await f.packetName();
      if (!packetName) throw Error('original cancellation packet missing');
      const packet = (await f.store.read(packetName)) as {
        originalJournalSha256: string;
        provenance: { originalArchiveSha256s: string[] };
      };
      expect(originalHistory.incompleteArchives).toBe(0);
      expect(originalHistory.matches).toHaveLength(2);
      expect(originalHistory.matches.map((entry) => entry.location).sort()).toEqual(['plan-history', 'revision']);
      expect(originalHistory.matches.map((entry) => entry.archiveSha256).sort()).toEqual(
        packet.provenance.originalArchiveSha256s,
      );
      expect(
        originalHistory.matches.every(
          (entry) =>
            entry.state === 'planned' &&
            entry.journalSha256 === packet.originalJournalSha256 &&
            entry.savedPlanSha256 === f.receipt.planSha256 &&
            entry.configurationSha256 === f.receipt.configurationSha256,
        ),
      ).toBe(true);
      const releaseHistory = await runner.readPlanApplicationHistory(release);
      expect(releaseHistory.matches).toHaveLength(1);
      expect(releaseHistory.matches[0].location).toBe('plan-history');
      expect(f.commands).not.toContain('apply');
      expect(f.vmPowerActions).toEqual([]);
      expect(cancellation.runnerRetirementQualified).toBe(false);
      expect(cancellation.applicationOutcomeQualified).toBe(false);
      expect(
        f.invocations
          .filter((request) => request.args[0] === 'plan')
          .every(
            (request) =>
              request.args.includes('-refresh=true') &&
              !request.args.some((arg) => /^-target|^-destroy|^-invoke/.test(arg)),
          ),
      ).toBe(true);
    }, 60000);

test('actual service cancellation requires current resume before original fixture runner can execute again', async () => {
  const f = await fixture();
  await f.runCancellation();
  const commands = [...f.commands];
  await expect(f.actualRunner.plan({})).rejects.toThrow('ownership changed');
  expect(f.commands).toEqual(commands);
  const resumed = await f.resumeSelectedRunner();
  expect((await resumed.plan({})).noChanges).toBe(true);
  expect(f.vmPowerActions).toEqual([]);
}, 60000);

for (const operation of ['deallocate', 'start'] as const)
  test(`actual ${operation} release deletes only exact selected applied control without invoking VM action`, async () => {
    const f = await fixture(false, 1, operation);
    await f.runCancellation();
    // Model existing selected state independently of the original unsubmitted saved-plan show.
    f.appliedState.control = JSON.parse(f.selectedDeployment.configuration).resource.azapi_resource_action.ce_network;
    const runner = await f.resumeSelectedRunner(),
      release = await runner.plan({});
    expect(release.changes).toEqual([{ address, type: 'azapi_resource_action', actions: ['delete'] }]);
    const prior = await runner.readPlannedResourceFields(release, azureTerraformNetworkPowerSelections, {});
    const proposed = await runner.readProposedResourceFields(release, azureTerraformNetworkPowerSelections, {});
    await validateAzureTerraformNetworkPowerProjection(
      f.plan,
      f.before,
      1,
      operation,
      release,
      'release',
      prior,
      proposed,
    );
    await expect(runner.readAppliedResourceFields(release, azureTerraformNetworkPowerSelections, {})).rejects.toThrow(
      'submitted plan',
    );
    await runner.apply(release, {});
    expect(await runner.readAppliedResourceFields(release, azureTerraformNetworkPowerSelections, {})).toEqual({
      [address]: null,
    });
    expect(f.appliedState.control).toBeNull();
    expect(f.vmPowerActions).toEqual([]);
    expect(f.commands.filter((value) => value === 'apply')).toHaveLength(1);
  }, 60000);

for (const defect of ['resource_id', 'action'])
  test(`actual release proposed absence cannot authorize deletion of foreign prior ${defect}`, async () => {
    const f = await fixture();
    await f.runCancellation();
    const control = JSON.parse(f.selectedDeployment.configuration).resource.azapi_resource_action.ce_network;
    f.appliedState.control = {
      ...control,
      [defect]:
        defect === 'action'
          ? 'start'
          : '/subscriptions/foreign/resourceGroups/foreign/providers/Microsoft.Compute/virtualMachines/foreign',
    };
    const runner = await f.resumeSelectedRunner(),
      release = await runner.plan({});
    await validateAzureTerraformNetworkPowerPlan(f.plan, f.before, 1, 'deallocate', release, 'release');
    const prior = await runner.readPlannedResourceFields(release, azureTerraformNetworkPowerSelections, {});
    const proposed = await runner.readProposedResourceFields(release, azureTerraformNetworkPowerSelections, {});
    await expect(
      validateAzureTerraformNetworkPowerProjection(
        f.plan,
        f.before,
        1,
        'deallocate',
        release,
        'release',
        prior,
        proposed,
      ),
    ).rejects.toThrow('another control');
    expect(f.commands).not.toContain('apply');
    expect(f.vmPowerActions).toEqual([]);
  }, 60000);

for (const effect of ['no-op', 'update'])
  test(`actual mutation ${effect} retains independently recorded prior projection and exact saved-byte identity`, async () => {
    const f = await fixture();
    const control = JSON.parse(f.selectedDeployment.configuration).resource.azapi_resource_action.ce_network;
    f.appliedState.control = effect === 'no-op' ? control : { ...control, action: 'start' };
    const runner = await f.resumeSelectedRunner(),
      receipt = await runner.plan({});
    expect(receipt.changes[0].actions).toEqual([effect]);
    expect(receipt.planSha256).not.toBe(f.receipt.planSha256);
    const prior = await runner.readPlannedResourceFields(receipt, azureTerraformNetworkPowerSelections, {});
    const proposed = await runner.readProposedResourceFields(receipt, azureTerraformNetworkPowerSelections, {});
    const verification = validateAzureTerraformNetworkPowerProjection(
      f.plan,
      f.before,
      1,
      'deallocate',
      receipt,
      'mutation',
      prior,
      proposed,
    );
    if (effect === 'no-op') await verification;
    else await expect(verification).rejects.toThrow('prior/proposed');
    expect(f.commands).not.toContain('apply');
  }, 60000);

test('actual applied-state observation remains separate from previously saved empty plan projection', async () => {
  const f = await fixture();
  await f.runCancellation();
  const runner = await f.resumeSelectedRunner(),
    receipt = await runner.plan({});
  expect(await runner.readProposedResourceFields(receipt, azureTerraformNetworkPowerSelections, {})).toEqual({
    [address]: null,
  });
  f.appliedState.control = JSON.parse(f.selectedDeployment.configuration).resource.azapi_resource_action.ce_network;
  const current = await runner.readAppliedResourceFields(receipt, azureTerraformNetworkPowerSelections, {});
  expect(current[address]).toEqual(f.appliedState.control);
  expect(current[address]).not.toBeNull();
  expect(await readFile(join(f.directory, 'saved.tfplan'), 'utf8')).toBe('synthetic-selected-power-plan-2');
  expect(f.commands).not.toContain('apply');
  expect(f.vmPowerActions).toEqual([]);
}, 60000);
