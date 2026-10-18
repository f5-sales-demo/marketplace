import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../src/ce/deployment-store';
import { type CePlatformDrainPlan, drainCePlatform } from '../../src/ce/platform-drain';
import { CeApiError } from '../../src/ce/runtime';

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true });
});
const owner = {
  deploymentId: 'ce-test',
  engine: 'terraform' as const,
  provider: 'aws' as const,
  account: 'demo',
  region: 'us-east-1',
};
const binding = { owner, siteName: 'ce-one', nodes: ['node-one'] };
const plan: CePlatformDrainPlan = {
  schemaVersion: 1,
  owner,
  sourcePlanSha256: 'a'.repeat(64),
  siteContractFingerprint: 'site-contract',
  ingressContractFingerprint: 'ingress-contract',
  listeners: [{ id: 'b'.repeat(24), name: 'listener', namespace: 'default' }],
  origins: [
    {
      schemaVersion: 1,
      owner,
      origin: { name: 'origin', namespace: 'default', uid: 'origin-uid' },
      resourceVersion: 'v1',
      specSha256: 'c'.repeat(64),
      contractFingerprint: 'ingress-contract',
      observedAt: '2026-09-08T23:00:00Z',
    },
  ],
  sites: [
    {
      binding,
      siteUid: 'site-uid',
      routing: [
        { kind: 'bgp', name: 'bgp-one', uid: 'bgp-uid' },
        { kind: 'bgp_routing_policy', name: 'policy-one', uid: 'policy-uid' },
        { kind: 'external_connector', name: 'gre-one', uid: 'gre-uid' },
      ],
    },
  ],
};
async function fixture(failAt = 0) {
  const root = await mkdtemp(join(tmpdir(), 'ce-drain-'));
  dirs.push(root);
  const store = await CeDeploymentStore.open(root, owner);
  const remaining = new Set(['listener', 'origin', 'bgp-one', 'policy-one', 'gre-one']);
  const changes: string[] = [];
  const state = { siteUid: 'site-uid', engine: 'terraform' as 'native' | 'terraform', pendingOrigin: false };
  async function remove(name: string) {
    if (remaining.delete(name)) {
      changes.push(name);
      if (changes.length === failAt) throw new Error('lost mutation response');
    }
  }
  const port = {
    get engine() {
      return state.engine;
    },
    siteContractFingerprint: 'site-contract',
    ingressContractFingerprint: 'ingress-contract',
    async observeOwnedSite() {
      return { system_metadata: { uid: state.siteUid } };
    },
    async deleteListener() {
      await remove('listener');
    },
    async deleteOrigin() {
      if (state.pendingOrigin) return { status: 'pending' as const };
      await remove('origin');
      return { status: 'deleted' as const };
    },
    async deleteRouting(_binding: unknown, resource: { name: string }) {
      await remove(resource.name);
    },
  };
  return { store, port, state, remaining, changes };
}
test('platform drain resumes each lost mutation without duplicates and preserves dependency order', async () => {
  for (let boundary = 1; boundary <= 5; boundary++) {
    const f = await fixture(boundary);
    await expect(drainCePlatform(plan, f.store, f.port)).rejects.toThrow('lost mutation');
    expect((await drainCePlatform(plan, f.store, f.port)).status).toBe('platform-drained');
    expect((await drainCePlatform(plan, f.store, f.port)).status).toBe('platform-drained');
    expect(f.changes).toEqual(['listener', 'origin', 'bgp-one', 'policy-one', 'gre-one']);
    expect(f.remaining.size).toBe(0);
  }
});
test('platform drain rejects changed persisted plans, foreign engines, duplicate identities and replaced sites', async () => {
  for (const mode of ['owner', 'engine', 'duplicate', 'site', 'persisted'] as const) {
    const f = await fixture();
    const input = structuredClone(plan);
    if (mode === 'owner') input.owner.account = 'other';
    if (mode === 'engine') f.state.engine = 'native';
    if (mode === 'duplicate') input.sites[0].routing.push(input.sites[0].routing[0]);
    if (mode === 'site') f.state.siteUid = 'replaced';
    if (mode === 'persisted') await f.store.write('platform-drain-source.json', null);
    await expect(drainCePlatform(input, f.store, f.port)).rejects.toThrow();
    expect(f.changes).toEqual([]);
  }
});
test('platform drain stops at pending origin and checkpoints before honoring cancellation', async () => {
  const f = await fixture();
  f.state.pendingOrigin = true;
  expect((await drainCePlatform(plan, f.store, f.port)).status).toBe('pending-origin');
  expect(f.changes).toEqual(['listener']);
  f.state.pendingOrigin = false;
  const controller = new AbortController();
  const remove = f.port.deleteOrigin;
  f.port.deleteOrigin = async () => {
    const result = await remove();
    controller.abort();
    return result;
  };
  await expect(drainCePlatform(plan, f.store, f.port, controller.signal)).rejects.toThrow();
  expect(((await f.store.read('platform-drain-progress.json')) as { completed: string[] }).completed).toContain(
    'origin:default/origin',
  );
  expect(f.changes).toEqual(['listener', 'origin']);
  expect((await drainCePlatform(plan, f.store, f.port)).status).toBe('platform-drained');
});

test('platform drain retires an owned origin after its recorded listener is already absent', async () => {
  const f = await fixture();
  f.remaining.delete('listener');
  const input = structuredClone(plan);
  input.listeners = [];
  expect((await drainCePlatform(input, f.store, f.port)).status).toBe('platform-drained');
  expect(f.changes).toEqual(['origin', 'bgp-one', 'policy-one', 'gre-one']);
});

test('platform drain recovers checkpoint write failure and never treats forged progress as deletion evidence', async () => {
  for (let boundary = 1; boundary <= 5; boundary++) {
    const f = await fixture();
    const write = f.store.write.bind(f.store);
    let writes = 0;
    f.store.write = async (name, value) => {
      if (name === 'platform-drain-progress.json' && ++writes === boundary) throw new Error('checkpoint unavailable');
      return write(name, value);
    };
    await expect(drainCePlatform(plan, f.store, f.port)).rejects.toThrow('checkpoint unavailable');
    await write('platform-drain-progress.json', { completed: ['everything'], status: 'platform-drained' });
    expect((await drainCePlatform(plan, f.store, f.port)).status).toBe('platform-drained');
    expect(f.changes).toEqual(['listener', 'origin', 'bgp-one', 'policy-one', 'gre-one']);
  }
  const f = await fixture();
  f.state.pendingOrigin = true;
  await drainCePlatform(plan, f.store, f.port);
  const changed = structuredClone(plan);
  changed.sites[0].routing[0].uid = 'another-resource';
  await expect(drainCePlatform(changed, f.store, f.port)).rejects.toThrow('Persisted');
  expect(f.changes).toEqual(['listener']);
});

test('platform drain can reverify absent objects after sites retire without accepting a replaced site', async () => {
  const f = await fixture();
  await drainCePlatform(plan, f.store, f.port);
  f.port.observeOwnedSite = async () => {
    throw new CeApiError('not-found');
  };
  expect((await drainCePlatform(plan, f.store, f.port)).status).toBe('platform-drained');
  expect(f.changes).toEqual(['listener', 'origin', 'bgp-one', 'policy-one', 'gre-one']);
});
