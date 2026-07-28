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
import { resolveSchemaPath } from './schema-path';
import { QUALIFICATION_ELEMENTS, SECTION_ORDER } from './sections';
import type { StyleName } from './xlsx';

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
  width?: number;
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
  /** 1-based column the table starts at. Two tables share a sheet by sitting side by side. */
  anchorColumn: number;
  headerRow: number;
  /** Blank rows to keep below the data so the table has room to grow in Excel. */
  minRows?: number;
  columns: SpecColumn[];
}

export type SpecBlock =
  | { kind: 'title'; text: string }
  | { kind: 'section'; text: string }
  | { kind: 'spacer' }
  | { kind: 'field'; id: string; label: string; jsonPath: string; valueType: ValueType; height?: number }
  | { kind: 'computed'; id: string; label: string; formula: string; valueType: ValueType; height?: number };

export type SpecSheet =
  | { name: string; kind: 'form'; blocks: SpecBlock[]; columns?: { min: number; max: number; width: number }[] }
  | { name: string; kind: 'table'; tables: SpecTable[] };

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
  kind: 'ref' | 'col' | 'row' | 'this';
  target: string;
  raw: string;
}

const REFERENCE = /\{\{(ref|col|row|this):([^{}]+)\}\}/g;
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
  const bad = [...formula.matchAll(PLACEHOLDER)].filter((m) => !/^(ref|col|row|this):.+$/.test(m[1])).map((m) => m[0]);

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
}

function collect(spec: WorkbookSpec, roles: string[], ids: string[]): Collected {
  const out: Collected = { namedCells: new Map(), tables: new Map(), inputs: [], formulas: [], pathIssues: [] };

  const checkValueType = (where: string, valueType: ValueType) => {
    if (!(valueType in VALUE_TYPE_STYLE)) roles.push(`${where}: unknown valueType "${valueType}"`);
  };

  for (const sheet of spec.sheets) {
    if (sheet.kind === 'form') {
      for (const block of sheet.blocks) {
        if (block.kind !== 'field' && block.kind !== 'computed') continue;
        const where = `${sheet.name}.${block.id}`;
        if (out.namedCells.has(block.id)) {
          ids.push(`duplicate cell id "${block.id}" (${out.namedCells.get(block.id)?.sheet} and ${sheet.name})`);
        }
        out.namedCells.set(block.id, { sheet: sheet.name, label: block.label });
        checkValueType(where, block.valueType);

        if (block.kind === 'field') {
          if (!block.jsonPath) {
            roles.push(`${where}: a field must name a jsonPath`);
          } else if (block.jsonPath.includes(WILDCARD)) {
            roles.push(`${where}: a form field cannot use a wildcard — there is no key axis to expand it over`);
          } else {
            out.inputs.push({ where, paths: [block.jsonPath] });
          }
        } else {
          out.formulas.push({ where, formula: block.formula, table: null });
        }
      }
      continue;
    }

    for (const table of sheet.tables) {
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
          } catch (e) {
            roles.push(`${where}: ${e instanceof Error ? e.message : String(e)}`);
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
    if (sheet.kind !== 'table') continue;

    // Two tables share a sheet by sitting side by side; both grow downward for ever, so
    // overlapping column ranges means one eventually writes over the other.
    const spans = sheet.tables.map((t) => ({
      id: t.id,
      from: t.anchorColumn,
      to: t.anchorColumn + t.columns.length - 1,
    }));
    for (let i = 0; i < spans.length; i++) {
      for (let j = i + 1; j < spans.length; j++) {
        if (spans[i].from <= spans[j].to && spans[j].from <= spans[i].to) {
          failures.push(`tables "${spans[i].id}" and "${spans[j].id}" overlap on sheet "${sheet.name}"`);
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
 * deal out of 28. The same class of near-miss shipped once already in `cell-mapping.json`,
 * where every target resolved against the schema and every one of them named a label cell.
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

  return {
    ok:
      schemaFailures.length === 0 &&
      elementFailures.length === 0 &&
      duplicateFailures.length === 0 &&
      idFailures.length === 0 &&
      roleFailures.length === 0 &&
      references.failures.length === 0 &&
      layoutFailures.length === 0,
    schemaPaths: { checked: allPaths.length, failures: schemaFailures },
    elements: { failures: elementFailures },
    duplicates: { failures: duplicateFailures },
    ids: { checked: collected.namedCells.size + collected.tables.size, failures: idFailures },
    roles: { failures: roleFailures },
    references,
    layout: { failures: layoutFailures },
  };
}
