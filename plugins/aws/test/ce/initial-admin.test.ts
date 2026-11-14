import { expect, it } from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';
import { normalizeAwsAdminSshPublicKey } from '../../src/ce/initial-admin';

function wire(...parts: Buffer[]) {
  return Buffer.concat(
    parts.flatMap((part) => {
      const n = Buffer.alloc(4);
      n.writeUInt32BE(part.length);
      return [n, part];
    }),
  );
}
const raw = generateKeyPairSync('ed25519').publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
const key = `ssh-ed25519 ${wire(Buffer.from('ssh-ed25519'), raw).toString('base64')}`;
it('normalizes a single public key without retaining its comment', () => {
  expect(normalizeAwsAdminSshPublicKey(`${key} diagnostic rn0`)).toBe(key);
});
it('rejects header substitution, truncated keys, trailing bytes and multiline input', () => {
  const wrong = wire(Buffer.from('ssh-rsa'), raw);
  const short = wire(Buffer.from('ssh-ed25519'), raw.subarray(1));
  const trailing = Buffer.concat([wire(Buffer.from('ssh-ed25519'), raw), Buffer.from([0])]);
  for (const value of [
    `ssh-ed25519 ${wrong.toString('base64')}`,
    `ssh-ed25519 ${short.toString('base64')}`,
    `ssh-ed25519 ${trailing.toString('base64')}`,
    `${key}\n${key}`,
    `${key}\0`,
  ])
    expect(() => normalizeAwsAdminSshPublicKey(value)).toThrow('OpenSSH public key');
});
