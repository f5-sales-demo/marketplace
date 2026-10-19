import { fingerprint } from './discovery';
import type { GcpCeIntent } from './types';
import { validateIntent } from './validation';

export interface GcpNativeAction {
  id: string;
  kind: 'network' | 'subnetwork' | 'instance';
  argv: string[];
  dependencies: string[];
  sensitiveInput?: 'restricted-node-metadata-file';
}

function assertComputeOnly(intent: GcpCeIntent): void {
  if (
    intent.ingress.profile !== 'none' ||
    intent.routing.profile !== 'static-insertion' ||
    intent.routing.destinationCidrs.length !== 0
  )
    throw new Error('Compute translation cannot configure ingress or destination routes');
}

/** Candidate translation only. Execution requires immutable contract, approval and shared ledger. */
export function translateGcpNativeCompute(intent: GcpCeIntent) {
  validateIntent(intent);
  if (intent.engine !== 'native') throw new Error('Native translation requires native ownership');
  if (intent.operation !== 'deploy' || intent.egress.mode !== 'external-ip')
    throw new Error('Compute candidate supports external-IP deployment only');
  assertComputeOnly(intent);
  const actions: GcpNativeAction[] = [];
  const networks = new Map<string, { subnet: string; cidr: string }>();
  for (const site of intent.sites)
    for (const node of site.nodes)
      for (const nic of node.interfaces) {
        const prior = networks.get(nic.network);
        if (prior && (prior.subnet !== nic.subnet || prior.cidr !== nic.cidr))
          throw new Error('Shared network identity has conflicting subnet intent');
        networks.set(nic.network, { subnet: nic.subnet, cidr: nic.cidr });
      }
  const scope = `--project=${intent.project}`;
  for (const [network, subnet] of networks) {
    actions.push({
      id: `network-${network}`,
      kind: 'network',
      argv: [
        'compute',
        'networks',
        'create',
        network,
        scope,
        '--subnet-mode=custom',
        '--bgp-routing-mode=REGIONAL',
        '--quiet',
        '--format=json',
      ],
      dependencies: [],
    });
    actions.push({
      id: `subnetwork-${subnet.subnet}`,
      kind: 'subnetwork',
      argv: [
        'compute',
        'networks',
        'subnets',
        'create',
        subnet.subnet,
        scope,
        `--region=${intent.region}`,
        `--network=${network}`,
        `--range=${subnet.cidr}`,
        '--quiet',
        '--format=json',
      ],
      dependencies: [`network-${network}`],
    });
  }
  for (const site of intent.sites)
    for (const node of site.nodes) {
      const argv = [
        'compute',
        'instances',
        'create',
        node.name,
        scope,
        `--zone=${node.zone}`,
        `--machine-type=${intent.machineType}`,
        `--image=${intent.image.name}`,
        '--image-project=f5-7626-networks-public',
        `--boot-disk-size=${intent.diskGiB}GB`,
        '--boot-disk-type=pd-balanced',
        '--can-ip-forward',
        '--no-service-account',
        '--no-scopes',
        `--labels=xcsh-deployment=${intent.deploymentName},xcsh-engine=native,xcsh-site=${site.name},xcsh-node=${node.name}`,
      ];
      for (const nic of node.interfaces)
        argv.push(
          `--network-interface=network=${nic.network},subnet=${nic.subnet}${nic.index === 0 ? '' : ',no-address'}`,
        );
      argv.push('--metadata=VmDnsSetting=ZonePreferred', '--async', '--quiet', '--format=json');
      actions.push({
        id: `instance-${node.name}`,
        kind: 'instance',
        argv,
        dependencies: node.interfaces.map((nic) => `subnetwork-${nic.subnet}`),
        sensitiveInput: 'restricted-node-metadata-file',
      });
    }
  if (new Set(actions.map((a) => a.id)).size !== actions.length) throw new Error('GCP action identities collide');
  return { schemaVersion: 1, engine: 'native', executable: false, actions, sha256: fingerprint({ intent, actions }) };
}

/** Candidate Terraform configuration. Shared runner must own isolated state and exact saved plans. */
export function translateGcpTerraformCompute(intent: GcpCeIntent, googleProviderVersion: string) {
  validateIntent(intent);
  if (intent.engine !== 'terraform') throw new Error('Terraform translation requires Terraform ownership');
  if (!/^\d+\.\d+\.\d+$/.test(googleProviderVersion)) throw new Error('Exact Google provider version required');
  if (intent.operation !== 'deploy' || intent.egress.mode !== 'external-ip')
    throw new Error('Compute candidate supports external-IP deployment only');
  assertComputeOnly(intent);
  const networks: Record<string, unknown> = {},
    subnets: Record<string, unknown> = {},
    instances: Record<string, unknown> = {};
  const variable: Record<string, unknown> = {};
  for (const site of intent.sites)
    for (const node of site.nodes) {
      for (const nic of node.interfaces) {
        networks[nic.network.replaceAll('-', '_')] = {
          name: nic.network,
          project: intent.project,
          auto_create_subnetworks: false,
          routing_mode: 'REGIONAL',
        };
        const key = nic.subnet.replaceAll('-', '_');
        const subnet = {
          name: nic.subnet,
          project: intent.project,
          region: intent.region,
          ip_cidr_range: nic.cidr,
          network: `\${google_compute_network.${nic.network.replaceAll('-', '_')}.id}`,
        };
        if (subnets[key] && fingerprint(subnets[key]) !== fingerprint(subnet))
          throw new Error('Subnet identity has conflicting intent');
        subnets[key] = subnet;
      }
      const key = node.name.replaceAll('-', '_');
      variable[`${key}_user_data`] = {
        type: 'string',
        sensitive: true,
        description: 'Restricted node-bound one-use bootstrap; never export as an output',
      };
      instances[key] = {
        name: node.name,
        project: intent.project,
        zone: node.zone,
        machine_type: intent.machineType,
        can_ip_forward: true,
        boot_disk: [
          {
            auto_delete: true,
            initialize_params: [{ image: intent.image.selfLink, size: intent.diskGiB, type: 'pd-balanced' }],
          },
        ],
        network_interface: node.interfaces.map((nic) => ({
          network: `\${google_compute_network.${nic.network.replaceAll('-', '_')}.id}`,
          subnetwork: `\${google_compute_subnetwork.${nic.subnet.replaceAll('-', '_')}.id}`,
          ...(nic.index === 0 ? { access_config: [{}] } : {}),
        })),
        labels: {
          'xcsh-deployment': intent.deploymentName,
          'xcsh-engine': 'terraform',
          'xcsh-site': site.name,
          'xcsh-node': node.name,
        },
        metadata: { VmDnsSetting: 'ZonePreferred', 'user-data': `\${var.${key}_user_data}` },
      };
    }
  return {
    schemaVersion: 1,
    engine: 'terraform',
    executable: false,
    configuration: {
      terraform: {
        required_providers: { google: { source: 'hashicorp/google', version: `= ${googleProviderVersion}` } },
      },
      provider: { google: [{ project: intent.project, region: intent.region }] },
      variable,
      resource: {
        google_compute_network: networks,
        google_compute_subnetwork: subnets,
        google_compute_instance: instances,
      },
    },
  };
}

/** Qualification configuration: site-bound JWT remains in sensitive Terraform state, never in exported plans. */
export function translateGcpTerraformSiteCompute(
  intent: GcpCeIntent,
  versions: { google: string; xcsh: string; terraform: string },
) {
  for (const version of Object.values(versions))
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Exact Terraform/provider versions required');
  const cloud = translateGcpTerraformCompute(intent, versions.google);
  const sites: Record<string, unknown> = {};
  const tokens: Record<string, unknown> = {};
  const instances = cloud.configuration.resource.google_compute_instance as Record<string, Record<string, unknown>>;
  for (const site of intent.sites) {
    const siteKey = site.name.replaceAll('-', '_');
    sites[siteKey] = {
      name: site.name,
      namespace: 'system',
      labels: { 'xcsh-deployment': intent.deploymentName, 'xcsh-engine': 'terraform' },
      gcp: { not_managed: {} },
      ...(intent.initialVersions
        ? {
            software_settings: {
              sw: { volterra_software_version: intent.initialVersions.software },
              os: { operating_system_version: intent.initialVersions.os },
            },
          }
        : {}),
      ...(site.nodes.length === 3 ? { enable_ha: {} } : { disable_ha: {} }),
      disable_management_network: {},
      block_all_services: {},
      no_network_policy: {},
      no_forward_proxy: {},
      f5_proxy: {},
      no_proxy_bypass: {},
      logs_streaming_disabled: {},
      no_s2s_connectivity_sli: {},
      no_s2s_connectivity_slo: {},
      disable_url_categorization: {},
      local_vrf: { default_config: {}, default_sli_config: {} },
    };
    for (const node of site.nodes) {
      const key = node.name.replaceAll('-', '_');
      if (`${node.name}-token`.length > 63) throw new Error('Node name leaves no space for bound token name');
      tokens[key] = {
        name: `${node.name}-token`,
        namespace: 'system',
        type: 1,
        site_name: `\${xcsh_securemesh_site_v2.${siteKey}.name}`,
        labels: { 'xcsh-deployment': intent.deploymentName, 'xcsh-node': node.name, 'xcsh-engine': 'terraform' },
      };
      // Terraform marks token.content sensitive in the exact provider schema.
      // Deliberately do not create outputs or caller-supplied token variables.
      const userData = `#cloud-config\nwrite_files:\n  - path: /etc/vpm/user_data\n    permissions: "0600"\n    owner: root\n    content: |\n      token: \${xcsh_token.${key}.content}\n`;
      instances[key].metadata = {
        VmDnsSetting: 'ZonePreferred',
        'user-data': `\${sensitive(${JSON.stringify(userData)})}`,
      };
    }
  }
  return {
    schemaVersion: 1,
    engine: 'terraform',
    executable: false,
    configuration: {
      terraform: {
        required_version: `= ${versions.terraform}`,
        required_providers: {
          google: { source: 'hashicorp/google', version: `= ${versions.google}` },
          xcsh: { source: 'f5-sales-demo/xcsh', version: `= ${versions.xcsh}` },
        },
      },
      provider: { ...cloud.configuration.provider, xcsh: [{}] },
      resource: { ...cloud.configuration.resource, xcsh_securemesh_site_v2: sites, xcsh_token: tokens },
    },
  };
}

/** Public v2 configuration owns the disk even when VM creation never reaches state. */
export function translateGcpPublicTerraformSiteCompute(
  intent: GcpCeIntent,
  versions: { google: string; xcsh: string; terraform: string },
) {
  const translated = translateGcpTerraformSiteCompute(intent, versions);
  const disks: Record<
    string,
    { name: string; project: string; zone: string; image: string; size: number; type: string }
  > = {};
  for (const site of intent.sites)
    for (const node of site.nodes) {
      const key = node.name.replaceAll('-', '_');
      disks[key] = {
        name: node.name,
        project: intent.project,
        zone: node.zone,
        image: intent.image.selfLink,
        size: intent.diskGiB,
        type: 'pd-balanced',
      };
      const instance = translated.configuration.resource.google_compute_instance[key] as Record<string, unknown>;
      instance.boot_disk = [{ auto_delete: false, source: `\${google_compute_disk.${key}.self_link}` }];
    }
  const firewalls: Record<string, unknown> = {};
  for (const site of intent.sites.filter((site) => site.nodes.length === 3)) {
    const slo = site.nodes[0].interfaces[0];
    const name = `${site.name}-ha-slo-icmp`,
      tag = `${site.name}-ha-peer`;
    if (name.length > 63 || tag.length > 63) throw new Error('HA site name leaves no space for peer rule identity');
    firewalls[name.replaceAll('-', '_')] = {
      name,
      project: intent.project,
      network: `\${google_compute_network.${slo.network.replaceAll('-', '_')}.self_link}`,
      direction: 'INGRESS',
      source_ranges: [slo.cidr],
      target_tags: [tag],
      allow: [{ protocol: 'icmp' }],
    };
    for (const node of site.nodes) {
      const instance = translated.configuration.resource.google_compute_instance[
        node.name.replaceAll('-', '_')
      ] as Record<string, unknown>;
      instance.tags = [...new Set([...((instance.tags as string[]) ?? []), tag])];
      instance.depends_on = [`google_compute_firewall.${name.replaceAll('-', '_')}`];
    }
  }
  return {
    ...translated,
    schemaVersion: 2 as const,
    configuration: {
      ...translated.configuration,
      resource: {
        ...translated.configuration.resource,
        google_compute_disk: disks,
        ...(Object.keys(firewalls).length ? { google_compute_firewall: firewalls } : {}),
      },
    },
  };
}
