import { expect, test } from 'bun:test';
import { assertAbsentProcessGroup } from '../src/ce/bounded-process-group-scan';
import { readLinuxProcessGroupRecord, readRejectedLinuxProcessGroupRecord } from '../src/ce/linux-process-group';

const record = (pid = 123, group = '321', state = 'S', session = '321', parent = '1') =>
  `${pid} (fixture ) with spaces) ${[state, parent, group, session, ...Array(15).fill('0'), '456', '0'].join(' ')}\n`;
const dead = record(123, '-1', 'X', '-1', '0');
const syscall = (code: string) => Object.assign(new Error('Procfs observation failed'), { code });

test('dead-task sentinels require a fresh complete record before its group can be used', async () => {
  let reads = 0;
  expect(await readLinuxProcessGroupRecord(123, async () => (++reads === 1 ? dead : record()))).toBe(321);
  expect(reads).toBe(2);
});
test('dead-task disappearance propagates only the actual fresh syscall error into the scanner', async () => {
  for (const code of ['ENOENT', 'ESRCH']) {
    const original = syscall(code);
    let reads = 0;
    await expect(
      readLinuxProcessGroupRecord(123, async () => {
        if (++reads === 1) return dead;
        throw original;
      }),
    ).rejects.toBe(original);
    expect(reads).toBe(2);
    expect(readRejectedLinuxProcessGroupRecord(original)).toBeUndefined();
    reads = 0;
    await assertAbsentProcessGroup(
      321,
      async () => ['123'],
      (pid) =>
        readLinuxProcessGroupRecord(pid, async () => {
          if (++reads === 1) return dead;
          throw original;
        }),
    );
    expect(reads).toBe(2);
  }
});
test('dead-task permission and I/O failures remain the exact original refusal', async () => {
  for (const code of ['EACCES', 'EPERM', 'EIO']) {
    const original = syscall(code);
    let reads = 0;
    await expect(
      assertAbsentProcessGroup(
        321,
        async () => ['123'],
        (pid) =>
          readLinuxProcessGroupRecord(pid, async () => {
            if (++reads === 1) return dead;
            throw original;
          }),
      ),
    ).rejects.toBe(original);
    expect(reads).toBe(2);
  }
});
test('persistent dead-task sentinels refuse after two reads and retain the exact rejected record', async () => {
  let reads = 0;
  let original: unknown;
  try {
    await readLinuxProcessGroupRecord(123, async () => {
      reads++;
      return dead;
    });
  } catch (error) {
    original = error;
  }
  expect(String(original)).toContain('Original executor group is unavailable');
  expect(reads).toBe(2);
  const evidence = readRejectedLinuxProcessGroupRecord(original);
  expect(evidence?.truncated).toBe(false);
  expect(Buffer.from(evidence?.recordUtf8Base64 ?? '', 'base64').toString()).toBe(dead);
  expect(evidence?.validation.groupNumeric).toBe(false);
});
test('empty and dead-task boundaries share a two-read limit without accepting a malformed second record', async () => {
  for (const [first, second] of [
    ['', dead],
    [dead, ''],
    [dead, record(999)],
    [dead, 'malformed'],
  ]) {
    let reads = 0;
    await expect(readLinuxProcessGroupRecord(123, async () => (++reads === 1 ? first : second))).rejects.toThrow(
      'Original executor group is unavailable',
    );
    expect(reads).toBe(2);
  }
});
test('foreign, incomplete and unrelated negative-group records never trigger dead-task recovery', async () => {
  for (const text of [
    record(999, '-1', 'X', '-1', '0'),
    '123 (fixture) X 0 -1 -1',
    record(123, '-1', 'S', '-1', '0'),
    record(123, '-1', 'X', '321', '0'),
    record(123, '-1', 'X', '-1', '1'),
  ]) {
    let reads = 0;
    await expect(
      readLinuxProcessGroupRecord(123, async () => {
        reads++;
        return text;
      }),
    ).rejects.toThrow('Original executor group is unavailable');
    expect(reads).toBe(1);
  }
});
test('a valid group on the fresh read still refuses closure of an original group member', async () => {
  let reads = 0;
  await expect(
    assertAbsentProcessGroup(
      321,
      async () => ['123'],
      (pid) => readLinuxProcessGroupRecord(pid, async () => (++reads === 1 ? dead : record())),
    ),
  ).rejects.toThrow('Original executor process group remains live');
  expect(reads).toBe(2);
});
test('a dead-state record with a valid group remains observed with no extra read or invented absence', async () => {
  let reads = 0;
  expect(
    await readLinuxProcessGroupRecord(123, async () => {
      reads++;
      return record(123, '321', 'X');
    }),
  ).toBe(321);
  expect(reads).toBe(1);
  await expect(
    assertAbsentProcessGroup(
      321,
      async () => ['123'],
      (pid) => readLinuxProcessGroupRecord(pid, async () => record(123, '321', 'X')),
    ),
  ).rejects.toThrow('Original executor process group remains live');
});
