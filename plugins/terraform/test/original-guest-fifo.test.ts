import { expect, test } from 'bun:test';
import { mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { linuxMonotonicMs } from '../src/linux-clock';
import { OriginalGuestControlFrames } from '../src/original-guest-control';
import { openOriginalGuestFifoPeer } from '../src/original-guest-fifo';

test('real FIFO transport exchanges Python frames, retains exact journals and closes naturally', async () => {
  // Source IO evidence only; no cloud/SSH or installed-runtime acceptance is claimed.
  const directory = await mkdtemp(join(tmpdir(), 'guest-fifo-source-'));
  const peer = await openOriginalGuestFifoPeer({
    root: join(directory, 'peer'),
    session: 'a'.repeat(64),
    assertOriginal: async () => {},
  });
  const script = `import os,sys
sys.path.insert(0, sys.argv[1])
from plugins.terraform.scripts.guest_control import GuestControlPort, clock_ms
read = os.open(sys.argv[2], os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW)
write = os.open(sys.argv[3], os.O_WRONLY | os.O_NONBLOCK | os.O_NOFOLLOW)
port = GuestControlPort(read, write, sys.argv[4])
value = port.receive(clock_ms() + 2000)
port.send({"received": value, "guestAcceptanceComplete": False}, clock_ms() + 2000)
os.close(read); os.close(write)
`;
  const python = await realpath(process.env.CE_TEST_PYTHON ?? '/usr/bin/python3');
  const child = Bun.spawn(
    [
      python,
      '-I',
      '-B',
      '-c',
      script,
      resolve(import.meta.dir, '../../..'),
      peer.bindings.read.path,
      peer.bindings.write.path,
      'a'.repeat(64),
    ],
    { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
  );
  try {
    const message = { id: 1, zero: 0, complete: false, text: 'é' };
    await peer.send(message, linuxMonotonicMs() + 2000);
    expect(await peer.receive(linuxMonotonicMs() + 2000)).toEqual({
      received: message,
      guestAcceptanceComplete: false,
    });
    const [code, errors] = await Promise.all([child.exited, new Response(child.stderr).text()]);
    expect(code).toBe(0);
    expect(errors).toBe('');
    expect(await readFile(join(peer.bindings.root, 'intent.private.bin'))).toEqual(
      await readFile(join(peer.bindings.root, 'delivered.private.bin')),
    );
    const decoder = new OriginalGuestControlFrames('a'.repeat(64));
    expect(decoder.push(await readFile(join(peer.bindings.root, 'observed.private.bin')))).toEqual([
      { received: message, guestAcceptanceComplete: false },
    ]);
    await peer.retire();
    await expect(peer.assertOriginal()).rejects.toThrow(/retired/);
  } finally {
    // The bounded original Python command exits itself; no timeout API sends a signal.
    await child.exited;
    await peer.retire();
    await rm(directory, { recursive: true });
  }
});

test('replaced journal path cannot redirect durable control evidence or authorize another frame', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'guest-fifo-source-'));
  const peer = await openOriginalGuestFifoPeer({
    root: join(directory, 'peer'),
    session: 'a'.repeat(64),
    assertOriginal: async () => {},
  });
  try {
    const path = join(peer.bindings.root, 'intent.private.bin');
    await rename(path, `${path}.original`);
    await writeFile(path, 'foreign', { mode: 0o600 });
    await expect(peer.assertOriginal()).rejects.toThrow(/journal/);
    await expect(peer.send({ id: 1 }, linuxMonotonicMs() + 2000)).rejects.toThrow();
    expect(await readFile(path, 'utf8')).toBe('foreign');
  } finally {
    await peer.retire();
    await rm(directory, { recursive: true });
  }
});
