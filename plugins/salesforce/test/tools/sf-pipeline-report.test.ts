import { describe, expect, it } from 'bun:test';
import { Type } from '@sinclair/typebox';
import { createSfPipelineReportTool } from '../../src/tools/sf-pipeline-report';

const mockPi = { typebox: { Type }, logger: { debug() {} } };

describe('createSfPipelineReportTool', () => {
  it('returns a tool definition with correct name and label', () => {
    const tool = createSfPipelineReportTool(mockPi);
    expect(tool.name).toBe('sf_pipeline_report');
    expect(tool.label).toBe('Salesforce Pipeline Report');
  });

  it('has description loaded from prompt template', () => {
    const tool = createSfPipelineReportTool(mockPi);
    expect(typeof tool.description).toBe('string');
    expect(tool.description.length).toBeGreaterThan(10);
  });
});

describe('sf_pipeline_report execute — validation', () => {
  it('rejects command-substitution injection in target_org', async () => {
    const tool = createSfPipelineReportTool(mockPi);
    const result = await tool.execute('t1', { target_org: 'bad$(id)' }, undefined, undefined, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('invalid org alias');
  });

  it('rejects semicolon injection', async () => {
    const tool = createSfPipelineReportTool(mockPi);
    const result = await tool.execute('t1', { target_org: 'org;rm -rf /' }, undefined, undefined, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
  });

  it('rejects pipe injection', async () => {
    const tool = createSfPipelineReportTool(mockPi);
    const result = await tool.execute('t1', { target_org: 'org|cat /etc/passwd' }, undefined, undefined, {
      cwd: '/tmp',
    });
    expect(result.isError).toBe(true);
  });

  it('accepts a valid org alias without a validation error', async () => {
    const tool = createSfPipelineReportTool(mockPi);
    const result = await tool.execute('t1', { target_org: 'prod-org' }, undefined, undefined, { cwd: '/tmp' });
    if (result.isError) {
      expect(result.content[0].text).not.toContain('invalid org alias');
    }
  });

  it('proceeds without target_org', async () => {
    const tool = createSfPipelineReportTool(mockPi);
    const result = await tool.execute('t1', {}, undefined, undefined, { cwd: '/tmp' });
    if (result.isError) {
      expect(result.content[0].text).not.toContain('invalid org alias');
    }
  });
});
