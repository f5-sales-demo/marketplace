/** Deterministic procfs race fixtures; these values cannot prove lock closure. */
import { expect, test } from 'bun:test';
import { readLinuxProcessGroupRecord } from '../src/ce/linux-process-group';

const record = (pid = 123, group = '321') =>
  `${pid} (a comm ) with spaces) S 1 ${group} ${Array(16).fill('0').join(' ')} 456 0\n`;

test('valid original PID and group are read once despite parentheses in comm', async () => {
  let reads = 0;
  expect(
    await readLinuxProcessGroupRecord(123, async () => {
      reads++;
      return record();
    }),
  ).toBe(321);
  expect(reads).toBe(1);
});
test('an empty procfs result requires a second valid record before using its group', async () => {
  let reads = 0;
  expect(await readLinuxProcessGroupRecord(123, async () => (++reads === 1 ? '' : record()))).toBe(321);
  expect(reads).toBe(2);
});
test('only explicit kernel disappearance can escape an empty process record', async () => {
  for (const code of ['ENOENT', 'ESRCH', 'EACCES', 'EPERM', 'EIO']) {
    let reads = 0;
    const original = Object.assign(new Error('Original procfs read failed'), { code });
    await expect(
      readLinuxProcessGroupRecord(123, async () => {
        if (++reads === 1) return '';
        throw original;
      }),
    ).rejects.toBe(original);
    expect(reads).toBe(2);
  }
});
test('persistent empty, malformed, foreign and unsafe PID/group records never prove closure', async () => {
  for (const text of ['', ' ', '123 () S 1', record(999), record(123, '-1'), record(123, '9007199254740992')]) {
    let reads = 0;
    await expect(
      readLinuxProcessGroupRecord(123, async () => {
        reads++;
        return text;
      }),
    ).rejects.toThrow('Original executor group is unavailable');
    expect(reads).toBe(text === '' ? 2 : 1);
  }
});
