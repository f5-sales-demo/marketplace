import { expect, test } from 'bun:test';
import { verifyAwsTeardownCredentials } from '../../src/ce/terraform-teardown';
import { foundationPlan } from './terraform-fixtures';

test('teardown credential preflight binds account, region, profile and cancellation', async () => {
  const plan = foundationPlan(),
    calls: string[][] = [];
  const api = {
    exec: async (_command: string, args: string[]) => {
      calls.push(args);
      return { stdout: JSON.stringify({ Account: plan.intent.accountId }), stderr: '', exitCode: 0 };
    },
  };
  await verifyAwsTeardownCredentials(plan, api);
  expect(calls[0]).toEqual([
    'sts',
    'get-caller-identity',
    '--region',
    plan.intent.region,
    '--output',
    'json',
    '--profile',
    plan.intent.awsProfile,
  ]);
  await expect(verifyAwsTeardownCredentials(plan, api, AbortSignal.abort())).rejects.toThrow();
  expect(calls.length).toBe(1);
});
test('teardown credential preflight rejects expiry, malformed responses and cross-account credentials', async () => {
  const plan = foundationPlan();
  for (const response of [
    { stdout: '', stderr: 'ExpiredToken: The security token included in the request is expired', exitCode: 1 },
    { stdout: '{}', stderr: '', exitCode: 0 },
    { stdout: JSON.stringify({ Account: '999999999999' }), stderr: '', exitCode: 0 },
  ]) {
    await expect(verifyAwsTeardownCredentials(plan, { exec: async () => response })).rejects.toThrow();
  }
});
