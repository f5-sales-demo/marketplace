import { randomUUID } from 'node:crypto';
import type { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import { readOriginalGcpBootstrapVmSource } from './gcp-bootstrap-vm-binding';
import {
  closeOriginalGcpCeCampaignKey,
  openOriginalGcpCeCampaignKey,
  readOriginalGcpCeCampaignKey,
} from './gcp-ce-campaign-key';
import { closeOriginalGcpCeKeyScanCommand, openOriginalGcpCeKeyScanCommand } from './gcp-ce-keyscan-command';
import {
  bindOriginalQualifiedGcpCeObserverScanContext,
  openOriginalGcpCeSliTarget,
  readOriginalGcpCeSliSerialSource,
  readOriginalGcpCeSliTarget,
} from './gcp-ce-sli-target';
import { openGcpCeWireKeyReader, readOriginalGcpCeWireKeys } from './gcp-ce-wire-key-reader';
import { openGcpCeHostTrustReader, readOriginalGcpCeHostTrust } from './gcp-observer-host-trust-reader';
import { assertOriginalQualifiedGcpObserverClientsContext } from './gcp-observer-qualified-clients';
import { compileOriginalGcpCeTrustMaterial } from './gcp-observer-trust-material';
import {
  assertOriginalApplyCallback,
  assertOriginalApplyLifetime,
  type OriginalApplyCallbackContext,
} from './installed-apply-controller';
import { linuxMonotonicMs } from './linux-clock';
import { inspectFinalReaderReserve } from './reader-final-reserve';

type OriginalInstalledGcpCeAccessView = Awaited<
  ReturnType<Awaited<ReturnType<typeof openInstalledGcpCeAccess>>['read']>
>;
const accessViews = new WeakMap<object, { callback: OriginalApplyCallbackContext; check(): Promise<void> }>();
/** Revalidate the actual factory view; a copied readiness packet cannot mint source authority. */
export async function readOriginalInstalledGcpCeAccess(
  value: unknown,
  callback: OriginalApplyCallbackContext,
): Promise<OriginalInstalledGcpCeAccessView> {
  const origin = value && typeof value === 'object' ? accessViews.get(value) : undefined;
  if (!origin || origin.callback !== callback) throw new Error('Original ce access view and actual callback required');
  await origin.check();
  return value as OriginalInstalledGcpCeAccessView;
}

export interface InstalledGcpCeAccessInput {
  readonly vm: unknown;
  readonly bootstrapVm: unknown;
  readonly bootstrap: unknown;
  readonly serial: unknown;
  readonly callback: OriginalApplyCallbackContext;
  readonly store: CeDeploymentStore;
}
/** Original CE source composition. Observer readiness may arrive later; only
 * its original native-qualified ABI capability can initialize a wire scan.
 * No commands, executors, fetch handlers, targets or receipt overrides. */
export async function openInstalledGcpCeAccess(input: InstalledGcpCeAccessInput) {
  const { vm, bootstrapVm, bootstrap, serial, callback, store } = input;
  const context = callback.original;
  const lifetime = () =>
    callback.phase === 'after' ? assertOriginalApplyCallback(callback) : assertOriginalApplyLifetime(callback);
  await lifetime();
  const originalVm = await readOriginalGcpBootstrapVmSource(bootstrapVm, bootstrap, callback, vm);
  const target = await openOriginalGcpCeSliTarget(vm, callback);
  const originalTarget = await readOriginalGcpCeSliTarget(target);
  const originalSerial = await readOriginalGcpCeSliSerialSource(target, serial, callback);
  const key = await openOriginalGcpCeCampaignKey({ vm: bootstrapVm, bootstrap, callback, store });
  const sources: Array<{ name: string; close(): void | Promise<void> }> = [
    { name: 'key', close: () => closeOriginalGcpCeCampaignKey(key) },
  ];
  let claimed = false,
    initialized = false,
    closing = false,
    closed = false,
    closureUnresolved = false;
  let failure: unknown;
  let pending: Promise<void> | undefined, closure: Promise<void> | undefined;
  let clients: unknown;
  let trust: Awaited<ReturnType<Awaited<ReturnType<typeof openGcpCeHostTrustReader>>['verify']>> | undefined;
  let wire: Awaited<ReturnType<Awaited<ReturnType<typeof openGcpCeWireKeyReader>>['scan']>> | undefined;
  const retain = async (phase: string, extra: Record<string, unknown> = {}) => {
    await store.verify();
    await store.write(`gcp-ce-access-${randomUUID()}.json`, {
      schemaVersion: 1,
      kind: 'original-installed-gcp-ce-access-event',
      phase,
      owner: context.owner,
      executor: callback.execution.identity,
      originalBudget: context.budget,
      instanceId: originalVm.instanceId,
      ...extra,
      guestAcceptanceComplete: false,
      executionAuthorized: false,
    });
  };
  const active = () => {
    if (closing || closed) throw new Error('Original CE access retired');
    if (failure) throw new Error('Original CE access refused; failure retained');
  };
  const guard = async () => {
    await lifetime();
    await context.assertInputs();
    const currentVm = await readOriginalGcpBootstrapVmSource(bootstrapVm, bootstrap, callback, vm);
    const currentTarget = await readOriginalGcpCeSliTarget(target);
    const currentSerial = await readOriginalGcpCeSliSerialSource(target, serial, callback);
    const currentKey = await readOriginalGcpCeCampaignKey(key, callback);
    if (
      currentVm.instanceId !== originalVm.instanceId ||
      currentVm.ownershipSha256 !== originalVm.ownershipSha256 ||
      currentTarget !== originalTarget ||
      JSON.stringify(currentSerial) !== JSON.stringify(originalSerial) ||
      currentKey.instanceId !== originalVm.instanceId
    )
      throw new Error('Original CE key/VM/SLI/serial source changed');
    if (clients !== undefined) await assertOriginalQualifiedGcpObserverClientsContext(clients, callback);
    if (trust) {
      const host = await readOriginalGcpCeHostTrust(trust);
      if (host.instanceId !== originalVm.instanceId || host.address !== originalTarget.address)
        throw new Error('Original CE host-trust target differs');
    }
    await lifetime();
  };
  const check = async () => {
    active();
    await guard();
    active();
  };
  const own = <T extends { close(): void | Promise<void> }>(name: string, source: T): T => {
    sources.push({ name, close: source.close.bind(source) });
    return source;
  };
  const initialize = async (supplied: unknown) => {
    await assertOriginalQualifiedGcpObserverClientsContext(supplied, callback);
    await check();
    clients = supplied;
    const scanContext = await bindOriginalQualifiedGcpCeObserverScanContext(target, clients, callback);
    const command = await openOriginalGcpCeKeyScanCommand(scanContext, callback);
    sources.push({ name: 'command', close: () => closeOriginalGcpCeKeyScanCommand(command) });
    const wireReader = own('wire', await openGcpCeWireKeyReader(command));
    wire = await wireReader.scan();
    await check();
    const material = await compileOriginalGcpCeTrustMaterial(scanContext, serial, wire, callback);
    const hostReader = own('trust', await openGcpCeHostTrustReader(material, callback));
    trust = await hostReader.verify();
    await check();
    await retain('initialized');
    initialized = true;
  };
  try {
    await guard();
  } catch (error) {
    closeOriginalGcpCeCampaignKey(key);
    throw error;
  }
  return Object.freeze({
    initialize(supplied: unknown): Promise<void> {
      try {
        if (claimed) throw new Error('Original CE access initialization already claimed');
        active();
      } catch (error) {
        return Promise.reject(error);
      }
      claimed = true;
      pending = initialize(supplied).catch(async (error) => {
        failure ??= error;
        await retain('initialization-refused', { errorType: error instanceof Error ? error.name : typeof error });
        throw error;
      });
      return pending;
    },
    async read() {
      active();
      if (!initialized || !trust || !wire || clients === undefined)
        throw new Error('Original CE access not initialized');
      try {
        await check();
        const checkedKey = await readOriginalGcpCeCampaignKey(key, callback);
        const checkedTrust = await readOriginalGcpCeHostTrust(trust);
        const checkedWire = await readOriginalGcpCeWireKeys(wire);
        await check();
        const view = Object.freeze({
          callback,
          vm,
          bootstrapVm,
          bootstrap,
          key,
          trust,
          wire,
          target,
          clients,
          keyInput: checkedKey.key,
          hostInput: checkedTrust.knownHosts,
          algorithm: checkedWire.algorithm,
          ownershipSha256: originalVm.ownershipSha256,
          guestAcceptanceComplete: false,
          executionAuthorized: false,
        });
        accessViews.set(view, {
          callback,
          check: async () => {
            active();
            await guard();
            await readOriginalGcpCeCampaignKey(key, callback);
            await readOriginalGcpCeHostTrust(view.trust);
            await readOriginalGcpCeWireKeys(view.wire);
            active();
          },
        });
        return view;
      } catch (error) {
        failure ??= error;
        await retain('read-refused');
        throw error;
      }
    },
    close(finalCallback?: OriginalApplyCallbackContext): Promise<void> {
      if (closure) return closure;
      closing = true;
      closure = (async () => {
        let deadline = Math.min(context.budget.deadline + 300000, linuxMonotonicMs() + 300000);
        const after = finalCallback ?? (callback.phase === 'after' ? callback : undefined);
        if (after) {
          await assertOriginalApplyCallback(after);
          if (
            after.phase !== 'after' ||
            !after.reserve ||
            after.original !== context ||
            after.nonce !== callback.nonce ||
            after.execution.output !== callback.execution.output
          )
            throw new Error('Original CE final closure callback differs');
          deadline = inspectFinalReaderReserve(after.reserve).finalDeadlineMs;
        }
        let watching = true;
        const watch = (async () => {
          while (watching) {
            if (linuxMonotonicMs() >= deadline)
              throw new Error('Original CE source closure unresolved in final reserve');
            await Bun.sleep(100);
          }
        })();
        const failures: unknown[] = [];
        try {
          await Promise.race([pending?.catch(() => undefined) ?? Promise.resolve(), watch]);
          for (const source of [...sources].reverse()) {
            try {
              await Promise.race([Promise.resolve().then(() => source.close()), watch]);
            } catch (error) {
              failures.push(error);
              await retain('source-closure-refused', { source: source.name });
              if (linuxMonotonicMs() >= deadline) throw error;
            }
          }
          if (failures.length) throw new AggregateError(failures, 'Original CE source closure incomplete');
          await retain('closed', { failureRetained: !!failure });
          closed = true;
        } finally {
          watching = false;
        }
      })().catch(async (error) => {
        closureUnresolved = true;
        await retain('closure-unresolved');
        throw error;
      });
      return closure;
    },
    coverage: () =>
      Object.freeze({
        initialized,
        closed,
        claimed,
        failed: !!failure,
        closureUnresolved,
        guestAcceptanceComplete: false,
        executionAuthorized: false,
      }),
  });
}
