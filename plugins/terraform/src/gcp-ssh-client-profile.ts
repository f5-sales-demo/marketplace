import { lstat, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import clientPins from './gcp-ssh-client-pins.json';
import { readOwnedInstalledInput } from './installed-runtime';
import type { OriginalInputBinding } from './original-input-monitor';
import { assertSameOriginalInput, monitorOriginalInputs } from './original-input-monitor';

const names = ['ssh', 'ssh-keyscan', 'ssh-keygen'] as const;
const defaultPins = Object.freeze({
  version: clientPins.version,
  files: Object.freeze(
    Object.fromEntries(Object.entries(clientPins.files).map(([name, declaration]) => [name, declaration.sha256])),
  ),
});
export interface OriginalGcpSshClientProfile {
  readonly schemaVersion: 1;
  readonly kind: 'original-gcp-ssh-client-reference';
}
export interface GcpSshClientProfileOptions {
  /** Explicit offline fixture pins; the installed factory supplies no override. */
  readonly pins?: { readonly version: string; readonly files: Readonly<Record<string, string>> };
  /** Extra original installed artifact/declaration bindings, verified by the source-owned installed loader. */
  readonly originalInputs?: Readonly<Record<string, OriginalInputBinding>>;
}
const origins = new WeakMap<
  OriginalGcpSshClientProfile,
  {
    read(): Promise<{ readonly version: string; readonly files: Readonly<Record<string, OriginalInputBinding>> }>;
    close(): void;
  }
>();
export async function readOriginalGcpSshClientProfile(value: unknown) {
  const read = value && typeof value === 'object' ? origins.get(value as OriginalGcpSshClientProfile) : undefined;
  if (!read) throw new Error('Original SSH client profile required');
  return read.read();
}
export function closeOriginalGcpSshClientProfile(value: unknown): void {
  const origin = value && typeof value === 'object' ? origins.get(value as OriginalGcpSshClientProfile) : undefined;
  if (!origin) throw new Error('Original SSH client profile required');
  origin.close();
}
export async function openGcpSshClientProfile(root: string, options: GcpSshClientProfileOptions = {}) {
  const requested = options.pins ?? defaultPins;
  const pins = Object.freeze({ version: requested.version, files: Object.freeze({ ...requested.files }) });
  if (
    process.platform !== 'linux' ||
    process.arch !== 'x64' ||
    pins.version !== '10.6p2' ||
    Object.keys(pins.files).sort().join(',') !== [...names].sort().join(',') ||
    names.some((name) => !/^[a-f0-9]{64}$/.test(pins.files[name]))
  )
    throw new Error('Qualified Linux SSH client profile required');
  if (resolve(root) !== root || (await realpath(root)) !== root) throw new Error('Canonical SSH client root required');
  const directory = await lstat(root, { bigint: true });
  if (
    !directory.isDirectory() ||
    directory.uid !== BigInt(process.getuid?.() ?? -1) ||
    (directory.mode & 0o777n) !== 0o700n
  )
    throw new Error('Private owned SSH client root required');
  const files: Record<string, OriginalInputBinding> = {};
  for (const name of names) {
    const path = join(root, 'bin', name);
    const input = await readOwnedInstalledInput(path, 16 * 1024 * 1024);
    const metadata = await lstat(path, { bigint: true });
    if (
      (metadata.mode & 0o111n) === 0n ||
      input.binding.sha256 !== pins.files[name] ||
      input.bytes.length < 4 ||
      input.bytes.subarray(0, 4).toString('hex') !== '7f454c46'
    )
      throw new Error('Owned pinned ELF SSH client executable required');
    files[name] = input.binding;
  }
  if (Object.keys(options.originalInputs ?? {}).some((name) => names.includes(name as (typeof names)[number])))
    throw new Error('Original installation guards collide with executable bindings');
  const original = Object.freeze({ ...files });
  const monitor = await monitorOriginalInputs({ ...original, ...options.originalInputs });
  let retired = false;
  const read = async () => {
    if (retired) throw new Error('Original SSH client profile retired');
    try {
      const current = await lstat(root, { bigint: true });
      if (
        (await realpath(root)) !== root ||
        ['dev', 'ino', 'uid', 'mode'].some(
          (key) => current[key as 'dev' | 'ino' | 'uid' | 'mode'] !== directory[key as 'dev' | 'ino' | 'uid' | 'mode'],
        )
      )
        throw new Error('Original SSH client directory changed');
      await monitor.assertOriginal();
      for (const name of names) {
        const input = await readOwnedInstalledInput(original[name].path, 16 * 1024 * 1024);
        assertSameOriginalInput(original[name], input.binding);
      }
      await monitor.assertOriginal();
      return Object.freeze({ version: pins.version, files: original });
    } catch (error) {
      retired = true;
      monitor.close();
      throw error;
    }
  };
  await read();
  const ref: OriginalGcpSshClientProfile = Object.freeze({
    schemaVersion: 1,
    kind: 'original-gcp-ssh-client-reference',
  });
  origins.set(ref, {
    read,
    close() {
      if (!retired) {
        retired = true;
        monitor.close();
      }
    },
  });
  return ref;
}
