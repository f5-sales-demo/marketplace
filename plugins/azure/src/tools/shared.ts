import { AzAuthError, type AzExecApi, AzNotFoundError, AzSessionExpiredError } from '../az/exec';
import type {
  AzActivityLogCoverage,
  AzActivityLogEvent,
  AzActivityScopeEvidence,
  AzRawResult,
  AzResource,
  AzResourceGroup,
  AzSubscription,
  AzVm,
  VmDisclosurePolicy,
} from '../az/types';

export type AzErrorType = 'auth_required' | 'session_expired' | 'not_found' | 'exec_error';

export type AzToolName =
  | 'az_account_show'
  | 'az_group_list'
  | 'az_resource_list'
  | 'az_vm_list'
  | 'az_resource_graph_query'
  | 'az_activity_log_list'
  | 'az_exec'
  | 'az_help';

export interface AzToolDetails {
  tool: AzToolName;
  action?: string;
  subscriptions?: AzSubscription[];
  resourceGroups?: AzResourceGroup[];
  resources?: AzResource[];
  vms?: AzVm[];
  errorType?: AzErrorType;
  outcome?:
    | 'success'
    | 'partial_scope'
    | 'setup_required'
    | 'unsupported_extension'
    | 'throttled'
    | 'invalid_input'
    | 'authentication_failure'
    | 'execution_failure';
  data?: unknown[];
  count?: number;
  totalRecords?: number;
  truncated?: boolean;
  skipToken?: string;
  inaccessibleScopeCount?: number;
  retryAfterSeconds?: number;
  extension?: { name: string; version: string };
  missingFlags?: string[];
  coverage?: AzActivityLogCoverage;
  scopeEvidence?: AzActivityScopeEvidence;
  events?: AzActivityLogEvent[];
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

export function makeExecApi(cwd: string): AzExecApi {
  return {
    async exec(
      command: string,
      args: string[],
      options?: { signal?: AbortSignal; env?: Record<string, string> },
    ): Promise<AzRawResult> {
      // Thread the AbortSignal so a genuine in-flight cancellation terminates the child.
      // Only wire it in while still live at spawn time — handing an already-aborted
      // (stale) signal to Bun.spawn would kill the fresh process immediately, resurrecting
      // a false cancel from a prior multi-turn tool call. Do NOT pre-check signal.aborted
      // to throw. A signal that aborts *during* the run still cancels for real.
      const signal = options?.signal;
      const proc = Bun.spawn([command, ...args], {
        cwd,
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, ...options?.env },
        ...(signal && !signal.aborted ? { signal } : {}),
      });
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

function normalizeStringArray(value: unknown): string[] {
  const values = Array.isArray(value) ? value.flat(Infinity) : [value];
  return values
    .filter((entry): entry is string | number => typeof entry === 'string' || typeof entry === 'number')
    .map(String)
    .filter((entry) => entry.length > 0);
}

function vmPowerState(raw: Record<string, unknown>): string {
  if (raw.powerState !== undefined && raw.powerState !== null) return String(raw.powerState);
  const instanceView = (raw.instanceView as Record<string, unknown>) ?? {};
  const statuses = Array.isArray(instanceView.statuses) ? instanceView.statuses : [];
  const power = statuses.find((status) => {
    const item = status as Record<string, unknown>;
    return String(item.code ?? '')
      .toLowerCase()
      .startsWith('powerstate/');
  }) as Record<string, unknown> | undefined;
  return String(power?.displayStatus ?? power?.code ?? '');
}

export function normalizeVm(
  raw: Record<string, unknown>,
  policy: VmDisclosurePolicy = { includePowerState: true, includeNetworkIdentifiers: false },
): AzVm {
  const hw = (raw.hardwareProfile as Record<string, unknown>) ?? {};
  const storage = (raw.storageProfile as Record<string, unknown>) ?? {};
  const osDisk = (storage.osDisk as Record<string, unknown>) ?? {};
  const vm: AzVm = {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    location: String(raw.location ?? ''),
    resourceGroup: String(raw.resourceGroup ?? ''),
    vmSize: String(raw.vmSize ?? hw.vmSize ?? ''),
    provisioningState: String(raw.provisioningState ?? ''),
    osType: String(raw.osType ?? osDisk.osType ?? ''),
  };
  if (policy.includePowerState) vm.powerState = vmPowerState(raw);
  if (policy.includeNetworkIdentifiers) {
    vm.publicIps = normalizeStringArray(raw.publicIps);
    vm.fqdns = normalizeStringArray(raw.fqdns);
  }
  return vm;
}
