import { expect, test } from 'bun:test';
import {
  initialRegistrationLocators,
  parseInitialRegistrationRetirement,
} from '../../src/ce/initial-registration-retirement';
import type { SiteBinding } from '../../src/ce/runtime';
import { collectCePreRegistrationInventory } from '../../src/ce/teardown-inventory';

const binding: SiteBinding = {
  siteName: 'ce-owned',
  nodes: ['ce-owned-1'],
  owner: {
    deploymentId: 'ce-owned',
    engine: 'terraform',
    provider: 'aws',
    account: 'demo',
    region: 'us-east-2',
  },
};
const uid = '11111111-2222-4333-8444-555555555555';
const instances: Record<string, string> = { 'ce-owned-1': 'i-0123456789abcdef0' };
function fixture() {
  const passport = { cluster_name: binding.siteName, cluster_size: 1, original_field: 'retained' };
  const source = {
    object: {
      metadata: { name: `r-${uid}`, namespace: 'system' },
      system_metadata: { uid, creator_class: 'prism' },
      status: { current_state: 'PENDING', parent_current_state: 'WAITING_FOR_REGISTRATION' },
      spec: {
        gc_spec: {
          passport,
          infra: {
            hostname: binding.nodes[0],
            instance_id: instances[binding.nodes[0]],
            provider: 'AWS',
            zone: 'us-east-2',
          },
        },
      },
    },
  };
  const list = {
    items: [
      { name: `r-${uid}`, get_spec: { passport, infra: source.object.spec.gc_spec.infra }, object: source.object },
    ],
  };
  return { source, list };
}
test('retirement joins exact site list, original instance, per-object UID, publisher and initial state', () => {
  const f = fixture();
  const locators = initialRegistrationLocators(f.list, binding, instances);
  const result = parseInitialRegistrationRetirement(f.source, binding, locators[0]);
  expect(result).toMatchObject({
    siteName: binding.siteName,
    node: binding.nodes[0],
    uid,
    instanceId: instances[binding.nodes[0]],
  });
  expect(result.passportSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(result)).not.toContain('original_field');
});
for (const kind of [
  'foreign-instance',
  'foreign-site',
  'advanced',
  'foreign-publisher',
  'foreign-region',
  'wrong-uid',
  'partial',
  'duplicate',
] as const) {
  test(`initial retirement rejects ${kind}`, () => {
    const f = fixture();
    if (kind === 'foreign-instance') f.source.object.spec.gc_spec.infra.instance_id = 'i-aaaaaaaaaaaaaaaaa';
    if (kind === 'foreign-site') f.source.object.spec.gc_spec.passport.cluster_name = 'ce-foreign';
    if (kind === 'advanced') f.source.object.status.current_state = 'APPROVED';
    if (kind === 'foreign-publisher') f.source.object.system_metadata.creator_class = 'foreign';
    if (kind === 'foreign-region') f.source.object.spec.gc_spec.infra.zone = 'us-west-2';
    if (kind === 'wrong-uid') f.source.object.system_metadata.uid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    if (kind === 'duplicate') f.list.items.push(f.list.items[0]);
    const list = kind === 'partial' ? { ...f.list, next_page_token: 'more' } : f.list;
    expect(() => {
      const locators = initialRegistrationLocators(list, binding, instances);
      return parseInitialRegistrationRetirement(f.source, binding, locators[0]);
    }).toThrow();
  });
}
test('default inventory still rejects registration; extended inventory requires original cloud bindings and complete evidence', async () => {
  const f = fixture();
  const labels = {
    'xcsh-ce-deployment': binding.owner.deploymentId,
    'xcsh-ce-engine': binding.owner.engine,
    'xcsh-ce-provider': binding.owner.provider,
    'xcsh-ce-account': binding.owner.account,
    'xcsh-ce-region': binding.owner.region,
  };
  const port = {
    request: async (path: string) => {
      if (path.includes('registrations_by_site')) return f.list;
      if (path.includes('/registrations/')) return f.source;
      if (path.includes('/securemesh_site_v2s/'))
        return {
          metadata: { name: binding.siteName, namespace: 'system', labels },
          system_metadata: { uid: 'logical-uid' },
        };
      if (path.includes('/sites/'))
        return {
          metadata: { name: binding.siteName, namespace: 'system', labels },
          system_metadata: { uid: 'physical-uid', creator_class: 'akar' },
          spec: { site_type: 'CUSTOMER_EDGE', site_state: 'WAITING_FOR_REGISTRATION', main_nodes: [] },
        };
      return { items: [] };
    },
  };
  expect(
    await collectCePreRegistrationInventory(port, [binding], ['default'], { site: 'site', ingress: 'ingress' }),
  ).toHaveProperty('status', 'unknown');
  const result = await collectCePreRegistrationInventory(
    port,
    [binding],
    ['default'],
    { site: 'site', ingress: 'ingress' },
    undefined,
    instances,
  );
  expect(result).toMatchObject({
    status: 'observed',
    registrations: [{ uid, instanceId: instances[binding.nodes[0]] }],
  });
  f.source.object.system_metadata.creator_class = 'foreign';
  expect(
    await collectCePreRegistrationInventory(
      port,
      [binding],
      ['default'],
      { site: 'site', ingress: 'ingress' },
      undefined,
      instances,
    ),
  ).toHaveProperty('status', 'unknown');
});

test('initial registration accepts consistent public projections and rejects conflicting aliases', () => {
  const f = fixture();
  const locator = initialRegistrationLocators(f.list, binding, instances)[0];
  const consistent = {
    ...f.source,
    metadata: f.source.object.metadata,
    system_metadata: f.source.object.system_metadata,
    spec: f.source.object.spec.gc_spec,
  };
  expect(parseInitialRegistrationRetirement(consistent, binding, locator)).toHaveProperty('uid', uid);
  for (const conflict of [
    { ...consistent, metadata: { ...consistent.metadata, namespace: 'example-foreign-namespace' } },
    { ...consistent, system_metadata: { ...consistent.system_metadata, uid: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' } },
    { ...consistent, spec: { ...consistent.spec, passport: { ...consistent.spec.passport, cluster_size: 3 } } },
    { ...consistent, spec: { ...consistent.spec, infra: { ...consistent.spec.infra, instance_id: 'i-foreign' } } },
  ])
    expect(() => parseInitialRegistrationRetirement(conflict, binding, locator)).toThrow('Conflicting');
});
