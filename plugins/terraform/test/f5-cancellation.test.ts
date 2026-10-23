import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import type { CePlatformService } from '../../platform/src/ce/service';
import { executeF5TerraformResource } from '../src/f5-resources';
import { XCSH_PROVIDER_VERSION } from '../src/provider-lock';
import type { CeTerraformService } from '../src/service';

const hash = (v: unknown) =>
  createHash('sha256')
    .update(typeof v === 'string' ? v : JSON.stringify(v))
    .digest('hex');
const directories: string[] = [];
const originalFetch = globalThis.fetch;
afterEach(async () => {
  globalThis.fetch = originalFetch;
  for (const d of directories.splice(0)) await rm(d, { recursive: true, force: true });
});
async function fixture(update = false) {
  const owner = {
    deploymentId: 'ce-cancel',
    engine: 'terraform' as const,
    provider: 'aws' as const,
    account: '123456789012',
    region: 'us-east-1',
  };
  const root = await mkdtemp(join(tmpdir(), 'f5-cancel-'));
  directories.push(root);
  const storage = await CeDeploymentStore.open(root, owner);
  const labels = {
    'xcsh-ce-deployment': owner.deploymentId,
    'xcsh-ce-engine': 'terraform',
    'xcsh-ce-provider': 'aws',
    'xcsh-ce-account': owner.account,
    'xcsh-ce-region': owner.region,
  };
  const metadata = { name: 'site-bgp', namespace: 'system', labels };
  const priorSpec = { peers: [{ metadata: { name: 'peer-one' }, external: { address: '192.0.2.1' } }] };
  const request = {
    metadata,
    spec: { peers: [{ metadata: { name: 'peer-one' }, external: { address: '192.0.2.2' } }] },
  };
  const empty = {
    terraform: {
      required_version: '= 1.16.5',
      required_providers: { xcsh: { source: 'f5-sales-demo/xcsh', version: `= ${XCSH_PROVIDER_VERSION}` } },
    },
    provider: { xcsh: {} },
  };
  const key = `view_${hash(['bgps', 'system', 'site-bgp']).slice(0, 24)}`,
    address = `xcsh_bgp.${key}`,
    path = `/api/config/namespaces/system/bgps${update ? '/site-bgp' : ''}`;
  const priorValues = { name: metadata.name, namespace: metadata.namespace, labels, peers: priorSpec.peers };
  const nextValues = { ...priorValues, peers: request.spec.peers };
  const prior = JSON.stringify({ ...empty, ...(update ? { resource: { xcsh_bgp: { [key]: priorValues } } } : {}) }),
    pendingConfiguration = JSON.stringify({ ...empty, resource: { xcsh_bgp: { [key]: nextValues } } });
  const receipt = {
    schemaVersion: 1,
    engine: 'terraform',
    deploymentId: owner.deploymentId,
    planSha256: 'b'.repeat(64),
    configurationSha256: hash(pendingConfiguration),
    noChanges: false,
    changes: [],
  };
  const book = {
    schemaVersion: 1,
    owner,
    configurationSha256: hash(prior),
    resources: update
      ? {
          [key]: {
            type: 'xcsh_bgp',
            path: '/api/config/namespaces/system/bgps/site-bgp',
            uid: 'bgp-uid',
            values: priorValues,
          },
        }
      : {},
    pending: {
      requestSha256: hash({ owner, path, method: update ? 'PUT' : 'POST', request }),
      configuration: pendingConfiguration,
      address,
      method: update ? 'PUT' : 'POST',
      submitted: false,
      path,
      request,
      planSha256: 'a'.repeat(64),
      receipt,
    },
  };
  await storage.write('terraform-authorization.json', {
    engine: 'terraform',
    mutations: true,
    planSha256: 'a'.repeat(64),
  });
  await storage.write('terraform-f5-resources.json', book);
  let configuration = pendingConfiguration,
    cancellations = 0,
    plans = 0,
    mode = 'valid';
  const session = {
    readConfigurationSha256: async () => hash(configuration),
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
    readResourceIdentities: async () =>
      mode === 'foreign-state'
        ? [
            {
              address: 'xcsh_bgp.foreign',
              type: 'xcsh_bgp',
              id: 'foreign',
              name: 'foreign',
              namespace: 'system',
              labels,
            },
          ]
        : update
          ? [{ address, type: 'xcsh_bgp', id: 'system/site-bgp', name: 'site-bgp', namespace: 'system', labels }]
          : [],
    cancelUnsubmittedPlan: async (_receipt: unknown, expected: string, next: string) => {
      if (mode === 'runner-submitted') throw Error('runner already applying');
      if (
        ![hash(pendingConfiguration), hash(prior)].includes(hash(configuration)) ||
        expected !== hash(pendingConfiguration)
      )
        throw Error('stale cancellation');
      cancellations++;
      configuration = next;
    },
    plan: async () => {
      plans++;
      if (mode === 'refresh-interruption' && plans === 1) throw Error('refresh interrupted');
      return {
        ...receipt,
        configurationSha256: hash(configuration),
        planSha256: 'c'.repeat(64),
        noChanges: mode !== 'changing-plan',
        changes: mode === 'changing-plan' ? [{ address, actions: ['create'] }] : [],
      };
    },
    apply: async () => {
      throw Error('provider apply forbidden');
    },
  };
  globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') throw Error('API mutation forbidden');
    if (mode === 'service') return new Response(null, { status: 503 });
    return update || mode === 'unexpected-api'
      ? Response.json({
          metadata,
          system_metadata: { uid: mode === 'changed-uid' ? 'replacement' : 'bgp-uid' },
          spec: mode === 'wrong-spec' ? request.spec : priorSpec,
        })
      : new Response(null, { status: 404 });
  }) as typeof fetch;
  const platform = {
    storage: async () => storage,
    providerEnvironment: async () => ({ XCSH_API_URL: 'https://tenant.test', XCSH_API_TOKEN: 'synthetic-only' }),
  } as unknown as CePlatformService;
  const terraform = { open: async () => session } as unknown as CeTerraformService;
  return {
    storage,
    book,
    prior,
    session,
    cancellations: () => cancellations,
    mode: (m: string) => (mode = m),
    reconcile: () =>
      executeF5TerraformResource(platform, terraform, owner, '/api/config/terraform-f5-reconcile', {
        method: 'RECONCILE',
      }),
    run: () =>
      executeF5TerraformResource(platform, terraform, owner, '/api/config/terraform-f5-cancel', {
        method: 'CANCEL_UNSUBMITTED',
      }),
  };
}
for (const update of [false, true])
  test(`cancels an unsubmitted ${update ? 'update' : 'create'} without API/provider mutation`, async () => {
    const f = await fixture(update);
    await f.run();
    expect(f.cancellations()).toBe(1);
    expect(await f.storage.read('terraform-f5-resources.json')).not.toHaveProperty('pending');
    await f.run();
    expect(f.cancellations()).toBe(1);
  });
test('unsubmitted cancellation resumes after refresh interruption while retaining its pending request', async () => {
  const f = await fixture();
  f.mode('refresh-interruption');
  await expect(f.run()).rejects.toThrow('refresh interrupted');
  expect(await f.storage.read('terraform-f5-resources.json')).toHaveProperty('pending');
  expect(await f.storage.read('terraform-f5-cancellation-pending.json')).toHaveProperty('schemaVersion', 1);
  await expect(f.reconcile()).rejects.toThrow('cancellation');
  await f.run();
  expect(await f.storage.read('terraform-f5-resources.json')).not.toHaveProperty('pending');
});
test('cancellation preserves pending state for submitted, foreign, stale, unavailable or changing evidence', async () => {
  for (const mode of [
    'submitted',
    'malformed-receipt',
    'pending-config',
    'foreign-state',
    'runner-submitted',
    'unexpected-api',
    'prior-digest',
    'request-digest',
    'service',
    'changing-plan',
    'changed-uid',
    'wrong-spec',
  ]) {
    const f = await fixture(['changed-uid', 'wrong-spec'].includes(mode));
    if (mode === 'submitted') f.book.pending.submitted = true;
    if (mode === 'malformed-receipt') (f.book.pending as Record<string, unknown>).receipt = false;
    if (mode === 'pending-config') f.book.pending.configuration = '{}';
    if (mode === 'prior-digest') f.book.configurationSha256 = 'f'.repeat(64);
    if (mode === 'request-digest') f.book.pending.requestSha256 = 'f'.repeat(64);
    await f.storage.write('terraform-f5-resources.json', f.book);
    f.mode(mode);
    await expect(f.run()).rejects.toThrow();
    expect(await f.storage.read('terraform-f5-resources.json')).toHaveProperty('pending');
  }
});

test('cancellation resumes completed bookkeeping after marker removal interruption without another rollback', async () => {
  const f = await fixture(),
    remove = f.storage.remove.bind(f.storage);
  let attempts = 0;
  f.storage.remove = async (name: string) => {
    if (++attempts === 1) throw Error('marker removal interrupted');
    return remove(name);
  };
  await expect(f.run()).rejects.toThrow('marker removal interrupted');
  expect(await f.storage.read('terraform-f5-resources.json')).not.toHaveProperty('pending');
  await f.run();
  expect(f.cancellations()).toBe(1);
  await expect(f.storage.read('terraform-f5-cancellation-pending.json')).rejects.toThrow();
});
