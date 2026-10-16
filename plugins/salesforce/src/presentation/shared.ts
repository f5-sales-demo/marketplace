import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation';

export type Section = ReturnType<PresentationAPI['data']>[number];
export type Result = { content: readonly { type: string; text?: string }[]; details?: unknown; isError?: boolean };
export type Options = { expanded: boolean; isPartial: boolean };
export type View = { summary?: string; warnings?: string[]; sections: Section[] };
export type Args = Record<string, unknown>;
export const record = (value: unknown): Args =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Args) : {};
export const rows = (value: unknown): Args[] =>
  Array.isArray(value) ? value.filter((v) => v && typeof v === 'object' && !Array.isArray(v)) : [];
export const texts = (result: Result) => result.content.filter((b) => b.type === 'text').map((b) => b.text ?? '');
export const code = (text: string, title?: string): Section => ({ kind: 'code', text, title });
export const fields = (values: Args, title?: string): Section => ({ kind: 'fields', values, title });
export const hint = (text: string): Section => ({ kind: 'markdown', text });

const labelPairs = [
  ['Id', 'Record ID'],
  ['Name', 'Name'],
  ['Subject', 'Subject'],
  ['Account.Name', 'Account'],
  ['Owner.Name', 'Owner'],
  ['Who.Name', 'Related person'],
  ['What.Name', 'Related record'],
  ['Status', 'Status'],
  ['StageName', 'Stage'],
  ['Amount', 'Amount'],
  ['CurrencyIsoCode', 'Currency'],
  ['ActivityDate', 'Due date'],
  ['StartDateTime', 'Start'],
  ['EndDateTime', 'End'],
  ['CloseDate', 'Close date'],
  ['CreatedDate', 'Created'],
  ['LastModifiedDate', 'Last modified'],
  ['LastActivityDate', 'Last activity'],
  ['ForecastCategoryName', 'Forecast'],
  ['NextStep', 'Next step'],
  ['IsClosed', 'Closed'],
  ['IsWon', 'Won'],
  ['accountName', 'Account'],
  ['ownerName', 'Owner'],
  ['oppCount', 'Opportunity count'],
  ['quotaTotal', 'Quota total'],
  ['platform', 'Platform'],
  ['shape', 'Shape'],
  ['other', 'Other'],
  ['bestCase', 'Best case'],
] as const;
export const label = (key: string): string =>
  labelPairs.find(([field]) => field === key)?.[1] ??
  key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());

// Group decimal digits without rounding, coercing numeric strings, or adding a currency.
export function value(value: unknown, numeric = false): unknown {
  if (value === undefined) return 'Not returned';
  if (typeof value !== 'number' && !(numeric && typeof value === 'string')) return value;
  const text = String(value);
  const match = /^(-?)(\d+)(\.\d+)?([eE][+-]?\d+)?$/.exec(text);
  if (!match) return value;
  return `${match[1]}${match[2].replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${match[3] ?? ''}${match[4] ?? ''}`;
}
export function table(
  p: PresentationAPI,
  data: Args[],
  title: string,
  keys?: string[],
  labels?: Record<string, string>,
): Section {
  const columns = keys ?? [...new Set(data.flatMap((row) => Object.keys(row)))];
  return p.table(
    data.map((row) =>
      Object.fromEntries(
        columns.map((key) => [
          key,
          value(
            row[key],
            /amount|total|count|remaining|^max$|platform|shape|other|commit|bestCase|pipeline/i.test(key),
          ),
        ]),
      ),
    ),
    columns.map((key) => ({
      key,
      label: labels?.[key] ?? label(key),
      ...(data.some((row) => typeof row[key] === 'number') ? { align: 'right' as const } : {}),
    })),
    title,
  );
}
export function data(p: PresentationAPI, input: unknown, title: string): Section[] {
  if (Array.isArray(input) && input.every((v) => v && typeof v === 'object' && !Array.isArray(v)))
    return [table(p, rows(input), title)];
  return p.data(input, title);
}
export function flag(argv: string[], ...names: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    for (const name of names) {
      if (argv[i] === name) return argv[i + 1];
      if (argv[i].startsWith(`${name}=`)) return argv[i].slice(name.length + 1);
      if (/^-[A-Za-z]$/.test(name) && argv[i].startsWith(name) && !argv[i].startsWith('--') && argv[i].length > 2)
        return argv[i].slice(2);
    }
  }
  return undefined;
}
export function context(operation: string, args: Args): Section[] {
  return [
    fields({
      Command: operation,
      Org: args.target_org ?? 'CLI default org (identity not returned)',
      ...(args.use_tooling_api ? { API: 'Tooling' } : {}),
      ...(args.all_rows ? { Records: 'Includes deleted records' } : {}),
      ...(args.options && Object.keys(record(args.options)).length ? { Options: args.options } : {}),
    }),
  ];
}
export function incomplete(input: unknown): boolean {
  if (!input || typeof input !== 'object') return false;
  const r = record(input);
  return (
    r.done === false ||
    r.hasMore === true ||
    r.partial === true ||
    r.truncated === true ||
    Object.values(input).some(incomplete)
  );
}

// Lex literals and punctuation before changing whitespace. Uncertain syntax stays literal.
export function tokens(query: string): string[] | undefined {
  const parts: string[] = [];
  let i = 0,
    depth = 0;
  while (i < query.length) {
    if (/\s/.test(query[i])) {
      i++;
      continue;
    }
    if (query.startsWith('/*', i) || query.startsWith('--', i) || query.startsWith('//', i)) return undefined;
    const start = i;
    if (query[i] === "'" || query[i] === '"') {
      const quote = query[i++];
      let closed = false;
      while (i < query.length) {
        if (query[i] === '\\') {
          i += 2;
          continue;
        }
        if (query[i++] === quote) {
          closed = true;
          break;
        }
      }
      if (!closed || i > query.length) return undefined;
    } else if (/[(),]/.test(query[i])) {
      if (query[i] === '(') depth++;
      if (query[i] === ')' && --depth < 0) return undefined;
      i++;
    } else {
      while (i < query.length && !/[\s(),'"]/.test(query[i])) i++;
    }
    parts.push(query.slice(start, i));
  }
  return depth === 0 ? parts : undefined;
}
export function formatSoql(query: string): string {
  const parts = tokens(query);
  if (!parts || parts[0]?.toUpperCase() !== 'SELECT') return query;
  let depth = 0,
    output = '';
  parts.forEach((part, index) => {
    if (part === ')') depth--;
    const clause =
      /^(SELECT|FROM|WHERE|HAVING|LIMIT|OFFSET)$/.test(part.toUpperCase()) ||
      (/^(GROUP|ORDER)$/.test(part.toUpperCase()) && parts[index + 1]?.toUpperCase() === 'BY');
    const separator =
      !index || part === ',' || part === ')' || parts[index - 1] === '('
        ? ''
        : clause
          ? `\n${'  '.repeat(depth)}`
          : part === '(' &&
              /^(COUNT|SUM|AVG|MIN|MAX|COUNT_DISTINCT|CALENDAR_\w+|DAY_\w+|FISCAL_\w+|convertCurrency|toLabel)$/i.test(
                parts[index - 1],
              )
            ? ''
            : ' ';
    output += separator + part;
    if (part === '(') depth++;
  });
  return output;
}
export function evidence(p: PresentationAPI, result: Result, args: Args, argv?: string[]): Section[] {
  return [
    ...(argv
      ? [p.command(['sf', ...argv], 'Exact command'), ...p.data(argv, 'Exact argv')]
      : p.data(args, 'Exact arguments')),
    ...texts(result).map((text) => code(text, 'Complete CLI output')),
    ...(result.details === undefined ? [] : p.data(result.details, 'Complete evidence')),
  ];
}
