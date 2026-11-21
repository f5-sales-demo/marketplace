import { afterEach, expect, spyOn, test } from 'bun:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { chmod, lstat, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { ExpectedCeForwardingRoutes } from '../../../platform/src/ce/forwarding-route';
import type { ExpectedCeInterface } from '../../../platform/src/ce/interface-evidence';
import { canonicalSha256, canonicalStringify } from '../../src/ce/canonical';
import { publishImmutableCeReceipt, readImmutableCeReceipt } from '../../src/ce/immutable-receipt-publication';
import { createAzureOperationalAcquisitionCollector } from '../../src/ce/network-operational-provenance';
import { captureAzureNetworkUpdateInventory } from '../../src/ce/network-update';
import { compileAzureCePlan } from '../../src/ce/planner';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { networkUpdateFixture } from './network-update-fixture';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture(ha = false, forwarding = false) {
  const f = networkUpdateFixture(ha, 'terraform', true, false);
  if (forwarding) {
    const routes = (after: boolean) =>
      f.nodes.flatMap((_node, i) => [
        { node: i + 1, role: 'slo' as const, prefix: '10.20.0.0/24', routeType: 'LOCAL_ROUTE' as const },
        {
          node: i + 1,
          role: 'sli' as const,
          prefix: after ? '10.20.2.0/24' : '10.20.1.0/24',
          routeType: 'LOCAL_ROUTE' as const,
        },
      ]);
    f.plan = compileAzureCePlan(
      {
        ...f.plan.intent,
        routing: { ...f.plan.intent.routing, forwardingRoutes: { before: routes(false), after: routes(true) } },
      },
      f.current,
    );
  }
  const binding = azureUpgradeBinding(f.plan),
    inventory = await captureAzureNetworkUpdateInventory(f.plan, f.api),
    root = await mkdtemp(join(tmpdir(), 'operational-acquisition-'));
  roots.push(root);
  const store = await CeDeploymentStore.open(root, binding.owner),
    spec = { azure: { fixture: true } },
    state = { calls: 0, down: false, forwarding: [] as ExpectedCeForwardingRoutes[], foreignForwarding: false };
  const identity = {
    owner: binding.owner,
    planSha256: f.plan.planSha256,
    node: 1,
    siteName: f.plan.siteName,
    siteUid: 'site-uid',
    configurationSha256: 'b'.repeat(64),
    inventory,
    siteConfigurationSha256: canonicalSha256({ metadata: { name: f.plan.siteName, namespace: 'system' }, spec }),
  };
  const runtime = {
    engine: 'terraform',
    ownedSiteConfiguration(_binding: unknown, value: { metadata: unknown; spec: unknown }) {
      return { metadata: value.metadata, spec: value.spec };
    },
    async observeOwnedSite() {
      state.calls++;
      return { metadata: { name: f.plan.siteName, namespace: 'system' }, system_metadata: { uid: 'site-uid' }, spec };
    },
    async observeRegistrations(_binding: unknown, instances: Record<string, string>) {
      return {
        owner: binding.owner,
        siteName: f.plan.siteName,
        status: 'healthy',
        nodes: binding.nodes.map((node) => ({
          node,
          instanceId: instances[node],
          registration: `${node}-registration`,
          status: 'healthy',
          state: 'ONLINE',
        })),
      };
    },
    async observeAzureInterfaces(_binding: unknown, expected: ExpectedCeInterface[]) {
      return {
        status: state.down ? 'down' : 'observed',
        freshness: 'unqualified',
        canSatisfyInterfaceMutationGate: false,
        interfaces: expected.map((row) => ({
          ...row,
          device: row.role === 'slo' ? 'eth0' : 'eth1',
          interfaceName: `${row.node}-${row.role}`,
          linkUp: !(state.down && row.role === 'sli'),
          mtu: 1500,
          ipv4: null,
        })),
      };
    },
    async observeHealth() {
      return { status: 'unknown', privateRaw: 'SECRET_SENTINEL' };
    },
    async observeNodeReadiness() {
      return { status: 'unknown' };
    },
    async observeBgpSessions() {
      return { status: 'unknown' };
    },
    async observeBgpRoutes() {
      return { status: 'unknown' };
    },
    async observeForwardingRoutes(_binding: unknown, expected: ExpectedCeForwardingRoutes) {
      if (!forwarding) return { status: 'unknown' };
      state.forwarding.push(structuredClone(expected));
      // Explicit synthetic transport substrate. No live namespace or freshness is asserted.
      return {
        status: 'observed',
        owner: binding.owner,
        siteName: f.plan.siteName,
        siteUid: identity.siteUid,
        scope: 'reported-forwarding-interface',
        interfaceNamespace: 'unqualified',
        freshness: 'unqualified',
        operationalAcceptance: 'unknown',
        contractFingerprint: `sha256:${'a'.repeat(64)}`,
        reads: expected.interfaces.map((row) => ({
          method: 'POST',
          path: `/api/operate/namespaces/system/sites/${f.plan.siteName}/ver/simplified_routes`,
          body: { namespace: 'system', site: f.plan.siteName, node: row.node, family: 'INET4', [row.role]: {} },
        })),
        routes: expected.routes.map((route) => ({
          ...route,
          flags: [],
          interfaces: expected.interfaces
            .filter((iface) => iface.node === route.node && iface.role === route.role)
            .map((iface) => ({
              ...iface,
              mac: state.foreignForwarding ? '02:00:00:ff:00:99' : iface.mac,
              kind: 'local',
              reportedInterface: iface.device,
              matchedFields: ['device'],
            })),
        })),
      };
    },
  } as unknown as Parameters<typeof createAzureOperationalAcquisitionCollector>[1];
  const exec = f.api.exec;
  f.api.exec = (command, args, options) =>
    args.includes('show-effective-route-table')
      ? Promise.resolve({ exitCode: 0, stdout: JSON.stringify({ value: [] }), stderr: '' })
      : exec.call(f.api, command, args, options);
  const open = (trustedIssuerSha256?: string) =>
      createAzureOperationalAcquisitionCollector(f.plan, runtime, f.api, store, undefined, trustedIssuerSha256),
    collector = open();
  return { ...f, binding, identity, store, state, runtime, collector, open };
}
for (const ha of [false, true])
  test(`signed ${ha ? 'HA' : 'single'} acquisitions execute the actual collector without granting operational acceptance`, async () => {
    const f = await fixture(ha),
      reference = await f.collector.collect(f.identity, 'preflight'),
      value = await f.collector.authenticate(reference, f.identity, 'preflight', 'current');
    expect(f.state.calls).toBeGreaterThan(0);
    expect(value).toMatchObject({
      status: 'authenticated',
      scope: 'owning-network-operational-acquisition',
      mode: 'current',
      originalSampleFreshness: 'unqualified',
      operationalAcceptance: 'unknown',
      canSatisfyInterfaceMutationGate: false,
    });
    expect(value.readings.identity.interfaces).toHaveLength(ha ? 6 : 2);
    expect(value.readings.nodeHealth).toBe('unknown');
    expect(JSON.stringify(reference)).not.toContain('signingMaterial');
    expect(JSON.stringify(value)).not.toContain('SECRET_SENTINEL');
    expect(f.mutations()).toBe(0);
  });
test('historical acquisition preserves explicitly down and unqualified facts instead of promoting them', async () => {
  const f = await fixture(true);
  f.state.down = true;
  const receipt = await f.collector.collect(f.identity, 'preflight'),
    history = await f.open(receipt.issuerSha256).authenticate(receipt, f.identity, 'preflight', 'historical');
  expect(history.readings.identity).toMatchObject({
    status: 'down',
    freshness: 'unqualified',
    canSatisfyInterfaceMutationGate: false,
  });
  expect(history.operationalAcceptance).toBe('unknown');
  await expect(f.open(receipt.issuerSha256).authenticate(receipt, f.identity, 'preflight', 'current')).rejects.toThrow(
    'current acquisition unavailable',
  );
});
for (const field of ['owner', 'planSha256', 'identitySha256', 'invocationId', 'issuerSha256', 'publicationSha256'])
  test(`foreign ${field} cannot authenticate an owning acquisition`, async () => {
    const f = await fixture(),
      reference = await f.collector.collect(f.identity, 'preflight'),
      forged = structuredClone(reference);
    if (field === 'owner') forged.owner.account = 'example-foreign-account';
    else
      Object.assign(forged, {
        [field]: field === 'invocationId' ? '00000000-0000-4000-8000-000000000099' : 'e'.repeat(64),
      });
    await expect(f.collector.authenticate(forged, f.identity, 'preflight', 'historical')).rejects.toThrow();
  });
test('matching immutable storage hashes cannot authenticate modified original observations', async () => {
  const f = await fixture(),
    reference = await f.collector.collect(f.identity, 'preflight'),
    published = await readImmutableCeReceipt(f.store, 'azure-network-observation', reference.publicationSha256);
  const record = structuredClone(published.record) as {
    payload: { readings: { nodeHealth: string } };
    signature: string;
  };
  record.payload.readings.nodeHealth = 'healthy';
  const forged = await publishImmutableCeReceipt(f.store, 'azure-network-observation', record);
  expect(forged.publicationSha256).toBe(canonicalSha256(record));
  await expect(
    f.collector.authenticate(
      { ...reference, publicationSha256: forged.publicationSha256 },
      f.identity,
      'preflight',
      'historical',
    ),
  ).rejects.toThrow('original execution signature differs');
});
test('a correctly signed substituted issuer is not the trusted deployment issuer', async () => {
  const f = await fixture(),
    reference = await f.collector.collect(f.identity, 'preflight'),
    published = await readImmutableCeReceipt(f.store, 'azure-network-observation', reference.publicationSha256);
  const pair = generateKeyPairSync('ed25519'),
    issuer = await publishImmutableCeReceipt(f.store, 'azure-network-issuer', {
      schemaVersion: 1,
      kind: 'azure-network-operational-issuer',
      owner: f.store.owner,
      publicKey: pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64url'),
    });
  const record = structuredClone(published.record) as { payload: { issuerSha256: string }; signature: string };
  record.payload.issuerSha256 = issuer.publicationSha256;
  record.signature = sign(null, Buffer.from(canonicalStringify(record.payload)), pair.privateKey).toString('base64url');
  const forged = await publishImmutableCeReceipt(f.store, 'azure-network-observation', record);
  await expect(
    f.collector.authenticate(
      { ...reference, issuerSha256: issuer.publicationSha256, publicationSha256: forged.publicationSha256 },
      f.identity,
      'preflight',
      'historical',
    ),
  ).rejects.toThrow('receipt issuer differs');
});
test('private signing material retires and historical public verification still works', async () => {
  const f = await fixture(),
    receipt = await f.collector.collect(f.identity, 'preflight'),
    secretPath = join(f.store.directory, 'azure-network-observer-key.json');
  expect((await readFile(secretPath)).length).toBeGreaterThan(0);
  expect(await f.collector.retireSigningMaterial()).toMatchObject({
    status: 'retired',
    historicalPublicProofRetained: true,
  });
  await expect(readFile(secretPath)).rejects.toMatchObject({ code: 'ENOENT' });
  expect((await f.open(receipt.issuerSha256).authenticate(receipt, f.identity, 'preflight', 'historical')).status).toBe(
    'authenticated',
  );
  const calls = f.state.calls;
  await expect(f.open(receipt.issuerSha256).collect(f.identity, 'preflight')).rejects.toThrow('signing key retired');
  await expect(f.collector.authenticate(receipt, f.identity, 'preflight', 'current')).rejects.toThrow(
    'current acquisition unavailable',
  );
  expect(await f.collector.retireSigningMaterial()).toMatchObject({ status: 'retired' });
  expect(f.state.calls).toBe(calls);
});
for (const fault of ['mode', 'symlink'])
  test(`unsafe ${fault} signing custody cannot mint a receipt`, async () => {
    const f = await fixture();
    await f.collector.collect(f.identity, 'preflight');
    const path = join(f.store.directory, 'azure-network-observer-key.json');
    if (fault === 'mode') await chmod(path, 0o664);
    else {
      const bytes = await readFile(path),
        target = join(f.store.directory, 'example-key-target.json');
      await f.store.write('example-key-target.json', JSON.parse(bytes.toString()));
      await rm(path);
      await symlink(target, path);
    }
    await expect(f.collector.collect(f.identity, 'preflight')).rejects.toThrow('ownership is invalid');
  });
test('changed runtime callbacks reject before signing or private key creation', async () => {
  const f = await fixture();
  f.runtime.observeHealth = async () => ({ status: 'unknown' }) as never;
  await expect(f.collector.collect(f.identity, 'preflight')).rejects.toThrow('collaborator changed');
  await expect(readFile(join(f.store.directory, 'azure-network-observer-key.json'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
});
test('a caller cancellation bounds an ignoring observer and mints no signing material', async () => {
  const f = await fixture(),
    controller = new AbortController();
  f.runtime.observeHealth = () => {
    controller.abort(Error('cancel-acquisition'));
    return new Promise(() => {});
  };
  const collector = f.open();
  await expect(collector.collect(f.identity, 'preflight', controller.signal)).rejects.toThrow('cancel-acquisition');
  await expect(readFile(join(f.store.directory, 'azure-network-observer-key.json'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
});

test('expired local acquisition cannot pass current authentication, while signed history remains readable', async () => {
  const f = await fixture(),
    reference = await f.collector.collect(f.identity, 'preflight'),
    now = performance.now(),
    clock = spyOn(performance, 'now').mockReturnValue(now + 180001);
  try {
    await expect(f.collector.authenticate(reference, f.identity, 'preflight', 'current')).rejects.toThrow(
      'current acquisition unavailable',
    );
    expect(
      (await f.collector.authenticate(reference, f.identity, 'preflight', 'historical')).originalSampleFreshness,
    ).toBe('unqualified');
  } finally {
    clock.mockRestore();
  }
});
test('interrupted initial issuer publication resumes using the same private key', async () => {
  const f = await fixture(),
    write = f.store.write.bind(f.store);
  let failed = false;
  f.store.write = async (name, value, signal) => {
    if (name === 'azure-network-observer-issuer.json' && !failed) {
      failed = true;
      throw Error('injected-publication-interruption');
    }
    return write(name, value, signal);
  };
  const collector = f.open();
  await expect(collector.collect(f.identity, 'preflight')).rejects.toThrow('injected-publication-interruption');
  const key = await readFile(join(f.store.directory, 'azure-network-observer-key.json'));
  const reference = await collector.collect(f.identity, 'preflight');
  expect(await readFile(join(f.store.directory, 'azure-network-observer-key.json'))).toEqual(key);
  expect((await collector.authenticate(reference, f.identity, 'preflight', 'current')).status).toBe('authenticated');
});
test('interrupted key retirement resumes without reopening collection or losing historical verification', async () => {
  const f = await fixture(),
    remove = f.store.remove.bind(f.store);
  let failed = false;
  f.store.remove = async (name) => {
    if (name === 'azure-network-observer-key.json' && !failed) {
      failed = true;
      throw Error('injected-retirement-interruption');
    }
    return remove(name);
  };
  const collector = f.open(),
    reference = await collector.collect(f.identity, 'preflight');
  await expect(collector.retireSigningMaterial()).rejects.toThrow('injected-retirement-interruption');
  await expect(collector.collect(f.identity, 'preflight')).rejects.toThrow('signing key retired');
  expect((await collector.retireSigningMaterial()).status).toBe('retired');
  expect(
    (await f.open(reference.issuerSha256).authenticate(reference, f.identity, 'preflight', 'historical')).status,
  ).toBe('authenticated');
});
test('a forged retirement marker cannot authorize removal of a private signing key', async () => {
  const f = await fixture(),
    reference = await f.collector.collect(f.identity, 'preflight');
  await f.store.write('azure-network-observer-retired.json', {
    payload: {
      schemaVersion: 1,
      kind: 'azure-network-observer-key-retired',
      owner: f.store.owner,
      issuerSha256: reference.issuerSha256,
    },
    signature: Buffer.alloc(64).toString('base64url'),
  });
  await expect(f.collector.retireSigningMaterial()).rejects.toThrow('key retirement provenance differs');
  expect((await readFile(join(f.store.directory, 'azure-network-observer-key.json'))).length).toBeGreaterThan(0);
});

for (const purpose of ['preflight', 'restored', 'final'] as const)
  test(`signed ${purpose} acquisition cannot be replayed as another serial boundary`, async () => {
    const f = await fixture(),
      reference = await f.collector.collect(f.identity, purpose);
    expect(reference.purpose).toBe(purpose);
    expect((await f.collector.authenticate(reference, f.identity, purpose, 'current')).status).toBe('authenticated');
    const other = purpose === 'preflight' ? 'restored' : 'preflight';
    await expect(f.collector.authenticate(reference, f.identity, other, 'historical')).rejects.toThrow(
      'receipt reference identity differs',
    );
    await expect(
      f.collector.authenticate({ ...reference, purpose: other }, f.identity, other, 'historical'),
    ).rejects.toThrow('original execution signature differs');
  });

test('fresh-process historical authentication rejects a substituted mutable issuer anchor', async () => {
  const f = await fixture(),
    reference = await f.collector.collect(f.identity, 'preflight');
  const published = await readImmutableCeReceipt(f.store, 'azure-network-observation', reference.publicationSha256);
  const pair = generateKeyPairSync('ed25519');
  const issuer = await publishImmutableCeReceipt(f.store, 'azure-network-issuer', {
    schemaVersion: 1,
    kind: 'azure-network-operational-issuer',
    owner: f.store.owner,
    publicKey: pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64url'),
  });
  const record = structuredClone(published.record) as { payload: { issuerSha256: string }; signature: string };
  record.payload.issuerSha256 = issuer.publicationSha256;
  record.signature = sign(null, Buffer.from(canonicalStringify(record.payload)), pair.privateKey).toString('base64url');
  const forged = await publishImmutableCeReceipt(f.store, 'azure-network-observation', record);
  await f.store.write('azure-network-observer-issuer.json', {
    schemaVersion: 1,
    owner: f.store.owner,
    issuerSha256: issuer.publicationSha256,
  });
  for (const reopened of [f.open(), f.open(reference.issuerSha256)])
    await expect(
      reopened.authenticate(
        { ...reference, issuerSha256: issuer.publicationSha256, publicationSha256: forged.publicationSha256 },
        f.identity,
        'preflight',
        'historical',
      ),
    ).rejects.toThrow('pinned issuer differs');
});

test('reopened historical authentication needs a retained original pin and does not read one from its reference', async () => {
  const f = await fixture(),
    reference = await f.collector.collect(f.identity, 'preflight');
  const calls = f.state.calls;
  await expect(f.open().authenticate(reference, f.identity, 'preflight', 'historical')).rejects.toThrow(
    'pinned issuer differs',
  );
  await expect(f.open('e'.repeat(64)).authenticate(reference, f.identity, 'preflight', 'historical')).rejects.toThrow(
    'pinned issuer differs',
  );
  expect(
    (await f.open(reference.issuerSha256).authenticate(reference, f.identity, 'preflight', 'historical')).status,
  ).toBe('authenticated');
  expect(f.state.calls).toBe(calls);
  expect(f.mutations()).toBe(0);
});
test('missing retained original issuer publication cannot be replaced during collection or key retirement', async () => {
  const f = await fixture(),
    reference = await f.collector.collect(f.identity, 'preflight');
  await f.store.remove('azure-network-observer-issuer.json');
  await f.store.remove(`azure-network-issuer-${reference.issuerSha256}.json`);
  const reopened = f.open(reference.issuerSha256);
  await expect(reopened.collect(f.identity, 'preflight')).rejects.toThrow();
  await expect(reopened.retireSigningMaterial()).rejects.toThrow();
  expect((await readFile(join(f.store.directory, 'azure-network-observer-key.json'))).length).toBeGreaterThan(0);
});
async function publicSessionFixture(ha = false, forwarding = false) {
  const f = await fixture(ha, forwarding),
    directory = await mkdtemp(join(tmpdir(), 'operational-public-session-'));
  roots.push(directory);
  let next = 0;
  const paths = new Map<string, string>();
  const session = {
    getSessionId: () => directory,
    getArtifactsDir: () => directory,
    getArtifactPath: async (id: string) => paths.get(id) ?? null,
    async saveArtifact(content: string, type: string) {
      const id = String(++next),
        path = join(directory, `${id}.${type}.log`);
      await writeFile(path, content, { mode: 0o600 });
      paths.set(id, path);
      return id;
    },
  };
  await (await import('../../src/ce/artifacts')).savePlanArtifact(
    session,
    f.plan,
    (await import('./fixtures')).observation,
  );
  return { ...f, directory, session, paths };
}
function publicIssuerArtifact(f: Awaited<ReturnType<typeof publicSessionFixture>>) {
  const paths = [...f.paths.values()].filter((path) => path.endsWith('.azure-ce-network-operational-issuer.log'));
  if (paths.length !== 1 || typeof paths[0] !== 'string')
    throw Error('fixture issuer publication is missing or ambiguous');
  return paths[0];
}
async function openPublicAcquisition(f: Awaited<ReturnType<typeof publicSessionFixture>>) {
  const factory = (await import('../../src/ce/network-operational-session')).createAzureOperationalAcquisitionSession;
  return factory(f.plan, f.runtime, f.api, f.store, f.session);
}
test('owning native session retains the actual issuer before acknowledgement and reopens its original history', async () => {
  const f = await publicSessionFixture(),
    collect = await openPublicAcquisition(f);
  const reference = await collect.collect(f.identity, 'preflight');
  const files = [...f.paths.values()].filter((p) => p.endsWith('.azure-ce-network-operational-issuer.log'));
  expect(files).toHaveLength(1);
  const record = JSON.parse(await readFile(files[0], 'utf8'));
  expect(record).toMatchObject({
    owner: f.store.owner,
    planSha256: f.plan.planSha256,
    issuerSha256: reference.issuerSha256,
  });
  expect(JSON.stringify(record)).not.toContain('signingMaterial');
  const reopened = await openPublicAcquisition(f);
  expect((await reopened.authenticate(reference, f.identity, 'preflight', 'historical')).status).toBe('authenticated');
  await expect(reopened.authenticate(reference, f.identity, 'preflight', 'current')).rejects.toThrow(
    'current acquisition unavailable',
  );
  expect(f.mutations()).toBe(0);
});
test('owning public pin survives private signing-key retirement', async () => {
  const f = await publicSessionFixture(),
    collect = await openPublicAcquisition(f),
    reference = await collect.collect(f.identity, 'preflight');
  await collect.retireSigningMaterial();
  expect(
    (await (await openPublicAcquisition(f)).authenticate(reference, f.identity, 'preflight', 'historical')).status,
  ).toBe('authenticated');
  await expect(readFile(join(f.store.directory, 'azure-network-observer-key.json'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
});
test('native session conflicts and unsafe issuer artifacts reject before collector work', async () => {
  const f = await publicSessionFixture(),
    collect = await openPublicAcquisition(f);
  await collect.collect(f.identity, 'preflight');
  const path = publicIssuerArtifact(f);
  const record = JSON.parse(await readFile(path, 'utf8')),
    calls = f.state.calls;
  await writeFile(
    join(f.directory, 'conflict.azure-ce-network-operational-issuer.log'),
    JSON.stringify({ ...record, issuerSha256: 'e'.repeat(64) }),
    { mode: 0o600 },
  );
  await expect(openPublicAcquisition(f)).rejects.toThrow();
  expect(f.state.calls).toBe(calls);
});
test('unpinned private issuer is not enrolled from storage or a supplied reference', async () => {
  const f = await publicSessionFixture(),
    reference = await f.collector.collect(f.identity, 'preflight');
  const calls = f.state.calls;
  await expect(openPublicAcquisition(f)).rejects.toThrow('original public issuer pin unavailable');
  expect(reference.issuerSha256).toHaveLength(64);
  expect(f.state.calls).toBe(calls);
});
test('headless native session must persist its issuer rather than succeeding in memory', async () => {
  const f = await publicSessionFixture();
  f.session.getArtifactsDir = () => null as unknown as string;
  await expect(openPublicAcquisition(f)).rejects.toThrow('persistent native session required');
  await expect(readFile(join(f.store.directory, 'azure-network-observer-key.json'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
  expect(f.mutations()).toBe(0);
});
test('interruption after public issuer publication resumes its original key and pin before private pointer creation', async () => {
  const f = await publicSessionFixture(),
    write = f.store.write.bind(f.store);
  let failed = false;
  f.store.write = async (name, value, signal) => {
    if (name === 'azure-network-observer-issuer.json' && !failed) {
      failed = true;
      throw Error('injected-pointer-interruption');
    }
    return write(name, value, signal);
  };
  const collect = await openPublicAcquisition(f);
  await expect(collect.collect(f.identity, 'preflight')).rejects.toThrow('injected-pointer-interruption');
  const key = await readFile(join(f.store.directory, 'azure-network-observer-key.json'));
  const reopened = await openPublicAcquisition(f),
    reference = await reopened.collect(f.identity, 'preflight');
  expect(await readFile(join(f.store.directory, 'azure-network-observer-key.json'))).toEqual(key);
  expect((await reopened.authenticate(reference, f.identity, 'preflight', 'current')).status).toBe('authenticated');
  expect([...f.paths.values()].filter((p) => p.endsWith('.azure-ce-network-operational-issuer.log'))).toHaveLength(1);
});
test('changing the public issuer bytes after factory construction blocks current authentication', async () => {
  const f = await publicSessionFixture(),
    collect = await openPublicAcquisition(f),
    reference = await collect.collect(f.identity, 'preflight');
  const path = publicIssuerArtifact(f);
  const original = JSON.parse(await readFile(path, 'utf8'));
  await writeFile(path, JSON.stringify({ ...original, issuerSha256: 'e'.repeat(64) }));
  await expect(collect.authenticate(reference, f.identity, 'preflight', 'current')).rejects.toThrow();
});
for (const fault of ['mode', 'symlink', 'duplicate-json', 'unresolved-source', 'wrong-engine'] as const)
  test(`public issuer pin rejects ${fault} before collector activity`, async () => {
    const f = await publicSessionFixture(),
      collect = await openPublicAcquisition(f);
    await collect.collect(f.identity, 'preflight');
    const path = publicIssuerArtifact(f);
    const raw = await readFile(path, 'utf8'),
      row = JSON.parse(raw),
      calls = f.state.calls;
    if (fault === 'mode') await chmod(path, 0o664);
    if (fault === 'symlink') {
      const target = join(f.directory, 'example-issuer-target.json');
      await writeFile(target, raw, { mode: 0o600 });
      await rm(path);
      await symlink(target, path);
    }
    if (fault === 'duplicate-json')
      await writeFile(path, raw.replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1'));
    if (fault === 'unresolved-source') await writeFile(path, JSON.stringify({ ...row, planSha256: 'e'.repeat(64) }));
    if (fault === 'wrong-engine') await writeFile(path, JSON.stringify({ ...row, engine: 'native' }));
    await expect(openPublicAcquisition(f)).rejects.toThrow();
    expect(f.state.calls).toBe(calls);
    expect(f.mutations()).toBe(0);
  });
test('issuer publication order is native and an unacknowledged publication cannot return an acquisition', async () => {
  const f = await publicSessionFixture(),
    save = f.session.saveArtifact.bind(f.session);
  let issuerWrites = 0;
  f.session.saveArtifact = async (content, type) => {
    if (type === 'azure-ce-network-operational-issuer') {
      issuerWrites++;
      await expect(f.store.read('azure-network-observer-issuer.json')).rejects.toMatchObject({ code: 'ENOENT' });
      await save(content, type);
      return undefined as unknown as string;
    }
    return save(content, type);
  };
  const collect = await openPublicAcquisition(f);
  await expect(collect.collect(f.identity, 'preflight')).rejects.toThrow(
    'original issuer publication not acknowledged',
  );
  expect(issuerWrites).toBe(1);
  await expect(f.store.read('azure-network-observer-issuer.json')).rejects.toMatchObject({ code: 'ENOENT' });
  const reopened = await openPublicAcquisition(f),
    reference = await reopened.collect(f.identity, 'preflight');
  expect((await reopened.authenticate(reference, f.identity, 'preflight', 'current')).status).toBe('authenticated');
  expect(issuerWrites).toBe(1);
});

for (const [directoryMode, fileMode] of [
  [0o755, 0o644],
  [0o750, 0o640],
])
  test(`owning public artifacts may be readable without permitting writes ${directoryMode}/${fileMode}`, async () => {
    const f = await publicSessionFixture();
    await chmod(f.directory, directoryMode);
    const writer = f.session.saveArtifact.bind(f.session);
    f.session.saveArtifact = async (content, type) => {
      const id = await writer(content, type),
        path = await f.session.getArtifactPath(id);
      if (!path) throw Error('missing original publication');
      await chmod(path, fileMode);
      return id;
    };
    const collector = await openPublicAcquisition(f),
      reference = await collector.collect(f.identity, 'preflight');
    const reopened = await openPublicAcquisition(f);
    expect((await reopened.authenticate(reference, f.identity, 'preflight', 'historical')).status).toBe(
      'authenticated',
    );
    expect((await lstat(publicIssuerArtifact(f))).mode & 0o777).toBe(fileMode);
    expect((await lstat(f.store.directory)).mode & 0o777).toBe(0o700);
    expect((await lstat(join(f.store.directory, 'azure-network-observer-key.json'))).mode & 0o777).toBe(0o600);
    await reopened.retireSigningMaterial();
    expect((await reopened.authenticate(reference, f.identity, 'preflight', 'historical')).status).toBe(
      'authenticated',
    );
    expect(f.mutations()).toBe(0);
  });
for (const directoryMode of [0o775, 0o777])
  test(`public native directory rejects non-owner write permission ${directoryMode}`, async () => {
    const f = await publicSessionFixture();
    await chmod(f.directory, directoryMode);
    await expect(openPublicAcquisition(f)).rejects.toThrow('native session directory custody differs');
    expect(f.state.calls).toBe(0);
    expect(f.mutations()).toBe(0);
  });
test('public-read permission never permits readable private signing storage', async () => {
  const f = await publicSessionFixture();
  await chmod(f.directory, 0o755);
  await chmod(f.store.directory, 0o755);
  await expect(openPublicAcquisition(f)).rejects.toThrow();
  expect(f.state.calls).toBe(0);
  expect(f.mutations()).toBe(0);
});
test('public directory permission drift blocks an existing acquisition session', async () => {
  const f = await publicSessionFixture(),
    collector = await openPublicAcquisition(f);
  const reference = await collector.collect(f.identity, 'preflight');
  const calls = f.state.calls;
  await chmod(f.directory, 0o775);
  await expect(collector.authenticate(reference, f.identity, 'preflight', 'current')).rejects.toThrow(
    'native session directory custody differs',
  );
  expect(f.state.calls).toBe(calls);
  expect(f.mutations()).toBe(0);
});

test('retirement inventory authenticates owned unknown/down proof and preserves it after key retirement', async () => {
  const f = await fixture();
  f.state.down = true;
  const references = [];
  for (const purpose of ['preflight', 'restored', 'final'] as const)
    references.push(await f.collector.collect(f.identity, purpose));
  const before = await f.collector.authenticateRetirementInventory();
  expect(before.status).toBe('authenticated');
  expect(before.operationalAcceptance).toBe('unknown');
  expect(before.canSatisfyInterfaceMutationGate).toBe(false);
  expect(before.artifacts.filter((file) => file.schema === 'azure-network-operational-acquisition-v1')).toHaveLength(3);
  const signing = (await f.store.read('azure-network-observer-key.json')) as { signingMaterial: string };
  expect(JSON.stringify(before)).not.toContain(signing.signingMaterial);
  const retired = await f.collector.retireSigningMaterial();
  expect(retired.artifactInventory.signingMaterialPresent).toBe(false);
  for (const reference of references)
    expect(
      (await f.open(reference.issuerSha256).authenticate(reference, f.identity, reference.purpose, 'historical'))
        .readings.identity.interfaces,
    ).toBeDefined();
  expect(f.mutations()).toBe(0);
});
for (const fault of ['signature', 'source', 'issuer', 'pending', 'unclassified'] as const)
  test(`retirement refuses ${fault} proof before signing or deleting any material`, async () => {
    const f = await fixture(),
      reference = await f.collector.collect(f.identity, 'preflight');
    const publication = await readImmutableCeReceipt(f.store, 'azure-network-observation', reference.publicationSha256);
    if (fault === 'signature' || fault === 'source') {
      const record = structuredClone(publication.record) as {
        payload: { identity: { planSha256: string } };
        signature: string;
      };
      if (fault === 'signature') record.signature = Buffer.alloc(64).toString('base64url');
      else record.payload.identity.planSha256 = 'f'.repeat(64);
      await publishImmutableCeReceipt(f.store, 'azure-network-observation', record);
    } else if (fault === 'issuer') {
      await publishImmutableCeReceipt(f.store, 'azure-network-issuer', { foreign: true });
    } else {
      await f.store.write(
        fault === 'pending'
          ? 'azure-network-observation-unresolved.pending'
          : 'azure-network-observer-unclassified.json',
        { unknown: true },
      );
    }
    const key = await readFile(join(f.store.directory, 'azure-network-observer-key.json'));
    await expect(f.collector.retireSigningMaterial()).rejects.toThrow();
    expect(await readFile(join(f.store.directory, 'azure-network-observer-key.json'))).toEqual(key);
    await expect(f.store.read('azure-network-observer-retired.json')).rejects.toMatchObject({ code: 'ENOENT' });
  });
test('public session authenticates the original source for retirement inventory and retains public proof', async () => {
  const f = await publicSessionFixture(),
    collector = await openPublicAcquisition(f);
  const reference = await collector.collect(f.identity, 'preflight');
  expect(
    (await collector.authenticateRetirementInventory()).artifacts.some(
      (file) => file.path === `azure-network-observation-${reference.publicationSha256}.json`,
    ),
  ).toBe(true);
  expect((await collector.retireSigningMaterial()).artifactInventory.operationalAcceptance).toBe('unknown');
  expect((await (await openPublicAcquisition(f)).authenticateRetirementInventory()).signingMaterialPresent).toBe(false);
});

for (const fault of ['inode', 'namespace', 'unavailable-source', 'cancel'] as const)
  test(`retirement rechecks ${fault} across original-source authentication without removing signing material`, async () => {
    const f = await fixture(),
      reference = await f.collector.collect(f.identity, 'preflight');
    const path = join(f.store.directory, `azure-network-observation-${reference.publicationSha256}.json`);
    const key = await readFile(join(f.store.directory, 'azure-network-observer-key.json'));
    const controller = new AbortController();
    let changed = false;
    const collector = createAzureOperationalAcquisitionCollector(
      f.plan,
      f.runtime,
      f.api,
      f.store,
      undefined,
      reference.issuerSha256,
      undefined,
      async (digest) => {
        expect(digest).toBe(f.plan.planSha256);
        if (!changed) {
          changed = true;
          if (fault === 'inode') {
            const original = await readFile(path);
            await rm(path);
            await writeFile(path, original, { mode: 0o600 });
          } else if (fault === 'namespace') {
            await f.store.write('azure-network-observer-unclassified.json', { unknown: true });
          } else if (fault === 'unavailable-source') throw Error('original-source-unavailable');
          else controller.abort(Error('cancel-retirement-source'));
        }
        return f.plan;
      },
    );
    await expect(collector.retireSigningMaterial(controller.signal)).rejects.toThrow();
    expect(changed).toBe(true);
    expect(await readFile(join(f.store.directory, 'azure-network-observer-key.json'))).toEqual(key);
    await expect(f.store.read('azure-network-observer-retired.json')).rejects.toMatchObject({ code: 'ENOENT' });
  });
test('public retirement cannot substitute a missing original public plan with an in-memory source', async () => {
  const f = await publicSessionFixture(),
    collector = await openPublicAcquisition(f);
  await collector.collect(f.identity, 'preflight');
  const original = [...f.paths.values()].find((path) => path.endsWith('.azure-ce-plan.log'));
  expect(original).toBeDefined();
  if (original === undefined) throw Error('fixture public source missing');
  await rm(original);
  const key = await readFile(join(f.store.directory, 'azure-network-observer-key.json'));
  await expect(collector.retireSigningMaterial()).rejects.toThrow();
  expect(await readFile(join(f.store.directory, 'azure-network-observer-key.json'))).toEqual(key);
});

for (const purpose of ['preflight', 'restored', 'final'] as const)
  test(`HA ${purpose} six-interface unknown/down proof survives authenticated retirement`, async () => {
    const f = await fixture(true);
    f.state.down = true;
    const reference = await f.collector.collect(f.identity, purpose);
    const inventory = await f.collector.authenticateRetirementInventory();
    expect(
      inventory.artifacts.filter((file) => file.schema === 'azure-network-operational-acquisition-v1'),
    ).toHaveLength(1);
    expect((await f.collector.retireSigningMaterial()).artifactInventory.signingMaterialPresent).toBe(false);
    const historical = await f.open(reference.issuerSha256).authenticate(reference, f.identity, purpose, 'historical');
    expect(historical.readings.identity.interfaces).toHaveLength(6);
    expect(historical.operationalAcceptance).toBe('unknown');
    expect(historical.canSatisfyInterfaceMutationGate).toBe(false);
    expect(f.mutations()).toBe(0);
  });

async function retirementFixture() {
  const f = await publicSessionFixture();
  await (await import('../../src/ce/artifacts')).savePlanArtifact(
    f.session,
    f.original,
    (await import('./fixtures')).observation,
  );
  const open = () =>
    import('../../src/ce/network-operational-retirement-session').then((module) =>
      module.createAzureOperationalRetirementSession(f.original, f.runtime, f.api, f.store, f.session),
    );
  return { ...f, openRetirement: open };
}
test('deployment teardown reopens the original public collector and retires unknown proof without another observation', async () => {
  const f = await retirementFixture(),
    acquisition = await openPublicAcquisition(f);
  const reference = await acquisition.collect(f.identity, 'preflight'),
    calls = f.state.calls;
  const result = await (await f.openRetirement()).retireSigningMaterial();
  expect(result.status).toBe('retired');
  expect(result.artifactInventory).toMatchObject({
    observerState: 'present',
    signingMaterialPresent: false,
    operationalAcceptance: 'unknown',
    canSatisfyInterfaceMutationGate: false,
  });
  expect(f.state.calls).toBe(calls);
  expect(f.mutations()).toBe(0);
  expect(reference.issuerSha256).toHaveLength(64);
});
async function retiredPublicFixture() {
  const f = await retirementFixture(),
    acquisition = await openPublicAcquisition(f);
  const reference = await acquisition.collect(f.identity, 'preflight');
  const retired = await acquisition.retireSigningMaterial();
  return { ...f, reference, retired: retired.artifactInventory };
}
test('original public acquisition authenticates history after actual teardown retirement', async () => {
  const f = await retirementFixture(),
    acquisition = await openPublicAcquisition(f);
  const reference = await acquisition.collect(f.identity, 'preflight');
  await (await f.openRetirement()).retireSigningMaterial();
  const historical = await acquisition.authenticate(reference, f.identity, 'preflight', 'historical');
  expect(historical.status).toBe('authenticated');
  expect(historical.operationalAcceptance).toBe('unknown');
});
test('actual original retirement session resumes already retired proof', async () => {
  const f = await retiredPublicFixture(),
    calls = f.state.calls;
  const result = await (await f.openRetirement()).retireSigningMaterial();
  expect(result.status).toBe('retired');
  expect(result.artifactInventory.signingMaterialPresent).toBe(false);
  expect(f.state.calls).toBe(calls);
});
test('an unused owned observer family is independently absent and does not create keys, pins or cloud calls', async () => {
  const f = await retirementFixture(),
    calls = f.cloudCalls();
  const retirement = await f.openRetirement();
  const result = await retirement.retireSigningMaterial();
  expect(result).toMatchObject({
    status: 'absent',
    artifactInventory: {
      observerState: 'absent',
      issuerSha256: null,
      artifacts: [],
      signingMaterialPresent: false,
      operationalAcceptance: 'unknown',
    },
  });
  expect(f.state.calls).toBe(0);
  expect(f.cloudCalls()).toBe(calls);
  expect(f.mutations()).toBe(0);
  await expect(f.store.read('azure-network-observer-key.json')).rejects.toMatchObject({ code: 'ENOENT' });
  expect(
    [...f.paths.values()].filter((path) => path.endsWith('.azure-ce-network-operational-issuer.log')),
  ).toHaveLength(0);
});
for (const fault of [
  'unbound-private-family',
  'lost-original',
  'lost-network-source',
  'conflicting-public-pin',
] as const)
  test(`teardown preserves signing material for ${fault}`, async () => {
    const f = await retirementFixture(),
      acquisition = await openPublicAcquisition(f);
    await acquisition.collect(f.identity, 'preflight');
    const key = await readFile(join(f.store.directory, 'azure-network-observer-key.json'));
    if (fault === 'unbound-private-family') await rm(publicIssuerArtifact(f));
    else if (fault === 'lost-original' || fault === 'lost-network-source') {
      const digest = fault === 'lost-original' ? f.original.planSha256 : f.plan.planSha256;
      for (const path of f.paths.values()) {
        if (path.endsWith('.azure-ce-plan.log') && JSON.parse(await readFile(path, 'utf8')).plan.planSha256 === digest)
          await rm(path);
      }
    } else {
      const source = JSON.parse(await readFile(publicIssuerArtifact(f), 'utf8'));
      await f.session.saveArtifact(
        JSON.stringify({ ...source, issuerSha256: 'e'.repeat(64) }),
        'azure-ce-network-operational-issuer',
      );
    }
    await expect(f.openRetirement()).rejects.toThrow();
    expect(await readFile(join(f.store.directory, 'azure-network-observer-key.json'))).toEqual(key);
  });
test('retirement absence cannot hide a late private observer family', async () => {
  const f = await retirementFixture(),
    retirement = await f.openRetirement();
  await f.store.write('azure-network-observer-unclassified.json', { unknown: true });
  await expect(retirement.retireSigningMaterial()).rejects.toThrow('no original public issuer');
  expect(await f.store.read('azure-network-observer-unclassified.json')).toEqual({ unknown: true });
});
test('typed parent enrollment rejects a real original session while its signing key is live', async () => {
  const f = await retirementFixture(),
    acquisition = await openPublicAcquisition(f);
  await acquisition.collect(f.identity, 'preflight');
  const live = await acquisition.authenticateRetirementInventory();
  const retirement = await f.openRetirement();
  const collect = (await import('../../src/ce/network-operational-parent-disposition'))
    .collectAzureOperationalParentDispositions;
  await expect(collect(f.original, f.store, f.session, live.artifacts, retirement)).rejects.toThrow(
    'signing material still present',
  );
  expect(await f.store.read('azure-network-observer-key.json')).toBeDefined();
});
test('typed parent enrollment preserves exact retired native file identities without operational acceptance', async () => {
  const f = await retiredPublicFixture(),
    retirement = await f.openRetirement();
  const collect = (await import('../../src/ce/network-operational-parent-disposition'))
    .collectAzureOperationalParentDispositions;
  const calls = f.state.calls,
    decisions = await collect(f.original, f.store, f.session, f.retired.artifacts, retirement);
  expect(decisions).toHaveLength(f.retired.artifacts.length);
  expect(decisions.every((file) => file.action === 'preserve')).toBe(true);
  expect(decisions.map((file) => file.semanticProvenanceSha256)).toEqual(
    f.retired.artifacts.map((file) => file.semanticProvenanceSha256),
  );
  expect(f.state.calls).toBe(calls);
  expect(f.mutations()).toBe(0);
});
for (const fault of ['fake-session', 'missing', 'duplicate', 'identity', 'bytes', 'packet', 'unclassified'] as const)
  test(`typed parent enrollment rejects ${fault} against actual original retired proof`, async () => {
    const f = await retiredPublicFixture(),
      retirement = await f.openRetirement();
    const collect = (await import('../../src/ce/network-operational-parent-disposition'))
      .collectAzureOperationalParentDispositions;
    const files = structuredClone(f.retired.artifacts);
    if (fault === 'missing') files.shift();
    else if (fault === 'duplicate') files.push(structuredClone(files[0]));
    else if (fault === 'identity') files[0].identity = 'foreign';
    else if (fault === 'bytes') files[0].sha256 = 'e'.repeat(64);
    else if (fault === 'packet') files[0].packetSha256 = 'e'.repeat(64);
    else if (fault === 'unclassified') files.push({ ...files[0], path: 'azure-network-observer-unclassified.json' });
    await expect(
      collect(f.original, f.store, f.session, files, fault === 'fake-session' ? { ...retirement } : retirement),
    ).rejects.toThrow();
    expect(f.mutations()).toBe(0);
  });
test('forged retirement-session methods cannot supply typed parent disposition authority', async () => {
  const f = await retirementFixture();
  const collect = (await import('../../src/ce/network-operational-parent-disposition'))
    .collectAzureOperationalParentDispositions;
  const counterfeit = {
    authenticateRetirementInventory: async () => ({ artifacts: [], signingMaterialPresent: false }),
    retireSigningMaterial: async () => ({ status: 'retired' }),
  };
  await expect(
    collect(f.original, f.store, f.session, [], counterfeit as unknown as Parameters<typeof collect>[4]),
  ).rejects.toThrow('genuine owning retirement session');
});

test('actual operational acceptance adapter authenticates collected facts and preserves missing qualification', async () => {
  const f = await publicSessionFixture(),
    session = await openPublicAcquisition(f);
  const { createAzureNetworkOperationalAcceptance } = await import('../../src/ce/network-operational-acceptance');
  const adapter = createAzureNetworkOperationalAcceptance(session);
  const receipt = await adapter.collectAcceptance(f.identity, 'preflight');
  const reading = await adapter.inspect(receipt, f.identity, 'current');
  expect(reading.status).toBe('unknown');
  expect(reading.interfaceState).toBe('observed');
  expect(reading.missing).toContain('original-sample-freshness');
  expect(reading.missing).toContain('selected-node-readiness');
  await expect(adapter.qualifyAcceptance(receipt, f.identity, 'current')).rejects.toThrow(
    'Operational evidence remains unqualified',
  );
  const reopened = createAzureNetworkOperationalAcceptance(await openPublicAcquisition(f));
  expect((await reopened.inspect(receipt, f.identity, 'historical')).status).toBe('unknown');
  await expect(reopened.inspect(receipt, f.identity, 'current')).rejects.toThrow('current acquisition unavailable');
  expect(f.mutations()).toBe(0);
});

test('actual operational acceptance adapter preserves explicit down and rejects foreign signed identity', async () => {
  const f = await publicSessionFixture();
  f.state.down = true;
  const { createAzureNetworkOperationalAcceptance } = await import('../../src/ce/network-operational-acceptance');
  const adapter = createAzureNetworkOperationalAcceptance(await openPublicAcquisition(f));
  const receipt = await adapter.collectAcceptance(f.identity, 'preflight');
  expect((await adapter.inspect(receipt, f.identity, 'current')).interfaceState).toBe('down');
  const foreign = structuredClone(receipt);
  foreign.identitySha256 = 'e'.repeat(64);
  await expect(adapter.qualifyAcceptance(foreign, f.identity, 'historical')).rejects.toThrow();
  expect(f.mutations()).toBe(0);
});

for (const purpose of ['preflight', 'restored', 'final'] as const)
  test(`public signed HA ${purpose} acquisition resolves saved forwarding intent without external expectations`, async () => {
    const f = await publicSessionFixture(true, true);
    f.identity.node = 2;
    const acquisition = await openPublicAcquisition(f);
    const reference = await acquisition.collect(f.identity, purpose);
    const value = await acquisition.authenticate(reference, f.identity, purpose, 'current');
    expect(f.state.forwarding).toHaveLength(2);
    expect(f.state.forwarding[0].interfaces).toHaveLength(6);
    expect(f.state.forwarding[0].routes.filter((row) => row.role === 'sli').map((row) => row.prefix)).toEqual(
      purpose === 'preflight'
        ? ['10.20.2.0/24', '10.20.1.0/24', '10.20.1.0/24']
        : ['10.20.2.0/24', '10.20.2.0/24', '10.20.1.0/24'],
    );
    expect(value.readings.forwarding).toMatchObject({
      status: 'observed',
      routeCount: 6,
      observationRequests: 12,
      freshness: 'unqualified',
      interfaceNamespace: 'unqualified',
      operationalAcceptance: 'unknown',
    });
    expect(value.operationalAcceptance).toBe('unknown');
    expect(value.canSatisfyInterfaceMutationGate).toBe(false);
    const history = await (await openPublicAcquisition(f)).authenticate(reference, f.identity, purpose, 'historical');
    expect(history.readings.forwarding).toEqual(value.readings.forwarding);
    expect(f.state.forwarding).toHaveLength(2);
    expect(f.mutations()).toBe(0);
  });
test('public signed acquisition retains unknown for a foreign reported forwarding identity', async () => {
  const f = await publicSessionFixture(true, true);
  f.state.foreignForwarding = true;
  const acquisition = await openPublicAcquisition(f),
    reference = await acquisition.collect(f.identity, 'preflight');
  const value = await acquisition.authenticate(reference, f.identity, 'preflight', 'current');
  expect(value.readings.forwarding.status).toBe('unknown');
  expect(value.operationalAcceptance).toBe('unknown');
  expect(f.mutations()).toBe(0);
});

test('network acquisition rejects a coerced purpose before reading evidence or creating an issuer', async () => {
  const f = await fixture();
  await expect(
    Reflect.apply(f.collector.collect, f.collector, [f.identity, { toString: () => 'preflight' }]),
  ).rejects.toThrow(/purpose/);
  expect(f.state.calls).toBe(0);
  await expect(f.store.read('azure-network-observer-issuer.json')).rejects.toThrow();
});
