import { verifyAwsCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { siteBindings } from './topology';
import type { AwsCeCheckpoint, AwsCePlan } from './types';

export interface AwsNativeInitialCreationProjection {
  schemaVersion: 1;
  engine: 'native';
  sourcePlanId: string;
  sourcePlanSha256: string;
  ownerSha256: string;
  node: string;
  instanceId: string;
  instanceActionId: string;
  imageId: string;
  interfaces: Array<{ index: number; role: 'slo' | 'sli'; id: string; mac: string; device: string }>;
}

/** Creation fields are immutable across the original checkpoint stream.
 * Artifact names and object/sample timestamps supply no ordering or authority.
 */
export function projectAwsNativeInitialCreation(
  plan: AwsCePlan,
  checkpoints: AwsCeCheckpoint[],
): AwsNativeInitialCreationProjection {
  verifyAwsCePlan(plan);
  const selected = siteBindings(plan);
  if (
    plan.engine !== 'native' ||
    plan.intent.operation !== 'deploy' ||
    selected.length !== 1 ||
    selected[0].site.nodeIndexes.join(',') !== '1' ||
    selected[0].binding.nodes.length !== 1
  )
    throw Error('Original native pending creation requires exactly one native node');
  const matching = checkpoints.filter((c) => c.planId === plan.planId && c.planSha256 === plan.planSha256);
  if (!matching.length) throw Error('Original native creation checkpoint is unavailable');
  const actionIds = plan.actions.map((a) => a.id);
  const run = plan.actions.filter((a) => a.kind === 'instance-run' && a.node === 1);
  if (run.length !== 1) throw Error('Original native instance creation action is ambiguous');
  const runIndex = actionIds.indexOf(run[0].id);
  const projections: AwsNativeInitialCreationProjection[] = [];
  for (const c of matching) {
    if (
      c.schemaVersion !== 2 ||
      c.engine !== 'native' ||
      c.authorization?.planSha256 !== plan.planSha256 ||
      c.authorization.mutations !== true ||
      !['running', 'partial', 'complete'].includes(c.state) ||
      !Array.isArray(c.completedActionIds) ||
      canonicalSha256(c.completedActionIds) !== canonicalSha256(actionIds.slice(0, c.completedActionIds.length)) ||
      (c.childPlanSha256s?.length ?? 0) ||
      !c.resolvedValues ||
      typeof c.resolvedValues !== 'object' ||
      Array.isArray(c.resolvedValues)
    )
      throw Error('Original native creation checkpoint is malformed, conflicting, or replaced');
    if (c.completedActionIds.some((id) => plan.actions.some((a) => a.id === id && a.phase === 'registration')))
      throw Error('Original native admission has advanced beyond pending retirement');
    if (c.completedActionIds.length <= runIndex) continue;
    if (c.pendingCreate || c.pendingDelete) throw Error('Original native creation outcome remains ambiguous');
    const instanceId = c.resolvedValues.__INSTANCE_1__;
    if (!/^i-[0-9a-f]{8,17}$/.test(instanceId ?? '')) throw Error('Original native instance identifier is unresolved');
    const interfaces = plan.interfaces.map((iface) => {
      const id = c.resolvedValues[`__ENI_1_${iface.index}__`];
      const mac = c.resolvedValues[`__ENI_1_${iface.index}_MAC__`];
      if (
        !['slo', 'sli'].includes(iface.role) ||
        !/^eni-[0-9a-f]{8,17}$/.test(id ?? '') ||
        !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(mac ?? '') ||
        !iface.guestDevice
      )
        throw Error('Original native interface identifier, MAC, role or device is unresolved');
      return { index: iface.index, role: iface.role as 'slo' | 'sli', id, mac, device: iface.guestDevice };
    });
    if (
      new Set(interfaces.map((i) => i.id)).size !== interfaces.length ||
      new Set(interfaces.map((i) => i.mac)).size !== interfaces.length ||
      new Set(interfaces.map((i) => i.device)).size !== interfaces.length
    )
      throw Error('Original native interface identities are duplicated');
    projections.push({
      schemaVersion: 1,
      engine: 'native',
      sourcePlanId: plan.planId,
      sourcePlanSha256: plan.planSha256,
      ownerSha256: canonicalSha256(selected[0].binding.owner),
      node: selected[0].binding.nodes[0],
      instanceId,
      instanceActionId: run[0].id,
      imageId: plan.image.id,
      interfaces,
    });
  }
  if (!projections.length) throw Error('Original native instance creation has not been recorded');
  if (new Set(projections.map(canonicalSha256)).size !== 1)
    throw Error('Original native creation identities conflict across checkpoints');
  return projections[0];
}
