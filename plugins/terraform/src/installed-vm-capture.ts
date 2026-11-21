import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import { fingerprint } from '../../gcloud/src/ce/discovery';
import {
  assertOriginalInstalledGcpCloudReader,
  assertOriginalInstalledGcpFinalCloudReader,
  type openGcpCloudSerialReader,
} from './gcp-cloud-serial-reader';
import { type OriginalEarlyGcpInsertIdentity, readOriginalEarlyGcpInsertIdentity } from './gcp-insert-evidence';
import {
  assertOriginalGcpObserverInsertContext,
  collectOriginalGcpObserverSerialEvidence,
  collectOriginalGcpObserverVmEvidence,
  type OriginalGcpObserverInsertIdentity,
  type OriginalGcpObserverVmEvidence,
  readOriginalGcpObserverSerialSource,
  readOriginalGcpObserverVmEvidence,
} from './gcp-observer-insert-evidence';
import {
  collectOriginalEarlyGcpSerialEvidence,
  collectOriginalEarlyGcpVmEvidence,
  collectOriginalFinalGcpSerialEvidence,
  handoffOriginalEarlyGcpVmEvidence,
  type OriginalEarlyGcpVmEvidence,
  type OriginalFinalGcpVmEvidence,
  readOriginalEarlyGcpSerialSource,
  readOriginalEarlyGcpVmEvidence,
  readOriginalFinalGcpSerialSource,
  readOriginalFinalGcpVmEvidence,
} from './gcp-vm-evidence';
import type { OriginalApplyCallbackContext } from './installed-apply-controller';
import {
  assertOriginalApplyGcpInventoryCallback,
  type OriginalApplyGcpInventory,
  readOriginalApplyGcpInventory,
} from './installed-initial-inventory';
import { linuxMonotonicMs } from './linux-clock';
import { inspectFinalReaderReserve } from './reader-final-reserve';

type Reader = Awaited<ReturnType<typeof openGcpCloudSerialReader>>;
type Vm = OriginalEarlyGcpVmEvidence | OriginalFinalGcpVmEvidence | OriginalGcpObserverVmEvidence;
type SerialEvidence =
  | Awaited<ReturnType<typeof collectOriginalEarlyGcpSerialEvidence>>
  | Awaited<ReturnType<typeof collectOriginalFinalGcpSerialEvidence>>
  | Awaited<ReturnType<typeof collectOriginalGcpObserverSerialEvidence>>;
type SerialSource =
  | Awaited<ReturnType<typeof readOriginalEarlyGcpSerialSource>>
  | Awaited<ReturnType<typeof readOriginalFinalGcpSerialSource>>
  | Awaited<ReturnType<typeof readOriginalGcpObserverSerialSource>>;
interface VmSerialPacket {
  readonly vm: Vm;
  readonly evidence: SerialEvidence;
  readonly source: SerialSource;
}
type View =
  | Awaited<ReturnType<typeof readOriginalEarlyGcpVmEvidence>>
  | Awaited<ReturnType<typeof readOriginalFinalGcpVmEvidence>>
  | Awaited<ReturnType<typeof readOriginalGcpObserverVmEvidence>>;
interface Slot {
  readonly name: string;
  readonly zone: string;
  readonly address: string;
  readonly role: 'ce' | 'observer';
  identity?: OriginalEarlyGcpInsertIdentity | OriginalGcpObserverInsertIdentity;
  vm?: Vm;
  view?: View;
  anchor?: string;
  serialPacket?: Readonly<VmSerialPacket>;
}
export interface InstalledVmCaptureInput {
  readonly callback: OriginalApplyCallbackContext;
  readonly baseline: OriginalApplyGcpInventory;
  readonly reader: Reader;
}

/** Read-only original VM/serial stage. Guest, bootstrap, routing, traffic and
 * execution acceptance are deliberately separate from VM coverage.
 */
export async function openInstalledVmCapture(input: InstalledVmCaptureInput) {
  if (process.platform !== 'linux') throw new Error('Original GCP VM capture requires the qualified Linux runtime');
  const { callback: before, baseline, reader } = input;
  if (before?.phase !== 'before') throw new Error('Original before-apply VM capture required');
  await assertOriginalApplyGcpInventoryCallback(baseline, before);
  await assertOriginalInstalledGcpCloudReader(reader, before.original);
  const inventory = await readOriginalApplyGcpInventory(baseline);
  const context = before.original;
  const budget = Object.freeze({ ...context.budget });
  const expectedParent = context.inputs['workspace:main.tf.json']?.expectedParentIdentity;
  const assertDirectory = async () => {
    const current = await lstat(context.executionDirectory, { bigint: true });
    if (
      !current.isDirectory() ||
      current.isSymbolicLink() ||
      !expectedParent ||
      ['dev', 'ino', 'uid', 'mode'].some(
        (key) => String(current[key as keyof typeof current]) !== expectedParent[key as keyof typeof expectedParent],
      )
    )
      throw new Error('Original VM capture execution directory changed');
  };
  await assertDirectory();
  const slots = new Map<string, Slot>();
  for (const row of inventory.cloud) {
    if (row.target.kind !== 'instance') continue;
    if (!['ce', 'observer'].includes(row.role) || slots.has(row.target.name))
      throw new Error('Unique original CE/observer VM inventory required');
    slots.set(
      row.target.name,
      Object.freeze({
        name: row.target.name,
        zone: row.target.zone,
        address: row.address,
        role: row.role as 'ce' | 'observer',
      }),
    );
  }
  // Mutable state is private; caller changes cannot alter the original target set.
  for (const [name, slot] of slots) slots.set(name, { ...slot });
  if (!slots.size) throw new Error('Original VM inventory is empty');
  const directory = join(context.executionDirectory, `gcp-vm-capture-${randomUUID()}`);
  await mkdir(directory, { mode: 0o700 });
  const directoryIdentity = await lstat(directory, { bigint: true });
  let phase: 'before' | 'final' | 'closed' = 'before';
  let refused = false,
    busy = false;
  let activeFinish: Promise<void> | undefined;
  let finalNames: readonly string[] | undefined;
  let packetReader = reader;
  const retain = async (event: string, value: Record<string, unknown>) => {
    await assertDirectory();
    const parent = await lstat(directory, { bigint: true });
    if (
      !parent.isDirectory() ||
      parent.isSymbolicLink() ||
      parent.uid !== BigInt(process.getuid?.() ?? -1) ||
      (parent.mode & 0o777n) !== 0o700n ||
      ['dev', 'ino', 'uid', 'mode'].some(
        (key) => parent[key as keyof typeof parent] !== directoryIdentity[key as keyof typeof directoryIdentity],
      )
    )
      throw new Error('Original VM capture retention directory changed');
    const name = `${event}-${randomUUID()}.private.json`;
    const path = join(directory, name);
    const folder = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try {
      const original = await folder.stat({ bigint: true });
      if (
        ['dev', 'ino', 'uid', 'mode'].some(
          (key) => original[key as keyof typeof original] !== directoryIdentity[key as keyof typeof directoryIdentity],
        )
      )
        throw new Error('Original VM capture retention directory changed during open');
      // Anchored to the admitted directory even if its pathname changes during the write.
      const file = await open(join('/proc/self/fd', String(folder.fd), name), 'wx', 0o400);
      try {
        await file.writeFile(
          JSON.stringify({
            schemaVersion: 1,
            kind: 'original-installed-vm-capture-event',
            owner: context.owner,
            executor: before.execution.identity,
            planSha256: inventory.planSha256,
            originalBudget: budget,
            event,
            ...value,
            guestAcceptanceComplete: false,
            executionAuthorized: false,
          }),
        );
        await file.sync();
      } finally {
        await file.close();
      }
      const after = await lstat(directory, { bigint: true });
      if (
        ['dev', 'ino', 'uid', 'mode'].some(
          (key) => after[key as keyof typeof after] !== directoryIdentity[key as keyof typeof directoryIdentity],
        )
      )
        throw new Error('Original VM capture retention directory changed during write');
    } finally {
      await folder.close();
    }
    return path;
  };
  const guard = async (callback: OriginalApplyCallbackContext, selected: Reader) => {
    if (
      callback.original !== context ||
      callback.nonce !== before.nonce ||
      ['pid', 'group', 'start', 'boot'].some(
        (key) =>
          callback.execution.identity[key as keyof typeof callback.execution.identity] !==
          before.execution.identity[key as keyof typeof before.execution.identity],
      ) ||
      context.budget.start !== budget.start ||
      context.budget.deadline !== budget.deadline
    )
      throw new Error('Original VM capture callback or budget changed');
    await assertOriginalApplyGcpInventoryCallback(baseline, callback);
    if (callback.phase === 'after') await assertOriginalInstalledGcpFinalCloudReader(selected, callback);
    else await assertOriginalInstalledGcpCloudReader(selected, context);
    await assertDirectory();
  };
  const perform = async <T>(operation: () => Promise<T>): Promise<T> => {
    if (phase !== 'before' || refused || busy) {
      refused = true;
      throw new Error('Original VM capture refused or another operation is active');
    }
    busy = true;
    const settled = Promise.withResolvers<void>();
    activeFinish = settled.promise;
    try {
      await guard(before, reader);
      const result = await operation();
      if (refused || phase !== 'before') throw new Error('Original VM capture refused during operation');
      await guard(before, reader);
      return result;
    } catch (error) {
      refused = true;
      await retain('failure', {
        errorName: error instanceof Error ? error.name : typeof error,
        ...(error instanceof Error ? { errorMessage: error.message } : {}),
      });
      throw error;
    } finally {
      busy = false;
      settled.resolve();
      activeFinish = undefined;
    }
  };
  const slotFor = (name: string) => {
    const slot = slots.get(name);
    if (!slot) throw new Error('Original declared VM target required');
    return slot;
  };
  const checkAnchor = (slot: Slot, view: View) => {
    const anchor = fingerprint(
      'interfaces' in view
        ? { instanceId: view.instanceId, operationId: view.operationId, interfaces: view.interfaces }
        : {
            instanceId: view.instanceId,
            diskId: view.diskId,
            imageId: view.imageId,
            operationId: view.operationId,
            interfaceAddress: view.interfaceAddress,
            externalAddress: view.externalAddress,
            publicKeySha256: view.publicKeySha256,
          },
    );
    if (slot.anchor && slot.anchor !== anchor) throw new Error('Original VM identity or interface ownership changed');
    slot.anchor ??= anchor;
    slot.view = view;
  };
  const serial = async (slot: Slot, final: boolean, start = '0') => {
    if (!slot.vm) throw new Error('Original observed VM required before serial capture');
    const evidence =
      slot.role === 'observer'
        ? await collectOriginalGcpObserverSerialEvidence(slot.vm, start)
        : final
          ? await collectOriginalFinalGcpSerialEvidence(slot.vm, start)
          : await collectOriginalEarlyGcpSerialEvidence(slot.vm, start);
    const source =
      slot.role === 'observer'
        ? await readOriginalGcpObserverSerialSource(slot.vm, evidence)
        : final
          ? await readOriginalFinalGcpSerialSource(slot.vm, evidence)
          : await readOriginalEarlyGcpSerialSource(slot.vm, evidence);
    await retain('serial', { name: slot.name, role: slot.role, source });
    const packet = Object.freeze({ vm: slot.vm, evidence, source });
    slot.serialPacket = packet;
    return packet;
  };
  await retain('opened', { resources: inventory.resources, targets: [...slots.values()] });
  return Object.freeze({
    directory,
    coverage() {
      const ready =
        phase === 'before' ? [...slots.values()].filter((slot) => slot.vm).length : (finalNames?.length ?? 0);
      return Object.freeze({
        expected: slots.size,
        ready,
        refused,
        phase,
        vmCoverageComplete: ready === slots.size,
        guestAcceptanceComplete: false,
        executionAuthorized: false,
      });
    },
    admitCe(identity: OriginalEarlyGcpInsertIdentity) {
      return perform(async () => {
        const value = await readOriginalEarlyGcpInsertIdentity(identity);
        const slot = slotFor(value.nodeName);
        if (
          slot.role !== 'ce' ||
          slot.identity ||
          value.zone !== slot.zone ||
          value.address !== slot.address ||
          value.project !== inventory.owner.account ||
          value.planSha256 !== inventory.planSha256 ||
          value.directory !== context.executionDirectory ||
          ['pid', 'group', 'start', 'boot'].some(
            (key) =>
              value.executor[key as keyof typeof value.executor] !==
              before.execution.identity[key as keyof typeof before.execution.identity],
          )
        )
          throw new Error('Original CE insert target, actor or single-use identity differs');
        slot.identity = identity;
        await retain('insert', { name: slot.name, role: slot.role, identity: value });
      });
    },
    admitObserver(identity: OriginalGcpObserverInsertIdentity) {
      return perform(async () => {
        const value = await assertOriginalGcpObserverInsertContext(identity, before, baseline);
        const slot = slotFor(value.name);
        if (
          slot.role !== 'observer' ||
          slot.identity ||
          value.zone !== slot.zone ||
          value.address !== slot.address ||
          value.project !== inventory.owner.account ||
          value.planSha256 !== inventory.planSha256
        )
          throw new Error('Original observer insert target or single-use identity differs');
        slot.identity = identity;
        await retain('insert', { name: slot.name, role: slot.role, identity: value });
      });
    },
    reconcile(name: string) {
      return perform(async () => {
        const slot = slotFor(name);
        if (!slot.identity) throw new Error('Original insert identity required before VM reconciliation');
        let vm: Vm | null;
        if (slot.role === 'ce') {
          vm = await collectOriginalEarlyGcpVmEvidence({
            identity: slot.identity as OriginalEarlyGcpInsertIdentity,
            baseline,
            callback: before,
            reader,
          });
        } else {
          const identity = await assertOriginalGcpObserverInsertContext(slot.identity, before, baseline);
          const observed = await reader.instance(slot.zone, slot.name);
          const disk = await reader.resource({ kind: 'disk', zone: slot.zone, name: slot.name });
          vm =
            identity.targetId === null || !observed.present || !disk.present
              ? null
              : await collectOriginalGcpObserverVmEvidence({
                  identity: slot.identity as OriginalGcpObserverInsertIdentity,
                  callback: before,
                  reader,
                });
        }
        if (!vm) {
          await retain('pending', { name });
          return null;
        }
        const view =
          slot.role === 'ce' ? await readOriginalEarlyGcpVmEvidence(vm) : await readOriginalGcpObserverVmEvidence(vm);
        checkAnchor(slot, view);
        slot.vm = vm;
        await retain('vm', { name, role: slot.role, view });
        return view;
      });
    },
    captureSerial(name: string, start: string) {
      return perform(async () => {
        const slot = slotFor(name);
        return serial(slot, false, start);
      });
    },
    /** Return the same source-issued packet for guest trust, never a recapture,
     * copied receipt or promotion of partial VM coverage to guest acceptance. */
    async readSerialPacket(name: string, callback: OriginalApplyCallbackContext) {
      if (
        busy ||
        (phase === 'before'
          ? refused || callback.phase !== 'before'
          : phase !== 'closed' || callback.phase !== 'after' || !finalNames?.includes(name))
      )
        throw new Error('Original VM serial packet lifetime unavailable');
      await guard(callback, packetReader);
      const slot = slotFor(name);
      const packet = slot.serialPacket;
      if (!packet) throw new Error('Original VM serial packet unavailable');
      const source =
        slot.role === 'observer'
          ? await readOriginalGcpObserverSerialSource(packet.vm, packet.evidence)
          : callback.phase === 'after'
            ? await readOriginalFinalGcpSerialSource(packet.vm, packet.evidence)
            : await readOriginalEarlyGcpSerialSource(packet.vm, packet.evidence);
      if (fingerprint(source) !== fingerprint(packet.source) || slot.serialPacket !== packet)
        throw new Error('Original VM serial packet source changed');
      await guard(callback, packetReader);
      return packet;
    },
    async finalCapture(callback: OriginalApplyCallbackContext, selected: Reader) {
      if (phase !== 'before') throw new Error('Original VM final capture already started or operation unresolved');
      if (callback.phase !== 'after' || !callback.reserve) throw new Error('Original reserved after callback required');
      await guard(callback, selected);
      const timing = inspectFinalReaderReserve(callback.reserve);
      phase = 'final';
      packetReader = selected;
      const pending = activeFinish;
      if (pending) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let expired = false;
        try {
          await Promise.race([
            pending,
            new Promise<void>((resolve) => {
              timer = setTimeout(
                () => {
                  expired = true;
                  resolve();
                },
                Math.max(0, timing.finalDeadlineMs - linuxMonotonicMs()),
              );
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
        if (expired) {
          await retain('final-unresolved', { originalBeforeCaptureUnresolved: true, finalReserve: timing });
          throw new Error('Original before VM capture remains unresolved in its final reserve');
        }
      }
      await guard(callback, selected);
      const capturedNames: string[] = [],
        failures: string[] = [];
      for (const slot of slots.values()) {
        try {
          await guard(callback, selected);
          if (!slot.identity || !slot.vm) {
            const observed = await selected.instance(slot.zone, slot.name);
            await retain('final-unattributed', {
              name: slot.name,
              present: observed.present,
              evidencePath: observed.path,
              evidenceSha256: observed.sha256,
            });
            continue;
          }
          const vm =
            slot.role === 'ce'
              ? await handoffOriginalEarlyGcpVmEvidence(slot.vm, { callback, reader: selected })
              : await collectOriginalGcpObserverVmEvidence({
                  identity: slot.identity as OriginalGcpObserverInsertIdentity,
                  callback,
                  reader: selected,
                });
          const view =
            slot.role === 'ce' ? await readOriginalFinalGcpVmEvidence(vm) : await readOriginalGcpObserverVmEvidence(vm);
          checkAnchor(slot, view);
          slot.vm = vm;
          await serial(slot, true);
          await guard(callback, selected);
          capturedNames.push(slot.name);
        } catch (error) {
          failures.push(slot.name);
          await retain('final-failure', {
            name: slot.name,
            errorName: error instanceof Error ? error.name : typeof error,
            ...(error instanceof Error ? { errorMessage: error.message } : {}),
          });
        }
      }
      await guard(callback, selected);
      const result = Object.freeze({
        capturedNames: Object.freeze(capturedNames),
        failures: Object.freeze(failures),
        vmCoverageComplete: capturedNames.length === slots.size,
        guestAcceptanceComplete: false,
        executionAuthorized: false,
        finalStartedMs: timing.finalStartedMs,
        finalDeadlineMs: timing.finalDeadlineMs,
      });
      await retain('final', { ...result });
      finalNames = result.capturedNames;
      phase = 'closed';
      return result;
    },
  });
}
