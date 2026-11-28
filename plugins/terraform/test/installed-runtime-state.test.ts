import { afterEach, expect, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, realpath, rename, rm, rmdir, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { admitInstalledRuntimeState } from '../src/installed-runtime-state';

const roots: string[] = [];
const monitors: Array<{ close(): void }> = [];
afterEach(async () => {
  for (const monitor of monitors.splice(0)) monitor.close();
  for (const root of roots.splice(0)) await rm(root, { recursive: true });
});
async function fixture() {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'terraform-state-admission-')));
  roots.push(home);
  await mkdir(join(home, '.local'), { mode: 0o700 });
  const target = join(home, 'owned-state');
  await mkdir(target, { mode: 0o700 });
  const route = join(home, '.local/state');
  return { home, target, route };
}
async function admit(env: Record<string, string | undefined>, home: string) {
  const state = await admitInstalledRuntimeState(env, home);
  monitors.push(state);
  return state;
}
test('ordinary default state alias binds its original canonical owned directory', async () => {
  const f = await fixture();
  await symlink(f.target, f.route);
  const state = await admit({}, f.home);
  expect(state.path).toBe(f.target);
  await state.assertOriginal();
  expect(await realpath(f.route)).toBe(f.target);
});
test('default state creates an absent owned directory through a canonical home route', async () => {
  const f = await fixture();
  const state = await admit({}, f.home);
  expect(state.path).toBe(f.route);
  await state.assertOriginal();
});
test('default state can create .local when the ordinary home has no state directories', async () => {
  const f = await fixture();
  await rmdir(join(f.home, '.local'));
  const state = await admit({}, f.home);
  expect(state.path).toBe(f.route);
  await state.assertOriginal();
});
test('explicit canonical state remains supported', async () => {
  const f = await fixture();
  const state = await admit({ XDG_STATE_HOME: f.target }, f.home);
  expect(state.path).toBe(f.target);
  await state.assertOriginal();
});
test('explicit state aliases and noncanonical paths remain refused', async () => {
  const f = await fixture();
  await symlink(f.target, f.route);
  for (const path of [f.route, '.', '', `${f.target}/..`, `${f.target}/`]) {
    await expect(admitInstalledRuntimeState({ XDG_STATE_HOME: path }, f.home)).rejects.toThrow();
  }
});
test('unsafe default target is refused before inspection directories are written', async () => {
  const f = await fixture();
  await symlink(f.target, f.route);
  await chmod(f.target, 0o777);
  await expect(admitInstalledRuntimeState({}, f.home)).rejects.toThrow();
  expect(await Bun.file(join(f.target, 'xcsh/terraform/runtime-inspections')).exists()).toBe(false);
});
test('foreign default target is refused without creating an application directory', async () => {
  const f = await fixture();
  await symlink('/usr', f.route);
  await expect(admitInstalledRuntimeState({}, f.home)).rejects.toThrow();
});
test('retargeted default alias refuses further use and remains refused after restoration', async () => {
  const f = await fixture();
  await symlink(f.target, f.route);
  const state = await admit({}, f.home);
  const other = join(f.home, 'other-state');
  await mkdir(other, { mode: 0o700 });
  await unlink(f.route);
  await symlink(other, f.route);
  await expect(state.assertOriginal()).rejects.toThrow();
  await unlink(f.route);
  await symlink(f.target, f.route);
  await expect(state.assertOriginal()).rejects.toThrow();
});
test('canonical directory replacement remains refused after the original inode is restored', async () => {
  const f = await fixture();
  const state = await admit({ XDG_STATE_HOME: f.target }, f.home);
  const held = join(f.home, 'held-state');
  await rename(f.target, held);
  await mkdir(f.target, { mode: 0o700 });
  await expect(state.assertOriginal()).rejects.toThrow();
  await rmdir(f.target);
  await rename(held, f.target);
  await expect(state.assertOriginal()).rejects.toThrow();
});
test('default route parent replacement is refused even with the same canonical target', async () => {
  const f = await fixture();
  await symlink(f.target, f.route);
  const state = await admit({}, f.home);
  await rename(join(f.home, '.local'), join(f.home, 'held-local'));
  await mkdir(join(f.home, '.local'), { mode: 0o700 });
  await symlink(f.target, f.route);
  await expect(state.assertOriginal()).rejects.toThrow();
});
test('private inspection and unrelated state writes preserve the admitted directory lifetime', async () => {
  const f = await fixture();
  await symlink(f.target, f.route);
  const state = await admit({}, f.home);
  await mkdir(join(state.path, 'xcsh'), { mode: 0o700 });
  await writeFile(join(state.path, 'other-app.private.json'), '{}', { mode: 0o600 });
  await state.assertOriginal();
});
test('closed state admission cannot be used for another inspection', async () => {
  const f = await fixture();
  const state = await admit({ XDG_STATE_HOME: f.target }, f.home);
  state.close();
  await expect(state.assertOriginal()).rejects.toThrow();
});

test('explicit absent nested canonical state creates only its owned canonical components', async () => {
  const f = await fixture();
  const target = join(f.home, 'new-state-parent/state');
  const state = await admit({ XDG_STATE_HOME: target }, f.home);
  expect(state.path).toBe(target);
  await state.assertOriginal();
});
test('unobserved route replacement and restoration cannot revive the original admission', async () => {
  const f = await fixture();
  await symlink(f.target, f.route);
  const state = await admit({}, f.home);
  const held = join(f.home, 'held-original-alias');
  await rename(f.route, held);
  await symlink(f.home, f.route);
  await unlink(f.route);
  await rename(held, f.route);
  await new Promise<void>((done) => setImmediate(done));
  await expect(state.assertOriginal()).rejects.toThrow();
});

test('unobserved canonical directory replacement and original inode restoration stays refused', async () => {
  const f = await fixture();
  const state = await admit({ XDG_STATE_HOME: f.target }, f.home);
  const held = join(f.home, 'held-canonical-state');
  await rename(f.target, held);
  await mkdir(f.target, { mode: 0o700 });
  await rmdir(f.target);
  await rename(held, f.target);
  await new Promise<void>((done) => setImmediate(done));
  await expect(state.assertOriginal()).rejects.toThrow();
});
