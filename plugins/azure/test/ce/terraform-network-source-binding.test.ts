import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import { bindAzureTerraformNetworkUpdateSource } from '../../src/ce/terraform-network-source-binding';
import type { AzureCePlan } from '../../src/ce/types';
import { terraformNetworkSourceFixture } from './terraform-network-source-fixture';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true });
});
async function fixture(ha = true, generations = false) {
  const f = await terraformNetworkSourceFixture(ha, generations);
  const root = await mkdtemp(join(tmpdir(), 'azure-network-source-binding-'));
  roots.push(root);
  const store = await CeDeploymentStore.open(root, f.store.owner);
  for (const [name, record] of f.records) await store.write(name, record);
  const state = { source: f.source, outputs: structuredClone(f.outputs), loss: '', reads: 0, cloud: 0 };
  const calls: string[] = [];
  const session = {
    async readConfigurationSha256() {
      calls.push('configuration');
      return f.hash(state.source);
    },
    async readConfiguration(expected: string) {
      expect(expected).toBe(f.hash(state.source));
      calls.push('source');
      return state.source;
    },
    async readOutputs(names: string[]) {
      expect(names).toEqual(['ce_instances', 'ce_interfaces']);
      calls.push('outputs');
      state.reads++;
      if (state.loss === 'configuration-during-output') state.source += ' ';
      if (state.loss === 'output-during-read' && state.reads === 2)
        state.outputs.ce_instances['1'].vm_id = '00000000-0000-4000-8000-000000000099';
      return structuredClone(state.outputs);
    },
    async plan() {
      throw Error('source binding must not plan');
    },
    async apply() {
      throw Error('source binding must not apply');
    },
    async reviseConfiguration() {
      throw Error('source binding must not revise');
    },
  } as unknown as TerraformSession;
  const terraform: CeTerraformService = {
    async open(owner, deployment, resume) {
      calls.push('open');
      expect(owner).toEqual(store.owner);
      expect(deployment.backendIdentity).toBe(`local:${f.plan.deploymentName}`);
      expect(deployment.stage).toBeUndefined();
      expect(resume).toBe('current');
      return session;
    },
  };
  const api = {
    async exec(command: string, args: string[], options?: Parameters<typeof f.api.exec>[2]) {
      state.cloud++;
      if (state.loss === 'cloud-unavailable') return { exitCode: 1, stdout: '', stderr: 'synthetic unavailable' };
      if (state.loss === 'cloud-during-read' && state.reads > 0) f.vms[0].vmId = '00000000-0000-4000-8000-000000000099';
      return f.api.exec(command, args, options);
    },
  };
  const load = {
    loadSource: async (digest: string) => {
      const plan = f.sources.get(digest);
      if (!plan) throw Error('missing source');
      return structuredClone(plan);
    },
    loadOutcome: async (plan: AzureCePlan) => {
      const outcome = f.outcomes.get(plan.planSha256);
      if (!outcome) throw Error('missing outcome');
      return structuredClone(outcome);
    },
  };
  const run = (signal?: AbortSignal) =>
    bindAzureTerraformNetworkUpdateSource(f.plan, terraform, store, api, {}, load, f.site, signal);
  return { ...f, store, state, calls, session, run, load };
}
for (const ha of [false, true])
  test(`network driver freezes exact ${ha ? 'HA' : 'single'} creation source, current cloud and owning outputs before mutations`, async () => {
    const f = await fixture(ha);
    const result = await f.run();
    expect(result.session).toBe(f.session);
    expect(result.binding.source).toBe(f.source);
    expect(result.binding.before.nodes).toEqual(f.before.nodes);
    expect(result.binding.qualification.originalPlanSha256).toBe(f.original.planSha256);
    expect(result.binding.outputs).toEqual(f.outputs);
    expect(result.binding.engine).toBe('terraform');
    expect(result.binding.owner).toEqual(f.store.owner);
    expect(result.binding.planSha256).toBe(f.plan.planSha256);
    expect(result.binding.sourceConfigurationSha256).toBe(f.hash(f.source));
    expect(f.state.reads).toBe(2);
    expect((await stat(join(f.store.directory, `${f.plan.planId}-terraform-network-source.json`))).mode & 0o077).toBe(
      0,
    );
    expect(f.mutations()).toBe(0);
  });
test('network driver freezes recursive completed replacement source without reconstructing bootstrap', async () => {
  const f = await fixture(true, true);
  const result = await f.run();
  expect(result.binding.source).toBe(f.source);
  expect(result.binding.qualification.generationPlanSha256s).toHaveLength(3);
  expect(f.mutations()).toBe(0);
});
test('saved original binding remains immutable after consumed journals and later private revisions', async () => {
  const f = await fixture();
  const first = await f.run();
  f.state.source = '{}';
  f.state.outputs.ce_instances['1'].vm_id = '00000000-0000-4000-8000-000000000099';
  const reads = f.state.reads,
    cloud = f.state.cloud;
  f.calls.length = 0;
  const replay = await f.run();
  expect(replay.binding).toEqual(first.binding);
  expect(f.state.reads).toBe(reads);
  expect(f.state.cloud).toBe(cloud);
  expect(f.calls).toEqual(['open']);
});
for (const mode of ['configuration-during-output', 'output-during-read', 'cloud-during-read', 'cloud-unavailable'])
  test(`network driver rejects ${mode} before publishing source authorization`, async () => {
    const f = await fixture();
    f.state.loss = mode;
    await expect(f.run()).rejects.toThrow();
    await expect(f.store.read(`${f.plan.planId}-terraform-network-source.json`)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(f.mutations()).toBe(0);
  });
for (const mode of ['owner', 'engine', 'plan', 'source', 'inventory', 'outputs', 'qualification', 'extra'])
  test(`network driver rejects tampered saved ${mode}`, async () => {
    const f = await fixture();
    const { binding } = await f.run();
    const row = structuredClone(binding) as unknown as Record<string, unknown>;
    if (mode === 'owner') row.owner = { ...f.store.owner, engine: 'native' };
    if (mode === 'engine') row.engine = 'native';
    if (mode === 'plan') row.planSha256 = 'a'.repeat(64);
    if (mode === 'source') row.source = '{}';
    if (mode === 'inventory') (row.before as typeof f.before).nodes['1'].nics['1'].mac = '02:00:00:00:00:99';
    if (mode === 'outputs') (row.outputs as typeof f.outputs).ce_interfaces['1:1'].subnet_id = f.target;
    if (mode === 'qualification') (row.qualification as Record<string, unknown>).originalOutcomeSha256 = 'f'.repeat(64);
    if (mode === 'extra') row.unverified = true;
    await f.store.write(`${f.plan.planId}-terraform-network-source.json`, row);
    await expect(f.run()).rejects.toThrow();
    expect(f.mutations()).toBe(0);
  });
for (const artifact of [
  'driver-checkpoint',
  'driver-root',
  'driver-current-final',
  'driver-complete',
  'node-1-preflight',
  'node-1-prepared',
  'node-3-start-mutation-plan',
  'node-2-deallocate-release-complete',
  'node-1-current-no-change-plan',
])
  test(`missing original binding cannot be recreated after ${artifact} publication`, async () => {
    const f = await fixture();
    await f.store.write(`${f.plan.planId}-terraform-network-${artifact}.json`, {});
    await expect(f.run()).rejects.toThrow();
    expect(f.state.reads).toBe(0);
    expect(f.mutations()).toBe(0);
  });
for (const afterWrite of [false, true])
  test(`source publication loss ${afterWrite ? 'after' : 'before'} durable write resumes without mutation`, async () => {
    const f = await fixture();
    const write = f.store.write.bind(f.store);
    let loss = true;
    f.store.write = async (name, value) => {
      if (loss && name.endsWith('-network-source.json')) {
        loss = false;
        if (afterWrite) await write(name, value);
        throw Error('synthetic publication response loss');
      }
      return write(name, value);
    };
    await expect(f.run()).rejects.toThrow();
    const { binding } = await f.run();
    expect(binding.source).toBe(f.source);
    expect(f.mutations()).toBe(0);
  });
test('cancelled source preparation opens no owning workspace', async () => {
  const f = await fixture();
  const abort = new AbortController();
  abort.abort(Error('synthetic cancelled'));
  await expect(f.run(abort.signal)).rejects.toThrow('synthetic cancelled');
  expect(f.calls).toEqual([]);
});
test('changed historical acceptance rejects a saved original source binding', async () => {
  const f = await fixture();
  await f.run();
  (f.outcomes.get(f.original.planSha256) as Record<string, unknown>).status = 'pending-registration';
  await expect(f.run()).rejects.toThrow();
});

test('concurrent source binders retain the existing live-process exclusion and reuse one frozen boundary', async () => {
  const f = await fixture();
  let entered!: () => void, resume!: () => void;
  const waiting = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const released = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const read = f.session.readConfiguration.bind(f.session);
  f.session.readConfiguration = async (...args) => {
    entered();
    await released;
    return read(...args);
  };
  const first = f.run();
  await waiting;
  try {
    await expect(f.run()).rejects.toThrow('Operation lock is held by a live process');
  } finally {
    resume();
  }
  const completed = await first;
  const replay = await f.run();
  expect(completed.binding).toEqual(replay.binding);
  expect(f.state.reads).toBe(2);
  expect(f.mutations()).toBe(0);
});
test('cancellation during owning output collection publishes no source binding', async () => {
  const f = await fixture();
  const abort = new AbortController();
  const read = f.session.readOutputs.bind(f.session);
  f.session.readOutputs = async (...args) => {
    const result = await read(...args);
    abort.abort(Error('synthetic cancelled during read'));
    return result;
  };
  await expect(f.run(abort.signal)).rejects.toThrow('synthetic cancelled during read');
  await expect(f.store.read(`${f.plan.planId}-terraform-network-source.json`)).rejects.toMatchObject({
    code: 'ENOENT',
  });
});
test('unresolved current source hash does not read cloud or publish a snapshot', async () => {
  const f = await fixture();
  f.session.readConfigurationSha256 = async () => '__CURRENT_SOURCE__';
  await expect(f.run()).rejects.toThrow('resolved private source revision');
  expect(f.state.cloud).toBe(0);
});
test('missing owning current-configuration capability rejects before reading cloud', async () => {
  const f = await fixture();
  delete f.session.readConfigurationSha256;
  await expect(f.run()).rejects.toThrow('configuration capability');
  expect(f.state.cloud).toBe(0);
});

for (const mode of [
  'caller-plan',
  'caller-site',
  'owner',
  'private-source',
  'binding-root',
  'loader-identity',
] as const)
  test(`network source binding rejects ${mode} changed by publication callback`, async () => {
    const f = await fixture(false);
    const write = f.store.write.bind(f.store);
    f.store.write = async (name, value) => {
      await write(name, value);
      if (!name.endsWith('-network-source.json')) return;
      if (mode === 'caller-plan') f.plan.siteName = 'foreign-site';
      if (mode === 'caller-site') f.site.siteUid = 'foreign-site';
      if (mode === 'owner') f.store.owner.deploymentId = 'foreign-deployment';
      if (mode === 'private-source') f.state.source += ' ';
      if (mode === 'binding-root')
        await write(name, { ...(value as Record<string, unknown>), planSha256: 'f'.repeat(64) });
      if (mode === 'loader-identity')
        f.load.loadSource = async () => {
          throw Error('foreign loader');
        };
    };
    await expect(f.run()).rejects.toThrow();
    expect(f.mutations()).toBe(0);
  });
for (const mode of ['caller-site', 'private-source', 'later-stage', 'loader-identity'] as const)
  test(`network source binding rejects ${mode} changed during final output`, async () => {
    const f = await fixture(false);
    const read = f.session.readOutputs.bind(f.session);
    f.session.readOutputs = async (...args) => {
      const value = await read(...args);
      if (f.state.reads === 2) {
        if (mode === 'caller-site') f.site.siteUid = 'foreign-site';
        if (mode === 'private-source') f.state.source += ' ';
        if (mode === 'later-stage') await f.store.write(`${f.plan.planId}-terraform-network-driver-root.json`, {});
        if (mode === 'loader-identity')
          f.load.loadOutcome = async () => {
            throw Error('foreign outcome loader');
          };
      }
      return value;
    };
    await expect(f.run()).rejects.toThrow();
    await expect(f.store.read(`${f.plan.planId}-terraform-network-source.json`)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(f.mutations()).toBe(0);
  });
test('network source binding bounds a private reader that ignores cancellation', async () => {
  const f = await fixture(false),
    controller = new AbortController();
  const waiting = Promise.withResolvers<void>(),
    released = Promise.withResolvers<void>();
  const read = f.session.readConfiguration.bind(f.session);
  f.session.readConfiguration = async (...args) => {
    waiting.resolve();
    await released.promise;
    return read(...args);
  };
  const outcome = f.run(controller.signal).then(
    () => 'resolved',
    () => 'rejected',
  );
  await waiting.promise;
  controller.abort(Error('synthetic private reader cancelled'));
  try {
    expect(
      await Promise.race([outcome, new Promise<string>((resolve) => setTimeout(() => resolve('pending'), 250))]),
    ).toBe('rejected');
  } finally {
    released.resolve();
    await outcome;
  }
  await expect(f.store.read(`${f.plan.planId}-terraform-network-source.json`)).rejects.toMatchObject({
    code: 'ENOENT',
  });
});

test('source publication cannot mutate its passed binding and authorize the changed packet', async () => {
  const f = await fixture(false),
    write = f.store.write.bind(f.store);
  f.store.write = async (name, value) => {
    if (name.endsWith('-network-source.json')) (value as Record<string, unknown>).planSha256 = 'f'.repeat(64);
    await write(name, value);
  };
  await expect(f.run()).rejects.toThrow();
  expect(f.mutations()).toBe(0);
});

for (const node of [1, 2, 3])
  for (const suffix of [
    'prepared',
    'mutation-plan',
    'mutation-binding',
    'mutation-outcome',
    'mutation-complete',
    'release-plan',
    'release-binding',
    'release-outcome',
    'release-complete',
    'final-plan',
    'current-no-change-plan',
  ])
    test(`routing publication node ${node} ${suffix} blocks original source reconstruction`, async () => {
      const f = await fixture();
      await f.store.write(`${f.plan.planId}-terraform-network-node-${node}-routing-${suffix}.json`, {});
      await expect(f.run()).rejects.toThrow('original source missing after stage publication');
      expect(f.state.reads).toBe(0);
      expect(f.mutations()).toBe(0);
    });
