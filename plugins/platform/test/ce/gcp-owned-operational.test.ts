import { afterEach, expect, it } from 'bun:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fingerprint } from '../../../gcloud/src/ce/discovery';
import { correlateGcpPhysicalInterfaces } from '../../../gcloud/src/ce/interface-identity';
import { evaluateGcpOperationalHealth } from '../../../gcloud/src/ce/operational-health';
import { type GcpResourceIdentity, recordGcpResource } from '../../../gcloud/src/ce/ownership';
import { publicTerraformAddresses, publicTerraformCloudScope } from '../../../gcloud/src/ce/terraform-public-ownership';
import { intent } from '../../../gcloud/test/ce/fixtures';
import { CeDeploymentStore } from '../../src/ce/deployment-store';
import { collectGcpOwnedOperationalHealth } from '../../src/ce/gcp-owned-operational';
import { operationalBindingFixture } from './gcp-operational-binding.test';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture(initialize = false) {
  const f = operationalBindingFixture(),
    i = intent();
  i.engine = 'terraform';
  i.sites[0].name = f.binding.siteName;
  i.sites[0].nodes = f.binding.nodes.map((node, index) => ({
    ...i.sites[0].nodes[0],
    name: node.nodeName,
    zone: `northamerica-northeast1-${['a', 'b', 'c'][index]}`,
  }));
  const apiUrl = 'https://console.example.test',
    credential = 'private-credential';
  for (const [index, expected] of f.cloudIdentities.entries()) {
    expected.zone = i.sites[0].nodes[index].zone;
    f.identities[index].zone = expected.zone;
    f.registrations[index].get_spec.infra.availability_zone = expected.zone;
    f.clouds[index].zone = `https://www.googleapis.com/compute/v1/projects/${i.project}/zones/${expected.zone}`;
    for (const [nicIndex, nic] of expected.nics.entries()) {
      nic.network = `https://www.googleapis.com/compute/v1/projects/${i.project}/global/networks/${nicIndex ? 'inside' : 'outside'}`;
      nic.subnet = `https://www.googleapis.com/compute/v1/projects/${i.project}/regions/${i.region}/subnetworks/${nicIndex ? 'inside' : 'outside'}`;
      f.clouds[index].networkInterfaces[nicIndex].network = nic.network;
      f.clouds[index].networkInterfaces[nicIndex].subnetwork = nic.subnet;
    }
    const configuration = await f.port.configuration();
    f.binding.nodes[index].nics = correlateGcpPhysicalInterfaces(
      expected,
      f.clouds[index],
      f.registrations[index],
      configuration,
    ).map((join, nicIndex) =>
      fingerprint({
        join,
        address: f.identities[index].addresses[nicIndex],
        network: f.clouds[index].networkInterfaces[nicIndex].network,
        subnet: f.clouds[index].networkInterfaces[nicIndex].subnetwork,
      }),
    ) as [string, string];
  }
  const root = await realpath(await mkdtemp(join(tmpdir(), 'operational-owned-')));
  roots.push(root);
  const store = await CeDeploymentStore.open(root, {
    provider: 'gcp',
    engine: 'terraform',
    account: i.project,
    region: i.region,
    deploymentId: i.deploymentName,
  });
  await store.write('gcp-terraform-input-identity.json', {
    intent: i,
    intentFingerprint: fingerprint(i),
    platformContext: i.platformContext,
  });
  const resources: GcpResourceIdentity[] = publicTerraformCloudScope(i).map((resource, index) => ({
    ...resource,
    id:
      resource.kind === 'instance'
        ? f.binding.nodes.find((node) => node.nodeName === resource.nodeName)!.instanceId
        : String(index + 10),
    project: i.project,
    deploymentName: i.deploymentName,
    engine: 'terraform',
  }));
  for (const resource of resources) await recordGcpResource(store, resource);
  const owned = {
    schemaVersion: 2,
    complete: true,
    intentFingerprint: fingerprint(i),
    addresses: publicTerraformAddresses(i),
    resources,
    platform: {
      [`xcsh_securemesh_site_v2.${f.binding.siteName.replaceAll('-', '_')}`]: f.binding.configurationIdentitySha256,
      ...Object.fromEntries(
        f.binding.nodes.map((node) => [`xcsh_token.${node.nodeName.replaceAll('-', '_')}`, node.tokenIdentitySha256]),
      ),
    },
  };
  f.binding.ownershipFingerprint = fingerprint(owned);
  f.binding.contextFingerprint = fingerprint({ intentFingerprint: fingerprint(i), context: i.platformContext, apiUrl });
  if (initialize) {
    f.profile.roles.control.runtimeRole = 'k8s-master-primary';
    f.profile.placementCounts = Object.fromEntries(
      f.profile.roles.control.containers.map((mapping) => [mapping.service, 3]),
    );
  }
  const contractFingerprint = fingerprint(f.profile);
  await store.write('gcp-tf-public-ownership.json', owned);
  if (!initialize)
    await store.write('gcp-operational-original-binding.json', {
      contractFingerprint,
      binding: f.binding,
      identities: f.identities,
    });
  let runtimeRows: unknown[] = f.binding.nodes.map((node) => ({
    node_info: { hostname: node.nodeName, role: ['k8s-master-primary'] },
  }));
  let reads = 0;
  const fetcher = (async (url: Parameters<typeof fetch>[0], options?: RequestInit) => {
    reads++;
    const path = new URL(String(url)).pathname;
    if (path.includes('/securemesh_site_v2s/')) return Response.json(await f.port.configuration());
    if (path.includes('/tokens/')) {
      const name = path
        .split('/')
        .at(-1)!
        .replace(/-token$/, '');
      return Response.json(await f.port.token(name));
    }
    if (path.includes('/registrations_by_site/')) return Response.json(await f.port.registrations());
    if (path.endsWith('/sites/site-a'))
      return Response.json({
        ...(await f.port.runtimeSite()),
        status: runtimeRows,
      });
    if (path.endsWith('/exec-user') && JSON.parse(String(options?.body)).command[0] === 'crictl-ps-a') {
      const output =
        'CONTAINER IMAGE CREATED STATE NAME ATTEMPT POD ID POD NAMESPACE\n' +
        f.profile.roles.control.containers
          .map(
            (mapping, index) =>
              `${(index + 1).toString(16).padStart(12, '0')} image-hash 2 hours ago Running ${mapping.name} 0 123456abcdef ${mapping.podPrefix}abc12 ${mapping.namespace}`,
          )
          .join('\n');
      return Response.json({ output, return_code: 0 });
    }
    if (path.endsWith('/ves-system/status'))
      return Response.json({
        status: f.binding.nodes.flatMap((node) =>
          f.profile.roles.control.components.map((name) => ({
            node: node.nodeName,
            name,
            status: name === 'argo' ? 'Failed' : 'Ready',
          })),
        ),
      });
    if (path.endsWith('/list-service'))
      return Response.json({
        service: f.binding.nodes.flatMap((node) =>
          f.profile.inventoryServices.map((service) => ({ node: node.nodeName, value: service, name: 'reference' })),
        ),
      });
    return new Response('PRIVATE unavailable diagnostic', { status: 503 });
  }) as typeof fetch;
  let context = { url: apiUrl, credential };
  const collect = () =>
    collectGcpOwnedOperationalHealth(
      store,
      i,
      f.binding.siteName,
      f.profile,
      contractFingerprint,
      apiUrl,
      credential,
      f.port.cloud,
      async () => context,
      fetcher,
    );
  return {
    ...f,
    store,
    collect,
    reads: () => reads,
    changeRuntimeRows: (rows: unknown[]) => {
      runtimeRows = rows;
    },
    changeContext: () => {
      context = { ...context, credential: 'replacement' };
    },
  };
}
it('retains private failed inspections while returning independent component failures', async () => {
  const f = await fixture();
  const { binding, collection } = await f.collect();
  const result = evaluateGcpOperationalHealth(collection, binding, f.profile, fingerprint(f.profile));
  expect(result.status).toBe('unknown');
  expect(result.nodes.every((node) => node.knownFailures.length > 0)).toBe(true);
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
  expect(f.reads()).toBeGreaterThan(0);
});
it('rejects credential-context changes before network reads', async () => {
  const f = await fixture();
  f.changeContext();
  await expect(f.collect()).rejects.toThrow('context or ownership changed');
  expect(f.reads()).toBe(0);
});
it('rejects persisted contract drift without learning a replacement binding', async () => {
  const f = await fixture();
  await f.store.write('gcp-operational-original-binding.json', {
    contractFingerprint: fingerprint({ drift: true }),
    binding: f.binding,
  });
  await expect(f.collect()).rejects.toThrow('explicit requalification');
  expect(f.reads()).toBe(0);
});
it('establishes complete frozen placement once and keeps the original binding on later reads', async () => {
  const f = await fixture(true);
  const first = await f.collect();
  const persisted = await f.store.read('gcp-operational-original-binding.json');
  expect(first.binding.nodes.map((node) => node.role)).toEqual(['control', 'control', 'control']);
  expect((await f.collect()).binding).toEqual(first.binding);
  expect(await f.store.read('gcp-operational-original-binding.json')).toEqual(persisted);
});

it('establishes original placement with interleaved null global runtime rows', async () => {
  const f = await fixture(true);
  f.changeRuntimeRows(
    f.binding.nodes.flatMap((node) => [
      { node_info: null, metadata: { status_id: `${node.nodeName}_SiteStatusMgr` } },
      { node_info: { hostname: node.nodeName, role: ['k8s-master-primary'] } },
      { node_info: null },
      { metadata: { status_id: 'global' } },
    ]),
  );
  const first = await f.collect();
  const persisted = await f.store.read('gcp-operational-original-binding.json');
  expect(first.binding.nodes.map((node) => node.role)).toEqual(['control', 'control', 'control']);
  expect((await f.collect()).binding).toEqual(first.binding);
  expect(await f.store.read('gcp-operational-original-binding.json')).toEqual(persisted);
});
it.each(['foreign', 'duplicate', 'missing', 'malformed', 'malformed-row', 'ambiguous-role'])(
  'rejects %s runtime node placement without persisting a binding',
  async (change) => {
    const f = await fixture(true);
    const rows: unknown[] = f.binding.nodes.map((node) => ({
      node_info: { hostname: node.nodeName, role: ['k8s-master-primary'] },
    }));
    if (change === 'foreign') rows.push({ node_info: { hostname: 'foreign', role: ['k8s-master-primary'] } });
    if (change === 'duplicate') rows.push(rows[0]);
    if (change === 'missing') rows.shift();
    if (change === 'malformed') rows.push({ node_info: 'invalid' });
    if (change === 'malformed-row') rows.push(null);
    if (change === 'ambiguous-role')
      rows[0] = { node_info: { hostname: f.binding.nodes[0].nodeName, role: ['a', 'b'] } };
    f.changeRuntimeRows(rows);
    await expect(f.collect()).rejects.toThrow();
    await expect(f.store.read('gcp-operational-original-binding.json')).rejects.toThrow();
  },
);
