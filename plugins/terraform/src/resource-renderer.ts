import { writableSiteLabels } from '../../platform/src/ce/site-labels';
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
export function renderProviderResource(request: Json, resourceSchema: unknown, resourceType?: string): Json {
  const metadata = object(request.metadata),
    spec = object(request.spec);
  const convert = (values: Json, schema: Json): Json => {
    const attributes = schema.attributes === undefined ? {} : object(schema.attributes);
    const blocks = schema.block_types === undefined ? {} : object(schema.block_types);
    const result: Json = {};
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) throw new Error(`Unresolved provider input: ${key}`);
      if (value === null) {
        if (blocks[key]) {
          if (Number(object(blocks[key]).min_items ?? 0) > 0)
            throw new Error(`Required provider input is null: ${key}`);
          // API readback includes null for unselected optional messages. Terraform
          // represents an absent block by omission, not a synthetic empty block.
          continue;
        }
        if (!attributes[key] || object(attributes[key]).required === true)
          throw new Error(`Required provider input is null: ${key}`);
        const attribute = object(attributes[key]);
        if (attribute.computed === true && attribute.optional !== true)
          throw new Error(`Read-only provider input: ${key}`);
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
      } else if (key === 'description' && value === '') {
      } else throw new Error(`Published provider does not expose request field: ${key}`);
    }
    return result;
  };
  const siteDiscovery = ['xcsh_securemesh_site_v2', 'xcsh_voltstack_site', 'xcsh_aws_tgw_site'].includes(
    resourceType ?? '',
  );
  const labels =
    metadata.labels === undefined
      ? undefined
      : siteDiscovery
        ? writableSiteLabels(object(metadata.labels))
        : Object.fromEntries(
            Object.entries(object(metadata.labels)).filter(
              ([key]) => !key.startsWith('ves.io/') && !key.startsWith('internal.ves.io/'),
            ),
          );
  return convert(
    {
      name: metadata.name,
      namespace: metadata.namespace,
      ...(labels ? { labels } : {}),
      ...spec,
    },
    object(object(resourceSchema).block),
  );
}
