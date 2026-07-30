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
import { entryFieldsOf, type Predicate, type SectionRule } from './completion-rules';
import { type InputCell, sheetPrefix } from './generate';
import { statusLabel } from './sections';
import { columnIndex } from './xlsx';

/** Where the deal's paths ended up on the sheet. Built from the plan, never from a coordinate. */
export interface CellResolver {
  /** The one cell holding a scalar path. */
  cell(path: string): string;
  /** The cells of an array of text — a question's answers. */
  range(list: string): string;
  /** Every column of this list, in layout order — what decides whether a row is an entry at all. */
  allRanges(list: string): string[];
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

/**
 * Where the deal's paths ended up, ready to be named from a formula on `formulaSheet`.
 *
 * A cell on another sheet is named with its sheet. The workbook is one laid-out sheet today, so this
 * changes nothing about what it emits — but a two-sheet spec passes `check-spec`, and a bare `$D$20`
 * would then mean whatever happens to sit at D20 on the sheet the formula is on. Excel evaluates that
 * without complaint, which is the worst way for it to be wrong.
 */
export function cellResolver(inputCells: readonly InputCell[], formulaSheet?: string): CellResolver {
  const byPath = new Map<string, string>();
  /** path -> the sheet it is on, so a reference can be qualified when it needs to be. */
  const sheetByPath = new Map<string, string>();
  /** list -> field -> addresses, in row order. */
  const lists = new Map<string, Map<string, string[]>>();
  /** list -> addresses of a bare array's cells. */
  const arrays = new Map<string, string[]>();

  for (const input of inputCells) {
    byPath.set(input.jsonPath, input.address);
    sheetByPath.set(input.jsonPath, input.sheet);
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

  /** Prefix a reference with its sheet when that is not the sheet the formula lives on. */
  const qualify = (sheet: string | undefined, reference: string) =>
    sheet === undefined || sheet === formulaSheet ? reference : `${sheetPrefix(sheet)}${reference}`;

  /** Every cell of one column is on one sheet, so the first entry answers for the range. */
  const sheetOfList = (list: string, field?: string) => {
    for (const [path, sheet] of sheetByPath) {
      const entry = parseEntryPath(path);
      if (entry?.list === list && (field === undefined || entry.field === field)) return sheet;
      if (parseArrayPath(path)?.list === list) return sheet;
    }
    return undefined;
  };

  return {
    cell(path) {
      const address = byPath.get(path);
      if (!address) throw new Error(`the sheet has no cell for "${path}"`);
      return qualify(sheetByPath.get(path), absolute(address));
    },
    range(list) {
      return qualify(sheetOfList(list), spanOf(arrays.get(list) ?? [], `the array "${list}"`));
    },
    allRanges(list) {
      const fields = lists.get(list);
      if (!fields) throw new Error(`the sheet has no rows for the list "${list}"`);
      return [...fields.entries()]
        .map(([field, addresses]) => ({
          column: columnIndex(/^[A-Z]+/.exec(addresses[0])?.[0] ?? ''),
          range: spanOf(addresses, `"${list}.${field}"`),
        }))
        .sort((a, b) => a.column - b.column)
        .map((entry) => qualify(sheetOfList(list), entry.range));
    },
    fieldRange(list, field) {
      const addresses = lists.get(list)?.get(field);
      if (!addresses) throw new Error(`the list "${list}" has no "${field}" column on the sheet`);
      return qualify(sheetOfList(list, field), spanOf(addresses, `"${list}.${field}"`));
    },
  };
}

/** A non-breaking space: whitespace to JavaScript, an ordinary character to Excel's TRIM and CLEAN. */
const NBSP = 160;

/**
 * The text of a cell or range with the whitespace both readers ignore taken out.
 *
 * `TRIM` alone takes ordinary spaces only, while the engine's `trim()` also takes tabs, newlines and
 * non-breaking spaces — so a value pasted in from a web page reads as filled to the sheet and empty to
 * the engine, and the two then disagree about whether an element is complete on evidence one of them
 * cannot see. `CLEAN` removes every control character, which covers the tab, the newline, the carriage
 * return and the vertical tab; the non-breaking space is the one it leaves, so it becomes a space first.
 *
 * What is left uncovered is the exotic end of Unicode's spaces — U+2000..U+200A, U+3000 and their like.
 * Each would need its own SUBSTITUTE, and a formula has 8192 characters to live in.
 */
const cleaned = (ref: string) => `CLEAN(SUBSTITUTE(${ref},CHAR(${NBSP})," "))`;

/** Non-empty after trimming, as the engine reads it. Excel's ISBLANK would call a space filled in. */
const filled = (ref: string) => `TRIM(${cleaned(ref)})<>""`;

/**
 * How many rows of this list are entries.
 *
 * The fields come from the RULE and are looked up as columns here, so the two readers count the same
 * rows by construction rather than by coincidence — and a rule naming a field the workbook does not show
 * fails at generation instead of counting a row the sheet cannot see.
 *
 * A row is an entry when ANY of its fields is filled in — not just the leftmost. The engine counts
 * entries in the deal's array, and the schema permits an entry with no name: `team.internal:
 * [{"role":"SE"}]` validates, and the engine calls the team complete. Counting the name column alone
 * made the sheet answer not_started on exactly that data, which is the contradiction this whole design
 * exists to prevent.
 *
 * The per-column tests are SUMMED and then compared, so a row with three fields filled counts once.
 *
 * One case is left, and it cannot be closed from the sheet: an entry whose every field is empty is
 * indistinguishable from one of the pre-allocated blank rows. The engine counts it and the sheet does
 * not. Nothing on the sheet could tell them apart.
 */
const startedRows = (resolve: CellResolver, list: string) =>
  `SUMPRODUCT(--((${entryFieldsOf(list)
    .map((field) => filled(resolve.fieldRange(list, field)))
    .join(')+(')})>0))`;

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
      // VALUE, not N(): `N("3")` is nought, while the round-trip reader accepts a textual "3" and applies
      // it as 3 — so a pasted score would show 3 on the sheet, leave the status partial, and change
      // meaning on read-back. IFERROR keeps a blank or a word at nought, which is how the engine reads a
      // score it cannot make a number of.
      return `IFERROR(VALUE(${resolve.cell(predicate.path)}),0)>=${predicate.value}`;
    case 'anyNonEmpty':
      return `SUMPRODUCT(--(${filled(resolve.range(predicate.list))}))>0`;
    case 'countAtLeast':
      return `${startedRows(resolve, predicate.list)}>=${predicate.value}`;
    case 'everyEntryHas': {
      // No started row may be missing one of these. Counted rather than tested row by row, because a
      // formula cannot loop: for each field, the number of started rows lacking it must be nought.
      //
      // "Started" is the same test the count uses, so the two halves of a rule cannot disagree about
      // which rows they are talking about.
      const started = entryFieldsOf(predicate.list)
        .map((field) => filled(resolve.fieldRange(predicate.list, field)))
        .join(')+(');
      const terms = predicate.fields.map(
        (field) => `SUMPRODUCT(--((${started})>0)*(TRIM(${cleaned(resolve.fieldRange(predicate.list, field))})=""))=0`,
      );
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
