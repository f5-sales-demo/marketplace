import { expect, test } from 'bun:test';
import { chmod, link, mkdtemp, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readAzureTerraformParentPrivateFile } from '../../src/ce/terraform-parent-file-custody';

test('parent descriptor reader retains identity and rejects public, linked and aborted paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'azure-parent-file-custody-'));
  const path = join(root, 'packet.json'),
    backup = join(root, 'original.json');
  try {
    await writeFile(path, '{"owned":true}', { mode: 0o600 });
    const first = await readAzureTerraformParentPrivateFile(path);
    expect(first.bytes.toString()).toBe('{"owned":true}');
    await rename(path, backup);
    await writeFile(path, first.bytes, { mode: 0o600 });
    const replacement = await readAzureTerraformParentPrivateFile(path);
    expect(replacement.bytes).toEqual(first.bytes);
    expect(replacement.identity).not.toBe(first.identity);
    await rm(path);
    await symlink(backup, path);
    await expect(readAzureTerraformParentPrivateFile(path)).rejects.toThrow('private regular file required');
    await rm(path);
    await link(backup, path);
    await expect(readAzureTerraformParentPrivateFile(path)).rejects.toThrow('private regular file required');
    await rm(path);
    await rename(backup, path);
    await chmod(path, 0o644);
    await expect(readAzureTerraformParentPrivateFile(path)).rejects.toThrow('private regular file required');
    await chmod(path, 0o600);
    await chmod(root, 0o755);
    await expect(readAzureTerraformParentPrivateFile(path)).rejects.toThrow('private parent directory differs');
    await chmod(root, 0o700);
    await expect(readAzureTerraformParentPrivateFile('packet.json')).rejects.toThrow('absolute path required');
    const abort = new AbortController();
    abort.abort(Error('parent file cancellation'));
    await expect(readAzureTerraformParentPrivateFile(path, abort.signal)).rejects.toThrow('parent file cancellation');
    expect((await readAzureTerraformParentPrivateFile(path)).identity).toBe(first.identity);
  } finally {
    await chmod(root, 0o700);
    await rm(root, { recursive: true });
  }
});
