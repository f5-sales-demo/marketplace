import { expect, it } from 'bun:test';
import { applyGcpNativeTeardown } from '../../src/ce/native-teardown';
import { recordGcpResource } from '../../src/ce/ownership';
import { planGcpOwnedTeardown } from '../../src/ce/teardown-plan';

function fixture() {
  const files = new Map<string, unknown>();
  const store = {
    read: async (n: string) => {
      if (!files.has(n)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return structuredClone(files.get(n));
    },
    write: async (n: string, v: unknown) => {
      files.set(n, structuredClone(v));
    },
    exclusive: async <T>(fn: () => Promise<T>) => fn(),
  };
  const resource = {
    id: '123',
    kind: 'network' as const,
    engine: 'native' as const,
    project: 'test-project',
    deploymentName: 'demo-ce',
    selfLink: 'https://www.googleapis.com/compute/v1/projects/test-project/global/networks/outside',
  };
  return { store, resource };
}
it('lost delete response reconciles absence without resubmitting and keeps independent checks separate', async () => {
  const f = fixture();
  await recordGcpResource(f.store, f.resource);
  const p = planGcpOwnedTeardown([f.resource], { ...f.resource, region: 'northamerica-northeast1' });
  let deleted = false,
    calls = 0;
  const api = {
    exec: async (_cmd: string, args: string[]) => {
      if (args.includes('delete')) {
        calls++;
        deleted = true;
        throw new Error('lost');
      }
      return deleted
        ? { stdout: '', stderr: 'not found', exitCode: 1 }
        : { stdout: JSON.stringify(f.resource), stderr: '', exitCode: 0 };
    },
  };
  await expect(applyGcpNativeTeardown(f.store, api, p, p.sha256)).rejects.toThrow('lost');
  const r = await applyGcpNativeTeardown(f.store, api, p, p.sha256);
  expect(r.state).toBe('done');
  expect(r.independentAbsence).toBe('not-established');
  expect(calls).toBe(1);
});
it('wrong approval refuses cloud mutation', async () => {
  const f = fixture();
  await recordGcpResource(f.store, f.resource);
  const p = planGcpOwnedTeardown([f.resource], { ...f.resource, region: 'northamerica-northeast1' });
  let calls = 0;
  await expect(
    applyGcpNativeTeardown(
      f.store,
      {
        exec: async () => {
          calls++;
          throw new Error('must not run');
        },
      },
      p,
      'wrong',
    ),
  ).rejects.toThrow('Reviewed');
  expect(calls).toBe(0);
});
