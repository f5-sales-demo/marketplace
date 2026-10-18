import { Type } from '@sinclair/typebox';
import type { TUI } from '../../../scripts/agent-validation-runtime/node_modules/@f5-sales-demo/pi-tui';
import {
  ExtensionRuntime,
  loadExtensionFromFactory,
} from '../../../scripts/agent-validation-runtime/node_modules/@f5-sales-demo/xcsh/src/extensibility/extensions/loader';
import { wrapRegisteredTool } from '../../../scripts/agent-validation-runtime/node_modules/@f5-sales-demo/xcsh/src/extensibility/extensions/wrapper';
import { ToolExecutionComponent } from '../../../scripts/agent-validation-runtime/node_modules/@f5-sales-demo/xcsh/src/modes/components/tool-execution';
import {
  initTheme,
  setTheme,
  theme,
} from '../../../scripts/agent-validation-runtime/node_modules/@f5-sales-demo/xcsh/src/modes/theme/theme';
import { EventBus } from '../../../scripts/agent-validation-runtime/node_modules/@f5-sales-demo/xcsh/src/utils/event-bus';
import { presentTool } from '../src/presentation';
import { sessionSymbols } from '../src/presentation/icons';

export { visibleWidth } from '../../../scripts/agent-validation-runtime/node_modules/@f5-sales-demo/pi-tui';
export { copyableCommand } from '../../../scripts/agent-validation-runtime/node_modules/@f5-sales-demo/xcsh/src/modes/components/copyable-command';
export { initTheme, setTheme, theme };
export const plain = (lines: string[]) => Bun.stripANSI(lines.join('\n'));
export async function registered(name: string, args = {}, requestRender = () => {}) {
  const symbols = sessionSymbols();
  symbols.bind({
    hasUI: true,
    ui: {
      get theme() {
        return theme;
      },
    },
  });
  const extension = await loadExtensionFromFactory(
    (pi) => {
      pi.registerTool(
        presentTool(
          {
            name,
            label: name,
            description: 'Synthetic read-only fixture',
            parameters: Type.Object({}),
            async execute() {
              return { content: [] };
            },
          },
          pi.presentation,
          symbols.resolve,
        ),
      );
    },
    process.cwd(),
    new EventBus(),
    new ExtensionRuntime(),
  );
  const tool = wrapRegisteredTool(extension!.tools.get(name)!, {} as never);
  const component = new ToolExecutionComponent(name, args, {}, tool, { requestRender } as TUI);
  component.setArgsComplete();
  return component;
}
