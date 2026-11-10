import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { chmod, lstat, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { openGcpCloudSerialReader, openInstalledGcpCloudSerialReader } from '../src/gcp-cloud-serial-reader';
import { createInstalledCaptureContext } from '../src/installed-capture-context';
import { linuxMonotonicMs } from '../src/linux-clock';
import { monitorOriginalInputs } from '../src/original-input-monitor';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const credential = {
  type: 'authorized_user',
  client_id: 'synthetic-client',
  client_secret: 'synthetic-secret',
  refresh_token: 'synthetic-refresh',
  quota_project_id: 'example-project',
};
const info = {
  email: 'principal@example.com',
  verified_email: true,
  audience: credential.client_id,
  issued_to: credential.client_id,
  expires_in: 3599,
  scope: 'https://www.googleapis.com/auth/cloud-platform',
};
const vm = {
  id: '4996011480491275420',
  name: 'example-node',
  zone: 'https://www.googleapis.com/compute/v1/projects/example-project/zones/us-central1-a',
  creationTimestamp: '2026-11-09T00:00:00Z',
  metadata: { fingerprint: 'original-metadata', items: [] },
  networkInterfaces: [{ networkIP: '10.1.0.2' }, { networkIP: '10.2.0.2' }],
};
const retained: string[] = [];
afterEach(() => {
  retained.splice(0);
});
async function fixture(values: Array<Response | Record<string, unknown>> = [], onCompute?: () => void | Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'ce-cloud-serial-'));
  retained.push(root); // Diagnostics are deliberately preserved.
  const calls: Array<{ url: string; options?: RequestInit }> = [];
  let guards = 0;
  let changed = false;
  const fetcher = (async (url: string | URL | Request, options?: RequestInit) => {
    calls.push({ url: String(url), options });
    const pathname = new URL(String(url)).pathname;
    if (pathname === '/token')
      return Response.json({ access_token: 'synthetic-access', token_type: 'Bearer', expires_in: 3599 });
    if (pathname === '/oauth2/v2/tokeninfo') return Response.json(info);
    if (pathname === '/v1/projects/example-project')
      return Response.json({ projectId: 'example-project', lifecycleState: 'ACTIVE' });
    const value = values.shift();
    if (!value) throw new Error('unexpected request');
    await onCompute?.();
    return value instanceof Response ? value : Response.json(value);
  }) as typeof fetch;
  const reader = await openGcpCloudSerialReader(
    {
      root,
      region: 'us-central1',
      authentication: {
        credentialBytes: Buffer.from(JSON.stringify(credential)),
        project: 'example-project',
        accountSha256: hash(info.email),
        audienceSha256: hash(credential.client_id),
        assertOriginal: async () => {
          guards++;
          if (changed) throw new Error('private credential rotated');
        },
      },
    },
    undefined,
    fetcher,
  );
  return {
    reader,
    root,
    calls,
    fetcher,
    guards: () => guards,
    change: () => {
      changed = true;
    },
  };
}

test('the real reader selects fixed Compute endpoints and retains exact private cloud/serial response bytes', async () => {
  const serial = { start: '0', next: '14', contents: 'original boot\n' };
  const f = await fixture([vm, vm, serial, vm]);
  const original = await f.reader.instance('us-central1-a', 'example-node');
  expect(original.present).toBe(true);
  if (!original.present) throw new Error('original VM required');
  expect(original.value.id).toBe(vm.id);
  const page = await f.reader.serial(original, '0');
  expect(page.value).toEqual(serial);
  expect(await readFile(page.path, 'utf8')).toBe(JSON.stringify(serial));
  expect(page.sha256).toBe(hash(JSON.stringify(serial)));
  expect(page.instanceId).toBe(vm.id);
  expect(f.calls.slice(3).map((c) => new URL(c.url).pathname)).toEqual([
    '/compute/v1/projects/example-project/zones/us-central1-a/instances/example-node',
    '/compute/v1/projects/example-project/zones/us-central1-a/instances/example-node',
    '/compute/v1/projects/example-project/zones/us-central1-a/instances/example-node/serialPort',
    '/compute/v1/projects/example-project/zones/us-central1-a/instances/example-node',
  ]);
  expect(f.calls.slice(3).every((c) => c.options?.method === 'GET' && c.options.redirect === 'error')).toBe(true);
  expect(f.guards()).toBeGreaterThan(10);
  expect(JSON.stringify(page)).not.toContain('synthetic-access');
  expect(JSON.stringify(f.reader)).not.toContain('synthetic-access');
});

test('only an attributed Google notFound body establishes initial absence', async () => {
  const f = await fixture([Response.json({ error: { code: 404, errors: [{ reason: 'notFound' }] } }, { status: 404 })]);
  expect((await f.reader.instance('us-central1-a', 'example-node')).present).toBe(false);
  for (const response of [
    Response.json({}, { status: 404 }),
    Response.json({ error: { code: 403 } }, { status: 403 }),
    Response.json({ error: { code: 401 } }, { status: 401 }),
  ]) {
    const g = await fixture([response]);
    await expect(g.reader.instance('us-central1-a', 'example-node')).rejects.toThrow();
  }
});

test('foreign scopes and command/URL injection refuse before Compute requests', async () => {
  const f = await fixture();
  for (const [zone, name] of [
    ['us-east1-a', 'example-node'],
    ['us-central1-a', '../foreign'],
    ['us-central1-a?x=1', 'example-node'],
    ['us-central1-a', 'example-node;id'],
    ['us-central1-a', 'example-node\n'],
  ]) {
    await expect(f.reader.instance(zone, name)).rejects.toThrow();
  }
  expect(f.calls).toHaveLength(3);
});

test('original numeric VM replacement during serial capture refuses and preserves the partial response', async () => {
  const f = await fixture([
    vm,
    vm,
    { start: '0', next: '14', contents: 'original boot\n' },
    { ...vm, id: '4996011480491275421' },
  ]);
  const original = await f.reader.instance('us-central1-a', 'example-node');
  if (!original.present) throw new Error('original VM required');
  await expect(f.reader.serial(original, '0')).rejects.toThrow('Original VM identity changed');
  expect(f.calls).toHaveLength(7);
  await expect(f.reader.serial(original, '0')).rejects.toThrow('retired');
  expect(f.calls).toHaveLength(7);
});

test('missing offsets, ring-buffer loss and malformed serial output remain incomplete', async () => {
  for (const serial of [
    { start: '1', next: '15', contents: 'original boot\n' },
    { start: '0', next: '1', contents: 'original boot\n' },
    { start: '0', next: '14' },
    { start: '0', next: '-1', contents: '' },
  ]) {
    const f = await fixture([vm, vm, serial, vm]);
    const original = await f.reader.instance('us-central1-a', 'example-node');
    if (!original.present) throw new Error('original VM required');
    await expect(f.reader.serial(original, '0')).rejects.toThrow();
  }
});

test('changed credentials and unadmitted original evidence cannot select a new live VM', async () => {
  const f = await fixture([vm]);
  const original = await f.reader.instance('us-central1-a', 'example-node');
  if (!original.present) throw new Error('original VM required');
  await expect(f.reader.serial({ ...original }, '0')).rejects.toThrow('admitted original');
  expect(f.calls).toHaveLength(4);
  f.change();
  await expect(f.reader.serial(original, '0')).rejects.toThrow();
  expect(f.calls).toHaveLength(4);
});

test('malformed and interrupted replies retain exact available bytes before refusing', async () => {
  const malformed = await fixture([new Response('not-json', { status: 200 })]);
  await expect(malformed.reader.instance('us-central1-a', 'example-node')).rejects.toThrow();
  const names = await readdir(malformed.root);
  expect(names.filter((n) => n.startsWith('cloud-') && n.endsWith('.body.private.bin'))).toHaveLength(1);
  const raw = names.find((n) => n.endsWith('.body.private.bin'));
  if (!raw) throw new Error('Retained raw cloud body required');
  expect(await readFile(join(malformed.root, raw), 'utf8')).toBe('not-json');
  const partial = Buffer.from('retained partial reply');
  let calls = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (++calls === 1) controller.enqueue(partial);
      else controller.error(new Error('private transport failure'));
    },
  });
  const interrupted = await fixture([new Response(stream, { status: 200 })]);
  await expect(interrupted.reader.instance('us-central1-a', 'example-node')).rejects.toThrow();
  const files = await readdir(interrupted.root);
  const body = files.find((n) => n.endsWith('.body.private.bin'));
  if (!body) throw new Error('Retained interrupted cloud body required');
  expect(await readFile(join(interrupted.root, body))).toEqual(partial);
  const receipt = files.find((n) => n.endsWith('.receipt.private.json'));
  if (!receipt) throw new Error('Retained interrupted cloud receipt required');
  const evidence = JSON.parse(await readFile(join(interrupted.root, receipt), 'utf8'));
  expect(evidence.complete).toBe(false);
  expect(evidence.kind).toBe('cloud');
  expect(evidence.project).toBe('example-project');
  expect(evidence.zone).toBe('us-central1-a');
  expect(evidence.nodeName).toBe('example-node');
});

test('over-limit raw responses retain the bounded prefix and an explicit truncation receipt', async () => {
  const f = await fixture([new Response('x'.repeat(4 * 1024 * 1024 + 1))]);
  await expect(f.reader.instance('us-central1-a', 'example-node')).rejects.toThrow();
  const files = await readdir(f.root);
  const body = files.find((n) => n.endsWith('.body.private.bin'));
  const receipt = files.find((n) => n.endsWith('.receipt.private.json'));
  if (!body || !receipt) throw new Error('Bounded partial response and receipt required');
  expect((await readFile(join(f.root, body))).length).toBe(4 * 1024 * 1024);
  const evidence = JSON.parse(await readFile(join(f.root, receipt), 'utf8'));
  expect(evidence.complete).toBe(false);
  expect(evidence.truncated).toBe(true);
});

test('a later instance read cannot admit a replacement for the same original name', async () => {
  const f = await fixture([vm, { ...vm, id: '4996011480491275421' }]);
  await f.reader.instance('us-central1-a', 'example-node');
  await expect(f.reader.instance('us-central1-a', 'example-node')).rejects.toThrow('Original VM identity changed');
});

test('installed reader consumes admitted ADC and provider inputs instead of ambient credentials', async () => {
  const f = await fixture([vm]);
  const adc = join(f.root, 'adc.private.json');
  const platform = join(f.root, 'platform.private.json');
  await writeFile(adc, JSON.stringify(credential), { mode: 0o400 });
  await writeFile(platform, '{}', { mode: 0o400 });
  const binding = async (path: string) => {
    const info = await lstat(path, { bigint: true });
    const parent = await lstat(dirname(path), { bigint: true });
    return {
      path,
      sha256: hash(await readFile(path, 'utf8')),
      expectedIdentity: Object.fromEntries(
        ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'].map((key) => [
          key,
          String(info[key as keyof typeof info]),
        ]),
      ) as Record<'dev' | 'ino' | 'uid' | 'nlink' | 'mode' | 'size' | 'mtimeNs' | 'ctimeNs', string>,
      expectedParentIdentity: {
        dev: String(parent.dev),
        ino: String(parent.ino),
        uid: String(parent.uid),
        mode: String(parent.mode),
      },
    };
  };
  const inputs = { adc: await binding(adc), platform: await binding(platform) };
  const monitor = await monitorOriginalInputs(inputs);
  let providerReads = 0;
  const providers: Record<string, Awaited<ReturnType<typeof binding>>> = {};
  for (let i = 0; i < 6; i++) {
    const path = join(f.root, `offline-provider-${i}.private`);
    await writeFile(path, `synthetic-provider-${i}`, { mode: 0o400 });
    providers[`offline:${i}`] = await binding(path);
  }
  const start = linuxMonotonicMs();
  const context = createInstalledCaptureContext({
    authentication: {
      accountSha256: hash(info.email),
      audienceSha256: hash(credential.client_id),
      snapshotSha256: inputs.adc.sha256,
    },
    owner: {
      provider: 'gcp',
      engine: 'terraform',
      account: 'example-project',
      region: 'us-central1',
      deploymentId: 'ce-fixture',
    },
    executionDirectory: f.root,
    budget: { start, deadline: start + 7200000 },
    environment: {
      GOOGLE_APPLICATION_CREDENTIALS: adc,
      XCSH_API_URL: 'https://example.test',
      XCSH_API_TOKEN: 'EXAMPLE_API_TOKEN',
    },
    inputs,
    assertInputs: () => monitor.assertOriginal(),
    assertWithinDeadline: () => monitor.assertOriginal(),
    readProviderInputs: async () => {
      providerReads++;
      return providers;
    },
  });
  try {
    const reader = await openInstalledGcpCloudSerialReader(context, undefined, f.fetcher);
    expect((await reader.instance('us-central1-a', 'example-node')).present).toBe(true);
    expect(providerReads).toBeGreaterThan(6);
    expect((await readdir(f.root)).some((name) => name.startsWith('gcp-cloud-capture-'))).toBe(true);
    await chmod(adc, 0o600);
    await writeFile(adc, 'changed', { mode: 0o400 });
    await expect(reader.instance('us-central1-a', 'example-node')).rejects.toThrow();
  } finally {
    monitor.close();
  }
});

test('a complete HTTP body with failed final input checks is retained as incomplete capture', async () => {
  let change = () => {};
  const f = await fixture([vm], () => change());
  change = f.change;
  await expect(f.reader.instance('us-central1-a', 'example-node')).rejects.toThrow();
  const files = await readdir(f.root);
  const receipt = files.find((n) => n.endsWith('.receipt.private.json'));
  if (!receipt) throw new Error('Final input refusal receipt required');
  const evidence = JSON.parse(await readFile(join(f.root, receipt), 'utf8'));
  expect(evidence.complete).toBe(false);
  expect(await readFile(evidence.path, 'utf8')).toBe(JSON.stringify(vm));
});

test('documented single-character instance names remain supported', async () => {
  const f = await fixture([{ ...vm, name: 'a' }]);
  expect((await f.reader.instance('us-central1-a', 'a')).present).toBe(true);
});

test('serial offsets outside the documented signed int64 range refuse before cloud reads', async () => {
  const f = await fixture([vm]);
  const original = await f.reader.instance('us-central1-a', 'example-node');
  if (!original.present) throw new Error('Original VM required');
  await expect(f.reader.serial(original, '9223372036854775808')).rejects.toThrow();
  expect(f.calls).toHaveLength(4);
});

const auditWindow = { after: '2026-11-10T00:00:00.000Z', before: '2026-11-10T01:00:00.000Z' };
const auditEntry = (id = 'original-entry') => ({
  logName: 'projects/example-project/logs/cloudaudit.googleapis.com%2Factivity',
  insertId: id,
  timestamp: '2026-11-10T00:01:00Z',
  resource: {
    type: 'gce_instance',
    labels: { project_id: 'example-project', zone: 'us-central1-a', instance_id: vm.id },
  },
  protoPayload: {
    '@type': 'type.googleapis.com/google.cloud.audit.AuditLog',
    serviceName: 'compute.googleapis.com',
    methodName: 'v1.compute.instances.insert',
    resourceName: 'projects/example-project/zones/us-central1-a/instances/example-node',
  },
  operation: { id: 'original-operation', producer: 'compute.googleapis.com', first: true },
});

test('insert audit pagination retains each private page and fixes the same project/resource/window without authority', async () => {
  const first = { entries: [auditEntry()], nextPageToken: 'original-next-page' };
  const second = { entries: [auditEntry('final-entry')] };
  const f = await fixture([first, second]);
  const batch = await f.reader.insertAudit('us-central1-a', 'example-node', auditWindow);
  expect(batch.complete).toBe(true);
  expect(batch.entries).toHaveLength(2);
  expect(batch.pages).toHaveLength(2);
  expect(batch.originalInsertQualified).toBe(false);
  expect(await readFile(batch.pages[0].path, 'utf8')).toBe(JSON.stringify(first));
  expect(Object.isFrozen(batch.entries[0].protoPayload)).toBe(true);
  for (const call of f.calls.slice(3)) {
    expect(call.url).toBe('https://logging.googleapis.com/v2/entries:list');
    expect(call.options?.method).toBe('POST');
    expect(call.options?.redirect).toBe('error');
    expect(new Headers(call.options?.headers).get('content-type')).toBe('application/json');
  }
  const payloads = f.calls.slice(3).map((c) => JSON.parse(String(c.options?.body)));
  expect(payloads[0].resourceNames).toEqual(['projects/example-project']);
  expect(payloads[0].filter).toContain('protoPayload.methodName="v1.compute.instances.insert"');
  expect(payloads[0].filter).toContain(
    'protoPayload.resourceName="projects/example-project/zones/us-central1-a/instances/example-node"',
  );
  expect(payloads[1]).toEqual({ ...payloads[0], pageToken: 'original-next-page' });
  expect(batch.schemaVersion).toBe(1);
  expect(batch.kind).toBe('compute-instance-insert-audit-batch');
  expect(await readFile(batch.queryPath, 'utf8')).toBe(JSON.stringify(payloads[0]));
  expect(batch.window).toEqual(auditWindow);
  expect(JSON.stringify(batch)).not.toContain('synthetic-access');
});

test('empty pages with fresh continuation are searched but a replayed continuation cannot complete', async () => {
  const f = await fixture([{ nextPageToken: 'first' }, { entries: [], nextPageToken: 'second' }, {}]);
  expect((await f.reader.insertAudit('us-central1-a', 'example-node', auditWindow)).entries).toHaveLength(0);
  const repeated = await fixture([{ nextPageToken: 'same' }, { nextPageToken: 'same' }]);
  await expect(repeated.reader.insertAudit('us-central1-a', 'example-node', auditWindow)).rejects.toThrow(
    'continuation',
  );
  expect(repeated.calls).toHaveLength(5);
  expect((await readdir(repeated.root)).filter((n) => n.endsWith('.body.private.bin'))).toHaveLength(2);
});

test('foreign, replayed, malformed or incomplete audit results retain raw bytes and retire the reader', async () => {
  for (const value of [
    {
      entries: [
        {
          ...auditEntry(),
          protoPayload: {
            ...auditEntry().protoPayload,
            resourceName: 'projects/example-project/zones/us-central1-a/instances/foreign',
          },
        },
      ],
    },
    {
      entries: [
        {
          ...auditEntry(),
          resource: {
            ...auditEntry().resource,
            labels: { project_id: 'example-foreign-project', zone: 'us-central1-a' },
          },
        },
      ],
    },
    { entries: [auditEntry(), auditEntry()] },
    { entries: [{ ...auditEntry(), timestamp: '2026-11-09T00:01:00Z' }] },
    { entries: 'malformed' },
    { nextPageToken: 1 },
    { entries: [], error: { code: 503 } },
    { entries: [{ ...auditEntry(), split: { uid: 'original-split', index: 0, totalSplits: 2 } }] },
    new Response('not-json'),
    Response.json({ error: { code: 403 } }, { status: 403 }),
  ]) {
    const f = await fixture([value]);
    await expect(f.reader.insertAudit('us-central1-a', 'example-node', auditWindow)).rejects.toThrow();
    expect((await readdir(f.root)).filter((n) => n.endsWith('.body.private.bin'))).toHaveLength(1);
    await expect(f.reader.insertAudit('us-central1-a', 'example-node', auditWindow)).rejects.toThrow('retired');
  }
});

test('fixed audit query cannot widen resource, time or method through input fields or injection', async () => {
  const f = await fixture();
  for (const window of [
    { ...auditWindow, after: '2026-11-10T02:00:00.000Z' },
    { ...auditWindow, before: '2026-11-11T00:00:00.000Z' },
    { ...auditWindow, filter: 'all logs' },
    { ...auditWindow, after: '2026-11-10T00:00:00.000Z" OR true' },
  ])
    await expect(f.reader.insertAudit('us-central1-a', 'example-node', window)).rejects.toThrow();
  await expect(f.reader.insertAudit('us-central1-a', '../foreign', auditWindow)).rejects.toThrow();
  expect(f.calls).toHaveLength(3);
});

test('audit interruption retains partial bytes and final credential changes prevent completion', async () => {
  let count = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (++count === 1) controller.enqueue(Buffer.from('partial-audit'));
      else controller.error(new Error('private interruption'));
    },
  });
  const f = await fixture([new Response(stream)]);
  await expect(f.reader.insertAudit('us-central1-a', 'example-node', auditWindow)).rejects.toThrow();
  const names = await readdir(f.root),
    body = names.find((n) => n.endsWith('.body.private.bin'));
  if (!body) throw new Error('Original partial audit body required');
  expect(await readFile(join(f.root, body), 'utf8')).toBe('partial-audit');
  let change = () => {};
  const rotated = await fixture([{ entries: [auditEntry()] }], () => change());
  change = rotated.change;
  await expect(rotated.reader.insertAudit('us-central1-a', 'example-node', auditWindow)).rejects.toThrow();
});

test('numeric VM identities outside uint64 and duplicate identity fields never admit an original', async () => {
  const outOfRange = await fixture([{ ...vm, id: '99999999999999999999' }]);
  await expect(outOfRange.reader.instance('us-central1-a', 'example-node')).rejects.toThrow();
});

test('duplicate original identity fields refuse before admission', async () => {
  const duplicate = await fixture([new Response(JSON.stringify(vm).replace('"id":', '"id":"foreign","id":'))]);
  await expect(duplicate.reader.instance('us-central1-a', 'example-node')).rejects.toThrow();
});

test('audit batch aggregate bytes retain only the original bounded prefix', async () => {
  const entry = (id: string) => ({
    ...auditEntry(id),
    protoPayload: { ...auditEntry(id).protoPayload, response: { message: 'x'.repeat(2500000) } },
  });
  const f = await fixture([{ entries: [entry('first')], nextPageToken: 'next' }, { entries: [entry('second')] }]);
  await expect(f.reader.insertAudit('us-central1-a', 'example-node', auditWindow)).rejects.toThrow();
  const bodies = (await readdir(f.root)).filter((name) => name.endsWith('.body.private.bin'));
  let bytes = 0;
  for (const body of bodies) bytes += (await readFile(join(f.root, body))).byteLength;
  expect(bytes).toBe(4 * 1024 * 1024);
  const receipts = (await readdir(f.root)).filter((name) => name.endsWith('.receipt.private.json'));
  const values = await Promise.all(receipts.map((name) => readFile(join(f.root, name), 'utf8').then(JSON.parse)));
  expect(values.some((value) => value.truncated && !value.complete)).toBe(true);
});

test('audit page bound cannot renew the same command budget or submit another search', async () => {
  const f = await fixture(Array.from({ length: 33 }, (_, index) => ({ nextPageToken: `page-${index}` })));
  await expect(f.reader.insertAudit('us-central1-a', 'example-node', auditWindow)).rejects.toThrow('page bound');
  expect(f.calls).toHaveLength(35);
  expect((await readdir(f.root)).filter((name) => name.endsWith('.body.private.bin'))).toHaveLength(32);
});

test('audit transport and persistence failures both survive a changed evidence directory', async () => {
  let alter = async () => {};
  let count = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (++count === 1) controller.enqueue(Buffer.from('partial-audit'));
      else controller.error(new Error('private transport failure'));
    },
  });
  const f = await fixture([new Response(stream)], () => alter());
  alter = () => chmod(f.root, 0o755);
  let failure: unknown;
  try {
    await f.reader.insertAudit('us-central1-a', 'example-node', auditWindow);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(AggregateError);
  expect((failure as AggregateError).errors).toHaveLength(2);
  await expect(f.reader.insertAudit('us-central1-a', 'example-node', auditWindow)).rejects.toThrow('retired');
});
