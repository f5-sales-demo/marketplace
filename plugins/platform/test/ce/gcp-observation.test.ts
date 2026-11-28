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
async function fixture(names = ['node-a'], engine: 'terraform' | 'native' = 'terraform') {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'gcp-observe-')));
  roots.push(root);
  const owner = {
    deploymentId: 'demo-ce',
    provider: 'gcp' as const,
    engine,
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
    sites: [{ name: 'site-a', nodes: names.map((name) => ({ name })) }],
  };
  await store.write(engine === 'terraform' ? 'gcp-terraform-input-identity.json' : 'gcp-deployment-intent.json', {
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
it('observes all three original Terraform node tokens independently, including partial absence', async () => {
  const names = ['node-a', 'node-b', 'node-c'];
  const f = await fixture(names);
  const calls: string[] = [];
  let absent = true;
  let foreignNode = false;
  let drift = false;
  const observer = await createGcpPlatformObservations(
    f.store,
    'lab',
    'https://tenant.example.test',
    'fixture',
    f.contract,
    (async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      expect(init?.method).toBe('GET');
      const path = new URL(String(url)).pathname;
      calls.push(path);
      const token = path.includes('/tokens/');
      const name = path.split('/').at(-1);
      if (!name) throw new Error('Missing fixture object name');
      if (absent || (token && name === 'node-b-token')) return Response.json({}, { status: 404 });
      if (drift && token) {
        const intent = { ...f.intent, sites: [{ name: 'site-a', nodes: [{ name: 'replacement' }] }] };
        await f.store.write('gcp-terraform-input-identity.json', {
          intent,
          platformContext: 'lab',
          intentFingerprint: fingerprint(intent),
        });
      }
      return Response.json({
        metadata: {
          name,
          namespace: 'system',
          labels: {
            'xcsh-deployment': 'demo-ce',
            'xcsh-engine': 'terraform',
            ...(token ? { 'xcsh-node': foreignNode ? 'node-a' : name.slice(0, -6) } : {}),
          },
        },
        system_metadata: { uid: `${name}-uid` },
        ...(token ? { spec: { site_name: 'site-a', content: 'private-bootstrap-fixture' } } : {}),
      });
    }) as unknown as typeof fetch,
  );
  if (!observer.teardown) throw new Error('Missing teardown observation');
  for (const name of names) {
    const result = await observer.teardown('site-a', `${name}-token`);
    expect(result.siteAbsent).toBe(true);
    expect(result.tokenAbsent).toBe(true);
  }
  expect(calls).toHaveLength(6);
  await expect(observer.teardown('site-a', 'foreign-token')).rejects.toThrow('binding');
  expect(calls).toHaveLength(6);
  absent = false;
  const teardown = observer.teardown;
  const rows = await Promise.all(names.map((name) => teardown('site-a', `${name}-token`)));
  expect(rows.map((row) => row.tokenAbsent)).toEqual([false, true, false]);
  expect(rows[0].tokenIdentitySha256).not.toBe(rows[2].tokenIdentitySha256);
  expect(rows.every((row) => row.siteIdentitySha256 === rows[0].siteIdentitySha256)).toBe(true);
  expect(JSON.stringify(rows)).not.toContain('private-bootstrap-fixture');
  expect(JSON.stringify(rows)).not.toContain('token-uid');
  foreignNode = true;
  await expect(observer.teardown('site-a', 'node-c-token')).rejects.toThrow('token binding');
  foreignNode = false;
  drift = true;
  await expect(observer.teardown('site-a', 'node-c-token')).rejects.toThrow('intent changed');
});

it('rejects unsupported or ambiguous teardown node sets before any HTTP read', async () => {
  for (const [names, engine] of [
    [['node-a', 'node-b'], 'terraform'],
    [['node-a', 'node-b', 'node-c', 'node-d'], 'terraform'],
    [['node-a', 'node-a', 'node-c'], 'terraform'],
    [['node-a', 'node-b', 'node-c'], 'native'],
  ] as const) {
    const f = await fixture([...names], engine);
    let calls = 0;
    const observer = await createGcpPlatformObservations(
      f.store,
      'lab',
      'https://tenant.example.test',
      'fixture',
      f.contract,
      (async () => {
        calls++;
        return Response.json({}, { status: 404 });
      }) as unknown as typeof fetch,
    );
    if (!observer.teardown) throw new Error('Missing teardown observation');
    await expect(observer.teardown('site-a', 'node-a-token')).rejects.toThrow('binding');
    expect(calls).toBe(0);
  }
});
it('uses only scoped GET paths and rechecks live ownership before private observations', async () => {
  const f = await fixture();
  const calls: string[] = [];
  const fetcher = (async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
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
  }) as unknown as typeof fetch;
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
    (async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
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
    }) as unknown as typeof fetch,
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
      })) as unknown as typeof fetch,
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
    }) as unknown as typeof fetch,
  );
  await expect(observer.health('site-a')).rejects.toThrow('ownership');
  expect(calls).toBe(1);
  const c = new AbortController();
  c.abort();
  await expect(observer.health('site-a', c.signal)).rejects.toThrow();
  expect(calls).toBe(1);
});

it('HA collection binds original site and all three node identities before and after reads', async () => {
  const f = await fixture();
  const nodes = ['node-a', 'node-b', 'node-c'];
  const intent = {
    ...f.intent,
    sites: [{ name: 'site-a', nodes: nodes.map((name) => ({ name, zone: 'northamerica-northeast1-a' })) }],
  };
  await f.store.write('gcp-terraform-input-identity.json', {
    intent,
    intentFingerprint: fingerprint(intent),
    platformContext: 'lab',
  });
  const resources = nodes.map((nodeName, n) => ({
    kind: 'instance',
    nodeName,
    siteName: 'site-a',
    id: String(n + 1),
    project: intent.project,
    deploymentName: intent.deploymentName,
    engine: 'terraform',
    selfLink: `https://www.googleapis.com/compute/v1/projects/${intent.project}/zones/northamerica-northeast1-a/instances/${nodeName}`,
  }));
  await f.store.write('gcp-resources.json', {
    schemaVersion: 1,
    project: intent.project,
    deploymentName: intent.deploymentName,
    engine: 'terraform',
    resources,
  });
  const hash = `sha256:${(await import('node:crypto')).createHash('sha256').update('original-site').digest('hex')}`;
  await f.store.write('gcp-tf-public-ownership.json', {
    schemaVersion: 2,
    intentFingerprint: fingerprint(intent),
    complete: true,
    resources,
    platform: { 'xcsh_securemesh_site_v2.site_a': hash },
  });
  const contract = {
    ...f.contract,
    haObservations: {
      componentStatus:
        '/api/operate/namespaces/system/sites/{site}/vpm/debug/global/ves-system/status?cached=false' as const,
      serviceInventory: '/api/operate/namespaces/system/sites/{site}/vpm/debug/global/list-service' as const,
    },
  };
  const paths: string[] = [];
  let replacement = false,
    failInventory = false,
    drift = false;
  const observer = await createGcpPlatformObservations(
    f.store,
    'lab',
    'https://tenant.example.test',
    'SECRET',
    contract,
    (async (url: Parameters<typeof fetch>[0]) => {
      const path = new URL(String(url)).pathname;
      paths.push(path);
      if (path.includes('securemesh_site_v2s'))
        return Response.json({
          metadata: {
            name: 'site-a',
            namespace: 'system',
            labels: { 'xcsh-deployment': 'demo-ce', 'xcsh-engine': 'terraform' },
          },
          system_metadata: { uid: replacement ? 'replacement' : 'original-site' },
        });
      if (path.endsWith('list-service')) {
        if (drift)
          await f.store.write('gcp-resources.json', {
            schemaVersion: 1,
            project: intent.project,
            deploymentName: intent.deploymentName,
            engine: 'terraform',
            resources: resources.map((r, n) => ({ ...r, id: n === 0 ? '99' : r.id })),
          });
        return Response.json(
          { service: nodes.map((node) => ({ node, value: 'service', name: 'Display' })) },
          { status: failInventory ? 503 : 200 },
        );
      }
      return Response.json(
        path.endsWith('status')
          ? { status: nodes.map((node) => ({ node, name: 'service', status: 'Ready', message: '' })) }
          : { hostname: 'node-a', state: 'PROVISIONED' },
      );
    }) as unknown as typeof fetch,
  );
  if (!observer.haHealth) throw new Error('HA collection unavailable');
  const first = await observer.haHealth('site-a');
  expect(first.ownedNodes).toEqual(nodes.map((nodeName, n) => ({ nodeName, instanceId: String(n + 1) })));
  expect(first.siteIdentitySha256).toBe(hash);
  expect(first.serviceInventory.httpStatus).toBe(200);
  expect(paths.filter((p) => p.includes('securemesh_site_v2s'))).toHaveLength(2);
  expect(JSON.stringify(first)).not.toContain('SECRET');
  failInventory = true;
  const failed = await observer.haHealth('site-a');
  expect(failed.serviceInventory.available).toBe(false);
  expect(failed.serviceInventory.httpStatus).toBe(503);
  expect(failed.serviceInventory.value).toBeUndefined();
  replacement = true;
  await expect(observer.haHealth('site-a')).rejects.toThrow('identity');
  replacement = false;
  drift = true;
  await expect(observer.haHealth('site-a')).rejects.toThrow('ownership');
  drift = false;
  const before = paths.length;
  // The changed ledger cannot replace the original IDs captured at apply time.
  await expect(observer.haHealth('site-a')).rejects.toThrow('VM identity');
  expect(paths.length).toBe(before);
  await f.store.write('gcp-resources.json', {
    schemaVersion: 1,
    project: intent.project,
    deploymentName: intent.deploymentName,
    engine: 'terraform',
    resources,
  });
  const ownership = (await f.store.read('gcp-tf-public-ownership.json')) as Record<string, unknown>;
  await f.store.write('gcp-tf-public-ownership.json', {
    ...ownership,
    resources: [...resources, resources[0]],
  });
  await expect(observer.haHealth('site-a')).rejects.toThrow('VM identity');
  expect(paths.length).toBe(before);
});

it('refreshes selected credentials before each cleanup read and Terraform environment without changing origin', async () => {
  const f = await fixture();
  let credential = 'initial-fixture';
  const headers: string[] = [];
  const observer = await createGcpPlatformObservations(
    f.store,
    'lab',
    'https://tenant.example.test',
    credential,
    f.contract,
    (async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      headers.push(new Headers(init?.headers).get('Authorization') ?? '');
      credential = 'rotated-fixture';
      return Response.json({}, { status: 404 });
    }) as unknown as typeof fetch,
    async () => ({ url: 'https://tenant.example.test', credential }),
  );
  credential = 'refreshed-fixture';
  expect(await observer.terraformEnvironment?.()).toEqual({
    XCSH_API_URL: 'https://tenant.example.test',
    XCSH_API_TOKEN: 'refreshed-fixture',
  });
  const result = await observer.teardown?.('site-a', 'node-a-token');
  expect(result?.siteAbsent).toBe(true);
  expect(result?.tokenAbsent).toBe(true);
  expect(headers).toEqual(['APIToken refreshed-fixture', 'APIToken rotated-fixture']);
  expect(JSON.stringify(result)).not.toContain('fixture');
});

it('ordinary health observations use the refreshed selected credential for every GET', async () => {
  const f = await fixture();
  let credential = 'initial-fixture';
  const headers: string[] = [];
  const observer = await createGcpPlatformObservations(
    f.store,
    'lab',
    'https://tenant.example.test',
    credential,
    f.contract,
    (async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      headers.push(new Headers(init?.headers).get('Authorization') ?? '');
      credential = 'rotated-fixture';
      return Response.json(
        new URL(String(url)).pathname.includes('securemesh_site_v2s')
          ? {
              metadata: {
                name: 'site-a',
                namespace: 'system',
                labels: {
                  'xcsh-deployment': 'demo-ce',
                  'xcsh-engine': 'terraform',
                },
              },
            }
          : { state: 'PROVISIONED' },
      );
    }) as unknown as typeof fetch,
    async () => ({ url: 'https://tenant.example.test', credential }),
  );
  credential = 'refreshed-fixture';
  await observer.health('site-a');
  expect(headers).toEqual(['APIToken refreshed-fixture', 'APIToken rotated-fixture']);
});

for (const mode of ['origin', 'empty', 'userinfo', 'query', 'fragment', 'http', 'malformed'] as const)
  it(`refuses changed or malformed selected cleanup context before exposing credentials or reading HTTP: ${mode}`, async () => {
    const f = await fixture();
    let calls = 0;
    let current = { url: 'https://tenant.example.test', credential: 'initial-fixture' };
    const observer = await createGcpPlatformObservations(
      f.store,
      'lab',
      current.url,
      current.credential,
      f.contract,
      (async () => {
        calls++;
        return Response.json({}, { status: 404 });
      }) as unknown as typeof fetch,
      async () => current,
    );
    if (mode === 'origin') current = { ...current, url: 'https://other.example.test' };
    if (mode === 'empty') current = { ...current, credential: '' };
    if (mode === 'userinfo') current = { ...current, url: 'https://user@tenant.example.test' };
    if (mode === 'query') current = { ...current, url: 'https://tenant.example.test?scope=other' };
    if (mode === 'fragment') current = { ...current, url: 'https://tenant.example.test#other' };
    if (mode === 'http') current = { ...current, url: 'http://tenant.example.test' };
    if (mode === 'malformed') current = { ...current, url: 'invalid-url' };
    await expect(observer.terraformEnvironment?.()).rejects.toThrow('selected context');
    await expect(observer.teardown?.('site-a', 'node-a-token')).rejects.toThrow('selected context');
    await expect(observer.health('site-a')).rejects.toThrow('selected context');
    expect(calls).toBe(0);
  });

for (const channel of ['teardown', 'health'] as const)
  it(`refuses selected origin changes during ${channel} capture before returning evidence`, async () => {
    const f = await fixture();
    let calls = 0;
    let url = 'https://tenant.example.test';
    const observer = await createGcpPlatformObservations(
      f.store,
      'lab',
      url,
      'fixture',
      f.contract,
      (async () => {
        calls++;
        url = 'https://other.example.test';
        return Response.json({
          metadata: {
            name: 'site-a',
            namespace: 'system',
            labels: {
              'xcsh-deployment': 'demo-ce',
              'xcsh-engine': 'terraform',
            },
          },
          system_metadata: { uid: 'site-uid' },
        });
      }) as unknown as typeof fetch,
      async () => ({ url, credential: 'fixture' }),
    );
    await expect(
      channel === 'health' ? observer.health('site-a') : observer.teardown?.('site-a', 'node-a-token'),
    ).rejects.toThrow('selected context');
    expect(calls).toBe(1);
  });
