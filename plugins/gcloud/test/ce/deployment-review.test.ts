import { afterEach, expect, it } from 'bun:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CePlatformService } from '../../../platform/src/ce/service';
import { GCP_CE_API_RELEASE, type GcpCeContractBoundary } from '../../src/ce/contract';
import {
  applyGcpDeploymentReview,
  type GcpDeploymentSources,
  planGcpDeploymentReview,
} from '../../src/ce/deployment-review';
import { fingerprint } from '../../src/ce/discovery';
import type { GcpLaunchPreflight } from '../../src/ce/preflight';
import { discovery, intent } from './fixtures';

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});
async function fixture() {
  const i = structuredClone(intent());
  i.routing.destinationCidrs = [];
  i.image.name += '-byol';
  i.image.selfLink += '-byol';
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'gcp-deploy-review-')));
  directories.push(directory);
  const files = new Map<string, unknown>();
  const store = {
    directory,
    verify: async () => {},
    read: async (name: string) => {
      if (!files.has(name)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return structuredClone(files.get(name));
    },
    write: async (name: string, value: unknown) => {
      files.set(name, structuredClone(value));
    },
  };
  const boundary: GcpCeContractBoundary = {
    release: GCP_CE_API_RELEASE,
    fingerprint: fingerprint('contract'),
    availability: 'unavailable' as const,
    reason: 'gcp_provider_requires_consumer_qualification' as const,
    singleNodeLifecycle: { availability: 'evidence_backed_single_node' },
  };
  const policy = {
    identity: 'f5xc-ce-automation-policy/v2' as const,
    url: 'https://example.test/policy',
    observedAt: new Date().toISOString(),
    normalizedSha256: fingerprint('policy'),
  };
  const funding = {
    schemaVersion: 1 as const,
    project: i.project,
    accountDomain: 'example.com',
    organizationDomain: 'example.com',
    billingAccountName: 'billingAccounts/000000-000000-000000',
    billingEnabled: true as const,
    policySha256: fingerprint('funding'),
    observedAt: new Date().toISOString(),
    sourceReceipts: Array.from({ length: 4 }, (_, n) => ({ source: String(n), sha256: fingerprint(n) })),
  };
  const preflight: GcpLaunchPreflight = {
    schemaVersion: 1,
    project: i.project,
    region: i.region,
    intentFingerprint: fingerprint(i),
    observedAt: new Date().toISOString(),
    receipts: [],
    checks: {
      iam: 'verified',
      quota: 'verified',
      organizationPolicy: 'verified',
      image: 'verified',
      machineNicLimit: 'verified',
      zone: 'verified',
      licenseUseFee: 'none',
      legalAcceptance: 'unknown',
      zoneCapacity: 'not-reserved',
    },
  };
  const authorization = { authorizationHash: fingerprint('byol') };
  let executions = 0,
    collections = 0;
  const sources: GcpDeploymentSources = {
    contract: async () => boundary,
    policy: async () => policy,
    discovery: async () => {
      collections++;
      return { ...discovery(), images: [i.image] };
    },
    preflight: async () => preflight,
    funding: async () => funding,
    byol: async () => authorization,
  };
  const platform = {
    storage: async () => store,
    gcpLifecycle: async () => ({ observeTeardown: async () => ({ siteAbsent: true, tokenAbsent: true }) }),
  } as unknown as CePlatformService;
  const api = {
    exec: async () => {
      return { stdout: '', stderr: 'not found', exitCode: 1 };
    },
  };
  const execute = async (...args: unknown[]) => {
    executions++;
    (args.at(-1) as (() => void) | undefined)?.();
    return { state: 'pending' as const, actionId: 'instance-node-a' };
  };
  return {
    i,
    files,
    store,
    boundary,
    policy,
    funding,
    preflight,
    authorization,
    sources,
    platform,
    api,
    execute,
    executions: () => executions,
    collections: () => collections,
  };
}

it('persists a complete native review without creating resources or exporting bootstrap', async () => {
  const f = await fixture();
  const plan = await planGcpDeploymentReview(f.platform, f.api, f.i, f.sources);
  expect(plan.operation).toBe('deploy');
  expect(plan.engine).toBe('native');
  expect(plan.cloud.actions).toHaveLength(5);
  expect(plan.planHash).not.toBe(plan.cloud.sha256);
  expect(plan.approval).toBe('required');
  expect(f.executions()).toBe(0);
  expect(f.files.has(`gcp-deploy-reviewed-${plan.planHash.slice(7)}.json`)).toBe(true);
  expect(JSON.stringify(plan)).not.toContain('userData');
});

it('rejects unavailable contracts, unsupported routing and wrong engines before qualification or execution', async () => {
  const f = await fixture();
  delete f.boundary.singleNodeLifecycle;
  await expect(planGcpDeploymentReview(f.platform, f.api, f.i, f.sources)).rejects.toThrow('contract');
  expect(f.collections()).toBe(0);
  const g = await fixture();
  g.i.routing.destinationCidrs = ['10.3.0.0/24'];
  await expect(planGcpDeploymentReview(g.platform, g.api, g.i, g.sources)).rejects.toThrow('profile');
  g.i.routing.destinationCidrs = [];
  g.i.engine = 'terraform';
  await expect(planGcpDeploymentReview(g.platform, g.api, g.i, g.sources)).rejects.toThrow('native');
});

it('refuses changed intent, policy, funding, documents and failed current prerequisites before mutation', async () => {
  for (const change of ['intent', 'policy', 'funding', 'documents', 'preflight', 'tamper', 'stale']) {
    const f = await fixture();
    const plan = await planGcpDeploymentReview(f.platform, f.api, f.i, f.sources);
    if (change === 'intent') f.i.diskGiB = 90;
    if (change === 'policy') f.policy.normalizedSha256 = fingerprint('new policy');
    if (change === 'funding') f.funding.policySha256 = fingerprint('new funding');
    if (change === 'documents') f.authorization.authorizationHash = fingerprint('new documents');
    if (change === 'preflight')
      f.sources.preflight = async () => ({ ...f.preflight, checks: { ...f.preflight.checks, iam: 'unavailable' } });
    if (change === 'tamper' || change === 'stale') {
      const saved = structuredClone(plan);
      if (change === 'tamper') saved.cloud.actions[0].argv.push('--unexpected');
      else saved.createdAt = new Date(Date.now() - 600_000).toISOString();
      const { planHash: _, ...body } = saved;
      saved.planHash = fingerprint(body);
      f.files.set(`gcp-deploy-reviewed-${saved.planHash.slice(7)}.json`, saved);
      await expect(
        applyGcpDeploymentReview(f.platform, f.api, f.i, saved.planHash, f.sources, undefined, undefined, f.execute),
      ).rejects.toThrow();
    } else {
      await expect(
        applyGcpDeploymentReview(f.platform, f.api, f.i, plan.planHash, f.sources, undefined, undefined, f.execute),
      ).rejects.toThrow();
    }
    expect(f.executions()).toBe(0);
  }
});

it('retains full-plan authorization across pending operations without consuming fresh quota twice', async () => {
  const f = await fixture();
  const plan = await planGcpDeploymentReview(f.platform, f.api, f.i, f.sources);
  let mutations = 0;
  const apply = () =>
    applyGcpDeploymentReview(
      f.platform,
      f.api,
      f.i,
      plan.planHash,
      f.sources,
      undefined,
      () => {
        mutations++;
      },
      f.execute,
    );
  expect((await apply()).state).toBe('pending');
  f.sources.preflight = async () => ({ ...f.preflight, checks: { ...f.preflight.checks, quota: 'unavailable' } });
  expect((await apply()).state).toBe('pending');
  expect(f.executions()).toBe(2);
  expect(mutations).toBe(2);
  f.funding.policySha256 = fingerprint('changed funding');
  await expect(apply()).rejects.toThrow();
  expect(f.executions()).toBe(2);
});

it('cannot replace the original overall authorization with another review during pending creation', async () => {
  const f = await fixture();
  const first = await planGcpDeploymentReview(f.platform, f.api, f.i, f.sources);
  await applyGcpDeploymentReview(f.platform, f.api, f.i, first.planHash, f.sources, undefined, undefined, f.execute);
  const second = await planGcpDeploymentReview(f.platform, f.api, f.i, f.sources);
  expect(second.planHash).not.toBe(first.planHash);
  await expect(
    applyGcpDeploymentReview(f.platform, f.api, f.i, second.planHash, f.sources, undefined, undefined, f.execute),
  ).rejects.toThrow('original');
  expect(f.executions()).toBe(1);
});
