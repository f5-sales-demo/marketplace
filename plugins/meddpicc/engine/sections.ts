/** The MEDDPICC section model — the single source of ordering/keys for the plugin. */

export type SectionStatus = 'not_started' | 'partial' | 'complete';

/** Canonical order, matching metadata.completionStatus key order in the schema. */
export const SECTION_ORDER = [
  'metrics',
  'economicBuyer',
  'decisionCriteria',
  'decisionProcess',
  'paperProcess',
  'implicateThePain',
  'champion',
  'competition',
  'threeWhys',
  'stakeholders',
  'salesStrategy',
  'closePlan',
  'team',
] as const;

/** The 8 scored MEDDPICC elements (live under `qualification`). */
export const QUALIFICATION_ELEMENTS = SECTION_ORDER.slice(0, 8);

/**
 * Display names for the sections, in the sample sheet's wording.
 *
 * The keys are camelCase because they are JSON paths; nobody wants to read `economicBuyer` in a deal
 * review. **This map is also what keyed formulas match on** — `resolveFormula` emits
 * `MATCH("Economic Buyer", …)` against the very cell this labels, so the two cannot disagree. Display
 * the label in one place and match the raw key in the other and the Scorecard fills with #N/A.
 */
export const SECTION_LABELS: Record<(typeof SECTION_ORDER)[number], string> = {
  metrics: 'Metrics',
  economicBuyer: 'Economic Buyer',
  decisionCriteria: 'Decision Criteria',
  decisionProcess: 'Decision Process',
  paperProcess: 'Paper Process',
  implicateThePain: 'Implicate the Pain',
  champion: 'Champion',
  competition: 'Competition',
  threeWhys: 'Three Whys',
  stakeholders: 'Stakeholders',
  salesStrategy: 'Sales Strategy',
  closePlan: 'Close Plan',
  team: 'Team',
};

/** The display name for a section or element key, or the key itself when it is not one. */
export function sectionLabel(key: string): string {
  return SECTION_LABELS[key as (typeof SECTION_ORDER)[number]] ?? key;
}

/**
 * How a completion status reads on the sheet.
 *
 * `not_started` is a JSON value, not English. **The conditional format matches on these strings too**
 * — see `CF_PRESETS.completionText` in xlsx.ts, which imports this map for exactly that reason.
 * Relabel here without relabelling there and the colours quietly stop appearing.
 */
export const SECTION_STATUS_LABELS: Record<SectionStatus, string> = {
  not_started: 'Not started',
  partial: 'Partial',
  complete: 'Complete',
};

export function statusLabel(status: string): string {
  return SECTION_STATUS_LABELS[status as SectionStatus] ?? status;
}
