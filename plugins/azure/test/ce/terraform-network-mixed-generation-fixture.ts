import { expect } from 'bun:test';
import { canonicalSha256 } from '../../src/ce/canonical';
import type { AzureNetworkUpdateInventory } from '../../src/ce/network-update';
import { compileAzureCePlan } from '../../src/ce/planner';
import { observeAzureTerraformNetworkReplacementCurrent } from '../../src/ce/terraform-network-replacement-current';
import { compileAzureTerraformNetworkReplacementPlan } from '../../src/ce/terraform-network-replacement-plan';
import type { AzureCePlan } from '../../src/ce/types';
import { networkReplacementExecutorFixture as fixture } from './terraform-network-replacement-executor-fixture';

export function rehash(plan: AzureCePlan): AzureCePlan {
  const { planId: _id, planSha256: _sha, ...draft } = plan;
  const digest = canonicalSha256(draft);
  return { ...draft, planId: `azure-ce-${digest.slice(0, 24)}`, planSha256: digest };
}
export async function completedReplacement(
  ha: boolean,
  nativePower = false,
  existing?: {
    fixture: Awaited<ReturnType<typeof fixture>>;
    result: Awaited<ReturnType<Awaited<ReturnType<typeof fixture>>['run']>>;
  },
) {
  const f = existing?.fixture ?? (await fixture(ha, false, undefined, nativePower)),
    first = f.input.plan,
    original = f.birth.original;
  const result = existing?.result ?? (await f.run());
  expect(result.status).toBe('complete');
  const current = await observeAzureTerraformNetworkReplacementCurrent(
    {
      plan: first,
      retainedPlan: f.input.networkPlan,
      binding: f.binding,
      sourceBindingSha256: canonicalSha256(f.binding),
      phase: 'launched',
      newVmId: f.newVmId,
    },
    f.executionApi,
  );
  const inventory: AzureNetworkUpdateInventory = {
    schemaVersion: 1,
    engine: 'terraform',
    planSha256: first.planSha256,
    collectedAt: current.collectedAt,
    nodes: Object.fromEntries(
      Object.entries(current.nodes).map(([key, vm]) => {
        if (vm.vmState !== 'present' || !vm.vmId || !vm.ownerPlanSha256)
          throw Error('missing actual completed replacement identity');
        return [
          key,
          {
            resourceId: vm.resourceId,
            vmId: vm.vmId,
            ownerPlanSha256: vm.ownerPlanSha256,
            nics: Object.fromEntries(
              Object.entries(vm.nics).map(([index, nic]) => {
                const { attachment: _attachment, ...identity } = nic;
                return [index, identity];
              }),
            ),
          },
        ];
      }),
    ),
  };
  expect(current.currentOperationalAcceptanceQualified).toBe(false);
  expect(inventory.nodes[String(f.selected)].vmId).toBe(f.newVmId);
  expect(inventory.nodes[String(f.selected)].ownerPlanSha256).toBe(first.planSha256);
  const node = ha ? 3 : 1;
  const draft = compileAzureCePlan({ ...first.intent, replacementNode: node }, f.birth.current);
  for (const action of draft.actions)
    if (action.kind === 'vm-delete') action.expectedOwnerPlanSha256 = inventory.nodes[String(node)].ownerPlanSha256;
  const next = compileAzureTerraformNetworkReplacementPlan(rehash(draft), first, original);
  const loaders = {
    async loadSource(digest: string) {
      if (digest === first.planSha256) return structuredClone(first);
      return f.loaders.loadSource(digest);
    },
    async loadOutcome(plan: AzureCePlan) {
      if (plan.planSha256 === first.planSha256) return structuredClone(result);
      return f.loaders.loadOutcome(plan);
    },
  };
  const input = {
    plan: next,
    networkPlan: first,
    originalPlan: original,
    source: f.state.configuration,
    inventory,
    providerLockSha256: f.birth.lock,
    site: f.birth.site,
  };
  return { f, first, original, result, next, inventory, loaders, input };
}
