import { createHash } from 'node:crypto';

type WireAlgorithm = 'ssh-ed25519' | 'ssh-rsa';
/** One canonical address-bound public key. RSA wire names do not authorize SHA-1 signatures. */
export function inspectGcpWireHostKey(stdout: Buffer, address: string, algorithm: WireAlgorithm = 'ssh-ed25519') {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(stdout);
  if (
    !text.endsWith('\n') ||
    text.indexOf('\n') !== text.length - 1 ||
    Array.from(text.slice(0, -1)).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    throw new Error('One complete original VM wire key required');
  const line = text.slice(0, -1),
    fields = line.split(' ');
  if (
    fields.length !== 3 ||
    fields[0] !== address ||
    fields[1] !== algorithm ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(fields[2])
  )
    throw new Error('Original VM address and supported host-key algorithm required');
  const bytes = Buffer.from(fields[2], 'base64');
  if (bytes.toString('base64') !== fields[2] || bytes.length > 65536)
    throw new Error('Complete canonical original wire key required');
  let offset = 0;
  const field = () => {
    if (offset + 4 > bytes.length) throw new Error('Complete canonical original wire key required');
    const size = bytes.readUInt32BE(offset);
    offset += 4;
    if (size < 1 || offset + size > bytes.length) throw new Error('Complete canonical original wire key required');
    const result = bytes.subarray(offset, offset + size);
    offset += size;
    return result;
  };
  if (field().toString('ascii') !== algorithm) throw new Error('Original wire key algorithm differs');
  if (algorithm === 'ssh-ed25519') {
    if (field().length !== 32 || offset !== bytes.length)
      throw new Error('Complete canonical original Ed25519 wire key required');
  } else {
    const integer = () => {
      const raw = field();
      if (
        (raw[0] & 0x80) !== 0 ||
        raw.every((byte) => byte === 0) ||
        (raw.length > 1 && raw[0] === 0 && (raw[1] & 0x80) === 0)
      )
        throw new Error('Canonical positive original RSA public integer required');
      return raw[0] === 0 ? raw.subarray(1) : raw;
    };
    const exponent = integer(),
      modulus = integer();
    const bits = (modulus.length - 1) * 8 + 32 - Math.clz32(modulus[0]);
    if (
      exponent.length > 8 ||
      (exponent[exponent.length - 1] & 1) !== 1 ||
      (exponent.length === 1 && exponent[0] < 3) ||
      bits < 3072 ||
      (modulus[modulus.length - 1] & 1) !== 1 ||
      offset !== bytes.length
    )
      throw new Error('Original RSA public key must use canonical integers and at least 3072 bits');
  }
  return {
    knownHostsLine: line,
    fingerprint: `SHA256:${createHash('sha256').update(bytes).digest('base64').replace(/=+$/, '')}`,
  };
}
