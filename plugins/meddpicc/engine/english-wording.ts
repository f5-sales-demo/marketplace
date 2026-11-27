/** Current English wording, paired with the existing translation identifiers.
 * Locale catalogues remain unchanged until their separately owned reconciliation.
 * This maps engine-owned prose only; saved deal values are never rewritten.
 */
const WORDING: Readonly<Record<string, string>> = Object.freeze({
  'The compelling business pain that creates urgency to act': 'Customer-confirmed business problem and its impact',
  'Urgent — Multiple stakeholders confirm pain; triggering event identified; clear deadline driver':
    'Confirmed — Multiple stakeholders confirm quantified impact with attributable evidence',
  'Mobilizing — Champion is actively coaching you, sharing intel, and taking concrete actions weekly':
    'Mobilizing — Champion is actively coaching you, sharing intel, and taking concrete actions during the review period',
  'Identified — High-level understanding only; no dates or named owners':
    'Identified — High-level understanding only; steps and owners not confirmed',
  'Mapped — Major steps identified but dates or owners missing':
    'Mapped — Major steps identified but ownership or gate requirements unconfirmed',
  'Validated — Step-by-step process documented with named owners and dates':
    'Validated — Step-by-step process documented with named owners and customer-agreed milestones',
  "What is the client's business approval process and typical timeline for a transaction of this nature?":
    "What is the client's business approval process, and have any timing constraints or milestones been agreed?",
});

const IDENTIFIERS = new Map(Object.entries(WORDING).map(([key, text]) => [text, key]));

export function translationKey(text: string): string {
  return IDENTIFIERS.get(text) ?? text;
}

export function englishWording(text: string): string {
  return WORDING[text] ?? text;
}
