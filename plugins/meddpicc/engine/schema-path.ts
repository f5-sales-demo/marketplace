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

export function resolveSchemaPath(rootSchema: unknown, dottedPath: string): boolean {
  if (dottedPath === '') return false;
  if (!rootSchema || typeof rootSchema !== 'object') return false;
  const root = rootSchema as Schema;
  let node: Schema | undefined = normalize(root, root);

  for (const tok of tokenize(dottedPath)) {
    if (!node) return false;

    if (tok.startsWith('[')) {
      node = node.items ? normalize(node.items, root) : undefined;
      continue;
    }

    // Auto-descend an array when the next token is a property name (column-style path).
    if (node.type === 'array' || node.items) {
      node = node.items ? normalize(node.items, root) : undefined;
      if (!node) return false;
    }

    const props = (node.properties as Record<string, unknown>) ?? {};
    if (!(tok in props)) return false;
    node = normalize(props[tok], root);
  }

  return node !== undefined;
}
