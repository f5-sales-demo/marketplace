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
