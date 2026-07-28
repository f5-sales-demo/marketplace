/**
 * A small OOXML writer: enough of the `.xlsx` format to emit a real, formula-driven
 * workbook from scratch.
 *
 * `fill.ts` injects values into a template someone else authored. This builds the workbook
 * itself, which is what a formula-driven sheet needs — formulas, named styles and (later)
 * tables and conditional formatting have to be authored, not injected.
 *
 * The hard part of hand-writing xlsx is `styles.xml`: cells reference styles by INDEX into
 * `cellXfs`, so an off-by-one silently mis-styles every cell after the gap, and a dangling
 * `numFmtId` makes Excel offer to repair the file. Both are addressed the same way — a
 * fixed, named palette (see {@link STYLE_IDS}) whose indexes are derived from one ordered
 * list, with tests asserting the count matches and every custom format is defined. Callers
 * name a style; they never write an index.
 *
 * Strings are written inline (`t="inlineStr"`) rather than through `sharedStrings.xml`.
 * That trades a little file size for one fewer part to keep consistent, and it is the same
 * choice `fill.ts` already makes.
 */
import { writeZip } from './zip';

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL_DOC = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_REL_PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';

/** Custom number formats start at 164; below that the ids are reserved by the format. */
const NUMFMT_CURRENCY = 164;
const NUMFMT_PERCENT = 165;
const NUMFMT_DATE = 166;

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

export function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);
}

/** 1 -> "A", 26 -> "Z", 27 -> "AA". */
export function columnLetter(oneBased: number): string {
  let n = Math.max(1, oneBased);
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Compose an A1 reference from 1-based column and row. */
export function A1(col: number, row: number): string {
  return `${columnLetter(col)}${row}`;
}

/**
 * The style palette, in `cellXfs` order — the index of each name IS its `s=` attribute.
 *
 * Deliberately small and fixed. Arbitrary per-cell formatting would mean generating fonts,
 * fills and borders on demand and keeping four parallel indexes correct; a curated palette
 * covers what a deal review needs and can be read and reviewed in one screen.
 */
const STYLE_ORDER = [
  'default',
  'title',
  'sectionHeader',
  'columnHeader',
  'label',
  'text',
  'number',
  'currency',
  'percent',
  'date',
  'score',
  'ragRed',
  'ragAmber',
  'ragGreen',
  'muted',
] as const;

export type StyleName = (typeof STYLE_ORDER)[number];

/** Name -> `cellXfs` index. Derived from one list so the two cannot drift. */
export const STYLE_IDS: Record<StyleName, number> = Object.fromEntries(
  STYLE_ORDER.map((name, i) => [name, i]),
) as Record<StyleName, number>;

/** Font index per style, into the `<fonts>` list below. */
const FONT_DEFAULT = 0;
const FONT_BOLD = 1;
const FONT_TITLE = 2;
const FONT_WHITE_BOLD = 3;
const FONT_ITALIC_GREY = 4;

/** Fill index per style, into the `<fills>` list below. */
const FILL_NONE = 0;
// index 1 is the format-reserved gray125 placeholder; Excel expects it present and unused
const FILL_DARK = 2;
const FILL_HEADER = 3;
const FILL_RED = 4;
const FILL_AMBER = 5;
const FILL_GREEN = 6;

interface StyleDef {
  font: number;
  fill: number;
  numFmt: number;
  wrap?: boolean;
  center?: boolean;
}

const STYLE_DEFS: Record<StyleName, StyleDef> = {
  default: { font: FONT_DEFAULT, fill: FILL_NONE, numFmt: 0 },
  title: { font: FONT_TITLE, fill: FILL_NONE, numFmt: 0 },
  sectionHeader: { font: FONT_WHITE_BOLD, fill: FILL_DARK, numFmt: 0 },
  columnHeader: { font: FONT_BOLD, fill: FILL_HEADER, numFmt: 0 },
  label: { font: FONT_BOLD, fill: FILL_NONE, numFmt: 0 },
  text: { font: FONT_DEFAULT, fill: FILL_NONE, numFmt: 0, wrap: true },
  number: { font: FONT_DEFAULT, fill: FILL_NONE, numFmt: 0 },
  currency: { font: FONT_DEFAULT, fill: FILL_NONE, numFmt: NUMFMT_CURRENCY },
  percent: { font: FONT_DEFAULT, fill: FILL_NONE, numFmt: NUMFMT_PERCENT },
  date: { font: FONT_DEFAULT, fill: FILL_NONE, numFmt: NUMFMT_DATE },
  score: { font: FONT_BOLD, fill: FILL_NONE, numFmt: 0, center: true },
  ragRed: { font: FONT_BOLD, fill: FILL_RED, numFmt: 0, center: true },
  ragAmber: { font: FONT_BOLD, fill: FILL_AMBER, numFmt: 0, center: true },
  ragGreen: { font: FONT_BOLD, fill: FILL_GREEN, numFmt: 0, center: true },
  muted: { font: FONT_ITALIC_GREY, fill: FILL_NONE, numFmt: 0 },
};

function stylesXml(): string {
  const fonts = [
    '<font><sz val="11"/><name val="Calibri"/></font>',
    '<font><b/><sz val="11"/><name val="Calibri"/></font>',
    '<font><b/><sz val="16"/><name val="Calibri"/></font>',
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>',
    '<font><i/><sz val="10"/><color rgb="FF6B6B6B"/><name val="Calibri"/></font>',
  ];
  const fills = [
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FF1F3864"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFD9E2F3"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF8CBAD"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFE699"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFC6E0B4"/><bgColor indexed="64"/></patternFill></fill>',
  ];
  const border =
    '<border><left style="thin"><color rgb="FFD0D0D0"/></left><right style="thin"><color rgb="FFD0D0D0"/></right>' +
    '<top style="thin"><color rgb="FFD0D0D0"/></top><bottom style="thin"><color rgb="FFD0D0D0"/></bottom><diagonal/></border>';

  const xfs = STYLE_ORDER.map((name) => {
    const d = STYLE_DEFS[name];
    const align =
      d.wrap || d.center
        ? `<alignment${d.wrap ? ' wrapText="1" vertical="top"' : ''}${d.center ? ' horizontal="center"' : ''}/>`
        : '';
    const applies = `${d.numFmt ? ' applyNumberFormat="1"' : ''}${d.font ? ' applyFont="1"' : ''}${d.fill ? ' applyFill="1"' : ''}${align ? ' applyAlignment="1"' : ''}`;
    return `<xf numFmtId="${d.numFmt}" fontId="${d.font}" fillId="${d.fill}" borderId="1" xfId="0"${applies}>${align}</xf>`;
  });

  return (
    `${XML_HEADER}<styleSheet xmlns="${NS_MAIN}">` +
    `<numFmts count="3">` +
    `<numFmt numFmtId="${NUMFMT_CURRENCY}" formatCode="&quot;$&quot;#,##0"/>` +
    `<numFmt numFmtId="${NUMFMT_PERCENT}" formatCode="0.0%"/>` +
    `<numFmt numFmtId="${NUMFMT_DATE}" formatCode="yyyy-mm-dd"/>` +
    `</numFmts>` +
    `<fonts count="${fonts.length}">${fonts.join('')}</fonts>` +
    `<fills count="${fills.length}">${fills.join('')}</fills>` +
    // borderId 0 must exist and be empty; ours is index 1.
    `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>${border}</borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`
  );
}

/** One cell: a literal value, or a formula, or both omitted for a styled blank. */
export interface CellSpec {
  ref: string;
  value?: string | number | boolean;
  formula?: string;
  style?: StyleName;
}

export interface RowSpec {
  row: number;
  cells: CellSpec[];
  height?: number;
}

export interface SheetSpec {
  name: string;
  rows: RowSpec[];
  /** Column widths, 1-based index -> width in characters. */
  columns?: { min: number; max: number; width: number }[];
  /** Freeze everything above this row (a header freeze). */
  freezeAtRow?: number;
}

function cellXml(cell: CellSpec): string {
  const style = cell.style;
  if (style !== undefined && !(style in STYLE_IDS)) {
    throw new Error(`Unknown style "${style}" for cell ${cell.ref} — add it to STYLE_ORDER or use an existing name`);
  }
  const s = style === undefined ? '' : ` s="${STYLE_IDS[style]}"`;

  if (cell.formula !== undefined) {
    // No cached <v>: Excel computes on open. Writing a value we guessed would be worse —
    // it would show a stale number until something forced a recalculation.
    return `<c r="${cell.ref}"${s}><f>${escapeXml(cell.formula)}</f></c>`;
  }
  if (cell.value === undefined) return `<c r="${cell.ref}"${s}/>`;
  if (typeof cell.value === 'number') {
    if (!Number.isFinite(cell.value)) throw new Error(`Cell ${cell.ref} has a non-finite number`);
    return `<c r="${cell.ref}"${s}><v>${cell.value}</v></c>`;
  }
  if (typeof cell.value === 'boolean') return `<c r="${cell.ref}"${s} t="b"><v>${cell.value ? 1 : 0}</v></c>`;
  return `<c r="${cell.ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell.value)}</t></is></c>`;
}

function sheetXml(sheet: SheetSpec): string {
  const cols = sheet.columns?.length
    ? `<cols>${sheet.columns.map((c) => `<col min="${c.min}" max="${c.max}" width="${c.width}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const pane = sheet.freezeAtRow
    ? `<pane ySplit="${sheet.freezeAtRow}" topLeftCell="A${sheet.freezeAtRow + 1}" activePane="bottomLeft" state="frozen"/>`
    : '';
  const rows = sheet.rows
    .map(
      (r) =>
        `<row r="${r.row}"${r.height ? ` ht="${r.height}" customHeight="1"` : ''}>${r.cells.map(cellXml).join('')}</row>`,
    )
    .join('');
  return (
    `${XML_HEADER}<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL_DOC}">` +
    `<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>${cols}` +
    `<sheetData>${rows}</sheetData>` +
    `</worksheet>`
  );
}

/**
 * Build a complete `.xlsx` from sheet specs.
 *
 * Every part Excel requires is emitted together — the container, the relationships, the
 * workbook, the styles and one worksheet per sheet — because a sheet present in the zip but
 * absent from `[Content_Types].xml` (or missing its relationship) is the usual cause of
 * Excel's "we found a problem with some content" prompt.
 */
export function buildWorkbook(sheets: readonly SheetSpec[]): Uint8Array {
  if (sheets.length === 0) throw new Error('A workbook needs at least one sheet');

  const enc = (s: string) => new TextEncoder().encode(s);
  const sheetPath = (i: number) => `xl/worksheets/sheet${i + 1}.xml`;

  const contentTypes =
    `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    sheets
      .map(
        (_, i) =>
          `<Override PartName="/${sheetPath(i)}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join('') +
    `</Types>`;

  const rootRels =
    `${XML_HEADER}<Relationships xmlns="${NS_REL_PKG}">` +
    `<Relationship Id="rId1" Type="${NS_REL_DOC}/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  // Sheets take rId1..rIdN; styles takes the next id after them.
  const stylesRelId = `rId${sheets.length + 1}`;
  const workbookRels =
    `${XML_HEADER}<Relationships xmlns="${NS_REL_PKG}">` +
    sheets
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="${NS_REL_DOC}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join('') +
    `<Relationship Id="${stylesRelId}" Type="${NS_REL_DOC}/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  const workbook =
    `${XML_HEADER}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL_DOC}">` +
    `<sheets>` +
    sheets.map((s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
    `</sheets></workbook>`;

  return writeZip([
    { name: '[Content_Types].xml', data: enc(contentTypes) },
    { name: '_rels/.rels', data: enc(rootRels) },
    { name: 'xl/workbook.xml', data: enc(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc(workbookRels) },
    { name: 'xl/styles.xml', data: enc(stylesXml()) },
    ...sheets.map((s, i) => ({ name: sheetPath(i), data: enc(sheetXml(s)) })),
  ]);
}
