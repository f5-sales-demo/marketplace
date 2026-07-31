// Live acceptance checks for schema discovery and query-error reporting.
//
// Runs the REAL tool code against a REAL org — the unit tests use captured payloads, so only
// this catches a drift between what the sf CLI emits and what the plugin expects. Invoked by
// test_live.sh, which skips it when no org is authenticated.
//
// Usage: bun run scripts/tests/live-uat.ts <org-alias>

import { Type } from '@sinclair/typebox';
import { createSfDescribeTool } from '../../src/tools/sf-describe';
import { createSfQueryTool } from '../../src/tools/sf-query';

const org = process.argv[2];
if (!org) {
  console.error('usage: bun run scripts/tests/live-uat.ts <org-alias>');
  process.exit(2);
}

const pi = { typebox: { Type }, logger: { debug() {} } };
const ctx = { cwd: process.cwd() };
const failures: string[] = [];

function check(name: string, condition: boolean, detail: string): void {
  if (condition) {
    console.log(`  ok    ${name}`);
    return;
  }
  console.log(`  FAIL  ${name}`);
  console.log(`        ${detail}`);
  failures.push(name);
}

const describeTool = createSfDescribeTool(pi);
const queryTool = createSfQueryTool(pi);

// UAT.1 — a query naming a field that does not exist must say WHICH field, up front, and point
// at the tool that resolves it. This is the exact failure that motivated the change.
{
  const result = await queryTool.execute(
    'uat1',
    {
      query: 'SELECT Id, Name, Competitor__c FROM Opportunity LIMIT 1',
      description: 'invalid field probe',
      target_org: org,
    },
    undefined,
    undefined,
    ctx,
  );
  const text = result.content[0].text;
  check('UAT.1a invalid field is reported as an error', result.isError === true, `isError=${result.isError}`);
  check(
    'UAT.1b error is classified as invalid_query',
    result.details?.errorType === 'invalid_query',
    `errorType=${result.details?.errorType}`,
  );
  check('UAT.1c error names the offending column', text.includes("No such column 'Competitor__c'"), text.slice(0, 200));
  check('UAT.1d error points at sf_describe', text.includes('sf_describe'), text.slice(0, 200));
  const caret = text.indexOf('^');
  check(
    'UAT.1e actionable line precedes the caret block',
    caret === -1 || text.indexOf('No such column') < caret,
    `caret@${caret} column@${text.indexOf('No such column')}`,
  );
}

// UAT.2 — the schema lookup finds the org's real competitor fields, which is what the model
// could not do before and why it shelled out to raw sf + python.
{
  const result = await describeTool.execute(
    'uat2',
    { sobject: 'Opportunity', match: 'competitor', target_org: org },
    undefined,
    undefined,
    ctx,
  );
  const text = result.content[0].text;
  check('UAT.2a describe succeeds', !result.isError, text.slice(0, 200));
  check('UAT.2b returns at least one competitor field', /competitor/i.test(text), text.slice(0, 200));
  check(
    'UAT.2c surfaces the OpportunityCompetitors child relationship if the org has one',
    !text.includes('OpportunityCompetitor') || text.includes('Child relationships'),
    text.slice(0, 300),
  );
  check('UAT.2d output stays small enough to read', text.length < 12_000, `${text.length} chars`);
  for (const line of text.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('|---'))) {
    if (line.split(/(?<!\\)\|/).length !== 6 && line.split(/(?<!\\)\|/).length !== 5) {
      check('UAT.2e every table row has a consistent column count', false, line);
      break;
    }
  }
}

// UAT.3 — an unfiltered describe of a large object must not dump the whole catalog.
{
  const result = await describeTool.execute(
    'uat3',
    { sobject: 'Opportunity', target_org: org },
    undefined,
    undefined,
    ctx,
  );
  const text = result.content[0].text;
  check('UAT.3a unfiltered describe succeeds', !result.isError, text.slice(0, 200));
  check('UAT.3b unfiltered describe is bounded', text.length < 12_000, `${text.length} chars`);
  check('UAT.3c unfiltered describe tells the caller to use match', text.includes('match'), text.slice(0, 300));
}

// UAT.4 — picklist discovery: stage names must come from the org, not from assumptions.
{
  const result = await describeTool.execute(
    'uat4',
    { sobject: 'Opportunity', match: 'stage', target_org: org },
    undefined,
    undefined,
    ctx,
  );
  const text = result.content[0].text;
  check('UAT.4a stage lookup succeeds', !result.isError, text.slice(0, 200));
  check('UAT.4b StageName is found', text.includes('StageName'), text.slice(0, 300));
  check('UAT.4c active picklist values are listed', text.includes('values:'), text.slice(0, 400));
}

// UAT.5 — a bad object name is reported without the tool throwing.
{
  const result = await describeTool.execute(
    'uat5',
    { sobject: 'NoSuchObject__c', target_org: org },
    undefined,
    undefined,
    ctx,
  );
  check('UAT.5a unknown sobject is a structured error', result.isError === true, JSON.stringify(result.details));
}

// UAT.6 — the pipeline report against an org WITHOUT the custom schema the report was written
// for. Simulated by declaring stock capabilities while querying a real org: the point is that
// no query may name a field the declared org lacks, and a useful report must still come back.
{
  const { generatePipelineReport } = await import('../../src/pipeline-report/generator');
  const stale = new Date();
  stale.setFullYear(stale.getFullYear() - 1);

  const CUSTOM_FIELDS = [
    'FYB_Total_Price__c',
    'Subscription_Renewal__c',
    'Renewal__c',
    'True_ACV__c',
    'Upsell_ACV__c',
    'Product_Segmentation__c',
    'Use_Case_Category__c',
    'Territory_Credited_District_del__c',
  ];

  const issued: string[] = [];
  let failed = 0;
  const recordingQuery = async (soql: string) => {
    issued.push(soql);
    const proc = Bun.spawn(['sf', 'data', 'query', '--query', soql, '--target-org', org, '--json'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    try {
      const parsed = JSON.parse(out) as { status?: number; result?: { records?: Record<string, unknown>[] } };
      if (parsed.status !== 0) {
        failed++;
        return [];
      }
      return parsed.result?.records ?? [];
    } catch {
      failed++;
      return [];
    }
  };

  const data = await generatePipelineReport(
    {
      userIds: [process.env.SF_UAT_USER_ID ?? '005000000000000'],
      quarterStart: '2026-05-01',
      quarterEnd: '2026-07-31',
      staleCutoff: stale.toISOString().slice(0, 10),
      capabilities: {
        opportunityFields: [
          'Id',
          'Name',
          'Amount',
          'CloseDate',
          'ForecastCategoryName',
          'StageName',
          'IsClosed',
          'IsWon',
        ],
        lineItemFields: ['Id', 'Quantity', 'UnitPrice', 'TotalPrice'],
      },
    },
    recordingQuery,
  );

  const all = issued.join('\n');
  const leaked = CUSTOM_FIELDS.filter((f) => all.includes(f));
  check('UAT.6a no query names a field the org lacks', leaked.length === 0, `leaked: ${leaked.join(', ')}`);
  check(
    'UAT.6b OpportunityLineItem is not queried at all',
    !all.includes('FROM OpportunityLineItem'),
    all.slice(0, 200),
  );
  check('UAT.6c every issued query succeeds', failed === 0, `${failed} of ${issued.length} failed`);
  check(
    'UAT.6d the missing sections are named, not silently dropped',
    (data.unavailable ?? []).length === 2,
    JSON.stringify(data.unavailable),
  );
}

// UAT.7 — the same report against the org's REAL schema still uses the custom path.
{
  const { planPipelineQueries } = await import('../../src/pipeline-report/capabilities');
  const { normalizeDescribe } = await import('../../src/sf/describe');

  const describeFields = async (sobject: string): Promise<string[] | undefined> => {
    const proc = Bun.spawn(['sf', 'sobject', 'describe', '--sobject', sobject, '--target-org', org, '--json'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    try {
      const parsed = JSON.parse(out) as { status?: number; result?: unknown };
      if (parsed.status !== 0) return undefined;
      return normalizeDescribe(parsed.result).fields.map((f) => f.name);
    } catch {
      return undefined;
    }
  };

  const opportunityFields = await describeFields('Opportunity');
  const lineItemFields = await describeFields('OpportunityLineItem');
  const plan = planPipelineQueries({ opportunityFields, lineItemFields });

  check('UAT.7a both objects describe successfully', !!opportunityFields && !!lineItemFields, 'describe failed');
  // Whether this org has the fields is org-dependent; what must hold is that the plan agrees
  // with the catalog rather than assuming either way.
  const expectLineItems = !lineItemFields || lineItemFields.includes('FYB_Total_Price__c');
  const expectRenewals = !opportunityFields || opportunityFields.includes('Renewal__c');
  check(
    'UAT.7b the line-item decision matches the catalog',
    plan.useLineItems === expectLineItems,
    `plan=${plan.useLineItems} catalog=${expectLineItems}`,
  );
  check(
    'UAT.7c the renewals decision matches the catalog',
    plan.useRenewals === expectRenewals,
    `plan=${plan.useRenewals} catalog=${expectRenewals}`,
  );
  check(
    'UAT.7d unavailable notes are consistent with the decisions',
    plan.unavailable.length === (expectLineItems ? 0 : 1) + (expectRenewals ? 0 : 1),
    JSON.stringify(plan.unavailable),
  );
}

console.log(failures.length === 0 ? '\nlive UAT: all checks passed' : `\nlive UAT: ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
