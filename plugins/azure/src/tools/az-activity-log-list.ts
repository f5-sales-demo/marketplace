import type { AzExecApi } from '../az/exec';
import { detectAzError, parseAzJsonOutput } from '../az/exec';
import { formatActivityLogEvidence } from '../az/formatters';
import type {
  AzActivityLogCoverage,
  AzActivityLogEvent,
  AzActivityLogResult,
  AzActivityScopeEvidence,
  PluginInterface,
} from '../az/types';
import { RESOURCE_GROUP_PATTERN, SUBSCRIPTION_ID_PATTERN, SUBSCRIPTION_NAME_PATTERN } from '../az/types';
import description from '../prompts/az-activity-log-list.md' with { type: 'text' };
import { detectErrorType, errorResult, makeExecApi, textResult } from './shared';

export type ActivityLogStatus = 'succeeded' | 'failed' | 'started' | 'accepted' | 'canceled' | 'all';
export type ActivityLogOperationFamily = 'write' | 'delete' | 'action' | 'all';

export type ActivityLogParams = {
  subscription: string;
  resource_group?: string;
  resource_id?: string;
  caller?: string;
  status?: ActivityLogStatus;
  operation_family?: ActivityLogOperationFamily;
  max_events?: number;
  lookback_days?: number;
};

const DEFAULT_LOOKBACK_DAYS = 89;
const DEFAULT_MAX_EVENTS = 100;
const STATUSES = new Set<ActivityLogStatus>(['succeeded', 'failed', 'started', 'accepted', 'canceled', 'all']);
const OPERATION_FAMILIES = new Set<ActivityLogOperationFamily>(['write', 'delete', 'action', 'all']);
const RESOURCE_ID_PATTERN =
  /^\/subscriptions\/([^/]+)\/resourceGroups\/[^/]+(?:\/providers\/[^/]+\/[^/]+\/[^/]+(?:\/[^/]+\/[^/]+)*)?$/i;
// biome-ignore lint/suspicious/noControlCharactersInRegex: Azure CLI arguments must not contain control bytes.
const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/;
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NETWORK_LITERAL_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$|^[0-9a-f]*:[0-9a-f:]+$/i;

export const ACTIVITY_LOG_PROJECTION =
  '[].{eventId:eventDataId,correlationId:correlationId,eventTimestamp:eventTimestamp,submissionTimestamp:submissionTimestamp,resourceId:resourceId,resourceGroupName:resourceGroupName,resourceType:resourceType.value,operationValue:operationName.value,operationDisplay:operationName.localizedValue,statusValue:status.value,caller:caller,claimUpn:claims.upn,claimAppId:claims.appid,claimAzp:claims.azp,claimManagedIdentity:claims.xms_mirid,resourceMetadataCreationTime:resourceMetadata.createdTime}';

type RawEvent = Record<string, unknown>;
type NormalizedEvent = Omit<AzActivityLogEvent, 'evidenceType' | 'confidence' | 'reasonCode'> & {
  operationDisplay: string;
};

function invalid(message: string) {
  return errorResult(`Error: ${message}`, { tool: 'az_activity_log_list', outcome: 'invalid_input' });
}

function safeString(value: unknown, maxLength = 2048): string {
  if (typeof value !== 'string') return '';
  return value.replace(CONTROL_CHAR_PATTERN, '').slice(0, maxLength);
}

function safeIdentity(value: unknown): string {
  const identity = safeString(value, 320);
  return NETWORK_LITERAL_PATTERN.test(identity) ? '[redacted-network-identifier]' : identity;
}

function isoTime(value: unknown): string {
  const parsed = typeof value === 'string' ? new Date(value) : new Date(Number.NaN);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : '';
}

function operationFamily(value: string): Exclude<ActivityLogOperationFamily, 'all'> | 'unknown' {
  const normalized = value.toLowerCase();
  if (normalized.endsWith('/write') || normalized.endsWith('/create') || normalized.endsWith('/update')) return 'write';
  if (normalized.endsWith('/delete')) return 'delete';
  if (normalized.endsWith('/action')) return 'action';
  return 'unknown';
}

function callerKind(raw: RawEvent, caller: string): AzActivityLogEvent['callerKind'] {
  if (safeString(raw.claimManagedIdentity, 16)) return 'managed_identity';
  if (safeString(raw.claimAppId, 16) || safeString(raw.claimAzp, 16)) return 'service_principal';
  if (safeString(raw.claimUpn, 320) || caller.includes('@')) return 'user';
  if (GUID_PATTERN.test(caller)) return 'unknown';
  return 'unknown';
}

function scopeType(resourceId: string, resourceType: string): AzActivityLogEvent['scopeType'] {
  if (/\/resourcegroups\/[^/]+$/i.test(resourceId) || /\/resourcegroups$/i.test(resourceType)) return 'resource_group';
  return 'exact_resource';
}

function normalizeEvent(raw: RawEvent): NormalizedEvent {
  const callerDisplay = safeIdentity(raw.caller);
  const resourceId = safeString(raw.resourceId);
  const resourceType = safeString(raw.resourceType, 512);
  return {
    eventId: safeString(raw.eventId, 256),
    retryGroupId: safeString(raw.correlationId, 256),
    eventTime: isoTime(raw.eventTimestamp),
    resourceId,
    scopeType: scopeType(resourceId, resourceType),
    operation: safeString(raw.operationValue, 512),
    operationDisplay: safeString(raw.operationDisplay, 512),
    operationFamily: operationFamily(safeString(raw.operationValue, 512)),
    status: safeString(raw.statusValue, 80).toLowerCase(),
    callerDisplay,
    callerComparison: callerDisplay.toLocaleLowerCase('en-US'),
    callerKind: callerKind(raw, callerDisplay),
  };
}

function classifyEvents(normalized: NormalizedEvent[], complete: boolean): AzActivityLogEvent[] {
  const earlierExactResources = new Set<string>();
  return normalized.map((event) => {
    const operation = event.operation.toLowerCase();
    const display = event.operationDisplay.toLowerCase();
    let evidence: Pick<AzActivityLogEvent, 'evidenceType' | 'confidence' | 'reasonCode'>;
    if (!complete) {
      evidence = { evidenceType: 'unknown', confidence: 'none', reasonCode: 'incomplete_coverage' };
    } else if (/\/create$/.test(operation) || (/\bcreate\b/.test(display) && !/create\s+or\s+update/.test(display))) {
      evidence = { evidenceType: 'created', confidence: 'high', reasonCode: 'explicit_create_operation' };
    } else if (/\/update$/.test(operation) || (/\bupdate\b/.test(display) && !/create\s+or\s+update/.test(display))) {
      evidence = { evidenceType: 'modified', confidence: 'high', reasonCode: 'explicit_update_operation' };
    } else if (event.operationFamily === 'write' && event.scopeType === 'exact_resource') {
      const key = event.resourceId.toLocaleLowerCase('en-US');
      evidence = earlierExactResources.has(key)
        ? {
            evidenceType: 'modified',
            confidence: 'medium',
            reasonCode: 'prior_exact_resource_write_in_complete_coverage',
          }
        : { evidenceType: 'unknown', confidence: 'none', reasonCode: 'ambiguous_create_or_update' };
    } else {
      evidence = { evidenceType: 'unknown', confidence: 'none', reasonCode: 'operation_not_attribution_specific' };
    }
    if (event.scopeType === 'exact_resource' && event.operationFamily === 'write') {
      earlierExactResources.add(event.resourceId.toLocaleLowerCase('en-US'));
    }
    const { operationDisplay: _operationDisplay, ...allowlistedEvent } = event;
    return { ...allowlistedEvent, ...evidence };
  });
}

function summarizeScope(
  params: ActivityLogParams,
  events: AzActivityLogEvent[],
  coverage: AzActivityLogCoverage,
  creationTime: string | undefined,
): AzActivityScopeEvidence {
  const scope = params.resource_id ?? params.resource_group ?? '';
  if (!coverage.complete) {
    return { scope, evidenceType: 'unknown', confidence: 'none', reasonCode: 'incomplete_coverage' };
  }
  const created = events.find((event) => event.evidenceType === 'created');
  if (created)
    return { scope, evidenceType: 'created', confidence: created.confidence, reasonCode: created.reasonCode };
  const modified = [...events].reverse().find((event) => event.evidenceType === 'modified');
  if (modified)
    return { scope, evidenceType: 'modified', confidence: modified.confidence, reasonCode: modified.reasonCode };
  if (events.length > 0) {
    return { scope, evidenceType: 'unknown', confidence: 'none', reasonCode: 'ambiguous_create_or_update' };
  }
  if (!creationTime)
    return { scope, evidenceType: 'unknown', confidence: 'none', reasonCode: 'creation_age_unavailable' };
  return {
    scope,
    evidenceType: 'unknown',
    confidence: 'none',
    reasonCode:
      creationTime < coverage.startTime ? 'creation_predates_coverage' : 'no_matching_event_in_complete_coverage',
  };
}

export function validateActivityLogParams(params: ActivityLogParams): string | undefined {
  if (!params.subscription?.trim()) return 'subscription is required.';
  if (!SUBSCRIPTION_ID_PATTERN.test(params.subscription) && !SUBSCRIPTION_NAME_PATTERN.test(params.subscription)) {
    return 'subscription must be a valid subscription name or UUID.';
  }
  if (Boolean(params.resource_group) === Boolean(params.resource_id)) {
    return 'exactly one of resource_group or resource_id is required.';
  }
  if (params.resource_group && !RESOURCE_GROUP_PATTERN.test(params.resource_group)) return 'resource group is invalid.';
  if (params.resource_id) {
    const resourceMatch = params.resource_id.match(RESOURCE_ID_PATTERN);
    if (
      !resourceMatch ||
      !SUBSCRIPTION_ID_PATTERN.test(resourceMatch[1]) ||
      CONTROL_CHAR_PATTERN.test(params.resource_id)
    ) {
      return 'resource ID must be an absolute Azure resource ID.';
    }
    if (
      SUBSCRIPTION_ID_PATTERN.test(params.subscription) &&
      resourceMatch[1].toLowerCase() !== params.subscription.toLowerCase()
    ) {
      return 'resource ID must belong to the requested subscription.';
    }
  }
  if (
    params.caller !== undefined &&
    (!params.caller.trim() || params.caller.length > 320 || CONTROL_CHAR_PATTERN.test(params.caller))
  ) {
    return 'caller must be non-empty and contain no control characters.';
  }
  if (params.status !== undefined && !STATUSES.has(params.status)) return 'status is invalid.';
  if (params.operation_family !== undefined && !OPERATION_FAMILIES.has(params.operation_family)) {
    return 'operation_family is invalid.';
  }
  if (
    params.lookback_days !== undefined &&
    (!Number.isFinite(params.lookback_days) ||
      !Number.isInteger(params.lookback_days) ||
      params.lookback_days < 1 ||
      params.lookback_days > 89)
  ) {
    return 'lookback_days must be an integer from 1 through 89.';
  }
  if (
    params.max_events !== undefined &&
    (!Number.isFinite(params.max_events) ||
      !Number.isInteger(params.max_events) ||
      params.max_events < 1 ||
      params.max_events > 1000)
  ) {
    return 'max_events must be an integer from 1 through 1000.';
  }
}

export function buildActivityLogArgs(params: ActivityLogParams): string[] {
  const lookback = params.lookback_days ?? DEFAULT_LOOKBACK_DAYS;
  const maxEvents = params.max_events ?? DEFAULT_MAX_EVENTS;
  const args = ['monitor', 'activity-log', 'list', '--subscription', params.subscription];
  if (params.resource_group) args.push('--resource-group', params.resource_group);
  if (params.resource_id) args.push('--resource-id', params.resource_id);
  args.push('--offset', `${lookback}d`);
  if (params.caller) args.push('--caller', params.caller);
  const status = params.status ?? 'succeeded';
  if (status !== 'all') args.push('--status', status[0].toUpperCase() + status.slice(1));
  args.push('--max-events', String(maxEvents + 1), '--query', ACTIVITY_LOG_PROJECTION, '--output', 'json');
  return args;
}

export function createAzActivityLogListTool(
  pi: PluginInterface,
  makeApi: (cwd: string) => AzExecApi = makeExecApi,
  now: () => Date = () => new Date(),
) {
  const { Type } = pi.typebox;
  const enumField = (values: string[]) => Type.Union(values.map((value) => Type.Literal(value)));
  const parameters = Type.Object({
    subscription: Type.String({ description: 'Azure subscription name or UUID' }),
    resource_group: Type.Optional(
      Type.String({ description: 'Resource-group scope; mutually exclusive with resource_id' }),
    ),
    resource_id: Type.Optional(
      Type.String({ description: 'Exact Azure resource ID; mutually exclusive with resource_group' }),
    ),
    caller: Type.Optional(Type.String({ description: 'Case-insensitive caller filter' })),
    status: Type.Optional(enumField([...STATUSES])),
    operation_family: Type.Optional(enumField([...OPERATION_FAMILIES])),
    max_events: Type.Optional(Type.Number({ description: 'Maximum returned events, 1 through 1000; default 100' })),
    lookback_days: Type.Optional(Type.Number({ description: 'Relative UTC lookback, 1 through 89 days; default 89' })),
  });

  return {
    name: 'az_activity_log_list',
    label: 'Azure Activity Log Evidence',
    description,
    parameters,
    async execute(
      _toolCallId: string,
      params: ActivityLogParams,
      signal: AbortSignal | undefined,
      _onUpdate: unknown,
      ctx: { cwd: string },
    ) {
      const validation = validateActivityLogParams(params);
      if (validation) return invalid(validation);
      const end = now();
      if (!Number.isFinite(end.getTime())) return invalid('the UTC clock returned an invalid instant.');
      const lookbackDays = params.lookback_days ?? DEFAULT_LOOKBACK_DAYS;
      const maxEvents = params.max_events ?? DEFAULT_MAX_EVENTS;
      const coverageEnd = end.toISOString();
      const coverageStart = new Date(end.getTime() - lookbackDays * 86_400_000).toISOString();
      const api = makeApi(ctx.cwd);
      let result: Awaited<ReturnType<AzExecApi['exec']>>;
      try {
        result = await api.exec('az', buildActivityLogArgs(params), { signal });
      } catch {
        return errorResult('Azure Activity Log query failed.', {
          tool: 'az_activity_log_list',
          outcome: 'execution_failure',
          errorType: 'exec_error',
        });
      }
      if (result.exitCode !== 0) {
        const error = detectAzError(result.stderr || result.stdout, result.exitCode);
        const errorType = detectErrorType(error);
        return errorResult('Azure Activity Log query failed.', {
          tool: 'az_activity_log_list',
          outcome:
            errorType === 'auth_required' || errorType === 'session_expired'
              ? 'authentication_failure'
              : 'execution_failure',
          errorType,
        });
      }
      try {
        const parsed = parseAzJsonOutput<unknown[] | Record<string, unknown>>(result.stdout);
        const rawPayload = Array.isArray(parsed)
          ? parsed
          : typeof parsed === 'object' && parsed !== null && Array.isArray(parsed.value)
            ? parsed.value
            : undefined;
        if (!rawPayload) throw new Error('unexpected Activity Log response shape');
        const rawEvents = rawPayload.filter((item): item is RawEvent => typeof item === 'object' && item !== null);
        const creationTime = rawEvents.map((event) => isoTime(event.resourceMetadataCreationTime)).find(Boolean);
        const requestedFamily = params.operation_family ?? 'write';
        const requestedStatus = params.status ?? 'succeeded';
        const requestedCaller = params.caller?.toLocaleLowerCase('en-US');
        const unique = new Map<string, ReturnType<typeof normalizeEvent>>();
        for (const raw of rawEvents) {
          const event = normalizeEvent(raw);
          if (!event.eventId || !event.eventTime || !event.resourceId) continue;
          if (requestedFamily !== 'all' && event.operationFamily !== requestedFamily) continue;
          if (requestedStatus !== 'all' && event.status !== requestedStatus) continue;
          if (requestedCaller !== undefined && event.callerComparison !== requestedCaller) continue;
          if (!unique.has(event.eventId)) unique.set(event.eventId, event);
        }
        const sorted = [...unique.values()].sort(
          (left, right) => left.eventTime.localeCompare(right.eventTime) || left.eventId.localeCompare(right.eventId),
        );
        const truncated = rawEvents.length > maxEvents || sorted.length > maxEvents;
        const coverage: AzActivityLogCoverage = {
          startTime: coverageStart,
          endTime: coverageEnd,
          lookbackDays,
          complete: !truncated,
          truncated,
        };
        const events = classifyEvents(sorted.slice(0, maxEvents), coverage.complete);
        const scopeEvidence = summarizeScope(params, events, coverage, creationTime);
        const activity: AzActivityLogResult = { coverage, scopeEvidence, events };
        return textResult(formatActivityLogEvidence(activity), {
          tool: 'az_activity_log_list',
          outcome: 'success',
          coverage,
          scopeEvidence,
          events,
        });
      } catch {
        return errorResult('Azure Activity Log returned invalid JSON.', {
          tool: 'az_activity_log_list',
          outcome: 'execution_failure',
        });
      }
    },
  };
}
