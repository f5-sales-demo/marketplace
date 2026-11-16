import { expect, it } from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';
import { awsInitialAdminSettings, normalizeAwsAdminSshPublicKey } from '../../src/ce/initial-admin';
import type { AwsCeIntent } from '../../src/ce/types';

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
it('permits administrator SSH only on SLO while retaining DNS and Web UI blocks', () => {
  const settings = awsInitialAdminSettings({ adminSshPublicKey: key } as AwsCeIntent);
  expect(settings.admin_user_credentials).toEqual({ ssh_key: key });
  const rules = (settings.blocked_services as { blocked_sevice: Record<string, unknown>[] }).blocked_sevice;
  expect(rules).toHaveLength(5);
  for (const network of ['VIRTUAL_NETWORK_SITE_LOCAL', 'VIRTUAL_NETWORK_SITE_LOCAL_INSIDE']) {
    const selected = rules.filter((rule) => rule.network_type === network);
    expect(selected.filter((rule) => Object.hasOwn(rule, 'dns'))).toHaveLength(1);
    expect(selected.filter((rule) => Object.hasOwn(rule, 'web_user_interface'))).toHaveLength(1);
    expect(selected.filter((rule) => Object.hasOwn(rule, 'ssh'))).toHaveLength(
      network === 'VIRTUAL_NETWORK_SITE_LOCAL' ? 0 : 1,
    );
  }
  expect(settings).not.toHaveProperty('block_all_services');
  expect(settings.blocked_services).not.toHaveProperty('blocked_service');
});
it('does not change local-service policy without an administrator key', () => {
  expect(awsInitialAdminSettings({} as AwsCeIntent)).toEqual({});
});
it('rejects invalid administrator keys before returning a service policy', () => {
  expect(() => awsInitialAdminSettings({ adminSshPublicKey: 'invalid' } as AwsCeIntent)).toThrow('OpenSSH');
});
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
