/**
 * The completion rules, compiled into Excel.
 *
 * `completion-rules.ts` states each rule once as data; {@link evaluate} reads it against the deal and
 * this reads the same rule against the sheet. That is the whole design: the status beside a section
 * has to follow what somebody types during a review, and a second set of rules written directly as
 * formulas would be free to disagree with the engine — a sheet whose completion column contradicts
 * `engine score` is worse than one that is merely stale.
 *
 * **Where a path lives is not written here either.** `plan.inputCells` already maps every deal path to
 * the cell it landed in, so `qualification.metrics.evidence` resolves to a cell and that element's
 * `responses[]` to the range of its rows. Nothing in this file knows a coordinate.
 *
 * ## The one place the two readers see different inputs
 *
 * The engine counts **entries in the deal's array**. The sheet counts **rows whose identity column is
 * filled in** — the leftmost column of the list, which is a stakeholder's name, a milestone's title, a
 * team member's name. They agree for a blank row and for a filled one. They differ for an entry that
 * exists in the JSON with an empty name, which the engine counts and the sheet does not.
 *
 * That is the right way round for a live review: the rows a person can type into include the
 * pre-allocated blank ones, and a row is not somebody until it has a name. The `required` wash already
 * asks for that name, so the sheet says what to do before the count moves.
 */
import type { Predicate, SectionRule } from './completion-rules';
import type { InputCell } from './generate';
import { statusLabel } from './sections';
import { columnIndex } from './xlsx';

/** Where the deal's paths ended up on the sheet. Built from the plan, never from a coordinate. */
export interface CellResolver {
  /** The one cell holding a scalar path. */
  cell(path: string): string;
  /** The cells of an array of text — a question's answers. */
  range(list: string): string;
  /** The column that says a row of this list exists: its leftmost. */
  entryRange(list: string): string;
  /** One field's column, over the same rows as {@link entryRange}. */
  fieldRange(list: string, field: string): string;
}

/** `B56` -> `$B$56`, so nothing drags a rule sideways or down when Excel copies it. */
function absolute(address: string): string {
  const m = /^([A-Z]+)(\d+)$/.exec(address);
  if (!m) throw new Error(`"${address}" is not a cell reference`);
  return `$${m[1]}$${m[2]}`;
}

function spanOf(addresses: string[], what: string): string {
  if (addresses.length === 0) throw new Error(`the sheet has no cell for ${what}`);
  const rows = addresses.map((a) => Number(/\d+/.exec(a)?.[0]));
  const column = /^[A-Z]+/.exec(addresses[0])?.[0] ?? '';
  for (const address of addresses) {
    if (/^[A-Z]+/.exec(address)?.[0] !== column) {
      throw new Error(`${what} is spread across more than one column, so it has no single range`);
    }
  }
  return `$${column}$${Math.min(...rows)}:$${column}$${Math.max(...rows)}`;
}

/** `stakeholders[3].title` -> `{list: 'stakeholders', index: 3, field: 'title'}`, or null. */
function parseEntryPath(jsonPath: string): { list: string; index: number; field: string } | null {
  const m = /^(.*)\[(\d+)\]\.(.+)$/.exec(jsonPath);
  return m ? { list: m[1], index: Number(m[2]), field: m[3] } : null;
}

/** `qualification.metrics.responses[2]` -> `{list: 'qualification.metrics.responses', index: 2}`. */
function parseArrayPath(jsonPath: string): { list: string; index: number } | null {
  const m = /^(.*)\[(\d+)\]$/.exec(jsonPath);
  return m ? { list: m[1], index: Number(m[2]) } : null;
}

export function cellResolver(inputCells: readonly InputCell[]): CellResolver {
  const byPath = new Map<string, string>();
  /** list -> field -> addresses, in row order. */
  const lists = new Map<string, Map<string, string[]>>();
  /** list -> addresses of a bare array's cells. */
  const arrays = new Map<string, string[]>();

  for (const input of inputCells) {
    byPath.set(input.jsonPath, input.address);
    const entry = parseEntryPath(input.jsonPath);
    if (entry) {
      const fields = lists.get(entry.list) ?? new Map<string, string[]>();
      fields.set(entry.field, [...(fields.get(entry.field) ?? []), input.address]);
      lists.set(entry.list, fields);
      continue;
    }
    const array = parseArrayPath(input.jsonPath);
    if (array) arrays.set(array.list, [...(arrays.get(array.list) ?? []), input.address]);
  }

  /** The leftmost field of a list — the one that says a row is an entry. */
  const identityField = (list: string): string => {
    const fields = lists.get(list);
    if (!fields) throw new Error(`the sheet has no rows for the list "${list}"`);
    let leftmost: { field: string; column: number } | undefined;
    for (const [field, addresses] of fields) {
      const column = columnIndex(/^[A-Z]+/.exec(addresses[0])?.[0] ?? '');
      if (!leftmost || column < leftmost.column) leftmost = { field, column };
    }
    if (!leftmost) throw new Error(`the list "${list}" has no columns on the sheet`);
    return leftmost.field;
  };

  return {
    cell(path) {
      const address = byPath.get(path);
      if (!address) throw new Error(`the sheet has no cell for "${path}"`);
      return absolute(address);
    },
    range(list) {
      return spanOf(arrays.get(list) ?? [], `the array "${list}"`);
    },
    entryRange(list) {
      const field = identityField(list);
      return spanOf(lists.get(list)?.get(field) ?? [], `the list "${list}"`);
    },
    fieldRange(list, field) {
      const addresses = lists.get(list)?.get(field);
      if (!addresses) throw new Error(`the list "${list}" has no "${field}" column on the sheet`);
      return spanOf(addresses, `"${list}.${field}"`);
    },
  };
}

/** Non-empty after trimming, as the engine reads it. Excel's ISBLANK would call a space filled in. */
const filled = (ref: string) => `TRIM(${ref})<>""`;

/** How many rows of this list somebody has started. */
const startedRows = (resolve: CellResolver, list: string) => `SUMPRODUCT(--(${filled(resolve.entryRange(list))}))`;

export function compilePredicate(predicate: Predicate, resolve: CellResolver): string {
  switch (predicate.kind) {
    case 'all':
      // AND() of nothing is not valid Excel, and the identity of AND is TRUE.
      return predicate.of.length === 0
        ? 'TRUE'
        : `AND(${predicate.of.map((p) => compilePredicate(p, resolve)).join(',')})`;
    case 'any':
      return predicate.of.length === 0
        ? 'FALSE'
        : `OR(${predicate.of.map((p) => compilePredicate(p, resolve)).join(',')})`;
    case 'nonEmpty':
      return filled(resolve.cell(predicate.path));
    case 'atLeast':
      // N() so text and a blank both read as 0, which is how the engine reads a missing score.
      return `N(${resolve.cell(predicate.path)})>=${predicate.value}`;
    case 'anyNonEmpty':
      return `SUMPRODUCT(--(${filled(resolve.range(predicate.list))}))>0`;
    case 'countAtLeast':
      return `${startedRows(resolve, predicate.list)}>=${predicate.value}`;
    case 'everyEntryHas': {
      // No started row may be missing one of these. Counted rather than tested row by row, because a
      // formula cannot loop: for each field, the number of rows that have an identity and lack that
      // field must be nought.
      //
      // The identity column itself is skipped. A row without it is not an entry at all — that is what
      // `countAtLeast` means on a sheet — so the term would compare that column against itself and be
      // nought whatever anybody types.
      const entries = resolve.entryRange(predicate.list);
      const terms = predicate.fields
        .filter((field) => resolve.fieldRange(predicate.list, field) !== entries)
        .map((field) => `SUMPRODUCT((${filled(entries)})*(TRIM(${resolve.fieldRange(predicate.list, field)})=""))=0`);
      if (terms.length === 0) return 'TRUE';
      return terms.length === 1 ? terms[0] : `AND(${terms.join(',')})`;
    }
    default:
      throw new Error(`no formula for predicate: ${JSON.stringify((predicate as { kind: unknown }).kind)}`);
  }
}

/**
 * One section's rule as a formula returning the word the sheet shows.
 *
 * `complete` is asked first, exactly as {@link statusOf} asks it, so a section that satisfies both
 * halves reads as complete rather than as partial. The words come from `statusLabel` because the
 * column is coloured by matching them and the scorecard counts them — a formula answering "complete"
 * where the cell used to read "Complete" is a colour that never appears and a count stuck at nought.
 */
export function compileStatus(rule: SectionRule, resolve: CellResolver): string {
  const complete = compilePredicate(rule.complete, resolve);
  const started = compilePredicate(rule.started, resolve);
  return `IF(${complete},"${statusLabel('complete')}",IF(${started},"${statusLabel('partial')}","${statusLabel('not_started')}"))`;
}
