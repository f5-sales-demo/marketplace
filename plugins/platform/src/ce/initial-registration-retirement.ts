import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { SiteBinding } from './runtime';

type Json = Record<string, unknown>;
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Malformed initial registration retirement evidence');
  return value as Json;
};
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

export interface InitialRegistrationRetirement {
  siteName: string;
  node: string;
  name: string;
  uid: string;
  instanceId: string;
  passportSha256: string;
}

export function validateInitialRegistrationRetirement(binding: SiteBinding, value: InitialRegistrationRetirement) {
  if (
    binding.nodes.length !== 1 ||
    value.siteName !== binding.siteName ||
    value.node !== binding.nodes[0] ||
    !uuid.test(value.uid) ||
    value.name !== `r-${value.uid}` ||
    typeof value.instanceId !== 'string' ||
    !value.instanceId.trim() ||
    !/^[a-f0-9]{64}$/.test(value.passportSha256) ||
    Object.keys(value).sort().join(',') !== 'instanceId,name,node,passportSha256,siteName,uid'
  )
    throw new Error('Initial registration retirement identity differs');
}

/** Complete site list and exact provider instance binding are both mandatory. */
export function initialRegistrationLocators(
  response: unknown,
  binding: SiteBinding,
  instances: Record<string, string>,
): Array<Omit<InitialRegistrationRetirement, 'passportSha256'>> {
  const collection = object(response);
  if (
    !Array.isArray(collection.items) ||
    collection.items.length > 1 ||
    Object.keys(collection).some((key) => !['items', 'errors'].includes(key)) ||
    (collection.errors !== undefined && (!Array.isArray(collection.errors) || collection.errors.length)) ||
    binding.nodes.length !== 1 ||
    Object.keys(instances).length !== 1 ||
    typeof instances[binding.nodes[0]] !== 'string' ||
    !instances[binding.nodes[0]]
  )
    throw new Error('Initial registration list or original cloud binding is incomplete');
  return collection.items.map((value) => {
    const item = object(value),
      spec = object(item.get_spec),
      infra = object(spec.infra);
    const passport = object(spec.passport),
      registered = object(item.object);
    const system = object(registered.system_metadata),
      status = object(registered.status);
    const uid = system.uid;
    if (
      typeof uid !== 'string' ||
      !uuid.test(uid) ||
      item.name !== `r-${uid}` ||
      status.current_state !== 'PENDING' ||
      passport.cluster_name !== binding.siteName ||
      passport.cluster_size !== 1 ||
      infra.hostname !== binding.nodes[0] ||
      infra.instance_id !== instances[binding.nodes[0]]
    )
      throw new Error('Registration is not the original owned initial PENDING request');
    return {
      siteName: binding.siteName,
      node: binding.nodes[0],
      name: String(item.name),
      uid,
      instanceId: instances[binding.nodes[0]],
    };
  });
}

/** Per-object GET must retain the same identity, initial state, publisher and passport. */
export function parseInitialRegistrationRetirement(
  response: unknown,
  binding: SiteBinding,
  locator: Omit<InitialRegistrationRetirement, 'passportSha256'>,
): InitialRegistrationRetirement {
  const envelope = object(response),
    registered = object(envelope.object);
  const metadata = object(registered.metadata),
    system = object(registered.system_metadata);
  const status = object(registered.status),
    specification = object(object(registered.spec).gc_spec);
  const passport = object(specification.passport),
    infra = object(specification.infra);
  if (
    metadata.name !== locator.name ||
    metadata.namespace !== 'system' ||
    system.uid !== locator.uid ||
    system.creator_class !== 'prism' ||
    status.current_state !== 'PENDING' ||
    status.parent_current_state !== 'WAITING_FOR_REGISTRATION' ||
    passport.cluster_name !== binding.siteName ||
    passport.cluster_size !== 1 ||
    infra.hostname !== locator.node ||
    infra.instance_id !== locator.instanceId ||
    infra.provider !== binding.owner.provider.toUpperCase() ||
    (binding.owner.provider === 'aws' && infra.zone !== binding.owner.region)
  )
    throw new Error('Initial pending registration identity, publisher or state differs');
  for (const [key, expected] of [
    ['metadata', { name: locator.name, namespace: 'system' }],
    ['system_metadata', { uid: locator.uid }],
  ] as const) {
    if (envelope[key] !== undefined && envelope[key] !== null) {
      const alias = object(envelope[key]);
      for (const [field, value] of Object.entries(expected))
        if (alias[field] !== undefined && alias[field] !== '' && alias[field] !== value)
          throw new Error('Conflicting initial registration identity aliases');
    }
  }
  if (envelope.spec !== undefined && envelope.spec !== null) {
    const alias = object(envelope.spec);
    if (
      (alias.passport !== undefined && !isDeepStrictEqual(alias.passport, passport)) ||
      (alias.infra !== undefined && !isDeepStrictEqual(alias.infra, infra))
    )
      throw new Error('Conflicting initial registration passport or infra aliases');
  }
  const result = { ...locator, passportSha256: createHash('sha256').update(JSON.stringify(passport)).digest('hex') };
  validateInitialRegistrationRetirement(binding, result);
  return result;
}
