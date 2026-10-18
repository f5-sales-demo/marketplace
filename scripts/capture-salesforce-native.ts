import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Loaded by the actual installed xcsh binary. No imported runtime or renderer substitute.
// A private, owner-controlled command file drives the native UI without model calls.
export default async function captureSalesforce(api: any) {
  const root = process.env.PRESENTATION_CAPTURE_ROOT;
  const plugin = process.env.PRESENTATION_CAPTURE_PLUGIN;
  if (!root || !plugin || process.platform !== 'darwin')
    throw new Error('Native Salesforce capture requires the authorized MacBook and explicit private paths');
  const sdk = api.pi;
  if (typeof sdk.ToolExecutionComponent !== 'function' || typeof sdk.setSymbolPreset !== 'function')
    throw new Error('Installed SDK lacks required native capture capabilities');
  const mode = process.env.PRESENTATION_CAPTURE_MODE ?? 'fixture';
  if (!['fixture', 'live'].includes(mode)) throw new Error('Capture mode must be fixture or live');
  const tools = new Map<string, any>();
  const handlers = new Map<string, any[]>();
  let runtimeRepaints = 0;
  const wrappedContext = (ctx: any) => ctx;
  const proxy = new Proxy(api, {
    get(target, key) {
      if (key === 'registerTool')
        return (tool: any) => {
          tools.set(tool.name, tool);
          target.registerTool(tool);
        };
      if (key === 'on')
        return (event: string, handler: any) => {
          const wrapped = (value: any, ctx: any) => handler(value, wrappedContext(ctx));
          handlers.set(event, [...(handlers.get(event) ?? []), wrapped]);
          target.on(event, wrapped);
        };
      if (key === 'personProfile' && mode === 'fixture')
        return { get: async () => ({ facts: { identifiers: { salesforceId: '005000000000001' } } }) };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  await (await import(pathToFileURL(resolve(plugin, 'src/index.ts')).href)).default(proxy);
  const expected = ['sf_query', 'sf_describe', 'sf_org_display', 'sf_pipeline_report', 'sf_help', 'sf_exec'];
  if (expected.some((name) => !tools.has(name))) throw new Error('Installed Salesforce registration is incomplete');
  const cases = JSON.parse(readFileSync(join(root, 'cases.json'), 'utf8'));
  const results = new Map<string, any>();
  const components = new Map<string, any>();
  const frames = join(root, 'frames');
  mkdirSync(frames, { recursive: true, mode: 0o700 });
  const pluginVersion = JSON.parse(readFileSync(join(plugin, '.xcsh-plugin/plugin.json'), 'utf8')).version;
  const manifest: any = {
    evidenceTier: 'installed-native-renderer',
    mode,
    host: process.platform,
    binary: process.execPath,
    runtimeVersion: sdk.VERSION,
    pluginVersion,
    tools: [...tools.keys()],
    captures: [],
    results: [],
    progress: [],
  };
  api.on('session_start', async (_event: unknown, rawContext: any) => {
    const ctx = wrappedContext(rawContext);
    if (!ctx.hasUI) throw new Error('Native capture requires interactive UI');
    ctx.ui.setTitle('Salesforce native capture #1612');
    let tui: any;
    let step: any;
    let activeComponent: any;
    let busy = false;
    let lastControl = '';
    let currentId = '';
    let doneUi: (() => void) | undefined;
    const persist = () => writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2));
    const plain = (lines: string[]) => Bun.stripANSI(lines.join('\n'));
    const save = (id: string, component: any, width: number, extra: any = {}) => {
      const lines = component.render(width);
      const text = plain(lines);
      if (
        /SYNTHETIC_SECRET_SENTINEL|00D[A-Za-z0-9]{12,15}![A-Za-z0-9._-]{35,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(
          text,
        )
      )
        throw new Error('Unsafe credential material in rendered evidence');
      const value = {
        id,
        width,
        theme: step?.theme,
        preset: step?.preset,
        expanded: step?.expanded,
        runtimeVersion: sdk.VERSION,
        pluginVersion,
        terminalColumns: process.stdout.columns,
        terminalRows: process.stdout.rows,
        lines,
        ...extra,
      };
      writeFileSync(join(frames, `${id}.json`), JSON.stringify(value));
      return value;
    };
    const emit = async (name: string, event: any) => {
      for (const handler of handlers.get(name) ?? []) await handler(event, rawContext);
    };
    await ctx.ui.custom<void>((nativeTui: any, _theme: any, _keys: any, done: any) => {
      tui = nativeTui;
      doneUi = done;
      const processControl = async () => {
        const path = join(root, 'control.json');
        if (busy || !existsSync(path)) return;
        const control = readFileSync(path, 'utf8');
        if (control === lastControl) return;
        lastControl = control;
        busy = true;
        try {
          step = JSON.parse(control);
          if (step.action === 'stop') {
            for (const component of components.values()) component.stopAnimation();
            await emit('session_shutdown', {});
            manifest.completed = true;
            persist();
            clearInterval(poll);
            doneUi?.();
            ctx.shutdown();
            return;
          }
          if (
            !['xcsh-dark', 'xcsh-light'].includes(step.theme) ||
            !['unicode', 'ascii', 'nerd'].includes(step.preset) ||
            !Number.isInteger(step.width) ||
            step.width < 30 ||
            step.width > 200 ||
            !/^[\w.-]+$/.test(step.id)
          )
            throw new Error('Invalid capture control');
          await sdk.setSymbolPreset(step.preset);
          if (!(await ctx.ui.setTheme(step.theme)).success) throw new Error('Theme switching failed');
          const item = cases.find((c: any) => c.id === step.case);
          if (!item) throw new Error('Unknown capture case');
          const tool = tools.get(item.tool);
          currentId = step.id;
          let component = components.get(item.id);
          if (!component) {
            const runtimeTui = new Proxy(tui, {
              get(target, key) {
                if (key === 'requestRender')
                  return (...params: any[]) => {
                    runtimeRepaints++;
                    return target.requestRender(...params);
                  };
                const value = Reflect.get(target, key, target);
                return typeof value === 'function' ? value.bind(target) : value;
              },
            });
            component = new sdk.ToolExecutionComponent(tool.name, item.args, {}, tool, runtimeTui, ctx.cwd);
            component.setArgsComplete();
            components.set(item.id, component);
          }
          activeComponent = component;
          if (!results.has(item.id)) {
            const before = runtimeRepaints;
            await emit('tool_execution_start', { toolName: tool.name, toolCallId: item.id, args: item.args });
            const progressTimer = setInterval(() => {
              if (tool.name !== 'sf_pipeline_report') return;
              const record = save(
                `progress-${item.id}-${Date.now()}`,
                component,
                Math.min(76, process.stdout.columns ?? 76),
                { case: item.id, progress: true, repaints: runtimeRepaints },
              );
              manifest.progress.push({ id: record.id, case: item.id, repaints: runtimeRepaints });
            }, 100);
            let result: any;
            try {
              result = await tool.execute(
                `native-capture-${item.id}`,
                item.args,
                AbortSignal.timeout(180000),
                (update: any) => {
                  component.updateResult(update, true);
                  tui.requestRender();
                },
                ctx,
              );
            } finally {
              clearInterval(progressTimer);
              await emit('tool_execution_end', { toolName: tool.name, toolCallId: item.id, args: item.args });
            }
            results.set(item.id, result);
            component.updateResult(result, false);
            const ended = runtimeRepaints;
            await Bun.sleep(200);
            manifest.results.push({
              case: item.id,
              tool: tool.name,
              isError: Boolean(result.isError),
              repaintsDuring: ended - before,
              repaintsAfterEnd: runtimeRepaints - ended,
            });
          }
          component.setExpanded(Boolean(step.expanded));
          component.invalidate();
          ctx.ui.setToolsExpanded(Boolean(step.expanded));
          const record = save(step.id, component, step.width, {
            case: item.id,
            tool: tool.name,
            resultIsError: Boolean(results.get(item.id)?.isError),
          });
          const view = tool.presentation?.result(
            results.get(item.id),
            { expanded: Boolean(step.expanded), isPartial: false, width: step.width },
            item.args,
          );
          record.commands = (view?.sections ?? [])
            .filter((s: any) => s.kind === 'code' && Array.isArray(s.argv) && s.argv[0] === 'sf')
            .map((s: any) => ({ argv: s.argv }));
          writeFileSync(join(frames, `${step.id}.json`), JSON.stringify(record));
          manifest.captures.push({
            id: step.id,
            case: item.id,
            width: step.width,
            theme: step.theme,
            preset: step.preset,
            expanded: step.expanded,
          });
          persist();
          tui.requestRender();
          writeFileSync(
            join(root, 'ack.json'),
            JSON.stringify({ id: step.id, lineCount: record.lines.length, terminalColumns: process.stdout.columns }),
          );
        } catch (error) {
          writeFileSync(join(root, 'error.json'), JSON.stringify({ error: String(error), id: step?.id }));
        } finally {
          busy = false;
        }
      };
      const poll = setInterval(() => void processControl(), 40);
      writeFileSync(
        join(root, 'ready.json'),
        JSON.stringify({
          runtimeVersion: sdk.VERSION,
          pluginVersion,
          binary: process.execPath,
          terminalColumns: process.stdout.columns,
          tools: [...tools.keys()],
        }),
      );
      persist();
      return {
        invalidate() {
          activeComponent?.invalidate();
        },
        render(width: number) {
          const rows = Math.max(5, (process.stdout.rows ?? 45) - 4);
          if (!activeComponent) return ['Native Salesforce capture ready; awaiting controlled fixture input.'];
          const rendered = activeComponent.render(Math.min(step.width, width));
          const offset = Number(step.scroll ?? 0);
          return [
            `NATIVE_CAPTURE ${currentId}`,
            ...rendered.slice(offset, offset + rows),
            `Native ${sdk.VERSION}; allocated ${Math.min(step.width, width)} columns; page ${offset}; ${mode} data.`,
          ];
        },
        handleInput(data: string) {
          if (data === '\x1b') {
            clearInterval(poll);
            done();
            ctx.shutdown();
          }
        },
      };
    });
  });
}
