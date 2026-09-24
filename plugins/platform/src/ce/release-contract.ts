import { createHash } from 'node:crypto';

const RELEASE_TAG = 'v7.0.9';
const RELEASE_COMMIT = '1c4f4eb8dd6cd9c440c241b995a6c0ef1bcd23ab';
const RELEASE_VERSION = '7.0.9';
const OPENAPI_SHA256 = 'sha256:31a1b5ede0a12dae48b2e93373565bd0717ac56cafff5800c595475c7030b327';
const REPOSITORY = 'f5-sales-demo/api-specs-enriched';
const RELEASE_URL = `https://api.github.com/repos/f5-sales-demo/api-specs-enriched/releases/tags/${RELEASE_TAG}`;
const TAG_URL = `https://api.github.com/repos/f5-sales-demo/api-specs-enriched/commits/${RELEASE_TAG}`;
const REQUIRED_ASSETS = new Set([
  'api-catalog.json',
  'concurrency_contracts.json',
  'f5xc-api-specs-v7.0.9.zip',
  'index.json',
  'minimal-export-defaults.json',
  'openapi.json',
  'smsv2-contract-manifest.json',
  'smsv2-contract.json',
  'smsv2-evidence-receipt.json',
  'smsv2_parity_manifest.json',
  'upstream-contract-removals.json',
]);

export interface Smsv2KvmImageResolution {
  id: 'site_uid_image_resolution';
  endpoint: '/api/maurice/software_os_version';
  operation: 'ves.io.schema.virtual_appliance.SoftwareVersionOsImageCustomApi.GetImage';
  ownerJoin: {
    namespace: 'system';
    namedConfiguration: 'exactly_one';
    ownerKind: 'securemesh_site_v2';
    cardinality: 'exactly_one';
    uidSource: 'site_object';
  };
  validation: Array<
    'exact_site_uid_mapping' | 'empty_error_description' | 'https_image_url' | 'md5_checksum' | 'ownership_recheck'
  >;
  publication: {
    repository: typeof REPOSITORY;
    tag: typeof RELEASE_TAG;
    commit: typeof RELEASE_COMMIT;
    asset: 'openapi.json';
    sha256: string;
  };
}

export interface Smsv2ReleaseContract {
  collectionPath: string;
  itemPath: string;
  namespace: 'system';
  operations: Array<'create' | 'read' | 'replace' | 'delete'>;
  capabilities: {
    awsCeCreate: 'available';
    runtimeStatus: 'available';
    tgwConnect: 'available';
  };
  kvmImageResolution: Smsv2KvmImageResolution;
}

type Json = Record<string, unknown>;
type Fetcher = typeof fetch;

function fail(message: string): never {
  throw new ReleaseContractFailure(message);
}

export class ReleaseContractFailure extends Error {
  readonly category:
    | 'public_contract_transport'
    | 'public_contract_http'
    | 'public_contract_parsing'
    | 'public_contract_integrity'
    | 'public_contract_provenance';

  constructor(message: string) {
    super(`Verified SMSv2 release is unavailable: ${message}`);
    this.category = message.startsWith('public_contract_transport')
      ? 'public_contract_transport'
      : message.startsWith('public_contract_http')
        ? 'public_contract_http'
        : message.startsWith('public_contract_parsing')
          ? 'public_contract_parsing'
          : message.includes('checksum') || message.includes('digest') || message.includes('asset')
            ? 'public_contract_integrity'
            : 'public_contract_provenance';
  }
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

async function json(fetcher: Fetcher, url: string): Promise<Json> {
  let response: Response;
  try {
    response = await fetcher(url, { headers: { Accept: 'application/vnd.github+json' } });
  } catch {
    fail('public_contract_transport');
  }
  if (!response.ok) fail(`public_contract_http:${response.status}`);
  try {
    return object(await response.json(), 'release response');
  } catch {
    fail('public_contract_parsing');
  }
}

function receipt(body: unknown): Json {
  if (typeof body !== 'string') fail('publication receipt is missing');
  const matches = [...body.matchAll(/^<!-- publication-receipt:(.+) -->$/gm)];
  if (matches.length !== 1) fail('publication receipt is malformed');
  try {
    return JSON.parse(matches[0][1]) as Json;
  } catch {
    return fail('publication receipt is not JSON');
  }
}

function object(value: unknown, label: string): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} is malformed`);
  return value as Json;
}

function parseAsset(bytes: Uint8Array, label: string): Json {
  try {
    return object(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), label);
  } catch {
    fail(`public_contract_parsing: ${label} is invalid JSON`);
  }
}

async function asset(fetcher: Fetcher, value: Json, expected: string): Promise<Uint8Array> {
  if (typeof value.browser_download_url !== 'string' || typeof value.digest !== 'string')
    fail('release asset metadata is malformed');
  let response: Response;
  try {
    response = await fetcher(value.browser_download_url);
  } catch {
    fail('public_contract_transport');
  }
  if (!response.ok) fail(`public_contract_http:${response.status}`);
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch {
    fail('public_contract_transport');
  }
  if (sha256(bytes) !== expected || value.digest !== expected)
    fail('public_contract_integrity: asset checksum does not match the immutable release receipt');
  return bytes;
}

export function parseKvmImageResolution(openapi: unknown): Omit<Smsv2KvmImageResolution, 'publication'> {
  const api = object(openapi, 'KVM image resolution OpenAPI');
  const paths = object(api.paths, 'KVM image resolution paths');
  const endpoint = '/api/maurice/software_os_version';
  const operation = object(object(paths[endpoint], 'KVM image resolution path').post, 'KVM image resolution operation');
  const operationId = 'ves.io.schema.virtual_appliance.SoftwareVersionOsImageCustomApi.GetImage';
  const requestRef = object(
    object(
      object(operation.requestBody, 'KVM image resolution request').content,
      'KVM image resolution request content',
    )['application/json'],
    'KVM image resolution request JSON',
  ).schema;
  const responseRef = object(
    object(
      object(object(operation.responses, 'KVM image resolution responses')['200'], 'KVM image resolution response')
        .content,
      'KVM image resolution response content',
    )['application/json'],
    'KVM image resolution response JSON',
  ).schema;
  const schemas = object(
    object(api.components, 'KVM image resolution components').schemas,
    'KVM image resolution schemas',
  );
  const request = object(
    object(schemas.virtual_applianceGetImageRequest, 'KVM image resolution request schema').properties,
    'KVM image resolution request properties',
  );
  const uids = object(request.uids, 'KVM image resolution UIDs');
  const images = object(
    object(
      object(schemas.virtual_applianceGetImageResponse, 'KVM image resolution response schema').properties,
      'KVM image resolution response properties',
    ).images,
    'KVM image resolution images',
  );
  const image = object(
    object(images.additionalProperties, 'KVM image resolution image').properties,
    'KVM image resolution image fields',
  );
  const link = object(image.download_image_link, 'KVM image resolution link');
  const checksum = object(image.image_md5_sum, 'KVM image resolution checksum');
  const error = object(image.error_description, 'KVM image resolution error');
  if (
    operation.operationId !== operationId ||
    object(requestRef, 'KVM image resolution request reference').$ref !==
      '#/components/schemas/virtual_applianceGetImageRequest' ||
    object(responseRef, 'KVM image resolution response reference').$ref !==
      '#/components/schemas/virtual_applianceGetImageResponse' ||
    uids.type !== 'array' ||
    uids.uniqueItems !== true ||
    uids.minItems !== 1 ||
    object(uids.items, 'KVM image resolution UID item').type !== 'string' ||
    typeof uids.description !== 'string' ||
    !uids.description.includes('owner_view.kind equal to securemesh_site_v2') ||
    !uids.description.includes('owner_view.uid to the exact Secure Mesh Site v2 configuration UID') ||
    images.type !== 'object' ||
    link.type !== 'string' ||
    link.format !== 'uri' ||
    checksum.type !== 'string' ||
    checksum.pattern !== '^[0-9a-fA-F]{32}$' ||
    error.type !== 'string'
  )
    fail('KVM image resolution schema is unsupported');
  return {
    id: 'site_uid_image_resolution',
    endpoint,
    operation: operationId,
    ownerJoin: {
      namespace: 'system',
      namedConfiguration: 'exactly_one',
      ownerKind: 'securemesh_site_v2',
      cardinality: 'exactly_one',
      uidSource: 'site_object',
    },
    validation: [
      'exact_site_uid_mapping',
      'empty_error_description',
      'https_image_url',
      'md5_checksum',
      'ownership_recheck',
    ],
  };
}

export async function resolveSmsv2ReleaseContract(
  fetcher: Fetcher = fetch,
  expectedOpenapiDigest = OPENAPI_SHA256,
): Promise<Smsv2ReleaseContract> {
  const release = await json(fetcher, RELEASE_URL);
  if (
    release.tag_name !== RELEASE_TAG ||
    release.draft !== false ||
    release.prerelease !== false ||
    release.immutable !== true
  )
    fail('release is not final and immutable');

  const tag = await json(fetcher, TAG_URL);
  if (tag.sha !== RELEASE_COMMIT) fail('release tag does not resolve to the pinned commit');

  const published = receipt(release.body);
  const publishedAssets = object(published.assets, 'publication receipt assets');
  if (publishedAssets['openapi.json'] !== expectedOpenapiDigest)
    fail('public_contract_integrity: OpenAPI digest differs from the pinned release');
  if (published.commit !== RELEASE_COMMIT || published.version !== RELEASE_VERSION)
    fail('publication receipt identity differs from the pinned release');
  const assets = Array.isArray(release.assets)
    ? release.assets.map((item) => object(item, 'release asset'))
    : fail('asset list');
  if (new Set(assets.map((item) => item.name)).size !== REQUIRED_ASSETS.size || assets.length !== REQUIRED_ASSETS.size)
    fail('release asset set differs from the SMSv2 contract');
  for (const name of REQUIRED_ASSETS) {
    const item = assets.find((candidate) => candidate.name === name);
    if (
      !item ||
      typeof publishedAssets[name] !== 'string' ||
      !/^sha256:[0-9a-f]{64}$/.test(publishedAssets[name]) ||
      item.digest !== publishedAssets[name]
    )
      fail('publication receipt does not bind every release asset');
  }

  const get = async (name: string) => {
    const item = assets.find((candidate) => candidate.name === name);
    if (!item || typeof publishedAssets[name] !== 'string') fail('required SMSv2 asset is missing');
    return asset(fetcher, item, publishedAssets[name] as string);
  };

  const manifest = parseAsset(await get('smsv2-contract-manifest.json'), 'manifest');
  const manifestRelease = object(manifest.release, 'manifest release');
  const manifestAssets = object(manifest.assets, 'manifest assets');
  if (
    manifest.schema_version !== 1 ||
    manifest.contract_id !== 'f5xc-smsv2-api/v1' ||
    manifest.contract_version !== '7.0.0' ||
    manifestRelease.tag !== RELEASE_TAG ||
    manifestRelease.commit !== tag.sha
  )
    fail('manifest identity is not bound to the release tag and commit');

  const contractBytes = await get('smsv2-contract.json');
  const evidenceBytes = await get('smsv2-evidence-receipt.json');
  const openapiBytes = await get('openapi.json');
  if (
    manifestAssets['smsv2-contract.json'] !== sha256(contractBytes) ||
    manifestAssets['smsv2-evidence-receipt.json'] !== sha256(evidenceBytes)
  )
    fail('manifest checksums are inconsistent');

  const contract = parseAsset(contractBytes, 'contract');
  const api = object(contract.api, 'contract API');
  const aws = object(object(contract.providers, 'providers').aws, 'AWS provider');
  const capabilities = object(aws.capabilities, 'AWS capabilities');
  const bootstrap = object(aws.bootstrap, 'AWS bootstrap policy');
  const declaredEvidence = object(aws.evidence, 'AWS evidence');
  const operations = api.operations;
  const evidence = parseAsset(evidenceBytes, 'evidence receipt');
  const receipts = Array.isArray(evidence.receipts)
    ? evidence.receipts.map((value) => object(value, 'evidence receipt'))
    : [];
  const observed = typeof evidence.recorded_at === 'string' ? Date.parse(evidence.recorded_at) : Number.NaN;
  const now = Date.now();
  if (!Number.isFinite(observed) || observed > now || now - observed > 90 * 24 * 60 * 60 * 1000)
    fail('evidence is stale');
  if (
    evidence.contract_id !== 'f5xc-smsv2-api/v1' ||
    evidence.provenance !== 'f5-distributed-cloud-smsv2-system-namespace' ||
    !Array.isArray(evidence.profiles) ||
    !evidence.profiles.includes('aws-shaped-ce-configuration') ||
    !receipts.some(
      (item) =>
        item.sanitized === true &&
        item.redaction === 'no tenant response, token, bootstrap material, or resource identifier',
    )
  )
    fail('evidence provenance is unsupported');

  if (
    contract.contract_id !== 'f5xc-smsv2-api/v1' ||
    contract.version !== '7.0.0' ||
    aws.availability !== 'evidence_backed' ||
    bootstrap.mode !== 'site_bound_jwt_cloud_init' ||
    bootstrap.headless_checkout !== 'available' ||
    bootstrap.reference !== 'deployment_bound_opaque_one_use' ||
    declaredEvidence.provenance !== 'f5-distributed-cloud-smsv2-system-namespace' ||
    api.namespace !== 'system' ||
    !Array.isArray(operations) ||
    new Set(operations).size !== 4 ||
    !['create', 'read', 'replace', 'delete'].every((operation) => operations.includes(operation)) ||
    capabilities.aws_ce_create !== 'available' ||
    capabilities.runtime_status !== 'available' ||
    capabilities.tgw_connect !== 'available' ||
    typeof api.collection_path !== 'string' ||
    typeof api.item_path !== 'string'
  )
    fail('AWS capability boundary is unsupported');

  let resolution: Omit<Smsv2KvmImageResolution, 'publication'>;
  try {
    resolution = parseKvmImageResolution(parseAsset(openapiBytes, 'OpenAPI contract'));
  } catch {
    fail('public_contract_parsing: KVM image resolution schema is unsupported');
  }

  return {
    collectionPath: api.collection_path,
    itemPath: api.item_path,
    namespace: 'system',
    operations: ['create', 'read', 'replace', 'delete'],
    capabilities: { awsCeCreate: 'available', runtimeStatus: 'available', tgwConnect: 'available' },
    kvmImageResolution: {
      ...resolution,
      publication: {
        repository: REPOSITORY,
        tag: RELEASE_TAG,
        commit: RELEASE_COMMIT,
        asset: 'openapi.json',
        sha256: publishedAssets['openapi.json'] as string,
      },
    },
  };
}
