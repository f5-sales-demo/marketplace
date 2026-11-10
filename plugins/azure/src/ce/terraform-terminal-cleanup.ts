import { createHash } from 'node:crypto';
import { lstat, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import { VerifiedUpgradeContract } from '../../../platform/src/ce/upgrade-contract';
import type { ArtifactRetirementReceipt } from '../../../terraform/src/artifact-retirement';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import type { AzExecApi } from '../az/exec';
import { canonicalSha256 } from './canonical';
import { observeAzureTerraformDestroyBoundary } from './terraform-destroy-ownership';
import { azureTerraformCurrentDeployment } from './terraform-foundation';
import { retireAzureTerraformParentArtifacts } from './terraform-parent-retirement';
import type { AzureTerraformTeardownPlan } from './terraform-teardown';
import { azureUpgradeBinding } from './terraform-upgrade';
import { qualifiedAzureTerraformUpgradeStages, retireAzureTerraformUpgradeStage } from './terraform-upgrade-retirement';
import type { AzureCePlan } from './types';

const name = 'azure-terraform-terminal-cleanup.json';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Malformed Azure terminal cleanup');
  return value as Record<string, unknown>;
};
interface Checkpoint {
  schemaVersion: 1;
  sourcePlanSha256: string;
  teardownPlanSha256: string;
  configurationSha256: string;
  emptyConfiguration: string;
  emptyConfigurationSha256: string;
  destroy: PlanReceipt;
  evidence: unknown;
  evidenceSha256: string;
  checkpointSha256: string;
  phase: 'cancelling' | 'planning' | 'retiring' | 'retired';
  final?: PlanReceipt;
  retirementEvidenceSha256?: string;
  artifacts?: ArtifactRetirementReceipt;
}
export async function hasAzureTerraformTerminalCleanup(store: CeDeploymentStore) {
  try {
    await store.read(name);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
/** Runner retirement follows separately observed cloud and platform absence. Parent/bootstrap cleanup is separate. */
export async function finalizeAzureTerraformRunnerCleanup(
  base: AzureCePlan,
  teardown: AzureTerraformTeardownPlan,
  runtime: CeRuntime,
  contract: VerifiedIngressContract,
  session: TerraformSession,
  store: CeDeploymentStore,
  api: AzExecApi,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
  terraform?: CeTerraformService,
) {
  const binding = azureUpgradeBinding(base);
  const deployment = await azureTerraformCurrentDeployment(base);
  const identity = (({ configuration, providerLock, ...rest }) => ({
    ...rest,
    configurationSha256: hash(configuration),
    providerLockSha256: hash(providerLock),
  }))(deployment);
  const namespaces = new Set(['default']);
  for (const value of [
    ...teardown.drain.listeners.map((row) => row.namespace),
    ...teardown.drain.origins.map((row) => row.origin.namespace),
  ]) {
    if (typeof value !== 'string' || !/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value))
      throw Error('Azure terminal namespace differs');
    namespaces.add(value);
  }
  const fresh = async () => {
    signal?.throwIfAborted();
    await store.verify();
    if (
      runtime.engine !== 'terraform' ||
      canonicalSha256(store.owner) !== canonicalSha256(binding.owner) ||
      teardown.sourcePlanSha256 !== base.planSha256 ||
      teardown.drain.siteContractFingerprint !== runtime.contract.fingerprint ||
      teardown.drain.ingressContractFingerprint !== contract.fingerprint ||
      canonicalSha256(await store.read(`${teardown.planId}.json`)) !== canonicalSha256(teardown)
    )
      throw Error('Azure terminal owner or contracts differ');
    const start = Date.now();
    const platform = await runtime.unregisteredAbsence([binding], [...namespaces].sort(), contract, signal);
    const at = Date.parse(platform.observedAt),
      began = Date.parse(platform.startedAt);
    if (
      platform.status !== 'absent' ||
      canonicalSha256(platform.owner) !== canonicalSha256(binding.owner) ||
      platform.siteContractFingerprint !== runtime.contract.fingerprint ||
      platform.ingressContractFingerprint !== contract.fingerprint ||
      !Number.isFinite(at) ||
      !Number.isFinite(began) ||
      began < start ||
      at < began ||
      at > Date.now() ||
      Date.now() - at > 60_000 ||
      !Array.isArray(platform.sources) ||
      !platform.sources.length
    )
      throw Error('Fresh complete Azure platform absence unavailable');
    const cloud = await observeAzureTerraformDestroyBoundary(base, api, signal);
    if (cloud.status !== 'absent') throw Error('Fresh Azure cloud absence unavailable');
    return { platform, cloud };
  };
  let stages: string[] = [];
  const stagesRoot = join(store.directory, 'terraform-stages');
  try {
    const stat = await lstat(stagesRoot);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.uid !== process.getuid?.() ||
      (await realpath(stagesRoot)) !== stagesRoot
    )
      throw Error('Azure upgrade stage directory ownership differs');
    stages = (await readdir(stagesRoot)).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (stages.some((stage) => !/^upgrade-(?:software|os)-[a-f0-9]{24}$/.test(stage)))
    throw Error('Unqualified Azure stage blocks terminal cleanup');
  if (stages.length && !terraform) throw Error('Owning Azure upgrade retirement service unavailable');
  const upgradeContract = stages.length ? await VerifiedUpgradeContract.release(fetch, signal) : undefined;
  const upgrades = upgradeContract
    ? await qualifiedAzureTerraformUpgradeStages(base, store, stages, upgradeContract)
    : [];
  let checkpoint: Checkpoint | undefined;
  try {
    checkpoint = (await store.read(name)) as Checkpoint;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const validFinal = (final: PlanReceipt | undefined) =>
    !!final &&
    final.schemaVersion === 1 &&
    final.engine === 'terraform' &&
    final.deploymentId === base.deploymentName &&
    final.backendIdentity === deployment.backendIdentity &&
    final.configurationSha256 === identity.configurationSha256 &&
    final.providerLockSha256 === identity.providerLockSha256 &&
    final.noChanges === true &&
    Array.isArray(final.changes) &&
    !final.changes.length &&
    sha(final.planSha256) &&
    !final.operation &&
    !final.actionInvocations &&
    !final.imports &&
    !final.relinquishments;
  await fresh();
  if (!checkpoint) {
    if (!session.readConfigurationSha256 || !session.cancelUnsubmittedPlan || !session.retireArtifacts)
      throw Error('Azure owning runner cleanup unavailable');
    const configurationSha256 = await session.readConfigurationSha256();
    if (!sha(configurationSha256)) throw Error('Azure current configuration is unresolved');
    const configuration = object(JSON.parse(await session.readConfiguration(configurationSha256)));
    const renderedEmpty = JSON.stringify({ terraform: configuration.terraform, provider: configuration.provider });
    if (canonicalSha256(JSON.parse(renderedEmpty)) !== canonicalSha256(JSON.parse(deployment.configuration)))
      throw Error('Azure empty configuration provider or execution identity differs');
    const emptyConfiguration = deployment.configuration;
    const destroy = (await store.read('azure-terraform-cloud-destroy-final.json')) as PlanReceipt;
    if (
      destroy.schemaVersion !== 1 ||
      destroy.engine !== 'terraform' ||
      destroy.operation !== 'destroy' ||
      destroy.noChanges !== true ||
      destroy.deploymentId !== base.deploymentName ||
      destroy.backendIdentity !== deployment.backendIdentity ||
      destroy.configurationSha256 !== configurationSha256 ||
      destroy.providerLockSha256 !== identity.providerLockSha256 ||
      !sha(destroy.planSha256) ||
      !Array.isArray(destroy.changes) ||
      destroy.changes.length
    )
      throw Error('Azure terminal destroy evidence differs');
    const evidence = await fresh();
    checkpoint = {
      schemaVersion: 1,
      sourcePlanSha256: base.planSha256,
      teardownPlanSha256: teardown.planSha256,
      configurationSha256,
      emptyConfiguration,
      emptyConfigurationSha256: hash(emptyConfiguration),
      destroy,
      evidence,
      evidenceSha256: canonicalSha256(evidence),
      checkpointSha256: canonicalSha256({ configurationSha256, emptyConfiguration, destroy, evidence }),
      phase: 'cancelling',
    };
    await store.write(name, checkpoint);
  }
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.sourcePlanSha256 !== base.planSha256 ||
    checkpoint.teardownPlanSha256 !== teardown.planSha256 ||
    !sha(checkpoint.configurationSha256) ||
    !sha(checkpoint.evidenceSha256) ||
    checkpoint.evidenceSha256 !== canonicalSha256(checkpoint.evidence) ||
    checkpoint.checkpointSha256 !==
      canonicalSha256({
        configurationSha256: checkpoint.configurationSha256,
        emptyConfiguration: checkpoint.emptyConfiguration,
        destroy: checkpoint.destroy,
        evidence: checkpoint.evidence,
      }) ||
    typeof checkpoint.emptyConfiguration !== 'string' ||
    checkpoint.emptyConfigurationSha256 !== hash(checkpoint.emptyConfiguration) ||
    checkpoint.emptyConfigurationSha256 !== identity.configurationSha256 ||
    !['cancelling', 'planning', 'retiring', 'retired'].includes(checkpoint.phase) ||
    (['retiring', 'retired'].includes(checkpoint.phase) &&
      (!validFinal(checkpoint.final) || !sha(checkpoint.retirementEvidenceSha256)))
  )
    throw Error('Azure terminal checkpoint differs');
  if (checkpoint.phase === 'cancelling') {
    await fresh();
    if (!session.cancelUnsubmittedPlan) throw Error('Azure owning runner cancellation unavailable');
    const actual = await session.cancelUnsubmittedPlan(
      checkpoint.destroy,
      checkpoint.configurationSha256,
      checkpoint.emptyConfiguration,
      checkpoint.evidenceSha256,
    );
    if (actual !== checkpoint.emptyConfigurationSha256) throw Error('Azure cancelled configuration differs');
    checkpoint.phase = 'planning';
    await store.write(name, checkpoint);
  }
  if (checkpoint.phase === 'planning') {
    await fresh();
    const final = await session.plan(env, signal);
    if (!validFinal(final)) throw Error('Azure final ordinary refresh-enabled plan differs');
    checkpoint.final = final;
    checkpoint.retirementEvidenceSha256 = canonicalSha256(await fresh());
    checkpoint.phase = 'retiring';
    await store.write(name, checkpoint);
  }
  if (checkpoint.phase === 'retiring') {
    await fresh();
    if (!session.retireArtifacts || !checkpoint.final || !checkpoint.retirementEvidenceSha256)
      throw Error('Azure owning runner retirement unavailable');
    checkpoint.artifacts = await session.retireArtifacts(
      checkpoint.final,
      checkpoint.retirementEvidenceSha256,
      env,
      signal,
    );
    // Validate before persisting a terminal phase so an invalid acknowledgement remains recoverable.
    const value = checkpoint.artifacts;
    if (
      value.status !== 'runner-artifacts-retired' ||
      value.manifestSha256 !== canonicalSha256(identity) ||
      value.evidenceSha256 !== checkpoint.retirementEvidenceSha256 ||
      value.finalPlanSha256 !== checkpoint.final.planSha256 ||
      !sha(value.inventorySha256) ||
      !Number.isSafeInteger(value.retiredArtifacts) ||
      value.retiredArtifacts < 0
    )
      throw Error('Azure runner retirement receipt differs');
    checkpoint.phase = 'retired';
    await store.write(name, checkpoint);
  }
  await fresh();
  const value = checkpoint.artifacts;
  if (
    !value ||
    !checkpoint.final ||
    value.status !== 'runner-artifacts-retired' ||
    value.manifestSha256 !== canonicalSha256(identity) ||
    value.evidenceSha256 !== checkpoint.retirementEvidenceSha256 ||
    value.finalPlanSha256 !== checkpoint.final.planSha256 ||
    !sha(value.inventorySha256) ||
    !Number.isSafeInteger(value.retiredArtifacts) ||
    value.retiredArtifacts < 0
  )
    throw Error('Azure terminal retirement evidence differs');
  if (!checkpoint.retirementEvidenceSha256) throw Error('Azure parent retirement evidence missing');
  for (const upgrade of upgrades) {
    await fresh();
    if (!terraform || !upgradeContract) throw Error('Owning Azure upgrade retirement service unavailable');
    await retireAzureTerraformUpgradeStage(
      base,
      upgrade,
      upgradeContract,
      terraform,
      store,
      checkpoint.retirementEvidenceSha256,
      env,
      signal,
    );
    await fresh();
  }
  const parent = await retireAzureTerraformParentArtifacts(
    base,
    teardown,
    checkpoint.retirementEvidenceSha256,
    store,
    signal,
  );
  return {
    parent,
    status: 'deployment-artifacts-retired' as const,
    sourcePlanSha256: base.planSha256,
    teardownPlanSha256: teardown.planSha256,
    finalPlanSha256: checkpoint.final.planSha256,
    artifacts: value,
    cloud: 'absent' as const,
    sites: 'deleted' as const,
    completeCleanup: false as const,
  };
}
