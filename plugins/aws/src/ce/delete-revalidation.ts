import { fingerprintOwnedResources } from './canonical';
import { assertAwsPendingDeleteBinding } from './delete-recovery';
import type { AwsCeCheckpoint, AwsCeObservation, AwsCePlan } from './types';
/** Substitute only the verified pre-request target for its exact authorized transition. */
export function projectAwsPendingDeleteObservation(
  plan: AwsCePlan,
  current: AwsCeObservation,
  checkpoint: AwsCeCheckpoint,
  args: string[],
  ownerDigests: string[],
): AwsCeObservation {
  const index = checkpoint.completedActionIds.length,
    action = plan.actions[index];
  if (!action || checkpoint.completedActionIds.some((id, i) => plan.actions[i]?.id !== id))
    throw Error('Pending AWS deletion is not the next ordered action');
  const before = assertAwsPendingDeleteBinding(plan, action, args, checkpoint, ownerDigests);
  const selected = current.resources.filter((r) => r.id === before.id);
  if (selected.length !== 1 || selected[0].region !== before.region)
    throw Error('Pending AWS deletion current observation is incomplete');
  const actual = selected[0];
  if (actual.exists && fingerprintOwnedResources([actual]) !== fingerprintOwnedResources([before])) {
    const expected = structuredClone(before);
    if (action.kind === 'route-table-disassociate') {
      const id = args[args.indexOf('--association-id') + 1],
        tables = expected.state.RouteTables;
      if (
        !/^rtbassoc-[a-f0-9]{8,21}$/.test(id ?? '') ||
        !Array.isArray(tables) ||
        tables.length !== 1 ||
        !Array.isArray(tables[0].Associations) ||
        tables[0].Associations.filter((a: { RouteTableAssociationId?: string }) => a.RouteTableAssociationId === id)
          .length !== 1
      )
        throw Error('Pending AWS route association binding is incomplete');
      tables[0].Associations = tables[0].Associations.filter(
        (a: { RouteTableAssociationId?: string }) => a.RouteTableAssociationId !== id,
      );
    } else if (action.kind === 'internet-gateway-detach') {
      const id = args[args.indexOf('--vpc-id') + 1],
        gateways = expected.state.InternetGateways;
      if (
        !/^vpc-[a-f0-9]{8,21}$/.test(id ?? '') ||
        !Array.isArray(gateways) ||
        gateways.length !== 1 ||
        !Array.isArray(gateways[0].Attachments) ||
        gateways[0].Attachments.filter((a: { VpcId?: string }) => a.VpcId === id).length !== 1
      )
        throw Error('Pending AWS gateway attachment binding is incomplete');
      gateways[0].Attachments = gateways[0].Attachments.filter((a: { VpcId?: string }) => a.VpcId !== id);
    } else throw Error('Pending AWS deletion target changed outside its authorized transition');
    if (fingerprintOwnedResources([actual]) !== fingerprintOwnedResources([expected]))
      throw Error('Pending AWS deletion contains unrelated target drift');
  }
  return { ...current, resources: current.resources.map((r) => (r.id === before.id ? structuredClone(before) : r)) };
}
