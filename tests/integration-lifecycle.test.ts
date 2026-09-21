import { describe, expect, it, spyOn } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  call,
  canonicalMeetingId,
  deriveAwareness,
  invitationToZoomMtg,
  parseZoomCommand,
} from '../plugins/zoom/extensions/integration';

type Definition = {
  id: string;
  setup?: {
    pluginDependencies: string[];
    requiredEnvironment: string[];
    profileFields: string[];
    steps: Array<{ kind: string; argv: string[]; timeoutMs: number }>;
    verification: Array<{ argv: string[]; timeoutMs: number }>;
  };
  probe(): Promise<{ state: string; reason?: string; retryAfterMs?: number; value?: unknown }>;
  profile?(value: unknown): { facts: Record<string, unknown>; observations: unknown[] };
};
type ToolDefinition = {
  name: string;
  label: string;
  parameters: unknown;
  execute: (...args: unknown[]) => Promise<unknown>;
};
type Definitions = Definition[] & { tools: ToolDefinition[] };

async function definitionsFor(plugin: string): Promise<Definitions> {
  const spawn = spyOn(Bun, 'spawnSync').mockReturnValue({ exitCode: 1 } as ReturnType<typeof Bun.spawnSync>);
  const definitions: Definition[] = [];
  const tools: ToolDefinition[] = [];
  const handlers: Record<string, unknown[]> = {};
  const typeFactory = new Proxy(
    {
      Object(shape: Record<string, unknown>) {
        return { type: 'object', properties: shape };
      },
      String() {
        return { type: 'string' };
      },
      Unknown() {
        return {};
      },
      Record(_key: unknown, value: unknown) {
        return { type: 'object', additionalProperties: value };
      },
    },
    { get: (target, property) => Reflect.get(target, property) ?? (() => ({})) },
  );
  const pi = {
    setLabel() {},
    logger: { debug() {} },
    typebox: { Type: typeFactory },
    pi: {},
    personProfile: { get: async () => ({ facts: {} }) },
    integrations: {
      register(definition: Definition) {
        definitions.push(definition);
        return { get: async () => ({ state: 'setup_required' }) };
      },
    },
    registerFlag() {},
    getFlag() {
      return false;
    },
    registerTool(definition: ToolDefinition) {
      tools.push(definition);
    },
    on(event: string, handler: unknown) {
      const eventHandlers = handlers[event] ?? [];
      eventHandlers.push(handler);
      handlers[event] = eventHandlers;
    },
  };
  const entrypoint =
    {
      cloudstatus: 'extensions/regional-edge-guard.ts',
      devcontainer: 'extensions/integration.ts',
      firecrawl: 'extensions/integration.ts',
      herdr: 'extensions/integration.ts',
      terraform: 'extensions/integration.ts',
      xorg: 'extensions/integration.ts',
      zoom: 'extensions/integration.ts',
    }[plugin] ?? 'src/index.ts';
  const module = await import(`../plugins/${plugin}/${entrypoint}`);
  await module.default(pi);
  spawn.mockRestore();
  return Object.assign(definitions, { tools });
}

describe('provider integration lifecycle', () => {
  it('keeps the Zoom controller on documented generic xorgctl calls', async () => {
    expect(canonicalMeetingId('123 456-789')).toBe('123456789');
    expect(() => canonicalMeetingId('1234')).toThrow('9 to 16');
    expect(parseZoomCommand('123 456 789').action).toBe('join');
    expect(invitationToZoomMtg('https://f5.zoom.us/j/123456789?pwd=secret')).toBe(
      'zoommtg://f5.zoom.us/join?action=join&confno=123456789&pwd=secret',
    );
    const source = await readFile(
      join(import.meta.dir, '..', 'plugins', 'zoom', 'extensions', 'integration.ts'),
      'utf8',
    );
    expect(source).not.toContain('app", "act');
    const spawn = spyOn(Bun, 'spawnSync').mockReturnValue({
      exitCode: 0,
      stdout: new TextEncoder().encode('joined'),
      stderr: new Uint8Array(),
    } as ReturnType<typeof Bun.spawnSync>);
    try {
      expect(call('join', ['https://zoom.us/j/123456789?pwd=secret']).output).toBe('joined');
      expect(spawn).toHaveBeenCalledWith([
        'xorgctl',
        '--session',
        'desktop',
        '--json',
        'app',
        'launch',
        '--params',
        JSON.stringify({
          argv: ['zoom', 'zoommtg://zoom.us/join?action=join&confno=123456789&pwd=secret'],
        }),
      ]);
    } finally {
      spawn.mockRestore();
    }
  });
  it('keeps Zoom-specific implementation out of the Xorg substrate', async () => {
    const root = join(import.meta.dir, '..', 'plugins', 'xorg');
    const visit = async (directory: string): Promise<string[]> => {
      const entries = await readdir(directory, { withFileTypes: true });
      return (
        await Promise.all(
          entries.map(async (entry) =>
            entry.isDirectory() ? visit(join(directory, entry.name)) : [join(directory, entry.name)],
          ),
        )
      ).flat();
    };
    for (const file of await visit(root)) {
      if (!file.endsWith('.py') && !file.endsWith('.ts')) continue;
      expect((await readFile(file, 'utf8')).toLowerCase()).not.toContain('zoom');
    }
  });

  it('scopes AT-SPI observations to PIDs visible in the selected Xorg session', async () => {
    const root = join(import.meta.dir, '..', 'plugins', 'xorg', 'scripts', 'xorgctl_lib');
    const dump = await readFile(join(root, 'atspi_dump.py'), 'utf8');
    const worker = await readFile(join(root, 'worker.py'), 'utf8');
    expect(dump).toContain('node.get_process_id()');
    expect(worker).toContain("item.get('pid') in visible_pids");
    expect(worker).toContain("'session_pid_filter':sorted(visible_pids)");
  });
  it('declares native installer argv for macOS, Linux, and Windows', async () => {
    for (const [plugin, exportName, expectedWindowsId] of [
      ['aws', 'awsInstallArgv', 'Amazon.AWSCLI'],
      ['azure', 'azureInstallArgv', 'Microsoft.AzureCLI'],
      ['gcloud', 'gcloudInstallArgv', 'Google.CloudSDK'],
      ['github', 'githubInstallArgv', 'GitHub.cli'],
      ['gitlab', 'gitlabInstallArgv', 'GitLab.glab'],
      ['terraform', 'terraformInstallArgv', 'Hashicorp.Terraform'],
    ] as const) {
      const entrypoint = plugin === 'terraform' ? 'extensions/integration.ts' : 'src/index.ts';
      const module = await import(`../plugins/${plugin}/${entrypoint}`);
      const installArgv = module[exportName] as (platform: string) => string[];
      expect(installArgv('darwin')[0]).toBe('brew');
      expect(installArgv('linux')).toEqual(expect.arrayContaining(['apt-get']));
      expect(installArgv('win32')).toEqual(['winget', 'install', '--exact', '--id', expectedWindowsId]);
    }
  });

  it('registers exactly the manifest-declared provider integrations', async () => {
    for (const [plugin, ids] of [
      ['aws', ['aws']],
      ['azure', ['azure']],
      ['gcloud', ['gcloud']],
      ['github', ['github', 'github_email']],
      ['gitlab', ['gitlab']],
      ['salesforce', ['salesforce']],
    ] as const) {
      expect((await definitionsFor(plugin)).map((definition) => definition.id)).toEqual(ids);
    }
  });

  it('registers every runtime integration declared by the marketplace manifests', async () => {
    for (const [plugin, ids] of [
      ['asm-migration', ['asm_migration']],
      ['aws', ['aws']],
      ['azure', ['azure']],
      ['cloudstatus', ['cloudstatus']],
      ['devcontainer', ['devcontainer']],
      ['firecrawl', ['firecrawl']],
      ['gcloud', ['gcloud']],
      ['github', ['github', 'github_email']],
      ['gitlab', ['gitlab']],
      ['herdr', ['herdr']],
      ['kvm', ['kvm']],
      ['platform', ['platform']],
      ['salesforce', ['salesforce']],
      ['terraform', ['terraform']],
      ['xorg', ['xorg']],
      ['zoom', ['zoom']],
    ] as const) {
      expect((await definitionsFor(plugin)).map((definition) => definition.id)).toEqual(ids);
    }
  });

  it('registers callable Xorg and Zoom tools through the xcsh extension API', async () => {
    expect((await definitionsFor('xorg')).tools.map((tool) => tool.name)).toEqual(['xorg_desktop']);
    expect((await definitionsFor('zoom')).tools.map((tool) => tool.name)).toEqual(['zoom_meeting']);
  });

  it('preserves arbitrary documented xorgctl parameters for tool calls', async () => {
    const [tool] = (await definitionsFor('xorg')).tools;
    expect(tool.parameters).toMatchObject({
      properties: { params: { type: 'object', additionalProperties: {} } },
    });
  });

  it('pins Zoom controls to the owned desktop UAT session', async () => {
    const source = await readFile(
      join(import.meta.dir, '..', 'plugins', 'zoom', 'extensions', 'integration.ts'),
      'utf8',
    );
    expect(source).toContain("const UAT_SESSION = 'desktop'");
    expect(source).toContain("'--session',");
  });

  it('derives normalized meeting awareness without guessing missing states', () => {
    expect(
      deriveAwareness(
        [
          { name: 'Participants' },
          { name: 'Unmute' },
          { name: 'Start Video' },
          { name: 'Share Screen' },
          { name: 'Lower Hand' },
        ],
        [{ id: 7, pid: 42, title: 'Zoom Meeting' }],
      ),
    ).toMatchObject({ meeting: 'in_meeting', audio: 'muted', video: 'off', share: 'off', hand: 'raised' });
    expect(deriveAwareness([], []).meeting).toBe('unknown');
  });

  it('declares Xorg and Zoom extension entrypoints where xcsh loads them', async () => {
    for (const plugin of ['xorg', 'zoom']) {
      const manifest = JSON.parse(
        await readFile(join(import.meta.dir, '..', 'plugins', plugin, '.xcsh-plugin', 'plugin.json'), 'utf8'),
      ) as { extensions?: string[] };
      expect(manifest.extensions).toEqual(['extensions/integration.ts']);
    }
  });

  it('declares immutable argv arrays and environment names without values', async () => {
    for (const plugin of ['aws', 'azure', 'gcloud', 'github', 'gitlab', 'salesforce']) {
      const definitions = await definitionsFor(plugin);
      const plan = definitions.find((definition) => definition.setup)?.setup;
      expect(plan).toBeDefined();
      if (!plan) throw new Error(`${plugin} did not declare a setup plan`);
      expect(plan.steps.every((step) => Array.isArray(step.argv) && step.argv.length > 0)).toBe(true);
      expect(plan.requiredEnvironment.every((name) => /^[A-Z_][A-Z0-9_]*$/.test(name))).toBe(true);
      expect(JSON.stringify(plan)).not.toMatch(/token=[^"\s]+|password=[^"\s]+|secret=[^"\s]+/i);
    }
  });

  it('keeps non-human principals as account associations only', async () => {
    const [aws] = await definitionsFor('aws');
    if (!aws.profile) throw new Error('AWS did not declare a profile projection');
    const projection = aws.profile({
      Account: '123456789012',
      Arn: 'arn:aws:sts::123456789012:assumed-role/ci/job',
    });
    expect(projection.facts.accounts).toEqual([
      {
        provider: 'aws',
        identifier: 'arn:aws:sts::123456789012:assumed-role/ci/job',
        principalType: 'role',
        accountId: '123456789012',
      },
    ]);
    expect(projection.facts.email).toBeUndefined();
    expect(projection.facts.givenName).toBeUndefined();

    const [salesforce] = await definitionsFor('salesforce');
    if (!salesforce.profile) throw new Error('Salesforce did not declare a profile projection');
    const automated = salesforce.profile({
      userId: '005000000000001',
      username: 'automation@example.com',
      userType: 'AutomatedProcess',
      instanceUrl: '<instance-url>',
      collectedAt: '2026-01-01T00:00:00.000Z',
      managerName: 'Must Not Escape',
      discoveredRole: 'bot',
    });
    expect(automated.facts.accounts).toEqual([
      {
        provider: 'salesforce',
        identifier: '005000000000001',
        principalType: 'service',
        accountId: '<instance-url>',
        username: 'automation@example.com',
      },
    ]);
    expect(automated.facts.identifiers).toBeUndefined();
    expect(automated.facts.manager).toBeUndefined();
    expect(automated.facts.role).toBeUndefined();
  });

  it('uses exact provider argv and propagates retry headers without extra probes', async () => {
    for (const [plugin, integrationId, executable, probeArgv] of [
      ['aws', 'aws', 'aws', ['aws', 'sts', 'get-caller-identity', '--output', 'json']],
      ['azure', 'azure', 'az', ['az', 'account', 'show', '--output', 'json']],
      ['gcloud', 'gcloud', 'gcloud', ['gcloud', 'auth', 'list', '--filter=status:ACTIVE', '--format=json']],
      ['github', 'github', 'gh', ['gh', 'api', 'user']],
      ['gitlab', 'gitlab', 'glab', ['glab', 'api', 'user']],
      ['salesforce', 'salesforce', 'sf', ['sf', 'org', 'display', '--json']],
    ] as const) {
      const definition = (await definitionsFor(plugin)).find((candidate) => candidate.id === integrationId);
      if (!definition) throw new Error(`${plugin} did not register ${integrationId}`);
      const calls: string[][] = [];
      const spawn = spyOn(Bun, 'spawnSync').mockImplementation((argv) => {
        calls.push([...argv] as string[]);
        if (calls.length === 1) return { exitCode: 0 } as ReturnType<typeof Bun.spawnSync>;
        return {
          exitCode: 1,
          stdout: new Uint8Array(),
          stderr: new TextEncoder().encode('HTTP 429\nRetry-After: 120'),
        } as ReturnType<typeof Bun.spawnSync>;
      });
      try {
        expect(await definition.probe()).toEqual({
          state: 'rate_limited',
          reason: 'rate_limited',
          retryAfterMs: 120_000,
        });
        expect(calls).toEqual([[process.platform === 'win32' ? 'where' : 'which', executable], [...probeArgv]]);
      } finally {
        spawn.mockRestore();
      }
    }
  });
});
