import type { PresentationAPI } from '@f5-sales-demo/xcsh/presentation';
import { copyableCommand, toolArgv } from './command';
import type { Args, Options, Result, Section, State, View } from './shared';
import { data, evidence, fields, hint, literal, record, rows, table, value } from './shared';

export function pipelineView(p: PresentationAPI, result: Result, options: Options, args: Args): View {
  const details = record(result.details),
    report = record(details.pipelineReport),
    scope = record(details.pipelineEvidence);
  if (!Object.keys(report).length)
    return {
      states: [
        {
          kind: options.isPartial ? 'running' : 'disabled',
          text: options.isPartial ? 'Pipeline in progress' : 'Pipeline unavailable',
        },
      ],
      sections: evidence(p, result, args),
    };
  const groups = rows(report.currencyBreakdown);
  const quarter = record(report.quarter);
  const currencies = groups.map((g) => String(g.currency ?? 'unverified'));
  const unavailable = Array.isArray(report.unavailable) ? report.unavailable.map(String) : [];
  const renewalsUnavailable = unavailable.some((text) => text.startsWith('Renewals section:'));
  const states: State[] = [
    ...((!report.currency && !groups.length) || currencies.includes('unverified')
      ? [{ kind: 'info' as const, text: 'Currency unknown' }]
      : []),
    ...(report.fyBookedTotal !== undefined
      ? [{ kind: 'info' as const, text: 'FY aggregate bookings in expansion · currency unknown' }]
      : []),
    ...unavailable.map((text) => ({
      kind: 'disabled' as const,
      text: text.startsWith('Renewals section:')
        ? 'Renewals unavailable'
        : text.startsWith('SKU-level breakdown:')
          ? 'SKU breakdown unavailable · amounts from opportunities'
          : text,
    })),
    ...rows(report.anomalies).flatMap((a): State[] => {
      const known: Record<string, string> = {
        'stalled-deals': 'Activity needs review',
        'sku-classification': 'Product classification needs review',
        'sku-config': 'Product classification needs review',
        unverified_product_classification: 'Product classification and quota eligibility unknown · amounts under Other',
        'missing-territory': 'Territory coverage needs review',
        'forecast-hygiene': 'Forecast needs review',
        'slipped-close-date': 'Close dates need review',
        'urgent-renewals': 'Renewals closing soon',
      };
      if (a.category === 'mixed_currencies') return [];
      if (a.severity === 'info' && !known[String(a.category)]) return [];
      return [
        { kind: a.severity === 'info' ? 'info' : 'warning', text: known[String(a.category)] ?? String(a.message) },
      ];
    }),
    ...(options.isPartial ? [{ kind: 'running' as const, text: 'Provisional results' }] : []),
  ];
  const coverage = [
    ...(Array.isArray(report.teamMembers) ? report.teamMembers : []),
    ...(Array.isArray(report.territories) ? report.territories : []),
  ];
  const sections: Section[] = [
    fields(
      {
        'Salesforce organization': args.target_org || scope.orgAlias || 'CLI default organization',
        ...(report.fyLabel !== undefined ? { 'Fiscal year': report.fyLabel } : {}),
        ...(quarter.start !== undefined || quarter.end !== undefined
          ? { Quarter: `${quarter.start ?? 'Unknown'} – ${quarter.end ?? 'Unknown'}` }
          : {}),
        ...(report.openScopeStart !== undefined ? { 'Open pipeline from': report.openScopeStart } : {}),
        ...(coverage.length ? { Coverage: coverage.join(', ') } : {}),
      },
      'Report scope',
    ),
  ];
  for (const group of groups.length ? groups : [{ ...report, currency: report.currency ?? 'unverified' }]) {
    const currency = String(group.currency === 'unverified' || !group.currency ? 'Currency unknown' : group.currency);
    const summary = table(
      p,
      ['netNew', 'booked', 'renewals']
        .filter((key) => !(key === 'renewals' && renewalsUnavailable) && Object.keys(record(group[key])).length)
        .map((key) => {
          const section = record(group[key]);
          return {
            section: ({ netNew: 'Net new', booked: 'Booked', renewals: 'Renewals' } as Args)[key],
            ...record(section.totals),
            quotaTotal: section.quotaTotal,
          };
        }),
      `Pipeline summary · ${currency}`,
      ['section', 'platform', 'shape', 'other', 'quotaTotal'],
    );
    if (summary.kind === 'table' && summary.rows.length) sections.push(summary);
    else states.push({ kind: 'info', text: `Pipeline totals unknown · ${currency}` });
    const forecast = record(group.forecast);
    if (Object.keys(forecast).length)
      sections.push(
        table(
          p,
          Object.entries(forecast).map(([key, amount]) => ({
            Forecast: key === 'bestCase' ? 'Best case' : key,
            Amount: amount,
          })),
          `Forecast · ${currency}`,
        ),
      );
    const empty: string[] = [];
    const absent: string[] = [];
    for (const [key, title] of [
      ['netNew', 'Net new by account'],
      ['booked', 'Booked by account'],
      ['renewals', 'Renewals by account'],
    ] as const) {
      if (key === 'renewals' && renewalsUnavailable) continue;
      const accounts = record(group[key]).accounts;
      if (accounts === undefined || accounts === null) absent.push(title);
      else if (Array.isArray(accounts) && !accounts.length) empty.push(title);
      else sections.push(...data(p, accounts, `${title} · ${currency}`));
    }
    for (const [key, title] of [
      ['topDeals', 'Top deals'],
      ['topRenewals', 'Top renewals'],
      ['closeDistribution', 'Close distribution'],
      ['renewalDistribution', 'Renewal distribution'],
    ] as const) {
      if (renewalsUnavailable && (key === 'topRenewals' || key === 'renewalDistribution')) continue;
      if (group[key] === undefined || group[key] === null) absent.push(title);
      else if (Array.isArray(group[key]) && !(group[key] as unknown[]).length) empty.push(title);
      else sections.push(...data(p, group[key], `${title} · ${currency}`));
    }
    if (empty.length) sections.push(hint(`No records · ${currency}: ${empty.join(', ')}`));
    if (absent.length) states.push({ kind: 'info', text: `Breakdowns unknown · ${currency}: ${absent.join(', ')}` });
  }
  if (options.expanded) {
    sections.push(
      literal({ ...scope, lineItemCount: report.lineItemCount, generated: report.generated }, 'Report details'),
      ...(report.fyBookedTotal === undefined
        ? []
        : [
            fields(
              { 'Reported amount': value(report.fyBookedTotal, true), Currency: 'Unknown' },
              'FY aggregate bookings',
            ),
          ]),
      ...(report.recentChanges === undefined ? [] : [literal(report.recentChanges, 'Recent changes')]),
      ...(report.anomalies === undefined ? [] : [literal(report.anomalies, 'Classification and anomaly evidence')]),
    );
    rows(report.sourceQueries).forEach((source, i) => {
      sections.push(
        copyableCommand(
          p,
          toolArgv('sf_query', { query: source.query, target_org: args.target_org ?? scope.orgAlias })!,
          `Source query ${i + 1}`,
        ),
        literal(source, `Source query ${i + 1} evidence`),
      );
    });
    sections.push(...evidence(p, result, args));
  }
  return {
    states: states.filter(
      (state, i) => states.findIndex((other) => other.kind === state.kind && other.text === state.text) === i,
    ),
    sections,
  };
}
