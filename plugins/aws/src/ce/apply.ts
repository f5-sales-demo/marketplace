import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import { captureCeReplacementVersions } from '../../../platform/src/ce/replacement-versions';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { CePlatformService } from '../../../platform/src/ce/service';
import { VerifiedUpgradeContract } from '../../../platform/src/ce/upgrade-contract';
import type { AwsExecApi } from '../aws/exec';
import type { AwsCeToolContext } from './artifacts';
import { loadAwsCheckpoint, loadAwsPlan, saveAwsCheckpoint } from './artifacts';
import { assertAttachmentAvailable } from './attachment-gate';
import {
  fingerprintObservation,
  fingerprintOwnedResources,
  matchesObservationFingerprint,
  matchesOwnedResourceFingerprint,
  safeHexEqual,
} from './canonical';
import { renderAwsCeCloudInit } from './cloud-init';
import { executeRecoverableCreate, hasCreateRecovery } from './create-recovery';
import { executeRecoverableDelete, hasDeleteRecovery } from './delete-recovery';
import { discoverAwsCompute, observeAwsResources } from './discovery';
import { associateAwsCeEip } from './eip-association';
import { persistAwsNativeRoutingCheckpoint } from './native-routing-checkpoint';
import { createNativeAwsSiteReplacementDriver } from './native-site-replacement';
import { collectAwsNetworkHealth } from './network-health';
import { ensureAwsPlatformIngress } from './platform-ingress';
import { configureAwsRouting } from './routing-apply';
import { scopedAwsApi } from './scoped-exec';
import { resetAwsSecurityGroupEgress } from './security-group-defaults';
import { type AwsSiteReplacementPlan, compileAwsSiteReplacement, runAwsSiteReplacement } from './site-replacement';
import { siteBindings } from './topology';
import { collectAwsTrafficProbe } from './traffic-probe';
import type { AwsCeAction, AwsCeCheckpoint, AwsCeObservation, AwsCePlan } from './types';
import { AWS_CE_DEFAULT_INTERFACE_MTU, AWS_CE_SCHEMA_VERSION } from './types';

export interface AwsCeApplyInput {
  planId: string;
  planSha256: string;
}

export function observedInstanceTypeNames(observation: AwsCeObservation): string[] {
  return [
    ...new Set(observation.regions.flatMap((region) => region.instanceTypes.map((instance) => instance.name))),
  ].sort();
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
  if (!matchesObservationFingerprint(expected, current, relevantResourceIds))
    throw new Error(`Stale AWS CE plan: observations changed (expected ${expected}, current ${actual})`);
}

export function assertAwsResumeObservationFresh(
  plan: AwsCePlan,
  planned: AwsCeObservation,
  current: AwsCeObservation,
  expected: string,
  relevantResourceIds: string[],
  completedActionCount: number,
) {
  if (plan.intent.operation === 'teardown' && completedActionCount > 0) {
    // Completed restoration/deletion actions deliberately change resource snapshots.
    // Recheck the immutable account, region, capability, agreement and research inputs;
    // owned resource continuity is checked separately against the last checkpoint.
    assertAwsObservationFresh(plan, current, fingerprintObservation(planned, []), []);
    return;
  }
  assertAwsObservationFresh(plan, current, expected, relevantResourceIds);
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

/** Preserve resumability for plans persisted before the ELBv2 service prefix fix. */
export function executableAwsActionArgs(action: AwsCeAction, args: string[]): string[] {
  return action.kind === 'nlb-cross-zone-enable' && args[0] === 'modify-load-balancer-attributes'
    ? ['elbv2', ...args]
    : args;
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
  const rollbackTargets = new Set<string>();
  if (action.kind === 'brownfield-restore') {
    const source = plan.rollback.resources.find((resource) => resource.id === action.resourceId);
    if (!source) throw new Error('AWS brownfield restoration is not backed by the immutable rollback snapshot');
    const collect = (value: unknown): void => {
      if (typeof value === 'string') {
        for (const match of value.matchAll(
          /arn:(?:aws|aws-us-gov|aws-cn):elasticloadbalancing:[^,\s]+|(?:i|eni|sg|vpc|subnet|rtb|igw|tgw|tgw-rtb|tgw-attach|tgw-connect-peer|eipalloc|eipassoc)-[0-9a-f]{8,21}/g,
        ))
          rollbackTargets.add(match[0]);
      } else if (Array.isArray(value)) {
        for (const item of value) collect(item);
      } else if (value && typeof value === 'object') {
        for (const item of Object.values(value as Record<string, unknown>)) collect(item);
      }
    };
    rollbackTargets.add(source.id);
    collect(source.before);
  }
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
    if (!known.has(id) && !rollbackTargets.has(id) && !plan.ownershipInventory.some((item) => item.resourceId === id))
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
    const brownfield =
      rollbackTargets.has(resource.id) ||
      plan.ownershipInventory.some(
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

function flagValue(args: string[], flag: string): string | undefined {
  const indexes = args.flatMap((value, index) => (value === flag ? [index] : []));
  if (indexes.length !== 1) return undefined;
  const value = args[indexes[0] + 1];
  return value && !value.startsWith('--') ? value : undefined;
}

export async function isAwsBrownfieldRestoreConverged(
  plan: AwsCePlan,
  action: AwsCeAction,
  api: AwsExecApi,
): Promise<boolean> {
  if (action.kind !== 'brownfield-restore' || action.args?.[0] !== 'ec2') return false;
  const operation = action.args[1];
  if (
    ![
      'associate-transit-gateway-route-table',
      'disassociate-transit-gateway-route-table',
      'enable-transit-gateway-route-table-propagation',
      'disable-transit-gateway-route-table-propagation',
    ].includes(operation)
  )
    return false;
  const routeTableId = flagValue(action.args, '--transit-gateway-route-table-id');
  const attachmentId = flagValue(action.args, '--transit-gateway-attachment-id');
  const source = plan.rollback.resources.find((resource) => resource.id === routeTableId);
  if (!routeTableId || !source || action.resourceId !== routeTableId || !attachmentId)
    throw new Error('AWS TGW restoration is not bound to the immutable rollback snapshot');
  const key = operation.includes('propagation') ? 'Propagations' : 'Associations';
  const before = Array.isArray(source.before[key]) ? (source.before[key] as Array<Record<string, unknown>>) : [];
  const expected = before.filter((item) => item.TransitGatewayAttachmentId === attachmentId);
  if (expected.length > 1) throw new Error('AWS TGW rollback relationship is ambiguous');
  const desired = operation.startsWith('associate-') || operation.startsWith('enable-');
  if (desired !== (expected.length === 1)) throw new Error('AWS TGW restoration differs from the rollback snapshot');
  const [observed] = await observeAwsResources(api, [routeTableId], plan.region, {
    deploymentName: plan.deploymentName,
    planSha256s: [plan.planSha256],
  });
  if (!observed?.exists) throw new Error('AWS TGW restoration target no longer exists');
  const current = Array.isArray(observed.state[key])
    ? (observed.state[key] as Array<Record<string, unknown>>).filter(
        (item) => item.TransitGatewayAttachmentId === attachmentId,
      )
    : [];
  if (current.length > 1) throw new Error('AWS TGW live relationship is ambiguous');
  const state = String(current[0]?.State ?? '').toLowerCase();
  return desired
    ? current.length === 1 && ['associated', 'enabled'].includes(state)
    : current.length === 0 || ['disassociated', 'disabled'].includes(state);
}

async function assertGate(
  action: AwsCeAction,
  runtime: CeRuntime,
  plan: AwsCePlan,
  checkpoint: AwsCeCheckpoint,
  persist: (evidence?: Record<string, unknown>) => Promise<unknown>,
  storage: Awaited<ReturnType<CePlatformService['storage']>>,
  ingressContract: VerifiedIngressContract | undefined,
  api: AwsExecApi,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{ mutated: true; pending: boolean } | undefined> {
  let replacementMutation = false;
  if (action.kind === 'security-group-egress-reset') {
    await resetAwsSecurityGroupEgress(action, plan, checkpoint, api);
    return;
  }
  if (action.kind === 'tgw-attachment-gate') {
    await assertAttachmentAvailable(action, plan, checkpoint, api);
    return;
  }
  for (const { site, binding } of siteBindings(plan).filter(
    ({ site }) => !action.node || site.nodeIndexes.includes(action.node),
  )) {
    if (action.kind === 'registration-gate' || action.kind === 'registration-approve') {
      let instances = Object.fromEntries(
        binding.nodes.map((node, index) => [
          node,
          checkpoint.resolvedValues[`__INSTANCE_${site.nodeIndexes[index]}__`],
        ]),
      );
      const replacementArtifact = `${action.id}-initial-mtu-replacement.json`;
      let replacement: AwsSiteReplacementPlan | undefined;
      if (action.kind === 'registration-gate') {
        try {
          const saved = (await storage.read(replacementArtifact)) as {
            sourcePlanSha256?: string;
            plan?: AwsSiteReplacementPlan;
          };
          if (saved.sourcePlanSha256 !== plan.planSha256 || !saved.plan)
            throw new Error('Initial MTU replacement binding differs');
          replacement = saved.plan;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
      const driveReplacement = async (child: AwsSiteReplacementPlan) => {
        replacementMutation = true;
        checkpoint.childPlanSha256s = [...new Set([...(checkpoint.childPlanSha256s ?? []), child.planSha256])].sort();
        await persist();
        const upgrade = await VerifiedUpgradeContract.release(fetcher, signal);
        const driver = createNativeAwsSiteReplacementDriver(plan, api, storage);
        const result = await runAwsSiteReplacement(child, child.planSha256, driver, runtime, storage, upgrade, signal);
        const childCheckpoint = (await storage.read(`${child.planId}.json`)) as { instances?: Record<string, string> };
        for (const [nodeOffset, node] of binding.nodes.entries()) {
          const instance = childCheckpoint.instances?.[node];
          if (typeof instance === 'string' && /^i-[0-9a-f]{8,17}$/.test(instance))
            checkpoint.resolvedValues[`__INSTANCE_${site.nodeIndexes[nodeOffset]}__`] = instance;
        }
        const scoped = scopedAwsApi(api, plan.intent.awsProfile, signal);
        for (const node of site.nodeIndexes) {
          const allocation = checkpoint.resolvedValues[`__EIP_${node}__`];
          if (!allocation) continue;
          const response = await scoped.exec('aws', [
            'ec2',
            'describe-addresses',
            '--allocation-ids',
            allocation,
            '--region',
            plan.region,
            '--output',
            'json',
          ]);
          if (response.exitCode) throw new Error('Replacement EIP observation failed');
          const addresses = (JSON.parse(response.stdout) as { Addresses?: Array<{ AssociationId?: string }> })
            .Addresses;
          const association = addresses?.length === 1 ? addresses[0].AssociationId : undefined;
          if (!association || !/^eipassoc-[0-9a-f]{8,17}$/.test(association))
            throw new Error('Replacement EIP association identity is unavailable');
          checkpoint.resolvedValues[`__EIP_ASSOC_${node}__`] = association;
        }
        instances = Object.fromEntries(
          binding.nodes.map((node, index) => [
            node,
            checkpoint.resolvedValues[`__INSTANCE_${site.nodeIndexes[index]}__`],
          ]),
        );
        await persist({
          evidenceKind: 'automatic-preboot-mtu-replacement',
          childPlanId: child.planId,
          childPlanSha256: child.planSha256,
          status: result.status,
          registrationStatus: 'registration' in result && result.registration ? result.registration.status : undefined,
          configurationStatus:
            'configuration' in result && result.configuration ? result.configuration.status : undefined,
          versions: 'versions' in result ? result.versions : undefined,
          observedAt: new Date().toISOString(),
        });
        return result.status === 'registered-with-configured-interfaces';
      };
      if (replacement) {
        const complete = await driveReplacement(replacement);
        if (!complete) return { mutated: true, pending: true };
      }
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
        const expected = site.nodeIndexes.flatMap((node) =>
          plan.interfaces.map((item) => ({
            node: `${plan.deploymentName}-${node}`,
            role: item.role as 'slo' | 'sli',
            mac: checkpoint.resolvedValues[`__ENI_${node}_${item.index}_MAC__`],
            mtu: item.mtu ?? AWS_CE_DEFAULT_INTERFACE_MTU,
          })),
        );
        let preparation: Record<string, unknown> | undefined;
        try {
          await runtime.ensureAwsInterfaceMtu(
            binding,
            instances,
            expected,
            async (record) => {
              preparation = record;
              await persist(record);
            },
            signal,
          );
        } catch (error) {
          if (
            plan.engine !== 'native' ||
            !(error instanceof Error) ||
            !error.message.includes('coupled VM/site replacement') ||
            !preparation
          )
            throw error;
          const upgrade = await VerifiedUpgradeContract.release(fetcher, signal);
          const versions = await captureCeReplacementVersions(
            binding,
            String(preparation.uid),
            String(preparation.contractFingerprint),
            runtime,
            upgrade,
            signal,
          );
          replacement = compileAwsSiteReplacement(plan, binding.siteName, preparation, {
            versions,
            interfaceIds: Object.fromEntries(
              site.nodeIndexes.flatMap((node) =>
                plan.interfaces.map((item) => [
                  `${plan.deploymentName}-${node}/${item.role}`,
                  checkpoint.resolvedValues[`__ENI_${node}_${item.index}__`],
                ]),
              ),
            ),
            elasticIpAllocationIds: Object.fromEntries(
              site.nodeIndexes.map((node) => [
                `${plan.deploymentName}-${node}`,
                checkpoint.resolvedValues[`__EIP_${node}__`],
              ]),
            ),
            bootstrapTokenNames: Object.fromEntries(
              site.nodeIndexes.map((node) => [
                `${plan.deploymentName}-${node}`,
                checkpoint.resolvedValues[`__F5_TOKEN_${node}__`],
              ]),
            ),
          });
          await storage.write(replacementArtifact, { sourcePlanSha256: plan.planSha256, plan: replacement });
          const complete = await driveReplacement(replacement);
          if (!complete) return { mutated: true, pending: true };
        }
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
  if (action.kind === 'f5-ingress-configure') {
    if (!ingressContract) throw new Error('Verified ingress contract is unavailable');
    const evidence = await ensureAwsPlatformIngress(
      plan,
      runtime,
      storage,
      ingressContract,
      checkpoint.resolvedValues,
      signal,
    );
    if (evidence?.listener !== 'configured') throw new Error('Observed F5 ingress listener has not converged');
    await persist(evidence);
  }
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
  if (action.kind === 'tgw-route-gate') {
    const evidence = await collectAwsNetworkHealth('routes', plan, checkpoint, api, signal);
    await persist(evidence);
    if (evidence.status === 'unknown') throw new Error('AWS TGW route evidence is unavailable');
    if (evidence.status !== 'healthy') throw new Error('Observed AWS TGW routes have not converged');
  }
  if (action.kind === 'traffic-gate') {
    if (plan.intent.ingress?.mode !== 'nlb')
      throw new Error('Collected traffic-gate evidence is unavailable for this profile');
    const evidence = await collectAwsTrafficProbe(plan, checkpoint, storage, api, signal);
    await persist(evidence);
    if (evidence.status !== 'healthy') throw new Error('Observed end-to-end AWS traffic has not converged');
  }
  return replacementMutation ? { mutated: true, pending: false } : undefined;
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
  const ingressContract =
    plan.intent.ingress?.mode === 'nlb' ? await VerifiedIngressContract.release(fetcher, signal) : undefined;

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
      ...(existing?.childPlanSha256s ?? []),
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
      // Recollect the same reviewed candidate set. Narrowing this to only the selected
      // type changes every regional observation and falsely makes an untouched plan stale.
      instanceTypes: observedInstanceTypeNames(observation),
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
  const childReplacementActive =
    Boolean(existing?.childPlanSha256s?.length) &&
    plan.actions.some((action) => action.id === existing?.failedActionId && action.kind === 'registration-gate');
  assertAwsResumeObservationFresh(
    plan,
    observation,
    current,
    childReplacementActive
      ? plan.observationFingerprint
      : (existing?.observationFingerprint ?? plan.observationFingerprint),
    childReplacementActive ? brownfieldIds : [...brownfieldIds, ...observedOwnedIds()],
    existing?.completedActionIds.length ?? 0,
  );
  if (existing?.ownedStateFingerprint && !childReplacementActive) {
    if (
      !matchesOwnedResourceFingerprint(
        existing.ownedStateFingerprint,
        current.resources.filter((resource) => observedOwnedIds().includes(resource.id)),
      )
    )
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
    childPlanSha256s: existing?.childPlanSha256s ? [...existing.childPlanSha256s] : undefined,
    observationFingerprint: existing?.observationFingerprint,
    resolvedValues: { ...(existing?.resolvedValues ?? {}) },
    state: 'running',
    pendingCreate: existing?.pendingCreate,
    pendingDelete: existing?.pendingDelete,
  };
  for (const action of plan.actions) {
    if (completed.has(action.id)) continue;
    let launchDirectory: string | undefined;
    let gateMutation = false;
    const previousObservationFingerprint = checkpoint.observationFingerprint;
    const previousOwnedStateFingerprint = checkpoint.ownedStateFingerprint;
    const previousCaptures = new Map(
      [...(action.capture ? [action.capture] : []), ...(action.captures ?? [])].map((capture) => [
        capture.placeholder,
        checkpoint.resolvedValues[capture.placeholder],
      ]),
    );
    try {
      if (!(hasDeleteRecovery(action) && checkpoint.pendingDelete?.actionId === action.id))
        await assertAwsActionOwnership(plan, action, api, checkpoint.resolvedValues);
      const convergenceDeadline = Date.now() + 15 * 60_000;
      while (true) {
        try {
          const gate = await assertGate(
            action,
            runtime,
            plan,
            checkpoint,
            async (evidence) => {
              if (evidence)
                await storage.write(`${action.id}-evidence.json`, {
                  ...evidence,
                  planId: plan.planId,
                  planSha256: plan.planSha256,
                });
              return saveAwsCheckpoint(ctx.sessionManager, checkpoint);
            },
            storage,
            ingressContract,
            api,
            fetcher,
            signal,
          );
          gateMutation = gate?.mutated === true;
          if (gate?.pending) break;
          if (action.kind === 'f5-routing-configure')
            await persistAwsNativeRoutingCheckpoint(plan, checkpoint, storage);
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
        const args = executableAwsActionArgs(
          action,
          replaceArgs(action.args, plan.planSha256, checkpoint.resolvedValues),
        );
        const result =
          action.kind === 'elastic-ip-associate'
            ? await associateAwsCeEip(api, plan, args, signal)
            : hasCreateRecovery(action)
              ? await executeRecoverableCreate(
                  api,
                  plan,
                  action,
                  args,
                  checkpoint,
                  () => saveAwsCheckpoint(ctx.sessionManager, checkpoint),
                  signal,
                )
              : hasDeleteRecovery(action)
                ? await executeRecoverableDelete(
                    api,
                    plan,
                    action,
                    args,
                    checkpoint,
                    () => saveAwsCheckpoint(ctx.sessionManager, checkpoint),
                    ownershipPlanSha256s,
                    signal,
                  )
                : action.kind === 'brownfield-restore' &&
                    (await isAwsBrownfieldRestoreConverged(plan, { ...action, args }, api))
                  ? { exitCode: 0, stdout: '{}', stderr: '' }
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
      if (action.mutates || gateMutation) {
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
      if (gateMutation) {
        const saved = (await storage.read(`${action.id}-initial-mtu-replacement.json`)) as {
          plan?: AwsSiteReplacementPlan;
        };
        const child = saved.plan;
        const childCheckpoint = child
          ? ((await storage.read(`${child.planId}.json`)) as { phase?: string })
          : undefined;
        if (childCheckpoint?.phase !== 'complete')
          throw new Error('Automatic preboot MTU replacement has not converged');
      }
      completed.add(action.id);
      checkpoint.completedActionIds = [...completed];
      checkpoint.failedActionId = undefined;
      const pendingCreate = checkpoint.pendingCreate;
      const pendingDelete = checkpoint.pendingDelete;
      checkpoint.pendingCreate = undefined;
      checkpoint.pendingDelete = undefined;
      try {
        await saveAwsCheckpoint(ctx.sessionManager, checkpoint);
      } catch (error) {
        checkpoint.pendingCreate = pendingCreate;
        checkpoint.pendingDelete = pendingDelete;
        completed.delete(action.id);
        checkpoint.completedActionIds = [...completed];
        throw error;
      }
    } catch (error) {
      if (!gateMutation) {
        checkpoint.observationFingerprint = previousObservationFingerprint;
        checkpoint.ownedStateFingerprint = previousOwnedStateFingerprint;
      }
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
