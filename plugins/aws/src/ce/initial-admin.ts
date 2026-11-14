import type { AwsCeIntent } from './types';

/** Accept one OpenSSH public key; private material never enters the CE plan. */
export function normalizeAwsAdminSshPublicKey(value: unknown): string {
  const fail = (): never => {
    throw new Error('Administrator SSH key must be a valid OpenSSH public key');
  };
  if (typeof value !== 'string' || value.length > 16384 || /[\r\n\0]/.test(value)) return fail();
  const parts = value.trim().split(/[ \t]+/);
  const algorithm = parts[0],
    encoded = parts[1];
  if (!algorithm || !encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return fail();
  const blob = Buffer.from(encoded, 'base64');
  if (blob.toString('base64') !== encoded) return fail();
  let offset = 0;
  const field = () => {
    if (offset + 4 > blob.length) return fail();
    const length = blob.readUInt32BE(offset);
    offset += 4;
    if (!length || offset + length > blob.length) return fail();
    const result = blob.subarray(offset, offset + length);
    offset += length;
    return result;
  };
  if (field().toString('ascii') !== algorithm) return fail();
  if (algorithm === 'ssh-ed25519') {
    if (field().length !== 32) return fail();
  } else if (algorithm === 'ssh-rsa') {
    for (const integer of [field(), field()])
      if (integer[0] & 0x80 || !integer.some((byte) => byte !== 0)) return fail();
  } else if (/^ecdsa-sha2-nistp(?:256|384|521)$/.test(algorithm)) {
    const curve = field().toString('ascii');
    const point = field();
    const lengths: Record<string, number> = { nistp256: 65, nistp384: 97, nistp521: 133 };
    if (algorithm !== `ecdsa-sha2-${curve}` || point.length !== lengths[curve] || point[0] !== 4) return fail();
  } else return fail();
  if (offset !== blob.length) return fail();
  return `${algorithm} ${encoded}`;
}

export function awsInitialAdminSettings(intent: AwsCeIntent): Record<string, unknown> {
  return intent.adminSshPublicKey === undefined
    ? {}
    : {
        admin_user_credentials: { ssh_key: normalizeAwsAdminSshPublicKey(intent.adminSshPublicKey) },
      };
}

export function assertAwsAdminPrebootDevices(intent: AwsCeIntent): void {
  if (intent.adminSshPublicKey === undefined) return;
  normalizeAwsAdminSshPublicKey(intent.adminSshPublicKey);
  const devices = intent.interfaces.map((iface) => iface.guestDevice);
  if (
    devices.some((device) => typeof device !== 'string' || !device.length) ||
    new Set(devices).size !== devices.length
  )
    throw new Error('Complete distinct guest device identities are required for preboot administrator configuration');
}
