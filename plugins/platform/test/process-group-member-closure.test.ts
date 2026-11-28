import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import type { RecordedProcessGroupIdentity } from '../src/ce/process-lock';
import * as locks from '../src/ce/process-lock';

const check = locks.assertRecordedProcessGroupMemberAbsent;
async function current(): Promise<RecordedProcessGroupIdentity> {
  const raw = await readFile('/proc/self/stat', 'utf8');
  const fields = raw
    .slice(raw.lastIndexOf(') ') + 2)
    .trim()
    .split(/\s+/);
  return {
    pid: process.pid,
    group: Number(fields[2]),
    start: fields[19],
    boot: (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim(),
  };
}
describe.skipIf(process.platform !== 'linux')('recorded worker process group member closure', () => {
  test('checks both a nonleader worker and its remaining group through natural exit', async () => {
    const python = process.env.CE_TEST_PYTHON ?? Bun.which('python3') ?? '';
    const script = `import os,time,json
from pathlib import Path
os.setsid()
child=os.fork()
if child==0:
 fields=Path('/proc/self/stat').read_text().split(') ')[1].split()
 print(json.dumps(dict(pid=os.getpid(),group=os.getpgrp(),start=fields[19],boot=Path('/proc/sys/kernel/random/boot_id').read_text().strip())),flush=True)
 time.sleep(0.4)
 os._exit(0)
os.waitpid(child,0)
print('member-exited',flush=True)
time.sleep(0.4)
`;
    const child = Bun.spawn([python, '-c', script], { stdout: 'pipe', stderr: 'pipe' });
    const reader = child.stdout.getReader();
    let buffered = '';
    const line = async () => {
      while (!buffered.includes('\n')) {
        const result = await reader.read();
        if (result.done) throw new Error('Original member fixture ended before its evidence');
        buffered += new TextDecoder().decode(result.value);
      }
      const at = buffered.indexOf('\n'),
        value = buffered.slice(0, at);
      buffered = buffered.slice(at + 1);
      return value;
    };
    try {
      const member = JSON.parse(await line()) as RecordedProcessGroupIdentity;
      expect(member.pid).not.toBe(member.group);
      await expect(check(member)).rejects.toThrow('Original recorded process remains live');
      expect(await line()).toBe('member-exited');
      await expect(check(member)).rejects.toThrow('Original executor process group remains live');
      expect(await child.exited).toBe(0);
      await expect(check(member)).resolves.toBeUndefined();
      await expect(locks.assertRecordedProcessGroupAbsent(member)).rejects.toThrow(
        'Original recorded process group identity required',
      );
    } finally {
      await child.exited;
      while (!(await reader.read()).done) {}
      reader.releaseLock();
    }
  }, 5000);
  test('an original worker still alive outside the recorded group refuses closure', async () => {
    const member = { ...(await current()), group: 2147483647 };
    await expect(check(member)).rejects.toThrow('Original recorded process remains live');
  });
  test('a prior boot cannot retain the old worker or group', async () => {
    const member = { ...(await current()), boot: '00000000-0000-0000-0000-000000000000' };
    await expect(check(member)).resolves.toBeUndefined();
  });
  test('malformed group member identities are refused', async () => {
    const member = await current();
    for (const value of [
      { ...member, group: 0 },
      { ...member, group: Number.NaN },
      { ...member, pid: 0 },
      { ...member, start: 'unknown' },
      { ...member, boot: 'unknown' },
      { ...member, extra: true },
    ])
      await expect(check(value)).rejects.toThrow();
  });
});
