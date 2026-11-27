// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun
// plugins/azure/src/az/arguments.ts
var jsonArgs = (args) => [...args, '--output', 'json'];
function accountArgs(params) {
  const args = ['account', params.action === 'list' ? 'list' : 'show'];
  if (params.action !== 'list' && params.subscription) args.push('--subscription', params.subscription);
  return args;
}
function groupArgs(params) {
  const args = params.action === 'show' && params.name ? ['group', 'show', '--name', params.name] : ['group', 'list'];
  if (params.action !== 'show' && params.tag) args.push('--tag', params.tag);
  if (params.subscription) args.push('--subscription', params.subscription);
  return args;
}
function resourceArgs(params) {
  const args = ['resource', 'list', '--resource-group', params.resource_group];
  if (params.subscription) args.push('--subscription', params.subscription);
  if (params.resource_type) args.push('--resource-type', params.resource_type);
  return args;
}
var helpArgs = (path) => [...(path?.trim().split(' ').filter(Boolean) ?? []), '--help'];

// plugins/azure/src/az/exec.ts
class AzExecError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AzExecError';
  }
}

class AzAuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AzAuthError';
  }
}

class AzSessionExpiredError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AzSessionExpiredError';
  }
}

class AzNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AzNotFoundError';
  }
}
function detectAzError(stderr, _exitCode) {
  const lower = stderr.toLowerCase();
  if (lower.includes('az login') || lower.includes('no subscription found')) {
    return new AzAuthError(`${stderr.trim()}
Run: xcsh plugin setup azure`);
  }
  if (lower.includes('aadsts') || lower.includes('token has expired') || lower.includes('not yet valid')) {
    return new AzSessionExpiredError(`${stderr.trim()}
Run: xcsh plugin setup azure`);
  }
  return new AzExecError(stderr);
}
function parseAzJsonOutput(raw) {
  try {
    if (!raw || raw.trim().length === 0) {
      throw new AzExecError('Empty output from az CLI');
    }
    return JSON.parse(raw);
  } catch (err) {
    if (err instanceof AzExecError) throw err;
    throw new AzExecError(`Failed to parse az CLI output: ${err.message}`);
  }
}
async function execAzJson(api, args, signal) {
  const fullArgs = jsonArgs(args);
  const result = await api.exec('az', fullArgs, { signal });
  if (result.exitCode !== 0) {
    throw detectAzError(result.stderr, result.exitCode);
  }
  return parseAzJsonOutput(result.stdout);
}

// plugins/azure/src/az/formatters.ts
function formatSubscriptionTable(subs) {
  if (subs.length === 0) return 'No subscriptions found.';
  const header = '| Name | ID | State | Default | Tenant |';
  const sep = '|------|-----|-------|---------|--------|';
  const rows = subs.map((s) => `| ${s.name} | ${s.id} | ${s.state} | ${s.isDefault ? 'Yes' : 'No'} | ${s.tenantId} |`);
  return [header, sep, ...rows].join(`
`);
}
function formatSubscriptionDetail(sub) {
  return [
    `**Subscription:** ${sub.name}`,
    `**ID:** ${sub.id}`,
    `**State:** ${sub.state}`,
    `**Default:** ${sub.isDefault ? 'Yes' : 'No'}`,
    `**Tenant:** ${sub.tenantId}`,
    `**User:** ${sub.user.name} (${sub.user.type})`,
  ].join(`
`);
}
function formatResourceGroupTable(groups) {
  if (groups.length === 0) return 'No resource groups found.';
  const header = '| Name | Location | State | Tags |';
  const sep = '|------|----------|-------|------|';
  const rows = groups.map((g) => {
    const tags =
      Object.entries(g.tags)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ') || '-';
    return `| ${g.name} | ${g.location} | ${g.provisioningState} | ${tags} |`;
  });
  return [header, sep, ...rows].join(`
`);
}
function formatResourceTable(resources) {
  if (resources.length === 0) return 'No resources found.';
  const header = '| Name | Type | Location | Resource Group | State |';
  const sep = '|------|------|----------|----------------|-------|';
  const rows = resources.map(
    (r) => `| ${r.name} | ${r.type} | ${r.location} | ${r.resourceGroup} | ${r.provisioningState} |`,
  );
  return [header, sep, ...rows].join(`
`);
}
function formatVmTable(vms, policy = { includePowerState: true, includeNetworkIdentifiers: false }) {
  if (vms.length === 0) return 'No VMs found.';
  const headings = ['Name', 'Resource Group', 'Location', 'VM Size', 'OS', 'State'];
  if (policy.includePowerState) headings.push('Power');
  if (policy.includeNetworkIdentifiers) headings.push('Public IPs', 'FQDNs');
  const header = `| ${headings.join(' | ')} |`;
  const sep = `|${headings.map(() => '---').join('|')}|`;
  const rows = vms.map((vm) => {
    const fields = [vm.name, vm.resourceGroup, vm.location, vm.vmSize, vm.osType, vm.provisioningState];
    if (policy.includePowerState) fields.push(vm.powerState || '-');
    if (policy.includeNetworkIdentifiers) {
      fields.push(vm.publicIps?.join(', ') || '-', vm.fqdns?.join(', ') || '-');
    }
    return `| ${fields.join(' | ')} |`;
  });
  return [header, sep, ...rows].join(`
`);
}
function formatActivityLogEvidence(result) {
  const { coverage, scopeEvidence, events } = result;
  const lines = [
    `Activity Log coverage: ${coverage.startTime} through ${coverage.endTime} (${coverage.lookbackDays} days; ${coverage.complete ? 'complete' : 'incomplete'})`,
    `Scope evidence: ${scopeEvidence.evidenceType} (${scopeEvidence.confidence}; ${scopeEvidence.reasonCode})`,
    'Caller evidence is historical operation provenance, not resource ownership.',
  ];
  if (events.length === 0) {
    lines.push('No matching event was observed in the returned coverage.');
    return lines.join(`
`);
  }
  lines.push('| Time (UTC) | Operation | Scope | Caller | Caller kind | Evidence |');
  lines.push('|---|---|---|---|---|---|');
  for (const event of events) {
    lines.push(
      `| ${event.eventTime} | ${event.operation} | ${event.scopeType} | ${event.callerDisplay || '-'} | ${event.callerKind} | ${event.evidenceType} (${event.reasonCode}) |`,
    );
  }
  return lines.join(`
`);
}

// plugins/azure/src/az/types.ts
var SUBSCRIPTION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var RESOURCE_GROUP_PATTERN = /^[a-zA-Z0-9._()-]+$/;
var SUBSCRIPTION_NAME_PATTERN = /^[a-zA-Z0-9 ._-]+$/;
var HELP_PATH_PATTERN = /^[a-z][a-z -]*$/;
var RESOURCE_TYPE_PATTERN = /^[a-zA-Z0-9./]+$/;
var TAG_PATTERN = /^[a-zA-Z0-9._-]+(=[a-zA-Z0-9._@: -]*)?$/;

// plugins/azure/src/prompts/az-activity-log-list.md
var az_activity_log_list_default = `# Azure Activity Log Evidence

Retrieve bounded, read-only Azure Activity Log evidence for exactly one resource group or exact resource.

The default window is the retention-safe relative offset \`89d\`, the default status is \`succeeded\`, and the
default operation family is \`write\`. Results contain only allowlisted normalized fields, UTC coverage,
truncation state, and conservative caller evidence. Claims, request/response bodies, tokens, arbitrary
properties, network identifiers, raw events, and continuation data are never returned.

Caller evidence identifies who was associated with an observed operation; it is historical provenance,
not ownership. A generic create-or-update write is ambiguous. Empty output means only that no matching event
was observed in the returned coverage. Use this tool, never generic \`az_exec\` or a synthesized absolute start
date, for Customer Edge Activity Log attribution.
`;

// plugins/azure/src/tools/shared.ts
function textResult(text, details) {
  return { content: [{ type: 'text', text }], details };
}
function errorResult(text, details) {
  return { content: [{ type: 'text', text }], isError: true, details };
}
function detectErrorType(err) {
  if (err instanceof AzAuthError) return 'auth_required';
  if (err instanceof AzSessionExpiredError) return 'session_expired';
  if (err instanceof AzNotFoundError) return 'not_found';
  return 'exec_error';
}
function makeExecApi(cwd) {
  return {
    async exec(command, args, options) {
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
function normalizeSubscription(raw) {
  const user = raw.user ?? {};
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    state: String(raw.state ?? ''),
    isDefault: Boolean(raw.isDefault),
    tenantId: String(raw.tenantId ?? ''),
    user: { name: String(user.name ?? ''), type: String(user.type ?? '') },
  };
}
function normalizeResourceGroup(raw) {
  const props = raw.properties ?? {};
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    location: String(raw.location ?? ''),
    provisioningState: String(props.provisioningState ?? raw.provisioningState ?? ''),
    tags: raw.tags ?? {},
  };
}
function normalizeResource(raw) {
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    type: String(raw.type ?? ''),
    location: String(raw.location ?? ''),
    resourceGroup: String(raw.resourceGroup ?? ''),
    provisioningState: String(raw.provisioningState ?? ''),
    tags: raw.tags ?? {},
  };
}
function normalizeStringArray(value) {
  const values = Array.isArray(value) ? value.flat(Infinity) : [value];
  return values
    .filter((entry) => typeof entry === 'string' || typeof entry === 'number')
    .map(String)
    .filter((entry) => entry.length > 0);
}
function vmPowerState(raw) {
  if (raw.powerState !== undefined && raw.powerState !== null) return String(raw.powerState);
  const instanceView = raw.instanceView ?? {};
  const statuses = Array.isArray(instanceView.statuses) ? instanceView.statuses : [];
  const power = statuses.find((status) => {
    const item = status;
    return String(item.code ?? '')
      .toLowerCase()
      .startsWith('powerstate/');
  });
  return String(power?.displayStatus ?? power?.code ?? '');
}
function normalizeVm(raw, policy = { includePowerState: true, includeNetworkIdentifiers: false }) {
  const hw = raw.hardwareProfile ?? {};
  const storage = raw.storageProfile ?? {};
  const osDisk = storage.osDisk ?? {};
  const vm = {
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

// plugins/azure/src/tools/az-activity-log-list.ts
var DEFAULT_LOOKBACK_DAYS = 89;
var DEFAULT_MAX_EVENTS = 100;
var STATUSES = new Set(['succeeded', 'failed', 'started', 'accepted', 'canceled', 'all']);
var OPERATION_FAMILIES = new Set(['write', 'delete', 'action', 'all']);
var RESOURCE_ID_PATTERN =
  /^\/subscriptions\/([^/]+)\/resourceGroups\/[^/]+(?:\/providers\/[^/]+\/[^/]+\/[^/]+(?:\/[^/]+\/[^/]+)*)?$/i;
var CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/;
var GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var NETWORK_LITERAL_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$|^[0-9a-f]*:[0-9a-f:]+$/i;
var ACTIVITY_LOG_PROJECTION =
  '[].{eventId:eventDataId,correlationId:correlationId,eventTimestamp:eventTimestamp,submissionTimestamp:submissionTimestamp,resourceId:resourceId,resourceGroupName:resourceGroupName,resourceType:resourceType.value,operationValue:operationName.value,operationDisplay:operationName.localizedValue,statusValue:status.value,caller:caller,claimUpn:claims.upn,claimAppId:claims.appid,claimAzp:claims.azp,claimManagedIdentity:claims.xms_mirid,resourceMetadataCreationTime:resourceMetadata.createdTime}';
function invalid(message) {
  return errorResult(`Error: ${message}`, { tool: 'az_activity_log_list', outcome: 'invalid_input' });
}
function safeString(value, maxLength = 2048) {
  if (typeof value !== 'string') return '';
  return value.replace(CONTROL_CHAR_PATTERN, '').slice(0, maxLength);
}
function safeIdentity(value) {
  const identity = safeString(value, 320);
  return NETWORK_LITERAL_PATTERN.test(identity) ? '[redacted-network-identifier]' : identity;
}
function isoTime(value) {
  const parsed = typeof value === 'string' ? new Date(value) : new Date(Number.NaN);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : '';
}
function operationFamily(value) {
  const normalized = value.toLowerCase();
  if (normalized.endsWith('/write') || normalized.endsWith('/create') || normalized.endsWith('/update')) return 'write';
  if (normalized.endsWith('/delete')) return 'delete';
  if (normalized.endsWith('/action')) return 'action';
  return 'unknown';
}
function callerKind(raw, caller) {
  if (safeString(raw.claimManagedIdentity, 16)) return 'managed_identity';
  if (safeString(raw.claimAppId, 16) || safeString(raw.claimAzp, 16)) return 'service_principal';
  if (safeString(raw.claimUpn, 320) || caller.includes('@')) return 'user';
  if (GUID_PATTERN.test(caller)) return 'unknown';
  return 'unknown';
}
function scopeType(resourceId, resourceType) {
  if (/\/resourcegroups\/[^/]+$/i.test(resourceId) || /\/resourcegroups$/i.test(resourceType)) return 'resource_group';
  return 'exact_resource';
}
function normalizeEvent(raw) {
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
function classifyEvents(normalized, complete) {
  const earlierExactResources = new Set();
  return normalized.map((event) => {
    const operation = event.operation.toLowerCase();
    const display = event.operationDisplay.toLowerCase();
    let evidence;
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
function summarizeScope(params, events, coverage, creationTime) {
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
function normalizeActivityLogPayload2(params, rawPayload, end) {
  const lookbackDays = params.lookback_days ?? DEFAULT_LOOKBACK_DAYS;
  const maxEvents = params.max_events ?? DEFAULT_MAX_EVENTS;
  const rawEvents = rawPayload.filter((item) => typeof item === 'object' && item !== null);
  const creationTime = rawEvents.map((event) => isoTime(event.resourceMetadataCreationTime)).find(Boolean);
  const requestedFamily = params.operation_family ?? 'write';
  const requestedStatus = params.status ?? 'succeeded';
  const requestedCaller = params.caller?.toLocaleLowerCase('en-US');
  const unique = new Map();
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
  const coverage = {
    startTime: new Date(end.getTime() - lookbackDays * 86400000).toISOString(),
    endTime: end.toISOString(),
    lookbackDays,
    complete: !truncated,
    truncated,
  };
  const events = classifyEvents(sorted.slice(0, maxEvents), coverage.complete);
  return { coverage, scopeEvidence: summarizeScope(params, events, coverage, creationTime), events };
}
function validateActivityLogParams(params) {
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
function buildActivityLogArgs2(params) {
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
function createAzActivityLogListTool2(pi, makeApi = makeExecApi, now = () => new Date()) {
  const { Type } = pi.typebox;
  const enumField = (values) => Type.Union(values.map((value) => Type.Literal(value)));
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
    description: az_activity_log_list_default,
    parameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const validation = validateActivityLogParams(params);
      if (validation) return invalid(validation);
      const end = now();
      if (!Number.isFinite(end.getTime())) return invalid('the UTC clock returned an invalid instant.');
      const api = makeApi(ctx.cwd);
      let result;
      try {
        result = await api.exec('az', buildActivityLogArgs2(params), { signal });
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
        const parsed = parseAzJsonOutput(result.stdout);
        const rawPayload = Array.isArray(parsed)
          ? parsed
          : typeof parsed === 'object' && parsed !== null && Array.isArray(parsed.value)
            ? parsed.value
            : undefined;
        if (!rawPayload) throw new Error('unexpected Activity Log response shape');
        const activity = normalizeActivityLogPayload2(params, rawPayload, end);
        const { coverage, scopeEvidence, events } = activity;
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

// plugins/azure/src/prompts/az-exec.md
var az_exec_default =
  '# Execute Azure CLI Commands\n\nExecute any `az` CLI subcommand directly.\n\nThis is the general-purpose tool for running az commands that are not covered by the typed tools (az_account, az_group, az_resource, az_vm). Use typed tools when available \u2014 they validate inputs and return structured data.\n\n## Usage\n\nPass the subcommand and flags as an array of arguments. Do NOT include `az` itself \u2014 it is prepended automatically.\n\n**Example:** To run `az webapp list --resource-group myRG`:\n\n```json\n{ "args": ["webapp", "list", "--resource-group", "myRG"] }\n```\n\n## Safety\n\n- Arguments are passed as an array directly to the `az` binary \u2014 **no shell** is involved, so shell metacharacters are inert and never filtered. Any valid `az` invocation runs, including full JMESPath `--query` syntax.\n- **Read-only by default:** mutating verbs (`create`, `delete`, `update`, `set`, `purge`, `start`, `stop`, `restart`, `scale`, `restore`, \u2026) are blocked. Run write/destructive operations through an explicitly confirmed path (delegate to the `cli-operator` agent), not `az_exec`.\n- Output is capped to prevent context overflow.\n\n## Querying with `--query` (JMESPath)\n\nThe full JMESPath grammar is supported \u2014 pass the expression as a single argument value. Common patterns:\n\n- Field projection: `--query "[].{name:name, location:location}"`\n- Filter: `--query "[?location==\'eastus\']"`\n- Substring match: `--query "[?contains(name, \'prod\')]"`\n- Backtick literals (numbers/booleans/quoted enums): `` --query "[?powerState==`VM running`]" ``\n- OR / AND / NOT: `--query "[?a==\'x\' || b==\'y\']"`, `--query "[?a && b]"`, `--query "[?!disabled]"`\n- Pipe to post-process a projection: `--query "[].name | [0]"`\n\nAll of the above \u2014 including `||`, `|`, and backticks \u2014 are accepted verbatim.\n\nFor `az graph query`, use the typed `az_resource_graph_query` tool. Resource Graph KQL belongs in\nits `query` field and maps to `--graph-query`; global `--query` remains only a JMESPath output\nprojection. An unambiguous `az graph query --query <KQL>` mix-up is rejected before execution.\n\n## Common Subcommands Not Covered by Typed Tools\n\n- `az webapp list` / `az webapp show` \u2014 App Service\n- `az aks list` / `az aks show` \u2014 Kubernetes Service\n- `az storage account list` \u2014 Storage accounts\n- `az network vnet list` \u2014 Virtual Networks\n- `az network nsg list` \u2014 Network Security Groups\n- `az sql server list` \u2014 SQL servers\n- `az keyvault list` \u2014 Key Vaults\n- `az container list` \u2014 Container Instances\n- `az acr list` \u2014 Container Registries\n- `az functionapp list` \u2014 Function Apps\n\n## Tips\n\n- `--output json` is added automatically unless you pass your own `--output`/`-o` (e.g. `-o table`, `-o tsv`), which is respected\n- Use `--subscription NAME_OR_ID` to target a specific subscription\n- Use `--resource-group NAME` to scope to a resource group\n- Use `az_help` tool first if unsure about available flags\n';

// plugins/azure/src/tools/az-exec.ts
var MAX_OUTPUT_LENGTH = 50000;
var CONTROL_CHAR_PATTERN2 = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;
function hasControlChars(arg) {
  return CONTROL_CHAR_PATTERN2.test(arg);
}
function hasResourceGraphQueryFlagMisuse(args) {
  const graphIndex = args.findIndex((arg, index) => arg === 'graph' && args[index + 1] === 'query');
  if (
    graphIndex < 0 ||
    args.some(
      (arg) => arg === '-q' || arg.startsWith('-q=') || arg === '--graph-query' || arg.startsWith('--graph-query='),
    )
  ) {
    return false;
  }
  const queryIndex = args.indexOf('--query');
  const inlineQuery = args.find((arg) => arg.startsWith('--query='))?.slice('--query='.length);
  const candidate = queryIndex >= 0 ? args[queryIndex + 1] : inlineQuery;
  if (!candidate) return false;
  return /\b(?:Resources|ResourceContainers)\b[\s\S]*\|[\s\S]*\b(?:where|project|extend|summarize|take|limit|join)\b|=~/i.test(
    candidate,
  );
}
var MUTATING_VERBS = new Set([
  'create',
  'new',
  'delete',
  'remove',
  'purge',
  'update',
  'set',
  'add',
  'start',
  'stop',
  'restart',
  'deallocate',
  'redeploy',
  'reset',
  'regenerate',
  'renew',
  'rotate',
  'move',
  'invoke',
  'execute',
  'enable',
  'disable',
  'attach',
  'detach',
  'approve',
  'reject',
  'cancel',
  'revoke',
  'grant',
  'assign',
  'unassign',
  'lock',
  'unlock',
  'register',
  'unregister',
  'scale',
  'migrate',
  'failover',
  'restore',
  'deploy',
  'install',
  'uninstall',
  'upgrade',
  'publish',
  'import',
  'upload',
  'activate',
  'deactivate',
  'associate',
  'disassociate',
  'generate',
]);
function getPositionals(args) {
  return args.filter((arg) => !arg.startsWith('-'));
}
function findMutatingVerb(args) {
  return getPositionals(args).find((tok) => MUTATING_VERBS.has(tok)) ?? null;
}
function buildAzArgs2(args) {
  const hasOutput = args.some(
    (a) => a === '--output' || a === '-o' || a.startsWith('--output=') || a.startsWith('-o='),
  );
  return hasOutput ? [...args] : [...args, '--output', 'json'];
}
function createAzExecTool2(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  const parameters = Type.Object({
    args: Type.Array(Type.String({ description: 'Individual argument (do NOT include "az" itself)' }), {
      description: 'Command arguments as array, e.g. ["webapp", "list", "--resource-group", "myRG"]',
    }),
  });
  return {
    name: 'az_exec',
    label: 'Azure CLI Execute',
    description: az_exec_default,
    parameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const base = { tool: 'az_exec' };
      if (!params.args || params.args.length === 0) {
        return errorResult('Error: args array must not be empty. Provide az subcommand and flags.', base);
      }
      for (const arg of params.args) {
        if (hasControlChars(arg)) {
          return errorResult(`Error: argument contains a control character and cannot be passed to az: "${arg}"`, base);
        }
      }
      if (hasResourceGraphQueryFlagMisuse(params.args)) {
        return errorResult(
          'Error: Resource Graph KQL must use -q/--graph-query. Global --query is reserved for JMESPath output projection; use az_resource_graph_query for typed execution.',
          base,
        );
      }
      const mutatingVerb = findMutatingVerb(params.args);
      if (mutatingVerb !== null) {
        return errorResult(
          `Error: "${mutatingVerb}" is a mutating operation. az_exec is read-only by default. ` +
            'Run write/destructive operations through an explicitly confirmed path (delegate to the ' +
            'azure:cli-operator agent) rather than az_exec.',
          base,
        );
      }
      const api = makeApi(ctx.cwd);
      const args = buildAzArgs2(params.args);
      try {
        const result = await api.exec('az', args, { signal });
        if (result.exitCode !== 0) {
          return errorResult(`az command failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`, {
            ...base,
            errorType: 'exec_error',
          });
        }
        let output = result.stdout;
        const fullOutput = output;
        if (output.length > MAX_OUTPUT_LENGTH) {
          output = `${output.slice(0, MAX_OUTPUT_LENGTH)}

[Output truncated at ${MAX_OUTPUT_LENGTH} characters]`;
        }
        return textResult(output, { ...base, fullOutput, modelPreviewTruncated: output !== fullOutput });
      } catch (err) {
        return errorResult(`Error: ${err instanceof Error ? err.message : String(err)}`, {
          ...base,
          errorType: detectErrorType(err),
        });
      }
    },
  };
}

// plugins/azure/src/az/resource-graph.ts
var RESOURCE_GRAPH_REQUIRED_FLAGS = [
  '--graph-query',
  '--subscriptions',
  '--first',
  '--skip',
  '--skip-token',
  '--allow-partial-scopes',
];

// plugins/azure/src/prompts/az-resource-graph-query.md
var az_resource_graph_query_default =
  '# Query Azure Resource Graph\n\nRun a read-only Resource Graph query with typed paging and subscription scope.\n\n- Put KQL in `query`; it is passed only to `--graph-query`.\n- Put an optional JMESPath result transform in `output_projection`; it is passed only to global `--query`.\n- Use `subscriptions` for individual Azure subscription UUIDs.\n- Use `first` with either `skip` or `skip_token`; never combine `skip` and `skip_token`.\n- Set `allow_partial_scopes` only when partial accessible-scope results are acceptable.\n\nThe tool disables dynamic extension installation. A setup-required result must be handled through\n`xcsh plugin setup azure`, which reviews the exact installation and authentication plan before execution.\n';

// plugins/azure/src/tools/az-resource-graph-query.ts
var RESOURCE_GRAPH_ENV2 = { AZURE_EXTENSION_USE_DYNAMIC_INSTALL: 'no' };
var CONTROL_CHAR_PATTERN3 = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
function invalid2(message) {
  return errorResult(`Error: ${message}`, { tool: 'az_resource_graph_query', outcome: 'invalid_input' });
}
function retryAfter(stderr) {
  const match = stderr.match(/retry[- ]after(?:\s*[:=]\s*|\s+)(\d+)/i);
  return match ? Number(match[1]) : undefined;
}
function inaccessibleScopeCount(stderr) {
  const identifiers = stderr.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi);
  return identifiers?.length ? new Set(identifiers.map((identifier) => identifier.toLowerCase())).size : undefined;
}
function isTruncated(value) {
  return value === true || value === 'true';
}
function validateResourceGraphParams(params) {
  if (!params.query?.trim()) return 'query is required.';
  for (const [name, value] of [
    ['query', params.query],
    ['skip_token', params.skip_token],
    ['output_projection', params.output_projection],
  ]) {
    if (value !== undefined && CONTROL_CHAR_PATTERN3.test(value)) return `${name} contains a control character.`;
  }
  if (params.first !== undefined && (!Number.isInteger(params.first) || params.first < 1 || params.first > 1000)) {
    return 'first must be an integer from 1 through 1000.';
  }
  if (params.skip !== undefined && (!Number.isInteger(params.skip) || params.skip < 0)) {
    return 'skip must be a non-negative integer.';
  }
  if (params.skip !== undefined && params.skip_token !== undefined)
    return 'skip and skip_token cannot be used together.';
  if (params.subscriptions?.some((subscription) => !SUBSCRIPTION_ID_PATTERN.test(subscription))) {
    return 'every subscription must be a UUID subscription ID.';
  }
  if (params.subscriptions?.length === 0) return 'subscriptions must contain at least one subscription ID.';
}
function buildResourceGraphArgs2(params) {
  const args = ['graph', 'query', '--graph-query', params.query];
  if (params.subscriptions?.length) args.push('--subscriptions', ...params.subscriptions);
  if (params.first !== undefined) args.push('--first', String(params.first));
  if (params.skip !== undefined) args.push('--skip', String(params.skip));
  if (params.skip_token !== undefined) args.push('--skip-token', params.skip_token);
  if (params.output_projection !== undefined) args.push('--query', params.output_projection);
  if (params.allow_partial_scopes === true) args.push('--allow-partial-scopes');
  args.push('--output', 'json');
  return args;
}
function createAzResourceGraphQueryTool2(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  const parameters = Type.Object({
    query: Type.String({ description: 'Resource Graph KQL; passed only to --graph-query' }),
    subscriptions: Type.Optional(Type.Array(Type.String({ description: 'Azure subscription UUID' }))),
    first: Type.Optional(Type.Number({ description: 'Maximum records, 1 through 1000' })),
    skip: Type.Optional(Type.Number({ description: 'Non-negative record offset; incompatible with skip_token' })),
    skip_token: Type.Optional(Type.String({ description: 'Continuation token; incompatible with skip' })),
    output_projection: Type.Optional(
      Type.String({ description: 'JMESPath output projection; passed only to --query' }),
    ),
    allow_partial_scopes: Type.Optional(Type.Boolean({ description: 'Allow results from accessible scopes' })),
  });
  return {
    name: 'az_resource_graph_query',
    label: 'Azure Resource Graph Query',
    description: az_resource_graph_query_default,
    parameters,
    async execute(_id, params, signal, _update, ctx) {
      const validation = validateResourceGraphParams(params);
      if (validation) return invalid2(validation);
      const api = makeApi(ctx.cwd);
      const options = { signal, env: RESOURCE_GRAPH_ENV2 };
      const extension = await api.exec(
        'az',
        ['extension', 'show', '--name', 'resource-graph', '--output', 'json'],
        options,
      );
      if (extension.exitCode !== 0) {
        return errorResult('Azure Resource Graph is not installed. Run: xcsh plugin setup azure', {
          tool: 'az_resource_graph_query',
          outcome: 'setup_required',
        });
      }
      let extensionInfo;
      try {
        const parsed = parseAzJsonOutput(extension.stdout);
        extensionInfo = { name: String(parsed.name ?? ''), version: String(parsed.version ?? '') };
        if (extensionInfo.name !== 'resource-graph' || !extensionInfo.version)
          throw new Error('invalid extension identity');
      } catch {
        return errorResult(
          'The installed Resource Graph extension could not be identified. Run: xcsh plugin setup azure',
          {
            tool: 'az_resource_graph_query',
            outcome: 'unsupported_extension',
          },
        );
      }
      const help = await api.exec('az', ['graph', 'query', '--help'], options);
      const missingFlags = RESOURCE_GRAPH_REQUIRED_FLAGS.filter(
        (flag) =>
          !`${help.stdout}
${help.stderr}`.includes(flag),
      );
      if (help.exitCode !== 0 || missingFlags.length > 0) {
        return errorResult(
          'The installed Resource Graph extension lacks required query capabilities. Run: xcsh plugin setup azure',
          {
            tool: 'az_resource_graph_query',
            outcome: 'unsupported_extension',
            extension: extensionInfo,
            missingFlags,
          },
        );
      }
      const result = await api.exec('az', buildResourceGraphArgs2(params), options);
      if (result.exitCode !== 0) {
        const error = detectAzError(result.stderr || result.stdout, result.exitCode);
        const throttled = /throttl|too many requests|\b429\b/i.test(`${result.stderr}
${result.stdout}`);
        const errorType = detectErrorType(error);
        return errorResult(
          throttled
            ? 'Azure Resource Graph throttled the request. Retry after the advised delay.'
            : 'Azure Resource Graph query failed.',
          {
            tool: 'az_resource_graph_query',
            outcome: throttled
              ? 'throttled'
              : errorType === 'auth_required' || errorType === 'session_expired'
                ? 'authentication_failure'
                : 'execution_failure',
            errorType,
            ...(throttled && retryAfter(result.stderr) !== undefined
              ? { retryAfterSeconds: retryAfter(result.stderr) }
              : {}),
          },
        );
      }
      try {
        const payload = parseAzJsonOutput(result.stdout);
        const envelope = Array.isArray(payload) ? { data: payload } : payload;
        const data = Array.isArray(envelope.data) ? envelope.data : [];
        const partial = /partial scope|inaccessible scope|not authorized for all/i.test(result.stderr);
        const rawSkipToken = envelope.skip_token ?? envelope.skipToken;
        const skipToken = typeof rawSkipToken === 'string' ? rawSkipToken : undefined;
        const totalRecordsValue = envelope.total_records ?? envelope.totalRecords;
        const count = typeof envelope.count === 'number' ? envelope.count : data.length;
        const totalRecords = typeof totalRecordsValue === 'number' ? totalRecordsValue : count;
        const truncatedMarker = envelope.result_truncated ?? envelope.resultTruncated;
        return textResult(JSON.stringify(data), {
          tool: 'az_resource_graph_query',
          outcome: partial ? 'partial_scope' : 'success',
          data,
          count,
          totalRecords,
          truncated: isTruncated(truncatedMarker) || skipToken !== undefined || totalRecords > count,
          ...(skipToken ? { skipToken } : {}),
          ...(partial && inaccessibleScopeCount(result.stderr) !== undefined
            ? { inaccessibleScopeCount: inaccessibleScopeCount(result.stderr) }
            : {}),
          extension: extensionInfo,
        });
      } catch {
        return errorResult('Azure Resource Graph returned invalid JSON.', {
          tool: 'az_resource_graph_query',
          outcome: 'execution_failure',
        });
      }
    },
  };
}

// plugins/azure/src/prompts/az-vm-list.md
var az_vm_list_default =
  '# List Azure virtual machines\n\nUse `az vm list`.\n\n## Usage\n\n```json\n{\n  "resource_group": "optional-name",\n  "subscription": "optional-name-or-id",\n  "include_power_state": true,\n  "include_network_identifiers": false\n}\n```\n\n## Flags\n\n| Parameter | Description |\n| --- | --- |\n| `resource_group` | Filter by resource group |\n| `subscription` | Name or ID of subscription |\n| `include_power_state` | Include runtime state. Defaults to `true` and may require additional Azure API calls. |\n| `include_network_identifiers` | Include public IP addresses and FQDNs. Defaults to `false`; enable only for an explicit endpoint request. |\n\n## Output Fields (JSON)\n\nThe result always includes:\n\n- `id` \u2014 Full resource ID\n- `name` \u2014 VM name\n- `location` \u2014 Azure region\n- `resourceGroup` \u2014 Parent resource group\n- `vmSize` \u2014 VM size (for example, Standard_D2s_v5)\n- `osType` \u2014 Linux or Windows\n- `provisioningState` \u2014 Succeeded, Failed, etc.\n\nWith `include_power_state` enabled (the default):\n\n- `powerState` \u2014 VM running, VM deallocated, VM stopped, etc.\n\nOnly with `include_network_identifiers: true`:\n\n- `publicIps` \u2014 Public IP addresses as an array\n- `fqdns` \u2014 Fully qualified domain names as an array\n\n## Common VM Operations\n\n- `az vm show --name NAME --resource-group RG` \u2014 Show single VM\n- `az vm start --name NAME --resource-group RG` \u2014 Start VM\n- `az vm stop --name NAME --resource-group RG` \u2014 Stop VM\n- `az vm deallocate --name NAME --resource-group RG` \u2014 Deallocate (stop billing)\n- `az vm restart --name NAME --resource-group RG` \u2014 Restart VM\n- `az vm list-ip-addresses --name NAME --resource-group RG` \u2014 Get IPs\n- `az vm list-sizes --location LOCATION` \u2014 List available sizes\n- `az vm open-port --name NAME --resource-group RG --port PORT` \u2014 Open port\n\n## Notes\n\nWithout `resource_group`, the tool lists all VMs in the subscription. Runtime state and endpoint\nlookups may require additional Azure API calls. Network identifiers are excluded from both text and\nstructured results unless `include_network_identifiers` is explicitly true.\n';

// plugins/azure/src/tools/az-vm-list.ts
var BASE_VM_FIELDS = [
  'id:id',
  'name:name',
  'location:location',
  'resourceGroup:resourceGroup',
  'vmSize:hardwareProfile.vmSize',
  'provisioningState:provisioningState',
  'osType:storageProfile.osDisk.osType',
];
function vmListProjection(includePowerState, includeNetworkIdentifiers) {
  const fields = [...BASE_VM_FIELDS];
  if (includePowerState) fields.push('powerState:powerState');
  if (includeNetworkIdentifiers) fields.push('publicIps:to_array(publicIps)', 'fqdns:to_array(fqdns)');
  return `[].{${fields.join(',')}}`;
}
function buildVmArgs2(params) {
  const args = ['vm', 'list'];
  if (params.resource_group) args.push('--resource-group', params.resource_group);
  if (params.subscription) args.push('--subscription', params.subscription);
  const power = params.include_power_state ?? true;
  const network = params.include_network_identifiers === true;
  if (power || network) args.push('--show-details');
  args.push('--query', vmListProjection(power, network));
  return args;
}
function createAzVmListTool2(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  const parameters = Type.Object({
    resource_group: Type.Optional(Type.String({ description: 'Filter by resource group' })),
    subscription: Type.Optional(Type.String({ description: 'Subscription name or ID' })),
    include_power_state: Type.Optional(Type.Boolean({ description: 'Include VM runtime power state (default: true)' })),
    include_network_identifiers: Type.Optional(
      Type.Boolean({
        description: 'Include public IP addresses and FQDNs only when explicitly requested (default: false)',
      }),
    ),
  });
  return {
    name: 'az_vm_list',
    label: 'Azure Virtual Machines',
    description: az_vm_list_default,
    parameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const base = { tool: 'az_vm_list' };
      if (params.resource_group && !RESOURCE_GROUP_PATTERN.test(params.resource_group)) {
        return errorResult(
          `Error: invalid resource group "${params.resource_group}". Only alphanumeric characters, periods, underscores, hyphens, and parentheses are allowed.`,
          base,
        );
      }
      if (params.subscription) {
        const isUuid = SUBSCRIPTION_ID_PATTERN.test(params.subscription);
        const isName = SUBSCRIPTION_NAME_PATTERN.test(params.subscription);
        if (!isUuid && !isName) {
          return errorResult(`Error: invalid subscription "${params.subscription}".`, base);
        }
      }
      const api = makeApi(ctx.cwd);
      const policy = {
        includePowerState: params.include_power_state ?? true,
        includeNetworkIdentifiers: params.include_network_identifiers === true,
      };
      const args = buildVmArgs2(params);
      try {
        const raw = await execAzJson(api, args, signal);
        const vms = raw.map((vm) => normalizeVm(vm, policy));
        return textResult(formatVmTable(vms, policy), { ...base, vms });
      } catch (err) {
        return errorResult(`Error: ${err instanceof Error ? err.message : String(err)}`, {
          ...base,
          errorType: detectErrorType(err),
        });
      }
    },
  };
}

export {
  accountArgs,
  buildActivityLogArgs2,
  buildAzArgs2,
  buildResourceGraphArgs2,
  buildVmArgs2,
  createAzActivityLogListTool2,
  createAzExecTool2,
  createAzResourceGraphQueryTool2,
  createAzVmListTool2,
  detectAzError,
  detectErrorType,
  errorResult,
  execAzJson,
  formatResourceGroupTable,
  formatResourceTable,
  formatSubscriptionDetail,
  formatSubscriptionTable,
  groupArgs,
  HELP_PATH_PATTERN,
  helpArgs,
  jsonArgs,
  makeExecApi,
  normalizeActivityLogPayload2,
  normalizeResource,
  normalizeResourceGroup,
  normalizeSubscription,
  parseAzJsonOutput,
  RESOURCE_GRAPH_ENV2,
  RESOURCE_GRAPH_REQUIRED_FLAGS,
  RESOURCE_GROUP_PATTERN,
  RESOURCE_TYPE_PATTERN,
  resourceArgs,
  SUBSCRIPTION_ID_PATTERN,
  SUBSCRIPTION_NAME_PATTERN,
  TAG_PATTERN,
  textResult,
};
