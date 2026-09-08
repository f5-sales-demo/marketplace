import { expect, test } from 'bun:test';
import { buildSiteLocalHttpOrigin, type SiteLocalHttpOrigin } from '../../src/ce/wire-origin';
import { createWireValidator } from '../../src/ce/wire-schema';
import fixture from '../fixtures/site-local-origin-schema.json';

const validate = createWireValidator(fixture.schemas, fixture.provenance.root);
const input = {
  name: 'ce-origin',
  namespace: 'demo',
  originAddress: '192.0.2.10',
  port: 80,
  siteNames: ['site-one', 'site-two', 'site-three'],
};

test('binds outside-network origin endpoints to exact sites using the published schema', () => {
  const before = structuredClone(input);
  const result = buildSiteLocalHttpOrigin(input, validate);
  expect(input).toEqual(before);
  expect(result.metadata).toEqual({ name: 'ce-origin', namespace: 'demo' });
  expect(result.spec.endpoint_selection).toBe('LOCAL_PREFERRED');
  expect(result.spec.origin_servers).toEqual(
    input.siteNames.map((name) => ({
      labels: {},
      private_ip: { ip: '192.0.2.10', outside_network: {}, site_locator: { site: { name, namespace: 'system' } } },
    })),
  );
  expect(result.spec).toHaveProperty('no_tls', {});
  expect(result.evidence).toEqual({ origin: 'unknown', traffic: 'unknown' });
  expect(JSON.stringify(result.spec)).not.toContain('public_ip');
  input.siteNames[0] = 'different';
  expect(result.spec.origin_servers[0].private_ip.site_locator.site.name).toBe('site-one');
  input.siteNames[0] = 'site-one';
});

test('models a single site independently of its node count and accepts a routed private origin address', () => {
  const result = buildSiteLocalHttpOrigin({ ...input, originAddress: '10.20.0.10', siteNames: ['ha-site'] }, validate);
  expect(result.spec.origin_servers).toHaveLength(1);
  expect(result.spec.origin_servers[0].private_ip).toMatchObject({
    ip: '10.20.0.10',
    site_locator: { site: { name: 'ha-site' } },
  });
});

test('rejects unresolved addresses, duplicate sites, invalid ports, arbitrary defaults and mixed network intent', () => {
  for (const patch of [
    { originAddress: '__ORIGIN__' },
    { originAddress: 'origin.example.invalid' },
    { originAddress: '2001:db8::1' },
    { siteNames: [] },
    { siteNames: ['site-one', 'site-one'] },
    { siteNames: ['system/site-one'] },
    { siteNames: Array.from({ length: 33 }, (_, i) => `site-${i}`) },
    { port: 0 },
    { port: 65536 },
    { port: 80.5 },
    { port: '80' },
    { namespace: '../system' },
    { endpoint_selection: 'DISTRIBUTED' },
    { inside_network: {} },
  ])
    expect(() =>
      buildSiteLocalHttpOrigin({ ...input, ...patch } as unknown as SiteLocalHttpOrigin, validate),
    ).toThrow();
});
