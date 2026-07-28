/**
 * Field names this plugin used to use, and what they are now.
 *
 * The schema was written around one vendor — `threeWhys.f5`, `viewOfF5`, `f5Owner`, `team.f5`,
 * `metadata.revenue.pAndIplusAcvx` — and MEDDPICC is a generic framework, so those names went.
 *
 * That rename would be harmless if an old deal file simply failed. It does not: the schema sets
 * `additionalProperties: false` nowhere, so a file using the old names **validates cleanly while
 * its values sit unreachable** — present in the JSON, invisible to the workbook and to scoring.
 * Silent data loss is worse than the branding it replaced, so `validate`, `generate` and `read`
 * all refuse a deal that still uses them, and `migrate` moves them across.
 *
 * There is deliberately no separate detector. A deal has legacy fields exactly when
 * `migrateDeal` reports changes or conflicts, so the check cannot drift from the transform that
 * fixes it — the same reason one schema walker serves both the spec guard and the generator.
 *
 * A **conflict** is a field where both the old and the new name hold a value. The migration will
 * not pick a winner: doing so would discard a value nobody can see, which is the failure this
 * whole module exists to prevent. It reports both paths and stops, leaving the file for a person.
 */
import { readPath } from './json-path';

/**
 * Container path, old key, new key — applied **in order**, which is load-bearing: `threeWhys.f5`
 * becomes `threeWhys.us` first, and the entry after it looks inside that new name. A `[]` in the
 * container means "every element of this list".
 */
export const RENAMED_FIELDS = [
  { container: 'threeWhys', from: 'f5', to: 'us' },
  { container: 'threeWhys.us', from: 'whyF5', to: 'whyUs' },
  { container: 'stakeholders[]', from: 'viewOfF5', to: 'sentiment' },
  { container: 'stakeholders[]', from: 'f5Owner', to: 'relationshipOwner' },
  { container: 'team', from: 'f5', to: 'internal' },
  { container: 'metadata.revenue', from: 'pAndIplusAcvx', to: 'subscription' },
] as const;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Every concrete container a pattern names — one path, or one per list element. */
function expand(deal: unknown, container: string): string[] {
  if (!container.includes('[]')) return [container];
  const [listPath, rest] = container.split('[]');
  const list = readPath(deal, listPath);
  if (!Array.isArray(list)) return [];
  return list.map((_, i) => `${listPath}[${i}]${rest}`);
}

/**
 * Rename a key without moving it to the end of the object.
 *
 * Object key order is not semantic, but this file gets written back to disk and read by a person:
 * appending the new key turns a one-line rename into a diff that looks like a rewrite.
 */
function renameInPlace(holder: Record<string, unknown>, from: string, to: string): void {
  const entries = Object.entries(holder);
  for (const key of Object.keys(holder)) delete holder[key];
  for (const [key, value] of entries) {
    if (key === from) holder[to] = value;
    else holder[key] = value;
  }
}

export interface MigrationResult {
  /** A copy with every legacy field moved. The input is never touched. */
  deal: unknown;
  /** One line per field moved, naming concrete paths. Empty means nothing to do. */
  changes: string[];
  /**
   * Fields where BOTH names hold a value. Only the person who edited the file knows which is
   * right, so the migration reports them and refuses rather than choosing — see below.
   */
  conflicts: string[];
}

export function migrateDeal(deal: unknown): MigrationResult {
  if (deal === null || typeof deal !== 'object') return { deal, changes: [], conflicts: [] };

  const working = JSON.parse(JSON.stringify(deal)) as unknown;
  const changes: string[] = [];
  const conflicts: string[] = [];

  for (const rename of RENAMED_FIELDS) {
    for (const container of expand(working, rename.container)) {
      const holder = readPath(working, container);
      if (!isObject(holder) || !(rename.from in holder)) continue;

      if (rename.to in holder) {
        // Both names hold a value, and nothing here can tell which one the user meant. Choosing
        // would destroy the other — and for `threeWhys.f5`, which is a whole object, that is every
        // answer inside it at once. Discarding a value the user cannot see is the exact failure
        // this module exists to prevent, so it is reported and the migration stops.
        conflicts.push(
          `${container}.${rename.from} and ${container}.${rename.to} are both set — ` +
            'delete whichever is wrong, then migrate again',
        );
        continue;
      }

      renameInPlace(holder, rename.from, rename.to);
      changes.push(`${container}.${rename.from} → ${container}.${rename.to}`);
    }
  }

  return { deal: working, changes, conflicts };
}
