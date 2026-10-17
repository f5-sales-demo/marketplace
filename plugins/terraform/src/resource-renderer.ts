import { terraformLiteral } from './literal';

type Json = Record<string, unknown>;
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Provider resource schema is malformed');
  return value as Json;
}
function literal(value: unknown): unknown {
  if (typeof value === 'string') return terraformLiteral(value);
  if (Array.isArray(value)) return value.map(literal);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, literal(item)]));
  return value;
}

/** Translate a validated F5 request using the exact installed provider schema, never guessed block shapes. */
export function renderProviderResource(request: Json, resourceSchema: unknown): Json {
  const metadata = object(request.metadata),
    spec = object(request.spec);
  const convert = (values: Json, schema: Json): Json => {
    const attributes = schema.attributes === undefined ? {} : object(schema.attributes);
    const blocks = schema.block_types === undefined ? {} : object(schema.block_types);
    const result: Json = {};
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) throw new Error(`Unresolved provider input: ${key}`);
      if (value === null) {
        if (!attributes[key] || object(attributes[key]).required === true)
          throw new Error(`Required provider input is null: ${key}`);
        result[key] = null;
        continue;
      }
      if (attributes[key]) {
        const attribute = object(attributes[key]);
        if (attribute.computed === true && attribute.optional !== true && attribute.required !== true)
          throw new Error(`Read-only provider input: ${key}`);
        const nested = attribute.nested_type === undefined ? undefined : object(attribute.nested_type);
        if (!nested) result[key] = literal(value);
        else if (nested.nesting_mode === 'single') result[key] = convert(object(value), nested);
        else if (nested.nesting_mode === 'list' || nested.nesting_mode === 'set') {
          if (!Array.isArray(value)) throw new Error(`Provider input must be a collection: ${key}`);
          result[key] = value.map((row) => convert(object(row), nested));
        } else if (nested.nesting_mode === 'map')
          result[key] = Object.fromEntries(
            Object.entries(object(value)).map(([name, row]) => [name, convert(object(row), nested)]),
          );
        else throw new Error(`Unsupported provider nesting: ${key}`);
      } else if (blocks[key]) {
        const block = object(blocks[key]);
        const child = object(block.block);
        if (block.nesting_mode === 'single') result[key] = [convert(object(value), child)];
        else if (block.nesting_mode === 'list' || block.nesting_mode === 'set') {
          if (!Array.isArray(value)) throw new Error(`Provider block must be a collection: ${key}`);
          result[key] = value.map((row) => convert(object(row), child));
        } else throw new Error(`Unsupported provider block nesting: ${key}`);
      } else throw new Error(`Published provider does not expose request field: ${key}`);
    }
    return result;
  };
  return convert(
    {
      name: metadata.name,
      namespace: metadata.namespace,
      ...(metadata.labels ? { labels: metadata.labels } : {}),
      ...spec,
    },
    object(object(resourceSchema).block),
  );
}
