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

/** The key a typed word is compared under: case and surrounding space are how people type, not meaning. */
const matchKey = (text: string) => text.trim().toLowerCase();

/**
 * Labels for one enum's values, in order, refusing a set that could not be read back.
 *
 * Scoped to a single enum on purpose: two different enums may legitimately share a label — a close
 * plan and a section can both be "Complete" — and only the members of one dropdown have to be told
 * apart from each other.
 */
export function enumLabels(values: readonly string[]): string[] {
  const seen = new Map<string, string>();
  for (const value of values) {
    const key = matchKey(enumLabel(value));
    const already = seen.get(key);
    if (already !== undefined) {
      throw new Error(
        `Enum values "${already}" and "${value}" both read as "${enumLabel(value)}" — ` +
          'a workbook showing that word could not be read back',
      );
    }
    seen.set(key, value);
  }
  return values.map(enumLabel);
}

/** Every label, and every canonical value, mapped to the canonical value it stands for. */
const CANONICAL: Map<string, string> = (() => {
  const out = new Map<string, string>();
  for (const [value, label] of Object.entries(ENUM_LABELS)) {
    // The canonical value first: a rep may type what the dropdown offers or what they have seen in
    // the JSON, and both are the same intent.
    out.set(matchKey(value), value);
    // `_` reads as a space to someone typing "in progress" rather than "in_progress".
    out.set(matchKey(value.replace(/_/g, ' ')), value);
    out.set(matchKey(label), value);
  }
  return out;
})();

/** The JSON value a typed word stands for, or undefined when it stands for none of them. */
export function canonicalEnumValue(text: string): string | undefined {
  return CANONICAL.get(matchKey(text));
}
