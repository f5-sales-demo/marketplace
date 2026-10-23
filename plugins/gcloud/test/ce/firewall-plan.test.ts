import { expect, it } from 'bun:test';
import { type GcpFirewallIntent, planGcpFirewall } from '../../src/ce/firewall-plan';

function intent(): GcpFirewallIntent {
  const owner = { project: 'example-project', deploymentName: 'ce-test', engine: 'native' as const };
  return {
    schemaVersion: 1,
    ...owner,
    network: {
      ...owner,
      kind: 'network',
      id: '123',
      selfLink: 'https://www.googleapis.com/compute/v1/projects/example-project/global/networks/outside',
    },
    rules: [
      {
        name: 'probe-health',
        direction: 'INGRESS',
        priority: 1000,
        targetTags: ['ce-node'],
        cidrs: ['192.0.2.0/24'],
        allowed: [{ protocol: 'tcp', ports: ['443'] }],
      },
    ],
  };
}
it('requires exact network and target scope with explicit protocol/ports', () => {
  const plan = planGcpFirewall(intent());
  expect(plan.actions[0].argv).toContain('--target-tags=ce-node');
  expect(plan.actions[0].argv).toContain('--source-ranges=192.0.2.0/24');
  expect(plan.actions[0].argv).toContain('--allow=tcp:443');
  expect(plan.executable).toBe(false);
});
it('Terraform keeps egress destinations separate from ingress sources', () => {
  const i = intent();
  i.engine = 'terraform';
  i.network.engine = 'terraform';
  i.rules[0].direction = 'EGRESS';
  const plan = planGcpFirewall(i);
  expect(plan.terraformResources.google_compute_firewall?.probe_health).toMatchObject({
    direction: 'EGRESS',
    destination_ranges: ['192.0.2.0/24'],
  });
});
it('rejects implicit scope, invalid ranges and protocol injection', () => {
  const i = intent();
  i.rules[0].targetTags = [];
  expect(() => planGcpFirewall(i)).toThrow('target');
  i.rules[0].targetTags = ['ce-node'];
  i.rules[0].allowed[0].ports = ['443,--project=foreign'];
  expect(() => planGcpFirewall(i)).toThrow('port');
  i.rules[0].allowed[0].ports = ['443'];
  i.rules[0].cidrs = ['192.0.2.1/24'];
  expect(() => planGcpFirewall(i)).toThrow('boundary');
});
