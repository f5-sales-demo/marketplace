import { expect, test } from 'bun:test';
import { linuxMonotonicMs } from '../src/linux-clock';
import { OriginalGuestControlParent } from '../src/original-guest-parent';

type Message = Record<string, unknown>;
const anchor = 'a'.repeat(64),
  request = 'b'.repeat(64);
const binding = {
  project: 'example-project',
  region: 'us-central1',
  site_name: 'example-site',
  node_name: 'example-node',
  zone: 'us-central1-a',
  instance_id: '123',
  observer_name: 'example-observer',
  observer_id: '456',
  observer_address: '192.0.2.1',
  address: '192.0.2.2',
  original_interfaces: ['192.0.2.3', '192.0.2.2'],
  token_node: 'example-node',
  token_site: 'example-site',
  token_expires: 4102444800,
  token_sha256: 'c'.repeat(64),
  ownership_sha256: 'd'.repeat(64),
  observer_key: '/private/observer-key',
  ce_key: '/private/ce-key',
  observer_hosts: '/private/observer-hosts',
  ce_hosts: '/private/ce-hosts',
  observer_algorithm: 'ssh-ed25519',
  ce_algorithm: 'rsa-sha2-512',
};
const bound = () => ({ type: 'worker-bound', requestSha256: request, anchor, binding: structuredClone(binding) });
const ready = () => ({ type: 'worker-ready', requestSha256: request, anchor });
const guard = (id: number, kind = 'inputs', role?: string): Message => ({
  type: 'guard',
  id,
  guard: kind,
  anchor,
  instanceId: '123',
  observerId: '456',
  ...(role ? { role } : {}),
});
const guards = (start = 1) => [
  guard(start),
  guard(start + 1, 'original'),
  guard(start + 2, 'trust', 'observer'),
  guard(start + 3, 'trust', 'ce'),
];
const result = (id = 1, operation = 'capture', extra: Message = {}) => ({
  type: 'command-result',
  id,
  operation,
  anchor,
  guestAcceptanceComplete: false,
  evidence: [{ path: '/private/output', sha256: 'e'.repeat(64), truncated: true }],
  ...extra,
});

class Peer {
  queue: Message[] = [bound(), ...guards(), ready()];
  sent: Message[] = [];
  retired = 0;
  checks = 0;
  waiting?: (message: Message) => void;
  async send(message: Message, _deadline: number) {
    this.sent.push(message);
  }
  async receive(_deadline: number): Promise<Message> {
    const next = this.queue.shift();
    return (
      next ??
      new Promise((resolve) => {
        this.waiting = resolve;
      })
    );
  }
  async assertOriginal() {
    this.checks++;
  }
  async retire() {
    this.retired++;
  }
}
function fixture(options: { operation?: number; closure?: number; startup?: number; clock?: () => number } = {}) {
  const peer = new Peer(),
    calls: string[] = [];
  const now = { value: 1000 };
  const controls = { refuseOriginal: false, lateOriginal: false };
  const callbacks = {
    async inputs() {
      calls.push('inputs');
    },
    async original(value: Message) {
      expect(value).toEqual(binding);
      calls.push('original');
      if (controls.refuseOriginal) throw new Error('Original ownership changed');
      if (controls.lateOriginal) now.value = options.operation ?? 100000;
    },
    async trust(value: Message, role: 'observer' | 'ce') {
      expect(value).toEqual(binding);
      calls.push(`trust:${role}`);
    },
  };
  const parent = new OriginalGuestControlParent({
    peer,
    binding: structuredClone(binding),
    requestSha256: request,
    operationDeadlineMs: options.operation ?? 100000,
    closureDeadlineMs: options.closure ?? 100001,
    startupDeadlineMs: options.startup ?? 2000,
    guards: callbacks,
    monotonic: options.clock ?? (() => now.value),
  });
  return { peer, calls, now, parent, callbacks, controls };
}

test('parent independently approves every original guard and preserves incomplete evidence', async () => {
  const f = fixture();
  await f.parent.initialize();
  expect(f.peer.sent[0]).toEqual({ type: 'binding-approved', requestSha256: request, anchor, approved: true });
  f.peer.queue.push(...guards(5), result());
  const captured = await f.parent.command({ operation: 'capture', kind: 'vpm-journal' });
  expect(captured.guestAcceptanceComplete).toBe(false);
  expect(captured.evidence).toEqual(result().evidence);
  expect(f.calls.filter((value) => value === 'original')).toHaveLength(2);
  expect(f.calls.filter((value) => value === 'trust:ce')).toHaveLength(2);
  expect(f.peer.sent.filter((value) => value.type === 'command')).toEqual([
    { type: 'command', id: 1, operation: 'capture', kind: 'vpm-journal' },
  ]);
});

test('missing original ownership or either serial guard cannot establish readiness', async () => {
  for (const index of [1, 2, 3]) {
    const f = fixture();
    const checks = guards()
      .filter((_value, position) => position !== index)
      .map((value, position) => ({ ...value, id: position + 1 }));
    f.peer.queue = [bound(), ...checks, ready()];
    await expect(f.parent.initialize()).rejects.toThrow(/guard/);
    expect(f.peer.retired).toBe(1);
  }
});

for (const change of [
  { anchor: 'f'.repeat(64) },
  { instanceId: '999' },
  { observerId: '999' },
  { id: true },
  { id: 2 },
  { extra: true },
  { role: 'ce' },
]) {
  test(`foreign guard refuses before approval: ${JSON.stringify(change)}`, async () => {
    const f = fixture();
    f.peer.queue = [bound(), { ...guard(1), ...change }];
    await expect(f.parent.initialize()).rejects.toThrow();
    expect(f.peer.sent.filter((value) => value.type === 'guard-result')).toEqual([]);
    expect(f.peer.retired).toBe(1);
  });
}

test('guard failure and late completion never issue approval', async () => {
  const f = fixture();
  f.callbacks.inputs = async () => {
    throw new Error('Original fixture changed');
  };
  // Callbacks were captured at construction; replacement cannot bypass or redirect them.
  await f.parent.initialize();
  const late = fixture({ operation: 2000, closure: 2500 });
  await late.parent.initialize();
  late.peer.queue.push(...guards(5), result());
  late.now.value = 2000;
  await expect(late.parent.command({ operation: 'capture', kind: 'vpm' })).rejects.toThrow(/deadline/);
  expect(late.peer.sent.filter((value) => value.type === 'command')).toEqual([]);
});

test('expired operation permits only closure within the original fixed reserve', async () => {
  const f = fixture({ operation: 2000, closure: 2500 });
  await f.parent.initialize();
  f.now.value = 2001;
  f.peer.queue.push(guard(5), result(1, 'close', { closed: true }));
  expect((await f.parent.command({ operation: 'close' })).closed).toBe(true);
  await expect(f.parent.command({ operation: 'capture', kind: 'vpm' })).rejects.toThrow(/lifecycle/);
  const expired = fixture({ operation: 2000, closure: 2500 });
  await expired.parent.initialize();
  expired.now.value = 2500;
  await expect(expired.parent.command({ operation: 'close' })).rejects.toThrow(/deadline/);
  expect(expired.peer.sent.filter((value) => value.type === 'command')).toEqual([]);
});

test('close cannot request fresh cloud ownership or trust through its reserve', async () => {
  const f = fixture({ operation: 2000, closure: 2500 });
  await f.parent.initialize();
  f.now.value = 2001;
  f.peer.queue.push(guard(5, 'original'));
  await expect(f.parent.command({ operation: 'close' })).rejects.toThrow(/closing/);
  expect(f.calls.filter((value) => value === 'original')).toHaveLength(1);
});

for (const change of [
  { id: true },
  { id: 2 },
  { anchor: 'f'.repeat(64) },
  { guestAcceptanceComplete: true },
  { extra: true },
]) {
  test(`foreign or promoted command result refuses: ${JSON.stringify(change)}`, async () => {
    const f = fixture();
    await f.parent.initialize();
    f.peer.queue.push(...guards(5), result(1, 'capture', change));
    await expect(f.parent.command({ operation: 'capture', kind: 'vpm' })).rejects.toThrow();
    expect(f.peer.retired).toBe(1);
  });
}

test('concurrent commands cannot submit a second request', async () => {
  const f = fixture();
  await f.parent.initialize();
  const first = f.parent.command({ operation: 'capture', kind: 'vpm' });
  await Promise.resolve();
  await expect(f.parent.command({ operation: 'capture', kind: 'vpm' })).rejects.toThrow(/lifecycle/);
  while (!f.peer.waiting) await Bun.sleep(1);
  f.peer.waiting(guard(5));
  f.peer.queue = [guard(6, 'original'), guard(7, 'trust', 'observer'), guard(8, 'trust', 'ce'), result()];
  await first;
  expect(f.peer.sent.filter((value) => value.type === 'command')).toHaveLength(1);
});

test('timed-out startup retains pending work and rejects late authority without signals', async () => {
  const now = linuxMonotonicMs();
  const f = fixture({ operation: now + 1000, closure: now + 1200, startup: now + 50, clock: linuxMonotonicMs });
  f.peer.queue = [];
  await expect(f.parent.initialize()).rejects.toThrow(/deadline/);
  expect(f.parent.pendingOperations()).toBe(1);
  expect(f.peer.retired).toBe(1);
  expect(f.peer.waiting).toBeDefined();
  f.peer.waiting?.(bound());
  await f.parent.settlePending();
  expect(f.parent.pendingOperations()).toBe(0);
  expect(f.peer.sent).toEqual([]);
});

test('failed original ownership and late guard completion cannot approve a guard or resume capture', async () => {
  for (const late of [false, true]) {
    const f = fixture();
    await f.parent.initialize();
    f.controls.refuseOriginal = !late;
    f.controls.lateOriginal = late;
    f.peer.queue.push(...guards(5), result());
    await expect(f.parent.command({ operation: 'capture', kind: 'vpm' })).rejects.toThrow(
      late ? /deadline/ : /ownership|guards retired/,
    );
    expect(
      f.peer.sent.filter((value) => value.type === 'guard-result' && value.id === 6 && value.approved === true),
    ).toEqual([]);
    expect(f.peer.retired).toBe(1);
    await expect(f.parent.command({ operation: 'capture', kind: 'vpm' })).rejects.toThrow(/lifecycle/);
  }
});

test('supported operations reject injected commands, foreign fields and malformed container IDs before sending', async () => {
  for (const command of [
    { operation: 'capture', kind: 'vpm; shell' },
    { operation: 'capture', kind: 'vpm', command: 'shell' },
    { operation: 'capture', kind: 'cri-logs', containerId: `${'a'.repeat(12)}; id` },
    { operation: 'close', timeout: 1000 },
  ]) {
    const f = fixture();
    await f.parent.initialize();
    await expect(f.parent.command(command)).rejects.toThrow(/Supported/);
    expect(f.peer.sent.filter((value) => value.type === 'command')).toEqual([]);
  }
});

test('typed failed capture preserves evidence and allows only original closure without replay', async () => {
  const f = fixture();
  await f.parent.initialize();
  f.controls.refuseOriginal = true;
  f.peer.queue.push(guard(5, 'original'), {
    type: 'command-failure',
    id: 1,
    operation: 'capture',
    anchor,
    guestAcceptanceComplete: false,
    errorType: 'ValueError',
    evidence: result().evidence,
  });
  await expect(f.parent.command({ operation: 'capture', kind: 'vpm-journal' })).rejects.toThrow(/incomplete/);
  expect(f.peer.sent.find((value) => value.type === 'guard-result' && value.id === 5)?.approved).toBe(false);
  expect(f.peer.retired).toBe(0);
  await expect(f.parent.command({ operation: 'capture', kind: 'vpm' })).rejects.toThrow(/lifecycle/);
  f.peer.queue.push(guard(6), result(2, 'close', { closed: true }));
  expect((await f.parent.command({ operation: 'close' })).closed).toBe(true);
  expect(f.peer.sent.filter((value) => value.type === 'command').map((value) => value.operation)).toEqual([
    'capture',
    'close',
  ]);
});
