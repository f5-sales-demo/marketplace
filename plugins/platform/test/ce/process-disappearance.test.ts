import { afterEach, expect, spyOn, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  acquireProcessLock,
  assertExecutorGroupClosed,
  assertExecutorProcessGroupAbsent,
} from '../../src/ce/process-lock';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true });
});
async function fixture() {
  const root = await fs.mkdtemp(join(tmpdir(), 'ce-proc-disappearance-'));
  roots.push(root);
  const path = join(root, '.runner-lock');
  await fs.mkdir(path, { mode: 0o700 });
  const claim = {
    schemaVersion: 2,
    token: randomUUID(),
    pid: 2147483647,
    bootId: (await fs.readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim(),
    processStartTicks: '1',
    group: 2147483647,
  };
  const raw = JSON.stringify(claim);
  await fs.writeFile(join(path, 'claim.json'), raw, { mode: 0o600 });
  await fs.writeFile(join(path, 'lifetime.json'), raw, { mode: 0o400 });
  return { path, raw };
}
test('disappearing proc entries accept ENOENT or ESRCH without releasing the original claim', async () => {
  for (const code of ['ENOENT', 'ESRCH']) {
    const { path, raw } = await fixture();
    const original = fs.readFile;
    let observed = false;
    const mock = spyOn(fs, 'readFile').mockImplementation(
      new Proxy(original, {
        apply(target, receiver, args) {
          if (String(args[0]) === `/proc/${process.pid}/stat`) {
            observed = true;
            return Promise.reject(Object.assign(new Error('Offline disappeared proc entry'), { code }));
          }
          return Reflect.apply(target, receiver, args);
        },
      }),
    );
    try {
      await assertExecutorProcessGroupAbsent(path);
      expect(observed).toBe(true);
    } finally {
      mock.mockRestore();
    }
    expect(await fs.readFile(join(path, 'claim.json'), 'utf8')).toBe(raw);
    expect(await fs.readFile(join(path, 'lifetime.json'), 'utf8')).toBe(raw);
  }
});
test('permission and IO failures cannot authorize physical closure or clear unresolved capture', async () => {
  for (const code of ['EACCES', 'EPERM', 'EIO']) {
    const { path, raw } = await fixture();
    const original = fs.readFile;
    const mock = spyOn(fs, 'readFile').mockImplementation(
      new Proxy(original, {
        apply(target, receiver, args) {
          if (String(args[0]) === `/proc/${process.pid}/stat`)
            return Promise.reject(Object.assign(new Error('Offline unavailable proc entry'), { code }));
          return Reflect.apply(target, receiver, args);
        },
      }),
    );
    try {
      await expect(assertExecutorProcessGroupAbsent(path)).rejects.toMatchObject({ code });
    } finally {
      mock.mockRestore();
    }
    expect(await fs.readFile(join(path, 'claim.json'), 'utf8')).toBe(raw);
  }
  const { path, raw } = await fixture();
  await fs.writeFile(join(path, 'capture-unresolved.json'), '{"complete":false}', { mode: 0o400 });
  await expect(assertExecutorGroupClosed(path)).rejects.toThrow('capture closure remains unresolved');
  expect(await fs.readFile(join(path, 'claim.json'), 'utf8')).toBe(raw);
});
test('ESRCH on a dead owner permits reclamation only after independent group absence', async () => {
  const { path } = await fixture();
  const original = fs.readFile;
  let observed = false;
  const mock = spyOn(fs, 'readFile').mockImplementation(
    new Proxy(original, {
      apply(target, receiver, args) {
        if (String(args[0]) === '/proc/2147483647/stat') {
          observed = true;
          return Promise.reject(Object.assign(new Error('Offline vanished owner'), { code: 'ESRCH' }));
        }
        return Reflect.apply(target, receiver, args);
      },
    }),
  );
  let release: (() => Promise<void>) | undefined;
  try {
    release = await acquireProcessLock(path);
    expect(observed).toBe(true);
  } finally {
    mock.mockRestore();
  }
  await release?.();
});
