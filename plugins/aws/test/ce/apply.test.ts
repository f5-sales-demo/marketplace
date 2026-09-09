import { describe, expect, it } from 'bun:test';
import {
  assertAwsActionOwnership,
  assertAwsApplyAllowed,
  assertAwsObservationFresh,
  assertAwsResumeObservationFresh,
  executableAwsActionArgs,
  observedInstanceTypeNames,
} from '../../src/ce/apply';
import { canonicalSha256, fingerprintObservation } from '../../src/ce/canonical';
import { compileAwsCePlan } from '../../src/ce/planner';
import type { AwsCeIntent, AwsCeObservation } from '../../src/ce/types';
import {
  AWS_CE_F5_GUIDE_URL,
  AWS_CE_MARKETPLACE_PRODUCT_ID,
  AWS_CE_MIN_UPGRADE_SAFE_ROOT_VOLUME_GIB,
  AWS_CE_SHARED_CONTRACT_URL,
  AWS_CE_SSM_PARAMETER,
} from '../../src/ce/types';

const intent: AwsCeIntent = {
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
  interfaces: [
    {
      index: 0,
      role: 'slo',
      vrf: 'default',
      subnets: [{ availabilityZone: 'us-east-1a', cidr: '10.0.0.0/24' }],
      addressing: { mode: 'dhcp' },
    },
  ],
  egress: { mode: 'elastic-ip' },
  routing: { profile: 'direct-eni', destinationCidrs: [], associations: [], propagations: [] },
  image: { productId: AWS_CE_MARKETPLACE_PRODUCT_ID, amiId: 'ami-0123456789abcdef0' },
  instance: { type: 'm6i.2xlarge', diskGiB: AWS_CE_MIN_UPGRADE_SAFE_ROOT_VOLUME_GIB },
  securityGroups: [],
  routes: [],
  brownfield: { resourceIds: [], routeTableIds: [], transitGatewayRouteTableIds: [] },
};
const capabilities = {
  smsv2ContractVersion: 'v2' as const,
  supportedProviders: ['aws' as const],
  bootstrapDrivers: ['console' as const],
  providerNetworkingProfiles: { aws: ['direct-eni'] },
  awsSmsv2TgwConnect: { supported: false, schemaVersion: null },
};
const observation: AwsCeObservation = {
  schemaVersion: 2,
  identity: { accountId: '123456789012', partition: 'aws', arn: 'arn:aws:iam::123456789012:role/example' },
  agreement: { productId: AWS_CE_MARKETPLACE_PRODUCT_ID, active: true, agreementIds: ['agreement'] },
  resources: [],
  ownershipPlanSha256s: [],
  f5Capabilities: capabilities,
  f5CapabilitiesSha256: canonicalSha256(capabilities),
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
        ssmVersion: 1,
        ownerAlias: 'aws-marketplace',
        ownerId: '679593333241',
        productCodes: ['code'],
        architecture: 'x86_64',
        creationDate: '2026-08-01',
        state: 'available',
        rootDeviceName: '/dev/sda1',
        rootVolumeGiB: 80,
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
          availabilityZones: ['us-east-1a'],
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
};

describe('AWS CE apply protections', () => {
  const plan = compileAwsCePlan(intent, observation);
  it('rejects changed source/capability observations before mutation', () => {
    const changed = structuredClone(observation);
    changed.research.sharedContract.normalizedSha256 = '3'.repeat(64);
    expect(() => assertAwsObservationFresh(plan, changed)).toThrow(/stale/i);
  });
  it('requires exact identity and provider-neutral headless gates', () => {
    expect(() =>
      assertAwsApplyAllowed(plan, { planId: plan.planId, planSha256: '0'.repeat(64), hasUI: true, env: {} }),
    ).toThrow(/hash/i);
    expect(() =>
      assertAwsApplyAllowed(plan, { planId: plan.planId, planSha256: plan.planSha256, hasUI: false, env: {} }),
    ).toThrow(/XCSH_CE_HEADLESS/);
  });
});

it('repairs the missing ELBv2 prefix in an already-persisted cross-zone action', () => {
  const plan = compileAwsCePlan(intent, observation);
  const action = plan.actions.find((candidate) => candidate.kind === 'instance-run') as (typeof plan.actions)[number];
  const legacy = { ...action, kind: 'nlb-cross-zone-enable' as const };
  expect(executableAwsActionArgs(legacy, ['modify-load-balancer-attributes', '--load-balancer-arn', 'arn'])).toEqual([
    'elbv2',
    'modify-load-balancer-attributes',
    '--load-balancer-arn',
    'arn',
  ]);
  expect(executableAwsActionArgs(legacy, ['elbv2', 'modify-load-balancer-attributes'])).toEqual([
    'elbv2',
    'modify-load-balancer-attributes',
  ]);
});

it('preserves the complete reviewed instance-type set for live revalidation', () => {
  const reviewed = structuredClone(observation);
  reviewed.regions[0].instanceTypes.push({ ...reviewed.regions[0].instanceTypes[0], name: 'm5.2xlarge' });
  expect(observedInstanceTypeNames(reviewed)).toEqual(['m5.2xlarge', 'm6i.2xlarge']);
});

it('revalidates a persisted observation across BGP convergence but still rejects peer configuration drift', () => {
  const peerId = 'tgw-connect-peer-0123456789abcdef0';
  const down = structuredClone(observation);
  down.resources = [
    {
      id: peerId,
      region: down.regions[0].name,
      exists: true,
      owned: true,
      tags: { 'xcsh-managed-by': 'aws-ce' },
      state: {
        TransitGatewayConnectPeers: [
          {
            TransitGatewayConnectPeerId: peerId,
            ConnectPeerConfiguration: {
              BgpConfigurations: [{ BgpStatus: 'down', PeerAddress: '169.254.1.1' }],
            },
          },
        ],
      },
    },
  ];
  const plan = compileAwsCePlan(intent, observation);
  const expected = fingerprintObservation(down, [peerId]);
  const up = structuredClone(down);
  up.resources[0].state = structuredClone(down.resources[0].state);
  const configuration = (
    up.resources[0].state.TransitGatewayConnectPeers as Array<{
      ConnectPeerConfiguration: { BgpConfigurations: Array<{ BgpStatus: string; PeerAddress: string }> };
    }>
  )[0].ConnectPeerConfiguration;
  configuration.BgpConfigurations[0].BgpStatus = 'up';
  expect(() => assertAwsObservationFresh(plan, up, expected, [peerId])).not.toThrow();
  configuration.BgpConfigurations[0].PeerAddress = '169.254.1.2';
  expect(() => assertAwsObservationFresh(plan, up, expected, [peerId])).toThrow('Stale');
});

describe('resume authorization', () => {
  it('honors existing approval bound to the exact plan while retaining engine restrictions', () => {
    const plan = compileAwsCePlan(intent, observation);
    expect(() =>
      assertAwsApplyAllowed(plan, {
        planId: plan.planId,
        planSha256: plan.planSha256,
        hasUI: false,
        env: {},
        authorized: true,
      }),
    ).not.toThrow();
    const terraform = compileAwsCePlan({ ...intent, engine: 'terraform' }, observation);
    expect(() =>
      assertAwsApplyAllowed(terraform, {
        planId: terraform.planId,
        planSha256: terraform.planSha256,
        hasUI: true,
        env: {},
      }),
    ).toThrow('Terraform-owned');
  });
});

describe('mutation boundary ownership', () => {
  it('resolves synthetic plan targets and rejects an engine change observed immediately before mutation', async () => {
    const plan = compileAwsCePlan(intent, observation);
    const instanceId = 'i-0123456789abcdef0';
    let engine = 'native';
    const calls: string[][] = [];
    const api = {
      exec: async (_command: string, args: string[]) => {
        calls.push(args);
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            Reservations: [
              {
                Instances: [
                  {
                    InstanceId: instanceId,
                    Tags: [
                      { Key: 'xcsh-managed-by', Value: 'aws-ce' },
                      { Key: 'xcsh-deployment-id', Value: plan.deploymentName },
                      { Key: 'xcsh-execution-engine', Value: engine },
                      { Key: 'xcsh-plan-sha256', Value: plan.planSha256 },
                    ],
                  },
                ],
              },
            ],
          }),
        };
      },
    };
    const action = {
      ...plan.actions[0],
      mutates: true,
      resourceId: 'aws://ce-demo/node/1',
      args: ['ec2', 'stop-instances', '--instance-ids', '__INSTANCE_1__'],
    };
    await assertAwsActionOwnership(plan, action, api, { __INSTANCE_1__: instanceId });
    expect(calls[0]).toContain(instanceId);
    engine = 'terraform';
    await expect(assertAwsActionOwnership(plan, action, api, { __INSTANCE_1__: instanceId })).rejects.toThrow(
      'another owner or engine',
    );
    await expect(assertAwsActionOwnership(plan, action, api)).rejects.toThrow('unresolved');
    await expect(
      assertAwsActionOwnership(plan, { ...action, args: ['ec2', 'stop-instances', '--instance-ids', instanceId] }, api),
    ).rejects.toThrow('outside the deployment inventory');
  });

  it('allows only exact resources captured by a brownfield rollback snapshot', async () => {
    const plan = compileAwsCePlan(intent, observation);
    const routeTableId = 'tgw-rtb-0123456789abcdef0';
    const attachmentId = 'tgw-attach-0123456789abcdef0';
    plan.rollback.resources = [
      {
        id: routeTableId,
        before: {
          Associations: [{ TransitGatewayAttachmentId: attachmentId, State: 'associated' }],
          Propagations: [],
          TransitGatewayRouteTables: [{ TransitGatewayRouteTableId: routeTableId }],
        },
      },
    ];
    const api = {
      exec: async (_command: string, args: string[]) => {
        const operation = args[1];
        if (operation === 'get-transit-gateway-route-table-associations')
          return {
            exitCode: 0,
            stderr: '',
            stdout: JSON.stringify({
              Associations: [{ TransitGatewayAttachmentId: attachmentId, State: 'associated' }],
            }),
          };
        if (operation === 'get-transit-gateway-route-table-propagations')
          return { exitCode: 0, stderr: '', stdout: JSON.stringify({ TransitGatewayRouteTablePropagations: [] }) };
        if (operation === 'describe-transit-gateway-route-tables')
          return {
            exitCode: 0,
            stderr: '',
            stdout: JSON.stringify({ TransitGatewayRouteTables: [{ TransitGatewayRouteTableId: routeTableId }] }),
          };
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            TransitGatewayAttachments: [{ TransitGatewayAttachmentId: attachmentId, State: 'available' }],
          }),
        };
      },
    };
    const action = {
      ...plan.actions[0],
      kind: 'brownfield-restore' as const,
      mutates: true,
      resourceId: routeTableId,
      args: [
        'ec2',
        'associate-transit-gateway-route-table',
        '--transit-gateway-route-table-id',
        routeTableId,
        '--transit-gateway-attachment-id',
        attachmentId,
      ],
    };
    await expect(assertAwsActionOwnership(plan, action, api)).resolves.toBeUndefined();
    await expect(
      assertAwsActionOwnership(
        plan,
        { ...action, args: [...action.args.slice(0, -1), 'tgw-attach-fffffffffffffffff'] },
        api,
      ),
    ).rejects.toThrow('outside the deployment inventory');
  });
});

it('permits expected brownfield convergence after a checkpointed teardown action', () => {
  const planned = structuredClone(observation);
  planned.resources = [
    {
      id: 'tgw-rtb-0123456789abcdef0',
      region: 'us-east-1',
      exists: true,
      owned: false,
      tags: {},
      state: { Associations: [{ State: 'disassociating' }] },
    },
  ];
  const plan = compileAwsCePlan(
    {
      ...intent,
      operation: 'teardown',
      brownfield: {
        resourceIds: [],
        routeTableIds: [],
        transitGatewayRouteTableIds: ['tgw-rtb-0123456789abcdef0'],
      },
    },
    planned,
    [{ id: 'tgw-rtb-0123456789abcdef0', before: planned.resources[0].state }],
  );
  const current = structuredClone(planned);
  current.resources[0].state = { Associations: [] };
  expect(() =>
    assertAwsResumeObservationFresh(
      plan,
      planned,
      current,
      fingerprintObservation(planned, ['tgw-rtb-0123456789abcdef0']),
      ['tgw-rtb-0123456789abcdef0'],
      1,
    ),
  ).not.toThrow();
  expect(() =>
    assertAwsResumeObservationFresh(
      plan,
      planned,
      current,
      fingerprintObservation(planned, ['tgw-rtb-0123456789abcdef0']),
      ['tgw-rtb-0123456789abcdef0'],
      0,
    ),
  ).toThrow('Stale');
  current.identity.accountId = '999999999999';
  expect(() =>
    assertAwsResumeObservationFresh(
      plan,
      planned,
      current,
      fingerprintObservation(planned, ['tgw-rtb-0123456789abcdef0']),
      ['tgw-rtb-0123456789abcdef0'],
      1,
    ),
  ).toThrow('Stale');
});

it('resume tolerates owned EIP allocation while rejecting quota or eligibility changes', () => {
  const initial = structuredClone(observation);
  initial.regions[0].elasticIpCapacity = {
    limit: 5,
    allocated: 0,
    reusableOwned: 0,
    available: 5,
    requiredAdditional: 1,
  };
  const plan = compileAwsCePlan(intent, initial);
  const resumed = structuredClone(initial);
  resumed.regions[0].elasticIpCapacity = {
    limit: 5,
    allocated: 1,
    reusableOwned: 1,
    available: 4,
    requiredAdditional: 0,
  };
  expect(() => assertAwsObservationFresh(plan, resumed)).not.toThrow();
  resumed.regions[0].eligible = false;
  expect(() => assertAwsObservationFresh(plan, resumed)).toThrow('Stale');
  resumed.regions[0].eligible = true;
  resumed.regions[0].elasticIpCapacity.limit = 2;
  expect(() => assertAwsObservationFresh(plan, resumed)).toThrow('Stale');
});

it('adding the executing plan to the ownership allowlist does not invalidate a fresh plan', () => {
  const plan = compileAwsCePlan(intent, observation);
  expect(() =>
    assertAwsObservationFresh(plan, {
      ...observation,
      ownershipPlanSha256s: [...observation.ownershipPlanSha256s, plan.planSha256],
    }),
  ).not.toThrow();
});
