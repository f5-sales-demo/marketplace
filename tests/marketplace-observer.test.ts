import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import observe from '../scripts/observe-marketplace-campaign';

async function harness(
  mode: string,
  check: (state: any) => Promise<void>,
  prepare?: (plugin: string, scenario: string) => void,
) {
  const root = mkdtempSync(join(tmpdir(), 'marketplace-observer-'));
  const previous = { ...process.env };
  try {
    const plugin = join(root, 'plugin');
    mkdirSync(join(plugin, '.xcsh-plugin'), { recursive: true });
    writeFileSync(
      join(plugin, '.xcsh-plugin/plugin.json'),
      JSON.stringify({
        name: 'aws',
        version: '2.3.0',
        extensions: ['entry.ts'],
      }),
    );
    writeFileSync(
      join(plugin, 'entry.ts'),
      `export default function(api) {
      api.registerTool({ name: 'aws_sts_whoami', execute: async () => api.exec('aws', ['sts', 'get-caller-identity']) });
      api.registerCommand('identity', { handler: async (args, ctx) => { ctx.ui.notify(args, 'info'); return 'exact-result'; } });
      api.on('before_agent_start', async (_event, ctx) => { ctx.ui.setStatus('identity', 'synthetic'); api.sendMessage({customType:'identity', content:'synthetic', display:false}); return {message:{customType:'hint',content:'synthetic',display:false}}; });
    }`,
    );
    const scenario = join(root, 'scenario.json');
    writeFileSync(
      scenario,
      JSON.stringify({
        id: 'identity',
        calls: [{ tool: 'aws_sts_whoami', args: {} }],
        guidance: [],
        commands: [{ name: 'identity', args: 'reviewed' }],
      }),
    );
    const registry = join(root, 'registry.json');
    writeFileSync(
      registry,
      JSON.stringify({
        plugins: {
          'aws@synthetic': [{ installPath: plugin, version: '2.3.0' }],
        },
      }),
    );
    const fixtures = join(root, 'fixtures.json');
    writeFileSync(
      fixtures,
      JSON.stringify([
        {
          id: 'identity',
          tool: 'aws_sts_whoami',
          args: {},
          result: { content: [{ type: 'text', text: 'synthetic' }] },
        },
      ]),
    );
    const captureRoot = join(root, 'capture');
    Object.assign(process.env, {
      MARKETPLACE_CAMPAIGN_ROOT: captureRoot,
      MARKETPLACE_CAMPAIGN_PLUGIN: plugin,
      MARKETPLACE_CAMPAIGN_NAME: 'aws',
      MARKETPLACE_CAMPAIGN_SCENARIO: scenario,
      MARKETPLACE_CAMPAIGN_REGISTRY: registry,
      MARKETPLACE_CAMPAIGN_MODE: mode,
      MARKETPLACE_CAMPAIGN_FIXTURES: fixtures,
    });
    const handlers = new Map<string, any[]>();
    const commands = new Map<string, any>();
    const tools = new Map<string, any>();
    let executed = 0;
    const api = {
      pi: {
        VERSION: '23.9.3',
        ToolExecutionComponent: class {},
        AssistantMessageComponent: class {},
      },
      on: (name: string, handler: any) => handlers.set(name, [...(handlers.get(name) ?? []), handler]),
      registerTool: (tool: any) => tools.set(tool.name, tool),
      registerCommand: (name: string, command: any) => commands.set(name, command),
      exec: async () => {
        executed++;
        return 'executed';
      },
      sendMessage: () => {},
      setActiveTools: () => {},
    };
    prepare?.(plugin, scenario);
    await observe(api);
    await check({
      handlers,
      commands,
      tools,
      executed: () => executed,
      root: captureRoot,
    });
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
    rmSync(root, { recursive: true });
  }
}

const shellCommand = 'printf "%s\\n" "$QUERY"\n';
const shellArgs = {
  command: shellCommand,
  env: { QUERY: 'synthetic' },
  timeout: 20,
};
function prepareShell(plugin: string, path: string) {
  writeFileSync(join(plugin, 'commands.md'), `## inspect\n\n\`\`\`bash\n${shellCommand}\`\`\`\n`);
  const scenario = JSON.parse(readFileSync(path, 'utf8'));
  scenario.shellCalls = [
    {
      path: 'commands.md',
      section: 'inspect',
      sha256: createHash('sha256').update(shellCommand).digest('hex'),
      args: shellArgs,
    },
  ];
  writeFileSync(path, JSON.stringify(scenario));
}

test('reviewed built-in Bash is activated, guarded and journals actual full results', async () => {
  await harness(
    'service',
    async ({ handlers, commands, root }) => {
      await handlers.get('session_start')[0]({}, { hasUI: true });
      expect(
        await handlers.get('tool_call')[0]({
          toolName: 'bash',
          input: shellArgs,
        }),
      ).toBeUndefined();
      expect(
        await handlers.get('tool_call')[0]({
          toolName: 'task',
          input: shellArgs,
        }),
      ).toMatchObject({ block: true });
      handlers.get('tool_execution_start')[0]({
        toolName: 'bash',
        toolCallId: 'shell',
        args: shellArgs,
      });
      const result = {
        content: [{ type: 'text', text: 'synthetic complete result' }],
        details: { exitCode: 0 },
      };
      handlers.get('tool_execution_end')[0]({
        toolName: 'bash',
        toolCallId: 'shell',
        result,
        isError: false,
      });
      const events = readFileSync(join(root, 'events.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(events.find((e) => e.event === 'ready').activeTools).toContain('bash');
      expect(events.find((e) => e.event === 'execution_result').result).toEqual(result);
      await commands.get('marketplace-campaign-capture').handler('', { ui: { custom: async () => {} } });
      expect(JSON.parse(readFileSync(join(root, 'cases.json'), 'utf8'))).toEqual([{ id: 'tool-0-bash', tool: 'bash' }]);
    },
    prepareShell,
  );
});

test('fixture mode denies even reviewed built-in Bash and startup rejects changed shipped source', async () => {
  await harness(
    'fixture',
    async ({ handlers }) => {
      expect(
        await handlers.get('tool_call')[0]({
          toolName: 'bash',
          input: shellArgs,
        }),
      ).toMatchObject({ block: true });
    },
    prepareShell,
  );
  await expect(
    harness(
      'service',
      async () => {},
      (plugin, scenario) => {
        prepareShell(plugin, scenario);
        writeFileSync(join(plugin, 'commands.md'), '## inspect\n\n```bash\nfalse\n```\n');
      },
    ),
  ).rejects.toThrow('changed');
});

test('fixture observer never executes an admitted tool or plugin command and suppresses lifecycle', async () => {
  await harness('fixture', async ({ handlers, tools, commands, executed }) => {
    expect(handlers.has('before_agent_start')).toBe(false);
    expect(() => tools.get('aws_sts_whoami').execute('call', {})).toThrow('cannot execute tools');
    await expect(commands.get('identity').handler('reviewed', {})).rejects.toThrow('reviewed scenario commands');
    expect(
      await handlers.get('tool_call')[0]({
        toolName: 'aws_sts_whoami',
        input: {},
      }),
    ).toMatchObject({
      block: true,
    });
    expect(executed()).toBe(0);
  });
});

test('service observer preserves normal results and records commands, hidden messages and lifecycle UI', async () => {
  await harness('service', async ({ handlers, tools, commands, executed, root }) => {
    const ctx = {
      hasUI: true,
      ui: { notify: () => {}, setStatus: () => {} },
    };
    expect(await tools.get('aws_sts_whoami').execute('call', {})).toBe('executed');
    expect(executed()).toBe(1);
    expect(() => tools.get('aws_sts_whoami').execute('call', { profile: 'unexpected' })).toThrow('exact arguments');
    await expect(commands.get('identity').handler('unreviewed', ctx)).rejects.toThrow('reviewed scenario commands');
    expect(await commands.get('identity').handler('reviewed', ctx)).toBe('exact-result');
    expect(await handlers.get('before_agent_start')[0]({}, ctx)).toMatchObject({
      message: { display: false, content: 'synthetic' },
    });
    const events = readFileSync(join(root, 'events.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(events.some((e) => e.event === 'plugin_ui_dispatch' && e.method === 'notify')).toBe(true);
    expect(events.some((e) => e.event === 'plugin_command_end' && e.result === 'exact-result')).toBe(true);
    expect(events.some((e) => e.event === 'plugin_message_dispatch' && e.args[0].display === false)).toBe(true);
    expect(events.some((e) => e.event === 'plugin_dispatch' && e.message.display === false)).toBe(true);
  });
});
