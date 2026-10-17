import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation';
import { copyableCommand, toolArgv } from './presentation/command';
import { describeView } from './presentation/describe';
import { commandContext, execView } from './presentation/exec';
import { helpView } from './presentation/help';
import { orgView } from './presentation/org';
import { pipelineView } from './presentation/pipeline';
import { queryView } from './presentation/query';
import type { Args, Options, Result, View } from './presentation/shared';
import { code, context, evidence, record, texts } from './presentation/shared';

const adapters = {
  sf_exec: execView,
  sf_query: queryView,
  sf_describe: describeView,
  sf_org_display: orgView,
  sf_help: helpView,
  sf_pipeline_report: pipelineView,
};
export function presentTool<T extends { name: string; label?: string }>(tool: T, p: PresentationAPI) {
  return p.withPresentation(tool, {
    call: (input: unknown, options: Options): View => {
      const args = record(input);
      if (options.expanded)
        return {
          summary: tool.label ?? tool.name,
          sections: evidence(p, { content: [] }, args, tool.name === 'sf_exec' ? commandContext(args).argv : undefined),
        };
      if (tool.name === 'sf_exec') {
        const c = commandContext(args);
        return {
          sections: [copyableCommand(p, ['sf', ...c.argv]), ...context(c.operation, c.params)],
        };
      }
      const argv = toolArgv(tool.name, args);
      return {
        summary: tool.label ?? tool.name,
        sections: argv ? [copyableCommand(p, argv), ...context('', args)] : p.data(args),
      };
    },
    result: (result: Result, options: Options, input: unknown): View => {
      const args: Args = record(input);
      const argv = toolArgv(tool.name, args);
      if (result.isError && tool.name !== 'sf_exec')
        return {
          summary: 'Salesforce operation failed',
          sections: [
            ...(argv ? [copyableCommand(p, argv)] : []),
            ...texts(result).map((t) => code(t, 'Complete corrective guidance')),
            ...(options.expanded ? evidence(p, result, args) : []),
          ],
        };
      const adapter = adapters[tool.name as keyof typeof adapters];
      const view = adapter ? adapter(p, result, options, args) : { sections: evidence(p, result, args) };
      if (argv)
        view.sections = [
          copyableCommand(p, argv),
          ...view.sections.filter((section) => !['SOQL', 'SOSL', 'Query'].includes(section.title ?? '')),
        ];
      const warnings = record(result.details).cliWarnings;
      if (Array.isArray(warnings)) view.warnings = [...(view.warnings ?? []), ...warnings.map(String)];
      return view;
    },
  });
}
