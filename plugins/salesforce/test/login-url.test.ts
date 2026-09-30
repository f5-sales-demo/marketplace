import { describe, expect, it } from 'bun:test';
import { normalizeLoginUrl, prepareLoginUrl } from '../src/login-url';

describe('Salesforce reviewed login URL', () => {
  for (const [input, expected] of [
    ['https://login.salesforce.com', 'https://login.salesforce.com'],
    ['https://test.salesforce.com/', 'https://test.salesforce.com'],
    ['https://example.my.salesforce.com', 'https://example.my.salesforce.com'],
    ['https://example.lightning.force.com', 'https://example.my.salesforce.com'],
    ['https://example--uat.sandbox.lightning.force.com', 'https://example--uat.sandbox.my.salesforce.com'],
  ])
    it(`normalizes ${input}`, () => expect(normalizeLoginUrl(input)).toBe(expected));

  for (const url of [
    'http://example.my.salesforce.com',
    'https://example.com',
    'https://user:password@example.my.salesforce.com',
    'https://example.my.salesforce.com/path',
    'https://example.my.salesforce.com?token=synthetic',
    'https://example.my.salesforce.com#fragment',
    'https://example.my.salesforce.com:444',
    'not a URL',
    'https://example.lightning.force.com.evil.example',
    '',
  ])
    it('rejects invalid login configuration without exposing its value', () => {
      try {
        normalizeLoginUrl(url);
        throw new Error('Expected rejection');
      } catch (error) {
        expect((error as Error).message).toBe(
          'Set SF_ORG_INSTANCE_URL or org-instance-url to an HTTPS Salesforce login or My Domain URL without credentials, paths, query parameters, or fragments.',
        );
      }
    });

  it('prefers the standard environment setting and freezes its effective URL', async () => {
    let value: string | undefined = 'https://example.lightning.force.com';
    let calls = 0;
    const login = await prepareLoginUrl({
      environment: () => value,
      executable: () => '/synthetic/sf',
      exec: async () => {
        calls++;
        throw new Error('must not read config');
      },
    });
    expect(login.url).toBe('https://example.my.salesforce.com');
    await login.validate();
    expect(calls).toBe(0);
    value = 'https://another.my.salesforce.com';
    await expect(login.validate()).rejects.toThrow('review setup again');
  });
  it('uses Salesforce CLI configuration when environment is absent', async () => {
    let config = 'https://example--uat.sandbox.my.salesforce.com';
    const calls: string[][] = [];
    const login = await prepareLoginUrl({
      environment: () => undefined,
      executable: () => '/synthetic/sf',
      exec: async (command, args, options) => {
        calls.push([command, ...args]);
        expect(options.timeout).toBe(15000);
        return {
          code: 0,
          stdout: JSON.stringify({ status: 0, result: [{ name: 'org-instance-url', value: config, success: true }] }),
        };
      },
    });
    expect(login.url).toBe(config);
    await login.validate();
    expect(calls[0]).toEqual(['/synthetic/sf', 'config', 'get', 'org-instance-url', '--json']);
    config = 'https://another.my.salesforce.com';
    await expect(login.validate()).rejects.toThrow('review setup again');
  });
  it('defaults to production only when no login URL is configured', async () => {
    const login = await prepareLoginUrl({
      environment: () => undefined,
      executable: () => undefined,
      exec: async () => {
        throw new Error('CLI not installed');
      },
    });
    expect(login.url).toBe('https://login.salesforce.com');
    const existing = await prepareLoginUrl({
      environment: () => undefined,
      executable: () => '/synthetic/sf',
      exec: async () => ({
        code: 0,
        stdout: JSON.stringify({ status: 0, result: [{ name: 'org-instance-url', success: true }] }),
      }),
    });
    expect(existing.url).toBe('https://login.salesforce.com');
  });
  for (const result of [
    { code: 1, stdout: 'private' },
    { code: 0, stdout: 'malformed' },
    { code: 0, stdout: JSON.stringify({ status: 0, result: [] }) },
  ])
    it('fails closed when configuration cannot be read', async () => {
      await expect(
        prepareLoginUrl({ environment: () => undefined, executable: () => '/synthetic/sf', exec: async () => result }),
      ).rejects.toThrow('Unable to read Salesforce login configuration');
    });
  it('preserves cancellation before reading configuration', async () => {
    let calls = 0;
    await expect(
      prepareLoginUrl(
        {
          environment: () => undefined,
          executable: () => '/synthetic/sf',
          exec: async () => {
            calls++;
            return { code: 0, stdout: '' };
          },
        },
        AbortSignal.abort(),
      ),
    ).rejects.toThrow();
    expect(calls).toBe(0);
  });
});
