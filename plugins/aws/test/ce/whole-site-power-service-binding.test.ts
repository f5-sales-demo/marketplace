import { expect, test } from 'bun:test';
import { canonicalSha256 } from '../../src/ce/canonical';
import type { AwsPowerBindings } from '../../src/ce/whole-site-power';
import {
  powerServiceComponentSha256,
  validatePowerServiceInventory,
} from '../../src/ce/whole-site-power-service-binding';
import { collectAwsPowerServiceInventory } from '../../src/ce/whole-site-power-service-inventory';
import { bgpPowerFixture } from './whole-site-power-bgp-fixtures';

async function fixture() {
  const f = bgpPowerFixture();
  const observation = await collectAwsPowerServiceInventory(f.base, f.values, f.api, f.runtime);
  const bindings = {
    servicesSha256: observation.servicesSha256,
    servicesInventory: observation.services,
  } as AwsPowerBindings;
  return { ...f, observation, bindings };
}
test('component binding selects exact BGP identity from complete inventory', async () => {
  const f = await fixture();
  validatePowerServiceInventory(f.base, f.bindings);
  expect(powerServiceComponentSha256(f.base, f.bindings, 'bgp')).toBe(f.observation.components[0].servicesSha256);
  expect(powerServiceComponentSha256(f.base, f.bindings, 'bgp')).not.toBe(f.bindings.servicesSha256);
  expect(() => powerServiceComponentSha256(f.base, f.bindings, 'nlb')).toThrow();
});
for (const mutation of [
  'owner',
  'engine',
  'component-digest',
  'inventory-digest',
  'duplicate',
  'missing',
  'foreign-kind',
] as const)
  test(`component binding rejects ${mutation} inventory`, async () => {
    const f = await fixture();
    const inventory = f.bindings.servicesInventory;
    if (!inventory) throw Error('Fixture inventory missing');
    if (mutation === 'owner') inventory.sourcePlanSha256 = 'a'.repeat(64);
    if (mutation === 'engine') inventory.engine = 'terraform';
    if (mutation === 'component-digest') inventory.components[0].servicesSha256 = 'a'.repeat(64);
    if (mutation === 'duplicate') inventory.components.push(structuredClone(inventory.components[0]));
    if (mutation === 'missing') inventory.components = [];
    if (mutation === 'foreign-kind') inventory.components[0].kind = 'nlb';
    if (mutation !== 'inventory-digest') f.bindings.servicesSha256 = canonicalSha256(inventory);
    else f.bindings.servicesSha256 = 'a'.repeat(64);
    expect(() => validatePowerServiceInventory(f.base, f.bindings)).toThrow();
  });
test('combined routing and ingress cannot consume a single component digest', async () => {
  const f = await fixture();
  f.base.intent.ingress = { mode: 'nlb' } as NonNullable<typeof f.base.intent.ingress>;
  delete f.bindings.servicesInventory;
  expect(() => validatePowerServiceInventory(f.base, f.bindings)).toThrow();
});
