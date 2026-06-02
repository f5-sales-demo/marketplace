import { AzAuthError, AzNotFoundError, AzSessionExpiredError } from '../az/exec';
import type { AzRawResult, AzResource, AzResourceGroup, AzSubscription, AzVm } from '../az/types';

export type AzErrorType = 'auth_required' | 'session_expired' | 'not_found' | 'exec_error';

export type AzToolName = 'az_account' | 'az_group' | 'az_resource' | 'az_vm' | 'az_exec' | 'az_help';

export interface AzToolDetails {
  tool: AzToolName;
  action?: string;
  subscriptions?: AzSubscription[];
  resourceGroups?: AzResourceGroup[];
  resources?: AzResource[];
  vms?: AzVm[];
  errorType?: AzErrorType;
}

export function textResult(text: string, details: AzToolDetails) {
  return { content: [{ type: 'text' as const, text }], details };
}

export function errorResult(text: string, details: AzToolDetails) {
  return { content: [{ type: 'text' as const, text }], isError: true, details };
}

export function detectErrorType(err: unknown): AzErrorType {
  if (err instanceof AzAuthError) return 'auth_required';
  if (err instanceof AzSessionExpiredError) return 'session_expired';
  if (err instanceof AzNotFoundError) return 'not_found';
  return 'exec_error';
}

export function makeExecApi(cwd: string): { exec: (command: string, args: string[]) => Promise<AzRawResult> } {
  return {
    async exec(command: string, args: string[]): Promise<AzRawResult> {
      const proc = Bun.spawn([command, ...args], { cwd, stdout: 'pipe', stderr: 'pipe', env: process.env });
      const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
      const exitCode = await proc.exited;
      return { stdout, stderr, exitCode };
    },
  };
}

export function normalizeSubscription(raw: Record<string, unknown>): AzSubscription {
  const user = (raw.user as Record<string, unknown>) ?? {};
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    state: String(raw.state ?? ''),
    isDefault: Boolean(raw.isDefault),
    tenantId: String(raw.tenantId ?? ''),
    user: { name: String(user.name ?? ''), type: String(user.type ?? '') },
  };
}

export function normalizeResourceGroup(raw: Record<string, unknown>): AzResourceGroup {
  const props = (raw.properties as Record<string, unknown>) ?? {};
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    location: String(raw.location ?? ''),
    provisioningState: String(props.provisioningState ?? raw.provisioningState ?? ''),
    tags: (raw.tags as Record<string, string>) ?? {},
  };
}

export function normalizeResource(raw: Record<string, unknown>): AzResource {
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    type: String(raw.type ?? ''),
    location: String(raw.location ?? ''),
    resourceGroup: String(raw.resourceGroup ?? ''),
    provisioningState: String(raw.provisioningState ?? ''),
    tags: (raw.tags as Record<string, string>) ?? {},
  };
}

export function normalizeVm(raw: Record<string, unknown>): AzVm {
  const hw = (raw.hardwareProfile as Record<string, unknown>) ?? {};
  const storage = (raw.storageProfile as Record<string, unknown>) ?? {};
  const osDisk = (storage.osDisk as Record<string, unknown>) ?? {};
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    location: String(raw.location ?? ''),
    resourceGroup: String(raw.resourceGroup ?? ''),
    vmSize: String(hw.vmSize ?? ''),
    provisioningState: String(raw.provisioningState ?? ''),
    osType: String(osDisk.osType ?? ''),
    powerState: String(raw.powerState ?? ''),
    publicIps: String(raw.publicIps ?? ''),
    fqdns: String(raw.fqdns ?? ''),
  };
}
