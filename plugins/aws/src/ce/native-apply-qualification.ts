import type { AwsCeCheckpoint, AwsCePlan } from './types';

/** A persisted workflow outcome is not a current operational health observation. */
export function nativeAwsApplyQualification(plan: AwsCePlan, checkpoint: AwsCeCheckpoint) {
  const bound =
    plan.engine === 'native' &&
    checkpoint.engine === 'native' &&
    checkpoint.planId === plan.planId &&
    checkpoint.planSha256 === plan.planSha256;
  const ordered =
    bound &&
    checkpoint.completedActionIds.length <= plan.actions.length &&
    checkpoint.completedActionIds.every((id, index) => id === plan.actions[index].id);
  const complete =
    ordered && checkpoint.state === 'complete' && checkpoint.completedActionIds.length === plan.actions.length;
  const trafficGates = plan.actions.filter((action) => action.kind === 'traffic-gate');
  const trafficGateCompleted =
    ordered &&
    plan.intent.ingress?.mode === 'nlb' &&
    trafficGates.length === 1 &&
    checkpoint.completedActionIds.includes(trafficGates[0].id);
  return {
    installation: { status: complete ? ('complete' as const) : ('incomplete' as const) },
    healthScope: 'site-global-only' as const,
    nodeHealth: 'unknown' as const,
    traffic: {
      status: 'unknown' as const,
      gateCompleted: trafficGateCompleted,
      reason:
        plan.intent.ingress?.mode !== 'nlb'
          ? 'no-ingress-probe-configured'
          : trafficGateCompleted
            ? 'checkpointed-probe-is-not-current-live-evidence'
            : 'traffic-gate-not-complete',
    },
  };
}
