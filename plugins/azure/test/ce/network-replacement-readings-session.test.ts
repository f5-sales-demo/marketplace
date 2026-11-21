import { afterEach, expect } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { savePlanArtifact } from '../../src/ce/artifacts';
import { createAzureReplacementReadingsAcquisitionCollector } from '../../src/ce/network-replacement-readings-provenance';
import { createAzureReplacementReadingsAcquisitionSession } from '../../src/ce/network-replacement-readings-session';
import { observation } from './fixtures';
import { replacementOperationalReadingsFixture } from './network-replacement-operational-readings-fixture';
import { test } from './owned-fixture-test';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture(ha = false) {
  const f = await replacementOperationalReadingsFixture(ha),
    directory = await mkdtemp(join(tmpdir(), 'replacement-readings-session-'));
  roots.push(directory);
  const paths = new Map<string, string>();
  let next = 0;
  const native = {
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
  await savePlanArtifact(native, f.plan, observation);
  const open = () =>
    createAzureReplacementReadingsAcquisitionSession(
      f.plan,
      f.runtime,
      f.cloud,
      f.store,
      f.session,
      f.observationDependencies,
      native,
    );
  const issuerPath = () => {
    const names = [...paths.values()].filter((path) =>
      path.endsWith('.azure-ce-replacement-readings-operational-issuer.log'),
    );
    if (names.length !== 1) throw Error('Synthetic richer original issuer missing');
    return names[0];
  };
  return { ...f, directory, native, paths, open, issuerPath };
}
for (const ha of [false, true])
  test(`richer replacement ${ha ? 'HA' : 'single'} publishes original native issuer before acknowledgement and survives reopen/retirement`, async () => {
    const f = await fixture(ha),
      c = await f.open(),
      ref = await c.collect(f.identity, 'preflight');
    const original = JSON.parse(await readFile(f.issuerPath(), 'utf8'));
    expect(original).toMatchObject({
      kind: 'azure-replacement-readings-operational-issuer-binding',
      owner: f.store.owner,
      planSha256: f.plan.planSha256,
      issuerSha256: ref.issuerSha256,
    });
    const reopened = await f.open();
    await expect(reopened.authenticate(ref, f.identity, 'preflight', 'current')).rejects.toThrow(/current acquisition/);
    expect((await reopened.authenticate(ref, f.identity, 'preflight', 'historical')).readings.scope).toBe(
      'current-replacement-operational-readings',
    );
    await c.retireSigningMaterial();
    expect((await (await f.open()).authenticate(ref, f.identity, 'preflight', 'historical')).status).toBe(
      'authenticated',
    );
    await expect(
      readFile(join(f.store.directory, 'azure-replacement-readings-observer-key.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  }, 180000);

test('richer native session rejects an existing private issuer without its own original public pin', async () => {
  const f = await fixture(),
    c = createAzureReplacementReadingsAcquisitionCollector(
      f.plan,
      f.runtime,
      f.cloud,
      f.store,
      f.session,
      f.observationDependencies,
    );
  await c.collect(f.identity, 'preflight');
  const before = f.state.commands;
  await expect(f.open()).rejects.toThrow(/original public issuer pin unavailable/);
  expect(f.state.commands).toBe(before);
  await c.retireSigningMaterial();
}, 120000);

for (const fault of ['family', 'issuer', 'source'])
  test(`richer original native ${fault} change rejects before another observation`, async () => {
    const f = await fixture(),
      c = await f.open();
    await c.collect(f.identity, 'preflight');
    const path = f.issuerPath(),
      text = await readFile(path, 'utf8'),
      row = JSON.parse(text);
    if (fault === 'family') row.kind = 'azure-replacement-operational-issuer-binding';
    else if (fault === 'issuer') row.issuerSha256 = 'f'.repeat(64);
    else row.planSha256 = 'f'.repeat(64);
    await writeFile(path, JSON.stringify(row), { mode: 0o600 });
    const calls = f.observationState.calls.length;
    await expect(f.open()).rejects.toThrow();
    expect(f.observationState.calls.length).toBe(calls);
    await writeFile(path, text, { mode: 0o600 });
    await (await f.open()).retireSigningMaterial();
  }, 120000);
