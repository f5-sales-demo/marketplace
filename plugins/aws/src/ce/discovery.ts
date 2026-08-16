import type { AwsExecApi } from '../aws/exec';
import { canonicalSha256, normalizeResearchDocument, sha256Hex } from './canonical';
import type {
  AwsCeEgressMode,
  AwsCeF5Capabilities,
  AwsCeObservation,
  AwsCeRegionObservation,
  AwsCeResourceObservation,
  AwsCeRoutingProfile,
} from './types';
import {
  AWS_CE_F5_GUIDE_URL,
  AWS_CE_MARKETPLACE_PRODUCT_ID,
  AWS_CE_SCHEMA_VERSION,
  AWS_CE_SHARED_CONTRACT_URL,
  AWS_CE_SSM_PARAMETER,
} from './types';

export interface AwsComputeDiscoveryInput {
  accountId: string;
  partition: 'aws' | 'aws-us-gov' | 'aws-cn';
  deploymentName: string;
  requiredEnis: number;
  nodeCount: 1 | 3;
  instanceTypes?: string[];
  brownfieldResourceIds: string[];
  observedOwnedResourceIds?: string[];
  ownedPlanSha256s?: string[];
  resourceRegion?: string;
  egressMode?: AwsCeEgressMode;
  routingProfile?: AwsCeRoutingProfile;
  f5Capabilities: AwsCeF5Capabilities;
}

const AWS_SOURCES = [
  'https://docs.aws.amazon.com/accounts/latest/reference/manage-acct-regions.html',
  'https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-store-public-parameters.html',
  'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/allowed-amis.html',
  'https://docs.aws.amazon.com/marketplace/latest/userguide/programmatically-accessing-agreement-details.html',
  'https://docs.aws.amazon.com/vpc/latest/tgw/tgw-connect.html',
] as const;
const ACCOUNT = /^\d{12}$/;
const SAFE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$/;
const INSTANCE_TYPE = /^[a-z0-9][a-z0-9.-]{1,40}$/;
const REGION = /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/;
const RESOURCE_ID =
  /^(?:arn:(?:aws|aws-us-gov|aws-cn):[a-z0-9-]+:[a-z0-9-]*:\d{12}:[A-Za-z0-9_+=,.@:/-]+|(?:i|vpc|subnet|rtb|tgw|tgw-attach|tgw-connect-peer|tgw-rtb|eni|sg|eipalloc|eipassoc|nat|vpce)-[0-9a-f]{8,21})$/;
// F5 documents m5.2xlarge as the minimum AWS CE size, but AWS exposes only
// four ENIs on the 2xlarge variants. Include the corresponding 4xlarge sizes
// so default discovery can satisfy the documented eight-interface CE shape.
const DEFAULT_INSTANCE_TYPES = [
  'm5.2xlarge',
  'm5.4xlarge',
  'm6i.2xlarge',
  'm6i.4xlarge',
  'm7i.2xlarge',
  'm7i.4xlarge',
] as const;

async function json<T>(api: AwsExecApi, args: string[]): Promise<T> {
  const result = await api.exec('aws', [...args, '--output', 'json']);
  if (result.exitCode !== 0) throw new Error(`AWS discovery command failed: aws ${args.join(' ')}: ${result.stderr}`);
  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    throw new Error(`AWS discovery returned invalid JSON for: aws ${args.join(' ')}`);
  }
}

async function mapLimit<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const result = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        result[index] = await task(items[index]);
      }
    }),
  );
  return result;
}

function validateCapabilities(value: AwsCeF5Capabilities): void {
  if (
    value?.smsv2ContractVersion !== 'v2' ||
    !value.supportedProviders?.includes('aws') ||
    !value.bootstrapDrivers?.includes('api') ||
    !Array.isArray(value.providerNetworkingProfiles?.aws) ||
    typeof value.awsSmsv2TgwConnect?.supported !== 'boolean' ||
    (value.awsSmsv2TgwConnect.supported && !value.awsSmsv2TgwConnect.schemaVersion) ||
    (!value.awsSmsv2TgwConnect.supported && value.awsSmsv2TgwConnect.schemaVersion !== null)
  )
    throw new Error('F5 platform capabilities do not advertise the required AWS Secure Mesh Site v2 contract');
}

function regionMatchesPartition(region: string, partition: AwsComputeDiscoveryInput['partition']): boolean {
  if (partition === 'aws-us-gov') return region.startsWith('us-gov-');
  if (partition === 'aws-cn') return region.startsWith('cn-');
  return !region.startsWith('us-gov-') && !region.startsWith('cn-');
}

function validateInput(input: AwsComputeDiscoveryInput): string[] {
  if (!ACCOUNT.test(input.accountId)) throw new Error('accountId must be a 12-digit AWS account ID');
  if (!['aws', 'aws-us-gov', 'aws-cn'].includes(input.partition)) throw new Error('Unsupported AWS partition');
  if (!SAFE_NAME.test(input.deploymentName)) throw new Error('deploymentName contains unsupported characters');
  if (!Number.isInteger(input.requiredEnis) || input.requiredEnis < 1 || input.requiredEnis > 8)
    throw new Error('requiredEnis must be between 1 and 8');
  if (input.nodeCount !== 1 && input.nodeCount !== 3) throw new Error('nodeCount must be one or three');
  if (input.egressMode && !['elastic-ip', 'nat-gateway', 'firewall', 'proxy'].includes(input.egressMode))
    throw new Error('egressMode is invalid');
  if (
    input.routingProfile &&
    !['direct-eni', 'nlb-ingress', 'tgw-static', 'tgw-connect'].includes(input.routingProfile)
  )
    throw new Error('routingProfile is invalid');
  const instanceTypes = [...new Set(input.instanceTypes?.length ? input.instanceTypes : DEFAULT_INSTANCE_TYPES)].sort();
  if (instanceTypes.some((name) => !INSTANCE_TYPE.test(name)))
    throw new Error('instanceTypes contains an invalid value');
  for (const id of [...input.brownfieldResourceIds, ...(input.observedOwnedResourceIds ?? [])]) {
    if (!RESOURCE_ID.test(id)) throw new Error(`Invalid AWS brownfield resource ID: ${id}`);
    if (id.startsWith('arn:')) {
      const [, partition, , region, accountId] = id.split(':');
      if (
        partition !== input.partition ||
        accountId !== input.accountId ||
        (input.resourceRegion && region && region !== input.resourceRegion)
      )
        throw new Error(`AWS resource ARN is outside the requested partition, account, or region: ${id}`);
    }
  }
  const ownedPlanSha256s = [...new Set(input.ownedPlanSha256s ?? [])].sort();
  if (ownedPlanSha256s.some((digest) => !/^[a-f0-9]{64}$/.test(digest)))
    throw new Error('ownedPlanSha256s contains an invalid SHA-256');
  if ((input.observedOwnedResourceIds?.length ?? 0) > 0 && ownedPlanSha256s.length === 0)
    throw new Error('ownedPlanSha256s is required when observing existing owned resources');
  if (input.resourceRegion && !REGION.test(input.resourceRegion)) throw new Error('resourceRegion is invalid');
  if (input.resourceRegion && !regionMatchesPartition(input.resourceRegion, input.partition))
    throw new Error('resourceRegion does not match partition');
  if ([...input.brownfieldResourceIds, ...(input.observedOwnedResourceIds ?? [])].length > 0 && !input.resourceRegion)
    throw new Error('resourceRegion is required when observing brownfield or owned resources');
  validateCapabilities(input.f5Capabilities);
  return instanceTypes;
}

export function extractF5AwsGuideDocument(body: string): string {
  if (!/<html[\s>]/i.test(body)) return body;
  const nextData = /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(body)?.[1];
  if (!nextData) throw new Error('F5 guide HTML did not contain its document payload');
  let parsed: unknown;
  try {
    parsed = JSON.parse(nextData);
  } catch {
    throw new Error('F5 guide document payload was invalid JSON');
  }
  const pageProps = (parsed as Record<string, unknown>).props as Record<string, unknown> | undefined;
  const page = pageProps?.pageProps as Record<string, unknown> | undefined;
  const docData = page?.docData as Record<string, unknown> | undefined;
  const compiledSource = docData?.compiledSource;
  if (typeof compiledSource !== 'string' || compiledSource.length < 100)
    throw new Error('F5 guide document payload did not contain compiled source');
  return compiledSource;
}

export function isF5Smsv2TgwConnectDocumented(body: string): boolean {
  return (
    /secure mesh site v2/i.test(body) &&
    /transit gateway connect|\btgw connect\b/i.test(body) &&
    /\bgre\b/i.test(body) &&
    /\bbgp\b/i.test(body)
  );
}

async function research(fetcher: typeof fetch): Promise<AwsCeObservation['research']> {
  const urls = [AWS_CE_SHARED_CONTRACT_URL, AWS_CE_F5_GUIDE_URL, ...AWS_SOURCES];
  let f5Body = '';
  const sourceReceipts = await Promise.all(
    urls.map(async (url) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetcher(url, {
          redirect: 'follow',
          signal: controller.signal,
          headers: { 'user-agent': 'xcsh-aws-ce-research/2' },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.text();
        const normalized = normalizeResearchDocument(
          url === AWS_CE_F5_GUIDE_URL ? extractF5AwsGuideDocument(body) : body,
        );
        if (normalized.trim().length < 100) throw new Error('response was empty');
        if (
          url === AWS_CE_SHARED_CONTRACT_URL &&
          (!/^contract_id: f5xc-ce-automation$/m.test(normalized) ||
            !/^contract_version: v1$/m.test(normalized) ||
            !normalized.includes('f5xc-ce-automation/v1'))
        )
          throw new Error('document did not advertise f5xc-ce-automation/v1');
        if (url === AWS_CE_F5_GUIDE_URL) f5Body = normalized;
        return { url, normalizedSha256: sha256Hex(normalized) };
      } catch (error) {
        throw new Error(
          `Official AWS CE research failed for ${url}: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  sourceReceipts.sort((left, right) => left.url.localeCompare(right.url));
  const shared = sourceReceipts.find((item) => item.url === AWS_CE_SHARED_CONTRACT_URL);
  const f5 = sourceReceipts.find((item) => item.url === AWS_CE_F5_GUIDE_URL);
  if (!shared || !f5) throw new Error('Official AWS CE research did not return every required source receipt');
  const tgwConnectDocumented = isF5Smsv2TgwConnectDocumented(f5Body);
  return {
    method: 'aws-cli-live',
    officialSourceRetrieval: 'live',
    commands: [],
    officialSources: [AWS_CE_F5_GUIDE_URL, ...AWS_SOURCES],
    sourceReceipts,
    sharedContract: {
      url: AWS_CE_SHARED_CONTRACT_URL,
      contractId: 'f5xc-ce-automation',
      contractVersion: 'v1',
      normalizedSha256: shared.normalizedSha256,
    },
    f5AwsGuide: {
      url: AWS_CE_F5_GUIDE_URL,
      normalizedSha256: f5.normalizedSha256,
      tgwConnectDocumented,
    },
  };
}

function memoryMiB(raw: Record<string, unknown>): number {
  return Number((raw.MemoryInfo as Record<string, unknown> | undefined)?.SizeInMiB ?? 0);
}

function eniLimit(raw: Record<string, unknown>): { maxEnis: number; ipv4PerEni: number } {
  const network = (raw.NetworkInfo as Record<string, unknown> | undefined) ?? {};
  return {
    maxEnis: Number(network.MaximumNetworkInterfaces ?? 0),
    ipv4PerEni: Number(network.Ipv4AddressesPerInterface ?? 0),
  };
}

async function observeRegion(
  api: AwsExecApi,
  region: string,
  optInStatus: string,
  instanceTypes: string[],
  requiredEnis: number,
  nodeCount: 1 | 3,
  egressMode?: AwsCeEgressMode,
  routingProfile?: AwsCeRoutingProfile,
): Promise<AwsCeRegionObservation> {
  const enabled = optInStatus === 'opt-in-not-required' || optInStatus === 'opted-in';
  if (!enabled)
    return {
      name: region,
      optInStatus,
      enabled: false,
      rank: 0,
      eligible: false,
      reasons: ['region-disabled'],
      instanceTypes: [],
      vcpuQuota: 0,
      networkQuotas: [],
      transitGatewaySupported: false,
      brownfieldProximity: 0,
    };
  const reasons: string[] = [];
  let ami: AwsCeRegionObservation['ami'];
  try {
    const [parameter, allowed] = await Promise.all([
      json<Record<string, unknown>>(api, ['ssm', 'get-parameter', '--name', AWS_CE_SSM_PARAMETER, '--region', region]),
      json<Record<string, unknown>>(api, ['ec2', 'get-allowed-images-settings', '--region', region]),
    ]);
    const parameterData = (parameter.Parameter as Record<string, unknown> | undefined) ?? {};
    const imageId = String(parameterData.Value ?? '');
    if (!/^ami-[0-9a-f]{8,17}$/.test(imageId)) throw new Error('SSM parameter returned an invalid AMI ID');
    const images = await json<{ Images?: Array<Record<string, unknown>> }>(api, [
      'ec2',
      'describe-images',
      '--image-ids',
      imageId,
      '--include-deprecated',
      '--region',
      region,
    ]);
    const image = images.Images?.find((item) => item.ImageId === imageId);
    if (!image) throw new Error('AMI was not returned by describe-images');
    const permissions = await json<{ LaunchPermissions?: unknown[] }>(api, [
      'ec2',
      'describe-image-attribute',
      '--image-id',
      imageId,
      '--attribute',
      'launchPermission',
      '--region',
      region,
    ]).catch(() => ({ LaunchPermissions: [] }));
    const mappings = Array.isArray(image.BlockDeviceMappings)
      ? (image.BlockDeviceMappings as Array<Record<string, unknown>>)
      : [];
    const root = mappings.find((item) => item.DeviceName === image.RootDeviceName) ?? mappings[0] ?? {};
    const ebs = (root.Ebs as Record<string, unknown> | undefined) ?? {};
    const productCodes = (Array.isArray(image.ProductCodes) ? image.ProductCodes : [])
      .map((item) => String((item as Record<string, unknown>).ProductCodeId ?? ''))
      .filter(Boolean)
      .sort();
    const deprecation = typeof image.DeprecationTime === 'string' ? image.DeprecationTime : undefined;
    const allowedByPolicy = allowed.State !== 'enabled' || image.ImageAllowed !== false;
    const launchPermission = Boolean(image.Public) || (permissions.LaunchPermissions?.length ?? 0) > 0;
    ami = {
      id: imageId,
      ssmParameter: AWS_CE_SSM_PARAMETER,
      ssmVersion: Number(parameterData.Version ?? 0),
      ownerAlias: String(image.ImageOwnerAlias ?? image.OwnerAlias ?? ''),
      ownerId: String(image.OwnerId ?? ''),
      productCodes,
      architecture: String(image.Architecture ?? ''),
      creationDate: String(image.CreationDate ?? ''),
      deprecationTime: deprecation,
      state: String(image.State ?? ''),
      rootDeviceName: String(image.RootDeviceName ?? ''),
      rootVolumeGiB: Number(ebs.VolumeSize ?? 0),
      launchPermission,
      allowedByPolicy,
    };
    if (ami.ownerAlias !== 'aws-marketplace' || ami.productCodes.length === 0)
      reasons.push('ami-not-marketplace-owned');
    if (ami.architecture !== 'x86_64') reasons.push('ami-architecture');
    if (ami.state !== 'available') reasons.push('ami-state');
    if (!ami.ssmVersion) reasons.push('ssm-version');
    if (!ami.rootDeviceName || ami.rootVolumeGiB < 1) reasons.push('ami-root-disk');
    if (!ami.launchPermission) reasons.push('ami-launch-permission');
    if (!ami.allowedByPolicy) reasons.push('ami-policy');
    if (deprecation && Date.parse(deprecation) <= Date.now()) reasons.push('ami-deprecated');
  } catch {
    reasons.push('ami-observation-failed');
  }

  const [details, offerings, quota, networkQuotaResults, tgw] = await Promise.all([
    json<{ InstanceTypes?: Array<Record<string, unknown>> }>(api, [
      'ec2',
      'describe-instance-types',
      '--instance-types',
      ...instanceTypes,
      '--region',
      region,
    ]).catch(() => ({ InstanceTypes: [] })),
    json<{ InstanceTypeOfferings?: Array<Record<string, unknown>> }>(api, [
      'ec2',
      'describe-instance-type-offerings',
      '--location-type',
      'availability-zone',
      '--filters',
      `Name=instance-type,Values=${instanceTypes.join(',')}`,
      '--region',
      region,
    ]).catch(() => ({ InstanceTypeOfferings: [] })),
    json<Record<string, unknown>>(api, [
      'service-quotas',
      'get-service-quota',
      '--service-code',
      'ec2',
      '--quota-code',
      'L-1216C47A',
      '--region',
      region,
    ]).catch(() => ({})),
    Promise.all(
      ['ec2', 'vpc', 'elasticloadbalancing'].map(async (serviceCode) => {
        try {
          const result = await json<{ Quotas?: Array<Record<string, unknown>> }>(api, [
            'service-quotas',
            'list-service-quotas',
            '--service-code',
            serviceCode,
            '--region',
            region,
          ]);
          return { serviceCode, quotas: result.Quotas ?? [], ok: true };
        } catch {
          return { serviceCode, quotas: [], ok: false };
        }
      }),
    ),
    api.exec('aws', ['ec2', 'describe-transit-gateways', '--max-results', '5', '--region', region, '--output', 'json']),
  ]);
  const zonesByType = new Map<string, string[]>();
  for (const offering of offerings.InstanceTypeOfferings ?? []) {
    const name = String(offering.InstanceType ?? '');
    const zones = zonesByType.get(name) ?? [];
    zones.push(String(offering.Location ?? ''));
    zonesByType.set(name, zones);
  }
  const observedTypes = (details.InstanceTypes ?? [])
    .map((item) => {
      const name = String(item.InstanceType ?? '');
      const limits = eniLimit(item);
      const vCpus = Number((item.VCpuInfo as Record<string, unknown> | undefined)?.DefaultVCpus ?? 0);
      const memory = memoryMiB(item);
      const zones = [...new Set(zonesByType.get(name) ?? [])].sort();
      const itemReasons: string[] = [];
      if (vCpus < 8 || memory < 32 * 1024) itemReasons.push('ce-minimum-size');
      if (limits.maxEnis < requiredEnis) itemReasons.push('eni-limit');
      if (zones.length < nodeCount) itemReasons.push('az-offering');
      return {
        name,
        vCpus,
        memoryMiB: memory,
        maxEnis: limits.maxEnis,
        ipv4PerEni: limits.ipv4PerEni,
        availabilityZones: zones,
        supported: itemReasons.length === 0,
        reasons: itemReasons,
      };
    })
    .sort((left, right) => Number(right.supported) - Number(left.supported) || left.name.localeCompare(right.name));
  if (!observedTypes.some((item) => item.supported)) reasons.push('instance-type');
  const quotaRecord = quota as Record<string, unknown>;
  const vcpuQuota = Number((quotaRecord.Quota as Record<string, unknown> | undefined)?.Value ?? 0);
  const selected = observedTypes.find((item) => item.supported);
  if (!vcpuQuota || vcpuQuota < (selected?.vCpus ?? 8) * nodeCount) reasons.push('vcpu-quota');
  const networkQuotas = networkQuotaResults
    .flatMap((result) =>
      result.quotas.map((item) => ({
        serviceCode: result.serviceCode,
        quotaCode: String(item.QuotaCode ?? ''),
        quotaName: String(item.QuotaName ?? ''),
        value: Number(item.Value ?? 0),
      })),
    )
    .filter((item) => item.quotaCode && item.quotaName && Number.isFinite(item.value))
    .sort(
      (left, right) =>
        left.serviceCode.localeCompare(right.serviceCode) ||
        left.quotaCode.localeCompare(right.quotaCode) ||
        left.quotaName.localeCompare(right.quotaName),
    );
  if (networkQuotaResults.some((result) => !result.ok)) reasons.push('network-quota-observation-failed');
  const quotaValue = (pattern: RegExp) => networkQuotas.find((item) => pattern.test(item.quotaName))?.value;
  if (egressMode === 'elastic-ip' && (quotaValue(/elastic ips/i) ?? 0) < nodeCount) reasons.push('elastic-ip-quota');
  if (routingProfile === 'nlb-ingress' && (quotaValue(/network load balancers.*region/i) ?? 0) < 1)
    reasons.push('nlb-quota');
  return {
    name: region,
    optInStatus,
    enabled: true,
    rank: 0,
    eligible: reasons.length === 0,
    reasons: [...new Set(reasons)].sort(),
    ami,
    instanceTypes: observedTypes,
    vcpuQuota,
    networkQuotas,
    transitGatewaySupported: tgw.exitCode === 0,
    brownfieldProximity: 0,
  };
}

async function observeResource(
  api: AwsExecApi,
  id: string,
  region: string,
  deploymentName: string,
  ownedPlanSha256s: string[],
): Promise<AwsCeResourceObservation> {
  let args: string[];
  if (id.startsWith('i-')) args = ['ec2', 'describe-instances', '--instance-ids', id];
  else if (id.startsWith('eni-')) args = ['ec2', 'describe-network-interfaces', '--network-interface-ids', id];
  else if (id.startsWith('sg-')) args = ['ec2', 'describe-security-groups', '--group-ids', id];
  else if (id.startsWith('eipalloc-')) args = ['ec2', 'describe-addresses', '--allocation-ids', id];
  else if (id.startsWith('eipassoc-')) args = ['ec2', 'describe-addresses', '--association-ids', id];
  else if (id.startsWith('nat-')) args = ['ec2', 'describe-nat-gateways', '--nat-gateway-ids', id];
  else if (id.startsWith('vpce-')) args = ['ec2', 'describe-vpc-endpoints', '--vpc-endpoint-ids', id];
  else if (id.startsWith('rtb-')) args = ['ec2', 'describe-route-tables', '--route-table-ids', id];
  else if (id.startsWith('subnet-')) args = ['ec2', 'describe-subnets', '--subnet-ids', id];
  else if (id.startsWith('vpc-')) args = ['ec2', 'describe-vpcs', '--vpc-ids', id];
  else if (id.startsWith('tgw-rtb-'))
    args = ['ec2', 'get-transit-gateway-route-table-associations', '--transit-gateway-route-table-id', id];
  else if (id.startsWith('tgw-connect-peer-'))
    args = ['ec2', 'describe-transit-gateway-connect-peers', '--transit-gateway-connect-peer-ids', id];
  else if (id.startsWith('tgw-attach-'))
    args = ['ec2', 'describe-transit-gateway-attachments', '--transit-gateway-attachment-ids', id];
  else if (id.startsWith('tgw-')) args = ['ec2', 'describe-transit-gateways', '--transit-gateway-ids', id];
  else if (/^arn:[^:]+:elasticloadbalancing:.*:targetgroup\//.test(id))
    args = ['elbv2', 'describe-target-health', '--target-group-arn', id];
  else if (/^arn:[^:]+:elasticloadbalancing:.*:loadbalancer\//.test(id))
    args = ['elbv2', 'describe-load-balancers', '--load-balancer-arns', id];
  else if (/^arn:[^:]+:elasticloadbalancing:.*:listener\//.test(id))
    args = ['elbv2', 'describe-listeners', '--listener-arns', id];
  else args = ['resourcegroupstaggingapi', 'get-resources', '--resource-arn-list', id];
  const result = await api.exec('aws', [...args, '--region', region, '--output', 'json']);
  if (result.exitCode !== 0) {
    if (/not.?found|does not exist|invalid.*not found/i.test(result.stderr))
      return { id, region, exists: false, owned: false, tags: {}, state: {} };
    throw new Error(`AWS resource observation failed for ${id}: ${result.stderr}`);
  }
  const raw = JSON.parse(result.stdout) as Record<string, unknown>;
  if (id.startsWith('tgw-rtb-')) {
    const propagation = await api.exec('aws', [
      'ec2',
      'get-transit-gateway-route-table-propagations',
      '--transit-gateway-route-table-id',
      id,
      '--region',
      region,
      '--output',
      'json',
    ]);
    if (propagation.exitCode !== 0)
      throw new Error(`AWS TGW propagation observation failed for ${id}: ${propagation.stderr}`);
    raw.Propagations =
      (JSON.parse(propagation.stdout) as Record<string, unknown>).TransitGatewayRouteTablePropagations ?? [];
  }
  if (/^arn:[^:]+:elasticloadbalancing:/.test(id)) {
    const tagResult = await api.exec('aws', [
      'elbv2',
      'describe-tags',
      '--resource-arns',
      id,
      '--region',
      region,
      '--output',
      'json',
    ]);
    if (tagResult.exitCode !== 0) throw new Error(`AWS ELB tag observation failed for ${id}: ${tagResult.stderr}`);
    raw.TagDescriptions = (JSON.parse(tagResult.stdout) as Record<string, unknown>).TagDescriptions ?? [];
  }
  const serialized = JSON.stringify(raw);
  const tags: Record<string, string> = {};
  for (const match of serialized.matchAll(/"Key":"([^"]+)","Value":"([^"]*)"/g)) tags[match[1]] = match[2];
  return {
    id,
    region,
    exists: true,
    owned:
      tags['xcsh-managed-by'] === 'aws-ce' &&
      tags['xcsh-deployment-id'] === deploymentName &&
      ownedPlanSha256s.includes(tags['xcsh-plan-sha256'] ?? ''),
    tags,
    state: raw,
  };
}

export async function observeAwsResources(
  api: AwsExecApi,
  ids: string[],
  region: string,
  ownership: { deploymentName: string; planSha256s: string[] },
): Promise<AwsCeResourceObservation[]> {
  const normalized = [...new Set(ids)].sort();
  for (const id of normalized) if (!RESOURCE_ID.test(id)) throw new Error(`Invalid AWS resource observation ID: ${id}`);
  if (!SAFE_NAME.test(ownership.deploymentName)) throw new Error('Invalid AWS ownership deployment name');
  if (ownership.planSha256s.some((digest) => !/^[a-f0-9]{64}$/.test(digest)))
    throw new Error('Invalid AWS ownership plan SHA-256');
  return mapLimit(normalized, 3, (id) =>
    observeResource(api, id, region, ownership.deploymentName, ownership.planSha256s),
  );
}

export async function discoverAwsCompute(
  input: AwsComputeDiscoveryInput,
  api: AwsExecApi,
  fetcher: typeof fetch = fetch,
): Promise<AwsCeObservation> {
  const instanceTypes = validateInput(input);
  const researchReceipt = await research(fetcher);
  const identity = await json<Record<string, unknown>>(api, ['sts', 'get-caller-identity']);
  if (String(identity.Account) !== input.accountId) throw new Error('AWS CLI returned a different account');
  const arn = String(identity.Arn ?? '');
  if (!arn.startsWith(`arn:${input.partition}:`)) throw new Error('AWS CLI returned a different partition');
  const [regionResult, agreements] = await Promise.all([
    json<{ Regions?: Array<Record<string, unknown>> }>(api, ['ec2', 'describe-regions', '--all-regions']),
    json<{ agreementViewSummaries?: Array<Record<string, unknown>> }>(api, [
      'marketplace-agreement',
      'search-agreements',
      '--catalog',
      'AWSMarketplace',
      '--filters',
      JSON.stringify([
        { name: 'PartyType', values: ['Acceptor'] },
        { name: 'AgreementType', values: ['PurchaseAgreement'] },
        { name: 'ResourceIdentifier', values: [AWS_CE_MARKETPLACE_PRODUCT_ID] },
        { name: 'Status', values: ['ACTIVE'] },
      ]),
      '--region',
      input.partition === 'aws' ? 'us-east-1' : input.partition === 'aws-us-gov' ? 'us-gov-west-1' : 'cn-north-1',
    ]),
  ]);
  const activeAgreements = (agreements.agreementViewSummaries ?? [])
    .filter((item) => String(item.status ?? '').toUpperCase() === 'ACTIVE')
    .map((item) => String(item.agreementId ?? ''))
    .filter(Boolean)
    .sort();
  const rawRegions = (regionResult.Regions ?? [])
    .map((item) => ({ name: String(item.RegionName ?? ''), status: String(item.OptInStatus ?? '') }))
    .filter((item) => REGION.test(item.name))
    .sort((left, right) => left.name.localeCompare(right.name));
  const regions = await mapLimit(rawRegions, 3, (item) =>
    observeRegion(
      api,
      item.name,
      item.status,
      instanceTypes,
      input.requiredEnis,
      input.nodeCount,
      input.egressMode,
      input.routingProfile,
    ),
  );
  regions.sort(
    (left, right) =>
      Number(right.eligible) - Number(left.eligible) ||
      Number(right.enabled) - Number(left.enabled) ||
      right.brownfieldProximity - left.brownfieldProximity ||
      left.reasons.length - right.reasons.length ||
      left.name.localeCompare(right.name),
  );
  regions.forEach((region, index) => {
    region.rank = index + 1;
  });
  const selectedRegion =
    input.resourceRegion ?? regions.find((region) => region.enabled)?.name ?? rawRegions[0]?.name ?? 'us-east-1';
  const resources = await observeAwsResources(
    api,
    [...input.brownfieldResourceIds, ...(input.observedOwnedResourceIds ?? [])],
    selectedRegion,
    { deploymentName: input.deploymentName, planSha256s: [...new Set(input.ownedPlanSha256s ?? [])].sort() },
  );
  researchReceipt.commands = [
    'aws sts get-caller-identity',
    'aws ec2 describe-regions --all-regions',
    `aws ssm get-parameter --name ${AWS_CE_SSM_PARAMETER}`,
    'aws ec2 describe-images',
    'aws ec2 describe-image-attribute',
    'aws ec2 get-allowed-images-settings',
    'aws ec2 describe-instance-types',
    'aws ec2 describe-instance-type-offerings',
    'aws service-quotas get-service-quota',
    'aws service-quotas list-service-quotas',
    'aws marketplace-agreement search-agreements',
  ];
  return {
    schemaVersion: AWS_CE_SCHEMA_VERSION,
    identity: { accountId: input.accountId, partition: input.partition, arn },
    agreement: {
      productId: AWS_CE_MARKETPLACE_PRODUCT_ID,
      active: activeAgreements.length > 0,
      agreementIds: activeAgreements,
    },
    regions,
    resources,
    ownershipPlanSha256s: [...new Set(input.ownedPlanSha256s ?? [])].sort(),
    f5Capabilities: input.f5Capabilities,
    f5CapabilitiesSha256: canonicalSha256(input.f5Capabilities),
    research: researchReceipt,
  };
}
