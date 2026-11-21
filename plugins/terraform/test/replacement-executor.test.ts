import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import { executeF5TerraformResource } from '../src/f5-resources';
import retained from './fixtures/securemesh-replacement.json';
import schema from './fixtures/securemesh-replacement-provider-schema.json';

const originalFetch = globalThis.fetch,
  directories: string[] = [];
afterEach(async () => {
  globalThis.fetch = originalFetch;
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true });
});
type Interface = {
  name: string;
  ethernet_interface: { device: string; mac: string };
  network_option: Record<string, unknown>;
  is_primary?: unknown;
  is_management?: unknown;
  mtu?: unknown;
};
type Site = Record<string, unknown> & {
  metadata: { name: string; namespace: string; labels?: Record<string, string> };
  system_metadata?: { uid?: string };
  resource_version?: string;
  spec: Record<string, unknown> & {
    aws: { not_managed: { node_list: Array<{ hostname: string; interface_list: Interface[] }> } };
  };
};
type RenderedInterface = { is_primary?: boolean; is_management?: boolean; ethernet_interface: unknown; mtu?: number };
type RenderedResource = {
  aws: Array<{ not_managed: Array<{ node_list: Array<{ interface_list: RenderedInterface[] }> }> }>;
};
const renderedInterfaces = (value: unknown) =>
  (value as RenderedResource).aws[0].not_managed[0].node_list[0].interface_list;

type ResourceBook = { pending?: { address: string; submitted: boolean } };
const pending = async (storage: CeDeploymentStore) => {
  const book = (await storage.read('terraform-f5-resources.json')) as ResourceBook;
  if (!book.pending) throw Error('Missing fixture pending resource');
  return book.pending;
};
async function fixture() {
  const owner = {
    deploymentId: 'ce-test',
    engine: 'terraform',
    provider: 'aws',
    account: '123456789012',
    region: 'us-east-1',
  } as const;
  const directory = await mkdtemp(join(tmpdir(), 'ce-replacement-executor-'));
  directories.push(directory);
  const storage = await CeDeploymentStore.open(directory, owner);
  await storage.write('terraform-authorization.json', {
    engine: 'terraform',
    mutations: true,
    planSha256: 'a'.repeat(64),
  });
  const labels = {
    'xcsh-ce-deployment': owner.deploymentId,
    'xcsh-ce-engine': owner.engine,
    'xcsh-ce-provider': owner.provider,
    'xcsh-ce-account': owner.account,
    'xcsh-ce-region': owner.region,
  };
  let request = structuredClone(retained.request) as unknown as Site;
  request.metadata.labels = labels;
  const serverFlags = structuredClone(retained.observed.spec.aws.not_managed.node_list[0].interface_list);
  const interfaces = (value: Site) => value.spec.aws.not_managed.node_list[0].interface_list;
  for (const iface of interfaces(request)) {
    delete iface.is_primary;
    delete iface.is_management;
  }
  let actual: Site | undefined,
    configuration = '',
    applied = 0,
    driftAtPlan = false,
    driftAfterApply = false,
    lose = false;
  const session = {
    readProviderSchemas: async () => ({
      'registry.terraform.io/f5-sales-demo/xcsh': { resource_schemas: { xcsh_securemesh_site_v2: schema } },
    }),
    readConfigurationSha256: async () => configuration,
    reviseConfiguration: async (_before: string, value: string) => {
      configuration = value;
      return value;
    },
    readResourceIdentities: async () => {
      const book = await pending(storage);
      return [
        {
          address: book.address,
          type: 'xcsh_securemesh_site_v2',
          name: request.metadata.name,
          namespace: 'system',
          labels,
        },
      ];
    },
    plan: async () => {
      if (driftAtPlan && actual) interfaces(actual)[0].is_primary = !interfaces(actual)[0].is_primary;
      return { planSha256: 'b'.repeat(64), changes: [], noChanges: applied > 0 };
    },
    apply: async () => {
      applied++;
      actual = {
        ...structuredClone(request),
        system_metadata: { uid: 'owned-uid' },
        resource_version: String(applied),
      };
      interfaces(actual).forEach((iface: Interface, index: number) => {
        iface.is_primary = serverFlags[index].is_primary;
        iface.is_management = serverFlags[index].is_management;
      });
      if (driftAfterApply) interfaces(actual)[0].is_primary = !interfaces(actual)[0].is_primary;
      if (lose) throw Error('lost update response');
    },
    reconcileApplyFromEvidence: async () => {},
  };
  const platform = {
    storage: async () => storage,
    providerEnvironment: async () => ({
      XCSH_API_URL: 'https://tenant.example.com',
      XCSH_API_TOKEN: 'synthetic-token',
    }),
  };
  const terraform = {
    open: async (_owner: unknown, deployment: { configuration: string }) => {
      if (!configuration) configuration = deployment.configuration;
      return session;
    },
  };
  globalThis.fetch = Object.assign(async () => (actual ? Response.json(actual) : new Response(null, { status: 404 })), {
    preconnect: originalFetch.preconnect,
  });
  const run = (method: 'POST' | 'PUT') =>
    executeF5TerraformResource(
      platform as unknown as Parameters<typeof executeF5TerraformResource>[0],
      terraform as unknown as Parameters<typeof executeF5TerraformResource>[1],
      owner,
      '/api/config/namespaces/system/securemesh_site_v2s' + (method === 'PUT' ? '/sanitized-site' : ''),
      { method, body: JSON.stringify(request) },
    );
  await run('POST');
  if (!actual) throw Error('Missing fixture created resource');
  request = structuredClone(actual);
  delete request.system_metadata;
  interfaces(request)[0].mtu = 1600;
  return {
    run: () => run('PUT'),
    storage,
    applied: () => applied,
    stale: () => {
      if (!actual) throw Error('Missing fixture created resource');
      actual.resource_version = 'foreign-version';
    },
    planDrift: () => {
      driftAtPlan = true;
    },
    afterDrift: () => {
      driftAfterApply = true;
    },
    lost: () => {
      lose = true;
    },
    configuration: () =>
      JSON.parse(configuration) as { resource: { xcsh_securemesh_site_v2: Record<string, unknown> } },
  };
}
test('SMSv2 executor saves writable replacement and preserves observed flags', async () => {
  const f = await fixture(),
    result = (await f.run()) as Site;
  expect(f.applied()).toBe(2);
  expect(result.spec.aws.not_managed.node_list[0].interface_list[0].mtu).toBe(1600);
  const resources = f.configuration().resource.xcsh_securemesh_site_v2;
  const values = Object.values(resources)[0];
  expect(renderedInterfaces(values)[0].is_primary).toBeUndefined();
  expect(((await f.storage.read('terraform-f5-resources.json')) as ResourceBook).pending).toBeUndefined();
});
test('stale replacement version rejects before provider apply', async () => {
  const f = await fixture();
  f.stale();
  await expect(f.run()).rejects.toThrow('resource version changed');
  expect(f.applied()).toBe(1);
});
test('interface drift during saved-plan review rejects before apply', async () => {
  const f = await fixture();
  f.planDrift();
  await expect(f.run()).rejects.toThrow('state differs');
  expect(f.applied()).toBe(1);
  expect((await pending(f.storage)).submitted).toBe(false);
});
test('post-apply flag drift retains pending state and never replays apply', async () => {
  const f = await fixture();
  f.afterDrift();
  await expect(f.run()).rejects.toThrow('state differs');
  expect((await pending(f.storage)).submitted).toBe(true);
  await expect(f.run()).rejects.toThrow('state differs');
  expect(f.applied()).toBe(2);
});
test('lost update reconciles changed resource version without replaying apply', async () => {
  const f = await fixture();
  f.lost();
  await expect(f.run()).rejects.toThrow('lost update response');
  await f.run();
  expect(f.applied()).toBe(2);
  expect(((await f.storage.read('terraform-f5-resources.json')) as ResourceBook).pending).toBeUndefined();
});
