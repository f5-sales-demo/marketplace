/** Source setup and original-input tests; no cloud or SSH authentication. */
import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { terraformSshClientInstallArgv } from '../extensions/integration';
import pins from '../src/gcp-ssh-client-pins.json';
import { closeOriginalGcpSshClientProfile, readOriginalGcpSshClientProfile } from '../src/gcp-ssh-client-profile';
import { openInstalledGcpSshClientProfile } from '../src/installed-ssh-clients';

const python = process.env.CE_TEST_PYTHON;
if (!python) throw new Error('Original test Python prerequisite required');
test('supported Linux setup uses the shipped installer and keeps the client installation in user scope', () => {
  const args = terraformSshClientInstallArgv('linux');
  expect(args.slice(0, 3)).toEqual(['python3', '-I', '-B']);
  expect(args[3]).toBe(join(import.meta.dir, '../scripts/install_ssh_clients.py'));
  expect(args).not.toContain('sudo');
  expect(() => terraformSshClientInstallArgv('darwin')).toThrow('Linux AMD64');
});
test('normal pinned installer output becomes an original default client profile and retires on declaration replacement', async () => {
  const base = await mkdtemp(join(tmpdir(), 'installed-gcp-ssh-'));
  const root = join(base, 'clients');
  let profile: unknown;
  try {
    const child = Bun.spawn(
      [python, '-I', '-B', join(import.meta.dir, '../scripts/install_ssh_clients.py'), '--clients-dir', root],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    const stdout = await new Response(child.stdout).text();
    const stderr = await new Response(child.stderr).text();
    expect(await child.exited).toBe(0);
    expect(stderr).toBe('');
    expect(JSON.parse(stdout).status).toBe('ready');
    profile = await openInstalledGcpSshClientProfile({ XCSH_TERRAFORM_SSH_CLIENTS_DIR: root });
    const original = await readOriginalGcpSshClientProfile(profile);
    expect(original.version).toBe('10.6p2');
    for (const name of ['ssh', 'ssh-keyscan', 'ssh-keygen'])
      expect(original.files[name].sha256).toBe(pins.files[name as keyof typeof pins.files].sha256);
    const path = join(root, 'installation.json'),
      bytes = await readFile(path);
    await rename(path, `${path}.original`);
    await writeFile(path, bytes, { mode: 0o400 });
    await expect(readOriginalGcpSshClientProfile(profile)).rejects.toThrow();
    await rm(path);
    await rename(`${path}.original`, path);
    await expect(readOriginalGcpSshClientProfile(profile)).rejects.toThrow('retired');
  } finally {
    if (profile) closeOriginalGcpSshClientProfile(profile);
    await rm(base, { recursive: true, force: true });
  }
}, 60000);
test('missing user clients report the supported setup prerequisite', async () => {
  const base = await mkdtemp(join(tmpdir(), 'missing-gcp-ssh-'));
  try {
    await expect(
      openInstalledGcpSshClientProfile({ XCSH_TERRAFORM_SSH_CLIENTS_DIR: join(base, 'missing') }),
    ).rejects.toThrow('set up');
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
