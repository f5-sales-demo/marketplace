export interface AzSubscription {
  id: string;
  name: string;
  state: string;
  isDefault: boolean;
  tenantId: string;
  user: { name: string; type: string };
}

export interface AzResourceGroup {
  id: string;
  name: string;
  location: string;
  provisioningState: string;
  tags: Record<string, string>;
}

export interface AzResource {
  id: string;
  name: string;
  type: string;
  location: string;
  resourceGroup: string;
  provisioningState: string;
  tags: Record<string, string>;
}

export interface AzVm {
  id: string;
  name: string;
  location: string;
  resourceGroup: string;
  vmSize: string;
  provisioningState: string;
  osType: string;
  powerState?: string;
  publicIps?: string[];
  fqdns?: string[];
}

export interface VmDisclosurePolicy {
  includePowerState: boolean;
  includeNetworkIdentifiers: boolean;
}

export type AzActivityCallerKind = 'user' | 'service_principal' | 'managed_identity' | 'unknown';
export type AzActivityEvidenceType = 'created' | 'modified' | 'unknown';
export type AzActivityConfidence = 'high' | 'medium' | 'none';

export interface AzActivityLogCoverage {
  startTime: string;
  endTime: string;
  lookbackDays: number;
  complete: boolean;
  truncated: boolean;
}

export interface AzActivityLogEvent {
  eventId: string;
  retryGroupId: string;
  eventTime: string;
  resourceId: string;
  scopeType: 'resource_group' | 'exact_resource';
  operation: string;
  operationFamily: 'write' | 'delete' | 'action' | 'unknown';
  status: string;
  callerDisplay: string;
  callerComparison: string;
  callerKind: AzActivityCallerKind;
  evidenceType: AzActivityEvidenceType;
  confidence: AzActivityConfidence;
  reasonCode: string;
}

export interface AzActivityScopeEvidence {
  scope: string;
  evidenceType: AzActivityEvidenceType;
  confidence: AzActivityConfidence;
  reasonCode: string;
}

export interface AzActivityLogResult {
  coverage: AzActivityLogCoverage;
  scopeEvidence: AzActivityScopeEvidence;
  events: AzActivityLogEvent[];
}

export interface PluginInterface {
  typebox: { Type: Record<string, (...args: unknown[]) => unknown> };
  [key: string]: unknown;
}

export interface AzRawResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export const SUBSCRIPTION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const RESOURCE_GROUP_PATTERN = /^[a-zA-Z0-9._()-]+$/;
export const SUBSCRIPTION_NAME_PATTERN = /^[a-zA-Z0-9 ._-]+$/;
export const HELP_PATH_PATTERN = /^[a-z][a-z -]*$/;
export const RESOURCE_TYPE_PATTERN = /^[a-zA-Z0-9./]+$/;
export const TAG_PATTERN = /^[a-zA-Z0-9._-]+(=[a-zA-Z0-9._@: -]*)?$/;
