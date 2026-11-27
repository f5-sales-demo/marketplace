import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import type { CeOwner } from '../../../platform/src/ce/runtime';
import type { CePlatformService } from '../../../platform/src/ce/service';
import { decodeEvidenceObject } from '../../../terraform/src/evidence-json';
import { readOwnedInstalledInput } from '../../../terraform/src/installed-runtime';
import { monitorOriginalInputs } from '../../../terraform/src/original-input-monitor';
import type { Deployment, Executor } from '../../../terraform/src/runner';
import { createCeTerraformService } from '../../../terraform/src/service';
import { withFinalCheck } from '../../../terraform/src/session-lifetime';
import { openGcpCapturedTeardownOrigin, readGcpCapturedTeardownOrigin } from './captured-teardown-origin';
import { fingerprint } from './discovery';
import { publicTerraformContextHash } from './terraform-context';
import type { GcpTerraformTeardownRuntime } from './terraform-teardown';
import { validateIntent } from './validation';

interface GcpCapturedCleanupRuntimeOptions
  extends Omit<Parameters<typeof openGcpCapturedTeardownOrigin>[0], 'observePlatform'> {
  readonly platform: CePlatformService;
  /** Existing compiled cleanup executor; this opener grants no mutation authority. */
  readonly execute: Executor;
}

/** Compose the original source capability with normal Platform observations and
 * the shared runner. Deployment bytes are read from the original workspace;
 * creation is never prepared or replayed, and failed claims stay untouched. */
export async function openGcpCapturedCleanupRuntime(input: GcpCapturedCleanupRuntimeOptions, signal?: AbortSignal) {
  const intent = structuredClone(input.intent),
    environment = { ...input.environment };
  const source = structuredClone(input.source),
    reference = structuredClone(input.reference),
    reviewReference = input.reviewReference && structuredClone(input.reviewReference);
  const api = input.api,
    platform = input.platform,
    execute = input.execute,
    assertIndependentClosure = input.assertIndependentClosure.bind(input);
  validateIntent(intent);
  if (intent.engine !== 'terraform' || intent.schemaVersion !== 2 || typeof execute !== 'function')
    throw new Error('Original captured GCP cleanup scope and compiled executor required');
  const owner: CeOwner = {
    provider: 'gcp',
    engine: 'terraform',
    account: intent.project,
    region: intent.region,
    deploymentId: intent.deploymentName,
  };
  const directory = input.executionDirectory;
  const contextHash = publicTerraformContextHash(intent, environment.XCSH_API_URL);
  if (!platform.gcpObservations) throw new Error('Normal Platform cleanup observations unavailable');
  const store = await platform.storage(owner);
  const checkStore = async () => {
    const current = await platform.storage(owner);
    if (
      store.directory !== dirname(directory) ||
      fingerprint(store.owner) !== fingerprint(owner) ||
      current.directory !== dirname(directory) ||
      fingerprint(current.owner) !== fingerprint(owner)
    )
      throw new Error('Original captured cleanup Platform storage differs');
    await current.verify();
    await store.verify();
  };
  await checkStore();
  const observations = await platform.gcpObservations(owner, intent.platformContext, signal);
  if (!observations.teardown || !observations.terraformEnvironment)
    throw new Error('Normal Platform cleanup observations and private environment unavailable');
  const readEnvironment = observations.terraformEnvironment.bind(observations),
    teardown = observations.teardown.bind(observations);
  const inputs = Object.fromEntries(
    await Promise.all(
      [
        join(directory, 'deployment.json'),
        join(directory, 'main.tf.json'),
        join(directory, '.terraform.lock.hcl'),
        join(store.directory, 'gcp-terraform-input-identity.json'),
      ].map(async (path, index) => [String(index), (await readOwnedInstalledInput(path)).binding]),
    ),
  );
  const monitor = await monitorOriginalInputs(inputs);
  let retired = false,
    origin: Awaited<ReturnType<typeof openGcpCapturedTeardownOrigin>> | undefined;
  const close = () => {
    retired = true;
    origin?.close();
    monitor.close();
  };
  const guard = async () => {
    if (retired) throw new Error('Original captured cleanup runtime is retired');
    signal?.throwIfAborted();
    await checkStore();
    await monitor.assertOriginal();
    const selected = await readEnvironment();
    if (publicTerraformContextHash(intent, selected.XCSH_API_URL) !== contextHash || !selected.XCSH_API_TOKEN)
      throw new Error('Original captured cleanup selected context differs');
    Object.assign(environment, selected);
    await monitor.assertOriginal();
    if (retired) throw new Error('Original captured cleanup runtime retired during inspection');
  };
  try {
    await guard();
    const saved = (await store.read('gcp-terraform-input-identity.json')) as {
      intent?: unknown;
      intentFingerprint?: string;
      platformContext?: string;
    };
    if (
      fingerprint(saved.intent) !== fingerprint(intent) ||
      saved.intentFingerprint !== fingerprint(intent) ||
      saved.platformContext !== intent.platformContext
    )
      throw new Error('Original captured cleanup persisted intent differs');
    const manifest = decodeEvidenceObject((await readOwnedInstalledInput(join(directory, 'deployment.json'))).bytes);
    const configuration = (await readOwnedInstalledInput(join(directory, 'main.tf.json'))).bytes,
      providerLock = (await readOwnedInstalledInput(join(directory, '.terraform.lock.hcl'))).bytes;
    const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
    if (
      manifest.stage !== undefined ||
      manifest.configurationSha256 !== hash(configuration) ||
      manifest.providerLockSha256 !== hash(providerLock)
    )
      throw new Error('Original captured cleanup deployment bytes differ');
    const { configurationSha256: _configuration, providerLockSha256: _lock, ...fields } = manifest;
    const deployment = {
      ...fields,
      configuration: configuration.toString('utf8'),
      providerLock: providerLock.toString('utf8'),
    } as unknown as Deployment;
    const observePlatform: GcpTerraformTeardownRuntime['observePlatform'] = async (...args) => {
      await guard();
      return withFinalCheck(() => teardown(...args), guard, 'Original Platform cleanup observation changed');
    };
    origin = await openGcpCapturedTeardownOrigin(
      {
        ...input,
        api,
        intent,
        environment,
        source,
        reference,
        reviewReference,
        observePlatform,
        assertIndependentClosure: async (readers) => {
          await guard();
          await assertIndependentClosure(readers);
          await guard();
        },
      },
      signal,
    );
    const original = origin;
    const verify = async () => {
      await guard();
      await readGcpCapturedTeardownOrigin(original, intent);
      await guard();
    };
    const service = createCeTerraformService(async () => platform, {
      captureCleanup: { ...original.recovery, assertIndependentClosure: verify },
      execute: async (invocation) => {
        await verify();
        if (
          invocation.env.XCSH_API_URL !== undefined &&
          publicTerraformContextHash(intent, invocation.env.XCSH_API_URL) !== contextHash
        )
          throw new Error('Original captured cleanup invocation context differs');
        return withFinalCheck(
          () =>
            execute({
              ...invocation,
              env: {
                ...invocation.env,
                XCSH_API_URL: environment.XCSH_API_URL,
                XCSH_API_TOKEN: environment.XCSH_API_TOKEN,
              },
            }),
          verify,
          'Original captured cleanup execution or binding failed',
        );
      },
    });
    const session = await service.open(owner, deployment, true);
    await verify();
    const runtime: GcpTerraformTeardownRuntime = Object.freeze({
      store,
      session,
      environment,
      api,
      observePlatform,
      capturedTeardownOrigin: original,
    });
    return Object.freeze({ runtime, close });
  } catch (error) {
    close();
    throw error;
  }
}
