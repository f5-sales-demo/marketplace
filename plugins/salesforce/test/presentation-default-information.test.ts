import { beforeAll, expect, test } from 'bun:test';
import { event } from './presentation-refinement.test';
import { initTheme, plain, registered, setTheme } from './shared-runtime';

beforeAll(async () => {
  await initTheme();
});
async function output(name: string, result: unknown, args = {}, expanded = false, width = 153) {
  const component = await registered(name, args);
  component.updateResult(result as never);
  component.setExpanded(expanded);
  return plain(component.render(width));
}
for (const theme of ['dark', 'light'] as const) {
  for (const width of [40, 76, 120, 153]) {
    test(`useful default Salesforce information at ${width} columns in ${theme}`, async () => {
      setTheme(theme);
      const org = {
        content: [],
        details: {
          orgEvidence: {
            alias: 'synthetic',
            username: 'synthetic@example.com',
            instanceUrl: 'https://salesforce.example.com',
            connectedStatus: 'Connected',
            isSandbox: false,
            accessToken: 'SECRET_SENTINEL',
          },
        },
      };
      const identity = await output('sf_org_display', org, {}, false, width);
      expect(identity).toContain('Connected');
      expect(identity).toContain('Production');
      expect(identity).not.toContain('SECRET_SENTINEL');
      expect(await output('sf_org_display', org, {}, true, width)).not.toContain('SECRET_SENTINEL');
      const schema = await output(
        'sf_describe',
        { content: [], details: { described: event } },
        { sobject: 'Event' },
        false,
        width,
      );
      expect(schema).toContain('Standard fields: 3');
      expect(schema).toContain('Custom fields: 17');
      expect(schema).toContain('Child relationships: 3');
      expect(schema).toContain('match');
      expect(schema).not.toContain('FINAL_PICKLIST');
      const report = {
        content: [],
        details: {
          pipelineReport: {
            currency: 'CAD',
            fyBookedTotal: 0,
            anomalies: [
              {
                severity: 'warning',
                category: 'stalled-deals',
                message: 'No activity for 31 days.',
                details: 'Review synthetic account.',
              },
            ],
            recentChanges: [{ newValue: 'EXPANDED_CHANGE' }],
          },
        },
      };
      const pipeline = await output('sf_pipeline_report', report, {}, false, width);
      expect(pipeline).toContain('FY aggregate bookings');
      expect(pipeline).toContain('Reported amount: 0');
      expect(pipeline).toContain('Currency: Unknown');
      expect(pipeline).toContain('No activity for 31 days.');
      expect(pipeline.replace(/[│\n]/g, ' ').replace(/\s+/g, ' ')).toContain('Review synthetic account.');
      expect(pipeline).not.toContain('EXPANDED_CHANGE');
      const expanded = await output('sf_pipeline_report', report, {}, true, width);
      expect(expanded.match(/FY aggregate bookings/g)).toHaveLength(1);
      expect(expanded).toContain('EXPANDED_CHANGE');
    });
  }
}
