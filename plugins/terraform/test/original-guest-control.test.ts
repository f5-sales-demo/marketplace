import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { OriginalGuestControlFrames } from '../src/original-guest-control';

const nonce = 'a'.repeat(64);
function frame(message: unknown = { type: 'guard', id: 1 }, changes: Record<string, unknown> = {}) {
  const raw = Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      kind: 'original-guest-control',
      session: nonce,
      sequence: 1,
      message,
      ...changes,
    }),
  );
  return rawFrame(raw);
}
function rawFrame(raw: Buffer) {
  const size = Buffer.alloc(4);
  size.writeUInt32BE(raw.length);
  return Buffer.concat([size, raw]);
}

test('native control frames interoperate with the original envelope without losing zero, false or Unicode', () => {
  const parent = new OriginalGuestControlFrames(nonce);
  const worker = new OriginalGuestControlFrames(nonce);
  const message = { type: 'command', id: 1, operation: 'close', zero: 0, complete: false, text: 'é' };
  expect(worker.push(parent.encode(message))).toEqual([message]);
  expect(parent.push(worker.encode({ type: 'command-result', id: 1, closed: false }))).toEqual([
    { type: 'command-result', id: 1, closed: false },
  ]);
});

test('native framing reassembles split headers and payloads and ordered coalesced frames', () => {
  const peer = new OriginalGuestControlFrames(nonce);
  const raw = frame();
  for (let i = 0; i < raw.length - 1; i++) expect(peer.push(raw.subarray(i, i + 1))).toEqual([]);
  expect(peer.push(raw.subarray(-1))).toEqual([{ type: 'guard', id: 1 }]);
  const sender = new OriginalGuestControlFrames(nonce);
  const receiver = new OriginalGuestControlFrames(nonce);
  expect(receiver.push(Buffer.concat([sender.encode({ id: 1 }), sender.encode({ id: 2 })]))).toEqual([
    { id: 1 },
    { id: 2 },
  ]);
});

for (const changes of [
  { session: 'b'.repeat(64) },
  { sequence: 2 },
  { sequence: true },
  { schemaVersion: true },
  { kind: 'foreign' },
  { extra: true },
]) {
  test(`foreign envelope permanently retires original control: ${JSON.stringify(changes)}`, () => {
    const peer = new OriginalGuestControlFrames(nonce);
    expect(() => peer.push(frame(undefined, changes))).toThrow();
    expect(() => peer.encode({ ok: true })).toThrow(/retired/);
  });
}

test('native control refuses duplicate keys, nonfinite JSON, malformed UTF8 and fractional envelope identities', () => {
  const valid = frame().subarray(4).toString();
  for (const raw of [
    Buffer.from(valid.replace('"sequence":1', '"sequence":1,"sequ\\u0065nce":1')),
    Buffer.from(valid.replace('"schemaVersion":1', '"schemaVersion":1.0')),
    Buffer.from(valid.replace('"sequence":1', '"sequence":1e0')),
    Buffer.from(valid.replace('"id":1', '"id":NaN')),
    Buffer.from(valid.replace('"id":1', '"id":1,"value":1e999')),
    Buffer.from([0xff]),
  ]) {
    const peer = new OriginalGuestControlFrames(nonce);
    expect(() => peer.push(rawFrame(raw))).toThrow();
    expect(() => peer.push(frame())).toThrow(/retired/);
  }
});

test('native control refuses zero and oversized lengths before accepting payload bytes', () => {
  for (const size of [0, 65537]) {
    const peer = new OriginalGuestControlFrames(nonce);
    const header = Buffer.alloc(4);
    header.writeUInt32BE(size);
    expect(() => peer.push(header)).toThrow(/bound/);
    expect(() => peer.encode({ ok: true })).toThrow(/retired/);
  }
});

test('partial EOF retires the original stream; complete EOF cannot authorize another command', () => {
  const partial = new OriginalGuestControlFrames(nonce);
  partial.push(frame().subarray(0, 7));
  expect(() => partial.end()).toThrow(/interrupted/);
  expect(() => partial.push(frame())).toThrow(/retired/);
  const complete = new OriginalGuestControlFrames(nonce);
  complete.push(frame());
  complete.end();
  expect(() => complete.encode({ ok: true })).toThrow(/retired/);
});

test('native encoding rejects lossy values, cycles and oversized messages without dropping evidence', () => {
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  for (const message of [{ value: Infinity }, { value: undefined }, cycle, { text: 'x'.repeat(65536) }]) {
    const peer = new OriginalGuestControlFrames(nonce);
    expect(() => peer.encode(message)).toThrow();
    expect(() => peer.encode({ ok: true })).toThrow(/retired/);
  }
});

test('native frames cross actual Python GuestControlPort pipes with natural child closure', async () => {
  // Offline wire evidence only; this never opens SSH or substitutes installed runtime acceptance.
  const python = await realpath(process.env.CE_TEST_PYTHON ?? '/usr/bin/python3');
  const pin = createHash('sha256')
    .update(await readFile(python))
    .digest('hex');
  const root = resolve(import.meta.dir, '../../..');
  const files = ['__init__.py', 'guest_pty.py', 'gcp_guest_session.py', 'guest_control.py'];
  const sourcePins = Object.fromEntries(
    await Promise.all(
      files.map(async (name) => [
        name,
        createHash('sha256')
          .update(await readFile(resolve(root, 'plugins/terraform/scripts', name)))
          .digest('hex'),
      ]),
    ),
  );
  const script = `import hashlib,importlib.machinery,importlib.util,json,sys
from pathlib import Path
scripts = Path(sys.argv[1]) / "plugins/terraform/scripts"
pins = json.loads(sys.argv[3])
class CapturedSource(importlib.machinery.SourceFileLoader):
 def get_code(self, fullname):
  raw = Path(self.path).read_bytes()
  if hashlib.sha256(raw).hexdigest() != pins[Path(self.path).name]:
   raise ValueError("Original fixture source changed")
  return self.source_to_code(raw, self.path)
for filename in ("__init__.py", "guest_pty.py", "gcp_guest_session.py", "guest_control.py"):
 name = "original_guest_wire" if filename == "__init__.py" else "original_guest_wire." + filename[:-3]
 path = scripts / filename
 loader = CapturedSource(name, str(path))
 spec = importlib.util.spec_from_file_location(name, path, loader=loader, submodule_search_locations=[str(scripts)] if filename == "__init__.py" else None)
 module = importlib.util.module_from_spec(spec)
 sys.modules[name] = module
 loader.exec_module(module)
from original_guest_wire.guest_control import GuestControlPort, clock_ms
port = GuestControlPort(0, 1, sys.argv[2])
value = port.receive(clock_ms() + 2000)
port.send({"received": value, "guestAcceptanceComplete": False}, clock_ms() + 2000)
`;
  const frames = new OriginalGuestControlFrames(nonce);
  const message = { type: 'command', id: 1, operation: 'close', complete: false, zero: 0, text: 'é' };
  const child = Bun.spawn([python, '-I', '-B', '-c', script, root, nonce, JSON.stringify(sourcePins)], {
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  child.stdin.write(frames.encode(message));
  await child.stdin.flush();
  child.stdin.end();
  const [raw, errors, code] = await Promise.all([
    new Response(child.stdout).arrayBuffer(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(errors).toBe('');
  expect(code).toBe(0);
  expect(frames.push(new Uint8Array(raw))).toEqual([{ received: message, guestAcceptanceComplete: false }]);
  frames.end();
  expect(
    createHash('sha256')
      .update(await readFile(python))
      .digest('hex'),
  ).toBe(pin);
  for (const name of files) {
    expect(
      createHash('sha256')
        .update(await readFile(resolve(root, 'plugins/terraform/scripts', name)))
        .digest('hex'),
    ).toBe(sourcePins[name]);
  }
});
