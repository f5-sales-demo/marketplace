import { expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import { type SessionManagerLike, savePlanArtifact } from '../../src/ce/artifacts';
import { readAzureTerraformNetworkAllOriginalCustody } from '../../src/ce/terraform-network-retirement-lineage';
import { nicExecutionRoots } from './terraform-network-nic-execution-fixture';
import { replacementNativeReceiptsFixture } from './terraform-network-replacement-native-receipts-fixture';

test('replacement shared-main custody rejects outcome, verifier, native identity, duplicate and final packet faults', async () => {
  const before = new Set(nicExecutionRoots);
  try {
    const f = await replacementNativeReceiptsFixture();
    const publicSession: SessionManagerLike = {
      getSessionId: () => `${f.f.store.directory}-replacement-adversarial-public`,
      getArtifactsDir: () => null,
      getArtifactPath: async () => null,
      saveArtifact: async () => undefined,
    };
    for (const plan of [f.original, f.f.input.networkPlan, f.first])
      await savePlanArtifact(publicSession, plan, f.f.birth.current);
    const collect = (replacement = f.f.dependencies.qualifyCompletedOperational) =>
      readAzureTerraformNetworkAllOriginalCustody(
        f.original,
        publicSession,
        f.f.store,
        f.service,
        f.loaders,
        f.f.birth.site,
        f.f.dependencies.qualifyHistorical,
        undefined,
        replacement,
      );
    const commands = [...f.commands],
      calls = [...f.f.calls],
      applies = f.f.state.applies;
    const loadOutcome = f.loaders.loadOutcome;
    f.loaders.loadOutcome = async (plan) => {
      const result = await loadOutcome(plan);
      return plan.planSha256 === f.first.planSha256
        ? { ...result, networkReplacementCompletionSha256: 'a'.repeat(64) }
        : result;
    };
    await expect(collect()).rejects.toThrow();
    f.loaders.loadOutcome = loadOutcome;
    await expect(
      readAzureTerraformNetworkAllOriginalCustody(
        f.original,
        publicSession,
        f.f.store,
        f.service,
        f.loaders,
        f.f.birth.site,
        f.f.dependencies.qualifyHistorical,
      ),
    ).rejects.toThrow();
    const open = f.service.open.bind(f.service);
    for (const mode of ['foreign-manifest', 'duplicate-occurrence', 'late-quiesce-packet'] as const) {
      let reads = 0;
      const name = `${f.first.planId}-terraform-quiesce-plan.json`,
        packet = await f.f.store.read(name);
      f.service.open = async (...args) => {
        const session = await open(...args),
          read = session.readPlanJournalInventory;
        if (!read) throw Error('actual exhaustive native inventory required');
        session.readPlanJournalInventory = async (...request) => {
          const actual = structuredClone(await read.apply(session, request));
          if (mode === 'foreign-manifest') actual.entries[0].manifestSha256 = 'f'.repeat(64);
          if (mode === 'duplicate-occurrence') actual.entries.push(structuredClone(actual.entries[0]));
          if (mode === 'late-quiesce-packet' && ++reads === 2)
            await f.f.store.write(name, { ...(packet as Record<string, unknown>), planSha256: 'a'.repeat(64) });
          return actual;
        };
        return session;
      };
      await expect(collect()).rejects.toThrow();
      f.service.open = open;
      if (mode === 'late-quiesce-packet') {
        expect(reads).toBeGreaterThanOrEqual(2);
        await f.f.store.write(name, packet);
      }
    }
    expect(f.commands).toEqual(commands);
    expect(f.f.calls).toEqual(calls);
    expect(f.f.state.applies).toBe(applies);
  } finally {
    for (const root of nicExecutionRoots.filter((root) => !before.has(root))) {
      await rm(root, { recursive: true });
      nicExecutionRoots.splice(nicExecutionRoots.indexOf(root), 1);
    }
  }
}, 300000);
