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

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import localeIndex from './locales/index.json' with { type: 'json' };
import { isNonProse, translatableSet } from './translatable';
import { type TranslationContext, translateSource } from './translate';
import type { WorkbookSpec } from './workbook-spec';

/** The language everything falls back to, and the only one shipped until the locale files land. */
export const DEFAULT_LOCALE = 'en';

/**
 * The locales that ship, derived rather than declared.
 *
 * `scripts/locale-lint.sh` fails a hardcoded locale list in TypeScript — rightly, since the fleet has one
 * registry and a second copy drifts from it — so this is built from the locale files present. There are
 * none yet, which is why it is English alone.
 */
const indexedLocales = (localeIndex as { locales?: unknown }).locales;
if (!Array.isArray(indexedLocales) || indexedLocales.some((slug) => typeof slug !== 'string')) {
  throw new Error('engine/locales/index.json must contain a string array named "locales"');
}
const localeSlugs = indexedLocales as string[];
if (
  localeSlugs.some((slug) => !/^[a-z]{2}(?:-[a-z]{2})?$/.test(slug) || slug === DEFAULT_LOCALE) ||
  new Set(localeSlugs).size !== localeSlugs.length
) {
  throw new Error('engine/locales/index.json contains a duplicate, invalid, or reserved locale slug');
}
export const SHIPPED_LOCALES: readonly string[] = Object.freeze([DEFAULT_LOCALE, ...localeSlugs]);

/** Where a resolved locale came from, which decides whether an unshipped one is refused or ignored. */
export type LocaleOrigin = 'flag' | 'deal' | 'env' | 'os' | 'default' | 'fallback' | 'workbook';

export interface ResolvedLocale {
  /** A shipped locale, in canonical lowercase-slug form. */
  slug: string;
  from: LocaleOrigin;
  /** What an ambient source asked for, when it could not be honoured. Present only for `fallback`. */
  unresolved?: string;
}

export interface LocaleSizing {
  /** Individual Excel columns, by letter. The layout and every span remain unchanged. */
  columnWidths?: Readonly<Record<string, number>>;
  /** Applied to every planned row height. */
  rowHeightScale?: number;
}

export interface LocaleCatalogue {
  locale: string;
  /** SHA-256 of the sorted English source strings, in full. */
  sourceHash: string;
  translations: Readonly<Record<string, string>>;
  sizing?: LocaleSizing;
}

/** The one object every rendering path receives; no planner detects a locale for itself. */
export interface LocaleContext extends ResolvedLocale, LocaleCatalogue, TranslationContext {}

export const ENGLISH_LOCALE: LocaleContext = Object.freeze({
  slug: DEFAULT_LOCALE,
  from: 'default',
  locale: DEFAULT_LOCALE,
  sourceHash: '',
  translations: Object.freeze({}),
});

/** Stable freshness stamp for a set of English source strings. */
export function localeSourceHash(sources: Iterable<string>): string {
  return createHash('sha256')
    .update(JSON.stringify([...sources].sort()))
    .digest('hex');
}

function catalogueObject(raw: unknown, resolved: ResolvedLocale): LocaleCatalogue {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`The ${resolved.slug} locale catalogue is not a JSON object`);
  }
  const value = raw as Record<string, unknown>;
  if (value.locale !== resolved.slug) {
    throw new Error(`The ${resolved.slug} locale catalogue identifies itself as ${JSON.stringify(value.locale)}`);
  }
  if (typeof value.sourceHash !== 'string' || !/^[0-9a-f]{64}$/.test(value.sourceHash)) {
    throw new Error(`The ${resolved.slug} locale catalogue has no full SHA-256 sourceHash`);
  }
  if (!value.translations || typeof value.translations !== 'object' || Array.isArray(value.translations)) {
    throw new Error(`The ${resolved.slug} locale catalogue has no translations object`);
  }
  const translations = value.translations as Record<string, unknown>;
  for (const [source, translated] of Object.entries(translations)) {
    if (source.trim() === '' || typeof translated !== 'string' || translated.trim() === '') {
      throw new Error(`The ${resolved.slug} translation for ${JSON.stringify(source)} is empty or not text`);
    }
  }
  const sourceHash = localeSourceHash(Object.keys(translations));
  if (sourceHash !== value.sourceHash) {
    throw new Error(
      `The ${resolved.slug} locale catalogue is stale: sourceHash is ${value.sourceHash}, expected ${sourceHash}`,
    );
  }

  let sizing: LocaleSizing | undefined;
  if (value.sizing !== undefined) {
    if (!value.sizing || typeof value.sizing !== 'object' || Array.isArray(value.sizing)) {
      throw new Error(`The ${resolved.slug} locale sizing must be an object`);
    }
    const rawSizing = value.sizing as Record<string, unknown>;
    const scale = rawSizing.rowHeightScale;
    if (scale !== undefined && (typeof scale !== 'number' || !Number.isFinite(scale) || scale < 1 || scale > 2)) {
      throw new Error(`The ${resolved.slug} rowHeightScale must be between 1.0 and 2.0`);
    }
    const widths = rawSizing.columnWidths;
    if (widths !== undefined && (!widths || typeof widths !== 'object' || Array.isArray(widths))) {
      throw new Error(`The ${resolved.slug} columnWidths must be an object`);
    }
    const checkedWidths: Record<string, number> = {};
    for (const [column, width] of Object.entries((widths ?? {}) as Record<string, unknown>)) {
      if (
        !/^[A-Z]{1,3}$/.test(column) ||
        typeof width !== 'number' ||
        !Number.isFinite(width) ||
        width < 3 ||
        width > 80
      ) {
        throw new Error(`The ${resolved.slug} width for column ${column} must be between 3 and 80`);
      }
      checkedWidths[column] = width;
    }
    sizing = {
      ...(Object.keys(checkedWidths).length === 0 ? {} : { columnWidths: Object.freeze(checkedWidths) }),
      ...(scale === undefined ? {} : { rowHeightScale: scale }),
    };
  }
  return {
    locale: resolved.slug,
    sourceHash: value.sourceHash,
    translations: Object.freeze(translations as Record<string, string>),
    ...(sizing === undefined ? {} : { sizing: Object.freeze(sizing) }),
  };
}

/** Load, validate, and prove a catalogue complete for the spec that is about to be rendered. */
export function localeContextFromCatalogue(
  resolved: ResolvedLocale,
  parsed: unknown,
  spec: WorkbookSpec,
  schema: unknown,
): LocaleContext {
  const catalogue = catalogueObject(parsed, resolved);
  const required = translatableSet(spec, schema);
  const missing = [...required].filter((source) => !(source in catalogue.translations));
  if (missing.length > 0) {
    throw new Error(
      `The ${resolved.slug} locale is missing ${missing.length} translation(s) required by this workbook spec: ` +
        missing
          .slice(0, 5)
          .map((text) => JSON.stringify(text))
          .join(', '),
    );
  }
  return Object.freeze({ ...resolved, ...catalogue });
}

/** Load, validate, and prove a catalogue complete for the spec that is about to be rendered. */
export function loadLocale(resolved: ResolvedLocale, spec: WorkbookSpec, schema: unknown): LocaleContext {
  if (resolved.slug === DEFAULT_LOCALE) return { ...ENGLISH_LOCALE, ...resolved };
  if (!SHIPPED_LOCALES.includes(resolved.slug)) {
    throw new Error(`Locale ${JSON.stringify(resolved.slug)} is not shipped; choose ${SHIPPED_LOCALES.join(', ')}`);
  }
  const file = path.join(import.meta.dir, 'locales', `${resolved.slug}.json`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
  } catch (error) {
    throw new Error(`Could not load the ${resolved.slug} locale catalogue at ${file}: ${String(error)}`);
  }
  return localeContextFromCatalogue(resolved, parsed, spec, schema);
}

/** Translate one engine-owned source string. English is intentionally an identity catalogue. */
export const localize = translateSource;

/** A translated copy of a spec. Structural ids, paths, formula references, and spans are untouched. */
export function localizeSpec(spec: WorkbookSpec, context: LocaleContext): WorkbookSpec {
  if (context.slug === DEFAULT_LOCALE) return spec;
  const proseKeys = new Set(['text', 'label', 'title', 'header']);
  const walk = (node: unknown, parentKey?: string): unknown => {
    if (Array.isArray(node)) return node.map((item) => walk(item, parentKey));
    if (!node || typeof node !== 'object') return node;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (typeof value === 'string' && proseKeys.has(key)) {
        out[key] = localize(context, value);
      } else if (typeof value === 'string' && key === 'name' && parentKey === 'sheets') {
        out[key] = localize(context, value);
      } else if (typeof value === 'string' && key === 'formula') {
        out[key] = value.replace(/"((?:[^"]|"")*)"/g, (whole, escaped: string) => {
          const source = escaped.replace(/""/g, '"');
          if (isNonProse(source)) return whole;
          return `"${localize(context, source).replace(/"/g, '""')}"`;
        });
      } else {
        out[key] = walk(value, key === 'sheets' ? 'sheets' : key);
      }
    }
    return out;
  };
  return walk(spec) as WorkbookSpec;
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
    // POSIX order for the language of user-facing messages, which is what a workbook's text is:
    // LC_ALL overrides everything, then LC_MESSAGES for the message category specifically, then LANG as
    // the default for every category. Skipping LC_MESSAGES — as this did at first — means a machine set to
    // French messages with an English LANG gets an English workbook once French ships.
    { raw: env.LC_ALL, from: 'os', explicit: false },
    { raw: env.LC_MESSAGES, from: 'os', explicit: false },
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
