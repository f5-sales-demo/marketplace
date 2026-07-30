import { describe, expect, it } from 'bun:test';
import { Type } from '@sinclair/typebox';
import { createSfDescribeTool } from '../../src/tools/sf-describe';

const mockPi = { typebox: { Type }, logger: { debug() {} } };

// Validation tests must never reach a real CLI: whether one is installed, and how long it
// takes to answer, is not part of what they are asserting.
const stubExec = () => ({
  exec: async () => ({ stdout: '{"status":0,"result":{}}', stderr: '', exitCode: 0 }),
});

function describeExec(payload: unknown, capture?: { args?: string[] }) {
  return () => ({
    exec: async (_cmd: string, args: string[]) => {
      if (capture) capture.args = args;
      return { stdout: JSON.stringify({ status: 0, result: payload }), stderr: '', exitCode: 0 };
    },
  });
}

const OPPORTUNITY = {
  name: 'Opportunity',
  fields: [
    { name: 'Competitor_1__c', label: 'Primary Competitor', type: 'picklist', custom: true, filterable: true },
    { name: 'Amount', label: 'Amount', type: 'currency', custom: false, filterable: true },
  ],
  childRelationships: [
    { childSObject: 'OpportunityCompetitor', relationshipName: 'OpportunityCompetitors', field: 'OpportunityId' },
  ],
};

describe('createSfDescribeTool', () => {
  it('returns a tool definition with correct name and label', () => {
    const tool = createSfDescribeTool(mockPi, stubExec);
    expect(tool.name).toBe('sf_describe');
    expect(tool.label).toBe('Salesforce Describe');
  });

  it('has description loaded from prompt template', () => {
    const tool = createSfDescribeTool(mockPi, stubExec);
    expect(typeof tool.description).toBe('string');
    expect(tool.description.length).toBeGreaterThan(10);
  });
});

describe('sf_describe execute — validation', () => {
  it('requires an sobject', async () => {
    const tool = createSfDescribeTool(mockPi, stubExec);
    const result = await tool.execute('t1', { sobject: '' }, undefined, undefined, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('sobject');
  });

  it('rejects an sobject name that is not a bare identifier', async () => {
    const tool = createSfDescribeTool(mockPi, stubExec);
    for (const bad of ['Opportunity; rm -rf /', 'Opp$(id)', 'Opp|cat /etc/passwd', '--target-org']) {
      const result = await tool.execute('t1', { sobject: bad }, undefined, undefined, { cwd: '/tmp' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('invalid sobject');
    }
  });

  it('rejects shell injection in org alias', async () => {
    const tool = createSfDescribeTool(mockPi, stubExec);
    const result = await tool.execute('t1', { sobject: 'Opportunity', target_org: 'bad$(id)' }, undefined, undefined, {
      cwd: '/tmp',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('invalid org alias');
  });

  it('accepts a namespaced custom object', async () => {
    const tool = createSfDescribeTool(mockPi, describeExec(OPPORTUNITY));
    const result = await tool.execute('t1', { sobject: 'LID__Opportunity__c' }, undefined, undefined, { cwd: '/tmp' });
    expect(result.isError).toBeUndefined();
  });
});

describe('sf_describe execute — behaviour', () => {
  it('invokes `sobject describe` with the requested object and org', async () => {
    const capture: { args?: string[] } = {};
    const tool = createSfDescribeTool(mockPi, describeExec(OPPORTUNITY, capture));
    await tool.execute('t1', { sobject: 'Opportunity', target_org: 'f5' }, undefined, undefined, { cwd: '/tmp' });
    expect(capture.args).toEqual(['sobject', 'describe', '--sobject', 'Opportunity', '--target-org', 'f5', '--json']);
  });

  it('returns the real competitor field for a "competitor" match', async () => {
    const tool = createSfDescribeTool(mockPi, describeExec(OPPORTUNITY));
    const result = await tool.execute('t1', { sobject: 'Opportunity', match: 'competitor' }, undefined, undefined, {
      cwd: '/tmp',
    });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Competitor_1__c');
    expect(result.content[0].text).toContain('OpportunityCompetitors');
  });

  it('surfaces an sf failure as a structured error rather than throwing', async () => {
    const failing = () => ({
      exec: async () => ({
        stdout: JSON.stringify({ status: 1, name: 'NotFoundError', message: "The requested resource doesn't exist." }),
        stderr: '',
        exitCode: 1,
      }),
    });
    const tool = createSfDescribeTool(mockPi, failing);
    const result = await tool.execute('t1', { sobject: 'Nope__c' }, undefined, undefined, { cwd: '/tmp' });
    expect(result.isError).toBe(true);
    expect(result.details?.errorType).toBe('exec_error');
  });
});
