import { expect, it } from 'bun:test';
import { type GcpNatIntent, planGcpCloudNat } from '../../src/ce/nat-plan';

function intent(): GcpNatIntent {
  const owner = { project: 'test-project', deploymentName: 'ce-test', engine: 'native' as const };
  const prefix = 'https://www.googleapis.com/compute/v1/projects/test-project';
  return {
    schemaVersion: 1,
    ...owner,
    region: 'northamerica-northeast1',
    routerName: 'slo-router',
    natName: 'slo-nat',
    network: { ...owner, kind: 'network', id: '123', selfLink: `${prefix}/global/networks/outside` },
    sloSubnet: {
      ...owner,
      kind: 'subnetwork',
      id: '456',
      selfLink: `${prefix}/regions/northamerica-northeast1/subnetworks/outside`,
    },
    observedSubnetNetwork: `${prefix}/global/networks/outside`,
    egressFirewallVerified: true,
  };
}
it('native NAT explicitly limits egress to SLO and waits for router creation', () => {
  const plan = planGcpCloudNat(intent());
  expect(plan.actions[1].argv).toContain('--nat-custom-subnet-ip-ranges=outside');
  expect(plan.actions[1].argv).not.toContain('--nat-all-subnet-ip-ranges');
  expect(plan.actions[1].dependencies).toEqual(['router-slo-router']);
  expect(plan.executable).toBe(false);
});
it('Terraform NAT uses exact owned subnet and primary range only', () => {
  const i = intent();
  i.engine = 'terraform';
  i.network.engine = 'terraform';
  i.sloSubnet.engine = 'terraform';
  const plan = planGcpCloudNat(i);
  expect(plan.resources.google_compute_router_nat?.slo_nat).toMatchObject({
    source_subnetwork_ip_ranges_to_nat: 'LIST_OF_SUBNETWORKS',
    subnetwork: [{ name: i.sloSubnet.selfLink, source_ip_ranges_to_nat: ['PRIMARY_IP_RANGE'] }],
  });
});
it('rejects wrong region/network/engine and missing firewall path', () => {
  const i = intent();
  expect(() => planGcpCloudNat({ ...i, egressFirewallVerified: false })).toThrow('firewall');
  expect(() => planGcpCloudNat({ ...i, region: 'us-central1' })).toThrow('identity');
  expect(() => planGcpCloudNat({ ...i, observedSubnetNetwork: 'foreign' })).toThrow('identity');
  expect(() => planGcpCloudNat({ ...i, engine: 'terraform' })).toThrow('ownership');
});
