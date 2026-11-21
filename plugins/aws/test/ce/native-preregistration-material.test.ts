import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import { canonicalSha256 } from '../../src/ce/canonical';
import { collectAwsTeardownMaterial } from '../../src/ce/terraform-teardown-plan';
import { siteBindings } from '../../src/ce/topology';
import type { AwsCePlan } from '../../src/ce/types';
import { foundationPlan } from './terraform-fixtures';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function setup() {
  const initial = foundationPlan();
  const { planId: _id, planSha256: _sha, ...draft } = initial;
  const raw = {
    ...draft,
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
  };
  const hash = canonicalSha256(raw);
  const base = { ...raw, planSha256: hash, planId: `aws-ce-${hash.slice(0, 24)}` } as unknown as AwsCePlan;
  const binding = siteBindings(base)[0].binding;
  const root = await mkdtemp(join(tmpdir(), 'native-prereg-material-'));
  roots.push(root);
  const store = await CeDeploymentStore.open(root, binding.owner);
  const pre = {
    status: 'observed',
    owner: binding.owner,
    siteContractFingerprint: 'site-contract',
    ingressContractFingerprint: 'ingress-contract',
    sites: [{ siteName: binding.siteName, siteUid: 'logical-uid', physicalSiteUid: 'physical-uid' }],
    resources: [
      {
        kind: 'tokens',
        name: 'owned-token',
        uid: 'token-uid',
        namespace: 'system',
        node: binding.nodes[0],
        siteName: binding.siteName,
      },
    ],
    observedAt: new Date().toISOString(),
  };
  let preregCalls = 0;
  const runtime = {
    engine: 'native',
    contract: { fingerprint: 'site-contract' },
    teardownInventory: async () => ({ status: 'unknown' }),
    preRegistrationInventory: async () => {
      preregCalls++;
      return { ...pre, observedAt: new Date().toISOString() };
    },
    ingress: () => ({}),
    originTeardown: () => ({}),
  } as unknown as CeRuntime;
  return {
    base,
    binding,
    store,
    pre,
    runtime,
    calls: () => preregCalls,
    contract: { fingerprint: 'ingress-contract' } as VerifiedIngressContract,
  };
}
test('native material uses independently typed pre-registration inventory without registered nodes', async () => {
  const f = await setup();
  const material = await collectAwsTeardownMaterial(f.base, f.runtime, f.contract, f.store);
  expect(material.retirement[0]).toMatchObject({
    siteName: 'site',
    siteUid: 'logical-uid',
    physicalSiteUid: 'physical-uid',
    tokens: [{ node: 'ce-1', name: 'owned-token' }],
  });
  expect(f.calls()).toBe(2);
});
for (const failure of ['unknown', 'missing-logical', 'missing-physical', 'foreign-owner', 'routing-present'] as const)
  test(`native pre-registration material rejects ${failure}`, async () => {
    const f = await setup();
    if (failure === 'unknown') f.pre.status = 'unknown';
    if (failure === 'missing-logical') f.pre.sites[0].siteUid = '';
    if (failure === 'missing-physical') f.pre.sites[0].physicalSiteUid = '';
    if (failure === 'foreign-owner') f.pre.owner = { ...f.pre.owner, account: 'foreign' };
    if (failure === 'routing-present') f.pre.resources[0].kind = 'bgps';
    await expect(collectAwsTeardownMaterial(f.base, f.runtime, f.contract, f.store)).rejects.toThrow();
  });
