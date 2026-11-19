import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AzExecApi } from '../az/exec';
import type { PluginInterface } from '../az/types';
import { assertActionOwnership, assertApplyAllowed, assertObservationFresh, resolveActionArgs } from '../ce/apply';
import { type AzureCeToolContext, loadCheckpoint, loadPlanArtifact, saveCheckpoint } from '../ce/artifacts';
import { fingerprintObservation, sha256Hex } from '../ce/canonical';
import { renderCeCloudInit } from '../ce/cloud-init';
import { discoverAzureCompute } from '../ce/discovery';
import { observeAzureHealth } from '../ce/health-observation';
import { shutdownProperties, verifyShutdown } from '../ce/lifetime';
import { consumeBootstrapRef } from '../ce/token-consumer';
import type { AzureCeCheckpoint, AzureCePlan } from '../ce/types';
import { AZURE_CE_SCHEMA_VERSION } from '../ce/types';
import { makeExecApi } from './shared';

interface ApplyParams {
  planId: string;
  planSha256: string;
  bootstrapRefs?: Array<{ node: number; reference: string }>;
}

async function privateIp(api: AzExecApi, plan: AzureCePlan, node: number, nicIndex: number): Promise<string> {
  const result = await api.exec('az', [
    'network',
    'nic',
    'show',
    '--resource-group',
    plan.intent.resourceGroup,
    '--name',
    `${plan.deploymentName}-${node}-nic${nicIndex}`,
    '--query',
    'ipConfigurations[0].privateIPAddress',
    '--output',
    'tsv',
    '--subscription',
    plan.subscription.id,
  ]);
  if (result.exitCode !== 0) throw new Error(`Unable to resolve CE node ${node} private IP`);
  const value = result.stdout.trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(value))
    throw new Error(`Azure returned an invalid private IP for CE node ${node}`);
  return value;
}

async function replacementsFor(args: string[], api: AzExecApi, plan: AzureCePlan): Promise<Record<string, string>> {
  const replacements: Record<string, string> = {};
  for (const arg of args) {
    const match = /^__NODE_(\d+)_(SLI|DATA)_PRIVATE_IP__$/.exec(arg);
    if (!match || replacements[arg]) continue;
    const nicIndex = plan.nics.length > 1 ? 1 : 0;
    replacements[arg] = await privateIp(api, plan, Number(match[1]), nicIndex);
  }
  return replacements;
}

async function executeApply(params: ApplyParams, ctx: AzureCeToolContext, api: AzExecApi) {
  const { plan, observation } = await loadPlanArtifact(ctx.sessionManager, params.planId, params.planSha256);
  assertApplyAllowed(plan, {
    planId: params.planId,
    planSha256: params.planSha256,
    hasUI: ctx.hasUI,
    env: process.env,
  });
  const existing = await loadCheckpoint(ctx.sessionManager, plan.planId, plan.planSha256);
  const startedAt = existing?.startedAt ?? new Date().toISOString();
  const shutdownDeadline =
    existing?.shutdownDeadline ??
    (plan.intent.vm.shutdownAfterHours
      ? new Date(
          Math.floor((Date.parse(startedAt) + plan.intent.vm.shutdownAfterHours * 3600_000) / 60_000) * 60_000,
        ).toISOString()
      : undefined);
  if (existing) {
    const expectedPrefix = plan.actions.slice(0, existing.completedActionIds.length).map((action) => action.id);
    if (JSON.stringify(existing.completedActionIds) !== JSON.stringify(expectedPrefix))
      throw new Error('Persisted checkpoint is not an ordered prefix of the immutable plan');
    if (existing.observationFingerprint && !/^[a-f0-9]{64}$/.test(existing.observationFingerprint))
      throw new Error('Persisted checkpoint has an invalid observation fingerprint');
  }
  const completed = new Set(existing?.completedActionIds ?? []);
  const observe = () =>
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
        region: plan.intent.region,
      },
      api,
    );
  const current = await observe();
  if (
    !existing?.observationFingerprint &&
    completed.has(plan.actions.find((action) => action.kind === 'marketplace-terms-accept')?.id ?? '')
  )
    current.image.termsAccepted = observation.image.termsAccepted;
  assertObservationFresh(plan, current, existing?.observationFingerprint);

  if (ctx.hasUI) {
    const confirmed = await ctx.ui.confirm(
      'Apply immutable Azure CE plan',
      `${plan.planId}\n${plan.planSha256}\n${plan.actions.length - completed.size} action(s) remain.`,
    );
    if (!confirmed) throw new Error('Apply was not approved');
    if (plan.actions.some((action) => action.kind === 'marketplace-terms-accept' && !completed.has(action.id))) {
      const terms = await ctx.ui.confirm(
        'Accept Azure Marketplace terms',
        `Accept the legal terms for ${plan.image.urn}?`,
      );
      if (!terms) throw new Error('Marketplace terms were not approved');
    }
    if (plan.intent.operation === 'teardown') {
      const destroy = await ctx.ui.confirm(
        'Tear down Customer Edge',
        `Drain routing, restore approved brownfield state, and delete only resources owned by ${plan.deploymentName}?`,
      );
      if (!destroy) throw new Error('Teardown was not approved');
    }
  }

  const checkpoint: AzureCeCheckpoint = {
    startedAt,
    shutdownDeadline,
    schemaVersion: AZURE_CE_SCHEMA_VERSION,
    planId: plan.planId,
    planSha256: plan.planSha256,
    completedActionIds: [...completed],
    observationFingerprint: existing?.observationFingerprint,
    state: 'running',
  };
  await saveCheckpoint(ctx.sessionManager, checkpoint);
  for (const action of plan.actions) {
    if (completed.has(action.id)) continue;
    let launchDir: string | undefined;
    try {
      await assertActionOwnership(plan, action, api);
      if (action.kind === 'health-gate' && action.node) {
        const observation = await observeAzureHealth(plan, action.node, api, process.env);
        await ctx.sessionManager.saveArtifact(JSON.stringify(observation), 'azure-ce-health');
        if (observation.status !== 'healthy')
          throw new Error(`F5 health gate is ${observation.status}: ${observation.reason}`);
      }
      if (action.kind === 'bgp-gate') throw new Error('Measured Azure BGP admission is unavailable');
      if (action.kind === 'traffic-gate') throw new Error('Measured Azure traffic admission is unavailable');
      if (action.kind === 'vm-create' && shutdownDeadline) {
        const protection = plan.actions.find((item) => item.kind === 'vm-shutdown-arm' && item.node === action.node);
        if (!protection) throw new Error('Immutable plan has no pre-launch shutdown protection');
        await verifyShutdown(plan, protection, shutdownDeadline, api);
      }
      if (action.command && action.args) {
        const replacements = await replacementsFor(action.args, api, plan);
        if (action.kind === 'vm-shutdown-arm') {
          if (!shutdownDeadline) throw new Error('Durable shutdown deadline is missing');
          replacements.__SHUTDOWN_PROPERTIES__ = JSON.stringify(
            shutdownProperties(plan, action.node!, shutdownDeadline),
          );
        }
        if (action.requiresBootstrap && action.node) {
          const reference = params.bootstrapRefs?.find((item) => item.node === action.node)?.reference;
          if (!reference) throw new Error(`A just-in-time bootstrap reference is required for node ${action.node}`);
          const token = await consumeBootstrapRef(reference, ctx.sessionManager.getSessionId());
          const sessionRoot = join(
            tmpdir(),
            'xcsh-azure-ce-launch',
            sha256Hex(ctx.sessionManager.getSessionId()).slice(0, 24),
          );
          await mkdir(sessionRoot, { recursive: true, mode: 0o700 });
          launchDir = await mkdtemp(join(sessionRoot, 'node-'));
          const bootstrapPath = join(launchDir, 'cloud-init.yaml');
          await writeFile(
            bootstrapPath,
            renderCeCloudInit({ siteName: plan.siteName, nodeName: `${plan.deploymentName}-${action.node}`, token }),
            { mode: 0o600 },
          );
          replacements.__BOOTSTRAP_FILE__ = bootstrapPath;
        }
        const result = await api.exec(action.command, resolveActionArgs(action.args, plan.planSha256, replacements));
        if (result.exitCode !== 0) {
          const artifact = await ctx.sessionManager.saveArtifact(
            JSON.stringify({ actionId: action.id, exitCode: result.exitCode, stderr: result.stderr }),
            'azure-ce-private-failure',
          );
          if (artifact) {
            const path = await ctx.sessionManager.getArtifactPath(artifact);
            if (path) await chmod(path, 0o600);
          }
          throw new Error(
            `Azure action ${action.id} failed with exit ${result.exitCode}; diagnostic evidence retained privately`,
          );
        }
        if (action.kind === 'vm-shutdown-arm') await verifyShutdown(plan, action, shutdownDeadline!, api);
      }
      completed.add(action.id);
      checkpoint.completedActionIds = [...completed];
      checkpoint.failedActionId = undefined;
      const changesFingerprint =
        action.kind === 'marketplace-terms-accept' ||
        action.kind === 'route-association-update' ||
        action.kind === 'brownfield-restore' ||
        (action.kind === 'route-create' && plan.intent.brownfield.routeChanges.length > 0);
      if (changesFingerprint)
        checkpoint.observationFingerprint = fingerprintObservation(await observe(), plan.intent.brownfield.resourceIds);
      await saveCheckpoint(ctx.sessionManager, checkpoint);
    } catch (error) {
      checkpoint.state = 'partial';
      checkpoint.failedActionId = action.id;
      await saveCheckpoint(ctx.sessionManager, checkpoint);
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}. Resume with the same plan ID and SHA-256; ${completed.size}/${plan.actions.length} actions are checkpointed.`,
      );
    } finally {
      if (launchDir) await rm(launchDir, { recursive: true, force: true });
    }
  }
  checkpoint.state = 'complete';
  await saveCheckpoint(ctx.sessionManager, checkpoint);
  return { plan, checkpoint };
}

export function createAzureCeApplyTool(pi: PluginInterface, makeApi: (cwd: string) => AzExecApi = makeExecApi) {
  const { Type } = pi.typebox;
  return {
    name: 'azure_ce_apply',
    label: 'Apply Azure Customer Edge Plan',
    description:
      'Apply or resume only an exact persisted Azure CE plan ID and SHA-256 after stale-state, ownership, image, networking, quota, terms, and security-gate revalidation.',
    parameters: Type.Object({
      planId: Type.String(),
      planSha256: Type.String(),
      bootstrapRefs: Type.Optional(Type.Array(Type.Object({ node: Type.Number(), reference: Type.String() }))),
    }),
    async execute(
      _id: string,
      params: ApplyParams,
      _signal: AbortSignal | undefined,
      _update: unknown,
      ctx: AzureCeToolContext,
    ) {
      try {
        const { plan, checkpoint } = await executeApply(params, ctx, makeApi(ctx.cwd));
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
