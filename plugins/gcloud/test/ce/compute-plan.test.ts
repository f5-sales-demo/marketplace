import { expect, it } from 'bun:test';
import { translateGcpNativeCompute, translateGcpTerraformCompute } from '../../src/ce/compute-plan';
import { intent } from './fixtures';

it('native candidate preserves ordered NICs, scoped argv and private bootstrap input', () => {
  const i = intent();
  const plan = translateGcpNativeCompute(i);
  expect(plan.executable).toBe(false);
  const vm = plan.actions.find((a) => a.kind === 'instance');
  if (!vm) throw new Error('missing VM candidate');
  expect(vm.argv.filter((a) => a.startsWith('--network-interface'))).toEqual([
    '--network-interface=network=outside,subnet=outside',
    '--network-interface=network=inside,subnet=inside,no-address',
  ]);
  expect(vm.argv).toContain('--can-ip-forward');
  expect(vm.argv).toContain('--no-service-account');
  expect(vm.argv).toContain('--async');
  expect(vm.sensitiveInput).toBe('restricted-node-metadata-file');
  expect(vm.dependencies).toEqual(['subnetwork-outside', 'subnetwork-inside']);
  expect(JSON.stringify(plan)).not.toContain('user-data=');
});
it('Terraform candidate pins provider, sensitive node input and identical NIC order', () => {
  const i = intent();
  i.engine = 'terraform';
  const plan = translateGcpTerraformCompute(i, '7.0.0');
  expect(plan.executable).toBe(false);
  expect(plan.configuration.terraform.required_providers.google.version).toBe('= 7.0.0');
  const vm = plan.configuration.resource.google_compute_instance.node_a as {
    network_interface: Array<{ access_config?: unknown }>;
    service_account?: unknown;
  };
  expect(vm.network_interface).toHaveLength(2);
  expect(vm.network_interface[0].access_config).toEqual([{}]);
  expect(vm.network_interface[1].access_config).toBeUndefined();
  expect(vm.service_account).toBeUndefined();
  expect(plan.configuration.variable.node_a_user_data).toMatchObject({ sensitive: true });
  expect(Object.hasOwn(plan.configuration, 'output')).toBe(false);
});
it('compute translators reject wrong engine and unimplemented egress profiles', () => {
  const i = intent();
  expect(() => translateGcpTerraformCompute(i, '7.0.0')).toThrow('ownership');
  i.engine = 'terraform';
  expect(() => translateGcpNativeCompute(i)).toThrow('ownership');
  i.egress.mode = 'cloud-nat';
  expect(() => translateGcpTerraformCompute(i, '7.0.0')).toThrow('external-IP');
});
