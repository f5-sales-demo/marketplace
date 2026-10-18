import { expect, it } from 'bun:test';
import { translateGcpNativeCompute } from '../../src/ce/compute-plan';
import { createGcpNativeCreationDriver } from '../../src/ce/native-create-driver';
import { intent } from './fixtures';

function store() {
  const files = new Map<string, unknown>();
  return {
    read: async (n: string) => {
      if (!files.has(n)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return structuredClone(files.get(n));
    },
    write: async (n: string, v: unknown) => {
      files.set(n, structuredClone(v));
    },
    exclusive: async <T>(fn: () => Promise<T>) => fn(),
  };
}
it('native create driver rejects changed structured arguments before cloud execution', async () => {
  const i = intent();
  i.routing.destinationCidrs = [];
  let calls = 0;
  const d = createGcpNativeCreationDriver(
    {
      exec: async () => {
        calls++;
        throw new Error('must not run');
      },
    },
    store(),
    '/private/tmp',
    i,
  );
  const a = translateGcpNativeCompute(i).actions[0];
  await expect(d.submit({ ...a, argv: [...a.argv, '--project=foreign'] }, `create-${'a'.repeat(40)}`)).rejects.toThrow(
    'differs',
  );
  expect(calls).toBe(0);
});
it('native driver records and reconciles exact global async operation without foreign scope', async () => {
  const i = intent();
  i.routing.destinationCidrs = [];
  const s = store();
  const action = translateGcpNativeCompute(i).actions[0];
  const calls: string[][] = [];
  const op = {
    name: 'operation-123',
    selfLink: `https://www.googleapis.com/compute/v1/projects/${i.project}/global/operations/operation-123`,
    status: 'RUNNING',
  };
  const d = createGcpNativeCreationDriver(
    {
      exec: async (_cmd, args) => {
        calls.push(args);
        return {
          stdout: JSON.stringify({ ...op, status: args.includes('describe') ? 'DONE' : 'RUNNING' }),
          stderr: '',
          exitCode: 0,
        };
      },
    },
    s,
    '/private/tmp',
    i,
  );
  const id = `create-${'a'.repeat(40)}`;
  await d.submit(action, id);
  expect(calls[0]).toContain('--async');
  expect(await d.reconcile(action, id, {})).toBe('done');
  expect(calls[1]).toContain('--global');
  await expect(d.reconcile(action, `create-${'b'.repeat(40)}`, {})).rejects.toThrow('Ambiguous');
});
