import { expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { qualifySalesforceLifecycle } from '../scripts/qualify-salesforce-lifecycle';

test('qualification exercises independent readiness, hidden context and setup boundaries', async () => {
  const runtime =
    process.env.SALESFORCE_QUALIFICATION_RUNTIME ??
    resolve(import.meta.dir, '../plugins/salesforce/node_modules/@f5-sales-demo/xcsh');
  const receipt = await qualifySalesforceLifecycle(runtime, resolve(import.meta.dir, '../plugins/salesforce'));
  expect(receipt.passed).toBe(true);
  expect(receipt.scenarios).toEqual(
    expect.arrayContaining([
      'cli-missing',
      'expired',
      'permission-denied',
      'network',
      'rate-limited',
      'not-authenticated',
      'invalid-response',
      'ready',
      'setup-review-only',
      'hint-absent',
      'hint-present',
      'hint-unavailable',
      'hint-failed',
      'human-profile',
      'service-profile',
      'unknown-profile',
      'session-theme-and-shutdown',
    ]),
  );
  expect(receipt.setupExecuted).toBe(false);
  expect(receipt.serviceProbed).toBe(false);
  expect(receipt.tools).toHaveLength(6);
});
