import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation';
import { copyableCommand, toolArgv } from './presentation/command';
import { describeView } from './presentation/describe';
import { commandContext, execView } from './presentation/exec';
import { helpView } from './presentation/help';
import { decorate, type SymbolResolver } from './presentation/icons';
import { orgView } from './presentation/org';
import { pipelineView } from './presentation/pipeline';
import { queryView } from './presentation/query';
import { component } from './presentation/renderer';
import type { Args, Options, Result, View } from './presentation/shared';
import { code, context, evidence, literal, record, texts } from './presentation/shared';

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
  const styled = (view: View, options: Options) => decorate(view, symbols, options);
  const presented = p.withPresentation(tool, {
    call: (input: unknown, options: Options): View => {
      const args = record(input);
      if (options.expanded)
        // The host labels expanded call arguments; the result owns the runnable block.
        return { sections: [literal(tool.name === 'sf_exec' ? commandContext(args).argv : args)] };
      if (tool.name === 'sf_exec') {
        const c = commandContext(args);
        return styled(
          {
            sections: [
              copyableCommand(p, ['sf', ...c.argv], undefined, options.width),
              ...context(c.operation, c.params),
            ],
          },
          options,
        );
      }
      const argv = toolArgv(tool.name, args);
      return styled(
        {
          sections: argv ? [copyableCommand(p, argv, undefined, options.width), ...context('', args)] : p.data(args),
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
            sections: [
              ...(argv ? [copyableCommand(p, argv, undefined, options.width)] : []),
              ...texts(result).map((t) => code(t, 'Complete corrective guidance')),
              ...(options.expanded ? evidence(p, result, args) : []),
            ],
          },
          options,
        );
      const adapter = adapters[tool.name as keyof typeof adapters];
      const view = adapter ? adapter(p, result, options, args) : { sections: evidence(p, result, args) };
      if (argv)
        view.sections = [
          copyableCommand(p, argv, undefined, options.width),
          ...view.sections.filter((section) => !['SOQL', 'SOSL', 'Query'].includes(section.title ?? '')),
        ];
      const warnings = record(result.details).cliWarnings;
      if (Array.isArray(warnings)) view.warnings = [...(view.warnings ?? []), ...warnings.map(String)];
      return styled(view, options);
    },
  });
  return Object.assign(presented, {
    inline: true,
    mergeCallAndResult: true,
    renderCall: (args: Args, options: Options, theme: unknown) =>
      component(
        tool.label ?? tool.name,
        (width) => presented.presentation.call(args, { ...options, width } as Options) as View,
        options,
        theme,
      ),
    renderResult: (result: Result, options: Options, theme: unknown, args: Args) =>
      component(
        tool.label ?? tool.name,
        (width) => {
          const view = presented.presentation.result(result, { ...options, width } as Options, args) as View;
          if (options.expanded) view.sections.push(literal(args, 'Arguments'));
          return view;
        },
        options,
        theme,
        Boolean(result.isError),
      ),
  });
}
