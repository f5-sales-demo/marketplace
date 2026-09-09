import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import { canonicalSha256 } from '../../src/ce/canonical';
import { collectAwsTeardownMaterial, prepareAwsTerraformTeardown } from '../../src/ce/terraform-teardown-plan';
import { siteBindings } from '../../src/ce/topology';
import { foundationPlan } from './terraform-fixtures';

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true });
});
async function fixture(mode = 'valid', engine: 'native' | 'terraform' = 'terraform') {
  const { planId: _id, planSha256: _sha, ...initial } = foundationPlan();
  const draft = {
    ...initial,
    engine,
    intent: { ...initial.intent, engine },
    deploymentName: 'ce',
    accountId: '123456789012',
    region: 'us-east-1',
    routing: { profile: 'tgw-connect' as const },
    actions: [1, 2, 3].flatMap((node) =>
      [0, 1].map((index) => ({
        id: `peer-${node}-${index}`,
        phase: 'routing' as const,
        kind: 'tgw-connect-peer-create' as const,
        description: 'peer',
        node,
        mutates: true,
        destructive: false,
      })),
    ),
  };
  const sha = canonicalSha256(draft),
    base = { ...draft, planId: `aws-ce-${sha.slice(0, 24)}`, planSha256: sha },
    selected = siteBindings(base),
    owner = selected[0].binding.owner;
  const root = await mkdtemp(join(tmpdir(), 'ce-teardown-plan-'));
  dirs.push(root);
  const storage = await CeDeploymentStore.open(root, owner);
  const listenerId = 'a'.repeat(24);
  await storage.write(`ingress-plan-${listenerId}.json`, {
    request: { metadata: { namespace: 'default' } },
    material: { intent: { originPool: { namespace: 'default' } } },
  });
  for (const [index, { binding }] of selected.entries()) {
    const tokenName = `ce-${index + 1}-${sha.slice(0, 12)}`;
    await storage.write(`${tokenName}.json`, {
      tokenName,
      siteName: binding.siteName,
      node: mode === 'foreign-token' ? 'foreign-node' : binding.nodes[0],
      jwt: 'never-export-bootstrap',
    });
  }
  const routes = selected.flatMap(({ binding }, index) => [
    {
      kind: 'bgps',
      name: `${binding.siteName}-tgw-bgp`,
      namespace: 'system',
      uid: `bgp-${index}`,
      siteName: binding.siteName,
      siteUid: `site-${index}`,
    },
    {
      kind: 'bgp_routing_policys',
      name: `${binding.siteName}-tgw-export-policy`,
      namespace: 'system',
      uid: `policy-${index}`,
      siteName: binding.siteName,
      siteUid: `site-${index}`,
    },
    ...[1, 2].map((n) => ({
      kind: 'external_connectors',
      name: `ce-gre-${index * 2 + n}`,
      namespace: 'system',
      uid: `gre-${index * 2 + n}`,
      siteName: binding.siteName,
      siteUid: `site-${index}`,
    })),
  ]);
  if (engine === 'terraform')
    await storage.write('terraform-routing-checkpoint.json', {
      schemaVersion: 2,
      engine,
      planId: base.planId,
      planSha256: sha,
      resolvedValues: Object.fromEntries(
        routes.map((row) => [`__XC_ROUTING_${row.name}__`, mode === 'wrong-routing' ? 'foreign' : row.uid]),
      ),
    });
  else
    await storage.write('native-routing-checkpoint.json', {
      schemaVersion: 1,
      engine,
      planId: base.planId,
      planSha256: sha,
      ownerSha256: canonicalSha256(owner),
      resources: routes.map((row) => ({
        siteName: row.siteName,
        kind:
          row.kind === 'bgps'
            ? 'bgp'
            : row.kind === 'bgp_routing_policys'
              ? 'bgp_routing_policy'
              : 'external_connector',
        name: row.name,
        uid: mode === 'wrong-routing' ? 'foreign' : row.uid,
      })),
    });
  let collections = 0;
  const runtime = {
    engine,
    contract: { fingerprint: 'site-contract' },
    teardownInventory: async () => {
      collections++;
      return {
        status: mode === 'unknown' ? 'unknown' : 'observed',
        owner,
        siteContractFingerprint: 'site-contract',
        ingressContractFingerprint: 'ingress-contract',
        observedAt: new Date().toISOString(),
        sites: selected.map(({ binding }, index) => ({
          siteName: binding.siteName,
          siteUid: `site-${index}`,
          physicalSiteUid: `physical-${index}`,
        })),
        resources: [
          ...routes,
          {
            kind: 'http_loadbalancers',
            name: 'listener',
            namespace: 'default',
            uid: mode === 'drift' && collections > 1 ? 'new-listener' : 'listener-uid',
            ingressPlanId: listenerId,
          },
          { kind: 'origin_pools', name: 'origin', namespace: 'default', uid: 'origin-uid' },
        ],
      };
    },
    ingress: () => ({
      teardownReference: async () => ({
        id: listenerId,
        name: 'listener',
        namespace: 'default',
        uid: mode === 'wrong-listener' ? 'foreign' : 'listener-uid',
        phase: 'created',
        originPool: { name: 'origin', namespace: 'default', uid: 'origin-uid' },
      }),
    }),
    originTeardown: () => ({
      observe: async () => ({
        schemaVersion: 1,
        owner,
        origin: { name: 'origin', namespace: 'default', uid: 'origin-uid' },
        resourceVersion: 'v1',
        specSha256: 'b'.repeat(64),
        contractFingerprint: 'ingress-contract',
        observedAt: new Date().toISOString(),
      }),
    }),
  } as unknown as CeRuntime;
  return { base, storage, runtime, contract: { fingerprint: 'ingress-contract' } as VerifiedIngressContract };
}
test('builds the complete Terraform teardown manifest from live identities and private token-name history', async () => {
  const f = await fixture();
  const plan = await prepareAwsTerraformTeardown(f.base, f.runtime, f.contract, f.storage);
  expect(plan.retirement.length).toBe(3);
  expect(plan.drain.sites.flatMap((site) => site.routing).length).toBe(12);
  expect(plan.drain.listeners.length).toBe(1);
  expect(plan.drain.origins.length).toBe(1);
  expect(plan.retirement.flatMap((site) => site.tokens).length).toBe(3);
  expect(JSON.stringify(plan)).not.toContain('never-export-bootstrap');
  expect(JSON.stringify(plan)).not.toContain('jwt');
  expect(await f.storage.read(`${plan.planId}.json`)).toEqual(plan);
});
test('collects the same complete teardown material for a native-owned deployment', async () => {
  const f = await fixture('valid', 'native');
  const material = await collectAwsTeardownMaterial(f.base, f.runtime, f.contract, f.storage);
  expect(material.retirement).toHaveLength(3);
  expect(material.drain.sites.flatMap((site) => site.routing)).toHaveLength(12);
  expect(JSON.stringify(material)).not.toContain('never-export-bootstrap');
});
test('rejects incomplete, changed and uncorrelated teardown inventory before publishing a plan', async () => {
  for (const mode of ['unknown', 'wrong-routing', 'wrong-listener', 'foreign-token', 'drift']) {
    const f = await fixture(mode);
    await expect(prepareAwsTerraformTeardown(f.base, f.runtime, f.contract, f.storage)).rejects.toThrow();
  }
});
