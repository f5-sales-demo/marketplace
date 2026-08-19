export const AWS_CE_SCHEMA_VERSION = 1 as const;
export const AWS_CE_SHARED_CONTRACT_URL =
  'https://f5-sales-demo.github.io/mcn/_llms-txt/en/customer-edge/automation-contract.txt' as const;
export const AWS_CE_F5_GUIDE_URL =
  'https://docs.cloud.f5.com/docs-v2/multi-cloud-network-connect/how-to/site-management/deploy-sms-aws-clickops' as const;
export const AWS_CE_MARKETPLACE_PRODUCT_ID = 'prod-wrwzhcymymama' as const;
export const AWS_CE_SSM_PARAMETER = `/aws/service/marketplace/${AWS_CE_MARKETPLACE_PRODUCT_ID}/latest` as const;
// The Marketplace image currently advertises a 79 GiB root volume. 80 GiB is
// enough to boot but not enough headroom for a CE software upgrade, so every
// generated launch must reserve this larger root volume up front.
export const AWS_CE_MIN_UPGRADE_SAFE_ROOT_VOLUME_GIB = 100 as const;

export type AwsCeOperation =
  | 'deploy'
  | 'reconcile'
  | 'start'
  | 'stop'
  | 'resize'
  | 'update-network'
  | 'replace-node'
  | 'repair'
  | 'teardown';
export type AwsCeEgressMode = 'elastic-ip' | 'nat-gateway' | 'firewall' | 'proxy';
export type AwsCeRoutingProfile = 'direct-eni' | 'nlb-ingress' | 'tgw-static' | 'tgw-connect';

export interface AwsCeF5Capabilities {
  smsv2ContractVersion: 'v2';
  supportedProviders: Array<'aws' | 'azure'>;
  bootstrapDrivers: Array<'console'>;
  providerNetworkingProfiles: Partial<Record<'aws' | 'azure', string[]>>;
  awsSmsv2TgwConnect: { supported: boolean; schemaVersion: string | null };
}

export interface AwsCeInterfaceIntent {
  index: number;
  role: 'slo' | 'sli' | 'management' | 'service' | 'workload';
  vrf: string;
  subnets: Array<{ availabilityZone: string; subnetId?: string; cidr?: string }>;
  addressing: { mode: 'dhcp' | 'static'; addresses?: string[] };
}

export interface AwsCeIntent {
  schemaVersion: typeof AWS_CE_SCHEMA_VERSION;
  operation: AwsCeOperation;
  accountId: string;
  partition: 'aws' | 'aws-us-gov' | 'aws-cn';
  region: string;
  deploymentName: string;
  siteName: string;
  namespace: string;
  topology: { nodeCount: 1 | 3 };
  vpc: { mode: 'greenfield' | 'brownfield'; vpcId?: string; cidr?: string };
  interfaces: AwsCeInterfaceIntent[];
  egress: { mode: AwsCeEgressMode; resourceId?: string };
  routing: {
    profile: AwsCeRoutingProfile;
    destinationCidrs: string[];
    transitGatewayId?: string;
    transportAttachmentId?: string;
    transitGatewayRouteTableId?: string;
    customerAsn?: number;
    transitGatewayAsn?: number;
    insideCidrs?: string[];
    associations: string[];
    propagations: string[];
  };
  image: { productId: typeof AWS_CE_MARKETPLACE_PRODUCT_ID; amiId: string };
  instance: { type: string; diskGiB: number; instanceProfileArn?: string };
  securityGroups: Array<{
    name: string;
    ingress: Array<{ protocol: string; fromPort?: number; toPort?: number; cidrs: string[] }>;
    egress: Array<{ protocol: string; fromPort?: number; toPort?: number; cidrs: string[] }>;
  }>;
  routes: Array<{ routeTableId: string; destinationCidr: string }>;
  brownfield: {
    resourceIds: string[];
    routeTableIds: string[];
    transitGatewayRouteTableIds: string[];
  };
  replacementNode?: number;
}

export interface AwsCeSourceReceipt {
  url: string;
  normalizedSha256: string;
}

export interface AwsCeRegionObservation {
  name: string;
  optInStatus: string;
  enabled: boolean;
  rank: number;
  eligible: boolean;
  reasons: string[];
  ami?: {
    id: string;
    ssmParameter: typeof AWS_CE_SSM_PARAMETER;
    ssmVersion: number;
    ownerAlias: string;
    ownerId: string;
    productCodes: string[];
    architecture: string;
    creationDate: string;
    deprecationTime?: string;
    state: string;
    rootDeviceName: string;
    rootVolumeGiB: number;
    launchPermission: boolean;
    allowedByPolicy: boolean;
  };
  instanceTypes: Array<{
    name: string;
    vCpus: number;
    memoryMiB: number;
    maxEnis: number;
    ipv4PerEni: number;
    availabilityZones: string[];
    supported: boolean;
    reasons: string[];
  }>;
  vcpuQuota: number;
  networkQuotas: Array<{ serviceCode: string; quotaCode: string; quotaName: string; value: number }>;
  transitGatewaySupported: boolean;
  brownfieldProximity: number;
}

export interface AwsCeResourceObservation {
  id: string;
  region: string;
  exists: boolean;
  owned: boolean;
  tags: Record<string, string>;
  state: Record<string, unknown>;
}

export interface AwsCeObservation {
  schemaVersion: typeof AWS_CE_SCHEMA_VERSION;
  identity: { accountId: string; partition: AwsCeIntent['partition']; arn: string };
  agreement: { productId: typeof AWS_CE_MARKETPLACE_PRODUCT_ID; active: boolean; agreementIds: string[] };
  regions: AwsCeRegionObservation[];
  resources: AwsCeResourceObservation[];
  ownershipPlanSha256s: string[];
  f5Capabilities: AwsCeF5Capabilities;
  f5CapabilitiesSha256: string;
  research: {
    method: 'aws-cli-live';
    officialSourceRetrieval: 'live';
    commands: string[];
    officialSources: string[];
    sourceReceipts: AwsCeSourceReceipt[];
    sharedContract: {
      url: typeof AWS_CE_SHARED_CONTRACT_URL;
      contractId: 'f5xc-ce-automation';
      contractVersion: 'v1';
      normalizedSha256: string;
    };
    f5AwsGuide: { url: typeof AWS_CE_F5_GUIDE_URL; normalizedSha256: string; tgwConnectDocumented: boolean };
  };
}

export type AwsCeActionKind =
  | 'vpc-create'
  | 'subnet-create'
  | 'security-group-create'
  | 'security-group-rule-create'
  | 'eni-create'
  | 'elastic-ip-allocate'
  | 'elastic-ip-associate'
  | 'elastic-ip-disassociate'
  | 'instance-run'
  | 'instance-start'
  | 'instance-stop'
  | 'instance-resize'
  | 'instance-terminate'
  | 'source-destination-check-disable'
  | 'route-create'
  | 'route-replace'
  | 'nlb-create'
  | 'nlb-target-group-create'
  | 'nlb-listener-create'
  | 'nlb-register-targets'
  | 'nlb-cross-zone-enable'
  | 'tgw-vpc-attachment-create'
  | 'tgw-appliance-mode-enable'
  | 'tgw-route-table-create'
  | 'tgw-associate'
  | 'tgw-propagate'
  | 'tgw-route-create'
  | 'tgw-connect-attachment-create'
  | 'tgw-connect-peer-create'
  | 'registration-gate'
  | 'health-gate'
  | 'bgp-gate'
  | 'nlb-gate'
  | 'tgw-route-gate'
  | 'traffic-gate'
  | 'brownfield-restore'
  | 'resource-delete';

export interface AwsCeAction {
  id: string;
  phase: 'network' | 'nodes' | 'registration' | 'routing' | 'verify' | 'teardown';
  kind: AwsCeActionKind;
  description: string;
  command?: 'aws';
  args?: string[];
  node?: number;
  resourceId?: string;
  mutates: boolean;
  destructive: boolean;
  requiresBootstrap?: boolean;
  capture?: { placeholder: string; path: string };
  captures?: Array<{ placeholder: string; path: string }>;
}

export interface AwsCePlanDraft {
  schemaVersion: typeof AWS_CE_SCHEMA_VERSION;
  intent: AwsCeIntent;
  accountId: string;
  partition: AwsCeIntent['partition'];
  region: string;
  deploymentName: string;
  siteName: string;
  namespace: string;
  topology: { nodeCount: 1 | 3; availabilityZones: string[] };
  interfaces: AwsCeInterfaceIntent[];
  image: NonNullable<AwsCeRegionObservation['ami']>;
  instance: AwsCeIntent['instance'];
  egress: AwsCeIntent['egress'];
  routing: AwsCeIntent['routing'];
  securityGroups: AwsCeIntent['securityGroups'];
  warnings: string[];
  billableResources: Array<{ type: string; count: number }>;
  actions: AwsCeAction[];
  rollback: {
    resources: Array<{ id: string; before: Record<string, unknown> }>;
  };
  ownershipInventory: Array<{
    resourceId: string;
    owned: boolean;
    action: 'create' | 'reference' | 'modify-approved' | 'delete';
  }>;
  ownershipTags: {
    'xcsh-managed-by': 'aws-ce';
    'xcsh-deployment-id': string;
    'xcsh-plan-sha256': '__PLAN_SHA256__';
    'ves-io-site-name': string;
  };
  observationFingerprint: string;
  f5CapabilitiesSha256: string;
}

export interface AwsCePlan extends AwsCePlanDraft {
  planId: string;
  planSha256: string;
}

export interface AwsCeCheckpoint {
  schemaVersion: typeof AWS_CE_SCHEMA_VERSION;
  planId: string;
  planSha256: string;
  completedActionIds: string[];
  observationFingerprint?: string;
  ownedStateFingerprint?: string;
  failedActionId?: string;
  resolvedValues: Record<string, string>;
  state: 'running' | 'partial' | 'complete';
}
