import { beforeAll, describe, expect, it } from 'bun:test';
import { Type } from '@sinclair/typebox';

const mockPi = {
  typebox: { Type },
  logger: { debug() {} },
  setLabel() {},
  registerTool(t: { name: string }) {
    (mockPi as any)._tools.push(t);
  },
  registerCommand(_name: string, _def: { description: string; handler: (...args: unknown[]) => Promise<void> }) {},
  registerServiceStatus(c: { name: string; check: () => Promise<{ state: string }> }) {
    (mockPi as any)._serviceStatus.push(c);
  },
  on(_event: string, _handler: (...args: unknown[]) => Promise<unknown>) {},
  _tools: [] as { name: string }[],
  _serviceStatus: [] as { name: string; check: () => Promise<{ state: string }> }[],
};

describe('GitLab extension', () => {
  let factory: (pi: unknown) => Promise<void>;

  beforeAll(async () => {
    // Reset mock state
    mockPi._tools = [];
    mockPi._serviceStatus = [];
    const mod = await import('../src/index');
    factory = mod.default as typeof factory;
  });

  it('exports a default factory function', () => {
    expect(typeof factory).toBe('function');
  });

  it('registers tools and service status when glab is available', async () => {
    // Reset
    mockPi._tools = [];
    mockPi._serviceStatus = [];

    await factory(mockPi);

    // If glab CLI is installed, should register 4 tools; if not, should skip gracefully
    if (mockPi._tools.length > 0) {
      expect(mockPi._tools.length).toBe(4);
      const names = mockPi._tools.map((t) => t.name).sort();
      expect(names).toEqual(['glab_issue_list', 'glab_issue_view', 'glab_search', 'glab_setup']);
    }
  });

  it('registers service status with name GitLab', async () => {
    // Reset
    mockPi._tools = [];
    mockPi._serviceStatus = [];

    await factory(mockPi);

    if (mockPi._serviceStatus.length > 0) {
      expect(mockPi._serviceStatus[0].name).toBe('GitLab');
    }
  });

  it('service check returns valid state', async () => {
    // Reset
    mockPi._tools = [];
    mockPi._serviceStatus = [];

    await factory(mockPi);

    if (mockPi._serviceStatus.length > 0) {
      const result = await mockPi._serviceStatus[0].check();
      expect(['connected', 'unauthenticated', 'unavailable']).toContain(result.state);
    }
  });
});

describe('Tool factories', () => {
  it('createGlabSetupTool returns correct name and label', async () => {
    const { createGlabSetupTool } = await import('../src/tools/glab-setup');
    const tool = createGlabSetupTool(mockPi);
    expect(tool.name).toBe('glab_setup');
    expect(tool.label).toBe('GitLab Setup');
    expect(tool.description).toBeTruthy();
    expect(tool.parameters).toBeTruthy();
  });

  it('createGlabIssueListTool returns correct name and label', async () => {
    const { createGlabIssueListTool } = await import('../src/tools/glab-issue-list');
    const tool = createGlabIssueListTool(mockPi);
    expect(tool.name).toBe('glab_issue_list');
    expect(tool.label).toBe('GitLab Issues');
    expect(typeof tool.description).toBe('string');
    expect(tool.description.length).toBeGreaterThan(20);
  });

  it('createGlabIssueViewTool returns correct name and label', async () => {
    const { createGlabIssueViewTool } = await import('../src/tools/glab-issue-view');
    const tool = createGlabIssueViewTool(mockPi);
    expect(tool.name).toBe('glab_issue_view');
    expect(tool.label).toBe('GitLab Issue');
    expect(typeof tool.description).toBe('string');
    expect(tool.description.length).toBeGreaterThan(20);
  });

  it('createGlabSearchTool returns correct name and label', async () => {
    const { createGlabSearchTool } = await import('../src/tools/glab-search');
    const tool = createGlabSearchTool(mockPi);
    expect(tool.name).toBe('glab_search');
    expect(tool.label).toBe('GitLab Search');
    expect(typeof tool.description).toBe('string');
    expect(tool.description.length).toBeGreaterThan(20);
  });

  it('glab_setup save_project requires project param', async () => {
    const { createGlabSetupTool } = await import('../src/tools/glab-setup');
    const tool = createGlabSetupTool(mockPi);
    const result = await tool.execute('t1', { action: 'save_project' }, undefined, undefined, { cwd: '/tmp' });
    expect(result.content[0].text).toContain('project parameter is required');
  });
});
