import { readFile } from 'node:fs/promises';
import type { Deployment } from '../../../terraform/src/runner';
import { verifyAzureCePlan } from './artifacts';
import type { AzureCePlan } from './types';

export const AZURE_CE_TERRAFORM_VERSION = '1.16.1';
export const AZURE_CE_TERRAFORM_PROVIDER_VERSION = '5.4.0';
export const AZURE_CE_TLS_PROVIDER_VERSION = '4.4.0';
type Json = Record<string, unknown>;
const ref = (address: string) => `\${${address}}`;
const literal = (value: string) => value.replaceAll('${', '$${').replaceAll('%{', '%%{');

/** Greenfield network/compute stage. Registration, discovered interfaces and routing follow separately.
 * Defaults are explicit: 100 GB managed OS disk, RSA SSH keys retained only in state,
 * no password login, dynamic NIC addresses, forwarding enabled, public SLO egress.
 */
export function renderAzureTerraformFoundation(
  plan: AzureCePlan,
  bootstrapByNode: Record<string, string> = {},
): string {
  verifyAzureCePlan(plan);
  if (plan.engine !== 'terraform' || plan.intent.operation !== 'deploy')
    throw new Error('Azure Terraform foundation requires a Terraform deployment plan');
  const allowedTrafficSource =
    plan.intent.ingress?.mode === 'platform-http'
      ? plan.intent.ingress.probe.sourceVmResourceId.toLowerCase()
      : undefined;
  if (
    plan.nics.some((nic) => nic.subnet.mode !== 'greenfield') ||
    plan.intent.brownfield.resourceIds.some((id) => id.toLowerCase() !== allowedTrafficSource) ||
    plan.egress.mode !== 'public-ip'
  )
    throw new Error('Azure Terraform foundation requires greenfield networking and public-ip egress');
  if (plan.subscription.cloud !== 'AzureCloud')
    throw new Error('Azure Terraform foundation cloud environment requires explicit translation');
  if (!plan.image.termsAccepted) throw new Error('Azure Marketplace terms remain unaccepted');
  if (!plan.actions.some((action) => action.kind === 'resource-group-create'))
    throw new Error('Azure Terraform foundation requires a newly planned resource group');
  const admitted = Object.keys(bootstrapByNode);
  if (admitted.some((node) => !/^[1-3]$/.test(node) || Number(node) > plan.topology.nodeCount))
    throw new Error('Invalid Azure Terraform node admission');
  if (admitted.some((node, index) => Number(node) !== index + 1))
    throw new Error('Azure Terraform nodes must be admitted in order');
  const resource: Record<string, Record<string, Json>> = {};
  const add = (type: string, name: string, value: Json) => {
    resource[type] ??= {};
    resource[type][name] = value;
  };
  const tags = (node?: number, index?: number) => ({
    'xcsh-managed-by': 'azure-ce',
    'xcsh-execution-engine': 'terraform',
    'xcsh-deployment-id': plan.deploymentName,
    'xcsh-plan-sha256': plan.planSha256,
    'ves-io-site-name': plan.siteName,
    ...(node ? { 'xcsh-node-index': String(node) } : {}),
    ...(index !== undefined ? { 'xcsh-interface-index': String(index) } : {}),
  });
  add('azurerm_resource_group', 'ce', {
    name: literal(plan.intent.resourceGroup),
    location: plan.region,
    tags: tags(),
  });
  const group = ref('azurerm_resource_group.ce.name');
  const subnets = plan.actions.filter((action) => action.kind === 'subnet-create');
  const subnetRefs = new Map<string, string>();
  const prefixes: string[] = [];
  for (const [index, action] of subnets.entries()) {
    const arg = (flag: string) =>
      action.args?.includes(flag) ? action.args[action.args.indexOf(flag) + 1] : undefined;
    const name = arg('--name');
    const cidr = arg('--address-prefixes');
    if (!name || !cidr || subnetRefs.has(name)) throw new Error('Planned Azure subnet translation is incomplete');
    const key = `subnet_${index}`;
    add('azurerm_subnet', key, {
      name: literal(name),
      resource_group_name: group,
      virtual_network_name: ref('azurerm_virtual_network.ce.name'),
      address_prefixes: [cidr],
    });
    subnetRefs.set(name, ref(`azurerm_subnet.${key}.id`));
    prefixes.push(cidr);
  }
  if (plan.nics.some((nic) => !subnetRefs.has(nic.subnet.name ?? '')))
    throw new Error('Planned Azure NIC subnet is unavailable');
  add('azurerm_virtual_network', 'ce', {
    name: literal(`${plan.deploymentName}-vnet`),
    resource_group_name: group,
    location: plan.region,
    address_space: [...new Set(prefixes)].sort(),
    tags: tags(),
  });
  if (plan.routing.mode === 'route-server') {
    const routeServerSubnet = subnetRefs.get('RouteServerSubnet');
    if (
      !routeServerSubnet ||
      !Number.isInteger(plan.routing.localAsn) ||
      (plan.routing.localAsn ?? 0) < 1 ||
      (plan.routing.localAsn ?? 0) > 65534
    )
      throw new Error('Planned Route Server subnet or CE ASN translation is incomplete');
    add('azurerm_public_ip', 'route_server', {
      name: literal(`${plan.deploymentName}-rs-pip`),
      resource_group_name: group,
      location: plan.region,
      allocation_method: 'Static',
      sku: 'Standard',
      tags: tags(),
    });
    add('azurerm_route_server', 'ce', {
      name: literal(`${plan.deploymentName}-rs`),
      resource_group_name: group,
      location: plan.region,
      sku: 'Standard',
      public_ip_address_id: ref('azurerm_public_ip.route_server.id'),
      subnet_id: routeServerSubnet,
      branch_to_branch_traffic_enabled: false,
      tags: tags(),
    });
  }
  if (plan.securityRules.length) {
    add('azurerm_network_security_group', 'ce', {
      name: literal(`${plan.deploymentName}-nsg`),
      resource_group_name: group,
      location: plan.region,
      tags: tags(),
    });
    for (const [index, rule] of plan.securityRules.entries())
      add('azurerm_network_security_rule', `rule_${index}`, {
        name: literal(rule.name),
        resource_group_name: group,
        network_security_group_name: ref('azurerm_network_security_group.ce.name'),
        priority: 100 + index,
        direction: rule.direction,
        access: 'Allow',
        protocol: rule.protocol,
        source_port_range: '*',
        source_address_prefixes: rule.sourceCidrs,
        destination_address_prefixes: rule.destinationCidrs,
        ...(rule.destinationPorts.length === 1
          ? { destination_port_range: rule.destinationPorts[0] }
          : { destination_port_ranges: rule.destinationPorts }),
      });
  }
  const interfaceOutputs: Json = {};
  const instanceOutputs: Json = {};
  for (let node = 1; node <= plan.topology.nodeCount; node++) {
    const nodeName = `${plan.deploymentName}-${node}`;
    const zone = plan.topology.zones[node - 1] ?? plan.topology.zones[0];
    add('azurerm_public_ip', `node_${node}`, {
      name: literal(`${nodeName}-pip`),
      resource_group_name: group,
      location: plan.region,
      allocation_method: 'Static',
      sku: 'Standard',
      ...(zone ? { zones: [zone] } : {}),
      tags: tags(node),
    });
    for (const nic of plan.nics) {
      const key = `node_${node}_nic_${nic.index}`;
      const subnet = subnetRefs.get(nic.subnet.name ?? '');
      add('azurerm_network_interface', key, {
        name: literal(`${nodeName}-nic${nic.index}`),
        resource_group_name: group,
        location: plan.region,
        ip_forwarding_enabled: true,
        accelerated_networking_enabled: false,
        ip_configuration: [
          {
            name: 'primary',
            primary: true,
            subnet_id: subnet,
            private_ip_address_allocation: 'Dynamic',
            ...(nic.index === 0 ? { public_ip_address_id: ref(`azurerm_public_ip.node_${node}.id`) } : {}),
          },
        ],
        tags: tags(node, nic.index),
      });
      if (plan.securityRules.length)
        add('azurerm_network_interface_security_group_association', key, {
          network_interface_id: ref(`azurerm_network_interface.${key}.id`),
          network_security_group_id: ref('azurerm_network_security_group.ce.id'),
        });
      interfaceOutputs[`${node}:${nic.index}`] = {
        id: ref(`azurerm_network_interface.${key}.id`),
        subnet_id: subnet,
        site_name: plan.siteName,
        node,
        index: nic.index,
        role: nic.role,
      };
    }
    if (!admitted.includes(String(node))) continue;
    if (plan.routing.mode === 'route-server') {
      const slo = plan.nics.find((nic) => nic.role === 'slo');
      if (!slo) throw new Error('Route Server peering requires the explicit SLO interface');
      add('azurerm_route_server_bgp_connection', `node_${node}`, {
        name: literal(nodeName),
        route_server_id: ref('azurerm_route_server.ce.id'),
        peer_asn: plan.routing.localAsn as number,
        peer_ip: ref(`azurerm_network_interface.node_${node}_nic_${slo.index}.private_ip_address`),
      });
    }
    const bootstrap = bootstrapByNode[String(node)];
    if (
      !bootstrap.startsWith('#cloud-config') ||
      !bootstrap.includes('/etc/vpm/user_data') ||
      /__\w+__/.test(bootstrap)
    )
      throw new Error('Azure Terraform admission requires resolved platform cloud-init');
    add('tls_private_key', `node_${node}`, { algorithm: 'RSA', rsa_bits: 4096 });
    add('azurerm_linux_virtual_machine', `node_${node}`, {
      name: literal(nodeName),
      computer_name: literal(nodeName),
      location: plan.region,
      resource_group_name: group,
      size: plan.vm.size,
      ...(zone ? { zone } : {}),
      admin_username: 'azureuser',
      disable_password_authentication: true,
      admin_ssh_key: [{ username: 'azureuser', public_key: ref(`tls_private_key.node_${node}.public_key_openssh`) }],
      network_interface_ids: plan.nics.map((nic) => ref(`azurerm_network_interface.node_${node}_nic_${nic.index}.id`)),
      source_image_reference: [
        { publisher: plan.image.publisher, offer: plan.image.offer, sku: plan.image.plan, version: plan.image.version },
      ],
      plan: [{ name: plan.image.plan, product: plan.image.offer, publisher: plan.image.publisher }],
      os_disk: [
        {
          name: literal(`${nodeName}-osdisk`),
          caching: 'ReadWrite',
          storage_account_type: 'StandardSSD_LRS',
          disk_size_gb: 100,
        },
      ],
      boot_diagnostics: [{}],
      custom_data: Buffer.from(bootstrap).toString('base64'),
      tags: tags(node),
      ...(plan.securityRules.length
        ? {
            depends_on: [
              ...plan.nics.map(
                (nic) => `azurerm_network_interface_security_group_association.node_${node}_nic_${nic.index}`,
              ),
              ...plan.securityRules.map((_, index) => `azurerm_network_security_rule.rule_${index}`),
            ],
          }
        : {}),
    });
    instanceOutputs[String(node)] = {
      id: ref(`azurerm_linux_virtual_machine.node_${node}.id`),
      vm_id: ref(`azurerm_linux_virtual_machine.node_${node}.virtual_machine_id`),
      site_name: plan.siteName,
      hostname: nodeName,
    };
  }
  return JSON.stringify({
    terraform: {
      required_version: `= ${AZURE_CE_TERRAFORM_VERSION}`,
      required_providers: {
        azurerm: { source: 'hashicorp/azurerm', version: `= ${AZURE_CE_TERRAFORM_PROVIDER_VERSION}` },
        tls: { source: 'hashicorp/tls', version: `= ${AZURE_CE_TLS_PROVIDER_VERSION}` },
      },
    },
    provider: {
      azurerm: {
        features: [{}],
        subscription_id: plan.subscription.id,
        tenant_id: plan.subscription.tenantId,
        environment: 'public',
        resource_provider_registrations: 'none',
      },
    },
    resource,
    output: {
      ce_interfaces: { value: interfaceOutputs },
      ce_instances: { value: instanceOutputs },
      ce_vnet_id: { value: ref('azurerm_virtual_network.ce.id') },
      ...(plan.routing.mode === 'route-server'
        ? {
            ce_route_server: {
              value: {
                id: ref('azurerm_route_server.ce.id'),
                asn: ref('azurerm_route_server.ce.virtual_router_asn'),
                peer_ips: ref('sort(tolist(azurerm_route_server.ce.virtual_router_ips))'),
              },
            },
            ce_route_server_peers: {
              value: Object.fromEntries(
                admitted.map((node) => [
                  node,
                  {
                    id: ref(`azurerm_route_server_bgp_connection.node_${node}.id`),
                    peer_ip: ref(
                      `azurerm_network_interface.node_${node}_nic_${plan.nics.find((nic) => nic.role === 'slo')?.index}.private_ip_address`,
                    ),
                    peer_asn: plan.routing.localAsn as number,
                  },
                ]),
              ),
            },
          }
        : {}),
    },
  });
}

/** Sensitive configuration and generated keys remain in deployment-specific Terraform storage. */
export async function azureTerraformFoundationDeployment(
  plan: AzureCePlan,
  bootstrapByNode: Record<string, string> = {},
): Promise<Deployment> {
  const configuration = renderAzureTerraformFoundation(plan, bootstrapByNode);
  const providerLock = await readFile(new URL('../../terraform/provider-lock.hcl', import.meta.url), 'utf8');
  return {
    schemaVersion: 1,
    deploymentId: plan.deploymentName,
    engine: 'terraform',
    scope: { cloud: 'azure', account: plan.subscription.id, region: plan.region },
    terraformVersion: AZURE_CE_TERRAFORM_VERSION,
    configuration,
    providerLock,
    backendIdentity: `local:${plan.deploymentName}`,
  };
}

/** Resume the private foundation workspace without reconstructing its secret-bearing configuration. */
export async function azureTerraformCurrentDeployment(plan: AzureCePlan): Promise<Deployment> {
  verifyAzureCePlan(plan);
  if (plan.engine !== 'terraform') throw new Error('Azure Terraform workspace requires Terraform ownership');
  const providerLock = await readFile(new URL('../../terraform/provider-lock.hcl', import.meta.url), 'utf8');
  return {
    schemaVersion: 1,
    deploymentId: plan.deploymentName,
    engine: 'terraform',
    scope: { cloud: 'azure', account: plan.subscription.id, region: plan.region },
    terraformVersion: AZURE_CE_TERRAFORM_VERSION,
    configuration: JSON.stringify({
      terraform: {
        required_version: `= ${AZURE_CE_TERRAFORM_VERSION}`,
        required_providers: {
          azurerm: { source: 'hashicorp/azurerm', version: `= ${AZURE_CE_TERRAFORM_PROVIDER_VERSION}` },
          tls: { source: 'hashicorp/tls', version: `= ${AZURE_CE_TLS_PROVIDER_VERSION}` },
        },
      },
      provider: {
        azurerm: {
          features: [{}],
          subscription_id: plan.subscription.id,
          tenant_id: plan.subscription.tenantId,
          environment: 'public',
          resource_provider_registrations: 'none',
        },
      },
    }),
    providerLock,
    backendIdentity: `local:${plan.deploymentName}`,
  };
}
