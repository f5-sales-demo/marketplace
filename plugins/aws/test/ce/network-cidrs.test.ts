import { expect, test } from 'bun:test';
import { canonicalSha256 } from '../../src/ce/canonical';
import { validateAwsCeNetworkCidrs } from '../../src/ce/network-cidrs';
import { compileAwsCePlan } from '../../src/ce/planner';
import type { AwsCeF5Capabilities, AwsCeIntent, AwsCeObservation } from '../../src/ce/types';
import {
  AWS_CE_F5_GUIDE_URL,
  AWS_CE_MARKETPLACE_PRODUCT_ID,
  AWS_CE_MIN_UPGRADE_SAFE_ROOT_VOLUME_GIB,
  AWS_CE_SHARED_CONTRACT_URL,
  AWS_CE_SSM_PARAMETER,
} from '../../src/ce/types';

const capabilities: AwsCeF5Capabilities = {
  smsv2ContractVersion: 'v2',
  supportedProviders: ['aws', 'azure'],
  bootstrapDrivers: ['console'],
  providerNetworkingProfiles: { aws: ['direct-eni', 'nlb-ingress', 'tgw-static'], azure: ['direct-nic'] },
  awsSmsv2TgwConnect: { supported: false, schemaVersion: null },
};
function interfaces(nodeCount: 1 | 3, count: number): AwsCeIntent['interfaces'] {
  const zones = nodeCount === 1 ? ['us-east-1a'] : ['us-east-1a', 'us-east-1b', 'us-east-1c'];
  return Array.from({ length: count }, (_, index) => ({
    index,
    guestDevice: `ens${5 + index}`,
    role: index === 0 ? ('slo' as const) : index === 1 ? ('sli' as const) : ('service' as const),
    vrf: `vrf-${index}`,
    subnets: zones.map((availabilityZone, node) => ({ availabilityZone, cidr: `10.0.${index * 16 + node}.0/24` })),
    addressing: { mode: 'dhcp' as const },
  }));
}
function intent(overrides: Partial<AwsCeIntent> = {}): AwsCeIntent {
  return {
    schemaVersion: 2,
    engine: 'native',
    operation: 'deploy',
    accountId: '123456789012',
    partition: 'aws',
    region: 'us-east-1',
    deploymentName: 'ce-demo',
    siteName: 'ce-demo',
    namespace: 'system',
    topology: { nodeCount: 1 },
    vpc: { mode: 'greenfield', cidr: '10.0.0.0/16' },
    interfaces: interfaces(1, 2),
    egress: { mode: 'elastic-ip' },
    routing: { profile: 'direct-eni', destinationCidrs: [], associations: [], propagations: [] },
    image: { productId: AWS_CE_MARKETPLACE_PRODUCT_ID, amiId: 'ami-0123456789abcdef0' },
    instance: { type: 'm6i.2xlarge', diskGiB: AWS_CE_MIN_UPGRADE_SAFE_ROOT_VOLUME_GIB },
    securityGroups: [{ name: 'ce', ingress: [], egress: [] }],
    routes: [],
    brownfield: { resourceIds: [], routeTableIds: [], transitGatewayRouteTableIds: [] },
    ...overrides,
  };
}
function observation(overrides: Partial<AwsCeObservation> = {}): AwsCeObservation {
  return {
    schemaVersion: 2,
    identity: { accountId: '123456789012', partition: 'aws', arn: 'arn:aws:iam::123456789012:role/example' },
    agreement: { productId: AWS_CE_MARKETPLACE_PRODUCT_ID, active: true, agreementIds: ['agreement-example'] },
    regions: [
      {
        name: 'us-east-1',
        optInStatus: 'opt-in-not-required',
        enabled: true,
        rank: 1,
        eligible: true,
        reasons: [],
        ami: {
          id: 'ami-0123456789abcdef0',
          ssmParameter: AWS_CE_SSM_PARAMETER,
          ssmVersion: 7,
          ownerAlias: 'aws-marketplace',
          ownerId: '679593333241',
          productCodes: ['marketplace-code'],
          architecture: 'x86_64',
          creationDate: '2026-08-01T00:00:00.000Z',
          state: 'available',
          rootDeviceName: '/dev/xvda',
          rootVolumeGiB: 79,
          launchPermission: true,
          allowedByPolicy: true,
        },
        instanceTypes: [
          {
            name: 'm6i.2xlarge',
            vCpus: 8,
            memoryMiB: 32768,
            maxEnis: 8,
            ipv4PerEni: 30,
            availabilityZones: ['us-east-1a', 'us-east-1b', 'us-east-1c'],
            supported: true,
            reasons: [],
          },
        ],
        vcpuQuota: 64,
        networkQuotas: [],
        transitGatewaySupported: true,
        brownfieldProximity: 0,
      },
    ],
    resources: [],
    ownershipPlanSha256s: [],
    f5Capabilities: capabilities,
    f5CapabilitiesSha256: canonicalSha256(overrides.f5Capabilities ?? capabilities),
    research: {
      method: 'aws-cli-live',
      officialSourceRetrieval: 'live',
      commands: [
        'aws sts get-caller-identity',
        'aws ec2 describe-regions --all-regions',
        `aws ssm get-parameter --name ${AWS_CE_SSM_PARAMETER}`,
        'aws ec2 describe-images',
        'aws ec2 describe-image-attribute',
        'aws ec2 get-allowed-images-settings',
        'aws ec2 describe-instance-types',
        'aws ec2 describe-instance-type-offerings',
        'aws service-quotas get-service-quota',
        'aws service-quotas list-service-quotas',
        'aws marketplace-agreement search-agreements',
      ],
      officialSources: [AWS_CE_F5_GUIDE_URL],
      sourceReceipts: [
        { url: AWS_CE_SHARED_CONTRACT_URL, normalizedSha256: '1'.repeat(64) },
        { url: AWS_CE_F5_GUIDE_URL, normalizedSha256: '2'.repeat(64) },
      ],
      sharedContract: {
        url: AWS_CE_SHARED_CONTRACT_URL,
        contractId: 'f5xc-ce-automation-policy',
        contractVersion: 'v2',
        normalizedSha256: '1'.repeat(64),
      },
      f5AwsGuide: { url: AWS_CE_F5_GUIDE_URL, normalizedSha256: '2'.repeat(64), tgwConnectDocumented: false },
    },
    ...overrides,
  };
}
for (const engine of ['native', 'terraform'] as const) {
  test(`${engine} rejects a greenfield subnet outside the VPC`, () => {
    const value = intent({ engine });
    value.interfaces[1].subnets[0].cidr = '10.1.0.0/24';
    expect(() => compileAwsCePlan(value, observation())).toThrow('contained in vpc.cidr');
  });
  test(`${engine} rejects duplicate, contained and cross-node subnet overlaps`, () => {
    for (const cidr of ['10.0.0.0/24', '10.0.0.0/25']) {
      const value = intent({ engine });
      value.interfaces[1].subnets[0].cidr = cidr;
      expect(() => compileAwsCePlan(value, observation())).toThrow('must not overlap');
    }
    const value = intent({
      engine,
      topology: { nodeCount: 3 },
      interfaces: interfaces(3, 2),
      routing: { profile: 'nlb-ingress', destinationCidrs: [], associations: [], propagations: [] },
    });
    value.interfaces[1].subnets[2].cidr = value.interfaces[0].subnets[0].cidr;
    expect(() => compileAwsCePlan(value, observation())).toThrow('must not overlap');
  });
  test(`${engine} rejects impossible IPv4 network sizes and noncanonical boundaries`, () => {
    for (const cidr of ['10.0.0.0/8', '10.0.0.0/29', '2001:db8::/64', '999.0.0.0/16']) {
      const value = intent({ engine });
      value.vpc.cidr = cidr;
      expect(() => compileAwsCePlan(value, observation())).toThrow();
    }
    for (const cidr of ['10.0.1.1/24', '10.0.1.0/33', '10.0.1.0/15', '10.0.1.0/29', '2001:db8::/64']) {
      const value = intent({ engine });
      value.interfaces[1].subnets[0].cidr = cidr;
      expect(() => compileAwsCePlan(value, observation())).toThrow();
    }
  });
  test(`${engine} retains adjacent valid subnets and independent/HA profiles`, () => {
    for (const topology of [
      { nodeCount: 1 as const },
      { nodeCount: 3 as const },
      { nodeCount: 3 as const, sites: [{ name: 'ce-demo', nodeIndexes: [1, 2, 3] }] },
    ]) {
      const value = intent({
        engine,
        topology,
        interfaces: interfaces(topology.nodeCount, 2),
        routing: {
          profile: topology.nodeCount === 3 ? 'nlb-ingress' : 'direct-eni',
          destinationCidrs: [],
          associations: [],
          propagations: [],
        },
      });
      value.interfaces[1].subnets = value.interfaces[1].subnets.map((s, i) => ({ ...s, cidr: `10.0.${i + 3}.0/24` }));
      const planned = compileAwsCePlan(value, observation());
      expect(planned.intent.interfaces[1].subnets[0].cidr).toBe('10.0.3.0/24');
    }
  });
}

for (const engine of ['native', 'terraform'] as const)
  test(`${engine} rejects AWS-prohibited VPC ranges and host-bit aliases`, () => {
    for (const cidr of [
      '0.0.0.0/16',
      '127.0.0.0/16',
      '169.254.0.0/16',
      '224.0.0.0/16',
      '239.255.0.0/16',
      '10.0.0.1/16',
    ]) {
      const value = intent({ engine });
      value.vpc.cidr = cidr;
      if (cidr !== '10.0.0.1/16') {
        const [first, second] = cidr.split('/')[0].split('.');
        value.interfaces.forEach((iface, index) => {
          iface.subnets[0].cidr = `${first}.${second}.${index}.0/24`;
        });
      }
      expect(() => compileAwsCePlan(value, observation())).toThrow(
        cidr === '10.0.0.1/16' ? 'canonical network' : 'AWS-prohibited',
      );
    }
  });
test('brownfield membership is not inferred from the primary CIDR alone', () => {
  const value = intent();
  value.vpc = { mode: 'brownfield', vpcId: 'vpc-12345678', cidr: '10.0.0.0/16' };
  for (const iface of value.interfaces)
    iface.subnets = [{ availabilityZone: 'us-east-1a', subnetId: 'subnet-12345678', cidr: '10.2.0.0/24' }];
  expect(() => validateAwsCeNetworkCidrs(value)).not.toThrow();
});
