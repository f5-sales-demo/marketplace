import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { assertExecutorProcessGroupAbsent } from '../../../platform/src/ce/process-lock';
import { decodeEvidenceObject } from '../../../terraform/src/evidence-json';
import { readOwnedInstalledInput } from '../../../terraform/src/installed-runtime';
import { linuxMonotonicMs } from '../../../terraform/src/linux-clock';
import { monitorOriginalInputs, type OriginalInputBinding } from '../../../terraform/src/original-input-monitor';
import {
  type CaptureCleanupInspection,
  type CaptureCleanupRecovery,
  type EmptyOriginalCaptureCleanupVerification,
  readCaptureCleanupAttemptResourceFields,
} from '../../../terraform/src/runner';
import type { GcloudExecApi } from '../gcloud/exec';
import { readGcpCaptureCleanupStateCandidate } from './capture-cleanup-state';
import { fingerprint } from './discovery';
import {
  type GcpTerraformOwnershipObserverRuntime,
  type GcpTerraformOwnershipRuntime,
  inspectPublicTerraformOwnership,
  publicTerraformSelections,
} from './terraform-public-ownership';
import { verifyPublicTerraformLiveOwnership } from './terraform-public-teardown';
import type { GcpCeIntent } from './types';

const freeze = <T>(value: T): T => {
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  }
  return value;
};

async function preserveEmptyOriginalProof(
  inspection: CaptureCleanupInspection,
): Promise<EmptyOriginalCaptureCleanupVerification> {
  if (process.platform !== 'linux') throw new Error('Original GCP cleanup capture requires Linux');
  const base = join(inspection.directory, 'capture-cleanup-verification');
  try {
    await mkdir(base, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  const ownedDirectory = async (path: string) => {
    const metadata = await lstat(path);
    if (
      !metadata.isDirectory() ||
      metadata.isSymbolicLink() ||
      metadata.uid !== process.getuid?.() ||
      (metadata.mode & 0o777) !== 0o700 ||
      (await realpath(path)) !== path
    )
      throw new Error('Original private cleanup verification directory required');
    return metadata;
  };
  await ownedDirectory(base);
  const directory = join(base, randomUUID());
  await mkdir(directory, { mode: 0o700 });
  const original = await ownedDirectory(directory);
  const descriptor = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    const opened = await descriptor.stat();
    if (
      opened.dev !== original.dev ||
      opened.ino !== original.ino ||
      opened.uid !== original.uid ||
      opened.mode !== original.mode
    )
      throw new Error('Original cleanup verification directory changed before write');
    const journal = await readOwnedInstalledInput(join(inspection.directory, 'plan-receipt.json'));
    const binary = await readOwnedInstalledInput(join(inspection.directory, 'saved.tfplan'));
    if (
      journal.binding.sha256 !== inspection.inputs['plan-receipt.json'].sha256 ||
      binary.binding.sha256 !== inspection.receipt.planSha256
    )
      throw new Error('Original empty cleanup checkpoint or binary changed');
    for (const [name, bytes] of [
      ['original-empty-create.private.json', journal.bytes],
      ['saved-create.tfplan', binary.bytes],
    ] as const) {
      const file = await open(
        `/proc/self/fd/${descriptor.fd}/${name}`,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o400,
      );
      try {
        await file.writeFile(bytes);
        await file.sync();
      } finally {
        await file.close();
      }
    }
    const current = await ownedDirectory(directory);
    if (current.dev !== opened.dev || current.ino !== opened.ino)
      throw new Error('Original private cleanup verification directory replaced');
  } finally {
    await descriptor.close();
  }
  return freeze({
    schemaVersion: 1,
    kind: 'original-empty-create-state-verification',
    checkpoint: (await readOwnedInstalledInput(join(directory, 'original-empty-create.private.json'))).binding,
    savedPlan: (await readOwnedInstalledInput(join(directory, 'saved-create.tfplan'))).binding,
    receipt: structuredClone(inspection.receipt),
  });
}

export const gcpCleanupSignal = (milliseconds: number, parent?: AbortSignal) =>
  parent ? AbortSignal.any([parent, AbortSignal.timeout(milliseconds)]) : AbortSignal.timeout(milliseconds);

export function boundedGcpCleanupObservers(
  api: GcloudExecApi,
  observePlatform: GcpTerraformOwnershipObserverRuntime['observePlatform'],
): GcpTerraformOwnershipObserverRuntime {
  const exec = api.exec.bind(api);
  const observation: GcpTerraformOwnershipObserverRuntime = {
    api: {
      exec: async (command, args, options = {}) => {
        const bounded = gcpCleanupSignal(60000, options.signal);
        const result = await exec(command, args, { ...options, signal: bounded });
        bounded.throwIfAborted();
        return result;
      },
    },
    observePlatform: async (site, token, parent) => {
      const bounded = gcpCleanupSignal(60000, parent);
      const result = await observePlatform(site, token, bounded);
      bounded.throwIfAborted();
      return result;
    },
  };
  return observation;
}

/** Compiled domain admission only. Tool arguments cannot supply an executor,
 * closure callback or an ownership verdict. Reviewed destroy authorization
 * remains mandatory in the shared runner and public teardown workflow. */
export async function openGcpCaptureCleanupAdmission(
  input: {
    readonly intent: GcpCeIntent;
    readonly inspection: CaptureCleanupInspection;
    readonly api: GcloudExecApi;
    readonly observePlatform: GcpTerraformOwnershipObserverRuntime['observePlatform'];
  },
  signal?: AbortSignal,
) {
  const intent = structuredClone(input.intent);
  const original = input.inspection;
  const inspection: CaptureCleanupInspection = {
    directory: original.directory,
    inputs: structuredClone(original.inputs),
    receipt: structuredClone(original.receipt),
    selections: publicTerraformSelections(intent),
    environment: { ...original.environment },
    execute: original.execute,
    assertIndependentClosure: original.assertIndependentClosure.bind(original),
  };
  const closure = inspection.assertIndependentClosure;
  const signalFor = gcpCleanupSignal;
  const openingSignal = signalFor(300000, signal);
  const observation = boundedGcpCleanupObservers(input.api, input.observePlatform);
  const monitor = await monitorOriginalInputs(inspection.inputs);
  let scopeMonitor: Awaited<ReturnType<typeof monitorOriginalInputs>> | undefined;
  let stateMonitor: Awaited<ReturnType<typeof monitorOriginalInputs>> | undefined;
  let closed = false,
    returned = false,
    liveRead = false;
  let refusal: unknown;
  const close = () => {
    closed = true;
    scopeMonitor?.close();
    stateMonitor?.close();
  };
  const assertScope = async () => {
    if (closed) throw new Error('Original GCP cleanup admission retired');
    if (refusal) throw refusal;
    if (!scopeMonitor) throw new Error('Original GCP cleanup scope is unavailable');
    await scopeMonitor.assertOriginal();
    await assertExecutorProcessGroupAbsent(join(inspection.directory, '.terraform-executor-lock'));
    await closure();
    await scopeMonitor.assertOriginal();
    if (closed) throw new Error('Original GCP cleanup admission retired during inspection');
  };
  try {
    await monitor.assertOriginal();
    const manifestFile = await readOwnedInstalledInput(join(inspection.directory, 'deployment.json'));
    const manifest = decodeEvidenceObject(manifestFile.bytes);
    const scope = manifest.scope as Record<string, unknown> | undefined;
    if (
      manifest.engine !== 'terraform' ||
      manifest.deploymentId !== intent.deploymentName ||
      scope?.cloud !== 'gcp' ||
      scope.account !== intent.project ||
      scope.region !== intent.region
    )
      throw new Error('Original GCP capture cleanup manifest scope differs');
    const stateFile = await readOwnedInstalledInput(join(inspection.directory, 'terraform.tfstate'));
    const candidate = readGcpCaptureCleanupStateCandidate({
      intent,
      createReceipt: inspection.receipt,
      bytes: stateFile.bytes,
      expectedStateSha256: inspection.inputs['terraform.tfstate'].sha256,
    });
    await monitor.assertOriginal();
    const runtime: GcpTerraformOwnershipRuntime = {
      ...observation,
      environment: inspection.environment,
      session: {
        readApplyAttemptResourceFields: async (receipt, selections, environment, parent) => {
          if (
            fingerprint(receipt) !== fingerprint(inspection.receipt) ||
            fingerprint(selections) !== fingerprint(inspection.selections) ||
            fingerprint(environment) !== fingerprint(inspection.environment)
          )
            throw new Error('Original GCP cleanup read request differs');
          return readCaptureCleanupAttemptResourceFields(inspection, parent);
        },
      },
    };
    const owned = await inspectPublicTerraformOwnership(runtime, intent, inspection.receipt, openingSignal);
    if (
      fingerprint(owned.state) !== fingerprint(candidate.state) ||
      fingerprint(owned.addresses.slice().sort()) !== fingerprint(candidate.resources.map((row) => row.address).sort())
    )
      throw new Error('Original GCP cleanup candidate and independent owning snapshot differ');
    await verifyPublicTerraformLiveOwnership(observation, intent, owned, openingSignal, false);
    await monitor.assertOriginal();
    openingSignal.throwIfAborted();
    const retained: Record<string, OriginalInputBinding> = {};
    for (const name of ['deployment.json', 'main.tf.json', '.terraform.lock.hcl', 'deployment.tfrc'])
      retained[name] = inspection.inputs[name];
    const lockNames = ['claim.json', 'lifetime.json', 'capture-unresolved.json'] as const;
    const retainedLockInputs: Record<string, OriginalInputBinding> = {};
    for (const name of lockNames) {
      retained[`lock:${name}`] = inspection.inputs[`lock:${name}`];
      retainedLockInputs[name] = inspection.inputs[`lock:${name}`];
    }
    scopeMonitor = await monitorOriginalInputs(retained);
    stateMonitor = await monitorOriginalInputs({ state: inspection.inputs['terraform.tfstate'] });
    await assertScope();
    const ownership = freeze(structuredClone(owned));
    const emptyOriginal = candidate.resources.length ? undefined : await preserveEmptyOriginalProof(inspection);
    await monitor.assertOriginal();
    const recovery: CaptureCleanupRecovery = freeze({
      deploymentId: intent.deploymentName,
      deploymentManifestSha256: inspection.inputs['deployment.json'].sha256,
      state: candidate.state,
      resources: candidate.resources,
      retainedLockInputs,
      retainedLockSha256: Object.fromEntries(
        lockNames.map((name) => [name, retainedLockInputs[name].sha256]),
      ) as CaptureCleanupRecovery['retainedLockSha256'],
      ...(emptyOriginal ? { emptyOriginal } : {}),
      assertIndependentClosure: assertScope,
    });
    const assertLiveOwnership = async (parent?: AbortSignal) => {
      if (liveRead) throw new Error('Original GCP cleanup ownership inspection is already running');
      liveRead = true;
      try {
        await assertScope();
        await stateMonitor?.assertOriginal();
        const began = linuxMonotonicMs();
        const bounded = signalFor(300000, parent);
        const absent = await verifyPublicTerraformLiveOwnership(observation, intent, ownership, bounded, false);
        await stateMonitor?.assertOriginal();
        await assertScope();
        bounded.throwIfAborted();
        if (linuxMonotonicMs() - began >= 300000) throw new Error('Original GCP cleanup ownership observation expired');
        return absent;
      } catch (error) {
        refusal ??= error;
        throw error;
      } finally {
        liveRead = false;
      }
    };
    returned = true;
    return Object.freeze({
      schemaVersion: 1 as const,
      kind: 'gcp-capture-cleanup-admission' as const,
      candidate,
      ownership,
      recovery,
      emptyOriginalState: candidate.resources.length === 0,
      executionAuthorized: false as const,
      assertLiveOwnership,
      close,
    });
  } finally {
    monitor.close();
    if (!returned) close();
  }
}
