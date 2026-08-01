import { describe, expect, test } from 'bun:test';
import { workbookProperties } from './generate';
import { DEFAULT_LOCALE, normalizeLocaleTag, resolveLocale, SHIPPED_LOCALES } from './locale';

/** The smallest plan `workbookProperties` will accept: it only fingerprints the layout, which is empty. */
const EMPTY_PLAN = {
  sheets: [],
  anchors: [],
  proseCells: [],
  clippedCells: [],
  notes: [],
  namedCells: {},
  tables: [],
  inputCells: [],
  writtenCells: [],
  // biome-ignore lint/suspicious/noExplicitAny: a stand-in plan, not a real one — only the layout is read.
} as any;

/** Every ambient source empty, so a test says exactly which inputs it is exercising. */
const nothing = { env: {} as Record<string, string | undefined> };

describe('normalizeLocaleTag', () => {
  test('a POSIX locale loses its codeset and modifier', () => {
    // `fr_CA.UTF-8@euro` is what a real environment hands over, and none of the tail is a locale.
    expect(normalizeLocaleTag('fr_CA.UTF-8@euro')).toBe('fr-ca');
    expect(normalizeLocaleTag('pt_BR.UTF-8')).toBe('pt-br');
    expect(normalizeLocaleTag('ja_JP')).toBe('ja-jp');
  });

  test('the canonical form is the lowercase slug', () => {
    // Not the BCP-47 `pt-BR`: the schema's `metadata.locale` enum and i18n-core's `slug` are lowercase,
    // and having two spellings of one locale is how a workbook comes to ask for one that does not exist.
    expect(normalizeLocaleTag('pt-BR')).toBe('pt-br');
    expect(normalizeLocaleTag('ZH-CN')).toBe('zh-cn');
  });

  test('nothing useful stays nothing', () => {
    for (const value of ['', '   ', 'C', 'POSIX', 'UTF-8']) expect(normalizeLocaleTag(value)).toBeUndefined();
  });
});

describe('resolveLocale — precedence', () => {
  test('an explicit flag wins over everything below it', () => {
    const r = resolveLocale({
      flag: 'en',
      deal: { metadata: { locale: 'ja' } },
      env: { MEDDPICC_LOCALE: 'ko', LC_ALL: 'de_DE.UTF-8', LANG: 'fr_FR.UTF-8' },
    });
    expect(r).toEqual({ slug: 'en', from: 'flag' });
  });

  test("the deal's own locale wins over the environment", () => {
    const r = resolveLocale({ deal: { metadata: { locale: 'en' } }, env: { LANG: 'fr_FR.UTF-8' } });
    expect(r).toEqual({ slug: 'en', from: 'deal' });
  });

  test('MEDDPICC_LOCALE wins over the POSIX variables', () => {
    const r = resolveLocale({ env: { MEDDPICC_LOCALE: 'en', LC_ALL: 'fr_FR.UTF-8' } });
    expect(r).toEqual({ slug: 'en', from: 'env' });
  });

  test('LC_ALL wins over LANG, because that is what POSIX means by it', () => {
    // Both unshipped, so the assertion is about which one was consulted, not about the answer.
    const r = resolveLocale({ env: { LC_ALL: 'is_IS.UTF-8', LANG: 'ru_RU.UTF-8' } });
    expect(r).toEqual({ slug: DEFAULT_LOCALE, from: 'fallback', unresolved: 'is-is' });
  });

  test('LC_MESSAGES sits between LC_ALL and LANG, as POSIX has it', () => {
    // A workbook's text is user-facing messages, so LC_MESSAGES is the category that governs it. Asked with
    // a shipped set that includes French, since the point is which variable is consulted.
    const shipped = ['en', 'fr'];
    expect(resolveLocale({ env: { LC_MESSAGES: 'fr_FR.UTF-8', LANG: 'en_US.UTF-8' }, shipped })).toEqual({
      slug: 'fr',
      from: 'os',
    });
    // LC_ALL still outranks it.
    expect(resolveLocale({ env: { LC_ALL: 'en_US.UTF-8', LC_MESSAGES: 'fr_FR.UTF-8' }, shipped })).toEqual({
      slug: 'en',
      from: 'os',
    });
  });

  test('AppleLocale is consulted, after the POSIX variables', () => {
    // Named for what it checks. It is not platform-gated and does not need to be: nothing sets
    // `AppleLocale` off macOS, so reading it elsewhere finds nothing rather than the wrong thing.
    expect(resolveLocale({ env: { AppleLocale: 'en_US' } })).toEqual({ slug: 'en', from: 'os' });
    // And LANG is preferred over it when both are set.
    expect(resolveLocale({ env: { LANG: 'is_IS.UTF-8', AppleLocale: 'en_US' } })).toEqual({
      slug: DEFAULT_LOCALE,
      from: 'fallback',
      unresolved: 'is-is',
    });
  });

  test('nothing at all is English', () => {
    expect(resolveLocale(nothing)).toEqual({ slug: DEFAULT_LOCALE, from: 'default' });
  });

  test('an empty value at a higher rung does not shadow a lower one', () => {
    // `metadata.locale: ""` is absent, not a request for the empty locale.
    const r = resolveLocale({ flag: '', deal: { metadata: { locale: '' } }, env: { MEDDPICC_LOCALE: 'en' } });
    expect(r).toEqual({ slug: 'en', from: 'env' });
  });
});

describe('resolveLocale — resolution and refusal', () => {
  test('a region falls back to its language', () => {
    // `fr-ca` is not shipped and never will be; French is the answer, once French ships.
    expect(resolveLocale({ env: { LANG: 'en_GB.UTF-8' } })).toEqual({ slug: 'en', from: 'os' });
  });

  test('Chinese resolves by script when given one, by region otherwise', () => {
    for (const [raw, slug] of [
      ['zh_Hant_TW', 'zh-tw'],
      ['zh_Hans_CN', 'zh-cn'],
      ['zh_TW', 'zh-tw'],
      ['zh_CN', 'zh-cn'],
      ['zh', 'zh-cn'],
      ['zh_Hant', 'zh-tw'],
    ] as const) {
      // Asked of the resolver's own mapping rather than of what is shipped, since no Chinese locale is.
      expect(resolveLocale({ flag: raw, shipped: ['en', 'zh-cn', 'zh-tw'] })).toEqual({ slug, from: 'flag' });
    }
  });

  test('an explicit locale that is not shipped is refused, and names what is', () => {
    // Somebody asked for something specific. Handing them English instead is the one answer nobody wants.
    expect(() => resolveLocale({ flag: 'ar' })).toThrow(/ar/);
    expect(() => resolveLocale({ flag: 'ar' })).toThrow(/en/);
    expect(() => resolveLocale({ flag: 'ar' })).toThrow(/issues\/926/);
    expect(resolveLocale({ deal: { metadata: { locale: 'ja' } } })).toEqual({ slug: 'ja', from: 'deal' });
    expect(() => resolveLocale({ env: { MEDDPICC_LOCALE: 'is' } })).toThrow(/is/);
  });

  test('an explicit value that names no language is refused, not ignored', () => {
    // `--locale C` is not a request for a language, but it IS a request, and skipping it would silently
    // hand back English while looking like it honoured something. Ambient `LANG=C` is the opposite case:
    // it genuinely means "no locale set", so the chain keeps looking. A surviving mutation found this
    // gap — the refusal existed and nothing exercised it.
    expect(() => resolveLocale({ flag: 'C' })).toThrow(/names no language/);
    expect(() => resolveLocale({ deal: { metadata: { locale: 'POSIX' } } })).toThrow(/names no language/);
    expect(() => resolveLocale({ env: { MEDDPICC_LOCALE: 'UTF-8' } })).toThrow(/names no language/);
    // And the ambient one falls through to the next rung rather than throwing.
    expect(resolveLocale({ env: { LANG: 'C', AppleLocale: 'en_US' } })).toEqual({ slug: 'en', from: 'os' });
  });

  test('an ambient locale that is not shipped falls back quietly', () => {
    // A rep with LANG=is_IS wants a workbook, not a lecture about Icelandic.
    expect(resolveLocale({ env: { LANG: 'is_IS.UTF-8' } })).toEqual({
      slug: DEFAULT_LOCALE,
      from: 'fallback',
      unresolved: 'is-is',
    });
    expect(resolveLocale({ env: { LANG: 'C' } })).toEqual({ slug: DEFAULT_LOCALE, from: 'default' });
  });

  test('a flag may override the deal, and only a flag may', () => {
    // Two rules that contradict each other unless the origin is carried along, which the first version of
    // this change got wrong. `--locale` outranks `metadata.locale` by design; a deal's request must not be
    // silently dropped. Refusing every mismatch made the documented override impossible — review caught it
    // — and allowing every mismatch would let English be stamped over a deal asking for Korean.
    const dealInJapanese = { metadata: { locale: 'ja' } };
    const viaFlag = resolveLocale({ flag: 'en', deal: dealInJapanese });
    expect(viaFlag).toEqual({ slug: 'en', from: 'flag' });
    // Generation accepts it, because `from: 'flag'` says a person deliberately overrode the file...
    expect(() => workbookProperties({}, EMPTY_PLAN, dealInJapanese, undefined, viaFlag)).not.toThrow();
    // ...and refuses the same slug when nothing more specific asked for it, so the request is not dropped.
    expect(() =>
      workbookProperties({}, EMPTY_PLAN, dealInJapanese, undefined, { slug: 'en', from: 'default' }),
    ).toThrow(/ja/);
  });

  test('the shipped set is derived from the catalogue index', () => {
    // A hardcoded locale array in TypeScript fails `scripts/locale-lint.sh`, so the set comes from the
    // locale files present. The test names the fleet contract so an accidental index deletion fails loudly.
    expect([...SHIPPED_LOCALES]).toEqual([
      'en',
      'fr',
      'es',
      'de',
      'pt-br',
      'ja',
      'ko',
      'zh-cn',
      'zh-tw',
      'it',
      'hi',
      'th',
    ]);
  });
});
