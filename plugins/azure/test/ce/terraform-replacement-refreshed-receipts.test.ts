import { expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { type SessionManagerLike, savePlanArtifact } from '../../src/ce/artifacts';
import { readAzureTerraformNetworkAllOriginalCustody } from '../../src/ce/terraform-network-retirement-lineage';
import { nicExecutionRoots } from './terraform-network-nic-execution-fixture';
import { replacementNativeReceiptsFixture } from './terraform-network-replacement-native-receipts-fixture';

test('owning replacement refresh history accounts every exact native final receipt while unrelated receipts remain unknown', async () => {
  const before = new Set(nicExecutionRoots);
  try {
    const f = await replacementNativeReceiptsFixture();
    let outcome = f.result;
    const loadOutcome = f.loaders.loadOutcome.bind(f.loaders);
    f.loaders.loadOutcome = async (plan) =>
      plan.planSha256 === f.first.planSha256 ? structuredClone(outcome) : loadOutcome(plan);
    const publicSession: SessionManagerLike = {
      getSessionId: () => `${f.f.store.directory}-refreshed-replacement-public`,
      getArtifactsDir: () => null,
      getArtifactPath: async () => null,
      saveArtifact: async () => undefined,
    };
    for (const plan of [f.original, f.f.input.networkPlan, f.first])
      await savePlanArtifact(publicSession, plan, f.f.birth.current);
    const collect = () =>
      readAzureTerraformNetworkAllOriginalCustody(
        f.original,
        publicSession,
        f.f.store,
        f.service,
        f.loaders,
        f.f.birth.site,
        f.f.dependencies.qualifyHistorical,
        undefined,
        f.f.dependencies.qualifyCompletedOperational,
      );
    const initial = await collect();
    expect(initial.sharedMain.allNativeReceiptsAccounted).toBe(true);
    const completion = await f.f.store.read(`${f.first.planId}-terraform-network-replacement-complete.json`);
    for (let i = 0; i < 3; i++) {
      const next = await f.f.run();
      expect(next.status).toBe('complete');
      outcome = next;
      const receipt = (await f.f.store.read(`${f.first.planId}-terraform-replacement-final-plan.json`)) as PlanReceipt;
      await f.archive(receipt);
    }
    const commands = [...f.commands],
      applies = f.f.state.applies;
    const refreshed = await collect();
    expect(refreshed.sharedMain.allNativeReceiptsAccounted).toBe(true);
    expect(refreshed.sharedMain.replacementJournalsQualified).toBe(true);
    expect(await f.f.store.read(`${f.first.planId}-terraform-network-replacement-complete.json`)).toEqual(completion);
    expect(f.commands).toEqual(commands);
    expect(f.f.state.applies).toBe(applies);
    await f.appendUnknown();
    expect((await collect()).sharedMain.allNativeReceiptsAccounted).toBe(false);
  } finally {
    for (const root of nicExecutionRoots.filter((root) => !before.has(root))) {
      await rm(root, { recursive: true });
      nicExecutionRoots.splice(nicExecutionRoots.indexOf(root), 1);
    }
  }
}, 300000);
