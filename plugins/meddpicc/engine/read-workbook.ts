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
import {
  anchorTextHash,
  BOOLEAN_NO,
  BOOLEAN_YES,
  dateToSerial,
  type InputCell,
  planWorkbook,
  schemaHash,
  type WorkbookPlan,
  workbookFingerprint,
} from './generate';
import { readPath, writePath } from './json-path';
import { canonicalEnumValue } from './labels';
import { schemaConstraint } from './schema-path';
import { type ValidationResult, validateDeal } from './validate';
import type { ValueType, WorkbookSpec } from './workbook-spec';
import { ANCHOR_TEXT_PROPERTY, FINGERPRINT_PROPERTY, SCHEMA_HASH_PROPERTY } from './xlsx';
import { readZip } from './zip';

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;
/** 9999-12-31. Beyond this Excel has no date, and neither has anything downstream. */
const MAX_SERIAL = 2_958_465;
/** How many moved labels to name. Past a handful the list stops informing and starts scrolling. */
const MAX_REPORTED_ANCHORS = 5;

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

/**
 * One custom document property, by name.
 *
 * The name is matched exactly, closing quote and all: the properties share a single XML file, so a
 * pattern that merely starts with the name would happily return a neighbour's value — asking for
 * `Meddpicc` and getting the fingerprint.
 */
export function readWorkbookProperty(bytes: Uint8Array, name: string): string | null {
  const entry = readZip(bytes).get('docProps/custom.xml');
  if (!entry) return null;
  const xml = new TextDecoder().decode(entry.data);
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const property = new RegExp(`<property\\b[^>]*name="${escaped}"[^>]*>([\\s\\S]*?)</property>`).exec(xml);
  if (!property) return null;
  return unescapeXml(/<vt:lpwstr>([\s\S]*?)<\/vt:lpwstr>/.exec(property[1])?.[1] ?? '') || null;
}

/** The round-trip stamp a workbook was generated with, or null when it carries none. */
export function readWorkbookFingerprint(bytes: Uint8Array): string | null {
  return readWorkbookProperty(bytes, FINGERPRINT_PROPERTY);
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

/**
 * Every spelling of a boolean a person or Excel might leave in a cell.
 *
 * The workbook writes "Yes"/"No" because a deal review is read by people, but Excel writes TRUE/FALSE
 * when it stores a real boolean and a user may type either — or Y/N, which is what anyone in a hurry
 * types. Accepting all of them costs nothing; refusing "Yes" in a sheet that offered it in a dropdown
 * would be indefensible.
 */
/**
 * The only two spellings a boolean cell may hold — the two the dropdown offers, and the two the
 * scorecard counts.
 *
 * TRUE, Y and 1 were accepted here once, on the reasoning that a reader should be forgiving. They
 * cannot be: `COUNTIF(range,"Yes")` counts the WORD, so accepting one of them put the deal and the
 * sheet in front of it into disagreement — the cell read TRUE, the count beside it did not include it,
 * and nothing said so until the workbook was regenerated. A plausible-looking, wrong deal review is
 * worse than a refusal that names the cell.
 *
 * Excel turns a typed TRUE into a logical value stored as `t="b"`, which `coerce` renders as the text
 * "TRUE" — so the same rule covers both the typed and the stored form.
 */
const BOOLEAN_WORDS: Record<string, boolean> = {
  [BOOLEAN_YES.toUpperCase()]: true,
  [BOOLEAN_NO.toUpperCase()]: false,
};

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
      return value === undefined
        ? { error: `must be ${BOOLEAN_YES} or ${BOOLEAN_NO}, not "${text}" — those are the two the dropdown offers` }
        : { value };
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

/**
 * One cell in the DEAL's own terms: coerced by type, then an enum label mapped back to its token.
 *
 * The translation belongs here rather than at the call site because more than one caller compares a
 * cell against the deal. The cell shows a label — "In progress" — and the deal holds `in_progress`;
 * comparing those two directly makes every generated workbook read back as an edit on its own status
 * cells, and made the re-order guard silently exempt every column the workbook displays differently.
 * Either spelling is accepted: a rep may type what the dropdown offers or what they have seen in the
 * JSON.
 */
function readCell(raw: RawCell | undefined, valueType: ValueType, schema: unknown, jsonPath: string): Coerced {
  const coerced = coerce(raw, valueType);
  if ('error' in coerced) return coerced;
  if (typeof coerced.value === 'string') {
    const enumeration = schemaConstraint(schema, jsonPath)?.enum;
    if (enumeration) {
      const canonical = canonicalEnumValue(coerced.value);
      if (canonical !== undefined && enumeration.includes(canonical)) return { value: canonical };
    }
  }
  return coerced;
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

/** Whether a cell holds anything at all — a formula counts, because a formula is content. */
function hasContent(cell: RawCell | undefined): boolean {
  if (!cell) return false;
  return cell.formula !== undefined || (cell.text !== undefined && cell.text.trim() !== '');
}

/**
 * Columns of a list whose values are the same set in a different order.
 *
 * Grouped from `inputCells` alone — `stakeholders[3].name` says both which list column it belongs to and
 * which row — so this needs no new spec surface and covers every list the same way.
 *
 * Blanks are excluded from both sides: a padded row holds nothing, and a cleared cell is a real edit
 * that changes the set. Two or more positions must differ, because one differing position cannot be a
 * permutation of the same values.
 */
function reorderedColumns(
  plan: WorkbookPlan,
  deal: unknown,
  cells: Map<string, Map<string, RawCell>>,
  schema: unknown,
): CellRejection[] {
  /** `list[].field` -> the cells of that column, in row order. */
  const columns = new Map<string, InputCell[]>();
  for (const input of plan.inputCells) {
    const parts = /^(.*)\[(\d+)\]\.(.+)$/.exec(input.jsonPath);
    if (!parts) continue;
    const key = `${parts[1]}[].${parts[3]}`;
    const list = columns.get(key) ?? [];
    list.push(input);
    columns.set(key, list);
  }

  /** A value as a string that can be compared with another, blank for "nothing here". */
  const comparable = (value: unknown) =>
    value === undefined || value === null ? '' : typeof value === 'string' ? value.trim() : String(value);

  const out: CellRejection[] = [];
  for (const [key, column] of columns) {
    if (column.length < 2) continue;
    // Free text only for the displaced-value rule below: a small set of possible values makes
    // "landed on another row's value" the ordinary result of an ordinary edit.
    const first = column[0];
    const freeText =
      (first.valueType === 'string' || first.valueType === 'text') &&
      schemaConstraint(schema, first.jsonPath)?.enum === undefined;
    const inSheet: string[] = [];
    const inDeal: string[] = [];
    let differing = 0;
    let unreadable = false;
    for (const cell of column) {
      // In the DEAL's terms, not the sheet's. Comparing raw text against the deal left every column
      // the workbook displays differently — every enum, boolean and date — silently unchecked, because
      // "In progress" and `in_progress` can never form the same multiset.
      const read = readCell(cells.get(cell.sheet)?.get(cell.address), cell.valueType, schema, cell.jsonPath);
      if ('error' in read) {
        // A value this reader cannot make sense of is rejected by the main loop with a better message
        // than this guard could give, so leave the whole column to it.
        unreadable = true;
        break;
      }
      const text = comparable(read.value);
      const current = comparable(readPath(deal, cell.jsonPath));
      if (text !== current) differing++;
      if (text !== '') inSheet.push(text);
      if (current !== '') inDeal.push(current);
    }
    if (unreadable || differing < 2) continue;

    // The exact case: the same values, re-ordered.
    const permuted =
      inSheet.length === inDeal.length && [...inSheet].sort().every((v, i) => v === [...inDeal].sort()[i]);

    // And the case that defeats it: sort a column, then edit one of the moved values, and the multiset
    // no longer matches. So a value that has landed on ANOTHER row's former value counts as displaced,
    // and two displaced values in one column is a rearrangement.
    //
    // Only for free text. A status column has three possible values, so setting two milestones to a
    // status a third already had is both ordinary and indistinguishable from a rearrangement by this
    // rule — refusing it would block real work. Two people swapping into each other's names is not
    // ordinary, and that is the difference.
    const displaced = freeText ? countDisplaced(column, cells, deal, schema) : 0;

    if (!permuted && displaced < 2) continue;
    out.push({
      jsonPath: key,
      sheet: column[0].sheet,
      address: column[0].address,
      reason: permuted
        ? `this column holds the same ${inSheet.length} values in a different order, so a sort or a paste ` +
          'has detached them from the rest of their rows — the other columns did not move with them. ' +
          'Regenerate the workbook from the deal rather than rearranging it'
        : `${displaced} values in this column now sit where another row's value used to, so a sort or a ` +
          'paste has detached them from the rest of their rows. Regenerate the workbook from the deal ' +
          'rather than rearranging it',
    });
  }
  return out;
}

/**
 * How many of a column's changed cells now hold a value that belonged to a DIFFERENT row.
 *
 * The signature of a rearrangement that has been partly edited afterwards. Counted per cell rather
 * than as a set comparison, so one edited value among the moved ones does not hide the rest.
 */
function countDisplaced(
  column: InputCell[],
  cells: Map<string, Map<string, RawCell>>,
  deal: unknown,
  schema: unknown,
): number {
  const comparable = (value: unknown) =>
    value === undefined || value === null ? '' : typeof value === 'string' ? value.trim() : String(value);
  const held = column.map((cell) => comparable(readPath(deal, cell.jsonPath)));
  let displaced = 0;
  for (const [index, cell] of column.entries()) {
    const read = readCell(cells.get(cell.sheet)?.get(cell.address), cell.valueType, schema, cell.jsonPath);
    if ('error' in read) return 0;
    const now = comparable(read.value);
    if (now === '' || now === held[index]) continue;
    // Somewhere else in this column, some other row used to hold exactly this.
    if (held.some((value, other) => other !== index && value !== '' && value === now)) displaced++;
  }
  return displaced;
}

/**
 * Report content in cells the workbook never wrote.
 *
 * The purpose is to catch a person typing where there is no room — a stakeholder in the row below the
 * last spare one, a note wandering off the side — rather than dropping it silently, which is the bug
 * the legacy sheet had. A list's room is the padded rows the generator laid out and nothing beyond
 * them, so this is the whole of the answer for overflow: there is no scan below a table to read those
 * rows, because on one sheet the rows below a table belong to the next section.
 *
 * It used to guess, flagging anything below the deepest mapped row of a column. That held while every
 * table had a sheet to itself. On one laid-out sheet it produced 77 false rejections in a row,
 * because the Scorecard and the Salesforce block legitimately sit below the tables in the same
 * columns. The plan already knows exactly which cells it wrote, so ask it.
 */
function reportUnmappedRows(
  plan: WorkbookPlan,
  cells: Map<string, Map<string, RawCell>>,
  rejections: CellRejection[],
): void {
  const written = new Set(plan.writtenCells);
  for (const [sheetName, sheetCells] of cells) {
    for (const cell of sheetCells.values()) {
      if (written.has(`${sheetName}!${cell.ref}`)) continue;
      if (!hasContent(cell)) continue;
      const content = cell.formula === undefined ? (cell.text as string) : `=${cell.formula}`;
      rejections.push({
        sheet: sheetName,
        address: cell.ref,
        reason:
          `holds "${content}" in a cell this workbook does not map — ` +
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
  /**
   * Things worth saying that are not refusals.
   *
   * The schema drifting since the workbook was written is the one this exists for. It is not a
   * reason to refuse — nearly every schema change is additive and harmless — but it is the
   * explanation for the one case that looks like a bug: a dropdown offering a value the schema no
   * longer allows, so the sheet suggests something and the read then rejects it.
   */
  notes: string[];
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

  // Said, not enforced. Nearly every schema change is additive and harmless, so a difference is no
  // reason to refuse a workbook — but it is the explanation for the one symptom that looks like a
  // bug: a dropdown offering a value the schema no longer allows, so the sheet suggests something
  // and the read then rejects it by cell address with no hint as to why.
  const notes: string[] = [];
  const wroteAgainst = readWorkbookProperty(bytes, SCHEMA_HASH_PROPERTY);
  const now = schemaHash(schema);
  if (wroteAgainst !== null && wroteAgainst !== now) {
    notes.push(
      `this workbook was generated against a different schema (${wroteAgainst.slice(0, 12)}, now ${now.slice(0, 12)}) — ` +
        'its dropdowns and labels are the older ones, so a value it offered may no longer be allowed',
    );
  }

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
      notes,
    };
  }

  const cells = readWorkbookCells(bytes);

  // Every address below is only meaningful while the rows are where the generator put them. The stamp
  // cannot see a change made INSIDE the workbook: re-order two element rows — which is what tidying a
  // sheet looks like — and each element is handed its neighbour's score, with no rejection and `ok`
  // true. Measured, before this: swapping the first and last element rows proposed metrics 3 → 2 and
  // competition 2 → 3, and `--apply` would have written both.
  //
  // So the labels the plan wrote are checked first, and a mismatch refuses the WHOLE workbook rather
  // than reporting cell by cell. A sheet whose rows have moved has no correct partial reading: every
  // address below the first shift is wrong, and reporting one of them would invite applying the rest.
  const moved = plan.anchors
    .filter((anchor) => {
      const text = cells.get(anchor.sheet)?.get(anchor.address)?.text;
      return (text ?? '').trim() !== anchor.text.trim();
    })
    .slice(0, MAX_REPORTED_ANCHORS);
  if (moved.length > 0) {
    // The same symptom has two causes, and until the workbook recorded its anchor text there was no
    // way to tell them apart. Either the sheet's rows moved under the labels, or the labels themselves
    // were revised — a retranslation moves no cell, so the fingerprint still matches exactly.
    //
    // Naming the wrong one is not harmless: "no cell can be trusted to be the one it was" sends
    // somebody looking for an edit they did not make, and the sheet in front of them looks untouched.
    const wroteText = readWorkbookProperty(bytes, ANCHOR_TEXT_PROPERTY);
    const advice = 'Regenerate it from the current deal, then make the edit again';
    let cause: string;
    if (wroteText === null) {
      // Generated before this property existed, so the workbook cannot answer. Name both
      // possibilities rather than picking one: the advice is the same either way, and asserting the
      // wrong one sends somebody hunting for an edit they never made.
      cause =
        'either the rows have moved or these labels were revised since it was generated, and this ' +
        `workbook predates the stamp that would tell which. ${advice}`;
    } else if (wroteText === anchorTextHash(plan)) {
      cause =
        'the rows appear to have moved, so no cell in this workbook can be trusted to be the one it ' +
        `was. ${advice}`;
    } else {
      // Nothing has necessarily moved — but the labels were the evidence that nothing had, and they
      // no longer match, so there is nothing left to certify the addresses with.
      cause =
        'these labels were revised after this workbook was generated. Its cells are probably still ' +
        'where you left them, but the labels can no longer confirm that, so it cannot be read back ' +
        `safely. ${advice}`;
    }
    return {
      ok: false,
      cellsRead: 0,
      unchanged: 0,
      proposals: [],
      rejections: moved.map((anchor) => ({
        sheet: anchor.sheet,
        address: anchor.address,
        reason: `should still read "${anchor.text}" but does not — ${cause}`,
      })),
      deal: working,
      valid: true,
      errors: [],
      notes,
    };
  }

  // A column of a list, re-ordered.
  //
  // A list row has no identity beyond its position, so nothing anchors it — row one is simply the first
  // stakeholder. That leaves one real hazard: sorting or pasting a SINGLE column detaches its values
  // from the rest of their rows, and a faithful reader then writes the scrambled pairing into the deal,
  // losing the original on `--apply`. Measured before this guard: swapping two stakeholder names gave
  // `ok` true, no rejections, and David Park ended up with Sarah Chen's title.
  //
  // The signal is precise. A column holding the SAME SET of values in a DIFFERENT ORDER has been
  // re-ordered — nobody edits two people's names into each other's, and no ordinary edit leaves the
  // multiset unchanged. So that pattern is refused by name while every real edit, which changes the
  // set, passes untouched.
  const reordered = reorderedColumns(plan, working, cells, schema);
  if (reordered.length > 0) {
    return {
      ok: false,
      cellsRead: 0,
      unchanged: 0,
      proposals: [],
      rejections: reordered,
      deal: working,
      valid: true,
      errors: [],
      notes,
    };
  }

  const inputs = plan.inputCells;

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

    const coerced = readCell(raw, valueType, schema, jsonPath);
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

  reportUnmappedRows(plan, cells, rejections);

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
    notes,
  };
}
