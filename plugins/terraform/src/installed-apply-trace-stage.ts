import { randomUUID } from 'node:crypto';
import { fingerprint } from '../../gcloud/src/ce/discovery';
import { assertGcpTerraformRequestReason } from '../../gcloud/src/ce/request-reason';
import type { GcpCeIntent } from '../../gcloud/src/ce/types';
import type { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import { decodeEvidenceObject } from './evidence-json';
import {
  GoogleHttpRpcTraceParser,
  type OriginalGoogleHttpResponseObservation,
  type OriginalGoogleHttpRpcBodies,
  readOriginalGoogleHttpResponseSource,
} from './gcp-http-rpc-trace';
import { GoogleProviderLifecycleParser, type GoogleProviderRpcCandidate } from './google-provider-lifecycle';
import {
  acknowledgeOriginalApplyGroupClosure,
  assertOriginalApplyCallback,
  type OriginalApplyCallbackContext,
} from './installed-apply-controller';
import type { InstalledCaptureContext } from './installed-capture-context';
import { type InstalledGcpCapture, readOwnedInstalledInput } from './installed-runtime';
import { type InstalledGcpVersionBinding, resolveInstalledGcpVersionProfile } from './installed-version-profile';
import { assertSameOriginalInput, type OriginalInputBinding } from './original-input-monitor';
import {
  type OriginalOutputCompletion,
  readOriginalCompletedOutputInputs,
  readOriginalExecutionPrefix,
} from './original-output-stream';
import { bindOriginalTerraformPlanInputs } from './original-plan-inputs';
import { assertFinalReaderReserve, inspectFinalReaderReserve } from './reader-final-reserve';
import { assertOriginalTerraformPlanProjection, type OriginalTerraformPlanProjection } from './runner';
import type { ExecutionCaptureAdmission } from './signal-free-executor';
import { type TerraformApplyHookCandidate, TerraformApplyHookParser } from './terraform-apply-hooks';

export interface InstalledApplyTraceTarget {
  readonly address: string;
  readonly name: string;
  readonly project: string;
  readonly zone: string;
}
export interface InstalledApplyTraceDispatch {
  readonly target: InstalledApplyTraceTarget;
  readonly response: OriginalGoogleHttpResponseObservation;
  readonly originalPlan: OriginalTerraformPlanProjection;
  readonly binding: InstalledGcpVersionBinding;
  readonly callback: OriginalApplyCallbackContext;
}
export interface InstalledApplyTraceInput {
  readonly context: InstalledCaptureContext;
  readonly store: CeDeploymentStore;
  /** Compiled provider route; independent process/window admission remains required. */
  readonly providerPath: string;
  readonly onResponse: (source: InstalledApplyTraceDispatch) => Promise<void>;
  /** Compiled observation scheduler, including the existing 45s guest rounds.
   * Source checks settle here; this callback must not consume apply output. */
  readonly onObservation?: (
    source: Readonly<{
      callback: OriginalApplyCallbackContext;
      originalPlan: OriginalTerraformPlanProjection;
      binding: InstalledGcpVersionBinding;
      responses: readonly OriginalGoogleHttpResponseObservation[];
    }>,
  ) => Promise<void>;
}

/** One original descriptor reader fans out identical chunks to all parsers.
 * Early responses are delivered before advancing their source prefix. The
 * enclosing factory must join actual provider windows, inventory, VM and guest
 * evidence; a complete transcript alone grants no execution authority.
 */
export async function openInstalledApplyTraceStage(input: InstalledApplyTraceInput) {
  const { context, store, providerPath, onResponse, onObservation } = input;
  const directory = store.directory;
  const plan = await context.readOriginalPlanSource?.();
  if (!plan) throw new Error('Original apply trace owning plan required');
  await assertOriginalTerraformPlanProjection(plan);
  const binding = Object.freeze({
    terraformVersion: plan.terraformVersion,
    providerLockSha256: plan.receipt.providerLockSha256,
  });
  const profile = resolveInstalledGcpVersionProfile(binding);
  const configInput = context.inputs['workspace:main.tf.json'];
  if (
    !configInput ||
    plan.directory !== context.executionDirectory ||
    plan.scope.cloud !== 'gcp' ||
    plan.scope.account !== context.owner.account ||
    plan.scope.region !== context.owner.region ||
    configInput.sha256 !== plan.receipt.configurationSha256
  )
    throw new Error('Original apply trace owning configuration differs');
  const originalConfig = await readOwnedInstalledInput(configInput.path);
  assertSameOriginalInput(configInput, originalConfig.binding);
  const configuration = originalConfig.bytes.toString();
  const config = decodeEvidenceObject(originalConfig.bytes);
  await store.verify();
  const saved = (await store.read('gcp-terraform-input-identity.json')) as {
    intent: GcpCeIntent;
    intentFingerprint: string;
    requestReasonFingerprint: string;
  };
  const provider = (config.provider as { google?: Array<{ request_reason?: unknown }> } | undefined)?.google;
  const reason = Object.freeze({
    schemaVersion: 1 as const,
    scope: 'gcp-terraform-deployment' as const,
    intentFingerprint: fingerprint(saved.intent),
    reason: provider?.[0]?.request_reason,
  });
  if (
    !Array.isArray(provider) ||
    provider.length !== 1 ||
    saved.intentFingerprint !== fingerprint(saved.intent) ||
    saved.intent.project !== context.owner.account ||
    saved.intent.region !== context.owner.region ||
    saved.intent.deploymentName !== context.owner.deploymentId
  )
    throw new Error('One original Google request reason required');
  assertGcpTerraformRequestReason(reason, saved.intent, profile.googleVersion);
  if (fingerprint(reason) !== saved.requestReasonFingerprint)
    throw new Error('Original saved request reason fingerprint differs');
  const savedHash = fingerprint(saved);
  const budget = Object.freeze({ ...context.budget });
  const targets = Object.freeze(
    plan.resources
      .filter((resource) => resource.type === 'google_compute_instance')
      .map((resource) => {
        if (resource.mode !== 'managed' || resource.actions.join(',') !== 'create')
          throw new Error('Original trace supports reviewed initial instance creates only');
        const known = (key: string) => {
          const field = resource.fields[key];
          if (field?.status !== 'known' || typeof field.value !== 'string')
            throw new Error('Original known trace target required');
          return field.value;
        };
        const target = Object.freeze({
          address: resource.address,
          name: known('name'),
          project: known('project'),
          zone: known('zone'),
        });
        if (
          !/^[a-z][a-z0-9-]{0,62}$/.test(target.name) ||
          target.project !== context.owner.account ||
          !target.zone.startsWith(`${context.owner.region}-`)
        )
          throw new Error('Original trace target scope differs');
        return target;
      }),
  );
  if (!targets.length || new Set(targets.map((target) => `${target.zone}/${target.name}`)).size !== targets.length)
    throw new Error('Unique original trace targets required');
  const parsers = targets.map((target) => ({
    target,
    parser: new GoogleHttpRpcTraceParser(
      {
        rpc: 'ApplyResourceChange',
        resourceType: 'google_compute_instance',
        method: 'POST',
        url: `https://compute.googleapis.com/compute/v1/projects/${target.project}/zones/${target.zone}/instances?alt=json`,
        requestReason: reason.reason,
        instanceName: target.name,
        planSha256: plan.receipt.planSha256,
      },
      binding,
    ),
  }));
  const ui = new TerraformApplyHookParser(plan.receipt, binding, configuration);
  const lifecycle = new GoogleProviderLifecycleParser({ providerPath, planSha256: plan.receipt.planSha256 }, binding);
  const hooks: TerraformApplyHookCandidate[] = [],
    rpcs: GoogleProviderRpcCandidate[] = [];
  const responses: OriginalGoogleHttpResponseObservation[] = [],
    bodies: OriginalGoogleHttpRpcBodies[] = [];
  const responded = new Set<string>();
  let prepared = false,
    started = false,
    finalStarted = false,
    retired = false,
    parentClosed = false;
  let finalUnresolved = false;
  let observing = false;
  let before: OriginalApplyCallbackContext | undefined, after: OriginalApplyCallbackContext | undefined;
  let actor: ExecutionCaptureAdmission | undefined;
  let pending: Promise<void> | undefined, closure: Promise<void> | undefined;
  let failure: unknown;
  let transcript:
    | Readonly<{
        originalPlan: OriginalTerraformPlanProjection;
        binding: InstalledGcpVersionBinding;
        configuration: string;
        providerPath: string;
        targets: readonly InstalledApplyTraceTarget[];
        hooks: readonly TerraformApplyHookCandidate[];
        rpcs: readonly GoogleProviderRpcCandidate[];
        responses: readonly OriginalGoogleHttpResponseObservation[];
        bodies: readonly OriginalGoogleHttpRpcBodies[];
        completion: OriginalOutputCompletion;
        executionQualified: false;
      }>
    | undefined;
  const assertDurablePlanInputs = await bindOriginalTerraformPlanInputs(context, plan);
  let completedOutputInputs: Readonly<Record<string, OriginalInputBinding>> | undefined;
  const inputs = async (requireLivePlan = true) => {
    await context.assertInputs();
    if (requireLivePlan) await assertOriginalTerraformPlanProjection(plan);
    await assertDurablePlanInputs();
    await store.verify();
    if (
      store.directory !== directory ||
      fingerprint(store.owner) !== fingerprint(context.owner) ||
      fingerprint(await store.read('gcp-terraform-input-identity.json')) !== savedHash ||
      context.budget.start !== budget.start ||
      context.budget.deadline !== budget.deadline
    )
      throw new Error('Original apply trace inputs changed');
    assertSameOriginalInput(configInput, (await readOwnedInstalledInput(configInput.path)).binding);
  };
  const retain = async (phase: string, value: Record<string, unknown> = {}) => {
    await store.verify();
    await store.write(`gcp-apply-trace-${randomUUID()}.json`, {
      schemaVersion: 1,
      kind: 'original-installed-apply-trace-event',
      phase,
      owner: context.owner,
      originalBudget: budget,
      planSha256: plan.receipt.planSha256,
      executor: actor?.identity,
      ...value,
      executionQualified: false,
    });
  };
  const captureFailure = async (phase: string, error: unknown) => {
    failure ??= error;
    await retain(phase, {
      errorType: error instanceof Error ? error.name : typeof error,
      ...(error instanceof Error ? { errorMessage: error.message } : {}),
      responses: responses.length,
      hooks: hooks.length,
      rpcs: rpcs.length,
    });
  };
  // Final capture stops new work, then drains the current callback. Successful
  // callback settlement is checked against the actual final reserve; this does
  // not make its retired before reference available for any later source read.
  const assertSettlement = async () => {
    if (retired || finalUnresolved) throw new Error('Original trace settlement retired or unresolved');
    await inputs();
    if (finalStarted) {
      if (!after?.reserve) throw new Error('Original trace final settlement callback required');
      await assertOriginalApplyCallback(after);
      await assertFinalReaderReserve(after.reserve);
    } else await context.assertWithinDeadline();
    if (retired || finalUnresolved) throw new Error('Original trace settlement retired or unresolved');
  };
  const dispatch = async (selected: (typeof parsers)[number], callback: OriginalApplyCallbackContext) => {
    for (const response of selected.parser.takeOriginalResponses()) {
      if (responded.has(selected.target.address)) throw new Error('Original insert response delivery was replayed');
      responded.add(selected.target.address);
      responses.push(response);
      // Verify/capture this original prefix before the sole reader advances again.
      await readOriginalGoogleHttpResponseSource(response);
      await retain('response', { target: selected.target, response });
      if (!finalStarted && !failure) {
        try {
          await onResponse(Object.freeze({ target: selected.target, response, originalPlan: plan, binding, callback }));
          await assertSettlement();
        } catch (error) {
          await captureFailure('delivery-refused', error);
        }
        if (retired || finalUnresolved) throw new Error('Original trace capture retired with unresolved delivery');
      }
    }
  };
  const readRound = async (callback: OriginalApplyCallbackContext) => {
    if (!actor) throw new Error('Original output actor required');
    let read = false;
    for (const channel of ['stdout', 'stderr'] as const) {
      const chunk = await actor.output.read(channel);
      if (!chunk) continue;
      read = true;
      if (channel === 'stdout') hooks.push(...ui.pushOriginal(actor.output, chunk));
      else {
        rpcs.push(...lifecycle.pushOriginal(actor.output, chunk));
        for (const selected of parsers) {
          for (const candidate of selected.parser.pushOriginal(actor.output, chunk))
            bodies.push(selected.parser.consumeBodies(candidate));
        }
        for (const selected of parsers) await dispatch(selected, callback);
      }
    }
    return read;
  };
  const observe = async (callback: OriginalApplyCallbackContext) => {
    if (!onObservation || failure || finalStarted || retired) return;
    if (!actor) throw new Error('Original observation actor unavailable');
    observing = true;
    try {
      const prefix = await readOriginalExecutionPrefix(actor.output);
      await onObservation(
        Object.freeze({ callback, originalPlan: plan, binding, responses: Object.freeze([...responses]) }),
      );
      if (retired || finalUnresolved) throw new Error('Original observation retired before settlement');
      const current = await readOriginalExecutionPrefix(actor.output);
      for (const channel of ['stdout', 'stderr'] as const)
        if (current[channel].bytes !== prefix[channel].bytes || current[channel].sha256 !== prefix[channel].sha256)
          throw new Error('Original observation consumed the sole reader output');
      await assertSettlement();
    } catch (error) {
      await captureFailure('observation-refused', error);
      throw error;
    } finally {
      observing = false;
    }
  };
  const worker: InstalledGcpCapture = {
    async prepare(original) {
      if (original !== context || started || finalStarted || retired)
        throw new Error('Original trace preparation context differs');
      await inputs();
      await context.assertWithinDeadline();
      prepared = true;
    },
    async start(admission, callback) {
      if (callback?.phase !== 'before' || callback.original !== context || admission !== callback.execution)
        throw new Error('Original trace before callback and exact admission required');
      await assertOriginalApplyCallback(callback);
      if (!prepared || started || finalStarted || retired)
        throw new Error('Original trace startup already claimed or unprepared');
      // Claim before any awaited descriptor verification. A concurrent caller
      // must never enter the original output reader's exclusive operation.
      started = true;
      actor = admission;
      before = callback;
      try {
        await inputs();
        const prefix = await readOriginalExecutionPrefix(admission.output);
        if (
          prefix.directory !== context.executionDirectory ||
          prefix.stdout.bytes !== 0 ||
          prefix.stderr.bytes !== 0 ||
          (['pid', 'group', 'start', 'boot'] as const).some((key) => prefix.identity[key] !== admission.identity[key])
        )
          throw new Error('Original trace needs the same unconsumed output issuer');
        await assertOriginalApplyCallback(callback);
        if (finalStarted || retired) throw new Error('Original trace startup retired during verification');
        await retain('started');
        pending = (async () => {
          try {
            while (!finalStarted && !retired) {
              await inputs();
              if (finalStarted || retired) break;
              await context.assertWithinDeadline();
              if (finalStarted || retired) break;
              const read = await readRound(callback);
              await observe(callback);
              if (!read) await Bun.sleep(100);
            }
          } catch (error) {
            await captureFailure('capture-refused', error);
          }
        })();
        pending.catch((error) => {
          failure ??= error;
        });
      } catch (error) {
        await captureFailure('startup-refused', error);
        throw error;
      }
    },
    async assertOriginal() {
      if (retired || finalStarted || failure) throw new Error('Original trace retired or incomplete');
      await inputs();
      await context.assertWithinDeadline();
    },
    async finalCapture(capture, reserve, callback) {
      if (
        !callback ||
        !reserve ||
        callback.reserve !== reserve ||
        callback.phase !== 'after' ||
        callback.original !== context
      )
        throw new Error('Original trace final callback and reserve required');
      await assertOriginalApplyCallback(callback);
      if (finalStarted || retired) throw new Error('Original trace final capture already claimed');
      const timing = inspectFinalReaderReserve(reserve);
      if (
        !actor ||
        !before ||
        before.nonce !== callback.nonce ||
        callback.execution.output !== actor.output ||
        !capture.identity ||
        capture.pid !== capture.identity.pid ||
        capture.signalsSent !== false ||
        capture.originalDeadlineMs !== budget.deadline ||
        capture.finalStartedMs !== timing.finalStartedMs ||
        capture.finalDeadlineMs !== timing.finalDeadlineMs ||
        timing.originalStartMs !== budget.start ||
        timing.originalDeadlineMs !== budget.deadline ||
        (['pid', 'group', 'start', 'boot'] as const).some((key) => capture.identity?.[key] !== actor?.identity[key])
      )
        throw new Error('Original trace final actor or budget differs');
      after = callback;
      finalStarted = true;
      const failures: unknown[] = [];
      let watching = true;
      const watch = (async () => {
        while (watching) {
          await assertFinalReaderReserve(reserve);
          if (watching) await Bun.sleep(100);
        }
      })();
      try {
        await Promise.race([pending ?? Promise.resolve(), watch]);
      } catch (error) {
        finalUnresolved = true;
        await captureFailure('final-unresolved', error);
        throw new AggregateError([error], 'Original apply trace reader unresolved in final reserve');
      } finally {
        watching = false;
      }
      try {
        await inputs();
        await assertFinalReaderReserve(reserve);
        while (await readRound(callback)) {
          await assertFinalReaderReserve(reserve);
          await inputs();
        }
        const completion = await actor.output.finish();
        ui.finishOriginal(actor.output, completion);
        lifecycle.finishOriginal(actor.output, completion);
        for (const selected of parsers) selected.parser.finishOriginal(actor.output, completion);
        await acknowledgeOriginalApplyGroupClosure(callback, completion);
        completedOutputInputs = await readOriginalCompletedOutputInputs(actor.output, completion);
        parentClosed = true;
        transcript = Object.freeze({
          originalPlan: plan,
          binding,
          configuration,
          providerPath,
          targets,
          hooks: Object.freeze([...hooks]),
          rpcs: Object.freeze([...rpcs]),
          responses: Object.freeze([...responses]),
          bodies: Object.freeze([...bodies]),
          completion,
          executionQualified: false as const,
        });
        await retain('final', { hooks, rpcs, responses, bodies, completion });
        await assertFinalReaderReserve(reserve);
        await inputs();
        if (responses.length !== targets.length || bodies.length !== targets.length)
          throw new Error('Original trace insertion coverage incomplete');
      } catch (error) {
        failures.push(error);
        await captureFailure('final-refused', error);
      }
      if (failure) failures.push(failure);
      if (failures.length) throw new AggregateError(failures, 'Original apply trace capture incomplete');
    },
    closeAfterExecutorExit() {
      closure ??= (async () => {
        retired = true;
        if (!started) {
          await inputs(false);
          await retain('preflight-closed', { submitted: false });
          return;
        }
        if (!finalStarted) {
          const error = new Error('Original trace final proof required before closure');
          await captureFailure('closure-refused', error);
          throw error;
        }
        if (finalUnresolved) throw new Error('Original trace closure unresolved; original reader evidence retained');
        if (!finalStarted || !parentClosed || !transcript) throw new Error('Original trace closure incomplete');
        await pending;
        await inputs(false);
        if (!completedOutputInputs) throw new Error('Original complete trace output bindings required');
        for (const binding of Object.values(completedOutputInputs)) {
          const file = await readOwnedInstalledInput(binding.path);
          assertSameOriginalInput(binding, file.binding);
        }
        await retain('closed', { deliveryComplete: !failure });
        if (failure) throw new Error('Original trace closure incomplete; original failure retained');
      })();
      return closure;
    },
  };
  return Object.freeze({
    ...worker,
    /** Observe natural reader settlement only; this cannot clear an unresolved closure. */
    whenSettled: () => pending ?? Promise.resolve(),
    coverage: () =>
      Object.freeze({
        expected: targets.length,
        responses: responses.length,
        completed: !!transcript,
        failed: !!failure,
        observationActive: observing,
        executionQualified: false,
      }),
    async readTranscript(callback: OriginalApplyCallbackContext) {
      if (
        retired ||
        !transcript ||
        callback.phase !== 'after' ||
        callback.original !== context ||
        !before ||
        callback.nonce !== before.nonce
      )
        throw new Error('Original trace transcript unavailable or retired');
      await assertOriginalApplyCallback(callback);
      await inputs();
      if (!actor) throw new Error('Original trace transcript actor unavailable');
      const current = await actor.output.finish();
      if (
        current.stdout.sha256 !== transcript.completion.stdout.sha256 ||
        current.stderr.sha256 !== transcript.completion.stderr.sha256 ||
        current.stdout.bytes !== transcript.completion.stdout.bytes ||
        current.stderr.bytes !== transcript.completion.stderr.bytes
      )
        throw new Error('Original trace transcript descriptor bytes changed');
      return transcript;
    },
  });
}
