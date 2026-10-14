import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Type } from '@sinclair/typebox';
import { configurePersonProfile, configureSalesforceContext } from '../../src/context/salesforce-context';
import { createSfPipelineReportTool } from '../../src/tools/sf-pipeline-report';

// Validation tests must never reach a real CLI: whether one is installed, and how long it
// takes to answer, is not part of what they are asserting.
const stubExec = () => ({
  exec: async () => ({ stdout: '{}', stderr: '', exitCode: 0 }),
});

const mockPi = { typebox: { Type }, logger: { debug() {} } };

beforeEach(() => {
  configurePersonProfile(async () => ({}));
  configureSalesforceContext(async () => null);
});

afterEach(() => {
  configurePersonProfile();
  configureSalesforceContext();
});

describe('createSfPipelineReportTool', () => {
  it('returns a tool definition with correct name and label', () => {
    const tool = createSfPipelineReportTool(mockPi, stubExec);
    expect(tool.name).toBe('sf_pipeline_report');
    expect(tool.label).toBe('Salesforce Pipeline Report');
  });

  it('has description loaded from prompt template', () => {
    const tool = createSfPipelineReportTool(mockPi, stubExec);
    expect(typeof tool.description).toBe('string');
    expect(tool.description.length).toBeGreaterThan(10);
  });
});

describe('sf_pipeline_report execute — validation', () => {
  it('rejects command-substitution injection in target_org', async () => {
    const tool = createSfPipelineReportTool(mockPi, stubExec);
    const result = await tool.execute('t1', { target_org: 'bad$(id)' }, undefined, undefined, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('invalid org alias');
  });

  it('rejects semicolon injection', async () => {
    const tool = createSfPipelineReportTool(mockPi, stubExec);
    const result = await tool.execute('t1', { target_org: 'org;rm -rf /' }, undefined, undefined, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
  });

  it('rejects pipe injection', async () => {
    const tool = createSfPipelineReportTool(mockPi, stubExec);
    const result = await tool.execute('t1', { target_org: 'org|cat /etc/passwd' }, undefined, undefined, {
      cwd: '/tmp',
    });
    expect(result.isError).toBe(true);
  });

  it('accepts a valid org alias without a validation error', async () => {
    const tool = createSfPipelineReportTool(mockPi, stubExec);
    const result = await tool.execute('t1', { target_org: 'prod-org' }, undefined, undefined, { cwd: '/tmp' });
    if (result.isError) {
      expect(result.content[0].text).not.toContain('invalid org alias');
    }
  });

  it('proceeds without target_org', async () => {
    const tool = createSfPipelineReportTool(mockPi, stubExec);
    const result = await tool.execute('t1', {}, undefined, undefined, { cwd: '/tmp' });
    if (result.isError) {
      expect(result.content[0].text).not.toContain('invalid org alias');
    }
  });
});

it('uses the verified integration user ID when the legacy profile identifier is absent', async () => {
  configureSalesforceContext(async () => ({ userId: '005000000000001', orgAlias: 'synthetic' }) as never);
  const calls: string[][] = [];
  const tool = createSfPipelineReportTool(mockPi, () => ({
    exec: async (_command, args) => {
      calls.push(args);
      return { stdout: JSON.stringify({ status: 0, result: { records: [] } }), stderr: '', exitCode: 0 };
    },
  }));
  const result = await tool.execute('identity-fixture', {}, undefined, undefined, { cwd: '/tmp' });
  expect(result.isError).not.toBe(true);
  expect(calls.flat().join(' ')).toContain('005000000000001');
});
it('keeps an explicit profile identifier ahead of the integration identity', async () => {
  configurePersonProfile(async () => ({ identifiers: { salesforceId: '005000000000002' } }));
  configureSalesforceContext(async () => ({ userId: '005000000000001', orgAlias: 'synthetic' }) as never);
  const calls: string[][] = [];
  const tool = createSfPipelineReportTool(mockPi, () => ({
    exec: async (_command, args) => {
      calls.push(args);
      return { stdout: JSON.stringify({ status: 0, result: { records: [] } }), stderr: '', exitCode: 0 };
    },
  }));
  await tool.execute('identity-fixture', {}, undefined, undefined, { cwd: '/tmp' });
  expect(calls.flat().join(' ')).toContain('005000000000002');
  expect(calls.flat().join(' ')).not.toContain('005000000000001');
});
