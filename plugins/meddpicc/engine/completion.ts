import { statusOf } from './completion-rules';
import { SECTION_ORDER, type SectionStatus } from './sections';

export interface CompletionResult {
  order: readonly string[];
  completionStatus: Record<string, SectionStatus>;
  nextIncompleteSection: string | null;
}

/**
 * Where the deal stands, section by section.
 *
 * The rules themselves live in `completion-rules.ts` as data, because the workbook has to show these
 * statuses live — filling a cell in during a review should update the status beside it — and a second
 * set of rules written in Excel formulas would be free to disagree with this one. So this walks the
 * same predicates the generator compiles.
 */
export function computeCompletion(deal: unknown): CompletionResult {
  const completionStatus: Record<string, SectionStatus> = {};
  for (const section of SECTION_ORDER) completionStatus[section] = statusOf(section, deal) as SectionStatus;
  const nextIncompleteSection = SECTION_ORDER.find((s) => completionStatus[s] !== 'complete') ?? null;
  return { order: SECTION_ORDER, completionStatus, nextIncompleteSection };
}
