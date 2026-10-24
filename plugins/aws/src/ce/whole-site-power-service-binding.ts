import { canonicalSha256 } from './canonical';
import type { AwsCePlan } from './types';
import type { AwsPowerBindings } from './whole-site-power';

export type AwsPowerServiceKind = 'direct' | 'static-tgw' | 'bgp' | 'nlb';
export interface AwsPowerServiceInventory {
  schemaVersion: 1;
  kind: 'aws-ce-whole-site-services';
  sourcePlanSha256: string;
  engine: 'native' | 'terraform';
  components: Array<{ kind: AwsPowerServiceKind; services: unknown; servicesSha256: string }>;
}
function requested(base: AwsCePlan): AwsPowerServiceKind[] {
  const kinds: AwsPowerServiceKind[] = [];
  const profile = base.intent.routing.profile;
  if (profile === 'direct-eni') kinds.push('direct');
  else if (profile === 'tgw-static') kinds.push('static-tgw');
  else if (profile === 'tgw-connect') kinds.push('bgp');
  else if (profile !== 'nlb-ingress') throw Error('Whole-site service profile is unsupported');
  if (base.intent.ingress?.mode === 'nlb') kinds.push('nlb');
  if (!kinds.length) throw Error('Whole-site service components are missing');
  return kinds;
}
/** Complete immutable configuration identity, independent of current membership. */
export function validatePowerServiceInventory(base: AwsCePlan, bindings: AwsPowerBindings): void {
  const expected = requested(base);
  const inventory = bindings.servicesInventory;
  if (!inventory) {
    if (expected.length !== 1) throw Error('Combined whole-site services require complete inventory binding');
    return;
  }
  if (
    inventory.schemaVersion !== 1 ||
    inventory.kind !== 'aws-ce-whole-site-services' ||
    inventory.sourcePlanSha256 !== base.planSha256 ||
    inventory.engine !== base.engine ||
    canonicalSha256(inventory) !== bindings.servicesSha256 ||
    !Array.isArray(inventory.components) ||
    inventory.components.length !== expected.length
  )
    throw Error('Whole-site complete service inventory differs');
  for (const [index, kind] of expected.entries()) {
    const row = inventory.components[index];
    if (
      !row ||
      row.kind !== kind ||
      !/^[a-f0-9]{64}$/.test(row.servicesSha256) ||
      canonicalSha256(row.services) !== row.servicesSha256
    )
      throw Error('Whole-site component identity differs');
  }
}
/** The whole plan still binds every service; a controller may select only its exact component. */
export function powerServiceComponentSha256(
  base: AwsCePlan,
  bindings: AwsPowerBindings,
  kind: AwsPowerServiceKind,
): string {
  validatePowerServiceInventory(base, bindings);
  if (!requested(base).includes(kind)) throw Error('Whole-site component is not requested');
  if (!bindings.servicesInventory) return bindings.servicesSha256;
  const row = bindings.servicesInventory.components.find((item) => item.kind === kind);
  if (!row) throw Error('Whole-site component binding missing');
  return row.servicesSha256;
}
