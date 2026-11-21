import { expect } from 'bun:test';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import type { AzExecApi } from '../../src/az/exec';
import { canonicalSha256 } from '../../src/ce/canonical';
import { bindAzureTerraformNetworkReplacementSource } from '../../src/ce/terraform-network-replacement-source-binding';
import { qualifyAzureTerraformReplacementPublicSource } from '../../src/ce/terraform-replacement-public-source';
import { test } from './owned-fixture-test';
import { terraformNetworkBoundReplacementFixture } from './terraform-network-bound-replacement-fixture';

function setFixtureInstanceVmId(outputs: Record<string, unknown>, key: string, vmId: string) {
  const instances = outputs.ce_instances;
  if (!instances || typeof instances !== 'object' || Array.isArray(instances))
    throw Error('Synthetic fixture requires a complete instance output map');
  const row = (instances as Record<string, unknown>)[key];
  if (
    !row ||
    typeof row !== 'object' ||
    Array.isArray(row) ||
    typeof (row as Record<string, unknown>).vm_id !== 'string'
  )
    throw Error('Synthetic fixture requires a resolved instance VM identity');
  (row as Record<string, unknown>).vm_id = vmId;
}
async function fixture(ha = false, restore = false) {
  const f = await terraformNetworkBoundReplacementFixture(ha, restore);
  const state = {
    source: f.h.finalSource,
    outputs: structuredClone(f.h.outputs),
    queries: 0,
    opens: 0,
    outputReads: 0,
    loss: '',
    afterOutputs: undefined as undefined | (() => Promise<void> | void),
  };
  const session = {
    async readConfigurationSha256() {
      return f.hash(state.source);
    },
    async readConfiguration(digest: string) {
      expect(digest).toBe(f.hash(state.source));
      return state.source;
    },
    async readOutputs(names: string[]) {
      expect(names).toEqual(['ce_instances', 'ce_interfaces']);
      state.outputReads++;
      await state.afterOutputs?.();
      if (state.loss === 'output-race' && state.outputReads === 2)
        setFixtureInstanceVmId(state.outputs, '1', '00000000-0000-4000-8000-000000000099');
      return structuredClone(state.outputs);
    },
    async plan() {
      throw Error('Source binding must not plan');
    },
    async apply() {
      throw Error('Source binding must not apply');
    },
    async reviseConfiguration() {
      throw Error('Source binding must not revise');
    },
  } as unknown as TerraformSession;
  const terraform: CeTerraformService = {
    async open(owner, deployment, resume) {
      expect(owner).toEqual(f.store.owner);
      expect(deployment.backendIdentity).toBe(`local:${f.input.plan.deploymentName}`);
      expect(resume).toBe('current');
      state.opens++;
      return session;
    },
  };
  const api: AzExecApi = {
    async exec(...args) {
      state.queries++;
      if (state.loss === 'cloud-unavailable') return { exitCode: 1, stdout: '', stderr: 'synthetic unavailable' };
      const result = await f.api.exec(...args);
      if (state.loss === 'nic-race' && state.outputReads > 0 && args[1][0] === 'network' && args[1][1] === 'nic') {
        const row = JSON.parse(result.stdout);
        row.ipConfigurations[0].name = 'changed';
        row.ipConfigurations[0].id = `${row.id}/ipConfigurations/changed`;
        return { ...result, stdout: JSON.stringify(row) };
      }
      return result;
    },
  };
  const run = (signal?: AbortSignal) =>
    bindAzureTerraformNetworkReplacementSource(
      f.input.plan,
      terraform,
      f.store,
      api,
      {},
      f.loaders,
      f.input.site,
      f.dependencies.qualifyAcceptance,
      signal,
    );
  const name = `${f.input.plan.planId}-terraform-network-replacement-source.json`;
  const absent = () => expect(f.store.read(name)).rejects.toMatchObject({ code: 'ENOENT' });
  const mutations = f.calls.slice();
  return { ...f, state, session, terraform, api, run, name, absent, mutations };
}
for (const ha of [false, true])
  test(
    `owning binding freezes complete ${ha ? 'six-interface HA' : 'single'} network source before enrollment`,
    async () => {
      const f = await fixture(ha);
      const { binding, session } = await f.run();
      expect(session).toBe(f.session);
      expect(binding.owner).toEqual(f.store.owner);
      expect(binding.source).toBe(f.h.finalSource);
      expect(binding.sourceConfigurationSha256).toBe(f.h.finalConfigurationSha256);
      expect(binding.before.nodes).toEqual(f.h.inventory.nodes);
      expect(binding.outputs).toEqual(f.h.outputs);
      expect(binding.qualification.currentOperationalAcceptanceQualified).toBe(false);
      expect(binding.qualification.networkHistory.map((p) => p.planSha256)).toEqual([f.network.planSha256]);
      expect(Object.values(binding.before.nodes).flatMap((n) => Object.values(n.nics))).toHaveLength(ha ? 6 : 2);
      expect((await stat(join(f.store.directory, f.name))).mode & 0o077).toBe(0);
      expect(f.state.outputReads).toBe(2);
      expect(f.calls).toEqual(f.mutations);
    },
    ha ? 60000 : 15000,
  );
test('replay authenticates original private source after selected VM was consumed without recapturing current cloud', async () => {
  const f = await fixture(true);
  const first = await f.run();
  f.state.source = '{}';
  f.state.loss = 'cloud-unavailable';
  setFixtureInstanceVmId(f.state.outputs, '2', '00000000-0000-4000-8000-000000000099');
  const queries = f.state.queries,
    reads = f.state.outputReads;
  const second = await f.run();
  expect(second.binding).toEqual(first.binding);
  expect(f.state.queries).toBe(queries);
  expect(f.state.outputReads).toBe(reads);
  expect(f.calls).toEqual(f.mutations);
}, 60000);
for (const kind of [
  'owner',
  'engine',
  'kind',
  'plan',
  'original',
  'retained',
  'lock',
  'site',
  'source',
  'source-hash',
  'uuid',
  'vm-owner',
  'mac',
  'nic-owner',
  'ip-config-id',
  'ip-config-name',
  'subnet',
  'cidr',
  'allocation',
  'partial',
  'outputs',
  'qualification',
  'extra',
])
  test(`frozen replacement binding rejects changed ${kind}`, async () => {
    const f = await fixture();
    const { binding } = await f.run();
    const row = structuredClone(binding),
      nic = row.before.nodes['1'].nics['1'];
    if (kind === 'owner') row.owner.engine = 'native';
    if (kind === 'engine') row.engine = 'native' as never;
    if (kind === 'kind') row.kind = 'foreign' as never;
    if (kind === 'plan') row.planSha256 = 'a'.repeat(64);
    if (kind === 'original') row.originalPlanSha256 = 'a'.repeat(64);
    if (kind === 'retained') row.retainedPlanSha256 = 'a'.repeat(64);
    if (kind === 'lock') row.providerLockSha256 = 'a'.repeat(64);
    if (kind === 'site') row.site.siteUid = 'foreign';
    if (kind === 'source') row.source += ' ';
    if (kind === 'source-hash') {
      row.source += ' ';
      row.sourceConfigurationSha256 = f.hash(row.source);
    }
    if (kind === 'uuid') row.before.nodes['1'].vmId = '00000000-0000-4000-8000-000000000099';
    if (kind === 'vm-owner') row.before.nodes['1'].ownerPlanSha256 = 'a'.repeat(64);
    if (kind === 'mac') nic.mac = '02:00:00:00:00:99';
    if (kind === 'nic-owner') nic.ownerPlanSha256 = 'a'.repeat(64);
    if (kind === 'ip-config-id') nic.ipConfigurationId += '-foreign';
    if (kind === 'ip-config-name') nic.ipConfigurationName = 'foreign';
    if (kind === 'subnet') nic.subnetId += '-foreign';
    if (kind === 'cidr') nic.subnetCidr = '10.99.0.0/24';
    if (kind === 'allocation') nic.allocation = 'Static';
    if (kind === 'partial') delete row.before.nodes['1'].nics['0'];
    if (kind === 'outputs')
      (row.outputs.ce_instances as Record<string, { vm_id: string }>)['1'].vm_id =
        '00000000-0000-4000-8000-000000000099';
    if (kind === 'qualification') row.qualification.networkHistory[0].completionSha256 = 'a'.repeat(64);
    if (kind === 'extra') Object.assign(row, { unverified: true });
    await f.store.write(f.name, row);
    const queries = f.state.queries;
    await expect(f.run()).rejects.toThrow();
    expect(f.state.queries).toBe(queries);
    expect(f.calls).toEqual(f.mutations);
  });
for (const suffix of [
  'replacement',
  'replacement-source',
  'quiesce-plan',
  'launch-plan',
  'replacement-final-plan',
  'network-replacement-complete',
  'quiesce-recovery',
  'launch-recovery',
])
  test(`missing original binding rejects prior ${suffix} without recapture`, async () => {
    const f = await fixture();
    await f.store.write(`${f.input.plan.planId}-terraform-${suffix}.json`, {});
    await expect(f.run()).rejects.toThrow('original binding missing');
    expect(f.state.queries).toBe(0);
    expect(f.state.opens).toBe(0);
    await f.absent();
  });
test('missing original binding rejects already-owned enrollment material', async () => {
  const f = await fixture();
  const p = f.input.plan;
  await f.store.write(
    `${p.deploymentName.slice(0, 40)}-${p.intent.replacementNode}-${p.planSha256.slice(0, 12)}.json`,
    { token: 'synthetic' },
  );
  await expect(f.run()).rejects.toThrow('original binding missing');
  expect(f.state.queries).toBe(0);
  await f.absent();
});
for (const loss of ['cloud-unavailable', 'output-race', 'nic-race'])
  test(`owning source binding rejects ${loss} before publication`, async () => {
    const f = await fixture();
    f.state.loss = loss;
    await expect(f.run()).rejects.toThrow();
    await f.absent();
    expect(f.calls).toEqual(f.mutations);
  });
test('source changes during full inventory read cannot publish', async () => {
  const f = await fixture();
  f.state.afterOutputs = () => {
    f.state.source += ' ';
  };
  await expect(f.run()).rejects.toThrow();
  await f.absent();
});
for (const afterWrite of [false, true])
  test(`lost source publication ${afterWrite ? 'after' : 'before'} durable write resumes exact history`, async () => {
    const f = await fixture();
    const write = f.store.write.bind(f.store);
    let loss = true;
    f.store.write = async (name, value) => {
      if (name === f.name && loss) {
        loss = false;
        if (afterWrite) await write(name, value);
        throw Error('synthetic lost binding publication');
      }
      return write(name, value);
    };
    await expect(f.run()).rejects.toThrow('synthetic lost binding publication');
    const before = f.state.outputReads;
    const result = await f.run();
    expect(result.binding.source).toBe(f.h.finalSource);
    expect(f.state.outputReads).toBe(before + (afterWrite ? 0 : 2));
    expect(f.calls).toEqual(f.mutations);
  });
for (const mode of ['source', 'outcome', 'history', 'binding'])
  test(`cross-read ${mode} race rejects replacement binding`, async () => {
    const f = await fixture();
    if (mode === 'binding') await f.run();
    const open = f.terraform.open.bind(f.terraform),
      load = f.loaders.loadSource.bind(f.loaders),
      outcome = f.loaders.loadOutcome.bind(f.loaders);
    let changed = false;
    f.terraform.open = async (...args) => {
      const session = await open(...args);
      changed = true;
      if (mode === 'history') {
        const name = `${f.network.planId}-terraform-network-driver-complete.json`;
        const row = (await f.store.read(name)) as Record<string, unknown>;
        await f.store.write(name, { ...row, unverified: true });
      }
      if (mode === 'binding') {
        const row = (await f.store.read(f.name)) as Record<string, unknown>;
        await f.store.write(f.name, { ...row, unverified: true });
      }
      return session;
    };
    f.loaders.loadSource = async (d) => {
      const p = await load(d);
      return changed && mode === 'source' ? { ...p, warnings: ['foreign'] } : p;
    };
    f.loaders.loadOutcome = async (p) => {
      const row = await outcome(p);
      return changed && mode === 'outcome' ? { ...row, unverified: true } : row;
    };
    await expect(f.run()).rejects.toThrow();
    if (mode !== 'binding') await f.absent();
  });
for (const ignored of ['loader', 'store', 'service', 'cloud', 'outputs', 'verifier'])
  test(`ignored ${ignored} promise remains cancellation-bounded and publishes no binding`, async () => {
    const f = await fixture();
    const read = f.store.read.bind(f.store),
      abort = new AbortController();
    let enteredAt = 0;
    const hang = () => {
      enteredAt = Date.now();
      setTimeout(() => abort.abort(Error('synthetic dependency deadline')), 30);
      return new Promise<never>(() => {});
    };
    if (ignored === 'loader') f.loaders.loadSource = hang;
    if (ignored === 'store') f.store.read = hang;
    if (ignored === 'service') f.terraform.open = hang;
    if (ignored === 'cloud') f.api.exec = hang;
    if (ignored === 'outputs') f.session.readOutputs = hang;
    if (ignored === 'verifier') f.dependencies.qualifyAcceptance = hang;
    await expect(f.run(abort.signal)).rejects.toThrow('synthetic dependency deadline');
    expect(enteredAt).toBeGreaterThan(0);
    expect(Date.now() - enteredAt).toBeLessThan(1000);
    await expect(read(f.name)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(f.calls).toEqual(f.mutations);
  });
test('concurrent binders share owning replacement process exclusion', async () => {
  const f = await fixture();
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>((r) => {
      enter = r;
    }),
    waiting = new Promise<void>((r) => {
      release = r;
    });
  const read = f.session.readConfiguration.bind(f.session);
  f.session.readConfiguration = async (...args) => {
    enter();
    await waiting;
    return read(...args);
  };
  const first = f.run();
  await entered;
  try {
    await expect(f.run()).rejects.toThrow('Operation lock is held by a live process');
  } finally {
    release();
  }
  const done = await first;
  expect((await f.run()).binding).toEqual(done.binding);
});
for (const missing of [false, true])
  test(`unresolved configuration ${missing ? 'capability' : 'revision'} rejects before cloud`, async () => {
    const f = await fixture();
    if (missing) delete f.session.readConfigurationSha256;
    else f.session.readConfigurationSha256 = async () => '__UNRESOLVED__';
    await expect(f.run()).rejects.toThrow();
    expect(f.state.queries).toBe(0);
    await f.absent();
  });
test('ordinary public replacement source rejects network-bound profile before loading original-shaped private source', async () => {
  const f = await fixture();
  await expect(
    qualifyAzureTerraformReplacementPublicSource(
      f.input.plan,
      f.birth.source,
      {} as never,
      {
        read: async () => {
          throw Error('ordinary source contract must not read');
        },
        verify: async () => {
          throw Error('ordinary source contract must not verify');
        },
      },
      f.loaders.loadSource,
      f.loaders.loadOutcome,
      f.input.providerLockSha256,
    ),
  ).rejects.toThrow('dedicated owning source contract');
});

test('missing original binding rejects published replacement registration', async () => {
  const f = await fixture();
  await f.store.write(`${f.input.plan.planId}-terraform-replacement-registration.json`, {});
  await expect(f.run()).rejects.toThrow('original binding missing');
  expect(f.state.queries).toBe(0);
  await f.absent();
});
test('new enrollment appearing during qualification rejects original binding publication', async () => {
  const f = await fixture();
  const p = f.input.plan;
  f.state.afterOutputs = () =>
    f.store.write(`${p.deploymentName.slice(0, 40)}-${p.intent.replacementNode}-${p.planSha256.slice(0, 12)}.json`, {
      token: 'synthetic',
    });
  await expect(f.run()).rejects.toThrow('original binding missing');
  await f.absent();
});
test('owner scope changed during reading cannot publish source authorization', async () => {
  const f = await fixture();
  const account = f.store.owner.account;
  f.state.afterOutputs = () => {
    f.store.owner.account = 'example-foreign';
  };
  try {
    await expect(f.run()).rejects.toThrow();
  } finally {
    f.store.owner.account = account;
  }
  await f.absent();
});
test('requested site changed during reading cannot publish source authorization', async () => {
  const f = await fixture();
  f.state.afterOutputs = () => {
    f.input.site.siteUid = 'foreign';
  };
  await expect(f.run()).rejects.toThrow();
  await f.absent();
});
test('pre-cancelled source binding opens no owning workspace', async () => {
  const f = await fixture();
  const abort = new AbortController();
  abort.abort(Error('synthetic cancelled'));
  await expect(f.run(abort.signal)).rejects.toThrow('synthetic cancelled');
  expect(f.state.opens).toBe(0);
  expect(f.state.queries).toBe(0);
  await f.absent();
});

test('saved full output schema rejects an extra unrequested output', async () => {
  const f = await fixture();
  const { binding } = await f.run();
  binding.outputs.unverified = true;
  await f.store.write(f.name, binding);
  await expect(f.run()).rejects.toThrow('exact requested Terraform output schema');
});
test('restored original-shaped source retains exact ordered network history in dedicated replacement binding', async () => {
  const f = await fixture(false, true);
  expect(f.input.plan.nics).toEqual(f.birth.original.nics);
  expect(f.h.finalSource).not.toBe(f.birth.source);
  for (const [node, vm] of Object.entries(f.h.inventory.nodes))
    for (const [index, nic] of Object.entries(vm.nics)) {
      const id = `${f.birth.vnet.id}/subnets/${f.birth.original.nics[Number(index)].subnet.name}`;
      expect(nic.subnetId).toBe(id);
      expect(
        JSON.parse(f.h.finalSource).resource.azurerm_network_interface[`node_${node}_nic_${index}`].ip_configuration[0]
          .subnet_id,
      ).toBe(id);
    }
  const before = f.h.inventory;
  const current = {
    oldVmIds: Object.fromEntries(
      Object.entries(before.nodes).map(([node, vm]) => [`${f.input.plan.deploymentName}-${node}`, vm.vmId]),
    ),
    ownerPlanSha256ByNode: Object.fromEntries(
      Object.entries(before.nodes).map(([node, vm]) => [`${f.input.plan.deploymentName}-${node}`, vm.ownerPlanSha256]),
    ),
    retainedNics: Object.fromEntries(
      Object.entries(before.nodes).flatMap(([node, vm]) =>
        Object.entries(vm.nics).map(([index, nic]) => [
          `${node}:${index}`,
          {
            resourceId: nic.resourceId,
            subnetId: nic.subnetId,
            mac: nic.mac,
            privateIp: nic.privateIp,
            ownerPlanSha256: nic.ownerPlanSha256,
          },
        ]),
      ),
    ),
    ...f.input.site,
  };
  // Restored physical subnets use resolved IDs; retain those actual source bytes. The ordinary
  // original-source validator still rejects that graph. Its unchanged original-source control
  // remains valid while the bound profile is explicitly isolated from the ordinary contract.
  const ordinary = structuredClone(f.input.plan);
  delete ordinary.terraformNetworkReplacementProfile;
  const { planId: _id, planSha256: _sha, ...draft } = ordinary;
  const digest = canonicalSha256(draft);
  await expect(
    qualifyAzureTerraformReplacementPublicSource(
      { ...draft, planId: `azure-ce-${digest.slice(0, 24)}`, planSha256: digest },
      f.birth.source,
      current,
      f.store,
      f.loaders.loadSource,
      f.loaders.loadOutcome,
      f.input.providerLockSha256,
    ),
  ).resolves.toBeUndefined();
  await expect(
    qualifyAzureTerraformReplacementPublicSource(
      { ...draft, planId: `azure-ce-${digest.slice(0, 24)}`, planSha256: digest },
      f.h.finalSource,
      current,
      f.store,
      f.loaders.loadSource,
      f.loaders.loadOutcome,
      f.input.providerLockSha256,
    ),
  ).rejects.toThrow('retained non-relay configuration graph differs');
  await expect(
    qualifyAzureTerraformReplacementPublicSource(
      f.input.plan,
      f.h.finalSource,
      current,
      f.store,
      f.loaders.loadSource,
      f.loaders.loadOutcome,
      f.input.providerLockSha256,
    ),
  ).rejects.toThrow('dedicated owning source contract');
  const { binding } = await f.run();
  expect(binding.qualification.networkHistory).toHaveLength(2);
  expect(binding.qualification.networkHistory[1].planSha256).toBe(f.network.planSha256);
  expect(binding.source).toBe(f.h.finalSource);
  expect(binding.qualification.currentOperationalAcceptanceQualified).toBe(false);
}, 15000);

for (const kind of ['source', 'outcome'])
  test(`post-publication ${kind} callback cannot alter the binding after its recheck`, async () => {
    const f = await fixture();
    let changed = false;
    const mutate = async () => {
      if (changed) return;
      let row: unknown;
      try {
        row = await f.store.read(f.name);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
      }
      changed = true;
      await f.store.write(f.name, { ...(row as Record<string, unknown>), unverified: true });
    };
    if (kind === 'source') {
      const load = f.loaders.loadSource.bind(f.loaders);
      f.loaders.loadSource = async (d) => {
        const value = await load(d);
        await mutate();
        return value;
      };
    } else {
      const load = f.loaders.loadOutcome.bind(f.loaders);
      f.loaders.loadOutcome = async (p) => {
        const value = await load(p);
        await mutate();
        return value;
      };
    }
    await expect(f.run()).rejects.toThrow();
    expect(changed).toBe(true);
  });

for (const kind of ['source', 'outcome'])
  for (const publication of ['stage', 'source'])
    test(`final pre-publication ${kind} callback cannot publish a foreign ${publication}`, async () => {
      const f = await fixture();
      let calls = 0,
        target = 0,
        changed = false;
      const mutate = async () => {
        if (++calls !== target) return;
        await f.store.write(publication === 'stage' ? `${f.input.plan.planId}-terraform-launch-plan.json` : f.name, {
          unverified: true,
        });
        changed = true;
      };
      if (kind === 'source') {
        const load = f.loaders.loadSource.bind(f.loaders);
        f.loaders.loadSource = async (d) => {
          const value = await load(d);
          await mutate();
          return value;
        };
      } else {
        const load = f.loaders.loadOutcome.bind(f.loaders);
        f.loaders.loadOutcome = async (p) => {
          const value = await load(p);
          await mutate();
          return value;
        };
      }
      const write = f.store.write.bind(f.store);
      f.store.write = async (name, value) => {
        if (name === f.name && !target) target = calls;
        await write(name, value);
      };
      await f.run();
      expect(target).toBeGreaterThan(0);
      await f.store.remove(f.name);
      calls = 0;
      await expect(f.run()).rejects.toThrow();
      expect(changed).toBe(true);
      if (publication === 'stage') await f.absent();
      else expect(await f.store.read(f.name)).toEqual({ unverified: true });
    });
