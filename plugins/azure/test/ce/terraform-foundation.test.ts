import { expect, it } from 'bun:test';
import { compileAzureCePlan } from '../../src/ce/planner';
import { azureTerraformFoundationDeployment, renderAzureTerraformFoundation } from '../../src/ce/terraform-foundation';
import { intent, observation } from './fixtures';

function plan(ha = false) {
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
  expect(deployment.backendIdentity).toBe(`local:${p.deploymentName}`);
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
  expect(Object.values(config.resource.azurerm_subnet).some((subnet: any) => subnet.name === 'RouteServerSubnet')).toBe(
    true,
  );
  expect(config.resource.azurerm_route_server.ce.subnet_id).toMatch(/azurerm_subnet/);
  expect(config.resource.azurerm_route_server.ce.branch_to_branch_traffic_enabled).toBe(false);
  expect(config.resource.azurerm_public_ip.route_server.sku).toBe('Standard');
  expect(Object.keys(config.resource.azurerm_route_server_bgp_connection)).toEqual(['node_1', 'node_2', 'node_3']);
  for (const peer of Object.values(config.resource.azurerm_route_server_bgp_connection) as Array<any>) {
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
  expect(() => renderAzureTerraformFoundation(p, { '1': bootstrap + '__TOKEN__' })).toThrow(/cloud-init/);
  p.region = 'foreign';
  expect(() => renderAzureTerraformFoundation(p)).toThrow(/integrity/);
  expect(() => renderAzureTerraformFoundation(compileAzureCePlan(intent, observation))).toThrow(/Terraform/);
});
