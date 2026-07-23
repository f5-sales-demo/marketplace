import { describe, expect, it } from 'bun:test';
import { Type } from '@sinclair/typebox';
import { createGlabSearchTool } from '../../src/tools/glab-search';

const mockPi = { typebox: { Type } };

describe('createGlabSearchTool', () => {
  const tool = createGlabSearchTool(mockPi);

  it('exposes the expected tool metadata', () => {
    expect(tool.name).toBe('glab_search');
    expect(tool.label).toBe('GitLab Search');
    expect(typeof tool.description).toBe('string');
    expect(tool.description.length).toBeGreaterThan(20);
  });

  it('declares parameters and an execute function', () => {
    expect(tool.parameters).toBeDefined();
    expect(typeof tool.execute).toBe('function');
  });
});
