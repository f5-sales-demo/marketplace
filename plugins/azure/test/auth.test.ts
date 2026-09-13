import { describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { credentialAuthMethods, loginWithCredential } from '../src/auth';

const identity = { AZURE_CLIENT_ID: 'client', AZURE_TENANT_ID: 'tenant' };

describe('private Azure workload authentication', () => {
  it('selects only complete credentials and prefers federation to long-lived credentials', () => {
    expect(credentialAuthMethods(identity).filter((method) => method.available)).toEqual([]);
    const methods = credentialAuthMethods({
      ...identity,
      AZURE_FEDERATED_TOKEN_FILE: '/token',
      AZURE_CLIENT_SECRET: 'secret',
    });
    expect(methods.filter((method) => method.available).map((method) => method.key)).toEqual([
      'workload_federation',
      'service_principal',
    ]);
  });

  it('passes a literal secret including a leading dash, without the unsupported @file convention', async () => {
    let received: string[] = [];
    expect(
      await loginWithCredential(
        'service_principal',
        { ...identity, AZURE_CLIENT_SECRET: '-sentinel' },
        async (args) => {
          received = args;
          return 0;
        },
      ),
    ).toBe(true);
    expect(received).toContain(['--password', '-sentinel'].join('='));
    expect(received).toContain('--username');
  });

  it('uses distinct supported flags for managed identity and certificate login', async () => {
    const calls: string[][] = [];
    const run = async (args: string[]) => {
      calls.push(args);
      return 0;
    };
    await loginWithCredential('managed_identity', { ...identity, AZURE_USE_MANAGED_IDENTITY: 'true' }, run);
    await loginWithCredential('certificate', { ...identity, AZURE_CLIENT_CERTIFICATE_PATH: '/credential.pem' }, run);
    expect(calls[0]).toContain('--client-id');
    expect(calls[0]).not.toContain('--username');
    expect(calls[1]).toContain('--certificate');
    expect(calls[1]).not.toContain('--password');
  });

  it('reads a refreshed federation token per login and fails closed on missing or malformed material', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azure-auth-test-'));
    try {
      const file = join(dir, 'token');
      const env = { ...identity, AZURE_FEDERATED_TOKEN_FILE: file };
      const calls: string[][] = [];
      const run = async (args: string[]) => {
        calls.push(args);
        return 0;
      };
      expect(await loginWithCredential('workload_federation', env, run)).toBe(false);
      for (const token of ['first.token.value', 'fresh.token.value']) {
        writeFileSync(file, `${token}\n`, { mode: 0o600 });
        expect(await loginWithCredential('workload_federation', env, run)).toBe(true);
        expect(calls.at(-1)).toContain(`--federated-token=${token}`);
      }
      for (const token of ['', 'two tokens', 'x'.repeat(65_537)]) {
        writeFileSync(file, token);
        expect(await loginWithCredential('workload_federation', env, run)).toBe(false);
      }
      expect(calls).toHaveLength(2);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('does not expose credential-bearing subprocess errors', async () => {
    expect(
      await loginWithCredential('service_principal', { ...identity, AZURE_CLIENT_SECRET: 'sentinel' }, async () => {
        throw new Error('sentinel');
      }),
    ).toBe(false);
  });
});
