import { createHash } from 'node:crypto';
import {
  KVM_CONTRACT_COMMIT,
  KVM_CONTRACT_REPOSITORY,
  KVM_CONTRACT_TAG,
  KVM_OPENAPI_SHA256,
  KVM_PREREQUISITE_REASON,
} from './contract-identity';
import type { KvmReleasePrerequisite } from './lifecycle';

const RELEASE_URL = `https://api.github.com/repos/${KVM_CONTRACT_REPOSITORY}/releases/tags/${KVM_CONTRACT_TAG}`;
const TAG_URL = `https://api.github.com/repos/${KVM_CONTRACT_REPOSITORY}/commits/${KVM_CONTRACT_TAG}`;
const IMAGE_PATH = '/api/register/namespaces/system/get-image-download-url';
const OPERATION = 'ves.io.schema.registration.CustomAPI.GetImageDownloadUrl' as const;

type Json = Record<string, unknown>;
type Fetcher = typeof fetch;

function fail(message: string): never {
  throw new Error(`Verified KVM prerequisite release is unavailable: ${message}`);
}

function object(value: unknown, label: string): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} is malformed`);
  return value as Json;
}

function digest(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

async function json(fetcher: Fetcher, url: string): Promise<Json> {
  const response = await fetcher(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (!response.ok) fail(`release request failed with HTTP ${response.status}`);
  return object(await response.json(), 'release response');
}

function publicationReceipt(body: unknown): Json {
  if (typeof body !== 'string') fail('publication receipt is missing');
  const matches = [...body.matchAll(/^<!-- publication-receipt:(.+) -->$/gm)];
  if (matches.length !== 1) fail('publication receipt is malformed');
  try {
    return object(JSON.parse(matches[0][1]), 'publication receipt');
  } catch {
    return fail('publication receipt is not JSON');
  }
}

export async function resolveKvmReleasePrerequisite(fetcher: Fetcher = fetch): Promise<KvmReleasePrerequisite> {
  const release = await json(fetcher, RELEASE_URL);
  if (
    release.tag_name !== KVM_CONTRACT_TAG ||
    release.draft !== false ||
    release.prerelease !== false ||
    release.immutable !== true
  )
    fail('release is not final and immutable');

  const tag = await json(fetcher, TAG_URL);
  if (tag.sha !== KVM_CONTRACT_COMMIT) fail('tag does not resolve to the pinned commit');

  const receipt = publicationReceipt(release.body);
  const receiptAssets = object(receipt.assets, 'publication receipt assets');
  if (
    receipt.commit !== KVM_CONTRACT_COMMIT ||
    receipt.version !== KVM_CONTRACT_TAG.slice(1) ||
    receiptAssets['openapi.json'] !== KVM_OPENAPI_SHA256
  )
    fail('publication receipt differs from the pinned contract');

  const assets = Array.isArray(release.assets)
    ? release.assets.map((value) => object(value, 'release asset'))
    : fail('release asset list is malformed');
  const openapiAsset = assets.find((asset) => asset.name === 'openapi.json');
  if (
    !openapiAsset ||
    openapiAsset.digest !== KVM_OPENAPI_SHA256 ||
    typeof openapiAsset.browser_download_url !== 'string'
  )
    fail('OpenAPI asset is not bound to the pinned digest');
  const downloadUrl = new URL(openapiAsset.browser_download_url);
  if (downloadUrl.protocol !== 'https:') fail('OpenAPI asset URL is not HTTPS');
  const response = await fetcher(downloadUrl);
  if (!response.ok) fail(`OpenAPI download failed with HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (digest(bytes) !== KVM_OPENAPI_SHA256) fail('OpenAPI bytes differ from the pinned digest');

  let openapi: Json;
  try {
    openapi = object(JSON.parse(new TextDecoder().decode(bytes)), 'OpenAPI document');
  } catch {
    return fail('OpenAPI document is not JSON');
  }
  const paths = object(openapi.paths, 'OpenAPI paths');
  const path = object(paths[IMAGE_PATH], 'KVM image path');
  const operation = object(path.post, 'KVM image operation');
  const prerequisites = Array.isArray(operation['x-f5xc-prerequisites'])
    ? operation['x-f5xc-prerequisites'].map((value) => object(value, 'KVM image prerequisite'))
    : fail('KVM image prerequisite is missing');
  if (
    operation.operationId !== OPERATION ||
    operation['x-f5xc-operation-role'] !== 'query' ||
    operation['x-f5xc-terraform-name'] !== 'site_image' ||
    prerequisites.length !== 1
  )
    fail('KVM image operation identity is unsupported');
  const prerequisite = prerequisites[0];
  const cardinality = object(prerequisite.cardinality, 'KVM prerequisite cardinality');
  const source = object(prerequisite.source, 'KVM prerequisite source');
  if (
    prerequisite.id !== 'maurice_config_cardinality_exactly_one' ||
    prerequisite.resource !== 'maurice_config' ||
    cardinality.exactly !== 1 ||
    prerequisite.enforcement !== 'server' ||
    prerequisite.availability !== 'external_tenant_prerequisite' ||
    prerequisite.reason !== KVM_PREREQUISITE_REASON ||
    source.kind !== 'runtime_api_error' ||
    source.operation !== OPERATION ||
    source.immutable !== true
  )
    fail('KVM prerequisite contract is unsupported');

  return {
    id: 'maurice_config_cardinality_exactly_one',
    resource: 'maurice_config',
    cardinality: { exactly: 1 },
    enforcement: 'server',
    availability: 'external_tenant_prerequisite',
    reason: KVM_PREREQUISITE_REASON,
    source: { kind: 'runtime_api_error', operation: OPERATION, immutable: true },
    publication: {
      repository: KVM_CONTRACT_REPOSITORY,
      tag: KVM_CONTRACT_TAG,
      commit: KVM_CONTRACT_COMMIT,
      asset: 'openapi.json',
      sha256: KVM_OPENAPI_SHA256,
    },
  };
}
