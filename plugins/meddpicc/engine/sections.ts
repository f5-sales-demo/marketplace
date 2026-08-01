/** The MEDDPICC section model — the single source of ordering/keys for the plugin. */

import { enumLabel, localizedEnumLabel } from './labels';
import type { TranslationContext } from './translate';

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
 * One entry point, in `labels.ts`, shared with the close-plan statuses and with the conditional
 * formats that match on these very strings. Label a cell in one place and compare its raw value in
 * another and the comparison silently stops matching — which is why there is no second map here.
 */
export function statusLabel(status: string, context?: TranslationContext): string {
  return context === undefined ? enumLabel(status) : localizedEnumLabel(status, context);
}
