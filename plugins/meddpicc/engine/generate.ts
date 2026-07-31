/**
 * Turn a workbook spec plus a deal into a workbook.
 *
 * Two passes, because a formula's text depends on where other cells landed. The first walks
 * the spec and decides the address of every named cell and every table column; the second
 * emits the cells, substituting `{{ref:…}}`, `{{col:…}}`, `{{row:…}}` and `{{this:…}}` for
 * the addresses the first pass chose. Nothing in the spec names a coordinate, so inserting a
 * field cannot silently break a formula three sheets away.
 *
 * `planWorkbook` returns the sheet specs AND `inputCells` — every cell that holds a human's
 * value, with the `jsonPath` it came from. That map is the contract the round-trip reader
 * will consume, and stating it here keeps the two directions from drifting.
 */
import { createHash } from 'node:crypto';
import { computeCompletion } from './completion';
import { cellResolver, compileStatus } from './completion-formula';
import { SECTION_RULES } from './completion-rules';
import { computeElementHint } from './hint';
import { readPath } from './json-path';
import { enumLabel, enumLabels } from './labels';
import { DEFAULT_LOCALE, normalizeLocaleTag, type ResolvedLocale, SHIPPED_LOCALES } from './locale';
import { schemaConstraint } from './schema-path';
import { QUALIFICATION_ELEMENTS, SECTION_ORDER, sectionLabel, statusLabel } from './sections';
import { estimateRowHeight, MAX_ROW_HEIGHT, neededRowHeight } from './text-metrics';
import {
  parseReferences,
  type SpecBlock,
  type SpecColumn,
  type SpecTable,
  type SpecTableSource,
  VALUE_TYPE_STYLE,
  type ValueType,
  type WorkbookSpec,
} from './workbook-spec';
import {
  A1,
  ANCHOR_TEXT_PROPERTY,
  buildWorkbook,
  type CellSpec,
  type ConditionalFormat,
  columnLetter,
  ENGINE_VERSION_PROPERTY,
  excelString,
  FINGERPRINT_PROPERTY,
  LOCALE_PROPERTY,
  SCHEMA_HASH_PROPERTY,
  type SheetSpec,
  type Validation,
  type WorkbookProperties,
} from './xlsx';

/** Excel's 1900 date system counts from 1899-12-30, and that offset is the whole trick. */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;

/**
 * An ISO date as the number Excel stores, or null when the value is not a date.
 *
 * A date written as text looks right and breaks arithmetic: `closeDate - TODAY()` on a string
 * is a #VALUE! error, and the Deal sheet does exactly that.
 */
export function dateToSerial(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  // Anchored, and a time part only in the `T…` form the schema uses for lastSyncDate.
  // Left open-ended, the pattern accepted `2026-06-30XYZ` and quietly used the date.
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const utc = Date.UTC(y, mo - 1, d);
  if (Number.isNaN(utc)) return null;
  // Date.UTC rolls impossible components forward — 2026-02-31 becomes 2026-03-03, a close
  // date three days late that nothing downstream would question. Reject rather than shift.
  const back = new Date(utc);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return Math.round((utc - EXCEL_EPOCH_UTC) / MS_PER_DAY);
}

/** Coerce a deal value for a cell of this type. `undefined` means leave the cell blank. */
/** How a boolean reads on the sheet. */
export const BOOLEAN_YES = 'Yes';
export const BOOLEAN_NO = 'No';

function toCellValue(value: unknown, valueType: ValueType): string | number | boolean | undefined {
  if (value === undefined || value === null || value === '') {
    // An unscored element is 0, not blank. `computeScore` already counts it as 0, and Excel's
    // COUNT/COUNTIF skip blanks — so leaving it empty made the sheet disagree with the engine
    // and, with COUNT in the denominator, display a partly-qualified deal as 100%.
    return valueType === 'score' ? 0 : undefined;
  }
  if (valueType === 'date') return dateToSerial(value) ?? String(value);
  // "Yes" and "No", not TRUE and FALSE. A deal review is read by people, and Excel renders a real
  // boolean in shouting capitals. The reader accepts either spelling, so nothing is lost by writing
  // the readable one — and a boolean cell gets a Yes/No dropdown, which the manual sheet did not have.
  if (valueType === 'boolean') {
    if (typeof value === 'boolean') return value ? BOOLEAN_YES : BOOLEAN_NO;
    return value === undefined || value === null ? undefined : String(value);
  }
  if (valueType === 'integer' || valueType === 'number' || valueType === 'currency' || valueType === 'percent') {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
}

/**
 * A value as the sheet shows it: a member of a schema enum reads as its label, anything else as
 * itself.
 *
 * Scoped to enum members deliberately. Mapping every string through the label table would relabel a
 * free-text answer that happened to read "pending", and prose is not a status.
 */
function displayValue(
  schema: unknown,
  jsonPath: string,
  value: string | number | boolean | undefined,
): string | number | boolean | undefined {
  if (typeof value !== 'string') return value;
  const constraint = schemaConstraint(schema, jsonPath);
  return constraint?.enum?.includes(value) ? enumLabel(value) : value;
}

/**
 * How a formula names a cell on another sheet: bare when the name is simple, quoted otherwise, with an
 * apostrophe in the name doubled. Exported because the completion compiler needs the same rule — two
 * ways of writing a cross-sheet reference is two ways to get one wrong.
 */
export const sheetPrefix = (name: string) =>
  /^[A-Za-z0-9_]+$/.test(name) ? `${name}!` : `'${name.replace(/'/g, "''")}'!`;

/** Row keys for a keyed source, or null when the rows depend on the deal. */
function keysOf(source: SpecTableSource): readonly string[] | null {
  switch (source.kind) {
    case 'elements':
      return QUALIFICATION_ELEMENTS;
    case 'sections':
      return SECTION_ORDER;
    case 'fixed':
      return source.keys;
    case 'list':
    case 'elementResponses':
      return null;
  }
}

interface TableLayout {
  sheet: string;
  table: SpecTable;
  headerRow: number;
  firstDataRow: number;
  rowCount: number;
  /** Column id -> 1-based column index. */
  columns: Map<string, number>;
  /** For a keyed source, the key at each data row. */
  rowKeys: readonly string[] | null;
  /** Rows to emit: one entry per data row, carrying whatever that row is about. */
  items: Array<{ key?: string; listIndex?: number; element?: string; index?: number }>;
}

export interface InputCell {
  jsonPath: string;
  sheet: string;
  address: string;
  valueType: ValueType;
}

/**
 * Where a table ended up on the grid.
 *
 * One laid-out sheet has no fixed positions to assume: a table starts wherever the blocks above it
 * left off, and a column sits wherever the spans before it end. Anything that needs to name a cell
 * of a table — the acceptance test typing into Excel, a test asserting a rubric shows the right
 * wording — asks here rather than counting rows itself, so there is one idea of where a cell lives.
 */
export interface PlannedTable {
  id: string;
  sheet: string;
  headerRow: number;
  firstDataRow: number;
  /**
   * Rows the table shows.
   *
   * For a list this is its entries or `minRows`, whichever is larger — the extra ones are blank and
   * exist to be typed into. It is the whole of the list's capacity: nothing below them is read.
   */
  rows: number;
  /** Column id -> 1-based grid column. */
  columns: Record<string, number>;
}

/**
 * A cell whose text nobody may change, and the text it must still hold.
 *
 * Only rows with an identity of their own get one, and that is the whole distinction. An element row
 * IS metrics; a question row IS that question. Move one and the sheet still reads correctly while the
 * reader, which goes by position, hands the value to a different element — the sheet and the deal
 * disagree, and neither says so.
 *
 * A plain list row has no such identity: row one is simply the first stakeholder. Swap two names there
 * and the sheet says "<HISTORICAL_IDENTITY_58AE73013F>" beside "SVP Infrastructure", the deal ends up saying exactly that,
 * and the two agree. The reader has transcribed a sheet somebody made odd, which is its job. Sorting a
 * single column of a list is the way to make that happen by accident — and it makes the SHEET wrong
 * before any reading occurs, so no read-back policy can recover it. Regenerate instead; the skills say
 * so.
 *
 * The stamp proves "this workbook came from this deal, laid out this way". It cannot see a change
 * made INSIDE the workbook, and every address the reader uses is only meaningful while the rows are
 * where the generator put them. Re-order two element rows — which is what tidying a sheet looks like
 * — and each element is handed its neighbour's score, with no rejection and `ok` true. Measured:
 * swapping the first and last element rows proposed metrics 3 → 2 and competition 2 → 3.
 *
 * So the reader checks these before it reads anything, and refuses the whole workbook on a mismatch.
 *
 * Only text that CANNOT change with an edit qualifies: banners, group headers, field labels, column
 * headers, and the key column of a keyed table. A derived cell like the rubric wording is excluded on
 * purpose — it is derived from a score, and Excel leaves the old text in the cell after somebody
 * changes one, so anchoring it would refuse the most ordinary edit there is.
 */
export interface Anchor {
  sheet: string;
  address: string;
  text: string;
}

/**
 * A cell whose text needs a taller row than Excel has.
 *
 * Excel's tallest row is 409.5 points and a merged cell cannot autofit, so text needing more is
 * hidden with nothing to show it. That is not fixable at generation time; saying so is. The deal
 * schema bounds none of the prose fields, so a note written at length would otherwise end
 * mid-sentence with no indication anywhere.
 */
export interface ClippedCell {
  sheet: string;
  address: string;
  row: number;
  /** Points the text wanted. The row is written at Excel's maximum instead. */
  needed: number;
}

/**
 * A hover note the generator writes, and the cell it hangs on.
 *
 * Reported like the anchors and the prose cells are, because the same question applies to it: the
 * acceptance test has to ask Excel whether the note is really there, and it cannot ask about a cell
 * whose address it had to guess.
 */
export interface PlannedNote {
  sheet: string;
  address: string;
  text: string;
}

/** A wrapped cell whose row height had to be computed rather than autofitted. */
export interface ProseCell {
  sheet: string;
  address: string;
  row: number;
  /** Total width of the merged span, in characters of the default font. */
  width: number;
  text: string;
}

export interface WorkbookPlan {
  sheets: SheetSpec[];
  /** Cells whose text the reader verifies before trusting any address. */
  anchors: Anchor[];
  /**
   * Every prose cell whose row height was computed, with the width it was computed against.
   *
   * Excel autofits a wrapped cell but not a merged one, and nearly every prose cell here is merged —
   * so if the computation is short the text is clipped with nothing to notice. Arithmetic cannot
   * settle whether it was enough; only Excel's own font metrics can. This is what the acceptance test
   * measures against them.
   */
  proseCells: ProseCell[];
  /** Prose that needs a taller row than Excel has, so part of it cannot be shown. */
  clippedCells: ClippedCell[];
  /**
   * Reference text carried as a hover note instead of as a cell.
   *
   * Not read back, and not an anchor: a note is not a cell, so nothing about it can move a row or
   * disagree with the deal. It exists so the sheet explains itself to somebody meeting MEDDPICC for
   * the first time without charging every other reader the width and the height.
   */
  notes: PlannedNote[];
  /** Named form cells -> `Sheet!Address`. */
  namedCells: Record<string, string>;
  /** Every table's geometry, keyed by the spec's table id. */
  tables: PlannedTable[];
  /**
   * Every cell a person may type into, and the deal path it writes.
   *
   * A list's capacity is exactly the rows here: `minRows` blank ones are pre-allocated for entries
   * the deal does not have yet. Nothing below them is read. The eight-tab workbook did read those
   * rows, because an Excel Table auto-extended the moment somebody typed under it and each table
   * owned the tail of its own sheet — on one laid-out sheet neither holds. A table whose range
   * contains a merged cell is dropped by Excel, so there are no Tables left to extend, and the rows
   * under a table belong to the next section: scanning down would eventually read a banner's own
   * title as a list entry. Overflow is reported by {@link writtenCells} instead, which says to add
   * the entry to the deal JSON and regenerate.
   */
  inputCells: InputCell[];
  /**
   * `sheet!ref` for every cell the generator wrote.
   *
   * This is what makes "somebody typed something the workbook has no room for" answerable exactly
   * rather than by heuristic. The reader used to guess: anything below the deepest mapped row in a
   * column was stray. True when each table had a sheet to itself; wrong on one laid-out sheet, where
   * the Scorecard sits below the tables in the same columns and produced 77 false rejections.
   */
  writtenCells: string[];
}

/**
 * The values a dropdown offers, read from the schema.
 *
 * An enum lists them directly. A bounded integer — which is what a 0-4 score is — enumerates
 * its range instead, so the score column gets 0,1,2,3,4 without anyone typing that anywhere.
 */
function validationValues(schema: unknown, jsonPath: string, valueType?: ValueType): string[] | undefined {
  // A boolean has no enum to read, but it has exactly two values and they are worth offering.
  if (valueType === 'boolean') return [BOOLEAN_YES, BOOLEAN_NO];
  const constraint = schemaConstraint(schema, jsonPath);
  if (!constraint) return undefined;
  // The words the CELL shows, so the dropdown offers what is already in the cell beside it. Offering
  // `in_progress` under a cell reading "In progress" makes Excel refuse the value it wrote itself.
  // `enumLabels` refuses a set whose labels collide, because read-back could not tell them apart.
  if (constraint.enum) return enumLabels(constraint.enum);
  const { minimum, maximum } = constraint;
  if (minimum === undefined || maximum === undefined) return undefined;
  if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || maximum - minimum > 20) return undefined;
  return Array.from({ length: maximum - minimum + 1 }, (_, i) => String(minimum + i));
}

/** What a grouped column compares to decide where one run ends and the next begins. */
function groupKeyOf(entry: TableLayout['items'][number]): string {
  return String(entry.key ?? entry.element ?? entry.listIndex ?? '');
}

/** Rows for a table, resolved against the deal. */
function resolveRows(table: SpecTable, deal: unknown, schema: unknown): TableLayout['items'] {
  const source = table.source;
  const keys = keysOf(source);
  if (keys) return keys.map((key) => ({ key }));

  if (source.kind === 'elementResponses') {
    const rows: TableLayout['items'] = [];
    for (const element of QUALIFICATION_ELEMENTS) {
      const questions = computeElementHint(schema, element).questions;
      const responses = readPath(deal, `qualification.${element}.responses`);
      const answers = Array.isArray(responses) ? responses : [];
      // One row per question, plus any answer beyond the questions the schema declares —
      // an extra response is data someone entered, and dropping it silently is the bug the
      // legacy sheet had.
      const count = Math.max(questions.length, answers.length);
      for (let i = 0; i < count; i++) rows.push({ element, index: i });
    }
    return rows;
  }

  const list = readPath(deal, source.jsonPath);
  const items = Array.isArray(list) ? list : [];
  const padded = Math.max(items.length, table.minRows ?? 0);
  // The index is what makes each row's jsonPath distinct — `stakeholders[3].name`, not
  // `stakeholders.name` — which is what lets the reader put a value back where it came from.
  return Array.from({ length: padded }, (_, i) => ({ listIndex: i }));
}

/**
 * The row a cell sits on, across the columns of its own table — what `%ROW%` resolves to.
 *
 * Columns absolute and the row relative, so Excel moves the reference down the range and never
 * sideways. Scoped to the table rather than to the sheet because two tables share a band of rows: a
 * range spanning the width would let the milestones decide whether a critical action's row had been
 * started, and they are different lists.
 */
function tableRowRange(table: SpecTable, row: number): string {
  const width = table.columns.reduce((total, column) => total + (column.span ?? 1), 0);
  const from = columnLetter(table.anchorColumn);
  const to = columnLetter(table.anchorColumn + width - 1);
  return `$${from}${row}:$${to}${row}`;
}

/**
 * The sheet's vertical rhythm, in points, measured off the manual deal-review sheet.
 *
 * A banner is roughly twice the height of its text and a standard row a little over one line, which
 * is what stops a dense grid reading as a wall. Prose rows are computed instead — see
 * {@link estimateRowHeight} — and always take the taller of the two.
 */
const TITLE_HEIGHT = 40;
const BANNER_HEIGHT = 27;
const HEADER_HEIGHT = 30;
const ROW_HEIGHT = 24;
/** A gap between sections, deliberately short: vertical space is the scarce resource. */
const SPACER_HEIGHT = 8;
/** Excel's own default, for a column the spec does not size. */
const DEFAULT_COLUMN_WIDTH = 8.43;
/**
 * Opening zoom. The sheet is about 230 characters wide, so at 100% a reader lands on the left third
 * and has to go looking for the rest; at 75% the whole width is on screen, which is how the manual
 * sheet is read.
 */
const SHEET_ZOOM = 75;

/** Where a block landed, so pass 2 can render it without re-deriving the arithmetic. */
export interface PlacedBlock {
  block: SpecBlock;
  row: number;
  /** For a `row` block: the first grid column of each cell, in order. */
  columns?: number[];
}

/** Pass 1: decide where everything goes. */
function layout(
  schema: unknown,
  spec: WorkbookSpec,
  deal: unknown,
): {
  named: Map<string, { sheet: string; address: string }>;
  tables: Map<string, TableLayout>;
  placed: Map<string, PlacedBlock[]>;
} {
  const named = new Map<string, { sheet: string; address: string }>();
  const tables = new Map<string, TableLayout>();
  const placed = new Map<string, PlacedBlock[]>();

  for (const s of spec.sheets) {
    const contentStart = 2;
    const blocks: PlacedBlock[] = [];
    let row = 1;
    let bandRow: number | null = null;
    let bandDepth = 0;

    for (const block of s.blocks) {
      if (block.kind === 'table') {
        // Consecutive tables share their rows: the band opens on the first and every later one in
        // the run starts on the same header row, so two lists sit side by side.
        const headerRow = bandRow ?? row;
        bandRow = headerRow;
        const table = block.table;
        const columns = new Map<string, number>();
        let column = table.anchorColumn;
        for (const c of table.columns) {
          columns.set(c.id, column);
          column += c.span ?? 1;
        }
        const items = resolveRows(table, deal, schema);
        // At least one data row, and at least `minRows` so the list has room to grow into.
        const depth = 1 + Math.max(items.length, table.minRows ?? 1);
        tables.set(table.id, {
          sheet: s.name,
          table,
          headerRow,
          firstDataRow: headerRow + 1,
          rowCount: items.length,
          columns,
          rowKeys: keysOf(table.source),
          items,
        });
        blocks.push({ block, row: headerRow });
        bandDepth = Math.max(bandDepth, depth);
        row = headerRow + bandDepth;
        continue;
      }

      bandRow = null;
      bandDepth = 0;
      const columns: number[] = [];
      if (block.kind === 'row') {
        let column = contentStart;
        for (const cell of block.cells) {
          columns.push(column);
          if (cell.kind === 'field' || cell.kind === 'computed' || cell.kind === 'derived') {
            named.set(cell.id, { sheet: s.name, address: A1(column, row) });
          }
          column += cell.span;
        }
      }
      blocks.push({ block, row, columns: block.kind === 'row' ? columns : undefined });
      row++;
    }
    placed.set(s.name, blocks);
  }

  return { named, tables, placed };
}

/** Replace every `{{…}}` with an address, relative to the sheet (and row) doing the asking. */
/**
 * Words a formula may compare against, by the name the spec uses for them.
 *
 * One source of truth for a spelling that appears in two places — the cell and the formula that
 * counts it. Writing `"Yes"` into the spec by hand would be the display-versus-match trap again,
 * one JSON file away from the constant that decides what the cell says.
 *
 * The rating and sentiment words joined the table in #929, where three formulas were still spelling
 * them by hand. Note what this table can and cannot promise. It cannot read the schema — it is a
 * module constant and the schema arrives as an argument — and `enumLabel` falls through for a value it
 * has no entry for, so `enumLabel('Red')` is 'Red' whatever the schema says. So these spellings are
 * written as the schema spells them, and their agreement is enforced by `formula-words.test.ts`, which
 * fails when a word here is one no dropdown offers any more. The table buys one place to change; the
 * test is what makes a rename impossible to get half-done.
 */
export const FORMULA_WORDS: Record<string, string> = {
  booleanYes: BOOLEAN_YES,
  booleanNo: BOOLEAN_NO,
  statusComplete: enumLabel('complete'),
  // `scoring.overallRating`, which `scoreRating` computes and the rating conditional format colours.
  ratingRed: enumLabel('Red'),
  ratingYellow: enumLabel('Yellow'),
  ratingGreen: enumLabel('Green'),
  // `stakeholders[].sentiment`, counted by the two scorecard tallies.
  sentimentUnknownLabel: enumLabel('Unknown'),
  sentimentNegativeLabel: enumLabel('Negative'),
};

function resolveFormula(
  formula: string,
  ctx: { sheet: string; table?: TableLayout; row?: number },
  named: Map<string, { sheet: string; address: string }>,
  tables: Map<string, TableLayout>,
): string {
  let out = formula;
  for (const ref of parseReferences(formula)) {
    let replacement: string;

    if (ref.kind === 'word') {
      const word = FORMULA_WORDS[ref.target];
      if (word === undefined) {
        throw new Error(
          `${ctx.sheet}: {{word:${ref.target}}} names no word — have ${Object.keys(FORMULA_WORDS).join(', ')}`,
        );
      }
      // A literal quote inside an Excel string is written doubled. Without that, `He said "yes"` emits
      // `"He said "yes""`, which closes the string at the first inner quote and leaves Excel parsing the
      // rest as syntax — a repair prompt, or worse, a formula that means something else.
      //
      // Latent while every word here is one plain enum label, and live the moment #925 supplies
      // translations: a quotation mark is unremarkable in prose, and the words a formula compares against
      // are exactly the dropdown values a translation replaces.
      replacement = excelString(word);
    } else if (ref.kind === 'ref') {
      const target = named.get(ref.target);
      if (!target) throw new Error(`${ctx.sheet}: {{ref:${ref.target}}} names no cell`);
      replacement = target.sheet === ctx.sheet ? target.address : `${sheetPrefix(target.sheet)}${target.address}`;
    } else if (ref.kind === 'this') {
      if (!ctx.table || ctx.row === undefined) {
        throw new Error(`${ctx.sheet}: {{this:${ref.target}}} outside a table row`);
      }
      const col = ctx.table.columns.get(ref.target);
      if (!col) throw new Error(`${ctx.table.table.id}: {{this:${ref.target}}} names no column`);
      replacement = A1(col, ctx.row);
    } else {
      const [locator, rowKey] = ref.target.split('@');
      const dot = locator.indexOf('.');
      const found = tables.get(locator.slice(0, dot));
      const col = found?.columns.get(locator.slice(dot + 1));
      if (!found || !col) throw new Error(`${ctx.sheet}: ${ref.raw} does not resolve`);
      const prefix = found.sheet === ctx.sheet ? '' : sheetPrefix(found.sheet);

      if (ref.kind === 'row') {
        const index = found.rowKeys?.indexOf(rowKey ?? '') ?? -1;
        if (index < 0) throw new Error(`${ctx.sheet}: ${ref.raw} names no row`);
        // INDEX/MATCH rather than the row's address. `asTable` gives the user a sort button,
        // and after a sort `Qualification!C8` is a different element than it was — the
        // Scorecard would go on reporting it under the Champion label.
        const keyColumnId = found.table.keyColumn;
        const keyCol = keyColumnId ? found.columns.get(keyColumnId) : undefined;
        if (!keyCol) {
          throw new Error(`${ctx.sheet}: ${ref.raw} needs table "${found.table.id}" to declare a valid keyColumn`);
        }
        const last = found.firstDataRow + Math.max(found.rowCount, 1) - 1;
        const valueRange = `${prefix}${A1(col, found.firstDataRow)}:${A1(col, last)}`;
        const keyRange = `${prefix}${A1(keyCol, found.firstDataRow)}:${A1(keyCol, last)}`;
        // The key column displays a label, so that is what MATCH has to look for.
        replacement = `INDEX(${valueRange},MATCH(${excelString(sectionLabel(rowKey))},${keyRange},0))`;
      } else {
        // An empty table still needs a syntactically valid range, so span at least one row.
        const last = found.firstDataRow + Math.max(found.rowCount, 1) - 1;
        replacement = `${prefix}${A1(col, found.firstDataRow)}:${A1(col, last)}`;
      }
    }

    out = out.split(ref.raw).join(replacement);
  }
  return out;
}

/**
 * The text a column's hover note carries for one row.
 *
 * `source` is typed as a string rather than as {@link NoteSource} because the spec is JSON: a name
 * nobody implemented reaches here at runtime whatever the type says. `check-spec` refuses it first;
 * this throws if it ever gets past, because a workbook silently missing the definitions is exactly
 * the outcome the note exists to prevent.
 */
function noteText(source: string, entry: TableLayout['items'][number], table: SpecTable, schema: unknown): string {
  if (source === 'elementDefinition') {
    if (table.source.kind !== 'elements') {
      throw new Error(`table "${table.id}" asks for element definitions, and its rows are not elements`);
    }
    const element = entry.key as string;
    const definition = computeElementHint(schema, element).definition;
    if (definition === '') {
      throw new Error(`the schema declares no definition for "${element}", so its note would be an empty box`);
    }
    return definition;
  }
  throw new Error(`no note text for "${source}" — the spec asks for a kind of note the generator does not know`);
}

/** The value a `derived` column shows. Everything here comes from the schema or the engine. */
/** A formula string literal: Excel escapes a double quote by doubling it. */
const quote = (text: string) => `"${text.replace(/"/g, '""')}"`;

/**
 * Every wording a derived column could show for this row, or null when it can only show one.
 *
 * The rubric explains the score beside it, and there are five fixed wordings per element. Written as a
 * literal it goes stale the instant somebody changes that score — a contradiction on screen, in the
 * one column whose job is to explain the number next to it. So Excel chooses, and this is the set it
 * chooses from: the formula switches on the score cell, and the row is sized for the longest of them,
 * because a height cannot follow a formula.
 *
 * Only a LOOKUP qualifies. The completion statuses follow the engine's rules, and reimplementing those
 * in formulas would be a second opinion that could disagree with the engine — the thing this codebase
 * refuses everywhere else.
 */
function derivedCandidates(
  column: SpecColumn,
  entry: TableLayout['items'][number],
  table: SpecTable,
  schema: unknown,
): Array<{ score: string; text: string }> | null {
  if (table.source.kind !== 'elements' || column.id !== 'rubric') return null;
  const definitions = computeElementHint(schema, entry.key as string).scoreDefinition;
  const entries = Object.entries(definitions).filter(([, text]) => typeof text === 'string' && text !== '');
  return entries.length === 0 ? null : entries.map(([score, text]) => ({ score, text: text as string }));
}

/** The lookup as a formula, switching on `scoreRef`. */
function candidateFormula(candidates: Array<{ score: string; text: string }>, scoreRef: string): string {
  // Descending, so the last branch is the lowest score and doubles as the fallback: a blank or
  // unexpected score reads as the level-0 wording rather than as FALSE.
  const ordered = [...candidates].sort((a, b) => Number(b.score) - Number(a.score));
  const last = ordered[ordered.length - 1];
  let formula = quote(last.text);
  for (const candidate of ordered.slice(0, -1).reverse()) {
    formula = `IF(${scoreRef}=${Number(candidate.score)},${quote(candidate.text)},${formula})`;
  }
  return formula;
}

function derivedValue(
  column: SpecColumn,
  entry: TableLayout['items'][number],
  table: SpecTable,
  schema: unknown,
  deal: unknown,
  completion: Record<string, string>,
): string | number | boolean | undefined {
  const source = table.source.kind;

  if (source === 'elements') {
    const element = entry.key as string;
    const hint = computeElementHint(schema, element);
    if (column.id === 'element') return sectionLabel(element);
    if (column.id === 'rubric') {
      const score = readPath(deal, `qualification.${element}.score`);
      return hint.scoreDefinition[String(typeof score === 'number' ? score : 0)] ?? '';
    }
    if (column.id === 'status') return statusLabel(completion[element]);
    return undefined;
  }

  if (source === 'sections') {
    const section = entry.key as string;
    if (column.id === 'section') return sectionLabel(section);
    if (column.id === 'status') return statusLabel(completion[section]);
    return undefined;
  }

  if (source === 'elementResponses') {
    const element = entry.element as string;
    const index = entry.index as number;
    if (column.id === 'element') return sectionLabel(element);
    if (column.id === 'position') return index + 1;
    if (column.id === 'question') return computeElementHint(schema, element).questions[index];
    return undefined;
  }

  return undefined;
}

/** What the header says when the deal names nothing — see {@link presentation}. */
export const FALLBACK_HEADER = 'MEDDPICC Deal Review';

/**
 * Presentation settings every sheet shares: no grid, and a print setup that puts the deal on
 * paper the way a review expects rather than spread over six portrait pages.
 *
 * The grid is what makes a generated workbook read as a data dump. Hiding it costs nothing —
 * the cells and their borders are unchanged — and is the single largest visual difference
 * between this and a sheet somebody laid out by hand.
 */
function presentation(deal: unknown): Pick<SheetSpec, 'hideGridlines' | 'print'> {
  // Parts, not one joined string: the writer shares Excel's 255-character header budget across
  // them, so a very long account name cannot crowd a later part out and leave every deal for that
  // account printing identically.
  //
  // `dealId` is in there because it is the only part guaranteed to identify the deal, and it is short,
  // so per-part budgeting always lets it through.
  //
  // The fallback below is no longer reachable from a VALID deal: #901 bounded all three of these with
  // `minLength` and `pattern: "\S"`, so a validated deal always names itself and `header` is never
  // empty. It stays because `planWorkbook` takes `deal: unknown` and does not validate — a caller that
  // plans an unvalidated deal, which the tests and the acceptance harness both do, can still reach it,
  // and an unlabelled printout is worse than a generic one.
  const header = ['metadata.accountName', 'metadata.dealName', 'metadata.dealId']
    .map((path) => readPath(deal, path))
    .filter((part): part is string => typeof part === 'string' && part !== '');
  return {
    hideGridlines: true,
    print: {
      orientation: 'landscape',
      fitToWidth: true,
      // Never nothing: an unlabelled printout is worse than a generic one.
      header: header.length ? header : [FALLBACK_HEADER],
    },
  };
}

export function planWorkbook(schema: unknown, spec: WorkbookSpec, deal: unknown): WorkbookPlan {
  const { named, tables, placed } = layout(schema, spec, deal);
  const completion = computeCompletion(deal).completionStatus as Record<string, string>;
  const inputCells: InputCell[] = [];
  const anchors: Anchor[] = [];
  const proseCells: ProseCell[] = [];
  const clippedCells: ClippedCell[] = [];
  const notes: PlannedNote[] = [];
  const sheets: SheetSpec[] = [];
  /**
   * Status cells whose formula cannot be written yet.
   *
   * A completion rule names cells anywhere in the workbook, so the formulas are compiled after every
   * sheet has been laid out. Compiled per sheet they could only see the input cells of that sheet and
   * the ones before it — and a two-sheet spec with its Completion block first then failed to generate,
   * which made a valid spec depend on the order its sheets happened to be written in.
   */
  const pendingStatuses: Array<{ cell: CellSpec; section: string; sheet: string }> = [];
  /** `sheet!ref` for every cell the generator writes — see {@link WorkbookPlan.writtenCells}. */
  const writtenCells: string[] = [];

  for (const s of spec.sheets) {
    const byRow = new Map<number, CellSpec[]>();
    const heights = new Map<number, number>();
    const merges: string[] = [];
    const formats: ConditionalFormat[] = [];
    const validations: Validation[] = [];
    const push = (row: number, cell: CellSpec) => {
      const list = byRow.get(row) ?? [];
      list.push(cell);
      byRow.set(row, list);
      writtenCells.push(`${s.name}!${cell.ref}`);
    };
    /** Column widths by grid index, so a span can be turned into a character count. */
    const widthOf = (column: number) =>
      s.columns.find((c) => column >= c.min && column <= c.max)?.width ?? DEFAULT_COLUMN_WIDTH;
    const spanWidth = (column: number, span: number) => {
      let total = 0;
      for (let c = column; c < column + span; c++) total += widthOf(c);
      return total;
    };
    const contentStart = 2;
    const contentEnd = s.columns.reduce((widest, c) => Math.max(widest, c.max), contentStart);
    /** Declare a merge, unless the cell is only one column wide. */
    const mergeSpan = (column: number, row: number, span: number) => {
      if (span > 1) merges.push(`${A1(column, row)}:${A1(column + span - 1, row)}`);
    };
    /**
     * Measure a prose cell: size its row, remember it for the acceptance test, and say so if the text
     * wants a taller row than Excel has.
     */
    const measureProse = (row: number, ref: string, text: string, column: number, span: number) => {
      const width = spanWidth(column, span);
      const height = estimateRowHeight(text, width, ROW_HEIGHT);
      needHeight(row, height);
      proseCells.push({ sheet: s.name, address: ref, row, width, text });
      const needed = neededRowHeight(text, width);
      if (needed > MAX_ROW_HEIGHT) clippedCells.push({ sheet: s.name, address: ref, row, needed });
      return height;
    };
    /** A row's height is the tallest thing on it, and prose decides it. */
    const needHeight = (row: number, height: number) => {
      heights.set(row, Math.max(heights.get(row) ?? 0, height));
    };

    for (const { block, row, columns } of placed.get(s.name) ?? []) {
      if (block.kind === 'title' || block.kind === 'section') {
        const style = block.kind === 'title' ? 'title' : 'sectionHeader';
        push(row, { ref: A1(contentStart, row), value: block.text, style });
        anchors.push({ sheet: s.name, address: A1(contentStart, row), text: block.text });
        mergeSpan(contentStart, row, contentEnd - contentStart + 1);
        needHeight(row, block.kind === 'title' ? TITLE_HEIGHT : BANNER_HEIGHT);
        continue;
      }

      if (block.kind === 'group') {
        let column = contentStart;
        for (const cell of block.cells) {
          push(row, { ref: A1(column, row), value: cell.text, style: 'groupHeader' });
          anchors.push({ sheet: s.name, address: A1(column, row), text: cell.text });
          mergeSpan(column, row, cell.span);
          column += cell.span;
        }
        needHeight(row, BANNER_HEIGHT);
        continue;
      }

      if (block.kind === 'spacer') {
        needHeight(row, block.height ?? SPACER_HEIGHT);
        continue;
      }

      if (block.kind === 'row') {
        needHeight(row, block.height ?? ROW_HEIGHT);
        block.cells.forEach((cell, i) => {
          const column = columns?.[i] ?? contentStart;
          const ref = A1(column, row);
          if (cell.kind === 'blank') return;
          mergeSpan(column, row, cell.span);

          if (cell.kind === 'label') {
            push(row, { ref, value: cell.text, style: 'fieldLabel' });
            anchors.push({ sheet: s.name, address: ref, text: cell.text });
            return;
          }

          const style = VALUE_TYPE_STYLE[cell.valueType];
          if (cell.kind === 'derived') {
            const value = derivedRowValue(cell.id, deal);
            push(row, { ref, value, style });
            if (cell.conditionalFormat) formats.push({ sqref: ref, preset: cell.conditionalFormat });
            return;
          }
          if (cell.kind === 'field') {
            const value = displayValue(
              schema,
              cell.jsonPath,
              toCellValue(readPath(deal, cell.jsonPath), cell.valueType),
            );
            push(row, { ref, value, style });
            inputCells.push({ jsonPath: cell.jsonPath, sheet: s.name, address: ref, valueType: cell.valueType });
            // Excel autofits a wrapped cell but not a merged one, and every span over one column is
            // merged — so a prose cell's row has to be measured here or its text is simply cut off.
            if (cell.valueType === 'text' && typeof value === 'string') {
              measureProse(row, ref, value, column, cell.span);
            }
            if (cell.validate) {
              const values = validationValues(schema, cell.jsonPath, cell.valueType);
              if (values) validations.push({ sqref: ref, values });
            }
            if (cell.shadeWhenEmpty) {
              formats.push({ sqref: ref, preset: cell.shadeWhenEmpty === 'wanted' ? 'wanted' : 'missing' });
            }
          } else {
            push(row, { ref, formula: resolveFormula(cell.formula, { sheet: s.name }, named, tables), style });
          }
          if (cell.conditionalFormat) formats.push({ sqref: ref, preset: cell.conditionalFormat });
        });
        continue;
      }

      // A table: its header row, its data rows, and the blank rows it keeps to grow into.
      const table = block.table;
      const info = tables.get(table.id);
      if (!info) continue;
      const padded = Math.max(info.items.length, table.minRows ?? 1);
      needHeight(info.headerRow, HEADER_HEIGHT);

      let column = table.anchorColumn;
      for (const spec of table.columns) {
        const span = spec.span ?? 1;
        push(info.headerRow, { ref: A1(column, info.headerRow), value: spec.header, style: 'columnHeader' });
        anchors.push({ sheet: s.name, address: A1(column, info.headerRow), text: spec.header });
        mergeSpan(column, info.headerRow, span);

        // A grouped column writes its value once per run of equal values and merges down over the
        // run — the element name beside its questions, as the manual sheet has it. Only the first row
        // of a run gets a cell: a merge refuses to cover a value it would hide, which is the guard
        // doing its job.
        const runStart = new Map<number, number>();
        if (spec.groupRuns) {
          let seen: string | undefined;
          let start = 0;
          for (let r = 0; r < padded; r++) {
            const value = info.items[r] === undefined ? undefined : String(groupKeyOf(info.items[r]));
            if (value === undefined || value !== seen) {
              seen = value;
              start = r;
            }
            runStart.set(r, start);
          }
        }
        /**
         * Rows of this column that are blank and merged, and the tallest height any filled one needed.
         *
         * A padded row is there to be typed into, and Excel cannot autofit a merged cell — so left at
         * the standard height the first sentence entered into one is clipped, with no error and nothing
         * to click. There is no knowing what somebody will type, so the room comes from the rows above.
         */
        const blankProseRows: number[] = [];
        let tallestProse = 0;
        const runLength = (r: number) => {
          let n = 1;
          while (r + n < padded && runStart.get(r + n) === r) n++;
          return n;
        };

        for (let r = 0; r < padded; r++) {
          const dataRow = info.firstDataRow + r;
          const ref = A1(column, dataRow);
          const style = spec.heading ? 'fieldLabel' : VALUE_TYPE_STYLE[spec.valueType];
          const entry = info.items[r];

          if (spec.groupRuns) {
            // Not the first row of its run: the merge above already covers this cell.
            if (runStart.get(r) !== r) {
              needHeight(dataRow, ROW_HEIGHT);
              continue;
            }
            const rows = runLength(r);
            if (rows > 1 || span > 1) {
              merges.push(`${A1(column, dataRow)}:${A1(column + span - 1, dataRow + rows - 1)}`);
            }
          } else {
            mergeSpan(column, dataRow, span);
          }
          needHeight(dataRow, ROW_HEIGHT);

          // Past the data, the row exists to be typed into: styled, empty, and still merged so it
          // lines up with the header above it.
          if (entry === undefined) {
            push(dataRow, { ref, style });
            if (spec.valueType === 'text') blankProseRows.push(dataRow);
            continue;
          }

          // Before the branches, so a note is not a property of how the cell gets its value. Past the
          // grouped-run check above, so it lands on a cell a reader can actually hover rather than on
          // one the merge hides — which the writer refuses outright.
          if (spec.note !== undefined) {
            notes.push({ sheet: s.name, address: ref, text: noteText(spec.note, entry, table, schema) });
          }

          if (spec.role === 'computed' && spec.formula) {
            push(dataRow, {
              ref,
              formula: resolveFormula(spec.formula, { sheet: s.name, table: info, row: dataRow }, named, tables),
              style,
            });
            continue;
          }

          if (spec.role === 'input' && spec.jsonPath) {
            const jsonPath = inputPathFor(table, spec, entry);
            const value = displayValue(schema, jsonPath, toCellValue(readPath(deal, jsonPath), spec.valueType));
            push(dataRow, { ref, value, style });
            inputCells.push({ jsonPath, sheet: s.name, address: ref, valueType: spec.valueType });
            if (spec.valueType === 'text') {
              // A list's padded rows are real entries whose values are simply absent, so blankness is
              // decided here rather than by the `entry === undefined` branch above — which only fires
              // for a keyed table with fewer keys than rows.
              if (typeof value === 'string') {
                tallestProse = Math.max(tallestProse, measureProse(dataRow, ref, value, column, span));
              } else {
                blankProseRows.push(dataRow);
              }
            }
            continue;
          }

          // A lookup Excel can do itself — see `derivedCandidates`. The row is sized for the longest
          // wording rather than the current one, because a height cannot follow a formula and sizing
          // it to today's text clips the cell the moment a longer one is selected.
          const candidates = derivedCandidates(spec, entry, table, schema);
          if (candidates !== null) {
            const scoreColumn = info.columns.get('score');
            if (scoreColumn === undefined) {
              throw new Error(`table "${table.id}" has a ${spec.id} column but no score column to switch it on`);
            }
            push(dataRow, { ref, formula: candidateFormula(candidates, A1(scoreColumn, dataRow)), style });
            const longest = candidates.reduce((a, b) => (b.text.length > a.text.length ? b : a)).text;
            measureProse(dataRow, ref, longest, column, span);
            // `continue` the ROW loop only. `column += span` belongs to the column loop around it, and
            // advancing it here left every row after the first writing into the next column.
            continue;
          }

          // A section's completion status: the engine's own rule, compiled into a formula so it follows
          // what somebody types during a review instead of describing the deal as it was generated.
          // Filled in after the walk, because a rule names cells that later blocks may not have placed
          // yet — the Completion block happens to sit near the end today, and nothing should depend on
          // that.
          if (table.source.kind === 'sections' && spec.id === 'status') {
            const cell: CellSpec = { ref, style };
            push(dataRow, cell);
            pendingStatuses.push({ cell, section: entry.key as string, sheet: s.name });
            continue;
          }

          const derived = derivedValue(spec, entry, table, schema, deal, completion);
          push(dataRow, { ref, value: derived, style });
          // A derived cell says which element or question its row is about, and nothing a person may
          // legitimately edit changes it — so it anchors the row. Anchoring only the declared key
          // column left the `responses` table, which has none, unchecked: swapping two question rows
          // then attached each answer to the wrong question.
          //
          // Except when the value follows an INPUT. The rubric wording follows a score, so after an
          // applied score change the plan expects the new wording while the file still holds the old
          // one — anchoring it refuses the ordinary read-apply-read sequence. See `followsInput`.
          if (!spec.followsInput && typeof derived === 'string' && derived !== '') {
            anchors.push({ sheet: s.name, address: ref, text: derived });
          }
          if (spec.valueType === 'text' && typeof derived === 'string') {
            tallestProse = Math.max(tallestProse, measureProse(dataRow, ref, derived, column, span));
          }
        }

        // Give every blank prose row the room the filled ones needed. Applied after the walk because
        // the tallest is not known until the last row has been measured, and `needHeight` takes the
        // greater of what it is given — so a row shared with a taller cell keeps that height.
        for (const blankRow of blankProseRows) needHeight(blankRow, tallestProse);

        // Formats and dropdowns cover the padded rows too: a value typed into a blank row should
        // colour and validate like one that was there when the file was written.
        const lastRow = info.firstDataRow + padded - 1;
        const sqref = `${A1(column, info.firstDataRow)}:${A1(column, lastRow)}`;
        if (spec.conditionalFormat) formats.push({ sqref, preset: spec.conditionalFormat });
        // Over the whole capacity, including the rows kept spare — and the rule itself decides, by
        // asking whether anything else is on the row. A range stopping at the last existing entry left
        // the wash absent from the case it is most use: a stakeholder somebody is halfway through
        // typing into a spare row, whose blank title is refused on read-back rather than shown as a gap
        // while it is being filled in. Painting those rows unconditionally would be the opposite
        // mistake, so `%ROW%` carries the condition.
        if (spec.shadeWhenEmpty) {
          formats.push({
            sqref,
            preset: spec.shadeWhenEmpty === 'wanted' ? 'wantedInRow' : 'missingInRow',
            rowRange: tableRowRange(table, info.firstDataRow),
          });
        }
        if (spec.role === 'input' && spec.validate && spec.jsonPath) {
          // Any row's path resolves to the same schema node, so the first one answers for all.
          const values = validationValues(schema, inputPathFor(table, spec, info.items[0] ?? {}), spec.valueType);
          if (values) validations.push({ sqref, values });
        }
        column += span;
      }
    }

    // Taken from the one collection rather than accumulated twice: the plan reports notes per
    // workbook and the writer takes them per sheet, and two lists would be two chances to disagree.
    const sheetNotes = notes.filter((n) => n.sheet === s.name).map(({ address, text }) => ({ ref: address, text }));
    sheets.push({
      name: s.name,
      rows: [...byRow.entries()]
        .sort(([a], [b]) => a - b)
        .map(([row, cells]) => ({ row, cells, height: heights.get(row) })),
      columns: s.columns,
      // Freeze under the title so the deal's name stays put while the rest scrolls.
      freezeAtRow: 1,
      zoom: SHEET_ZOOM,
      merges: merges.length ? merges : undefined,
      ...presentation(deal),
      conditionalFormats: formats.length ? formats : undefined,
      validations: validations.length ? validations : undefined,
      notes: sheetNotes.length ? sheetNotes : undefined,
    });
  }

  for (const { cell, section, sheet } of pendingStatuses) {
    const rule = SECTION_RULES[section];
    if (!rule) throw new Error(`the Completion block names section "${section}", which has no rule`);
    cell.formula = compileStatus(rule, cellResolver(inputCells, sheet));
  }

  return {
    anchors,
    proseCells,
    clippedCells,
    notes,
    writtenCells,
    sheets,
    namedCells: Object.fromEntries([...named].map(([id, v]) => [id, `${v.sheet}!${v.address}`])),
    inputCells,
    tables: [...tables.values()].map((info) => ({
      id: info.table.id,
      sheet: info.sheet,
      headerRow: info.headerRow,
      firstDataRow: info.firstDataRow,
      rows: Math.max(info.items.length, info.table.minRows ?? 1),
      columns: Object.fromEntries(info.columns),
    })),
  };
}

/**
 * A named row cell the generator works out, where the sheet has nothing to work it out from.
 *
 * Deliberately a closed set with a throw on anything else: a silent `undefined` here would render as an
 * empty cell, which reads as "not filled in yet" rather than "the spec names something that does not
 * exist".
 */
function derivedRowValue(id: string, deal: unknown): number | undefined {
  if (id === 'scorePreviousTotal') {
    const previous = readPath(deal, 'scoring.previousElementScores');
    if (previous === undefined || previous === null) return undefined;
    if (typeof previous !== 'object') return undefined;
    // Summed over the elements MEDDPICC actually scores, not over whatever keys the object carries, so
    // a stray key cannot inflate the total the sheet compares against.
    return QUALIFICATION_ELEMENTS.reduce((total, element) => {
      const score = (previous as Record<string, unknown>)[element];
      return total + (typeof score === 'number' && Number.isFinite(score) ? score : 0);
    }, 0);
  }
  throw new Error(`no derived value for row cell "${id}"`);
}

/** The concrete deal path an input column writes for one row. */
function inputPathFor(table: SpecTable, column: SpecColumn, entry: TableLayout['items'][number]): string {
  const relative = column.jsonPath as string;
  if (table.source.kind === 'list') {
    return `${table.source.jsonPath}[${entry.listIndex}].${relative}`;
  }
  if (table.source.kind === 'elementResponses') {
    return relative.replace('*', entry.element as string).replace('[]', `[${entry.index}]`);
  }
  return relative.replace('*', entry.key as string);
}

/**
 * What a workbook may be read back against: this deal, laid out this way.
 *
 * Both are needed, and for different reasons. The **identity** stops a workbook for one deal
 * being applied to another — an easy mistake when every deal's file is called `meddpicc.json`
 * in a different directory, and one that `--apply` would otherwise resolve by overwriting the
 * second deal with the first one's figures.
 *
 * The **layout** stops something quieter and worse. A table's row count depends on the deal:
 * answer one more question and every Questions row below it moves down one. The addresses in
 * an older workbook then name a different element's answer, and reading it row by row produces
 * a confident set of proposals that put metrics' answers onto economicBuyer. Measured on the
 * example deal: 14 proposals, no rejections, and nothing to suggest anything was wrong.
 *
 * Deliberately NOT a hash of the whole deal: a workbook on someone's desk must survive an edit
 * to the JSON that moves no cell, or the two would have to be regenerated in lockstep forever.
 */
export function workbookFingerprint(plan: WorkbookPlan, deal: unknown): string {
  const identity = String(readPath(deal, 'metadata.dealId') ?? '');
  const layout = plan.inputCells.map((c) => `${c.jsonPath}|${c.sheet}|${c.address}`).join('\n');
  return createHash('sha256').update(`${identity}\n${layout}`).digest('hex').slice(0, 32);
}

/**
 * The language the workbook is written in.
 *
 * One value, because that is the truth today: every label, heading and dropdown is English. The
 * schema lets a deal ask for another, and `generate` refuses rather than emitting an English file
 * stamped `ko` — a provenance property that lies about its own file is worse than not having one,
 * since the stamp is exactly what a reader trusts. When the locale files land, this becomes the
 * default rather than the only option.
 */

/**
 * A stable reference to the schema the workbook was generated against.
 *
 * The schema carries `$id` and `title` but no version, so there is nothing to cite — and a version
 * number somebody has to remember to bump is worse than no version at all, because a stale one lies.
 * A content hash is derived, so it cannot drift.
 */
/**
 * The words this plan puts in its anchor cells, in the order it writes them.
 *
 * The companion to {@link workbookFingerprint}, and deliberately separate from it. The fingerprint
 * answers "is this the same deal, laid out the same way", and a workbook must keep matching it through
 * an edit to the JSON that moves no cell — so it cannot cover displayed text. That left one symptom
 * with two causes and no way to tell them apart: revise a translation and every address is identical,
 * the fingerprint matches to the character, and every anchor reads different words. Measured on the
 * example deal: 115 revised strings, the same fingerprint, and five rejections all announcing that the
 * rows had moved. Nothing had moved.
 *
 * Scoped to the anchors because they are exactly what the reader compares. A hash over more than that
 * — every dropdown label, the rubric's prose — could differ while every anchor still matched, and the
 * reader would then have to either refuse a workbook that reads back perfectly or say something it
 * could not act on. Anchors keep the three cases exhaustive.
 *
 * Addresses are not included: they belong to the fingerprint, and a hash that covered both could not
 * say which of the two had changed, which is the whole point.
 */
export function anchorTextHash(plan: WorkbookPlan): string {
  const rendered = plan.anchors.map((anchor) => anchor.text).join('\n');
  return createHash('sha256').update(rendered).digest('hex').slice(0, 32);
}

export function schemaHash(schema: unknown): string {
  return createHash('sha256').update(JSON.stringify(schema)).digest('hex');
}

/**
 * What the workbook records about where it came from.
 *
 * All of it derived from the deal, the schema and the plugin — never from the clock, so generating
 * twice from an unchanged deal produces an unchanged file and "did Excel touch this?" stays a
 * question with an answer.
 */
export function workbookProperties(
  schema: unknown,
  plan: WorkbookPlan,
  deal: unknown,
  engineVersion?: string,
  /**
   * The locale already resolved, because resolving it here was the bug.
   *
   * This function runs after the sheet is laid out, so a locale decided here is a locale the planner
   * could never have known — and the refusal for an unsupported one arrived after all the layout work.
   * `resolveLocale` in `locale.ts` makes that decision once, from every input, before anything is
   * planned. Left optional so that a caller with no opinion still records the default rather than
   * nothing, since a workbook that does not say what language it is in is worse than one that guesses.
   */
  resolved: ResolvedLocale = { slug: DEFAULT_LOCALE, from: 'default' },
): WorkbookProperties {
  const locale = resolved.slug;
  if (!SHIPPED_LOCALES.includes(locale)) {
    // A caller that resolved through `resolveLocale` cannot reach this. One that passed a raw string can,
    // and a workbook stamped with a language it is not written in lies to every later reader.
    throw new Error(
      `A workbook cannot be stamped "${locale}": it is not translated into it. ` +
        `Resolve the locale with resolveLocale, which offers ${SHIPPED_LOCALES.join(', ')}.`,
    );
  }
  // The deal's request must not be silently DROPPED — which is not the same as insisting the stamp match
  // it, and getting that distinction wrong was a defect in this change's first version.
  //
  // The hole being closed: `generateWorkbook` called with no locale would have stamped English over a deal
  // explicitly asking for Korean, worse than the refusal it replaced, since silently ignoring a request
  // beats no request only if nobody asked. A pre-existing test caught that.
  //
  // But `--locale` outranks `metadata.locale` by design, so refusing every mismatch made the documented
  // override impossible: `--locale en` on a deal saying `ja` resolved to `en` and was then rejected for
  // disagreeing with the deal. Review caught that one. So the check asks where the locale came from — a
  // flag is somebody deliberately overriding the file, and anything less specific means the deal's request
  // went unheard.
  const asked = readPath(deal, 'metadata.locale');
  const overridden = resolved.from === 'flag';
  if (!overridden && typeof asked === 'string' && asked !== '' && normalizeLocaleTag(asked) !== locale) {
    throw new Error(
      `The deal asks for metadata.locale "${asked}", and the workbook is not translated into it — ` +
        `it is being written in "${locale}", and can be written in ${SHIPPED_LOCALES.join(', ')}. ` +
        `Remove the field, or set it to ${locale}, until the locale files land.`,
    );
  }
  return {
    [FINGERPRINT_PROPERTY]: workbookFingerprint(plan, deal),
    [ANCHOR_TEXT_PROPERTY]: anchorTextHash(plan),
    [SCHEMA_HASH_PROPERTY]: schemaHash(schema),
    [LOCALE_PROPERTY]: locale,
    ...(engineVersion === undefined ? {} : { [ENGINE_VERSION_PROPERTY]: engineVersion }),
  };
}

export function generateWorkbook(
  schema: unknown,
  spec: WorkbookSpec,
  deal: unknown,
  engineVersion?: string,
  /** Resolved by the caller — see {@link workbookProperties}. Defaults to English. */
  resolved: ResolvedLocale = { slug: DEFAULT_LOCALE, from: 'default' },
): Uint8Array {
  const plan = planWorkbook(schema, spec, deal);
  return buildWorkbook(plan.sheets, workbookProperties(schema, plan, deal, engineVersion, resolved));
}
