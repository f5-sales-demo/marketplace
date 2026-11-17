import { randomBytes } from 'node:crypto';
import { mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import pins from './gcp-ce-keyscan-pins.json';
import { assertOriginalQualifiedGcpCeObserverScanContext } from './gcp-ce-sli-target';
import { projectOriginalGcpGuestDeliveryDeadline } from './gcp-observer-client-delivery-command';
import { readOriginalGcpObserverSshCommand } from './gcp-observer-ssh-command';
import { openOriginalGcpObserverSshInputLease } from './gcp-observer-ssh-local-inputs';
import { assertOriginalVerifiedGcpObserverPeerContext } from './gcp-observer-ssh-peer';
import type { OriginalApplyCallbackContext } from './installed-apply-controller';
import { readOwnedInstalledInput } from './installed-runtime';
import { linuxMonotonicMs } from './linux-clock';
import { monitorOriginalInputs } from './original-input-monitor';
import { inspectFinalReaderReserve } from './reader-final-reserve';

export interface OriginalGcpCeKeyScanCommand {
  readonly schemaVersion: 1;
  readonly kind: 'original-gcp-ce-keyscan-command-reference';
}
interface CommandView {
  readonly callback: OriginalApplyCallbackContext;
  readonly scanContext: unknown;
  readonly peer: unknown;
  readonly python: Awaited<ReturnType<typeof readOriginalGcpObserverSshCommand>>['python'];
  readonly executable: Awaited<ReturnType<typeof readOriginalGcpObserverSshCommand>>['executable'];
  readonly args: readonly string[];
  readonly sourceDeadlineMs: number;
  readonly request: Readonly<Record<string, unknown>>;
}
const origins = new WeakMap<
  OriginalGcpCeKeyScanCommand,
  {
    read(): Promise<Readonly<CommandView>>;
    inputs(): Promise<void>;
    identity(): Promise<void>;
    close(): void;
    used: boolean;
  }
>();
function original(value: unknown) {
  const origin = value && typeof value === 'object' ? origins.get(value as OriginalGcpCeKeyScanCommand) : undefined;
  if (!origin) throw new Error('Original CE keyscan command required');
  return origin;
}
export async function readOriginalGcpCeKeyScanCommand(value: unknown) {
  return original(value).read();
}
export async function assertOriginalGcpCeKeyScanInputs(value: unknown) {
  await original(value).inputs();
}
export async function assertOriginalGcpCeKeyScanIdentity(value: unknown) {
  await original(value).identity();
}
export async function checkoutOriginalGcpCeKeyScanCommand(value: unknown) {
  const origin = original(value);
  if (origin.used) throw new Error('Original CE keyscan command is single-use');
  origin.used = true;
  return origin.read();
}
export function closeOriginalGcpCeKeyScanCommand(value: unknown) {
  original(value).close();
}
/** The qualified context alone selects the CE SLI, observer, ABI and fixed helper.
 * Caller commands, paths, targets, deadlines and replies have no override. */
export async function openOriginalGcpCeKeyScanCommand(scanContext: unknown, callback: OriginalApplyCallbackContext) {
  const context = await assertOriginalQualifiedGcpCeObserverScanContext(scanContext, callback);
  const peer = await assertOriginalVerifiedGcpObserverPeerContext(context.observerPeer, callback);
  const source = await readOriginalGcpObserverSshCommand(peer.command);
  const helper = await readOwnedInstalledInput(join(import.meta.dir, '../scripts/gcp_observer_ce_keyscan.py'));
  const abi = await readOwnedInstalledInput(join(import.meta.dir, '../scripts/gcp_observer_client_abi.py'));
  if (
    pins.schemaVersion !== 1 ||
    helper.binding.sha256 !== pins.guestHelperSha256 ||
    abi.binding.sha256 !== pins.abiHelperSha256
  )
    throw new Error('Original shipped observer ABI helper pin differs');
  const scopeDeadline =
    callback.phase === 'after' && callback.reserve
      ? inspectFinalReaderReserve(callback.reserve).finalDeadlineMs
      : callback.original.budget.deadline;
  const budget = projectOriginalGcpGuestDeliveryDeadline(peer.peer.clock, linuxMonotonicMs(), scopeDeadline);
  const request = Object.freeze({
    schemaVersion: 1,
    kind: 'original-observer-ce-keyscan',
    nonce: randomBytes(32).toString('hex'),
    observerInstanceId: context.observerInstanceId,
    abiNonce: context.clients.nonce,
    abiReceiptSha256: context.clients.receiptSha256,
    uid: context.clients.uid,
    bootId: context.clients.bootId,
    pythonPath: context.clients.pythonPath,
    pythonSha256: context.clients.pythonSha256,
    archiveSha256: context.clients.archiveSha256,
    guestDeadlineMs: budget.guestDeadlineMs,
    targetInstanceId: context.target.instanceId,
    targetAddress: context.target.address,
    project: context.target.project,
    zone: context.target.zone,
    nodeName: context.target.nodeName,
    network: context.target.network,
    subnet: context.target.subnet,
  });
  const quote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;
  const program = `${helper.bytes.toString('utf8')}\nimport base64\nrequest=json.loads(${JSON.stringify(JSON.stringify(request))})\nresult=run_ce_keyscan(request,base64.b64decode(${JSON.stringify(abi.bytes.toString('base64'))}))\nprint(json.dumps(result,sort_keys=True))\n`;
  const remote = ['/usr/bin/python3', '-I', '-B', '-c', program].map(quote).join(' ');
  if (Buffer.byteLength(remote) > 120000) throw new Error('Original CE keyscan SSH argument exceeds bound');
  const args = Object.freeze([...source.args.slice(0, -1), remote]);
  const root = join(
    callback.original.executionDirectory,
    `ce-keyscan-${request.observerInstanceId}-${request.targetInstanceId}-${request.nonce}`,
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
    if (closed) throw new Error('Original CE keyscan inputs closed');
    await monitor.assertOriginal();
    await sshInputs.assertOriginal();
    await assertOriginalQualifiedGcpCeObserverScanContext(scanContext, callback);
    await monitor.assertOriginal();
  };
  const identity = async () => {
    if (closed) throw new Error('Original CE keyscan inputs closed');
    await monitor.assertOriginalIdentity();
    await sshInputs.assertOriginalIdentity();
  };
  const read = async (): Promise<Readonly<CommandView>> => {
    if (retired) throw new Error('Original CE keyscan command retired');
    try {
      await inputs();
      if (linuxMonotonicMs() >= budget.sourceDeadlineMs)
        throw new Error('Original CE keyscan command deadline exhausted');
      const current = await assertOriginalQualifiedGcpCeObserverScanContext(scanContext, callback);
      if (
        current.observerCommand !== context.observerCommand ||
        current.observerPeer !== context.observerPeer ||
        current.target !== context.target ||
        current.clients.receiptSha256 !== request.abiReceiptSha256
      )
        throw new Error('Original CE keyscan target/observer/ABI binding changed');
      await monitor.assertOriginal();
      return Object.freeze({
        callback,
        scanContext,
        peer: context.observerPeer,
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
  const ref: OriginalGcpCeKeyScanCommand = Object.freeze({
    schemaVersion: 1,
    kind: 'original-gcp-ce-keyscan-command-reference',
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
