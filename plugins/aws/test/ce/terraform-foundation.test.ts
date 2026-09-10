import { expect, it } from 'bun:test';
import { canonicalSha256 } from '../../src/ce/canonical';
import { renderAwsTerraformFoundation } from '../../src/ce/terraform-foundation';
import type { AwsCePlan } from '../../src/ce/types';
import { foundationPlan } from './terraform-fixtures';

const bootstrap = '#cloud-config\nwrite_files:\n- path: /etc/vpm/user_data\n  content: fixture-only\n';
it('renders six ENIs before admitting any VM, with authoritative identity outputs and engine tags', () => {
  const config = JSON.parse(renderAwsTerraformFoundation(foundationPlan()));
  expect(Object.keys(config.resource.aws_network_interface)).toHaveLength(6);
  expect(Object.keys(config.resource.aws_route_table)).toEqual(['slo', 'sli']);
  expect(Object.keys(config.resource.aws_route_table_association)).toHaveLength(6);
  expect(config.resource.aws_route_table_association.node_1_nic_0.route_table_id).toBe(
    `\${aws_route_table.slo.id}`,
  );
  expect(config.resource.aws_route_table_association.node_1_nic_1.route_table_id).toBe(
    `\${aws_route_table.sli.id}`,
  );
  expect(config.resource.aws_instance).toBeUndefined();
  expect(config.provider.aws).toMatchObject({
    allowed_account_ids: ['123456789012'],
    profile: 'ce-profile',
    region: 'us-east-1',
  });
  for (const eni of Object.values(config.resource.aws_network_interface) as Array<Record<string, unknown>>) {
    expect(eni.source_dest_check).toBe(false);
    expect(eni.tags).toMatchObject({ 'xcsh-execution-engine': 'terraform' });
  }
  expect(Object.keys(config.output.ce_interfaces.value)).toHaveLength(6);
});
it('admits independent sites cumulatively and preserves exact bootstrap bytes', () => {
  const first = JSON.parse(renderAwsTerraformFoundation(foundationPlan(), { 1: bootstrap }));
  const second = JSON.parse(renderAwsTerraformFoundation(foundationPlan(), { 1: bootstrap, 2: bootstrap }));
  expect(Object.keys(first.resource.aws_instance)).toEqual(['node_1']);
  expect(second.resource.aws_instance.node_1).toEqual(first.resource.aws_instance.node_1);
  expect(Buffer.from(first.resource.aws_instance.node_1.user_data_base64, 'base64').toString()).toBe(bootstrap);
  expect(first.resource.aws_instance.node_1.user_data_replace_on_change).toBe(true);
  expect(first.resource.aws_instance.node_1.source_dest_check).toBeUndefined();
  expect(first.resource.aws_instance.node_1.root_block_device[0].volume_size).toBe(100);
});
it('rejects partial HA admission, unresolved bootstrap and native or obsolete plans', () => {
  expect(() => renderAwsTerraformFoundation(foundationPlan(), { '01': bootstrap })).toThrow('admission');
  expect(() => renderAwsTerraformFoundation(foundationPlan(true), { 1: bootstrap })).toThrow('HA');
  expect(
    Object.keys(
      JSON.parse(renderAwsTerraformFoundation(foundationPlan(true), { 1: bootstrap, 2: bootstrap, 3: bootstrap }))
        .resource.aws_instance,
    ),
  ).toHaveLength(3);
  expect(() => renderAwsTerraformFoundation(foundationPlan(), { 1: `${bootstrap}__TOKEN__` })).toThrow('resolved');
  expect(() => renderAwsTerraformFoundation({ ...foundationPlan(), engine: 'native' })).toThrow();
  expect(() => renderAwsTerraformFoundation({ ...foundationPlan(), schemaVersion: 1 } as never)).toThrow();
});

it('composes internal NLB ingress with TGW routing and cumulative admission', () => {
  const source = foundationPlan();
  const { planId: _id, planSha256: _sha, ...draft } = source;
  draft.intent = {
    ...draft.intent,
    ingress: {
      mode: 'nlb',
      port: 8443,
      scheme: 'internal',
      loadBalancer: {
        vpcId: 'vpc-0bbbbbbbbbbbbbbbb',
        subnetIds: ['subnet-0cccccccccccccccc'],
        privateAddresses: ['10.9.0.10'],
      },
      listener: {
        name: 'ce-listener',
        namespace: 'default',
        domain: 'ce.example.invalid',
        privateAddresses: ['10.0.4.10', '10.0.5.10', '10.0.6.10'],
        originPool: { name: 'ce-origin', namespace: 'default' },
      },
      probe: {
        sourceInstanceId: 'i-0feedface12345678',
        path: '/healthz',
        expectedStatus: 200,
        expectedBodySha256: '4'.repeat(64),
      },
    },
  };
  const planSha256 = canonicalSha256(draft);
  const plan = { ...draft, planSha256, planId: `aws-ce-${planSha256.slice(0, 24)}` } as AwsCePlan;
  const network = JSON.parse(renderAwsTerraformFoundation(plan));
  expect(network.resource.aws_lb.ce.internal).toBe(true);
  expect(network.resource.aws_lb.ce.load_balancer_type).toBe('network');
  expect(network.resource.aws_lb.ce.subnet_mapping).toEqual([
    { subnet_id: 'subnet-0cccccccccccccccc', private_ipv4_address: '10.9.0.10' },
  ]);
  expect(network.resource.aws_lb.ce.enable_cross_zone_load_balancing).toBe(true);
  expect(network.resource.aws_lb_target_group.ce.port).toBe(8443);
  expect(network.resource.aws_lb_target_group.ce.vpc_id).toBe('vpc-0bbbbbbbbbbbbbbbb');
  expect(network.resource.aws_lb_listener.ce.default_action[0].target_group_arn).toContain('aws_lb_target_group');
  expect(network.resource.aws_lb_target_group_attachment).toBeUndefined();
  expect(network.output.ce_ingress.value.scheme).toBe('internal');
  const admitted = JSON.parse(renderAwsTerraformFoundation(plan, { 1: bootstrap, 2: bootstrap }));
  expect(Object.keys(admitted.resource.aws_lb_target_group_attachment)).toEqual(['node_1', 'node_2']);
  expect(admitted.resource.aws_lb_target_group_attachment.node_1.target_id).toBe('10.0.4.10');
  expect(admitted.resource.aws_lb_target_group_attachment.node_1.availability_zone).toBe('all');
  expect(admitted.resource.aws_network_interface.node_1_nic_1.private_ips).toEqual(['10.0.4.10']);
});
