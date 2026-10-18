import { expect, it } from 'bun:test';
import { fingerprint } from '../../src/ce/discovery';
import { applyGcpNativeLifecycle, type GcpLifecyclePlan } from '../../src/ce/native-apply';
import { type GcpResourceIdentity, recordGcpResource } from '../../src/ce/ownership';

const resource: GcpResourceIdentity = {
  id: '123',
  selfLink:
    'https://www.googleapis.com/compute/v1/projects/example-project/zones/northamerica-northeast1-a/instances/node-a',
  kind: 'instance',
  project: 'example-project',
  deploymentName: 'ce-test',
  engine: 'native',
};
function plan() {
  const body = {
    schemaVersion: 1 as const,
    engine: 'native' as const,
    project: resource.project,
    deploymentName: resource.deploymentName,
    actions: [
      {
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
        resources: [resource],
        dependencies: [],
      },
    ],
  };
  return { ...body, sha256: fingerprint(body) };
}
function store() {
  const files = new Map<string, unknown>();
  return {
    read: async (name: string) => {
      if (!files.has(name)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return structuredClone(files.get(name));
    },
    write: async (name: string, value: unknown) => {
      files.set(name, structuredClone(value));
    },
    exclusive: async <T>(fn: () => Promise<T>) => fn(),
  };
}
it('retains exact authorization across pending resume and does not resubmit', async () => {
  const s = store();
  await recordGcpResource(s, resource);
  const p = plan();
  let submitted = 0,
    state: 'pending' | 'done' = 'pending';
  const driver = {
    observe: async () => resource,
    submit: async () => {
      submitted++;
      return { operation: 'one' };
    },
    reconcile: async () => state,
  };
  expect((await applyGcpNativeLifecycle(s, p, p.sha256, driver)).state).toBe('pending');
  state = 'done';
  expect((await applyGcpNativeLifecycle(s, p, p.sha256, driver)).state).toBe('done');
  expect(submitted).toBe(1);
});
it('ambiguous submission reconciles before retry and checks ownership again', async () => {
  const s = store();
  await recordGcpResource(s, resource);
  const p = plan();
  let submitted = 0;
  await expect(
    applyGcpNativeLifecycle(s, p, p.sha256, {
      observe: async () => resource,
      submit: async () => {
        submitted++;
        throw new Error('lost response');
      },
      reconcile: async () => 'done',
    }),
  ).rejects.toThrow('lost response');
  expect(
    (
      await applyGcpNativeLifecycle(s, p, p.sha256, {
        observe: async () => resource,
        submit: async () => {
          submitted++;
          return {};
        },
        reconcile: async (_action, receipt) => {
          expect(receipt).toBeUndefined();
          return 'done';
        },
      })
    ).state,
  ).toBe('done');
  expect(submitted).toBe(1);
});
it('rejects wrong approval, changed argv and replaced resource before mutation', async () => {
  const s = store();
  await recordGcpResource(s, resource);
  const p = plan();
  let submitted = 0;
  const driver = {
    observe: async () => ({ ...resource, id: '456' }),
    submit: async () => {
      submitted++;
      return {};
    },
    reconcile: async () => 'done' as const,
  };
  await expect(applyGcpNativeLifecycle(s, p, 'wrong', driver)).rejects.toThrow('Reviewed');
  await expect(applyGcpNativeLifecycle(s, p, p.sha256, driver)).rejects.toThrow('ownership');
  expect(submitted).toBe(0);
  const changed = structuredClone(p);
  changed.actions[0].argv.push('--impersonate-service-account=foreign');
  const { sha256: _hash, ...body } = changed;
  changed.sha256 = fingerprint(body);
  await expect(applyGcpNativeLifecycle(s, changed, changed.sha256, driver)).rejects.toThrow('argument');
});
it('dependent actions never execute before prior asynchronous completion', async () => {
  const s = store();
  await recordGcpResource(s, resource);
  const p = plan() as GcpLifecyclePlan;
  p.actions.push({
    ...p.actions[0],
    id: 'start-node',
    argv: p.actions[0].argv.map((arg) => (arg === 'stop' ? 'start' : arg)),
    dependencies: ['stop-node'],
  });
  const { sha256: _hash, ...body } = p;
  p.sha256 = fingerprint(body);
  let calls = 0;
  await applyGcpNativeLifecycle(s, p, p.sha256, {
    observe: async () => resource,
    submit: async () => {
      calls++;
      return {};
    },
    reconcile: async () => 'pending',
  });
  expect(calls).toBe(1);
});
it('rejects foreign or dependency-forged checkpoint actions without executing', async () => {
  const s = store();
  await recordGcpResource(s, resource);
  const p = plan();
  await s.write('gcp-lifecycle-checkpoint.json', {
    schemaVersion: 1,
    planSha256: p.sha256,
    approvedPlanSha256: p.sha256,
    actions: { foreign: { state: 'done' } },
  });
  let calls = 0;
  await expect(
    applyGcpNativeLifecycle(s, p, p.sha256, {
      observe: async () => resource,
      submit: async () => {
        calls++;
        return {};
      },
      reconcile: async () => 'done',
    }),
  ).rejects.toThrow('foreign');
  expect(calls).toBe(0);
});
it('resize requires fresh stopped-state and machine preconditions before submission', async () => {
  const s = store();
  await recordGcpResource(s, resource);
  const p = plan();
  p.actions[0].argv = [
    'compute',
    'instances',
    'set-machine-type',
    'node-a',
    '--project=example-project',
    '--zone=northamerica-northeast1-a',
    '--machine-type=n2-standard-16',
    '--format=json',
  ];
  const { sha256: _hash, ...body } = p;
  p.sha256 = fingerprint(body);
  let calls = 0;
  await expect(
    applyGcpNativeLifecycle(s, p, p.sha256, {
      observe: async () => resource,
      submit: async () => {
        calls++;
        return {};
      },
      reconcile: async () => 'done',
    }),
  ).rejects.toThrow('prechecks');
  expect(calls).toBe(0);
});
