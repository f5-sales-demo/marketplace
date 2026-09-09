import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { canonicalSha256 } from '../../src/ce/canonical';
import { compileAwsNativeTeardown, coordinateAwsNativeTeardown } from '../../src/ce/native-teardown';
import { siteBindings } from '../../src/ce/topology';
import type { AwsCePlan } from '../../src/ce/types';
import { foundationPlan } from './terraform-fixtures';

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true });
});

function signed(draft: Omit<AwsCePlan, 'planId' | 'planSha256'>): AwsCePlan {
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planSha256, planId: `aws-ce-${planSha256.slice(0, 24)}` };
}

function fixture() {
  const { planId: _id, planSha256: _sha, ...source } = foundationPlan();
  const actions = [1, 2, 3].flatMap((node) =>
    [0, 1].map((role) => ({
      id: `peer-${node}-${role}`,
      phase: 'routing' as const,
      kind: 'tgw-connect-peer-create' as const,
      description: 'peer',
      node,
      mutates: true,
      destructive: false,
    })),
  );
  const base = signed({
    ...source,
    engine: 'native',
    intent: { ...source.intent, engine: 'native' },
    deploymentName: source.intent.deploymentName,
    accountId: source.intent.accountId,
    region: source.intent.region,
    topology: { nodeCount: 3, availabilityZones: ['us-east-1a', 'us-east-1b', 'us-east-1c'] },
    routing: { ...source.intent.routing, profile: 'tgw-connect' },
    actions,
    rollback: { resources: [] },
    ownershipInventory: [],
  } as Omit<AwsCePlan, 'planId' | 'planSha256'>);
  const { planId: _baseId, planSha256: _baseSha, ...baseDraft } = base;
  const cloud = signed({
    ...baseDraft,
    intent: { ...base.intent, operation: 'teardown' },
    actions: [
      {
        id: 'delete-instance',
        phase: 'teardown',
        kind: 'resource-delete',
        description: 'delete',
        command: 'aws',
        args: ['ec2', 'terminate-instances', '--instance-ids', 'i-12345678'],
        resourceId: 'i-12345678',
        mutates: true,
        destructive: true,
      },
    ],
    ownershipInventory: [{ resourceId: 'i-12345678', owned: true, action: 'delete' }],
  } as Omit<AwsCePlan, 'planId' | 'planSha256'>);
  const selected = siteBindings(base);
  const owner = selected[0].binding.owner;
  const drain = {
    schemaVersion: 1 as const,
    owner,
    sourcePlanSha256: base.planSha256,
    siteContractFingerprint: 'site-contract',
    ingressContractFingerprint: 'ingress-contract',
    listeners: [],
    origins: [],
    sites: selected.map(({ site, binding }) => ({
      binding,
      siteUid: `uid-${site.name}`,
      routing: [
        { kind: 'bgp' as const, name: `${site.name}-tgw-bgp`, uid: `bgp-${site.name}` },
        ...actions
          .filter((action) => site.nodeIndexes.includes(action.node))
          .map((action) => ({
            kind: 'external_connector' as const,
            name: `ce-gre-${actions.indexOf(action) + 1}`,
            uid: `gre-${actions.indexOf(action) + 1}`,
          })),
      ],
    })),
  };
  const retirement = selected.map(({ binding }) => ({
    siteName: binding.siteName,
    siteUid: `uid-${binding.siteName}`,
    physicalSiteUid: `physical-${binding.siteName}`,
    tokens: binding.nodes.map((node) => ({ node, name: `${node}-token` })),
  }));
  return { base, cloud, drain, retirement };
}

test('binds native platform retirement to an exact fresh cloud teardown plan', () => {
  const f = fixture();
  const plan = compileAwsNativeTeardown(f.base, f.cloud, f.drain, f.retirement);
  expect(plan.cloudPlanId).toBe(f.cloud.planId);
  expect(plan.retirement).toHaveLength(3);
  expect(plan.drain.sites.flatMap((site) => site.routing)).toHaveLength(9);
  expect(() =>
    compileAwsNativeTeardown(f.base, { ...f.cloud, planSha256: '0'.repeat(64) }, f.drain, f.retirement),
  ).toThrow('integrity');
  expect(() =>
    compileAwsNativeTeardown(
      f.base,
      f.cloud,
      { ...f.drain, owner: { ...f.drain.owner, region: 'eu-west-2' } },
      f.retirement,
    ),
  ).toThrow('differs');
  const missing = structuredClone(f.drain);
  missing.sites[0].routing.pop();
  expect(() => compileAwsNativeTeardown(f.base, f.cloud, missing, f.retirement)).toThrow('routing inventory');
});

test('resumes native cloud and platform retirement without duplicate mutations', async () => {
  const f = fixture();
  const plan = compileAwsNativeTeardown(f.base, f.cloud, f.drain, f.retirement);
  const root = await mkdtemp(join(tmpdir(), 'aws-native-teardown-'));
  directories.push(root);
  const storage = await CeDeploymentStore.open(root, f.drain.owner);
  const present = new Set([
    'drain',
    'cloud',
    ...f.retirement.flatMap((site) => [...site.tokens.map((token) => `token:${token.name}`), `site:${site.siteName}`]),
  ]);
  const mutations: string[] = [];
  let loseCloudResponse = true;
  const remove = (key: string) => {
    if (present.delete(key)) mutations.push(key);
  };
  const driver = {
    engine: 'native' as const,
    siteContractFingerprint: 'site-contract',
    ingressContractFingerprint: 'ingress-contract',
    drain: async () => {
      remove('drain');
      return { status: 'platform-drained' as const };
    },
    retireCloud: async () => {
      remove('cloud');
      if (loseCloudResponse) {
        loseCloudResponse = false;
        throw new Error('lost response');
      }
      return {
        status: 'native-cloud-retired' as const,
        cloudPlanId: plan.cloudPlanId,
        cloudPlanSha256: plan.cloudPlanSha256,
        absence: 'absent' as const,
      };
    },
    observeSite: async (site: (typeof f.retirement)[number]) => ({
      status: present.has(`site:${site.siteName}`) ? ('pending' as const) : ('deleted' as const),
    }),
    revokeToken: async (
      _site: (typeof f.retirement)[number],
      token: (typeof f.retirement)[number]['tokens'][number],
    ) => {
      remove(`token:${token.name}`);
    },
    deleteSite: async (site: (typeof f.retirement)[number]) => {
      remove(`site:${site.siteName}`);
    },
  };
  await expect(coordinateAwsNativeTeardown(f.base, f.cloud, plan, plan.planSha256, storage, driver)).rejects.toThrow(
    'lost response',
  );
  const receipt = await coordinateAwsNativeTeardown(f.base, f.cloud, plan, plan.planSha256, storage, driver);
  expect(receipt.status).toBe('ce-retired-supporting-infrastructure-unverified');
  expect(receipt.cloudInventory).toBe('absent');
  await coordinateAwsNativeTeardown(f.base, f.cloud, plan, plan.planSha256, storage, driver);
  expect(mutations).toEqual([
    'drain',
    'cloud',
    'token:ce-1-token',
    'site:site-1',
    'token:ce-2-token',
    'site:site-2',
    'token:ce-3-token',
    'site:site-3',
  ]);
});
