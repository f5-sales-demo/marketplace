import { createHash } from 'node:crypto';

const RELEASE_TAG = 'v7.0.3';
const RELEASE_COMMIT = '55151d9bda8ea8f04c595e76ee6b05aee96d7fc7';
const RELEASE_VERSION = '7.0.3';
const REPOSITORY = 'f5-sales-demo/api-specs-enriched';
const RELEASE_URL = `https://api.github.com/repos/f5-sales-demo/api-specs-enriched/releases/tags/${RELEASE_TAG}`;
const TAG_URL = `https://api.github.com/repos/f5-sales-demo/api-specs-enriched/commits/${RELEASE_TAG}`;
const REQUIRED_ASSETS = new Set([
  'api-catalog.json',
  'concurrency_contracts.json',
  'f5xc-api-specs-v7.0.3.zip',
  'index.json',
  'minimal-export-defaults.json',
  'openapi.json',
  'smsv2-contract-manifest.json',
  'smsv2-contract.json',
  'smsv2-evidence-receipt.json',
  'smsv2_parity_manifest.json',
  'upstream-contract-removals.json',
]);

export interface Smsv2KvmImagePrerequisite {
  id: 'maurice_config_cardinality_exactly_one';
  resource: 'maurice_config';
  cardinality: { exactly: 1 };
  enforcement: 'server';
  availability: 'external_tenant_prerequisite';
  reason: string;
  source: {
    kind: 'runtime_api_error';
    operation: 'ves.io.schema.registration.CustomAPI.GetImageDownloadUrl';
    immutable: true;
  };
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
  kvmImagePrerequisite: Smsv2KvmImagePrerequisite;
}

type Json = Record<string, unknown>;
type Fetcher = typeof fetch;

function fail(message: string): never {
  throw new Error(`Verified SMSv2 release is unavailable: ${message}`);
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

async function json(fetcher: Fetcher, url: string): Promise<Json> {
  const response = await fetcher(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) fail(`release request failed with HTTP ${response.status}`);
  return (await response.json()) as Json;
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

async function asset(fetcher: Fetcher, value: Json, expected: string): Promise<Uint8Array> {
  if (typeof value.browser_download_url !== 'string' || typeof value.digest !== 'string')
    fail('release asset metadata is malformed');
  const response = await fetcher(value.browser_download_url);
  if (!response.ok) fail(`asset download failed with HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (sha256(bytes) !== expected || value.digest !== expected)
    fail('asset checksum does not match the immutable release receipt');
  return bytes;
}

export async function resolveSmsv2ReleaseContract(fetcher: Fetcher = fetch): Promise<Smsv2ReleaseContract> {
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

  const manifest = object(JSON.parse(new TextDecoder().decode(await get('smsv2-contract-manifest.json'))), 'manifest');
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

  const contract = object(JSON.parse(new TextDecoder().decode(contractBytes)), 'contract');
  const api = object(contract.api, 'contract API');
  const aws = object(object(contract.providers, 'providers').aws, 'AWS provider');
  const capabilities = object(aws.capabilities, 'AWS capabilities');
  const bootstrap = object(aws.bootstrap, 'AWS bootstrap policy');
  const declaredEvidence = object(aws.evidence, 'AWS evidence');
  const operations = api.operations;
  const evidence = object(JSON.parse(new TextDecoder().decode(evidenceBytes)), 'evidence receipt');
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

  const openapi = object(JSON.parse(new TextDecoder().decode(openapiBytes)), 'OpenAPI contract');
  const paths = object(openapi.paths, 'OpenAPI paths');
  const imagePath = object(paths['/api/register/namespaces/system/get-image-download-url'], 'KVM image path');
  const imageOperation = object(imagePath.post, 'KVM image operation');
  const prerequisites = Array.isArray(imageOperation['x-f5xc-prerequisites'])
    ? imageOperation['x-f5xc-prerequisites'].map((value) => object(value, 'KVM image prerequisite'))
    : fail('KVM image prerequisite is missing');
  if (
    imageOperation.operationId !== 'ves.io.schema.registration.CustomAPI.GetImageDownloadUrl' ||
    imageOperation['x-f5xc-terraform-name'] !== 'site_image' ||
    imageOperation['x-f5xc-operation-role'] !== 'query' ||
    prerequisites.length !== 1
  )
    fail('KVM image operation identity is unsupported');
  const prerequisite = prerequisites[0];
  const cardinality = object(prerequisite.cardinality, 'KVM image prerequisite cardinality');
  const source = object(prerequisite.source, 'KVM image prerequisite source');
  if (
    prerequisite.id !== 'maurice_config_cardinality_exactly_one' ||
    prerequisite.resource !== 'maurice_config' ||
    cardinality.exactly !== 1 ||
    prerequisite.enforcement !== 'server' ||
    prerequisite.availability !== 'external_tenant_prerequisite' ||
    typeof prerequisite.reason !== 'string' ||
    prerequisite.reason.trim() !== prerequisite.reason ||
    prerequisite.reason.length === 0 ||
    source.kind !== 'runtime_api_error' ||
    source.operation !== imageOperation.operationId ||
    source.immutable !== true
  )
    fail('KVM image prerequisite contract is unsupported');

  return {
    collectionPath: api.collection_path,
    itemPath: api.item_path,
    namespace: 'system',
    operations: ['create', 'read', 'replace', 'delete'],
    capabilities: { awsCeCreate: 'available', runtimeStatus: 'available', tgwConnect: 'available' },
    kvmImagePrerequisite: {
      id: 'maurice_config_cardinality_exactly_one',
      resource: 'maurice_config',
      cardinality: { exactly: 1 },
      enforcement: 'server',
      availability: 'external_tenant_prerequisite',
      reason: prerequisite.reason,
      source: {
        kind: 'runtime_api_error',
        operation: 'ves.io.schema.registration.CustomAPI.GetImageDownloadUrl',
        immutable: true,
      },
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
