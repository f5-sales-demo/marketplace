import { expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { fingerprint } from '../../../gcloud/src/ce/discovery';
import {
  correlateGcpPhysicalInterfaces,
  type GcpExpectedNodeIdentity,
} from '../../../gcloud/src/ce/interface-identity';
import { operationalFixture } from '../../../gcloud/test/ce/operational-health.test';
import { verifyGcpOperationalBinding } from '../../src/ce/gcp-operational-binding';

function fixture() {
  const f = operationalFixture();
  const hash = (uid: string) => `sha256:${createHash('sha256').update(uid).digest('hex')}`;
  const cloudIdentities: GcpExpectedNodeIdentity[] = f.binding.nodes.map((node) => ({
    project: 'test-project',
    zone: 'zone-a',
    instanceId: node.instanceId,
    nodeName: node.nodeName,
    siteName: 'site-a',
    nics: [
      { index: 0, network: 'outside', subnet: 'outside', role: 'slo', vrf: 'outside' },
      { index: 1, network: 'inside', subnet: 'inside', role: 'sli', vrf: 'inside' },
    ],
  }));
  const identities = f.binding.nodes.map((node) => ({
    nodeName: node.nodeName,
    instanceId: node.instanceId,
    zone: 'zone-a',
    sloAddress: `10.0.0.${node.instanceId}`,
    devices: ['ens4', 'ens5'] as [string, string],
    addresses: [`10.0.0.${node.instanceId}`, `10.1.0.${node.instanceId}`] as [string, string],
  }));
  const nodeList = f.binding.nodes.map((node, i) => ({
    hostname: node.nodeName,
    interface_list: identities[i].devices.map((device, j) => ({
      ethernet_interface: { device, mac: `02:00:00:00:0${i}:0${j}` },
      is_primary: j === 0,
      network_option: j === 0 ? { site_local_network: {} } : { site_local_inside_network: {} },
    })),
  }));
  const configuration = {
    metadata: { name: 'site-a', namespace: 'system' },
    system_metadata: { uid: 'configuration' },
    spec: { gcp: { not_managed: { node_list: nodeList } } },
  };
  const runtime = { metadata: { name: 'site-a' }, system_metadata: { uid: 'runtime' } };
  const registrations = f.binding.nodes.map((node, i) => ({
    uid: `registration-${i}`,
    get_spec: {
      infra: {
        provider: 'GOOGLE',
        instance_id: node.instanceId,
        hostname: node.nodeName,
        availability_zone: 'zone-a',
        hw_info: {
          network: identities[i].devices.map((name, j) => ({
            name,
            mac_address: nodeList[i].interface_list[j].ethernet_interface.mac,
            ip_address: [identities[i].addresses[j]],
          })),
        },
      },
      passport: { cluster_name: 'site-a' },
    },
    object: { status: { current_state: 'ONLINE' } },
  }));
  const clouds = f.binding.nodes.map((node, i) => ({
    id: node.instanceId,
    name: node.nodeName,
    zone: 'https://www.googleapis.com/compute/v1/projects/test-project/zones/zone-a',
    networkInterfaces: identities[i].addresses.map((networkIP, j) => ({
      name: `nic${j}`,
      network: j === 0 ? 'outside' : 'inside',
      subnetwork: j === 0 ? 'outside' : 'inside',
      networkIP,
    })),
  }));
  const tokens = f.binding.nodes.map((node, i) => ({
    metadata: { name: `${node.nodeName}-token`, namespace: 'system', labels: { 'xcsh-node': node.nodeName } },
    system_metadata: { uid: `token-${i}` },
    spec: { site_name: 'site-a' },
  }));
  f.binding.configurationIdentitySha256 = hash('configuration');
  f.binding.runtimeIdentitySha256 = fingerprint({ uid: 'runtime' });
  for (const [i, node] of f.binding.nodes.entries()) {
    node.registrationIdentitySha256 = fingerprint({ uid: registrations[i].uid });
    node.tokenIdentitySha256 = hash(tokens[i].system_metadata.uid);
    node.nics = correlateGcpPhysicalInterfaces(cloudIdentities[i], clouds[i], registrations[i], configuration).map(
      (join, j) =>
        fingerprint({
          join,
          address: identities[i].addresses[j],
          network: clouds[i].networkInterfaces[j].network,
          subnet: clouds[i].networkInterfaces[j].subnetwork,
        }),
    ) as [string, string];
  }
  const persisted = {
    contextFingerprint: f.binding.contextFingerprint,
    ownershipFingerprint: f.binding.ownershipFingerprint,
  };
  const port = {
    persisted: async () => persisted,
    configuration: async () => configuration,
    runtimeSite: async () => runtime,
    registrations: async () => ({ items: registrations }),
    cloud: async (name: string) => clouds[f.binding.nodes.findIndex((n) => n.nodeName === name)],
    token: async (name: string) => tokens[f.binding.nodes.findIndex((n) => n.nodeName === name)],
  };
  return { ...f, port, cloudIdentities, identities, registrations, clouds, tokens, persisted };
}
it('binds original numeric nodes, tokens and both physical joins without erasing offline evidence', async () => {
  const f = fixture();
  f.registrations[0].object.status.current_state = 'OFFLINE';
  expect(await verifyGcpOperationalBinding(f.port, f.binding, f.cloudIdentities, f.identities)).toEqual(f.binding);
  expect(f.registrations[0].object.status.current_state).toBe('OFFLINE');
});
it('rejects replacements, token drift, foreign registrations and source address drift', async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => {
      f.clouds[0].id = '999';
    },
    (f: ReturnType<typeof fixture>) => {
      f.tokens[0].system_metadata.uid = 'replacement';
    },
    (f: ReturnType<typeof fixture>) => {
      f.registrations[0].get_spec.infra.hostname = 'foreign';
    },
    (f: ReturnType<typeof fixture>) => {
      f.identities[0].addresses[1] = '10.9.0.1';
    },
    (f: ReturnType<typeof fixture>) => {
      f.persisted.ownershipFingerprint = fingerprint({ foreign: true });
    },
  ]) {
    const f = fixture();
    mutate(f);
    await expect(verifyGcpOperationalBinding(f.port, f.binding, f.cloudIdentities, f.identities)).rejects.toThrow();
  }
});
