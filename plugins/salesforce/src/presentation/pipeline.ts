import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation';
import { copyableCommand, toolArgv } from './command';
import type { Args, Options, Result, Section, View } from './shared';
import { data, evidence, fields, hint, record, rows, table, value } from './shared';

export function pipelineView(p: PresentationAPI, result: Result, options: Options, args: Args): View {
  const details = record(result.details),
    report = record(details.pipelineReport),
    scope = record(details.pipelineEvidence);
  if (!Object.keys(report).length)
    return {
      summary: options.isPartial ? 'Pipeline queries in progress' : 'Pipeline report unavailable',
      sections: evidence(p, result, args),
    };
  const groups = rows(report.currencyBreakdown);
  const quarter = record(report.quarter);
  const currencies = groups.map((g) => String(g.currency ?? 'unverified'));
  const warnings = [
    ...(groups.length > 1 ? ['Currencies remain separate. Combined monetary totals are not valid.'] : []),
    ...((!report.currency && !groups.length) || currencies.includes('unverified')
      ? ['Amount currency is unverified.']
      : []),
    ...(report.fyBookedTotal !== undefined ? ['FY aggregate booking currency is independently unverified.'] : []),
    ...(Array.isArray(report.unavailable) ? report.unavailable.map(String) : []),
    ...rows(report.anomalies)
      .filter((a) => a.severity !== 'info')
      .map((a) => String(a.message)),
    ...(options.isPartial ? ['Execution is still in progress; totals are provisional.'] : []),
  ];
  const sections: Section[] = [
    fields(
      {
        'Fiscal year': report.fyLabel ?? 'Not returned',
        'Quarter start': quarter.start ?? 'Not returned',
        'Quarter end': quarter.end ?? 'Not returned',
        'Fiscal year start': scope.fiscalYearStart ?? 'Not returned',
        'Fiscal year end': scope.fiscalYearEnd ?? 'Not returned',
      },
      'Report scope',
    ),
    fields(
      {
        'Open pipeline from': report.openScopeStart ?? 'Not returned',
        Org: args.target_org ?? scope.orgAlias ?? 'CLI default org (identity not returned)',
        Team:
          Array.isArray(report.teamMembers) && report.teamMembers.length
            ? report.teamMembers.join(', ')
            : 'Names not returned; inspect membership queries',
        Territories:
          Array.isArray(report.territories) && report.territories.length
            ? report.territories.join(', ')
            : 'No territory scope reported',
        Scope: 'OpportunityTeamMember membership; territory scope where supported (see source queries)',
      },
      'Team and target',
    ),
    fields(
      { 'Line items': value(report.lineItemCount), Generated: report.generated ?? 'Not returned' },
      'Report scope',
    ),
  ];
  for (const group of groups.length ? groups : [{ ...report, currency: report.currency ?? 'unverified' }]) {
    const currency = String(group.currency ?? 'unverified');
    sections.push(
      table(
        p,
        ['netNew', 'booked', 'renewals'].map((key) => {
          const section = record(group[key]);
          return {
            section: ({ netNew: 'Net new', booked: 'Booked', renewals: 'Renewals' } as Args)[key],
            ...record(section.totals),
            quotaTotal: section.quotaTotal,
          };
        }),
        `Pipeline summary · ${currency}`,
        ['section', 'platform', 'shape', 'other', 'quotaTotal'],
      ),
    );
    const forecast = record(group.forecast);
    sections.push(
      Object.keys(forecast).length
        ? table(
            p,
            Object.entries(forecast).map(([key, amount]) => ({
              Forecast: key === 'bestCase' ? 'Best case' : key,
              Amount: amount,
            })),
            `Forecast · ${currency}`,
          )
        : fields({ Forecast: 'Not returned' }, `Forecast · ${currency}`),
    );
    for (const [key, title] of [
      ['netNew', 'Net new by account'],
      ['booked', 'Booked by account'],
      ['renewals', 'Renewals by account'],
    ] as const) {
      const accounts = record(group[key]).accounts;
      sections.push(
        ...data(
          p,
          accounts === undefined ? 'Unavailable; no account breakdown returned' : accounts,
          `${title} · ${currency}`,
        ),
      );
    }
    for (const [key, title] of [
      ['topDeals', 'Top deals'],
      ['topRenewals', 'Top renewals'],
      ['closeDistribution', 'Close distribution'],
      ['renewalDistribution', 'Renewal distribution'],
    ] as const) {
      if (group[key] !== undefined) sections.push(...data(p, group[key], `${title} · ${currency}`));
    }
  }
  if (report.fyBookedTotal !== undefined)
    sections.push(
      fields(
        { 'Reported amount': value(report.fyBookedTotal, true), Currency: 'Independently unverified' },
        'FY aggregate bookings',
      ),
    );
  if (options.expanded) {
    sections.push(
      ...data(p, report.recentChanges, 'Recent changes'),
      ...data(p, report.anomalies, 'Classification and anomaly evidence'),
    );
    rows(report.sourceQueries).forEach((source, i) => {
      sections.push(
        copyableCommand(
          p,
          toolArgv('sf_query', { query: source.query, target_org: args.target_org ?? scope.orgAlias })!,
          `Source query ${i + 1} · copy and run`,
        ),
        ...data(p, source.records, 'Complete source records'),
      );
    });
    sections.push(...evidence(p, result, args));
  } else
    sections.push(
      hint('Expand for remaining breakdowns, changes, classification evidence and complete source queries / records'),
    );
  return {
    summary: `Pipeline report · ${report.fyLabel ?? 'Fiscal period not returned'} · ${currencies.join(' / ') || report.currency || 'currency unverified'}`,
    warnings,
    sections,
  };
}
