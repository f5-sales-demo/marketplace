import { expect } from 'bun:test';
import { type SessionManagerLike, savePlanArtifact } from '../../src/ce/artifacts';
import { readAzureTerraformNetworkAllOriginalCustody } from '../../src/ce/terraform-network-retirement-lineage';
import { test } from './owned-fixture-test';

import { replacementNativeReceiptsFixture } from './terraform-network-replacement-native-receipts-fixture';

test('owning completed replacement receipt provenance joins every actual native original receipt and retains unknown refreshes', async () => {
  {
    const f = await replacementNativeReceiptsFixture();
    const publicSession: SessionManagerLike = {
      getSessionId: () => `${f.f.store.directory}-replacement-receipt-public`,
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
    const commands = [...f.commands],
      applies = f.f.state.applies;
    const result = await collect();
    expect(result.lineage.rows.find((row) => row.planSha256 === f.first.planSha256)?.execution).toBe(
      'completed-replacement',
    );
    expect(result.sharedMain.replacementRows).toHaveLength(1);
    expect(result.sharedMain.replacementRows[0].records.map((row) => row.stage)).toEqual([
      'quiesce',
      'launch',
      'immutable-final',
    ]);
    expect(result.sharedMain.replacementRows[0].originalPublishedJournalsQualified).toBe(true);
    expect(result.sharedMain.replacementJournalsQualified).toBe(true);
    expect(
      result.sharedMain.rows
        .filter((row) => row.receiptSha256)
        .every((row) => row.provenance === 'authenticated-execution-receipt'),
    ).toBe(true);
    expect(result.sharedMain.originalDeploymentJournalsQualified).toBe(false);
    expect(result.allPublicRequestCustodyQualified).toBe(false);
    expect(result.parentRetirementQualified).toBe(false);
    expect(f.commands).toEqual(commands);
    expect(f.f.state.applies).toBe(applies);
    const unknownSha256 = await f.appendUnknown(),
      after = [...f.commands];
    const unknown = await collect();
    expect(unknown.sharedMain.allNativeReceiptsAccounted).toBe(false);
    expect(
      unknown.sharedMain.rows.some(
        (row) => row.receiptSha256 === unknownSha256 && row.provenance === 'unaccounted-receipt',
      ),
    ).toBe(true);
    expect(unknown.sharedMain.unstagedRequestAbsenceQualified).toBe(false);
    expect(unknown.parentRetirementQualified).toBe(false);
    expect(f.commands).toEqual(after);
  }
}, 300000);
