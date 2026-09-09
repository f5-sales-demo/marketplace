import type { AwsExecApi } from '../aws/exec';
import { canonicalSha256 } from './canonical';
import { observeAwsResources } from './discovery';
import type { AwsCeAction, AwsCeCheckpoint, AwsCePlan } from './types';

export function hasDeleteRecovery(action: AwsCeAction): boolean {
  return action.kind === 'resource-delete' && action.command === 'aws' && !!action.resourceId;
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
  const requestSha256 = canonicalSha256({
    plan: plan.planSha256,
    action: action.id,
    resourceId: action.resourceId,
    args,
  });
  const pending = checkpoint.pendingDelete;
  if (
    pending &&
    (pending.actionId !== action.id ||
      pending.resourceId !== action.resourceId ||
      pending.requestSha256 !== requestSha256)
  )
    throw new Error('Pending AWS deletion differs from the immutable request');
  if (!pending) {
    checkpoint.pendingDelete = { actionId: action.id, resourceId: action.resourceId, requestSha256 };
    try {
      await persist();
    } catch (error) {
      checkpoint.pendingDelete = undefined;
      throw error;
    }
    try {
      const result = await api.exec('aws', args, { signal });
      if (result.exitCode === 0) return result;
    } catch {
      signal?.throwIfAborted();
    }
  }
  signal?.throwIfAborted();
  const observations = await observeAwsResources(api, [action.resourceId], plan.region, {
    deploymentName: plan.deploymentName,
    planSha256s: [...new Set(ownershipPlanSha256s)].sort(),
  });
  const observation = observations[0];
  if (!observation) throw new Error('AWS deletion observation is unavailable');
  if (!observation.exists || (action.resourceId.startsWith('i-') && instanceTerminated(observation.state)))
    return { exitCode: 0, stdout: '{}', stderr: '' };
  if (!observation.owned) throw new Error('AWS deletion target ownership changed during reconciliation');
  throw new Error('AWS deletion has not converged; resume with the same plan');
}
