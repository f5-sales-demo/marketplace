import { expect, test } from 'bun:test';
import { GoogleProviderLifecycleParser } from '../src/google-provider-lifecycle';

const scope = {
  providerPath: '/private/example-provider/terraform-provider-google_v8.7.0_x5',
  planSha256: 'a'.repeat(64),
};
const row = (message: string, fields = {}) =>
  `${JSON.stringify({ '@level': 'debug', '@module': 'provider', '@timestamp': '2026-11-10T00:00:00.000Z', '@message': message, ...fields })}\n`;
const starting = row('starting plugin', { path: scope.providerPath, args: [scope.providerPath] });
const start = (pid = 1234) => row('plugin started', { path: scope.providerPath, pid });
const exit = (id = '1234') => row('plugin process exited', { plugin: scope.providerPath, id });
const rpc = (message: string, fields = {}) =>
  row(message, {
    '@module': 'sdk.proto',
    '@level': 'trace',
    tf_provider_addr: 'registry.terraform.io/hashicorp/google',
    tf_proto_version: '5.11',
    tf_rpc: 'ReadDataSource',
    tf_data_source_type: 'google_compute_zones',
    tf_req_id: '11111111-2222-3333-4444-555555555555',
    ...fields,
  });
const received = rpc('Received request'),
  served = rpc('Served request');
const complete = starting + start() + received + served + exit();

test('original serialized lifecycle records bind RPC candidates to exact started PID and immutable hashes', () => {
  const parser = new GoogleProviderLifecycleParser(scope),
    candidates = [];
  for (const byte of Buffer.from(complete)) candidates.push(...parser.push(Uint8Array.of(byte)));
  expect(candidates).toHaveLength(1);
  expect(candidates[0]).toMatchObject({
    providerPid: 1234,
    rpc: 'ReadDataSource',
    rpcRequestId: '11111111-2222-3333-4444-555555555555',
    planSha256: scope.planSha256,
    providerProcessQualified: false,
    applyRpcQualified: false,
    originalInsertQualified: false,
  });
  expect(Object.isFrozen(candidates[0])).toBe(true);
  expect(parser.finish()).toMatchObject({ complete: true, providers: 1, rpcs: 1, providerProcessQualified: false });
});

test('schema and read processes remain distinct instead of selecting the newest PID', () => {
  const parser = new GoogleProviderLifecycleParser(scope);
  const schema = (message: string) =>
    rpc(message, {
      tf_rpc: 'GetProviderSchema',
      tf_data_source_type: undefined,
      tf_req_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    });
  const results = parser.push(
    Buffer.from(
      starting + start(1233) + schema('Received request') + schema('Served request') + exit('1233') + complete,
    ),
  );
  expect(results.map((x) => x.providerPid)).toEqual([1233, 1234]);
  expect(results.map((x) => x.rpc)).toEqual(['GetProviderSchema', 'ReadDataSource']);
  expect(parser.finish().providers).toBe(2);
});

test('overlap, replay, missing starts, reattachment and unpaired exits permanently refuse', () => {
  for (const raw of [
    start(),
    received,
    starting + start() + starting,
    starting + start() + received + exit(),
    complete + starting + start(),
    starting + start() + exit('999'),
    row('reattached plugin process exited'),
  ]) {
    const parser = new GoogleProviderLifecycleParser(scope);
    expect(() => parser.push(Buffer.from(raw))).toThrow();
    expect(() => parser.finish()).toThrow('failed');
  }
});

test('changed provider, argv, PID representation, RPC scope and forwarding identity refuse', () => {
  for (const raw of [
    row('starting plugin', { path: scope.providerPath, args: [scope.providerPath, 'foreign'] }),
    starting + row('plugin started', { path: scope.providerPath, pid: '1234' }),
    starting + start() + row('plugin process exited', { plugin: scope.providerPath, id: 1234 }),
    starting + start() + received + rpc('Served request', { tf_data_source_type: 'google_compute_instance' }),
    starting +
      start() +
      received +
      rpc('Served request', { tf_provider_addr: 'registry.terraform.io/example/foreign' }),
    starting + start() + rpc('Received request', { tf_proto_version: '5.10' }),
    starting + start() + received + rpc('Received request', { tf_req_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }),
  ])
    expect(() => new GoogleProviderLifecycleParser(scope).push(Buffer.from(raw))).toThrow();
});

test('late SDK records, error exits, duplicate JSON and incomplete streams cannot be accepted', () => {
  expect(() =>
    new GoogleProviderLifecycleParser(scope).push(Buffer.from(starting + start() + exit() + received)),
  ).toThrow();
  expect(() =>
    new GoogleProviderLifecycleParser(scope).push(
      Buffer.from(
        starting +
          start() +
          row('plugin process exited', {
            plugin: scope.providerPath,
            id: '1234',
            '@level': 'error',
            error: 'example-private-error',
          }),
      ),
    ),
  ).toThrow();
  expect(() =>
    new GoogleProviderLifecycleParser(scope).push(Buffer.from(starting.replace('"path":', '"path":"foreign","path":'))),
  ).toThrow();
  for (const raw of [starting, starting + start(), starting + start() + received, complete.slice(0, -1)]) {
    const parser = new GoogleProviderLifecycleParser(scope);
    parser.push(Buffer.from(raw));
    expect(() => parser.finish()).toThrow();
  }
});

test('unrelated processes cannot provide Google startup and scope mutation cannot replace original path', () => {
  const input = { ...scope },
    parser = new GoogleProviderLifecycleParser(input);
  input.providerPath = '/private/foreign';
  const other =
    row('starting plugin', { path: '/private/example-xcsh', args: ['/private/example-xcsh'] }) +
    row('plugin started', { path: '/private/example-xcsh', pid: 999 });
  parser.push(Buffer.from(other + complete));
  expect(parser.finish().complete).toBe(true);
  expect(() => new GoogleProviderLifecycleParser(scope).push(Buffer.from('x'.repeat(1024 * 1024 + 1)))).toThrow(
    'limit',
  );
});

test('conflicting lifecycle identity fields cannot substitute the reviewed provider path', () => {
  for (const invalid of [
    starting + row('plugin started', { path: scope.providerPath, pid: 1234, plugin: '/private/foreign' }),
    starting +
      start() +
      row('plugin process exited', { path: scope.providerPath, plugin: '/private/foreign', id: '1234' }),
    row('starting plugin', { path: scope.providerPath, args: [scope.providerPath], pid: 1234 }),
  ])
    expect(() => new GoogleProviderLifecycleParser(scope).push(Buffer.from(invalid))).toThrow();
});

test('latest lifecycle profile requires the authenticated coupled lock and exact provider basename', () => {
  const binding = {
    terraformVersion: '1.17.1',
    providerLockSha256: '2ff7b8d6b6c29f989ffbbb0ac39131b1ac33da0b6dcef9e4310204e605a5a034',
  };
  const latestScope = { ...scope, providerPath: scope.providerPath.replace('8.7.0', '8.10.0') };
  const parser = new GoogleProviderLifecycleParser(latestScope, binding);
  expect(parser.push(Buffer.from(complete.replaceAll('8.7.0', '8.10.0')))).toHaveLength(1);
  expect(parser.finish().complete).toBe(true);
  expect(() => new GoogleProviderLifecycleParser(latestScope)).toThrow();
  expect(() => new GoogleProviderLifecycleParser(scope, binding)).toThrow();
  expect(
    () => new GoogleProviderLifecycleParser(latestScope, { ...binding, providerLockSha256: 'a'.repeat(64) }),
  ).toThrow();
});
