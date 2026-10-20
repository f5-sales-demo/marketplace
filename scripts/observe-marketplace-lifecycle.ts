import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertPrivateCaptureRoot } from './marketplace-qualification';
import { selectObservedLifecycleComponent } from './observed-lifecycle-component';

// Observe normal dispatch through public TUI containers, without private imports or handler calls.
export default function observeMarketplaceLifecycle(api: any) {
  const root = process.env.MARKETPLACE_LIFECYCLE_ROOT;
  const expected = process.env.MARKETPLACE_LIFECYCLE_EXPECTED;
  if (!root || !expected) throw new Error('Explicit private capture root and expected result required');
  if (existsSync(join(root, 'ready.json'))) throw new Error('Preserve prior evidence; choose a fresh root');
  mkdirSync(root, { recursive: true, mode: 0o700 });
  assertPrivateCaptureRoot(root);
  const record = (event: any) =>
    appendFileSync(join(root, 'events.jsonl'), `${JSON.stringify({ time: Date.now(), ...event })}\n`, { mode: 0o600 });
  api.on('session_start', async () => {
    await api.setActiveTools([]);
    record({ event: 'ready', binary: process.execPath, runtimeVersion: api.pi.VERSION, activeTools: [] });
  });
  api.on('input', (event: any) => {
    record({ event: 'input', text: event.text });
  });
  api.on('tool_call', (event: any) => {
    record({ event: 'blocked_tool_call', toolName: event.toolName });
    return { block: true, reason: 'Lifecycle qualification permits no model-selected tool calls.' };
  });
  let timer: ReturnType<typeof setInterval> | undefined;
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
  };
  let shutdown = false;
  let closeCapture: (() => void) | undefined;
  api.on('session_shutdown', () => {
    shutdown = true;
    closeCapture?.();
    stop();
    record({ event: 'session_shutdown' });
  });
  api.registerCommand('marketplace-lifecycle-exit', {
    description: 'End private lifecycle qualification',
    handler: async (_args: string, ctx: any) => ctx.shutdown(),
  });
  api.registerCommand('marketplace-lifecycle-capture', {
    description: 'Observe an already dispatched lifecycle result through the public TUI',
    handler: async (_args: string, ctx: any) => {
      if (shutdown || existsSync(join(root, 'ready.json')))
        throw new Error('Capture already started or session closed');
      await ctx.ui.custom<void>((tui: any, _theme: any, _keys: any, done: any) => {
        const component = selectObservedLifecycleComponent(tui, expected, (text) => Bun.stripANSI(text));
        const provenance = {
          binary: process.execPath,
          runtimeVersion: api.pi.VERSION,
          evidenceTier: 'normal-dispatched-public-component',
          expansionSupport: 'not-exposed-by-public-component',
          expectedText: expected,
        };
        const write = (file: string, value: any) =>
          writeFileSync(join(root, file), JSON.stringify(value), { mode: 0o600 });
        mkdirSync(join(root, 'frames'), { mode: 0o700 });
        write('cases.json', [{ id: 'dispatched-lifecycle', tool: 'runtime-lifecycle' }]);
        write('ready.json', {
          ...provenance,
          terminalColumns: process.stdout.columns,
          terminalRows: process.stdout.rows,
        });
        let last = '';
        let busy = false;
        let viewport: string[] = [];
        let closed = false;
        const close = () => {
          if (closed) return;
          closed = true;
          stop();
          record({ event: 'capture_closed' });
          done();
        };
        closeCapture = close;
        const processControl = async () => {
          if (closed || shutdown || busy || !existsSync(join(root, 'control.json'))) return;
          const source = readFileSync(join(root, 'control.json'), 'utf8');
          if (source === last) return;
          busy = true;
          last = source;
          try {
            const control = JSON.parse(source);
            if (control?.action === 'finish') {
              close();
              return;
            }
            if (
              !control ||
              typeof control.id !== 'string' ||
              control.id.length > 200 ||
              !/^[\w.-]+$/.test(control.id) ||
              control.case !== 'dispatched-lifecycle' ||
              ![40, 76, 120, 153].includes(control.width) ||
              typeof control.expanded !== 'boolean' ||
              (control.scroll !== undefined && (!Number.isSafeInteger(control.scroll) || control.scroll < 0)) ||
              !['xcsh-dark', 'xcsh-light'].includes(control.theme) ||
              !['unicode', 'ascii', 'nerd'].includes(control.preset)
            )
              throw new Error('Invalid lifecycle capture control');
            await api.pi.setSymbolPreset(control.preset);
            if (closed || shutdown) return;
            const appearance = await ctx.ui.setTheme(control.theme);
            if (closed || shutdown) return;
            if (!appearance.success) throw new Error('Appearance switch failed');
            component.invalidate();
            const lines = component.render(control.width);
            const capacity = Math.max(1, (process.stdout.rows ?? 24) - 2);
            const offset = Math.min(Math.max(0, control.scroll ?? 0), Math.max(0, lines.length - capacity));
            viewport = lines.slice(offset, offset + capacity);
            write(`frames/${control.id}.json`, {
              ...control,
              ...provenance,
              lines,
              viewport: { rows: viewport, offset, capacity, totalLines: lines.length },
              terminalColumns: process.stdout.columns,
              terminalRows: process.stdout.rows,
            });
            tui.requestRender();
            write('ack.tmp', { id: control.id });
            renameSync(join(root, 'ack.tmp'), join(root, 'ack.json'));
          } finally {
            busy = false;
          }
        };
        timer = setInterval(() => {
          void processControl().catch((error) => {
            if (closed || shutdown) return;
            write('error.json', { message: String(error) });
            close();
          });
        }, 40);
        return {
          render: () => viewport,
          invalidate() {},
          handleInput: (input: string) => {
            if (input === '\u001b') close();
          },
        };
      });
    },
  });
}
