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
