import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../src/ce/deployment-store';
import { CeIngressLifecycle } from '../../src/ce/ingress-lifecycle';
import { CeApiError, type CeOwner, type SiteBinding } from '../../src/ce/runtime';
import { buildInsideHttpListener, projectInsideHttpListener } from '../../src/ce/wire-ingress';
import { buildSiteLocalHttpOrigin, projectSiteLocalHttpOrigin } from '../../src/ce/wire-origin';
import { createWireValidator } from '../../src/ce/wire-schema';
import fixture from '../fixtures/inside-listener-schema.json';
import originFixture from '../fixtures/site-local-origin-schema.json';

const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true });
});
const validate = createWireValidator(fixture.schemas, fixture.provenance.root);
const validateOrigin = createWireValidator(originFixture.schemas, originFixture.provenance.root);
const contract = {
  projectObserved: (spec: unknown) => projectInsideHttpListener(spec, fixture.schemas, validate),
  fingerprint: `sha256:${fixture.provenance.sha256}`,
  build: (input: Parameters<typeof buildInsideHttpListener>[0]) => buildInsideHttpListener(input, validate),
  buildOrigin: (input: Parameters<typeof buildSiteLocalHttpOrigin>[0]) =>
    buildSiteLocalHttpOrigin(input, validateOrigin),
  projectOriginObserved: (spec: unknown) => projectSiteLocalHttpOrigin(spec, originFixture.schemas, validateOrigin),
};
const owner = {
  deploymentId: 'ce-test',
  engine: 'terraform' as const,
  provider: 'aws' as const,
  account: 'demo',
  region: 'us-east-1',
};
const intent = {
  name: 'ce-listener',
  namespace: 'demo',
  domain: 'ce.example.invalid',
  port: 80,
  originAddress: '192.0.2.10',
  originPool: { name: 'ce-origin', namespace: 'demo' },
};
const selections = [1, 2, 3].map((i) => ({
  binding: { owner, siteName: `ce-site-${i}`, nodes: [`node-${i}`] },
  node: `node-${i}`,
  mac: `02:00:00:00:00:0${i}`,
}));

async function setup(storeOwner: CeOwner = owner) {
  const path = await mkdtemp(join(tmpdir(), 'ce-ingress-'));
  directories.push(path);
  const store = await CeDeploymentStore.open(path, storeOwner);
  const state = {
    listener: undefined as Record<string, unknown> | undefined,
    origin: undefined as Record<string, unknown> | undefined,
    posts: 0,
    originPosts: 0,
    deletes: 0,
    lost: false,
    address: '10.20.1.10',
    originUid: 'pool-uid',
    siteUid: 'site-uid',
    engine: 'terraform' as 'native' | 'terraform',
  };
  const port = {
    get engine() {
      return state.engine;
    },
    siteFingerprint: 'site-contract',
    async observeOwnedSite(binding: SiteBinding) {
      return { system_metadata: { uid: `${state.siteUid}-${binding.siteName}` } };
    },
    async observeAwsInterfaces(binding: SiteBinding) {
      return observeInterfaces(binding);
    },
    async observeAzureInterfaces(binding: SiteBinding) {
      return observeInterfaces(binding);
    },
    async request(path: string, init?: RequestInit) {
      if (path.includes('/origin_pools')) {
        if (init?.method === 'POST') {
          state.originPosts++;
          state.origin = { ...JSON.parse(String(init.body)), system_metadata: { uid: state.originUid } };
          if (state.lost) throw new CeApiError('transient');
          return {};
        }
        if (!state.origin) throw new CeApiError('not-found');
        return structuredClone(state.origin);
      }
      if (init?.method === 'POST') {
        state.posts++;
        state.listener = { ...JSON.parse(String(init.body)), system_metadata: { uid: 'listener-uid' } };
        if (state.lost) throw new CeApiError('transient');
        return {};
      }
      if (init?.method === 'DELETE') {
        state.deletes++;
        state.listener = undefined;
        return {};
      }
      if (!state.listener) throw new CeApiError('not-found');
      return structuredClone(state.listener);
    },
  };
  function observeInterfaces(binding: SiteBinding) {
    const i = Number(binding.siteName.slice(-1));
    return {
      status: 'observed' as const,
      observedAt: new Date().toISOString(),
      interfaces: [
        {
          node: `node-${i}`,
          role: 'sli' as const,
          mac: `02:00:00:00:00:0${i}`,
          device: 'ens6',
          interfaceName: `interface-${i}`,
          mtu: 1500,
          linkUp: true as const,
          ipv4: { address: i === 1 ? state.address : `10.20.${i}.10`, prefixLength: 24 },
        },
      ],
    };
  }
  return { store, state, lifecycle: new CeIngressLifecycle(port, contract, store), port };
}

test('persists observed placements and resumes a lost create response without duplicate creation', async () => {
  const f = await setup();
  const plan = await f.lifecycle.planAws(intent, selections);
  expect(f.state.posts).toBe(0);
  expect(plan.request.spec.advertise_custom.advertise_where).toHaveLength(3);
  f.state.lost = true;
  const receipt = await f.lifecycle.apply(plan.id);
  expect(receipt.uid).toBe('listener-uid');
  expect(receipt.traffic).toBe('unknown');
  await new CeIngressLifecycle(f.port, contract, f.store).apply(plan.id);
  expect(f.state.posts).toBe(1);
  expect(f.state.originPosts).toBe(1);
  await f.lifecycle.delete(plan.id);
  await f.lifecycle.delete(plan.id);
  expect(f.state.deletes).toBe(1);
});

test('plans Azure ingress for one selected node of an owned three-node site', async () => {
  const azureOwner: CeOwner = {
    deploymentId: 'ce-test',
    engine: 'terraform',
    provider: 'azure',
    account: 'demo',
    region: 'us-east-1',
  };
  const f = await setup(azureOwner);
  const selected = [
    {
      binding: { owner: azureOwner, siteName: 'ce-site-1', nodes: ['node-1', 'node-2', 'node-3'] },
      node: 'node-1',
      mac: '02:00:00:00:00:01',
      insideAddress: '10.20.1.20',
    },
  ];
  const plan = await f.lifecycle.planAzure(intent, selected);
  expect(plan.material.placements).toHaveLength(1);
  expect(plan.request.spec.advertise_custom.advertise_where[0].site.ip).toBe('10.20.1.20');
  await f.lifecycle.apply(plan.id);
  expect(f.state.posts).toBe(1);
  await expect(f.lifecycle.planAws(intent, selected)).rejects.toThrow(/owned aws/i);
});

test('fresh address, site or owning-engine drift blocks mutation', async () => {
  for (const mutation of [
    (state: Awaited<ReturnType<typeof setup>>['state']) => {
      state.address = '10.20.1.11';
    },
    (state: Awaited<ReturnType<typeof setup>>['state']) => {
      state.siteUid = 'replacement-site';
    },
    (state: Awaited<ReturnType<typeof setup>>['state']) => {
      state.engine = 'native';
    },
  ]) {
    const f = await setup();
    const plan = await f.lifecycle.planAws(intent, selections);
    mutation(f.state);
    await expect(f.lifecycle.apply(plan.id)).rejects.toThrow();
    expect(f.state.posts).toBe(0);
    expect(f.state.originPosts).toBe(0);
  }
});

test('rejects forged plans, duplicate sites, stale discovery and foreign listener ownership', async () => {
  const f = await setup();
  await expect(f.lifecycle.planAws(intent, [selections[0], selections[0]])).rejects.toThrow();
  const plan = await f.lifecycle.planAws(intent, selections);
  await f.store.write(`ingress-plan-${plan.id}.json`, { ...plan, originUid: 'forged' });
  await expect(f.lifecycle.apply(plan.id)).rejects.toThrow();
  expect(f.state.posts).toBe(0);
  const fresh = await f.lifecycle.planAws(intent, selections);
  f.state.listener = {
    ...fresh.request,
    metadata: { ...fresh.request.metadata, labels: {} },
    system_metadata: { uid: 'foreign' },
  };
  await expect(f.lifecycle.apply(fresh.id)).rejects.toThrow();
  const observed = f.port.observeAwsInterfaces;
  f.port.observeAwsInterfaces = async (...args) => ({
    ...(await observed(...args)),
    observedAt: '2000-01-01T00:00:00Z',
  });
  await expect(f.lifecycle.planAws(intent, selections)).rejects.toThrow();
});

test('refuses to delete a replacement listener or accept unplanned advertisement', async () => {
  const f = await setup();
  const plan = await f.lifecycle.planAws(intent, selections);
  await f.lifecycle.apply(plan.id);
  const listener = f.state.listener;
  if (!listener) throw new Error('Expected created listener');
  listener.system_metadata = { uid: 'replacement-listener' };
  await expect(f.lifecycle.delete(plan.id)).rejects.toThrow();
  expect(f.state.deletes).toBe(0);
  listener.system_metadata = { uid: 'listener-uid' };
  (listener.spec as Record<string, unknown>).advertise_on_public_default_vip = {};
  await expect(f.lifecycle.apply(plan.id)).rejects.toThrow();
});

test('recovers failed durable create and lost delete receipts without repeating cloud mutations', async () => {
  const f = await setup();
  const plan = await f.lifecycle.planAws(intent, selections);
  const write = f.store.write.bind(f.store);
  f.store.write = async (name, value) => {
    if (name.startsWith('ingress-checkpoint-') && (value as Record<string, unknown>).phase === 'created')
      throw new Error('checkpoint interruption');
    return write(name, value);
  };
  await expect(f.lifecycle.apply(plan.id)).rejects.toThrow('checkpoint interruption');
  expect(f.state.posts).toBe(1);
  expect(f.state.originPosts).toBe(1);
  f.store.write = write;
  await f.lifecycle.apply(plan.id);
  expect(f.state.posts).toBe(1);
  const request = f.port.request;
  f.port.request = async (path, init) => {
    const result = await request(path, init);
    if (init?.method === 'DELETE') throw new CeApiError('transient');
    return result;
  };
  await expect(f.lifecycle.delete(plan.id)).rejects.toThrow();
  await f.lifecycle.delete(plan.id);
  expect(f.state.deletes).toBe(1);
});

test('teardown references expose validated identities without listener specs or placement evidence', async () => {
  const f = await setup(),
    plan = await f.lifecycle.planAws(intent, selections);
  await expect(f.lifecycle.teardownReference(plan.id)).rejects.toThrow();
  await f.lifecycle.apply(plan.id);
  const reference = await f.lifecycle.teardownReference(plan.id);
  expect(reference).toEqual({
    id: plan.id,
    name: intent.name,
    namespace: intent.namespace,
    uid: 'listener-uid',
    phase: 'created',
    originPool: { ...intent.originPool, uid: 'pool-uid' },
  });
  await f.store.write(`ingress-checkpoint-${plan.id}.json`, {
    phase: 'created',
    planSha256: 'forged',
    uid: 'listener-uid',
  });
  await expect(f.lifecycle.teardownReference(plan.id)).rejects.toThrow();
});
