import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation';
import { normalizeArgs } from '../tools/sf-exec-guard';
import { describeView } from './describe';
import { helpView } from './help';
import { orgView } from './org';
import { queryView } from './query';
import type { Args, Options, Result, View } from './shared';
import { code, context, data, evidence, flag, record, rows, table, texts } from './shared';

// Presentation inventory mirrors every allowlisted command family; it does not authorize execution.
export const commandFamilies = [
  'data query',
  'data search',
  'data export',
  'data resume',
  'org list',
  'org display',
  'apex list',
  'apex get',
  'apex tail',
  'sobject describe',
  'sobject list',
  'schema sobject list',
  'schema sobject describe',
  'limits api display',
  'api request',
  'version',
  'help',
  'commands',
  'which',
  'info',
] as const;
export function commandContext(args: Args) {
  const argv = Array.isArray(args.args) ? args.args.filter((a): a is string => typeof a === 'string') : [];
  const path = normalizeArgs(argv).join(' ');
  const family = commandFamilies.find((f) => path === f || path.startsWith(`${f} `));
  const operation = `sf ${path || '(command unavailable)'}`;
  const options: Record<string, unknown> = Object.fromEntries(
    ['--result-format', '--wait', '--api-version', '--job-id', '--log-id', '--output-dir', '--sobject'].flatMap(
      (key) => {
        const val = flag(argv, key);
        return val === undefined ? [] : [[key.slice(2), val]];
      },
    ),
  );
  for (const key of ['--bulk', '--async']) if (argv.includes(key)) options[key.slice(2)] = true;
  return {
    argv,
    family,
    operation,
    params: {
      query: flag(argv, '--query', '-q'),
      target_org: flag(argv, '--target-org', '-o'),
      use_tooling_api: argv.includes('--use-tooling-api') || argv.includes('-t'),
      all_rows: argv.includes('--all-rows'),
      sobject: flag(argv, '--sobject', '-s'),
      options,
    },
  };
}
export function execView(p: PresentationAPI, result: Result, options: Options, args: Args): View {
  const { argv, family, operation, params } = commandContext(args);
  const blocks = texts(result),
    warnings = blocks.filter((t) => t.startsWith('CLI warnings:\n')).map((t) => t.slice(14));
  let envelope: Args = {},
    decoded: unknown,
    parsed = false;
  try {
    decoded = JSON.parse(blocks[0] ?? '');
    envelope = record(decoded);
    parsed = true;
  } catch {
    /* Literal output. */
  }
  const payload = envelope.result;
  warnings.push(...(Array.isArray(envelope.warnings) ? envelope.warnings.map(String) : []));
  let view: View;
  if (result.isError || (typeof envelope.status === 'number' && envelope.status !== 0))
    view = {
      summary: 'Salesforce CLI failed',
      warnings: [...warnings, String(envelope.message ?? 'Inspect complete CLI diagnostics.')],
      sections: [...context(operation, params), ...blocks.map((t) => code(t, 'CLI diagnostics'))],
    };
  else if (argv.includes('--help') || family === 'help') {
    view = helpView(p, result, options, { command_path: operation.slice(3) });
    view.warnings = [...(view.warnings ?? []), ...warnings];
  } else if ((family === 'data query' || family === 'data search') && payload !== undefined) {
    const query = family === 'data search' && Array.isArray(payload) ? { records: payload } : payload;
    view = queryView(p, { content: [], details: { queryResult: query } }, options, params, operation);
    view.warnings = [...(view.warnings ?? []), ...warnings];
  } else if (family === 'org display') {
    view = orgView(p, { content: [], details: { orgEvidence: payload } }, options, params, operation);
    view.warnings = [...(view.warnings ?? []), ...warnings];
  } else if (family?.endsWith('sobject describe')) {
    view = describeView(
      p,
      { content: [], details: { described: payload, describeEvidence: payload } },
      options,
      params,
      operation,
    );
    view.warnings = [...(view.warnings ?? []), ...warnings];
  } else if (family?.endsWith('sobject list')) {
    const objects = Array.isArray(payload) ? payload : record(payload).sobjects;
    view = {
      summary: Array.isArray(objects) ? `${objects.length} objects returned` : 'Object catalog unavailable',
      warnings,
      sections: [
        ...context(operation, params),
        ...data(
          p,
          Array.isArray(objects) ? objects.map((v) => (typeof v === 'string' ? { 'API name': v } : v)) : payload,
          'Objects',
        ),
      ],
    };
  } else if (family === 'limits api display')
    view = {
      summary: 'Reported API limits',
      warnings,
      sections: [...context(operation, params), ...data(p, payload, 'Limits')],
    };
  else if (
    (family === 'data export' || family === 'data resume') &&
    ('state' in record(payload) || 'status' in record(payload))
  ) {
    view = {
      summary: `Data job · ${String(record(payload).state ?? record(payload).status)}`,
      warnings,
      sections: [
        ...context(operation, params),
        ...(params.query ? [code(params.query, 'Query')] : []),
        ...data(p, payload, 'Export / resume status'),
      ],
    };
  } else if (family === 'org list' && Object.keys(record(payload)).length) {
    const groups = Object.entries(record(payload)).filter(([, v]) => Array.isArray(v));
    view = {
      summary: 'Salesforce org inventory',
      warnings,
      sections: [
        ...context(operation, params),
        ...groups.map(([key, v]) =>
          table(
            p,
            rows(v).map((r) =>
              Object.fromEntries(
                (options.expanded
                  ? ['alias', 'username', 'id', 'instanceUrl', 'connectedStatus', 'isSandbox', 'isDefaultUsername']
                  : ['alias', 'username', 'instanceUrl', 'connectedStatus', 'isSandbox']
                )
                  .filter(
                    (k) =>
                      k in r &&
                      (options.expanded ||
                        (r[k] !== null &&
                          r[k] !== '' &&
                          !(k === 'connectedStatus' && /^connected$/i.test(String(r[k]))))),
                  )
                  .map((k) => [k, r[k]]),
              ),
            ),
            key,
          ),
        ),
      ],
    };
  } else
    view = {
      summary: 'CLI output',
      warnings,
      sections: [
        ...context(operation, params),
        ...(parsed
          ? data(p, payload ?? decoded, 'CLI output')
          : blocks.filter((t) => !t.startsWith('CLI warnings:\n')).map((t) => code(t, 'Literal CLI output'))),
      ],
    };
  if (options.expanded) {
    view.sections = view.sections.filter(
      (s) => !/^(Arguments|CLI output|Metadata|CLI diagnostics|Literal CLI output)(\.|$)/.test(s.title ?? ''),
    );
    view.sections.push(...evidence(p, result, args, argv));
  }
  return view;
}
