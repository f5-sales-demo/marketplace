import { describe, expect, it } from 'bun:test';
import { Type } from '@sinclair/typebox';
import { createGlabHelpTool } from '../../src/tools/glab-help';

const mockPi = { typebox: { Type } };

function makeTool() {
  return createGlabHelpTool(mockPi);
}

describe('createGlabHelpTool', () => {
  it('returns correct name and label', () => {
    const tool = makeTool();
    expect(tool.name).toBe('glab_help');
    expect(tool.label).toBe('GitLab CLI Help');
    expect(typeof tool.description).toBe('string');
    expect(tool.description.length).toBeGreaterThan(20);
  });

  it('rejects an invalid command path before spawning glab', async () => {
    const tool = makeTool();
    const result = await tool.execute('t1', { command_path: 'pr;rm -rf' }, undefined, undefined, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text.toLowerCase()).toContain('invalid command path');
  });

  it('rejects a dash-prefixed command path part before spawning glab', async () => {
    const tool = makeTool();
    // A leading-dash part smuggles a flag past the pattern guard when split on spaces.
    const result = await tool.execute('t2', { command_path: 'issue --help' }, undefined, undefined, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text.toLowerCase()).toContain("must not start with '-'");
  });
});
