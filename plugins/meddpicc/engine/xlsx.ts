/**
 * A small OOXML writer: enough of the `.xlsx` format to emit a real, formula-driven
 * workbook from scratch.
 *
 * The workbook is authored here rather than injected into a template someone else made, which
 * is what a formula-driven sheet needs: formulas, named styles, tables and conditional
 * formatting all have to be written, not filled in.
 *
 * The hard part of hand-writing xlsx is `styles.xml`: cells reference styles by INDEX into
 * `cellXfs`, so an off-by-one silently mis-styles every cell after the gap, and a dangling
 * `numFmtId` makes Excel offer to repair the file. Both are addressed the same way — a
 * fixed, named palette (see {@link STYLE_IDS}) whose indexes are derived from one ordered
 * list, with tests asserting the count matches and every custom format is defined. Callers
 * name a style; they never write an index.
 *
 * Strings are written inline (`t="inlineStr"`) rather than through `sharedStrings.xml`.
 * That trades a little file size for one fewer part to keep consistent. Excel re-saves them
 * through `sharedStrings.xml` anyway, which the round-trip reader handles.
 */
import { enumLabel } from './labels';
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

/** "A" -> 1, "AA" -> 27. The inverse of {@link columnLetter}. */
export function columnIndex(letters: string): number {
  return [...letters].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0);
}

interface Range {
  c1: number;
  r1: number;
  c2: number;
  r2: number;
}

/** The last cell Excel has: column XFD, row 1048576. Anything past it is not a cell at all. */
const MAX_COLUMN = 16384;
const MAX_ROW = 1048576;

/**
 * How many cells one merge may materialise.
 *
 * A full-width banner is sixteen cells and the tallest prose block is a few hundred, so this is
 * three orders of magnitude of headroom. It exists because `A1:XFD1048576` is a syntactically
 * valid, in-bounds range covering seventeen billion cells: without a cap the writer does not
 * fail, it stops responding, which is the one failure mode with no error message.
 */
const MAX_MERGE_CELLS = 10_000;

/** Parse `B2:Q7` into 1-based bounds, rejecting anything Excel would not accept as a range. */
function parseRange(ref: string, what: string): Range {
  const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(ref);
  if (!m) throw new Error(`${what} "${ref}" is not a range like B2:Q7`);
  const range = { c1: columnIndex(m[1]), r1: Number(m[2]), c2: columnIndex(m[3]), r2: Number(m[4]) };
  if (range.c2 < range.c1 || range.r2 < range.r1) {
    throw new Error(`${what} "${ref}" runs backwards — write it top-left first, as B2:Q7`);
  }
  for (const [axis, low, high, limit] of [
    ['row', range.r1, range.r2, MAX_ROW],
    ['column', range.c1, range.c2, MAX_COLUMN],
  ] as const) {
    if (low < 1 || high > limit) {
      throw new Error(`${what} "${ref}" is outside Excel's grid — ${axis}s run from 1 to ${limit}`);
    }
  }
  return range;
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
  'groupHeader',
  'columnHeader',
  'fieldLabel',
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
const FONT_WHITE_BOLD = 2;
const FONT_ITALIC_GREY = 3;
const FONT_WHITE_TITLE = 4;

/** Fill index per style, into the `<fills>` list below. */
const FILL_NONE = 0;
// index 1 is the format-reserved gray125 placeholder; Excel expects it present and unused
const FILL_DARK = 2;
const FILL_RED = 3;
const FILL_AMBER = 4;
const FILL_GREEN = 5;
const FILL_TEAL = 6;
const FILL_ACCENT = 7;

interface StyleDef {
  font: number;
  fill: number;
  numFmt: number;
  wrap?: boolean;
  center?: boolean;
  /** Sit the text in the middle of the row. Banners are twice the height of their text. */
  middle?: boolean;
  /**
   * Pin the text to the left of its cell.
   *
   * Excel right-aligns numbers, which is right in a column of figures and wrong in a form: merged
   * across four columns, a date drifts to the far edge and reads as belonging to whatever is next to
   * it rather than to the label on its left.
   */
  left?: boolean;
}

const STYLE_DEFS: Record<StyleName, StyleDef> = {
  default: { font: FONT_DEFAULT, fill: FILL_NONE, numFmt: 0, left: true, middle: true },
  title: { font: FONT_WHITE_TITLE, fill: FILL_DARK, numFmt: 0, center: true, middle: true },
  sectionHeader: { font: FONT_WHITE_BOLD, fill: FILL_DARK, numFmt: 0, center: true, middle: true },
  groupHeader: { font: FONT_WHITE_BOLD, fill: FILL_ACCENT, numFmt: 0, center: true, middle: true },
  columnHeader: { font: FONT_WHITE_BOLD, fill: FILL_TEAL, numFmt: 0, center: true, middle: true, wrap: true },
  fieldLabel: { font: FONT_WHITE_BOLD, fill: FILL_TEAL, numFmt: 0, middle: true, wrap: true },
  label: { font: FONT_BOLD, fill: FILL_NONE, numFmt: 0 },
  text: { font: FONT_DEFAULT, fill: FILL_NONE, numFmt: 0, wrap: true },
  number: { font: FONT_DEFAULT, fill: FILL_NONE, numFmt: 0, left: true, middle: true },
  currency: { font: FONT_DEFAULT, fill: FILL_NONE, numFmt: NUMFMT_CURRENCY, left: true, middle: true },
  percent: { font: FONT_DEFAULT, fill: FILL_NONE, numFmt: NUMFMT_PERCENT, left: true, middle: true },
  date: { font: FONT_DEFAULT, fill: FILL_NONE, numFmt: NUMFMT_DATE, left: true, middle: true },
  score: { font: FONT_BOLD, fill: FILL_NONE, numFmt: 0, center: true, middle: true },
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
export type CfPreset = 'score' | 'delta' | 'ragText' | 'statusText' | 'completionText' | 'overdueDate';

/**
 * The section statuses `computeCompletion` emits.
 *
 * Deliberately NOT the closePlan `status` enum (pending / in_progress / complete): they are
 * two different vocabularies that happen to share one word. Colouring the completion column
 * with the closePlan preset left `not_started` and `partial` — two of its three states, and
 * the two that matter — with no colour at all.
 */
export const COMPLETION_STATUSES = ['not_started', 'partial', 'complete'] as const;

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
  // Matched against the LABEL the sheet displays, not the JSON value behind it. Both come from
  // `enumLabel`, so they cannot drift — a preset quoting `"not_started"` while the cell reads
  // "Not started" is a colour that never appears and nothing to notice it.
  completionText: [
    { type: 'cellIs', operator: 'equal', formulas: [`"${enumLabel('complete')}"`], dxf: 'green' },
    { type: 'cellIs', operator: 'equal', formulas: [`"${enumLabel('partial')}"`], dxf: 'amber' },
    { type: 'cellIs', operator: 'equal', formulas: [`"${enumLabel('not_started')}"`], dxf: 'red' },
  ],
  statusText: [
    { type: 'cellIs', operator: 'equal', formulas: [`"${enumLabel('complete')}"`], dxf: 'green' },
    { type: 'cellIs', operator: 'equal', formulas: [`"${enumLabel('in_progress')}"`], dxf: 'amber' },
    { type: 'cellIs', operator: 'equal', formulas: [`"${enumLabel('pending')}"`], dxf: 'red' },
  ],
  // A change since the last review: up is good, down is not, and nought is neither. Deliberately no
  // amber — a delta of zero is not a warning, and colouring it would make "nothing moved" look like a
  // problem in a column read at a glance.
  delta: [
    { type: 'cellIs', operator: 'greaterThan', formulas: ['0'], dxf: 'green' },
    { type: 'cellIs', operator: 'lessThan', formulas: ['0'], dxf: 'red' },
  ],
  // Past its date and not blank. A blank cell is "no date set", not "overdue since 1900".
  overdueDate: [{ type: 'expression', formulas: ['AND(%FIRST%<>"",%FIRST%<TODAY())'], dxf: 'red' }],
};

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
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>',
    '<font><i/><sz val="10"/><color rgb="FF6B6B6B"/><name val="Calibri"/></font>',
    // 20pt, matching the manual sheet's title. Measured off it rather than chosen.
    '<font><b/><sz val="20"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>',
  ];
  // Navy, teal and light blue are dk2, accent1 and accent4 of the stock modern Office theme —
  // resolved to literal RGB rather than referenced by theme index, because we ship no theme
  // part and a `theme=` reference with nothing to resolve against renders as black on black.
  const fills = [
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FF0E2841"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF8CBAD"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFE699"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FFC6E0B4"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FF156082"/><bgColor indexed="64"/></patternFill></fill>',
    '<fill><patternFill patternType="solid"><fgColor rgb="FF0F9ED5"/><bgColor indexed="64"/></patternFill></fill>',
  ];
  const border =
    '<border><left style="thin"><color rgb="FFD0D0D0"/></left><right style="thin"><color rgb="FFD0D0D0"/></right>' +
    '<top style="thin"><color rgb="FFD0D0D0"/></top><bottom style="thin"><color rgb="FFD0D0D0"/></bottom><diagonal/></border>';

  const xfs = STYLE_ORDER.map((name) => {
    const d = STYLE_DEFS[name];
    const vertical = d.middle ? ' vertical="center"' : d.wrap ? ' vertical="top"' : '';
    const horizontal = d.center ? ' horizontal="center"' : d.left ? ' horizontal="left"' : '';
    const align =
      d.wrap || d.center || d.middle || d.left
        ? `<alignment${d.wrap ? ' wrapText="1"' : ''}${vertical}${horizontal}/>`
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

/** How the sheet prints. Omitted entirely, Excel uses its own defaults. */
export interface PrintSetup {
  orientation: 'landscape' | 'portrait';
  /** Squeeze the used width onto one page. Needs `fitToPage` on the sheet, which we emit. */
  fitToWidth?: boolean;
  /**
   * Left-hand header parts, joined with an em dash. The date is added on the right.
   *
   * Parts rather than one string so that a long first part cannot crowd out a later one: see
   * {@link fitHeader}.
   */
  header?: string[];
}

export interface SheetSpec {
  name: string;
  rows: RowSpec[];
  /** Column widths, 1-based index -> width in characters. */
  columns?: { min: number; max: number; width: number }[];
  /** Freeze everything above this row (a header freeze). */
  freezeAtRow?: number;
  /**
   * Merged ranges, as `B2:Q2`. Write the value into the top-left cell only; the writer fills
   * the rest of the range with that cell's style, which is what Excel needs to paint a fill
   * or a border across a merge.
   */
  merges?: string[];
  /** Hide the grid, so the sheet reads as a designed page rather than a spreadsheet. */
  hideGridlines?: boolean;
  /** Opening zoom percentage. Excel accepts 10 to 400. */
  zoom?: number;
  print?: PrintSetup;
  conditionalFormats?: ConditionalFormat[];
  validations?: Validation[];
}

/**
 * Fill every cell a merge covers with the anchor's style, and return the rows sorted.
 *
 * Excel paints a merged range from the styles of ALL its cells, not the top-left alone: style
 * only the anchor and a banner's fill stops after its first column with its border box left
 * open. Real Excel files write every covered cell — the sample deal-review sheet writes all
 * sixteen cells of `B2:Q2` with the same `s=`. So the caller declares the range and writes one
 * cell; keeping the other fifteen in step is this function's job, not theirs.
 *
 * Pure: the caller's rows and cells are never mutated.
 */
export function expandMerges(sheet: SheetSpec): RowSpec[] {
  const merges = sheet.merges ?? [];
  const rows = sheet.rows.map((r) => ({ ...r, cells: [...r.cells] }));
  if (merges.length === 0) return rows;

  // Indexed once, not scanned per cell. Looking a cell up by walking every row inside the
  // expansion loop makes this quadratic: a 200,000-cell merge did not finish in two minutes.
  //
  // Measured at MAX_MERGE_CELLS, rescanning against indexing: A1:B5000 700ms vs 9ms, A1:A9999
  // 942ms vs 7ms. So the cap is what bounds the damage and the index is what makes it free.
  // No test asserts the timing — at these sizes a threshold either cannot fail or flakes.
  const rowByNumber = new Map<number, RowSpec>();
  for (const row of rows) {
    if (rowByNumber.has(row.row)) {
      throw new Error(
        `Sheet "${sheet.name}" declares row ${row.row} twice — Excel repairs a sheet with a repeated row`,
      );
    }
    rowByNumber.set(row.row, row);
  }
  const cellByRef = new Map<string, CellSpec>();
  for (const row of rows) for (const cell of row.cells) cellByRef.set(cell.ref, cell);

  const rowAt = (n: number) => {
    let row = rowByNumber.get(n);
    if (!row) {
      row = { row: n, cells: [] };
      rowByNumber.set(n, row);
      rows.push(row);
    }
    return row;
  };

  /** ref -> the merge that already covers it, so an overlap can name both. */
  const covered = new Map<string, string>();

  for (const ref of merges) {
    const area = parseRange(ref, `Merge on sheet "${sheet.name}"`);
    const { c1, r1, c2, r2 } = area;
    if (c1 === c2 && r1 === r2) {
      throw new Error(`Merge "${ref}" on sheet "${sheet.name}" covers one cell — that is not a merge`);
    }
    const size = (c2 - c1 + 1) * (r2 - r1 + 1);
    if (size > MAX_MERGE_CELLS) {
      throw new Error(
        `Merge "${ref}" on sheet "${sheet.name}" covers ${size} cells; the writer materialises at most ${MAX_MERGE_CELLS}`,
      );
    }
    const anchorRef = A1(c1, r1);
    const anchor = cellByRef.get(anchorRef);
    if (!anchor) {
      throw new Error(
        `Merge "${ref}" on sheet "${sheet.name}" has no cell at ${anchorRef} to anchor it — ` +
          'the top-left cell carries the value and the style for the whole range',
      );
    }
    for (let c = c1; c <= c2; c++) {
      for (let r = r1; r <= r2; r++) {
        const at = A1(c, r);
        const already = covered.get(at);
        if (already !== undefined) {
          throw new Error(`Merges "${already}" and "${ref}" on sheet "${sheet.name}" both cover ${at}`);
        }
        covered.set(at, ref);
        if (at === anchorRef) continue;

        const existing = cellByRef.get(at);
        if (existing && (existing.value !== undefined || existing.formula !== undefined)) {
          throw new Error(
            `Merge "${ref}" on sheet "${sheet.name}" would hide the value at ${at} — ` +
              'a merged range shows only its top-left cell',
          );
        }
        // Replace, never mutate: the cell objects still belong to the caller's spec, and only
        // the rows and their arrays were copied.
        const row = rowAt(r);
        const index = row.cells.findIndex((cell) => cell.ref === at);
        const filled: CellSpec = { ref: at, style: anchor.style };
        if (index === -1) row.cells.push(filled);
        else row.cells[index] = filled;
        cellByRef.set(at, filled);
      }
    }
  }

  // sheetData is a sequence: Excel repairs a file whose rows do not ascend, and a vertical
  // merge creates rows wherever its range reaches.
  rows.sort((a, b) => a.row - b.row);
  for (const row of rows)
    row.cells.sort(
      (a, b) => columnIndex(/^[A-Z]+/.exec(a.ref)?.[0] ?? '') - columnIndex(/^[A-Z]+/.exec(b.ref)?.[0] ?? ''),
    );
  return rows;
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

/**
 * `printOptions`, `pageMargins`, `pageSetup` and `headerFooter`, in that order.
 *
 * `pageMargins` is not optional decoration: Excel wants it present before `pageSetup`.
 */
/** Excel's cap on a header string, format codes and all. One character over and it is dropped. */
const HEADER_LIMIT = 255;

/** The codes wrapped around the caller's text: left-align it, and put the date on the right. */
const HEADER_CODES = '&L&R&D';

/** What joins the header parts, and counts against the budget like anything else. */
const HEADER_SEPARATOR = ' — ';

/** `&` opens a format code, so a literal one has to be doubled — and then costs two. */
const encodeHeaderChar = (c: string) => (c === '&' ? '&&' : c);

/** Encoded length, which is what Excel counts — not the source length. */
function encodedLength(text: string): number {
  let n = 0;
  for (const ch of text) n += encodeHeaderChar(ch).length;
  return n;
}

/** Encode up to `budget` characters, appending an ellipsis if anything was left behind. */
function elide(text: string, budget: number): string {
  if (encodedLength(text) <= budget) return [...text].map(encodeHeaderChar).join('');
  let out = '';
  for (const ch of text) {
    const unit = encodeHeaderChar(ch);
    if (out.length + unit.length > budget - 1) break; // one unit back for the ellipsis
    out += unit;
  }
  return `${out}…`;
}

/**
 * Encode the header parts, fitting them inside Excel's limit with every part represented.
 *
 * Three things conspire. Nothing bounds a deal or account name. "&" doubles on the way in, so
 * 200 ampersands encode to 400 characters. And Excel does not complain about a header past the
 * limit — it drops it, so a printout comes out unidentified while generation reports success.
 *
 * Truncating beats refusing: the header is a convenience and the account name is not ours to
 * shorten. But truncating the *joined* string is not good enough, because the parts are ordered
 * account-then-deal and a 300-character account name would then consume the whole budget and
 * emit a header with no deal name in it — so every deal for that account prints identically.
 * Each part gets its own share instead, and a part that does not need its share releases the
 * surplus to the ones that do.
 */
function fitHeader(parts: string[]): string {
  const kept = parts.filter((p) => p !== '');
  if (kept.length === 0) return '';
  const budget = HEADER_LIMIT - HEADER_CODES.length - HEADER_SEPARATOR.length * (kept.length - 1);
  if (budget < kept.length) return '';

  // Redistribute in passes: each pass gives the parts still over their share the budget freed by
  // the parts under it. It settles once nothing is under its share, at most one pass per part.
  const shares = new Array(kept.length).fill(0);
  let pool = budget;
  let open = kept.map((_, i) => i);
  while (open.length > 0 && pool > 0) {
    const share = Math.floor(pool / open.length);
    if (share === 0) break;
    const settled = open.filter((i) => encodedLength(kept[i]) <= share);
    if (settled.length === 0) {
      for (const i of open) shares[i] = share;
      break;
    }
    for (const i of settled) {
      shares[i] = encodedLength(kept[i]);
      pool -= shares[i];
    }
    open = open.filter((i) => !settled.includes(i));
  }
  return kept.map((part, i) => elide(part, shares[i])).join(HEADER_SEPARATOR);
}

function printXml(print: PrintSetup | undefined): string {
  if (!print) return '';
  const fit = print.fitToWidth ? ' fitToWidth="1" fitToHeight="0"' : '';
  const headerText = print.header?.length ? fitHeader(print.header) : '';
  const header = headerText
    ? `<headerFooter><oddHeader>&amp;L${escapeXml(headerText)}&amp;R&amp;D</oddHeader></headerFooter>`
    : '';
  return (
    `<printOptions horizontalCentered="1"/>` +
    `<pageMargins left="0.4" right="0.4" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>` +
    `<pageSetup paperSize="9" orientation="${print.orientation}"${fit}/>` +
    header
  );
}

function sheetXml(sheet: SheetSpec): string {
  const cols = sheet.columns?.length
    ? `<cols>${sheet.columns.map((c) => `<col min="${c.min}" max="${c.max}" width="${c.width}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const pane = sheet.freezeAtRow
    ? `<pane ySplit="${sheet.freezeAtRow}" topLeftCell="A${sheet.freezeAtRow + 1}" activePane="bottomLeft" state="frozen"/>`
    : '';
  if (sheet.zoom !== undefined && (!Number.isInteger(sheet.zoom) || sheet.zoom < 10 || sheet.zoom > 400)) {
    throw new Error(
      `Sheet "${sheet.name}" asks for zoom ${sheet.zoom}; Excel accepts whole percentages from 10 to 400`,
    );
  }
  const viewAttrs =
    `${sheet.hideGridlines ? ' showGridLines="0"' : ''}` +
    `${sheet.zoom === undefined ? '' : ` zoomScale="${sheet.zoom}" zoomScaleNormal="${sheet.zoom}"`}`;
  // fitToWidth on pageSetup is ignored unless the sheet itself says its page setup is
  // fit-to-page, which is a sheetPr child and so has to come before everything else.
  const sheetPr = sheet.print?.fitToWidth ? `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` : '';
  const merged = expandMerges(sheet);
  const mergeCells = sheet.merges?.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((ref) => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`
    : '';
  const rows = merged
    .map(
      (r) =>
        `<row r="${r.row}"${r.height ? ` ht="${r.height}" customHeight="1"` : ''}>${r.cells.map(cellXml).join('')}</row>`,
    )
    .join('');
  // CT_Worksheet is a sequence, not a bag: sheetPr, sheetViews, sheetFormatPr, cols,
  // sheetData, mergeCells, conditionalFormatting, dataValidations, then the print group
  // (printOptions, pageMargins, pageSetup, headerFooter). Emitting these out of order does not
  // warn — it makes Excel offer to repair the file, with a message that names nothing useful.
  return (
    `${XML_HEADER}<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL_DOC}">` +
    sheetPr +
    `<sheetViews><sheetView${viewAttrs} workbookViewId="0">${pane}</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>${cols}` +
    `<sheetData>${rows}</sheetData>` +
    mergeCells +
    conditionalFormattingXml(sheet.conditionalFormats) +
    dataValidationsXml(sheet.validations) +
    printXml(sheet.print) +
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
const NS_CUSTOM_PROPS = 'http://schemas.openxmlformats.org/officeDocument/2006/custom-properties';
const NS_VT = 'http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes';
/** The format id every custom document property carries; it is fixed, not ours to choose. */
const CUSTOM_PROPS_FMTID = '{D5CDD505-2E9C-101B-9397-08002B2CF9AE}';

/** The name of the custom document property carrying the round-trip stamp. */
export const FINGERPRINT_PROPERTY = 'MeddpiccFingerprint';

/**
 * What the workbook says about its own provenance.
 *
 * The layout stamp lives here, and so does everything a reader or a puzzled human needs to place
 * the file: which schema it was generated against, which engine built it, which language its labels
 * are in. All of it derived from the deal and the plugin, never from the clock — generation stays
 * reproducible, so an unchanged deal produces an unchanged workbook.
 */
export type WorkbookProperties = Record<string, string>;

export const SCHEMA_HASH_PROPERTY = 'MeddpiccSchemaHash';
export const ENGINE_VERSION_PROPERTY = 'MeddpiccEngineVersion';
export const LOCALE_PROPERTY = 'MeddpiccLocale';

/**
 * A custom document property, which is where a stamp belongs: Excel carries it through a save
 * untouched, and it is not a cell, so nobody can retype it by accident or wonder what the
 * hidden sheet full of hex is for.
 */
function customPropsXml(props: WorkbookProperties): string {
  // pids identify a property and start at 2; two properties sharing one makes Excel repair the file.
  const entries = Object.entries(props).map(
    ([name, value], i) =>
      `<property fmtid="${CUSTOM_PROPS_FMTID}" pid="${i + 2}" name="${escapeXml(name)}">` +
      `<vt:lpwstr>${escapeXml(value)}</vt:lpwstr></property>`,
  );
  return `${XML_HEADER}<Properties xmlns="${NS_CUSTOM_PROPS}" xmlns:vt="${NS_VT}">${entries.join('')}</Properties>`;
}

export function buildWorkbook(sheets: readonly SheetSpec[], properties?: WorkbookProperties): Uint8Array {
  if (sheets.length === 0) throw new Error('A workbook needs at least one sheet');

  const enc = (s: string) => new TextEncoder().encode(s);
  const sheetPath = (i: number) => `xl/worksheets/sheet${i + 1}.xml`;
  // An empty property set ships no part: an empty <Properties/> is legal and would make a reader
  // report the workbook as stamped when it carries nothing.
  const hasProperties = properties !== undefined && Object.keys(properties).length > 0;

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
    (!hasProperties
      ? ''
      : `<Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/>`) +
    `</Types>`;

  const rootRels =
    `${XML_HEADER}<Relationships xmlns="${NS_REL_PKG}">` +
    `<Relationship Id="rId1" Type="${NS_REL_DOC}/officeDocument" Target="xl/workbook.xml"/>` +
    (!hasProperties
      ? ''
      : `<Relationship Id="rId2" Type="${NS_REL_DOC}/custom-properties" Target="docProps/custom.xml"/>`) +
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
    ...(hasProperties ? [{ name: 'docProps/custom.xml', data: enc(customPropsXml(properties)) }] : []),
  ]);
}
