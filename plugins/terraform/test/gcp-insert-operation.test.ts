import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openGcpCloudSerialReader } from '../src/gcp-cloud-serial-reader';

const hash = (v: string) => createHash('sha256').update(v).digest('hex');
const credential = {
  type: 'authorized_user',
  client_id: 'example-client',
  client_secret: 'example-secret',
  refresh_token: 'example-refresh',
  quota_project_id: 'example-project',
};
const projectRoot = 'https://www.googleapis.com/compute/v1/projects/example-project/zones/us-central1-a';
const operation = {
  name: 'operation-1700000000000-abcdef-012345-abcdef',
  id: '18446744073709551614',
  operationType: 'insert',
  status: 'RUNNING',
  zone: projectRoot,
  selfLink: `${projectRoot}/operations/operation-1700000000000-abcdef-012345-abcdef`,
  targetLink: `${projectRoot}/instances/example-node`,
  targetId: '18446744073709551613',
  insertTime: '2026-11-09T00:00:00Z',
};
async function fixture(replies: unknown[]) {
  const root = await mkdtemp(join(tmpdir(), 'gcp-insert-operation-'));
  const calls: string[] = [];
  const fetcher = (async (url: string | URL | Request) => {
    calls.push(String(url));
    const path = new URL(String(url)).pathname;
    if (path === '/token')
      return Response.json({ access_token: 'example-access', token_type: 'Bearer', expires_in: 3599 });
    if (path === '/oauth2/v2/tokeninfo')
      return Response.json({
        email: 'principal@example.com',
        verified_email: true,
        audience: credential.client_id,
        issued_to: credential.client_id,
        scope: 'https://www.googleapis.com/auth/cloud-platform',
        expires_in: 3599,
      });
    if (path === '/v1/projects/example-project')
      return Response.json({ projectId: 'example-project', lifecycleState: 'ACTIVE' });
    const reply = replies.shift();
    if (!reply) throw new Error('Unexpected original operation read');
    return Response.json(reply);
  }) as typeof fetch;
  const reader = await openGcpCloudSerialReader(
    {
      root,
      region: 'us-central1',
      authentication: {
        credentialBytes: Buffer.from(JSON.stringify(credential)),
        project: 'example-project',
        accountSha256: hash('principal@example.com'),
        audienceSha256: hash(credential.client_id),
        assertOriginal: async () => {},
      },
    },
    undefined,
    fetcher,
  );
  return { reader, root, calls };
}

test('original insert operation candidate preserves exact uint64 target identity and private raw evidence', async () => {
  const f = await fixture([operation]);
  const candidate = await f.reader.insertOperation('us-central1-a', operation.name, 'example-node');
  expect(candidate.operationId).toBe(operation.id);
  expect(candidate.targetId).toBe(operation.targetId);
  expect(candidate.applyPhaseQualified).toBe(false);
  expect(candidate.originalInsertQualified).toBe(false);
  expect(f.calls.at(-1)).toBe(
    'https://compute.googleapis.com/compute/v1/projects/example-project/zones/us-central1-a/operations/' +
      operation.name,
  );
  expect(await readFile(candidate.path, 'utf8')).toBe(JSON.stringify(operation));
});

test('asynchronous insert candidate permits a missing target only until that original operation supplies it', async () => {
  const { targetId: _target, ...pending } = operation;
  const f = await fixture([pending, operation]);
  expect((await f.reader.insertOperation('us-central1-a', operation.name, 'example-node')).targetId).toBeNull();
  expect((await f.reader.insertOperation('us-central1-a', operation.name, 'example-node')).targetId).toBe(
    operation.targetId,
  );
});

test('foreign, replaced, wrong-kind and malformed operation identities retain evidence and refuse', async () => {
  for (const change of [
    { targetLink: `${projectRoot}/instances/foreign-node` },
    { operationType: 'update' },
    { id: 123 },
    { targetId: '18446744073709551616' },
    { status: 'UNKNOWN' },
    { selfLink: `${projectRoot}/operations/foreign` },
  ]) {
    const f = await fixture([{ ...operation, ...change }]);
    await expect(f.reader.insertOperation('us-central1-a', operation.name, 'example-node')).rejects.toThrow();
    expect(
      (await readdir(f.root)).some((n) => n.startsWith('insert-operation-') && n.endsWith('.body.private.bin')),
    ).toBe(true);
  }
  const f = await fixture([operation, { ...operation, id: '18446744073709551612' }]);
  await f.reader.insertOperation('us-central1-a', operation.name, 'example-node');
  await expect(f.reader.insertOperation('us-central1-a', operation.name, 'example-node')).rejects.toThrow('changed');
});

test('operation scope and URL injection refuse before any Compute call', async () => {
  const f = await fixture([]);
  for (const [zone, name, node] of [
    ['us-east1-a', operation.name, 'example-node'],
    ['us-central1-a', '../other', 'example-node'],
    ['us-central1-a', `${operation.name}?x=1`, 'example-node'],
    ['us-central1-a', operation.name, 'node;id'],
  ]) {
    await expect(f.reader.insertOperation(zone, name, node)).rejects.toThrow();
  }
  expect(f.calls).toHaveLength(3);
});

test('documented numeric operation lookup binds its returned original id and rejects out-of-range lookup', async () => {
  const f = await fixture([operation]);
  expect((await f.reader.insertOperation('us-central1-a', operation.id, 'example-node')).operationId).toBe(
    operation.id,
  );
  expect(f.calls.at(-1)).toEndWith(`/operations/${operation.id}`);
  await expect(f.reader.insertOperation('us-central1-a', '18446744073709551616', 'example-node')).rejects.toThrow();
});

test('operation creation timestamps reject coercible dates and invalid calendar days after retaining raw bytes', async () => {
  for (const insertTime of ['1', '2026-02-30T00:00:00Z', '2026-11-09', '2026-11-09T00:00:00']) {
    const f = await fixture([{ ...operation, insertTime }]);
    await expect(f.reader.insertOperation('us-central1-a', operation.name, 'example-node')).rejects.toThrow();
    expect((await readdir(f.root)).some((name) => name.endsWith('.body.private.bin'))).toBe(true);
  }
});

test('documented RFC3339 operation timestamps preserve UTC offsets and subsecond precision', async () => {
  const insertTime = '2026-11-09T00:00:00.123456789-08:00';
  const f = await fixture([{ ...operation, insertTime }]);
  const candidate = await f.reader.insertOperation('us-central1-a', operation.name, 'example-node');
  expect(JSON.parse(await readFile(candidate.path, 'utf8')).insertTime).toBe(insertTime);
});
