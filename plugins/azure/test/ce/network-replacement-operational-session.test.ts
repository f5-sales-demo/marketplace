import { afterEach, expect } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { savePlanArtifact } from '../../src/ce/artifacts';
import { createAzureReplacementAcquisitionCollector } from '../../src/ce/network-replacement-operational-provenance';
import { createAzureReplacementAcquisitionSession } from '../../src/ce/network-replacement-operational-session';
import { observation } from './fixtures';
import { replacementOperationalIdentityFixture } from './network-replacement-operational-identity-fixture';
import { test } from './owned-fixture-test';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function fixture(ha = false) {
  const f = await replacementOperationalIdentityFixture(ha);
  const directory = await mkdtemp(join(tmpdir(), 'replacement-public-session-'));
  roots.push(directory);
  const paths = new Map<string, string>();
  let next = 0;
  const artifactSession = {
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
  await savePlanArtifact(artifactSession, f.plan, observation);
  const open = () =>
    createAzureReplacementAcquisitionSession(
      f.plan,
      f.runtime,
      f.executionApi,
      f.store,
      f.session,
      f.observationDependencies,
      artifactSession,
    );
  const issuerPath = () => {
    const names = [...paths.values()].filter((path) => path.endsWith('.azure-ce-replacement-operational-issuer.log'));
    if (names.length !== 1 || typeof names[0] !== 'string')
      throw Error('Synthetic original replacement issuer missing or ambiguous');
    return names[0];
  };
  return { ...f, directory, artifactSession, paths, open, issuerPath };
}

for (const ha of [false, true])
  test(`replacement original public issuer ${ha ? 'HA' : 'single'} survives reopening and retirement without operational acceptance`, async () => {
    const f = await fixture(ha),
      current = await f.open();
    const reference = await current.collect(f.identity, 'preflight');
    const row = JSON.parse(await readFile(f.issuerPath(), 'utf8'));
    expect(row).toMatchObject({
      kind: 'azure-replacement-operational-issuer-binding',
      owner: f.store.owner,
      planSha256: f.plan.planSha256,
      issuerSha256: reference.issuerSha256,
    });
    expect(JSON.stringify(row)).not.toContain('signingMaterial');
    const reopened = await f.open();
    await expect(reopened.authenticate(reference, f.identity, 'preflight', 'current')).rejects.toThrow(
      'current acquisition unavailable',
    );
    expect(await reopened.authenticate(reference, f.identity, 'preflight', 'historical')).toMatchObject({
      status: 'authenticated',
      originalSampleFreshness: 'unqualified',
      operationalAcceptance: 'unknown',
      canSatisfyInterfaceMutationGate: false,
    });
    await current.retireSigningMaterial();
    expect((await (await f.open()).authenticate(reference, f.identity, 'preflight', 'historical')).status).toBe(
      'authenticated',
    );
    await expect(readFile(join(f.store.directory, 'azure-replacement-observer-key.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(f.state.applies).toBe(0);
    expect(f.state.bootstraps).toBe(0);
  }, 60000);

test('replacement does not enroll a private pointer or caller receipt as its original public pin', async () => {
  const f = await fixture();
  const collector = createAzureReplacementAcquisitionCollector(
    f.plan,
    f.runtime,
    f.executionApi,
    f.store,
    f.session,
    f.observationDependencies,
  );
  await collector.collect(f.identity, 'preflight');
  const calls = f.observationState.calls.length;
  await expect(f.open()).rejects.toThrow('original public issuer pin unavailable');
  expect(f.observationState.calls.length).toBe(calls);
}, 60000);

for (const fault of ['conflicting-issuer', 'foreign-family', 'changed-source'] as const)
  test(`replacement original public pin rejects ${fault} before observation`, async () => {
    const f = await fixture(),
      collector = await f.open();
    await collector.collect(f.identity, 'preflight');
    const row = JSON.parse(await readFile(f.issuerPath(), 'utf8'));
    if (fault === 'conflicting-issuer') {
      await writeFile(
        join(f.directory, 'conflict.azure-ce-replacement-operational-issuer.log'),
        JSON.stringify({ ...row, issuerSha256: 'e'.repeat(64) }),
        { mode: 0o600 },
      );
    } else if (fault === 'foreign-family') {
      await writeFile(f.issuerPath(), JSON.stringify({ ...row, kind: 'azure-network-operational-issuer-binding' }));
    } else {
      await writeFile(f.issuerPath(), JSON.stringify({ ...row, planSha256: 'e'.repeat(64) }));
    }
    const calls = f.observationState.calls.length;
    await expect(f.open()).rejects.toThrow();
    expect(f.observationState.calls.length).toBe(calls);
  }, 60000);

test('replacement public issuer publication interruption reuses the actual original key before acknowledgement', async () => {
  const f = await fixture(),
    write = f.store.write.bind(f.store);
  let failed = false;
  f.store.write = async (name, value, signal) => {
    if (name === 'azure-replacement-observer-issuer.json' && !failed) {
      failed = true;
      throw Error('synthetic-replacement-pointer-interruption');
    }
    return write(name, value, signal);
  };
  const current = await f.open();
  await expect(current.collect(f.identity, 'preflight')).rejects.toThrow('synthetic-replacement-pointer-interruption');
  const key = await readFile(join(f.store.directory, 'azure-replacement-observer-key.json'));
  const reopened = await f.open(),
    reference = await reopened.collect(f.identity, 'preflight');
  expect(await readFile(join(f.store.directory, 'azure-replacement-observer-key.json'))).toEqual(key);
  expect((await reopened.authenticate(reference, f.identity, 'preflight', 'current')).status).toBe('authenticated');
  expect(
    [...f.paths.values()].filter((path) => path.endsWith('.azure-ce-replacement-operational-issuer.log')),
  ).toHaveLength(1);
  await reopened.retireSigningMaterial();
}, 60000);

test('replacement rejects a headless nonpersistent native session before issuer creation', async () => {
  const f = await fixture();
  f.artifactSession.getArtifactsDir = () => null as unknown as string;
  await expect(f.open()).rejects.toThrow('persistent native session required');
  await expect(readFile(join(f.store.directory, 'azure-replacement-observer-key.json'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
  expect(f.state.applies).toBe(0);
}, 60000);
