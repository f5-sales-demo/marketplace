import { isIP } from 'node:net';
import type { AwsCeIntent } from './types';

function range(cidr: string, label: string) {
  const [address, mask, extra] = cidr.split('/');
  const prefix = Number(mask);
  if (
    extra !== undefined ||
    isIP(address) !== 4 ||
    !Number.isInteger(prefix) ||
    prefix < 16 ||
    prefix > 28 ||
    mask !== String(prefix)
  )
    throw new Error(`AWS CE plan validation failed: ${label} must be an IPv4 /16 through /28`);
  const start = address.split('.').reduce((value, octet) => value * 256 + Number(octet), 0);
  const size = 2 ** (32 - prefix);
  if (start % size !== 0)
    throw new Error(`AWS CE plan validation failed: ${label} must use a canonical network address`);
  return { start, end: start + size - 1, label };
}

/** Greenfield plans create distinct subnets in the one declared VPC CIDR.
 * Brownfield VPC membership is verified from observed placement and exact subnet IDs;
 * the primary CIDR alone does not bound associated secondary ranges.
 */
export function validateAwsCeNetworkCidrs(input: Pick<AwsCeIntent, 'vpc' | 'interfaces'>): void {
  if (!['greenfield', 'brownfield'].includes(input.vpc.mode))
    throw new Error('AWS CE plan validation failed: VPC mode is invalid');
  const vpc = input.vpc.cidr ? range(input.vpc.cidr, 'vpc.cidr') : undefined;
  const prohibited = [
    [0x00000000, 0x00ffffff], // 0.0.0.0/8
    [0x7f000000, 0x7fffffff], // 127.0.0.0/8
    [0xa9fe0000, 0xa9feffff], // 169.254.0.0/16
    [0xe0000000, 0xefffffff], // 224.0.0.0/4
  ] as const;
  if (vpc && prohibited.some(([start, end]) => vpc.start <= end && vpc.end >= start))
    throw new Error('AWS CE plan validation failed: vpc.cidr intersects an AWS-prohibited IPv4 range');
  const subnets = input.interfaces.flatMap((item) =>
    item.subnets.flatMap((subnet, node) =>
      subnet.cidr ? [range(subnet.cidr, `interfaces[${item.index}].subnets[${node}].cidr`)] : [],
    ),
  );
  if (input.vpc.mode !== 'greenfield') return;
  if (!vpc) throw new Error('AWS CE plan validation failed: greenfield VPC requires a CIDR');
  for (const subnet of subnets)
    if (subnet.start < vpc.start || subnet.end > vpc.end)
      throw new Error(`AWS CE plan validation failed: ${subnet.label} must be contained in vpc.cidr`);
  const ordered = [...subnets].sort((left, right) => left.start - right.start);
  for (let index = 1; index < ordered.length; index++)
    if (ordered[index].start <= ordered[index - 1].end)
      throw new Error('AWS CE plan validation failed: newly created subnet CIDRs must not overlap');
}
