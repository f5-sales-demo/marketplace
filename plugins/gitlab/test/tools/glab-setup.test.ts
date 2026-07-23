import { describe, expect, it } from 'bun:test';
import { Type } from '@sinclair/typebox';
import { createGlabSetupTool } from '../../src/tools/glab-setup';

const mockPi = { typebox: { Type } };

describe('createGlabSetupTool', () => {
  const tool = createGlabSetupTool(mockPi);

  it('exposes the expected tool metadata', () => {
    expect(tool.name).toBe('glab_setup');
    expect(tool.label).toBe('GitLab Setup');
    expect(typeof tool.description).toBe('string');
    expect(tool.description.length).toBeGreaterThan(20);
  });

  it('declares parameters and an execute function', () => {
    expect(tool.parameters).toBeDefined();
    expect(typeof tool.execute).toBe('function');
  });
});
