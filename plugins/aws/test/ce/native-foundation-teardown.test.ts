import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import { canonicalSha256 } from '../../src/ce/canonical';
import { prepareAwsNativeTeardown, runAwsNativeTeardown } from '../../src/ce/native-teardown';
import { siteBindings } from '../../src/ce/topology';
import type { AwsCePlan } from '../../src/ce/types';
import { foundationPlan } from './terraform-fixtures';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const signed = (value: Record<string, unknown>): AwsCePlan => {
  const { planId: _id, planSha256: _sha, ...draft } = value;
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planSha256, planId: `aws-ce-${planSha256.slice(0, 24)}` } as unknown as AwsCePlan;
};
async function fixture(withCloud: boolean) {
  const initial = foundationPlan();
  const base = signed({
    ...initial,
    engine: 'native',
    intent: {
      ...initial.intent,
      engine: 'native',
      siteName: 'site',
      topology: { nodeCount: 1, sites: [{ name: 'site', nodeIndexes: [1] }] },
    },
    deploymentName: initial.intent.deploymentName,
    accountId: initial.intent.accountId,
    region: initial.intent.region,
    routing: { profile: 'direct-eni' },
    actions: [],
    rollback: { resources: [] },
    ownershipInventory: [],
  });
  const cloud = signed({
    ...base,
    intent: { ...base.intent, operation: 'teardown' },
    actions: withCloud
      ? [
          {
            id: 'delete-vpc',
            phase: 'teardown',
            kind: 'resource-delete',
            description: 'retire exact VPC',
            command: 'aws',
            args: ['ec2', 'delete-vpc', '--vpc-id', 'vpc-12345678'],
            resourceId: 'vpc-12345678',
            mutates: true,
            destructive: true,
          },
        ]
      : [],
    ownershipInventory: withCloud ? [{ resourceId: 'vpc-12345678', owned: true, action: 'delete' }] : [],
  });
  const binding = siteBindings(base)[0].binding;
  const root = await mkdtemp(join(tmpdir(), 'native-foundation-'));
  roots.push(root);
  const store = await CeDeploymentStore.open(root, binding.owner);
  const inventory: {
    status: string;
    owner: typeof binding.owner;
    sites: Array<{ siteName: string; siteUid: string | null; physicalSiteUid: string | null }>;
    resources: Array<Record<string, unknown>>;
    startedAt: string;
    observedAt: string;
    sources: string[];
    siteContractFingerprint: string;
    ingressContractFingerprint: string;
    stale?: boolean;
  } = {
    status: 'observed',
    owner: binding.owner,
    sites: [{ siteName: 'site', siteUid: null, physicalSiteUid: null }],
    resources: [],
    startedAt: new Date().toISOString(),
    observedAt: new Date().toISOString(),
    sources: ['verified-complete-api-reads'],
    siteContractFingerprint: 'site-contract',
    ingressContractFingerprint: 'ingress-contract',
  };
  let reads = 0,
    deletes = 0,
    present = withCloud,
    loseResponse = false,
    publishAfterCloud = false;
  const runtime = {
    engine: 'native',
    contract: { fingerprint: 'site-contract' },
    teardownInventory: async () => ({ status: 'unknown' }),
    preRegistrationInventory: async () => {
      reads++;
      return {
        ...structuredClone(inventory),
        startedAt: inventory.stale ? new Date(0).toISOString() : new Date().toISOString(),
        observedAt: new Date().toISOString(),
      };
    },
    drainPlatform: async () => {
      throw Error('Foundation must prove empty platform rather than mutate it');
    },
    deleteBootstrapTokenExact: async () => {
      throw Error('No token identity may be invented');
    },
    deleteSiteExact: async () => {
      throw Error('No site identity may be invented');
    },
  } as unknown as CeRuntime;
  const contract = { fingerprint: 'ingress-contract' } as VerifiedIngressContract;
  const retireCloud = async (reference: { cloudPlanId: string; cloudPlanSha256: string }) => {
    if (present) {
      present = false;
      deletes++;
      if (loseResponse) {
        loseResponse = false;
        throw Error('lost cloud response');
      }
    }
    if (publishAfterCloud) inventory.sites[0].siteUid = 'late-site';
    return {
      status: 'native-cloud-retired' as const,
      cloudPlanId: reference.cloudPlanId,
      cloudPlanSha256: reference.cloudPlanSha256,
      absence: 'absent' as const,
    };
  };
  return {
    base,
    cloud,
    binding,
    store,
    inventory,
    runtime,
    contract,
    retireCloud,
    reads: () => reads,
    deletes: () => deletes,
    lose: () => {
      loseResponse = true;
    },
    publish: () => {
      publishAfterCloud = true;
    },
  };
}
for (const withCloud of [false, true])
  test(`pre-logical native foundation retires exact cloud=${withCloud} without invented identities`, async () => {
    const f = await fixture(withCloud);
    const plan = await prepareAwsNativeTeardown(f.base, f.cloud, f.runtime, f.contract, f.store);
    expect(plan.kind).toBe('aws-ce-native-foundation-teardown');
    expect(plan.retirement).toHaveLength(0);
    expect(plan.drain.sites).toHaveLength(0);
    const receipt = await runAwsNativeTeardown(
      f.base,
      f.cloud,
      plan,
      plan.planSha256,
      f.runtime,
      f.contract,
      f.store,
      f.retireCloud,
    );
    expect(receipt.status).toBe('ce-retired-supporting-infrastructure-unverified');
    expect(receipt.cloudInventory).toBe('absent');
    expect(receipt.credentialStaging).toBe('bootstrap-credentials-retired');
    await runAwsNativeTeardown(f.base, f.cloud, plan, plan.planSha256, f.runtime, f.contract, f.store, f.retireCloud);
    expect(f.deletes()).toBe(withCloud ? 1 : 0);
    expect(f.reads()).toBeGreaterThanOrEqual(6);
  });
test('pre-logical native foundation resumes the original exact plan after ambiguous cloud retirement', async () => {
  const f = await fixture(true);
  const plan = await prepareAwsNativeTeardown(f.base, f.cloud, f.runtime, f.contract, f.store);
  f.lose();
  await expect(
    runAwsNativeTeardown(f.base, f.cloud, plan, plan.planSha256, f.runtime, f.contract, f.store, f.retireCloud),
  ).rejects.toThrow('lost cloud response');
  const resumed = await prepareAwsNativeTeardown(f.base, f.cloud, f.runtime, f.contract, f.store);
  expect(resumed.planSha256).toBe(plan.planSha256);
  await runAwsNativeTeardown(f.base, f.cloud, resumed, plan.planSha256, f.runtime, f.contract, f.store, f.retireCloud);
  expect(f.deletes()).toBe(1);
});
for (const failure of [
  'unknown',
  'logical',
  'physical',
  'tokens',
  'foreign-owner',
  'stale',
  'contract',
  'cloud-target',
  'wrong-engine',
] as const)
  test(`pre-logical preparation rejects ${failure}`, async () => {
    const f = await fixture(true);
    if (failure === 'unknown') f.inventory.status = 'unknown';
    if (failure === 'logical') f.inventory.sites[0].siteUid = 'present';
    if (failure === 'physical') f.inventory.sites[0].physicalSiteUid = 'present';
    if (failure === 'tokens')
      f.inventory.resources = [
        {
          kind: 'tokens',
          name: 'unexpected',
          uid: 'token-uid',
          node: f.binding.nodes[0],
          siteName: 'site',
          namespace: 'system',
        },
      ];
    if (failure === 'foreign-owner') f.inventory.owner = { ...f.inventory.owner, account: 'foreign' };
    if (failure === 'stale') f.inventory.stale = true;
    if (failure === 'contract') f.inventory.ingressContractFingerprint = 'foreign';
    const cloud =
      failure === 'cloud-target'
        ? signed({ ...f.cloud, ownershipInventory: [{ resourceId: 'vpc-ffffffff', owned: true, action: 'delete' }] })
        : f.cloud;
    const base =
      failure === 'wrong-engine'
        ? signed({ ...f.base, engine: 'terraform', intent: { ...f.base.intent, engine: 'terraform' } })
        : f.base;
    await expect(prepareAwsNativeTeardown(base, cloud, f.runtime, f.contract, f.store)).rejects.toThrow();
    expect(f.deletes()).toBe(0);
  });
for (const failure of ['publication', 'stale', 'unknown', 'authorization'] as const)
  test(`pre-logical apply rejects ${failure} before cloud mutation`, async () => {
    const f = await fixture(true);
    const plan = await prepareAwsNativeTeardown(f.base, f.cloud, f.runtime, f.contract, f.store);
    if (failure === 'publication') f.inventory.sites[0].siteUid = 'new';
    if (failure === 'stale') f.inventory.stale = true;
    if (failure === 'unknown') f.inventory.status = 'unknown';
    await expect(
      runAwsNativeTeardown(
        f.base,
        f.cloud,
        plan,
        failure === 'authorization' ? '0'.repeat(64) : plan.planSha256,
        f.runtime,
        f.contract,
        f.store,
        f.retireCloud,
      ),
    ).rejects.toThrow();
    expect(f.deletes()).toBe(0);
  });
test('post-cloud publication remains failed and leaves credential retirement unqualified', async () => {
  const f = await fixture(true);
  const plan = await prepareAwsNativeTeardown(f.base, f.cloud, f.runtime, f.contract, f.store);
  f.publish();
  await expect(
    runAwsNativeTeardown(f.base, f.cloud, plan, plan.planSha256, f.runtime, f.contract, f.store, f.retireCloud),
  ).rejects.toThrow();
  await expect(f.store.read('aws-native-bootstrap-retirement.json')).rejects.toThrow();
  expect(f.deletes()).toBe(1);
});
