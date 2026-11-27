import type { PipelineReportData, SectionData } from './types';

const amount = (value?: number) =>
  value === undefined ? 'Unavailable' : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
const cell = (value: string) => value.replaceAll('|', '\\|').replace(/[\r\n]/g, ' ');
function section(title: string, data?: SectionData) {
  if (!data) return `## ${title}\nUnavailable for this report.`;
  return [
    `## ${title}`,
    `Total: ${amount(data.total)} · Quota total: ${data.quotaTotal === undefined ? 'Unknown' : amount(data.quotaTotal)}`,
    '| Group | Amount |',
    '|---|---:|',
    ...Object.entries(data.totals).map(([name, total]) => `| ${cell(name)} | ${amount(total)} |`),
    '| Account | Territory | Amount |',
    '|---|---|---:|',
    ...data.accounts.map((row) => `| ${cell(row.name)} | ${cell(row.territory)} | ${amount(row.total)} |`),
  ].join('\n');
}
export function renderPipelineReport(data: PipelineReportData, _instanceUrl: string) {
  return [
    '# Salesforce Pipeline Report',
    `Coverage: ${data.coverage?.scope ?? 'Unknown'} · ${data.coverage?.distinct ?? 'Unknown'} opportunities`,
    `Amount field: ${data.amountField}`,
    ...(data.unavailable ?? []).map((note) => `- ${note}`),
    ...(data.currencyBreakdown ?? [{ ...data, currency: data.currency ?? 'unverified' }]).flatMap((group) => [
      `## Currency: ${group.currency === 'unverified' ? 'Unknown' : group.currency}`,
      section(data.renewals ? 'Open non-renewal pipeline' : 'Open pipeline', group.netNew),
      section('Booked this quarter', group.booked),
      section('Renewals', group.renewals),
      ...(group.productBreakdown
        ? [
            `Product amount field: ${data.productAmountField}. Product values are separate from opportunity amounts.`,
            section('Products in open pipeline', group.productBreakdown),
          ]
        : []),
      ...(group.fyBookedTotal === undefined ? [] : [`Fiscal-year bookings: ${amount(group.fyBookedTotal)}`]),
      '| Top deal | Account | Amount |',
      '|---|---|---:|',
      ...group.topDeals.map((deal) => `| ${cell(deal.name)} | ${cell(deal.accountName)} | ${amount(deal.amount)} |`),
    ]),
  ].join('\n\n');
}
