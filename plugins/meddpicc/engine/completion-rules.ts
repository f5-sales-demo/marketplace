/**
 * What "complete" means, written once.
 *
 * A section's status is read in two places that must never disagree: the engine computes it from the
 * deal, and the workbook wants to show it live so that filling a cell in during a review updates the
 * status beside it. Writing the rules twice — once in TypeScript and once in Excel formulas — is a
 * second implementation that can drift, which is what this codebase refuses everywhere else (see
 * `labels.ts`, which owns every displayed enum word in both directions).
 *
 * So a rule is DATA. Each section declares two predicates over deal paths:
 *
 * - `complete` — everything the section needs is there.
 * - `started`  — something is there. A section that is neither is `not_started`.
 *
 * {@link evaluate} reads a predicate against a deal; the workbook generator compiles the same
 * predicate into a formula over the cells those paths landed in. One rule, two readers.
 *
 * The vocabulary is deliberately tiny — six leaf kinds and two combinators cover all thirteen rules.
 * Anything that needed a seventh would be a rule the sheet could not express, and that is worth
 * discovering here rather than in Excel.
 */
import { readPath } from './json-path';
import { QUALIFICATION_ELEMENTS } from './sections';

export type Predicate =
  /** Every one of these holds. Vacuously true. */
  | { kind: 'all'; of: Predicate[] }
  /** At least one of these holds. Vacuously false. */
  | { kind: 'any'; of: Predicate[] }
  /** A text field with something in it. Whitespace is not something. */
  | { kind: 'nonEmpty'; path: string }
  /** A number at or above `value`. A missing number reads as 0, as the engine has always read it. */
  | { kind: 'atLeast'; path: string; value: number }
  /** An array of text with at least one non-empty entry — a question somebody has answered. */
  | { kind: 'anyNonEmpty'; list: string }
  /**
   * An array with at least `value` entries that have something in them — see {@link ENTRY_FIELDS}.
   *
   * "Something" rather than "exists" on purpose. Counting the array's length made
   * `team.internal: [{}]` — one object with no fields — complete the whole Team section, and the sheet
   * could never agree with that: an entry whose every cell is empty is indistinguishable from one of the
   * pre-allocated blank rows.
   */
  | { kind: 'countAtLeast'; list: string; value: number }
  /** Every entry of an array has all of these fields filled in. Vacuously true on an empty array. */
  | { kind: 'everyEntryHas'; list: string; fields: string[] };

export interface SectionRule {
  complete: Predicate;
  started: Predicate;
}

const all = (...of: Predicate[]): Predicate => ({ kind: 'all', of });
const any = (...of: Predicate[]): Predicate => ({ kind: 'any', of });
const nonEmpty = (path: string): Predicate => ({ kind: 'nonEmpty', path });
const atLeast = (path: string, value: number): Predicate => ({ kind: 'atLeast', path, value });
const anyNonEmpty = (list: string): Predicate => ({ kind: 'anyNonEmpty', list });
const countAtLeast = (list: string, value: number): Predicate => ({ kind: 'countAtLeast', list, value });
const everyEntryHas = (list: string, fields: string[]): Predicate => ({ kind: 'everyEntryHas', list, fields });

/** Text with something in it. The one place trimming is decided, for both readers. */
function isFilled(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/** The entries of a list, or none when the path holds anything else. */
function entriesOf(deal: unknown, list: string): unknown[] {
  const value = readPath(deal, list);
  return Array.isArray(value) ? value : [];
}

/** A list path is an array; `readPath` on `a.b` of a non-array is `undefined`, which reads as absent. */
function isList(deal: unknown, list: string): boolean {
  return Array.isArray(readPath(deal, list));
}

/**
 * What each list's entries are made of: the item's declared fields, which are exactly the columns the
 * workbook gives them.
 *
 * A property of the LIST rather than of a predicate, because that is what it is — and because the two
 * halves of a rule must not disagree about which rows they are talking about. `countAtLeast` and
 * `everyEntryHas` both read this, and so does the formula compiler.
 *
 * Named rather than taken as "whatever the object has": the schema does not forbid extra properties, so
 * `[{"unmappedField":"x"}]` validates and the workbook has no cell for it. Counting that entry would be
 * a rule the sheet could never agree with.
 */
export const ENTRY_FIELDS: Record<string, readonly string[]> = {
  stakeholders: [
    'name',
    'title',
    'roleInDeal',
    'mustSayYes',
    'canSayNo',
    'whatTheyNeedToBelieve',
    'sentiment',
    'relationshipOwner',
  ],
  'closePlan.milestones': ['description', 'targetDate', 'status'],
  'closePlan.criticalActions': ['action', 'owner', 'dueDate', 'status'],
  'team.internal': ['name', 'role', 'dateRequiredFrom', 'assignedToDeal'],
  'team.partner': ['name', 'role', 'dateRequiredFrom', 'assignedToDeal'],
};

/** The fields that make a row of this list an entry. A list nobody described is a rule nobody can read. */
export function entryFieldsOf(list: string): readonly string[] {
  const fields = ENTRY_FIELDS[list];
  if (!fields) throw new Error(`no entry fields are declared for the list "${list}"`);
  return fields;
}

/**
 * An entry with something in it — the same question the sheet asks of a row.
 *
 * A field counts when it would show something in a cell: text with characters in it, any number
 * including nought, either boolean. Whitespace does not, and neither does a nested object or array,
 * because no cell displays one — so the two readers stay aligned by construction rather than by
 * agreement.
 */
function hasContent(entry: unknown, fields: readonly string[]): boolean {
  if (entry === null || typeof entry !== 'object') return false;
  const record = entry as Record<string, unknown>;
  return fields.some((field) => {
    const value = record[field];
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'number') return Number.isFinite(value);
    return typeof value === 'boolean';
  });
}

export function evaluate(predicate: Predicate, deal: unknown): boolean {
  switch (predicate.kind) {
    case 'all':
      return predicate.of.every((p) => evaluate(p, deal));
    case 'any':
      return predicate.of.some((p) => evaluate(p, deal));
    case 'nonEmpty':
      return isFilled(readPath(deal, predicate.path));
    case 'atLeast': {
      const value = readPath(deal, predicate.path);
      const score = typeof value === 'number' && Number.isFinite(value) ? value : 0;
      return score >= predicate.value;
    }
    case 'anyNonEmpty':
      return entriesOf(deal, predicate.list).some(isFilled);
    case 'countAtLeast': {
      // The fields first, so a rule naming a list nobody has described fails on every deal rather than
      // only on one that happens to carry that array.
      const fields = entryFieldsOf(predicate.list);
      return (
        isList(deal, predicate.list) &&
        entriesOf(deal, predicate.list).filter((entry) => hasContent(entry, fields)).length >= predicate.value
      );
    }
    case 'everyEntryHas':
      return entriesOf(deal, predicate.list).every((entry) =>
        predicate.fields.every((field) => isFilled((entry as Record<string, unknown>)?.[field])),
      );
    default:
      // Unreachable from TypeScript, and worth a throw all the same: returning false here would turn a
      // typo into a section that can never be complete, which looks exactly like an unfinished deal.
      throw new Error(`no such predicate: ${JSON.stringify((predicate as { kind: unknown }).kind)}`);
  }
}

/**
 * A MEDDPICC element: scored at least 3, with a question answered and evidence written down.
 *
 * `started` is the negation of the engine's original "nothing at all" test — score 0 with no response
 * and no evidence — spelled as the positive so both halves of the rule read the same way.
 */
const elementRule = (element: string): SectionRule => {
  const at = `qualification.${element}`;
  return {
    complete: all(atLeast(`${at}.score`, 3), anyNonEmpty(`${at}.responses`), nonEmpty(`${at}.evidence`)),
    started: any(atLeast(`${at}.score`, 1), anyNonEmpty(`${at}.responses`), nonEmpty(`${at}.evidence`)),
  };
};

/**
 * Every section's rule, by the name `SECTION_ORDER` uses.
 *
 * The eight elements come from one template: eight hand-written copies of the same rule is eight
 * chances for one of them to be subtly different, and the near-miss that shipped here before was
 * exactly that shape — a spec that captured seven elements and scored the deal out of 28.
 */
export const SECTION_RULES: Record<string, SectionRule> = {
  ...Object.fromEntries(QUALIFICATION_ELEMENTS.map((element) => [element, elementRule(element)])),
  threeWhys: {
    complete: all(
      nonEmpty('threeWhys.us.whyAnything'),
      nonEmpty('threeWhys.us.whyUs'),
      nonEmpty('threeWhys.us.whyNow'),
    ),
    started: any(nonEmpty('threeWhys.us.whyAnything'), nonEmpty('threeWhys.us.whyUs'), nonEmpty('threeWhys.us.whyNow')),
  },
  stakeholders: {
    complete: all(countAtLeast('stakeholders', 1), everyEntryHas('stakeholders', ['name', 'title', 'roleInDeal'])),
    started: countAtLeast('stakeholders', 1),
  },
  salesStrategy: {
    complete: all(nonEmpty('salesStrategy.differentiatedValueProposition'), nonEmpty('salesStrategy.winStrategy')),
    started: any(nonEmpty('salesStrategy.differentiatedValueProposition'), nonEmpty('salesStrategy.winStrategy')),
  },
  closePlan: {
    complete: all(countAtLeast('closePlan.milestones', 1), countAtLeast('closePlan.criticalActions', 1)),
    started: any(countAtLeast('closePlan.milestones', 1), countAtLeast('closePlan.criticalActions', 1)),
  },
  // The internal team is what completes this; a partner team on its own is a start. Asking about both
  // in `started` changes nothing — `complete` has already fired when the internal team is there — and
  // it says what the rule means rather than what the original code happened to check.
  team: {
    complete: countAtLeast('team.internal', 1),
    started: any(countAtLeast('team.internal', 1), countAtLeast('team.partner', 1)),
  },
};

/** The status one section's rule gives for this deal. */
export function statusOf(section: string, deal: unknown): 'complete' | 'partial' | 'not_started' {
  const rule = SECTION_RULES[section];
  if (!rule) throw new Error(`no completion rule for section "${section}"`);
  if (evaluate(rule.complete, deal)) return 'complete';
  return evaluate(rule.started, deal) ? 'partial' : 'not_started';
}
