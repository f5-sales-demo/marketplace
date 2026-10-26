import { expect, it } from 'bun:test';
import { reconcileGcpOperation, recordGcpOperation } from '../../src/ce/native-operation';

const binding = {
  project: 'test-project',
  zone: 'northamerica-northeast1-a',
  deploymentName: 'ce-test',
  engine: 'native' as const,
  actionId: 'create-node',
};
const operation = {
  name: 'operation-123',
  status: 'RUNNING',
  selfLink:
    'https://www.googleapis.com/compute/v1/projects/test-project/zones/northamerica-northeast1-a/operations/operation-123',
};
function store() {
  let value: unknown;
  return {
    read: async () => structuredClone(value),
    write: async (_name: string, next: unknown) => {
      value = structuredClone(next);
    },
  };
}
it('durably reconciles an interrupted async operation with scoped structured argv', async () => {
  const s = store();
  await recordGcpOperation(s, binding, operation);
  const calls: string[][] = [];
  const api = {
    exec: async (_cmd: string, args: string[]) => {
      calls.push(args);
      return { stdout: JSON.stringify({ ...operation, status: 'DONE' }), stderr: '', exitCode: 0 };
    },
  };
  const r = await reconcileGcpOperation(s, api, binding);
  expect(r.state).toBe('done');
  expect(calls[0]).toContain('--project=test-project');
  expect(calls[0]).toContain('--zone=northamerica-northeast1-a');
  await reconcileGcpOperation(s, api, binding);
  expect(calls).toHaveLength(1);
});
it('rejects wrong engine/identity and retains pending state after observation failure', async () => {
  const s = store();
  await recordGcpOperation(s, binding, operation);
  let calls = 0;
  const api = {
    exec: async () => {
      calls++;
      return { stdout: '', stderr: 'SECRET', exitCode: 1 };
    },
  };
  await expect(reconcileGcpOperation(s, api, { ...binding, engine: 'terraform' })).rejects.toThrow('owning engine');
  await expect(reconcileGcpOperation(s, api, { ...binding, project: 'other-project' })).rejects.toThrow('ownership');
  expect(calls).toBe(0);
  await expect(reconcileGcpOperation(s, api, binding)).rejects.toThrow('observation failed');
  expect(((await s.read()) as { state: string }).state).toBe('pending');
});
it('records sanitized asynchronous failure without API messages or bootstrap metadata', async () => {
  const s = store();
  const r = await recordGcpOperation(s, binding, {
    ...operation,
    status: 'DONE',
    error: { errors: [{ code: 'ZONE_RESOURCE_POOL_EXHAUSTED', message: 'SECRET' }] },
    metadata: 'SECRET',
  });
  expect(r.state).toBe('failed');
  expect(r.errorCodes).toEqual(['ZONE_RESOURCE_POOL_EXHAUSTED']);
  expect(JSON.stringify(await s.read())).not.toContain('SECRET');
});
it('rejects foreign operation selfLink before checkpoint persistence', async () => {
  const s = store();
  await expect(
    recordGcpOperation(s, binding, {
      ...operation,
      selfLink: operation.selfLink.replace('test-project', 'other-project'),
    }),
  ).rejects.toThrow('identity');
  expect(await s.read()).toBeUndefined();
});

it('reconciles exact regional and global operation identities with explicit flags', async () => {
  for (const scope of [{ region: 'northamerica-northeast1' }, { global: true as const }]) {
    const b = {
      project: binding.project,
      deploymentName: binding.deploymentName,
      engine: binding.engine,
      actionId: 'network-create',
      ...scope,
    };
    const path = 'region' in scope ? `regions/${scope.region}` : 'global';
    const op = {
      ...operation,
      selfLink: `https://www.googleapis.com/compute/v1/projects/test-project/${path}/operations/operation-123`,
    };
    const s = store();
    await recordGcpOperation(s, b, op);
    const calls: string[][] = [];
    const result = await reconcileGcpOperation(
      s,
      {
        exec: async (_cmd, args) => {
          calls.push(args);
          return { stdout: JSON.stringify({ ...op, status: 'DONE' }), stderr: '', exitCode: 0 };
        },
      },
      b,
    );
    expect(result.state).toBe('done');
    expect(calls[0]).toContain('region' in scope ? '--region=northamerica-northeast1' : '--global');
    expect(calls[0].some((arg) => arg.startsWith('--zone='))).toBe(false);
  }
});
it('rejects ambiguous scope, replacement operation and regressed terminal evidence', async () => {
  const s = store();
  await expect(recordGcpOperation(s, { ...binding, region: 'northamerica-northeast1' }, operation)).rejects.toThrow(
    'scope',
  );
  await recordGcpOperation(s, binding, { ...operation, status: 'DONE' });
  await expect(recordGcpOperation(s, binding, operation)).rejects.toThrow('Terminal');
  await expect(
    recordGcpOperation(s, binding, {
      ...operation,
      name: 'operation-456',
      selfLink: operation.selfLink.replace('123', '456'),
    }),
  ).rejects.toThrow('overwritten');
});
