import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import { closeOriginalGcpObserverCampaignKey, openOriginalGcpObserverCampaignKey } from './gcp-observer-campaign-key';
import { openGcpObserverClientAbi } from './gcp-observer-client-abi';
import {
  closeOriginalGcpObserverClientAbiCommand,
  openOriginalGcpObserverClientAbiCommand,
} from './gcp-observer-client-abi-command';
import { openGcpObserverClientAbiRenewal } from './gcp-observer-client-abi-renewal';
import {
  closeOriginalGcpObserverClientAbiRenewalCommand,
  openOriginalGcpObserverClientAbiRenewalCommand,
} from './gcp-observer-client-abi-renewal-command';
import {
  assertOriginalGcpObserverClientInstallationContext,
  type OriginalGcpObserverClientInstallation,
  openGcpObserverClientDelivery,
  openOriginalGcpObserverClientInstallation,
  readOriginalGcpObserverClientInstallation,
} from './gcp-observer-client-delivery';
import {
  closeOriginalGcpObserverClientDeliveryCommand,
  openOriginalGcpObserverClientDeliveryCommand,
} from './gcp-observer-client-delivery-command';
import {
  closeOriginalGcpObserverClientPayload,
  openOriginalGcpObserverClientPayload,
} from './gcp-observer-client-payload';
import { openGcpObserverHostTrustReader } from './gcp-observer-host-trust-reader';
import {
  assertOriginalGcpObserverVmCaptureCallback,
  readOriginalGcpObserverSerialSource,
} from './gcp-observer-insert-evidence';
import { assertOriginalQualifiedGcpObserverClientsContext } from './gcp-observer-qualified-clients';
import { closeOriginalGcpObserverSshCommand, openOriginalGcpObserverSshCommand } from './gcp-observer-ssh-command';
import { openOriginalGcpObserverSshInputLease } from './gcp-observer-ssh-local-inputs';
import { openGcpObserverSshPeer } from './gcp-observer-ssh-peer';
import { compileOriginalGcpObserverTrustMaterial } from './gcp-observer-trust-material';
import { openGcpObserverWireKeyReader } from './gcp-observer-wire-key-reader';
import { type OriginalGcpSshClientProfile, readOriginalGcpSshClientProfile } from './gcp-ssh-client-profile';
import {
  assertOriginalApplyCallback,
  assertOriginalApplyLifetime,
  type OriginalApplyCallbackContext,
} from './installed-apply-controller';
import { linuxMonotonicMs } from './linux-clock';
import { bindOriginalAccessReaderCollection } from './original-access-reader-source';
import { inspectFinalReaderReserve } from './reader-final-reserve';

type OriginalInstalledGcpObserverAccessView = Awaited<
  ReturnType<Awaited<ReturnType<typeof openInstalledGcpObserverAccess>>['read']>
>;
const accessViews = new WeakMap<object, { callback: OriginalApplyCallbackContext; check(): Promise<void> }>();
/** Revalidate the actual factory view; a copied readiness packet cannot mint source authority. */
export async function readOriginalInstalledGcpObserverAccess(
  value: unknown,
  callback: OriginalApplyCallbackContext,
): Promise<OriginalInstalledGcpObserverAccessView> {
  const origin = value && typeof value === 'object' ? accessViews.get(value) : undefined;
  if (!origin || origin.callback !== callback)
    throw new Error('Original observer access view and actual callback required');
  await origin.check();
  return value as OriginalInstalledGcpObserverAccessView;
}

export interface InstalledGcpObserverAccessInput {
  readonly vm: unknown;
  readonly serial: unknown;
  readonly callback: OriginalApplyCallbackContext;
  readonly store: CeDeploymentStore;
  /** The enclosing installed factory opens the shipped profile without overrides. */
  readonly profile: OriginalGcpSshClientProfile;
  /** Explicit durable original installation selects read-only ABI renewal;
   * a failed or expired renewal never falls back to delivery. */
  readonly installation?: OriginalGcpObserverClientInstallation;
}

/** Concrete source composition only. Every command, trust record and reply is
 * issued by the original production source; no executor, fetch or command seam.
 * The owner keeps VM/serial/profile sources open through dependent settlement,
 * and retires the durable installation only after final capture/cleanup. */
export async function openInstalledGcpObserverAccess(input: InstalledGcpObserverAccessInput) {
  const { vm, serial, callback, store, profile } = input;
  const context = callback.original;
  const renewal = input.installation !== undefined;
  let installation = input.installation;
  const lifetime = () =>
    callback.phase === 'after' ? assertOriginalApplyCallback(callback) : assertOriginalApplyLifetime(callback);
  await lifetime();
  const original = await assertOriginalGcpObserverVmCaptureCallback(vm, callback);
  const originalSerial = await readOriginalGcpObserverSerialSource(vm, serial);
  await readOriginalGcpSshClientProfile(profile);
  await store.verify();
  if (
    context.inputs['workspace:gcp-terraform-input-identity.json']?.path !==
      join(store.directory, 'gcp-terraform-input-identity.json') ||
    (['provider', 'engine', 'account', 'region', 'deploymentId'] as const).some(
      (name) => store.owner[name] !== context.owner[name],
    )
  )
    throw new Error('Original observer access store and context differ');
  if (renewal) await assertOriginalGcpObserverClientInstallationContext(installation, callback);

  let claimed = false,
    initialized = false,
    closing = false,
    closed = false,
    closureUnresolved = false;
  let failure: unknown;
  let clientDeliveryAttempted = false;
  let pending: Promise<void> | undefined, closure: Promise<void> | undefined;
  const sources: Array<{ name: string; close(): void | Promise<void> }> = [];
  type AccessView = Readonly<{
    callback: OriginalApplyCallbackContext;
    vm: unknown;
    key: Awaited<ReturnType<typeof openOriginalGcpObserverCampaignKey>>;
    trust: Awaited<ReturnType<Awaited<ReturnType<typeof openGcpObserverHostTrustReader>>['verify']>>;
    peer: Awaited<ReturnType<Awaited<ReturnType<typeof openGcpObserverSshPeer>>['probe']>>;
    clients:
      | Awaited<ReturnType<Awaited<ReturnType<typeof openGcpObserverClientAbi>>['verify']>>
      | Awaited<ReturnType<Awaited<ReturnType<typeof openGcpObserverClientAbiRenewal>>['verify']>>;
    command: Awaited<ReturnType<typeof openOriginalGcpObserverSshCommand>>;
    localInputs: Awaited<ReturnType<typeof openOriginalGcpObserverSshInputLease>>;
    guestAcceptanceComplete: false;
    executionAuthorized: false;
  }>;
  let value: AccessView | undefined;
  const retain = async (phase: string, extra: Record<string, unknown> = {}) => {
    await store.verify();
    await store.write(`gcp-observer-access-${randomUUID()}.json`, {
      schemaVersion: 1,
      kind: 'original-installed-gcp-observer-access-event',
      phase,
      owner: context.owner,
      executor: callback.execution.identity,
      instanceId: original.instanceId,
      mode: renewal ? 'renewal' : 'initial',
      originalBudget: context.budget,
      ...extra,
      guestAcceptanceComplete: false,
      executionAuthorized: false,
    });
  };
  const guard = async () => {
    await lifetime();
    await context.assertInputs();
    const current = await assertOriginalGcpObserverVmCaptureCallback(vm, callback);
    const currentSerial = await readOriginalGcpObserverSerialSource(vm, serial);
    if (current.instanceId !== original.instanceId || JSON.stringify(currentSerial) !== JSON.stringify(originalSerial))
      throw new Error('Original observer access VM or serial source changed');
    await readOriginalGcpSshClientProfile(profile);
    await store.verify();
    if (renewal || installation) await assertOriginalGcpObserverClientInstallationContext(installation, callback);
    await lifetime();
  };
  const assertActive = () => {
    if (closing || closed) throw new Error('Original observer access retired');
    if (failure) throw new Error('Original observer access refused; failure retained');
  };
  const nativeSources: Record<string, unknown> = {};
  const own = <T extends { close(): void | Promise<void> }>(name: string, source: T): T => {
    if (['wire', 'trust', 'peer', 'delivery', 'abi', 'renewal'].includes(name)) nativeSources[name] = source;
    sources.push({ name, close: source.close.bind(source) });
    return source;
  };
  const ownReference = <T>(name: string, reference: T, close: (value: T) => void): T => {
    sources.push({ name, close: () => close(reference) });
    return reference;
  };
  const check = async () => {
    assertActive();
    await guard();
    assertActive();
  };
  const initialize = async () => {
    await check();
    const key = ownReference(
      'campaign-key',
      await openOriginalGcpObserverCampaignKey(vm, callback, store),
      closeOriginalGcpObserverCampaignKey,
    );
    const wireReader = own('wire', await openGcpObserverWireKeyReader(vm, callback, profile));
    const wire = await wireReader.scan();
    await check();
    const material = await compileOriginalGcpObserverTrustMaterial(vm, serial, wire, callback);
    const trustReader = own('trust', await openGcpObserverHostTrustReader(material, callback));
    const trust = await trustReader.verify();
    await check();
    const command = ownReference(
      'ssh-command',
      await openOriginalGcpObserverSshCommand(trust, key, profile, callback),
      closeOriginalGcpObserverSshCommand,
    );
    const localInputs = own('ssh-inputs', await openOriginalGcpObserverSshInputLease(command, callback));
    const peerReader = own('peer', await openGcpObserverSshPeer(command));
    const peer = await peerReader.probe();
    await check();
    let clients: AccessView['clients'];
    if (renewal) {
      const abiCommand = ownReference(
        'renewal-command',
        await openOriginalGcpObserverClientAbiRenewalCommand(installation, peer, callback),
        closeOriginalGcpObserverClientAbiRenewalCommand,
      );
      const abiReader = own('renewal', await openGcpObserverClientAbiRenewal(abiCommand));
      clients = await abiReader.verify();
    } else {
      const payload = ownReference(
        'payload',
        await openOriginalGcpObserverClientPayload(profile, callback),
        closeOriginalGcpObserverClientPayload,
      );
      const deliveryCommand = ownReference(
        'delivery-command',
        await openOriginalGcpObserverClientDeliveryCommand(peer, payload, callback),
        closeOriginalGcpObserverClientDeliveryCommand,
      );
      const deliveryReader = own('delivery', await openGcpObserverClientDelivery(deliveryCommand));
      clientDeliveryAttempted = true;
      const delivery = await deliveryReader.deliver();
      // Preserve original installed bytes even if independent ABI qualification fails.
      installation = await openOriginalGcpObserverClientInstallation(delivery);
      await retain('installed');
      await check();
      const abiCommand = ownReference(
        'abi-command',
        await openOriginalGcpObserverClientAbiCommand(delivery, callback),
        closeOriginalGcpObserverClientAbiCommand,
      );
      const abiReader = own('abi', await openGcpObserverClientAbi(abiCommand));
      clients = await abiReader.verify();
    }
    await check();
    await assertOriginalQualifiedGcpObserverClientsContext(clients, callback);
    await localInputs.assertOriginal();
    value = Object.freeze({
      callback,
      vm,
      key,
      trust,
      peer,
      clients,
      command,
      localInputs,
      guestAcceptanceComplete: false,
      executionAuthorized: false,
    });
    accessViews.set(value, {
      callback,
      check: async () => {
        await check();
        if (!initialized || !value) throw new Error('Original observer access view is not initialized');
        await assertOriginalQualifiedGcpObserverClientsContext(value.clients, callback);
        await value.localInputs.assertOriginal();
        await check();
      },
    });
    await retain('initialized');
    await check();
    initialized = true;
  };
  await guard();
  const port = Object.freeze({
    initialize(): Promise<void> {
      try {
        if (claimed) throw new Error('Original observer access initialization already claimed');
        assertActive();
      } catch (error) {
        return Promise.reject(error);
      }
      claimed = true;
      pending = initialize().catch(async (error) => {
        failure ??= error;
        await retain('initialization-refused', { errorType: error instanceof Error ? error.name : typeof error });
        throw error;
      });
      return pending;
    },
    async read() {
      assertActive();
      if (!initialized || !value) throw new Error('Original observer access not initialized');
      try {
        await check();
        await assertOriginalQualifiedGcpObserverClientsContext(value.clients, callback);
        await value.localInputs.assertOriginal();
        await check();
        return value;
      } catch (error) {
        failure ??= error;
        await retain('read-refused');
        throw error;
      }
    },
    /** This historical installation survives source closure for explicit renewal.
     * Its owning campaign must retire it after all dependents settle. */
    async readInstallation() {
      if (!installation) throw new Error('Original observer installation unavailable');
      await readOriginalGcpObserverClientInstallation(installation);
      return installation;
    },
    close(finalCallback?: OriginalApplyCallbackContext): Promise<void> {
      if (closure) return closure;
      closing = true;
      closure = (async () => {
        let deadline = Math.min(context.budget.deadline + 300000, linuxMonotonicMs() + 300000);
        if (finalCallback) {
          await assertOriginalApplyCallback(finalCallback);
          if (
            finalCallback.phase !== 'after' ||
            !finalCallback.reserve ||
            finalCallback.original !== context ||
            finalCallback.nonce !== callback.nonce ||
            finalCallback.execution.output !== callback.execution.output
          )
            throw new Error('Original observer final closure callback differs');
          deadline = inspectFinalReaderReserve(finalCallback.reserve).finalDeadlineMs;
        }
        let watching = true;
        const watch = (async () => {
          while (watching) {
            if (linuxMonotonicMs() >= deadline)
              throw new Error('Original observer source closure unresolved in final reserve');
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
          if (failures.length) throw new AggregateError(failures, 'Original observer source closure incomplete');
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
        clientDeliveryAttempted,
        mode: renewal ? 'renewal' : 'initial',
        guestAcceptanceComplete: false,
        executionAuthorized: false,
      }),
  });
  await bindOriginalAccessReaderCollection(port, {
    callback,
    family: 'observer',
    instanceId: original.instanceId,
    sources: () => ({ ...nativeSources }),
  });
  return port;
}
