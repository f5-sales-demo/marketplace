/**
 * The workbook spec: a declarative description of the MEDDPICC workbook, and the guard that
 * keeps it honest against the deal schema.
 *
 * `workbook-spec.json` IS the template. The generator turns spec + deal into an `.xlsx`; the
 * reader will walk the same spec to pull edits back out. One document drives both
 * directions, so a column cannot exist in one and not the other.
 *
 * Three properties the format is built for:
 *
 * - **Schema-related.** Every cell that holds a human's input names its `jsonPath`, and the
 *   guard resolves each one against the deal schema. A mistyped path fails the build rather
 *   than silently writing a value nowhere.
 * - **Formula-driven.** Formulas name other cells symbolically — `{{ref:acv}}`,
 *   `{{col:elements.score}}` — and the generator resolves them to addresses. Insert a row
 *   and every formula still points at the right place, which is the failure mode that makes
 *   hand-addressed spreadsheets rot.
 * - **Round-trippable.** Each cell declares a `role`. Only `input` cells go back into the
 *   JSON; `computed` and `derived` cells are outputs, and the guard refuses a cell that
 *   claims to be both.
 *
 * Collections live in tables on sheets where they can grow downward, so nothing is capped —
 * the legacy sheet formatted eight team rows and quietly dropped the rest.
 */
import { resolveSchemaPath, schemaConstraint } from './schema-path';
import { QUALIFICATION_ELEMENTS, SECTION_ORDER } from './sections';
import type { CfPreset, StyleName } from './xlsx';

/** What a cell holds. Determines its style, and later its coercion on the way back in. */
export type ValueType =
  | 'string'
  | 'text'
  | 'integer'
  | 'number'
  | 'currency'
  | 'percent'
  | 'date'
  | 'boolean'
  | 'score'
  | 'rating';

/**
 * Value type -> style name. The spec never names a style directly: the type already implies
 * one, and two ways to say the same thing is two ways to disagree.
 */
export const VALUE_TYPE_STYLE: Record<ValueType, StyleName> = {
  string: 'default',
  text: 'text',
  integer: 'number',
  number: 'number',
  currency: 'currency',
  percent: 'percent',
  date: 'date',
  boolean: 'default',
  score: 'score',
  rating: 'default',
};

/**
 * `input` — a human's value, written from the deal and read back out.
 * `computed` — a formula the workbook evaluates. Never read back.
 * `derived` — filled by the generator from the schema or the engine (a definition, a
 *   question, a completion status). Not a formula, and still never read back: the engine
 *   recomputes it, so a hand-edited cell would be a lie the next time it ran.
 */
export type CellRole = 'input' | 'computed' | 'derived';

export interface SpecColumn {
  id: string;
  header: string;
  role: CellRole;
  valueType: ValueType;
  /** For `input`. Relative to the item for a list source; may carry one `*` for a keyed source. */
  jsonPath?: string;
  /** For `computed`. May use `{{this:…}}` to name another column in the same row. */
  formula?: string;
  /** Grid columns this column covers. A span over one becomes a merge on every row. */
  span?: number;
  /**
   * This column labels its row rather than holding data.
   *
   * Rendered like a field label — the element name beside its questions is a heading for them, and
   * the manual sheet colours it as one. Still not a style name: the spec says what a cell IS and the
   * palette decides how that looks.
   */
  heading?: boolean;
  /**
   * Merge consecutive rows holding the same value into one cell.
   *
   * The element name beside its questions, as the manual sheet has it: "Metrics" written once and
   * spanning both of its question rows, rather than repeated on each. It reads as one block per
   * element instead of a column of duplicates.
   */
  groupRuns?: boolean;
  /** A named conditional-format preset (see xlsx.ts). Formatting is spec data, not code. */
  conditionalFormat?: CfPreset;
  /**
   * Offer a dropdown of the values the schema allows. The list is READ from the schema, never
   * written here — that is the whole point, since a hand-copied list drifts the moment someone
   * adds an enum member and the workbook goes on offering the old set.
   */
  validate?: boolean;
}

/**
 * Where a table's rows come from.
 *
 * `list` rows depend on the deal and are unbounded. The keyed sources have a fixed row per
 * key, which is what lets a formula point at one of them by name.
 */
export type SpecTableSource =
  | { kind: 'list'; jsonPath: string }
  | { kind: 'elements' }
  | { kind: 'sections' }
  | { kind: 'fixed'; keys: string[] }
  | { kind: 'elementResponses' };

export interface SpecTable {
  id: string;
  source: SpecTableSource;
  /** 1-based grid column the table starts at. Two tables sit side by side on the same rows. */
  anchorColumn: number;
  /** Blank rows to keep below the data so the table has room to grow in Excel. */
  minRows?: number;
  /**
   * The column whose cells hold the row key. Required when a formula points at one row of
   * this table: a Table can be sorted, so a keyed reference has to look the key up rather
   * than remember which row it was on.
   */
  keyColumn?: string;
  columns: SpecColumn[];
}

/**
 * One cell of a grid row, and how many grid columns it covers.
 *
 * A span of more than one becomes a merge. Everything on the sheet — a full-width banner, a
 * three-pairs-per-row metadata block, a label beside a paragraph — is this same primitive, so the
 * layout is data and the generator has one rule to apply rather than a shape per section.
 */
export type SpecRowCell =
  | { kind: 'blank'; span: number }
  | { kind: 'label'; span: number; text: string }
  | {
      kind: 'field';
      span: number;
      id: string;
      jsonPath: string;
      valueType: ValueType;
      conditionalFormat?: CfPreset;
      validate?: boolean;
    }
  | {
      kind: 'computed';
      span: number;
      id: string;
      formula: string;
      valueType: ValueType;
      conditionalFormat?: CfPreset;
    };

export type SpecBlock =
  /** The sheet's one heading, banner-styled across the full content width. */
  | { kind: 'title'; text: string }
  /** A section banner across the full content width. */
  | { kind: 'section'; text: string }
  /** Sub-headers over column ranges — "Us" and "Partner" side by side, say. */
  | { kind: 'group'; cells: { span: number; text: string }[] }
  /** A blank row. Narrow by default, because vertical space is the scarce resource. */
  | { kind: 'spacer'; height?: number }
  /** A row of cells whose spans must add up to the content width. */
  | { kind: 'row'; cells: SpecRowCell[]; height?: number }
  /** A grid of repeating rows: a list, the eight elements, the section statuses. */
  | { kind: 'table'; table: SpecTable };

/**
 * One worksheet, laid out.
 *
 * `columns` sizes the grid: entry one is a narrow gutter so no content touches the left edge, and
 * the rest are the content columns every block's spans are measured against.
 */
export interface SpecSheet {
  name: string;
  kind: 'grid';
  columns: { min: number; max: number; width: number }[];
  blocks: SpecBlock[];
}

export interface WorkbookSpec {
  version: number;
  sheets: SpecSheet[];
}

export interface SpecCheck {
  ok: boolean;
  /** Every `input` path resolves against the deal schema. */
  schemaPaths: { checked: number; failures: string[] };
  /** All eight scored elements are captured, exactly once each. */
  elements: { failures: string[] };
  /** No two input cells claim the same path — that would make the read-back ambiguous. */
  duplicates: { failures: string[] };
  /** Cell, table and column ids are unique where a reference has to pick one out. */
  ids: { checked: number; failures: string[] };
  /** Each cell's role, jsonPath, formula and valueType agree with one another. */
  roles: { failures: string[] };
  /** Every `{{…}}` in a formula names something that exists. */
  references: { checked: number; failures: string[] };
  /** Sheet names Excel accepts, and tables that do not sit on top of each other. */
  layout: { failures: string[] };
  /** Every `validate: true` names a path the schema actually constrains. */
  validation: { checked: number; failures: string[] };
}

const WILDCARD = '*';

/**
 * Expand a spec path into the concrete schema paths it stands for.
 *
 * `qualification.*.score` over the eight elements becomes eight paths. `responses[]` means
 * "one cell per entry"; for schema resolution the first index answers the same question as
 * any other, so it collapses to `[0]`.
 */
export function expandJsonPath(jsonPath: string, keys: readonly string[]): string[] {
  const base = jsonPath.replace(/\[\]/g, '[0]');
  const wildcards = base.split(WILDCARD).length - 1;
  if (wildcards === 0) return [base];
  if (wildcards > 1) throw new Error(`"${jsonPath}" has more than one wildcard; a path may expand over one axis only`);
  return keys.map((k) => base.replace(WILDCARD, k));
}

export interface SpecReference {
  /**
   * `ref` a named cell, `col` a table column's data range, `row` one keyed row of a column,
   * `this` another column of the same row — and `word`, which is not a cell at all.
   *
   * `word` resolves to a quoted string the SHEET shows: `{{word:booleanYes}}` becomes `"Yes"`.
   * A boolean cell holds that text rather than a logical TRUE, so `COUNTIF(range,TRUE)` counts
   * nothing and the scorecard reports 0 where the deal has 2 — well-formed, silently wrong. The
   * spec cannot import a TypeScript constant, so it names one instead of repeating its spelling.
   */
  kind: 'ref' | 'col' | 'row' | 'this' | 'word';
  target: string;
  raw: string;
}

const REFERENCE = /\{\{(ref|col|row|this|word):([^{}]+)\}\}/g;
/** Any `{{…}}`, well formed or not — what the parser above ignores, this one still sees. */
const PLACEHOLDER = /\{\{([^{}]*)\}\}/g;

/** Pull the symbolic cell references out of a formula, in the order they appear. */
export function parseReferences(formula: string): SpecReference[] {
  return [...formula.matchAll(REFERENCE)].map((m) => ({
    kind: m[1] as SpecReference['kind'],
    target: m[2],
    raw: m[0],
  }));
}

/**
 * Placeholders that look like references but are not.
 *
 * {@link parseReferences} only matches the four kinds it knows, so a typo — `{{reff:…}}`,
 * a missing kind, an unclosed brace — is invisible to it and to every check built on it.
 * Silence would mean the placeholder survived into the generated formula, where Excel would
 * see literal braces. So the malformed ones are found separately and always reported.
 */
export function findMalformedReferences(formula: string): string[] {
  const bad = [...formula.matchAll(PLACEHOLDER)]
    .filter((m) => !/^(ref|col|row|this|word):.+$/.test(m[1]))
    .map((m) => m[0]);

  // An unclosed `{{` matches neither pattern, so it can only be caught by counting.
  const opens = formula.match(/\{\{/g)?.length ?? 0;
  const closes = formula.match(/\}\}/g)?.length ?? 0;
  if (opens !== closes) bad.push(`unbalanced braces in "${formula}"`);

  return bad;
}

/** The keys a `*` expands over for this source, or [] when the source has no key axis. */
function expansionKeys(source: SpecTableSource): readonly string[] {
  switch (source.kind) {
    case 'elements':
    case 'elementResponses':
      return QUALIFICATION_ELEMENTS;
    case 'sections':
      return SECTION_ORDER;
    case 'fixed':
      return source.keys;
    case 'list':
      return [];
  }
}

/**
 * The row keys a formula may point at, or null when the rows depend on the deal.
 *
 * `elementResponses` expands over the eight elements but has one row per response, so its
 * row count is deal-dependent and no formula may name a row of it.
 */
function fixedRowKeys(source: SpecTableSource): readonly string[] | null {
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

/** Excel rejects these in a sheet name, and caps the name at 31 characters. */
const ILLEGAL_SHEET_CHARS = /[[\]:*?/\\]/;

interface Collected {
  /** Form-sheet cells addressable as `{{ref:id}}`. */
  namedCells: Map<string, { sheet: string; label: string }>;
  tables: Map<string, { sheet: string; table: SpecTable }>;
  /** Every input cell, with the concrete schema paths it writes. */
  inputs: Array<{ where: string; paths: string[] }>;
  /** Every formula, with the table it belongs to when it is a column formula. */
  formulas: Array<{ where: string; formula: string; table: SpecTable | null }>;
  /** Inputs whose path could not even be formed — before any schema lookup. */
  pathIssues: string[];
  /** Cells asking for a schema-derived dropdown, with the path the values come from. */
  validated: Array<{ where: string; path: string }>;
}

/** The tables a sheet declares, in the order the layout puts them. */
export function specTables(sheet: SpecSheet): SpecTable[] {
  return sheet.blocks.filter((b): b is Extract<SpecBlock, { kind: 'table' }> => b.kind === 'table').map((b) => b.table);
}

/**
 * Tables grouped into the row-bands they occupy.
 *
 * **Consecutive `table` blocks share their rows**, which is how two lists sit side by side — the
 * milestones beside the critical actions, the internal team beside the partner's. Any other block
 * between them ends the band, so the next table starts below rather than alongside. One rule, and it
 * is what tells "these two are a pair" from "these two are stacked".
 */
export function specTableBands(sheet: SpecSheet): SpecTable[][] {
  const bands: SpecTable[][] = [];
  let current: SpecTable[] | null = null;
  for (const block of sheet.blocks) {
    if (block.kind === 'table') {
      if (!current) {
        current = [];
        bands.push(current);
      }
      current.push(block.table);
    } else {
      current = null;
    }
  }
  return bands;
}

function collect(spec: WorkbookSpec, roles: string[], ids: string[]): Collected {
  const out: Collected = {
    namedCells: new Map(),
    tables: new Map(),
    inputs: [],
    formulas: [],
    pathIssues: [],
    validated: [],
  };

  const checkValueType = (where: string, valueType: ValueType) => {
    if (!(valueType in VALUE_TYPE_STYLE)) roles.push(`${where}: unknown valueType "${valueType}"`);
  };

  for (const sheet of spec.sheets) {
    for (const block of sheet.blocks) {
      if (block.kind !== 'row') continue;
      for (const cell of block.cells) {
        if (cell.kind !== 'field' && cell.kind !== 'computed') continue;
        const where = `${sheet.name}.${cell.id}`;
        if (out.namedCells.has(cell.id)) {
          ids.push(`duplicate cell id "${cell.id}" (${out.namedCells.get(cell.id)?.sheet} and ${sheet.name})`);
        }
        out.namedCells.set(cell.id, { sheet: sheet.name, label: cell.id });
        checkValueType(where, cell.valueType);

        if (cell.kind === 'field') {
          if (!cell.jsonPath) {
            roles.push(`${where}: a field must name a jsonPath`);
          } else if (cell.jsonPath.includes(WILDCARD)) {
            roles.push(`${where}: a grid field cannot use a wildcard — there is no key axis to expand it over`);
          } else {
            out.inputs.push({ where, paths: [cell.jsonPath] });
            if (cell.validate) out.validated.push({ where, path: cell.jsonPath });
          }
        } else {
          out.formulas.push({ where, formula: cell.formula, table: null });
        }
      }
    }

    for (const table of specTables(sheet)) {
      if (out.tables.has(table.id)) {
        ids.push(`duplicate table id "${table.id}" (${out.tables.get(table.id)?.sheet} and ${sheet.name})`);
      }
      out.tables.set(table.id, { sheet: sheet.name, table });

      const seenColumns = new Set<string>();
      for (const column of table.columns) {
        const where = `${table.id}.${column.id}`;
        if (seenColumns.has(column.id)) ids.push(`${where}: duplicate column id`);
        seenColumns.add(column.id);
        checkValueType(where, column.valueType);

        if (column.role === 'input') {
          if (column.formula) roles.push(`${where}: an input column cannot also carry a formula`);
          if (!column.jsonPath) {
            roles.push(`${where}: an input column must name a jsonPath`);
            continue;
          }
          const relative =
            table.source.kind === 'list' ? `${table.source.jsonPath}.${column.jsonPath}` : column.jsonPath;
          try {
            // A source with no key axis has nothing for a wildcard to expand over, so the
            // expansion would silently produce zero paths and the column would vanish from
            // the schema check — present in the workbook, writing nowhere.
            const paths = expandJsonPath(relative, expansionKeys(table.source));
            if (paths.length === 0) {
              out.pathIssues.push(
                `${where}: "${relative}" expands to no path — table "${table.id}" has no keys to expand a wildcard over`,
              );
              continue;
            }
            out.inputs.push({ where, paths });
            if (column.validate) out.validated.push({ where, path: paths[0] });
          } catch (e) {
            roles.push(`${where}: ${e instanceof Error ? e.message : String(e)}`);
          }
          if (column.validate === true && column.role !== 'input') {
            roles.push(`${where}: only an input column can carry a dropdown`);
          }
        } else if (column.role === 'computed') {
          if (column.jsonPath) {
            roles.push(`${where}: a computed column cannot claim a jsonPath — a derived value must not flow back`);
          }
          if (!column.formula) {
            roles.push(`${where}: a computed column must carry a formula`);
            continue;
          }
          out.formulas.push({ where, formula: column.formula, table });
        } else {
          if (column.jsonPath) roles.push(`${where}: a derived column must not claim a jsonPath`);
          if (column.formula) roles.push(`${where}: a derived column must not carry a formula`);
        }
      }
    }
  }

  return out;
}

function checkReferences(collected: Collected): { checked: number; failures: string[] } {
  const failures: string[] = [];
  let checked = 0;

  for (const { where, formula, table } of collected.formulas) {
    for (const bad of findMalformedReferences(formula)) {
      checked++;
      failures.push(`${where}: ${bad} is not a reference this spec understands`);
    }
    for (const ref of parseReferences(formula)) {
      checked++;
      if (ref.kind === 'ref') {
        if (!collected.namedCells.has(ref.target)) failures.push(`${where}: ${ref.raw} names no cell`);
        continue;
      }
      if (ref.kind === 'word') {
        // Not a cell: `{{word:booleanYes}}` is the spelling the sheet uses, quoted into the formula.
        // The set is decided in `generate.ts`, which throws on an unknown name, so the only thing to
        // check here is that a name was given at all.
        if (!/^[A-Za-z][A-Za-z0-9]*$/.test(ref.target)) {
          failures.push(`${where}: ${ref.raw} must name a word, like {{word:booleanYes}}`);
        }
        continue;
      }
      if (ref.kind === 'this') {
        if (!table) {
          failures.push(`${where}: ${ref.raw} is only meaningful inside a table column`);
        } else if (!table.columns.some((c) => c.id === ref.target)) {
          failures.push(`${where}: ${ref.raw} names no column of table "${table.id}"`);
        }
        continue;
      }

      const [locator, rowKey] = ref.target.split('@');
      const dot = locator.indexOf('.');
      if (dot < 0) {
        failures.push(`${where}: ${ref.raw} must be <table>.<column>`);
        continue;
      }
      const tableId = locator.slice(0, dot);
      const columnId = locator.slice(dot + 1);
      const found = collected.tables.get(tableId);
      if (!found) {
        failures.push(`${where}: ${ref.raw} names no table "${tableId}"`);
        continue;
      }
      if (!found.table.columns.some((c) => c.id === columnId)) {
        failures.push(`${where}: ${ref.raw} names no column "${locator}"`);
        continue;
      }
      if (ref.kind === 'row') {
        const keys = fixedRowKeys(found.table.source);
        if (!keys) {
          failures.push(`${where}: ${ref.raw} points at one row of "${tableId}", whose rows depend on the deal`);
        } else if (!rowKey || !keys.includes(rowKey)) {
          failures.push(`${where}: ${ref.raw} names no row "${rowKey ?? ''}" of "${tableId}"`);
        }
        // Resolving this needs a column to MATCH the key against. Without one the only
        // option is a fixed row address, which the table's own sort button invalidates.
        const keyColumn = found.table.keyColumn;
        if (!keyColumn) {
          failures.push(`${where}: ${ref.raw} needs "${tableId}" to declare a keyColumn`);
        } else if (!found.table.columns.some((c) => c.id === keyColumn)) {
          failures.push(`${where}: "${tableId}" declares keyColumn "${keyColumn}", which is not one of its columns`);
        }
      }
    }
  }

  return { checked, failures };
}

function checkLayout(spec: WorkbookSpec): string[] {
  const failures: string[] = [];
  const seen = new Set<string>();

  for (const sheet of spec.sheets) {
    if (seen.has(sheet.name)) failures.push(`duplicate sheet name "${sheet.name}"`);
    seen.add(sheet.name);
    if (sheet.name.length === 0 || sheet.name.length > 31) {
      failures.push(`sheet name "${sheet.name}" must be 1-31 characters`);
    }
    if (ILLEGAL_SHEET_CHARS.test(sheet.name)) {
      failures.push(`sheet name "${sheet.name}" contains a character Excel forbids`);
    }
    // Two tables sit side by side on the same rows, so overlapping column ranges means one
    // writes over the other. A column may span several grid columns, so the width is the sum of
    // the spans rather than the number of columns.
    // Only tables sharing rows can collide. Stacked ones are free to use the same columns — that is
    // the whole point of a single laid-out sheet.
    for (const band of specTableBands(sheet)) {
      const spans = band.map((t) => ({
        id: t.id,
        from: t.anchorColumn,
        to: t.anchorColumn + t.columns.reduce((n, c) => n + (c.span ?? 1), 0) - 1,
      }));
      for (let i = 0; i < spans.length; i++) {
        for (let j = i + 1; j < spans.length; j++) {
          if (spans[i].from <= spans[j].to && spans[j].from <= spans[i].to) {
            failures.push(`tables "${spans[i].id}" and "${spans[j].id}" share rows and columns on "${sheet.name}"`);
          }
        }
      }
    }
  }

  return failures;
}

/**
 * Validate the workbook spec against the deal schema.
 *
 * The check that matters most is `elements`: MEDDPICC is a 0-4 score across eight elements,
 * and a spec that captures seven of them looks entirely plausible while quietly scoring the
 * deal out of 28. That class of near-miss has shipped here before: in the retired cell mapping,
 * every target resolved against the schema and every one of them named a label cell.
 */
export function checkWorkbookSpec(schema: unknown, spec: WorkbookSpec): SpecCheck {
  const roleFailures: string[] = [];
  const idFailures: string[] = [];
  const collected = collect(spec, roleFailures, idFailures);

  const allPaths = collected.inputs.flatMap((i) => i.paths);
  const schemaFailures = [
    ...collected.pathIssues,
    ...[...new Set(allPaths)].filter((p) => !resolveSchemaPath(schema, p)),
  ];

  const counts = new Map<string, number>();
  for (const p of allPaths) counts.set(p, (counts.get(p) ?? 0) + 1);
  const duplicateFailures = [...counts.entries()]
    .filter(([, n]) => n > 1)
    .map(([p, n]) => `${p} is written by ${n} cells; the read-back would be ambiguous`);

  const elementFailures = QUALIFICATION_ELEMENTS.filter((el) => !counts.has(`qualification.${el}.score`)).map(
    (el) => `no input cell captures qualification.${el}.score`,
  );

  const references = checkReferences(collected);
  const layoutFailures = checkLayout(spec);

  // A dropdown is only honest if the schema says what belongs in it. `validate: true` on a
  // free-text field would otherwise emit an empty list, which Excel renders as a dropdown
  // offering nothing — worse than no dropdown, because it looks deliberate.
  const validationFailures: string[] = [];
  for (const { where, path } of collected.validated) {
    const constraint = schemaConstraint(schema, path);
    if (!constraint) {
      validationFailures.push(`${where}: "${path}" does not resolve, so there is nothing to build a dropdown from`);
      continue;
    }
    const bounded = constraint.minimum !== undefined && constraint.maximum !== undefined;
    if (!constraint.enum && !bounded) {
      validationFailures.push(
        `${where}: "${path}" has neither an enum nor numeric bounds in the schema — remove validate, or add the constraint there`,
      );
    }
  }

  return {
    ok:
      schemaFailures.length === 0 &&
      elementFailures.length === 0 &&
      duplicateFailures.length === 0 &&
      idFailures.length === 0 &&
      roleFailures.length === 0 &&
      references.failures.length === 0 &&
      layoutFailures.length === 0 &&
      validationFailures.length === 0,
    schemaPaths: { checked: allPaths.length, failures: schemaFailures },
    elements: { failures: elementFailures },
    duplicates: { failures: duplicateFailures },
    ids: { checked: collected.namedCells.size + collected.tables.size, failures: idFailures },
    roles: { failures: roleFailures },
    references,
    layout: { failures: layoutFailures },
    validation: { checked: collected.validated.length, failures: validationFailures },
  };
}
