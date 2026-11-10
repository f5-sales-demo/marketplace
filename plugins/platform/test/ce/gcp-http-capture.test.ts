import { expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { lstat, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../src/ce/deployment-store';
import { createGcpLifecycleHttpPort } from '../../src/ce/gcp-http';
import { assertOriginalGcpPlatformHttpBody, openGcpLifecycleHttpCapture } from '../../src/ce/gcp-http-capture';

const path = '/api/register/namespaces/system/tokens/node-a-token';
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function fixture(guard: () => Promise<void> = async () => {}) {
  const root = await mkdtemp(join(tmpdir(), 'gcp-platform-capture-'));
  const store = await CeDeploymentStore.open(root, {
    provider: 'gcp',
    engine: 'terraform',
    account: 'example-project',
    region: 'us-central1',
    deploymentId: 'fixture-deployment',
  });
  const capture = await openGcpLifecycleHttpCapture(store, guard, {
    siteNames: ['site-a'],
    tokenNames: ['node-a-token'],
  });
  return { root, store, capture };
}
it('complete token response is private, original-source bound and immutable on disk', async () => {
  const run = await fixture(),
    raw = Buffer.from('{"spec":{"content":"synthetic-private-token"}}');
  const port = createGcpLifecycleHttpPort(
    'https://tenant.example.test',
    'fixture',
    async () => new Response(raw),
    run.capture,
  );
  const value = await port.read(path);
  if (!value) throw new Error('Token response required');
  const reference = run.capture.evidenceFor(value);
  expect(reference.responseComplete).toBe(true);
  expect(reference.accepted).toBe(true);
  expect(reference.bootstrapOwnershipQualified).toBe(false);
  expect(JSON.stringify(reference)).not.toContain('synthetic-private-token');
  const original = await run.capture.read(reference);
  expect(original.bytes.equals(raw)).toBe(true);
  expect(hash(original.bytes)).toBe(reference.bodySha256);
  expect((await lstat(reference.bodyPath)).mode & 0o777).toBe(0o400);
  await assertOriginalGcpPlatformHttpBody(original);
  await expect(run.capture.read({ ...reference })).rejects.toThrow('Original');
  await expect(assertOriginalGcpPlatformHttpBody({ ...original })).rejects.toThrow('Original');
  const other = await openGcpLifecycleHttpCapture(run.store, async () => {}, {
    siteNames: ['site-a'],
    tokenNames: ['node-a-token'],
  });
  await expect(other.read(reference)).rejects.toThrow('Original');
});
it('HTTP errors retain complete private body without treating it as an accepted response', async () => {
  const run = await fixture(),
    raw = Buffer.from('{"error":"synthetic-private-error-body"}');
  const port = createGcpLifecycleHttpPort(
    'https://tenant.example.test',
    'fixture',
    async () => new Response(raw, { status: 403 }),
    run.capture,
  );
  await expect(port.read(path)).rejects.toThrow('403');
  const [reference] = run.capture.records();
  expect(reference.status).toBe(403);
  expect(reference.responseComplete).toBe(true);
  expect(reference.accepted).toBe(false);
  expect((await run.capture.read(reference)).bytes.equals(raw)).toBe(true);
  expect(JSON.stringify(run.capture.records())).not.toContain('synthetic-private-error-body');
});
it('stream bytes are durable before completion and abort leaves an incomplete capture', async () => {
  const run = await fixture(),
    controller = new AbortController(),
    raw = Buffer.from('{"spec":{"content":"synthetic-partial-token');
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(raw);
    },
  });
  const port = createGcpLifecycleHttpPort(
    'https://tenant.example.test',
    'fixture',
    async () => new Response(stream),
    run.capture,
  );
  const pending = port.read(path, controller.signal);
  const until = Date.now() + 3000;
  let body: string | undefined;
  while (Date.now() < until) {
    body = (await readdir(run.store.directory)).find((name) => name.endsWith('.body.private.bin'));
    if (body && (await readFile(join(run.store.directory, body))).equals(raw)) break;
    await Bun.sleep(10);
  }
  try {
    expect(body).toBeDefined();
    if (!body) throw new Error('Durable partial body required');
    expect((await readFile(join(run.store.directory, body))).equals(raw)).toBe(true);
  } finally {
    controller.abort();
  }
  await expect(pending).rejects.toThrow();
  const [reference] = run.capture.records();
  expect(reference.responseComplete).toBe(false);
  expect(reference.accepted).toBe(false);
  expect((await run.capture.read(reference)).bytes.equals(raw)).toBe(true);
});
it('same-byte replacement and modified body capabilities cannot supply original token evidence', async () => {
  const run = await fixture(),
    raw = Buffer.from('{"spec":{"content":"synthetic-original-token"}}');
  const port = createGcpLifecycleHttpPort(
    'https://tenant.example.test',
    'fixture',
    async () => new Response(raw),
    run.capture,
  );
  const value = await port.read(path);
  if (!value) throw new Error('Token response required');
  const reference = run.capture.evidenceFor(value),
    body = await run.capture.read(reference);
  body.bytes[0] = 0;
  await expect(assertOriginalGcpPlatformHttpBody(body)).rejects.toThrow('Original');
  value.spec = { content: 'synthetic-replaced-token' };
  expect(() => run.capture.evidenceFor(value)).toThrow('Original');
  await rm(reference.bodyPath);
  await writeFile(reference.bodyPath, raw, { mode: 0o400, flag: 'wx' });
  await expect(run.capture.read(reference)).rejects.toThrow('Original');
});
it('ownership rotation after transport retains bytes privately and refuses the response', async () => {
  let rotated = false;
  const run = await fixture(async () => {
    if (rotated) throw new Error('original credential changed');
  });
  const raw = Buffer.from('{"spec":{"content":"synthetic-rotated-input-token"}}');
  const port = createGcpLifecycleHttpPort(
    'https://tenant.example.test',
    'fixture',
    async () => {
      rotated = true;
      return new Response(raw);
    },
    run.capture,
  );
  await expect(port.read(path)).rejects.toThrow('credential changed');
  const [reference] = run.capture.records();
  expect(reference.accepted).toBe(false);
  expect((await readFile(reference.bodyPath)).equals(raw)).toBe(true);
  await expect(run.capture.read(reference)).rejects.toThrow('credential changed');
});
it('scope escapes never start private captures or authenticated requests', async () => {
  const run = await fixture();
  let calls = 0;
  const port = createGcpLifecycleHttpPort(
    'https://tenant.example.test',
    'fixture',
    async () => {
      calls++;
      return Response.json({});
    },
    run.capture,
  );
  await expect(port.read('https://foreign.test/token')).rejects.toThrow('scope');
  expect(calls).toBe(0);
  expect(run.capture.records()).toHaveLength(0);
  expect((await readdir(run.store.directory)).filter((name) => name.includes('gcp-http'))).toHaveLength(0);
});

it('a stream rejecting undefined cannot become an accepted empty token object', async () => {
  const run = await fixture();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(undefined);
    },
  });
  const port = createGcpLifecycleHttpPort(
    'https://tenant.example.test',
    'fixture',
    async () => new Response(stream),
    run.capture,
  );
  await expect(port.read(path)).rejects.toBeUndefined();
  const [reference] = run.capture.records();
  expect(reference.accepted).toBe(false);
  expect(reference.responseComplete).toBe(false);
  expect(reference.errorType).toBe('undefined');
});
it('bounded oversized bodies retain only the captured prefix and stay incomplete', async () => {
  const run = await fixture();
  const raw = Buffer.alloc(16 * 1024 * 1024 + 1, 120);
  const port = createGcpLifecycleHttpPort(
    'https://tenant.example.test',
    'fixture',
    async () => new Response(raw),
    run.capture,
  );
  await expect(port.read(path)).rejects.toThrow('malformed');
  const [reference] = run.capture.records();
  expect(reference.truncated).toBe(true);
  expect(reference.accepted).toBe(false);
  expect(reference.responseComplete).toBe(false);
  expect((await lstat(reference.bodyPath)).size).toBe(16 * 1024 * 1024);
});

it('same-family foreign token reads and foreign token creates refuse before capture or requests', async () => {
  const run = await fixture();
  let calls = 0;
  const port = createGcpLifecycleHttpPort(
    'https://tenant.example.test',
    'fixture',
    async () => {
      calls++;
      return Response.json({});
    },
    run.capture,
  );
  await expect(port.read('/api/register/namespaces/system/tokens/foreign-token')).rejects.toThrow('scope');
  await expect(
    port.mutate('/api/register/namespaces/system/tokens', 'POST', { metadata: { name: 'foreign-token' } }),
  ).rejects.toThrow('scope');
  await expect(port.read('/api/register/namespaces/system/tokens')).rejects.toThrow('scope');
  expect(calls).toBe(0);
});

it('capture persistence failure retains the original malformed response error and private bytes', async () => {
  const run = await fixture(),
    raw = Buffer.from('{"spec":{"content":"synthetic-malformed-token');
  const port = createGcpLifecycleHttpPort(
    'https://tenant.example.test',
    'fixture',
    async () => {
      const metadata = (await readdir(run.store.directory)).find((name) => name.endsWith('.capture.private.json'));
      if (!metadata) throw new Error('Initial metadata required');
      await rm(join(run.store.directory, metadata));
      await (await import('node:fs/promises')).mkdir(join(run.store.directory, metadata));
      return new Response(raw);
    },
    run.capture,
  );
  let failure: unknown;
  try {
    await port.read(path);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(AggregateError);
  if (!(failure instanceof AggregateError)) throw new Error('Original and persistence errors required');
  expect(failure.errors[0].message).toContain('malformed');
  expect(failure.errors[1].code).toBe('EISDIR');
  const body = (await readdir(run.store.directory)).find((name) => name.endsWith('.body.private.bin'));
  if (!body) throw new Error('Partial body required');
  expect((await readFile(join(run.store.directory, body))).equals(raw)).toBe(true);
  expect(run.capture.records()).toHaveLength(0);
});
