import { expect, spyOn, test } from 'bun:test';
import { createHash } from 'node:crypto';
import * as runtime from '../src/installed-runtime';

test('account inspection uses the exact selected server environment without ambient context fallback', () => {
  const selected = { CLOUDSDK_CONFIG: '/example/selected-gcloud', PATH: '/example/bin:/usr/bin:/bin' };
  const requests: unknown[] = [];
  const probe = spyOn(Bun, 'spawnSync').mockImplementation(((argv: unknown, options: unknown) => {
    requests.push({ argv, options });
    return { exitCode: 0, stdout: Buffer.from('principal@example.com\n'), stderr: Buffer.alloc(0) };
  }) as typeof Bun.spawnSync);
  try {
    expect(runtime.selectedGoogleAccountSha256(selected)).toBe(
      createHash('sha256').update('principal@example.com').digest('hex'),
    );
    expect(requests).toEqual([
      {
        argv: ['gcloud', 'config', 'get-value', 'account', '--quiet'],
        options: { env: selected, stdout: 'pipe', stderr: 'pipe' },
      },
    ]);
  } finally {
    probe.mockRestore();
  }
});
test('missing or failed selected account inspection refuses rather than returning an ambient principal', () => {
  for (const [exitCode, value] of [
    [1, 'principal@example.com'],
    [0, '(unset)'],
    [0, ''],
  ] as const) {
    const probe = spyOn(Bun, 'spawnSync').mockReturnValue({
      exitCode,
      stdout: Buffer.from(value),
      stderr: Buffer.alloc(0),
    } as ReturnType<typeof Bun.spawnSync>);
    try {
      expect(() => runtime.selectedGoogleAccountSha256({ CLOUDSDK_CONFIG: '/example/absent-gcloud' })).toThrow(
        'Selected Google account unavailable',
      );
    } finally {
      probe.mockRestore();
    }
  }
});
