import { beforeAll, describe, expect, it } from 'bun:test';

/**
 * These cases drive the real `az` binary, so they are meaningful only where it is
 * installed. A visible skip beats an `if (…)` that quietly asserts nothing, and the
 * generous timeout is because a cloud CLI answering in under five seconds is not a
 * property this repo controls.
 */
const AZ_INSTALLED = Bun.spawnSync([process.platform === 'win32' ? 'where' : 'which', 'az']).exitCode === 0;

const mockTypebox = {
  Type: {
    Object: (s: unknown) => s,
    String: (o?: unknown) => ({ type: 'string', ...((o as object) ?? {}) }),
    Boolean: (o?: unknown) => ({ type: 'boolean', ...((o as object) ?? {}) }),
    Number: (o?: unknown) => ({ type: 'number', ...((o as object) ?? {}) }),
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

  it('registers session and research-routing event handlers', async () => {
    const events: string[] = [];
    const mockPi = baseMockPi({
      on(event: string) {
        events.push(event);
      },
    });
    await factory(mockPi);
    expect(events).toContain('session_start');
    expect(events).toContain('before_agent_start');
  });

  it('defines the mandatory research route for synthesized Azure CE paraphrases', async () => {
    const { AZURE_CE_RESEARCH_GATE, isAzureCePrompt } = await import('../src/index');
    expect(
      isAzureCePrompt(
        'Find the right Azure Marketplace F5 edge appliance for running Distributed Cloud close to my apps.',
      ),
    ).toBe(true);
    expect(isAzureCePrompt('List the virtual machines in Azure.')).toBe(false);
    expect(AZURE_CE_RESEARCH_GATE).toContain('use web_search');
    expect(AZURE_CE_RESEARCH_GATE).toContain('azure_compute_discover');
    expect(AZURE_CE_RESEARCH_GATE).toContain('Never guess identifiers');
    expect(AZURE_CE_RESEARCH_GATE).toContain('az_activity_log_list');
    expect(AZURE_CE_RESEARCH_GATE).toContain('not ownership');
    expect(AZURE_CE_RESEARCH_GATE).toContain(
      'Never use az_exec or an absolute start date for Activity Log attribution',
    );
  });

  it.skipIf(!AZ_INSTALLED)(
    'service check returns valid state',
    async () => {
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
    },
    60000,
  );

  it('registers generic and Customer Edge tools when az CLI is available', async () => {
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
        'az_activity_log_list',
        'az_exec',
        'az_group_list',
        'az_help',
        'az_resource_graph_query',
        'az_resource_list',
        'az_vm_list',
        'azure_ce_apply',
        'azure_ce_diagnose',
        'azure_ce_plan',
        'azure_ce_status',
        'azure_cloud_init_analyze',
        'azure_compute_discover',
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
