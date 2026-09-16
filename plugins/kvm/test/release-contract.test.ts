import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import {
  KVM_CONTRACT_COMMIT,
  KVM_CONTRACT_TAG,
  KVM_OPENAPI_SHA256,
  KVM_PREREQUISITE_REASON,
} from '../src/contract-identity';
import { resolveKvmReleasePrerequisite } from '../src/release-contract';

function openapi(): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      paths: {
        '/api/register/namespaces/system/get-image-download-url': {
          post: {
            operationId: 'ves.io.schema.registration.CustomAPI.GetImageDownloadUrl',
            'x-f5xc-operation-role': 'query',
            'x-f5xc-terraform-name': 'site_image',
            'x-f5xc-prerequisites': [
              {
                id: 'maurice_config_cardinality_exactly_one',
                resource: 'maurice_config',
                cardinality: { exactly: 1 },
                enforcement: 'server',
                availability: 'external_tenant_prerequisite',
                reason: KVM_PREREQUISITE_REASON,
                source: {
                  kind: 'runtime_api_error',
                  operation: 'ves.io.schema.registration.CustomAPI.GetImageDownloadUrl',
                  immutable: true,
                },
              },
            ],
          },
        },
      },
    }),
  );
}

function fetcher(options: { tagCommit?: string; digest?: string; bytes?: Uint8Array } = {}): typeof fetch {
  const bytes = options.bytes ?? openapi();
  const digest = options.digest ?? KVM_OPENAPI_SHA256;
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith(`/commits/${KVM_CONTRACT_TAG}`))
      return Response.json({ sha: options.tagCommit ?? KVM_CONTRACT_COMMIT });
    if (url.endsWith(`/releases/tags/${KVM_CONTRACT_TAG}`))
      return Response.json({
        tag_name: KVM_CONTRACT_TAG,
        draft: false,
        prerelease: false,
        immutable: true,
        body: `<!-- publication-receipt:${JSON.stringify({
          commit: KVM_CONTRACT_COMMIT,
          version: KVM_CONTRACT_TAG.slice(1),
          assets: { 'openapi.json': digest },
        })} -->`,
        assets: [{ name: 'openapi.json', digest, browser_download_url: 'https://downloads.example.test/openapi.json' }],
      });
    if (url === 'https://downloads.example.test/openapi.json') return new Response(Buffer.from(bytes));
    return new Response(null, { status: 404 });
  }) as typeof fetch;
}

describe('immutable KVM prerequisite release', () => {
  it('rejects a structurally valid release whose pinned tag target changed', async () => {
    await expect(resolveKvmReleasePrerequisite(fetcher({ tagCommit: 'f'.repeat(40) }))).rejects.toThrow(
      'tag does not resolve to the pinned commit',
    );
  });

  it('rejects OpenAPI bytes that do not match the exact pinned digest', async () => {
    const bytes = openapi();
    const actual = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    expect(actual).not.toBe(KVM_OPENAPI_SHA256);
    await expect(resolveKvmReleasePrerequisite(fetcher({ bytes }))).rejects.toThrow(
      'OpenAPI bytes differ from the pinned digest',
    );
  });
});
