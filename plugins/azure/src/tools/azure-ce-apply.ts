import { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { CeTerraformService } from '../../../terraform/src/service';
import type { AzExecApi } from '../az/exec';
import type { PluginInterface } from '../az/types';
import { assertActionOwnership, assertApplyAllowed, assertObservationFresh, resolveActionArgs } from '../ce/apply';
import {
  captureAzureCeApplyCallbacks,
  captureAzureCeApplyRequest,
  guardAzureCeApplyObject,
  guardAzureCeApplyServices,
} from '../ce/apply-request';
import { type AzureCeToolContext, loadCheckpoint, loadPlanArtifact, saveCheckpoint } from '../ce/artifacts';
import { canonicalSha256, safeHexEqual } from '../ce/canonical';
import { discoverAzureCompute } from '../ce/discovery';
import { withAzureCeExecution } from '../ce/execution';
import { resolveAzureNicAddress, resolveInterfaceAddress } from '../ce/interface-address';
import { persistAzureNativeActionEvidence, persistAzureNativeSource } from '../ce/native-action-evidence';
import {
  azureNativePendingActionConverged,
  buildAzureNativePendingAction,
  validateAzureNativePendingAction,
} from '../ce/native-action-recovery';
import { persistAzureNativeNetworkCheckpointHistory } from '../ce/native-network-checkpoint-history';
import { persistAzureNativeNetworkGenerationCompletion } from '../ce/native-network-generation';
import { persistAzureNativeNetworkHistory } from '../ce/native-network-history';
import { verifyAzureNativeNetworkReplacementExecution } from '../ce/native-network-replacement-execution';
import { requireAzureNativePriorGenerationExecution } from '../ce/native-replacement-source';
import {
  azureNativeBootstrapForAction,
  collectAzureNativeAdmissionHealth,
  collectAzureNativeVmState,
  type NativeWorkflowCheckpoint,
  prepareAzureNativeAdmission,
  prepareAzureNativeReplacement,
  recordAzureNativeLaunch,
  validateAzureNativeAdmissionCheckpoint,
  withAzureNativeBootstrapFile,
} from '../ce/native-workflow';
import {
  type AzureNativeNetworkUpdateCheckpoint,
  azureNetworkUpdateAppliedNics,
  captureAzureNetworkUpdateInventory,
  validateAzureNativeNetworkUpdateCheckpoint,
  verifyAzureNetworkUpdateProgress,
} from '../ce/network-update';
import {
  qualifyAzureNativeNetworkUpdateSource,
  verifyAzureNativeNetworkUpdateSite,
} from '../ce/network-update-native-source';
import { azurePlatformService, azureTerraformService } from '../ce/platform';
import { ensureAzurePlatformIngress } from '../ce/platform-ingress';
import {
  collectAzureAbsentDeletionTail,
  fingerprintCheckpointObservation,
  reconcileAzureNativeDeletionPrefix,
  validateAzureDeletionTail,
} from '../ce/recovery';
import { azureRelayHistoricalArtifacts, requireAzureRelayHistoricalAcceptance } from '../ce/relay-artifact-provenance';
import { executeAzureRelayProvisionAction } from '../ce/relay-native-execution';
import { reconcileAzureNativeRelayProvision } from '../ce/relay-native-recovery';
import { assertAzureNativeActive } from '../ce/relay-retirement';
import { configureAzureSelectedRelayRouting } from '../ce/relay-routing-dispatch';
import { configureAzureRouteServerRouting } from '../ce/routing-workflow';
import { executeAzureCeTerraformApply } from '../ce/terraform-apply';
import { azureUpgradeBinding } from '../ce/terraform-upgrade';
import { collectAzureTrafficProbe } from '../ce/traffic-probe';
import type { AzureCeCheckpoint, AzureCePlan } from '../ce/types';
import { AZURE_CE_CHECKPOINT_SCHEMA_VERSION } from '../ce/types';
import { makeExecApi } from './shared';

interface TerraformDependencies {
  platform(pi: PluginInterface, signal?: AbortSignal): Promise<CePlatformService>;
  terraform(pi: PluginInterface, signal?: AbortSignal): Promise<CeTerraformService>;
}

const terraformDefaults: TerraformDependencies = {
  platform: azurePlatformService,
  terraform: azureTerraformService,
};

interface ApplyParams {
  planId: string;
  planSha256: string;
}

interface NativeApplyDependencies {
  observe?: () => ReturnType<typeof discoverAzureCompute>;
  ingressContract?: () => Promise<VerifiedIngressContract>;
  ensureIngress?: typeof ensureAzurePlatformIngress;
  collectTraffic?: typeof collectAzureTrafficProbe;
}

async function replacementsFor(
  args: string[],
  api: AzExecApi,
  plan: AzureCePlan,
  ownerPlanSha256 = plan.planSha256,
  networkUpdate?: AzureNativeNetworkUpdateCheckpoint,
  signal?: AbortSignal,
): Promise<Record<string, string>> {
  const replacements: Record<string, string> = {};
  for (const arg of args) {
    const configuration = /^__NODE_(\d+)_NIC_(\d+)_IPCONFIG_NAME__$/.exec(arg);
    if (configuration) {
      const nic = networkUpdate?.before.nodes[configuration[1]]?.nics[configuration[2]];
      if (!nic) throw Error('Azure network update execution configuration identity is unresolved');
      replacements[arg] = nic.ipConfigurationName;
      continue;
    }
    const exactNic = /^__NODE_(\d+)_NIC_(\d+)_PRIVATE_IP__$/.exec(arg);
    if (exactNic) {
      replacements[arg] = await resolveAzureNicAddress(
        api,
        plan,
        Number(exactNic[1]),
        Number(exactNic[2]),
        ownerPlanSha256,
        signal,
      );
      continue;
    }
    const match = /^__NODE_(\d+)_(SLO|SLI|DATA)_PRIVATE_IP__$/.exec(arg);
    if (!match || replacements[arg]) continue;
    const role = match[2] === 'SLO' || (match[2] === 'DATA' && plan.nics.length === 1) ? 'slo' : 'sli';
    replacements[arg] = await resolveInterfaceAddress(api, plan, Number(match[1]), role, ownerPlanSha256, signal);
  }
  return replacements;
}

export async function executeAzureCeNativeApply(
  requestParams: ApplyParams,
  requestContext: AzureCeToolContext,
  requestApi: AzExecApi,
  requestPlatformFactory: () => Promise<CePlatformService>,
  signal?: AbortSignal,
  requestDependencies: NativeApplyDependencies = {},
) {
  const request = captureAzureCeApplyRequest(requestParams, requestContext),
    seal = () => {
      signal?.throwIfAborted();
      request.assertUnchanged();
    },
    params = request.input,
    ctx = request.context,
    api = guardAzureCeApplyObject(requestApi, seal),
    dependencies = guardAzureCeApplyObject(requestDependencies, seal),
    platformFactory = async () => {
      seal();
      const platform = await requestPlatformFactory();
      seal();
      return guardAzureCeApplyServices(seal, api, platform).platform;
    };
  seal();
  const { plan, observation } = await loadPlanArtifact(ctx.sessionManager, params.planId, params.planSha256);
  request.bindPlatformContext(plan.intent.platformContext);
  seal();
  if (Object.keys(params).some((key) => !['planId', 'planSha256'].includes(key)))
    throw new Error('Azure apply accepts only the persisted plan identity; caller evidence is unsupported');
  let existing = await loadCheckpoint(ctx.sessionManager, plan);
  let recoveredNativeLaunchNode: number | undefined;
  assertApplyAllowed(plan, {
    planId: params.planId,
    planSha256: params.planSha256,
    hasUI: ctx.hasUI,
    env: process.env,
    authorization: existing?.authorization,
  });
  if (
    plan.relayProfile?.schemaVersion === 2 &&
    plan.relayProfile.retainedDeploymentPlan.relayProfile?.schemaVersion === 2
  ) {
    const predecessor = await loadCheckpoint(ctx.sessionManager, plan.relayProfile.retainedDeploymentPlan);
    if (predecessor?.state !== 'complete')
      throw Error('Azure relay replacement predecessor has not completed its public execution contract');
  }
  let relayRecoveryPlatform: CePlatformService | undefined;
  if (plan.intent.operation !== 'teardown' && (plan.relayProfile || !existing)) {
    relayRecoveryPlatform = await platformFactory();
    const relayStore = await relayRecoveryPlatform.storage({
      deploymentId: plan.deploymentName,
      engine: 'native',
      provider: 'azure',
      account: plan.subscription.id,
      region: plan.region,
    });
    await assertAzureNativeActive(relayStore);
  }
  let qualifiedNetworkReplacement: Awaited<ReturnType<typeof verifyAzureNativeNetworkReplacementExecution>> | undefined;
  const verifyNetworkReplacement = async (checkpoint: AzureCeCheckpoint | undefined) => {
    if (!plan.networkReplacementProfile) return;
    relayRecoveryPlatform ??= await platformFactory();
    const store = await relayRecoveryPlatform.storage(azureUpgradeBinding(plan).owner);
    await assertAzureNativeActive(store);
    let admission: NativeWorkflowCheckpoint | undefined;
    try {
      admission = (await store.read(`native-admission-${plan.planSha256}.json`)) as NativeWorkflowCheckpoint;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (admission) validateAzureNativeAdmissionCheckpoint(plan, admission);
    qualifiedNetworkReplacement = await verifyAzureNativeNetworkReplacementExecution(
      plan,
      admission,
      store,
      (source) => loadCheckpoint(ctx.sessionManager, source),
      api,
      await relayRecoveryPlatform.runtime('native', plan.intent.platformContext),
      checkpoint,
      signal,
    );
  };
  await verifyNetworkReplacement(existing);
  const observe =
    dependencies.observe ??
    (() =>
      discoverAzureCompute(
        {
          subscriptionId: plan.subscription.id,
          publisher: plan.image.publisher,
          offer: plan.image.offer,
          plan: plan.image.plan,
          version: plan.image.version,
          vmSize: plan.vm.size,
          requiredNics: plan.nics.length,
          nodeCount: plan.topology.nodeCount,
          requireRouteServer: plan.routing.mode === 'route-server',
          brownfieldResourceIds: plan.intent.brownfield.resourceIds,
          deploymentName: plan.deploymentName,
          resourceGroup: plan.intent.resourceGroup,
        },
        api,
      ));
  const remainingActions = plan.actions.slice(existing?.completedActionIds.length ?? 0);
  const hasImmutableDeleteTail =
    remainingActions.length > 0 && remainingActions.every((action) => action.kind === 'resource-delete');
  if (existing && plan.intent.operation === 'teardown' && hasImmutableDeleteTail) {
    validateAzureDeletionTail(plan, existing.completedActionIds);
  }
  let current = await observe();
  let networkUpdate: AzureNativeNetworkUpdateCheckpoint | undefined;
  let networkHistoryStore: Awaited<ReturnType<CePlatformService['storage']>> | undefined;
  if (plan.intent.operation === 'update-network') {
    if (existing && (existing.completedActionIds.length || existing.pendingAction) && !existing.networkUpdate)
      throw Error('Azure network update recovery requires its original complete interface inventory');
    const inventory = await captureAzureNetworkUpdateInventory(plan, api, signal);
    networkUpdate = existing?.networkUpdate
      ? { ...existing.networkUpdate, current: inventory }
      : { before: inventory, current: inventory };
    validateAzureNativeNetworkUpdateCheckpoint(
      plan,
      networkUpdate,
      existing?.completedActionIds ?? [],
      existing?.pendingAction?.actionId,
    );
    relayRecoveryPlatform ??= await platformFactory();
    const networkStore = await relayRecoveryPlatform.storage(azureUpgradeBinding(plan).owner);
    networkHistoryStore = networkStore;
    const networkRuntime = await relayRecoveryPlatform.runtime('native', plan.intent.platformContext);
    const source = await qualifyAzureNativeNetworkUpdateSource(plan, networkUpdate.before, networkStore, (prior) =>
      loadCheckpoint(ctx.sessionManager, prior),
    );
    if (existing && (existing.completedActionIds.length || existing.pendingAction) && !existing.networkUpdate?.source)
      throw Error('Azure network update recovery requires completed original source provenance');
    if (networkUpdate.source && canonicalSha256(networkUpdate.source) !== canonicalSha256(source))
      throw Error('Azure network update original source binding changed');
    networkUpdate.source = source;
    await verifyAzureNativeNetworkUpdateSite(plan, source, networkRuntime, signal);
  }
  const finalize = async (checkpoint: AzureCeCheckpoint) => {
    if (plan.networkReplacementProfile) {
      const producer = relayRecoveryPlatform ?? (await platformFactory());
      await persistAzureNativeNetworkGenerationCompletion(
        plan,
        checkpoint,
        await producer.storage(azureUpgradeBinding(plan).owner),
      );
    }
    if (networkUpdate && networkHistoryStore) {
      await persistAzureNativeNetworkCheckpointHistory(plan, checkpoint, networkHistoryStore);
      await persistAzureNativeNetworkHistory(plan, checkpoint, networkHistoryStore);
    }
    return { plan, checkpoint };
  };
  let currentFingerprint = fingerprintCheckpointObservation(current);
  const existingSnapshot =
    existing?.schemaVersion === AZURE_CE_CHECKPOINT_SCHEMA_VERSION ? existing.observationSnapshot : undefined;
  if (
    plan.intent.operation === 'teardown' &&
    hasImmutableDeleteTail &&
    !existingSnapshot &&
    (!existing || existing.completedActionIds.length === 0)
  ) {
    reconcileAzureNativeDeletionPrefix(plan, existing?.completedActionIds ?? [], observation, current, []);
  }
  const mayRecoverDeletion = existingSnapshot !== undefined;
  if (
    mayRecoverDeletion &&
    existing?.observationSnapshot &&
    plan.intent.operation === 'teardown' &&
    existing.state !== 'complete'
  ) {
    const priorFingerprint = existing.observationFingerprint;
    if (!priorFingerprint) throw new Error('Azure teardown checkpoint has no observation fingerprint');
    const previousCompletedCount = existing.completedActionIds.length;
    const completedActionIds = reconcileAzureNativeDeletionPrefix(
      plan,
      existing.completedActionIds,
      existing.observationSnapshot,
      current,
      await collectAzureAbsentDeletionTail(plan, existing.completedActionIds, api, signal),
    );
    const recoveredActions = completedActionIds.length > previousCompletedCount;
    if (recoveredActions || !safeHexEqual(priorFingerprint, currentFingerprint)) {
      const newlyRecovered = new Set(completedActionIds.slice(previousCompletedCount));
      existing = {
        ...existing,
        completedActionIds,
        failedActionId:
          existing.failedActionId && newlyRecovered.has(existing.failedActionId) ? undefined : existing.failedActionId,
        observationFingerprint: currentFingerprint,
        observationSnapshot: structuredClone(current),
        state: recoveredActions
          ? completedActionIds.length === plan.actions.length
            ? 'complete'
            : existing.failedActionId && !newlyRecovered.has(existing.failedActionId)
              ? 'partial'
              : 'running'
          : existing.state,
      };
      await saveCheckpoint(ctx.sessionManager, plan, existing);
      if (existing.state === 'complete') return finalize(existing);
    }
  }
  // Relay inspection needs the owned store but must precede admission, writes and the outer stale gate.
  if (
    existing?.schemaVersion === AZURE_CE_CHECKPOINT_SCHEMA_VERSION &&
    existing.pendingAction?.kind === 'relay-provision'
  ) {
    validateAzureNativePendingAction(plan, existing.completedActionIds, existing.pendingAction);
    relayRecoveryPlatform ??= await platformFactory();
    const relayStorage = await relayRecoveryPlatform.storage({
      deploymentId: plan.deploymentName,
      engine: 'native',
      provider: 'azure',
      account: plan.subscription.id,
      region: plan.region,
    });
    existing = await reconcileAzureNativeRelayProvision(plan, existing, current, relayStorage, api, signal);
    currentFingerprint = fingerprintCheckpointObservation(current);
    await saveCheckpoint(ctx.sessionManager, plan, existing);
    if (existing.state === 'complete') return finalize(existing);
  }
  if (
    existing?.schemaVersion === AZURE_CE_CHECKPOINT_SCHEMA_VERSION &&
    existing.pendingAction &&
    existing.pendingAction.kind !== 'relay-provision'
  ) {
    const action = plan.actions[existing.completedActionIds.length];
    if (!action) throw new Error('Pending Azure native mutation has no next immutable action');
    validateAzureNativePendingAction(plan, existing.completedActionIds, existing.pendingAction);
    const replacements = await replacementsFor(
      action.args ?? [],
      api,
      plan,
      action.expectedOwnerPlanSha256,
      networkUpdate,
      signal,
    );
    const resolvedAction = {
      ...action,
      args: resolveActionArgs(action.args ?? [], plan.planSha256, replacements),
    };
    if (await azureNativePendingActionConverged(plan, resolvedAction, api, signal)) {
      if (action.kind === 'vm-create') recoveredNativeLaunchNode = action.node;
      current = await observe();
      currentFingerprint = fingerprintCheckpointObservation(current);
      existing = {
        ...existing,
        completedActionIds: [...existing.completedActionIds, action.id],
        failedActionId: existing.failedActionId === action.id ? undefined : existing.failedActionId,
        pendingAction: undefined,
        networkUpdate,
        observationFingerprint: currentFingerprint,
        observationSnapshot: structuredClone(current),
        state: existing.completedActionIds.length + 1 === plan.actions.length ? 'complete' : 'running',
      };
      await saveCheckpoint(ctx.sessionManager, plan, existing);
      if (existing.state === 'complete') return finalize(existing);
    }
  }
  if (existing?.observationFingerprint) {
    if (!safeHexEqual(existing.observationFingerprint, currentFingerprint)) {
      throw new Error('Stale Azure CE checkpoint: observations changed outside an allowed recovery boundary');
    }
  } else {
    assertObservationFresh(plan, current);
  }
  if (existing?.state === 'complete') return finalize(existing);
  const completed = new Set(existing?.completedActionIds ?? []);

  const authorization = {
    apply: existing?.authorization?.apply === true,
    terms: existing?.authorization?.terms === true,
    destroy: existing?.authorization?.destroy === true,
  };
  if (ctx.hasUI) {
    if (!authorization.apply) {
      const confirmed = await ctx.ui.confirm(
        'Apply immutable Azure CE plan',
        `${plan.planId}\n${plan.planSha256}\n${plan.actions.length - completed.size} action(s) remain.`,
      );
      if (!confirmed) throw new Error('Apply was not approved');
      authorization.apply = true;
    }
    if (plan.intent.operation === 'teardown' && !authorization.destroy) {
      const destroy = await ctx.ui.confirm(
        'Tear down Customer Edge',
        `Drain routing, restore approved brownfield state, and delete only resources owned by ${plan.deploymentName}?`,
      );
      if (!destroy) throw new Error('Teardown was not approved');
      authorization.destroy = true;
    }
  }

  if (!ctx.hasUI) {
    authorization.apply ||= process.env.XCSH_CE_HEADLESS_MUTATIONS === '1';
    authorization.destroy ||= process.env.XCSH_CE_ALLOW_DESTROY === '1';
  }

  const checkpoint: AzureCeCheckpoint = {
    authorization,
    engine: plan.engine,
    schemaVersion: AZURE_CE_CHECKPOINT_SCHEMA_VERSION,
    planId: plan.planId,
    planSha256: plan.planSha256,
    completedActionIds: [...completed],
    observationFingerprint: existing?.observationFingerprint ?? currentFingerprint,
    observationSnapshot: structuredClone(current),
    pendingAction: existing?.schemaVersion === AZURE_CE_CHECKPOINT_SCHEMA_VERSION ? existing.pendingAction : undefined,
    networkUpdate,
    state: 'running',
  };
  await saveCheckpoint(ctx.sessionManager, plan, checkpoint);
  const platform = relayRecoveryPlatform ?? (await platformFactory());
  const storage = await platform.storage({
    deploymentId: plan.deploymentName,
    engine: 'native',
    provider: 'azure',
    account: plan.subscription.id,
    region: plan.region,
  });
  if (plan.intent.operation !== 'teardown') await assertAzureNativeActive(storage);
  const runtime = await platform.runtime('native', plan.intent.platformContext);
  if (
    plan.relayProfile?.schemaVersion === 2 &&
    plan.relayProfile.retainedDeploymentPlan.relayProfile?.schemaVersion === 2
  ) {
    const predecessor = plan.relayProfile.retainedDeploymentPlan;
    const admission = (await storage.read(
      `native-admission-${predecessor.planSha256}.json`,
    )) as NativeWorkflowCheckpoint;
    validateAzureNativeAdmissionCheckpoint(predecessor, admission);
    if (admission.replacement?.status !== 'registered')
      throw Error('Azure relay replacement predecessor registration history is unavailable');
    const history = new Map<string, unknown>();
    for (const name of azureRelayHistoricalArtifacts)
      history.set(name, await storage.read(`${predecessor.planId}-replacement-${name}`));
    requireAzureRelayHistoricalAcceptance(predecessor, admission.replacement.siteUid, history);
  }
  const ingressContract =
    plan.intent.ingress?.mode === 'platform-http'
      ? await (dependencies.ingressContract?.() ?? VerifiedIngressContract.release(undefined, signal))
      : undefined;
  await persistAzureNativeSource(plan, storage);
  const native = await prepareAzureNativeAdmission(plan, runtime, storage, signal);
  if (recoveredNativeLaunchNode) await recordAzureNativeLaunch(plan, recoveredNativeLaunchNode, native, storage);
  if (plan.intent.operation === 'replace-node') {
    await prepareAzureNativeReplacement(plan, native, api, runtime, storage, signal, qualifiedNetworkReplacement);
    if (!plan.relayProfile && !plan.networkReplacementProfile)
      await requireAzureNativePriorGenerationExecution(native, storage, (source) =>
        loadCheckpoint(ctx.sessionManager, source),
      );
  }
  for (const action of plan.actions) {
    if (completed.has(action.id)) continue;
    await verifyNetworkReplacement(checkpoint);
    const preActionFingerprint = checkpoint.observationFingerprint;
    const preActionSnapshot = checkpoint.observationSnapshot;
    let durableActionPending = checkpoint.pendingAction;
    try {
      let postMutationObservation: Awaited<ReturnType<typeof observe>> | undefined;
      if (networkUpdate && action.mutates) {
        if (!networkUpdate.source) throw Error('Azure network update source binding is missing');
        await verifyAzureNativeNetworkUpdateSite(plan, networkUpdate.source, runtime, signal);
        networkUpdate.current = await captureAzureNetworkUpdateInventory(plan, api, signal);
        validateAzureNativeNetworkUpdateCheckpoint(
          plan,
          networkUpdate,
          [...completed],
          checkpoint.pendingAction?.actionId,
        );
      }
      await assertActionOwnership(plan, action, api, signal);
      if (action.kind === 'relay-provision') {
        if (checkpoint.pendingAction) {
          validateAzureNativePendingAction(plan, checkpoint.completedActionIds, checkpoint.pendingAction);
        } else {
          checkpoint.pendingAction = buildAzureNativePendingAction(plan, action);
          await saveCheckpoint(ctx.sessionManager, plan, checkpoint);
        }
        const evidence = await executeAzureRelayProvisionAction(plan, action, storage, api, signal);
        await persistAzureNativeActionEvidence(plan, action, evidence, storage);
      }
      if (action.kind === 'vm-state-gate') {
        const deadline = Date.now() + 15 * 60_000;
        while (true) {
          const evidence = await collectAzureNativeVmState(plan, action, api, signal);
          await persistAzureNativeActionEvidence(plan, action, evidence, storage);
          if (evidence.status === 'healthy') break;
          if (Date.now() >= deadline) throw new Error('Observed Azure VM power state has not converged');
          await new Promise<void>((resolve, reject) => {
            const abort = () => {
              clearTimeout(timer);
              reject(signal?.reason ?? new Error('Azure VM convergence cancelled'));
            };
            const timer = setTimeout(() => {
              signal?.removeEventListener('abort', abort);
              resolve();
            }, 10_000);
            signal?.addEventListener('abort', abort, { once: true });
            if (signal?.aborted) abort();
          });
        }
      }
      if (action.kind === 'health-gate') {
        const deadline = Date.now() + 15 * 60_000;
        let evidence: Awaited<ReturnType<typeof collectAzureNativeAdmissionHealth>>;
        while (true) {
          evidence = await collectAzureNativeAdmissionHealth(
            plan,
            ['replace-node', 'update-network'].includes(plan.intent.operation)
              ? plan.topology.nodeCount
              : (action.node ?? plan.topology.nodeCount),
            api,
            runtime,
            storage,
            signal,
            native,
          );
          await persistAzureNativeActionEvidence(
            plan,
            action,
            { ...evidence, planId: plan.planId, planSha256: plan.planSha256 },
            storage,
          );
          if (evidence.status === 'healthy') break;
          if (Date.now() >= deadline)
            throw new Error(
              evidence.status === 'unknown'
                ? 'Collected Azure platform health evidence is unavailable'
                : 'Observed Azure platform health has not converged',
            );
          await new Promise<void>((resolve, reject) => {
            const abort = () => {
              clearTimeout(timer);
              reject(signal?.reason ?? new Error('Azure health convergence cancelled'));
            };
            const timer = setTimeout(() => {
              signal?.removeEventListener('abort', abort);
              resolve();
            }, 10_000);
            signal?.addEventListener('abort', abort, { once: true });
            if (signal?.aborted) abort();
          });
        }
      }
      if (action.kind === 'bgp-gate') {
        const admission = await collectAzureNativeAdmissionHealth(
          plan,
          plan.topology.nodeCount,
          api,
          runtime,
          storage,
          signal,
          native,
        );
        if (!('configuration' in admission) || admission.configuration.status !== 'configured')
          throw new Error('Authoritative Azure registered interface configuration is unavailable');
        const expectedInterfaces = admission.configuration.interfaces.map(({ node, role, mac }) => ({
          node,
          role,
          mac,
        }));
        const deadline = Date.now() + 15 * 60_000;
        while (true) {
          const evidence = plan.relayProfile
            ? await configureAzureSelectedRelayRouting(plan, expectedInterfaces, runtime, storage, api, signal)
            : await configureAzureRouteServerRouting(
                plan,
                expectedInterfaces,
                runtime,
                storage,
                api,
                signal,
                native.replacement?.routeServer,
              );
          await persistAzureNativeActionEvidence(plan, action, evidence, storage);
          if (
            'observation' in evidence &&
            (evidence.observation.ceRouteScope === 'unqualified' || evidence.observation.freshness === 'unqualified')
          )
            throw Error(
              'Azure relay evidence was collected; CE route scope and publication freshness remain unqualified',
            );
          if (evidence.status === 'healthy') break;
          if (Date.now() >= deadline) throw new Error('Azure Route Server BGP and learned routes have not converged');
          await new Promise<void>((resolve, reject) => {
            const abort = () => {
              clearTimeout(timer);
              reject(signal?.reason ?? new Error('Azure Route Server convergence cancelled'));
            };
            const timer = setTimeout(() => {
              signal?.removeEventListener('abort', abort);
              resolve();
            }, 10_000);
            signal?.addEventListener('abort', abort, { once: true });
            if (signal?.aborted) abort();
          });
        }
      }
      if (action.kind === 'f5-ingress-configure') {
        if (!ingressContract) throw new Error('Verified ingress contract is unavailable');
        const evidence = await (dependencies.ensureIngress ?? ensureAzurePlatformIngress)(
          plan,
          runtime,
          storage,
          ingressContract,
          api,
          signal,
        );
        if (evidence?.listener !== 'configured') throw new Error('Observed Azure platform ingress has not converged');
        await persistAzureNativeActionEvidence(plan, action, evidence, storage);
      }
      if (action.kind === 'traffic-gate') {
        if (!ingressContract) throw new Error('Verified ingress contract is unavailable');
        const ingress = await (dependencies.ensureIngress ?? ensureAzurePlatformIngress)(
          plan,
          runtime,
          storage,
          ingressContract,
          api,
          signal,
        );
        if (ingress?.listener !== 'configured') throw new Error('Observed Azure platform ingress has not converged');
        const evidence = await (dependencies.collectTraffic ?? collectAzureTrafficProbe)(
          plan,
          storage,
          api,
          signal,
          `${plan.planId}-${action.id}-traffic-probe`,
        );
        await persistAzureNativeActionEvidence(plan, action, evidence, storage);
        if (evidence.status !== 'healthy') throw new Error('Observed end-to-end Azure traffic has not converged');
      }
      if (action.command && action.args) {
        const replacements = await replacementsFor(
          action.args,
          api,
          plan,
          action.expectedOwnerPlanSha256,
          networkUpdate,
          signal,
        );
        const execute = (bootstrapFile?: string) =>
          api.exec(
            action.command as 'az',
            resolveActionArgs(action.args ?? [], plan.planSha256, {
              ...replacements,
              ...(bootstrapFile ? { __BOOTSTRAP_FILE__: bootstrapFile } : {}),
            }),
          );
        const bootstrap = action.requiresBootstrap
          ? await azureNativeBootstrapForAction(plan, action, native, runtime, storage, signal)
          : undefined;
        if (action.mutates && action.kind !== 'resource-delete') {
          const pending = buildAzureNativePendingAction(plan, action);
          if (checkpoint.pendingAction) {
            validateAzureNativePendingAction(plan, checkpoint.completedActionIds, checkpoint.pendingAction);
          } else {
            checkpoint.pendingAction = pending;
            await saveCheckpoint(ctx.sessionManager, plan, checkpoint);
          }
        }
        const result = bootstrap ? await withAzureNativeBootstrapFile(bootstrap, execute) : await execute();
        if (result.exitCode !== 0)
          throw new Error(`Azure action ${action.id} failed with exit code ${result.exitCode}`);
        if (checkpoint.pendingAction) {
          const deadline = Date.now() + 15 * 60_000;
          const resolvedAction = {
            ...action,
            args: resolveActionArgs(action.args, plan.planSha256, replacements),
          };
          while (!(await azureNativePendingActionConverged(plan, resolvedAction, api, signal))) {
            if (Date.now() >= deadline) throw new Error('Azure native mutation postcondition has not converged');
            await new Promise<void>((resolve, reject) => {
              const abort = () => {
                clearTimeout(timer);
                reject(signal?.reason ?? new Error('Azure native mutation convergence cancelled'));
              };
              const timer = setTimeout(() => {
                signal?.removeEventListener('abort', abort);
                resolve();
              }, 10_000);
              signal?.addEventListener('abort', abort, { once: true });
              if (signal?.aborted) abort();
            });
          }
        }
        if (action.kind === 'resource-delete' && action.resourceId) {
          const deadline = Date.now() + 15 * 60_000;
          while (true) {
            postMutationObservation = await observe();
            const resource = postMutationObservation.resources.find(
              (candidate) => candidate.id.toLowerCase() === action.resourceId?.toLowerCase(),
            );
            if (!resource?.exists) break;
            if (Date.now() >= deadline) throw new Error('Azure resource deletion has not converged');
            await new Promise<void>((resolve, reject) => {
              const abort = () => {
                clearTimeout(timer);
                reject(signal?.reason ?? new Error('Azure deletion convergence cancelled'));
              };
              const timer = setTimeout(() => {
                signal?.removeEventListener('abort', abort);
                resolve();
              }, 10_000);
              signal?.addEventListener('abort', abort, { once: true });
              if (signal?.aborted) abort();
            });
          }
        }
        if (action.kind === 'vm-create' && action.node)
          await recordAzureNativeLaunch(plan, action.node, native, storage);
      }
      if (networkUpdate && action.mutates) {
        const observed = await captureAzureNetworkUpdateInventory(plan, api, signal);
        verifyAzureNetworkUpdateProgress(
          plan,
          networkUpdate.before,
          observed,
          azureNetworkUpdateAppliedNics(plan, [...completed, action.id], observed),
        );
        networkUpdate.current = observed;
        checkpoint.networkUpdate = networkUpdate;
      }
      completed.add(action.id);
      checkpoint.completedActionIds = [...completed];
      checkpoint.failedActionId = undefined;
      durableActionPending = checkpoint.pendingAction;
      checkpoint.pendingAction = undefined;
      checkpoint.state = completed.size === plan.actions.length ? 'complete' : 'running';
      const changesFingerprint = action.mutates;
      if (changesFingerprint) {
        const checkpointObservation = postMutationObservation ?? (await observe());
        checkpoint.observationFingerprint = fingerprintCheckpointObservation(checkpointObservation);
        checkpoint.observationSnapshot = structuredClone(checkpointObservation);
      }
      await saveCheckpoint(ctx.sessionManager, plan, checkpoint);
      if (networkUpdate && checkpoint.state !== 'complete')
        await persistAzureNativeNetworkCheckpointHistory(plan, checkpoint, storage);
    } catch (error) {
      completed.delete(action.id);
      checkpoint.completedActionIds = [...completed];
      checkpoint.observationFingerprint = preActionFingerprint;
      checkpoint.observationSnapshot = preActionSnapshot;
      checkpoint.pendingAction = durableActionPending ?? checkpoint.pendingAction;
      checkpoint.state = 'partial';
      checkpoint.failedActionId = action.id;
      await saveCheckpoint(ctx.sessionManager, plan, checkpoint);
      if (networkUpdate) await persistAzureNativeNetworkCheckpointHistory(plan, checkpoint, storage);
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}. Resume with the same plan ID and SHA-256; ${completed.size}/${plan.actions.length} actions are checkpointed.`,
      );
    }
  }
  return finalize(checkpoint);
}

export function createAzureCeApplyTool(
  pi: PluginInterface,
  makeApi: (cwd: string) => AzExecApi = makeExecApi,
  terraformDependencies: TerraformDependencies = terraformDefaults,
) {
  const { Type } = pi.typebox;
  return {
    name: 'azure_ce_apply',
    label: 'Apply Azure Customer Edge Plan',
    description:
      'Apply or resume only an exact persisted Azure CE plan ID and SHA-256 after stale-state, ownership, image, networking, quota, terms, and security-gate revalidation.',
    parameters: Type.Object({ planId: Type.String(), planSha256: Type.String() }),
    async execute(
      _id: string,
      params: ApplyParams,
      signal: AbortSignal | undefined,
      _update: unknown,
      ctx: AzureCeToolContext,
    ) {
      const originalPlanId = params?.planId;
      try {
        const request = captureAzureCeApplyRequest(params, ctx),
          serviceCallbacks = captureAzureCeApplyCallbacks(terraformDependencies, ['platform', 'terraform']),
          bus = pi.events,
          busCallbacks = bus && typeof bus === 'object' ? captureAzureCeApplyCallbacks(bus, ['emit']) : undefined;
        const seal = () => {
          signal?.throwIfAborted();
          request.assertUnchanged();
          serviceCallbacks();
          if (pi.events !== bus) throw Error('Azure CE apply event bus changed during execution');
          busCallbacks?.();
        };
        seal();
        const envelope = await loadPlanArtifact(
          request.context.sessionManager,
          request.input.planId,
          request.input.planSha256,
        );
        seal();
        request.bindPlatformContext(envelope.plan.intent.platformContext);
        if (envelope.plan.engine === 'terraform') {
          const platform = await terraformDependencies.platform(pi, signal);
          seal();
          const platformCallbacks = captureAzureCeApplyCallbacks(platform, [
            'storage',
            'runtime',
            'providerEnvironment',
            'siteBinding',
            'capabilities',
          ]);
          const terraform = await terraformDependencies.terraform(pi, signal);
          seal();
          platformCallbacks();
          const terraformCallbacks = captureAzureCeApplyCallbacks(terraform, ['open']);
          const api = withAzureCeExecution(makeApi(request.context.cwd), signal);
          seal();
          platformCallbacks();
          const guarded = guardAzureCeApplyServices(seal, api, platform, terraform);
          if (!guarded.terraform) throw Error('Azure CE Terraform service was not acquired');
          const result = await executeAzureCeTerraformApply(
            request.input,
            request.context,
            guarded.api,
            guarded.platform,
            guarded.terraform,
            signal,
          );
          seal();
          platformCallbacks();
          terraformCallbacks();
          const returned: Record<string, unknown> = result;
          if (
            returned.engine !== 'terraform' ||
            returned.planId !== request.input.planId ||
            returned.planSha256 !== request.input.planSha256
          )
            throw Error('Azure CE Terraform result differs from the original persisted plan identity');
          return {
            content: [
              {
                type: 'text' as const,
                text: `Azure CE Terraform plan ${request.input.planId}: ${result.status}. Routing and traffic remain separate collected evidence.`,
              },
            ],
            details: { tool: 'azure_ce_apply', ...result, engine: 'terraform' as const, ...request.input },
          };
        }
        const api = withAzureCeExecution(makeApi(request.context.cwd), signal);
        seal();
        const { plan, checkpoint } = await executeAzureCeNativeApply(
          request.input,
          request.context,
          api,
          async () => {
            seal();
            const platform = await terraformDependencies.platform(pi, signal);
            seal();
            return guardAzureCeApplyServices(seal, api, platform).platform;
          },
          signal,
        );
        seal();
        if (
          plan.engine !== 'native' ||
          plan.planId !== request.input.planId ||
          plan.planSha256 !== request.input.planSha256 ||
          checkpoint.planId !== request.input.planId ||
          checkpoint.planSha256 !== request.input.planSha256
        )
          throw Error('Azure CE native result differs from the original persisted plan identity');
        return {
          content: [
            {
              type: 'text' as const,
              text: `Azure CE plan ${plan.planId} applied successfully. ${checkpoint.completedActionIds.length} ordered actions are checkpointed and verified.`,
            },
          ],
          details: { tool: 'azure_ce_apply', planId: plan.planId, checkpoint },
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Azure CE apply stopped safely: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'azure_ce_apply', planId: originalPlanId },
        };
      }
    },
  };
}
