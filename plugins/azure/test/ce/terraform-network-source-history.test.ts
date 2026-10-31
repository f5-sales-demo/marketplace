import { afterEach, expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import { canonicalSha256 } from '../../src/ce/canonical';
import { captureAzureNetworkUpdateInventory } from '../../src/ce/network-update';
import { compileAzureCePlan } from '../../src/ce/planner';
import { readAzureTerraformNetworkCompletionHistory } from '../../src/ce/terraform-network-completion-history';
import { compileAzureTerraformNetworkUpdatePlan } from '../../src/ce/terraform-network-plan';
import { bindAzureTerraformNetworkUpdateSource } from '../../src/ce/terraform-network-source-binding';
import { readAzureTerraformNetworkSourceHistory } from '../../src/ce/terraform-network-source-history';
import { terraformNetworkDriverFixture } from './terraform-network-driver-fixture';
import { nicExecutionRoots } from './terraform-network-nic-execution-fixture';
import { terraformNetworkSourceFixture } from './terraform-network-source-fixture';

afterEach(async () => {
  for (const root of nicExecutionRoots.splice(0)) await rm(root, { recursive: true });
});
async function fixture(ha = false) {
  const f = await terraformNetworkDriverFixture(ha);
  const { binding } = await bindAzureTerraformNetworkUpdateSource(
    f.plan,
    f.terraform,
    f.store,
    f.api,
    {},
    f.loaders,
    f.site,
    undefined,
    f.dependencies.qualifyAcceptance,
  );
  const name = `${f.plan.planId}-terraform-network-source.json`;
  const run = (signal?: AbortSignal) =>
    readAzureTerraformNetworkSourceHistory(
      f.plan,
      f.store,
      f.loaders,
      f.site,
      f.dependencies.qualifyAcceptance,
      signal,
    );
  return { ...f, binding, name, runDriver: f.run, run };
}
for (const ha of [false, true])
  test(`read-only original ${ha ? 'six-interface HA' : 'single'} source qualification retains exact private bytes`, async () => {
    const f = await fixture(ha);
    const row = await f.run();
    expect(row.binding).toEqual(f.binding);
    expect(row.retirementQualified).toBe(false);
    expect(row.currentOperationalAcceptanceQualified).toBe(false);
    expect(f.calls).toEqual([]);
    for (const [name, digest] of Object.entries(row.packetSha256ByName))
      expect(canonicalSha256(await f.store.read(name))).toBe(digest);
  });
for (const part of [
  'owner',
  'plan',
  'provider',
  'source',
  'source-rehash',
  'outputs',
  'mac',
  'qualification',
  'schema',
])
  test(`original source rejects changed ${part} before retirement qualification`, async () => {
    const f = await fixture();
    const row = structuredClone(f.binding);
    if (part === 'owner') row.owner.account = 'example-foreign';
    if (part === 'plan') row.planSha256 = 'a'.repeat(64);
    if (part === 'provider') row.providerLockSha256 = 'a'.repeat(64);
    if (part === 'source' || part === 'source-rehash') row.source += ' ';
    if (part === 'source-rehash') row.sourceConfigurationSha256 = f.hash(row.source);
    if (part === 'outputs')
      (row.outputs.ce_instances as Record<string, Record<string, unknown>>)['1'].vm_id = '__UNRESOLVED__';
    if (part === 'mac') row.before.nodes['1'].nics['1'].mac = '02:00:00:00:00:99';
    if (part === 'qualification') Object.assign(row.qualification, { unverified: true });
    if (part === 'schema') Object.assign(row, { unverified: true });
    await f.store.write(f.name, row);
    await expect(f.run()).rejects.toThrow();
    expect(f.calls).toEqual([]);
  });
test('missing original source cannot be reconstructed from live cloud or Terraform', async () => {
  const f = await fixture();
  await f.store.remove(f.name);
  await expect(f.run()).rejects.toThrow();
  expect(f.calls).toEqual([]);
});
test('original source site binding is independently checked', async () => {
  const f = await fixture();
  f.site.siteUid = 'foreign';
  await expect(f.run()).rejects.toThrow();
});
for (const mode of ['request', 'site', 'owner', 'read', 'packet'])
  test(`source read rejects ${mode} changed by a storage callback`, async () => {
    const f = await fixture();
    const read = f.store.read.bind(f.store);
    let changed = false;
    const account = f.store.owner.account;
    f.store.read = async (name) => {
      const row = await read(name);
      if (!changed && name === f.name) {
        changed = true;
        if (mode === 'request') f.plan.warnings.push('foreign');
        if (mode === 'site') f.site.siteUid = 'foreign';
        if (mode === 'owner') f.store.owner.account = 'example-foreign';
        if (mode === 'read') f.store.read = read;
        if (mode === 'packet') await f.store.write(f.name, { unverified: true });
      }
      return row;
    };
    try {
      await expect(f.run()).rejects.toThrow();
    } finally {
      f.store.owner.account = account;
    }
    expect(changed).toBe(true);
    expect(f.calls).toEqual([]);
  });
for (const mode of ['source-loader', 'outcome-loader'])
  test(`original source loader callable changes cannot cross qualification`, async () => {
    const f = await fixture();
    if (mode === 'source-loader') {
      const load = f.loaders.loadSource;
      f.loaders.loadSource = async (digest) => {
        const value = await load(digest);
        f.loaders.loadSource = load;
        return value;
      };
    } else {
      const load = f.loaders.loadOutcome;
      f.loaders.loadOutcome = async (source) => {
        const value = await load(source);
        f.loaders.loadOutcome = load;
        return value;
      };
    }
    await expect(f.run()).rejects.toThrow();
    expect(f.calls).toEqual([]);
  });
for (const mode of ['read', 'verify', 'source-loader', 'outcome-loader'])
  test(`ignored original source ${mode} call is cancellation bounded`, async () => {
    const f = await fixture();
    const never = () => new Promise<never>(() => {});
    if (mode === 'read') f.store.read = never;
    if (mode === 'verify') f.store.verify = never;
    if (mode === 'source-loader') f.loaders.loadSource = never;
    if (mode === 'outcome-loader') f.loaders.loadOutcome = never;
    const start = Date.now();
    await expect(f.run(AbortSignal.timeout(20))).rejects.toThrow();
    expect(Date.now() - start).toBeLessThan(1000);
    expect(f.calls).toEqual([]);
  });
test('completed serial execution does not change the meaning of original private source history', async () => {
  const f = await fixture();
  expect((await f.runDriver()).status).toBe('complete');
  const calls = f.calls.slice();
  expect((await f.run()).binding).toEqual(f.binding);
  expect((await f.run()).retirementQualified).toBe(false);
  expect(f.calls).toEqual(calls);
});

for (const tamper of [false, true])
  test(`original-source history ${tamper ? 'rejects altered' : 'authenticates completed'} predecessor generation`, async () => {
    const birth = await terraformNetworkSourceFixture(false);
    const first = compileAzureTerraformNetworkUpdatePlan(birth.plan, birth.original);
    const sources = new Map(birth.sources);
    sources.set(first.planSha256, first);
    const before = await captureAzureNetworkUpdateInventory(first, birth.api);
    const f = await terraformNetworkDriverFixture(false, true, {
      plan: first,
      inventory: before,
      source: birth.source,
      sources,
    });
    expect((await f.run()).status).toBe('complete');
    const loaders = {
      ...f.loaders,
      loadSource: async (digest: string) => {
        const plan = sources.get(digest);
        if (!plan) throw Error('Missing fixture source');
        return plan;
      },
    };
    const history = await readAzureTerraformNetworkCompletionHistory(
      f.plan,
      f.store,
      loaders,
      f.dependencies.qualifyAcceptance,
    );
    const next = compileAzureTerraformNetworkUpdatePlan(
      compileAzureCePlan({ ...structuredClone(birth.original.intent), operation: 'update-network' }, birth.current),
      f.plan,
      birth.original,
    );
    sources.set(next.planSha256, next);
    const inventory = structuredClone(history.inventory);
    inventory.planSha256 = next.planSha256;
    for (const vm of Object.values(inventory.nodes))
      for (const [index, nic] of Object.entries(vm.nics)) {
        const subnet = next.nics[Number(index)].subnet;
        nic.targetSubnetId = `${birth.vnet.id}/subnets/${subnet.name}`;
        nic.targetSubnetCidr = subnet.cidr as string;
      }
    const second = await terraformNetworkDriverFixture(false, true, {
      plan: next,
      inventory,
      source: history.finalSource,
      sources,
      store: f.store,
    });
    const { binding } = await bindAzureTerraformNetworkUpdateSource(
      next,
      second.terraform,
      second.store,
      second.api,
      {},
      second.loaders,
      second.site,
      undefined,
      second.dependencies.qualifyAcceptance,
    );
    if (tamper) await f.store.write(`${f.plan.planId}-terraform-network-driver-complete.json`, { unverified: true });
    const run = () =>
      readAzureTerraformNetworkSourceHistory(
        next,
        second.store,
        second.loaders,
        second.site,
        second.dependencies.qualifyAcceptance,
      );
    if (tamper) await expect(run()).rejects.toThrow();
    else {
      const row = await run();
      expect(row.binding).toEqual(binding);
      expect(row.binding.qualification.networkHistory).toHaveLength(1);
      expect(row.retirementQualified).toBe(false);
    }
    expect(second.calls).toEqual([]);
  });
