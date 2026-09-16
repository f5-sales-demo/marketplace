import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { resolveSmsv2ReleaseContract } from '../../src/ce/release-contract';

const releaseUrl = 'https://api.github.com/repos/f5-sales-demo/api-specs-enriched/releases/tags/v7.0.3';
const tagUrl = 'https://api.github.com/repos/f5-sales-demo/api-specs-enriched/commits/v7.0.3';
const commit = '55151d9bda8ea8f04c595e76ee6b05aee96d7fc7';
const kvmReason =
  'The tenant must contain exactly one maurice_config object before the platform can issue a Customer Edge image download URL.';
const names = [
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
] as const;

type Options = {
  draft?: boolean;
  malformed?: boolean;
  stale?: boolean;
  unsanitized?: boolean;
  tamper?: boolean;
  wrongCommit?: boolean;
  tgwUnavailable?: boolean;
  malformedKvmPrerequisite?: boolean;
};

function digest(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function kvmPrerequisite(exactly = 1) {
  return {
    id: 'maurice_config_cardinality_exactly_one',
    resource: 'maurice_config',
    cardinality: { exactly },
    enforcement: 'server',
    availability: 'external_tenant_prerequisite',
    reason: kvmReason,
    source: {
      kind: 'runtime_api_error',
      operation: 'ves.io.schema.registration.CustomAPI.GetImageDownloadUrl',
      immutable: true,
    },
  };
}

function openapiDocument(prerequisite = kvmPrerequisite()) {
  return {
    openapi: '3.0.3',
    paths: {
      '/api/register/namespaces/system/get-image-download-url': {
        post: {
          operationId: 'ves.io.schema.registration.CustomAPI.GetImageDownloadUrl',
          'x-f5xc-terraform-name': 'site_image',
          'x-f5xc-operation-role': 'query',
          'x-f5xc-prerequisites': [prerequisite],
        },
      },
    },
  };
}

function fixture(options: Options = {}): typeof fetch {
  const encoder = new TextEncoder();
  const contract = {
    contract_id: 'f5xc-smsv2-api/v1',
    version: '7.0.0',
    api: {
      namespace: 'system',
      operations: ['create', 'read', 'replace', 'delete'],
      collection_path: '/api/config/namespaces/{namespace}/securemesh_site_v2s',
      item_path: '/api/config/namespaces/{namespace}/securemesh_site_v2s/{name}',
    },
    providers: {
      aws: {
        availability: 'evidence_backed',
        bootstrap: {
          mode: 'site_bound_jwt_cloud_init',
          headless_checkout: 'available',
          reference: 'deployment_bound_opaque_one_use',
        },
        evidence: { provenance: 'f5-distributed-cloud-smsv2-system-namespace' },
        capabilities: {
          aws_ce_create: 'available',
          runtime_status: 'available',
          tgw_connect: options.tgwUnavailable ? 'unavailable' : 'available',
        },
      },
    },
  };
  const openapi = openapiDocument(kvmPrerequisite(options.malformedKvmPrerequisite ? 2 : 1));
  const contractBytes = encoder.encode(JSON.stringify(contract));
  const openapiBytes = encoder.encode(JSON.stringify(openapi));
  const evidenceBytes = encoder.encode(
    JSON.stringify({
      contract_id: 'f5xc-smsv2-api/v1',
      recorded_at: options.stale ? '2020-01-01T00:00:00Z' : new Date().toISOString(),
      provenance: 'f5-distributed-cloud-smsv2-system-namespace',
      profiles: ['aws-shaped-ce-configuration'],
      receipts: [
        {
          sanitized: !options.unsanitized,
          redaction: 'no tenant response, token, bootstrap material, or resource identifier',
        },
      ],
    }),
  );
  const manifestBytes = encoder.encode(
    JSON.stringify({
      schema_version: 1,
      contract_id: 'f5xc-smsv2-api/v1',
      contract_version: '7.0.0',
      release: { tag: 'v7.0.3', commit: options.wrongCommit ? '0'.repeat(40) : commit },
      assets: {
        'smsv2-contract.json': digest(contractBytes),
        'smsv2-evidence-receipt.json': digest(evidenceBytes),
      },
    }),
  );
  const assets = new Map<string, Uint8Array>(
    names.map((name) => [name, encoder.encode(`fixture:${name}`)] as [string, Uint8Array]),
  );
  assets.set('smsv2-contract-manifest.json', manifestBytes);
  assets.set('smsv2-contract.json', contractBytes);
  assets.set('smsv2-evidence-receipt.json', evidenceBytes);
  assets.set('openapi.json', openapiBytes);
  const metadata = names.map((name) => ({
    name,
    digest: digest(assets.get(name) ?? new Uint8Array()),
    browser_download_url: `https://fixture.test/assets/${name}`,
  }));
  const publicationAssets = Object.fromEntries(metadata.map((item) => [item.name, item.digest]));
  const release = {
    tag_name: 'v7.0.3',
    draft: options.draft ?? false,
    prerelease: false,
    immutable: true,
    body: `<!-- publication-receipt:${JSON.stringify({ assets: publicationAssets, commit, version: '7.0.3' })} -->`,
    assets: options.malformed ? metadata.slice(1) : metadata,
  };
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === releaseUrl) return new Response(JSON.stringify(release), { status: 200 });
    if (url === tagUrl) return new Response(JSON.stringify({ sha: commit }), { status: 200 });
    const name = url.replace('https://fixture.test/assets/', '');
    const bytes = assets.get(name);
    if (!bytes) return new Response(null, { status: 404 });
    return new Response(
      Buffer.from(options.tamper && name === 'smsv2-contract.json' ? encoder.encode('tampered') : bytes),
    );
  }) as typeof fetch;
}

describe('verified SMSv2 AWS release resolver', () => {
  it('accepts only the immutable system-namespace AWS CE contract', async () => {
    const resolved = await resolveSmsv2ReleaseContract(fixture());
    expect(resolved).toEqual({
      collectionPath: '/api/config/namespaces/{namespace}/securemesh_site_v2s',
      itemPath: '/api/config/namespaces/{namespace}/securemesh_site_v2s/{name}',
      namespace: 'system',
      operations: ['create', 'read', 'replace', 'delete'],
      capabilities: { awsCeCreate: 'available', runtimeStatus: 'available', tgwConnect: 'available' },
      kvmImagePrerequisite: {
        id: 'maurice_config_cardinality_exactly_one',
        resource: 'maurice_config',
        cardinality: { exactly: 1 },
        enforcement: 'server',
        availability: 'external_tenant_prerequisite',
        reason: kvmReason,
        source: {
          kind: 'runtime_api_error',
          operation: 'ves.io.schema.registration.CustomAPI.GetImageDownloadUrl',
          immutable: true,
        },
        publication: {
          repository: 'f5-sales-demo/api-specs-enriched',
          tag: 'v7.0.3',
          commit,
          asset: 'openapi.json',
          sha256: digest(new TextEncoder().encode(JSON.stringify(openapiDocument()))),
        },
      },
    });
  });

  it.each([
    ['a mutable draft release', { draft: true }],
    ['a malformed asset set', { malformed: true }],
    ['a checksum-tampered asset', { tamper: true }],
    ['stale evidence', { stale: true }],
    ['an unsanitized evidence receipt', { unsanitized: true }],
    ['a manifest with the wrong commit', { wrongCommit: true }],
    ['an unavailable TGW capability', { tgwUnavailable: true }],
    ['a malformed KVM image prerequisite', { malformedKvmPrerequisite: true }],
  ])('rejects %s', async (_label, options) => {
    await expect(resolveSmsv2ReleaseContract(fixture(options))).rejects.toThrow(
      /Verified SMSv2 release is unavailable/,
    );
  });
});
