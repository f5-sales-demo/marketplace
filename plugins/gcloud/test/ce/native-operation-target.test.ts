import { expect, it } from 'bun:test';
import { translateGcpNativeCompute } from '../../src/ce/compute-plan';
import { createGcpNativeCreationDriver } from '../../src/ce/native-create-driver';
import { createGcpNativeVmDriver } from '../../src/ce/native-driver';
import { readGcpOperationTarget, reconcileGcpOperation, recordGcpOperation } from '../../src/ce/native-operation';
import { intent } from './fixtures';

const binding = {
  project: 'test-project',
  zone: 'northamerica-northeast1-a',
  deploymentName: 'ce-test',
  engine: 'native' as const,
  actionId: 'stop-node',
};
const target = {
  id: '123',
  selfLink: `https://www.googleapis.com/compute/v1/projects/${binding.project}/zones/${binding.zone}/instances/node-a`,
};
const operation = {
  name: 'operation-123',
  status: 'RUNNING',
  selfLink: target.selfLink.replace('instances/node-a', 'operations/operation-123'),
  targetId: target.id,
  targetLink: target.selfLink,
};
function store() {
  let value: unknown;
  return {
    read: async () => structuredClone(value),
    write: async (_name: string, next: unknown) => {
      value = structuredClone(next);
    },
    exclusive: async <T>(fn: () => Promise<T>) => fn(),
  };
}
const action = {
  id: binding.actionId,
  dependencies: [],
  argv: [
    'compute',
    'instances',
    'stop',
    'node-a',
    `--project=${binding.project}`,
    `--zone=${binding.zone}`,
    '--async',
    '--format=json',
  ],
  resources: [
    {
      ...target,
      kind: 'instance' as const,
      project: binding.project,
      deploymentName: binding.deploymentName,
      engine: binding.engine,
    },
  ],
};

for (const change of [
  { targetId: '456' },
  { targetId: 123 },
  { targetLink: target.selfLink.replace('node-a', 'node-b') },
  { targetId: undefined, targetLink: undefined },
]) {
  it(`refuses an async VM operation with an unbound target ${JSON.stringify(change)}`, async () => {
    const s = store();
    const d = createGcpNativeVmDriver(
      { exec: async () => ({ stdout: JSON.stringify({ ...operation, ...change }), stderr: '', exitCode: 0 }) },
      s,
    );
    await expect(d.submit(action)).rejects.toThrow('target');
    expect(await s.read()).toBeUndefined();
  });
}

it('retains only original operation target identity in a versioned checkpoint', async () => {
  const s = store();
  const receipt = await recordGcpOperation(s, binding, { ...operation, privateMetadata: 'SECRET' }, target);
  expect(receipt.schemaVersion).toBe(2);
  expect((await s.read()) as unknown).toMatchObject({ target });
  expect(JSON.stringify(await s.read())).not.toContain('SECRET');
});

it('rejects target replacement during async reconciliation without changing the pending receipt', async () => {
  const s = store();
  await recordGcpOperation(s, binding, operation, target);
  const original = await s.read();
  await expect(
    reconcileGcpOperation(
      s,
      {
        exec: async () => ({
          stdout: JSON.stringify({ ...operation, status: 'DONE', targetId: '456' }),
          stderr: '',
          exitCode: 0,
        }),
      },
      binding,
    ),
  ).rejects.toThrow('target');
  expect(await s.read()).toEqual(original);
});

it('preserves legacy terminal operations without observation, rewrite or retroactive target evidence', async () => {
  const s = store();
  await recordGcpOperation(s, binding, { ...operation, status: 'DONE' });
  const original = await s.read();
  expect(await readGcpOperationTarget(s, binding)).toBeUndefined();
  expect(
    (
      await reconcileGcpOperation(
        s,
        {
          exec: async () => {
            throw new Error('must not execute');
          },
        },
        binding,
      )
    ).schemaVersion,
  ).toBe(1);
  expect(await s.read()).toEqual(original);
  await expect(recordGcpOperation(s, binding, { ...operation, status: 'DONE' }, target)).rejects.toThrow('Legacy');
  expect(await s.read()).toEqual(original);
});

it('recovers an original-target operation once and retains terminal target evidence', async () => {
  const s = store();
  await recordGcpOperation(s, binding, operation, target);
  let calls = 0;
  const api = {
    exec: async (_cmd: string, args: string[]) => {
      calls++;
      expect(args.at(-1)).toContain('targetId,targetLink');
      return { stdout: JSON.stringify({ ...operation, status: 'DONE' }), stderr: '', exitCode: 0 };
    },
  };
  expect((await reconcileGcpOperation(s, api, binding)).state).toBe('done');
  const original = await s.read();
  expect(await readGcpOperationTarget(s, binding)).toEqual(target);
  expect((await reconcileGcpOperation(s, api, binding)).state).toBe('done');
  expect(calls).toBe(1);
  expect(await s.read()).toEqual(original);
});

for (const value of [
  { schemaVersion: 3 },
  { schemaVersion: 2 },
  { schemaVersion: 2, target: { ...target, id: 123 } },
]) {
  it(`rejects an unknown or malformed stored target checkpoint ${JSON.stringify(value)}`, async () => {
    const s = store();
    await recordGcpOperation(s, binding, { ...operation, status: 'DONE' });
    const original = await s.read();
    await s.write('', { ...(original as object), ...value });
    await expect(readGcpOperationTarget(s, binding)).rejects.toThrow();
    await expect(
      reconcileGcpOperation(
        s,
        {
          exec: async () => {
            throw new Error('must not execute');
          },
        },
        binding,
      ),
    ).rejects.toThrow();
  });
}

it('rejects replacement before boot-disk capture and final VM ownership insertion', async () => {
  const i = intent();
  i.routing.destinationCidrs = [];
  const action = translateGcpNativeCompute(i).actions.find((a) => a.kind === 'instance');
  if (!action) throw new Error('missing instance');
  const node = i.sites[0].nodes[0];
  const original = {
    id: '123',
    selfLink: `https://www.googleapis.com/compute/v1/projects/${i.project}/zones/${node.zone}/instances/${node.name}`,
  };
  const executionId = `create-${'a'.repeat(40)}`;
  const s = store();
  await recordGcpOperation(
    s,
    { ...binding, project: i.project, zone: node.zone, deploymentName: i.deploymentName, actionId: executionId },
    {
      ...operation,
      selfLink: original.selfLink.replace(`instances/${node.name}`, 'operations/operation-123'),
      status: 'DONE',
      targetLink: original.selfLink,
      targetId: original.id,
    },
    original,
  );
  let calls = 0;
  const d = createGcpNativeCreationDriver(
    {
      exec: async () => {
        calls++;
        return { stdout: JSON.stringify({ ...original, id: '456' }), stderr: '', exitCode: 0 };
      },
    },
    s,
    '/private/tmp',
    i,
  );
  const checkpoint = await s.read();
  await expect(d.reconcile(action, executionId, {})).rejects.toThrow('target');
  expect(calls).toBe(1);
  expect(await s.read()).toEqual(checkpoint);
  await expect(
    d.assertCreatedIdentity?.(action, executionId, {
      ...original,
      id: '456',
      project: i.project,
      deploymentName: i.deploymentName,
      engine: 'native',
      kind: 'instance',
    }),
  ).rejects.toThrow('target');
  expect(await s.read()).toEqual(checkpoint);
});
