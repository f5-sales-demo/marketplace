import {
  type ControllerInvoker,
  createKvmSmsv2Tools,
  invokeController as defaultInvokeController,
  KVM_SMSV2_CONTROLLER,
  KVM_SMSV2_PROTOCOL,
} from './tools';

interface KvmExtensionApi {
  typebox: { Type: Record<string, (...args: unknown[]) => unknown> };
  setLabel(label: string): void;
  registerTool?(tool: unknown): void;
  integrations: { register<_T>(definition: unknown): unknown };
  on?(event: string, handler: unknown): void;
}

const factory = async (pi: KvmExtensionApi, invokeController: ControllerInvoker = defaultInvokeController) => {
  pi.setLabel('KVM SMSv2');
  pi.integrations.register({
    id: 'kvm',
    name: 'KVM Secure Mesh Site v2',
    plugin: 'kvm',
    kind: 'local',
    dependencies: ['platform'],
    setup: {
      pluginDependencies: ['platform'],
      requiredEnvironment: ['XCSH_API_URL', 'XCSH_API_TOKEN'],
      profileFields: [],
      steps: [
        {
          kind: 'install',
          argv: [KVM_SMSV2_CONTROLLER, '--json', 'setup', 'apply'],
          timeoutMs: 7_200_000,
          environment: ['XCSH_API_URL', 'XCSH_API_TOKEN'],
          stdin: 'inherit',
        },
      ],
      verification: [{ argv: [KVM_SMSV2_CONTROLLER, '--json', 'setup', 'status'], timeoutMs: 60_000 }],
    },
    async probe() {
      if (process.platform !== 'linux' || process.arch !== 'x64')
        return { state: 'unavailable', reason: 'dependency_missing' };
      try {
        const result = invokeController('setup', {}, 'status');
        const status = result.result as { state?: string } | undefined;
        return status?.state === 'ready'
          ? { state: 'ready', value: result }
          : { state: 'setup_required', reason: 'dependency_missing', value: result };
      } catch {
        return { state: 'setup_required', reason: 'dependency_missing' };
      }
    },
  });
  if (typeof pi.registerTool === 'function')
    for (const tool of createKvmSmsv2Tools(pi, invokeController)) pi.registerTool(tool);
  if (typeof pi.on === 'function') {
    pi.on('before_agent_start', async (event: { prompt?: string }) => {
      const prompt = String(event?.prompt ?? '').toLowerCase();
      if (
        !/(?:kvm|libvirt|qemu).*(?:secure mesh|smsv2|customer edge)|(?:secure mesh|smsv2|customer edge).*(?:kvm|libvirt|qemu)/.test(
          prompt,
        )
      )
        return;
      return {
        message: {
          customType: 'kvm_smsv2_v2',
          content: `Use only the ${KVM_SMSV2_PROTOCOL} tools. Installation authorizes bounded readiness remediation, reboot/resume, deployment, and verification. Never retry an ambiguous POST; inspect the exact persisted system/site name and reconcile only an owned spec match.`,
          display: false,
        },
      };
    });
  }
};

export default factory;
