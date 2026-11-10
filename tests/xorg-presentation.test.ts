import { afterEach, expect, spyOn, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import xorgIntegration from '../plugins/xorg/extensions/integration';
import { presentation } from '../scripts/agent-validation-runtime/node_modules/@f5-sales-demo/xcsh/src/extensibility/presentation';

function definitions() {
  let integration: any;
  let tool: any;
  xorgIntegration({
    presentation,
    integrations: {
      register(d) {
        integration = d;
      },
    },
    typebox: { Type: new Proxy({}, { get: () => () => ({}) }) } as any,
    registerTool(d) {
      tool = d;
    },
  });
  return { integration, tool };
}
let spawn: ReturnType<typeof spyOn> | undefined;
afterEach(() => spawn?.mockRestore());
const version = JSON.parse(
  readFileSync(new URL('../plugins/xorg/.xcsh-plugin/plugin.json', import.meta.url), 'utf8'),
).version;
const response = (data: unknown, exitCode = 0, stderr = '') =>
  ({
    exitCode,
    stdout: new TextEncoder().encode(JSON.stringify(data)),
    stderr: new TextEncoder().encode(stderr),
  }) as ReturnType<typeof Bun.spawnSync>;

test('failed controller guidance on stderr survives execution and presentation', async () => {
  const { tool } = definitions();
  const guidance = 'session example is stopped; run session start';
  spawn = spyOn(Bun, 'spawnSync').mockReturnValue(
    response(undefined, 1, JSON.stringify({ ok: false, error: guidance })),
  );
  const r = await tool.execute('case', { session: 'example', command: 'window', action: 'list', params: {} });
  expect(r.details.stderr).toContain(guidance);
  expect(r.details.observation).toEqual({ ok: false, error: guidance });
  const v = tool.presentation.result(r, { expanded: true, isPartial: false }, {});
  expect(v.summary).toContain('failed');
  expect(JSON.stringify(v)).toContain(guidance);
});
test('capability version matching is exact and envelope failures fail closed', async () => {
  const { integration } = definitions();
  for (const envelope of [{ ok: true, result: { version: `1${version}` } }, { ok: false, result: { version } }, null]) {
    spawn = spyOn(Bun, 'spawnSync').mockReturnValue(response(envelope));
    expect((await integration.probe()).state).toBe('degraded');
    expect(spawn).toHaveBeenCalledTimes(1);
    spawn.mockRestore();
  }
});
test('missing executable is actionable while unrelated spawn failures remain visible', async () => {
  const { integration } = definitions();
  spawn = spyOn(Bun, 'spawnSync').mockImplementation(() => {
    throw Object.assign(new Error('missing'), { code: 'ENOENT' });
  });
  expect(await integration.probe()).toMatchObject({ state: 'setup_required', reason: 'cli_missing' });
  spawn.mockRestore();
  spawn = spyOn(Bun, 'spawnSync').mockImplementation(() => {
    throw Object.assign(new Error('denied'), { code: 'EACCES' });
  });
  await expect(integration.probe()).rejects.toThrow('denied');
});
test('call and execution use the same exact argv and Bash/Zsh preserve hostile literal text', async () => {
  const { tool } = definitions();
  const input = {
    session: 'example',
    command: 'inspect',
    action: 'accessibility',
    params: { text: "' $value `literal`\nline", enabled: false, count: 0 },
  };
  spawn = spyOn(Bun, 'spawnSync').mockReturnValue(response({ ok: true, result: {} }));
  await tool.execute('case', input);
  const executed = spawn.mock.calls[0][0];
  const declared = tool.presentation
    .call(input, { expanded: false, isPartial: false })
    .sections.find((s: any) => s.title === 'Desktop command');
  expect(declared).toEqual(presentation.command(executed, 'Desktop command'));
  spawn.mockRestore();
  const harmless = presentation.command(['python3', '-c', 'import json,sys; print(json.dumps(sys.argv[1:]))']);
  for (const shell of ['bash', 'zsh']) {
    const r = Bun.spawnSync([shell, '-c', `${harmless.text} ${declared.text}`]);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(new TextDecoder().decode(r.stdout))).toEqual(executed);
  }
});
test('window previews retain selected domain fields, zeros, false and empty titles', () => {
  const { tool } = definitions();
  const rows = Array.from({ length: 13 }, (_, id) => ({ id, title: '', pid: 0, mapped: false }));
  const observation = { ok: true, result: rows };
  const r = { details: { exitCode: 0, observation }, content: [{ type: 'text', text: JSON.stringify(observation) }] };
  const v = tool.presentation.result(
    r,
    { expanded: false, isPartial: false },
    { session: 'example', command: 'window', action: 'list' },
  );
  const table = v.sections.find((s: any) => s.kind === 'table');
  expect(table).toMatchObject({ previewRows: 12, rows });
  expect(table.columns.map((c: any) => c.key)).toContain('pid');
  expect(v.sections.find((s: any) => s.title === 'Desktop outcome').values).toMatchObject({
    OK: true,
    'Item count': 13,
  });
});

test('empty and partial outcomes remain distinct, opaque results retain fallback', () => {
  const { tool } = definitions();
  const r = { details: { exitCode: 0, observation: { ok: true, result: [] } }, content: [] };
  const v = tool.presentation.result(r, { expanded: true, isPartial: true }, { command: 'window', action: 'list' });
  expect(v.warnings.join(' ')).toContain('not final');
  const collapsed = tool.presentation.result(r, { expanded: false, isPartial: true }, {});
  expect(collapsed.sections.find((s: any) => s.title === 'Desktop outcome').values['Item count']).toBe(0);
  expect(v.sections.filter((s: any) => s.title === 'Complete controller evidence')).toHaveLength(1);
  for (const observation of [null, { ok: true, result: null }, { ok: false, error: 0 }]) {
    const raw = { details: { exitCode: 0, observation }, content: [{ type: 'text', text: 'opaque literal guidance' }] };
    const fallback = tool.presentation.result(raw, { expanded: true, isPartial: false }, {});
    expect(fallback.expandedEvidence).not.toBe('provided');
    expect(JSON.stringify(fallback)).toContain('opaque literal guidance');
  }
});
