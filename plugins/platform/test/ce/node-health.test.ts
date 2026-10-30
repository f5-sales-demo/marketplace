import { expect, test } from 'bun:test';
import { nodeHealthRequest, parseNodeHealthJson } from '../../src/ce/node-health';
import { CeRuntime, type SiteBinding } from '../../src/ce/runtime';
import { VerifiedCeContract } from '../../src/ce/verified-contract';
import api from '../fixtures/node-health-schema.json';
import { resolveCeSchemaFixture } from '../fixtures/resolve-schema-fixture';
import contract from '../fixtures/smsv2-contract-v7.json';
import compact from '../fixtures/smsv2-create-schema.json';

type Json = Record<string, unknown>;
function fixture(document: Json = api) {
  const C = VerifiedCeContract as unknown as new (...args: unknown[]) => VerifiedCeContract;
  const schema = resolveCeSchemaFixture(compact);
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
function harness(engine: 'native' | 'terraform', ha = false) {
  const binding: SiteBinding = {
    owner: { deploymentId: 'ce-test', engine, provider: 'azure', account: 'demo', region: 'eastus' },
    siteName: 'ce-one',
    nodes: ha ? ['node-one', 'node-two', 'node-three'] : ['node-one'],
  };
  const expected = {
    siteUid: 'site-uuid',
    node: 'node-one',
    expectedFqdn: 'node-one.ce.example.test',
    instances: Object.fromEntries(binding.nodes.map((node, i) => [node, `vm-${i}`])),
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
  const health: Json = {
    hostname: expected.node,
    fqdn: expected.expectedFqdn,
    state: 'PROVISIONED',
    roles: ['k8s-master-primary'],
    software_version: 'software-example',
    os_version: 'os-example',
    version: 'vpm-example',
  };
  const registrations = {
    items: binding.nodes.map((node, i) => ({
      name: `r-node-${i}`,
      get_spec: {
        passport: { cluster_name: binding.siteName, cluster_size: binding.nodes.length },
        infra: { hostname: node, instance_id: expected.instances[node] },
      },
      object: { status: { current_state: 'ONLINE' } },
    })),
  };
  const calls: { path: string; method: string; body?: unknown }[] = [];
  const state = {
    code: 200,
    returnCode: 0,
    output: '',
    outer: '',
    onExec: () => {},
    onRegistration: () => {},
    hanging: false,
  };
  const runtime = new CeRuntime(fixture(), engine, 'https://tenant.test', 'test-credential', async (url, init) => {
    const path = new URL(url).pathname;
    calls.push({ path, method: init?.method ?? 'GET', ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
    expect(init?.headers).toHaveProperty('Authorization', 'APIToken test-credential');
    if (path.includes('securemesh_site_v2s')) return Response.json(site);
    if (path.includes('registrations_by_site')) {
      state.onRegistration();
      return Response.json(registrations);
    }
    state.onExec();
    if (state.hanging) return new Promise<Response>(() => {});
    if (state.outer) return new Response(state.outer, { status: state.code });
    return Response.json(
      { return_code: state.returnCode, output: state.output || JSON.stringify(health) },
      { status: state.code },
    );
  });
  const run = (signal?: AbortSignal) => runtime.observeNodeHealth(binding, expected, signal);
  return { binding, expected, site, health, registrations, calls, state, runtime, run };
}

test('node health builds only the exact lower-privilege built-in command from mapped schemas', () => {
  expect(nodeHealthRequest(api, 'ce-one', 'node-one')).toEqual({
    method: 'POST',
    path: '/api/operate/namespaces/system/sites/ce-one/vpm/debug/node-one/exec-user',
    body: { command: ['health'] },
    timeoutMs: 15000,
  });
  expect(fixture().nodeHealthRequest('ce-one', 'node-one')).toEqual(nodeHealthRequest(api, 'ce-one', 'node-one'));
});
for (const fault of [
  'operation',
  'parameter',
  'request',
  'response',
  'command',
  'return-code',
  'health-state',
  'missing-ref',
])
  test(`unqualified ${fault} schema rejects before request`, () => {
    const changed = structuredClone(api),
      operation = changed.paths['/api/operate/namespaces/{namespace}/sites/{site}/vpm/debug/{node}/exec-user'].post;
    if (fault === 'operation') operation.operationId += '-foreign';
    if (fault === 'parameter') operation.parameters[0].required = false;
    if (fault === 'request') operation.requestBody.content['application/json'].schema.$ref += '-foreign';
    if (fault === 'response') operation.responses['200'].content['application/json'].schema.$ref += '-foreign';
    if (fault === 'command') changed.components.schemas.debugExecRequest.properties.command.items.type = 'boolean';
    if (fault === 'return-code') changed.components.schemas.debugExecResponse.properties.return_code.type = 'string';
    if (fault === 'health-state')
      (changed.components.schemas.debugHealthResponse.properties.state as Json).type = 'boolean';
    if (fault === 'missing-ref')
      delete (changed.components.schemas as Json)[
        Object.keys(changed.components.schemas).find((key) => key.startsWith('siteOsInfo')) ?? ''
      ];
    expect(() => nodeHealthRequest(changed, 'ce-one', 'node-one')).toThrow();
  });
for (const node of ['global', 'all', 'undefined', 'null', '../node', 'node;id'])
  test(`unresolved or unsafe ${node} selector cannot execute`, () => {
    expect(() => nodeHealthRequest(api, 'ce-one', node)).toThrow();
  });
test('health JSON preserves literal keys and rejects duplicates at every nesting level', () => {
  expect(parseNodeHealthJson('{"nested":{"x":1},"value":"a\\"b"}')).toEqual({ nested: { x: 1 }, value: 'a"b' });
  for (const raw of [
    '{"state":"FAILED","state":"PROVISIONED"}',
    '{"state":"FAILED","st\\u0061te":"PROVISIONED"}',
    '{"x":{"a":1,"a":2}}',
    '{"roles":[{"x":1,"x":2}]}',
    '{"x":NaN}',
    '{"x":Infinity}',
    '{"x":1e400}',
    '{} {}',
  ])
    expect(() => parseNodeHealthJson(raw)).toThrow();
});
for (const engine of ['native', 'terraform'] as const) {
  for (const ha of [false, true])
    test(`${engine} selected-node ${ha ? 'HA' : 'single'} readiness retains identity and does not qualify interface freshness`, async () => {
      const f = harness(engine, ha),
        result = await f.run();
      expect(result).toMatchObject({
        status: 'observed',
        readiness: 'ready',
        scope: 'selected-node-vpm-readiness',
        node: f.expected.node,
        siteUid: f.expected.siteUid,
        fqdn: f.expected.expectedFqdn,
        instanceId: 'vm-0',
        registration: 'r-node-0',
        originalSampleFreshness: 'unqualified',
        canSatisfyInterfaceMutationGate: false,
        allNodeHealthQualified: false,
        routingTrafficQualified: false,
      });
      expect(f.calls.filter((v) => v.method === 'POST')).toEqual([
        {
          path: '/api/operate/namespaces/system/sites/ce-one/vpm/debug/node-one/exec-user',
          method: 'POST',
          body: { command: ['health'] },
        },
      ]);
      expect(f.calls.filter((v) => v.path.includes('registrations_by_site'))).toHaveLength(2);
      expect(JSON.stringify(result)).not.toContain('test-credential');
      expect(result).not.toHaveProperty('output');
    });
  for (const state of ['WAITING_FOR_CONFIG', 'WAITING_FOR_APPROVAL', 'PROVISIONING', 'FAILED', 'RESETTING'])
    test(`${engine} explicit ${state} remains observed not-ready`, async () => {
      const f = harness(engine);
      f.health.state = state;
      expect(await f.run()).toMatchObject({ status: 'observed', readiness: 'not-ready', state });
    });
  for (const fault of ['uid', 'owner', 'instance', 'offline', 'partial', 'duplicate', 'fqdn', 'node'])
    test(`${engine} unresolved ${fault} binding makes no command request`, async () => {
      const f = harness(engine, true);
      if (fault === 'uid') f.site.system_metadata.uid = 'foreign';
      if (fault === 'owner') f.site.metadata.labels['xcsh-ce-deployment'] = 'foreign';
      if (fault === 'instance') f.expected.instances['node-one'] = 'foreign';
      if (fault === 'offline') f.registrations.items[0].object.status.current_state = 'UPGRADING';
      if (fault === 'partial') f.registrations.items.pop();
      if (fault === 'duplicate') f.registrations.items.push(f.registrations.items[0]);
      if (fault === 'fqdn') f.expected.expectedFqdn = 'foreign.ce.example.test';
      if (fault === 'node') f.expected.node = 'global';
      expect(await f.run()).toMatchObject({ status: 'unknown', readiness: 'unknown' });
      expect(f.calls.some((v) => v.method === 'POST')).toBe(false);
    });
  for (const fault of ['uid', 'instance', 'registration', 'offline'])
    test(`${engine} changed ${fault} after node request invalidates observation`, async () => {
      const f = harness(engine);
      f.state.onExec = () => {
        if (fault === 'uid') f.site.system_metadata.uid = 'changed';
        if (fault === 'instance') f.registrations.items[0].get_spec.infra.instance_id = 'changed';
        if (fault === 'registration') f.registrations.items[0].name = 'r-changed';
        if (fault === 'offline') f.registrations.items[0].object.status.current_state = 'UPGRADING';
      };
      expect(await f.run()).toMatchObject({ status: 'unknown', readiness: 'unknown' });
    });
  for (const fault of [
    'hostname',
    'fqdn',
    'state',
    'roles',
    'version',
    'optional-schema',
    'return-code',
    'malformed',
    'duplicate-output',
    'duplicate-envelope',
  ])
    test(`${engine} ${fault} response remains unknown with no privileged fallback`, async () => {
      const f = harness(engine);
      if (fault === 'hostname') f.health.hostname = 'foreign';
      if (fault === 'fqdn') f.health.fqdn = 'node-one.foreign.test';
      if (fault === 'state') f.health.state = 'UNKNOWN';
      if (fault === 'roles') f.health.roles = ['primary', 'primary'];
      if (fault === 'version') delete f.health.software_version;
      if (fault === 'optional-schema') f.health.initial_password_changed = 'true';
      if (fault === 'return-code') f.state.returnCode = 1;
      if (fault === 'malformed') f.state.output = 'SECRET_SENTINEL not json';
      if (fault === 'duplicate-output') f.state.output = '{"state":"FAILED","state":"PROVISIONED"}';
      if (fault === 'duplicate-envelope') f.state.outer = '{"return_code":1,"return_code":0,"output":"{}"}';
      const result = await f.run();
      expect(result).toMatchObject({ status: 'unknown', readiness: 'unknown', canSatisfyInterfaceMutationGate: false });
      expect(f.calls.filter((v) => v.method === 'POST')).toHaveLength(1);
      expect(JSON.stringify(result)).not.toContain('SECRET_SENTINEL');
    });
  for (const code of [401, 403, 404, 429, 500, 503, 504])
    test(`${engine} HTTP ${code} remains unknown`, async () => {
      const f = harness(engine);
      f.state.code = code;
      expect(await f.run()).toMatchObject({ status: 'unknown', readiness: 'unknown' });
      expect(f.calls.filter((v) => v.method === 'POST')).toHaveLength(1);
    });
  test(`${engine} cancellation bounds a command transport that ignores AbortSignal`, async () => {
    const f = harness(engine),
      abort = new AbortController();
    f.state.hanging = true;
    const pending = f.run(abort.signal),
      timer = setTimeout(() => abort.abort(Error('cancelled')), 20);
    try {
      await expect(pending).rejects.toThrow('cancelled');
    } finally {
      clearTimeout(timer);
    }
  });
}

test('runtime-missing selectors cannot resolve into execution identifiers', () => {
  for (const value of [undefined, null, 0]) {
    expect(() => nodeHealthRequest(api, 'ce-one', value as unknown as string)).toThrow();
    expect(() => nodeHealthRequest(api, value as unknown as string, 'node-one')).toThrow();
  }
});

for (const engine of ['native', 'terraform'] as const) {
  test(`${engine} AWS scoped node readiness uses the same owned lower-privilege public path`, async () => {
    const f = harness(engine);
    f.binding.owner.provider = 'aws';
    f.site.metadata.labels['xcsh-ce-provider'] = 'aws';
    expect(await f.run()).toMatchObject({ status: 'observed', readiness: 'ready', owner: { provider: 'aws', engine } });
    expect(f.calls.filter((v) => v.method === 'POST')).toHaveLength(1);
  });
  test(`${engine} wrong engine cannot execute the node command`, async () => {
    const f = harness(engine);
    f.binding.owner.engine = engine === 'native' ? 'terraform' : 'native';
    expect(await f.run()).toMatchObject({ status: 'unknown', readiness: 'unknown' });
    expect(f.calls).toEqual([]);
  });
  test(`${engine} changing the registration observer during the command cannot qualify`, async () => {
    const f = harness(engine);
    f.state.onExec = () => {
      f.runtime.observeRegistrations = async () => {
        throw Error('replacement must not execute');
      };
    };
    expect(await f.run()).toMatchObject({ status: 'unknown', readiness: 'unknown' });
  });
}
