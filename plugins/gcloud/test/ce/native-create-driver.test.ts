import { expect, it } from 'bun:test';
import { mkdtemp, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
it('native driver records synchronous network completion and rechecks exact identity', async () => {
  const i = intent();
  i.routing.destinationCidrs = [];
  const s = store();
  const action = translateGcpNativeCompute(i).actions[0];
  const calls: string[][] = [];
  const d = createGcpNativeCreationDriver(
    {
      exec: async (_cmd, args) => {
        calls.push(args);
        return {
          stdout: JSON.stringify({
            id: '123',
            name: 'outside',
            selfLink: `https://www.googleapis.com/compute/v1/projects/${i.project}/global/networks/outside`,
          }),
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
  expect(calls[0]).not.toContain('--async');
  expect(await d.reconcile(action, id, {})).toBe('done');
  expect(calls[1]).toContain('--project=test-project');
  await expect(d.reconcile(action, `create-${'b'.repeat(40)}`, {})).rejects.toThrow('missing');
});

it('checkpoint write failure removes private bootstrap staging before any cloud submit', async () => {
  const i = intent();
  i.routing.destinationCidrs = [];
  const action = translateGcpNativeCompute(i).actions.find((a) => a.kind === 'instance');
  if (!action) throw new Error('missing instance');
  const root = await realpath(await mkdtemp(join(tmpdir(), 'gcp-bootstrap-stage-')));
  let calls = 0;
  try {
    const privateStore = {
      read: async () => ({
        nodeName: 'node-a',
        project: i.project,
        deploymentName: i.deploymentName,
        siteName: i.sites[0].name,
        engine: 'native',
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        userData: '#cloud-config\n',
        consumed: false,
      }),
      write: async () => {
        throw new Error('checkpoint interrupted');
      },
      exclusive: async <T>(fn: () => Promise<T>) => fn(),
    };
    const driver = createGcpNativeCreationDriver(
      {
        exec: async () => {
          calls++;
          throw new Error('must not execute');
        },
      },
      privateStore,
      root,
      i,
    );
    await expect(driver.submit(action, `create-${'a'.repeat(40)}`)).rejects.toThrow('checkpoint interrupted');
    expect(await readdir(root)).toEqual([]);
    expect(calls).toBe(0);
  } finally {
    await rm(root, { recursive: true });
  }
});

it('completed VM operations record only the exact attached boot disk identity', async () => {
  const i = intent();
  i.routing.destinationCidrs = [];
  const s = store();
  const action = translateGcpNativeCompute(i).actions.find((a) => a.kind === 'instance');
  if (!action) throw new Error('missing instance');
  const id = `create-${'a'.repeat(40)}`,
    prefix = `https://www.googleapis.com/compute/v1/projects/${i.project}/zones/${i.sites[0].nodes[0].zone}`;
  await s.write(`gcp-operation-${id}.json`, {
    schemaVersion: 1,
    binding: {
      project: i.project,
      zone: i.sites[0].nodes[0].zone,
      deploymentName: i.deploymentName,
      engine: 'native',
      actionId: id,
    },
    operationName: 'operation-123',
    state: 'done',
    errorCodes: [],
  });
  const vmLink = `${prefix}/instances/node-a`,
    diskLink = `${prefix}/disks/node-a`;
  const driver = createGcpNativeCreationDriver(
    {
      exec: async (_cmd, args) => ({
        stdout: JSON.stringify(
          args[1] === 'instances'
            ? { selfLink: vmLink, disks: [{ boot: true, source: diskLink }] }
            : { id: '456', selfLink: diskLink, users: [vmLink] },
        ),
        stderr: '',
        exitCode: 0,
      }),
    },
    s,
    '/private/tmp',
    i,
  );
  expect(await driver.reconcile(action, id, {})).toBe('done');
  const ledger = (await s.read('gcp-resources.json')) as { resources: Array<{ kind: string; id: string }> };
  expect(ledger.resources[0]).toMatchObject({ kind: 'disk', id: '456' });
});
