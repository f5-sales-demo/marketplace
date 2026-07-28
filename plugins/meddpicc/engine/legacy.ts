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
 * A field can end up set under BOTH names — someone adds the new one by hand and leaves the old
 * one in place. Most of those are not actually ambiguous, and the rule for telling the difference
 * is: **resolve only when the value being dropped carries no information the kept value lacks.**
 * Identical values, an empty value on either side, and objects that differ only in which keys they
 * carry all qualify. Two non-empty values that disagree do not, and neither do two non-empty lists,
 * which cannot be combined without inventing an identity and an order for their elements.
 *
 * What is left is a genuine disagreement, and the migration will not pick a winner: doing so would
 * discard a value nobody can see, the failure this module exists to prevent. Those are reported and
 * left for a person. Every automatic resolution is reported too, with the reason it was safe —
 * nothing is dropped silently.
 */
import { readPath } from './json-path';
import { deepEqual } from './validate';

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
  /** Fields that were set under both names and could be settled, with the reason each was safe. */
  resolved: string[];
  /**
   * Fields set under both names with genuinely different values. Only the person who edited the
   * file knows which is right, so these are reported and both sides left untouched.
   */
  conflicts: string[];
}

/**
 * Whether a value carries no information, so dropping it loses nothing.
 *
 * `0` and `false` are emphatically NOT empty: a zero score and a "no" are answers, and treating
 * them as absence would overwrite them with whatever the other side happened to hold.
 */
function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  // Objects are deliberately never "empty" here: an object with nothing in it is handled by the
  // key-by-key merge below, which reaches the same answer. Asking twice would be two rules to keep
  // in agreement, and mutation testing showed the second one could not be observed at all.
  return false;
}

interface Settlement {
  value: unknown;
  resolved: string[];
  conflicts: string[];
}

/**
 * Settle one field that exists under both names, or report why it cannot be settled.
 *
 * Objects are merged key by key with these same rules, which is what makes the common case work:
 * a hand-added `threeWhys.us` holding one of three answers merges with the `threeWhys.f5` holding
 * all three, because two keys exist on one side only and the third is identical.
 */
function settle(legacy: unknown, current: unknown, path: string, legacyPath: string): Settlement {
  if (deepEqual(legacy, current)) {
    return { value: current, resolved: [`${legacyPath} dropped — identical to ${path}`], conflicts: [] };
  }
  if (isEmpty(legacy)) {
    return { value: current, resolved: [`${legacyPath} dropped — it was empty and ${path} is set`], conflicts: [] };
  }
  if (isEmpty(current)) {
    return { value: legacy, resolved: [`${legacyPath} moved to ${path} — ${path} was empty`], conflicts: [] };
  }

  if (isObject(legacy) && isObject(current)) {
    const merged: Record<string, unknown> = { ...current };
    const resolved: string[] = [];
    const conflicts: string[] = [];
    for (const [key, legacyValue] of Object.entries(legacy)) {
      if (!(key in current)) {
        merged[key] = legacyValue;
        continue;
      }
      const inner = settle(legacyValue, current[key], `${path}.${key}`, `${legacyPath}.${key}`);
      merged[key] = inner.value;
      resolved.push(...inner.resolved);
      conflicts.push(...inner.conflicts);
    }
    return { value: merged, resolved, conflicts };
  }

  // Two non-empty values that disagree — including two lists, which cannot be combined without
  // inventing which elements are the same person and what order they belong in.
  return {
    value: current,
    resolved: [],
    conflicts: [`${legacyPath} and ${path} are both set and differ — delete whichever is wrong, then migrate again`],
  };
}

export function migrateDeal(deal: unknown): MigrationResult {
  if (deal === null || typeof deal !== 'object') return { deal, changes: [], resolved: [], conflicts: [] };

  const working = JSON.parse(JSON.stringify(deal)) as unknown;
  const changes: string[] = [];
  const resolved: string[] = [];
  const conflicts: string[] = [];

  for (const rename of RENAMED_FIELDS) {
    for (const container of expand(working, rename.container)) {
      const holder = readPath(working, container);
      if (!isObject(holder) || !(rename.from in holder)) continue;

      if (rename.to in holder) {
        const settled = settle(
          holder[rename.from],
          holder[rename.to],
          `${container}.${rename.to}`,
          `${container}.${rename.from}`,
        );
        if (settled.conflicts.length > 0) {
          // Leave BOTH sides exactly as they are. A half-merged object looks migrated while burying
          // the disagreement that stopped it, which is worse than not starting.
          conflicts.push(...settled.conflicts);
          continue;
        }
        holder[rename.to] = settled.value;
        delete holder[rename.from];
        resolved.push(...settled.resolved);
        continue;
      }

      renameInPlace(holder, rename.from, rename.to);
      changes.push(`${container}.${rename.from} → ${container}.${rename.to}`);
    }
  }

  return { deal: working, changes, resolved, conflicts };
}
