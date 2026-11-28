import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import type { CeOwner } from '../../../platform/src/ce/runtime';
import type { CePlatformService } from '../../../platform/src/ce/service';
import { decodeEvidenceObject } from '../../../terraform/src/evidence-json';
import { readOwnedInstalledInput } from '../../../terraform/src/installed-runtime';
import { monitorOriginalInputs } from '../../../terraform/src/original-input-monitor';
import type { Deployment, Executor, PlanReceipt } from '../../../terraform/src/runner';
import { createCeTerraformService, type TerraformSession } from '../../../terraform/src/service';
import { withFinalCheck } from '../../../terraform/src/session-lifetime';
import type { GcpAppliedSourceCleanupResumeInput } from './applied-source-cleanup-durable';
import {
  readGcpAppliedSourceTeardownOrigin,
  resumeGcpAppliedSourceTeardownOrigin,
} from './applied-source-teardown-origin';
import { fingerprint } from './discovery';
import { publicTerraformContextHash } from './terraform-context';
import type { GcpTerraformTeardownRuntime } from './terraform-teardown';
import { validateIntent } from './validation';

interface GcpAppliedCleanupRuntimeOptions extends Omit<GcpAppliedSourceCleanupResumeInput, 'observePlatform'> {
  readonly platform: CePlatformService;
  /** Existing compiled original cleanup executor; the opener grants no delete authority. */
  readonly execute: Executor;
}

/** Resume successful-source cleanup through normal Platform observations and
 * the shared runner. Create preparation is never invoked, and failed-capture
 * flags or substitute deployment journals are never created. */
export async function openGcpAppliedCleanupRuntime(input: GcpAppliedCleanupRuntimeOptions, signal?: AbortSignal) {
  const intent = structuredClone(input.intent),
    environment = { ...input.environment };
  const reference = structuredClone(input.reference),
    reviewReference = input.reviewReference && structuredClone(input.reviewReference);
  const api = input.api,
    platform = input.platform,
    execute = input.execute;
  const assertIndependentClosure = input.assertIndependentClosure.bind(input);
  validateIntent(intent);
  if (intent.engine !== 'terraform' || intent.schemaVersion !== 2 || typeof execute !== 'function')
    throw new Error('Original applied GCP cleanup scope and compiled executor required');
  const owner: CeOwner = {
    provider: 'gcp',
    engine: 'terraform',
    account: intent.project,
    region: intent.region,
    deploymentId: intent.deploymentName,
  };
  const directory = input.executionDirectory,
    contextHash = publicTerraformContextHash(intent, environment.XCSH_API_URL);
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
      throw new Error('Original applied cleanup Platform storage differs');
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
    origin: Awaited<ReturnType<typeof resumeGcpAppliedSourceTeardownOrigin>> | undefined;
  let refusal: unknown;
  const close = () => {
    retired = true;
    origin?.close();
    monitor.close();
  };
  const guard = async () => {
    if (retired) throw new Error('Original applied cleanup runtime is retired');
    if (refusal) throw refusal;
    try {
      signal?.throwIfAborted();
      await checkStore();
      await monitor.assertOriginal();
      const selected = await readEnvironment();
      if (publicTerraformContextHash(intent, selected.XCSH_API_URL) !== contextHash || !selected.XCSH_API_TOKEN)
        throw new Error('Original applied cleanup selected context differs');
      Object.assign(environment, selected);
      await checkStore();
      await monitor.assertOriginal();
      if (retired) throw new Error('Original applied cleanup runtime retired during inspection');
      signal?.throwIfAborted();
    } catch (error) {
      refusal = error;
      throw error;
    }
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
      throw new Error('Original applied cleanup persisted intent differs');
    const manifest = decodeEvidenceObject((await readOwnedInstalledInput(join(directory, 'deployment.json'))).bytes);
    const configuration = (await readOwnedInstalledInput(join(directory, 'main.tf.json'))).bytes,
      providerLock = (await readOwnedInstalledInput(join(directory, '.terraform.lock.hcl'))).bytes;
    const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
    if (
      manifest.stage !== undefined ||
      manifest.configurationSha256 !== hash(configuration) ||
      manifest.providerLockSha256 !== hash(providerLock)
    )
      throw new Error('Original applied cleanup deployment bytes differ');
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
    origin = await resumeGcpAppliedSourceTeardownOrigin(
      {
        intent,
        executionDirectory: directory,
        reference,
        reviewReference,
        environment,
        api,
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
      await readGcpAppliedSourceTeardownOrigin(original.origin, intent);
      await guard();
    };
    const service = createCeTerraformService(async () => platform, {
      assertApplyReady: verify,
      execute: async (invocation) => {
        await verify();
        if (
          invocation.env.XCSH_API_URL !== undefined &&
          publicTerraformContextHash(intent, invocation.env.XCSH_API_URL) !== contextHash
        )
          throw new Error('Original applied cleanup invocation context differs');
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
          'Original applied cleanup execution or binding failed',
        );
      },
    });
    const session = await service.open(owner, deployment, true);
    // The shared service checks the owner on each operation. Successful-source
    // provenance additionally requires closure and selected-context checks for
    // every read, including operations that do not invoke the executor.
    const guardOperation =
      <A extends unknown[], T>(name: keyof TerraformSession, operation: (...args: A) => Promise<T>) =>
      async (...args: A): Promise<T> => {
        await verify();
        if (['plan', 'planAction', 'reviseConfiguration'].includes(name))
          throw new Error('Original applied cleanup cannot prepare create or lifecycle actions');
        if (name === 'apply' || name === 'reconcileApplyFromEvidence') {
          const receipt = args[0] as PlanReceipt;
          if (receipt?.operation !== 'destroy' || original.mode === 'completed-readonly')
            throw new Error('Original applied cleanup cannot replay creation or completed destruction');
        }
        return withFinalCheck(() => operation(...args), verify, 'Original applied cleanup session or binding failed');
      };
    const guardOptional = <A extends unknown[], T>(
      name: keyof TerraformSession,
      operation: ((...args: A) => Promise<T>) | undefined,
    ) => operation && guardOperation(name, operation);
    const guardedSession: TerraformSession = {
      readConfiguration: guardOperation('readConfiguration', session.readConfiguration),
      readPlannedResourceFields: guardOperation('readPlannedResourceFields', session.readPlannedResourceFields),
      readPlannedResourceIds: guardOperation('readPlannedResourceIds', session.readPlannedResourceIds),
      readOutputs: guardOperation('readOutputs', session.readOutputs),
      reviseConfiguration: guardOperation('reviseConfiguration', session.reviseConfiguration),
      reconcileApplyFromEvidence: guardOperation('reconcileApplyFromEvidence', session.reconcileApplyFromEvidence),
      planDestroy: guardOperation('planDestroy', session.planDestroy),
      planAction: guardOperation('planAction', session.planAction),
      plan: guardOperation('plan', session.plan),
      apply: guardOperation('apply', session.apply),
      assertApplyReady: guardOptional('assertApplyReady', session.assertApplyReady),
      googleAdcEnvironment: guardOptional('googleAdcEnvironment', session.googleAdcEnvironment),
      closeGoogleAdc: guardOptional('closeGoogleAdc', session.closeGoogleAdc),
      readStateIdentity: guardOptional('readStateIdentity', session.readStateIdentity),
      assertApplied: guardOptional('assertApplied', session.assertApplied),
      readConfigurationSha256: guardOptional('readConfigurationSha256', session.readConfigurationSha256),
      readAppliedResourceFields: guardOptional('readAppliedResourceFields', session.readAppliedResourceFields),
      readApplyAttemptResourceFields: guardOptional(
        'readApplyAttemptResourceFields',
        session.readApplyAttemptResourceFields,
      ),
      readNoChangeResourceFields: guardOptional('readNoChangeResourceFields', session.readNoChangeResourceFields),
      readPlannedStateResourceFields: guardOptional(
        'readPlannedStateResourceFields',
        session.readPlannedStateResourceFields,
      ),
      readCurrentResourcePlanReceipt: guardOptional(
        'readCurrentResourcePlanReceipt',
        session.readCurrentResourcePlanReceipt,
      ),
      readApplyCheckpoint: guardOptional('readApplyCheckpoint', session.readApplyCheckpoint),
    };
    await verify();
    const runtime: GcpTerraformTeardownRuntime = Object.freeze({
      store,
      session: Object.freeze(guardedSession),
      environment,
      api,
      observePlatform,
      appliedSourceTeardownOrigin: original.origin,
    });
    return Object.freeze({
      runtime,
      mode: original.mode,
      requiresNewReviewedPlan: original.requiresNewReviewedPlan,
      absent: original.absent,
      remaining: original.remaining,
      close,
    });
  } catch (error) {
    close();
    throw error;
  }
}
