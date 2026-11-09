import { expect, test } from 'bun:test';
import { runIsolatedClockFixture } from './isolated-clock-fixture';

test('installed final dispatcher invariants hold on a fresh runner', async () => {
  const result = await runIsolatedClockFixture('installed-final-capture.fixture.ts');
  expect(result.exitCode).toBe(0);
  expect(result.stderr).toContain('9 pass');
  expect(result.stderr).toContain('0 fail');
}, 30000);
