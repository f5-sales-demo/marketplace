import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { resolveSmsv2AwsReleaseContract } from '../../src/ce/release-contract';

const releaseUrl = 'https://api.github.com/repos/f5-sales-demo/api-specs-enriched/releases/tags/v2.1.222';
const tagUrl = 'https://api.github.com/repos/f5-sales-demo/api-specs-enriched/commits/v2.1.222';
const commit = 'e1b5cc16b8cb3928a409f144099ea473ae33e307';
const names = [
  'api-catalog.json',
  'f5xc-api-specs-v2.1.222.zip',
  'index.json',
  'minimal-export-defaults.json',
  'openapi.json',
  'smsv2-contract-manifest.json',
  'smsv2-contract.json',
  'smsv2-evidence-receipt.json',
] as const;

type Options = {
  draft?: boolean;
  malformed?: boolean;
  stale?: boolean;
  unsanitized?: boolean;
  tamper?: boolean;
  wrongCommit?: boolean;
  tgwAvailable?: boolean;
};

function digest(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function fixture(options: Options = {}): typeof fetch {
  const encoder = new TextEncoder();
  const contract = {
    contract_id: 'f5xc-ce-automation/v1',
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
          mode: 'interactive_console_only',
          headless_checkout: 'unavailable',
          reference: 'session_bound_opaque_one_use',
        },
        evidence: { provenance: 'f5-distributed-cloud-smsv2-system-namespace' },
        capabilities: {
          aws_ce_create: 'available',
          runtime_status: 'unavailable',
          tgw_connect: options.tgwAvailable ? 'available' : 'unavailable',
        },
      },
    },
  };
  const contractBytes = encoder.encode(JSON.stringify(contract));
  const evidenceBytes = encoder.encode(
    JSON.stringify({
      contract_id: 'f5xc-ce-automation/v1',
      observed_at: options.stale ? '2020-01-01T00:00:00Z' : new Date().toISOString(),
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
      contract_id: 'f5xc-ce-automation/v1',
      release: { tag: 'v2.1.222', commit: options.wrongCommit ? '0'.repeat(40) : commit },
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
  const metadata = names.map((name) => ({
    name,
    digest: digest(assets.get(name) ?? new Uint8Array()),
    browser_download_url: `https://fixture.test/assets/${name}`,
  }));
  const publicationAssets = Object.fromEntries(metadata.map((item) => [item.name, item.digest]));
  const release = {
    tag_name: 'v2.1.222',
    draft: options.draft ?? false,
    prerelease: false,
    immutable: true,
    body: `<!-- publication-receipt:${JSON.stringify({ assets: publicationAssets })} -->`,
    assets: options.malformed ? metadata.slice(1) : metadata,
  };
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === releaseUrl) return new Response(JSON.stringify(release), { status: 200 });
    if (url === tagUrl) return new Response(JSON.stringify({ sha: commit }), { status: 200 });
    const name = url.replace('https://fixture.test/assets/', '');
    const bytes = assets.get(name);
    if (!bytes) return new Response(null, { status: 404 });
    return new Response(options.tamper && name === 'smsv2-contract.json' ? encoder.encode('tampered') : bytes);
  }) as typeof fetch;
}

describe('verified SMSv2 AWS release resolver', () => {
  it('accepts only the immutable system-namespace AWS CE contract', async () => {
    await expect(resolveSmsv2AwsReleaseContract(fixture())).resolves.toEqual({
      collectionPath: '/api/config/namespaces/{namespace}/securemesh_site_v2s',
      itemPath: '/api/config/namespaces/{namespace}/securemesh_site_v2s/{name}',
      namespace: 'system',
      operations: ['create', 'read', 'replace', 'delete'],
      capabilities: { awsCeCreate: 'available', runtimeStatus: 'unavailable', tgwConnect: 'unavailable' },
    });
  });

  it.each([
    ['a mutable draft release', { draft: true }],
    ['a malformed asset set', { malformed: true }],
    ['a checksum-tampered asset', { tamper: true }],
    ['stale evidence', { stale: true }],
    ['an unsanitized evidence receipt', { unsanitized: true }],
    ['a manifest with the wrong commit', { wrongCommit: true }],
    ['an unproven TGW capability', { tgwAvailable: true }],
  ])('rejects %s', async (_label, options) => {
    await expect(resolveSmsv2AwsReleaseContract(fixture(options))).rejects.toThrow(
      /Verified SMSv2 release is unavailable/,
    );
  });
});
