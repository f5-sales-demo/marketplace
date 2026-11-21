import { expect } from 'bun:test';
import { canonicalSha256 } from '../../src/ce/canonical';
import { compileAzureCePlan } from '../../src/ce/planner';
import { qualifyAzureTerraformNetworkBoundReplacementSource } from '../../src/ce/terraform-network-bound-replacement-source';
import { readAzureTerraformNetworkCompletionHistory } from '../../src/ce/terraform-network-completion-history';
import { compileAzureTerraformNetworkUpdatePlan } from '../../src/ce/terraform-network-plan';
import { compileAzureTerraformNetworkReplacementPlan } from '../../src/ce/terraform-network-replacement-plan';
import { azureTerraformReplacementStages } from '../../src/ce/terraform-replacement';
import type { AzureCePlan } from '../../src/ce/types';
import { test } from './owned-fixture-test';
import { terraformNetworkBoundReplacementFixture as fixture } from './terraform-network-bound-replacement-fixture';
import { terraformNetworkDriverFixture } from './terraform-network-driver-fixture';

function rehash(p: AzureCePlan): AzureCePlan {
  const { planId: _id, planSha256: _sha, ...draft } = p;
  const digest = canonicalSha256(draft);
  return { ...draft, planId: `azure-ce-${digest.slice(0, 24)}`, planSha256: digest };
}

for (const ha of [false, true])
  test(`network-bound replacement source authenticates retained NICs HA=${ha}`, async () => {
    const f = await fixture(ha);
    const q = await f.qualify();
    expect(q.retainedNetworkPlanSha256).toBe(f.network.planSha256);
    expect(q.originalPlanSha256).toBe(f.birth.original.planSha256);
    expect(q.selectedNode).toBe(ha ? 2 : 1);
    expect(q.sourceConfigurationSha256).toBe(f.hash(f.input.source));
    expect(q.currentOperationalAcceptanceQualified).toBe(false);
    expect(q.networkHistory.map((row) => row.planSha256)).toEqual([f.network.planSha256]);
    expect(JSON.stringify(q)).not.toContain('#cloud-config');
    const bootstrap =
      '#cloud-config\nwrite_files:\n  - path: /etc/vpm/user_data\n    content: replacement-enrollment\n';
    const stages = azureTerraformReplacementStages(
      f.input.plan,
      f.input.source,
      q.sourceConfigurationSha256,
      bootstrap,
    );
    const original = JSON.parse(f.input.source),
      quiesced = JSON.parse(stages.quiesce.configuration),
      launched = JSON.parse(stages.launch.configuration);
    expect(quiesced.resource.azurerm_network_interface).toEqual(original.resource.azurerm_network_interface);
    expect(launched.resource.azurerm_network_interface).toEqual(original.resource.azurerm_network_interface);
    for (let node = 1; node <= f.input.plan.topology.nodeCount; node++) {
      const name = `node_${node}`;
      if (node === q.selectedNode) {
        expect(quiesced.resource.azurerm_linux_virtual_machine[name]).toBeUndefined();
        expect(launched.resource.azurerm_linux_virtual_machine[name].custom_data).toBe(
          Buffer.from(bootstrap).toString('base64'),
        );
        expect(launched.resource.azurerm_linux_virtual_machine[name].tags['xcsh-plan-sha256']).toBe(
          f.input.plan.planSha256,
        );
      } else {
        expect(quiesced.resource.azurerm_linux_virtual_machine[name]).toEqual(
          original.resource.azurerm_linux_virtual_machine[name],
        );
        expect(launched.resource.azurerm_linux_virtual_machine[name]).toEqual(
          original.resource.azurerm_linux_virtual_machine[name],
        );
      }
    }
  }, 60000);
for (const kind of [
  'source',
  'provider',
  'site',
  'uuid',
  'vm-owner',
  'mac',
  'nic-owner',
  'subnet',
  'ip-config',
  'partial-nics',
  'allocation',
  'private-ip',
  'delete-resource',
  'delete-owner',
  'delete-node',
  'extra-delete',
  'namespace',
  'routing',
  'original',
  'network-engine',
])
  test(`network-bound replacement rejects ${kind}`, async () => {
    const f = await fixture();
    const i = f.input,
      vm = i.inventory.nodes['1'],
      nic = vm.nics['1'];
    if (kind === 'source') i.source += ' ';
    if (kind === 'provider') i.providerLockSha256 = 'a'.repeat(64);
    if (kind === 'site') i.site = { ...i.site, siteUid: 'foreign' };
    if (kind === 'uuid') vm.vmId = '00000000-0000-4000-8000-000000000099';
    if (kind === 'vm-owner') vm.ownerPlanSha256 = 'a'.repeat(64);
    if (kind === 'mac') nic.mac = '02:00:00:00:00:99';
    if (kind === 'nic-owner') nic.ownerPlanSha256 = 'a'.repeat(64);
    if (kind === 'subnet') nic.subnetId = nic.subnetId.replace(/[^/]+$/, 'foreign');
    if (kind === 'ip-config') nic.ipConfigurationName = 'foreign';
    if (kind === 'partial-nics') delete vm.nics['0'];
    if (kind === 'allocation') nic.allocation = 'Static';
    if (kind === 'private-ip') nic.privateIp = 'unknown';
    const action = i.plan.actions.find((a) => a.kind === 'vm-delete');
    if (!action) throw Error('Fixture requires the selected VM delete action');
    if (kind === 'delete-resource') action.resourceId += '-foreign';
    if (kind === 'delete-owner') action.expectedOwnerPlanSha256 = 'a'.repeat(64);
    if (kind === 'delete-node') action.node = 2;
    if (kind === 'extra-delete') i.plan.actions.push({ ...action, id: 'foreign' });
    if (kind === 'namespace') i.plan.namespace = 'example-foreign';
    if (kind === 'routing') i.plan.routing.mode = 'route-server';
    if (kind === 'original') i.originalPlan = rehash({ ...i.originalPlan, warnings: ['foreign-original'] });
    if (kind === 'network-engine') i.networkPlan = rehash({ ...i.networkPlan, engine: 'native' });
    i.plan = rehash(i.plan);
    await expect(f.qualify()).rejects.toThrow();
  });
test('network-bound replacement permits validated dynamic address without inventing freshness', async () => {
  const f = await fixture();
  f.input.inventory.nodes['1'].nics['1'].privateIp = '10.20.2.44';
  expect((await f.qualify()).currentOperationalAcceptanceQualified).toBe(false);
});
for (const packet of ['driver-complete', 'driver-checkpoint', 'node-1-preflight'])
  test(`network-bound replacement rejects missing ${packet}`, async () => {
    const f = await fixture();
    await f.store.remove(`${f.network.planId}-terraform-network-${packet}.json`);
    await expect(f.qualify()).rejects.toThrow();
  });
test('network-bound replacement rejects acknowledgment-only historical provenance', async () => {
  const f = await fixture();
  await expect(
    qualifyAzureTerraformNetworkBoundReplacementSource(
      f.input,
      f.store,
      f.loaders,
      async () => ({ status: 'verified', scope: 'request-acknowledgement', evidenceSha256: 'a'.repeat(64) }) as never,
    ),
  ).rejects.toThrow();
});
test('network-bound replacement propagates ignored-verifier cancellation', async () => {
  const f = await fixture();
  const start = Date.now();
  await expect(
    qualifyAzureTerraformNetworkBoundReplacementSource(
      f.input,
      f.store,
      f.loaders,
      () => new Promise<never>(() => {}),
      AbortSignal.timeout(20),
    ),
  ).rejects.toThrow();
  expect(Date.now() - start).toBeLessThan(1000);
});
test('network-bound replacement preserves original-source rejection after changed network source', async () => {
  const f = await fixture();
  expect(f.input.source).not.toBe(f.birth.source);
  const { qualifyAzureTerraformReplacementPublicSource } = await import(
    '../../src/ce/terraform-replacement-public-source'
  );
  const retainedNics = Object.fromEntries(
    Object.entries(f.input.inventory.nodes).flatMap(([node, vm]) =>
      Object.entries(vm.nics).map(([index, n]) => [
        `${node}:${index}`,
        {
          resourceId: n.resourceId,
          subnetId: n.subnetId,
          mac: n.mac,
          privateIp: n.privateIp,
          ownerPlanSha256: n.ownerPlanSha256,
        },
      ]),
    ),
  );
  const state = {
    oldVmIds: Object.fromEntries(
      Object.entries(f.input.inventory.nodes).map(([node, vm]) => [`${f.input.plan.deploymentName}-${node}`, vm.vmId]),
    ),
    ownerPlanSha256ByNode: Object.fromEntries(
      Object.entries(f.input.inventory.nodes).map(([node, vm]) => [
        `${f.input.plan.deploymentName}-${node}`,
        vm.ownerPlanSha256,
      ]),
    ),
    retainedNics,
    ...f.input.site,
  };
  const ordinary = structuredClone(f.input.plan);
  delete ordinary.terraformNetworkReplacementProfile;
  await expect(
    qualifyAzureTerraformReplacementPublicSource(
      rehash(ordinary),
      f.input.source,
      state,
      f.store,
      f.loaders.loadSource,
      f.loaders.loadOutcome,
      f.input.providerLockSha256,
    ),
  ).rejects.toThrow();
});
for (const lost of ['deallocate', 'nic', 'start', 'routing'])
  test(`replacement precursor follows restored network after lost ${lost} response`, async () => {
    const f = await fixture();
    const restored = compileAzureTerraformNetworkUpdatePlan(
      compileAzureCePlan({ ...f.birth.original.intent, operation: 'update-network' }, f.birth.current),
      f.network,
      f.birth.original,
    );
    const inventory = structuredClone(f.h.inventory);
    inventory.planSha256 = restored.planSha256;
    for (const [index, nic] of Object.entries(inventory.nodes['1'].nics)) {
      nic.targetSubnetId = `${f.birth.vnet.id}/subnets/${restored.nics[Number(index)].subnet.name}`;
      nic.targetSubnetCidr = restored.nics[Number(index)].subnet.cidr as string;
    }
    const sources = new Map(f.birth.sources);
    sources.set(f.network.planSha256, f.network);
    sources.set(restored.planSha256, restored);
    const next = await terraformNetworkDriverFixture(false, true, {
      plan: restored,
      inventory,
      source: f.h.finalSource,
      sources,
      store: f.store,
    });
    next.state.lostStage = lost;
    await expect(next.run()).rejects.toThrow('lost completed stage response');
    expect((await next.run()).status).toBe('complete');
    expect(next.calls).toEqual(['1:deallocate', '1:nic', '1:start', '1:routing']);
    const history = await readAzureTerraformNetworkCompletionHistory(
      restored,
      next.store,
      next.loaders,
      next.dependencies.qualifyAcceptance,
    );
    const plan = compileAzureTerraformNetworkReplacementPlan(
      compileAzureCePlan({ ...restored.intent, operation: 'replace-node', replacementNode: 1 }, f.birth.current),
      restored,
      f.birth.original,
    );
    const q = await qualifyAzureTerraformNetworkBoundReplacementSource(
      {
        plan,
        networkPlan: restored,
        originalPlan: f.birth.original,
        source: history.finalSource,
        inventory: history.inventory,
        providerLockSha256: f.birth.lock,
        site: f.birth.site,
      },
      next.store,
      next.loaders,
      next.dependencies.qualifyAcceptance,
    );
    expect(q.networkHistory.map((row) => row.planSha256)).toEqual([f.network.planSha256, restored.planSha256]);
  }, 60000);

for (const kind of ['original', 'retained', 'missing'])
  test(`bound replacement source rejects changed public profile ${kind}`, async () => {
    const f = await fixture();
    const profile = f.input.plan.terraformNetworkReplacementProfile;
    if (!profile) throw Error('Fixture requires an exact replacement profile');
    if (kind === 'original') profile.originalPlanSha256 = 'a'.repeat(64);
    if (kind === 'retained') profile.retainedPlanSha256 = 'b'.repeat(64);
    if (kind === 'missing') delete f.input.plan.terraformNetworkReplacementProfile;
    f.input.plan = rehash(f.input.plan);
    await expect(f.qualify()).rejects.toThrow();
  });
