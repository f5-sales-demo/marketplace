import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { monitorOriginalInputs } from '../src/original-input-monitor';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
async function fixture(
  run: (path: string, monitor: Awaited<ReturnType<typeof monitorOriginalInputs>>) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), 'monitor-refusal-reason-'));
  const path = join(root, 'private-credential-name');
  await writeFile(path, 'private-original-content', { mode: 0o400 });
  const monitor = await monitorOriginalInputs({ credential: { path, sha256: hash('private-original-content') } });
  try {
    await run(path, monitor);
  } finally {
    monitor.close();
    await rm(root, { recursive: true });
  }
}
async function refusal(monitor: Awaited<ReturnType<typeof monitorOriginalInputs>>, path: string) {
  let caught: unknown;
  try {
    await monitor.assertOriginal();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  expect(String(caught)).not.toContain(path);
  expect(JSON.stringify(caught)).not.toContain('private-original-content');
  expect(JSON.stringify(caught)).not.toContain('private-credential-name');
  return caught as Error & { reason?: string };
}

test('closed input monitor has a sanitized stable reason', async () => {
  await fixture(async (path, monitor) => {
    monitor.close();
    const error = await refusal(monitor, path);
    expect(error.name).toBe('OriginalInputMonitorError');
    expect(error.reason).toBe('monitor-closed');
  });
});
test('watcher refusal preserves its first cause after file restoration and closure', async () => {
  await fixture(async (path, monitor) => {
    await chmod(path, 0o600);
    await Bun.sleep(25);
    const first = await refusal(monitor, path);
    expect(first.reason).toBe('watcher-event');
    await chmod(path, 0o400);
    const restored = await refusal(monitor, path);
    expect(restored.reason).toBe(first.reason);
    monitor.close();
    expect((await refusal(monitor, path)).reason).toBe(first.reason);
  });
});
test('initial byte mismatch is attributed without retaining filesystem or credential data', async () => {
  const root = await mkdtemp(join(tmpdir(), 'monitor-byte-reason-'));
  const path = join(root, 'private-credential-name');
  await writeFile(path, 'private-original-content', { mode: 0o400 });
  try {
    let caught: unknown;
    try {
      await monitorOriginalInputs({ credential: { path, sha256: hash('different') } });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ name: 'OriginalInputMonitorError', reason: 'bytes-changed' });
    expect(String(caught)).not.toContain(path);
    expect(JSON.stringify(caught)).not.toContain('private-original-content');
    expect(JSON.stringify(caught)).not.toContain('private-credential-name');
  } finally {
    await rm(root, { recursive: true });
  }
});
