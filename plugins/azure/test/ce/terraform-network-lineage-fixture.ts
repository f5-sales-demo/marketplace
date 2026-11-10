import {
  type CleanupRequest,
  encode,
  hash,
  type IndependentCleanupEvidence,
} from '../../../terraform/src/cleanup-verifier-worker';
import { type SessionManagerLike, savePlanArtifact } from '../../src/ce/artifacts';
import { captureAzureNetworkUpdateInventory } from '../../src/ce/network-update';
import { compileAzureCePlan } from '../../src/ce/planner';
import { readAzureTerraformNetworkCompletionHistory } from '../../src/ce/terraform-network-completion-history';
import { readAzureTerraformNetworkMainRunnerHistory } from '../../src/ce/terraform-network-main-runner-history';
import { compileAzureTerraformNetworkUpdatePlan } from '../../src/ce/terraform-network-plan';
import {
  readAzureTerraformNetworkRetirementLineage,
  recheckAzureTerraformNetworkRetirementLineage,
} from '../../src/ce/terraform-network-retirement-lineage';
import { terraformNetworkSerialPowerFixture } from './terraform-network-driver-power-runner-fixture';
import { terraformNetworkMainRunnerFixture } from './terraform-network-main-runner-fixture';
import { terraformNetworkSourceFixture } from './terraform-network-source-fixture';

export async function terraformNetworkLineageFixture(ha = false, generations = 2, signal?: AbortSignal) {
  if (!Number.isInteger(generations) || generations < 2 || generations > 3)
    throw Error('fixture generation count differs');
  const birth = await terraformNetworkSourceFixture(ha);
  const plan = compileAzureTerraformNetworkUpdatePlan(birth.plan, birth.original);
  const sources = new Map(birth.sources);
  sources.set(plan.planSha256, plan);
  const seed = {
    plan,
    inventory: await captureAzureNetworkUpdateInventory(plan, birth.api),
    source: birth.source,
    sources,
    outcomes: birth.outcomes,
  };
  const firstDriver = await terraformNetworkSerialPowerFixture(
    ha,
    async (request) => lineageCleanupEvidence(request, '1.17.1'),
    seed,
  );
  await firstDriver.run(signal);
  const first = await terraformNetworkMainRunnerFixture(ha, seed, firstDriver, false);
  const completed = await readAzureTerraformNetworkCompletionHistory(
    plan,
    first.store,
    first.loaders,
    first.dependencies.qualifyAcceptance,
  );
  const plans = [plan],
    drivers = [firstDriver],
    mains = [first],
    histories = [completed];
  for (let i = 1; i < generations; i++) {
    const previous = plans[i - 1],
      history = histories[i - 1];
    const draft =
      i % 2 === 1
        ? compileAzureCePlan({ ...birth.original.intent, operation: 'update-network' }, birth.current)
        : birth.plan;
    const next = compileAzureTerraformNetworkUpdatePlan(draft, previous, birth.original);
    sources.set(next.planSha256, next);
    const inventory = structuredClone(history.inventory);
    inventory.planSha256 = next.planSha256;
    for (const vm of Object.values(inventory.nodes))
      for (const [index, nic] of Object.entries(vm.nics)) {
        const desired = next.nics[Number(index)].subnet;
        nic.targetSubnetId = `${birth.vnet.id}/subnets/${desired.name}`;
        nic.targetSubnetCidr = desired.cidr as string;
      }
    const nextSeed = { ...seed, plan: next, inventory, source: history.finalSource, store: first.store };
    const driver = await terraformNetworkSerialPowerFixture(
      ha,
      async (request) => lineageCleanupEvidence(request, '1.17.1'),
      nextSeed,
    );
    await driver.run(signal);
    const main = await terraformNetworkMainRunnerFixture(ha, nextSeed, driver, false, mains[i - 1]);
    const completed = await readAzureTerraformNetworkCompletionHistory(
      next,
      first.store,
      first.loaders,
      first.dependencies.qualifyAcceptance,
    );
    plans.push(next);
    drivers.push(driver);
    mains.push(main);
    histories.push(completed);
  }
  const next = plans[1],
    second = mains[mains.length - 1];
  const future = compileAzureTerraformNetworkUpdatePlan(birth.plan, plans[plans.length - 1], birth.original);
  sources.set(future.planSha256, future);
  first.loaders.loadOutcome = async (request) => {
    const outcome = birth.outcomes.get(request.planSha256);
    if (outcome === undefined) throw Object.assign(Error('explicit synthetic outcome absence'), { code: 'ENOENT' });
    return outcome;
  };
  const publicSession: SessionManagerLike = {
    getSessionId: () => `${first.store.directory}-lineage-public`,
    getArtifactsDir: () => null,
    getArtifactPath: async () => null,
    saveArtifact: async () => undefined,
  };
  for (const p of [birth.original, ...plans, future]) await savePlanArtifact(publicSession, p, birth.current);
  const read = (signal?: AbortSignal) =>
    readAzureTerraformNetworkRetirementLineage(
      birth.original,
      publicSession,
      first.store,
      first.loaders,
      first.site,
      first.dependencies.qualifyAcceptance,
      signal,
    );
  const recheck = (witness: unknown, signal?: AbortSignal) =>
    recheckAzureTerraformNetworkRetirementLineage(
      witness,
      plan,
      first.store,
      first.loaders,
      first.site,
      first.dependencies.qualifyAcceptance,
      signal,
    );
  const main = (witness?: unknown) =>
    readAzureTerraformNetworkMainRunnerHistory(
      plan,
      first.store,
      second.service,
      first.loaders,
      first.site,
      first.dependencies.qualifyAcceptance,
      undefined,
      undefined,
      witness,
    );
  return {
    birth,
    first,
    second,
    plan,
    next,
    future,
    sources,
    publicSession,
    read,
    recheck,
    main,
    plans,
    drivers,
    mains,
    histories,
    seed,
  };
}
export function lineageCleanupEvidence(request: CleanupRequest, version: string): IndependentCleanupEvidence {
  return {
    schemaVersion: 1,
    status: 'independently-verified',
    nonce: request.nonce,
    requestSha256: hash(encode(request)),
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    executorPid: process.pid + 1,
    parentPid: process.pid,
    manifestSha256: request.manifestSha256,
    evidenceSha256: request.evidenceSha256,
    finalPlanSha256: request.finalPlanSha256,
    planReceiptSha256: request.planReceiptSha256,
    inputInventorySha256: hash(encode(request.inputs)),
    terraformExecutableSha256: request.terraform.sha256,
    terraformExecutablePathSha256: hash(request.terraform.path),
    interpreterSha256: request.interpreter.sha256,
    workerSha256: request.workerSha256,
    terraformVersion: version,
    stateJsonSha256: 'a'.repeat(64),
    originalPlanJsonSha256: 'b'.repeat(64),
    refreshedPlanSha256: 'c'.repeat(64),
    refreshedPlanJsonSha256: 'd'.repeat(64),
    commands: [
      ['version', '-json'],
      ['show', '-json', 'saved.tfplan'],
      ['show', '-json'],
      [
        'plan',
        '-input=false',
        '-lock=true',
        '-lock-timeout=60s',
        '-refresh=true',
        `-out=independent-cleanup-${request.nonce}.tfplan`,
      ],
      ['show', '-json', `independent-cleanup-${request.nonce}.tfplan`],
    ],
  };
}
