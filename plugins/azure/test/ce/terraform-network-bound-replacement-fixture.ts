import { expect } from 'bun:test';
import { captureAzureNetworkUpdateInventory } from '../../src/ce/network-update';
import { compileAzureCePlan } from '../../src/ce/planner';
import { qualifyAzureTerraformNetworkBoundReplacementSource } from '../../src/ce/terraform-network-bound-replacement-source';
import { readAzureTerraformNetworkCompletionHistory } from '../../src/ce/terraform-network-completion-history';
import { compileAzureTerraformNetworkUpdatePlan } from '../../src/ce/terraform-network-plan';
import { compileAzureTerraformNetworkReplacementPlan } from '../../src/ce/terraform-network-replacement-plan';
import type { AzureCeIntent } from '../../src/ce/types';
import { terraformNetworkDriverFixture } from './terraform-network-driver-fixture';
import { terraformNetworkSerialPowerFixture } from './terraform-network-driver-power-runner-fixture';
import { lineageCleanupEvidence } from './terraform-network-lineage-fixture';
import { terraformNetworkSourceFixture } from './terraform-network-source-fixture';

export async function terraformNetworkBoundReplacementFixture(
  ha = false,
  restore = false,
  nativePower = false,
  seed?: {
    birth: Awaited<ReturnType<typeof terraformNetworkSourceFixture>>;
    network: ReturnType<typeof compileAzureTerraformNetworkUpdatePlan>;
    driver: Awaited<ReturnType<typeof terraformNetworkSerialPowerFixture>>;
  },
  ingress?: AzureCeIntent['ingress'],
) {
  const birth = seed?.birth ?? (await terraformNetworkSourceFixture(ha, false, undefined, ingress));
  let network = seed?.network ?? compileAzureTerraformNetworkUpdatePlan(birth.plan, birth.original);
  const inventory = await captureAzureNetworkUpdateInventory(network, birth.api);
  const sources = new Map(birth.sources);
  sources.set(network.planSha256, network);
  let f =
    seed?.driver ??
    (nativePower
      ? await terraformNetworkSerialPowerFixture(ha, async (request) => lineageCleanupEvidence(request, '1.16.5'), {
          plan: network,
          inventory,
          source: birth.source,
          sources,
        })
      : await terraformNetworkDriverFixture(ha, true, { plan: network, inventory, source: birth.source, sources }));
  if (!seed) expect((await f.run()).status).toBe('complete');
  let h = await readAzureTerraformNetworkCompletionHistory(
    network,
    f.store,
    f.loaders,
    f.dependencies.qualifyAcceptance,
  );
  if (restore) {
    const restored = compileAzureTerraformNetworkUpdatePlan(
      compileAzureCePlan({ ...birth.original.intent, operation: 'update-network' }, birth.current),
      network,
      birth.original,
    );
    const retainedInventory = structuredClone(h.inventory);
    retainedInventory.planSha256 = restored.planSha256;
    for (const vm of Object.values(retainedInventory.nodes))
      for (const [index, nic] of Object.entries(vm.nics)) {
        nic.targetSubnetId = `${birth.vnet.id}/subnets/${restored.nics[Number(index)].subnet.name}`;
        nic.targetSubnetCidr = restored.nics[Number(index)].subnet.cidr as string;
      }
    sources.set(restored.planSha256, restored);
    f = await terraformNetworkDriverFixture(ha, true, {
      plan: restored,
      inventory: retainedInventory,
      source: h.finalSource,
      sources,
      store: f.store,
    });
    expect((await f.run()).status).toBe('complete');
    network = restored;
    h = await readAzureTerraformNetworkCompletionHistory(network, f.store, f.loaders, f.dependencies.qualifyAcceptance);
  }
  const plan = compileAzureTerraformNetworkReplacementPlan(
    compileAzureCePlan({ ...network.intent, operation: 'replace-node', replacementNode: ha ? 2 : 1 }, birth.current),
    network,
    birth.original,
  );
  const input = {
    plan,
    networkPlan: network,
    originalPlan: birth.original,
    source: h.finalSource,
    inventory: structuredClone(h.inventory),
    providerLockSha256: birth.lock,
    site: birth.site,
  };
  const run = (signal?: AbortSignal) =>
    qualifyAzureTerraformNetworkBoundReplacementSource(
      input,
      f.store,
      f.loaders,
      f.dependencies.qualifyAcceptance,
      signal,
    );
  return { ...f, birth, network, h, input, qualify: run };
}
