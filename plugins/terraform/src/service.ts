import { join } from 'node:path';
import type { CeOwner } from '../../platform/src/ce/runtime';
import type { CeEventBus, CePlatformService } from '../../platform/src/ce/service';
import { type GoogleAdcLease, openGoogleAdcSession } from './google-adc-session';
import {
  type AppliedResourceProjection,
  type ApplyAttemptResourceProjection,
  type ApplyCheckpoint,
  type CurrentResourcePlanSnapshot,
  type Deployment,
  type Executor,
  type NoChangeResourceProjection,
  type PlannedStateResourceProjection,
  type PlanReceipt,
  type TerraformActionIntent,
  TerraformRunner,
} from './runner';
import { withFinalCheck } from './session-lifetime';

export const TERRAFORM_SERVICE_CHANNEL = 'xcsh:ce-terraform:v1:service';
export interface TerraformSession {
  /** Trusted mutation prerequisites; cloud adapters call this before recording submission. Older runtimes retain their path. */
  assertApplyReady?(): Promise<void>;
  /** Present only when a trusted original-lifetime ADC policy is configured. */
  googleAdcEnvironment?(): Promise<Readonly<{ GOOGLE_APPLICATION_CREDENTIALS: string }>>;
  /** Retire new provider calls; disposal requires no in-flight call and independent original group closure. */
  closeGoogleAdc?(): Promise<void>;
  /** Optional on older installed runners; required before recording post-apply ownership. */
  readStateIdentity?(): Promise<{ sha256: string; lineage: string; serial: number }>;
  assertApplied?(receipt: PlanReceipt): Promise<void>;
  /** Current private configuration identity, used to reconcile an interrupted revision. */
  readConfigurationSha256?(): Promise<string>;
  /** Sensitive internal snapshot, bound to the caller's expected revision. */
  readConfiguration(expectedSha256: string): Promise<string>;
  /** Restricted ownership projection; explicit dotted paths must be nonsensitive. Array .length exports only count. */
  readPlannedResourceFields(
    receipt: PlanReceipt,
    selections: Record<string, string[]>,
    env: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<Record<string, Record<string, unknown> | null>>;
  /** Optional for older installed runtimes; exact applied receipt and nonsensitive state identities required. */
  readAppliedResourceFields?(
    receipt: PlanReceipt,
    selections: Record<string, string[]>,
    env: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<AppliedResourceProjection>;
  /** Restricted interrupted-attempt inspection; never permits resubmission or implies success. */
  readApplyAttemptResourceFields?(
    receipt: PlanReceipt,
    selections: Record<string, string[]>,
    env: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<ApplyAttemptResourceProjection>;
  /** Optional on older runtimes; a planned no-change receipt and stable nonsensitive state are required. */
  readNoChangeResourceFields?(
    receipt: PlanReceipt,
    selections: Record<string, string[]>,
    env: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<NoChangeResourceProjection>;
  /** Optional on older runtimes; inspects current state behind a resource-only planned receipt. */
  readPlannedStateResourceFields?(
    receipt: PlanReceipt,
    selections: Record<string, string[]>,
    env: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<PlannedStateResourceProjection>;
  /** Recover a current unconsumed receipt only after saved binary inspection; never authorizes submission. */
  readCurrentResourcePlanReceipt?(
    env: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<CurrentResourcePlanSnapshot>;
  readApplyCheckpoint?(receipt: PlanReceipt): Promise<ApplyCheckpoint>;
  readPlannedResourceIds(
    receipt: PlanReceipt,
    addresses: string[],
    env: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<Record<string, string | null>>;
  readOutputs(
    names: string[],
    env: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>>;
  reviseConfiguration(expectedSha256: string, configuration: string): Promise<string>;
  /** Resolve an interrupted apply only after the cloud adapter persists exact outcome evidence. */
  reconcileApplyFromEvidence(receipt: PlanReceipt, evidenceSha256: string): Promise<void>;
  planDestroy(env: Record<string, string | undefined>, signal?: AbortSignal): Promise<PlanReceipt>;
  planAction(
    intent: TerraformActionIntent,
    env: Record<string, string | undefined>,
    signal?: AbortSignal,
  ): Promise<PlanReceipt>;
  plan(env: Record<string, string | undefined>, signal?: AbortSignal): Promise<PlanReceipt>;
  apply(receipt: PlanReceipt, env: Record<string, string | undefined>, signal?: AbortSignal): Promise<void>;
}
export interface CeTerraformService {
  /** Source-owned prerequisite inspection before new cloud adapters create their local preparation receipts. */
  assertNewRuntime?(provider: 'aws' | 'azure' | 'gcp'): Promise<void>;
  open(owner: CeOwner, deployment: Deployment, resume: boolean | 'current'): Promise<TerraformSession>;
}
export interface GoogleAdcPolicy {
  /** The same owning factory must close a failed admission that did not return a lease. */
  closeFailedAcquisition?(): Promise<void>;
  readonly accountSha256: string;
  readonly audienceSha256: string;
  readonly qualificationSha256: string;
  /** Review, freeze and monitor the original snapshot; never return raw credentials. */
  acquire(request: {
    owner: CeOwner;
    deployment: Deployment;
    directory: string;
    resume: boolean | 'current';
  }): Promise<GoogleAdcLease>;
}
export interface CeTerraformRuntimeOptions {
  /** Trusted opt-in read channel; does not grant execution or alter historical executor selection. */
  readonly planSource?: 'gcp-resource-plan-v1';
  /** Source-owned preflight before consuming a saved plan; invocation release still rechecks live capture. */
  readonly assertApplyReady?: () => Promise<void>;
  /** Opt-in trusted policy; legacy stored sessions retain their original behavior. */
  readonly googleAdc?: GoogleAdcPolicy;
  /** Trusted execution policy; the runner retains ownership, saved-plan and recovery checks. */
  readonly execute?: Executor;
}
export interface CeTerraformRuntimeRequest {
  readonly owner: CeOwner;
  readonly deployment: Deployment;
  readonly directory: string;
  readonly resume: boolean | 'current';
  readonly platform: CePlatformService;
}
export interface CeTerraformServiceOptions extends CeTerraformRuntimeOptions {
  /** Installed server code selects the owning context; conversational callers cannot provide a resolver. */
  readonly resolveRuntime?: (request: CeTerraformRuntimeRequest) => Promise<CeTerraformRuntimeOptions>;
}
function freezeRuntime(options: CeTerraformRuntimeOptions): CeTerraformRuntimeOptions {
  const execute = options.execute;
  const planSource = options.planSource;
  if (planSource !== undefined && (planSource !== 'gcp-resource-plan-v1' || !execute))
    throw new Error('Qualified versioned plan source requires its original executor');
  const assertApplyReady = options.assertApplyReady;
  const googleAdc = options.googleAdc
    ? Object.freeze({ ...options.googleAdc, acquire: options.googleAdc.acquire })
    : undefined;
  if (googleAdc && !execute) throw new Error('Google ADC policy requires a qualified original-lifetime executor');
  return Object.freeze({ execute, googleAdc, assertApplyReady, planSource });
}

/** Cloud adapters translate intent; the runner owns isolated execution and exact saved-plan application. */
export function createCeTerraformService(
  platform: () => Promise<CePlatformService>,
  options: CeTerraformServiceOptions = {},
): CeTerraformService {
  // Capture the policy once so mutation of the options object cannot redirect later sessions.
  const defaults = freezeRuntime(options);
  const resolveRuntime = options.resolveRuntime;
  if (resolveRuntime && (defaults.execute || defaults.googleAdc || defaults.assertApplyReady || defaults.planSource))
    throw new Error('Select one trusted runtime policy source');
  return {
    async open(owner, deployment, resume) {
      owner = structuredClone(owner);
      deployment = structuredClone(deployment);
      if (
        owner.engine !== 'terraform' ||
        deployment.engine !== 'terraform' ||
        owner.deploymentId !== deployment.deploymentId ||
        owner.provider !== deployment.scope.cloud ||
        owner.account !== deployment.scope.account ||
        owner.region !== deployment.scope.region
      )
        throw new Error('Terraform deployment and cloud ownership differ');
      const shared = await platform();
      const store = await shared.storage(owner);
      if (deployment.stage !== undefined && !/^[a-z][a-z0-9-]{0,62}$/.test(deployment.stage))
        throw new Error('Invalid Terraform stage identity');
      const directory = deployment.stage
        ? join(store.directory, 'terraform-stages', deployment.stage)
        : store.directory;
      const { execute, googleAdc, assertApplyReady, planSource } = resolveRuntime
        ? freezeRuntime(
            await resolveRuntime({
              owner: structuredClone(owner),
              deployment: structuredClone(deployment),
              directory,
              resume,
              platform: shared,
            }),
          )
        : defaults;
      let adcSession: Promise<Awaited<ReturnType<typeof openGoogleAdcSession>>> | undefined;
      let originalLease: GoogleAdcLease | undefined;
      let retiring = false;
      let inFlight = 0;
      let disposal: Promise<void> | undefined;
      const policy = owner.provider === 'gcp' ? googleAdc : undefined;
      const acquireAdc = () =>
        (adcSession ??= (async () => {
          if (!policy) throw new Error('Trusted Google ADC policy unavailable');
          await shared.storage(owner);
          const lease = await policy.acquire({
            owner: structuredClone(owner),
            deployment: structuredClone(deployment),
            directory,
            resume,
          });
          originalLease = Object.freeze({ ...lease, owner: structuredClone(lease.owner) });
          return openGoogleAdcSession(originalLease, {
            owner,
            directory,
            accountSha256: policy.accountSha256,
            audienceSha256: policy.audienceSha256,
            qualificationSha256: policy.qualificationSha256,
          });
        })());
      const withAdc = async <T>(operation: (adc: Awaited<ReturnType<typeof openGoogleAdcSession>>) => Promise<T>) => {
        if (retiring) throw new Error('Original Google ADC session is retired');
        inFlight++;
        try {
          return await operation(await acquireAdc());
        } finally {
          inFlight--;
        }
      };
      const guardedExecute: Executor | undefined =
        policy && execute
          ? (request) =>
              withAdc(async (adc) => {
                const environment = { ...request.env, ...adc.environment() };
                if (
                  request.env.GOOGLE_APPLICATION_CREDENTIALS !== undefined &&
                  request.env.GOOGLE_APPLICATION_CREDENTIALS !== environment.GOOGLE_APPLICATION_CREDENTIALS
                )
                  throw new Error('Original Google ADC source changed');
                await adc.verify(environment);
                return withFinalCheck(
                  () => execute({ ...request, env: environment }),
                  () => adc.verify(environment),
                  'Original Terraform invocation and ADC verification failed',
                );
              })
          : execute;
      const runner = new TerraformRunner(directory, guardedExecute, undefined, planSource);
      if (resume) await runner.resume(deployment.deploymentId, deployment, resume === 'current' ? 'current' : 'exact');
      else await runner.prepare(deployment);
      const checkOwner = async () => {
        await shared.storage(owner);
      };
      const checkApplyReady = async () => {
        await checkOwner();
        if (retiring) throw new Error('Original Google ADC session is retired');
        await assertApplyReady?.();
      };
      return {
        ...(assertApplyReady ? { assertApplyReady: checkApplyReady } : {}),
        ...(policy
          ? {
              googleAdcEnvironment: () =>
                withAdc(async (adc) => {
                  await checkOwner();
                  const environment = adc.environment();
                  await adc.verify(environment);
                  return environment;
                }),
              closeGoogleAdc: () => {
                retiring = true;
                if (inFlight) return Promise.reject(new Error('Original Google ADC invocation is in flight'));
                if (!disposal)
                  disposal = (async () => {
                    await checkOwner();
                    if (!adcSession) return;
                    let adc: Awaited<ReturnType<typeof openGoogleAdcSession>>;
                    try {
                      adc = await adcSession;
                    } catch {
                      // Admission can fail after the trusted factory starts its monitor.
                      // Only that same owner's independent closure callback can release it.
                      if (!originalLease && policy.closeFailedAcquisition) {
                        await policy.closeFailedAcquisition();
                        return;
                      }
                      if (
                        !originalLease ||
                        originalLease.owner.deploymentId !== owner.deploymentId ||
                        originalLease.owner.engine !== owner.engine ||
                        originalLease.owner.provider !== owner.provider ||
                        originalLease.owner.account !== owner.account ||
                        originalLease.owner.region !== owner.region ||
                        typeof originalLease.closeAfterExecutorExit !== 'function'
                      )
                        throw new Error('Original Google ADC lease closure ownership unavailable');
                      await originalLease.closeAfterExecutorExit();
                      return;
                    }
                    await adc.close();
                  })().catch((error) => {
                    disposal = undefined;
                    throw error;
                  });
                return disposal;
              },
            }
          : {}),
        async readStateIdentity() {
          await checkOwner();
          return runner.readStateIdentity();
        },
        async assertApplied(receipt) {
          await checkOwner();
          return runner.assertApplied(receipt);
        },
        async readConfigurationSha256() {
          await checkOwner();
          return runner.readConfigurationSha256();
        },
        async readPlannedResourceFields(receipt, selections, env, signal) {
          await checkOwner();
          return runner.readPlannedResourceFields(receipt, selections, env, signal);
        },
        async readAppliedResourceFields(receipt, selections, env, signal) {
          await checkOwner();
          return runner.readAppliedResourceFields(receipt, selections, env, signal);
        },
        async readNoChangeResourceFields(receipt, selections, env, signal) {
          await checkOwner();
          return runner.readNoChangeResourceFields(receipt, selections, env, signal);
        },
        async readPlannedStateResourceFields(receipt, selections, env, signal) {
          await checkOwner();
          return runner.readPlannedStateResourceFields(receipt, selections, env, signal);
        },
        async readCurrentResourcePlanReceipt(env, signal) {
          await checkOwner();
          return runner.readCurrentResourcePlanReceipt(env, signal);
        },
        async readApplyCheckpoint(receipt) {
          await checkOwner();
          return runner.readApplyCheckpoint(receipt);
        },
        async readApplyAttemptResourceFields(receipt, selections, env, signal) {
          await checkOwner();
          return runner.readApplyAttemptResourceFields(receipt, selections, env, signal);
        },
        async readPlannedResourceIds(receipt, addresses, env, signal) {
          await checkOwner();
          return runner.readPlannedResourceIds(receipt, addresses, env, signal);
        },
        async readConfiguration(expectedSha256) {
          await checkOwner();
          return runner.readConfiguration(expectedSha256);
        },
        async readOutputs(names, env, signal) {
          await checkOwner();
          return runner.readOutputs(names, env, signal);
        },
        async reviseConfiguration(expectedSha256, configuration) {
          await checkOwner();
          return runner.reviseConfiguration(expectedSha256, configuration);
        },
        async reconcileApplyFromEvidence(receipt, evidenceSha256) {
          await checkOwner();
          return runner.reconcileApplyFromEvidence(receipt, evidenceSha256);
        },
        async planDestroy(env, signal) {
          await checkOwner();
          return runner.planDestroy(env, signal);
        },
        async planAction(intent, env, signal) {
          await checkOwner();
          return runner.planAction(intent, env, signal);
        },
        async plan(env, signal) {
          await checkOwner();
          return runner.plan(env, signal);
        },
        async apply(receipt, env, signal) {
          signal?.throwIfAborted();
          await checkApplyReady();
          signal?.throwIfAborted();
          await runner.apply(receipt, env, signal);
        },
      };
    },
  };
}
export function registerCeTerraformService(bus: CeEventBus, service: CeTerraformService): () => void {
  return bus.on(TERRAFORM_SERVICE_CHANNEL, (data) => {
    if (!data || typeof data !== 'object') return;
    const request = data as { version?: unknown; resolve?: unknown };
    if (request.version === 1 && typeof request.resolve === 'function') request.resolve(service);
  });
}

export function requestPlatform(bus: CeEventBus): Promise<CePlatformService> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Platform CE service is required for Terraform ownership')), 5000);
    try {
      bus.emit('xcsh:ce-platform:v2:service', {
        version: 2,
        resolve: (service: CePlatformService) => {
          clearTimeout(timer);
          resolve(service);
        },
      });
    } catch {
      clearTimeout(timer);
      reject(new Error('Platform CE service is unavailable'));
    }
  });
}
