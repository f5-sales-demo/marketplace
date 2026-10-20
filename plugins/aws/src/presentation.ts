import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation';
import { ceSummary } from './presentation/ce';
import { toolArgv } from './presentation/command';

type Section = ReturnType<PresentationAPI['data']>[number];
type Result = { content: readonly { type: string; text?: string }[]; details?: unknown; isError?: boolean };
type Options = { expanded: boolean; isPartial: boolean };
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const texts = (result: Result) => result.content.filter((b) => b.type === 'text').map((b) => b.text ?? '');
const literal = (text: string, title: string): Section => ({ kind: 'code', title, text });
const fields = (values: Record<string, unknown>, title: string): Section => ({
  kind: 'fields',
  title,
  values,
  previewFields: 'all',
});
const rows = (value: unknown): value is Record<string, unknown>[] =>
  Array.isArray(value) && value.every((v) => v !== null && typeof v === 'object' && !Array.isArray(v));
const columns = {
  instances: [
    { key: 'instanceId', label: 'Instance ID' },
    { key: 'name', label: 'Name' },
    { key: 'state', label: 'State' },
    { key: 'type', label: 'Instance type' },
    { key: 'az', label: 'Availability zone' },
    { key: 'privateIp', label: 'Private IP' },
    { key: 'publicIp', label: 'Public IP' },
  ],
  buckets: [
    { key: 'name', label: 'Bucket' },
    { key: 'creationDate', label: 'Creation date' },
  ],
  objects: [
    { key: 'key', label: 'Object key' },
    { key: 'size', label: 'Size (bytes)', align: 'right' as const },
    { key: 'lastModified', label: 'Last modified' },
  ],
};

/** Domain data only; xcsh owns commands, previews, layout, theme and lifecycle. */
export function presentTool<T extends { name: string; label?: string }>(tool: T, p: PresentationAPI) {
  const scope = (args: Record<string, unknown>) =>
    fields(
      {
        Profile: typeof args.profile === 'string' && !/^ *$/.test(args.profile) ? args.profile : 'Existing CLI context',
        Region: args.region ?? 'Existing CLI context',
        ...(args.target !== undefined ? { Target: args.target } : {}),
        ...(args.instanceIds !== undefined ? { 'Instance IDs': args.instanceIds } : {}),
        ...(args.filters !== undefined ? { Filters: args.filters } : {}),
        Coverage: 'Account and region coverage are limited to the selected CLI context.',
      },
      'Scope',
    );
  return p.withPresentation(tool, {
    call: (input: unknown, options: Options) => {
      const args = record(input);
      const argv = toolArgv(tool.name, args);
      // Do not expose cloud-init source or bootstrap material in call presentation.
      const safeArgs = Object.fromEntries(
        Object.entries(args).filter(([key]) => !['source', 'bootstrapRef', 'bootstrapRefs'].includes(key)),
      );
      return { sections: options.expanded ? p.data(safeArgs) : [...(argv ? [p.command(argv)] : []), scope(safeArgs)] };
    },
    result: (result: Result, options: Options, input: unknown) => {
      const args = record(input);
      const details = record(result.details);
      const argv = toolArgv(tool.name, args);
      const prefix: Section[] = [...(argv ? [p.command(argv)] : []), scope(args)];
      if (result.isError)
        return {
          summary: 'AWS operation failed',
          sections: [...prefix, ...texts(result).map((t) => literal(t, 'Complete corrective guidance'))],
          // Runtime retains automatic evidence/completeness for unknown errors.
        };
      if (tool.name === 'aws_sts_whoami' && Object.keys(record(details.identity)).length) {
        const { identity, ...metadata } = details;
        return {
          expandedEvidence: 'provided' as const,
          sections: [
            ...prefix,
            fields(record(identity), 'Caller identity'),
            ...(options.expanded ? p.data(metadata, 'Metadata') : []),
          ],
        };
      }
      const collection =
        tool.name === 'aws_ec2_describe_instances'
          ? 'instances'
          : tool.name === 'aws_s3_ls'
            ? args.target
              ? 'objects'
              : 'buckets'
            : undefined;
      if (collection && rows(details[collection])) {
        const data = details[collection];
        const declared = columns[collection];
        const known = new Set(declared.map((c) => c.key));
        const extra = [...new Set(data.flatMap((row) => Object.keys(row)))].filter((key) => !known.has(key));
        const section = {
          ...p.table(data, [...declared, ...extra.map((key) => ({ key, label: key }))], collection),
          previewRows: 12,
        };
        const { [collection]: _data, ...metadata } = details;
        return {
          expandedEvidence: 'provided' as const,
          sections: [
            ...prefix,
            fields({ 'Returned rows': data.length }, 'Results'),
            section,
            ...(options.expanded ? p.data(metadata, 'Metadata') : []),
          ],
        };
      }
      if (tool.name === 'aws_help' && /^(?:USAGE|DESCRIPTION|OPTIONS|AWS)/m.test(texts(result).join('\n'))) {
        return {
          expandedEvidence: 'provided' as const,
          sections: [...prefix, ...texts(result).map((t) => literal(t, 'Complete AWS CLI help'))],
        };
      }
      if (tool.name === 'aws_exec' && typeof details.fullOutput === 'string') {
        try {
          const decoded: unknown = JSON.parse(details.fullOutput);
          return {
            expandedEvidence: 'provided' as const,
            sections: [...prefix, ...p.data(decoded, 'CLI result')],
            warnings: details.modelPreviewTruncated
              ? ['Model preview was truncated; this view includes the complete CLI result.']
              : [],
          };
        } catch {
          /* Opaque output retains runtime fallback and full literal output. */
        }
        return { sections: [...prefix, literal(details.fullOutput, 'Complete CLI output')] };
      }
      // Multi-command CE tools preserve their domain-authored summary and safe evidence.
      const ce = ceSummary(tool.name, details);
      if (ce)
        return {
          expandedEvidence: 'provided' as const,
          sections: [
            ...prefix,
            ...ce,
            ...texts(result).map((t) => literal(t, 'AWS Customer Edge summary')),
            ...(options.expanded ? p.data(details, 'Domain evidence') : []),
          ],
        };
      return { sections: [...prefix, ...texts(result).map((t) => literal(t, 'CLI evidence'))] };
    },
  });
}
