import { expect, spyOn, test } from 'bun:test';
import { CeApiError } from '../../../platform/src/ce/runtime';
import type { CePlatformService } from '../../../platform/src/ce/service';
import { VerifiedUpgradeContract } from '../../../platform/src/ce/upgrade-contract';
import type { CeTerraformService } from '../../../terraform/src/service';
import { type AwsCeToolContext, saveAwsPlan } from '../../src/ce/artifacts';
import { awsTerraformService, executeAwsCeTerraformApply } from '../../src/ce/terraform-apply';
import type { AwsCeObservation } from '../../src/ce/types';
import { admissionFixture } from './terraform-admission-fixture';

for (const brownfield of [false, true])
  test(`public Terraform apply persists approval and resumes without asking again (${brownfield ? 'brownfield' : 'greenfield'})`, async () => {
    const f = admissionFixture(false, false, brownfield);
    Object.assign(f.runtime, {
      resourceMutation: async () => ({}),
      reconcileTerraformResources: async () => {},
      observeOwnedSite: async () => {
        throw new CeApiError('not-found', 404);
      },
    });
    let confirms = 0;
    let preflights = 0;
    let prepared = false;
    const artifacts: string[] = [];
    const ctx: AwsCeToolContext = {
      cwd: '/tmp',
      hasUI: true,
      ui: {
        async confirm() {
          confirms++;
          return true;
        },
      },
      sessionManager: {
        getSessionId: () => 'tf-apply-fixture',
        getArtifactsDir: () => null,
        getArtifactPath: async () => null,
        saveArtifact: async (value) => {
          artifacts.push(value);
          return String(artifacts.length);
        },
      },
    };
    const baseline = {} as AwsCeObservation;
    await saveAwsPlan(ctx.sessionManager, f.plan, baseline);
    const platform = { storage: async () => f.storage, runtime: async () => f.runtime } as unknown as CePlatformService;
    const terraform: CeTerraformService = {
      async open(_owner, _deployment, resume) {
        if (!resume && prepared) throw Object.assign(new Error('existing'), { code: 'EEXIST' });
        prepared = true;
        return f.session;
      },
    };
    const input = { planId: f.plan.planId, planSha256: f.plan.planSha256 };
    const preflight = async () => {
      preflights++;
      return baseline;
    };
    expect(
      (await executeAwsCeTerraformApply(input, ctx, f.api, platform, terraform, fetch, undefined, preflight)).status,
    ).toBe('pending-registration');
    expect(confirms).toBe(1);
    expect(preflights).toBe(4);
    f.healthy();
    expect(
      (await executeAwsCeTerraformApply(input, ctx, f.api, platform, terraform, fetch, undefined, preflight)).status,
    ).toBe('registered');
    expect(confirms).toBe(1);
    expect(
      artifacts.filter((value) => value.includes('routing')).every((value) => !value.includes('/etc/vpm/user_data')),
    ).toBe(true);
    await f.storage.write('terraform-authorization.json', {
      schemaVersion: 1,
      engine: 'native',
      planSha256: f.plan.planSha256,
      mutations: true,
      f5StateOwner: 'terraform',
    });
    await expect(
      executeAwsCeTerraformApply(input, ctx, f.api, platform, terraform, fetch, undefined, preflight),
    ).rejects.toThrow('authorization checkpoint');
    await expect(
      executeAwsCeTerraformApply({ ...input, f5Evidence: true } as typeof input, ctx, f.api, platform, terraform),
    ).rejects.toThrow('only the persisted');
  });

test('Terraform service dispatch uses the supported bus and propagates cancellation', async () => {
  const service = {} as CeTerraformService;
  expect(
    await awsTerraformService({
      events: {
        emit(channel: string, request: { version: number; resolve(value: CeTerraformService): void }) {
          expect(channel).toBe('xcsh:ce-terraform:v1:service');
          expect(request.version).toBe(1);
          request.resolve(service);
        },
      },
    }),
  ).toBe(service);
  await expect(awsTerraformService({}, AbortSignal.abort())).rejects.toThrow('cancelled');
  await expect(
    awsTerraformService({
      events: {
        emit() {
          throw new Error('bus failed');
        },
      },
    }),
  ).rejects.toThrow('unavailable');
});

test('public apply resumes a durable direct import before re-entering bootstrap admission', async () => {
  const f = admissionFixture(false, false, true);
  Object.assign(f.runtime, { resourceMutation: async () => ({}), reconcileTerraformResources: async () => {} });
  const { canonicalSha256 } = await import('../../src/ce/canonical');
  const { planId: _id, planSha256: _sha, ...draft } = f.plan;
  draft.intent.routes = [{ routeTableId: 'rtb-34567890', destinationCidr: '192.0.2.0/24', node: 1 }];
  const sha = canonicalSha256(draft);
  const plan = { ...draft, planSha256: sha, planId: `aws-ce-${sha.slice(0, 24)}` };
  const { prepareAwsTerraformBrownfieldBinding } = await import('../../src/ce/terraform-brownfield-binding');
  await prepareAwsTerraformBrownfieldBinding(plan, f.storage, f.api);
  await f.storage.write('terraform-direct-import-source.json', { intentionallyIncomplete: true });
  await f.storage.write('terraform-authorization.json', {
    schemaVersion: 1,
    engine: 'terraform',
    planSha256: sha,
    mutations: true,
    f5StateOwner: 'terraform',
  });
  const ctx = {
    cwd: '/tmp',
    hasUI: false,
    ui: {
      confirm: async () => {
        throw Error('unexpected approval');
      },
    },
    sessionManager: {
      getSessionId: () => 'direct-resume-fixture',
      getArtifactsDir: () => null,
      getArtifactPath: async () => null,
      saveArtifact: async () => 'receipt',
    },
  } as AwsCeToolContext;
  await saveAwsPlan(ctx.sessionManager, plan, {} as AwsCeObservation);
  await expect(
    executeAwsCeTerraformApply(
      { planId: plan.planId, planSha256: sha },
      ctx,
      f.api,
      { storage: async () => f.storage, runtime: async () => f.runtime } as unknown as CePlatformService,
      {
        open: async () => {
          throw Error('direct route runner opening reached');
        },
      },
      fetch,
      undefined,
      async () => ({}) as AwsCeObservation,
    ),
  ).rejects.toThrow('direct route runner opening reached');
  expect(f.bootstrapped).toEqual([]);
});

for (const marker of [
  'aws-terraform-lifecycle-retirement.json',
  'terraform-cloud-teardown-source.json',
  'terraform-f5-cancellation-pending.json',
])
  test(`public deployment resume rejects ${marker} before reconciliation or runner opening`, async () => {
    const f = admissionFixture(false, false, true);
    let reconciles = 0;
    Object.assign(f.runtime, {
      resourceMutation: async () => ({}),
      reconcileTerraformResources: async () => {
        reconciles++;
      },
      observeOwnedSite: async () => {
        throw new CeApiError('not-found', 404);
      },
    });
    await f.storage.write(marker, { deliberatelyMalformed: true });
    const ctx = {
      cwd: '/tmp',
      hasUI: false,
      ui: {
        confirm: async () => {
          throw Error('unexpected approval');
        },
      },
      sessionManager: {
        getSessionId: () => `retired-${marker}`,
        getArtifactsDir: () => null,
        getArtifactPath: async () => null,
        saveArtifact: async () => 'receipt',
      },
    } as AwsCeToolContext;
    await saveAwsPlan(ctx.sessionManager, f.plan, {} as AwsCeObservation);
    await expect(
      executeAwsCeTerraformApply(
        { planId: f.plan.planId, planSha256: f.plan.planSha256 },
        ctx,
        f.api,
        { storage: async () => f.storage, runtime: async () => f.runtime } as unknown as CePlatformService,
        {
          open: async () => {
            throw Error('runner reached');
          },
        },
        fetch,
        undefined,
        async () => ({}) as AwsCeObservation,
      ),
    ).rejects.toThrow('retirement');
    expect(reconciles).toBe(0);
    expect(f.bootstrapped).toEqual([]);
  });

test('public Terraform apply persists sanitized pending version provenance before replacement shutdown', async () => {
  const f = admissionFixture();
  const siteName = f.plan.intent.topology.sites?.[0].name ?? 'missing';
  const preparation = {
    evidenceKind: 'preboot-interface-configuration-required',
    planId: f.plan.planId,
    planSha256: f.plan.planSha256,
    uid: 'site-uid',
    contractFingerprint: `sha256:${'a'.repeat(64)}`,
  };
  await f.storage.write(`terraform-interface-mtu-${siteName}.json`, preparation);
  await f.storage.write('terraform-authorization.json', {
    schemaVersion: 1,
    engine: 'terraform',
    planSha256: f.plan.planSha256,
    mutations: true,
    f5StateOwner: 'terraform',
  });
  Object.assign(f.runtime, {
    resourceMutation: async () => ({}),
    reconcileTerraformResources: async () => {},
    engine: 'terraform',
    observeUpgrade: async () => ({
      status: 'unknown',
      reason: 'authorization',
      failedStage: 'physical-site',
      response: 'private-response-marker',
      token: 'private-token-marker',
    }),
  });
  const artifacts: string[] = [];
  const ctx = {
    cwd: '/tmp',
    hasUI: false,
    sessionManager: {
      getSessionId: () => 'pending-version-fixture',
      getArtifactsDir: () => null,
      getArtifactPath: async () => null,
      saveArtifact: async (value: string) => {
        artifacts.push(value);
        return 'receipt';
      },
    },
  } as AwsCeToolContext;
  await saveAwsPlan(ctx.sessionManager, f.plan, {} as AwsCeObservation);
  const contract = spyOn(VerifiedUpgradeContract, 'release').mockResolvedValue({
    fingerprint: `sha256:${'b'.repeat(64)}`,
  } as VerifiedUpgradeContract);
  try {
    const result = await executeAwsCeTerraformApply(
      { planId: f.plan.planId, planSha256: f.plan.planSha256 },
      ctx,
      f.api,
      { storage: async () => f.storage, runtime: async () => f.runtime } as unknown as CePlatformService,
      { open: async () => f.session },
      fetch,
      undefined,
      async () => ({}) as AwsCeObservation,
    );
    expect(result).toMatchObject({
      status: 'pending-replacement-versions',
      artifactId: 'receipt',
      versionEvidence: { status: 'unknown', reason: 'authorization', failedStage: 'physical-site' },
    });
    const checkpoint = JSON.parse(artifacts.at(-1) ?? 'null');
    expect(checkpoint.versionEvidence).toEqual(result.versionEvidence);
    expect(JSON.stringify(result)).not.toContain('private-response-marker');
    expect(artifacts.at(-1)).not.toContain('private-token-marker');
    expect(await f.storage.read(`terraform-interface-mtu-${siteName}.json`)).toEqual(preparation);
    await expect(f.storage.read(`terraform-initial-replacement-${siteName}.json`)).rejects.toThrow('missing');
    expect(f.nodes.size).toBe(0);
  } finally {
    contract.mockRestore();
  }
});
