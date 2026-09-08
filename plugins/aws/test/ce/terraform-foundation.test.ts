import { expect, it } from 'bun:test';
import { renderAwsTerraformFoundation } from '../../src/ce/terraform-foundation';
import { foundationPlan } from './terraform-fixtures';

const bootstrap = '#cloud-config\nwrite_files:\n- path: /etc/vpm/user_data\n  content: fixture-only\n';
it('renders six ENIs before admitting any VM, with authoritative identity outputs and engine tags', () => {
  const config = JSON.parse(renderAwsTerraformFoundation(foundationPlan()));
  expect(Object.keys(config.resource.aws_network_interface)).toHaveLength(6);
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
