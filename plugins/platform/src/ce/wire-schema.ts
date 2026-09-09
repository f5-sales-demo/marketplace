import { isIP } from 'node:net';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

type Json = Record<string, unknown>;
const keywords = new Set([
  'type',
  'enum',
  'const',
  'required',
  'minLength',
  'maxLength',
  'pattern',
  'minimum',
  'maximum',
  'multipleOf',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minProperties',
  'maxProperties',
  'format',
  'nullable',
]);
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('SMSv2 schema is malformed');
  return value as Json;
}

/** Convert the verified OpenAPI request schema, preserving constraints and F5 oneof groups. */
export function requestSchema(schemas: Json, root: string): Json {
  const definitions: Json = {};
  const referenced = new Set<string>();
  function convert(value: unknown): Json | boolean {
    if (typeof value === 'boolean') return value;
    const source = object(value);
    if (source.readOnly === true) return false;
    const result: Json = {};
    for (const [key, item] of Object.entries(source)) {
      if (keywords.has(key)) result[key] = item;
      if (key === '$ref') {
        if (typeof item !== 'string' || !item.startsWith('#/components/schemas/'))
          throw new Error('Unsupported SMSv2 schema reference');
        const name = item.slice('#/components/schemas/'.length);
        if (!Object.hasOwn(schemas, name)) throw new Error('Missing SMSv2 schema reference');
        referenced.add(name);
        result.$ref = `#/definitions/${name}`;
      }
      if (key === 'properties') {
        result.properties = Object.fromEntries(
          Object.entries(object(item)).map(([name, schema]) => [name, convert(schema)]),
        );
        result.additionalProperties =
          source.additionalProperties === undefined ? false : convert(source.additionalProperties);
      }
      if (key === 'additionalProperties') result.additionalProperties = convert(item);
      if (key === 'items' || key === 'not') result[key] = convert(item);
      if (['allOf', 'anyOf', 'oneOf'].includes(key)) {
        if (!Array.isArray(item)) throw new Error('Malformed SMSv2 schema composition');
        result[key] = item.map(convert);
      }
      if (key === 'exclusiveMinimum' || key === 'exclusiveMaximum') {
        if (typeof item === 'number') result[key] = item;
        else if (item === true) result[key] = source[key === 'exclusiveMinimum' ? 'minimum' : 'maximum'];
      }
    }
    const exclusions: Json[] = [];
    for (const [key, item] of Object.entries(source)) {
      if (!key.startsWith('x-ves-oneof-field-')) continue;
      let names: unknown;
      try {
        names = typeof item === 'string' ? JSON.parse(item) : item;
      } catch {
        throw new Error('Malformed SMSv2 oneof group');
      }
      if (!Array.isArray(names) || names.some((name) => typeof name !== 'string'))
        throw new Error('Malformed SMSv2 oneof group');
      for (let i = 0; i < names.length; i++)
        for (let j = i + 1; j < names.length; j++) exclusions.push({ not: { required: [names[i], names[j]] } });
    }
    if (exclusions.length) result.allOf = [...((result.allOf as Json[]) ?? []), ...exclusions];
    return result;
  }
  if (!Object.hasOwn(schemas, root)) throw new Error('Missing SMSv2 create schema');
  referenced.add(root);
  for (const name of referenced) definitions[name] = convert(schemas[name]);
  return { $ref: `#/definitions/${root}`, definitions };
}

/** Schema validity is separate from image support and collected runtime evidence. */
export function createWireValidator(
  schemas: Json,
  root = 'viewssecuremesh_site_v2CreateSpecType',
): (spec: unknown) => void {
  const ajv = new Ajv({
    strict: false,
    allErrors: false,
    coerceTypes: false,
    useDefaults: false,
    removeAdditional: false,
  });
  addFormats(ajv);
  ajv.addFormat('cidr', {
    type: 'string',
    validate: (value: string) => {
      const [address, length, extra] = value.split('/');
      const family = isIP(address);
      if (!family || extra !== undefined || !/^\d+$/.test(length ?? '')) return false;
      const bits = Number(length);
      return bits >= 0 && bits <= (family === 4 ? 32 : 128);
    },
  });
  const validate = ajv.compile(requestSchema(schemas, root));
  return (spec: unknown) => {
    if (!validate(spec)) {
      // Do not expose values, property names, or schema diagnostics containing secrets.
      throw new Error(`SMSv2 request violates the verified schema (${validate.errors?.[0]?.keyword ?? 'unknown'})`);
    }
  };
}
