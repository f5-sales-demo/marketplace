import { canonicalSha256 } from './canonical';
import type { AwsCeObservation, AwsCePlan, AwsCeResourceObservation } from './types';

type Json = Record<string, unknown>;
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Malformed routing reference evidence');
  return value as Json;
};
const rows = (value: unknown): Json[] => {
  if (!Array.isArray(value)) throw new Error('Incomplete routing reference evidence');
  return value.map(object);
};
const tables = (plan: AwsCePlan) => new Set([...plan.intent.routing.associations, ...plan.intent.routing.propagations]);

/** Collect exact attachment identities from live, explicitly selected route tables. */
export function routingAttachmentIds(plan: AwsCePlan, observation: AwsCeObservation): string[] {
  if (plan.intent.routing.profile !== 'tgw-connect') return [];
  const selected = tables(plan);
  const ids = observation.resources
    .filter((resource) => selected.has(resource.id))
    .flatMap((resource) =>
      ['Associations', 'Propagations'].flatMap((key) =>
        rows(resource.state[key]).map((row) => row.TransitGatewayAttachmentId),
      ),
    );
  if (ids.some((id) => typeof id !== 'string' || !/^tgw-attach-[0-9a-f]{8,17}$/.test(id)))
    throw new Error('Malformed routing attachment identity');
  return [...new Set(ids as string[])];
}

/** Remove only newly added, planned edges backed by independently observed owning attachments.
 * Existing brownfield edges and all route-table configuration remain in the comparison. */
export function ownedRoutingAdditions(
  plan: AwsCePlan,
  before: AwsCeResourceObservation[],
  after: AwsCeResourceObservation[],
  evidence: AwsCeResourceObservation[],
): AwsCeResourceObservation[] {
  return after.map((resource) => {
    const baseline = before.find((item) => item.id === resource.id);
    if (!baseline || !tables(plan).has(resource.id)) return resource;
    const state = { ...resource.state };
    for (const [key, selected] of [
      ['Associations', plan.intent.routing.associations],
      ['Propagations', plan.intent.routing.propagations],
    ] as const) {
      const original = rows(baseline.state[key]);
      const current = rows(state[key]);
      const ids = current.map((row) => row.TransitGatewayAttachmentId);
      if (new Set(ids).size !== ids.length) throw new Error('Duplicate routing reference edge');
      state[key] = current.filter((row) => {
        if (
          !selected.includes(resource.id) ||
          original.some((old) => old.TransitGatewayAttachmentId === row.TransitGatewayAttachmentId)
        )
          return true;
        const matches = evidence.filter((item) => item.id === row.TransitGatewayAttachmentId);
        if (matches.length !== 1) return true;
        const attachment = matches[0];
        const records = rows(attachment.state.TransitGatewayAttachments);
        if (records.length !== 1) return true;
        const actual = records[0];
        const tags = attachment.tags;
        const expectedRow = {
          TransitGatewayAttachmentId: attachment.id,
          ResourceId: actual.ResourceId,
          ResourceType: actual.ResourceType,
        };
        const { State: _state, ...configuration } = row;
        return !(
          plan.engine === 'terraform' &&
          attachment.exists &&
          attachment.owned &&
          attachment.region === plan.region &&
          tags['xcsh-managed-by'] === 'aws-ce' &&
          tags['xcsh-execution-engine'] === 'terraform' &&
          tags['xcsh-deployment-id'] === plan.deploymentName &&
          tags['xcsh-plan-sha256'] === plan.planSha256 &&
          actual.TransitGatewayAttachmentId === attachment.id &&
          actual.TransitGatewayId === plan.intent.routing.transitGatewayId &&
          actual.ResourceOwnerId === plan.accountId &&
          actual.TransitGatewayOwnerId === plan.accountId &&
          typeof actual.ResourceId === 'string' &&
          ((actual.ResourceType === 'vpc' && /^vpc-[0-9a-f]{8,17}$/.test(actual.ResourceId)) ||
            (actual.ResourceType === 'connect' && /^tgw-attach-[0-9a-f]{8,17}$/.test(actual.ResourceId))) &&
          canonicalSha256(configuration) === canonicalSha256(expectedRow)
        );
      });
    }
    return { ...resource, state };
  });
}
