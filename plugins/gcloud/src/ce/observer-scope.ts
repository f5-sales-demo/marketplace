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

export function assertGcpTerraformObserverScope(scope: GcpTerraformObserverScope, intent: GcpCeIntent) {
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
  assertGcpSiteAccessProfile(intent);
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

/** Exact independently owned identities; none is a CE node or a separate network. */
export function gcpTerraformObserverIdentity(intent: GcpCeIntent) {
  if (intent.schemaVersion !== 2 || !intent.observer) throw new Error('Versioned observer intent required');
  assertGcpTerraformObserverScope(intent.observer, intent);
  const name = `${intent.deploymentName}-observer`,
    firewallName = `${name}-ssh`;
  if (firewallName.length > 63 || intent.sites[0].nodes.some((node) => node.name === name))
    throw new Error('Derived observer identities collide or exceed GCP name limits');
  const sli = intent.sites[0].nodes[0].interfaces[1];
  return {
    name,
    key: name.replaceAll('-', '_'),
    firewallName,
    firewallKey: firewallName.replaceAll('-', '_'),
    zone: intent.sites[0].nodes[0].zone,
    network: sli.network,
    subnet: sli.subnet,
  };
}
