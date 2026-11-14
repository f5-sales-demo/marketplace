import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AwsExecApi } from '../../src/aws/exec';
import { canonicalSha256 } from '../../src/ce/canonical';
import { readAwsNativeInitialCreation } from '../../src/ce/native-creation-reader';
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
const directories: string[] = [];
afterEach(async () => {
  for (const d of directories.splice(0)) await rm(d, { recursive: true, force: true });
});
async function readerFixture() {
  const f = fixture();
  const directory = await mkdtemp(join(tmpdir(), 'native-original-read-'));
  directories.push(directory);
  const path = join(directory, '9.aws-ce-checkpoint.log');
  await writeFile(path, JSON.stringify({ kind: 'aws-ce-checkpoint', checkpoint: f.checkpoint }), { mode: 0o600 });
  const tags = [
    ...Object.entries(f.plan.ownershipTags).map(([Key, Value]) => ({
      Key,
      Value: Value === '__PLAN_SHA256__' ? f.plan.planSha256 : Value,
    })),
    { Key: 'xcsh-node-index', Value: '1' },
  ];
  const state = { fault: '', calls: [] as string[][] };
  const api = {
    async exec(_command: string, args: string[]) {
      state.calls.push(args);
      let data: Record<string, unknown>;
      if (args[0] === 'sts') {
        data = {
          Account: state.fault === 'account' ? '999999999999' : f.plan.accountId,
          Arn: `arn:aws:iam::${f.plan.accountId}:role/synthetic`,
        };
      } else if (args[1] === 'describe-instances')
        data = {
          Reservations: [
            {
              OwnerId: state.fault === 'reservation-owner' ? '999999999999' : f.plan.accountId,
              Instances: [
                {
                  InstanceId: f.checkpoint.resolvedValues.__INSTANCE_1__,
                  ImageId: state.fault === 'image' ? 'ami-00000000' : f.plan.image.id,
                  State: { Name: 'running' },
                  Tags: tags,
                  NetworkInterfaces: [0, 1].map((DeviceIndex) => ({
                    NetworkInterfaceId: f.checkpoint.resolvedValues[`__ENI_1_${DeviceIndex}__`],
                    Attachment: { DeviceIndex },
                  })),
                },
              ],
            },
          ],
        };
      else if (args[1] === 'describe-network-interfaces') {
        const id = args[args.indexOf('--network-interface-ids') + 1];
        const index = id === f.checkpoint.resolvedValues.__ENI_1_0__ ? 0 : 1;
        const iface = {
          NetworkInterfaceId: id,
          MacAddress:
            state.fault === 'mac' ? '02:ff:00:00:00:01' : f.checkpoint.resolvedValues[`__ENI_1_${index}_MAC__`],
          OwnerId: f.plan.accountId,
          Tags: [...tags, { Key: 'xcsh-interface-index', Value: String(index) }],
          Attachment: {
            InstanceId: state.fault === 'instance-join' ? 'i-87654321' : f.checkpoint.resolvedValues.__INSTANCE_1__,
            DeviceIndex: index,
            Status: 'attached',
          },
        };
        data = { NetworkInterfaces: state.fault === 'partial' ? [] : [iface] };
      } else return { exitCode: 78, stdout: '', stderr: 'Unqualified read' };
      if (state.fault === 'changed' && args[1] === 'describe-instances') {
        const c = structuredClone(f.checkpoint);
        c.resolvedValues.__INSTANCE_1__ = 'i-87654321';
        await writeFile(path, JSON.stringify({ kind: 'aws-ce-checkpoint', checkpoint: c }), { mode: 0o600 });
      }
      return { exitCode: state.fault === 'unavailable' ? 255 : 0, stdout: JSON.stringify(data), stderr: '' };
    },
  } as AwsExecApi;
  const manager = { getArtifactsDir: () => directory, saveArtifact: async () => '', getSessionId: () => directory };
  return { ...f, path, manager, api, state };
}
test('joins recorded original creation to exact current owned node/image/ENI/MAC hardware', async () => {
  const f = await readerFixture();
  const read = await readAwsNativeInitialCreation(f.plan, f.manager, f.api);
  expect(read.instanceId).toBe('i-12345678');
  expect(read.interfaces).toHaveLength(2);
  expect(f.state.calls.every((a) => a[1].startsWith('describe-') || a[1].startsWith('get-'))).toBe(true);
});
test('account, reservation owner, image, instance join, MAC, partial and unavailable reads cannot grant authority', async () => {
  for (const fault of ['account', 'reservation-owner', 'image', 'instance-join', 'mac', 'partial', 'unavailable']) {
    const f = await readerFixture();
    f.state.fault = fault;
    await expect(readAwsNativeInitialCreation(f.plan, f.manager, f.api)).rejects.toThrow();
  }
});
test('creation identity changing while hardware is read rejects the snapshot', async () => {
  const f = await readerFixture();
  f.state.fault = 'changed';
  await expect(readAwsNativeInitialCreation(f.plan, f.manager, f.api)).rejects.toThrow('changed during');
});
test('malformed current checkpoint evidence cannot fall back to an older matching snapshot', async () => {
  const f = await readerFixture();
  await writeFile(join(f.manager.getArtifactsDir(), 'opaque-newer.aws-ce-checkpoint.log'), '{', { mode: 0o600 });
  await expect(readAwsNativeInitialCreation(f.plan, f.manager, f.api)).rejects.toThrow('malformed');
});
