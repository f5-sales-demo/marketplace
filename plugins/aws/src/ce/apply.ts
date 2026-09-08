import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { AwsExecApi } from '../aws/exec';
import type { AwsCeToolContext } from './artifacts';
import { loadAwsCheckpoint, loadAwsPlan, saveAwsCheckpoint } from './artifacts';
import { assertAttachmentAvailable } from './attachment-gate';
import { fingerprintObservation, fingerprintOwnedResources, safeHexEqual } from './canonical';
import { renderAwsCeCloudInit } from './cloud-init';
import { executeRecoverableCreate, hasCreateRecovery } from './create-recovery';
import { discoverAwsCompute, observeAwsResources } from './discovery';
import { collectAwsNetworkHealth } from './network-health';
import { configureAwsRouting } from './routing-apply';
import { scopedAwsApi } from './scoped-exec';
import { siteBindings } from './topology';
import type { AwsCeAction, AwsCeCheckpoint, AwsCeObservation, AwsCePlan } from './types';
import { AWS_CE_DEFAULT_INTERFACE_MTU, AWS_CE_SCHEMA_VERSION } from './types';

export interface AwsCeApplyInput {
  planId: string;
  planSha256: string;
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
  request: {
    planId: string;
    planSha256: string;
    hasUI: boolean;
    env: Record<string, string | undefined>;
    authorized?: boolean;
    destructionAuthorized?: boolean;
    executionEngine?: 'native' | 'terraform';
  },
) {
  if (plan.schemaVersion !== AWS_CE_SCHEMA_VERSION) throw new Error('AWS CE plan schema is unsupported');
  if (plan.engine !== (request.executionEngine ?? 'native'))
    throw new Error('Terraform-owned deployments require the Terraform lifecycle adapter');
  if (request.planId !== plan.planId) throw new Error('The requested AWS CE plan ID does not match the persisted plan');
  if (!safeHexEqual(request.planSha256, plan.planSha256))
    throw new Error('The requested AWS CE plan hash does not match');
  if (!request.hasUI && !request.authorized && request.env.XCSH_CE_HEADLESS_MUTATIONS !== '1')
    throw new Error('Headless AWS CE mutations require XCSH_CE_HEADLESS_MUTATIONS=1');
  if (
    plan.intent.operation === 'teardown' &&
    !request.hasUI &&
    !request.destructionAuthorized &&
    request.env.XCSH_CE_ALLOW_DESTROY !== '1'
  )
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

export async function assertAwsActionOwnership(
  plan: AwsCePlan,
  action: AwsCeAction,
  api: AwsExecApi,
  resolved: Record<string, string> = {},
): Promise<void> {
  if (!action.mutates) return;
  const ids = new Set<string>();
  if (action.resourceId && !action.resourceId.startsWith('aws://') && !action.resourceId.includes('__'))
    ids.add(action.resourceId);
  const targetFlags = new Set([
    '--instance-id',
    '--instance-ids',
    '--network-interface-id',
    '--network-interface-ids',
    '--network-interfaces',
    '--allocation-id',
    '--association-id',
    '--group-id',
    '--group-ids',
    '--vpc-id',
    '--internet-gateway-id',
    '--gateway-id',
    '--subnet-id',
    '--subnet-ids',
    '--route-table-id',
    '--transit-gateway-id',
    '--transit-gateway-route-table-id',
    '--transit-gateway-attachment-id',
    '--transit-gateway-connect-peer-id',
    '--target-group-arn',
    '--load-balancer-arn',
    '--listener-arn',
  ]);
  const args = action.args ?? [];
  for (let index = 0; index < args.length; index++) {
    if (!targetFlags.has(args[index])) continue;
    for (let position = index + 1; position < args.length && !args[position].startsWith('--'); position++) {
      let value = args[position];
      for (const [placeholder, replacement] of Object.entries(resolved))
        value = value.replaceAll(placeholder, replacement);
      if (/__[A-Z0-9_]+__/.test(value)) throw new Error('AWS ownership target is unresolved');
      for (const match of value.matchAll(
        /arn:(?:aws|aws-us-gov|aws-cn):elasticloadbalancing:[^,\s]+|(?:i|eni|sg|vpc|subnet|rtb|igw|tgw|tgw-rtb|tgw-attach|tgw-connect-peer|eipalloc|eipassoc)-[0-9a-f]{8,21}/g,
      ))
        ids.add(match[0]);
    }
  }
  const known = new Set(Object.values(resolved));
  for (const id of ids)
    if (!known.has(id) && !plan.ownershipInventory.some((item) => item.resourceId === id))
      throw new Error('AWS mutation target is outside the deployment inventory');
  if (!ids.size) return;
  const observed = await observeAwsResources(api, [...ids], plan.region, {
    deploymentName: plan.deploymentName,
    planSha256s: [
      plan.planSha256,
      ...plan.rollback.resources
        .map((resource) =>
          String((resource.before.tags as Record<string, string> | undefined)?.['xcsh-plan-sha256'] ?? ''),
        )
        .filter((digest) => /^[a-f0-9]{64}$/.test(digest)),
    ],
  });
  for (const resource of observed) {
    if (!resource.exists) throw new Error('AWS mutation target no longer exists');
    const brownfield = plan.ownershipInventory.some(
      (item) => item.resourceId === resource.id && item.action === 'modify-approved' && !item.owned,
    );
    if (
      !brownfield &&
      (resource.tags['xcsh-managed-by'] !== 'aws-ce' ||
        resource.tags['xcsh-deployment-id'] !== plan.deploymentName ||
        resource.tags['xcsh-execution-engine'] !== plan.engine)
    )
      throw new Error('Live AWS resource belongs to another owner or engine');
  }
}

async function assertGate(
  action: AwsCeAction,
  runtime: CeRuntime,
  plan: AwsCePlan,
  checkpoint: AwsCeCheckpoint,
  persist: () => Promise<unknown>,
  api: AwsExecApi,
  signal?: AbortSignal,
): Promise<void> {
  if (action.kind === 'tgw-attachment-gate') {
    await assertAttachmentAvailable(action, plan, checkpoint, api);
    return;
  }
  for (const { site, binding } of siteBindings(plan).filter(
    ({ site }) => !action.node || site.nodeIndexes.includes(action.node),
  )) {
    if (action.kind === 'registration-gate' || action.kind === 'registration-approve') {
      const instances = Object.fromEntries(
        binding.nodes.map((node, index) => [
          node,
          checkpoint.resolvedValues[`__INSTANCE_${site.nodeIndexes[index]}__`],
        ]),
      );
      const evidence =
        action.kind === 'registration-approve'
          ? await runtime.approveRegistrations(
              binding,
              instances,
              async (record) => {
                checkpoint.resolvedValues[`__REGISTRATION_${String(record.node)}__`] = String(record.registration);
                checkpoint.resolvedValues[`__REGISTRATION_STATE_${String(record.node)}__`] = String(record.state);
                await persist();
              },
              signal,
            )
          : await runtime.observeRegistrations(binding, instances, signal);
      if (['authorization', 'expired', 'malformed', 'ownership-or-response-invalid'].includes(String(evidence.reason)))
        throw new Error(`F5 registration evidence is unavailable: ${String(evidence.reason)}`);
      if (action.kind === 'registration-approve') {
        if (
          !Array.isArray(evidence.nodes) ||
          evidence.nodes.some(
            (node: unknown) =>
              !node ||
              typeof node !== 'object' ||
              !['APPROVED', 'ADMITTED', 'ONLINE', 'UPGRADING', 'MAINTENANCE'].includes(
                String((node as Record<string, unknown>).state),
              ),
          )
        )
          throw new Error('Observed F5 registration approval has not converged');
      } else if (evidence.status !== 'healthy') throw new Error('Observed F5 registration has not converged');
      if (action.kind === 'registration-gate') {
        const configuration = await runtime.observeAwsRegisteredConfiguration(
          binding,
          instances,
          site.nodeIndexes.flatMap((node) =>
            plan.interfaces.map((item) => ({
              node: `${plan.deploymentName}-${node}`,
              role: item.role as 'slo' | 'sli',
              mac: checkpoint.resolvedValues[`__ENI_${node}_${item.index}_MAC__`],
            })),
          ),
          signal,
        );
        if (configuration.status !== 'configured')
          throw new Error('Observed F5 interface configuration has not converged');
        await runtime.ensureAwsInterfaceMtu(
          binding,
          instances,
          site.nodeIndexes.flatMap((node) =>
            plan.interfaces.map((item) => ({
              node: `${plan.deploymentName}-${node}`,
              role: item.role as 'slo' | 'sli',
              mac: checkpoint.resolvedValues[`__ENI_${node}_${item.index}_MAC__`],
              mtu: item.mtu ?? AWS_CE_DEFAULT_INTERFACE_MTU,
            })),
          ),
          async () => {
            await persist();
          },
          signal,
        );
        if ((await runtime.observeRegistrations(binding, instances, signal)).status !== 'healthy')
          throw new Error('Observed F5 registration after interface update has not converged');
      }
    }
    if (action.kind === 'health-gate') {
      const evidence = await runtime.observeHealth(binding, signal);
      if (
        [
          'authorization',
          'expired',
          'malformed',
          'ownership-or-response-invalid',
          'provider-health-contract-unavailable',
        ].includes(String(evidence.reason))
      )
        throw new Error(`F5 health evidence is unavailable: ${String(evidence.reason)}`);
      if (evidence.status !== 'healthy') throw new Error('Observed F5 site health has not converged');
    }
  }
  if (action.kind === 'f5-routing-configure')
    await configureAwsRouting(runtime, plan, checkpoint, api, persist, signal);
  if (action.kind === 'bgp-gate' || action.kind === 'nlb-gate') {
    const evidence = await collectAwsNetworkHealth(
      action.kind === 'bgp-gate' ? 'bgp' : 'nlb',
      plan,
      checkpoint,
      api,
      signal,
    );
    if (evidence.status !== 'healthy') throw new Error('Observed AWS network health has not converged');
  }
  if (['tgw-route-gate', 'traffic-gate'].includes(action.kind))
    throw new Error(`Collected ${action.kind} evidence is not yet available`);
}

export async function executeAwsCeApply(
  input: AwsCeApplyInput,
  ctx: AwsCeToolContext,
  api: AwsExecApi,
  platform: CePlatformService,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
) {
  if (
    Object.hasOwn(input, 'f5Capabilities') ||
    Object.hasOwn(input, 'f5Evidence') ||
    Object.hasOwn(input, 'bootstrapRefs')
  )
    throw new Error('Caller-supplied capability or health assertions are unsupported');
  const { plan, observation } = await loadAwsPlan(ctx.sessionManager, input.planId, input.planSha256);
  const existing = await loadAwsCheckpoint(ctx.sessionManager, plan.planId, plan.planSha256);
  const authorized =
    existing?.authorization?.planSha256 === plan.planSha256 && existing.authorization.mutations === true;
  assertAwsApplyAllowed(plan, {
    planId: input.planId,
    planSha256: input.planSha256,
    hasUI: ctx.hasUI,
    env: process.env,
    authorized,
    destructionAuthorized: authorized && existing?.authorization?.destruction,
  });
  api = scopedAwsApi(api, plan.intent.awsProfile, signal);
  if (
    plan.intent.operation === 'deploy' &&
    plan.interfaces.some((item) => !['slo', 'sli'].includes(item.role) || item.addressing.mode !== 'dhcp')
  )
    throw new Error('The requested interface configuration needs an explicit supported F5 wire mapping');
  const f5Capabilities = await platform.capabilities(plan.intent.platformContext);
  const runtime = await platform.runtime(plan.engine, plan.intent.platformContext);
  if (plan.routing.profile === 'tgw-connect') runtime.requireAwsRoutingContract();
  const storage = await platform.storage({
    deploymentId: plan.deploymentName,
    engine: plan.engine,
    provider: 'aws',
    account: plan.accountId,
    region: plan.region,
  });

  if (existing && existing.engine !== plan.engine)
    throw new Error('Checkpoint execution engine differs from deployment');
  const brownfieldIds = [
    ...new Set([
      ...plan.intent.brownfield.resourceIds,
      ...plan.intent.brownfield.routeTableIds,
      ...plan.intent.brownfield.transitGatewayRouteTableIds,
    ]),
  ].sort();
  const resourceIdPattern =
    /^(?:arn:(?:aws|aws-us-gov|aws-cn):[a-z0-9-]+:[a-z0-9-]*:\d{12}:[A-Za-z0-9_+=,.@:/-]+|(?:i|vpc|subnet|rtb|igw|tgw|tgw-attach|tgw-connect-peer|tgw-rtb|eni|sg|eipalloc|eipassoc|nat|vpce)-[0-9a-f]{8,21})$/;
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
      awsProfile: plan.intent.awsProfile,
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
      f5Capabilities,
    },
    api,
    fetcher,
  );
  assertAwsObservationFresh(plan, current, existing?.observationFingerprint ?? plan.observationFingerprint, [
    ...brownfieldIds,
    ...observedOwnedIds(),
  ]);
  if (existing?.ownedStateFingerprint) {
    const actualOwnedState = fingerprintOwnedResources(
      current.resources.filter((resource) => observedOwnedIds().includes(resource.id)),
    );
    if (!safeHexEqual(existing.ownedStateFingerprint, actualOwnedState))
      throw new Error('Stale AWS CE plan: owned resource tags, targets, attachments, peers, or state changed');
  }
  const expectedPrefix = plan.actions.slice(0, existing?.completedActionIds.length ?? 0).map((action) => action.id);
  if (existing && JSON.stringify(existing.completedActionIds) !== JSON.stringify(expectedPrefix))
    throw new Error('AWS CE checkpoint is not an ordered prefix of the immutable plan');
  if (ctx.hasUI) {
    if (!authorized && !(await ctx.ui.confirm('Apply immutable AWS CE plan', `${plan.planId}\n${plan.planSha256}`)))
      throw new Error('AWS CE apply was not approved');
    if (
      plan.intent.operation === 'teardown' &&
      !(authorized && existing?.authorization?.destruction) &&
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
    engine: plan.engine,
    authorization: { planSha256: plan.planSha256, mutations: true, destruction: plan.intent.operation === 'teardown' },
    planId: plan.planId,
    planSha256: plan.planSha256,
    completedActionIds: [...completed],
    observationFingerprint: existing?.observationFingerprint,
    resolvedValues: { ...(existing?.resolvedValues ?? {}) },
    state: 'running',
    pendingCreate: existing?.pendingCreate,
  };
  for (const action of plan.actions) {
    if (completed.has(action.id)) continue;
    let launchDirectory: string | undefined;
    const previousObservationFingerprint = checkpoint.observationFingerprint;
    const previousOwnedStateFingerprint = checkpoint.ownedStateFingerprint;
    const previousCaptures = new Map(
      [...(action.capture ? [action.capture] : []), ...(action.captures ?? [])].map((capture) => [
        capture.placeholder,
        checkpoint.resolvedValues[capture.placeholder],
      ]),
    );
    try {
      await assertAwsActionOwnership(plan, action, api, checkpoint.resolvedValues);
      const convergenceDeadline = Date.now() + 15 * 60_000;
      while (true) {
        try {
          await assertGate(
            action,
            runtime,
            plan,
            checkpoint,
            () => saveAwsCheckpoint(ctx.sessionManager, checkpoint),
            api,
            signal,
          );
          break;
        } catch (error) {
          if (
            signal?.aborted ||
            !(error instanceof Error) ||
            !error.message.includes('has not converged') ||
            Date.now() >= convergenceDeadline
          )
            throw error;
          await new Promise<void>((resolve, reject) => {
            const abort = () => {
              clearTimeout(timer);
              reject(new Error('AWS CE convergence cancelled'));
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
      if (action.command && action.args) {
        if (action.requiresBootstrap && action.node) {
          const selected = siteBindings(plan).find(({ site }) => site.nodeIndexes.includes(action.node ?? 0));
          if (!selected) throw new Error('Bootstrap node has no site binding');
          const { site, binding } = selected;
          const hostname = `${plan.deploymentName}-${action.node}`;
          if (plan.interfaces.some((item) => !['slo', 'sli'].includes(item.role) || item.addressing.mode !== 'dhcp'))
            throw new Error('This interface configuration requires an explicit supported F5 wire mapping');
          await runtime.reserveSite(
            binding,
            async (record) => {
              checkpoint.resolvedValues[`__F5_SITE_${site.nodeIndexes[0]}_UID__`] = String(record.uid);
              await saveAwsCheckpoint(ctx.sessionManager, checkpoint);
            },
            signal,
          );
          const root = storage.directory;
          await mkdir(root, { recursive: true, mode: 0o700 });
          await chmod(root, 0o700);
          launchDirectory = await mkdtemp(join(root, 'node-'));
          await chmod(launchDirectory, 0o700);
          const path = join(launchDirectory, 'cloud-init.yaml');
          const tokenName = `${plan.deploymentName.slice(0, 40)}-${action.node}-${plan.planSha256.slice(0, 12)}`;
          const material = await runtime.bootstrap(
            binding,
            hostname,
            tokenName,
            async (secret) => {
              await storage.write(`${tokenName}.json`, secret);
              checkpoint.resolvedValues[`__F5_TOKEN_${action.node}__`] = tokenName;
              await saveAwsCheckpoint(ctx.sessionManager, checkpoint);
            },
            signal,
          );
          await writeFile(path, renderAwsCeCloudInit({ nodeName: hostname, material }), { mode: 0o600 });
          checkpoint.resolvedValues.__BOOTSTRAP_FILE__ = path;
        }
        const args = replaceArgs(action.args, plan.planSha256, checkpoint.resolvedValues);
        const result = hasCreateRecovery(action)
          ? await executeRecoverableCreate(
              api,
              plan,
              action,
              args,
              checkpoint,
              () => saveAwsCheckpoint(ctx.sessionManager, checkpoint),
              signal,
            )
          : await api.exec(action.command, args);
        if (launchDirectory) {
          delete checkpoint.resolvedValues.__BOOTSTRAP_FILE__;
          await rm(launchDirectory, { recursive: true, force: true });
          launchDirectory = undefined;
        }
        if (result.exitCode !== 0) throw new Error(`AWS action ${action.id} failed with exit code ${result.exitCode}`);
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
          checkpoint.ownedStateFingerprint = fingerprintOwnedResources(
            resources.filter((resource) => ownedIds.includes(resource.id)),
          );
          checkpoint.observationFingerprint = fingerprintObservation({ ...current, resources }, ids);
        }
      }
      completed.add(action.id);
      checkpoint.completedActionIds = [...completed];
      checkpoint.failedActionId = undefined;
      const pendingCreate = checkpoint.pendingCreate;
      checkpoint.pendingCreate = undefined;
      try {
        await saveAwsCheckpoint(ctx.sessionManager, checkpoint);
      } catch (error) {
        checkpoint.pendingCreate = pendingCreate;
        completed.delete(action.id);
        checkpoint.completedActionIds = [...completed];
        throw error;
      }
    } catch (error) {
      checkpoint.observationFingerprint = previousObservationFingerprint;
      checkpoint.ownedStateFingerprint = previousOwnedStateFingerprint;
      if (checkpoint.pendingCreate?.actionId === action.id) {
        for (const [placeholder, value] of previousCaptures) {
          if (value === undefined) delete checkpoint.resolvedValues[placeholder];
          else checkpoint.resolvedValues[placeholder] = value;
        }
      }
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
