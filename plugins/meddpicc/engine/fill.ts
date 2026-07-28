/**
 * Fill the shipped MEDDPICC template from a deal file.
 *
 * The template IS the format — fonts, borders, the 207 merged ranges, the Pick List
 * dropdowns, the `=N4*I5` Factored Pipe formula. So this module never draws anything; it
 * only puts values into cells the template already defines, and `zip.ts` guarantees every
 * other part of the workbook survives byte-for-byte.
 *
 * Two stages, deliberately separate:
 *   planFill(deal, mapping) -> {sheetName, cells:[{address, value}]}   pure, testable
 *   applyFill(templateBytes, plan) -> filled workbook bytes            I/O-free surgery
 *
 * The plan is also what the Excel task pane consumes: it writes the same cells through the
 * `write_cells` host tool into an open copy of the template, so both surfaces produce the
 * same workbook from one code path.
 */
import { readZip, writeZip } from './zip';

export type CellValue = string | number;

export interface PlannedCell {
  address: string;
  value: CellValue;
}

export interface FillPlan {
  sheetName: string;
  cells: PlannedCell[];
}

interface ScalarCell {
  jsonPath: string;
  cell: string;
  format?: string;
}
interface TextBlock {
  jsonPath: string;
  cell: string;
  line: string;
}
interface Mirrored {
  jsonPath: string;
  cells: string[];
}
interface TableSection {
  jsonPath: string;
  startRow: number;
  maxRows: number;
  columns: Record<string, string>;
  booleanFormat?: { true?: string; false?: string };
}
export interface CellMapping {
  sheetName?: string;
  cells?: ScalarCell[];
  textBlocks?: TextBlock[];
  mirrored?: Mirrored[];
  tables?: TableSection[];
}

/** Split "a.b[0].c" into ["a", "b", 0, "c"]. */
function tokenize(path: string): Array<string | number> {
  const tokens: Array<string | number> = [];
  for (const part of path.split('.')) {
    const m = part.match(/^([^[\]]*)((?:\[\d+\])*)$/);
    if (!m) {
      tokens.push(part);
      continue;
    }
    if (m[1]) tokens.push(m[1]);
    for (const idx of m[2].match(/\d+/g) ?? []) tokens.push(Number(idx));
  }
  return tokens;
}

function readPath(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const tok of tokenize(path)) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof tok === 'number') {
      if (!Array.isArray(cur)) return undefined;
      cur = cur[tok];
      continue;
    }
    if (typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[tok];
  }
  return cur;
}

/**
 * Neutralise spreadsheet formula injection.
 *
 * A deal file is assembled from call notes, emails and OSINT reports — text this plugin did
 * not author. Excel executes a cell opening with `=`, `+`, `-` or `@` when the file opens,
 * so it is prefixed with an apostrophe, the standard escape.
 */
function sanitize(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** Coerce a JSON value for a cell, or null to leave the template's cell alone. */
function toCell(value: unknown, booleanFormat?: TableSection['booleanFormat']): CellValue | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean')
    return sanitize(value ? (booleanFormat?.true ?? 'Yes') : (booleanFormat?.false ?? 'No'));
  if (typeof value === 'string') return value.trim() === '' ? null : sanitize(value);
  if (Array.isArray(value)) {
    const parts = value.map((v) => toCell(v, booleanFormat)).filter((v): v is CellValue => v !== null);
    return parts.length > 0 ? sanitize(parts.join('; ')) : null;
  }
  return null;
}

/** Render `{field}` placeholders from one array item, dropping absent fields cleanly. */
function renderLine(template: string, item: unknown): string {
  return template
    .replace(/\{(\w+)\}/g, (_, key: string) => {
      const v = readPath(item, key);
      return v === null || v === undefined ? '' : String(v);
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build the cell plan. Values only — the template supplies every label, heading and
 * question, so anything the deal has not answered is simply left out and the template's
 * blank cell stands.
 */
export function planFill(deal: unknown, mapping: CellMapping): FillPlan {
  const cells: PlannedCell[] = [];
  const push = (address: string, value: CellValue | null): void => {
    if (value !== null) cells.push({ address, value });
  };

  for (const f of mapping.cells ?? []) push(f.cell, toCell(readPath(deal, f.jsonPath)));

  for (const b of mapping.textBlocks ?? []) {
    const items = readPath(deal, b.jsonPath);
    if (!Array.isArray(items) || items.length === 0) continue;
    const lines = items.map((i) => renderLine(b.line, i)).filter((l) => l !== '');
    if (lines.length > 0) push(b.cell, sanitize(lines.join('\n')));
  }

  for (const m of mapping.mirrored ?? []) {
    const v = toCell(readPath(deal, m.jsonPath));
    for (const address of m.cells) push(address, v);
  }

  for (const t of mapping.tables ?? []) {
    const items = readPath(deal, t.jsonPath);
    if (!Array.isArray(items)) continue;
    // maxRows is the template's real formatted extent; spilling past it lands on
    // unstyled cells and looks broken, so extra items are dropped.
    items.slice(0, t.maxRows).forEach((item, i) => {
      for (const [field, col] of Object.entries(t.columns)) {
        push(`${col}${t.startRow + i}`, toCell(readPath(item, field), t.booleanFormat));
      }
    });
  }

  return { sheetName: mapping.sheetName ?? 'Sheet1', cells };
}

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);
}

/**
 * Replace one cell's value in a worksheet XML string, preserving its `s=` style index.
 *
 * The template defines every value cell up front — `<c r="C4" s="18"/>` for a blank one,
 * `<c r="N7" s="43"><v>0</v></c>` for a numeric placeholder — so a fill is a substitution,
 * not an insertion, and the style attribute is carried through untouched. Strings are
 * written as inline strings so `sharedStrings.xml` never has to change.
 *
 * Throws on an address the sheet does not define: a silently skipped cell would produce a
 * report with a field missing and no indication why.
 */
export function setCellValue(sheetXml: string, address: string, value: CellValue): string {
  // `r="C4"` must not also match `r="C41"`, hence the closing quote in the pattern.
  const pattern = new RegExp(`<c r="${address}"([^>]*?)(/>|>.*?</c>)`, 's');
  const match = sheetXml.match(pattern);
  if (!match) throw new Error(`Cell ${address} is not defined in the worksheet — the template may have changed`);

  const attrs = match[1].replace(/\s*t="[^"]*"/g, ''); // drop any old type; we set our own
  const body =
    typeof value === 'number'
      ? `<c r="${address}"${attrs}><v>${value}</v></c>`
      : `<c r="${address}"${attrs} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
  return sheetXml.slice(0, match.index) + body + sheetXml.slice((match.index ?? 0) + match[0].length);
}

/** The worksheet part a single-sheet-of-interest fill targets. */
const SHEET_PART = 'xl/worksheets/sheet1.xml';

/**
 * Apply a plan to the template's bytes and return the filled workbook.
 *
 * Only `xl/worksheets/sheet1.xml` is rewritten; every other part is copied as its original
 * compressed bytes, so styles, merges, data validation and the Pick List cannot drift.
 */
export function applyFill(templateBytes: Uint8Array, plan: FillPlan): Uint8Array {
  const entries = readZip(templateBytes);
  const sheet = entries.get(SHEET_PART);
  if (!sheet) throw new Error(`Template is missing ${SHEET_PART}`);

  let xml = new TextDecoder().decode(sheet.data);
  for (const cell of plan.cells) xml = setCellValue(xml, cell.address, cell.value);

  return writeZip(
    [...entries].map(([name, entry]) =>
      name === SHEET_PART ? { name, data: new TextEncoder().encode(xml) } : { name, raw: entry },
    ),
  );
}
