import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveInstalledTerraformExecutable, selectPinnedTerraformInput } from '../src/installed-terraform-executable';
import type { OriginalInputBinding } from '../src/original-input-monitor';

const digest = 'a'.repeat(64);
const input = (path: string, sha256 = digest): OriginalInputBinding => ({ path, sha256 });
test('requested version chooses its original cached input over a different ambient executable', () => {
  const cached = input('/example/versions/1.17.1/terraform');
  expect(selectPinnedTerraformInput(digest, cached, input('/example/bin/terraform', 'b'.repeat(64)))).toBe(cached);
});
test('a corrupt cache cannot fall through to an ambient executable, even one matching the expected digest', () => {
  expect(() =>
    selectPinnedTerraformInput(
      digest,
      input('/example/versions/1.17.1/terraform', 'b'.repeat(64)),
      input('/example/bin/terraform'),
    ),
  ).toThrow('cached');
});
test('an absent cache admits only the original exact ambient digest', () => {
  const ambient = input('/example/bin/terraform');
  expect(selectPinnedTerraformInput(digest, undefined, ambient)).toBe(ambient);
  expect(() => selectPinnedTerraformInput(digest, undefined, input('/example/bin/terraform', 'b'.repeat(64)))).toThrow(
    'executable',
  );
  expect(() => selectPinnedTerraformInput(digest, undefined, undefined)).toThrow('executable');
});

test('an unsafe existing cache root cannot fall through when its version file is missing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ce-cache-boundary-'));
  try {
    const bin = join(root, 'bin');
    const cache = join(root, 'versions');
    await mkdir(bin, { mode: 0o700 });
    await mkdir(cache, { mode: 0o700 });
    await chmod(cache, 0o777);
    const bytes = Buffer.from('source fixture only');
    await writeFile(join(bin, 'terraform'), bytes, { mode: 0o755 });
    const profile = { terraformVersion: '1.17.1', terraformSha256: createHash('sha256').update(bytes).digest('hex') };
    await expect(
      resolveInstalledTerraformExecutable(profile, { PATH: bin, XCSH_TERRAFORM_EXECUTABLES_DIR: cache }),
    ).rejects.toThrow('cache');
  } finally {
    await rm(root, { recursive: true });
  }
});
