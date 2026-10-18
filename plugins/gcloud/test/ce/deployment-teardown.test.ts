import { afterEach, expect, it } from 'bun:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Type } from '@sinclair/typebox';
import type { CePlatformService } from '../../../platform/src/ce/service';
import { translateGcpNativeCompute } from '../../src/ce/compute-plan';
import { GCP_CE_API_RELEASE } from '../../src/ce/contract';
import { applyGcpDeploymentTeardown, planGcpDeploymentTeardown } from '../../src/ce/deployment-teardown';
import { fingerprint } from '../../src/ce/discovery';
import { recordGcpResource } from '../../src/ce/ownership';
import { createGcpCeTools } from '../../src/tools/gcp-ce';
import { intent } from './fixtures';

const temporaryDirectories = new Set<string>();
afterEach(async () => {
  for (const directory of temporaryDirectories) await rm(directory, { recursive: true, force: true });
  temporaryDirectories.clear();
});

async function fixture() {
  const i = intent();
  i.routing.destinationCidrs = [];
  const files = new Map<string, unknown>();
  const store = {
    directory: await realpath(await mkdtemp(join(tmpdir(), 'gcp-teardown-fixture-'))),
    verify: async () => {},
    read: async (name: string) => {
      if (!files.has(name)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return structuredClone(files.get(name));
    },
    write: async (name: string, value: unknown) => {
      files.set(name, structuredClone(value));
    },
    exclusive: async <T>(fn: () => Promise<T>) => fn(),
  };
  temporaryDirectories.add(store.directory);
  await store.write('gcp-deployment-intent.json', {
    intent: i,
    intentFingerprint: fingerprint(i),
    platformContext: i.platformContext,
  });
  const prefix = `https://www.googleapis.com/compute/v1/projects/${i.project}`;
  const resources = [
    { kind: 'instance' as const, selfLink: `${prefix}/zones/${i.sites[0].nodes[0].zone}/instances/node-a` },
    { kind: 'disk' as const, selfLink: `${prefix}/zones/${i.sites[0].nodes[0].zone}/disks/node-a` },
    { kind: 'network' as const, selfLink: `${prefix}/global/networks/outside` },
    { kind: 'network' as const, selfLink: `${prefix}/global/networks/inside` },
    { kind: 'subnetwork' as const, selfLink: `${prefix}/regions/${i.region}/subnetworks/outside` },
    { kind: 'subnetwork' as const, selfLink: `${prefix}/regions/${i.region}/subnetworks/inside` },
  ].map((row, index) => ({
    ...row,
    id: String(index + 1),
    project: i.project,
    deploymentName: i.deploymentName,
    engine: 'native' as const,
    ...(['instance', 'disk'].includes(row.kind) ? { siteName: i.sites[0].name, nodeName: 'node-a' } : {}),
  }));
  for (const resource of resources) await recordGcpResource(store, resource);
  let mutations = 0;
  const live = new Map(resources.map((r) => [r.selfLink, r]));
  const api = {
    exec: async (_command: string, args: string[]) => {
      const name = args[args[2] === 'subnets' ? 4 : 3];
      const resource = [...live.values()].find(
        (r) =>
          r.selfLink.endsWith(`/${name}`) &&
          (args[1] === 'instances'
            ? r.kind === 'instance'
            : args[1] === 'disks'
              ? r.kind === 'disk'
              : args[2] === 'subnets'
                ? r.kind === 'subnetwork'
                : r.kind === 'network'),
      );
      if (args.includes('delete')) {
        mutations++;
        if (resource) live.delete(resource.selfLink);
        return { stdout: '[]', stderr: '', exitCode: 0 };
      }
      return resource
        ? { stdout: JSON.stringify(resource), stderr: '', exitCode: 0 }
        : { stdout: '', stderr: 'not found', exitCode: 1 };
    },
  };
  let siteAbsent = false,
    tokenAbsent = false;
  const platform = {
    storage: async () => store,
    gcpLifecycle: async () => ({
      observeTeardown: async () => ({
        siteName: i.sites[0].name,
        siteUid: 'site-uid',
        tokenName: 'node-a-token',
        tokenIdentityHash: fingerprint({ uid: 'token-uid' }),
        siteAbsent,
        tokenAbsent,
      }),
      revokeToken: async () => {
        mutations++;
        tokenAbsent = true;
        return { absent: true };
      },
      deleteSite: async () => {
        mutations++;
        siteAbsent = true;
        return { absent: true };
      },
    }),
  } as unknown as CePlatformService;
  const boundary = {
    release: GCP_CE_API_RELEASE,
    fingerprint: 'contract',
    availability: 'unavailable' as const,
    reason: 'gcp_provider_requires_consumer_qualification' as const,
    singleNodeLifecycle: { availability: 'evidence_backed_single_node' },
  };
  const policy = {
    identity: 'f5xc-ce-automation-policy/v2' as const,
    url: 'https://example.test/policy',
    observedAt: new Date().toISOString(),
    normalizedSha256: `sha256:${'a'.repeat(64)}`,
  };
  return { i, store, platform, api, boundary, policy, resources, live, mutations: () => mutations };
}
it('reviews and cleans interrupted native creation using completed journal identities only', async () => {
  const f = await fixture();
  const cloud = translateGcpNativeCompute(f.i);
  const partial = f.resources.filter((resource) => resource.kind === 'network' || resource.kind === 'subnetwork');
  await f.store.write('gcp-resources.json', {
    schemaVersion: 1,
    project: f.i.project,
    deploymentName: f.i.deploymentName,
    engine: 'native',
    resources: partial,
  });
  await f.store.write(`gcp-create-${cloud.sha256.slice(7)}.json`, {
    planHash: cloud.sha256,
    actions: Object.fromEntries(
      cloud.actions.filter((action) => action.kind !== 'instance').map((action) => [action.id, { state: 'done' }]),
    ),
  });
  f.live.clear();
  for (const resource of partial) f.live.set(resource.selfLink, resource);
  const plan = await planGcpDeploymentTeardown(f.platform, f.api, f.i, f.boundary, f.policy);
  expect(plan.cloud.resources).toHaveLength(4);
  expect(f.mutations()).toBe(0);
  const evidence = await applyGcpDeploymentTeardown(f.platform, f.api, f.i, plan.planHash, f.boundary, f.policy);
  expect(evidence.state).toBe('done');
  expect(f.live.size).toBe(0);
});

it('refuses partial teardown with an ambiguous create or an unjournaled ledger identity', async () => {
  const f = await fixture();
  const cloud = translateGcpNativeCompute(f.i);
  const resource = f.resources.find((resource) => resource.kind === 'network');
  await f.store.write('gcp-resources.json', {
    schemaVersion: 1,
    project: f.i.project,
    deploymentName: f.i.deploymentName,
    engine: 'native',
    resources: [resource],
  });
  for (const actions of [
    { 'network-outside': { state: 'done' }, 'subnetwork-outside': { state: 'submitting' } },
    { 'network-inside': { state: 'done' } },
  ]) {
    await f.store.write(`gcp-create-${cloud.sha256.slice(7)}.json`, { planHash: cloud.sha256, actions });
    await expect(planGcpDeploymentTeardown(f.platform, f.api, f.i, f.boundary, f.policy)).rejects.toThrow();
  }
  expect(f.mutations()).toBe(0);
});
it('creates a persisted reviewable teardown without mutation and binds exact cloud/site/token identities', async () => {
  const f = await fixture();
  const plan = await planGcpDeploymentTeardown(f.platform, f.api, f.i, f.boundary, f.policy);
  expect(plan.operation).toBe('teardown');
  expect(plan.cloud.resources).toHaveLength(6);
  expect(plan.platform.siteUid).toBe('site-uid');
  expect(plan.engine).toBe('native');
  expect(f.mutations()).toBe(0);
  expect(await f.store.read(`gcp-reviewed-${plan.planHash.slice(7)}.json`)).toEqual(plan);
});
it('refuses altered approval and replaced cloud identity before any deletion', async () => {
  const f = await fixture();
  const plan = await planGcpDeploymentTeardown(f.platform, f.api, f.i, f.boundary, f.policy);
  await expect(applyGcpDeploymentTeardown(f.platform, f.api, f.i, 'wrong', f.boundary, f.policy)).rejects.toThrow();
  f.live.set(f.resources[5].selfLink, { ...f.resources[5], id: '999' });
  await expect(applyGcpDeploymentTeardown(f.platform, f.api, f.i, plan.planHash, f.boundary, f.policy)).rejects.toThrow(
    'ownership',
  );
  expect(f.mutations()).toBe(0);
});

it('typed teardown plans first, applies its exact saved hash, and rechecks cloud/site/token absence', async () => {
  const f = await fixture();
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'gcp-teardown-')));
  f.store.directory = directory;
  try {
    const tools = createGcpCeTools(
      { typebox: { Type } },
      () => f.api,
      async () => f.boundary,
      async () => f.platform,
      undefined,
      async () => f.policy,
    );
    const teardown = tools.find((tool) => tool.name === 'gcp_ce_teardown');
    const apply = tools.find((tool) => tool.name === 'gcp_ce_apply');
    const planning = tools.find((tool) => tool.name === 'gcp_ce_plan');
    if (!teardown || !apply || !planning) throw new Error('Missing lifecycle tools');
    const scope = {
      project: f.i.project,
      region: f.i.region,
      deploymentName: f.i.deploymentName,
      platformContext: f.i.platformContext,
      engine: 'native' as const,
      operation: 'teardown' as const,
    };
    const reviewed = await teardown.execute('plan', scope, undefined, null, { cwd: directory });
    expect(reviewed.isError).toBeUndefined();
    expect(f.mutations()).toBe(0);
    const plan = reviewed.details.plan as { planHash: string };
    const rejected = await planning.execute(
      'plan-with-authorization',
      { ...scope, approvedPlanHash: plan.planHash },
      undefined,
      null,
      { cwd: directory },
    );
    expect(rejected.isError).toBe(true);
    expect(rejected.details.mutationAttempted).toBe(false);
    expect(f.mutations()).toBe(0);
    const outcome = await apply.execute('apply', { ...scope, approvedPlanHash: plan.planHash }, undefined, null, {
      cwd: directory,
    });
    expect(outcome.isError).toBeUndefined();
    expect(outcome.details.state).toBe('done');
    expect(outcome.details.cloudAbsent).toBe(6);
    expect(outcome.details.mutationAttempted).toBe(true);
    expect(f.live.size).toBe(0);
    expect(f.mutations()).toBe(8);
  } finally {
    await rm(directory, { recursive: true });
  }
});

it('stale initial reviews cannot authorize deletion', async () => {
  const f = await fixture();
  const plan = await planGcpDeploymentTeardown(f.platform, f.api, f.i, f.boundary, f.policy);
  const { planHash: _hash, ...body } = plan;
  const staleBody = { ...body, createdAt: '2000-01-01T00:00:00Z' };
  const stale = { ...staleBody, planHash: fingerprint(staleBody) };
  await f.store.write(`gcp-reviewed-${stale.planHash.slice(7)}.json`, stale);
  await expect(
    applyGcpDeploymentTeardown(f.platform, f.api, f.i, stale.planHash, f.boundary, f.policy),
  ).rejects.toThrow('stale');
  expect(f.mutations()).toBe(0);
});
it('resumes an authorized lost delete response without repeating the deletion after review expiry', async () => {
  const f = await fixture();
  f.store.directory = await realpath(await mkdtemp(join(tmpdir(), 'gcp-teardown-resume-')));
  try {
    const plan = await planGcpDeploymentTeardown(f.platform, f.api, f.i, f.boundary, f.policy);
    let interrupted = false;
    const api = {
      exec: async (command: string, args: string[]) => {
        const response = await f.api.exec(command, args);
        if (args.includes('delete') && !interrupted) {
          interrupted = true;
          throw new Error('lost response');
        }
        return response;
      },
    };
    await expect(applyGcpDeploymentTeardown(f.platform, api, f.i, plan.planHash, f.boundary, f.policy)).rejects.toThrow(
      'lost response',
    );
    expect(f.mutations()).toBe(1);
    expect(await f.store.read(`gcp-authorized-${plan.planHash.slice(7)}.json`)).toEqual({ planHash: plan.planHash });
    const actualNow = Date.now;
    Date.now = () => actualNow() + 6 * 60_000;
    try {
      const refreshedPolicy = { ...f.policy, observedAt: new Date(Date.now()).toISOString() };
      const outcome = await applyGcpDeploymentTeardown(
        f.platform,
        api,
        f.i,
        plan.planHash,
        f.boundary,
        refreshedPolicy,
      );
      expect(outcome.state).toBe('done');
      expect(f.mutations()).toBe(8);
      expect(f.live.size).toBe(0);
    } finally {
      Date.now = actualNow;
    }
  } finally {
    await rm(f.store.directory, { recursive: true });
  }
});
it('wrong engine and unsupported routing refuse a teardown plan before reads or mutations', async () => {
  const f = await fixture();
  f.i.engine = 'terraform';
  await expect(planGcpDeploymentTeardown(f.platform, f.api, f.i, f.boundary, f.policy)).rejects.toThrow('native');
  f.i.engine = 'native';
  f.i.routing.destinationCidrs = ['10.3.0.0/24'];
  await expect(planGcpDeploymentTeardown(f.platform, f.api, f.i, f.boundary, f.policy)).rejects.toThrow('profile');
  expect(f.mutations()).toBe(0);
});
