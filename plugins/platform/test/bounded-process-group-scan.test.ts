import { describe, expect, test } from 'bun:test';
import * as scans from '../src/ce/bounded-process-group-scan';

const scan = (...args: Parameters<typeof scans.assertAbsentProcessGroup>) => scans.assertAbsentProcessGroup(...args);
const missing = (code: string) => Object.assign(new Error(code), { code });
describe('bounded physical process group closure', () => {
  test('reads independent process records concurrently and waits for all of them', async () => {
    const started: number[] = [],
      done: number[] = [];
    const release: Array<() => void> = [];
    const result = scan(
      99,
      async () => ['1', '2', 'self', 'net'],
      async (pid) => {
        started.push(pid);
        await new Promise<void>((resolve) => release.push(resolve));
        done.push(pid);
        return 7;
      },
    );
    await Bun.sleep(5);
    expect(started).toEqual([1, 2]);
    expect(done).toEqual([]);
    for (const resolve of release) resolve();
    await result;
    expect(done).toEqual([1, 2]);
  });
  test('limits concurrent reads and examines every numeric entry', async () => {
    let active = 0,
      maximum = 0;
    const seen: number[] = [];
    await scan(
      99,
      async () => Array.from({ length: 97 }, (_, i) => String(i + 1)),
      async (pid) => {
        active++;
        maximum = Math.max(maximum, active);
        await Bun.sleep(1);
        seen.push(pid);
        active--;
        return 7;
      },
    );
    expect(maximum).toBeGreaterThan(1);
    expect(maximum).toBeLessThanOrEqual(32);
    expect(seen.sort((a, b) => a - b)).toEqual(Array.from({ length: 97 }, (_, i) => i + 1));
    expect(active).toBe(0);
  });
  test('refuses a live member and drains in-flight reads before rejecting', async () => {
    let settled = false;
    await expect(
      scan(
        99,
        async () => ['1', '2'],
        async (pid) => {
          if (pid === 1) return 99;
          await Bun.sleep(10);
          settled = true;
          return 7;
        },
      ),
    ).rejects.toThrow('Original executor process group remains live');
    expect(settled).toBe(true);
  });
  test('ignores only processes that vanished during observation', async () => {
    for (const code of ['ENOENT', 'ESRCH'])
      await scan(
        99,
        async () => ['1'],
        async () => {
          throw missing(code);
        },
      );
  });
  test('refuses permission and malformed process evidence', async () => {
    for (const error of [missing('EACCES'), new Error('Malformed Linux process record')])
      await expect(
        scan(
          99,
          async () => ['1'],
          async () => {
            throw error;
          },
        ),
      ).rejects.toThrow(error.message);
  });
  test('refuses failed enumeration', async () => {
    await expect(
      scan(
        99,
        async () => {
          throw missing('EACCES');
        },
        async () => 7,
      ),
    ).rejects.toThrow('EACCES');
  });
  test('rejects unsafe numeric process identifiers before reading', async () => {
    for (const name of ['0', '9007199254740992']) {
      let reads = 0;
      await expect(
        scan(
          99,
          async () => [name],
          async () => {
            reads++;
            return 7;
          },
        ),
      ).rejects.toThrow('Original process identifier required');
      expect(reads).toBe(0);
    }
  });
  test('rejects invalid group identities before enumerating', async () => {
    for (const group of [0, -1, Number.NaN, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      let lists = 0;
      await expect(
        scan(
          group,
          async () => {
            lists++;
            return [];
          },
          async () => 7,
        ),
      ).rejects.toThrow('Original process group required');
      expect(lists).toBe(0);
    }
  });
});
