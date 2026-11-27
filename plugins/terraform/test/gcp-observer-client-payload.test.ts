/** Source artifact/callback joins; cloud observations are offline fixtures. */
import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as payload from '../src/gcp-observer-client-payload';
import pins from '../src/gcp-ssh-client-pins.json';
import { closeOriginalGcpSshClientProfile } from '../src/gcp-ssh-client-profile';
import { openInstalledGcpSshClientProfile } from '../src/installed-ssh-clients';
import { withObserverInsert } from './fixtures/observer-insert.fixture';

const python = process.env.CE_TEST_PYTHON ?? '';
if (!python) throw new Error('Original test Python prerequisite required');
async function installed() {
  const root = await mkdtemp(join(tmpdir(), 'gcp-observer-client-payload-'));
  const clients = join(root, 'clients');
  const child = Bun.spawn(
    [python, '-I', '-B', join(import.meta.dir, '../scripts/install_ssh_clients.py'), '--clients-dir', clients],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(`Original fixture client installation failed: ${stderr}`);
  expect(JSON.parse(stdout).status).toBe('ready');
  const profile = await openInstalledGcpSshClientProfile({ XCSH_TERRAFORM_SSH_CLIENTS_DIR: clients });
  return { root, clients, profile };
}
test('observer delivery payload joins the exact installed archive and actual callback without granting guest execution', async () => {
  await withObserverInsert(async (input) => {
    const f = await installed();
    let ref: unknown;
    try {
      ref = await payload.openOriginalGcpObserverClientPayload(f.profile, input.callback);
      const original = await payload.readOriginalGcpObserverClientPayload(ref);
      expect(original.input.path).toBe(join(f.clients, 'archive.zip'));
      expect(original.input.sha256).toBe(pins.archiveSha256);
      expect(original.bytes).toBe(1_021_474);
      expect(original.callback).toBe(input.callback);
      expect(original.guestClientQualified).toBe(false);
      expect(Object.isFrozen(original.input)).toBe(true);
      expect(Object.isFrozen(original.input.expectedIdentity)).toBe(true);
      expect(Object.isFrozen(original.input.expectedParentIdentity)).toBe(true);
      await expect(payload.readOriginalGcpObserverClientPayload({ ...(ref as object) })).rejects.toThrow('Original');
      await expect(payload.assertOriginalGcpObserverClientPayloadContext(ref, { ...input.callback })).rejects.toThrow(
        'Original',
      );
      await expect(payload.openOriginalGcpObserverClientPayload({ ...f.profile }, input.callback)).rejects.toThrow(
        'Original',
      );
      await expect(payload.openOriginalGcpObserverClientPayload(f.profile, { ...input.callback })).rejects.toThrow(
        'Original',
      );
      await payload.assertOriginalGcpObserverClientPayloadContext(ref, input.callback);
    } finally {
      if (ref) payload.closeOriginalGcpObserverClientPayload(ref);
      closeOriginalGcpSshClientProfile(f.profile);
      await rm(f.root, { recursive: true, force: true });
    }
  });
}, 60000);
test('delivery payload and installed profile retire on same-byte original archive replacement', async () => {
  await withObserverInsert(async (input) => {
    const f = await installed();
    let ref: unknown;
    try {
      ref = await payload.openOriginalGcpObserverClientPayload(f.profile, input.callback);
      const path = join(f.clients, 'archive.zip'),
        bytes = await readFile(path);
      await rename(path, `${path}.original`);
      await writeFile(path, bytes, { mode: 0o400 });
      await expect(payload.readOriginalGcpObserverClientPayload(ref)).rejects.toThrow();
      await rm(path);
      await rename(`${path}.original`, path);
      await expect(payload.readOriginalGcpObserverClientPayload(ref)).rejects.toThrow('retired');
      payload.closeOriginalGcpObserverClientPayload(ref);
      payload.closeOriginalGcpObserverClientPayload(ref);
      await expect(payload.readOriginalGcpObserverClientPayload(ref)).rejects.toThrow('retired');
    } finally {
      if (ref) payload.closeOriginalGcpObserverClientPayload(ref);
      closeOriginalGcpSshClientProfile(f.profile);
      await rm(f.root, { recursive: true, force: true });
    }
  });
}, 60000);
