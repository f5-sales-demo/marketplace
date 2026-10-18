import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

interface Claim {
  schemaVersion: 1;
  token: string;
  pid: number;
  bootId: string;
  processStartTicks: string;
}

const tokenPattern = /^[a-f0-9-]{36}$/;
const bootPattern = /^[a-f0-9-]{36}$/;

async function bootId(): Promise<string> {
  let value: string;
  if (process.platform === 'darwin') {
    const child = Bun.spawn(['/usr/sbin/sysctl', '-n', 'kern.bootsessionuuid'], { stdout: 'pipe', stderr: 'ignore' });
    value = (await new Response(child.stdout).text()).trim().toLowerCase();
    if ((await child.exited) !== 0) throw new Error('Process boot identity is unavailable');
  } else {
    value = (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim();
  }
  if (!bootPattern.test(value)) throw new Error('Process boot identity is unavailable');
  return value;
}

async function processStartTicks(pid: number): Promise<string | undefined> {
  if (process.platform === 'darwin') {
    // Darwin proc_bsdinfo exposes microsecond process-start identity, avoiding
    // second-resolution ps output that cannot safely distinguish PID reuse.
    const script = `import ctypes, sys
class Info(ctypes.Structure):
 _fields_=[('prefix',ctypes.c_uint32*12),('comm',ctypes.c_char*16),('name',ctypes.c_char*32),('tail',ctypes.c_uint32*6),('seconds',ctypes.c_uint64),('microseconds',ctypes.c_uint64)]
lib=ctypes.CDLL('/usr/lib/libproc.dylib',use_errno=True)
lib.proc_pidinfo.argtypes=[ctypes.c_int,ctypes.c_int,ctypes.c_uint64,ctypes.c_void_p,ctypes.c_int]
info=Info()
result=lib.proc_pidinfo(int(sys.argv[1]),3,0,ctypes.byref(info),ctypes.sizeof(info))
if result==ctypes.sizeof(info): print(info.seconds*1000000+info.microseconds)
elif result==0 and ctypes.get_errno()==3: sys.exit(3)
else: sys.exit(2)
`;
    const child = Bun.spawn(['python3', '-c', script, String(pid)], { stdout: 'pipe', stderr: 'ignore' });
    const start = (await new Response(child.stdout).text()).trim();
    const code = await child.exited;
    if (code === 3) return undefined;
    if (code !== 0 || !/^\d+$/.test(start)) throw new Error('Process identity is unavailable');
    return start;
  }
  try {
    const value = await readFile(`/proc/${pid}/stat`, 'utf8');
    const end = value.lastIndexOf(') ');
    const fields =
      end < 0
        ? []
        : value
            .slice(end + 2)
            .trim()
            .split(/\s+/);
    const start = fields[19];
    if (!/^\d+$/.test(start ?? '')) throw new Error('Malformed process identity');
    return start;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function claim(value: unknown): Claim {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== 'bootId,pid,processStartTicks,schemaVersion,token'
  )
    throw new Error('Operation lock evidence cannot be reconciled');
  const row = value as Record<string, unknown>;
  if (
    row.schemaVersion !== 1 ||
    typeof row.token !== 'string' ||
    !tokenPattern.test(row.token) ||
    !Number.isSafeInteger(row.pid) ||
    Number(row.pid) < 1 ||
    typeof row.bootId !== 'string' ||
    !bootPattern.test(row.bootId) ||
    typeof row.processStartTicks !== 'string' ||
    !/^\d+$/.test(row.processStartTicks)
  )
    throw new Error('Operation lock evidence cannot be reconciled');
  return row as unknown as Claim;
}

async function readClaim(path: string): Promise<Claim> {
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.())
    throw new Error('Operation lock evidence cannot be reconciled');
  try {
    const claimPath = join(path, 'claim.json');
    const claimStat = await lstat(claimPath);
    if (
      !claimStat.isFile() ||
      claimStat.isSymbolicLink() ||
      claimStat.nlink !== 1 ||
      claimStat.uid !== process.getuid?.() ||
      (claimStat.mode & 0o077) !== 0
    )
      throw new Error('Operation lock evidence cannot be reconciled');
    return claim(JSON.parse(await readFile(claimPath, 'utf8')));
  } catch (error) {
    if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === 'ENOENT')
      throw new Error('Operation lock evidence cannot be reconciled');
    throw error;
  }
}

/**
 * Acquire an atomic process-bound lock. A claim is reclaimed only when verified boot/process-start
 * evidence proves that its owner no longer exists, so PID reuse cannot authorize removal.
 */
export async function acquireProcessLock(path: string): Promise<() => Promise<void>> {
  if (!path.startsWith('/') || !/^\.[a-z][a-z0-9-]*-lock$/.test(basename(path)))
    throw new Error('Invalid operation lock path');
  const currentBootId = await bootId();
  const currentStart = await processStartTicks(process.pid);
  if (!currentStart) throw new Error('Current process identity is unavailable');
  const mine: Claim = {
    schemaVersion: 1,
    token: randomUUID(),
    pid: process.pid,
    bootId: currentBootId,
    processStartTicks: currentStart,
  };
  const parent = dirname(path);
  for (let attempt = 0; attempt < 4; attempt++) {
    const candidate = join(parent, `${basename(path)}.claim-${mine.token}`);
    await mkdir(candidate, { mode: 0o700 });
    await writeFile(join(candidate, 'claim.json'), JSON.stringify(mine), { mode: 0o600, flag: 'wx' });
    try {
      await rename(candidate, path);
      return async () => {
        const owned = await readClaim(path);
        if (owned.token !== mine.token) throw new Error('Operation lock ownership changed');
        await rm(path, { recursive: true });
      };
    } catch (error) {
      await rm(candidate, { recursive: true });
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' && (error as NodeJS.ErrnoException).code !== 'ENOTEMPTY')
        throw error;
    }
    let existing: Claim;
    try {
      existing = await readClaim(path);
    } catch (error) {
      // The previous owner can release between our atomic rename collision and observation.
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    const liveStart = existing.bootId === currentBootId ? await processStartTicks(existing.pid) : undefined;
    if (existing.bootId === currentBootId && liveStart === existing.processStartTicks)
      throw new Error('Operation lock is held by a live process');
    const stale = join(parent, `${basename(path)}.stale-${randomUUID()}`);
    try {
      await rename(path, stale);
      await rm(stale, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  throw new Error('Operation lock could not be acquired');
}
