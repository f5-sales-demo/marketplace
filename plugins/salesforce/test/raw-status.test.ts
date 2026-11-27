import { expect, test } from 'bun:test';
import { execSfRaw } from '../src/sf/exec';

test('raw JSON command failures remain errors even when the process exits zero', async () => {
  await expect(
    execSfRaw(
      {
        exec: async () => ({
          stdout: JSON.stringify({ status: 1, name: 'INVALID_SESSION_ID', message: 'Expired' }),
          stderr: '',
          exitCode: 0,
        }),
      },
      ['org', 'display', '--json'],
    ),
  ).rejects.toThrow('expired');
});
