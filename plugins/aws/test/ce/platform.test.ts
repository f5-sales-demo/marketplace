import { expect, test } from 'bun:test';
import { type CePlatformService, registerCePlatformService } from '../../../platform/src/ce/service';
import { awsPlatformService } from '../../src/ce/platform';
import { scopedAwsApi } from '../../src/ce/scoped-exec';

test('installed cloud plugins obtain their platform service through the extension bus', async () => {
  const listeners = new Map<string, (data: unknown) => void>();
  const bus = {
    emit(channel: string, data: unknown) {
      listeners.get(channel)?.(data);
    },
    on(channel: string, callback: (data: unknown) => void) {
      listeners.set(channel, callback);
      return () => listeners.delete(channel);
    },
  };
  const service = {
    capabilities: async () => ({ source: 'verified-api-contract' }),
    runtime: async () => {},
    storage: async () => {},
  } as unknown as CePlatformService;
  registerCePlatformService(bus, service);
  expect(await awsPlatformService({ events: bus })).toBe(service);
  await expect(awsPlatformService({})).rejects.toThrow('required');
});
test('CE commands keep the selected profile and propagate cancellation', async () => {
  const calls: string[][] = [];
  const api = scopedAwsApi(
    {
      async exec(_command, args) {
        calls.push(args);
        return { stdout: '', stderr: '', exitCode: 0 };
      },
    },
    'demo-role',
  );
  await api.exec('aws', ['sts', 'get-caller-identity']);
  expect(calls[0]).toEqual(['sts', 'get-caller-identity', '--profile', 'demo-role']);
  await expect(api.exec('aws', ['sts', 'get-caller-identity', '--profile', 'other'])).rejects.toThrow('profile');
  const controller = new AbortController();
  controller.abort();
  await expect(api.exec('aws', [], { signal: controller.signal })).rejects.toThrow();
  expect(calls).toHaveLength(1);
});

test('a per-command signal cannot mask deployment cancellation', async () => {
  for (const abortParent of [true, false]) {
    const parent = new AbortController();
    const command = new AbortController();
    let observed: AbortSignal | undefined;
    const api = scopedAwsApi(
      {
        async exec(_command, _args, options) {
          observed = options?.signal;
          return { stdout: '', stderr: '', exitCode: 0 };
        },
      },
      'demo-role',
      parent.signal,
    );
    await api.exec('aws', ['sts', 'get-caller-identity'], { signal: command.signal });
    (abortParent ? parent : command).abort(new Error('qualification cancelled'));
    expect(observed?.aborted).toBe(true);
    await expect(api.exec('aws', [], { signal: command.signal })).rejects.toThrow('qualification cancelled');
  }
});
