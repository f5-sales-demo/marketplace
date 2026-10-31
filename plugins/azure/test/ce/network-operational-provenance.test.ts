import { afterEach, expect, spyOn, test } from 'bun:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { ExpectedCeInterface } from '../../../platform/src/ce/interface-evidence';
import { canonicalSha256, canonicalStringify } from '../../src/ce/canonical';
import { publishImmutableCeReceipt, readImmutableCeReceipt } from '../../src/ce/immutable-receipt-publication';
import { createAzureOperationalAcquisitionCollector } from '../../src/ce/network-operational-provenance';
import { captureAzureNetworkUpdateInventory } from '../../src/ce/network-update';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { networkUpdateFixture } from './network-update-fixture';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture(ha = false) {
  const f = networkUpdateFixture(ha, 'terraform', true, false),
    binding = azureUpgradeBinding(f.plan),
    inventory = await captureAzureNetworkUpdateInventory(f.plan, f.api),
    root = await mkdtemp(join(tmpdir(), 'operational-acquisition-'));
  roots.push(root);
  const store = await CeDeploymentStore.open(root, binding.owner),
    spec = { azure: { fixture: true } },
    state = { calls: 0, down: false };
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
    async observeForwardingRoutes() {
      return { status: 'unknown' };
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
    if (fault === 'mode') await chmod(path, 0o644);
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
test('missing retained issuer cannot be replaced during collection or key retirement', async () => {
  const f = await fixture(),
    reference = await f.collector.collect(f.identity, 'preflight');
  await f.store.remove('azure-network-observer-issuer.json');
  const reopened = f.open(reference.issuerSha256);
  await expect(reopened.collect(f.identity, 'preflight')).rejects.toThrow('retained issuer publication missing');
  await expect(reopened.retireSigningMaterial()).rejects.toThrow('retained issuer publication missing');
  expect((await readFile(join(f.store.directory, 'azure-network-observer-key.json'))).length).toBeGreaterThan(0);
});
