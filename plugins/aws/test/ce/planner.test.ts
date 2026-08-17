import { describe, expect, it } from 'bun:test';
import { canonicalSha256 } from '../../src/ce/canonical';
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
  bootstrapDrivers: ['api'],
  providerNetworkingProfiles: { aws: ['direct-eni', 'nlb-ingress', 'tgw-static'], azure: ['direct-nic'] },
  awsSmsv2TgwConnect: { supported: false, schemaVersion: null },
};
const ownerPlanSha256 = 'a'.repeat(64);

function interfaces(nodeCount: 1 | 3, count: number): AwsCeIntent['interfaces'] {
  const zones = nodeCount === 1 ? ['us-east-1a'] : ['us-east-1a', 'us-east-1b', 'us-east-1c'];
  return Array.from({ length: count }, (_, index) => ({
    index,
    role: index === 0 ? ('slo' as const) : index === 1 ? ('sli' as const) : ('service' as const),
    vrf: `vrf-${index}`,
    subnets: zones.map((availabilityZone, node) => ({ availabilityZone, cidr: `10.${index}.${node}.0/24` })),
    addressing: { mode: 'dhcp' as const },
  }));
}

function intent(overrides: Partial<AwsCeIntent> = {}): AwsCeIntent {
  return {
    schemaVersion: 1,
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
    schemaVersion: 1,
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
        contractId: 'f5xc-ce-automation',
        contractVersion: 'v1',
        normalizedSha256: '1'.repeat(64),
      },
      f5AwsGuide: { url: AWS_CE_F5_GUIDE_URL, normalizedSha256: '2'.repeat(64), tgwConnectDocumented: false },
    },
    ...overrides,
  };
}

describe('compileAwsCePlan', () => {
  it('is byte-identical and emits secret-free exact argv actions', () => {
    const first = compileAwsCePlan(intent(), observation());
    const second = compileAwsCePlan(intent(), observation());
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.planSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(first)).not.toMatch(/bootstrapToken|fixture-secret/i);
    expect(first.actions.every((action) => !action.command || action.command === 'aws')).toBe(true);
    expect(first.actions.flatMap((action) => action.args ?? [])).not.toContain('--no-cli-pager');
    expect(first.ownershipTags['ves-io-site-name']).toBe('ce-demo');
    expect(JSON.stringify(first.actions)).toContain('Key=ves-io-site-name,Value=ce-demo');
    expect(first.actions.find((action) => action.kind === 'instance-run')?.args).toContain(
      `DeviceName=/dev/xvda,Ebs={VolumeSize=${AWS_CE_MIN_UPGRADE_SAFE_ROOT_VOLUME_GIB},VolumeType=gp3,DeleteOnTermination=true}`,
    );
  });

  it('raises a boot-only root volume to the upgrade-safe size in the immutable launch plan', () => {
    const plan = compileAwsCePlan(intent({ instance: { type: 'm6i.2xlarge', diskGiB: 80 } }), observation());
    expect(plan.actions.find((action) => action.kind === 'instance-run')?.args).toContain(
      `DeviceName=/dev/xvda,Ebs={VolumeSize=${AWS_CE_MIN_UPGRADE_SAFE_ROOT_VOLUME_GIB},VolumeType=gp3,DeleteOnTermination=true}`,
    );
  });

  for (const count of [1, 2, 4, 8])
    it(`supports ${count} ordered ENI(s)`, () => {
      const plan = compileAwsCePlan(intent({ interfaces: interfaces(1, count) }), observation());
      expect(plan.interfaces.map((item) => item.index)).toEqual(Array.from({ length: count }, (_, index) => index));
    });

  it('emits three-zone NLB ingress without using the NLB as a route next hop', () => {
    const threeNodeCapabilities = structuredClone(capabilities);
    const plan = compileAwsCePlan(
      intent({
        topology: { nodeCount: 3 },
        interfaces: interfaces(3, 2),
        routing: { profile: 'nlb-ingress', destinationCidrs: [], associations: [], propagations: [] },
      }),
      observation({ f5Capabilities: threeNodeCapabilities }),
    );
    expect(plan.actions.some((action) => action.kind === 'nlb-create')).toBe(true);
    expect(plan.actions.some((action) => action.kind === 'nlb-target-group-create')).toBe(true);
    expect(plan.actions.some((action) => action.kind === 'nlb-register-targets')).toBe(true);
    expect(plan.actions.some((action) => action.kind === 'nlb-listener-create')).toBe(true);
    expect(
      plan.actions.filter((action) => action.kind === 'route-create' || action.kind === 'route-replace'),
    ).toHaveLength(0);
  });

  it('rejects deployment names that cannot form valid NLB and target-group names', () => {
    expect(() =>
      compileAwsCePlan(
        intent({
          deploymentName: 'invalid_nlb_name',
          topology: { nodeCount: 3 },
          interfaces: interfaces(3, 2),
          routing: { profile: 'nlb-ingress', destinationCidrs: [], associations: [], propagations: [] },
        }),
        observation(),
      ),
    ).toThrow(/valid name/i);
  });

  for (const mode of ['nat-gateway', 'firewall', 'proxy'] as const)
    it(`supports explicitly allowlisted ${mode} egress without allocating Elastic IPs`, () => {
      const resourceId =
        mode === 'nat-gateway'
          ? 'nat-0123456789abcdef0'
          : mode === 'firewall'
            ? 'vpce-0123456789abcdef0'
            : 'eni-0123456789abcdef0';
      const plan = compileAwsCePlan(
        intent({
          egress: { mode, resourceId },
          brownfield: { resourceIds: [resourceId], routeTableIds: [], transitGatewayRouteTableIds: [] },
        }),
        observation({
          resources: [
            { id: resourceId, region: 'us-east-1', exists: true, owned: false, tags: {}, state: { fixture: mode } },
          ],
        }),
      );
      expect(plan.actions.some((action) => action.kind === 'elastic-ip-allocate')).toBe(false);
      expect(plan.ownershipInventory).toContainEqual({ resourceId, owned: false, action: 'modify-approved' });
    });

  it('emits appliance-mode TGW static associations, propagations, routes, and CE ENI routes', () => {
    const tgwId = 'tgw-0123456789abcdef0';
    const tgwRtb = 'tgw-rtb-0123456789abcdef0';
    const routeTable = 'rtb-0123456789abcdef0';
    const plan = compileAwsCePlan(
      intent({
        topology: { nodeCount: 3 },
        interfaces: interfaces(3, 2),
        routing: {
          profile: 'tgw-static',
          destinationCidrs: ['10.200.0.0/16'],
          transitGatewayId: tgwId,
          transitGatewayRouteTableId: tgwRtb,
          associations: [tgwRtb],
          propagations: [tgwRtb],
        },
        routes: [{ routeTableId: routeTable, destinationCidr: '10.200.0.0/16' }],
        brownfield: { resourceIds: [tgwId], routeTableIds: [routeTable], transitGatewayRouteTableIds: [tgwRtb] },
      }),
      observation({
        resources: [
          { id: tgwId, region: 'us-east-1', exists: true, owned: false, tags: {}, state: {} },
          { id: tgwRtb, region: 'us-east-1', exists: true, owned: false, tags: {}, state: {} },
          { id: routeTable, region: 'us-east-1', exists: true, owned: false, tags: {}, state: {} },
        ],
      }),
    );
    expect(plan.actions.map((action) => action.kind)).toEqual(
      expect.arrayContaining([
        'tgw-vpc-attachment-create',
        'tgw-associate',
        'tgw-propagate',
        'tgw-route-create',
        'route-replace',
        'tgw-route-gate',
      ]),
    );
  });

  it('rejects disabled AMI policy, quota/AZ restrictions, and inconsistent capability digests', () => {
    const restricted = observation();
    restricted.regions[0] = {
      ...restricted.regions[0],
      eligible: false,
      reasons: ['ami-policy', 'vcpu-quota', 'az-offering'],
    };
    expect(() => compileAwsCePlan(intent(), restricted)).toThrow(/ami-policy/);
    const digestDrift = observation({ f5CapabilitiesSha256: '0'.repeat(64) });
    expect(() => compileAwsCePlan(intent(), digestDrift)).toThrow(/capability digest/i);
  });

  it('requires observed owned inventory for lifecycle work and never silently redeploys', () => {
    expect(() => compileAwsCePlan(intent({ operation: 'resize' }), observation())).toThrow(/observed owned instance/i);
    expect(() => compileAwsCePlan(intent({ operation: 'replace-node', replacementNode: 1 }), observation())).toThrow(
      /observed owned instance/i,
    );
  });

  it('orders rolling lifecycle work by immutable node tags instead of AWS resource IDs', () => {
    const resources = [
      { id: 'i-fffffffffffffffff', node: '1' },
      { id: 'i-12345678901211111', node: '2' },
      { id: 'i-aaaaaaaaaaaaaaaaa', node: '3' },
    ].map(({ id, node }) => ({
      id,
      region: 'us-east-1',
      exists: true,
      owned: true,
      tags: {
        'xcsh-managed-by': 'aws-ce',
        'xcsh-deployment-id': 'ce-demo',
        'xcsh-plan-sha256': ownerPlanSha256,
        'xcsh-node-index': node,
      },
      state: {},
    }));
    const plan = compileAwsCePlan(
      intent({
        operation: 'resize',
        topology: { nodeCount: 3 },
        interfaces: interfaces(3, 2),
        routing: { profile: 'nlb-ingress', destinationCidrs: [], associations: [], propagations: [] },
      }),
      observation({ resources, ownershipPlanSha256s: [ownerPlanSha256] }),
    );
    const stops = plan.actions.filter((action) => action.kind === 'instance-stop');
    expect(stops.map((action) => [action.node, action.resourceId])).toEqual([
      [1, 'i-fffffffffffffffff'],
      [2, 'i-12345678901211111'],
      [3, 'i-aaaaaaaaaaaaaaaaa'],
    ]);
  });

  it('restores brownfield routes exactly before deleting only owned resources during teardown', () => {
    const routeTableId = 'rtb-0123456789abcdef0';
    const ownedInstanceId = 'i-0123456789abcdef0';
    const teardownIntent = intent({
      operation: 'teardown',
      routes: [{ routeTableId, destinationCidr: '10.200.0.0/16' }],
      brownfield: { resourceIds: [], routeTableIds: [routeTableId], transitGatewayRouteTableIds: [] },
    });
    const plan = compileAwsCePlan(
      teardownIntent,
      observation({
        resources: [
          { id: routeTableId, region: 'us-east-1', exists: true, owned: false, tags: {}, state: {} },
          {
            id: ownedInstanceId,
            region: 'us-east-1',
            exists: true,
            owned: true,
            tags: {
              'xcsh-managed-by': 'aws-ce',
              'xcsh-deployment-id': 'ce-demo',
              'xcsh-plan-sha256': ownerPlanSha256,
              'xcsh-node-index': '1',
            },
            state: {},
          },
        ],
        ownershipPlanSha256s: [ownerPlanSha256],
      }),
      [
        {
          id: routeTableId,
          before: {
            RouteTables: [
              {
                Routes: [
                  {
                    DestinationCidrBlock: '10.200.0.0/16',
                    NatGatewayId: 'nat-0123456789abcdef0',
                  },
                ],
              },
            ],
          },
        },
      ],
    );
    const mutations = plan.actions.filter((action) => action.mutates);
    expect(mutations.every((action) => action.command === 'aws' && (action.args?.length ?? 0) > 0)).toBe(true);
    expect(mutations[0].args).toEqual(
      expect.arrayContaining(['replace-route', '--nat-gateway-id', 'nat-0123456789abcdef0']),
    );
    expect(mutations.at(-1)?.args).toEqual(expect.arrayContaining(['terminate-instances', ownedInstanceId]));
    expect(plan.actions.some((action) => action.kind === 'resource-delete' && action.resourceId === routeTableId)).toBe(
      false,
    );
  });

  it('release-blocks TGW Connect without both documentation and tenant schema evidence', () => {
    const brownfieldInterfaces = interfaces(3, 2).map((item) => ({
      ...item,
      subnets: item.subnets.map((subnet, node) => ({
        availabilityZone: subnet.availabilityZone,
        subnetId: `subnet-${String(item.index + 1).repeat(8)}${String(node + 1).repeat(8)}`.slice(0, 24),
      })),
    }));
    const subnetIds = brownfieldInterfaces.flatMap((item) =>
      item.subnets.flatMap((subnet) => (subnet.subnetId ? [subnet.subnetId] : [])),
    );
    expect(() =>
      compileAwsCePlan(
        intent({
          topology: { nodeCount: 3 },
          interfaces: brownfieldInterfaces,
          vpc: { mode: 'brownfield', vpcId: 'vpc-0123456789abcdef0' },
          routing: {
            profile: 'tgw-connect',
            destinationCidrs: [],
            transitGatewayId: 'tgw-0123456789abcdef0',
            transportAttachmentId: 'tgw-attach-0123456789abcdef0',
            customerAsn: 65010,
            transitGatewayAsn: 64512,
            insideCidrs: ['169.254.10.0/29', '169.254.10.8/29', '169.254.10.16/29'],
            associations: [],
            propagations: [],
          },
          brownfield: {
            resourceIds: [
              'vpc-0123456789abcdef0',
              'tgw-0123456789abcdef0',
              'tgw-attach-0123456789abcdef0',
              ...subnetIds,
            ],
            routeTableIds: [],
            transitGatewayRouteTableIds: [],
          },
        }),
        observation(),
      ),
    ).toThrow(/release-blocked/i);
  });

  it('rejects AWS-reserved TGW Connect inside CIDRs before planning', () => {
    expect(() =>
      compileAwsCePlan(
        intent({
          topology: { nodeCount: 3 },
          interfaces: interfaces(3, 2),
          routing: {
            profile: 'tgw-connect',
            destinationCidrs: [],
            transitGatewayId: 'tgw-0123456789abcdef0',
            customerAsn: 65010,
            transitGatewayAsn: 64512,
            insideCidrs: ['169.254.0.0/29', '169.254.10.8/29', '169.254.10.16/29'],
            associations: [],
            propagations: [],
          },
          brownfield: {
            resourceIds: ['tgw-0123456789abcdef0'],
            routeTableIds: [],
            transitGatewayRouteTableIds: [],
          },
        }),
        observation(),
      ),
    ).toThrow(/reserved by AWS/i);
  });

  it('requires an active Marketplace agreement and exact rediscovery', () => {
    expect(() =>
      compileAwsCePlan(
        intent(),
        observation({ agreement: { productId: AWS_CE_MARKETPLACE_PRODUCT_ID, active: false, agreementIds: [] } }),
      ),
    ).toThrow(/marketplace.*subscribe/i);
  });

  it('rejects command injection and stale regional AMI substitution', () => {
    expect(() => compileAwsCePlan(intent({ deploymentName: 'ce;delete' }), observation())).toThrow(/characters/i);
    expect(() =>
      compileAwsCePlan(
        intent({ image: { productId: AWS_CE_MARKETPLACE_PRODUCT_ID, amiId: 'ami-aaaaaaaaaaaaaaaaa' } }),
        observation(),
      ),
    ).toThrow(/AMI/i);
    expect(() => compileAwsCePlan(intent({ accountId: '222222222222' }), observation())).toThrow(/identity/i);
    expect(() =>
      compileAwsCePlan(
        intent({
          brownfield: {
            resourceIds: [
              'arn:aws:elasticloadbalancing:us-east-1:222222222222:loadbalancer/net/example/0123456789abcdef',
            ],
            routeTableIds: [],
            transitGatewayRouteTableIds: [],
          },
        }),
        observation(),
      ),
    ).toThrow(/partition, account, or region/i);
    expect(() =>
      compileAwsCePlan(
        intent({
          routes: [{ routeTableId: 'rtb-0123456789abcdef0', destinationCidr: '10.0.0.0/16\n--dry-run' }],
          brownfield: { resourceIds: [], routeTableIds: ['rtb-0123456789abcdef0'], transitGatewayRouteTableIds: [] },
        }),
        observation(),
      ),
    ).toThrow(/control characters|CIDR/i);
  });

  it('rejects owned resources whose deployment or prior-plan tags are not exact', () => {
    expect(() =>
      compileAwsCePlan(
        intent({ operation: 'stop' }),
        observation({
          ownershipPlanSha256s: [ownerPlanSha256],
          resources: [
            {
              id: 'i-0123456789abcdef0',
              region: 'us-east-1',
              exists: true,
              owned: true,
              tags: {
                'xcsh-managed-by': 'aws-ce',
                'xcsh-deployment-id': 'another-deployment',
                'xcsh-plan-sha256': ownerPlanSha256,
                'xcsh-node-index': '1',
              },
              state: {},
            },
          ],
        }),
      ),
    ).toThrow(/approved prior plan tags/i);
  });
});
