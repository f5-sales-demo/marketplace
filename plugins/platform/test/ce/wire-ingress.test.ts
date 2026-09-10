import { expect, test } from 'bun:test';
import { buildInsideHttpListener, projectInsideHttpListener } from '../../src/ce/wire-ingress';
import { createWireValidator } from '../../src/ce/wire-schema';
import observed from '../fixtures/inside-listener-response.json';
import fixture from '../fixtures/inside-listener-schema.json';

const validate = createWireValidator(fixture.schemas, fixture.provenance.root);
const input = {
  name: 'ce-listener',
  namespace: 'demo',
  domain: 'ce.example.invalid',
  port: 80,
  originPool: { name: 'ce-origin', namespace: 'demo' },
  sites: [1, 2, 3].map((i) => ({ name: `ce-site-${i}`, insideAddress: `10.20.${i}.10` })),
};

test('projects the current API response without treating runtime state or documented defaults as drift', () => {
  const projected = projectInsideHttpListener(observed.spec, fixture.schemas, validate);
  expect(projected).not.toHaveProperty('state');
  expect(projected).not.toHaveProperty('auto_cert_info');
  expect(projected).not.toHaveProperty('cert_state');
  expect(projected).not.toHaveProperty('service_policies_from_namespace');
  expect(
    (projected.advertise_custom as typeof observed.spec.advertise_custom).advertise_where[0].site.site,
  ).not.toHaveProperty('tenant');
  expect(projected.l7_ddos_protection).toEqual({});
  for (const spec of [
    { ...observed.spec, advertise_on_public_default_vip: {} },
    { ...observed.spec, active_service_policies: {} },
    { ...observed.spec, unknown_behavior: {} },
    { ...observed.spec, waf_exclusion_rules: [{}] },
    { ...observed.spec, internet_vip_info: [{}] },
  ])
    expect(() => projectInsideHttpListener(spec, fixture.schemas, validate)).toThrow();
});

test('maps exact inside placements and an existing origin pool against the published schema', () => {
  const before = structuredClone(input);
  const result = buildInsideHttpListener(input, validate);
  expect(input).toEqual(before);
  expect(result.metadata).toEqual({ name: input.name, namespace: input.namespace });
  expect(result.spec.http).toEqual({ port: 80 });
  expect(result.spec.advertise_custom.advertise_where).toEqual(
    input.sites.map((site) => ({
      site: { site: { name: site.name, namespace: 'system' }, network: 'SITE_NETWORK_INSIDE' },
      use_default_port: {},
    })),
  );
  expect(JSON.stringify(result.spec.advertise_custom)).not.toContain('10.20.');
  expect(result.spec.default_route_pools).toEqual([{ pool: input.originPool, weight: 1, priority: 1 }]);
  expect(result.evidence).toEqual({ listener: 'unknown', routes: 'unknown', traffic: 'unknown' });
});

test('rejects ambiguous placements, malformed identities and unresolved inputs', () => {
  for (const patch of [
    { sites: [] },
    { sites: [input.sites[0], input.sites[0]] },
    { sites: [input.sites[0], { ...input.sites[1], insideAddress: input.sites[0].insideAddress }] },
    { sites: [{ name: '__UNRESOLVED__', insideAddress: '10.20.1.10' }] },
    // biome-ignore lint/suspicious/noTemplateCurlyInString: exercise rejection of an unresolved Terraform expression.
    { sites: [{ name: 'ce-site', insideAddress: '${address}' }] },
    { sites: [{ name: 'ce-site', insideAddress: '::1' }] },
    { port: 0 },
    { port: 65536 },
    { port: 80.5 },
    { domain: '*.example.invalid' },
    { domain: 'https://ce.example.invalid' },
    { namespace: 'example.invalid' },
    { name: 'bad-' },
    { originPool: { name: 'ce-origin', namespace: '' } },
  ])
    expect(() => buildInsideHttpListener({ ...input, ...patch }, validate)).toThrow();
});

test('requires schema validation and rejects invented advertisement switches', () => {
  expect(() =>
    buildInsideHttpListener(input, () => {
      throw new Error('unverified contract');
    }),
  ).toThrow('unverified');
  const { spec } = buildInsideHttpListener(input, validate);
  expect(() => validate({ ...spec, disable_route_advertisement: false })).toThrow('verified schema');
  expect(() => validate({ ...spec, advertise_on_public_default_vip: {} })).toThrow('verified schema');
});
