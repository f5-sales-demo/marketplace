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
    sites: [{ name: 'site-a' }],
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
  await expect(observer.health('foreign')).rejects.toThrow('site/intent');
  expect(calls).toHaveLength(2);
  await f.store.write('gcp-terraform-input-identity.json', {
    intent: { ...f.intent, platformContext: 'other' },
    platformContext: 'other',
    intentFingerprint: fingerprint({ ...f.intent, platformContext: 'other' }),
  });
  await expect(observer.health('site-a')).rejects.toThrow('context/ownership');
  expect(calls).toHaveLength(2);
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
