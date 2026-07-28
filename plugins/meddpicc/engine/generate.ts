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
import { schemaConstraint } from './schema-path';
import { QUALIFICATION_ELEMENTS, SECTION_ORDER } from './sections';
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
  type RowSpec,
  type SheetSpec,
  type TablePart,
  type Validation,
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
function toCellValue(value: unknown, valueType: ValueType): string | number | boolean | undefined {
  if (value === undefined || value === null || value === '') {
    // An unscored element is 0, not blank. `computeScore` already counts it as 0, and Excel's
    // COUNT/COUNTIF skip blanks — so leaving it empty made the sheet disagree with the engine
    // and, with COUNT in the denominator, display a partly-qualified deal as 100%.
    return valueType === 'score' ? 0 : undefined;
  }
  if (valueType === 'date') return dateToSerial(value) ?? String(value);
  if (valueType === 'boolean') return typeof value === 'boolean' ? value : String(value);
  if (valueType === 'integer' || valueType === 'number' || valueType === 'currency' || valueType === 'percent') {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
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
 * Where a list table can grow, so the reader can pick up rows a user added below the ones this plan
 * maps. An Excel Table extends the moment somebody types under its last row, which is the ordinary
 * way to add a stakeholder once the padded rows are used up.
 */
export interface ListGrowth {
  sheet: string;
  /** The list a new row would extend. */
  jsonPath: string;
  /** The first row past the ones this plan maps. */
  firstRow: number;
  /** The list index that first row would become. */
  nextIndex: number;
  /** Input columns only: where each sits, and the path it takes inside a new item. */
  columns: Array<{ column: number; relativePath: string; valueType: ValueType }>;
}

export interface WorkbookPlan {
  sheets: SheetSpec[];
  /** Named form cells -> `Sheet!Address`. */
  namedCells: Record<string, string>;
  inputCells: InputCell[];
  listGrowth: ListGrowth[];
}

/**
 * The values a dropdown offers, read from the schema.
 *
 * An enum lists them directly. A bounded integer — which is what a 0-4 score is — enumerates
 * its range instead, so the score column gets 0,1,2,3,4 without anyone typing that anywhere.
 */
function validationValues(schema: unknown, jsonPath: string): string[] | undefined {
  const constraint = schemaConstraint(schema, jsonPath);
  if (!constraint) return undefined;
  if (constraint.enum) return constraint.enum;
  const { minimum, maximum } = constraint;
  if (minimum === undefined || maximum === undefined) return undefined;
  if (!Number.isInteger(minimum) || !Number.isInteger(maximum) || maximum - minimum > 20) return undefined;
  return Array.from({ length: maximum - minimum + 1 }, (_, i) => String(minimum + i));
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

/** Pass 1: decide where everything goes. */
function layout(
  schema: unknown,
  spec: WorkbookSpec,
  deal: unknown,
): {
  named: Map<string, { sheet: string; address: string }>;
  tables: Map<string, TableLayout>;
  formRows: Map<string, Array<{ block: SpecBlock; row: number }>>;
} {
  const named = new Map<string, { sheet: string; address: string }>();
  const tables = new Map<string, TableLayout>();
  const formRows = new Map<string, Array<{ block: SpecBlock; row: number }>>();

  for (const s of spec.sheets) {
    if (s.kind === 'form') {
      const rows: Array<{ block: SpecBlock; row: number }> = [];
      let row = 1;
      for (const block of s.blocks) {
        rows.push({ block, row });
        if (block.kind === 'field' || block.kind === 'computed') {
          named.set(block.id, { sheet: s.name, address: A1(2, row) });
        }
        row++;
      }
      formRows.set(s.name, rows);
      continue;
    }

    for (const table of s.tables) {
      const columns = new Map<string, number>();
      table.columns.forEach((c, i) => {
        columns.set(c.id, table.anchorColumn + i);
      });
      const items = resolveRows(table, deal, schema);
      tables.set(table.id, {
        sheet: s.name,
        table,
        headerRow: table.headerRow,
        firstDataRow: table.headerRow + 1,
        rowCount: items.length,
        columns,
        rowKeys: keysOf(table.source),
        items,
      });
    }
  }

  return { named, tables, formRows };
}

/** Replace every `{{…}}` with an address, relative to the sheet (and row) doing the asking. */
function resolveFormula(
  formula: string,
  ctx: { sheet: string; table?: TableLayout; row?: number },
  named: Map<string, { sheet: string; address: string }>,
  tables: Map<string, TableLayout>,
): string {
  let out = formula;
  for (const ref of parseReferences(formula)) {
    let replacement: string;

    if (ref.kind === 'ref') {
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
        replacement = `INDEX(${valueRange},MATCH("${rowKey}",${keyRange},0))`;
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
    if (column.id === 'element') return element;
    if (column.id === 'definition') return hint.definition;
    if (column.id === 'rubric') {
      const score = readPath(deal, `qualification.${element}.score`);
      return hint.scoreDefinition[String(typeof score === 'number' ? score : 0)] ?? '';
    }
    if (column.id === 'status') return completion[element];
    return undefined;
  }

  if (source === 'sections') {
    const section = entry.key as string;
    if (column.id === 'section') return section;
    if (column.id === 'status') return completion[section];
    return undefined;
  }

  if (source === 'elementResponses') {
    const element = entry.element as string;
    const index = entry.index as number;
    if (column.id === 'element') return element;
    if (column.id === 'position') return index + 1;
    if (column.id === 'question') return computeElementHint(schema, element).questions[index];
    return undefined;
  }

  return undefined;
}

/**
 * Presentation settings every sheet shares: no grid, and a print setup that puts the deal on
 * paper the way a review expects rather than spread over six portrait pages.
 *
 * The grid is what makes a generated workbook read as a data dump. Hiding it costs nothing —
 * the cells and their borders are unchanged — and is the single largest visual difference
 * between this and a sheet somebody laid out by hand.
 */
function presentation(deal: unknown): Pick<SheetSpec, 'hideGridlines' | 'print'> {
  const account = readPath(deal, 'metadata.accountName');
  const name = readPath(deal, 'metadata.dealName');
  const header = [account, name].filter((p): p is string => typeof p === 'string' && p !== '').join(' — ');
  return {
    hideGridlines: true,
    print: { orientation: 'landscape', fitToWidth: true, header: header || undefined },
  };
}

export function planWorkbook(schema: unknown, spec: WorkbookSpec, deal: unknown): WorkbookPlan {
  const { named, tables, formRows } = layout(schema, spec, deal);
  const completion = computeCompletion(deal).completionStatus as Record<string, string>;
  const inputCells: InputCell[] = [];
  const sheets: SheetSpec[] = [];

  for (const s of spec.sheets) {
    if (s.kind === 'form') {
      const rows: RowSpec[] = [];
      const merges: string[] = [];
      // A form is label-then-value, so its width is however many columns the spec sizes.
      const formWidth = s.columns?.reduce((widest, c) => Math.max(widest, c.max), 0) ?? 0;
      for (const { block, row } of formRows.get(s.name) ?? []) {
        const cells: CellSpec[] = [];

        if (block.kind === 'title') cells.push({ ref: A1(1, row), value: block.text, style: 'title' });
        if (block.kind === 'section') cells.push({ ref: A1(1, row), value: block.text, style: 'sectionHeader' });

        if (block.kind === 'field' || block.kind === 'computed') {
          cells.push({ ref: A1(1, row), value: block.label, style: 'label' });
          const style = VALUE_TYPE_STYLE[block.valueType];
          const ref = A1(2, row);
          if (block.kind === 'field') {
            const value = toCellValue(readPath(deal, block.jsonPath), block.valueType);
            cells.push({ ref, value, style });
            inputCells.push({ jsonPath: block.jsonPath, sheet: s.name, address: ref, valueType: block.valueType });
          } else {
            cells.push({
              ref,
              formula: resolveFormula(block.formula, { sheet: s.name }, named, tables),
              style,
            });
          }
        }

        if (cells.length > 0) rows.push({ row, cells, height: 'height' in block ? block.height : undefined });
        // A banner that stops at the label column reads as a mislabelled cell rather than a
        // heading, so a title or section spans the width the sheet actually uses.
        if ((block.kind === 'title' || block.kind === 'section') && formWidth > 1) {
          merges.push(`${A1(1, row)}:${A1(formWidth, row)}`);
        }
      }
      const formFormats: ConditionalFormat[] = [];
      const formValidations: Validation[] = [];
      for (const { block, row } of formRows.get(s.name) ?? []) {
        if (block.kind !== 'field' && block.kind !== 'computed') continue;
        const ref = A1(2, row);
        if (block.conditionalFormat) formFormats.push({ sqref: ref, preset: block.conditionalFormat });
        if (block.kind === 'field' && block.validate) {
          const values = validationValues(schema, block.jsonPath);
          if (values) formValidations.push({ sqref: ref, values });
        }
      }

      sheets.push({
        name: s.name,
        rows,
        columns: s.columns,
        freezeAtRow: 1,
        merges: merges.length ? merges : undefined,
        ...presentation(deal),
        conditionalFormats: formFormats.length ? formFormats : undefined,
        validations: formValidations.length ? formValidations : undefined,
      });
      continue;
    }

    // A table sheet: header row(s) then data rows, one table per column band.
    const byRow = new Map<number, CellSpec[]>();
    const push = (row: number, cell: CellSpec) => {
      const list = byRow.get(row) ?? [];
      list.push(cell);
      byRow.set(row, list);
    };
    let widest = 0;

    for (const table of s.tables) {
      const info = tables.get(table.id);
      if (!info) continue;
      widest = Math.max(widest, table.anchorColumn + table.columns.length - 1);

      table.columns.forEach((column, i) => {
        const col = table.anchorColumn + i;
        push(table.headerRow, { ref: A1(col, table.headerRow), value: column.header, style: 'columnHeader' });

        info.items.forEach((entry, r) => {
          const row = info.firstDataRow + r;
          const ref = A1(col, row);
          const style = VALUE_TYPE_STYLE[column.valueType];

          if (column.role === 'computed' && column.formula) {
            push(row, {
              ref,
              formula: resolveFormula(column.formula, { sheet: s.name, table: info, row }, named, tables),
              style,
            });
            return;
          }

          if (column.role === 'input' && column.jsonPath) {
            const jsonPath = inputPathFor(table, column, entry);
            const value = toCellValue(readPath(deal, jsonPath), column.valueType);
            push(row, { ref, value, style });
            inputCells.push({ jsonPath, sheet: s.name, address: ref, valueType: column.valueType });
            return;
          }

          push(row, {
            ref,
            value: derivedValue(column, entry, table, schema, deal, completion),
            style,
          });
        });
      });
    }

    const columns = s.tables.flatMap((t) =>
      t.columns.map((c, i) => ({ min: t.anchorColumn + i, max: t.anchorColumn + i, width: c.width ?? 18 })),
    );

    const tableParts: TablePart[] = [];
    const tableFormats: ConditionalFormat[] = [];
    const tableValidations: Validation[] = [];

    for (const table of s.tables) {
      const info = tables.get(table.id);
      if (!info) continue;
      // An Excel Table needs at least one data row in its range, so a collection that is
      // empty and has no minRows still gets one — a header-only table is rejected outright.
      const lastRow = info.firstDataRow + Math.max(info.rowCount, 1) - 1;

      if (table.asTable) {
        tableParts.push({
          name: table.id,
          displayName: table.id,
          ref: `${A1(table.anchorColumn, table.headerRow)}:${A1(table.anchorColumn + table.columns.length - 1, lastRow)}`,
          columns: table.columns.map((c) => c.header),
        });
      }

      table.columns.forEach((column, i) => {
        const col = table.anchorColumn + i;
        const sqref = `${A1(col, info.firstDataRow)}:${A1(col, lastRow)}`;
        if (column.conditionalFormat) tableFormats.push({ sqref, preset: column.conditionalFormat });
        if (column.role === 'input' && column.validate && column.jsonPath) {
          // Any row's path resolves to the same schema node, so the first one answers for all.
          const values = validationValues(schema, inputPathFor(table, column, info.items[0] ?? {}));
          if (values) tableValidations.push({ sqref, values });
        }
      });
    }

    sheets.push({
      name: s.name,
      rows: [...byRow.entries()].sort(([a], [b]) => a - b).map(([row, cells]) => ({ row, cells })),
      columns,
      freezeAtRow: 1,
      ...presentation(deal),
      tables: tableParts.length ? tableParts : undefined,
      conditionalFormats: tableFormats.length ? tableFormats : undefined,
      validations: tableValidations.length ? tableValidations : undefined,
    });
  }

  // Row r of a list table holds item r, so the row after the last mapped one is item `rowCount`.
  const listGrowth: ListGrowth[] = [];
  for (const info of tables.values()) {
    if (info.table.source.kind !== 'list') continue;
    const columns = info.table.columns
      .map((column, i) => ({ column: info.table.anchorColumn + i, spec: column }))
      // A jsonPath is what makes a column writable, and `checkWorkbookSpec` already refuses a
      // computed column that claims one ("a derived value must not flow back"). Both `generate` and
      // `read` run that check, so asking about the role here as well would be a second opinion on a
      // settled question.
      .filter((c) => typeof c.spec.jsonPath === 'string')
      .map((c) => ({ column: c.column, relativePath: c.spec.jsonPath as string, valueType: c.spec.valueType }));
    if (columns.length === 0) continue;
    listGrowth.push({
      sheet: info.sheet,
      jsonPath: info.table.source.jsonPath,
      firstRow: info.firstDataRow + info.rowCount,
      nextIndex: info.rowCount,
      columns,
    });
  }

  return {
    sheets,
    namedCells: Object.fromEntries([...named].map(([id, v]) => [id, `${v.sheet}!${v.address}`])),
    inputCells,
    listGrowth,
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

export function generateWorkbook(schema: unknown, spec: WorkbookSpec, deal: unknown): Uint8Array {
  const plan = planWorkbook(schema, spec, deal);
  return buildWorkbook(plan.sheets, workbookFingerprint(plan, deal));
}
