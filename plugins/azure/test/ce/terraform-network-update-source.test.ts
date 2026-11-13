import { expect, test } from 'bun:test';
import { captureAzureNetworkUpdateInventory } from '../../src/ce/network-update';
import { compileAzureTerraformNetworkUpdatePlan } from '../../src/ce/terraform-network-plan';
import {
  qualifyAzureTerraformNetworkUpdateSource,
  verifyAzureTerraformNetworkUpdateState,
} from '../../src/ce/terraform-network-update-source';
import { terraformNetworkSourceFixture as sourceFixture } from './terraform-network-source-fixture';

for (const ha of [false, true])
  test(`Terraform network source qualifies exact ${ha ? 'HA' : 'single'} admitted creation and owning state without leaking bootstrap`, async () => {
    const f = await sourceFixture(ha);
    const result = await f.run();
    expect(result).toMatchObject({
      engine: 'terraform',
      originalPlanSha256: f.original.planSha256,
      sourceConfigurationSha256: f.hash(f.source),
      siteUid: f.site.siteUid,
      siteConfigurationSha256: f.site.siteConfigurationSha256,
      generationPlanSha256s: [f.original.planSha256],
    });
    expect(JSON.stringify(result)).not.toContain('e30.');
    expect(JSON.stringify(result)).not.toContain('#cloud-config');
    expect(() => verifyAzureTerraformNetworkUpdateState(f.plan, f.before, f.outputs)).not.toThrow();
    expect(f.mutations()).toBe(0);
  });

for (const mode of [
  'missing-workflow',
  'pending-workflow',
  'foreign-workflow',
  'missing-bootstrap',
  'future-launch',
  'workflow-digest',
  'missing-source',
  'wrong-source',
  'missing-outcome',
  'pending-outcome',
  'foreign-outcome',
  'partial-registration',
  'wrong-uuid',
  'foreign-registration-owner',
  'unknown-configuration',
  'foreign-site',
  'missing-site',
  'wrong-store-owner',
  'invalid-lock',
] as const)
  test(`Terraform network source rejects ${mode} before mutation`, async () => {
    const f = await sourceFixture(true);
    const workflow = f.records.get('terraform-workflow.json') as Record<string, unknown>;
    const outcome = f.outcomes.get(f.original.planSha256) as Record<string, unknown>;
    const registration = outcome.registrations as Record<string, unknown>;
    if (mode === 'missing-workflow') f.records.delete('terraform-workflow.json');
    if (mode === 'pending-workflow') workflow.stage = 'registration-pending';
    if (mode === 'foreign-workflow') workflow.engine = 'native';
    if (mode === 'missing-bootstrap') delete (workflow.bootstrapByNode as Record<string, unknown>)['2'];
    if (mode === 'future-launch') (workflow.launchedAtByNode as Record<string, unknown>)['2'] = '2099-01-01T00:00:00Z';
    if (mode === 'workflow-digest') workflow.configurationSha256 = 'a'.repeat(64);
    if (mode === 'missing-source') f.sources.clear();
    if (mode === 'wrong-source') f.sources.set(f.original.planSha256, f.plan);
    if (mode === 'missing-outcome') f.outcomes.clear();
    if (mode === 'pending-outcome') outcome.status = 'pending-registration';
    if (mode === 'foreign-outcome') outcome.engine = 'native';
    if (mode === 'partial-registration') (registration.nodes as unknown[]).pop();
    if (mode === 'wrong-uuid')
      (registration.nodes as Record<string, unknown>[])[1].instanceId = '00000000-0000-4000-8000-000000000099';
    if (mode === 'foreign-registration-owner') registration.owner = { ...f.store.owner, engine: 'native' };
    if (mode === 'unknown-configuration') (outcome.configuration as Record<string, unknown>).status = 'unknown';
    if (mode === 'foreign-site') (f.records.get('terraform-site.json') as Record<string, unknown>).uid = 'foreign';
    if (mode === 'missing-site') f.records.delete('terraform-site.json');
    if (mode === 'wrong-store-owner') f.store.owner = { ...f.store.owner, engine: 'native' };
    const run =
      mode === 'invalid-lock'
        ? () =>
            qualifyAzureTerraformNetworkUpdateSource(
              f.plan,
              f.source,
              f.before,
              f.store,
              async () => f.original,
              async () => outcome,
              'unresolved',
              f.site,
            )
        : f.run;
    await expect(run()).rejects.toThrow();
    expect(f.mutations()).toBe(0);
  });

for (const mode of [
  'missing-vm',
  'duplicate-vm',
  'foreign-vm-id',
  'changed-vm-uuid',
  'foreign-hostname',
  'foreign-vm-site',
  'missing-nic',
  'extra-nic',
  'wrong-role',
  'foreign-nic-id',
  'foreign-subnet',
  'foreign-nic-site',
  'unknown-field',
  'unresolved-id',
] as const)
  test(`Terraform network state rejects ${mode} before execution`, async () => {
    const f = await sourceFixture(true);
    const outputs = structuredClone(f.outputs) as Record<string, Record<string, Record<string, unknown>>>;
    if (mode === 'missing-vm') delete outputs.ce_instances['3'];
    if (mode === 'duplicate-vm') outputs.ce_instances['2'].vm_id = outputs.ce_instances['1'].vm_id;
    if (mode === 'foreign-vm-id') outputs.ce_instances['2'].id = outputs.ce_instances['1'].id;
    if (mode === 'changed-vm-uuid') outputs.ce_instances['2'].vm_id = '00000000-0000-4000-8000-000000000099';
    if (mode === 'foreign-hostname') outputs.ce_instances['2'].hostname = 'foreign';
    if (mode === 'foreign-vm-site') outputs.ce_instances['2'].site_name = 'foreign';
    if (mode === 'missing-nic') delete outputs.ce_interfaces['3:1'];
    if (mode === 'extra-nic') outputs.ce_interfaces['4:1'] = outputs.ce_interfaces['3:1'];
    if (mode === 'wrong-role') outputs.ce_interfaces['3:1'].role = 'slo';
    if (mode === 'foreign-nic-id') outputs.ce_interfaces['3:1'].id = outputs.ce_interfaces['1:1'].id;
    if (mode === 'foreign-subnet') outputs.ce_interfaces['3:1'].subnet_id = f.target;
    if (mode === 'foreign-nic-site') outputs.ce_interfaces['3:1'].site_name = 'foreign';
    if (mode === 'unknown-field') outputs.ce_interfaces['3:1'].secret = 'synthetic';
    if (mode === 'unresolved-id') outputs.ce_interfaces['3:1'].id = '$' + '{azurerm_network_interface.pending.id}';
    expect(() => verifyAzureTerraformNetworkUpdateState(f.plan, f.before, outputs)).toThrow();
    expect(f.mutations()).toBe(0);
  });

for (const ha of [false, true])
  test(`Terraform network source qualifies ${ha ? 'HA' : 'single'} recursive completed VM generations`, async () => {
    const f = await sourceFixture(ha, true);
    const result = await f.run();
    if (!f.h) throw Error('generation fixture missing');
    expect(result.generationPlanSha256s).toEqual(
      [f.original.planSha256, f.h.first.plan.planSha256, f.h.second.plan.planSha256].sort(),
    );
    expect(() => verifyAzureTerraformNetworkUpdateState(f.plan, f.before, f.outputs)).not.toThrow();
    expect(f.mutations()).toBe(0);
  });
for (const mode of [
  'missing-history',
  'partial-history',
  'missing-outcome',
  'foreign-outcome',
  'missing-stage',
  'wrong-lock',
  'wrong-stage-digest',
  'missing-source',
  'wrong-predecessor-uuid',
  'wrong-selected-uuid',
  'wrong-bootstrap',
] as const)
  test(`Terraform network ancestry rejects ${mode} before execution`, async () => {
    const f = await sourceFixture(true, true);
    const h = f.h;
    if (!h) throw Error('generation fixture missing');
    const cpName = `${h.second.plan.planId}-terraform-replacement.json`;
    const cp = f.records.get(cpName) as Record<string, unknown>;
    const outcome = f.outcomes.get(h.second.plan.planSha256);
    if (!outcome) throw Error('generation outcome missing');
    if (mode === 'missing-history') f.records.delete(cpName);
    if (mode === 'partial-history') cp.phase = 'launched';
    if (mode === 'missing-outcome') f.outcomes.delete(h.first.plan.planSha256);
    if (mode === 'foreign-outcome') outcome.engine = 'native';
    if (mode === 'missing-stage') f.records.delete(`${h.second.plan.planId}-terraform-launch-plan.json`);
    if (mode === 'wrong-lock')
      (
        (f.records.get(`${h.second.plan.planId}-terraform-launch-plan.json`) as Record<string, unknown>)
          .receipt as Record<string, unknown>
      ).providerLockSha256 = 'a'.repeat(64);
    if (mode === 'wrong-stage-digest') cp.launchConfigurationSha256 = 'a'.repeat(64);
    if (mode === 'missing-source') f.sources.delete(h.first.plan.planSha256);
    if (mode === 'wrong-predecessor-uuid')
      (cp.oldVmIds as Record<string, unknown>)[f.nodes[0]] = '00000000-0000-4000-8000-000000000099';
    if (mode === 'wrong-selected-uuid') cp.newVmId = '00000000-0000-4000-8000-000000000099';
    if (mode === 'wrong-bootstrap')
      (
        f.records.get(`${h.second.plan.planId}-terraform-replacement-source.json`) as Record<string, unknown>
      ).bootstrap = 'synthetic-private-marker';
    await expect(f.run()).rejects.toThrow();
    expect(f.mutations()).toBe(0);
  });

for (const mode of [
  'malformed',
  'extra-resource',
  'provider',
  'nic-subnet',
  'nic-output',
  'vm-bootstrap',
  'survivor-bootstrap',
  'vm-owner',
] as const)
  test(`Terraform network retained configuration rejects ${mode}`, async () => {
    const f = await sourceFixture(true, true);
    const json = JSON.parse(f.source);
    if (mode === 'extra-resource') json.resource.azurerm_resource_group.foreign = { name: 'foreign' };
    if (mode === 'provider') json.provider.azurerm.subscription_id = 'example-foreign';
    if (mode === 'nic-subnet')
      json.resource.azurerm_network_interface.node_2_nic_1.ip_configuration[0].subnet_id = f.target;
    if (mode === 'nic-output') json.output.ce_interfaces.value['2:1'].role = 'slo';
    if (mode === 'vm-bootstrap')
      json.resource.azurerm_linux_virtual_machine.node_2.custom_data =
        Buffer.from('synthetic-private-marker').toString('base64');
    if (mode === 'survivor-bootstrap')
      json.resource.azurerm_linux_virtual_machine.node_3.custom_data =
        json.resource.azurerm_linux_virtual_machine.node_2.custom_data;
    if (mode === 'vm-owner')
      json.resource.azurerm_linux_virtual_machine.node_2.tags['xcsh-plan-sha256'] = f.original.planSha256;
    await expect(f.run(mode === 'malformed' ? 'synthetic-private-marker' : JSON.stringify(json))).rejects.toThrow();
    expect(f.mutations()).toBe(0);
  });

for (const mode of [
  'partial-hardware',
  'changed-mac',
  'wrong-role',
  'duplicate-device',
  'foreign-hardware-owner',
  'foreign-hardware-site',
  'foreign-hardware-source',
  'wrong-evidence-kind',
] as const)
  test(`Terraform network source rejects ${mode} registration hardware`, async () => {
    const f = await sourceFixture(true);
    const configuration = f.outcomes.get(f.original.planSha256)?.configuration as Record<string, unknown>;
    const interfaces = configuration.interfaces as Record<string, unknown>[];
    if (mode === 'partial-hardware') interfaces.pop();
    if (mode === 'changed-mac') interfaces[2].mac = '02:00:00:aa:bb:cc';
    if (mode === 'wrong-role') interfaces[2].role = 'sli';
    if (mode === 'duplicate-device') interfaces[3].device = interfaces[2].device;
    if (mode === 'foreign-hardware-owner') configuration.owner = { ...f.store.owner, deploymentId: 'foreign' };
    if (mode === 'foreign-hardware-site') configuration.siteName = 'foreign';
    if (mode === 'foreign-hardware-source') configuration.source = '/api/foreign/registrations';
    if (mode === 'wrong-evidence-kind') configuration.evidenceKind = 'metric-query-grid';
    await expect(f.run()).rejects.toThrow();
    expect(f.mutations()).toBe(0);
  });

for (const ha of [false, true])
  test(`explicit first Terraform network source authenticates original predecessor HA=${ha}`, async () => {
    const f = await sourceFixture(ha);
    Object.assign(f.plan, compileAzureTerraformNetworkUpdatePlan(f.plan, f.original));
    Object.assign(f.before, await captureAzureNetworkUpdateInventory(f.plan, f.api));
    expect((await f.run()).originalPlanSha256).toBe(f.original.planSha256);
  });
for (const ha of [false, true])
  test(`explicit first Terraform network source authenticates latest initial replacement HA=${ha}`, async () => {
    const f = await sourceFixture(ha, true);
    if (!f.h) throw Error('missing replacement fixture');
    Object.assign(f.plan, compileAzureTerraformNetworkUpdatePlan(f.plan, f.h.second.plan, f.original));
    Object.assign(f.before, await captureAzureNetworkUpdateInventory(f.plan, f.api));
    expect((await f.run()).originalPlanSha256).toBe(f.original.planSha256);
  });
for (const ha of [false, true])
  test(`explicit Terraform network source cannot skip completed replacements HA=${ha}`, async () => {
    const f = await sourceFixture(ha, true);
    Object.assign(f.plan, compileAzureTerraformNetworkUpdatePlan(f.plan, f.original));
    Object.assign(f.before, await captureAzureNetworkUpdateInventory(f.plan, f.api));
    await expect(f.run()).rejects.toThrow();
  });
test('explicit repeated no-op Terraform network source requires predecessor completion even when original bytes still match', async () => {
  const f = await sourceFixture(false);
  const prior = compileAzureTerraformNetworkUpdatePlan(f.plan, f.original);
  Object.assign(f.plan, compileAzureTerraformNetworkUpdatePlan(f.plan, prior, f.original));
  Object.assign(f.before, await captureAzureNetworkUpdateInventory(f.plan, f.api));
  await expect(f.run()).rejects.toThrow();
});
