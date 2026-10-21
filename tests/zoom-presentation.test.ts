import { afterEach, expect, spyOn, test } from 'bun:test';
import { stripVTControlCharacters } from 'node:util';
import zoomIntegration, { createZoomCommandHandler } from '../plugins/zoom/extensions/integration';
import { presentTool } from '../plugins/zoom/extensions/presentation';
import { visibleWidth } from '../scripts/agent-validation-runtime/node_modules/@f5-sales-demo/pi-tui';
import { presentation } from '../scripts/agent-validation-runtime/node_modules/@f5-sales-demo/xcsh/src/extensibility/presentation';
import { ToolExecutionComponent } from '../scripts/agent-validation-runtime/node_modules/@f5-sales-demo/xcsh/src/modes/components/tool-execution';
import {
  initTheme,
  setSymbolPreset,
  setTheme,
} from '../scripts/agent-validation-runtime/node_modules/@f5-sales-demo/xcsh/src/modes/theme/theme';

let probe: () => Promise<unknown>;
zoomIntegration({
  presentation,
  integrations: {
    register(d: unknown) {
      probe = (d as { probe(): Promise<unknown> }).probe;
    },
  },
  typebox: { Type: new Proxy({}, { get: () => () => ({}) }) } as never,
  registerTool() {},
  registerCommand() {},
});
let spawn: ReturnType<typeof spyOn> | undefined;
afterEach(() => spawn?.mockRestore());
const response = (stdout: string, stderr = '', exitCode = 0) =>
  ({
    exitCode,
    stdout: new TextEncoder().encode(stdout),
    stderr: new TextEncoder().encode(stderr),
  }) as ReturnType<typeof Bun.spawnSync>;

test('failed lifecycle stderr retains literal corrective guidance and complete evidence', async () => {
  const value = { ready: false, error: 'dependency_unavailable:example', count: 0, configured: false, label: '' };
  spawn = spyOn(Bun, 'spawnSync').mockReturnValue(response('', JSON.stringify(value), 1));
  expect(await probe()).toMatchObject({ state: 'setup_required', reason: value.error, value });
});
test('missing Python is actionable and unrelated execution failures are preserved', async () => {
  spawn = spyOn(Bun, 'spawnSync').mockImplementation(() => {
    throw Object.assign(new Error('missing'), { code: 'ENOENT' });
  });
  expect(await probe()).toMatchObject({ state: 'setup_required', reason: 'cli_missing' });
  spawn.mockImplementation(() => {
    throw Object.assign(new Error('denied'), { code: 'EACCES' });
  });
  await expect(probe()).rejects.toMatchObject({ code: 'EACCES' });
});
test('malformed and failed ready lifecycle results fail closed', async () => {
  for (const value of [null, [], {}, { ready: 'true' }, { ready: true, error: { reason: 'opaque' } }]) {
    spawn = spyOn(Bun, 'spawnSync').mockReturnValue(response(JSON.stringify(value)));
    expect(await probe()).toMatchObject({ state: 'degraded', reason: 'invalid_response', value });
    spawn.mockRestore();
  }
  spawn = spyOn(Bun, 'spawnSync').mockReturnValue(response(JSON.stringify({ ready: true }), '', 1));
  expect(await probe()).toMatchObject({ state: 'setup_required' });
});
test('request presentation has real domain scope without an invented executable', () => {
  const tool = presentTool({ name: 'zoom_meeting', label: 'Zoom meeting' }, presentation);
  const view = tool.presentation.call!({ action: 'status' }, { expanded: false, isPartial: false });
  expect(JSON.stringify(view)).not.toContain('zoom-hybrid');
  expect(view.sections?.find((s) => s.kind === 'fields')).toMatchObject({
    title: 'Requested Zoom scope',
    previewFields: 'all',
  });
});
test('domain summaries and expanded evidence preserve unknowns, false, zero and complete guidance once', () => {
  const tool = presentTool({ name: 'zoom_meeting' }, presentation);
  const details = {
    exitCode: 0,
    session: 'example',
    changed: false,
    verified: false,
    awareness: { meeting: 'home', meeting_id: 'unknown', audio: 'unknown', video: 'off' },
    terminal_camera: { ready: false, error: 'literal correction' },
    evidence: {
      accessibility: { items: Array.from({ length: 13 }, (_, id) => ({ id, name: '', checked: false, pid: 0 })) },
    },
  };
  const result = { details, content: [{ type: 'text', text: JSON.stringify(details) }] };
  const collapsed = tool.presentation.result!(result, { expanded: false, isPartial: true }, { action: 'status' });
  expect(collapsed.sections?.find((s) => s.title === 'Zoom outcome')).toMatchObject({
    previewFields: 'all',
    values: { Verified: false, Changed: false, 'Exit code': 0 },
  });
  expect(collapsed.warnings?.join(' ')).toContain('not final');
  const expanded = tool.presentation.result!(result, { expanded: true, isPartial: false }, { action: 'status' });
  const evidence = expanded.sections?.filter((s) => s.title === 'Complete Zoom evidence');
  expect(evidence).toHaveLength(1);
  expect(JSON.stringify(expanded).match(/literal correction/g)).toHaveLength(1);
  expect(expanded.expandedEvidence).toBe('provided');
  for (const details of [null, {}, { exitCode: '0' }]) {
    const fallback = tool.presentation.result!(
      { details, content: [{ type: 'text', text: 'opaque corrective guidance' }] },
      { expanded: true, isPartial: false },
      {},
    );
    expect(fallback.expandedEvidence).not.toBe('provided');
    expect(fallback.sections?.find((s) => s.title === 'Requested Zoom scope')).toBeDefined();
    expect(fallback.warnings?.join(' ')).toContain('readiness is unverified');
  }
});
test('expandable direct command retains complete evidence and executes once', async () => {
  let calls = 0;
  let displayed: unknown;
  const result = { exitCode: 0, evidence: { windows: [{ pid: 0, title: '' }] } };
  await createZoomCommandHandler(
    () => {
      calls++;
      return result;
    },
    (value) => {
      displayed = value;
    },
  )('status', { ui: { notify() {} } });
  expect(calls).toBe(1);
  expect(displayed).toEqual(result);
});

test('lifecycle preserves distinct stderr alongside a valid observation', async () => {
  spawn = spyOn(Bun, 'spawnSync').mockReturnValue(
    response(JSON.stringify({ ready: false }), 'literal additional guidance', 1),
  );
  expect(JSON.stringify(await probe())).toContain('literal additional guidance');
});

test('opaque observations retain automatic raw evidence once through the real component', async () => {
  await initTheme(false);
  const tool = presentTool({ name: 'zoom_meeting', label: 'Zoom meeting' }, presentation);
  for (const theme of ['xcsh-dark', 'xcsh-light']) {
    expect((await setTheme(theme, false)).success).toBe(true);
    for (const preset of ['unicode', 'ascii', 'nerd'] as const) {
      await setSymbolPreset(preset);
      for (const details of [undefined, null, {}, { exitCode: '0', hasMore: true }, { exitCode: 0 }]) {
        const result = {
          details,
          content: [
            { type: 'text', text: 'opaque corrective guidance' },
            ...(details?.exitCode === 0 ? [{ type: 'audio', mimeType: 'audio/wav' }] : []),
          ],
        };
        const view = tool.presentation.result!(result, { expanded: true, isPartial: false }, { action: 'status' });
        expect(view.expandedEvidence).not.toBe('provided');
        const component = new ToolExecutionComponent(
          'zoom_meeting',
          { action: 'status' },
          {},
          tool as never,
          { requestRender() {} } as never,
        );
        component.updateResult(result, false);
        try {
          for (const expanded of [false, true]) {
            component.setExpanded(expanded);
            for (const width of [40, 76, 120, 153]) {
              const lines = component.render(width);
              for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(width);
              const rendered = stripVTControlCharacters(lines.join('\n'));
              if (expanded) expect(rendered.match(/opaque corrective guidance/g)).toHaveLength(1);
            }
          }
        } finally {
          component.stopAnimation();
        }
      }
    }
  }
});
