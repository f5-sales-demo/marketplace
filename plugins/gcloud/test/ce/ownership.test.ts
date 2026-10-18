import { expect, it } from 'bun:test';
import { assertGcpResourceOwnership, type GcpResourceIdentity, recordGcpResource } from '../../src/ce/ownership';

const resource: GcpResourceIdentity = {
  id: '123',
  selfLink:
    'https://www.googleapis.com/compute/v1/projects/test-project/zones/northamerica-northeast1-a/instances/ce-test',
  kind: 'instance',
  project: 'test-project',
  deploymentName: 'ce-test',
  siteName: 'site-test',
  nodeName: 'node-test',
  engine: 'native',
};
function store() {
  let value: unknown;
  return {
    read: async () => {
      if (!value) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return structuredClone(value);
    },
    write: async (_name: string, next: unknown) => {
      value = structuredClone(next);
    },
  };
}
it('requires exact ledger and live numeric identity despite reused names or labels', async () => {
  const s = store();
  await recordGcpResource(s, resource);
  await assertGcpResourceOwnership(s, resource, resource);
  await expect(assertGcpResourceOwnership(s, resource, { ...resource, id: '456' })).rejects.toThrow('ownership');
  await expect(recordGcpResource(s, { ...resource, id: '456' })).rejects.toThrow('replacement');
});
it('rejects cross-project and wrong-engine mutation ownership', async () => {
  const s = store();
  await recordGcpResource(s, resource);
  await expect(assertGcpResourceOwnership(s, { ...resource, engine: 'terraform' }, resource)).rejects.toThrow('ledger');
  await expect(recordGcpResource(s, { ...resource, project: 'other-project' })).rejects.toThrow('selfLink');
});
it('missing ledger never authorizes deletion and repeated receipts are idempotent', async () => {
  const s = store();
  await expect(assertGcpResourceOwnership(s, resource, resource)).rejects.toThrow();
  await recordGcpResource(s, resource);
  await recordGcpResource(s, resource);
  expect(((await s.read()) as { resources: unknown[] }).resources).toHaveLength(1);
});
