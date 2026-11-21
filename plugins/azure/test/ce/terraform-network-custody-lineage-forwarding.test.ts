import { expect } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { prepareAzureTerraformNetworkMainRetirementHistory } from '../../src/ce/terraform-network-main-retirement-preparation';
import { prepareAzureTerraformNetworkRetirementCustody } from '../../src/ce/terraform-network-retirement-custody';
import { test } from './owned-fixture-test';
import { terraformNetworkLineageFixture } from './terraform-network-lineage-fixture';

for (const [kind, prepare] of [
  ['paired', prepareAzureTerraformNetworkRetirementCustody],
  ['main', prepareAzureTerraformNetworkMainRetirementHistory],
] as const) {
  test(`${kind} custody forwards genuine older-generation lineage before immutable publication`, async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(Error('bounded custody regression cancellation')), 150000);
    try {
      const f = await terraformNetworkLineageFixture(false, 2, controller.signal);
      const witness = await f.read(controller.signal);
      const control = await f.main(witness);
      expect(control.originalPublishedJournalsQualified).toBe(true);
      expect(control.terminalPublishedJournalsQualified).toBe(true);
      const result = await prepare(
        f.birth.original,
        f.plan,
        f.publicSession,
        f.first.store,
        f.second.service,
        f.first.loaders,
        f.first.site,
        f.first.dependencies.qualifyAcceptance,
        controller.signal,
        undefined,
        witness,
      );
      expect(result.status).toBe('prepared');
      expect(result.parentRetirementQualified).toBe(false);
      expect(
        await prepare(
          f.birth.original,
          f.plan,
          f.publicSession,
          f.first.store,
          f.second.service,
          f.first.loaders,
          f.first.site,
          f.first.dependencies.qualifyAcceptance,
          controller.signal,
          undefined,
          await f.read(controller.signal),
        ),
      ).toEqual(result);
    } finally {
      clearTimeout(timer);
      controller.abort(Error('custody regression settled'));
    }
  }, 180000);
}

for (const [kind, prepare] of [
  ['paired', prepareAzureTerraformNetworkRetirementCustody],
  ['main', prepareAzureTerraformNetworkMainRetirementHistory],
] as const)
  for (const fault of ['serialized-witness', 'foreign-publication', 'changed-packet', 'response-loss'] as const)
    test(`${kind} lineage custody rejects or recovers ${fault} through actual publication`, async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(Error('bounded publication regression cancellation')), 150000);
      try {
        const f = await terraformNetworkLineageFixture(false, 2, controller.signal);
        const write = f.first.store.write,
          name =
            kind === 'paired'
              ? `azure-network-custody-${f.plan.planSha256.slice(0, 24)}.json`
              : `azure-network-main-retirement-${f.plan.planSha256.slice(0, 24)}.json`;
        const commands = [...f.first.commands],
          actions = f.drivers.flatMap((driver) => driver.vmPowerActions);
        let publications = 0,
          opened = 0;
        const open = f.second.service.open;
        f.second.service.open = async (...args) => {
          opened++;
          return open(...args);
        };
        f.first.store.write = async (packet, value) => {
          await write.call(f.first.store, packet, value);
          if (packet !== name) return;
          publications++;
          if (fault === 'foreign-publication')
            await writeFile(join(f.first.store.directory, 'foreign-custody.json'), '{}', { mode: 0o600 });
          if (fault === 'changed-packet') {
            const target = `${f.plan.planId}-terraform-network-driver-complete.json`,
              raw = await f.first.store.read(target);
            await write.call(f.first.store, target, {
              ...(raw as Record<string, unknown>),
              planSha256: 'e'.repeat(64),
            });
          }
          if (fault === 'response-loss' && publications === 1) throw Error('synthetic custody response loss');
        };
        const genuine = await f.read(controller.signal),
          witness = fault === 'serialized-witness' ? structuredClone(genuine) : genuine;
        const run = (token: unknown) =>
          prepare(
            f.birth.original,
            f.plan,
            f.publicSession,
            f.first.store,
            f.second.service,
            f.first.loaders,
            f.first.site,
            f.first.dependencies.qualifyAcceptance,
            controller.signal,
            undefined,
            token,
          );
        if (fault === 'response-loss') {
          await expect(run(witness)).rejects.toThrow('synthetic custody response loss');
          const result = await run(await f.read(controller.signal));
          expect(result.status).toBe('prepared');
          expect(result.parentRetirementQualified).toBe(false);
          expect(publications).toBe(1);
        } else {
          await expect(run(witness)).rejects.toThrow();
          expect(publications).toBe(fault === 'serialized-witness' ? 0 : 1);
          if (fault === 'serialized-witness') expect(opened).toBe(0);
        }
        expect(f.first.commands).toEqual(commands);
        expect(f.drivers.flatMap((driver) => driver.vmPowerActions)).toEqual(actions);
      } finally {
        clearTimeout(timer);
        controller.abort(Error('publication regression settled'));
      }
    }, 180000);
