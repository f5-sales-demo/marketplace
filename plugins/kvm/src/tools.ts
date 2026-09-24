import { resolve } from 'node:path';

export const KVM_SMSV2_PROTOCOL = 'kvm.smsv2/v3';
export const KVM_SMSV2_CONTROLLER = resolve(import.meta.dir, '..', 'scripts', 'kvm-smsv2ctl');

interface ExtensionApi {
  typebox: { Type: Record<string, (...args: unknown[]) => unknown> };
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
) => ControllerEnvelope;

export const invokeController: ControllerInvoker = (command, params = {}, action) => {
  const result = Bun.spawnSync(
    [KVM_SMSV2_CONTROLLER, '--json', command, ...(action ? [action] : []), '--params', JSON.stringify(params)],
    {
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
  let envelope: ControllerEnvelope;
  try {
    envelope = JSON.parse(new TextDecoder().decode(result.stdout)) as ControllerEnvelope;
  } catch {
    throw new Error(`KVM SMSv2 controller returned an invalid envelope (exit ${result.exitCode})`);
  }
  if (envelope.schemaVersion !== KVM_SMSV2_PROTOCOL || envelope.action !== command)
    throw new Error('KVM SMSv2 controller returned an incompatible envelope');
  if (result.exitCode !== 0 || !envelope.ok) throw new Error(envelope.error ?? 'KVM SMSv2 controller failed');
  return envelope;
};

function toolResult(name: string, invoke: ControllerInvoker, params: Record<string, unknown>) {
  const action = name.replace('kvm_smsv2_', '');
  try {
    const result = invoke(action, params);
    return { content: [{ type: 'text', text: JSON.stringify(result) }], details: result };
  } catch (error) {
    const result = {
      schemaVersion: KVM_SMSV2_PROTOCOL,
      controllerVersion: '3.0.1',
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
        'Selected project namespace for the HTTP-LB and origin pool; defaults to multi-cloud-networking. The site remains in system.',
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
      execute: async () => toolResult('kvm_smsv2_readiness', invoke, {}),
    },
    {
      name: 'kvm_smsv2_deploy',
      label: 'Deploy KVM SMSv2',
      description:
        'Prepare a rollback-protected wired bridge and execute one exact-hash, two-NIC CE and inside-VIP plan.',
      parameters: deployment,
      execute: async (_id: string, params: Record<string, unknown>) => toolResult('kvm_smsv2_deploy', invoke, params),
    },
    {
      name: 'kvm_smsv2_status',
      label: 'KVM SMSv2 status',
      description: 'Report owned VM, SLO/SLI, XC site, VIP, origin, LAN HTTP, and receipt state.',
      parameters: Type.Object({}),
      execute: async () => toolResult('kvm_smsv2_status', invoke, {}),
    },
    {
      name: 'kvm_smsv2_reconcile',
      label: 'Reconcile KVM SMSv2',
      description: 'Reconcile only the exact persisted and owned deployment through a new exact-hash saved plan.',
      parameters: deployment,
      execute: async (_id: string, params: Record<string, unknown>) =>
        toolResult('kvm_smsv2_reconcile', invoke, params),
    },
    {
      name: 'kvm_smsv2_destroy',
      label: 'Destroy KVM SMSv2',
      description:
        'Destroy only receipt-bound plugin resources and prove absence while preserving unrelated workloads.',
      parameters: Type.Object({}),
      execute: async () => toolResult('kvm_smsv2_destroy', invoke, {}),
    },
  ];
}
