import { expect, test } from 'bun:test';
import { CeRuntime, type SiteBinding } from '../../src/ce/runtime';
import { VerifiedCeContract } from '../../src/ce/verified-contract';
import api from '../fixtures/forwarding-route-schema.json';
import { resolveCeSchemaFixture } from '../fixtures/resolve-schema-fixture';
import contract from '../fixtures/smsv2-contract-v7.json';
import compact from '../fixtures/smsv2-create-schema.json';

const schema = resolveCeSchemaFixture(compact);
type Json = Record<string, unknown>;
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
function harness(engine: 'native' | 'terraform', ha: boolean) {
  const nodes = Array.from({ length: ha ? 3 : 1 }, (_, i) => `node-${i + 1}`);
  const binding: SiteBinding = {
    owner: { deploymentId: 'ce-test', engine, provider: 'azure', account: 'demo', region: 'eastus' },
    siteName: 'ce-one',
    nodes,
  };
  const interfaces = nodes.flatMap((node, i) =>
    (['slo', 'sli'] as const).map((role, j) => ({
      node,
      role,
      mac: `02:00:00:00:00:${String(i * 2 + j + 1).padStart(2, '0')}`,
      device: j ? 'eth1' : 'eth0',
      interfaceName: `${node}-${role}`,
    })),
  );
  const expected = {
    siteUid: 'site-uuid',
    interfaces,
    routes: interfaces.map((v, i) => ({
      node: v.node,
      role: v.role,
      prefix: `10.${i + 1}.0.0/16`,
      routeType: 'STATIC_ROUTE' as const,
    })),
  };
  let uid = 'site-uuid',
    code = 200;
  const calls: { path: string; method: string; body?: Json }[] = [];
  let mutate = (_value: Json) => {};
  let after = () => {};
  const runtime = new CeRuntime(fixture(), engine, 'https://tenant.test', 'credential', async (url, init) => {
    const u = new URL(url);
    const body = init?.body ? (JSON.parse(String(init.body)) as Json) : undefined;
    calls.push({ path: u.pathname, method: init?.method ?? 'GET', ...(body ? { body } : {}) });
    if (u.pathname.includes('securemesh_site_v2s'))
      return Response.json({
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
        system_metadata: { uid },
      });
    const role = body?.slo ? 'slo' : 'sli',
      node = String(body?.node),
      route = expected.routes.find((v) => v.node === node && v.role === role);
    const value: Json = {
      ver_routes: [
        {
          node,
          route: [
            {
              prefix: route?.prefix,
              route_type: 'STATIC_ROUTE',
              flags: [],
              nexthop: { local: { interface: `${node}-${role}` } },
            },
          ],
        },
      ],
    };
    mutate(value);
    after();
    return Response.json(value, { status: code });
  });
  return {
    runtime,
    binding,
    expected,
    calls,
    set mutate(v: (value: Json) => void) {
      mutate = v;
    },
    set after(v: () => void) {
      after = v;
    },
    set uid(v: string) {
      uid = v;
    },
    set code(v: number) {
      code = v;
    },
  };
}
function row(v: Json): Json {
  return ((v.ver_routes as Json[])[0].route as Json[])[0];
}
for (const engine of ['native', 'terraform'] as const) {
  for (const ha of [false, true])
    test(`${engine} forwarding routes bind ${ha ? 'six' : 'two'} node/network observations without health or freshness inference`, async () => {
      const f = harness(engine, ha),
        result = await f.runtime.observeForwardingRoutes(f.binding, f.expected);
      expect(result).toMatchObject({
        status: 'observed',
        scope: 'reported-forwarding-interface',
        freshness: 'unqualified',
        interfaceNamespace: 'unqualified',
        operationalAcceptance: 'unknown',
      });
      expect(result.routes).toHaveLength(ha ? 6 : 2);
      if (result.status !== 'observed') throw Error('Forwarding fixture did not observe complete routes');
      expect(result.reads).toHaveLength(ha ? 6 : 2);
      expect(f.calls.filter((v) => v.method === 'POST')).toHaveLength(ha ? 6 : 2);
      expect(
        f.calls
          .filter((v) => v.method === 'POST')
          .every(
            (v) =>
              v.path.endsWith('/ver/simplified_routes') &&
              v.body?.family === 'INET4' &&
              v.body.namespace === 'system' &&
              v.body.site === 'ce-one',
          ),
      ).toBe(true);
      expect(f.calls.some((v) => v.method === 'PUT' || v.method === 'DELETE')).toBe(false);
    });
  for (const mode of [
    'partial',
    'duplicate-node',
    'foreign-node',
    'duplicate-prefix',
    'wrong-prefix',
    'malformed-prefix',
    'wrong-type',
    'missing-flags',
    'foreign-interface',
    'ambiguous-hop',
    'duplicate-hop',
    'tunnel',
    'drop',
    'next-page',
  ] as const)
    test(`${engine} ${mode} forwarding evidence stays unknown`, async () => {
      const f = harness(engine, true);
      f.mutate = (v) => {
        const r = row(v),
          nodes = v.ver_routes as Json[];
        if (mode === 'partial') v.ver_routes = [];
        if (mode === 'duplicate-node') nodes.push({ ...nodes[0] });
        if (mode === 'foreign-node') nodes[0].node = 'foreign';
        if (mode === 'duplicate-prefix') (nodes[0].route as Json[]).push({ ...r });
        if (mode === 'wrong-prefix') r.prefix = '192.0.2.0/24';
        if (mode === 'malformed-prefix') r.prefix = '10.1.0.1/16';
        if (mode === 'wrong-type') r.route_type = 'BGP_ROUTE';
        if (mode === 'missing-flags') delete r.flags;
        if (mode === 'foreign-interface') r.nexthop = { local: { interface: 'foreign' } };
        if (mode === 'ambiguous-hop')
          r.nexthop = { local: { interface: 'node-1-slo' }, subnet: { intf_name: 'node-1-slo' } };
        if (mode === 'duplicate-hop') {
          delete r.nexthop;
          r.ecmp = { members: [{ local: { interface: 'node-1-slo' } }, { local: { interface: 'node-1-slo' } }] };
        }
        if (mode === 'tunnel') r.nexthop = { tunnel: { ssl: { interface: 'node-1-slo' } } };
        if (mode === 'drop') r.nexthop = { drop: {} };
        if (mode === 'next-page') v.next_page_token = 'more';
      };
      expect(await f.runtime.observeForwardingRoutes(f.binding, f.expected)).toMatchObject({
        status: 'unknown',
        routes: [],
        freshness: 'unqualified',
        operationalAcceptance: 'unknown',
      });
    });
  test(`${engine} subnet nexthop preserves exact reported device matching separately from name namespace qualification`, async () => {
    const f = harness(engine, false);
    f.mutate = (v) => {
      row(v).nexthop = { subnet: { intf_name: 'eth0' } };
    };
    // Only SLO matches eth0; SLI must not silently reuse it.
    expect((await f.runtime.observeForwardingRoutes(f.binding, f.expected)).status).toBe('unknown');
  });
  for (const mode of [
    'uid-before',
    'uid-after',
    'partial-interfaces',
    'duplicate-interfaces',
    'foreign-owner',
    'unresolved-device',
    'caller-mutation',
  ] as const)
    test(`${engine} ${mode} forwarding identity`, async () => {
      const f = harness(engine, false);
      if (mode === 'uid-before') f.uid = 'foreign';
      if (mode === 'uid-after')
        f.after = () => {
          f.uid = 'foreign';
        };
      if (mode === 'partial-interfaces') f.expected.interfaces.pop();
      if (mode === 'duplicate-interfaces') f.expected.interfaces[1] = { ...f.expected.interfaces[0] };
      if (mode === 'foreign-owner') f.binding.owner.account = 'example-foreign';
      if (mode === 'unresolved-device') f.expected.interfaces[0].device = '__DEVICE__';
      if (mode === 'caller-mutation')
        f.after = () => {
          f.binding.siteName = 'foreign';
          f.expected.interfaces.length = 0;
        };
      expect((await f.runtime.observeForwardingRoutes(f.binding, f.expected)).status).toBe(
        mode === 'caller-mutation' ? 'observed' : 'unknown',
      );
    });
  for (const code of [401, 403, 404, 429, 503])
    test(`${engine} forwarding HTTP ${code} stays unknown`, async () => {
      const f = harness(engine, false);
      f.code = code;
      expect((await f.runtime.observeForwardingRoutes(f.binding, f.expected)).status).toBe('unknown');
    });
  test(`${engine} cancelled forwarding observation sends no request`, async () => {
    const f = harness(engine, false),
      c = new AbortController();
    c.abort();
    await expect(f.runtime.observeForwardingRoutes(f.binding, f.expected, c.signal)).rejects.toThrow();
    expect(f.calls).toEqual([]);
  });
}
test('forwarding request uses verified exact observational POST mapping', () => {
  expect(fixture().forwardingRouteRequest('ce-one', 'node-1', 'slo')).toEqual({
    method: 'POST',
    path: '/api/operate/namespaces/system/sites/ce-one/ver/simplified_routes',
    body: { namespace: 'system', site: 'ce-one', node: 'node-1', family: 'INET4', slo: {} },
  });
  const changed = structuredClone(api);
  changed.paths['/api/operate/namespaces/{namespace}/sites/{site}/ver/simplified_routes'].post.operationId +=
    '-foreign';
  expect(() => fixture(changed).forwardingRouteRequest('ce-one', 'node-1', 'slo')).toThrow();
});

for (const engine of ['native', 'terraform'] as const) {
  for (const kind of ['subnet-device', 'ecmp-name'] as const)
    test(`${engine} ${kind} forwarding readback retains explicit literal join`, async () => {
      const f = harness(engine, true);
      f.mutate = (value) => {
        const r = row(value),
          node = (value.ver_routes as Json[])[0].node;
        const wanted = f.expected.routes.find((v) => v.node === node && v.prefix === r.prefix);
        if (!wanted) throw Error('missing fixture route');
        if (kind === 'subnet-device') r.nexthop = { subnet: { intf_name: wanted.role === 'slo' ? 'eth0' : 'eth1' } };
        else {
          delete r.nexthop;
          r.ecmp = { members: [{ local: { interface: `${node}-${wanted.role}` } }] };
        }
        r.flags = ['Proxy ARP'];
      };
      const result = await f.runtime.observeForwardingRoutes(f.binding, f.expected);
      expect(result.status).toBe('observed');
      expect(result.routes).toHaveLength(6);
      expect(result.routes[0].interfaces[0].matchedFields).toEqual([
        kind === 'subnet-device' ? 'device' : 'interfaceName',
      ]);
      expect(result.interfaceNamespace).toBe('unqualified');
    });
  test(`${engine} ambiguous device versus generated interface name remains unknown`, async () => {
    const f = harness(engine, false);
    f.expected.interfaces[1].interfaceName = 'eth0';
    f.mutate = (value) => {
      row(value).nexthop = { local: { interface: 'eth0' } };
    };
    expect((await f.runtime.observeForwardingRoutes(f.binding, f.expected)).status).toBe('unknown');
  });
}

for (const mode of ['fetch', 'body'] as const)
  test(`forwarding observation bounds cancellation ignored by ${mode} transport`, async () => {
    const f = harness('terraform', false),
      controller = new AbortController();
    const runtime = new CeRuntime(fixture(), 'terraform', 'https://tenant.test', 'credential', async () => {
      if (mode === 'fetch') return new Promise<Response>(() => {});
      return new Response(new ReadableStream<Uint8Array>({ start() {} }));
    });
    const pending = runtime.observeForwardingRoutes(f.binding, f.expected, controller.signal);
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
