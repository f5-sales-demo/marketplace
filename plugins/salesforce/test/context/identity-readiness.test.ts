import { afterEach, expect, test } from 'bun:test';
import {
  configurePersonProfile,
  configureSalesforceExecutor,
  enrichSalesforceContext,
  seedSalesforceContext,
} from '../../src/context/salesforce-context';
import { response, syntheticApi, syntheticIdentity } from '../synthetic';

afterEach(() => {
  configurePersonProfile();
  configureSalesforceExecutor();
});
const identity = {
  ...syntheticIdentity,
  orgId: syntheticIdentity.id,
  collectedAt: '2026-11-01T00:00:00Z',
  discoveryPending: true,
};
test('readiness verifies organization and user without launching report discovery', async () => {
  const calls: string[][] = [],
    api = syntheticApi(calls);
  configureSalesforceExecutor((args, signal) => api.exec('sf', [...args], { signal }));
  configurePersonProfile(async () => ({ identifiers: { salesforceId: '005000000000002' } }));
  expect(await seedSalesforceContext()).toMatchObject({
    orgId: identity.orgId,
    userId: identity.userId,
    discoveryPending: true,
  });
  expect(calls).toHaveLength(2);
  expect(calls[1]).toContain(identity.username);
});
test('a stale profile ID cannot replace a missing verified user', async () => {
  configurePersonProfile(async () => ({ identifiers: { salesforceId: '005000000000002' } }));
  configureSalesforceExecutor(async (args) =>
    response(args[0] === 'org' ? syntheticIdentity : { records: [], done: true }),
  );
  await expect(seedSalesforceContext()).rejects.toThrow('user identity');
});
test('aborted readiness never starts commands', async () => {
  let calls = 0;
  configureSalesforceExecutor(async () => {
    calls++;
    return response({});
  });
  await expect(seedSalesforceContext(AbortSignal.abort())).rejects.toThrow();
  expect(calls).toBe(0);
});
test('changed organization identity discards previous context', async () => {
  const api = syntheticApi([], () => [], { ...syntheticIdentity, id: '00D000000000002' });
  configureSalesforceExecutor((args, signal) => api.exec('sf', [...args], { signal }));
  await expect(enrichSalesforceContext(identity)).rejects.toThrow('changed');
});
test('unconfirmed territory candidates never become report scope', async () => {
  const api = syntheticApi();
  configureSalesforceExecutor((args, signal) => api.exec('sf', [...args], { signal }));
  const context = await enrichSalesforceContext(identity);
  expect(context.territoryField).toBeUndefined();
  expect(context.pipelineSummary?.total).toBe(0);
});
