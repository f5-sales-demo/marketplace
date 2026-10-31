import { createHash } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { ArtifactRetirementReceipt } from '../../../terraform/src/artifact-retirement';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import type { AzExecApi } from '../az/exec';
import { canonicalSha256 } from './canonical';
import { createAzureOperationalRetirementSession } from './network-operational-retirement-session';
import { observeAzureRelayRetirementAbsence } from './relay-retirement';
import { observeAzureTerraformDestroyBoundary } from './terraform-destroy-ownership';
import { retireAzureTerraformFailoverStage } from './terraform-failover-retirement';
import { azureTerraformCurrentDeployment } from './terraform-foundation';
import type { AzureTerraformNetworkDestroyJournalContext } from './terraform-network-destroy-journal-custody';
import { qualifyAzureTerraformNetworkFreshParentAbsence } from './terraform-network-fresh-parent-absence';
import { retireAzureTerraformNetworkOpaqueCheckouts } from './terraform-network-opaque-checkout-retirement';
import {
  retireAzureTerraformNetworkBootstrapPackets,
  retireAzureTerraformNetworkSensitivePackets,
} from './terraform-network-sensitive-packet-retirement';
import { retireAzureTerraformNetworkTerminalMain } from './terraform-network-terminal-main-retirement';
import { retireAzureTerraformNetworkTerminalPlaintext } from './terraform-network-terminal-plaintext-retirement';
import { prepareAzureTerraformNetworkTerminalPlanning } from './terraform-network-terminal-planning';
import { retireAzureTerraformParentArtifacts } from './terraform-parent-retirement';
import type { AzureTerraformTeardownPlan } from './terraform-teardown';
import {
  qualifyAzureTerraformTeardownStageHistory,
  recheckAzureTerraformTeardownStageHistory,
} from './terraform-teardown-stage-history';
import { sealAzureTerraformTerminalSnapshot } from './terraform-terminal-snapshot';
import { azureUpgradeBinding } from './terraform-upgrade';
import { finalizeAzureTerraformUpgradeStageRetirement } from './terraform-upgrade-retirement';
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
  retirementEvidence?: unknown;
  retirementEvidenceSha256?: string;
  artifacts?: ArtifactRetirementReceipt;
  retainedDestroyConfiguration?: string;
  retainedNetworkCustody?: unknown;
  retainedTerminalNetworkCustody?: unknown;
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
  networkContext?: AzureTerraformNetworkDestroyJournalContext,
  stageAdmission?: {
    history: Awaited<ReturnType<typeof qualifyAzureTerraformTeardownStageHistory>>;
    context: Parameters<typeof qualifyAzureTerraformTeardownStageHistory>[3];
  },
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
  const fresh = async (active = signal) => {
    active?.throwIfAborted();
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
    const platform = await runtime.unregisteredAbsence([binding], [...namespaces].sort(), contract, active);
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
    const cloud = base.relayProfile
      ? await observeAzureRelayRetirementAbsence(base, api, active)
      : await observeAzureTerraformDestroyBoundary(base, api, active);
    if (cloud.status !== 'absent') throw Error('Fresh Azure cloud absence unavailable');
    return { platform, cloud };
  };
  let checkpoint: Checkpoint | undefined;
  try {
    checkpoint = (await store.read(name)) as Checkpoint;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (
    networkContext &&
    (networkContext.terraform !== terraform ||
      canonicalSha256(networkContext.destroyTeardown) !== canonicalSha256(teardown))
  )
    throw Error('Azure terminal owning network context differs');
  const stageContext =
    networkContext && checkpoint
      ? { ...networkContext, terminalCleanup: sealAzureTerraformTerminalSnapshot(checkpoint) }
      : networkContext;
  if (stageAdmission) {
    const admitted = stageAdmission.context;
    if (
      !networkContext ||
      !admitted ||
      stageAdmission.history.failovers.length ||
      stageAdmission.history.upgrades.length ||
      (!stageAdmission.history.network && !stageAdmission.history.retiredNetwork) ||
      canonicalSha256({ value: admitted }) !== canonicalSha256({ value: stageContext }) ||
      admitted.publicSession !== networkContext.publicSession ||
      admitted.terraform !== networkContext.terraform ||
      admitted.loaders !== networkContext.loaders ||
      admitted.site !== networkContext.site ||
      admitted.verifier !== networkContext.verifier ||
      admitted.replacementVerifier !== networkContext.replacementVerifier
    )
      throw Error('Azure terminal stage history admission differs');
  }
  const history = stageAdmission
    ? await recheckAzureTerraformTeardownStageHistory(
        stageAdmission.history,
        base,
        store,
        signal,
        stageAdmission.context,
      )
    : await qualifyAzureTerraformTeardownStageHistory(base, store, signal, stageContext);
  const { stages, failovers, upgrades, upgradeContract } = history;
  if (stages.length && !terraform) throw Error('Owning Azure upgrade retirement service unavailable');
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
  // Reopen the actual public original-source observer only after independently observed
  // cloud/platform absence. This retires signing material without a new observation or
  // healthy operational claim. The same genuine instance follows every native snapshot.
  const observer = networkContext
    ? await createAzureOperationalRetirementSession(base, runtime, api, store, networkContext.publicSession, signal)
    : undefined;
  if (observer) await observer.retireSigningMaterial(signal);
  const parentContracts = Object.freeze({
    ingress: contract,
    ...(upgradeContract ? { upgrade: upgradeContract } : {}),
    ...(observer ? { observer } : {}),
  });
  await fresh();
  if (networkContext && (!checkpoint || ['cancelling', 'planning'].includes(checkpoint.phase))) {
    const prepared = await prepareAzureTerraformNetworkTerminalPlanning(
      base,
      store,
      networkContext,
      (active) => fresh(active),
      env,
      signal,
    );
    checkpoint = prepared.checkpoint as unknown as Checkpoint;
  }
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
      (!validFinal(checkpoint.final) ||
        !sha(checkpoint.retirementEvidenceSha256) ||
        !checkpoint.retirementEvidence ||
        checkpoint.retirementEvidenceSha256 !== canonicalSha256(checkpoint.retirementEvidence)))
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
    checkpoint.retirementEvidence = await fresh();
    checkpoint.retirementEvidenceSha256 = canonicalSha256(checkpoint.retirementEvidence);
    checkpoint.phase = 'retiring';
    await store.write(name, checkpoint);
  }
  if (networkContext && ['retiring', 'retired'].includes(checkpoint.phase)) {
    if (checkpoint.phase === 'retiring' || Object.hasOwn(checkpoint, 'retainedDestroyConfiguration')) {
      const retired = await retireAzureTerraformNetworkTerminalMain(
        base,
        store,
        { ...networkContext, terminalCleanup: sealAzureTerraformTerminalSnapshot(checkpoint), parentContracts },
        async (active) => {
          await fresh(active);
        },
        env,
        signal,
      );
      checkpoint = retired.checkpoint as unknown as Checkpoint;
    }
  } else if (checkpoint.phase === 'retiring') {
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
    await finalizeAzureTerraformUpgradeStageRetirement(
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
  for (const failover of failovers) {
    await fresh();
    if (!terraform) throw Error('Owning Azure failover retirement service unavailable');
    const sites = teardown.retirement.filter((site) => site.siteName === base.siteName);
    if (sites.length !== 1) throw Error('Failover retirement site is ambiguous');
    await retireAzureTerraformFailoverStage(
      base,
      failover,
      sites[0].siteUid,
      terraform,
      store,
      checkpoint.retirementEvidenceSha256,
      env,
      signal,
    );
    await fresh();
  }
  if (networkContext) {
    if (Object.hasOwn(checkpoint, 'retainedDestroyConfiguration')) {
      const transformed = await retireAzureTerraformNetworkTerminalPlaintext(
        base,
        store,
        { ...networkContext, terminalCleanup: sealAzureTerraformTerminalSnapshot(checkpoint), parentContracts },
        async (active) => {
          await fresh(active);
        },
        signal,
      );
      checkpoint = transformed.checkpoint as unknown as Checkpoint;
    }
    const postContext = {
      ...networkContext,
      terminalCleanup: sealAzureTerraformTerminalSnapshot(checkpoint),
      parentContracts,
    };
    const absence = await qualifyAzureTerraformNetworkFreshParentAbsence(
      base,
      store,
      postContext,
      runtime,
      contract,
      api,
      signal,
    );
    let bootstrapProgress: unknown;
    try {
      bootstrapProgress = await store.read('azure-terraform-network-bootstrap-packet-retirement.json');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    // A bootstrap marker selects its native replay reader; it never grants authority.
    // That reader independently requires the completed non-bootstrap checkpoint.
    if (bootstrapProgress === undefined)
      await retireAzureTerraformNetworkSensitivePackets(base, store, postContext, signal);
    await retireAzureTerraformNetworkBootstrapPackets(
      base,
      store,
      postContext,
      absence,
      runtime,
      contract,
      api,
      signal,
    );
    const checkoutRetirement = await retireAzureTerraformNetworkOpaqueCheckouts(
      base,
      store,
      postContext,
      absence,
      runtime,
      contract,
      api,
      signal,
    );
    const parent = checkoutRetirement.parent;
    if (!checkpoint.final) throw Error('Azure network final receipt missing after packet retirement');
    return {
      parent,
      checkoutRetirement,
      status: 'network-parent-packets-retired' as const,
      sourcePlanSha256: base.planSha256,
      teardownPlanSha256: teardown.planSha256,
      finalPlanSha256: checkpoint.final.planSha256,
      artifacts: value,
      cloud: 'absent' as const,
      sites: 'deleted' as const,
      completeCleanup: false as const,
      parentRetirementQualified: false as const,
      interfaceAbsenceQualified: false as const,
      opaqueCheckoutRetirementQualified: true as const,
      fullExternalCleanupQualified: false as const,
    };
  }
  const parent = await retireAzureTerraformParentArtifacts(
    base,
    teardown,
    checkpoint.retirementEvidenceSha256,
    store,
    signal,
    contract,
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
