import { isIP } from 'node:net';
import type { AwsCeIntent } from './types';

function network(cidr: string): { base: number; prefix: number; size: number } {
  const parts = cidr.split('/');
  const prefix = Number(parts[1]);
  if (parts.length !== 2 || isIP(parts[0]) !== 4 || !/^\d+$/.test(parts[1]) || prefix < 16 || prefix > 28)
    throw new Error('AWS interface addressing requires an IPv4 subnet /16 through /28');
  const size = 2 ** (32 - prefix);
  const value = parts[0].split('.').reduce((value, part) => value * 256 + Number(part), 0);
  return { base: Math.floor(value / size) * size, prefix, size };
}
function address(value: number): string {
  return [24, 16, 8, 0].map((shift) => Math.floor(value / 2 ** shift) % 256).join('.');
}
export function awsSubnetHost(cidr: string, offset: number): string {
  return address(network(cidr).base + offset);
}

/** One explicit primary CIDR per node, in the same order as interface subnets. */
export function awsCeStaticIp(intent: AwsCeIntent, node: number, index: number) {
  const item = intent.interfaces.find((item) => item.index === index);
  if (!item || !Number.isInteger(node) || node < 1 || node > intent.topology.nodeCount)
    throw new Error('AWS interface node/index binding is missing');
  if (item.addressing.mode === 'dhcp') {
    if (item.addressing.addresses?.length) throw new Error('DHCP addressing cannot include static addresses');
    return undefined;
  }
  if (
    item.addressing.mode !== 'static' ||
    !Array.isArray(item.addressing.addresses) ||
    item.addressing.addresses.length !== intent.topology.nodeCount
  )
    throw new Error('Static addressing requires one explicit CIDR per node');
  const cidr = item.addressing.addresses[node - 1];
  const subnet = item.subnets[node - 1]?.cidr;
  if (!subnet) throw new Error('Static addressing requires the exact subnet CIDR');
  const expected = network(subnet);
  const selected = network(cidr);
  const ip = cidr.split('/')[0];
  const value = ip.split('.').reduce((value, part) => value * 256 + Number(part), 0);
  if (
    selected.prefix !== expected.prefix ||
    selected.base !== expected.base ||
    value < expected.base + 4 ||
    value >= expected.base + expected.size - 1
  )
    throw new Error('Static address must match its subnet prefix and exclude AWS reserved addresses');
  if (item.role === 'slo') {
    if (!intent.vpc.cidr) throw new Error('Static SLO requires the exact VPC CIDR for AWS DNS');
    return { ip_address: cidr, default_gw: address(expected.base + 1), dns_server: awsSubnetHost(intent.vpc.cidr, 2) };
  }
  return { ip_address: cidr };
}

/** Runs at planning and again on digest-verified execution inputs. */
export function validateAwsCeAddressing(intent: AwsCeIntent): void {
  const staticMode = intent.interfaces.some((item) => item.addressing.mode === 'static');
  if (
    staticMode &&
    (intent.interfaces.some((item) => !item.guestDevice) ||
      new Set(intent.interfaces.map((item) => item.guestDevice)).size !== intent.interfaces.length)
  )
    throw new Error('Static addressing requires distinct verified guest device identities before registration');
  const seen = new Set<string>();
  for (const item of intent.interfaces) {
    for (let node = 1; node <= intent.topology.nodeCount; node++) {
      const selected = awsCeStaticIp(intent, node, item.index);
      if (!selected) continue;
      const ip = selected.ip_address.split('/')[0];
      if (seen.has(ip)) throw new Error('Duplicate static interface address');
      seen.add(ip);
    }
  }
}
