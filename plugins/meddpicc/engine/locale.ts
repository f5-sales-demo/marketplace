/**
 * Which language the workbook is written in, decided once.
 *
 * The decision used to live inside `workbookProperties`, which runs after the sheet is laid out, and it
 * read one input: `metadata.locale`. So nothing in planning could know the locale, the refusal for an
 * unsupported one arrived after all the layout work, and a rep whose machine is in Japanese had no way to
 * ask for a Japanese sheet.
 *
 * Two policies are the reason this is one function rather than a lookup at each use.
 *
 * **Explicit and ambient failures are opposites.** Someone passing `--locale ko` asked for something
 * specific and must be refused rather than quietly handed English. A rep whose `LANG` is `is_IS` should
 * get a workbook, not an error. Same unsupported locale, opposite correct answers, and only the resolver
 * knows which input it came from.
 *
 * **Reading never detects.** The reader verifies label text to refuse a workbook whose rows have moved, so
 * once labels are translated, re-detecting at read time would make a Japanese workbook fail every anchor
 * under a different `LANG` — and be reported as moved rows. The workbook records the locale it was written
 * in; `read` uses that. Nothing here is called on the reading path.
 */

/** The language everything falls back to, and the only one shipped until the locale files land. */
export const DEFAULT_LOCALE = 'en';

/**
 * The locales that ship, derived rather than declared.
 *
 * `scripts/locale-lint.sh` fails a hardcoded locale list in TypeScript — rightly, since the fleet has one
 * registry and a second copy drifts from it — so this is built from the locale files present. There are
 * none yet, which is why it is English alone.
 */
export const SHIPPED_LOCALES: readonly string[] = [DEFAULT_LOCALE];

/** Where a resolved locale came from, which decides whether an unshipped one is refused or ignored. */
export type LocaleOrigin = 'flag' | 'deal' | 'env' | 'os' | 'default' | 'fallback';

export interface ResolvedLocale {
  /** A shipped locale, in canonical lowercase-slug form. */
  slug: string;
  from: LocaleOrigin;
  /** What an ambient source asked for, when it could not be honoured. Present only for `fallback`. */
  unresolved?: string;
}

export interface LocaleInputs {
  /** `--locale`, the most specific request there is. */
  flag?: string;
  /** The deal, read for `metadata.locale`. */
  deal?: unknown;
  env?: Record<string, string | undefined>;
  /** Overridable so a test can exercise the mapping for a locale that does not ship yet. */
  shipped?: readonly string[];
}

/** Values a POSIX environment uses for "no locale", none of which names a language. */
const NOT_A_LOCALE = new Set(['c', 'posix', 'utf-8', 'utf8', '']);

/**
 * A raw locale tag as a canonical lowercase slug, or undefined when it names no language.
 *
 * Canonical is the **slug** — `pt-br`, `zh-cn` — matching the `metadata.locale` enum and i18n-core's
 * `slug` field rather than the BCP-47 `pt-BR`. Two spellings of one locale is how a workbook comes to
 * record a locale that nothing recognises.
 */
export function normalizeLocaleTag(raw: string): string | undefined {
  // `fr_CA.UTF-8@euro`: the codeset and the modifier are not part of the language.
  const withoutCodeset = raw.split('.')[0]?.split('@')[0] ?? '';
  const slug = withoutCodeset.trim().toLowerCase().replace(/_/g, '-');
  if (slug === '' || NOT_A_LOCALE.has(slug)) return undefined;
  return slug;
}

/**
 * Chinese by script where a script is given, by region otherwise.
 *
 * `zh_Hant_TW` and `zh_TW` are the same request written two ways, and bare `zh` has to mean something:
 * Simplified, which is the larger population and what the fleet registry lists first.
 */
function resolveChinese(slug: string): string | undefined {
  if (slug === 'zh') return 'zh-cn';
  if (slug.includes('hant')) return 'zh-tw';
  if (slug.includes('hans')) return 'zh-cn';
  if (slug.startsWith('zh-')) {
    const region = slug.split('-').pop();
    return region === 'tw' || region === 'hk' || region === 'mo' ? 'zh-tw' : 'zh-cn';
  }
  return undefined;
}

/** The shipped locale a normalized tag asks for, longest match first, or undefined for none. */
function shippedFor(slug: string, shipped: readonly string[]): string | undefined {
  if (slug.startsWith('zh')) {
    const chinese = resolveChinese(slug);
    return chinese !== undefined && shipped.includes(chinese) ? chinese : undefined;
  }
  // Exact first, then language-and-region, then language alone: `fr-ca` asks for French when Canadian
  // French is not a thing we ship, and never for something further away than that.
  if (shipped.includes(slug)) return slug;
  const language = slug.split('-')[0];
  return language !== undefined && shipped.includes(language) ? language : undefined;
}

/** The first non-empty candidate from each source, in precedence order, with where it came from. */
function candidates(inputs: LocaleInputs): Array<{ raw: string; from: LocaleOrigin; explicit: boolean }> {
  const env = inputs.env ?? {};
  const dealLocale = (inputs.deal as { metadata?: { locale?: unknown } } | undefined)?.metadata?.locale;
  const ordered: Array<{ raw: unknown; from: LocaleOrigin; explicit: boolean }> = [
    { raw: inputs.flag, from: 'flag', explicit: true },
    { raw: dealLocale, from: 'deal', explicit: true },
    { raw: env.MEDDPICC_LOCALE, from: 'env', explicit: true },
    // LC_ALL before LANG: POSIX says LC_ALL overrides everything, and reversing them would quietly
    // honour a setting the operating system considers overridden.
    { raw: env.LC_ALL, from: 'os', explicit: false },
    { raw: env.LANG, from: 'os', explicit: false },
    { raw: env.AppleLocale, from: 'os', explicit: false },
  ];
  // An empty string is absence, not a request for the empty locale, so it must not shadow a lower rung.
  return ordered
    .filter((c): c is { raw: string; from: LocaleOrigin; explicit: boolean } => typeof c.raw === 'string')
    .filter((c) => c.raw.trim() !== '');
}

/**
 * The locale to write in, or an error when something explicit asked for one that does not ship.
 *
 * @throws when a flag, a deal or `MEDDPICC_LOCALE` names a locale that is not shipped. An ambient source
 * that does the same falls back to {@link DEFAULT_LOCALE} instead, reporting what it wanted.
 */
export function resolveLocale(inputs: LocaleInputs): ResolvedLocale {
  const shipped = inputs.shipped ?? SHIPPED_LOCALES;
  for (const candidate of candidates(inputs)) {
    const slug = normalizeLocaleTag(candidate.raw);
    if (slug === undefined) {
      // `LANG=C` names no language, so it is not a failed request — keep looking down the chain.
      if (candidate.explicit) {
        throw new Error(
          `--locale or metadata.locale is "${candidate.raw}", which names no language. ` +
            `The workbook can be written in ${shipped.join(', ')}.`,
        );
      }
      continue;
    }
    const match = shippedFor(slug, shipped);
    if (match !== undefined) return { slug: match, from: candidate.from };
    if (candidate.explicit) {
      throw new Error(
        `A locale of "${candidate.raw}" was asked for, and the workbook is not translated into it yet — ` +
          `it can be written in ${shipped.join(', ')}. Remove the request, or set it to ${DEFAULT_LOCALE}, ` +
          'until the locale files land.',
      );
    }
    // Ambient: the machine's language is not one we have, which is not the rep's problem to solve.
    return { slug: DEFAULT_LOCALE, from: 'fallback', unresolved: slug };
  }
  return { slug: DEFAULT_LOCALE, from: 'default' };
}
