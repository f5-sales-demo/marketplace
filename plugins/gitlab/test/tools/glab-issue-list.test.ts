import { describe, expect, it } from 'bun:test';
import { Type } from '@sinclair/typebox';
import { createGlabIssueListTool } from '../../src/tools/glab-issue-list';

const mockPi = { typebox: { Type } };

describe('createGlabIssueListTool', () => {
  const tool = createGlabIssueListTool(mockPi);

  it('exposes the expected tool metadata', () => {
    expect(tool.name).toBe('glab_issue_list');
    expect(tool.label).toBe('GitLab Issues');
    expect(typeof tool.description).toBe('string');
    expect(tool.description.length).toBeGreaterThan(20);
  });

  it('declares parameters and an execute function', () => {
    expect(tool.parameters).toBeDefined();
    expect(typeof tool.execute).toBe('function');
  });
});
