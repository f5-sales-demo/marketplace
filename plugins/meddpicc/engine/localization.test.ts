import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { booleanLabels, canonicalBooleanValue } from './display-words';
import { generateWorkbook, planWorkbook } from './generate';
import { canonicalEnumValue, enumLabels } from './labels';
import {
  ENGLISH_LOCALE,
  type LocaleContext,
  loadLocale,
  localeContextFromCatalogue,
  localeSourceHash,
  localize,
  SHIPPED_LOCALES,
} from './locale';
import { readWorkbook, readWorkbookProperty } from './read-workbook';
import { translatableSet } from './translatable';
import type { WorkbookSpec } from './workbook-spec';
import { readZip } from './zip';

const here = import.meta.dir;
const schema = JSON.parse(fs.readFileSync(path.join(here, '..', 'schema', 'meddpicc-schema.json'), 'utf8'));
const spec = JSON.parse(fs.readFileSync(path.join(here, 'workbook-spec.json'), 'utf8')) as WorkbookSpec;
const deal = JSON.parse(fs.readFileSync(path.join(here, '..', 'schema', 'example-deal.json'), 'utf8'));
const japanese = () => loadLocale({ slug: 'ja', from: 'flag' }, spec, schema);
const remainingLocaleSlugs = ['fr', 'es', 'de', 'pt-br', 'ko', 'zh-cn', 'zh-tw', 'it', 'hi', 'th'] as const;
const identityTerms = ['Positive', 'Negative', 'Neutral', 'Unknown', 'Red', 'Yellow', 'Green'] as const;
const rawJapanese = () =>
  JSON.parse(fs.readFileSync(path.join(here, 'locales', 'ja.json'), 'utf8')) as {
    locale: string;
    sourceHash: string;
    translations: Record<string, string>;
    sizing?: { columnWidths?: Record<string, number>; rowHeightScale?: number };
  };
const contextFrom = (raw: unknown) => localeContextFromCatalogue({ slug: 'ja', from: 'flag' }, raw, spec, schema);

const allCells = (context: LocaleContext) =>
  planWorkbook(schema, spec, deal, context).sheets.flatMap((sheet) =>
    sheet.rows.flatMap((row) => row.cells.map((cell) => ({ sheet: sheet.name, ...cell }))),
  );

describe('the Japanese catalogue', () => {
  test('is shipped, exhaustive, fresh, and explicit about the seven English terms', () => {
    expect(SHIPPED_LOCALES).toEqual(['en', 'fr', 'es', 'de', 'pt-br', 'ja', 'ko', 'zh-cn', 'zh-tw', 'it', 'hi', 'th']);
    const context = japanese();
    const sources = translatableSet(spec, schema);
    expect(Object.keys(context.translations)).toHaveLength(199);
    expect(context.sourceHash).toBe(localeSourceHash(sources));
    expect(new Set(Object.keys(context.translations))).toEqual(sources);

    for (const word of identityTerms) {
      expect(context.translations[word], word).toBe(word);
    }
    expect(Object.entries(context.translations).filter(([source, translated]) => source !== translated)).toHaveLength(
      192,
    );
  });

  test('translates workbook-owned words and never falls back silently', () => {
    const context = japanese();
    expect(localize(context, 'MEDDPICC Deal Review')).toBe('MEDDPICC案件レビュー');
    expect(localize(context, 'Not started')).toBe('未着手');
    expect(() => localize(context, 'a custom spec string')).toThrow(/missing.*translation/i);
    expect(localize(ENGLISH_LOCALE, 'a custom spec string')).toBe('a custom spec string');
  });

  test('refuses a stale stamp independently from completeness', () => {
    const stale = rawJapanese();
    stale.sourceHash = '0'.repeat(64);
    expect(() => contextFrom(stale)).toThrow(/stale.*sourceHash/i);
  });

  test('refuses a missing source even when the remaining keys carry a valid stamp', () => {
    const incomplete = rawJapanese();
    delete incomplete.translations['Account Name'];
    incomplete.sourceHash = localeSourceHash(Object.keys(incomplete.translations));
    expect(() => contextFrom(incomplete)).toThrow(/Account Name/);
  });

  test('refuses sizing outside the documented bounds', () => {
    const tooNarrow = rawJapanese();
    if (!tooNarrow.sizing?.columnWidths) throw new Error('the Japanese fixture has no width override');
    tooNarrow.sizing.columnWidths.B = 2.99;
    expect(() => contextFrom(tooNarrow)).toThrow(/between 3 and 80/);

    const tooWide = rawJapanese();
    if (!tooWide.sizing?.columnWidths) throw new Error('the Japanese fixture has no width override');
    tooWide.sizing.columnWidths.B = 80.01;
    expect(() => contextFrom(tooWide)).toThrow(/between 3 and 80/);

    const tooShort = rawJapanese();
    if (!tooShort.sizing) throw new Error('the Japanese fixture has no sizing block');
    tooShort.sizing.rowHeightScale = 0.99;
    expect(() => contextFrom(tooShort)).toThrow(/between 1.0 and 2.0/);

    const tooTall = rawJapanese();
    if (!tooTall.sizing) throw new Error('the Japanese fixture has no sizing block');
    tooTall.sizing.rowHeightScale = 2.01;
    expect(() => contextFrom(tooTall)).toThrow(/between 1.0 and 2.0/);
  });

  test('validates the sheet name after translation, not only the English source', () => {
    for (const title of ['x'.repeat(32), 'Bad/Sheet']) {
      const raw = rawJapanese();
      raw.translations['MEDDPICC Deal Review'] = title;
      const context = contextFrom(raw);
      expect(() => planWorkbook(schema, spec, deal, context)).toThrow(/sheet name/i);
    }
  });
});

describe('the remaining left-to-right catalogues', () => {
  const sources = translatableSet(spec, schema);
  const statuses = ['not_started', 'partial', 'complete'] as const;

  for (const slug of remainingLocaleSlugs) {
    test(`${slug} is exhaustive, fresh, explicitly sized, and translates every agreed source`, () => {
      const context = loadLocale({ slug, from: 'flag' }, spec, schema);
      expect(Object.keys(context.translations)).toHaveLength(199);
      expect(context.sourceHash).toBe(localeSourceHash(sources));
      expect(new Set(Object.keys(context.translations))).toEqual(sources);
      expect(context.sizing).toBeDefined();

      for (const word of identityTerms) expect(context.translations[word], word).toBe(word);
      expect(Object.entries(context.translations).filter(([source, translated]) => source !== translated)).toHaveLength(
        192,
      );
      expect(localize(context, 'MEDDPICC Deal Review')).not.toBe('MEDDPICC Deal Review');
      expect(localize(context, 'Account Name')).not.toBe('Account Name');

      expect(() => enumLabels(statuses, context)).not.toThrow();
      expect(() => booleanLabels(context)).not.toThrow();
    });

    test(`${slug} drives planning, serialization, and read-back under an English process locale`, () => {
      const context = loadLocale({ slug, from: 'flag' }, spec, schema);
      const english = planWorkbook(schema, spec, deal, ENGLISH_LOCALE);
      const translated = planWorkbook(schema, spec, deal, context);
      expect(translated.sheets[0].name).toBe(localize(context, 'MEDDPICC Deal Review'));
      expect(translated.sheets[0].name).not.toBe(english.sheets[0].name);
      expect(translated.inputCells.map((cell) => cell.address)).toEqual(english.inputCells.map((cell) => cell.address));
      expect(
        translated.sheets[0].columns?.some(
          (column) => column.min === 2 && column.max === 2 && column.width === context.sizing?.columnWidths?.B,
        ),
      ).toBe(true);
      expect(translated.sheets[0].rows[0].height).toBeGreaterThan(english.sheets[0].rows[0].height ?? 0);
      expect(
        translated.sheets
          .flatMap((sheet) => sheet.validations ?? [])
          .some((validation) => validation.values.includes(localize(context, 'In progress'))),
      ).toBe(true);

      const bytes = generateWorkbook(schema, spec, deal, 'test', context);
      expect(readWorkbookProperty(bytes, 'MeddpiccLocale')).toBe(slug);
      const sheet = new TextDecoder().decode(readZip(bytes).get('xl/worksheets/sheet1.xml')?.data);
      expect(sheet).toContain(localize(context, 'Not started'));
      expect(sheet).toContain(localize(context, 'In progress'));

      const before = process.env.LANG;
      process.env.LANG = 'en_US.UTF-8';
      try {
        const report = readWorkbook(schema, spec, deal, bytes);
        expect(report.ok).toBe(true);
        expect(report.proposals).toEqual([]);
        expect(report.rejections).toEqual([]);
      } finally {
        if (before === undefined) delete process.env.LANG;
        else process.env.LANG = before;
      }
    });
  }
});

describe('localized enum round trips', () => {
  const statuses = ['not_started', 'partial', 'complete'] as const;

  test('accepts canonical, English, and Japanese forms within the enum being read', () => {
    const context = japanese();
    expect(enumLabels(statuses, context)).toEqual(['未着手', '一部完了', '完了']);
    expect(canonicalEnumValue('not_started', statuses, context)).toBe('not_started');
    expect(canonicalEnumValue('Not started', statuses, context)).toBe('not_started');
    expect(canonicalEnumValue('未着手', statuses, context)).toBe('not_started');
  });

  test('refuses a translated collision per enum, while another enum may reuse the same word', () => {
    const collision: LocaleContext = {
      ...ENGLISH_LOCALE,
      slug: 'xx',
      translations: { 'Not started': '同じ', Partial: '同じ', Complete: '完了', Pending: '同じ' },
    };
    expect(() => enumLabels(statuses, collision)).toThrow(/not_started.*partial|partial.*not_started/i);
    expect(enumLabels(['pending', 'complete'], collision)).toEqual(['同じ', '完了']);
  });
});

describe('localized boolean round trips', () => {
  test('accepts English and Japanese forms and refuses an ambiguous translation', () => {
    const context = japanese();
    expect(canonicalBooleanValue('Yes', context)).toBe(true);
    expect(canonicalBooleanValue('はい', context)).toBe(true);
    expect(canonicalBooleanValue('No', context)).toBe(false);
    expect(canonicalBooleanValue('いいえ', context)).toBe(false);

    const collision: LocaleContext = {
      ...ENGLISH_LOCALE,
      slug: 'xx',
      translations: { Yes: '同じ', No: '同じ' },
    };
    expect(() => booleanLabels(collision)).toThrow(/Yes and No.*同じ/);
  });

  test('refuses either localized boolean when it collides with the opposite English word', () => {
    const translatedYesIsEnglishNo: LocaleContext = {
      ...ENGLISH_LOCALE,
      slug: 'xx',
      translations: { Yes: 'No', No: 'いいえ' },
    };
    expect(() => booleanLabels(translatedYesIsEnglishNo)).toThrow(/Yes and No.*No/);

    const translatedNoIsEnglishYes: LocaleContext = {
      ...ENGLISH_LOCALE,
      slug: 'xx',
      translations: { Yes: 'はい', No: 'Yes' },
    };
    expect(() => booleanLabels(translatedNoIsEnglishYes)).toThrow(/Yes and No.*Yes/);
  });
});

describe('Japanese planning and serialization', () => {
  test('one context drives tabs, labels, schema prose, dropdowns, and formulas', () => {
    const context = japanese();
    const plan = planWorkbook(schema, spec, deal, context);
    expect(plan.sheets[0].name).toBe('MEDDPICC案件レビュー');
    const cells = allCells(context);
    expect(cells.some((cell) => cell.value === 'アカウント名')).toBe(true);
    expect(cells.some((cell) => cell.value === '指標')).toBe(true);
    expect(cells.some((cell) => cell.formula?.includes('一部完了'))).toBe(true);
    expect(cells.some((cell) => cell.formula?.includes('完了'))).toBe(true);
    expect(cells.some((cell) => cell.formula?.includes('はい'))).toBe(true);
    expect(plan.sheets.flatMap((sheet) => sheet.validations ?? []).some((v) => v.values.includes('進行中'))).toBe(true);
    expect(cells.some((cell) => cell.value === 'Example Corp')).toBe(true);
  });

  test('applies bounded sizing overrides without changing the grid', () => {
    const english = planWorkbook(schema, spec, deal, ENGLISH_LOCALE);
    const translated = planWorkbook(schema, spec, deal, japanese());
    expect(
      translated.sheets[0].columns?.some((column) => column.min === 2 && column.max === 2 && column.width === 20),
    ).toBe(true);
    expect(translated.sheets[0].rows[0].height).toBeGreaterThan(english.sheets[0].rows[0].height ?? 0);
    expect(translated.inputCells.map((cell) => cell.address)).toEqual(english.inputCells.map((cell) => cell.address));
  });

  test('serializes localized conditional-format words and records Japanese', () => {
    const bytes = generateWorkbook(schema, spec, deal, 'test', japanese());
    expect(readWorkbookProperty(bytes, 'MeddpiccLocale')).toBe('ja');
    const sheet = new TextDecoder().decode(readZip(bytes).get('xl/worksheets/sheet1.xml')?.data);
    expect(sheet).toContain('&quot;未着手&quot;');
    expect(sheet).toContain('&quot;進行中&quot;');
  });

  test('reads the recorded Japanese locale under any process language', () => {
    const bytes = generateWorkbook(schema, spec, deal, 'test', japanese());
    const before = process.env.LANG;
    process.env.LANG = 'en_US.UTF-8';
    try {
      const report = readWorkbook(schema, spec, deal, bytes);
      expect(report.ok).toBe(true);
      expect(report.proposals).toEqual([]);
      expect(report.rejections).toEqual([]);
    } finally {
      if (before === undefined) delete process.env.LANG;
      else process.env.LANG = before;
    }
  });

  test('refuses a localized custom spec whose text is absent from the catalogue', () => {
    const custom = structuredClone(spec);
    custom.sheets[0].blocks.unshift({ kind: 'section', text: 'Custom qualification lens' });
    expect(() => planWorkbook(schema, custom, deal, japanese())).toThrow(/Custom qualification lens/);
  });
});
