/**
 * Render a deal JSON into a self-contained MEDDPICC worksheet plan.
 *
 * The plugin ships `meddpicc-template.xlsx`, whose layout `cell-mapping.json`
 * describes cell by cell. That mapping only works when the template itself is open —
 * its coordinates assume the template's merged cells, headers and banding. A task pane
 * usually faces some other workbook, so this renderer treats the mapping as a *field
 * inventory* (which fields belong on the sheet, in which order, with which units and
 * which columns per table) and lays them out itself, in a fixed two-column form.
 *
 * The content is therefore exactly the official sheet's content; only the arrangement
 * is ours, and it is fixed in code rather than improvised per run. `renderSheet` is
 * pure and deterministic: same deal in, byte-identical plan out.
 *
 * Output is a list of `write_range`-shaped operations (`address` + 2D `values`), so a
 * caller can execute the plan without deciding anything.
 */
import { computeScore } from './score';
import { QUALIFICATION_ELEMENTS } from './sections';

export interface SheetWrite {
  /** A1-style range, e.g. "A1:B1". Bare — the caller qualifies it with the sheet. */
  address: string;
  /** Rows of column values; shape always matches `address`. */
  values: CellValue[][];
}

export interface SheetPlan {
  sheetName: string;
  writes: SheetWrite[];
  /** Last row used, so a caller can append below the plan. */
  rowCount: number;
}

export type CellValue = string | number;

interface StaticField {
  jsonPath: string;
  cell?: string;
  format?: string;
}

interface DynamicSection {
  jsonPath: string;
  maxRows?: number;
  columns?: Record<string, string>;
  booleanFormat?: { true?: string; false?: string };
}

export interface CellMapping {
  sheetName?: string;
  staticFields?: StaticField[];
  dynamicSections?: DynamicSection[];
}

/** Sheet name when the deal carries no account — stable, never empty. */
const FALLBACK_SHEET_NAME = 'MEDDPICC Deal Review';

/** Excel sheet names cannot exceed 31 chars or contain these. */
const SHEET_NAME_FORBIDDEN = /[:\\/?*[\]]/g;
const SHEET_NAME_MAX = 31;

/**
 * Units are carried in the LABEL, never folded into the value: `0.6` written as the
 * string "60%" can no longer be averaged, and there is no number-format host tool to
 * restore it afterwards. The sheet keeps arithmetic; the reader keeps context.
 */
const UNIT_BY_FORMAT: Record<string, string> = {
  currency: 'USD',
  percentage: '0-1',
};

/**
 * Paths whose schema key does not survive camelCase splitting.
 *
 * `pAndIplusAcvx` humanizes to the nonsense "P And Iplus Acvx" — the key encodes an
 * ampersand and an internal capital the rule cannot recover. Rather than bend the
 * general rule around one field, name the exception. Renaming the schema key itself
 * would be the real fix, but it is referenced by every existing deal file and by
 * `cell-mapping.json`.
 */
const LABEL_OVERRIDES: Record<string, string> = {
  'metadata.revenue.pAndIplusAcvx': 'P&I + ACVx',
};

/** camelCase / f5-ish key -> "Title Case" words. `whyF5` -> "Why F5". */
function humanize(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w) => (/^(f5|acv|sfdc|map|poc|usd)$/i.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
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
 * A human label for a mapped path.
 *
 * The leaf key alone is ambiguous — `threeWhys.f5.whyNow` and `threeWhys.partner.whyNow`
 * are different questions with the same leaf — so a path nested below its top-level
 * group carries its parent too. An indexed leaf becomes "Parent — Response N", matching
 * how the template numbers the two answers per element.
 */
function labelFor(field: StaticField): string {
  const override = LABEL_OVERRIDES[field.jsonPath];
  if (override) {
    const overrideUnit = field.format ? UNIT_BY_FORMAT[field.format] : undefined;
    return overrideUnit ? `${override} (${overrideUnit})` : override;
  }

  const tokens = tokenize(field.jsonPath);
  const index = typeof tokens[tokens.length - 1] === 'number' ? (tokens.pop() as number) : null;
  const names = tokens.filter((t): t is string => typeof t === 'string');

  const leaf = names[names.length - 1] ?? field.jsonPath;
  const parent = names.length > 2 ? names[names.length - 2] : null;

  let label = index === null ? humanize(leaf) : `${humanize(parent ?? leaf)} — Response ${index + 1}`;
  if (index === null && parent) label = `${humanize(parent)} — ${label}`;

  const unit = field.format ? UNIT_BY_FORMAT[field.format] : undefined;
  return unit ? `${label} (${unit})` : label;
}

/** The group heading a path belongs under, e.g. "metadata" -> "Metadata". */
function groupFor(path: string): string {
  const first = tokenize(path).find((t): t is string => typeof t === 'string');
  return humanize(first ?? 'Details');
}

/**
 * Neutralise spreadsheet formula injection.
 *
 * A deal file is assembled from call notes, emails and OSINT reports — text this plugin
 * did not author. A cell opening with `=`, `+`, `-` or `@` is executed by Excel on open,
 * so it is prefixed with an apostrophe (the standard escape) before it can reach a sheet.
 * The pane's `write_range` sanitises too; doing it here keeps the plan safe to inspect,
 * diff or hand to any other consumer.
 */
function sanitize(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** Coerce a JSON value to something a cell can hold, or null to skip the row. */
function toCell(value: unknown, booleanFormat?: DynamicSection['booleanFormat']): CellValue | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') {
    const text = value ? (booleanFormat?.true ?? 'Yes') : (booleanFormat?.false ?? 'No');
    return sanitize(text);
  }
  if (typeof value === 'string') return value.trim() === '' ? null : sanitize(value);
  if (Array.isArray(value)) {
    const parts = value.map((v) => toCell(v, booleanFormat)).filter((v): v is CellValue => v !== null);
    return parts.length > 0 ? sanitize(parts.join('; ')) : null;
  }
  return null;
}

function sheetNameFor(deal: unknown): string {
  const account = readPath(deal, 'metadata.accountName');
  if (typeof account !== 'string' || account.trim() === '') return FALLBACK_SHEET_NAME;
  const name = `MEDDPICC — ${account.trim()}`.replace(SHEET_NAME_FORBIDDEN, ' ');
  return name.length > SHEET_NAME_MAX ? name.slice(0, SHEET_NAME_MAX).trimEnd() : name;
}

/** Accumulates rows and hands back `write_range`-shaped blocks. */
class SheetBuilder {
  #rows: CellValue[][] = [];

  /** Add a row, padding to the plan's widest row happens at emit time. */
  row(...cells: CellValue[]): void {
    this.#rows.push(cells);
  }

  blank(): void {
    // Only between content — never a leading or trailing run of empties.
    if (this.#rows.length > 0) this.#rows.push([]);
  }

  get length(): number {
    return this.#rows.length;
  }

  /**
   * One write per contiguous run of same-width rows. Excel rejects a `values` grid whose
   * shape disagrees with its address, so rows are padded to the run's width rather than
   * emitted ragged — and blank separators ride along inside their run.
   */
  emit(): { writes: SheetWrite[]; rowCount: number } {
    while (this.#rows.length > 0 && this.#rows[this.#rows.length - 1].length === 0) this.#rows.pop();

    const writes: SheetWrite[] = [];
    let start = 0;
    while (start < this.#rows.length) {
      let end = start;
      let width = this.#rows[start].length || 1;
      // Extend the run while the width matches; a blank row (length 0) joins any run.
      while (end + 1 < this.#rows.length) {
        const next = this.#rows[end + 1].length;
        if (next !== 0 && next !== width) break;
        if (next > width) width = next;
        end++;
      }
      const values = this.#rows.slice(start, end + 1).map((r) => {
        const padded = r.slice(0, width) as CellValue[];
        while (padded.length < width) padded.push('');
        return padded;
      });
      writes.push({ address: `A${start + 1}:${columnLetter(width)}${end + 1}`, values });
      start = end + 1;
    }
    return { writes, rowCount: this.#rows.length };
  }
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

export function renderSheet(deal: unknown, cellMapping: CellMapping): SheetPlan {
  const b = new SheetBuilder();

  b.row('MEDDPICC Deal Review');

  // ── Static fields, in mapping order, grouped by their top-level section ──────
  let currentGroup: string | null = null;
  for (const field of cellMapping.staticFields ?? []) {
    const value = toCell(readPath(deal, field.jsonPath));
    if (value === null) continue; // an unanswered field is absent, not an empty row
    const group = groupFor(field.jsonPath);
    if (group !== currentGroup) {
      b.blank();
      b.row(group);
      currentGroup = group;
    }
    b.row(labelFor(field), value);
  }

  // ── Scores, from the same engine the CLI's `score` command uses ──────────────
  const score = computeScore(deal);
  b.blank();
  b.row('Scoring (0-4)');
  for (const element of QUALIFICATION_ELEMENTS) {
    b.row(humanize(element), score.elementScores[element] ?? 0);
  }
  b.row('Overall', score.sum);
  b.row('Overall %', score.overallScore);
  b.row('Rating', score.overallRating);

  // ── Dynamic sections as header + one row per item ────────────────────────────
  for (const section of cellMapping.dynamicSections ?? []) {
    const items = readPath(deal, section.jsonPath);
    if (!Array.isArray(items) || items.length === 0) continue;
    const columns = Object.keys(section.columns ?? {});
    if (columns.length === 0) continue;

    b.blank();
    // "closePlan.milestones" -> "Close Plan Milestones": the whole path, because the two
    // side-by-side sections in the template share a leaf-adjacent name.
    b.row(humanize(section.jsonPath.replace(/\./g, ' ')));
    b.row(...columns.map(humanize));
    for (const item of items.slice(0, section.maxRows ?? items.length)) {
      b.row(...columns.map((c) => toCell(readPath(item, c), section.booleanFormat) ?? ''));
    }
  }

  const { writes, rowCount } = b.emit();
  return { sheetName: sheetNameFor(deal), writes, rowCount };
}
