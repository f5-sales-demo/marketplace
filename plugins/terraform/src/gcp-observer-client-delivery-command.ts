import { randomBytes } from 'node:crypto';
import { mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import pins from './gcp-observer-client-delivery-pins.json';
import { assertOriginalGcpObserverClientPayloadContext } from './gcp-observer-client-payload';
import type { GcpObserverClockCandidate } from './gcp-observer-clock';
import {
  assertOriginalGcpObserverSshCommandInputs,
  readOriginalGcpObserverSshCommand,
} from './gcp-observer-ssh-command';
import { openOriginalGcpObserverSshInputLease } from './gcp-observer-ssh-local-inputs';
import { assertOriginalVerifiedGcpObserverPeerContext } from './gcp-observer-ssh-peer';
import type { OriginalApplyCallbackContext } from './installed-apply-controller';
import { readOwnedInstalledInput } from './installed-runtime';
import { linuxMonotonicMs } from './linux-clock';
import { monitorOriginalInputs } from './original-input-monitor';
import { inspectFinalReaderReserve } from './reader-final-reserve';

export function projectOriginalGcpGuestDeliveryDeadline(
  clock: Readonly<GcpObserverClockCandidate>,
  now: number,
  scopeDeadline: number,
) {
  if (
    !Number.isSafeInteger(now) ||
    !Number.isSafeInteger(scopeDeadline) ||
    scopeDeadline <= now ||
    now < clock.sourceStartedMs ||
    now - clock.sourceStartedMs > 300000 ||
    !Number.isSafeInteger(clock.offsetMinimumMs) ||
    !Number.isSafeInteger(clock.offsetMaximumMs) ||
    clock.offsetMinimumMs > clock.offsetMaximumMs
  )
    throw new Error('Original observer delivery clock or scope deadline differs');
  const sourceDeadlineMs = Math.min(now + 60000, scopeDeadline);
  return Object.freeze({
    sourceStartedMs: now,
    sourceDeadlineMs,
    guestDeadlineMs: sourceDeadlineMs + clock.offsetMinimumMs - 1000,
  });
}
export interface OriginalGcpObserverClientDeliveryCommand {
  readonly schemaVersion: 1;
  readonly kind: 'original-gcp-observer-client-delivery-command-reference';
}
interface CommandView {
  readonly callback: OriginalApplyCallbackContext;
  readonly peer: unknown;
  readonly executable: Awaited<ReturnType<typeof readOriginalGcpObserverSshCommand>>['executable'];
  readonly python: Awaited<ReturnType<typeof readOriginalGcpObserverSshCommand>>['python'];
  readonly args: readonly string[];
  readonly stdin: Awaited<ReturnType<typeof assertOriginalGcpObserverClientPayloadContext>>['input'];
  readonly instanceId: string;
  readonly sourceDeadlineMs: number;
  readonly request: Readonly<Record<string, unknown>>;
}
const origins = new WeakMap<
  OriginalGcpObserverClientDeliveryCommand,
  {
    read(): Promise<Readonly<CommandView>>;
    inputs(): Promise<void>;
    identity(): Promise<void>;
    close(): void;
    used: boolean;
  }
>();
export async function readOriginalGcpObserverClientDeliveryCommand(value: unknown) {
  const origin =
    value && typeof value === 'object' ? origins.get(value as OriginalGcpObserverClientDeliveryCommand) : undefined;
  if (!origin) throw new Error('Original observer client delivery command required');
  return origin.read();
}
export async function assertOriginalGcpObserverClientDeliveryInputs(value: unknown) {
  const origin =
    value && typeof value === 'object' ? origins.get(value as OriginalGcpObserverClientDeliveryCommand) : undefined;
  if (!origin) throw new Error('Original observer delivery local inputs required');
  await origin.inputs();
}
export async function assertOriginalGcpObserverClientDeliveryIdentity(value: unknown) {
  const origin =
    value && typeof value === 'object' ? origins.get(value as OriginalGcpObserverClientDeliveryCommand) : undefined;
  if (!origin) throw new Error('Original observer delivery local inputs required');
  await origin.identity();
}
export async function checkoutOriginalGcpObserverClientDeliveryCommand(value: unknown) {
  const origin =
    value && typeof value === 'object' ? origins.get(value as OriginalGcpObserverClientDeliveryCommand) : undefined;
  if (!origin || origin.used) throw new Error('Original observer delivery command is single-use');
  origin.used = true;
  return origin.read();
}
export function closeOriginalGcpObserverClientDeliveryCommand(value: unknown) {
  const origin =
    value && typeof value === 'object' ? origins.get(value as OriginalGcpObserverClientDeliveryCommand) : undefined;
  if (!origin) throw new Error('Original observer client delivery command required');
  origin.close();
}
/** Fixed guest source plus original artifact and peer only. No caller target,
 * remote script, guest path, deadline or stdin bytes can select this mapping. */
export async function openOriginalGcpObserverClientDeliveryCommand(
  peer: unknown,
  payload: unknown,
  callback: OriginalApplyCallbackContext,
) {
  const originalPeer = await assertOriginalVerifiedGcpObserverPeerContext(peer, callback);
  const originalPayload = await assertOriginalGcpObserverClientPayloadContext(payload, callback);
  const sourceCommand = await readOriginalGcpObserverSshCommand(originalPeer.command);
  const helper = await readOwnedInstalledInput(join(import.meta.dir, '../scripts/gcp_observer_client_install.py'));
  const installer = await readOwnedInstalledInput(join(import.meta.dir, '../scripts/install_ssh_clients.py'));
  if (helper.binding.sha256 !== pins.guestHelperSha256 || installer.binding.sha256 !== pins.installerSha256)
    throw new Error('Original shipped observer delivery source pins differ');
  const now = linuxMonotonicMs();
  const scopeDeadline =
    callback.phase === 'after' && callback.reserve
      ? inspectFinalReaderReserve(callback.reserve).finalDeadlineMs
      : callback.original.budget.deadline;
  const budget = projectOriginalGcpGuestDeliveryDeadline(originalPeer.peer.clock, now, scopeDeadline);
  const request = Object.freeze({
    schemaVersion: 1,
    kind: 'original-observer-client-delivery',
    instanceId: originalPeer.peer.instanceId,
    nonce: randomBytes(32).toString('hex'),
    uid: originalPeer.peer.clock.uid,
    bootId: originalPeer.peer.clock.bootId,
    pythonPath: originalPeer.peer.clock.pythonPath,
    pythonSha256: originalPeer.peer.clock.pythonSha256,
    guestDeadlineMs: budget.guestDeadlineMs,
    archiveSha256: originalPayload.input.sha256,
    installerSha256: pins.installerSha256,
  });
  const quote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;
  const program = `${helper.bytes.toString('utf8')}\nimport base64\nrequest=json.loads(${JSON.stringify(JSON.stringify(request))})\nresult=run_delivery(request,base64.b64decode(${JSON.stringify(installer.bytes.toString('base64'))}),sys.stdin.fileno())\nprint(json.dumps(result,sort_keys=True))\n`;
  const remote = ['/usr/bin/python3', '-I', '-B', '-c', program].map(quote).join(' ');
  if (Buffer.byteLength(remote) > 120000)
    throw new Error('Original delivery command exceeds supported SSH argument bound');
  const args = Object.freeze([...sourceCommand.args.slice(0, -1), remote]);
  const root = join(callback.original.executionDirectory, `observer-client-delivery-${originalPeer.peer.instanceId}`);
  try {
    await mkdir(root, { mode: 0o700 });
  } catch (cause) {
    throw new Error('Original observer delivery already prepared or unavailable; retain and resume verification', {
      cause,
    });
  }
  const path = join(root, 'request.private.json');
  const file = await open(path, 'wx', 0o400);
  try {
    await file.writeFile(JSON.stringify(request));
    await file.sync();
  } finally {
    await file.close();
  }
  const requestInput = await readOwnedInstalledInput(path);
  const sshInputs = await openOriginalGcpObserverSshInputLease(originalPeer.command, callback);
  let monitor: Awaited<ReturnType<typeof monitorOriginalInputs>>;
  try {
    monitor = await monitorOriginalInputs({
      helper: helper.binding,
      installer: installer.binding,
      request: requestInput.binding,
      payload: originalPayload.input,
    });
  } catch (error) {
    sshInputs.close();
    throw error;
  }
  let closed = false;
  const inputs = async () => {
    if (closed) throw new Error('Original observer delivery inputs closed');
    await monitor.assertOriginal();
    await sshInputs.assertOriginal();
    await monitor.assertOriginal();
  };
  const identity = async () => {
    if (closed) throw new Error('Original observer delivery inputs closed');
    await monitor.assertOriginalIdentity();
    await sshInputs.assertOriginalIdentity();
  };
  let retired = false;
  const read = async (): Promise<Readonly<CommandView>> => {
    if (retired) throw new Error('Original observer delivery command retired');
    try {
      await inputs();
      if (linuxMonotonicMs() >= budget.sourceDeadlineMs)
        throw new Error('Original observer delivery command deadline exhausted');
      const currentPeer = await assertOriginalVerifiedGcpObserverPeerContext(peer, callback);
      const currentPayload = await assertOriginalGcpObserverClientPayloadContext(payload, callback);
      await assertOriginalGcpObserverSshCommandInputs(originalPeer.command);
      if (
        currentPeer.command !== originalPeer.command ||
        currentPeer.peer.instanceId !== originalPeer.peer.instanceId ||
        JSON.stringify(currentPayload.input) !== JSON.stringify(originalPayload.input)
      )
        throw new Error('Original observer delivery peer/payload binding changed');
      await monitor.assertOriginal();
      return Object.freeze({
        callback,
        peer,
        executable: sourceCommand.executable,
        python: sourceCommand.python,
        args,
        stdin: originalPayload.input,
        instanceId: originalPeer.peer.instanceId,
        sourceDeadlineMs: budget.sourceDeadlineMs,
        request,
      });
    } catch (error) {
      retired = true;
      throw error;
    }
  };
  const ref: OriginalGcpObserverClientDeliveryCommand = Object.freeze({
    schemaVersion: 1,
    kind: 'original-gcp-observer-client-delivery-command-reference',
  });
  origins.set(ref, {
    read,
    inputs,
    identity,
    used: false,
    close() {
      retired = true;
      closed = true;
      monitor.close();
      sshInputs.close();
    },
  });
  try {
    await read();
  } catch (error) {
    closed = true;
    monitor.close();
    sshInputs.close();
    throw error;
  }
  return ref;
}
