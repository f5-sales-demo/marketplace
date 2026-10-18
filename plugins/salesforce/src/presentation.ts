import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation';
import { toolArgv } from './presentation/command';
import { describeView } from './presentation/describe';
import { commandContext, execView } from './presentation/exec';
import { helpView } from './presentation/help';
import { decorate, type SymbolResolver } from './presentation/icons';
import { orgView } from './presentation/org';
import { pipelineView } from './presentation/pipeline';
import { queryView } from './presentation/query';
import type { Args, Options, Result, View } from './presentation/shared';
import { code, context, evidence, incomplete, literal, record, texts } from './presentation/shared';

const adapters = {
  sf_exec: execView,
  sf_query: queryView,
  sf_describe: describeView,
  sf_org_display: orgView,
  sf_help: helpView,
  sf_pipeline_report: pipelineView,
};
export function presentTool<T extends { name: string; label?: string }>(
  tool: T,
  p: PresentationAPI,
  symbols: SymbolResolver = () => undefined,
) {
  const styled = (view: View, options: Options) =>
    decorate(
      {
        ...view,
        sections: view.sections.map((section) =>
          section.kind === 'fields' ? { ...section, previewFields: 'all' } : section,
        ),
      },
      symbols,
      options,
    );
  const presented = p.withPresentation(tool, {
    call: (input: unknown, options: Options): View => {
      const args = record(input);
      if (options.expanded)
        // The host labels expanded call arguments; the result owns the runnable block.
        return { sections: [literal(args)] };
      if (tool.name === 'sf_exec') {
        const c = commandContext(args);
        return styled(
          {
            sections: [p.command(['sf', ...c.argv]), ...context(c.operation, c.params)],
          },
          options,
        );
      }
      const argv = toolArgv(tool.name, args);
      return styled(
        {
          sections: argv ? [p.command(argv), ...context('', args)] : p.data(args),
        },
        options,
      );
    },
    result: (result: Result, options: Options, input: unknown): View => {
      const args: Args = record(input);
      const argv = toolArgv(tool.name, args);
      if (result.isError && tool.name !== 'sf_exec')
        return styled(
          {
            summary: 'Salesforce operation failed',
            expandedEvidence: 'provided',
            completeness: 'provided',
            sections: [
              ...(argv ? [p.command(argv)] : []),
              ...texts(result).map((t) => code(t, 'Complete corrective guidance')),
              ...(options.expanded && result.details !== undefined ? [literal(result.details, 'Metadata')] : []),
            ],
          },
          options,
        );
      const adapter = adapters[tool.name as keyof typeof adapters];
      const view = adapter ? adapter(p, result, options, args) : { sections: evidence(p, result, args) };
      if (argv)
        view.sections = [
          p.command(argv),
          ...view.sections.filter((section) => !['SOQL', 'SOSL', 'Query'].includes(section.title ?? '')),
        ];
      const warnings = record(result.details).cliWarnings;
      if (Array.isArray(warnings)) view.warnings = [...(view.warnings ?? []), ...warnings.map(String)];
      // Completion explanations belong to the decoded Salesforce adapter.
      const details = record(result.details);
      let decoded: unknown;
      if (tool.name === 'sf_exec') {
        try {
          decoded = JSON.parse(texts(result)[0] ?? '');
        } catch {
          /* Opaque CLI output uses runtime warnings. */
        }
      }
      const recognized = Boolean(
        result.isError ||
          (tool.name === 'sf_exec' && decoded !== undefined) ||
          (tool.name === 'sf_query' && Array.isArray(record(details.queryResult).records)) ||
          (tool.name === 'sf_describe' && Array.isArray(record(details.described).fields)) ||
          (tool.name === 'sf_org_display' && Object.keys(record(details.orgEvidence)).length) ||
          (tool.name === 'sf_help' && /^(?:USAGE|DESCRIPTION|FLAGS)$/m.test(texts(result).join('\n'))) ||
          (tool.name === 'sf_pipeline_report' &&
            (Object.keys(record(details.pipelineReport)).length ||
              /^(?:Pipeline queries: \d+ completed, \d+ running\.|Discovering pipeline scope and schema\.)$/.test(
                texts(result).join('\n'),
              ))),
      );
      if (recognized && !view.warnings?.some((warning) => warning.startsWith('Malformed'))) {
        view.completeness = 'provided';
        if (options.isPartial && tool.name !== 'sf_pipeline_report')
          view.states = [...(view.states ?? []), { kind: 'running', text: 'Provisional results' }];
        if (incomplete(decoded ?? details) && !JSON.stringify(view.states).includes('Partial'))
          view.warnings = [...(view.warnings ?? []), 'Partial results; conclusions apply only to returned data.'];
      }
      view.expandedEvidence = 'provided';
      return styled(view, options);
    },
  });
  return presented;
}
