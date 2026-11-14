import { expect, test } from 'bun:test';
import { canonicalSha256 } from '../../src/ce/canonical';
import { projectAwsNativeInitialCreation } from '../../src/ce/native-creation-projection';
import { compileAwsCePlan } from '../../src/ce/planner';
import type { AwsCeCheckpoint, AwsCeF5Capabilities, AwsCeIntent, AwsCeObservation } from '../../src/ce/types';
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
function fixture() {
  const plan = compileAwsCePlan(intent(), observation());
  const checkpoint: AwsCeCheckpoint = {
    schemaVersion: 2,
    engine: 'native',
    planId: plan.planId,
    planSha256: plan.planSha256,
    authorization: { planSha256: plan.planSha256, mutations: true, destruction: false },
    completedActionIds: plan.actions.slice(0, 17).map((a) => a.id),
    resolvedValues: {
      __INSTANCE_1__: 'i-12345678',
      __ENI_1_0__: 'eni-12345678',
      __ENI_1_1__: 'eni-87654321',
      __ENI_1_0_MAC__: '02:00:00:00:00:01',
      __ENI_1_1_MAC__: '02:00:00:00:00:02',
    },
    state: 'partial',
  };
  return { plan, checkpoint };
}
test('projects immutable original native creation independent of checkpoint/opaque filename order', () => {
  const { plan, checkpoint } = fixture();
  const early = { ...checkpoint, completedActionIds: plan.actions.slice(0, 2).map((a) => a.id), resolvedValues: {} };
  const a = projectAwsNativeInitialCreation(plan, [early, checkpoint]);
  const b = projectAwsNativeInitialCreation(plan, [checkpoint, early]);
  expect(a).toEqual(b);
  expect(a.instanceId).toBe('i-12345678');
  expect(a.interfaces.map((i) => i.device)).toEqual(['ens5', 'ens6']);
});
test('requires the original captured native VM rather than a completed flag or caller identifier', () => {
  const { plan, checkpoint } = fixture();
  for (const value of ['', '__INSTANCE_1__']) {
    const c = structuredClone(checkpoint);
    c.resolvedValues.__INSTANCE_1__ = value;
    expect(() => projectAwsNativeInitialCreation(plan, [c])).toThrow('identifier is unresolved');
  }
  expect(() => projectAwsNativeInitialCreation(plan, [])).toThrow('unavailable');
  const early = { ...checkpoint, completedActionIds: plan.actions.slice(0, 2).map((a) => a.id) };
  expect(() => projectAwsNativeInitialCreation(plan, [early])).toThrow('has not been recorded');
});
test('conflicting snapshots cannot be hidden by filename order or an older matching checkpoint', () => {
  const { plan, checkpoint } = fixture();
  const moved = structuredClone(checkpoint);
  moved.resolvedValues.__INSTANCE_1__ = 'i-87654321';
  for (const stream of [
    [checkpoint, moved],
    [moved, checkpoint],
  ])
    expect(() => projectAwsNativeInitialCreation(plan, stream)).toThrow('conflict across');
  const malformed = structuredClone(checkpoint);
  malformed.completedActionIds = ['aws-ce-action-0014'];
  expect(() => projectAwsNativeInitialCreation(plan, [checkpoint, malformed])).toThrow('malformed');
});
test('advanced admission, replacement and ambiguous create/delete outcomes reject initial retirement', () => {
  const { plan, checkpoint } = fixture();
  const advanced = structuredClone(checkpoint);
  advanced.completedActionIds = plan.actions.slice(0, 18).map((a) => a.id);
  expect(() => projectAwsNativeInitialCreation(plan, [checkpoint, advanced])).toThrow('advanced');
  for (const c of [
    { ...checkpoint, childPlanSha256s: ['a'.repeat(64)] },
    { ...checkpoint, pendingCreate: { actionId: 'aws-ce-action-0014', requestSha256: 'a'.repeat(64) } },
  ])
    expect(() => projectAwsNativeInitialCreation(plan, [c])).toThrow();
});
test('wrong engine or original authorization cannot supply native creation authority', () => {
  const { plan, checkpoint } = fixture();
  const c = structuredClone(checkpoint);
  c.engine = 'terraform';
  expect(() => projectAwsNativeInitialCreation(plan, [c])).toThrow();
  c.engine = 'native';
  c.authorization = undefined;
  expect(() => projectAwsNativeInitialCreation(plan, [c])).toThrow();
});
test('missing/duplicate/malformed ENI, MAC and device identities reject original creation', () => {
  const { plan, checkpoint } = fixture();
  for (const [key, value] of [
    ['__ENI_1_1__', '__ENI_1_1__'],
    ['__ENI_1_1__', 'eni-12345678'],
    ['__ENI_1_1_MAC__', '02:00:00:00:00:01'],
    ['__ENI_1_1_MAC__', 'not-a-mac'],
  ]) {
    const c = structuredClone(checkpoint);
    c.resolvedValues[key] = value;
    expect(() => projectAwsNativeInitialCreation(plan, [c])).toThrow();
  }
});
