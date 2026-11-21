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
function sign(value: Record<string, unknown>): AwsCePlan {
  const { planId: _id, planSha256: _sha, ...draft } = value;
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planSha256, planId: `aws-ce-${planSha256.slice(0, 24)}` } as unknown as AwsCePlan;
}
async function fixture(physical: string | null, withToken = false) {
  const initial = foundationPlan();
  const base = sign({
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
  const cloud = sign({ ...base, intent: { ...base.intent, operation: 'teardown' } });
  const binding = siteBindings(base)[0].binding;
  const root = await mkdtemp(join(tmpdir(), 'native-reservation-'));
  roots.push(root);
  const store = await CeDeploymentStore.open(root, binding.owner);
  const inventory: {
    status: string;
    owner: typeof binding.owner;
    sites: Array<{ siteName: string; siteUid: string | null; physicalSiteUid?: string | null }>;
    resources: Array<{ kind: string; name: string; uid: string; namespace: string; node: string; siteName: string }>;
    sources: string[];
    startedAt: string;
    observedAt: string;
    stale?: boolean;
  } = {
    status: 'observed',
    owner: binding.owner,
    siteContractFingerprint: 'site-contract',
    ingressContractFingerprint: 'ingress-contract',
    sites: [{ siteName: 'site', siteUid: 'logical-uid', physicalSiteUid: physical }],
    resources: withToken
      ? [
          {
            kind: 'tokens',
            name: 'owned-token',
            uid: 'token-uid',
            namespace: 'system',
            node: binding.nodes[0],
            siteName: 'site',
          },
        ]
      : [],
    sources: ['qualified-current-inventory'],
    startedAt: new Date().toISOString(),
    observedAt: new Date().toISOString(),
  };
  const mutations: string[] = [];
  let cloudReads = 0;
  let tokenLoss = false;
  let siteLoss = false;
  const runtime = {
    engine: 'native',
    contract: { fingerprint: 'site-contract' },
    teardownInventory: async () => ({ status: 'unknown' }),
    preRegistrationInventory: async () => ({
      ...structuredClone(inventory),
      observedAt: inventory.stale ? new Date(0).toISOString() : new Date().toISOString(),
    }),
    drainPlatform: async () => {
      throw Error('Reservation must verify empty platform rather than drain a registered site');
    },
    deleteBootstrapTokenExact: async (_binding: unknown, _node: string, _name: string, expectedUid: string) => {
      expect(expectedUid).toBe('token-uid');
      mutations.push('token');
      inventory.resources = [];
      if (tokenLoss) {
        tokenLoss = false;
        throw Error('lost token response');
      }
    },
    deleteSiteExact: async () => {
      if (inventory.sites[0].siteUid !== null) mutations.push('site');
      inventory.sites[0].siteUid = null;
      inventory.sites[0].physicalSiteUid = null;
      if (siteLoss) {
        siteLoss = false;
        throw Error('lost site response');
      }
    },
  } as unknown as CeRuntime;
  const contract = { fingerprint: 'ingress-contract' } as VerifiedIngressContract;
  const retireCloud = async (reference: { cloudPlanId: string; cloudPlanSha256: string }) => {
    cloudReads++;
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
    mutations,
    retireCloud,
    cloudReads: () => cloudReads,
    loseToken: () => {
      tokenLoss = true;
    },
    loseSite: () => {
      siteLoss = true;
    },
  };
}
for (const [physical, token] of [
  [null, false],
  ['physical-uid', false],
  [null, true],
] as const)
  test(`native reservation prepares and retires physical=${physical}, token=${token}`, async () => {
    const f = await fixture(physical, token);
    const plan = await prepareAwsNativeTeardown(f.base, f.cloud, f.runtime, f.contract, f.store);
    expect(plan.kind).toBe('aws-ce-native-reservation-teardown');
    expect(plan.retirement[0].physicalSiteUid).toBe(physical);
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
    expect(receipt.credentialStaging).toBe('bootstrap-credentials-retired');
    expect(f.mutations).toEqual(token ? ['token', 'site'] : ['site']);
    await runAwsNativeTeardown(f.base, f.cloud, plan, plan.planSha256, f.runtime, f.contract, f.store, f.retireCloud);
    expect(f.mutations).toEqual(token ? ['token', 'site'] : ['site']);
    expect(f.cloudReads()).toBeGreaterThanOrEqual(4);
  });
for (const failure of [
  'unknown',
  'missing-logical',
  'missing-physical-state',
  'foreign-owner',
  'stale',
  'routing',
  'duplicate-token',
  'foreign-token',
  'wrong-engine',
  'cloud-actions',
] as const)
  test(`reservation preparation rejects ${failure}`, async () => {
    const f = await fixture(null, true);
    if (failure === 'unknown') f.inventory.status = 'unknown';
    if (failure === 'missing-logical') f.inventory.sites[0].siteUid = null;
    if (failure === 'missing-physical-state') delete f.inventory.sites[0].physicalSiteUid;
    if (failure === 'foreign-owner') f.inventory.owner = { ...f.inventory.owner, account: 'foreign' };
    if (failure === 'stale') f.inventory.stale = true;
    if (failure === 'routing') f.inventory.resources[0].kind = 'bgps';
    if (failure === 'duplicate-token') f.inventory.resources.push(f.inventory.resources[0]);
    if (failure === 'foreign-token') f.inventory.resources[0].node = 'foreign';
    const base =
      failure === 'wrong-engine'
        ? sign({ ...f.base, engine: 'terraform', intent: { ...f.base.intent, engine: 'terraform' } })
        : f.base;
    const cloud =
      failure === 'cloud-actions'
        ? sign({
            ...f.cloud,
            actions: [
              {
                id: 'delete',
                kind: 'resource-delete',
                phase: 'teardown',
                mutates: true,
                destructive: true,
                resourceId: 'i-12345678',
              },
            ],
          })
        : f.cloud;
    await expect(prepareAwsNativeTeardown(base, cloud, f.runtime, f.contract, f.store)).rejects.toThrow();
    expect(f.mutations).toEqual([]);
  });
for (const failure of [
  'changed-logical',
  'new-physical',
  'new-token',
  'unavailable',
  'stale',
  'cloud-pending',
  'bad-authorization',
] as const)
  test(`reservation apply rejects ${failure} before vendor mutation`, async () => {
    const f = await fixture(null);
    const plan = await prepareAwsNativeTeardown(f.base, f.cloud, f.runtime, f.contract, f.store);
    if (failure === 'changed-logical') f.inventory.sites[0].siteUid = 'foreign';
    if (failure === 'new-physical') f.inventory.sites[0].physicalSiteUid = 'new-physical';
    if (failure === 'new-token')
      f.inventory.resources = [
        {
          kind: 'tokens',
          name: 'new-token',
          uid: 'new-token-uid',
          namespace: 'system',
          node: f.binding.nodes[0],
          siteName: 'site',
        },
      ];
    if (failure === 'unavailable') f.inventory.status = 'unknown';
    if (failure === 'stale') f.inventory.stale = true;
    const cloud =
      failure === 'cloud-pending'
        ? async () => {
            throw Error('owner cloud absence pending');
          }
        : f.retireCloud;
    await expect(
      runAwsNativeTeardown(
        f.base,
        f.cloud,
        plan,
        failure === 'bad-authorization' ? '0'.repeat(64) : plan.planSha256,
        f.runtime,
        f.contract,
        f.store,
        cloud,
      ),
    ).rejects.toThrow();
    expect(f.mutations).toEqual([]);
  });
for (const loss of ['token', 'site'] as const)
  test(`native reservation resumes after lost ${loss} response without duplicate mutation`, async () => {
    const f = await fixture(null, true);
    const plan = await prepareAwsNativeTeardown(f.base, f.cloud, f.runtime, f.contract, f.store);
    if (loss === 'token') f.loseToken();
    else f.loseSite();
    await expect(
      runAwsNativeTeardown(f.base, f.cloud, plan, plan.planSha256, f.runtime, f.contract, f.store, f.retireCloud),
    ).rejects.toThrow(`lost ${loss} response`);
    const resumed = await prepareAwsNativeTeardown(f.base, f.cloud, f.runtime, f.contract, f.store);
    expect(resumed.planSha256).toBe(plan.planSha256);
    await runAwsNativeTeardown(
      f.base,
      f.cloud,
      resumed,
      plan.planSha256,
      f.runtime,
      f.contract,
      f.store,
      f.retireCloud,
    );
    expect(f.mutations).toEqual(['token', 'site']);
  });
