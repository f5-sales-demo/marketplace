import { randomBytes } from 'node:crypto';
import { mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import pins from './gcp-observer-client-abi-renewal-pins.json';
import {
  assertOriginalGcpObserverClientInstallationContext,
  readOriginalGcpObserverClientInstallation,
} from './gcp-observer-client-delivery';
import { projectOriginalGcpGuestDeliveryDeadline } from './gcp-observer-client-delivery-command';
import { readOriginalGcpObserverSshCommand } from './gcp-observer-ssh-command';
import { openOriginalGcpObserverSshInputLease } from './gcp-observer-ssh-local-inputs';
import { assertOriginalVerifiedGcpObserverPeerContext } from './gcp-observer-ssh-peer';
import type { OriginalApplyCallbackContext } from './installed-apply-controller';
import { readOwnedInstalledInput } from './installed-runtime';
import { linuxMonotonicMs } from './linux-clock';
import { monitorOriginalInputs } from './original-input-monitor';
import { inspectFinalReaderReserve } from './reader-final-reserve';

export interface OriginalGcpObserverClientAbiRenewalCommand {
  readonly schemaVersion: 2;
  readonly kind: 'original-gcp-observer-client-abi-renewal-command-reference';
}
interface CommandView {
  readonly callback: OriginalApplyCallbackContext;
  readonly installation: unknown;
  readonly peer: unknown;
  readonly python: Awaited<ReturnType<typeof readOriginalGcpObserverSshCommand>>['python'];
  readonly executable: Awaited<ReturnType<typeof readOriginalGcpObserverSshCommand>>['executable'];
  readonly args: readonly string[];
  readonly sourceDeadlineMs: number;
  readonly request: Readonly<Record<string, unknown>>;
}
const origins = new WeakMap<
  OriginalGcpObserverClientAbiRenewalCommand,
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
    value && typeof value === 'object' ? origins.get(value as OriginalGcpObserverClientAbiRenewalCommand) : undefined;
  if (!origin) throw new Error('Original observer ABI renewal command required');
  return origin;
}
export async function readOriginalGcpObserverClientAbiRenewalCommand(value: unknown) {
  return original(value).read();
}
export async function assertOriginalGcpObserverClientAbiRenewalInputs(value: unknown) {
  await original(value).inputs();
}
export async function assertOriginalGcpObserverClientAbiRenewalIdentity(value: unknown) {
  await original(value).identity();
}
export async function checkoutOriginalGcpObserverClientAbiRenewalCommand(value: unknown) {
  const origin = original(value);
  if (origin.used) throw new Error('Original observer ABI renewal command is single-use');
  origin.used = true;
  return origin.read();
}
export function closeOriginalGcpObserverClientAbiRenewalCommand(value: unknown) {
  original(value).close();
}
/** Durable native installation and a fresh verified peer select this read-only renewal.
 * Caller scripts, paths, commands, deadlines and replies have no override. */
export async function openOriginalGcpObserverClientAbiRenewalCommand(
  installation: unknown,
  freshPeer: unknown,
  callback: OriginalApplyCallbackContext,
) {
  const installed = await assertOriginalGcpObserverClientInstallationContext(installation, callback);
  const peer = await assertOriginalVerifiedGcpObserverPeerContext(freshPeer, callback);
  const source = await readOriginalGcpObserverSshCommand(peer.command);
  const helper = await readOwnedInstalledInput(join(import.meta.dir, '../scripts/gcp_observer_client_abi_renewal.py'));
  const abi = await readOwnedInstalledInput(join(import.meta.dir, '../scripts/gcp_observer_client_abi.py'));
  if (
    pins.schemaVersion !== 2 ||
    helper.binding.sha256 !== pins.guestHelperSha256 ||
    abi.binding.sha256 !== pins.abiHelperSha256
  )
    throw new Error('Original shipped observer ABI helper pin differs');
  const scopeDeadline =
    callback.phase === 'after' && callback.reserve
      ? inspectFinalReaderReserve(callback.reserve).finalDeadlineMs
      : callback.original.budget.deadline;
  if (
    peer.peer.instanceId !== installed.installation.instanceId ||
    peer.peer.clock.bootId !== installed.installation.bootId ||
    peer.peer.clock.uid !== installed.installation.uid ||
    peer.peer.clock.pythonPath !== installed.installation.pythonPath ||
    peer.peer.clock.pythonSha256 !== installed.installation.pythonSha256
  )
    throw new Error('Original installation and fresh observer peer identity differ');
  const budget = projectOriginalGcpGuestDeliveryDeadline(
    peer.peer.clock,
    linuxMonotonicMs(),
    Math.min(scopeDeadline, peer.peer.clock.sourceStartedMs + 300000),
  );
  const request = Object.freeze({
    schemaVersion: 2,
    kind: 'original-observer-client-abi-renewal',
    instanceId: installed.installation.instanceId,
    nonce: randomBytes(32).toString('hex'),
    uid: installed.installation.uid,
    bootId: installed.installation.bootId,
    pythonPath: installed.installation.pythonPath,
    pythonSha256: installed.installation.pythonSha256,
    archiveSha256: installed.installation.archiveSha256,
    guestDeadlineMs: budget.guestDeadlineMs,
    installationNonce: installed.installation.nonce,
    installationReceiptSha256: installed.installation.receiptSha256,
    installationFinishedMs: installed.installation.finishedMs,
    peerChallenge: source.challenge,
    peerMonotonicMs: peer.peer.clock.guestMonotonicMs,
  });
  const quote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;
  const program = `${helper.bytes.toString('utf8')}\nimport base64\nrequest=json.loads(${JSON.stringify(JSON.stringify(request))})\nresult=renew_original_clients(request,base64.b64decode(${JSON.stringify(abi.bytes.toString('base64'))}))\nprint(json.dumps(result,sort_keys=True))\n`;
  const remote = ['/usr/bin/python3', '-I', '-B', '-c', program].map(quote).join(' ');
  if (Buffer.byteLength(remote) > 120000) throw new Error('Original observer ABI SSH argument exceeds bound');
  const args = Object.freeze([...source.args.slice(0, -1), remote]);
  const root = join(
    callback.original.executionDirectory,
    `observer-client-abi-renewal-${request.instanceId}-${request.nonce}`,
  );
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
    monitor = await monitorOriginalInputs({ helper: helper.binding, abi: abi.binding, request: requestInput.binding });
  } catch (error) {
    sshInputs.close();
    throw error;
  }
  let closed = false,
    retired = false;
  const inputs = async () => {
    if (closed) throw new Error('Original observer ABI renewal inputs closed');
    await monitor.assertOriginal();
    await sshInputs.assertOriginal();
    await readOriginalGcpObserverClientInstallation(installation);
    await monitor.assertOriginal();
  };
  const identity = async () => {
    if (closed) throw new Error('Original observer ABI renewal inputs closed');
    await monitor.assertOriginalIdentity();
    await sshInputs.assertOriginalIdentity();
  };
  const read = async (): Promise<Readonly<CommandView>> => {
    if (retired) throw new Error('Original observer ABI renewal command retired');
    try {
      await inputs();
      if (linuxMonotonicMs() >= budget.sourceDeadlineMs)
        throw new Error('Original observer ABI renewal command deadline exhausted');
      const current = await assertOriginalGcpObserverClientInstallationContext(installation, callback);
      const currentPeer = await assertOriginalVerifiedGcpObserverPeerContext(freshPeer, callback);
      if (
        current.context !== installed.context ||
        current.installation.receiptSha256 !== request.installationReceiptSha256 ||
        currentPeer.command !== peer.command ||
        currentPeer.peer.instanceId !== request.instanceId ||
        currentPeer.peer.clock.guestMonotonicMs !== request.peerMonotonicMs
      )
        throw new Error('Original ABI renewal installation or fresh peer binding changed');
      await monitor.assertOriginal();
      return Object.freeze({
        callback,
        installation,
        peer: freshPeer,
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
  const ref: OriginalGcpObserverClientAbiRenewalCommand = Object.freeze({
    schemaVersion: 2,
    kind: 'original-gcp-observer-client-abi-renewal-command-reference',
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
