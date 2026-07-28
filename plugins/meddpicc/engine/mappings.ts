import { resolveSchemaPath } from './schema-path';

export interface MappingCheck {
  ok: boolean;
  cell: { checked: number; failures: string[] };
  /** Targets that point at a cell the template already fills with text — i.e. a label. */
  targets: { checked: number; failures: string[] };
  sfdc: { checked: number; failures: string[] };
}

interface CellMapping {
  cells?: Array<{ jsonPath: string; cell: string }>;
  textBlocks?: Array<{ jsonPath: string; cell: string }>;
  mirrored?: Array<{ jsonPath: string; cells: string[] }>;
  tables?: Array<{ jsonPath: string; startRow: number; maxRows: number; columns?: Record<string, string> }>;
}
interface SfdcMapping {
  fieldMappings?: Array<{ schemaPath: string }>;
}

/**
 * Cells the template owns and a fill must never write.
 *
 * `I7` is `=N4*I5`, the Factored Pipe the sheet computes for itself; writing a value there
 * silently replaces a live formula with a stale number.
 */
const RESERVED_CELLS = new Set(['I7']);

/**
 * Template text that is a PLACEHOLDER rather than a label — `<Insert Partner Name>`.
 *
 * The template marks "replace me" with angle brackets, and uses that form exactly once
 * (verified against all 86 of its shared strings), so recognising the convention beats
 * listing the two addresses that happen to use it today.
 */
function isPlaceholder(text: string): boolean {
  return /^<.*>$/.test(text.trim());
}

/** Every schema path a mapping claims, paired with the cell it claims for it. */
function collectTargets(cell: CellMapping): Array<{ jsonPath: string; address: string }> {
  const out: Array<{ jsonPath: string; address: string }> = [];
  for (const f of cell.cells ?? []) out.push({ jsonPath: f.jsonPath, address: f.cell });
  for (const b of cell.textBlocks ?? []) out.push({ jsonPath: b.jsonPath, address: b.cell });
  for (const m of cell.mirrored ?? []) {
    for (const address of m.cells) out.push({ jsonPath: m.jsonPath, address });
  }
  for (const t of cell.tables ?? []) {
    for (const [field, col] of Object.entries(t.columns ?? {})) {
      for (let i = 0; i < t.maxRows; i++) {
        out.push({ jsonPath: `${t.jsonPath}.${field}`, address: `${col}${t.startRow + i}` });
      }
    }
  }
  return out;
}

/**
 * Validate a cell mapping two ways.
 *
 * **Schema** — every `jsonPath` resolves against the deal schema. This is the check that
 * always existed.
 *
 * **Targets** — every cell the mapping writes is a cell the template leaves for data. This
 * one is new, and it is the check that matters: an earlier revision of `cell-mapping.json`
 * named the LABEL cell beside each value (`B4` "Account Name" instead of `C4`, `C14` the
 * question instead of `H14` the answer), and every one of those passed the schema check
 * while being wrong. Filling through it would have overwritten the template's own headings.
 *
 * A label is a string the template ships. A data cell is blank, holds a numeric placeholder
 * such as the `0` in `N6`/`N7`, or holds an angle-bracketed `<Insert …>` placeholder. So
 * "the target must not already contain text that is not a placeholder" separates the two
 * exactly, and needs no second list of addresses to maintain.
 *
 * `templateCellText` reads a cell's string content from the template, or null. It is
 * injected so this stays pure — the caller owns the xlsx.
 */
export function checkMappings(
  schema: unknown,
  cellMapping: unknown,
  sfdcMapping: unknown,
  templateCellText?: (address: string) => string | null,
): MappingCheck {
  const cell = (cellMapping ?? {}) as CellMapping;
  const sfdc = (sfdcMapping ?? {}) as SfdcMapping;

  const targets = collectTargets(cell);
  const cellFailures = [...new Set(targets.map((t) => t.jsonPath))].filter((p) => !resolveSchemaPath(schema, p));

  const targetFailures: string[] = [];
  for (const { address } of targets) {
    if (RESERVED_CELLS.has(address)) {
      targetFailures.push(`${address} is reserved (the template computes it)`);
      continue;
    }
    const text = templateCellText?.(address);
    if (text !== null && text !== undefined && text.trim() !== '' && !isPlaceholder(text)) {
      targetFailures.push(`${address} holds the template's own text ${JSON.stringify(text.slice(0, 40))}`);
    }
  }

  const sfdcPaths = (sfdc.fieldMappings ?? []).map((m) => m.schemaPath);
  const sfdcFailures = sfdcPaths.filter((p) => !resolveSchemaPath(schema, p));

  return {
    ok: cellFailures.length === 0 && targetFailures.length === 0 && sfdcFailures.length === 0,
    cell: { checked: targets.length, failures: cellFailures },
    targets: { checked: templateCellText ? targets.length : 0, failures: targetFailures },
    sfdc: { checked: sfdcPaths.length, failures: sfdcFailures },
  };
}
