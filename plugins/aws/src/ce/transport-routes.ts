import { isIP } from 'node:net';
import type { AwsCeIntent, AwsCeObservation } from './types';

function network(value: string): { first: number; last: number } {
  const [address, prefix, extra] = value.split('/');
  if (extra !== undefined || isIP(address) !== 4 || !/^(?:[0-9]|[12][0-9]|3[0-2])$/.test(prefix ?? ''))
    throw new Error('GRE transport requires canonical IPv4 CIDR evidence');
  const first = address.split('.').reduce((sum, octet) => sum * 256 + Number(octet), 0);
  const size = 2 ** (32 - Number(prefix));
  if (first % size !== 0) throw new Error('GRE transport CIDR has host bits set');
  return { first, last: first + size - 1 };
}

/** Consume the exact gateway observation already bound into the plan fingerprint. */
export function observedConnectCidrs(intent: AwsCeIntent, observation: AwsCeObservation): string[] {
  const resources = observation.resources.filter((resource) => resource.id === intent.routing.transitGatewayId);
  if (resources.length !== 1 || !resources[0].exists || resources[0].region !== intent.region)
    throw new Error('GRE transport requires one current scoped Transit Gateway observation');
  const state = resources[0].state;
  const gateways = state.TransitGateways as Array<Record<string, unknown>> | undefined;
  if (state.NextToken || !Array.isArray(gateways) || gateways.length !== 1)
    throw new Error('GRE transport Transit Gateway evidence is incomplete');
  const gateway = gateways[0];
  const options = gateway.Options as Record<string, unknown> | undefined;
  if (
    !options ||
    gateway.TransitGatewayId !== intent.routing.transitGatewayId ||
    gateway.State !== 'available' ||
    options?.AmazonSideAsn !== intent.routing.transitGatewayAsn
  )
    throw new Error('GRE transport gateway identity, availability or ASN does not match');
  const cidrs = options.TransitGatewayCidrBlocks;
  if (
    !Array.isArray(cidrs) ||
    !cidrs.length ||
    cidrs.some((cidr) => typeof cidr !== 'string') ||
    new Set(cidrs).size !== cidrs.length
  )
    throw new Error('GRE transport requires observed Transit Gateway CIDR blocks');
  const ranges = (cidrs as string[]).map(network);
  const vpc = intent.vpc.cidr ? network(intent.vpc.cidr) : undefined;
  for (const [index, range] of ranges.entries()) {
    if (
      (vpc && range.first <= vpc.last && vpc.first <= range.last) ||
      ranges.slice(0, index).some((other) => range.first <= other.last && other.first <= range.last)
    )
      throw new Error('GRE transport CIDRs overlap another transport block or the CE VPC');
  }
  for (const peer of intent.routing.connectPeers ?? []) {
    if (!peer.transitGatewayAddress) continue;
    const address = network(`${peer.transitGatewayAddress}/32`).first;
    if (!ranges.some((range) => address >= range.first && address <= range.last))
      throw new Error('GRE endpoint is outside the observed Transit Gateway CIDR blocks');
  }
  return (cidrs as string[]).slice().sort();
}
