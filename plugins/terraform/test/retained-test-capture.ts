/** Private Linux fixture snapshots. These artifacts never establish guest acceptance. */
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, mkdtemp, open, readdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve, sep } from 'node:path';

class CaptureRetentionFailure extends Error {
  constructor(readonly directory: string) {
    super('Private capture retention remains incomplete');
  }
}
const uid = () => BigInt(process.getuid?.() ?? -1);
const directoryFlags = constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;
const maximumFile = 128 * 1024 * 1024,
  maximumTotal = 512 * 1024 * 1024;
const privateDirectory = (value: Awaited<ReturnType<Awaited<ReturnType<typeof open>>['stat']>>) =>
  value.isDirectory() && BigInt(value.uid) === uid() && (BigInt(value.mode) & 0o077n) === 0n;

export async function retainOwnedTestCapture(root: string, label: string, outcome: 'success' | 'failure') {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(label)) throw new Error('Private capture label required');
  if (process.platform !== 'linux' || !isAbsolute(root) || resolve(root) !== root || (await realpath(root)) !== root)
    throw new Error('Canonical private Linux capture source required');
  const source = await open(root, directoryFlags);
  let destination: string | undefined;
  try {
    const originalRoot = await source.stat({ bigint: true });
    if (!privateDirectory(originalRoot)) throw new Error('Owned private capture source required');
    const configured = process.env.CE_TEST_CAPTURE_ARTIFACTS;
    if (configured) {
      const base = resolve(configured);
      if (!isAbsolute(configured) || base !== configured || base === root || base.startsWith(root + sep))
        throw new Error('Private capture archive must survive source cleanup');
      await mkdir(base, { recursive: true, mode: 0o700 });
      const metadata = await lstat(base, { bigint: true });
      if (!privateDirectory(metadata) || (await realpath(base)) !== base)
        throw new Error('Canonical owned private capture archive required');
      destination = await mkdtemp(join(base, `${label}-`));
    } else destination = await mkdtemp(join(tmpdir(), `gcp-retained-${label}-`));
    await mkdir(join(destination, 'capture'), { mode: 0o700 });
    const archiveDirectory = destination;
    const files: Record<string, unknown>[] = [],
      failures: Record<string, unknown>[] = [],
      ipc: string[] = [];
    let total = 0;
    const walk = async (directory: Awaited<ReturnType<typeof open>>, relative: string): Promise<void> => {
      const initial = await directory.stat({ bigint: true });
      if (!privateDirectory(initial)) throw new Error('Owned private capture directory required');
      const descriptorPath = `/proc/self/fd/${directory.fd}`;
      for (const name of (await readdir(descriptorPath)).sort()) {
        const child = join(descriptorPath, name),
          entry = relative ? join(relative, name) : name;
        try {
          const metadata = await lstat(child, { bigint: true });
          if (metadata.isSymbolicLink() || metadata.uid !== uid()) throw new Error('Unsafe capture entry');
          if (metadata.isFIFO() || metadata.isSocket()) {
            ipc.push(entry);
            continue;
          }
          if (metadata.isDirectory()) {
            const nested = await open(child, directoryFlags);
            try {
              await walk(nested, entry);
            } finally {
              await nested.close();
            }
            continue;
          }
          if (!metadata.isFile() || metadata.nlink !== 1n || (metadata.mode & 0o077n) !== 0n)
            throw new Error('Owned private regular capture file required');
          const input = await open(child, constants.O_RDONLY | constants.O_NOFOLLOW);
          try {
            const before = await input.stat({ bigint: true });
            if (before.dev !== metadata.dev || before.ino !== metadata.ino || before.size > BigInt(maximumFile))
              throw new Error('Capture file changed or exceeds retention bound');
            const target = join(archiveDirectory, 'capture', entry);
            await mkdir(resolve(target, '..'), { recursive: true, mode: 0o700 });
            const output = await open(target, 'wx', 0o400),
              hash = createHash('sha256');
            let bytes = 0;
            try {
              const buffer = Buffer.alloc(1024 * 1024);
              for (;;) {
                const read = await input.read(buffer, 0, buffer.length, null);
                if (!read.bytesRead) break;
                bytes += read.bytesRead;
                total += read.bytesRead;
                if (bytes > maximumFile || total > maximumTotal) throw new Error('Capture retention bound exceeded');
                const chunk = buffer.subarray(0, read.bytesRead);
                hash.update(chunk);
                await output.writeFile(chunk);
              }
              await output.sync();
            } finally {
              await output.close();
            }
            const after = await input.stat({ bigint: true });
            const current = await lstat(child, { bigint: true });
            const stable = ['dev', 'ino', 'uid', 'nlink', 'mode', 'size', 'mtimeNs', 'ctimeNs'].every(
              (key) =>
                before[key as keyof typeof before] === after[key as keyof typeof after] &&
                after[key as keyof typeof after] === current[key as keyof typeof current],
            );
            files.push({ path: entry, bytes, sha256: hash.digest('hex'), stable });
            if (!stable) failures.push({ path: entry, reason: 'source-changed' });
          } finally {
            await input.close();
          }
        } catch (error) {
          failures.push({ path: entry, errorType: error instanceof Error ? error.name : typeof error });
        }
      }
      const last = await directory.stat({ bigint: true });
      if (
        initial.dev !== last.dev ||
        initial.ino !== last.ino ||
        initial.uid !== last.uid ||
        initial.mode !== last.mode ||
        initial.ctimeNs !== last.ctimeNs ||
        initial.mtimeNs !== last.mtimeNs
      )
        failures.push({ path: relative, reason: 'directory-changed' });
    };
    try {
      await walk(source, '');
    } catch (error) {
      failures.push({ errorType: error instanceof Error ? error.name : typeof error });
    }
    const manifest = {
      schemaVersion: 1,
      kind: 'private-test-capture-retention',
      outcome,
      status: failures.length ? 'incomplete' : 'retained',
      source: root,
      files,
      failures,
      excludedIpc: ipc,
      guestAcceptanceComplete: false,
    };
    const raw = Buffer.from(JSON.stringify(manifest));
    const handle = await open(join(destination, 'manifest.private.json'), 'wx', 0o400);
    try {
      await handle.writeFile(raw);
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (failures.length) throw new CaptureRetentionFailure(destination);
    return Object.freeze({
      directory: destination,
      manifestSha256: createHash('sha256').update(raw).digest('hex'),
      files: files.length,
      guestAcceptanceComplete: false as const,
    });
  } finally {
    await source.close();
  }
}
