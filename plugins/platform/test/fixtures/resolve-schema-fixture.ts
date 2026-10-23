import shared from './shared-schema-components.json';

type Json = Record<string, unknown>;
const prefix = './shared-schema-components.json#/';
/** Expand test-storage references before invoking the unchanged vendor-schema validators. */
export function resolveCeSchemaFixture<T>(value: T, components: Json = shared): T {
  function resolve(item: unknown, visiting = new Set<string>()): unknown {
    if (Array.isArray(item)) return item.map((value) => resolve(value, visiting));
    if (!item || typeof item !== 'object') return item;
    const object = item as Json;
    if (typeof object.$ref === 'string' && object.$ref.startsWith(prefix)) {
      const name = object.$ref.slice(prefix.length);
      if (!Object.hasOwn(components, name) || visiting.has(name)) throw Error('Missing or cyclic fixture definition');
      if (Object.keys(object).length !== 1) throw Error('Fixture reference cannot have sibling fields');
      const component = components[name];
      if (!component || typeof component !== 'object' || Array.isArray(component))
        throw Error('Fixture component must be an object');
      const next = new Set(visiting);
      next.add(name);
      return resolve(component, next);
    }
    return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, resolve(value, visiting)]));
  }
  return resolve(value) as T;
}
