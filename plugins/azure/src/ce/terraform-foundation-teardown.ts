import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CePlatformDrainPlan } from '../../../platform/src/ce/platform-drain';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { Deployment, PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
import type { AzExecApi } from '../az/exec';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { runAzureTerraformCloudTeardown } from './terraform-cloud-teardown';
import { observeAzureTerraformDestroyBoundary } from './terraform-destroy-ownership';
import { azureTerraformFoundationDeployment } from './terraform-foundation';
import { beginAzureTerraformRetirement } from './terraform-retirement';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const hash = (v: string | Uint8Array) => createHash('sha256').update(v).digest('hex');
const sha = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('Malformed Azure foundation retirement evidence');
  return v as Record<string, unknown>;
};
const checkpointName = 'azure-terraform-foundation-teardown-checkpoint.json';
const receiptName = 'azure-terraform-foundation-teardown-receipt.json';
async function optional(store: CeDeploymentStore, name: string) {
  try {
    return await store.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
export interface AzureFoundationTeardownPlan {
  schemaVersion: 1;
  kind: 'azure-ce-terraform-foundation-teardown';
  engine: 'terraform';
  sourcePlanSha256: string;
  source: { terraformVersion: string; configurationSha256: string; manifestSha256: string };
  drain: CePlatformDrainPlan;
  retirement: [];
  planId: string;
  planSha256: string;
}
async function deployment(base: AzureCePlan, version: string): Promise<Deployment> {
  // Historical 1.16.1 is admitted only for retirement of its exact frozen foundation.
  if (!['1.16.1', '1.16.5'].includes(version)) throw Error('Azure foundation retirement runtime is unqualified');
  const value = await azureTerraformFoundationDeployment(base);
  const config = JSON.parse(value.configuration);
  config.terraform.required_version = `= ${version}`;
  return { ...value, terraformVersion: version, configuration: JSON.stringify(config) };
}
const manifest = ({ configuration, providerLock, ...identity }: Deployment) => ({
  ...identity,
  configurationSha256: hash(configuration),
  providerLockSha256: hash(providerLock),
});
const emptyConfiguration = (value: Deployment) => {
  const config = JSON.parse(value.configuration);
  return JSON.stringify({ terraform: config.terraform, provider: config.provider });
};
async function privateManifest(store: CeDeploymentStore, name: string) {
  await store.verify();
  const directory = join(store.directory, name);
  const dir = await lstat(directory);
  if (
    !dir.isDirectory() ||
    dir.isSymbolicLink() ||
    dir.uid !== process.getuid?.() ||
    (await realpath(directory)) !== directory
  )
    throw Error('Azure foundation workspace ownership differs');
  const file = join(directory, 'deployment.json');
  const stat = await lstat(file);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    stat.uid !== process.getuid?.() ||
    stat.mode & 0o077
  )
    throw Error('Azure foundation manifest ownership differs');
  return object(JSON.parse(await readFile(file, 'utf8')));
}
async function journal(base: AzureCePlan, store: CeDeploymentStore) {
  verifyAzureCePlan(base);
  await store.verify();
  if (
    base.engine !== 'terraform' ||
    base.intent.operation !== 'deploy' ||
    canonicalSha256(store.owner) !== canonicalSha256(azureUpgradeBinding(base).owner)
  )
    throw Error('Azure foundation retirement requires the original owning deployment');
  const authorization = object(await store.read(`terraform-authorization-${base.planSha256}.json`));
  const workflow = object(await store.read('terraform-workflow.json'));
  if (
    authorization.schemaVersion !== 1 ||
    authorization.engine !== 'terraform' ||
    authorization.planSha256 !== base.planSha256 ||
    authorization.mutations !== true ||
    workflow.schemaVersion !== 1 ||
    workflow.engine !== 'terraform' ||
    workflow.planSha256 !== base.planSha256 ||
    workflow.stage !== 'network-pending' ||
    !sha(workflow.configurationSha256) ||
    Object.keys(object(workflow.bootstrapByNode)).length ||
    Object.keys(object(workflow.launchedAtByNode)).length
  )
    throw Error('Azure foundation retirement requires exact pre-admission authorization and journal');
  const allowed = new Set([
    'owner.json',
    base.deploymentName,
    `terraform-authorization-${base.planSha256}.json`,
    'terraform-workflow.json',
    'terraform-foundation-plan.json',
    'azure-terraform-lifecycle-retirement.json',
    'azure-terraform-cloud-destroy-plan.json',
    'azure-terraform-cloud-destroy-final.json',
    'azure-terraform-cloud-destroy-reconciliation.json',
    checkpointName,
    receiptName,
  ]);
  for (const entry of await readdir(store.directory, { withFileTypes: true })) {
    if (allowed.has(entry.name)) {
      if (entry.name !== base.deploymentName && !entry.isFile()) throw Error('Azure retirement journal type differs');
      continue;
    }
    if (/^azure-ce-foundation-teardown-[a-f0-9]{24}(?:-authorization)?\.json$/.test(entry.name) && entry.isFile())
      continue;
    if (entry.name === '.azure-terraform-lifecycle-lock' && entry.isDirectory()) continue;
    throw Error('Azure admission or another lifecycle has started; explicit platform retirement is required');
  }
  return workflow;
}
function requireAbsence(
  value: Awaited<ReturnType<CeRuntime['unregisteredAbsence']>>,
  base: AzureCePlan,
  runtime: CeRuntime,
  contract: VerifiedIngressContract,
) {
  const at = Date.parse(value.observedAt);
  if (
    value.status !== 'absent' ||
    canonicalSha256(value.owner) !== canonicalSha256(azureUpgradeBinding(base).owner) ||
    value.siteContractFingerprint !== runtime.contract.fingerprint ||
    value.ingressContractFingerprint !== contract.fingerprint ||
    !Number.isFinite(at) ||
    at > Date.now() ||
    Date.now() - at > 60_000
  )
    throw Error('Fresh unregistered Azure platform absence is unavailable');
  return value;
}
function compile(base: AzureCePlan, source: AzureFoundationTeardownPlan['source'], site: string, ingress: string) {
  verifyAzureCePlan(base);
  if (
    base.engine !== 'terraform' ||
    !sha(source.configurationSha256) ||
    !sha(source.manifestSha256) ||
    !/^sha256:[a-f0-9]{64}$/.test(site) ||
    !/^sha256:[a-f0-9]{64}$/.test(ingress)
  )
    throw Error('Azure foundation teardown source or contract differs');
  const draft = {
    schemaVersion: 1 as const,
    kind: 'azure-ce-terraform-foundation-teardown' as const,
    engine: 'terraform' as const,
    sourcePlanSha256: base.planSha256,
    source: structuredClone(source),
    drain: {
      schemaVersion: 1 as const,
      owner: azureUpgradeBinding(base).owner,
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
  return { ...draft, planId: `azure-ce-foundation-teardown-${planSha256.slice(0, 24)}`, planSha256 };
}
export async function prepareAzureFoundationTeardown(
  base: AzureCePlan,
  runtime: CeRuntime,
  contract: VerifiedIngressContract,
  store: CeDeploymentStore,
  signal?: AbortSignal,
): Promise<AzureFoundationTeardownPlan> {
  signal?.throwIfAborted();
  if (runtime.engine !== 'terraform') throw Error('Azure foundation teardown runtime engine differs');
  const workflow = await journal(base, store);
  const actual = await privateManifest(store, base.deploymentName);
  const expected = manifest(await deployment(base, String(actual.terraformVersion)));
  if (
    canonicalSha256(actual) !== canonicalSha256(expected) ||
    workflow.configurationSha256 !== expected.configurationSha256
  )
    throw Error('Azure foundation source manifest or configuration differs');
  const source = {
    terraformVersion: String(actual.terraformVersion),
    configurationSha256: expected.configurationSha256,
    manifestSha256: canonicalSha256(expected),
  };
  const plan = compile(base, source, runtime.contract.fingerprint, contract.fingerprint);
  for (let i = 0; i < 2; i++) {
    signal?.throwIfAborted();
    requireAbsence(
      await runtime.unregisteredAbsence([azureUpgradeBinding(base)], ['default'], contract, signal),
      base,
      runtime,
      contract,
    );
  }
  await journal(base, store);
  if (canonicalSha256(await privateManifest(store, base.deploymentName)) !== source.manifestSha256)
    throw Error('Azure foundation source changed during preparation');
  await store.write(`${plan.planId}.json`, plan);
  return plan;
}
/** Reconstruct only the source-bound pre-admission configuration; never rewrite the frozen manifest. */
export async function azureFoundationTeardownDeployment(base: AzureCePlan, plan: AzureFoundationTeardownPlan) {
  const value = await deployment(base, plan.source.terraformVersion);
  if (
    hash(value.configuration) !== plan.source.configurationSha256 ||
    canonicalSha256(manifest(value)) !== plan.source.manifestSha256
  )
    throw Error('Azure foundation teardown source deployment differs');
  return value;
}
interface Checkpoint {
  schemaVersion: 1;
  sourcePlanSha256: string;
  teardownPlanSha256: string;
  phase: 'cloud-pending' | 'cloud-retired' | 'retiring' | 'retired';
  emptyEvidenceSha256?: string;
  finalPlan?: PlanReceipt;
  retirementEvidenceSha256?: string;
  artifacts?: unknown;
}
export async function runAzureFoundationTeardown(
  base: AzureCePlan,
  input: AzureFoundationTeardownPlan,
  authorized: string,
  runtime: CeRuntime,
  contract: VerifiedIngressContract,
  session: TerraformSession,
  store: CeDeploymentStore,
  api: AzExecApi,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
) {
  base = structuredClone(base);
  input = structuredClone(input);
  env = { ...env };
  const sourceDeployment = await azureFoundationTeardownDeployment(base, input);
  const empty = emptyConfiguration(sourceDeployment);
  let checkpoint = (await optional(store, checkpointName)) as Checkpoint | undefined;
  const validFinal = (final: PlanReceipt | undefined) =>
    !!final &&
    final.schemaVersion === 1 &&
    final.engine === 'terraform' &&
    final.noChanges === true &&
    Array.isArray(final.changes) &&
    final.changes.length === 0 &&
    !final.operation &&
    !final.actionInvocations &&
    !final.imports &&
    !final.relinquishments &&
    final.deploymentId === base.deploymentName &&
    final.backendIdentity === `local:${base.deploymentName}` &&
    final.configurationSha256 === hash(empty) &&
    final.providerLockSha256 === hash(sourceDeployment.providerLock) &&
    sha(final.planSha256);
  if (
    checkpoint &&
    (checkpoint.schemaVersion !== 1 ||
      checkpoint.sourcePlanSha256 !== base.planSha256 ||
      checkpoint.teardownPlanSha256 !== input.planSha256 ||
      !['cloud-pending', 'cloud-retired', 'retiring', 'retired'].includes(checkpoint.phase) ||
      (checkpoint.phase !== 'cloud-pending' && !sha(checkpoint.emptyEvidenceSha256)) ||
      (['retiring', 'retired'].includes(checkpoint.phase) &&
        (!validFinal(checkpoint.finalPlan) || !sha(checkpoint.retirementEvidenceSha256))))
  )
    throw Error('Azure foundation teardown checkpoint differs');
  const validate = async () => {
    signal?.throwIfAborted();
    await journal(base, store);
    if (
      runtime.engine !== 'terraform' ||
      authorized !== input.planSha256 ||
      canonicalSha256(input) !==
        canonicalSha256(compile(base, input.source, runtime.contract.fingerprint, contract.fingerprint)) ||
      canonicalSha256(await store.read(`${input.planId}.json`)) !== canonicalSha256(input)
    )
      throw Error('Azure foundation teardown immutable authorization or contract differs');
    const actual = await privateManifest(store, base.deploymentName);
    if (
      canonicalSha256(actual) !== canonicalSha256(manifest(sourceDeployment)) &&
      !(
        checkpoint &&
        checkpoint.phase !== 'cloud-pending' &&
        canonicalSha256(actual) === canonicalSha256(manifest({ ...sourceDeployment, configuration: empty }))
      )
    )
      throw Error('Azure foundation teardown current manifest differs');
  };
  const fresh = async (mustBeAbsent: boolean) => {
    await validate();
    const platform = requireAbsence(
      await runtime.unregisteredAbsence([azureUpgradeBinding(base)], ['default'], contract, signal),
      base,
      runtime,
      contract,
    );
    const cloud = await observeAzureTerraformDestroyBoundary(base, api, signal);
    if (mustBeAbsent && cloud.status !== 'absent') throw Error('Azure foundation cloud absence has not converged');
    return { platform, cloud };
  };
  await validate();
  await fresh(checkpoint !== undefined && checkpoint.phase !== 'cloud-pending');
  await beginAzureTerraformRetirement(base, input, store);
  if (!checkpoint) {
    checkpoint = {
      schemaVersion: 1,
      sourcePlanSha256: base.planSha256,
      teardownPlanSha256: input.planSha256,
      phase: 'cloud-pending',
    };
    await store.write(checkpointName, checkpoint);
  }
  if (checkpoint.phase === 'cloud-pending') {
    await runAzureTerraformCloudTeardown(base, session, store, api, env, signal);
    const absence = await fresh(true);
    checkpoint.phase = 'cloud-retired';
    checkpoint.emptyEvidenceSha256 = canonicalSha256(absence);
    await store.write(checkpointName, checkpoint);
  }
  if (checkpoint.phase === 'cloud-retired') {
    if (!session.cancelUnsubmittedPlan || !session.retireArtifacts || !sha(checkpoint.emptyEvidenceSha256))
      throw Error('Azure owning runner cancellation or retirement service is unavailable');
    await fresh(true);
    const destroy = (await store.read('azure-terraform-cloud-destroy-final.json')) as PlanReceipt;
    if (
      !destroy.noChanges ||
      destroy.operation !== 'destroy' ||
      destroy.changes.length ||
      destroy.deploymentId !== base.deploymentName ||
      destroy.backendIdentity !== `local:${base.deploymentName}`
    )
      throw Error('Azure foundation final destroy receipt differs');
    await session.cancelUnsubmittedPlan(
      destroy,
      input.source.configurationSha256,
      empty,
      checkpoint.emptyEvidenceSha256,
    );
    const final = await session.plan(env, signal);
    if (!validFinal(final)) throw Error('Azure foundation final refresh-enabled empty plan differs');
    const absence = await fresh(true);
    checkpoint.finalPlan = final;
    checkpoint.retirementEvidenceSha256 = canonicalSha256(absence);
    checkpoint.phase = 'retiring';
    await store.write(checkpointName, checkpoint);
  }
  if (checkpoint.phase === 'retiring') {
    await fresh(true);
    if (!session.retireArtifacts || !checkpoint.finalPlan || !sha(checkpoint.retirementEvidenceSha256))
      throw Error('Azure foundation terminal retirement evidence is incomplete');
    checkpoint.artifacts = await session.retireArtifacts(
      checkpoint.finalPlan,
      checkpoint.retirementEvidenceSha256,
      env,
      signal,
    );
    checkpoint.phase = 'retired';
    await store.write(checkpointName, checkpoint);
  }
  await fresh(true);
  if (!checkpoint.finalPlan || !checkpoint.artifacts || !sha(checkpoint.retirementEvidenceSha256))
    throw Error('Azure foundation terminal receipt is incomplete');
  const artifacts = object(checkpoint.artifacts);
  if (
    artifacts.status !== 'runner-artifacts-retired' ||
    artifacts.manifestSha256 !== canonicalSha256(manifest({ ...sourceDeployment, configuration: empty })) ||
    artifacts.evidenceSha256 !== checkpoint.retirementEvidenceSha256 ||
    artifacts.finalPlanSha256 !== checkpoint.finalPlan.planSha256 ||
    !sha(artifacts.inventorySha256) ||
    !Number.isSafeInteger(artifacts.retiredArtifacts) ||
    Number(artifacts.retiredArtifacts) < 0
  )
    throw Error('Azure foundation artifact retirement receipt differs');
  const receipt = {
    status: 'deployment-artifacts-retired' as const,
    sourcePlanSha256: base.planSha256,
    teardownPlanSha256: input.planSha256,
    finalPlanSha256: checkpoint.finalPlan.planSha256,
    artifacts: checkpoint.artifacts,
    cloud: 'absent' as const,
    platform: 'absent' as const,
  };
  await store.write(receiptName, receipt);
  return receipt;
}
