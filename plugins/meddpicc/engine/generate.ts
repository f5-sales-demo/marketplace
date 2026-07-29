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
import { computeElementHint } from './hint';
import { readPath } from './json-path';
import { enumLabel, enumLabels } from './labels';
import { schemaConstraint } from './schema-path';
import { QUALIFICATION_ELEMENTS, SECTION_ORDER, sectionLabel, statusLabel } from './sections';
import { estimateRowHeight } from './text-metrics';
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
  buildWorkbook,
  type CellSpec,
  type ConditionalFormat,
  ENGINE_VERSION_PROPERTY,
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

const sheetPrefix = (name: string) => (/^[A-Za-z0-9_]+$/.test(name) ? `${name}!` : `'${name.replace(/'/g, "''")}'!`);

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

export interface WorkbookPlan {
  sheets: SheetSpec[];
  /** Cells whose text the reader verifies before trusting any address. */
  anchors: Anchor[];
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
          if (cell.kind === 'field' || cell.kind === 'computed') {
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
 */
const FORMULA_WORDS: Record<string, string> = {
  booleanYes: BOOLEAN_YES,
  booleanNo: BOOLEAN_NO,
  statusComplete: enumLabel('complete'),
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
      replacement = `"${word}"`;
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
        replacement = `INDEX(${valueRange},MATCH("${sectionLabel(rowKey)}",${keyRange},0))`;
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

/** The value a `derived` column shows. Everything here comes from the schema or the engine. */
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
    if (column.id === 'definition') return hint.definition;
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
const FALLBACK_HEADER = 'MEDDPICC Deal Review';

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
  // `dealId` is in there because it is the only part guaranteed to identify the deal. The schema
  // requires all three of these but bounds none of them, so a deal whose account and deal names
  // are both empty strings still validates — and a printout of it would carry nothing to file it
  // by. The id is short, so per-part budgeting always lets it through.
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
  const sheets: SheetSpec[] = [];
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
              needHeight(row, estimateRowHeight(value, spanWidth(column, cell.span), ROW_HEIGHT));
            }
            if (cell.validate) {
              const values = validationValues(schema, cell.jsonPath, cell.valueType);
              if (values) validations.push({ sqref: ref, values });
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
            continue;
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
            if (spec.valueType === 'text' && typeof value === 'string') {
              needHeight(dataRow, estimateRowHeight(value, spanWidth(column, span), ROW_HEIGHT));
            }
            continue;
          }

          const derived = derivedValue(spec, entry, table, schema, deal, completion);
          push(dataRow, { ref, value: derived, style });
          // The key column is what a formula's MATCH looks a row up by, and what says which element
          // a row is about. Nothing a person may legitimately edit changes it, so it anchors the row.
          if (spec.id === table.keyColumn && typeof derived === 'string') {
            anchors.push({ sheet: s.name, address: ref, text: derived });
          }
          if (spec.valueType === 'text' && typeof derived === 'string') {
            needHeight(dataRow, estimateRowHeight(derived, spanWidth(column, span), ROW_HEIGHT));
          }
        }

        // Formats and dropdowns cover the padded rows too: a value typed into a blank row should
        // colour and validate like one that was there when the file was written.
        const lastRow = info.firstDataRow + padded - 1;
        const sqref = `${A1(column, info.firstDataRow)}:${A1(column, lastRow)}`;
        if (spec.conditionalFormat) formats.push({ sqref, preset: spec.conditionalFormat });
        if (spec.role === 'input' && spec.validate && spec.jsonPath) {
          // Any row's path resolves to the same schema node, so the first one answers for all.
          const values = validationValues(schema, inputPathFor(table, spec, info.items[0] ?? {}), spec.valueType);
          if (values) validations.push({ sqref, values });
        }
        column += span;
      }
    }

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
    });
  }

  return {
    anchors,
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

/** The default when a deal names no language. */
export const DEFAULT_LOCALE = 'en';

/**
 * A stable reference to the schema the workbook was generated against.
 *
 * The schema carries `$id` and `title` but no version, so there is nothing to cite — and a version
 * number somebody has to remember to bump is worse than no version at all, because a stale one lies.
 * A content hash is derived, so it cannot drift.
 */
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
): WorkbookProperties {
  const locale = readPath(deal, 'metadata.locale');
  return {
    [FINGERPRINT_PROPERTY]: workbookFingerprint(plan, deal),
    [SCHEMA_HASH_PROPERTY]: schemaHash(schema),
    [LOCALE_PROPERTY]: typeof locale === 'string' && locale !== '' ? locale : DEFAULT_LOCALE,
    ...(engineVersion === undefined ? {} : { [ENGINE_VERSION_PROPERTY]: engineVersion }),
  };
}

export function generateWorkbook(
  schema: unknown,
  spec: WorkbookSpec,
  deal: unknown,
  engineVersion?: string,
): Uint8Array {
  const plan = planWorkbook(schema, spec, deal);
  return buildWorkbook(plan.sheets, workbookProperties(schema, plan, deal, engineVersion));
}
