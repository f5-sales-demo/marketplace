import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type SessionManagerLike, savePlanArtifact } from '../../src/ce/artifacts';
import { compileAzureCePlan } from '../../src/ce/planner';
import { prepareAzureTerraformNetworkAllRetirementCustody } from '../../src/ce/terraform-network-all-retirement-custody';
import { compileAzureTerraformNetworkUpdatePlan } from '../../src/ce/terraform-network-plan';
import { compileAzureTerraformNetworkReplacementPlan } from '../../src/ce/terraform-network-replacement-plan';
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
test('planned network and selected-node replacement without outcomes or packets require exhaustive original native custody for absence', async () => {
  const f = await fixture(true);
  try {
    const current = structuredClone(observation);
    for (const region of current.regions) region.quotaAvailable = 24;
    current.resources = [];
    for (const action of f.plan.actions.filter((a) => a.kind === 'vm-create' || a.kind === 'nic-create')) {
      if (!action.resourceId) throw Error('actual original resource identity required');
      const raw = await f.api.exec('az', [
        action.kind === 'vm-create' ? 'vm' : 'network',
        ...(action.kind === 'vm-create' ? ['show'] : ['nic', 'show']),
        '--ids',
        action.resourceId,
        '--output',
        'json',
      ]);
      expect(raw.exitCode).toBe(0);
      const value = JSON.parse(raw.stdout);
      current.resources.push({
        id: action.resourceId,
        exists: true,
        owned: true,
        location: f.plan.region,
        tags: value.tags,
        state: { provisioningState: value.provisioningState },
      });
    }
    const update = structuredClone(f.plan.intent);
    update.operation = 'update-network';
    update.nics[1].subnet = { mode: 'greenfield', name: 'updated-sli', cidr: '10.20.2.0/24' };
    const network = compileAzureTerraformNetworkUpdatePlan(compileAzureCePlan(update, current), f.plan, f.plan);
    const input = structuredClone(update);
    input.operation = 'replace-node';
    input.replacementNode = 1;
    const replacement = compileAzureTerraformNetworkReplacementPlan(
      compileAzureCePlan(input, current),
      network,
      f.plan,
    );
    await savePlanArtifact(f.session, network, current);
    await savePlanArtifact(f.session, replacement, current);
    const sources = new Map([f.plan, network, replacement].map((p) => [p.planSha256, p]));
    f.loaders.loadSource = async (digest) => {
      const p = sources.get(digest);
      if (!p) throw Error('Unknown planned source');
      return structuredClone(p);
    };
    const commands = [...f.commands],
      result = await f.collect();
    expect(result.lineage.rows).toHaveLength(2);
    expect(result.lineage.rows.every((row) => row.execution === 'unstaged-no-outcome')).toBe(true);
    expect(result.sharedMain.originalDeploymentJournalsQualified).toBe(true);
    expect(result.sharedMain.allNativeReceiptsAccounted).toBe(true);
    expect(result.sharedMain.unstagedRequestAbsenceQualified).toBe(true);
    expect(result.allPublicRequestCustodyQualified).toBe(true);
    const prepared = await prepareAzureTerraformNetworkAllRetirementCustody(
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
    expect(prepared.allPublicRequestCustodyQualified).toBe(true);
    expect(prepared.unqualifiedPublicRequestRows).toHaveLength(0);
    expect(prepared.parentRetirementQualified).toBe(false);
    expect(result.parentRetirementQualified).toBe(false);
    expect(f.commands).toEqual(commands);
    const packetName = `${replacement.planId}-terraform-network-replacement-source.json`;
    await f.storage.write(packetName, { foreign: true });
    const packets = await f.collect();
    expect(packets.lineage.rows.find((row) => row.kind === 'node-replacement')?.execution).toBe(
      'unqualified-replacement',
    );
    expect(packets.sharedMain.unstagedRequestAbsenceQualified).toBe(false);
    await f.storage.remove(packetName);
    const childRoot = join(f.storage.directory, 'terraform-stages'),
      child = join(childRoot, `network-${replacement.planSha256.slice(0, 24)}-quiesce`);
    await mkdir(child, { recursive: true, mode: 0o700 });
    const children = await f.collect();
    expect(children.lineage.rows.find((row) => row.kind === 'node-replacement')?.execution).toBe(
      'unqualified-replacement',
    );
    expect(children.sharedMain.unstagedRequestAbsenceQualified).toBe(false);
    await rm(child, { recursive: true });
    await rm(childRoot, { recursive: true });
    const loadOutcome = f.loaders.loadOutcome;
    f.loaders.loadOutcome = async (request) => {
      if (request.planSha256 === replacement.planSha256)
        throw Object.assign(Error('unknown authorization'), { code: 'EACCES' });
      return loadOutcome(request);
    };
    await expect(f.collect()).rejects.toThrow('unknown authorization');
    f.loaders.loadOutcome = loadOutcome;
    let introduced = false;
    f.loaders.loadOutcome = async (request) => {
      try {
        return await loadOutcome(request);
      } catch (error) {
        if (request.planSha256 === replacement.planSha256 && !introduced) {
          introduced = true;
          await f.storage.write(packetName, { late: true });
        }
        throw error;
      }
    };
    await expect(f.collect()).rejects.toThrow();
    expect(introduced).toBe(true);
    f.loaders.loadOutcome = loadOutcome;
    await f.storage.remove(packetName);
    const unrelated = await f.runner.plan({});
    const afterCommands = [...f.commands],
      residual = await f.collect();
    expect(residual.lineage.rows.every((row) => row.execution === 'unstaged-no-outcome')).toBe(true);
    expect(residual.sharedMain.allNativeReceiptsAccounted).toBe(false);
    expect(residual.sharedMain.unstagedRequestAbsenceQualified).toBe(false);
    expect(residual.allPublicRequestCustodyQualified).toBe(false);
    expect(
      residual.sharedMain.rows.some(
        (row) => row.savedPlanSha256 === unrelated.planSha256 && row.provenance === 'unaccounted-receipt',
      ),
    ).toBe(true);
    expect(f.commands).toEqual(afterCommands);
  } finally {
    await f.close();
  }
}, 180000);
