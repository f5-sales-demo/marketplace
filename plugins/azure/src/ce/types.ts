export const AZURE_CE_SCHEMA_VERSION = 1 as const;

export type AzureCeOperation =
  | 'deploy'
  | 'reconcile'
  | 'start'
  | 'stop'
  | 'resize'
  | 'update-network'
  | 'replace-node'
  | 'repair'
  | 'teardown';

export type AzureCeEgressMode = 'public-ip' | 'nat-gateway' | 'firewall' | 'proxy';
export type AzureCeRoutingMode = 'auto' | 'udr' | 'route-server';

export interface AzureCeSubnetIntent {
  mode: 'greenfield' | 'brownfield';
  name?: string;
  cidr?: string;
  resourceId?: string;
  vnetResourceId?: string;
}

export interface AzureCeNicIntent {
  name: string;
  role: 'slo' | 'sli' | 'management' | 'data' | 'cluster' | 'other';
  vrf?: string;
  subnet: AzureCeSubnetIntent;
}

export interface AzureCeSecurityRuleIntent {
  name: string;
  purpose: 'application-vip' | 'management' | 'intra-cluster' | 'platform-connectivity';
  direction: 'Inbound' | 'Outbound';
  protocol: 'Tcp' | 'Udp' | '*';
  sourceCidrs: string[];
  destinationCidrs: string[];
  destinationPorts: string[];
}

export interface AzureCeBrownfieldRouteChange {
  routeTableId: string;
  subnetId: string;
  routeName: string;
  destinationCidr: string;
}

export interface AzureCeIntent {
  schemaVersion: typeof AZURE_CE_SCHEMA_VERSION;
  operation: AzureCeOperation;
  subscriptionId: string;
  deploymentName: string;
  siteName: string;
  namespace: string;
  resourceGroup: string;
  region?: string;
  topology: { ha: boolean };
  nics: AzureCeNicIntent[];
  egress: { mode: AzureCeEgressMode; resourceId?: string };
  routing: { mode: AzureCeRoutingMode; destinationCidrs: string[]; localAsn?: number; peerAsn?: number };
  securityRules: AzureCeSecurityRuleIntent[];
  image: { publisher: string; offer: string; plan: string };
  vm: { size: string; zones?: string[] };
  brownfield: { resourceIds: string[]; routeChanges: AzureCeBrownfieldRouteChange[] };
  replacementNode?: number;
}

export interface AzureCeVmSizeObservation {
  name: string;
  maxNics: number;
  vCpus: number;
  memoryGb: number;
  zones: string[];
  restricted: boolean;
}

export interface AzureCeRegionObservation {
  name: string;
  rank: number;
  eligible: boolean;
  reasons: string[];
  zones: string[];
  routeServerSupported: boolean;
  quotaAvailable: number;
  policyAllowed: boolean;
  vmSizes: AzureCeVmSizeObservation[];
  proximity?: number;
}

export interface AzureCeResourceObservation {
  id: string;
  location?: string;
  exists: boolean;
  etag?: string;
  owned: boolean;
  tags: Record<string, string>;
  state: Record<string, unknown>;
}

export interface AzureCeObservation {
  schemaVersion: typeof AZURE_CE_SCHEMA_VERSION;
  subscription: { id: string; tenantId: string; cloud: string };
  image: {
    publisher: string;
    offer: string;
    plan: string;
    version: string;
    urn: string;
    termsAccepted: boolean;
  };
  regions: AzureCeRegionObservation[];
  resources: AzureCeResourceObservation[];
  research: {
    method: 'azure-cli-live';
    officialSourceRetrieval: 'live';
    catalogRegion: string;
    commands: string[];
    officialSources: string[];
  };
}

export type AzureCeActionKind =
  | 'marketplace-terms-accept'
  | 'resource-group-create'
  | 'vnet-create'
  | 'subnet-create'
  | 'nsg-create'
  | 'nsg-rule-create'
  | 'public-ip-create'
  | 'nic-create'
  | 'nic-update'
  | 'vm-create'
  | 'vm-start'
  | 'vm-stop'
  | 'vm-deallocate'
  | 'vm-resize'
  | 'vm-delete'
  | 'route-table-create'
  | 'route-create'
  | 'route-association-update'
  | 'route-server-create'
  | 'route-server-peer-create'
  | 'resource-delete'
  | 'brownfield-restore'
  | 'health-gate'
  | 'bgp-gate'
  | 'traffic-gate';

export interface AzureCeAction {
  id: string;
  phase: 'terms' | 'prerequisites' | 'nodes' | 'registration' | 'routing' | 'verify' | 'teardown';
  kind: AzureCeActionKind;
  description: string;
  command?: 'az';
  args?: string[];
  node?: number;
  resourceId?: string;
  mutates: boolean;
  destructive: boolean;
  requiresBootstrap?: boolean;
}

export interface AzureCePlanDraft {
  schemaVersion: typeof AZURE_CE_SCHEMA_VERSION;
  intent: AzureCeIntent;
  subscription: AzureCeObservation['subscription'];
  deploymentName: string;
  siteName: string;
  namespace: string;
  region: string;
  topology: { ha: boolean; nodeCount: 1 | 3; zones: string[] };
  nics: Array<AzureCeNicIntent & { index: number }>;
  egress: AzureCeIntent['egress'];
  routing: { mode: Exclude<AzureCeRoutingMode, 'auto'>; destinationCidrs: string[]; localAsn: number; peerAsn: number };
  securityRules: AzureCeSecurityRuleIntent[];
  image: AzureCeObservation['image'];
  vm: AzureCeIntent['vm'];
  warnings: string[];
  billableResources: Array<{ type: string; count: number }>;
  actions: AzureCeAction[];
  rollback: {
    brownfieldRoutes: Array<{
      routeTableId: string;
      subnetId: string;
      routeName: string;
      before: Record<string, unknown>;
      beforeSubnet: Record<string, unknown>;
    }>;
  };
  observationFingerprint: string;
  ownershipInventory: Array<{
    resourceId: string;
    owned: boolean;
    action: 'create' | 'reference' | 'modify-approved' | 'delete';
  }>;
  ownershipTagTemplate: {
    'xcsh-managed-by': 'azure-ce';
    'xcsh-deployment-id': string;
    'xcsh-plan-sha256': '__PLAN_SHA256__';
  };
}

export interface AzureCePlan extends AzureCePlanDraft {
  planId: string;
  planSha256: string;
}

export interface AzureCeCheckpoint {
  schemaVersion: typeof AZURE_CE_SCHEMA_VERSION;
  planId: string;
  planSha256: string;
  completedActionIds: string[];
  failedActionId?: string;
  observationFingerprint?: string;
  state: 'running' | 'partial' | 'complete';
}
