import { afterEach, expect } from 'bun:test';
import { createHash } from 'node:crypto';
import { lstat, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { savePlanArtifact } from '../../src/ce/artifacts';
import { canonicalSha256 } from '../../src/ce/canonical';
import { collectAzureReplacementOperationalParentDispositions } from '../../src/ce/network-replacement-operational-parent-disposition';
import {
  createAzureReplacementOperationalRetirementSession,
  readAuthenticatedAzureReplacementOperationalRetirementInventory,
} from '../../src/ce/network-replacement-operational-retirement-session';
import { createAzureReplacementAcquisitionSession } from '../../src/ce/network-replacement-operational-session';
import { observation } from './fixtures';
import { replacementOperationalIdentityFixture } from './network-replacement-operational-identity-fixture';
import { test } from './owned-fixture-test';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function fixture(ha = false) {
  const f = await replacementOperationalIdentityFixture(ha),
    directory = await mkdtemp(join(tmpdir(), 'replacement-retirement-session-'));
  roots.push(directory);
  let next = 0;
  const paths = new Map<string, string>();
  const publicSession = {
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
  for (const plan of [f.birth.original, f.network, f.plan]) await savePlanArtifact(publicSession, plan, observation);
  const acquire = () =>
    createAzureReplacementAcquisitionSession(
      f.plan,
      f.runtime,
      f.executionApi,
      f.store,
      f.session,
      f.observationDependencies,
      publicSession,
    );
  const retire = () =>
    createAzureReplacementOperationalRetirementSession(
      f.birth.original,
      f.runtime,
      f.executionApi,
      f.store,
      f.session,
      f.observationDependencies,
      publicSession,
    );
  // Independently inspect native filesystem bytes and identities rather than copying observer output.
  const snapshot = async () =>
    Promise.all(
      (await readdir(f.store.directory))
        .filter((name) =>
          ['azure-replacement-observer-', 'azure-replacement-issuer-', 'azure-replacement-observation-'].some(
            (prefix) => name.startsWith(prefix),
          ),
        )
        .map(async (path) => {
          const native = join(f.store.directory, path),
            stat = await lstat(native),
            bytes = await readFile(native);
          expect(stat.isFile() && !stat.isSymbolicLink()).toBe(true);
          return {
            path,
            identity: `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`,
            sha256: hash(bytes),
            packetSha256: canonicalSha256(JSON.parse(bytes.toString('utf8'))),
          };
        }),
    );
  return { ...f, publicSession, acquire, retire, snapshot };
}

for (const ha of [false, true])
  test(`replacement ${ha ? 'HA' : 'single'} key retirement enables exact typed parent preservation without observation or cloud mutation`, async () => {
    const f = await fixture(ha),
      collector = await f.acquire(),
      reference = await collector.collect(f.identity, 'preflight');
    const calls = f.observationState.calls.length,
      retirement = await f.retire();
    const before = await f.snapshot();
    await expect(
      collectAzureReplacementOperationalParentDispositions(
        f.birth.original,
        f.store,
        f.publicSession,
        before,
        retirement,
      ),
    ).rejects.toThrow('signing material still present');
    expect(await retirement.retireSigningMaterial()).toMatchObject({
      status: 'retired',
      artifactInventory: {
        observerState: 'present',
        signingMaterialPresent: false,
        operationalAcceptance: 'unknown',
        canSatisfyInterfaceMutationGate: false,
      },
    });
    const native = await f.snapshot(),
      decisions = await collectAzureReplacementOperationalParentDispositions(
        f.birth.original,
        f.store,
        f.publicSession,
        native,
        retirement,
      );
    expect(decisions).toHaveLength(native.length);
    expect(decisions.every((row) => row.action === 'preserve' && row.schema.startsWith('azure-replacement-'))).toBe(
      true,
    );
    for (const row of decisions)
      expect(native.find((file) => file.path === row.path)).toMatchObject({
        identity: row.identity,
        sha256: row.sha256,
        packetSha256: row.packetSha256,
      });
    expect((await (await f.acquire()).authenticate(reference, f.identity, 'preflight', 'historical')).status).toBe(
      'authenticated',
    );
    expect(f.observationState.calls.length).toBe(calls);
    expect(f.state.applies).toBe(0);
    expect(f.state.bootstraps).toBe(0);
  }, 60000);

test('replacement observer absence is inspected under its own lock and creates no key or publication', async () => {
  const f = await fixture(),
    before = (await readdir(f.store.directory)).sort(),
    retirement = await f.retire();
  expect(await retirement.retireSigningMaterial()).toMatchObject({
    status: 'absent',
    artifactInventory: {
      observerState: 'absent',
      issuerSha256: null,
      artifacts: [],
      signingMaterialPresent: false,
      operationalAcceptance: 'unknown',
    },
  });
  expect(
    await collectAzureReplacementOperationalParentDispositions(
      f.birth.original,
      f.store,
      f.publicSession,
      [],
      retirement,
    ),
  ).toEqual([]);
  expect((await readdir(f.store.directory)).sort()).toEqual(before);
  expect(f.observationState.calls).toEqual([]);
}, 60000);

test('forged replacement retirement callbacks cannot enroll parent authority', async () => {
  const f = await fixture();
  let calls = 0;
  const fake = {
    async authenticateRetirementInventory() {
      calls++;
      return {};
    },
    async retireSigningMaterial() {
      calls++;
      return {};
    },
  };
  await expect(
    readAuthenticatedAzureReplacementOperationalRetirementInventory(fake, f.birth.original, f.store, f.publicSession),
  ).rejects.toThrow('genuine owning retirement session required');
  expect(calls).toBe(0);
  expect(f.observationState.calls).toEqual([]);
}, 60000);

for (const fault of ['missing', 'duplicate', 'identity', 'bytes', 'packet', 'unclassified'] as const)
  test(`replacement parent snapshot rejects ${fault} against original retired native proof`, async () => {
    const f = await fixture(),
      collector = await f.acquire();
    await collector.collect(f.identity, 'preflight');
    const retirement = await f.retire();
    await retirement.retireSigningMaterial();
    const native = await f.snapshot();
    const first = native[0];
    if (!first) throw Error('Synthetic replacement proof missing');
    if (fault === 'missing') native.shift();
    if (fault === 'duplicate') native.push({ ...first });
    if (fault === 'identity') first.identity += '-changed';
    if (fault === 'bytes') first.sha256 = 'e'.repeat(64);
    if (fault === 'packet') first.packetSha256 = 'e'.repeat(64);
    if (fault === 'unclassified') native.push({ ...first, path: 'azure-replacement-observer-foreign.json' });
    await expect(
      collectAzureReplacementOperationalParentDispositions(
        f.birth.original,
        f.store,
        f.publicSession,
        native,
        retirement,
      ),
    ).rejects.toThrow();
    expect(f.state.applies).toBe(0);
  }, 60000);

test('replacement private artifacts without an original public issuer cannot become absence', async () => {
  const f = await fixture();
  await f.store.write('azure-replacement-observer-issuer.json', { foreign: true });
  await expect(f.retire()).rejects.toThrow('observer artifacts have no original public issuer');
  await expect(readFile(join(f.store.directory, 'azure-replacement-observer-key.json'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
  expect(f.observationState.calls).toEqual([]);
}, 60000);

for (const fault of ['down', 'unavailable'])
  test(`replacement original ${fault} facts remain unknown operational acceptance after retirement`, async () => {
    const f = await fixture();
    f.observationState.fault = fault;
    const collector = await f.acquire();
    await collector.collect(f.identity, 'preflight');
    const retirement = await f.retire();
    await retirement.retireSigningMaterial();
    expect(
      await readAuthenticatedAzureReplacementOperationalRetirementInventory(
        retirement,
        f.birth.original,
        f.store,
        f.publicSession,
      ),
    ).toMatchObject({ operationalAcceptance: 'unknown', canSatisfyInterfaceMutationGate: false });
  }, 60000);
