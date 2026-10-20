import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation';
import { accountArgs, groupArgs, helpArgs, jsonArgs, resourceArgs } from './az/arguments';
import { ceSummary } from './presentation/ce';
import { buildActivityLogArgs } from './tools/az-activity-log-list';
import { buildAzArgs } from './tools/az-exec';
import { buildResourceGraphArgs } from './tools/az-resource-graph-query';
import { buildVmArgs } from './tools/az-vm-list';

type Result = { content: readonly { type: string; text?: string }[]; details?: unknown; isError?: boolean };
type Options = { expanded: boolean; isPartial: boolean };
type Section = ReturnType<PresentationAPI['data']>[number];
const record = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const fields = (values: Record<string, unknown>, title: string): Section => ({
  kind: 'fields',
  title,
  values,
  previewFields: 'all',
});
const rowArray = (v: unknown): v is Record<string, unknown>[] =>
  Array.isArray(v) && v.every((x) => x !== null && typeof x === 'object' && !Array.isArray(x));
function argv(name: string, args: Record<string, unknown>): string[] | undefined {
  switch (name) {
    case 'az_account_show':
      return ['az', ...jsonArgs(accountArgs(args))];
    case 'az_group_list':
      return ['az', ...jsonArgs(groupArgs(args))];
    case 'az_resource_list':
      return typeof args.resource_group === 'string'
        ? ['az', ...jsonArgs(resourceArgs(args as Parameters<typeof resourceArgs>[0]))]
        : undefined;
    case 'az_vm_list':
      return ['az', ...jsonArgs(buildVmArgs(args))];
    case 'az_resource_graph_query':
      return typeof args.query === 'string'
        ? ['az', ...buildResourceGraphArgs(args as Parameters<typeof buildResourceGraphArgs>[0])]
        : undefined;
    case 'az_activity_log_list':
      return typeof args.subscription === 'string'
        ? ['az', ...buildActivityLogArgs(args as Parameters<typeof buildActivityLogArgs>[0])]
        : undefined;
    case 'az_exec':
      return Array.isArray(args.args) && args.args.every((x) => typeof x === 'string')
        ? ['az', ...buildAzArgs(args.args)]
        : undefined;
    case 'az_help':
      return ['az', ...helpArgs(typeof args.command_path === 'string' ? args.command_path : undefined)];
  }
}
const labels: Record<string, string> = Object.fromEntries([
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
/** Domain data only; xcsh owns layout, command quoting, themes and lifecycle. */
export function presentTool<T extends { name: string; label?: string }>(tool: T, p: PresentationAPI) {
  const prefix = (args: Record<string, unknown>): Section[] => {
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
      fields(
        { ...scope, Coverage: 'Subscription and resource-group scope are limited to the returned data.' },
        'Scope',
      ),
    ];
  };
  return p.withPresentation(tool, {
    call: (input: unknown, options: Options) => {
      const args = record(input);
      const safe = Object.fromEntries(
        Object.entries(args).filter(([key]) => !['source', 'bootstrapRef', 'bootstrapRefs'].includes(key)),
      );
      return { sections: options.expanded ? p.data(safe) : prefix(safe) };
    },
    result: (result: Result, options: Options, input: unknown) => {
      const args = record(input),
        details = record(result.details),
        base = prefix(args);
      const texts = result.content
        .filter((b) => b.type === 'text')
        .map((b) => ({
          kind: 'code' as const,
          title: result.isError ? 'Complete corrective guidance' : 'CLI evidence',
          text: b.text ?? '',
        }));
      if (result.isError) return { summary: 'Azure operation failed', sections: [...base, ...texts] };
      const collection = (
        {
          az_account_show: 'subscriptions',
          az_group_list: 'resourceGroups',
          az_resource_list: 'resources',
          az_vm_list: 'vms',
          az_resource_graph_query: 'data',
          az_activity_log_list: 'events',
        } as Record<string, string>
      )[tool.name];
      if (collection && rowArray(details[collection])) {
        const rows = details[collection];
        const { [collection]: _rows, ...metadata } = details;
        const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
        const section =
          tool.name === 'az_account_show' && args.action !== 'list' && rows.length === 1
            ? fields(rows[0], 'Subscription identity')
            : {
                ...p.table(
                  rows,
                  keys.map((key) => ({ key, label: labels[key] ?? key })),
                  collection,
                ),
                previewRows: 12,
              };
        return {
          expandedEvidence: 'provided' as const,
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
            fields({ 'Returned rows': rows.length }, 'Results'),
            section,
            fields(
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
          expandedEvidence: 'provided' as const,
          sections: [...base, ...(options.expanded ? p.data(details, 'Complete safe CE evidence') : ce)],
        };
      if (tool.name === 'az_exec' && typeof details.fullOutput === 'string') {
        try {
          return {
            expandedEvidence: 'provided' as const,
            sections: [...base, ...p.data(JSON.parse(details.fullOutput), 'CLI result')],
            warnings: details.modelPreviewTruncated
              ? ['Model preview was truncated; complete CLI output is shown.']
              : [],
          };
        } catch {
          return {
            sections: [...base, { kind: 'code' as const, title: 'Complete CLI output', text: details.fullOutput }],
          };
        }
      }
      if (tool.name === 'az_help' && texts.some((b) => /^(?:Group|Command|Arguments|Examples|usage:)/m.test(b.text)))
        return { expandedEvidence: 'provided' as const, sections: [...base, ...texts] };
      return { sections: [...base, ...texts] };
    },
  });
}
