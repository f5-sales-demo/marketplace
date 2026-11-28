/** Canonical public-key framing tests; no host or login is trusted here. */
import { expect, test } from 'bun:test';
import { inspectGcpWireHostKey } from '../src/gcp-wire-key';

const field = (raw: Buffer) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(raw.length);
  return Buffer.concat([length, raw]);
};
const exponent = Buffer.from([1, 0, 1]);
const modulus = Buffer.concat([Buffer.from([0]), Buffer.alloc(384, 0x81)]);
const wire = (e = exponent, n = modulus) => Buffer.concat([field(Buffer.from('ssh-rsa')), field(e), field(n)]);
const line = (raw = wire()) => Buffer.from(`192.0.2.1 ssh-rsa ${raw.toString('base64')}\n`);
test('CE RSA public keys are parsed explicitly while observer defaults remain Ed25519', () => {
  const key = inspectGcpWireHostKey(line(), '192.0.2.1', 'ssh-rsa');
  expect(key.knownHostsLine).toBe(line().toString().trimEnd());
  expect(key.fingerprint).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);
  expect(() => inspectGcpWireHostKey(line(), '192.0.2.1')).toThrow();
});
test('noncanonical, short, negative, trailing or foreign RSA fields refuse', () => {
  for (const raw of [
    wire(Buffer.from([0])),
    wire(Buffer.from([0, 1, 0, 1])),
    wire(Buffer.from([0x81])),
    wire(exponent, Buffer.from([0, 1])),
    wire(exponent, Buffer.concat([Buffer.from([0]), Buffer.alloc(256, 0x81)])),
    Buffer.concat([wire(), Buffer.from([0])]),
    wire().subarray(0, -1),
    Buffer.concat([field(Buffer.from('ssh-ed25519')), field(exponent), field(modulus)]),
  ])
    expect(() => inspectGcpWireHostKey(line(raw), '192.0.2.1', 'ssh-rsa')).toThrow();
});
