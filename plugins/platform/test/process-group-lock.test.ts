import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireProcessLock } from '../src/ce/process-lock';

const python = process.env.CE_TEST_PYTHON ?? Bun.which('python3') ?? '';
async function original(body: string) {
  const child = Bun.spawn([python, '-c', `import os,sys,time,subprocess\nos.setsid()\n${body}`], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const reader = child.stdout.getReader();
  const first = await reader.read();
  if (first.done) throw new Error('Original group fixture never became ready');
  return Object.assign(child, {
    drainOriginal: async () => {
      while (!(await reader.read()).done) {
        /* Drain the same original reader to natural EOF. */
      }
      reader.releaseLock();
    },
  });
}

describe.skipIf(process.platform !== 'linux')('original executor group lifetime locks', () => {
  test('group-aware claims have a mandatory version and cannot release a live original', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ce-original-group-'));
    const path = join(root, '.terraform-executor-lock');
    const child = await original('print("ready",flush=True)\ntime.sleep(0.5)\n');
    let release: (() => Promise<void>) | undefined;
    try {
      release = await acquireProcessLock(path, child.pid, { trackProcessGroup: true });
      expect(JSON.parse(await readFile(join(path, 'claim.json'), 'utf8')).schemaVersion).toBe(2);
      await expect(release()).rejects.toThrow('process group remains live');
    } finally {
      await child.exited;
      await child.drainOriginal();
      if (release) await release();
    }
  });

  test('dead owner with an original live descendant cannot authorize reclaim', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ce-original-group-'));
    const path = join(root, '.terraform-executor-lock');
    const child = await original(
      'subprocess.Popen([sys.executable,"-c","import time;time.sleep(1)"])\nprint("ready",flush=True)\ntime.sleep(0.2)\n',
    );
    const release = await acquireProcessLock(path, child.pid, { trackProcessGroup: true });
    await child.exited;
    let unexpected: (() => Promise<void>) | undefined;
    try {
      await expect(
        (async () => {
          unexpected = await acquireProcessLock(path);
        })(),
      ).rejects.toThrow('process group remains live');
    } finally {
      await child.drainOriginal();
      if (unexpected) await unexpected();
      else await release();
    }
  });

  test('missing modern lifetime evidence cannot fall back to legacy reclaim', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ce-original-group-'));
    const path = join(root, '.terraform-executor-lock');
    const child = await original('print("ready",flush=True)\ntime.sleep(0.3)\n');
    const release = await acquireProcessLock(path, child.pid, { trackProcessGroup: true });
    await child.exited;
    await child.drainOriginal();
    await unlink(join(path, 'lifetime.json'));
    await expect(release()).rejects.toThrow();
    await expect(acquireProcessLock(path)).rejects.toThrow();
    expect(await Bun.file(join(path, 'claim.json')).exists()).toBe(true);
    // Preserve damaged evidence and its unresolved lock; no restoration or removal.
  });
});
