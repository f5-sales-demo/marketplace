import { afterEach, describe, expect, it } from 'bun:test';
import { execGlab, type GlabExecApi } from '../../src/glab/exec';
import { hasControlChars, makeExecApi } from '../../src/tools/shared';

const NUL = String.fromCharCode(0);
const TAB = String.fromCharCode(9);
const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const DEL = String.fromCharCode(127);

describe('hasControlChars', () => {
  it('rejects NUL/control bytes and DEL but allows tab/LF/CR and normal args', () => {
    expect(hasControlChars(`a${NUL}b`)).toBe(true);
    expect(hasControlChars(`a${DEL}b`)).toBe(true);
    expect(hasControlChars(`a${String.fromCharCode(0x1b)}b`)).toBe(true);
    expect(hasControlChars(`a${TAB}b`)).toBe(false);
    expect(hasControlChars(`a${LF}b`)).toBe(false);
    expect(hasControlChars(`a${CR}b`)).toBe(false);
    expect(hasControlChars("issue list --output json --jq '.[].title'")).toBe(false);
    expect(hasControlChars('')).toBe(false);
  });
});

// A fake exec API lets us assert execGlab's cancellation guard without a real
// glab binary. `killed` is intentionally true even on success (Bun sets it on
// every reaped child), so the guard must key off empty stdout + non-zero code.
describe('execGlab cancellation guard (no false-cancel)', () => {
  it('returns output for a successful run even though Bun reports killed=true', async () => {
    const api: GlabExecApi = {
      cwd: '/tmp',
      async exec() {
        return { stdout: 'ok', stderr: '', code: 0, killed: true };
      },
    };
    const r = await execGlab(api, ['issue', 'list']);
    expect(r.stdout).toBe('ok');
    expect(r.code).toBe(0);
  });

  it('treats an actual kill (empty stdout + non-zero code) as cancelled', async () => {
    const api: GlabExecApi = {
      cwd: '/tmp',
      async exec() {
        return { stdout: '', stderr: '', code: 143, killed: true };
      },
    };
    await expect(execGlab(api, ['issue', 'list'])).rejects.toThrow('cancelled');
  });
});

describe('makeExecApi signal threading', () => {
  it('a non-aborted signal still returns output (guards the false-cancel regression)', async () => {
    const api = makeExecApi(process.cwd());
    const controller = new AbortController();
    const r = await api.exec('sh', ['-c', 'echo hello-live'], { signal: controller.signal });
    expect(r.stdout).toBe('hello-live');
    expect(r.code).toBe(0);
  });

  it('a stale, already-aborted signal does NOT false-cancel a fresh command', async () => {
    const api = makeExecApi(process.cwd());
    const controller = new AbortController();
    controller.abort(); // simulate a signal left aborted by a prior turn
    const r = await api.exec('sh', ['-c', 'echo still-runs'], { signal: controller.signal });
    // The documented bug: passing this stale signal to Bun.spawn would kill the
    // fresh process immediately. Safe threading runs it to completion instead.
    expect(r.stdout).toBe('still-runs');
    expect(r.code).toBe(0);
  });

  // NOTE: real-spawn "abort mid-run" cancellation is verified manually and via
  // the execGlab guard test above (a killed child -> empty stdout + non-zero
  // code -> "cancelled"). A live end-to-end sleep+abort test is intentionally
  // omitted: under `bun test` the runner's child-reaping interacts flakily with
  // AbortSignal-driven kills (the same code cancels deterministically outside
  // the test runner). The guard test covers the kill->cancelled contract.

  it('runs without any signal supplied', async () => {
    const api = makeExecApi(process.cwd());
    const r = await api.exec('sh', ['-c', 'echo no-signal']);
    expect(r.stdout).toBe('no-signal');
    expect(r.code).toBe(0);
  });
});

// Proves the *forwarding* contract deterministically by spying on Bun.spawn:
// a live signal must reach Bun.spawn, an already-aborted (stale) one must not.
// No real process, no sleep+abort race — we inspect the options object directly.
describe('makeExecApi forwards AbortSignal to Bun.spawn only while live', () => {
  const realSpawn = Bun.spawn;

  // A minimal fake child: empty stdout/stderr streams (truthy, so makeExecApi's
  // `!child.stdout` guard passes), a resolved `exited`, and killed=false.
  const emptyStream = () => new ReadableStream<Uint8Array>({ start: (c) => c.close() });
  const fakeChild = () => ({
    stdout: emptyStream(),
    stderr: emptyStream(),
    exited: Promise.resolve(0),
    exitCode: 0,
    killed: false,
  });

  let recordedOptions: { signal?: AbortSignal } | undefined;

  function installSpawnSpy() {
    recordedOptions = undefined;
    Bun.spawn = ((_cmd: string[], options: { signal?: AbortSignal }) => {
      recordedOptions = options;
      return fakeChild();
    }) as unknown as typeof Bun.spawn;
  }

  afterEach(() => {
    Bun.spawn = realSpawn;
  });

  it('hands a live (non-aborted) signal to Bun.spawn', async () => {
    installSpawnSpy();
    const controller = new AbortController();
    await makeExecApi('/tmp').exec('glab', ['issue', 'list'], { signal: controller.signal });
    expect(recordedOptions).toBeDefined();
    expect('signal' in (recordedOptions ?? {})).toBe(true);
    expect(recordedOptions?.signal).toBe(controller.signal);
  });

  it('withholds an already-aborted (stale) signal from Bun.spawn', async () => {
    installSpawnSpy();
    const controller = new AbortController();
    controller.abort(); // stale abort left over from a prior turn
    await makeExecApi('/tmp').exec('glab', ['issue', 'list'], { signal: controller.signal });
    expect(recordedOptions).toBeDefined();
    // The stale-abort path must build `{}` (no signal), never `{ signal }` —
    // otherwise Bun would kill the fresh child immediately (false-cancel).
    expect('signal' in (recordedOptions ?? {})).toBe(false);
  });
});
