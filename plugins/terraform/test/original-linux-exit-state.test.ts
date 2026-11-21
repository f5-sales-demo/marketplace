import { expect, test } from 'bun:test';
import { originalLinuxLeaderIsExiting } from '../src/original-output-stream';

test('kernel PF_EXITING marks the original leader as exiting before zombie state', () => {
  expect(originalLinuxLeaderIsExiting('R', '4194308')).toBe(true);
  expect(originalLinuxLeaderIsExiting('S', '4')).toBe(true);
  expect(originalLinuxLeaderIsExiting('Z', '4194304')).toBe(true);
});
test('live descriptor loss and stopped leaders cannot borrow the exit mapping', () => {
  for (const state of ['R', 'S', 'T', 't']) expect(originalLinuxLeaderIsExiting(state, '4194304')).toBe(false);
  for (const flags of ['', '-1', 'NaN', '18446744073709551616'])
    expect(() => originalLinuxLeaderIsExiting('R', flags)).toThrow();
});
