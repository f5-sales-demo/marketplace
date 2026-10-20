import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation';

type Section = ReturnType<PresentationAPI['data']>[number];
type Options = { expanded: boolean; isPartial: boolean };
type Result = { content: readonly { type: string; text?: string }[]; details?: unknown; isError?: boolean };
const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const record = (v: unknown): Record<string, unknown> => (isRecord(v) ? v : {});
const rows = (v: unknown): v is Record<string, unknown>[] => Array.isArray(v) && v.every(isRecord);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');
const value = (v: unknown) => (v === undefined || v === null ? 'unknown' : v);
const fields = (values: Record<string, unknown>, title: string): Section => ({
  kind: 'fields',
  values,
  title,
  previewFields: 'all',
});
const identity = (v: unknown) =>
  isRecord(v) &&
  ['repository', 'commit', 'source_spec_sha256', 'catalog_sha256', 'bundle_sha256'].every(
    (k) => typeof v[k] === 'string',
  );
const outcomes = (v: unknown): v is Record<string, unknown>[] =>
  rows(v) &&
  v.every(
    (r) =>
      ['kind', 'name', 'operation', 'status'].every((k) => typeof r[k] === 'string') &&
      (r.guidance === undefined || typeof r.guidance === 'string'),
  );

/** Native domain data only; runtime owns layout, themes, expansion and lifecycle. */
export function presentTool<T extends { name: string; label?: string }>(tool: T, p: PresentationAPI) {
  const request = (input: unknown): Section[] => {
    const keys = [
      'inputPath',
      'inputType',
      'policyPath',
      'signaturesPath',
      'namespace',
      'outputDirectory',
      'targetName',
      'allowPartial',
      'overwrite',
      'action',
      'artifactDirectory',
      'receiptPath',
      'planDigest',
    ];
    const values = Object.fromEntries(Object.entries(record(input)).filter(([k]) => keys.includes(k)));
    return Object.keys(values).length ? [fields(values, 'Requested scope')] : [];
  };
  const table = (
    items: Record<string, unknown>[],
    columns: { key: string; label: string }[],
    title: string,
  ): Section => ({ ...p.table(items, columns, title), previewRows: 12 });
  const outcomeTable = (items: Record<string, unknown>[], title: string) =>
    table(
      items,
      [
        { key: 'kind', label: 'Resource kind' },
        { key: 'name', label: 'Name' },
        { key: 'operation', label: 'Operation' },
        { key: 'status', label: 'Status' },
        { key: 'guidance', label: 'Corrective guidance' },
      ],
      title,
    );
  return p.withPresentation(tool, {
    call: (input: unknown, options: Options) => ({
      summary: tool.label ?? tool.name,
      sections: options.expanded ? p.data(input, 'Complete request') : request(input),
    }),
    result: (result: Result, options: Options, input: unknown) => {
      const d = record(result.details);
      const texts: Section[] = result.content
        .filter((b) => b.type === 'text')
        .map((b) => ({
          kind: 'code',
          title: result.isError ? 'Complete corrective guidance' : 'Complete operator guidance',
          text: b.text ?? '',
        }));
      const fallback = () => ({ sections: [...request(input), ...texts] });
      if (result.content.some((b) => b.type !== 'text')) return fallback();
      const complete = (summary: string, sections: Section[]) => ({
        summary,
        expandedEvidence: 'provided' as const,
        sections: options.expanded
          ? [...p.data(d, 'Complete safe evidence'), ...texts]
          : [...request(input), ...sections, ...texts],
      });
      if (
        result.isError &&
        d.tool === tool.name &&
        d.ok === false &&
        typeof d.errorCategory === 'string' &&
        [
          'validation',
          'unsafe_input',
          'signature',
          'conversion',
          'contract',
          'output',
          'io',
          'authentication',
          'transport',
          'deployment',
          'receipt',
          'artifact',
          'namespace',
          'ownership',
          'stale_plan',
          'verification',
        ].includes(d.errorCategory)
      ) {
        return complete('ASM migration failed; corrective action required', [
          fields({ Success: false, 'Error category': d.errorCategory }, 'Failure outcome'),
        ]);
      }
      if (tool.name === 'asm_migration_validate' && typeof d.valid === 'boolean') {
        const policy = record(d.policy),
          c = record(d.contract);
        const base = fields({ Valid: d.valid, 'Input type': value(d.inputType) }, 'Validation outcome');
        if (
          d.inputType === 'asm-policy' &&
          typeof policy.sourceName === 'string' &&
          typeof policy.enforcementMode === 'string' &&
          strings(policy.unsupportedEnabledFeatures)
        ) {
          return complete(d.valid ? 'ASM policy valid' : 'ASM policy invalid', [
            base,
            fields(
              {
                Policy: policy.sourceName,
                'Enforcement mode': policy.enforcementMode,
                'Unsupported feature count': policy.unsupportedEnabledFeatures.length,
              },
              'Policy identity',
            ),
            table(
              policy.unsupportedEnabledFeatures.map((feature) => ({ feature })),
              [{ key: 'feature', label: 'Unsupported enabled feature' }],
              'Unsupported features',
            ),
          ]);
        }
        if (
          d.inputType === 'config-pack' &&
          typeof c.valid === 'boolean' &&
          identity(c.contract) &&
          typeof c.resource_count === 'number' &&
          typeof c.validated_resource_count === 'number' &&
          rows(c.issues) &&
          c.issues.every((r) => typeof r.path === 'string' && typeof r.message === 'string')
        ) {
          return complete(d.valid ? 'Config pack valid' : 'Config pack invalid', [
            base,
            fields(
              {
                'Resource count': c.resource_count,
                'Validated resource count': c.validated_resource_count,
                'Issue count': c.issues.length,
                Repository: record(c.contract).repository,
                Commit: record(c.contract).commit,
              },
              'Contract validation',
            ),
            table(
              c.issues,
              [
                { key: 'resource_index', label: 'Resource index' },
                { key: 'kind', label: 'Resource kind' },
                { key: 'path', label: 'Source path' },
                { key: 'message', label: 'Corrective guidance' },
              ],
              'Contract issues',
            ),
          ]);
        }
      }
      if (
        !result.isError &&
        tool.name === 'asm_migration_convert' &&
        typeof d.complete === 'boolean' &&
        isRecord(d.resourceCounts) &&
        Object.values(d.resourceCounts).every((n) => typeof n === 'number' && Number.isFinite(n)) &&
        rows(d.warnings) &&
        d.warnings.every((w) => typeof w.code === 'string' && typeof w.message === 'string') &&
        identity(d.contract) &&
        strings(d.outputFiles) &&
        typeof d.outputDirectory === 'string'
      ) {
        return complete(
          d.complete ? 'Conversion complete; operator review required' : 'Partial conversion; remediation required',
          [
            fields(
              {
                Complete: d.complete,
                'Output directory': d.outputDirectory,
                'Output file count': d.outputFiles.length,
                'Warning count': d.warnings.length,
                Repository: record(d.contract).repository,
                Commit: record(d.contract).commit,
              },
              'Conversion outcome',
            ),
            table(
              Object.entries(d.resourceCounts).map(([kind, count]) => ({ kind, count })),
              [
                { key: 'kind', label: 'Resource kind' },
                { key: 'count', label: 'Count' },
              ],
              'Resource counts',
            ),
            table(
              d.warnings,
              [
                { key: 'code', label: 'Code' },
                { key: 'message', label: 'Corrective guidance' },
                { key: 'source_path', label: 'Source path' },
                { key: 'blocking', label: 'Blocking' },
              ],
              'Warnings',
            ),
            table(
              d.outputFiles.map((path) => ({ path })),
              [{ key: 'path', label: 'Review file' }],
              'Review files',
            ),
          ],
        );
      }
      const rollback = record(d.rollback);
      if (
        !result.isError &&
        tool.name === 'asm_migration_deploy' &&
        typeof d.ok === 'boolean' &&
        typeof d.action === 'string' &&
        typeof d.planDigest === 'string' &&
        outcomes(d.outcomes) &&
        typeof rollback.status === 'string' &&
        outcomes(rollback.outcomes)
      ) {
        return complete(`Deployment ${d.action} ${d.ok ? 'complete' : 'failed'}`, [
          fields(
            {
              Success: d.ok,
              Action: d.action,
              'Plan digest': d.planDigest,
              'Returned outcomes': d.outcomes.length,
              'Rollback status': rollback.status,
              'Rollback outcome count': rollback.outcomes.length,
            },
            'Deployment outcome',
          ),
          outcomeTable(d.outcomes, 'Resource outcomes'),
          outcomeTable(rollback.outcomes, 'Rollback outcomes'),
        ]);
      }
      return fallback();
    },
  });
}
