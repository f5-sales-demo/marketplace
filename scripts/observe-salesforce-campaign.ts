import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function currentSalesforceRows(markdown: string) {
  const ids = new Set<string>();
  return markdown
    .split('## Retired surfaces')[0]
    .split('\n')
    .filter((line) => line.startsWith('| salesforce.'))
    .map((line) => {
      const [, rawId, rawStatus] = line.split('|');
      const id = rawId.trim();
      if (ids.has(id)) throw new Error(`Duplicate current ID: ${id}`);
      ids.add(id);
      return { id, status: rawStatus.trim() };
    });
}

export function campaignGuidance(plugin: string) {
  return ['agents/cli-operator.md', 'skills/salesforce-index/SKILL.md', 'skills/salesforce-auth/SKILL.md'].map((path) =>
    resolve(plugin, path),
  );
}

export function campaignTools(mode = 'service') {
  if (!['service', 'guidance'].includes(mode)) throw new Error('Invalid campaign mode');
  return mode === 'guidance' ? ['read'] : ['read', 'sf_org_display', 'sf_query', 'sf_describe', 'sf_pipeline_report'];
}

export function guardCampaignTool(event: any, guidance: string[], guidanceOnly = false) {
  const input = event.input ?? {};
  const allowed =
    event.toolName === 'read'
      ? guidance.includes(resolve(input.path ?? ''))
      : guidanceOnly
        ? false
        : event.toolName === 'sf_query'
          ? typeof input.query === 'string' && /^\s*SELECT\b/i.test(input.query)
          : ['sf_org_display', 'sf_describe', 'sf_pipeline_report'].includes(event.toolName);
  if (!allowed)
    return {
      block: true,
      reason: 'This acceptance session permits only shipped guidance reads and typed read-only Salesforce tools.',
    };
}

export function observeHint(handler: any, record: (value: any) => void) {
  return async (event: any, ctx: any) => {
    const result = await handler(event, ctx);
    record({
      event: 'salesforce_hint_dispatch',
      hasUI: ctx.hasUI === true,
      returned: Boolean(result?.message),
      customType: result?.message?.customType,
      display: result?.message?.display,
      content: result?.message?.content,
    });
    return result;
  };
}

export function campaignProvenance(binary: string, runtimeVersion: string, manifest: { version?: string }) {
  if (!manifest.version) throw new Error('Installed Salesforce plugin version is required');
  return { binary, runtimeVersion, pluginVersion: manifest.version };
}

// A read-only observer of the published runtime. It does not manually dispatch lifecycle handlers.
export default async function observeSalesforceCampaign(api: any) {
  const root = process.env.SALESFORCE_CAMPAIGN_ROOT;
  const plugin = process.env.SALESFORCE_CAMPAIGN_PLUGIN;
  if (!root || !plugin || process.platform !== 'darwin')
    throw new Error('Explicit private paths and corporate MacBook are required');
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const record = (value: any) =>
    appendFileSync(join(root, 'events.jsonl'), JSON.stringify({ time: Date.now(), ...value }) + '\n', { mode: 0o600 });
  const guidance = campaignGuidance(plugin);
  const activeTools = campaignTools(process.env.SALESFORCE_CAMPAIGN_MODE);
  const guidanceOnly = activeTools.length === 1;
  const manifest = JSON.parse(readFileSync(join(plugin, '.xcsh-plugin/plugin.json'), 'utf8'));
  const provenance = campaignProvenance(process.execPath, api.pi.VERSION, manifest);
  const tools = new Map<string, any>();
  const proxy = new Proxy(api, {
    get(target, key) {
      if (key === 'on')
        return (name: string, handler: any) =>
          target.on(name, name === 'before_agent_start' ? observeHint(handler, record) : handler);
      if (key === 'registerTool')
        return (tool: any) => {
          tools.set(tool.name, tool);
          target.registerTool(tool);
        };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  await (await import(pathToFileURL(join(plugin, 'src/index.ts')).href)).default(proxy);
  const captures: any[] = [];
  const executions = new Map<string, any>();
  api.on('tool_execution_start', (event: any) => executions.set(event.toolCallId, event));
  api.on('tool_execution_end', (event: any) => {
    const start = executions.get(event.toolCallId);
    if (start && tools.has(event.toolName))
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
      sdkComponents: Object.keys(api.pi).filter((key) => /Component|Markdown|Text|Theme|visibleWidth/.test(key)),
    });
  });
  api.on('tool_call', (event: any) => {
    const decision = guardCampaignTool(event, guidance, guidanceOnly);
    record({ event: 'tool_call', toolName: event.toolName, input: event.input, blocked: Boolean(decision) });
    return decision;
  });
  api.on('tool_result', (event: any) =>
    record({ event: 'tool_result', toolName: event.toolName, isError: event.isError }),
  );
  api.on('context', (event: any) =>
    record({
      event: 'model_context',
      hintCount: event.messages.filter((message: any) => message.customType === 'salesforce_hint').length,
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
  api.registerCommand('salesforce-campaign-capture', {
    description: 'Capture actual workflow responses',
    handler: async (_args: string, ctx: any) => {
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
              join(root, 'frames', control.id + '.json'),
              JSON.stringify({
                ...control,
                lines: control.scroll === undefined ? rendered : lines,
                viewport: { rows: lines, offset, totalLines: rendered.length, capacity },
                terminalColumns: process.stdout.columns,
                terminalRows: process.stdout.rows,
                ...provenance,
              }),
              { mode: 0o600 },
            );
            tui.requestRender();
            writeFileSync(join(root, 'ack.json'), JSON.stringify({ id: control.id }), { mode: 0o600 });
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
  api.registerCommand('salesforce-campaign-exit', {
    description: 'End private acceptance',
    handler: async (_args: string, ctx: any) => ctx.shutdown(),
  });
  api.registerCommand('salesforce-campaign-appearance', {
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
