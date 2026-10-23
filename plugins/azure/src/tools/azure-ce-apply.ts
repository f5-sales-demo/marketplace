import { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { CeTerraformService } from '../../../terraform/src/service';
import type { AzExecApi } from '../az/exec';
import type { PluginInterface } from '../az/types';
import { assertActionOwnership, assertApplyAllowed, assertObservationFresh, resolveActionArgs } from '../ce/apply';
import { type AzureCeToolContext, loadCheckpoint, loadPlanArtifact, saveCheckpoint } from '../ce/artifacts';
import { safeHexEqual } from '../ce/canonical';
import { discoverAzureCompute } from '../ce/discovery';
import { withAzureCeExecution } from '../ce/execution';
import { resolveInterfaceAddress } from '../ce/interface-address';
import {
  azureNativePendingActionConverged,
  buildAzureNativePendingAction,
  validateAzureNativePendingAction,
} from '../ce/native-action-recovery';
import {
  azureNativeBootstrapForAction,
  collectAzureNativeAdmissionHealth,
  collectAzureNativeVmState,
  prepareAzureNativeAdmission,
  prepareAzureNativeReplacement,
  recordAzureNativeLaunch,
  withAzureNativeBootstrapFile,
} from '../ce/native-workflow';
import { azurePlatformService, azureTerraformService } from '../ce/platform';
import { ensureAzurePlatformIngress } from '../ce/platform-ingress';
import {
  collectAzureAbsentDeletionTail,
  fingerprintCheckpointObservation,
  reconcileAzureNativeDeletionPrefix,
  upgradeAzureCeCheckpoint,
  validateAzureDeletionTail,
} from '../ce/recovery';
import { configureAzureRouteServerRouting } from '../ce/routing-workflow';
import { executeAzureCeTerraformApply } from '../ce/terraform-apply';
import { collectAzureTrafficProbe } from '../ce/traffic-probe';
import type { AzureCeCheckpoint, AzureCePlan } from '../ce/types';
import { AZURE_CE_CHECKPOINT_SCHEMA_VERSION, AZURE_CE_SCHEMA_VERSION } from '../ce/types';
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
): Promise<Record<string, string>> {
  const replacements: Record<string, string> = {};
  for (const arg of args) {
    const match = /^__NODE_(\d+)_(SLO|SLI|DATA)_PRIVATE_IP__$/.exec(arg);
    if (!match || replacements[arg]) continue;
    const role = match[2] === 'SLO' || (match[2] === 'DATA' && plan.nics.length === 1) ? 'slo' : 'sli';
    replacements[arg] = await resolveInterfaceAddress(api, plan, Number(match[1]), role, ownerPlanSha256);
  }
  return replacements;
}

export async function executeAzureCeNativeApply(
  params: ApplyParams,
  ctx: AzureCeToolContext,
  api: AzExecApi,
  platformFactory: () => Promise<CePlatformService>,
  signal?: AbortSignal,
  dependencies: NativeApplyDependencies = {},
) {
  const { plan, observation } = await loadPlanArtifact(ctx.sessionManager, params.planId, params.planSha256);
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
  if (existing?.schemaVersion === AZURE_CE_SCHEMA_VERSION) {
    if (existing.completedActionIds.length === 0) assertObservationFresh(plan, current);
    if (
      plan.intent.operation === 'teardown' &&
      hasImmutableDeleteTail &&
      (await collectAzureAbsentDeletionTail(plan, existing.completedActionIds, api, signal)).length > 0
    ) {
      throw new Error('Stale incomplete legacy Azure teardown checkpoint cannot be recovered safely');
    }
    existing = upgradeAzureCeCheckpoint(plan, existing, current);
    await saveCheckpoint(ctx.sessionManager, plan, existing);
  }
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
      if (existing.state === 'complete') return { plan, checkpoint: existing };
    }
  }
  if (existing?.schemaVersion === AZURE_CE_CHECKPOINT_SCHEMA_VERSION && existing.pendingAction) {
    const action = plan.actions[existing.completedActionIds.length];
    if (!action) throw new Error('Pending Azure native mutation has no next immutable action');
    validateAzureNativePendingAction(plan, existing.completedActionIds, existing.pendingAction);
    const replacements = await replacementsFor(action.args ?? [], api, plan, action.expectedOwnerPlanSha256);
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
        observationFingerprint: currentFingerprint,
        observationSnapshot: structuredClone(current),
        state: existing.completedActionIds.length + 1 === plan.actions.length ? 'complete' : 'running',
      };
      await saveCheckpoint(ctx.sessionManager, plan, existing);
      if (existing.state === 'complete') return { plan, checkpoint: existing };
    }
  }
  if (existing?.observationFingerprint) {
    if (!safeHexEqual(existing.observationFingerprint, currentFingerprint)) {
      throw new Error('Stale Azure CE checkpoint: observations changed outside an allowed recovery boundary');
    }
  } else {
    assertObservationFresh(plan, current);
  }
  if (existing?.state === 'complete') return { plan, checkpoint: existing };
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
    state: 'running',
  };
  await saveCheckpoint(ctx.sessionManager, plan, checkpoint);
  const platform = await platformFactory();
  const runtime = await platform.runtime('native', plan.intent.platformContext);
  const storage = await platform.storage({
    deploymentId: plan.deploymentName,
    engine: 'native',
    provider: 'azure',
    account: plan.subscription.id,
    region: plan.region,
  });
  const ingressContract =
    plan.intent.ingress?.mode === 'platform-http'
      ? await (dependencies.ingressContract?.() ?? VerifiedIngressContract.release(undefined, signal))
      : undefined;
  const native = await prepareAzureNativeAdmission(plan, runtime, storage, signal);
  if (recoveredNativeLaunchNode) await recordAzureNativeLaunch(plan, recoveredNativeLaunchNode, native, storage);
  if (plan.intent.operation === 'replace-node')
    await prepareAzureNativeReplacement(plan, native, api, runtime, storage, signal);
  for (const action of plan.actions) {
    if (completed.has(action.id)) continue;
    const preActionFingerprint = checkpoint.observationFingerprint;
    const preActionSnapshot = checkpoint.observationSnapshot;
    try {
      let postMutationObservation: Awaited<ReturnType<typeof observe>> | undefined;
      await assertActionOwnership(plan, action, api);
      if (action.kind === 'vm-state-gate') {
        const deadline = Date.now() + 15 * 60_000;
        while (true) {
          const evidence = await collectAzureNativeVmState(plan, action, api, signal);
          await storage.write(`${action.id}-evidence.json`, evidence);
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
            plan.intent.operation === 'replace-node'
              ? plan.topology.nodeCount
              : (action.node ?? plan.topology.nodeCount),
            api,
            runtime,
            storage,
            signal,
            native,
          );
          await storage.write(`${action.id}-evidence.json`, {
            ...evidence,
            planId: plan.planId,
            planSha256: plan.planSha256,
          });
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
          const evidence = await configureAzureRouteServerRouting(
            plan,
            expectedInterfaces,
            runtime,
            storage,
            api,
            signal,
            native.replacement?.routeServer,
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
        await storage.write(`${action.id}-evidence.json`, evidence);
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
        await storage.write(`${action.id}-evidence.json`, evidence);
        if (evidence.status !== 'healthy') throw new Error('Observed end-to-end Azure traffic has not converged');
      }
      if (action.command && action.args) {
        const replacements = await replacementsFor(action.args, api, plan, action.expectedOwnerPlanSha256);
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
      completed.add(action.id);
      checkpoint.completedActionIds = [...completed];
      checkpoint.failedActionId = undefined;
      checkpoint.pendingAction = undefined;
      checkpoint.state = completed.size === plan.actions.length ? 'complete' : 'running';
      const changesFingerprint = action.mutates;
      if (changesFingerprint) {
        const checkpointObservation = postMutationObservation ?? (await observe());
        checkpoint.observationFingerprint = fingerprintCheckpointObservation(checkpointObservation);
        checkpoint.observationSnapshot = structuredClone(checkpointObservation);
      }
      await saveCheckpoint(ctx.sessionManager, plan, checkpoint);
    } catch (error) {
      completed.delete(action.id);
      checkpoint.completedActionIds = [...completed];
      checkpoint.observationFingerprint = preActionFingerprint;
      checkpoint.observationSnapshot = preActionSnapshot;
      checkpoint.state = 'partial';
      checkpoint.failedActionId = action.id;
      await saveCheckpoint(ctx.sessionManager, plan, checkpoint);
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}. Resume with the same plan ID and SHA-256; ${completed.size}/${plan.actions.length} actions are checkpointed.`,
      );
    }
  }
  return { plan, checkpoint };
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
    parameters: Type.Object({
      planId: Type.String(),
      planSha256: Type.String(),
    }),
    async execute(
      _id: string,
      params: ApplyParams,
      signal: AbortSignal | undefined,
      _update: unknown,
      ctx: AzureCeToolContext,
    ) {
      try {
        const envelope = await loadPlanArtifact(ctx.sessionManager, params.planId, params.planSha256);
        if (envelope.plan.engine === 'terraform') {
          const platform = await terraformDependencies.platform(pi, signal);
          const result = await executeAzureCeTerraformApply(
            params,
            ctx,
            withAzureCeExecution(makeApi(ctx.cwd), signal),
            platform,
            await terraformDependencies.terraform(pi, signal),
            signal,
          );
          return {
            content: [
              {
                type: 'text' as const,
                text: `Azure CE Terraform plan ${envelope.plan.planId}: ${result.status}. Routing and traffic remain separate collected evidence.`,
              },
            ],
            details: { tool: 'azure_ce_apply', ...result },
          };
        }
        const { plan, checkpoint } = await executeAzureCeNativeApply(
          params,
          ctx,
          withAzureCeExecution(makeApi(ctx.cwd), signal),
          () => terraformDependencies.platform(pi, signal),
          signal,
        );
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
          details: { tool: 'azure_ce_apply', planId: params.planId },
        };
      }
    },
  };
}
