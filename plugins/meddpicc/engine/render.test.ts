import { describe, expect, test } from 'bun:test';
import { renderSheet } from './render';

const cellMapping = {
  sheetName: 'MEDDPICC Deal Review Sheet',
  staticFields: [
    { jsonPath: 'metadata.accountName', cell: 'B4' },
    { jsonPath: 'metadata.winProbability', cell: 'G5', format: 'percentage' },
    { jsonPath: 'metadata.revenue.acv', cell: 'N7', format: 'currency' },
    { jsonPath: 'qualification.metrics.responses[0]', cell: 'C14' },
    { jsonPath: 'threeWhys.f5.whyNow', cell: 'B36' },
  ],
  dynamicSections: [
    {
      jsonPath: 'stakeholders',
      startRow: 41,
      maxRows: 2,
      columns: { name: 'B', mustSayYes: 'H' },
      booleanFormat: { true: 'Yes', false: 'No' },
    },
  ],
};

const deal = {
  metadata: {
    accountName: 'Visa, Inc.',
    winProbability: 0.6,
    revenue: { acv: 473687 },
  },
  qualification: { metrics: { responses: ['Uptime and latency during intrusion'] } },
  threeWhys: { f5: { whyNow: 'Cloudflare outage forced a multi-vendor strategy' } },
  stakeholders: [
    { name: 'Matthew Davy', mustSayYes: true },
    { name: 'Gary Slater', mustSayYes: false },
  ],
  scoring: { elementScores: { metrics: 4, champion: 3 } },
};

/** Every value the plan writes, flattened — order-independent content assertions. */
function allValues(plan: ReturnType<typeof renderSheet>): unknown[] {
  return plan.writes.flatMap((w) => w.values.flat());
}

describe('renderSheet', () => {
  test('names the sheet after the account, not the template', () => {
    // The template's own sheet name is generic; a from-scratch sheet is per-deal so
    // two reviews in one workbook do not collide.
    const plan = renderSheet(deal, cellMapping);
    expect(plan.sheetName).toBe('MEDDPICC — Visa, Inc.');
  });

  test('falls back to a stable sheet name when the account is missing', () => {
    const plan = renderSheet({}, cellMapping);
    expect(plan.sheetName).toBe('MEDDPICC Deal Review');
  });

  test('labels every mapped field from its json path', () => {
    const values = allValues(renderSheet(deal, cellMapping));
    expect(values).toContain('Account Name');
    expect(values).toContain('F5 — Why Now');
  });

  test('disambiguates repeated leaf keys with their parent', () => {
    // `threeWhys.f5.whyNow` and `threeWhys.partner.whyNow` are different questions.
    const mapping = {
      ...cellMapping,
      staticFields: [
        { jsonPath: 'threeWhys.f5.whyNow', cell: 'B36' },
        { jsonPath: 'threeWhys.partner.whyNow', cell: 'J36' },
      ],
    };
    const values = allValues(renderSheet({ threeWhys: { f5: { whyNow: 'a' }, partner: { whyNow: 'b' } } }, mapping));
    expect(values).toContain('F5 — Why Now');
    expect(values).toContain('Partner — Why Now');
  });

  test('numbers stay numbers so the sheet can do arithmetic', () => {
    const values = allValues(renderSheet(deal, cellMapping));
    // 473687 as a number, not "$473,687" — a formatted string cannot be summed, and
    // there is no number-format host tool to undo the damage.
    expect(values).toContain(473687);
    expect(values).toContain(0.6);
  });

  test('carries the unit in the label rather than mangling the value', () => {
    const values = allValues(renderSheet(deal, cellMapping));
    // "Revenue — ACV", not a bare "ACV": the parent disambiguates it from any other acv.
    expect(values).toContain('Revenue — ACV (USD)');
    expect(values).toContain('Win Probability (0-1)');
  });

  test('names the fields the camelCase rule cannot recover', () => {
    // "pAndIplusAcvx" would otherwise render as "P And Iplus Acvx".
    const mapping = { staticFields: [{ jsonPath: 'metadata.revenue.pAndIplusAcvx', cell: 'M4', format: 'currency' }] };
    const values = allValues(renderSheet({ metadata: { revenue: { pAndIplusAcvx: 12 } } }, mapping));
    expect(values).toContain('P&I + ACVx (USD)');
  });

  test('renders indexed responses as numbered rows under their element', () => {
    const values = allValues(renderSheet(deal, cellMapping));
    expect(values).toContain('Metrics — Response 1');
    expect(values).toContain('Uptime and latency during intrusion');
  });

  test('renders a dynamic section as a header row plus one row per item', () => {
    const plan = renderSheet(deal, cellMapping);
    const values = allValues(plan);
    expect(values).toContain('Stakeholders');
    expect(values).toContain('Name');
    expect(values).toContain('Must Say Yes');
    expect(values).toContain('Matthew Davy');
    expect(values).toContain('Gary Slater');
  });

  test('applies the section booleanFormat', () => {
    const values = allValues(renderSheet(deal, cellMapping));
    expect(values).toContain('Yes');
    expect(values).toContain('No');
    expect(values).not.toContain(true);
  });

  test('truncates a dynamic section at maxRows', () => {
    const many = { ...deal, stakeholders: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] };
    const values = allValues(renderSheet(many, cellMapping));
    expect(values).toContain('b');
    expect(values).not.toContain('c');
  });

  test('includes the MEDDPICC scores from the shared scoring engine', () => {
    const values = allValues(renderSheet(deal, cellMapping));
    expect(values).toContain('Metrics');
    expect(values).toContain(4);
    // computeScore fills every one of the 8 elements, absent ones as 0.
    expect(values).toContain('Overall');
  });

  test('omits fields the deal has not filled in', () => {
    const values = allValues(renderSheet({ metadata: { accountName: 'Visa, Inc.' } }, cellMapping));
    expect(values).toContain('Account Name');
    expect(values).not.toContain('Why Now');
  });

  test('emits contiguous A:B write blocks whose shape matches the address', () => {
    const plan = renderSheet(deal, cellMapping);
    for (const w of plan.writes) {
      const m = w.address.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
      expect(m).not.toBeNull();
      const [, , top, , bottom] = m as RegExpMatchArray;
      expect(w.values.length).toBe(Number(bottom) - Number(top) + 1);
      const width = new Set(w.values.map((r) => r.length));
      expect(width.size).toBe(1);
    }
  });

  test('is deterministic — same input, byte-identical plan', () => {
    expect(JSON.stringify(renderSheet(deal, cellMapping))).toBe(JSON.stringify(renderSheet(deal, cellMapping)));
  });

  test('never emits a leading =, +, - or @ that Excel would treat as a formula', () => {
    const hostile = {
      metadata: { accountName: '=cmd|/c calc' },
      qualification: { metrics: { responses: ['+SUM(A1)'] } },
    };
    for (const v of allValues(renderSheet(hostile, cellMapping))) {
      if (typeof v === 'string') expect(v.trimStart()[0] ?? '').not.toMatch(/^[=+\-@]$/);
    }
  });
});
