/**
 * Resolve a dotted/indexed JSON path (e.g. "qualification.metrics.responses[0]",
 * "stakeholders.name") against a JSON Schema (draft 2020-12), following
 * properties / items / $ref (#/$defs/*) / allOf. Returns whether it resolves.
 */

type Schema = Record<string, unknown>;

/** Split "a.b[0].c" -> ["a", "b", "[0]", "c"]. */
function tokenize(path: string): string[] {
  const tokens: string[] = [];
  for (const part of path.split('.')) {
    const m = part.match(/^([^[\]]*)((?:\[\d+\])*)$/);
    if (!m) {
      tokens.push(part);
      continue;
    }
    if (m[1]) tokens.push(m[1]);
    const indices = m[2].match(/\[\d+\]/g);
    if (indices) tokens.push(...indices);
  }
  return tokens;
}

function deref(node: unknown, root: Schema): Schema | undefined {
  if (!node || typeof node !== 'object') return undefined;
  let cur = node as Schema;
  // Follow local $ref chains: "#/$defs/foo".
  let guard = 0;
  while (typeof cur.$ref === 'string' && guard++ < 20) {
    const ref = cur.$ref;
    if (!ref.startsWith('#/')) return undefined;
    let target: unknown = root;
    for (const seg of ref.slice(2).split('/')) {
      target = (target as Schema | undefined)?.[seg];
    }
    if (!target || typeof target !== 'object') return undefined;
    cur = target as Schema;
  }
  return cur;
}

/** Merge allOf subschemas' properties/items into a single view. */
function flatten(node: Schema, root: Schema): Schema {
  const merged: Schema = { ...node };
  const props: Record<string, unknown> = { ...((node.properties as Record<string, unknown>) ?? {}) };
  if (Array.isArray(node.allOf)) {
    for (const sub of node.allOf) {
      const d = deref(sub, root);
      if (!d) continue;
      const f = flatten(d, root);
      Object.assign(props, (f.properties as Record<string, unknown>) ?? {});
      if (!merged.items && f.items) merged.items = f.items;
      if (!merged.type && f.type) merged.type = f.type;
    }
  }
  merged.properties = props;
  return merged;
}

function normalize(node: unknown, root: Schema): Schema | undefined {
  const d = deref(node, root);
  if (!d) return undefined;
  return flatten(d, root);
}

/**
 * Walk to the schema node a dotted path names, or undefined when it does not resolve.
 *
 * `resolveSchemaPath` is this with the node thrown away. Keeping one walker means a path that
 * the guard accepts is a path the generator can read constraints from — two walkers would
 * eventually disagree about `$ref` or `allOf` and the disagreement would be silent.
 */
export function findSchemaNode(rootSchema: unknown, dottedPath: string): Schema | undefined {
  if (dottedPath === '') return undefined;
  if (!rootSchema || typeof rootSchema !== 'object') return undefined;
  const root = rootSchema as Schema;
  let node: Schema | undefined = normalize(root, root);

  for (const tok of tokenize(dottedPath)) {
    if (!node) return undefined;

    if (tok.startsWith('[')) {
      node = node.items ? normalize(node.items, root) : undefined;
      continue;
    }

    // Auto-descend an array when the next token is a property name (column-style path).
    if (node.type === 'array' || node.items) {
      node = node.items ? normalize(node.items, root) : undefined;
      if (!node) return undefined;
    }

    const props = (node.properties as Record<string, unknown>) ?? {};
    if (!(tok in props)) return undefined;
    node = normalize(props[tok], root);
  }

  return node;
}

export function resolveSchemaPath(rootSchema: unknown, dottedPath: string): boolean {
  return findSchemaNode(rootSchema, dottedPath) !== undefined;
}

export interface SchemaConstraint {
  type?: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
}

/**
 * The constraints the schema puts on a path: its type, its allowed values, its bounds.
 *
 * This is what makes a dropdown impossible to drift. The workbook's validation lists are not
 * authored anywhere — they are read from the same `enum` the validator enforces, so adding a
 * deal status in the schema adds it to the dropdown and nothing has to remember to.
 */
export function schemaConstraint(rootSchema: unknown, dottedPath: string): SchemaConstraint | undefined {
  const node = findSchemaNode(rootSchema, dottedPath);
  if (!node) return undefined;
  const values = Array.isArray(node.enum) ? node.enum.filter((v): v is string => typeof v === 'string') : undefined;
  return {
    type: typeof node.type === 'string' ? node.type : undefined,
    enum: values && values.length > 0 ? values : undefined,
    minimum: typeof node.minimum === 'number' ? node.minimum : undefined,
    maximum: typeof node.maximum === 'number' ? node.maximum : undefined,
  };
}
