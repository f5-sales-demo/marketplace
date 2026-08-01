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
const salesTermsByLocale = {
  fr: {
    'Assigned To Deal?': 'Affecté à l’opportunité ?',
    'Below Three': 'Moins de trois',
    'Can Say No': 'Peut dire non',
    'Can Say No?': 'Peut dire non ?',
    'Stage Name': 'Nom de l’étape commerciale',
    Pipeline: 'Pipeline commercial',
    'Factored Pipeline': 'Pipeline commercial pondéré',
    Salesforce: 'Salesforce',
    No: 'Non',
    'Close Plan': 'Plan de clôture',
    Hardware: 'Matériel informatique',
    Qualification: 'Qualification de l’opportunité',
    Commit: 'Engagement',
    Change: 'Variation',
    'Days To Close': 'Jours avant clôture',
    'Must Say Yes': 'Approbation indispensable',
    'Must Say Yes?': 'Son approbation est-elle indispensable ?',
    'Win Probability': 'Probabilité de succès',
  },
  es: {
    'Assigned To Deal?': '¿Asignado a la oportunidad?',
    'Below Three': 'Menos de tres',
    'Can Say No': 'Puede decir que no',
    'Can Say No?': '¿Puede decir que no?',
    'Stage Name': 'Nombre de la etapa de ventas',
    Pipeline: 'Pipeline de ventas',
    'Factored Pipeline': 'Pipeline de ventas ponderado',
    Salesforce: 'Salesforce',
    No: 'No',
    'Close Plan': 'Plan de cierre',
    Hardware: 'Equipos informáticos',
    Qualification: 'Calificación de la oportunidad',
    Commit: 'Compromiso',
    Change: 'Cambio',
    'Days To Close': 'Días hasta el cierre',
    'Must Say Yes': 'Aprobación imprescindible',
    'Must Say Yes?': '¿Su aprobación es imprescindible?',
    'Win Probability': 'Probabilidad de éxito',
  },
  de: {
    'Assigned To Deal?': 'Der Opportunity zugewiesen?',
    'Below Three': 'Unter drei',
    'Can Say No': 'Kann Nein sagen',
    'Can Say No?': 'Kann Nein sagen?',
    'Stage Name': 'Name der Vertriebsphase',
    Pipeline: 'Vertriebspipeline',
    'Factored Pipeline': 'Gewichtete Vertriebspipeline',
    Salesforce: 'Salesforce',
    No: 'Nein',
    'Close Plan': 'Abschlussplan',
    Hardware: 'IT-Hardware',
    Qualification: 'Vertriebsqualifizierung',
    Commit: 'Commit',
    Change: 'Veränderung',
    'Days To Close': 'Tage bis zum Abschluss',
    'Must Say Yes': 'Zustimmung erforderlich',
    'Must Say Yes?': 'Ist die Zustimmung erforderlich?',
    'Win Probability': 'Abschlusswahrscheinlichkeit',
  },
  'pt-br': {
    'Assigned To Deal?': 'Atribuído à oportunidade?',
    'Below Three': 'Menos de três',
    'Can Say No': 'Pode dizer não',
    'Can Say No?': 'Pode dizer não?',
    'Stage Name': 'Nome da etapa de vendas',
    Pipeline: 'Pipeline de vendas',
    'Factored Pipeline': 'Pipeline de vendas ponderado',
    Salesforce: 'Salesforce',
    No: 'Não',
    'Close Plan': 'Plano de fechamento',
    Hardware: 'Equipamentos de TI',
    Qualification: 'Qualificação da oportunidade',
    Commit: 'Compromisso',
    Change: 'Variação',
    'Days To Close': 'Dias até o fechamento',
    'Must Say Yes': 'Aprovação obrigatória',
    'Must Say Yes?': 'A aprovação é obrigatória?',
    'Win Probability': 'Probabilidade de sucesso',
  },
  ko: {
    'Assigned To Deal?': '영업 기회에 배정되었나요?',
    'Below Three': '3 미만',
    'Can Say No': '거절할 수 있음',
    'Can Say No?': '거절할 수 있나요?',
    'Stage Name': '영업 단계명',
    Pipeline: '영업 파이프라인',
    'Factored Pipeline': '가중 영업 파이프라인',
    Salesforce: 'Salesforce',
    No: '아니요',
    'Close Plan': '영업 마감 계획',
    Hardware: '하드웨어',
    Qualification: '영업 기회 검증',
    Commit: '확정',
    Change: '변화',
    'Days To Close': '영업 마감까지 남은 일수',
    'Must Say Yes': '승인 필수',
    'Must Say Yes?': '승인이 필수인가요?',
    'Win Probability': '수주 확률',
  },
  'zh-cn': {
    'Assigned To Deal?': '已分配到此商机？',
    'Below Three': '低于 3',
    'Can Say No': '有权否决',
    'Can Say No?': '有权否决吗？',
    'Stage Name': '销售阶段名称',
    Pipeline: '销售机会管道',
    'Factored Pipeline': '加权销售管道',
    Salesforce: 'Salesforce',
    No: '否',
    'Close Plan': '成交计划',
    Hardware: '硬件',
    Qualification: '商机资格评估',
    Commit: '承诺',
    Change: '变化',
    'Days To Close': '距成交天数',
    'Must Say Yes': '必须批准',
    'Must Say Yes?': '必须由其批准吗？',
    'Win Probability': '赢单概率',
  },
  'zh-tw': {
    'Assigned To Deal?': '已指派至此商機？',
    'Below Three': '低於 3',
    'Can Say No': '有權否決',
    'Can Say No?': '有權否決嗎？',
    'Stage Name': '銷售階段名稱',
    Pipeline: '銷售機會管道',
    'Factored Pipeline': '加權銷售管道',
    Salesforce: 'Salesforce',
    No: '否',
    'Close Plan': '成交計畫',
    Hardware: '硬體',
    Qualification: '商機資格評估',
    Commit: '承諾',
    Change: '變化',
    'Days To Close': '距成交天數',
    'Must Say Yes': '必須核准',
    'Must Say Yes?': '必須由其核准嗎？',
    'Win Probability': '贏單機率',
    'Quantified business outcomes the client expects — cost reduction, risk reduction, revenue impact, productivity gains, time-to-value':
      '客戶期望的量化業務成果——降低成本、降低風險、營收影響、生產力提升、實現價值所需時間',
    'Quantified — Metrics tied to business value with baseline and target data':
      '量化——透過基準與目標資料將衡量指標連結至業務價值',
    'Quantified — Pain quantified with business impact; consequence of inaction documented':
      '量化——以業務影響量化痛點；已記錄不採取行動的後果',
  },
  it: {
    'Assigned To Deal?': "Assegnato all'opportunità?",
    'Below Three': 'Meno di tre',
    'Can Say No': 'Può dire di no',
    'Can Say No?': 'Può dire di no?',
    'Stage Name': 'Nome della fase di vendita',
    Pipeline: 'Pipeline di vendita',
    'Factored Pipeline': 'Pipeline di vendita ponderata',
    Salesforce: 'Salesforce',
    No: 'No',
    'Close Plan': 'Piano di chiusura',
    Hardware: 'Apparecchiature informatiche',
    Qualification: "Qualificazione dell'opportunità",
    Commit: 'Impegno',
    Change: 'Variazione',
    'Days To Close': 'Giorni alla chiusura',
    'Must Say Yes': 'Approvazione necessaria',
    'Must Say Yes?': 'La sua approvazione è necessaria?',
    'Win Probability': 'Probabilità di successo',
  },
  hi: {
    'Assigned To Deal?': 'क्या इस अवसर को सौंपा गया है?',
    'Below Three': 'तीन से कम',
    'Can Say No': 'इनकार कर सकते हैं',
    'Can Say No?': 'क्या वे इनकार कर सकते हैं?',
    'Stage Name': 'बिक्री चरण का नाम',
    Pipeline: 'बिक्री पाइपलाइन',
    'Factored Pipeline': 'भारित बिक्री पाइपलाइन',
    Salesforce: 'Salesforce',
    No: 'नहीं',
    'Close Plan': 'सौदा समापन योजना',
    Hardware: 'आईटी हार्डवेयर',
    Qualification: 'अवसर योग्यता',
    Commit: 'पूर्वानुमान प्रतिबद्धता',
    Change: 'परिवर्तन',
    'Days To Close': 'सौदा पूरा होने में शेष दिन',
    'Must Say Yes': 'अनुमोदन आवश्यक',
    'Must Say Yes?': 'क्या उनका अनुमोदन आवश्यक है?',
    'Win Probability': 'सौदा जीतने की संभावना',
  },
  th: {
    'Assigned To Deal?': 'ได้รับมอบหมายให้ดูแลโอกาสการขายนี้หรือไม่?',
    'Below Three': 'น้อยกว่าสาม',
    'Can Say No': 'ปฏิเสธได้',
    'Can Say No?': 'ปฏิเสธได้ไหม?',
    'Stage Name': 'ชื่อขั้นตอนการขาย',
    Pipeline: 'ไปป์ไลน์การขาย',
    'Factored Pipeline': 'ไปป์ไลน์การขายแบบถ่วงน้ำหนัก',
    Salesforce: 'Salesforce',
    No: 'ไม่',
    'Close Plan': 'แผนปิดการขาย',
    Hardware: 'ฮาร์ดแวร์',
    Qualification: 'การคัดกรองโอกาสการขาย',
    Commit: 'ยอดคาดการณ์ที่ยืนยันแล้ว',
    Change: 'การเปลี่ยนแปลง',
    'Days To Close': 'จำนวนวันจนถึงการปิดการขาย',
    'Must Say Yes': 'ต้องได้รับการอนุมัติ',
    'Must Say Yes?': 'ต้องได้รับการอนุมัติจากบุคคลนี้หรือไม่?',
    'Win Probability': 'ความน่าจะเป็นในการชนะ',
  },
} as const satisfies Record<(typeof remainingLocaleSlugs)[number], Readonly<Record<string, string>>>;
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
    test(`${slug} is exhaustive, fresh, explicitly sized, and covers every agreed source`, () => {
      const context = loadLocale({ slug, from: 'flag' }, spec, schema);
      expect(Object.keys(context.translations)).toHaveLength(199);
      expect(context.sourceHash).toBe(localeSourceHash(sources));
      expect(new Set(Object.keys(context.translations))).toEqual(sources);
      expect(context.sizing).toBeDefined();

      for (const word of identityTerms) expect(context.translations[word], word).toBe(word);
      expect(localize(context, 'MEDDPICC Deal Review')).not.toBe('MEDDPICC Deal Review');
      expect(localize(context, 'Account Name')).not.toBe('Account Name');

      expect(() => enumLabels(statuses, context)).not.toThrow();
      expect(() => booleanLabels(context)).not.toThrow();
    });

    test(`${slug} uses sales meanings for ambiguous workbook terms`, () => {
      const context = loadLocale({ slug, from: 'flag' }, spec, schema);
      for (const [source, expected] of Object.entries(salesTermsByLocale[slug])) {
        expect(context.translations[source], `${slug}: ${source}`).toBe(expected);
      }
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
