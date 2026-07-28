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

/**
 * Conditional-format fills, in `dxfs` order — the index of each name IS its `dxfId`.
 * Same discipline as the cell-style palette: one ordered list, indexes derived from it.
 */
const DXF_ORDER = ['red', 'amber', 'green'] as const;
type DxfName = (typeof DXF_ORDER)[number];
const DXF_FILLS: Record<DxfName, string> = { red: 'FFF8CBAD', amber: 'FFFFE699', green: 'FFC6E0B4' };
export const DXF_IDS: Record<DxfName, number> = Object.fromEntries(DXF_ORDER.map((name, i) => [name, i])) as Record<
  DxfName,
  number
>;

/**
 * The conditional-format presets a sheet may ask for, by name.
 *
 * A curated set rather than arbitrary rules, for the same reason the style palette is
 * curated: each one is a few lines of XML that either matches Excel's schema or makes it
 * offer to repair the file, and three reviewable presets beat a general rule compiler.
 *
 * `%FIRST%` is replaced with the first cell of the range, which is how an expression rule
 * refers to "this cell" — Excel evaluates it relatively across the range.
 */
export type CfPreset = 'score' | 'ragText' | 'statusText' | 'overdueDate';

interface CfRule {
  type: string;
  operator?: string;
  formulas: string[];
  dxf: DxfName;
}

const CF_PRESETS: Record<CfPreset, CfRule[]> = {
  // A 0-4 element score. Matches how the engine reads them: 0-1 bad, 2 partial, 3-4 good.
  score: [
    { type: 'cellIs', operator: 'lessThan', formulas: ['2'], dxf: 'red' },
    { type: 'cellIs', operator: 'equal', formulas: ['2'], dxf: 'amber' },
    { type: 'cellIs', operator: 'greaterThanOrEqual', formulas: ['3'], dxf: 'green' },
  ],
  // The rating word itself, so the colours agree with `computeScore` exactly rather than
  // re-deriving its brackets from a percentage and drifting by a rounding step.
  ragText: [
    { type: 'cellIs', operator: 'equal', formulas: ['"Red"'], dxf: 'red' },
    { type: 'cellIs', operator: 'equal', formulas: ['"Yellow"'], dxf: 'amber' },
    { type: 'cellIs', operator: 'equal', formulas: ['"Green"'], dxf: 'green' },
  ],
  statusText: [
    { type: 'cellIs', operator: 'equal', formulas: ['"complete"'], dxf: 'green' },
    { type: 'cellIs', operator: 'equal', formulas: ['"in_progress"'], dxf: 'amber' },
    { type: 'cellIs', operator: 'equal', formulas: ['"pending"'], dxf: 'red' },
  ],
  // Past its date and not blank. A blank cell is "no date set", not "overdue since 1900".
  overdueDate: [{ type: 'expression', formulas: ['AND(%FIRST%<>"",%FIRST%<TODAY())'], dxf: 'red' }],
};

export interface TablePart {
  /** Workbook-unique, no spaces — Excel uses it for structured references. */
  name: string;
  displayName: string;
  /** Includes the header row and at least one data row. */
  ref: string;
  /** Must equal the header cells, in order. */
  columns: string[];
}

export interface ConditionalFormat {
  sqref: string;
  preset: CfPreset;
}

export interface Validation {
  sqref: string;
  /** An explicit list. Excel caps the inline form at 255 characters. */
  values: string[];
}

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
    // Differential formats: what a conditional rule applies ON TOP of a cell's own style.
    // They are a separate list from cellXfs with its own index space, and a rule citing an
    // index past the end makes Excel repair the file — so, like the palette, the order here
    // IS the contract (see DXF_IDS).
    `<dxfs count="${DXF_ORDER.length}">${DXF_ORDER.map((name) => `<dxf><fill><patternFill><bgColor rgb="${DXF_FILLS[name]}"/></patternFill></fill></dxf>`).join('')}</dxfs>` +
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
  tables?: TablePart[];
  conditionalFormats?: ConditionalFormat[];
  validations?: Validation[];
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

/** The header text actually present in a table's first row, in column order. */
function headerTextsFor(sheet: SheetSpec, ref: string): string[] {
  const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(ref);
  if (!m) throw new Error(`Table ref "${ref}" on sheet "${sheet.name}" is not a range like A1:H12`);
  const [firstCol, headerRow, lastCol, lastRow] = [m[1], Number(m[2]), m[3], Number(m[4])];
  if (lastRow <= headerRow) {
    throw new Error(`Table ref "${ref}" on sheet "${sheet.name}" has no data row — Excel rejects a header-only table`);
  }
  const colIndex = (letters: string) => [...letters].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0);
  const row = sheet.rows.find((r) => r.row === headerRow);
  const out: string[] = [];
  for (let c = colIndex(firstCol); c <= colIndex(lastCol); c++) {
    const cell = row?.cells.find((x) => x.ref === A1(c, headerRow));
    out.push(typeof cell?.value === 'string' ? cell.value : '');
  }
  return out;
}

function tableXml(table: TablePart, id: number): string {
  const columns = table.columns.map((name, i) => `<tableColumn id="${i + 1}" name="${escapeXml(name)}"/>`).join('');
  return (
    `${XML_HEADER}<table xmlns="${NS_MAIN}" id="${id}" name="${escapeXml(table.name)}" ` +
    `displayName="${escapeXml(table.displayName)}" ref="${table.ref}" headerRowCount="1">` +
    `<autoFilter ref="${table.ref}"/>` +
    `<tableColumns count="${table.columns.length}">${columns}</tableColumns>` +
    `<tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/>` +
    `</table>`
  );
}

function conditionalFormattingXml(formats: ConditionalFormat[] | undefined): string {
  if (!formats?.length) return '';
  let priority = 1;
  return formats
    .map((format) => {
      const first = format.sqref.split(':')[0];
      const rules = CF_PRESETS[format.preset]
        .map((rule) => {
          const formulas = rule.formulas
            .map((f) => `<formula>${escapeXml(f.split('%FIRST%').join(first))}</formula>`)
            .join('');
          const operator = rule.operator ? ` operator="${rule.operator}"` : '';
          return `<cfRule type="${rule.type}"${operator} dxfId="${DXF_IDS[rule.dxf]}" priority="${priority++}">${formulas}</cfRule>`;
        })
        .join('');
      return `<conditionalFormatting sqref="${format.sqref}">${rules}</conditionalFormatting>`;
    })
    .join('');
}

function dataValidationsXml(validations: Validation[] | undefined): string {
  if (!validations?.length) return '';
  const entries = validations
    .map((v) => {
      // The inline list form is a quoted, comma-joined string — and Excel caps it at 255
      // characters, so say so loudly rather than emitting something it will silently drop.
      const list = v.values.join(',');
      if (list.length > 255) {
        throw new Error(`Validation list for ${v.sqref} is ${list.length} characters; Excel allows 255`);
      }
      return (
        `<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" sqref="${v.sqref}">` +
        `<formula1>${escapeXml(`"${list}"`)}</formula1></dataValidation>`
      );
    })
    .join('');
  return `<dataValidations count="${validations.length}">${entries}</dataValidations>`;
}

function sheetXml(sheet: SheetSpec, tableIds: number[]): string {
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
  for (const table of sheet.tables ?? []) {
    const headers = headerTextsFor(sheet, table.ref);
    if (headers.length !== table.columns.length) {
      throw new Error(
        `Table "${table.name}" declares ${table.columns.length} columns but its ref spans ${headers.length}`,
      );
    }
    table.columns.forEach((name, i) => {
      if (headers[i] !== name) {
        throw new Error(
          `Table "${table.name}" column ${i + 1} is declared "${name}" but the header cell says "${headers[i]}" — ` +
            'Excel repairs a table whose column names do not match its header row',
        );
      }
    });
  }

  const tableParts = tableIds.length
    ? `<tableParts count="${tableIds.length}">${tableIds.map((_, i) => `<tablePart r:id="rId${i + 1}"/>`).join('')}</tableParts>`
    : '';

  // CT_Worksheet is a sequence, not a bag: sheetData, then conditionalFormatting, then
  // dataValidations, with tableParts last. Emitting these out of order does not warn — it
  // makes Excel offer to repair the file, with a message that names nothing useful.
  return (
    `${XML_HEADER}<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL_DOC}">` +
    `<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>${cols}` +
    `<sheetData>${rows}</sheetData>` +
    conditionalFormattingXml(sheet.conditionalFormats) +
    dataValidationsXml(sheet.validations) +
    tableParts +
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

  // Tables are numbered across the whole workbook, and each sheet keeps its own relationship
  // ids starting at rId1 — a table's r:id is scoped to the worksheet that references it.
  let nextTableId = 1;
  const tableIdsBySheet = sheets.map((s) => (s.tables ?? []).map(() => nextTableId++));
  const allTables = sheets.flatMap((s, i) =>
    (s.tables ?? []).map((table, j) => ({ table, id: tableIdsBySheet[i][j] })),
  );

  const displayNames = new Set<string>();
  for (const { table } of allTables) {
    // Excel treats displayName as a workbook-wide identifier for structured references, and
    // silently repairs a duplicate rather than reporting one.
    if (displayNames.has(table.displayName)) {
      throw new Error(`Two tables share the displayName "${table.displayName}"; it must be unique in the workbook`);
    }
    if (/\s/.test(table.displayName) || /^\d/.test(table.displayName)) {
      throw new Error(`Table displayName "${table.displayName}" must not contain a space or start with a digit`);
    }
    displayNames.add(table.displayName);
  }

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
    allTables
      .map(
        ({ id }) =>
          `<Override PartName="/xl/tables/table${id}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>`,
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

  // A worksheet that references a table needs its own rels part pointing at it.
  const sheetRels = tableIdsBySheet.flatMap((ids, i) => {
    if (ids.length === 0) return [];
    const entries = ids
      .map((id, j) => `<Relationship Id="rId${j + 1}" Type="${NS_REL_DOC}/table" Target="../tables/table${id}.xml"/>`)
      .join('');
    return [
      {
        name: `xl/worksheets/_rels/sheet${i + 1}.xml.rels`,
        data: enc(`${XML_HEADER}<Relationships xmlns="${NS_REL_PKG}">${entries}</Relationships>`),
      },
    ];
  });

  return writeZip([
    { name: '[Content_Types].xml', data: enc(contentTypes) },
    { name: '_rels/.rels', data: enc(rootRels) },
    { name: 'xl/workbook.xml', data: enc(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc(workbookRels) },
    { name: 'xl/styles.xml', data: enc(stylesXml()) },
    ...sheets.map((s, i) => ({ name: sheetPath(i), data: enc(sheetXml(s, tableIdsBySheet[i])) })),
    ...sheetRels,
    ...allTables.map(({ table, id }) => ({ name: `xl/tables/table${id}.xml`, data: enc(tableXml(table, id)) })),
  ]);
}
