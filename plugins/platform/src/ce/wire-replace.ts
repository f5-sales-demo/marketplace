type Json = Record<string, unknown>;
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed replacement schema');
  return value as Json;
};

/** Remove only schema-declared read-only fields and unset defaults from a GET snapshot. */
export function projectReplaceSnapshot(
  value: unknown,
  schemas: Json,
  root: string,
  ignoredRootFields: string[] = [],
): Json {
  function shape(value: unknown, depth = 0): Json {
    if (depth > 50) throw new Error('Replacement schema nesting exceeds limit');
    const schema = object(value);
    let resolved: Json = {};
    if (schema.$ref) {
      if (typeof schema.$ref !== 'string' || !schema.$ref.startsWith('#/components/schemas/'))
        throw new Error('Unsupported replacement reference');
      resolved = shape(schemas[schema.$ref.slice('#/components/schemas/'.length)], depth + 1);
    }
    if (schema.allOf)
      for (const item of schema.allOf as unknown[]) {
        const part = shape(item, depth + 1);
        resolved = {
          ...resolved,
          ...part,
          ...(resolved.properties || part.properties
            ? { properties: { ...(resolved.properties as Json), ...(part.properties as Json) } }
            : {}),
        };
      }
    return {
      ...resolved,
      ...schema,
      ...(schema.properties ? { properties: { ...(resolved.properties as Json), ...object(schema.properties) } } : {}),
    };
  }
  function project(value: unknown, schemaValue: unknown, top = false): unknown {
    const schema = shape(schemaValue);
    if (schema.readOnly === true || value === null || (value === '' && Number(schema.minLength) > 0)) return undefined;
    if (Array.isArray(value)) {
      if (!schema.items) throw new Error('Replacement array schema missing');
      return value.map((item) => {
        const projected = project(item, schema.items);
        if (projected === undefined) throw new Error('Replacement array contains an unset item');
        return projected;
      });
    }
    if (value && typeof value === 'object') {
      if (schema.properties === undefined && schema.additionalProperties === undefined) return structuredClone(value);
      const properties = object(schema.properties ?? {});
      const result: Json = {};
      for (const [key, item] of Object.entries(value)) {
        if (!Object.hasOwn(properties, key)) {
          if (top && ignoredRootFields.includes(key)) continue;
          if (schema.additionalProperties === true) {
            result[key] = structuredClone(item);
            continue;
          }
          if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
            const projected = project(item, schema.additionalProperties);
            if (projected !== undefined) result[key] = projected;
            continue;
          }
          throw new Error('GET snapshot contains an unsupported replacement field');
        }
        const projected = project(item, properties[key]);
        if (projected !== undefined) result[key] = projected;
      }
      return result;
    }
    return structuredClone(value);
  }
  return object(project(value, schemas[root], true));
}
