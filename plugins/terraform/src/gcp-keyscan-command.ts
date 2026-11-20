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

export interface OriginalGcpKeyScanCommand {
  readonly schemaVersion: 1;
  readonly kind: 'original-gcp-keyscan-command-reference';
}
const origins = new WeakMap<OriginalGcpKeyScanCommand, () => Promise<OriginalKeyScanView>>();
interface OriginalKeyScanView {
  readonly callback: OriginalApplyCallbackContext;
  readonly vm: Awaited<ReturnType<typeof readOriginalGcpObserverVmEvidence>>;
  readonly executable: { readonly path: string; readonly sha256: string };
  readonly args: readonly string[];
}
export async function readOriginalGcpKeyScanCommand(value: unknown): Promise<OriginalKeyScanView> {
  const read = value && typeof value === 'object' ? origins.get(value as OriginalGcpKeyScanCommand) : undefined;
  if (!read) throw new Error('Original VM-bound key-scan command required');
  return read();
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
  let retired = false;
  const read = async (): Promise<OriginalKeyScanView> => {
    if (retired) throw new Error('Original key-scan command retired');
    try {
      await assertCallback();
      const current = await assertOriginalGcpObserverVmCaptureCallback(vm, callback);
      const currentClients = await readOriginalGcpSshClientProfile(profile);
      if (
        JSON.stringify(current) !== JSON.stringify(original) ||
        currentClients.files['ssh-keyscan'].path !== executable.path ||
        currentClients.files['ssh-keyscan'].sha256 !== executable.sha256
      )
        throw new Error('Original key-scan VM or executable binding changed');
      await assertCallback();
      return Object.freeze({ callback, vm: original, executable, args });
    } catch (error) {
      retired = true;
      throw error;
    }
  };
  await read();
  const ref: OriginalGcpKeyScanCommand = Object.freeze({
    schemaVersion: 1,
    kind: 'original-gcp-keyscan-command-reference',
  });
  origins.set(ref, read);
  return ref;
}
