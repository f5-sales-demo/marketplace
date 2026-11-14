import { expect } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { canonicalSha256 } from '../../src/ce/canonical';
import { createAzureReplacementAcquisitionCollector } from '../../src/ce/network-replacement-operational-provenance';
import { replacementOperationalIdentityFixture } from './network-replacement-operational-identity-fixture';
import { test } from './owned-fixture-test';

type Fixture = Awaited<ReturnType<typeof replacementOperationalIdentityFixture>>;
function collector(f: Fixture, pin?: string) {
  return createAzureReplacementAcquisitionCollector(
    f.plan,
    f.runtime,
    f.executionApi,
    f.store,
    f.session,
    f.observationDependencies,
    pin,
    undefined,
    async (sha) => {
      if (sha !== f.plan.planSha256) throw Error('Synthetic original source missing');
      return f.plan;
    },
  );
}
for (const ha of [false, true])
  for (const phase of ['intact', 'launched'] as const)
    test(`signed replacement ${ha ? 'HA' : 'single'} ${phase} retains complete current identity without acceptance`, async () => {
      const f = await replacementOperationalIdentityFixture(ha, phase),
        c = collector(f),
        purpose = phase === 'intact' ? 'preflight' : 'final';
      const receipt = await c.collect(f.identity, purpose),
        result = await c.authenticate(receipt, f.identity, purpose, 'current');
      expect(receipt).toMatchObject({
        kind: 'azure-replacement-operational-acquisition-reference',
        identitySha256: canonicalSha256(f.identity),
        purpose,
      });
      expect(result).toMatchObject({
        status: 'authenticated',
        scope: 'owning-replacement-operational-acquisition',
        mode: 'current',
        originalSampleFreshness: 'unqualified',
        operationalAcceptance: 'unknown',
        canSatisfyInterfaceMutationGate: false,
      });
      expect(result.readings.interfaces).toHaveLength(ha ? 6 : 2);
      expect(result.readings.expectedIdentitySha256).toBe(canonicalSha256(f.identity));
      expect(f.observationState.calls).toEqual([
        'site',
        'registrations',
        'interfaces',
        'registrations',
        'interfaces',
        'site',
      ]);
      expect(f.state.applies).toBe(0);
      expect(f.state.bootstraps).toBe(0);
      expect(JSON.stringify(result)).not.toContain('signingMaterial');
      const retired = await c.retireSigningMaterial();
      expect(retired.status).toBe('retired');
      expect(
        (await readdir(f.store.directory)).filter((name) => name === 'azure-replacement-observer-key.json'),
      ).toEqual([]);
    }, 60000);
test('replacement current invocation cannot be substituted by reopened historical authentication', async () => {
  const f = await replacementOperationalIdentityFixture(),
    c = collector(f),
    receipt = await c.collect(f.identity, 'preflight');
  const reopened = collector(f, receipt.issuerSha256);
  await expect(reopened.authenticate(receipt, f.identity, 'preflight', 'current')).rejects.toThrow(
    /current acquisition unavailable/,
  );
  expect(await reopened.authenticate(receipt, f.identity, 'preflight', 'historical')).toMatchObject({
    status: 'authenticated',
    mode: 'historical',
    originalSampleFreshness: 'unqualified',
  });
  await expect(collector(f).authenticate(receipt, f.identity, 'preflight', 'historical')).rejects.toThrow(
    /pinned issuer/,
  );
  await c.retireSigningMaterial();
  expect(await reopened.authenticate(receipt, f.identity, 'preflight', 'historical')).toMatchObject({
    status: 'authenticated',
  });
  await expect(c.authenticate(receipt, f.identity, 'preflight', 'current')).rejects.toThrow(/current acquisition/);
  await expect(reopened.collect(f.identity, 'preflight')).rejects.toThrow(/retired/);
}, 60000);
test('signed replacement binds every journal/source/configuration/site/phase/node field', async () => {
  const f = await replacementOperationalIdentityFixture(),
    c = collector(f),
    receipt = await c.collect(f.identity, 'preflight');
  for (const field of ['journalSha256', 'sourceBindingSha256', 'configurationSha256'] as const) {
    const identity = structuredClone(f.identity);
    identity[field] = 'f'.repeat(64);
    await expect(c.authenticate(receipt, identity, 'preflight', 'historical')).rejects.toThrow();
  }
  for (const field of ['siteUid', 'siteConfigurationSha256'] as const) {
    const identity = structuredClone(f.identity);
    identity.site[field] = field === 'siteUid' ? 'foreign' : 'f'.repeat(64);
    await expect(c.authenticate(receipt, identity, 'preflight', 'historical')).rejects.toThrow();
  }
  const identity = structuredClone(f.identity);
  identity.nodes['1'].vmId = f.newVmId;
  await expect(c.authenticate(receipt, identity, 'preflight', 'historical')).rejects.toThrow();
  identity.nodes['1'].nics['0'].mac = '02:00:00:00:00:99';
  await expect(c.authenticate(receipt, identity, 'preflight', 'historical')).rejects.toThrow();
  await expect(c.authenticate(receipt, f.identity, 'final', 'historical')).rejects.toThrow();
  await c.retireSigningMaterial();
}, 60000);
test('replacement preserves originally collected down and unknown evidence through retirement', async () => {
  const f = await replacementOperationalIdentityFixture(),
    c = collector(f);
  f.observationState.fault = 'down';
  const down = await c.collect(f.identity, 'preflight');
  expect((await c.authenticate(down, f.identity, 'preflight', 'current')).readings.interfaceState).toBe('down');
  f.observationState.fault = 'unavailable';
  const unknown = await c.collect(f.identity, 'preflight');
  expect((await c.authenticate(unknown, f.identity, 'preflight', 'current')).readings.status).toBe('unknown');
  const before = await c.authenticateRetirementInventory();
  expect(before.signingMaterialPresent).toBe(true);
  await c.retireSigningMaterial();
  const after = await c.authenticateRetirementInventory();
  expect(after.signingMaterialPresent).toBe(false);
  expect(after.artifacts.filter((row) => row.action === 'delete')).toEqual([]);
  expect((await c.authenticate(down, f.identity, 'preflight', 'historical')).readings.interfaceState).toBe('down');
  expect((await c.authenticate(unknown, f.identity, 'preflight', 'historical')).readings.status).toBe('unknown');
}, 60000);
test('replacement rejects source and phase errors before creating signing material', async () => {
  const f = await replacementOperationalIdentityFixture(),
    c = collector(f),
    identity = structuredClone(f.identity);
  identity.journalSha256 = 'f'.repeat(64);
  await expect(c.collect(identity, 'preflight')).rejects.toThrow();
  await expect(c.collect(f.identity, 'final')).rejects.toThrow(/purpose/);
  expect((await readdir(f.store.directory)).filter((name) => name.startsWith('azure-replacement-'))).toEqual([]);
  const wrongPlan = structuredClone(f.plan);
  wrongPlan.engine = 'native';
  expect(() =>
    createAzureReplacementAcquisitionCollector(
      wrongPlan,
      f.runtime,
      f.executionApi,
      f.store,
      f.session,
      f.observationDependencies,
    ),
  ).toThrow();
}, 60000);
test('replacement inventory rejects unclassified or altered observer artifacts and preserves its key', async () => {
  const f = await replacementOperationalIdentityFixture(),
    c = collector(f),
    receipt = await c.collect(f.identity, 'preflight');
  const name = `azure-replacement-observation-${'f'.repeat(64)}.json`;
  await f.store.write(name, { schemaVersion: 1, foreign: true });
  await expect(c.retireSigningMaterial()).rejects.toThrow();
  expect((await readdir(f.store.directory)).includes('azure-replacement-observer-key.json')).toBe(true);
  await f.store.remove(name);
  const publication = `azure-replacement-observation-${receipt.publicationSha256}.json`,
    saved = await f.store.read(publication);
  await f.store.write(publication, { changed: true });
  await expect(c.authenticateRetirementInventory()).rejects.toThrow();
  await f.store.write(publication, saved);
  await c.retireSigningMaterial();
}, 60000);
test('replacement receipt cannot authenticate with a foreign family, issuer, invocation or publication', async () => {
  const f = await replacementOperationalIdentityFixture(),
    c = collector(f),
    receipt = await c.collect(f.identity, 'preflight');
  for (const change of [
    { kind: 'azure-network-operational-acquisition-reference' },
    { issuerSha256: 'f'.repeat(64) },
    { invocationId: '00000000-0000-4000-8000-000000000099' },
    { publicationSha256: 'f'.repeat(64) },
  ]) {
    await expect(
      c.authenticate(Object.assign(structuredClone(receipt), change), f.identity, 'preflight', 'historical'),
    ).rejects.toThrow();
  }
  await c.retireSigningMaterial();
}, 60000);

test('replacement acquisition can authenticate prior same-scope signed history while reading current identity', async () => {
  const f = await replacementOperationalIdentityFixture(),
    historical = f.observationDependencies.qualifyHistorical;
  let prior: Awaited<ReturnType<ReturnType<typeof collector>['collect']>> | undefined;
  let current: ReturnType<typeof collector>;
  f.observationDependencies.qualifyHistorical = async (...args) => {
    if (prior) await current.authenticate(prior, f.identity, 'preflight', 'historical', args[3]);
    return historical(...args);
  };
  current = collector(f);
  prior = await current.collect(f.identity, 'preflight');
  const next = await current.collect(f.identity, 'preflight');
  expect(next.invocationId).not.toBe(prior.invocationId);
  expect(await current.authenticate(next, f.identity, 'preflight', 'current')).toMatchObject({
    status: 'authenticated',
    originalSampleFreshness: 'unqualified',
  });
  await current.retireSigningMaterial();
}, 60000);
