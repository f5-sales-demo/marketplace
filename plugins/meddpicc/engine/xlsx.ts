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

/** Excel's limit on the text of one formula. Past it, opening the file offers to repair it. */
const MAX_FORMULA_LENGTH = 8192;

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

/** Parse `B14` into 1-based bounds, rejecting anything Excel would not accept as one cell. */
function parseCell(ref: string, what: string): { column: number; row: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) throw new Error(`${what} "${ref}" is not a single cell like B14`);
  const cell = { column: columnIndex(m[1]), row: Number(m[2]) };
  if (cell.column > MAX_COLUMN || cell.row < 1 || cell.row > MAX_ROW) {
    throw new Error(`${what} "${ref}" is outside Excel's grid`);
  }
  return cell;
}

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
const FILL_TEAL = 3;
const FILL_ACCENT = 4;

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
  muted: { font: FONT_ITALIC_GREY, fill: FILL_NONE, numFmt: 0 },
};

/**
 * Conditional-format fills, in `dxfs` order — the index of each name IS its `dxfId`.
 * Same discipline as the cell-style palette: one ordered list, indexes derived from it.
 *
 * **Colour marks what needs attention, and nothing else.** A finished element, a complete section, a
 * "Green" rating and a score that went up all carry no fill at all: on a sheet read at a glance the
 * eye should land on the gaps, and it lands instead on whatever has the most colour. Painting the good
 * news green made a well-qualified deal the loudest thing on the page.
 *
 * So three faint washes, named for how much attention they ask for rather than for their hue, and
 * ordered that way too:
 *
 * - `urgent` — nothing there at all: an unscored element, an untouched section, a required cell nobody
 *   has filled, a "Red" rating, a date already past.
 * - `warn` — barely begun, or a step backwards.
 * - `watch` — nearly there. Partial, in progress, a score of 2.
 *
 * Faint on purpose. These sit under the text of a dense grid, so anything stronger reads as an error
 * state; the render is what settles whether they are subtle enough, not the hex.
 */
const DXF_ORDER = ['urgent', 'warn', 'watch'] as const;
type DxfName = (typeof DXF_ORDER)[number];
const DXF_FILLS: Record<DxfName, string> = { urgent: 'FFFAE4E1', warn: 'FFFCEBDB', watch: 'FFFDF6DD' };
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
export type CfPreset =
  | 'score'
  | 'delta'
  | 'ragText'
  | 'statusText'
  | 'completionText'
  | 'overdueDate'
  | 'missing'
  | 'missingInRow'
  | 'wanted'
  | 'wantedInRow';

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

export const CF_PRESETS: Record<CfPreset, CfRule[]> = {
  // A 0-4 element score, as a ladder: 0 is nothing, 1 is barely, 2 is nearly — and 3 or 4 is done, so
  // it carries no rule at all. Three rules rather than the old "under 2 / equal 2 / 3 and up", because
  // the two ends of "under 2" are not the same news: an element nobody has scored and one scored 1 are
  // a gap and a start.
  score: [
    { type: 'cellIs', operator: 'equal', formulas: ['0'], dxf: 'urgent' },
    { type: 'cellIs', operator: 'equal', formulas: ['1'], dxf: 'warn' },
    { type: 'cellIs', operator: 'equal', formulas: ['2'], dxf: 'watch' },
  ],
  // The rating word itself, so the colours agree with `computeScore` exactly rather than
  // re-deriving its brackets from a percentage and drifting by a rounding step. "Green" gets no
  // rule: a deal in good shape does not need to be pointed at.
  ragText: [
    { type: 'cellIs', operator: 'equal', formulas: [`"${enumLabel('Red')}"`], dxf: 'urgent' },
    { type: 'cellIs', operator: 'equal', formulas: [`"${enumLabel('Yellow')}"`], dxf: 'watch' },
  ],
  // Matched against the LABEL the sheet displays, not the JSON value behind it. Both come from
  // `enumLabel`, so they cannot drift — a preset quoting `"not_started"` while the cell reads
  // "Not started" is a colour that never appears and nothing to notice it.
  completionText: [
    { type: 'cellIs', operator: 'equal', formulas: [`"${enumLabel('partial')}"`], dxf: 'watch' },
    { type: 'cellIs', operator: 'equal', formulas: [`"${enumLabel('not_started')}"`], dxf: 'urgent' },
  ],
  // A close-plan step, and a gentler ladder than the completion one on purpose: a milestone nobody has
  // started is normal early in a deal, where a MEDDPICC section nobody has touched is the gap the
  // review exists to find.
  statusText: [
    { type: 'cellIs', operator: 'equal', formulas: [`"${enumLabel('in_progress')}"`], dxf: 'watch' },
    { type: 'cellIs', operator: 'equal', formulas: [`"${enumLabel('pending')}"`], dxf: 'warn' },
  ],
  // A change since the last review. Only a step backwards is painted: nought is not a warning, and an
  // improvement is the good news this palette deliberately leaves alone.
  delta: [{ type: 'cellIs', operator: 'lessThan', formulas: ['0'], dxf: 'warn' }],
  // Past its date and not blank. A blank cell is "no date set", not "overdue since 1900".
  overdueDate: [{ type: 'expression', formulas: ['AND(%FIRST%<>"",%FIRST%<TODAY())'], dxf: 'urgent' }],
  // Nothing typed in a cell something else depends on — see `SpecColumn.shadeWhenEmpty`. TRIM, so a
  // cell holding a space reads as empty: it is empty to every rule that consults it, and a wash that
  // disappears when somebody presses the space bar would be worse than none.
  missing: [{ type: 'expression', formulas: ['LEN(TRIM(%FIRST%))=0'], dxf: 'urgent' }],
  // The same, for a row of a table — and it fires only once the row has been STARTED.
  //
  // A list keeps blank rows below its entries so there is somewhere to type, and a conditional-format
  // range does not grow when somebody uses one. Ending the range at the last existing entry left the
  // wash missing in the case it is most use — a half-entered stakeholder, whose blank title is then
  // refused on read-back with a schema error rather than shown as a gap while it is being typed. And
  // covering those rows unconditionally would open every new deal as a column of washes asking for work
  // nobody owes yet. So the range covers the whole capacity and `%ROW%` decides: something else on this
  // row means the row is real.
  //
  // On a keyed table every row carries its key, so the second half is always true and this behaves
  // exactly like `missing`.
  //
  // One thing to know before putting this on a list that has a computed column: COUNTA counts a formula
  // cell even when the formula returns "", so every row of such a table reads as started and its spare
  // rows would wash. No shipped table is in that position — the tables with formulas are the keyed ones,
  // where every row is real anyway.
  missingInRow: [{ type: 'expression', formulas: ['AND(LEN(TRIM(%FIRST%))=0,COUNTA(%ROW%)>0)'], dxf: 'urgent' }],
  // The same two rules a level down, for a cell nothing REQUIRES but a blank one is still worth seeing.
  //
  // An unanswered discovery question is the case this exists for. `qualStatus` calls an element complete
  // when any one of its responses is filled in, so with two questions and one answer the element is
  // genuinely done — and washing the blank sibling the same red as a missing evidence cell says
  // something mandatory is absent when nothing requires it. A level down keeps the signal, which is among
  // the most actionable things on the sheet, without the false alarm.
  wanted: [{ type: 'expression', formulas: ['LEN(TRIM(%FIRST%))=0'], dxf: 'watch' }],
  wantedInRow: [{ type: 'expression', formulas: ['AND(LEN(TRIM(%FIRST%))=0,COUNTA(%ROW%)>0)'], dxf: 'watch' }],
};

/** The placeholder a rule uses to mean "the row this cell is on, across its own table". */
const ROW_PLACEHOLDER = '%ROW%';

export interface ConditionalFormat {
  sqref: string;
  preset: CfPreset;
  /**
   * What `%ROW%` stands for: the cell's own row, across the columns of the table it belongs to.
   *
   * Write the columns absolute and the row relative — `$B56:$Q56` — so Excel moves it down the range
   * and never sideways. Scoped to one table on purpose: two tables share a band of rows, and a range
   * spanning the sheet would let the milestones decide whether a critical action's row had been started.
   */
  rowRange?: string;
}

export interface Validation {
  sqref: string;
  /** An explicit list. Excel caps the inline form at 255 characters. */
  values: string[];
}

/**
 * A note on a cell: text that shows on hover and takes no room on the sheet.
 *
 * The whole point is the cost. Reference text — what an element means — is wanted by whoever is
 * reading the sheet for the first time and is noise to everyone else, and a column of it charges
 * every reader for one reader's benefit. A note charges nobody: no width, and no row height, since
 * it is not in the cell.
 *
 * Classic notes rather than threaded comments. A threaded comment is a conversation, needs a person
 * id, and renders as somebody having said something — wrong for static reference text nobody wrote.
 */
export interface Note {
  /** One cell, and the top-left of its merge — that is the only cell of a merge a reader can hover. */
  ref: string;
  text: string;
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
  /** Hover notes. Each one costs three extra parts in the package — see {@link notesParts}. */
  notes?: Note[];
}

/**
 * The sheet's merged ranges, parsed and bounds-checked in declaration order.
 *
 * Shared by everything that has to reason about a merge, so the cap and the "that is not a merge"
 * rule are stated once. {@link expandMerges} materialises the cells; {@link hiddenByMerges} works
 * out which of them a reader can never see.
 */
function mergeAreas(sheet: SheetSpec): Array<{ ref: string; area: Range }> {
  return (sheet.merges ?? []).map((ref) => {
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
    return { ref, area };
  });
}

/**
 * Every cell a merge covers except the top-left one, which is the only one that shows.
 *
 * A note on a covered cell is in the file and unreachable: there is nothing to hover, because the
 * cell is not on screen. Same class of silence as a header past Excel's limit — the writer reports
 * success and the reader never learns the text exists.
 */
function hiddenByMerges(sheet: SheetSpec): Map<string, string> {
  const hidden = new Map<string, string>();
  for (const { ref, area } of mergeAreas(sheet)) {
    const anchor = A1(area.c1, area.r1);
    for (let c = area.c1; c <= area.c2; c++) {
      for (let r = area.r1; r <= area.r2; r++) {
        const at = A1(c, r);
        if (at !== anchor) hidden.set(at, ref);
      }
    }
  }
  return hidden;
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

  for (const { ref, area } of mergeAreas(sheet)) {
    const { c1, r1, c2, r2 } = area;
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
    // Excel's cap on one formula. Past it the file does not warn — it prompts to repair, and the cell
    // comes back empty. A compiled rule is the realistic way to reach this, so it is checked here where
    // every formula passes rather than at the one place that happens to build a long one.
    if (cell.formula.length > MAX_FORMULA_LENGTH) {
      throw new Error(
        `The formula for ${cell.ref} is ${cell.formula.length} characters; Excel allows ${MAX_FORMULA_LENGTH}`,
      );
    }
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
      const wantsRow = CF_PRESETS[format.preset].some((rule) => rule.formulas.some((f) => f.includes(ROW_PLACEHOLDER)));
      if (wantsRow && !format.rowRange) {
        throw new Error(
          `The "${format.preset}" format on ${format.sqref} needs a rowRange to resolve ${ROW_PLACEHOLDER}`,
        );
      }
      if (!wantsRow && format.rowRange) {
        // Data nothing reads is data that lies: a rowRange here would look like it scoped the rule.
        throw new Error(`The "${format.preset}" format on ${format.sqref} was given a rowRange it does not use`);
      }
      const rules = CF_PRESETS[format.preset]
        .map((rule) => {
          const formulas = rule.formulas
            .map(
              (f) =>
                `<formula>${escapeXml(
                  f
                    .split('%FIRST%')
                    .join(first)
                    .split(ROW_PLACEHOLDER)
                    .join(format.rowRange ?? ''),
                )}</formula>`,
            )
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
 * The relationship id the worksheet's `legacyDrawing` uses.
 *
 * Shared with {@link sheetRelsXml} so the two cannot disagree: pointed at the comments part instead
 * of the drawing, the notes are in the file, valid, and invisible in Excel.
 */
const NOTE_VML_REL_ID = 'rId1';
const NOTE_COMMENTS_REL_ID = 'rId2';

/** Tahoma 9 with the format's own indexed colour — what Excel itself writes for a note. */
const NOTE_RUN_PROPERTIES = '<rPr><sz val="9"/><color indexed="81"/><rFont val="Tahoma"/><family val="2"/></rPr>';

/** The first legacy shape id Excel uses on a sheet; each note takes the next one. */
const NOTE_FIRST_SHAPE_ID = 1025;

/** How many columns and rows the note's box covers when Excel opens it. */
const NOTE_BOX_COLUMNS = 4;
const NOTE_BOX_ROWS = 5;

function commentsXml(notes: readonly Note[]): string {
  const list = notes
    .map(
      (note) =>
        // shapeId is 0 in what Excel writes too: the shape is found through the VML drawing, not
        // through this number.
        `<comment ref="${note.ref}" authorId="0" shapeId="0"><text><r>${NOTE_RUN_PROPERTIES}` +
        `<t xml:space="preserve">${escapeXml(note.text)}</t></r></text></comment>`,
    )
    .join('');
  // One author, unnamed. Excel prefixes a note with its author in bold, and this text is the
  // schema's, not a person's — an invented name would read as somebody's opinion.
  return (
    `${XML_HEADER}<comments xmlns="${NS_MAIN}"><authors><author/></authors>` +
    `<commentList>${list}</commentList></comments>`
  );
}

/**
 * The legacy VML drawing that positions the notes.
 *
 * Excel has required this for classic notes since it stopped using VML for anything else, and there
 * is no modern replacement: a comments part with no drawing produces a file whose notes never
 * appear. The shape is hidden until hovered, which is why `visibility:hidden` is correct here rather
 * than a mistake.
 *
 * No XML declaration: this part is not XML as far as Excel is concerned, and it does not write one.
 */
function vmlDrawingXml(notes: readonly Note[], sheetName: string): string {
  const shapes = notes
    .map((note, i) => {
      // VML counts from zero where an A1 reference counts from one. Off by one puts the note on the
      // row above — still hoverable, and explaining a different element.
      const { column, row } = parseCell(note.ref, `Note on sheet "${sheetName}"`);
      const col0 = column - 1;
      const row0 = row - 1;
      // The box opens one column to the right of the cell — and slides back towards the middle when
      // the cell is close to an edge, because an anchor past column XFD or row 1048576 is not clipped
      // by Excel: it is a malformed drawing, and Excel's answer to one of those is to offer to repair
      // the file. Sliding keeps the box its full size; clamping the far corner would have flattened it
      // to nothing on the last row.
      const boxLeft = Math.min(col0 + 1, MAX_COLUMN - 1 - NOTE_BOX_COLUMNS);
      const boxTop = Math.min(row0, MAX_ROW - 1 - NOTE_BOX_ROWS);
      return (
        `<v:shape id="_x0000_s${NOTE_FIRST_SHAPE_ID + i}" type="#_x0000_t202" ` +
        `style="position:absolute;width:240pt;height:80pt;z-index:${i + 1};visibility:hidden" ` +
        `fillcolor="#ffffe1" o:insetmode="auto">` +
        `<v:fill color2="#ffffe1"/><v:shadow on="t" color="black" obscured="t"/><v:path o:connecttype="none"/>` +
        `<v:textbox style="mso-direction-alt:auto"><div style="text-align:left"></div></v:textbox>` +
        `<x:ClientData ObjectType="Note"><x:MoveWithCells/><x:SizeWithCells/>` +
        `<x:Anchor>${boxLeft}, 15, ${boxTop}, 2, ${boxLeft + NOTE_BOX_COLUMNS}, 15, ${boxTop + NOTE_BOX_ROWS}, 2</x:Anchor>` +
        `<x:AutoFill>False</x:AutoFill><x:Row>${row0}</x:Row><x:Column>${col0}</x:Column></x:ClientData></v:shape>`
      );
    })
    .join('');
  return (
    `<xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" ` +
    `xmlns:x="urn:schemas-microsoft-com:office:excel">` +
    `<o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="1"/></o:shapelayout>` +
    `<v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe">` +
    `<v:stroke joinstyle="miter"/><v:path gradientshapeok="t" o:connecttype="rect"/></v:shapetype>` +
    `${shapes}</xml>`
  );
}

/** The worksheet's own relationships: the drawing it points at, and the notes behind it. */
function sheetRelsXml(sheetNumber: number): string {
  return (
    `${XML_HEADER}<Relationships xmlns="${NS_REL_PKG}">` +
    `<Relationship Id="${NOTE_VML_REL_ID}" Type="${NS_REL_DOC}/vmlDrawing" ` +
    `Target="../drawings/vmlDrawing${sheetNumber}.vml"/>` +
    `<Relationship Id="${NOTE_COMMENTS_REL_ID}" Type="${NS_REL_DOC}/comments" ` +
    `Target="../comments${sheetNumber}.xml"/>` +
    `</Relationships>`
  );
}

/**
 * The three parts a sheet's notes need, or null when it has none.
 *
 * Numbered by the SHEET, not by how many sheets carry notes: `comments2.xml` belongs to sheet 2
 * whether or not sheet 1 has any, because Excel resolves these by name and two sheets cannot share
 * one part.
 */
function notesParts(sheet: SheetSpec, sheetNumber: number): { comments: string; vml: string; rels: string } | null {
  const notes = sheet.notes ?? [];
  if (notes.length === 0) return null;

  const hidden = hiddenByMerges(sheet);
  const seen = new Set<string>();
  for (const note of notes) {
    parseCell(note.ref, `Note on sheet "${sheet.name}"`);
    if (note.text.trim() === '') {
      throw new Error(`The note on ${sheet.name}!${note.ref} has no text — a note nobody can read is a red triangle`);
    }
    if (seen.has(note.ref)) {
      throw new Error(`Two notes on ${sheet.name}!${note.ref}; Excel keeps one of them and loses the other`);
    }
    seen.add(note.ref);
    const merge = hidden.get(note.ref);
    if (merge !== undefined) {
      throw new Error(
        `The note on ${sheet.name}!${note.ref} sits inside merge "${merge}", which hides that cell — ` +
          'put it on the top-left cell of the merge, the only one a reader can hover',
      );
    }
  }

  return {
    comments: commentsXml(notes),
    vml: vmlDrawingXml(notes, sheet.name),
    rels: sheetRelsXml(sheetNumber),
  };
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
  // (printOptions, pageMargins, pageSetup, headerFooter), and legacyDrawing after all of it.
  // Emitting these out of order does not warn — it makes Excel offer to repair the file, with a
  // message that names nothing useful.
  const legacyDrawing = sheet.notes?.length ? `<legacyDrawing r:id="${NOTE_VML_REL_ID}"/>` : '';
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
    legacyDrawing +
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
  // Validated here, before anything is written: a note the reader could never hover is a defect in
  // the caller's layout, not something to ship quietly.
  const notes = sheets.map((sheet, i) => notesParts(sheet, i + 1));
  const anyNotes = notes.some((part) => part !== null);
  // An empty property set ships no part: an empty <Properties/> is legal and would make a reader
  // report the workbook as stamped when it carries nothing.
  const hasProperties = properties !== undefined && Object.keys(properties).length > 0;

  const contentTypes =
    `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    // The VML drawing behind the notes. Declared by extension, as Excel does — every note part on
    // every sheet is one `.vml` file, so there is nothing per-sheet to override.
    (!anyNotes
      ? ''
      : `<Default Extension="vml" ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/>`) +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    sheets
      .map(
        (_, i) =>
          `<Override PartName="/${sheetPath(i)}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
      )
      .join('') +
    notes
      .map((part, i) =>
        part === null
          ? ''
          : `<Override PartName="/xl/comments${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"/>`,
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
    ...notes.flatMap((part, i) =>
      part === null
        ? []
        : [
            { name: `xl/worksheets/_rels/sheet${i + 1}.xml.rels`, data: enc(part.rels) },
            { name: `xl/comments${i + 1}.xml`, data: enc(part.comments) },
            { name: `xl/drawings/vmlDrawing${i + 1}.vml`, data: enc(part.vml) },
          ],
    ),
    ...(hasProperties ? [{ name: 'docProps/custom.xml', data: enc(customPropsXml(properties)) }] : []),
  ]);
}
