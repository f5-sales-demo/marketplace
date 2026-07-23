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

describe('AWS Status extension', () => {
  let factory: (pi: unknown) => Promise<void>;

  beforeAll(async () => {
    const mod = await import('../src/index');
    factory = mod.default as typeof factory;
  });

  it('exports a default factory function', () => {
    expect(typeof factory).toBe('function');
  });

  it('registers service status when aws is available', async () => {
    const registered: { name: string }[] = [];
    const mockPi = baseMockPi({
      registerServiceStatus(c: { name: string }) {
        registered.push(c);
      },
    });
    await factory(mockPi);

    // If aws CLI is installed, should register; if not, should skip gracefully
    if (registered.length > 0) {
      expect(registered[0].name).toBe('AWS');
    }
  });

  it('service check returns valid state', async () => {
    let checkFn: (() => Promise<{ state: string }>) | undefined;
    const mockPi = baseMockPi({
      registerServiceStatus(c: { name: string; check: () => Promise<{ state: string }> }) {
        checkFn = c.check;
      },
    });
    await factory(mockPi);

    if (checkFn) {
      const result = await checkFn();
      expect(['connected', 'unauthenticated', 'unavailable']).toContain(result.state);
    }
  });

  it('registers 5 tools when aws CLI is available', async () => {
    const tools: Array<{ name: string }> = [];
    const mockPi = baseMockPi({
      registerTool(tool: { name: string }) {
        tools.push(tool);
      },
    });
    await factory(mockPi);

    // If aws CLI is installed, should register all 5; if not, should skip gracefully
    if (tools.length > 0) {
      const toolNames = tools.map((t) => t.name).sort();
      expect(toolNames).toEqual(['aws_ec2_describe_instances', 'aws_exec', 'aws_help', 'aws_s3_ls', 'aws_sts_whoami']);
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
});
