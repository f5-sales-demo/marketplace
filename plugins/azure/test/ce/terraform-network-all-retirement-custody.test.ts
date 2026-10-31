import { expect } from 'bun:test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { prepareAzureTerraformNetworkAllRetirementCustody } from '../../src/ce/terraform-network-all-retirement-custody';
import { test } from './owned-fixture-test';
import { terraformNetworkLineageFixture } from './terraform-network-lineage-fixture';

for (const fault of [
  'none',
  'foreign-publication',
  'changed-journal',
  'response-loss',
  'changed-publication-bytes',
] as const)
  test(`actual all-generation immutable publication handles ${fault}`, async () => {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(Error('bounded aggregate publication')), 150000);
    try {
      const f = await terraformNetworkLineageFixture(false, 2, controller.signal),
        write = f.first.store.write;
      const commands = [...f.first.commands],
        actions = f.drivers.flatMap((driver) => driver.vmPowerActions);
      let publications = 0;
      f.first.store.write = async (name, value) => {
        await write.call(f.first.store, name, value);
        if (!name.startsWith('azure-network-all-custody-')) return;
        publications++;
        if (fault === 'foreign-publication')
          await writeFile(join(f.first.store.directory, 'foreign-all-custody.json'), '{}', { mode: 0o600 });
        if (fault === 'changed-journal')
          await writeFile(
            join(f.first.runnerDirectory, 'plan-receipt.json'),
            `${await readFile(join(f.first.runnerDirectory, 'plan-receipt.json'), 'utf8')}\n`,
            { mode: 0o600 },
          );
        if (fault === 'changed-publication-bytes')
          await writeFile(join(f.first.store.directory, name), `${JSON.stringify(value)}\n`, { mode: 0o600 });
        if (fault === 'response-loss' && publications === 1) throw Error('synthetic aggregate response loss');
      };
      const run = () =>
        prepareAzureTerraformNetworkAllRetirementCustody(
          f.birth.original,
          f.publicSession,
          f.first.store,
          f.second.service,
          f.first.loaders,
          f.first.site,
          f.first.dependencies.qualifyAcceptance,
          controller.signal,
        );
      if (fault === 'none' || fault === 'response-loss') {
        if (fault === 'response-loss') await expect(run()).rejects.toThrow('synthetic aggregate response loss');
        const result = await run();
        expect(result.status).toBe('prepared');
        expect(result.allStagedMainPublishedJournalsQualified).toBe(true);
        expect(result.stagedPowerRows).toHaveLength(4);
        expect(result.unqualifiedPublicRequestRows.map((row) => row.planSha256)).toEqual([f.future.planSha256]);
        expect(result.allPublicRequestCustodyQualified).toBe(false);
        expect(result.parentRetirementQualified).toBe(false);
        if (fault === 'none') expect(await run()).toEqual(result);
        expect(publications).toBe(1);
      } else {
        await expect(run()).rejects.toThrow();
        expect(publications).toBe(1);
      }
      expect(f.first.commands).toEqual(commands);
      expect(f.drivers.flatMap((driver) => driver.vmPowerActions)).toEqual(actions);
    } finally {
      clearTimeout(timer);
      controller.abort(Error('publication settled'));
    }
  }, 180000);
