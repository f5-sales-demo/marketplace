import { dirname, join } from 'node:path';
import pins from './gcp-ssh-client-pins.json';
import { readOriginalGcpSshClientProfile } from './gcp-ssh-client-profile';
import {
  assertOriginalApplyCallback,
  assertOriginalApplyLifetime,
  type OriginalApplyCallbackContext,
} from './installed-apply-controller';
import { readOwnedInstalledInput } from './installed-runtime';
import { assertSameOriginalInput, monitorOriginalInputs, type OriginalInputBinding } from './original-input-monitor';

export interface OriginalGcpObserverClientPayload {
  readonly schemaVersion: 1;
  readonly kind: 'original-gcp-observer-client-payload-reference';
}
interface PayloadView {
  readonly callback: OriginalApplyCallbackContext;
  readonly input: OriginalInputBinding;
  readonly bytes: number;
  readonly version: string;
  readonly guestClientQualified: false;
}
const origins = new WeakMap<
  OriginalGcpObserverClientPayload,
  {
    readonly callback: OriginalApplyCallbackContext;
    read(): Promise<Readonly<PayloadView>>;
    close(): void;
  }
>();
export async function readOriginalGcpObserverClientPayload(value: unknown) {
  const origin =
    value && typeof value === 'object' ? origins.get(value as OriginalGcpObserverClientPayload) : undefined;
  if (!origin) throw new Error('Original observer client payload required');
  return origin.read();
}
export async function assertOriginalGcpObserverClientPayloadContext(
  value: unknown,
  callback: OriginalApplyCallbackContext,
) {
  const origin =
    value && typeof value === 'object' ? origins.get(value as OriginalGcpObserverClientPayload) : undefined;
  if (!origin || origin.callback !== callback) throw new Error('Original client payload and actual callback required');
  return origin.read();
}
export function closeOriginalGcpObserverClientPayload(value: unknown) {
  const origin =
    value && typeof value === 'object' ? origins.get(value as OriginalGcpObserverClientPayload) : undefined;
  if (!origin) throw new Error('Original observer client payload required');
  origin.close();
}
/** Resolve the source-pinned original installed archive only. No caller path,
 * data or digest can select the delivery bytes. This issues no guest execution
 * or SSH trust; the delivery consumer also needs an original verified peer. */
export async function openOriginalGcpObserverClientPayload(clients: unknown, callback: OriginalApplyCallbackContext) {
  const assertCallback = () =>
    callback.phase === 'after' ? assertOriginalApplyCallback(callback) : assertOriginalApplyLifetime(callback);
  await assertCallback();
  const originalClients = await readOriginalGcpSshClientProfile(clients);
  if (
    originalClients.version !== pins.version ||
    Object.entries(pins.files).some(([name, declaration]) => originalClients.files[name]?.sha256 !== declaration.sha256)
  )
    throw new Error('Source-qualified installed SSH client artifact required');
  const root = dirname(dirname(originalClients.files.ssh.path));
  const path = join(root, 'archive.zip');
  if (!/^\/[A-Za-z0-9_./-]+$/.test(path)) throw new Error('Literal original client artifact path required');
  const archive = await readOwnedInstalledInput(path, 16 * 1024 * 1024);
  if (
    archive.binding.sha256 !== pins.archiveSha256 ||
    (BigInt(archive.binding.expectedIdentity?.mode ?? '-1') & 0o777n) !== 0o400n
  )
    throw new Error('Original installed client artifact bytes or mode differ');
  const monitor = await monitorOriginalInputs({ archive: archive.binding });
  let retired = false;
  const read = async (): Promise<Readonly<PayloadView>> => {
    if (retired) throw new Error('Original observer client payload retired');
    try {
      await assertCallback();
      await monitor.assertOriginal();
      const currentClients = await readOriginalGcpSshClientProfile(clients);
      if (JSON.stringify(currentClients) !== JSON.stringify(originalClients))
        throw new Error('Original observer client profile changed');
      const current = await readOwnedInstalledInput(path, 16 * 1024 * 1024);
      assertSameOriginalInput(archive.binding, current.binding);
      await monitor.assertOriginal();
      await assertCallback();
      return Object.freeze({
        callback,
        input: archive.binding,
        bytes: archive.bytes.length,
        version: pins.version,
        guestClientQualified: false,
      });
    } catch (error) {
      retired = true;
      monitor.close();
      throw error;
    }
  };
  const ref: OriginalGcpObserverClientPayload = Object.freeze({
    schemaVersion: 1,
    kind: 'original-gcp-observer-client-payload-reference',
  });
  origins.set(ref, {
    callback,
    read,
    close() {
      retired = true;
      monitor.close();
    },
  });
  await read();
  return ref;
}
