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

  // Decided before anything is touched, because a write that gives up halfway leaves the
  // objects it built on the way in. Reaching `responses[1]` in a deal with no `responses` at
  // all creates the array first; refusing the index afterwards would leave an empty array in a
  // deal the caller was told had changed in no way.
  const problem = checkPath(root, tokens, dottedPath, value === undefined);
  if (problem) return problem;

  let node: unknown = root;
  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i];
    const fresh = typeof tokens[i + 1] === 'number' ? [] : {};

    if (typeof token === 'number') {
      const list = node as unknown[];
      if (token === list.length) list.push(fresh);
      node = list[token];
      continue;
    }

    const holder = node as Record<string, unknown>;
    // Clearing never builds a path: `checkPath` has already established there is nothing there.
    if (holder[token] === undefined || holder[token] === null) {
      if (value === undefined) return null;
      holder[token] = fresh;
    }
    node = holder[token];
  }

  const last = tokens[tokens.length - 1];
  if (typeof last === 'number') {
    const list = node as unknown[];
    if (value === undefined) {
      // Deleting from the middle would renumber every element after it, and a response's
      // position is which question it answers.
      if (last < list.length) list[last] = '';
      return null;
    }
    list[last] = value;
    return null;
  }

  const holder = node as Record<string, unknown>;
  if (value === undefined) delete holder[last];
  else holder[last] = value;
  return null;
}

/**
 * Whether the write can be made, without making it.
 *
 * Walks the same tokens against the same data, tracking one extra thing: whether the node it
 * is standing on is one the write would have to create. A created node is empty, so an index
 * into it may only be 0 — which is what makes the array rule hold for a path that does not
 * exist yet, not just for one that does.
 */
function checkPath(
  root: unknown,
  tokens: Array<string | number>,
  dottedPath: string,
  clearing: boolean,
): string | null {
  let node: unknown = root;
  let fresh = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const isLast = i === tokens.length - 1;

    if (typeof token === 'number') {
      const length = fresh ? 0 : Array.isArray(node) ? node.length : -1;
      if (length < 0) return `${dottedPath} expects a list at step ${i + 1}`;
      if (token > length) return `row ${token + 1} cannot be filled in while row ${length + 1} is still empty`;
      if (isLast) return null;
      if (token === length) {
        fresh = true;
        node = undefined;
      } else {
        node = (node as unknown[])[token];
      }
      continue;
    }

    if (!fresh && (node === null || typeof node !== 'object' || Array.isArray(node))) {
      return `${dottedPath} expects an object at step ${i + 1}`;
    }
    if (isLast) return null;

    const child = fresh ? undefined : (node as Record<string, unknown>)[token];
    if (child === undefined || child === null) {
      if (clearing) return null;
      fresh = true;
      node = undefined;
    } else {
      fresh = false;
      node = child;
    }
  }

  return null;
}
