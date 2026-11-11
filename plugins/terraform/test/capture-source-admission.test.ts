import { afterEach, expect, test } from 'bun:test';
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectInstalledCaptureScripts } from '../src/installed-runtime';
import { monitorOriginalInputs } from '../src/original-input-monitor';

const names = [
  '__init__.py',
  'guest_pty.py',
  'gcp_guest_session.py',
  'guest_control.py',
  'guest_worker.py',
  'gcp_provider_process.py',
  'gcp_provider_reader.py',
];
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ce-capture-sources-'));
  roots.push(root);
  const scripts = join(root, 'scripts');
  await mkdir(scripts, { mode: 0o700 });
  for (const name of names) await copyFile(join(import.meta.dir, '../scripts', name), join(scripts, name));
  return scripts;
}

test('installed capture sources admit exact shipped bytes with immutable file and parent bindings', async () => {
  const scripts = await fixture();
  const inputs = await inspectInstalledCaptureScripts(scripts);
  expect(Object.keys(inputs).sort()).toEqual(names.map((name) => `script:${name}`).sort());
  expect(Object.isFrozen(inputs)).toBe(true);
  const monitor = await monitorOriginalInputs(inputs);
  try {
    await monitor.assertOriginal();
  } finally {
    monitor.close();
  }
});

test('missing or changed capture sources refuse before a reader can execute', async () => {
  const scripts = await fixture();
  await writeFile(join(scripts, 'gcp_provider_reader.py'), 'raise RuntimeError("unqualified source")\n');
  await expect(inspectInstalledCaptureScripts(scripts)).rejects.toThrow('capture sources');
  await rm(join(scripts, 'gcp_provider_reader.py'));
  await expect(inspectInstalledCaptureScripts(scripts)).rejects.toThrow('capture sources');
});

test('same-byte source aliases and replacements cannot inherit admitted script identity', async () => {
  const scripts = await fixture();
  const path = join(scripts, 'gcp_provider_reader.py');
  const inputs = await inspectInstalledCaptureScripts(scripts);
  const monitor = await monitorOriginalInputs(inputs);
  try {
    const bytes = await readFile(path);
    await rename(path, `${path}.original`);
    await writeFile(path, bytes);
    await expect(monitor.assertOriginal()).rejects.toThrow();
  } finally {
    monitor.close();
  }
  await rm(path);
  await symlink(`${path}.original`, path);
  await expect(inspectInstalledCaptureScripts(scripts)).rejects.toThrow('capture sources');
});
