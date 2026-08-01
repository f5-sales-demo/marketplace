/** The minimal translation surface shared by planning, formulas, and OOXML serialization. */
export interface TranslationContext {
  slug: string;
  translations: Readonly<Record<string, string>>;
}

export const ENGLISH_TRANSLATION: TranslationContext = Object.freeze({ slug: 'en', translations: Object.freeze({}) });

export function translateSource(context: TranslationContext, source: string): string {
  if (context.slug === 'en') return source;
  const translated = context.translations[source];
  if (translated === undefined) {
    throw new Error(`The ${context.slug} locale is missing a translation for ${JSON.stringify(source)}`);
  }
  return translated;
}
