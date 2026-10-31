import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { chmod, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { savePlanArtifact } from '../../src/ce/artifacts';
import { canonicalSha256 } from '../../src/ce/canonical';
import { compileAzureTerraformNetworkUpdatePlan } from '../../src/ce/terraform-network-plan';
import {
  readAzureTerraformNetworkAllOriginalCustody,
  recheckAzureTerraformNetworkRetirementLineage,
} from '../../src/ce/terraform-network-retirement-lineage';
import { terraformNetworkLineageFixture } from './terraform-network-lineage-fixture';
import { nicExecutionRoots } from './terraform-network-nic-execution-fixture';

test('lineage-owned batch authenticates all three actual main/power generations with private scoped witnesses', async () => {
  const existingRoots = new Set(nicExecutionRoots),
    controller = new AbortController();
  const timer = setTimeout(() => controller.abort(Error('bounded batch custody cancellation')), 150000);
  try {
    const f = await terraformNetworkLineageFixture(false, 3, controller.signal);
    const commands = [...f.first.commands],
      actions = f.drivers.flatMap((driver) => driver.vmPowerActions),
      started = performance.now();
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
    console.info('BATCH CUSTODY MS', performance.now() - started);
    expect(performance.now() - started).toBeLessThanOrEqual(180000);
    expect(result.rows.map((row) => row.planSha256).sort()).toEqual(f.plans.map((plan) => plan.planSha256).sort());
    for (const row of result.rows) {
      expect(row.main.originalPublishedJournalsQualified).toBe(true);
      expect(row.main.terminalPublishedJournalsQualified).toBe(true);
      expect(row.power.rows).toHaveLength(2);
      expect(row.power.rows.every((row) => row.status === 'retired')).toBe(true);
    }
    expect(result.lineage.rows.find((row) => row.planSha256 === f.future.planSha256)?.execution).toBe(
      'unstaged-no-outcome',
    );
    expect(result.lineage.unstagedMainJournalAbsenceQualified).toBe(false);
    const opened = f.second.service.open;
    let escapedOpens = 0;
    f.second.service.open = async (...args) => {
      escapedOpens++;
      return opened(...args);
    };
    await expect(
      recheckAzureTerraformNetworkRetirementLineage(
        result.lineage,
        f.plan,
        f.first.store,
        f.first.loaders,
        f.first.site,
        f.first.dependencies.qualifyAcceptance,
        controller.signal,
      ),
    ).rejects.toThrow('owning authenticated lineage witness');
    await expect(
      readAzureTerraformNetworkAllOriginalCustody(
        f.birth.original,
        f.publicSession,
        f.first.store,
        f.second.service,
        f.first.loaders,
        f.first.site,
        f.first.dependencies.qualifyAcceptance,
        AbortSignal.abort(Error('pre-aborted batch')),
      ),
    ).rejects.toThrow('pre-aborted batch');
    expect(escapedOpens).toBe(0);
    f.second.service.open = opened;
    expect(result.parentRetirementQualified).toBe(false);
    expect(result.allPublicRequestCustodyQualified).toBe(false);
    expect(f.first.commands).toEqual(commands);
    expect(f.drivers.flatMap((driver) => driver.vmPowerActions)).toEqual(actions);
    for (const root of nicExecutionRoots.filter((root) => !existingRoots.has(root))) {
      await rm(root, { recursive: true });
      nicExecutionRoots.splice(nicExecutionRoots.indexOf(root), 1);
    }
  } finally {
    clearTimeout(timer);
    controller.abort(Error('batch custody settled'));
  }
}, 180000);

test('batch rejects valid earlier original journal bytes changed during later-generation inspection', async () => {
  const existingRoots = new Set(nicExecutionRoots);
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(Error('bounded cross-generation red')), 150000);
  try {
    const f = await terraformNetworkLineageFixture(false, 2, controller.signal);
    const selected = f.first.original.find(
      (receipt) =>
        !f.mains[1].original.some((other) => canonicalSha256(other) === canonicalSha256(receipt)) && !receipt.noChanges,
    );
    expect(selected).toBeDefined();
    const root = join(f.first.runnerDirectory, 'plan-history'),
      mutations: Array<{ path: string; value: { state: string; receipt: unknown } }> = [];
    for (const name of await readdir(root)) {
      const path = join(root, name),
        value = JSON.parse(await readFile(join(path, 'plan-receipt.json'), 'utf8'));
      if (canonicalSha256(value.receipt) === canonicalSha256(selected)) mutations.push({ path, value });
    }
    expect(mutations.length).toBeGreaterThan(0);
    const open = f.second.service.open;
    let opens = 0,
      changed = false;
    f.second.service.open = async (...args) => {
      const session = await open(...args);
      if (++opens === 2) {
        const row = mutations[0],
          bytes = Buffer.from(`${JSON.stringify({ ...row.value, state: 'applying' })}\n`);
        await writeFile(join(row.path, 'plan-receipt.json'), bytes, { mode: 0o600 });
        const inventory = JSON.parse(await readFile(join(row.path, 'inventory.json'), 'utf8'));
        inventory['plan-receipt.json'] = createHash('sha256').update(bytes).digest('hex');
        const inventoryBytes = Buffer.from(`${JSON.stringify(inventory)}\n`);
        await writeFile(join(row.path, 'inventory.json'), inventoryBytes, { mode: 0o600 });
        await rename(row.path, join(root, createHash('sha256').update(inventoryBytes).digest('hex')));
        changed = true;
      }
      return session;
    };
    await expect(
      readAzureTerraformNetworkAllOriginalCustody(
        f.birth.original,
        f.publicSession,
        f.first.store,
        f.second.service,
        f.first.loaders,
        f.first.site,
        f.first.dependencies.qualifyAcceptance,
        controller.signal,
      ),
    ).rejects.toThrow();
    expect(changed).toBe(true);
    for (const root of nicExecutionRoots.filter((root) => !existingRoots.has(root))) {
      await rm(root, { recursive: true });
      nicExecutionRoots.splice(nicExecutionRoots.indexOf(root), 1);
    }
  } finally {
    clearTimeout(timer);
    controller.abort(Error('red settled'));
  }
}, 180000);

for (const fault of [
  'earlier-power-marker',
  'late-public-plan',
  'changed-source',
  'changed-packet',
  'changed-owner',
  'changed-open',
  'unsafe-main-file',
  'partial-main',
] as const)
  test(`batch retains or rejects ${fault} at its final native owning boundary`, async () => {
    const existingRoots = new Set(nicExecutionRoots),
      controller = new AbortController(),
      timer = setTimeout(() => controller.abort(Error('bounded batch fault')), 150000);
    try {
      const f = await terraformNetworkLineageFixture(false, 2, controller.signal),
        open = f.second.service.open;
      const commands = [...f.first.commands],
        actions = f.drivers.flatMap((driver) => driver.vmPowerActions);
      let opens = 0,
        fired = false;
      f.second.service.open = async (...args) => {
        const session = await open(...args);
        if (fault === 'partial-main') {
          const read = session.readPlanApplicationHistory;
          if (!read) throw Error('actual reader missing');
          session.readPlanApplicationHistory = async (...args) => ({
            ...(await read.apply(session, args)),
            incompleteArchives: 1,
          });
          fired = true;
        } else if (++opens === 2) {
          fired = true;
          if (fault === 'earlier-power-marker') {
            const deployment = f.first.graph.powerDeployments[0];
            if (!deployment.stage) throw Error('selected power stage missing');
            const path = join(
              f.first.store.directory,
              'terraform-stages',
              deployment.stage,
              deployment.deploymentId,
              'artifact-retirement.json',
            );
            await writeFile(path, `${await readFile(path, 'utf8')}\n`, { mode: 0o600 });
          }
          if (fault === 'late-public-plan')
            await savePlanArtifact(
              f.publicSession,
              compileAzureTerraformNetworkUpdatePlan(f.birth.plan, f.future, f.birth.original),
              f.birth.current,
            );
          if (fault === 'changed-source') f.sources.set(f.plan.planSha256, { ...f.plan, siteName: 'changed-source' });
          if (fault === 'changed-packet')
            await f.first.store.remove(`${f.plan.planId}-terraform-network-node-1-preflight.json`);
          if (fault === 'changed-owner') f.first.store.owner.account = 'example-foreign';
          if (fault === 'changed-open') f.second.service.open = open;
          if (fault === 'unsafe-main-file') await chmod(join(f.first.runnerDirectory, 'plan-receipt.json'), 0o644);
        }
        return session;
      };
      const run = () =>
        readAzureTerraformNetworkAllOriginalCustody(
          f.birth.original,
          f.publicSession,
          f.first.store,
          f.second.service,
          f.first.loaders,
          f.first.site,
          f.first.dependencies.qualifyAcceptance,
          controller.signal,
        );
      if (fault === 'partial-main') {
        const result = await run();
        expect(result.rows.every((row) => !row.main.originalPublishedJournalsQualified)).toBe(true);
        expect(result.allPublicRequestCustodyQualified).toBe(false);
      } else await expect(run()).rejects.toThrow();
      expect(fired).toBe(true);
      expect(f.first.commands).toEqual(commands);
      expect(f.drivers.flatMap((driver) => driver.vmPowerActions)).toEqual(actions);
      for (const root of nicExecutionRoots.filter((root) => !existingRoots.has(root))) {
        await rm(root, { recursive: true });
        nicExecutionRoots.splice(nicExecutionRoots.indexOf(root), 1);
      }
    } finally {
      clearTimeout(timer);
      controller.abort(Error('batch fault settled'));
    }
  }, 180000);
test('batch cancellation bounds an ignored actual runner await and cannot return late custody', async () => {
  const existingRoots = new Set(nicExecutionRoots),
    f = await terraformNetworkLineageFixture(false, 2),
    open = f.second.service.open;
  const controller = new AbortController(),
    started = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>(),
    returned = Promise.withResolvers<void>();
  let opens = 0;
  f.second.service.open = async (...args) => {
    const session = await open(...args);
    if (++opens === 2) {
      started.resolve();
      await release.promise;
      returned.resolve();
    }
    return session;
  };
  const names = (await readdir(f.first.store.directory)).sort(),
    commands = [...f.first.commands];
  const running = readAzureTerraformNetworkAllOriginalCustody(
    f.birth.original,
    f.publicSession,
    f.first.store,
    f.second.service,
    f.first.loaders,
    f.first.site,
    f.first.dependencies.qualifyAcceptance,
    controller.signal,
  );
  try {
    await started.promise;
    const began = performance.now();
    controller.abort(Error('ignored batch await aborted'));
    await expect(running).rejects.toThrow('ignored batch await aborted');
    expect(performance.now() - began).toBeLessThan(1000);
  } finally {
    release.resolve();
    await returned.promise;
    controller.abort();
  }
  expect((await readdir(f.first.store.directory)).sort()).toEqual(names);
  expect(f.first.commands).toEqual(commands);
  for (const root of nicExecutionRoots.filter((root) => !existingRoots.has(root))) {
    await rm(root, { recursive: true });
    nicExecutionRoots.splice(nicExecutionRoots.indexOf(root), 1);
  }
}, 180000);
