import { expect, it } from 'bun:test';
import {
  assertGcpResourceOwnership,
  type GcpResourceIdentity,
  readGcpResourceInventory,
  recordGcpResource,
} from '../../src/ce/ownership';

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
it('rejects resource selfLinks in a scope unsupported by their kind', async () => {
  const s = store();
  await expect(
    recordGcpResource(s, {
      ...resource,
      selfLink: resource.selfLink.replace('zones/northamerica-northeast1-a', 'global'),
    }),
  ).rejects.toThrow('selfLink');
  const network = {
    ...resource,
    kind: 'network' as const,
    selfLink: resource.selfLink.replace('/instances/', '/networks/'),
  };
  await expect(recordGcpResource(s, network)).rejects.toThrow('selfLink');
});

it('rejects unexpected private fields before retaining ownership identity', async () => {
  const s = store();
  await expect(
    recordGcpResource(s, { ...resource, metadata: { token: 'PRIVATE' } } as GcpResourceIdentity),
  ).rejects.toThrow('fields');
  await expect(s.read()).rejects.toThrow('missing');
});

it('validates every resumed inventory record and returns an isolated copy', async () => {
  const s = store();
  await recordGcpResource(s, resource);
  const inventory = await readGcpResourceInventory(s, resource);
  inventory[0].id = '456';
  expect((await readGcpResourceInventory(s, resource))[0].id).toBe('123');
  const ledger = (await s.read()) as { resources: GcpResourceIdentity[] };
  ledger.resources.push({ ...resource, engine: 'terraform', id: '456' });
  await s.write('gcp-resources.json', ledger);
  await expect(readGcpResourceInventory(s, resource)).rejects.toThrow('mixed ownership');
  await expect(assertGcpResourceOwnership(s, resource, resource)).rejects.toThrow('mixed ownership');
});

it('equivalent identity key order does not change ownership or duplicate its ledger entry', async () => {
  const s = store();
  await recordGcpResource(s, resource);
  const reordered = Object.fromEntries(Object.entries(resource).reverse()) as unknown as GcpResourceIdentity;
  await recordGcpResource(s, reordered);
  await assertGcpResourceOwnership(s, reordered, resource);
  expect((await readGcpResourceInventory(s, resource)).length).toBe(1);
});
