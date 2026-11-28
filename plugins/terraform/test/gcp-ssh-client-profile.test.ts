import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as profile from '../src/gcp-ssh-client-profile';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'gcp-ssh-client-profile-'));
  roots.push(root);
  await chmod(root, 0o700);
  const bin = join(root, 'bin');
  await mkdir(bin, { mode: 0o700 });
  const files: Record<string, string> = {};
  for (const name of ['ssh', 'ssh-keyscan', 'ssh-keygen']) {
    const bytes = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.from(`explicit-offline-${name}`)]);
    await writeFile(join(bin, name), bytes, { mode: 0o500 });
    files[name] = createHash('sha256').update(bytes).digest('hex');
  }
  return { root, bin, pins: { version: '10.6p2', files } };
}
test('client profile retains exact executable identity and rejects a copied reference', async () => {
  const f = await fixture();
  const ref = await profile.openGcpSshClientProfile(f.root, { pins: f.pins });
  const view = await profile.readOriginalGcpSshClientProfile(ref);
  expect(view.version).toBe('10.6p2');
  expect(view.files['ssh-keyscan'].sha256).toBe(f.pins.files['ssh-keyscan']);
  await expect(profile.readOriginalGcpSshClientProfile({ ...ref })).rejects.toThrow('Original');
});
test('client profile rejects wrong bytes, executable mode and symlink substitution', async () => {
  for (const change of ['bytes', 'mode', 'symlink']) {
    const f = await fixture();
    const path = join(f.bin, 'ssh-keyscan');
    if (change === 'bytes') {
      await chmod(path, 0o700);
      await writeFile(path, 'foreign');
    }
    if (change === 'mode') await chmod(path, 0o600);
    if (change === 'symlink') {
      await rename(path, `${path}.original`);
      await symlink(`${path}.original`, path);
    }
    await expect(profile.openGcpSshClientProfile(f.root, { pins: f.pins })).rejects.toThrow();
  }
});
test('same-byte replacement retires a client profile even after restoring the original path', async () => {
  const f = await fixture();
  const ref = await profile.openGcpSshClientProfile(f.root, { pins: f.pins });
  const path = join(f.bin, 'ssh');
  const bytes = await readFile(path);
  await rename(path, `${path}.original`);
  await writeFile(path, bytes, { mode: 0o500 });
  await expect(profile.readOriginalGcpSshClientProfile(ref)).rejects.toThrow();
  await rm(path);
  await rename(`${path}.original`, path);
  await expect(profile.readOriginalGcpSshClientProfile(ref)).rejects.toThrow('retired');
});

test('caller mutations cannot rewrite the admitted client version or pins', async () => {
  const f = await fixture();
  const ref = await profile.openGcpSshClientProfile(f.root, { pins: f.pins });
  f.pins.version = 'foreign';
  f.pins.files.ssh = 'f'.repeat(64);
  expect((await profile.readOriginalGcpSshClientProfile(ref)).version).toBe('10.6p2');
});

test('client profile closure rejects copied references and retires exactly once', async () => {
  const f = await fixture();
  const ref = await profile.openGcpSshClientProfile(f.root, { pins: f.pins });
  expect(() => profile.closeOriginalGcpSshClientProfile({ ...ref })).toThrow('Original');
  expect((await profile.readOriginalGcpSshClientProfile(ref)).version).toBe('10.6p2');
  profile.closeOriginalGcpSshClientProfile(ref);
  profile.closeOriginalGcpSshClientProfile(ref);
  await expect(profile.readOriginalGcpSshClientProfile(ref)).rejects.toThrow('retired');
});

test('installation guards cannot replace any original executable monitor binding', async () => {
  const f = await fixture();
  const ref = await profile.openGcpSshClientProfile(f.root, { pins: f.pins });
  try {
    const view = await profile.readOriginalGcpSshClientProfile(ref);
    const attempt = profile.openGcpSshClientProfile(f.root, { pins: f.pins, originalInputs: { ssh: view.files.ssh } });
    try {
      await expect(attempt).rejects.toThrow('collide');
    } finally {
      const unexpected = await attempt.catch(() => undefined);
      if (unexpected) profile.closeOriginalGcpSshClientProfile(unexpected);
    }
  } finally {
    profile.closeOriginalGcpSshClientProfile(ref);
  }
});

test('returned original executable bindings cannot be rewritten to a foreign owned executable', async () => {
  const f = await fixture();
  const ref = await profile.openGcpSshClientProfile(f.root, { pins: f.pins });
  try {
    const original = await profile.readOriginalGcpSshClientProfile(ref);
    const path = join(f.bin, 'foreign');
    const bytes = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.from('foreign-unreviewed')]);
    await writeFile(path, bytes, { mode: 0o500 });
    const { readOwnedInstalledInput } = await import('../src/installed-runtime');
    const foreign = await readOwnedInstalledInput(path);
    try {
      Object.assign(original.files.ssh, foreign.binding);
    } catch (error) {
      expect(error).toBeInstanceOf(TypeError);
    }
    const current = await profile.readOriginalGcpSshClientProfile(ref);
    expect(current.files.ssh.path).toBe(join(f.bin, 'ssh'));
    expect(current.files.ssh.sha256).toBe(f.pins.files.ssh);
    expect(Object.isFrozen(current.files.ssh)).toBe(true);
    expect(Object.isFrozen(current.files.ssh.expectedIdentity)).toBe(true);
    expect(Object.isFrozen(current.files.ssh.expectedParentIdentity)).toBe(true);
  } finally {
    profile.closeOriginalGcpSshClientProfile(ref);
  }
});
