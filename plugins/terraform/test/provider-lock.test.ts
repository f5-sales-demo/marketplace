import { expect, test } from 'bun:test';
import { loadXcshProviderLock, XCSH_PROVIDER_LOCK_SHA256, XCSH_PROVIDER_VERSION } from '../src/provider-lock';

test('shared XC provider lock has the exact published version and immutable digest', async () => {
  const lock = await loadXcshProviderLock();
  expect(XCSH_PROVIDER_VERSION).toBe('8.0.0');
  expect(XCSH_PROVIDER_LOCK_SHA256).toHaveLength(64);
  expect(lock).toContain('registry.terraform.io/f5-sales-demo/xcsh');
  expect(lock).toContain(`version     = "${XCSH_PROVIDER_VERSION}"`);
  expect(lock).not.toContain('dev_overrides');
});
