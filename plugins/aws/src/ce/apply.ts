import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AwsExecApi } from '../aws/exec';
import type { AwsCeToolContext } from './artifacts';
import { loadAwsCheckpoint, loadAwsPlan, saveAwsCheckpoint } from './artifacts';
import { canonicalSha256, fingerprintObservation, safeHexEqual, sha256Hex } from './canonical';
import { renderAwsCeCloudInit } from './cloud-init';
import { discoverAwsCompute, observeAwsResources } from './discovery';
import { consumeAwsBootstrapRef } from './token-consumer';
import type { AwsCeAction, AwsCeCheckpoint, AwsCeF5Capabilities, AwsCeObservation, AwsCePlan } from './types';
import { AWS_CE_SCHEMA_VERSION } from './types';

export interface AwsCeApplyInput {
  planId: string;
  planSha256: string;
  bootstrapRefs?: Array<{ node: number; reference: string }>;
  f5Capabilities: AwsCeF5Capabilities;
  f5Evidence?: {
    registeredNodes?: number[];
    healthyNodes?: number[];
    bgpEstablished?: boolean;
    nlbHealthy?: boolean;
    tgwRoutesHealthy?: boolean;
    trafficHealthy?: boolean;
  };
}

export function assertAwsObservationFresh(
  plan: AwsCePlan,
  current: AwsCeObservation,
  expected = plan.observationFingerprint,
  relevantResourceIds = [
    ...plan.intent.brownfield.resourceIds,
    ...plan.ownershipInventory
      .filter((item) => item.owned && !item.resourceId.startsWith('aws://'))
      .map((item) => item.resourceId),
  ],
) {
  const actual = fingerprintObservation(current, relevantResourceIds);
  if (!safeHexEqual(expected, actual))
    throw new Error(`Stale AWS CE plan: observations changed (expected ${expected}, current ${actual})`);
}

export function assertAwsApplyAllowed(
  plan: AwsCePlan,
  request: { planId: string; planSha256: string; hasUI: boolean; env: Record<string, string | undefined> },
) {
  if (plan.schemaVersion !== AWS_CE_SCHEMA_VERSION) throw new Error('AWS CE plan schema is unsupported');
  if (request.planId !== plan.planId) throw new Error('The requested AWS CE plan ID does not match the persisted plan');
  if (!safeHexEqual(request.planSha256, plan.planSha256))
    throw new Error('The requested AWS CE plan hash does not match');
  if (!request.hasUI && request.env.XCSH_CE_HEADLESS_MUTATIONS !== '1')
    throw new Error('Headless AWS CE mutations require XCSH_CE_HEADLESS_MUTATIONS=1');
  if (plan.intent.operation === 'teardown' && !request.hasUI && request.env.XCSH_CE_ALLOW_DESTROY !== '1')
    throw new Error('Headless AWS CE teardown requires XCSH_CE_ALLOW_DESTROY=1');
}

function replaceArgs(args: string[], planSha256: string, values: Record<string, string>): string[] {
  return args.map((arg) => {
    let result = arg.replaceAll('__PLAN_SHA256__', planSha256);
    for (const [placeholder, value] of Object.entries(values)) result = result.replaceAll(placeholder, value);
    if (/__[A-Z0-9_]+__/.test(result)) throw new Error(`AWS action has an unresolved runtime placeholder: ${result}`);
    if (Array.from(result).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))
      throw new Error('AWS action argv contains a control character');
    return result;
  });
}

function valueAtPath(raw: unknown, path: string): string | undefined {
  let value: unknown = raw;
  for (const segment of path.split('.')) {
    if (Array.isArray(value) && /^\d+$/.test(segment)) value = value[Number(segment)];
    else if (value && typeof value === 'object') value = (value as Record<string, unknown>)[segment];
    else return undefined;
  }
  return typeof value === 'string' && value ? value : undefined;
}

export async function assertAwsActionOwnership(plan: AwsCePlan, action: AwsCeAction, _api: AwsExecApi): Promise<void> {
  if (!action.mutates || action.resourceId?.startsWith('aws://')) return;
  if (action.kind === 'brownfield-restore' || action.kind.startsWith('route-') || action.kind.startsWith('tgw-')) {
    const allowlisted = plan.ownershipInventory.some(
      (item) => item.resourceId === action.resourceId && item.action === 'modify-approved',
    );
    if (action.resourceId && !allowlisted && !action.args?.some((arg) => arg.startsWith('__')))
      throw new Error(`AWS brownfield target is outside the approved inventory: ${action.resourceId}`);
    return;
  }
  if (!action.resourceId || action.resourceId.includes('__')) return;
  const owned = plan.ownershipInventory.some(
    (item) =>
      item.resourceId === action.resourceId && item.owned && (item.action === 'reference' || item.action === 'delete'),
  );
  if (!owned) throw new Error(`Refusing to mutate unmanaged AWS resource ${action.resourceId}`);
}

function assertGate(action: AwsCeAction, input: AwsCeApplyInput): void {
  if (action.kind === 'registration-gate' && action.node && !input.f5Evidence?.registeredNodes?.includes(action.node))
    throw new Error(`F5 registration evidence is missing for node ${action.node}`);
  if (action.kind === 'health-gate' && action.node && !input.f5Evidence?.healthyNodes?.includes(action.node))
    throw new Error(`F5 health evidence is missing for node ${action.node}`);
  if (action.kind === 'bgp-gate' && !input.f5Evidence?.bgpEstablished)
    throw new Error('F5 BGP evidence is not established');
  if (action.kind === 'nlb-gate' && !input.f5Evidence?.nlbHealthy)
    throw new Error('NLB target evidence is not healthy');
  if (action.kind === 'tgw-route-gate' && !input.f5Evidence?.tgwRoutesHealthy)
    throw new Error('Transit Gateway route evidence is not healthy');
  if (action.kind === 'traffic-gate' && !input.f5Evidence?.trafficHealthy)
    throw new Error('End-to-end traffic evidence is not healthy');
}

export async function executeAwsCeApply(
  input: AwsCeApplyInput,
  ctx: AwsCeToolContext,
  api: AwsExecApi,
  fetcher: typeof fetch = fetch,
) {
  const { plan, observation } = await loadAwsPlan(ctx.sessionManager, input.planId, input.planSha256);
  assertAwsApplyAllowed(plan, {
    planId: input.planId,
    planSha256: input.planSha256,
    hasUI: ctx.hasUI,
    env: process.env,
  });
  const existing = await loadAwsCheckpoint(ctx.sessionManager, plan.planId, plan.planSha256);
  const brownfieldIds = [
    ...new Set([
      ...plan.intent.brownfield.resourceIds,
      ...plan.intent.brownfield.routeTableIds,
      ...plan.intent.brownfield.transitGatewayRouteTableIds,
    ]),
  ].sort();
  const resourceIdPattern =
    /^(?:arn:(?:aws|aws-us-gov|aws-cn):[a-z0-9-]+:[a-z0-9-]*:\d{12}:[A-Za-z0-9_+=,.@:/-]+|(?:i|vpc|subnet|rtb|tgw|tgw-attach|tgw-connect-peer|tgw-rtb|eni|sg|eipalloc|eipassoc|nat|vpce)-[0-9a-f]{8,21})$/;
  const observedOwnedIds = () =>
    [
      ...new Set([
        ...observation.resources.filter((resource) => resource.owned).map((resource) => resource.id),
        ...Object.values(existing?.resolvedValues ?? {}).filter((value) => resourceIdPattern.test(value)),
      ]),
    ].sort();
  const ownershipPlanSha256s = [
    ...new Set([
      ...observation.ownershipPlanSha256s,
      ...observation.resources
        .filter((resource) => resource.owned)
        .map((resource) => resource.tags['xcsh-plan-sha256'])
        .filter((digest): digest is string => /^[a-f0-9]{64}$/.test(digest ?? '')),
      plan.planSha256,
    ]),
  ].sort();
  const current = await discoverAwsCompute(
    {
      accountId: plan.accountId,
      partition: plan.partition,
      deploymentName: plan.deploymentName,
      requiredEnis: plan.interfaces.length,
      nodeCount: plan.topology.nodeCount,
      instanceTypes: [plan.instance.type],
      brownfieldResourceIds: brownfieldIds,
      observedOwnedResourceIds: observedOwnedIds(),
      ownedPlanSha256s: ownershipPlanSha256s,
      resourceRegion: plan.region,
      egressMode: plan.egress.mode,
      routingProfile: plan.routing.profile,
      f5Capabilities: input.f5Capabilities,
    },
    api,
    fetcher,
  );
  assertAwsObservationFresh(plan, current, existing?.observationFingerprint ?? plan.observationFingerprint, [
    ...brownfieldIds,
    ...observedOwnedIds(),
  ]);
  if (existing?.ownedStateFingerprint) {
    const actualOwnedState = canonicalSha256(
      current.resources.filter((resource) => observedOwnedIds().includes(resource.id)),
    );
    if (!safeHexEqual(existing.ownedStateFingerprint, actualOwnedState))
      throw new Error('Stale AWS CE plan: owned resource tags, targets, attachments, peers, or state changed');
  }
  const expectedPrefix = plan.actions.slice(0, existing?.completedActionIds.length ?? 0).map((action) => action.id);
  if (existing && JSON.stringify(existing.completedActionIds) !== JSON.stringify(expectedPrefix))
    throw new Error('AWS CE checkpoint is not an ordered prefix of the immutable plan');
  if (ctx.hasUI) {
    if (!(await ctx.ui.confirm('Apply immutable AWS CE plan', `${plan.planId}\n${plan.planSha256}`)))
      throw new Error('AWS CE apply was not approved');
    if (
      plan.intent.operation === 'teardown' &&
      !(await ctx.ui.confirm(
        'Tear down AWS Customer Edge',
        'Restore approved brownfield state and delete only owned resources?',
      ))
    )
      throw new Error('AWS CE teardown was not approved');
  }
  const completed = new Set(existing?.completedActionIds ?? []);
  const checkpoint: AwsCeCheckpoint = {
    schemaVersion: AWS_CE_SCHEMA_VERSION,
    planId: plan.planId,
    planSha256: plan.planSha256,
    completedActionIds: [...completed],
    observationFingerprint: existing?.observationFingerprint,
    resolvedValues: { ...(existing?.resolvedValues ?? {}) },
    state: 'running',
  };
  for (const action of plan.actions) {
    if (completed.has(action.id)) continue;
    let launchDirectory: string | undefined;
    try {
      await assertAwsActionOwnership(plan, action, api);
      assertGate(action, input);
      if (action.command && action.args) {
        if (action.requiresBootstrap && action.node) {
          const reference = input.bootstrapRefs?.find((item) => item.node === action.node)?.reference;
          if (!reference) throw new Error(`A just-in-time bootstrap reference is required for node ${action.node}`);
          const token = await consumeAwsBootstrapRef(reference, ctx.sessionManager.getSessionId());
          const root = join(tmpdir(), 'xcsh-aws-ce-launch', sha256Hex(ctx.sessionManager.getSessionId()).slice(0, 24));
          await mkdir(root, { recursive: true, mode: 0o700 });
          await chmod(root, 0o700);
          launchDirectory = await mkdtemp(join(root, 'node-'));
          await chmod(launchDirectory, 0o700);
          const path = join(launchDirectory, 'cloud-init.yaml');
          await writeFile(
            path,
            renderAwsCeCloudInit({ siteName: plan.siteName, nodeName: `${plan.deploymentName}-${action.node}`, token }),
            { mode: 0o600 },
          );
          checkpoint.resolvedValues.__BOOTSTRAP_FILE__ = path;
        }
        const args = replaceArgs(action.args, plan.planSha256, checkpoint.resolvedValues);
        const result = await api.exec(action.command, args);
        if (launchDirectory) {
          delete checkpoint.resolvedValues.__BOOTSTRAP_FILE__;
          await rm(launchDirectory, { recursive: true, force: true });
          launchDirectory = undefined;
        }
        if (result.exitCode !== 0) throw new Error(`AWS action ${action.id} failed: ${result.stderr.slice(0, 500)}`);
        if (action.capture || action.captures) {
          let raw: unknown;
          try {
            raw = JSON.parse(result.stdout);
          } catch {
            throw new Error(`AWS action ${action.id} returned invalid capture JSON`);
          }
          for (const capture of [...(action.capture ? [action.capture] : []), ...(action.captures ?? [])]) {
            const value = valueAtPath(raw, capture.path);
            if (!value) throw new Error(`AWS action ${action.id} did not return ${capture.path}`);
            checkpoint.resolvedValues[capture.placeholder] = value;
          }
        }
      }
      completed.add(action.id);
      checkpoint.completedActionIds = [...completed];
      checkpoint.failedActionId = undefined;
      if (action.mutates) {
        const ids = [
          ...new Set([
            ...brownfieldIds,
            ...observation.resources.filter((resource) => resource.owned).map((resource) => resource.id),
            ...Object.values(checkpoint.resolvedValues).filter((value) => resourceIdPattern.test(value)),
          ]),
        ].sort();
        if (ids.length) {
          const resources = await observeAwsResources(api, ids, plan.region, {
            deploymentName: plan.deploymentName,
            planSha256s: ownershipPlanSha256s,
          });
          const ownedIds = ids.filter((id) => !brownfieldIds.includes(id));
          checkpoint.ownedStateFingerprint = canonicalSha256(
            resources.filter((resource) => ownedIds.includes(resource.id)),
          );
          checkpoint.observationFingerprint = fingerprintObservation({ ...current, resources }, ids);
        }
      }
      await saveAwsCheckpoint(ctx.sessionManager, checkpoint);
    } catch (error) {
      if (launchDirectory) await rm(launchDirectory, { recursive: true, force: true });
      delete checkpoint.resolvedValues.__BOOTSTRAP_FILE__;
      checkpoint.state = 'partial';
      checkpoint.failedActionId = action.id;
      await saveAwsCheckpoint(ctx.sessionManager, checkpoint);
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}. Resume with the same plan ID and SHA-256; ${completed.size}/${plan.actions.length} actions are checkpointed.`,
      );
    }
  }
  checkpoint.state = 'complete';
  await saveAwsCheckpoint(ctx.sessionManager, checkpoint);
  return { plan, checkpoint };
}
