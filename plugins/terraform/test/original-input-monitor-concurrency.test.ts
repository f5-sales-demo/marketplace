import { afterEach, expect, spyOn, test } from 'bun:test';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { monitorOriginalInputs } from '../src/original-input-monitor';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true });
});
async function fixture() {
  const root = await fs.mkdtemp(join(tmpdir(), 'original-input-concurrency-'));
  roots.push(root);
  const path = join(root, 'input.private');
  await fs.writeFile(path, 'original', { mode: 0o400 });
  const monitor = await monitorOriginalInputs({
    input: { path, sha256: createHash('sha256').update('original').digest('hex') },
  });
  return { root, path, monitor };
}
function countReads(beforeRead?: () => Promise<void>) {
  const originalOpen = fs.open;
  let reads = 0;
  const spy = spyOn(fs, 'open').mockImplementation(async (...args: Parameters<typeof fs.open>) => {
    const handle = await originalOpen(...args);
    return new Proxy(handle, {
      get(target, key) {
        if (key === 'createReadStream')
          return (...options: Parameters<typeof handle.createReadStream>) => {
            const stream = handle.createReadStream(...options);
            return new Proxy(stream, {
              get(source, property) {
                if (property === Symbol.asyncIterator)
                  return async function* () {
                    reads++;
                    await beforeRead?.();
                    for await (const chunk of source) yield chunk;
                  };
                const value = Reflect.get(source, property, source);
                return typeof value === 'function' ? value.bind(source) : value;
              },
            });
          };
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  });
  return { reads: () => reads, close: () => spy.mockRestore() };
}
test('concurrent full verification reads each original file once and gives every caller a verified result', async () => {
  const f = await fixture();
  const counter = countReads();
  try {
    await Promise.all(Array.from({ length: 3 }, () => f.monitor.assertOriginal()));
    expect(counter.reads()).toBe(1);
  } finally {
    counter.close();
    f.monitor.close();
  }
});
test('a settled verification cannot satisfy a later boundary or cache its original bytes', async () => {
  const f = await fixture();
  const counter = countReads();
  try {
    await Promise.all(Array.from({ length: 3 }, () => f.monitor.assertOriginal()));
    await Promise.all(Array.from({ length: 3 }, () => f.monitor.assertOriginal()));
    expect(counter.reads()).toBe(2);
  } finally {
    counter.close();
    f.monitor.close();
  }
});
test('identity-only callers cannot satisfy concurrent full digest verification', async () => {
  const f = await fixture();
  const counter = countReads();
  try {
    await Promise.all([
      f.monitor.assertOriginalIdentity(),
      f.monitor.assertOriginal(),
      f.monitor.assertOriginalIdentity(),
      f.monitor.assertOriginal(),
    ]);
    expect(counter.reads()).toBe(1);
  } finally {
    counter.close();
    f.monitor.close();
  }
});
test('closing an in-flight verification rejects every waiting caller and all subsequent boundaries', async () => {
  const f = await fixture();
  let closed = false;
  const counter = countReads(async () => {
    if (!closed) {
      closed = true;
      f.monitor.close();
    }
  });
  try {
    const results = await Promise.allSettled(Array.from({ length: 3 }, () => f.monitor.assertOriginal()));
    expect(results.every((row) => row.status === 'rejected')).toBe(true);
    await expect(f.monitor.assertOriginal()).rejects.toThrow('Original input monitor');
  } finally {
    counter.close();
    f.monitor.close();
  }
});
test('same-byte replacement during the shared read permanently rejects every waiter', async () => {
  const f = await fixture();
  let replaced = false;
  const counter = countReads(async () => {
    if (replaced) return;
    replaced = true;
    const replacement = join(f.root, 'replacement.private');
    await fs.writeFile(replacement, 'original', { mode: 0o400 });
    await fs.rename(replacement, f.path);
  });
  try {
    const results = await Promise.allSettled(Array.from({ length: 3 }, () => f.monitor.assertOriginal()));
    expect(results.every((row) => row.status === 'rejected')).toBe(true);
    await expect(f.monitor.assertOriginalIdentity()).rejects.toThrow('Original input monitor');
    await expect(f.monitor.assertOriginal()).rejects.toThrow('Original input monitor');
  } finally {
    counter.close();
    f.monitor.close();
  }
});
test('concurrent identity checks perform no digest reads and still reject replaced inputs', async () => {
  const f = await fixture();
  const counter = countReads();
  try {
    await Promise.all(Array.from({ length: 3 }, () => f.monitor.assertOriginalIdentity()));
    expect(counter.reads()).toBe(0);
    const replacement = join(f.root, 'replacement.private');
    await fs.writeFile(replacement, 'original', { mode: 0o400 });
    await fs.rename(replacement, f.path);
    const results = await Promise.allSettled(Array.from({ length: 3 }, () => f.monitor.assertOriginalIdentity()));
    expect(results.every((row) => row.status === 'rejected')).toBe(true);
  } finally {
    counter.close();
    f.monitor.close();
  }
});
