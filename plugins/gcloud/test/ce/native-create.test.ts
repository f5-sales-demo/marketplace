import { expect, it } from 'bun:test';
import { translateGcpNativeCompute } from '../../src/ce/compute-plan';
import { applyGcpNativeCreation } from '../../src/ce/native-create';
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
it('lost native creation responses reconcile before dependent resources or resubmission', async () => {
  const i = intent();
  i.routing.destinationCidrs = [];
  const p = translateGcpNativeCompute(i);
  const s = store();
  let submits = 0;
  const driver = {
    observe: async () => null,
    submit: async () => {
      submits++;
      throw new Error('lost');
    },
    reconcile: async () => 'pending' as const,
  };
  await expect(applyGcpNativeCreation(s, i, p.sha256, driver)).rejects.toThrow('lost');
  expect((await applyGcpNativeCreation(s, i, p.sha256, driver)).state).toBe('pending');
  expect(submits).toBe(1);
});
it('wrong approval and existing resources cannot mutate native creation', async () => {
  const i = intent();
  i.routing.destinationCidrs = [];
  const p = translateGcpNativeCompute(i);
  const s = store();
  let submits = 0;
  const resource = {
    id: '123',
    kind: 'network' as const,
    project: i.project,
    deploymentName: i.deploymentName,
    engine: 'native' as const,
    selfLink: `https://www.googleapis.com/compute/v1/projects/${i.project}/global/networks/outside`,
  };
  const driver = {
    observe: async () => resource,
    submit: async () => {
      submits++;
      return {};
    },
    reconcile: async () => 'done' as const,
  };
  await expect(applyGcpNativeCreation(s, i, 'wrong', driver)).rejects.toThrow('Reviewed');
  await expect(applyGcpNativeCreation(s, i, p.sha256, driver)).rejects.toThrow('collision');
  expect(submits).toBe(0);
});

it('records exact created identities and resumes completed actions without resubmission', async () => {
  const i = intent();
  i.routing.destinationCidrs = [];
  const plan = translateGcpNativeCompute(i),
    s = store();
  const created = new Map<string, import('../../src/ce/ownership').GcpResourceIdentity>();
  let submits = 0;
  const driver = {
    observe: async (action: import('../../src/ce/compute-plan').GcpNativeAction) => created.get(action.id) ?? null,
    submit: async (action: import('../../src/ce/compute-plan').GcpNativeAction) => {
      submits++;
      const name = action.argv[action.kind === 'subnetwork' ? 4 : 3];
      const scope =
        action.kind === 'instance'
          ? `zones/${i.sites[0].nodes[0].zone}`
          : action.kind === 'subnetwork'
            ? `regions/${i.region}`
            : 'global';
      const collection =
        action.kind === 'instance' ? 'instances' : action.kind === 'subnetwork' ? 'subnetworks' : 'networks';
      created.set(action.id, {
        id: String(submits),
        kind: action.kind,
        project: i.project,
        deploymentName: i.deploymentName,
        engine: 'native',
        selfLink: `https://www.googleapis.com/compute/v1/projects/${i.project}/${scope}/${collection}/${name}`,
      });
      return { accepted: true };
    },
    reconcile: async () => 'done' as const,
  };
  expect((await applyGcpNativeCreation(s, i, plan.sha256, driver)).state).toBe('done');
  expect(submits).toBe(plan.actions.length);
  expect((await applyGcpNativeCreation(s, i, plan.sha256, driver)).state).toBe('done');
  expect(submits).toBe(plan.actions.length);
  const ledger = (await s.read('gcp-resources.json')) as { resources: unknown[] };
  expect(ledger.resources).toHaveLength(plan.actions.length);
});
