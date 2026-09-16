import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import {
  applyKvmLifecyclePlan,
  type KvmLifecyclePlan,
  type KvmLifecyclePreflight,
  KvmPrerequisiteUnavailableError,
  preflightKvmLifecycle,
  prepareKvmLifecyclePlan,
} from './lifecycle';
import { resolveKvmReleasePrerequisite } from './release-contract';
import { inspectKvmHost, inspectKvmRuntimeStatus, type KvmRuntimeStatus, probeKvmImagePrerequisite } from './runtime';
import { applyTerraformSavedPlan, createTerraformSavedPlan } from './terraform';

interface KvmToolApi {
  typebox: { Type: Record<string, (...args: unknown[]) => unknown> };
}

export interface KvmPreflightParams {
  workspace: string;
}

export interface KvmPlanParams extends KvmPreflightParams {
  mode: 'apply' | 'destroy';
}

export interface KvmApplyParams {
  planArtifact: string;
  planSha256: string;
}

export interface KvmApplyReceipt {
  mode: 'apply' | 'destroy';
  outputBytes: number;
  outputSha256: string;
}

export interface KvmStatusParams {
  workspace: string;
  trafficUrl?: string;
  trafficSamples?: number;
}

export interface KvmToolSessionManager {
  getSessionId(): string;
  getArtifactsDir(): string | null;
  saveArtifact(content: string, toolType: string): Promise<string | undefined>;
  getArtifactPath(id: string): Promise<string | null>;
}

export interface KvmToolContext {
  hasUI: boolean;
  ui: { confirm(title: string, message: string): Promise<boolean> };
  sessionManager: KvmToolSessionManager;
}

export interface KvmToolRuntime {
  preflight(params: KvmPreflightParams): Promise<KvmLifecyclePreflight>;
  plan(
    params: KvmPlanParams,
    context: KvmToolContext,
  ): Promise<{ planArtifact: string; lifecyclePlan: KvmLifecyclePlan }>;
  apply(params: KvmApplyParams, context: KvmToolContext): Promise<KvmApplyReceipt>;
  drift(
    params: KvmPreflightParams,
    context: KvmToolContext,
  ): Promise<{ planArtifact: string; lifecyclePlan: KvmLifecyclePlan }>;
  status(params: KvmStatusParams): Promise<KvmRuntimeStatus>;
}

function defaultRuntime(): KvmToolRuntime {
  const dependencies = () => ({
    readReleasePrerequisite: () => resolveKvmReleasePrerequisite(),
    probeImagePrerequisite: () => probeKvmImagePrerequisite(),
    inspectHost: inspectKvmHost,
  });
  const plan = async (params: KvmPlanParams, context: KvmToolContext) => {
    const artifactsDir = context.sessionManager.getArtifactsDir();
    if (!artifactsDir || !isAbsolute(artifactsDir))
      throw new Error('KVM saved plans require a protected session artifact directory');
    const outputPath = join(artifactsDir, `kvm-smsv2-${params.mode}-${randomUUID()}.tfplan`);
    const lifecyclePlan = await prepareKvmLifecyclePlan(params, {
      ...dependencies(),
      createSavedPlan: (workspace, mode) => createTerraformSavedPlan(workspace, mode, outputPath),
    });
    const planArtifact = await context.sessionManager.saveArtifact(
      JSON.stringify({ kind: 'kvm-smsv2-plan', workspace: params.workspace, lifecyclePlan }),
      'kvm-smsv2-plan',
    );
    if (!planArtifact) throw new Error('KVM saved-plan metadata could not be persisted');
    return { planArtifact, lifecyclePlan };
  };
  return {
    preflight: async (params) => preflightKvmLifecycle(params.workspace, dependencies()),
    plan,
    apply: async (params, context) => {
      const metadataPath = await context.sessionManager.getArtifactPath(params.planArtifact);
      if (!metadataPath) throw new Error('KVM saved-plan artifact was not found in this session');
      let envelope: { kind?: unknown; workspace?: unknown; lifecyclePlan?: unknown };
      try {
        envelope = JSON.parse(await readFile(metadataPath, 'utf8')) as typeof envelope;
      } catch {
        throw new Error('KVM saved-plan artifact is invalid');
      }
      if (
        envelope.kind !== 'kvm-smsv2-plan' ||
        typeof envelope.workspace !== 'string' ||
        !isAbsolute(envelope.workspace) ||
        !envelope.lifecyclePlan ||
        typeof envelope.lifecyclePlan !== 'object'
      )
        throw new Error('KVM saved-plan artifact is invalid');
      const lifecyclePlan = envelope.lifecyclePlan as KvmLifecyclePlan;
      if (lifecyclePlan.savedPlan?.sha256 !== params.planSha256)
        throw new Error('KVM saved-plan artifact SHA-256 does not match the request');
      const artifactsDir = context.sessionManager.getArtifactsDir();
      if (!artifactsDir || !isAbsolute(artifactsDir))
        throw new Error('KVM saved plans require a protected session artifact directory');
      const planRelative = relative(artifactsDir, lifecyclePlan.savedPlan.path);
      if (!planRelative || planRelative.startsWith('..') || isAbsolute(planRelative))
        throw new Error('KVM saved-plan path is outside the protected session artifact directory');

      let receipt: Awaited<ReturnType<typeof applyTerraformSavedPlan>> | undefined;
      await applyKvmLifecyclePlan(lifecyclePlan, {
        readReleasePrerequisite: () => resolveKvmReleasePrerequisite(),
        probeImagePrerequisite: () => probeKvmImagePrerequisite(),
        inspectHost: () => inspectKvmHost(envelope.workspace as string),
        hashSavedPlan: async (path) => createHashForPath(path),
        applySavedPlan: async (path) => {
          const approved = context.hasUI
            ? await context.ui.confirm(
                lifecyclePlan.savedPlan.mode === 'destroy' ? 'Destroy KVM SMSv2' : 'Apply KVM SMSv2',
                `Apply the exact inspected ${lifecyclePlan.savedPlan.mode} plan ${lifecyclePlan.savedPlan.sha256}?`,
              )
            : process.env.XCSH_KVM_HEADLESS_MUTATIONS === '1';
          if (!approved) throw new Error('KVM saved-plan apply was not approved');
          if (lifecyclePlan.savedPlan.mode === 'destroy' && process.env.XCSH_KVM_ALLOW_DESTROY !== '1')
            throw new Error('KVM destroy requires XCSH_KVM_ALLOW_DESTROY=1');
          receipt = await applyTerraformSavedPlan(envelope.workspace as string, path);
        },
      });
      if (!receipt) throw new Error('KVM saved-plan apply produced no receipt');
      return { mode: lifecyclePlan.savedPlan.mode, ...receipt };
    },
    drift: (params, context) => plan({ ...params, mode: 'apply' }, context),
    status: (params) => inspectKvmRuntimeStatus(params.workspace, params),
  };
}

async function createHashForPath(path: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

export function createKvmSmsv2Tools(pi: KvmToolApi, runtime: KvmToolRuntime = defaultRuntime()) {
  const { Type } = pi.typebox;
  const workspace = Type.String({ description: 'Absolute path to the MCN Terraform root.' });
  const plan = Type.Object({
    planArtifact: Type.String({ description: 'Opaque saved-plan artifact identifier.' }),
    planSha256: Type.String({ pattern: '^[0-9a-f]{64}$' }),
  });
  return [
    {
      name: 'kvm_smsv2_preflight',
      label: 'Preflight KVM SMSv2',
      description:
        'Verify the immutable KVM prerequisite contract, live tenant image issuance, KVM host identity, libvirt, Terraform, and project-owned inventory without mutation.',
      parameters: Type.Object({
        workspace,
      }),
      async execute(_id: string, params: KvmPreflightParams) {
        try {
          const preflight = await runtime.preflight(params);
          return {
            content: [
              {
                type: 'text' as const,
                text: `KVM prerequisite available; host ${preflight.host.hostname} confirmed ${preflight.host.libvirtUri}.`,
              },
            ],
            details: { tool: 'kvm_smsv2_preflight', preflight },
          };
        } catch (error) {
          const prerequisiteError = error instanceof KvmPrerequisiteUnavailableError;
          return {
            content: [
              {
                type: 'text' as const,
                text: prerequisiteError
                  ? error.message
                  : 'KVM SMSv2 preflight failed safely; no mutation was attempted.',
              },
            ],
            isError: true,
            details: {
              tool: 'kvm_smsv2_preflight',
              code: prerequisiteError ? error.code : 'preflight_failed',
              mutationAttempted: false,
            },
          };
        }
      },
    },
    {
      name: 'kvm_smsv2_plan',
      label: 'Plan KVM SMSv2 lifecycle',
      description:
        'Create and inspect an immutable Terraform saved plan for KVM deploy, reconciliation, destroy, or rebuild after prerequisite and identity validation.',
      parameters: Type.Object({
        workspace,
        mode: Type.Union([Type.Literal('apply'), Type.Literal('destroy')]),
      }),
      async execute(
        _id: string,
        params: KvmPlanParams,
        _signal: AbortSignal | undefined,
        _update: unknown,
        context: KvmToolContext,
      ) {
        try {
          const result = await runtime.plan(params, context);
          const saved = result.lifecyclePlan.savedPlan;
          return {
            content: [
              {
                type: 'text' as const,
                text: `KVM saved plan inspected: ${saved.add} to add, ${saved.change} to change, ${saved.destroy} to destroy; Azure actions: ${saved.azureActions}.`,
              },
            ],
            details: {
              tool: 'kvm_smsv2_plan',
              planArtifact: result.planArtifact,
              planSha256: saved.sha256,
              mode: saved.mode,
              add: saved.add,
              change: saved.change,
              destroy: saved.destroy,
              azureActions: saved.azureActions,
            },
          };
        } catch (error) {
          const prerequisiteError = error instanceof KvmPrerequisiteUnavailableError;
          return {
            content: [
              {
                type: 'text' as const,
                text: prerequisiteError
                  ? error.message
                  : 'KVM SMSv2 planning failed safely; no infrastructure mutation was attempted.',
              },
            ],
            isError: true,
            details: {
              tool: 'kvm_smsv2_plan',
              code: prerequisiteError ? error.code : 'plan_failed',
              mutationAttempted: false,
            },
          };
        }
      },
    },
    {
      name: 'kvm_smsv2_apply',
      label: 'Apply KVM SMSv2 saved plan',
      description:
        'Revalidate tenant, host, ownership, and saved-plan bytes, then apply only the exact inspected Terraform plan.',
      parameters: plan,
      async execute(
        _id: string,
        params: KvmApplyParams,
        _signal: AbortSignal | undefined,
        _update: unknown,
        context: KvmToolContext,
      ) {
        try {
          const receipt = await runtime.apply(params, context);
          return {
            content: [
              {
                type: 'text' as const,
                text: `KVM ${receipt.mode} exact saved plan applied; Terraform output was withheld and recorded by digest.`,
              },
            ],
            details: {
              tool: 'kvm_smsv2_apply',
              mode: receipt.mode,
              planSha256: params.planSha256,
              outputBytes: receipt.outputBytes,
              outputSha256: receipt.outputSha256,
            },
          };
        } catch (error) {
          const prerequisiteError = error instanceof KvmPrerequisiteUnavailableError;
          return {
            content: [
              {
                type: 'text' as const,
                text: prerequisiteError
                  ? error.message
                  : 'KVM SMSv2 saved-plan apply was rejected before an unverified mutation.',
              },
            ],
            isError: true,
            details: {
              tool: 'kvm_smsv2_apply',
              code: prerequisiteError ? error.code : 'apply_rejected',
            },
          };
        }
      },
    },
    {
      name: 'kvm_smsv2_status',
      label: 'Inspect KVM SMSv2 status',
      description:
        'Read Terraform, libvirt, FRR/BGP, and optionally bounded generated-traffic evidence without changing infrastructure.',
      parameters: Type.Object({
        workspace,
        trafficUrl: Type.Optional(Type.String()),
        trafficSamples: Type.Optional(Type.Number({ minimum: 1, maximum: 20 })),
      }),
      async execute(_id: string, params: KvmStatusParams) {
        try {
          const status = await runtime.status(params);
          const running = status.domains.filter((domain) => domain.state === 'running').length;
          const traffic = status.traffic
            ? `; ${status.traffic.successes}/${status.traffic.samples} traffic samples successful`
            : '';
          return {
            content: [
              {
                type: 'text' as const,
                text: `KVM local status: ${running}/${status.domains.length} domains running; ${status.frr.established}/${status.frr.peers} FRR peers established${traffic}.`,
              },
            ],
            details: { tool: 'kvm_smsv2_status', status },
          };
        } catch {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'KVM SMSv2 status collection failed; raw command and traffic output was withheld.',
              },
            ],
            isError: true,
            details: { tool: 'kvm_smsv2_status', code: 'status_failed', mutationAttempted: false },
          };
        }
      },
    },
    {
      name: 'kvm_smsv2_drift',
      label: 'Detect KVM SMSv2 drift',
      description:
        'Create and inspect a refresh-aware saved plan that distinguishes no-change, configuration drift, and runtime drift without applying it.',
      parameters: Type.Object({
        workspace,
      }),
      async execute(
        _id: string,
        params: KvmPreflightParams,
        _signal: AbortSignal | undefined,
        _update: unknown,
        context: KvmToolContext,
      ) {
        try {
          const result = await runtime.drift(params, context);
          const saved = result.lifecyclePlan.savedPlan;
          const classification = saved.add + saved.change + saved.destroy === 0 ? 'no-change' : 'drift';
          return {
            content: [
              {
                type: 'text' as const,
                text:
                  classification === 'no-change'
                    ? 'KVM Terraform refresh is no-change.'
                    : `KVM Terraform drift detected: ${saved.add} to add, ${saved.change} to change, ${saved.destroy} to destroy.`,
              },
            ],
            details: {
              tool: 'kvm_smsv2_drift',
              classification,
              planArtifact: result.planArtifact,
              planSha256: saved.sha256,
              add: saved.add,
              change: saved.change,
              destroy: saved.destroy,
              azureActions: saved.azureActions,
            },
          };
        } catch (error) {
          const prerequisiteError = error instanceof KvmPrerequisiteUnavailableError;
          return {
            content: [
              {
                type: 'text' as const,
                text: prerequisiteError
                  ? error.message
                  : 'KVM SMSv2 drift inspection failed safely; no mutation was attempted.',
              },
            ],
            isError: true,
            details: {
              tool: 'kvm_smsv2_drift',
              code: prerequisiteError ? error.code : 'drift_failed',
              mutationAttempted: false,
            },
          };
        }
      },
    },
  ];
}
