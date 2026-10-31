import { afterEach, expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import { canonicalSha256 } from '../../src/ce/canonical';
import { captureAzureNetworkUpdateInventory } from '../../src/ce/network-update';
import { compileAzureCePlan } from '../../src/ce/planner';
import { readAzureTerraformNetworkCompletionHistory } from '../../src/ce/terraform-network-completion-history';
import { compileAzureTerraformNetworkUpdatePlan } from '../../src/ce/terraform-network-plan';
import { compileAzureTerraformNetworkReplacementPlan } from '../../src/ce/terraform-network-replacement-plan';
import { terraformNetworkDriverFixture } from './terraform-network-driver-fixture';
import { completedReplacement, rehash } from './terraform-network-mixed-generation-fixture';
import { nicExecutionRoots } from './terraform-network-nic-execution-fixture';
import { networkReplacementExecutorFixture } from './terraform-network-replacement-executor-fixture';

afterEach(async () => {
  for (const root of nicExecutionRoots.splice(0)) await rm(root, { recursive: true });
});
async function preparedNetworkAfterReplacement(ha: boolean) {
  const { f, first, original, result, inventory } = await completedReplacement(ha);
  const { replacementNode: _node, ...intent } = first.intent;
  const draft = compileAzureCePlan(
    { ...intent, operation: 'update-network', nics: original.intent.nics },
    f.birth.current,
  );
  for (const action of draft.actions) {
    if ((action.kind === 'vm-deallocate' || action.kind === 'vm-start') && action.node)
      action.expectedOwnerPlanSha256 = inventory.nodes[String(action.node)].ownerPlanSha256;
    if (action.kind === 'nic-update' && action.node) {
      const nic = Object.values(inventory.nodes[String(action.node)].nics).find(
        (row) => row.resourceId === action.resourceId,
      );
      if (!nic) throw Error('unresolved actual owning retained NIC');
      action.expectedOwnerPlanSha256 = nic.ownerPlanSha256;
    }
  }
  const next = compileAzureTerraformNetworkUpdatePlan(rehash(draft), first, original);
  const before = structuredClone(inventory);
  before.planSha256 = next.planSha256;
  for (const vm of Object.values(before.nodes))
    for (const [index, nic] of Object.entries(vm.nics)) {
      nic.targetSubnetId = `${f.birth.vnet.id}/subnets/${next.nics[Number(index)].subnet.name}`;
      nic.targetSubnetCidr = next.nics[Number(index)].subnet.cidr as string;
    }
  const sources = new Map(f.birth.sources);
  sources.set(f.network.planSha256, f.network);
  sources.set(first.planSha256, first);
  sources.set(next.planSha256, next);
  const outcomes = new Map(f.birth.outcomes);
  outcomes.set(first.planSha256, result);
  const driver = await terraformNetworkDriverFixture(ha, true, {
    plan: next,
    inventory: before,
    source: f.state.configuration,
    sources,
    outcomes,
    store: f.store,
    replacementVerifier: f.dependencies.qualifyCompletedOperational,
  });
  return { f, first, original, result, inventory, next, driver, sources, outcomes };
}
for (const ha of [false, true]) {
  test(
    `actual completed replacement executes a serial restored network (${ha ? 'HA' : 'single'})`,
    async () => {
      const { f, first, original, inventory, next, driver, sources, outcomes } =
        await preparedNetworkAfterReplacement(ha);
      const originalCompletion = canonicalSha256(
        await f.store.read(`${first.planId}-terraform-network-replacement-complete.json`),
      );
      expect((await driver.run()).status).toBe('complete');
      const history = await readAzureTerraformNetworkCompletionHistory(
        next,
        f.store,
        driver.loaders,
        driver.dependencies.qualifyAcceptance,
        undefined,
        f.dependencies.qualifyCompletedOperational,
      );
      expect(history.sourceQualification.networkHistory?.map((link) => link.kind)).toEqual([
        'network-update',
        'node-replacement',
      ]);
      for (const [node, vm] of Object.entries(inventory.nodes)) {
        expect(history.inventory.nodes[node].vmId).toBe(vm.vmId);
        expect(history.inventory.nodes[node].ownerPlanSha256).toBe(vm.ownerPlanSha256);
        for (const [index, nic] of Object.entries(vm.nics)) {
          const current = history.inventory.nodes[node].nics[index];
          expect(current.mac).toBe(nic.mac);
          expect(current.ownerPlanSha256).toBe(nic.ownerPlanSha256);
          expect(current.subnetId).toBe(`${f.birth.vnet.id}/subnets/${next.nics[Number(index)].subnet.name}`);
        }
      }
      const calls = [...driver.calls];
      expect((await driver.run()).status).toBe('complete');
      expect(driver.calls).toEqual(calls);
      expect(canonicalSha256(await f.store.read(`${first.planId}-terraform-network-replacement-complete.json`))).toBe(
        originalCompletion,
      );
      const networkCompletion = canonicalSha256(
        await f.store.read(`${next.planId}-terraform-network-driver-complete.json`),
      );
      const selected = ha ? 3 : 1;
      const draft = compileAzureCePlan(
        { ...first.intent, nics: next.intent.nics, replacementNode: selected },
        f.birth.current,
      );
      for (const action of draft.actions)
        if (action.kind === 'vm-delete')
          action.expectedOwnerPlanSha256 = history.inventory.nodes[String(selected)].ownerPlanSha256;
      const third = compileAzureTerraformNetworkReplacementPlan(rehash(draft), next, original);
      sources.set(third.planSha256, third);
      const loaders = {
        async loadSource(digest: string) {
          const value = sources.get(digest);
          if (!value) throw Error('missing source');
          return structuredClone(value);
        },
        async loadOutcome(plan: typeof next) {
          const value = outcomes.get(plan.planSha256);
          if (!value) throw Error('missing outcome');
          return structuredClone(value);
        },
      };
      const input = {
        plan: third,
        networkPlan: next,
        originalPlan: original,
        source: history.finalSource,
        inventory: history.inventory,
        providerLockSha256: f.birth.lock,
        site: f.birth.site,
      };
      const again = await networkReplacementExecutorFixture(ha, false, {
        fixture: {
          ...f,
          network: next,
          input,
          loaders,
          api: driver.api,
          terraform: {
            async open() {
              return driver.session;
            },
          },
          dependencies: { qualifyAcceptance: driver.dependencies.qualifyAcceptance },
        },
        newVmId: '00000000-0000-4000-8000-000000000088',
        replacementVerifier: f.dependencies.qualifyCompletedOperational,
      });
      expect((await again.run()).status).toBe('complete');
      expect((await again.run()).status).toBe('complete');
      expect(again.state.applies).toBe(2);
      expect(again.state.bootstraps).toBe(1);
      expect(again.binding.before.nodes).toEqual(history.inventory.nodes);
      expect(again.binding.qualification.networkHistory.map((link) => link.kind)).toEqual([
        'network-update',
        'node-replacement',
        'network-update',
      ]);
      expect(again.newVmId).not.toBe(f.newVmId);
      expect(canonicalSha256(await f.store.read(`${next.planId}-terraform-network-driver-complete.json`))).toBe(
        networkCompletion,
      );
      expect(canonicalSha256(await f.store.read(`${first.planId}-terraform-network-replacement-complete.json`))).toBe(
        originalCompletion,
      );
      // HA covers network, replacement, restored network, replacement, and replayed immutable history.
    },
    ha ? 600000 : 240000,
  );
}

for (const lost of ['deallocate', 'nic', 'start', 'routing'])
  test(`actual network after replacement resumes lost ${lost} without another mutation`, async () => {
    const { driver, inventory, next } = await preparedNetworkAfterReplacement(false);
    driver.state.lostStage = lost;
    await expect(driver.run()).rejects.toThrow('synthetic lost completed stage response');
    expect((await driver.run()).status).toBe('complete');
    expect(driver.calls).toEqual(['1:deallocate', '1:nic', '1:start', '1:routing']);
    const current = await captureAzureNetworkUpdateInventory(next, driver.api);
    expect(current.nodes['1'].vmId).toBe(inventory.nodes['1'].vmId);
    expect(current.nodes['1'].ownerPlanSha256).toBe(inventory.nodes['1'].ownerPlanSha256);
  }, 180000);
test('actual HA network after replacement resumes unavailable restored evidence without reapplying accepted nodes', async () => {
  const { driver } = await preparedNetworkAfterReplacement(true);
  driver.state.rejectPurpose = 'restored:2';
  const pending = await driver.run();
  expect(pending.status).toBe('operational-acceptance-pending');
  if (pending.status !== 'operational-acceptance-pending') throw Error('expected pending restored acceptance');
  expect(pending.node).toBe(2);
  const priorCalls = [...driver.calls];
  driver.state.rejectPurpose = '';
  expect((await driver.run()).status).toBe('complete');
  expect(driver.calls.slice(0, priorCalls.length)).toEqual(priorCalls);
  expect(driver.calls).toEqual(
    [1, 2, 3].flatMap((node) => ['deallocate', 'nic', 'start', 'routing'].map((stage) => `${node}:${stage}`)),
  );
}, 180000);
for (const unavailable of [false, true])
  test(`actual network after replacement rejects ${unavailable ? 'unavailable' : 'missing'} distinct verifier before a mutation`, async () => {
    const { driver } = await preparedNetworkAfterReplacement(false);
    driver.dependencies.qualifyReplacementCompleted = unavailable
      ? async () => {
          throw Error('synthetic predecessor unavailable');
        }
      : undefined;
    await expect(driver.run()).rejects.toThrow();
    expect(driver.calls).toEqual([]);
    await expect(driver.store.read(`${driver.plan.planId}-terraform-network-source.json`)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  }, 180000);
