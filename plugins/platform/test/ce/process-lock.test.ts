import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireProcessLock } from '../../src/ce/process-lock';

const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true });
});

async function root() {
  const path = await mkdtemp(join(tmpdir(), 'ce-process-lock-'));
  directories.push(path);
  return path;
}

test('process lock excludes a live owner and releases only its own claim', async () => {
  const path = join(await root(), '.runner-lock');
  const release = await acquireProcessLock(path);
  await expect(acquireProcessLock(path)).rejects.toThrow('lock is held by a live process');
  await release();
  const next = await acquireProcessLock(path);
  await next();
});

test('process lock safely reclaims a verified dead-process claim', async () => {
  const path = join(await root(), '.ingress-lock');
  const release = await acquireProcessLock(path);
  const claim = JSON.parse(await readFile(join(path, 'claim.json'), 'utf8'));
  await release();
  await mkdir(path, { mode: 0o700 });
  await writeFile(join(path, 'claim.json'), JSON.stringify({ ...claim, pid: 2147483647 }), { mode: 0o600 });
  const recovered = await acquireProcessLock(path);
  await recovered();
});

test('process lock recovers after the owning process is killed', async () => {
  const path = join(await root(), '.runner-lock');
  const module = new URL('../../src/ce/process-lock.ts', import.meta.url).href;
  const child = Bun.spawn(
    [
      process.execPath,
      '-e',
      `import { acquireProcessLock } from ${JSON.stringify(module)}; await acquireProcessLock(${JSON.stringify(path)}); console.log('ready'); await new Promise(() => {});`,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const reader = child.stdout.getReader();
  const first = await reader.read();
  expect(new TextDecoder().decode(first.value)).toContain('ready');
  child.kill('SIGKILL');
  await child.exited;
  const recovered = await acquireProcessLock(path);
  await recovered();
});

test('process lock refuses malformed evidence instead of deleting an unknown lock', async () => {
  const path = join(await root(), '.runner-lock');
  await mkdir(path, { mode: 0o700 });
  await writeFile(join(path, 'claim.json'), '{}', { mode: 0o600 });
  await expect(acquireProcessLock(path)).rejects.toThrow('cannot be reconciled');
  expect(await readFile(join(path, 'claim.json'), 'utf8')).toBe('{}');
});
