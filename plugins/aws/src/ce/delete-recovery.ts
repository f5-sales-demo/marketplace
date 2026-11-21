import type { AwsExecApi } from '../aws/exec';
import { canonicalSha256, fingerprintOwnedResources } from './canonical';
import { observeAwsResources } from './discovery';
import { collectAwsNativeEmptyCloudInventory } from './native-empty-inventory';
import type { AwsCeAction, AwsCeCheckpoint, AwsCePlan } from './types';

export function hasDeleteRecovery(action: AwsCeAction): boolean {
  return (
    ['resource-delete', 'route-table-disassociate', 'internet-gateway-detach'].includes(action.kind) &&
    action.command === 'aws' &&
    !!action.resourceId
  );
}

function instanceTerminated(state: Record<string, unknown>): boolean {
  const reservations = Array.isArray(state.Reservations) ? state.Reservations : [];
  const instances = reservations.flatMap((row) =>
    row && typeof row === 'object' && Array.isArray((row as Record<string, unknown>).Instances)
      ? ((row as Record<string, unknown>).Instances as unknown[])
      : [],
  );
  return (
    instances.length === 1 &&
    instances[0] !== null &&
    typeof instances[0] === 'object' &&
    ((instances[0] as Record<string, unknown>).State as Record<string, unknown> | undefined)?.Name === 'terminated'
  );
}

function mutationConverged(action: AwsCeAction, state: Record<string, unknown>): boolean {
  if (action.kind === 'resource-delete') return false;
  const args = action.args ?? [];
  if (action.kind === 'route-table-disassociate') {
    const associationId = args[args.indexOf('--association-id') + 1];
    const tables = Array.isArray(state.RouteTables) ? (state.RouteTables as Array<Record<string, unknown>>) : [];
    const associations = Array.isArray(tables[0]?.Associations)
      ? (tables[0].Associations as Array<Record<string, unknown>>)
      : [];
    return (
      /^rtbassoc-[0-9a-f]{8,21}$/.test(associationId ?? '') &&
      !associations.some((row) => row.RouteTableAssociationId === associationId)
    );
  }
  const vpcId = args[args.indexOf('--vpc-id') + 1];
  const gateways = Array.isArray(state.InternetGateways)
    ? (state.InternetGateways as Array<Record<string, unknown>>)
    : [];
  const attachments = Array.isArray(gateways[0]?.Attachments)
    ? (gateways[0].Attachments as Array<Record<string, unknown>>)
    : [];
  return /^vpc-[0-9a-f]{8,21}$/.test(vpcId ?? '') && !attachments.some((row) => row.VpcId === vpcId);
}

export function awsDeleteRequestSha256(plan: AwsCePlan, action: AwsCeAction, args: string[]) {
  return canonicalSha256({ plan: plan.planSha256, action: action.id, resourceId: action.resourceId, args });
}
export function assertAwsPendingDeleteBinding(
  plan: AwsCePlan,
  action: AwsCeAction,
  args: string[],
  checkpoint: AwsCeCheckpoint,
  ownerDigests: string[],
) {
  const pending = checkpoint.pendingDelete;
  if (
    !pending ||
    !hasDeleteRecovery(action) ||
    pending.actionId !== action.id ||
    pending.resourceId !== action.resourceId ||
    pending.requestSha256 !== awsDeleteRequestSha256(plan, action, args)
  )
    throw Error('Pending AWS deletion differs from the immutable request');
  const before = pending.before;
  if (
    !before ||
    before.id !== pending.resourceId ||
    before.region !== plan.region ||
    !before.exists ||
    !before.owned ||
    pending.beforeSha256 !== canonicalSha256(before) ||
    before.tags['xcsh-managed-by'] !== 'aws-ce' ||
    before.tags['xcsh-execution-engine'] !== plan.engine ||
    before.tags['xcsh-deployment-id'] !== plan.deploymentName ||
    !ownerDigests.includes(before.tags['xcsh-plan-sha256'])
  )
    throw Error('Pending AWS deletion original observation is unavailable or foreign');
  return before;
}
function provenRequestRejection(result: { exitCode: number; stderr: string }) {
  return (
    [252, 253].includes(result.exitCode) ||
    /^An error occurred \((?:UnauthorizedOperation|AccessDenied|AccessDeniedException|AuthFailure|InvalidClientTokenId|ExpiredToken|UnrecognizedClientException)\) when calling /m.test(
      result.stderr,
    )
  );
}
/** Persist deletion intent before mutation and reconcile an ambiguous response from exact cloud state. */
export async function executeRecoverableDelete(
  api: AwsExecApi,
  plan: AwsCePlan,
  action: AwsCeAction,
  args: string[],
  checkpoint: AwsCeCheckpoint,
  persist: () => Promise<unknown>,
  ownershipPlanSha256s: string[],
  signal?: AbortSignal,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  if (!hasDeleteRecovery(action) || !action.resourceId) throw new Error('AWS delete recovery driver is unavailable');
  const requestSha256 = awsDeleteRequestSha256(plan, action, args);
  const pending = checkpoint.pendingDelete;
  if (pending) assertAwsPendingDeleteBinding(plan, action, args, checkpoint, ownershipPlanSha256s);
  let rejectedResult: { exitCode: number; stdout: string; stderr: string } | undefined;
  let submitted = false;
  if (!pending) {
    const before = (
      await observeAwsResources(api, [action.resourceId], plan.region, {
        deploymentName: plan.deploymentName,
        planSha256s: [...new Set(ownershipPlanSha256s)].sort(),
      })
    )[0];
    if (!before) throw Error('AWS deletion original observation is unavailable');
    if (!before.exists) return { exitCode: 0, stdout: '{}', stderr: '' };
    if (!before.owned || before.tags['xcsh-execution-engine'] !== plan.engine)
      throw Error('AWS deletion original target ownership differs');
    checkpoint.pendingDelete = {
      actionId: action.id,
      resourceId: action.resourceId,
      requestSha256,
      before,
      beforeSha256: canonicalSha256(before),
    };
    try {
      await persist();
    } catch (error) {
      checkpoint.pendingDelete = undefined;
      throw error;
    }
    try {
      const result = await api.exec('aws', args, { signal });
      if (result.exitCode !== 0) rejectedResult = result;
      else submitted = true;
    } catch {
      signal?.throwIfAborted();
    }
  }
  const deadline = Date.now() + 15 * 60_000;
  while (true) {
    signal?.throwIfAborted();
    const observations = await observeAwsResources(api, [action.resourceId], plan.region, {
      deploymentName: plan.deploymentName,
      planSha256s: [...new Set(ownershipPlanSha256s)].sort(),
    });
    const observation = observations[0];
    if (!observation) throw new Error('AWS deletion observation is unavailable');
    if (
      !observation.exists ||
      (action.kind === 'resource-delete' &&
        action.resourceId.startsWith('i-') &&
        instanceTerminated(observation.state)) ||
      mutationConverged(action, observation.state)
    )
      return { exitCode: 0, stdout: '{}', stderr: '' };
    if (!observation.owned) throw new Error('AWS deletion target ownership changed during reconciliation');
    if (rejectedResult && provenRequestRejection(rejectedResult)) {
      const before = assertAwsPendingDeleteBinding(plan, action, args, checkpoint, ownershipPlanSha256s);
      if (fingerprintOwnedResources([before]) !== fingerprintOwnedResources([observation]))
        throw Error('Rejected AWS deletion target changed; intent is retained');
      checkpoint.pendingDelete = undefined;
      await persist();
      return rejectedResult;
    }

    if (!submitted || Date.now() >= deadline)
      throw new Error('AWS deletion has not converged; resume with the same plan');
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(new Error('AWS deletion convergence cancelled'));
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

export async function collectAwsNativeCloudRetirement(
  api: AwsExecApi,
  plan: AwsCePlan,
  ownershipPlanSha256s: string[],
) {
  const ids = plan.ownershipInventory
    .filter((row) => row.owned && row.action === 'delete')
    .map((row) => row.resourceId);
  if (!ids.length) return collectAwsNativeEmptyCloudInventory(api, plan, ownershipPlanSha256s);
  const observations = await observeAwsResources(api, ids, plan.region, {
    deploymentName: plan.deploymentName,
    planSha256s: ownershipPlanSha256s,
  });
  const remaining = observations.filter(
    (row) => row.exists && !(row.id.startsWith('i-') && instanceTerminated(row.state)),
  );
  return {
    status: remaining.length ? ('pending' as const) : ('absent' as const),
    expected: ids.length,
    retired: ids.length - remaining.length,
    observedAt: new Date().toISOString(),
  };
}
