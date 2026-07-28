/**
 * Read a workbook back and say what changed — the other direction of `generate.ts`.
 *
 * The rule the whole file is built around: **the JSON is the source of truth, so a cell that
 * differs is a proposal, not an update.** Nothing is written unless the caller asks, and a
 * value the schema refuses is reported by its cell address, because the person who has to fix
 * it is looking at Excel, not at a JSON pointer.
 *
 * Which cells are eligible is not decided here. `planWorkbook` already returns `inputCells` —
 * every cell that holds a human's value, with the `jsonPath` it came from — and this walks
 * exactly that list. A second idea of where cells live is how the two directions would drift.
 *
 * Four things a reader of hand-written OOXML has to get right, each learned the hard way:
 *
 * - **An address only means something in the workbook it came from.** A table's row count
 *   depends on the deal, so answering one more question moves every row below it. Reading an
 *   older workbook cell by cell produced 14 confident proposals that put one element's answers
 *   onto another, with no rejection and `ok` true. Hence the stamp, checked before anything
 *   else: a workbook is read against the deal it was generated from, or not at all.
 * - **Excel rewrites the file when it saves.** The generator emits `t="inlineStr"`; Excel
 *   re-saves the same text through `sharedStrings.xml` as `t="s"`. A reader that only
 *   understands its own output works perfectly on a file nobody has edited.
 * - **A formula's cached value is not a human's entry.** `<f>` is honoured by refusing the
 *   cell, never by taking the `<v>` beside it.
 * - **A date cell can only hold a day.** So dates are compared as serials; comparing the
 *   cell's `2026-06-30` against a JSON `2026-06-30T09:15:00Z` as text would report a phantom
 *   edit on every read, and the reader would cry wolf until nobody read it.
 */
import { dateToSerial, type InputCell, planWorkbook, type WorkbookPlan, workbookFingerprint } from './generate';
import { readPath, writePath } from './json-path';
import { schemaConstraint } from './schema-path';
import { type ValidationResult, validateDeal } from './validate';
import type { ValueType, WorkbookSpec } from './workbook-spec';
import { A1, FINGERPRINT_PROPERTY } from './xlsx';
import { readZip } from './zip';

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;
/** 9999-12-31. Beyond this Excel has no date, and neither has anything downstream. */
const MAX_SERIAL = 2_958_465;

/** The day an Excel serial names, or null when the number is not a date. */
export function serialToDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 0 || serial > MAX_SERIAL) return null;
  // A serial's fraction is a time of day; a date cell's meaning is its day.
  const date = new Date(EXCEL_EPOCH_UTC + Math.floor(serial) * MS_PER_DAY);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** One cell as the file stores it, before anything is made of it. */
export interface RawCell {
  ref: string;
  /**
   * The cell's content as text, however it was stored — inline, shared, or a numeric literal.
   * Undefined when the cell is blank, and deliberately undefined for a formula cell: a cached
   * result must not be readable as something a person typed.
   */
  text?: string;
  formula?: string;
  /** The `t` attribute, which is how a boolean or an error is told from a number. */
  type?: string;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function unescapeXml(text: string): string {
  return text.replace(/&(#\d+|#x[0-9a-fA-F]+|[a-z]+);/g, (whole, code: string) => {
    if (code.startsWith('#x')) return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    if (code.startsWith('#')) return String.fromCodePoint(Number(code.slice(1)));
    return ENTITIES[code] ?? whole;
  });
}

/** Every `<t>` inside one element, joined — Excel splits a string into runs. */
function joinTextRuns(xml: string): string {
  // Phonetic hints also live in <t>, and they are annotation, not content.
  const withoutPhonetics = xml.replace(/<rPh[\s\S]*?<\/rPh>/g, '');
  return [...withoutPhonetics.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1])).join('');
}

function attribute(attrs: string, name: string): string | undefined {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1];
}

/** `xl/sharedStrings.xml` as an ordered list, whatever the part is called. */
function sharedStrings(entries: Map<string, { data: Uint8Array }>, workbookRels: Map<string, string>): string[] {
  const target = [...workbookRels.entries()].find(([, t]) => /sharedStrings\.xml$/.test(t))?.[1];
  const part = target ? resolvePart(target) : 'xl/sharedStrings.xml';
  const entry = entries.get(part) ?? entries.get('xl/sharedStrings.xml');
  if (!entry) return [];
  const xml = new TextDecoder().decode(entry.data);
  return [...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map((m) => joinTextRuns(m[1]));
}

/** A relationship target, resolved to a part name inside the archive. */
function resolvePart(target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  return `xl/${target.replace(/^\.\//, '')}`;
}

/** Relationship id -> target, from `xl/_rels/workbook.xml.rels`. */
function readWorkbookRels(entries: Map<string, { data: Uint8Array }>): Map<string, string> {
  const entry = entries.get('xl/_rels/workbook.xml.rels');
  if (!entry) throw new Error('Not a workbook: xl/_rels/workbook.xml.rels is missing');
  const xml = new TextDecoder().decode(entry.data);
  const rels = new Map<string, string>();
  for (const m of xml.matchAll(/<Relationship\b([^>]*)\/>/g)) {
    const id = attribute(m[1], 'Id');
    const target = attribute(m[1], 'Target');
    if (id && target) rels.set(id, target);
  }
  return rels;
}

/** Sheet name -> part name, in workbook order. Resolved through the relationships, because a
 * sheet's position in the workbook says nothing about which file holds it. */
function sheetParts(entries: Map<string, { data: Uint8Array }>, rels: Map<string, string>): Map<string, string> {
  const entry = entries.get('xl/workbook.xml');
  if (!entry) throw new Error('Not a workbook: xl/workbook.xml is missing');
  const xml = new TextDecoder().decode(entry.data);
  const parts = new Map<string, string>();
  for (const m of xml.matchAll(/<sheet\b([^>]*)\/>/g)) {
    const name = attribute(m[1], 'name');
    const relId = attribute(m[1], 'r:id') ?? attribute(m[1], 'id');
    if (!name || !relId) continue;
    const target = rels.get(relId);
    if (target) parts.set(unescapeXml(name), resolvePart(target));
  }
  return parts;
}

/** The round-trip stamp a workbook was generated with, or null when it carries none. */
export function readWorkbookFingerprint(bytes: Uint8Array): string | null {
  const entry = readZip(bytes).get('docProps/custom.xml');
  if (!entry) return null;
  const xml = new TextDecoder().decode(entry.data);
  const property = new RegExp(`<property\\b[^>]*name="${FINGERPRINT_PROPERTY}"[^>]*>([\\s\\S]*?)</property>`).exec(xml);
  if (!property) return null;
  return unescapeXml(/<vt:lpwstr>([\s\S]*?)<\/vt:lpwstr>/.exec(property[1])?.[1] ?? '') || null;
}

/** Every cell of every sheet, keyed by sheet name then by A1 reference. */
export function readWorkbookCells(bytes: Uint8Array): Map<string, Map<string, RawCell>> {
  const entries = readZip(bytes);
  const rels = readWorkbookRels(entries);
  const strings = sharedStrings(entries, rels);
  const out = new Map<string, Map<string, RawCell>>();

  for (const [sheetName, part] of sheetParts(entries, rels)) {
    const entry = entries.get(part);
    if (!entry) throw new Error(`Sheet "${sheetName}" points at ${part}, which the archive does not contain`);
    const xml = new TextDecoder().decode(entry.data);
    const cells = new Map<string, RawCell>();

    for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attribute(m[1], 'r');
      if (!ref) continue;
      const type = attribute(m[1], 't');
      const inner = m[2] ?? '';
      const formula = /<f\b[^>]*\/>/.test(inner)
        ? ''
        : (/<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/.exec(inner)?.[1] ?? undefined);

      if (formula !== undefined) {
        cells.set(ref, { ref, type, formula: unescapeXml(formula) });
        continue;
      }

      let text: string | undefined;
      if (type === 'inlineStr') text = joinTextRuns(inner);
      else {
        const value = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        if (value !== undefined) {
          text = type === 's' ? (strings[Number(value)] ?? '') : unescapeXml(value);
        }
      }
      cells.set(ref, { ref, type, text });
    }

    out.set(sheetName, cells);
  }

  return out;
}

/** What a cell says, or why it cannot be used. */
type Coerced = { value: string | number | boolean | undefined } | { error: string };

const BOOLEAN_WORDS: Record<string, boolean> = { TRUE: true, FALSE: false, '1': true, '0': false };

function coerce(raw: RawCell | undefined, valueType: ValueType): Coerced {
  const text = raw?.text;
  if (text === undefined || text.trim() === '') return { value: undefined };

  if (raw?.type === 'e') return { error: `holds the error ${text}; put a value there or clear the cell` };

  switch (valueType) {
    case 'string':
    case 'text':
    case 'rating':
      return { value: text };

    case 'boolean': {
      const word = raw?.type === 'b' ? (text === '1' ? 'TRUE' : 'FALSE') : text.trim().toUpperCase();
      const value = BOOLEAN_WORDS[word];
      return value === undefined ? { error: `must be TRUE or FALSE, not "${text}"` } : { value };
    }

    case 'date': {
      const asNumber = Number(text);
      // A number is a serial. Excel may or may not spell the type out as `n`, and a reader
      // that only accepted the unspelled form would call a saved date "not a date".
      if (Number.isFinite(asNumber) && (raw?.type === undefined || raw.type === 'n')) {
        const iso = serialToDate(asNumber);
        return iso === null ? { error: `${text} is not a date Excel can hold` } : { value: iso };
      }
      const iso = dateToSerial(text.trim()) === null ? null : text.trim().slice(0, 10);
      return iso === null ? { error: `must be a date, not "${text}"` } : { value: iso };
    }

    default: {
      const value = Number(text);
      if (!Number.isFinite(value)) return { error: `must be a number, not "${text}"` };
      // Whether a whole number is required is the schema's call, not this function's —
      // `schemaError` reads `type: integer` from the same place the validator does. Checking
      // it here as well would be a second opinion that could disagree.
      return { value };
    }
  }
}

/** Why the schema refuses this value at this path, or null. */
function schemaError(schema: unknown, jsonPath: string, value: string | number | boolean): string | null {
  const constraint = schemaConstraint(schema, jsonPath);
  if (!constraint) return null;

  if (constraint.enum && !constraint.enum.includes(String(value))) {
    return `must be one of ${constraint.enum.join(', ')} — not "${value}"`;
  }
  if (typeof value === 'number') {
    const { minimum, maximum } = constraint;
    if (minimum !== undefined && value < minimum) return `must be between ${minimum} and ${maximum ?? '∞'}`;
    if (maximum !== undefined && value > maximum) return `must be between ${minimum ?? '-∞'} and ${maximum}`;
  }
  if (constraint.type === 'integer' && typeof value === 'number' && !Number.isInteger(value)) {
    return `must be a whole number, not ${value}`;
  }
  return null;
}

const isBlank = (v: unknown) => v === undefined || v === null || v === '';

/** Numbers that came back through Excel are the same number a hair apart. */
function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

/** Whether the cell agrees with the deal — per type, because "the same" differs by type. */
function sameValue(current: unknown, next: string | number | boolean | undefined, valueType: ValueType): boolean {
  // An unscored element is written as 0, so a 0 in the sheet cannot be told from "not
  // assessed" and must not read back as a proposal to set 0 on every element that has none.
  if (valueType === 'score') {
    return (typeof current === 'number' ? current : 0) === (typeof next === 'number' ? next : 0);
  }
  if (isBlank(current) || isBlank(next)) return isBlank(current) && isBlank(next);
  if (valueType === 'date') {
    const a = dateToSerial(String(current));
    const b = dateToSerial(String(next));
    return a !== null && b !== null ? a === b : String(current) === String(next);
  }
  if (typeof next === 'number') return typeof current === 'number' && nearlyEqual(current, next);
  if (typeof next === 'boolean') return current === next;
  return String(current) === String(next);
}

export interface CellProposal {
  jsonPath: string;
  sheet: string;
  address: string;
  valueType: ValueType;
  /** `add` when the deal has no value there, `clear` when the cell was emptied. */
  kind: 'set' | 'add' | 'clear';
  from: unknown;
  to: unknown;
}

export interface CellRejection {
  /** Absent when the cell belongs to no field — which is itself the problem being reported. */
  jsonPath?: string;
  /** Both absent when the whole workbook was refused, rather than one cell in it. */
  sheet?: string;
  address?: string;
  reason: string;
}

const A1_REF = /^([A-Z]+)(\d+)$/;

/** Whether a cell holds anything at all — a formula counts, because a formula is content. */
function hasContent(cell: RawCell | undefined): boolean {
  if (!cell) return false;
  return cell.formula !== undefined || (cell.text !== undefined && cell.text.trim() !== '');
}

/**
 * Input cells for rows somebody added below the ones the plan maps.
 *
 * An Excel Table extends when you type under its last row, which is simply how you add a
 * stakeholder once the padded rows are used up. Those cells belong to no `jsonPath` in the plan, so
 * the paths are derived here from the table's geometry — the same `list[index].field` shape
 * `inputPathFor` builds, continuing from where the plan stopped.
 *
 * **A wholly blank row ends the scan.** Without that, a stray note a few rows under the table would
 * be read as a stakeholder; with it, anything past the gap falls to `reportUnmappedRows` and is
 * reported instead. Appending still obeys the array rule, so filling row 13 of a list holding four
 * items is refused for the holes it would leave, exactly as before.
 */
function growthCells(plan: WorkbookPlan, cells: Map<string, Map<string, RawCell>>): InputCell[] {
  const out: InputCell[] = [];

  for (const growth of plan.listGrowth) {
    const sheetCells = cells.get(growth.sheet);
    if (!sheetCells) continue;
    const lastRow = Math.max(0, ...[...sheetCells.keys()].map((ref) => Number(A1_REF.exec(ref)?.[2] ?? 0)));

    for (let row = growth.firstRow; row <= lastRow; row++) {
      const rowCells = growth.columns.map((column) => ({ ...column, address: A1(column.column, row) }));
      if (!rowCells.some((cell) => hasContent(sheetCells.get(cell.address)))) break;

      const index = growth.nextIndex + (row - growth.firstRow);
      for (const cell of rowCells) {
        out.push({
          jsonPath: `${growth.jsonPath}[${index}].${cell.relativePath}`,
          sheet: growth.sheet,
          address: cell.address,
          valueType: cell.valueType,
        });
      }
    }
  }

  return out;
}

/**
 * Report anything typed below the rows the workbook actually maps.
 *
 * The tables are padded with blank rows to grow into, and an Excel Table extends further still
 * the moment someone types under the last one — so a seller who runs out of padded stakeholder
 * rows just adds another, reasonably. Those cells belong to no `jsonPath`, and passing over
 * them without a word would be the legacy sheet's own bug in a new place: it formatted eight
 * team rows and dropped the rest. Better to refuse the run and say which cell.
 *
 * Only columns that hold inputs are considered, and only rows past the last input in that same
 * column. That is already enough to leave a Table's own extended formulas alone: they land in
 * computed columns, which hold no inputs and so are never examined. A formula in an *input*
 * column below the range is reported like any other content, because it is content, and losing
 * it quietly is the thing being prevented.
 */
function reportUnmappedRows(
  inputCells: readonly { sheet: string; address: string }[],
  cells: Map<string, Map<string, RawCell>>,
  rejections: CellRejection[],
): void {
  const lastMapped = new Map<string, number>();
  for (const input of inputCells) {
    const m = A1_REF.exec(input.address);
    if (!m) continue;
    const key = `${input.sheet}!${m[1]}`;
    lastMapped.set(key, Math.max(lastMapped.get(key) ?? 0, Number(m[2])));
  }

  for (const [sheetName, sheetCells] of cells) {
    for (const cell of sheetCells.values()) {
      const m = A1_REF.exec(cell.ref);
      if (!m) continue;
      const limit = lastMapped.get(`${sheetName}!${m[1]}`);
      if (limit === undefined || Number(m[2]) <= limit) continue;
      if (!hasContent(cell)) continue;
      const content = cell.formula === undefined ? (cell.text as string) : `=${cell.formula}`;
      rejections.push({
        sheet: sheetName,
        address: cell.ref,
        reason:
          `holds "${content}" below row ${limit}, the last row this workbook maps — ` +
          'add the entry to the deal JSON, then regenerate the workbook so it has room for it',
      });
    }
  }
}

export interface ReadReport {
  /** No cell was refused and the result validates. This is what an exit code should follow. */
  ok: boolean;
  cellsRead: number;
  unchanged: number;
  proposals: CellProposal[];
  rejections: CellRejection[];
  /** The deal with every accepted proposal applied. A copy — the input is never mutated. */
  deal: unknown;
  valid: boolean;
  errors: ValidationResult['errors'];
}

/**
 * Compare a workbook against the deal it came from.
 *
 * Proposals are applied to a copy as they are accepted, in the order the cells were laid out,
 * so that filling two consecutive blank rows of a table appends two items rather than
 * refusing the second for a gap that the first had already closed.
 *
 * The stamp is checked first and refuses the whole workbook, rather than every cell in turn:
 * if the addresses do not mean what this deal thinks they mean, no individual reading of one
 * is worth reporting.
 */
export function readWorkbook(schema: unknown, spec: WorkbookSpec, deal: unknown, bytes: Uint8Array): ReadReport {
  const plan = planWorkbook(schema, spec, deal);
  const working = JSON.parse(JSON.stringify(deal)) as unknown;

  const proposals: CellProposal[] = [];
  const rejections: CellRejection[] = [];
  let unchanged = 0;

  const stamp = readWorkbookFingerprint(bytes);
  const expected = workbookFingerprint(plan, deal);
  if (stamp !== expected) {
    return {
      ok: false,
      cellsRead: 0,
      unchanged: 0,
      proposals: [],
      rejections: [
        {
          reason:
            stamp === null
              ? 'this workbook carries no round-trip stamp — regenerate it from this deal before reading it back'
              : 'this workbook was generated from a different deal, or from this one before its rows moved — ' +
                'regenerate it from the current deal before reading it back',
        },
      ],
      deal: working,
      valid: true,
      errors: [],
    };
  }

  const cells = readWorkbookCells(bytes);
  // Grown rows come last, so the planned rows have already been applied and appending a new item
  // lands at the index the array has actually reached.
  const inputs = [...plan.inputCells, ...growthCells(plan, cells)];

  for (const input of inputs) {
    const { jsonPath, sheet, address, valueType } = input;
    const reject = (reason: string) => rejections.push({ jsonPath, sheet, address, reason });
    const sheetCells = cells.get(sheet);
    if (!sheetCells) {
      reject(`sheet "${sheet}" is not in this workbook`);
      continue;
    }

    const raw = sheetCells.get(address);
    if (raw?.formula !== undefined) {
      reject('holds a formula, and a computed number is not an answer — type a value or edit the JSON');
      continue;
    }

    const coerced = coerce(raw, valueType);
    if ('error' in coerced) {
      reject(coerced.error);
      continue;
    }

    const current = readPath(working, jsonPath);
    if (sameValue(current, coerced.value, valueType)) {
      unchanged++;
      continue;
    }

    if (coerced.value !== undefined) {
      const problem = schemaError(schema, jsonPath, coerced.value);
      if (problem) {
        reject(problem);
        continue;
      }
    }

    const failure = writePath(working, jsonPath, coerced.value);
    if (failure) {
      reject(failure);
      continue;
    }

    proposals.push({
      jsonPath,
      sheet,
      address,
      valueType,
      kind: coerced.value === undefined ? 'clear' : isBlank(current) ? 'add' : 'set',
      from: current,
      to: coerced.value === undefined ? null : coerced.value,
    });
  }

  reportUnmappedRows(inputs, cells, rejections);

  const validation = validateDeal(working, schema);
  return {
    ok: rejections.length === 0 && validation.valid,
    cellsRead: inputs.length,
    unchanged,
    proposals,
    rejections,
    deal: working,
    valid: validation.valid,
    errors: validation.errors,
  };
}
