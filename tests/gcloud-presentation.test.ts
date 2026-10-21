import { expect, test } from 'bun:test';
import { presentTool } from '../plugins/gcloud/src/presentation';
import { visibleWidth } from '../scripts/agent-validation-runtime/node_modules/@f5-sales-demo/pi-tui';
import { presentation } from '../scripts/agent-validation-runtime/node_modules/@f5-sales-demo/xcsh/src/extensibility/presentation';
import { ToolExecutionComponent } from '../scripts/agent-validation-runtime/node_modules/@f5-sales-demo/xcsh/src/modes/components/tool-execution';
import {
  initTheme,
  setTheme,
} from '../scripts/agent-validation-runtime/node_modules/@f5-sales-demo/xcsh/src/modes/theme/theme';

const fixtures = [
  {
    name: 'gcloud_help',
    details: { tool: 'gcloud_help' },
    text: 'Complete help END_HELP',
    args: { command_path: 'projects' },
  },
  { name: 'gcloud_projects_list', details: { projects: [null] }, text: 'Correct malformed rows END_MALFORMED' },
  { name: 'gcloud_exec', details: { fullOutput: 'opaque' }, text: 'Complete opaque output END_OPAQUE' },
  {
    name: 'gcloud_config_list',
    details: { errorType: 'session_expired' },
    text: 'Run exactly: xcsh plugin setup gcloud END_CORRECTION',
    isError: true,
  },
  ...['gcp_ce_apply', 'gcp_ce_upgrade', 'gcp_ce_failover', 'gcp_ce_teardown'].map((name) => ({
    name,
    details: { availability: 'unavailable', mutationAttempted: false, required: ['qualified mappings'] },
    text: 'Unavailable: qualified mappings END_BOUNDARY',
    isError: true,
  })),
];

test('published component retains complete help, failed and opaque evidence exactly once', async () => {
  for (const fixture of fixtures) {
    const tool = presentTool({ name: fixture.name }, presentation);
    const output = {
      content: [{ type: 'text', text: fixture.text }],
      details: fixture.details,
      isError: fixture.isError,
    };
    for (const preset of ['unicode', 'ascii', 'nerd'] as const) {
      await initTheme(false, preset);
      for (const theme of ['xcsh-dark', 'xcsh-light']) {
        expect((await setTheme(theme)).success).toBe(true);
        const component = new ToolExecutionComponent(
          tool.name,
          fixture.args ?? {},
          {},
          tool as never,
          { requestRender() {} } as never,
        );
        try {
          component.updateResult(output as never);
          for (const expanded of [false, true]) {
            component.setExpanded(expanded);
            for (const width of [40, 76, 120, 153]) {
              const lines = component.render(width);
              expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
              const text = Bun.stripANSI(lines.join('\n'));
              const marker = fixture.text.split(' ').at(-1);
              if (!marker) throw new Error(`Missing fixture marker for ${fixture.name}`);
              expect(text.split(marker).length - 1).toBe(1);
            }
          }
        } finally {
          component.stopAnimation();
        }
      }
    }
  }
});

test('mixed help content retains automatic evidence and completeness fallback', () => {
  const tool = presentTool({ name: 'gcloud_help' }, presentation);
  const result = tool.presentation.result;
  if (!result) throw new Error('Missing help presentation');
  const view = result(
    {
      content: [
        { type: 'text', text: 'Help marker' },
        { type: 'image', data: 'synthetic', mimeType: 'image/png' },
      ],
    } as never,
    { expanded: true, isPartial: false },
    {},
  );
  if (!view) throw new Error('Missing help result view');
  expect(view.expandedEvidence).not.toBe('provided');
  expect(view.completeness).not.toBe('provided');
});
