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
  AWS_CE_TGW_GUIDE_URL,
} from '../../src/ce/types';

const capabilities: AwsCeF5Capabilities = {
  smsv2ContractVersion: 'v2',
  supportedProviders: ['aws', 'azure'],
  bootstrapDrivers: ['console'],
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
      plan.actions.filter(
        (action) =>
          (action.kind === 'route-create' || action.kind === 'route-replace') &&
          action.args?.some((arg) => arg.includes('__NLB')),
      ),
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
        'xcsh-execution-engine': 'native',
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
              'xcsh-execution-engine': 'native',
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
    expect(plan.actions.at(-1)?.kind).toBe('instance-termination-gate');
    expect(plan.actions.at(-1)?.args).toEqual(
      expect.arrayContaining(['wait', 'instance-terminated', '--instance-ids', ownedInstanceId]),
    );
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
    ).toThrow(/MCN routing recipe.*telemetry/i);
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
                'xcsh-execution-engine': 'native',
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

it('persists engine ownership and rejects obsolete plans', () => {
  const native = compileAwsCePlan(intent(), observation());
  const terraform = compileAwsCePlan(intent({ engine: 'terraform' }), observation());
  expect(native.engine).toBe('native');
  expect(terraform.engine).toBe('terraform');
  expect(terraform.planSha256).not.toBe(native.planSha256);
  expect(terraform.ownershipTags['xcsh-execution-engine']).toBe('terraform');
  expect(() => compileAwsCePlan({ ...intent(), schemaVersion: 1 } as never, observation())).toThrow('schema');
});
it('captures real MAC identities before launching an HA site and waits until all nodes launch before registration gates', () => {
  const plan = compileAwsCePlan(
    intent({
      topology: { nodeCount: 3 },
      interfaces: interfaces(3, 2),
      routing: { profile: 'nlb-ingress', destinationCidrs: [], associations: [], propagations: [] },
    }),
    observation(),
  );
  const firstLaunch = plan.actions.findIndex((action) => action.kind === 'instance-run');
  const firstGate = plan.actions.findIndex((action) => action.kind === 'registration-gate');
  expect(plan.actions.slice(0, firstLaunch).filter((action) => action.kind === 'eni-create')).toHaveLength(6);
  expect(plan.actions.slice(0, firstGate).filter((action) => action.kind === 'instance-run')).toHaveLength(3);
  expect(
    plan.actions
      .filter((action) => action.kind === 'eni-create')
      .every((action) => action.captures?.some((capture) => capture.path === 'NetworkInterface.MacAddress')),
  ).toBe(true);
});

it('provides internet routing only to SLO subnets before launching greenfield nodes', () => {
  const plan = compileAwsCePlan(
    intent({
      topology: { nodeCount: 3 },
      interfaces: interfaces(3, 2),
      routing: { profile: 'nlb-ingress', destinationCidrs: [], associations: [], propagations: [] },
    }),
    observation(),
  );
  const firstLaunch = plan.actions.findIndex((action) => action.kind === 'instance-run');
  const network = plan.actions.slice(0, firstLaunch);
  expect(network.filter((action) => action.kind === 'internet-gateway-create')).toHaveLength(1);
  expect(network.filter((action) => action.kind === 'internet-gateway-attach')).toHaveLength(1);
  const associations = network.filter((action) => action.kind === 'route-table-associate');
  expect(associations).toHaveLength(3);
  expect(associations.map((action) => action.args?.[action.args.indexOf('--subnet-id') + 1])).toEqual([
    '__SUBNET_1_0__',
    '__SUBNET_2_0__',
    '__SUBNET_3_0__',
  ]);
  const defaultRoute = network.find((action) => action.kind === 'route-create');
  expect(defaultRoute?.args).toContain('0.0.0.0/0');
  expect(defaultRoute?.args).toContain('__IGW_ID__');
});

it('removes SLO associations and detaches gateways before deleting owned network resources', () => {
  const digest = 'a'.repeat(64);
  const vpc = 'vpc-0123456789abcdef0';
  const table = 'rtb-0123456789abcdef0';
  const gateway = 'igw-0123456789abcdef0';
  const tags = {
    'xcsh-managed-by': 'aws-ce',
    'xcsh-execution-engine': 'native',
    'xcsh-deployment-id': 'ce-demo',
    'xcsh-plan-sha256': digest,
  };
  const resources = [
    { id: vpc, state: { Vpcs: [{ VpcId: vpc }] } },
    {
      id: table,
      state: {
        RouteTables: [
          {
            RouteTableId: table,
            Associations: [{ Main: false, RouteTableAssociationId: 'rtbassoc-0123456789abcdef0' }],
          },
        ],
      },
    },
    { id: gateway, state: { InternetGateways: [{ InternetGatewayId: gateway, Attachments: [{ VpcId: vpc }] }] } },
  ].map((resource) => ({ ...resource, tags, exists: true, owned: true, region: 'us-east-1' }));
  const plan = compileAwsCePlan(
    intent({ operation: 'teardown' }),
    observation({ resources, ownershipPlanSha256s: [digest] }),
  );
  expect(plan.actions.map((action) => action.args?.[1])).toEqual([
    'disassociate-route-table',
    'delete-route-table',
    'detach-internet-gateway',
    'delete-internet-gateway',
    'delete-vpc',
  ]);
  const changed = structuredClone(resources);
  const tables = changed[1].state.RouteTables;
  if (!tables) throw new Error('test fixture missing route table');
  tables[0].Associations[0].Main = true;
  expect(() =>
    compileAwsCePlan(
      intent({ operation: 'teardown' }),
      observation({ resources: changed, ownershipPlanSha256s: [digest] }),
    ),
  ).toThrow('VPC main');
});

it('persists independent site identity in both engines and each node resource tag', () => {
  const sites = [
    { name: 'site-a', nodeIndexes: [1] },
    { name: 'site-b', nodeIndexes: [2] },
    { name: 'site-c', nodeIndexes: [3] },
  ];
  for (const engine of ['native', 'terraform'] as const) {
    const plan = compileAwsCePlan(
      intent({
        engine,
        topology: { nodeCount: 3, sites },
        interfaces: interfaces(3, 2),
        routing: { profile: 'nlb-ingress', destinationCidrs: [], associations: [], propagations: [] },
      }),
      observation(),
    );
    expect(plan.intent.topology.sites).toEqual(sites);
    for (const action of plan.actions.filter(
      (action) => action.kind === 'instance-run' || action.kind === 'eni-create',
    )) {
      expect(action.args?.join(' ')).toContain(`Key=ves-io-site-name,Value=${sites[(action.node ?? 1) - 1].name}`);
    }
  }
});

it('plans six independent GRE peers and twelve sessions for either engine with explicit transport selection', () => {
  const peers = Array.from({ length: 6 }, (_, index) => ({
    node: Math.floor(index / 2) + 1,
    insideCidr: `169.254.${index + 10}.0/29`,
    transportInterfaceIndex: 0,
    transitGatewayAddress: `172.31.240.${index + 10}`,
  }));
  const sites = [1, 2, 3].map((node) => ({ name: `site-${node}`, nodeIndexes: [node] }));
  const evidence = observation();
  evidence.resources = [
    {
      id: 'tgw-0123456789abcdef0',
      region: 'us-east-1',
      exists: true,
      owned: false,
      tags: {},
      state: {
        TransitGateways: [
          {
            TransitGatewayId: 'tgw-0123456789abcdef0',
            State: 'available',
            Options: { AmazonSideAsn: 64512, TransitGatewayCidrBlocks: ['172.31.240.0/24'] },
          },
        ],
      },
    },
  ];
  evidence.research.f5AwsGuide.tgwConnectDocumented = false;
  evidence.research.mcnTgwGuide = { url: AWS_CE_TGW_GUIDE_URL, normalizedSha256: '3'.repeat(64), documented: true };
  evidence.research.sourceReceipts.push({ url: AWS_CE_TGW_GUIDE_URL, normalizedSha256: '3'.repeat(64) });
  evidence.f5Capabilities = {
    ...capabilities,
    providerNetworkingProfiles: { aws: ['tgw-connect'] },
    awsSmsv2TgwConnect: { supported: true, schemaVersion: 'f5xc-smsv2-aws-tgw-telemetry/v2' },
  };
  evidence.f5CapabilitiesSha256 = canonicalSha256(evidence.f5Capabilities);
  for (const engine of ['native', 'terraform'] as const) {
    const plan = compileAwsCePlan(
      intent({
        engine,
        brownfield: { resourceIds: ['tgw-0123456789abcdef0'], routeTableIds: [], transitGatewayRouteTableIds: [] },
        topology: { nodeCount: 3, sites },
        interfaces: interfaces(3, 2),
        routing: {
          profile: 'tgw-connect',
          destinationCidrs: [],
          associations: [],
          propagations: [],
          transitGatewayId: 'tgw-0123456789abcdef0',
          customerAsn: 65010,
          transitGatewayAsn: 64512,
          connectPeers: peers,
        },
      }),
      evidence,
    );
    const greRoutes = plan.actions.filter(
      (action) => action.kind === 'route-create' && action.args?.includes('--transit-gateway-id'),
    );
    expect(greRoutes).toHaveLength(1);
    expect(greRoutes[0].args).toContain('__SLO_ROUTE_TABLE__');
    expect(greRoutes[0].args).toContain('172.31.240.0/24');
    const actions = plan.actions.filter((action) => action.kind === 'tgw-connect-peer-create');
    expect(actions).toHaveLength(6);
    const attachments = plan.actions.filter((action) => action.kind === 'tgw-connect-attachment-create');
    expect(attachments).toHaveLength(2);
    const attachmentGates = plan.actions.filter((action) => action.kind === 'tgw-attachment-gate');
    expect(attachmentGates).toHaveLength(3);
    for (const attachment of attachments) {
      const gate = attachmentGates.find((action) => action.resourceId === attachment.capture?.placeholder);
      expect(gate).toBeDefined();
      expect(plan.actions.findIndex((action) => action === gate)).toBeGreaterThan(plan.actions.indexOf(attachment));
      for (const peer of actions.filter((action) => action.args?.includes(attachment.capture?.placeholder ?? ''))) {
        expect(plan.actions.findIndex((action) => action === gate)).toBeLessThan(plan.actions.indexOf(peer));
      }
    }

    const peerCounts = new Map<string, number>();
    for (const action of actions) {
      const attachment = action.args?.[(action.args?.indexOf('--transit-gateway-attachment-id') ?? -1) + 1] ?? '';
      peerCounts.set(attachment, (peerCounts.get(attachment) ?? 0) + 1);
    }
    expect([...peerCounts.values()].sort()).toEqual([2, 4]);
    expect(plan.billableResources.find((resource) => resource.type === 'transit-gateway-attachment')?.count).toBe(3);

    expect(new Set(actions.map((action) => action.capture?.placeholder)).size).toBe(6);
    for (const [index, action] of actions.entries()) {
      expect(action.args).toContain(`__NODE_${peers[index].node}_SLO_IP__`);
      expect(action.args).toContain(peers[index].transitGatewayAddress);
      expect(action.args).toContain(peers[index].insideCidr);
    }
    expect(plan.actions.find((action) => action.kind === 'bgp-gate')?.description).toContain(
      '12 AWS-managed BGP sessions',
    );
    const mixed = compileAwsCePlan(
      {
        ...plan.intent,
        routing: {
          ...plan.intent.routing,
          connectPeers: peers.map((peer, index) => ({ ...peer, transportInterfaceIndex: index % 2 })),
        },
      },
      evidence,
    );
    const mixedRoutes = mixed.actions.filter(
      (action) => action.kind === 'route-create' && action.args?.includes('--transit-gateway-id'),
    );
    expect(mixedRoutes).toHaveLength(2);
    expect(mixedRoutes.map((action) => action.args?.[(action.args?.indexOf('--route-table-id') ?? -1) + 1])).toEqual([
      '__SLO_ROUTE_TABLE__',
      '__GRE_ROUTE_TABLE_1__',
    ]);
    const sliAssociations = mixed.actions.filter(
      (action) => action.kind === 'route-table-associate' && action.args?.includes('__GRE_ROUTE_TABLE_1__'),
    );
    expect(sliAssociations).toHaveLength(3);
    expect(sliAssociations.map((action) => action.args?.[(action.args?.indexOf('--subnet-id') ?? -1) + 1])).toEqual([
      '__SUBNET_1_1__',
      '__SUBNET_2_1__',
      '__SUBNET_3_1__',
    ]);
  }
});

it('rejects every AWS-reserved Connect inside network including .1.0 through .5.0', () => {
  for (const reserved of [
    '169.254.0.0/29',
    '169.254.1.0/29',
    '169.254.2.0/29',
    '169.254.3.0/29',
    '169.254.4.0/29',
    '169.254.5.0/29',
    '169.254.169.248/29',
  ]) {
    expect(() =>
      compileAwsCePlan(
        intent({
          topology: { nodeCount: 3 },
          interfaces: interfaces(3, 2),
          brownfield: { resourceIds: ['tgw-0123456789abcdef0'], routeTableIds: [], transitGatewayRouteTableIds: [] },
          routing: {
            profile: 'tgw-connect',
            transitGatewayId: 'tgw-0123456789abcdef0',
            customerAsn: 65010,
            transitGatewayAsn: 64512,
            insideCidrs: [reserved, '169.254.10.0/29', '169.254.11.0/29'],
            destinationCidrs: [],
            associations: [],
            propagations: [],
          },
        }),
        observation(),
      ),
    ).toThrow('reserved');
  }
});

it('disables forwarding checks on every ENI for single-node and three-node deployments', () => {
  for (const nodeCount of [1, 3] as const) {
    const plan = compileAwsCePlan(
      intent({
        topology: { nodeCount },
        interfaces: interfaces(nodeCount, 2),
        routing: {
          profile: nodeCount === 1 ? 'direct-eni' : 'nlb-ingress',
          destinationCidrs: [],
          associations: [],
          propagations: [],
        },
      }),
      observation(),
    );
    const forwarding = plan.actions.filter((action) => action.kind === 'source-destination-check-disable');
    expect(forwarding).toHaveLength(nodeCount * 2);
    const targets = forwarding.map((action) => {
      expect(action.args).toContain('modify-network-interface-attribute');
      expect(action.args).not.toContain('modify-instance-attribute');
      expect(action.args).toContain('Value=false');
      return action.args?.[(action.args?.indexOf('--network-interface-id') ?? -1) + 1];
    });
    expect(targets).toEqual(
      Array.from({ length: nodeCount }, (_, index) => [`__ENI_${index + 1}_0__`, `__ENI_${index + 1}_1__`]).flat(),
    );
  }
});

it('restores forwarding on every observed ENI reused by replacement without targeting other nodes', () => {
  const ids = ['i-0123456789abcdef0', 'eni-0123456789abcdef0', 'eni-0123456789abcdef1'];
  const resources = ids.map((id, index) => ({
    id,
    region: 'us-east-1',
    exists: true,
    owned: true,
    tags: {
      'xcsh-managed-by': 'aws-ce',
      'xcsh-execution-engine': 'native',
      'xcsh-deployment-id': 'ce-demo',
      'xcsh-plan-sha256': ownerPlanSha256,
      'xcsh-node-index': '1',
      'xcsh-interface-index': String(index - 1),
    },
    state: {},
  }));
  const plan = compileAwsCePlan(
    intent({ operation: 'replace-node', replacementNode: 1 }),
    observation({ resources, ownershipPlanSha256s: [ownerPlanSha256] }),
  );
  const forwarding = plan.actions.filter((action) => action.kind === 'source-destination-check-disable');
  expect(forwarding.map((action) => action.resourceId)).toEqual(ids.slice(1));
  for (const action of forwarding) {
    expect(action.args).toContain('modify-network-interface-attribute');
    expect(action.args).toContain(action.resourceId);
  }
});

it('pins the deliberate MTU default and validates an explicit MTU in the immutable intent', () => {
  const first = compileAwsCePlan(intent(), observation());
  expect(first.interfaces.every((item) => item.mtu === 1500)).toBe(true);
  const jumbo = intent();
  jumbo.interfaces = jumbo.interfaces.map((item) => ({ ...item, mtu: 9000 }));
  const second = compileAwsCePlan(jumbo, observation());
  expect(second.interfaces.every((item) => item.mtu === 9000)).toBe(true);
  expect(second.planSha256).not.toBe(first.planSha256);
  for (const mtu of [0, 1499, 9001, 1500.5]) {
    const invalid = intent();
    invalid.interfaces[0].mtu = mtu;
    expect(() => compileAwsCePlan(invalid, observation())).toThrow('MTU');
  }
});
