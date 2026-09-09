import { expect, test } from 'bun:test';
import { collectCeTeardownInventory } from '../../src/ce/teardown-inventory';

const owner = {
  deploymentId: 'ce-test',
  engine: 'terraform' as const,
  provider: 'aws' as const,
  account: 'demo',
  region: 'us-east-1',
};
const bindings = [{ owner, siteName: 'ce-site', nodes: ['ce-node'] }];
const labels = {
  'xcsh-ce-deployment': owner.deploymentId,
  'xcsh-ce-engine': owner.engine,
  'xcsh-ce-provider': owner.provider,
  'xcsh-ce-account': owner.account,
  'xcsh-ce-region': owner.region,
};
function fixture(mode = 'valid') {
  let logicalReads = 0;
  const port = {
    async request(path: string) {
      if (path.includes('?')) {
        const url = new URL(path, 'https://tenant.test');
        expect(url.searchParams.get('label_filter')).toBe('xcsh-ce-deployment=ce-test');
        if (mode === 'partial') return { items: [], next_page_token: 'more' };
        if (mode === 'camel-partial') return { items: [], nextToken: 'more' };
        if (mode === 'errors') return { items: [], errors: [{}] };
        if (!url.pathname.endsWith('/http_loadbalancers')) return { items: [], errors: [] };
        const row = {
          name: 'listener',
          namespace: 'default',
          uid: 'listener-uid',
          labels: {
            ...labels,
            'xcsh-ce-ingress-plan': 'a'.repeat(24),
            ...(mode === 'foreign' ? { 'xcsh-ce-engine': 'native' } : {}),
          },
          metadata:
            mode === 'conflict'
              ? { name: 'different' }
              : mode === 'conflict-labels'
                ? { labels: { ...labels, 'xcsh-ce-engine': 'native' } }
                : {},
          get_spec: { content: 'never-export-this-token' },
          annotations: { secret: 'never-export-this-annotation' },
        };
        return { items: mode === 'duplicate' ? [row, row] : [row], errors: [] };
      }
      const physical = path.includes('/sites/');
      if (!physical) logicalReads++;
      return {
        metadata: { name: 'ce-site', namespace: 'system', labels },
        system_metadata: {
          uid: physical ? 'physical-uid' : mode === 'replaced' && logicalReads > 1 ? 'new-site' : 'site-uid',
        },
        spec: { main_nodes: [{ name: mode === 'wrong-node' ? 'foreign-node' : 'ce-node' }] },
      };
    },
  };
  return port;
}
test('collects owned list identities and stable logical/physical bindings without exporting secret-bearing fields', async () => {
  const receipt = await collectCeTeardownInventory(fixture(), bindings, ['default'], {
    site: 'site-contract',
    ingress: 'ingress-contract',
  });
  expect(receipt.status).toBe('observed');
  if (receipt.status === 'observed') {
    expect(receipt.resources).toEqual([
      {
        kind: 'http_loadbalancers',
        name: 'listener',
        namespace: 'default',
        uid: 'listener-uid',
        ingressPlanId: 'a'.repeat(24),
      },
    ]);
    expect(receipt.sites).toEqual([{ siteName: 'ce-site', siteUid: 'site-uid', physicalSiteUid: 'physical-uid' }]);
  }
  expect(JSON.stringify(receipt)).not.toContain('never-export');
});
test('keeps partial, erroneous, substituted, duplicate and unstable inventory unknown', async () => {
  for (const mode of [
    'partial',
    'camel-partial',
    'errors',
    'foreign',
    'conflict',
    'conflict-labels',
    'duplicate',
    'replaced',
    'wrong-node',
  ]) {
    const receipt = await collectCeTeardownInventory(fixture(mode), bindings, ['default'], {
      site: 'site-contract',
      ingress: 'ingress-contract',
    });
    expect(receipt.status).toBe('unknown');
    expect('resources' in receipt).toBe(false);
  }
});
test('validates owner, node and namespace scope and cancellation before requests', async () => {
  const api = {
    request: async () => {
      throw new Error('must not contact API');
    },
  };
  await expect(
    collectCeTeardownInventory(api, bindings, ['../escape'], { site: 'site', ingress: 'ingress' }),
  ).rejects.toThrow('scope');
  await expect(
    collectCeTeardownInventory(api, bindings, ['default'], { site: 'site', ingress: 'ingress' }, AbortSignal.abort()),
  ).rejects.toThrow();
});
