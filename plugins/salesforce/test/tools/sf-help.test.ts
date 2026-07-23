import { describe, expect, it } from 'bun:test';
import { Type } from '@sinclair/typebox';
import { createSfHelpTool } from '../../src/tools/sf-help';

const mockPi = { typebox: { Type } };

function makeTool() {
  return createSfHelpTool(mockPi);
}

describe('createSfHelpTool', () => {
  it('returns correct name and label', () => {
    const tool = makeTool();
    expect(tool.name).toBe('sf_help');
    expect(tool.label).toBe('Salesforce CLI Help');
    expect(typeof tool.description).toBe('string');
    expect(tool.description.length).toBeGreaterThan(20);
  });

  it('rejects an invalid command path before spawning sf', async () => {
    const tool = makeTool();
    const result = await tool.execute('t1', { command_path: 'org;rm -rf' }, undefined, undefined, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text.toLowerCase()).toContain('invalid command path');
    expect(result.details.tool).toBe('sf_help');
  });

  it('rejects a dash-prefixed command path part before spawning sf', async () => {
    const tool = makeTool();
    // A leading-dash part smuggles a flag past the pattern guard when split on spaces/colons.
    const result = await tool.execute('t2', { command_path: 'org --help' }, undefined, undefined, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text.toLowerCase()).toContain("must not start with '-'");
    expect(result.details.tool).toBe('sf_help');
  });

  it('accepts a colon-form command path via the validator (no dash-part rejection)', async () => {
    const tool = makeTool();
    // The colon `topic:command` form must pass the validator and per-part guard.
    // A guard rejection is RETURNED (isError result); reaching the exec layer means
    // the path was accepted. We tolerate an exec throw (e.g. sf not installed) since
    // that proves the guard let the call through rather than rejecting it.
    let result: { isError?: boolean; content: { text: string }[]; details: { tool: string } } | undefined;
    try {
      result = await tool.execute('t3', { command_path: 'org:list' }, undefined, undefined, { cwd: '/tmp' });
    } catch {
      // Spawn-layer error: the guard accepted the colon path and let it reach exec.
      return;
    }
    if (result.isError) {
      // If an error surfaces it must come from exec, never from the path guard.
      expect(result.content[0].text.toLowerCase()).not.toContain('invalid command path');
      expect(result.content[0].text.toLowerCase()).not.toContain("must not start with '-'");
    }
    expect(result.details.tool).toBe('sf_help');
  });
});
