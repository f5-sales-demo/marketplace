import { readFile } from 'node:fs/promises';
import type { Deployment } from '../../../terraform/src/runner';
import { verifyAwsCePlan } from './artifacts';
import { siteForNode, siteTopology } from './topology';
import type { AwsCePlan } from './types';

export const AWS_CE_TERRAFORM_VERSION = '1.16.1';
export const AWS_CE_TERRAFORM_PROVIDER_VERSION = '6.63.0';
type Json = Record<string, unknown>;
const ref = (address: string) => `\${${address}}`;
const literal = (value: string) => value.replaceAll('${', '$${').replaceAll('%{', '%%{');

/** Network/compute stage; XC registration and routing are subsequent lifecycle stages. */
export function renderAwsTerraformFoundation(plan: AwsCePlan, bootstrapByNode: Record<string, string> = {}): string {
  verifyAwsCePlan(plan);
  if (plan.engine !== 'terraform' || plan.intent.operation !== 'deploy')
    throw new Error('Terraform foundation requires a Terraform deployment plan');
  const intent = plan.intent;
  if (intent.vpc.mode !== 'greenfield' || intent.egress.mode !== 'elastic-ip')
    throw new Error('Terraform foundation currently requires greenfield VPC and Elastic IP egress');
  if (intent.interfaces.some((item) => item.addressing.mode !== 'dhcp'))
    throw new Error('Terraform foundation static addressing requires explicit translation');
  const keys = Object.keys(bootstrapByNode);
  if (keys.some((key) => !/^[1-3]$/.test(key) || Number(key) > intent.topology.nodeCount))
    throw new Error('Invalid Terraform node admission');
  const admitted = keys.map(Number);
  for (const site of siteTopology(intent)) {
    const count = site.nodeIndexes.filter((node) => admitted.includes(node)).length;
    if (count !== 0 && count !== site.nodeIndexes.length) throw new Error('HA site nodes must be admitted together');
  }
  const resource: Record<string, Record<string, Json>> = {};
  const add = (type: string, name: string, value: Json) => {
    resource[type] ??= {};
    resource[type][name] = value;
  };
  const tags = (node?: number, index?: number) => ({
    'xcsh-managed-by': 'aws-ce',
    'xcsh-execution-engine': 'terraform',
    'xcsh-deployment-id': intent.deploymentName,
    'xcsh-plan-sha256': plan.planSha256,
    'ves-io-site-name': node ? siteForNode(intent, node).name : intent.siteName,
    ...(node ? { 'xcsh-node-index': String(node) } : {}),
    ...(index !== undefined ? { 'xcsh-interface-index': String(index) } : {}),
  });
  add('aws_vpc', 'ce', {
    cidr_block: intent.vpc.cidr,
    enable_dns_support: true,
    enable_dns_hostnames: true,
    tags: tags(),
  });
  add('aws_internet_gateway', 'ce', { vpc_id: ref('aws_vpc.ce.id'), tags: tags() });
  add('aws_route_table', 'slo', { vpc_id: ref('aws_vpc.ce.id'), tags: tags() });
  add('aws_route', 'internet', {
    route_table_id: ref('aws_route_table.slo.id'),
    destination_cidr_block: '0.0.0.0/0',
    gateway_id: ref('aws_internet_gateway.ce.id'),
  });
  for (const [index, group] of intent.securityGroups.entries()) {
    const rules = (direction: 'ingress' | 'egress') =>
      group[direction].map((rule) => ({
        protocol: rule.protocol,
        from_port: rule.fromPort ?? 0,
        to_port: rule.toPort ?? 0,
        cidr_blocks: rule.cidrs,
        ipv6_cidr_blocks: [],
        prefix_list_ids: [],
        security_groups: [],
        self: false,
        description: '',
      }));
    add('aws_security_group', `group_${index}`, {
      name: literal(`${intent.deploymentName}-${group.name}`),
      description: 'Customer Edge deployment security group',
      vpc_id: ref('aws_vpc.ce.id'),
      ingress: rules('ingress'),
      egress: rules('egress'),
      tags: tags(),
    });
  }
  const interfaceOutputs: Json = {};
  const instanceOutputs: Json = {};
  for (let node = 1; node <= intent.topology.nodeCount; node++) {
    for (const item of intent.interfaces) {
      const name = `node_${node}_nic_${item.index}`;
      const subnet = item.subnets[node - 1];
      if (!subnet?.cidr) throw new Error('Terraform foundation subnet CIDR is missing');
      add('aws_subnet', name, {
        vpc_id: ref('aws_vpc.ce.id'),
        availability_zone: subnet.availabilityZone,
        cidr_block: subnet.cidr,
        tags: tags(node, item.index),
      });
      add('aws_network_interface', name, {
        subnet_id: ref(`aws_subnet.${name}.id`),
        security_groups: intent.securityGroups.map((_, index) => ref(`aws_security_group.group_${index}.id`)),
        source_dest_check: false,
        tags: tags(node, item.index),
      });
      if (item.index === 0)
        add('aws_route_table_association', name, {
          subnet_id: ref(`aws_subnet.${name}.id`),
          route_table_id: ref('aws_route_table.slo.id'),
        });
      interfaceOutputs[`${node}:${item.index}`] = {
        id: ref(`aws_network_interface.${name}.id`),
        subnet_id: ref(`aws_subnet.${name}.id`),
        mac: ref(`aws_network_interface.${name}.mac_address`),
        private_ip: ref(`aws_network_interface.${name}.private_ip`),
        site_name: siteForNode(intent, node).name,
        node,
        index: item.index,
        role: item.role,
      };
    }
    add('aws_eip', `node_${node}`, { domain: 'vpc', tags: tags(node) });
    if (!admitted.includes(node)) continue;
    const bootstrap = bootstrapByNode[String(node)];
    if (
      !bootstrap.startsWith('#cloud-config') ||
      !bootstrap.includes('/etc/vpm/user_data') ||
      /__\w+__/.test(bootstrap)
    )
      throw new Error('Terraform node admission requires resolved platform cloud-init');
    add('aws_instance', `node_${node}`, {
      ami: intent.image.amiId,
      instance_type: intent.instance.type,
      user_data_base64: Buffer.from(bootstrap).toString('base64'),
      user_data_replace_on_change: true,
      ...(intent.instance.instanceProfileArn
        ? { iam_instance_profile: intent.instance.instanceProfileArn.split('/').at(-1) }
        : {}),
      network_interface: intent.interfaces.map((item) => ({
        device_index: item.index,
        network_interface_id: ref(`aws_network_interface.node_${node}_nic_${item.index}.id`),
        delete_on_termination: false,
      })),
      root_block_device: [
        { volume_size: intent.instance.diskGiB, volume_type: 'gp3', delete_on_termination: true, encrypted: true },
      ],
      tags: tags(node),
      volume_tags: tags(node),
      depends_on: ['aws_route.internet', `aws_route_table_association.node_${node}_nic_0`],
    });
    add('aws_eip_association', `node_${node}`, {
      allocation_id: ref(`aws_eip.node_${node}.id`),
      network_interface_id: ref(`aws_network_interface.node_${node}_nic_0.id`),
      depends_on: [`aws_instance.node_${node}`],
    });
    instanceOutputs[String(node)] = {
      id: ref(`aws_instance.node_${node}.id`),
      site_name: siteForNode(intent, node).name,
      hostname: `${intent.deploymentName}-${node}`,
    };
  }
  return JSON.stringify({
    terraform: {
      required_version: `= ${AWS_CE_TERRAFORM_VERSION}`,
      required_providers: { aws: { source: 'hashicorp/aws', version: `= ${AWS_CE_TERRAFORM_PROVIDER_VERSION}` } },
    },
    provider: {
      aws: {
        region: intent.region,
        allowed_account_ids: [intent.accountId],
        ...(intent.awsProfile ? { profile: literal(intent.awsProfile) } : {}),
      },
    },
    resource,
    output: {
      ce_vpc_id: { value: ref('aws_vpc.ce.id') },
      ce_interfaces: { value: interfaceOutputs },
      ce_instances: { value: instanceOutputs },
    },
  });
}

/** Package input for the owning Terraform service; bootstrap stays in restricted runner storage. */
export async function awsTerraformFoundationDeployment(
  plan: AwsCePlan,
  bootstrapByNode: Record<string, string> = {},
): Promise<Deployment> {
  const configuration = renderAwsTerraformFoundation(plan, bootstrapByNode);
  const providerLock = await readFile(new URL('../../terraform/provider-lock.hcl', import.meta.url), 'utf8');
  return {
    schemaVersion: 1,
    deploymentId: plan.intent.deploymentName,
    engine: 'terraform',
    scope: { cloud: 'aws', account: plan.intent.accountId, region: plan.intent.region },
    terraformVersion: AWS_CE_TERRAFORM_VERSION,
    configuration,
    providerLock,
    backendIdentity: `local:${plan.intent.deploymentName}`,
  };
}
