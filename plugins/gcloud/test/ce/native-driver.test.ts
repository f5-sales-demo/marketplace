import { expect, it } from 'bun:test';
import { createGcpNativeVmDriver } from '../../src/ce/native-driver';
import type { GcpResourceIdentity } from '../../src/ce/ownership';

const resource: GcpResourceIdentity = {
  id: '123',
  selfLink:
    'https://www.googleapis.com/compute/v1/projects/example-project/zones/northamerica-northeast1-a/instances/node-a',
  kind: 'instance',
  project: 'example-project',
  deploymentName: 'ce-test',
  engine: 'native',
};
const action = {
  id: 'stop-node',
  argv: [
    'compute',
    'instances',
    'stop',
    'node-a',
    '--project=example-project',
    '--zone=northamerica-northeast1-a',
    '--async',
    '--format=json',
  ],
  dependencies: [],
  resources: [resource],
};
for (const response of [[], [{ name: 'operation-123' }, { name: 'operation-456' }], {}, [{ id: '123' }]]) {
  it(`rejects ambiguous asynchronous VM result ${JSON.stringify(response)} before checkpointing`, async () => {
    const writes: unknown[] = [];
    const driver = createGcpNativeVmDriver(
      { exec: async () => ({ stdout: JSON.stringify(response), stderr: '', exitCode: 0 }) },
      {
        read: async () => undefined,
        write: async (_name, value) => {
          writes.push(value);
        },
        exclusive: async (fn) => fn(),
      },
    );
    await expect(driver.submit(action)).rejects.toThrow('result');
    expect(writes).toEqual([]);
  });
}
it('retains a single asynchronous operation array and synchronous empty resize result', async () => {
  const writes: unknown[] = [];
  const driver = createGcpNativeVmDriver(
    {
      exec: async (_command, args) => ({
        stdout: JSON.stringify(
          args[2] === 'set-machine-type'
            ? {}
            : [
                {
                  kind: 'compute#operation',
                  name: 'operation-123',
                  selfLink: resource.selfLink.replace('instances/node-a', 'operations/operation-123'),
                  status: 'RUNNING',
                },
              ],
        ),
        stderr: '',
        exitCode: 0,
      }),
    },
    {
      read: async () => undefined,
      write: async (_name, value) => {
        writes.push(value);
      },
      exclusive: async (fn) => fn(),
    },
  );
  expect(await driver.submit(action)).toEqual({ kind: 'operation', name: 'operation-123' });
  const resize = {
    ...action,
    argv: action.argv.filter((arg) => arg !== '--async').map((arg) => (arg === 'stop' ? 'set-machine-type' : arg)),
  };
  resize.argv.push('--machine-type=n2-standard-16');
  expect(await driver.submit(resize)).toEqual({ kind: 'completed-command' });
  expect(writes).toHaveLength(1);
});
function fixture() {
  let vm = {
    id: '123',
    selfLink: resource.selfLink,
    status: 'RUNNING',
    machineType: 'n2-standard-8',
    networkInterfaces: [{ name: 'nic0' }],
  };
  const files = new Map<string, unknown>(),
    calls: string[][] = [];
  const store = {
    read: async (name: string) => {
      if (!files.has(name)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return files.get(name);
    },
    write: async (name: string, value: unknown) => {
      files.set(name, value);
    },
    exclusive: async <T>(fn: () => Promise<T>) => fn(),
  };
  const api = {
    exec: async (_command: string, args: string[]) => {
      calls.push(args);
      let value: unknown = vm;
      if (args[1] === 'operations')
        value = {
          name: 'operation-123',
          selfLink: resource.selfLink.replace('instances/node-a', 'operations/operation-123'),
          status: 'DONE',
        };
      else if (args[2] === 'stop')
        value = {
          kind: 'compute#operation',
          name: 'operation-123',
          selfLink: resource.selfLink.replace('instances/node-a', 'operations/operation-123'),
          status: 'RUNNING',
        };
      else if (args[1] === 'machine-types') value = { name: 'n2-standard-16', guestCpus: 16, memoryMb: 65536 };
      return { stdout: JSON.stringify(value), stderr: '', exitCode: 0 };
    },
  };
  return {
    driver: createGcpNativeVmDriver(api, store),
    calls,
    vm,
    set: (next: typeof vm) => {
      vm = next;
    },
  };
}
it('journals exact asynchronous stop and requires terminal cloud power state', async () => {
  const f = fixture();
  await f.driver.assertPreconditions?.(action);
  const receipt = await f.driver.submit(action);
  expect(await f.driver.reconcile(action, receipt)).toBe('pending');
  f.set({ ...f.vm, status: 'TERMINATED' });
  expect(await f.driver.reconcile(action, receipt)).toBe('done');
  expect(
    f.calls.every(
      (args) => args.includes('--project=example-project') && args.includes('--zone=northamerica-northeast1-a'),
    ),
  ).toBe(true);
});
it('ambiguous stop resolves from exact VM state and refuses identity replacement', async () => {
  const f = fixture();
  f.set({ ...f.vm, status: 'TERMINATED' });
  expect(await f.driver.reconcile(action, undefined)).toBe('done');
  f.set({ ...f.vm, id: '456' });
  await expect(f.driver.reconcile(action, undefined)).rejects.toThrow('identity');
});
it('resize preconditions require stopped VM and recheck machine sizing', async () => {
  const f = fixture();
  const resize = {
    ...action,
    argv: [
      'compute',
      'instances',
      'set-machine-type',
      'node-a',
      '--project=example-project',
      '--zone=northamerica-northeast1-a',
      '--machine-type=n2-standard-16',
      '--format=json',
    ],
  };
  await expect(f.driver.assertPreconditions?.(resize)).rejects.toThrow('stopped');
  f.set({ ...f.vm, status: 'TERMINATED' });
  await f.driver.assertPreconditions?.(resize);
  expect(f.calls.some((args) => args[1] === 'machine-types')).toBe(true);
});
it('driver rejects direct foreign scope and identity-switching arguments', async () => {
  const f = fixture();
  await expect(
    f.driver.submit({
      ...action,
      argv: action.argv.map((arg) => (arg === '--project=example-project' ? '--project=foreign-project' : arg)),
    }),
  ).rejects.toThrow('scope');
  await expect(
    f.driver.submit({ ...action, argv: [...action.argv, '--impersonate-service-account=foreign'] }),
  ).rejects.toThrow('argument');
  expect(f.calls).toHaveLength(0);
});
it('resume without submit receipt still reconciles the durable operation journal', async () => {
  const f = fixture();
  await f.driver.submit(action);
  f.set({ ...f.vm, status: 'TERMINATED' });
  expect(await f.driver.reconcile(action, undefined)).toBe('done');
  expect(f.calls.some((args) => args[1] === 'operations')).toBe(true);
});
