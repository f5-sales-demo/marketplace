// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun
var __esm = (fn, res, err) => () => {
  if (fn)
    try {
      res = fn((fn = 0));
    } catch (e) {
      err = [e];
    }
  if (err) throw err[0];
  return res;
};

// plugins/azure/src/az/arguments.ts
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
var jsonArgs = (args) => [...args, '--output', 'json'],
  helpArgs = (path) => [...(path?.trim().split(' ').filter(Boolean) ?? []), '--help'];

// plugins/azure/src/az/exec.ts
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
var AzExecError, AzAuthError, AzSessionExpiredError, AzNotFoundError;
var init_exec = __esm(() => {
  AzExecError = class AzExecError extends Error {
    constructor(message) {
      super(message);
      this.name = 'AzExecError';
    }
  };
  AzAuthError = class AzAuthError extends Error {
    constructor(message) {
      super(message);
      this.name = 'AzAuthError';
    }
  };
  AzSessionExpiredError = class AzSessionExpiredError extends Error {
    constructor(message) {
      super(message);
      this.name = 'AzSessionExpiredError';
    }
  };
  AzNotFoundError = class AzNotFoundError extends Error {
    constructor(message) {
      super(message);
      this.name = 'AzNotFoundError';
    }
  };
});

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
var SUBSCRIPTION_ID_PATTERN,
  RESOURCE_GROUP_PATTERN,
  SUBSCRIPTION_NAME_PATTERN,
  HELP_PATH_PATTERN,
  RESOURCE_TYPE_PATTERN,
  TAG_PATTERN;
var init_types = __esm(() => {
  SUBSCRIPTION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  RESOURCE_GROUP_PATTERN = /^[a-zA-Z0-9._()-]+$/;
  SUBSCRIPTION_NAME_PATTERN = /^[a-zA-Z0-9 ._-]+$/;
  HELP_PATH_PATTERN = /^[a-z][a-z -]*$/;
  RESOURCE_TYPE_PATTERN = /^[a-zA-Z0-9./]+$/;
  TAG_PATTERN = /^[a-zA-Z0-9._-]+(=[a-zA-Z0-9._@: -]*)?$/;
});

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
var init_az_activity_log_list = () => {};

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
var init_shared = __esm(() => {
  init_exec();
});

// plugins/azure/src/tools/az-activity-log-list.ts
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
function normalizeActivityLogPayload(params, rawPayload, end) {
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
function buildActivityLogArgs(params) {
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
function createAzActivityLogListTool(pi, makeApi = makeExecApi, now = () => new Date()) {
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
        const parsed = parseAzJsonOutput(result.stdout);
        const rawPayload = Array.isArray(parsed)
          ? parsed
          : typeof parsed === 'object' && parsed !== null && Array.isArray(parsed.value)
            ? parsed.value
            : undefined;
        if (!rawPayload) throw new Error('unexpected Activity Log response shape');
        const activity = normalizeActivityLogPayload(params, rawPayload, end);
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
var DEFAULT_LOOKBACK_DAYS = 89,
  DEFAULT_MAX_EVENTS = 100,
  STATUSES,
  OPERATION_FAMILIES,
  RESOURCE_ID_PATTERN,
  CONTROL_CHAR_PATTERN,
  GUID_PATTERN,
  NETWORK_LITERAL_PATTERN,
  ACTIVITY_LOG_PROJECTION =
    '[].{eventId:eventDataId,correlationId:correlationId,eventTimestamp:eventTimestamp,submissionTimestamp:submissionTimestamp,resourceId:resourceId,resourceGroupName:resourceGroupName,resourceType:resourceType.value,operationValue:operationName.value,operationDisplay:operationName.localizedValue,statusValue:status.value,caller:caller,claimUpn:claims.upn,claimAppId:claims.appid,claimAzp:claims.azp,claimManagedIdentity:claims.xms_mirid,resourceMetadataCreationTime:resourceMetadata.createdTime}';
var init_az_activity_log_list2 = __esm(() => {
  init_exec();
  init_types();
  init_az_activity_log_list();
  init_shared();
  STATUSES = new Set(['succeeded', 'failed', 'started', 'accepted', 'canceled', 'all']);
  OPERATION_FAMILIES = new Set(['write', 'delete', 'action', 'all']);
  RESOURCE_ID_PATTERN =
    /^\/subscriptions\/([^/]+)\/resourceGroups\/[^/]+(?:\/providers\/[^/]+\/[^/]+\/[^/]+(?:\/[^/]+\/[^/]+)*)?$/i;
  CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/;
  GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  NETWORK_LITERAL_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$|^[0-9a-f]*:[0-9a-f:]+$/i;
});

// plugins/azure/src/prompts/az-exec.md
var az_exec_default =
  '# Execute Azure CLI Commands\n\nExecute any `az` CLI subcommand directly.\n\nThis is the general-purpose tool for running az commands that are not covered by the typed tools (az_account, az_group, az_resource, az_vm). Use typed tools when available \u2014 they validate inputs and return structured data.\n\n## Usage\n\nPass the subcommand and flags as an array of arguments. Do NOT include `az` itself \u2014 it is prepended automatically.\n\n**Example:** To run `az webapp list --resource-group myRG`:\n\n```json\n{ "args": ["webapp", "list", "--resource-group", "myRG"] }\n```\n\n## Safety\n\n- Arguments are passed as an array directly to the `az` binary \u2014 **no shell** is involved, so shell metacharacters are inert and never filtered. Any valid `az` invocation runs, including full JMESPath `--query` syntax.\n- **Read-only by default:** mutating verbs (`create`, `delete`, `update`, `set`, `purge`, `start`, `stop`, `restart`, `scale`, `restore`, \u2026) are blocked. Run write/destructive operations through an explicitly confirmed path (delegate to the `cli-operator` agent), not `az_exec`.\n- Output is capped to prevent context overflow.\n\n## Querying with `--query` (JMESPath)\n\nThe full JMESPath grammar is supported \u2014 pass the expression as a single argument value. Common patterns:\n\n- Field projection: `--query "[].{name:name, location:location}"`\n- Filter: `--query "[?location==\'eastus\']"`\n- Substring match: `--query "[?contains(name, \'prod\')]"`\n- Backtick literals (numbers/booleans/quoted enums): `` --query "[?powerState==`VM running`]" ``\n- OR / AND / NOT: `--query "[?a==\'x\' || b==\'y\']"`, `--query "[?a && b]"`, `--query "[?!disabled]"`\n- Pipe to post-process a projection: `--query "[].name | [0]"`\n\nAll of the above \u2014 including `||`, `|`, and backticks \u2014 are accepted verbatim.\n\nFor `az graph query`, use the typed `az_resource_graph_query` tool. Resource Graph KQL belongs in\nits `query` field and maps to `--graph-query`; global `--query` remains only a JMESPath output\nprojection. An unambiguous `az graph query --query <KQL>` mix-up is rejected before execution.\n\n## Common Subcommands Not Covered by Typed Tools\n\n- `az webapp list` / `az webapp show` \u2014 App Service\n- `az aks list` / `az aks show` \u2014 Kubernetes Service\n- `az storage account list` \u2014 Storage accounts\n- `az network vnet list` \u2014 Virtual Networks\n- `az network nsg list` \u2014 Network Security Groups\n- `az sql server list` \u2014 SQL servers\n- `az keyvault list` \u2014 Key Vaults\n- `az container list` \u2014 Container Instances\n- `az acr list` \u2014 Container Registries\n- `az functionapp list` \u2014 Function Apps\n\n## Tips\n\n- `--output json` is added automatically unless you pass your own `--output`/`-o` (e.g. `-o table`, `-o tsv`), which is respected\n- Use `--subscription NAME_OR_ID` to target a specific subscription\n- Use `--resource-group NAME` to scope to a resource group\n- Use `az_help` tool first if unsure about available flags\n';
var init_az_exec = () => {};

// plugins/azure/src/tools/az-exec.ts
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
function getPositionals(args) {
  return args.filter((arg) => !arg.startsWith('-'));
}
function findMutatingVerb(args) {
  return getPositionals(args).find((tok) => MUTATING_VERBS.has(tok)) ?? null;
}
function buildAzArgs(args) {
  const hasOutput = args.some(
    (a) => a === '--output' || a === '-o' || a.startsWith('--output=') || a.startsWith('-o='),
  );
  return hasOutput ? [...args] : [...args, '--output', 'json'];
}
function createAzExecTool(pi, makeApi = makeExecApi) {
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
      const args = buildAzArgs(params.args);
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
var MAX_OUTPUT_LENGTH = 50000,
  CONTROL_CHAR_PATTERN2,
  MUTATING_VERBS;
var init_az_exec2 = __esm(() => {
  init_az_exec();
  init_shared();
  CONTROL_CHAR_PATTERN2 = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;
  MUTATING_VERBS = new Set([
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
});

// plugins/azure/src/az/resource-graph.ts
var RESOURCE_GRAPH_REQUIRED_FLAGS;
var init_resource_graph = __esm(() => {
  RESOURCE_GRAPH_REQUIRED_FLAGS = [
    '--graph-query',
    '--subscriptions',
    '--first',
    '--skip',
    '--skip-token',
    '--allow-partial-scopes',
  ];
});

// plugins/azure/src/prompts/az-resource-graph-query.md
var az_resource_graph_query_default =
  '# Query Azure Resource Graph\n\nRun a read-only Resource Graph query with typed paging and subscription scope.\n\n- Put KQL in `query`; it is passed only to `--graph-query`.\n- Put an optional JMESPath result transform in `output_projection`; it is passed only to global `--query`.\n- Use `subscriptions` for individual Azure subscription UUIDs.\n- Use `first` with either `skip` or `skip_token`; never combine `skip` and `skip_token`.\n- Set `allow_partial_scopes` only when partial accessible-scope results are acceptable.\n\nThe tool disables dynamic extension installation. A setup-required result must be handled through\n`xcsh plugin setup azure`, which reviews the exact installation and authentication plan before execution.\n';
var init_az_resource_graph_query = () => {};

// plugins/azure/src/tools/az-resource-graph-query.ts
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
function buildResourceGraphArgs(params) {
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
function createAzResourceGraphQueryTool(pi, makeApi = makeExecApi) {
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
      const options = { signal, env: RESOURCE_GRAPH_ENV };
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
      const result = await api.exec('az', buildResourceGraphArgs(params), options);
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
var RESOURCE_GRAPH_ENV, CONTROL_CHAR_PATTERN3;
var init_az_resource_graph_query2 = __esm(() => {
  init_exec();
  init_resource_graph();
  init_types();
  init_az_resource_graph_query();
  init_shared();
  init_resource_graph();
  RESOURCE_GRAPH_ENV = { AZURE_EXTENSION_USE_DYNAMIC_INSTALL: 'no' };
  CONTROL_CHAR_PATTERN3 = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
});

// plugins/azure/src/prompts/az-vm-list.md
var az_vm_list_default =
  '# List Azure virtual machines\n\nUse `az vm list`.\n\n## Usage\n\n```json\n{\n  "resource_group": "optional-name",\n  "subscription": "optional-name-or-id",\n  "include_power_state": true,\n  "include_network_identifiers": false\n}\n```\n\n## Flags\n\n| Parameter | Description |\n| --- | --- |\n| `resource_group` | Filter by resource group |\n| `subscription` | Name or ID of subscription |\n| `include_power_state` | Include runtime state. Defaults to `true` and may require additional Azure API calls. |\n| `include_network_identifiers` | Include public IP addresses and FQDNs. Defaults to `false`; enable only for an explicit endpoint request. |\n\n## Output Fields (JSON)\n\nThe result always includes:\n\n- `id` \u2014 Full resource ID\n- `name` \u2014 VM name\n- `location` \u2014 Azure region\n- `resourceGroup` \u2014 Parent resource group\n- `vmSize` \u2014 VM size (for example, Standard_D2s_v5)\n- `osType` \u2014 Linux or Windows\n- `provisioningState` \u2014 Succeeded, Failed, etc.\n\nWith `include_power_state` enabled (the default):\n\n- `powerState` \u2014 VM running, VM deallocated, VM stopped, etc.\n\nOnly with `include_network_identifiers: true`:\n\n- `publicIps` \u2014 Public IP addresses as an array\n- `fqdns` \u2014 Fully qualified domain names as an array\n\n## Common VM Operations\n\n- `az vm show --name NAME --resource-group RG` \u2014 Show single VM\n- `az vm start --name NAME --resource-group RG` \u2014 Start VM\n- `az vm stop --name NAME --resource-group RG` \u2014 Stop VM\n- `az vm deallocate --name NAME --resource-group RG` \u2014 Deallocate (stop billing)\n- `az vm restart --name NAME --resource-group RG` \u2014 Restart VM\n- `az vm list-ip-addresses --name NAME --resource-group RG` \u2014 Get IPs\n- `az vm list-sizes --location LOCATION` \u2014 List available sizes\n- `az vm open-port --name NAME --resource-group RG --port PORT` \u2014 Open port\n\n## Notes\n\nWithout `resource_group`, the tool lists all VMs in the subscription. Runtime state and endpoint\nlookups may require additional Azure API calls. Network identifiers are excluded from both text and\nstructured results unless `include_network_identifiers` is explicitly true.\n';
var init_az_vm_list = () => {};

// plugins/azure/src/tools/az-vm-list.ts
function vmListProjection(includePowerState, includeNetworkIdentifiers) {
  const fields = [...BASE_VM_FIELDS];
  if (includePowerState) fields.push('powerState:powerState');
  if (includeNetworkIdentifiers) fields.push('publicIps:to_array(publicIps)', 'fqdns:to_array(fqdns)');
  return `[].{${fields.join(',')}}`;
}
function buildVmArgs(params) {
  const args = ['vm', 'list'];
  if (params.resource_group) args.push('--resource-group', params.resource_group);
  if (params.subscription) args.push('--subscription', params.subscription);
  const power = params.include_power_state ?? true;
  const network = params.include_network_identifiers === true;
  if (power || network) args.push('--show-details');
  args.push('--query', vmListProjection(power, network));
  return args;
}
function createAzVmListTool(pi, makeApi = makeExecApi) {
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
      const args = buildVmArgs(params);
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
var BASE_VM_FIELDS;
var init_az_vm_list2 = __esm(() => {
  init_exec();
  init_types();
  init_az_vm_list();
  init_shared();
  BASE_VM_FIELDS = [
    'id:id',
    'name:name',
    'location:location',
    'resourceGroup:resourceGroup',
    'vmSize:hardwareProfile.vmSize',
    'provisioningState:provisioningState',
    'osType:storageProfile.osDisk.osType',
  ];
});

// plugins/azure/src/prompts/az-account-show.md
var az_account_show_default = `# Show or list Azure subscriptions

Use \`az account\`.

## Actions

**show** \u2014 Get details of the current (or specified) subscription.

\`\`\`bash
az account show [--subscription NAME_OR_ID]
\`\`\`

**list** \u2014 List subscriptions for the logged-in account. By default only 'Enabled' subscriptions are shown.

\`\`\`bash
az account list [--all] [--refresh]
\`\`\`

## Flags

| Flag | Applies To | Description |
| --- | --- | --- |
| \`--subscription\`, \`-s\`, \`-n\` | show | Name or ID of subscription |
| \`--all\` | list | Include subscriptions that are not 'Enabled' |
| \`--refresh\` | list | Retrieve up-to-date subscriptions from server |

## Output Fields (JSON)

- \`id\` \u2014 Subscription UUID
- \`name\` \u2014 Display name
- \`state\` \u2014 Enabled, Disabled, Warned, etc.
- \`isDefault\` \u2014 Whether this is the active subscription
- \`tenantId\` \u2014 Azure AD tenant UUID
- \`user.name\` \u2014 Authenticated user/principal
- \`user.type\` \u2014 "user", "servicePrincipal", etc.

## Related Commands

- \`az account set -s NAME_OR_ID\` \u2014 Switch active subscription
- \`az account get-access-token\` \u2014 Get token for API access
- \`az account list-locations\` \u2014 List regions for current subscription
`;
var init_az_account_show = () => {};

// plugins/azure/src/tools/az-account-show.ts
function createAzAccountShowTool(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  const parameters = Type.Object({
    action: Type.Union([Type.Literal('show'), Type.Literal('list')], {
      description: 'show = current subscription, list = all subscriptions',
    }),
    subscription: Type.Optional(Type.String({ description: 'Filter by subscription name or ID' })),
  });
  return {
    name: 'az_account_show',
    label: 'Azure Account',
    description: az_account_show_default,
    parameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const base = { tool: 'az_account_show', action: params.action };
      if (params.subscription) {
        const isUuid = SUBSCRIPTION_ID_PATTERN.test(params.subscription);
        const isName = SUBSCRIPTION_NAME_PATTERN.test(params.subscription);
        if (!isUuid && !isName) {
          return errorResult(
            `Error: invalid subscription "${params.subscription}". Only alphanumeric characters, spaces, dots, underscores, and hyphens are allowed.`,
            base,
          );
        }
      }
      const api = makeApi(ctx.cwd);
      try {
        if (params.action === 'list') {
          const raw = await execAzJson(api, accountArgs(params), signal);
          let subs = raw.map(normalizeSubscription);
          if (params.subscription) {
            const filter = params.subscription.toLowerCase();
            subs = subs.filter((s) => s.name.toLowerCase().includes(filter) || s.id.toLowerCase().includes(filter));
          }
          return textResult(formatSubscriptionTable(subs), { ...base, subscriptions: subs });
        }
        const args = accountArgs(params);
        const raw = await execAzJson(api, args, signal);
        const sub = normalizeSubscription(raw);
        return textResult(formatSubscriptionDetail(sub), { ...base, subscriptions: [sub] });
      } catch (err) {
        return errorResult(`Error: ${err instanceof Error ? err.message : String(err)}`, {
          ...base,
          errorType: detectErrorType(err),
        });
      }
    },
  };
}
var init_az_account_show2 = __esm(() => {
  init_exec();
  init_types();
  init_az_account_show();
  init_shared();
});

// plugins/azure/src/prompts/az-group-list.md
var az_group_list_default = `# List or show Azure resource groups

Use \`az group\`.

## Actions

**list** \u2014 List all resource groups in the current subscription.

\`\`\`bash
az group list [--subscription NAME_OR_ID] [--tag KEY[=VALUE]]
\`\`\`

**show** \u2014 Get details of a specific resource group.

\`\`\`bash
az group show --name NAME [--subscription NAME_OR_ID]
\`\`\`

## Flags

| Flag | Applies To | Description |
| --- | --- | --- |
| \`--subscription\` | list, show | Name or ID of subscription |
| \`--tag\` | list | Filter by tag in \`key[=value]\` format |
| \`--name\`, \`-n\` | show | Resource group name (required for show) |

## Output Fields (JSON)

- \`id\` \u2014 Full resource ID
- \`name\` \u2014 Resource group name
- \`location\` \u2014 Azure region (e.g. eastus, westus2)
- \`properties.provisioningState\` \u2014 Succeeded, Failed, etc.
- \`tags\` \u2014 Key-value tag pairs

## Naming Rules

Resource group names: 1-90 chars, alphanumeric, periods, underscores, hyphens, parentheses. Cannot end with a period.

## Related Commands

- \`az group create --name NAME --location LOCATION\` \u2014 Create resource group
- \`az group delete --name NAME\` \u2014 Delete resource group
- \`az group exists --name NAME\` \u2014 Check if exists (returns true/false)
- \`az group export --name NAME\` \u2014 Export as ARM template
`;
var init_az_group_list = () => {};

// plugins/azure/src/tools/az-group-list.ts
function createAzGroupListTool(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  const parameters = Type.Object({
    action: Type.Union([Type.Literal('list'), Type.Literal('show')], {
      description: 'list = all resource groups, show = single resource group details',
    }),
    name: Type.Optional(Type.String({ description: 'Resource group name (required for show)' })),
    subscription: Type.Optional(Type.String({ description: 'Subscription name or ID' })),
    tag: Type.Optional(Type.String({ description: 'Filter by tag in key[=value] format' })),
  });
  return {
    name: 'az_group_list',
    label: 'Azure Resource Groups',
    description: az_group_list_default,
    parameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const base = { tool: 'az_group_list', action: params.action };
      if (params.name && !RESOURCE_GROUP_PATTERN.test(params.name)) {
        return errorResult(
          `Error: invalid resource group name "${params.name}". Only alphanumeric characters, periods, underscores, hyphens, and parentheses are allowed.`,
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
      if (params.tag && !TAG_PATTERN.test(params.tag)) {
        return errorResult(
          `Error: invalid tag "${params.tag}". Use format key[=value] with safe characters only.`,
          base,
        );
      }
      const api = makeApi(ctx.cwd);
      try {
        if (params.action === 'show') {
          if (!params.name) {
            return errorResult('Error: --name is required for show action.', base);
          }
          const args = groupArgs(params);
          const raw = await execAzJson(api, args, signal);
          const group = normalizeResourceGroup(raw);
          return textResult(formatResourceGroupTable([group]), { ...base, resourceGroups: [group] });
        }
        const args = groupArgs(params);
        const raw = await execAzJson(api, args, signal);
        const groups = raw.map(normalizeResourceGroup);
        return textResult(formatResourceGroupTable(groups), { ...base, resourceGroups: groups });
      } catch (err) {
        return errorResult(`Error: ${err instanceof Error ? err.message : String(err)}`, {
          ...base,
          errorType: detectErrorType(err),
        });
      }
    },
  };
}
var init_az_group_list2 = __esm(() => {
  init_exec();
  init_types();
  init_az_group_list();
  init_shared();
});

// plugins/azure/src/prompts/az-resource-list.md
var az_resource_list_default =
  '# List Azure resources\n\nUse `az resource list`.\n\n## Usage\n\n```bash\naz resource list [--resource-group NAME] [--resource-type TYPE] [--location LOCATION] [--name NAME] [--tag KEY[=VALUE]] [--subscription NAME_OR_ID]\n```\n\n## Flags\n\n| Flag | Description |\n| --- | --- |\n| `--resource-group`, `-g` | Filter by resource group name |\n| `--resource-type` | Filter by type (e.g. `Microsoft.Compute/virtualMachines`). Accepts `namespace/type` format. |\n| `--location`, `-l` | Filter by region |\n| `--name`, `-n` | Filter by resource name |\n| `--tag` | Filter by tag in `key[=value]` format |\n| `--subscription` | Name or ID of subscription |\n\n## Output Fields (JSON)\n\n- `id` \u2014 Full resource ID\n- `name` \u2014 Resource name\n- `type` \u2014 Resource type (e.g. `Microsoft.Compute/virtualMachines`)\n- `location` \u2014 Azure region\n- `resourceGroup` \u2014 Parent resource group\n- `provisioningState` \u2014 Succeeded, Failed, etc.\n- `tags` \u2014 Key-value tag pairs\n\n## Common Resource Types\n\n- `Microsoft.Compute/virtualMachines` \u2014 VMs\n- `Microsoft.Storage/storageAccounts` \u2014 Storage\n- `Microsoft.Network/virtualNetworks` \u2014 VNets\n- `Microsoft.Network/publicIPAddresses` \u2014 Public IPs\n- `Microsoft.Network/networkSecurityGroups` \u2014 NSGs\n- `Microsoft.Web/sites` \u2014 App Service / Functions\n- `Microsoft.ContainerService/managedClusters` \u2014 AKS\n- `Microsoft.Sql/servers` \u2014 SQL servers\n- `Microsoft.KeyVault/vaults` \u2014 Key Vaults\n\n## Notes\n\nWithout `--resource-group`, lists all resources in the subscription (can be large). Always specify a resource group when possible.\n\n## Related Commands\n\n- `az resource show --ids RESOURCE_ID` \u2014 Show single resource\n- `az resource delete --ids RESOURCE_ID` \u2014 Delete resource\n- `az resource tag --ids RESOURCE_ID --tags KEY=VALUE` \u2014 Tag resource\n';
var init_az_resource_list = () => {};

// plugins/azure/src/tools/az-resource-list.ts
function createAzResourceListTool(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  const parameters = Type.Object({
    resource_group: Type.String({ description: 'Resource group name (required to avoid listing entire subscription)' }),
    subscription: Type.Optional(Type.String({ description: 'Subscription name or ID' })),
    resource_type: Type.Optional(
      Type.String({ description: 'Filter by type (e.g. Microsoft.Compute/virtualMachines)' }),
    ),
  });
  return {
    name: 'az_resource_list',
    label: 'Azure Resources',
    description: az_resource_list_default,
    parameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const base = { tool: 'az_resource_list' };
      if (!params.resource_group || !RESOURCE_GROUP_PATTERN.test(params.resource_group)) {
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
      if (params.resource_type && !RESOURCE_TYPE_PATTERN.test(params.resource_type)) {
        return errorResult(
          `Error: invalid resource type "${params.resource_type}". Use format like Microsoft.Compute/virtualMachines.`,
          base,
        );
      }
      const api = makeApi(ctx.cwd);
      const args = resourceArgs(params);
      try {
        const raw = await execAzJson(api, args, signal);
        const resources = raw.map(normalizeResource);
        return textResult(formatResourceTable(resources), { ...base, resources });
      } catch (err) {
        return errorResult(`Error: ${err instanceof Error ? err.message : String(err)}`, {
          ...base,
          errorType: detectErrorType(err),
        });
      }
    },
  };
}
var init_az_resource_list2 = __esm(() => {
  init_exec();
  init_types();
  init_az_resource_list();
  init_shared();
});

// plugins/azure/src/ce/canonical.ts
import { createHash, timingSafeEqual } from 'node:crypto';

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      const entry = value[key];
      if (entry !== undefined) sorted[key] = canonicalize(entry);
    }
    return sorted;
  }
  return value;
}
function canonicalStringify(value) {
  return JSON.stringify(canonicalize(value));
}
function sha256Hex(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
function canonicalSha256(value) {
  return sha256Hex(canonicalStringify(value));
}
function safeHexEqual(left, right) {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}
function fingerprintObservation(observation, brownfieldResourceIds) {
  const allowlist = new Set(brownfieldResourceIds.map((id) => id.toLowerCase()));
  return canonicalSha256({
    schemaVersion: observation.schemaVersion,
    subscription: observation.subscription,
    image: observation.image,
    research: observation.research,
    regions: observation.regions,
    resources: observation.resources.filter((resource) => allowlist.has(resource.id.toLowerCase())),
  });
}
function fingerprintDeploymentObservation(observation, brownfieldResourceIds, selectedRegion, selectedVmSize) {
  const region = observation.regions.find((candidate) => candidate.name.toLowerCase() === selectedRegion.toLowerCase());
  if (!region) throw new Error(`Selected Azure CE deployment region was not observed: ${selectedRegion}`);
  const vm = region.vmSizes.find((candidate) => candidate.name.toLowerCase() === selectedVmSize.toLowerCase());
  if (!vm) throw new Error(`Selected Azure CE deployment VM size was not observed: ${selectedVmSize}`);
  const allowlist = new Set(brownfieldResourceIds.map((id) => id.toLowerCase()));
  const resources = observation.resources
    .filter((resource) => allowlist.has(resource.id.toLowerCase()))
    .sort(
      (left, right) =>
        left.id.toLowerCase().localeCompare(right.id.toLowerCase()) ||
        canonicalStringify(left).localeCompare(canonicalStringify(right)),
    );
  const research = {
    ...observation.research,
    commands: [...observation.research.commands].sort(),
    officialSources: [...observation.research.officialSources].sort(),
    sourceReceipts: [...observation.research.sourceReceipts].sort(
      (left, right) => left.url.localeCompare(right.url) || left.normalizedSha256.localeCompare(right.normalizedSha256),
    ),
  };
  return canonicalSha256({
    schemaVersion: observation.schemaVersion,
    subscription: observation.subscription,
    image: observation.image,
    research,
    resources,
    region: {
      name: region.name,
      eligible: region.eligible,
      reasons: [...region.reasons].sort(),
      zones: [...region.zones].sort(),
      routeServerSupported: region.routeServerSupported,
      quotaAvailable: region.quotaAvailable,
      policyAllowed: region.policyAllowed,
      vm: {
        name: vm.name,
        maxNics: vm.maxNics,
        vCpus: vm.vCpus,
        memoryGb: vm.memoryGb,
        restricted: vm.restricted,
        zones: [...vm.zones].sort(),
      },
    },
  });
}
var init_canonical = () => {};

// plugins/azure/src/ce/inventory.ts
import { createHash as createHash2 } from 'node:crypto';

function failure(stage, errorType) {
  return new AzureCeInventoryFailure(stage, errorType);
}
function cliErrorType(stderr, stdout, exitCode) {
  return detectErrorType(detectAzError(stderr || stdout, exitCode));
}
async function execAtStage(api, stage, args, options) {
  try {
    return await api.exec('az', args, options);
  } catch {
    throw failure(stage, 'exec_error');
  }
}
function safe(value, max = 2048) {
  return String(value ?? '')
    .replace(CONTROL, '')
    .replace(IPV4, '[redacted-network]')
    .replace(IPV6, '[redacted-network]')
    .slice(0, max);
}
function normalizeKey(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('en-US');
}
function strings(value) {
  const result = [];
  const visit = (entry) => {
    if (typeof entry === 'string') result.push(entry);
    else if (Array.isArray(entry)) for (const child of entry) visit(child);
    else if (entry && typeof entry === 'object') {
      const record = entry;
      if (typeof record.id === 'string') result.push(record.id);
      else for (const child of Object.values(record)) visit(child);
    }
  };
  visit(value);
  return [...new Set(result.filter(Boolean).map((entry) => safe(entry)))].sort((a, b) =>
    normalizeKey(a).localeCompare(normalizeKey(b)),
  );
}
function tags(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [normalizeKey(key), String(item ?? '')]));
}
function imageFamily(row) {
  const publisher = normalizeKey(row.imagePublisher);
  const offer = normalizeKey(row.imageOffer);
  const sku = normalizeKey(row.imageSku);
  if (publisher !== 'f5-networks') return;
  if (offer === 'f5xc_customer_edge' && sku.startsWith('f5xc-ce-crt')) return 'legacy-crt';
  if (offer === 'f5xc-customer-edge' && sku === 'f5xc-ce') return 'current-ce';
}
function hasTagSignal(value) {
  return Boolean(
    value['xcsh-deployment-id'] ||
      normalizeKey(value['xcsh-managed-by']) === 'azure-ce' ||
      value['f5xc-site-name'] ||
      value['ves.io/site-name'] ||
      normalizeKey(value['f5xc-managed-by']) === 'azure-ce',
  );
}
function normalizeResource2(row) {
  const normalizedTags = tags(row.tags);
  const family = imageFamily(row);
  const signalText = [row.name, ...Object.entries(normalizedTags).flat()].map(String).join(' ');
  return {
    id: safe(row.id),
    name: safe(row.name, 256),
    type: normalizeKey(row.type),
    resourceGroup: safe(row.resourceGroup || row.name, 256),
    location: safe(row.location, 128),
    provisioningState: safe(row.provisioningState, 128),
    tags: normalizedTags,
    imagePublisher: safe(row.imagePublisher, 128),
    imageOffer: safe(row.imageOffer, 128),
    imageSku: safe(row.imageSku, 128),
    computerName: safe(row.computerName, 256),
    networkInterfaceIds: strings(row.networkInterfaceIds),
    diskIds: strings(row.diskIds),
    macAddress: String(row.macAddress ?? ''),
    primary: row.primary === true,
    vmId: safe(row.vmId),
    subnetIds: strings(row.subnetIds),
    networkSecurityGroupId: safe(row.networkSecurityGroupId),
    publicIpResourceIds: strings(row.publicIpResourceIds),
    routeTableId: safe(row.routeTableId),
    routeNames: strings(row.routeNames).map((item) => safe(item, 256)),
    bgpPeerStates: strings(row.bgpPeerStates).map((item) => safe(item, 128)),
    kind: String(row.inventoryKind ?? row.kind ?? 'resource'),
    deploymentId: safe(normalizedTags['xcsh-deployment-id'], 256),
    candidate: Boolean(family) || hasTagSignal(normalizedTags) || CE_SIGNAL.test(signalText),
    ...(family ? { imageFamily: family } : {}),
  };
}
function normalizeMac(value) {
  const normalized = value.replace(/[^a-f0-9]/gi, '').toLowerCase();
  return /^[a-f0-9]{12}$/.test(normalized) ? normalized : undefined;
}
function hashMac(value) {
  const normalized = normalizeMac(value);
  return normalized ? createHash2('sha256').update(normalized, 'utf8').digest('hex') : undefined;
}
function siteKey(site) {
  return `${normalizeKey(site.namespace || '_default')}/${normalizeKey(site.name)}`;
}
function runtimeState(value) {
  const normalized = normalizeKey(value).replace(/^powerstate\//, '');
  if (normalized === 'running') return 'running';
  if (normalized === 'stopped' || normalized === 'deallocated') return normalized;
  return 'unknown';
}
function aggregateRuntime(nodes) {
  if (nodes.length === 0) return 'absent';
  const values = new Set(nodes.map((node) => node.runtimeState));
  if (values.size === 1 && values.has('running')) return 'running';
  if ([...values].every((value) => value === 'stopped' || value === 'deallocated')) return 'stopped';
  if (values.has('unknown')) return values.size === 1 ? 'unknown' : 'mixed';
  return 'mixed';
}
function dependencyKind(type) {
  return DEPENDENCY_KINDS[type] ?? 'resource';
}
function callerTargets(input, collected) {
  return new Set(
    [input.caller?.objectId, input.caller?.userPrincipalName, input.caller ? undefined : collected.observedCaller]
      .map(normalizeKey)
      .filter(Boolean),
  );
}
function association(value, targets) {
  if (!value || targets.size === 0) return 'unknown';
  return targets.has(normalizeKey(value)) ? 'matches-caller' : 'different-caller';
}
function evidenceFor(resources, _group, activity, sites, input, collected) {
  const result = [];
  const targets = callerTargets(input, collected);
  const ids = new Set(resources.map((resource) => normalizeKey(resource.id)));
  for (const event of activity?.events ?? []) {
    if (
      event.evidenceType !== 'created' ||
      (!ids.has(normalizeKey(event.resourceId)) && event.scopeType !== 'resource_group')
    )
      continue;
    result.push({
      source: 'activity-log',
      association: association(event.callerComparison, targets),
      confidence: event.confidence === 'none' ? 'unknown' : event.confidence,
      reasonCode: event.reasonCode,
      resourceId: safe(event.resourceId),
    });
  }
  if (!result.some((item) => item.source === 'activity-log')) {
    result.push({
      source: 'activity-log',
      association: 'unknown',
      confidence: 'unknown',
      reasonCode: activity?.scopeEvidence.reasonCode ?? 'activity_evidence_unavailable',
    });
  }
  for (const resource of resources) {
    for (const key of ['owner', 'createdby', 'xcsh-managed-by']) {
      const value = resource.tags[key];
      if (!value) continue;
      result.push({
        source: 'tag',
        association: association(value, targets),
        confidence: 'medium',
        reasonCode: `explicit_${key.replace(/[^a-z0-9]+/g, '_')}_tag`,
        resourceId: resource.id,
      });
    }
    if (resource.candidate && !resource.imageFamily && !hasTagSignal(resource.tags)) {
      result.push({
        source: 'candidate-signal',
        association: 'unknown',
        confidence: 'low',
        reasonCode: 'name_or_tag_candidate_signal',
        resourceId: resource.id,
      });
    }
  }
  for (const site of sites) {
    if (!site.creator) continue;
    result.push({
      source: 'platform',
      association: association(site.creator, targets),
      confidence: 'medium',
      reasonCode: 'correlated_platform_site_creator',
    });
  }
  return result.sort((a, b) =>
    `${a.source}|${a.resourceId ?? ''}|${a.reasonCode}`.localeCompare(
      `${b.source}|${b.resourceId ?? ''}|${b.reasonCode}`,
    ),
  );
}
function classify(nodes, dependencies, platform, runtime, evidence, empty) {
  const associations = new Set(evidence.map((item) => item.association).filter((item) => item !== 'unknown'));
  if (platform === 'ambiguous' || associations.size > 1)
    return { classification: 'ambiguous', confidence: 'unknown', reasonCodes: ['conflicting_or_ambiguous_evidence'] };
  if (empty)
    return {
      classification: 'empty-candidate-group',
      confidence: 'low',
      reasonCodes: ['candidate_group_has_no_resources'],
    };
  if (nodes.length === 0 && dependencies.length > 0)
    return { classification: 'azure-remnant', confidence: 'low', reasonCodes: ['dependencies_without_ce_nodes'] };
  if (platform === 'unavailable')
    return {
      classification: 'azure-platform-unknown',
      confidence: 'unknown',
      reasonCodes: ['platform_evidence_unavailable'],
    };
  if (platform === 'online' && runtime === 'running')
    return {
      classification: 'azure-platform-active',
      confidence: 'high',
      reasonCodes: ['correlated_platform_online_and_nodes_running'],
    };
  if (platform === 'online' || platform === 'non-online')
    return {
      classification: 'azure-platform-inactive',
      confidence: 'medium',
      reasonCodes: ['correlated_platform_or_runtime_not_active'],
    };
  if (runtime === 'running')
    return {
      classification: 'azure-only-running',
      confidence: 'medium',
      reasonCodes: ['running_without_platform_match'],
    };
  if (runtime === 'stopped')
    return {
      classification: 'azure-only-stopped',
      confidence: 'medium',
      reasonCodes: ['stopped_without_platform_match'],
    };
  return {
    classification: 'azure-only-mixed',
    confidence: 'low',
    reasonCodes: ['mixed_or_unknown_runtime_without_platform_match'],
  };
}
function groupRows(rows) {
  const byGroup = new Map();
  for (const row of rows) {
    const key = normalizeKey(row.resourceGroup);
    const items = byGroup.get(key) ?? [];
    items.push(row);
    byGroup.set(key, items);
  }
  const groups = [];
  for (const [key, items] of [...byGroup].sort(([left], [right]) => left.localeCompare(right))) {
    const groupRows = items.filter((item) => item.kind === 'resourceGroup');
    const resources = items.filter((item) => item.kind !== 'resourceGroup');
    if (!items.some((item) => item.candidate)) continue;
    if (resources.length === 0) {
      groups.push({
        id: `${key}/empty`,
        resourceGroup: safe(groupRows[0]?.resourceGroup ?? key),
        resources: [],
        empty: true,
      });
      continue;
    }
    const ids = [...new Set(resources.map((item) => normalizeKey(item.deploymentId)).filter(Boolean))].sort();
    if (ids.length <= 1) {
      groups.push({
        id: ids[0] || `${key}/inferred`,
        resourceGroup: safe(resources[0]?.resourceGroup ?? key),
        resources,
        empty: false,
      });
      continue;
    }
    for (const id of ids) {
      const selected = resources.filter((item) => normalizeKey(item.deploymentId) === id);
      groups.push({ id, resourceGroup: safe(selected[0]?.resourceGroup ?? key), resources: selected, empty: false });
    }
    const unassigned = resources.filter((item) => !item.deploymentId);
    if (unassigned.some((item) => item.candidate))
      groups.push({
        id: `${key}/inferred`,
        resourceGroup: safe(unassigned[0]?.resourceGroup ?? key),
        resources: unassigned,
        empty: false,
      });
  }
  return groups.sort((a, b) => normalizeKey(a.id).localeCompare(normalizeKey(b.id)));
}
function platformCorrelations(nodes, sites) {
  const normalizedSites = sites
    .map((site) => ({
      input: site,
      key: siteKey(site),
      nodes: (site.nodes ?? []).map((node) => ({
        hostname: normalizeKey(node.hostname),
        macs: new Set((node.macAddresses ?? []).map((mac) => hashMac(mac)).filter((value) => Boolean(value))),
      })),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
  const matched = new Set();
  let ambiguous = false;
  for (const node of nodes) {
    const macs = new Set(node.nics.map((nic) => nic.macSha256).filter((value) => Boolean(value)));
    const macSites = normalizedSites.filter((site) =>
      site.nodes.some((candidate) => [...candidate.macs].some((mac) => macs.has(mac))),
    );
    if (macSites.length === 1) {
      node.correlation = { siteKey: macSites[0].key, matchedBy: 'mac' };
      matched.add(macSites[0].key);
      continue;
    }
    if (macSites.length > 1) {
      ambiguous = true;
      for (const site of macSites) matched.add(site.key);
      continue;
    }
    const hostname = normalizeKey(node.name);
    const hostSites = normalizedSites.filter((site) => site.nodes.some((candidate) => candidate.hostname === hostname));
    if (hostSites.length === 1) {
      node.correlation = { siteKey: hostSites[0].key, matchedBy: 'hostname' };
      matched.add(hostSites[0].key);
    } else if (hostSites.length > 1) {
      ambiguous = true;
      for (const site of hostSites) matched.add(site.key);
    }
  }
  return { normalizedSites, matched, ambiguous };
}
function nodeFor(vm, resources, runtimeByVmId) {
  const nics = resources.filter(
    (item) =>
      item.type === 'microsoft.network/networkinterfaces' &&
      (normalizeKey(item.vmId) === normalizeKey(vm.id) ||
        vm.networkInterfaceIds.map(normalizeKey).includes(normalizeKey(item.id))),
  );
  nics.sort((a, b) => Number(b.primary) - Number(a.primary) || normalizeKey(a.id).localeCompare(normalizeKey(b.id)));
  return {
    id: vm.id,
    name: vm.name,
    imageFamily: vm.imageFamily ?? 'signal-only',
    provisioningState: vm.provisioningState || 'unknown',
    runtimeState: runtimeState(runtimeByVmId[vm.id] ?? runtimeByVmId[normalizeKey(vm.id)]),
    disks: vm.diskIds,
    nics: nics.map((nic, order) => {
      const subnetId = nic.subnetIds[0];
      const vnetId = subnetId?.replace(/\/subnets\/[^/]+$/i, '');
      return {
        id: nic.id,
        name: nic.name,
        order,
        primary: nic.primary,
        ...(hashMac(nic.macAddress) ? { macSha256: hashMac(nic.macAddress) } : {}),
        ...(subnetId ? { subnetId } : {}),
        ...(vnetId ? { vnetId } : {}),
        ...(nic.networkSecurityGroupId ? { networkSecurityGroupId: nic.networkSecurityGroupId } : {}),
        publicIpPresent: nic.publicIpResourceIds.length > 0,
      };
    }),
  };
}
function dependencyFor(resource) {
  const dependency = {
    id: resource.id,
    name: resource.name,
    kind: dependencyKind(resource.type),
    provisioningState: resource.provisioningState || 'unknown',
  };
  if (resource.type === 'microsoft.network/loadbalancers')
    dependency.publicIpPresenceCount = resource.publicIpResourceIds.length;
  if (resource.type === 'microsoft.network/publicipaddresses') dependency.publicIpPresenceCount = 1;
  if (resource.routeNames.length) dependency.routeNames = resource.routeNames;
  if (resource.bgpPeerStates.length) dependency.bgpPeerStates = resource.bgpPeerStates;
  return dependency;
}
function buildAzureCeInventoryEnvelope(input, collected, now) {
  const rows = collected.rows.map(normalizeResource2);
  const sites = [...(input.platformSites ?? [])].sort((a, b) => siteKey(a).localeCompare(siteKey(b)));
  const matchedSites = new Set();
  const deployments = groupRows(rows).map((group) => {
    const nodes = group.resources
      .filter((item) => item.type === 'microsoft.compute/virtualmachines' && item.candidate)
      .map((item) => nodeFor(item, group.resources, collected.runtimeByVmId))
      .sort((a, b) => normalizeKey(a.id).localeCompare(normalizeKey(b.id)));
    const dependencies = group.resources
      .filter((item) => item.type !== 'microsoft.compute/virtualmachines')
      .map(dependencyFor)
      .sort((a, b) => normalizeKey(a.id).localeCompare(normalizeKey(b.id)));
    const correlations = platformCorrelations(nodes, sites);
    for (const key of correlations.matched) matchedSites.add(key);
    const correlatedSites = correlations.normalizedSites
      .filter((site) => correlations.matched.has(site.key))
      .map((site) => {
        const matchedBy =
          nodes.find((node) => node.correlation?.siteKey === site.key)?.correlation?.matchedBy ?? 'hostname';
        return {
          key: site.key,
          name: safe(site.input.name, 256),
          ...(site.input.namespace ? { namespace: safe(site.input.namespace, 256) } : {}),
          state: safe(site.input.siteState || 'unknown', 80),
          matchedBy,
        };
      });
    const runtime = aggregateRuntime(nodes);
    const platform =
      input.platformSites === undefined
        ? 'unavailable'
        : correlations.ambiguous
          ? 'ambiguous'
          : correlatedSites.length === 0
            ? 'absent'
            : correlatedSites.every((site) => normalizeKey(site.state) === 'online')
              ? 'online'
              : 'non-online';
    const provisioningValues = new Set(
      [
        ...nodes.map((node) => normalizeKey(node.provisioningState)),
        ...dependencies.map((item) => normalizeKey(item.provisioningState)),
      ].filter(Boolean),
    );
    const provisioning =
      provisioningValues.size === 0 ? 'unknown' : provisioningValues.size === 1 ? [...provisioningValues][0] : 'mixed';
    const routing = group.resources.some((item) => ROUTING_TYPES.has(item.type)) ? 'observed' : 'not-observed';
    const creatorEvidence = evidenceFor(
      group.resources,
      group.resourceGroup,
      collected.activityByResourceGroup[normalizeKey(group.resourceGroup)],
      correlatedSites.map((item) => sites.find((site) => siteKey(site) === item.key)).filter((site) => Boolean(site)),
      input,
      collected,
    );
    const result = classify(nodes, dependencies, platform, runtime, creatorEvidence, group.empty);
    const evidenceReferences = [
      ...new Set([
        ...group.resources.filter((item) => item.imageFamily).map((item) => `image:${item.id}`),
        ...creatorEvidence.map((item) => `${item.source}:${item.reasonCode}:${item.resourceId ?? group.resourceGroup}`),
        ...nodes.flatMap((node) =>
          node.correlation ? [`correlation:${node.id}:${node.correlation.matchedBy}:${node.correlation.siteKey}`] : [],
        ),
      ]),
    ].sort((a, b) => normalizeKey(a).localeCompare(normalizeKey(b)));
    return {
      id: safe(group.id, 256),
      resourceGroup: group.resourceGroup,
      ...result,
      evidenceReferences,
      nodes,
      dependencies,
      platformSites: correlatedSites.sort((a, b) => a.key.localeCompare(b.key)),
      creatorEvidence,
      dimensions: {
        provisioning,
        runtime,
        platform,
        routing,
        trafficHealth: input.platformSites === undefined ? 'evidence-unavailable' : 'not-tested',
      },
    };
  });
  const platformOnly = sites
    .filter((site) => !matchedSites.has(siteKey(site)))
    .map((site) => ({
      name: safe(site.name, 256),
      ...(site.namespace ? { namespace: safe(site.namespace, 256) } : {}),
      state: safe(site.siteState || 'unknown', 80),
      classification: 'platform-only',
      reasonCodes: ['no_azure_node_correlation'],
    }));
  const inventory = {
    schemaVersion: AZURE_CE_INVENTORY_SCHEMA_VERSION,
    subscriptionId: safe(input.subscriptionId, 64),
    observedAt: now.toISOString(),
    callerSource: input.caller ? 'provided' : collected.observedCaller ? 'observed' : 'unavailable',
    platformEvidence: input.platformSites === undefined ? 'unavailable' : 'available',
    coverage: {
      resourceGraphPages: collected.resourceGraphPages,
      activityLookbackDays: 89,
      complete: Object.values(collected.activityByResourceGroup).every((activity) => activity.coverage.complete),
    },
    counts: {
      logicalDeployments: deployments.length,
      platformSites: sites.length,
      azureNodes: deployments.reduce((sum, item) => sum + item.nodes.length, 0),
    },
    deployments,
    platformOnly,
  };
  const canonicalInventory = JSON.parse(canonicalStringify(inventory));
  return JSON.parse(
    canonicalStringify({
      kind: 'azure-ce-inventory',
      digestSha256: canonicalSha256(canonicalInventory),
      inventory: canonicalInventory,
    }),
  );
}
function validateInput(input) {
  if (!SUBSCRIPTION_ID_PATTERN.test(input.subscriptionId)) throw failure('input_validation', 'invalid_input');
  if (input.caller) {
    const { objectId, userPrincipalName } = input.caller;
    if (objectId === undefined && userPrincipalName === undefined) throw failure('input_validation', 'invalid_input');
    if (objectId !== undefined && !SUBSCRIPTION_ID_PATTERN.test(objectId))
      throw failure('input_validation', 'invalid_input');
    if (
      userPrincipalName !== undefined &&
      (!userPrincipalName.trim() || userPrincipalName.length > 320 || HAS_CONTROL.test(userPrincipalName))
    )
      throw failure('input_validation', 'invalid_input');
  }
  for (const site of input.platformSites ?? []) {
    if (!site.name?.trim() || HAS_CONTROL.test(site.name)) throw failure('input_validation', 'invalid_input');
    for (const mac of site.nodes?.flatMap((node) => node.macAddresses ?? []) ?? [])
      if (!normalizeMac(mac)) throw failure('input_validation', 'invalid_input');
  }
}
function parseGraphPage(stdout) {
  const parsed = parseAzJsonOutput(stdout);
  const envelope = Array.isArray(parsed) ? { data: parsed } : parsed;
  if (!Array.isArray(envelope.data)) throw new Error('Azure CE inventory Resource Graph response was invalid.');
  if (envelope.data.some((item) => !item || typeof item !== 'object' || Array.isArray(item)))
    throw new Error('Azure CE inventory Resource Graph response was invalid.');
  const rawToken = envelope.skipToken ?? envelope.skip_token;
  return {
    data: envelope.data,
    ...(typeof rawToken === 'string' && rawToken ? { skipToken: rawToken } : {}),
  };
}
async function collectAzureCeInventory(input, api, now = () => new Date(), signal) {
  validateInput(input);
  const options = { signal, env: RESOURCE_GRAPH_ENV };
  const extension = await execAtStage(
    api,
    'setup',
    ['extension', 'show', '--name', 'resource-graph', '--output', 'json'],
    options,
  );
  if (extension.exitCode !== 0) {
    const errorType = cliErrorType(extension.stderr, extension.stdout, extension.exitCode);
    throw failure('setup', errorType === 'exec_error' ? 'unsupported_extension' : errorType);
  }
  const help = await execAtStage(api, 'setup', ['graph', 'query', '--help'], options);
  const helpText = `${help.stdout}
${help.stderr}`;
  if (help.exitCode !== 0) {
    const errorType = cliErrorType(help.stderr, help.stdout, help.exitCode);
    throw failure('setup', errorType === 'exec_error' ? 'unsupported_extension' : errorType);
  }
  if (RESOURCE_GRAPH_REQUIRED_FLAGS.some((flag) => !helpText.includes(flag)))
    throw failure('setup', 'unsupported_extension');
  let observedCaller;
  if (!input.caller) {
    try {
      const account = await api.exec(
        'az',
        ['account', 'show', '--subscription', input.subscriptionId, '--query', '{user:user}', '--output', 'json'],
        { signal },
      );
      if (account.exitCode === 0) {
        const parsed = parseAzJsonOutput(account.stdout);
        const user = parsed.user;
        observedCaller = typeof user?.name === 'string' ? user.name : undefined;
      }
    } catch {}
  }
  const rows = [];
  const seenTokens = new Set();
  let skipToken;
  let resourceGraphPages = 0;
  do {
    const args = buildResourceGraphArgs({
      query: AZURE_CE_INVENTORY_QUERY,
      subscriptions: [input.subscriptionId],
      first: 1000,
      ...(skipToken ? { skip_token: skipToken } : {}),
    });
    const result = await execAtStage(api, 'resource_graph', args, options);
    if (result.exitCode !== 0 || /partial scope|inaccessible scope|not authorized for all/i.test(result.stderr))
      throw failure('resource_graph', cliErrorType(result.stderr, result.stdout, result.exitCode || 1));
    let page;
    try {
      page = parseGraphPage(result.stdout);
    } catch {
      throw failure('resource_graph', 'invalid_response');
    }
    rows.push(...page.data);
    resourceGraphPages += 1;
    skipToken = page.skipToken;
    if (skipToken && seenTokens.has(skipToken)) throw failure('resource_graph', 'paging_error');
    if (skipToken) seenTokens.add(skipToken);
  } while (skipToken);
  const normalized = rows.map(normalizeResource2);
  const candidateGroups = new Set(
    normalized.filter((item) => item.candidate).map((item) => normalizeKey(item.resourceGroup)),
  );
  const candidateVms = normalized.filter((item) => item.type === 'microsoft.compute/virtualmachines' && item.candidate);
  const runtimeByVmId = {};
  for (const vm of candidateVms.sort((a, b) => normalizeKey(a.id).localeCompare(normalizeKey(b.id)))) {
    const result = await execAtStage(
      api,
      'vm_runtime',
      [
        'vm',
        'get-instance-view',
        '--ids',
        vm.id,
        '--subscription',
        input.subscriptionId,
        '--query',
        "{powerState:instanceView.statuses[?starts_with(code, 'PowerState/')].code | [0]}",
        '--output',
        'json',
      ],
      { signal },
    );
    if (result.exitCode !== 0) throw failure('vm_runtime', cliErrorType(result.stderr, result.stdout, result.exitCode));
    try {
      const payload = parseAzJsonOutput(result.stdout);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload))
        throw failure('vm_runtime', 'invalid_response');
      if (payload.powerState !== undefined && payload.powerState !== null && typeof payload.powerState !== 'string')
        throw failure('vm_runtime', 'invalid_response');
      runtimeByVmId[vm.id] = payload.powerState ?? 'unknown';
    } catch {
      throw failure('vm_runtime', 'invalid_response');
    }
  }
  const activityByResourceGroup = {};
  for (const group of [...candidateGroups].sort()) {
    const display = normalized.find((item) => normalizeKey(item.resourceGroup) === group)?.resourceGroup ?? group;
    const params = {
      subscription: input.subscriptionId,
      resource_group: display,
      status: 'succeeded',
      operation_family: 'write',
      max_events: 1000,
      lookback_days: 89,
    };
    const result = await execAtStage(api, 'activity_log', buildActivityLogArgs(params), { signal });
    if (result.exitCode !== 0)
      throw failure('activity_log', cliErrorType(result.stderr, result.stdout, result.exitCode));
    try {
      const parsed = parseAzJsonOutput(result.stdout);
      const payload = Array.isArray(parsed) ? parsed : Array.isArray(parsed.value) ? parsed.value : undefined;
      if (!payload) throw new Error('bad payload');
      activityByResourceGroup[group] = normalizeActivityLogPayload(params, payload, now());
    } catch {
      throw failure('activity_log', 'invalid_response');
    }
  }
  try {
    return buildAzureCeInventoryEnvelope(
      input,
      { rows, runtimeByVmId, activityByResourceGroup, resourceGraphPages, observedCaller },
      now(),
    );
  } catch {
    throw failure('envelope_serialization', 'serialization_error');
  }
}
function formatAzureCeInventory(envelope, artifactId) {
  const { inventory } = envelope;
  const classifications = inventory.deployments.reduce((result, deployment) => {
    result[deployment.classification] = (result[deployment.classification] ?? 0) + 1;
    return result;
  }, {});
  const lines = [
    'Azure Customer Edge inventory (read-only)',
    `Logical deployments: ${inventory.counts.logicalDeployments}`,
    `Azure nodes: ${inventory.counts.azureNodes}`,
    `Platform sites: ${inventory.counts.platformSites}`,
    `Platform evidence: ${inventory.platformEvidence}`,
    `Classifications: ${
      Object.entries(classifications)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, count]) => `${key}=${count}`)
        .join(', ') || 'none'
    }`,
    `Digest: ${envelope.digestSha256}`,
    `Inventory artifact: ${artifactId ? `artifact://${artifactId}` : 'session memory only'}`,
  ];
  return lines.join(`
`);
}
var AZURE_CE_INVENTORY_SCHEMA_VERSION = 1,
  AZURE_CE_INVENTORY_QUERY = `resourcecontainers
| where type =~ 'microsoft.resources/subscriptions/resourcegroups'
| project inventoryKind='resourceGroup', id, name, type, resourceGroup=name, location, tags,
    provisioningState=tostring(properties.provisioningState), imagePublisher='', imageOffer='', imageSku='',
    computerName='', networkInterfaceIds=dynamic([]), diskIds=dynamic([]), macAddress='', primary=false,
    vmId='', subnetIds=dynamic([]), networkSecurityGroupId='', publicIpResourceIds=dynamic([]),
    routeTableId='', routeNames=dynamic([]), bgpPeerStates=dynamic([])
| union (Resources
  | where type in~ (
      'microsoft.compute/virtualmachines', 'microsoft.compute/disks',
      'microsoft.network/networkinterfaces', 'microsoft.network/networksecuritygroups',
      'microsoft.network/routetables', 'microsoft.network/virtualhubs',
      'microsoft.network/virtualhubs/bgpconnections', 'microsoft.network/loadbalancers',
      'microsoft.network/bastionhosts', 'microsoft.network/publicipaddresses',
      'microsoft.network/natgateways', 'microsoft.network/azurefirewalls',
      'microsoft.network/applicationgateways', 'microsoft.network/virtualnetworks')
  | project inventoryKind='resource', id, name, type, resourceGroup, location, tags,
      provisioningState=tostring(properties.provisioningState),
      imagePublisher=tostring(properties.storageProfile.imageReference.publisher),
      imageOffer=tostring(properties.storageProfile.imageReference.offer),
      imageSku=tostring(properties.storageProfile.imageReference.sku),
      computerName=tostring(properties.osProfile.computerName),
      networkInterfaceIds=properties.networkProfile.networkInterfaces.id,
      diskIds=array_concat(pack_array(tostring(properties.storageProfile.osDisk.managedDisk.id)), properties.storageProfile.dataDisks.managedDisk.id),
      macAddress=tostring(properties.macAddress), primary=tobool(properties.primary),
      vmId=tostring(properties.virtualMachine.id), subnetIds=properties.ipConfigurations.properties.subnet.id,
      networkSecurityGroupId=tostring(properties.networkSecurityGroup.id),
      publicIpResourceIds=array_concat(properties.ipConfigurations.properties.publicIPAddress.id, properties.frontendIPConfigurations.properties.publicIPAddress.id),
      routeTableId=tostring(properties.routeTable.id), routeNames=properties.routes.name,
      bgpPeerStates=properties.bgpConnections.properties.peerState)
| order by tolower(resourceGroup) asc, tolower(type) asc, tolower(name) asc, tolower(id) asc`,
  AzureCeInventoryFailure,
  CONTROL,
  HAS_CONTROL,
  IPV4,
  IPV6,
  CE_SIGNAL,
  ROUTING_TYPES,
  DEPENDENCY_KINDS;
var init_inventory = __esm(() => {
  init_exec();
  init_resource_graph();
  init_types();
  init_az_activity_log_list2();
  init_az_resource_graph_query2();
  init_shared();
  init_canonical();
  AzureCeInventoryFailure = class AzureCeInventoryFailure extends Error {
    failureStage;
    errorType;
    constructor(failureStage, errorType) {
      super('Azure CE inventory failed.');
      this.failureStage = failureStage;
      this.errorType = errorType;
      this.name = 'AzureCeInventoryFailure';
    }
  };
  CONTROL = /[\u0000-\u001F\u007F]/g;
  HAS_CONTROL = /[\u0000-\u001F\u007F]/;
  IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?\b/g;
  IPV6 = /\b(?:[0-9a-f]{0,4}:){2,}[0-9a-f:]+(?:\/\d{1,3})?\b/gi;
  CE_SIGNAL =
    /\bcustomer[ _-]?edge\b|\bsecure[ _-]?mesh\b|\bf5xc\b|\bdistributed[ _-]?cloud\b|(?:^|[-_])(?:xc|ce)(?:[-_]|$)/i;
  ROUTING_TYPES = new Set([
    'microsoft.network/routetables',
    'microsoft.network/virtualhubs',
    'microsoft.network/virtualhubs/bgpconnections',
  ]);
  DEPENDENCY_KINDS = {
    'microsoft.compute/disks': 'disk',
    'microsoft.network/networkinterfaces': 'network-interface',
    'microsoft.network/networksecuritygroups': 'network-security-group',
    'microsoft.network/routetables': 'route-table',
    'microsoft.network/virtualhubs': 'route-server',
    'microsoft.network/virtualhubs/bgpconnections': 'bgp-peer',
    'microsoft.network/loadbalancers': 'load-balancer',
    'microsoft.network/bastionhosts': 'bastion',
    'microsoft.network/publicipaddresses': 'public-ip',
    'microsoft.network/natgateways': 'nat-gateway',
    'microsoft.network/azurefirewalls': 'firewall',
    'microsoft.network/applicationgateways': 'proxy-egress',
    'microsoft.network/virtualnetworks': 'virtual-network',
  };
});

// plugins/azure/src/prompts/azure-ce-inventory.md
var azure_ce_inventory_default = `# Azure Customer Edge Inventory

Build a deterministic, read-only inventory of existing F5 Customer Edge resources across one Azure
subscription. The tool owns Resource Graph paging, VM instance-view collection, Activity Log evidence,
privacy filtering, platform correlation, classification, canonicalization, and artifact persistence.

Pass the subscription UUID. Caller identity and non-secret platform-site evidence are optional. The result
keeps provisioning, runtime, platform, routing, and traffic-health evidence separate. Caller association is
historical evidence, never an ownership claim. Public and private addresses, prefixes, public-resource FQDNs,
bootstrap data, secrets, arbitrary tags, raw events, and continuation tokens are excluded. Do not substitute
generic \`az_exec\`, deployment discovery, planning, mutation, or web research for this inventory operation.
`;
var init_azure_ce_inventory = () => {};

// plugins/azure/src/tools/azure-ce-inventory.ts
function failureResult(failureStage, errorType) {
  const authenticationFailure = errorType === 'auth_required' || errorType === 'session_expired';
  return {
    content: [
      {
        type: 'text',
        text:
          errorType === 'invalid_input'
            ? 'Azure CE inventory input is invalid.'
            : 'Azure CE inventory failed without returning partial resource data.',
      },
    ],
    isError: true,
    details: {
      tool: 'azure_ce_inventory',
      outcome: authenticationFailure
        ? 'authentication_failure'
        : errorType === 'invalid_input'
          ? 'invalid_input'
          : 'execution_failure',
      failureStage,
      errorType,
    },
  };
}
function createAzureCeInventoryTool(pi, makeApi = makeExecApi, now = () => new Date()) {
  const { Type } = pi.typebox;
  const platformNode = Type.Object({
    hostname: Type.Optional(Type.String()),
    macAddresses: Type.Optional(Type.Array(Type.String())),
  });
  const platformSite = Type.Object({
    namespace: Type.Optional(Type.String()),
    name: Type.String(),
    siteState: Type.Optional(Type.String()),
    creator: Type.Optional(Type.String()),
    nodes: Type.Optional(Type.Array(platformNode)),
  });
  return {
    name: 'azure_ce_inventory',
    label: 'Inventory Azure Customer Edge',
    description: azure_ce_inventory_default,
    parameters: Type.Object({
      subscriptionId: Type.String({ description: 'Azure subscription UUID' }),
      caller: Type.Optional(
        Type.Object(
          {
            objectId: Type.Optional(Type.String({ pattern: SUBSCRIPTION_ID_PATTERN.source })),
            userPrincipalName: Type.Optional(
              Type.String({ minLength: 1, maxLength: 320, pattern: '^[^\\u0000-\\u001F\\u007F]+$' }),
            ),
          },
          { minProperties: 1 },
        ),
      ),
      platformSites: Type.Optional(Type.Array(platformSite)),
    }),
    async execute(_id, params, signal, _update, ctx) {
      let envelope;
      try {
        envelope = await collectAzureCeInventory(params, makeApi(ctx.cwd), now, signal);
      } catch (error) {
        if (error instanceof AzureCeInventoryFailure) return failureResult(error.failureStage, error.errorType);
        return failureResult('collector', 'unexpected_error');
      }
      let serialized;
      try {
        serialized = canonicalStringify(envelope);
      } catch {
        return failureResult('envelope_serialization', 'serialization_error');
      }
      let artifactId;
      try {
        artifactId = await ctx.sessionManager.saveArtifact(serialized, 'azure-ce-inventory');
      } catch {
        return failureResult('artifact_persistence', 'persistence_error');
      }
      return {
        content: [{ type: 'text', text: formatAzureCeInventory(envelope, artifactId) }],
        details: {
          tool: 'azure_ce_inventory',
          outcome: 'success',
          artifactId,
          digestSha256: envelope.digestSha256,
          inventory: envelope.inventory,
        },
      };
    },
  };
}
var init_azure_ce_inventory2 = __esm(() => {
  init_types();
  init_canonical();
  init_inventory();
  init_azure_ce_inventory();
  init_shared();
});

// plugins/azure/src/prompts/az-help.md
var az_help_default = `# View Azure CLI Help

Fetch help documentation for any \`az\` CLI command group or subcommand.

Use this tool to discover available commands, flags, and usage patterns for az CLI subcommands that are not covered by the embedded tool documentation.

## Usage

Pass the command path (without \`az\` prefix) to get help:

**Example:** To see \`az network vnet --help\`:

\`\`\`json
{ "command_path": "network vnet" }
\`\`\`

**Example:** To see \`az storage blob --help\`:

\`\`\`json
{ "command_path": "storage blob" }
\`\`\`

**Example:** To see top-level \`az --help\`:

\`\`\`json
{ "command_path": "" }
\`\`\`

## When to Use

- Before using \`az_exec\` with an unfamiliar command group
- To discover available subcommands within a group
- To find the correct flags for a specific operation
- To check required vs optional parameters

## Output

Returns the raw \`az <command> --help\` output, which includes:

- Available subgroups and commands
- Command arguments with descriptions
- Required vs optional parameters
- Usage examples
`;
var init_az_help = () => {};

// plugins/azure/src/tools/az-help.ts
function createAzHelpTool(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  const parameters = Type.Object({
    command_path: Type.Optional(
      Type.String({
        description:
          'Command path without "az" prefix, e.g. "network vnet" or "storage blob". Empty for top-level help.',
      }),
    ),
  });
  return {
    name: 'az_help',
    label: 'Azure CLI Help',
    description: az_help_default,
    parameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const base = { tool: 'az_help' };
      const commandPath = params.command_path?.trim() ?? '';
      if (
        commandPath.length > 0 &&
        (!HELP_PATH_PATTERN.test(commandPath) || commandPath.split(' ').some((part) => part.startsWith('-')))
      ) {
        return errorResult(
          `Error: invalid command path "${commandPath}". Only lowercase letters, hyphens, and spaces are allowed.`,
          base,
        );
      }
      const api = makeApi(ctx.cwd);
      const args = helpArgs(params.command_path);
      try {
        const result = await api.exec('az', args, { signal: signal ?? undefined });
        if (result.exitCode !== 0) {
          const msg = result.stderr || result.stdout || `az ${commandPath} --help failed (exit ${result.exitCode})`;
          return errorResult(`Error: ${msg}`, { ...base, errorType: 'exec_error' });
        }
        const output = result.stdout || result.stderr;
        if (!output.trim()) {
          return errorResult(`No help output for "az ${commandPath}".`, base);
        }
        return textResult(output, base);
      } catch (err) {
        return errorResult(`Error: ${err instanceof Error ? err.message : String(err)}`, {
          ...base,
          errorType: 'exec_error',
        });
      }
    },
  };
}
var init_az_help2 = __esm(() => {
  init_types();
  init_az_help();
  init_shared();
});

// plugins/azure/src/ce/native-action-recovery.ts
function object(value, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value;
}
function nested(value, keys) {
  let current = value;
  for (const key of keys) {
    if (!current || typeof current !== 'object') return;
    current = current[key];
  }
  return current;
}
function lower(value) {
  return typeof value === 'string' ? value.toLowerCase() : '';
}
function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
function options(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return [];
  const values = [];
  for (let cursor = index + 1; cursor < args.length && !args[cursor].startsWith('--'); cursor++)
    values.push(args[cursor]);
  return values;
}
function errorCode(stdout, stderr) {
  for (const raw of [stderr, stdout]) {
    try {
      const value = JSON.parse(raw);
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const record = value;
        if (typeof record.code === 'string') return record.code;
        if (record.error && typeof record.error === 'object' && !Array.isArray(record.error)) {
          const code = record.error.code;
          if (typeof code === 'string') return code;
        }
      }
    } catch {}
  }
  return (
    /^(?:ERROR:\s*)?\(([A-Za-z][A-Za-z0-9]+)\)/m.exec(stderr)?.[1] ??
    /^Code:\s*([A-Za-z][A-Za-z0-9]+)\s*$/m.exec(stderr)?.[1]
  );
}
function assertRecoverableAction(action) {
  if (
    !action.mutates ||
    action.command !== 'az' ||
    !action.args ||
    !action.resourceId ||
    !RECOVERABLE_KINDS.has(action.kind)
  )
    throw new Error('Azure native mutation has no supported durable recovery contract');
}
function expectedRequest(plan, action) {
  assertRecoverableAction(action);
  const resourceId = action.resourceId.toLowerCase();
  return {
    actionId: action.id,
    kind: action.kind,
    resourceId,
    requestSha256: canonicalSha256({
      planSha256: plan.planSha256,
      actionId: action.id,
      kind: action.kind,
      resourceId,
      args: action.args,
    }),
  };
}
function buildAzureNativePendingAction(plan, action) {
  return expectedRequest(plan, action);
}
function validateAzureNativePendingAction(plan, completedActionIds, value) {
  const action = plan.actions[completedActionIds.length];
  if (!action) throw new Error('Pending Azure native mutation has no next immutable action');
  const expected = expectedRequest(plan, action);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Pending Azure native mutation is malformed');
  const candidate = value;
  if (
    Object.keys(candidate).sort().join(',') !== 'actionId,kind,requestSha256,resourceId' ||
    canonicalSha256(candidate) !== canonicalSha256(expected)
  )
    throw new Error('Pending Azure native mutation differs from the immutable request');
  return expected;
}
function ownershipParent(resourceId) {
  const patterns = [
    /^(.*\/providers\/microsoft\.network\/virtualnetworks\/[^/]+)\/subnets\/[^/]+$/i,
    /^(.*\/providers\/microsoft\.network\/networksecuritygroups\/[^/]+)\/securityrules\/[^/]+$/i,
    /^(.*\/providers\/microsoft\.network\/routetables\/[^/]+)\/routes\/[^/]+$/i,
    /^(.*\/providers\/microsoft\.network\/virtualhubs\/[^/]+)\/bgpconnections\/[^/]+$/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(resourceId);
    if (match) return match[1];
  }
}
async function readResource(plan, resourceId, api, signal, vm = false) {
  const group = !resourceId.toLowerCase().includes('/providers/');
  const result = await api.exec(
    'az',
    group
      ? [
          'group',
          'show',
          '--name',
          plan.intent.resourceGroup,
          '--subscription',
          plan.subscription.id,
          '--output',
          'json',
        ]
      : vm
        ? [
            'vm',
            'show',
            '--ids',
            resourceId,
            '--show-details',
            '--subscription',
            plan.subscription.id,
            '--output',
            'json',
          ]
        : ['resource', 'show', '--ids', resourceId, '--subscription', plan.subscription.id, '--output', 'json'],
    signal ? { signal } : undefined,
  );
  if (result.exitCode !== 0) {
    const code = errorCode(result.stdout, result.stderr);
    if (code === 'ResourceNotFound' || code === 'ResourceGroupNotFound') return;
    throw new Error('Azure pending mutation postcondition evidence is unavailable');
  }
  let value;
  try {
    value = object(JSON.parse(result.stdout), 'Malformed Azure pending mutation postcondition evidence');
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Malformed Azure pending mutation postcondition evidence');
    throw error;
  }
  if (lower(value.id) !== resourceId.toLowerCase() || value.nextLink !== undefined)
    throw new Error('Azure pending mutation returned a different resource identity');
  return value;
}
function assertOwner(plan, value, expectedPlanSha256 = plan.planSha256) {
  const tags = object(value.tags, 'Azure pending mutation ownership tags are unavailable');
  if (
    tags['xcsh-managed-by'] !== 'azure-ce' ||
    tags['xcsh-deployment-id'] !== plan.deploymentName ||
    tags['xcsh-execution-engine'] !== plan.engine ||
    tags['xcsh-plan-sha256'] !== expectedPlanSha256
  )
    throw new Error('Azure pending mutation belongs to another owner or immutable plan');
}
async function assertTargetOwnership(plan, action, value, api, signal) {
  const expectedOwner = action.expectedOwnerPlanSha256 ?? plan.planSha256;
  const parentId = ownershipParent(action.resourceId ?? '');
  if (!parentId) {
    assertOwner(plan, value, expectedOwner);
    return;
  }
  const parent = await readResource(plan, parentId, api, signal);
  if (!parent) throw new Error('Azure pending mutation ownership parent is absent');
  assertOwner(plan, parent, expectedOwner);
}
function sameStrings(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => lower(value) === expected[index].toLowerCase())
  );
}
function requirePostcondition(condition, kind) {
  if (!condition) throw new Error(`Azure pending ${kind} postcondition differs from the immutable request`);
  return true;
}
function routeMatches(route, action) {
  const args = action.args ?? [];
  const properties =
    route.properties && typeof route.properties === 'object' && !Array.isArray(route.properties)
      ? route.properties
      : route;
  return (
    properties.addressPrefix === option(args, '--address-prefix') &&
    lower(properties.nextHopType) === lower(option(args, '--next-hop-type')) &&
    lower(properties.nextHopIpAddress ?? '') === lower(option(args, '--next-hop-ip-address') ?? '')
  );
}
function childPostcondition(action, value) {
  const args = action.args ?? [];
  const properties = object(value.properties ?? {}, 'Azure pending mutation properties are malformed');
  if (action.kind === 'subnet-create') {
    const expected = options(args, '--address-prefixes');
    const actual = Array.isArray(properties.addressPrefixes) ? properties.addressPrefixes : [properties.addressPrefix];
    return requirePostcondition(sameStrings(actual, expected), action.kind);
  }
  if (action.kind === 'nsg-rule-create') {
    return requirePostcondition(
      Number(properties.priority) === Number(option(args, '--priority')) &&
        lower(properties.direction) === lower(option(args, '--direction')) &&
        lower(properties.protocol) === lower(option(args, '--protocol')) &&
        lower(properties.access) === lower(option(args, '--access')) &&
        sameStrings(properties.sourceAddressPrefixes, options(args, '--source-address-prefixes')) &&
        sameStrings(properties.destinationAddressPrefixes, options(args, '--destination-address-prefixes')) &&
        sameStrings(properties.destinationPortRanges, options(args, '--destination-port-ranges')),
      action.kind,
    );
  }
  if (action.kind === 'route-server-peer-create' || action.kind === 'route-server-peer-update') {
    return requirePostcondition(
      lower(properties.peerIp) === lower(option(args, '--peer-ip')) &&
        Number(properties.peerAsn) === Number(option(args, '--peer-asn')),
      action.kind,
    );
  }
  if (action.kind === 'route-create') return requirePostcondition(routeMatches(value, action), action.kind);
  return true;
}
function brownfieldPostcondition(action, value) {
  const args = action.args ?? [];
  if (args.slice(0, 4).join(' ') === 'network route-table route create') {
    const routes = nested(value, ['properties', 'routes']);
    const selected = Array.isArray(routes)
      ? routes.filter(
          (candidate) =>
            candidate &&
            typeof candidate === 'object' &&
            !Array.isArray(candidate) &&
            String(candidate.name) === option(args, '--name'),
        )
      : [];
    return selected.length === 1 && routeMatches(selected[0], action);
  }
  if (args.slice(0, 4).join(' ') === 'network route-table route delete') {
    const routes = nested(value, ['properties', 'routes']);
    return (
      Array.isArray(routes) &&
      !routes.some(
        (candidate) =>
          candidate &&
          typeof candidate === 'object' &&
          !Array.isArray(candidate) &&
          String(candidate.name) === option(args, '--name'),
      )
    );
  }
  if (args.slice(0, 4).join(' ') === 'network vnet subnet update') {
    const actual = lower(nested(value, ['properties', 'routeTable', 'id']));
    const expected = lower(option(args, '--route-table'));
    return args.includes('--remove') ? !actual : Boolean(expected) && actual === expected;
  }
  throw new Error('Azure brownfield recovery request is unsupported');
}
function resourcePostcondition(plan, action, value) {
  const args = action.args ?? [];
  const provisioning = nested(value, ['properties', 'provisioningState']) ?? value.provisioningState;
  if (typeof provisioning === 'string' && provisioning !== 'Succeeded') return false;
  switch (action.kind) {
    case 'resource-group-create':
      return requirePostcondition(lower(value.location) === plan.region.toLowerCase(), action.kind);
    case 'vnet-create':
      return requirePostcondition(
        sameStrings(
          nested(value, ['properties', 'addressSpace', 'addressPrefixes']),
          options(args, '--address-prefixes'),
        ),
        action.kind,
      );
    case 'public-ip-create':
      return requirePostcondition(
        lower(nested(value, ['sku', 'name'])) === lower(option(args, '--sku')) &&
          lower(nested(value, ['properties', 'publicIPAllocationMethod'])) ===
            lower(option(args, '--allocation-method')),
        action.kind,
      );
    case 'nic-create': {
      const ipConfigurations = nested(value, ['properties', 'ipConfigurations']);
      const configurations = Array.isArray(ipConfigurations) ? ipConfigurations : [];
      const expectedSubnet = option(args, '--subnet');
      const groupScope = action.resourceId?.slice(
        0,
        action.resourceId.toLowerCase().indexOf('/providers/microsoft.network/'),
      );
      const subnetId = expectedSubnet?.startsWith('/')
        ? expectedSubnet
        : `${groupScope}/providers/Microsoft.Network/virtualNetworks/${option(args, '--vnet-name')}/subnets/${expectedSubnet}`;
      const publicIp = option(args, '--public-ip-address');
      const publicIpId = publicIp
        ? `${groupScope}/providers/Microsoft.Network/publicIPAddresses/${publicIp}`
        : undefined;
      const nsg = option(args, '--network-security-group');
      const nsgId = nsg ? `${groupScope}/providers/Microsoft.Network/networkSecurityGroups/${nsg}` : undefined;
      return requirePostcondition(
        configurations.length === 1 &&
          lower(nested(configurations[0], ['properties', 'subnet', 'id'])) === lower(subnetId) &&
          lower(nested(configurations[0], ['properties', 'publicIPAddress', 'id'])) === lower(publicIpId) &&
          lower(nested(value, ['properties', 'networkSecurityGroup', 'id'])) === lower(nsgId),
        action.kind,
      );
    }
    case 'vm-create': {
      const expectedNics = options(args, '--nics').map(
        (name) =>
          `${action.resourceId?.slice(0, action.resourceId.toLowerCase().indexOf('/providers/microsoft.compute/'))}` +
          `/providers/Microsoft.Network/networkInterfaces/${name}`,
      );
      const actualNics =
        nested(value, ['networkProfile', 'networkInterfaces']) ??
        nested(value, ['properties', 'networkProfile', 'networkInterfaces']);
      const image =
        nested(value, ['storageProfile', 'imageReference']) ??
        nested(value, ['properties', 'storageProfile', 'imageReference']);
      const marketplacePlan = value.plan ?? nested(value, ['properties', 'plan']);
      return requirePostcondition(
        lower(
          nested(value, ['hardwareProfile', 'vmSize']) ?? nested(value, ['properties', 'hardwareProfile', 'vmSize']),
        ) === lower(option(args, '--size')) &&
          Array.isArray(actualNics) &&
          sameStrings(
            actualNics.map((row) => nested(row, ['id'])),
            expectedNics,
          ) &&
          lower(nested(image, ['publisher'])) === lower(option(args, '--plan-publisher')) &&
          lower(nested(image, ['offer'])) === lower(option(args, '--plan-product')) &&
          lower(nested(image, ['sku'])) === lower(option(args, '--plan-name')) &&
          lower(nested(image, ['version'])) === lower(plan.image.version) &&
          lower(nested(marketplacePlan, ['publisher'])) === lower(option(args, '--plan-publisher')) &&
          lower(nested(marketplacePlan, ['product'])) === lower(option(args, '--plan-product')) &&
          lower(nested(marketplacePlan, ['name'])) === lower(option(args, '--plan-name')),
        action.kind,
      );
    }
    case 'route-server-create': {
      const configurations = nested(value, ['properties', 'ipConfigurations']);
      const rows = Array.isArray(configurations) ? configurations : [];
      const hostedSubnet = option(args, '--hosted-subnet');
      const groupScope = action.resourceId?.slice(
        0,
        action.resourceId.toLowerCase().indexOf('/providers/microsoft.network/'),
      );
      const publicIp = `${groupScope}/providers/Microsoft.Network/publicIPAddresses/${option(args, '--public-ip-address')}`;
      return requirePostcondition(
        rows.some(
          (row) =>
            lower(nested(row, ['properties', 'subnet', 'id'])) === lower(hostedSubnet) &&
            lower(nested(row, ['properties', 'publicIPAddress', 'id'])) === lower(publicIp),
        ),
        action.kind,
      );
    }
    case 'nic-update':
      return requirePostcondition(
        lower(nested(value, ['properties', 'ipConfigurations', '0', 'properties', 'subnet', 'id'])) ===
          lower(option(args, '--subnet')),
        action.kind,
      );
    case 'route-association-update':
      return requirePostcondition(
        lower(nested(value, ['properties', 'routeTable', 'id'])) === lower(option(args, '--route-table')),
        action.kind,
      );
    case 'brownfield-restore':
      return brownfieldPostcondition(action, value);
    default:
      return childPostcondition(action, value);
  }
}
async function azureNativePendingActionConverged(plan, action, api, signal) {
  assertRecoverableAction(action);
  const value = await readResource(
    plan,
    action.resourceId,
    api,
    signal,
    ['vm-create', 'vm-start', 'vm-stop', 'vm-deallocate', 'vm-resize', 'vm-delete'].includes(action.kind),
  );
  if (action.kind === 'vm-delete') return value === undefined;
  if (!value) return false;
  if (
    ['route-association-update', 'brownfield-restore'].includes(action.kind) ||
    (action.kind === 'route-create' && plan.intent.brownfield.routeChanges.length > 0)
  ) {
    return resourcePostcondition(plan, action, value);
  }
  await assertTargetOwnership(plan, action, value, api, signal);
  if (action.kind === 'vm-start' || action.kind === 'vm-stop' || action.kind === 'vm-deallocate') {
    const expected = action.kind === 'vm-start' ? 'running' : 'deallocated';
    return lower(value.powerState).replace(/^vm\s+/, '') === expected;
  }
  if (action.kind === 'vm-resize') {
    return (
      lower(
        nested(value, ['hardwareProfile', 'vmSize']) ?? nested(value, ['properties', 'hardwareProfile', 'vmSize']),
      ) === lower(option(action.args ?? [], '--size'))
    );
  }
  return resourcePostcondition(plan, action, value);
}
var RECOVERABLE_KINDS;
var init_native_action_recovery = __esm(() => {
  init_canonical();
  RECOVERABLE_KINDS = new Set([
    'resource-group-create',
    'vnet-create',
    'subnet-create',
    'nsg-create',
    'nsg-rule-create',
    'public-ip-create',
    'nic-create',
    'nic-update',
    'vm-create',
    'vm-start',
    'vm-stop',
    'vm-deallocate',
    'vm-resize',
    'vm-delete',
    'route-table-create',
    'route-create',
    'route-association-update',
    'route-server-create',
    'route-server-peer-create',
    'route-server-peer-update',
    'brownfield-restore',
  ]);
});

// plugins/azure/src/ce/types.ts
var AZURE_CE_SCHEMA_VERSION = 3,
  AZURE_CE_CHECKPOINT_SCHEMA_VERSION = 4,
  AZURE_CE_SHARED_CONTRACT_URL =
    'https://f5-sales-demo.github.io/multi-cloud-networking/_llms-txt/en/customer-edge/automation-contract.txt';

// plugins/azure/src/ce/workload-fixture.ts
var AZURE_CE_WORKLOAD_FIXTURE_VM_SIZE = 'Standard_B1s',
  AZURE_CE_WORKLOAD_FIXTURE_VCPUS = 1;

// plugins/azure/src/ce/recovery.ts
function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function hasOnlyKeys(value, keys) {
  return Object.keys(value).every((key) => keys.has(key));
}
function isStringRecord(value) {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');
}
function assertObservationShape(value) {
  if (!isRecord(value) || value.schemaVersion !== AZURE_CE_SCHEMA_VERSION) {
    throw new Error('Persisted Azure CE checkpoint has an invalid observation snapshot');
  }
  const subscription = value.subscription;
  const image = value.image;
  const research = value.research;
  if (
    !isRecord(subscription) ||
    !['id', 'tenantId', 'cloud'].every((key) => typeof subscription[key] === 'string') ||
    !isRecord(image) ||
    !['publisher', 'offer', 'plan', 'version', 'urn'].every((key) => typeof image[key] === 'string') ||
    typeof image.termsAccepted !== 'boolean' ||
    !Array.isArray(value.regions) ||
    !Array.isArray(value.resources) ||
    !isRecord(research) ||
    research.method !== 'azure-cli-live' ||
    research.officialSourceRetrieval !== 'live' ||
    typeof research.catalogRegion !== 'string' ||
    !Array.isArray(research.commands) ||
    !research.commands.every((entry) => typeof entry === 'string') ||
    !Array.isArray(research.officialSources) ||
    !research.officialSources.every((entry) => typeof entry === 'string') ||
    !Array.isArray(research.sourceReceipts) ||
    !research.sourceReceipts.every(
      (entry) =>
        isRecord(entry) && typeof entry.url === 'string' && /^[a-f0-9]{64}$/.test(String(entry.normalizedSha256)),
    ) ||
    !isRecord(research.sharedContract) ||
    typeof research.sharedContract.url !== 'string' ||
    typeof research.sharedContract.contractId !== 'string' ||
    typeof research.sharedContract.contractVersion !== 'string' ||
    !/^[a-f0-9]{64}$/.test(String(research.sharedContract.normalizedSha256))
  ) {
    throw new Error('Persisted Azure CE checkpoint has an invalid observation snapshot');
  }
  for (const region of value.regions) {
    if (
      !isRecord(region) ||
      typeof region.name !== 'string' ||
      typeof region.rank !== 'number' ||
      typeof region.eligible !== 'boolean' ||
      !Array.isArray(region.reasons) ||
      !region.reasons.every((entry) => typeof entry === 'string') ||
      !Array.isArray(region.zones) ||
      !region.zones.every((entry) => typeof entry === 'string') ||
      typeof region.routeServerSupported !== 'boolean' ||
      typeof region.quotaAvailable !== 'number' ||
      typeof region.policyAllowed !== 'boolean' ||
      (region.proximity !== undefined && typeof region.proximity !== 'number') ||
      !Array.isArray(region.vmSizes) ||
      !region.vmSizes.every(
        (size) =>
          isRecord(size) &&
          typeof size.name === 'string' &&
          typeof size.maxNics === 'number' &&
          typeof size.vCpus === 'number' &&
          typeof size.memoryGb === 'number' &&
          Array.isArray(size.zones) &&
          size.zones.every((entry) => typeof entry === 'string') &&
          typeof size.restricted === 'boolean',
      )
    ) {
      throw new Error('Persisted Azure CE checkpoint has an invalid observation snapshot');
    }
  }
  for (const resource of value.resources) {
    if (
      !isRecord(resource) ||
      typeof resource.id !== 'string' ||
      typeof resource.exists !== 'boolean' ||
      typeof resource.owned !== 'boolean' ||
      !isStringRecord(resource.tags) ||
      !isRecord(resource.state)
    ) {
      throw new Error('Persisted Azure CE checkpoint has an invalid observation snapshot');
    }
  }
}
function fingerprintCurrentObservation(plan, current) {
  if (plan.intent.operation !== 'deploy') return fingerprintObservation(current, plan.intent.brownfield.resourceIds);
  const normalized = structuredClone(current);
  const vmScope =
    `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${plan.deploymentName}-`.toLowerCase();
  const ownedVmNodes = new Set(
    normalized.resources.flatMap((resource) => {
      const resourceId = resource.id.toLowerCase();
      const suffix = resourceId.slice(vmScope.length);
      return resource.exists &&
        resource.owned &&
        resourceId.startsWith(vmScope) &&
        /^\d+$/.test(suffix) &&
        Number(suffix) >= 1 &&
        Number(suffix) <= plan.topology.nodeCount &&
        resource.tags['xcsh-managed-by'] === 'azure-ce' &&
        resource.tags['xcsh-deployment-id'] === plan.deploymentName &&
        resource.tags['xcsh-execution-engine'] === plan.engine &&
        resource.tags['xcsh-plan-sha256'] === plan.planSha256
        ? [Number(suffix)]
        : [];
    }),
  );
  const ownedVmCount = ownedVmNodes.size;
  const workloadVmId = `${vmScope}workload`;
  const ownedWorkloadVm = normalized.resources.some(
    (resource) =>
      plan.engine === 'terraform' &&
      Boolean(plan.intent.workloadFixture) &&
      resource.exists &&
      resource.owned &&
      resource.id.toLowerCase() === workloadVmId &&
      resource.tags['xcsh-managed-by'] === 'azure-ce' &&
      resource.tags['xcsh-deployment-id'] === plan.deploymentName &&
      resource.tags['xcsh-execution-engine'] === plan.engine &&
      resource.tags['xcsh-plan-sha256'] === plan.planSha256,
  );
  if (ownedVmCount > 0 || ownedWorkloadVm) {
    const region = normalized.regions.find((candidate) => candidate.name.toLowerCase() === plan.region.toLowerCase());
    const size = region?.vmSizes.find((candidate) => candidate.name.toLowerCase() === plan.vm.size.toLowerCase());
    if (region && size && Number.isFinite(size.vCpus) && size.vCpus > 0) {
      region.quotaAvailable += ownedVmCount * size.vCpus + (ownedWorkloadVm ? AZURE_CE_WORKLOAD_FIXTURE_VCPUS : 0);
      if (region.quotaAvailable >= size.vCpus * plan.topology.nodeCount) {
        region.reasons = region.reasons.filter((reason) => reason !== 'quota');
        region.eligible = !region.reasons.some((reason) => QUOTA_BLOCKERS.has(reason));
      }
      normalized.regions.sort(
        (left, right) =>
          Number(right.eligible) - Number(left.eligible) ||
          (right.proximity ?? 0) - (left.proximity ?? 0) ||
          left.reasons.length - right.reasons.length ||
          left.name.localeCompare(right.name),
      );
      normalized.regions.forEach((candidate, index) => {
        candidate.rank = index + 1;
      });
    }
  }
  return fingerprintDeploymentObservation(normalized, plan.intent.brownfield.resourceIds, plan.region, plan.vm.size);
}
function fingerprintCheckpointObservation(observation) {
  const normalized = structuredClone(observation);
  normalized.subscription.id = normalized.subscription.id.toLowerCase();
  normalized.resources = normalized.resources
    .map((resource) => ({ ...resource, id: resource.id.toLowerCase() }))
    .sort((left, right) => left.id.localeCompare(right.id));
  normalized.regions = normalized.regions
    .map((region) => ({
      ...region,
      zones: [...region.zones].sort(),
      vmSizes: region.vmSizes
        .map((size) => ({ ...size, zones: [...size.zones].sort() }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  return canonicalSha256(normalized);
}
function assertAuthorizationShape(value) {
  if (value === undefined) return;
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, new Set(['apply', 'terms', 'destroy'])) ||
    typeof value.apply !== 'boolean' ||
    typeof value.terms !== 'boolean' ||
    typeof value.destroy !== 'boolean'
  ) {
    throw new Error('Persisted Azure CE checkpoint has invalid authorization');
  }
}
function assertCheckpointProgress(checkpoint, plan) {
  if (
    checkpoint.engine !== plan.engine ||
    checkpoint.planId !== plan.planId ||
    checkpoint.planSha256 !== plan.planSha256
  ) {
    throw new Error('Persisted Azure CE checkpoint identity or execution engine differs from the immutable plan');
  }
  if (
    !Array.isArray(checkpoint.completedActionIds) ||
    !checkpoint.completedActionIds.every((id) => typeof id === 'string') ||
    !CHECKPOINT_STATES.has(String(checkpoint.state))
  ) {
    throw new Error('Persisted Azure CE checkpoint progress is malformed');
  }
  const completedActionIds = checkpoint.completedActionIds;
  const unique = new Set(completedActionIds);
  const expected = plan.actions.slice(0, completedActionIds.length).map((action) => action.id);
  if (unique.size !== completedActionIds.length || JSON.stringify(completedActionIds) !== JSON.stringify(expected)) {
    throw new Error('Persisted checkpoint is not an ordered unique prefix of the immutable plan');
  }
  const failedActionId = checkpoint.failedActionId;
  const nextActionId = plan.actions[completedActionIds.length]?.id;
  if (
    (failedActionId !== undefined && typeof failedActionId !== 'string') ||
    (checkpoint.state === 'partial' && failedActionId !== nextActionId) ||
    (checkpoint.state !== 'partial' && failedActionId !== undefined) ||
    (checkpoint.state === 'complete' && completedActionIds.length !== plan.actions.length) ||
    (checkpoint.state !== 'complete' && completedActionIds.length === plan.actions.length)
  ) {
    throw new Error('Persisted Azure CE checkpoint state is inconsistent with its action prefix');
  }
  assertAuthorizationShape(checkpoint.authorization);
  if (checkpoint.pendingAction !== undefined) {
    if (checkpoint.state === 'complete')
      throw new Error('Completed Azure CE checkpoint cannot retain a pending mutation');
    if (plan.engine !== 'native') throw new Error('Terraform Azure CE checkpoint cannot retain a native mutation');
    validateAzureNativePendingAction(plan, completedActionIds, checkpoint.pendingAction);
  }
}
function validateAzureCeCheckpoint(value, plan) {
  if (!isRecord(value)) throw new Error('Persisted Azure CE checkpoint is malformed');
  const version = value.schemaVersion;
  const allowedKeys = version === AZURE_CE_SCHEMA_VERSION ? LEGACY_CHECKPOINT_KEYS : CHECKPOINT_KEYS;
  if (!hasOnlyKeys(value, allowedKeys)) throw new Error('Persisted Azure CE checkpoint has unexpected fields');
  if (version !== AZURE_CE_SCHEMA_VERSION && version !== AZURE_CE_CHECKPOINT_SCHEMA_VERSION) {
    throw new Error('Persisted Azure CE checkpoint uses an unsupported schema version');
  }
  assertCheckpointProgress(value, plan);
  const fingerprint = value.observationFingerprint;
  if (fingerprint !== undefined && (typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint))) {
    throw new Error('Persisted Azure CE checkpoint has an invalid observation fingerprint');
  }
  const authorization = value.authorization;
  const executionStarted =
    value.completedActionIds.length > 0 || fingerprint !== undefined || value.state !== 'running';
  if (
    executionStarted &&
    (authorization?.apply !== true || (plan.intent.operation === 'teardown' && authorization.destroy !== true))
  ) {
    throw new Error('Persisted Azure CE checkpoint execution has invalid authorization');
  }
  if (version === AZURE_CE_SCHEMA_VERSION) {
    if (value.completedActionIds.length > 0 && fingerprint === undefined) {
      throw new Error('Persisted legacy Azure CE checkpoint has no observation fingerprint');
    }
    return value;
  }
  const snapshot = value.observationSnapshot;
  const isEmptySeed =
    value.completedActionIds.length === 0 &&
    value.state === 'running' &&
    value.failedActionId === undefined &&
    fingerprint === undefined &&
    snapshot === undefined &&
    authorization?.apply === true &&
    (plan.intent.operation !== 'teardown' || authorization.destroy === true);
  if (!isEmptySeed) {
    if (typeof fingerprint !== 'string' || snapshot === undefined) {
      throw new Error('Persisted Azure CE checkpoint requires a bound observation snapshot and fingerprint');
    }
    assertObservationShape(snapshot);
    if (
      snapshot.subscription.id.toLowerCase() !== plan.subscription.id.toLowerCase() ||
      snapshot.subscription.tenantId.toLowerCase() !== plan.subscription.tenantId.toLowerCase() ||
      snapshot.subscription.cloud !== plan.subscription.cloud ||
      snapshot.image.publisher.toLowerCase() !== plan.image.publisher.toLowerCase() ||
      snapshot.image.offer.toLowerCase() !== plan.image.offer.toLowerCase() ||
      snapshot.image.plan.toLowerCase() !== plan.image.plan.toLowerCase() ||
      snapshot.image.version !== plan.image.version ||
      snapshot.image.urn.toLowerCase() !== plan.image.urn.toLowerCase()
    ) {
      throw new Error('Persisted Azure CE checkpoint observation identity differs from the immutable plan');
    }
    if (!safeHexEqual(fingerprint, fingerprintCheckpointObservation(snapshot))) {
      throw new Error('Persisted Azure CE checkpoint observation differs from its fingerprint');
    }
  }
  return value;
}
function upgradeAzureCeCheckpoint(plan, checkpoint, current) {
  const currentFingerprint = fingerprintCurrentObservation(plan, current);
  if (
    checkpoint.completedActionIds.length > 0 &&
    (!checkpoint.observationFingerprint || !safeHexEqual(checkpoint.observationFingerprint, currentFingerprint))
  ) {
    throw new Error(
      plan.intent.operation === 'teardown'
        ? 'Stale incomplete legacy Azure teardown checkpoint cannot be recovered safely'
        : 'Legacy Azure CE checkpoint observation is stale',
    );
  }
  return {
    ...checkpoint,
    schemaVersion: AZURE_CE_CHECKPOINT_SCHEMA_VERSION,
    observationFingerprint: fingerprintCheckpointObservation(current),
    observationSnapshot: structuredClone(current),
  };
}
function normalizeDeleteResourceId(plan, resourceId) {
  if (resourceId.trim() !== resourceId || !resourceId.startsWith('/') || resourceId.endsWith('/')) {
    throw new Error('Azure deletion recovery action has a non-canonical resource ID');
  }
  const segments = resourceId.slice(1).split('/');
  if (segments.some((segment) => segment.length === 0)) {
    throw new Error('Azure deletion recovery action has a non-canonical resource ID');
  }
  const expectedGroup = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}`;
  const normalized = resourceId.toLowerCase();
  const normalizedGroup = expectedGroup.toLowerCase();
  if (normalized === normalizedGroup) return { id: normalized, resourceGroup: true };
  if (
    segments.length < 8 ||
    segments.length % 2 !== 0 ||
    segments[0].toLowerCase() !== 'subscriptions' ||
    segments[1].toLowerCase() !== plan.subscription.id.toLowerCase() ||
    segments[2].toLowerCase() !== 'resourcegroups' ||
    segments[3].toLowerCase() !== plan.intent.resourceGroup.toLowerCase() ||
    segments[4].toLowerCase() !== 'providers'
  ) {
    throw new Error('Azure deletion recovery target differs from the immutable subscription and resource-group scope');
  }
  return { id: normalized, resourceGroup: false };
}
function validateAzureDeletionTail(plan, completedActionIds) {
  const expectedPrefix = plan.actions.slice(0, completedActionIds.length).map((action) => action.id);
  if (
    new Set(completedActionIds).size !== completedActionIds.length ||
    JSON.stringify(completedActionIds) !== JSON.stringify(expectedPrefix)
  ) {
    throw new Error('Persisted checkpoint is not an ordered unique prefix of the immutable plan');
  }
  if (plan.intent.operation !== 'teardown') return [];
  const tail = plan.actions.slice(completedActionIds.length);
  if (tail.length === 0) return [];
  if (tail.some((action) => action.kind !== 'resource-delete')) {
    throw new Error('Azure deletion recovery requires an uninterrupted immutable resource-delete tail');
  }
  const ownership = new Map();
  for (const item of plan.ownershipInventory) {
    const normalized = item.resourceId.toLowerCase();
    if (ownership.has(normalized)) {
      throw new Error('Azure deletion recovery ownership inventory contains duplicate resource IDs');
    }
    ownership.set(normalized, item);
  }
  const seen = new Set();
  return tail.map((action) => {
    if (!action.resourceId) throw new Error('Azure deletion recovery action has no canonical resource ID');
    const normalized = normalizeDeleteResourceId(plan, action.resourceId);
    if (seen.has(normalized.id)) throw new Error('Azure deletion recovery tail contains duplicate resource IDs');
    seen.add(normalized.id);
    const owner = ownership.get(normalized.id);
    if (owner?.action !== 'delete' || owner.owned !== true) {
      throw new Error('Azure deletion recovery target differs from the immutable ownership inventory');
    }
    return {
      actionId: action.id,
      resourceId: action.resourceId,
      normalizedResourceId: normalized.id,
      resourceGroup: normalized.resourceGroup,
    };
  });
}
function azureErrorCode(stdout, stderr) {
  for (const raw of [stderr, stdout]) {
    try {
      const parsed = JSON.parse(raw);
      if (isRecord(parsed) && typeof parsed.code === 'string') return parsed.code;
      if (isRecord(parsed) && isRecord(parsed.error) && typeof parsed.error.code === 'string') return parsed.error.code;
    } catch {}
  }
  const text = stderr.trim();
  const leading = /^(?:ERROR:\s*)?\(([A-Za-z][A-Za-z0-9]+)\)/.exec(text)?.[1];
  if (leading) return leading;
  return /^Code:\s*([A-Za-z][A-Za-z0-9]+)\s*$/m.exec(text)?.[1];
}
async function collectAzureAbsentDeletionTail(plan, completedActionIds, api, signal) {
  const absent = [];
  const targets = validateAzureDeletionTail(plan, completedActionIds);
  for (const target of targets) {
    const result = await api.exec(
      'az',
      target.resourceGroup
        ? [
            'group',
            'exists',
            '--name',
            plan.intent.resourceGroup,
            '--subscription',
            plan.subscription.id,
            '--output',
            'json',
          ]
        : ['resource', 'show', '--ids', target.resourceId, '--subscription', plan.subscription.id, '--output', 'json'],
      signal ? { signal } : undefined,
    );
    if (target.resourceGroup) {
      if (result.exitCode !== 0) throw new Error('Azure deletion recovery group evidence is unavailable');
      let exists;
      try {
        exists = JSON.parse(result.stdout);
      } catch {
        throw new Error('Malformed Azure deletion recovery group evidence');
      }
      if (exists === false) absent.push(target.resourceId);
      else if (exists !== true) throw new Error('Malformed Azure deletion recovery group evidence');
      if (exists === true) break;
      continue;
    }
    if (result.exitCode === 0) {
      let resource;
      try {
        resource = JSON.parse(result.stdout);
      } catch {
        throw new Error('Malformed Azure deletion recovery resource evidence');
      }
      if (!isRecord(resource) || typeof resource.id !== 'string') {
        throw new Error('Malformed Azure deletion recovery resource evidence');
      }
      if (resource.id.toLowerCase() !== target.normalizedResourceId) {
        throw new Error('Azure deletion recovery returned a different resource identity');
      }
      break;
    }
    const code = azureErrorCode(result.stdout, result.stderr);
    if (code !== 'ResourceNotFound' && code !== 'ResourceGroupNotFound') {
      throw new Error('Azure deletion recovery resource evidence is unavailable');
    }
    absent.push(target.resourceId);
  }
  return absent;
}
function stableDeletionObservation(plan, observation, recoveredResourceIds) {
  const allResources = observation.resources.map((resource) => ({ ...resource, id: resource.id.toLowerCase() }));
  if (new Set(allResources.map((resource) => resource.id)).size !== allResources.length) {
    throw new Error('Azure deletion recovery observation contains duplicate resource IDs');
  }
  const resources = allResources
    .filter((resource) => {
      const id = resource.id;
      return ![...recoveredResourceIds].some((recovered) => id === recovered || id.startsWith(`${recovered}/`));
    })
    .map((resource) => {
      const ancestor = [...recoveredResourceIds].some((recovered) => recovered.startsWith(`${resource.id}/`));
      if (!ancestor) return resource;
      const { etag: _etag, state, ...stable } = resource;
      const { provisioningState: _provisioningState, ...stableState } = state;
      return { ...stable, state: stableState };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  return canonicalSha256({
    schemaVersion: observation.schemaVersion,
    subscription: observation.subscription,
    image: observation.image,
    research: observation.research,
    regions: observation.regions
      .map(({ eligible: _eligible, quotaAvailable: _quota, rank: _rank, reasons: _reasons, ...stable }) => stable)
      .sort((left, right) => left.name.localeCompare(right.name)),
    resources,
    brownfieldResourceIds: [...plan.intent.brownfield.resourceIds].map((id) => id.toLowerCase()).sort(),
  });
}
function reconcileAzureNativeDeletionPrefix(plan, completedActionIds, previous, current, absentResourceIds) {
  if (plan.intent.operation !== 'teardown') return completedActionIds;
  const targets = validateAzureDeletionTail(plan, completedActionIds);
  const absent = [...absentResourceIds].map((id) => normalizeDeleteResourceId(plan, id).id);
  if (new Set(absent).size !== absent.length) {
    throw new Error('Azure deletion recovery evidence contains duplicate resource IDs');
  }
  const targetIds = new Set(targets.map((target) => target.normalizedResourceId));
  if (absent.some((id) => !targetIds.has(id))) {
    throw new Error('Azure deletion recovery evidence is outside the immutable delete tail');
  }
  let recoveredCount = 0;
  while (recoveredCount < targets.length && absent.includes(targets[recoveredCount].normalizedResourceId)) {
    recoveredCount++;
  }
  if (absent.slice(recoveredCount).length > 0) {
    throw new Error('Azure deletion recovery evidence is out of action order');
  }
  const recoveredTargets = targets.slice(0, recoveredCount);
  const recoveredResourceIds = new Set(recoveredTargets.map((target) => target.normalizedResourceId));
  const previousIds = new Set(previous.resources.map((resource) => resource.id.toLowerCase()));
  if (current.resources.some((resource) => !previousIds.has(resource.id.toLowerCase()))) {
    throw new Error('Azure deletion recovery observation contains an unexpected resource');
  }
  if (
    stableDeletionObservation(plan, previous, recoveredResourceIds) !==
    stableDeletionObservation(plan, current, recoveredResourceIds)
  ) {
    throw new Error('Azure deletion recovery observation changed outside the immutable delete tail');
  }
  if (recoveredCount === 0) return completedActionIds;
  return [...completedActionIds, ...recoveredTargets.map((target) => target.actionId)];
}
var CHECKPOINT_STATES, QUOTA_BLOCKERS, CHECKPOINT_KEYS, LEGACY_CHECKPOINT_KEYS;
var init_recovery = __esm(() => {
  init_canonical();
  init_native_action_recovery();
  CHECKPOINT_STATES = new Set(['running', 'partial', 'complete']);
  QUOTA_BLOCKERS = new Set([
    'image-unavailable',
    'image-observation-failed',
    'vm-size-unavailable',
    'sku-restricted',
    'nic-limit',
    'ce-minimum-size',
    'no-compatible-vm-size',
    'quota-observation-failed',
    'quota',
    'policy-deny',
    'route-server-unavailable',
  ]);
  CHECKPOINT_KEYS = new Set([
    'authorization',
    'engine',
    'schemaVersion',
    'planId',
    'planSha256',
    'completedActionIds',
    'pendingAction',
    'failedActionId',
    'observationFingerprint',
    'observationSnapshot',
    'state',
  ]);
  LEGACY_CHECKPOINT_KEYS = new Set(
    [...CHECKPOINT_KEYS].filter((key) => key !== 'observationSnapshot' && key !== 'pendingAction'),
  );
});

// plugins/azure/src/ce/artifacts.ts
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

function verifyAzureCePlan(plan) {
  if (plan.schemaVersion !== AZURE_CE_SCHEMA_VERSION || plan.intent.schemaVersion !== AZURE_CE_SCHEMA_VERSION)
    throw new Error('Persisted Azure CE plan uses an unsupported schema version');
  if (!['native', 'terraform'].includes(plan.engine) || plan.intent.engine !== plan.engine)
    throw new Error('Persisted Azure CE plan has invalid execution ownership');
  const { planId, planSha256, ...draft } = plan;
  const actual = canonicalSha256(draft);
  if (!safeHexEqual(actual, planSha256) || planId !== `azure-ce-${planSha256.slice(0, 24)}`) {
    throw new Error('Persisted Azure CE plan failed integrity validation');
  }
}
async function saveDiscoveryArtifact(session, observation) {
  if (observation.schemaVersion !== AZURE_CE_SCHEMA_VERSION)
    throw new Error('Azure CE discovery observation uses an unsupported schema version');
  return session.saveArtifact(JSON.stringify({ kind: 'azure-ce-discovery', observation }), 'azure-ce-discovery');
}
async function loadDiscoveryArtifact(session, id) {
  if (!/^\d+$/.test(id)) throw new Error('Invalid discovery artifact ID');
  const path = await session.getArtifactPath(id);
  if (!path) throw new Error(`Discovery artifact ${id} was not found in this session`);
  const envelope = JSON.parse(await Bun.file(path).text());
  if (envelope.kind !== 'azure-ce-discovery' || envelope.observation?.schemaVersion !== AZURE_CE_SCHEMA_VERSION)
    throw new Error('Artifact is not an Azure CE discovery observation');
  return envelope.observation;
}
async function savePlanArtifact(session, plan, observation) {
  verifyAzureCePlan(plan);
  const envelope = { kind: 'azure-ce-plan', plan, observation };
  const sessionPlans = memoryPlans.get(session.getSessionId()) ?? [];
  sessionPlans.push(envelope);
  memoryPlans.set(session.getSessionId(), sessionPlans);
  return session.saveArtifact(JSON.stringify(envelope), 'azure-ce-plan');
}
async function loadPlanArtifact(session, planId, planSha256) {
  const memory = memoryPlans
    .get(session.getSessionId())
    ?.find((item) => item.plan.planId === planId && item.plan.planSha256 === planSha256);
  if (memory) {
    verifyAzureCePlan(memory.plan);
    return memory;
  }
  const artifactsDir = session.getArtifactsDir();
  if (!artifactsDir) throw new Error('The exact plan is unavailable in this non-persistent session');
  let files;
  try {
    files = (await readdir(artifactsDir)).filter((file) => file.endsWith('.azure-ce-plan.log')).sort();
  } catch {
    files = [];
  }
  for (const file of files) {
    try {
      const envelope = JSON.parse(await Bun.file(join(artifactsDir, file)).text());
      if (envelope.kind !== 'azure-ce-plan') continue;
      if (envelope.plan.planId !== planId || envelope.plan.planSha256 !== planSha256) continue;
      verifyAzureCePlan(envelope.plan);
      return envelope;
    } catch {}
  }
  throw new Error('No exact, integrity-valid Azure CE plan was found in this session');
}
async function saveCheckpoint(session, plan, checkpoint) {
  validateAzureCeCheckpoint(checkpoint, plan);
  const artifactId = await session.saveArtifact(
    JSON.stringify({ kind: 'azure-ce-checkpoint', checkpoint }),
    'azure-ce-checkpoint',
  );
  if (!artifactId) throw new Error('Azure CE checkpoint persistence failed');
  return artifactId;
}
async function loadCheckpoint(session, plan) {
  const artifactsDir = session.getArtifactsDir();
  if (!artifactsDir) return;
  let files;
  try {
    files = (await readdir(artifactsDir))
      .filter((file) => file.endsWith('.azure-ce-checkpoint.log'))
      .sort()
      .reverse();
  } catch {
    return;
  }
  for (const file of files) {
    let envelope;
    try {
      envelope = JSON.parse(await Bun.file(join(artifactsDir, file)).text());
    } catch {
      continue;
    }
    if (!envelope || typeof envelope !== 'object') continue;
    const record = envelope;
    const checkpoint = record.checkpoint;
    if (!checkpoint || typeof checkpoint !== 'object') continue;
    const identity = checkpoint;
    if (identity.planId !== plan.planId && identity.planSha256 !== plan.planSha256) continue;
    if (record.kind !== 'azure-ce-checkpoint') {
      throw new Error('Persisted Azure CE checkpoint envelope is malformed');
    }
    return validateAzureCeCheckpoint(checkpoint, plan);
  }
  return;
}
var memoryPlans;
var init_artifacts = __esm(() => {
  init_canonical();
  init_recovery();
  memoryPlans = new Map();
});

// plugins/azure/src/ce/discovery.ts
function normalizeResearchDocument(body) {
  let source = body
    .replace(/^\uFEFF/, '')
    .replace(
      /\r\n?/g,
      `
`,
    )
    .normalize('NFC');
  if (/<html(?:\s|>)/i.test(source)) {
    const open = /<main\b[^>]*>/i.exec(source);
    const close = open ? source.toLowerCase().indexOf('</main>', open.index + open[0].length) : -1;
    if (!open || close < 0) throw new Error('Official HTML research document has no complete main content');
    source = source
      .slice(open.index + open[0].length, close)
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
      .replace(
        /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>/gi,
        (_tag, _quote, href) => `
link:${href}
`,
      )
      .replace(/<img\b[^>]*>/gi, (tag) => {
        const source = /\bsrc\s*=\s*(["'])(.*?)\1/i.exec(tag)?.[2] ?? '';
        const alt = /\balt\s*=\s*(["'])(.*?)\1/i.exec(tag)?.[2] ?? '';
        return `
image:${source}:${alt}
`;
      })
      .replace(
        /<[^>]+>/g,
        `
`,
      )
      .split(`
`)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(`
`);
  }
  const normalized = source
    .split(`
`)
    .map((line) => line.replace(/[\t ]+$/g, ''))
    .join(`
`)
    .trimEnd();
  return `${normalized}
`;
}
async function verifyOfficialSources(fetcher) {
  const sourceUrls = [...OFFICIAL_SOURCES, AZURE_CE_SHARED_CONTRACT_URL];
  const sourceReceipts = await Promise.all(
    sourceUrls.map(async (url) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetcher(url, {
          redirect: 'follow',
          signal: controller.signal,
          headers: { 'user-agent': 'xcsh-azure-ce-research/3' },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.text();
        if (body.trim().length < 100) throw new Error('response was empty');
        const normalized = normalizeResearchDocument(body);
        if (
          url === AZURE_CE_SHARED_CONTRACT_URL &&
          (!/^contract_id: f5xc-ce-automation-policy$/m.test(normalized) ||
            !/^contract_version: v2$/m.test(normalized) ||
            !normalized.includes('f5xc-ce-automation-policy/v2'))
        )
          throw new Error('document did not advertise f5xc-ce-automation-policy/v2');
        return { url, normalizedSha256: sha256Hex(normalized) };
      } catch (error) {
        throw new Error(
          `Official CE research failed for ${url}: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  sourceReceipts.sort((left, right) => left.url.localeCompare(right.url));
  const contract = sourceReceipts.find((receipt) => receipt.url === AZURE_CE_SHARED_CONTRACT_URL);
  if (!contract) throw new Error('Shared Customer Edge automation contract receipt is unavailable');
  return {
    method: 'azure-cli-live',
    officialSourceRetrieval: 'live',
    catalogRegion: '',
    commands: [],
    officialSources: [...OFFICIAL_SOURCES],
    sourceReceipts,
    sharedContract: {
      url: AZURE_CE_SHARED_CONTRACT_URL,
      contractId: 'f5xc-ce-automation-policy',
      contractVersion: 'v2',
      normalizedSha256: contract.normalizedSha256,
    },
  };
}
function normalizeLocation(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
async function json(api, args) {
  const result = await api.exec('az', [...args, '--output', 'json']);
  if (result.exitCode !== 0) throw new Error(`Azure discovery command failed: az ${args.join(' ')}: ${result.stderr}`);
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`Azure discovery returned invalid JSON for: az ${args.join(' ')}`);
  }
}
async function quotaAvailable(api, region, subscriptionId) {
  const result = await api.exec('az', [
    'vm',
    'list-usage',
    '--location',
    region,
    '--subscription',
    subscriptionId,
    '--output',
    'json',
  ]);
  if (result.exitCode !== 0) return;
  try {
    const usages = JSON.parse(result.stdout);
    const cores = usages.find((usage) => String(usage.name?.value ?? '').toLowerCase() === 'cores');
    const limit = Number(cores?.limit);
    const current = Number(cores?.currentValue);
    return Number.isFinite(limit) && Number.isFinite(current) ? Math.max(0, limit - current) : undefined;
  } catch {
    return;
  }
}
async function imageAvailable(api, region, urn, subscriptionId) {
  const result = await api.exec('az', [
    'vm',
    'image',
    'show',
    '--location',
    region,
    '--urn',
    urn,
    '--subscription',
    subscriptionId,
    '--output',
    'json',
  ]);
  if (result.exitCode === 0) return true;
  if (/not found|could not be found|invalid image reference|platform image/i.test(result.stderr)) return false;
  return;
}
async function mapLimit(items, limit, task) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}
function versionParts(version) {
  return version.split(/[._-]/).map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}
function compareVersionDescending(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const av = a[index] ?? 0;
    const bv = b[index] ?? 0;
    if (av === bv) continue;
    if (typeof av === 'number' && typeof bv === 'number') return bv - av;
    return String(bv).localeCompare(String(av));
  }
  return 0;
}
function exactName(items, expected) {
  return items
    .map((item) => String(item.name ?? ''))
    .filter((name) => name.toLowerCase() === expected.toLowerCase())
    .sort((left, right) => left.localeCompare(right))[0];
}
async function resolveMarketplaceImage(api, regions, subscriptionId, input) {
  const requestedPublisher = input.publisher ?? F5_CE_PUBLISHER;
  const requestedOffer = input.offer ?? F5_CE_OFFER;
  for (const region of regions) {
    let publishers;
    try {
      publishers = await json(api, [
        'vm',
        'image',
        'list-publishers',
        '--location',
        region,
        '--subscription',
        subscriptionId,
      ]);
    } catch {
      continue;
    }
    const publisher = exactName(publishers, requestedPublisher);
    if (!publisher) continue;
    const offers = await json(api, [
      'vm',
      'image',
      'list-offers',
      '--location',
      region,
      '--publisher',
      publisher,
      '--subscription',
      subscriptionId,
    ]);
    const offer = exactName(offers, requestedOffer);
    if (!offer) continue;
    const rawPlans = await json(api, [
      'vm',
      'image',
      'list-skus',
      '--location',
      region,
      '--publisher',
      publisher,
      '--offer',
      offer,
      '--subscription',
      subscriptionId,
    ]);
    const plans = rawPlans
      .map((item) => String(item.name ?? ''))
      .filter(Boolean)
      .filter((name) => (input.plan ? name.toLowerCase() === input.plan.toLowerCase() : /crt-/i.test(name)))
      .sort(compareVersionDescending);
    for (const plan of plans) {
      const images = await json(api, [
        'vm',
        'image',
        'list',
        '--location',
        region,
        '--publisher',
        publisher,
        '--offer',
        offer,
        '--sku',
        plan,
        '--all',
        '--subscription',
        subscriptionId,
      ]);
      const selected = images
        .filter((image) => String(image.version).toLowerCase() !== 'latest')
        .filter((image) => !input.version || String(image.version) === input.version)
        .sort(
          (left, right) =>
            compareVersionDescending(String(left.version), String(right.version)) ||
            canonicalStringify(left).localeCompare(canonicalStringify(right)),
        )[0];
      if (!selected) continue;
      const version = String(selected.version);
      return {
        catalogRegion: region,
        publisher: String(selected.publisher ?? publisher),
        offer: String(selected.offer ?? offer),
        plan: String(selected.sku ?? plan),
        version,
        urn: String(selected.urn ?? `${publisher}:${offer}:${plan}:${version}`),
        locations: Array.isArray(selected.locations) ? selected.locations : [],
      };
    }
  }
  throw new Error('No live F5 CE Marketplace image matched the requested hints in any permitted AzureCloud region');
}
function capability(raw, name) {
  const capabilities = Array.isArray(raw.capabilities) ? raw.capabilities : [];
  return capabilities.find((item) => String(item.name).toLowerCase() === name.toLowerCase())?.value;
}
function compareVmSize(left, right) {
  return (
    Number(left.restricted) - Number(right.restricted) ||
    left.vCpus - right.vCpus ||
    left.memoryGb - right.memoryGb ||
    left.maxNics - right.maxNics ||
    left.name.localeCompare(right.name)
  );
}
function skusForRegion(rawSkus, requestedSize, region) {
  const byName = new Map();
  for (const sku of rawSkus) {
    const name = String(sku.name ?? '');
    if (!name || String(sku.resourceType).toLowerCase() !== 'virtualmachines') continue;
    if (requestedSize && name.toLowerCase() !== requestedSize.toLowerCase()) continue;
    const info = (Array.isArray(sku.locationInfo) ? sku.locationInfo : []).find(
      (item) => normalizeLocation(item.location) === region,
    );
    if (!info) continue;
    const restrictions = Array.isArray(sku.restrictions) ? sku.restrictions : [];
    const restricted = restrictions.some((restriction) => {
      const locations = restriction.restrictionInfo?.locations ?? restriction.locations;
      return (
        !Array.isArray(locations) ||
        locations.length === 0 ||
        locations.some((location) => normalizeLocation(location) === region)
      );
    });
    const observation = {
      name,
      maxNics: Number(capability(sku, 'MaxNetworkInterfaces') ?? 0),
      vCpus: Number(capability(sku, 'vCPUs') ?? capability(sku, 'vCPUsAvailable') ?? 0),
      memoryGb: Number(capability(sku, 'MemoryGB') ?? 0),
      zones: (Array.isArray(info.zones) ? info.zones : []).map(String).sort(),
      restricted,
    };
    const existing = byName.get(name.toLowerCase());
    if (!existing || canonicalStringify(observation).localeCompare(canonicalStringify(existing)) < 0)
      byName.set(name.toLowerCase(), observation);
  }
  return [...byName.values()].sort(compareVmSize);
}
function safeResourceState(raw) {
  const properties = raw.properties ?? {};
  const type = String(raw.type ?? '').toLowerCase();
  if (type.endsWith('/routetables')) {
    return { routes: Array.isArray(properties.routes) ? properties.routes : [] };
  }
  if (type.endsWith('/subnets')) {
    return { routeTable: properties.routeTable ?? null, networkSecurityGroup: properties.networkSecurityGroup ?? null };
  }
  return { provisioningState: properties.provisioningState ?? null };
}
async function observeResource(api, id, subscriptionId) {
  const groupMatch = /^\/subscriptions\/[^/]+\/resourceGroups\/([^/]+)$/i.exec(id);
  const result = await api.exec(
    'az',
    groupMatch
      ? ['group', 'show', '--name', groupMatch[1], '--subscription', subscriptionId, '--output', 'json']
      : ['resource', 'show', '--ids', id, '--subscription', subscriptionId, '--output', 'json'],
  );
  if (result.exitCode !== 0) {
    if (/not found|could not be found|resourcegroupnotfound/i.test(result.stderr))
      return { id: id.toLowerCase(), exists: false, owned: false, tags: {}, state: {} };
    throw new Error(`Azure resource observation failed for ${id}: ${result.stderr}`);
  }
  const raw = JSON.parse(result.stdout);
  const tags = raw.tags ?? {};
  return {
    id: String(raw.id ?? id).toLowerCase(),
    location: typeof raw.location === 'string' ? normalizeLocation(raw.location) : undefined,
    exists: true,
    etag: typeof raw.etag === 'string' ? raw.etag : undefined,
    owned: tags['xcsh-managed-by'] === 'azure-ce',
    tags,
    state: safeResourceState(raw),
  };
}
function validateInput2(input) {
  if (!UUID.test(input.subscriptionId)) throw new Error('subscriptionId must be a valid UUID');
  for (const [label, value] of [
    ['publisher', input.publisher],
    ['offer', input.offer],
    ['plan', input.plan],
    ['vmSize', input.vmSize],
  ]) {
    if (value !== undefined && !SAFE_IMAGE_PART.test(value))
      throw new Error(`${label} contains unsupported characters`);
  }
  if (input.version?.toLowerCase() === 'latest') throw new Error('The image version latest is forbidden');
  if (input.requiredNics < 1 || input.requiredNics > 8) throw new Error('requiredNics must be between 1 and 8');
  if (input.nodeCount !== 1 && input.nodeCount !== 3) throw new Error('nodeCount must be one or three');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$/.test(input.deploymentName))
    throw new Error('deploymentName contains unsupported characters');
  if (!/^[a-zA-Z0-9._()-]+$/.test(input.resourceGroup))
    throw new Error('resourceGroup contains unsupported characters');
  for (const id of input.brownfieldResourceIds) {
    const match = RESOURCE_ID.exec(id);
    if (!match) throw new Error(`Invalid Azure resource ID: ${id}`);
    if (match[1].toLowerCase() !== input.subscriptionId.toLowerCase())
      throw new Error(`Brownfield resource is in a different subscription: ${id}`);
  }
}
async function discoverAzureCompute(input, api, fetcher = fetch) {
  input = {
    ...input,
    publisher: input.publisher || undefined,
    offer: input.offer || undefined,
    plan: input.plan || undefined,
    version: input.version || undefined,
    vmSize: input.vmSize || undefined,
  };
  validateInput2(input);
  const subscriptionId = input.subscriptionId.toLowerCase();
  const research = await verifyOfficialSources(fetcher);
  const [account, locations, rawSkus, provider, policies] = await Promise.all([
    json(api, ['account', 'show', '--subscription', subscriptionId]),
    json(api, [
      'rest',
      '--method',
      'get',
      '--url',
      `https://management.azure.com/subscriptions/${subscriptionId}/locations?api-version=2022-12-01`,
    ]),
    json(api, ['vm', 'list-skus', '--all', '--subscription', subscriptionId]),
    json(api, ['provider', 'show', '--namespace', 'Microsoft.Network', '--subscription', subscriptionId]),
    json(api, ['policy', 'state', 'list', '--subscription', subscriptionId]),
  ]);
  if (String(account.id).toLowerCase() !== subscriptionId)
    throw new Error('Azure CLI returned a different subscription');
  if (String(account.environmentName) !== 'AzureCloud') throw new Error('Only AzureCloud subscriptions are supported');
  const physicalRegions = (locations.value ?? [])
    .filter((location) => String(location.metadata?.regionType ?? 'Physical') === 'Physical')
    .map((location) => normalizeLocation(location.name))
    .filter(Boolean)
    .sort();
  const selected = await resolveMarketplaceImage(api, physicalRegions, subscriptionId, input);
  const urn = selected.urn;
  const terms = await json(api, ['vm', 'image', 'terms', 'show', '--urn', urn, '--subscription', subscriptionId]);
  const routeServerLocations = new Set();
  const resourceTypes = Array.isArray(provider.resourceTypes) ? provider.resourceTypes : [];
  for (const type of resourceTypes) {
    if (!['virtualhubs', 'routeservers'].includes(String(type.resourceType).toLowerCase())) continue;
    for (const location of Array.isArray(type.locations) ? type.locations : [])
      routeServerLocations.add(normalizeLocation(location));
  }
  const imageLocations = new Set(selected.locations.map(normalizeLocation));
  const imageAvailability = new Map();
  if (imageLocations.size === 0) {
    const availabilityPairs = await mapLimit(physicalRegions, 8, async (region) => [
      region,
      await imageAvailable(api, region, urn, subscriptionId),
    ]);
    for (const [region, available] of availabilityPairs) imageAvailability.set(region, available);
  }
  const quotaPairs = await mapLimit(physicalRegions, 8, async (region) => [
    region,
    await quotaAvailable(api, region, subscriptionId),
  ]);
  const quotas = new Map(quotaPairs);
  const resourceGroupId = `/subscriptions/${subscriptionId}/resourceGroups/${input.resourceGroup}`;
  const observedIds = [...new Set([...input.brownfieldResourceIds, resourceGroupId])].sort();
  const resourceObservations = await Promise.all(observedIds.map((id) => observeResource(api, id, subscriptionId)));
  const ownedRaw = await json(api, [
    'resource',
    'list',
    '--tag',
    `xcsh-deployment-id=${input.deploymentName}`,
    '--subscription',
    subscriptionId,
  ]);
  for (const raw of ownedRaw) {
    const tags = raw.tags ?? {};
    const item = {
      id: String(raw.id ?? '').toLowerCase(),
      location: typeof raw.location === 'string' ? normalizeLocation(raw.location) : undefined,
      exists: true,
      etag: typeof raw.etag === 'string' ? raw.etag : undefined,
      owned: tags['xcsh-managed-by'] === 'azure-ce' && tags['xcsh-deployment-id'] === input.deploymentName,
      tags,
      state: safeResourceState(raw),
    };
    if (item.id && !resourceObservations.some((resource) => resource.id === item.id)) resourceObservations.push(item);
  }
  const proximity = new Map();
  for (const resource of resourceObservations) {
    if (resource.location && input.brownfieldResourceIds.some((id) => id.toLowerCase() === resource.id)) {
      proximity.set(resource.location, (proximity.get(resource.location) ?? 0) + 1);
    }
  }
  const preliminary = physicalRegions.map((region) => {
    const availableVmSizes = skusForRegion(rawSkus, input.vmSize, region);
    const eligibleVmSizes = availableVmSizes.filter(
      (size) => !size.restricted && size.maxNics >= input.requiredNics && size.vCpus >= 8 && size.memoryGb >= 32,
    );
    const vmSize = eligibleVmSizes[0] ?? availableVmSizes[0];
    const policyDenied = policies.some(
      (policy) =>
        String(policy.complianceState).toLowerCase() === 'noncompliant' &&
        String(policy.policyDefinitionAction ?? policy.effect).toLowerCase() === 'deny' &&
        (!policy.resourceLocation || normalizeLocation(policy.resourceLocation) === region),
    );
    const reasons = [];
    const blockers = [];
    if (imageLocations.size > 0 && !imageLocations.has(region)) blockers.push('image-unavailable');
    else if (imageLocations.size === 0 && imageAvailability.get(region) === false) blockers.push('image-unavailable');
    else if (imageLocations.size === 0 && imageAvailability.get(region) === undefined)
      blockers.push('image-observation-failed');
    if (!vmSize) blockers.push('vm-size-unavailable');
    else if (eligibleVmSizes.length === 0) {
      if (availableVmSizes.every((size) => size.restricted)) blockers.push('sku-restricted');
      if (availableVmSizes.every((size) => size.maxNics < input.requiredNics)) blockers.push('nic-limit');
      if (availableVmSizes.every((size) => size.vCpus < 8 || size.memoryGb < 32)) blockers.push('ce-minimum-size');
      if (blockers.length === 0) blockers.push('no-compatible-vm-size');
    } else if (input.nodeCount === 3 && vmSize.zones.length < 3) {
      reasons.push('fewer-than-three-zones');
    }
    const quota = quotas.get(region);
    if (quota === undefined) blockers.push('quota-observation-failed');
    else if (quota < (vmSize?.vCpus ?? 1) * input.nodeCount) blockers.push('quota');
    if (policyDenied) blockers.push('policy-deny');
    if (input.requireRouteServer && !routeServerLocations.has(region)) blockers.push('route-server-unavailable');
    reasons.unshift(...blockers);
    return {
      name: region,
      rank: 0,
      eligible: blockers.length === 0,
      reasons,
      zones: vmSize?.zones ?? [],
      routeServerSupported: routeServerLocations.has(region),
      quotaAvailable: quota ?? 0,
      policyAllowed: !policyDenied,
      vmSizes: (eligibleVmSizes.length > 0 ? eligibleVmSizes : availableVmSizes).slice(0, 24),
      proximity: proximity.get(region) ?? 0,
    };
  });
  preliminary.sort(
    (a, b) =>
      Number(b.eligible) - Number(a.eligible) ||
      (b.proximity ?? 0) - (a.proximity ?? 0) ||
      a.reasons.length - b.reasons.length ||
      a.name.localeCompare(b.name),
  );
  preliminary.forEach((region, index) => {
    region.rank = index + 1;
  });
  return {
    schemaVersion: AZURE_CE_SCHEMA_VERSION,
    subscription: { id: subscriptionId, tenantId: String(account.tenantId ?? ''), cloud: 'AzureCloud' },
    image: {
      publisher: selected.publisher,
      offer: selected.offer,
      plan: String(terms.plan ?? selected.plan),
      version: selected.version,
      urn,
      termsAccepted: Boolean(terms.accepted),
    },
    regions: preliminary,
    resources: resourceObservations,
    research: {
      ...research,
      catalogRegion: selected.catalogRegion,
      commands: [
        'az vm image list-publishers',
        'az vm image list-offers',
        'az vm image list-skus',
        'az vm image list',
        'az vm image terms show',
        'az vm list-skus --all',
      ],
    },
  };
}
var UUID,
  SAFE_IMAGE_PART,
  RESOURCE_ID,
  F5_CE_PUBLISHER = 'f5-networks',
  F5_CE_OFFER = 'f5xc_customer_edge',
  OFFICIAL_SOURCES;
var init_discovery = __esm(() => {
  init_canonical();
  UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  SAFE_IMAGE_PART = /^[a-zA-Z0-9._-]+$/;
  RESOURCE_ID = /^\/subscriptions\/([^/]+)\//i;
  OFFICIAL_SOURCES = [
    'https://docs.cloud.f5.com/docs-v2/multi-cloud-network-connect/how-to/site-management/deploy-sms-az-clickops',
    'https://learn.microsoft.com/en-us/azure/virtual-machines/linux/cli-ps-findimage',
    'https://learn.microsoft.com/en-us/cli/azure/vm#az-vm-list-skus',
  ];
});

// plugins/azure/src/tools/azure-compute-discover.ts
function createAzureComputeDiscoverTool(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  return {
    name: 'azure_compute_discover',
    label: 'Discover Azure CE Compute',
    description:
      'Mandatory live research gate for F5 Customer Edge. Retrieves and hashes the canonical MCN contract plus current F5 and Microsoft guidance, then enumerates Azure Marketplace identifiers, exact image version, subscription-aware VM SKU/NIC/zones, quota, policy, Route Server support, brownfield proximity, and terms status.',
    parameters: Type.Object({
      subscriptionId: Type.String(),
      publisher: Type.Optional(Type.String()),
      offer: Type.Optional(Type.String()),
      plan: Type.Optional(Type.String()),
      version: Type.Optional(Type.String()),
      vmSize: Type.Optional(Type.String()),
      requiredNics: Type.Number({ minimum: 1, maximum: 8 }),
      nodeCount: Type.Number({ minimum: 1, maximum: 3, description: 'Node count; only 1 or 3 is valid.' }),
      requireRouteServer: Type.Optional(Type.Boolean()),
      deploymentName: Type.String(),
      resourceGroup: Type.String(),
      brownfieldResourceIds: Type.Array(Type.String()),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      try {
        const observation = await discoverAzureCompute(params, makeApi(ctx.cwd));
        const artifactId = await saveDiscoveryArtifact(ctx.sessionManager, observation);
        const ranked = observation.regions
          .map(
            (region) =>
              `${region.rank}. ${region.name}: ${region.eligible ? 'eligible' : 'ineligible'}${region.reasons.length ? ` (${region.reasons.join(', ')})` : ''}`,
          )
          .join(`
`);
        const leadingRegion = observation.regions.find((region) => region.eligible);
        const compatibleSizes = (leadingRegion?.vmSizes ?? [])
          .slice(0, 12)
          .map(
            (size) =>
              `${size.name} (${size.vCpus} vCPU, ${size.memoryGb} GB, ${size.maxNics} NICs, zones ${size.zones.join('/') || 'regional'})`,
          )
          .join('; ');
        return {
          content: [
            {
              type: 'text',
              text: `Research: live Azure CLI catalog and subscription observations (${observation.research.catalogRegion})
Shared contract: ${observation.research.sharedContract.contractId}/${observation.research.sharedContract.contractVersion} (${observation.research.sharedContract.normalizedSha256})
Official sources: retrieved live from F5 and Microsoft with normalized digests
Pinned image: ${observation.image.urn}
Marketplace terms: ${observation.image.termsAccepted ? 'accepted' : 'not accepted'}
Leading eligible region: ${leadingRegion?.name ?? 'none'}
Compatible VM sizes: ${compatibleSizes || 'none'}
${ranked}
Discovery artifact: ${artifactId ? `artifact://${artifactId}` : 'session memory only'}`,
            },
          ],
          details: { tool: 'azure_compute_discover', artifactId, observation },
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Azure CE discovery failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'azure_compute_discover' },
        };
      }
    },
  };
}
var init_azure_compute_discover = __esm(() => {
  init_artifacts();
  init_discovery();
  init_shared();
});

// plugins/platform/src/ce/initial-versions.ts
function initialSoftwareSettings(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !['software', 'os'].includes(key)) ||
    typeof value.software !== 'string' ||
    !/^crt-\d{8}-\d{4}$/.test(value.software) ||
    typeof value.os !== 'string' ||
    !/^\d+\.\d{4}\.\d+$/.test(value.os)
  )
    throw new Error('Initial software and OS versions must be an explicit version pair');
  return { os: { operating_system_version: value.os }, sw: { volterra_software_version: value.software } };
}

// plugins/azure/src/ce/planner.ts
import { isIP } from 'node:net';

function fail(message) {
  throw new Error(`Azure CE plan validation failed: ${message}`);
}
function hasControlCharacters(value) {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}
function validateSafeString(label, value) {
  const normalized = value.trim();
  if (!normalized || hasControlCharacters(normalized)) fail(`${label} is empty or contains control characters`);
  return normalized;
}
function validateName(label, value) {
  const normalized = validateSafeString(label, value);
  if (!SAFE_NAME.test(normalized)) fail(`${label} contains unsupported characters`);
  return normalized;
}
function validateCidr(label, value) {
  const normalized = validateSafeString(label, value);
  const [address, prefix, extra] = normalized.split('/');
  const family = isIP(address);
  if (
    !family ||
    address.includes('%') ||
    extra !== undefined ||
    !/^(?:0|[1-9]\d{0,2})$/.test(prefix ?? '') ||
    Number(prefix) > (family === 4 ? 32 : 128)
  )
    fail(`${label} is not a CIDR`);
  return normalized;
}
function validateResourceId(id, subscriptionId) {
  if (hasControlCharacters(id)) fail('resource ID contains control characters');
  const match = RESOURCE_ID2.exec(id);
  if (!match) fail(`invalid Azure resource ID: ${id}`);
  if (match[1].toLowerCase() !== subscriptionId.toLowerCase())
    fail(`resource ID is in a different subscription: ${id}`);
}
function normalizeIntent(input) {
  if (input.initialVersions !== undefined) initialSoftwareSettings(input.initialVersions);
  if (input.schemaVersion !== AZURE_CE_SCHEMA_VERSION)
    fail(`unsupported intent schema version ${String(input.schemaVersion)}`);
  if (input.engine !== undefined && !['native', 'terraform'].includes(input.engine))
    fail('unsupported execution engine');
  if (!UUID2.test(input.subscriptionId)) fail('subscriptionId must be a UUID');
  if (input.nics.length < 1 || input.nics.length > 8) fail('NIC count must be between 1 and 8');
  if (input.nics[0]?.role !== 'slo') fail('NIC 0 must have role slo');
  if (input.nics.some((nic) => !['slo', 'sli', 'data'].includes(nic.role)))
    fail('The pinned Azure bootstrap disables management networking; NIC roles must be slo, sli, or data');
  const marketplaceThreeNic =
    input.nics.length === 3 && input.nics[1]?.role === 'data' && input.nics[2]?.role === 'sli';
  if (input.nics.length > 1 && input.nics[1]?.role !== 'sli' && !marketplaceThreeNic)
    fail('SLI must be NIC 1, or NIC 2 in the explicit SLO/data/SLI marketplace layout');
  if (
    input.nics.filter((nic) => nic.role === 'slo').length !== 1 ||
    input.nics.filter((nic) => nic.role === 'sli').length !== (input.nics.length > 1 ? 1 : 0)
  )
    fail('SLO and SLI NIC roles must be unique');
  const subnetKeys = new Set();
  const nics = input.nics.map((nic, index) => {
    const name = validateName(`NIC ${index} name`, nic.name);
    const vrf = nic.vrf ? validateName(`NIC ${index} VRF`, nic.vrf) : undefined;
    const subnet = { ...nic.subnet };
    if (subnet.mode === 'greenfield') {
      if (!subnet.cidr || !subnet.name) fail(`greenfield NIC ${index} requires subnet name and CIDR`);
      subnet.name = validateName(`NIC ${index} subnet name`, subnet.name);
      subnet.cidr = validateCidr(`NIC ${index} subnet CIDR`, subnet.cidr);
    } else {
      if (!subnet.resourceId) fail(`brownfield NIC ${index} requires subnet resourceId`);
      validateResourceId(subnet.resourceId, input.subscriptionId);
    }
    const subnetKey = (subnet.resourceId ?? subnet.cidr ?? '').toLowerCase();
    if (subnetKeys.has(subnetKey)) fail('every ordered NIC must use a unique subnet');
    subnetKeys.add(subnetKey);
    return { ...nic, name, vrf, subnet };
  });
  for (const id of input.brownfield.resourceIds) validateResourceId(id, input.subscriptionId);
  for (const change of input.brownfield.routeChanges) {
    validateResourceId(change.routeTableId, input.subscriptionId);
    validateResourceId(change.subnetId, input.subscriptionId);
    validateName('route name', change.routeName);
    validateCidr('route destination', change.destinationCidr);
    if (!input.brownfield.resourceIds.some((id) => id.toLowerCase() === change.routeTableId.toLowerCase()))
      fail('route table must be listed in brownfield.resourceIds');
    if (!input.brownfield.resourceIds.some((id) => id.toLowerCase() === change.subnetId.toLowerCase()))
      fail('route subnet must be listed in brownfield.resourceIds');
  }
  let ingress = input.ingress === undefined ? undefined : structuredClone(input.ingress);
  const workloadFixture = input.workloadFixture === undefined ? undefined : structuredClone(input.workloadFixture);
  if (workloadFixture) {
    if (
      input.engine !== 'terraform' ||
      input.operation !== 'deploy' ||
      input.routing.mode !== 'route-server' ||
      !validateName('workload fixture subnet', workloadFixture.subnetName) ||
      !validateCidr('workload fixture CIDR', workloadFixture.cidr) ||
      !usableIpv4Address(workloadFixture.privateIp, workloadFixture.cidr) ||
      !Number.isInteger(workloadFixture.port) ||
      workloadFixture.port < 1 ||
      workloadFixture.port > 65535 ||
      subnetKeys.has(workloadFixture.cidr.toLowerCase()) ||
      nics.some(
        (nic) =>
          nic.subnet.mode === 'greenfield' &&
          nic.subnet.cidr !== undefined &&
          overlappingIpv4Cidrs(workloadFixture.cidr, nic.subnet.cidr),
      ) ||
      !input.routing.destinationCidrs.includes(workloadFixture.cidr)
    )
      fail(
        'workload fixture requires a Terraform Route Server deploy, unique usable subnet/IP, and matching destination CIDR',
      );
    workloadFixture.subnetName = validateName('workload fixture subnet', workloadFixture.subnetName);
    workloadFixture.cidr = validateCidr('workload fixture CIDR', workloadFixture.cidr);
  }
  if (ingress?.mode === 'none') {
    if (Object.keys(ingress).join(',') !== 'mode') fail('disabled ingress contains unsupported fields');
  } else if (ingress?.mode === 'platform-http') {
    const listener = ingress.listener;
    const probe = ingress.probe;
    const sli = nics.find((nic) => nic.role === 'sli');
    if (
      Object.keys(ingress).sort().join(',') !== 'listener,mode,port,probe' ||
      !listener ||
      Object.keys(listener).sort().join(',') !== 'domain,name,namespace,originPool,privateAddress' ||
      !listener.originPool ||
      Object.keys(listener.originPool).sort().join(',') !== 'name,namespace' ||
      !probe ||
      Object.keys(probe).sort().join(',') !== 'expectedBodySha256,expectedStatus,path,sourceVmResourceId' ||
      !F5_NAME.test(listener.name) ||
      !F5_NAME.test(listener.namespace) ||
      !F5_NAME.test(listener.originPool.name) ||
      listener.originPool.namespace !== listener.namespace ||
      listener.namespace !== input.namespace ||
      listener.domain.length > 253 ||
      !DOMAIN.test(listener.domain) ||
      !Number.isInteger(ingress.port) ||
      ingress.port < 1 ||
      ingress.port > 65535 ||
      !sli ||
      sli.subnet.mode !== 'greenfield' ||
      !sli.subnet.cidr ||
      !usableIpv4Address(listener.privateAddress, sli.subnet.cidr) ||
      !/^\/[A-Za-z0-9._~/-]{0,512}$/.test(probe.path) ||
      !Number.isInteger(probe.expectedStatus) ||
      probe.expectedStatus < 100 ||
      probe.expectedStatus > 599 ||
      !/^[a-f0-9]{64}$/.test(probe.expectedBodySha256)
    )
      fail('platform HTTP ingress requires exact listener, SLI service address, and traffic-probe identities');
    validateResourceId(probe.sourceVmResourceId, input.subscriptionId);
    const source = probe.sourceVmResourceId.toLowerCase();
    if (
      !/^\/subscriptions\/[^/]+\/resourcegroups\/[^/]+\/providers\/microsoft\.compute\/virtualmachines\/[a-z0-9][a-z0-9._-]{0,63}$/i.test(
        source,
      )
    )
      fail('traffic probe source must be an exact virtual machine resource ID');
    if (!input.brownfield.resourceIds.some((id) => id.toLowerCase() === source))
      fail('traffic probe source VM must be listed in brownfield.resourceIds');
    ingress = { ...ingress, probe: { ...probe, sourceVmResourceId: source } };
  } else if (ingress !== undefined) {
    fail('unsupported ingress mode');
  }
  for (const rule of input.securityRules) {
    validateName('security rule name', rule.name);
    for (const cidr of [...rule.sourceCidrs, ...rule.destinationCidrs])
      validateCidr(`security rule ${rule.name} CIDR`, cidr);
    for (const port of rule.destinationPorts)
      if (!PORT.test(validateSafeString(`security rule ${rule.name} port`, port)))
        fail(`security rule ${rule.name} has an invalid port range`);
    if (rule.purpose === 'management' && rule.sourceCidrs.some((cidr) => cidr === '0.0.0.0/0' || cidr === '::/0')) {
    }
  }
  for (const [label, value] of [
    ['image publisher', input.image.publisher],
    ['image offer', input.image.offer],
    ['image plan', input.image.plan],
    ['VM size', input.vm.size],
  ])
    validateName(label, value);
  for (const zone of input.vm.zones ?? []) if (!/^\d+$/.test(zone)) fail(`invalid availability zone ${zone}`);
  for (const [label, asn] of [
    ['local ASN', input.routing.localAsn],
    ['peer ASN', input.routing.peerAsn],
  ]) {
    if (asn !== undefined && (!Number.isInteger(asn) || asn < 1 || asn > 4294967295)) fail(`${label} is invalid`);
  }
  return {
    ...input,
    ...(input.initialVersions ? { initialVersions: structuredClone(input.initialVersions) } : {}),
    engine: input.engine ?? 'native',
    subscriptionId: input.subscriptionId.toLowerCase(),
    deploymentName: validateName('deploymentName', input.deploymentName),
    siteName: validateName('siteName', input.siteName),
    namespace: validateName('namespace', input.namespace),
    resourceGroup: validateName('resourceGroup', input.resourceGroup),
    region: input.region?.trim().toLowerCase(),
    nics,
    routing: {
      ...input.routing,
      destinationCidrs: input.routing.destinationCidrs.map((cidr) => validateCidr('routing destination', cidr)).sort(),
    },
    ingress,
    workloadFixture,
    securityRules: [...input.securityRules].sort((a, b) => a.name.localeCompare(b.name)),
    brownfield: {
      resourceIds: [...new Set(input.brownfield.resourceIds.map((id) => id.toLowerCase()))].sort(),
      routeChanges: [...input.brownfield.routeChanges].sort((a, b) =>
        `${a.routeTableId}/${a.routeName}/${a.subnetId}`.localeCompare(
          `${b.routeTableId}/${b.routeName}/${b.subnetId}`,
        ),
      ),
    },
  };
}
function resourceById(observation, id) {
  return observation.resources.find((resource) => resource.id.toLowerCase() === id.toLowerCase());
}
function actionFactory() {
  let sequence = 0;
  return (action) => ({
    ...action,
    id: String(++sequence).padStart(3, '0'),
  });
}
function tagsArgs(deploymentName, engine) {
  return [
    `xcsh-execution-engine=${engine}`,
    'xcsh-managed-by=azure-ce',
    `xcsh-deployment-id=${deploymentName}`,
    'xcsh-plan-sha256=__PLAN_SHA256__',
  ];
}
function groupId(subscriptionId, resourceGroup) {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}`;
}
function managedId(subscriptionId, resourceGroup, providerPath) {
  return `${groupId(subscriptionId, resourceGroup)}/providers/${providerPath}`;
}
function zoneArgs(zones, node) {
  const zone = zones[node - 1] ?? zones[0];
  return zone ? ['--zone', zone] : [];
}
function ipv4Range(cidr) {
  const [address, prefixText] = cidr.split('/');
  const octets = address.split('.').map(Number);
  const prefix = Number(prefixText);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255) ||
    !Number.isInteger(prefix) ||
    prefix < 0 ||
    prefix > 32
  )
    return;
  const value = (((octets[0] * 256 + octets[1]) * 256 + octets[2]) * 256 + octets[3]) >>> 0;
  const size = 2 ** (32 - prefix);
  const start = Math.floor(value / size) * size;
  return [start, start + size - 1];
}
function usableIpv4Address(address, cidr) {
  if (isIP(address) !== 4) return false;
  const range = ipv4Range(cidr);
  if (!range) return false;
  const octets = address.split('.').map(Number);
  const value = (((octets[0] * 256 + octets[1]) * 256 + octets[2]) * 256 + octets[3]) >>> 0;
  return value > range[0] + 3 && value < range[1];
}
function overlappingIpv4Cidrs(left, right) {
  const leftRange = ipv4Range(left);
  const rightRange = ipv4Range(right);
  return Boolean(leftRange && rightRange && leftRange[0] <= rightRange[1] && rightRange[0] <= leftRange[1]);
}
function validateRouteServerIntent(intent) {
  const local = intent.routing.localAsn ?? intent.routing.peerAsn ?? 65010;
  const peer = intent.routing.peerAsn ?? local;
  if (local !== peer) fail('Route Server peering ASN must match the CE local ASN');
  const reserved = new Set([8074, 8075, 12076, 23456, 65515, 65517, 65518, 65519, 65520]);
  if (local > 65534 || reserved.has(local) || (local >= 64496 && local <= 64511))
    fail('Route Server requires an unreserved 16-bit CE ASN');
  for (const nic of intent.nics) {
    if (nic.subnet.name?.toLowerCase() === 'routeserversubnet')
      fail('RouteServerSubnet is dedicated to Route Server and cannot host a CE NIC');
    if (!nic.subnet.cidr || !ipv4Range(nic.subnet.cidr)) fail('Route Server requires IPv4 CE VNet subnets');
  }
}
function routeServerSubnetCidr(intent) {
  const occupied = [
    ...intent.nics
      .flatMap((nic) => (nic.subnet.cidr ? [ipv4Range(nic.subnet.cidr)] : []))
      .filter((range) => Boolean(range)),
    ...(intent.workloadFixture ? [ipv4Range(intent.workloadFixture.cidr)] : []),
  ].filter((range) => Boolean(range));
  const base = 10 * 256 * 256 * 256 + 255 * 256 * 256;
  for (let offset = 0; offset < 65536; offset += 64) {
    const candidate = [base + offset, base + offset + 63];
    if (occupied.every(([start, end]) => candidate[1] < start || candidate[0] > end)) {
      const third = Math.floor(offset / 256);
      const fourth = offset % 256;
      return `10.255.${third}.${fourth}/26`;
    }
  }
  fail('no non-overlapping /26 is available for RouteServerSubnet');
}
function routeTableParts(resourceId) {
  const match =
    /^\/subscriptions\/[^/]+\/resourceGroups\/([^/]+)\/providers\/Microsoft\.Network\/routeTables\/([^/]+)$/i.exec(
      resourceId,
    );
  if (!match) fail(`invalid route table resource ID: ${resourceId}`);
  return { resourceGroup: match[1], name: match[2] };
}
function subnetParts(resourceId) {
  const match =
    /^\/subscriptions\/[^/]+\/resourceGroups\/([^/]+)\/providers\/Microsoft\.Network\/virtualNetworks\/([^/]+)\/subnets\/([^/]+)$/i.exec(
      resourceId,
    );
  if (!match) fail(`invalid subnet resource ID: ${resourceId}`);
  return { resourceGroup: match[1], vnet: match[2], name: match[3] };
}
function buildDeployActions(intent, region, zones, routingMode, imageUrn, routeServerCidr, createResourceGroup = true) {
  const next = actionFactory();
  const actions = [];
  const tags = tagsArgs(intent.deploymentName, intent.engine ?? 'native');
  const greenfield = intent.nics.some((nic) => nic.subnet.mode === 'greenfield');
  if (greenfield) {
    const addressPrefixes = [
      ...new Set([
        ...intent.nics.flatMap((nic) => (nic.subnet.mode === 'greenfield' && nic.subnet.cidr ? [nic.subnet.cidr] : [])),
        ...(routeServerCidr ? [routeServerCidr] : []),
      ]),
    ].sort();
    if (createResourceGroup) {
      actions.push(
        next({
          phase: 'prerequisites',
          kind: 'resource-group-create',
          description: `Create resource group ${intent.resourceGroup}`,
          command: 'az',
          args: [
            'group',
            'create',
            '--name',
            intent.resourceGroup,
            '--location',
            region,
            '--subscription',
            intent.subscriptionId,
            '--tags',
            ...tags,
          ],
          resourceId: groupId(intent.subscriptionId, intent.resourceGroup),
          mutates: true,
          destructive: false,
        }),
      );
    }
    actions.push(
      next({
        phase: 'prerequisites',
        kind: 'vnet-create',
        description: `Create virtual network ${intent.deploymentName}-vnet`,
        command: 'az',
        args: [
          'network',
          'vnet',
          'create',
          '--resource-group',
          intent.resourceGroup,
          '--name',
          `${intent.deploymentName}-vnet`,
          '--location',
          region,
          '--address-prefixes',
          ...addressPrefixes,
          '--subscription',
          intent.subscriptionId,
          '--tags',
          ...tags,
        ],
        resourceId: managedId(
          intent.subscriptionId,
          intent.resourceGroup,
          `Microsoft.Network/virtualNetworks/${intent.deploymentName}-vnet`,
        ),
        mutates: true,
        destructive: false,
      }),
    );
    for (const nic of intent.nics) {
      if (nic.subnet.mode !== 'greenfield') continue;
      actions.push(
        next({
          phase: 'prerequisites',
          kind: 'subnet-create',
          description: `Create subnet ${nic.subnet.name}`,
          command: 'az',
          args: [
            'network',
            'vnet',
            'subnet',
            'create',
            '--resource-group',
            intent.resourceGroup,
            '--vnet-name',
            `${intent.deploymentName}-vnet`,
            '--name',
            nic.subnet.name ?? '',
            '--address-prefixes',
            nic.subnet.cidr ?? '',
            '--subscription',
            intent.subscriptionId,
          ],
          resourceId: managedId(
            intent.subscriptionId,
            intent.resourceGroup,
            `Microsoft.Network/virtualNetworks/${intent.deploymentName}-vnet/subnets/${nic.subnet.name ?? ''}`,
          ),
          mutates: true,
          destructive: false,
        }),
      );
    }
  }
  if (intent.securityRules.length > 0) {
    actions.push(
      next({
        phase: 'prerequisites',
        kind: 'nsg-create',
        description: `Create explicit CE network security group ${intent.deploymentName}-nsg`,
        command: 'az',
        args: [
          'network',
          'nsg',
          'create',
          '--resource-group',
          intent.resourceGroup,
          '--name',
          `${intent.deploymentName}-nsg`,
          '--location',
          region,
          '--subscription',
          intent.subscriptionId,
          '--tags',
          ...tags,
        ],
        resourceId: managedId(
          intent.subscriptionId,
          intent.resourceGroup,
          `Microsoft.Network/networkSecurityGroups/${intent.deploymentName}-nsg`,
        ),
        mutates: true,
        destructive: false,
      }),
    );
    for (const [index, rule] of intent.securityRules.entries()) {
      actions.push(
        next({
          phase: 'prerequisites',
          kind: 'nsg-rule-create',
          description: `Create explicit ${rule.purpose} rule ${rule.name}`,
          command: 'az',
          args: [
            'network',
            'nsg',
            'rule',
            'create',
            '--resource-group',
            intent.resourceGroup,
            '--nsg-name',
            `${intent.deploymentName}-nsg`,
            '--name',
            rule.name,
            '--priority',
            String(100 + index),
            '--direction',
            rule.direction,
            '--protocol',
            rule.protocol,
            '--source-address-prefixes',
            ...rule.sourceCidrs,
            '--destination-address-prefixes',
            ...rule.destinationCidrs,
            '--destination-port-ranges',
            ...rule.destinationPorts,
            '--access',
            'Allow',
            '--subscription',
            intent.subscriptionId,
          ],
          resourceId: managedId(
            intent.subscriptionId,
            intent.resourceGroup,
            `Microsoft.Network/networkSecurityGroups/${intent.deploymentName}-nsg/securityRules/${rule.name}`,
          ),
          mutates: true,
          destructive: false,
        }),
      );
    }
  }
  const nodeCount = intent.topology.ha ? 3 : 1;
  for (let node = 1; node <= nodeCount; node++) {
    const nodeName = `${intent.deploymentName}-${node}`;
    if (intent.egress.mode === 'public-ip') {
      actions.push(
        next({
          phase: 'nodes',
          kind: 'public-ip-create',
          description: `Create Standard public IP for ${nodeName}`,
          command: 'az',
          args: [
            'network',
            'public-ip',
            'create',
            '--resource-group',
            intent.resourceGroup,
            '--name',
            `${nodeName}-pip`,
            '--sku',
            'Standard',
            '--allocation-method',
            'Static',
            ...zoneArgs(zones, node),
            '--subscription',
            intent.subscriptionId,
            '--tags',
            ...tags,
          ],
          resourceId: managedId(
            intent.subscriptionId,
            intent.resourceGroup,
            `Microsoft.Network/publicIPAddresses/${nodeName}-pip`,
          ),
          node,
          mutates: true,
          destructive: false,
        }),
      );
    }
    for (const [index, nic] of intent.nics.entries()) {
      const subnetArgs = nic.subnet.resourceId
        ? ['--subnet', nic.subnet.resourceId]
        : ['--vnet-name', `${intent.deploymentName}-vnet`, '--subnet', nic.subnet.name ?? ''];
      const publicIpArgs =
        intent.egress.mode === 'public-ip' && index === 0 ? ['--public-ip-address', `${nodeName}-pip`] : [];
      const nsgArgs =
        intent.securityRules.length > 0 ? ['--network-security-group', `${intent.deploymentName}-nsg`] : [];
      actions.push(
        next({
          phase: 'nodes',
          kind: 'nic-create',
          description: `Create ordered NIC ${index} (${nic.role}) for ${nodeName}`,
          command: 'az',
          args: [
            'network',
            'nic',
            'create',
            '--resource-group',
            intent.resourceGroup,
            '--name',
            `${nodeName}-nic${index}`,
            ...subnetArgs,
            ...publicIpArgs,
            ...nsgArgs,
            '--subscription',
            intent.subscriptionId,
            '--tags',
            ...tags,
          ],
          resourceId: managedId(
            intent.subscriptionId,
            intent.resourceGroup,
            `Microsoft.Network/networkInterfaces/${nodeName}-nic${index}`,
          ),
          node,
          mutates: true,
          destructive: false,
        }),
      );
    }
    const nicNames = ['--nics', ...intent.nics.map((_nic, index) => `${nodeName}-nic${index}`)];
    actions.push(
      next({
        phase: 'nodes',
        kind: 'vm-create',
        description: `Launch ${nodeName} from the pinned CE image`,
        command: 'az',
        args: [
          'vm',
          'create',
          '--resource-group',
          intent.resourceGroup,
          '--name',
          nodeName,
          '--image',
          imageUrn,
          '--size',
          intent.vm.size,
          ...zoneArgs(zones, node),
          ...nicNames,
          '--plan-name',
          intent.image.plan,
          '--plan-product',
          intent.image.offer,
          '--plan-publisher',
          intent.image.publisher,
          '--os-disk-size-gb',
          '80',
          '--os-disk-delete-option',
          'Delete',
          '--custom-data',
          '__BOOTSTRAP_FILE__',
          '--subscription',
          intent.subscriptionId,
          '--tags',
          ...tags,
        ],
        resourceId: managedId(
          intent.subscriptionId,
          intent.resourceGroup,
          `Microsoft.Compute/virtualMachines/${nodeName}`,
        ),
        node,
        mutates: true,
        destructive: false,
        requiresBootstrap: true,
      }),
    );
    actions.push(
      next({
        phase: 'registration',
        kind: 'health-gate',
        description: `Wait for ${nodeName} registration and health`,
        node,
        mutates: false,
        destructive: false,
      }),
    );
  }
  if (routingMode === 'route-server') {
    const hostedSubnetId = managedId(
      intent.subscriptionId,
      intent.resourceGroup,
      `Microsoft.Network/virtualNetworks/${intent.deploymentName}-vnet/subnets/RouteServerSubnet`,
    );
    actions.push(
      next({
        phase: 'routing',
        kind: 'subnet-create',
        description: 'Create dedicated /26 RouteServerSubnet without NSG or UDR',
        command: 'az',
        args: [
          'network',
          'vnet',
          'subnet',
          'create',
          '--resource-group',
          intent.resourceGroup,
          '--vnet-name',
          `${intent.deploymentName}-vnet`,
          '--name',
          'RouteServerSubnet',
          '--address-prefixes',
          routeServerCidr ?? '',
          '--subscription',
          intent.subscriptionId,
        ],
        resourceId: hostedSubnetId,
        mutates: true,
        destructive: false,
      }),
    );
    actions.push(
      next({
        phase: 'routing',
        kind: 'public-ip-create',
        description: `Create Standard public IP for Route Server ${intent.deploymentName}-rs`,
        command: 'az',
        args: [
          'network',
          'public-ip',
          'create',
          '--resource-group',
          intent.resourceGroup,
          '--name',
          `${intent.deploymentName}-rs-pip`,
          '--sku',
          'Standard',
          '--allocation-method',
          'Static',
          '--subscription',
          intent.subscriptionId,
          '--tags',
          ...tags,
        ],
        resourceId: managedId(
          intent.subscriptionId,
          intent.resourceGroup,
          `Microsoft.Network/publicIPAddresses/${intent.deploymentName}-rs-pip`,
        ),
        mutates: true,
        destructive: false,
      }),
    );
    actions.push(
      next({
        phase: 'routing',
        kind: 'route-server-create',
        description: `Create Route Server ${intent.deploymentName}-rs`,
        command: 'az',
        args: [
          'network',
          'routeserver',
          'create',
          '--resource-group',
          intent.resourceGroup,
          '--name',
          `${intent.deploymentName}-rs`,
          '--hosted-subnet',
          hostedSubnetId,
          '--public-ip-address',
          `${intent.deploymentName}-rs-pip`,
          '--subscription',
          intent.subscriptionId,
          '--tags',
          ...tags,
        ],
        resourceId: managedId(
          intent.subscriptionId,
          intent.resourceGroup,
          `Microsoft.Network/virtualHubs/${intent.deploymentName}-rs`,
        ),
        mutates: true,
        destructive: false,
      }),
    );
    for (let node = 1; node <= nodeCount; node++) {
      actions.push(
        next({
          phase: 'routing',
          kind: 'route-server-peer-create',
          description: `Peer CE node ${node} with both Route Server instances`,
          command: 'az',
          args: [
            'network',
            'routeserver',
            'peering',
            'create',
            '--resource-group',
            intent.resourceGroup,
            '--routeserver',
            `${intent.deploymentName}-rs`,
            '--name',
            `${intent.deploymentName}-${node}`,
            '--peer-ip',
            `__NODE_${node}_SLO_PRIVATE_IP__`,
            '--peer-asn',
            String(intent.routing.localAsn ?? intent.routing.peerAsn ?? 65010),
            '--subscription',
            intent.subscriptionId,
          ],
          resourceId: managedId(
            intent.subscriptionId,
            intent.resourceGroup,
            `Microsoft.Network/virtualHubs/${intent.deploymentName}-rs/bgpConnections/${intent.deploymentName}-${node}`,
          ),
          node,
          mutates: true,
          destructive: false,
        }),
      );
    }
    actions.push(
      next({
        phase: 'verify',
        kind: 'bgp-gate',
        description: 'Verify both Route Server BGP instances and learned routes',
        mutates: false,
        destructive: false,
      }),
    );
  } else {
    if (intent.brownfield.routeChanges.length > 0) {
      for (const change of intent.brownfield.routeChanges) {
        const table = routeTableParts(change.routeTableId);
        const subnet = subnetParts(change.subnetId);
        actions.push(
          next({
            phase: 'routing',
            kind: 'route-create',
            description: `Create approved brownfield route ${change.routeName}`,
            command: 'az',
            args: [
              'network',
              'route-table',
              'route',
              'create',
              '--resource-group',
              table.resourceGroup,
              '--route-table-name',
              table.name,
              '--name',
              change.routeName,
              '--address-prefix',
              change.destinationCidr,
              '--next-hop-type',
              'VirtualAppliance',
              '--next-hop-ip-address',
              '__NODE_1_DATA_PRIVATE_IP__',
              '--subscription',
              intent.subscriptionId,
            ],
            resourceId: change.routeTableId,
            mutates: true,
            destructive: false,
          }),
        );
        actions.push(
          next({
            phase: 'routing',
            kind: 'route-association-update',
            description: `Associate only approved subnet ${change.subnetId}`,
            command: 'az',
            args: [
              'network',
              'vnet',
              'subnet',
              'update',
              '--resource-group',
              subnet.resourceGroup,
              '--vnet-name',
              subnet.vnet,
              '--name',
              subnet.name,
              '--route-table',
              change.routeTableId,
              '--subscription',
              intent.subscriptionId,
            ],
            resourceId: change.subnetId,
            mutates: true,
            destructive: false,
          }),
        );
      }
    } else {
      actions.push(
        next({
          phase: 'routing',
          kind: 'route-table-create',
          description: `Create route table ${intent.deploymentName}-rt`,
          command: 'az',
          args: [
            'network',
            'route-table',
            'create',
            '--resource-group',
            intent.resourceGroup,
            '--name',
            `${intent.deploymentName}-rt`,
            '--subscription',
            intent.subscriptionId,
            '--tags',
            ...tags,
          ],
          resourceId: managedId(
            intent.subscriptionId,
            intent.resourceGroup,
            `Microsoft.Network/routeTables/${intent.deploymentName}-rt`,
          ),
          mutates: true,
          destructive: false,
        }),
      );
      for (const [index, destination] of intent.routing.destinationCidrs.entries()) {
        actions.push(
          next({
            phase: 'routing',
            kind: 'route-create',
            description: `Route ${destination} through the CE data-plane private IP`,
            command: 'az',
            args: [
              'network',
              'route-table',
              'route',
              'create',
              '--resource-group',
              intent.resourceGroup,
              '--route-table-name',
              `${intent.deploymentName}-rt`,
              '--name',
              `ce-route-${index + 1}`,
              '--address-prefix',
              destination,
              '--next-hop-type',
              'VirtualAppliance',
              '--next-hop-ip-address',
              '__NODE_1_DATA_PRIVATE_IP__',
              '--subscription',
              intent.subscriptionId,
            ],
            resourceId: managedId(
              intent.subscriptionId,
              intent.resourceGroup,
              `Microsoft.Network/routeTables/${intent.deploymentName}-rt/routes/ce-route-${index + 1}`,
            ),
            mutates: true,
            destructive: false,
          }),
        );
      }
    }
  }
  if (intent.ingress?.mode === 'platform-http') {
    actions.push(
      next({
        phase: 'routing',
        kind: 'f5-ingress-configure',
        description: 'Configure the reviewed platform HTTP listener and site-local origin',
        mutates: true,
        destructive: false,
      }),
      next({
        phase: 'verify',
        kind: 'traffic-gate',
        description: 'Verify content-bound end-to-end traffic through the platform listener',
        mutates: false,
        destructive: false,
      }),
    );
  }
  return actions;
}
function buildLifecycleActions(intent, observation, zones) {
  const next = actionFactory();
  const nodeCount = intent.topology.ha ? 3 : 1;
  const actions = [];
  const nodes =
    intent.operation === 'replace-node' && intent.replacementNode
      ? [intent.replacementNode]
      : Array.from({ length: nodeCount }, (_, index) => index + 1);
  const ownedPlanSha256 = (resourceId, label) => {
    const resource = resourceById(observation, resourceId);
    const digest = resource?.tags['xcsh-plan-sha256'];
    if (
      !resource?.exists ||
      !resource.owned ||
      resource.tags['xcsh-managed-by'] !== 'azure-ce' ||
      resource.tags['xcsh-deployment-id'] !== intent.deploymentName ||
      resource.tags['xcsh-execution-engine'] !== (intent.engine ?? 'native') ||
      !digest ||
      !/^[a-f0-9]{64}$/.test(digest)
    )
      fail(`${label} is missing exact observed ownership`);
    return digest;
  };
  const verbByOperation = {
    start: ['vm-start', ['vm', 'start']],
    stop: ['vm-stop', ['vm', 'deallocate']],
    resize: ['vm-resize', ['vm', 'resize', '--size', intent.vm.size]],
  };
  if (intent.operation in verbByOperation) {
    const [kind, baseArgs] = verbByOperation[intent.operation];
    for (const node of nodes) {
      const name = `${intent.deploymentName}-${node}`;
      const vmId = managedId(intent.subscriptionId, intent.resourceGroup, `Microsoft.Compute/virtualMachines/${name}`);
      const expectedOwnerPlanSha256 = ownedPlanSha256(vmId, `lifecycle VM ${name}`);
      actions.push(
        next({
          phase: 'nodes',
          kind,
          description: `${intent.operation} ${name}`,
          command: 'az',
          args: [
            ...baseArgs.slice(0, 2),
            '--resource-group',
            intent.resourceGroup,
            '--name',
            name,
            ...baseArgs.slice(2),
            '--subscription',
            intent.subscriptionId,
          ],
          resourceId: vmId,
          node,
          mutates: true,
          destructive: intent.operation === 'replace-node',
          expectedOwnerPlanSha256,
        }),
      );
      actions.push(
        next({
          phase: 'verify',
          kind: 'vm-state-gate',
          description: `Verify ${name} is ${intent.operation === 'stop' ? 'deallocated' : 'running'}`,
          node,
          mutates: false,
          destructive: false,
          expectedPowerState: intent.operation === 'stop' ? 'deallocated' : 'running',
          expectedOwnerPlanSha256,
          expectedVmSize: intent.operation === 'resize' ? intent.vm.size : undefined,
        }),
      );
      if (intent.operation !== 'stop') {
        actions.push(
          next({
            phase: 'registration',
            kind: 'health-gate',
            description: `Gate online node ${node} before continuing`,
            node,
            mutates: false,
            destructive: false,
          }),
        );
        if (intent.ingress?.mode === 'platform-http')
          actions.push(
            next({
              phase: 'verify',
              kind: 'traffic-gate',
              description: `Gate traffic after ${intent.operation} of node ${node}`,
              node,
              mutates: false,
              destructive: false,
            }),
          );
      }
    }
    return actions;
  }
  if (intent.operation === 'replace-node') {
    if (!intent.replacementNode || intent.replacementNode < 1 || intent.replacementNode > nodeCount)
      fail(`replacementNode must be between 1 and ${nodeCount}`);
    const node = intent.replacementNode;
    const name = `${intent.deploymentName}-${node}`;
    const vmId = managedId(intent.subscriptionId, intent.resourceGroup, `Microsoft.Compute/virtualMachines/${name}`);
    const expectedOwnerPlanSha256 = ownedPlanSha256(vmId, `replacement VM ${name}`);
    actions.push(
      next({
        phase: 'nodes',
        kind: 'vm-delete',
        description: `Delete only owned node ${name}`,
        command: 'az',
        args: [
          'vm',
          'delete',
          '--resource-group',
          intent.resourceGroup,
          '--name',
          name,
          '--yes',
          '--subscription',
          intent.subscriptionId,
        ],
        resourceId: vmId,
        node,
        mutates: true,
        destructive: true,
        expectedOwnerPlanSha256,
      }),
    );
    const nicArgs = ['--nics', ...intent.nics.map((_nic, index) => `${name}-nic${index}`)];
    actions.push(
      next({
        phase: 'nodes',
        kind: 'vm-create',
        description: `Replace ${name} from the pinned CE image`,
        command: 'az',
        args: [
          'vm',
          'create',
          '--resource-group',
          intent.resourceGroup,
          '--name',
          name,
          '--image',
          observation.image.urn,
          '--size',
          intent.vm.size,
          ...zoneArgs(zones, node),
          ...nicArgs,
          '--plan-name',
          intent.image.plan,
          '--plan-product',
          intent.image.offer,
          '--plan-publisher',
          intent.image.publisher,
          '--os-disk-size-gb',
          '80',
          '--os-disk-delete-option',
          'Delete',
          '--custom-data',
          '__BOOTSTRAP_FILE__',
          '--subscription',
          intent.subscriptionId,
          '--tags',
          ...tagsArgs(intent.deploymentName, intent.engine ?? 'native'),
        ],
        resourceId: vmId,
        node,
        mutates: true,
        destructive: false,
        requiresBootstrap: true,
      }),
    );
    actions.push(
      next({
        phase: 'registration',
        kind: 'health-gate',
        description: `Verify replacement node ${node} registration, health, and routing`,
        node,
        mutates: false,
        destructive: false,
      }),
    );
    if (intent.routing.mode === 'route-server')
      actions.push(
        next({
          phase: 'routing',
          kind: 'bgp-gate',
          description: `Verify Route Server sessions and routes after replacing node ${node}`,
          node,
          mutates: false,
          destructive: false,
        }),
      );
    if (intent.ingress?.mode === 'platform-http')
      actions.push(
        next({
          phase: 'verify',
          kind: 'traffic-gate',
          description: `Verify traffic after replacing node ${node}`,
          node,
          mutates: false,
          destructive: false,
        }),
      );
    return actions;
  }
  if (intent.operation === 'update-network') {
    const routeServerId = managedId(
      intent.subscriptionId,
      intent.resourceGroup,
      `Microsoft.Network/virtualHubs/${intent.deploymentName}-rs`,
    );
    const expectedRouteServerOwnerPlanSha256 =
      intent.routing.mode === 'route-server' ? ownedPlanSha256(routeServerId, 'retained Route Server') : undefined;
    for (const node of nodes) {
      const name = `${intent.deploymentName}-${node}`;
      const vmId = managedId(intent.subscriptionId, intent.resourceGroup, `Microsoft.Compute/virtualMachines/${name}`);
      const expectedVmOwnerPlanSha256 = ownedPlanSha256(vmId, `network-update VM ${name}`);
      actions.push(
        next({
          phase: 'nodes',
          kind: 'vm-deallocate',
          description: `Deallocate ${name} before the symmetric NIC update`,
          command: 'az',
          args: [
            'vm',
            'deallocate',
            '--resource-group',
            intent.resourceGroup,
            '--name',
            name,
            '--subscription',
            intent.subscriptionId,
          ],
          resourceId: vmId,
          node,
          mutates: true,
          destructive: false,
          expectedOwnerPlanSha256: expectedVmOwnerPlanSha256,
        }),
      );
      for (const [index, nic] of intent.nics.entries()) {
        const subnetId =
          nic.subnet.resourceId ??
          managedId(
            intent.subscriptionId,
            intent.resourceGroup,
            `Microsoft.Network/virtualNetworks/${intent.deploymentName}-vnet/subnets/${nic.subnet.name ?? ''}`,
          );
        const nicId = managedId(
          intent.subscriptionId,
          intent.resourceGroup,
          `Microsoft.Network/networkInterfaces/${name}-nic${index}`,
        );
        const expectedNicOwnerPlanSha256 = ownedPlanSha256(nicId, `network-update NIC ${name}-nic${index}`);
        actions.push(
          next({
            phase: 'nodes',
            kind: 'nic-update',
            description: `Update NIC ${index} (${nic.role}) on ${name}`,
            command: 'az',
            args: [
              'network',
              'nic',
              'ip-config',
              'update',
              '--resource-group',
              intent.resourceGroup,
              '--nic-name',
              `${name}-nic${index}`,
              '--name',
              'ipconfig1',
              '--subnet',
              subnetId,
              '--subscription',
              intent.subscriptionId,
            ],
            resourceId: nicId,
            node,
            mutates: true,
            destructive: false,
            expectedOwnerPlanSha256: expectedNicOwnerPlanSha256,
          }),
        );
      }
      actions.push(
        next({
          phase: 'nodes',
          kind: 'vm-start',
          description: `Start ${name} after NIC update`,
          command: 'az',
          args: [
            'vm',
            'start',
            '--resource-group',
            intent.resourceGroup,
            '--name',
            name,
            '--subscription',
            intent.subscriptionId,
          ],
          resourceId: vmId,
          node,
          mutates: true,
          destructive: false,
          expectedOwnerPlanSha256: expectedVmOwnerPlanSha256,
        }),
      );
      actions.push(
        next({
          phase: 'registration',
          kind: 'health-gate',
          description: `Gate ${name} registration, health, data-plane restart, and routing`,
          node,
          mutates: false,
          destructive: false,
        }),
      );
      if (intent.routing.mode === 'route-server') {
        actions.push(
          next({
            phase: 'routing',
            kind: 'route-server-peer-update',
            description: `Update Route Server peer ${name} to the observed SLO address`,
            command: 'az',
            args: [
              'network',
              'routeserver',
              'peering',
              'update',
              '--resource-group',
              intent.resourceGroup,
              '--routeserver',
              `${intent.deploymentName}-rs`,
              '--name',
              name,
              '--peer-ip',
              `__NODE_${node}_SLO_PRIVATE_IP__`,
              '--peer-asn',
              String(intent.routing.localAsn ?? intent.routing.peerAsn ?? 65010),
              '--subscription',
              intent.subscriptionId,
            ],
            resourceId: `${routeServerId}/bgpConnections/${name}`,
            node,
            mutates: true,
            destructive: false,
            expectedOwnerPlanSha256: expectedRouteServerOwnerPlanSha256,
          }),
        );
      }
      if (intent.ingress?.mode === 'platform-http')
        actions.push(
          next({
            phase: 'verify',
            kind: 'traffic-gate',
            description: `Gate traffic before updating another node`,
            node,
            mutates: false,
            destructive: false,
          }),
        );
    }
    if (intent.routing.mode === 'route-server')
      actions.push(
        next({
          phase: 'routing',
          kind: 'bgp-gate',
          description: 'Verify Route Server convergence after all retained peer updates',
          mutates: false,
          destructive: false,
        }),
      );
    return actions;
  }
  if (intent.operation === 'teardown') {
    for (const change of [...intent.brownfield.routeChanges].reverse()) {
      const table = routeTableParts(change.routeTableId);
      const subnet = subnetParts(change.subnetId);
      const tableState = resourceById(observation, change.routeTableId)?.state ?? {};
      const subnetState = resourceById(observation, change.subnetId)?.state ?? {};
      const routes = Array.isArray(tableState.routes) ? tableState.routes : [];
      const previous = routes.find((route) => String(route.name ?? route.properties?.name) === change.routeName);
      const previousProperties = previous?.properties ?? previous;
      const routeArgs = previous
        ? [
            'network',
            'route-table',
            'route',
            'create',
            '--resource-group',
            table.resourceGroup,
            '--route-table-name',
            table.name,
            '--name',
            change.routeName,
            '--address-prefix',
            String(previousProperties?.addressPrefix ?? change.destinationCidr),
            '--next-hop-type',
            String(previousProperties?.nextHopType ?? 'None'),
          ]
        : [
            'network',
            'route-table',
            'route',
            'delete',
            '--resource-group',
            table.resourceGroup,
            '--route-table-name',
            table.name,
            '--name',
            change.routeName,
          ];
      if (previousProperties?.nextHopIpAddress)
        routeArgs.push('--next-hop-ip-address', String(previousProperties.nextHopIpAddress));
      actions.push(
        next({
          phase: 'teardown',
          kind: 'brownfield-restore',
          description: `Restore approved route ${change.routeName} exactly`,
          command: 'az',
          args: [...routeArgs, '--subscription', intent.subscriptionId],
          resourceId: change.routeTableId,
          mutates: true,
          destructive: false,
        }),
      );
      const previousRouteTable = subnetState.routeTable?.id;
      actions.push(
        next({
          phase: 'teardown',
          kind: 'brownfield-restore',
          description: `Restore approved subnet route-table association exactly`,
          command: 'az',
          args: [
            'network',
            'vnet',
            'subnet',
            'update',
            '--resource-group',
            subnet.resourceGroup,
            '--vnet-name',
            subnet.vnet,
            '--name',
            subnet.name,
            ...(previousRouteTable ? ['--route-table', String(previousRouteTable)] : ['--remove', 'routeTable']),
            '--subscription',
            intent.subscriptionId,
          ],
          resourceId: change.subnetId,
          mutates: true,
          destructive: false,
        }),
      );
    }
    const teardownPriority = (resource) => {
      const id = resource.id.toLowerCase();
      if (id.includes('/bgpconnections/')) return 10;
      if (id.includes('/virtualmachines/')) return 20;
      if (id.includes('/networkinterfaces/')) return 30;
      if (id.includes('/virtualhubs/')) return 40;
      if (id.includes('/publicipaddresses/')) return 50;
      if (id.includes('/routetables/')) return 60;
      if (id.includes('/networksecuritygroups/')) return 70;
      if (id.includes('/virtualnetworks/')) return 80;
      if (!id.includes('/providers/')) return 100;
      return 90;
    };
    const owned = observation.resources
      .filter(
        (resource) =>
          resource.exists &&
          resource.owned &&
          resource.tags['xcsh-managed-by'] === 'azure-ce' &&
          resource.tags['xcsh-deployment-id'] === intent.deploymentName,
      )
      .sort((a, b) => teardownPriority(a) - teardownPriority(b) || a.id.localeCompare(b.id));
    for (const resource of owned)
      actions.push(
        next({
          phase: 'teardown',
          kind: 'resource-delete',
          description: `Delete owned resource ${resource.id}`,
          command: 'az',
          args: resource.id.includes('/providers/')
            ? ['resource', 'delete', '--ids', resource.id, '--subscription', intent.subscriptionId]
            : ['group', 'delete', '--name', intent.resourceGroup, '--yes', '--subscription', intent.subscriptionId],
          resourceId: resource.id,
          mutates: true,
          destructive: true,
        }),
      );
    return actions;
  }
  actions.push(
    next({
      phase: 'verify',
      kind: 'health-gate',
      description: `Reconcile and verify ${intent.deploymentName}`,
      mutates: false,
      destructive: false,
    }),
  );
  return actions;
}
function compileAzureCePlan(input, observation) {
  const intent = normalizeIntent(input);
  if (observation.schemaVersion !== AZURE_CE_SCHEMA_VERSION) fail('unsupported observation schema');
  for (const resource of observation.resources) {
    if (
      resource.owned &&
      resource.tags['xcsh-deployment-id'] === intent.deploymentName &&
      resource.tags['xcsh-execution-engine'] !== intent.engine
    )
      fail('deployment resources belong to another or unknown execution engine');
  }
  const requiredResearchCommands = [
    'az vm image list-publishers',
    'az vm image list-offers',
    'az vm image list-skus',
    'az vm image list',
    'az vm image terms show',
    'az vm list-skus --all',
  ];
  if (observation.research?.method !== 'azure-cli-live') fail('live Azure research receipt is required');
  if (observation.research.officialSourceRetrieval !== 'live')
    fail('live official-source research receipt is required');
  for (const command of requiredResearchCommands) {
    if (!observation.research.commands.includes(command)) fail(`live Azure research receipt is missing ${command}`);
  }
  if (!observation.research.officialSources.some((source) => source.startsWith('https://docs.cloud.f5.com/')))
    fail('official F5 research source is required');
  if (!observation.research.officialSources.some((source) => source.startsWith('https://learn.microsoft.com/')))
    fail('official Microsoft research source is required');
  if (
    observation.research.sharedContract?.url !== AZURE_CE_SHARED_CONTRACT_URL ||
    observation.research.sharedContract.contractId !== 'f5xc-ce-automation-policy' ||
    observation.research.sharedContract.contractVersion !== 'v2' ||
    !/^[a-f0-9]{64}$/.test(observation.research.sharedContract.normalizedSha256)
  )
    fail('valid live shared Customer Edge automation contract receipt is required');
  const receiptUrls = new Set();
  for (const receipt of observation.research.sourceReceipts ?? []) {
    if (!receipt.url.startsWith('https://') || !/^[a-f0-9]{64}$/.test(receipt.normalizedSha256))
      fail('live official-source research receipt contains an invalid digest');
    if (receiptUrls.has(receipt.url)) fail('live official-source research receipt contains duplicate URLs');
    receiptUrls.add(receipt.url);
  }
  for (const source of [...observation.research.officialSources, AZURE_CE_SHARED_CONTRACT_URL])
    if (!receiptUrls.has(source)) fail(`live official-source research receipt is missing ${source}`);
  const sharedReceipt = observation.research.sourceReceipts.find(
    (receipt) => receipt.url === AZURE_CE_SHARED_CONTRACT_URL,
  );
  if (sharedReceipt?.normalizedSha256 !== observation.research.sharedContract.normalizedSha256)
    fail('shared Customer Edge automation contract receipt digest is inconsistent');
  if (observation.subscription.cloud !== 'AzureCloud') fail('only AzureCloud is supported');
  if (observation.subscription.id.toLowerCase() !== intent.subscriptionId)
    fail('observation subscription does not match intent');
  if (
    ['deploy', 'replace-node', 'repair'].includes(intent.operation) &&
    observation.image.termsAccepted !== true &&
    !(intent.engine === 'terraform' && intent.operation === 'deploy')
  )
    fail(
      'Marketplace terms are unaccepted for this exact image plan; only an initial Terraform deployment can accept them during apply',
    );
  if (observation.image.version.toLowerCase() === 'latest') fail('image version latest is forbidden');
  if (!/^\d+\.\d+\.\d+$/.test(observation.image.version)) fail('image version must be an exact Marketplace version');
  const expectedUrn = [
    observation.image.publisher,
    observation.image.offer,
    observation.image.plan,
    observation.image.version,
  ].join(':');
  if (observation.image.urn.toLowerCase() !== expectedUrn.toLowerCase())
    fail('observed image URN does not match its publisher, offer, plan and exact version');
  for (const field of ['publisher', 'offer', 'plan']) {
    if (observation.image[field].toLowerCase() !== intent.image[field].toLowerCase())
      fail(`observed image ${field} does not match intent`);
  }
  const eligibleRegions = [...observation.regions]
    .filter((region) => region.eligible)
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  const region = intent.region
    ? observation.regions.find((candidate) => candidate.name.toLowerCase() === intent.region)
    : eligibleRegions[0];
  if (!region?.eligible) fail(`region ${intent.region ?? '<recommended>'} is not eligible`);
  const size = region.vmSizes.find((candidate) => candidate.name.toLowerCase() === intent.vm.size.toLowerCase());
  if (!size || size.restricted) fail(`VM size ${intent.vm.size} is unavailable or restricted in ${region.name}`);
  if (!Number.isFinite(size.memoryGb) || !Number.isInteger(size.maxNics) || size.maxNics < 1)
    fail('VM size has incomplete observed memory or NIC capabilities');
  if (size.vCpus < 8 || size.memoryGb < 32)
    fail(`VM size ${intent.vm.size} is below the CE minimum of 8 vCPUs and 32 GB memory`);
  if (size.maxNics < intent.nics.length)
    fail(`VM size ${intent.vm.size} NIC limit ${size.maxNics} is below requested NIC count ${intent.nics.length}`);
  const nodeCount = intent.topology.ha ? 3 : 1;
  const requiredCores = size.vCpus * nodeCount;
  if (!Number.isInteger(size.vCpus) || size.vCpus < 1)
    fail(`VM size ${intent.vm.size} has no valid observed vCPU capability`);
  if (region.quotaAvailable < requiredCores)
    fail(`insufficient regional vCPU quota: ${requiredCores} required for ${nodeCount} nodes`);
  for (const id of intent.brownfield.resourceIds) {
    const observed = resourceById(observation, id);
    if (!observed?.exists) fail(`brownfield resource was not observed: ${id}`);
    if (observed.owned) fail(`pre-existing brownfield resource cannot be adopted as owned: ${id}`);
  }
  const targetGroupId = groupId(intent.subscriptionId, intent.resourceGroup).toLowerCase();
  const targetGroup = resourceById(observation, targetGroupId);
  const targetGroupApproved = intent.brownfield.resourceIds.some((id) => id.toLowerCase() === targetGroupId);
  if (targetGroup?.exists && !targetGroup.owned && !targetGroupApproved)
    fail(`pre-existing resource group must be explicitly selected as brownfield: ${targetGroupId}`);
  const warnings = [];
  const requestedZones = intent.vm.zones ?? [];
  let zones;
  if (intent.topology.ha) {
    const available = requestedZones.length ? requestedZones.filter((zone) => size.zones.includes(zone)) : size.zones;
    if (available.length >= 3) zones = available.slice(0, 3);
    else {
      zones = available.length ? Array.from({ length: 3 }, (_, index) => available[index] ?? available[0]) : [];
      warnings.push(
        available.length
          ? `Three distinct zones are unavailable in ${region.name}; the approved plan uses ${zones.join(', ')}`
          : `Availability zones are unavailable in ${region.name}; the approved plan uses a regional deployment`,
      );
    }
  } else {
    const zone = requestedZones.find((candidate) => size.zones.includes(candidate)) ?? size.zones[0];
    zones = zone ? [zone] : [];
    if (requestedZones.length && !requestedZones.includes(zone ?? ''))
      warnings.push(
        `Requested zone placement is unavailable in ${region.name}; the approved plan uses ${zone ?? 'a regional deployment'}`,
      );
  }
  const allGreenfield = intent.nics.every((nic) => nic.subnet.mode === 'greenfield');
  const routingMode =
    intent.routing.mode === 'auto'
      ? intent.topology.ha && allGreenfield
        ? 'route-server'
        : 'udr'
      : intent.routing.mode;
  if (routingMode === 'route-server') validateRouteServerIntent(intent);
  if (routingMode === 'route-server' && !allGreenfield)
    fail('same-VNet brownfield Route Server insertion is unsupported; use explicitly approved UDR associations');
  if (routingMode === 'route-server' && !region.routeServerSupported)
    fail(`Route Server is unsupported in ${region.name}`);
  if (intent.egress.mode !== 'public-ip' && !intent.egress.resourceId)
    fail(`${intent.egress.mode} egress requires an explicit resourceId`);
  if (intent.egress.resourceId) {
    validateResourceId(intent.egress.resourceId, intent.subscriptionId);
    if (!intent.brownfield.resourceIds.some((id) => id.toLowerCase() === intent.egress.resourceId?.toLowerCase()))
      fail('selected egress resource must be explicitly listed in brownfield.resourceIds');
    if (!resourceById(observation, intent.egress.resourceId)?.exists) fail('selected egress resource was not observed');
  }
  if (intent.egress.mode === 'firewall' || intent.egress.mode === 'proxy')
    warnings.push('Strict FQDN egress is delegated to the explicitly selected firewall/proxy profile');
  if (
    intent.securityRules.some((rule) =>
      [...rule.sourceCidrs, ...rule.destinationCidrs].some((cidr) => cidr === '0.0.0.0/0' || cidr === '::/0'),
    )
  )
    warnings.push('Broad CIDR exposure requires explicit approval');
  if (intent.securityRules.some((rule) => rule.purpose === 'management' && rule.direction === 'Inbound'))
    warnings.push('Inbound management exposure requires explicit approval');
  if (!intent.topology.ha && ['resize', 'replace-node', 'update-network'].includes(intent.operation))
    warnings.push('This single-node lifecycle operation is disruptive and requires a maintenance window');
  const rollbackRoutes = intent.brownfield.routeChanges.map((change) => {
    const observed = resourceById(observation, change.routeTableId);
    if (!observed?.exists) fail(`route table was not observed: ${change.routeTableId}`);
    const observedSubnet = resourceById(observation, change.subnetId);
    if (!observedSubnet?.exists) fail(`subnet was not observed: ${change.subnetId}`);
    return {
      routeTableId: change.routeTableId,
      subnetId: change.subnetId,
      routeName: change.routeName,
      before: observed.state,
      beforeSubnet: observedSubnet.state,
    };
  });
  const ownershipInventory = intent.brownfield.resourceIds.map((resourceId) => ({
    resourceId,
    owned: false,
    action:
      (intent.ingress?.mode === 'platform-http' &&
        intent.ingress.probe.sourceVmResourceId.toLowerCase() === resourceId.toLowerCase()) ||
      intent.brownfield.routeChanges.some(
        (change) =>
          change.routeTableId.toLowerCase() === resourceId.toLowerCase() ||
          change.subnetId.toLowerCase() === resourceId.toLowerCase(),
      )
        ? 'modify-approved'
        : 'reference',
  }));
  const routeServerCidr = routingMode === 'route-server' ? routeServerSubnetCidr(intent) : undefined;
  const actions = ['deploy'].includes(intent.operation)
    ? buildDeployActions(
        intent,
        region.name,
        zones,
        routingMode,
        observation.image.urn,
        routeServerCidr,
        !targetGroup?.exists,
      )
    : buildLifecycleActions(intent, observation, zones);
  for (const action of actions) {
    if (
      !action.resourceId ||
      ownershipInventory.some((item) => item.resourceId.toLowerCase() === action.resourceId?.toLowerCase())
    )
      continue;
    if (action.kind === 'resource-delete')
      ownershipInventory.push({ resourceId: action.resourceId, owned: true, action: 'delete' });
    else if (
      [
        'resource-group-create',
        'vnet-create',
        'subnet-create',
        'nsg-create',
        'nsg-rule-create',
        'public-ip-create',
        'nic-create',
        'vm-create',
        'route-table-create',
        'route-server-create',
        'route-server-peer-create',
      ].includes(action.kind)
    ) {
      ownershipInventory.push({ resourceId: action.resourceId, owned: true, action: 'create' });
    }
  }
  for (const resource of observation.resources) {
    if (
      !resource.owned ||
      resource.tags['xcsh-managed-by'] !== 'azure-ce' ||
      resource.tags['xcsh-deployment-id'] !== intent.deploymentName
    )
      continue;
    if (ownershipInventory.some((item) => item.resourceId.toLowerCase() === resource.id.toLowerCase())) continue;
    ownershipInventory.push({ resourceId: resource.id, owned: true, action: 'reference' });
  }
  const workloadFixtureCount = intent.workloadFixture ? 1 : 0;
  const billableResources = [
    { type: 'virtual-machine', count: nodeCount + workloadFixtureCount },
    { type: 'managed-disk', count: nodeCount + workloadFixtureCount },
    ...(intent.egress.mode === 'public-ip' ? [{ type: 'standard-public-ip', count: nodeCount }] : []),
    ...(routingMode === 'route-server'
      ? [
          { type: 'route-server', count: 1 },
          { type: 'standard-public-ip', count: 1 },
        ]
      : []),
  ];
  const draft = {
    engine: intent.engine ?? 'native',
    schemaVersion: AZURE_CE_SCHEMA_VERSION,
    intent,
    subscription: observation.subscription,
    deploymentName: intent.deploymentName,
    siteName: intent.siteName,
    namespace: intent.namespace,
    region: region.name,
    topology: { ha: intent.topology.ha, nodeCount, zones },
    nics: intent.nics.map((nic, index) => ({ ...nic, index })),
    egress: intent.egress,
    routing: {
      mode: routingMode,
      destinationCidrs: intent.routing.destinationCidrs,
      localAsn: intent.routing.localAsn ?? intent.routing.peerAsn ?? 65010,
      peerAsn: intent.routing.peerAsn ?? intent.routing.localAsn ?? 65010,
    },
    securityRules: intent.securityRules,
    image: observation.image,
    vm: intent.vm,
    warnings,
    billableResources,
    actions,
    rollback: { brownfieldRoutes: rollbackRoutes },
    observationFingerprint:
      intent.operation === 'deploy'
        ? fingerprintDeploymentObservation(observation, intent.brownfield.resourceIds, region.name, size.name)
        : fingerprintObservation(observation, intent.brownfield.resourceIds),
    ownershipInventory,
    ownershipTagTemplate: {
      'xcsh-managed-by': 'azure-ce',
      'xcsh-execution-engine': intent.engine ?? 'native',
      'xcsh-deployment-id': intent.deploymentName,
      'xcsh-plan-sha256': '__PLAN_SHA256__',
    },
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `azure-ce-${planSha256.slice(0, 24)}`, planSha256 };
}
var UUID2, SAFE_NAME, RESOURCE_ID2, PORT, F5_NAME, DOMAIN;
var init_planner = __esm(() => {
  init_canonical();
  UUID2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  SAFE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$/;
  RESOURCE_ID2 = /^\/subscriptions\/([^/]+)\/resourceGroups\/([^/]+)(?:\/providers\/([^/]+)\/(.+))?$/i;
  PORT = /^(?:\*|\d{1,5}(?:-\d{1,5})?)$/;
  F5_NAME = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
});

// plugins/azure/src/tools/azure-ce-plan.ts
function createAzureCePlanTool(pi) {
  const { Type } = pi.typebox;
  const subnet = Type.Object({
    mode: Type.Union([Type.Literal('greenfield'), Type.Literal('brownfield')]),
    name: Type.Optional(Type.String()),
    cidr: Type.Optional(Type.String()),
    resourceId: Type.Optional(Type.String()),
    vnetResourceId: Type.Optional(Type.String()),
  });
  const nic = Type.Object({
    name: Type.String(),
    role: Type.Union(['slo', 'sli', 'management', 'data', 'cluster', 'other'].map((value) => Type.Literal(value))),
    vrf: Type.Optional(Type.String()),
    subnet,
  });
  return {
    name: 'azure_ce_plan',
    label: 'Plan Azure Customer Edge',
    description:
      'Compile normalized natural-language intent and a live discovery artifact into a canonical, immutable, secret-free Azure Customer Edge plan. Users never need to author YAML.',
    parameters: Type.Object({
      discoveryArtifactId: Type.String(),
      intent: Type.Object({
        schemaVersion: Type.Literal(AZURE_CE_SCHEMA_VERSION),
        platformContext: Type.Optional(Type.String()),
        engine: Type.Optional(Type.Union([Type.Literal('native'), Type.Literal('terraform')])),
        operation: Type.Union(
          [
            'deploy',
            'reconcile',
            'start',
            'stop',
            'resize',
            'update-network',
            'replace-node',
            'repair',
            'teardown',
          ].map((value) => Type.Literal(value)),
        ),
        subscriptionId: Type.String(),
        deploymentName: Type.String(),
        siteName: Type.String(),
        namespace: Type.String(),
        resourceGroup: Type.String(),
        region: Type.Optional(Type.String()),
        topology: Type.Object({ ha: Type.Boolean() }),
        nics: Type.Array(nic, { minItems: 1, maxItems: 8 }),
        egress: Type.Object({
          mode: Type.Union(['public-ip', 'nat-gateway', 'firewall', 'proxy'].map((value) => Type.Literal(value))),
          resourceId: Type.Optional(Type.String()),
        }),
        routing: Type.Object({
          mode: Type.Union(['auto', 'udr', 'route-server'].map((value) => Type.Literal(value))),
          destinationCidrs: Type.Array(Type.String()),
          localAsn: Type.Optional(
            Type.Number({ description: 'CE local ASN; Route Server requires an unreserved 16-bit value.' }),
          ),
          peerAsn: Type.Optional(
            Type.Number({ description: 'CE ASN passed to Azure peering; must equal localAsn when both are supplied.' }),
          ),
        }),
        ingress: Type.Optional(
          Type.Union([
            Type.Object({ mode: Type.Literal('none') }),
            Type.Object({
              mode: Type.Literal('platform-http'),
              port: Type.Integer({ minimum: 1, maximum: 65535 }),
              listener: Type.Object({
                name: Type.String(),
                namespace: Type.String(),
                domain: Type.String(),
                privateAddress: Type.String(),
                originPool: Type.Object({ name: Type.String(), namespace: Type.String() }),
              }),
              probe: Type.Object({
                sourceVmResourceId: Type.String(),
                path: Type.String(),
                expectedStatus: Type.Integer({ minimum: 100, maximum: 599 }),
                expectedBodySha256: Type.String(),
              }),
            }),
          ]),
        ),
        securityRules: Type.Array(
          Type.Object({
            name: Type.String(),
            purpose: Type.Union(
              ['application-vip', 'management', 'intra-cluster', 'platform-connectivity'].map((value) =>
                Type.Literal(value),
              ),
            ),
            direction: Type.Union([Type.Literal('Inbound'), Type.Literal('Outbound')]),
            protocol: Type.Union([Type.Literal('Tcp'), Type.Literal('Udp'), Type.Literal('*')]),
            sourceCidrs: Type.Array(Type.String()),
            destinationCidrs: Type.Array(Type.String()),
            destinationPorts: Type.Array(Type.String()),
          }),
        ),
        initialVersions: Type.Optional(Type.Object({ software: Type.String(), os: Type.String() })),
        image: Type.Object({ publisher: Type.String(), offer: Type.String(), plan: Type.String() }),
        vm: Type.Object({ size: Type.String(), zones: Type.Optional(Type.Array(Type.String())) }),
        brownfield: Type.Object({
          resourceIds: Type.Array(Type.String()),
          routeChanges: Type.Array(
            Type.Object({
              routeTableId: Type.String(),
              subnetId: Type.String(),
              routeName: Type.String(),
              destinationCidr: Type.String(),
            }),
          ),
        }),
        workloadFixture: Type.Optional(
          Type.Object({
            subnetName: Type.String(),
            cidr: Type.String(),
            privateIp: Type.String(),
            port: Type.Integer({ minimum: 1, maximum: 65535 }),
          }),
        ),
        replacementNode: Type.Optional(Type.Number()),
      }),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      try {
        const observation = await loadDiscoveryArtifact(ctx.sessionManager, params.discoveryArtifactId);
        const plan = compileAzureCePlan(params.intent, observation);
        const artifactId = await savePlanArtifact(ctx.sessionManager, plan, observation);
        const warnings = plan.warnings.length
          ? `
Warnings:
${plan.warnings
  .map((warning) => `- ${warning}`)
  .join(`
`)}`
          : '';
        const costs = plan.billableResources.map((item) => `${item.count} ${item.type}`).join(', ');
        return {
          content: [
            {
              type: 'text',
              text: `Plan ID: ${plan.planId}
SHA-256: ${plan.planSha256}
Region: ${plan.region}
Topology: ${plan.topology.nodeCount} node(s), ${plan.nics.length} NIC(s) each
Pinned image: ${plan.image.urn}
Billable resources: ${costs}
Ordered actions: ${plan.actions.length}${warnings}
Plan artifact: ${artifactId ? `artifact://${artifactId}` : 'session memory only'}`,
            },
          ],
          details: { tool: 'azure_ce_plan', artifactId, plan },
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Azure CE planning failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'azure_ce_plan' },
        };
      }
    },
  };
}
var init_azure_ce_plan = __esm(() => {
  init_artifacts();
  init_planner();
});

// plugins/platform/src/ce/contract-auth.ts
import { execFileSync } from 'node:child_process';

function existingContractCredential(env = process.env) {
  const configured = env.GH_TOKEN || env.GITHUB_TOKEN;
  if (configured) return configured;
  try {
    return (
      execFileSync('gh', ['auth', 'token'], {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() || undefined
    );
  } catch {
    return;
  }
}
function contractHeaders(url, token) {
  const headers = { Accept: 'application/vnd.github+json' };
  const target = new URL(url);
  if (
    token &&
    target.origin === 'https://api.github.com' &&
    target.pathname.startsWith('/repos/f5-sales-demo/api-specs-enriched/')
  )
    headers.Authorization = `Bearer ${token}`;
  return headers;
}
function authenticatedContractHeaders(url) {
  const target = new URL(url);
  const scoped =
    target.origin === 'https://api.github.com' &&
    target.pathname.startsWith('/repos/f5-sales-demo/api-specs-enriched/');
  return contractHeaders(url, scoped ? existingContractCredential() : undefined);
}
var init_contract_auth = () => {};

// plugins/platform/src/ce/verified-api-release.ts
import { createHash as createHash3 } from 'node:crypto';

function object2(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed CE API contract');
  return value;
}
function parse(bytes) {
  try {
    return object2(JSON.parse(Buffer.from(bytes).toString('utf8')));
  } catch {
    throw new Error('Malformed CE API contract JSON');
  }
}
async function loadPublishedCeApi(fetcher = fetch, signal) {
  signal?.throwIfAborted();
  let pending = verifiedSchemas.get(fetcher);
  if (!pending) {
    pending = verifyPublishedCeApi(fetcher, signal);
    verifiedSchemas.set(fetcher, pending);
    pending.catch(() => {
      if (verifiedSchemas.get(fetcher) === pending) verifiedSchemas.delete(fetcher);
    });
  }
  const api = await pending;
  signal?.throwIfAborted();
  return structuredClone(api);
}
async function verifyPublishedCeApi(fetcher, signal) {
  const deadline = AbortSignal.timeout(60000);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const read = async (url, maximum = 1048576) => {
    combined.throwIfAborted();
    let response;
    try {
      response = await fetcher(url, { signal: combined, headers: authenticatedContractHeaders(url) });
    } catch {
      throw new CeContractFailure('public_contract_transport', 'Published contract transport failed');
    }
    if (!response.ok || !response.body)
      throw new CeContractFailure(
        'public_contract_transport',
        `CE API contract download failed: HTTP ${response.status}, ${new URL(url).hostname}`,
      );
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        combined.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maximum) throw new Error('CE API contract download exceeds size limit');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    return Buffer.concat(chunks);
  };
  const release = parse(await read(`https://api.github.com/repos/${repository}/releases/tags/${tag}`));
  if (release.tag_name !== tag || release.immutable !== true || release.draft !== false || release.prerelease !== false)
    throw new Error('CE API release is not the pinned immutable publication');
  const matches =
    typeof release.body === 'string' ? [...release.body.matchAll(/^<!-- publication-receipt:(.+) -->$/gm)] : [];
  if (matches.length !== 1) throw new Error('CE API publication receipt is missing or ambiguous');
  const receipt = parse(Buffer.from(matches[0][1]));
  if (receipt.commit !== commit || receipt.version !== '12.2.0' || object2(receipt.assets)['openapi.json'] !== digest)
    throw new Error('CE API publication receipt differs from the pinned contract');
  const assets = Array.isArray(release.assets)
    ? release.assets.map(object2).filter((asset) => asset.name === 'openapi.json')
    : [];
  if (assets.length !== 1 || assets[0].digest !== digest || assets[0].browser_download_url !== assetUrl)
    throw new Error('CE API schema asset binding differs from the pinned contract');
  const resolved = parse(await read(`https://api.github.com/repos/${repository}/commits/${tag}`));
  if (resolved.sha !== commit) throw new Error('CE API release tag moved');
  const bytes = await read(assetUrl, 64 * 1024 * 1024);
  if (`sha256:${createHash3('sha256').update(bytes).digest('hex')}` !== digest)
    throw new Error('CE API schema checksum mismatch');
  const api = parse(bytes);
  combined.throwIfAborted();
  return api;
}
var CeContractFailure,
  repository = 'f5-sales-demo/api-specs-enriched',
  tag = 'v12.2.0',
  commit = '5e9c71b44e140a12cbbe29ad48e1e32e16e3cd1f',
  digest = 'sha256:f599b99d0824aa52599896dcfc1dad9dca69a94396acc64eedca837c17517cd9',
  assetUrl,
  CE_API_RELEASE,
  verifiedSchemas;
var init_verified_api_release = __esm(() => {
  init_contract_auth();
  CeContractFailure = class CeContractFailure extends Error {
    category;
    constructor(category, message) {
      super(message);
      this.category = category;
    }
  };
  assetUrl = `https://github.com/${repository}/releases/download/${tag}/openapi.json`;
  CE_API_RELEASE = Object.freeze({ tag, commit, fingerprint: digest });
  verifiedSchemas = new WeakMap();
});

// plugins/platform/src/ce/wire-replace.ts
function projectReplaceSnapshot(value, schemas, root, ignoredRootFields = []) {
  function shape(value, depth = 0) {
    if (depth > 50) throw new Error('Replacement schema nesting exceeds limit');
    const schema = object3(value);
    let resolved = {};
    if (schema.$ref) {
      if (typeof schema.$ref !== 'string' || !schema.$ref.startsWith('#/components/schemas/'))
        throw new Error('Unsupported replacement reference');
      resolved = shape(schemas[schema.$ref.slice('#/components/schemas/'.length)], depth + 1);
    }
    if (schema.allOf)
      for (const item of schema.allOf) {
        const part = shape(item, depth + 1);
        resolved = {
          ...resolved,
          ...part,
          ...(resolved.properties || part.properties
            ? { properties: { ...resolved.properties, ...part.properties } }
            : {}),
        };
      }
    return {
      ...resolved,
      ...schema,
      ...(schema.properties ? { properties: { ...resolved.properties, ...object3(schema.properties) } } : {}),
    };
  }
  function project(value, schemaValue, top = false) {
    const schema = shape(schemaValue);
    if (schema.readOnly === true || value === null || (value === '' && Number(schema.minLength) > 0)) return;
    if (Array.isArray(value)) {
      if (!schema.items) throw new Error('Replacement array schema missing');
      return value.map((item) => {
        const projected = project(item, schema.items);
        if (projected === undefined) throw new Error('Replacement array contains an unset item');
        return projected;
      });
    }
    if (value && typeof value === 'object') {
      if (schema.properties === undefined && schema.additionalProperties === undefined) return structuredClone(value);
      const properties = object3(schema.properties ?? {});
      const result = {};
      for (const [key, item] of Object.entries(value)) {
        const canonicalKey = Object.hasOwn(properties, key)
          ? key
          : Object.keys(properties).find((name) => object3(properties[name])['x-f5xc-wire-name'] === key);
        if (canonicalKey === undefined) {
          if (top && ignoredRootFields.includes(key)) continue;
          if (schema.additionalProperties === true) {
            result[key] = structuredClone(item);
            continue;
          }
          if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
            const projected = project(item, schema.additionalProperties);
            if (projected !== undefined) result[key] = projected;
            continue;
          }
          throw new Error('GET snapshot contains an unsupported replacement field');
        }
        const wireName = object3(properties[canonicalKey])['x-f5xc-wire-name'];
        const outputKey = typeof wireName === 'string' ? wireName : canonicalKey;
        if (Object.hasOwn(result, outputKey)) throw new Error('Duplicate canonical and wire field aliases');
        const projected = project(item, properties[canonicalKey]);
        if (projected !== undefined) result[outputKey] = projected;
      }
      return result;
    }
    return structuredClone(value);
  }
  return object3(project(value, schemas[root], true));
}
var object3 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed replacement schema');
  return value;
};

// plugins/platform/src/ce/wire-ingress.ts
import { isIP as isIP2 } from 'node:net';

function projectInsideHttpListener(spec, schemas, validate) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error('Malformed HTTP listener response');
  const source = structuredClone(spec);
  for (const key of ['api_rate_limit_legacy', 'malicious_user_mitigation'])
    if (source[key] === null) delete source[key];
  for (const key of [
    'downstream_tls_certificate_expiration_timestamps',
    'waf_exclusion_rules',
    'dns_info',
    'internet_vip_info',
  ])
    if (Array.isArray(source[key]) && source[key].length === 0) delete source[key];
  if (source.host_name === '') delete source.host_name;
  const placements = source.advertise_custom?.advertise_where;
  if (Array.isArray(placements))
    for (const placement of placements) {
      const site = placement?.site;
      if (site?.ipv6 === '') delete site.ipv6;
    }
  const result = projectReplaceSnapshot(source, schemas, 'viewshttp_loadbalancerCreateSpecType', [
    'state',
    'auto_cert_info',
    'cert_state',
  ]);
  validate(result);
  const omitEmpty = (value, keys) => {
    for (const key of keys) {
      const item = value[key];
      if (item && typeof item === 'object' && !Array.isArray(item) && Object.keys(item).length === 0) delete value[key];
    }
  };
  omitEmpty(result, [
    'service_policies_from_namespace',
    'disable_trust_client_ip_headers',
    'disable_malicious_user_detection',
    'default_sensitive_data_policy',
    'disable_threat_mesh',
    'disable_malware_protection',
  ]);
  if (result.l7_ddos_protection)
    omitEmpty(result.l7_ddos_protection, [
      'mitigation_block',
      'default_rps_threshold',
      'clientside_action_none',
      'ddos_policy_none',
    ]);
  if (Array.isArray(result.default_route_pools))
    for (const pool of result.default_route_pools) omitEmpty(pool, ['endpoint_subsets']);
  return result;
}
function buildInsideHttpListener(input, validate) {
  const name = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  const domain = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  if (
    !input ||
    ![input.name, input.namespace, input.originPool?.name, input.originPool?.namespace].every(
      (value) => typeof value === 'string' && name.test(value),
    ) ||
    typeof input.domain !== 'string' ||
    input.domain.length > 253 ||
    !domain.test(input.domain) ||
    !Number.isInteger(input.port) ||
    input.port < 1 ||
    input.port > 65535 ||
    !Array.isArray(input.sites) ||
    input.sites.length < 1 ||
    input.sites.length > 32
  )
    throw new Error('Invalid inside HTTP listener identity or topology');
  const names = new Set();
  const addresses = new Set();
  const advertiseWhere = input.sites.map((site) => {
    if (
      !site ||
      typeof site.name !== 'string' ||
      !name.test(site.name) ||
      typeof site.insideAddress !== 'string' ||
      isIP2(site.insideAddress) !== 4 ||
      names.has(site.name) ||
      addresses.has(site.insideAddress)
    )
      throw new Error('Invalid or ambiguous inside HTTP listener placement');
    names.add(site.name);
    addresses.add(site.insideAddress);
    return {
      site: {
        site: { name: site.name, namespace: 'system' },
        ip: site.insideAddress,
        network: 'SITE_NETWORK_INSIDE',
      },
      use_default_port: {},
    };
  });
  const spec = {
    domains: [input.domain],
    http: { port: input.port },
    advertise_custom: { advertise_where: advertiseWhere },
    default_route_pools: [
      {
        pool: { name: input.originPool.name, namespace: input.originPool.namespace },
        weight: 1,
        priority: 1,
      },
    ],
    round_robin: {},
    no_challenge: {},
    user_id_client_ip: {},
    disable_waf: {},
    disable_rate_limit: {},
    disable_api_discovery: {},
    disable_api_testing: {},
    disable_api_definition: {},
    l7_ddos_protection: {},
  };
  validate(spec);
  return {
    metadata: { name: input.name, namespace: input.namespace },
    spec,
    evidence: { listener: 'unknown', routes: 'unknown', traffic: 'unknown' },
  };
}
var init_wire_ingress = () => {};

// plugins/platform/src/ce/wire-origin.ts
import { isIP as isIP3 } from 'node:net';

function projectSiteLocalHttpOrigin(spec, schemas, validate) {
  const result = projectReplaceSnapshot(spec, schemas, 'viewsorigin_poolCreateSpecType');
  for (const key of ['advanced_options', 'upstream_conn_pool_reuse_type']) {
    const value = result[key];
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)
      delete result[key];
  }
  if (Array.isArray(result.healthcheck) && result.healthcheck.length === 0) delete result.healthcheck;
  if (Array.isArray(result.origin_servers))
    for (const server of result.origin_servers) {
      if (!server || typeof server !== 'object' || Array.isArray(server)) continue;
      const privateIp = server.private_ip;
      if (!privateIp || typeof privateIp !== 'object' || Array.isArray(privateIp)) continue;
      const snat = privateIp.snat_pool;
      if (snat && typeof snat === 'object' && !Array.isArray(snat) && Object.keys(snat).length === 0)
        delete privateIp.snat_pool;
    }
  validate(result);
  return result;
}
function buildSiteLocalHttpOrigin(input, validate) {
  const name = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  if (
    !input ||
    Object.keys(input).sort().join(',') !== 'name,namespace,originAddress,port,siteNames' ||
    ![input.name, input.namespace].every((value) => typeof value === 'string' && name.test(value)) ||
    typeof input.originAddress !== 'string' ||
    isIP3(input.originAddress) !== 4 ||
    !Number.isInteger(input.port) ||
    input.port < 1 ||
    input.port > 65535 ||
    !Array.isArray(input.siteNames) ||
    input.siteNames.length < 1 ||
    input.siteNames.length > 32 ||
    new Set(input.siteNames).size !== input.siteNames.length ||
    input.siteNames.some((value) => typeof value !== 'string' || !name.test(value))
  )
    throw new Error('Explicit HTTP origin and distinct site identities are required');
  const spec = {
    port: input.port,
    origin_servers: input.siteNames.map((siteName) => ({
      labels: {},
      private_ip: {
        ip: input.originAddress,
        inside_network: {},
        site_locator: { site: { name: siteName, namespace: 'system' } },
      },
    })),
    no_tls: {},
    loadbalancer_algorithm: 'ROUND_ROBIN',
    endpoint_selection: 'LOCAL_PREFERRED',
  };
  validate(spec);
  return {
    metadata: { name: input.name, namespace: input.namespace },
    spec,
    evidence: { origin: 'unknown', traffic: 'unknown' },
  };
}
var init_wire_origin = () => {};

// plugins/platform/src/ce/wire-schema.ts
import { isIP as isIP4 } from 'node:net';

function object4(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('SMSv2 schema is malformed');
  return value;
}
function requestSchema(schemas, root) {
  const definitions = {};
  const referenced = new Set();
  function convert(value) {
    if (typeof value === 'boolean') return value;
    const source = object4(value);
    if (source.readOnly === true) return false;
    const result = {};
    for (const [key, item] of Object.entries(source)) {
      if (keywords.has(key)) result[key] = item;
      if (key === 'required' && Array.isArray(item))
        result.required = item.map((name) => {
          const property = object4(source.properties ?? {})[String(name)];
          return typeof property?.['x-f5xc-wire-name'] === 'string' ? property['x-f5xc-wire-name'] : name;
        });
      if (key === '$ref') {
        if (typeof item !== 'string' || !item.startsWith('#/components/schemas/'))
          throw new Error('Unsupported SMSv2 schema reference');
        const name = item.slice('#/components/schemas/'.length);
        if (!Object.hasOwn(schemas, name)) throw new Error('Missing SMSv2 schema reference');
        referenced.add(name);
        result.$ref = `#/definitions/${name}`;
      }
      if (key === 'properties') {
        result.properties = Object.fromEntries(
          Object.entries(object4(item)).map(([name, schema]) => {
            const wireName = object4(schema)['x-f5xc-wire-name'];
            return [typeof wireName === 'string' ? wireName : name, convert(schema)];
          }),
        );
        result.additionalProperties =
          source.additionalProperties === undefined ? false : convert(source.additionalProperties);
      }
      if (key === 'additionalProperties') result.additionalProperties = convert(item);
      if (key === 'items' || key === 'not') result[key] = convert(item);
      if (['allOf', 'anyOf', 'oneOf'].includes(key)) {
        if (!Array.isArray(item)) throw new Error('Malformed SMSv2 schema composition');
        result[key] = item.map(convert);
      }
      if (key === 'exclusiveMinimum' || key === 'exclusiveMaximum') {
        if (typeof item === 'number') result[key] = item;
        else if (item === true) result[key] = source[key === 'exclusiveMinimum' ? 'minimum' : 'maximum'];
      }
    }
    const exclusions = [];
    for (const [key, item] of Object.entries(source)) {
      if (!key.startsWith('x-ves-oneof-field-')) continue;
      let names;
      try {
        names = typeof item === 'string' ? JSON.parse(item) : item;
      } catch {
        throw new Error('Malformed SMSv2 oneof group');
      }
      if (!Array.isArray(names) || names.some((name) => typeof name !== 'string'))
        throw new Error('Malformed SMSv2 oneof group');
      const wireNames = names.map((name) => {
        const property = object4(source.properties ?? {})[String(name)];
        return typeof property?.['x-f5xc-wire-name'] === 'string' ? property['x-f5xc-wire-name'] : name;
      });
      for (let i = 0; i < wireNames.length; i++)
        for (let j = i + 1; j < wireNames.length; j++)
          exclusions.push({ not: { required: [wireNames[i], wireNames[j]] } });
    }
    if (exclusions.length) result.allOf = [...(result.allOf ?? []), ...exclusions];
    return result;
  }
  if (!Object.hasOwn(schemas, root)) throw new Error('Missing SMSv2 create schema');
  referenced.add(root);
  for (const name of referenced) definitions[name] = convert(schemas[name]);
  return { $ref: `#/definitions/${root}`, definitions };
}
function createWireValidator(
  schemas,
  root = 'viewssecuremesh_site_v2CreateSpecType',
  observedInterfaceIdentityEcho = false,
) {
  const schema = requestSchema(schemas, root);
  if (observedInterfaceIdentityEcho) {
    if (root !== 'securemesh_site_v2ReplaceRequest') throw new Error('Identity echo requires a replacement snapshot');
    const properties = object4(object4(schemas.securemesh_site_v2Interface).properties);
    const projected = object4(object4(object4(schema.definitions).securemesh_site_v2Interface).properties);
    for (const field of ['is_primary', 'is_management']) {
      const source = object4(properties[field]);
      if (source.readOnly !== true || source.type !== 'boolean') throw new Error('Interface identity schema changed');
      projected[field] = { type: 'boolean' };
    }
  }
  return (spec) => {
    const keyword = firstFailure(schema, spec, schema);
    if (keyword) {
      throw new Error(`SMSv2 request violates the verified schema (${keyword})`);
    }
  };
}
function equal(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right))
    return left.length === right.length && left.every((item, index) => equal(item, right[index]));
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const leftEntries = Object.entries(left);
    const rightObject = right;
    return (
      leftEntries.length === Object.keys(rightObject).length &&
      leftEntries.every(([key, value]) => Object.hasOwn(rightObject, key) && equal(value, rightObject[key]))
    );
  }
  return false;
}
function validFormat(format, value) {
  if (format === 'cidr') {
    const [address, length, extra] = value.split('/');
    const family = isIP4(address);
    if (!family || extra !== undefined || !/^\d+$/.test(length ?? '')) return false;
    const bits = Number(length);
    return bits >= 0 && bits <= (family === 4 ? 32 : 128);
  }
  if (format === 'ipv4') return isIP4(value) === 4;
  if (format === 'ipv6') return isIP4(value) === 6;
  if (format === 'uuid')
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  if (format === 'dns-label') return /^(?!-)[a-z0-9-]{1,63}(?<!-)$/i.test(value);
  if (format === 'hostname' || format === 'fqdn')
    return value.length <= 253 && value.split('.').every((label) => /^(?!-)[a-z0-9-]{1,63}(?<!-)$/i.test(label));
  if (format === 'uri') {
    try {
      return Boolean(new URL(value).protocol);
    } catch {
      return false;
    }
  }
  if (format === 'date-time')
    return (
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) && !Number.isNaN(Date.parse(value))
    );
  return true;
}
function typeMatches(type, value) {
  if (Array.isArray(type)) return type.some((item) => typeMatches(item, value));
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return type === undefined || typeof value === type;
}
function firstFailure(schemaValue, value, document) {
  if (schemaValue === false) return 'false schema';
  if (schemaValue === true) return null;
  if (typeof schemaValue.$ref === 'string') {
    const prefix = '#/definitions/';
    if (!schemaValue.$ref.startsWith(prefix)) return '$ref';
    const definition = object4(document.definitions)[schemaValue.$ref.slice(prefix.length)];
    if (definition === undefined) return '$ref';
    const failure = firstFailure(definition, value, document);
    if (failure) return failure;
  }
  if (schemaValue.nullable === true && value === null) return null;
  if (!typeMatches(schemaValue.type, value)) return 'type';
  if (Array.isArray(schemaValue.enum) && !schemaValue.enum.some((item) => equal(item, value))) return 'enum';
  if (Object.hasOwn(schemaValue, 'const') && !equal(schemaValue.const, value)) return 'const';
  for (const keyword of ['allOf', 'anyOf', 'oneOf']) {
    const members = schemaValue[keyword];
    if (!Array.isArray(members)) continue;
    const matches = members.filter((member) => firstFailure(member, value, document) === null).length;
    if (
      (keyword === 'allOf' && matches !== members.length) ||
      (keyword === 'anyOf' && matches === 0) ||
      (keyword === 'oneOf' && matches !== 1)
    )
      return keyword;
  }
  if (schemaValue.not !== undefined && firstFailure(schemaValue.not, value, document) === null) return 'not';
  if (typeof value === 'string') {
    const length = [...value].length;
    if (typeof schemaValue.minLength === 'number' && length < schemaValue.minLength) return 'minLength';
    if (typeof schemaValue.maxLength === 'number' && length > schemaValue.maxLength) return 'maxLength';
    if (typeof schemaValue.pattern === 'string' && !new RegExp(schemaValue.pattern, 'u').test(value)) return 'pattern';
    if (typeof schemaValue.format === 'string' && !validFormat(schemaValue.format, value)) return 'format';
  }
  if (typeof value === 'number') {
    if (typeof schemaValue.minimum === 'number' && value < schemaValue.minimum) return 'minimum';
    if (typeof schemaValue.maximum === 'number' && value > schemaValue.maximum) return 'maximum';
    if (typeof schemaValue.exclusiveMinimum === 'number' && value <= schemaValue.exclusiveMinimum)
      return 'exclusiveMinimum';
    if (typeof schemaValue.exclusiveMaximum === 'number' && value >= schemaValue.exclusiveMaximum)
      return 'exclusiveMaximum';
    if (typeof schemaValue.multipleOf === 'number') {
      const quotient = value / schemaValue.multipleOf;
      if (!Number.isFinite(quotient) || Math.abs(quotient - Math.round(quotient)) > 0.000000000001) return 'multipleOf';
    }
  }
  if (Array.isArray(value)) {
    if (typeof schemaValue.minItems === 'number' && value.length < schemaValue.minItems) return 'minItems';
    if (typeof schemaValue.maxItems === 'number' && value.length > schemaValue.maxItems) return 'maxItems';
    if (
      schemaValue.uniqueItems === true &&
      value.some((item, index) => value.slice(0, index).some((seen) => equal(seen, item)))
    )
      return 'uniqueItems';
    if (schemaValue.items !== undefined)
      for (const item of value) {
        const failure = firstFailure(schemaValue.items, item, document);
        if (failure) return failure;
      }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value;
    if (
      Array.isArray(schemaValue.required) &&
      schemaValue.required.some((key) => typeof key === 'string' && !Object.hasOwn(record, key))
    )
      return 'required';
    const entries = Object.entries(record);
    if (typeof schemaValue.minProperties === 'number' && entries.length < schemaValue.minProperties)
      return 'minProperties';
    if (typeof schemaValue.maxProperties === 'number' && entries.length > schemaValue.maxProperties)
      return 'maxProperties';
    const properties = schemaValue.properties ? object4(schemaValue.properties) : undefined;
    for (const [key, item] of entries) {
      const propertySchema = properties?.[key];
      if (propertySchema !== undefined) {
        const failure = firstFailure(propertySchema, item, document);
        if (failure) return failure;
      } else if (schemaValue.additionalProperties === false) return 'additionalProperties';
      else if (schemaValue.additionalProperties && typeof schemaValue.additionalProperties === 'object') {
        const failure = firstFailure(schemaValue.additionalProperties, item, document);
        if (failure) return failure;
      }
    }
  }
  return null;
}
var keywords;
var init_wire_schema = __esm(() => {
  keywords = new Set([
    'type',
    'enum',
    'const',
    'required',
    'minLength',
    'maxLength',
    'pattern',
    'minimum',
    'maximum',
    'multipleOf',
    'minItems',
    'maxItems',
    'uniqueItems',
    'minProperties',
    'maxProperties',
    'format',
    'nullable',
  ]);
});

// plugins/platform/src/ce/ingress-contract.ts
function object5(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed ingress contract');
  return value;
}

class VerifiedIngressContract {
  identity = 'f5xc-ce-http-ingress-api/v1';
  publication = 'immutable-release';
  releaseTag = CE_API_RELEASE.tag;
  commit = CE_API_RELEASE.commit;
  fingerprint = CE_API_RELEASE.fingerprint;
  #validate;
  #validateOrigin;
  #schemas;
  constructor(schemas) {
    this.#schemas = schemas;
    this.#validate = createWireValidator(schemas, 'viewshttp_loadbalancerCreateSpecType');
    this.#validateOrigin = createWireValidator(schemas, 'viewsorigin_poolCreateSpecType');
  }
  static async release(fetcher = fetch, signal) {
    const api = await loadPublishedCeApi(fetcher, signal);
    const path = object5(object5(api.paths)['/api/config/namespaces/{metadata.namespace}/http_loadbalancers']);
    const schema = object5(
      object5(object5(object5(object5(path.post).requestBody).content)['application/json']).schema,
    );
    if (schema.$ref !== '#/components/schemas/http_loadbalancerCreateRequest')
      throw new Error('Unsupported ingress request path');
    const origin = object5(object5(api.paths)['/api/config/namespaces/{metadata.namespace}/origin_pools']);
    const originSchema = object5(
      object5(object5(object5(object5(origin.post).requestBody).content)['application/json']).schema,
    );
    if (originSchema.$ref !== '#/components/schemas/origin_poolCreateRequest')
      throw new Error('Unsupported origin request path');
    return new VerifiedIngressContract(object5(object5(api.components).schemas));
  }
  build(input) {
    return buildInsideHttpListener(input, this.#validate);
  }
  buildOrigin(input) {
    return buildSiteLocalHttpOrigin(input, this.#validateOrigin);
  }
  projectObserved(spec) {
    return projectInsideHttpListener(spec, this.#schemas, this.#validate);
  }
  projectOriginObserved(spec) {
    return projectSiteLocalHttpOrigin(spec, this.#schemas, this.#validateOrigin);
  }
}
var init_ingress_contract = __esm(() => {
  init_verified_api_release();
  init_wire_ingress();
  init_wire_origin();
  init_wire_schema();
});

// plugins/azure/src/ce/apply.ts
function assertObservationFresh(plan, current, expectedFingerprint = plan.observationFingerprint) {
  const fingerprint = fingerprintCurrentObservation(plan, current);
  if (!safeHexEqual(expectedFingerprint, fingerprint)) {
    throw new Error(
      `Stale Azure CE plan: observations changed (expected ${expectedFingerprint}, current ${fingerprint})`,
    );
  }
}
function assertApplyAllowed(plan, request) {
  const executionEngine = request.executionEngine ?? 'native';
  if (plan.engine !== executionEngine)
    throw new Error(`${plan.engine === 'terraform' ? 'Terraform' : 'Native'} CE plan execution engine differs`);
  if (request.planId !== plan.planId) throw new Error('The requested plan ID does not match the persisted plan');
  if (!safeHexEqual(request.planSha256, plan.planSha256))
    throw new Error('The requested plan hash does not match the persisted plan');
  if (!request.hasUI && request.authorization?.apply !== true && request.env.XCSH_CE_HEADLESS_MUTATIONS !== '1') {
    throw new Error('Headless Azure CE mutations require XCSH_CE_HEADLESS_MUTATIONS=1');
  }
  if (
    plan.intent.operation === 'teardown' &&
    !request.hasUI &&
    request.authorization?.destroy !== true &&
    request.env.XCSH_CE_ALLOW_DESTROY !== '1'
  ) {
    throw new Error('Headless teardown requires XCSH_CE_ALLOW_DESTROY=1');
  }
  if (plan.actions.some((action) => action.kind === 'marketplace-terms-accept'))
    throw new Error('Marketplace terms must be signed only by the exact initial Terraform foundation action');
  assertAzureCeRoutingExecutable(plan);
}
function assertAzureCeRoutingExecutable(plan) {
  if (plan.intent.operation !== 'deploy') return;
  if (plan.routing.mode === 'route-server' && plan.routing.destinationCidrs.length === 0)
    throw new Error('Azure Route Server execution requires at least one expected learned prefix');
  if (
    plan.routing.mode === 'udr' &&
    plan.routing.destinationCidrs.length > 0 &&
    plan.intent.brownfield.routeChanges.length === 0
  )
    throw new Error(
      'Azure UDR destinations require explicit routeChanges with the target subnet association; an unattached route table is not executable',
    );
}
function resolveActionArgs(args, planSha256, replacements = {}) {
  return args.map((arg) => {
    if (arg === '__PLAN_SHA256__') return planSha256;
    if (arg.includes('__PLAN_SHA256__')) return arg.replaceAll('__PLAN_SHA256__', planSha256);
    return replacements[arg] ?? arg;
  });
}
function creationOwnershipParent(resourceId) {
  for (const pattern of [
    /^(.*\/providers\/microsoft\.network\/virtualnetworks\/[^/]+)\/subnets\/[^/]+$/i,
    /^(.*\/providers\/microsoft\.network\/networksecuritygroups\/[^/]+)\/securityrules\/[^/]+$/i,
    /^(.*\/providers\/microsoft\.network\/routetables\/[^/]+)\/routes\/[^/]+$/i,
    /^(.*\/providers\/microsoft\.network\/virtualhubs\/[^/]+)\/bgpconnections\/[^/]+$/i,
  ]) {
    const match = pattern.exec(resourceId);
    if (match) return match[1];
  }
}
async function assertBrownfieldOwnership(plan, action, api) {
  const id = action.resourceId ?? '';
  if (!id.toLowerCase().startsWith(`/subscriptions/${plan.subscription.id}/`.toLowerCase()))
    throw new Error('Brownfield mutation target is outside the selected subscription');
  const result = await api.exec('az', [
    'resource',
    'show',
    '--ids',
    id,
    '--subscription',
    plan.subscription.id,
    '--output',
    'json',
  ]);
  if (result.exitCode !== 0) throw new Error('Brownfield ownership observation unavailable');
  let raw;
  try {
    raw = JSON.parse(result.stdout);
  } catch {
    throw new Error('Malformed brownfield ownership observation');
  }
  if (!raw || typeof raw.id !== 'string' || raw.id.toLowerCase() !== id.toLowerCase() || raw.nextLink)
    throw new Error('Brownfield ownership identity is missing or substituted');
  if (raw.tags !== undefined && (!raw.tags || typeof raw.tags !== 'object' || Array.isArray(raw.tags)))
    throw new Error('Malformed brownfield ownership tags');
  const tags = raw.tags ?? {};
  if (tags['xcsh-execution-engine'] !== undefined && tags['xcsh-execution-engine'] !== plan.engine)
    throw new Error('Brownfield resource belongs to another execution engine');
  if (
    tags['xcsh-managed-by'] === 'azure-ce' &&
    (tags['xcsh-deployment-id'] !== plan.deploymentName || tags['xcsh-execution-engine'] !== plan.engine)
  )
    throw new Error('Brownfield resource belongs to another or unknown CE deployment owner');
}
async function assertActionOwnership(plan, action, api) {
  if (!action.mutates || action.kind === 'marketplace-terms-accept') return;
  if (action.kind === 'f5-ingress-configure') return;
  if (!action.resourceId) throw new Error(`Mutating action ${action.id} has no canonical resource ID`);
  if (!action.resourceId.toLowerCase().startsWith(`/subscriptions/${plan.subscription.id}/`.toLowerCase()))
    throw new Error('Mutation target is outside the selected subscription');
  if (['route-association-update', 'brownfield-restore'].includes(action.kind)) {
    const allowed = plan.ownershipInventory.some(
      (item) => item.action === 'modify-approved' && item.resourceId.toLowerCase() === action.resourceId?.toLowerCase(),
    );
    if (!allowed)
      throw new Error(`Brownfield resource is outside the approved allowlist: ${action.resourceId ?? '<missing>'}`);
    await assertBrownfieldOwnership(plan, action, api);
    return;
  }
  if (action.kind === 'route-create' && plan.intent.brownfield.routeChanges.length > 0) {
    const allowed = plan.ownershipInventory.some(
      (item) => item.action === 'modify-approved' && item.resourceId.toLowerCase() === action.resourceId?.toLowerCase(),
    );
    if (!allowed) throw new Error(`Brownfield route target is outside the approved allowlist: ${action.resourceId}`);
    await assertBrownfieldOwnership(plan, action, api);
    return;
  }
  if (
    !CREATE_KINDS.has(action.kind) &&
    action.kind !== 'resource-delete' &&
    !OWNED_MUTATION_KINDS.has(action.kind) &&
    !PARENT_OWNED_MUTATION_KINDS.has(action.kind)
  )
    return;
  const isGroup = !action.resourceId.toLowerCase().includes('/providers/');
  const args = isGroup
    ? ['group', 'show', '--name', plan.intent.resourceGroup, '--subscription', plan.subscription.id, '--output', 'json']
    : ['resource', 'show', '--ids', action.resourceId, '--subscription', plan.subscription.id, '--output', 'json'];
  const result = await api.exec('az', args);
  if (result.exitCode !== 0) {
    if (CREATE_KINDS.has(action.kind) && /not found|could not be found|resourcegroupnotfound/i.test(result.stderr))
      return;
    if (action.kind === 'resource-delete' && /not found|could not be found|resourcegroupnotfound/i.test(result.stderr))
      return;
    throw new Error(`Unable to verify ownership for ${action.resourceId}`);
  }
  let raw;
  try {
    raw = JSON.parse(result.stdout);
  } catch {
    throw new Error(`Ownership response was invalid for ${action.resourceId}`);
  }
  const observedId = String(raw.id ?? '').toLowerCase();
  if (!observedId || observedId !== action.resourceId.toLowerCase())
    throw new Error(`Azure substituted a different resource ID for ${action.resourceId}`);
  let tags = raw.tags ?? {};
  const parentId =
    CREATE_KINDS.has(action.kind) || PARENT_OWNED_MUTATION_KINDS.has(action.kind)
      ? creationOwnershipParent(action.resourceId)
      : undefined;
  if (parentId) {
    const parentResult = await api.exec('az', [
      'resource',
      'show',
      '--ids',
      parentId,
      '--subscription',
      plan.subscription.id,
      '--output',
      'json',
    ]);
    if (parentResult.exitCode !== 0) throw new Error(`Unable to verify ownership for ${parentId}`);
    try {
      const parent = JSON.parse(parentResult.stdout);
      if (String(parent.id ?? '').toLowerCase() !== parentId.toLowerCase())
        throw new Error(`Azure substituted a different resource ID for ${parentId}`);
      tags = parent.tags ?? {};
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error(`Ownership response was invalid for ${parentId}`);
      throw error;
    }
  }
  const owned = tags['xcsh-managed-by'] === 'azure-ce' && tags['xcsh-deployment-id'] === plan.deploymentName;
  if (owned && tags['xcsh-execution-engine'] !== plan.engine)
    throw new Error('Azure resource belongs to another or unknown execution engine');
  if (!owned) throw new Error(`Refusing to mutate unmanaged resource ${action.resourceId}`);
  if (action.expectedOwnerPlanSha256 && tags['xcsh-plan-sha256'] !== action.expectedOwnerPlanSha256)
    throw new Error(`Azure resource belongs to a different immutable owner plan: ${action.resourceId}`);
  if (CREATE_KINDS.has(action.kind) && tags['xcsh-plan-sha256'] !== plan.planSha256)
    throw new Error(`Existing resource belongs to a different Azure CE plan: ${action.resourceId}`);
}
var CREATE_KINDS, OWNED_MUTATION_KINDS, PARENT_OWNED_MUTATION_KINDS;
var init_apply = __esm(() => {
  init_canonical();
  init_recovery();
  CREATE_KINDS = new Set([
    'resource-group-create',
    'vnet-create',
    'subnet-create',
    'nsg-create',
    'nsg-rule-create',
    'public-ip-create',
    'nic-create',
    'vm-create',
    'route-table-create',
    'route-server-create',
    'route-server-peer-create',
  ]);
  OWNED_MUTATION_KINDS = new Set(['vm-start', 'vm-stop', 'vm-deallocate', 'vm-resize', 'vm-delete', 'nic-update']);
  PARENT_OWNED_MUTATION_KINDS = new Set(['route-server-peer-update']);
});

// plugins/azure/src/ce/execution.ts
function withAzureCeExecution(api, cancellation, timeoutMs = 2 * 60 * 60000) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2 * 60 * 60000)
    throw new Error('Invalid Azure CE execution deadline');
  const deadline = AbortSignal.timeout(timeoutMs);
  const operation = cancellation ? AbortSignal.any([cancellation, deadline]) : deadline;
  const assertLive = (signal) => {
    if (signal.aborted)
      throw new Error(deadline.aborted ? 'Azure CE execution deadline exceeded' : 'Azure CE execution cancelled');
  };
  return {
    async exec(command, args, options) {
      const signal = options?.signal ? AbortSignal.any([operation, options.signal]) : operation;
      assertLive(signal);
      try {
        const result = await api.exec(command, args, { ...options, signal });
        if (result.exitCode !== 0) assertLive(signal);
        return result;
      } catch (error) {
        assertLive(signal);
        throw error;
      }
    },
  };
}

// plugins/azure/src/ce/interface-address.ts
import { isIP as isIP5 } from 'node:net';

async function resolveInterfaceAddress(api, plan, node, role, ownerPlanSha256 = plan.planSha256) {
  const interfaces = plan.nics.filter((nic) => nic.role === role);
  if (interfaces.length !== 1) throw new Error('CE interface role is missing or ambiguous');
  const iface = interfaces[0];
  const nics = plan.actions.filter(
    (action) => (action.kind === 'nic-create' || action.kind === 'nic-update') && action.node === node,
  );
  const nic = nics.find((action) => {
    const nameIndex = action.args?.indexOf(action.kind === 'nic-update' ? '--nic-name' : '--name') ?? -1;
    return nameIndex >= 0 && action.args?.[nameIndex + 1]?.endsWith(`-nic${iface.index}`);
  });
  const vms = plan.actions.filter(
    (action) => (action.kind === 'vm-create' || action.kind === 'vm-start') && action.node === node,
  );
  if (!nic?.resourceId || vms.length !== 1 || !vms[0].resourceId)
    throw new Error('Planned NIC and VM identities are unavailable');
  const vmId = vms[0].resourceId;
  const scope = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/`.toLowerCase();
  for (const id of [nic.resourceId, vmId])
    if (!id.toLowerCase().startsWith(scope)) throw new Error('Planned interface is outside deployment scope');
  const read = async (kind, id) => {
    const result = await api.exec('az', [
      ...(kind === 'nic' ? ['network', 'nic'] : ['vm']),
      'show',
      '--ids',
      id,
      '--subscription',
      plan.subscription.id,
      '--output',
      'json',
    ]);
    if (result.exitCode !== 0) throw new Error('CE interface observation unavailable');
    let value;
    try {
      value = JSON.parse(result.stdout);
    } catch {
      throw new Error('Malformed CE interface observation');
    }
    if (
      !value ||
      value.id?.toLowerCase() !== id.toLowerCase() ||
      value.nextLink ||
      value.provisioningState !== 'Succeeded'
    )
      throw new Error('CE resource identity or readiness does not match');
    if (
      value.tags?.['xcsh-execution-engine'] !== plan.engine ||
      value.tags?.['xcsh-managed-by'] !== 'azure-ce' ||
      value.tags?.['xcsh-deployment-id'] !== plan.deploymentName ||
      value.tags?.['xcsh-plan-sha256'] !== ownerPlanSha256
    )
      throw new Error('CE interface ownership does not match');
    return value;
  };
  const observed = await read('nic', nic.resourceId);
  const vm = await read('vm', vmId);
  if (
    observed.virtualMachine?.id?.toLowerCase() !== vmId.toLowerCase() ||
    !/^(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(observed.macAddress ?? '')
  )
    throw new Error('CE NIC attachment or MAC is unavailable');
  const attachments = vm.networkProfile?.networkInterfaces;
  if (
    !Array.isArray(attachments) ||
    attachments.filter((entry) => entry.id?.toLowerCase() === nic.resourceId?.toLowerCase()).length !== 1
  )
    throw new Error('VM does not uniquely reference the planned NIC');
  const configs = observed.ipConfigurations;
  if (!Array.isArray(configs)) throw new Error('CE IP configurations unavailable');
  const primary = configs.filter(
    (config) => config.primary === true || (configs.length === 1 && config.primary === undefined),
  );
  if (
    primary.length !== 1 ||
    primary[0].privateIPAddressVersion !== 'IPv4' ||
    isIP5(primary[0].privateIPAddress ?? '') !== 4
  )
    throw new Error('CE primary IPv4 address is missing or ambiguous');
  if (iface.subnet.resourceId && primary[0].subnet?.id?.toLowerCase() !== iface.subnet.resourceId.toLowerCase())
    throw new Error('CE subnet identity does not match');
  return primary[0].privateIPAddress ?? '';
}
var init_interface_address = () => {};

// plugins/azure/src/ce/platform-health.ts
async function collectAzurePlatformHealth(
  plan,
  vms,
  runtime,
  signal,
  admittedNodeCount = plan.topology.nodeCount,
  expectedOwnerPlanSha256ByNode,
) {
  const base = {
    planId: plan.planId,
    engine: plan.engine,
    subscriptionId: plan.subscription.id,
    siteName: plan.siteName,
    observedAt: new Date().toISOString(),
    scope: 'site-global-and-registration-only',
    nodeHealth: 'unknown',
    bgp: 'unknown',
    routes: 'unknown',
    traffic: 'unknown',
  };
  if (
    !Array.isArray(vms) ||
    !Number.isInteger(admittedNodeCount) ||
    admittedNodeCount < 1 ||
    admittedNodeCount > plan.topology.nodeCount
  )
    return {
      ...base,
      status: 'unknown',
      reason: 'cloud-inventory-unavailable',
    };
  const scope =
    `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/`.toLowerCase();
  const instances = {};
  const used = new Set();
  for (let node = 1; node <= admittedNodeCount; node++) {
    const name = `${plan.deploymentName}-${node}`;
    const ownerGates = [
      ...new Set(
        (plan.actions ?? [])
          .filter(
            (action) =>
              action.node === node &&
              action.kind.startsWith('vm-') &&
              (!action.resourceId || action.resourceId.toLowerCase() === scope + name.toLowerCase()) &&
              action.expectedOwnerPlanSha256,
          )
          .map((action) => action.expectedOwnerPlanSha256),
      ),
    ];
    const expectedOwnerPlanSha256 =
      expectedOwnerPlanSha256ByNode?.[name] ??
      (ownerGates.length === 0
        ? plan.planSha256
        : ownerGates.length === 1 && /^[a-f0-9]{64}$/.test(ownerGates[0])
          ? ownerGates[0]
          : undefined);
    const matches = vms.filter(
      (vm) => vm && typeof vm.id === 'string' && vm.id.toLowerCase() === scope + name.toLowerCase(),
    );
    if (matches.length !== 1)
      return {
        ...base,
        status: 'unknown',
        reason: 'cloud-node-identity-ambiguous',
      };
    const vm = matches[0];
    if (
      vm.name !== name ||
      typeof vm.location !== 'string' ||
      vm.location.toLowerCase() !== plan.region.toLowerCase() ||
      vm.tags?.['xcsh-managed-by'] !== 'azure-ce' ||
      vm.tags?.['xcsh-deployment-id'] !== plan.deploymentName ||
      vm.tags?.['xcsh-execution-engine'] !== plan.engine ||
      !expectedOwnerPlanSha256 ||
      vm.tags?.['xcsh-plan-sha256'] !== expectedOwnerPlanSha256 ||
      typeof vm.vmId !== 'string' ||
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(vm.vmId) ||
      used.has(vm.vmId.toLowerCase())
    )
      return {
        ...base,
        status: 'unknown',
        reason: 'cloud-node-binding-incomplete',
      };
    used.add(vm.vmId.toLowerCase());
    instances[name] = vm.vmId;
  }
  const binding = {
    owner: {
      deploymentId: plan.deploymentName,
      engine: plan.engine,
      provider: 'azure',
      account: plan.subscription.id,
      region: plan.region,
    },
    siteName: plan.siteName,
    nodes: Array.from({ length: plan.topology.nodeCount }, (_, index) => `${plan.deploymentName}-${index + 1}`),
  };
  const admittedNodes = Object.keys(instances);
  try {
    const [health, registrations] = await Promise.all([
      runtime.observeHealth(binding, signal),
      runtime.observeRegistrations(binding, instances, signal, admittedNodes),
    ]);
    const values = [health.status, registrations.status];
    const status = values.every((value) => value === 'healthy')
      ? 'healthy'
      : values.some((value) => !['healthy', 'degraded'].includes(String(value)))
        ? 'unknown'
        : 'degraded';
    return { ...base, status, health, registrations };
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      ...base,
      status: 'unknown',
      reason: 'platform-observation-unavailable',
    };
  }
}

// plugins/azure/src/ce/route-server-health.ts
import { isIP as isIP6 } from 'node:net';

async function captureAzureRouteServerOwnership(plan, api, signal) {
  verifyAzureCePlan(plan);
  if (plan.routing.mode !== 'route-server') throw new Error('Azure Route Server routing is not selected');
  const routeServerId = routeServerIdFor(plan);
  const server = object6(
    await read(
      api,
      plan,
      [
        'network',
        'routeserver',
        'show',
        '--resource-group',
        plan.intent.resourceGroup,
        '--name',
        `${plan.deploymentName}-rs`,
      ],
      signal,
    ),
  );
  const tags = object6(server.tags);
  const ownerPlanSha256 = tags['xcsh-plan-sha256'];
  if (
    lower2(server.id) !== lower2(routeServerId) ||
    lower2(server.location) !== lower2(plan.region) ||
    server.provisioningState !== 'Succeeded' ||
    server.virtualRouterAsn !== 65515 ||
    tags['xcsh-managed-by'] !== 'azure-ce' ||
    tags['xcsh-execution-engine'] !== plan.engine ||
    tags['xcsh-deployment-id'] !== plan.deploymentName ||
    typeof ownerPlanSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(ownerPlanSha256)
  )
    throw new Error('Azure retained Route Server ownership is unavailable');
  const peerIds = {};
  for (let node = 1; node <= plan.topology.nodeCount; node++) {
    const name = `${plan.deploymentName}-${node}`;
    const expectedId = `${routeServerId}/bgpConnections/${name}`;
    const peer = object6(
      await read(
        api,
        plan,
        [
          'network',
          'routeserver',
          'peering',
          'show',
          '--resource-group',
          plan.intent.resourceGroup,
          '--routeserver',
          `${plan.deploymentName}-rs`,
          '--name',
          name,
        ],
        signal,
      ),
    );
    if (
      lower2(peer.id) !== lower2(expectedId) ||
      peer.name !== name ||
      peer.provisioningState !== 'Succeeded' ||
      peer.peerAsn !== plan.routing.localAsn
    )
      throw new Error('Azure retained Route Server peer identity is unavailable');
    peerIds[String(node)] = expectedId;
  }
  return { routeServerId, ownerPlanSha256, peerIds };
}
async function read(api, plan, args, signal) {
  signal?.throwIfAborted();
  const result = await api.exec(
    'az',
    [...args, '--subscription', plan.subscription.id, '--output', 'json'],
    signal ? { signal } : undefined,
  );
  signal?.throwIfAborted();
  if (result.exitCode !== 0) throw new Error('Azure Route Server observation unavailable');
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error('Malformed Azure Route Server observation');
  }
}
function routeRoles(value) {
  const response = object6(value);
  if (response.nextLink || response.nextPageToken || response.error) throw new Error('Incomplete Route Server routes');
  const roles = Object.entries(response)
    .filter(([name]) => /^RouteServiceRole_IN_[01]$/.test(name))
    .map(([role, routes]) => {
      if (!Array.isArray(routes)) throw new Error('Malformed Route Server role routes');
      return { role, routes: routes.map(object6) };
    });
  if (roles.length !== 2 || new Set(roles.map((entry) => entry.role)).size !== 2)
    throw new Error('Both Route Server service-role observations are required');
  return roles.sort((a, b) => a.role.localeCompare(b.role));
}
async function discoverAzureRouteServerIdentity(plan, api, signal, retained) {
  verifyAzureCePlan(plan);
  if (plan.routing.mode !== 'route-server') throw new Error('Azure Route Server routing is not selected');
  const serverAction = plan.actions.filter((action) => action.kind === 'route-server-create');
  const peerUpdates = plan.actions.filter((action) => action.kind === 'route-server-peer-update');
  const isNetworkUpdate = !retained && plan.intent.operation === 'update-network';
  if (
    (isNetworkUpdate && serverAction.length !== 0) ||
    (!isNetworkUpdate && !retained && (serverAction.length !== 1 || !serverAction[0].resourceId)) ||
    (retained && serverAction.length)
  )
    throw new Error('Planned Route Server identity is unavailable');
  const updateOwnerHashes = isNetworkUpdate ? peerUpdates.map((action) => action.expectedOwnerPlanSha256) : [];
  if (
    isNetworkUpdate &&
    (peerUpdates.length !== plan.topology.nodeCount ||
      new Set(peerUpdates.map((action) => action.node)).size !== plan.topology.nodeCount ||
      peerUpdates.some(
        (action) =>
          !action.node ||
          action.node < 1 ||
          action.node > plan.topology.nodeCount ||
          action.resourceId !== peerIdFor(plan, action.node) ||
          !isPlanSha256(action.expectedOwnerPlanSha256),
      ) ||
      new Set(updateOwnerHashes).size !== 1)
  )
    throw new Error('Planned retained Route Server identity is unavailable');
  const routeServerId =
    retained?.routeServerId ?? (isNetworkUpdate ? routeServerIdFor(plan) : serverAction[0]?.resourceId);
  const ownerPlanSha256 = retained?.ownerPlanSha256 ?? (isNetworkUpdate ? updateOwnerHashes[0] : plan.planSha256);
  const server = object6(
    await read(
      api,
      plan,
      [
        'network',
        'routeserver',
        'show',
        '--resource-group',
        plan.intent.resourceGroup,
        '--name',
        `${plan.deploymentName}-rs`,
      ],
      signal,
    ),
  );
  const tags = object6(server.tags);
  const routerIps = server.virtualRouterIps;
  if (
    lower2(server.id) !== lower2(routeServerId) ||
    lower2(server.location) !== lower2(plan.region) ||
    server.provisioningState !== 'Succeeded' ||
    server.virtualRouterAsn !== 65515 ||
    !Array.isArray(routerIps) ||
    routerIps.length !== 2 ||
    new Set(routerIps).size !== 2 ||
    routerIps.some((ip) => typeof ip !== 'string' || isIP6(ip) !== 4) ||
    tags['xcsh-managed-by'] !== 'azure-ce' ||
    tags['xcsh-deployment-id'] !== plan.deploymentName ||
    tags['xcsh-execution-engine'] !== plan.engine ||
    tags['xcsh-plan-sha256'] !== ownerPlanSha256
  )
    throw new Error('Azure Route Server identity or service addresses differ');
  return {
    routeServerId,
    asn: 65515,
    serviceAddresses: routerIps.toSorted(),
  };
}
async function collectAzureRouteServerHealth(plan, api, signal, retained) {
  verifyAzureCePlan(plan);
  const base = {
    planId: plan.planId,
    planSha256: plan.planSha256,
    engine: plan.engine,
    subscriptionId: plan.subscription.id,
    region: plan.region,
    siteName: plan.siteName,
    source: 'azure-cli-live',
    observedAt: new Date().toISOString(),
    sessions: 'unknown',
    sessionReason: 'platform-bgp-session-evidence-required',
    effectiveRoutes: 'unknown',
    traffic: 'unknown',
  };
  if (plan.routing.mode !== 'route-server') return { ...base, status: 'not-applicable' };
  try {
    const identity = await discoverAzureRouteServerIdentity(plan, api, signal, retained);
    const peers = [];
    for (let node = 1; node <= plan.topology.nodeCount; node++) {
      const peerKind =
        plan.intent.operation === 'update-network' && !retained
          ? 'route-server-peer-update'
          : 'route-server-peer-create';
      const action = plan.actions.filter((candidate) => candidate.kind === peerKind && candidate.node === node);
      if (
        (!retained && (action.length !== 1 || !action[0].resourceId)) ||
        (retained && action.length) ||
        (peerKind === 'route-server-peer-update' && action[0]?.resourceId !== peerIdFor(plan, node))
      )
        throw new Error('Planned Route Server peer is unavailable');
      const peerId = retained?.peerIds[String(node)] ?? action[0]?.resourceId;
      if (!peerId) throw new Error('Planned Route Server peer is unavailable');
      const peerIp = await resolveInterfaceAddress(
        api,
        plan,
        node,
        'slo',
        retained?.ownerPlanSha256 ?? action[0]?.expectedOwnerPlanSha256 ?? plan.planSha256,
      );
      const name = `${plan.deploymentName}-${node}`;
      const common = [
        '--resource-group',
        plan.intent.resourceGroup,
        '--routeserver',
        `${plan.deploymentName}-rs`,
        '--name',
        name,
      ];
      const peer = object6(await read(api, plan, ['network', 'routeserver', 'peering', 'show', ...common], signal));
      if (
        lower2(peer.id) !== lower2(peerId) ||
        peer.name !== name ||
        peer.provisioningState !== 'Succeeded' ||
        peer.peerAsn !== plan.routing.localAsn ||
        peer.peerIp !== peerIp
      )
        throw new Error('Azure Route Server peer identity or SLO binding differs');
      const learned = routeRoles(
        await read(api, plan, ['network', 'routeserver', 'peering', 'list-learned-routes', ...common], signal),
      );
      const expected = plan.routing.destinationCidrs;
      const roles = learned.map(({ role, routes }) => {
        const matching = expected.map((prefix) => {
          const matches = routes.filter((route) => route.network === prefix && route.nextHop === peerIp);
          if (matches.length !== 1) throw new Error('Expected Route Server route exchange has not converged');
          return prefix;
        });
        return { role, learnedRouteCount: routes.length, matchedPrefixes: matching };
      });
      peers.push({ node, name, peerIp, peerAsn: peer.peerAsn, provisioningState: peer.provisioningState, roles });
    }
    return {
      ...base,
      status: plan.routing.destinationCidrs.length ? 'healthy' : 'unknown',
      reason: plan.routing.destinationCidrs.length ? undefined : 'expected-learned-prefixes-unavailable',
      routeServerId: identity.routeServerId,
      serviceAddresses: identity.serviceAddresses,
      peers,
      routeExchange: plan.routing.destinationCidrs.length ? 'healthy' : 'unknown',
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { ...base, status: 'unknown', reason: 'route-server-evidence-unavailable' };
  }
}
async function collectAzureRouteServerFailoverHealth(plan, nodeIndex, phase, api, signal) {
  verifyAzureCePlan(plan);
  if (
    plan.routing.mode !== 'route-server' ||
    !plan.topology.ha ||
    plan.topology.nodeCount !== 3 ||
    !Number.isInteger(nodeIndex) ||
    nodeIndex < 1 ||
    nodeIndex > 3 ||
    !['outage', 'recovered'].includes(phase) ||
    plan.routing.destinationCidrs.length < 1
  )
    throw new Error('Azure Route Server failover scope is incomplete');
  const identity = await discoverAzureRouteServerIdentity(plan, api, signal);
  const peers = [];
  for (let node = 1; node <= plan.topology.nodeCount; node++) {
    const action = plan.actions.filter(
      (candidate) => candidate.kind === 'route-server-peer-create' && candidate.node === node,
    );
    if (action.length !== 1 || !action[0].resourceId) throw new Error('Planned Route Server peer is unavailable');
    const peerIp = await resolveInterfaceAddress(api, plan, node, 'slo');
    const name = `${plan.deploymentName}-${node}`;
    const common = [
      '--resource-group',
      plan.intent.resourceGroup,
      '--routeserver',
      `${plan.deploymentName}-rs`,
      '--name',
      name,
    ];
    const peer = object6(await read(api, plan, ['network', 'routeserver', 'peering', 'show', ...common], signal));
    if (
      lower2(peer.id) !== lower2(action[0].resourceId) ||
      peer.name !== name ||
      peer.provisioningState !== 'Succeeded' ||
      peer.peerAsn !== plan.routing.localAsn ||
      peer.peerIp !== peerIp
    )
      throw new Error('Azure Route Server peer identity or SLO binding differs');
    const learned = routeRoles(
      await read(api, plan, ['network', 'routeserver', 'peering', 'list-learned-routes', ...common], signal),
    );
    const shouldWithdraw = phase === 'outage' && node === nodeIndex;
    const roles = learned.map(({ role, routes }) => {
      const matchedPrefixes = plan.routing.destinationCidrs.filter((prefix) =>
        routes.some((route) => route.network === prefix && route.nextHop === peerIp),
      );
      if (
        (shouldWithdraw && matchedPrefixes.length !== 0) ||
        (!shouldWithdraw &&
          (matchedPrefixes.length !== plan.routing.destinationCidrs.length ||
            plan.routing.destinationCidrs.some(
              (prefix) => routes.filter((route) => route.network === prefix && route.nextHop === peerIp).length !== 1,
            )))
      )
        throw new Error('Azure Route Server failover route exchange has not converged');
      return { role, learnedRouteCount: routes.length, matchedPrefixes };
    });
    peers.push({ node, name, peerIp, peerAsn: peer.peerAsn, provisioningState: peer.provisioningState, roles });
  }
  return {
    status: 'healthy',
    phase,
    selectedNode: nodeIndex,
    expectedEstablishedSessions: phase === 'outage' ? 4 : 6,
    routeServerId: identity.routeServerId,
    serviceAddresses: identity.serviceAddresses,
    peers,
    observedAt: new Date().toISOString(),
  };
}
var object6 = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed Route Server evidence');
    return value;
  },
  lower2 = (value) => (typeof value === 'string' ? value.toLowerCase() : ''),
  routeServerIdFor = (plan) =>
    `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Network/virtualHubs/${plan.deploymentName}-rs`,
  peerIdFor = (plan, node) => `${routeServerIdFor(plan)}/bgpConnections/${plan.deploymentName}-${node}`,
  isPlanSha256 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
var init_route_server_health = __esm(() => {
  init_artifacts();
  init_interface_address();
});

// plugins/platform/src/ce/upgrade-evidence.ts
function object7(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed upgrade evidence');
  return value;
}
function text(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Missing upgrade evidence');
  return value;
}
function parseUpgradePrechecks(raw) {
  const list = object7(raw).checklist;
  if (!Array.isArray(list) || !list.length) throw new Error('Missing upgrade prechecks');
  const seen = new Set();
  const checks = list.map((value) => {
    const row = object7(value),
      name = text(row.item),
      status = text(row.status);
    if (
      seen.has(name) ||
      !['CHECKLIST_UNKNOWN', 'CHECKLIST_PASSED', 'CHECKLIST_WARNING', 'CHECKLIST_FAILED'].includes(status)
    )
      throw new Error('Duplicate or unknown upgrade precheck');
    seen.add(name);
    return { name, status };
  });
  return { checks, passing: checks.every((check) => ['CHECKLIST_PASSED', 'CHECKLIST_WARNING'].includes(check.status)) };
}
function parseSoftwareTargets(raw) {
  const values = object7(raw).sw_versions;
  if (
    !Array.isArray(values) ||
    values.some((value) => typeof value !== 'string' || !/^crt-\d{8}-\d{4}$/.test(value)) ||
    new Set(values).size !== values.length
  )
    throw new Error('Missing or malformed software upgrade targets');
  return values;
}
var init_upgrade_evidence = () => {};

// plugins/platform/src/ce/wire-upgrade.ts
function buildSiteUpgradeRequest(input, validate) {
  if (
    !input ||
    Object.keys(input).some((key) => !['siteName', 'kind', 'version'].includes(key)) ||
    typeof input.siteName !== 'string' ||
    !/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(input.siteName) ||
    !['software', 'os'].includes(input.kind) ||
    typeof input.version !== 'string' ||
    !(input.kind === 'software' ? /^crt-\d{8}-\d{4}$/ : /^\d+\.\d{4}\.\d+$/).test(input.version)
  )
    throw new Error('An upgrade requires an exact site, operation and version');
  const body = { namespace: 'system', name: input.siteName, version: input.version, force: false };
  validate(body);
  return {
    method: 'POST',
    path: `/api/config/namespaces/system/sites/${input.siteName}/upgrade_${input.kind === 'software' ? 'sw' : 'os'}`,
    body,
  };
}

// plugins/platform/src/ce/upgrade-transition.ts
function matchesVersionIdentity(expected, observation) {
  if (observation.status !== 'observed') return false;
  const { binding } = expected;
  if (
    typeof expected.siteUid !== 'string' ||
    !expected.siteUid.trim() ||
    typeof expected.physicalSiteUid !== 'string' ||
    !expected.physicalSiteUid.trim() ||
    observation.siteUid !== expected.siteUid ||
    observation.physicalSiteUid !== expected.physicalSiteUid ||
    observation.siteName !== binding.siteName ||
    observation.source !== `/api/config/namespaces/system/sites/${binding.siteName}` ||
    !Array.isArray(binding.nodes) ||
    !binding.nodes.length ||
    binding.nodes.some((node) => typeof node !== 'string' || !node.trim()) ||
    !['native', 'terraform'].includes(binding.owner.engine) ||
    !['aws', 'azure'].includes(binding.owner.provider) ||
    new Set(binding.nodes).size !== binding.nodes.length ||
    !same(observation.nodes, binding.nodes) ||
    ['deploymentId', 'engine', 'provider', 'account', 'region'].some(
      (key) =>
        typeof binding.owner[key] !== 'string' ||
        !binding.owner[key].trim() ||
        observation.owner[key] !== binding.owner[key],
    ) ||
    !['contractFingerprint', 'siteContractFingerprint'].every(
      (key) => /^sha256:[a-f0-9]{64}$/.test(expected[key]) && observation[key] === expected[key],
    )
  )
    return false;
  const start = Date.parse(observation.startedAt),
    end = Date.parse(observation.observedAt),
    now = Date.now();
  if (![start, end].every(Number.isFinite) || start > end || end > now || now - start > 60000) return false;
  if (new Date(start).toISOString() !== observation.startedAt || new Date(end).toISOString() !== observation.observedAt)
    return false;
  if (observation.online !== (observation.siteState === 'ONLINE')) return false;
  initialSoftwareSettings({ software: observation.software.installed, os: observation.os.installed });
  return true;
}
function assessCeUpgradeTransition(expected, observation) {
  try {
    initialSoftwareSettings(expected.before);
    if (Object.keys(expected.target).sort().join(',') !== 'kind,version') return 'unknown';
    buildSiteUpgradeRequest({ siteName: expected.binding.siteName, ...expected.target }, () => {});
    const kind = expected.target.kind,
      other = kind === 'software' ? 'os' : 'software';
    if (expected.target.version === expected.before[kind]) return 'unknown';
    if (!matchesVersionIdentity(expected, observation)) return 'unknown';
    const targetSoftware = kind === 'software' ? expected.target.version : expected.before.software;
    if (observation.targetSoftware !== targetSoftware) return 'unknown';
    const selected = observation[kind],
      unchanged = observation[other];
    if (unchanged.installed !== expected.before[other] || unchanged.phase !== 'UPGRADE_COMPLETED') return 'unknown';
    if (![expected.before[kind], expected.target.version].includes(selected.installed)) return 'unknown';
    if (observation.siteState === 'FAILED' || selected.phase === 'UPGRADE_FAILED') return 'failed';
    if (
      kind === 'software' &&
      observation.progress.version === expected.target.version &&
      observation.progress.status === 'FAILED'
    )
      return 'failed';
    if (
      selected.installed === expected.target.version &&
      selected.phase === 'UPGRADE_COMPLETED' &&
      observation.online
    ) {
      if (
        kind === 'software' &&
        (observation.progress.version !== expected.target.version || observation.progress.status !== 'COMPLETED')
      )
        return 'unknown';
      return 'versions-complete';
    }
    if (
      ['UPGRADE_TRIGGERED', 'UPGRADE_IN_PROGRESS'].includes(selected.phase) &&
      ['ONLINE', 'UPGRADING'].includes(observation.siteState)
    ) {
      if (
        kind === 'software' &&
        (observation.progress.version !== expected.target.version ||
          !['SCHEDULED', 'IN_PROGRESS'].includes(observation.progress.status))
      )
        return 'unknown';
      return 'converging';
    }
    if (selected.installed !== expected.before[kind] || selected.phase !== 'UPGRADE_COMPLETED' || !observation.online)
      return 'unknown';
    if (observation.progress.version !== expected.before.software || observation.progress.status !== 'COMPLETED')
      return 'unknown';
    const prechecks = parseUpgradePrechecks({
      checklist: observation.prechecks.checks.map((check) => ({ item: check.name, status: check.status })),
    });
    if (!prechecks.passing) return 'unknown';
    const targets = parseSoftwareTargets({ sw_versions: observation.targets });
    if (
      kind === 'software' ? !targets.includes(expected.target.version) : selected.available !== expected.target.version
    )
      return 'unknown';
    return 'ready';
  } catch {
    return 'unknown';
  }
}
var same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
var init_upgrade_transition = __esm(() => {
  init_upgrade_evidence();
});

// plugins/platform/src/ce/process-lock.ts
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join as join2 } from 'node:path';
import { promisify } from 'node:util';

async function bootId() {
  const value =
    process.platform === 'linux'
      ? (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim()
      : process.platform === 'darwin'
        ? (await execute('/usr/sbin/sysctl', ['-n', 'kern.bootsessionuuid'])).stdout.trim().toLowerCase()
        : '';
  if (!bootPattern.test(value)) throw new Error('Process boot identity is unavailable');
  return value;
}
async function processStartTicks(pid) {
  if (process.platform === 'darwin') {
    let value;
    try {
      value = (
        await execute('/bin/ps', ['-p', String(pid), '-o', 'lstart='], {
          env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' },
        })
      ).stdout.trim();
    } catch (error) {
      if (error.code !== 1) throw error;
      try {
        process.kill(pid, 0);
      } catch (probe) {
        if (probe.code === 'ESRCH') return;
        throw probe;
      }
      throw new Error('Process identity is unavailable');
    }
    const match = /^[A-Z][a-z]{2} ([A-Z][a-z]{2}) +([0-9]{1,2}) ([0-9]{2}):([0-9]{2}):([0-9]{2}) ([0-9]{4})$/.exec(
      value,
    );
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (!match || !months.includes(match[1])) throw new Error('Malformed process identity');
    const timestamp = Date.UTC(
      Number(match[6]),
      months.indexOf(match[1]),
      Number(match[2]),
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
    );
    if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new Error('Malformed process identity');
    return String(timestamp / 1000);
  }
  if (process.platform !== 'linux') throw new Error('Process identity platform is unsupported');
  try {
    const value = await readFile(`/proc/${pid}/stat`, 'utf8');
    const end = value.lastIndexOf(') ');
    const fields =
      end < 0
        ? []
        : value
            .slice(end + 2)
            .trim()
            .split(/\s+/);
    const start = fields[19];
    if (!/^\d+$/.test(start ?? '')) throw new Error('Malformed process identity');
    return start;
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
}
function claim(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== 'bootId,pid,processStartTicks,schemaVersion,token'
  )
    throw new Error('Operation lock evidence cannot be reconciled');
  const row = value;
  if (
    row.schemaVersion !== 1 ||
    typeof row.token !== 'string' ||
    !tokenPattern.test(row.token) ||
    !Number.isSafeInteger(row.pid) ||
    Number(row.pid) < 1 ||
    typeof row.bootId !== 'string' ||
    !bootPattern.test(row.bootId) ||
    typeof row.processStartTicks !== 'string' ||
    !/^\d+$/.test(row.processStartTicks)
  )
    throw new Error('Operation lock evidence cannot be reconciled');
  return row;
}
async function readClaim(path) {
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.())
    throw new Error('Operation lock evidence cannot be reconciled');
  try {
    const claimPath = join2(path, 'claim.json');
    const claimStat = await lstat(claimPath);
    if (
      !claimStat.isFile() ||
      claimStat.isSymbolicLink() ||
      claimStat.nlink !== 1 ||
      claimStat.uid !== process.getuid?.() ||
      (claimStat.mode & 63) !== 0
    )
      throw new Error('Operation lock evidence cannot be reconciled');
    return claim(JSON.parse(await readFile(claimPath, 'utf8')));
  } catch (error) {
    if (error instanceof SyntaxError || error.code === 'ENOENT')
      throw new Error('Operation lock evidence cannot be reconciled');
    throw error;
  }
}
async function acquireProcessLock(path) {
  if (!path.startsWith('/') || !/^\.[a-z][a-z0-9-]*-lock$/.test(basename(path)))
    throw new Error('Invalid operation lock path');
  const currentBootId = await bootId();
  const currentStart = await processStartTicks(process.pid);
  if (!currentStart) throw new Error('Current process identity is unavailable');
  const mine = {
    schemaVersion: 1,
    token: randomUUID(),
    pid: process.pid,
    bootId: currentBootId,
    processStartTicks: currentStart,
  };
  const parent = dirname(path);
  for (let attempt = 0; attempt < 4; attempt++) {
    const candidate = join2(parent, `${basename(path)}.claim-${mine.token}`);
    await mkdir(candidate, { mode: 448 });
    await writeFile(join2(candidate, 'claim.json'), JSON.stringify(mine), { mode: 384, flag: 'wx' });
    try {
      await rename(candidate, path);
      return async () => {
        const owned = await readClaim(path);
        if (owned.token !== mine.token) throw new Error('Operation lock ownership changed');
        await rm(path, { recursive: true });
      };
    } catch (error) {
      await rm(candidate, { recursive: true });
      if (error.code !== 'EEXIST' && error.code !== 'ENOTEMPTY') throw error;
    }
    let existing;
    try {
      existing = await readClaim(path);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    const liveStart = existing.bootId === currentBootId ? await processStartTicks(existing.pid) : undefined;
    if (existing.bootId === currentBootId && liveStart === existing.processStartTicks)
      throw new Error('Operation lock is held by a live process');
    const stale = join2(parent, `${basename(path)}.stale-${randomUUID()}`);
    try {
      await rename(path, stale);
      await rm(stale, { recursive: true });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  throw new Error('Operation lock could not be acquired');
}
var execute, tokenPattern, bootPattern;
var init_process_lock = __esm(() => {
  execute = promisify(execFile);
  tokenPattern = /^[a-f0-9-]{36}$/;
  bootPattern = /^[a-f0-9-]{36}$/;
});

// plugins/terraform/src/ce-upgrade.ts
import { createHash as createHash4, timingSafeEqual as timingSafeEqual2 } from 'node:crypto';

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
async function optional(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return;
  }
}
function validateActionReceipt(upgrade, receipt) {
  if (
    receipt.schemaVersion !== 1 ||
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== upgrade.deployment.deploymentId ||
    receipt.backendIdentity !== upgrade.deployment.backendIdentity ||
    receipt.configurationSha256 !== digest2(upgrade.deployment.configuration) ||
    receipt.providerLockSha256 !== digest2(upgrade.deployment.providerLock) ||
    receipt.operation ||
    receipt.noChanges ||
    receipt.changes.length ||
    receipt.actionInvocations?.length !== 1 ||
    hash(receipt.actionInvocations[0]) !== hash(upgrade.action) ||
    !/^[a-f0-9]{64}$/.test(receipt.planSha256)
  )
    throw new Error('Terraform upgrade saved action plan differs');
}
async function runTerraformCeUpgrade(
  input,
  authorizedPlanSha256,
  verify,
  runtime,
  contract,
  terraform,
  storage,
  env,
  signal,
) {
  const upgrade = structuredClone(input);
  if (upgrade.schemaVersion !== 2 || upgrade.engine !== 'terraform')
    throw new Error('Terraform upgrade schema is obsolete; prepare a new v2 plan');
  await verify(upgrade);
  if (!sameHash(upgrade.planSha256, authorizedPlanSha256))
    throw new Error('Exact Terraform upgrade authorization is required');
  if (
    runtime.engine !== 'terraform' ||
    storage.owner.engine !== 'terraform' ||
    hash(storage.owner) !== hash(upgrade.expectation.binding.owner)
  )
    throw new Error('Only the owning Terraform engine may upgrade this site');
  const release = await acquireProcessLock(`${storage.directory}/.upgrade-lock`);
  try {
    signal?.throwIfAborted();
    await storage.verify();
    const sourceName = `${upgrade.planId}.json`;
    const saved = await optional(storage, sourceName);
    if (saved === undefined) await storage.write(sourceName, upgrade);
    else if (hash(saved) !== hash(upgrade)) throw new Error('Saved Terraform upgrade source differs');
    const checkpointName = `${upgrade.planId}-checkpoint.json`;
    let checkpoint = await optional(storage, checkpointName);
    if (checkpoint === undefined) {
      checkpoint = {
        schemaVersion: 2,
        engine: 'terraform',
        sourcePlanSha256: upgrade.sourcePlanSha256,
        upgradePlanSha256: upgrade.planSha256,
        phase: 'ready',
      };
      await storage.write(checkpointName, checkpoint);
    }
    if (
      checkpoint.schemaVersion !== 2 ||
      checkpoint.engine !== 'terraform' ||
      checkpoint.sourcePlanSha256 !== upgrade.sourcePlanSha256 ||
      checkpoint.upgradePlanSha256 !== upgrade.planSha256 ||
      !['ready', 'submitted', 'complete'].includes(checkpoint.phase) ||
      (checkpoint.phase === 'ready' && checkpoint.actionPlanSha256 !== undefined) ||
      (checkpoint.phase !== 'ready' && !/^[a-f0-9]{64}$/.test(checkpoint.actionPlanSha256 ?? ''))
    )
      throw new Error('Terraform upgrade checkpoint differs');
    let serial = await optional(storage, 'terraform-ce-upgrade-serial.json');
    if (serial === undefined) serial = { schemaVersion: 2, engine: 'terraform', status: 'idle' };
    if (
      serial.schemaVersion !== 2 ||
      serial.engine !== 'terraform' ||
      !['active', 'idle'].includes(serial.status) ||
      (serial.status === 'idle' && (serial.activePlanId !== undefined || serial.activePlanSha256 !== undefined)) ||
      (serial.lastPlanId === undefined) !== (serial.lastPlanSha256 === undefined) ||
      (serial.lastPlanSha256 !== undefined && !/^[a-f0-9]{64}$/.test(serial.lastPlanSha256)) ||
      (serial.status === 'active' &&
        (serial.activePlanId !== upgrade.planId || serial.activePlanSha256 !== upgrade.planSha256))
    )
      throw new Error('Another site upgrade is active or the serial ledger differs');
    if (serial.status === 'idle' && checkpoint.phase !== 'complete') {
      serial = {
        schemaVersion: 2,
        engine: 'terraform',
        status: 'active',
        activePlanId: upgrade.planId,
        activePlanSha256: upgrade.planSha256,
        lastPlanId: serial.lastPlanId,
        lastPlanSha256: serial.lastPlanSha256,
      };
      await storage.write('terraform-ce-upgrade-serial.json', serial);
    }
    const observe = () =>
      runtime.observeUpgrade(
        upgrade.expectation.binding,
        contract,
        upgrade.expectation.target.kind === 'software' ? upgrade.expectation.target.version : undefined,
        signal,
      );
    let observation = await observe();
    let transition = assessCeUpgradeTransition(upgrade.expectation, observation);
    let session;
    const completeApplication = async (action) => {
      session ??= await terraform.open(storage.owner, upgrade.deployment, 'current');
      const state = await session.readPlanApplicationState(action);
      if (assessCeUpgradeTransition(upgrade.expectation, observation) !== 'versions-complete')
        throw new Error('Terraform upgrade completion evidence is no longer current');
      if (state === 'planned') throw new Error('Terraform upgrade action was not submitted');
      if (state === 'applying') {
        await session.reconcileApplyFromEvidence(
          action,
          hash({
            owner: storage.owner,
            sourcePlanSha256: upgrade.sourcePlanSha256,
            upgradePlanSha256: upgrade.planSha256,
            action,
            observation,
          }),
        );
        if ((await session.readPlanApplicationState(action)) !== 'applied')
          throw new Error('Terraform upgrade application reconciliation did not converge');
      } else if (state !== 'applied') throw new Error('Terraform upgrade application state is unknown');
    };
    const releaseSerial = async () => {
      await storage.write('terraform-ce-upgrade-serial.json', {
        schemaVersion: 2,
        engine: 'terraform',
        status: 'idle',
        lastPlanId: upgrade.planId,
        lastPlanSha256: upgrade.planSha256,
      });
    };
    if (checkpoint.phase === 'complete') {
      if (transition !== 'versions-complete') throw new Error('Completed Terraform upgrade version evidence regressed');
      const action = await storage.read(`${upgrade.planId}-action-plan.json`);
      validateActionReceipt(upgrade, action);
      if (action.planSha256 !== checkpoint.actionPlanSha256) throw new Error('Completed upgrade action plan differs');
      const receipt = await storage.read(`${upgrade.planId}-receipt.json`);
      if (
        receipt.status !== 'upgrade-complete' ||
        receipt.engine !== 'terraform' ||
        receipt.planId !== upgrade.planId ||
        receipt.planSha256 !== upgrade.planSha256 ||
        receipt.siteName !== upgrade.expectation.binding.siteName ||
        hash(receipt.target) !== hash(upgrade.expectation.target) ||
        receipt.actionPlanSha256 !== checkpoint.actionPlanSha256 ||
        receipt.nodeHealth !== 'unknown' ||
        receipt.routing !== 'unknown' ||
        receipt.traffic !== 'unknown'
      )
        throw new Error('Completed Terraform upgrade receipt differs');
      await completeApplication(action);
      await releaseSerial();
      return receipt;
    }
    if (transition === 'failed') throw new Error('Terraform upgrade failed');
    if (checkpoint.phase === 'ready' && transition === 'unknown')
      throw new Error('Terraform upgrade evidence is unknown');
    if (checkpoint.phase === 'ready' && transition === 'versions-complete') {
      serial = {
        schemaVersion: 2,
        engine: 'terraform',
        status: 'idle',
        lastPlanId: upgrade.planId,
        lastPlanSha256: upgrade.planSha256,
      };
      await storage.write('terraform-ce-upgrade-serial.json', serial);
      return { status: 'target-already-complete', planId: upgrade.planId, planSha256: upgrade.planSha256 };
    }
    if (checkpoint.phase === 'ready' && transition !== 'ready')
      throw new Error('Upgrade began outside the authorized Terraform action');
    if (checkpoint.phase === 'ready') {
      try {
        session = await terraform.open(storage.owner, upgrade.deployment, false);
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        session = await terraform.open(storage.owner, upgrade.deployment, 'current');
      }
      const action = await session.planAction(upgrade.action, env, signal);
      validateActionReceipt(upgrade, action);
      await storage.write(`${upgrade.planId}-action-plan.json`, action);
      await storage.verify();
      observation = await observe();
      transition = assessCeUpgradeTransition(upgrade.expectation, observation);
      if (transition !== 'ready') throw new Error('Terraform upgrade readiness changed before submission');
      checkpoint = { ...checkpoint, phase: 'submitted', actionPlanSha256: action.planSha256 };
      await storage.write(checkpointName, checkpoint);
      await session.apply(action, env, signal);
      observation = await observe();
      transition = assessCeUpgradeTransition(upgrade.expectation, observation);
    } else {
      const action = await storage.read(`${upgrade.planId}-action-plan.json`);
      validateActionReceipt(upgrade, action);
      if (action.planSha256 !== checkpoint.actionPlanSha256) throw new Error('Submitted upgrade action plan differs');
    }
    if (transition !== 'versions-complete') {
      if (transition === 'unknown')
        return {
          status: 'upgrade-convergence-unknown',
          planId: upgrade.planId,
          planSha256: upgrade.planSha256,
        };
      if (!['ready', 'converging'].includes(transition)) throw new Error('Terraform upgrade convergence is unknown');
      return { status: 'upgrade-converging', planId: upgrade.planId, planSha256: upgrade.planSha256 };
    }
    const completedAction = await storage.read(`${upgrade.planId}-action-plan.json`);
    validateActionReceipt(upgrade, completedAction);
    if (completedAction.planSha256 !== checkpoint.actionPlanSha256)
      throw new Error('Completed upgrade action plan differs');
    await completeApplication(completedAction);
    const receipt = {
      status: 'upgrade-complete',
      engine: 'terraform',
      planId: upgrade.planId,
      planSha256: upgrade.planSha256,
      siteName: upgrade.expectation.binding.siteName,
      target: upgrade.expectation.target,
      actionPlanSha256: checkpoint.actionPlanSha256,
      observedAt: new Date().toISOString(),
      nodeHealth: 'unknown',
      routing: 'unknown',
      traffic: 'unknown',
    };
    await storage.write(`${upgrade.planId}-receipt.json`, receipt);
    checkpoint = { ...checkpoint, phase: 'complete' };
    await storage.write(checkpointName, checkpoint);
    await releaseSerial();
    return receipt;
  } finally {
    await release();
  }
}
var digest2 = (value) => createHash4('sha256').update(value).digest('hex'),
  hash = (value) => digest2(canonical(value)),
  sameHash = (left, right) =>
    /^[a-f0-9]{64}$/.test(left) &&
    /^[a-f0-9]{64}$/.test(right) &&
    timingSafeEqual2(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
var init_ce_upgrade = __esm(() => {
  init_process_lock();
  init_upgrade_transition();
});

// plugins/terraform/src/provider-lock.ts
import { createHash as createHash5 } from 'node:crypto';
import { readFile as readFile2 } from 'node:fs/promises';

async function loadXcshProviderLock() {
  const value = await readFile2(new URL('./assets/plugins/terraform/locks/xcsh-provider.hcl', import.meta.url), 'utf8');
  if (createHash5('sha256').update(value).digest('hex') !== XCSH_PROVIDER_LOCK_SHA256)
    throw new Error('Published XC provider lock changed');
  return value;
}
var XCSH_PROVIDER_VERSION = '15.12.1',
  XCSH_PROVIDER_LOCK_SHA256 = '6d9fd709ee430d66bfa6de99dbbbafca2801eb8471201e6c282102fb3bd1a782';
var init_provider_lock = () => {};

// plugins/azure/src/ce/terraform-foundation.ts
import { readFile as readFile3 } from 'node:fs/promises';

function renderAzureTerraformFoundation(plan, bootstrapByNode = {}) {
  verifyAzureCePlan(plan);
  if (plan.engine !== 'terraform' || plan.intent.operation !== 'deploy')
    throw new Error('Azure Terraform foundation requires a Terraform deployment plan');
  const allowedTrafficSource =
    plan.intent.ingress?.mode === 'platform-http'
      ? plan.intent.ingress.probe.sourceVmResourceId.toLowerCase()
      : undefined;
  if (
    plan.nics.some((nic) => nic.subnet.mode !== 'greenfield') ||
    plan.intent.brownfield.resourceIds.some((id) => id.toLowerCase() !== allowedTrafficSource) ||
    plan.egress.mode !== 'public-ip'
  )
    throw new Error('Azure Terraform foundation requires greenfield networking and public-ip egress');
  if (plan.subscription.cloud !== 'AzureCloud')
    throw new Error('Azure Terraform foundation cloud environment requires explicit translation');
  if (!plan.actions.some((action) => action.kind === 'resource-group-create'))
    throw new Error('Azure Terraform foundation requires a newly planned resource group');
  const admitted = Object.keys(bootstrapByNode);
  if (admitted.some((node) => !/^[1-3]$/.test(node) || Number(node) > plan.topology.nodeCount))
    throw new Error('Invalid Azure Terraform node admission');
  if (admitted.some((node, index) => Number(node) !== index + 1))
    throw new Error('Azure Terraform nodes must be admitted in order');
  const resource = {};
  const data = {};
  const add = (type, name, value) => {
    resource[type] ??= {};
    resource[type][name] = value;
  };
  const addData = (type, name, value) => {
    data[type] ??= {};
    data[type][name] = value;
  };
  const tags = (node, index) => ({
    'xcsh-managed-by': 'azure-ce',
    'xcsh-execution-engine': 'terraform',
    'xcsh-deployment-id': plan.deploymentName,
    'xcsh-plan-sha256': plan.planSha256,
    'ves-io-site-name': plan.siteName,
    ...(node ? { 'xcsh-node-index': String(node) } : {}),
    ...(index !== undefined ? { 'xcsh-interface-index': String(index) } : {}),
  });
  const marketplaceTermsRequired = !plan.image.termsAccepted;
  if (marketplaceTermsRequired) {
    const resourceId = [
      `/subscriptions/${plan.subscription.id}`,
      'providers/Microsoft.MarketplaceOrdering',
      'offerTypes/virtualmachine',
      `publishers/${plan.image.publisher}`,
      `offers/${plan.image.offer}`,
      `plans/${plan.image.plan}`,
      'agreements/current',
    ].join('/');
    const type = 'Microsoft.MarketplaceOrdering/offerTypes/publishers/offers/plans/agreements@2021-01-01';
    const properties = 'data.azapi_resource.marketplace_terms.output.properties';
    const property = (name) => `try(${properties}.${name}, "")`;
    addData('azapi_resource', 'marketplace_terms', {
      type,
      resource_id: literal(resourceId),
      response_export_values: ['properties'],
    });
    add('azapi_resource_action', 'marketplace_terms', {
      type,
      resource_id: literal(resourceId),
      method: 'PUT',
      when: 'apply',
      body: ref(
        `merge(data.azapi_resource.marketplace_terms.output, { properties = merge(${properties}, { accepted = true }) })`,
      ),
      lifecycle: {
        precondition: [
          {
            condition: ref(
              [
                `(try(${properties}.accepted, null) == false || try(${properties}.accepted, null) == true)`,
                `lower(${property('publisher')}) == lower(${JSON.stringify(plan.image.publisher)})`,
                `lower(${property('product')}) == lower(${JSON.stringify(plan.image.offer)})`,
                `lower(${property('plan')}) == lower(${JSON.stringify(plan.image.plan)})`,
                `length(${property('licenseTextLink')}) > 0`,
                `length(${property('marketplaceTermsLink')}) > 0`,
                `length(${property('privacyPolicyLink')}) > 0`,
                `length(${property('signature')}) > 0`,
              ].join(' && '),
            ),
            error_message: 'Live Azure Marketplace agreement differs from the immutable unaccepted plan',
          },
        ],
      },
    });
  }
  add('azurerm_resource_group', 'ce', {
    name: literal(plan.intent.resourceGroup),
    location: plan.region,
    tags: tags(),
    ...(marketplaceTermsRequired ? { depends_on: ['azapi_resource_action.marketplace_terms'] } : {}),
  });
  const group = ref('azurerm_resource_group.ce.name');
  const fixture = plan.intent.workloadFixture;
  const subnets = plan.actions.filter((action) => action.kind === 'subnet-create');
  const subnetRefs = new Map();
  const prefixes = [];
  for (const [index, action] of subnets.entries()) {
    const arg = (flag) => (action.args?.includes(flag) ? action.args[action.args.indexOf(flag) + 1] : undefined);
    const name = arg('--name');
    const cidr = arg('--address-prefixes');
    if (!name || !cidr || subnetRefs.has(name)) throw new Error('Planned Azure subnet translation is incomplete');
    const key = `subnet_${index}`;
    add('azurerm_subnet', key, {
      name: literal(name),
      resource_group_name: group,
      virtual_network_name: ref('azurerm_virtual_network.ce.name'),
      address_prefixes: [cidr],
    });
    subnetRefs.set(name, ref(`azurerm_subnet.${key}.id`));
    prefixes.push(cidr);
  }
  if (fixture) {
    if (subnetRefs.has(fixture.subnetName) || prefixes.includes(fixture.cidr))
      throw new Error('Azure Terraform workload fixture overlaps a CE subnet');
    const key = 'workload';
    add('azurerm_subnet', key, {
      name: literal(fixture.subnetName),
      resource_group_name: group,
      virtual_network_name: ref('azurerm_virtual_network.ce.name'),
      address_prefixes: [fixture.cidr],
    });
    subnetRefs.set(fixture.subnetName, ref(`azurerm_subnet.${key}.id`));
    prefixes.push(fixture.cidr);
  }
  if (plan.nics.some((nic) => !subnetRefs.has(nic.subnet.name ?? '')))
    throw new Error('Planned Azure NIC subnet is unavailable');
  add('azurerm_virtual_network', 'ce', {
    name: literal(`${plan.deploymentName}-vnet`),
    resource_group_name: group,
    location: plan.region,
    address_space: [...new Set(prefixes)].sort(),
    tags: tags(),
  });
  if (fixture) {
    add('tls_private_key', 'workload', { algorithm: 'RSA', rsa_bits: 4096 });
    add('azurerm_network_interface', 'workload', {
      name: literal(`${plan.deploymentName}-workload-nic`),
      resource_group_name: group,
      location: plan.region,
      ip_forwarding_enabled: false,
      ip_configuration: [
        {
          name: 'primary',
          primary: true,
          subnet_id: subnetRefs.get(fixture.subnetName),
          private_ip_address_allocation: 'Static',
          private_ip_address: fixture.privateIp,
        },
      ],
      tags: { ...tags(), 'xcsh-workload-fixture': 'route-server' },
    });
    add('azurerm_linux_virtual_machine', 'workload', {
      name: literal(`${plan.deploymentName}-workload`),
      computer_name: literal(`${plan.deploymentName}-workload`),
      resource_group_name: group,
      location: plan.region,
      size: AZURE_CE_WORKLOAD_FIXTURE_VM_SIZE,
      admin_username: 'xcsh',
      disable_password_authentication: true,
      network_interface_ids: [ref('azurerm_network_interface.workload.id')],
      admin_ssh_key: [{ username: 'xcsh', public_key: ref('tls_private_key.workload.public_key_openssh') }],
      source_image_reference: {
        publisher: 'Canonical',
        offer: '0001-com-ubuntu-server-jammy',
        sku: '22_04-lts',
        version: 'latest',
      },
      os_disk: [{ caching: 'ReadWrite', storage_account_type: 'Standard_LRS', disk_size_gb: 30 }],
      custom_data: Buffer.from(`#cloud-config
runcmd:
  - [ sh, -c, "mkdir -p /srv/xcsh && printf route-server-fixture > /srv/xcsh/index.html && nohup python3 -m http.server ${fixture.port} --directory /srv/xcsh >/var/log/xcsh-workload.log 2>&1 &" ]
`).toString('base64'),
      tags: { ...tags(), 'xcsh-workload-fixture': 'route-server' },
    });
  }
  if (plan.routing.mode === 'route-server') {
    const routeServerSubnet = subnetRefs.get('RouteServerSubnet');
    if (
      !routeServerSubnet ||
      !Number.isInteger(plan.routing.localAsn) ||
      (plan.routing.localAsn ?? 0) < 1 ||
      (plan.routing.localAsn ?? 0) > 65534
    )
      throw new Error('Planned Route Server subnet or CE ASN translation is incomplete');
    add('azurerm_public_ip', 'route_server', {
      name: literal(`${plan.deploymentName}-rs-pip`),
      resource_group_name: group,
      location: plan.region,
      allocation_method: 'Static',
      sku: 'Standard',
      tags: tags(),
    });
    add('azurerm_route_server', 'ce', {
      name: literal(`${plan.deploymentName}-rs`),
      resource_group_name: group,
      location: plan.region,
      sku: 'Standard',
      public_ip_address_id: ref('azurerm_public_ip.route_server.id'),
      subnet_id: routeServerSubnet,
      branch_to_branch_traffic_enabled: false,
      tags: tags(),
    });
  }
  if (plan.securityRules.length) {
    add('azurerm_network_security_group', 'ce', {
      name: literal(`${plan.deploymentName}-nsg`),
      resource_group_name: group,
      location: plan.region,
      tags: tags(),
    });
    for (const [index, rule] of plan.securityRules.entries())
      add('azurerm_network_security_rule', `rule_${index}`, {
        name: literal(rule.name),
        resource_group_name: group,
        network_security_group_name: ref('azurerm_network_security_group.ce.name'),
        priority: 100 + index,
        direction: rule.direction,
        access: 'Allow',
        protocol: rule.protocol,
        source_port_range: '*',
        source_address_prefixes: rule.sourceCidrs,
        destination_address_prefixes: rule.destinationCidrs,
        ...(rule.destinationPorts.length === 1
          ? { destination_port_range: rule.destinationPorts[0] }
          : { destination_port_ranges: rule.destinationPorts }),
      });
  }
  const interfaceOutputs = {};
  const instanceOutputs = {};
  for (let node = 1; node <= plan.topology.nodeCount; node++) {
    const nodeName = `${plan.deploymentName}-${node}`;
    const zone = plan.topology.zones[node - 1] ?? plan.topology.zones[0];
    add('azurerm_public_ip', `node_${node}`, {
      name: literal(`${nodeName}-pip`),
      resource_group_name: group,
      location: plan.region,
      allocation_method: 'Static',
      sku: 'Standard',
      ...(zone ? { zones: [zone] } : {}),
      tags: tags(node),
    });
    for (const nic of plan.nics) {
      const key = `node_${node}_nic_${nic.index}`;
      const subnet = subnetRefs.get(nic.subnet.name ?? '');
      add('azurerm_network_interface', key, {
        name: literal(`${nodeName}-nic${nic.index}`),
        resource_group_name: group,
        location: plan.region,
        ip_forwarding_enabled: true,
        accelerated_networking_enabled: false,
        ip_configuration: [
          {
            name: 'primary',
            primary: true,
            subnet_id: subnet,
            private_ip_address_allocation: 'Dynamic',
            ...(nic.index === 0 ? { public_ip_address_id: ref(`azurerm_public_ip.node_${node}.id`) } : {}),
          },
        ],
        tags: tags(node, nic.index),
      });
      if (plan.securityRules.length)
        add('azurerm_network_interface_security_group_association', key, {
          network_interface_id: ref(`azurerm_network_interface.${key}.id`),
          network_security_group_id: ref('azurerm_network_security_group.ce.id'),
        });
      interfaceOutputs[`${node}:${nic.index}`] = {
        id: ref(`azurerm_network_interface.${key}.id`),
        subnet_id: subnet,
        site_name: plan.siteName,
        node,
        index: nic.index,
        role: nic.role,
      };
    }
    if (!admitted.includes(String(node))) continue;
    if (plan.routing.mode === 'route-server') {
      const slo = plan.nics.find((nic) => nic.role === 'slo');
      if (!slo) throw new Error('Route Server peering requires the explicit SLO interface');
      add('azurerm_route_server_bgp_connection', `node_${node}`, {
        name: literal(nodeName),
        route_server_id: ref('azurerm_route_server.ce.id'),
        peer_asn: plan.routing.localAsn,
        peer_ip: ref(`azurerm_network_interface.node_${node}_nic_${slo.index}.private_ip_address`),
      });
    }
    const bootstrap = bootstrapByNode[String(node)];
    if (
      !bootstrap.startsWith('#cloud-config') ||
      !bootstrap.includes('/etc/vpm/user_data') ||
      /__\w+__/.test(bootstrap)
    )
      throw new Error('Azure Terraform admission requires resolved platform cloud-init');
    add('tls_private_key', `node_${node}`, { algorithm: 'RSA', rsa_bits: 4096 });
    add('azurerm_linux_virtual_machine', `node_${node}`, {
      name: literal(nodeName),
      computer_name: literal(nodeName),
      location: plan.region,
      resource_group_name: group,
      size: plan.vm.size,
      ...(zone ? { zone } : {}),
      admin_username: 'azureuser',
      disable_password_authentication: true,
      admin_ssh_key: [{ username: 'azureuser', public_key: ref(`tls_private_key.node_${node}.public_key_openssh`) }],
      network_interface_ids: plan.nics.map((nic) => ref(`azurerm_network_interface.node_${node}_nic_${nic.index}.id`)),
      source_image_reference: [
        { publisher: plan.image.publisher, offer: plan.image.offer, sku: plan.image.plan, version: plan.image.version },
      ],
      plan: [{ name: plan.image.plan, product: plan.image.offer, publisher: plan.image.publisher }],
      os_disk: [
        {
          name: literal(`${nodeName}-osdisk`),
          caching: 'ReadWrite',
          storage_account_type: 'StandardSSD_LRS',
          disk_size_gb: 100,
        },
      ],
      boot_diagnostics: [{}],
      custom_data: Buffer.from(bootstrap).toString('base64'),
      tags: tags(node),
      ...(() => {
        const dependsOn = [
          ...(marketplaceTermsRequired ? ['azapi_resource_action.marketplace_terms'] : []),
          ...(plan.securityRules.length
            ? [
                ...plan.nics.map(
                  (nic) => `azurerm_network_interface_security_group_association.node_${node}_nic_${nic.index}`,
                ),
                ...plan.securityRules.map((_, index) => `azurerm_network_security_rule.rule_${index}`),
              ]
            : []),
        ];
        return dependsOn.length ? { depends_on: dependsOn } : {};
      })(),
    });
    instanceOutputs[String(node)] = {
      id: ref(`azurerm_linux_virtual_machine.node_${node}.id`),
      vm_id: ref(`azurerm_linux_virtual_machine.node_${node}.virtual_machine_id`),
      site_name: plan.siteName,
      hostname: nodeName,
    };
  }
  return JSON.stringify({
    terraform: {
      required_version: `= ${AZURE_CE_TERRAFORM_VERSION}`,
      required_providers: {
        azurerm: { source: 'hashicorp/azurerm', version: `= ${AZURE_CE_TERRAFORM_PROVIDER_VERSION}` },
        tls: { source: 'hashicorp/tls', version: `= ${AZURE_CE_TLS_PROVIDER_VERSION}` },
        azapi: { source: 'Azure/azapi', version: `= ${AZURE_CE_AZAPI_PROVIDER_VERSION}` },
      },
    },
    provider: {
      azurerm: {
        features: [{}],
        subscription_id: plan.subscription.id,
        tenant_id: plan.subscription.tenantId,
        environment: 'public',
        resource_provider_registrations: 'none',
      },
      azapi: { subscription_id: plan.subscription.id, tenant_id: plan.subscription.tenantId },
    },
    ...(Object.keys(data).length ? { data } : {}),
    resource,
    output: {
      ce_interfaces: { value: interfaceOutputs },
      ce_instances: { value: instanceOutputs },
      ce_vnet_id: { value: ref('azurerm_virtual_network.ce.id') },
      ...(plan.routing.mode === 'route-server'
        ? {
            ce_route_server: {
              value: {
                id: ref('azurerm_route_server.ce.id'),
                asn: ref('azurerm_route_server.ce.virtual_router_asn'),
                peer_ips: ref('sort(tolist(azurerm_route_server.ce.virtual_router_ips))'),
              },
            },
            ce_route_server_peers: {
              value: Object.fromEntries(
                admitted.map((node) => [
                  node,
                  {
                    id: ref(`azurerm_route_server_bgp_connection.node_${node}.id`),
                    peer_ip: ref(
                      `azurerm_network_interface.node_${node}_nic_${plan.nics.find((nic) => nic.role === 'slo')?.index}.private_ip_address`,
                    ),
                    peer_asn: plan.routing.localAsn,
                  },
                ]),
              ),
            },
          }
        : {}),
    },
  });
}
async function azureTerraformFoundationDeployment(plan, bootstrapByNode = {}) {
  const configuration = renderAzureTerraformFoundation(plan, bootstrapByNode);
  const providerLock = await readFile3(
    new URL('./assets/plugins/azure/terraform/provider-lock.hcl', import.meta.url),
    'utf8',
  );
  return {
    schemaVersion: 1,
    deploymentId: plan.deploymentName,
    engine: 'terraform',
    scope: { cloud: 'azure', account: plan.subscription.id, region: plan.region },
    terraformVersion: AZURE_CE_TERRAFORM_VERSION,
    configuration,
    providerLock,
    backendIdentity: `local:${plan.deploymentName}`,
  };
}
async function azureTerraformCurrentDeployment(plan) {
  verifyAzureCePlan(plan);
  if (plan.engine !== 'terraform') throw new Error('Azure Terraform workspace requires Terraform ownership');
  const providerLock = await readFile3(
    new URL('./assets/plugins/azure/terraform/provider-lock.hcl', import.meta.url),
    'utf8',
  );
  return {
    schemaVersion: 1,
    deploymentId: plan.deploymentName,
    engine: 'terraform',
    scope: { cloud: 'azure', account: plan.subscription.id, region: plan.region },
    terraformVersion: AZURE_CE_TERRAFORM_VERSION,
    configuration: JSON.stringify({
      terraform: {
        required_version: `= ${AZURE_CE_TERRAFORM_VERSION}`,
        required_providers: {
          azurerm: { source: 'hashicorp/azurerm', version: `= ${AZURE_CE_TERRAFORM_PROVIDER_VERSION}` },
          tls: { source: 'hashicorp/tls', version: `= ${AZURE_CE_TLS_PROVIDER_VERSION}` },
          azapi: { source: 'Azure/azapi', version: `= ${AZURE_CE_AZAPI_PROVIDER_VERSION}` },
        },
      },
      provider: {
        azurerm: {
          features: [{}],
          subscription_id: plan.subscription.id,
          tenant_id: plan.subscription.tenantId,
          environment: 'public',
          resource_provider_registrations: 'none',
        },
        azapi: { subscription_id: plan.subscription.id, tenant_id: plan.subscription.tenantId },
      },
    }),
    providerLock,
    backendIdentity: `local:${plan.deploymentName}`,
  };
}
var AZURE_CE_TERRAFORM_VERSION = '1.16.5',
  AZURE_CE_TERRAFORM_PROVIDER_VERSION = '5.4.0',
  AZURE_CE_TLS_PROVIDER_VERSION = '4.4.0',
  AZURE_CE_AZAPI_PROVIDER_VERSION = '2.12.0',
  ref = (address) => `\${${address}}`,
  literal = (value) => value.replaceAll('${', '$${').replaceAll('%{', '%%{');
var init_terraform_foundation = __esm(() => {
  init_artifacts();
});

// plugins/azure/src/ce/terraform-upgrade.ts
function azureUpgradeBinding(plan) {
  verifyAzureCePlan(plan);
  if (plan.intent.initialVersions !== undefined) initialSoftwareSettings(plan.intent.initialVersions);
  return {
    owner: {
      deploymentId: plan.deploymentName,
      engine: plan.engine,
      provider: 'azure',
      account: plan.subscription.id,
      region: plan.region,
    },
    ...(plan.intent.initialVersions ? { initialVersions: structuredClone(plan.intent.initialVersions) } : {}),
    siteName: plan.siteName,
    nodes: Array.from({ length: plan.topology.nodeCount }, (_, index) => `${plan.deploymentName}-${index + 1}`),
  };
}
async function build(base, expectation, contract) {
  verifyAzureCePlan(base);
  initialSoftwareSettings(expectation.before);
  const binding = azureUpgradeBinding(base);
  if (
    base.engine !== 'terraform' ||
    canonicalSha256(binding) !== canonicalSha256(expectation.binding) ||
    typeof expectation.siteUid !== 'string' ||
    !expectation.siteUid.trim() ||
    typeof expectation.physicalSiteUid !== 'string' ||
    !expectation.physicalSiteUid.trim() ||
    !/^sha256:[a-f0-9]{64}$/.test(expectation.siteContractFingerprint) ||
    Object.keys(expectation.target).sort().join(',') !== 'kind,version' ||
    expectation.before[expectation.target.kind] === expectation.target.version ||
    expectation.contractFingerprint !== contract.fingerprint
  )
    throw new Error('Azure Terraform upgrade identities, scope or effective versions are incomplete');
  const { kind, version } = expectation.target;
  const request = contract.build({ siteName: base.siteName, kind, version });
  const requestValues = { name: base.siteName, namespace: 'system', version, force: false };
  const actionValues = { site: base.siteName, [kind === 'software' ? 'software_version' : 'os_version']: version };
  const suffix = kind === 'software' ? 'sw' : 'os';
  if (
    request.method !== 'POST' ||
    request.path !== `/api/config/namespaces/system/sites/${base.siteName}/upgrade_${suffix}` ||
    canonicalSha256(request.body) !== canonicalSha256(requestValues)
  )
    throw new Error('Azure Terraform upgrade wire request differs from the verified action');
  const providerLock = await loadXcshProviderLock();
  const identity = { sourcePlanSha256: base.planSha256, expectation };
  const stage = `upgrade-${kind}-${canonicalSha256(identity).slice(0, 24)}`;
  const type = `xcsh_site_upgrade_${suffix}`;
  const deployment = {
    schemaVersion: 1,
    deploymentId: base.deploymentName,
    stage,
    engine: 'terraform',
    scope: { cloud: 'azure', account: base.subscription.id, region: base.region },
    terraformVersion: AZURE_CE_TERRAFORM_VERSION,
    providerLock,
    backendIdentity: `local:${base.deploymentName}:stage:${stage}`,
    configuration: JSON.stringify({
      terraform: {
        required_version: `= ${AZURE_CE_TERRAFORM_VERSION}`,
        required_providers: { xcsh: { source: 'f5-sales-demo/xcsh', version: `= ${XCSH_PROVIDER_VERSION}` } },
      },
      provider: { xcsh: {} },
      action: { [type]: { ce: { config: actionValues } } },
    }),
  };
  const draft = {
    schemaVersion: 2,
    engine: 'terraform',
    kind: 'azure-ce-terraform-upgrade',
    ...identity,
    deployment,
    action: {
      address: `action.${type}.ce`,
      type,
      providerName: 'registry.terraform.io/f5-sales-demo/xcsh',
      configValuesSha256: canonicalSha256(actionValues),
    },
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `azure-ce-upgrade-${planSha256.slice(0, 24)}`, planSha256 };
}
async function prepareAzureTerraformUpgrade(base, target, runtime, contract, signal) {
  verifyAzureCePlan(base);
  if (base.engine !== 'terraform') throw new Error('Azure CE upgrade requires a Terraform-owned plan');
  contract.build({ siteName: base.siteName, ...target });
  const binding = azureUpgradeBinding(base);
  const observation = await runtime.observeUpgrade(
    binding,
    contract,
    target.kind === 'software' ? target.version : undefined,
    signal,
  );
  if (observation.status !== 'observed') throw new Error('Fresh Azure upgrade version evidence is unavailable');
  const expectation = {
    binding,
    siteUid: observation.siteUid,
    physicalSiteUid: observation.physicalSiteUid,
    contractFingerprint: observation.contractFingerprint,
    siteContractFingerprint: observation.siteContractFingerprint,
    before: { software: observation.software.installed, os: observation.os.installed },
    target: structuredClone(target),
  };
  if (assessCeUpgradeTransition(expectation, observation) !== 'ready')
    throw new Error('Azure site version readiness has not converged');
  return build(base, expectation, contract);
}
async function verifyAzureTerraformUpgrade(base, upgrade, contract) {
  if (upgrade.schemaVersion !== 2 || upgrade.engine !== 'terraform')
    throw new Error('Azure Terraform upgrade schema is obsolete; prepare a new v2 plan');
  const expected = await build(base, upgrade.expectation, contract);
  if (canonicalSha256(upgrade) !== canonicalSha256(expected))
    throw new Error('Saved Azure Terraform upgrade plan changed');
}
async function runAzureTerraformUpgrade(
  base,
  upgrade,
  authorizedPlanSha256,
  runtime,
  contract,
  terraform,
  storage,
  env,
  signal,
) {
  return runTerraformCeUpgrade(
    upgrade,
    authorizedPlanSha256,
    (candidate) => verifyAzureTerraformUpgrade(base, candidate, contract),
    runtime,
    contract,
    terraform,
    storage,
    env,
    signal,
  );
}
var init_terraform_upgrade = __esm(() => {
  init_upgrade_transition();
  init_ce_upgrade();
  init_provider_lock();
  init_artifacts();
  init_canonical();
  init_terraform_foundation();
});

// plugins/azure/src/ce/native-workflow.ts
import { chmod, mkdtemp, rm as rm2, writeFile as writeFile2 } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join as join3 } from 'node:path';

async function readCheckpoint(plan, storage) {
  let checkpoint;
  try {
    checkpoint = await storage.read(checkpointName(plan));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    checkpoint = {
      schemaVersion: 1,
      engine: 'native',
      planSha256: plan.planSha256,
      siteReserved: false,
      bootstrapByNode: {},
      launchedAtByNode: {},
    };
    await storage.write(checkpointName(plan), checkpoint);
  }
  const bootstrappedNodes = Object.keys(checkpoint.bootstrapByNode);
  const launchedNodes = Object.keys(checkpoint.launchedAtByNode);
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.engine !== 'native' ||
    checkpoint.planSha256 !== plan.planSha256 ||
    typeof checkpoint.siteReserved !== 'boolean' ||
    !checkpoint.bootstrapByNode ||
    typeof checkpoint.bootstrapByNode !== 'object' ||
    Object.entries(checkpoint.bootstrapByNode).some(
      ([node, bootstrap]) =>
        !/^[1-3]$/.test(node) ||
        Number(node) > plan.topology.nodeCount ||
        typeof bootstrap !== 'string' ||
        !bootstrap.startsWith('#cloud-config') ||
        !bootstrap.includes('/etc/vpm/user_data') ||
        /__\w+__/.test(bootstrap),
    ) ||
    !checkpoint.launchedAtByNode ||
    typeof checkpoint.launchedAtByNode !== 'object' ||
    Object.entries(checkpoint.launchedAtByNode).some(
      ([node, launchedAt]) => !checkpoint.bootstrapByNode[node] || Number.isNaN(Date.parse(launchedAt)),
    ) ||
    launchedNodes.length > bootstrappedNodes.length ||
    (plan.intent.operation === 'deploy' &&
      (bootstrappedNodes.some((node, index) => Number(node) !== index + 1) ||
        launchedNodes.some((node, index) => Number(node) !== index + 1) ||
        (bootstrappedNodes.length > 0 && !checkpoint.siteReserved)))
  )
    throw new Error('Azure native admission checkpoint differs from the owning plan');
  const replacement = checkpoint.replacement;
  if (replacement !== undefined) {
    const keys = Object.keys(replacement).sort().join(',');
    const expectedKeys = [
      ...(replacement.newVmId ? ['newVmId'] : []),
      'node',
      'oldVmIds',
      'ownerPlanSha256ByNode',
      ...(replacement.routeServer ? ['routeServer'] : []),
      'siteConfigurationSha256',
      'siteUid',
      'status',
    ]
      .sort()
      .join(',');
    const nodes = Array.from({ length: plan.topology.nodeCount }, (_, index) => `${plan.deploymentName}-${index + 1}`);
    if (
      plan.intent.operation !== 'replace-node' ||
      keys !== expectedKeys ||
      replacement.node !== plan.intent.replacementNode ||
      !replacement.siteUid ||
      !/^[a-f0-9]{64}$/.test(replacement.siteConfigurationSha256) ||
      !['prepared', 'registered'].includes(replacement.status) ||
      Object.keys(replacement.oldVmIds).sort().join(',') !== nodes.sort().join(',') ||
      Object.keys(replacement.ownerPlanSha256ByNode).sort().join(',') !== nodes.sort().join(',') ||
      Object.values(replacement.oldVmIds).some((id) => !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) ||
      new Set(Object.values(replacement.oldVmIds).map((id) => id.toLowerCase())).size !== nodes.length ||
      Object.values(replacement.ownerPlanSha256ByNode).some((digest) => !/^[a-f0-9]{64}$/.test(digest)) ||
      (plan.routing.mode === 'route-server') !== Boolean(replacement.routeServer) ||
      (replacement.routeServer !== undefined &&
        (lower3(replacement.routeServer.routeServerId) !==
          lower3(
            `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Network/virtualHubs/${plan.deploymentName}-rs`,
          ) ||
          !/^[a-f0-9]{64}$/.test(replacement.routeServer.ownerPlanSha256) ||
          Object.keys(replacement.routeServer.peerIds).sort().join(',') !==
            Array.from({ length: plan.topology.nodeCount }, (_, index) => String(index + 1)).join(',') ||
          Object.entries(replacement.routeServer.peerIds).some(
            ([node, id]) =>
              lower3(id) !==
              lower3(`${replacement.routeServer?.routeServerId}/bgpConnections/${plan.deploymentName}-${node}`),
          ))) ||
      (replacement.status === 'registered') !== Boolean(replacement.newVmId) ||
      (replacement.newVmId !== undefined &&
        (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(replacement.newVmId) ||
          replacement.newVmId.toLowerCase() ===
            replacement.oldVmIds[`${plan.deploymentName}-${replacement.node}`]?.toLowerCase()))
    )
      throw new Error('Azure native replacement checkpoint differs from the owning plan');
  } else if (plan.intent.operation === 'replace-node' && (bootstrappedNodes.length || launchedNodes.length)) {
    throw new Error('Azure native replacement evidence is missing before bootstrap');
  }
  return checkpoint;
}
async function prepareAzureNativeAdmission(plan, runtime, storage, signal) {
  if (plan.engine !== 'native' || runtime.engine !== 'native')
    throw new Error('Azure native workflow requires native ownership');
  if (plan.actions.some((action) => action.requiresBootstrap)) runtime.requireBootstrapContract('azure');
  if (plan.routing.mode === 'route-server') runtime.requireRoutingContract('azure');
  await storage.verify();
  const checkpoint = await readCheckpoint(plan, storage);
  if (plan.intent.operation === 'deploy') {
    await runtime.reserveSite(
      azureUpgradeBinding(plan),
      (record) => storage.write('native-site.json', record),
      signal,
      plan.intent.workloadFixture ? [plan.intent.workloadFixture.cidr] : [],
    );
    checkpoint.siteReserved = true;
    await storage.write(checkpointName(plan), checkpoint);
  }
  return checkpoint;
}
async function prepareAzureNativeReplacement(plan, checkpoint, api, runtime, storage, signal) {
  if (plan.intent.operation !== 'replace-node' || !plan.intent.replacementNode)
    throw new Error('Azure native replacement requires an exact selected node');
  await storage.verify();
  const binding = azureUpgradeBinding(plan);
  const site = await runtime.observeOwnedSite(binding, signal);
  const metadata = site.system_metadata;
  const siteUid = typeof metadata?.uid === 'string' ? metadata.uid : '';
  if (!siteUid) throw new Error('Azure native replacement site identity is unavailable');
  const siteConfigurationSha256 = canonicalSha256(runtime.ownedSiteConfiguration(binding, site));
  if (checkpoint.replacement) {
    if (
      checkpoint.replacement.siteUid !== siteUid ||
      checkpoint.replacement.siteConfigurationSha256 !== siteConfigurationSha256
    )
      throw new Error('Azure native replacement site identity or configuration changed');
    return;
  }
  const rows = await listAzureNativeVms(plan, api);
  const oldVmIds = {};
  const ownerPlanSha256ByNode = {};
  for (let index = 1; index <= plan.topology.nodeCount; index++) {
    const node = `${plan.deploymentName}-${index}`;
    const resourceId = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${node}`;
    const matches = rows.filter((row) => row && typeof row === 'object' && lower3(row.id) === resourceId.toLowerCase());
    const vm = matches.length === 1 ? matches[0] : undefined;
    const tags = vm?.tags;
    const vmId = vm?.vmId;
    const ownerPlanSha256 = tags?.['xcsh-plan-sha256'];
    if (
      !vm ||
      typeof vmId !== 'string' ||
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(vmId) ||
      tags?.['xcsh-managed-by'] !== 'azure-ce' ||
      tags?.['xcsh-deployment-id'] !== plan.deploymentName ||
      tags?.['xcsh-execution-engine'] !== 'native' ||
      typeof ownerPlanSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(ownerPlanSha256)
    )
      throw new Error('Azure native replacement VM identity or ownership is unavailable');
    oldVmIds[node] = vmId;
    ownerPlanSha256ByNode[node] = ownerPlanSha256;
  }
  const targetNode = `${plan.deploymentName}-${plan.intent.replacementNode}`;
  const deleteAction = plan.actions.find(
    (action) => action.kind === 'vm-delete' && action.node === plan.intent.replacementNode,
  );
  if (
    !deleteAction ||
    deleteAction.expectedOwnerPlanSha256 !== ownerPlanSha256ByNode[targetNode] ||
    deleteAction.resourceId?.toLowerCase() !==
      `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${targetNode}`.toLowerCase()
  )
    throw new Error('Azure native replacement delete boundary differs from the observed VM');
  const routeServer =
    plan.routing.mode === 'route-server' ? await captureAzureRouteServerOwnership(plan, api, signal) : undefined;
  checkpoint.replacement = {
    node: plan.intent.replacementNode,
    oldVmIds,
    ownerPlanSha256ByNode,
    siteUid,
    siteConfigurationSha256,
    status: 'prepared',
    ...(routeServer ? { routeServer } : {}),
  };
  await storage.write(checkpointName(plan), checkpoint);
}
async function azureNativeBootstrapForAction(
  plan,
  action,
  checkpoint,
  runtime,
  storage,
  signal,
  haSerialDelayMs = 180000,
) {
  if (!action.requiresBootstrap || !action.node) throw new Error('Azure bootstrap action identity is unavailable');
  const node = String(action.node);
  if (plan.intent.operation === 'deploy' && plan.topology.ha && action.node > 1) {
    const previous = checkpoint.launchedAtByNode[String(action.node - 1)];
    if (!previous) throw new Error('Prior Azure HA node launch boundary is unavailable');
    await waitUntil(Date.parse(previous) + haSerialDelayMs, signal);
  }
  await storage.verify();
  if (!checkpoint.bootstrapByNode[node]) {
    const nodeName = `${plan.deploymentName}-${node}`;
    const tokenName = `${plan.deploymentName.slice(0, 40)}-${node}-${plan.planSha256.slice(0, 12)}`;
    checkpoint.bootstrapByNode[node] = await runtime.bootstrap(
      azureUpgradeBinding(plan),
      nodeName,
      tokenName,
      (secret) => storage.write(`${tokenName}.json`, secret),
      signal,
    );
    await storage.write(checkpointName(plan), checkpoint);
  }
  return checkpoint.bootstrapByNode[node];
}
async function recordAzureNativeLaunch(plan, node, checkpoint, storage) {
  checkpoint.launchedAtByNode[String(node)] ??= new Date().toISOString();
  await storage.write(checkpointName(plan), checkpoint);
}
async function withAzureNativeBootstrapFile(bootstrap, run) {
  if (!bootstrap.startsWith('#cloud-config') || !bootstrap.includes('/etc/vpm/user_data') || /__\w+__/.test(bootstrap))
    throw new Error('Azure native admission requires resolved platform cloud-init');
  const directory = await mkdtemp(join3(tmpdir(), 'xcsh-azure-ce-'));
  await chmod(directory, 448);
  const path = join3(directory, 'cloud-init.yaml');
  try {
    await writeFile2(path, bootstrap, { mode: 384, flag: 'wx' });
    return await run(path);
  } finally {
    await rm2(directory, { recursive: true, force: true });
  }
}
async function collectAzureNativeVmState(plan, action, api, signal) {
  if (
    action.kind !== 'vm-state-gate' ||
    !action.node ||
    !action.expectedPowerState ||
    !action.expectedOwnerPlanSha256 ||
    !/^[a-f0-9]{64}$/.test(action.expectedOwnerPlanSha256) ||
    action.mutates ||
    action.command ||
    action.args
  )
    throw new Error('Azure VM state gate is malformed');
  const name = `${plan.deploymentName}-${action.node}`;
  const vm = plan.actions.filter((candidate) => candidate.kind === 'vm-create' && candidate.node === action.node);
  const resourceId =
    vm.length === 1 && vm[0].resourceId
      ? vm[0].resourceId
      : `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${name}`;
  signal?.throwIfAborted();
  const result = await api.exec(
    'az',
    ['vm', 'show', '--ids', resourceId, '--show-details', '--subscription', plan.subscription.id, '--output', 'json'],
    signal ? { signal } : undefined,
  );
  signal?.throwIfAborted();
  if (result.exitCode !== 0) throw new Error('Azure VM state observation unavailable');
  let value;
  try {
    value = JSON.parse(result.stdout);
  } catch {
    throw new Error('Malformed Azure VM state observation');
  }
  const powerState =
    typeof value.powerState === 'string' ? value.powerState.toLowerCase().replace(/^vm\s+/, '') : 'unknown';
  const tags = value.tags;
  if (
    typeof value.id !== 'string' ||
    value.id.toLowerCase() !== resourceId.toLowerCase() ||
    value.name !== name ||
    typeof value.location !== 'string' ||
    value.location.toLowerCase() !== plan.region.toLowerCase() ||
    value.provisioningState !== 'Succeeded' ||
    tags?.['xcsh-managed-by'] !== 'azure-ce' ||
    tags?.['xcsh-deployment-id'] !== plan.deploymentName ||
    tags?.['xcsh-execution-engine'] !== plan.engine ||
    tags?.['xcsh-plan-sha256'] !== action.expectedOwnerPlanSha256
  )
    throw new Error('Azure VM state identity or ownership differs');
  return {
    planId: plan.planId,
    planSha256: plan.planSha256,
    engine: plan.engine,
    subscriptionId: plan.subscription.id,
    region: plan.region,
    deploymentId: plan.deploymentName,
    node: action.node,
    resourceId,
    source: 'azure-cli-live',
    observedAt: new Date().toISOString(),
    expectedPowerState: action.expectedPowerState,
    ownerPlanSha256: action.expectedOwnerPlanSha256,
    expectedVmSize: action.expectedVmSize,
    vmSize: typeof value.hardwareProfile?.vmSize === 'string' ? value.hardwareProfile.vmSize : 'unknown',
    powerState,
    status:
      powerState === action.expectedPowerState &&
      (action.expectedVmSize === undefined || value.hardwareProfile?.vmSize === action.expectedVmSize)
        ? 'healthy'
        : 'degraded',
  };
}
async function listAzureNativeVms(plan, api) {
  const result = await api.exec('az', [
    'vm',
    'list',
    '--resource-group',
    plan.intent.resourceGroup,
    '--show-details',
    '--subscription',
    plan.subscription.id,
    '--output',
    'json',
  ]);
  if (result.exitCode !== 0) throw new Error('Azure VM identity observation unavailable');
  let value;
  try {
    value = JSON.parse(result.stdout);
  } catch {
    throw new Error('Malformed Azure VM identity observation');
  }
  if (!Array.isArray(value)) throw new Error('Incomplete Azure VM identity observation');
  return value;
}
async function collectAzureNativeAdmissionHealth(
  plan,
  admittedNodeCount,
  api,
  runtime,
  storage,
  signal,
  nativeCheckpoint,
) {
  await storage.verify();
  const vms = await listAzureNativeVms(plan, api);
  const admittedNodes = Array.from({ length: admittedNodeCount }, (_, index) => `${plan.deploymentName}-${index + 1}`);
  const scope =
    `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/`.toLowerCase();
  const instances = Object.fromEntries(
    admittedNodes.map((node) => {
      const matches = vms.filter(
        (vm) =>
          vm &&
          typeof vm === 'object' &&
          typeof vm.id === 'string' &&
          vm.id.toLowerCase() === scope + node.toLowerCase(),
      );
      if (matches.length !== 1) throw new Error('Azure admitted VM identity is missing or ambiguous');
      const vmId = matches[0].vmId;
      if (typeof vmId !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(vmId))
        throw new Error('Azure admitted VM UUID is unavailable');
      return [node, vmId];
    }),
  );
  const replacement = plan.intent.operation === 'replace-node' ? nativeCheckpoint?.replacement : undefined;
  if (plan.intent.operation === 'replace-node') {
    const target = `${plan.deploymentName}-${plan.intent.replacementNode}`;
    if (
      !replacement ||
      replacement.node !== plan.intent.replacementNode ||
      instances[target]?.toLowerCase() === replacement.oldVmIds[target]?.toLowerCase() ||
      (replacement.newVmId !== undefined && instances[target]?.toLowerCase() !== replacement.newVmId.toLowerCase()) ||
      Object.entries(instances).some(
        ([node, vmId]) => node !== target && vmId.toLowerCase() !== replacement.oldVmIds[node]?.toLowerCase(),
      )
    )
      throw new Error('Azure native replacement VM identities did not change exactly once');
  }
  const binding = azureUpgradeBinding(plan);
  await runtime.approveRegistrations(
    binding,
    instances,
    (record) => storage.write(`native-registration-node-${admittedNodeCount}.json`, record),
    signal,
    admittedNodes,
  );
  const replacementOwners = replacement
    ? Object.fromEntries(
        Object.entries(replacement.ownerPlanSha256ByNode).map(([node, digest]) => [
          node,
          node === `${plan.deploymentName}-${replacement.node}` ? plan.planSha256 : digest,
        ]),
      )
    : undefined;
  const health = await collectAzurePlatformHealth(plan, vms, runtime, signal, admittedNodeCount, replacementOwners);
  if (admittedNodeCount !== plan.topology.nodeCount) return health;
  const expectedInterfaces = [];
  for (const node of admittedNodes)
    for (const nic of plan.nics.filter((item) => item.role === 'slo' || item.role === 'data' || item.role === 'sli')) {
      const name = `${node}-nic${nic.index}`;
      const result = await api.exec('az', [
        'network',
        'nic',
        'show',
        '--resource-group',
        plan.intent.resourceGroup,
        '--name',
        name,
        '--subscription',
        plan.subscription.id,
        '--output',
        'json',
      ]);
      if (result.exitCode !== 0) throw new Error('Azure NIC identity observation unavailable');
      let value;
      try {
        value = JSON.parse(result.stdout);
      } catch {
        throw new Error('Malformed Azure NIC identity observation');
      }
      const expectedId = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Network/networkInterfaces/${name}`;
      const expectedVm = `${scope}${node}`;
      const tags = value.tags;
      const rawMac = typeof value.macAddress === 'string' ? value.macAddress.replaceAll('-', ':').toLowerCase() : '';
      if (
        typeof value.id !== 'string' ||
        value.id.toLowerCase() !== expectedId.toLowerCase() ||
        value.provisioningState !== 'Succeeded' ||
        typeof value.virtualMachine?.id !== 'string' ||
        value.virtualMachine.id.toLowerCase() !== expectedVm ||
        tags?.['xcsh-managed-by'] !== 'azure-ce' ||
        tags?.['xcsh-deployment-id'] !== plan.deploymentName ||
        tags?.['xcsh-execution-engine'] !== plan.engine ||
        tags?.['xcsh-plan-sha256'] !==
          (replacement?.ownerPlanSha256ByNode[node] ??
            (() => {
              const owners = new Set(
                plan.actions
                  .filter(
                    (action) =>
                      action.kind === 'nic-update' &&
                      action.resourceId?.toLowerCase() === expectedId.toLowerCase() &&
                      action.expectedOwnerPlanSha256,
                  )
                  .map((action) => action.expectedOwnerPlanSha256),
              );
              return owners.size === 1 ? [...owners][0] : plan.planSha256;
            })()) ||
        !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(rawMac)
      )
        throw new Error('Azure NIC ownership or MAC binding is unavailable');
      expectedInterfaces.push({ node, role: nic.role, mac: rawMac });
    }
  const configuration = await runtime.observeRegisteredConfiguration(binding, instances, expectedInterfaces, signal);
  if (replacement && health.status === 'healthy' && configuration.status === 'configured') {
    if (!runtime.observeOwnedSite || !runtime.ownedSiteConfiguration)
      throw new Error('Azure native replacement platform identity observer is unavailable');
    const site = await runtime.observeOwnedSite(binding, signal);
    const siteUid = site.system_metadata?.uid;
    if (
      siteUid !== replacement.siteUid ||
      canonicalSha256(runtime.ownedSiteConfiguration(binding, site)) !== replacement.siteConfigurationSha256
    )
      throw new Error('Azure native replacement changed the logical site identity or configuration');
    const target = `${plan.deploymentName}-${replacement.node}`;
    replacement.status = 'registered';
    replacement.newVmId = instances[target];
    await storage.write(checkpointName(plan), nativeCheckpoint);
  }
  return {
    ...health,
    configuration,
    status: health.status === 'healthy' && configuration.status === 'configured' ? 'healthy' : 'unknown',
  };
}
var lower3 = (value) => (typeof value === 'string' ? value.toLowerCase() : ''),
  checkpointName = (plan) => `native-admission-${plan.planSha256}.json`,
  waitUntil = async (notBefore, signal) => {
    const remaining = notBefore - Date.now();
    if (remaining <= 0) return;
    await new Promise((resolve, reject) => {
      const aborted = () => {
        clearTimeout(timer);
        reject(signal?.reason ?? new Error('Azure native HA admission cancelled'));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', aborted);
        resolve();
      }, remaining);
      signal?.addEventListener('abort', aborted, { once: true });
      if (signal?.aborted) aborted();
    });
  };
var init_native_workflow = __esm(() => {
  init_canonical();
  init_route_server_health();
  init_terraform_upgrade();
});

// plugins/azure/src/ce/platform.ts
function azurePlatformService(pi, signal) {
  const bus = pi.events;
  if (typeof bus?.emit !== 'function') return Promise.reject(new Error('Platform CE v2 service is required'));
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('CE operation cancelled'));
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(new Error('CE operation cancelled'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      reject(new Error('Platform CE v2 service is not loaded'));
    }, 5000);
    signal?.addEventListener('abort', abort, { once: true });
    bus.emit?.('xcsh:ce-platform:v2:service', {
      version: 2,
      resolve: (service) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        resolve(service);
      },
    });
  });
}
function azureTerraformService(pi, signal) {
  const bus = pi.events;
  return new Promise((resolve, reject) => {
    const fail = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', fail);
      reject(new Error('Terraform CE service unavailable or cancelled'));
    };
    const timer = setTimeout(fail, 5000);
    signal?.addEventListener('abort', fail, { once: true });
    if (signal?.aborted || typeof bus?.emit !== 'function') return fail();
    try {
      bus.emit('xcsh:ce-terraform:v1:service', {
        version: 1,
        resolve: (service) => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', fail);
          resolve(service);
        },
      });
    } catch {
      fail();
    }
  });
}

// plugins/azure/src/ce/traffic-source.ts
import { isIP as isIP7 } from 'node:net';

function object8(value, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value;
}
async function read2(api, args, signal) {
  signal?.throwIfAborted();
  const result = await api.exec('az', [...args, '--output', 'json'], signal ? { signal } : undefined);
  signal?.throwIfAborted();
  if (result.exitCode !== 0) throw detectAzError(result.stderr, result.exitCode);
  try {
    return object8(JSON.parse(result.stdout), 'Malformed Azure traffic source observation');
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Malformed Azure traffic source observation');
    throw error;
  }
}
async function observeAzureTrafficSource(plan, api, signal) {
  if (plan.intent.ingress?.mode !== 'platform-http')
    throw new Error('Azure traffic source requires explicit platform HTTP ingress');
  const resourceId = plan.intent.ingress.probe.sourceVmResourceId;
  if (
    !plan.intent.brownfield.resourceIds.some((id) => id.toLowerCase() === resourceId.toLowerCase()) ||
    !plan.ownershipInventory.some(
      (row) =>
        row.resourceId.toLowerCase() === resourceId.toLowerCase() && !row.owned && row.action === 'modify-approved',
    )
  )
    throw new Error('Azure traffic source is outside the reviewed inventory');
  const account = await read2(api, ['account', 'show', '--subscription', plan.subscription.id], signal);
  if (
    typeof account.id !== 'string' ||
    account.id.toLowerCase() !== plan.subscription.id.toLowerCase() ||
    typeof account.tenantId !== 'string' ||
    account.tenantId.toLowerCase() !== plan.subscription.tenantId.toLowerCase() ||
    account.environmentName !== plan.subscription.cloud ||
    account.state !== 'Enabled'
  )
    throw new Error('Azure traffic source account differs from the reviewed deployment');
  const vm = await read2(
    api,
    ['vm', 'show', '--ids', resourceId, '--show-details', '--subscription', plan.subscription.id],
    signal,
  );
  const profile = object8(vm.networkProfile, 'Azure traffic source VM network profile is unavailable');
  const attachments = Array.isArray(profile.networkInterfaces)
    ? profile.networkInterfaces.map((value) => object8(value, 'Malformed Azure traffic source VM attachment'))
    : [];
  const primaryAttachments = attachments.filter((attachment) => attachment.primary === true);
  const attachment =
    primaryAttachments.length === 1
      ? primaryAttachments[0]
      : primaryAttachments.length === 0 && attachments.length === 1
        ? attachments[0]
        : undefined;
  const nicResourceId = attachment?.id;
  const powerState = typeof vm.powerState === 'string' ? vm.powerState.toLowerCase().replace(/^vm\s+/, '') : '';
  if (
    typeof vm.id !== 'string' ||
    vm.id.toLowerCase() !== resourceId.toLowerCase() ||
    typeof vm.vmId !== 'string' ||
    !UUID3.test(vm.vmId) ||
    typeof vm.location !== 'string' ||
    vm.location.toLowerCase() !== plan.region.toLowerCase() ||
    vm.provisioningState !== 'Succeeded' ||
    powerState !== 'running' ||
    typeof nicResourceId !== 'string' ||
    !nicResourceId.toLowerCase().startsWith(`/subscriptions/${plan.subscription.id}/`.toLowerCase())
  )
    throw new Error('Azure traffic source VM identity or readiness differs');
  const nic = await read2(
    api,
    ['network', 'nic', 'show', '--ids', nicResourceId, '--subscription', plan.subscription.id],
    signal,
  );
  const ipConfigurations = Array.isArray(nic.ipConfigurations)
    ? nic.ipConfigurations.map((value) => object8(value, 'Malformed Azure traffic source IP configuration'))
    : [];
  const primaryConfigurations = ipConfigurations.filter((configuration) => configuration.primary === true);
  const configuration =
    primaryConfigurations.length === 1
      ? primaryConfigurations[0]
      : primaryConfigurations.length === 0 && ipConfigurations.length === 1
        ? ipConfigurations[0]
        : undefined;
  const privateAddress = configuration?.privateIPAddress;
  const attachedVm = object8(nic.virtualMachine, 'Azure traffic source NIC attachment is unavailable').id;
  if (
    typeof nic.id !== 'string' ||
    nic.id.toLowerCase() !== nicResourceId.toLowerCase() ||
    nic.provisioningState !== 'Succeeded' ||
    typeof attachedVm !== 'string' ||
    attachedVm.toLowerCase() !== resourceId.toLowerCase() ||
    configuration?.privateIPAddressVersion !== 'IPv4' ||
    typeof privateAddress !== 'string' ||
    isIP7(privateAddress) !== 4
  )
    throw new Error('Azure traffic source NIC identity or private address differs');
  return {
    subscriptionId: plan.subscription.id,
    tenantId: plan.subscription.tenantId,
    cloud: plan.subscription.cloud,
    resourceId,
    vmId: vm.vmId,
    nicResourceId,
    privateAddress,
    source: 'azure-cli-live',
    observedAt: new Date().toISOString(),
  };
}
var UUID3;
var init_traffic_source = __esm(() => {
  init_exec();
  UUID3 = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
});

// plugins/azure/src/ce/platform-ingress.ts
function object9(value, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value;
}
async function optional2(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
}
async function read3(api, args, signal) {
  const result = await api.exec('az', [...args, '--output', 'json'], signal ? { signal } : undefined);
  if (result.exitCode !== 0) throw detectAzError(result.stderr, result.exitCode);
  try {
    return object9(JSON.parse(result.stdout), 'Malformed Azure CE ingress identity observation');
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Malformed Azure CE ingress identity observation');
    throw error;
  }
}
async function observeAzureIngressInterface(plan, api, signal) {
  const sli = plan.nics.filter((nic) => nic.role === 'sli');
  if (sli.length !== 1) throw new Error('Azure platform ingress requires exactly one SLI interface');
  const node = `${plan.deploymentName}-1`;
  const scope = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/`;
  const vmResourceId = `${scope}Microsoft.Compute/virtualMachines/${node}`;
  const nicResourceId = `${scope}Microsoft.Network/networkInterfaces/${node}-nic${sli[0].index}`;
  for (const id of [vmResourceId, nicResourceId])
    if (
      !plan.ownershipInventory.some(
        (row) => row.resourceId.toLowerCase() === id.toLowerCase() && row.owned && row.action !== 'delete',
      )
    )
      throw new Error('Azure platform ingress interface is outside the owned inventory');
  const vm = await read3(api, ['vm', 'show', '--ids', vmResourceId, '--subscription', plan.subscription.id], signal);
  const nic = await read3(
    api,
    ['network', 'nic', 'show', '--ids', nicResourceId, '--subscription', plan.subscription.id],
    signal,
  );
  const vmTags = object9(vm.tags, 'Azure platform ingress VM ownership is unavailable');
  const nicTags = object9(nic.tags, 'Azure platform ingress NIC ownership is unavailable');
  const ownerPlanSha256 = vmTags['xcsh-plan-sha256'];
  const attachments = object9(
    vm.networkProfile,
    'Azure platform ingress VM network profile is unavailable',
  ).networkInterfaces;
  const attached =
    Array.isArray(attachments) &&
    attachments.filter(
      (value) =>
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        typeof value.id === 'string' &&
        String(value.id).toLowerCase() === nicResourceId.toLowerCase(),
    );
  const mac = typeof nic.macAddress === 'string' ? nic.macAddress.replaceAll('-', ':').toLowerCase() : '';
  if (
    typeof vm.id !== 'string' ||
    vm.id.toLowerCase() !== vmResourceId.toLowerCase() ||
    vm.provisioningState !== 'Succeeded' ||
    !Array.isArray(attached) ||
    attached.length !== 1 ||
    typeof nic.id !== 'string' ||
    nic.id.toLowerCase() !== nicResourceId.toLowerCase() ||
    nic.provisioningState !== 'Succeeded' ||
    typeof object9(nic.virtualMachine, 'Azure platform ingress NIC attachment is unavailable').id !== 'string' ||
    String(object9(nic.virtualMachine, 'Azure platform ingress NIC attachment is unavailable').id).toLowerCase() !==
      vmResourceId.toLowerCase() ||
    !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(mac) ||
    typeof ownerPlanSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(ownerPlanSha256) ||
    nicTags['xcsh-plan-sha256'] !== ownerPlanSha256 ||
    [vmTags, nicTags].some(
      (tags) =>
        tags['xcsh-managed-by'] !== 'azure-ce' ||
        tags['xcsh-deployment-id'] !== plan.deploymentName ||
        tags['xcsh-execution-engine'] !== plan.engine,
    )
  )
    throw new Error('Azure platform ingress VM, NIC, or ownership identity differs');
  return { node, mac };
}
async function ensureAzurePlatformIngress(plan, runtime, storage, contract, api, signal) {
  verifyAzureCePlan(plan);
  if (plan.intent.ingress?.mode !== 'platform-http') return;
  await storage.verify();
  const ingress = plan.intent.ingress;
  const source = await observeAzureTrafficSource(plan, api, signal);
  const selected = await observeAzureIngressInterface(plan, api, signal);
  const binding = azureUpgradeBinding(plan);
  const selections = [
    {
      binding,
      node: selected.node,
      mac: selected.mac,
      insideAddress: ingress.listener.privateAddress,
    },
  ];
  const intent = { ...ingress.listener, port: ingress.port, originAddress: source.privateAddress };
  const configurationSha256 = canonicalSha256({ owner: binding.owner, intent });
  const lifecycle = runtime.ingress(contract, storage);
  const saved = await optional2(storage, 'azure-platform-ingress.json');
  let marker;
  if (saved !== undefined) {
    const candidate = object9(saved, 'Malformed Azure platform ingress checkpoint');
    if (
      candidate.schemaVersion !== 1 ||
      candidate.engine !== plan.engine ||
      candidate.configurationSha256 !== configurationSha256 ||
      candidate.contractFingerprint !== contract.fingerprint ||
      !/^[a-f0-9]{24}$/.test(candidate.ingressPlanId)
    )
      throw new Error('Platform ingress checkpoint differs from the owning Azure configuration');
    marker = candidate;
    if (!(await lifecycle.matchesAzure(marker.ingressPlanId, intent, selections, signal))) {
      if (!['replace-node', 'update-network'].includes(plan.intent.operation))
        throw new Error('Azure platform ingress identities changed outside an approved replacement operation');
      await lifecycle.retire(marker.ingressPlanId, signal);
      const replacement = await lifecycle.planAzure(intent, selections, signal);
      marker = { ...marker, ingressPlanId: replacement.id };
      await storage.write('azure-platform-ingress.json', marker);
    }
  } else {
    const ingressPlan = await lifecycle.planAzure(intent, selections, signal);
    marker = {
      schemaVersion: 1,
      engine: plan.engine,
      configurationSha256,
      ingressPlanId: ingressPlan.id,
      contractFingerprint: contract.fingerprint,
    };
    await storage.write('azure-platform-ingress.json', marker);
  }
  const receipt = await lifecycle.apply(marker.ingressPlanId, signal);
  return {
    ingressPlanId: marker.ingressPlanId,
    contractFingerprint: marker.contractFingerprint,
    uid: receipt.uid,
    listener: receipt.listener,
    routes: receipt.routes,
    traffic: receipt.traffic,
    observedAt: receipt.observedAt,
  };
}
var init_platform_ingress = __esm(() => {
  init_exec();
  init_artifacts();
  init_canonical();
  init_terraform_upgrade();
  init_traffic_source();
});

// plugins/azure/src/ce/routing-workflow.ts
async function configureAzureRouteServerRouting(plan, expectedInterfaces, runtime, storage, api, signal, retained) {
  verifyAzureCePlan(plan);
  if (plan.routing.mode !== 'route-server') throw new Error('Azure Route Server routing is not selected');
  const binding = azureUpgradeBinding(plan);
  await storage.verify();
  const observed = await runtime.observeAzureInterfaces(binding, expectedInterfaces, signal);
  if (observed.status !== 'observed') throw new Error('Authoritative Azure platform interface evidence is unavailable');
  const slo = observed.interfaces.filter((item) => item.role === 'slo');
  if (
    slo.length !== binding.nodes.length ||
    binding.nodes.some((node) => slo.filter((item) => item.node === node).length !== 1)
  )
    throw new Error('Exactly one authoritative SLO interface per Azure CE node is required');
  const routeServer = await discoverAzureRouteServerIdentity(plan, api, signal, retained);
  const interfaces = slo.map(({ node, interfaceName }) => ({ node, interfaceName }));
  await runtime.ensureAzureRouting(
    binding,
    plan.routing.localAsn,
    routeServer.asn,
    interfaces,
    routeServer.serviceAddresses,
    (record) => storage.write('platform-routing.json', record),
    signal,
  );
  const expectedSessions = interfaces.flatMap((item) =>
    routeServer.serviceAddresses.map((peerAddress) => ({ ...item, peerAddress })),
  );
  const sessions = await runtime.observeBgpSessions(binding, expectedSessions, signal);
  const effectiveRoutes = await runtime.observeBgpRoutes(binding, signal);
  const cloud = await collectAzureRouteServerHealth(plan, api, signal, retained);
  const routeExchange = cloud.status === 'healthy' ? 'healthy' : 'unknown';
  const evidence = {
    planId: plan.planId,
    planSha256: plan.planSha256,
    engine: plan.engine,
    siteName: plan.siteName,
    routeServerId: routeServer.routeServerId,
    serviceAddresses: routeServer.serviceAddresses,
    status:
      sessions.status === 'healthy' && effectiveRoutes.status === 'observed' && routeExchange === 'healthy'
        ? 'healthy'
        : 'unknown',
    sessions,
    routeExchange,
    effectiveRoutes,
    traffic: cloud.traffic,
    observedAt: new Date().toISOString(),
  };
  await storage.write('route-server-health.json', evidence);
  return evidence;
}
var init_routing_workflow = __esm(() => {
  init_artifacts();
  init_route_server_health();
  init_terraform_upgrade();
});

// plugins/azure/src/ce/terraform-lifecycle.ts
import { createHash as createHash6 } from 'node:crypto';
import { readFile as readFile4 } from 'node:fs/promises';

function lifecycleOperation(plan) {
  if (!['start', 'stop', 'resize'].includes(plan.intent.operation))
    throw new Error('Azure Terraform lifecycle supports start, stop, or resize plans');
  return plan.intent.operation;
}
function mutationFor(plan, node) {
  const operation = lifecycleOperation(plan);
  const action = plan.actions.find(
    (candidate) =>
      candidate.node === node &&
      candidate.kind === (operation === 'start' ? 'vm-start' : operation === 'stop' ? 'vm-stop' : 'vm-resize'),
  );
  const gate = plan.actions.find((candidate) => candidate.node === node && candidate.kind === 'vm-state-gate');
  if (!action?.resourceId || !gate?.expectedOwnerPlanSha256 || !gate.expectedPowerState)
    throw new Error('Azure Terraform lifecycle node identity is incomplete');
  return { action, gate };
}
function configuration(plan, node, includeMutation) {
  const { action } = mutationFor(plan, node);
  const operation = lifecycleOperation(plan);
  const type = operation === 'resize' ? 'azapi_update_resource' : 'azapi_resource_action';
  const value =
    operation === 'resize'
      ? {
          type: `Microsoft.Compute/virtualMachines@${AZURE_COMPUTE_API_VERSION}`,
          resource_id: action.resourceId,
          body: { properties: { hardwareProfile: { vmSize: plan.vm.size } } },
          locks: [action.resourceId],
        }
      : {
          type: `Microsoft.Compute/virtualMachines@${AZURE_COMPUTE_API_VERSION}`,
          resource_id: action.resourceId,
          action: operation === 'stop' ? 'deallocate' : 'start',
          method: 'POST',
          when: 'apply',
          locks: [action.resourceId],
        };
  return JSON.stringify({
    terraform: {
      required_version: `= ${AZURE_CE_TERRAFORM_VERSION}`,
      required_providers: {
        azapi: { source: 'Azure/azapi', version: `= ${AZURE_CE_AZAPI_PROVIDER_VERSION2}` },
      },
    },
    provider: { azapi: { subscription_id: plan.subscription.id, tenant_id: plan.subscription.tenantId } },
    resource: includeMutation ? { [type]: { ce: value } } : {},
  });
}
async function azureTerraformLifecycleDeployment(plan, node, includeMutation = true) {
  verifyAzureCePlan(plan);
  if (plan.engine !== 'terraform') throw new Error('Azure Terraform lifecycle requires Terraform ownership');
  mutationFor(plan, node);
  const stage = `lifecycle-${plan.planSha256.slice(0, 16)}-node-${node}`;
  return {
    schemaVersion: 1,
    deploymentId: plan.deploymentName,
    stage,
    engine: 'terraform',
    scope: { cloud: 'azure', account: plan.subscription.id, region: plan.region },
    terraformVersion: AZURE_CE_TERRAFORM_VERSION,
    configuration: configuration(plan, node, includeMutation),
    providerLock: await readFile4(
      new URL('./assets/plugins/azure/terraform/azapi-provider-lock.hcl', import.meta.url),
      'utf8',
    ),
    backendIdentity: `local:${plan.deploymentName}:stage:${stage}`,
  };
}
function validateReceipt(deployment, receipt, phase, operation) {
  const type = operation === 'resize' ? 'azapi_update_resource' : 'azapi_resource_action';
  const address = `${type}.ce`;
  const allowed = phase === 'mutation' ? ['create', 'update', 'no-op'] : phase === 'release' ? ['delete', 'no-op'] : [];
  if (
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== deployment.deploymentId ||
    receipt.backendIdentity !== deployment.backendIdentity ||
    receipt.configurationSha256 !== digest3(deployment.configuration) ||
    receipt.providerLockSha256 !== digest3(deployment.providerLock) ||
    receipt.operation !== undefined ||
    receipt.actionInvocations?.length ||
    (phase === 'final'
      ? !receipt.noChanges || receipt.changes.length !== 0
      : phase === 'release' && receipt.noChanges && receipt.changes.length === 0
        ? false
        : receipt.changes.length !== 1 ||
          receipt.changes[0].address !== address ||
          receipt.changes[0].type !== type ||
          receipt.changes[0].actions.length !== 1 ||
          !allowed.includes(receipt.changes[0].actions[0]))
  )
    throw new Error(`Azure Terraform lifecycle ${phase} plan differs from the exact isolated action`);
}
async function openStage(terraform, plan, node) {
  const deployment = await azureTerraformLifecycleDeployment(plan, node);
  const owner = azureUpgradeBinding(plan).owner;
  try {
    return { session: await terraform.open(owner, deployment, false), deployment };
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    return { session: await terraform.open(owner, deployment, 'current'), deployment };
  }
}
async function pollVm(plan, gate, api, storage, signal, polling) {
  for (let attempt = 0; attempt < polling.attempts; attempt++) {
    signal?.throwIfAborted();
    const evidence = await collectAzureNativeVmState(plan, gate, api, signal);
    await storage.write(`${plan.planId}-node-${gate.node}-vm-state.json`, evidence);
    if (evidence.status === 'healthy') return evidence;
    if (attempt + 1 < polling.attempts) await polling.wait(polling.intervalMs);
  }
  throw new Error('Observed Azure VM lifecycle state has not converged');
}
async function reconcileInterruptedApply(session, receipt, evidence) {
  if (typeof session.reconcileApplyFromEvidence !== 'function')
    throw new Error('Terraform interrupted apply reconciliation is unavailable');
  await session.reconcileApplyFromEvidence(receipt, canonicalSha256(evidence));
}
async function runAzureTerraformLifecycle(
  plan,
  terraform,
  runtime,
  storage,
  api,
  env,
  signal,
  polling = {
    attempts: 90,
    intervalMs: 1e4,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  },
) {
  verifyAzureCePlan(plan);
  const operation = lifecycleOperation(plan);
  if (plan.engine !== 'terraform' || runtime.engine !== 'terraform' || storage.owner.engine !== 'terraform')
    throw new Error('Only the owning Terraform engine may run Azure lifecycle operations');
  if (!Number.isInteger(polling.attempts) || polling.attempts < 1 || polling.intervalMs < 0)
    throw new Error('Azure Terraform lifecycle convergence bounds are invalid');
  const expectedOwner = azureUpgradeBinding(plan).owner;
  if (canonicalSha256(storage.owner) !== canonicalSha256(expectedOwner))
    throw new Error('Azure Terraform lifecycle storage ownership differs');
  const releaseLock = await acquireProcessLock(`${storage.directory}/.terraform-lifecycle-lock`);
  try {
    await storage.verify();
    const checkpointName = `${plan.planId}-terraform-lifecycle.json`;
    let checkpoint;
    try {
      checkpoint = await storage.read(checkpointName);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      checkpoint = {
        schemaVersion: 1,
        engine: 'terraform',
        planSha256: plan.planSha256,
        completedNodes: [],
        state: 'running',
      };
      await storage.write(checkpointName, checkpoint);
    }
    if (
      checkpoint.schemaVersion !== 1 ||
      checkpoint.engine !== 'terraform' ||
      checkpoint.planSha256 !== plan.planSha256 ||
      !Array.isArray(checkpoint.completedNodes) ||
      checkpoint.completedNodes.some((node, index) => node !== index + 1 || node > plan.topology.nodeCount) ||
      !['running', 'complete'].includes(checkpoint.state)
    )
      throw new Error('Azure Terraform lifecycle checkpoint differs');
    for (let node = 1; node <= plan.topology.nodeCount; node++) {
      const { action, gate } = mutationFor(plan, node);
      await assertActionOwnership(plan, action, api);
      let observed = await collectAzureNativeVmState(plan, gate, api, signal);
      const opened = await openStage(terraform, plan, node);
      const empty = await azureTerraformLifecycleDeployment(plan, node, false);
      let currentSha256 = await opened.session.readConfigurationSha256?.();
      if (!currentSha256) throw new Error('Terraform lifecycle configuration identity is unavailable');
      if (observed.status !== 'healthy') {
        let resumeReceipt;
        if (currentSha256 === digest3(empty.configuration)) {
          await opened.session.reviseConfiguration(currentSha256, opened.deployment.configuration);
          currentSha256 = digest3(opened.deployment.configuration);
        } else if (currentSha256 !== digest3(opened.deployment.configuration)) {
          throw new Error('Terraform lifecycle configuration differs from the isolated action');
        } else {
          try {
            resumeReceipt = await storage.read(`${plan.planId}-node-${node}-mutation-plan.json`);
            validateReceipt(opened.deployment, resumeReceipt, 'mutation', operation);
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
          }
        }
        const receipt = resumeReceipt ?? (await opened.session.plan(env, signal));
        validateReceipt(opened.deployment, receipt, 'mutation', operation);
        if (!resumeReceipt) await storage.write(`${plan.planId}-node-${node}-mutation-plan.json`, receipt);
        if (!receipt.noChanges)
          try {
            await opened.session.apply(receipt, env, signal);
          } catch (error) {
            try {
              observed = await pollVm(plan, gate, api, storage, signal, polling);
            } catch {
              throw error;
            }
            await reconcileInterruptedApply(opened.session, receipt, observed);
          }
        if (observed.status !== 'healthy') observed = await pollVm(plan, gate, api, storage, signal, polling);
      }
      currentSha256 = await opened.session.readConfigurationSha256?.();
      if (!currentSha256) throw new Error('Terraform lifecycle configuration identity is unavailable');
      if (currentSha256 === digest3(opened.deployment.configuration)) {
        try {
          await opened.session.reviseConfiguration(currentSha256, empty.configuration);
        } catch (error) {
          if (!(error instanceof Error) || error.message !== interruptedApplyMessage) throw error;
          const receipt = await storage.read(`${plan.planId}-node-${node}-mutation-plan.json`);
          validateReceipt(opened.deployment, receipt, 'mutation', operation);
          await storage.write(`${plan.planId}-node-${node}-vm-state.json`, observed);
          await reconcileInterruptedApply(opened.session, receipt, observed);
          await opened.session.reviseConfiguration(currentSha256, empty.configuration);
        }
        const release = await opened.session.plan(env, signal);
        validateReceipt(empty, release, 'release', operation);
        await storage.write(`${plan.planId}-node-${node}-release-plan.json`, release);
        if (!release.noChanges) await opened.session.apply(release, env, signal);
      } else if (currentSha256 !== digest3(empty.configuration)) {
        throw new Error('Terraform lifecycle release configuration differs');
      }
      const final = await opened.session.plan(env, signal);
      validateReceipt(empty, final, 'final', operation);
      await storage.write(`${plan.planId}-node-${node}-final-plan.json`, final);
      if (operation !== 'stop') {
        const vms = await listAzureNativeVms(plan, api);
        const health = await collectAzurePlatformHealth(plan, vms, runtime, signal, node);
        await storage.write(`${plan.planId}-node-${node}-platform-health.json`, health);
        if (health.status !== 'healthy') throw new Error('Observed Azure platform health has not converged');
      }
      if (!checkpoint.completedNodes.includes(node)) {
        checkpoint.completedNodes.push(node);
        await storage.write(checkpointName, checkpoint);
      }
    }
    checkpoint.state = 'complete';
    await storage.write(checkpointName, checkpoint);
    return {
      planId: plan.planId,
      planSha256: plan.planSha256,
      engine: 'terraform',
      status: 'complete',
    };
  } finally {
    await releaseLock();
  }
}
var AZURE_CE_AZAPI_PROVIDER_VERSION2 = '2.12.0',
  AZURE_COMPUTE_API_VERSION = '2024-07-01',
  digest3 = (value) => createHash6('sha256').update(value).digest('hex'),
  interruptedApplyMessage = 'Reconcile interrupted Terraform apply before revising configuration';
var init_terraform_lifecycle = __esm(() => {
  init_process_lock();
  init_apply();
  init_artifacts();
  init_canonical();
  init_native_workflow();
  init_terraform_foundation();
  init_terraform_upgrade();
});

// plugins/azure/src/ce/terraform-replacement.ts
import { createHash as createHash7 } from 'node:crypto';

function selectedNode(plan) {
  if (plan.engine !== 'terraform' || plan.intent.operation !== 'replace-node' || !plan.intent.replacementNode)
    throw new Error('Azure Terraform replacement requires one exact selected node');
  return plan.intent.replacementNode;
}
function vmResourceId(plan, node) {
  return `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${plan.deploymentName}-${node}`;
}
function nicResourceId(plan, node, index) {
  return `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Network/networkInterfaces/${plan.deploymentName}-${node}-nic${index}`;
}
function validateBootstrap(value) {
  if (!value.startsWith('#cloud-config') || !value.includes('/etc/vpm/user_data') || /__\w+__/.test(value))
    throw new Error('Azure Terraform replacement requires resolved platform cloud-init');
}
function stages(plan, source, sourceSha256, bootstrap) {
  verifyAzureCePlan(plan);
  const node = selectedNode(plan);
  if (digest4(source) !== sourceSha256) throw new Error('Azure Terraform replacement source configuration changed');
  validateBootstrap(bootstrap);
  const original = object10(JSON.parse(source));
  const resources = object10(original.resource);
  const instances = object10(resources.azurerm_linux_virtual_machine);
  const outputs = object10(object10(object10(original.output).ce_instances).value);
  const name = `node_${node}`;
  const instance = object10(instances[name]);
  const tags = object10(instance.tags);
  const deleteAction = plan.actions.find((action) => action.kind === 'vm-delete' && action.node === node);
  const imageRows = instance.source_image_reference;
  const image = Array.isArray(imageRows) && imageRows.length === 1 ? object10(imageRows[0]) : {};
  const expectedNics = plan.nics.map((nic) => `\${azurerm_network_interface.${name}_nic_${nic.index}.id}`);
  if (
    !deleteAction?.resourceId ||
    lower4(deleteAction.resourceId) !== lower4(vmResourceId(plan, node)) ||
    tags['xcsh-managed-by'] !== 'azure-ce' ||
    tags['xcsh-execution-engine'] !== 'terraform' ||
    tags['xcsh-deployment-id'] !== plan.deploymentName ||
    tags['xcsh-plan-sha256'] !== deleteAction.expectedOwnerPlanSha256 ||
    tags['xcsh-node-index'] !== String(node) ||
    tags['ves-io-site-name'] !== plan.siteName ||
    instance.name !== `${plan.deploymentName}-${node}` ||
    instance.computer_name !== `${plan.deploymentName}-${node}` ||
    instance.size !== plan.vm.size ||
    canonicalSha256(instance.network_interface_ids) !== canonicalSha256(expectedNics) ||
    image.publisher !== plan.image.publisher ||
    image.offer !== plan.image.offer ||
    image.sku !== plan.image.plan ||
    image.version !== plan.image.version ||
    object10(outputs[String(node)]).id !== `\${azurerm_linux_virtual_machine.${name}.id}` ||
    object10(outputs[String(node)]).vm_id !== `\${azurerm_linux_virtual_machine.${name}.virtual_machine_id}`
  )
    throw new Error('Azure Terraform replacement source VM or output binding differs');
  const quiesced = structuredClone(original);
  delete object10(object10(quiesced.resource).azurerm_linux_virtual_machine)[name];
  delete object10(object10(object10(quiesced.output).ce_instances).value)[String(node)];
  const quiesceConfiguration = JSON.stringify(quiesced);
  const launched = structuredClone(original);
  const replacement = object10(object10(object10(launched.resource).azurerm_linux_virtual_machine)[name]);
  replacement.custom_data = Buffer.from(bootstrap).toString('base64');
  object10(replacement.tags)['xcsh-plan-sha256'] = plan.planSha256;
  const launchConfiguration = JSON.stringify(launched);
  const address = `azurerm_linux_virtual_machine.${name}`;
  const make = (phase, configuration, previousConfigurationSha256) => ({
    phase,
    configuration,
    previousConfigurationSha256,
    configurationSha256: digest4(configuration),
    address,
  });
  return {
    quiesce: make('quiesce', quiesceConfiguration, sourceSha256),
    launch: make('launch', launchConfiguration, digest4(quiesceConfiguration)),
  };
}
function validateStageReceipt(plan, stage, receipt) {
  const nonNoop = receipt.changes.filter((change) => change.actions.join(',') !== 'no-op');
  if (
    receipt.schemaVersion !== 1 ||
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== plan.deploymentName ||
    receipt.backendIdentity !== `local:${plan.deploymentName}` ||
    receipt.configurationSha256 !== stage.configurationSha256 ||
    receipt.operation !== undefined ||
    receipt.actionInvocations?.length ||
    nonNoop.some(
      (change) =>
        change.address !== stage.address ||
        change.type !== 'azurerm_linux_virtual_machine' ||
        change.actions.join(',') !== (stage.phase === 'quiesce' ? 'delete' : 'create'),
    ) ||
    nonNoop.length > 1 ||
    (receipt.noChanges ? nonNoop.length !== 0 : nonNoop.length !== 1)
  )
    throw new Error('Azure Terraform replacement saved plan differs from the selected VM stage');
}
async function azJson(api, args, signal) {
  signal?.throwIfAborted();
  const result = await api.exec('az', [...args, '--output', 'json'], signal ? { signal } : undefined);
  if (result.exitCode !== 0) throw new Error('Azure Terraform replacement observation is unavailable');
  try {
    const value = object10(JSON.parse(result.stdout));
    if (value.nextLink !== undefined) throw new Error('Incomplete Azure Terraform replacement observation');
    return value;
  } catch {
    throw new Error('Malformed Azure Terraform replacement observation');
  }
}
async function listVms(plan, api, signal) {
  signal?.throwIfAborted();
  const result = await api.exec(
    'az',
    [
      'vm',
      'list',
      '--resource-group',
      plan.intent.resourceGroup,
      '--show-details',
      '--subscription',
      plan.subscription.id,
      '--output',
      'json',
    ],
    signal ? { signal } : undefined,
  );
  if (result.exitCode !== 0) throw new Error('Azure Terraform replacement VM observation is unavailable');
  try {
    const value = JSON.parse(result.stdout);
    if (!Array.isArray(value)) throw new Error('not an array');
    return value.map((item) => object10(item));
  } catch {
    throw new Error('Malformed Azure Terraform replacement VM observation');
  }
}
async function account(plan, api, signal) {
  signal?.throwIfAborted();
  const result = await api.exec(
    'az',
    ['account', 'show', '--subscription', plan.subscription.id, '--output', 'json'],
    signal ? { signal } : undefined,
  );
  if (result.exitCode !== 0) throw new Error('Azure Terraform replacement account observation is unavailable');
  let value;
  try {
    value = object10(JSON.parse(result.stdout));
  } catch {
    throw new Error('Malformed Azure Terraform replacement account observation');
  }
  if (
    lower4(value.id) !== lower4(plan.subscription.id) ||
    lower4(value.tenantId) !== lower4(plan.subscription.tenantId) ||
    value.environmentName !== plan.subscription.cloud ||
    value.state !== 'Enabled'
  )
    throw new Error('Azure Terraform replacement account differs from the plan');
}
async function initialCloudEvidence(plan, api, signal) {
  await account(plan, api, signal);
  const rows = await listVms(plan, api, signal);
  const oldVmIds = {};
  const ownerPlanSha256ByNode = {};
  const retainedNics = {};
  const selected = selectedNode(plan);
  const deleteAction = plan.actions.find((action) => action.kind === 'vm-delete' && action.node === selected);
  for (let node = 1; node <= plan.topology.nodeCount; node++) {
    const name = `${plan.deploymentName}-${node}`;
    const resourceId = vmResourceId(plan, node);
    const matches = rows.filter((row) => lower4(row.id) === lower4(resourceId));
    const vm = matches.length === 1 ? matches[0] : undefined;
    const tags = vm ? object10(vm.tags) : {};
    const attachments =
      vm && Array.isArray(object10(vm.networkProfile).networkInterfaces)
        ? object10(vm.networkProfile).networkInterfaces.map((item) => lower4(object10(item).id))
        : [];
    const expectedAttachments = plan.nics.map((nic) => lower4(nicResourceId(plan, node, nic.index)));
    const ownerPlanSha256 = tags['xcsh-plan-sha256'];
    if (
      !vm ||
      vm.name !== name ||
      lower4(vm.location) !== lower4(plan.region) ||
      vm.provisioningState !== 'Succeeded' ||
      lower4(object10(vm.hardwareProfile).vmSize) !== lower4(plan.vm.size) ||
      attachments.length !== expectedAttachments.length ||
      expectedAttachments.some((id) => !attachments.includes(id)) ||
      !uuid(vm.vmId) ||
      tags['xcsh-managed-by'] !== 'azure-ce' ||
      tags['xcsh-execution-engine'] !== 'terraform' ||
      tags['xcsh-deployment-id'] !== plan.deploymentName ||
      typeof ownerPlanSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(ownerPlanSha256) ||
      (node === selected && ownerPlanSha256 !== deleteAction?.expectedOwnerPlanSha256)
    )
      throw new Error('Azure Terraform replacement VM identity or ownership is unavailable');
    oldVmIds[name] = vm.vmId;
    ownerPlanSha256ByNode[name] = ownerPlanSha256;
    for (const nic of plan.nics) {
      const id = nicResourceId(plan, node, nic.index);
      const value = await azJson(
        api,
        ['network', 'nic', 'show', '--ids', id, '--subscription', plan.subscription.id],
        signal,
      );
      const nicTags = object10(value.tags);
      const configs = Array.isArray(value.ipConfigurations) ? value.ipConfigurations.map((item) => object10(item)) : [];
      const primary = configs.filter(
        (item) => item.primary === true || (configs.length === 1 && item.primary === undefined),
      );
      const config = primary.length === 1 ? primary[0] : {};
      const mac = lower4(value.macAddress).replaceAll('-', ':');
      const privateIp = config.privateIPAddress;
      const subnetId = object10(config.subnet).id;
      if (
        lower4(value.id) !== lower4(id) ||
        lower4(value.location) !== lower4(plan.region) ||
        value.provisioningState !== 'Succeeded' ||
        lower4(object10(value.virtualMachine).id) !== lower4(resourceId) ||
        nicTags['xcsh-managed-by'] !== 'azure-ce' ||
        nicTags['xcsh-execution-engine'] !== 'terraform' ||
        nicTags['xcsh-deployment-id'] !== plan.deploymentName ||
        typeof nicTags['xcsh-plan-sha256'] !== 'string' ||
        !/^[a-f0-9]{64}$/.test(String(nicTags['xcsh-plan-sha256'])) ||
        !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(mac) ||
        typeof privateIp !== 'string' ||
        config.privateIPAddressVersion !== 'IPv4' ||
        typeof subnetId !== 'string'
      )
        throw new Error('Azure Terraform retained NIC identity is unavailable');
      retainedNics[`${node}:${nic.index}`] = {
        resourceId: id,
        subnetId,
        mac,
        privateIp,
        ownerPlanSha256: String(nicTags['xcsh-plan-sha256']),
      };
    }
  }
  if (new Set(Object.values(oldVmIds).map(lower4)).size !== plan.topology.nodeCount)
    throw new Error('Azure Terraform original VM identities are ambiguous');
  const routeServer =
    plan.routing.mode === 'route-server' ? await captureAzureRouteServerOwnership(plan, api, signal) : undefined;
  return { oldVmIds, ownerPlanSha256ByNode, retainedNics, ...(routeServer ? { routeServer } : {}) };
}
async function currentCloudEvidence(plan, checkpoint, api, phase, signal) {
  await account(plan, api, signal);
  const rows = await listVms(plan, api, signal);
  const selected = selectedNode(plan);
  const currentVmIds = {};
  const expectedInterfaces = [];
  for (let node = 1; node <= plan.topology.nodeCount; node++) {
    const name = `${plan.deploymentName}-${node}`;
    const resourceId = vmResourceId(plan, node);
    const matches = rows.filter((row) => lower4(row.id) === lower4(resourceId));
    if (node === selected && phase === 'quiesced') {
      if (matches.length) throw new Error('Azure Terraform replacement VM deletion has not converged');
    } else {
      if (node === selected && phase === 'launched' && matches.length === 0)
        throw new Error('Azure Terraform replacement VM launch has not converged');
      const vm = matches.length === 1 ? matches[0] : undefined;
      const tags = vm ? object10(vm.tags) : {};
      const attachments =
        vm && Array.isArray(object10(vm.networkProfile).networkInterfaces)
          ? object10(vm.networkProfile).networkInterfaces.map((item) => lower4(object10(item).id))
          : [];
      const expectedAttachments = plan.nics.map((nic) => lower4(nicResourceId(plan, node, nic.index)));
      const expectedOwner =
        node === selected && phase === 'launched' ? plan.planSha256 : checkpoint.ownerPlanSha256ByNode[name];
      if (
        !vm ||
        vm.name !== name ||
        lower4(vm.location) !== lower4(plan.region) ||
        vm.provisioningState !== 'Succeeded' ||
        lower4(object10(vm.hardwareProfile).vmSize) !== lower4(plan.vm.size) ||
        attachments.length !== expectedAttachments.length ||
        expectedAttachments.some((id) => !attachments.includes(id)) ||
        !uuid(vm.vmId) ||
        tags['xcsh-managed-by'] !== 'azure-ce' ||
        tags['xcsh-execution-engine'] !== 'terraform' ||
        tags['xcsh-deployment-id'] !== plan.deploymentName ||
        tags['xcsh-plan-sha256'] !== expectedOwner ||
        (node !== selected && lower4(vm.vmId) !== lower4(checkpoint.oldVmIds[name])) ||
        (node === selected && phase === 'intact' && lower4(vm.vmId) !== lower4(checkpoint.oldVmIds[name])) ||
        (node === selected && phase === 'launched' && lower4(vm.vmId) === lower4(checkpoint.oldVmIds[name]))
      )
        throw new Error('Azure Terraform replacement VM identity changed outside the selected boundary');
      currentVmIds[name] = vm.vmId;
    }
    for (const nic of plan.nics) {
      const key = `${node}:${nic.index}`;
      const expected = checkpoint.retainedNics[key];
      if (!expected) throw new Error('Azure Terraform retained NIC checkpoint is incomplete');
      const value = await azJson(
        api,
        ['network', 'nic', 'show', '--ids', expected.resourceId, '--subscription', plan.subscription.id],
        signal,
      );
      const tags = object10(value.tags);
      const configs = Array.isArray(value.ipConfigurations) ? value.ipConfigurations.map((item) => object10(item)) : [];
      const primary = configs.filter(
        (item) => item.primary === true || (configs.length === 1 && item.primary === undefined),
      );
      const config = primary.length === 1 ? primary[0] : {};
      const attachment = lower4(
        value.virtualMachine && typeof value.virtualMachine === 'object' && !Array.isArray(value.virtualMachine)
          ? value.virtualMachine.id
          : undefined,
      );
      const expectedAttachment = node === selected && phase === 'quiesced' ? '' : lower4(resourceId);
      if (
        lower4(value.id) !== lower4(expected.resourceId) ||
        lower4(value.location) !== lower4(plan.region) ||
        value.provisioningState !== 'Succeeded' ||
        attachment !== expectedAttachment ||
        tags['xcsh-managed-by'] !== 'azure-ce' ||
        tags['xcsh-execution-engine'] !== 'terraform' ||
        tags['xcsh-deployment-id'] !== plan.deploymentName ||
        tags['xcsh-plan-sha256'] !== expected.ownerPlanSha256 ||
        lower4(value.macAddress).replaceAll('-', ':') !== expected.mac ||
        config.privateIPAddress !== expected.privateIp ||
        lower4(object10(config.subnet).id) !== lower4(expected.subnetId)
      )
        throw new Error('Azure Terraform retained NIC identity, attachment, or address changed');
      if (nic.role === 'slo' || nic.role === 'data' || nic.role === 'sli')
        expectedInterfaces.push({ node: name, role: nic.role, mac: expected.mac });
    }
  }
  return { currentVmIds, expectedInterfaces, observedAt: new Date().toISOString() };
}
async function validateOutputs(plan, session, checkpoint, currentVmIds, env, signal) {
  const outputs = await session.readOutputs(['ce_instances', 'ce_interfaces'], env, signal);
  const instances = object10(outputs.ce_instances, 'Azure Terraform replacement instance outputs are unavailable');
  const interfaces = object10(outputs.ce_interfaces, 'Azure Terraform replacement interface outputs are unavailable');
  if (
    Object.keys(instances).sort().join(',') !==
      Array.from({ length: plan.topology.nodeCount }, (_, index) => String(index + 1)).join(',') ||
    Object.keys(interfaces).sort().join(',') !== Object.keys(checkpoint.retainedNics).sort().join(',')
  )
    throw new Error('Azure Terraform replacement output inventory is incomplete');
  for (let node = 1; node <= plan.topology.nodeCount; node++) {
    const name = `${plan.deploymentName}-${node}`;
    const instance = object10(instances[String(node)]);
    if (
      lower4(instance.id) !== lower4(vmResourceId(plan, node)) ||
      lower4(instance.vm_id) !== lower4(currentVmIds[name]) ||
      instance.site_name !== plan.siteName ||
      instance.hostname !== name
    )
      throw new Error('Azure Terraform replacement VM output differs from live identity');
    for (const nic of plan.nics) {
      const key = `${node}:${nic.index}`;
      const expected = checkpoint.retainedNics[key];
      const value = object10(interfaces[key]);
      if (
        lower4(value.id) !== lower4(expected.resourceId) ||
        lower4(value.subnet_id) !== lower4(expected.subnetId) ||
        value.site_name !== plan.siteName ||
        value.node !== node ||
        value.index !== nic.index ||
        value.role !== nic.role
      )
        throw new Error('Azure Terraform replacement retained-interface output differs');
    }
  }
  return outputs;
}
function validateCheckpoint(plan, value) {
  const checkpoint = object10(value);
  const nodes = Array.from({ length: plan.topology.nodeCount }, (_, index) => `${plan.deploymentName}-${index + 1}`);
  const nicKeys = nodes.flatMap((_name, index) => plan.nics.map((nic) => `${index + 1}:${nic.index}`));
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.engine !== 'terraform' ||
    checkpoint.planSha256 !== plan.planSha256 ||
    checkpoint.node !== selectedNode(plan) ||
    !['prepared', 'quiesced', 'launched', 'complete'].includes(checkpoint.phase) ||
    [
      checkpoint.sourceConfigurationSha256,
      checkpoint.quiesceConfigurationSha256,
      checkpoint.launchConfigurationSha256,
      checkpoint.bootstrapSha256,
      checkpoint.siteConfigurationSha256,
    ].some((item) => !/^[a-f0-9]{64}$/.test(item)) ||
    !checkpoint.siteUid ||
    Object.keys(checkpoint.oldVmIds).sort().join(',') !== [...nodes].sort().join(',') ||
    Object.keys(checkpoint.ownerPlanSha256ByNode).sort().join(',') !== [...nodes].sort().join(',') ||
    Object.keys(checkpoint.retainedNics).sort().join(',') !== [...nicKeys].sort().join(',') ||
    Object.values(checkpoint.oldVmIds).some((item) => !uuid(item)) ||
    Object.values(checkpoint.ownerPlanSha256ByNode).some((item) => !/^[a-f0-9]{64}$/.test(item)) ||
    nicKeys.some((key) => {
      const nic = checkpoint.retainedNics[key];
      const [node, index] = key.split(':').map(Number);
      return (
        !nic ||
        lower4(nic.resourceId) !== lower4(nicResourceId(plan, node, index)) ||
        !lower4(nic.subnetId).startsWith(`/subscriptions/${plan.subscription.id}/`.toLowerCase()) ||
        !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(nic.mac) ||
        typeof nic.privateIp !== 'string' ||
        !/^[a-f0-9]{64}$/.test(nic.ownerPlanSha256)
      );
    }) ||
    (plan.routing.mode === 'route-server') !== Boolean(checkpoint.routeServer) ||
    (checkpoint.routeServer !== undefined &&
      (lower4(checkpoint.routeServer.routeServerId) !==
        lower4(
          `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Network/virtualHubs/${plan.deploymentName}-rs`,
        ) ||
        !/^[a-f0-9]{64}$/.test(checkpoint.routeServer.ownerPlanSha256) ||
        Object.keys(checkpoint.routeServer.peerIds).sort().join(',') !==
          Array.from({ length: plan.topology.nodeCount }, (_, index) => String(index + 1)).join(',') ||
        Object.entries(checkpoint.routeServer.peerIds).some(
          ([node, id]) =>
            lower4(id) !==
            lower4(`${checkpoint.routeServer?.routeServerId}/bgpConnections/${plan.deploymentName}-${node}`),
        ))) ||
    (checkpoint.phase === 'prepared' || checkpoint.phase === 'quiesced'
      ? checkpoint.newVmId !== undefined
      : !uuid(checkpoint.newVmId)) ||
    (checkpoint.newVmId !== undefined &&
      lower4(checkpoint.newVmId) === lower4(checkpoint.oldVmIds[`${plan.deploymentName}-${checkpoint.node}`]))
  )
    throw new Error('Azure Terraform replacement checkpoint differs from the immutable plan');
  return checkpoint;
}
async function applyStage(plan, session, stage, storage, api, checkpoint, env, signal) {
  const evidencePhase = stage.phase === 'quiesce' ? 'quiesced' : 'launched';
  let currentSha256 = await session.readConfigurationSha256?.();
  if (!currentSha256) throw new Error('Terraform replacement configuration identity is unavailable');
  const receiptName = `${plan.planId}-terraform-${stage.phase}-plan.json`;
  if (currentSha256 === stage.configurationSha256) {
    try {
      const previous = object10(await storage.read(receiptName));
      const receipt = previous.receipt;
      validateStageReceipt(plan, stage, receipt);
      const evidence = await currentCloudEvidence(plan, checkpoint, api, evidencePhase, signal);
      await session.reconcileApplyFromEvidence(receipt, canonicalSha256(evidence));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        if (!(error instanceof Error) || !error.message.includes('has not converged')) throw error;
      }
    }
  } else if (currentSha256 === stage.previousConfigurationSha256) {
    await currentCloudEvidence(plan, checkpoint, api, stage.phase === 'quiesce' ? 'intact' : 'quiesced', signal);
    await session.reviseConfiguration(currentSha256, stage.configuration);
    currentSha256 = stage.configurationSha256;
  } else {
    throw new Error('Terraform replacement configuration differs from the persisted stage');
  }
  const receipt = await session.plan(env, signal);
  validateStageReceipt(plan, stage, receipt);
  const identities = await session.readPlannedResourceIds(receipt, [stage.address], env, signal);
  const expectedId = vmResourceId(plan, selectedNode(plan));
  if (
    (!receipt.noChanges && stage.phase === 'quiesce' && lower4(identities[stage.address]) !== lower4(expectedId)) ||
    (!receipt.noChanges && stage.phase === 'launch' && identities[stage.address] !== null)
  )
    throw new Error('Azure Terraform replacement saved plan targets a different VM identity');
  await storage.write(receiptName, { receipt, identities });
  if (!receipt.noChanges) {
    try {
      await session.apply(receipt, env, signal);
    } catch {
      const evidence = await currentCloudEvidence(plan, checkpoint, api, evidencePhase, signal);
      await storage.write(`${plan.planId}-terraform-${stage.phase}-recovery.json`, evidence);
      await session.reconcileApplyFromEvidence(receipt, canonicalSha256(evidence));
      return evidence;
    }
  }
  return currentCloudEvidence(plan, checkpoint, api, evidencePhase, signal);
}
async function runAzureTerraformReplacement(plan, terraform, runtime, storage, api, env, signal, acceptIngress) {
  verifyAzureCePlan(plan);
  const node = selectedNode(plan);
  if (runtime.engine !== 'terraform' || storage.owner.engine !== 'terraform')
    throw new Error('Only the owning Terraform engine may replace an Azure node');
  if (canonicalSha256(storage.owner) !== canonicalSha256(azureUpgradeBinding(plan).owner))
    throw new Error('Azure Terraform replacement storage ownership differs');
  runtime.requireBootstrapContract('azure');
  if (plan.routing.mode === 'route-server') runtime.requireRoutingContract('azure');
  const release = await acquireProcessLock(`${storage.directory}/.terraform-replacement-lock`);
  try {
    await storage.verify();
    const session = await terraform.open(
      azureUpgradeBinding(plan).owner,
      await azureTerraformCurrentDeployment(plan),
      'current',
    );
    let checkpoint;
    let source;
    let bootstrap;
    try {
      checkpoint = validateCheckpoint(plan, await storage.read(checkpointName2(plan)));
      const snapshot = object10(await storage.read(sourceName(plan)));
      if (
        snapshot.planSha256 !== plan.planSha256 ||
        typeof snapshot.source !== 'string' ||
        typeof snapshot.bootstrap !== 'string' ||
        digest4(snapshot.source) !== checkpoint.sourceConfigurationSha256 ||
        digest4(snapshot.bootstrap) !== checkpoint.bootstrapSha256
      )
        throw new Error('Azure Terraform replacement private source snapshot differs');
      source = snapshot.source;
      bootstrap = snapshot.bootstrap;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const sourceConfigurationSha256 = await session.readConfigurationSha256?.();
      if (!sourceConfigurationSha256)
        throw new Error('Terraform replacement source configuration identity is unavailable');
      source = await session.readConfiguration(sourceConfigurationSha256);
      const cloud = await initialCloudEvidence(plan, api, signal);
      const binding = azureUpgradeBinding(plan);
      const site = await runtime.observeOwnedSite(binding, signal);
      const siteUid = object10(site.system_metadata).uid;
      if (typeof siteUid !== 'string' || !siteUid)
        throw new Error('Azure Terraform replacement site UID is unavailable');
      const siteConfigurationSha256 = canonicalSha256(runtime.ownedSiteConfiguration(binding, site));
      const nodeName = `${plan.deploymentName}-${node}`;
      const tokenName = `${plan.deploymentName.slice(0, 40)}-${node}-${plan.planSha256.slice(0, 12)}`;
      bootstrap = await runtime.bootstrap(
        binding,
        nodeName,
        tokenName,
        (secret) => storage.write(`${tokenName}.json`, secret),
        signal,
      );
      const built = stages(plan, source, sourceConfigurationSha256, bootstrap);
      checkpoint = {
        schemaVersion: 1,
        engine: 'terraform',
        planSha256: plan.planSha256,
        node,
        sourceConfigurationSha256,
        quiesceConfigurationSha256: built.quiesce.configurationSha256,
        launchConfigurationSha256: built.launch.configurationSha256,
        bootstrapSha256: digest4(bootstrap),
        siteUid,
        siteConfigurationSha256,
        ...cloud,
        phase: 'prepared',
      };
      await storage.write(sourceName(plan), { schemaVersion: 1, planSha256: plan.planSha256, source, bootstrap });
      await storage.write(checkpointName2(plan), checkpoint);
    }
    const built = stages(plan, source, checkpoint.sourceConfigurationSha256, bootstrap);
    if (
      built.quiesce.configurationSha256 !== checkpoint.quiesceConfigurationSha256 ||
      built.launch.configurationSha256 !== checkpoint.launchConfigurationSha256
    )
      throw new Error('Azure Terraform replacement stage configuration changed');
    if (checkpoint.phase === 'prepared') {
      await applyStage(plan, session, built.quiesce, storage, api, checkpoint, env, signal);
      checkpoint.phase = 'quiesced';
      await storage.write(checkpointName2(plan), checkpoint);
    }
    let launchEvidence;
    if (checkpoint.phase === 'quiesced') {
      launchEvidence = await applyStage(plan, session, built.launch, storage, api, checkpoint, env, signal);
      const target = `${plan.deploymentName}-${node}`;
      checkpoint.newVmId = launchEvidence.currentVmIds[target];
      if (!uuid(checkpoint.newVmId)) throw new Error('Azure Terraform replacement VM UUID is unavailable');
      checkpoint.phase = 'launched';
      await storage.write(checkpointName2(plan), checkpoint);
    } else {
      launchEvidence = await currentCloudEvidence(plan, checkpoint, api, 'launched', signal);
    }
    const target = `${plan.deploymentName}-${node}`;
    if (lower4(launchEvidence.currentVmIds[target]) !== lower4(checkpoint.newVmId))
      throw new Error('Azure Terraform replacement VM UUID changed after launch');
    await validateOutputs(plan, session, checkpoint, launchEvidence.currentVmIds, env, signal);
    const binding = azureUpgradeBinding(plan);
    await runtime.approveRegistrations(
      binding,
      launchEvidence.currentVmIds,
      (record) => storage.write(`${plan.planId}-terraform-replacement-registration.json`, record),
      signal,
      binding.nodes,
    );
    const vms = await listVms(plan, api, signal);
    const expectedOwners = {
      ...checkpoint.ownerPlanSha256ByNode,
      [target]: plan.planSha256,
    };
    const health = await collectAzurePlatformHealth(
      plan,
      vms,
      runtime,
      signal,
      plan.topology.nodeCount,
      expectedOwners,
    );
    const configuration = await runtime.observeRegisteredConfiguration(
      binding,
      launchEvidence.currentVmIds,
      launchEvidence.expectedInterfaces,
      signal,
    );
    if (health.status !== 'healthy' || configuration.status !== 'configured')
      throw new Error('Azure Terraform replacement registration or configuration has not converged');
    const site = await runtime.observeOwnedSite(binding, signal);
    if (
      object10(site.system_metadata).uid !== checkpoint.siteUid ||
      canonicalSha256(runtime.ownedSiteConfiguration(binding, site)) !== checkpoint.siteConfigurationSha256
    )
      throw new Error('Azure Terraform replacement changed the logical site identity or configuration');
    let routing = 'unknown';
    if (plan.routing.mode === 'route-server') {
      const evidence = await configureAzureRouteServerRouting(
        plan,
        launchEvidence.expectedInterfaces,
        runtime,
        storage,
        api,
        signal,
        checkpoint.routeServer,
      );
      if (evidence.status !== 'healthy') throw new Error('Azure replacement Route Server routing has not converged');
      routing = 'healthy';
    }
    let traffic = 'unknown';
    let ingress;
    if (plan.intent.ingress?.mode === 'platform-http') {
      if (!acceptIngress) throw new Error('Azure Terraform replacement ingress acceptance driver is unavailable');
      ({ ingress, traffic } = await acceptIngress());
    }
    const final = await session.plan(env, signal);
    validateStageReceipt(plan, built.launch, final);
    if (!final.noChanges || final.changes.some((change) => change.actions.join(',') !== 'no-op'))
      throw new Error('Azure Terraform replacement requires a final refresh-enabled no-change plan');
    await storage.write(`${plan.planId}-terraform-replacement-final-plan.json`, final);
    checkpoint.phase = 'complete';
    await storage.write(checkpointName2(plan), checkpoint);
    return {
      planId: plan.planId,
      planSha256: plan.planSha256,
      engine: 'terraform',
      status: 'complete',
      replacedNode: node,
      oldVmId: checkpoint.oldVmIds[target],
      newVmId: checkpoint.newVmId,
      retainedInterfaces: Object.values(checkpoint.retainedNics).map(({ resourceId, subnetId, mac, privateIp }) => ({
        resourceId,
        subnetId,
        mac,
        privateIp,
      })),
      siteUid: checkpoint.siteUid,
      health,
      configuration,
      routing,
      traffic,
      ...(ingress ? { ingress } : {}),
      terraformNoChanges: true,
    };
  } finally {
    await release();
  }
}
var digest4 = (value) => createHash7('sha256').update(value).digest('hex'),
  lower4 = (value) => (typeof value === 'string' ? value.toLowerCase() : ''),
  uuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value),
  object10 = (value, message = 'Malformed Azure Terraform replacement data') => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
    return value;
  },
  checkpointName2 = (plan) => `${plan.planId}-terraform-replacement.json`,
  sourceName = (plan) => `${plan.planId}-terraform-replacement-source.json`;
var init_terraform_replacement = __esm(() => {
  init_process_lock();
  init_artifacts();
  init_canonical();
  init_route_server_health();
  init_routing_workflow();
  init_terraform_foundation();
  init_terraform_upgrade();
});

// plugins/azure/src/ce/terraform-retirement.ts
async function assertAzureTerraformDeploymentActive(store) {
  await store.verify();
  for (const name of [
    marker,
    'azure-terraform-foundation-teardown-checkpoint.json',
    'azure-terraform-teardown-receipt.json',
  ]) {
    try {
      await store.read(name);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    throw Error('Azure Terraform retirement has started; resume teardown instead of deployment');
  }
}
async function beginAzureTerraformRetirement(base, teardown, store) {
  await store.verify();
  if (
    base.engine !== 'terraform' ||
    teardown.sourcePlanSha256 !== base.planSha256 ||
    !/^[a-f0-9]{64}$/.test(teardown.planSha256) ||
    canonicalSha256(store.owner) !== canonicalSha256(azureUpgradeBinding(base).owner)
  )
    throw Error('Azure Terraform retirement owner or source differs');
  const value = {
    schemaVersion: 1,
    engine: 'terraform',
    owner: store.owner,
    sourcePlanSha256: base.planSha256,
    teardownPlanSha256: teardown.planSha256,
    kind: teardown.kind,
  };
  let existing;
  try {
    existing = await store.read(marker);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (existing !== undefined && canonicalSha256(existing) !== canonicalSha256(value))
    throw Error('Azure Terraform retirement belongs to another immutable teardown');
  if (existing === undefined) await store.write(marker, value);
}
var marker = 'azure-terraform-lifecycle-retirement.json';
var init_terraform_retirement = __esm(() => {
  init_canonical();
  init_terraform_upgrade();
});

// plugins/azure/src/ce/terraform-identities.ts
import { isIP as isIP8 } from 'node:net';

async function discoverAzureTerraformInterfaces(plan, outputs, api, signal) {
  if (plan.engine !== 'terraform') throw new Error('Azure interface discovery requires Terraform ownership');
  const observedAt = new Date().toISOString();
  const run = async (args) => {
    signal?.throwIfAborted();
    const result = await api.exec('az', [...args, '--subscription', plan.subscription.id, '--output', 'json'], {
      signal,
    });
    signal?.throwIfAborted();
    if (result.exitCode !== 0) throw new Error('Azure Terraform interface observation unavailable');
    let value;
    try {
      value = object11(JSON.parse(result.stdout));
    } catch {
      throw new Error('Malformed Azure Terraform interface observation');
    }
    if (!Object.keys(value).length || value.nextLink)
      throw new Error('Incomplete Azure Terraform interface observation');
    return value;
  };
  const account = await run(['account', 'show']);
  if (
    lower5(account.id) !== lower5(plan.subscription.id) ||
    lower5(account.tenantId) !== lower5(plan.subscription.tenantId) ||
    account.environmentName !== plan.subscription.cloud ||
    account.state !== 'Enabled'
  )
    throw new Error('Azure Terraform observation account differs from deployment');
  const scope = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/`;
  const instances = object11(outputs.ce_instances);
  const candidates = object11(outputs.ce_interfaces);
  if (
    ![1, 3].includes(plan.topology.nodeCount) ||
    plan.nics.length < 1 ||
    plan.nics.some((nic, index) => nic.index !== index) ||
    Object.keys(instances).length !== plan.topology.nodeCount ||
    Object.keys(candidates).length !== plan.topology.nodeCount * plan.nics.length
  )
    throw new Error('Terraform Azure node/interface inventory is incomplete');
  const owned = async (kind, id) => {
    if (!lower5(id).startsWith(lower5(scope))) throw new Error('Terraform Azure resource is outside deployment scope');
    const value = await run([...(kind === 'nic' ? ['network', 'nic'] : ['vm']), 'show', '--ids', id]);
    const tags = object11(value.tags);
    if (
      lower5(value.id) !== lower5(id) ||
      lower5(value.location) !== lower5(plan.region) ||
      value.provisioningState !== 'Succeeded' ||
      tags['xcsh-managed-by'] !== 'azure-ce' ||
      tags['xcsh-execution-engine'] !== 'terraform' ||
      tags['xcsh-deployment-id'] !== plan.deploymentName ||
      tags['xcsh-plan-sha256'] !== plan.planSha256
    )
      throw new Error('Azure Terraform resource identity, readiness, or ownership differs');
    return value;
  };
  const interfaces = [];
  const macs = new Set();
  const vmIds = new Set();
  for (let node = 1; node <= plan.topology.nodeCount; node++) {
    const instance = object11(instances[String(node)]);
    const plannedVms = plan.actions.filter((action) => action.kind === 'vm-create' && action.node === node);
    if (
      plannedVms.length !== 1 ||
      !plannedVms[0].resourceId ||
      lower5(instance.id) !== lower5(plannedVms[0].resourceId) ||
      !uuid2(instance.vm_id) ||
      instance.site_name !== plan.siteName ||
      instance.hostname !== `${plan.deploymentName}-${node}`
    )
      throw new Error('Terraform Azure VM locator differs from planned identity');
    const vmResourceId = plannedVms[0].resourceId;
    const vm = await owned('vm', vmResourceId);
    if (!uuid2(vm.vmId) || lower5(vm.vmId) !== lower5(instance.vm_id) || vmIds.has(lower5(vm.vmId)))
      throw new Error('Terraform Azure VM instance identity is stale or ambiguous');
    vmIds.add(lower5(vm.vmId));
    const attachments = object11(vm.networkProfile).networkInterfaces;
    if (!Array.isArray(attachments) || attachments.length !== plan.nics.length)
      throw new Error('Azure VM NIC attachment inventory is incomplete');
    const attachedIds = attachments.map((entry) => lower5(object11(entry).id));
    if (attachedIds.some((id) => !id) || new Set(attachedIds).size !== attachedIds.length)
      throw new Error('Azure VM NIC attachment inventory is ambiguous');
    for (const nic of plan.nics) {
      const candidate = object11(candidates[`${node}:${nic.index}`]);
      const plannedSubnets = plan.actions.filter(
        (action) =>
          action.kind === 'subnet-create' &&
          nic.subnet.name &&
          action.args?.includes('--name') &&
          action.args[action.args.indexOf('--name') + 1] === nic.subnet.name,
      );
      const subnetId =
        nic.subnet.resourceId ?? (plannedSubnets.length === 1 ? plannedSubnets[0].resourceId : undefined);
      const plannedNics = plan.actions.filter(
        (action) =>
          action.kind === 'nic-create' &&
          action.node === node &&
          action.args?.[action.args.indexOf('--name') + 1] === `${plan.deploymentName}-${node}-nic${nic.index}`,
      );
      if (
        plannedNics.length !== 1 ||
        !plannedNics[0].resourceId ||
        lower5(candidate.id) !== lower5(plannedNics[0].resourceId) ||
        candidate.node !== node ||
        candidate.index !== nic.index ||
        candidate.role !== nic.role ||
        candidate.site_name !== plan.siteName ||
        typeof candidate.subnet_id !== 'string' ||
        !subnetId ||
        lower5(candidate.subnet_id) !== lower5(subnetId) ||
        !lower5(subnetId).startsWith(`/subscriptions/${plan.subscription.id}/`.toLowerCase()) ||
        !attachedIds.includes(lower5(candidate.id))
      )
        throw new Error('Terraform Azure interface locator differs from planned identity');
      const resourceId = plannedNics[0].resourceId;
      const current = await owned('nic', resourceId);
      const mac = lower5(current.macAddress).replaceAll('-', ':');
      if (
        lower5(object11(current.virtualMachine).id) !== lower5(vmResourceId) ||
        !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(mac) ||
        macs.has(mac)
      )
        throw new Error('Azure NIC attachment or MAC is missing or ambiguous');
      const configs = current.ipConfigurations;
      if (!Array.isArray(configs)) throw new Error('Azure NIC IP configurations unavailable');
      const primary = configs
        .map(object11)
        .filter((config) => config.primary === true || (configs.length === 1 && config.primary === undefined));
      const config = primary[0] ?? {};
      if (
        primary.length !== 1 ||
        config.privateIPAddressVersion !== 'IPv4' ||
        typeof config.privateIPAddress !== 'string' ||
        isIP8(config.privateIPAddress) !== 4 ||
        lower5(object11(config.subnet).id) !== lower5(candidate.subnet_id) ||
        (nic.subnet.resourceId && lower5(candidate.subnet_id) !== lower5(nic.subnet.resourceId))
      )
        throw new Error('Azure NIC primary address or subnet binding differs');
      macs.add(mac);
      interfaces.push({
        resourceId,
        subnetId: candidate.subnet_id,
        vmResourceId,
        vmId: String(vm.vmId),
        siteName: plan.siteName,
        node,
        index: nic.index,
        role: nic.role,
        mac,
        privateIp: config.privateIPAddress,
      });
    }
  }
  return {
    source: 'azure:account-show+vm-show+network-nic-show',
    observedAt,
    planId: plan.planId,
    planSha256: plan.planSha256,
    engine: plan.engine,
    subscriptionId: plan.subscription.id,
    tenantId: plan.subscription.tenantId,
    cloud: plan.subscription.cloud,
    region: plan.region,
    interfaces,
  };
}
var object11 = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {}),
  lower5 = (value) => (typeof value === 'string' ? value.toLowerCase() : ''),
  uuid2 = (value) => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
var init_terraform_identities = () => {};

// plugins/azure/src/ce/terraform-workflow.ts
import { createHash as createHash8 } from 'node:crypto';

async function runAzureTerraformAdmission(
  plan,
  terraform,
  runtime,
  storage,
  api,
  revalidate,
  env,
  signal,
  haSerialDelayMs = 180000,
  acceptIngress,
) {
  verifyAzureCePlan(plan);
  if (plan.engine !== 'terraform' || runtime.engine !== 'terraform')
    throw new Error('Azure Terraform workflow requires Terraform ownership');
  assertAzureCeRoutingExecutable(plan);
  runtime.requireBootstrapContract('azure');
  if (plan.routing.mode === 'route-server') runtime.requireRoutingContract('azure');
  const binding = azureUpgradeBinding(plan);
  const initial = renderAzureTerraformFoundation(plan);
  await storage.verify();
  let checkpoint;
  try {
    checkpoint = await storage.read('terraform-workflow.json');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    checkpoint = {
      schemaVersion: 1,
      engine: 'terraform',
      planSha256: plan.planSha256,
      configurationSha256: hash2(initial),
      bootstrapByNode: {},
      launchedAtByNode: {},
      stage: 'network-pending',
    };
    await storage.write('terraform-workflow.json', checkpoint);
  }
  checkpoint.launchedAtByNode ??= {};
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.engine !== 'terraform' ||
    checkpoint.planSha256 !== plan.planSha256 ||
    !/^[a-f0-9]{64}$/.test(checkpoint.configurationSha256) ||
    !checkpoint.bootstrapByNode ||
    typeof checkpoint.bootstrapByNode !== 'object' ||
    Object.keys(checkpoint.bootstrapByNode).some(
      (node, index) => !/^[1-3]$/.test(node) || Number(node) > plan.topology.nodeCount || Number(node) !== index + 1,
    ) ||
    !checkpoint.launchedAtByNode ||
    typeof checkpoint.launchedAtByNode !== 'object' ||
    Object.entries(checkpoint.launchedAtByNode).some(
      ([node, launchedAt]) =>
        !/^[1-3]$/.test(node) ||
        Number(node) > plan.topology.nodeCount ||
        !checkpoint.bootstrapByNode[node] ||
        Number.isNaN(Date.parse(launchedAt)),
    ) ||
    !['network-pending', 'registration-pending', 'registered'].includes(checkpoint.stage)
  )
    throw new Error('Azure Terraform workflow checkpoint differs from the owning plan');
  const save = () => storage.write('terraform-workflow.json', checkpoint);
  signal?.throwIfAborted();
  let session;
  if (checkpoint.stage === 'network-pending') {
    const deployment = await azureTerraformFoundationDeployment(plan);
    try {
      session = await terraform.open(binding.owner, deployment, false);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      session = await terraform.open(binding.owner, deployment, 'current');
    }
    const reviseConfiguration = async (configuration) => {
      const nextHash = hash2(configuration);
      if (checkpoint.configurationSha256 === nextHash) return;
      try {
        await session.reviseConfiguration(checkpoint.configurationSha256, configuration);
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('revision is stale')) throw error;
        await session.reviseConfiguration(nextHash, configuration);
      }
      checkpoint.configurationSha256 = nextHash;
      await save();
    };
    await reviseConfiguration(renderAzureTerraformFoundation(plan, checkpoint.bootstrapByNode));
    await revalidate();
    const receipt = await session.plan(env, signal);
    if (
      receipt.changes.some((change) =>
        change.actions.some(
          (action) =>
            !['create', 'read', 'no-op'].includes(action) &&
            !(change.address === 'azapi_resource_action.marketplace_terms' && action === 'update'),
        ),
      )
    )
      throw new Error('Azure Terraform foundation would mutate existing resources');
    await storage.write('terraform-foundation-plan.json', receipt);
    await storage.verify();
    await revalidate();
    if (!receipt.noChanges) await session.apply(receipt, env, signal);
    await storage.verify();
    await revalidate();
    await runtime.reserveSite(
      binding,
      (record) => storage.write('terraform-site.json', record),
      signal,
      plan.intent.workloadFixture ? [plan.intent.workloadFixture.cidr] : [],
    );
    for (let node = 1; node <= plan.topology.nodeCount; node++) {
      signal?.throwIfAborted();
      await storage.verify();
      await revalidate();
      const previous = node - 1;
      if (plan.topology.ha && previous > 0) {
        const launchedAt = checkpoint.launchedAtByNode[String(previous)];
        if (!launchedAt) throw new Error('Prior Azure HA node launch boundary is unavailable');
        await waitUntil2(Date.parse(launchedAt) + haSerialDelayMs, signal);
      }
      if (!checkpoint.bootstrapByNode[String(node)]) {
        const nodeName = `${plan.deploymentName}-${node}`;
        const tokenName = `${plan.deploymentName.slice(0, 40)}-${node}-${plan.planSha256.slice(0, 12)}`;
        checkpoint.bootstrapByNode[String(node)] = await runtime.bootstrap(
          binding,
          nodeName,
          tokenName,
          (secret) => storage.write(`${tokenName}.json`, secret),
          signal,
        );
        await save();
      }
      const admittedBootstrap = Object.fromEntries(
        Array.from({ length: node }, (_, index) => {
          const current = String(index + 1);
          return [current, checkpoint.bootstrapByNode[current]];
        }),
      );
      const configuration = renderAzureTerraformFoundation(plan, admittedBootstrap);
      const nextHash = hash2(configuration);
      if (checkpoint.configurationSha256 !== nextHash) {
        try {
          await session.reviseConfiguration(checkpoint.configurationSha256, configuration);
        } catch (error) {
          if (!(error instanceof Error) || !error.message.includes('revision is stale')) throw error;
          await session.reviseConfiguration(nextHash, configuration);
        }
        checkpoint.configurationSha256 = nextHash;
        await save();
      }
      const admission = await session.plan(env, signal);
      if (
        admission.changes.some((change) =>
          change.actions.some(
            (action) =>
              !['create', 'read', 'no-op'].includes(action) &&
              !(change.address === 'azapi_resource_action.marketplace_terms' && action === 'update'),
          ),
        )
      )
        throw new Error('Azure Terraform admission would alter or replace an existing resource');
      await storage.write(`terraform-admission-plan-node-${node}.json`, admission);
      await storage.verify();
      await revalidate();
      if (!admission.noChanges) await session.apply(admission, env, signal);
      checkpoint.launchedAtByNode[String(node)] ??= new Date().toISOString();
      await save();
    }
    checkpoint.stage = 'registration-pending';
    await save();
  } else {
    session = await terraform.open(
      binding.owner,
      await azureTerraformFoundationDeployment(plan, checkpoint.bootstrapByNode),
      'current',
    );
  }
  await revalidate();
  const outputs = await session.readOutputs(['ce_interfaces', 'ce_instances'], env, signal);
  const discovered = await discoverAzureTerraformInterfaces(plan, outputs, api, signal);
  const instances = outputs.ce_instances;
  const expectedInstances = Object.fromEntries(
    binding.nodes.map((node, index) => [node, instances[String(index + 1)]?.vm_id]),
  );
  if (Object.values(expectedInstances).some((id) => !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id ?? '')))
    throw new Error('Azure Terraform admitted VM identities are unavailable');
  const expectedInterfaces = discovered.interfaces
    .filter((item) => item.role === 'slo' || item.role === 'data' || item.role === 'sli')
    .map((item) => ({
      node: `${plan.deploymentName}-${item.node}`,
      role: item.role,
      mac: item.mac,
    }));
  const registrations = await runtime.approveRegistrations(
    binding,
    expectedInstances,
    (record) => storage.write('terraform-registration.json', record),
    signal,
  );
  const configuration = await runtime.observeRegisteredConfiguration(
    binding,
    expectedInstances,
    expectedInterfaces,
    signal,
  );
  await storage.write('terraform-registration-configuration.json', configuration);
  const current = await runtime.observeRegistrations(binding, expectedInstances, signal);
  await storage.write('terraform-registration-observation.json', current);
  checkpoint.stage =
    configuration.status === 'configured' && current.status === 'healthy' ? 'registered' : 'registration-pending';
  await save();
  let routing = 'unknown';
  if (plan.routing.mode === 'route-server' && checkpoint.stage === 'registered') {
    const evidence = await configureAzureRouteServerRouting(plan, expectedInterfaces, runtime, storage, api, signal);
    if (evidence.status !== 'healthy') throw new Error('Azure Route Server BGP and learned routes have not converged');
    routing = 'healthy';
  }
  let traffic = 'unknown';
  let terraformNoChanges;
  if (
    plan.intent.ingress?.mode === 'platform-http' &&
    checkpoint.stage === 'registered' &&
    (plan.routing.mode !== 'route-server' || routing === 'healthy')
  ) {
    if (!acceptIngress) throw new Error('Azure Terraform ingress acceptance driver is unavailable');
    traffic = (await acceptIngress(session)).traffic;
    const refresh = await session.plan(env, signal);
    if (!refresh.noChanges) throw new Error('Terraform changed after Azure platform ingress convergence');
    terraformNoChanges = true;
  }
  return {
    planId: plan.planId,
    planSha256: plan.planSha256,
    engine: 'terraform',
    status:
      checkpoint.stage !== 'registered'
        ? 'pending-registration'
        : plan.intent.ingress?.mode === 'platform-http'
          ? 'accepted'
          : 'registered',
    registrations: current.status === 'healthy' ? current : registrations,
    configuration,
    routing,
    traffic,
    ...(terraformNoChanges ? { terraformNoChanges } : {}),
  };
}
var hash2 = (value) => createHash8('sha256').update(value).digest('hex'),
  waitUntil2 = async (notBefore, signal) => {
    const remaining = notBefore - Date.now();
    if (remaining <= 0) return;
    await new Promise((resolve, reject) => {
      const aborted = () => {
        clearTimeout(timer);
        reject(signal?.reason ?? new Error('Azure Terraform HA admission cancelled'));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', aborted);
        resolve();
      }, remaining);
      signal?.addEventListener('abort', aborted, { once: true });
      if (signal?.aborted) aborted();
    });
  };
var init_terraform_workflow = __esm(() => {
  init_apply();
  init_artifacts();
  init_routing_workflow();
  init_terraform_foundation();
  init_terraform_identities();
  init_terraform_upgrade();
});

// plugins/azure/src/ce/traffic-probe.ts
function object12(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed Azure traffic evidence');
  return value;
}
async function optional3(storage, name) {
  try {
    return object12(await storage.read(name));
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
}
async function collectAzureTrafficProbe(plan, storage, api, signal, checkpointKey = 'azure-traffic-probe') {
  verifyAzureCePlan(plan);
  if (plan.intent.ingress?.mode !== 'platform-http')
    throw new Error('Azure traffic probe requires explicit platform HTTP ingress');
  await storage.verify();
  const source = await observeAzureTrafficSource(plan, api, signal);
  const probe = plan.intent.ingress.probe;
  const listener = plan.intent.ingress.listener;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(checkpointKey))
    throw new Error('Invalid Azure traffic probe checkpoint identity');
  const file = `${checkpointKey}.json`;
  let state = await optional3(storage, file);
  if (state) {
    const attempts = state.attempts;
    if (
      state.schemaVersion !== 1 ||
      state.engine !== plan.engine ||
      state.planSha256 !== plan.planSha256 ||
      state.sourceVmResourceId !== source.resourceId ||
      state.sourceVmId !== source.vmId ||
      state.sourceNicResourceId !== source.nicResourceId ||
      state.sourcePrivateAddress !== source.privateAddress ||
      !['ready', 'complete'].includes(String(state.phase)) ||
      (attempts !== undefined &&
        (!Array.isArray(attempts) ||
          attempts.some(
            (attempt) =>
              !attempt ||
              typeof attempt !== 'object' ||
              typeof attempt.observedAt !== 'string' ||
              !Number.isFinite(Date.parse(String(attempt.observedAt))),
          )))
    )
      throw new Error('Azure traffic probe checkpoint differs from the owning plan');
    if (state.phase === 'complete') {
      const evidence = object12(state.evidence);
      if (
        evidence.status !== 'healthy' ||
        evidence.source !== 'azure:vm-run-command' ||
        evidence.sourceVmResourceId !== source.resourceId ||
        evidence.sourceVmId !== source.vmId ||
        evidence.sourcePrivateAddress !== source.privateAddress ||
        evidence.httpStatus !== probe.expectedStatus ||
        evidence.bodySha256 !== probe.expectedBodySha256 ||
        evidence.expectedStatus !== probe.expectedStatus ||
        evidence.expectedBodySha256 !== probe.expectedBodySha256 ||
        typeof evidence.observedAt !== 'string' ||
        !Number.isFinite(Date.parse(evidence.observedAt))
      )
        throw new Error('Persisted Azure traffic evidence differs from the owning plan');
      return evidence;
    }
  } else {
    state = {
      schemaVersion: 1,
      engine: plan.engine,
      planSha256: plan.planSha256,
      sourceVmResourceId: source.resourceId,
      sourceVmId: source.vmId,
      sourceNicResourceId: source.nicResourceId,
      sourcePrivateAddress: source.privateAddress,
      phase: 'ready',
    };
    await storage.write(file, state);
  }
  const expectedDigest = probe.expectedBodySha256;
  const command =
    `body=$(mktemp); trap 'rm -f "$body"' EXIT; ` +
    `code=$(curl --silent --show-error --max-time 15 --output "$body" --write-out '%{http_code}' ` +
    `--header 'Host: ${listener.domain}' ` +
    `'http://${listener.privateAddress}:${plan.intent.ingress.port}${probe.path}'); ` +
    `digest=$(sha256sum "$body" | awk '{print $1}'); printf '%s %s
' "$code" "$digest"; ` +
    `[ "$code" = "${probe.expectedStatus}" ] && [ "$digest" = "${expectedDigest}" ]`;
  const result = await api.exec(
    'az',
    [
      'vm',
      'run-command',
      'invoke',
      '--ids',
      source.resourceId,
      '--command-id',
      'RunShellScript',
      '--scripts',
      command,
      '--subscription',
      plan.subscription.id,
      '--output',
      'json',
    ],
    signal ? { signal } : undefined,
  );
  if (result.exitCode !== 0) throw detectAzError(result.stderr, result.exitCode);
  let response;
  try {
    response = object12(JSON.parse(result.stdout));
  } catch {
    throw new Error('Malformed Azure traffic probe response');
  }
  const rows = Array.isArray(response.value)
    ? response.value.map((value) => object12(value))
    : (() => {
        throw new Error('Malformed Azure traffic probe response');
      })();
  const stdoutRows = rows.filter((row) => row.code === 'ComponentStatus/StdOut/succeeded');
  const stderrRows = rows.filter((row) => row.code === 'ComponentStatus/StdErr/succeeded');
  if (
    stdoutRows.length !== 1 ||
    stderrRows.length !== 1 ||
    typeof stdoutRows[0].message !== 'string' ||
    typeof stderrRows[0].message !== 'string'
  )
    throw new Error('Malformed Azure traffic probe response');
  const match = /^(\d{3}) ([a-f0-9]{64})\n?$/.exec(stdoutRows[0].message);
  const evidence = {
    status: stderrRows[0].message === '' && match ? 'healthy' : 'degraded',
    source: 'azure:vm-run-command',
    sourceVmResourceId: source.resourceId,
    sourceVmId: source.vmId,
    sourcePrivateAddress: source.privateAddress,
    httpStatus: match ? Number(match[1]) : undefined,
    bodySha256: match?.[2],
    expectedStatus: probe.expectedStatus,
    expectedBodySha256: probe.expectedBodySha256,
    observedAt: new Date().toISOString(),
  };
  if (
    evidence.status !== 'healthy' ||
    evidence.httpStatus !== probe.expectedStatus ||
    evidence.bodySha256 !== probe.expectedBodySha256
  ) {
    const attempts = Array.isArray(state.attempts) ? state.attempts.map(object12) : [];
    attempts.push({
      httpStatus: evidence.httpStatus,
      bodySha256: evidence.bodySha256,
      stderrPresent: stderrRows[0].message.length > 0,
      observedAt: evidence.observedAt,
    });
    await storage.write(file, { ...state, phase: 'ready', attempts: attempts.slice(-40) });
    throw new Error('Azure traffic probe has not converged; retry the saved checkpoint');
  }
  await storage.write(file, { ...state, phase: 'complete', evidence });
  return evidence;
}
var init_traffic_probe = __esm(() => {
  init_exec();
  init_artifacts();
  init_traffic_source();
});

// plugins/azure/src/ce/terraform-apply.ts
import { join as join4 } from 'node:path';

function reconcileAzureTerraformMarketplaceTermsAcceptance(plan, current) {
  if (
    plan.engine !== 'terraform' ||
    plan.intent.operation !== 'deploy' ||
    plan.image.termsAccepted ||
    current.image.termsAccepted !== true
  )
    throw new Error('Stale Azure CE plan: Marketplace terms changed outside the initial Terraform deployment contract');
  const beforeAcceptance = structuredClone(current);
  beforeAcceptance.image.termsAccepted = false;
  assertObservationFresh(plan, beforeAcceptance);
  return fingerprintCurrentObservation(plan, current);
}
function assertAzureTerraformApplyOperation(plan) {
  if (!['deploy', 'start', 'stop', 'resize', 'replace-node'].includes(plan.intent.operation))
    throw new Error(`Terraform ${plan.intent.operation} is not executable through Azure CE apply`);
}
async function acceptAzureTerraformLifecycleTraffic(
  plan,
  terraform,
  runtime,
  storage,
  api,
  contract,
  signal,
  dependencies = {},
) {
  if (!['start', 'resize'].includes(plan.intent.operation) || plan.intent.ingress?.mode !== 'platform-http')
    throw new Error('Azure Terraform lifecycle traffic acceptance requires start or resize with platform ingress');
  const ingress = await (dependencies.ensureIngress ?? ensureAzurePlatformIngress)(
    plan,
    runtime,
    storage,
    contract,
    api,
    signal,
  );
  if (ingress?.listener !== 'configured') throw new Error('Observed Azure platform ingress has not converged');
  const traffic = await (dependencies.collectTraffic ?? collectAzureTrafficProbe)(
    plan,
    storage,
    api,
    signal,
    `${plan.planId}-traffic-probe`,
  );
  if (traffic.status !== 'healthy') throw new Error('Observed end-to-end Azure traffic has not converged');
  const finalNode = plan.topology.nodeCount;
  const finalSession = await terraform.open(
    azureUpgradeBinding(plan).owner,
    await azureTerraformLifecycleDeployment(plan, finalNode, false),
    'current',
  );
  const refresh = await finalSession.plan(process.env, signal);
  if (!refresh.noChanges || refresh.changes.length !== 0)
    throw new Error('Terraform changed after Azure lifecycle traffic convergence');
  return { ingress, traffic: { ...traffic, status: 'healthy' }, terraformNoChanges: true };
}
async function readAzureTerraformAuthorization(storage, planSha256) {
  const name = `terraform-authorization-${planSha256}.json`;
  let authorization;
  let scoped = true;
  try {
    authorization = await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    scoped = false;
    try {
      authorization = await storage.read('terraform-authorization.json');
    } catch (legacyError) {
      if (legacyError.code !== 'ENOENT') throw legacyError;
    }
  }
  const authorized = Boolean(
    authorization &&
      typeof authorization === 'object' &&
      authorization.schemaVersion === 1 &&
      authorization.engine === 'terraform' &&
      authorization.planSha256 === planSha256 &&
      authorization.mutations === true,
  );
  if (scoped && authorization !== undefined && !authorized)
    throw new Error('Azure Terraform authorization checkpoint differs from this plan or engine');
  return { authorized, name };
}
async function executeAzureCeTerraformApply(input, ctx, api, platform, terraform, signal, dependencies = {}) {
  if (Object.keys(input).some((key) => !['planId', 'planSha256'].includes(key)))
    throw new Error('Azure Terraform apply accepts only the persisted plan identity');
  const { plan } = await loadPlanArtifact(ctx.sessionManager, input.planId, input.planSha256);
  if (plan.engine !== 'terraform') throw new Error('Azure Terraform apply requires Terraform ownership');
  assertAzureTerraformApplyOperation(plan);
  const storage = await platform.storage(azureUpgradeBinding(plan).owner);
  const release = await acquireProcessLock(join4(storage.directory, '.azure-terraform-lifecycle-lock'));
  try {
    await assertAzureTerraformDeploymentActive(storage);
    const { authorized, name: authorizationName } = await readAzureTerraformAuthorization(storage, plan.planSha256);
    assertApplyAllowed(plan, {
      ...input,
      hasUI: ctx.hasUI,
      env: process.env,
      authorization: authorized ? { apply: true, terms: false, destroy: false } : undefined,
      executionEngine: 'terraform',
    });
    const observe = () =>
      discoverAzureCompute(
        {
          subscriptionId: plan.subscription.id,
          publisher: plan.image.publisher,
          offer: plan.image.offer,
          plan: plan.image.plan,
          version: plan.image.version,
          vmSize: plan.vm.size,
          requiredNics: plan.nics.length,
          nodeCount: plan.topology.nodeCount,
          requireRouteServer: plan.routing.mode === 'route-server',
          brownfieldResourceIds: plan.intent.brownfield.resourceIds,
          deploymentName: plan.deploymentName,
          resourceGroup: plan.intent.resourceGroup,
        },
        api,
      );
    let acceptedTermsFingerprint;
    const revalidate = async () => {
      const current = await observe();
      if (acceptedTermsFingerprint) return assertObservationFresh(plan, current, acceptedTermsFingerprint);
      if (current.image.termsAccepted === true && plan.image.termsAccepted === false) {
        acceptedTermsFingerprint = reconcileAzureTerraformMarketplaceTermsAcceptance(plan, current);
        await storage.write('terraform-marketplace-terms-observation.json', {
          schemaVersion: 1,
          engine: 'terraform',
          planSha256: plan.planSha256,
          observationFingerprint: acceptedTermsFingerprint,
          image: {
            publisher: current.image.publisher,
            offer: current.image.offer,
            plan: current.image.plan,
            version: current.image.version,
            termsAccepted: true,
          },
        });
        return;
      }
      assertObservationFresh(plan, current);
    };
    await revalidate();
    if (
      !authorized &&
      ctx.hasUI &&
      !(await ctx.ui.confirm(
        'Apply immutable Azure CE Terraform plan',
        `${plan.planId}
${plan.planSha256}`,
      ))
    )
      throw new Error('Azure CE Terraform apply was not approved');
    await storage.write(authorizationName, {
      schemaVersion: 1,
      engine: 'terraform',
      planSha256: plan.planSha256,
      mutations: true,
    });
    const runtime = await platform.runtime('terraform', plan.intent.platformContext);
    const ingressContract =
      plan.intent.ingress?.mode === 'platform-http'
        ? await (dependencies.ingressContract?.() ?? VerifiedIngressContract.release(undefined, signal))
        : undefined;
    const acceptIngress = ingressContract
      ? async () => {
          const ingress = await ensureAzurePlatformIngress(plan, runtime, storage, ingressContract, api, signal);
          if (ingress?.listener !== 'configured') throw new Error('Observed Azure platform ingress has not converged');
          const traffic = await collectAzureTrafficProbe(plan, storage, api, signal);
          if (traffic.status !== 'healthy') throw new Error('Observed end-to-end Azure traffic has not converged');
          return { ingress, traffic: { ...traffic, status: 'healthy' } };
        }
      : undefined;
    let result = ['start', 'stop', 'resize'].includes(plan.intent.operation)
      ? await runAzureTerraformLifecycle(plan, terraform, runtime, storage, api, process.env, signal)
      : plan.intent.operation === 'replace-node'
        ? await runAzureTerraformReplacement(plan, terraform, runtime, storage, api, process.env, signal, acceptIngress)
        : await runAzureTerraformAdmission(
            plan,
            terraform,
            runtime,
            storage,
            api,
            revalidate,
            process.env,
            signal,
            undefined,
            acceptIngress,
          );
    if (
      ['start', 'resize'].includes(plan.intent.operation) &&
      ingressContract &&
      plan.intent.ingress?.mode === 'platform-http'
    ) {
      result = {
        ...result,
        ...(await acceptAzureTerraformLifecycleTraffic(
          plan,
          terraform,
          runtime,
          storage,
          api,
          ingressContract,
          signal,
        )),
      };
    }
    const artifactId = await ctx.sessionManager.saveArtifact(JSON.stringify(result), 'azure-ce-terraform-checkpoint');
    if (!artifactId) throw new Error('Azure Terraform outcome artifact persistence failed; checkpoint is retained');
    return { ...result, status: String(result.status), artifactId };
  } finally {
    await release();
  }
}
var init_terraform_apply = __esm(() => {
  init_ingress_contract();
  init_process_lock();
  init_apply();
  init_artifacts();
  init_discovery();
  init_platform_ingress();
  init_recovery();
  init_terraform_lifecycle();
  init_terraform_replacement();
  init_terraform_retirement();
  init_terraform_upgrade();
  init_terraform_workflow();
  init_traffic_probe();
});

// plugins/azure/src/tools/azure-ce-apply.ts
async function replacementsFor(args, api, plan, ownerPlanSha256 = plan.planSha256) {
  const replacements = {};
  for (const arg of args) {
    const match = /^__NODE_(\d+)_(SLO|SLI|DATA)_PRIVATE_IP__$/.exec(arg);
    if (!match || replacements[arg]) continue;
    const role = match[2] === 'SLO' || (match[2] === 'DATA' && plan.nics.length === 1) ? 'slo' : 'sli';
    replacements[arg] = await resolveInterfaceAddress(api, plan, Number(match[1]), role, ownerPlanSha256);
  }
  return replacements;
}
async function executeAzureCeNativeApply(params, ctx, api, platformFactory, signal, dependencies = {}) {
  const { plan, observation } = await loadPlanArtifact(ctx.sessionManager, params.planId, params.planSha256);
  if (Object.keys(params).some((key) => !['planId', 'planSha256'].includes(key)))
    throw new Error('Azure apply accepts only the persisted plan identity; caller evidence is unsupported');
  let existing = await loadCheckpoint(ctx.sessionManager, plan);
  let recoveredNativeLaunchNode;
  assertApplyAllowed(plan, {
    planId: params.planId,
    planSha256: params.planSha256,
    hasUI: ctx.hasUI,
    env: process.env,
    authorization: existing?.authorization,
  });
  const observe =
    dependencies.observe ??
    (() =>
      discoverAzureCompute(
        {
          subscriptionId: plan.subscription.id,
          publisher: plan.image.publisher,
          offer: plan.image.offer,
          plan: plan.image.plan,
          version: plan.image.version,
          vmSize: plan.vm.size,
          requiredNics: plan.nics.length,
          nodeCount: plan.topology.nodeCount,
          requireRouteServer: plan.routing.mode === 'route-server',
          brownfieldResourceIds: plan.intent.brownfield.resourceIds,
          deploymentName: plan.deploymentName,
          resourceGroup: plan.intent.resourceGroup,
        },
        api,
      ));
  const remainingActions = plan.actions.slice(existing?.completedActionIds.length ?? 0);
  const hasImmutableDeleteTail =
    remainingActions.length > 0 && remainingActions.every((action) => action.kind === 'resource-delete');
  if (existing && plan.intent.operation === 'teardown' && hasImmutableDeleteTail) {
    validateAzureDeletionTail(plan, existing.completedActionIds);
  }
  let current = await observe();
  let currentFingerprint = fingerprintCheckpointObservation(current);
  const existingSnapshot =
    existing?.schemaVersion === AZURE_CE_CHECKPOINT_SCHEMA_VERSION ? existing.observationSnapshot : undefined;
  if (
    plan.intent.operation === 'teardown' &&
    hasImmutableDeleteTail &&
    !existingSnapshot &&
    (!existing || existing.completedActionIds.length === 0)
  ) {
    reconcileAzureNativeDeletionPrefix(plan, existing?.completedActionIds ?? [], observation, current, []);
  }
  const mayRecoverDeletion = existingSnapshot !== undefined;
  if (existing?.schemaVersion === AZURE_CE_SCHEMA_VERSION) {
    if (existing.completedActionIds.length === 0) assertObservationFresh(plan, current);
    if (
      plan.intent.operation === 'teardown' &&
      hasImmutableDeleteTail &&
      (await collectAzureAbsentDeletionTail(plan, existing.completedActionIds, api, signal)).length > 0
    ) {
      throw new Error('Stale incomplete legacy Azure teardown checkpoint cannot be recovered safely');
    }
    existing = upgradeAzureCeCheckpoint(plan, existing, current);
    await saveCheckpoint(ctx.sessionManager, plan, existing);
  }
  if (
    mayRecoverDeletion &&
    existing?.observationSnapshot &&
    plan.intent.operation === 'teardown' &&
    existing.state !== 'complete'
  ) {
    const priorFingerprint = existing.observationFingerprint;
    if (!priorFingerprint) throw new Error('Azure teardown checkpoint has no observation fingerprint');
    const previousCompletedCount = existing.completedActionIds.length;
    const completedActionIds = reconcileAzureNativeDeletionPrefix(
      plan,
      existing.completedActionIds,
      existing.observationSnapshot,
      current,
      await collectAzureAbsentDeletionTail(plan, existing.completedActionIds, api, signal),
    );
    const recoveredActions = completedActionIds.length > previousCompletedCount;
    if (recoveredActions || !safeHexEqual(priorFingerprint, currentFingerprint)) {
      const newlyRecovered = new Set(completedActionIds.slice(previousCompletedCount));
      existing = {
        ...existing,
        completedActionIds,
        failedActionId:
          existing.failedActionId && newlyRecovered.has(existing.failedActionId) ? undefined : existing.failedActionId,
        observationFingerprint: currentFingerprint,
        observationSnapshot: structuredClone(current),
        state: recoveredActions
          ? completedActionIds.length === plan.actions.length
            ? 'complete'
            : existing.failedActionId && !newlyRecovered.has(existing.failedActionId)
              ? 'partial'
              : 'running'
          : existing.state,
      };
      await saveCheckpoint(ctx.sessionManager, plan, existing);
      if (existing.state === 'complete') return { plan, checkpoint: existing };
    }
  }
  if (existing?.schemaVersion === AZURE_CE_CHECKPOINT_SCHEMA_VERSION && existing.pendingAction) {
    const action = plan.actions[existing.completedActionIds.length];
    if (!action) throw new Error('Pending Azure native mutation has no next immutable action');
    validateAzureNativePendingAction(plan, existing.completedActionIds, existing.pendingAction);
    const replacements = await replacementsFor(action.args ?? [], api, plan, action.expectedOwnerPlanSha256);
    const resolvedAction = {
      ...action,
      args: resolveActionArgs(action.args ?? [], plan.planSha256, replacements),
    };
    if (await azureNativePendingActionConverged(plan, resolvedAction, api, signal)) {
      if (action.kind === 'vm-create') recoveredNativeLaunchNode = action.node;
      current = await observe();
      currentFingerprint = fingerprintCheckpointObservation(current);
      existing = {
        ...existing,
        completedActionIds: [...existing.completedActionIds, action.id],
        failedActionId: existing.failedActionId === action.id ? undefined : existing.failedActionId,
        pendingAction: undefined,
        observationFingerprint: currentFingerprint,
        observationSnapshot: structuredClone(current),
        state: existing.completedActionIds.length + 1 === plan.actions.length ? 'complete' : 'running',
      };
      await saveCheckpoint(ctx.sessionManager, plan, existing);
      if (existing.state === 'complete') return { plan, checkpoint: existing };
    }
  }
  if (existing?.observationFingerprint) {
    if (!safeHexEqual(existing.observationFingerprint, currentFingerprint)) {
      throw new Error('Stale Azure CE checkpoint: observations changed outside an allowed recovery boundary');
    }
  } else {
    assertObservationFresh(plan, current);
  }
  if (existing?.state === 'complete') return { plan, checkpoint: existing };
  const completed = new Set(existing?.completedActionIds ?? []);
  const authorization = {
    apply: existing?.authorization?.apply === true,
    terms: existing?.authorization?.terms === true,
    destroy: existing?.authorization?.destroy === true,
  };
  if (ctx.hasUI) {
    if (!authorization.apply) {
      const confirmed = await ctx.ui.confirm(
        'Apply immutable Azure CE plan',
        `${plan.planId}
${plan.planSha256}
${plan.actions.length - completed.size} action(s) remain.`,
      );
      if (!confirmed) throw new Error('Apply was not approved');
      authorization.apply = true;
    }
    if (plan.intent.operation === 'teardown' && !authorization.destroy) {
      const destroy = await ctx.ui.confirm(
        'Tear down Customer Edge',
        `Drain routing, restore approved brownfield state, and delete only resources owned by ${plan.deploymentName}?`,
      );
      if (!destroy) throw new Error('Teardown was not approved');
      authorization.destroy = true;
    }
  }
  if (!ctx.hasUI) {
    authorization.apply ||= process.env.XCSH_CE_HEADLESS_MUTATIONS === '1';
    authorization.destroy ||= process.env.XCSH_CE_ALLOW_DESTROY === '1';
  }
  const checkpoint = {
    authorization,
    engine: plan.engine,
    schemaVersion: AZURE_CE_CHECKPOINT_SCHEMA_VERSION,
    planId: plan.planId,
    planSha256: plan.planSha256,
    completedActionIds: [...completed],
    observationFingerprint: existing?.observationFingerprint ?? currentFingerprint,
    observationSnapshot: structuredClone(current),
    pendingAction: existing?.schemaVersion === AZURE_CE_CHECKPOINT_SCHEMA_VERSION ? existing.pendingAction : undefined,
    state: 'running',
  };
  await saveCheckpoint(ctx.sessionManager, plan, checkpoint);
  const platform = await platformFactory();
  const runtime = await platform.runtime('native', plan.intent.platformContext);
  const storage = await platform.storage({
    deploymentId: plan.deploymentName,
    engine: 'native',
    provider: 'azure',
    account: plan.subscription.id,
    region: plan.region,
  });
  const ingressContract =
    plan.intent.ingress?.mode === 'platform-http'
      ? await (dependencies.ingressContract?.() ?? VerifiedIngressContract.release(undefined, signal))
      : undefined;
  const native = await prepareAzureNativeAdmission(plan, runtime, storage, signal);
  if (recoveredNativeLaunchNode) await recordAzureNativeLaunch(plan, recoveredNativeLaunchNode, native, storage);
  if (plan.intent.operation === 'replace-node')
    await prepareAzureNativeReplacement(plan, native, api, runtime, storage, signal);
  for (const action of plan.actions) {
    if (completed.has(action.id)) continue;
    const preActionFingerprint = checkpoint.observationFingerprint;
    const preActionSnapshot = checkpoint.observationSnapshot;
    try {
      let postMutationObservation;
      await assertActionOwnership(plan, action, api);
      if (action.kind === 'vm-state-gate') {
        const deadline = Date.now() + 15 * 60000;
        while (true) {
          const evidence = await collectAzureNativeVmState(plan, action, api, signal);
          await storage.write(`${action.id}-evidence.json`, evidence);
          if (evidence.status === 'healthy') break;
          if (Date.now() >= deadline) throw new Error('Observed Azure VM power state has not converged');
          await new Promise((resolve, reject) => {
            const abort = () => {
              clearTimeout(timer);
              reject(signal?.reason ?? new Error('Azure VM convergence cancelled'));
            };
            const timer = setTimeout(() => {
              signal?.removeEventListener('abort', abort);
              resolve();
            }, 1e4);
            signal?.addEventListener('abort', abort, { once: true });
            if (signal?.aborted) abort();
          });
        }
      }
      if (action.kind === 'health-gate') {
        const deadline = Date.now() + 15 * 60000;
        let evidence;
        while (true) {
          evidence = await collectAzureNativeAdmissionHealth(
            plan,
            plan.intent.operation === 'replace-node'
              ? plan.topology.nodeCount
              : (action.node ?? plan.topology.nodeCount),
            api,
            runtime,
            storage,
            signal,
            native,
          );
          await storage.write(`${action.id}-evidence.json`, {
            ...evidence,
            planId: plan.planId,
            planSha256: plan.planSha256,
          });
          if (evidence.status === 'healthy') break;
          if (Date.now() >= deadline)
            throw new Error(
              evidence.status === 'unknown'
                ? 'Collected Azure platform health evidence is unavailable'
                : 'Observed Azure platform health has not converged',
            );
          await new Promise((resolve, reject) => {
            const abort = () => {
              clearTimeout(timer);
              reject(signal?.reason ?? new Error('Azure health convergence cancelled'));
            };
            const timer = setTimeout(() => {
              signal?.removeEventListener('abort', abort);
              resolve();
            }, 1e4);
            signal?.addEventListener('abort', abort, { once: true });
            if (signal?.aborted) abort();
          });
        }
      }
      if (action.kind === 'bgp-gate') {
        const admission = await collectAzureNativeAdmissionHealth(
          plan,
          plan.topology.nodeCount,
          api,
          runtime,
          storage,
          signal,
          native,
        );
        if (!('configuration' in admission) || admission.configuration.status !== 'configured')
          throw new Error('Authoritative Azure registered interface configuration is unavailable');
        const expectedInterfaces = admission.configuration.interfaces.map(({ node, role, mac }) => ({
          node,
          role,
          mac,
        }));
        const deadline = Date.now() + 15 * 60000;
        while (true) {
          const evidence = await configureAzureRouteServerRouting(
            plan,
            expectedInterfaces,
            runtime,
            storage,
            api,
            signal,
            native.replacement?.routeServer,
          );
          if (evidence.status === 'healthy') break;
          if (Date.now() >= deadline) throw new Error('Azure Route Server BGP and learned routes have not converged');
          await new Promise((resolve, reject) => {
            const abort = () => {
              clearTimeout(timer);
              reject(signal?.reason ?? new Error('Azure Route Server convergence cancelled'));
            };
            const timer = setTimeout(() => {
              signal?.removeEventListener('abort', abort);
              resolve();
            }, 1e4);
            signal?.addEventListener('abort', abort, { once: true });
            if (signal?.aborted) abort();
          });
        }
      }
      if (action.kind === 'f5-ingress-configure') {
        if (!ingressContract) throw new Error('Verified ingress contract is unavailable');
        const evidence = await (dependencies.ensureIngress ?? ensureAzurePlatformIngress)(
          plan,
          runtime,
          storage,
          ingressContract,
          api,
          signal,
        );
        if (evidence?.listener !== 'configured') throw new Error('Observed Azure platform ingress has not converged');
        await storage.write(`${action.id}-evidence.json`, evidence);
      }
      if (action.kind === 'traffic-gate') {
        if (!ingressContract) throw new Error('Verified ingress contract is unavailable');
        const ingress = await (dependencies.ensureIngress ?? ensureAzurePlatformIngress)(
          plan,
          runtime,
          storage,
          ingressContract,
          api,
          signal,
        );
        if (ingress?.listener !== 'configured') throw new Error('Observed Azure platform ingress has not converged');
        const evidence = await (dependencies.collectTraffic ?? collectAzureTrafficProbe)(
          plan,
          storage,
          api,
          signal,
          `${plan.planId}-${action.id}-traffic-probe`,
        );
        await storage.write(`${action.id}-evidence.json`, evidence);
        if (evidence.status !== 'healthy') throw new Error('Observed end-to-end Azure traffic has not converged');
      }
      if (action.command && action.args) {
        const replacements = await replacementsFor(action.args, api, plan, action.expectedOwnerPlanSha256);
        const execute = (bootstrapFile) =>
          api.exec(
            action.command,
            resolveActionArgs(action.args ?? [], plan.planSha256, {
              ...replacements,
              ...(bootstrapFile ? { __BOOTSTRAP_FILE__: bootstrapFile } : {}),
            }),
          );
        const bootstrap = action.requiresBootstrap
          ? await azureNativeBootstrapForAction(plan, action, native, runtime, storage, signal)
          : undefined;
        if (action.mutates && action.kind !== 'resource-delete') {
          const pending = buildAzureNativePendingAction(plan, action);
          if (checkpoint.pendingAction) {
            validateAzureNativePendingAction(plan, checkpoint.completedActionIds, checkpoint.pendingAction);
          } else {
            checkpoint.pendingAction = pending;
            await saveCheckpoint(ctx.sessionManager, plan, checkpoint);
          }
        }
        const result = bootstrap ? await withAzureNativeBootstrapFile(bootstrap, execute) : await execute();
        if (result.exitCode !== 0)
          throw new Error(`Azure action ${action.id} failed with exit code ${result.exitCode}`);
        if (checkpoint.pendingAction) {
          const deadline = Date.now() + 15 * 60000;
          const resolvedAction = {
            ...action,
            args: resolveActionArgs(action.args, plan.planSha256, replacements),
          };
          while (!(await azureNativePendingActionConverged(plan, resolvedAction, api, signal))) {
            if (Date.now() >= deadline) throw new Error('Azure native mutation postcondition has not converged');
            await new Promise((resolve, reject) => {
              const abort = () => {
                clearTimeout(timer);
                reject(signal?.reason ?? new Error('Azure native mutation convergence cancelled'));
              };
              const timer = setTimeout(() => {
                signal?.removeEventListener('abort', abort);
                resolve();
              }, 1e4);
              signal?.addEventListener('abort', abort, { once: true });
              if (signal?.aborted) abort();
            });
          }
        }
        if (action.kind === 'resource-delete' && action.resourceId) {
          const deadline = Date.now() + 15 * 60000;
          while (true) {
            postMutationObservation = await observe();
            const resource = postMutationObservation.resources.find(
              (candidate) => candidate.id.toLowerCase() === action.resourceId?.toLowerCase(),
            );
            if (!resource?.exists) break;
            if (Date.now() >= deadline) throw new Error('Azure resource deletion has not converged');
            await new Promise((resolve, reject) => {
              const abort = () => {
                clearTimeout(timer);
                reject(signal?.reason ?? new Error('Azure deletion convergence cancelled'));
              };
              const timer = setTimeout(() => {
                signal?.removeEventListener('abort', abort);
                resolve();
              }, 1e4);
              signal?.addEventListener('abort', abort, { once: true });
              if (signal?.aborted) abort();
            });
          }
        }
        if (action.kind === 'vm-create' && action.node)
          await recordAzureNativeLaunch(plan, action.node, native, storage);
      }
      completed.add(action.id);
      checkpoint.completedActionIds = [...completed];
      checkpoint.failedActionId = undefined;
      checkpoint.pendingAction = undefined;
      checkpoint.state = completed.size === plan.actions.length ? 'complete' : 'running';
      const changesFingerprint = action.mutates;
      if (changesFingerprint) {
        const checkpointObservation = postMutationObservation ?? (await observe());
        checkpoint.observationFingerprint = fingerprintCheckpointObservation(checkpointObservation);
        checkpoint.observationSnapshot = structuredClone(checkpointObservation);
      }
      await saveCheckpoint(ctx.sessionManager, plan, checkpoint);
    } catch (error) {
      completed.delete(action.id);
      checkpoint.completedActionIds = [...completed];
      checkpoint.observationFingerprint = preActionFingerprint;
      checkpoint.observationSnapshot = preActionSnapshot;
      checkpoint.state = 'partial';
      checkpoint.failedActionId = action.id;
      await saveCheckpoint(ctx.sessionManager, plan, checkpoint);
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}. Resume with the same plan ID and SHA-256; ${completed.size}/${plan.actions.length} actions are checkpointed.`,
      );
    }
  }
  return { plan, checkpoint };
}
function createAzureCeApplyTool(pi, makeApi = makeExecApi, terraformDependencies = terraformDefaults) {
  const { Type } = pi.typebox;
  return {
    name: 'azure_ce_apply',
    label: 'Apply Azure Customer Edge Plan',
    description:
      'Apply or resume only an exact persisted Azure CE plan ID and SHA-256 after stale-state, ownership, image, networking, quota, terms, and security-gate revalidation.',
    parameters: Type.Object({
      planId: Type.String(),
      planSha256: Type.String(),
    }),
    async execute(_id, params, signal, _update, ctx) {
      try {
        const envelope = await loadPlanArtifact(ctx.sessionManager, params.planId, params.planSha256);
        if (envelope.plan.engine === 'terraform') {
          const platform = await terraformDependencies.platform(pi, signal);
          const result = await executeAzureCeTerraformApply(
            params,
            ctx,
            withAzureCeExecution(makeApi(ctx.cwd), signal),
            platform,
            await terraformDependencies.terraform(pi, signal),
            signal,
          );
          return {
            content: [
              {
                type: 'text',
                text: `Azure CE Terraform plan ${envelope.plan.planId}: ${result.status}. Routing and traffic remain separate collected evidence.`,
              },
            ],
            details: { tool: 'azure_ce_apply', ...result },
          };
        }
        const { plan, checkpoint } = await executeAzureCeNativeApply(
          params,
          ctx,
          withAzureCeExecution(makeApi(ctx.cwd), signal),
          () => terraformDependencies.platform(pi, signal),
          signal,
        );
        return {
          content: [
            {
              type: 'text',
              text: `Azure CE plan ${plan.planId} applied successfully. ${checkpoint.completedActionIds.length} ordered actions are checkpointed and verified.`,
            },
          ],
          details: { tool: 'azure_ce_apply', planId: plan.planId, checkpoint },
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Azure CE apply stopped safely: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'azure_ce_apply', planId: params.planId },
        };
      }
    },
  };
}
var terraformDefaults;
var init_azure_ce_apply = __esm(() => {
  init_ingress_contract();
  init_apply();
  init_artifacts();
  init_canonical();
  init_discovery();
  init_interface_address();
  init_native_action_recovery();
  init_native_workflow();
  init_platform_ingress();
  init_recovery();
  init_routing_workflow();
  init_terraform_apply();
  init_traffic_probe();
  init_shared();
  terraformDefaults = {
    platform: azurePlatformService,
    terraform: azureTerraformService,
  };
});

// plugins/azure/src/ce/terraform-status.ts
async function readAzureTerraformWorkflowStatus(plan, storage) {
  if (plan.engine !== 'terraform') throw new Error('Terraform checkpoint requires the owning engine');
  await storage.verify();
  let value;
  try {
    value = await storage.read('terraform-workflow.json');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { state: 'not-started', engine: 'terraform', source: 'terraform-workflow.json' };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed Terraform workflow');
  const record = value;
  if (
    record.schemaVersion !== 1 ||
    record.engine !== 'terraform' ||
    record.planSha256 !== plan.planSha256 ||
    typeof record.configurationSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(record.configurationSha256) ||
    !['network-pending', 'registration-pending', 'registered'].includes(String(record.stage))
  )
    throw new Error('Terraform workflow identity differs from the owning plan');
  return {
    state: String(record.stage),
    engine: 'terraform',
    source: 'terraform-workflow.json',
    planSha256: plan.planSha256,
    configurationSha256: record.configurationSha256,
  };
}

// plugins/azure/src/tools/azure-ce-status.ts
async function commandJson(api, args) {
  const result = await api.exec('az', [...args, '--output', 'json']);
  if (result.exitCode !== 0)
    return {
      error: true,
      digest: sha256Hex(`${result.stdout}
${result.stderr}`),
    };
  try {
    return JSON.parse(result.stdout);
  } catch {
    return { error: 'Azure returned invalid JSON' };
  }
}
function azureSummary(plan, resources, vms, peers) {
  const resourceItems = Array.isArray(resources) ? resources : [];
  const vmItems = Array.isArray(vms) ? vms : [];
  const peerItems = Array.isArray(peers) ? peers : [];
  const ownerPlanSha256s = new Set([
    plan.planSha256,
    ...plan.actions.flatMap((action) =>
      action.expectedOwnerPlanSha256 && /^[a-f0-9]{64}$/.test(action.expectedOwnerPlanSha256)
        ? [action.expectedOwnerPlanSha256]
        : [],
    ),
  ]);
  const owned = (item) => {
    if (!item || typeof item !== 'object') return false;
    const tags = item.tags;
    const scope = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/`.toLowerCase();
    return (
      typeof item.id === 'string' &&
      item.id.toLowerCase().startsWith(scope) &&
      tags?.['xcsh-managed-by'] === 'azure-ce' &&
      tags?.['xcsh-deployment-id'] === plan.deploymentName &&
      tags?.['xcsh-execution-engine'] === plan.engine &&
      typeof tags?.['xcsh-plan-sha256'] === 'string' &&
      ownerPlanSha256s.has(tags['xcsh-plan-sha256'])
    );
  };
  return {
    coverage: {
      resources: Array.isArray(resources) ? 'available' : 'unavailable',
      vms: Array.isArray(vms) ? 'available' : 'unavailable',
      routeServerPeers: Array.isArray(peers) ? 'available' : 'unavailable',
    },
    resources: resourceItems.filter(owned).map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      provisioningState: item.provisioningState,
    })),
    vms: vmItems.filter(owned).map((item) => ({
      name: item.name,
      powerState: item.powerState,
      provisioningState: item.provisioningState,
      zones: item.zones,
    })),
    routeServerPeers: peerItems
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        name: item.name,
        provisioningState: item.provisioningState,
        peerAsn: item.peerAsn,
        peerIp: item.peerIp,
      })),
  };
}
function createAzureCeStatusTool(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  return {
    name: 'azure_ce_status',
    label: 'Azure Customer Edge Status',
    description:
      'Correlate owned Azure resources, VM state, Route Server peers, persisted checkpoints, and non-secret F5 site/node/BGP/route health evidence.',
    parameters: Type.Object({
      planId: Type.String(),
      planSha256: Type.String(),
    }),
    async execute(_id, params, signal, _update, ctx) {
      try {
        if ('f5Evidence' in params)
          throw new Error('Caller-supplied F5 health evidence is unsupported; status collects live observations');
        const { plan } = await loadPlanArtifact(ctx.sessionManager, params.planId, params.planSha256);
        const api = withAzureCeExecution(makeApi(ctx.cwd), signal, 120000);
        const [resources, vms, peers, checkpoint] = await Promise.all([
          commandJson(api, [
            'resource',
            'list',
            '--resource-group',
            plan.intent.resourceGroup,
            '--subscription',
            plan.subscription.id,
          ]),
          commandJson(api, [
            'vm',
            'list',
            '--resource-group',
            plan.intent.resourceGroup,
            '--show-details',
            '--subscription',
            plan.subscription.id,
          ]),
          plan.routing.mode === 'route-server'
            ? commandJson(api, [
                'network',
                'routeserver',
                'peering',
                'list',
                '--resource-group',
                plan.intent.resourceGroup,
                '--routeserver',
                `${plan.deploymentName}-rs`,
                '--subscription',
                plan.subscription.id,
              ])
            : Promise.resolve([]),
          plan.engine === 'native' ? loadCheckpoint(ctx.sessionManager, plan) : Promise.resolve(undefined),
        ]);
        const azure = azureSummary(plan, resources, vms, peers);
        const routing = await collectAzureRouteServerHealth(plan, api, signal);
        let f5;
        let observedCheckpoint = checkpoint;
        if (plan.engine === 'terraform') {
          try {
            const service = await azurePlatformService(pi, signal);
            observedCheckpoint = await readAzureTerraformWorkflowStatus(
              plan,
              await service.storage(azureUpgradeBinding(plan).owner),
            );
          } catch (error) {
            if (signal?.aborted) throw error;
            observedCheckpoint = { state: 'unknown', engine: 'terraform', reason: 'workflow-evidence-unavailable' };
          }
        }
        try {
          const service = await azurePlatformService(pi, signal);
          const runtime = await service.runtime(plan.engine, plan.intent.platformContext);
          f5 = await collectAzurePlatformHealth(plan, vms, runtime, signal);
        } catch (error) {
          if (signal?.aborted) throw error;
          f5 = {
            status: 'unknown',
            reason: 'platform-service-unavailable',
            bgp: 'unknown',
            routes: 'unknown',
            traffic: 'unknown',
          };
        }
        const evidence = {
          planId: plan.planId,
          routingMode: plan.routing.mode,
          checkpoint: observedCheckpoint ?? {
            state: 'not-started',
            completedActionIds: [],
          },
          azure,
          f5,
          routing,
        };
        return {
          content: [
            {
              type: 'text',
              text: `Azure CE ${plan.deploymentName}: ${azure.vms.length}/${plan.topology.nodeCount} VM records, ${azure.routeServerPeers.length} Route Server peers, checkpoint ${evidence.checkpoint.state}. Coverage: resources ${azure.coverage.resources}, VMs ${azure.coverage.vms}, Route Server peers ${azure.coverage.routeServerPeers}.`,
            },
          ],
          details: { tool: 'azure_ce_status', evidence },
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Azure CE status failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'azure_ce_status' },
        };
      }
    },
  };
}
var init_azure_ce_status = __esm(() => {
  init_artifacts();
  init_canonical();
  init_route_server_health();
  init_terraform_upgrade();
  init_shared();
});

// plugins/platform/src/ce/upgrade-contract.ts
function object13(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed upgrade contract');
  return value;
}

class VerifiedUpgradeContract {
  identity = 'f5xc-ce-upgrade-api/v1';
  publication = 'immutable-release';
  releaseTag = CE_API_RELEASE.tag;
  commit = CE_API_RELEASE.commit;
  fingerprint = CE_API_RELEASE.fingerprint;
  #software;
  #os;
  constructor(schemas) {
    this.#software = createWireValidator(schemas, 'siteUpgradeSWRequest');
    this.#os = createWireValidator(schemas, 'siteUpgradeOSRequest');
  }
  static async release(fetcher = fetch, signal) {
    const api = await loadPublishedCeApi(fetcher, signal);
    const paths = object13(api.paths);
    for (const [path, method, schemaName] of Object.values(routes)) {
      const operation = object13(object13(paths[path])[method]);
      const container =
        method === 'post' ? object13(operation.requestBody) : object13(object13(operation.responses)['200']);
      const schema = object13(object13(object13(container.content)['application/json']).schema);
      if (schema.$ref !== `#/components/schemas/${schemaName}`) throw new Error('Upgrade API path or schema differs');
    }
    return new VerifiedUpgradeContract(object13(object13(api.components).schemas));
  }
  observationPaths(siteName, current, targetSoftware) {
    initialSoftwareSettings(current);
    this.build({ siteName, kind: 'software', version: targetSoftware });
    return {
      site: `/api/config/namespaces/system/sites/${siteName}`,
      targets: `/api/maurice/upgradable_sw_versions?${new URLSearchParams({ current_os_version: current.os, current_sw_version: current.software })}`,
      precheck: `/api/maurice/namespaces/system/sites/${siteName}/pre_upgrade_check?${new URLSearchParams({ sw_version: targetSoftware })}`,
      progress: `/api/maurice/namespaces/system/sites/${siteName}/upgrade_status`,
    };
  }
  build(input) {
    return buildSiteUpgradeRequest(input, input.kind === 'software' ? this.#software : this.#os);
  }
}
var routes;
var init_upgrade_contract = __esm(() => {
  init_verified_api_release();
  init_wire_schema();
  routes = {
    software: ['/api/config/namespaces/{namespace}/sites/{name}/upgrade_sw', 'post', 'siteUpgradeSWRequest'],
    os: ['/api/config/namespaces/{namespace}/sites/{name}/upgrade_os', 'post', 'siteUpgradeOSRequest'],
    site: ['/api/config/namespaces/{namespace}/sites/{name}', 'get', 'siteGetResponse'],
    targets: ['/api/maurice/upgradable_sw_versions', 'get', 'upgrade_statusGetUpgradableSWVersionsResponse'],
    precheck: [
      '/api/maurice/namespaces/{namespace}/sites/{name}/pre_upgrade_check',
      'get',
      'upgrade_statusPreUpgradeCheckResponse',
    ],
    progress: [
      '/api/maurice/namespaces/{namespace}/sites/{name}/upgrade_status',
      'get',
      'upgrade_statusGetUpgradeStatusResponse',
    ],
  };
});

// plugins/platform/src/ce/native-upgrade.ts
import { createHash as createHash9, timingSafeEqual as timingSafeEqual3 } from 'node:crypto';

function canonical2(value) {
  if (Array.isArray(value)) return `[${value.map(canonical2).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical2(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
async function optional4(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function runNativeCeUpgrade(input, authorizedPlanSha256, verify, runtime, contract, storage, signal) {
  const upgrade = structuredClone(input);
  if (upgrade.schemaVersion !== 1 || upgrade.engine !== 'native')
    throw new Error('Native upgrade schema is obsolete; prepare a new v1 plan');
  await verify(upgrade);
  if (!sameHash2(upgrade.planSha256, authorizedPlanSha256))
    throw new Error('Exact native upgrade authorization is required');
  if (
    runtime.engine !== 'native' ||
    storage.owner.engine !== 'native' ||
    hash3(storage.owner) !== hash3(upgrade.expectation.binding.owner)
  )
    throw new Error('Only the owning native engine may upgrade this site');
  const release = await acquireProcessLock(`${storage.directory}/.upgrade-lock`);
  try {
    signal?.throwIfAborted();
    await storage.verify();
    const sourceName = `${upgrade.planId}.json`;
    const saved = await optional4(storage, sourceName);
    if (saved === undefined) await storage.write(sourceName, upgrade);
    else if (hash3(saved) !== hash3(upgrade)) throw new Error('Saved native upgrade source differs');
    const checkpointName = `${upgrade.planId}-checkpoint.json`;
    let checkpoint = await optional4(storage, checkpointName);
    if (checkpoint === undefined) {
      checkpoint = {
        schemaVersion: 1,
        engine: 'native',
        sourcePlanSha256: upgrade.sourcePlanSha256,
        upgradePlanSha256: upgrade.planSha256,
        phase: 'ready',
      };
      await storage.write(checkpointName, checkpoint);
    }
    if (
      checkpoint.schemaVersion !== 1 ||
      checkpoint.engine !== 'native' ||
      checkpoint.sourcePlanSha256 !== upgrade.sourcePlanSha256 ||
      checkpoint.upgradePlanSha256 !== upgrade.planSha256 ||
      !['ready', 'submitted', 'complete'].includes(checkpoint.phase)
    )
      throw new Error('Native upgrade checkpoint differs');
    let serial = await optional4(storage, 'native-ce-upgrade-serial.json');
    if (serial === undefined) serial = { schemaVersion: 1, engine: 'native', status: 'idle' };
    if (
      serial.schemaVersion !== 1 ||
      serial.engine !== 'native' ||
      !['active', 'idle'].includes(serial.status) ||
      (serial.status === 'idle' && (serial.activePlanId !== undefined || serial.activePlanSha256 !== undefined)) ||
      (serial.lastPlanId === undefined) !== (serial.lastPlanSha256 === undefined) ||
      (serial.lastPlanSha256 !== undefined && !/^[a-f0-9]{64}$/.test(serial.lastPlanSha256)) ||
      (serial.status === 'active' &&
        (serial.activePlanId !== upgrade.planId || serial.activePlanSha256 !== upgrade.planSha256))
    )
      throw new Error('Another native site upgrade is active or the serial ledger differs');
    if (serial.status === 'idle' && checkpoint.phase !== 'complete') {
      serial = {
        schemaVersion: 1,
        engine: 'native',
        status: 'active',
        activePlanId: upgrade.planId,
        activePlanSha256: upgrade.planSha256,
        lastPlanId: serial.lastPlanId,
        lastPlanSha256: serial.lastPlanSha256,
      };
      await storage.write('native-ce-upgrade-serial.json', serial);
    }
    const observe = () =>
      runtime.observeUpgrade(
        upgrade.expectation.binding,
        contract,
        upgrade.expectation.target.kind === 'software' ? upgrade.expectation.target.version : undefined,
        signal,
      );
    let transition = assessCeUpgradeTransition(upgrade.expectation, await observe());
    if (checkpoint.phase === 'complete') {
      if (transition !== 'versions-complete') throw new Error('Completed native upgrade version evidence regressed');
      const receipt = await storage.read(`${upgrade.planId}-receipt.json`);
      if (
        receipt.status !== 'upgrade-complete' ||
        receipt.engine !== 'native' ||
        receipt.planId !== upgrade.planId ||
        receipt.planSha256 !== upgrade.planSha256 ||
        receipt.siteName !== upgrade.expectation.binding.siteName ||
        hash3(receipt.target) !== hash3(upgrade.expectation.target) ||
        receipt.nodeHealth !== 'unknown' ||
        receipt.routing !== 'unknown' ||
        receipt.traffic !== 'unknown'
      )
        throw new Error('Completed native upgrade receipt differs');
      return receipt;
    }
    if (transition === 'failed') throw new Error('Native upgrade failed');
    if (transition === 'unknown') {
      if (checkpoint.phase === 'submitted')
        return {
          status: 'upgrade-convergence-unknown',
          planId: upgrade.planId,
          planSha256: upgrade.planSha256,
        };
      throw new Error('Native upgrade evidence is unknown');
    }
    if (checkpoint.phase === 'ready' && transition === 'versions-complete') {
      serial = {
        schemaVersion: 1,
        engine: 'native',
        status: 'idle',
        lastPlanId: upgrade.planId,
        lastPlanSha256: upgrade.planSha256,
      };
      await storage.write('native-ce-upgrade-serial.json', serial);
      return { status: 'target-already-complete', planId: upgrade.planId, planSha256: upgrade.planSha256 };
    }
    if (checkpoint.phase === 'ready' && transition !== 'ready')
      throw new Error('Upgrade began outside the authorized native action');
    if (checkpoint.phase === 'ready') {
      let crossedBoundary = false;
      try {
        await runtime.submitUpgrade(
          upgrade.expectation.binding,
          contract,
          upgrade.expectation.target,
          upgrade.expectation.siteUid,
          async () => {
            checkpoint = {
              schemaVersion: 1,
              engine: 'native',
              sourcePlanSha256: upgrade.sourcePlanSha256,
              upgradePlanSha256: upgrade.planSha256,
              phase: 'submitted',
            };
            await storage.write(checkpointName, checkpoint);
            crossedBoundary = true;
          },
          signal,
        );
      } catch (error) {
        if (!crossedBoundary) throw error;
        return {
          status: 'upgrade-submission-unconfirmed',
          planId: upgrade.planId,
          planSha256: upgrade.planSha256,
        };
      }
      transition = assessCeUpgradeTransition(upgrade.expectation, await observe());
    }
    if (transition !== 'versions-complete') {
      if (transition === 'unknown' && checkpoint.phase === 'submitted')
        return {
          status: 'upgrade-convergence-unknown',
          planId: upgrade.planId,
          planSha256: upgrade.planSha256,
        };
      if (!['ready', 'converging'].includes(transition)) throw new Error('Native upgrade convergence is unknown');
      return {
        status:
          checkpoint.phase === 'submitted' && transition === 'ready'
            ? 'upgrade-submission-unconfirmed'
            : 'upgrade-converging',
        planId: upgrade.planId,
        planSha256: upgrade.planSha256,
      };
    }
    checkpoint = { ...checkpoint, phase: 'complete' };
    await storage.write(checkpointName, checkpoint);
    serial = {
      schemaVersion: 1,
      engine: 'native',
      status: 'idle',
      lastPlanId: upgrade.planId,
      lastPlanSha256: upgrade.planSha256,
    };
    await storage.write('native-ce-upgrade-serial.json', serial);
    const receipt = {
      status: 'upgrade-complete',
      engine: 'native',
      planId: upgrade.planId,
      planSha256: upgrade.planSha256,
      siteName: upgrade.expectation.binding.siteName,
      target: upgrade.expectation.target,
      observedAt: new Date().toISOString(),
      nodeHealth: 'unknown',
      routing: 'unknown',
      traffic: 'unknown',
    };
    await storage.write(`${upgrade.planId}-receipt.json`, receipt);
    return receipt;
  } finally {
    await release();
  }
}
var hash3 = (value) => createHash9('sha256').update(canonical2(value)).digest('hex'),
  sameHash2 = (left, right) =>
    /^[a-f0-9]{64}$/.test(left) &&
    /^[a-f0-9]{64}$/.test(right) &&
    timingSafeEqual3(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
var init_native_upgrade = __esm(() => {
  init_process_lock();
  init_upgrade_transition();
});

// plugins/azure/src/ce/native-upgrade.ts
function build2(base, expectation, contract) {
  verifyAzureCePlan(base);
  initialSoftwareSettings(expectation.before);
  const binding = azureUpgradeBinding(base);
  if (
    base.engine !== 'native' ||
    canonicalSha256(binding) !== canonicalSha256(expectation.binding) ||
    typeof expectation.siteUid !== 'string' ||
    !expectation.siteUid.trim() ||
    typeof expectation.physicalSiteUid !== 'string' ||
    !expectation.physicalSiteUid.trim() ||
    !/^sha256:[a-f0-9]{64}$/.test(expectation.siteContractFingerprint) ||
    Object.keys(expectation.target).sort().join(',') !== 'kind,version' ||
    expectation.before[expectation.target.kind] === expectation.target.version ||
    expectation.contractFingerprint !== contract.fingerprint
  )
    throw new Error('Azure native upgrade identities, scope or effective versions are incomplete');
  contract.build({ siteName: base.siteName, ...expectation.target });
  const draft = {
    schemaVersion: 1,
    engine: 'native',
    kind: 'azure-ce-native-upgrade',
    sourcePlanSha256: base.planSha256,
    expectation,
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `azure-ce-native-upgrade-${planSha256.slice(0, 24)}`, planSha256 };
}
async function prepareAzureNativeUpgrade(base, target, runtime, contract, signal) {
  verifyAzureCePlan(base);
  if (base.engine !== 'native') throw new Error('Azure native upgrade requires a native-owned plan');
  contract.build({ siteName: base.siteName, ...target });
  const binding = azureUpgradeBinding(base);
  const observation = await runtime.observeUpgrade(
    binding,
    contract,
    target.kind === 'software' ? target.version : undefined,
    signal,
  );
  if (observation.status !== 'observed') throw new Error('Fresh Azure native upgrade version evidence is unavailable');
  const expectation = {
    binding,
    siteUid: observation.siteUid,
    physicalSiteUid: observation.physicalSiteUid,
    contractFingerprint: observation.contractFingerprint,
    siteContractFingerprint: observation.siteContractFingerprint,
    before: { software: observation.software.installed, os: observation.os.installed },
    target: structuredClone(target),
  };
  if (assessCeUpgradeTransition(expectation, observation) !== 'ready')
    throw new Error('Azure native site version readiness has not converged');
  return build2(base, expectation, contract);
}
function verifyAzureNativeUpgrade(base, upgrade, contract) {
  if (upgrade.schemaVersion !== 1 || upgrade.engine !== 'native')
    throw new Error('Azure native upgrade schema is obsolete; prepare a new v1 plan');
  const expected = build2(base, upgrade.expectation, contract);
  if (canonicalSha256(upgrade) !== canonicalSha256(expected))
    throw new Error('Saved Azure native upgrade plan changed');
}
function runAzureNativeUpgrade(base, upgrade, authorizedPlanSha256, runtime, contract, storage, signal) {
  return runNativeCeUpgrade(
    upgrade,
    authorizedPlanSha256,
    async (candidate) => verifyAzureNativeUpgrade(base, candidate, contract),
    runtime,
    contract,
    storage,
    signal,
  );
}
var init_native_upgrade2 = __esm(() => {
  init_native_upgrade();
  init_upgrade_transition();
  init_artifacts();
  init_canonical();
  init_terraform_upgrade();
});

// plugins/azure/src/tools/azure-ce-upgrade.ts
async function optional5(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
function createAzureCeUpgradeTool(pi, dependencies = defaults) {
  const { Type } = pi.typebox;
  return {
    name: 'azure_ce_upgrade',
    label: 'Upgrade Azure Customer Edge',
    description:
      'Prepare or apply an immutable serial software/OS upgrade for a native- or Terraform-owned Azure Customer Edge site. Apply resumes from persisted platform evidence without replaying ambiguous actions. Node, routing and traffic health remain separate evidence.',
    parameters: Type.Object({
      operation: Type.Union([Type.Literal('prepare'), Type.Literal('apply')]),
      basePlanId: Type.String(),
      basePlanSha256: Type.String(),
      kind: Type.Optional(Type.Union([Type.Literal('software'), Type.Literal('os')])),
      version: Type.Optional(Type.String()),
      upgradePlanId: Type.Optional(Type.String()),
      upgradePlanSha256: Type.Optional(Type.String()),
    }),
    async execute(_id, params, signal, _update, ctx) {
      try {
        const allowed =
          params.operation === 'prepare'
            ? ['basePlanId', 'basePlanSha256', 'kind', 'operation', 'version']
            : ['basePlanId', 'basePlanSha256', 'operation', 'upgradePlanId', 'upgradePlanSha256'];
        if (Object.keys(params).some((key) => !allowed.includes(key)))
          throw new Error(`Azure CE upgrade ${params.operation} parameters differ`);
        const { plan } = await loadPlanArtifact(ctx.sessionManager, params.basePlanId, params.basePlanSha256);
        const platform = await dependencies.platform(pi, signal);
        const storage = await platform.storage(azureUpgradeBinding(plan).owner);
        const runtime = await platform.runtime(plan.engine, plan.intent.platformContext);
        const contract = await dependencies.contract(signal);
        if (params.operation === 'prepare') {
          if (!params.kind || !params.version) throw new Error('Upgrade preparation requires kind and version');
          const upgrade =
            plan.engine === 'terraform'
              ? await prepareAzureTerraformUpgrade(
                  plan,
                  { kind: params.kind, version: params.version },
                  runtime,
                  contract,
                  signal,
                )
              : await prepareAzureNativeUpgrade(
                  plan,
                  { kind: params.kind, version: params.version },
                  runtime,
                  contract,
                  signal,
                );
          const existing = await optional5(storage, `${upgrade.planId}.json`);
          if (existing === undefined) await storage.write(`${upgrade.planId}.json`, upgrade);
          else if (canonicalSha256(existing) !== canonicalSha256(upgrade))
            throw new Error('Persisted Azure CE upgrade plan differs');
          const artifactId = await ctx.sessionManager.saveArtifact(
            JSON.stringify({
              kind: upgrade.kind,
              engine: upgrade.engine,
              planId: upgrade.planId,
              planSha256: upgrade.planSha256,
              sourcePlanSha256: upgrade.sourcePlanSha256,
              siteName: upgrade.expectation.binding.siteName,
              target: upgrade.expectation.target,
            }),
            'azure-ce-upgrade-plan',
          );
          if (!artifactId) throw new Error('Azure CE upgrade plan artifact persistence failed');
          return {
            content: [
              {
                type: 'text',
                text: `Upgrade plan ID: ${upgrade.planId}
SHA-256: ${upgrade.planSha256}
Site: ${upgrade.expectation.binding.siteName}
Target: ${upgrade.expectation.target.kind} ${upgrade.expectation.target.version}
Artifact: artifact://${artifactId}`,
              },
            ],
            details: {
              tool: 'azure_ce_upgrade',
              operation: 'prepare',
              artifactId,
              planId: upgrade.planId,
              planSha256: upgrade.planSha256,
            },
          };
        }
        if (!params.upgradePlanId || !params.upgradePlanSha256)
          throw new Error('Upgrade apply requires the exact upgrade plan ID and SHA-256');
        const upgrade = await storage.read(`${params.upgradePlanId}.json`);
        if (plan.engine === 'terraform') await verifyAzureTerraformUpgrade(plan, upgrade, contract);
        else verifyAzureNativeUpgrade(plan, upgrade, contract);
        if (upgrade.planId !== params.upgradePlanId || !safeHexEqual(upgrade.planSha256, params.upgradePlanSha256))
          throw new Error('Persisted Azure CE upgrade plan identity differs');
        const authorizationName = `${upgrade.planId}-authorization.json`;
        const authorization = await optional5(storage, authorizationName);
        if (authorization !== undefined) {
          if (
            !authorization ||
            typeof authorization !== 'object' ||
            authorization.schemaVersion !== 2 ||
            authorization.engine !== plan.engine ||
            authorization.sourcePlanSha256 !== plan.planSha256 ||
            authorization.upgradePlanSha256 !== upgrade.planSha256 ||
            authorization.mutations !== true
          )
            throw new Error('Persisted Azure CE upgrade authorization differs');
        } else {
          if (
            ctx.hasUI &&
            !(await ctx.ui.confirm(
              'Apply immutable Azure CE upgrade plan',
              `${upgrade.planId}
${upgrade.planSha256}
${upgrade.expectation.binding.siteName}: ${upgrade.expectation.target.kind} ${upgrade.expectation.target.version}`,
            ))
          )
            throw new Error('Azure CE upgrade was not approved');
          await storage.write(authorizationName, {
            schemaVersion: 2,
            engine: plan.engine,
            sourcePlanSha256: plan.planSha256,
            upgradePlanSha256: upgrade.planSha256,
            mutations: true,
          });
        }
        const result =
          plan.engine === 'terraform'
            ? await runAzureTerraformUpgrade(
                plan,
                upgrade,
                params.upgradePlanSha256,
                runtime,
                contract,
                await dependencies.terraform(pi, signal),
                storage,
                process.env,
                signal,
              )
            : await runAzureNativeUpgrade(plan, upgrade, params.upgradePlanSha256, runtime, contract, storage, signal);
        const artifactId = await ctx.sessionManager.saveArtifact(JSON.stringify(result), 'azure-ce-upgrade-checkpoint');
        if (!artifactId) throw new Error('Azure CE upgrade checkpoint artifact persistence failed');
        return {
          content: [
            {
              type: 'text',
              text: `Azure CE upgrade ${upgrade.expectation.binding.siteName}: ${String(result.status)}. Node, routing and traffic health require separate collected evidence.`,
            },
          ],
          details: { tool: 'azure_ce_upgrade', operation: 'apply', artifactId, ...result },
        };
      } catch (error) {
        signal?.throwIfAborted();
        return {
          content: [
            {
              type: 'text',
              text: `Azure CE upgrade failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'azure_ce_upgrade', operation: params.operation },
        };
      }
    },
  };
}
var defaults;
var init_azure_ce_upgrade = __esm(() => {
  init_upgrade_contract();
  init_artifacts();
  init_canonical();
  init_native_upgrade2();
  init_terraform_upgrade();
  defaults = {
    platform: azurePlatformService,
    terraform: azureTerraformService,
    contract: (signal) => VerifiedUpgradeContract.release(fetch, signal),
  };
});

// plugins/azure/src/ce/failover.ts
import { isIP as isIP9 } from 'node:net';

function azureFailoverOwner(plan) {
  verifyAzureCePlan(plan);
  return {
    deploymentId: plan.deploymentName,
    engine: plan.engine,
    provider: 'azure',
    account: plan.subscription.id,
    region: plan.region,
  };
}
function plannedVm(plan, nodeIndex) {
  if (!Number.isInteger(nodeIndex) || nodeIndex < 1 || nodeIndex > plan.topology.nodeCount)
    throw new Error('Azure failover requires an exact planned node index');
  const matches = plan.actions.filter((action) => action.kind === 'vm-create' && action.node === nodeIndex);
  if (matches.length !== 1 || typeof matches[0].resourceId !== 'string')
    throw new Error('Azure failover VM resource identity is unavailable');
  return matches[0].resourceId;
}
async function observeAzureFailoverVm(plan, nodeIndex, api, signal) {
  verifyAzureCePlan(plan);
  signal?.throwIfAborted();
  const run = async (args) => {
    const result = await api.exec('az', [...args, '--subscription', plan.subscription.id, '--output', 'json'], {
      signal,
    });
    signal?.throwIfAborted();
    if (result.exitCode !== 0) throw new Error('Azure failover identity observation unavailable');
    let value;
    try {
      value = object14(JSON.parse(result.stdout));
    } catch {
      throw new Error('Malformed Azure failover identity observation');
    }
    if (!Object.keys(value).length || value.nextLink) throw new Error('Incomplete Azure failover identity observation');
    return value;
  };
  const account = await run(['account', 'show']);
  if (
    lower6(account.id) !== lower6(plan.subscription.id) ||
    lower6(account.tenantId) !== lower6(plan.subscription.tenantId) ||
    account.environmentName !== plan.subscription.cloud ||
    account.state !== 'Enabled'
  )
    throw new Error('Azure failover account observation differs from deployment');
  const vmResourceId = plannedVm(plan, nodeIndex);
  const expectedScope = `/subscriptions/${plan.subscription.id}/resourcegroups/${plan.intent.resourceGroup}/providers/microsoft.compute/virtualmachines/`;
  if (!lower6(vmResourceId).startsWith(expectedScope.toLowerCase()))
    throw new Error('Azure failover VM is outside the deployment scope');
  const vm = await run(['vm', 'show', '--ids', vmResourceId, '--show-details']);
  const tags = object14(vm.tags);
  const power = lower6(vm.powerState).replace(/^vm\s+/, '');
  if (
    lower6(vm.id) !== lower6(vmResourceId) ||
    lower6(vm.location) !== lower6(plan.region) ||
    vm.provisioningState !== 'Succeeded' ||
    !uuid3(vm.vmId) ||
    power !== 'running' ||
    tags['xcsh-managed-by'] !== 'azure-ce' ||
    tags['xcsh-execution-engine'] !== plan.engine ||
    tags['xcsh-deployment-id'] !== plan.deploymentName ||
    tags['xcsh-plan-sha256'] !== plan.planSha256
  )
    throw new Error('Azure failover VM identity, readiness, or ownership differs');
  return {
    schemaVersion: 1,
    source: 'azure-cli-live',
    subscriptionId: plan.subscription.id,
    region: plan.region,
    engine: plan.engine,
    deploymentId: plan.deploymentName,
    sourcePlanSha256: plan.planSha256,
    nodeIndex,
    vmResourceId,
    vmId: String(vm.vmId),
    powerState: 'running',
    observedAt: new Date().toISOString(),
  };
}
function buildAzureCeFailoverPlan(base, evidence) {
  verifyAzureCePlan(base);
  const vmResourceId = plannedVm(base, evidence.nodeIndex);
  if (
    base.routing.mode !== 'route-server' ||
    !base.topology.ha ||
    base.topology.nodeCount !== 3 ||
    base.intent.ingress?.mode !== 'platform-http' ||
    evidence.schemaVersion !== 1 ||
    evidence.source !== 'azure-cli-live' ||
    evidence.subscriptionId !== base.subscription.id ||
    evidence.region !== base.region ||
    evidence.engine !== base.engine ||
    evidence.deploymentId !== base.deploymentName ||
    evidence.sourcePlanSha256 !== base.planSha256 ||
    lower6(evidence.vmResourceId) !== lower6(vmResourceId) ||
    !uuid3(evidence.vmId) ||
    evidence.powerState !== 'running' ||
    !Number.isFinite(Date.parse(evidence.observedAt))
  )
    throw new Error('Azure failover preparation evidence differs from the owning deployment');
  const draft = {
    schemaVersion: 1,
    engine: base.engine,
    kind: 'azure-ce-failover',
    sourcePlanSha256: base.planSha256,
    nodeIndex: evidence.nodeIndex,
    vmResourceId,
    vmId: evidence.vmId,
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `azure-ce-failover-${planSha256.slice(0, 24)}`, planSha256 };
}
function verifyAzureCeFailoverPlan(base, failover) {
  const evidence = {
    schemaVersion: 1,
    source: 'azure-cli-live',
    subscriptionId: base.subscription.id,
    region: base.region,
    engine: base.engine,
    deploymentId: base.deploymentName,
    sourcePlanSha256: base.planSha256,
    nodeIndex: failover.nodeIndex,
    vmResourceId: failover.vmResourceId,
    vmId: failover.vmId,
    powerState: 'running',
    observedAt: new Date(0).toISOString(),
  };
  const expected = buildAzureCeFailoverPlan(base, evidence);
  if (canonicalSha256(expected) !== canonicalSha256(failover)) throw new Error('Saved Azure CE failover plan changed');
}
function requireAzureFailoverExecutionContract(base, failover, value) {
  verifyAzureCeFailoverPlan(base, failover);
  const checkpoint = object14(value);
  const binding = azureUpgradeBinding(base);
  const expectedKeys = [
    'contractFingerprint',
    'expectedSessions',
    'interfaces',
    'kind',
    'localAsn',
    'name',
    'owner',
    'remoteAsn',
    'routeServerAddresses',
    'siteName',
    'siteUid',
    'uid',
  ];
  const interfaces = Array.isArray(checkpoint.interfaces) ? checkpoint.interfaces : [];
  const addresses = Array.isArray(checkpoint.routeServerAddresses) ? checkpoint.routeServerAddresses : [];
  if (
    canonicalSha256(Object.keys(checkpoint).sort()) !== canonicalSha256(expectedKeys) ||
    checkpoint.kind !== 'bgp' ||
    !/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(checkpoint.name) ||
    typeof checkpoint.uid !== 'string' ||
    !checkpoint.uid.trim() ||
    checkpoint.siteName !== base.siteName ||
    typeof checkpoint.siteUid !== 'string' ||
    !checkpoint.siteUid.trim() ||
    canonicalSha256(checkpoint.owner) !== canonicalSha256(binding.owner) ||
    checkpoint.localAsn !== base.routing.localAsn ||
    checkpoint.remoteAsn !== 65515 ||
    checkpoint.expectedSessions !== 6 ||
    interfaces.length !== 3 ||
    interfaces.some(
      (entry, index) =>
        !entry ||
        typeof entry !== 'object' ||
        entry.node !== binding.nodes[index] ||
        typeof entry.interfaceName !== 'string' ||
        !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(entry.interfaceName) ||
        entry.interfaceName.includes('__'),
    ) ||
    new Set(interfaces.map((entry) => entry.interfaceName)).size !== 3 ||
    addresses.length !== 2 ||
    new Set(addresses).size !== 2 ||
    addresses.some((address) => typeof address !== 'string' || isIP9(address) !== 4) ||
    typeof checkpoint.contractFingerprint !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(checkpoint.contractFingerprint)
  )
    throw new Error('Azure failover routing checkpoint differs from the owning six-session topology');
  return structuredClone(checkpoint);
}
async function optional6(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function observeAzureFailoverVmState(plan, failover, api, signal) {
  verifyAzureCeFailoverPlan(plan, failover);
  signal?.throwIfAborted();
  const execute = async (args) => {
    const result = await api.exec('az', [...args, '--subscription', plan.subscription.id, '--output', 'json'], {
      signal,
    });
    signal?.throwIfAborted();
    if (result.exitCode !== 0) throw new Error('Azure failover VM observation unavailable');
    try {
      return object14(JSON.parse(result.stdout));
    } catch {
      throw new Error('Malformed Azure failover VM observation');
    }
  };
  const account = await execute(['account', 'show']);
  if (
    lower6(account.id) !== lower6(plan.subscription.id) ||
    lower6(account.tenantId) !== lower6(plan.subscription.tenantId) ||
    account.environmentName !== plan.subscription.cloud ||
    account.state !== 'Enabled'
  )
    throw new Error('Azure failover account observation differs from deployment');
  const vm = await execute(['vm', 'show', '--ids', failover.vmResourceId, '--show-details']);
  const tags = object14(vm.tags);
  if (
    lower6(vm.id) !== lower6(failover.vmResourceId) ||
    lower6(vm.location) !== lower6(plan.region) ||
    vm.provisioningState !== 'Succeeded' ||
    lower6(vm.vmId) !== lower6(failover.vmId) ||
    tags['xcsh-managed-by'] !== 'azure-ce' ||
    tags['xcsh-execution-engine'] !== plan.engine ||
    tags['xcsh-deployment-id'] !== plan.deploymentName ||
    tags['xcsh-plan-sha256'] !== plan.planSha256
  )
    throw new Error('Azure failover VM identity, readiness, or ownership differs');
  const state = lower6(vm.powerState).replace(/^vm\s+/, '');
  if (state === 'running' || state === 'deallocated') return state;
  return ['starting', 'stopping', 'deallocating'].includes(state) ? 'pending' : 'unknown';
}
async function collectAzureFailoverAcceptance(base, failover, routingValue, phase, runtime, storage, api, signal) {
  const routing = requireAzureFailoverExecutionContract(base, failover, routingValue);
  if (!['baseline', 'outage', 'recovered'].includes(phase)) throw new Error('Azure failover evidence phase differs');
  const binding = azureUpgradeBinding(base);
  const selectedNode = binding.nodes[failover.nodeIndex - 1];
  const interfaces =
    phase === 'outage' ? routing.interfaces.filter((item) => item.node !== selectedNode) : routing.interfaces;
  const expectedSessions = interfaces.flatMap((item) =>
    routing.routeServerAddresses.map((peerAddress) => ({ ...item, peerAddress })),
  );
  const sessions = await runtime.observeBgpSessions(binding, expectedSessions, signal);
  const routes = await runtime.observeBgpRoutesForNodes(
    binding,
    interfaces.map((item) => item.node),
    signal,
  );
  const cloud = await collectAzureRouteServerFailoverHealth(
    base,
    failover.nodeIndex,
    phase === 'outage' ? 'outage' : 'recovered',
    api,
    signal,
  );
  const traffic = await collectAzureTrafficProbe(base, storage, api, signal, `${failover.planId}-${phase}-traffic`);
  const expected = phase === 'outage' ? 4 : 6;
  if (
    sessions.status !== 'healthy' ||
    sessions.establishedSessions !== expected ||
    sessions.expectedSessions !== expected ||
    routes.status !== 'observed' ||
    routes.nodes.length !== interfaces.length ||
    cloud.status !== 'healthy' ||
    cloud.expectedEstablishedSessions !== expected ||
    traffic.status !== 'healthy' ||
    sessions.contractFingerprint !== routing.contractFingerprint ||
    routes.contractFingerprint !== routing.contractFingerprint
  )
    throw new Error(`Azure failover ${phase} acceptance has not converged`);
  return {
    acceptance: 'passed',
    phase,
    expectedEstablishedSessions: expected,
    sessions,
    effectiveRoutes: routes,
    routeServer: cloud,
    traffic,
    observedAt: new Date().toISOString(),
  };
}
async function runAzureCeFailover(
  base,
  failover,
  authorizedPlanSha256,
  storage,
  observeVm,
  mutate,
  collect,
  release = async () => {},
  signal,
  polling = {
    attempts: 90,
    intervalMs: 1e4,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  },
) {
  verifyAzureCeFailoverPlan(base, failover);
  if (authorizedPlanSha256 !== failover.planSha256) throw new Error('Exact Azure failover authorization is required');
  if (canonicalSha256(storage.owner) !== canonicalSha256(azureFailoverOwner(base)))
    throw new Error('Only the owning Azure engine may execute failover');
  if (!Number.isInteger(polling.attempts) || polling.attempts < 1 || polling.intervalMs < 0)
    throw new Error('Azure failover convergence bounds are invalid');
  const unlock = await acquireProcessLock(`${storage.directory}/.failover-lock`);
  try {
    await storage.verify();
    const sourceName = `${failover.planId}.json`;
    const source = await optional6(storage, sourceName);
    if (source === undefined) await storage.write(sourceName, failover);
    else if (canonicalSha256(source) !== canonicalSha256(failover))
      throw new Error('Saved Azure failover source differs');
    const checkpointName = `${failover.planId}-checkpoint.json`;
    let active = await optional6(storage, checkpointName);
    if (!active) {
      active = {
        schemaVersion: 1,
        engine: base.engine,
        sourcePlanSha256: base.planSha256,
        failoverPlanSha256: failover.planSha256,
        phase: 'baseline',
      };
      await storage.write(checkpointName, active);
    }
    if (
      active.schemaVersion !== 1 ||
      active.engine !== base.engine ||
      active.sourcePlanSha256 !== base.planSha256 ||
      active.failoverPlanSha256 !== failover.planSha256 ||
      !['baseline', 'stop', 'outage', 'start', 'recovered', 'release', 'complete'].includes(active.phase) ||
      (active.pending !== undefined &&
        (active.pending.phase !== active.phase ||
          active.pending.requestSha256 !==
            canonicalSha256({ phase: active.pending.phase, vmResourceId: failover.vmResourceId, vmId: failover.vmId })))
    )
      throw new Error('Azure failover checkpoint differs');
    let current = active;
    const save = async (next) => {
      current = next;
      await storage.write(checkpointName, current);
    };
    const convergeVm = async (expected) => {
      for (let attempt = 0; attempt < polling.attempts; attempt++) {
        signal?.throwIfAborted();
        if ((await observeVm(signal)) === expected) return;
        if (attempt + 1 < polling.attempts) await polling.wait(polling.intervalMs);
      }
      throw new Error(`Azure failover VM ${expected} convergence deadline exceeded`);
    };
    const change = async (phase, next) => {
      const expected = phase === 'stop' ? 'deallocated' : 'running';
      if (!current.pending) {
        const before = await observeVm(signal);
        if (before === expected) throw new Error(`Azure failover VM was already ${expected} before authorization`);
        if (before !== (phase === 'stop' ? 'running' : 'deallocated'))
          throw new Error('Azure failover VM state is unavailable');
        await save({
          ...current,
          pending: {
            phase,
            requestSha256: canonicalSha256({ phase, vmResourceId: failover.vmResourceId, vmId: failover.vmId }),
          },
        });
        await mutate(phase, signal);
      } else {
        const before = await observeVm(signal);
        if (before === (phase === 'stop' ? 'running' : 'deallocated')) await mutate(phase, signal);
      }
      await convergeVm(expected);
      await save({ ...current, phase: next, pending: undefined });
    };
    const convergeNetwork = async (phase, next) => {
      for (let attempt = 0; attempt < polling.attempts; attempt++) {
        signal?.throwIfAborted();
        const evidence = await collect(phase, signal);
        if (evidence.acceptance === 'passed') {
          await storage.write(`${failover.planId}-${phase}-evidence.json`, evidence);
          await save({ ...current, phase: next });
          return;
        }
        if (attempt + 1 < polling.attempts) await polling.wait(polling.intervalMs);
      }
      throw new Error(`Azure failover ${phase} convergence deadline exceeded`);
    };
    if (current.phase === 'baseline') await convergeNetwork('baseline', 'stop');
    if (current.phase === 'stop') await change('stop', 'outage');
    if (current.phase === 'outage') await convergeNetwork('outage', 'start');
    if (current.phase === 'start') await change('start', 'recovered');
    if (current.phase === 'recovered') await convergeNetwork('recovered', 'release');
    if (current.phase === 'release') {
      await release(signal);
      await save({ ...current, phase: 'complete' });
    }
    const receipt = {
      status: 'failover-complete',
      engine: base.engine,
      planId: failover.planId,
      planSha256: failover.planSha256,
      nodeIndex: failover.nodeIndex,
      sessionSequence: [6, 4, 6],
      traffic: 'healthy',
      observedAt: new Date().toISOString(),
    };
    await storage.write(`${failover.planId}-receipt.json`, receipt);
    return receipt;
  } finally {
    await unlock();
  }
}
var object14 = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Malformed Azure failover evidence');
    return value;
  },
  lower6 = (value) => (typeof value === 'string' ? value.toLowerCase() : ''),
  uuid3 = (value) => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
var init_failover = __esm(() => {
  init_process_lock();
  init_artifacts();
  init_canonical();
  init_route_server_health();
  init_terraform_upgrade();
  init_traffic_probe();
});

// plugins/azure/src/ce/terraform-failover.ts
import { createHash as createHash10 } from 'node:crypto';
import { readFile as readFile5 } from 'node:fs/promises';

function configuration2(base, failover, phase) {
  const resource =
    phase === 'release'
      ? {}
      : {
          azapi_resource_action: {
            ce_failover: {
              type: 'Microsoft.Compute/virtualMachines@2024-07-01',
              resource_id: failover.vmResourceId,
              action: phase === 'stop' ? 'deallocate' : 'start',
              method: 'POST',
              when: 'apply',
              locks: [failover.vmResourceId],
            },
          },
        };
  return JSON.stringify({
    terraform: {
      required_version: `= ${AZURE_CE_TERRAFORM_VERSION}`,
      required_providers: {
        azapi: { source: 'Azure/azapi', version: `= ${AZURE_CE_AZAPI_PROVIDER_VERSION2}` },
      },
    },
    provider: { azapi: { subscription_id: base.subscription.id, tenant_id: base.subscription.tenantId } },
    resource,
  });
}
async function azureTerraformFailoverDeployment(base, failover, phase = 'stop') {
  verifyAzureCeFailoverPlan(base, failover);
  if (base.engine !== 'terraform' || failover.engine !== 'terraform')
    throw new Error('Azure Terraform failover requires Terraform ownership');
  const text = configuration2(base, failover, phase);
  const stage = `failover-${failover.planSha256.slice(0, 24)}`;
  return {
    schemaVersion: 1,
    deploymentId: base.deploymentName,
    stage,
    engine: 'terraform',
    scope: { cloud: 'azure', account: base.subscription.id, region: base.region },
    terraformVersion: AZURE_CE_TERRAFORM_VERSION,
    configuration: text,
    providerLock: await readFile5(
      new URL('./assets/plugins/azure/terraform/azapi-provider-lock.hcl', import.meta.url),
      'utf8',
    ),
    backendIdentity: `local:${base.deploymentName}:stage:${stage}`,
  };
}
function validateReceipt2(deployment, stage, receipt, final = false) {
  const allowed = stage.phase === 'release' ? ['delete', 'no-op'] : ['create', 'update', 'no-op'];
  if (
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== deployment.deploymentId ||
    receipt.backendIdentity !== deployment.backendIdentity ||
    receipt.configurationSha256 !== stage.configurationSha256 ||
    receipt.providerLockSha256 !== digest5(deployment.providerLock) ||
    receipt.operation !== undefined ||
    receipt.actionInvocations?.length ||
    (final
      ? !receipt.noChanges || receipt.changes.length !== 0
      : stage.phase === 'release' && receipt.noChanges && receipt.changes.length === 0
        ? false
        : receipt.changes.length !== 1 ||
          receipt.changes[0].address !== stage.address ||
          receipt.changes[0].type !== 'azapi_resource_action' ||
          receipt.changes[0].actions.length !== 1 ||
          !allowed.includes(receipt.changes[0].actions[0]))
  )
    throw new Error(
      `Azure Terraform failover ${final ? 'final' : stage.phase} plan differs from the exact power action`,
    );
}
async function optional7(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function createAzureTerraformFailoverController(base, failover, terraform, storage, observeVm, env, signal) {
  const deployments = {
    stop: await azureTerraformFailoverDeployment(base, failover, 'stop'),
    start: await azureTerraformFailoverDeployment(base, failover, 'start'),
    release: await azureTerraformFailoverDeployment(base, failover, 'release'),
  };
  const stages = Object.fromEntries(
    ['stop', 'start', 'release'].map((phase) => [
      phase,
      {
        phase,
        configuration: deployments[phase].configuration,
        configurationSha256: digest5(deployments[phase].configuration),
        address: 'azapi_resource_action.ce_failover',
      },
    ]),
  );
  let session;
  try {
    session = await terraform.open(storage.owner, deployments.stop, false);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    session = await terraform.open(storage.owner, deployments.stop, 'current');
  }
  const currentSha256 = async () => {
    const value = await session.readConfigurationSha256?.();
    if (!value) throw new Error('Terraform failover configuration identity is unavailable');
    return value;
  };
  const settle = async (phase, currentSignal) => {
    const receipt = await optional7(storage, `${failover.planId}-${phase}-plan.json`);
    if (!receipt) return;
    validateReceipt2(deployments[phase], stages[phase], receipt);
    if (typeof session.reconcileApplyFromEvidence !== 'function')
      throw new Error('Terraform interrupted failover reconciliation is unavailable');
    await session.reconcileApplyFromEvidence(receipt, canonicalSha256(await observeVm(currentSignal)));
  };
  const select = async (phase, currentSignal) => {
    const desired = stages[phase];
    const current = await currentSha256();
    if (current === desired.configurationSha256) return;
    const predecessor = phase === 'start' ? 'stop' : phase === 'release' ? 'start' : undefined;
    if (!predecessor || current !== stages[predecessor].configurationSha256)
      throw new Error('Terraform failover configuration differs from the exact phase sequence');
    try {
      await session.reviseConfiguration(current, desired.configuration);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== interruptedApplyMessage2) throw error;
      await settle(predecessor, currentSignal);
      await session.reviseConfiguration(current, desired.configuration);
    }
  };
  const apply = async (phase, currentSignal) => {
    await select(phase, currentSignal);
    const name = `${failover.planId}-${phase}-plan.json`;
    let receipt = await optional7(storage, name);
    if (!receipt) {
      receipt = await session.plan(env, currentSignal ?? signal);
      validateReceipt2(deployments[phase], stages[phase], receipt);
      await storage.write(name, receipt);
    } else validateReceipt2(deployments[phase], stages[phase], receipt);
    if (!receipt.noChanges) await session.apply(receipt, env, currentSignal ?? signal);
  };
  const release = async (currentSignal) => {
    await select('release', currentSignal);
    const receipt = await session.plan(env, currentSignal ?? signal);
    validateReceipt2(deployments.release, stages.release, receipt);
    await storage.write(`${failover.planId}-release-plan.json`, receipt);
    if (!receipt.noChanges) await session.apply(receipt, env, currentSignal ?? signal);
    const final = await session.plan(env, currentSignal ?? signal);
    validateReceipt2(deployments.release, stages.release, final, true);
    await storage.write(`${failover.planId}-final-plan.json`, final);
  };
  return { mutate: apply, release };
}
var digest5 = (value) => createHash10('sha256').update(value).digest('hex'),
  interruptedApplyMessage2 = 'Reconcile interrupted Terraform apply before revising configuration';
var init_terraform_failover = __esm(() => {
  init_canonical();
  init_failover();
  init_terraform_foundation();
  init_terraform_lifecycle();
});

// plugins/azure/src/tools/azure-ce-failover.ts
async function optional8(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
function createAzureCeFailoverTool(pi, dependencies = defaults2) {
  const { Type } = pi.typebox;
  return {
    name: 'azure_ce_failover',
    label: 'Validate Azure Customer Edge Failover',
    description:
      'Prepare or execute an immutable, engine-owned Azure CE outage plan with exact VM identity, durable six-to-four-to-six Route Server evidence, effective routes, content-bound traffic, and Terraform state release.',
    parameters: Type.Object({
      operation: Type.Union([Type.Literal('prepare'), Type.Literal('apply')]),
      basePlanId: Type.String(),
      basePlanSha256: Type.String(),
      nodeIndex: Type.Optional(Type.Number()),
      failoverPlanId: Type.Optional(Type.String()),
      failoverPlanSha256: Type.Optional(Type.String()),
    }),
    async execute(_id, params, signal, _update, ctx) {
      try {
        const allowed =
          params.operation === 'prepare'
            ? ['basePlanId', 'basePlanSha256', 'nodeIndex', 'operation']
            : ['basePlanId', 'basePlanSha256', 'failoverPlanId', 'failoverPlanSha256', 'operation'];
        if (Object.keys(params).some((key) => !allowed.includes(key)))
          throw new Error(`Azure CE failover ${params.operation} parameters differ`);
        const { plan } = await loadPlanArtifact(ctx.sessionManager, params.basePlanId, params.basePlanSha256);
        const platform = await dependencies.platform(pi, signal);
        const runtime = await platform.runtime(plan.engine, plan.intent.platformContext);
        if (plan.routing.mode === 'route-server') runtime.requireRoutingContract('azure');
        const storage = await platform.storage(azureFailoverOwner(plan));
        const api = withAzureCeExecution(dependencies.makeApi(ctx.cwd), signal);
        if (params.operation === 'prepare') {
          if (!Number.isInteger(params.nodeIndex)) throw new Error('Failover preparation requires an exact nodeIndex');
          const evidence = await observeAzureFailoverVm(plan, params.nodeIndex, api, signal);
          const failover = buildAzureCeFailoverPlan(plan, evidence);
          const existing = await optional8(storage, `${failover.planId}.json`);
          if (existing === undefined) await storage.write(`${failover.planId}.json`, failover);
          else if (canonicalSha256(existing) !== canonicalSha256(failover))
            throw new Error('Persisted Azure CE failover plan differs');
          await storage.write(`${failover.planId}-preparation-evidence.json`, evidence);
          const artifactId = await ctx.sessionManager.saveArtifact(
            JSON.stringify({
              kind: failover.kind,
              engine: failover.engine,
              planId: failover.planId,
              planSha256: failover.planSha256,
              sourcePlanSha256: failover.sourcePlanSha256,
              nodeIndex: failover.nodeIndex,
              vmResourceId: failover.vmResourceId,
              vmId: failover.vmId,
              evidence: { source: evidence.source, observedAt: evidence.observedAt, powerState: evidence.powerState },
            }),
            'azure-ce-failover-plan',
          );
          if (!artifactId) throw new Error('Azure CE failover plan artifact persistence failed');
          return {
            content: [
              {
                type: 'text',
                text: `Failover plan ID: ${failover.planId}
SHA-256: ${failover.planSha256}
Node: ${failover.nodeIndex}
Artifact: artifact://${artifactId}`,
              },
            ],
            details: {
              tool: 'azure_ce_failover',
              operation: 'prepare',
              artifactId,
              planId: failover.planId,
              planSha256: failover.planSha256,
            },
          };
        }
        if (!params.failoverPlanId || !params.failoverPlanSha256)
          throw new Error('Failover apply requires the exact failover plan identity');
        const failover = await storage.read(`${params.failoverPlanId}.json`);
        verifyAzureCeFailoverPlan(plan, failover);
        if (failover.planId !== params.failoverPlanId || !safeHexEqual(failover.planSha256, params.failoverPlanSha256))
          throw new Error('Persisted Azure CE failover plan identity differs');
        const routing = await storage.read('platform-routing.json');
        requireAzureFailoverExecutionContract(plan, failover, routing);
        const authorizationName = `${failover.planId}-authorization.json`;
        const expectedAuthorization = {
          schemaVersion: 1,
          engine: plan.engine,
          sourcePlanSha256: plan.planSha256,
          failoverPlanSha256: failover.planSha256,
          mutations: true,
        };
        const authorization = await optional8(storage, authorizationName);
        if (authorization === undefined) {
          if (!ctx.hasUI && process.env.XCSH_CE_HEADLESS_MUTATIONS !== '1')
            throw new Error('Headless Azure CE failover requires XCSH_CE_HEADLESS_MUTATIONS=1');
          if (
            ctx.hasUI &&
            !(await ctx.ui.confirm(
              'Execute planned Azure CE failover',
              `${failover.planId}
${failover.planSha256}
Node ${failover.nodeIndex}`,
            ))
          )
            throw new Error('Azure CE failover was not approved');
          await storage.write(authorizationName, expectedAuthorization);
        } else if (canonicalSha256(authorization) !== canonicalSha256(expectedAuthorization))
          throw new Error('Persisted Azure CE failover authorization differs');
        const observe = (currentSignal) => observeAzureFailoverVmState(plan, failover, api, currentSignal);
        const collect = (phase, currentSignal) =>
          collectAzureFailoverAcceptance(plan, failover, routing, phase, runtime, storage, api, currentSignal);
        let mutate;
        let release = async () => {};
        if (plan.engine === 'terraform') {
          const controller = await createAzureTerraformFailoverController(
            plan,
            failover,
            await dependencies.terraform(pi, signal),
            storage,
            observe,
            process.env,
            signal,
          );
          mutate = controller.mutate;
          release = controller.release;
        } else {
          mutate = async (phase, currentSignal) => {
            await observe(currentSignal);
            const result = await api.exec(
              'az',
              [
                'vm',
                phase === 'stop' ? 'deallocate' : 'start',
                '--ids',
                failover.vmResourceId,
                '--subscription',
                plan.subscription.id,
                '--output',
                'json',
              ],
              currentSignal ? { signal: currentSignal } : undefined,
            );
            if (result.exitCode !== 0) throw new Error(`Azure native failover ${phase} request failed`);
          };
        }
        const result = await runAzureCeFailover(
          plan,
          failover,
          params.failoverPlanSha256,
          storage,
          observe,
          mutate,
          collect,
          release,
          signal,
        );
        const artifactId = await ctx.sessionManager.saveArtifact(JSON.stringify(result), 'azure-ce-failover-receipt');
        if (!artifactId) throw new Error('Azure CE failover receipt persistence failed');
        return {
          content: [
            {
              type: 'text',
              text: `Azure CE node ${failover.nodeIndex}: ${result.status}; BGP sessions 6 \u2192 4 \u2192 6 and content-bound traffic passed.`,
            },
          ],
          details: { tool: 'azure_ce_failover', operation: 'apply', artifactId, ...result },
        };
      } catch (error) {
        signal?.throwIfAborted();
        return {
          content: [
            {
              type: 'text',
              text: `Azure CE failover failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'azure_ce_failover', operation: params.operation },
        };
      }
    },
  };
}
var defaults2;
var init_azure_ce_failover = __esm(() => {
  init_artifacts();
  init_canonical();
  init_failover();
  init_terraform_failover();
  init_shared();
  defaults2 = {
    platform: azurePlatformService,
    terraform: azureTerraformService,
    makeApi: makeExecApi,
  };
});

// plugins/azure/src/ce/terraform-destroy-ownership.ts
async function read4(api, plan, args, signal) {
  signal?.throwIfAborted();
  const result = await api.exec(
    'az',
    [...args, '--subscription', plan.subscription.id, '--output', 'json'],
    signal ? { signal } : undefined,
  );
  signal?.throwIfAborted();
  if (result.exitCode !== 0) throw new Error('Azure Terraform teardown ownership observation unavailable');
  try {
    return object15(JSON.parse(result.stdout));
  } catch {
    throw new Error('Malformed Azure Terraform teardown ownership observation');
  }
}
async function observeAzureTerraformDestroyBoundary(plan, api, signal) {
  verifyAzureCePlan(plan);
  const account = await read4(api, plan, ['account', 'show'], signal);
  if (
    lower7(account.id) !== lower7(plan.subscription.id) ||
    lower7(account.tenantId) !== lower7(plan.subscription.tenantId) ||
    account.environmentName !== plan.subscription.cloud ||
    account.state !== 'Enabled'
  )
    throw new Error('Azure Terraform teardown account differs from deployment');
  const groupId = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}`;
  signal?.throwIfAborted();
  const existsResult = await api.exec(
    'az',
    [
      'group',
      'exists',
      '--name',
      plan.intent.resourceGroup,
      '--subscription',
      plan.subscription.id,
      '--output',
      'json',
    ],
    signal ? { signal } : undefined,
  );
  signal?.throwIfAborted();
  if (existsResult.exitCode !== 0) throw new Error('Azure Terraform teardown boundary observation unavailable');
  let exists;
  try {
    exists = JSON.parse(existsResult.stdout);
  } catch {
    throw new Error('Malformed Azure Terraform teardown boundary observation');
  }
  if (exists === false) return { status: 'absent', resourceGroupId: groupId, observedAt: new Date().toISOString() };
  if (exists !== true) throw new Error('Malformed Azure Terraform teardown boundary observation');
  const group = await read4(api, plan, ['group', 'show', '--name', plan.intent.resourceGroup], signal);
  const tags = object15(group.tags);
  if (
    lower7(group.id) !== lower7(groupId) ||
    lower7(group.location) !== lower7(plan.region) ||
    tags['xcsh-managed-by'] !== 'azure-ce' ||
    tags['xcsh-execution-engine'] !== 'terraform' ||
    tags['xcsh-deployment-id'] !== plan.deploymentName ||
    tags['xcsh-plan-sha256'] !== plan.planSha256
  )
    throw new Error('Azure Terraform teardown resource group is foreign or replaced');
  return {
    status: 'owned',
    resourceGroupId: groupId,
    ownerPlanSha256: plan.planSha256,
    observedAt: new Date().toISOString(),
  };
}
async function verifyAzureTerraformDestroyOwnership(plan, receipt, session, api, env, signal) {
  verifyAzureCePlan(plan);
  if (
    plan.engine !== 'terraform' ||
    plan.intent.operation !== 'deploy' ||
    plan.intent.brownfield.resourceIds.length ||
    receipt.schemaVersion !== 1 ||
    receipt.engine !== 'terraform' ||
    receipt.operation !== 'destroy' ||
    receipt.deploymentId !== plan.deploymentName ||
    receipt.backendIdentity !== `local:${plan.deploymentName}` ||
    receipt.actionInvocations?.length ||
    receipt.changes.some(
      (change) =>
        change.actions.join(',') !== 'delete' ||
        !new RegExp(`^${change.type}\\.[a-z][a-z0-9_]*$`).test(change.address) ||
        (!cloudTypes.has(change.type) &&
          !localTypes.has(change.type) &&
          !(change.type === 'azapi_resource_action' && change.address === marketplaceTermsAddress)),
    ) ||
    new Set(receipt.changes.map((change) => change.address)).size !== receipt.changes.length
  )
    throw new Error('Exact owning Azure Terraform destroy plan with supported resource types required');
  const boundary = await observeAzureTerraformDestroyBoundary(plan, api, signal);
  if (boundary.status !== 'owned' && (!receipt.noChanges || receipt.changes.length))
    throw new Error('Azure Terraform teardown resource group is absent');
  const groupId = boundary.resourceGroupId;
  const selections = receipt.changes.length
    ? Object.fromEntries(
        receipt.changes.map((change) => [
          change.address,
          change.type === 'azapi_resource_action' ? ['resource_id', 'type', 'method', 'when'] : ['id'],
        ]),
      )
    : { 'azurerm_resource_group.ce': ['id'] };
  const fields = await session.readPlannedResourceFields(receipt, selections, env, signal);
  if (!receipt.changes.length) {
    if (fields['azurerm_resource_group.ce'] !== null || Object.keys(fields).length !== 1)
      throw new Error('Empty Azure Terraform destroy plan identity differs');
    return { resourceGroupId: groupId, resourceCount: 0, ownerPlanSha256: plan.planSha256 };
  }
  if (Object.keys(fields).length !== receipt.changes.length)
    throw new Error('Incomplete Azure Terraform teardown identity projection');
  for (const change of receipt.changes) {
    if (change.type === 'azapi_resource_action') {
      const terms = object15(fields[change.address]);
      const expectedResourceId = [
        `/subscriptions/${plan.subscription.id}`,
        'providers/Microsoft.MarketplaceOrdering',
        'offerTypes/virtualmachine',
        `publishers/${plan.image.publisher}`,
        `offers/${plan.image.offer}`,
        `plans/${plan.image.plan}`,
        'agreements/current',
      ].join('/');
      if (
        lower7(terms.resource_id) !== lower7(expectedResourceId) ||
        terms.type !== marketplaceTermsType ||
        terms.method !== 'PUT' ||
        terms.when !== 'apply'
      )
        throw new Error(
          'Azure Terraform destroy Marketplace agreement action differs from the exact apply-only contract',
        );
      continue;
    }
    const id = object15(fields[change.address]).id;
    if (typeof id !== 'string' || !id) throw new Error('Azure Terraform teardown resource ID is unavailable');
    if (localTypes.has(change.type)) continue;
    if (
      change.type === 'azurerm_resource_group'
        ? lower7(id) !== lower7(groupId)
        : !lower7(id).includes(`${lower7(groupId)}/`)
    )
      throw new Error('Azure Terraform destroy target is outside the owned resource group');
  }
  return { resourceGroupId: groupId, resourceCount: receipt.changes.length, ownerPlanSha256: plan.planSha256 };
}
var cloudTypes,
  localTypes,
  marketplaceTermsAddress = 'azapi_resource_action.marketplace_terms',
  marketplaceTermsType = 'Microsoft.MarketplaceOrdering/offerTypes/publishers/offers/plans/agreements@2021-01-01',
  object15 = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Malformed Azure Terraform teardown identity');
    return value;
  },
  lower7 = (value) => (typeof value === 'string' ? value.toLowerCase() : '');
var init_terraform_destroy_ownership = __esm(() => {
  init_artifacts();
  cloudTypes = new Set([
    'azurerm_linux_virtual_machine',
    'azurerm_network_interface',
    'azurerm_network_interface_security_group_association',
    'azurerm_network_security_group',
    'azurerm_network_security_rule',
    'azurerm_public_ip',
    'azurerm_resource_group',
    'azurerm_route_server',
    'azurerm_route_server_bgp_connection',
    'azurerm_subnet',
    'azurerm_virtual_network',
  ]);
  localTypes = new Set(['tls_private_key']);
});

// plugins/azure/src/ce/terraform-pending-import.ts
import { createHash as createHash11 } from 'node:crypto';

async function reconcileAzurePendingVm(base, session, storage, api, env, signal) {
  if (!session.readResourceIdentities || !session.readConfigurationSha256 || !session.planImports)
    throw Error('Pending Azure VM owning import service unavailable');
  const id = `/subscriptions/${base.subscription.id}/resourceGroups/${base.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${base.deploymentName}-1`;
  const address = 'azurerm_linux_virtual_machine.node_1';
  const observe = async () => {
    if ((await observeAzureTerraformDestroyBoundary(base, api, signal)).status !== 'owned') return;
    const r = await api.exec(
      'az',
      ['vm', 'show', '--ids', id, '--subscription', base.subscription.id, '--output', 'json'],
      signal ? { signal } : undefined,
    );
    if (r.exitCode !== 0) {
      if (/ResourceNotFound|ResourceGroupNotFound/.test(r.stderr)) return;
      throw Error('Pending Azure VM observation unavailable');
    }
    const vm = object16(JSON.parse(r.stdout)),
      tags = object16(vm.tags);
    const expected = base.nics
      .map((n) => n.index)
      .map(
        (i) =>
          `${id.split('/providers/')[0]}/providers/Microsoft.Network/networkInterfaces/${base.deploymentName}-1-nic${i}`,
      );
    const nics = object16(vm.networkProfile).networkInterfaces;
    if (
      vm.id !== id ||
      vm.name !== `${base.deploymentName}-1` ||
      vm.location !== base.region ||
      vm.provisioningState !== 'Failed' ||
      typeof vm.vmId !== 'string' ||
      !vm.vmId ||
      object16(vm.hardwareProfile).vmSize !== base.vm.size ||
      tags['xcsh-managed-by'] !== 'azure-ce' ||
      tags['xcsh-execution-engine'] !== 'terraform' ||
      tags['xcsh-deployment-id'] !== base.deploymentName ||
      tags['xcsh-plan-sha256'] !== base.planSha256 ||
      tags['xcsh-node-index'] !== '1' ||
      tags['ves-io-site-name'] !== base.siteName ||
      !Array.isArray(nics) ||
      nics.length !== base.nics.length ||
      canonicalSha256(nics.map((n) => object16(n).id).sort()) !==
        canonicalSha256(expected.slice(0, base.nics.length).sort())
    )
      throw Error('Pending Azure VM is foreign, replaced or no longer failed');
    return vm;
  };
  let saved;
  try {
    saved = object16(await storage.read(journalName));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const identities = await session.readResourceIdentities(env, signal);
  const existing = identities.filter((r) => r.address === address);
  if (existing.length && (existing.length !== 1 || existing[0].id !== id))
    throw Error('Pending VM state identity differs');
  if (existing.length && !saved) return false;
  const vm = await observe();
  if (!vm) {
    if (saved && saved.status !== 'imported') throw Error('Pending VM disappeared before import reconciliation');
    return;
  }
  if (!saved) {
    const configurationSha256 = await session.readConfigurationSha256();
    const originalConfiguration = await session.readConfiguration(configurationSha256);
    const config = object16(JSON.parse(originalConfiguration)),
      resources = object16(config.resource);
    const desired = object16(object16(resources.azurerm_linux_virtual_machine).node_1);
    const keys = object16(object16(object16(vm.osProfile).linuxConfiguration).ssh).publicKeys;
    if (!Array.isArray(keys) || keys.length !== 1 || typeof object16(keys[0]).keyData !== 'string')
      throw Error('Pending VM public bootstrap identity unavailable');
    desired.admin_ssh_key = [{ username: object16(vm.osProfile).adminUsername, public_key: object16(keys[0]).keyData }];
    desired.lifecycle = { ignore_changes: 'all' };
    if (!identities.some((r) => r.type === 'tls_private_key')) delete resources.tls_private_key;
    if (config.output) {
      const names = Object.keys(object16(config.output));
      const values = await session.readOutputs(names, env, signal, true);
      const output = {};
      for (const name of names) if (Object.hasOwn(values, name)) output[name] = { value: values[name] };
      if (Object.keys(output).length) config.output = output;
      else delete config.output;
    }
    config.import = [{ to: address, id }];
    const importedConfiguration = JSON.stringify(config);
    saved = {
      schemaVersion: 1,
      sourcePlanSha256: base.planSha256,
      vmId: String(vm.vmId),
      id,
      address,
      originalConfiguration,
      configurationSha256,
      importedConfiguration,
      importedConfigurationSha256: hash4(importedConfiguration),
    };
    await storage.write(journalName, saved);
  }
  if (
    saved.schemaVersion !== 1 ||
    saved.sourcePlanSha256 !== base.planSha256 ||
    saved.id !== id ||
    saved.address !== address ||
    saved.vmId !== vm.vmId ||
    typeof saved.originalConfiguration !== 'string' ||
    typeof saved.importedConfiguration !== 'string' ||
    hash4(saved.originalConfiguration) !== saved.configurationSha256 ||
    hash4(saved.importedConfiguration) !== saved.importedConfigurationSha256
  )
    throw Error('Pending Azure VM import journal differs');
  let receipt = saved.receipt;
  const current = await session.readConfigurationSha256();
  if (current === saved.configurationSha256) {
    if (existing.length) {
      saved.status = 'imported';
      await storage.write(journalName, saved);
      return true;
    }
    await session.reviseConfiguration(current, saved.importedConfiguration);
  } else if (current !== saved.importedConfigurationSha256)
    throw Error('Pending import executor configuration differs');
  const intents = [
    {
      address,
      type: 'azurerm_linux_virtual_machine',
      providerName: 'registry.terraform.io/hashicorp/azurerm',
      idSha256: hash4(id),
    },
  ];
  receipt ??= await session.planImports(intents, env, signal);
  if (
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== base.deploymentName ||
    receipt.backendIdentity !== `local:${base.deploymentName}` ||
    receipt.configurationSha256 !== saved.importedConfigurationSha256 ||
    receipt.operation ||
    receipt.actionInvocations?.length ||
    receipt.relinquishments?.length ||
    canonicalSha256(receipt.imports) !== canonicalSha256(intents) ||
    receipt.changes.some((c) => c.actions.join(',') !== 'no-op')
  )
    throw Error('Pending VM import plan is mutating or foreign');
  saved.receipt = receipt;
  await storage.write(journalName, saved);
  if (canonicalSha256(await observe()) !== canonicalSha256(vm))
    throw Error('Pending VM changed before import submission');
  const state = await session.readPlanApplicationState(receipt);
  if (state === 'planned') await session.apply(receipt, env, signal);
  const projected = await session.readResourceIdentities(env, signal);
  if (
    projected.filter((r) => r.address === address && r.id === id).length !== 1 ||
    canonicalSha256(await observe()) !== canonicalSha256(vm)
  )
    throw Error('Pending VM import outcome unavailable');
  if ((await session.readPlanApplicationState(receipt)) === 'applying')
    await session.reconcileApplyFromEvidence(receipt, canonicalSha256({ projected, vm }));
  await session.reviseConfiguration(saved.importedConfigurationSha256, saved.originalConfiguration);
  saved.status = 'imported';
  await storage.write(journalName, saved);
  return true;
}
var hash4 = (s) => createHash11('sha256').update(s).digest('hex'),
  object16 = (v) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('Malformed pending Azure VM identity');
    return v;
  },
  journalName = 'azure-terraform-pending-vm-import.json';
var init_terraform_pending_import = __esm(() => {
  init_canonical();
  init_terraform_destroy_ownership();
});

// plugins/azure/src/ce/terraform-cloud-teardown.ts
async function optional9(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function runAzureTerraformCloudTeardown(plan, session, storage, api, env, signal, pendingAdmission = false) {
  verifyAzureCePlan(plan);
  if (plan.engine !== 'terraform' || plan.intent.operation !== 'deploy')
    throw new Error('Azure Terraform teardown requires the original Terraform deployment plan');
  await storage.verify();
  const name = 'azure-terraform-cloud-destroy-plan.json';
  let receipt = await optional9(storage, name);
  if (pendingAdmission) {
    if (receipt && (await session.readPlanApplicationState(receipt)) === 'applying') {
      const boundary = await observeAzureTerraformDestroyBoundary(plan, api, signal);
      await storage.write('azure-terraform-cloud-destroy-reconciliation.json', boundary);
      await session.reconcileApplyFromEvidence(receipt, canonicalSha256(boundary));
    }
    if (await reconcileAzurePendingVm(plan, session, storage, api, env, signal)) receipt = undefined;
  }
  if (!receipt) {
    receipt = await session.planDestroy(env, signal);
    await verifyAzureTerraformDestroyOwnership(plan, receipt, session, api, env, signal);
    await storage.write(name, receipt);
  }
  if (!receipt.noChanges) {
    try {
      await session.apply(receipt, env, signal);
    } catch {
      const evidence = await observeAzureTerraformDestroyBoundary(plan, api, signal);
      await storage.write('azure-terraform-cloud-destroy-reconciliation.json', evidence);
      await session.reconcileApplyFromEvidence(receipt, canonicalSha256(evidence));
      if (evidence.status !== 'absent') {
        receipt = await session.planDestroy(env, signal);
        await verifyAzureTerraformDestroyOwnership(plan, receipt, session, api, env, signal);
        await storage.write(name, receipt);
        if (!receipt.noChanges) await session.apply(receipt, env, signal);
      }
    }
  }
  const final = await session.planDestroy(env, signal);
  if (
    final.engine !== 'terraform' ||
    final.operation !== 'destroy' ||
    final.deploymentId !== plan.deploymentName ||
    final.backendIdentity !== `local:${plan.deploymentName}` ||
    !final.noChanges ||
    final.changes.length
  )
    throw new Error('Azure Terraform cloud teardown did not converge to no changes');
  await storage.write('azure-terraform-cloud-destroy-final.json', final);
  return {
    status: 'terraform-cloud-retired',
    sourcePlanSha256: plan.planSha256,
    finalPlanSha256: final.planSha256,
  };
}
var init_terraform_cloud_teardown = __esm(() => {
  init_artifacts();
  init_canonical();
  init_terraform_destroy_ownership();
  init_terraform_pending_import();
});

// plugins/azure/src/ce/terraform-foundation-teardown.ts
import { createHash as createHash12 } from 'node:crypto';
import { lstat as lstat2, readdir as readdir2, readFile as readFile6, realpath } from 'node:fs/promises';
import { join as join5 } from 'node:path';

async function optional10(store, name) {
  try {
    return await store.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function deployment(base, version) {
  if (!['1.16.1', '1.16.5'].includes(version)) throw Error('Azure foundation retirement runtime is unqualified');
  const value = await azureTerraformFoundationDeployment(base);
  const config = JSON.parse(value.configuration);
  config.terraform.required_version = `= ${version}`;
  return { ...value, terraformVersion: version, configuration: JSON.stringify(config) };
}
async function privateManifest(store, name) {
  await store.verify();
  const directory = join5(store.directory, name);
  const dir = await lstat2(directory);
  if (
    !dir.isDirectory() ||
    dir.isSymbolicLink() ||
    dir.uid !== process.getuid?.() ||
    (await realpath(directory)) !== directory
  )
    throw Error('Azure foundation workspace ownership differs');
  const file = join5(directory, 'deployment.json');
  const stat = await lstat2(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.uid !== process.getuid?.() || stat.mode & 63)
    throw Error('Azure foundation manifest ownership differs');
  return object17(JSON.parse(await readFile6(file, 'utf8')));
}
async function journal(base, store, reservedSite) {
  verifyAzureCePlan(base);
  await store.verify();
  if (
    base.engine !== 'terraform' ||
    base.intent.operation !== 'deploy' ||
    canonicalSha256(store.owner) !== canonicalSha256(azureUpgradeBinding(base).owner)
  )
    throw Error('Azure foundation retirement requires the original owning deployment');
  const authorization = object17(await store.read(`terraform-authorization-${base.planSha256}.json`));
  const workflow = object17(await store.read('terraform-workflow.json'));
  if (
    authorization.schemaVersion !== 1 ||
    authorization.engine !== 'terraform' ||
    authorization.planSha256 !== base.planSha256 ||
    authorization.mutations !== true ||
    workflow.schemaVersion !== 1 ||
    workflow.engine !== 'terraform' ||
    workflow.planSha256 !== base.planSha256 ||
    workflow.stage !== 'network-pending' ||
    !sha(workflow.configurationSha256) ||
    Object.keys(object17(workflow.bootstrapByNode)).length ||
    Object.keys(object17(workflow.launchedAtByNode)).length
  )
    throw Error('Azure foundation retirement requires exact pre-admission authorization and journal');
  if (reservedSite) {
    const binding = azureUpgradeBinding(base);
    const site = object17(await store.read('terraform-site.json'));
    const saved = object17(await store.read(`site-binding-${base.siteName}.json`));
    const origin = new URL(String(saved.tenantOrigin));
    if (
      site.siteName !== base.siteName ||
      site.uid !== reservedSite.siteUid ||
      canonicalSha256(site.owner) !== canonicalSha256(binding.owner) ||
      site.contractFingerprint !== saved.contractFingerprint ||
      saved.schemaVersion !== 1 ||
      saved.siteUid !== reservedSite.siteUid ||
      canonicalSha256(saved.binding) !== canonicalSha256(binding) ||
      !Array.isArray(saved.expectedInterfaces) ||
      saved.expectedInterfaces.length ||
      origin.protocol !== 'https:' ||
      origin.username ||
      origin.password ||
      origin.search ||
      origin.hash ||
      origin.pathname !== '/'
    )
      throw Error('Reserved Azure site provenance differs');
  }
  const allowed = new Set([
    'owner.json',
    base.deploymentName,
    `terraform-authorization-${base.planSha256}.json`,
    'terraform-workflow.json',
    'terraform-foundation-plan.json',
    'azure-terraform-lifecycle-retirement.json',
    'azure-terraform-cloud-destroy-plan.json',
    'azure-terraform-cloud-destroy-final.json',
    'azure-terraform-cloud-destroy-reconciliation.json',
    checkpointName3,
    receiptName,
  ]);
  for (const entry of await readdir2(store.directory, { withFileTypes: true })) {
    if (reservedSite && ['terraform-site.json', `site-binding-${base.siteName}.json`].includes(entry.name)) {
      if (!entry.isFile()) throw Error('Reserved Azure site artifact type differs');
      continue;
    }
    if (allowed.has(entry.name)) {
      if (entry.name !== base.deploymentName && !entry.isFile()) throw Error('Azure retirement journal type differs');
      continue;
    }
    if (/^azure-ce-foundation-teardown-[a-f0-9]{24}(?:-authorization)?\.json$/.test(entry.name) && entry.isFile())
      continue;
    if (entry.name === '.azure-terraform-lifecycle-lock' && entry.isDirectory()) continue;
    throw Error('Azure admission or another lifecycle has started; explicit platform retirement is required');
  }
  return workflow;
}
function requireAbsence(value, base, runtime, contract) {
  const at = Date.parse(value.observedAt);
  if (
    value.status !== 'absent' ||
    canonicalSha256(value.owner) !== canonicalSha256(azureUpgradeBinding(base).owner) ||
    value.siteContractFingerprint !== runtime.contract.fingerprint ||
    value.ingressContractFingerprint !== contract.fingerprint ||
    !Number.isFinite(at) ||
    at > Date.now() ||
    Date.now() - at > 60000
  )
    throw Error('Fresh unregistered Azure platform absence is unavailable');
  return value;
}
function requireReservedObservation(value, base, runtime, contract, expected, exact) {
  const at = Date.parse(value.observedAt);
  if (value.status !== 'observed') throw Error('Fresh reserved Azure site inventory unavailable');
  const site = value.sites?.[0];
  if (
    canonicalSha256(value.owner) !== canonicalSha256(azureUpgradeBinding(base).owner) ||
    value.siteContractFingerprint !== runtime.contract.fingerprint ||
    value.ingressContractFingerprint !== contract.fingerprint ||
    !Number.isFinite(at) ||
    at > Date.now() ||
    Date.now() - at > 60000 ||
    !Array.isArray(value.resources) ||
    value.resources.length ||
    !Array.isArray(value.sites) ||
    value.sites.length !== 1 ||
    !site ||
    site.siteName !== base.siteName ||
    (site.siteUid !== expected.siteUid && (exact || site.siteUid !== null)) ||
    (site.physicalSiteUid !== expected.physicalSiteUid && (exact || site.physicalSiteUid !== null)) ||
    (expected.physicalSiteUid !== null &&
      (typeof expected.physicalSiteUid !== 'string' || !expected.physicalSiteUid.trim()))
  )
    throw Error('Fresh reserved Azure site inventory differs or enrollment has started');
  return value;
}
function compile(base, source, site, ingress, reservedSite) {
  verifyAzureCePlan(base);
  if (
    base.engine !== 'terraform' ||
    !sha(source.configurationSha256) ||
    !sha(source.manifestSha256) ||
    !/^sha256:[a-f0-9]{64}$/.test(site) ||
    !/^sha256:[a-f0-9]{64}$/.test(ingress)
  )
    throw Error('Azure foundation teardown source or contract differs');
  const draft = {
    schemaVersion: 1,
    kind: 'azure-ce-terraform-foundation-teardown',
    engine: 'terraform',
    sourcePlanSha256: base.planSha256,
    source: structuredClone(source),
    drain: {
      schemaVersion: 1,
      owner: azureUpgradeBinding(base).owner,
      sourcePlanSha256: base.planSha256,
      siteContractFingerprint: site,
      ingressContractFingerprint: ingress,
      sites: [],
      listeners: [],
      origins: [],
    },
    retirement: [],
    ...(reservedSite ? { reservedSite: structuredClone(reservedSite) } : {}),
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `azure-ce-foundation-teardown-${planSha256.slice(0, 24)}`, planSha256 };
}
async function prepareAzureFoundationTeardown(base, runtime, contract, store, signal) {
  signal?.throwIfAborted();
  if (runtime.engine !== 'terraform') throw Error('Azure foundation teardown runtime engine differs');
  const savedSite = await optional10(store, 'terraform-site.json');
  let reservedSite;
  if (savedSite !== undefined) {
    const value = object17(savedSite);
    if (
      typeof value.uid !== 'string' ||
      !value.uid.trim() ||
      value.contractFingerprint !== runtime.contract.fingerprint
    )
      throw Error('Reserved Azure site checkpoint differs; admission provenance required');
    const observation = await runtime.preRegistrationInventory(
      [azureUpgradeBinding(base)],
      ['default'],
      contract,
      signal,
    );
    if (observation.status !== 'observed') throw Error('Fresh reserved Azure site inventory unavailable');
    reservedSite = { siteUid: value.uid, physicalSiteUid: observation.sites?.[0]?.physicalSiteUid ?? null };
    requireReservedObservation(observation, base, runtime, contract, reservedSite, true);
  }
  const workflow = await journal(base, store, reservedSite);
  const actual = await privateManifest(store, base.deploymentName);
  const expected = manifest(await deployment(base, String(actual.terraformVersion)));
  if (
    canonicalSha256(actual) !== canonicalSha256(expected) ||
    workflow.configurationSha256 !== expected.configurationSha256
  )
    throw Error('Azure foundation source manifest or configuration differs');
  const source = {
    terraformVersion: String(actual.terraformVersion),
    configurationSha256: expected.configurationSha256,
    manifestSha256: canonicalSha256(expected),
  };
  const plan = compile(base, source, runtime.contract.fingerprint, contract.fingerprint, reservedSite);
  for (let i = 0; i < 2; i++) {
    signal?.throwIfAborted();
    if (reservedSite)
      requireReservedObservation(
        await runtime.preRegistrationInventory([azureUpgradeBinding(base)], ['default'], contract, signal),
        base,
        runtime,
        contract,
        reservedSite,
        true,
      );
    else
      requireAbsence(
        await runtime.unregisteredAbsence([azureUpgradeBinding(base)], ['default'], contract, signal),
        base,
        runtime,
        contract,
      );
  }
  await journal(base, store, reservedSite);
  if (canonicalSha256(await privateManifest(store, base.deploymentName)) !== source.manifestSha256)
    throw Error('Azure foundation source changed during preparation');
  await store.write(`${plan.planId}.json`, plan);
  return plan;
}
async function azureFoundationTeardownDeployment(base, plan) {
  const value = await deployment(base, plan.source.terraformVersion);
  if (
    hash5(value.configuration) !== plan.source.configurationSha256 ||
    canonicalSha256(manifest(value)) !== plan.source.manifestSha256
  )
    throw Error('Azure foundation teardown source deployment differs');
  return value;
}
async function runAzureFoundationTeardown(
  base,
  input,
  authorized,
  runtime,
  contract,
  session,
  store,
  api,
  env,
  signal,
) {
  base = structuredClone(base);
  input = structuredClone(input);
  env = { ...env };
  const sourceDeployment = await azureFoundationTeardownDeployment(base, input);
  const empty = emptyConfiguration(sourceDeployment);
  let checkpoint = await optional10(store, checkpointName3);
  const validFinal = (final) =>
    !!final &&
    final.schemaVersion === 1 &&
    final.engine === 'terraform' &&
    final.noChanges === true &&
    Array.isArray(final.changes) &&
    final.changes.length === 0 &&
    !final.operation &&
    !final.actionInvocations &&
    !final.imports &&
    !final.relinquishments &&
    final.deploymentId === base.deploymentName &&
    final.backendIdentity === `local:${base.deploymentName}` &&
    final.configurationSha256 === hash5(empty) &&
    final.providerLockSha256 === hash5(sourceDeployment.providerLock) &&
    sha(final.planSha256);
  if (
    checkpoint &&
    (checkpoint.schemaVersion !== 1 ||
      checkpoint.sourcePlanSha256 !== base.planSha256 ||
      checkpoint.teardownPlanSha256 !== input.planSha256 ||
      !['cloud-pending', 'cloud-retired', 'retiring', 'retired'].includes(checkpoint.phase) ||
      (checkpoint.phase !== 'cloud-pending' && !sha(checkpoint.emptyEvidenceSha256)) ||
      (['retiring', 'retired'].includes(checkpoint.phase) &&
        (!validFinal(checkpoint.finalPlan) || !sha(checkpoint.retirementEvidenceSha256))))
  )
    throw Error('Azure foundation teardown checkpoint differs');
  const validate = async () => {
    signal?.throwIfAborted();
    await journal(base, store, input.reservedSite);
    if (
      input.reservedSite &&
      object17(await store.read('terraform-site.json')).contractFingerprint !== runtime.contract.fingerprint
    )
      throw Error('Reserved Azure site contract changed');
    if (
      runtime.engine !== 'terraform' ||
      authorized !== input.planSha256 ||
      canonicalSha256(input) !==
        canonicalSha256(
          compile(base, input.source, runtime.contract.fingerprint, contract.fingerprint, input.reservedSite),
        ) ||
      canonicalSha256(await store.read(`${input.planId}.json`)) !== canonicalSha256(input)
    )
      throw Error('Azure foundation teardown immutable authorization or contract differs');
    const actual = await privateManifest(store, base.deploymentName);
    if (
      canonicalSha256(actual) !== canonicalSha256(manifest(sourceDeployment)) &&
      !(
        checkpoint &&
        checkpoint.phase !== 'cloud-pending' &&
        canonicalSha256(actual) === canonicalSha256(manifest({ ...sourceDeployment, configuration: empty }))
      )
    )
      throw Error('Azure foundation teardown current manifest differs');
  };
  const fresh = async (mustBeAbsent) => {
    await validate();
    const platform = requireAbsence(
      await runtime.unregisteredAbsence([azureUpgradeBinding(base)], ['default'], contract, signal),
      base,
      runtime,
      contract,
    );
    const cloud = await observeAzureTerraformDestroyBoundary(base, api, signal);
    if (mustBeAbsent && cloud.status !== 'absent') throw Error('Azure foundation cloud absence has not converged');
    return { platform, cloud };
  };
  await validate();
  if (input.reservedSite && (!checkpoint || checkpoint.phase === 'cloud-pending')) {
    requireReservedObservation(
      await runtime.preRegistrationInventory([azureUpgradeBinding(base)], ['default'], contract, signal),
      base,
      runtime,
      contract,
      input.reservedSite,
      false,
    );
    await beginAzureTerraformRetirement(base, input, store);
    await validate();
    requireReservedObservation(
      await runtime.preRegistrationInventory([azureUpgradeBinding(base)], ['default'], contract, signal),
      base,
      runtime,
      contract,
      input.reservedSite,
      false,
    );
    const deletion = await runtime.deleteSiteExact(azureUpgradeBinding(base), input.reservedSite.siteUid, signal);
    if (deletion.status !== 'deleted') return { status: 'pending-reserved-site-retirement' };
  }
  await fresh(checkpoint !== undefined && checkpoint.phase !== 'cloud-pending');
  await beginAzureTerraformRetirement(base, input, store);
  if (!checkpoint) {
    checkpoint = {
      schemaVersion: 1,
      sourcePlanSha256: base.planSha256,
      teardownPlanSha256: input.planSha256,
      phase: 'cloud-pending',
    };
    await store.write(checkpointName3, checkpoint);
  }
  if (checkpoint.phase === 'cloud-pending') {
    await runAzureTerraformCloudTeardown(base, session, store, api, env, signal);
    const absence = await fresh(true);
    checkpoint.phase = 'cloud-retired';
    checkpoint.emptyEvidenceSha256 = canonicalSha256(absence);
    await store.write(checkpointName3, checkpoint);
  }
  if (checkpoint.phase === 'cloud-retired') {
    if (!session.cancelUnsubmittedPlan || !session.retireArtifacts || !sha(checkpoint.emptyEvidenceSha256))
      throw Error('Azure owning runner cancellation or retirement service is unavailable');
    await fresh(true);
    const destroy = await store.read('azure-terraform-cloud-destroy-final.json');
    if (
      !destroy.noChanges ||
      destroy.operation !== 'destroy' ||
      destroy.changes.length ||
      destroy.deploymentId !== base.deploymentName ||
      destroy.backendIdentity !== `local:${base.deploymentName}`
    )
      throw Error('Azure foundation final destroy receipt differs');
    await session.cancelUnsubmittedPlan(
      destroy,
      input.source.configurationSha256,
      empty,
      checkpoint.emptyEvidenceSha256,
    );
    const final = await session.plan(env, signal);
    if (!validFinal(final)) throw Error('Azure foundation final refresh-enabled empty plan differs');
    const absence = await fresh(true);
    checkpoint.finalPlan = final;
    checkpoint.retirementEvidenceSha256 = canonicalSha256(absence);
    checkpoint.phase = 'retiring';
    await store.write(checkpointName3, checkpoint);
  }
  if (checkpoint.phase === 'retiring') {
    await fresh(true);
    if (!session.retireArtifacts || !checkpoint.finalPlan || !sha(checkpoint.retirementEvidenceSha256))
      throw Error('Azure foundation terminal retirement evidence is incomplete');
    checkpoint.artifacts = await session.retireArtifacts(
      checkpoint.finalPlan,
      checkpoint.retirementEvidenceSha256,
      env,
      signal,
    );
    checkpoint.phase = 'retired';
    await store.write(checkpointName3, checkpoint);
  }
  await fresh(true);
  if (!checkpoint.finalPlan || !checkpoint.artifacts || !sha(checkpoint.retirementEvidenceSha256))
    throw Error('Azure foundation terminal receipt is incomplete');
  const artifacts = object17(checkpoint.artifacts);
  if (
    artifacts.status !== 'runner-artifacts-retired' ||
    artifacts.manifestSha256 !== canonicalSha256(manifest({ ...sourceDeployment, configuration: empty })) ||
    artifacts.evidenceSha256 !== checkpoint.retirementEvidenceSha256 ||
    artifacts.finalPlanSha256 !== checkpoint.finalPlan.planSha256 ||
    !sha(artifacts.inventorySha256) ||
    !Number.isSafeInteger(artifacts.retiredArtifacts) ||
    Number(artifacts.retiredArtifacts) < 0
  )
    throw Error('Azure foundation artifact retirement receipt differs');
  const receipt = {
    status: 'deployment-artifacts-retired',
    sourcePlanSha256: base.planSha256,
    teardownPlanSha256: input.planSha256,
    finalPlanSha256: checkpoint.finalPlan.planSha256,
    artifacts: checkpoint.artifacts,
    cloud: 'absent',
    platform: 'absent',
  };
  await store.write(receiptName, receipt);
  return receipt;
}
var hash5 = (v) => createHash12('sha256').update(v).digest('hex'),
  sha = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v),
  object17 = (v) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('Malformed Azure foundation retirement evidence');
    return v;
  },
  checkpointName3 = 'azure-terraform-foundation-teardown-checkpoint.json',
  receiptName = 'azure-terraform-foundation-teardown-receipt.json',
  manifest = ({ configuration, providerLock, ...identity }) => ({
    ...identity,
    configurationSha256: hash5(configuration),
    providerLockSha256: hash5(providerLock),
  }),
  emptyConfiguration = (value) => {
    const config = JSON.parse(value.configuration);
    return JSON.stringify({ terraform: config.terraform, provider: config.provider });
  };
var init_terraform_foundation_teardown = __esm(() => {
  init_artifacts();
  init_canonical();
  init_terraform_cloud_teardown();
  init_terraform_destroy_ownership();
  init_terraform_foundation();
  init_terraform_retirement();
  init_terraform_upgrade();
});

// plugins/azure/src/ce/terraform-pending-admission.ts
import { createHash as createHash13 } from 'node:crypto';
import { lstat as lstat3, readdir as readdir3, readFile as readFile7, realpath as realpath2 } from 'node:fs/promises';
import { join as join6 } from 'node:path';

async function azurePendingAdmissionJournal(base, storage, fingerprint, verifyManifest = false) {
  verifyAzureCePlan(base);
  const binding = azureUpgradeBinding(base);
  await storage.verify();
  if (
    base.engine !== 'terraform' ||
    base.intent.operation !== 'deploy' ||
    base.topology.nodeCount !== 1 ||
    canonicalSha256(storage.owner) !== canonicalSha256(binding.owner)
  )
    throw Error('Azure pending admission owner or profile differs');
  const auth = object18(await storage.read(`terraform-authorization-${base.planSha256}.json`));
  const workflow = object18(await storage.read('terraform-workflow.json'));
  const bootstrap = object18(workflow.bootstrapByNode);
  if (
    auth.schemaVersion !== 1 ||
    auth.engine !== 'terraform' ||
    auth.planSha256 !== base.planSha256 ||
    auth.mutations !== true ||
    workflow.schemaVersion !== 1 ||
    workflow.engine !== 'terraform' ||
    workflow.planSha256 !== base.planSha256 ||
    workflow.stage !== 'network-pending' ||
    Object.keys(object18(workflow.launchedAtByNode)).length ||
    Object.keys(bootstrap).length !== 1 ||
    typeof bootstrap['1'] !== 'string'
  )
    throw Error('Azure failed-admission journal differs or launch has completed');
  const deployment = await azureTerraformFoundationDeployment(base, { 1: bootstrap['1'] });
  if (workflow.configurationSha256 !== hash6(deployment.configuration))
    throw Error('Azure pending admission configuration differs');
  const site = object18(await storage.read('terraform-site.json'));
  const saved = object18(await storage.read(`site-binding-${base.siteName}.json`));
  if (
    site.siteName !== base.siteName ||
    typeof site.uid !== 'string' ||
    !site.uid.trim() ||
    canonicalSha256(site.owner) !== canonicalSha256(binding.owner) ||
    site.contractFingerprint !== fingerprint ||
    saved.schemaVersion !== 1 ||
    saved.contractFingerprint !== fingerprint ||
    saved.siteUid !== site.uid ||
    canonicalSha256(saved.binding) !== canonicalSha256(binding) ||
    !Array.isArray(saved.expectedInterfaces) ||
    saved.expectedInterfaces.length
  )
    throw Error('Azure pending admission site provenance differs');
  const origin = new URL(String(saved.tenantOrigin));
  if (
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  )
    throw Error('Azure pending tenant origin differs');
  const tokenName = `${base.deploymentName.slice(0, 40)}-1-${base.planSha256.slice(0, 12)}`;
  const token = object18(await storage.read(`${tokenName}.json`));
  if (
    token.tokenName !== tokenName ||
    token.siteName !== base.siteName ||
    token.node !== binding.nodes[0] ||
    typeof token.jwt !== 'string' ||
    !token.jwt
  )
    throw Error('Azure pending enrollment provenance differs');
  const admission = object18(await storage.read('terraform-admission-plan-node-1.json'));
  if (
    admission.schemaVersion !== 1 ||
    admission.engine !== 'terraform' ||
    admission.deploymentId !== base.deploymentName ||
    admission.backendIdentity !== deployment.backendIdentity ||
    admission.configurationSha256 !== workflow.configurationSha256 ||
    admission.providerLockSha256 !== hash6(deployment.providerLock) ||
    typeof admission.planSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(admission.planSha256)
  )
    throw Error('Azure pending admission saved plan differs');
  for (const entry of await readdir3(storage.directory))
    if (/^(?:terraform-registration|terraform-routing|ingress-plan-|azure-ce-upgrade-|azure-ce-replace-)/.test(entry))
      throw Error('Azure post-admission lifecycle has started');
  if (verifyManifest) {
    const directory = join6(storage.directory, base.deploymentName),
      file = join6(directory, 'deployment.json');
    const d = await lstat3(directory),
      f = await lstat3(file);
    if (
      !d.isDirectory() ||
      d.isSymbolicLink() ||
      d.uid !== process.getuid?.() ||
      (await realpath2(directory)) !== directory ||
      !f.isFile() ||
      f.isSymbolicLink() ||
      f.uid !== process.getuid?.() ||
      f.nlink !== 1 ||
      f.mode & 63
    )
      throw Error('Azure pending executor ownership differs');
    const { configuration, providerLock, ...identity } = deployment;
    const expected = {
      ...identity,
      configurationSha256: hash6(configuration),
      providerLockSha256: hash6(providerLock),
    };
    if (canonicalSha256(JSON.parse(await readFile7(file, 'utf8'))) !== canonicalSha256(expected))
      throw Error('Azure pending frozen executor differs');
  }
  return {
    sha256: canonicalSha256({ auth, workflow, site, saved, token, admission }),
    siteUid: site.uid,
    tokenName,
    node: binding.nodes[0],
  };
}
async function observeAzurePendingAdmission(base, runtime, contract, storage, signal) {
  const journal = await azurePendingAdmissionJournal(base, storage, runtime.contract.fingerprint);
  const value = await runtime.preRegistrationInventory([azureUpgradeBinding(base)], ['default'], contract, signal);
  const at = Date.parse(value.observedAt);
  if (
    value.status !== 'observed' ||
    canonicalSha256(value.owner) !== canonicalSha256(storage.owner) ||
    value.siteContractFingerprint !== runtime.contract.fingerprint ||
    value.ingressContractFingerprint !== contract.fingerprint ||
    !Number.isFinite(at) ||
    at > Date.now() ||
    Date.now() - at > 60000 ||
    value.sites.length !== 1 ||
    value.resources.length > 1 ||
    (value.sites[0].siteUid !== null &&
      (typeof value.sites[0].siteUid !== 'string' || !value.sites[0].siteUid.trim())) ||
    (value.sites[0].physicalSiteUid !== null &&
      (typeof value.sites[0].physicalSiteUid !== 'string' || !value.sites[0].physicalSiteUid.trim())) ||
    (value.sites[0].siteUid !== null && value.sites[0].siteUid === value.sites[0].physicalSiteUid) ||
    value.resources.some((row) => row.uid === value.sites[0].siteUid || row.uid === value.sites[0].physicalSiteUid) ||
    value.sites[0].siteName !== base.siteName ||
    value.resources.some(
      (row) =>
        row.kind !== 'tokens' ||
        row.namespace !== 'system' ||
        typeof row.uid !== 'string' ||
        !row.uid.trim() ||
        row.name !== journal.tokenName ||
        row.node !== journal.node ||
        row.siteName !== base.siteName,
    )
  )
    throw Error('Azure pending admission inventory is incomplete');
  return { value, journal };
}
var hash6 = (value) => createHash13('sha256').update(value).digest('hex'),
  object18 = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw Error('Invalid Azure pending admission journal');
    return value;
  };
var init_terraform_pending_admission = __esm(() => {
  init_artifacts();
  init_canonical();
  init_terraform_foundation();
  init_terraform_upgrade();
});

// plugins/platform/src/ce/token-store.ts
import { createHash as createHash14, randomUUID as randomUUID2 } from 'node:crypto';
import {
  chmod as chmod2,
  lstat as lstat4,
  mkdir as mkdir2,
  readdir as readdir4,
  readFile as readFile8,
  realpath as realpath3,
  rename as rename2,
  unlink,
  writeFile as writeFile3,
} from 'node:fs/promises';
import { isAbsolute, join as join7, resolve, sep } from 'node:path';

function assertWithin(root, target) {
  const base = resolve(root);
  const candidate = resolve(target);
  if (candidate !== base && !candidate.startsWith(`${base}${sep}`))
    throw new Error('Bootstrap path escapes the secure root');
}
async function retireBootstrapToken(binding, evidenceSha256, signal) {
  signal?.throwIfAborted();
  const match = /^f5xc-ce:\/\/([a-zA-Z0-9._-]{1,128})\/([a-zA-Z0-9._-]{1,128})$/.exec(binding.reference);
  if (
    !match ||
    binding.schemaVersion !== 1 ||
    !isAbsolute(binding.root) ||
    resolve(binding.root) !== binding.root ||
    !/^[a-f0-9]{64}$/.test(binding.digest) ||
    !/^[a-f0-9]{64}$/.test(evidenceSha256) ||
    binding.uid !== (process.getuid?.() ?? null) ||
    !Number.isFinite(Date.parse(binding.expiresAt))
  )
    throw Error('Bootstrap retirement binding differs');
  const [, session, id] = match;
  const directory = join7(binding.root, session, id);
  for (const path of [binding.root, join7(binding.root, session), directory]) {
    assertWithin(binding.root, path);
    const stat = await lstat4(path);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.uid !== binding.uid ||
      (stat.mode & 511) !== 448 ||
      (await realpath3(path)) !== path
    )
      throw Error('Bootstrap retirement directory differs');
  }
  const secureFile = async (name) => {
    const path = join7(directory, name),
      stat = await lstat4(path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.nlink !== 1 ||
      stat.uid !== binding.uid ||
      (stat.mode & 511) !== 384
    )
      throw Error('Bootstrap retirement file differs');
    return readFile8(path);
  };
  const names = await readdir4(directory);
  if (names.some((name) => !['metadata.json', 'token'].includes(name)))
    throw Error('Bootstrap checkout has in-flight or unknown artifacts');
  const metadata = JSON.parse((await secureFile('metadata.json')).toString());
  if (
    metadata.version !== 1 ||
    metadata.session !== session ||
    metadata.id !== id ||
    metadata.uid !== binding.uid ||
    metadata.digest !== binding.digest ||
    metadata.expiresAt !== binding.expiresAt ||
    typeof metadata.consumed !== 'boolean'
  )
    throw Error('Bootstrap retirement metadata differs');
  const receipt = {
    schemaVersion: 1,
    status: 'bootstrap-secret-retired',
    reference: binding.reference,
    digest: binding.digest,
    evidenceSha256,
  };
  if (metadata.checkoutReady !== true) throw Error('Bootstrap checkout issuance is incomplete');
  if (metadata.retirementPending && JSON.stringify(metadata.retirementPending) !== JSON.stringify(receipt))
    throw Error('Bootstrap pending retirement evidence differs');
  if (metadata.retirement && JSON.stringify(metadata.retirement) !== JSON.stringify(receipt))
    throw Error('Bootstrap retirement evidence differs');
  const persist = async (value) => {
    const temporary = join7(directory, `metadata-${randomUUID2()}.tmp`);
    try {
      await writeFile3(temporary, JSON.stringify(value), { mode: 384, flag: 'wx' });
      await rename2(temporary, join7(directory, 'metadata.json'));
    } finally {
      await unlink(temporary).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
  };
  if (!names.includes('token') && !metadata.consumed && !metadata.retirementPending)
    throw Error('Unconsumed bootstrap token is missing');
  if (names.includes('token')) {
    if (metadata.retirement || metadata.consumed)
      throw Error('Bootstrap secret reappeared after consumption or retirement');
    const bytes = await secureFile('token');
    if (createHash14('sha256').update(bytes).digest('hex') !== binding.digest)
      throw Error('Bootstrap retirement token digest differs');
    signal?.throwIfAborted();
    if (!metadata.retirementPending) await persist({ ...metadata, retirementPending: receipt });
    signal?.throwIfAborted();
    await unlink(join7(directory, 'token'));
  }
  signal?.throwIfAborted();
  if (!metadata.retirement)
    await persist({ ...metadata, consumed: true, retirementPending: receipt, retirement: receipt });
  return receipt;
}
var init_token_store = () => {};

// plugins/azure/src/ce/terraform-parent-retirement.ts
import { createHash as createHash15 } from 'node:crypto';
import {
  lstat as lstat5,
  readdir as readdir5,
  readFile as readFile9,
  realpath as realpath4,
  unlink as unlink2,
} from 'node:fs/promises';
import { join as join8 } from 'node:path';

async function retireAzureTerraformParentArtifacts(base, teardown, evidenceSha256, store, signal) {
  const binding = azureUpgradeBinding(base);
  if (
    base.engine !== 'terraform' ||
    canonicalSha256(store.owner) !== canonicalSha256(binding.owner) ||
    teardown.sourcePlanSha256 !== base.planSha256 ||
    !sha2(teardown.planSha256) ||
    !sha2(evidenceSha256) ||
    !/^azure-ce-teardown-[a-z0-9-]+$/.test(teardown.planId)
  )
    throw Error('Azure parent retirement owner or source differs');
  signal?.throwIfAborted();
  await store.verify();
  const lifecycle = object19(await store.read('azure-terraform-lifecycle-retirement.json')),
    authorization = object19(await store.read(`${teardown.planId}-authorization.json`)),
    terminal = object19(await store.read('azure-terraform-terminal-cleanup.json'));
  if (
    lifecycle.sourcePlanSha256 !== base.planSha256 ||
    lifecycle.teardownPlanSha256 !== teardown.planSha256 ||
    lifecycle.kind !== teardown.kind ||
    canonicalSha256(lifecycle.owner) !== canonicalSha256(binding.owner) ||
    authorization.schemaVersion !== 1 ||
    authorization.engine !== 'terraform' ||
    authorization.sourcePlanSha256 !== base.planSha256 ||
    authorization.teardownPlanSha256 !== teardown.planSha256 ||
    authorization.mutations !== true ||
    canonicalSha256(await store.read(`${teardown.planId}.json`)) !== canonicalSha256(teardown) ||
    terminal.phase !== 'retired' ||
    terminal.sourcePlanSha256 !== base.planSha256 ||
    terminal.teardownPlanSha256 !== teardown.planSha256 ||
    terminal.retirementEvidenceSha256 !== evidenceSha256
  )
    throw Error('Azure parent retirement authorization or terminal evidence differs');
  const directory = async (path) => {
    const stat = await lstat5(path);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.uid !== process.getuid?.() ||
      (await realpath4(path)) !== path
    )
      throw Error('Azure parent directory differs');
  };
  const file = async (path) => {
    const stat = await lstat5(path);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.nlink !== 1 ||
      stat.uid !== process.getuid?.() ||
      stat.mode & 63
    )
      throw Error('Azure parent file differs');
    return readFile9(path);
  };
  const deployment = await azureTerraformCurrentDeployment(base),
    { configuration, providerLock, ...rest } = deployment;
  const expectedManifest = {
    ...rest,
    configurationSha256: hash7(configuration),
    providerLockSha256: hash7(providerLock),
  };
  const upgrades = new Map();
  const upgradeJournals = new Set();
  for (const name of (await readdir5(store.directory)).filter((name) =>
    /^azure-ce-upgrade-[a-f0-9]{24}\.json$/.test(name),
  )) {
    const source = object19(await store.read(name)),
      deployment = object19(source.deployment);
    const { planId, planSha256, ...draft } = source;
    if (
      source.schemaVersion !== 2 ||
      source.engine !== 'terraform' ||
      source.kind !== 'azure-ce-terraform-upgrade' ||
      source.sourcePlanSha256 !== base.planSha256 ||
      canonicalSha256(object19(source.expectation).binding) !== canonicalSha256(binding) ||
      !sha2(planSha256) ||
      canonicalSha256(draft) !== planSha256 ||
      planId !== `azure-ce-upgrade-${planSha256.slice(0, 24)}` ||
      name !== `${planId}.json` ||
      typeof deployment.stage !== 'string' ||
      !/^upgrade-(?:software|os)-[a-f0-9]{24}$/.test(deployment.stage) ||
      upgrades.has(deployment.stage)
    )
      throw Error('Azure upgrade source provenance differs');
    upgrades.set(deployment.stage, source);
    for (const suffix of ['', '-authorization', '-checkpoint', '-action-plan', '-receipt', '-stage-retirement'])
      upgradeJournals.add(`${planId}${suffix}.json`);
  }
  if (upgrades.size) {
    const serial = object19(await store.read('terraform-ce-upgrade-serial.json'));
    const last = [...upgrades.values()].find((row) => row.planId === serial.lastPlanId);
    if (
      serial.schemaVersion !== 2 ||
      serial.engine !== 'terraform' ||
      serial.status !== 'idle' ||
      serial.activePlanId !== undefined ||
      serial.activePlanSha256 !== undefined ||
      !last ||
      last.planSha256 !== serial.lastPlanSha256
    )
      throw Error('Azure serial upgrade provenance differs');
  }
  const preserve = new Set([
    'owner.json',
    'azure-terraform-lifecycle-retirement.json',
    'azure-terraform-terminal-cleanup.json',
    'azure-terraform-teardown-receipt.json',
    `${teardown.planId}.json`,
    `${teardown.planId}-authorization.json`,
  ]);
  for (const name of upgradeJournals) preserve.add(name);
  if (upgrades.size) preserve.add('terraform-ce-upgrade-serial.json');
  const allowed = new Set([
    'terraform-workflow.json',
    'terraform-registration-configuration.json',
    'terraform-registration-observation.json',
    'terraform-foundation-plan.json',
    'terraform-site.json',
    'azure-terraform-cloud-destroy-plan.json',
    'azure-terraform-cloud-destroy-final.json',
    'azure-terraform-cloud-destroy-reconciliation.json',
    'azure-terraform-pending-vm-import.json',
    'platform-drain-source.json',
    'platform-drain-progress.json',
    'platform-drain-receipt.json',
    `site-binding-${base.siteName}.json`,
  ]);
  const tokens = new Map(
    teardown.retirement.flatMap((site) =>
      site.tokens.map((token) => [`${token.name}.json`, { ...token, siteName: site.siteName }]),
    ),
  );
  let saved;
  try {
    saved = object19(await store.read(markerName));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const inventory = async (recorded) => {
    await directory(store.directory);
    const items = [];
    let runner = false;
    const add = async (path, keep) =>
      items.push({ path, preserve: keep, sha256: hash7(await file(join8(store.directory, path))) });
    for (const name of (await readdir5(store.directory)).sort()) {
      if (name === markerName || name === '.azure-terraform-lifecycle-lock') continue;
      if (name === base.deploymentName) {
        runner = true;
        const path = join8(store.directory, name);
        await directory(path);
        if (
          JSON.stringify((await readdir5(path)).sort()) !==
          JSON.stringify(['artifact-retirement.json', 'deployment.json'])
        )
          throw Error('Azure runner has unretired artifacts');
        const manifest = object19(JSON.parse((await file(join8(path, 'deployment.json'))).toString())),
          marker = object19(JSON.parse((await file(join8(path, 'artifact-retirement.json'))).toString()));
        const receipt = object19(terminal.artifacts),
          final = object19(terminal.final);
        if (
          canonicalSha256(manifest) !== canonicalSha256(expectedManifest) ||
          marker.schemaVersion !== 1 ||
          marker.status !== 'runner-artifacts-retired' ||
          marker.manifestSha256 !== canonicalSha256(manifest) ||
          marker.evidenceSha256 !== evidenceSha256 ||
          marker.finalPlanSha256 !== final.planSha256 ||
          receipt.finalPlanSha256 !== final.planSha256 ||
          receipt.manifestSha256 !== marker.manifestSha256 ||
          receipt.evidenceSha256 !== evidenceSha256 ||
          receipt.inventorySha256 !== marker.inventorySha256 ||
          !Array.isArray(marker.artifacts) ||
          marker.inventorySha256 !== hash7(JSON.stringify(marker.artifacts))
        )
          throw Error('Azure runner retirement provenance differs');
        for (const entry of ['artifact-retirement.json', 'deployment.json']) await add(`${name}/${entry}`, true);
        continue;
      }
      if (name === 'terraform-stages') {
        const stagesRoot = join8(store.directory, name);
        await directory(stagesRoot);
        for (const stage of (await readdir5(stagesRoot)).sort()) {
          const upgrade = upgrades.get(stage);
          if (!upgrade) throw Error('Unqualified Azure stage blocks parent retirement');
          const stagePath = join8(stagesRoot, stage);
          await directory(stagePath);
          if (JSON.stringify((await readdir5(stagePath)).sort()) !== JSON.stringify([base.deploymentName]))
            throw Error('Azure stage owner differs');
          const prefix = `${name}/${stage}/${base.deploymentName}`;
          const path = join8(store.directory, prefix);
          await directory(path);
          if (
            JSON.stringify((await readdir5(path)).sort()) !==
            JSON.stringify(['artifact-retirement.json', 'deployment.json'])
          )
            throw Error('Azure stage has unretired artifacts');
          const deployment = object19(upgrade.deployment),
            { configuration, providerLock, ...identity } = deployment;
          const manifest = object19(JSON.parse((await file(join8(path, 'deployment.json'))).toString()));
          const marker = object19(JSON.parse((await file(join8(path, 'artifact-retirement.json'))).toString()));
          const retirement = object19(await store.read(`${upgrade.planId}-stage-retirement.json`));
          const final = object19(retirement.receipt);
          if (
            typeof configuration !== 'string' ||
            typeof providerLock !== 'string' ||
            canonicalSha256(manifest) !==
              canonicalSha256({
                ...identity,
                configurationSha256: hash7(configuration),
                providerLockSha256: hash7(providerLock),
              }) ||
            retirement.schemaVersion !== 1 ||
            retirement.status !== 'retired' ||
            canonicalSha256(retirement.owner) !== canonicalSha256(binding.owner) ||
            retirement.sourcePlanSha256 !== base.planSha256 ||
            retirement.upgradePlanSha256 !== upgrade.planSha256 ||
            retirement.deploymentSha256 !== canonicalSha256(deployment) ||
            retirement.evidenceSha256 !== evidenceSha256 ||
            retirement.receiptSha256 !== canonicalSha256(final) ||
            final.noChanges !== true ||
            final.backendIdentity !== manifest.backendIdentity ||
            final.configurationSha256 !== manifest.configurationSha256 ||
            final.providerLockSha256 !== manifest.providerLockSha256 ||
            marker.schemaVersion !== 1 ||
            marker.status !== 'runner-artifacts-retired' ||
            marker.manifestSha256 !== canonicalSha256(manifest) ||
            marker.evidenceSha256 !== evidenceSha256 ||
            marker.finalPlanSha256 !== final.planSha256 ||
            marker.planReceiptSha256 !== canonicalSha256(final) ||
            !Array.isArray(marker.artifacts) ||
            marker.inventorySha256 !== hash7(JSON.stringify(marker.artifacts))
          )
            throw Error('Azure upgrade runner retirement provenance differs');
          for (const entry of ['artifact-retirement.json', 'deployment.json']) await add(`${prefix}/${entry}`, true);
        }
        continue;
      }
      const checkout = /^bootstrap-checkout-[a-f0-9-]{36}\.json$/.test(name);
      if (
        !preserve.has(name) &&
        !allowed.has(name) &&
        !tokens.has(name) &&
        !checkout &&
        !/^terraform-(?:authorization-[a-f0-9]{64}|admission-plan-node-[1-3])\.json$/.test(name)
      )
        throw Error('Unknown Azure parent artifact blocks retirement');
      if (name === 'azure-terraform-cloud-destroy-reconciliation.json') {
        const value = object19(await store.read(name));
        const observedAt = typeof value.observedAt === 'string' ? Date.parse(value.observedAt) : NaN;
        if (
          !['absent', 'owned'].includes(String(value.status)) ||
          (value.status === 'owned' && value.ownerPlanSha256 !== base.planSha256) ||
          value.resourceGroupId !==
            `/subscriptions/${base.subscription.id}/resourceGroups/${base.intent.resourceGroup}` ||
          !Number.isFinite(observedAt) ||
          observedAt > Date.now()
        )
          throw Error('Azure destroy reconciliation provenance differs');
      }
      if (tokens.has(name) && !recorded?.has(name)) {
        const value = object19(await store.read(name)),
          token = tokens.get(name);
        if (
          !token ||
          value.tokenName !== token.name ||
          value.siteName !== token.siteName ||
          value.node !== token.node ||
          typeof value.jwt !== 'string'
        )
          throw Error('Azure parent token identity differs');
      }
      if (checkout) {
        const value = object19(await store.read(name)),
          checkoutBinding = object19(value.checkout);
        if (
          value.schemaVersion !== 1 ||
          canonicalSha256(value.owner) !== canonicalSha256(binding.owner) ||
          canonicalSha256(value.binding) !== canonicalSha256(binding) ||
          value.siteUid !== teardown.retirement[0]?.siteUid ||
          value.contractFingerprint !== teardown.drain.siteContractFingerprint ||
          !tokens.has(`${String(value.tokenName)}.json`) ||
          tokens.get(`${String(value.tokenName)}.json`)?.node !== value.node ||
          name !== `bootstrap-checkout-${String(checkoutBinding.reference).split('/').at(-1)}.json`
        )
          throw Error('Azure bootstrap checkout provenance differs');
        if (!recorded?.has(name)) {
          const token = object19(await store.read(`${String(value.tokenName)}.json`));
          if (typeof token.jwt !== 'string' || hash7(token.jwt) !== checkoutBinding.digest)
            throw Error('Azure checkout upstream token differs');
        }
      }
      await add(name, preserve.has(name) || checkout);
    }
    if (!runner) throw Error('Azure owning runner retirement missing');
    return items.sort((a, b) => a.path.localeCompare(b.path));
  };
  if (!saved) {
    const artifacts = await inventory();
    saved = {
      schemaVersion: 1,
      status: 'retiring',
      owner: binding.owner,
      sourcePlanSha256: base.planSha256,
      teardownPlanSha256: teardown.planSha256,
      evidenceSha256,
      artifacts,
      inventorySha256: canonicalSha256(artifacts),
    };
    await store.write(markerName, saved);
  }
  if (
    saved.schemaVersion !== 1 ||
    !['retiring', 'deployment-artifacts-retired'].includes(String(saved.status)) ||
    canonicalSha256(saved.owner) !== canonicalSha256(binding.owner) ||
    saved.sourcePlanSha256 !== base.planSha256 ||
    saved.teardownPlanSha256 !== teardown.planSha256 ||
    saved.evidenceSha256 !== evidenceSha256 ||
    !Array.isArray(saved.artifacts) ||
    saved.inventorySha256 !== canonicalSha256(saved.artifacts)
  )
    throw Error('Azure parent checkpoint differs');
  const expected = new Map();
  for (const row of saved.artifacts) {
    const item = object19(row);
    if (
      typeof item.path !== 'string' ||
      item.path.split('/').some((part) => !part || part === '.' || part === '..') ||
      !sha2(item.sha256) ||
      typeof item.preserve !== 'boolean' ||
      expected.has(item.path)
    )
      throw Error('Azure parent inventory malformed');
    expected.set(item.path, item);
  }
  const current = await inventory(expected);
  if (
    current.some((item) => canonicalSha256(item) !== canonicalSha256(expected.get(item.path))) ||
    [...expected.values()].some((item) => item.preserve && !current.some((row) => row.path === item.path)) ||
    (saved.status === 'deployment-artifacts-retired' && current.some((item) => !item.preserve))
  )
    throw Error('Azure parent inventory changed');
  for (const item of current.filter((item) => item.path.startsWith('bootstrap-checkout-'))) {
    signal?.throwIfAborted();
    const value = object19(await store.read(item.path));
    await retireBootstrapToken(value.checkout, evidenceSha256, signal);
  }
  for (const item of current.filter((item) => !item.preserve)) {
    signal?.throwIfAborted();
    await directory(store.directory);
    await store.verify();
    if (hash7(await file(join8(store.directory, item.path))) !== item.sha256)
      throw Error('Azure parent artifact changed before deletion');
    signal?.throwIfAborted();
    await unlink2(join8(store.directory, item.path));
  }
  signal?.throwIfAborted();
  await store.write(markerName, { ...saved, status: 'deployment-artifacts-retired' });
  return {
    status: 'deployment-artifacts-retired',
    owner: binding.owner,
    sourcePlanSha256: base.planSha256,
    teardownPlanSha256: teardown.planSha256,
    evidenceSha256,
    inventorySha256: saved.inventorySha256,
    retiredArtifacts: [...expected.values()].filter((item) => !item.preserve).length,
  };
}
var markerName = 'azure-terraform-parent-artifact-retirement.json',
  hash7 = (value) => createHash15('sha256').update(value).digest('hex'),
  sha2 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value),
  object19 = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Malformed Azure parent retirement');
    return value;
  };
var init_terraform_parent_retirement = __esm(() => {
  init_token_store();
  init_canonical();
  init_terraform_foundation();
  init_terraform_upgrade();
});

// plugins/azure/src/ce/terraform-upgrade-retirement.ts
import { createHash as createHash16 } from 'node:crypto';
import { join as join9 } from 'node:path';

async function optional11(store, name) {
  try {
    return await store.read(name);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}
async function retireAzureTerraformUpgradeStage(base, input, contract, terraform, store, evidenceSha256, env, signal) {
  const upgrade = structuredClone(input);
  base = structuredClone(base);
  env = { ...env };
  await verifyAzureTerraformUpgrade(base, upgrade, contract);
  if (!sha3(evidenceSha256) || canonicalSha256(store.owner) !== canonicalSha256(upgrade.expectation.binding.owner))
    throw Error('Upgrade retirement owner or external absence differs');
  const release = await acquireProcessLock(join9(store.directory, '.upgrade-lock'));
  try {
    const checkpointName = `${upgrade.planId}-stage-retirement.json`;
    const validate = async () => {
      signal?.throwIfAborted();
      await store.verify();
      if (canonicalSha256(await store.read(`${upgrade.planId}.json`)) !== canonicalSha256(upgrade))
        throw Error('Upgrade retirement source differs');
      const serial = object20(await store.read('terraform-ce-upgrade-serial.json'));
      if (
        serial.schemaVersion !== 2 ||
        serial.engine !== 'terraform' ||
        serial.status !== 'idle' ||
        serial.activePlanId !== undefined ||
        serial.activePlanSha256 !== undefined ||
        typeof serial.lastPlanId !== 'string' ||
        !sha3(serial.lastPlanSha256)
      )
        throw Error('Active or malformed serial upgrade blocks retirement');
      if (!/^azure-ce-upgrade-[a-f0-9]{24}$/.test(serial.lastPlanId))
        throw Error('Serial Azure upgrade source differs');
      const last = await store.read(`${serial.lastPlanId}.json`);
      await verifyAzureTerraformUpgrade(base, last, contract);
      if (last.planSha256 !== serial.lastPlanSha256) throw Error('Serial Azure upgrade digest differs');
      const auth = object20(await store.read(`${upgrade.planId}-authorization.json`)),
        checkpoint = object20(await store.read(`${upgrade.planId}-checkpoint.json`)),
        action = object20(await store.read(`${upgrade.planId}-action-plan.json`)),
        receipt = object20(await store.read(`${upgrade.planId}-receipt.json`));
      if (
        auth.schemaVersion !== 2 ||
        auth.engine !== 'terraform' ||
        auth.sourcePlanSha256 !== base.planSha256 ||
        auth.upgradePlanSha256 !== upgrade.planSha256 ||
        auth.mutations !== true ||
        checkpoint.schemaVersion !== 2 ||
        checkpoint.engine !== 'terraform' ||
        checkpoint.sourcePlanSha256 !== base.planSha256 ||
        checkpoint.upgradePlanSha256 !== upgrade.planSha256 ||
        checkpoint.phase !== 'complete' ||
        !sha3(checkpoint.actionPlanSha256)
      )
        throw Error('Upgrade retirement authorization or completion differs');
      if (
        action.schemaVersion !== 1 ||
        action.engine !== 'terraform' ||
        action.deploymentId !== upgrade.deployment.deploymentId ||
        action.backendIdentity !== upgrade.deployment.backendIdentity ||
        action.configurationSha256 !== sha256Hex2(upgrade.deployment.configuration) ||
        action.providerLockSha256 !== sha256Hex2(upgrade.deployment.providerLock) ||
        action.operation ||
        action.noChanges !== false ||
        !Array.isArray(action.changes) ||
        action.changes.length ||
        !Array.isArray(action.actionInvocations) ||
        action.actionInvocations.length !== 1 ||
        canonicalSha256(action.actionInvocations[0]) !== canonicalSha256(upgrade.action) ||
        action.planSha256 !== checkpoint.actionPlanSha256 ||
        action.imports ||
        action.relinquishments
      )
        throw Error('Upgrade retirement action differs');
      if (
        receipt.status !== 'upgrade-complete' ||
        receipt.engine !== 'terraform' ||
        receipt.planId !== upgrade.planId ||
        receipt.planSha256 !== upgrade.planSha256 ||
        receipt.siteName !== upgrade.expectation.binding.siteName ||
        canonicalSha256(receipt.target) !== canonicalSha256(upgrade.expectation.target) ||
        receipt.actionPlanSha256 !== action.planSha256 ||
        !Number.isFinite(Date.parse(String(receipt.observedAt))) ||
        receipt.nodeHealth !== 'unknown' ||
        receipt.routing !== 'unknown' ||
        receipt.traffic !== 'unknown'
      )
        throw Error('Upgrade retirement completion receipt differs');
      return action;
    };
    const validateFinal = (v) => {
      const r = object20(v);
      if (
        r.schemaVersion !== 1 ||
        r.engine !== 'terraform' ||
        r.deploymentId !== upgrade.deployment.deploymentId ||
        r.backendIdentity !== upgrade.deployment.backendIdentity ||
        r.configurationSha256 !== sha256Hex2(upgrade.deployment.configuration) ||
        r.providerLockSha256 !== sha256Hex2(upgrade.deployment.providerLock) ||
        r.noChanges !== true ||
        !Array.isArray(r.changes) ||
        r.changes.length ||
        !sha3(r.planSha256) ||
        r.operation ||
        r.actionInvocations ||
        r.imports ||
        r.relinquishments
      )
        throw Error('Upgrade retirement requires an exact ordinary no-change plan');
      return r;
    };
    const validateCheckpoint = (v) => {
      const c = object20(v);
      if (
        c.schemaVersion !== 1 ||
        !['preparing', 'retiring', 'retired'].includes(String(c.status)) ||
        canonicalSha256(c.owner) !== canonicalSha256(store.owner) ||
        c.sourcePlanSha256 !== base.planSha256 ||
        c.upgradePlanSha256 !== upgrade.planSha256 ||
        c.deploymentSha256 !== canonicalSha256(upgrade.deployment) ||
        c.evidenceSha256 !== evidenceSha256 ||
        (c.status !== 'preparing' && c.receiptSha256 !== canonicalSha256(c.receipt)) ||
        (c.status === 'preparing' && (c.receipt !== undefined || c.receiptSha256 !== undefined))
      )
        throw Error('Upgrade stage retirement checkpoint differs');
      return { bound: c, receipt: c.status === 'preparing' ? undefined : validateFinal(c.receipt) };
    };
    const action = await validate();
    let checkpoint = await optional11(store, checkpointName);
    if (checkpoint !== undefined) validateCheckpoint(checkpoint);
    const session = await terraform.open(store.owner, upgrade.deployment, 'current');
    if (!session.retireArtifacts || !session.readConfigurationSha256)
      throw Error('Owning upgrade stage retirement unavailable');
    if (checkpoint === undefined) {
      if ((await session.readConfigurationSha256()) !== sha256Hex2(upgrade.deployment.configuration))
        throw Error('Upgrade stage configuration differs');
      if ((await session.readPlanApplicationState(action)) !== 'applied')
        throw Error('Upgrade owning application is unresolved');
      checkpoint = {
        schemaVersion: 1,
        status: 'preparing',
        owner: store.owner,
        sourcePlanSha256: base.planSha256,
        upgradePlanSha256: upgrade.planSha256,
        deploymentSha256: canonicalSha256(upgrade.deployment),
        evidenceSha256,
      };
      await store.write(checkpointName, checkpoint);
    }
    if (object20(checkpoint).status === 'preparing') {
      const receipt = validateFinal(await session.plan(env, signal));
      await validate();
      checkpoint = {
        schemaVersion: 1,
        status: 'retiring',
        owner: store.owner,
        sourcePlanSha256: base.planSha256,
        upgradePlanSha256: upgrade.planSha256,
        deploymentSha256: canonicalSha256(upgrade.deployment),
        evidenceSha256,
        receipt,
        receiptSha256: canonicalSha256(receipt),
      };
      await store.write(checkpointName, checkpoint);
    }
    const { bound, receipt } = validateCheckpoint(checkpoint);
    await validate();
    if (!receipt) throw Error('Upgrade retirement final receipt missing');
    const result = await session.retireArtifacts(receipt, evidenceSha256, env, signal);
    if (
      result.status !== 'runner-artifacts-retired' ||
      result.evidenceSha256 !== evidenceSha256 ||
      result.finalPlanSha256 !== receipt.planSha256
    )
      throw Error('Upgrade stage retirement result differs');
    await store.write(checkpointName, { ...bound, status: 'retired', result });
    return result;
  } finally {
    await release();
  }
}
async function qualifiedAzureTerraformUpgradeStages(base, store, stages, contract) {
  const { readdir } = await import('fs/promises');
  const sources = (await readdir(store.directory)).filter((name) => /^azure-ce-upgrade-[a-f0-9]{24}\.json$/.test(name));
  const upgrades = [];
  for (const name of sources) {
    const upgrade = await store.read(name);
    await verifyAzureTerraformUpgrade(base, upgrade, contract);
    if (name !== `${upgrade.planId}.json`) throw Error('Upgrade source file identity differs');
    if (stages.includes(String(upgrade.deployment.stage))) upgrades.push(upgrade);
  }
  if (
    new Set(upgrades.map((u) => u.deployment.stage)).size !== upgrades.length ||
    stages.some((stage) => !upgrades.some((u) => u.deployment.stage === stage))
  )
    throw Error('Unqualified Terraform stage blocks terminal cleanup');
  return upgrades.sort((a, b) => String(a.deployment.stage).localeCompare(String(b.deployment.stage)));
}
var sha256Hex2 = (value) => createHash16('sha256').update(value).digest('hex'),
  object20 = (v) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('Malformed upgrade retirement evidence');
    return v;
  },
  sha3 = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
var init_terraform_upgrade_retirement = __esm(() => {
  init_process_lock();
  init_canonical();
  init_terraform_upgrade();
});

// plugins/azure/src/ce/terraform-terminal-cleanup.ts
import { createHash as createHash17 } from 'node:crypto';
import { lstat as lstat6, readdir as readdir6, realpath as realpath5 } from 'node:fs/promises';
import { join as join10 } from 'node:path';

async function hasAzureTerraformTerminalCleanup(store) {
  try {
    await store.read(name);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}
async function finalizeAzureTerraformRunnerCleanup(
  base,
  teardown,
  runtime,
  contract,
  session,
  store,
  api,
  env,
  signal,
  terraform,
) {
  const binding = azureUpgradeBinding(base);
  const deployment = await azureTerraformCurrentDeployment(base);
  const identity = (({ configuration, providerLock, ...rest }) => ({
    ...rest,
    configurationSha256: hash8(configuration),
    providerLockSha256: hash8(providerLock),
  }))(deployment);
  const namespaces = new Set(['default']);
  for (const value of [
    ...teardown.drain.listeners.map((row) => row.namespace),
    ...teardown.drain.origins.map((row) => row.origin.namespace),
  ]) {
    if (typeof value !== 'string' || !/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value))
      throw Error('Azure terminal namespace differs');
    namespaces.add(value);
  }
  const fresh = async () => {
    signal?.throwIfAborted();
    await store.verify();
    if (
      runtime.engine !== 'terraform' ||
      canonicalSha256(store.owner) !== canonicalSha256(binding.owner) ||
      teardown.sourcePlanSha256 !== base.planSha256 ||
      teardown.drain.siteContractFingerprint !== runtime.contract.fingerprint ||
      teardown.drain.ingressContractFingerprint !== contract.fingerprint ||
      canonicalSha256(await store.read(`${teardown.planId}.json`)) !== canonicalSha256(teardown)
    )
      throw Error('Azure terminal owner or contracts differ');
    const start = Date.now();
    const platform = await runtime.unregisteredAbsence([binding], [...namespaces].sort(), contract, signal);
    const at = Date.parse(platform.observedAt),
      began = Date.parse(platform.startedAt);
    if (
      platform.status !== 'absent' ||
      canonicalSha256(platform.owner) !== canonicalSha256(binding.owner) ||
      platform.siteContractFingerprint !== runtime.contract.fingerprint ||
      platform.ingressContractFingerprint !== contract.fingerprint ||
      !Number.isFinite(at) ||
      !Number.isFinite(began) ||
      began < start ||
      at < began ||
      at > Date.now() ||
      Date.now() - at > 60000 ||
      !Array.isArray(platform.sources) ||
      !platform.sources.length
    )
      throw Error('Fresh complete Azure platform absence unavailable');
    const cloud = await observeAzureTerraformDestroyBoundary(base, api, signal);
    if (cloud.status !== 'absent') throw Error('Fresh Azure cloud absence unavailable');
    return { platform, cloud };
  };
  let stages = [];
  const stagesRoot = join10(store.directory, 'terraform-stages');
  try {
    const stat = await lstat6(stagesRoot);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.uid !== process.getuid?.() ||
      (await realpath5(stagesRoot)) !== stagesRoot
    )
      throw Error('Azure upgrade stage directory ownership differs');
    stages = (await readdir6(stagesRoot)).sort();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (stages.some((stage) => !/^upgrade-(?:software|os)-[a-f0-9]{24}$/.test(stage)))
    throw Error('Unqualified Azure stage blocks terminal cleanup');
  if (stages.length && !terraform) throw Error('Owning Azure upgrade retirement service unavailable');
  const upgradeContract = stages.length ? await VerifiedUpgradeContract.release(fetch, signal) : undefined;
  const upgrades = upgradeContract
    ? await qualifiedAzureTerraformUpgradeStages(base, store, stages, upgradeContract)
    : [];
  let checkpoint;
  try {
    checkpoint = await store.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const validFinal = (final) =>
    !!final &&
    final.schemaVersion === 1 &&
    final.engine === 'terraform' &&
    final.deploymentId === base.deploymentName &&
    final.backendIdentity === deployment.backendIdentity &&
    final.configurationSha256 === identity.configurationSha256 &&
    final.providerLockSha256 === identity.providerLockSha256 &&
    final.noChanges === true &&
    Array.isArray(final.changes) &&
    !final.changes.length &&
    sha4(final.planSha256) &&
    !final.operation &&
    !final.actionInvocations &&
    !final.imports &&
    !final.relinquishments;
  await fresh();
  if (!checkpoint) {
    if (!session.readConfigurationSha256 || !session.cancelUnsubmittedPlan || !session.retireArtifacts)
      throw Error('Azure owning runner cleanup unavailable');
    const configurationSha256 = await session.readConfigurationSha256();
    if (!sha4(configurationSha256)) throw Error('Azure current configuration is unresolved');
    const configuration = object21(JSON.parse(await session.readConfiguration(configurationSha256)));
    const renderedEmpty = JSON.stringify({ terraform: configuration.terraform, provider: configuration.provider });
    if (canonicalSha256(JSON.parse(renderedEmpty)) !== canonicalSha256(JSON.parse(deployment.configuration)))
      throw Error('Azure empty configuration provider or execution identity differs');
    const emptyConfiguration = deployment.configuration;
    const destroy = await store.read('azure-terraform-cloud-destroy-final.json');
    if (
      destroy.schemaVersion !== 1 ||
      destroy.engine !== 'terraform' ||
      destroy.operation !== 'destroy' ||
      destroy.noChanges !== true ||
      destroy.deploymentId !== base.deploymentName ||
      destroy.backendIdentity !== deployment.backendIdentity ||
      destroy.configurationSha256 !== configurationSha256 ||
      destroy.providerLockSha256 !== identity.providerLockSha256 ||
      !sha4(destroy.planSha256) ||
      !Array.isArray(destroy.changes) ||
      destroy.changes.length
    )
      throw Error('Azure terminal destroy evidence differs');
    const evidence = await fresh();
    checkpoint = {
      schemaVersion: 1,
      sourcePlanSha256: base.planSha256,
      teardownPlanSha256: teardown.planSha256,
      configurationSha256,
      emptyConfiguration,
      emptyConfigurationSha256: hash8(emptyConfiguration),
      destroy,
      evidence,
      evidenceSha256: canonicalSha256(evidence),
      checkpointSha256: canonicalSha256({ configurationSha256, emptyConfiguration, destroy, evidence }),
      phase: 'cancelling',
    };
    await store.write(name, checkpoint);
  }
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.sourcePlanSha256 !== base.planSha256 ||
    checkpoint.teardownPlanSha256 !== teardown.planSha256 ||
    !sha4(checkpoint.configurationSha256) ||
    !sha4(checkpoint.evidenceSha256) ||
    checkpoint.evidenceSha256 !== canonicalSha256(checkpoint.evidence) ||
    checkpoint.checkpointSha256 !==
      canonicalSha256({
        configurationSha256: checkpoint.configurationSha256,
        emptyConfiguration: checkpoint.emptyConfiguration,
        destroy: checkpoint.destroy,
        evidence: checkpoint.evidence,
      }) ||
    typeof checkpoint.emptyConfiguration !== 'string' ||
    checkpoint.emptyConfigurationSha256 !== hash8(checkpoint.emptyConfiguration) ||
    checkpoint.emptyConfigurationSha256 !== identity.configurationSha256 ||
    !['cancelling', 'planning', 'retiring', 'retired'].includes(checkpoint.phase) ||
    (['retiring', 'retired'].includes(checkpoint.phase) &&
      (!validFinal(checkpoint.final) || !sha4(checkpoint.retirementEvidenceSha256)))
  )
    throw Error('Azure terminal checkpoint differs');
  if (checkpoint.phase === 'cancelling') {
    await fresh();
    if (!session.cancelUnsubmittedPlan) throw Error('Azure owning runner cancellation unavailable');
    const actual = await session.cancelUnsubmittedPlan(
      checkpoint.destroy,
      checkpoint.configurationSha256,
      checkpoint.emptyConfiguration,
      checkpoint.evidenceSha256,
    );
    if (actual !== checkpoint.emptyConfigurationSha256) throw Error('Azure cancelled configuration differs');
    checkpoint.phase = 'planning';
    await store.write(name, checkpoint);
  }
  if (checkpoint.phase === 'planning') {
    await fresh();
    const final = await session.plan(env, signal);
    if (!validFinal(final)) throw Error('Azure final ordinary refresh-enabled plan differs');
    checkpoint.final = final;
    checkpoint.retirementEvidenceSha256 = canonicalSha256(await fresh());
    checkpoint.phase = 'retiring';
    await store.write(name, checkpoint);
  }
  if (checkpoint.phase === 'retiring') {
    await fresh();
    if (!session.retireArtifacts || !checkpoint.final || !checkpoint.retirementEvidenceSha256)
      throw Error('Azure owning runner retirement unavailable');
    checkpoint.artifacts = await session.retireArtifacts(
      checkpoint.final,
      checkpoint.retirementEvidenceSha256,
      env,
      signal,
    );
    const value = checkpoint.artifacts;
    if (
      value.status !== 'runner-artifacts-retired' ||
      value.manifestSha256 !== canonicalSha256(identity) ||
      value.evidenceSha256 !== checkpoint.retirementEvidenceSha256 ||
      value.finalPlanSha256 !== checkpoint.final.planSha256 ||
      !sha4(value.inventorySha256) ||
      !Number.isSafeInteger(value.retiredArtifacts) ||
      value.retiredArtifacts < 0
    )
      throw Error('Azure runner retirement receipt differs');
    checkpoint.phase = 'retired';
    await store.write(name, checkpoint);
  }
  await fresh();
  const value = checkpoint.artifacts;
  if (
    !value ||
    !checkpoint.final ||
    value.status !== 'runner-artifacts-retired' ||
    value.manifestSha256 !== canonicalSha256(identity) ||
    value.evidenceSha256 !== checkpoint.retirementEvidenceSha256 ||
    value.finalPlanSha256 !== checkpoint.final.planSha256 ||
    !sha4(value.inventorySha256) ||
    !Number.isSafeInteger(value.retiredArtifacts) ||
    value.retiredArtifacts < 0
  )
    throw Error('Azure terminal retirement evidence differs');
  if (!checkpoint.retirementEvidenceSha256) throw Error('Azure parent retirement evidence missing');
  for (const upgrade of upgrades) {
    await fresh();
    if (!terraform || !upgradeContract) throw Error('Owning Azure upgrade retirement service unavailable');
    await retireAzureTerraformUpgradeStage(
      base,
      upgrade,
      upgradeContract,
      terraform,
      store,
      checkpoint.retirementEvidenceSha256,
      env,
      signal,
    );
    await fresh();
  }
  const parent = await retireAzureTerraformParentArtifacts(
    base,
    teardown,
    checkpoint.retirementEvidenceSha256,
    store,
    signal,
  );
  return {
    parent,
    status: 'deployment-artifacts-retired',
    sourcePlanSha256: base.planSha256,
    teardownPlanSha256: teardown.planSha256,
    finalPlanSha256: checkpoint.final.planSha256,
    artifacts: value,
    cloud: 'absent',
    sites: 'deleted',
    completeCleanup: false,
  };
}
var name = 'azure-terraform-terminal-cleanup.json',
  hash8 = (value) => createHash17('sha256').update(value).digest('hex'),
  sha4 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value),
  object21 = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Malformed Azure terminal cleanup');
    return value;
  };
var init_terraform_terminal_cleanup = __esm(() => {
  init_upgrade_contract();
  init_canonical();
  init_terraform_destroy_ownership();
  init_terraform_foundation();
  init_terraform_parent_retirement();
  init_terraform_upgrade();
  init_terraform_upgrade_retirement();
});

// plugins/azure/src/ce/terraform-teardown.ts
import { readdir as readdir7 } from 'node:fs/promises';

function compileAzureTerraformTeardown(base, drain, retirement, pendingAdmissionJournalSha256) {
  verifyAzureCePlan(base);
  const binding = azureUpgradeBinding(base);
  if (
    base.engine !== 'terraform' ||
    (pendingAdmissionJournalSha256 !== undefined && !/^[a-f0-9]{64}$/.test(pendingAdmissionJournalSha256)) ||
    drain.schemaVersion !== 1 ||
    drain.sourcePlanSha256 !== base.planSha256 ||
    canonicalSha256(drain.owner) !== canonicalSha256(binding.owner) ||
    drain.sites.length !== 1 ||
    canonicalSha256(drain.sites[0].binding) !== canonicalSha256(binding) ||
    retirement.length !== 1 ||
    retirement[0].siteName !== binding.siteName ||
    retirement[0].siteUid !== drain.sites[0].siteUid ||
    !retirement[0].physicalSiteUid ||
    binding.nodes.some((node) => !retirement[0].tokens.some((token) => token.node === node))
  )
    throw new Error('Azure Terraform teardown source or site inventory differs');
  const identities = new Set();
  for (const token of retirement[0].tokens) {
    if (
      !binding.nodes.includes(token.node) ||
      !safeName(token.name) ||
      identities.has(token.name) ||
      (pendingAdmissionJournalSha256 !== undefined && (typeof token.uid !== 'string' || !token.uid.trim()))
    )
      throw new Error('Azure Terraform teardown token identity differs');
    identities.add(token.name);
  }
  const draft = {
    schemaVersion: 1,
    kind: 'azure-ce-terraform-teardown',
    engine: 'terraform',
    sourcePlanSha256: base.planSha256,
    drain: structuredClone(drain),
    retirement: structuredClone(retirement),
    ...(pendingAdmissionJournalSha256 ? { pendingAdmissionJournalSha256 } : {}),
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `azure-ce-teardown-${planSha256.slice(0, 24)}`, planSha256 };
}
async function collectAzureTeardownMaterial(base, runtime, contract, storage, signal) {
  verifyAzureCePlan(base);
  const binding = azureUpgradeBinding(base);
  if (runtime.engine !== base.engine || canonicalSha256(storage.owner) !== canonicalSha256(binding.owner))
    throw new Error('Azure teardown preparation requires the owning execution engine');
  await storage.verify();
  const entries = await readdir7(storage.directory, { withFileTypes: true });
  const ingressFiles = entries.filter((entry) => /^ingress-plan-[a-f0-9]{24}\.json$/.test(entry.name));
  const namespaces = new Set(['default']);
  for (const entry of ingressFiles) {
    if (!entry.isFile()) throw new Error('Azure teardown ingress artifact is not a regular file');
    const saved = object22(await storage.read(entry.name));
    const namespace = object22(object22(saved.request).metadata).namespace;
    const originNamespace = object22(object22(object22(saved.material).intent).originPool).namespace;
    if (!safeName(namespace) || !safeName(originNamespace)) throw new Error('Azure teardown namespace is invalid');
    namespaces.add(namespace);
    namespaces.add(originNamespace);
  }
  let pendingAdmissionJournalSha256;
  const observe = async () => {
    let value = pendingAdmissionJournalSha256
      ? undefined
      : await runtime.teardownInventory([binding], [...namespaces].sort(), contract, signal);
    if (pendingAdmissionJournalSha256 || (value?.status === 'unknown' && base.engine === 'terraform')) {
      const pending = await observeAzurePendingAdmission(base, runtime, contract, storage, signal);
      if (
        pending.value.sites[0].siteUid !== pending.journal.siteUid ||
        !pending.value.sites[0].physicalSiteUid ||
        pending.value.resources.length !== 1
      )
        throw Error('Azure pending teardown exact site or enrollment identity differs');
      await azurePendingAdmissionJournal(base, storage, runtime.contract.fingerprint, true);
      if (pendingAdmissionJournalSha256 && pendingAdmissionJournalSha256 !== pending.journal.sha256)
        throw Error('Azure pending admission changed during preparation');
      pendingAdmissionJournalSha256 = pending.journal.sha256;
      value = {
        ...pending.value,
        sites: pending.value.sites.map((row) => ({
          ...row,
          siteUid: String(row.siteUid),
          physicalSiteUid: String(row.physicalSiteUid),
        })),
      };
    }
    if (!value) throw Error('Azure teardown inventory is unavailable');
    const observedAt = Date.parse(value.observedAt);
    if (
      value.status !== 'observed' ||
      canonicalSha256(value.owner) !== canonicalSha256(binding.owner) ||
      value.siteContractFingerprint !== runtime.contract.fingerprint ||
      value.ingressContractFingerprint !== contract.fingerprint ||
      !Number.isFinite(observedAt) ||
      observedAt > Date.now() ||
      Date.now() - observedAt > 60000
    )
      throw new Error('Fresh Azure platform teardown inventory is unavailable');
    return value;
  };
  const before = await observe();
  const ingress = runtime.ingress(contract, storage);
  const listeners = [];
  for (const live of before.resources.filter((row) => row.kind === 'http_loadbalancers')) {
    if (!live.ingressPlanId) throw new Error('Azure listener has no persisted plan identity');
    const reference = await ingress.teardownReference(live.ingressPlanId);
    if (reference.name !== live.name || reference.namespace !== live.namespace || reference.uid !== live.uid)
      throw new Error('Azure listener checkpoint differs from platform inventory');
    listeners.push({ id: reference.id, name: reference.name, namespace: reference.namespace });
  }
  const origins = [];
  const originTeardown = runtime.originTeardown(contract);
  for (const live of before.resources.filter((row) => row.kind === 'origin_pools'))
    origins.push(
      await originTeardown.observe(
        binding.owner,
        { name: live.name, namespace: live.namespace, uid: live.uid },
        signal,
      ),
    );
  const site = before.sites.filter((row) => row.siteName === binding.siteName);
  if (site.length !== 1) throw new Error('Azure teardown site inventory is missing or ambiguous');
  const routing = before.resources
    .filter(
      (row) =>
        row.siteName === binding.siteName &&
        (row.kind === 'bgps' || row.kind === 'bgp_routing_policys' || row.kind === 'external_connectors'),
    )
    .map((row) => ({
      kind:
        row.kind === 'bgps' ? 'bgp' : row.kind === 'bgp_routing_policys' ? 'bgp_routing_policy' : 'external_connector',
      name: row.name,
      uid: row.uid,
    }));
  const tokenRows = new Map();
  for (const [index, node] of binding.nodes.entries()) {
    const prefixes = [
      `${base.deploymentName.slice(0, 40)}-${index + 1}-`,
      `${base.siteName.slice(0, 36)}-${index + 1}-r-`,
    ];
    for (const entry of entries) {
      const prefix = prefixes.find((candidate) => entry.name.startsWith(candidate));
      if (!prefix || !/^[a-f0-9]{12}\.json$/.test(entry.name.slice(prefix.length))) continue;
      if (!entry.isFile()) throw new Error('Azure teardown enrollment artifact is not a regular file');
      const record = object22(await storage.read(entry.name));
      if (record.tokenName !== entry.name.slice(0, -5) || record.siteName !== binding.siteName || record.node !== node)
        throw new Error('Azure teardown historical enrollment identity differs');
      tokenRows.set(String(record.tokenName), { node, name: String(record.tokenName) });
    }
  }
  for (const row of before.resources.filter((row) => row.kind === 'tokens' && row.siteName === binding.siteName)) {
    if (!row.node) throw new Error('Azure teardown token node identity is unavailable');
    const existing = tokenRows.get(row.name);
    if (existing && existing.node !== row.node) throw new Error('Azure teardown enrollment identities conflict');
    tokenRows.set(row.name, {
      node: row.node,
      name: row.name,
      ...(pendingAdmissionJournalSha256 ? { uid: row.uid } : {}),
    });
  }
  const drain = {
    schemaVersion: 1,
    owner: binding.owner,
    sourcePlanSha256: base.planSha256,
    siteContractFingerprint: runtime.contract.fingerprint,
    ingressContractFingerprint: contract.fingerprint,
    listeners,
    origins,
    sites: [{ binding, siteUid: site[0].siteUid, routing }],
  };
  const retirement = [
    {
      siteName: site[0].siteName,
      siteUid: site[0].siteUid,
      physicalSiteUid: site[0].physicalSiteUid,
      tokens: [...tokenRows.values()].sort((a, b) => a.name.localeCompare(b.name)),
    },
  ];
  const after = await observe();
  if (
    canonicalSha256({ sites: before.sites, resources: before.resources }) !==
    canonicalSha256({ sites: after.sites, resources: after.resources })
  )
    throw new Error('Azure teardown source changed during preparation');
  return { drain, retirement, ...(pendingAdmissionJournalSha256 ? { pendingAdmissionJournalSha256 } : {}) };
}
async function prepareAzureTerraformTeardown(base, runtime, contract, storage, signal) {
  if (base.engine !== 'terraform') throw new Error('Azure Terraform teardown requires Terraform ownership');
  let workflow;
  try {
    workflow = await storage.read('terraform-workflow.json');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (
    workflow !== undefined &&
    object22(workflow).stage === 'network-pending' &&
    Object.keys(object22(object22(workflow).bootstrapByNode)).length === 0
  )
    return prepareAzureFoundationTeardown(base, runtime, contract, storage, signal);
  const { drain, retirement, pendingAdmissionJournalSha256 } = await collectAzureTeardownMaterial(
    base,
    runtime,
    contract,
    storage,
    signal,
  );
  const plan = compileAzureTerraformTeardown(base, drain, retirement, pendingAdmissionJournalSha256);
  await storage.write(`${plan.planId}.json`, plan);
  return plan;
}
async function runAzureTerraformTeardown(
  base,
  input,
  authorizedPlanSha256,
  runtime,
  contract,
  session,
  storage,
  api,
  env,
  signal,
  terraform,
) {
  if (input.kind === 'azure-ce-terraform-foundation-teardown')
    return runAzureFoundationTeardown(
      base,
      input,
      authorizedPlanSha256,
      runtime,
      contract,
      session,
      storage,
      api,
      env,
      signal,
    );
  const expected = compileAzureTerraformTeardown(
    base,
    input.drain,
    input.retirement,
    input.pendingAdmissionJournalSha256,
  );
  const validate = async () => {
    signal?.throwIfAborted();
    await storage.verify();
    if (
      canonicalSha256(expected) !== canonicalSha256(input) ||
      authorizedPlanSha256 !== input.planSha256 ||
      runtime.engine !== 'terraform' ||
      runtime.contract.fingerprint !== input.drain.siteContractFingerprint ||
      contract.fingerprint !== input.drain.ingressContractFingerprint ||
      canonicalSha256(storage.owner) !== canonicalSha256(input.drain.owner)
    )
      throw new Error('Azure Terraform teardown authorization, ownership or contract differs');
    if (input.pendingAdmissionJournalSha256 && !(await hasAzureTerraformTerminalCleanup(storage))) {
      const pending = await observeAzurePendingAdmission(base, runtime, contract, storage, signal);
      const original = input.retirement[0],
        site = pending.value.sites[0];
      if (
        pending.journal.sha256 !== input.pendingAdmissionJournalSha256 ||
        (site.siteUid !== null && site.siteUid !== original.siteUid) ||
        (site.physicalSiteUid !== null && site.physicalSiteUid !== original.physicalSiteUid) ||
        pending.value.resources.some(
          (row) =>
            !original.tokens.some(
              (token) => token.name === row.name && token.node === row.node && token.uid === row.uid,
            ),
        )
      )
        throw Error('Azure pending teardown journal or site identity changed');
    }
  };
  await validate();
  await beginAzureTerraformRetirement(base, input, storage);
  if (await hasAzureTerraformTerminalCleanup(storage))
    return finalizeAzureTerraformRunnerCleanup(
      base,
      input,
      runtime,
      contract,
      session,
      storage,
      api,
      env,
      signal,
      terraform,
    );
  let completed;
  try {
    completed = await storage.read('azure-terraform-teardown-receipt.json');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (completed !== undefined) {
    const receipt = object22(completed),
      final = object22(await storage.read('azure-terraform-cloud-destroy-final.json'));
    if (
      receipt.status !== 'retired' ||
      receipt.sourcePlanSha256 !== base.planSha256 ||
      receipt.teardownPlanSha256 !== input.planSha256 ||
      receipt.cloud !== 'absent' ||
      receipt.sites !== 'deleted' ||
      receipt.finalPlanSha256 !== final.planSha256 ||
      !/^[a-f0-9]{64}$/.test(String(final.planSha256)) ||
      final.operation !== 'destroy' ||
      final.noChanges !== true ||
      !Array.isArray(final.changes) ||
      final.changes.length
    )
      throw Error('Azure completed teardown receipt differs');
    return finalizeAzureTerraformRunnerCleanup(
      base,
      input,
      runtime,
      contract,
      session,
      storage,
      api,
      env,
      signal,
      terraform,
    );
  }
  const drained = await runtime.drainPlatform(input.drain, contract, storage, signal);
  if (drained.status !== 'platform-drained') return { status: 'pending-platform-drain' };
  await validate();
  const cloud = await runAzureTerraformCloudTeardown(
    base,
    session,
    storage,
    api,
    env,
    signal,
    !!input.pendingAdmissionJournalSha256,
  );
  for (const site of input.retirement) {
    await validate();
    const current = await runtime.observeSiteDeletion(azureUpgradeBinding(base), site, signal);
    if (!['pending', 'deleted'].includes(current.status)) throw new Error('Azure site retirement evidence is unknown');
    for (const token of site.tokens) {
      await validate();
      if (input.pendingAdmissionJournalSha256) {
        if (!token.uid) throw Error('Azure pending token UID is unavailable');
        await runtime.deleteBootstrapTokenExact(azureUpgradeBinding(base), token.node, token.name, token.uid, signal);
      } else await runtime.deleteBootstrapToken(azureUpgradeBinding(base), token.node, token.name, signal);
    }
    await validate();
    await runtime.deleteSiteExact(azureUpgradeBinding(base), site.siteUid, signal);
    if ((await runtime.observeSiteDeletion(azureUpgradeBinding(base), site, signal)).status !== 'deleted')
      return { status: 'pending-site-retirement', cloud };
  }
  await validate();
  const boundary = await observeAzureTerraformDestroyBoundary(base, api, signal);
  if (boundary.status !== 'absent') throw new Error('Azure cloud retirement absence has not converged');
  const receipt = {
    status: 'retired',
    sourcePlanSha256: base.planSha256,
    teardownPlanSha256: input.planSha256,
    finalPlanSha256: cloud.finalPlanSha256,
    cloud: boundary.status,
    sites: 'deleted',
    observedAt: new Date().toISOString(),
  };
  await storage.write('azure-terraform-teardown-receipt.json', receipt);
  return finalizeAzureTerraformRunnerCleanup(
    base,
    input,
    runtime,
    contract,
    session,
    storage,
    api,
    env,
    signal,
    terraform,
  );
}
var object22 = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Malformed Azure teardown material');
    return value;
  },
  safeName = (value) => typeof value === 'string' && /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value);
var init_terraform_teardown = __esm(() => {
  init_artifacts();
  init_canonical();
  init_terraform_cloud_teardown();
  init_terraform_destroy_ownership();
  init_terraform_foundation_teardown();
  init_terraform_pending_admission();
  init_terraform_retirement();
  init_terraform_terminal_cleanup();
  init_terraform_upgrade();
});

// plugins/azure/src/ce/native-teardown.ts
function validateCloudPlan(base, cloud) {
  verifyAzureCePlan(base);
  verifyAzureCePlan(cloud);
  const groupId = `/subscriptions/${base.subscription.id}/resourceGroups/${base.intent.resourceGroup}`;
  const groupDeletes = cloud.actions.filter(
    (action) => action.kind === 'resource-delete' && action.resourceId?.toLowerCase() === groupId.toLowerCase(),
  );
  if (
    base.engine !== 'native' ||
    base.intent.operation !== 'deploy' ||
    cloud.engine !== 'native' ||
    cloud.intent.operation !== 'teardown' ||
    cloud.deploymentName !== base.deploymentName ||
    cloud.subscription.id !== base.subscription.id ||
    cloud.region !== base.region ||
    cloud.siteName !== base.siteName ||
    cloud.actions.some((action) => action.phase !== 'teardown' || !action.mutates) ||
    groupDeletes.length !== 1 ||
    cloud.actions.at(-1)?.id !== groupDeletes[0].id
  )
    throw new Error('Azure native cloud teardown plan differs from the original deployment');
}
function compileAzureNativeTeardown(base, cloud, drain, retirement) {
  validateCloudPlan(base, cloud);
  const binding = azureUpgradeBinding(base);
  if (
    drain.sourcePlanSha256 !== base.planSha256 ||
    canonicalSha256(drain.owner) !== canonicalSha256(binding.owner) ||
    drain.sites.length !== 1 ||
    canonicalSha256(drain.sites[0].binding) !== canonicalSha256(binding) ||
    retirement.length !== 1 ||
    retirement[0].siteName !== binding.siteName ||
    retirement[0].siteUid !== drain.sites[0].siteUid ||
    !retirement[0].physicalSiteUid ||
    binding.nodes.some((node) => !retirement[0].tokens.some((token) => token.node === node))
  )
    throw new Error('Azure native teardown source or site inventory differs');
  const draft = {
    schemaVersion: 1,
    kind: 'azure-ce-native-teardown',
    engine: 'native',
    sourcePlanSha256: base.planSha256,
    cloudPlanId: cloud.planId,
    cloudPlanSha256: cloud.planSha256,
    drain: structuredClone(drain),
    retirement: structuredClone(retirement),
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `azure-ce-teardown-${planSha256.slice(0, 24)}`, planSha256 };
}
async function prepareAzureNativeTeardown(base, cloud, runtime, contract, storage, signal) {
  validateCloudPlan(base, cloud);
  const { drain, retirement } = await collectAzureTeardownMaterial(base, runtime, contract, storage, signal);
  const plan = compileAzureNativeTeardown(base, cloud, drain, retirement);
  await storage.write(`${plan.planId}.json`, plan);
  return plan;
}
async function runAzureNativeTeardown(
  base,
  cloud,
  input,
  authorizedPlanSha256,
  runtime,
  contract,
  storage,
  applyCloud,
  signal,
) {
  const expected = compileAzureNativeTeardown(base, cloud, input.drain, input.retirement);
  const binding = azureUpgradeBinding(base);
  const validate = async () => {
    signal?.throwIfAborted();
    await storage.verify();
    if (
      canonicalSha256(expected) !== canonicalSha256(input) ||
      authorizedPlanSha256 !== input.planSha256 ||
      runtime.engine !== 'native' ||
      runtime.contract.fingerprint !== input.drain.siteContractFingerprint ||
      contract.fingerprint !== input.drain.ingressContractFingerprint ||
      canonicalSha256(storage.owner) !== canonicalSha256(input.drain.owner)
    )
      throw new Error('Azure native teardown authorization, ownership or contract differs');
  };
  await validate();
  const drained = await runtime.drainPlatform(input.drain, contract, storage, signal);
  if (drained.status !== 'platform-drained') return { status: 'pending-platform-drain' };
  await validate();
  const retired = await applyCloud(signal);
  if (retired.status !== 'retired' || retired.absence !== 'absent')
    throw new Error('Azure native cloud retirement absence is unavailable');
  for (const site of input.retirement) {
    await validate();
    const current = await runtime.observeSiteDeletion(binding, site, signal);
    if (!['pending', 'deleted'].includes(current.status))
      throw new Error('Azure native site retirement evidence is unknown');
    for (const token of site.tokens) {
      await validate();
      await runtime.deleteBootstrapToken(binding, token.node, token.name, signal);
    }
    await validate();
    await runtime.deleteSiteExact(binding, site.siteUid, signal);
    if ((await runtime.observeSiteDeletion(binding, site, signal)).status !== 'deleted')
      return { status: 'pending-site-retirement' };
  }
  const receipt = {
    status: 'retired',
    sourcePlanSha256: base.planSha256,
    teardownPlanSha256: input.planSha256,
    cloudPlanSha256: cloud.planSha256,
    cloud: 'absent',
    sites: 'deleted',
    observedAt: new Date().toISOString(),
  };
  await storage.write('azure-native-teardown-receipt.json', receipt);
  return receipt;
}
async function observeAzureNativeGroupAbsence(base, api, signal) {
  verifyAzureCePlan(base);
  signal?.throwIfAborted();
  const account = await api.exec(
    'az',
    ['account', 'show', '--subscription', base.subscription.id, '--output', 'json'],
    signal ? { signal } : undefined,
  );
  if (account.exitCode !== 0) throw new Error('Azure native teardown account evidence is unavailable');
  let identity;
  try {
    identity = JSON.parse(account.stdout);
  } catch {
    throw new Error('Malformed Azure native teardown account evidence');
  }
  if (
    String(identity.id).toLowerCase() !== base.subscription.id.toLowerCase() ||
    String(identity.tenantId).toLowerCase() !== base.subscription.tenantId.toLowerCase() ||
    identity.environmentName !== base.subscription.cloud ||
    identity.state !== 'Enabled'
  )
    throw new Error('Azure native teardown account differs from deployment');
  const result = await api.exec(
    'az',
    [
      'group',
      'exists',
      '--name',
      base.intent.resourceGroup,
      '--subscription',
      base.subscription.id,
      '--output',
      'json',
    ],
    signal ? { signal } : undefined,
  );
  signal?.throwIfAborted();
  if (result.exitCode !== 0) throw new Error('Azure native teardown absence evidence is unavailable');
  let exists;
  try {
    exists = JSON.parse(result.stdout);
  } catch {
    throw new Error('Malformed Azure native teardown absence evidence');
  }
  if (exists !== false) throw new Error('Azure native resource group retirement has not converged');
  return { status: 'retired', absence: 'absent' };
}
var init_native_teardown = __esm(() => {
  init_artifacts();
  init_canonical();
  init_terraform_teardown();
  init_terraform_upgrade();
});

// plugins/azure/src/tools/azure-ce-teardown.ts
import { join as join11 } from 'node:path';

function createAzureCeTeardownTool(pi, dependencies = defaults3) {
  const { Type } = pi.typebox;
  return {
    name: 'azure_ce_teardown',
    label: 'Teardown Azure Customer Edge',
    description:
      'Prepare or apply an immutable Terraform-owned Azure Customer Edge teardown. It drains platform resources, applies the exact cloud destroy plan, retires enrollment and site identities, and verifies absence without manual state edits.',
    parameters: Type.Object({
      operation: Type.Union([Type.Literal('prepare'), Type.Literal('apply')]),
      basePlanId: Type.String(),
      basePlanSha256: Type.String(),
      teardownPlanId: Type.Optional(Type.String()),
      teardownPlanSha256: Type.Optional(Type.String()),
      cloudPlanId: Type.Optional(Type.String()),
      cloudPlanSha256: Type.Optional(Type.String()),
    }),
    async execute(_id, params, signal, _update, ctx) {
      let release;
      try {
        const allowed =
          params.operation === 'prepare'
            ? ['basePlanId', 'basePlanSha256', 'cloudPlanId', 'cloudPlanSha256', 'operation']
            : ['basePlanId', 'basePlanSha256', 'operation', 'teardownPlanId', 'teardownPlanSha256'];
        if (Object.keys(params).some((key) => !allowed.includes(key)))
          throw new Error(`Azure CE teardown ${params.operation} parameters differ`);
        const { plan } = await loadPlanArtifact(ctx.sessionManager, params.basePlanId, params.basePlanSha256);
        if (plan.intent.operation !== 'deploy')
          throw new Error('Azure CE teardown requires the original deployment plan');
        const platform = await dependencies.platform(pi, signal);
        const storage = await platform.storage(azureUpgradeBinding(plan).owner);
        if (plan.engine === 'terraform')
          release = await acquireProcessLock(join11(storage.directory, '.azure-terraform-lifecycle-lock'));
        const runtime = await platform.runtime(plan.engine, plan.intent.platformContext);
        const contract = await dependencies.contract(signal);
        if (params.operation === 'prepare') {
          const cloud =
            plan.engine === 'native' && params.cloudPlanId && params.cloudPlanSha256
              ? (await loadPlanArtifact(ctx.sessionManager, params.cloudPlanId, params.cloudPlanSha256)).plan
              : undefined;
          if (plan.engine === 'native' && !cloud)
            throw new Error('Native Azure teardown requires the exact reviewed cloud teardown plan');
          if (plan.engine === 'terraform' && (params.cloudPlanId || params.cloudPlanSha256))
            throw new Error('Terraform Azure teardown does not accept a separate cloud plan');
          const teardown =
            plan.engine === 'terraform'
              ? await dependencies.prepare(plan, runtime, contract, storage, signal)
              : await dependencies.prepareNative(plan, cloud, runtime, contract, storage, signal);
          const artifactId = await ctx.sessionManager.saveArtifact(
            JSON.stringify({
              kind: teardown.kind,
              engine: teardown.engine,
              planId: teardown.planId,
              planSha256: teardown.planSha256,
              sourcePlanSha256: teardown.sourcePlanSha256,
              siteCount: teardown.retirement.length,
              listenerCount: teardown.drain.listeners.length,
              originCount: teardown.drain.origins.length,
              routingCount: teardown.drain.sites.reduce((sum, site) => sum + site.routing.length, 0),
            }),
            'azure-ce-teardown-plan',
          );
          if (!artifactId) throw new Error('Azure CE teardown plan artifact persistence failed');
          return {
            content: [
              {
                type: 'text',
                text: `Teardown plan ID: ${teardown.planId}
SHA-256: ${teardown.planSha256}
Artifact: artifact://${artifactId}`,
              },
            ],
            details: {
              tool: 'azure_ce_teardown',
              operation: 'prepare',
              artifactId,
              planId: teardown.planId,
              planSha256: teardown.planSha256,
            },
          };
        }
        if (!params.teardownPlanId || !params.teardownPlanSha256)
          throw new Error('Azure CE teardown apply requires the exact teardown plan identity');
        const teardown = await storage.read(`${params.teardownPlanId}.json`);
        if (
          teardown.planId !== params.teardownPlanId ||
          !safeHexEqual(teardown.planSha256, params.teardownPlanSha256) ||
          teardown.sourcePlanSha256 !== plan.planSha256
        )
          throw new Error('Persisted Azure CE teardown plan identity differs');
        const authorizationName = `${teardown.planId}-authorization.json`;
        const authorization = await optional12(storage, authorizationName);
        if (authorization === undefined) {
          if (ctx.hasUI) {
            if (
              !(await ctx.ui.confirm(
                'Apply immutable Azure CE teardown plan',
                `${teardown.planId}
${teardown.planSha256}`,
              ))
            )
              throw new Error('Azure CE teardown was not approved');
          } else if (process.env.XCSH_CE_HEADLESS_MUTATIONS !== '1' || process.env.XCSH_CE_ALLOW_DESTROY !== '1') {
            throw new Error('Headless Azure CE teardown requires mutation and destroy authorization');
          }
          await storage.write(authorizationName, {
            schemaVersion: 1,
            engine: plan.engine,
            sourcePlanSha256: plan.planSha256,
            teardownPlanSha256: teardown.planSha256,
            mutations: true,
          });
        } else if (
          !authorization ||
          typeof authorization !== 'object' ||
          authorization.schemaVersion !== 1 ||
          authorization.engine !== plan.engine ||
          authorization.sourcePlanSha256 !== plan.planSha256 ||
          authorization.teardownPlanSha256 !== teardown.planSha256 ||
          authorization.mutations !== true
        ) {
          throw new Error('Persisted Azure CE teardown authorization differs');
        }
        const terraformService = plan.engine === 'terraform' ? await dependencies.terraform(pi, signal) : undefined;
        const requireTerraform = () => {
          if (!terraformService) throw new Error('Terraform teardown requires its owning service');
          return terraformService;
        };
        const result =
          plan.engine === 'terraform'
            ? await dependencies.run(
                plan,
                teardown,
                params.teardownPlanSha256,
                runtime,
                contract,
                await requireTerraform().open(
                  azureUpgradeBinding(plan).owner,
                  teardown.kind === 'azure-ce-terraform-foundation-teardown'
                    ? await azureFoundationTeardownDeployment(plan, teardown)
                    : await azureTerraformCurrentDeployment(plan),
                  'current',
                ),
                storage,
                dependencies.makeApi(ctx.cwd),
                process.env,
                signal,
                terraformService,
              )
            : await dependencies.runNative(
                plan,
                (await loadPlanArtifact(ctx.sessionManager, teardown.cloudPlanId, teardown.cloudPlanSha256)).plan,
                teardown,
                params.teardownPlanSha256,
                runtime,
                contract,
                storage,
                async (signal) => {
                  const native = teardown;
                  const { plan: cloud } = await loadPlanArtifact(
                    ctx.sessionManager,
                    native.cloudPlanId,
                    native.cloudPlanSha256,
                  );
                  if (!(await loadCheckpoint(ctx.sessionManager, cloud)))
                    await saveCheckpoint(ctx.sessionManager, cloud, {
                      schemaVersion: AZURE_CE_CHECKPOINT_SCHEMA_VERSION,
                      engine: 'native',
                      authorization: { apply: true, terms: false, destroy: true },
                      planId: cloud.planId,
                      planSha256: cloud.planSha256,
                      completedActionIds: [],
                      state: 'running',
                    });
                  const api = withAzureCeExecution(dependencies.makeApi(ctx.cwd), signal);
                  const applied = await dependencies.applyNative(
                    { planId: cloud.planId, planSha256: cloud.planSha256 },
                    ctx,
                    api,
                    async () => platform,
                    signal,
                  );
                  if (applied.checkpoint.state !== 'complete')
                    throw new Error('Azure native cloud teardown remains partial');
                  return observeAzureNativeGroupAbsence(plan, api, signal);
                },
                signal,
              );
        const artifactId = await ctx.sessionManager.saveArtifact(
          JSON.stringify(result),
          'azure-ce-teardown-checkpoint',
        );
        if (!artifactId) throw new Error('Azure CE teardown checkpoint artifact persistence failed');
        return {
          content: [{ type: 'text', text: `Azure CE teardown ${plan.deploymentName}: ${result.status}.` }],
          details: { tool: 'azure_ce_teardown', operation: 'apply', artifactId, ...result },
        };
      } catch (error) {
        signal?.throwIfAborted();
        return {
          content: [
            {
              type: 'text',
              text: `Azure CE teardown failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'azure_ce_teardown', operation: params.operation },
        };
      } finally {
        await release?.();
      }
    },
  };
}
var defaults3,
  optional12 = async (storage, name) => {
    try {
      return await storage.read(name);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  };
var init_azure_ce_teardown = __esm(() => {
  init_ingress_contract();
  init_process_lock();
  init_artifacts();
  init_canonical();
  init_native_teardown();
  init_terraform_foundation();
  init_terraform_foundation_teardown();
  init_terraform_teardown();
  init_terraform_upgrade();
  init_azure_ce_apply();
  init_shared();
  defaults3 = {
    platform: azurePlatformService,
    terraform: azureTerraformService,
    contract: (signal) => VerifiedIngressContract.release(fetch, signal),
    prepare: prepareAzureTerraformTeardown,
    run: runAzureTerraformTeardown,
    prepareNative: prepareAzureNativeTeardown,
    runNative: runAzureNativeTeardown,
    applyNative: executeAzureCeNativeApply,
    makeApi: makeExecApi,
  };
});

// plugins/azure/src/tools/azure-ce-diagnose.ts
function validateActiveTarget(target) {
  if (
    !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(target.destinationIp) ||
    target.destinationIp.split('.').some((part) => Number(part) > 255)
  )
    throw new Error('Active diagnostic destinationIp must be an IPv4 address');
  for (const [label, port] of [
    ['destinationPort', target.destinationPort],
    ['localPort', target.localPort],
  ]) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`${label} must be between 1 and 65535`);
  }
}
async function collect(api, args, category) {
  const result = await api.exec('az', args);
  const text = `${result.stdout}
${result.stderr}`;
  return {
    category,
    ok: result.exitCode === 0,
    bytes: Buffer.byteLength(text),
    digest: sha256Hex(text),
    cloudInitFinished: /cloud-init.*finish|status:\s*done/i.test(text),
    errorsDetected: /cloud-init.*(?:error|fail)|provisioningstate.*failed/i.test(text),
  };
}
async function diagnosticSourceIp(api, resourceGroup, nicName, subscriptionId) {
  const result = await api.exec('az', [
    'network',
    'nic',
    'show',
    '--resource-group',
    resourceGroup,
    '--name',
    nicName,
    '--query',
    'ipConfigurations[0].privateIPAddress',
    '--output',
    'tsv',
    '--subscription',
    subscriptionId,
  ]);
  const value = result.stdout.trim();
  if (
    result.exitCode !== 0 ||
    !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value) ||
    value.split('.').some((part) => Number(part) > 255)
  )
    throw new Error(`Unable to resolve a safe diagnostic source IP for ${nicName}`);
  return value;
}
function createAzureCeDiagnoseTool(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  return {
    name: 'azure_ce_diagnose',
    label: 'Diagnose Azure Customer Edge',
    description:
      'Run passive or explicitly approved active CE diagnostics across VM provisioning, boot, NIC/effective NSG/routes, Network Watcher, Route Server/BGP, and live F5 site and registration observations. Raw guest/user data is never returned.',
    parameters: Type.Object({
      planId: Type.String(),
      planSha256: Type.String(),
      mode: Type.Union([Type.Literal('passive'), Type.Literal('active')]),
      activeTarget: Type.Optional(
        Type.Object({
          destinationIp: Type.String(),
          protocol: Type.Union([Type.Literal('TCP'), Type.Literal('UDP')]),
          destinationPort: Type.Number(),
          direction: Type.Union([Type.Literal('Inbound'), Type.Literal('Outbound')]),
          localPort: Type.Number(),
        }),
      ),
    }),
    async execute(_id, params, signal, _update, ctx) {
      try {
        if ('f5Evidence' in params)
          throw new Error('Caller-supplied F5 health evidence is unsupported; diagnostics collect live observations');
        const { plan } = await loadPlanArtifact(ctx.sessionManager, params.planId, params.planSha256);
        if (params.mode === 'active') {
          if (!ctx.hasUI && process.env.XCSH_CE_HEADLESS_MUTATIONS !== '1')
            throw new Error('Active headless diagnostics require XCSH_CE_HEADLESS_MUTATIONS=1');
          if (
            ctx.hasUI &&
            !(await ctx.ui.confirm(
              'Run active CE diagnostics',
              'Run Azure VM Run Command and Network Watcher checks? These operations may create diagnostic state.',
            ))
          )
            throw new Error('Active diagnostics were not approved');
          if (params.activeTarget) validateActiveTarget(params.activeTarget);
        }
        const api = withAzureCeExecution(makeApi(ctx.cwd), signal);
        const commands = [];
        for (let node = 1; node <= plan.topology.nodeCount; node++) {
          const vmName = `${plan.deploymentName}-${node}`;
          commands.push({
            category: `vm-${node}-instance-view`,
            args: [
              'vm',
              'get-instance-view',
              '--resource-group',
              plan.intent.resourceGroup,
              '--name',
              vmName,
              '--subscription',
              plan.subscription.id,
              '--output',
              'json',
            ],
          });
          commands.push({
            category: `vm-${node}-boot`,
            args: [
              'vm',
              'boot-diagnostics',
              'get-boot-log',
              '--resource-group',
              plan.intent.resourceGroup,
              '--name',
              vmName,
              '--subscription',
              plan.subscription.id,
            ],
          });
          for (let nic = 0; nic < plan.nics.length; nic++) {
            commands.push({
              category: `vm-${node}-nic-${nic}-nsg`,
              args: [
                'network',
                'nic',
                'list-effective-nsg',
                '--resource-group',
                plan.intent.resourceGroup,
                '--name',
                `${vmName}-nic${nic}`,
                '--subscription',
                plan.subscription.id,
                '--output',
                'json',
              ],
            });
            commands.push({
              category: `vm-${node}-nic-${nic}-routes`,
              args: [
                'network',
                'nic',
                'show-effective-route-table',
                '--resource-group',
                plan.intent.resourceGroup,
                '--name',
                `${vmName}-nic${nic}`,
                '--subscription',
                plan.subscription.id,
                '--output',
                'json',
              ],
            });
          }
          if (params.mode === 'active') {
            commands.push({
              category: `vm-${node}-cloud-init-status`,
              args: [
                'vm',
                'run-command',
                'invoke',
                '--resource-group',
                plan.intent.resourceGroup,
                '--name',
                vmName,
                '--command-id',
                'RunShellScript',
                '--scripts',
                'cloud-init status --long',
                '--subscription',
                plan.subscription.id,
                '--output',
                'json',
              ],
            });
            if (params.activeTarget) {
              const diagnosticNic = `${vmName}-nic${plan.nics.length > 1 ? 1 : 0}`;
              const sourceIp = await diagnosticSourceIp(
                api,
                plan.intent.resourceGroup,
                diagnosticNic,
                plan.subscription.id,
              );
              commands.push({
                category: `vm-${node}-next-hop`,
                args: [
                  'network',
                  'watcher',
                  'show-next-hop',
                  '--resource-group',
                  plan.intent.resourceGroup,
                  '--vm',
                  vmName,
                  '--nic',
                  diagnosticNic,
                  '--source-ip',
                  sourceIp,
                  '--dest-ip',
                  params.activeTarget.destinationIp,
                  '--subscription',
                  plan.subscription.id,
                  '--output',
                  'json',
                ],
              });
              commands.push({
                category: `vm-${node}-ip-flow`,
                args: [
                  'network',
                  'watcher',
                  'test-ip-flow',
                  '--resource-group',
                  plan.intent.resourceGroup,
                  '--vm',
                  vmName,
                  '--nic',
                  diagnosticNic,
                  '--direction',
                  params.activeTarget.direction,
                  '--protocol',
                  params.activeTarget.protocol,
                  '--local',
                  `${sourceIp}:${params.activeTarget.localPort}`,
                  '--remote',
                  `${params.activeTarget.destinationIp}:${params.activeTarget.destinationPort}`,
                  '--subscription',
                  plan.subscription.id,
                  '--output',
                  'json',
                ],
              });
            }
          }
        }
        if (plan.routing.mode === 'route-server') {
          commands.push({
            category: 'route-server-peers',
            args: [
              'network',
              'routeserver',
              'peering',
              'list',
              '--resource-group',
              plan.intent.resourceGroup,
              '--routeserver',
              `${plan.deploymentName}-rs`,
              '--subscription',
              plan.subscription.id,
              '--output',
              'json',
            ],
          });
          for (let node = 1; node <= plan.topology.nodeCount; node++)
            commands.push({
              category: `route-server-peer-${node}-learned-routes`,
              args: [
                'network',
                'routeserver',
                'peering',
                'list-learned-routes',
                '--resource-group',
                plan.intent.resourceGroup,
                '--routeserver',
                `${plan.deploymentName}-rs`,
                '--name',
                `${plan.deploymentName}-${node}`,
                '--subscription',
                plan.subscription.id,
                '--output',
                'json',
              ],
            });
        }
        const diagnostics = [];
        for (const command of commands) diagnostics.push(await collect(api, command.args, command.category));
        const status = await createAzureCeStatusTool(pi, makeApi).execute(
          _id,
          { planId: params.planId, planSha256: params.planSha256 },
          signal,
          _update,
          ctx,
        );
        const failures = diagnostics.filter((item) => !item.ok || item.errorsDetected);
        return {
          content: [
            {
              type: 'text',
              text: `Azure CE diagnostics completed in ${params.mode} mode: ${diagnostics.length} checks, ${failures.length} failures/findings. Raw boot and guest output was withheld.`,
            },
          ],
          details: {
            tool: 'azure_ce_diagnose',
            mode: params.mode,
            diagnostics,
            f5: status.details.evidence?.f5 ?? { status: 'unknown', reason: 'status-observation-unavailable' },
          },
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Azure CE diagnostics failed safely: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'azure_ce_diagnose' },
        };
      }
    },
  };
}
var init_azure_ce_diagnose = __esm(() => {
  init_artifacts();
  init_canonical();
  init_azure_ce_status();
  init_shared();
});

// plugins/azure/src/ce/cloud-init.ts
function analyzeCloudInit(source, secrets = []) {
  const findings = [];
  const hasForbiddenControl = Array.from(source).some((character) => {
    const code = character.charCodeAt(0);
    return code === 127 || (code < 32 && code !== 9 && code !== 10 && code !== 13);
  });
  if (hasForbiddenControl) findings.push({ severity: 'error', message: 'Input contains forbidden control characters' });
  const format = source.startsWith('#cloud-config') ? 'cloud-config' : source.startsWith('#!') ? 'shell' : 'unknown';
  if (format === 'unknown') findings.push({ severity: 'error', message: 'Missing #cloud-config or script header' });
  if (source.includes('runcmd:'))
    findings.push({ severity: 'info', message: 'Commands run during the final cloud-init stage' });
  if (source.includes('write_files:'))
    findings.push({ severity: 'info', message: 'Files are written during the config stage' });
  const sensitiveLineCount = source
    .split(`
`)
    .filter(
      (line) =>
        secrets.some((secret) => secret && line.includes(secret)) ||
        /^\s*(?:bootstrap_?token|token|password|secret|private_?key)\s*:/i.test(line),
    ).length;
  if (sensitiveLineCount > 0)
    findings.push({
      severity: 'warning',
      message: 'Sensitive bootstrap material is present and has been redacted from this analysis',
    });
  return {
    valid: !findings.some((finding) => finding.severity === 'error'),
    format,
    stages: ['init-local', 'init-network', 'config', 'final'],
    findings,
    sensitiveLineCount,
  };
}

// plugins/azure/src/tools/azure-cloud-init-analyze.ts
function createAzureCloudInitAnalyzeTool(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  return {
    name: 'azure_cloud_init_analyze',
    label: 'Analyze Azure cloud-init',
    description:
      'Validate CE or general Linux cloud-init, explain its execution stages, and summarize Azure boot status/log evidence without returning user data, custom data, or bootstrap tokens.',
    parameters: Type.Object({
      source: Type.Optional(Type.String()),
      sourceArtifactId: Type.Optional(Type.String()),
      subscriptionId: Type.Optional(Type.String()),
      resourceGroup: Type.Optional(Type.String()),
      vmName: Type.Optional(Type.String()),
    }),
    async execute(_id, params, _signal, _update, ctx) {
      try {
        let source = params.source;
        if (params.sourceArtifactId) {
          if (!/^\d+$/.test(params.sourceArtifactId)) throw new Error('Invalid source artifact ID');
          const path = await ctx.sessionManager.getArtifactPath(params.sourceArtifactId);
          if (!path) throw new Error('Source artifact was not found in this session');
          source = await Bun.file(path).text();
        }
        const analysis = source ? analyzeCloudInit(source) : undefined;
        let bootEvidence;
        if (params.subscriptionId || params.resourceGroup || params.vmName) {
          if (!params.subscriptionId || !params.resourceGroup || !params.vmName)
            throw new Error('subscriptionId, resourceGroup, and vmName are required together');
          const result = await makeApi(ctx.cwd).exec('az', [
            'vm',
            'boot-diagnostics',
            'get-boot-log',
            '--resource-group',
            params.resourceGroup,
            '--name',
            params.vmName,
            '--subscription',
            params.subscriptionId,
          ]);
          const raw = `${result.stdout}
${result.stderr}`;
          bootEvidence = {
            ok: result.exitCode === 0,
            bytes: Buffer.byteLength(raw),
            digest: sha256Hex(raw),
            cloudInitFinished: /cloud-init.*finish|status:\s*done/i.test(raw),
            errorsDetected: /cloud-init.*(?:error|fail)/i.test(raw),
          };
        }
        if (!analysis && !bootEvidence)
          throw new Error('Provide cloud-init source, a session artifact ID, or complete VM coordinates');
        return {
          content: [
            {
              type: 'text',
              text: `cloud-init analysis: ${analysis ? (analysis.valid ? 'valid' : 'invalid') : 'source not inspected'}; stages: init-local \u2192 init-network \u2192 config \u2192 final; boot evidence: ${bootEvidence ? (bootEvidence.ok ? 'collected' : 'unavailable') : 'not requested'}. Raw user data and logs were withheld.`,
            },
          ],
          details: { tool: 'azure_cloud_init_analyze', analysis, bootEvidence },
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `cloud-init analysis failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'azure_cloud_init_analyze' },
        };
      }
    },
  };
}
var init_azure_cloud_init_analyze = __esm(() => {
  init_canonical();
  init_shared();
});
// plugins/azure/src/presentation/ce.ts
var record = (value) => (value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {});
var fields = (values, title) => ({
  kind: 'fields',
  title,
  values,
  previewFields: 'all',
});
var count = (value) => (Array.isArray(value) ? value.length : 'Unknown');
var has = (value) => Object.keys(value).length > 0;
function ceSummary(name, details) {
  const inventory = record(details.inventory);
  if (
    name === 'azure_ce_inventory' &&
    typeof inventory.subscriptionId === 'string' &&
    Array.isArray(inventory.deployments)
  )
    return [
      fields(
        {
          'Subscription ID': inventory.subscriptionId,
          'Observed at': inventory.observedAt,
          'Caller source': inventory.callerSource,
          'Platform evidence': inventory.platformEvidence,
          ...record(inventory.counts),
          ...record(inventory.coverage),
          'Artifact ID': details.artifactId,
          'SHA-256': details.digestSha256,
        },
        'Customer Edge inventory',
      ),
      {
        kind: 'table',
        title: 'Deployments',
        rows: Array.isArray(inventory.deployments) ? inventory.deployments : [],
        columns: [
          { key: 'resourceGroup', label: 'Resource group' },
          { key: 'classification', label: 'Classification' },
          { key: 'confidence', label: 'Confidence' },
          { key: 'dimensions', label: 'Observed states' },
        ],
        previewRows: 12,
      },
    ];
  const observation = record(details.observation);
  if (name === 'azure_compute_discover' && has(record(observation.subscription)) && Array.isArray(observation.regions))
    return [
      fields(
        {
          ...record(observation.subscription),
          'Image URN': record(observation.image).urn,
          'Terms accepted': record(observation.image).termsAccepted,
          'Observed regions': count(observation.regions),
          'Observed resources': count(observation.resources),
          'Artifact ID': details.artifactId,
        },
        'Compute discovery',
      ),
    ];
  const plan = record(details.plan);
  if (name === 'azure_ce_plan' && typeof plan.planId === 'string' && Array.isArray(plan.actions))
    return [
      fields(
        {
          'Plan ID': plan.planId,
          'SHA-256': plan.planSha256,
          Region: plan.region,
          'Site name': plan.siteName,
          Namespace: plan.namespace,
          Nodes: record(plan.topology).nodeCount,
          'NICs per node': count(plan.nics),
          'Image URN': record(plan.image).urn,
          'Routing mode': record(plan.routing).mode,
          'Ordered actions': count(plan.actions),
          Warnings: plan.warnings,
          'Billable resources': plan.billableResources,
          'Artifact ID': details.artifactId,
        },
        'Immutable plan',
      ),
    ];
  const checkpoint = record(details.checkpoint);
  if (name === 'azure_ce_apply' && has(checkpoint))
    return [
      fields(
        {
          'Plan ID': details.planId,
          State: checkpoint.state,
          'Completed actions': count(checkpoint.completedActionIds),
          'Failed action': checkpoint.failedActionId,
        },
        'Checkpoint',
      ),
    ];
  const evidence = record(details.evidence),
    azure = record(evidence.azure),
    f5 = record(evidence.f5);
  if (name === 'azure_ce_status' && has(record(evidence.checkpoint)) && has(record(evidence.azure)))
    return [
      fields(
        {
          'Plan ID': evidence.planId,
          State: record(evidence.checkpoint).state,
          'Completed actions': count(record(evidence.checkpoint).completedActionIds),
          'Resource records': count(azure.resources),
          'VM records': count(azure.vms),
          Coverage: azure.coverage,
          'Routing mode': evidence.routingMode,
          'Route Server peers': count(azure.routeServerPeers),
          'Site state': f5.siteState,
          Nodes: f5.nodes,
          'BGP established': f5.bgpEstablished,
          'Learned routes': f5.learnedRouteCount,
        },
        'Customer Edge status',
      ),
    ];
  if (name === 'azure_ce_diagnose' && Array.isArray(details.diagnostics))
    return [
      fields(
        {
          Mode: details.mode,
          Checks: details.diagnostics.length,
          Findings: details.diagnostics.filter((value) => {
            const item = record(value);
            return item.ok === false || item.errorsDetected === true;
          }).length,
          ...record(details.f5),
          'Raw output': 'Withheld by the domain tool',
        },
        'Diagnostics',
      ),
    ];
  const analysis = record(details.analysis),
    boot = record(details.bootEvidence);
  if (name === 'azure_cloud_init_analyze' && (has(analysis) || has(boot)))
    return [
      ...(has(analysis) ? [fields(analysis, 'cloud-init analysis')] : []),
      ...(has(boot) ? [fields(boot, 'Boot evidence')] : []),
    ];
  return;
}

// plugins/azure/src/presentation.ts
init_az_activity_log_list2();
init_az_exec2();
init_az_resource_graph_query2();
init_az_vm_list2();
var record2 = (v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {});
var fields2 = (values, title) => ({
  kind: 'fields',
  title,
  values,
  previewFields: 'all',
});
var rowArray = (v) => Array.isArray(v) && v.every((x) => x !== null && typeof x === 'object' && !Array.isArray(x));
function argv(name, args) {
  switch (name) {
    case 'az_account_show':
      return ['az', ...jsonArgs(accountArgs(args))];
    case 'az_group_list':
      return ['az', ...jsonArgs(groupArgs(args))];
    case 'az_resource_list':
      return typeof args.resource_group === 'string' ? ['az', ...jsonArgs(resourceArgs(args))] : undefined;
    case 'az_vm_list':
      return ['az', ...jsonArgs(buildVmArgs(args))];
    case 'az_resource_graph_query':
      return typeof args.query === 'string' ? ['az', ...buildResourceGraphArgs(args)] : undefined;
    case 'az_activity_log_list':
      return typeof args.subscription === 'string' ? ['az', ...buildActivityLogArgs(args)] : undefined;
    case 'az_exec':
      return Array.isArray(args.args) && args.args.every((x) => typeof x === 'string')
        ? ['az', ...buildAzArgs(args.args)]
        : undefined;
    case 'az_help':
      return ['az', ...helpArgs(typeof args.command_path === 'string' ? args.command_path : undefined)];
  }
}
var labels = Object.fromEntries([
  ['id', 'Resource ID'],
  ['name', 'Name'],
  ['location', 'Location'],
  ['type', 'Resource type'],
  ['resourceGroup', 'Resource group'],
  ['state', 'State'],
  ['tenantId', 'Tenant ID'],
  ['isDefault', 'Default subscription'],
  ['vmSize', 'VM size'],
  ['powerState', 'Power state'],
  ['provisioningState', 'Provisioning state'],
  ['osType', 'OS type'],
]);
function presentTool(tool, p) {
  const prefix = (args) => {
    const command = argv(tool.name, args);
    const scope = Object.fromEntries(
      Object.entries(args).filter(([key]) =>
        [
          'action',
          'name',
          'tag',
          'subscriptionId',
          'resourceGroup',
          'vmName',
          'subscription',
          'subscriptions',
          'resource_group',
          'resource_type',
          'first',
          'skip',
          'max_events',
          'lookback_days',
          'include_power_state',
          'include_network_identifiers',
        ].includes(key),
      ),
    );
    return [
      ...(command ? [p.command(command)] : []),
      fields2(
        { ...scope, Coverage: 'Subscription and resource-group scope are limited to the returned data.' },
        'Scope',
      ),
    ];
  };
  return p.withPresentation(tool, {
    call: (input, options) => {
      const args = record2(input);
      const safe = Object.fromEntries(
        Object.entries(args).filter(([key]) => !['source', 'bootstrapRef', 'bootstrapRefs'].includes(key)),
      );
      return { sections: options.expanded ? p.data(safe) : prefix(safe) };
    },
    result: (result, options, input) => {
      const args = record2(input),
        details = record2(result.details),
        base = prefix(args);
      const texts = result.content
        .filter((b) => b.type === 'text')
        .map((b) => ({
          kind: 'code',
          title: result.isError ? 'Complete corrective guidance' : 'CLI evidence',
          text: b.text ?? '',
        }));
      if (result.isError) return { summary: 'Azure operation failed', sections: [...base, ...texts] };
      const collection = {
        az_account_show: 'subscriptions',
        az_group_list: 'resourceGroups',
        az_resource_list: 'resources',
        az_vm_list: 'vms',
        az_resource_graph_query: 'data',
        az_activity_log_list: 'events',
      }[tool.name];
      if (collection && rowArray(details[collection])) {
        const rows = details[collection];
        const { [collection]: _rows, ...metadata } = details;
        const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
        const section =
          tool.name === 'az_account_show' && args.action !== 'list' && rows.length === 1
            ? fields2(rows[0], 'Subscription identity')
            : {
                ...p.table(
                  rows,
                  keys.map((key) => ({ key, label: labels[key] ?? key })),
                  collection,
                ),
                previewRows: 12,
              };
        return {
          expandedEvidence: 'provided',
          warnings: [
            ...(details.outcome === 'partial_scope'
              ? ['Some subscription scopes were inaccessible; results do not cover all requested scopes.']
              : []),
            ...(details.truncated === true
              ? ['More records are available; continue with the returned page token or offset.']
              : []),
          ],
          sections: [
            ...base,
            fields2({ 'Returned rows': rows.length }, 'Results'),
            section,
            fields2(
              Object.fromEntries(
                Object.entries(metadata).filter(([key]) =>
                  [
                    'outcome',
                    'count',
                    'totalRecords',
                    'truncated',
                    'skipToken',
                    'inaccessibleScopeCount',
                    'coverage',
                    'scopeEvidence',
                  ].includes(key),
                ),
              ),
              'Coverage and pagination',
            ),
            ...(options.expanded
              ? p.data(
                  Object.fromEntries(
                    Object.entries(metadata).filter(
                      ([key]) =>
                        ![
                          'outcome',
                          'count',
                          'totalRecords',
                          'truncated',
                          'skipToken',
                          'inaccessibleScopeCount',
                          'coverage',
                          'scopeEvidence',
                        ].includes(key),
                    ),
                  ),
                  'Metadata',
                )
              : []),
          ],
        };
      }
      const ce = ceSummary(tool.name, details);
      if (ce)
        return {
          expandedEvidence: 'provided',
          sections: [...base, ...(options.expanded ? p.data(details, 'Complete safe CE evidence') : ce)],
        };
      if (tool.name === 'az_exec' && typeof details.fullOutput === 'string') {
        try {
          return {
            expandedEvidence: 'provided',
            sections: [...base, ...p.data(JSON.parse(details.fullOutput), 'CLI result')],
            warnings: details.modelPreviewTruncated
              ? ['Model preview was truncated; complete CLI output is shown.']
              : [],
          };
        } catch {
          return {
            sections: [...base, { kind: 'code', title: 'Complete CLI output', text: details.fullOutput }],
          };
        }
      }
      if (tool.name === 'az_help' && texts.some((b) => /^(?:Group|Command|Arguments|Examples|usage:)/m.test(b.text)))
        return { expandedEvidence: 'provided', sections: [...base, ...texts] };
      return { sections: [...base, ...texts] };
    },
  });
}

// plugins/azure/src/index.ts
function sanitizeHintField(value, maxLen = 200) {
  if (typeof value !== 'string') return '';
  return value.replace(/[^\x20-\x7E]/g, '').slice(0, maxLen);
}
function retryAfterMsFromHeaders(text, now = Date.now()) {
  const retryAfter = text.match(/(?:^|\r?\n)retry-after:\s*([^\r\n]+)/i)?.[1]?.trim();
  if (retryAfter && /^\d+$/.test(retryAfter)) return Number(retryAfter) * 1000;
  if (retryAfter) {
    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) return Math.max(0, retryAt - now);
  }
  const reset = text.match(/(?:^|\r?\n)x-ratelimit-reset:\s*(\d+)/i)?.[1];
  return reset ? Math.max(0, Number(reset) * 1000 - now) : undefined;
}
function azureInstallArgv(platform = process.platform) {
  if (platform === 'darwin') return ['brew', 'install', 'azure-cli'];
  if (platform === 'win32') return ['winget', 'install', '--exact', '--id', 'Microsoft.AzureCLI'];
  return ['sudo', 'apt-get', 'install', '--yes', 'azure-cli'];
}
var factory = async (pi) => {
  const presentTool2 = (tool) => presentTool(tool, pi.presentation);
  pi.setLabel('Azure');
  const integration = pi.integrations.register({
    id: 'azure',
    name: 'Azure',
    plugin: 'azure',
    kind: 'network',
    setup: {
      pluginDependencies: [],
      requiredEnvironment: [],
      profileFields: ['accounts'],
      steps: [
        {
          kind: 'install',
          argv: azureInstallArgv(),
          timeoutMs: 300000,
        },
        {
          kind: 'install',
          argv: ['az', 'extension', 'add', '--name', 'resource-graph', '--upgrade'],
          timeoutMs: 120000,
        },
        {
          kind: 'login',
          argv: ['az', 'login', '--use-device-code'],
          timeoutMs: 300000,
        },
      ],
      verification: [
        {
          argv: ['az', 'account', 'show', '--output', 'json'],
          timeoutMs: 30000,
        },
      ],
    },
    async probe() {
      const checker = process.platform === 'win32' ? 'where' : 'which';
      if (Bun.spawnSync([checker, 'az']).exitCode !== 0) return { state: 'setup_required', reason: 'cli_missing' };
      const result = Bun.spawnSync(['az', 'account', 'show', '--output', 'json']);
      if (result.exitCode !== 0) {
        const rawError = new TextDecoder().decode(result.stderr);
        const error = rawError.toLowerCase();
        if (/rate limit|too many requests|throttl|429/.test(error))
          return {
            state: 'rate_limited',
            reason: 'rate_limited',
            retryAfterMs: retryAfterMsFromHeaders(rawError),
          };
        if (error.includes('expired')) return { state: 'setup_required', reason: 'expired' };
        if (error.includes('denied') || error.includes('forbidden'))
          return { state: 'unavailable', reason: 'permission_denied' };
        if (error.includes('connect') || error.includes('network')) return { state: 'unavailable', reason: 'network' };
        return { state: 'setup_required', reason: 'not_authenticated' };
      }
      try {
        const value = JSON.parse(new TextDecoder().decode(result.stdout));
        if (!value.id || !value.user?.name) return { state: 'error', reason: 'invalid_response' };
        return { state: 'ready', value };
      } catch {
        return { state: 'error', reason: 'invalid_response' };
      }
    },
    profile(value) {
      const principalType = value.user?.type?.toLowerCase() === 'user' ? 'user' : 'service';
      return {
        facts: {
          accounts: [
            {
              provider: 'azure',
              identifier: value.user.name,
              principalType,
              accountId: value.id,
              tenantId: value.tenantId,
              username: value.user.name,
            },
          ],
        },
        observations: [],
      };
    },
  });
  let azAvailable = false;
  try {
    const checker = process.platform === 'win32' ? 'where' : 'which';
    azAvailable = Bun.spawnSync([checker, 'az']).exitCode === 0;
  } catch {}
  if (azAvailable && typeof pi.registerTool === 'function') {
    await Promise.resolve().then(() => init_az_account_show2());
    await Promise.resolve().then(() => init_az_group_list2());
    await Promise.resolve().then(() => init_az_resource_list2());
    await Promise.resolve().then(() => init_az_vm_list2());
    await Promise.resolve().then(() => init_az_resource_graph_query2());
    await Promise.resolve().then(() => init_az_activity_log_list2());
    await Promise.resolve().then(() => init_azure_ce_inventory2());
    await Promise.resolve().then(() => init_az_exec2());
    await Promise.resolve().then(() => init_az_help2());
    await Promise.resolve().then(() => init_azure_compute_discover());
    await Promise.resolve().then(() => init_azure_ce_plan());
    await Promise.resolve().then(() => init_azure_ce_apply());
    await Promise.resolve().then(() => init_azure_ce_status());
    await Promise.resolve().then(() => init_azure_ce_upgrade());
    await Promise.resolve().then(() => init_azure_ce_failover());
    await Promise.resolve().then(() => init_azure_ce_teardown());
    await Promise.resolve().then(() => init_azure_ce_diagnose());
    await Promise.resolve().then(() => init_azure_cloud_init_analyze());
    pi.registerTool(presentTool2(createAzAccountShowTool(pi)));
    pi.registerTool(presentTool2(createAzGroupListTool(pi)));
    pi.registerTool(presentTool2(createAzResourceListTool(pi)));
    pi.registerTool(presentTool2(createAzVmListTool(pi)));
    pi.registerTool(presentTool2(createAzResourceGraphQueryTool(pi)));
    pi.registerTool(presentTool2(createAzActivityLogListTool(pi)));
    pi.registerTool(presentTool2(createAzureCeInventoryTool(pi)));
    pi.registerTool(presentTool2(createAzExecTool(pi)));
    pi.registerTool(presentTool2(createAzHelpTool(pi)));
    pi.registerTool(presentTool2(createAzureComputeDiscoverTool(pi)));
    pi.registerTool(presentTool2(createAzureCePlanTool(pi)));
    pi.registerTool(presentTool2(createAzureCeApplyTool(pi)));
    pi.registerTool(presentTool2(createAzureCeStatusTool(pi)));
    pi.registerTool(presentTool2(createAzureCeUpgradeTool(pi)));
    pi.registerTool(presentTool2(createAzureCeFailoverTool(pi)));
    pi.registerTool(presentTool2(createAzureCeTeardownTool(pi)));
    pi.registerTool(presentTool2(createAzureCeDiagnoseTool(pi)));
    pi.registerTool(presentTool2(createAzureCloudInitAnalyzeTool(pi)));
  }
  if (typeof pi.on === 'function') {
    pi.on('before_agent_start', async (_event, _ctx) => {
      const accountLines = [];
      try {
        if (!azAvailable) throw new Error('az CLI unavailable');
        const snapshot = await integration.get();
        if (snapshot.state === 'ready' && snapshot.value) {
          const account = snapshot.value;
          accountLines.push(
            ...[
              account.name ? `Subscription: ${sanitizeHintField(account.name)} (${sanitizeHintField(account.id)})` : '',
              account.tenantId ? `Tenant: ${sanitizeHintField(account.tenantId)}` : '',
              account.user?.name
                ? `User: ${sanitizeHintField(account.user.name)} (${sanitizeHintField(account.user.type)})`
                : '',
              account.environmentName ? `Cloud: ${sanitizeHintField(account.environmentName)}` : '',
            ].filter(Boolean),
          );
        }
      } catch {}
      const content = accountLines.join(`
`);
      if (!content) return;
      return {
        message: {
          customType: 'azure_hint',
          content,
          display: false,
        },
      };
    });
  }
  if (typeof pi.on === 'function') {
    pi.on('session_start', async (_event, _ctx) => {
      if (!azAvailable) {
        pi.logger.debug('Azure: az CLI not found');
      }
    });
  }
};
var src_default = factory;

export { azureInstallArgv, retryAfterMsFromHeaders, src_default as default };
