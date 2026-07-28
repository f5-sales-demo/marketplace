/**
 * Read and write a dotted/indexed path into a deal — `metadata.revenue.acv`,
 * `stakeholders[3].name`, `qualification.metrics.responses[0]`.
 *
 * The generator reads these paths and the reader writes them back, so they live together:
 * two walkers would eventually disagree about what `stakeholders[3]` means, and the
 * disagreement would put a value somewhere nobody looked.
 */

/** Split "a.b[0].c" into its steps, keeping indexes as their own tokens. */
function tokenize(dottedPath: string): Array<string | number> {
  const tokens: Array<string | number> = [];
  for (const part of dottedPath.split('.')) {
    const m = /^([^[\]]*)((?:\[\d+\])*)$/.exec(part);
    if (!m) {
      tokens.push(part);
      continue;
    }
    if (m[1]) tokens.push(m[1]);
    for (const index of m[2].match(/\d+/g) ?? []) tokens.push(Number(index));
  }
  return tokens;
}

/** Follow a path into the deal. Returns undefined rather than throwing. */
export function readPath(root: unknown, dottedPath: string): unknown {
  let node: unknown = root;
  for (const token of tokenize(dottedPath)) {
    if (typeof token === 'number') {
      if (!Array.isArray(node)) return undefined;
      node = node[token];
      continue;
    }
    if (node === null || typeof node !== 'object' || Array.isArray(node)) return undefined;
    node = (node as Record<string, unknown>)[token];
  }
  return node;
}

/**
 * Write a value at a path, creating the objects and array entries it passes through.
 * Returns a message when the write cannot be made, so the caller can name the cell.
 *
 * `undefined` clears: an object property is deleted, an array element becomes empty — which
 * keeps the positions of the elements around it, and those positions are what a response
 * array means.
 *
 * An array may only be appended to. Writing index 5 of a 3-element array would leave holes
 * that serialise as `null` and fail the schema, so it is refused rather than attempted: the
 * workbook pads its tables with blank rows, and skipping two of them is an easy mistake to
 * make in Excel.
 */
export function writePath(root: unknown, dottedPath: string, value: unknown): string | null {
  const tokens = tokenize(dottedPath);
  if (tokens.length === 0) return `"${dottedPath}" names nothing to write`;

  let node: unknown = root;
  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i];
    const nextIsIndex = typeof tokens[i + 1] === 'number';

    if (typeof token === 'number') {
      if (!Array.isArray(node)) return `${dottedPath} expects a list at step ${i + 1}`;
      if (token > node.length) {
        return `row ${token + 1} cannot be filled in while row ${node.length + 1} is still empty`;
      }
      if (token === node.length) node.push(nextIsIndex ? [] : {});
      node = node[token];
      continue;
    }

    if (node === null || typeof node !== 'object' || Array.isArray(node)) {
      return `${dottedPath} expects an object at step ${i + 1}`;
    }
    const holder = node as Record<string, unknown>;
    if (holder[token] === undefined || holder[token] === null) {
      // Clearing a value never needs to build the path to it.
      if (value === undefined) return null;
      holder[token] = nextIsIndex ? [] : {};
    }
    node = holder[token];
  }

  const last = tokens[tokens.length - 1];
  if (typeof last === 'number') {
    if (!Array.isArray(node)) return `${dottedPath} expects a list`;
    if (last > node.length) {
      return `row ${last + 1} cannot be filled in while row ${node.length + 1} is still empty`;
    }
    if (value === undefined) {
      // Deleting from the middle would renumber every element after it.
      if (last < node.length) node[last] = '';
      return null;
    }
    node[last] = value;
    return null;
  }

  if (node === null || typeof node !== 'object' || Array.isArray(node)) return `${dottedPath} expects an object`;
  const holder = node as Record<string, unknown>;
  if (value === undefined) delete holder[last];
  else holder[last] = value;
  return null;
}
