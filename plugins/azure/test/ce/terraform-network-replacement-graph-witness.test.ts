import { expect } from 'bun:test';
import { compileAzureCePlan } from '../../src/ce/planner';
import { compileAzureTerraformNetworkUpdatePlan } from '../../src/ce/terraform-network-plan';
import {
  readAzureTerraformNetworkRetirementGraph,
  recheckAzureTerraformNetworkRetirementGraph,
} from '../../src/ce/terraform-network-retirement-graph';
import { test } from './owned-fixture-test';
import { terraformNetworkDriverFixture } from './terraform-network-driver-fixture';
import { completedReplacement, rehash } from './terraform-network-mixed-generation-fixture';

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

test('completed replacement witness replays historical results and bounds ignored replacement cancellation', async () => {
  const { f, next, driver } = await preparedNetworkAfterReplacement(false);
  expect((await driver.run()).status).toBe('complete');
  const original = f.dependencies.qualifyCompletedOperational;
  let changed = false,
    stall = false;
  const modes: string[] = [];
  const started = Promise.withResolvers<void>(),
    settled = Promise.withResolvers<void>();
  const verifier: typeof original = async (...args) => {
    modes.push(args[2]);
    expect(args[2]).toBe('historical');
    const result = structuredClone(await original(...args));
    if (stall) {
      started.resolve();
      await settled.promise;
    }
    if (changed) result.evidenceSha256 = 'f'.repeat(64);
    return result;
  };
  const graph = await readAzureTerraformNetworkRetirementGraph(
    next,
    f.store,
    driver.loaders,
    driver.site,
    driver.dependencies.qualifyAcceptance,
    undefined,
    verifier,
  );
  expect(graph.original.binding.qualification.networkHistory?.map((link) => link.kind)).toEqual([
    'network-update',
    'node-replacement',
  ]);
  expect(modes.length).toBeGreaterThan(0);
  const calls = [...driver.calls],
    observations = [...driver.observations],
    collected = [...f.state.collected];
  const count = modes.length;
  expect(
    await recheckAzureTerraformNetworkRetirementGraph(
      graph,
      next,
      f.store,
      driver.loaders,
      driver.site,
      driver.dependencies.qualifyAcceptance,
      undefined,
      verifier,
    ),
  ).toEqual(graph);
  expect(modes.length).toBeGreaterThan(count);
  changed = true;
  await expect(
    recheckAzureTerraformNetworkRetirementGraph(
      graph,
      next,
      f.store,
      driver.loaders,
      driver.site,
      driver.dependencies.qualifyAcceptance,
      undefined,
      verifier,
    ),
  ).rejects.toThrow('historical verifier changed');
  changed = false;
  stall = true;
  const controller = new AbortController();
  const running = recheckAzureTerraformNetworkRetirementGraph(
    graph,
    next,
    f.store,
    driver.loaders,
    driver.site,
    driver.dependencies.qualifyAcceptance,
    controller.signal,
    verifier,
  );
  await started.promise;
  controller.abort(Error('replacement replay aborted'));
  await expect(running).rejects.toThrow('replacement replay aborted');
  settled.resolve();
  await expect(
    recheckAzureTerraformNetworkRetirementGraph(
      graph,
      next,
      f.store,
      driver.loaders,
      driver.site,
      driver.dependencies.qualifyAcceptance,
      undefined,
      async (...args) => original(...args),
    ),
  ).rejects.toThrow('owning authenticated graph witness required');
  expect(driver.calls).toEqual(calls);
  expect(driver.observations).toEqual(observations);
  expect(f.state.collected).toEqual(collected);
  expect(graph.currentOperationalAcceptanceQualified).toBe(false);
  expect(graph.parentRetirementQualified).toBe(false);
}, 120000);
