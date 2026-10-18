export const GCP_CE_SCHEMA_VERSION = 1 as const;
export const GCP_CE_POLICY = 'f5xc-ce-automation-policy/v2' as const;
export const GCP_CE_IMAGE_PROJECT = 'f5-7626-networks-public' as const;
export type GcpCeEngine = 'native' | 'terraform';
export const GCP_CE_OPERATIONS = [
  'deploy',
  'reconcile',
  'start',
  'stop',
  'resize',
  'update-network',
  'replace-node',
  'repair',
  'upgrade',
  'failover',
  'teardown',
] as const;
export type GcpCeOperation = (typeof GCP_CE_OPERATIONS)[number];
export interface GcpCeInterface {
  index: number;
  role: 'slo' | 'sli' | 'management';
  vrf: string;
  network: string;
  subnet: string;
  cidr: string;
}
export interface GcpCeIntent {
  schemaVersion: 1;
  project: string;
  region: string;
  deploymentName: string;
  platformContext: string;
  engine: GcpCeEngine;
  operation: GcpCeOperation;
  sites: Array<{
    name: string;
    nodes: Array<{ name: string; zone: string; interfaces: GcpCeInterface[] }>;
  }>;
  machineType: string;
  diskGiB: number;
  image: GcpCeImage;
  initialVersions?: { software: string; os: string };
  ipForwarding: true;
  egress: { mode: 'external-ip' | 'cloud-nat' | 'firewall' | 'proxy'; resource?: string };
  ingress: { profile: 'none' | 'internal-passthrough-lb' };
  routing: { profile: 'static-insertion' | 'ilb-next-hop' | 'ncc-router-appliance'; destinationCidrs: string[] };
}
export interface GcpCeImage {
  id: string;
  name: string;
  selfLink: string;
  licenses: string[];
  architecture: string;
  status: string;
}
export interface GcpCeReceipt {
  source: 'gcloud';
  argv: string[];
  observedAt: string;
  sha256: string;
}
export interface GcpCeDiscovery {
  schemaVersion: 1;
  project: string;
  region: string;
  observedAt: string;
  receipts: GcpCeReceipt[];
  images: GcpCeImage[];
  machineTypes: Array<{ name: string; zone: string; guestCpus: number; memoryMb: number }>;
  billingEnabled: boolean | null;
  enabledApis: string[];
  quotas: Array<{ metric: string; limit: number; usage: number }>;
  checks: Record<'iam' | 'organizationPolicy' | 'zoneCapacity' | 'machineNicLimit' | 'licenseAcceptance', 'unknown'>;
}
export interface GcpCePlan {
  preflight?: import('./preflight').GcpLaunchPreflight;
  policyReceipt?: { identity: string; url: string; observedAt: string; normalizedSha256: string };
  apiRelease: { repository: string; tag: string; contractDigest: string };
  schemaVersion: 1;
  policyIdentity: typeof GCP_CE_POLICY;
  engine: GcpCeEngine;
  intent: GcpCeIntent;
  discoveryFingerprint: string;
  planHash: string;
  executable: false;
  unavailable: string[];
  actions: [];
  approval: 'not-requested';
}
export interface GcpCeEvidence {
  schemaVersion: 1;
  project: string;
  deploymentName: string;
  engine: GcpCeEngine;
  observedAt: string;
  cloudProvisioning: 'observed' | 'unknown';
  registration: 'unknown';
  physicalInterfaceIdentity: 'unknown';
  platformHealth: 'unknown';
  routing: 'unknown';
  applicationTraffic: 'unknown';
}
