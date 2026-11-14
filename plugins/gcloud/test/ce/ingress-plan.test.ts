import { expect, it } from 'bun:test';
import { type GcpInternalIngressIntent, planGcpInternalIngress } from '../../src/ce/ingress-plan';

function intent(): GcpInternalIngressIntent {
  const binding = { project: 'example-project', deploymentName: 'ce-test', engine: 'terraform' as const },
    prefix = 'https://www.googleapis.com/compute/v1/projects/example-project';
  return {
    schemaVersion: 1,
    ...binding,
    region: 'northamerica-northeast1',
    name: 'ce-ingress',
    network: { ...binding, id: '123', kind: 'network', selfLink: `${prefix}/global/networks/outside` },
    subnet: {
      ...binding,
      id: '456',
      kind: 'subnetwork',
      selfLink: `${prefix}/regions/northamerica-northeast1/subnetworks/outside`,
    },
    subnetNetwork: `${prefix}/global/networks/outside`,
    backendNodes: [
      {
        ...binding,
        id: '789',
        kind: 'instance',
        selfLink: `${prefix}/zones/northamerica-northeast1-a/instances/node-a`,
      },
    ],
    protocol: 'TCP',
    ports: [443],
    healthCheck: { protocol: 'TCP', port: 443 },
    backendInterface: 'slo',
    allowGlobalAccess: false,
  };
}
it('models regional internal passthrough ingress independently of routes', () => {
  const plan = planGcpInternalIngress(intent());
  expect(plan.createsRoutes).toBe(false);
  expect(plan.executable).toBe(false);
  expect(plan.terraformResources.google_compute_forwarding_rule.ce_ingress).toMatchObject({
    load_balancing_scheme: 'INTERNAL',
    ip_protocol: 'TCP',
    ports: ['443'],
    allow_global_access: false,
  });
  expect(plan.required).toContain('return-path symmetry');
});
it('rejects inferred SLI backend, foreign region and missing health checks', () => {
  const i = intent();
  expect(() => planGcpInternalIngress({ ...i, backendInterface: 'sli' })).toThrow('unavailable');
  expect(() => planGcpInternalIngress({ ...i, region: 'us-central1' })).toThrow('region');
  expect(() => planGcpInternalIngress({ ...i, healthCheck: { protocol: 'TCP', port: 0 } })).toThrow('health-check');
});
it('three-node HA requires complete unique inventory and remains a live gate', () => {
  const i = intent();
  i.backendNodes.push(
    { ...i.backendNodes[0], id: '790', selfLink: i.backendNodes[0].selfLink.replace('node-a', 'node-b') },
    { ...i.backendNodes[0], id: '791', selfLink: i.backendNodes[0].selfLink.replace('node-a', 'node-c') },
  );
  const plan = planGcpInternalIngress(i);
  expect(plan.required).toContain('HA backend health and serial failure acceptance');
  i.backendNodes[2] = i.backendNodes[1];
  expect(() => planGcpInternalIngress(i)).toThrow('inventory');
});
