import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openGcpObserverImageReader } from '../src/gcp-observer-image';
import { GoogleComputeReadError, openGoogleAdcComputeReader } from '../src/google-adc-authentication';

const imageUrl =
  'https://compute.googleapis.com/compute/v1/projects/ubuntu-os-cloud/global/images/ubuntu-2404-noble-amd64-v20261021';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const credential = {
  type: 'authorized_user',
  client_id: 'synthetic-client',
  client_secret: 'synthetic-secret',
  refresh_token: 'synthetic-refresh',
  quota_project_id: 'example-project',
};
const image = () => ({
  kind: 'compute#image',
  id: '4996011480491275419',
  name: 'ubuntu-2404-noble-amd64-v20261021',
  selfLink: imageUrl.replace('compute.googleapis.com', 'www.googleapis.com'),
  status: 'READY',
  architecture: 'X86_64',
  creationTimestamp: '2026-10-21T00:00:00.000Z',
});
function network(reply: () => Response = () => Response.json(image())) {
  const calls: Array<{ url: string; options?: RequestInit }> = [];
  const fetcher = (async (url: string | URL | Request, options?: RequestInit) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1)
      return Response.json({ access_token: 'synthetic-access', token_type: 'Bearer', expires_in: 3599 });
    if (calls.length === 2)
      return Response.json({
        email: 'principal@example.com',
        verified_email: true,
        audience: credential.client_id,
        issued_to: credential.client_id,
        expires_in: 3599,
        scope: 'https://www.googleapis.com/auth/cloud-platform',
      });
    if (calls.length === 3) return Response.json({ projectId: 'example-project', lifecycleState: 'ACTIVE' });
    return reply();
  }) as typeof fetch;
  return { calls, fetcher };
}
const authentication = (assertOriginal: () => Promise<void> = async () => {}) => ({
  credentialBytes: Buffer.from(JSON.stringify(credential)),
  project: 'example-project',
  accountSha256: hash('principal@example.com'),
  audienceSha256: hash(credential.client_id),
  assertOriginal,
});

test('original ADC reader exposes only the fixed observer-image GET without serializing credentials', async () => {
  const n = network();
  const reader = await openGoogleAdcComputeReader(authentication(), undefined, n.fetcher);
  const result = await reader.observerImage();
  expect(n.calls.at(-1)?.url).toBe(imageUrl);
  expect(n.calls.at(-1)?.options?.method).toBe('GET');
  expect(n.calls.at(-1)?.options?.redirect).toBe('error');
  expect(n.calls.at(-1)?.options?.body).toBeUndefined();
  expect(result.complete).toBe(true);
  expect(result.truncated).toBe(false);
  expect(JSON.parse(Buffer.from(result.raw).toString())).toEqual(image());
  expect(JSON.stringify(result)).not.toContain('synthetic-access');
  expect(JSON.stringify(reader.authentication)).not.toContain('synthetic-refresh');
  for (const args of [['foreign-project'], [imageUrl], [null], [{ approved: true }]])
    expect(() => reader.observerImage(...args)).toThrow('fixed observer');
  expect(n.calls).toHaveLength(4);
});
test('observer image read retains its response when original input changes during capture', async () => {
  let original = true;
  const n = network(() => {
    original = false;
    return Response.json(image());
  });
  const reader = await openGoogleAdcComputeReader(
    authentication(async () => {
      if (!original) throw new Error('private original changed');
    }),
    undefined,
    n.fetcher,
  );
  const failure = await reader.observerImage().catch((error) => error);
  expect(failure).toBeInstanceOf(GoogleComputeReadError);
  expect(failure.capture.status).toBe(200);
  expect(failure.capture.complete).toBe(false);
  expect(JSON.parse(Buffer.from(failure.capture.raw).toString())).toEqual(image());
  expect(String(failure)).not.toContain('private original changed');
});
test('observer image byte bound keeps a truncated private capture without widening its allowance', async () => {
  const n = network(() => new Response('x'.repeat(4 * 1024 * 1024 + 1)));
  const reader = await openGoogleAdcComputeReader(authentication(), undefined, n.fetcher);
  const failure = await reader.observerImage().catch((error) => error);
  expect(failure).toBeInstanceOf(GoogleComputeReadError);
  expect(failure.capture.truncated).toBe(true);
  expect(failure.capture.complete).toBe(false);
  expect(failure.capture.raw.byteLength).toBe(4 * 1024 * 1024);
});

async function imageFixture(reply: () => Response = () => Response.json(image())) {
  const root = await mkdtemp(join(tmpdir(), 'ce-observer-image-'));
  const n = network(reply);
  let original = true;
  let guardEffect: (() => Promise<void>) | undefined;
  const auth = authentication(async () => {
    if (!original) throw new Error('private image input changed');
    await guardEffect?.();
  });
  try {
    const reader = await openGcpObserverImageReader({ root, authentication: auth }, undefined, n.fetcher);
    return {
      root,
      n,
      reader,
      setGuard: (effect: () => Promise<void>) => {
        guardEffect = effect;
      },
      changeOwner: () => {
        original = false;
      },
      close: () => rm(root, { recursive: true }),
    };
  } catch (error) {
    await rm(root, { recursive: true });
    throw error;
  }
}
test('observer image producer issues original private evidence with separate resource and owning projects', async () => {
  const f = await imageFixture();
  try {
    const record = await f.reader.read();
    expect(record).toMatchObject({
      schemaVersion: 1,
      kind: 'original-gcp-observer-image-candidate',
      owningProject: 'example-project',
      imageProject: 'ubuntu-os-cloud',
      imageId: '4996011480491275419',
      observerExecutionAuthorized: false,
    });
    expect(Object.isFrozen(record)).toBe(true);
    const raw = await f.reader.readEvidence(record);
    expect(JSON.parse(Buffer.from(raw).toString())).toEqual(image());
    await expect(f.reader.readEvidence({ ...record })).rejects.toThrow('reader-issued');
    expect((await readdir(f.root)).filter((p) => p.endsWith('.body.private.bin'))).toHaveLength(1);
  } finally {
    await f.close();
  }
});
test('wrong image identities are retained privately and retire the original observer reader', async () => {
  for (const change of [
    { id: '1' },
    { id: Number(image().id) },
    { name: 'ubuntu-latest' },
    { selfLink: imageUrl },
    { architecture: 'ARM64' },
    { status: 'DEPRECATED' },
    { kind: 'compute#instance' },
    { creationTimestamp: '2026-02-30T00:00:00Z' },
    { creationTimestamp: '2099-01-01T00:00:00Z' },
  ]) {
    const f = await imageFixture(() => Response.json({ ...image(), ...change }));
    try {
      await expect(f.reader.read()).rejects.toThrow('observer image');
      const paths = (await readdir(f.root)).filter((p) => p.endsWith('.body.private.bin'));
      expect(paths).toHaveLength(1);
      expect(JSON.parse(await readFile(join(f.root, paths[0]), 'utf8'))).toEqual({ ...image(), ...change });
      const calls = f.n.calls.length;
      await expect(f.reader.read()).rejects.toThrow('retired');
      expect(f.n.calls).toHaveLength(calls);
    } finally {
      await f.close();
    }
  }
});
test('malformed and truncated image replies retain partial captures without issuing original evidence', async () => {
  for (const reply of [
    () => new Response('{"id":1,"id":2}'),
    () => Response.json([]),
    () => new Response('x'.repeat(4 * 1024 * 1024 + 1)),
    () => Response.json({ error: { code: 404 } }, { status: 404 }),
  ]) {
    const f = await imageFixture(reply);
    try {
      await expect(f.reader.read()).rejects.toThrow();
      expect((await readdir(f.root)).filter((p) => p.endsWith('.body.private.bin'))).toHaveLength(1);
      expect((await readdir(f.root)).filter((p) => p.endsWith('.receipt.private.json'))).toHaveLength(1);
    } finally {
      await f.close();
    }
  }
});
test('original image evidence cannot adopt rewritten bytes or changed ownership', async () => {
  const f = await imageFixture();
  try {
    const record = await f.reader.read();
    await rm(record.path);
    await writeFile(record.path, JSON.stringify(image()), { mode: 0o400 });
    await expect(f.reader.readEvidence(record)).rejects.toThrow('input');
  } finally {
    await f.close();
  }
  const second = await imageFixture();
  try {
    const record = await second.reader.read();
    second.changeOwner();
    await expect(second.reader.readEvidence(record)).rejects.toThrow('original');
  } finally {
    await second.close();
  }
});
test('stale observer image evidence cannot gain a new freshness window', async () => {
  const f = await imageFixture();
  try {
    const record = await f.reader.read();
    const realNow = Date.now;
    try {
      Date.now = () => record.finishedAt + 300001;
      await expect(f.reader.readEvidence(record)).rejects.toThrow('fresh');
    } finally {
      Date.now = realNow;
    }
  } finally {
    await f.close();
  }
});

test('observer image evidence rejects changes during its final original-input guard', async () => {
  const f = await imageFixture();
  try {
    const record = await f.reader.read();
    let guards = 0;
    f.setGuard(async () => {
      if (++guards === 2) {
        await rm(record.path);
        await writeFile(record.path, JSON.stringify(image()), { mode: 0o400 });
      }
    });
    await expect(f.reader.readEvidence(record)).rejects.toThrow('input');
  } finally {
    await f.close();
  }
});
