import { expect } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalSha256 } from '../../src/ce/canonical';
import { prepareAzureTerraformNetworkAllRetirementCustody } from '../../src/ce/terraform-network-all-retirement-custody';
import { readAzureTerraformNetworkAllOriginalCustody } from '../../src/ce/terraform-network-retirement-lineage';
import { test } from './owned-fixture-test';
import { terraformNetworkLineageFixture } from './terraform-network-lineage-fixture';

test('three-generation single aggregate publishes every actual original main/power journal in one exact record', async () => {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(Error('bounded three-generation aggregate cancellation')), 150000);
  try {
    const f = await terraformNetworkLineageFixture(false, 3, controller.signal),
      start = performance.now(),
      commands = [...f.first.commands],
      actions = f.drivers.flatMap((driver) => driver.vmPowerActions);
    const result = await prepareAzureTerraformNetworkAllRetirementCustody(
      f.birth.original,
      f.publicSession,
      f.first.store,
      f.second.service,
      f.first.loaders,
      f.first.site,
      f.first.dependencies.qualifyAcceptance,
      controller.signal,
    );
    console.info('SINGLE THREE-GENERATION PUBLICATION MS', performance.now() - start);
    expect(performance.now() - start).toBeLessThanOrEqual(180000);
    const raw = JSON.parse(await readFile(join(f.first.store.directory, result.name), 'utf8'));
    expect(canonicalSha256(raw)).toBe(result.preparationSha256);
    expect(result.stagedNetworkPlanSha256s.sort()).toEqual(f.plans.map((plan) => plan.planSha256).sort());
    expect(result.stagedPowerRows).toHaveLength(6);
    expect(result.stagedPowerRows.every((row) => row.status === 'retired')).toBe(true);
    expect(result.allStagedMainPublishedJournalsQualified).toBe(true);
    expect(result.parentRetirementQualified).toBe(false);
    expect(f.first.commands).toEqual(commands);
    expect(f.drivers.flatMap((driver) => driver.vmPowerActions)).toEqual(actions);
  } finally {
    clearTimeout(timer);
    controller.abort(Error('single aggregate settled'));
  }
}, 180000);
test('lineage-owned all-generation HA six-MAC custody authenticates eighteen actual retired children', async () => {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(Error('bounded all-generation HA cancellation')), 540000);
  try {
    const began = performance.now(),
      f = await terraformNetworkLineageFixture(true, 3, controller.signal);
    console.info('HA BATCH FIXTURE MS', performance.now() - began);
    const commands = [...f.first.commands],
      actions = f.drivers.flatMap((driver) => driver.vmPowerActions),
      start = performance.now();
    const result = await readAzureTerraformNetworkAllOriginalCustody(
      f.birth.original,
      f.publicSession,
      f.first.store,
      f.second.service,
      f.first.loaders,
      f.first.site,
      f.first.dependencies.qualifyAcceptance,
      controller.signal,
    );
    console.info('HA BATCH OBSERVER MS', performance.now() - start);
    expect(performance.now() - start).toBeLessThanOrEqual(180000);
    expect(result.rows.map((row) => row.planSha256).sort()).toEqual(f.plans.map((plan) => plan.planSha256).sort());
    expect(
      result.rows.every(
        (row) => row.main.originalPublishedJournalsQualified && row.main.terminalPublishedJournalsQualified,
      ),
    ).toBe(true);
    expect(result.rows.flatMap((row) => row.power.rows)).toHaveLength(18);
    expect(result.rows.flatMap((row) => row.power.rows).every((row) => row.status === 'retired')).toBe(true);
    expect(
      new Set(
        Object.values(f.histories[2].inventory.nodes).flatMap((vm) => Object.values(vm.nics).map((nic) => nic.mac)),
      ).size,
    ).toBe(6);
    expect(result.allPublicRequestCustodyQualified).toBe(false);
    expect(result.parentRetirementQualified).toBe(false);
    expect(f.first.commands).toEqual(commands);
    expect(f.drivers.flatMap((driver) => driver.vmPowerActions)).toEqual(actions);
  } finally {
    clearTimeout(timer);
    controller.abort(Error('HA custody settled'));
  }
}, 600000);
