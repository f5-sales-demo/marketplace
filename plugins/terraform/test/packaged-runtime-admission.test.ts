import { afterEach, expect, test } from 'bun:test';
import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true });
});
async function installed() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'packaged-terraform-admission-')));
  roots.push(root);
  const plugin = join(root, 'plugins/cache/plugins/admission-staging___terraform___snapshot');
  await mkdir(plugin, { recursive: true, mode: 0o700 });
  await cp(new URL('../runtime/', import.meta.url), join(plugin, 'runtime'), { recursive: true });
  const runtime = await import(pathToFileURL(join(plugin, 'runtime/index.js')).href);
  return { root, plugin, runtime };
}
test('isolated packaged runtime exposes read-only admission without source sibling directories', async () => {
  const { plugin, runtime } = await installed();
  expect(await Bun.file(join(plugin, 'src/installed-runtime.ts')).exists()).toBe(false);
  expect(typeof runtime.assertInstalledRuntime).toBe('function');
  expect(typeof runtime.readOwnedInstalledInput).toBe('function');
  expect(typeof runtime.monitorOriginalInputs).toBe('function');
});
test('packaged admission retains the missing-setup refusal', async () => {
  const { root, runtime } = await installed();
  expect(typeof runtime.assertInstalledRuntime).toBe('function');
  await expect(runtime.assertInstalledRuntime({ XCSH_TERRAFORM_RUNTIME_DIR: join(root, 'absent') })).rejects.toThrow(
    'set up the Terraform',
  );
});
test('packaged original-input monitor refuses changed bytes and remains refused after restoration', async () => {
  const { root, runtime } = await installed();
  expect(typeof runtime.readOwnedInstalledInput).toBe('function');
  expect(typeof runtime.monitorOriginalInputs).toBe('function');
  const input = join(root, 'original.private.txt');
  await writeFile(input, 'original bytes', { flag: 'wx', mode: 0o600 });
  const original = await runtime.readOwnedInstalledInput(input);
  const monitor = await runtime.monitorOriginalInputs({ original: original.binding });
  try {
    await monitor.assertOriginal();
    await writeFile(input, 'changed bytes');
    await expect(monitor.assertOriginal()).rejects.toThrow('changed identity or bytes');
    await writeFile(input, 'original bytes');
    await expect(monitor.assertOriginal()).rejects.toThrow('changed identity or bytes');
  } finally {
    monitor.close();
  }
});
