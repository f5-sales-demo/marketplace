import { expect } from 'bun:test';
import { createHash } from 'node:crypto';
import { compileAzureCePlan } from '../../src/ce/planner';
import { qualifyAzureTerraformNetworkBoundReplacementSource } from '../../src/ce/terraform-network-bound-replacement-source';
import { qualifyAzureTerraformNetworkGenerationSource } from '../../src/ce/terraform-network-completion-history';
import { compileAzureTerraformNetworkUpdatePlan } from '../../src/ce/terraform-network-plan';
import { test } from './owned-fixture-test';
import { completedReplacement, rehash } from './terraform-network-mixed-generation-fixture';

for (const ha of [false, true]) {
  test(`completed actual replacement qualifies the next replacement source (${ha ? 'HA' : 'single'})`, async () => {
    const { f, first, next, loaders, input } = await completedReplacement(ha);
    const collected = [...f.state.collected];
    const qualified = await qualifyAzureTerraformNetworkBoundReplacementSource(
      input,
      f.store,
      loaders,
      f.dependencies.qualifyHistorical,
      undefined,
      f.dependencies.qualifyCompletedOperational,
    );
    expect(qualified.planSha256).toBe(next.planSha256);
    expect(qualified.originalPlanSha256).toBe(input.originalPlan.planSha256);
    expect(qualified.currentOperationalAcceptanceQualified).toBe(false);
    expect(qualified.networkHistory.map((link) => link.kind)).toEqual(['network-update', 'node-replacement']);
    expect(qualified.networkHistory.at(-1)?.planSha256).toBe(first.planSha256);
    const tail = qualified.networkHistory.at(-1);
    if (tail?.kind !== 'node-replacement') throw Error('distinct replacement history link required');
    expect(tail.journalSha256).toBe(f.journal.journalSha256);
    expect(f.state.collected).toEqual(collected);
    expect(f.state.applies).toBe(2);
  }, 120000);
  test(`completed actual replacement qualifies next network source (${ha ? 'HA' : 'single'})`, async () => {
    const { f, first, original, inventory, loaders } = await completedReplacement(ha);
    const { replacementNode: _node, ...intent } = first.intent;
    const draft = compileAzureCePlan({ ...intent, operation: 'update-network' }, f.birth.current);
    for (const action of draft.actions) {
      if ((action.kind === 'vm-deallocate' || action.kind === 'vm-start') && action.node)
        action.expectedOwnerPlanSha256 = inventory.nodes[String(action.node)].ownerPlanSha256;
      if (action.kind === 'nic-update' && action.node) {
        const nic = Object.values(inventory.nodes[String(action.node)].nics).find(
          (n) => n.resourceId === action.resourceId,
        );
        if (!nic) throw Error('unresolved current NIC owner');
        action.expectedOwnerPlanSha256 = nic.ownerPlanSha256;
      }
    }
    const next = compileAzureTerraformNetworkUpdatePlan(rehash(draft), first, original);
    const before = structuredClone(inventory);
    before.planSha256 = next.planSha256;
    const collected = [...f.state.collected];
    const qualified = await qualifyAzureTerraformNetworkGenerationSource(
      next,
      f.state.configuration,
      before,
      f.store,
      loaders,
      f.birth.lock,
      f.birth.site,
      f.dependencies.qualifyHistorical,
      undefined,
      f.dependencies.qualifyCompletedOperational,
    );
    expect(qualified.networkHistory?.map((link) => link.kind)).toEqual(['network-update', 'node-replacement']);
    expect(qualified.networkHistory?.at(-1)?.planSha256).toBe(first.planSha256);
    expect(qualified.sourceConfigurationSha256).toBe(inputDigest(f.state.configuration));
    expect(f.state.collected).toEqual(collected);
    expect(f.state.applies).toBe(2);
  }, 120000);
}
function inputDigest(source: string) {
  return createHash('sha256').update(source).digest('hex');
}

for (const failure of [
  'missing-verifier',
  'unavailable-verifier',
  'outcome-pending',
  'outcome-digest',
  'outcome-uuid',
  'inventory-vm',
  'inventory-mac',
  'inventory-ip-configuration',
  'missing-completion',
  'late-packet',
  'loader-swap',
  'request-mutation',
  'ignored-cancellation',
] as const)
  test(`mixed generation rejects ${failure} without new observation or mutation`, async () => {
    const { f, first, loaders, input } = await completedReplacement(false);
    const collected = [...f.state.collected],
      applies = f.state.applies;
    const controller = new AbortController();
    let completed = f.dependencies.qualifyCompletedOperational;
    if (failure === 'missing-verifier') completed = undefined as unknown as typeof completed;
    if (failure === 'unavailable-verifier')
      completed = async () => {
        throw Error('synthetic historical replacement unavailable');
      };
    if (failure.startsWith('outcome-')) {
      const original = loaders.loadOutcome;
      loaders.loadOutcome = async (plan) => {
        const value = await original(plan);
        if (plan.planSha256 !== first.planSha256) return value;
        if (failure === 'outcome-pending') return { ...value, status: 'completion-pending' };
        if (failure === 'outcome-digest') return { ...value, networkReplacementCompletionSha256: 'f'.repeat(64) };
        return { ...value, newVmId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };
      };
    }
    const node = input.inventory.nodes[String(f.selected)];
    if (failure === 'inventory-vm') node.vmId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    if (failure === 'inventory-mac') node.nics['1'].mac = '02:aa:bb:cc:dd:ee';
    if (failure === 'inventory-ip-configuration') node.nics['1'].ipConfigurationId += '-foreign';
    if (failure === 'missing-completion')
      await f.store.remove(`${first.planId}-terraform-network-replacement-complete.json`);
    if (failure === 'late-packet') {
      const original = completed;
      completed = async (...args) => {
        const result = await original(...args);
        const name = `${first.planId}-terraform-replacement-source.json`;
        const packet = (await f.store.read(name)) as Record<string, unknown>;
        await f.store.write(name, { ...packet, bootstrap: 'foreign' });
        return result;
      };
    }
    if (failure === 'loader-swap') {
      const original = completed;
      completed = async (...args) => {
        const result = await original(...args);
        loaders.loadSource = async () => {
          throw Error('changed loader');
        };
        return result;
      };
    }
    if (failure === 'request-mutation') {
      const original = completed;
      completed = async (...args) => {
        const result = await original(...args);
        input.inventory.nodes[String(f.selected)].vmId = 'foreign';
        return result;
      };
    }
    if (failure === 'ignored-cancellation')
      completed = async () => {
        controller.abort(Error('synthetic cancelled history'));
        return new Promise(() => {});
      };
    await expect(
      qualifyAzureTerraformNetworkBoundReplacementSource(
        input,
        f.store,
        loaders,
        f.dependencies.qualifyHistorical,
        controller.signal,
        completed,
      ),
    ).rejects.toThrow();
    expect(f.state.collected).toEqual(collected);
    expect(f.state.applies).toBe(applies);
  }, 120000);

for (const changed of ['plan', 'inventory'] as const)
  test(`coordinator outer request seal rejects late ${changed} mutation`, async () => {
    const { f, first, original, inventory, loaders } = await completedReplacement(false);
    const { replacementNode: _node, ...intent } = first.intent;
    const draft = compileAzureCePlan({ ...intent, operation: 'update-network' }, f.birth.current);
    for (const action of draft.actions)
      if ((action.kind === 'vm-deallocate' || action.kind === 'vm-start') && action.node)
        action.expectedOwnerPlanSha256 = inventory.nodes[String(action.node)].ownerPlanSha256;
    const next = compileAzureTerraformNetworkUpdatePlan(rehash(draft), first, original);
    const before = structuredClone(inventory);
    before.planSha256 = next.planSha256;
    const collected = [...f.state.collected],
      applies = f.state.applies;
    const originalVerifier = f.dependencies.qualifyCompletedOperational;
    const verifier: typeof originalVerifier = async (...args) => {
      const result = await originalVerifier(...args);
      if (changed === 'plan') next.siteName += '-foreign';
      else before.nodes['1'].nics['1'].mac = '02:aa:bb:cc:dd:ee';
      return result;
    };
    await expect(
      qualifyAzureTerraformNetworkGenerationSource(
        next,
        f.state.configuration,
        before,
        f.store,
        loaders,
        f.birth.lock,
        f.birth.site,
        f.dependencies.qualifyHistorical,
        undefined,
        verifier,
      ),
    ).rejects.toThrow(/request changed during qualification/);
    expect(f.state.collected).toEqual(collected);
    expect(f.state.applies).toBe(applies);
  }, 120000);
