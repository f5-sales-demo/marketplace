import { expect, test } from 'bun:test';
import { VerifiedIngressContract } from '../../src/ce/ingress-contract';
import { VerifiedUpgradeContract } from '../../src/ce/upgrade-contract';
import fixture from '../fixtures/inside-listener-schema.json';

const sha = `sha256:${fixture.provenance.sha256}`;
const commit = 'a5fa987f876db955666bd94fefed35f283bb5364';
const assetUrl = 'https://github.com/f5-sales-demo/api-specs-enriched/releases/download/v6.1.2/openapi.json';
const metadata = {
  tag_name: 'v6.1.2',
  immutable: true,
  draft: false,
  prerelease: false,
  body: `<!-- publication-receipt:${JSON.stringify({ version: '6.1.2', commit, assets: { 'openapi.json': sha } })} -->`,
  assets: [{ name: 'openapi.json', digest: sha, browser_download_url: assetUrl }],
};
const response = (value: unknown) => new Response(JSON.stringify(value));

for (const Contract of [VerifiedIngressContract, VerifiedUpgradeContract]) {
  test('rejects altered release identity, publication receipt and asset binding before downloading schemas', async () => {
    for (const patch of [
      { immutable: false },
      { draft: true },
      { prerelease: true },
      { tag_name: 'latest' },
      { body: '' },
      { body: `${metadata.body}\n${metadata.body}` },
      { body: metadata.body.replace(commit, '0'.repeat(40)) },
      { assets: [] },
      { assets: [...metadata.assets, ...metadata.assets] },
      { assets: [{ ...metadata.assets[0], digest: `sha256:${'0'.repeat(64)}` }] },
      { assets: [{ ...metadata.assets[0], browser_download_url: 'https://example.invalid/schema' }] },
    ]) {
      let assetReads = 0;
      await expect(
        Contract.release(async (url) => {
          if (String(url) === assetUrl) {
            assetReads++;
            throw new Error('must not download');
          }
          return response(String(url).includes('/commits/') ? { sha: commit } : { ...metadata, ...patch });
        }),
      ).rejects.toThrow();
      expect(assetReads).toBe(0);
    }
  });

  test('rejects a moved tag and altered schema bytes despite matching release metadata', async () => {
    for (const moved of [true, false]) {
      await expect(
        Contract.release(async (url) => {
          if (String(url).includes('/commits/')) return response({ sha: moved ? '0'.repeat(40) : commit });
          return response(String(url) === assetUrl ? { components: { schemas: fixture.schemas } } : metadata);
        }),
      ).rejects.toThrow();
    }
  });

  test('propagates cancellation and rejects failed release requests', async () => {
    const control = new AbortController();
    control.abort();
    let requests = 0;
    await expect(
      Contract.release(async () => {
        requests++;
        return response(metadata);
      }, control.signal),
    ).rejects.toThrow();
    expect(requests).toBe(0);
    await expect(Contract.release(async () => new Response('', { status: 403 }))).rejects.toThrow();
  });
}
