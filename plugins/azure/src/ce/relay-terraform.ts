import { renderAzureRelayCloudInit } from './relay-cloud-init';
import { type AzureRelayPlan, azureRelayOwnershipTags, verifyAzureRelayPlan } from './relay-plan';
import type { AzureCePlan } from './types';

type Json = Record<string, unknown>;
const ref = (value: string) => '${' + value + '}';
const literal = (value: string) => value.replaceAll('${', '$${').replaceAll('%{', '%%{');

/** Add two relay VMs and peers to the owning foundation; CE registration and joined guest activation follow separately. */
export function renderAzureRelayTerraformResources(
  source: AzureCePlan,
  plan: AzureRelayPlan,
  sloSubnetReference: string,
) {
  verifyAzureRelayPlan(source, plan);
  if (plan.engine !== 'terraform' || source.subscription.cloud !== 'AzureCloud')
    throw Error('Azure relay Terraform: Terraform AzureCloud owner required');
  if (!/^\$\{azurerm_subnet\.subnet_\d+\.id\}$/.test(sloSubnetReference))
    throw Error('Azure relay Terraform: owning foundation subnet reference required');
  const resource: Record<string, Record<string, Json>> = {};
  const outputs: Json = {};
  const add = (type: string, key: string, value: Json) => {
    resource[type] ??= {};
    resource[type][key] = value;
  };
  const tags = azureRelayOwnershipTags(source, plan);
  for (const [index, relay] of plan.relays.entries()) {
    const name = `relay_${index + 1}`;
    add('tls_private_key', name, { algorithm: 'RSA', rsa_bits: 4096 });
    if (relay.publicIpId)
      add('azurerm_public_ip', name, {
        name: literal(`${relay.name}-pip`),
        location: plan.region,
        resource_group_name: ref('azurerm_resource_group.ce.name'),
        allocation_method: 'Static',
        sku: 'Standard',
        tags,
      });
    add('azurerm_network_interface', name, {
      name: literal(`${relay.name}-nic`),
      location: plan.region,
      resource_group_name: ref('azurerm_resource_group.ce.name'),
      ip_forwarding_enabled: true,
      accelerated_networking_enabled: false,
      ip_configuration: [
        {
          name: 'ipconfig1',
          primary: true,
          subnet_id: sloSubnetReference,
          private_ip_address_allocation: 'Static',
          private_ip_address: relay.privateAddress,
          ...(relay.publicIpId ? { public_ip_address_id: ref(`azurerm_public_ip.${name}.id`) } : {}),
        },
      ],
      tags,
    });
    const customData = renderAzureRelayCloudInit(source, plan, relay.name);
    if (Buffer.byteLength(customData) > 65535) throw Error('Azure relay Terraform: custom data exceeds Azure limit');
    add('azurerm_linux_virtual_machine', name, {
      name: literal(relay.name),
      computer_name: literal(relay.name),
      location: plan.region,
      resource_group_name: ref('azurerm_resource_group.ce.name'),
      size: plan.vmSize,
      admin_username: 'xcsh',
      disable_password_authentication: true,
      admin_ssh_key: [{ username: 'xcsh', public_key: ref(`tls_private_key.${name}.public_key_openssh`) }],
      network_interface_ids: [ref(`azurerm_network_interface.${name}.id`)],
      source_image_reference: [
        {
          publisher: plan.hostImage.publisher,
          offer: plan.hostImage.offer,
          sku: plan.hostImage.sku,
          version: plan.hostImage.version,
        },
      ],
      os_disk: [{ name: literal(relay.osDiskName), caching: 'ReadWrite', storage_account_type: 'StandardSSD_LRS' }],
      custom_data: Buffer.from(customData).toString('base64'),
      tags,
    });
    add('azurerm_route_server_bgp_connection', name, {
      name: literal(relay.name),
      route_server_id: ref('azurerm_route_server.ce.id'),
      peer_asn: relay.asn,
      peer_ip: relay.privateAddress,
      depends_on: [`azurerm_linux_virtual_machine.${name}`],
    });
    outputs[name] = {
      id: ref(`azurerm_linux_virtual_machine.${name}.id`),
      nic_id: ref(`azurerm_network_interface.${name}.id`),
      os_disk_id: relay.osDiskId,
      peer_id: ref(`azurerm_route_server_bgp_connection.${name}.id`),
      private_address: relay.privateAddress,
      asn: relay.asn,
    };
  }
  return { resource, output: { ce_relay_instances: { value: outputs } } };
}
