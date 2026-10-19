import { expect, it } from 'bun:test';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { fingerprint } from '../../src/ce/discovery';
import {
  inspectPublicTerraformOwnership,
  publicTerraformAddresses,
  publicTerraformCloudScope,
} from '../../src/ce/terraform-public-ownership';
import { verifyPublicTerraformLiveOwnership } from '../../src/ce/terraform-public-teardown';
import type { GcpTerraformTeardownRuntime } from '../../src/ce/terraform-teardown';
import { intent } from './fixtures';

function fixture() {
  const i = intent();
  i.engine = 'terraform';
  i.routing.destinationCidrs = [];
  const node = i.sites[0].nodes[0];
  i.sites[0].nodes.push(
    { ...structuredClone(node), name: 'node-b', zone: 'northamerica-northeast1-b' },
    { ...structuredClone(node), name: 'node-c', zone: 'northamerica-northeast1-c' },
  );
  const prefix = `https://www.googleapis.com/compute/v1/projects/${i.project}`;
  const fields: Record<string, Record<string, unknown> | null> = {};
  const live = new Map<string, { id: string; selfLink: string }>();
  for (const [index, n] of i.sites[0].nodes.entries()) {
    const key = n.name.replaceAll('-', '_');
    const disk = `${prefix}/zones/${n.zone}/disks/${n.name}`;
    const instance = `${prefix}/zones/${n.zone}/instances/${n.name}`;
    const id = `${18446744073709551600n + BigInt(index * 2)}`;
    fields[`google_compute_instance.${key}`] = {
      name: n.name,
      project: i.project,
      zone: n.zone,
      self_link: instance,
      instance_id: id,
      'boot_disk.length': 1,
      'boot_disk.0.source': disk,
      'boot_disk.0.auto_delete': false,
      'network_interface.length': 2,
      ...Object.fromEntries(
        n.interfaces.flatMap((nic) => [
          [`network_interface.${nic.index}.network`, `${prefix}/global/networks/${nic.network}`],
          [`network_interface.${nic.index}.subnetwork`, `${prefix}/regions/${i.region}/subnetworks/${nic.subnet}`],
        ]),
      ),
    };
    fields[`google_compute_disk.${key}`] = {
      name: n.name,
      project: i.project,
      zone: n.zone,
      self_link: disk,
      disk_id: `${BigInt(id) + 1n}`,
    };
    live.set(instance, { id, selfLink: instance });
    live.set(disk, { id: `${BigInt(id) + 1n}`, selfLink: disk });
    fields[`xcsh_token.${key}`] = {
      name: `${n.name}-token`,
      namespace: 'system',
      site_name: i.sites[0].name,
      creation_identity_sha256: fingerprint(`${n.name}-uid`),
    };
  }
  for (const [index, nic] of node.interfaces.entries()) {
    const network = `${prefix}/global/networks/${nic.network}`;
    const subnet = `${prefix}/regions/${i.region}/subnetworks/${nic.subnet}`;
    fields[`google_compute_network.${nic.network}`] = {
      name: nic.network,
      project: i.project,
      self_link: network,
      numeric_id: `${100 + index}`,
    };
    fields[`google_compute_subnetwork.${nic.subnet}`] = {
      name: nic.subnet,
      project: i.project,
      self_link: subnet,
      subnetwork_id: `${200 + index}`,
      region: i.region,
      network,
      ip_cidr_range: nic.cidr,
    };
    live.set(network, { id: `${100 + index}`, selfLink: network });
    live.set(subnet, { id: `${200 + index}`, selfLink: subnet });
  }
  const firewallName = `${i.sites[0].name}-ha-slo-icmp`;
  const firewallLink = `${prefix}/global/firewalls/${firewallName}`;
  fields[`google_compute_firewall.${firewallName.replaceAll('-', '_')}`] = {
    name: firewallName,
    project: i.project,
    self_link: firewallLink,
    firewall_id: '301',
    network: `${prefix}/global/networks/${node.interfaces[0].network}`,
    direction: 'INGRESS',
    source_ranges: [node.interfaces[0].cidr],
    target_tags: [`${i.sites[0].name}-ha-peer`],
    allow: [{ protocol: 'icmp', ports: [] }],
  };
  live.set(firewallLink, { id: '301', selfLink: firewallLink });
  fields['xcsh_securemesh_site_v2.ce_site'] = {
    name: i.sites[0].name,
    namespace: 'system',
    creation_identity_sha256: fingerprint('site-uid'),
  };
  const receipt = {
    schemaVersion: 1,
    deploymentId: i.deploymentName,
    engine: 'terraform',
    backendIdentity: `local:${i.deploymentName}`,
    configurationSha256: 'a'.repeat(64),
    providerLockSha256: 'b'.repeat(64),
    planSha256: 'c'.repeat(64),
    noChanges: false,
    changes: Object.keys(fields).map((address) => ({ address, type: address.split('.')[0], actions: ['create'] })),
  } as PlanReceipt;
  let platformReads = 0;
  const runtime = {
    session: {
      readApplyAttemptResourceFields: async () => ({
        schemaVersion: 1,
        planSha256: receipt.planSha256,
        applyState: 'applying',
        stateSha256: 'd'.repeat(64),
        lineage: 'original-ha-lineage',
        serial: 2,
        resources: structuredClone(fields),
      }),
    },
    api: {
      exec: async (_command: string, args: string[]) => {
        const name = args[args.indexOf('describe') + 1];
        const collection = args.includes('subnets')
          ? 'subnetworks'
          : args.includes('instances')
            ? 'instances'
            : args.includes('disks')
              ? 'disks'
              : args.includes('firewall-rules')
                ? 'firewalls'
                : 'networks';
        const row = [...live.values()].find((r) => r.selfLink.endsWith(`/${collection}/${name}`));
        return row
          ? { exitCode: 0, stdout: JSON.stringify(row), stderr: '' }
          : { exitCode: 1, stdout: '', stderr: 'not found' };
      },
    },
    observePlatform: async (site: string, token: string) => {
      platformReads++;
      const siteValue = fields['xcsh_securemesh_site_v2.ce_site'];
      const tokenValue = fields[`xcsh_token.${token.replace(/-token$/, '').replaceAll('-', '_')}`];
      return {
        siteName: site,
        tokenName: token,
        siteAbsent: !siteValue,
        tokenAbsent: !tokenValue,
        siteIdentitySha256: siteValue?.creation_identity_sha256,
        tokenIdentitySha256: tokenValue?.creation_identity_sha256,
      };
    },
    environment: {},
  } as unknown as GcpTerraformTeardownRuntime;
  return { i, runtime, receipt, fields, live, platformReads: () => platformReads };
}
it('captures all fifteen HA identities with exact per-zone VM and disk joins and deduplicated VPCs', async () => {
  const f = fixture();
  expect(publicTerraformAddresses(f.i)).toHaveLength(15);
  expect(publicTerraformCloudScope(f.i)).toHaveLength(11);
  const owned = await inspectPublicTerraformOwnership(f.runtime, f.i, f.receipt);
  expect(owned.complete).toBe(true);
  expect(owned.resources).toHaveLength(11);
  expect(Object.keys(owned.platform)).toHaveLength(4);
  expect(owned.resources.find((r) => r.nodeName === 'node-c' && r.kind === 'instance')?.id).toBe(
    '18446744073709551604',
  );
  expect(f.platformReads()).toBe(3);
  expect(await verifyPublicTerraformLiveOwnership(f.runtime, f.i, owned, undefined, false)).toEqual([]);
});
it('captures a later-node orphan disk without inferring its missing VM or token', async () => {
  const f = fixture();
  for (const address of ['google_compute_instance.node_b', 'xcsh_token.node_b']) {
    const link = f.fields[address]?.self_link;
    if (typeof link === 'string') f.live.delete(link);
    f.fields[address] = null;
  }
  const owned = await inspectPublicTerraformOwnership(f.runtime, f.i, f.receipt);
  expect(owned.complete).toBe(false);
  expect(owned.addresses).toHaveLength(13);
  expect(owned.resources.some((r) => r.kind === 'disk' && r.nodeName === 'node-b')).toBe(true);
  expect(await verifyPublicTerraformLiveOwnership(f.runtime, f.i, owned)).toEqual(
    expect.arrayContaining(['google_compute_instance.node_b', 'xcsh_token.node_b']),
  );
});
it('rejects a disk attached to another HA node, wrong-zone state and unidentified later-node objects', async () => {
  for (const change of ['disk', 'zone', 'unidentified']) {
    const f = fixture();
    const vm = f.fields['google_compute_instance.node_c'];
    if (!vm) throw new Error('missing VM fixture');
    if (change === 'disk') vm['boot_disk.0.source'] = f.fields['google_compute_disk.node_a']?.self_link;
    if (change === 'zone') vm.zone = 'northamerica-northeast1-a';
    if (change === 'unidentified') f.fields['google_compute_disk.node_c'] = null;
    await expect(inspectPublicTerraformOwnership(f.runtime, f.i, f.receipt)).rejects.toThrow();
  }
});
it('checks every original HA token identity and all fifteen independent absences', async () => {
  const f = fixture();
  const owned = await inspectPublicTerraformOwnership(f.runtime, f.i, f.receipt);
  const token = f.fields['xcsh_token.node_c'];
  if (!token) throw new Error('missing token fixture');
  token.creation_identity_sha256 = fingerprint('replacement');
  await expect(verifyPublicTerraformLiveOwnership(f.runtime, f.i, owned)).rejects.toThrow('XC identity');
  for (const key of Object.keys(f.fields)) f.fields[key] = null;
  f.live.clear();
  expect(await verifyPublicTerraformLiveOwnership(f.runtime, f.i, owned)).toHaveLength(15);
});
it('rejects site identity drift between node-bound token observations', async () => {
  const f = fixture();
  const observe = f.runtime.observePlatform;
  f.runtime.observePlatform = async (site, token, signal) => {
    const row = await observe(site, token, signal);
    return token === 'node-b-token' ? { ...row, siteIdentitySha256: fingerprint('replacement-site') } : row;
  };
  await expect(inspectPublicTerraformOwnership(f.runtime, f.i, f.receipt)).rejects.toThrow('changed during');
});

it('owns the guide-required HA SLO ICMP rule with its exact network and peer CIDR', async () => {
  const f = fixture();
  const { translateGcpPublicTerraformSiteCompute } = await import('../../src/ce/compute-plan');
  const configuration = translateGcpPublicTerraformSiteCompute(f.i, {
    terraform: '1.16.6',
    google: '8.7.0',
    xcsh: '15.13.0',
  }).configuration;
  const rules = (configuration.resource as unknown as { google_compute_firewall: Record<string, unknown> })
    .google_compute_firewall;
  expect(Object.values(rules)).toEqual([
    {
      name: `${f.i.sites[0].name}-ha-slo-icmp`,
      project: f.i.project,
      network: `\${google_compute_network.${f.i.sites[0].nodes[0].interfaces[0].network.replaceAll('-', '_')}.self_link}`,
      direction: 'INGRESS',
      source_ranges: [f.i.sites[0].nodes[0].interfaces[0].cidr],
      target_tags: [`${f.i.sites[0].name}-ha-peer`],
      allow: [{ protocol: 'icmp' }],
    },
  ]);
  for (const instance of Object.values(configuration.resource.google_compute_instance) as Array<{ tags: string[] }>)
    expect(instance.tags).toContain(`${f.i.sites[0].name}-ha-peer`);
  expect(publicTerraformCloudScope(f.i).filter((r) => r.kind === 'firewall')).toHaveLength(1);
});

it('rejects changed HA ICMP peer scope and a replaced owning firewall', async () => {
  const f = fixture();
  const address = `google_compute_firewall.${f.i.sites[0].name.replaceAll('-', '_')}_ha_slo_icmp`;
  const original = structuredClone(f.fields[address]);
  f.fields[address].source_ranges = ['0.0.0.0/0'];
  await expect(inspectPublicTerraformOwnership(f.runtime, f.i, f.receipt)).rejects.toThrow('firewall');
  f.fields[address] = original;
  f.fields[address].firewall_id = '999';
  await expect(inspectPublicTerraformOwnership(f.runtime, f.i, f.receipt)).rejects.toThrow('Replacement');
});
