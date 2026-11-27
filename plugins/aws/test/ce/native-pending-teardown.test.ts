import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import { canonicalSha256 } from '../../src/ce/canonical';
import { projectAwsNativeInitialCreation } from '../../src/ce/native-creation-projection';
import { prepareAwsNativeTeardown, runAwsNativeTeardown } from '../../src/ce/native-teardown';
import { compileAwsCePlan } from '../../src/ce/planner';
import { siteBindings } from '../../src/ce/topology';
import type {
  AwsCeCheckpoint,
  AwsCeF5Capabilities,
  AwsCeIntent,
  AwsCeObservation,
  AwsCePlan,
} from '../../src/ce/types';
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
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function pendingFixture() {
  const { plan: base, checkpoint } = fixture();
  const creation = projectAwsNativeInitialCreation(base, [checkpoint]);
  const { planId: _id, planSha256: _sha, ...draft } = base;
  const c = {
    ...draft,
    intent: { ...base.intent, operation: 'teardown' as const },
    actions: [
      {
        id: 'delete-instance',
        phase: 'teardown' as const,
        kind: 'resource-delete' as const,
        command: 'aws' as const,
        args: ['ec2', 'terminate-instances', '--instance-ids', creation.instanceId],
        resourceId: creation.instanceId,
        description: 'retire original node',
        mutates: true,
        destructive: true,
      },
    ],
    ownershipInventory: [{ resourceId: creation.instanceId, owned: true, action: 'delete' as const }],
  };
  const hash = canonicalSha256(c);
  const cloud = { ...c, planSha256: hash, planId: `aws-ce-${hash.slice(0, 24)}` } as AwsCePlan;
  const binding = siteBindings(base)[0].binding;
  const root = await mkdtemp(join(tmpdir(), 'native-pending-'));
  roots.push(root);
  const store = await CeDeploymentStore.open(root, binding.owner);
  const logical = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    physical = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    uid = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const registration = {
    siteName: binding.siteName,
    node: creation.node,
    name: `r-${uid}`,
    uid,
    instanceId: creation.instanceId,
    passportSha256: 'a'.repeat(64),
  };
  const state = {
    logical: true,
    physical: true,
    token: true,
    registration: true,
    cloud: true,
    fail: '',
    lost: false,
    hideRegistration: false,
    events: [] as string[],
  };
  const runtime = {
    engine: 'native',
    contract: { fingerprint: 'site' },
    teardownInventory: async () => ({ status: 'unknown' }),
    preRegistrationInventory: async (
      ...[_b, _ns, _c, _sig, instances]: Parameters<CeRuntime['preRegistrationInventory']>
    ) => {
      if (!instances) return { status: 'unknown', reason: 'initial-registration-cloud-binding-required' };
      if (state.fail === 'unknown' || state.fail === 'advanced') return { status: 'unknown', reason: 'post-admission' };
      return {
        status: 'observed',
        owner: state.fail === 'owner' ? { ...binding.owner, account: 'example-foreign-account' } : binding.owner,
        siteContractFingerprint: 'site',
        ingressContractFingerprint: 'ingress',
        startedAt: state.fail === 'stale' ? new Date(0).toISOString() : new Date().toISOString(),
        observedAt: new Date().toISOString(),
        sources: ['complete-authoritative-reads'],
        sites: [
          {
            siteName: binding.siteName,
            siteUid: state.logical ? (state.fail === 'uid' ? 'changed' : logical) : null,
            physicalSiteUid: state.physical ? physical : null,
          },
        ],
        resources: state.token
          ? [
              {
                kind: 'tokens',
                name: 'ce-demo-1-000000000001',
                namespace: 'system',
                uid: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
                node: creation.node,
                siteName: binding.siteName,
              },
            ]
          : [],
        registrations:
          state.registration && !state.hideRegistration
            ? [state.fail === 'registration' ? { ...registration, instanceId: 'i-87654321' } : registration]
            : [],
      };
    },
    deleteBootstrapTokenExact: async () => {
      state.token = false;
      state.events.push('token');
    },
    deleteInitialRegistration: async (
      ...[_b, _r, record, _signal, expectedUid]: Parameters<CeRuntime['deleteInitialRegistration']>
    ) => {
      if (!state.registration) return { status: 'absent' };
      if (state.hideRegistration) throw Error('Exact registration object remains despite empty list');
      expect(state.cloud).toBe(false);
      expect(state.logical).toBe(true);
      expect(expectedUid).toBe(logical);
      await record({ action: 'delete-initial-registration', state: 'requested' });
      state.registration = false;
      state.events.push('registration');
      if (state.lost) {
        state.lost = false;
        throw Error('lost registration response');
      }
      return { status: 'absent' };
    },
    deleteSiteExact: async () => {
      expect(state.registration).toBe(false);
      if (state.logical) {
        state.logical = false;
        state.physical = false;
        state.events.push('site');
      }
    },
  } as unknown as CeRuntime;
  const contract = { fingerprint: 'ingress' } as VerifiedIngressContract;
  const retireCloud = async (ref: { cloudPlanId: string; cloudPlanSha256: string }) => {
    if (state.cloud) {
      state.cloud = false;
      state.events.push('cloud');
    }
    return {
      status: 'native-cloud-retired' as const,
      cloudPlanId: ref.cloudPlanId,
      cloudPlanSha256: ref.cloudPlanSha256,
      absence: 'absent' as const,
    };
  };
  const readCreation = async () => creation;
  const prepare = async () => {
    const pending = await prepareAwsNativeTeardown(base, cloud, runtime, contract, store, undefined, readCreation);
    if (pending.kind !== 'aws-ce-native-pending-teardown') throw Error('Expected the distinct pending contract');
    return pending;
  };
  return { base, cloud, runtime, contract, store, state, prepare, creation, retireCloud };
}
test('public native preparation selects distinct pending retirement from original creation proof', async () => {
  const f = await pendingFixture();
  const p = await f.prepare();
  expect(p.kind).toBe('aws-ce-native-pending-teardown');
  expect(p.creation.instanceId).toBe(f.creation.instanceId);
  expect(p.registrations).toHaveLength(1);
  expect(p.drain.sites).toHaveLength(0);
});
test('native pending cleanup orders node retirement before exact registration and logical deletion', async () => {
  const f = await pendingFixture();
  const p = await f.prepare();
  const r = await runAwsNativeTeardown(f.base, f.cloud, p, p.planSha256, f.runtime, f.contract, f.store, f.retireCloud);
  expect(r.status).toBe('ce-retired-supporting-infrastructure-unverified');
  expect(f.state.events).toEqual(['token', 'cloud', 'registration', 'site']);
  await runAwsNativeTeardown(f.base, f.cloud, p, p.planSha256, f.runtime, f.contract, f.store, f.retireCloud);
  expect(f.state.events).toEqual(['token', 'cloud', 'registration', 'site']);
});
test('lost exact registration response resumes without reissuing the deletion', async () => {
  const f = await pendingFixture();
  const p = await f.prepare();
  f.state.lost = true;
  await expect(
    runAwsNativeTeardown(f.base, f.cloud, p, p.planSha256, f.runtime, f.contract, f.store, f.retireCloud),
  ).rejects.toThrow('lost registration response');
  const again = await f.prepare();
  expect(again.planSha256).toBe(p.planSha256);
  await runAwsNativeTeardown(f.base, f.cloud, again, p.planSha256, f.runtime, f.contract, f.store, f.retireCloud);
  expect(f.state.events.filter((x) => x === 'registration')).toHaveLength(1);
});
for (const fault of ['unknown', 'advanced', 'owner', 'stale', 'uid', 'registration'])
  test(`native pending ${fault} blocks mutation`, async () => {
    const f = await pendingFixture();
    const p = await f.prepare();
    f.state.fail = fault;
    await expect(
      runAwsNativeTeardown(f.base, f.cloud, p, p.planSha256, f.runtime, f.contract, f.store, f.retireCloud),
    ).rejects.toThrow();
    expect(f.state.events).toEqual([]);
  });

test('an empty registration list cannot authorize logical deletion without exact object absence', async () => {
  const f = await pendingFixture();
  const p = await f.prepare();
  f.state.hideRegistration = true;
  await expect(
    runAwsNativeTeardown(f.base, f.cloud, p, p.planSha256, f.runtime, f.contract, f.store, f.retireCloud),
  ).rejects.toThrow('Exact registration object remains');
  expect(f.state.logical).toBe(true);
  expect(f.state.events).toEqual(['token', 'cloud']);
});
