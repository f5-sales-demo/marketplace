import { expect, test } from 'bun:test';
import { CeRuntime, type SiteBinding } from '../../src/ce/runtime';
import { VerifiedCeContract } from '../../src/ce/verified-contract';
import api from '../fixtures/component-status-schema.json';
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
function harness(engine: 'native' | 'terraform') {
  const binding: SiteBinding = {
    owner: { deploymentId: 'ce-test', engine, provider: 'azure', account: 'demo', region: 'eastus' },
    siteName: 'ce-one',
    nodes: ['node-one', 'node-two', 'node-three'],
  };
  const expected = {
    siteUid: 'site-uuid',
    vesNamespace: 'ves-system',
    services: binding.nodes.flatMap((node) => ['ver', 'vpm'].map((name) => ({ node, name }))),
  };
  const site = {
    metadata: {
      name: binding.siteName,
      namespace: 'system',
      labels: {
        'xcsh-ce-deployment': 'ce-test',
        'xcsh-ce-engine': engine,
        'xcsh-ce-provider': 'azure',
        'xcsh-ce-account': 'demo',
        'xcsh-ce-region': 'eastus',
      },
    },
    system_metadata: { uid: expected.siteUid },
  };
  let response: unknown = { status: expected.services.map((v) => ({ ...v, status: 'Ready', message: '' })) };
  let code = 200,
    siteReads = 0;
  const calls: { path: string; method: string }[] = [];
  let onStatus = () => {};
  const runtime = new CeRuntime(fixture(), engine, 'https://tenant.test', 'test-credential', async (url, init) => {
    const u = new URL(url);
    calls.push({ path: u.pathname + u.search, method: init?.method ?? 'GET' });
    expect(init?.headers).toHaveProperty('Authorization', 'APIToken test-credential');
    if (u.pathname.includes('securemesh_site_v2s')) {
      siteReads++;
      return Response.json(site);
    }
    onStatus();
    return Response.json(response, { status: code });
  });
  return {
    binding,
    expected,
    site,
    runtime,
    calls,
    get siteReads() {
      return siteReads;
    },
    set response(v: unknown) {
      response = v;
    },
    set code(v: number) {
      code = v;
    },
    set onStatus(v: () => void) {
      onStatus = v;
    },
  };
}
for (const engine of ['native', 'terraform'] as const) {
  test(`${engine} actual runtime collects exact complete service readiness with owned UID sandwich`, async () => {
    const f = harness(engine);
    const result = await f.runtime.observeComponentStatus(f.binding, f.expected);
    expect(result).toMatchObject({
      status: 'observed',
      readiness: 'ready',
      freshness: 'unqualified',
      nodeHealth: 'unknown',
      scope: 'component-readiness',
      siteUid: 'site-uuid',
    });
    expect(result.components).toHaveLength(6);
    expect(f.siteReads).toBe(2);
    expect(f.calls).toContainEqual({
      path: '/api/operate/namespaces/system/sites/ce-one/vpm/debug/global/ves-system/status?cached=false',
      method: 'GET',
    });
    expect(f.calls.every((v) => v.method === 'GET')).toBe(true);
    expect(result).not.toHaveProperty('sampleTimestamp');
  });
  for (const mode of [
    'missing',
    'partial',
    'duplicate',
    'foreign-node',
    'foreign-service',
    'missing-state',
    'unrecognized-state',
    'wrong-case',
    'missing-message',
    'malformed-row',
    'extra-row-field',
  ] as const) {
    test(`${engine} ${mode} service evidence remains unknown`, async () => {
      const f = harness(engine);
      const rows: Json[] = f.expected.services.map((v) => ({ ...v, status: 'Ready', message: '' }));
      if (mode === 'partial') rows.pop();
      if (mode === 'duplicate') rows[1] = { ...rows[0] };
      if (mode === 'foreign-node') rows[0].node = 'foreign';
      if (mode === 'foreign-service') rows[0].name = 'foreign';
      if (mode === 'missing-state') delete rows[0].status;
      if (mode === 'unrecognized-state') rows[0].status = 'Stopped';
      if (mode === 'wrong-case') rows[0].status = 'ready';
      if (mode === 'missing-message') delete rows[0].message;
      if (mode === 'extra-row-field') rows[0].timestamp = new Date().toISOString();
      f.response = mode === 'missing' ? {} : mode === 'malformed-row' ? { status: [null] } : { status: rows };
      expect(await f.runtime.observeComponentStatus(f.binding, f.expected)).toMatchObject({
        status: 'unknown',
        readiness: 'unknown',
        components: [],
        nodeHealth: 'unknown',
        freshness: 'unqualified',
      });
    });
  }
  for (const mode of [
    'initial-uid',
    'final-uid',
    'foreign-owner',
    'partial-expected',
    'duplicate-expected',
    'unsafe-namespace',
    'wrong-engine',
  ] as const) {
    test(`${engine} ${mode} identity cannot qualify readiness`, async () => {
      const f = harness(engine);
      if (mode === 'initial-uid') f.site.system_metadata.uid = 'foreign';
      if (mode === 'final-uid')
        f.onStatus = () => {
          f.site.system_metadata.uid = 'foreign';
        };
      if (mode === 'foreign-owner') f.site.metadata.labels['xcsh-ce-deployment'] = 'foreign';
      if (mode === 'partial-expected') f.expected.services = f.expected.services.filter((v) => v.node !== 'node-three');
      if (mode === 'duplicate-expected') f.expected.services.push({ ...f.expected.services[0] });
      if (mode === 'unsafe-namespace') f.expected.vesNamespace = '../foreign';
      if (mode === 'wrong-engine') f.binding.owner.engine = engine === 'native' ? 'terraform' : 'native';
      const result = await f.runtime.observeComponentStatus(f.binding, f.expected);
      expect(result.status).toBe('unknown');
      expect(result.components).toEqual([]);
    });
  }
  for (const code of [401, 403, 404, 429, 503])
    test(`${engine} HTTP ${code} remains unknown`, async () => {
      const f = harness(engine);
      f.code = code;
      expect(await f.runtime.observeComponentStatus(f.binding, f.expected)).toMatchObject({
        status: 'unknown',
        components: [],
      });
    });
  test(`${engine} caller mutation does not change captured expectation`, async () => {
    const f = harness(engine);
    f.onStatus = () => {
      f.expected.services.length = 0;
      f.binding.siteName = 'foreign';
    };
    expect(await f.runtime.observeComponentStatus(f.binding, f.expected)).toMatchObject({
      status: 'observed',
      siteName: 'ce-one',
    });
  });
  test(`${engine} cancellation propagates`, async () => {
    const f = harness(engine),
      controller = new AbortController();
    controller.abort();
    await expect(f.runtime.observeComponentStatus(f.binding, f.expected, controller.signal)).rejects.toThrow();
    expect(f.calls).toEqual([]);
  });
}
test('exact pinned schema maps request and rejects incompatible component status schema', () => {
  expect(fixture().componentStatusRequest('ce-one', 'ves-system')).toEqual({
    method: 'GET',
    path: '/api/operate/namespaces/system/sites/ce-one/vpm/debug/global/ves-system/status?cached=false',
  });
  const changed = structuredClone(api);
  changed.components.schemas.debugStatus.properties.status.type = 'boolean';
  expect(() => fixture(changed).componentStatusRequest('ce-one', 'ves-system')).toThrow();
});

for (const mode of ['operation', 'response', 'cached', 'row-field', 'array-items'] as const) {
  test(`incompatible pinned ${mode} mapping cannot build a request`, () => {
    const document = structuredClone(api);
    const operation =
      document.paths['/api/operate/namespaces/{namespace}/sites/{site}/vpm/debug/global/{vesnamespace}/status'].get;
    if (mode === 'operation') operation.operationId += '-foreign';
    if (mode === 'response') operation.responses['200'].content['application/json'].schema.$ref += '-foreign';
    if (mode === 'cached') operation.parameters[3].schema.type = 'string';
    if (mode === 'row-field') document.components.schemas.debugStatus.properties.node.type = 'boolean';
    if (mode === 'array-items')
      document.components.schemas.debugStatusResponse.properties.status.items.$ref += '-foreign';
    expect(() => fixture(document).componentStatusRequest('ce-one', 'ves-system')).toThrow();
  });
}

for (const mode of ['fetch', 'body'] as const)
  test(`component status bounds cancellation ignored by ${mode} transport`, async () => {
    const f = harness('terraform'),
      controller = new AbortController();
    const runtime = new CeRuntime(fixture(), 'terraform', 'https://tenant.test', 'credential', async () => {
      if (mode === 'fetch') return new Promise<Response>(() => {});
      return new Response(new ReadableStream<Uint8Array>({ start() {} }));
    });
    const pending = runtime.observeComponentStatus(f.binding, f.expected, controller.signal);
    const timer = setTimeout(() => controller.abort(Error('cancelled')), 10);
    try {
      const cancelled = await Promise.race([
        pending.then(
          () => false,
          () => true,
        ),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 100)),
      ]);
      expect(cancelled).toBe(true);
    } finally {
      clearTimeout(timer);
    }
  });
