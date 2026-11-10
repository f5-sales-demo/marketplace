import { expect, it } from 'bun:test';
import { withAzureCeExecution } from '../../src/ce/execution';

it('does not launch commands for an already-cancelled CE operation', async () => {
  let calls = 0;
  const api = withAzureCeExecution(
    {
      exec: async () => {
        calls++;
        return { stdout: '', stderr: '', exitCode: 0 };
      },
    },
    AbortSignal.abort(),
  );
  await expect(api.exec('az', ['vm', 'create'])).rejects.toThrow('cancelled');
  expect(calls).toBe(0);
});

it('propagates cancellation to in-flight discovery or mutation and sanitizes its failure', async () => {
  const controller = new AbortController();
  const api = withAzureCeExecution(
    {
      exec: async (_command, _args, options) => {
        expect(options?.env).toEqual({ AZURE_CONFIG_DIR: '/isolated' });
        expect(options?.signal?.aborted).toBe(false);
        controller.abort();
        expect(options?.signal?.aborted).toBe(true);
        throw new Error('raw-secret-error');
      },
    },
    controller.signal,
  );
  await expect(api.exec('az', ['vm', 'create'], { env: { AZURE_CONFIG_DIR: '/isolated' } })).rejects.toThrow(
    'Azure CE execution cancelled',
  );
});

it('preserves a successful mutation result but stops subsequent commands after cancellation', async () => {
  const controller = new AbortController();
  const api = withAzureCeExecution(
    {
      exec: async () => {
        controller.abort();
        return { stdout: '{"id":"created"}', stderr: '', exitCode: 0 };
      },
    },
    controller.signal,
  );
  expect((await api.exec('az', ['vm', 'create'])).stdout).toContain('created');
  await expect(api.exec('az', ['vm', 'show'])).rejects.toThrow('cancelled');
});

it('shares a bounded deadline across commands', async () => {
  const api = withAzureCeExecution(
    {
      exec: async (_command, _args, options) => {
        await new Promise<void>((resolve) => {
          options?.signal?.addEventListener('abort', () => resolve(), { once: true });
        });
        return { stdout: '', stderr: '', exitCode: 1 };
      },
    },
    undefined,
    10,
  );
  await expect(api.exec('az', ['network', 'routeserver', 'create'])).rejects.toThrow('deadline exceeded');
});
