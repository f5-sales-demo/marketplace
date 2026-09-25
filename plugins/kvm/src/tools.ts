import { resolve } from 'node:path';

export const KVM_SMSV2_PROTOCOL = 'kvm.smsv2/v3';
export const KVM_SMSV2_CONTROLLER = resolve(import.meta.dir, '..', 'scripts', 'kvm-smsv2ctl');

interface ExtensionApi {
  typebox: { Type: Record<string, (...args: unknown[]) => unknown> };
}

interface ToolExecutionContext {
  settings?: { get(key: string): unknown };
}

interface ControllerEnvelope {
  schemaVersion: typeof KVM_SMSV2_PROTOCOL;
  controllerVersion: string;
  action: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export type ControllerInvoker = (
  command: string,
  params?: Record<string, unknown>,
  action?: string,
  environment?: Record<string, string | undefined>,
) => ControllerEnvelope;

const CONTROLLER_CONTEXT_KEYS = [
  'XCSH_API_URL',
  'XCSH_API_TOKEN',
  'XCSH_NAMESPACE',
  'XCSH_TENANT',
  'XCSH_CONTEXT_NAME',
] as const;

export function controllerEnvironment(ctx?: ToolExecutionContext): Record<string, string | undefined> {
  const environment = { ...process.env };
  const active = ctx?.settings?.get('bash.environment');
  if (!active || typeof active !== 'object' || Array.isArray(active)) return environment;
  const values = active as Record<string, unknown>;
  for (const name of CONTROLLER_CONTEXT_KEYS) {
    const value = values[name];
    if (!environment[name] && typeof value === 'string' && value) environment[name] = value;
  }
  return environment;
}

export function parseControllerEnvelope(
  command: string,
  exitCode: number | null,
  stdout: Uint8Array,
  stderr: Uint8Array,
): ControllerEnvelope {
  const bytes = exitCode === 0 ? stdout : stderr;
  let envelope: ControllerEnvelope;
  try {
    envelope = JSON.parse(new TextDecoder().decode(bytes)) as ControllerEnvelope;
  } catch {
    throw new Error(`KVM SMSv2 controller returned an invalid envelope (exit ${exitCode})`);
  }
  if (envelope.schemaVersion !== KVM_SMSV2_PROTOCOL || envelope.action !== command)
    throw new Error('KVM SMSv2 controller returned an incompatible envelope');
  if (exitCode !== 0 || !envelope.ok) throw new Error(envelope.error ?? 'KVM SMSv2 controller failed');
  return envelope;
}

export const invokeController: ControllerInvoker = (command, params = {}, action, environment = process.env) => {
  const result = Bun.spawnSync(
    [KVM_SMSV2_CONTROLLER, '--json', command, ...(action ? [action] : []), '--params', JSON.stringify(params)],
    {
      stdout: 'pipe',
      stderr: 'pipe',
      env: environment,
    },
  );
  return parseControllerEnvelope(command, result.exitCode, result.stdout, result.stderr);
};

function toolResult(
  name: string,
  invoke: ControllerInvoker,
  params: Record<string, unknown>,
  ctx?: ToolExecutionContext,
) {
  const action = name.replace('kvm_smsv2_', '');
  try {
    const result = invoke(action, params, undefined, controllerEnvironment(ctx));
    return { content: [{ type: 'text', text: JSON.stringify(result) }], details: result };
  } catch (error) {
    const result = {
      schemaVersion: KVM_SMSV2_PROTOCOL,
      controllerVersion: '3.0.2',
      action,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    return { content: [{ type: 'text', text: JSON.stringify(result) }], details: result, isError: true };
  }
}

export function createKvmSmsv2Tools(pi: ExtensionApi, invoke: ControllerInvoker = invokeController) {
  const { Type } = pi.typebox;
  const siteName = Type.Optional(
    Type.String({ description: 'Persisted XC site name override for the first run only.' }),
  );
  const applicationNamespace = Type.Optional(
    Type.String({
      description:
        'Selected project namespace for the HTTP-LB and origin pool; uses the active XCSH_NAMESPACE when omitted. The site remains in system.',
    }),
  );
  const deployment = Type.Object({ siteName, applicationNamespace });
  return [
    {
      name: 'kvm_smsv2_readiness',
      label: 'KVM SMSv2 readiness',
      description:
        'Inspect Ubuntu, wired LAN and bridge ownership, virtualization, capacity, services, and immutable artifacts.',
      parameters: Type.Object({}),
      execute: async (
        _id: string,
        _params: Record<string, unknown>,
        _signal: AbortSignal | undefined,
        _onUpdate: unknown,
        ctx: ToolExecutionContext,
      ) => toolResult('kvm_smsv2_readiness', invoke, {}, ctx),
    },
    {
      name: 'kvm_smsv2_deploy',
      label: 'Deploy KVM SMSv2',
      description:
        'Prepare a rollback-protected wired bridge and execute one exact-hash, two-NIC CE and inside-VIP plan.',
      parameters: deployment,
      execute: async (
        _id: string,
        params: Record<string, unknown>,
        _signal: AbortSignal | undefined,
        _onUpdate: unknown,
        ctx: ToolExecutionContext,
      ) => toolResult('kvm_smsv2_deploy', invoke, params, ctx),
    },
    {
      name: 'kvm_smsv2_status',
      label: 'KVM SMSv2 status',
      description: 'Report owned VM, SLO/SLI, XC site, VIP, origin, LAN HTTP, and receipt state.',
      parameters: Type.Object({}),
      execute: async (
        _id: string,
        _params: Record<string, unknown>,
        _signal: AbortSignal | undefined,
        _onUpdate: unknown,
        ctx: ToolExecutionContext,
      ) => toolResult('kvm_smsv2_status', invoke, {}, ctx),
    },
    {
      name: 'kvm_smsv2_reconcile',
      label: 'Reconcile KVM SMSv2',
      description: 'Reconcile only the exact persisted and owned deployment through a new exact-hash saved plan.',
      parameters: deployment,
      execute: async (
        _id: string,
        params: Record<string, unknown>,
        _signal: AbortSignal | undefined,
        _onUpdate: unknown,
        ctx: ToolExecutionContext,
      ) => toolResult('kvm_smsv2_reconcile', invoke, params, ctx),
    },
    {
      name: 'kvm_smsv2_destroy',
      label: 'Destroy KVM SMSv2',
      description:
        'Destroy only receipt-bound plugin resources and prove absence while preserving unrelated workloads.',
      parameters: Type.Object({}),
      execute: async (
        _id: string,
        _params: Record<string, unknown>,
        _signal: AbortSignal | undefined,
        _onUpdate: unknown,
        ctx: ToolExecutionContext,
      ) => toolResult('kvm_smsv2_destroy', invoke, {}, ctx),
    },
  ];
}
