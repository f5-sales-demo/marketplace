import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { link, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type ProviderPackageRequest, verifyProviderPackage } from '../src/provider-package';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true });
});
const sha = (raw: string | Uint8Array) => createHash('sha256').update(raw).digest('hex');
const executable = 'terraform-provider-example_v1.2.3';
const binary = Buffer.alloc(32);
binary.writeUInt32LE(0xfeedfacf, 0);
binary.writeUInt32LE(0x0100000c, 4);
binary.writeUInt32LE(2, 12); // Mach-O executable, not a relocatable object.
const license = 'Example fixture license\n';
// The Go Hash1 summary consists of each file digest, two spaces and its name.
const packageHash = `h1:${createHash('sha256')
  .update(`${sha(license)}  LICENSE.txt\n${sha(binary)}  ${executable}\n`)
  .digest('base64')}`;
async function fixture(): Promise<ProviderPackageRequest> {
  const directory = await mkdtemp(join(tmpdir(), 'provider-package-'));
  roots.push(directory);
  await writeFile(join(directory, executable), binary, { mode: 0o700 });
  await writeFile(join(directory, 'LICENSE.txt'), license, { mode: 0o600 });
  const lock = `provider "registry.terraform.io/example/example" {\n  version = "1.2.3"\n  hashes = ["${packageHash}", "zh:${'0'.repeat(64)}"]\n}\n`;
  return {
    directory,
    source: 'registry.terraform.io/example/example',
    version: '1.2.3',
    platform: 'darwin_arm64',
    executable,
    lock,
    lockSha256: sha(lock),
  };
}
test('verified package binds every file, exact executable, provider version and architecture', async () => {
  const request = await fixture();
  expect(await verifyProviderPackage(request)).toEqual({
    source: request.source,
    version: request.version,
    platform: request.platform,
    packageHash,
    executableSha256: sha(binary),
    filesSha256: { 'LICENSE.txt': sha(license), [executable]: sha(binary) },
  });
});
test('altered package contents or extra files cannot reuse the original lock hash', async () => {
  const request = await fixture();
  await writeFile(join(request.directory, 'LICENSE.txt'), 'changed');
  await expect(verifyProviderPackage(request)).rejects.toThrow('locked package');
  const added = await fixture();
  await writeFile(join(added.directory, 'extra.txt'), 'foreign file');
  await expect(verifyProviderPackage(added)).rejects.toThrow('locked package');
});
test('changed lock, absent version and duplicate provider blocks are refused', async () => {
  const request = await fixture();
  await expect(verifyProviderPackage({ ...request, lock: `${request.lock}\n` })).rejects.toThrow('lock');
  await expect(
    verifyProviderPackage({ ...request, version: '1.2.4', executable: 'terraform-provider-example_v1.2.4' }),
  ).rejects.toThrow('version');
  const duplicate = request.lock + request.lock;
  await expect(verifyProviderPackage({ ...request, lock: duplicate, lockSha256: sha(duplicate) })).rejects.toThrow(
    'Unique',
  );
});
test('symlinks, hard links and aliased roots are refused even when bytes match', async () => {
  const request = await fixture();
  await rm(join(request.directory, 'LICENSE.txt'));
  const target = join(request.directory, 'original.txt');
  await writeFile(target, license);
  await symlink(target, join(request.directory, 'LICENSE.txt'));
  await expect(verifyProviderPackage(request)).rejects.toThrow(/original/i);
  const hard = await fixture();
  await link(join(hard.directory, executable), join(hard.directory, 'alias'));
  await expect(verifyProviderPackage(hard)).rejects.toThrow(/original/i);
  const parent = await mkdtemp(join(tmpdir(), 'provider-alias-'));
  roots.push(parent);
  await symlink(hard.directory, join(parent, 'alias'));
  await expect(verifyProviderPackage({ ...hard, directory: join(parent, 'alias') })).rejects.toThrow(/original/i);
});
test('wrong platform and executable identity cannot be asserted by a matching package hash', async () => {
  const request = await fixture();
  await expect(verifyProviderPackage({ ...request, platform: 'linux_amd64' } as never)).rejects.toThrow('platform');
  await expect(verifyProviderPackage({ ...request, executable: '../foreign' })).rejects.toThrow('executable');
  const wrong = Buffer.from(binary);
  wrong.writeUInt32LE(0x01000007, 4);
  await writeFile(join(request.directory, executable), wrong);
  const changedHash = `h1:${createHash('sha256')
    .update(`${sha(license)}  LICENSE.txt\n${sha(wrong)}  ${executable}\n`)
    .digest('base64')}`;
  const lock = request.lock.replace(packageHash, changedHash);
  await expect(verifyProviderPackage({ ...request, lock, lockSha256: sha(lock) })).rejects.toThrow('architecture');
});
test('unsafe nested path names fail closed', async () => {
  const request = await fixture();
  await mkdir(join(request.directory, 'nested'));
  await writeFile(join(request.directory, 'nested', 'line\nbreak'), 'foreign');
  await expect(verifyProviderPackage(request)).rejects.toThrow('name');
});

test('comments cannot supply a version or an accepted hash', async () => {
  const request = await fixture();
  const lock = `${request.lock.replace(`"${packageHash}"`, `"h1:${'A'.repeat(43)}="`)}\n# hashes = ["${packageHash}"]\n`;
  await expect(verifyProviderPackage({ ...request, lock, lockSha256: sha(lock) })).rejects.toThrow('locked package');
  const noVersion = request.lock.replace('version = "1.2.3"', '# version = "1.2.3"');
  await expect(verifyProviderPackage({ ...request, lock: noVersion, lockSha256: sha(noVersion) })).rejects.toThrow(
    'version',
  );
});
