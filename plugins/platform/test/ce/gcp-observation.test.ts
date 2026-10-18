import { afterEach, expect, it } from 'bun:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GCP_CE_API_RELEASE } from '../../../gcloud/src/ce/contract';
import { fingerprint } from '../../../gcloud/src/ce/discovery';
import { CeDeploymentStore } from '../../src/ce/deployment-store';
import { createGcpPlatformObservations } from '../../src/ce/gcp-observation';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true });
});
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'gcp-observe-')));
  roots.push(root);
  const owner = {
    deploymentId: 'demo-ce',
    provider: 'gcp' as const,
    engine: 'terraform' as const,
    account: 'example-project',
    region: 'northamerica-northeast1',
  };
  const store = await CeDeploymentStore.open(root, owner);
  const intent = {
    project: owner.account,
    region: owner.region,
    deploymentName: owner.deploymentId,
    engine: owner.engine,
    platformContext: 'lab',
    sites: [{ name: 'site-a', nodes: [{ name: 'node-a' }] }],
  };
  await store.write('gcp-terraform-input-identity.json', {
    intent,
    platformContext: 'lab',
    intentFingerprint: fingerprint(intent),
  });
  const contract = {
    release: GCP_CE_API_RELEASE,
    fingerprint: 'verified',
    availability: 'unavailable' as const,
    reason: 'gcp_provider_requires_consumer_qualification' as const,
    singleNodeLifecycle: { node_count: 1, interface_count: 2 },
    observations: {
      configuration: '/api/config/namespaces/system/securemesh_site_v2s/{site}' as const,
      registrations: '/api/register/namespaces/system/registrations_by_site/{site}' as const,
      health: '/api/operate/namespaces/system/sites/{site}/vpm/debug/global/health' as const,
    },
  };
  return { store, intent, contract };
}
it('uses only scoped GET paths and rechecks live ownership before private observations', async () => {
  const f = await fixture();
  const calls: string[] = [];
  const fetcher = (async (url, init) => {
    const path = new URL(String(url)).pathname;
    calls.push(path);
    expect(init?.method).toBe('GET');
    expect(init?.redirect).toBe('error');
    return Response.json(
      path.includes('securemesh_site_v2s')
        ? {
            metadata: {
              name: 'site-a',
              namespace: 'system',
              labels: { 'xcsh-deployment': 'demo-ce', 'xcsh-engine': 'terraform' },
            },
          }
        : { state: 'PROVISIONED' },
    );
  }) as typeof fetch;
  const observer = await createGcpPlatformObservations(
    f.store,
    'lab',
    'https://tenant.example.test',
    'fixture',
    f.contract,
    fetcher,
  );
  await observer.health('site-a');
  expect(calls).toHaveLength(2);
  if (!observer.terraformEnvironment) throw new Error('Missing private Terraform execution channel');
  expect(await observer.terraformEnvironment()).toEqual({
    XCSH_API_URL: 'https://tenant.example.test',
    XCSH_API_TOKEN: 'fixture',
  });
  await expect(observer.health('foreign')).rejects.toThrow('site/intent');
  expect(calls).toHaveLength(2);
  await f.store.write('gcp-terraform-input-identity.json', {
    intent: { ...f.intent, platformContext: 'other' },
    platformContext: 'other',
    intentFingerprint: fingerprint({ ...f.intent, platformContext: 'other' }),
  });
  await expect(observer.health('site-a')).rejects.toThrow('context/ownership');
  await expect(observer.terraformEnvironment()).rejects.toThrow('context/ownership');
  expect(calls).toHaveLength(2);
});

it('teardown observations bind exact site/node names and return only sanitized identity or absence', async () => {
  const f = await fixture();
  let absent = false;
  const calls: string[] = [];
  const observer = await createGcpPlatformObservations(
    f.store,
    'lab',
    'https://tenant.example.test',
    'fixture',
    f.contract,
    (async (url, init) => {
      expect(init?.method).toBe('GET');
      const path = new URL(String(url)).pathname;
      calls.push(path);
      if (absent) return Response.json({}, { status: 404 });
      const token = path.includes('/tokens/');
      return Response.json({
        metadata: {
          name: token ? 'node-a-token' : 'site-a',
          namespace: 'system',
          labels: {
            'xcsh-deployment': 'demo-ce',
            'xcsh-engine': 'terraform',
            ...(token ? { 'xcsh-node': 'node-a' } : {}),
          },
        },
        system_metadata: { uid: token ? 'token-uid' : 'site-uid' },
        ...(token ? { spec: { site_name: 'site-a', content: 'private-bootstrap-fixture' } } : {}),
      });
    }) as typeof fetch,
  );
  if (!observer.teardown) throw new Error('Missing teardown observation');
  await expect(observer.teardown('site-a', 'other-token')).rejects.toThrow('binding');
  expect(calls).toHaveLength(0);
  const result = await observer.teardown('site-a', 'node-a-token');
  expect(result.siteUid).toBe('site-uid');
  expect(result.tokenIdentityHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  expect(JSON.stringify(result)).not.toContain('private-bootstrap-fixture');
  expect(JSON.stringify(result)).not.toContain('token-uid');
  absent = true;
  const removed = await observer.teardown('site-a', 'node-a-token');
  expect(removed.siteAbsent).toBe(true);
  expect(removed.tokenAbsent).toBe(true);
});

it('foreign teardown objects and changed persisted intent cannot establish deletion identity', async () => {
  const f = await fixture();
  const observer = await createGcpPlatformObservations(
    f.store,
    'lab',
    'https://tenant.example.test',
    'fixture',
    f.contract,
    (async () =>
      Response.json({
        metadata: {
          name: 'site-a',
          namespace: 'system',
          labels: {
            'xcsh-deployment': 'foreign',
            'xcsh-engine': 'terraform',
          },
        },
        system_metadata: { uid: 'site-uid' },
      })) as typeof fetch,
  );
  if (!observer.teardown) throw new Error('Missing teardown observation');
  await expect(observer.teardown('site-a', 'node-a-token')).rejects.toThrow('ownership');
  const changed = { ...f.intent, engine: 'native' };
  await f.store.write('gcp-terraform-input-identity.json', {
    intent: changed,
    platformContext: 'lab',
    intentFingerprint: fingerprint(changed),
  });
  await expect(observer.teardown('site-a', 'node-a-token')).rejects.toThrow('context/ownership');
});
it('rejects missing mappings and foreign site labels before health reads', async () => {
  const f = await fixture();
  await expect(
    createGcpPlatformObservations(f.store, 'lab', 'https://tenant.example.test', 'fixture', {
      ...f.contract,
      observations: undefined,
    }),
  ).rejects.toThrow('unavailable');
  let calls = 0;
  const observer = await createGcpPlatformObservations(
    f.store,
    'lab',
    'https://tenant.example.test',
    'fixture',
    f.contract,
    (async () => {
      calls++;
      return Response.json({
        metadata: {
          name: 'site-a',
          namespace: 'system',
          labels: { 'xcsh-deployment': 'foreign', 'xcsh-engine': 'terraform' },
        },
      });
    }) as typeof fetch,
  );
  await expect(observer.health('site-a')).rejects.toThrow('ownership');
  expect(calls).toBe(1);
  const c = new AbortController();
  c.abort();
  await expect(observer.health('site-a', c.signal)).rejects.toThrow();
  expect(calls).toBe(1);
});
