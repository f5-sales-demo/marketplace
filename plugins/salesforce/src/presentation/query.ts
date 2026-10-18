import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation';
import { deriveQueryLabel, flattenRecord } from '../sf/formatters';
import type { Args, Options, Result, View } from './shared';
import {
  code,
  context,
  evidence,
  fields,
  formatSoql,
  incomplete,
  label,
  record,
  rows,
  table,
  tokens,
  value,
} from './shared';

function metrics(query: string): Record<string, string> {
  const parts = tokens(query);
  if (!parts) return {};
  const mapping: Record<string, string> = {};
  let expression: string[] = [],
    depth = 0,
    index = 0;
  const add = () => {
    const text = expression.join(' ');
    const match = /^(COUNT|COUNT_DISTINCT|SUM|AVG|MIN|MAX)\s*\(\s*([^()]+)?\s*\)\s*(\w+)?$/i.exec(text);
    if (match) {
      const field = match[2]?.trim() ?? '';
      mapping[match[3] ?? `expr${index++}`] = /^COUNT/i.test(match[1])
        ? `${field === 'Id' || !field ? (parts[parts.findIndex((t) => t.toUpperCase() === 'FROM') + 1] ?? 'Record') : label(field)} count`
        : `${({ SUM: 'Reported', AVG: 'Average', MIN: 'Minimum', MAX: 'Maximum' } as Record<string, string>)[match[1].toUpperCase()]} ${label(field).toLowerCase()}`;
    }
    expression = [];
  };
  for (const part of parts.slice(1)) {
    if (depth === 0 && part.toUpperCase() === 'FROM') {
      add();
      break;
    }
    if (depth === 0 && part === ',') {
      add();
      continue;
    }
    expression.push(part);
    if (part === '(') depth++;
    if (part === ')') depth--;
  }
  return mapping;
}
export function queryView(
  p: PresentationAPI,
  result: Result,
  options: Options,
  args: Args,
  operation = 'sf data query',
): View {
  const details = record(result.details),
    query = record(details.queryResult),
    raw = rows(query.records);
  const soql = typeof args.query === 'string' ? args.query : '';
  if (!Array.isArray(query.records) || raw.length !== query.records.length)
    return {
      summary: 'Query result unavailable',
      warnings: ['Malformed query payload. No record count or completeness is verified.'],
      sections: [...context(operation, args), ...evidence(p, result, args)],
    };
  let records = raw.map(flattenRecord);
  const metricLabels = metrics(soql);
  records = records.map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, val]) => [key, key in metricLabels ? value(val, true) : val])),
  );
  const aggregate =
    raw.length > 0 &&
    (raw.every((row) => record(row.attributes).type === 'AggregateResult') || Object.keys(metricLabels).length > 0);
  const purpose = String(
    args.description ?? details.queryDescription ?? (soql ? deriveQueryLabel(soql) : 'Query results'),
  );
  const keys = [...new Set(records.flatMap((row) => Object.keys(row)))];
  const usefulId =
    records.length > 0 &&
    records.every((row) =>
      keys.some(
        (key) =>
          /(^|\.)(Name|Subject)$/.test(key) && typeof row[key] === 'string' && (row[key] as string).trim().length > 0,
      ),
    );
  const omitted =
    options.expanded || !usefulId
      ? []
      : keys.filter((key) => /(^|\.)(Id|\w+Id)$/.test(key) || key.includes('.records'));
  const priorities = [
    'Name',
    'Subject',
    'Account.Name',
    'Who.Name',
    'What.Name',
    'Owner.Name',
    'Status',
    'StageName',
    'Amount',
    'CurrencyIsoCode',
    'ActivityDate',
    'StartDateTime',
    'EndDateTime',
    'CloseDate',
  ];
  const visible = options.expanded
    ? keys
    : [...priorities.filter((key) => keys.includes(key)), ...keys.filter((key) => !priorities.includes(key))].filter(
        (key) => !omitted.includes(key),
      );
  const warnings = [
    ...(query.done !== true
      ? [query.done === false ? 'Partial results · returned records only' : 'Completeness unknown']
      : []),
    ...(query.totalSize !== undefined && query.totalSize !== raw.length
      ? [`${value(query.totalSize)} records reported; ${value(raw.length)} returned.`]
      : []),
    ...(incomplete(raw) ? ['Partial related records'] : []),
    ...(aggregate && Object.values(metricLabels).some((l) => /amount/.test(l)) && !keys.includes('CurrencyIsoCode')
      ? ['Currency unknown']
      : []),
    ...(options.isPartial ? ['Provisional results'] : []),
  ];
  const metricRows =
    records.length === 1 && aggregate
      ? Object.entries(records[0]).map(([key, val]) => ({
          Metric: metricLabels[key] ?? label(key),
          Value: value(val, true),
        }))
      : undefined;
  return {
    summary: `${purpose} · ${value(raw.length)} ${aggregate ? 'aggregate rows' : 'records'} returned`,
    states: warnings.map((text) => ({
      kind:
        text === 'Provisional results'
          ? 'running'
          : text === 'Completeness unknown' || text === 'Currency unknown'
            ? 'info'
            : 'warning',
      text,
    })),
    sections: [
      ...context(operation, args),
      ...(soql
        ? [code(formatSoql(soql), operation === 'sf data search' ? 'SOSL' : 'SOQL')]
        : [fields({ Query: 'Not returned' })]),
      ...(metricRows ? [table(p, metricRows, undefined)] : [table(p, records, undefined, visible, metricLabels)]),
      ...(options.expanded
        ? [
            fields(
              {
                Returned: raw.length,
                'Reported total': query.totalSize,
                Complete: query.done,
                'Next page': record(details.queryEvidence).nextRecordsUrl ?? query.nextRecordsUrl ?? 'Not returned',
              },
              'Pagination',
            ),
            ...evidence(p, result, args),
          ]
        : []),
    ],
  };
}
