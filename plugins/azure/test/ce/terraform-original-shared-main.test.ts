import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type SessionManagerLike, savePlanArtifact } from '../../src/ce/artifacts';
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
      loadSource: async () => structuredClone(f.plan),
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
test('actual public artifacts plus native original journals are fully accounted without authorizing parent or current operations', async () => {
  const f = await fixture();
  try {
    const commands = [...f.commands],
      result = await f.collect();
    expect(result.sharedMain.status).toBe('complete');
    expect(result.sharedMain.originalRows).toHaveLength(2);
    expect(result.sharedMain.originalDeploymentJournalsQualified).toBe(true);
    expect(result.sharedMain.allNativeReceiptsAccounted).toBe(true);
    expect(
      result.sharedMain.rows
        .filter((row) => row.receiptSha256)
        .every((row) => row.provenance === 'authenticated-execution-receipt'),
    ).toBe(true);
    expect(result.allPublicRequestCustodyQualified).toBe(true);
    expect(result.parentRetirementQualified).toBe(false);
    expect(result.currentOperationalAcceptanceQualified).toBe(false);
    expect(f.commands).toEqual(commands);
  } finally {
    await f.close();
  }
});
test('final collector public outcome callback cannot conceal changed original descriptor bytes', async () => {
  const f = await fixture();
  try {
    const load = f.loaders.loadOutcome;
    let calls = 0;
    f.loaders.loadOutcome = async (plan) => {
      const value = await load(plan);
      if (++calls === 3) {
        const names = await import('node:fs/promises').then((fs) =>
            fs.readdir(join(f.storage.directory, 'terraform-original-deployment-receipts')),
          ),
          path = join(f.storage.directory, 'terraform-original-deployment-receipts', names.sort()[0]);
        await writeFile(path, Buffer.concat([Buffer.from(' '), await readFile(path)]), { mode: 0o600 });
      }
      return value;
    };
    await expect(f.collect()).rejects.toThrow();
  } finally {
    await f.close();
  }
});

test('three-node six-interface original native receipts join exact public outcomes in shared-main accounting', async () => {
  const f = await fixture(true);
  try {
    const result = await f.collect();
    expect(result.sharedMain.originalRows).toHaveLength(4);
    expect(result.sharedMain.originalDeploymentJournalsQualified).toBe(true);
    expect(result.sharedMain.allNativeReceiptsAccounted).toBe(true);
    expect(f.plan.nics.map((row) => row.role)).toEqual(['slo', 'sli']);
    expect(result.parentRetirementQualified).toBe(false);
  } finally {
    await f.close();
  }
});
test('unrelated genuine native no-change receipt remains unaccounted despite identical original configuration', async () => {
  const f = await fixture();
  try {
    const unrelated = await f.runner.plan({}),
      commands = [...f.commands],
      result = await f.collect();
    expect(result.sharedMain.originalDeploymentJournalsQualified).toBe(true);
    expect(result.sharedMain.allNativeReceiptsAccounted).toBe(false);
    expect(
      result.sharedMain.rows.some(
        (row) => row.savedPlanSha256 === unrelated.planSha256 && row.provenance === 'unaccounted-receipt',
      ),
    ).toBe(true);
    expect(result.parentRetirementQualified).toBe(false);
    expect(f.commands).toEqual(commands);
  } finally {
    await f.close();
  }
});
