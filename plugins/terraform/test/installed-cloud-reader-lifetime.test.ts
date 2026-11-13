import { expect, test } from 'bun:test';
import { runIsolatedClockFixture } from './isolated-clock-fixture';

test('installed cloud lifetime and final reserve hold on a fresh runner', async () => {
  const result = await runIsolatedClockFixture('installed-cloud-reader-lifetime.fixture.ts');
  expect(result.exitCode).toBe(0);
  expect(result.stderr).toContain('5 pass');
  expect(result.stderr).toContain('0 fail');
}, 30000);
