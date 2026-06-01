import { beforeAll, describe, expect, it } from 'bun:test';
import type { SfToolDetails } from '../../src/tools/shared';

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
  ) => Promise<{ content: { type: string; text: string }[]; isError?: boolean; details: SfToolDetails }>;
}

interface MockPi {
  setLabel: (label: string) => void;
  logger: { debug: (...args: unknown[]) => void };
  typebox: typeof import('@sinclair/typebox');
  pi: Record<string, unknown>;
  registerTool: (tool: ToolDef) => void;
  on: (event: string, handler: (...args: unknown[]) => Promise<unknown>) => void;
}

type FactoryFn = (pi: MockPi) => Promise<void>;

async function buildMockPi(overrides?: Partial<MockPi>): Promise<{
  pi: MockPi;
  tools: ToolDef[];
  events: Record<string, Array<(...args: unknown[]) => Promise<unknown>>>;
}> {
  const tools: ToolDef[] = [];
  const events: Record<string, Array<(...args: unknown[]) => Promise<unknown>>> = {};
  const pi: MockPi = {
    setLabel() {},
    logger: { debug() {} },
    typebox: await import('@sinclair/typebox'),
    pi: {},
    registerTool(tool: ToolDef) {
      tools.push(tool);
    },
    on(event: string, handler: (...args: unknown[]) => Promise<unknown>) {
      if (!events[event]) events[event] = [];
      events[event].push(handler);
    },
    ...overrides,
  };
  return { pi, tools, events };
}

describe('ExtensionFactory integration', () => {
  let factory: FactoryFn;

  beforeAll(async () => {
    const mod = await import('../../src/index');
    factory = mod.default as FactoryFn;
  });

  it('exports a default function (ExtensionFactory)', () => {
    expect(typeof factory).toBe('function');
  });

  it('factory executes without throwing when sf is available', async () => {
    const { pi, tools, events } = await buildMockPi({
      pi: { loadProfile: async () => ({ givenName: 'Test' }) },
    });

    await factory(pi);

    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(['sf_org_display', 'sf_pipeline_report', 'sf_query', 'sf_setup']);

    const labels = tools.map((t) => t.label).sort();
    expect(labels).toEqual([
      'Salesforce Org Display',
      'Salesforce Pipeline Report',
      'Salesforce Query',
      'Salesforce Setup',
    ]);

    expect(events.before_agent_start).toHaveLength(1);
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

  it('sf_setup check action calls real sf CLI', async () => {
    const { pi, tools } = await buildMockPi();
    await factory(pi);

    const setupTool = tools.find((t) => t.name === 'sf_setup');
    expect(setupTool).toBeDefined();

    const result = await setupTool?.execute('t1', { action: 'check' }, undefined, undefined, { cwd: '/tmp' });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    if (!result.isError) {
      expect(result.content[0].text).toContain('sf is installed');
    }
    expect(result.details.tool).toBe('sf_setup');
    expect(result.details.action).toBe('check');
  });

  it('sf_setup status action returns org list', async () => {
    const { pi, tools } = await buildMockPi({
      pi: { loadProfile: async () => ({ givenName: 'Test', familyName: 'User' }) },
    });
    await factory(pi);

    const setupTool = tools.find((t) => t.name === 'sf_setup');
    const result = await setupTool?.execute('t1', { action: 'status' }, undefined, undefined, { cwd: '/tmp' });

    expect(result.content[0].type).toBe('text');
    expect(result.details.tool).toBe('sf_setup');
    if (!result.isError) {
      const text = result.content[0].text;
      expect(text.includes('Alias') || text.includes('No authenticated orgs')).toBe(true);
    }
  });

  it('sf_query executes a real SOQL query', async () => {
    const { pi, tools } = await buildMockPi();
    await factory(pi);

    const queryTool = tools.find((t) => t.name === 'sf_query');
    const result = await queryTool?.execute(
      't1',
      { query: 'SELECT Id, Name FROM Account LIMIT 1' },
      undefined,
      undefined,
      { cwd: '/tmp' },
    );

    expect(result.content[0].type).toBe('text');
    expect(result.details.tool).toBe('sf_query');

    if (result.isError) {
      expect(result.details.errorType).toBeDefined();
      expect(
        ['auth_required', 'session_expired', 'no_default_org', 'exec_error'].includes(result.details.errorType ?? ''),
      ).toBe(true);
    } else {
      expect(result.details.queryResult).toBeDefined();
      expect(typeof result.details.queryResult?.totalSize).toBe('number');
    }
  });

  it('sf_org_display returns structured org data or structured error', async () => {
    const { pi, tools } = await buildMockPi();
    await factory(pi);

    const orgDisplayTool = tools.find((t) => t.name === 'sf_org_display');
    const result = await orgDisplayTool?.execute('t1', {}, undefined, undefined, { cwd: '/tmp' });

    expect(result.content[0].type).toBe('text');
    expect(result.details.tool).toBe('sf_org_display');

    if (!result.isError) {
      expect(result.details.orgs).toBeDefined();
      const orgs = result.details.orgs ?? [];
      expect(orgs.length).toBeGreaterThan(0);
      const org = orgs[0];
      expect(typeof org.username).toBe('string');
      expect(typeof org.orgId).toBe('string');
      expect(typeof org.instanceUrl).toBe('string');
      expect((org as Record<string, unknown>).accessToken).toBeUndefined();
      expect((org as Record<string, unknown>).refreshToken).toBeUndefined();
    } else {
      expect(result.details.errorType).toBeDefined();
    }
  });

  it('before_agent_start hook returns hint or undefined', async () => {
    const { pi, events } = await buildMockPi();
    await factory(pi);

    const handler = events.before_agent_start?.[0];
    expect(handler).toBeDefined();

    const result = (await handler()) as { message?: { customType: string; display: boolean } } | undefined;
    if (result !== undefined) {
      expect(result.message).toBeDefined();
      expect(result.message?.customType).toBe('salesforce_hint');
      expect(result.message?.display).toBe(false);
    }
  });

  it('session_start hook runs without throwing', async () => {
    const { pi, events } = await buildMockPi();
    await factory(pi);

    const handler = events.session_start?.[0];
    expect(handler).toBeDefined();

    await expect(handler({}, { cwd: '/tmp' })).resolves.toBeUndefined();
  });

  it('registers salesforce:setup command', async () => {
    const commands: { name: string; description?: string }[] = [];
    const { pi } = await buildMockPi();

    // Add registerCommand to the mock
    (pi as Record<string, unknown>).registerCommand = (name: string, opts: { description?: string }) => {
      commands.push({ name, description: opts.description });
    };

    await factory(pi);

    const setup = commands.find((c) => c.name === 'salesforce:setup');
    expect(setup).toBeDefined();
    expect(setup?.description).toContain('Install');
  });
});
