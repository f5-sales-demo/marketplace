import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { fingerprint } from '../../gcloud/src/ce/discovery';
import {
  publicTerraformCloudScope,
  publicTerraformPlatformScope,
} from '../../gcloud/src/ce/terraform-public-ownership';
import type { GcpCeIntent } from '../../gcloud/src/ce/types';
import type { CeDeploymentStore } from '../../platform/src/ce/deployment-store';
import { acknowledgeOriginalApplyGroupClosure, assertOriginalApplyCallback } from './installed-apply-controller';
import type { InstalledCaptureContext } from './installed-capture-context';
import { type InstalledGcpCapture, readOwnedInstalledInput } from './installed-runtime';
import { assertSameOriginalInput, type OriginalInputBinding } from './original-input-monitor';
import {
  readOriginalCompletedOutputInputs,
  readOriginalExecutionChunk,
  readOriginalExecutionPrefix,
} from './original-output-stream';
import { bindOriginalTerraformPlanInputs } from './original-plan-inputs';
import { assertFinalReaderReserve, inspectFinalReaderReserve } from './reader-final-reserve';
import { assertOriginalTerraformPlanProjection, type OriginalTerraformPlanProjection } from './runner';
import type { ExecutionCaptureAdmission } from './signal-free-executor';

/** Capture for a source-issued destroy plan. The caller still proves live ownership,
 * reviewed authorization, applied state and independent absences. Capture never
 * opens bootstrap, SSH, registration, health or creation witnesses. */
export async function openInstalledDeleteCapture(input: {
  context: InstalledCaptureContext;
  store: CeDeploymentStore;
  plan: OriginalTerraformPlanProjection;
  intent: GcpCeIntent;
}): Promise<InstalledGcpCapture> {
  const { context, store, plan, intent } = input;
  await assertOriginalTerraformPlanProjection(plan);
  await context.assertInputs();
  await store.verify();
  if (
    (await context.readOriginalPlanSource?.()) !== plan ||
    plan.directory !== context.executionDirectory ||
    plan.scope.cloud !== 'gcp' ||
    context.owner.provider !== 'gcp' ||
    context.owner.engine !== 'terraform' ||
    plan.scope.account !== context.owner.account ||
    plan.scope.region !== context.owner.region ||
    plan.receipt.deploymentId !== context.owner.deploymentId ||
    (['provider', 'engine', 'account', 'region', 'deploymentId'] as const).some(
      (key) => store.owner[key] !== context.owner[key],
    ) ||
    plan.receipt.configurationSha256 !== context.inputs['workspace:main.tf.json']?.sha256 ||
    plan.receipt.providerLockSha256 !== context.inputs['workspace:.terraform.lock.hcl']?.sha256
  )
    throw new Error('Original delete capture owning context differs');
  const admitted = context.inputs['workspace:gcp-terraform-input-identity.json'];
  if (!admitted || admitted.path !== join(store.directory, 'gcp-terraform-input-identity.json'))
    throw new Error('Original delete capture intent input required');
  const original = await readOwnedInstalledInput(admitted.path);
  assertSameOriginalInput(admitted, original.binding);
  const saved = JSON.parse(original.bytes.toString()) as {
    intent: GcpCeIntent;
    intentFingerprint: string;
    platformContext: string;
  };
  if (
    fingerprint(intent) !== saved.intentFingerprint ||
    fingerprint(saved.intent) !== saved.intentFingerprint ||
    saved.platformContext !== intent.platformContext
  )
    throw new Error('Original delete capture admitted intent differs');
  if (plan.receipt.operation !== 'destroy' || plan.receipt.actionInvocations?.length)
    throw new Error('Original delete-only resource plan required');
  const expected = new Map<string, { type: string; fields: Record<string, string> }>();
  for (const resource of publicTerraformCloudScope(intent)) {
    const parts = resource.selfLink.split('/');
    const name = parts.at(-1);
    if (!name) throw new Error('Declared original cleanup name required');
    const type = `google_compute_${resource.kind}`;
    const fields: Record<string, string> = { name, project: intent.project };
    if (parts.includes('zones')) fields.zone = parts[parts.indexOf('zones') + 1];
    if (parts.includes('regions')) fields.region = parts[parts.indexOf('regions') + 1];
    expected.set(`${type}.${name.replaceAll('-', '_')}`, { type, fields });
  }
  for (const resource of publicTerraformPlatformScope(intent)) {
    const token = 'tokenName' in resource ? resource.tokenName : undefined;
    const fields: Record<string, string> = { name: token ?? resource.siteName, namespace: 'system' };
    if (token) fields.site_name = resource.siteName;
    expected.set(resource.address, { type: token ? 'xcsh_token' : 'xcsh_securemesh_site_v2', fields });
  }
  for (const row of plan.resources) {
    if (row.mode === 'data') {
      if (!['read', 'no-op'].includes(row.actions.join(','))) throw new Error('Delete-only data mutation refused');
      continue;
    }
    const declared = expected.get(row.address);
    if (!declared || declared.type !== row.type || row.actions.join(',') !== 'delete')
      throw new Error('Original delete-only declared resource required');
    for (const [name, expectedValue] of Object.entries(declared.fields)) {
      const field = row.fields[name];
      if (field?.status !== 'known' || field.value !== expectedValue)
        throw new Error('Original cleanup resource identity differs');
    }
    const id = row.fields.id;
    if (id?.status !== 'known' || typeof id.value !== 'string' || !id.value)
      throw new Error('Original cleanup resource ID required');
  }
  const assertDurablePlanInputs = await bindOriginalTerraformPlanInputs(context, plan);
  const budget = Object.freeze({ ...context.budget });
  let prepared = false,
    started = false,
    finalStarted = false,
    closed = false;
  let actor: ExecutionCaptureAdmission | undefined;
  let finalComplete = false;
  let completedOutputs: Readonly<Record<string, OriginalInputBinding>> | undefined;
  let failure: unknown;
  let closure: Promise<void> | undefined;
  const inputs = async (requireLivePlan = true) => {
    await context.assertInputs();
    if (requireLivePlan) await assertOriginalTerraformPlanProjection(plan);
    await assertDurablePlanInputs();
    await store.verify();
    if (context.budget.start !== budget.start || context.budget.deadline !== budget.deadline)
      throw new Error('Original cleanup capture budget differs');
  };
  const persist = async (phase: string, extra: Record<string, unknown> = {}) => {
    await store.verify();
    await store.write(`gcp-delete-capture-${randomUUID()}.json`, {
      schemaVersion: 1,
      kind: 'original-installed-delete-capture-event',
      phase,
      owner: context.owner,
      planSha256: plan.receipt.planSha256,
      originalBudget: budget,
      executor: actor?.identity,
      ...extra,
      executionAuthorized: false,
      independentAbsenceQualified: false,
      guestAcceptanceComplete: false,
    });
  };
  return {
    async prepare(original) {
      if (original !== context || started || finalStarted || closed || failure)
        throw new Error('Original delete capture preparation context or lifecycle differs');
      await inputs();
      await context.assertWithinDeadline();
      await persist('prepared', { resources: plan.resources });
      prepared = true;
    },
    async start(admission, callback) {
      if (!callback || callback.original !== context || callback.phase !== 'before' || callback.execution !== admission)
        throw new Error('Original delete capture before callback required');
      await assertOriginalApplyCallback(callback);
      if (!prepared || started || finalStarted || closed || failure)
        throw new Error('Original delete capture startup already claimed or unprepared');
      started = true;
      actor = admission;
      try {
        await inputs();
        const prefix = await readOriginalExecutionPrefix(admission.output);
        if (
          prefix.directory !== context.executionDirectory ||
          (['pid', 'group', 'start', 'boot'] as const).some(
            (key) => prefix.identity[key] !== admission.identity[key],
          ) ||
          prefix.stdout.bytes !== 0 ||
          prefix.stderr.bytes !== 0
        )
          throw new Error('Original unconsumed delete output issuer required');
        await assertOriginalApplyCallback(callback);
        await persist('started');
      } catch (error) {
        failure = error;
        await persist('startup-refused', { errorType: error instanceof Error ? error.name : typeof error });
        throw error;
      }
    },
    async assertOriginal() {
      if (closed || finalStarted || failure) throw new Error('Original delete capture lifetime retired or refused');
      await inputs();
      await context.assertWithinDeadline();
    },
    async finalCapture(capture, reserve, callback) {
      if (
        !callback ||
        !reserve ||
        callback.reserve !== reserve ||
        callback.original !== context ||
        callback.phase !== 'after' ||
        finalStarted ||
        closed ||
        !actor
      )
        throw new Error('Original reserved delete final callback required');
      await assertOriginalApplyCallback(callback);
      const timing = inspectFinalReaderReserve(reserve);
      if (
        !capture.identity ||
        capture.signalsSent !== false ||
        capture.originalDeadlineMs !== budget.deadline ||
        capture.finalStartedMs !== timing.finalStartedMs ||
        capture.finalDeadlineMs !== timing.finalDeadlineMs ||
        (['pid', 'group', 'start', 'boot'] as const).some((key) => capture.identity?.[key] !== actor?.identity[key])
      )
        throw new Error('Original delete final actor or reserve differs');
      finalStarted = true;
      try {
        await inputs();
        await assertFinalReaderReserve(reserve);
        for (const channel of ['stdout', 'stderr'] as const) {
          for (;;) {
            const chunk = await actor.output.read(channel);
            if (!chunk) break;
            await assertFinalReaderReserve(reserve);
            const original = readOriginalExecutionChunk(actor.output, chunk, channel);
            if (
              original.directory !== context.executionDirectory ||
              (['pid', 'group', 'start', 'boot'] as const).some(
                (key) => original.identity[key] !== actor?.identity[key],
              )
            )
              throw new Error('Original delete output record identity differs');
            await persist('output', {
              channel,
              offset: original.offset,
              endOffset: original.endOffset,
              sha256: original.sha256,
              bytesBase64: original.bytes.toString('base64'),
            });
          }
        }
        const completion = await actor.output.finish();
        await acknowledgeOriginalApplyGroupClosure(callback, completion);
        completedOutputs = await readOriginalCompletedOutputInputs(actor.output, completion);
        await persist('final', {
          completion,
          submitted: capture.submitted,
          actualExitCode: capture.actualExitCode,
          finalReserve: timing,
          earlierFailureRetained: !!failure,
        });
        await inputs();
        await assertFinalReaderReserve(reserve);
        finalComplete = true;
      } catch (error) {
        failure ??= error;
        await persist('final-refused', { errorType: error instanceof Error ? error.name : typeof error });
        throw error;
      }
      if (failure) throw new Error('Original delete capture incomplete; earlier failure retained');
    },
    closeAfterExecutorExit() {
      closure ??= (async () => {
        if (started && !finalComplete) throw new Error('Original delete capture final closure unresolved');
        // The owning runner retires its live source after apply. Closure rechecks
        // the admitted original files; it never revives that retired authority.
        await inputs(false);
        if (actor) {
          if (!completedOutputs) throw new Error('Original complete delete output bindings required');
          for (const binding of Object.values(completedOutputs)) {
            const current = await readOwnedInstalledInput(binding.path);
            assertSameOriginalInput(binding, current.binding);
          }
        }
        await persist(started ? 'closed' : 'preflight-closed', { earlierFailureRetained: !!failure });
        closed = true;
        if (failure) throw new Error('Original delete capture failure remains retained');
      })();
      return closure;
    },
  };
}
