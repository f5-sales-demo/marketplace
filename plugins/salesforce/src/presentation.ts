import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation';
import { flattenRecord } from './sf/formatters';

type ViewSection = ReturnType<PresentationAPI['data']>[number];
type Result = { content: readonly { type: string; text?: string }[]; details?: unknown; isError?: boolean };
type View = { summary?: string; warnings?: string[]; sections: ViewSection[] };

const labels: Record<string, string> = {
  Id: 'Record ID',
  Name: 'Name',
  'Account.Name': 'Account',
  'Owner.Name': 'Owner',
  Amount: 'Amount',
  CurrencyIsoCode: 'Currency',
  StageName: 'Stage',
  CloseDate: 'Close date',
  CreatedDate: 'Created',
  LastModifiedDate: 'Last modified',
  LastActivityDate: 'Last activity',
  ForecastCategoryName: 'Forecast',
  NextStep: 'Next step',
  IsClosed: 'Closed',
  IsWon: 'Won',
};

function incompleteChildren(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (!Array.isArray(value) && (value as { done?: boolean }).done === false) return true;
  return Object.values(value).some(incompleteChildren);
}

export function presentTool<T extends { name: string; label?: string }>(tool: T, p: PresentationAPI) {
  const commandSections = (args: unknown): ViewSection[] => {
    const argv = (args as { args?: string[] })?.args;
    return Array.isArray(argv) ? [p.command(['sf', ...argv])] : [];
  };
  const sections = (value: unknown, title?: string): ViewSection[] => {
    if (
      Array.isArray(value) &&
      value.length &&
      value.every((row) => row && typeof row === 'object' && !Array.isArray(row))
    ) {
      return [
        p.table(
          value,
          [...new Set(value.flatMap((row) => Object.keys(row)))].map((key) => ({
            key,
            label: labels[key] ?? key,
            ...(['Amount', 'amount', 'platform', 'shape', 'other', 'quotaTotal'].includes(key)
              ? { align: 'right' as const, numberFormat: { minimumFractionDigits: 2, maximumFractionDigits: 8 } }
              : {}),
          })),
          title,
        ) as ViewSection,
      ];
    }
    return p.data(value, title) as ViewSection[];
  };
  return p.withPresentation(tool, {
    call: (args: unknown) => {
      const params = args as { args?: string[] };
      return {
        summary: tool.label ?? tool.name,
        sections: tool.name === 'sf_exec' && Array.isArray(params?.args) ? commandSections(args) : sections(args),
      };
    },
    result: (result: Result, options: { expanded: boolean; isPartial: boolean }, args: unknown): View => {
      const command = tool.name === 'sf_exec' ? commandSections(args) : [];
      if (result.isError)
        return {
          sections: [
            ...result.content
              .filter((block) => block.type === 'text')
              .map((block) => ({ kind: 'markdown' as const, text: block.text ?? '' })),
            ...command,
          ],
        };
      const details = result.details as Record<string, unknown> | undefined;
      if (details?.queryResult) {
        const query = details.queryResult as { records: Record<string, unknown>[]; totalSize: number; done: boolean };
        const records = query.records.map(flattenRecord);
        const aggregate =
          records.length === 1 &&
          ((query.records[0]?.attributes as { type?: string } | undefined)?.type === 'AggregateResult' ||
            (!('Id' in records[0]!) &&
              !('Name' in records[0]!) &&
              Object.values(records[0]!).every((value) => value === null || typeof value !== 'object')))
            ? Object.entries(records[0] ?? {})
                .filter(([, value]) => value === null || typeof value !== 'object')
                .map(([key, value]) => `${key} = ${String(value)}`)
                .join(', ')
            : '';
        return {
          summary:
            aggregate ||
            `${records.length} records returned${query.totalSize !== records.length ? ` (${query.totalSize} reported)` : ''}`,
          warnings: [
            ...(!query.done ? ['Results are incomplete. Counts and conclusions apply only to returned records.'] : []),
            ...(incompleteChildren(query.records)
              ? ['Related records are incomplete; inspect the child-query scope before drawing conclusions.']
              : []),
          ],
          sections: [
            {
              kind: 'fields' as const,
              title: 'Query scope',
              values: {
                scope: details.queryDescription ?? 'Ad hoc query',
                org: (args as { target_org?: string })?.target_org ?? 'CLI default org',
                returned: records.length,
                totalSize: query.totalSize,
                done: query.done,
                query: (args as { query?: string })?.query,
              },
            },
            ...sections(records, String(details.queryDescription ?? 'Query results')),
          ],
        };
      }
      if (details?.pipelineReport) {
        const report = details.pipelineReport as Record<string, unknown>;
        const { sourceQueries, ...summaries } = report;
        if (Array.isArray(report.currencyBreakdown) && report.currencyBreakdown.length > 1) {
          return {
            summary: `Pipeline report · ${report.currencyBreakdown.map((group: { currency: string }) => group.currency).join(' / ')} · separate totals`,
            warnings: [
              'Currencies remain separate. Combined monetary totals are not valid.',
              ...(Array.isArray(report.unavailable) ? report.unavailable.map(String) : []),
              ...(Array.isArray(report.anomalies)
                ? report.anomalies.map((anomaly: { message: string }) => anomaly.message)
                : []),
            ],
            sections: [
              ...(report.fyBookedTotal !== undefined
                ? [
                    {
                      kind: 'fields' as const,
                      title: 'FY aggregate bookings',
                      values: { reportedAmount: report.fyBookedTotal, currency: 'unverified' },
                    },
                  ]
                : []),
              ...report.currencyBreakdown.flatMap((group: { currency: string }) => [
                { kind: 'fields' as const, title: `${group.currency} figures`, values: { currency: group.currency } },
                ...(presentTool({ name: 'sf_pipeline_report' }, p).presentation.result(
                  {
                    content: [],
                    details: {
                      pipelineReport: {
                        ...report,
                        ...group,
                        sourceQueries: undefined,
                        currencyBreakdown: undefined,
                        fyBookedTotal: undefined,
                        anomalies: [],
                        unavailable: [],
                      },
                    },
                  },
                  options,
                  args,
                ).sections ?? []),
              ]),
            ],
          };
        }
        return {
          summary: `Pipeline report · ${String((report.netNew as { quotaTotal?: number } | undefined)?.quotaTotal ?? 'unavailable')} net new · ${String((report.booked as { quotaTotal?: number } | undefined)?.quotaTotal ?? 'unavailable')} booked · ${String((report.renewals as { quotaTotal?: number } | undefined)?.quotaTotal ?? 'unavailable')} renewals`,
          warnings: [
            ...(report.fyBookedTotal !== undefined
              ? ['FY aggregate booking currency is independently unverified.']
              : []),
            ...(Array.isArray(report.unavailable) ? report.unavailable.map(String) : []),
            ...(Array.isArray(report.anomalies)
              ? report.anomalies.map((anomaly: { message: string }) => anomaly.message)
              : []),
          ],
          sections: [
            {
              kind: 'table' as const,
              title: 'Pipeline summary (reported amounts)',
              columns: ['section', 'platform', 'shape', 'other', 'quotaTotal'].map((key) => ({ key })),
              rows: ['netNew', 'booked', 'renewals'].map((key) => {
                const section = report[key] as { totals?: Record<string, number>; quotaTotal?: number } | undefined;
                return {
                  section: { netNew: 'Net new', booked: 'Booked', renewals: 'Renewals' }[key] ?? key,
                  ...section?.totals,
                  quotaTotal: section?.quotaTotal,
                };
              }),
            },
            ...(options.expanded
              ? sections(summaries)
              : [
                  {
                    kind: 'fields' as const,
                    title: 'Report scope',
                    values: {
                      generated: report.generated,
                      quarter: report.quarter,
                      openScopeStart: report.openScopeStart,
                      currency: report.currency ?? 'unverified',
                      scope: 'OpportunityTeamMember membership',
                      teamMembers: report.teamMembers,
                      territories: report.territories,
                      lineItemCount: report.lineItemCount,
                      ...(report.fyBookedTotal !== undefined ? { fyBookedTotal: report.fyBookedTotal } : {}),
                    },
                  },
                  ...sections(report.forecast, 'Forecast'),
                  ...sections((report.netNew as { accounts?: unknown } | undefined)?.accounts, 'Net new by account'),
                  ...sections((report.booked as { accounts?: unknown } | undefined)?.accounts, 'Booked by account'),
                  ...sections((report.renewals as { accounts?: unknown } | undefined)?.accounts, 'Renewals by account'),
                  ...sections(report.topDeals, 'Top deals'),
                  ...sections(report.topRenewals, 'Top renewals'),
                ]),
            ...(options.expanded && Array.isArray(sourceQueries)
              ? sourceQueries.flatMap(
                  (source: { query: string; records: Record<string, unknown>[] }, index: number) => [
                    { kind: 'code' as const, title: `Source query ${index + 1}`, text: source.query },
                    ...sections(source.records.map(flattenRecord), 'Complete source records'),
                  ],
                )
              : []),
          ],
        };
      }
      if (details?.orgs) return { summary: 'Salesforce org', sections: sections(details.orgs) };
      if (details?.described) {
        const described = details.described as {
          name: string;
          fields: { name: string; label: string; custom: boolean }[];
          childRelationships: { childSObject: string; relationshipName?: string }[];
        };
        const match = String((args as { match?: string })?.match ?? '')
          .trim()
          .toLowerCase();
        const fields = described.fields.filter((field) =>
          match
            ? field.name.toLowerCase().includes(match) || field.label.toLowerCase().includes(match)
            : options.expanded || !field.custom,
        );
        const relationships = match
          ? described.childRelationships.filter(
              (rel) =>
                rel.childSObject.toLowerCase().includes(match) ||
                (rel.relationshipName ?? '').toLowerCase().includes(match),
            )
          : options.expanded
            ? described.childRelationships
            : [];
        return {
          summary: `${described.name}: ${fields.length} matching fields (${described.fields.length} total)`,
          warnings: !match
            ? ['Custom fields and child relationships are available in expanded details; pass match to select them.']
            : [],
          sections: [
            {
              kind: 'table' as const,
              title: 'Fields',
              columns: ['name', 'label', 'type', 'notes'].map((key) => ({
                key,
                label: { name: 'Field', label: 'Label', type: 'Type', notes: 'Notes' }[key],
              })),
              rows: fields.map((field) => {
                const data = field as unknown as Record<string, unknown>;
                return {
                  name: field.name,
                  label: field.label,
                  type: data.type,
                  notes: Object.entries(data)
                    .filter(([key]) => !['name', 'label', 'type'].includes(key))
                    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
                    .join('\n'),
                };
              }),
            },
            ...sections(relationships, 'Child relationships'),
          ],
        };
      }
      if (tool.name === 'sf_exec') {
        const argv = (args as { args?: string[] })?.args ?? [];
        for (const block of result.content) {
          if (block.type !== 'text') continue;
          let envelope: { result?: { records?: Record<string, unknown>[] }; warnings?: string[] };
          try {
            envelope = JSON.parse(block.text ?? '');
          } catch {
            continue;
          }
          if (!Array.isArray(envelope?.result?.records)) continue;
          const valueAfter = (flag: string) =>
            argv.includes(flag)
              ? argv[argv.indexOf(flag) + 1]
              : argv.find((arg) => arg.startsWith(`${flag}=`))?.slice(flag.length + 1);
          const view = presentTool({ name: 'sf_query' }, p).presentation.result(
            { content: [], details: { queryResult: envelope.result, queryDescription: 'CLI query' } },
            options,
            { query: valueAfter('--query'), target_org: valueAfter('--target-org') ?? valueAfter('-o') },
          );
          return {
            ...view,
            warnings: [...(view.warnings ?? []), ...(envelope.warnings ?? [])],
            sections: [
              ...command,
              ...(view.sections ?? []),
              ...result.content
                .filter((other) => other !== block && other.type === 'text')
                .map((other) => ({ kind: 'markdown' as const, text: other.text ?? '' })),
            ],
          };
        }
      }
      return {
        summary: result.content
          .filter((block) => block.type === 'text')
          .map((block) => {
            try {
              const data = JSON.parse(block.text ?? '');
              const record = data?.result?.records?.[0];
              return data?.result?.records?.length === 1 && record?.attributes?.type === 'AggregateResult'
                ? Object.entries(record)
                    .filter(([key]) => key !== 'attributes')
                    .map(([key, value]) => `${key} = ${String(value)}`)
                    .join(', ')
                : '';
            } catch {
              return '';
            }
          })
          .filter(Boolean)
          .join(', '),
        sections: [
          ...command,
          ...result.content
            .filter((block) => block.type === 'text')
            .flatMap((block) => {
              try {
                return sections(JSON.parse(block.text ?? ''));
              } catch {
                return [{ kind: 'markdown' as const, text: block.text ?? '(no output)' }];
              }
            }),
        ],
      };
    },
  });
}
