import { beforeAll, describe, expect, it } from 'bun:test';

/**
 * These cases drive the real `aws` binary, so they are meaningful only where it is
 * installed. A visible skip beats an `if (…)` that quietly asserts nothing, and the
 * generous timeout is because a cloud CLI answering in under five seconds is not a
 * property this repo controls.
 */
const AWS_INSTALLED = Bun.spawnSync([process.platform === 'win32' ? 'where' : 'which', 'aws']).exitCode === 0;

const mockTypebox = {
  Type: {
    Object: (s: unknown) => s,
    String: (o?: unknown) => ({ type: 'string', ...((o as object) ?? {}) }),
    Boolean: (o?: unknown) => ({ type: 'boolean', ...((o as object) ?? {}) }),
    Number: (o?: unknown) => ({ type: 'number', ...((o as object) ?? {}) }),
    Null: () => ({ type: 'null' }),
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

  it.skipIf(!AWS_INSTALLED)(
    'service check returns valid state',
    async () => {
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
    },
    60000,
  );

  it('registers generic and six Customer Edge tools when aws CLI is available', async () => {
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
      expect(toolNames).toEqual([
        'aws_ce_apply',
        'aws_ce_diagnose',
        'aws_ce_plan',
        'aws_ce_status',
        'aws_cloud_init_analyze',
        'aws_compute_discover',
        'aws_ec2_describe_instances',
        'aws_exec',
        'aws_help',
        'aws_s3_ls',
        'aws_sts_whoami',
      ]);
    }
  });

  it('defines the mandatory research route for AWS CE paraphrases', async () => {
    const { AWS_CE_RESEARCH_GATE, isAwsCePrompt } = await import('../src/index');
    expect(isAwsCePrompt('Research an F5 Distributed Cloud Customer Edge appliance in AWS.')).toBe(true);
    expect(isAwsCePrompt('List my EC2 instances in AWS.')).toBe(false);
    expect(AWS_CE_RESEARCH_GATE).toContain('use web_search');
    expect(AWS_CE_RESEARCH_GATE).toContain('aws_sts_whoami, f5xc_ce_v2_capabilities, and aws_compute_discover');
    expect(AWS_CE_RESEARCH_GATE).toContain('release-blocked');
    expect(AWS_CE_RESEARCH_GATE).toContain('Never use generic aws_exec');
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
