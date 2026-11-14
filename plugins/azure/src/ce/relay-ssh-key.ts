import { createPrivateKey, createPublicKey } from 'node:crypto';

const require = (condition: unknown, message: string): void => {
  if (!condition) throw Error(`Azure relay SSH identity: ${message}`);
};

export function azureRelaySshPublicKey(privateKey: string): string {
  const key = createPublicKey(createPrivateKey(privateKey));
  require(key.asymmetricKeyType === 'ed25519', 'SSH key type differs');
  const jwk = key.export({ format: 'jwk' });
  const field = (bytes: Buffer) => {
    const prefix = Buffer.alloc(4);
    prefix.writeUInt32BE(bytes.length);
    return Buffer.concat([prefix, bytes]);
  };
  require(typeof jwk.x === 'string', 'SSH key unavailable');
  return `ssh-ed25519 ${Buffer.concat([field(Buffer.from('ssh-ed25519')), field(Buffer.from(jwk.x as string, 'base64url'))]).toString('base64')}`;
}
