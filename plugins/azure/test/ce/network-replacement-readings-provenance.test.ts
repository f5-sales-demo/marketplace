import { expect } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { canonicalSha256 } from '../../src/ce/canonical';
import { createAzureReplacementAcquisitionCollector } from '../../src/ce/network-replacement-operational-provenance';
import { createAzureReplacementReadingsAcquisitionCollector } from '../../src/ce/network-replacement-readings-provenance';
import { replacementOperationalReadingsFixture } from './network-replacement-operational-readings-fixture';
import { test } from './owned-fixture-test';

type Fixture = Awaited<ReturnType<typeof replacementOperationalReadingsFixture>>;
function collector(f: Fixture, pin?: string) {
  return createAzureReplacementReadingsAcquisitionCollector(
    f.plan,
    f.runtime,
    f.cloud,
    f.store,
    f.session,
    f.observationDependencies,
    pin,
    undefined,
    async (sha) => {
      if (sha !== f.plan.planSha256) throw Error('Synthetic original replacement source differs');
      return f.plan;
    },
  );
}

for (const ha of [false, true])
  test(`replacement ${ha ? 'HA' : 'single'} signs actual current readings and challenged traffic with separate authority`, async () => {
    const f = await replacementOperationalReadingsFixture(ha),
      c = collector(f);
    const reference = await c.collect(f.identity, 'preflight', undefined, true);
    const result = await c.authenticate(reference, f.identity, 'preflight', 'current');
    expect(reference.kind).toBe('azure-replacement-readings-operational-acquisition-reference');
    expect(result).toMatchObject({
      status: 'authenticated',
      scope: 'owning-replacement-readings-operational-acquisition',
      operationalAcceptance: 'unknown',
      originalSampleFreshness: 'unqualified',
      canSatisfyInterfaceMutationGate: false,
      readings: {
        scope: 'current-replacement-operational-readings',
        identity: { expectedIdentitySha256: canonicalSha256(f.identity) },
        traffic: { status: 'healthy' },
      },
    });
    expect(result.readings.identity.interfaces).toHaveLength(ha ? 6 : 2);
    expect(f.state.commands).toBe(1);
    expect(JSON.stringify(result)).not.toContain('TRAFFIC_PRIVATE_SENTINEL');
    await c.retireSigningMaterial();
    expect((await readdir(f.store.directory)).includes('azure-replacement-readings-observer-key.json')).toBe(false);
  }, 180000);

test('identity-only and richer replacement references cannot cross-authenticate or retire each other', async () => {
  const f = await replacementOperationalReadingsFixture(),
    rich = collector(f),
    old = createAzureReplacementAcquisitionCollector(
      f.plan,
      f.runtime,
      f.cloud,
      f.store,
      f.session,
      f.observationDependencies,
    );
  const identityReference = await old.collect(f.identity, 'preflight'),
    richReference = await rich.collect(f.identity, 'preflight');
  await expect(
    old.authenticate(
      Object.assign(structuredClone(identityReference), { kind: richReference.kind }),
      f.identity,
      'preflight',
      'historical',
    ),
  ).rejects.toThrow();
  await expect(
    rich.authenticate(
      Object.assign(structuredClone(richReference), { kind: identityReference.kind }),
      f.identity,
      'preflight',
      'historical',
    ),
  ).rejects.toThrow();
  expect(richReference.issuerSha256).not.toBe(identityReference.issuerSha256);
  await rich.retireSigningMaterial();
  expect((await readdir(f.store.directory)).includes('azure-replacement-observer-key.json')).toBe(true);
  expect((await old.authenticate(identityReference, f.identity, 'preflight', 'current')).readings.scope).toBe(
    'replacement-registration-interface-identity',
  );
  await old.retireSigningMaterial();
}, 180000);

test('reopened richer history authenticates original facts but cannot replace a current invocation or create an issuer pin', async () => {
  const f = await replacementOperationalReadingsFixture(),
    c = collector(f),
    ref = await c.collect(f.identity, 'preflight');
  const reopened = collector(f, ref.issuerSha256);
  await expect(reopened.authenticate(ref, f.identity, 'preflight', 'current')).rejects.toThrow(/current acquisition/);
  expect((await reopened.authenticate(ref, f.identity, 'preflight', 'historical')).readings.traffic.status).toBe(
    'unknown',
  );
  await expect(collector(f).authenticate(ref, f.identity, 'preflight', 'historical')).rejects.toThrow(/pinned issuer/);
  await c.retireSigningMaterial();
  expect((await reopened.authenticate(ref, f.identity, 'preflight', 'historical')).status).toBe('authenticated');
  await expect(reopened.collect(f.identity, 'preflight')).rejects.toThrow(/retired/);
}, 120000);

for (const fault of ['down', 'partial', 'unqualified'])
  test(`richer signed ${fault} evidence remains unavailable for operational admission`, async () => {
    const f = await replacementOperationalReadingsFixture();
    f.state.fault = fault;
    const c = collector(f),
      ref = await c.collect(f.identity, 'preflight', undefined, true),
      result = await c.authenticate(ref, f.identity, 'preflight', 'current');
    expect(result.readings.traffic.status).toBe('unknown');
    expect(f.state.commands).toBe(0);
    expect(result.operationalAcceptance).toBe('unknown');
    await c.retireSigningMaterial();
  }, 120000);

test('richer receipt binds all source/configuration/site/phase/node fields and rejects mutation before key creation', async () => {
  const f = await replacementOperationalReadingsFixture(),
    c = collector(f),
    invalid = structuredClone(f.identity);
  invalid.journalSha256 = 'f'.repeat(64);
  await expect(c.collect(invalid, 'preflight')).rejects.toThrow();
  expect((await readdir(f.store.directory)).filter((name) => name.startsWith('azure-replacement-readings-'))).toEqual(
    [],
  );
  const ref = await c.collect(f.identity, 'preflight');
  for (const change of [
    { sourceBindingSha256: 'f'.repeat(64) },
    { configurationSha256: 'f'.repeat(64) },
    { phase: 'launched' },
  ])
    await expect(
      c.authenticate(
        Object.assign(structuredClone(ref), {}),
        Object.assign(structuredClone(f.identity), change),
        'preflight',
        'historical',
      ),
    ).rejects.toThrow();
  const moved = structuredClone(f.identity);
  moved.nodes['1'].nics['0'].mac = '02:00:00:00:00:99';
  await expect(c.authenticate(ref, moved, 'preflight', 'historical')).rejects.toThrow();
  await c.retireSigningMaterial();
}, 120000);

test('richer retirement rejects unclassified/altered proof and preserves its signing key', async () => {
  const f = await replacementOperationalReadingsFixture(),
    c = collector(f),
    ref = await c.collect(f.identity, 'preflight');
  const unknown = `azure-replacement-readings-observation-${'f'.repeat(64)}.json`;
  await f.store.write(unknown, { unknown: true });
  await expect(c.retireSigningMaterial()).rejects.toThrow();
  expect((await readdir(f.store.directory)).includes('azure-replacement-readings-observer-key.json')).toBe(true);
  await f.store.remove(unknown);
  const file = `azure-replacement-readings-observation-${ref.publicationSha256}.json`,
    saved = await f.store.read(file);
  await f.store.write(file, { altered: true });
  await expect(c.authenticateRetirementInventory()).rejects.toThrow();
  await f.store.write(file, saved);
  await c.retireSigningMaterial();
}, 120000);
