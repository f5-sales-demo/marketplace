import { expect, test } from 'bun:test';
import { CeRuntime, type SiteBinding } from '../../src/ce/runtime';
import { VerifiedCeContract } from '../../src/ce/verified-contract';
import catalogApi from '../fixtures/component-catalog-schema.json';
import statusApi from '../fixtures/component-status-schema.json';
import { resolveCeSchemaFixture } from '../fixtures/resolve-schema-fixture';
import contract from '../fixtures/smsv2-contract-v7.json';
import compact from '../fixtures/smsv2-create-schema.json';

type Json = Record<string, unknown>;
type Constructor = new (...args: unknown[]) => VerifiedCeContract;
const schema = resolveCeSchemaFixture(compact);
function harness(engine: 'native' | 'terraform', ha = true) {
  const C = VerifiedCeContract as unknown as Constructor;
  const api = {
    paths: { ...catalogApi.paths, ...statusApi.paths },
    components: { schemas: { ...catalogApi.components.schemas, ...statusApi.components.schemas } },
  };
  const verified = new C(
    schema.provenance.commit,
    `sha256:${'f'.repeat(64)}`,
    contract,
    schema.schemas,
    undefined,
    'published-release',
    undefined,
    api,
  );
  const binding: SiteBinding = {
    owner: { deploymentId: 'ce-test', engine, provider: 'azure', account: 'demo', region: 'eastus' },
    siteName: 'ce-one',
    nodes: ha ? ['node-one', 'node-two', 'node-three'] : ['node-one'],
  };
  const expected = { siteUid: 'site-uuid', vesNamespace: 'ves-system' };
  const site = {
    metadata: {
      name: 'ce-one',
      namespace: 'system',
      labels: {
        'xcsh-ce-deployment': 'ce-test',
        'xcsh-ce-engine': engine,
        'xcsh-ce-provider': 'azure',
        'xcsh-ce-account': 'demo',
        'xcsh-ce-region': 'eastus',
      },
    },
    system_metadata: { uid: 'site-uuid' },
  };
  const services = binding.nodes.flatMap((node) => [
    { node, name: 'F5XC Platform Manager', value: 'vpm' },
    { node, name: 'F5XC Virtual Edge Router', value: 'ver' },
  ]);
  let catalog: unknown = { service: structuredClone(services) };
  let status: unknown = {
    status: services.map(({ node, value }) => ({ node, name: value, status: 'Ready', message: '' })),
  };
  let onRead = (_kind: 'site' | 'catalog' | 'status', _count: number) => {};
  const counts = { site: 0, catalog: 0, status: 0 },
    calls: { path: string; method: string }[] = [];
  const runtime = new CeRuntime(verified, engine, 'https://tenant.test', 'test-credential', async (url, init) => {
    const path = new URL(url).pathname + new URL(url).search;
    calls.push({ path, method: init?.method ?? 'GET' });
    expect(init?.headers).toHaveProperty('Authorization', 'APIToken test-credential');
    const kind = path.includes('securemesh_site_v2s') ? 'site' : path.endsWith('/list-service') ? 'catalog' : 'status';
    onRead(kind, ++counts[kind]);
    return Response.json(kind === 'site' ? site : kind === 'catalog' ? catalog : status);
  });
  return {
    verified,
    runtime,
    binding,
    expected,
    site,
    services,
    counts,
    calls,
    set catalog(v: unknown) {
      catalog = v;
    },
    set status(v: unknown) {
      status = v;
    },
    set onRead(v: typeof onRead) {
      onRead = v;
    },
  };
}
for (const engine of ['native', 'terraform'] as const) {
  for (const ha of [false, true])
    test(`${engine} single/HA readiness derives complete expected services from independent catalog`, async () => {
      const f = harness(engine, ha);
      const result = await f.runtime.observeCataloguedComponentStatus(f.binding, f.expected);
      expect(result).toMatchObject({
        status: 'observed',
        readiness: 'ready',
        scope: 'catalogued-component-readiness',
        nodeHealth: 'unknown',
        freshness: 'unqualified',
        statusNamespace: 'ves-system',
        siteUid: 'site-uuid',
      });
      expect(result.components).toHaveLength(f.services.length);
      expect(result.catalog).toEqual(
        f.services.toSorted((a, b) =>
          JSON.stringify([a.node, a.value]).localeCompare(JSON.stringify([b.node, b.value])),
        ),
      );
      expect(f.counts.catalog).toBe(4);
      expect(f.counts.status).toBe(1);
      expect(f.counts.site).toBe(6);
      expect(f.calls.every((v) => v.method === 'GET')).toBe(true);
      expect(result).not.toHaveProperty('sampleTimestamp');
    });
  for (const mode of [
    'partial-status',
    'duplicate-status',
    'formal-name-status',
    'extra-status',
    'foreign-node',
    'down-status',
    'changed-catalog',
    'changed-display',
    'empty-catalog',
    'foreign-site',
    'changed-site',
    'unsafe-namespace',
    'wrong-engine',
  ] as const)
    test(`${engine} ${mode} catalogue/status evidence remains unknown`, async () => {
      const f = harness(engine);
      const rows: Json[] = f.services.map(({ node, value }) => ({ node, name: value, status: 'Ready', message: '' }));
      if (mode === 'partial-status') rows.pop();
      if (mode === 'duplicate-status') rows[1] = { ...rows[0] };
      if (mode === 'formal-name-status') rows[0].name = f.services[0].name;
      if (mode === 'extra-status') rows.push({ node: 'node-one', name: 'other', status: 'Ready', message: '' });
      if (mode === 'foreign-node') rows[0].node = 'foreign';
      if (mode === 'down-status') rows[0].status = 'Unready';
      f.status = { status: rows };
      if (mode === 'empty-catalog') f.catalog = { service: [] };
      if (mode === 'foreign-site') f.site.system_metadata.uid = 'foreign';
      if (mode === 'unsafe-namespace') f.expected.vesNamespace = '../other';
      if (mode === 'wrong-engine') f.binding.owner.engine = engine === 'native' ? 'terraform' : 'native';
      f.onRead = (kind, count) => {
        if (kind === 'status' && mode === 'changed-site') f.site.system_metadata.uid = 'new';
        if (kind === 'catalog' && count === 3 && ['changed-catalog', 'changed-display'].includes(mode))
          f.catalog = {
            service: f.services.map((v, i) =>
              i === 0
                ? { ...v, ...(mode === 'changed-display' ? { name: 'Renamed display' } : { value: 'other' }) }
                : v,
            ),
          };
      };
      const result = await f.runtime.observeCataloguedComponentStatus(f.binding, f.expected);
      expect(result.status).toBe('unknown');
      expect(result.readiness).toBe('unknown');
      expect(result.components).toEqual([]);
    });
  test(`${engine} caller mutation cannot change captured catalog/status scope`, async () => {
    const f = harness(engine);
    f.onRead = (kind) => {
      if (kind === 'catalog') {
        f.binding.nodes.splice(0);
        f.binding.owner.account = 'example-foreign';
        f.expected.siteUid = 'foreign';
        f.expected.vesNamespace = 'other';
      }
    };
    const result = await f.runtime.observeCataloguedComponentStatus(f.binding, f.expected);
    expect(result.status).toBe('observed');
    expect(result).toMatchObject({ siteUid: 'site-uuid', statusNamespace: 'ves-system', owner: { account: 'demo' } });
  });
  test(`${engine} pre-aborted catalogue/status scope does not read`, async () => {
    const f = harness(engine);
    const abort = new AbortController();
    abort.abort(Error('cancelled'));
    await expect(f.runtime.observeCataloguedComponentStatus(f.binding, f.expected, abort.signal)).rejects.toThrow();
    expect(f.calls).toEqual([]);
  });
}

for (const engine of ['native', 'terraform'] as const) {
  for (const failure of [401, 403, 429, 503, 'malformed'] as const)
    test(`${engine} authentic status ${failure} cannot qualify catalogued readiness`, async () => {
      const f = harness(engine);
      let statusReads = 0;
      const runtime = new CeRuntime(f.verified, engine, 'https://tenant.test', 'test-credential', async (url) => {
        const path = new URL(url).pathname;
        if (path.includes('securemesh_site_v2s')) return Response.json(f.site);
        if (path.endsWith('/list-service')) return Response.json({ service: f.services });
        statusReads++;
        return failure === 'malformed'
          ? new Response('not-json', { headers: { 'Content-Type': 'application/json' } })
          : Response.json({ status: [] }, { status: failure });
      });
      const result = await runtime.observeCataloguedComponentStatus(f.binding, f.expected);
      expect(result.status).toBe('unknown');
      expect(result.components).toEqual([]);
      expect(statusReads).toBe(1);
    });
  for (const phase of ['catalog-fetch', 'catalog-body', 'status-fetch', 'status-body'] as const)
    test(`${engine} total scope deadline bounds ignored ${phase}`, async () => {
      const f = harness(engine);
      let stalled = 0;
      const runtime = new CeRuntime(f.verified, engine, 'https://tenant.test', 'test-credential', async (url) => {
        const path = new URL(url).pathname;
        if (path.includes('securemesh_site_v2s')) return Response.json(f.site);
        const kind = path.endsWith('/list-service') ? 'catalog' : 'status';
        if (phase.startsWith(kind)) {
          stalled++;
          return phase.endsWith('fetch')
            ? new Promise<Response>(() => {})
            : new Response(new ReadableStream({ start() {} }), { headers: { 'Content-Type': 'application/json' } });
        }
        return Response.json(
          kind === 'catalog'
            ? { service: f.services }
            : { status: f.services.map(({ node, value }) => ({ node, name: value, status: 'Ready', message: '' })) },
        );
      });
      await expect(
        runtime.observeCataloguedComponentStatus(f.binding, f.expected, AbortSignal.timeout(20)),
      ).rejects.toThrow();
      expect(stalled).toBe(1);
    });
}
