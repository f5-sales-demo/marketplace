import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type SessionManagerLike, savePlanArtifact } from '../../src/ce/artifacts';
import { compileAzureCePlan } from '../../src/ce/planner';
import { compileAzureTerraformNetworkUpdatePlan } from '../../src/ce/terraform-network-plan';
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
test('original native receipt accounting proves genuine absence when no network request, outcome, packet or child is staged', async () => {
  const f = await fixture();
  try {
    const commands = [...f.commands],
      result = await f.collect();
    expect(result.lineage.rows).toHaveLength(0);
    expect(result.rows).toHaveLength(0);
    expect(result.sharedMain.status).toBe('complete');
    expect(result.sharedMain.originalDeploymentJournalsQualified).toBe(true);
    expect(result.sharedMain.allNativeReceiptsAccounted).toBe(true);
    expect(result.sharedMain.unstagedRequestAbsenceQualified).toBe(true);
    expect(result.parentRetirementQualified).toBe(false);
    expect(f.commands).toEqual(commands);
  } finally {
    await f.close();
  }
}, 180000);

test('one real public Terraform network plan without execution or outcome proves absence from complete original native custody', async () => {
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
    const input = structuredClone(f.plan.intent);
    input.operation = 'update-network';
    input.nics[1].subnet = { mode: 'greenfield', name: 'updated-sli', cidr: '10.20.2.0/24' };
    const plan = compileAzureTerraformNetworkUpdatePlan(compileAzureCePlan(input, current), f.plan, f.plan);
    await savePlanArtifact(f.session, plan, current);
    f.loaders.loadSource = async (digest) => structuredClone(digest === plan.planSha256 ? plan : f.plan);
    const commands = [...f.commands],
      result = await f.collect();
    expect(result.lineage.rows).toHaveLength(1);
    expect(result.lineage.rows[0].execution).toBe('unstaged-no-outcome');
    expect(result.sharedMain.originalDeploymentJournalsQualified).toBe(true);
    expect(result.sharedMain.allNativeReceiptsAccounted).toBe(true);
    expect(result.sharedMain.unstagedRequestAbsenceQualified).toBe(true);
    expect(result.parentRetirementQualified).toBe(false);
    expect(f.commands).toEqual(commands);
    const load = f.loaders.loadOutcome;
    f.loaders.loadOutcome = async (request) =>
      request.planSha256 === plan.planSha256
        ? { engine: 'terraform', planId: plan.planId, planSha256: plan.planSha256, status: 'interrupted' }
        : load(request);
    const present = await f.collect();
    expect(present.lineage.rows[0].execution).toBe('unstaged-outcome-present');
    expect(present.sharedMain.unstagedRequestAbsenceQualified).toBe(false);
    expect(f.commands).toEqual(commands);
  } finally {
    await f.close();
  }
}, 180000);
