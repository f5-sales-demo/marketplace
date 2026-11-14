const vendorSystemNamespace = 'ves-system';

import { expect, test } from 'bun:test';
import { CeRuntime, type SiteBinding } from '../../src/ce/runtime';
import { VerifiedCeContract } from '../../src/ce/verified-contract';
import api from '../fixtures/component-catalog-schema.json';
import { resolveCeSchemaFixture } from '../fixtures/resolve-schema-fixture';
import contract from '../fixtures/smsv2-contract-v7.json';
import compact from '../fixtures/smsv2-create-schema.json';

type Json = Record<string, unknown>;
const schema = resolveCeSchemaFixture(compact);
type Constructor = new (...args: unknown[]) => VerifiedCeContract;
function fixture(document: Json = api) {
  const C = VerifiedCeContract as unknown as Constructor;
  return new C(
    schema.provenance.commit,
    `sha256:${'f'.repeat(64)}`,
    contract,
    schema.schemas,
    undefined,
    'published-release',
    undefined,
    document,
  );
}
function harness(engine: 'native' | 'terraform', ha = true, document: Json = api) {
  const binding: SiteBinding = {
    owner: { deploymentId: 'ce-test', engine, provider: 'azure', account: 'demo', region: 'eastus' },
    siteName: 'ce-one',
    nodes: ha ? ['node-one', 'node-two', 'node-three'] : ['node-one'],
  };
  const expected = { siteUid: 'site-uuid' };
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
  let response: unknown = { service: structuredClone(services) },
    code = 200;
  let onCatalog = (_read: number) => {};
  let siteReads = 0,
    catalogReads = 0;
  const calls: { path: string; method: string }[] = [];
  const runtime = new CeRuntime(
    fixture(document),
    engine,
    'https://tenant.test',
    'test-credential',
    async (url, init) => {
      const u = new URL(url);
      calls.push({ path: u.pathname + u.search, method: init?.method ?? 'GET' });
      expect(init?.headers).toHaveProperty('Authorization', 'APIToken test-credential');
      if (u.pathname.includes('securemesh_site_v2s')) {
        siteReads++;
        return Response.json(site);
      }
      onCatalog(++catalogReads);
      return Response.json(response, { status: code });
    },
  );
  return {
    binding,
    expected,
    site,
    services,
    runtime,
    calls,
    get siteReads() {
      return siteReads;
    },
    get catalogReads() {
      return catalogReads;
    },
    set response(v: unknown) {
      response = v;
    },
    set code(v: number) {
      code = v;
    },
    set onCatalog(v: (read: number) => void) {
      onCatalog = v;
    },
  };
}
for (const engine of ['native', 'terraform'] as const) {
  for (const ha of [false, true])
    test(`${engine} catalog uses exact owned single/HA node coverage and independent request`, async () => {
      const f = harness(engine, ha);
      const result = await f.runtime.observeComponentCatalog(f.binding, f.expected);
      expect(result).toMatchObject({
        status: 'observed',
        scope: 'component-catalog',
        freshness: 'unqualified',
        nodeHealth: 'unknown',
        statusNamespace: 'unqualified',
        siteUid: 'site-uuid',
      });
      expect(result.services).toHaveLength(f.services.length);
      expect(f.siteReads).toBe(2);
      expect(f.catalogReads).toBe(2);
      expect(f.calls.filter((v) => v.path.endsWith('/list-service'))).toHaveLength(2);
      expect(f.calls.every((v) => v.method === 'GET')).toBe(true);
      expect(result.services).toContainEqual({ node: 'node-one', name: 'F5XC Platform Manager', value: 'vpm' });
      expect(result).not.toHaveProperty('sampleTimestamp');
      expect(result).not.toHaveProperty('readiness');
    });
  for (const mode of [
    'missing',
    'empty',
    'partial-node',
    'duplicate',
    'foreign-node',
    'missing-value',
    'missing-name',
    'empty-name',
    'unresolved-value',
    'malformed-row',
    'extra-row-field',
    'pagination',
    'malformed-envelope',
  ] as const)
    test(`${engine} ${mode} service catalog remains unknown`, async () => {
      const f = harness(engine);
      const rows: Json[] = structuredClone(f.services);
      let response: unknown = { service: rows };
      if (mode === 'missing') response = {};
      if (mode === 'empty') rows.splice(0);
      if (mode === 'partial-node') rows.splice(-2);
      if (mode === 'duplicate') rows[1] = { ...rows[0] };
      if (mode === 'foreign-node') rows[0].node = 'foreign';
      if (mode === 'missing-value') delete rows[0].value;
      if (mode === 'missing-name') delete rows[0].name;
      if (mode === 'empty-name') rows[0].name = '';
      if (mode === 'unresolved-value') rows[0].value = '__SERVICE__';
      if (mode === 'malformed-row') response = { service: [null] };
      if (mode === 'extra-row-field') rows[0].namespace = vendorSystemNamespace;
      if (mode === 'pagination') response = { service: rows, nextLink: 'next' };
      if (mode === 'malformed-envelope') response = [];
      f.response = response;
      const result = await f.runtime.observeComponentCatalog(f.binding, f.expected);
      expect(result.status).toBe('unknown');
      expect(result.services).toEqual([]);
    });
  for (const code of [401, 403, 404, 429, 500, 503])
    test(`${engine} catalog HTTP ${code} remains unknown`, async () => {
      const f = harness(engine);
      f.code = code;
      const result = await f.runtime.observeComponentCatalog(f.binding, f.expected);
      expect(result.status).toBe('unknown');
      expect(result.services).toEqual([]);
    });
  for (const mode of [
    'foreign-uid',
    'foreign-owner',
    'changed-site',
    'changed-catalog',
    'caller-input',
    'reordered',
  ] as const)
    test(`${engine} ${mode} catalog identity sandwich`, async () => {
      const f = harness(engine);
      if (mode === 'foreign-uid') f.expected.siteUid = 'foreign';
      if (mode === 'foreign-owner') f.site.metadata.labels['xcsh-ce-account'] = 'foreign';
      f.onCatalog = (read) => {
        if (mode === 'changed-site') f.site.system_metadata.uid = 'new';
        if (mode === 'changed-catalog' && read === 2)
          f.response = { service: f.services.map((v, i) => (i === 0 ? { ...v, value: 'other' } : v)) };
        if (mode === 'caller-input') {
          f.expected.siteUid = 'foreign';
          f.binding.nodes.splice(0);
          f.binding.owner.account = 'example-foreign';
        }
        if (mode === 'reordered' && read === 2) f.response = { service: structuredClone(f.services).reverse() };
      };
      const result = await f.runtime.observeComponentCatalog(f.binding, f.expected);
      expect(result.status).toBe(['caller-input', 'reordered'].includes(mode) ? 'observed' : 'unknown');
      if (mode === 'caller-input')
        expect(result).toMatchObject({
          siteUid: 'site-uuid',
          owner: { account: 'demo' },
          nodes: ['node-one', 'node-two', 'node-three'],
        });
    });
  for (const phase of ['fetch', 'body'] as const)
    test(`${engine} abort bounds ignored catalog ${phase}`, async () => {
      const f = harness(engine);
      const runtime = new CeRuntime(fixture(), engine, 'https://tenant.test', 'test-credential', async (url) =>
        new URL(url).pathname.includes('securemesh_site_v2s')
          ? Response.json(f.site)
          : phase === 'fetch'
            ? new Promise<Response>(() => {})
            : new Response(new ReadableStream({ start() {} }), { headers: { 'Content-Type': 'application/json' } }),
      );
      await expect(runtime.observeComponentCatalog(f.binding, f.expected, AbortSignal.timeout(20))).rejects.toThrow();
    });
}

for (const mode of ['operation', 'parameter', 'missing-parameter', 'response', 'field-type', 'array-items'] as const) {
  test(`incompatible pinned catalog ${mode} mapping makes no tenant request`, async () => {
    const document = structuredClone(api),
      operation = document.paths['/api/operate/namespaces/{namespace}/sites/{site}/vpm/debug/global/list-service'].get;
    if (mode === 'operation') operation.operationId = 'unsupported';
    if (mode === 'parameter') operation.parameters[0].in = 'query';
    if (mode === 'missing-parameter') operation.parameters.pop();
    if (mode === 'response')
      operation.responses['200'].content['application/json'].schema.$ref = '#/components/schemas/foreign';
    if (mode === 'field-type') document.components.schemas.debugService.properties.value.type = 'number';
    if (mode === 'array-items')
      document.components.schemas.debugListServicesResponse.properties.service.items.$ref =
        '#/components/schemas/foreign';
    const f = harness('terraform', true, document);
    const result = await f.runtime.observeComponentCatalog(f.binding, f.expected);
    expect(result.status).toBe('unknown');
    expect(f.calls).toEqual([]);
  });
}
test('catalog preserves exact service spelling and formal display names instead of inferred naming constraints', async () => {
  const f = harness('terraform', false);
  f.response = {
    service: [
      {
        node: 'node-one',
        value: 'VPM',
        name: 'F5XC Platform Manager with a formal display name longer than sixty-three characters',
      },
    ],
  };
  const result = await f.runtime.observeComponentCatalog(f.binding, f.expected);
  expect(result.status).toBe('observed');
  expect(result.services).toEqual([
    {
      node: 'node-one',
      value: 'VPM',
      name: 'F5XC Platform Manager with a formal display name longer than sixty-three characters',
    },
  ]);
});
test('pre-aborted catalog request makes no tenant request', async () => {
  const f = harness('native');
  const abort = new AbortController();
  abort.abort(Error('cancelled'));
  await expect(f.runtime.observeComponentCatalog(f.binding, f.expected, abort.signal)).rejects.toThrow();
  expect(f.calls).toEqual([]);
});
