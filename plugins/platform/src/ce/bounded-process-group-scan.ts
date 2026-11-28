/** Independently read procfs records in bounded batches. Every started read
 * settles before refusal; vanished processes are the only ignored failures.
 * This grants neither lock reclamation nor execution or capture acceptance. */
export async function assertAbsentProcessGroup(
  group: number,
  listNames: () => Promise<readonly string[]>,
  readGroup: (pid: number) => Promise<number>,
): Promise<void> {
  if (!Number.isSafeInteger(group) || group < 1) throw new Error('Original process group required');
  const pids = (await listNames())
    .filter((name) => /^\d+$/.test(name))
    .map((name) => {
      const pid = Number(name);
      if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('Original process identifier required');
      return pid;
    });
  for (let start = 0; start < pids.length; start += 32) {
    const results = await Promise.allSettled(
      pids.slice(start, start + 32).map(async (pid) => {
        try {
          if ((await readGroup(pid)) === group) throw new Error('Original executor process group remains live');
        } catch (error) {
          const code = (error as NodeJS.ErrnoException)?.code;
          if (code !== 'ENOENT' && code !== 'ESRCH') throw error;
        }
      }),
    );
    for (const result of results) if (result.status === 'rejected') throw result.reason;
  }
}
