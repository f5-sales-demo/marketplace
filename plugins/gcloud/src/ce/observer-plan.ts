import { translateGcpPublicTerraformSiteCompute } from './compute-plan';
import { fingerprint } from './discovery';
import type { GcpTerraformRequestReason } from './request-reason';
import { assertGcpSiteAccessProfile, validateGcpSiteAccess } from './site-access';
import type { GcpCeIntent } from './types';

/** Candidate scope only. Key freshness, original image reads and trust need independent live evidence. */
export interface GcpTerraformObserverScope {
  schemaVersion: 1;
  profile: 'original-ha-observer';
  publicKey: string;
  sshSourceCidr: string;
}

export const GCP_TERRAFORM_OBSERVER_IMAGE = Object.freeze({
  project: 'ubuntu-os-cloud',
  name: 'ubuntu-2404-noble-amd64-v20261021',
  id: '4996011480491275419',
});

function assertScope(scope: GcpTerraformObserverScope, intent: GcpCeIntent) {
  if (
    !scope ||
    typeof scope !== 'object' ||
    Array.isArray(scope) ||
    Object.keys(scope).sort().join(',') !== 'profile,publicKey,schemaVersion,sshSourceCidr' ||
    scope.schemaVersion !== 1 ||
    scope.profile !== 'original-ha-observer'
  )
    throw new Error('Exact versioned original observer scope required');
  validateGcpSiteAccess({ schemaVersion: 1, profile: 'site-ssh-sli', publicKey: scope.publicKey });
  if (!intent.initialAccess || intent.initialAccess.publicKey === scope.publicKey)
    throw new Error('Distinct observer and CE campaign public keys required');
  if (typeof scope.sshSourceCidr !== 'string') throw new Error('One exact observer SSH source required');
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/32$/.exec(scope.sshSourceCidr);
  if (
    !match ||
    match[0] !== scope.sshSourceCidr ||
    match.slice(1).some((part) => Number(part) > 255 || String(Number(part)) !== part) ||
    [0, 127].includes(Number(match[1])) ||
    Number(match[1]) >= 224 ||
    (Number(match[1]) === 169 && Number(match[2]) === 254)
  )
    throw new Error('Observer SSH requires one canonical unicast IPv4 /32 source');
}

/** Separate version preserves historical 18-resource plans and their stored teardown receipts. */
export function translateGcpTerraformObserverSiteCompute(
  intent: GcpCeIntent,
  versions: { google: string; xcsh: string; terraform: string },
  observer: GcpTerraformObserverScope,
  requestReason?: GcpTerraformRequestReason,
) {
  assertGcpSiteAccessProfile(intent);
  assertScope(observer, intent);
  if (fingerprint(versions) !== fingerprint({ terraform: '1.17.2', google: '8.11.0', xcsh: '15.15.7' }))
    throw new Error('Qualified exact observer Terraform/provider tuple required');
  const base = translateGcpPublicTerraformSiteCompute(intent, versions, requestReason);
  const site = intent.sites[0];
  const sli = site.nodes[0].interfaces[1];
  if (site.nodes.some((node) => fingerprint(node.interfaces[1]) !== fingerprint(sli)))
    throw new Error('Original HA observer requires one shared SLI network and subnet');
  const name = `${intent.deploymentName}-observer`;
  const firewallName = `${name}-ssh`;
  if (firewallName.length > 63 || site.nodes.some((node) => node.name === name))
    throw new Error('Derived observer identities collide or exceed GCP name limits');
  const key = name.replaceAll('-', '_');
  const firewallKey = firewallName.replaceAll('-', '_');
  const resources: Record<string, Record<string, Record<string, unknown>>> = {};
  for (const [type, entries] of Object.entries(base.configuration.resource)) {
    resources[type] = {};
    for (const [id, value] of Object.entries(entries)) {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Original CE resource object required');
      resources[type][id] = Object.fromEntries(Object.entries(value));
    }
  }
  const ce = Object.entries(resources)
    .flatMap(([type, entries]) => Object.keys(entries).map((id) => `${type}.${id}`))
    .sort();
  const addresses = [
    `google_compute_disk.${key}`,
    `google_compute_firewall.${firewallKey}`,
    `google_compute_instance.${key}`,
  ];
  if (ce.length !== 18 || addresses.some((address) => ce.includes(address)))
    throw new Error('Exact original 18-resource CE inventory required before adding observer');
  const labels = { 'xcsh-deployment': intent.deploymentName, 'xcsh-engine': 'terraform', 'xcsh-role': 'observer' };
  const resource: typeof resources = {
    ...resources,
    google_compute_disk: {
      ...resources.google_compute_disk,
      [key]: {
        name,
        project: intent.project,
        zone: site.nodes[0].zone,
        size: 20,
        type: 'pd-balanced',
        labels,
        image: `\${data.google_compute_image.${key}.self_link}`,
        lifecycle: {
          precondition: [
            {
              condition: `\${data.google_compute_image.${key}.image_id == "${GCP_TERRAFORM_OBSERVER_IMAGE.id}" && data.google_compute_image.${key}.status == "READY"}`,
              error_message: 'Original pinned Ubuntu observer image identity required',
            },
          ],
        },
      },
    },
    google_compute_firewall: {
      ...resources.google_compute_firewall,
      [firewallKey]: {
        name: firewallName,
        project: intent.project,
        network: `\${google_compute_network.${sli.network.replaceAll('-', '_')}.self_link}`,
        direction: 'INGRESS',
        source_ranges: [observer.sshSourceCidr],
        target_tags: [name],
        allow: [{ protocol: 'tcp', ports: ['22'] }],
      },
    },
    google_compute_instance: {
      ...resources.google_compute_instance,
      [key]: {
        name,
        project: intent.project,
        zone: site.nodes[0].zone,
        machine_type: 'e2-micro',
        can_ip_forward: false,
        deletion_protection: false,
        boot_disk: [{ auto_delete: false, source: `\${google_compute_disk.${key}.self_link}` }],
        network_interface: [
          {
            network: `\${google_compute_network.${sli.network.replaceAll('-', '_')}.self_link}`,
            subnetwork: `\${google_compute_subnetwork.${sli.subnet.replaceAll('-', '_')}.self_link}`,
            access_config: [{}],
          },
        ],
        metadata: {
          'ssh-keys': `ubuntu:${observer.publicKey}`,
          'block-project-ssh-keys': 'TRUE',
          'enable-oslogin': 'FALSE',
        },
        labels,
        tags: [name],
        depends_on: [`google_compute_firewall.${firewallKey}`],
      },
    },
  };
  return {
    ...base,
    schemaVersion: 3 as const,
    inventory: { ce, observer: addresses, all: [...ce, ...addresses].sort() },
    observerScopeFingerprint: fingerprint({ observer, image: GCP_TERRAFORM_OBSERVER_IMAGE }),
    configuration: {
      ...base.configuration,
      data: {
        google_compute_image: {
          [key]: {
            project: GCP_TERRAFORM_OBSERVER_IMAGE.project,
            name: GCP_TERRAFORM_OBSERVER_IMAGE.name,
          },
        },
      },
      resource,
    },
  };
}
