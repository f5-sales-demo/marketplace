/** Internal selective projection only. The owning runner must bind the exact unsubmitted saved plan first. */
export function parseTerraformFieldPath(path: string): string[] {
  if (typeof path !== 'string' || !/^[a-z][a-z0-9_]*(?:\.(?:[a-z][a-z0-9_]*|0|[1-9][0-9]*))*$/.test(path))
    throw Error('Explicit Terraform field path required');
  const parts = path.split('.');
  if (parts.length > 32 || parts.some((part) => /^[0-9]+$/.test(part) && !Number.isSafeInteger(Number(part))))
    throw Error('Explicit Terraform field path required');
  return parts;
}

const unavailable = () => Error('Terraform resource path is unavailable, sensitive or unresolved');
function clearMask(mask: unknown, depth = 0): boolean {
  if (mask === undefined || mask === false) return true;
  if (depth >= 32 || !mask || typeof mask !== 'object') return false;
  return Object.values(mask).every((value) => clearMask(value, depth + 1));
}
function childMask(mask: unknown, field: string): unknown {
  if (mask === undefined || mask === false) return undefined;
  if (!mask || typeof mask !== 'object') throw unavailable();
  return Object.hasOwn(mask, field) ? (mask as Record<string, unknown>)[field] : undefined;
}

function visibleListShape(mask: unknown): boolean {
  return (
    mask === undefined ||
    mask === false ||
    Array.isArray(mask) ||
    (mask !== null && typeof mask === 'object' && Object.keys(mask).length === 0)
  );
}

/** Select a resolved nonsensitive leaf/subtree or known list length. Unknown/sensitive ancestors reject. */
export function projectTerraformFieldPath(
  values: unknown,
  sensitive: unknown,
  unknown: unknown,
  path: string,
): unknown {
  const parts = parseTerraformFieldPath(path);
  let selected = values;
  let sensitivity = sensitive;
  let unresolved = unknown;
  for (const field of parts) {
    if (!selected || typeof selected !== 'object' || !Object.hasOwn(selected, field)) throw unavailable();
    if (Array.isArray(selected) && field === 'length') {
      // Terraform list masks describe item values. They do not mark the known
      // list cardinality unknown or sensitive unless the whole list is marked.
      if (!visibleListShape(sensitivity) || !visibleListShape(unresolved)) throw unavailable();
      selected = selected.length;
      sensitivity = undefined;
      unresolved = undefined;
      continue;
    }
    sensitivity = childMask(sensitivity, field);
    unresolved = childMask(unresolved, field);
    selected = (selected as Record<string, unknown>)[field];
  }
  if (selected === undefined || !clearMask(sensitivity) || !clearMask(unresolved)) throw unavailable();
  return selected;
}
