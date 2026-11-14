import { expect, it } from 'bun:test';
import { translateGcpPublicTerraformSiteCompute } from '../../src/ce/compute-plan';
import { translateGcpTerraformObserverSiteCompute } from '../../src/ce/observer-plan';
import { intent } from './fixtures';

const versions = { terraform: '1.17.2', google: '8.11.0', xcsh: '15.15.7' };
function key(value: number) {
  const raw = Buffer.concat([Buffer.from('0000000b7373682d6564323535313900000020', 'hex'), Buffer.alloc(32, value)]);
  return `ssh-ed25519 ${raw.toString('base64')}`;
}
function fixture() {
  const i = intent();
  i.engine = 'terraform';
  i.routing.destinationCidrs = [];
  i.sites[0].nodes = ['a', 'b', 'c'].map((suffix) => ({
    ...structuredClone(i.sites[0].nodes[0]),
    name: `node-${suffix}`,
    zone: `northamerica-northeast1-${suffix}`,
  }));
  i.initialAccess = { schemaVersion: 1, profile: 'site-ssh-sli', publicKey: key(1) };
  return i;
}
function observer() {
  return {
    schemaVersion: 1 as const,
    profile: 'original-ha-observer' as const,
    publicKey: key(2),
    sshSourceCidr: '192.0.2.4/32',
  };
}

it('includes all 18 original CE resources and the three observer resources before apply', () => {
  const i = fixture();
  const original = translateGcpPublicTerraformSiteCompute(i, versions);
  const plan = translateGcpTerraformObserverSiteCompute(i, versions, observer());
  expect(plan.schemaVersion).toBe(3);
  expect(plan.executable).toBe(false);
  expect(plan.inventory.ce).toHaveLength(18);
  expect(plan.inventory.observer).toEqual([
    'google_compute_disk.ce_test_observer',
    'google_compute_firewall.ce_test_observer_ssh',
    'google_compute_instance.ce_test_observer',
  ]);
  expect(plan.inventory.all).toHaveLength(21);
  expect(new Set(plan.inventory.all).size).toBe(21);
  for (const [type, resources] of Object.entries(original.configuration.resource))
    for (const [name, value] of Object.entries(resources))
      expect<unknown>(plan.configuration.resource[type][name]).toEqual(value);
  expect(JSON.stringify(i)).toBe(JSON.stringify(fixture()));
});

it('pins name and numeric image ID at apply and retains a separately owned observer disk', () => {
  const plan = translateGcpTerraformObserverSiteCompute(fixture(), versions, observer());
  expect(plan.configuration.data.google_compute_image.ce_test_observer).toEqual({
    project: 'ubuntu-os-cloud',
    name: 'ubuntu-2404-noble-amd64-v20261021',
  });
  const disk = plan.configuration.resource.google_compute_disk.ce_test_observer;
  expect(disk.image).toBe(`\${data.google_compute_image.ce_test_observer.self_link}`);
  expect(disk.lifecycle).toEqual({
    precondition: [
      {
        condition: `\${data.google_compute_image.ce_test_observer.image_id == "4996011480491275419" && data.google_compute_image.ce_test_observer.status == "READY"}`,
        error_message: 'Original pinned Ubuntu observer image identity required',
      },
    ],
  });
  expect(plan.configuration.resource.google_compute_instance.ce_test_observer.boot_disk).toEqual([
    { auto_delete: false, source: `\${google_compute_disk.ce_test_observer.self_link}` },
  ]);
});

it('uses the existing SLI network with no service account, forwarding, or CE bootstrap changes', () => {
  const plan = translateGcpTerraformObserverSiteCompute(fixture(), versions, observer());
  const vm = plan.configuration.resource.google_compute_instance.ce_test_observer;
  expect(vm.network_interface).toEqual([
    {
      network: `\${google_compute_network.inside.self_link}`,
      subnetwork: `\${google_compute_subnetwork.inside.self_link}`,
      access_config: [{}],
    },
  ]);
  expect(Object.hasOwn(vm, 'service_account')).toBe(false);
  expect(vm.can_ip_forward).toBe(false);
  expect(vm.metadata).toEqual({
    'ssh-keys': `ubuntu:${key(2)}`,
    'block-project-ssh-keys': 'TRUE',
    'enable-oslogin': 'FALSE',
  });
  expect(vm.metadata).not.toHaveProperty('user-data');
  expect(Object.hasOwn(plan.configuration, 'output')).toBe(false);
  expect(Object.hasOwn(plan.configuration, 'variable')).toBe(false);
});

it('restricts observer SSH to its one tag, one source address and TCP22', () => {
  const plan = translateGcpTerraformObserverSiteCompute(fixture(), versions, observer());
  const fw = plan.configuration.resource.google_compute_firewall.ce_test_observer_ssh;
  expect(fw).toMatchObject({
    direction: 'INGRESS',
    source_ranges: ['192.0.2.4/32'],
    target_tags: ['ce-test-observer'],
    allow: [{ protocol: 'tcp', ports: ['22'] }],
  });
  expect(plan.configuration.resource.google_compute_instance.ce_test_observer.tags).toEqual(['ce-test-observer']);
  expect(plan.configuration.resource.google_compute_instance.node_a.tags).not.toContain('ce-test-observer');
});

it('refuses wide, malformed, option-bearing and ambiguous SSH source addresses', () => {
  for (const source of [
    '0.0.0.0/0',
    '192.0.2.4/24',
    '192.0.2.999/32',
    '192.000.2.4/32',
    '127.0.0.1/32',
    '0.0.0.0/32',
    '224.0.0.1/32',
    '192.0.2.4/32\n',
    '$(whoami)/32',
  ])
    expect(() =>
      translateGcpTerraformObserverSiteCompute(fixture(), versions, { ...observer(), sshSourceCidr: source }),
    ).toThrow();
});

it('requires distinct valid campaign keys and an exact versioned observer request', () => {
  for (const access of [
    { ...observer(), publicKey: key(1) },
    { ...observer(), publicKey: `command="id" ${key(2)}` },
    { ...observer(), publicKey: `${key(2)}\n${key(2)}` },
    { ...observer(), schemaVersion: 2 },
    { ...observer(), schemaVersion: true },
    { ...observer(), privateKey: 'forbidden' },
  ])
    expect(() => translateGcpTerraformObserverSiteCompute(fixture(), versions, access as never)).toThrow();
});

it('refuses absent Site access, wrong engine/topology, conflicting SLI identities and unknown provider tuples', () => {
  const missing = fixture();
  delete missing.initialAccess;
  expect(() => translateGcpTerraformObserverSiteCompute(missing, versions, observer())).toThrow();
  const native = fixture();
  native.engine = 'native';
  expect(() => translateGcpTerraformObserverSiteCompute(native, versions, observer())).toThrow();
  const single = fixture();
  single.sites[0].nodes.length = 1;
  expect(() => translateGcpTerraformObserverSiteCompute(single, versions, observer())).toThrow();
  const conflict = fixture();
  conflict.sites[0].nodes[1].interfaces[1].network = 'other';
  expect(() => translateGcpTerraformObserverSiteCompute(conflict, versions, observer())).toThrow();
  for (const tuple of [
    { ...versions, google: '8.10.0' },
    { ...versions, xcsh: '15.13.0' },
    { ...versions, terraform: '1.17.1' },
    { ...versions, google: 'latest' },
  ])
    expect(() => translateGcpTerraformObserverSiteCompute(fixture(), tuple, observer())).toThrow();
});

it('refuses derived names that collide with CE identities or exceed GCP name limits', () => {
  const collision = fixture();
  collision.sites[0].nodes[0].name = 'ce-test-observer';
  expect(() => translateGcpTerraformObserverSiteCompute(collision, versions, observer())).toThrow();
  const long = fixture();
  long.deploymentName = 'a'.repeat(60);
  expect(() => translateGcpTerraformObserverSiteCompute(long, versions, observer())).toThrow();
});
