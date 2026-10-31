import { beforeAll, expect, test } from 'bun:test';
import { initTheme, plain, registered, setTheme, visibleWidth } from './shared-runtime';

beforeAll(async () => {
  await initTheme();
});
const fixtures = [
  [
    'sf_exec',
    { args: ['data', 'query', '--query', 'SELECT Name, Amount FROM Opportunity'] },
    {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            result: { records: [{ Name: 'Literal *bold* `code`', Amount: 0, IsWon: false }], done: false },
          }),
        },
      ],
    },
  ],
  [
    'sf_query',
    { query: 'SELECT Name, Amount FROM Opportunity' },
    {
      content: [],
      details: {
        queryResult: {
          records: Array.from({ length: 15 }, (_, i) => ({
            Name: `Example ${i}`,
            Amount: 123456.78,
            CurrencyIsoCode: 'CAD',
            IsWon: false,
            NextStep: '',
          })),
          done: false,
          totalSize: 20,
        },
      },
    },
  ],
  [
    'sf_describe',
    { sobject: 'Event' },
    {
      content: [],
      details: {
        described: {
          name: 'Event',
          fields: [{ name: 'Subject', label: 'Subject', type: 'string', custom: false }],
          childRelationships: [],
        },
      },
    },
  ],
  [
    'sf_org_display',
    {},
    {
      content: [],
      details: {
        orgEvidence: {
          username: 'synthetic@example.com',
          instanceUrl: 'https://salesforce.example.com',
          alias: '',
          isSandbox: false,
        },
      },
    },
  ],
  [
    'sf_help',
    { command_path: 'data query' },
    {
      content: [
        {
          type: 'text',
          text: 'Query data\n\nUSAGE\n  sf data query --query <value>\n\nFLAGS\n  --query=<value> (required) Literal *query*\n\nEXAMPLES\n  sf data query --query "SELECT Id FROM Task"',
        },
      ],
    },
  ],
  [
    'sf_pipeline_report',
    {},
    {
      content: [],
      details: {
        pipelineReport: {
          currencyBreakdown: [
            { currency: 'CAD', netNew: { totals: { platform: 123456.78, shape: 0, other: 0 }, quotaTotal: 123456.78 } },
            { currency: 'USD', booked: { totals: { platform: 0, shape: 0, other: 0 }, quotaTotal: 0 } },
          ],
          closeDistribution: [
            { label: 'January 2029', amount: 123456.78, commit: 0, bestCase: 0, pipeline: 123456.78, oppCount: 2 },
          ],
        },
      },
    },
  ],
] as const;
test('six registered tools preserve data at every width, theme, preset and expansion', async () => {
  for (const preset of ['unicode', 'ascii', 'nerd'] as const) {
    await initTheme(false, preset);
    for (const theme of ['xcsh-dark', 'xcsh-light']) {
      await setTheme(theme);
      for (const [name, args, result] of fixtures) {
        const c = await registered(name, args);
        c.updateResult(structuredClone(result) as never);
        for (const width of [40, 76, 120, 153])
          for (const expanded of [false, true]) {
            c.setExpanded(expanded);
            const lines = c.render(width),
              text = plain(lines),
              compact = text.replace(/[\s│|]/g, '');
            expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
            if (name === 'sf_query') {
              expect(compact).toContain('123,456.78');
              expect(text).toContain('CAD');
              expect(text).toContain('false');
              expect(text).toContain('""');
              expect(compact).toContain(expanded ? 'Example14' : 'Example11');
              if (!expanded) {
                expect(compact).not.toContain('Example12');
                expect(text).toContain('3 more rows');
              }
              expect(text).toContain('Partial results');
            }
            if (name === 'sf_pipeline_report') {
              expect(text).toContain('CAD');
              expect(text).toContain('USD');
              expect(compact).toContain('123,456.78');
            }
            if (expanded) expect(text).toContain('Arguments');
          }
        c.stopAnimation();
      }
    }
  }
}, 60000);
test('empty unavailable partial and failed results retain complete corrective guidance', async () => {
  for (const [name] of fixtures)
    for (const result of [
      { content: [] },
      { content: [{ type: 'text', text: 'Service unavailable; next action: check configured organization.' }] },
      { content: [{ type: 'text', text: 'Opaque progress' }], details: { done: false } },
      {
        isError: true,
        content: [{ type: 'text', text: 'Literal *failure* `guidance`\n'.repeat(40) + 'FINAL_CORRECTIVE_DETAIL' }],
      },
    ]) {
      const c = await registered(name);
      c.updateResult(result, Boolean(result.details));
      for (const width of [40, 76, 120, 153])
        for (const expanded of [false, true]) {
          c.setExpanded(expanded);
          const lines = c.render(width);
          expect(lines.every((line) => visibleWidth(line) <= width)).toBe(true);
          if (result.isError) expect(plain(lines)).toContain('FINAL_CORRECTIVE_DETAIL');
          if (result.details) expect(plain(lines)).toContain('streaming');
        }
      c.stopAnimation();
    }
});
test('runtime progress advances and stops after completion, cancellation and late updates', async () => {
  for (const end of ['complete', 'cancel', 'shutdown', 'replace']) {
    let renders = 0;
    const observed = new Set<string>();
    const c = await registered('sf_pipeline_report', {}, () => {
      renders++;
      observed.add(plain(c.render(76)));
    });
    const result = {
      content: [{ type: 'text', text: 'Pipeline queries: 1 completed, 1 running.' }],
      details: { tool: 'sf_pipeline_report' },
    };
    try {
      c.updateResult(result, true);
      const first = plain(c.render(76));
      // The first timer delivery repeats frame zero; observe a changed rendered frame
      // even when the event loop delays delivery or a later sample wraps the spinner.
      const deadline = performance.now() + 1000;
      while (performance.now() < deadline && ![...observed].some((frame) => frame !== first)) await Bun.sleep(20);
      expect(renders).toBeGreaterThan(0);
      expect([...observed].some((frame) => frame !== first)).toBe(true);
      if (end === 'complete') c.updateResult({ content: [] }, false);
      else {
        c.stopAnimation();
        c.updateResult(result, true);
        c.updateArgs({ late: true });
      }
      const stopped = renders;
      await Bun.sleep(180);
      expect(renders).toBe(stopped);
    } finally {
      c.stopAnimation();
    }
  }
});
