import { type TranslationContext, translateSource } from './translate';

/** Engine-owned words that are rendered outside the workbook spec. */
export const BOOLEAN_YES = 'Yes';
export const BOOLEAN_NO = 'No';
export const FALLBACK_HEADER = 'MEDDPICC Deal Review';

const booleanKey = (text: string) => text.trim().toLowerCase();

export function booleanLabels(context: TranslationContext): [string, string] {
  const yes = translateSource(context, BOOLEAN_YES);
  const no = translateSource(context, BOOLEAN_NO);
  const yesKeys = new Set([BOOLEAN_YES, yes].map(booleanKey));
  const collision = [BOOLEAN_NO, no].find((word) => yesKeys.has(booleanKey(word)));
  if (collision !== undefined) {
    throw new Error(`Boolean values Yes and No both read as ${JSON.stringify(collision)} in ${context.slug}`);
  }
  return [yes, no];
}

export function canonicalBooleanValue(text: string, context: TranslationContext): boolean | undefined {
  const [yes, no] = booleanLabels(context);
  const key = booleanKey(text);
  if ([BOOLEAN_YES, yes].some((word) => booleanKey(word) === key)) return true;
  if ([BOOLEAN_NO, no].some((word) => booleanKey(word) === key)) return false;
  return undefined;
}
