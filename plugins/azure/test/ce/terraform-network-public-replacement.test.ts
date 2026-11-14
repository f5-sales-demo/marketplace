import { afterEach, expect } from 'bun:test';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { CeTerraformService } from '../../../terraform/src/service';
import { type AzureCeToolContext, savePlanArtifact } from '../../src/ce/artifacts';
import { executeAzureCeTerraformApply } from '../../src/ce/terraform-apply';
import { runAzureTerraformNetworkPublicReplacement } from '../../src/ce/terraform-network-public-replacement';
import { saveAzureTerraformOutcome } from '../../src/ce/terraform-outcome';
import { replacementOperationalIdentityFixture } from './network-replacement-operational-identity-fixture';
import { test } from './owned-fixture-test';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture(original = true) {
  const f = await replacementOperationalIdentityFixture(),
    directory = await mkdtemp(join(tmpdir(), 'public-network-replacement-'));
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
  for (const plan of [...(original ? [f.input.originalPlan] : []), f.network, f.plan])
    await savePlanArtifact(native, plan, f.birth.current);
  if (original) await saveAzureTerraformOutcome(native, await f.loaders.loadOutcome(f.input.originalPlan));
  const ctx: AzureCeToolContext = {
    cwd: directory,
    hasUI: false,
    ui: { confirm: async () => false },
    sessionManager: native,
  };
  const state = { opens: 0 };
  const terraform = {
    async open() {
      state.opens++;
      return f.session;
    },
  } as unknown as CeTerraformService;
  const platform = { storage: async () => f.store, runtime: async () => f.runtime } as unknown as CePlatformService;
  return { ...f, runtime: f.runtime as CeRuntime, ctx, native, directory, terraform, platform, publicState: state };
}

for (const owning of [false, true])
  test(`actual ${owning ? 'owning apply' : 'public replacement'} rejects unsigned predecessor acknowledgements before enrollment`, async () => {
    const f = await fixture();
    const before = process.env.XCSH_CE_HEADLESS_MUTATIONS;
    process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
    try {
      const run = () =>
        owning
          ? executeAzureCeTerraformApply(
              { planId: f.plan.planId, planSha256: f.plan.planSha256 },
              f.ctx,
              f.executionApi,
              f.platform,
              f.terraform,
              undefined,
              { observe: async () => f.birth.current },
            )
          : runAzureTerraformNetworkPublicReplacement(f.plan, f.ctx, f.terraform, f.runtime, f.store, f.executionApi);
      // The fixture's predecessor lifecycle records are modeled acknowledgements, not
      // original native acquisitions. The real public verifier must reject them.
      await expect(run()).rejects.toThrow(/original public issuer pin unavailable/);
      expect(f.observationState.sites).toBeGreaterThan(0);
      expect(f.state.applies).toBe(0);
      expect(f.state.bootstraps).toBe(0);
      expect((await readdir(f.directory)).some((name) => name.includes('operational-issuer'))).toBe(false);
      expect((await readdir(f.store.directory)).some((name) => name.endsWith('observer-key.json'))).toBe(false);
      await expect(run()).rejects.toThrow(/original public issuer pin unavailable/);
      expect(f.state.applies).toBe(0);
      expect(f.state.bootstraps).toBe(0);
    } finally {
      if (before === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
      else process.env.XCSH_CE_HEADLESS_MUTATIONS = before;
    }
  }, 180000);

test('public replacement cannot resolve an omitted original public source from private acknowledgement', async () => {
  const f = await fixture(false);
  await expect(
    runAzureTerraformNetworkPublicReplacement(f.plan, f.ctx, f.terraform, f.runtime, f.store, f.executionApi),
  ).rejects.toThrow(/original.*unresolved/i);
  expect(f.observationState.sites).toBe(0);
  expect(f.publicState.opens).toBe(0);
  expect(f.state.applies).toBe(0);
  expect(f.state.bootstraps).toBe(0);
});

test('public replacement rejects wrong engine and cancellation before owned reads', async () => {
  const f = await fixture(),
    abort = new AbortController();
  abort.abort(Error('public replacement cancelled'));
  await expect(
    runAzureTerraformNetworkPublicReplacement(
      f.plan,
      f.ctx,
      f.terraform,
      f.runtime,
      f.store,
      f.executionApi,
      abort.signal,
    ),
  ).rejects.toThrow(/cancelled/);
  await expect(
    runAzureTerraformNetworkPublicReplacement(
      f.plan,
      f.ctx,
      f.terraform,
      { ...f.runtime, engine: 'native' } as unknown as CeRuntime,
      f.store,
      f.executionApi,
    ),
  ).rejects.toThrow(/owning Terraform/i);
  expect(f.observationState.sites).toBe(0);
  expect(f.publicState.opens).toBe(0);
});
