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

console.log(failures.length === 0 ? '\nlive UAT: all checks passed' : `\nlive UAT: ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
