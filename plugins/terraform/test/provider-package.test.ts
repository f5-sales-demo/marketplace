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
  await expect(verifyProviderPackage({ ...request, platform: 'windows_amd64' } as never)).rejects.toThrow('platform');
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

function linuxBinary(): Buffer {
  const bytes = Buffer.alloc(64);
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1]);
  bytes.writeUInt16LE(2, 16); // ELF executable.
  bytes.writeUInt16LE(62, 18); // AMD64.
  bytes.writeUInt32LE(1, 20);
  bytes.writeUInt16LE(64, 52);
  return bytes;
}
async function linuxFixture(bytes = linuxBinary()): Promise<ProviderPackageRequest> {
  const request = await fixture();
  await writeFile(join(request.directory, executable), bytes, { mode: 0o700 });
  const hash = `h1:${createHash('sha256')
    .update(`${sha(license)}  LICENSE.txt\n${sha(bytes)}  ${executable}\n`)
    .digest('base64')}`;
  const lock = request.lock.replace(packageHash, hash);
  return { ...request, platform: 'linux_amd64', lock, lockSha256: sha(lock) };
}
test('Linux AMD64 package verification binds original ELF bytes and exact lock', async () => {
  const request = await linuxFixture();
  const result = await verifyProviderPackage(request);
  expect(result.platform).toBe('linux_amd64');
  expect(result.executableSha256).toBe(sha(linuxBinary()));
  expect(result.filesSha256['LICENSE.txt']).toBe(sha(license));
  await writeFile(join(request.directory, 'LICENSE.txt'), 'changed');
  await expect(verifyProviderPackage(request)).rejects.toThrow('locked package');
});
test('Linux rejects malformed, foreign and non-executable ELF headers even with matching locks', async () => {
  const cases: Buffer[] = [Buffer.alloc(0), linuxBinary().subarray(0, 63), Buffer.from(binary)];
  for (const [offset, value] of [
    [0, 0],
    [4, 1],
    [5, 2],
    [6, 0],
    [16, 1],
    [16, 4],
    [18, 183],
    [20, 0],
    [52, 32],
  ]) {
    const bytes = linuxBinary();
    bytes[offset] = value;
    cases.push(bytes);
  }
  for (const bytes of cases) {
    const request = await linuxFixture(bytes);
    await expect(verifyProviderPackage(request)).rejects.toThrow('architecture');
  }
});
test('platform labels cannot substitute Mach-O and ELF packages', async () => {
  const elf = await linuxFixture();
  await expect(verifyProviderPackage({ ...elf, platform: 'darwin_arm64' })).rejects.toThrow('architecture');
  const macho = await fixture();
  await expect(verifyProviderPackage({ ...macho, platform: 'linux_amd64' })).rejects.toThrow('architecture');
});
test('Linux shared-object executable header is accepted and missing execution permission is refused', async () => {
  const bytes = linuxBinary();
  bytes.writeUInt16LE(3, 16); // Position independent executable.
  const request = await linuxFixture(bytes);
  expect((await verifyProviderPackage(request)).executableSha256).toBe(sha(bytes));
  await writeFile(join(request.directory, executable), bytes, { mode: 0o600 });
  const { chmod } = await import('node:fs/promises');
  await chmod(join(request.directory, executable), 0o600);
  await expect(verifyProviderPackage(request)).rejects.toThrow('architecture');
});
