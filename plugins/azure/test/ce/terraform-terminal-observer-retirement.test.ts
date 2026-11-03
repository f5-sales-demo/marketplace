import { expect } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from './owned-fixture-test';

// Keep modeled external/stage boundaries in a separate process. The actual finalizer,
// original native source, replacement issuer and private-key retirement execute unchanged.
// The next native phase deliberately fails: this test never claims completed cloud cleanup.
const worker = String.raw`
import { expect, mock } from 'bun:test';
import { mkdtemp, readFile, writeFile, lstat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const root = __SOURCE_ROOT__;
const actualHistory = await import(root + '/plugins/azure/src/ce/terraform-teardown-stage-history.ts');
mock.module(root + '/plugins/azure/src/ce/terraform-teardown-stage-history.ts', () => ({
  ...actualHistory,
  qualifyAzureTerraformTeardownStageHistory: async () => ({ stages: [], failovers: [], upgrades: [] }),
  recheckAzureTerraformTeardownStageHistory: async () => { throw Error('Unused modeled stage admission'); },
}));
let cloudAbsent = true;
const actualDestroy = await import(root + '/plugins/azure/src/ce/terraform-destroy-ownership.ts');
mock.module(root + '/plugins/azure/src/ce/terraform-destroy-ownership.ts', () => ({
  ...actualDestroy,
  observeAzureTerraformDestroyBoundary: async () => ({ status: cloudAbsent ? 'absent' : 'unknown' }),
}));
const actualPlanning = await import(root + '/plugins/azure/src/ce/terraform-network-terminal-planning.ts');
mock.module(root + '/plugins/azure/src/ce/terraform-network-terminal-planning.ts', () => ({
  ...actualPlanning,
  prepareAzureTerraformNetworkTerminalPlanning: async () => { throw Error('modeled-next-native-phase'); },
}));
const { test } = await import(root + '/plugins/azure/test/ce/owned-fixture-test.ts');
const { replacementOperationalIdentityFixture } = await import(root + '/plugins/azure/test/ce/network-replacement-operational-identity-fixture.ts');
const { createAzureReplacementReadingsAcquisitionSession } = await import(root + '/plugins/azure/src/ce/network-replacement-readings-session.ts');
const { createAzureReplacementAcquisitionSession } = await import(root + '/plugins/azure/src/ce/network-replacement-operational-session.ts');
const { finalizeAzureTerraformRunnerCleanup } = await import(root + '/plugins/azure/src/ce/terraform-terminal-cleanup.ts');
const { savePlanArtifact } = await import(root + '/plugins/azure/src/ce/artifacts.ts');
const { canonicalSha256 } = await import(root + '/plugins/azure/src/ce/canonical.ts');
const { observation } = await import(root + '/plugins/azure/test/ce/fixtures.ts');
for (const absent of [false, true]) test('actual terminal observer retirement requires modeled external absence ' + absent, async () => {
  cloudAbsent = absent;
  const f = await replacementOperationalIdentityFixture();
  const directory = await mkdtemp(join(tmpdir(), 'terminal-observer-public-'));
  try {
    let serial = 0; const paths = new Map();
    const publicSession = { getSessionId: () => directory, getArtifactsDir: () => directory,
      getArtifactPath: async id => paths.get(id) ?? null,
      saveArtifact: async (content, type) => { const id = String(++serial), path = join(directory, id + '.' + type + '.log'); await writeFile(path, content, { mode: 0o600 }); paths.set(id, path); return id; } };
    for (const plan of [f.birth.original, f.network, f.plan]) await savePlanArtifact(publicSession, plan, observation);
    const collector = await createAzureReplacementAcquisitionSession(f.plan, f.runtime, f.executionApi, f.store,
      f.session, f.observationDependencies, publicSession);
    const reference = await collector.collect(f.identity, 'preflight');
    const richer = await createAzureReplacementReadingsAcquisitionSession(f.plan, f.runtime, f.executionApi, f.store, f.session, f.observationDependencies, publicSession);
    const richerReference = await richer.collect(f.identity, 'preflight');
    const richerKeyPath = join(f.store.directory, 'azure-replacement-readings-observer-key.json');
    const keyPath = join(f.store.directory, 'azure-replacement-observer-key.json');
    const keyExists = async () => { try { await lstat(keyPath); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
    const publicPath = [...paths.values()].find(path => path.endsWith('.azure-ce-replacement-operational-issuer.log'));
    if (!publicPath) throw Error('Original issuer binding missing');
    const hash = bytes => createHash('sha256').update(bytes).digest('hex');
    const originalPublic = hash(await readFile(publicPath));
    const richerPublicPath = [...paths.values()].find(path => path.endsWith('.azure-ce-replacement-readings-operational-issuer.log'));
    if (!richerPublicPath) throw Error('Richer original issuer binding missing');
    const richerPublic = hash(await readFile(richerPublicPath));
    const siteFingerprint = 'sha256:' + 'a'.repeat(64), ingressFingerprint = 'sha256:' + 'b'.repeat(64);
    const teardown = { planId: 'modeled-terminal-teardown', sourcePlanSha256: f.birth.original.planSha256,
      drain: { siteContractFingerprint: siteFingerprint, ingressContractFingerprint: ingressFingerprint, listeners: [], origins: [] } };
    await f.store.write(teardown.planId + '.json', teardown);
    let absenceCalls = 0;
    const runtime = { ...f.runtime, contract: { fingerprint: siteFingerprint },
      unregisteredAbsence: async () => { absenceCalls++; const now = new Date().toISOString(); return {
        status: 'absent', owner: f.store.owner, siteContractFingerprint: siteFingerprint,
        ingressContractFingerprint: ingressFingerprint, startedAt: now, observedAt: now, sources: ['modeled-platform-query'],
      }; } };
    const networkContext = { terraform: f.terraform, destroyTeardown: teardown, publicSession,
      loaders: f.observationDependencies.loaders, verifier: f.observationDependencies.qualifyHistorical,
      replacementVerifier: f.observationDependencies.qualifyReplacementCompleted, site: f.binding.site };
    const result = finalizeAzureTerraformRunnerCleanup(f.birth.original, teardown, runtime,
      { fingerprint: ingressFingerprint }, f.session, f.store, f.executionApi, {}, undefined, f.terraform, networkContext);
    await expect(result).rejects.toThrow(absent ? 'modeled-next-native-phase' : 'Fresh Azure cloud absence unavailable');
    expect(absenceCalls).toBeGreaterThan(0);
    expect(await keyExists()).toBe(!absent);
    try { await lstat(richerKeyPath); expect(absent).toBe(false); } catch(error) { if(error.code!=='ENOENT') throw error; expect(absent).toBe(true); }
    expect(hash(await readFile(richerPublicPath))).toBe(richerPublic);
    if(absent) expect((await (await createAzureReplacementReadingsAcquisitionSession(f.plan, f.runtime, f.executionApi, f.store, f.session, f.observationDependencies, publicSession)).authenticate(richerReference, f.identity, 'preflight', 'historical')).status).toBe('authenticated');
    expect(hash(await readFile(publicPath))).toBe(originalPublic);
    if (absent) expect((await (await createAzureReplacementAcquisitionSession(f.plan, f.runtime, f.executionApi,
      f.store, f.session, f.observationDependencies, publicSession)).authenticate(reference, f.identity, 'preflight', 'historical')).status).toBe('authenticated');
    expect(f.state.applies).toBe(0); expect(f.state.bootstraps).toBe(0);
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 60000);
`;

test('actual terminal entry retires replacement keys only after external absence checks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'terminal-observer-worker-'));
  try {
    const path = join(directory, 'isolated-terminal-observer.test.ts');
    await writeFile(path, worker.replace('__SOURCE_ROOT__', JSON.stringify(process.cwd())), { mode: 0o600 });
    const child = Bun.spawn([process.execPath, 'test', '--max-concurrency=1', path], {
      cwd: process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (code !== 0) throw Error('Isolated terminal observer regression failed:\n' + stdout + stderr);
    expect(code).toBe(0);
    expect(stdout + stderr).toMatch(/2 pass/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 180000);
