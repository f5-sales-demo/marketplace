import { fingerprint } from './discovery';
import type { GcpCeIntent } from './types';

/** Opt-in Site setting; never a VM metadata key or a guest shell account. */
export interface GcpSiteAccess {
  schemaVersion: 1;
  profile: 'site-ssh-sli';
  publicKey: string;
}

export const GCP_SITE_ACCESS_MAPPING = Object.freeze({
  schemaVersion: 1,
  provider: 'f5-sales-demo/xcsh',
  version: '15.13.0',
  credentials: 'admin_user_credentials.ssh_key',
  blockedServices: 'blocked_services.blocked_service',
  sshNetwork: 'VIRTUAL_NETWORK_SITE_LOCAL_INSIDE',
  user: 'admin',
} as const);

/** Published provider schema compatibility; positive SSH and live capture remain separate gates. */
export const GCP_CURRENT_SITE_ACCESS_MAPPING = Object.freeze({
  ...GCP_SITE_ACCESS_MAPPING,
  version: '15.15.7',
  sourceSchemaSha256: 'f5f3daf876eb3489054cab23d68af266265ec7b1b6ec84d52117283ae70ed6e6',
} as const);

/** Independently captured published schema; authenticated guest access remains unqualified. */
export const GCP_XCSH15162_SITE_ACCESS_MAPPING = Object.freeze({
  ...GCP_SITE_ACCESS_MAPPING,
  version: '15.16.2',
  sourceSchemaSha256: 'b09164cac44b715bf40fb5d26afc65b02c6d181cfb516ae54cf5b3e6c647af25',
} as const);

export function resolveGcpSiteAccessMapping(providerVersion: string) {
  if (providerVersion === GCP_SITE_ACCESS_MAPPING.version) return GCP_SITE_ACCESS_MAPPING;
  if (providerVersion === GCP_CURRENT_SITE_ACCESS_MAPPING.version) return GCP_CURRENT_SITE_ACCESS_MAPPING;
  if (providerVersion === GCP_XCSH15162_SITE_ACCESS_MAPPING.version) return GCP_XCSH15162_SITE_ACCESS_MAPPING;
  throw new GcpSiteAccessMappingUnavailable();
}

export class GcpSiteAccessMappingUnavailable extends Error {
  constructor() {
    super(
      'Site SSH requires the two-interface external-IP Terraform HA profile and published XC 15.13.0, 15.15.7 or 15.16.2 mapping',
    );
  }
}

export function validateGcpSiteAccess(value: unknown): asserts value is GcpSiteAccess {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Site SSH access object required');
  const access = value as GcpSiteAccess;
  if (
    Object.keys(value).sort().join(',') !== 'profile,publicKey,schemaVersion' ||
    access.schemaVersion !== 1 ||
    access.profile !== 'site-ssh-sli' ||
    typeof access.publicKey !== 'string' ||
    access.publicKey.length > 8192
  )
    throw new Error('Site SSH access requires the versioned SLI-only public-key profile');
  const match = /^ssh-ed25519 ([A-Za-z0-9+/]+={0,2})$/.exec(access.publicKey);
  if (!match) throw new Error('Site SSH requires one Ed25519 public key without options or comments');
  const bytes = Buffer.from(match[1], 'base64');
  if (
    bytes.length !== 51 ||
    bytes.toString('base64') !== match[1] ||
    bytes.readUInt32BE(0) !== 11 ||
    !bytes.subarray(4, 15).equals(Buffer.from('ssh-ed25519')) ||
    bytes.readUInt32BE(15) !== 32
  )
    throw new Error('Site SSH public key wire format differs');
}

/** The current cloud firewall/ownership mapping is the two-NIC Terraform HA profile. */
export function assertGcpSiteAccessProfile(intent: GcpCeIntent) {
  if (intent.initialAccess === undefined) return;
  validateGcpSiteAccess(intent.initialAccess);
  if (
    intent.engine !== 'terraform' ||
    intent.sites.length !== 1 ||
    intent.sites[0].nodes.length !== 3 ||
    intent.sites[0].nodes.some(
      (node) => node.interfaces.length !== 2 || node.interfaces[0].role !== 'slo' || node.interfaces[1].role !== 'sli',
    ) ||
    intent.egress.mode !== 'external-ip' ||
    intent.ingress.profile !== 'none' ||
    intent.routing.profile !== 'static-insertion' ||
    intent.routing.destinationCidrs.length !== 0
  )
    throw new GcpSiteAccessMappingUnavailable();
}

/** Translation is a candidate configuration, not evidence of authenticated guest access. */
export function gcpSiteAccessSpec(intent: GcpCeIntent, providerVersion: string) {
  if (intent.initialAccess === undefined) return undefined;
  assertGcpSiteAccessProfile(intent);
  resolveGcpSiteAccessMapping(providerVersion);
  return {
    admin_user_credentials: { ssh_key: intent.initialAccess.publicKey },
    blocked_services: {
      blocked_service: [
        { network_type: 'VIRTUAL_NETWORK_SITE_LOCAL', ssh: {} },
        ...['VIRTUAL_NETWORK_SITE_LOCAL', 'VIRTUAL_NETWORK_SITE_LOCAL_INSIDE'].flatMap((network_type) => [
          { network_type, dns: {} },
          { network_type, web_user_interface: {} },
        ]),
      ],
    },
  };
}

export function gcpSiteAccessFingerprint(
  intent: GcpCeIntent,
  providerVersion: string = GCP_SITE_ACCESS_MAPPING.version,
) {
  if (intent.initialAccess === undefined) return undefined;
  validateGcpSiteAccess(intent.initialAccess);
  return fingerprint({ mapping: resolveGcpSiteAccessMapping(providerVersion), access: intent.initialAccess });
}
