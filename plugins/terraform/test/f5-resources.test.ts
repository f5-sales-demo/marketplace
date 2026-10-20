import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import type { CePlatformService } from '../../platform/src/ce/service';
import { executeF5TerraformResource } from '../src/f5-resources';
import type { CeTerraformService } from '../src/service';

const originalFetch = globalThis.fetch,
  directories: string[] = [];
afterEach(async () => {
  globalThis.fetch = originalFetch;
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true });
});
async function fixture() {
  const owner = {
    deploymentId: 'ce-test',
    engine: 'terraform' as const,
    provider: 'aws' as const,
    account: '123456789012',
    region: 'us-east-1',
  };
  const directory = await mkdtemp(join(tmpdir(), 'f5-resource-'));
  directories.push(directory);
  const storage = await CeDeploymentStore.open(directory, owner);
  await storage.write('terraform-authorization.json', {
    engine: 'terraform',
    mutations: true,
    planSha256: 'a'.repeat(64),
  });
  const labels = {
    'xcsh-ce-deployment': owner.deploymentId,
    'xcsh-ce-engine': 'terraform',
    'xcsh-ce-provider': 'aws',
    'xcsh-ce-account': owner.account,
    'xcsh-ce-region': owner.region,
  };
  const request = {
    metadata: { name: 'site-bgp', namespace: 'system', labels },
    spec: { peers: [{ metadata: { name: 'peer-one' }, external: { address: '192.0.2.1' } }] },
  };
  let actual: Record<string, unknown> | undefined,
    configuration = '',
    applyCount = 0,
    wrongUid = false,
    wrongSpec = false,
    lose = false;
  const receipt = { planSha256: 'b'.repeat(64), noChanges: false, changes: [] };
  const session = {
    readProviderSchemas: async () => ({
      'registry.terraform.io/f5-sales-demo/xcsh': {
        resource_schemas: {
          xcsh_bgp: {
            block: {
              attributes: {
                name: { required: true },
                namespace: { required: true },
                labels: { optional: true },
                peers: { optional: true },
              },
            },
          },
        },
      },
    }),
    readConfigurationSha256: async () => configuration,
    reviseConfiguration: async (_before: string, value: string) => {
      configuration = value;
      return value;
    },
    readResourceIdentities: async () => {
      const book = (await storage.read('terraform-f5-resources.json')) as { pending?: { address: string } };
      return [{ address: book.pending?.address, type: 'xcsh_bgp', name: 'site-bgp', namespace: 'system', labels }];
    },
    plan: async () => ({ ...receipt, noChanges: applyCount > 0 }),
    apply: async () => {
      applyCount++;
      actual = {
        ...structuredClone(request),
        system_metadata: { uid: wrongUid ? 'foreign-uid' : 'bgp-one' },
        resource_version: 'v2',
      };
      if (wrongSpec) (actual.spec as { peers: unknown[] }).peers = [];
      if (lose) throw Error('lost apply');
    },
    reconcileApplyFromEvidence: async () => {},
  };
  const platform = {
    storage: async () => storage,
    providerEnvironment: async () => ({
      XCSH_API_URL: 'https://tenant.example.com',
      XCSH_API_TOKEN: 'synthetic-token',
    }),
  } as unknown as CePlatformService;
  const terraform = {
    open: async (_owner: unknown, deployment: { configuration: string }) => {
      if (!configuration) configuration = deployment.configuration;
      return session;
    },
  } as unknown as CeTerraformService;
  globalThis.fetch = (async () =>
    actual ? Response.json(actual) : new Response(null, { status: 404 })) as unknown as typeof fetch;
  const run = (method: 'POST' | 'PUT' = 'POST') =>
    executeF5TerraformResource(
      platform,
      terraform,
      owner,
      `/api/config/namespaces/system/bgps${method === 'PUT' ? '/site-bgp' : ''}`,
      { method, body: JSON.stringify(request) },
    );
  return {
    storage,
    request,
    run,
    applyCount: () => applyCount,
    wrongUid: () => {
      wrongUid = true;
    },
    wrongSpec: () => {
      wrongSpec = true;
    },
    lose: () => {
      lose = true;
    },
    extraPolicy: () => {
      const spec = actual?.spec as { peers: Array<Record<string, unknown>> };
      spec.peers[0].routing_policies = {
        route_policy: [{ outbound: {}, object_refs: [{ name: 'stale-policy', namespace: 'system' }] }],
      };
    },
  };
}
test('F5 Terraform creation and update require state-owned stable API identity', async () => {
  const f = await fixture();
  await f.run();
  f.wrongUid();
  await expect(f.run('PUT')).rejects.toThrow('identity');
  expect(f.applyCount()).toBe(2);
});
test('F5 Terraform successful apply with wrong requested spec cannot clear the pending journal', async () => {
  const f = await fixture();
  f.wrongSpec();
  await expect(f.run()).rejects.toThrow('readback');
  const book = (await f.storage.read('terraform-f5-resources.json')) as { pending?: unknown };
  expect(book.pending).toBeDefined();
});
test('submitted BGP restoration cannot accept an extra retained routing policy or replay apply', async () => {
  const f = await fixture();
  f.lose();
  await expect(f.run()).rejects.toThrow('lost apply');
  f.extraPolicy();
  await expect(f.run()).rejects.toThrow('unknown');
  expect(f.applyCount()).toBe(1);
});

test('exact lost-apply readback reconciles the original saved plan once without another apply', async () => {
  const f = await fixture();
  f.lose();
  await expect(f.run()).rejects.toThrow('lost apply');
  const value = await f.run();
  expect(value.system_metadata).toEqual({ uid: 'bgp-one' });
  expect(f.applyCount()).toBe(1);
  const book = (await f.storage.read('terraform-f5-resources.json')) as { pending?: unknown };
  expect(book.pending).toBeUndefined();
});
