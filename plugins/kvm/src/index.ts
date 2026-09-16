import { createKvmSmsv2Tools } from './tools';

interface KvmExtensionApi {
  typebox: { Type: Record<string, (...args: unknown[]) => unknown> };
  setLabel(label: string): void;
  registerTool?(tool: unknown): void;
  registerServiceStatus?(status: unknown): void;
  on?(event: string, handler: unknown): void;
  logger: { debug(message: string): void };
}

export function isKvmSmsv2Prompt(prompt: string): boolean {
  const normalized = prompt.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  const kvmContext = /\bkvm\b|\blibvirt\b|\bqemu\b/.test(normalized);
  const ceContext =
    /\bcustomer edge\b|\bf5 ce\b|\bxc ce\b|\bsecure mesh\b|\bsmsv2\b|\bce site\b/.test(normalized) ||
    /\bf5\b.*\b(distributed cloud|xc|edge|appliance|bgp)\b/.test(normalized);
  return kvmContext && ceContext;
}

export const KVM_SMSV2_GATE = [
  'KVM SMSV2 ROUTE: Use the kvm:kvm-smsv2 workflow for this request.',
  'Call f5xc_ce_v2_capabilities and kvm_smsv2_preflight before planning.',
  'Require the immutable API prerequisite provenance, successful live image issuance, exact KVM host identity, project ownership, and the AWS-backed Terraform state identity.',
  'Inspect every saved plan before apply. Apply only its exact artifact and SHA-256.',
  'If maurice_config_cardinality_exactly_one is unavailable, stop before Terraform apply, F5 mutation, libvirt, FRR, Docker, or cloud mutation. The plugin cannot create or repair this tenant-owned prerequisite.',
].join('\n');

const factory = async (pi: KvmExtensionApi) => {
  pi.setLabel('KVM SMSv2');
  if (typeof pi.registerTool === 'function') for (const tool of createKvmSmsv2Tools(pi)) pi.registerTool(tool);

  if (typeof pi.on === 'function') {
    pi.on('before_agent_start', async (event: { prompt?: string }) => {
      if (!isKvmSmsv2Prompt(String(event?.prompt ?? ''))) return;
      return { message: { customType: 'kvm_smsv2_gate', content: KVM_SMSV2_GATE, display: false } };
    });
  }

  if (typeof pi.registerServiceStatus === 'function') {
    pi.registerServiceStatus({
      name: 'KVM SMSv2',
      async check() {
        const terraform = Bun.spawnSync(['terraform', 'version']);
        const virsh = Bun.spawnSync(['virsh', '--connect', 'qemu:///system', 'uri']);
        if (terraform.exitCode !== 0 || virsh.exitCode !== 0)
          return { state: 'unavailable', hint: 'Install Terraform and configure qemu:///system access.' };
        return { state: 'connected' };
      },
    });
  }
};

export default factory;
