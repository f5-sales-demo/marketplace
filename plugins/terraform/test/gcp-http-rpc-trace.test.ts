import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { assertOriginalGoogleHttpRpcBodies, GoogleHttpRpcTraceParser } from '../src/gcp-http-rpc-trace';

const scope = {
  rpc: 'ReadDataSource' as const,
  resourceType: 'google_compute_zones',
  method: 'GET' as const,
  url: 'https://compute.googleapis.com/compute/v1/projects/example-project/zones?alt=json&prettyPrint=false',
  requestReason: 'xcsh-1559-example',
  planSha256: 'a'.repeat(64),
};
const rpcId = '11111111-2222-3333-4444-555555555555';
const provider = 'registry.terraform.io/hashicorp/google';
const module = 'provider.terraform-provider-google_v8.7.0_x5';
const row = (message: string, fields = {}) =>
  `${JSON.stringify({
    '@level': 'debug',
    '@message': message,
    '@module': module,
    '@timestamp': '2026-11-09T00:00:00.000000Z',
    ...fields,
  })}\n`;
const rpc = (message: string, fields = {}) =>
  row(message, {
    '@module': 'sdk.proto',
    '@level': 'trace',
    tf_provider_addr: provider,
    tf_proto_version: '5.11',
    tf_rpc: 'ReadDataSource',
    tf_data_source_type: scope.resourceType,
    tf_req_id: rpcId,
    ...fields,
  });
const received = rpc('Received request'),
  served = rpc('Served request');
const requestHeader = row('2026/11/09 00:00:00 [DEBUG] Google API Request Details:');
const responseHeader = row('2026/11/09 00:00:00 [DEBUG] Google API Response Details:');
const end = row('-----------------------------------------------------');
const request = (changes: { path?: string; host?: string; reason?: string; body?: string } = {}) =>
  requestHeader +
  row('---[ REQUEST ]---------------------------------------') +
  row(`GET ${changes.path ?? '/compute/v1/projects/example-project/zones?alt=json&prettyPrint=false'} HTTP/1.1`) +
  row(`Host: ${changes.host ?? 'compute.googleapis.com'}`) +
  row('User-Agent: synthetic-fixture') +
  row('Authorization: Bearer example-private-token') +
  row('Content-Type: application/json') +
  row(`X-Goog-Request-Reason: ${changes.reason ?? scope.requestReason}`) +
  row('') +
  row(changes.body ?? '') +
  end;
const response = (body = '{"items":[{"name":"example-zone"}]}', contentType = 'application/json') =>
  responseHeader +
  row('---[ RESPONSE ]--------------------------------------') +
  row('HTTP/2.0 200 OK') +
  row(`Content-Type: ${contentType}`) +
  row('Vary: Origin') +
  row('Vary: Accept-Encoding') +
  row('') +
  body
    .split('\n')
    .map((s) => row(s))
    .join('') +
  end;
const complete = received + request() + row('Retry transport: original request completed') + response() + served;

test('split forwarded HTTP records pair with one original RPC and expose immutable candidate hashes only', () => {
  const parser = new GoogleHttpRpcTraceParser(scope);
  const results = [];
  for (const byte of Buffer.from(complete)) results.push(...parser.push(Uint8Array.of(byte)));
  expect(results).toHaveLength(1);
  expect(results[0].rpcRequestId).toBe(rpcId);
  expect(results[0].url).toBe(scope.url);
  expect(results[0].status).toBe(200);
  expect(results[0].requestReasonSha256).toBe(createHash('sha256').update(scope.requestReason).digest('hex'));
  expect(results[0].applyRpcQualified).toBe(false);
  expect(results[0].originalInsertQualified).toBe(false);
  expect(Object.isFrozen(results[0])).toBe(true);
  expect(JSON.stringify(results)).not.toContain('example-private-token');
  expect(parser.finish()).toEqual({
    complete: true,
    matchingTransactions: 1,
    applyRpcQualified: false,
    originalInsertQualified: false,
  });
  expect(() => parser.push(Buffer.from(complete))).toThrow('closed');
});

test('concurrent RPCs, overlapping HTTP dumps, unpaired responses and matching replay permanently refuse', () => {
  for (const invalid of [
    received + rpc('Received request', { tf_req_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }),
    received + requestHeader + requestHeader,
    received + response(),
    received + request() + served,
    complete + received,
    received + request() + response() + request() + response() + served,
  ]) {
    const parser = new GoogleHttpRpcTraceParser(scope);
    expect(() => parser.push(Buffer.from(invalid))).toThrow();
    expect(() => parser.finish()).toThrow('failed');
  }
});

test('changed request identity, type, protocol, host, URI, reason and header duplication refuse', () => {
  for (const raw of [
    received + request() + response() + rpc('Served request', { tf_req_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }),
    received + request() + response() + rpc('Served request', { tf_data_source_type: 'google_compute_instance' }),
    rpc('Received request', { tf_proto_version: '5.10' }),
    received + request({ host: 'foreign.example.com' }) + response() + served,
    received +
      request({ path: '//foreign.example.com/compute/v1/projects/example-project/zones' }) +
      response() +
      served,
    received + request({ path: '/compute/v1/projects/foreign-project/zones' }) + response() + served,
    received + request({ reason: 'foreign-reason' }) + response() + served,
    received +
      request().replace(
        row('Host: compute.googleapis.com'),
        row('Host: compute.googleapis.com') + row('Host: foreign.example.com'),
      ) +
      response() +
      served,
  ]) {
    const parser = new GoogleHttpRpcTraceParser(scope);
    expect(() => parser.push(Buffer.from(raw))).toThrow();
  }
  const foreign = new GoogleHttpRpcTraceParser(scope);
  foreign.push(Buffer.from(complete.replaceAll(provider, 'registry.terraform.io/example/foreign')));
  expect(() => foreign.finish()).toThrow('missing');
});

test('truncation, missing markers, absent matching evidence and partial final JSON cannot finish', () => {
  for (const raw of [
    received,
    received + request(),
    received + request() + response(),
    complete.slice(0, -1),
    received + served,
  ]) {
    const parser = new GoogleHttpRpcTraceParser(scope);
    parser.push(Buffer.from(raw));
    expect(() => parser.finish()).toThrow();
    expect(() => parser.push(Buffer.from(served))).toThrow('failed');
  }
  const missing = new GoogleHttpRpcTraceParser(scope);
  expect(() =>
    missing.push(Buffer.from(complete.replace(row('---[ REQUEST ]---------------------------------------'), ''))),
  ).toThrow();
});

test('malformed, duplicate, escaped-duplicate and non-JSON bodies refuse before a candidate', () => {
  for (const raw of [
    received + request({ body: '{bad}' }) + response() + served,
    received + request() + response('{"id":"old","id":"new"}') + served,
    received + request() + response('{"i\\u0064":"old","id":"new"}') + served,
    received + request() + response('<html>unavailable</html>', 'text/html') + served,
    received.replace('"tf_req_id":', '"tf_req_id":"foreign","tf_req_id":'),
    Buffer.from([0xff, 10]).toString('latin1'),
  ])
    expect(() => new GoogleHttpRpcTraceParser(scope).push(Buffer.from(raw))).toThrow();
});

test('error logs, provider dump errors and changed forwarding module cannot yield a qualified result', () => {
  for (const raw of [
    received + row('2026/11/09 00:00:00 [ERROR] Google API Request error: unavailable'),
    received + rpc('Provider error', { '@level': 'error' }),
    received +
      requestHeader +
      row('---[ REQUEST ]---------------------------------------', {
        '@module': 'provider.terraform-provider-foreign',
      }),
  ])
    expect(() => new GoogleHttpRpcTraceParser(scope).push(Buffer.from(raw))).toThrow();
});

test('unrelated provider records and completed Google schema RPCs preserve source framing without matching authority', () => {
  const schema = (message: string) =>
    rpc(message, { tf_rpc: 'GetProviderSchema', tf_req_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' });
  const parser = new GoogleHttpRpcTraceParser(scope);
  parser.push(
    Buffer.from(
      schema('Received request') +
        row('unrelated provider', { '@module': 'provider.other' }) +
        schema('Served request') +
        complete,
    ),
  );
  expect(parser.finish().matchingTransactions).toBe(1);
});

test('scope copies, record bounds and HTTP dump bounds cannot be renewed by caller mutation or chunking', () => {
  const input = { ...scope };
  const parser = new GoogleHttpRpcTraceParser(input);
  input.requestReason = 'changed';
  parser.push(Buffer.from(complete));
  expect(parser.finish().complete).toBe(true);
  expect(() => new GoogleHttpRpcTraceParser(scope).push(Buffer.from('x'.repeat(1024 * 1024 + 1)))).toThrow('line');
  const oversized = new GoogleHttpRpcTraceParser(scope);
  oversized.push(Buffer.from(received + requestHeader + row('---[ REQUEST ]---------------------------------------')));
  expect(() => oversized.push(Buffer.from(Array.from({ length: 6 }, () => row('x'.repeat(800000))).join('')))).toThrow(
    'dump',
  );
});

test('multiline Terraform and SDK diagnostic text does not masquerade as forwarded HTTP lines', () => {
  const parser = new GoogleHttpRpcTraceParser(scope);
  parser.push(
    Buffer.from(
      row('Unrelated state dump:\n{}', { '@module': 'terraform' }) +
        received +
        rpc('Downstream state:\n{}') +
        request() +
        response() +
        served,
    ),
  );
  expect(parser.finish().complete).toBe(true);
});

test('trace envelopes require the pinned timestamp representation, not a coercible date', () => {
  expect(() =>
    new GoogleHttpRpcTraceParser(scope).push(Buffer.from(received.replace('2026-11-09T00:00:00.000000Z', '1'))),
  ).toThrow();
});

test('managed insert RPC inspection preserves exact body hashes without granting insert authority', () => {
  const body = JSON.stringify({
    name: 'example-node',
    metadata: { items: [{ key: 'user-data', value: 'example-bootstrap-token' }] },
  });
  const op = '{"id":"18446744073709551614","operationType":"insert","targetId":"18446744073709551613"}';
  const input = {
    ...scope,
    rpc: 'ApplyResourceChange' as const,
    resourceType: 'google_compute_instance',
    method: 'POST' as const,
    url: 'https://compute.googleapis.com/compute/v1/projects/example-project/zones/us-central1-a/instances',
  };
  const fields = { tf_rpc: input.rpc, tf_data_source_type: undefined, tf_resource_type: input.resourceType };
  const req = request({ body }).replace(
    'GET /compute/v1/projects/example-project/zones?alt=json&prettyPrint=false',
    'POST /compute/v1/projects/example-project/zones/us-central1-a/instances',
  );
  const parser = new GoogleHttpRpcTraceParser(input);
  const [candidate] = parser.push(
    Buffer.from(rpc('Received request', fields) + req + response(op) + rpc('Served request', fields)),
  );
  expect(candidate.requestBodySha256).toBe(createHash('sha256').update(body).digest('hex'));
  expect(candidate.responseBodySha256).toBe(createHash('sha256').update(op).digest('hex'));
  expect(candidate.originalInsertQualified).toBe(false);
  expect(JSON.stringify(candidate)).not.toContain('example-bootstrap-token');
  expect(parser.finish().complete).toBe(true);
});

test('unpaired dump markers are incomplete framing, not ignorable provider diagnostics', () => {
  for (const extra of [
    end,
    row('---[ REQUEST ]---------------------------------------'),
    row('---[ RESPONSE ]--------------------------------------'),
  ]) {
    expect(() =>
      new GoogleHttpRpcTraceParser(scope).push(Buffer.from(received + request() + response() + extra + served)),
    ).toThrow();
  }
});

test('latest forwarded HTTP module is selected by authenticated runtime profile and refuses mixed streams', () => {
  const binding = {
    terraformVersion: '1.17.1',
    providerLockSha256: '2ff7b8d6b6c29f989ffbbb0ac39131b1ac33da0b6dcef9e4310204e605a5a034',
  };
  const latest = complete.replaceAll('8.7.0', '8.10.0');
  const parser = new GoogleHttpRpcTraceParser(scope, binding);
  expect(parser.push(Buffer.from(latest))).toHaveLength(1);
  expect(parser.finish().complete).toBe(true);
  expect(() => new GoogleHttpRpcTraceParser(scope, binding).push(Buffer.from(complete))).toThrow();
  const legacy = new GoogleHttpRpcTraceParser(scope);
  expect(() => legacy.push(Buffer.from(latest))).toThrow();
  expect(() => new GoogleHttpRpcTraceParser(scope, { ...binding, terraformVersion: '1.18.0' })).toThrow();
});

test('original HTTP bodies are single-use capabilities of the emitting parser, not copied candidates', () => {
  const body = '{"name":"example-node","metadata":{"items":[{"key":"user-data","value":"example-private-bootstrap"}]}}';
  const op = '{"id":"18446744073709551614","targetId":"18446744073709551613"}';
  const parser = new GoogleHttpRpcTraceParser(scope);
  const [candidate] = parser.push(Buffer.from(received + request({ body }) + response(op) + served));
  parser.finish();
  expect(JSON.stringify(candidate)).not.toContain('example-private-bootstrap');
  expect(() => parser.consumeBodies({ ...candidate })).toThrow('original');
  const independent = new GoogleHttpRpcTraceParser(scope);
  expect(() => independent.consumeBodies(candidate)).toThrow('original');
  const bodies = parser.consumeBodies(candidate);
  expect(bodies.schemaVersion).toBe(1);
  expect(bodies.kind).toBe('original-google-http-rpc-bodies');
  expect(bodies.requestBody).toBe(body);
  expect(bodies.responseBody).toBe(op);
  expect(bodies.requestBodySha256).toBe(candidate.requestBodySha256);
  expect(bodies.responseBodySha256).toBe(candidate.responseBodySha256);
  expect(bodies.rpcRequestId).toBe(candidate.rpcRequestId);
  expect(bodies.planSha256).toBe(candidate.planSha256);
  expect(bodies.originalInsertQualified).toBe(false);
  expect(Object.isFrozen(bodies)).toBe(true);
  expect(() => parser.consumeBodies(candidate)).toThrow('original');
});

test('failed original trace cannot supply earlier apparently complete HTTP bodies', () => {
  const parser = new GoogleHttpRpcTraceParser(scope);
  const [candidate] = parser.push(Buffer.from(complete));
  expect(() => parser.push(Buffer.from(received))).toThrow('replayed');
  expect(() => parser.consumeBodies(candidate)).toThrow('failed');
});

test('HTTP body evidence keeps the existing framing and rejects partial RPC completion', () => {
  const parser = new GoogleHttpRpcTraceParser(scope);
  expect(parser.push(Buffer.from(received + request() + response()))).toHaveLength(0);
  expect(() => parser.consumeBodies({} as never)).toThrow('original');
  const [candidate] = parser.push(Buffer.from(served));
  const bodies = parser.consumeBodies(candidate);
  expect(bodies.requestBody).toBe('');
  expect(bodies.responseBody).toBe('{"items":[{"name":"example-zone"}]}');
  expect(parser.finish().complete).toBe(true);
});

test('released body capabilities are revoked on a later original stream failure or incomplete finish', () => {
  for (const fail of [
    (parser: GoogleHttpRpcTraceParser) => parser.push(Buffer.from(received)),
    (parser: GoogleHttpRpcTraceParser) => {
      parser.push(Buffer.from('{'));
      parser.finish();
    },
  ]) {
    const parser = new GoogleHttpRpcTraceParser(scope);
    const [candidate] = parser.push(Buffer.from(complete));
    const bodies = parser.consumeBodies(candidate);
    expect(() => assertOriginalGoogleHttpRpcBodies(bodies)).not.toThrow();
    expect(() => fail(parser)).toThrow();
    expect(() => assertOriginalGoogleHttpRpcBodies(bodies)).toThrow('original');
  }
});

test('same-zone HA insert traces select the original reviewed node name without accepting another node', () => {
  const input = {
    ...scope,
    rpc: 'ApplyResourceChange' as const,
    resourceType: 'google_compute_instance',
    method: 'POST' as const,
    url: 'https://compute.googleapis.com/compute/v1/projects/example-project/zones/us-central1-a/instances?alt=json',
    instanceName: 'example-node-b',
  };
  const transaction = (name: string, id: string) => {
    const fields = {
      tf_rpc: input.rpc,
      tf_resource_type: input.resourceType,
      tf_data_source_type: undefined,
      tf_req_id: id,
    };
    const req = request({ body: JSON.stringify({ name }) }).replace(
      'GET /compute/v1/projects/example-project/zones?alt=json&prettyPrint=false',
      'POST /compute/v1/projects/example-project/zones/us-central1-a/instances?alt=json',
    );
    return (
      rpc('Received request', fields) +
      req +
      response('{"id":"123"}') +
      rpc('Served request', fields)
    ).replaceAll('8.7.0', '8.10.0');
  };
  const binding = {
    terraformVersion: '1.17.1',
    providerLockSha256: '2ff7b8d6b6c29f989ffbbb0ac39131b1ac33da0b6dcef9e4310204e605a5a034',
  };
  const parser = new GoogleHttpRpcTraceParser(input, binding);
  input.instanceName = 'example-node-a';
  const candidates = parser.push(
    Buffer.from(
      transaction('example-node-a', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee1') +
        transaction('example-node-b', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee2') +
        transaction('example-node-c', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee3'),
    ),
  );
  expect(candidates).toHaveLength(1);
  expect(candidates[0].rpcRequestId).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeee2');
  expect(parser.finish().matchingTransactions).toBe(1);
  expect(JSON.parse(parser.consumeBodies(candidates[0]).requestBody).name).toBe('example-node-b');
});

test('instance-name selection cannot be applied to unverified request shapes or injected names', () => {
  for (const instanceName of ['', 'invalid/name', 'two\nlines'])
    expect(() => new GoogleHttpRpcTraceParser({ ...scope, instanceName })).toThrow();
  expect(() => new GoogleHttpRpcTraceParser({ ...scope, instanceName: 'example-node' })).toThrow();
});
