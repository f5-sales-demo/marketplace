import { expect, it } from 'bun:test';
import { compileAzureCePlan } from '../../src/ce/planner';
import {
  azureTerraformCurrentDeployment,
  azureTerraformFoundationDeployment,
  renderAzureTerraformFoundation,
} from '../../src/ce/terraform-foundation';
import { intent, observation } from './fixtures';

function plan(ha = false, termsAccepted = true) {
  const input = structuredClone(intent);
  input.engine = 'terraform';
  input.topology.ha = ha;
  input.nics = ['slo', 'data', 'sli'].map((role, index) => ({
    name: ['mgmt', 'external', 'internal'][index],
    role: role as 'slo' | 'data' | 'sli',
    subnet: { mode: 'greenfield', name: `nic${index}`, cidr: `10.20.${index}.0/24` },
  }));
  const observed = structuredClone(observation);
  observed.regions[0].quotaAvailable = 24;
  observed.image.termsAccepted = termsAccepted;
  return compileAzureCePlan(input, observed);
}
const bootstrap = '#cloud-config\nwrite_files:\n- path: /etc/vpm/user_data\n  content: fixture-material\n';

it('renders stable Azure network staging without starting VMs or generating bootstrap', () => {
  const p = plan();
  const rendered = renderAzureTerraformFoundation(p);
  expect(rendered).toBe(renderAzureTerraformFoundation(p));
  const config = JSON.parse(rendered);
  expect(Object.keys(config.resource.azurerm_network_interface)).toHaveLength(3);
  expect(config.resource.azurerm_linux_virtual_machine).toBeUndefined();
  expect(config.provider.azurerm.subscription_id).toBe(p.subscription.id);
  expect(config.provider.azurerm.tenant_id).toBe(p.subscription.tenantId);
  expect(config.provider.azurerm.resource_provider_registrations).toBe('none');
  expect(config.provider.azapi.subscription_id).toBe(p.subscription.id);
  expect(config.resource.azurerm_network_interface.node_1_nic_0.ip_forwarding_enabled).toBe(true);
  expect(config.output.ce_instances.value).toEqual({});
});

it('admits compute with exact image, ordered NICs, generated SSH key and restricted bootstrap input', async () => {
  const p = plan();
  const deployment = await azureTerraformFoundationDeployment(p, { '1': bootstrap });
  const config = JSON.parse(deployment.configuration);
  const vm = config.resource.azurerm_linux_virtual_machine.node_1;
  expect(vm.network_interface_ids).toEqual(
    [0, 1, 2].map((index) => `\${azurerm_network_interface.node_1_nic_${index}.id}`),
  );
  expect(vm.source_image_reference[0].version).toBe(p.image.version);
  expect(vm.plan[0]).toEqual({ name: p.image.plan, product: p.image.offer, publisher: p.image.publisher });
  expect(vm.os_disk[0].disk_size_gb).toBe(100);
  expect(vm.disable_password_authentication).toBe(true);
  expect(Buffer.from(vm.custom_data, 'base64').toString()).toBe(bootstrap);
  expect(config.resource.tls_private_key.node_1.algorithm).toBe('RSA');
  expect(JSON.stringify(config.output)).not.toMatch(/custom_data|private_key|fixture-material/);
  expect(deployment.providerLock).toContain('registry.terraform.io/hashicorp/azurerm');
  expect(deployment.providerLock).toContain('registry.terraform.io/hashicorp/tls');
  expect(deployment.providerLock).toContain('registry.terraform.io/azure/azapi');
  expect(deployment.backendIdentity).toBe(`local:${p.deploymentName}`);
});

it('preserves the exact provider identity when reopening the current private workspace', async () => {
  const p = plan();
  const rendered = JSON.parse(renderAzureTerraformFoundation(p));
  const current = JSON.parse((await azureTerraformCurrentDeployment(p)).configuration);
  expect(current.provider).toEqual(rendered.provider);
  expect(current.azapi).toBeUndefined();
});

it('accepts only the exact discovered Marketplace plan through the idempotent current agreement API', () => {
  const p = plan(false, false);
  const config = JSON.parse(renderAzureTerraformFoundation(p, { '1': bootstrap }));
  const resourceId = `/subscriptions/${p.subscription.id}/providers/Microsoft.MarketplaceOrdering/offerTypes/virtualmachine/publishers/${p.image.publisher}/offers/${p.image.offer}/plans/${p.image.plan}/agreements/current`;
  const agreementType = 'Microsoft.MarketplaceOrdering/offerTypes/publishers/offers/plans/agreements@2021-01-01';
  expect(config.data.azapi_resource.marketplace_terms).toEqual({
    type: agreementType,
    resource_id: resourceId,
    response_export_values: ['properties'],
  });
  const terms = config.resource.azapi_resource_action.marketplace_terms;
  const acceptanceBody =
    '$' +
    '{merge(data.azapi_resource.marketplace_terms.output, { properties = merge(data.azapi_resource.marketplace_terms.output.properties, { accepted = true }) })}';
  expect(terms).toMatchObject({
    type: agreementType,
    resource_id: resourceId,
    method: 'PUT',
    when: 'apply',
    body: acceptanceBody,
  });
  expect(terms.action).toBeUndefined();
  const precondition = terms.lifecycle.precondition[0];
  expect(precondition.error_message).toBe(
    'Live Azure Marketplace agreement differs from the immutable unaccepted plan',
  );
  for (const field of [
    'accepted',
    'publisher',
    'product',
    'plan',
    'licenseTextLink',
    'marketplaceTermsLink',
    'privacyPolicyLink',
    'signature',
  ])
    expect(precondition.condition).toContain(`.${field}`);
  for (const value of [p.image.publisher, p.image.offer, p.image.plan])
    expect(precondition.condition).toContain(JSON.stringify(value));
  expect(config.resource.azurerm_resource_group.ce.depends_on).toEqual(['azapi_resource_action.marketplace_terms']);
  expect(config.resource.azurerm_linux_virtual_machine.node_1.depends_on).toContain(
    'azapi_resource_action.marketplace_terms',
  );
  const ha = JSON.parse(
    renderAzureTerraformFoundation(plan(true, false), { '1': bootstrap, '2': bootstrap, '3': bootstrap }),
  );
  expect(
    Object.values(ha.resource.azurerm_linux_virtual_machine as Record<string, { depends_on?: string[] }>),
  ).toHaveLength(3);
  for (const vm of Object.values(
    ha.resource.azurerm_linux_virtual_machine as Record<string, { depends_on?: string[] }>,
  ))
    expect(vm.depends_on).toContain('azapi_resource_action.marketplace_terms');
  const accepted = JSON.parse(renderAzureTerraformFoundation(plan()));
  expect(accepted.data).toBeUndefined();
  expect(accepted.resource.azapi_resource_action).toBeUndefined();
  expect(accepted.resource.azurerm_resource_group.ce.depends_on).toBeUndefined();
});

it('renders an isolated private workload fixture for the exact Route Server advertised prefix', () => {
  const input = structuredClone(intent);
  input.engine = 'terraform';
  input.routing = { mode: 'route-server', destinationCidrs: ['10.253.0.0/24'], localAsn: 64512 };
  input.workloadFixture = { subnetName: 'workload', cidr: '10.253.0.0/24', privateIp: '10.253.0.4', port: 8080 };
  const observed = structuredClone(observation);
  observed.regions[0].quotaAvailable = 24;
  const fixturePlan = compileAzureCePlan(input, observed);
  expect(fixturePlan.billableResources).toContainEqual({ type: 'virtual-machine', count: 2 });
  expect(fixturePlan.billableResources).toContainEqual({ type: 'managed-disk', count: 2 });
  const config = JSON.parse(renderAzureTerraformFoundation(fixturePlan));
  const fixtureSubnet = config.resource.azurerm_subnet.workload;
  const fixtureNic = config.resource.azurerm_network_interface.workload;
  const fixtureVm = config.resource.azurerm_linux_virtual_machine.workload;
  expect(fixtureSubnet.address_prefixes).toEqual(['10.253.0.0/24']);
  expect(fixtureNic.ip_configuration[0]).toMatchObject({
    private_ip_address_allocation: 'Static',
    private_ip_address: '10.253.0.4',
  });
  expect(fixtureNic.public_ip_address_id).toBeUndefined();
  expect(fixtureVm.network_interface_ids).toEqual([`\${azurerm_network_interface.workload.id}`]);
  expect(Buffer.from(fixtureVm.custom_data, 'base64').toString()).toContain('http.server 8080');
});

it('admits an HA site cumulatively and reserves its dedicated Route Server subnet', () => {
  const p = plan(true);
  const network = JSON.parse(renderAzureTerraformFoundation(p));
  expect(network.resource.azurerm_route_server_bgp_connection).toBeUndefined();
  expect(network.output.ce_route_server_peers.value).toEqual({});
  const first = JSON.parse(renderAzureTerraformFoundation(p, { '1': bootstrap }));
  expect(Object.keys(first.resource.azurerm_linux_virtual_machine)).toEqual(['node_1']);
  expect(Object.keys(first.resource.azurerm_network_interface)).toHaveLength(9);
  expect(Object.keys(first.resource.azurerm_route_server_bgp_connection)).toEqual(['node_1']);
  expect(Object.keys(first.output.ce_route_server_peers.value)).toEqual(['1']);
  const config = JSON.parse(renderAzureTerraformFoundation(p, { '1': bootstrap, '2': bootstrap, '3': bootstrap }));
  expect(Object.keys(config.resource.azurerm_linux_virtual_machine)).toHaveLength(3);
  expect(Object.keys(config.resource.azurerm_network_interface)).toHaveLength(9);
  expect(
    Object.values(config.resource.azurerm_subnet as Record<string, { name?: string }>).some(
      (subnet) => subnet.name === 'RouteServerSubnet',
    ),
  ).toBe(true);
  expect(config.resource.azurerm_route_server.ce.subnet_id).toMatch(/azurerm_subnet/);
  expect(config.resource.azurerm_route_server.ce.branch_to_branch_traffic_enabled).toBe(false);
  expect(config.resource.azurerm_public_ip.route_server.sku).toBe('Standard');
  expect(Object.keys(config.resource.azurerm_route_server_bgp_connection)).toEqual(['node_1', 'node_2', 'node_3']);
  for (const peer of Object.values(
    config.resource.azurerm_route_server_bgp_connection as Record<string, { peer_asn?: unknown; peer_ip?: string }>,
  )) {
    expect(peer.peer_asn).toBe(p.routing.localAsn);
    expect(peer.peer_ip).toContain('_nic_0.private_ip_address');
    expect(peer.peer_ip).not.toContain('_nic_2.private_ip_address');
  }
  expect(config.output.ce_route_server.value.peer_ips).toContain('sort(tolist(');
  expect(Object.keys(config.output.ce_route_server_peers.value)).toEqual(['1', '2', '3']);
});

it('rejects tampered plans, foreign node admissions, and unresolved bootstrap before rendering', () => {
  const p = plan();
  expect(() => renderAzureTerraformFoundation(p, { '2': bootstrap })).toThrow(/admission/);
  const ha = plan(true);
  expect(() => renderAzureTerraformFoundation(ha, { '1': bootstrap, '3': bootstrap })).toThrow(/in order/);
  expect(() => renderAzureTerraformFoundation(p, { '1': `${bootstrap}__TOKEN__` })).toThrow(/cloud-init/);
  p.region = 'foreign';
  expect(() => renderAzureTerraformFoundation(p)).toThrow(/integrity/);
  expect(() => renderAzureTerraformFoundation(compileAzureCePlan(intent, observation))).toThrow(/Terraform/);
});
