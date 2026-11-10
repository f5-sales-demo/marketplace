import { canonicalSha256 } from '../../src/ce/canonical';
import type { AwsCePlan } from '../../src/ce/types';
export function foundationPlan(ha = false): AwsCePlan {
  const intent = {
    schemaVersion: 2,
    engine: 'terraform',
    operation: 'deploy',
    awsProfile: 'ce-profile',
    accountId: '123456789012',
    region: 'us-east-1',
    deploymentName: 'ce',
    siteName: 'site',
    topology: {
      nodeCount: 3,
      sites: ha
        ? [{ name: 'site', nodeIndexes: [1, 2, 3] }]
        : [1, 2, 3].map((node) => ({ name: `site-${node}`, nodeIndexes: [node] })),
    },
    vpc: { mode: 'greenfield', cidr: '10.0.0.0/16' },
    egress: { mode: 'elastic-ip' },
    routing: { profile: 'tgw-connect' },
    interfaces: [0, 1].map((index) => ({
      index,
      guestDevice: index ? 'ens6' : 'ens5',
      role: index ? 'sli' : 'slo',
      addressing: { mode: 'dhcp' },
      subnets: [1, 2, 3].map((node) => ({
        availabilityZone: `us-east-1${['a', 'b', 'c'][node - 1]}`,
        cidr: `10.0.${index * 3 + node}.0/24`,
      })),
    })),
    securityGroups: [
      {
        name: 'ce',
        ingress: [{ protocol: 'tcp', fromPort: 443, toPort: 443, cidrs: ['10.0.0.0/16'] }],
        egress: [{ protocol: '-1', cidrs: ['0.0.0.0/0'] }],
      },
    ],
    image: { amiId: 'ami-0123456789abcdef0' },
    instance: { type: 'm5.2xlarge', diskGiB: 100 },
  };
  const draft = { schemaVersion: 2, engine: 'terraform', intent };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planSha256, planId: `aws-ce-${planSha256.slice(0, 24)}` } as unknown as AwsCePlan;
}
