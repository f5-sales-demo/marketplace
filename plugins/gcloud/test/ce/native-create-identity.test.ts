import { expect, it } from 'bun:test';
import { translateGcpNativeCompute } from '../../src/ce/compute-plan';
import { fingerprint } from '../../src/ce/discovery';
import { applyGcpNativeCreation } from '../../src/ce/native-create';
import { createGcpNativeCreationDriver } from '../../src/ce/native-create-driver';
import { intent } from './fixtures';

function fixture() {
  const i = intent();
  i.routing.destinationCidrs = [];
  const plan = translateGcpNativeCompute(i);
  const action = plan.actions[0];
  const files = new Map<string, unknown>();
  const store = {
    read: async (name: string) => {
      if (!files.has(name)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return structuredClone(files.get(name));
    },
    write: async (name: string, value: unknown) => {
      files.set(name, structuredClone(value));
    },
    exclusive: async <T>(fn: () => Promise<T>) => fn(),
  };
  const original = {
    id: '123',
    name: 'outside',
    selfLink: `https://www.googleapis.com/compute/v1/projects/${i.project}/global/networks/outside`,
  };
  return { i, plan, action, files, store, original };
}

it('retains the original synchronous create identity in a versioned sanitized receipt', async () => {
  const f = fixture();
  const d = createGcpNativeCreationDriver(
    {
      exec: async () => ({
        stdout: JSON.stringify([{ ...f.original, privateMetadata: 'SECRET' }]),
        stderr: '',
        exitCode: 0,
      }),
    },
    f.store,
    '/private/tmp',
    f.i,
  );
  const executionId = `create-${'a'.repeat(40)}`;
  await d.submit(f.action, executionId);
  const receipt = (await f.store.read(`gcp-create-completed-${executionId}.json`)) as {
    schemaVersion?: number;
    resource?: { id: string; selfLink: string };
  };
  expect(receipt.schemaVersion).toBe(2);
  expect(receipt.resource?.id).toBe('123');
  expect(receipt.resource?.selfLink).toBe(f.original.selfLink);
  expect(JSON.stringify(receipt)).not.toContain('SECRET');
});

for (const result of [
  {},
  { id: 123 },
  { id: '123', name: 'outside', selfLink: 'https://foreign.invalid/networks/outside' },
]) {
  it(`refuses a synchronous create result without exact planned identity ${JSON.stringify(result)}`, async () => {
    const f = fixture();
    const d = createGcpNativeCreationDriver(
      { exec: async () => ({ stdout: JSON.stringify(result), stderr: '', exitCode: 0 }) },
      f.store,
      '/private/tmp',
      f.i,
    );
    const executionId = `create-${'a'.repeat(40)}`;
    await expect(d.submit(f.action, executionId)).rejects.toThrow('identity');
    await expect(f.store.read(`gcp-create-completed-${executionId}.json`)).rejects.toThrow('missing');
  });
}

it('rejects a replacement numeric identity during reconciliation without rewriting the original receipt', async () => {
  const f = fixture();
  let value = f.original;
  const d = createGcpNativeCreationDriver(
    { exec: async () => ({ stdout: JSON.stringify(value), stderr: '', exitCode: 0 }) },
    f.store,
    '/private/tmp',
    f.i,
  );
  const executionId = `create-${'a'.repeat(40)}`;
  await d.submit(f.action, executionId);
  const originalReceipt = await f.store.read(`gcp-create-completed-${executionId}.json`);
  value = { ...f.original, id: '456' };
  await expect(d.reconcile(f.action, executionId, {})).rejects.toThrow('identity');
  expect(await f.store.read(`gcp-create-completed-${executionId}.json`)).toEqual(originalReceipt);
});

it('refuses replacement between reconciliation and final ownership capture', async () => {
  const f = fixture();
  let descriptions = 0;
  const d = createGcpNativeCreationDriver(
    {
      exec: async (_cmd, args) => {
        if (args[2] === 'describe') {
          descriptions++;
          if (descriptions === 1) return { stdout: '', stderr: 'not found', exitCode: 1 };
        }
        return {
          stdout: JSON.stringify({ ...f.original, id: descriptions >= 3 ? '456' : '123' }),
          stderr: '',
          exitCode: 0,
        };
      },
    },
    f.store,
    '/private/tmp',
    f.i,
  );
  await expect(applyGcpNativeCreation(f.store, f.i, f.plan.sha256, d)).rejects.toThrow('identity');
  await expect(f.store.read('gcp-resources.json')).rejects.toThrow('missing');
});

it('recovers legacy unversioned completion without submission or receipt rewrite', async () => {
  const f = fixture();
  const executionId = `create-${'a'.repeat(40)}`;
  const name = `gcp-create-completed-${executionId}.json`;
  const receipt = { actionFingerprint: fingerprint(f.action), completed: true };
  await f.store.write(name, receipt);
  const calls: string[][] = [];
  const d = createGcpNativeCreationDriver(
    {
      exec: async (_cmd, args) => {
        calls.push(args);
        return { stdout: JSON.stringify(f.original), stderr: '', exitCode: 0 };
      },
    },
    f.store,
    '/private/tmp',
    f.i,
  );
  expect(await d.reconcile(f.action, executionId, {})).toBe('done');
  await d.assertCreatedIdentity?.(f.action, executionId, {
    ...f.original,
    project: f.i.project,
    deploymentName: f.i.deploymentName,
    engine: 'native',
    kind: 'network',
  });
  expect(calls).toHaveLength(1);
  expect(calls[0][2]).toBe('describe');
  expect(await f.store.read(name)).toEqual(receipt);
});

it('binds subnet completion to the exact planned region', async () => {
  const f = fixture();
  const action = f.plan.actions.find((a) => a.kind === 'subnetwork');
  if (!action) throw new Error('missing subnet');
  const original = {
    id: '789',
    name: action.argv[4],
    selfLink: `https://www.googleapis.com/compute/v1/projects/${f.i.project}/regions/${f.i.region}/subnetworks/${action.argv[4]}`,
  };
  let value = original;
  const d = createGcpNativeCreationDriver(
    { exec: async () => ({ stdout: JSON.stringify(value), stderr: '', exitCode: 0 }) },
    f.store,
    '/private/tmp',
    f.i,
  );
  const executionId = `create-${'a'.repeat(40)}`;
  await d.submit(action, executionId);
  expect(await d.reconcile(action, executionId, {})).toBe('done');
  value = { ...original, selfLink: original.selfLink.replace(f.i.region, 'europe-west1') };
  await expect(d.submit(action, `create-${'b'.repeat(40)}`)).rejects.toThrow('identity');
  await expect(d.reconcile(action, executionId, {})).rejects.toThrow('identity');
});

for (const mutation of [
  { schemaVersion: 3 },
  { resource: undefined },
  { resource: { id: 123 } },
  { completed: false },
  { actionFingerprint: 'foreign' },
]) {
  it(`refuses malformed or unknown completion receipts before cloud observation ${JSON.stringify(mutation)}`, async () => {
    const f = fixture();
    const executionId = `create-${'a'.repeat(40)}`;
    let calls = 0;
    const d = createGcpNativeCreationDriver(
      {
        exec: async () => {
          calls++;
          return { stdout: JSON.stringify(f.original), stderr: '', exitCode: 0 };
        },
      },
      f.store,
      '/private/tmp',
      f.i,
    );
    await d.submit(f.action, executionId);
    const name = `gcp-create-completed-${executionId}.json`;
    const receipt = (await f.store.read(name)) as Record<string, unknown>;
    const changed = { ...receipt, ...mutation };
    if (mutation.resource) changed.resource = { ...(receipt.resource as object), ...mutation.resource };
    await f.store.write(name, changed);
    await expect(d.reconcile(f.action, executionId, {})).rejects.toThrow();
    expect(calls).toBe(1);
    expect(await f.store.read(name)).toEqual(changed);
  });
}
