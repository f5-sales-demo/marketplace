export interface ProviderPackageRequest {
  directory: string;
  source: string;
  version: string;
  platform: 'darwin_arm64';
  executable: string;
  lock: string;
  lockSha256: string;
}
export interface VerifiedProviderPackage {
  source: string;
  version: string;
  platform: 'darwin_arm64';
  packageHash: string;
  executableSha256: string;
  filesSha256: Record<string, string>;
}
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
type Token = { kind: 'string' | 'word' | 'symbol'; value: string };

/** Narrow dependency-lock grammar; comments cannot introduce provider/version/hash fields. */
function lockEntries(raw: string) {
  if (Buffer.byteLength(raw) > 1024 * 1024) throw new Error('Bounded provider lock required');
  const tokens: Token[] = [];
  for (let offset = 0; offset < raw.length; ) {
    const tail = raw.slice(offset);
    const skipped = /^(?:\s+|#[^\r\n]*|\/\/[^\r\n]*|\/\*[\s\S]*?\*\/)/.exec(tail);
    if (skipped) {
      offset += skipped[0].length;
      continue;
    }
    const quoted = /^"(?:[^"\\\r\n]|\\.)*"/.exec(tail);
    if (quoted) {
      tokens.push({ kind: 'string', value: JSON.parse(quoted[0]) });
      offset += quoted[0].length;
      continue;
    }
    const word = /^[a-z][a-z_]*/.exec(tail);
    if (word) {
      tokens.push({ kind: 'word', value: word[0] });
      offset += word[0].length;
      continue;
    }
    if ('{}[]=,'.includes(tail[0])) {
      tokens.push({ kind: 'symbol', value: tail[0] });
      offset++;
      continue;
    }
    throw new Error('Unsupported provider lock grammar');
  }
  let position = 0;
  function take(kind: Token['kind'], value?: string): string {
    const token = tokens[position++];
    if (!token || token.kind !== kind || (value !== undefined && token.value !== value))
      throw new Error('Malformed provider lock');
    return token.value;
  }
  const result = new Map<string, { version: string; hashes: string[] }>();
  while (position < tokens.length) {
    take('word', 'provider');
    const source = take('string');
    if (result.has(source)) throw new Error('Unique provider lock entry required');
    take('symbol', '{');
    const fields = new Map<string, string | string[]>();
    while (tokens[position]?.value !== '}') {
      const name = take('word');
      if (!['version', 'constraints', 'hashes'].includes(name) || fields.has(name))
        throw new Error('Unique supported provider lock fields required');
      take('symbol', '=');
      if (name === 'hashes') {
        take('symbol', '[');
        const hashes: string[] = [];
        while (tokens[position]?.value !== ']') {
          hashes.push(take('string'));
          if (tokens[position]?.value === ',') take('symbol', ',');
          else if (tokens[position]?.value !== ']') throw new Error('Malformed provider lock hashes');
        }
        take('symbol', ']');
        fields.set(name, hashes);
      } else fields.set(name, take('string'));
    }
    take('symbol', '}');
    const version = fields.get('version'),
      hashes = fields.get('hashes');
    if (typeof version !== 'string' || !Array.isArray(hashes) || !hashes.length)
      throw new Error('Provider lock version and hashes required');
    result.set(source, { version, hashes });
  }
  return result;
}

/** Go sumdb/dirhash Hash1, plus exact original executable and Mach-O architecture admission.
 * The caller must obtain lockSha256 from its trusted reviewed configuration; this is not a signature check.
 * Reading a package does not qualify provider execution or authorize a cloud operation.
 */
export async function verifyProviderPackage(request: ProviderPackageRequest): Promise<VerifiedProviderPackage> {
  const { directory, source, version, platform, executable, lock, lockSha256 } = request;
  if (platform !== 'darwin_arm64') throw new Error('Provider package platform is not qualified');
  if (!/^registry\.terraform\.io\/[a-z0-9-]+\/[a-z0-9-]+$/.test(source) || !/^\d+\.\d+\.\d+$/.test(version))
    throw new Error('Exact provider source and version required');
  const name = source.split('/')[2];
  if (
    ![
      `terraform-provider-${name}_v${version}`,
      ...Array.from({ length: 10 }, (_, n) => `terraform-provider-${name}_v${version}_x${n}`),
    ].includes(executable)
  )
    throw new Error('Exact provider executable identity required');
  if (!/^[a-f0-9]{64}$/.test(lockSha256) || digest(lock) !== lockSha256)
    throw new Error('Reviewed provider lock changed');
  const entry = lockEntries(lock).get(source);
  if (!entry) throw new Error('Unique matching provider lock entry required');
  if (entry.version !== version) throw new Error('Provider lock version differs');
  const root = await lstat(directory);
  if (
    !isAbsolute(directory) ||
    resolve(directory) !== directory ||
    (await realpath(directory)) !== directory ||
    !root.isDirectory() ||
    root.isSymbolicLink() ||
    root.uid !== process.getuid?.()
  )
    throw new Error('Canonical original provider package required');
  const files: string[] = [];
  async function inventory(relative: string) {
    const parent = relative ? join(directory, relative) : directory;
    for (const child of (await readdir(parent)).sort()) {
      if (!/^[A-Za-z0-9_.-]+$/.test(child) || child === '.' || child === '..')
        throw new Error('Safe provider package file name required');
      const path = relative ? `${relative}/${child}` : child;
      const info = await lstat(join(directory, path));
      if (
        info.isSymbolicLink() ||
        info.uid !== process.getuid?.() ||
        (!info.isDirectory() && (!info.isFile() || info.nlink !== 1))
      )
        throw new Error('Original single-link provider package files required');
      if (info.isDirectory()) {
        if (path.split('/').length > 8) throw new Error('Bounded provider package depth required');
        await inventory(path);
      } else {
        files.push(path);
        if (files.length > 1024) throw new Error('Bounded provider package inventory required');
      }
    }
  }
  await inventory('');
  files.sort();
  if (!files.includes(executable)) throw new Error('Original provider executable unavailable');
  const filesSha256: Record<string, string> = {};
  let total = 0;
  for (const file of files) {
    const path = join(directory, file),
      before = await lstat(path);
    total += before.size;
    if (before.size > 512 * 1024 * 1024 || total > 1024 * 1024 * 1024)
      throw new Error('Bounded provider package bytes required');
    const bytes = await readFile(path),
      after = await lstat(path);
    if (
      !after.isFile() ||
      after.isSymbolicLink() ||
      after.nlink !== 1 ||
      before.ino !== after.ino ||
      before.dev !== after.dev ||
      before.mtimeMs !== after.mtimeMs ||
      before.ctimeMs !== after.ctimeMs ||
      bytes.length !== before.size ||
      after.size !== before.size ||
      after.uid !== process.getuid?.()
    )
      throw new Error('Original provider package changed during inspection');
    if (
      file === executable &&
      (bytes.length < 32 ||
        bytes.readUInt32LE(0) !== 0xfeedfacf ||
        bytes.readUInt32LE(4) !== 0x0100000c ||
        bytes.readUInt32LE(12) !== 2 ||
        !(after.mode & 0o111))
    )
      throw new Error('Provider executable architecture differs from darwin_arm64');
    filesSha256[file] = digest(bytes);
  }
  const summary = files.map((file) => `${filesSha256[file]}  ${file}\n`).join('');
  const packageHash = `h1:${createHash('sha256').update(summary).digest('base64')}`;
  if (!entry.hashes.includes(packageHash)) throw new Error('Provider contents differ from locked package');
  const firstInventory = JSON.stringify(files);
  files.splice(0);
  await inventory('');
  if (JSON.stringify(files.sort()) !== firstInventory) throw new Error('Original provider package inventory changed');
  return { source, version, platform, packageHash, executableSha256: filesSha256[executable], filesSha256 };
}

import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
