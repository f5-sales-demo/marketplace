import { readdir } from 'node:fs/promises';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CePlatformDrainPlan } from '../../../platform/src/ce/platform-drain';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { TerraformSession } from '../../../terraform/src/service';
import type { AwsExecApi } from '../aws/exec';
import { verifyAwsCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { collectAwsTerraformAbsence } from './terraform-absence';
import { runAwsTerraformCloudTeardown } from './terraform-cloud-teardown';
import type { AwsTerraformRetirementInventory } from './terraform-retirement-inventory';
import { verifyAwsTeardownCredentials } from './terraform-teardown';
import { siteBindings } from './topology';
import type { AwsCePlan } from './types';

export interface AwsFoundationTeardownPlan {
  schemaVersion: 1;
  kind: 'aws-ce-terraform-foundation-teardown';
  engine: 'terraform';
  sourcePlanSha256: string;
  drain: CePlatformDrainPlan;
  retirement: [];
  planId: string;
  planSha256: string;
}
type Observation = Awaited<ReturnType<CeRuntime['unregisteredAbsence']>>;
type Store = Pick<CeDeploymentStore, 'owner' | 'verify' | 'read' | 'write' | 'directory'>;
async function verifyFoundationJournal(base: AwsCePlan, storage: Store) {
  verifyAwsCePlan(base);
  if (
    base.engine !== 'terraform' ||
    base.intent.operation !== 'deploy' ||
    canonicalSha256(storage.owner) !== canonicalSha256(siteBindings(base)[0].binding.owner)
  )
    throw new Error('Foundation teardown engine or owner differs');
  await storage.verify();
  const auth = (await storage.read('terraform-authorization.json')) as Record<string, unknown>;
  const workflow = (await storage.read('terraform-workflow.json')) as Record<string, unknown>;
  if (
    auth?.schemaVersion !== 1 ||
    auth.engine !== 'terraform' ||
    auth.planSha256 !== base.planSha256 ||
    auth.mutations !== true ||
    auth.f5StateOwner !== 'terraform' ||
    !workflow ||
    workflow.schemaVersion !== 1 ||
    workflow.engine !== 'terraform' ||
    workflow.planSha256 !== base.planSha256 ||
    !['network-pending', 'registration-pending'].includes(String(workflow.stage))
  )
    throw new Error('Foundation teardown requires the exact owning pre-admission journal');
  const files = await readdir(storage.directory);
  if (
    files.some((file) =>
      /^(terraform-(admission|site-|registration-|routing-|connect-|direct-|initial-)|ingress-plan-)/.test(file),
    )
  )
    throw new Error('Admission or routing has started; explicit platform retirement is required');
}
function compile(base: AwsCePlan, site: string, ingress: string): AwsFoundationTeardownPlan {
  verifyAwsCePlan(base);
  if (base.engine !== 'terraform' || !site || !ingress) throw new Error('Foundation teardown contract differs');
  const draft = {
    schemaVersion: 1 as const,
    kind: 'aws-ce-terraform-foundation-teardown' as const,
    engine: 'terraform' as const,
    sourcePlanSha256: base.planSha256,
    drain: {
      schemaVersion: 1 as const,
      owner: siteBindings(base)[0].binding.owner,
      sourcePlanSha256: base.planSha256,
      siteContractFingerprint: site,
      ingressContractFingerprint: ingress,
      sites: [],
      listeners: [],
      origins: [],
    },
    retirement: [] as [],
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `aws-ce-foundation-teardown-${planSha256.slice(0, 24)}`, planSha256 };
}
function requireAbsence(receipt: Observation, base: AwsCePlan, site: string, ingress: string) {
  const at = Date.parse(receipt.observedAt);
  if (
    receipt.status !== 'absent' ||
    canonicalSha256(receipt.owner) !== canonicalSha256(siteBindings(base)[0].binding.owner) ||
    receipt.siteContractFingerprint !== site ||
    receipt.ingressContractFingerprint !== ingress ||
    !Number.isFinite(at) ||
    at > Date.now() ||
    Date.now() - at > 60000
  )
    throw new Error('Fresh unregistered platform absence is unavailable');
}
export async function prepareAwsFoundationTeardown(
  base: AwsCePlan,
  runtime: CeRuntime,
  contract: VerifiedIngressContract,
  storage: CeDeploymentStore,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if (runtime.engine !== 'terraform') throw new Error('Foundation teardown runtime engine differs');
  await verifyFoundationJournal(base, storage);
  const plan = compile(base, runtime.contract.fingerprint, contract.fingerprint);
  requireAbsence(
    await runtime.unregisteredAbsence(
      siteBindings(base).map((row) => row.binding),
      ['default'],
      contract,
      signal,
    ),
    base,
    runtime.contract.fingerprint,
    contract.fingerprint,
  );
  await verifyFoundationJournal(base, storage);
  await storage.write(`${plan.planId}.json`, plan);
  return plan;
}
interface Driver {
  engine: 'terraform';
  siteContractFingerprint: string;
  ingressContractFingerprint: string;
  observe(signal?: AbortSignal): Promise<Observation>;
  retireCloud(
    signal?: AbortSignal,
  ): Promise<{ status: 'terraform-state-retired'; sourcePlanSha256: string; finalPlanSha256: string }>;
}
export async function coordinateAwsFoundationTeardown(
  base: AwsCePlan,
  input: AwsFoundationTeardownPlan,
  authorized: string,
  storage: Store,
  driver: Driver,
  signal?: AbortSignal,
) {
  base = structuredClone(base);
  const plan = structuredClone(input);
  const validate = async () => {
    signal?.throwIfAborted();
    await verifyFoundationJournal(base, storage);
    if (
      driver.engine !== 'terraform' ||
      authorized !== plan.planSha256 ||
      canonicalSha256(plan) !==
        canonicalSha256(compile(base, driver.siteContractFingerprint, driver.ingressContractFingerprint))
    )
      throw new Error('Foundation teardown authorization or immutable plan differs');
  };
  await validate();
  requireAbsence(await driver.observe(signal), base, driver.siteContractFingerprint, driver.ingressContractFingerprint);
  await validate();
  const cloud = await driver.retireCloud(signal);
  if (
    cloud.status !== 'terraform-state-retired' ||
    cloud.sourcePlanSha256 !== base.planSha256 ||
    !/^[a-f0-9]{64}$/.test(cloud.finalPlanSha256)
  )
    throw new Error('Foundation cloud retirement has no bound no-change receipt');
  await validate();
  requireAbsence(await driver.observe(signal), base, driver.siteContractFingerprint, driver.ingressContractFingerprint);
  const receipt = {
    status: 'resources-retired-awaiting-inventory' as const,
    owner: storage.owner,
    sourcePlanSha256: base.planSha256,
    planSha256: plan.planSha256,
    finalPlanSha256: cloud.finalPlanSha256,
    cloudInventory: 'unknown' as const,
    observedAt: new Date().toISOString(),
  };
  await storage.write('aws-terraform-foundation-teardown-receipt.json', receipt);
  return receipt;
}
export async function runAwsFoundationTeardown(
  base: AwsCePlan,
  plan: AwsFoundationTeardownPlan,
  authorized: string,
  runtime: CeRuntime,
  contract: VerifiedIngressContract,
  session: TerraformSession,
  storage: CeDeploymentStore,
  api: AwsExecApi,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
) {
  if (runtime.engine !== 'terraform') throw new Error('Foundation teardown runtime engine differs');
  await verifyAwsTeardownCredentials(base, api, signal);
  const retired = await coordinateAwsFoundationTeardown(
    base,
    plan,
    authorized,
    storage,
    {
      engine: 'terraform',
      siteContractFingerprint: runtime.contract.fingerprint,
      ingressContractFingerprint: contract.fingerprint,
      observe: (signal) =>
        runtime.unregisteredAbsence(
          siteBindings(base).map((row) => row.binding),
          ['default'],
          contract,
          signal,
        ),
      retireCloud: (signal) => runAwsTerraformCloudTeardown(base, session, storage, api, env, signal),
    },
    signal,
  );
  const inventory = (await storage.read('terraform-cloud-teardown-inventory.json')) as AwsTerraformRetirementInventory;
  const observation = await collectAwsTerraformAbsence(base, inventory, api, signal);
  await storage.write('aws-terraform-teardown-cloud-absence.json', observation);
  return {
    ...retired,
    status:
      observation.status === 'absent-or-retired'
        ? ('ce-retired-supporting-infrastructure-unverified' as const)
        : ('pending-cloud-inventory' as const),
    cloudInventory: observation.status,
  };
}
