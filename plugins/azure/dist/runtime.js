// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun
import {
  accountArgs,
  buildActivityLogArgs2,
  buildAzArgs2,
  buildResourceGraphArgs2,
  buildVmArgs2,
  groupArgs,
  helpArgs,
  jsonArgs,
  resourceArgs,
} from './runtime-2139fbqg.js';

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
      return ['az', ...jsonArgs(buildVmArgs2(args))];
    case 'az_resource_graph_query':
      return typeof args.query === 'string' ? ['az', ...buildResourceGraphArgs2(args)] : undefined;
    case 'az_activity_log_list':
      return typeof args.subscription === 'string' ? ['az', ...buildActivityLogArgs2(args)] : undefined;
    case 'az_exec':
      return Array.isArray(args.args) && args.args.every((x) => typeof x === 'string')
        ? ['az', ...buildAzArgs2(args.args)]
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
    const { createAzAccountShowTool } = await import('./runtime-214rgxfc.js');
    const { createAzGroupListTool } = await import('./runtime-zy4c7by7.js');
    const { createAzResourceListTool } = await import('./runtime-kr0zmem7.js');
    const { createAzVmListTool } = await import('./runtime-ax6da5zk.js');
    const { createAzResourceGraphQueryTool } = await import('./runtime-v14wzntm.js');
    const { createAzActivityLogListTool } = await import('./runtime-krvrx7kc.js');
    const { createAzureCeInventoryTool } = await import('./runtime-sk240hsn.js');
    const { createAzExecTool } = await import('./runtime-51swkq60.js');
    const { createAzHelpTool } = await import('./runtime-s7b82gyx.js');
    const { createAzureComputeDiscoverTool } = await import('./runtime-bfh65mft.js');
    const { createAzureCePlanTool } = await import('./runtime-p1g8845v.js');
    const { createAzureCeApplyTool } = await import('./runtime-44ty037d.js');
    const { createAzureCeStatusTool } = await import('./runtime-eh77jhqd.js');
    const { createAzureCeUpgradeTool } = await import('./runtime-6egh68xr.js');
    const { createAzureCeFailoverTool } = await import('./runtime-whz8cy1n.js');
    const { createAzureCeTeardownTool } = await import('./runtime-e11cbkb1.js');
    const { createAzureCeDiagnoseTool } = await import('./runtime-h0r8tbt6.js');
    const { createAzureCloudInitAnalyzeTool } = await import('./runtime-4bw8ps08.js');
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
