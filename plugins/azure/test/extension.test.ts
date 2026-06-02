import { beforeAll, describe, expect, it } from 'bun:test';

const mockTypebox = {
  Type: {
    Object: (s: unknown) => s,
    String: (o?: unknown) => ({ type: 'string', ...((o as object) ?? {}) }),
    Boolean: (o?: unknown) => ({ type: 'boolean', ...((o as object) ?? {}) }),
    Optional: (s: unknown) => ({ optional: true, ...((s as object) ?? {}) }),
    Array: (i: unknown, o?: unknown) => ({ type: 'array', items: i, ...((o as object) ?? {}) }),
    Union: (s: unknown[]) => ({ union: s }),
    Literal: (v: string) => ({ const: v }),
  },
};

function baseMockPi(overrides?: Record<string, unknown>) {
  return {
    setLabel() {},
    logger: { debug() {} },
    registerCommand() {},
    registerServiceStatus() {},
    registerTool() {},
    on() {},
    typebox: mockTypebox,
    ...overrides,
  };
}

describe('Azure Status extension', () => {
  let factory: (pi: unknown) => Promise<void>;

  beforeAll(async () => {
    const mod = await import('../src/index');
    factory = mod.default as typeof factory;
  });

  it('exports a default factory function', () => {
    expect(typeof factory).toBe('function');
  });

  it('always registers azure:setup command', async () => {
    const commands: Array<{ name: string }> = [];
    const mockPi = baseMockPi({
      registerCommand(name: string) {
        commands.push({ name });
      },
    });
    await factory(mockPi);
    expect(commands.find((c) => c.name === 'azure:setup')).toBeDefined();
  });

  it('always registers Azure service status', async () => {
    const statuses: Array<{ name: string }> = [];
    const mockPi = baseMockPi({
      registerServiceStatus(c: { name: string }) {
        statuses.push(c);
      },
    });
    await factory(mockPi);
    expect(statuses.length).toBeGreaterThanOrEqual(1);
    expect(statuses[0].name).toBe('Azure');
  });

  it('registers session_start event handler', async () => {
    const events: string[] = [];
    const mockPi = baseMockPi({
      on(event: string) {
        events.push(event);
      },
    });
    await factory(mockPi);
    expect(events).toContain('session_start');
  });

  it('service check returns valid state', async () => {
    let checkFn: (() => Promise<{ state: string }>) | undefined;
    const mockPi = baseMockPi({
      registerServiceStatus(c: { name: string; check: () => Promise<{ state: string }> }) {
        checkFn = c.check;
      },
    });
    await factory(mockPi);
    expect(checkFn).toBeDefined();
    if (checkFn) {
      const result = await checkFn();
      expect(['connected', 'unauthenticated', 'unavailable']).toContain(result.state);
    }
  });

  it('registers 6 tools when az CLI is available', async () => {
    const tools: Array<{ name: string }> = [];
    const mockPi = baseMockPi({
      registerTool(tool: { name: string }) {
        tools.push(tool);
      },
    });
    await factory(mockPi);

    if (tools.length > 0) {
      const toolNames = tools.map((t) => t.name).sort();
      expect(toolNames).toEqual([
        'az_account_show',
        'az_exec',
        'az_group_list',
        'az_help',
        'az_resource_list',
        'az_vm_list',
      ]);
    }
  });

  it('each registered tool has required fields', async () => {
    const tools: Array<Record<string, unknown>> = [];
    const mockPi = baseMockPi({
      registerTool(tool: Record<string, unknown>) {
        tools.push(tool);
      },
    });
    await factory(mockPi);

    for (const tool of tools) {
      expect(tool.name).toBeDefined();
      expect(tool.label).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(tool.parameters).toBeDefined();
      expect(typeof tool.execute).toBe('function');
    }
  });

  it('gracefully handles missing registerCommand', async () => {
    const mockPi = baseMockPi();
    // biome-ignore lint/suspicious/noExplicitAny: test requires deleting optional method
    delete (mockPi as Record<string, any>).registerCommand;
    await expect(factory(mockPi)).resolves.toBeUndefined();
  });

  it('gracefully handles missing registerServiceStatus', async () => {
    const mockPi = baseMockPi();
    // biome-ignore lint/suspicious/noExplicitAny: test requires deleting optional method
    delete (mockPi as Record<string, any>).registerServiceStatus;
    await expect(factory(mockPi)).resolves.toBeUndefined();
  });
});
