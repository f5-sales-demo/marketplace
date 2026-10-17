import { afterEach, expect, test } from 'bun:test';
import { Type } from '@sinclair/typebox';
import {
  configurePersonProfile,
  configureSalesforceContext,
  configureSalesforceExecutor,
  enrichSalesforceContext,
  seedSalesforceContext,
} from '../../src/context/salesforce-context';
import { createSfPipelineReportTool } from '../../src/tools/sf-pipeline-report';

const raw = (result: unknown) => ({ stdout: JSON.stringify({ status: 0, result }), stderr: '', exitCode: 0 });
const identity = {
  userId: '005000000000001',
  username: 'user@example.com',
  instanceUrl: 'https://example.com',
  orgAlias: 'synthetic',
  collectedAt: '2026-10-17T00:00:00Z',
  discoveryPending: true,
};
afterEach(() => {
  configurePersonProfile();
  configureSalesforceContext();
  configureSalesforceExecutor();
});

test('profile readiness resolves only live identity and never launches slow report discovery', async () => {
  const calls: string[][] = [];
  configurePersonProfile(async () => ({ identifiers: { salesforceId: '005000000000002' } }));
  configureSalesforceExecutor(async (args) => {
    calls.push([...args]);
    if (args[0] === 'org') return raw(identity);
    if (args.includes('--query') && args[3].startsWith('SELECT Id, UserType'))
      return raw({ records: [{ Id: identity.userId, UserType: 'Standard' }] });
    throw new Error('Optional discovery must not run during readiness');
  });
  const ready = await seedSalesforceContext(AbortSignal.timeout(1000));
  expect(ready).toMatchObject({ userId: identity.userId, userType: 'Standard', discoveryPending: true });
  expect(calls).toHaveLength(2);
  expect(ready).not.toHaveProperty('opportunityFields');
});

test('a stale profile ID cannot establish readiness when the authenticated user query is empty', async () => {
  configurePersonProfile(async () => ({ identifiers: { salesforceId: '005000000000002' } }));
  configureSalesforceExecutor(async (args) => raw(args[0] === 'org' ? identity : { records: [] }));
  expect(await seedSalesforceContext()).toBeNull();
});

test('cancelled enrichment preserves ready identity and is not cached as complete', async () => {
  let calls = 0;
  configureSalesforceExecutor(async (_args, signal) => {
    calls++;
    return new Promise((resolve) =>
      signal?.addEventListener('abort', () => resolve(raw({ fields: [] })), { once: true }),
    );
  });
  await expect(enrichSalesforceContext(identity, AbortSignal.timeout(10))).rejects.toThrow();
  expect(identity.discoveryPending).toBe(true);
  expect(identity.userId).toBe('005000000000001');
  expect(calls).toBe(2);
  configureSalesforceExecutor(async (args) => raw(args[0] === 'sobject' ? { fields: [] } : { records: [] }));
  expect((await enrichSalesforceContext(identity)).discoveryPending).toBe(false);
});

test('default pipeline lazily discovers and retains schema and territory scope for the verified org', async () => {
  configurePersonProfile(async () => ({}));
  const seed = { ...identity, orgAlias: undefined };
  configureSalesforceContext(async () => seed);
  const discoveryCalls: string[][] = [];
  configureSalesforceExecutor(async (args) => {
    discoveryCalls.push([...args]);
    if (args[0] === 'sobject')
      return raw({
        fields: [
          { name: 'Territory__c', label: 'Territory', type: 'string', groupable: true, filterable: true, custom: true },
        ],
      });
    if (args[3].startsWith('SELECT Opportunity.Territory__c'))
      return raw({ records: [{ Opportunity: { Territory__c: 'Example West' } }] });
    return raw({ records: [] });
  });
  const reportCalls: string[][] = [];
  const tool = createSfPipelineReportTool({ typebox: { Type } } as never, () => ({
    exec: async (_cmd, args) => {
      reportCalls.push(args);
      return raw({
        records: args[3].includes('FROM Period')
          ? [
              { Type: 'Quarter', StartDate: '2026-08-01', EndDate: '2026-10-31' },
              { Type: 'Year', StartDate: '2025-11-01', EndDate: '2026-10-31' },
            ]
          : [],
        done: true,
      });
    },
  }));
  const result = await tool.execute('lazy-report', {}, undefined, undefined, { cwd: '/tmp' });
  expect(result.isError).not.toBe(true);
  expect(result.details?.pipelineEvidence).toMatchObject({
    confirmedTerritories: ['Example West'],
    capabilities: { opportunityFields: ['Territory__c'], territoryField: 'Territory__c' },
  });
  expect(discoveryCalls.every((args) => args.at(-2) === '--target-org' && args.at(-1) === identity.username)).toBe(
    true,
  );
  expect(discoveryCalls.some((args) => args[0] === 'org')).toBe(false);
  expect(reportCalls.flat().join(' ')).toContain(identity.userId);
  expect(reportCalls.every((args) => args.includes(identity.username))).toBe(true);
  const count = discoveryCalls.length;
  await tool.execute('cached-report', { target_org: '' }, undefined, undefined, { cwd: '/tmp' });
  expect(discoveryCalls).toHaveLength(count);
});

test('aborted readiness starts no processes', async () => {
  let calls = 0;
  configureSalesforceExecutor(async () => {
    calls++;
    return raw({});
  });
  await expect(seedSalesforceContext(AbortSignal.abort())).rejects.toThrow();
  expect(calls).toBe(0);
});
