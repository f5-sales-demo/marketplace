import { expect } from 'bun:test';
import { canonicalSha256 } from '../../src/ce/canonical';
import { observeAzureTerraformNetworkReplacementCurrent } from '../../src/ce/terraform-network-replacement-current';
import {
  bindAzureTerraformNetworkReplacementExecutionJournal,
  readAzureTerraformNetworkReplacementExecutionJournal,
} from '../../src/ce/terraform-network-replacement-execution-journal';
import { bindAzureTerraformNetworkReplacementSource } from '../../src/ce/terraform-network-replacement-source-binding';
import { test } from './owned-fixture-test';
import { completedReplacement } from './terraform-network-mixed-generation-fixture';

import { networkReplacementExecutorFixture as fixture } from './terraform-network-replacement-executor-fixture';

for (const ha of [false, true]) {
  test(`actual completed replacement freezes the next owning source binding (${ha ? 'HA' : 'single'})`, async () => {
    const { f, first, next, inventory, loaders } = await completedReplacement(ha);
    const applies = f.state.applies,
      collected = [...f.state.collected];
    const terraform = {
      async open() {
        return f.session;
      },
    };
    const { binding } = await bindAzureTerraformNetworkReplacementSource(
      next,
      terraform,
      f.store,
      f.executionApi,
      {},
      loaders,
      f.birth.site,
      f.dependencies.qualifyHistorical,
      undefined,
      f.dependencies.qualifyCompletedOperational,
    );
    expect(binding.before.planSha256).toBe(first.planSha256);
    expect(binding.before.nodes).toEqual(inventory.nodes);
    expect(binding.source).toBe(f.state.configuration);
    expect(binding.qualification.networkHistory.map((link) => link.kind)).toEqual([
      'network-update',
      'node-replacement',
    ]);
    expect(binding.before.collectedAt).not.toBe(inventory.collectedAt);
    const replay = await bindAzureTerraformNetworkReplacementSource(
      next,
      terraform,
      f.store,
      {
        async exec() {
          throw Error('replay must not collect cloud');
        },
      },
      {},
      loaders,
      f.birth.site,
      f.dependencies.qualifyHistorical,
      undefined,
      f.dependencies.qualifyCompletedOperational,
    );
    expect(replay.binding).toEqual(binding);
    const journal = await bindAzureTerraformNetworkReplacementExecutionJournal(
      next,
      f.store,
      loaders,
      f.birth.site,
      canonicalSha256(binding),
      f.dependencies.qualifyHistorical,
      undefined,
      f.dependencies.qualifyCompletedOperational,
    );
    const read = await readAzureTerraformNetworkReplacementExecutionJournal(
      next,
      f.store,
      loaders,
      f.birth.site,
      journal.journalSha256,
      f.dependencies.qualifyHistorical,
      undefined,
      undefined,
      f.dependencies.qualifyCompletedOperational,
    );
    expect(read.journal).toEqual(journal.journal);
    const intact = await observeAzureTerraformNetworkReplacementCurrent(
      {
        plan: next,
        retainedPlan: first,
        binding,
        sourceBindingSha256: canonicalSha256(binding),
        phase: 'intact',
      },
      f.executionApi,
    );
    expect(Object.keys(intact.nodes)).toHaveLength(ha ? 3 : 1);
    expect(intact.nodes[String(f.selected)].vmId).toBe(f.newVmId);
    expect(f.state.applies).toBe(applies);
    expect(f.state.collected).toEqual(collected);
  }, 180000);
}
for (const failure of [
  'missing-verifier',
  'unavailable-verifier',
  'foreign-output',
  'foreign-cloud-uuid',
  'late-private-source',
  'late-predecessor-packet',
  'late-site',
  'ignored-cancellation',
] as const) {
  test(`next replacement binding rejects ${failure} before source publication`, async () => {
    const { f, first, next, loaders } = await completedReplacement(false);
    const applies = f.state.applies,
      collected = [...f.state.collected];
    const controller = new AbortController();
    let queries = 0,
      outputReads = 0;
    const session = {
      ...f.session,
      async readOutputs(...args: Parameters<typeof f.session.readOutputs>) {
        const outputs = structuredClone(await f.session.readOutputs(...args));
        outputReads++;
        if (failure === 'foreign-output')
          (outputs.ce_instances as Record<string, { vm_id: string }>)['1'].vm_id =
            'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
        if (outputReads === 2) {
          if (failure === 'late-private-source') f.state.configuration += '\n';
          if (failure === 'late-site') f.birth.site.siteUid = 'foreign-site';
          if (failure === 'late-predecessor-packet') {
            const name = `${first.planId}-terraform-network-replacement-complete.json`;
            const packet = (await f.store.read(name)) as Record<string, unknown>;
            await f.store.write(name, { ...packet, finalConfigurationSha256: 'f'.repeat(64) });
          }
        }
        return outputs;
      },
    };
    const api = {
      async exec(...args: Parameters<typeof f.executionApi.exec>) {
        queries++;
        if (failure === 'ignored-cancellation') {
          controller.abort(Error('synthetic cancel'));
          return new Promise<never>(() => {});
        }
        const result = await f.executionApi.exec(...args);
        if (failure === 'foreign-cloud-uuid' && args[1][0] === 'vm' && args[1][1] === 'list') {
          const rows = JSON.parse(result.stdout);
          rows[0].vmId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
          return { ...result, stdout: JSON.stringify(rows) };
        }
        return result;
      },
    };
    let verifier = f.dependencies.qualifyCompletedOperational;
    if (failure === 'missing-verifier') verifier = undefined as unknown as typeof verifier;
    if (failure === 'unavailable-verifier')
      verifier = async () => {
        throw Error('synthetic predecessor unavailable');
      };
    await expect(
      bindAzureTerraformNetworkReplacementSource(
        next,
        {
          async open() {
            return session;
          },
        },
        f.store,
        api,
        {},
        loaders,
        f.birth.site,
        f.dependencies.qualifyHistorical,
        controller.signal,
        verifier,
      ),
    ).rejects.toThrow();
    await expect(f.store.read(`${next.planId}-terraform-network-replacement-source.json`)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    if (failure === 'missing-verifier' || failure === 'unavailable-verifier') expect(queries).toBe(0);
    expect(f.state.applies).toBe(applies);
    expect(f.state.collected).toEqual(collected);
  }, 180000);
}

for (const ha of [false, true]) {
  test(`owning executor performs a second actual replacement with distinct generation (${ha ? 'HA alternate node' : 'single same node'})`, async () => {
    const { f, first, next, input, loaders, inventory } = await completedReplacement(ha);
    const second = await fixture(ha, false, {
      fixture: {
        ...f,
        input,
        loaders,
        api: f.executionApi,
        terraform: {
          async open() {
            return f.session;
          },
        },
        dependencies: { ...f.dependencies, qualifyAcceptance: f.dependencies.qualifyHistorical },
      },
      newVmId: '00000000-0000-4000-8000-000000000088',
      replacementVerifier: f.dependencies.qualifyCompletedOperational,
    });
    expect(second.input.plan.planSha256).toBe(next.planSha256);
    expect(second.binding.before.nodes).toEqual(inventory.nodes);
    const result = await second.run();
    expect(result.status).toBe('complete');
    expect(second.state.applies).toBe(2);
    expect(second.state.bootstraps).toBe(1);
    expect(second.newVmId).not.toBe(f.newVmId);
    const current = await observeAzureTerraformNetworkReplacementCurrent(
      {
        plan: next,
        retainedPlan: first,
        binding: second.binding,
        sourceBindingSha256: canonicalSha256(second.binding),
        phase: 'launched',
        newVmId: second.newVmId,
      },
      second.executionApi,
    );
    expect(current.nodes[String(second.selected)].vmId).toBe(second.newVmId);
    expect(current.nodes[String(second.selected)].ownerPlanSha256).toBe(next.planSha256);
    if (ha) {
      expect(second.selected).not.toBe(f.selected);
      expect(current.nodes[String(f.selected)].vmId).toBe(f.newVmId);
      expect(current.nodes[String(f.selected)].ownerPlanSha256).toBe(first.planSha256);
    }
    const resumed = await second.run();
    expect(resumed.status).toBe('complete');
    expect(second.state.applies).toBe(2);
    expect(second.state.bootstraps).toBe(1);
  }, 240000);
}
