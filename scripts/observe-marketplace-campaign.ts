import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  assertPrivateCaptureRoot,
  guardScenarioTool,
  qualificationCatalog,
  resolveShippedPath,
  selectInstalledPlugin,
  validateScenario,
  validateScenarioSources,
} from './marketplace-qualification';

// A read-only observer of the published runtime. It does not manually dispatch lifecycle handlers.
export default async function observeMarketplaceCampaign(api: any) {
  const root = process.env.MARKETPLACE_CAMPAIGN_ROOT;
  const plugin = process.env.MARKETPLACE_CAMPAIGN_PLUGIN;
  const selectedName = process.env.MARKETPLACE_CAMPAIGN_NAME;
  const scenarioPath = process.env.MARKETPLACE_CAMPAIGN_SCENARIO;
  if (!root || !plugin || !selectedName || !scenarioPath)
    throw new Error('Explicit private paths, plugin name and reviewed scenario are required');
  const catalog = qualificationCatalog(resolve(import.meta.dir, '..'));
  const selected = catalog.find((item) => item.name === selectedName);
  if (!selected) throw new Error('Unknown catalog plugin');
  const mode = process.env.MARKETPLACE_CAMPAIGN_MODE ?? 'service';
  if (!['fixture', 'service', 'guidance'].includes(mode)) throw new Error('Invalid qualification mode');
  if (mode === 'service' && !selected.serviceHosts.includes(process.platform))
    throw new Error('Unsupported service qualification host');
  if (existsSync(join(root, 'events.jsonl'))) throw new Error('Preserve prior evidence; choose a fresh capture root');
  mkdirSync(root, { recursive: true, mode: 0o700 });
  assertPrivateCaptureRoot(root);
  const scenario = validateScenario(JSON.parse(readFileSync(scenarioPath, 'utf8')));
  validateScenarioSources(scenario, plugin);
  const guidance = scenario.guidance.map((path) => resolveShippedPath(plugin, path));
  const activeTools = [
    ...new Set([
      ...scenario.calls.map((call) => call.tool),
      ...(guidance.length ? ['read'] : []),
      ...(scenario.shellCalls?.length ? ['bash'] : []),
    ]),
  ];
  const record = (value: any) =>
    appendFileSync(join(root, 'events.jsonl'), `${JSON.stringify({ time: Date.now(), ...value })}\n`, { mode: 0o600 });
  const manifest = JSON.parse(readFileSync(join(plugin, '.xcsh-plugin/plugin.json'), 'utf8'));
  if (manifest.name !== selectedName || !manifest.version) throw new Error('Installed manifest identity mismatch');
  const registryPath =
    process.env.MARKETPLACE_CAMPAIGN_REGISTRY ?? join(homedir(), '.xcsh/plugins/installed_plugins.json');
  const installed = selectInstalledPlugin(JSON.parse(readFileSync(registryPath, 'utf8')), selectedName);
  if (realpathSync(installed.installPath) !== realpathSync(plugin) || installed.version !== manifest.version)
    throw new Error('Installed registry and selected manifest disagree');
  const pkgPath = join(plugin, 'package.json');
  const pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf8')) : {};
  const entrypoints = manifest.extensions ?? pkg.xcsh?.extensions ?? [];
  const provenance = {
    binary: process.execPath,
    runtimeVersion: api.pi.VERSION,
    pluginVersion: manifest.version,
    plugin: selectedName,
    scenario: scenario.id,
    mode,
    evidenceTier:
      mode === 'fixture' ? 'installed-native-renderer-with-synthetic-results' : 'installed-runtime-workflow-observer',
    scenarioSha256: createHash('sha256').update(readFileSync(scenarioPath)).digest('hex'),
  };
  if (typeof api.pi.ToolExecutionComponent !== 'function' || typeof api.pi.AssistantMessageComponent !== 'function')
    throw new Error('Published runtime capture components are unavailable');
  const tools = new Map<string, any>();
  const observeContext = (ctx: any) =>
    new Proxy(ctx, {
      get(target, key) {
        if (key !== 'ui') return Reflect.get(target, key, target);
        return new Proxy(target.ui, {
          get(ui, method) {
            const value = Reflect.get(ui, method, ui);
            if (typeof value !== 'function') return value;
            return (...args: any[]) => {
              if (['notify', 'setStatus', 'setWidget', 'setWorkingMessage'].includes(String(method)))
                record({ event: 'plugin_ui_dispatch', method: String(method), args });
              return value.apply(ui, args);
            };
          },
        });
      },
    });
  const proxy = new Proxy(api, {
    get(target, key) {
      if (mode === 'fixture' && key === 'exec')
        return () => {
          throw new Error('Fixture qualification cannot execute commands');
        };
      if (mode === 'fixture' && key === 'integrations')
        return { register: () => ({ get: async () => ({ state: 'unavailable', reason: 'synthetic-fixture' }) }) };
      if (mode === 'fixture' && key === 'personProfile') return { get: async () => ({ facts: {} }) };
      if (['sendMessage', 'sendUserMessage'].includes(String(key)))
        return (...args: any[]) => {
          record({ event: 'plugin_message_dispatch', method: String(key), args });
          if (mode === 'fixture') return;
          return target[key](...args);
        };
      if (key === 'registerCommand')
        return (name: string, command: any) =>
          target.registerCommand(name, {
            ...command,
            handler: async (args: string, ctx: any) => {
              if (mode === 'fixture' || !scenario.commands?.some((rule) => rule.name === name && rule.args === args))
                throw new Error('Acceptance permits only exact reviewed scenario commands');
              record({ event: 'plugin_command_start', name, args });
              try {
                const result = await command.handler(args, observeContext(ctx));
                record({ event: 'plugin_command_end', name, result });
                return result;
              } catch (error) {
                record({ event: 'plugin_command_error', name, message: String(error) });
                throw error;
              }
            },
          });
      if (key === 'on')
        return (name: string, handler: any) => {
          if (mode === 'fixture') return;
          return target.on(name, async (event: any, ctx: any) => {
            const result = await handler(event, observeContext(ctx));
            record({
              event: 'plugin_dispatch',
              name,
              hasUI: ctx.hasUI === true,
              returned: Boolean(result),
              message: result?.message,
            });
            return result;
          });
        };
      if (key === 'registerTool')
        return (tool: any) => {
          const guarded = {
            ...tool,
            execute: (...args: any[]) => {
              if (mode === 'fixture') throw new Error('Fixture qualification cannot execute tools');
              const decision = guardScenarioTool({ toolName: tool.name, input: args[1] }, scenario, plugin);
              if (decision) throw new Error(decision.reason);
              return tool.execute(...args);
            },
          };
          tools.set(tool.name, guarded);
          target.registerTool(guarded);
        };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  for (const path of entrypoints)
    await (await import(pathToFileURL(resolveShippedPath(plugin, path)).href)).default(proxy);
  for (const call of scenario.calls)
    if (!tools.has(call.tool)) throw new Error('Scenario references an unregistered plugin tool');
  const captures: any[] = [];
  if (mode === 'fixture') {
    const fixturePath = process.env.MARKETPLACE_CAMPAIGN_FIXTURES;
    if (!fixturePath) throw new Error('Fixture mode requires explicit synthetic results');
    const fixtures = JSON.parse(readFileSync(fixturePath, 'utf8'));
    if (!Array.isArray(fixtures) || !fixtures.length) throw new Error('Empty fixture suite');
    const ids = new Set();
    for (const item of fixtures) {
      if (
        !/^[\w.-]+$/.test(item.id) ||
        ids.has(item.id) ||
        !tools.has(item.tool) ||
        !item.result ||
        guardScenarioTool({ toolName: item.tool, input: item.args }, scenario, plugin)
      )
        throw new Error('Invalid or unscoped synthetic fixture');
      ids.add(item.id);
      captures.push(item);
    }
    record({
      event: 'fixture_suite',
      count: captures.length,
      sha256: createHash('sha256').update(readFileSync(fixturePath)).digest('hex'),
    });
  }

  const executions = new Map<string, any>();
  api.on('tool_execution_start', (event: any) => executions.set(event.toolCallId, event));
  api.on('tool_execution_end', (event: any) => {
    record({ event: 'execution_result', toolName: event.toolName, result: event.result, isError: event.isError });
    const start = executions.get(event.toolCallId);
    if (
      start &&
      (tools.has(event.toolName) ||
        (event.toolName === 'bash' && !guardScenarioTool({ toolName: 'bash', input: start.args }, scenario, plugin)))
    )
      captures.push({
        id: `tool-${captures.length}-${event.toolName}`,
        tool: event.toolName,
        args: start.args,
        result: { ...event.result, isError: event.isError },
      });
    executions.delete(event.toolCallId);
  });
  api.on('session_start', async (_event: any, ctx: any) => {
    if (!ctx.hasUI) throw new Error('Interactive runtime required');
    await api.setActiveTools(activeTools);
    record({
      event: 'ready',
      hasUI: ctx.hasUI,
      ...provenance,
      tools: [...tools.keys()],
      activeTools,
      registeredTools: [...tools.keys()],
      expectedSurfaces: selected.surfaces,
      sdkComponents: Object.keys(api.pi).filter((key) => /Component|Markdown|Text|Theme|visibleWidth/.test(key)),
    });
  });
  api.on('tool_call', (event: any) => {
    let decision =
      mode === 'fixture'
        ? { block: true, reason: 'Fixture qualification cannot execute tools' }
        : guardScenarioTool(event, scenario, plugin);
    if (!decision && event.toolName === 'read') {
      try {
        const path = resolveShippedPath(plugin, relative(plugin, event.input.path));
        if (!guidance.includes(path)) decision = { block: true, reason: 'Guidance path changed after admission' };
      } catch {
        decision = { block: true, reason: 'Guidance path escaped selected installation' };
      }
    }
    record({ event: 'tool_call', toolName: event.toolName, input: event.input, blocked: Boolean(decision) });
    return decision;
  });
  api.on('tool_result', (event: any) =>
    record({ event: 'tool_result', toolName: event.toolName, isError: event.isError }),
  );
  api.on('context', (event: any) =>
    record({
      event: 'model_context',
      customTypes: event.messages
        .filter((message: any) => message.customType)
        .map((message: any) => message.customType),
    }),
  );
  api.on('message_end', (event: any) => {
    if (event.message.role === 'assistant') {
      record({ event: 'assistant_message', message: event.message });
      if (
        event.message.stopReason === 'stop' &&
        event.message.content.some((block: any) => block.type === 'text' && block.text.trim())
      )
        captures.push({ id: `message-${captures.length}`, message: event.message });
    }
  });
  for (const name of ['agent_start', 'agent_end', 'session_shutdown'])
    api.on(name, (_event: any, ctx: any) => record({ event: name, hasUI: ctx.hasUI }));
  api.registerCommand('marketplace-campaign-capture', {
    description: 'Capture actual workflow responses',
    handler: async (_args: string, ctx: any) => {
      if (!captures.length) throw new Error('No actual workflow or fixture results to capture');
      record({ event: 'capture_started', count: captures.length });
      writeFileSync(
        join(root, 'cases.json'),
        JSON.stringify(captures.map(({ id, tool }) => ({ id, tool: tool ?? 'assistant' }))),
        { mode: 0o600 },
      );
      writeFileSync(
        join(root, 'ready.json'),
        JSON.stringify({
          terminalColumns: process.stdout.columns,
          terminalRows: process.stdout.rows,
          ...provenance,
        }),
        { mode: 0o600 },
      );
      mkdirSync(join(root, 'frames'), { mode: 0o700, recursive: true });
      await ctx.ui.custom<void>((tui: any, _theme: any, _keys: any, done: any) => {
        let lastControl = '';
        let lines: string[] = [];
        let busy = false;
        const components = new Map<string, any>();
        const processControl = async () => {
          if (busy || !existsSync(join(root, 'control.json'))) return;
          const source = readFileSync(join(root, 'control.json'), 'utf8');
          if (source === lastControl) return;
          busy = true;
          lastControl = source;
          try {
            const control = JSON.parse(source);
            if (control.action === 'finish') {
              clearInterval(timer);
              done();
              return;
            }
            const item = captures.find((value) => value.id === control.case);
            if (
              !item ||
              typeof control.id !== 'string' ||
              !/^[\w.-]+$/.test(control.id) ||
              typeof control.expanded !== 'boolean' ||
              ![40, 76, 120, 153].includes(control.width) ||
              !['xcsh-dark', 'xcsh-light'].includes(control.theme) ||
              !['unicode', 'ascii', 'nerd'].includes(control.preset)
            )
              throw new Error('Invalid private capture control');
            await api.pi.setSymbolPreset(control.preset);
            if (!(await ctx.ui.setTheme(control.theme)).success) throw new Error('Appearance switch failed');
            let component = components.get(item.id);
            if (!component) {
              component = item.message
                ? new api.pi.AssistantMessageComponent(item.message, true)
                : new api.pi.ToolExecutionComponent(item.tool, item.args, {}, tools.get(item.tool), tui, process.cwd());
              if (item.result) {
                component.setArgsComplete();
                component.updateResult(item.result, false);
              }
              components.set(item.id, component);
            }
            component.setExpanded?.(control.expanded === true);
            component.stopAnimation?.();
            component.invalidate();
            const rendered = component.render(control.width);
            if (
              /SYNTHETIC_SECRET_SENTINEL|00D[A-Za-z0-9]{12,15}![A-Za-z0-9._-]{35,}/.test(
                Bun.stripANSI(rendered.join('\n')),
              )
            )
              throw new Error('Unsafe credential material in evidence');
            const capacity = Math.max(1, (process.stdout.rows ?? 45) - 2);
            const offset = Math.min(Math.max(0, control.scroll ?? 0), Math.max(0, rendered.length - capacity));
            lines = rendered.slice(offset, offset + capacity);
            writeFileSync(
              join(root, 'frames', `${control.id}.json`),
              JSON.stringify({
                ...control,
                tool: item.tool,
                resultIsError: Boolean(item.result?.isError),
                lines: control.scroll === undefined ? rendered : lines,
                viewport: { rows: lines, offset, totalLines: rendered.length, capacity },
                terminalColumns: process.stdout.columns,
                terminalRows: process.stdout.rows,
                ...provenance,
              }),
              { mode: 0o600 },
            );
            tui.requestRender();
            writeFileSync(join(root, 'ack.tmp'), JSON.stringify({ id: control.id }), { mode: 0o600 });
            renameSync(join(root, 'ack.tmp'), join(root, 'ack.json'));
          } finally {
            busy = false;
          }
        };
        const timer = setInterval(() => {
          void processControl().catch((error) => {
            record({ event: 'capture_error', message: String(error) });
            writeFileSync(join(root, 'error.json'), JSON.stringify({ message: String(error) }), { mode: 0o600 });
            clearInterval(timer);
            done();
          });
        }, 40);
        return {
          render: () => lines,
          invalidate() {},
          handleInput(input: string) {
            if (input === '\u001b') {
              clearInterval(timer);
              done();
            }
          },
        };
      });
    },
  });
  api.registerCommand('marketplace-campaign-exit', {
    description: 'End private acceptance',
    handler: async (_args: string, ctx: any) => ctx.shutdown(),
  });
  api.registerCommand('marketplace-campaign-appearance', {
    description: 'Set private capture appearance',
    handler: async (args: string, ctx: any) => {
      const [theme, preset] = args.trim().split(/\s+/);
      if (!['xcsh-dark', 'xcsh-light'].includes(theme) || !['unicode', 'ascii', 'nerd'].includes(preset))
        throw new Error('Invalid appearance');
      await api.pi.setSymbolPreset(preset);
      const result = await ctx.ui.setTheme(theme);
      record({ event: 'appearance', theme, preset, success: result.success });
      writeFileSync(join(root, 'appearance.json'), JSON.stringify({ theme, preset, success: result.success }), {
        mode: 0o600,
      });
    },
  });
}
