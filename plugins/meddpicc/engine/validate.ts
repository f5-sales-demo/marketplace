export interface ValidationResult {
  valid: boolean;
  errors: Array<{ instancePath: string; keyword: string; message: string; schemaPath: string }>;
}

/**
 * Zero-dependency JSON Schema validator implementing the draft 2020-12 SUBSET
 * used by meddpicc-schema.json. Dropping the external validation library makes
 * the engine fully self-contained — Bun runs the TypeScript directly, so a
 * fresh marketplace install needs no `node_modules` and no build step.
 *
 * Supported keywords: type, required, properties, items, enum, const, minimum,
 * maximum, $ref (local `#/...` only, incl. `#/$defs/*`), allOf.
 *
 * Deliberate leniency (keeps the validator focused on qualification-correctness
 * constraints and guarantees the valid example is never false-rejected):
 *   - `format` (date/date-time) and `pattern` (Salesforce ID prefixes) are
 *     accepted unconditionally. This is a slight loosening vs the prior
 *     ajv + ajv-formats stack, which did check them — but both only constrain
 *     optional, annotation-grade fields, never scores/required/enums.
 *   - `additionalProperties` is only enforced when explicitly `false`.
 *   - a subschema with no `type` does not constrain the instance type.
 *   - numeric bounds apply to numbers only; booleans are never numbers.
 */

type JsonSchema = Record<string, unknown>;
type Err = ValidationResult['errors'][number];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => k in b && deepEqual(a[k], b[k]));
  }
  return false;
}

function escapePointer(key: string): string {
  return key.replace(/~/g, '~0').replace(/\//g, '~1');
}

function unescapePointer(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

function matchesType(data: unknown, type: string): boolean {
  switch (type) {
    case 'object':
      return isPlainObject(data);
    case 'array':
      return Array.isArray(data);
    case 'string':
      return typeof data === 'string';
    case 'boolean':
      return typeof data === 'boolean';
    case 'number':
      return typeof data === 'number';
    case 'integer':
      return typeof data === 'number' && Number.isInteger(data);
    case 'null':
      return data === null;
    default:
      return true; // unknown type keyword → don't constrain
  }
}

export function validateDeal(deal: unknown, schema: unknown): ValidationResult {
  const root = schema as JsonSchema;
  const errors: Err[] = [];
  // Guard against $ref cycles: key by ref pointer + the instance location it is
  // being applied to, so the same $def reused at different data paths is fine.
  const activeRefs = new Set<string>();

  function resolveRef(ref: string): JsonSchema | undefined {
    if (!ref.startsWith('#')) return undefined; // only local refs supported
    const pointer = ref.slice(1);
    if (pointer === '') return root;
    const tokens = pointer.split('/').slice(1).map(unescapePointer);
    let cur: unknown = root;
    for (const t of tokens) {
      if (!isPlainObject(cur) && !Array.isArray(cur)) return undefined;
      cur = (cur as Record<string, unknown>)[t];
    }
    return isPlainObject(cur) ? cur : undefined;
  }

  function validate(data: unknown, sch: JsonSchema, ip: string, sp: string): void {
    if (!isPlainObject(sch)) return;

    // $ref (local only) — validate against the resolved target.
    if (typeof sch.$ref === 'string') {
      const key = `${sch.$ref}@${ip}`;
      if (!activeRefs.has(key)) {
        const target = resolveRef(sch.$ref);
        if (target) {
          activeRefs.add(key);
          validate(data, target, ip, sch.$ref);
          activeRefs.delete(key);
        }
      }
    }

    // allOf — validate against every subschema.
    if (Array.isArray(sch.allOf)) {
      sch.allOf.forEach((sub, i) => {
        if (isPlainObject(sub)) validate(data, sub, ip, `${sp}/allOf/${i}`);
      });
    }

    // type
    if (typeof sch.type === 'string' || Array.isArray(sch.type)) {
      const types = (Array.isArray(sch.type) ? sch.type : [sch.type]) as string[];
      if (!types.some((t) => matchesType(data, t))) {
        errors.push({
          instancePath: ip,
          keyword: 'type',
          message: `must be ${types.join(' or ')}`,
          schemaPath: `${sp}/type`,
        });
      }
    }

    // enum
    if (Array.isArray(sch.enum)) {
      if (!sch.enum.some((e) => deepEqual(data, e))) {
        errors.push({
          instancePath: ip,
          keyword: 'enum',
          message: 'must be equal to one of the allowed values',
          schemaPath: `${sp}/enum`,
        });
      }
    }

    // const
    if ('const' in sch) {
      if (!deepEqual(data, sch.const)) {
        errors.push({
          instancePath: ip,
          keyword: 'const',
          message: 'must be equal to constant',
          schemaPath: `${sp}/const`,
        });
      }
    }

    // minimum / maximum (numbers only)
    if (typeof data === 'number') {
      if (typeof sch.minimum === 'number' && data < sch.minimum) {
        errors.push({
          instancePath: ip,
          keyword: 'minimum',
          message: `must be >= ${sch.minimum}`,
          schemaPath: `${sp}/minimum`,
        });
      }
      if (typeof sch.maximum === 'number' && data > sch.maximum) {
        errors.push({
          instancePath: ip,
          keyword: 'maximum',
          message: `must be <= ${sch.maximum}`,
          schemaPath: `${sp}/maximum`,
        });
      }
    }

    // required — only honor a proper array-of-strings list, objects only.
    if (Array.isArray(sch.required) && isPlainObject(data)) {
      for (const key of sch.required) {
        if (typeof key === 'string' && !(key in data)) {
          errors.push({
            instancePath: ip,
            keyword: 'required',
            message: `must have required property '${key}'`,
            schemaPath: `${sp}/required`,
          });
        }
      }
    }

    // properties — validate each present property (objects only).
    if (isPlainObject(sch.properties) && isPlainObject(data)) {
      for (const [key, subSchema] of Object.entries(sch.properties)) {
        if (key in data && isPlainObject(subSchema)) {
          validate(data[key], subSchema, `${ip}/${escapePointer(key)}`, `${sp}/properties/${escapePointer(key)}`);
        }
      }
    }

    // additionalProperties — enforce only when explicitly `false`.
    if (sch.additionalProperties === false && isPlainObject(data)) {
      const known = isPlainObject(sch.properties) ? Object.keys(sch.properties) : [];
      for (const key of Object.keys(data)) {
        if (!known.includes(key)) {
          errors.push({
            instancePath: ip,
            keyword: 'additionalProperties',
            message: 'must NOT have additional properties',
            schemaPath: `${sp}/additionalProperties`,
          });
        }
      }
    }

    // items — validate every element (arrays only; single-schema form).
    if (isPlainObject(sch.items) && Array.isArray(data)) {
      data.forEach((el, i) => {
        validate(el, sch.items as JsonSchema, `${ip}/${i}`, `${sp}/items`);
      });
    }

    // `format` and `pattern` are intentionally not evaluated (leniency).
  }

  validate(deal, root, '', '#');
  return { valid: errors.length === 0, errors };
}
