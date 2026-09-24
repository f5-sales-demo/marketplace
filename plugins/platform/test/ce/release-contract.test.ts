import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { resolveSmsv2ReleaseContract } from '../../src/ce/release-contract';

const releaseUrl = 'https://api.github.com/repos/f5-sales-demo/api-specs-enriched/releases/tags/v7.0.9';
const tagUrl = 'https://api.github.com/repos/f5-sales-demo/api-specs-enriched/commits/v7.0.9';
const commit = '1c4f4eb8dd6cd9c440c241b995a6c0ef1bcd23ab';
const names = [
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
] as const;

type Options = {
  draft?: boolean;
  malformed?: boolean;
  stale?: boolean;
  unsanitized?: boolean;
  tamper?: boolean;
  wrongCommit?: boolean;
  tgwUnavailable?: boolean;
  malformedKvmImage?: boolean;
  wrongDigest?: boolean;
};

function digest(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function openapiDocument(malformed = false) {
  return {
    openapi: '3.0.3',
    paths: {
      '/api/maurice/software_os_version': {
        post: {
          operationId: 'ves.io.schema.virtual_appliance.SoftwareVersionOsImageCustomApi.GetImage',
          requestBody: {
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/virtual_applianceGetImageRequest' } },
            },
          },
          responses: {
            '200': {
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/virtual_applianceGetImageResponse' } },
              },
            },
          },
        },
      },
      '/api/register/namespaces/system/get-image-download-url': {
        post: { operationId: 'ves.io.schema.registration.CustomAPI.GetImageDownloadUrl' },
      },
    },
    components: {
      schemas: {
        virtual_applianceGetImageRequest: {
          properties: {
            uids: {
              type: 'array',
              minItems: 1,
              uniqueItems: true,
              items: { type: 'string' },
              description:
                'Observed Site object UIDs from the system Site collection. For SMSv2 select owner_view.kind equal to securemesh_site_v2 and join owner_view.uid to the exact Secure Mesh Site v2 configuration UID.',
            },
          },
        },
        virtual_applianceGetImageResponse: {
          properties: {
            images: {
              type: 'object',
              additionalProperties: {
                properties: {
                  download_image_link: { type: 'string', format: 'uri' },
                  image_md5_sum: { type: 'string', pattern: malformed ? 'broken' : '^[0-9a-fA-F]{32}$' },
                  error_description: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  };
}

function fixture(options: Options = {}): { fetcher: typeof fetch; openapiDigest: string } {
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
  const openapi = openapiDocument(options.malformedKvmImage);
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
      release: { tag: 'v7.0.9', commit: options.wrongCommit ? '0'.repeat(40) : commit },
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
    tag_name: 'v7.0.9',
    draft: options.draft ?? false,
    prerelease: false,
    immutable: true,
    body: `<!-- publication-receipt:${JSON.stringify({ assets: publicationAssets, commit, version: '7.0.9' })} -->`,
    assets: options.malformed ? metadata.slice(1) : metadata,
  };
  const fetcher = (async (input: RequestInfo | URL) => {
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
  return { fetcher, openapiDigest: options.wrongDigest ? `sha256:${'0'.repeat(64)}` : digest(openapiBytes) };
}

describe('verified SMSv2 AWS release resolver', () => {
  it('never accepts fixture bytes as the pinned production OpenAPI asset', async () => {
    const { fetcher } = fixture();
    await expect(resolveSmsv2ReleaseContract(fetcher)).rejects.toThrow(/pinned release/);
  });

  it('accepts only the immutable system-namespace AWS CE contract', async () => {
    const { fetcher, openapiDigest } = fixture();
    const resolved = await resolveSmsv2ReleaseContract(fetcher, openapiDigest);
    expect(resolved).toEqual({
      collectionPath: '/api/config/namespaces/{namespace}/securemesh_site_v2s',
      itemPath: '/api/config/namespaces/{namespace}/securemesh_site_v2s/{name}',
      namespace: 'system',
      operations: ['create', 'read', 'replace', 'delete'],
      capabilities: { awsCeCreate: 'available', runtimeStatus: 'available', tgwConnect: 'available' },
      kvmImageResolution: {
        id: 'site_uid_image_resolution',
        endpoint: '/api/maurice/software_os_version',
        operation: 'ves.io.schema.virtual_appliance.SoftwareVersionOsImageCustomApi.GetImage',
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
        publication: {
          repository: 'f5-sales-demo/api-specs-enriched',
          tag: 'v7.0.9',
          commit,
          asset: 'openapi.json',
          sha256: openapiDigest,
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
    ['a malformed KVM image resolution', { malformedKvmImage: true }],
    ['a mismatched pinned digest', { wrongDigest: true }],
  ])('rejects %s', async (_label, options) => {
    const { fetcher, openapiDigest } = fixture(options);
    await expect(resolveSmsv2ReleaseContract(fetcher, openapiDigest)).rejects.toThrow(
      /Verified SMSv2 release is unavailable/,
    );
  });
});
