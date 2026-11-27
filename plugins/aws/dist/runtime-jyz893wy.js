// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun

import { detectAwsError } from './runtime-30f0rzjf.js';
import { readAwsEc2Pages, scopedAwsApi } from './runtime-fex55vat.js';
import {
  AWS_CE_F5_GUIDE_URL,
  AWS_CE_MARKETPLACE_PRODUCT_ID,
  AWS_CE_SCHEMA_VERSION,
  AWS_CE_SHARED_CONTRACT_URL,
  AWS_CE_SSM_PARAMETER,
  AWS_CE_TGW_GUIDE_URL,
  awsEbsVolume,
  normalizeAwsBootstrapKeyPairName,
  observeAwsBootstrapKeyPairs,
} from './runtime-hq53g5p8.js';
import { canonicalSha256, normalizeResearchDocument, sha256Hex } from './runtime-wvre8ba5.js';

// plugins/aws/src/ce/capacity.ts
async function observeTaggedResourceCapacity(api, region, command, field, idField, limit, ownership) {
  if (!Number.isFinite(limit) || limit < 0 || !/^\d{12}$/.test(ownership.accountId ?? ''))
    throw new Error('Resource quota or authenticated account is unavailable or malformed');
  const resources = await readAwsEc2Pages(api, command, field, region);
  const ids = new Set();
  let reusableOwned = 0;
  let used = 0;
  for (const resource of resources) {
    const id = resource[idField];
    if (typeof id !== 'string' || !/^(vpc|igw)-[0-9a-f]{8,21}$/.test(id) || ids.has(id))
      throw new Error('Resource capacity identity is missing or ambiguous');
    ids.add(id);
    if (typeof resource.OwnerId !== 'string' || !/^\d{12}$/.test(resource.OwnerId))
      throw new Error('Capacity resource account is missing');
    if (resource.OwnerId !== ownership.accountId) continue;
    used++;
    if (resource.Tags !== undefined && !Array.isArray(resource.Tags))
      throw new Error('Capacity ownership tags malformed');
    const tags = new Map();
    for (const value of resource.Tags ?? []) {
      if (typeof value?.Key !== 'string' || typeof value?.Value !== 'string' || tags.has(value.Key))
        throw new Error('Capacity ownership tags malformed');
      tags.set(value.Key, value.Value);
    }
    if (
      tags.get('xcsh-managed-by') === 'aws-ce' &&
      tags.get('xcsh-deployment-id') === ownership.deploymentName &&
      ['native', 'terraform'].includes(tags.get('xcsh-execution-engine') ?? '') &&
      ownership.planSha256s.includes(tags.get('xcsh-plan-sha256') ?? '')
    )
      reusableOwned++;
  }
  if (reusableOwned > 1) throw new Error('Ambiguous owned resource capacity');
  return {
    limit,
    used,
    reusableOwned,
    remaining: Math.max(0, limit - used + reusableOwned),
    source: 'aws-cli-live',
  };
}
async function observeStandardVcpuCapacity(api, region, limit, ownership, nodeCount) {
  if (!Number.isFinite(limit) || limit < 0) throw new Error('vCPU quota is malformed');
  const rows = await readAwsEc2Pages(api, 'describe-instances', 'Reservations', region, [
    '--filters',
    'Name=instance-state-name,Values=pending,running',
  ]);
  const instances = rows.flatMap((row) => {
    if (!Array.isArray(row.Instances)) throw new Error('vCPU usage reservation is malformed');
    return row.Instances;
  });
  const ids = new Set();
  const counted = instances.filter((instance) => {
    if (
      !instance ||
      typeof instance !== 'object' ||
      !/^i-[0-9a-f]{8,21}$/.test(instance.InstanceId) ||
      ids.has(instance.InstanceId) ||
      typeof instance.InstanceType !== 'string' ||
      !['pending', 'running'].includes(instance.State?.Name)
    )
      throw new Error('vCPU usage instance identity or state is malformed');
    ids.add(instance.InstanceId);
    if (
      instance.InstanceLifecycle !== undefined &&
      !['spot', 'scheduled', 'capacity-block'].includes(instance.InstanceLifecycle)
    )
      throw new Error('Unknown instance lifecycle in vCPU quota observation');
    return instance.InstanceLifecycle === undefined && /^[acdhimrtz]\d/.test(instance.InstanceType);
  });
  const types = [...new Set(counted.map((instance) => instance.InstanceType))].sort();
  const cpus = new Map();
  for (let offset = 0; offset < types.length; offset += 100) {
    const batch = types.slice(offset, offset + 100);
    const response = await api.exec('aws', [
      'ec2',
      'describe-instance-types',
      '--instance-types',
      ...batch,
      '--region',
      region,
      '--output',
      'json',
    ]);
    if (response.exitCode !== 0) throw new Error('vCPU usage type lookup unavailable');
    const data = JSON.parse(response.stdout);
    if (
      !data ||
      data.NextToken !== undefined ||
      !Array.isArray(data.InstanceTypes) ||
      data.InstanceTypes.length !== batch.length
    )
      throw new Error('vCPU usage type lookup incomplete');
    for (const type of data.InstanceTypes) {
      const vcpus = type?.VCpuInfo?.DefaultVCpus;
      if (!batch.includes(type?.InstanceType) || cpus.has(type.InstanceType) || !Number.isInteger(vcpus) || vcpus < 1)
        throw new Error('vCPU usage type mapping malformed');
      cpus.set(type.InstanceType, vcpus);
    }
  }
  let used = 0;
  let reusableOwned = 0;
  const ownedNodes = new Set();
  for (const instance of counted) {
    const vcpus = cpus.get(instance.InstanceType);
    if (!vcpus) throw new Error('vCPU usage type mapping missing');
    used += vcpus;
    if (instance.Tags !== undefined && !Array.isArray(instance.Tags)) throw new Error('vCPU ownership tags malformed');
    const tags = new Map();
    for (const tag of instance.Tags ?? []) {
      if (typeof tag?.Key !== 'string' || typeof tag?.Value !== 'string' || tags.has(tag.Key))
        throw new Error('vCPU ownership tags malformed');
      tags.set(tag.Key, tag.Value);
    }
    const node = Number(tags.get('xcsh-node-index'));
    if (
      tags.get('xcsh-managed-by') === 'aws-ce' &&
      tags.get('xcsh-deployment-id') === ownership.deploymentName &&
      ['native', 'terraform'].includes(tags.get('xcsh-execution-engine') ?? '') &&
      ownership.planSha256s.includes(tags.get('xcsh-plan-sha256') ?? '') &&
      Number.isInteger(node) &&
      node >= 1 &&
      node <= nodeCount
    ) {
      if (ownedNodes.has(node)) throw new Error('Ambiguous owned-node vCPU capacity');
      ownedNodes.add(node);
      reusableOwned += vcpus;
    }
  }
  return {
    limit,
    used,
    reusableOwned,
    remaining: Math.max(0, limit - used + reusableOwned),
    source: 'aws-cli-live',
  };
}

// plugins/aws/src/ce/eip-association-discovery.ts
var ALLOCATION = /^eipalloc-[0-9a-f]{8}(?:[0-9a-f]{9})?$/;
var ASSOCIATION = /^eipassoc-[0-9a-f]{8}(?:[0-9a-f]{9})?$/;
var ENI = /^eni-[0-9a-f]{8}(?:[0-9a-f]{9})?$/;
function row(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Malformed EIP relationship evidence');
  return value;
}
function address(resource) {
  if (['NextToken', 'NextMarker', 'nextToken'].some((key) => Object.hasOwn(resource.state, key)))
    throw Error('Incomplete EIP relationship evidence');
  const values = resource.state.Addresses;
  if (!resource.exists || !resource.owned || !Array.isArray(values) || values.length !== 1)
    throw Error('EIP relationship is missing or foreign');
  const value = row(values[0]);
  if (
    value.Domain !== 'vpc' ||
    typeof value.AllocationId !== 'string' ||
    !ALLOCATION.test(value.AllocationId) ||
    (resource.id.startsWith('eipalloc-') ? value.AllocationId : value.AssociationId) !== resource.id
  )
    throw Error('EIP allocation/association identity is inconsistent');
  return value;
}
async function observeOwnedAwsEipAssociations(initial, accountId, observe) {
  const resources = new Map(initial.map((resource) => [resource.id, resource]));
  if (resources.size !== initial.length) throw Error('Duplicate EIP discovery resource identity');
  const ensure = async (ids) => {
    const missing = [...new Set(ids)].filter((id) => !resources.has(id)).sort();
    if (!missing.length) return;
    const observed = await observe(missing);
    if (
      observed.length !== missing.length ||
      new Set(observed.map((r) => r.id)).size !== missing.length ||
      observed.some((r) => !missing.includes(r.id))
    )
      throw Error('Incomplete or ambiguous EIP relationship discovery');
    for (const resource of observed) resources.set(resource.id, resource);
  };
  const originalAliases = initial.filter((r) => r.exists && r.owned && r.id.startsWith('eipassoc-'));
  await ensure(originalAliases.map((r) => String(address(r).AllocationId)));
  const relationships = [];
  const seen = new Set();
  for (const allocation of [...resources.values()].filter((r) => r.exists && r.owned && r.id.startsWith('eipalloc-'))) {
    const value = address(allocation);
    if (value.AssociationId === undefined) {
      if (value.NetworkInterfaceId !== undefined || value.InstanceId !== undefined)
        throw Error('Incomplete EIP association evidence');
      continue;
    }
    if (
      typeof value.AssociationId !== 'string' ||
      !ASSOCIATION.test(value.AssociationId) ||
      seen.has(value.AssociationId) ||
      typeof value.NetworkInterfaceId !== 'string' ||
      !ENI.test(value.NetworkInterfaceId)
    )
      throw Error('Malformed or duplicate EIP association identity');
    seen.add(value.AssociationId);
    relationships.push({ allocation, associationId: value.AssociationId, eniId: value.NetworkInterfaceId });
  }
  await ensure(relationships.flatMap((r) => [r.associationId, r.eniId]));
  for (const relationship of relationships) {
    const { allocation, associationId, eniId } = relationship;
    const alias = resources.get(associationId);
    const network = resources.get(eniId);
    if (
      !alias ||
      !network?.exists ||
      !network.owned ||
      alias.region !== allocation.region ||
      network.region !== allocation.region
    )
      throw Error('EIP association network owner is missing or foreign');
    const value = address(alias);
    const parent = address(allocation);
    const networks = network.state.NetworkInterfaces;
    if (
      (value.NetworkInterfaceOwnerId !== undefined && value.NetworkInterfaceOwnerId !== accountId) ||
      (parent.NetworkInterfaceOwnerId !== undefined && parent.NetworkInterfaceOwnerId !== accountId) ||
      value.AllocationId !== allocation.id ||
      value.AssociationId !== associationId ||
      value.NetworkInterfaceId !== eniId ||
      canonicalSha256(alias.tags) !== canonicalSha256(allocation.tags) ||
      !Array.isArray(networks) ||
      networks.length !== 1 ||
      row(networks[0]).NetworkInterfaceId !== eniId ||
      row(networks[0]).OwnerId !== accountId ||
      network.tags['xcsh-execution-engine'] !== allocation.tags['xcsh-execution-engine'] ||
      network.tags['xcsh-deployment-id'] !== allocation.tags['xcsh-deployment-id'] ||
      network.tags['xcsh-node-index'] !== allocation.tags['xcsh-node-index'] ||
      !/^[1-3]$/.test(allocation.tags['xcsh-node-index'] ?? '')
    )
      throw Error('EIP allocation/association/network ownership joins differ');
  }
  if (originalAliases.some((r) => !relationships.some((v) => v.associationId === r.id)))
    throw Error('EIP association changed during discovery');
  return [...resources.values()].sort((a, b) => a.id.localeCompare(b.id));
}

// plugins/aws/src/ce/network-quota-observation.ts
import { createHash } from 'node:crypto';

var digest = (value) => createHash('sha256').update(value).digest('hex');
var object = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
var transient = (error) =>
  error.name === 'AwsThrottlingError' ||
  (error.name === 'AwsExecError' &&
    /requesttimeout|serviceunavailable|internalerror|internalfailure|connection (?:reset|closed|was closed)|(?:connect|read) timeout on endpoint|could not connect to the endpoint|endpointconnectionerror/i.test(
      error.message,
    ));
async function observeAwsNetworkQuotas(api, serviceCode, region, options = {}) {
  if (!['ec2', 'vpc', 'elasticloadbalancing'].includes(serviceCode) || !/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(region))
    throw new Error('Resolved network quota service and region required');
  const pause = options.pause ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  for (let attempts = 1; attempts <= 3; attempts++) {
    let raw;
    try {
      raw = await api.exec('aws', [
        'service-quotas',
        'list-service-quotas',
        '--service-code',
        serviceCode,
        '--region',
        region,
        '--output',
        'json',
      ]);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      return {
        serviceCode,
        quotas: [],
        ok: false,
        attempts,
        failure: { kind: 'command-failed', retryable: false, detailSha256: digest(String(error)) },
      };
    }
    if (raw.exitCode !== 0) {
      const retryable = transient(detectAwsError(raw.stderr, raw.exitCode));
      if (retryable && attempts < 3) {
        await pause(200 * attempts);
        continue;
      }
      return {
        serviceCode,
        quotas: [],
        ok: false,
        attempts,
        failure: { kind: 'command-failed', retryable, detailSha256: digest(raw.stderr) },
      };
    }
    let data;
    try {
      data = JSON.parse(raw.stdout);
    } catch {
      data = undefined;
    }
    if (
      !object(data) ||
      ['NextToken', 'NextMarker', 'nextToken'].some((key) => Object.hasOwn(data, key)) ||
      !Array.isArray(data.Quotas) ||
      !data.Quotas.every(
        (row) =>
          object(row) &&
          typeof row.QuotaCode === 'string' &&
          !!row.QuotaCode.trim() &&
          typeof row.QuotaName === 'string' &&
          !!row.QuotaName.trim() &&
          typeof row.Value === 'number' &&
          Number.isFinite(row.Value) &&
          (row.ServiceCode === undefined || row.ServiceCode === serviceCode),
      )
    )
      return {
        serviceCode,
        quotas: [],
        ok: false,
        attempts,
        failure: { kind: 'invalid-response', retryable: false, detailSha256: digest(raw.stdout) },
      };
    return { serviceCode, quotas: data.Quotas, ok: true, attempts };
  }
  throw new Error('Network quota read exhausted without a result');
}

// plugins/aws/src/ce/discovery.ts
var AWS_SOURCES = [
  'https://docs.aws.amazon.com/accounts/latest/reference/manage-acct-regions.html',
  'https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-store-public-parameters.html',
  'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/allowed-amis.html',
  'https://docs.aws.amazon.com/marketplace/latest/userguide/programmatically-accessing-agreement-details.html',
  'https://docs.aws.amazon.com/vpc/latest/tgw/tgw-connect.html',
];
var ACCOUNT = /^\d{12}$/;
var SAFE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$/;
var INSTANCE_TYPE = /^[a-z0-9][a-z0-9.-]{1,40}$/;
var REGION = /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/;
var RESOURCE_ID =
  /^(?:arn:(?:aws|aws-us-gov|aws-cn):[a-z0-9-]+:[a-z0-9-]*:\d{12}:[A-Za-z0-9_+=,.@:/-]+|(?:vol-[0-9a-f]{8}(?:[0-9a-f]{9})?|(?:i|vpc|subnet|rtb|igw|tgw|tgw-attach|tgw-connect-peer|tgw-rtb|eni|sg|eipalloc|eipassoc|nat|vpce)-[0-9a-f]{8,21}))$/;
var DEFAULT_INSTANCE_TYPES = ['m5.2xlarge', 'm5.4xlarge', 'm6i.2xlarge', 'm6i.4xlarge', 'm7i.2xlarge', 'm7i.4xlarge'];
async function json(api, args) {
  const result = await api.exec('aws', [...args, '--output', 'json']);
  if (result.exitCode !== 0) throw new Error(`AWS discovery command failed: aws ${args.join(' ')}: ${result.stderr}`);
  try {
    const data = JSON.parse(result.stdout);
    if (
      !data ||
      typeof data !== 'object' ||
      Array.isArray(data) ||
      ['NextToken', 'NextMarker', 'nextToken'].some((key) => Object.hasOwn(data, key))
    )
      throw new Error('Malformed or incomplete AWS discovery response');
    return data;
  } catch {
    throw new Error(`Incomplete or invalid AWS discovery JSON for: aws ${args.join(' ')}`);
  }
}
async function mapLimit(items, limit, task) {
  const result = new Array(items.length);
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
function validateCapabilities(value) {
  if (
    value?.smsv2ContractVersion !== 'v2' ||
    !value.supportedProviders?.includes('aws') ||
    !value.bootstrapDrivers?.some((driver) => driver === 'api' || driver === 'console') ||
    !Array.isArray(value.providerNetworkingProfiles?.aws) ||
    typeof value.awsSmsv2TgwConnect?.supported !== 'boolean' ||
    (value.awsSmsv2TgwConnect.supported && !value.awsSmsv2TgwConnect.schemaVersion) ||
    (!value.awsSmsv2TgwConnect.supported && value.awsSmsv2TgwConnect.schemaVersion !== null)
  )
    throw new Error('F5 platform capabilities do not advertise the required AWS Secure Mesh Site v2 contract');
}
function regionMatchesPartition(region, partition) {
  if (partition === 'aws-us-gov') return region.startsWith('us-gov-');
  if (partition === 'aws-cn') return region.startsWith('cn-');
  return !region.startsWith('us-gov-') && !region.startsWith('cn-');
}
function validateInput(input) {
  if (
    input.regionQualificationScope !== undefined &&
    !['all-regions', 'resource-region'].includes(input.regionQualificationScope)
  )
    throw new Error('Invalid region qualification scope');
  if (input.regionQualificationScope === 'resource-region' && !input.resourceRegion)
    throw new Error('Selected-region qualification requires an explicit resourceRegion');
  if (input.bootstrapKeyPairNames !== undefined) {
    if (
      !Array.isArray(input.bootstrapKeyPairNames) ||
      input.bootstrapKeyPairNames.length !== 1 ||
      !input.resourceRegion ||
      !REGION.test(input.resourceRegion) ||
      !regionMatchesPartition(input.resourceRegion, input.partition)
    )
      throw new Error('One explicit region-local EC2 bootstrap key-pair reference is required');
    input.bootstrapKeyPairNames.forEach(normalizeAwsBootstrapKeyPairName);
  }
  if (input.vpcMode !== undefined && !['greenfield', 'brownfield'].includes(input.vpcMode))
    throw new Error('Invalid VPC discovery mode');
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
function extractF5AwsGuideDocument(body) {
  if (!/<html[\s>]/i.test(body)) return body;
  const nextData = /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(body)?.[1];
  if (!nextData) throw new Error('F5 guide HTML did not contain its document payload');
  let parsed;
  try {
    parsed = JSON.parse(nextData);
  } catch {
    throw new Error('F5 guide document payload was invalid JSON');
  }
  const pageProps = parsed.props;
  const page = pageProps?.pageProps;
  const docData = page?.docData;
  const compiledSource = docData?.compiledSource;
  if (typeof compiledSource !== 'string' || compiledSource.length < 100)
    throw new Error('F5 guide document payload did not contain compiled source');
  return compiledSource;
}
function isF5Smsv2TgwConnectDocumented(body) {
  return (
    /secure mesh site v2/i.test(body) &&
    /transit gateway connect|\btgw connect\b/i.test(body) &&
    /\bgre\b/i.test(body) &&
    /\bbgp\b/i.test(body)
  );
}
function isMcnAwsTgwConnectDocumented(body) {
  return (
    /MCN deploys three independent/i.test(body) &&
    /Secure Mesh Site v2/i.test(body) &&
    /six GRE Connect peers/i.test(body) &&
    /twelve BGP sessions/i.test(body) &&
    /SLI payload/i.test(body)
  );
}
async function research(fetcher) {
  const urls = [AWS_CE_SHARED_CONTRACT_URL, AWS_CE_F5_GUIDE_URL, AWS_CE_TGW_GUIDE_URL, ...AWS_SOURCES];
  let f5Body = '';
  let tgwBody = '';
  const sourceReceipts = await Promise.all(
    urls.map(async (url) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
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
          (!/^contract_id: f5xc-ce-automation-policy$/m.test(normalized) ||
            !/^contract_version: v2$/m.test(normalized) ||
            !normalized.includes('f5xc-ce-automation-policy/v2'))
        )
          throw new Error('document did not advertise f5xc-ce-automation-policy/v2');
        if (url === AWS_CE_F5_GUIDE_URL) f5Body = normalized;
        if (url === AWS_CE_TGW_GUIDE_URL) tgwBody = normalized;
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
  const tgw = sourceReceipts.find((item) => item.url === AWS_CE_TGW_GUIDE_URL);
  if (!shared || !f5 || !tgw) throw new Error('Official AWS CE research did not return every required source receipt');
  const tgwConnectDocumented = isF5Smsv2TgwConnectDocumented(f5Body);
  return {
    method: 'aws-cli-live',
    officialSourceRetrieval: 'live',
    commands: [],
    officialSources: [AWS_CE_F5_GUIDE_URL, AWS_CE_TGW_GUIDE_URL, ...AWS_SOURCES],
    mcnTgwGuide: {
      url: AWS_CE_TGW_GUIDE_URL,
      normalizedSha256: tgw.normalizedSha256,
      documented: isMcnAwsTgwConnectDocumented(tgwBody),
    },
    sourceReceipts,
    sharedContract: {
      url: AWS_CE_SHARED_CONTRACT_URL,
      contractId: 'f5xc-ce-automation-policy',
      contractVersion: 'v2',
      normalizedSha256: shared.normalizedSha256,
    },
    f5AwsGuide: {
      url: AWS_CE_F5_GUIDE_URL,
      normalizedSha256: f5.normalizedSha256,
      tgwConnectDocumented,
    },
  };
}
function memoryMiB(raw) {
  return Number(raw.MemoryInfo?.SizeInMiB ?? 0);
}
function eniLimit(raw) {
  const network = raw.NetworkInfo ?? {};
  return {
    maxEnis: Number(network.MaximumNetworkInterfaces ?? 0),
    ipv4PerEni: Number(network.Ipv4AddressesPerInterface ?? 0),
  };
}
async function observeRegion(
  api,
  region,
  optInStatus,
  instanceTypes,
  requiredEnis,
  nodeCount,
  egressMode,
  routingProfile,
  ownership,
  vpcMode = 'greenfield',
) {
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
  const reasons = [];
  let ami;
  try {
    const [parameter, allowed] = await Promise.all([
      json(api, ['ssm', 'get-parameter', '--name', AWS_CE_SSM_PARAMETER, '--region', region]),
      json(api, ['ec2', 'get-allowed-images-settings', '--region', region]),
    ]);
    const parameterData = parameter.Parameter ?? {};
    const imageId = String(parameterData.Value ?? '');
    if (!/^ami-[0-9a-f]{8,17}$/.test(imageId)) throw new Error('SSM parameter returned an invalid AMI ID');
    const images = await json(api, [
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
    const permissions = await json(api, [
      'ec2',
      'describe-image-attribute',
      '--image-id',
      imageId,
      '--attribute',
      'launchPermission',
      '--region',
      region,
    ]).catch(() => ({ LaunchPermissions: [] }));
    const mappings = Array.isArray(image.BlockDeviceMappings) ? image.BlockDeviceMappings : [];
    const root = mappings.find((item) => item.DeviceName === image.RootDeviceName) ?? mappings[0] ?? {};
    const ebs = root.Ebs ?? {};
    const productCodes = (Array.isArray(image.ProductCodes) ? image.ProductCodes : [])
      .map((item) => String(item.ProductCodeId ?? ''))
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
    json(api, ['ec2', 'describe-instance-types', '--instance-types', ...instanceTypes, '--region', region]).catch(
      () => ({ InstanceTypes: [] }),
    ),
    json(api, [
      'ec2',
      'describe-instance-type-offerings',
      '--location-type',
      'availability-zone',
      '--filters',
      `Name=instance-type,Values=${instanceTypes.join(',')}`,
      '--region',
      region,
    ]).catch(() => ({ InstanceTypeOfferings: [] })),
    json(api, [
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
      ['ec2', 'vpc', 'elasticloadbalancing'].map((serviceCode) => observeAwsNetworkQuotas(api, serviceCode, region)),
    ),
    api.exec('aws', ['ec2', 'describe-transit-gateways', '--max-results', '5', '--region', region, '--output', 'json']),
  ]);
  const zonesByType = new Map();
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
      const vCpus = Number(item.VCpuInfo?.DefaultVCpus ?? 0);
      const memory = memoryMiB(item);
      const zones = [...new Set(zonesByType.get(name) ?? [])].sort();
      const supportedArchitectures = item.ProcessorInfo?.SupportedArchitectures;
      const itemReasons = [];
      if (!Array.isArray(supportedArchitectures) || !ami || !supportedArchitectures.includes(ami.architecture))
        itemReasons.push('ami-architecture');
      if (vCpus < 8 || memory < 32 * 1024) itemReasons.push('ce-minimum-size');
      if (limits.maxEnis < requiredEnis) itemReasons.push('eni-limit');
      if (zones.length < nodeCount) itemReasons.push('az-offering');
      return {
        name,
        vCpus,
        supportedArchitectures: Array.isArray(supportedArchitectures)
          ? supportedArchitectures.filter((value) => typeof value === 'string')
          : [],
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
  const quotaRecord = quota;
  const vcpuQuota = Number(quotaRecord.Quota?.Value ?? 0);
  const selected = observedTypes.find((item) => item.supported);
  let vcpuCapacity;
  try {
    vcpuCapacity = await observeStandardVcpuCapacity(
      api,
      region,
      vcpuQuota,
      ownership ?? { deploymentName: '', planSha256s: [] },
      nodeCount,
    );
    if (vcpuCapacity.remaining < (selected?.vCpus ?? 8) * nodeCount) reasons.push('vcpu-quota');
    for (const type of observedTypes) {
      if (type.vCpus * nodeCount > vcpuCapacity.remaining) {
        type.supported = false;
        type.reasons.push('remaining-vcpu-quota');
      }
    }
  } catch {
    reasons.push('vcpu-usage-unavailable');
    for (const type of observedTypes) {
      type.supported = false;
      type.reasons.push('vcpu-usage-unavailable');
    }
  }
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
  const quotaValue = (pattern) => networkQuotas.find((item) => pattern.test(item.quotaName))?.value;
  let vpcCapacity;
  let internetGatewayCapacity;
  try {
    const owner = ownership ?? { deploymentName: '', planSha256s: [], accountId: undefined };
    vpcCapacity = await observeTaggedResourceCapacity(
      api,
      region,
      'describe-vpcs',
      'Vpcs',
      'VpcId',
      quotaValue(/^vpcs per region$/i) ?? NaN,
      owner,
    );
    if (vpcMode === 'greenfield' && vpcCapacity.remaining < 1) reasons.push('vpc-quota');
    if (egressMode === 'elastic-ip' && vpcMode === 'greenfield') {
      internetGatewayCapacity = await observeTaggedResourceCapacity(
        api,
        region,
        'describe-internet-gateways',
        'InternetGateways',
        'InternetGatewayId',
        quotaValue(/internet gateways per region/i) ?? NaN,
        owner,
      );
      if (internetGatewayCapacity.remaining < 1) reasons.push('internet-gateway-quota');
    }
  } catch {
    if (vpcMode === 'greenfield') reasons.push('vpc-or-gateway-capacity-unavailable');
  }
  let elasticIpCapacity;
  if (egressMode === 'elastic-ip') {
    try {
      const response = await json(api, ['ec2', 'describe-addresses', '--region', region]);
      if (response.NextToken || !Array.isArray(response.Addresses)) throw new Error('Incomplete EIP usage evidence');
      const ids = new Set();
      let reusableOwned = 0;
      for (const address of response.Addresses) {
        if (
          typeof address.AllocationId !== 'string' ||
          !/^eipalloc-[0-9a-f]{8,17}$/.test(address.AllocationId) ||
          ids.has(address.AllocationId)
        )
          throw new Error('Ambiguous EIP identity');
        ids.add(address.AllocationId);
        const tags = Array.isArray(address.Tags) ? address.Tags : [];
        const tag = (key) =>
          tags.filter((item) => item.Key === key).length === 1
            ? tags.find((item) => item.Key === key)?.Value
            : undefined;
        if (
          ownership?.resourceIds.includes(address.AllocationId) &&
          tag('xcsh-managed-by') === 'aws-ce' &&
          tag('xcsh-deployment-id') === ownership.deploymentName &&
          ownership.planSha256s.includes(tag('xcsh-plan-sha256') ?? '') &&
          ['native', 'terraform'].includes(tag('xcsh-execution-engine') ?? '')
        )
          reusableOwned++;
      }
      const limit = quotaValue(/elastic ips/i) ?? 0;
      elasticIpCapacity = {
        limit,
        allocated: ids.size,
        reusableOwned,
        available: Math.max(0, limit - ids.size),
        requiredAdditional: Math.max(0, nodeCount - reusableOwned),
      };
      if (elasticIpCapacity.available < elasticIpCapacity.requiredAdditional) reasons.push('elastic-ip-quota');
    } catch {
      reasons.push('elastic-ip-usage-observation-failed');
    }
  }
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
    vcpuCapacity,
    vpcCapacity,
    internetGatewayCapacity,
    networkQuotas,
    networkQuotaFailures: networkQuotaResults.flatMap((result) =>
      result.failure
        ? [
            {
              serviceCode: result.serviceCode,
              attempts: result.attempts,
              ...result.failure,
            },
          ]
        : [],
    ),
    elasticIpCapacity,
    transitGatewaySupported: tgw.exitCode === 0,
    brownfieldProximity: 0,
  };
}
function resourceResponseField(id) {
  if (id.startsWith('vol-')) return 'Volumes';
  if (id.startsWith('i-')) return 'Reservations';
  if (id.startsWith('eni-')) return 'NetworkInterfaces';
  if (id.startsWith('subnet-')) return 'Subnets';
  if (id.startsWith('sg-')) return 'SecurityGroups';
  if (id.startsWith('rtb-')) return 'RouteTables';
  if (id.startsWith('igw-')) return 'InternetGateways';
  if (id.startsWith('vpc-')) return 'Vpcs';
  if (id.startsWith('eipalloc-') || id.startsWith('eipassoc-')) return 'Addresses';
  if (id.startsWith('tgw-connect-peer-')) return 'TransitGatewayConnectPeers';
  if (id.startsWith('tgw-attach-')) return 'TransitGatewayAttachments';
  if (id.startsWith('tgw-rtb-')) return 'Associations';
  if (id.startsWith('tgw-')) return 'TransitGateways';
  if (/^arn:[^:]+:elasticloadbalancing:.*:targetgroup\//.test(id)) return 'TargetHealthDescriptions';
  if (/^arn:[^:]+:elasticloadbalancing:.*:loadbalancer\//.test(id)) return 'LoadBalancers';
  if (/^arn:[^:]+:elasticloadbalancing:.*:listener\//.test(id)) return 'Listeners';
  return 'ResourceTagMappingList';
}
function exactResourceNotFound(id, stderr) {
  const field = resourceResponseField(id);
  const code = {
    Volumes: 'InvalidVolume.NotFound',
    Reservations: 'InvalidInstanceID.NotFound',
    NetworkInterfaces: 'InvalidNetworkInterfaceID.NotFound',
    Subnets: 'InvalidSubnetID.NotFound',
    SecurityGroups: 'InvalidGroup.NotFound',
    RouteTables: 'InvalidRouteTableID.NotFound',
    InternetGateways: 'InvalidInternetGatewayID.NotFound',
    Vpcs: 'InvalidVpcID.NotFound',
    Addresses: id.startsWith('eipalloc-') ? 'InvalidAllocationID.NotFound' : 'InvalidAssociationID.NotFound',
    TransitGatewayConnectPeers: 'InvalidTransitGatewayConnectPeerID.NotFound',
    TransitGatewayAttachments: 'InvalidTransitGatewayAttachmentID.NotFound',
    Associations: 'InvalidRouteTableID.NotFound',
    TransitGateways: 'InvalidTransitGatewayID.NotFound',
    TargetHealthDescriptions: 'TargetGroupNotFound',
    LoadBalancers: 'LoadBalancerNotFound',
    Listeners: 'ListenerNotFound',
  };
  const expected = code[field];
  if (!expected) return false;
  const standard = /^An error occurred \(([^)]+)\) when calling /m.exec(stderr)?.[1];
  return standard === expected || stderr.trim().startsWith(`${expected}:`) || stderr.trim() === expected;
}
async function observeResource(api, id, region, deploymentName, ownedPlanSha256s) {
  let args;
  if (id.startsWith('vol-')) args = ['ec2', 'describe-volumes', '--volume-ids', id];
  else if (id.startsWith('i-')) args = ['ec2', 'describe-instances', '--instance-ids', id];
  else if (id.startsWith('eni-')) args = ['ec2', 'describe-network-interfaces', '--network-interface-ids', id];
  else if (id.startsWith('sg-')) args = ['ec2', 'describe-security-groups', '--group-ids', id];
  else if (id.startsWith('eipalloc-')) args = ['ec2', 'describe-addresses', '--allocation-ids', id];
  else if (id.startsWith('eipassoc-'))
    args = ['ec2', 'describe-addresses', '--filters', `Name=association-id,Values=${id}`];
  else if (id.startsWith('nat-')) args = ['ec2', 'describe-nat-gateways', '--nat-gateway-ids', id];
  else if (id.startsWith('vpce-')) args = ['ec2', 'describe-vpc-endpoints', '--vpc-endpoint-ids', id];
  else if (id.startsWith('rtb-')) args = ['ec2', 'describe-route-tables', '--route-table-ids', id];
  else if (id.startsWith('subnet-')) args = ['ec2', 'describe-subnets', '--subnet-ids', id];
  else if (id.startsWith('igw-')) args = ['ec2', 'describe-internet-gateways', '--internet-gateway-ids', id];
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
    if (exactResourceNotFound(id, result.stderr))
      return { id, region, exists: false, owned: false, tags: {}, state: {} };
    throw new Error(`AWS resource observation failed for ${id}: ${result.stderr}`);
  }
  const raw = JSON.parse(result.stdout);
  const complete = (response) => {
    if (response.NextToken || response.NextMarker || response.nextToken)
      throw new Error('Incomplete AWS resource observation');
  };
  complete(raw);
  if (!Array.isArray(raw[resourceResponseField(id)])) throw new Error('Missing AWS resource observation collection');
  if (id.startsWith('i-') && raw.Reservations.some((r) => !r || !Array.isArray(r.Instances)))
    throw Error('Malformed AWS instance observation collection');
  if (id.startsWith('tgw-rtb-')) {
    const table = await json(api, [
      'ec2',
      'describe-transit-gateway-route-tables',
      '--transit-gateway-route-table-ids',
      id,
      '--region',
      region,
    ]);
    complete(table);
    raw.TransitGatewayRouteTables = table.TransitGatewayRouteTables;
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
    const propagated = JSON.parse(propagation.stdout);
    complete(propagated);
    if (!Array.isArray(propagated.TransitGatewayRouteTablePropagations))
      throw new Error('Incomplete AWS TGW propagation observation');
    raw.Propagations = propagated.TransitGatewayRouteTablePropagations;
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
    let descriptions = JSON.parse(tagResult.stdout).TagDescriptions ?? [];
    if (/^arn:[^:]+:elasticloadbalancing:.*:listener\//.test(id)) {
      const direct = Array.isArray(descriptions) ? descriptions : [];
      const directTags = direct.find((item) => item.ResourceArn === id)?.Tags;
      if (!Array.isArray(directTags) || directTags.length === 0) {
        const listeners = Array.isArray(raw.Listeners) ? raw.Listeners : [];
        const parent = listeners.length === 1 ? listeners[0].LoadBalancerArn : undefined;
        if (typeof parent !== 'string' || !/^arn:[^:]+:elasticloadbalancing:.*:loadbalancer\//.test(parent))
          throw new Error('AWS listener parent ownership evidence is unavailable');
        const parentResult = await api.exec('aws', [
          'elbv2',
          'describe-tags',
          '--resource-arns',
          parent,
          '--region',
          region,
          '--output',
          'json',
        ]);
        if (parentResult.exitCode !== 0)
          throw new Error(`AWS listener parent tag observation failed for ${id}: ${parentResult.stderr}`);
        const parents = JSON.parse(parentResult.stdout).TagDescriptions;
        const rows = Array.isArray(parents) ? parents : [];
        const inherited = rows.filter((item) => item.ResourceArn === parent);
        if (inherited.length !== 1 || !Array.isArray(inherited[0].Tags))
          throw new Error('AWS listener parent ownership evidence is ambiguous');
        descriptions = [{ ResourceArn: id, Tags: inherited[0].Tags, OwnershipParentArn: parent }];
      }
    }
    raw.TagDescriptions = descriptions;
  }
  const matches = [];
  const visit = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
    } else if (value && typeof value === 'object') {
      const object = value;
      if (Object.values(object).some((item) => item === id)) matches.push(object);
      for (const item of Object.values(object)) visit(item);
    }
  };
  if (id.startsWith('vol-')) awsEbsVolume(raw, id);
  visit(raw);
  if (!matches.length && raw[resourceResponseField(id)].length)
    throw Error('AWS resource response contains a different identity');
  const tagSets = matches.filter((object) => Array.isArray(object.Tags) || Array.isArray(object.TagSet));
  if (tagSets.length > 1) throw new Error('AWS ownership evidence is ambiguous');
  if (tagSets[0]?.Tags !== undefined && tagSets[0]?.TagSet !== undefined)
    throw new Error('AWS ownership tag representation is ambiguous');
  const tags = {};
  for (const item of tagSets[0]?.TagSet ?? tagSets[0]?.Tags ?? []) {
    if (!item || typeof item !== 'object') throw new Error('AWS ownership tags are malformed');
    const { Key, Value } = item;
    if (typeof Key !== 'string' || typeof Value !== 'string' || Object.hasOwn(tags, Key))
      throw new Error('AWS ownership tags are malformed or duplicated');
    tags[Key] = Value;
  }
  const terminalDeleted = (() => {
    if (id.startsWith('vol-')) return awsEbsVolume(raw, id)?.state === 'deleted';
    const rows = id.startsWith('tgw-connect-peer-')
      ? raw.TransitGatewayConnectPeers
      : id.startsWith('tgw-attach-')
        ? raw.TransitGatewayAttachments
        : undefined;
    return (
      Array.isArray(rows) &&
      rows.length === 1 &&
      rows[0] !== null &&
      typeof rows[0] === 'object' &&
      String(rows[0].State ?? '').toLowerCase() === 'deleted'
    );
  })();
  return {
    id,
    region,
    exists: matches.length > 0 && !terminalDeleted,
    owned:
      !terminalDeleted &&
      tags['xcsh-managed-by'] === 'aws-ce' &&
      ['native', 'terraform'].includes(tags['xcsh-execution-engine']) &&
      tags['xcsh-deployment-id'] === deploymentName &&
      ownedPlanSha256s.includes(tags['xcsh-plan-sha256'] ?? ''),
    tags,
    state: raw,
  };
}
async function observeAwsResources(api, ids, region, ownership) {
  const normalized = [...new Set(ids)].sort();
  for (const id of normalized) if (!RESOURCE_ID.test(id)) throw new Error(`Invalid AWS resource observation ID: ${id}`);
  if (!SAFE_NAME.test(ownership.deploymentName)) throw new Error('Invalid AWS ownership deployment name');
  if (ownership.planSha256s.some((digest) => !/^[a-f0-9]{64}$/.test(digest)))
    throw new Error('Invalid AWS ownership plan SHA-256');
  return mapLimit(normalized, 3, (id) =>
    observeResource(api, id, region, ownership.deploymentName, ownership.planSha256s),
  );
}
async function discoverAwsCompute(input, api, fetcher = fetch, signal) {
  signal?.throwIfAborted();
  input = { ...input, awsProfile: input.awsProfile ?? 'default' };
  api = scopedAwsApi(api, input.awsProfile, signal);
  if (signal) {
    const originalFetcher = fetcher;
    fetcher = (resource, init) => {
      signal.throwIfAborted();
      const requestSignal = init?.signal ? AbortSignal.any([signal, init.signal]) : signal;
      requestSignal.throwIfAborted();
      return originalFetcher(resource, { ...init, signal: requestSignal });
    };
  }
  const instanceTypes = validateInput(input);
  const researchReceipt = await research(fetcher);
  signal?.throwIfAborted();
  const identity = await json(api, ['sts', 'get-caller-identity']);
  if (String(identity.Account) !== input.accountId) throw new Error('AWS CLI returned a different account');
  const arn = String(identity.Arn ?? '');
  if (!arn.startsWith(`arn:${input.partition}:`)) throw new Error('AWS CLI returned a different partition');
  const [regionResult, agreements] = await Promise.all([
    json(api, ['ec2', 'describe-regions', '--all-regions']),
    json(api, [
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
  const regionQualificationScope = input.regionQualificationScope ?? 'all-regions';
  let qualificationRegions = rawRegions;
  if (regionQualificationScope === 'resource-region') {
    const catalog = regionResult.Regions;
    if (
      !Array.isArray(catalog) ||
      catalog.length === 0 ||
      catalog.some(
        (item) =>
          !item ||
          typeof item !== 'object' ||
          typeof item.RegionName !== 'string' ||
          !REGION.test(item.RegionName) ||
          !regionMatchesPartition(item.RegionName, input.partition) ||
          !['opt-in-not-required', 'opted-in', 'not-opted-in'].includes(String(item.OptInStatus)),
      ) ||
      new Set(catalog.map((item) => item.RegionName)).size !== catalog.length
    )
      throw new Error('Selected-region qualification requires a complete unambiguous region catalog');
    qualificationRegions = rawRegions.filter((item) => item.name === input.resourceRegion);
    if (qualificationRegions.length !== 1)
      throw new Error('Selected qualification region is absent from the authoritative catalog');
  }
  const regions = await mapLimit(qualificationRegions, 3, (item) =>
    observeRegion(
      api,
      item.name,
      item.status,
      instanceTypes,
      input.requiredEnis,
      input.nodeCount,
      input.egressMode,
      input.routingProfile,
      {
        deploymentName: input.deploymentName,
        accountId: input.accountId,
        resourceIds: input.observedOwnedResourceIds ?? [],
        planSha256s: input.ownedPlanSha256s ?? [],
      },
      input.vpcMode ?? 'greenfield',
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
  const bootstrapKeyPairs = input.bootstrapKeyPairNames
    ? await observeAwsBootstrapKeyPairs(api, selectedRegion, input.bootstrapKeyPairNames)
    : undefined;
  let resources = await observeAwsResources(
    api,
    [...input.brownfieldResourceIds, ...(input.observedOwnedResourceIds ?? [])],
    selectedRegion,
    { deploymentName: input.deploymentName, planSha256s: [...new Set(input.ownedPlanSha256s ?? [])].sort() },
  );
  resources = await observeOwnedAwsEipAssociations(resources, input.accountId, (ids) =>
    observeAwsResources(api, ids, selectedRegion, {
      deploymentName: input.deploymentName,
      planSha256s: [...new Set(input.ownedPlanSha256s ?? [])].sort(),
    }),
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
    ...(bootstrapKeyPairs ? ['aws ec2 describe-key-pairs --include-public-key'] : []),
  ];
  return {
    schemaVersion: AWS_CE_SCHEMA_VERSION,
    ...(bootstrapKeyPairs === undefined ? {} : { bootstrapKeyPairs }),
    identity: {
      accountId: input.accountId,
      partition: input.partition,
      arn,
      ...(input.awsProfile ? { awsProfile: input.awsProfile } : {}),
    },
    agreement: {
      productId: AWS_CE_MARKETPLACE_PRODUCT_ID,
      active: activeAgreements.length > 0,
      agreementIds: activeAgreements,
    },
    regions,
    regionalQualification: {
      scope: regionQualificationScope,
      ...(regionQualificationScope === 'resource-region' ? { selectedRegion: input.resourceRegion } : {}),
      catalogRegionNames: rawRegions.map((item) => item.name),
    },
    resources,
    ownershipPlanSha256s: [...new Set(input.ownedPlanSha256s ?? [])].sort(),
    f5Capabilities: input.f5Capabilities,
    f5CapabilitiesSha256: canonicalSha256(input.f5Capabilities),
    research: researchReceipt,
  };
}

// plugins/platform/src/ce/interface-evidence.ts
function parseGeneratedInterfaceUid(value) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value) ||
    value === '00000000-0000-0000-0000-000000000000'
  )
    throw Error('Missing or malformed generated interface UID');
  return value;
}

// plugins/platform/src/ce/initial-registration-retirement.ts
var uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
function validateInitialRegistrationRetirement(binding, value) {
  if (
    binding.nodes.length !== 1 ||
    value.siteName !== binding.siteName ||
    value.node !== binding.nodes[0] ||
    !uuid.test(value.uid) ||
    value.name !== `r-${value.uid}` ||
    typeof value.instanceId !== 'string' ||
    !value.instanceId.trim() ||
    !/^[a-f0-9]{64}$/.test(value.passportSha256) ||
    Object.keys(value).sort().join(',') !== 'instanceId,name,node,passportSha256,siteName,uid'
  )
    throw new Error('Initial registration retirement identity differs');
}

// plugins/platform/src/ce/wire-schema.ts
import { isIP } from 'node:net';

var keywords = new Set([
  'type',
  'enum',
  'const',
  'required',
  'minLength',
  'maxLength',
  'pattern',
  'minimum',
  'maximum',
  'multipleOf',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minProperties',
  'maxProperties',
  'format',
  'nullable',
]);
function object2(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('SMSv2 schema is malformed');
  return value;
}
function vendorIntegerRanges(source) {
  const key = 'ves.io.schema.rules.uint32.ranges';
  const annotations = ['x-ves-validation-rules', 'x-validation-rules']
    .map((name) => (source[name] === undefined ? undefined : object2(source[name])[key]))
    .filter((value) => value !== undefined);
  if (!annotations.length) return;
  if (source.type !== 'integer' || annotations.some((value) => typeof value !== 'string'))
    throw new Error('Malformed SMSv2 integer range');
  const parse = (value) => {
    const ranges = String(value)
      .split(',')
      .map((part) => {
        const match = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
        if (!match) throw new Error('Malformed SMSv2 integer range');
        const minimum = Number(match[1]),
          maximum = Number(match[2] ?? match[1]);
        if (
          ![minimum, maximum].every((bound) => Number.isSafeInteger(bound) && bound >= 0 && bound <= 4294967295) ||
          minimum > maximum
        )
          throw new Error('Malformed SMSv2 integer range');
        return { minimum, maximum };
      });
    return ranges;
  };
  const ranges = annotations.map(parse);
  if (ranges.some((value) => JSON.stringify(value) !== JSON.stringify(ranges[0])))
    throw new Error('Conflicting SMSv2 integer ranges');
  return { anyOf: ranges[0] };
}
function requestSchema(schemas, root) {
  const definitions = {};
  const referenced = new Set();
  function convert(value) {
    if (typeof value === 'boolean') return value;
    const source = object2(value);
    if (source.readOnly === true) return false;
    const result = {};
    for (const [key, item] of Object.entries(source)) {
      if (keywords.has(key)) result[key] = item;
      if (key === 'required' && Array.isArray(item))
        result.required = item.map((name) => {
          const property = object2(source.properties ?? {})[String(name)];
          return typeof property?.['x-f5xc-wire-name'] === 'string' ? property['x-f5xc-wire-name'] : name;
        });
      if (key === '$ref') {
        if (typeof item !== 'string' || !item.startsWith('#/components/schemas/'))
          throw new Error('Unsupported SMSv2 schema reference');
        const name = item.slice('#/components/schemas/'.length);
        if (!Object.hasOwn(schemas, name)) throw new Error('Missing SMSv2 schema reference');
        referenced.add(name);
        result.$ref = `#/definitions/${name}`;
      }
      if (key === 'properties') {
        result.properties = Object.fromEntries(
          Object.entries(object2(item)).map(([name, schema]) => {
            const wireName = object2(schema)['x-f5xc-wire-name'];
            return [typeof wireName === 'string' ? wireName : name, convert(schema)];
          }),
        );
        result.additionalProperties =
          source.additionalProperties === undefined ? false : convert(source.additionalProperties);
      }
      if (key === 'additionalProperties') result.additionalProperties = convert(item);
      if (key === 'items' || key === 'not') result[key] = convert(item);
      if (['allOf', 'anyOf', 'oneOf'].includes(key)) {
        if (!Array.isArray(item)) throw new Error('Malformed SMSv2 schema composition');
        result[key] = item.map(convert);
      }
      if (key === 'exclusiveMinimum' || key === 'exclusiveMaximum') {
        if (typeof item === 'number') result[key] = item;
        else if (item === true) result[key] = source[key === 'exclusiveMinimum' ? 'minimum' : 'maximum'];
      }
    }
    const integerRanges = vendorIntegerRanges(source);
    if (integerRanges) result.allOf = [...(result.allOf ?? []), integerRanges];
    const exclusions = [];
    for (const [key, item] of Object.entries(source)) {
      if (!key.startsWith('x-ves-oneof-field-')) continue;
      let names;
      try {
        names = typeof item === 'string' ? JSON.parse(item) : item;
      } catch {
        throw new Error('Malformed SMSv2 oneof group');
      }
      if (!Array.isArray(names) || names.some((name) => typeof name !== 'string'))
        throw new Error('Malformed SMSv2 oneof group');
      const wireNames = names.map((name) => {
        const property = object2(source.properties ?? {})[String(name)];
        return typeof property?.['x-f5xc-wire-name'] === 'string' ? property['x-f5xc-wire-name'] : name;
      });
      for (let i = 0; i < wireNames.length; i++)
        for (let j = i + 1; j < wireNames.length; j++)
          exclusions.push({ not: { required: [wireNames[i], wireNames[j]] } });
    }
    if (exclusions.length) result.allOf = [...(result.allOf ?? []), ...exclusions];
    return result;
  }
  if (!Object.hasOwn(schemas, root)) throw new Error('Missing SMSv2 create schema');
  referenced.add(root);
  for (const name of referenced) definitions[name] = convert(schemas[name]);
  return { $ref: `#/definitions/${root}`, definitions };
}
function createWireValidator(
  schemas,
  root = 'viewssecuremesh_site_v2CreateSpecType',
  observedInterfaceIdentityEcho = false,
) {
  const schema = requestSchema(schemas, root);
  if (observedInterfaceIdentityEcho) {
    if (root !== 'securemesh_site_v2ReplaceRequest') throw new Error('Identity echo requires a replacement snapshot');
    const properties = object2(object2(schemas.securemesh_site_v2Interface).properties);
    const projected = object2(object2(object2(schema.definitions).securemesh_site_v2Interface).properties);
    for (const field of ['is_primary', 'is_management']) {
      const source = object2(properties[field]);
      if (source.readOnly !== true || source.type !== 'boolean') throw new Error('Interface identity schema changed');
      projected[field] = { type: 'boolean' };
    }
  }
  return (spec) => {
    const keyword = firstFailure(schema, spec, schema);
    if (keyword) {
      throw new Error(`SMSv2 request violates the verified schema (${keyword})`);
    }
  };
}
function equal(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right))
    return left.length === right.length && left.every((item, index) => equal(item, right[index]));
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const leftEntries = Object.entries(left);
    const rightObject = right;
    return (
      leftEntries.length === Object.keys(rightObject).length &&
      leftEntries.every(([key, value]) => Object.hasOwn(rightObject, key) && equal(value, rightObject[key]))
    );
  }
  return false;
}
function validFormat(format, value) {
  if (format === 'cidr') {
    const [address, length, extra] = value.split('/');
    const family = isIP(address);
    if (!family || extra !== undefined || !/^\d+$/.test(length ?? '')) return false;
    const bits = Number(length);
    return bits >= 0 && bits <= (family === 4 ? 32 : 128);
  }
  if (format === 'ipv4') return isIP(value) === 4;
  if (format === 'ipv6') return isIP(value) === 6;
  if (format === 'uuid')
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  if (format === 'dns-label') return /^(?!-)[a-z0-9-]{1,63}(?<!-)$/i.test(value);
  if (format === 'hostname' || format === 'fqdn')
    return value.length <= 253 && value.split('.').every((label) => /^(?!-)[a-z0-9-]{1,63}(?<!-)$/i.test(label));
  if (format === 'uri') {
    try {
      return Boolean(new URL(value).protocol);
    } catch {
      return false;
    }
  }
  if (format === 'date-time')
    return (
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) && !Number.isNaN(Date.parse(value))
    );
  return true;
}
function typeMatches(type, value) {
  if (Array.isArray(type)) return type.some((item) => typeMatches(item, value));
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return type === undefined || typeof value === type;
}
function firstFailure(schemaValue, value, document) {
  if (schemaValue === false) return 'false schema';
  if (schemaValue === true) return null;
  if (typeof schemaValue.$ref === 'string') {
    const prefix = '#/definitions/';
    if (!schemaValue.$ref.startsWith(prefix)) return '$ref';
    const definition = object2(document.definitions)[schemaValue.$ref.slice(prefix.length)];
    if (definition === undefined) return '$ref';
    const failure = firstFailure(definition, value, document);
    if (failure) return failure;
  }
  if (schemaValue.nullable === true && value === null) return null;
  if (!typeMatches(schemaValue.type, value)) return 'type';
  if (Array.isArray(schemaValue.enum) && !schemaValue.enum.some((item) => equal(item, value))) return 'enum';
  if (Object.hasOwn(schemaValue, 'const') && !equal(schemaValue.const, value)) return 'const';
  for (const keyword of ['allOf', 'anyOf', 'oneOf']) {
    const members = schemaValue[keyword];
    if (!Array.isArray(members)) continue;
    const matches = members.filter((member) => firstFailure(member, value, document) === null).length;
    if (
      (keyword === 'allOf' && matches !== members.length) ||
      (keyword === 'anyOf' && matches === 0) ||
      (keyword === 'oneOf' && matches !== 1)
    )
      return keyword;
  }
  if (schemaValue.not !== undefined && firstFailure(schemaValue.not, value, document) === null) return 'not';
  if (typeof value === 'string') {
    const length = [...value].length;
    if (typeof schemaValue.minLength === 'number' && length < schemaValue.minLength) return 'minLength';
    if (typeof schemaValue.maxLength === 'number' && length > schemaValue.maxLength) return 'maxLength';
    if (typeof schemaValue.pattern === 'string' && !new RegExp(schemaValue.pattern, 'u').test(value)) return 'pattern';
    if (typeof schemaValue.format === 'string' && !validFormat(schemaValue.format, value)) return 'format';
  }
  if (typeof value === 'number') {
    if (typeof schemaValue.minimum === 'number' && value < schemaValue.minimum) return 'minimum';
    if (typeof schemaValue.maximum === 'number' && value > schemaValue.maximum) return 'maximum';
    if (typeof schemaValue.exclusiveMinimum === 'number' && value <= schemaValue.exclusiveMinimum)
      return 'exclusiveMinimum';
    if (typeof schemaValue.exclusiveMaximum === 'number' && value >= schemaValue.exclusiveMaximum)
      return 'exclusiveMaximum';
    if (typeof schemaValue.multipleOf === 'number') {
      const quotient = value / schemaValue.multipleOf;
      if (!Number.isFinite(quotient) || Math.abs(quotient - Math.round(quotient)) > 0.000000000001) return 'multipleOf';
    }
  }
  if (Array.isArray(value)) {
    if (typeof schemaValue.minItems === 'number' && value.length < schemaValue.minItems) return 'minItems';
    if (typeof schemaValue.maxItems === 'number' && value.length > schemaValue.maxItems) return 'maxItems';
    if (
      schemaValue.uniqueItems === true &&
      value.some((item, index) => value.slice(0, index).some((seen) => equal(seen, item)))
    )
      return 'uniqueItems';
    if (schemaValue.items !== undefined)
      for (const item of value) {
        const failure = firstFailure(schemaValue.items, item, document);
        if (failure) return failure;
      }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value;
    if (
      Array.isArray(schemaValue.required) &&
      schemaValue.required.some((key) => typeof key === 'string' && !Object.hasOwn(record, key))
    )
      return 'required';
    const entries = Object.entries(record);
    if (typeof schemaValue.minProperties === 'number' && entries.length < schemaValue.minProperties)
      return 'minProperties';
    if (typeof schemaValue.maxProperties === 'number' && entries.length > schemaValue.maxProperties)
      return 'maxProperties';
    const properties = schemaValue.properties ? object2(schemaValue.properties) : undefined;
    for (const [key, item] of entries) {
      const propertySchema = properties?.[key];
      if (propertySchema !== undefined) {
        const failure = firstFailure(propertySchema, item, document);
        if (failure) return failure;
      } else if (schemaValue.additionalProperties === false) return 'additionalProperties';
      else if (schemaValue.additionalProperties && typeof schemaValue.additionalProperties === 'object') {
        const failure = firstFailure(schemaValue.additionalProperties, item, document);
        if (failure) return failure;
      }
    }
  }
  return null;
}

// plugins/platform/src/ce/site-labels.ts
var discoveryLabels = new Set(['domain', 'host-os-version', 'hw-model', 'hw-serial-number', 'hw-vendor', 'hw-version']);

// plugins/platform/src/ce/upgrade-evidence.ts
function object3(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed upgrade evidence');
  return value;
}
function text(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Missing upgrade evidence');
  return value;
}
function parseUpgradePrechecks(raw) {
  const list = object3(raw).checklist;
  if (!Array.isArray(list) || !list.length) throw new Error('Missing upgrade prechecks');
  const seen = new Set();
  const checks = list.map((value) => {
    const row = object3(value),
      name = text(row.item),
      status = text(row.status);
    if (
      seen.has(name) ||
      !['CHECKLIST_UNKNOWN', 'CHECKLIST_PASSED', 'CHECKLIST_WARNING', 'CHECKLIST_FAILED'].includes(status)
    )
      throw new Error('Duplicate or unknown upgrade precheck');
    seen.add(name);
    return { name, status };
  });
  return { checks, passing: checks.every((check) => ['CHECKLIST_PASSED', 'CHECKLIST_WARNING'].includes(check.status)) };
}
function parseSoftwareTargets(raw) {
  const values = object3(raw).sw_versions;
  if (
    !Array.isArray(values) ||
    values.some((value) => typeof value !== 'string' || !/^crt-\d{8}-\d{4}$/.test(value)) ||
    new Set(values).size !== values.length
  )
    throw new Error('Missing or malformed software upgrade targets');
  return values;
}

// plugins/platform/src/ce/runtime.ts
var CE_API_ERROR_BRAND = Symbol.for('xcsh.ce.api-error.v1');

class CeApiError extends Error {
  category;
  status;
  [CE_API_ERROR_BRAND] = true;
  static [Symbol.hasInstance](value) {
    if (!(value instanceof Error)) return false;
    const candidate = value;
    return (
      candidate[CE_API_ERROR_BRAND] === true &&
      [
        'authorization',
        'expired',
        'throttled',
        'not-found',
        'conflict',
        'invalid-request',
        'transient',
        'malformed',
        'cancelled',
        'deadline',
      ].includes(String(candidate.category)) &&
      (candidate.status === undefined ||
        (Number.isInteger(candidate.status) && Number(candidate.status) >= 100 && Number(candidate.status) <= 599))
    );
  }
  constructor(category, status) {
    super(`F5 CE API ${category}${status ? ` (HTTP ${status})` : ''}`);
    this.category = category;
    this.status = status;
  }
}

// plugins/platform/src/ce/contract-auth.ts
import { execFileSync } from 'node:child_process';
// plugins/platform/src/ce/verified-api-release.ts
import { createHash as createHash2 } from 'node:crypto';

function existingContractCredential(env = process.env) {
  const configured = env.GH_TOKEN || env.GITHUB_TOKEN;
  if (configured) return configured;
  try {
    return (
      execFileSync('gh', ['auth', 'token'], {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() || undefined
    );
  } catch {
    return;
  }
}
function contractHeaders(url, token) {
  const headers = { Accept: 'application/vnd.github+json' };
  const target = new URL(url);
  if (
    token &&
    target.origin === 'https://api.github.com' &&
    target.pathname.startsWith('/repos/f5-sales-demo/api-specs-enriched/')
  )
    headers.Authorization = `Bearer ${token}`;
  return headers;
}
function authenticatedContractHeaders(url) {
  const target = new URL(url);
  const scoped =
    target.origin === 'https://api.github.com' &&
    target.pathname.startsWith('/repos/f5-sales-demo/api-specs-enriched/');
  return contractHeaders(url, scoped ? existingContractCredential() : undefined);
}

// plugins/platform/src/ce/verified-api-release.ts
class CeContractFailure extends Error {
  category;
  constructor(category, message) {
    super(message);
    this.category = category;
  }
}
var repository = 'f5-sales-demo/api-specs-enriched';
var tag = 'v12.3.0';
var commit = '7f61de00a1048a801c4be6bea9c462803fd1e3ae';
var digest2 = 'sha256:91411ef102ecdb5564f7d3b188407c7d1468d6f9949ca4e5634e420ed1dca8b5';
var assetUrl = `https://github.com/${repository}/releases/download/${tag}/openapi.json`;
function object4(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed CE API contract');
  return value;
}
function parse(bytes) {
  try {
    return object4(JSON.parse(Buffer.from(bytes).toString('utf8')));
  } catch {
    throw new Error('Malformed CE API contract JSON');
  }
}
var CE_API_RELEASE = Object.freeze({ tag, commit, fingerprint: digest2 });
var verifiedSchemas = new WeakMap();
async function loadPublishedCeApi(fetcher = fetch, signal) {
  signal?.throwIfAborted();
  let pending = verifiedSchemas.get(fetcher);
  if (!pending) {
    pending = verifyPublishedCeApi(fetcher, signal);
    verifiedSchemas.set(fetcher, pending);
    pending.catch(() => {
      if (verifiedSchemas.get(fetcher) === pending) verifiedSchemas.delete(fetcher);
    });
  }
  const api = await pending;
  signal?.throwIfAborted();
  return structuredClone(api);
}
async function verifyPublishedCeApi(fetcher, signal) {
  const deadline = AbortSignal.timeout(60000);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const read = async (url, maximum = 1048576) => {
    combined.throwIfAborted();
    let response;
    try {
      response = await fetcher(url, { signal: combined, headers: authenticatedContractHeaders(url) });
    } catch {
      throw new CeContractFailure('public_contract_transport', 'Published contract transport failed');
    }
    if (!response.ok || !response.body)
      throw new CeContractFailure(
        'public_contract_transport',
        `CE API contract download failed: HTTP ${response.status}, ${new URL(url).hostname}`,
      );
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        combined.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maximum) throw new Error('CE API contract download exceeds size limit');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    return Buffer.concat(chunks);
  };
  const release = parse(await read(`https://api.github.com/repos/${repository}/releases/tags/${tag}`));
  if (release.tag_name !== tag || release.immutable !== true || release.draft !== false || release.prerelease !== false)
    throw new Error('CE API release is not the pinned immutable publication');
  const matches =
    typeof release.body === 'string' ? [...release.body.matchAll(/^<!-- publication-receipt:(.+) -->$/gm)] : [];
  if (matches.length !== 1) throw new Error('CE API publication receipt is missing or ambiguous');
  const receipt = parse(Buffer.from(matches[0][1]));
  if (receipt.commit !== commit || receipt.version !== '12.3.0' || object4(receipt.assets)['openapi.json'] !== digest2)
    throw new Error('CE API publication receipt differs from the pinned contract');
  const assets = Array.isArray(release.assets)
    ? release.assets.map(object4).filter((asset) => asset.name === 'openapi.json')
    : [];
  if (assets.length !== 1 || assets[0].digest !== digest2 || assets[0].browser_download_url !== assetUrl)
    throw new Error('CE API schema asset binding differs from the pinned contract');
  const resolved = parse(await read(`https://api.github.com/repos/${repository}/commits/${tag}`));
  if (resolved.sha !== commit) throw new Error('CE API release tag moved');
  const bytes = await read(assetUrl, 64 * 1024 * 1024);
  if (`sha256:${createHash2('sha256').update(bytes).digest('hex')}` !== digest2)
    throw new Error('CE API schema checksum mismatch');
  const api = parse(bytes);
  combined.throwIfAborted();
  return api;
}

// plugins/platform/src/ce/release-contract.ts
var RELEASE_TAG = CE_API_RELEASE.tag;
var RELEASE_COMMIT = CE_API_RELEASE.commit;
var OPENAPI_SHA256 = CE_API_RELEASE.fingerprint;
var RELEASE_URL = `https://api.github.com/repos/f5-sales-demo/api-specs-enriched/releases/tags/${RELEASE_TAG}`;
var TAG_URL = `https://api.github.com/repos/f5-sales-demo/api-specs-enriched/commits/${RELEASE_TAG}`;
var REQUIRED_ASSETS = new Set([
  'api-catalog.json',
  'enrichment-coverage.json',
  'upstream-contract-changes.json',
  'concurrency_contracts.json',
  'f5xc-api-specs-v12.3.0.zip',
  'index.json',
  'minimal-export-defaults.json',
  'openapi.json',
  'smsv2-contract-manifest.json',
  'smsv2-contract.json',
  'smsv2-evidence-receipt.json',
  'smsv2_parity_manifest.json',
  'upstream-contract-removals.json',
]);

// plugins/platform/src/ce/wire-replace.ts
var object5 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed replacement schema');
  return value;
};
function projectReplaceSnapshot(value, schemas, root, ignoredRootFields = []) {
  function shape(value, depth = 0) {
    if (depth > 50) throw new Error('Replacement schema nesting exceeds limit');
    const schema = object5(value);
    let resolved = {};
    if (schema.$ref) {
      if (typeof schema.$ref !== 'string' || !schema.$ref.startsWith('#/components/schemas/'))
        throw new Error('Unsupported replacement reference');
      resolved = shape(schemas[schema.$ref.slice('#/components/schemas/'.length)], depth + 1);
    }
    if (schema.allOf)
      for (const item of schema.allOf) {
        const part = shape(item, depth + 1);
        resolved = {
          ...resolved,
          ...part,
          ...(resolved.properties || part.properties
            ? { properties: { ...resolved.properties, ...part.properties } }
            : {}),
        };
      }
    return {
      ...resolved,
      ...schema,
      ...(schema.properties ? { properties: { ...resolved.properties, ...object5(schema.properties) } } : {}),
    };
  }
  function project(value, schemaValue, top = false) {
    const schema = shape(schemaValue);
    if (schema.readOnly === true || value === null || (value === '' && Number(schema.minLength) > 0)) return;
    if (Array.isArray(value)) {
      if (!schema.items) throw new Error('Replacement array schema missing');
      return value.map((item) => {
        const projected = project(item, schema.items);
        if (projected === undefined) throw new Error('Replacement array contains an unset item');
        return projected;
      });
    }
    if (value && typeof value === 'object') {
      if (schema.properties === undefined && schema.additionalProperties === undefined) return structuredClone(value);
      const properties = object5(schema.properties ?? {});
      const result = {};
      for (const [key, item] of Object.entries(value)) {
        const canonicalKey = Object.hasOwn(properties, key)
          ? key
          : Object.keys(properties).find((name) => object5(properties[name])['x-f5xc-wire-name'] === key);
        if (canonicalKey === undefined) {
          if (top && ignoredRootFields.includes(key)) continue;
          if (schema.additionalProperties === true) {
            result[key] = structuredClone(item);
            continue;
          }
          if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
            const projected = project(item, schema.additionalProperties);
            if (projected !== undefined) result[key] = projected;
            continue;
          }
          throw new Error('GET snapshot contains an unsupported replacement field');
        }
        const wireName = object5(properties[canonicalKey])['x-f5xc-wire-name'];
        const outputKey = typeof wireName === 'string' ? wireName : canonicalKey;
        if (Object.hasOwn(result, outputKey)) throw new Error('Duplicate canonical and wire field aliases');
        const projected = project(item, properties[canonicalKey]);
        if (projected !== undefined) result[outputKey] = projected;
      }
      return result;
    }
    return structuredClone(value);
  }
  return object5(project(value, schemas[root], true));
}

// plugins/platform/src/ce/verified-contract.ts
var publishedAssets = Object.freeze({
  'smsv2-contract.json': 'sha256:050f7dd1bb25d2ff0b915278b2ddc5ada1321ec6e4996f84f753691d09aa5d08',
  'smsv2-contract-manifest.json': 'sha256:ed63843635fa819d4c6d28578405fcfed9d4040d0feecd6bedbc2d630891b3af',
  'smsv2-evidence-receipt.json': 'sha256:887e4e77b61f604ce56ad3125244d5b9c252fb7a808628ea5fc6c92d21359932',
});

// plugins/platform/src/ce/service.ts
var CE_SERVICE_CHANNEL = 'xcsh:ce-platform:v2:service';
function requestCePlatformService(bus, signal) {
  if (!bus || typeof bus.emit !== 'function')
    return Promise.reject(new Error('Platform CE v2 service is required and not loaded'));
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error('CE operation cancelled'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      reject(new Error('Platform CE v2 service is required and not loaded'));
    }, 5000);
    signal?.addEventListener('abort', abort, { once: true });
    bus.emit(CE_SERVICE_CHANNEL, {
      version: 2,
      resolve: (service) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        resolve(service);
      },
    });
  });
}

// plugins/aws/src/ce/platform.ts
function awsPlatformService(pi, signal) {
  return requestCePlatformService(pi.events, signal);
}

export {
  awsPlatformService,
  CE_API_RELEASE,
  CeApiError,
  createWireValidator,
  discoverAwsCompute,
  loadPublishedCeApi,
  observeAwsResources,
  parseGeneratedInterfaceUid,
  parseSoftwareTargets,
  parseUpgradePrechecks,
  projectReplaceSnapshot,
  validateInitialRegistrationRetirement,
};
