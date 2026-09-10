import { isIP } from 'node:net';

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
  const schema = requestSchema(schemas, root);
  return (spec: unknown) => {
    const keyword = firstFailure(schema, spec, schema);
    if (keyword) {
      // Do not expose values, property names, or schema diagnostics containing secrets.
      throw new Error(`SMSv2 request violates the verified schema (${keyword})`);
    }
  };
}

function equal(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right))
    return left.length === right.length && left.every((item, index) => equal(item, right[index]));
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const leftEntries = Object.entries(left);
    const rightObject = right as Json;
    return (
      leftEntries.length === Object.keys(rightObject).length &&
      leftEntries.every(([key, value]) => Object.hasOwn(rightObject, key) && equal(value, rightObject[key]))
    );
  }
  return false;
}

function validFormat(format: string, value: string): boolean {
  if (format === 'cidr') {
    const [address, length, extra] = value.split('/');
    const family = isIP(address);
    if (!family || extra !== undefined || !/^\d+$/.test(length ?? '')) return false;
    const bits = Number(length);
    return bits >= 0 && bits <= (family === 4 ? 32 : 128);
  }
  if (format === 'ipv4') return isIP(value) === 4;
  if (format === 'ipv6') return isIP(value) === 6;
  if (format === 'uuid')
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  if (format === 'dns-label') return /^(?!-)[a-z0-9-]{1,63}(?<!-)$/i.test(value);
  if (format === 'hostname' || format === 'fqdn')
    return value.length <= 253 && value.split('.').every((label) => /^(?!-)[a-z0-9-]{1,63}(?<!-)$/i.test(label));
  if (format === 'uri') {
    try {
      return Boolean(new URL(value).protocol);
    } catch {
      return false;
    }
  }
  if (format === 'date-time') return /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) && !Number.isNaN(Date.parse(value));
  // Protobuf scalar annotations such as int32, int64, and boolean are not string formats.
  // Unknown formats remain annotations, matching the prior non-strict AJV behavior.
  return true;
}

function typeMatches(type: unknown, value: unknown): boolean {
  if (Array.isArray(type)) return type.some((item) => typeMatches(item, value));
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return type === undefined || typeof value === type;
}

function firstFailure(schemaValue: Json | boolean, value: unknown, document: Json): string | null {
  if (schemaValue === false) return 'false schema';
  if (schemaValue === true) return null;
  if (typeof schemaValue.$ref === 'string') {
    const prefix = '#/definitions/';
    if (!schemaValue.$ref.startsWith(prefix)) return '$ref';
    const definition = object(document.definitions)[schemaValue.$ref.slice(prefix.length)];
    if (definition === undefined) return '$ref';
    const failure = firstFailure(definition as Json | boolean, value, document);
    if (failure) return failure;
  }
  if (schemaValue.nullable === true && value === null) return null;
  if (!typeMatches(schemaValue.type, value)) return 'type';
  if (Array.isArray(schemaValue.enum) && !schemaValue.enum.some((item) => equal(item, value))) return 'enum';
  if (Object.hasOwn(schemaValue, 'const') && !equal(schemaValue.const, value)) return 'const';

  for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
    const members = schemaValue[keyword];
    if (!Array.isArray(members)) continue;
    const matches = members.filter((member) => firstFailure(member as Json | boolean, value, document) === null).length;
    if ((keyword === 'allOf' && matches !== members.length) || (keyword === 'anyOf' && matches === 0) || (keyword === 'oneOf' && matches !== 1))
      return keyword;
  }
  if (schemaValue.not !== undefined && firstFailure(schemaValue.not as Json | boolean, value, document) === null)
    return 'not';

  if (typeof value === 'string') {
    const length = [...value].length;
    if (typeof schemaValue.minLength === 'number' && length < schemaValue.minLength) return 'minLength';
    if (typeof schemaValue.maxLength === 'number' && length > schemaValue.maxLength) return 'maxLength';
    if (typeof schemaValue.pattern === 'string' && !new RegExp(schemaValue.pattern, 'u').test(value)) return 'pattern';
    if (typeof schemaValue.format === 'string' && !validFormat(schemaValue.format, value)) return 'format';
  }
  if (typeof value === 'number') {
    if (typeof schemaValue.minimum === 'number' && value < schemaValue.minimum) return 'minimum';
    if (typeof schemaValue.maximum === 'number' && value > schemaValue.maximum) return 'maximum';
    if (typeof schemaValue.exclusiveMinimum === 'number' && value <= schemaValue.exclusiveMinimum) return 'exclusiveMinimum';
    if (typeof schemaValue.exclusiveMaximum === 'number' && value >= schemaValue.exclusiveMaximum) return 'exclusiveMaximum';
    if (typeof schemaValue.multipleOf === 'number') {
      const quotient = value / schemaValue.multipleOf;
      if (!Number.isFinite(quotient) || Math.abs(quotient - Math.round(quotient)) > 1e-12) return 'multipleOf';
    }
  }
  if (Array.isArray(value)) {
    if (typeof schemaValue.minItems === 'number' && value.length < schemaValue.minItems) return 'minItems';
    if (typeof schemaValue.maxItems === 'number' && value.length > schemaValue.maxItems) return 'maxItems';
    if (schemaValue.uniqueItems === true && value.some((item, index) => value.slice(0, index).some((seen) => equal(seen, item))))
      return 'uniqueItems';
    if (schemaValue.items !== undefined)
      for (const item of value) {
        const failure = firstFailure(schemaValue.items as Json | boolean, item, document);
        if (failure) return failure;
      }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Json;
    if (Array.isArray(schemaValue.required) && schemaValue.required.some((key) => typeof key === 'string' && !Object.hasOwn(record, key)))
      return 'required';
    const entries = Object.entries(record);
    if (typeof schemaValue.minProperties === 'number' && entries.length < schemaValue.minProperties) return 'minProperties';
    if (typeof schemaValue.maxProperties === 'number' && entries.length > schemaValue.maxProperties) return 'maxProperties';
    const properties: Json | undefined = schemaValue.properties ? object(schemaValue.properties) : undefined;
    for (const [key, item] of entries) {
      const propertySchema = properties?.[key];
      if (propertySchema !== undefined) {
        const failure = firstFailure(propertySchema as Json | boolean, item, document);
        if (failure) return failure;
      } else if (schemaValue.additionalProperties === false) return 'additionalProperties';
      else if (schemaValue.additionalProperties && typeof schemaValue.additionalProperties === 'object') {
        const failure = firstFailure(schemaValue.additionalProperties as Json, item, document);
        if (failure) return failure;
      }
    }
  }
  return null;
}
