import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../src/ce/deployment-store';
import { originalGcpBootstrapSource } from '../../src/ce/gcp-bootstrap-evidence';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'original-bootstrap-observation-'));
  roots.push(root);
  const store = await CeDeploymentStore.open(root, {
    provider: 'gcp',
    engine: 'terraform',
    account: 'example-project',
    region: 'us-central1',
    deploymentId: 'example-deployment',
  });
  let active = true;
  return {
    store,
    assertOriginal: async () => {
      if (!active) throw new Error('Original credential input changed');
    },
    retireInputs: () => {
      active = false;
    },
    targets: [
      { type_name: 'xcsh_securemesh_site_v2' as const, namespace: 'system' as const, name: 'example-site' },
      { type_name: 'xcsh_token' as const, namespace: 'system' as const, name: 'example-token' },
    ],
  };
}
async function module() {
  return import('../../src/ce/gcp-bootstrap-observation');
}

test('Platform observation issues original Site/Token bodies from one recorder and retires without replay', async () => {
  const run = await fixture();
  const { openOriginalGcpBootstrapObservation } = await module();
  const calls: Array<{ url: string; method?: string }> = [];
  const observe = await openOriginalGcpBootstrapObservation(
    {
      store: run.store,
      origin: 'https://tenant.example.com',
      credential: 'synthetic-credential',
      targets: run.targets,
      assertOriginal: run.assertOriginal,
    },
    {
      fetcher: async (url, init) => {
        calls.push({ url: url.toString(), method: init.method });
        expect(init.redirect).toBe('error');
        expect(init.signal).toBeDefined();
        return Response.json({
          metadata: { name: url.pathname.includes('/tokens/') ? 'example-token' : 'example-site', namespace: 'system' },
        });
      },
    },
  );
  const site = await observe.read(run.targets[0]);
  const token = await observe.read(run.targets[1]);
  if (!site || !token) throw new Error('Original bodies required');
  expect(site.evidence.captureId).toBe(token.evidence.captureId);
  expect(calls.every((call) => call.method === 'GET')).toBe(true);
  await originalGcpBootstrapSource.assertBody(site);
  await originalGcpBootstrapSource.assertBody(token);
  await expect(originalGcpBootstrapSource.assertBody({ ...token })).rejects.toThrow('Original');
  await expect(observe.read({ ...run.targets[0], name: 'foreign-site' })).rejects.toThrow('scope');
  expect(calls).toHaveLength(2);
  // A failed scope request retires the observation; it cannot become a new session.
  await expect(observe.read(run.targets[0])).rejects.toThrow('retired');
  await observe.close();
});

test('explicit close invalidates original body authority while keeping retained bytes', async () => {
  const run = await fixture();
  const { openOriginalGcpBootstrapObservation } = await module();
  const observation = await openOriginalGcpBootstrapObservation(
    {
      store: run.store,
      origin: 'https://tenant.example.com',
      credential: 'synthetic-credential',
      targets: run.targets,
      assertOriginal: run.assertOriginal,
    },
    { fetcher: async () => Response.json({ metadata: { name: 'example-site' } }) },
  );
  const body = await observation.read(run.targets[0]);
  if (!body) throw new Error('Original body required');
  await observation.close();
  await observation.close();
  await expect(originalGcpBootstrapSource.assertBody(body)).rejects.toThrow('retired');
  expect((await readdir(run.store.directory)).some((name) => name.endsWith('.body.private.bin'))).toBe(true);
});

for (const status of [401, 403, 500] as const) {
  test(`HTTP ${status} retains failure and prevents an unchanged source retry`, async () => {
    const run = await fixture();
    const { openOriginalGcpBootstrapObservation } = await module();
    let reads = 0;
    const observation = await openOriginalGcpBootstrapObservation(
      {
        store: run.store,
        origin: 'https://tenant.example.com',
        credential: 'synthetic-credential',
        targets: run.targets,
        assertOriginal: run.assertOriginal,
      },
      {
        fetcher: async () => {
          reads++;
          return Response.json({ error: 'synthetic failure' }, { status });
        },
      },
    );
    await expect(observation.read(run.targets[0])).rejects.toThrow();
    await expect(observation.read(run.targets[0])).rejects.toThrow('retired');
    expect(reads).toBe(1);
    expect((await readdir(run.store.directory)).some((name) => name.endsWith('.body.private.bin'))).toBe(true);
  });
}

test('input replacement retires an observer before the next GET', async () => {
  const run = await fixture();
  const { openOriginalGcpBootstrapObservation } = await module();
  let reads = 0;
  const observation = await openOriginalGcpBootstrapObservation(
    {
      store: run.store,
      origin: 'https://tenant.example.com',
      credential: 'synthetic-credential',
      targets: run.targets,
      assertOriginal: run.assertOriginal,
    },
    {
      fetcher: async () => {
        reads++;
        return Response.json({});
      },
    },
  );
  run.retireInputs();
  await expect(observation.read(run.targets[0])).rejects.toThrow('changed');
  await expect(observation.read(run.targets[0])).rejects.toThrow('retired');
  expect(reads).toBe(0);
});

test('absence is retained without becoming bootstrap authority', async () => {
  const run = await fixture();
  const { openOriginalGcpBootstrapObservation } = await module();
  let reads = 0;
  const observation = await openOriginalGcpBootstrapObservation(
    {
      store: run.store,
      origin: 'https://tenant.example.com',
      credential: 'synthetic-credential',
      targets: run.targets,
      assertOriginal: run.assertOriginal,
    },
    {
      fetcher: async () => {
        reads++;
        return Response.json({}, { status: 404 });
      },
    },
  );
  expect(await observation.read(run.targets[0])).toBeUndefined();
  await observation.assertOriginal();
  expect(reads).toBe(1);
  await observation.close();
});

test('registered Platform opener binds persisted owning intent and selected credential before any HTTP call', async () => {
  const { createHash } = await import('node:crypto');
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { createCePlatformService } = await import('../../src/ce/service');
  const { fingerprint } = await import('../../../gcloud/src/ce/discovery');
  const root = await mkdtemp(join(tmpdir(), 'bootstrap-platform-service-'));
  roots.push(root);
  const config = join(root, 'config');
  await mkdir(join(config, 'xcsh/contexts'), { recursive: true });
  await writeFile(
    join(config, 'xcsh/contexts/example.json'),
    JSON.stringify({ apiUrl: 'https://tenant.example.com', apiToken: 'synthetic-credential' }),
  );
  const service = createCePlatformService({ XDG_CONFIG_HOME: config, XCSH_CE_DEPLOYMENTS_DIR: join(root, 'state') });
  const owner = {
    provider: 'gcp' as const,
    engine: 'terraform' as const,
    account: 'example-project',
    region: 'us-central1',
    deploymentId: 'example-deployment',
  };
  const store = await service.storage(owner);
  const intent = {
    project: owner.account,
    region: owner.region,
    deploymentName: owner.deploymentId,
    platformContext: 'example',
    engine: 'terraform',
  };
  await store.write('gcp-terraform-input-identity.json', {
    intent,
    intentFingerprint: fingerprint(intent),
    platformContext: 'example',
  });
  if (!service.gcpBootstrapObservation) throw new Error('Platform observation opener required');
  const binding = {
    origin: 'https://tenant.example.com',
    credentialSha256: createHash('sha256').update('synthetic-credential').digest('hex'),
    targets: [{ type_name: 'xcsh_token' as const, namespace: 'system' as const, name: 'example-token' }],
    assertOriginal: async () => {},
  };
  await expect(
    service.gcpBootstrapObservation(owner, 'example', { ...binding, credentialSha256: '0'.repeat(64) }),
  ).rejects.toThrow('credential');
  await expect(
    service.gcpBootstrapObservation(owner, 'example', { ...binding, origin: 'https://foreign.example.com' }),
  ).rejects.toThrow('credential');
  const observe = await service.gcpBootstrapObservation(owner, 'example', binding);
  await observe.assertOriginal();
  await observe.close();
  await store.write('gcp-terraform-input-identity.json', {
    intent: { ...intent, engine: 'native' },
    intentFingerprint: fingerprint({ ...intent, engine: 'native' }),
    platformContext: 'example',
  });
  await expect(service.gcpBootstrapObservation(owner, 'example', binding)).rejects.toThrow('intent');
});

test('an opened registered observer refuses selected credential and intent changes without renewing its context', async () => {
  const { createHash } = await import('node:crypto');
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { createCePlatformService } = await import('../../src/ce/service');
  const { fingerprint } = await import('../../../gcloud/src/ce/discovery');
  for (const change of ['credential', 'intent'] as const) {
    const root = await mkdtemp(join(tmpdir(), 'bootstrap-platform-mutation-'));
    roots.push(root);
    const config = join(root, 'config');
    await mkdir(join(config, 'xcsh/contexts'), { recursive: true });
    const contextPath = join(config, 'xcsh/contexts/example.json');
    await writeFile(
      contextPath,
      JSON.stringify({ apiUrl: 'https://tenant.example.com', apiToken: 'synthetic-credential' }),
    );
    const service = createCePlatformService({ XDG_CONFIG_HOME: config, XCSH_CE_DEPLOYMENTS_DIR: join(root, 'state') });
    const owner = {
      provider: 'gcp' as const,
      engine: 'terraform' as const,
      account: 'example-project',
      region: 'us-central1',
      deploymentId: 'example-deployment',
    };
    const store = await service.storage(owner);
    const intent = {
      project: owner.account,
      region: owner.region,
      deploymentName: owner.deploymentId,
      platformContext: 'example',
      engine: 'terraform',
    };
    await store.write('gcp-terraform-input-identity.json', {
      intent,
      intentFingerprint: fingerprint(intent),
      platformContext: 'example',
    });
    if (!service.gcpBootstrapObservation) throw new Error('Original observation unavailable');
    const observation = await service.gcpBootstrapObservation(owner, 'example', {
      origin: 'https://tenant.example.com',
      credentialSha256: createHash('sha256').update('synthetic-credential').digest('hex'),
      targets: [{ type_name: 'xcsh_token', namespace: 'system', name: 'example-token' }],
      assertOriginal: async () => {},
    });
    if (change === 'credential')
      await writeFile(
        contextPath,
        JSON.stringify({ apiUrl: 'https://tenant.example.com', apiToken: 'different-synthetic-credential' }),
      );
    else
      await store.write('gcp-terraform-input-identity.json', {
        intent,
        intentFingerprint: fingerprint(intent),
        platformContext: 'foreign',
      });
    await expect(observation.assertOriginal()).rejects.toThrow(change);
    await expect(observation.assertOriginal()).rejects.toThrow('retired');
    await observation.close();
  }
});

for (const targetType of ['xcsh_securemesh_site_v2', 'xcsh_token'] as const) {
  test(`Platform ${targetType} absence retains original GET evidence without bootstrap authority`, async () => {
    const run = await fixture();
    const { openOriginalGcpBootstrapObservation } = await module();
    const target = run.targets.find((row) => row.type_name === targetType);
    if (!target) throw new Error('Original target required');
    const observation = await openOriginalGcpBootstrapObservation(
      {
        store: run.store,
        origin: 'https://tenant.example.com',
        credential: 'synthetic-credential',
        targets: run.targets,
        assertOriginal: run.assertOriginal,
      },
      { fetcher: async () => Response.json({ error: 'synthetic not found' }, { status: 404 }) },
    );
    const presence = await observation.readPresence(target);
    expect(presence.present).toBe(false);
    expect(presence.body.evidence.status).toBe(404);
    expect(presence.body.evidence.method).toBe('GET');
    expect(presence.creationOwnershipQualified).toBe(false);
    expect(presence.body.bytes.toString()).toContain('synthetic not found');
    await observation.assertPresence(presence);
    await originalGcpBootstrapSource.assertBody(presence.body);
    await expect(observation.assertPresence({ ...presence })).rejects.toThrow('Original');
    await observation.close();
    await expect(observation.assertPresence(presence)).rejects.toThrow('retired');
  });
}

test('Platform presence requires exact returned metadata and cannot become another target', async () => {
  const run = await fixture();
  const { openOriginalGcpBootstrapObservation } = await module();
  const observation = await openOriginalGcpBootstrapObservation(
    {
      store: run.store,
      origin: 'https://tenant.example.com',
      credential: 'synthetic-credential',
      targets: run.targets,
      assertOriginal: run.assertOriginal,
    },
    { fetcher: async () => Response.json({ metadata: { name: 'foreign-site', namespace: 'system' } }) },
  );
  await expect(observation.readPresence(run.targets[0])).rejects.toThrow('metadata');
  await expect(observation.readPresence(run.targets[0])).rejects.toThrow('retired');
});

test('Platform close settles pending reads and retains partial transport before returning', async () => {
  const run = await fixture();
  const { openOriginalGcpBootstrapObservation } = await module();
  const pulled = Promise.withResolvers<void>();
  let cancelled = false;
  let pulls = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (++pulls === 1) {
          controller.enqueue(Buffer.from('partial-owned-platform'));
          return;
        }
        pulled.resolve();
        return new Promise<void>(() => {});
      },
      cancel() {
        cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  const observation = await openOriginalGcpBootstrapObservation(
    {
      store: run.store,
      origin: 'https://tenant.example.com',
      credential: 'synthetic-credential',
      targets: run.targets,
      assertOriginal: run.assertOriginal,
    },
    { fetcher: async () => new Response(stream) },
  );
  const pending = observation.readPresence(run.targets[0]);
  pending.catch(() => {});
  await pulled.promise;
  const closed = observation.close();
  await expect(pending).rejects.toThrow();
  await closed;
  expect(cancelled).toBe(true);
  await expect(observation.read(run.targets[0])).rejects.toThrow('retired');
  const files = await readdir(run.store.directory);
  const body = files.find((name) => name.endsWith('.body.private.bin'));
  if (!body) throw new Error('Retained original partial Platform response required');
  const { readFile } = await import('node:fs/promises');
  expect(await readFile(join(run.store.directory, body), 'utf8')).toBe('partial-owned-platform');
});
