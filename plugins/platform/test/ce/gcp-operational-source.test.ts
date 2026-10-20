import { expect, it } from 'bun:test';
import { fingerprint } from '../../../gcloud/src/ce/discovery';
import { operationalFixture } from '../../../gcloud/test/ce/operational-health.test';
import { createGcpOperationalSource } from '../../src/ce/gcp-operational-source';

it('uses fixed uncached service reads and isolates transport failures without previous response reuse', async () => {
  const f = operationalFixture();
  const captures: Array<{ body: string; command: string[] }> = [];
  const paths: string[] = [];
  const identities = f.binding.nodes.map((node) => ({
    nodeName: node.nodeName,
    instanceId: node.instanceId,
    zone: 'zone-a',
    sloAddress: `10.0.0.${node.instanceId}`,
    devices: ['ens4', 'ens5'] as [string, string],
    addresses: ['10.0.0.1', '10.1.0.1'] as [string, string],
  }));
  let fail = false;
  const source = createGcpOperationalSource(
    f.binding,
    identities,
    f.profile,
    fingerprint(f.profile),
    'https://console.example.test',
    'private',
    {
      binding: async () => f.binding,
      capture: async (entry) => {
        captures.push(entry);
      },
      captureProjection: async () => {},
    },
    (async (url: Parameters<typeof fetch>[0]) => {
      const path = new URL(String(url)).pathname;
      paths.push(String(url));
      if (fail) throw new Error('Transport unavailable');
      if (path.endsWith('registrations_by_site/site-a'))
        return Response.json({
          items: f.binding.nodes.map((node) => ({
            uid: node.nodeName,
            get_spec: {
              infra: {
                hostname: node.nodeName,
                instance_id: node.instanceId,
                provider: 'GOOGLE',
                availability_zone: 'zone-a',
              },
              passport: { cluster_name: 'site-a' },
            },
            object: { status: { current_state: 'ONLINE' } },
          })),
        });
      if (path.endsWith('/ves-system/status'))
        return Response.json({
          status: f.binding.nodes.flatMap((node) =>
            f.profile.roles.control.components.map((name) => ({ node: node.nodeName, name, status: 'Ready' })),
          ),
        });
      if (path.endsWith('/list-service'))
        return Response.json({
          service: f.binding.nodes.flatMap((node) =>
            f.profile.inventoryServices.map((service) => ({ node: node.nodeName, value: service, name: 'reference' })),
          ),
        });
      return new Response('PRIVATE malformed', { status: 503 });
    }) as unknown as typeof fetch,
  );
  const first = await source.collect();
  expect(first.nodes.every((node) => node.components.available && node.inventory.available)).toBe(true);
  expect(first.nodes.every((node) => !node.runtime.available && !node.siteStatus.available)).toBe(true);
  expect(
    paths.filter((path) => path.includes('/ves-system/status')).every((path) => path.endsWith('?cached=false')),
  ).toBe(true);
  expect(captures.some((entry) => entry.body === 'PRIVATE malformed')).toBe(true);
  fail = true;
  const second = await source.collect();
  expect(second.nodes.every((node) => !node.components.available && !node.inventory.available)).toBe(true);
  expect(second.nodes.every((node) => node.components.projection === undefined)).toBe(true);
});
it('rejects foreign source identities before issuing requests', () => {
  const f = operationalFixture();
  expect(() =>
    createGcpOperationalSource(
      f.binding,
      [],
      f.profile,
      fingerprint(f.profile),
      'https://console.example.test',
      'private',
      { binding: async () => f.binding, capture: async () => {}, captureProjection: async () => {} },
    ),
  ).toThrow('Original operational source identities required');
});
