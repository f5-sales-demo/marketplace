/** Offline command-port fixtures prove orchestration only, never GCP capture. */
import { expect, test } from 'bun:test';
import { runOriginalGuestCaptureRound } from '../src/guest-capture-round';

const identity = { instanceId: '123', observerId: '456', tokenSha256: 'a'.repeat(64), ownershipSha256: 'b'.repeat(64) };
const id = 'c'.repeat(16);
type Message = Record<string, unknown>;
function fixture() {
  let clock = 1000,
    sequence = 0;
  const requests: Message[] = [],
    events: Message[] = [];
  const scopes: Record<string, string[]> = {
    root: ['health', 'diagnosis', 'status', 'execcli'],
    status: ['vpm'],
    execcli: ['date', 'ip-address', 'ip-route', 'journalctl', 'crictl-ps-a', 'crictl-inspect', 'crictl-logs'],
    journal: ['--help', '-u', '-o', '--no-pager', '--utc'],
    'cri-logs': ['--help', '--tail'],
  };
  const controls = { mutate: (_request: Message, _evidence: Message) => {}, fail: '', delay: 1 };
  const hashes: Record<string, string> = {};
  const port = {
    async assertOriginal() {},
    async persist(event: Message) {
      events.push(structuredClone(event));
    },
    async command(request: Message) {
      requests.push(structuredClone(request));
      const kind = request.operation === 'discover' ? `completion-${request.scope}` : String(request.kind);
      const started = clock;
      clock += controls.delay;
      if (kind === controls.fail) throw new Error('Offline retained failure');
      const hash = (++sequence).toString(16).padStart(64, '0');
      hashes[kind] = hash;
      const evidence: Message = {
        schemaVersion: 1,
        kind,
        ...identity,
        sha256: hash,
        commandSha256: 'd'.repeat(64),
        path: `/private/guest-${sequence}.output.private.bin`,
        startedMonotonicMs: started,
        finishedMonotonicMs: clock,
        truncated: false,
        guestAcceptanceComplete: false,
        ...(request.operation === 'discover' ? { availableCommands: scopes[String(request.scope)] } : {}),
        ...(String(request.kind).endsWith('-list') ? { containerIds: [id] } : {}),
        ...(String(request.kind).endsWith('-full')
          ? {
              logSelection: 'all-retained',
              helpSha256: hashes[request.kind === 'vpm-journal-full' ? 'journal-help' : 'cri-logs-help'],
            }
          : {}),
      };
      controls.mutate(request, evidence);
      return {
        type: 'command-result',
        id: sequence,
        operation: request.operation,
        anchor: 'e'.repeat(64),
        guestAcceptanceComplete: false,
        evidence: [evidence],
      };
    },
  };
  return { port, requests, events, scopes, controls, clock: () => clock };
}

test('round derives every inspection and full log from the original fresh listing', async () => {
  const f = fixture();
  const report = await runOriginalGuestCaptureRound(f.port, identity, 500000, f.clock);
  expect(report.status).toBe('captured');
  expect(report.guestAcceptanceComplete).toBe(false);
  expect(report.bootstrapCoverageVerified).toBe(false);
  expect(f.requests.filter((r) => r.containerId)).toEqual([
    { operation: 'capture', kind: 'cri-inspect', containerId: id },
    { operation: 'capture', kind: 'cri-logs-full', containerId: id },
  ]);
  expect(f.events.at(-1)?.phase).toBe('round-captured');
});

for (const change of [
  { instanceId: '999' },
  { observerId: '999' },
  { tokenSha256: 'f'.repeat(64) },
  { ownershipSha256: 'f'.repeat(64) },
  { truncated: true },
  { guestAcceptanceComplete: true },
  { finishedMonotonicMs: 0 },
  { sha256: 'invalid' },
]) {
  test(`foreign or incomplete evidence stops the same round: ${JSON.stringify(change)}`, async () => {
    const f = fixture();
    f.controls.mutate = (_r, item) => Object.assign(item, change);
    await expect(runOriginalGuestCaptureRound(f.port, identity, 500000, f.clock)).rejects.toThrow();
    expect(f.requests).toHaveLength(1);
    expect(f.events.at(-1)?.phase).toBe('round-refused');
  });
}

test('missing supported command records a refusal without inventing a shell command', async () => {
  const f = fixture();
  f.scopes.execcli = f.scopes.execcli.filter((s) => s !== 'journalctl');
  await expect(runOriginalGuestCaptureRound(f.port, identity, 500000, f.clock)).rejects.toThrow(/supported/);
  expect(f.requests.some((r) => r.kind === 'journal-help')).toBe(false);
  expect(f.events.at(-1)?.guestAcceptanceComplete).toBe(false);
});

for (const ids of [[], [id, id], [id, `${id}00`], [id, 'not-an-id']]) {
  test(`empty or ambiguous listing cannot select container commands: ${JSON.stringify(ids)}`, async () => {
    const f = fixture();
    f.controls.mutate = (r, item) => {
      if (r.kind === 'cri-list') item.containerIds = ids;
    };
    await expect(runOriginalGuestCaptureRound(f.port, identity, 500000, f.clock)).rejects.toThrow(/listing/);
    expect(f.requests.some((r) => r.containerId)).toBe(false);
  });
}

test('lost original command leaves durable partial progress and never retries it', async () => {
  const f = fixture();
  f.controls.fail = 'vpm-journal-full';
  await expect(runOriginalGuestCaptureRound(f.port, identity, 500000, f.clock)).rejects.toThrow();
  expect(f.requests.filter((r) => r.kind === 'vpm-journal-full')).toHaveLength(1);
  expect(f.events.filter((e) => e.phase === 'command-captured').length).toBeGreaterThan(0);
  expect(f.events.at(-1)?.phase).toBe('round-refused');
});

test('log selection and help attribution cannot be replaced by a short tail', async () => {
  const f = fixture();
  f.controls.mutate = (r, item) => {
    if (r.kind === 'cri-logs-full') {
      item.logSelection = 'tail-only';
      item.helpSha256 = 'f'.repeat(64);
    }
  };
  await expect(runOriginalGuestCaptureRound(f.port, identity, 500000, f.clock)).rejects.toThrow(/log/);
});

test('delayed command completion cannot reset the original round deadline', async () => {
  const f = fixture();
  f.controls.delay = 10000;
  await expect(runOriginalGuestCaptureRound(f.port, identity, 25000, f.clock)).rejects.toThrow(/deadline/);
  expect(f.requests).toHaveLength(3);
  expect(f.events.at(-1)?.phase).toBe('round-refused');
});
