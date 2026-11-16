import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import type {
  OriginalGcpBootstrapObservation,
  OriginalGcpPlatformPresence,
} from '../../platform/src/ce/gcp-bootstrap-observation';
import type { CeOwner } from '../../platform/src/ce/runtime';
import type { CePlatformService } from '../../platform/src/ce/service';
import { decodeEvidenceObject } from './evidence-json';
import {
  type GcpCloudReadEvidence,
  type OriginalGcpInventoryResource,
  openInstalledGcpCloudSerialReader,
} from './gcp-cloud-serial-reader';
import {
  assertOriginalApplyCallback,
  assertOriginalApplyLifetime,
  type OriginalApplyCallbackContext,
} from './installed-apply-controller';
import type { InstalledCaptureContext } from './installed-capture-context';
import { readOwnedInstalledInput } from './installed-runtime';
import { linuxMonotonicMs } from './linux-clock';
import type { OriginalCloudInventoryBinding } from './original-gcp-inventory-scope';
import {
  assertOriginalGcpInventoryContext,
  assertOriginalGcpInventoryInputs,
  assertOriginalGcpInventoryScope,
  inspectOriginalGcpInventoryScope,
} from './original-gcp-inventory-scope';
import { assertSameOriginalInput, type OriginalInputBinding } from './original-input-monitor';
import { readOriginalExecutionPrefix } from './original-output-stream';

export interface InstalledInitialInventoryInput {
  readonly context: InstalledCaptureContext;
  readonly scope: unknown;
  readonly store: CeDeploymentStore;
  readonly platform: Pick<CePlatformService, 'gcpBootstrapSource' | 'gcpBootstrapObservation'>;
}
export interface InstalledInitialInventoryOptions {
  /** Explicit offline transport fixture; ordinary installed capture supplies none. */
  readonly fetcher?: typeof fetch;
}
export interface OriginalInitialGcpInventory {
  readonly schemaVersion: 1;
  readonly kind: 'original-initial-gcp-inventory';
}

export interface OriginalApplyGcpInventory {
  readonly schemaVersion: 1;
  readonly kind: 'original-apply-gcp-inventory';
}
export interface OriginalApplyGcpInventoryView {
  readonly owner: Readonly<CeOwner>;
  readonly executor: OriginalApplyCallbackContext['execution']['identity'];
  readonly planSha256: string;
  readonly intentFingerprint: string;
  readonly startedMonotonicMs: number;
  readonly boundMonotonicMs: number;
  readonly resources: readonly Readonly<{ address: string; type: string }>[];
  readonly cloud: readonly Readonly<
    OriginalCloudInventoryBinding & {
      evidence: GcpCloudReadEvidence;
      raw: Buffer;
      authentication: Readonly<{ accountSha256: string; audienceSha256: string; adcSha256: string }>;
    }
  >[];
  readonly creationOwnershipQualified: false;
  readonly executionAuthorized: false;
}
const applyInventories = new WeakMap<
  OriginalApplyGcpInventory,
  (final?: OriginalApplyCallbackContext) => Promise<OriginalApplyGcpInventoryView>
>();
export async function readOriginalApplyGcpInventory(packet: unknown, final?: OriginalApplyCallbackContext) {
  const read =
    packet && typeof packet === 'object' ? applyInventories.get(packet as OriginalApplyGcpInventory) : undefined;
  if (!read) throw new Error('Original apply-bound inventory required');
  return read(final);
}

const preparations = new WeakMap<
  InstalledCaptureContext,
  {
    scope: unknown;
    directory: string;
    platform: InstalledInitialInventoryInput['platform'];
    fetcher: typeof fetch | undefined;
    value: Promise<Awaited<ReturnType<typeof openInitialInventory>>>;
  }
>();

/** Reopening the same original context returns its same single-use stage.
 * A changed store, issuer or transport cannot reset a failed preparation.
 */
export async function openInstalledInitialInventory(
  input: InstalledInitialInventoryInput,
  options: InstalledInitialInventoryOptions = {},
) {
  const { context, scope, store, platform } = input;
  assertOriginalGcpInventoryContext(scope, context);
  const current = preparations.get(context);
  if (current) {
    if (
      current.scope !== scope ||
      current.directory !== store.directory ||
      current.platform !== platform ||
      current.fetcher !== options.fetcher
    )
      throw new Error('Original initial inventory source differs');
    await store.verify();
    await assertOriginalGcpInventoryScope(scope);
    return current.value;
  }
  const value = openInitialInventory(input, options);
  preparations.set(context, { scope, directory: store.directory, platform, fetcher: options.fetcher, value });
  return value;
}

/** Read-only pre-submit inventory stage. Every target comes from the owning plan.
 * Absence is retained evidence, separate from creation, bootstrap and execution authority.
 */
async function openInitialInventory(
  input: InstalledInitialInventoryInput,
  options: InstalledInitialInventoryOptions = {},
) {
  const { context, scope, store, platform } = input;
  assertOriginalGcpInventoryContext(scope, context);
  const view = await inspectOriginalGcpInventoryScope(scope);
  const directory = store.directory;
  const owner = Object.freeze({ ...context.owner });
  const source = platform.gcpBootstrapSource?.();
  const openObservation = platform.gcpBootstrapObservation?.bind(platform);
  const origin = context.environment.XCSH_API_URL;
  const credential = context.environment.XCSH_API_TOKEN;
  if (!source || !openObservation || !origin || !credential)
    throw new Error('Original installed Platform inventory source required');
  let retired = false,
    claimed = false,
    closingRequested = false;
  let failureRetention: Promise<string> | undefined;
  let closure: Promise<void> | undefined;
  let pending: Promise<OriginalInitialGcpInventory> | undefined;
  let snapshot: OriginalInitialGcpInventory | undefined;
  let receiptBinding: OriginalInputBinding | undefined;
  let started = 0;
  let applyCallback: OriginalApplyCallbackContext | undefined;
  let applyPacket: OriginalApplyGcpInventory | undefined;
  let bindingAttempt: Promise<OriginalApplyGcpInventory> | undefined;
  const guard = async () => {
    if (retired) throw new Error('Original initial inventory retired');
    assertOriginalGcpInventoryContext(scope, context);
    await assertOriginalGcpInventoryScope(scope);
    await context.assertInputs();
    await store.verify();
    if (
      store.directory !== directory ||
      (['provider', 'engine', 'account', 'region', 'deploymentId'] as const).some(
        (key) => store.owner[key] !== owner[key],
      )
    )
      throw new Error('Original inventory storage scope changed');
    await context.assertWithinDeadline();
    if (retired) throw new Error('Original initial inventory retired');
  };
  await guard();
  const saved = (await store.read('gcp-terraform-input-identity.json')) as { platformContext: string };
  const cloud = await openInstalledGcpCloudSerialReader(context, undefined, options.fetcher);
  let observation: OriginalGcpBootstrapObservation;
  try {
    observation = await openObservation(owner, saved.platformContext, {
      origin,
      credentialSha256: createHash('sha256').update(credential).digest('hex'),
      targets: view.platform.map((row) => row.target),
      assertOriginal: guard,
    });
    await guard();
  } catch (error) {
    retired = true;
    try {
      await cloud.close();
    } catch (closureError) {
      throw new AggregateError([error, closureError], 'Original inventory opening and closure failed');
    }
    throw error;
  }
  const cloudEvidence: Array<{ value: GcpCloudReadEvidence; resource: boolean }> = [];
  const platformEvidence: OriginalGcpPlatformPresence[] = [];
  const rows: Array<{ address: string; type: string; present: boolean; bodyPath: string; bodySha256: string }> = [];
  const id = randomUUID();
  const retain = async (state: 'capturing' | 'complete' | 'failed', error?: unknown) => {
    if (store.directory !== directory) throw new Error('Original inventory storage scope changed');
    const name = `gcp-initial-inventory-${id}-${state}.private.json`;
    await store.write(name, {
      schemaVersion: 1,
      kind: 'original-initial-gcp-inventory-capture',
      state,
      owner,
      planSha256: view.planSha256,
      intentFingerprint: view.intentFingerprint,
      resources: rows,
      expectedResources: view.resources,
      startedMonotonicMs: started,
      creationOwnershipQualified: false,
      executionAuthorized: false,
      ...(error === undefined ? {} : { errorType: error instanceof Error ? error.name : typeof error }),
    });
    return join(directory, name);
  };
  const retainFailure = (error: unknown) => {
    if (!failureRetention) failureRetention = retain('failed', error);
    return failureRetention;
  };
  const fresh = () => {
    const elapsed = linuxMonotonicMs() - started;
    if (elapsed < 0 || elapsed >= 300000) throw new Error('Original initial inventory freshness exhausted');
  };
  const assertSnapshot = async (value: OriginalInitialGcpInventory) => {
    if (!snapshot || value !== snapshot) throw new Error('Original initial inventory reference required');
    try {
      await guard();
      fresh();
      if (!receiptBinding) throw new Error('Original initial inventory receipt required');
      assertSameOriginalInput(receiptBinding, (await readOwnedInstalledInput(receiptBinding.path)).binding);
      for (const entry of cloudEvidence) {
        if (entry.resource) await cloud.readResourceEvidence(entry.value as OriginalGcpInventoryResource);
        else await cloud.readEvidence(entry.value);
      }
      for (const presence of platformEvidence) {
        await observation.assertPresence(presence);
        await source.assertBody(presence.body);
      }
      await guard();
      fresh();
      assertSameOriginalInput(receiptBinding, (await readOwnedInstalledInput(receiptBinding.path)).binding);
      if (retired) throw new Error('Original initial inventory retired');
    } catch (error) {
      retired = true;
      if (!closingRequested) {
        try {
          await retainFailure(error);
        } catch (persistenceError) {
          throw new AggregateError(
            [error, persistenceError],
            'Original inventory verification and failure persistence failed',
          );
        }
      }
      throw error;
    }
  };
  return Object.freeze({
    capture(): Promise<OriginalInitialGcpInventory> {
      if (claimed) return Promise.reject(new Error('Original initial inventory already claimed'));
      claimed = true;
      started = linuxMonotonicMs();
      pending = (async () => {
        try {
          await guard();
          await retain('capturing');
          for (const binding of view.cloud) {
            await guard();
            fresh();
            const target = binding.target;
            const value =
              target.kind === 'instance'
                ? await cloud.instance(target.zone, target.name)
                : await cloud.resource(target);
            cloudEvidence.push({ value, resource: target.kind !== 'instance' });
            rows.push({
              address: binding.address,
              type: binding.type,
              present: value.present,
              bodyPath: value.path,
              bodySha256: value.sha256,
            });
            await retain('capturing');
            if (value.present) throw new Error('Initial GCP resource already exists');
          }
          for (const binding of view.platform) {
            await guard();
            fresh();
            const value = await observation.readPresence(binding.target);
            await source.assertBody(value.body);
            platformEvidence.push(value);
            rows.push({
              address: binding.address,
              type: binding.type,
              present: value.present,
              bodyPath: value.body.evidence.bodyPath,
              bodySha256: value.body.evidence.bodySha256,
            });
            await retain('capturing');
            if (value.present) throw new Error('Initial Platform resource already exists');
          }
          await guard();
          fresh();
          if (rows.length !== view.resources.length) throw new Error('Original initial inventory coverage incomplete');
          const path = await retain('complete');
          receiptBinding = (await readOwnedInstalledInput(path)).binding;
          snapshot = Object.freeze({ schemaVersion: 1, kind: 'original-initial-gcp-inventory' });
          await assertSnapshot(snapshot);
          return snapshot;
        } catch (error) {
          retired = true;
          try {
            await retainFailure(error);
          } catch (persistenceError) {
            throw new AggregateError([error, persistenceError], 'Original inventory failure and persistence failed');
          }
          throw error;
        }
      })();
      return pending;
    },
    async bindForApply(
      value: OriginalInitialGcpInventory,
      callback: OriginalApplyCallbackContext,
    ): Promise<OriginalApplyGcpInventory> {
      if (applyPacket) {
        await assertOriginalApplyLifetime(callback);
        if (callback !== applyCallback || value !== snapshot)
          throw new Error('Original inventory already bound to another apply');
        await readOriginalApplyGcpInventory(applyPacket);
        return applyPacket;
      }
      await assertOriginalApplyCallback(callback);
      if (
        callback.phase !== 'before' ||
        callback.original !== context ||
        callback.execution.directory !== context.executionDirectory ||
        value !== snapshot
      )
        throw new Error('Original inventory before-apply context differs');
      if (bindingAttempt) {
        if (callback !== applyCallback) throw new Error('Original inventory bind already claimed');
        return bindingAttempt;
      }
      applyCallback = callback;
      bindingAttempt = (async () => {
        try {
          await assertSnapshot(value);
          const prefix = await readOriginalExecutionPrefix(callback.execution.output);
          const identity = callback.execution.identity;
          const expectedArgs = [
            'apply',
            '-json',
            '-parallelism=1',
            '-input=false',
            '-lock=true',
            '-lock-timeout=60s',
            'saved.tfplan',
          ];
          if (
            prefix.directory !== context.executionDirectory ||
            (['pid', 'group', 'start', 'boot'] as const).some((key) => prefix.identity[key] !== identity[key]) ||
            callback.execution.args.length !== expectedArgs.length ||
            callback.execution.args.some((arg, index) => arg !== expectedArgs[index])
          )
            throw new Error('Original inventory owning executor differs');
          const records: Array<{
            binding: OriginalInputBinding;
            evidence: GcpCloudReadEvidence;
            cloud: OriginalCloudInventoryBinding;
          }> = [];
          for (const [index, entry] of cloudEvidence.entries()) {
            const read = entry.resource
              ? await cloud.readResourceEvidence(entry.value as OriginalGcpInventoryResource)
              : await cloud.readEvidence(entry.value);
            const retained = await readOwnedInstalledInput(entry.value.path, 4 * 1024 * 1024);
            if (
              retained.binding.sha256 !== entry.value.sha256 ||
              createHash('sha256').update(read.raw).digest('hex') !== entry.value.sha256
            )
              throw new Error('Original inventory absence bytes differ');
            records.push({ binding: retained.binding, evidence: entry.value, cloud: view.cloud[index] });
          }
          const platformBindings: OriginalInputBinding[] = [];
          for (const presence of platformEvidence) {
            await observation.assertPresence(presence);
            await source.assertBody(presence.body);
            const retained = await readOwnedInstalledInput(presence.body.evidence.bodyPath, 4 * 1024 * 1024);
            if (retained.binding.sha256 !== presence.body.evidence.bodySha256)
              throw new Error('Original Platform baseline bytes differ');
            platformBindings.push(retained.binding);
          }
          await assertSnapshot(value);
          await assertOriginalApplyCallback(callback);
          const boundMonotonicMs = linuxMonotonicMs();
          const boundName = `gcp-initial-inventory-${id}-apply-bound.private.json`;
          await store.write(boundName, {
            schemaVersion: 2,
            kind: 'original-apply-bound-inventory-record',
            owner,
            planSha256: view.planSha256,
            intentFingerprint: view.intentFingerprint,
            executor: identity,
            callbackNonce: callback.nonce,
            startedMonotonicMs: started,
            boundMonotonicMs,
            resources: rows,
            executionAuthorized: false,
            creationOwnershipQualified: false,
          });
          const boundReceipt = (await readOwnedInstalledInput(join(directory, boundName))).binding;
          await assertSnapshot(value);
          await assertOriginalApplyCallback(callback);
          const packet: OriginalApplyGcpInventory = Object.freeze({
            schemaVersion: 1,
            kind: 'original-apply-gcp-inventory',
          });
          applyInventories.set(packet, async (final) => {
            if (retired) throw new Error('Original apply-bound inventory retired');
            try {
              if (final) {
                await assertOriginalApplyCallback(final);
                if (
                  final.phase !== 'after' ||
                  final.original !== context ||
                  final.nonce !== callback.nonce ||
                  (['pid', 'group', 'start', 'boot'] as const).some(
                    (key) => final.execution.identity[key] !== identity[key],
                  )
                )
                  throw new Error('Original inventory final callback differs');
              } else await assertOriginalApplyLifetime(callback);
              assertOriginalGcpInventoryContext(scope, context);
              await assertOriginalGcpInventoryInputs(scope);
              await context.assertInputs();
              await store.verify();
              if (
                store.directory !== directory ||
                (['provider', 'engine', 'account', 'region', 'deploymentId'] as const).some(
                  (key) => store.owner[key] !== owner[key],
                )
              )
                throw new Error('Original bound inventory owner changed');
              for (const input of [receiptBinding, boundReceipt]) {
                if (!input) throw new Error('Original bound inventory receipt unavailable');
                assertSameOriginalInput(input, (await readOwnedInstalledInput(input.path)).binding);
              }
              const results = [];
              for (const entry of records) {
                const current = await readOwnedInstalledInput(entry.binding.path, 4 * 1024 * 1024);
                assertSameOriginalInput(entry.binding, current.binding);
                const decoded = decodeEvidenceObject(current.bytes);
                const error =
                  decoded.error && typeof decoded.error === 'object' && !Array.isArray(decoded.error)
                    ? (decoded.error as { code?: unknown })
                    : {};
                if (error.code !== 404) throw new Error('Original baseline absence differs');
                results.push(
                  Object.freeze({
                    ...entry.cloud,
                    evidence: entry.evidence,
                    raw: Buffer.from(current.bytes),
                    authentication: Object.freeze({
                      accountSha256: context.authentication.accountSha256,
                      audienceSha256: context.authentication.audienceSha256,
                      adcSha256: context.authentication.snapshotSha256,
                    }),
                  }),
                );
              }
              for (const binding of platformBindings)
                assertSameOriginalInput(
                  binding,
                  (await readOwnedInstalledInput(binding.path, 4 * 1024 * 1024)).binding,
                );
              for (const entry of records)
                assertSameOriginalInput(
                  entry.binding,
                  (await readOwnedInstalledInput(entry.binding.path, 4 * 1024 * 1024)).binding,
                );
              await assertOriginalGcpInventoryInputs(scope);
              await context.assertInputs();
              if (final) await assertOriginalApplyCallback(final);
              else await assertOriginalApplyLifetime(callback);
              // Recheck every retained baseline after asynchronous source and lifetime checks.
              // Earlier verification alone cannot detect a mutation during those later reads.
              for (const input of [
                receiptBinding,
                boundReceipt,
                ...platformBindings,
                ...records.map((entry) => entry.binding),
              ]) {
                if (!input) throw new Error('Original bound inventory receipt unavailable');
                assertSameOriginalInput(input, (await readOwnedInstalledInput(input.path, 4 * 1024 * 1024)).binding);
              }
              if (retired) throw new Error('Original apply-bound inventory retired');
              return Object.freeze({
                owner,
                executor: identity,
                planSha256: view.planSha256,
                intentFingerprint: view.intentFingerprint,
                startedMonotonicMs: started,
                boundMonotonicMs,
                resources: view.resources,
                cloud: Object.freeze(results),
                creationOwnershipQualified: false as const,
                executionAuthorized: false as const,
              });
            } catch (error) {
              retired = true;
              try {
                await retainFailure(error);
              } catch (retention) {
                throw new AggregateError([error, retention], 'Original bound inventory refusal and retention failed');
              }
              throw error;
            }
          });
          applyPacket = packet;
          return packet;
        } catch (error) {
          retired = true;
          try {
            await retainFailure(error);
          } catch (retention) {
            throw new AggregateError([error, retention], 'Original inventory bind failure and retention failed');
          }
          throw error;
        }
      })();
      return bindingAttempt;
    },
    assertSnapshot,
    async inspect(value: OriginalInitialGcpInventory) {
      await assertSnapshot(value);
      return Object.freeze({
        planSha256: view.planSha256,
        resources: view.resources,
        cloudCount: view.cloud.length,
        platformCount: view.platform.length,
        creationOwnershipQualified: false,
        executionAuthorized: false,
      });
    },
    close() {
      if (closure) return closure;
      closingRequested = true;
      retired = true;
      closure = (async () => {
        const results = await Promise.allSettled([cloud.close(), observation.close()]);
        if (pending) await Promise.allSettled([pending]);
        const failures = results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));
        if (failures.length) throw new AggregateError(failures, 'Original initial inventory reader closure failed');
      })();
      return closure;
    },
  });
}
