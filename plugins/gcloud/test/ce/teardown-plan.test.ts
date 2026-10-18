import { expect, it } from 'bun:test';
import type { GcpResourceIdentity } from '../../src/ce/ownership';
import { planGcpOwnedTeardown } from '../../src/ce/teardown-plan';

const scope = {
  project: 'test-project',
  deploymentName: 'ce-test',
  engine: 'native' as const,
  region: 'northamerica-northeast1',
};
function resource(kind: GcpResourceIdentity['kind'], collection: string, name: string): GcpResourceIdentity {
  return {
    ...scope,
    id: '123',
    kind,
    selfLink: `https://www.googleapis.com/compute/v1/projects/test-project/${kind === 'instance' ? 'zones/northamerica-northeast1-a' : kind === 'subnetwork' ? 'regions/northamerica-northeast1' : 'global'}/${collection}/${name}`,
  };
}
it('plans task-owned compute deletion before subnet/network and requires absence evidence', () => {
  const plan = planGcpOwnedTeardown(
    [
      resource('network', 'networks', 'outside'),
      resource('subnetwork', 'subnetworks', 'outside'),
      resource('instance', 'instances', 'ce'),
    ],
    scope,
  );
  expect(plan.resources.map((r) => r.kind)).toEqual(['instance', 'subnetwork', 'network']);
  expect(plan.executable).toBe(false);
  expect(plan.required).toContain('independent absence checks');
});
it('rejects foreign ownership, wrong engine, duplicates and empty inventory', () => {
  const vm = resource('instance', 'instances', 'ce');
  expect(() => planGcpOwnedTeardown([{ ...vm, engine: 'terraform' }], scope)).toThrow('ownership');
  expect(() => planGcpOwnedTeardown([vm, vm], scope)).toThrow('duplicates');
  expect(() => planGcpOwnedTeardown([], scope)).toThrow('absence');
});
