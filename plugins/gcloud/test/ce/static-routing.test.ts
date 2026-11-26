import { expect, it } from 'bun:test';
import { type GcpStaticRouteIntent, planGcpStaticInsertion } from '../../src/ce/static-routing';

const prefix = 'https://www.googleapis.com/compute/v1/projects/test-project';
function fixture() {
  const binding = { project: 'test-project', deploymentName: 'ce-test', engine: 'native' as const };
  const intent: GcpStaticRouteIntent = {
    schemaVersion: 1,
    ...binding,
    node: {
      ...binding,
      kind: 'instance',
      id: '123',
      selfLink: `${prefix}/zones/northamerica-northeast1-a/instances/node-a`,
    },
    network: { ...binding, kind: 'network', id: '456', selfLink: `${prefix}/global/networks/inside` },
    routes: [{ name: 'to-origin', destinationCidr: '10.2.0.0/24', priority: 100, clientTags: ['owned-client'] }],
  };
  return {
    intent,
    vm: { id: '123', selfLink: intent.node.selfLink, canIpForward: true, networks: [intent.network.selfLink] },
  };
}
it('scopes next-hop routes to named clients and exact owned CE instance', () => {
  const f = fixture(),
    plan = planGcpStaticInsertion(f.intent, f.vm);
  expect(plan.actions[0].argv).toContain('--next-hop-instance-zone=northamerica-northeast1-a');
  expect(plan.actions[0].argv).toContain('--tags=owned-client');
  expect(plan.executable).toBe(false);
  expect(plan.required).toContain('return-path symmetry');
});
it('Terraform persists explicit instance selfLink rather than a mutable lookup', () => {
  const f = fixture();
  f.intent.engine = 'terraform';
  f.intent.node.engine = 'terraform';
  f.intent.network.engine = 'terraform';
  const plan = planGcpStaticInsertion(f.intent, f.vm);
  expect(plan.terraformResources.to_origin).toMatchObject({
    next_hop_instance: f.intent.node.selfLink,
    tags: ['owned-client'],
  });
  expect(plan.actions).toEqual([]);
});
it('rejects foreign ownership, missing IP forwarding and untagged or duplicate routes', () => {
  const f = fixture();
  expect(() => planGcpStaticInsertion(f.intent, { ...f.vm, canIpForward: false })).toThrow('forward');
  expect(() => planGcpStaticInsertion(f.intent, { ...f.vm, id: '789' })).toThrow('identity');
  f.intent.routes[0].clientTags = [];
  expect(() => planGcpStaticInsertion(f.intent, f.vm)).toThrow('tags');
});
