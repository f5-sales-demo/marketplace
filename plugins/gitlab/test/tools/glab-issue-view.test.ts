import { describe, expect, it } from 'bun:test';
import { Type } from '@sinclair/typebox';
import { createGlabIssueViewTool } from '../../src/tools/glab-issue-view';

const mockPi = { typebox: { Type } };

describe('createGlabIssueViewTool', () => {
  const tool = createGlabIssueViewTool(mockPi);

  it('exposes the expected tool metadata', () => {
    expect(tool.name).toBe('glab_issue_view');
    expect(tool.label).toBe('GitLab Issue');
    expect(typeof tool.description).toBe('string');
    expect(tool.description.length).toBeGreaterThan(20);
  });

  it('declares parameters and an execute function', () => {
    expect(tool.parameters).toBeDefined();
    expect(typeof tool.execute).toBe('function');
  });
});
