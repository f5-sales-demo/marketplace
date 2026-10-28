import { afterEach, expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import { captureAzureNetworkUpdateInventory } from '../../src/ce/network-update';
import { compileAzureCePlan } from '../../src/ce/planner';
import {
  qualifyAzureTerraformNetworkGenerationSource,
  readAzureTerraformNetworkCompletionHistory,
} from '../../src/ce/terraform-network-completion-history';
import { compileAzureTerraformNetworkUpdatePlan } from '../../src/ce/terraform-network-plan';
import { terraformNetworkDriverFixture } from './terraform-network-driver-fixture';
import { nicExecutionRoots } from './terraform-network-nic-execution-fixture';
import { terraformNetworkSourceFixture } from './terraform-network-source-fixture';

afterEach(async () => {
  for (const root of nicExecutionRoots.splice(0)) await rm(root, { recursive: true });
});
async function fixture(ha = false) {
  const birth = await terraformNetworkSourceFixture(ha);
  const plan = compileAzureTerraformNetworkUpdatePlan(birth.plan, birth.original);
  const before = await captureAzureNetworkUpdateInventory(plan, birth.api);
  const sources = new Map(birth.sources);
  sources.set(plan.planSha256, plan);
  const f = await terraformNetworkDriverFixture(ha, true, { plan, inventory: before, source: birth.source, sources });
  const completed = await f.run();
  expect(completed.status).toBe('complete');
  const history = await readAzureTerraformNetworkCompletionHistory(
    plan,
    f.store,
    f.loaders,
    f.dependencies.qualifyAcceptance,
  );
  const nextIntent = { ...structuredClone(birth.original.intent), operation: 'update-network' as const };
  const next = compileAzureTerraformNetworkUpdatePlan(
    compileAzureCePlan(nextIntent, birth.current),
    plan,
    birth.original,
  );
  sources.set(next.planSha256, next);
  const inventory = structuredClone(history.inventory);
  inventory.planSha256 = next.planSha256;
  for (const vm of Object.values(inventory.nodes))
    for (const [index, nic] of Object.entries(vm.nics)) {
      const desired = next.nics[Number(index)].subnet;
      nic.targetSubnetId = `${birth.vnet.id}/subnets/${desired.name}`;
      nic.targetSubnetCidr = desired.cidr as string;
    }
  const input = { source: history.finalSource, inventory, providerLockSha256: birth.lock, site: birth.site };
  const run = (signal?: AbortSignal) =>
    qualifyAzureTerraformNetworkGenerationSource(
      next,
      input.source,
      input.inventory,
      f.store,
      f.loaders,
      input.providerLockSha256,
      input.site,
      f.dependencies.qualifyAcceptance,
      signal,
    );
  return { ...f, birth, plan, next, sources, history, input, qualify: run };
}
for (const ha of [false, true])
  test(
    `completed predecessor qualifies restored Terraform source HA=${ha}`,
    async () => {
      const f = await fixture(ha);
      const q = await f.qualify();
      expect(q.originalPlanSha256).toBe(f.birth.original.planSha256);
      expect(q.sourceConfigurationSha256).toBe(f.hash(f.input.source));
      expect(q.networkHistory?.map((r) => r.planSha256)).toEqual([f.plan.planSha256]);
      expect(JSON.stringify(q)).not.toContain('#cloud-config');
      const second = await terraformNetworkDriverFixture(ha, true, {
        plan: f.next,
        inventory: f.input.inventory,
        source: f.input.source,
        sources: f.sources,
        store: f.store,
      });
      expect((await second.run()).status).toBe('complete');
      const restored = await readAzureTerraformNetworkCompletionHistory(
        f.next,
        second.store,
        second.loaders,
        second.dependencies.qualifyAcceptance,
      );
      expect(restored.inventory.nodes['1'].nics['1'].subnetId).toBe(
        f.input.inventory.nodes['1'].nics['1'].targetSubnetId,
      );
      const third = compileAzureTerraformNetworkUpdatePlan(f.birth.plan, f.next, f.birth.original);
      f.sources.set(third.planSha256, third);
      const before = structuredClone(restored.inventory);
      before.planSha256 = third.planSha256;
      for (const vm of Object.values(before.nodes))
        for (const [i, nic] of Object.entries(vm.nics)) {
          const desired = third.nics[Number(i)].subnet;
          nic.targetSubnetId = `${f.birth.vnet.id}/subnets/${desired.name}`;
          nic.targetSubnetCidr = desired.cidr as string;
        }
      const repeated = await terraformNetworkDriverFixture(ha, true, {
        plan: third,
        inventory: before,
        source: restored.finalSource,
        sources: f.sources,
        store: f.store,
      });
      expect((await repeated.run()).status).toBe('complete');
      const result = await readAzureTerraformNetworkCompletionHistory(
        third,
        repeated.store,
        repeated.loaders,
        repeated.dependencies.qualifyAcceptance,
      );
      expect(result.sourceQualification.networkHistory?.map((r) => r.planSha256)).toEqual([
        f.plan.planSha256,
        f.next.planSha256,
      ]);
      expect(result.currentOperationalAcceptanceQualified).toBe(false);
      // Three sequential synthetic generations include all serial stages and authenticated history reads.
    },
    ha ? 240000 : 30000,
  );
for (const part of ['completion', 'preflight', 'revision', 'source', 'checkpoint'])
  test(`generation qualification rejects missing predecessor ${part}`, async () => {
    const f = await fixture();
    const prefix = `${f.plan.planId}-terraform-network`;
    const suffix = {
      completion: 'driver-complete',
      preflight: 'node-1-preflight',
      revision: 'driver-revision-0',
      source: 'source',
      checkpoint: 'driver-checkpoint',
    }[part];
    await f.store.remove(`${prefix}-${suffix}.json`);
    await expect(f.qualify()).rejects.toThrow();
  });
for (const part of ['source', 'uuid', 'mac', 'subnet', 'owner', 'ip-config', 'lock', 'site'])
  test(`generation source rejects changed ${part}`, async () => {
    const f = await fixture();
    const vm = f.input.inventory.nodes['1'],
      nic = vm.nics['1'];
    if (part === 'source') f.input.source += ' ';
    if (part === 'uuid') vm.vmId = '00000000-0000-4000-8000-000000000099';
    if (part === 'mac') nic.mac = '02:00:00:00:00:99';
    if (part === 'subnet') nic.subnetId = nic.targetSubnetId;
    if (part === 'owner') vm.ownerPlanSha256 = 'a'.repeat(64);
    if (part === 'ip-config') nic.ipConfigurationId += '/foreign';
    if (part === 'lock') f.input.providerLockSha256 = 'a'.repeat(64);
    if (part === 'site') f.input.site.siteUid = 'foreign';
    await expect(f.qualify()).rejects.toThrow();
  });
test('generation history rejects acknowledgement-only acceptance', async () => {
  const f = await fixture();
  await expect(
    qualifyAzureTerraformNetworkGenerationSource(
      f.next,
      f.input.source,
      f.input.inventory,
      f.store,
      f.loaders,
      f.input.providerLockSha256,
      f.input.site,
      async () => ({ status: 'verified', scope: 'request-acknowledgement', evidenceSha256: 'a'.repeat(64) }) as never,
    ),
  ).rejects.toThrow();
});
test('generation source permits validated dynamic address change without changing retained identity', async () => {
  const f = await fixture();
  f.input.inventory.nodes['1'].nics['1'].privateIp = '10.20.2.44';
  expect((await f.qualify()).networkHistory).toHaveLength(1);
});

test('completed no-op repetition authenticates its predecessor and drives actual serial stages', async () => {
  const f = await fixture();
  const p = compileAzureTerraformNetworkUpdatePlan(f.birth.plan, f.plan, f.birth.original);
  f.sources.set(p.planSha256, p);
  const before = structuredClone(f.history.inventory);
  before.planSha256 = p.planSha256;
  const next = await terraformNetworkDriverFixture(false, false, {
    plan: p,
    inventory: before,
    source: f.history.finalSource,
    sources: f.sources,
    store: f.store,
  });
  expect((await next.run()).status).toBe('complete');
  const h = await readAzureTerraformNetworkCompletionHistory(
    p,
    next.store,
    next.loaders,
    next.dependencies.qualifyAcceptance,
  );
  expect(h.sourceQualification.networkHistory?.map((r) => r.planSha256)).toEqual([f.plan.planSha256]);
  expect(h.finalSource).toBe(f.history.finalSource);
}, 15000);
test('historical qualification does not bypass a repeated driver current-unknown preflight', async () => {
  const f = await fixture();
  const next = await terraformNetworkDriverFixture(false, true, {
    plan: f.next,
    inventory: f.input.inventory,
    source: f.input.source,
    sources: f.sources,
    store: f.store,
  });
  next.state.unknown = true;
  expect((await next.run()).status).toBe('operational-acceptance-pending');
  expect(next.calls).toEqual([]);
});
for (const kind of ['verifier', 'source-loader', 'outcome-loader'])
  test(`generation qualification bounds ignored cancellation from ${kind}`, async () => {
    const f = await fixture();
    const never = () => new Promise<never>(() => {});
    const loaders = { ...f.loaders };
    if (kind === 'source-loader') loaders.loadSource = never;
    if (kind === 'outcome-loader') loaders.loadOutcome = never;
    const verifier = kind === 'verifier' ? never : f.dependencies.qualifyAcceptance;
    const start = Date.now();
    await expect(
      qualifyAzureTerraformNetworkGenerationSource(
        f.next,
        f.input.source,
        f.input.inventory,
        f.store,
        loaders,
        f.input.providerLockSha256,
        f.input.site,
        verifier,
        AbortSignal.timeout(20),
      ),
    ).rejects.toThrow();
    expect(Date.now() - start).toBeLessThan(1000);
  });
for (const kind of ['source', 'outcome', 'store'])
  test(`generation qualification preserves unavailable ${kind} as failure`, async () => {
    const f = await fixture();
    const unavailable = async () => {
      throw Error('service unauthorized');
    };
    const loaders = { ...f.loaders };
    if (kind === 'source') loaders.loadSource = unavailable;
    if (kind === 'outcome') loaders.loadOutcome = unavailable;
    const store =
      kind === 'store'
        ? new Proxy(f.store, {
            get(target, key) {
              if (key === 'read') return unavailable;
              const v = Reflect.get(target, key, target);
              return typeof v === 'function' ? v.bind(target) : v;
            },
          })
        : f.store;
    await expect(
      qualifyAzureTerraformNetworkGenerationSource(
        f.next,
        f.input.source,
        f.input.inventory,
        store,
        loaders,
        f.input.providerLockSha256,
        f.input.site,
        f.dependencies.qualifyAcceptance,
      ),
    ).rejects.toThrow();
  });
test('repeated generation requires trusted historical verifier', async () => {
  const f = await fixture();
  await expect(
    qualifyAzureTerraformNetworkGenerationSource(
      f.next,
      f.input.source,
      f.input.inventory,
      f.store,
      f.loaders,
      f.input.providerLockSha256,
      f.input.site,
    ),
  ).rejects.toThrow();
});
for (const kind of ['partial-nics', 'allocation', 'nic-owner', 'malformed-private-ip'])
  test(`adjacent generation rejects ${kind}`, async () => {
    const f = await fixture();
    const n = f.input.inventory.nodes['1'].nics['1'];
    if (kind === 'partial-nics') delete f.input.inventory.nodes['1'].nics['0'];
    if (kind === 'allocation') n.allocation = 'Static';
    if (kind === 'nic-owner') n.ownerPlanSha256 = 'a'.repeat(64);
    if (kind === 'malformed-private-ip') n.privateIp = 'unknown';
    await expect(f.qualify()).rejects.toThrow();
  });
test('generation source rejects raced immutable packets across completed ancestors', async () => {
  const f = await fixture();
  const next = await terraformNetworkDriverFixture(false, true, {
    plan: f.next,
    inventory: f.input.inventory,
    source: f.input.source,
    sources: f.sources,
    store: f.store,
  });
  expect((await next.run()).status).toBe('complete');
  const h = await readAzureTerraformNetworkCompletionHistory(
    f.next,
    next.store,
    next.loaders,
    next.dependencies.qualifyAcceptance,
  );
  const third = compileAzureTerraformNetworkUpdatePlan(f.birth.plan, f.next, f.birth.original);
  f.sources.set(third.planSha256, third);
  const before = structuredClone(h.inventory);
  before.planSha256 = third.planSha256;
  for (const [index, nic] of Object.entries(before.nodes['1'].nics)) {
    nic.targetSubnetId = `${f.birth.vnet.id}/subnets/${third.nics[Number(index)].subnet.name}`;
    nic.targetSubnetCidr = third.nics[Number(index)].subnet.cidr as string;
  }
  let raced = false;
  const verifier: typeof f.dependencies.qualifyAcceptance = async (receipt, identity, mode) => {
    if (identity.planSha256 === f.next.planSha256 && !raced) {
      raced = true;
      const name = `${f.plan.planId}-terraform-network-driver-complete.json`;
      const record = (await f.store.read(name)) as Record<string, unknown>;
      record.checkpointSha256 = 'a'.repeat(64);
      await f.store.write(name, record);
    }
    return f.dependencies.qualifyAcceptance(receipt, identity, mode);
  };
  await expect(
    qualifyAzureTerraformNetworkGenerationSource(
      third,
      h.finalSource,
      before,
      f.store,
      f.loaders,
      f.input.providerLockSha256,
      f.input.site,
      verifier,
    ),
  ).rejects.toThrow();
  expect(raced).toBe(true);
}, 15000);
test('generation loaders reject a foreign plan under the declared predecessor digest', async () => {
  const f = await fixture();
  const loaders = { ...f.loaders, loadSource: async () => f.birth.original };
  await expect(
    qualifyAzureTerraformNetworkGenerationSource(
      f.next,
      f.input.source,
      f.input.inventory,
      f.store,
      loaders,
      f.input.providerLockSha256,
      f.input.site,
      f.dependencies.qualifyAcceptance,
    ),
  ).rejects.toThrow();
});
test('generation history rechecks source loader digests across the complete read', async () => {
  const f = await fixture();
  let first = true;
  const loaders = {
    ...f.loaders,
    loadSource: async (digest: string) => {
      const p = await f.loaders.loadSource(digest);
      if (digest === f.plan.planSha256 && !first) {
        return { ...p, warnings: ['raced original bytes'] };
      }
      if (digest === f.plan.planSha256) first = false;
      return p;
    },
  };
  await expect(
    qualifyAzureTerraformNetworkGenerationSource(
      f.next,
      f.input.source,
      f.input.inventory,
      f.store,
      loaders,
      f.input.providerLockSha256,
      f.input.site,
      f.dependencies.qualifyAcceptance,
    ),
  ).rejects.toThrow();
});
