import { beforeAll, describe, expect, it } from 'bun:test';

interface ToolDef {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  execute: (
    id: string,
    params: Record<string, unknown>,
    signal: undefined,
    update: undefined,
    ctx: { cwd: string },
  ) => Promise<{ content: { type: string; text: string }[]; isError?: boolean; details?: unknown }>;
}

interface ServiceStatusDef {
  name: string;
  check: () => Promise<{ state: string; hint?: string }>;
  fix?: { prompt: string; command: string[] };
}

interface MockPi {
  setLabel: (label: string) => void;
  logger: { debug: (...args: unknown[]) => void };
  typebox: typeof import('@sinclair/typebox');
  pi: Record<string, unknown>;
  registerTool: (tool: ToolDef) => void;
  registerServiceStatus: (status: ServiceStatusDef) => void;
  on: (event: string, handler: (...args: unknown[]) => Promise<unknown>) => void;
}

type FactoryFn = (pi: MockPi) => Promise<void>;

async function buildMockPi(): Promise<{
  pi: MockPi;
  tools: ToolDef[];
  serviceStatuses: ServiceStatusDef[];
  events: Record<string, Array<(...args: unknown[]) => Promise<unknown>>>;
}> {
  const tools: ToolDef[] = [];
  const serviceStatuses: ServiceStatusDef[] = [];
  const events: Record<string, Array<(...args: unknown[]) => Promise<unknown>>> = {};
  const pi: MockPi = {
    setLabel() {},
    logger: { debug() {} },
    typebox: await import('@sinclair/typebox'),
    pi: {},
    registerTool(tool: ToolDef) {
      tools.push(tool);
    },
    registerServiceStatus(status: ServiceStatusDef) {
      serviceStatuses.push(status);
    },
    on(event: string, handler: (...args: unknown[]) => Promise<unknown>) {
      if (!events[event]) events[event] = [];
      events[event].push(handler);
    },
  };
  return { pi, tools, serviceStatuses, events };
}

describe('GitHub ExtensionFactory integration', () => {
  let factory: FactoryFn;

  beforeAll(async () => {
    const mod = await import('../src/index');
    factory = mod.default as FactoryFn;
  });

  it('exports a default function (ExtensionFactory)', () => {
    expect(typeof factory).toBe('function');
  });

  it('factory executes without throwing when gh is available', async () => {
    const { pi, tools, serviceStatuses, events } = await buildMockPi();

    await factory(pi);

    // gh CLI should be available in dev environment
    const whichResult = Bun.spawnSync(['which', 'gh']);
    if (whichResult.exitCode !== 0) {
      // gh not installed — factory should skip tool registration
      expect(tools).toHaveLength(0);
      return;
    }

    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'gh_exec',
      'gh_help',
      'gh_issue_view',
      'gh_pr_checkout',
      'gh_pr_diff',
      'gh_pr_push',
      'gh_pr_view',
      'gh_repo_view',
      'gh_run_watch',
      'gh_search_issues',
      'gh_search_prs',
    ]);

    const labels = tools.map((t) => t.label).sort();
    expect(labels).toEqual([
      'GitHub CLI Execute',
      'GitHub CLI Help',
      'GitHub Issue',
      'GitHub Issue Search',
      'GitHub PR',
      'GitHub PR Checkout',
      'GitHub PR Diff',
      'GitHub PR Push',
      'GitHub PR Search',
      'GitHub Repo',
      'GitHub Run Watch',
    ]);

    // Service status registered
    expect(serviceStatuses).toHaveLength(1);
    expect(serviceStatuses[0].name).toBe('GitHub');

    // session_start event registered
    expect(events.session_start).toHaveLength(1);
  });

  it('each registered tool has required ToolDefinition fields', async () => {
    const { pi, tools } = await buildMockPi();
    await factory(pi);

    for (const tool of tools) {
      expect(typeof tool.name).toBe('string');
      expect(tool.name.length).toBeGreaterThan(0);
      expect(typeof tool.label).toBe('string');
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.parameters).toBeTruthy();
      expect(typeof tool.execute).toBe('function');
    }
  });

  it('service status check returns valid state', async () => {
    const { pi, serviceStatuses } = await buildMockPi();
    await factory(pi);

    if (serviceStatuses.length === 0) return; // gh not installed

    const status = await serviceStatuses[0].check();
    expect(['connected', 'unauthenticated', 'unavailable']).toContain(status.state);
  });

  it('session_start hook runs without throwing', async () => {
    const { pi, events } = await buildMockPi();
    await factory(pi);

    const handler = events.session_start?.[0];
    if (!handler) return; // gh not installed

    await expect(handler({}, { cwd: '/tmp' })).resolves.toBeUndefined();
  });
});
