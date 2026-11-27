import { afterEach, expect } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { savePlanArtifact } from '../../src/ce/artifacts';
import {
  AzureReplacementReadingsAcceptanceUnavailable,
  createAzureReplacementReadingsAcceptance,
} from '../../src/ce/network-replacement-readings-acceptance';
import {
  assertAzureReplacementReadingsAcquisitionSession,
  createAzureReplacementReadingsAcquisitionSession,
} from '../../src/ce/network-replacement-readings-session';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { observation } from './fixtures';
import { replacementOperationalReadingsFixture } from './network-replacement-operational-readings-fixture';
import { test } from './owned-fixture-test';

type Session = Awaited<ReturnType<typeof createAzureReplacementReadingsAcquisitionSession>>;
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture(ha = false, readiness = '') {
  const f = await replacementOperationalReadingsFixture(ha),
    directory = await mkdtemp(join(tmpdir(), 'replacement-readings-acceptance-'));
  roots.push(directory);
  if (readiness) {
    const binding = azureUpgradeBinding(f.plan);
    // Model the actual VPM configuration-readiness response, never operational health.
    Object.assign(f.runtime, {
      async observeNodeReadiness(
        _binding: unknown,
        expected: { node: string; siteUid: string; instances: Record<string, string> },
      ) {
        if (readiness === 'partial' && expected.node === binding.nodes.at(-1)) throw Error('readiness unavailable');
        const ready = readiness !== 'not-ready' || expected.node !== binding.nodes.at(-1);
        return {
          status: 'observed',
          readiness: ready ? 'ready' : 'not-ready',
          state: ready ? 'PROVISIONED' : 'FAILED',
          owner: binding.owner,
          siteName: binding.siteName,
          siteUid: expected.siteUid,
          node: expected.node,
          instanceId: expected.instances[expected.node],
          registration: 'registration-' + expected.node,
          scope: 'selected-node-vpm-readiness',
          fqdn: expected.node + '.ce.example.test',
          roles: ['k8s-master-primary'],
          softwareVersion: 'software-example',
          osVersion: 'os-example',
          vpmVersion: 'vpm-example',
          originalSampleFreshness: 'unqualified',
          allNodeHealthQualified: false,
          routingTrafficQualified: false,
          canSatisfyInterfaceMutationGate: false,
          source:
            '/api/operate/namespaces/system/sites/' + binding.siteName + '/vpm/debug/' + expected.node + '/exec-user',
          outputSha256: 'c'.repeat(64),
          bindingOutputSha256: 'd'.repeat(64),
        };
      },
    });
  }
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
  return { ...f, open };
}

test('forged richer acquisition facades cannot grant acceptance or invoke callbacks', () => {
  let calls = 0;
  const forged = {
    collect: async () => {
      calls++;
    },
    authenticate: async () => {
      calls++;
      return { status: 'authenticated' };
    },
  } as unknown as Session;
  for (const value of [null, {}, forged, Object.freeze(forged)]) {
    expect(() => createAzureReplacementReadingsAcceptance(value as Session)).toThrow(/genuine.*session/);
    expect(() => assertAzureReplacementReadingsAcquisitionSession(value)).toThrow(/genuine.*session/);
  }
  expect(calls).toBe(0);
});

for (const ha of [false, true])
  test(`native richer ${ha ? 'HA' : 'single'} acceptance preserves real missing qualification and current/historical custody`, async () => {
    const f = await fixture(ha),
      session = await f.open(),
      acceptance = createAzureReplacementReadingsAcceptance(session);
    const plan = assertAzureReplacementReadingsAcquisitionSession(session);
    plan.siteName += '-copy';
    expect(assertAzureReplacementReadingsAcquisitionSession(session)).toEqual(f.plan);
    expect(() => createAzureReplacementReadingsAcceptance({ ...session })).toThrow(/genuine.*session/);
    expect(() => createAzureReplacementReadingsAcceptance(new Proxy(session, {}))).toThrow(/genuine.*session/);
    const ref = await acceptance.collectOperational(f.identity, 'preflight');
    const before = f.state.commands;
    const evidence = await acceptance.inspect(ref, f.identity, 'current');
    expect(evidence).toMatchObject({
      status: 'unknown',
      interfaceState: 'observed',
      evidenceSha256: ref.publicationSha256,
    });
    expect(evidence.missing).toContain('original-sample-freshness');
    expect(evidence.missing).toContain('all-node-operational-health');
    expect(evidence.missing).toContain('qualified-forwarding-scope-and-freshness');
    expect(evidence.missing).toContain('all-replacement-node-readiness');
    expect(evidence.missing).not.toContain('complete-current-up-interfaces');
    expect(evidence.missing).not.toContain('complete-bgp-route-exchange');
    expect(evidence.missing).not.toContain('current-reviewed-traffic');
    await expect(acceptance.qualifyOperational(ref, f.identity)).rejects.toBeInstanceOf(
      AzureReplacementReadingsAcceptanceUnavailable,
    );
    await expect(acceptance.qualifyCompletedOperational(ref, f.identity, 'historical')).rejects.toMatchObject({
      evidence,
    });
    expect(f.state.commands).toBe(before);
    const reopened = createAzureReplacementReadingsAcceptance(await f.open());
    await expect(reopened.inspect(ref, f.identity, 'current')).rejects.toThrow(/current acquisition/);
    expect(await reopened.inspect(ref, f.identity, 'historical')).toEqual(evidence);
    await expect(acceptance.inspect({ ...ref, purpose: 'final' }, f.identity, 'current')).rejects.toThrow(/purpose/);
    await expect(
      acceptance.inspect(ref, { ...f.identity, journalSha256: 'f'.repeat(64) }, 'current'),
    ).rejects.toThrow();
    await expect(
      acceptance.inspect({ ...ref, publicationSha256: 'f'.repeat(64) }, f.identity, 'current'),
    ).rejects.toThrow();
    await expect(acceptance.inspect(ref, f.identity, 'invalid' as 'current')).rejects.toThrow(/mode/);
    await session.retireSigningMaterial();
    await expect(acceptance.inspect(ref, f.identity, 'current')).rejects.toThrow(/current acquisition/);
    expect(await acceptance.inspect(ref, f.identity, 'historical')).toEqual(evidence);
  }, 180000);

for (const readiness of ['ready', 'not-ready', 'partial'])
  test(`native all-node ${readiness} configuration readiness remains separate from operational acceptance`, async () => {
    const f = await fixture(true, readiness),
      session = await f.open(),
      acceptance = createAzureReplacementReadingsAcceptance(session);
    const ref = await acceptance.collectOperational(f.identity, 'preflight');
    const evidence = await acceptance.inspect(ref, f.identity, 'current');
    expect(evidence.status).toBe('unknown');
    expect(evidence.missing).toContain('all-node-operational-health');
    expect(evidence.missing).toContain('original-sample-freshness');
    expect(evidence.missing.includes('all-replacement-node-readiness')).toBe(readiness !== 'ready');
    await expect(acceptance.qualifyOperational(ref, f.identity)).rejects.toMatchObject({ evidence });
    await session.retireSigningMaterial();
  }, 180000);

for (const fault of ['down', 'partial', 'unqualified'])
  test(`native richer ${fault} facts cannot satisfy acceptance or trigger active traffic`, async () => {
    const f = await fixture();
    f.state.fault = fault;
    const session = await f.open(),
      acceptance = createAzureReplacementReadingsAcceptance(session);
    const ref = await acceptance.collectOperational(f.identity, 'preflight');
    const evidence = await acceptance.inspect(ref, f.identity, 'current');
    expect(evidence.status).toBe('unknown');
    expect(evidence.interfaceState).toBe(fault === 'down' ? 'down' : fault === 'partial' ? 'unknown' : 'observed');
    expect(evidence.missing).toContain('complete-current-up-interfaces');
    expect(evidence.missing).toContain('original-sample-freshness');
    expect(evidence.missing).toContain('current-reviewed-traffic');
    expect(f.state.commands).toBe(0);
    if (fault === 'partial') expect(evidence.missing).toContain('all-replacement-node-readiness');
    await expect(acceptance.qualifyOperational(ref, f.identity)).rejects.toMatchObject({ evidence });
    await session.retireSigningMaterial();
  }, 120000);

test('native acceptance rejects cancellation and source drift before observations', async () => {
  const f = await fixture(),
    session = await f.open(),
    acceptance = createAzureReplacementReadingsAcceptance(session);
  const controller = new AbortController();
  controller.abort(Error('acceptance cancelled'));
  await expect(acceptance.collectOperational(f.identity, 'preflight', controller.signal)).rejects.toThrow(/cancelled/);
  await expect(acceptance.inspect({}, f.identity, 'current', controller.signal)).rejects.toThrow(/cancelled/);
  const calls = f.observationState.calls.length;
  f.plan.siteName += '-changed';
  await expect(acceptance.collectOperational(f.identity, 'preflight')).rejects.toThrow(/session changed/);
  expect(f.observationState.calls.length).toBe(calls);
});
