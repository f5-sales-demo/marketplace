import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation';
import { helpArgs, inventoryArgs, jsonArgs, listArgs } from './gcloud/arguments';
import { buildGcloudArgs } from './tools/gcloud-exec-guard';

type Result = { content: readonly { type: string; text?: string }[]; details?: unknown; isError?: boolean };
type Options = { expanded: boolean; isPartial: boolean };
type Section = ReturnType<PresentationAPI['data']>[number];
const record = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const rows = (v: unknown): v is Record<string, unknown>[] =>
  Array.isArray(v) && v.every((x) => x !== null && typeof x === 'object' && !Array.isArray(x));
const fields = (values: Record<string, unknown>, title: string): Section => ({
  kind: 'fields',
  title,
  values,
  previewFields: 'all',
});
const labels: Record<string, string> = {
  projectId: 'Project ID',
  projectNumber: 'Project number',
  lifecycleState: 'Lifecycle state',
  name: 'Name',
  zone: 'Zone',
  machineType: 'Machine type',
  status: 'Status',
  internalIp: 'Internal IP',
  externalIp: 'External IP',
  location: 'Location',
  storageClass: 'Storage class',
  created: 'Created',
  ownership: 'Ownership evidence',
};
function argv(name: string, args: Record<string, unknown>): string[] | undefined {
  switch (name) {
    case 'gcloud_config_list':
      return ['gcloud', ...jsonArgs(['config', 'list'])];
    case 'gcloud_projects_list':
      return ['gcloud', ...jsonArgs(listArgs('projects', args))];
    case 'gcloud_compute_instances_list':
      return ['gcloud', ...jsonArgs(listArgs('instances', args))];
    case 'gcloud_storage_buckets_list':
      return ['gcloud', ...jsonArgs(listArgs('buckets', args))];
    case 'gcloud_help':
      return ['gcloud', ...helpArgs(typeof args.command_path === 'string' ? args.command_path : undefined)];
    case 'gcloud_exec':
      return Array.isArray(args.args) && args.args.every((x) => typeof x === 'string')
        ? ['gcloud', ...buildGcloudArgs(args.args)]
        : undefined;
    case 'gcp_project_identity':
      return typeof args.project === 'string'
        ? ['gcloud', ...jsonArgs(['projects', 'describe', args.project, `--project=${args.project}`])]
        : undefined;
    case 'gcp_ce_inventory':
    case 'gcp_ce_status':
    case 'gcp_ce_diagnose':
      return typeof args.project === 'string' && typeof args.deploymentName === 'string'
        ? ['gcloud', ...jsonArgs(inventoryArgs(args.project, args.deploymentName))]
        : undefined;
  }
}
/** Domain interpretation only. The runtime owns layout, quoting, appearance and lifecycle. */
export function presentTool<T extends { name: string; label?: string }>(tool: T, p: PresentationAPI) {
  const prefix = (args: Record<string, unknown>): Section[] => {
    const command = argv(tool.name, args);
    const scope = Object.fromEntries(
      Object.entries(args).filter(([key]) =>
        ['project', 'region', 'zone', 'filter', 'limit', 'deploymentName', 'engine'].includes(key),
      ),
    );
    return [
      ...(command ? [p.command(command)] : []),
      fields(
        {
          ...scope,
          Coverage: 'Returned cloud data does not establish platform, interface, routing or application health.',
        },
        'Scope',
      ),
    ];
  };
  return p.withPresentation(tool, {
    call: (input: unknown, options: Options) => ({
      sections: options.expanded ? p.data(record(input)) : prefix(record(input)),
    }),
    result: (result: Result, options: Options, input: unknown) => {
      const details = record(result.details),
        base = prefix(record(input));
      const texts: Section[] = result.content
        .filter((b) => b.type === 'text')
        .map((b) => ({
          kind: 'code',
          title: result.isError ? 'Complete corrective guidance' : 'CLI evidence',
          text: b.text ?? '',
        }));
      if (result.isError) return { summary: 'Google Cloud operation failed', sections: [...base, ...texts] };
      const collection = (
        {
          gcloud_projects_list: 'projects',
          gcloud_compute_instances_list: 'instances',
          gcloud_storage_buckets_list: 'buckets',
          gcp_ce_inventory: 'instances',
          gcp_ce_status: 'instances',
          gcp_ce_diagnose: 'instances',
        } as Record<string, string>
      )[tool.name];
      if (collection && rows(details[collection])) {
        const items = details[collection],
          { [collection]: _items, ...metadata } = details;
        const keys = [...new Set(items.flatMap((row) => Object.keys(row)))];
        return {
          expandedEvidence: 'provided' as const,
          sections: [
            ...base,
            fields({ 'Returned rows': items.length }, 'Results'),
            {
              ...p.table(
                items,
                keys.map((key) => ({ key, label: labels[key] ?? key })),
                collection,
              ),
              previewRows: 12,
            },
            ...(tool.name.startsWith('gcp_')
              ? [fields(metadata, 'Coverage and health boundaries')]
              : p.data(metadata, 'Coverage and metadata')),
          ],
          warnings: options.isPartial ? ['Partial result; execution has not completed.'] : [],
        };
      }
      if (tool.name === 'gcloud_config_list' && Object.keys(record(details.config)).length)
        return {
          expandedEvidence: 'provided' as const,
          sections: [
            ...base,
            fields(record(details.config), 'Configuration identity'),
            ...p.data(
              Object.fromEntries(Object.entries(details).filter(([key]) => !['config', 'tool'].includes(key))),
              'Metadata',
            ),
          ],
        };
      if (
        tool.name === 'gcp_project_identity' &&
        typeof details.project === 'string' &&
        typeof details.projectNumber === 'string'
      )
        return { expandedEvidence: 'provided' as const, sections: [...base, fields(details, 'Project identity')] };
      const discovery = record(details.discovery);
      if (
        tool.name === 'gcp_compute_discover' &&
        discovery.schemaVersion === 1 &&
        typeof discovery.project === 'string' &&
        rows(discovery.images) &&
        rows(discovery.machineTypes) &&
        rows(discovery.quotas) &&
        Array.isArray(discovery.enabledApis) &&
        Array.isArray(discovery.receipts) &&
        Object.keys(record(discovery.checks)).length
      ) {
        const summary = fields(
          {
            Project: discovery.project,
            Region: discovery.region,
            'Observed at': discovery.observedAt,
            'Billing enabled': discovery.billingEnabled,
            Images: discovery.images.length,
            'Machine types': discovery.machineTypes.length,
            'Enabled APIs': discovery.enabledApis.length,
            IAM: record(discovery.checks).iam,
            ...Object.fromEntries(Object.entries(record(discovery.checks)).filter(([key]) => key !== 'iam')),
          },
          'Compute readiness',
        );
        return {
          expandedEvidence: 'provided' as const,
          sections: [
            ...base,
            ...(options.expanded
              ? p.data(details, 'Complete safe discovery evidence')
              : [
                  summary,
                  {
                    ...p.table(
                      discovery.machineTypes,
                      [
                        { key: 'name', label: 'Name' },
                        { key: 'zone', label: 'Zone' },
                        { key: 'guestCpus', label: 'vCPUs' },
                        { key: 'memoryMb', label: 'Memory (MB)' },
                      ],
                      'Machine types',
                    ),
                    previewRows: 12,
                  },
                  {
                    ...p.table(
                      discovery.quotas,
                      [
                        { key: 'metric', label: 'Quota metric' },
                        { key: 'limit', label: 'Limit (metric units)' },
                        { key: 'usage', label: 'Usage (metric units)' },
                      ],
                      'Quotas',
                    ),
                    previewRows: 12,
                  },
                ]),
          ],
          warnings: [
            'Discovery does not qualify IAM, organization policy, capacity, NIC limits or license acceptance.',
          ],
        };
      }
      const plan = record(details.plan);
      if (
        tool.name === 'gcp_ce_plan' &&
        plan.schemaVersion === 1 &&
        typeof plan.planHash === 'string' &&
        plan.executable === false &&
        Array.isArray(plan.actions) &&
        Array.isArray(plan.unavailable) &&
        Object.keys(record(plan.intent)).length
      ) {
        return {
          expandedEvidence: 'provided' as const,
          sections: [
            ...base,
            ...(options.expanded
              ? p.data(details, 'Complete safe plan evidence')
              : [
                  fields(
                    {
                      'Plan hash': plan.planHash,
                      Executable: plan.executable,
                      Engine: plan.engine,
                      Approval: plan.approval,
                      'Disk (GiB)': record(plan.intent).diskGiB,
                      Prerequisites: plan.unavailable,
                      Availability: details.availability,
                    },
                    'Customer Edge readiness plan',
                  ),
                ]),
          ],
          warnings: ['Readiness plan is non-executable; no mutation or approval was attempted.'],
        };
      }
      if (tool.name === 'gcloud_exec' && typeof details.fullOutput === 'string') {
        try {
          return {
            expandedEvidence: 'provided' as const,
            sections: [...base, ...p.data(JSON.parse(details.fullOutput), 'Complete CLI result')],
            warnings: details.modelPreviewTruncated
              ? ['Model preview was truncated; complete CLI output is available.']
              : [],
          };
        } catch {
          /* Opaque evidence retains automatic fallback. */
        }
      }
      return { sections: [...base, ...texts] };
    },
  });
}
