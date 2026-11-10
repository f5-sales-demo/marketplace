import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { canonicalSha256 } from '../../src/ce/canonical';
import {
  coordinateAwsFoundationTeardown,
  prepareAwsFoundationTeardown,
} from '../../src/ce/terraform-foundation-teardown';
import { siteBindings } from '../../src/ce/topology';
import { foundationPlan } from './terraform-fixtures';

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true });
});
async function fixture(mode = 'absent') {
  const initial = foundationPlan();
  const { planId: _id, planSha256: _sha, ...draft } = initial;
  const normalized = {
    ...draft,
    deploymentName: initial.intent.deploymentName,
    accountId: initial.intent.accountId,
    region: initial.intent.region,
  };
  const sha = canonicalSha256(normalized);
  const base = { ...normalized, planId: `aws-ce-${sha.slice(0, 24)}`, planSha256: sha };
  const owner = siteBindings(base)[0].binding.owner;
  const root = await mkdtemp(join(tmpdir(), 'foundation-retirement-'));
  dirs.push(root);
  const storage = await CeDeploymentStore.open(root, owner);
  await storage.write('terraform-authorization.json', {
    schemaVersion: 1,
    engine: 'terraform',
    planSha256: sha,
    mutations: true,
    f5StateOwner: 'terraform',
  });
  await storage.write('terraform-workflow.json', {
    schemaVersion: 1,
    engine: 'terraform',
    planSha256: sha,
    stage: 'network-pending',
  });
  let observations = 0,
    mutations = 0;
  const observe = async () => {
    observations++;
    return {
      status: mode === 'present' || (mode === 'appeared' && observations > 1) ? 'unknown' : 'absent',
      owner,
      siteContractFingerprint: 'site',
      ingressContractFingerprint: 'ingress',
      startedAt: new Date().toISOString(),
      observedAt: new Date().toISOString(),
      sources: [],
    } as const;
  };
  const runtime = { engine: 'terraform', contract: { fingerprint: 'site' }, unregisteredAbsence: observe };
  const driver = {
    engine: 'terraform' as const,
    siteContractFingerprint: 'site',
    ingressContractFingerprint: 'ingress',
    observe,
    retireCloud: async () => {
      mutations++;
      return { status: 'terraform-state-retired' as const, sourcePlanSha256: sha, finalPlanSha256: 'a'.repeat(64) };
    },
  };
  return {
    base,
    storage,
    runtime,
    contract: { fingerprint: 'ingress' },
    driver,
    counts: () => ({ observations, mutations }),
  };
}
test('prepares distinct foundation retirement without invented sites or tokens and resumes by fresh evidence', async () => {
  const f = await fixture();
  const plan = await prepareAwsFoundationTeardown(f.base, f.runtime as never, f.contract as never, f.storage);
  expect(plan.kind).toBe('aws-ce-terraform-foundation-teardown');
  expect(plan.retirement).toEqual([]);
  expect(plan.drain.sites).toEqual([]);
  expect(await f.storage.read(`${plan.planId}.json`)).toEqual(plan);
  const first = await coordinateAwsFoundationTeardown(f.base, plan, plan.planSha256, f.storage, f.driver);
  expect(first.status).toBe('resources-retired-awaiting-inventory');
  await coordinateAwsFoundationTeardown(f.base, plan, plan.planSha256, f.storage, f.driver);
  expect(f.counts().observations).toBeGreaterThanOrEqual(5);
});
test('refuses forged authorization, advanced admission and any present platform evidence before cloud mutation', async () => {
  for (const mode of ['authorization', 'registered', 'admission', 'present']) {
    const f = await fixture(mode);
    if (mode === 'authorization') await f.storage.write('terraform-authorization.json', { planSha256: 'foreign' });
    if (mode === 'registered')
      await f.storage.write('terraform-workflow.json', {
        schemaVersion: 1,
        engine: 'terraform',
        planSha256: f.base.planSha256,
        stage: 'registered',
      });
    if (mode === 'admission') await f.storage.write('terraform-admission.json', { bootstrapByNode: { '1': 'secret' } });
    await expect(
      prepareAwsFoundationTeardown(f.base, f.runtime as never, f.contract as never, f.storage),
    ).rejects.toThrow();
    expect(f.counts().mutations).toBe(0);
  }
});
test('rechecks absence at apply and refuses tampered plans, wrong engine or changed owner', async () => {
  const f = await fixture('appeared');
  const plan = await prepareAwsFoundationTeardown(f.base, f.runtime as never, f.contract as never, f.storage);
  await expect(coordinateAwsFoundationTeardown(f.base, plan, plan.planSha256, f.storage, f.driver)).rejects.toThrow();
  expect(f.counts().mutations).toBe(0);
  const valid = await fixture();
  const p = await prepareAwsFoundationTeardown(
    valid.base,
    valid.runtime as never,
    valid.contract as never,
    valid.storage,
  );
  for (const changed of [
    { ...p, sourcePlanSha256: 'foreign' },
    { ...p, retirement: [{ siteName: 'invented' }] },
  ])
    await expect(
      coordinateAwsFoundationTeardown(valid.base, changed as never, p.planSha256, valid.storage, valid.driver),
    ).rejects.toThrow();
  await expect(
    coordinateAwsFoundationTeardown(valid.base, p, 'unauthorized', valid.storage, valid.driver),
  ).rejects.toThrow();
  await expect(
    coordinateAwsFoundationTeardown(valid.base, p, p.planSha256, valid.storage, {
      ...valid.driver,
      engine: 'native',
    } as never),
  ).rejects.toThrow();
  expect(valid.counts().mutations).toBe(0);
});

test('foundation retirement preserves unknown after post-destroy publication appears and rejects stale evidence', async () => {
  const f = await fixture();
  const p = await prepareAwsFoundationTeardown(f.base, f.runtime as never, f.contract as never, f.storage);
  let checks = 0;
  const driver = {
    ...f.driver,
    observe: async () => {
      const row = await f.driver.observe();
      return { ...row, status: ++checks > 1 ? ('unknown' as const) : ('absent' as const) };
    },
  };
  await expect(coordinateAwsFoundationTeardown(f.base, p, p.planSha256, f.storage, driver)).rejects.toThrow('absence');
  expect(f.counts().mutations).toBe(1);
  const stale = {
    ...f.driver,
    observe: async () => ({ ...(await f.driver.observe()), observedAt: '2000-01-01T00:00:00Z' }),
  };
  await expect(coordinateAwsFoundationTeardown(f.base, p, p.planSha256, f.storage, stale)).rejects.toThrow('absence');
  expect(f.counts().mutations).toBe(1);
});
