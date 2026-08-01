/**
 * The words the workbook shows for a schema enum value, and the way back.
 *
 * The deal JSON is the source of truth, so its values stay as they are: `in_progress` is what the
 * file holds. But a deal review is read by people on a screen in front of leadership, and
 * `in_progress` is a JSON token, not a status. So the sheet shows a label, the dropdown offers
 * labels, the conditional format matches labels, and this module owns all three.
 *
 * **One map, both directions.** The trap this exists to close has been paid for three times: label a
 * cell in one place and compare its raw value in another, and the comparison silently stops matching
 * — a Scorecard full of `#N/A`, or colours that quietly never appear. Anything that displays an enum
 * value goes through {@link enumLabel}; anything that reads one back goes through
 * {@link canonicalEnumValue}.
 *
 * **The reverse map has to be unambiguous.** Two values labelled the same string would make read-back
 * a coin toss, and the reader would write whichever one this map happened to keep. {@link enumLabels}
 * refuses that at the point a dropdown is built, which is also the guard the localisation work needs:
 * machine translation across thirteen locales makes a collision likely rather than hypothetical.
 *
 * Only values that need it appear here. Most of the schema's enums are already written for a reader
 * — "Best Case", "Economic buyer" — and inventing a second spelling for them would be one more pair
 * of strings to keep in step.
 */

import { type TranslationContext, translateSource } from './translate';

/** JSON value -> the words the sheet shows for it. */
export const ENUM_LABELS: Record<string, string> = {
  // `$defs.sectionStatus`, which `computeCompletion` emits.
  not_started: 'Not started',
  partial: 'Partial',
  // `closePlan.milestones[].status` and `closePlan.criticalActions[].status`.
  pending: 'Pending',
  in_progress: 'In progress',
  // Both enums have this member, and it reads the same way in both.
  complete: 'Complete',
};

/** How a value reads on the sheet. A value with no entry is shown as it stands. */
export function enumLabel(value: string): string {
  return ENUM_LABELS[value] ?? value;
}

/** The words one locale shows for an enum token. */
export function localizedEnumLabel(value: string, context: TranslationContext): string {
  return translateSource(context, enumLabel(value));
}

/** The key a typed word is compared under: case and surrounding space are how people type, not meaning. */
const matchKey = (text: string) => text.trim().toLowerCase();

/**
 * Labels for one enum's values, in order, refusing a set that could not be read back.
 *
 * Scoped to a single enum on purpose: two different enums may legitimately share a label — a close
 * plan and a section can both be "Complete" — and only the members of one dropdown have to be told
 * apart from each other.
 */
export function enumLabels(values: readonly string[], context?: TranslationContext): string[] {
  const seen = new Map<string, string>();
  for (const value of values) {
    const localized = context === undefined ? enumLabel(value) : localizedEnumLabel(value, context);
    const accepted = [value, value.replace(/_/g, ' '), enumLabel(value), localized];
    for (const spelling of accepted) {
      const key = matchKey(spelling);
      const already = seen.get(key);
      if (already !== undefined && already !== value) {
        throw new Error(
          `Enum values "${already}" and "${value}" both read as "${spelling}" — ` +
            'a workbook showing that word could not be read back',
        );
      }
      seen.set(key, value);
    }
  }
  return values.map((value) => (context === undefined ? enumLabel(value) : localizedEnumLabel(value, context)));
}

/** The JSON value a typed word stands for, or undefined when it stands for none of them. */
export function canonicalEnumValue(
  text: string,
  values: readonly string[] = Object.keys(ENUM_LABELS),
  context?: TranslationContext,
): string | undefined {
  const key = matchKey(text);
  const accepted = new Map<string, string>();
  for (const value of values) {
    const localized = context === undefined ? enumLabel(value) : localizedEnumLabel(value, context);
    for (const spelling of [value, value.replace(/_/g, ' '), enumLabel(value), localized]) {
      const normalized = matchKey(spelling);
      const already = accepted.get(normalized);
      if (already !== undefined && already !== value) return undefined;
      accepted.set(normalized, value);
    }
  }
  return accepted.get(key);
}
