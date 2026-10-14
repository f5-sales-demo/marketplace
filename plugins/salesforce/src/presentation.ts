type ViewSection =
  | { kind: 'fields'; title?: string; values: Record<string, unknown> }
  | { kind: 'table'; title?: string; columns: { key: string; label?: string }[]; rows: Record<string, unknown>[] }
  | { kind: 'markdown'; text: string }
  | { kind: 'code'; text: string };
type Result = { content: readonly { type: string; text?: string }[]; details?: unknown; isError?: boolean };

/** Domain data only: xcsh owns terminal layout, preview policy and the active theme. */
function sections(value: unknown, title?: string): ViewSection[] {
  if (
    Array.isArray(value) &&
    value.length &&
    value.every((row) => row && typeof row === 'object' && !Array.isArray(row))
  ) {
    return [
      {
        kind: 'table',
        title,
        columns: [...new Set(value.flatMap((row) => Object.keys(row)))].map((key) => ({ key })),
        rows: value,
      },
    ];
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const values: Record<string, unknown> = {};
    const nested: ViewSection[] = [];
    for (const [key, child] of Object.entries(value)) {
      if (child && typeof child === 'object') nested.push(...sections(child, title ? `${title}.${key}` : key));
      else values[key] = child;
    }
    return [...(Object.keys(values).length ? [{ kind: 'fields' as const, title, values }] : []), ...nested];
  }
  return [{ kind: 'fields', title, values: { value } }];
}

export function presentTool<T extends { name: string; label?: string }>(tool: T) {
  return {
    ...tool,
    presentation: {
      call: (args: unknown) => {
        const params = args as { args?: string[] };
        return {
          summary: tool.label ?? tool.name,
          sections:
            tool.name === 'sf_exec' && Array.isArray(params?.args)
              ? [
                  {
                    kind: 'code' as const,
                    text: ['sf', ...params.args]
                      .map((arg) => (/^[A-Za-z0-9_@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", "'\\''")}'`))
                      .join(' '),
                  },
                ]
              : sections(args),
        };
      },
      result: (result: Result, _options: { expanded: boolean }, args: unknown) => {
        if (result.isError)
          return {
            sections: result.content
              .filter((block) => block.type === 'text')
              .map((block) => ({ kind: 'markdown' as const, text: block.text ?? '' })),
          };
        const details = result.details as Record<string, unknown> | undefined;
        if (details?.queryResult) {
          const query = details.queryResult as { records: Record<string, unknown>[]; totalSize: number; done: boolean };
          const records = query.records.map(({ attributes: _attributes, ...record }) => record);
          const aggregate =
            records.length === 1
              ? Object.entries(records[0] ?? {})
                  .filter(([, value]) => value === null || typeof value !== 'object')
                  .map(([key, value]) => `${key} = ${String(value)}`)
                  .join(', ')
              : '';
          return {
            summary: aggregate || `${query.totalSize} rows`,
            warnings: query.done ? [] : ['Results are incomplete. Use sf data export bulk for the full dataset.'],
            sections: [
              { kind: 'fields' as const, values: { totalSize: query.totalSize, done: query.done } },
              ...sections(records, String(details.queryDescription ?? 'Query results')),
            ],
          };
        }
        if (details?.pipelineReport) {
          const report = details.pipelineReport as Record<string, unknown>;
          return {
            summary: 'Pipeline report',
            warnings: [
              ...(Array.isArray(report.unavailable) ? report.unavailable.map(String) : []),
              ...(Array.isArray(report.anomalies)
                ? report.anomalies.map((anomaly: { message: string }) => anomaly.message)
                : []),
            ],
            sections: [
              {
                kind: 'table' as const,
                title: 'Pipeline summary ($)',
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
              ...sections(report),
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
              : !field.custom,
          );
          const relationships = match
            ? described.childRelationships.filter(
                (rel) =>
                  rel.childSObject.toLowerCase().includes(match) ||
                  (rel.relationshipName ?? '').toLowerCase().includes(match),
              )
            : [];
          return {
            summary: `${described.name}: ${fields.length} matching fields (${described.fields.length} total)`,
            warnings: !match
              ? ['Custom fields and child relationships are available in expanded details; pass match to select them.']
              : [],
            sections: sections({ fields, childRelationships: relationships }),
          };
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
          sections: result.content
            .filter((block) => block.type === 'text')
            .flatMap((block) => {
              try {
                return sections(JSON.parse(block.text ?? ''));
              } catch {
                return [{ kind: 'markdown' as const, text: block.text ?? '(no output)' }];
              }
            }),
        };
      },
    },
  };
}
