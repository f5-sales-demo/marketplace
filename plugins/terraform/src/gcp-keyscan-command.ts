import { isIP } from 'node:net';
import {
  assertOriginalGcpObserverVmCaptureCallback,
  type readOriginalGcpObserverVmEvidence,
} from './gcp-observer-insert-evidence';
import { type OriginalGcpSshClientProfile, readOriginalGcpSshClientProfile } from './gcp-ssh-client-profile';
import {
  assertOriginalApplyCallback,
  assertOriginalApplyLifetime,
  type OriginalApplyCallbackContext,
} from './installed-apply-controller';
import { assertSameOriginalInput, monitorOriginalInputs, type OriginalInputBinding } from './original-input-monitor';

export interface OriginalGcpKeyScanCommand {
  readonly schemaVersion: 1;
  readonly kind: 'original-gcp-keyscan-command-reference';
}
const origins = new WeakMap<
  OriginalGcpKeyScanCommand,
  {
    read(): Promise<OriginalKeyScanView>;
    identity(): Promise<void>;
    inputs(): Promise<void>;
    close(): void;
  }
>();
interface OriginalKeyScanView {
  readonly callback: OriginalApplyCallbackContext;
  readonly vm: Awaited<ReturnType<typeof readOriginalGcpObserverVmEvidence>>;
  readonly executable: { readonly path: string; readonly sha256: string };
  readonly args: readonly string[];
}
export async function readOriginalGcpKeyScanCommand(value: unknown): Promise<OriginalKeyScanView> {
  const read = value && typeof value === 'object' ? origins.get(value as OriginalGcpKeyScanCommand) : undefined;
  if (!read) throw new Error('Original VM-bound key-scan command required');
  return read.read();
}
function origin(value: unknown) {
  const source = value && typeof value === 'object' ? origins.get(value as OriginalGcpKeyScanCommand) : undefined;
  if (!source) throw new Error('Original VM-bound key-scan command required');
  return source;
}
/** Continuous admitted local identity checks; full VM reads remain release and evidence boundaries. */
export async function assertOriginalGcpKeyScanIdentity(value: unknown) {
  await origin(value).identity();
}
export async function assertOriginalGcpKeyScanInputs(value: unknown) {
  await origin(value).inputs();
}
export function closeOriginalGcpKeyScanCommand(value: unknown) {
  origin(value).close();
}
/** No caller address, authentication or SSH forwarding is accepted by this mapping. */
export async function bindOriginalGcpObserverKeyScanCommand(
  vm: unknown,
  callback: OriginalApplyCallbackContext,
  profile: OriginalGcpSshClientProfile,
): Promise<OriginalGcpKeyScanCommand> {
  const assertCallback = () =>
    callback.phase === 'after' ? assertOriginalApplyCallback(callback) : assertOriginalApplyLifetime(callback);
  await assertCallback();
  const original = await assertOriginalGcpObserverVmCaptureCallback(vm, callback);
  const clients = await readOriginalGcpSshClientProfile(profile);
  if (isIP(original.externalAddress) !== 4) throw new Error('Original observer external IPv4 target required');
  const executable = Object.freeze({
    path: clients.files['ssh-keyscan'].path,
    sha256: clients.files['ssh-keyscan'].sha256,
  });
  const args = Object.freeze(['-q', '-T', '15', '-t', 'ed25519', '-p', '22', original.externalAddress]);
  // Admission verifies every original input before child startup. Polls
  // retain inode, timestamps, ownership, parent, descriptor and watcher checks.
  const bindings: Record<string, OriginalInputBinding> = {};
  for (const input of [...Object.values(callback.original.inputs), ...Object.values(clients.files)]) {
    const previous = bindings[input.path];
    if (previous) assertSameOriginalInput(previous, input);
    else bindings[input.path] = input;
  }
  const monitor = await monitorOriginalInputs(bindings);
  let retired = false;
  const close = () => {
    retired = true;
    monitor.close();
  };
  const identity = async () => {
    if (retired) throw new Error('Original key-scan command retired');
    try {
      await assertCallback();
      await monitor.assertOriginalIdentity();
      // The client source must remain live, including its installation declarations.
      await readOriginalGcpSshClientProfile(profile);
      await monitor.assertOriginalIdentity();
      await assertCallback();
      if (retired) throw new Error('Original key-scan command retired');
    } catch (error) {
      close();
      throw error;
    }
  };
  const inputs = async () => {
    await identity();
    try {
      await monitor.assertOriginal();
      await identity();
    } catch (error) {
      close();
      throw error;
    }
  };
  const read = async (): Promise<OriginalKeyScanView> => {
    if (retired) throw new Error('Original key-scan command retired');
    try {
      await inputs();
      const current = await assertOriginalGcpObserverVmCaptureCallback(vm, callback);
      const currentClients = await readOriginalGcpSshClientProfile(profile);
      if (
        JSON.stringify(current) !== JSON.stringify(original) ||
        currentClients.files['ssh-keyscan'].path !== executable.path ||
        currentClients.files['ssh-keyscan'].sha256 !== executable.sha256
      )
        throw new Error('Original key-scan VM or executable binding changed');
      await assertCallback();
      // Closure may interleave with any awaited source read. Check the latch
      // synchronously at issuance so a retired command cannot return a view.
      if (retired) throw new Error('Original key-scan command retired');
      return Object.freeze({ callback, vm: original, executable, args });
    } catch (error) {
      close();
      throw error;
    }
  };
  try {
    await read();
  } catch (error) {
    close();
    throw error;
  }
  const ref: OriginalGcpKeyScanCommand = Object.freeze({
    schemaVersion: 1,
    kind: 'original-gcp-keyscan-command-reference',
  });
  origins.set(ref, { read, identity, inputs, close });
  return ref;
}
