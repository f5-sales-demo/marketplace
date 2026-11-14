import { canonicalSha256 } from './canonical';
import type { AwsCeResourceObservation } from './types';

const ALLOCATION = /^eipalloc-[0-9a-f]{8}(?:[0-9a-f]{9})?$/;
const ASSOCIATION = /^eipassoc-[0-9a-f]{8}(?:[0-9a-f]{9})?$/;
const ENI = /^eni-[0-9a-f]{8}(?:[0-9a-f]{9})?$/;
function row(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Malformed EIP relationship evidence');
  return value as Record<string, unknown>;
}
function address(resource: AwsCeResourceObservation) {
  if (['NextToken', 'NextMarker', 'nextToken'].some((key) => Object.hasOwn(resource.state, key)))
    throw Error('Incomplete EIP relationship evidence');
  const values = resource.state.Addresses;
  if (!resource.exists || !resource.owned || !Array.isArray(values) || values.length !== 1)
    throw Error('EIP relationship is missing or foreign');
  const value = row(values[0]);
  if (
    value.Domain !== 'vpc' ||
    typeof value.AllocationId !== 'string' ||
    !ALLOCATION.test(value.AllocationId) ||
    (resource.id.startsWith('eipalloc-') ? value.AllocationId : value.AssociationId) !== resource.id
  )
    throw Error('EIP allocation/association identity is inconsistent');
  return value;
}

/** Independently join owned allocation aliases and their actual network owner before planning deletion. */
export async function observeOwnedAwsEipAssociations(
  initial: AwsCeResourceObservation[],
  accountId: string,
  observe: (ids: string[]) => Promise<AwsCeResourceObservation[]>,
): Promise<AwsCeResourceObservation[]> {
  const resources = new Map(initial.map((resource) => [resource.id, resource]));
  if (resources.size !== initial.length) throw Error('Duplicate EIP discovery resource identity');
  const ensure = async (ids: string[]) => {
    const missing = [...new Set(ids)].filter((id) => !resources.has(id)).sort();
    if (!missing.length) return;
    const observed = await observe(missing);
    if (
      observed.length !== missing.length ||
      new Set(observed.map((r) => r.id)).size !== missing.length ||
      observed.some((r) => !missing.includes(r.id))
    )
      throw Error('Incomplete or ambiguous EIP relationship discovery');
    for (const resource of observed) resources.set(resource.id, resource);
  };
  const originalAliases = initial.filter((r) => r.exists && r.owned && r.id.startsWith('eipassoc-'));
  await ensure(originalAliases.map((r) => String(address(r).AllocationId)));
  const relationships: Array<{ allocation: AwsCeResourceObservation; associationId: string; eniId: string }> = [];
  const seen = new Set<string>();
  for (const allocation of [...resources.values()].filter((r) => r.exists && r.owned && r.id.startsWith('eipalloc-'))) {
    const value = address(allocation);
    if (value.AssociationId === undefined) {
      if (value.NetworkInterfaceId !== undefined || value.InstanceId !== undefined)
        throw Error('Incomplete EIP association evidence');
      continue;
    }
    if (
      typeof value.AssociationId !== 'string' ||
      !ASSOCIATION.test(value.AssociationId) ||
      seen.has(value.AssociationId) ||
      typeof value.NetworkInterfaceId !== 'string' ||
      !ENI.test(value.NetworkInterfaceId)
    )
      throw Error('Malformed or duplicate EIP association identity');
    seen.add(value.AssociationId);
    relationships.push({ allocation, associationId: value.AssociationId, eniId: value.NetworkInterfaceId });
  }
  await ensure(relationships.flatMap((r) => [r.associationId, r.eniId]));
  for (const relationship of relationships) {
    const { allocation, associationId, eniId } = relationship;
    const alias = resources.get(associationId);
    const network = resources.get(eniId);
    if (
      !alias ||
      !network?.exists ||
      !network.owned ||
      alias.region !== allocation.region ||
      network.region !== allocation.region
    )
      throw Error('EIP association network owner is missing or foreign');
    const value = address(alias);
    const parent = address(allocation);
    const networks = network.state.NetworkInterfaces;
    if (
      (value.NetworkInterfaceOwnerId !== undefined && value.NetworkInterfaceOwnerId !== accountId) ||
      (parent.NetworkInterfaceOwnerId !== undefined && parent.NetworkInterfaceOwnerId !== accountId) ||
      value.AllocationId !== allocation.id ||
      value.AssociationId !== associationId ||
      value.NetworkInterfaceId !== eniId ||
      canonicalSha256(alias.tags) !== canonicalSha256(allocation.tags) ||
      !Array.isArray(networks) ||
      networks.length !== 1 ||
      row(networks[0]).NetworkInterfaceId !== eniId ||
      row(networks[0]).OwnerId !== accountId ||
      network.tags['xcsh-execution-engine'] !== allocation.tags['xcsh-execution-engine'] ||
      network.tags['xcsh-deployment-id'] !== allocation.tags['xcsh-deployment-id'] ||
      network.tags['xcsh-node-index'] !== allocation.tags['xcsh-node-index'] ||
      !/^[1-3]$/.test(allocation.tags['xcsh-node-index'] ?? '')
    )
      throw Error('EIP allocation/association/network ownership joins differ');
  }
  if (originalAliases.some((r) => !relationships.some((v) => v.associationId === r.id)))
    throw Error('EIP association changed during discovery');
  return [...resources.values()].sort((a, b) => a.id.localeCompare(b.id));
}
