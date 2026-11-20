import { randomBytes } from 'node:crypto';
import { mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import pins from './gcp-observer-client-abi-pins.json';
import { assertOriginalGcpObserverClientDeliveryContext } from './gcp-observer-client-delivery';
import {
  assertOriginalGcpObserverClientDeliveryInputs,
  projectOriginalGcpGuestDeliveryDeadline,
} from './gcp-observer-client-delivery-command';
import { readOriginalGcpObserverSshCommand } from './gcp-observer-ssh-command';
import { openOriginalGcpObserverSshInputLease } from './gcp-observer-ssh-local-inputs';
import { assertOriginalVerifiedGcpObserverPeerContext } from './gcp-observer-ssh-peer';
import type { OriginalApplyCallbackContext } from './installed-apply-controller';
import { readOwnedInstalledInput } from './installed-runtime';
import { linuxMonotonicMs } from './linux-clock';
import { monitorOriginalInputs } from './original-input-monitor';
import { inspectFinalReaderReserve } from './reader-final-reserve';

export interface OriginalGcpObserverClientAbiCommand {
  readonly schemaVersion: 1;
  readonly kind: 'original-gcp-observer-client-abi-command-reference';
}
interface CommandView {
  readonly callback: OriginalApplyCallbackContext;
  readonly delivery: unknown;
  readonly peer: unknown;
  readonly python: Awaited<ReturnType<typeof readOriginalGcpObserverSshCommand>>['python'];
  readonly executable: Awaited<ReturnType<typeof readOriginalGcpObserverSshCommand>>['executable'];
  readonly args: readonly string[];
  readonly sourceDeadlineMs: number;
  readonly request: Readonly<Record<string, unknown>>;
}
const origins = new WeakMap<
  OriginalGcpObserverClientAbiCommand,
  {
    read(): Promise<Readonly<CommandView>>;
    inputs(): Promise<void>;
    identity(): Promise<void>;
    close(): void;
    used: boolean;
  }
>();
function original(value: unknown) {
  const origin =
    value && typeof value === 'object' ? origins.get(value as OriginalGcpObserverClientAbiCommand) : undefined;
  if (!origin) throw new Error('Original observer client ABI command required');
  return origin;
}
export async function readOriginalGcpObserverClientAbiCommand(value: unknown) {
  return original(value).read();
}
export async function assertOriginalGcpObserverClientAbiInputs(value: unknown) {
  await original(value).inputs();
}
export async function assertOriginalGcpObserverClientAbiIdentity(value: unknown) {
  await original(value).identity();
}
export async function checkoutOriginalGcpObserverClientAbiCommand(value: unknown) {
  const origin = original(value);
  if (origin.used) throw new Error('Original observer client ABI command is single-use');
  origin.used = true;
  return origin.read();
}
export function closeOriginalGcpObserverClientAbiCommand(value: unknown) {
  original(value).close();
}
/** The original delivery selects the guest, clients, receipt and fixed helper.
 * Caller command text, guest paths, deadlines and replies have no override. */
export async function openOriginalGcpObserverClientAbiCommand(
  delivery: unknown,
  callback: OriginalApplyCallbackContext,
) {
  const delivered = await assertOriginalGcpObserverClientDeliveryContext(delivery, callback);
  const peer = await assertOriginalVerifiedGcpObserverPeerContext(delivered.peer, callback);
  const source = await readOriginalGcpObserverSshCommand(peer.command);
  const helper = await readOwnedInstalledInput(join(import.meta.dir, '../scripts/gcp_observer_client_abi.py'));
  if (pins.schemaVersion !== 1 || helper.binding.sha256 !== pins.guestHelperSha256)
    throw new Error('Original shipped observer ABI helper pin differs');
  const scopeDeadline =
    callback.phase === 'after' && callback.reserve
      ? inspectFinalReaderReserve(callback.reserve).finalDeadlineMs
      : callback.original.budget.deadline;
  const budget = projectOriginalGcpGuestDeliveryDeadline(peer.peer.clock, linuxMonotonicMs(), scopeDeadline);
  const request = Object.freeze({
    schemaVersion: 1,
    kind: 'original-observer-client-abi',
    instanceId: delivered.delivery.instanceId,
    nonce: randomBytes(32).toString('hex'),
    uid: delivered.delivery.uid,
    bootId: delivered.delivery.bootId,
    pythonPath: delivered.delivery.pythonPath,
    pythonSha256: delivered.delivery.pythonSha256,
    archiveSha256: delivered.delivery.archiveSha256,
    guestDeadlineMs: budget.guestDeadlineMs,
    deliveryNonce: delivered.delivery.nonce,
    deliveryReceiptSha256: delivered.delivery.receiptSha256,
    deliveryFinishedMs: delivered.delivery.finishedMs,
  });
  const quote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;
  const program = `${helper.bytes.toString('utf8')}\nrequest=decode_object(${JSON.stringify(JSON.stringify(request))}.encode())\nresult=verify_original_clients(request)\nprint(json.dumps(result,sort_keys=True))\n`;
  const remote = ['/usr/bin/python3', '-I', '-B', '-c', program].map(quote).join(' ');
  if (Buffer.byteLength(remote) > 120000) throw new Error('Original observer ABI SSH argument exceeds bound');
  const args = Object.freeze([...source.args.slice(0, -1), remote]);
  const root = join(callback.original.executionDirectory, `observer-client-abi-${request.instanceId}-${request.nonce}`);
  await mkdir(root, { mode: 0o700 });
  const path = join(root, 'request.private.json');
  const file = await open(path, 'wx', 0o400);
  try {
    await file.writeFile(JSON.stringify(request));
    await file.sync();
  } finally {
    await file.close();
  }
  const requestInput = await readOwnedInstalledInput(path);
  const sshInputs = await openOriginalGcpObserverSshInputLease(peer.command, callback);
  let monitor: Awaited<ReturnType<typeof monitorOriginalInputs>>;
  try {
    monitor = await monitorOriginalInputs({ helper: helper.binding, request: requestInput.binding });
  } catch (error) {
    sshInputs.close();
    throw error;
  }
  let closed = false,
    retired = false;
  const inputs = async () => {
    if (closed) throw new Error('Original observer ABI inputs closed');
    await monitor.assertOriginal();
    await sshInputs.assertOriginal();
    await assertOriginalGcpObserverClientDeliveryInputs(delivered.command);
    await monitor.assertOriginal();
  };
  const identity = async () => {
    if (closed) throw new Error('Original observer ABI inputs closed');
    await monitor.assertOriginalIdentity();
    await sshInputs.assertOriginalIdentity();
  };
  const read = async (): Promise<Readonly<CommandView>> => {
    if (retired) throw new Error('Original observer ABI command retired');
    try {
      await inputs();
      if (linuxMonotonicMs() >= budget.sourceDeadlineMs)
        throw new Error('Original observer ABI command deadline exhausted');
      const current = await assertOriginalGcpObserverClientDeliveryContext(delivery, callback);
      const currentPeer = await assertOriginalVerifiedGcpObserverPeerContext(delivered.peer, callback);
      if (
        current.peer !== delivered.peer ||
        current.command !== delivered.command ||
        currentPeer.command !== peer.command ||
        current.delivery.receiptSha256 !== request.deliveryReceiptSha256
      )
        throw new Error('Original observer ABI delivery/peer binding changed');
      await monitor.assertOriginal();
      return Object.freeze({
        callback,
        delivery,
        peer: delivered.peer,
        python: source.python,
        executable: source.executable,
        args,
        sourceDeadlineMs: budget.sourceDeadlineMs,
        request,
      });
    } catch (error) {
      retired = true;
      throw error;
    }
  };
  const ref: OriginalGcpObserverClientAbiCommand = Object.freeze({
    schemaVersion: 1,
    kind: 'original-gcp-observer-client-abi-command-reference',
  });
  const close = () => {
    retired = true;
    closed = true;
    monitor.close();
    sshInputs.close();
  };
  origins.set(ref, { read, inputs, identity, used: false, close });
  try {
    await read();
  } catch (error) {
    close();
    throw error;
  }
  return ref;
}
