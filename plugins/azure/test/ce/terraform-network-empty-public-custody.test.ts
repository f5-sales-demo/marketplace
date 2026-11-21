import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type SessionManagerLike, savePlanArtifact } from '../../src/ce/artifacts';
import { prepareAzureTerraformNetworkAllRetirementCustody } from '../../src/ce/terraform-network-all-retirement-custody';
import { readAzureTerraformNetworkAllOriginalCustody } from '../../src/ce/terraform-network-retirement-lineage';
import { loadAzureTerraformOutcome, saveAzureTerraformOutcome } from '../../src/ce/terraform-outcome';
import { observation } from './fixtures';
import { originalNativeWorkflowFixture } from './terraform-original-native-workflow-fixture';

async function fixture(ha = false) {
  const f = await originalNativeWorkflowFixture(ha),
    publicDirectory = await mkdtemp(join(tmpdir(), 'original-public-artifacts-'));
  let next = 0;
  const paths = new Map<string, string>(),
    session: SessionManagerLike = {
      getSessionId: () => 'original-source-fixture',
      getArtifactsDir: () => publicDirectory,
      async saveArtifact(content, tool) {
        const id = String(++next),
          path = join(publicDirectory, `${id}.${tool}.log`);
        await writeFile(path, content, { mode: 0o600 });
        paths.set(id, path);
        return id;
      },
      async getArtifactPath(id) {
        return paths.get(id) ?? null;
      },
    };
  const observed = structuredClone(observation);
  if (ha) for (const region of observed.regions) region.quotaAvailable = 24;
  await savePlanArtifact(session, f.plan, observed);
  await saveAzureTerraformOutcome(session, await f.run());
  const loaders = {
      loadSource: async (_digest: string) => structuredClone(f.plan),
      loadOutcome: async (plan: typeof f.plan) => loadAzureTerraformOutcome(session, plan),
    },
    site = { siteUid: 'fixture-original-site', siteConfigurationSha256: 'e'.repeat(64) };
  const collect = () =>
    readAzureTerraformNetworkAllOriginalCustody(
      f.plan,
      session,
      f.storage,
      f.terraform as Parameters<typeof readAzureTerraformNetworkAllOriginalCustody>[3],
      loaders,
      site,
      async () => {
        throw Error('Unexpected staged network operational verifier');
      },
    );
  return {
    ...f,
    session,
    loaders,
    collect,
    close: async () => {
      await f.close();
      await rm(publicDirectory, { recursive: true });
    },
  };
}
test('complete original native custody qualifies genuine empty public-request custody while residual receipts remain unknown', async () => {
  const f = await fixture(true);
  try {
    const initial = await f.collect();
    expect(initial.sharedMain.originalDeploymentJournalsQualified).toBe(true);
    expect(initial.sharedMain.allNativeReceiptsAccounted).toBe(true);
    expect(initial.sharedMain.unstagedRequestAbsenceQualified).toBe(true);
    const collect = () =>
      prepareAzureTerraformNetworkAllRetirementCustody(
        f.plan,
        f.session,
        f.storage,
        f.terraform as Parameters<typeof prepareAzureTerraformNetworkAllRetirementCustody>[3],
        f.loaders,
        { siteUid: 'fixture-original-site', siteConfigurationSha256: 'e'.repeat(64) },
        async () => {
          throw Error('Unexpected staged operational verifier');
        },
      );
    const commands = [...f.commands],
      result = await collect();
    expect(result.allPublicRequestCustodyQualified).toBe(true);
    expect(result.unqualifiedPublicRequestRows).toHaveLength(0);
    expect(result.parentRetirementQualified).toBe(false);
    expect(result.childRetirementQualified).toBe(false);
    expect(result.runnerRetirementQualified).toBe(false);
    expect(f.commands).toEqual(commands);
    await f.runner.plan({});
    const after = [...f.commands],
      residual = await collect();
    expect(residual.allPublicRequestCustodyQualified).toBe(false);
    expect(residual.parentRetirementQualified).toBe(false);
    expect(f.commands).toEqual(after);
  } finally {
    await f.close();
  }
}, 300000);
