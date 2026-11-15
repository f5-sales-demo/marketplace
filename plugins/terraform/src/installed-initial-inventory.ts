import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import type {
  OriginalGcpBootstrapObservation,
  OriginalGcpPlatformPresence,
} from '../../platform/src/ce/gcp-bootstrap-observation';
import type { CePlatformService } from '../../platform/src/ce/service';
import {
  type GcpCloudReadEvidence,
  type OriginalGcpInventoryResource,
  openInstalledGcpCloudSerialReader,
} from './gcp-cloud-serial-reader';
import type { InstalledCaptureContext } from './installed-capture-context';
import { readOwnedInstalledInput } from './installed-runtime';
import { linuxMonotonicMs } from './linux-clock';
import {
  assertOriginalGcpInventoryContext,
  assertOriginalGcpInventoryScope,
  inspectOriginalGcpInventoryScope,
} from './original-gcp-inventory-scope';
import { assertSameOriginalInput, type OriginalInputBinding } from './original-input-monitor';

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
