import { type ProductGroup, type ReportMappings, soqlString } from '../configuration';
import { execSfJson } from '../sf/exec';
import { sanitize } from '../sf/sanitize';
import { makeExecApi } from '../tools/shared';
import { planPipelineQueries } from './capabilities';
import type {
  CloseMonthBucket,
  CurrencyReport,
  DealSummary,
  PipelineReportData,
  PipelineReportOptions,
  SectionData,
} from './types';
export type SfQueryFn = (soql: string, orgAlias?: string) => Promise<Record<string, unknown>[]>;
const defaultQuery: SfQueryFn = async (soql, org) => {
  const raw = (
    await execSfJson(
      makeExecApi(process.cwd()),
      ['data', 'query', '--query', soql, ...(org ? ['--target-org', org] : [])],
      undefined,
      soql,
    )
  ).result as { records?: Record<string, unknown>[]; done?: boolean; totalSize?: number };
  if (
    !Array.isArray(raw?.records) ||
    raw.done !== true ||
    (typeof raw.totalSize === 'number' && raw.totalSize > raw.records.length)
  )
    throw new Error('Incomplete Salesforce query; totals are not verified.');
  return raw.records;
};
export function readPath(record: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (value, field) => (value && typeof value === 'object' ? (value as Record<string, unknown>)[field] : undefined),
      record,
    );
}
export function classifyProduct(record: Record<string, unknown>, root: string, groups: ProductGroup[]) {
  const matched = groups.filter((group) =>
    group.rules.some((rule) => {
      if (!rule.field.startsWith(`${root}.`)) return false;
      const value = readPath(record, rule.field.slice(root.length + 1));
      return rule.match === 'exact'
        ? value === rule.value
        : typeof value === 'string' && typeof rule.value === 'string' && value.startsWith(rule.value);
    }),
  );
  return matched.length === 1 ? matched[0] : undefined;
}
interface Item {
  id: string;
  account: string;
  territory: string;
  amount: number;
  category: string;
  quotaEligible?: boolean;
  currency: string;
  record: Record<string, unknown>;
}
const emptySection = (): SectionData => ({
  accounts: [],
  totals: Object.assign(Object.create(null), { Uncategorized: 0 }),
  total: 0,
  quotaUnknownAmount: 0,
});
function aggregate(items: Item[]): SectionData {
  const section = emptySection(),
    accounts = new Map<string, { name: string; territory: string; totals: Record<string, number>; total: number }>();
  let quotaTotal = 0,
    unknown = 0,
    total = 0;
  let quotaComplete = true;
  for (const item of items) {
    const key = `${item.account}\0${item.territory}`,
      row = accounts.get(key) ?? {
        name: item.account,
        territory: item.territory,
        totals: Object.create(null),
        total: 0,
      };
    row.totals[item.category] = (row.totals[item.category] ?? 0) + item.amount;
    row.total += item.amount;
    accounts.set(key, row);
    section.totals[item.category] = (section.totals[item.category] ?? 0) + item.amount;
    total += item.amount;
    if (item.quotaEligible === true) quotaTotal += item.amount;
    else if (item.quotaEligible === undefined) {
      quotaComplete = false;
      unknown += Math.abs(item.amount);
    }
  }
  section.total = total;
  section.accounts = [...accounts.values()].sort((a, b) => b.total - a.total);
  section.quotaUnknownAmount = unknown;
  if (quotaComplete && items.length) section.quotaTotal = quotaTotal;
  return section;
}
function deals(items: Item[]): DealSummary[] {
  return [...items]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map((item) => ({
      oppId: item.id,
      name: String(item.record.Name ?? item.id),
      accountName: item.account,
      stage: String(item.record.StageName ?? ''),
      closeDate: String(item.record.CloseDate ?? ''),
      forecast: String(item.record.ForecastCategoryName ?? ''),
      amount: item.amount,
      ownerName: String(readPath(item.record, 'Owner.Name') ?? ''),
      nextStep: typeof item.record.NextStep === 'string' ? item.record.NextStep : undefined,
    }));
}
function distribution(items: Item[]): CloseMonthBucket[] {
  const buckets = new Map<string, { amount: number; ids: Set<string> }>();
  for (const item of items) {
    const date = item.record.CloseDate;
    if (typeof date !== 'string') continue;
    const key = date.slice(0, 7),
      bucket = buckets.get(key) ?? { amount: 0, ids: new Set<string>() };
    bucket.amount += item.amount;
    bucket.ids.add(item.id);
    buckets.set(key, bucket);
  }
  return [...buckets]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([yearMonth, bucket]) => ({ yearMonth, label: yearMonth, amount: bucket.amount, oppCount: bucket.ids.size }));
}
function numeric(record: Record<string, unknown>, path: string) {
  const value = readPath(record, path);
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(`Amount was not returned as a finite number: ${path}. Totals are not verified.`);
  return value;
}
export async function generatePipelineReport(
  options: PipelineReportOptions,
  run: SfQueryFn = defaultQuery,
): Promise<PipelineReportData> {
  if (!options.userIds.length || options.userIds.some((id) => !/^005[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/.test(id)))
    throw new Error('Verified Salesforce user IDs are required.');
  const caps = options.capabilities ?? {};
  const mappings: ReportMappings = options.mappings ?? {
    opportunityAmount: 'Opportunity.Amount',
    lineItemAmount:
      caps.lineItemFields?.includes('TotalPrice') && caps.queryable?.OpportunityLineItem
        ? 'OpportunityLineItem.TotalPrice'
        : undefined,
    productGroups: [],
  };
  const plan = planPipelineQueries(caps, mappings);
  const unavailable = [...(options.unavailable ?? []), ...plan.unavailable],
    sourceQueries: NonNullable<PipelineReportData['sourceQueries']> = [];
  const query: SfQueryFn = async (soql) => {
    const records = sanitize(await run(soql, options.orgAlias));
    if (!Array.isArray(records)) throw new Error('Invalid Salesforce records; totals are not verified.');
    sourceQueries.push({ query: soql, records });
    return records;
  };
  const known = new Set(caps.opportunityFields ?? []);
  for (const required of ['Id', 'OwnerId', 'IsClosed', 'IsWon', 'CloseDate'])
    if (!known.has(required)) throw new Error(`Required Opportunity schema unavailable: ${required}`);
  const fields = new Set(['Id', 'OwnerId', 'IsClosed', 'IsWon', 'CloseDate', plan.opportunityValueField]);
  for (const optional of ['Name', 'StageName', 'ForecastCategoryName', 'CurrencyIsoCode', 'NextStep'])
    if (known.has(optional)) fields.add(optional);
  for (const path of ['Account.Name', 'Owner.Name'])
    if (caps.resolvedFieldPaths?.includes(`Opportunity.${path}`)) fields.add(path);
  for (const field of [
    mappings.territory,
    mappings.renewal?.field,
    ...mappings.productGroups.flatMap((g) => g.rules.map((r) => r.field)),
  ])
    if (field?.startsWith('Opportunity.')) fields.add(field.slice('Opportunity.'.length));
  const users = options.userIds.map(soqlString).join(', '),
    select = `SELECT ${[...fields].join(', ')} FROM Opportunity`;
  const earliest = [options.fiscalYearStart, options.quarterStart]
    .filter((date): date is string => Boolean(date))
    .sort()[0];
  // TODAY is evaluated by Salesforce, so fiscal bookings follow the selected org's date.
  const scope = `((IsClosed = false${options.staleCutoff ? ` AND CloseDate >= ${options.staleCutoff}` : ''})${earliest ? ` OR (IsWon = true AND CloseDate >= ${earliest} AND CloseDate <= TODAY)` : ''})`;
  const owner = await query(`${select} WHERE OwnerId IN (${users}) AND ${scope}`);
  let team: Record<string, unknown>[] = [],
    teamSupported = caps.queryable?.OpportunityTeamMember === true;
  if (teamSupported) {
    try {
      team = await query(
        `${select} WHERE Id IN (SELECT OpportunityId FROM OpportunityTeamMember WHERE UserId IN (${users})) AND ${scope}`,
      );
    } catch (error) {
      if (!/INVALID_TYPE|INSUFFICIENT_ACCESS|permission|not accessible|not supported/i.test(String(error))) throw error;
      teamSupported = false;
      unavailable.push(`Team membership: ${sanitize(String(error))}`);
    }
  } else unavailable.push('Team membership is unavailable; coverage is owner only.');
  const byId = new Map<string, Record<string, unknown>>();
  for (const record of [...owner, ...team]) {
    if (typeof record.Id !== 'string' || !record.Id)
      throw new Error('Opportunity identifier is missing; totals are not verified.');
    if (typeof record.IsClosed !== 'boolean' || typeof record.IsWon !== 'boolean')
      throw new Error('Opportunity status is missing; totals are not verified.');
    byId.set(record.Id, record);
  }
  const all = [...byId.values()];
  const parse = (record: Record<string, unknown>): Item => {
    const group = classifyProduct(record, 'Opportunity', mappings.productGroups);
    return {
      id: String(record.Id),
      account: String(readPath(record, 'Account.Name') ?? 'Account unavailable'),
      territory: mappings.territory
        ? String(readPath(record, mappings.territory.slice('Opportunity.'.length)) ?? '')
        : '',
      amount: numeric(record, plan.opportunityValueField),
      category: group?.name ?? 'Uncategorized',
      quotaEligible: group?.quotaEligible,
      currency: typeof record.CurrencyIsoCode === 'string' ? record.CurrencyIsoCode : 'unverified',
      record,
    };
  };
  const items = all.map(parse),
    productItems: Item[] = [];
  let lineItemCount = 0;
  const lineItemField = plan.lineItemValueField;
  let productsComplete = Boolean(plan.useLineItems && lineItemField);
  try {
    if (plan.useLineItems && lineItemField && all.length) {
      const fieldSet = new Set(['Id', 'OpportunityId', lineItemField]);
      if (caps.lineItemFields?.includes('CurrencyIsoCode')) fieldSet.add('CurrencyIsoCode');
      for (const group of mappings.productGroups)
        for (const rule of group.rules) {
          if (rule.field.startsWith('OpportunityLineItem.'))
            fieldSet.add(rule.field.slice('OpportunityLineItem.'.length));
          if (rule.field.startsWith('Product2.')) fieldSet.add(rule.field);
        }
      const ids = [...byId.keys()],
        seen = new Set<string>();
      for (let offset = 0; offset < ids.length; offset += 200) {
        const lines = await query(
          `SELECT ${[...fieldSet].join(', ')} FROM OpportunityLineItem WHERE OpportunityId IN (${ids
            .slice(offset, offset + 200)
            .map(soqlString)
            .join(', ')})`,
        );
        for (const line of lines) {
          if (typeof line.Id !== 'string' || typeof line.OpportunityId !== 'string' || !byId.has(line.OpportunityId))
            throw new Error('Line-item identity/coverage is invalid; product totals are not verified.');
          if (seen.has(line.Id)) continue;
          seen.add(line.Id);
          lineItemCount++;
          const matchedOpportunity = byId.get(line.OpportunityId);
          if (!matchedOpportunity) throw new Error('Line-item opportunity coverage is missing.');
          const opportunity = parse(matchedOpportunity);
          const candidates = mappings.productGroups.map((group) => ({
            ...group,
            rules: group.rules.map((rule) =>
              rule.field.startsWith('Product2.') ? { ...rule, field: `OpportunityLineItem.${rule.field}` } : rule,
            ),
          }));
          const group = classifyProduct(line, 'OpportunityLineItem', candidates);
          productItems.push({
            ...opportunity,
            currency: caps.lineItemFields?.includes('CurrencyIsoCode')
              ? String(line.CurrencyIsoCode ?? 'unverified')
              : opportunity.currency,
            amount: numeric(line, lineItemField),
            category: group?.name ?? 'Uncategorized',
            quotaEligible: group?.quotaEligible,
          });
        }
      }
    }
  } catch (error) {
    if (/AbortError|ToolAbortError|REQUEST_LIMIT_EXCEEDED|429|rate limit/i.test(String(error))) throw error;
    productsComplete = false;
    productItems.length = 0;
    lineItemCount = 0;
    unavailable.push(`Product breakdown is unavailable; values are not verified: ${sanitize(String(error))}`);
  }
  if (!options.quarterStart || !options.quarterEnd)
    unavailable.push('Quarter bookings: fiscal periods are unavailable.');
  if (!options.fiscalYearStart || !options.fiscalYearEnd)
    unavailable.push('Fiscal-year bookings: fiscal periods are unavailable.');
  const open = (item: Item) => item.record.IsClosed === false;
  const renewal = (item: Item) =>
    mappings.renewal &&
    readPath(item.record, mappings.renewal.field.slice('Opportunity.'.length)) === mappings.renewal.value;
  const currencies = [...new Set([...items, ...productItems].map((i) => i.currency))].sort();
  if (!currencies.length) currencies.push('unverified');
  const quarterStart = options.quarterStart,
    quarterEnd = options.quarterEnd,
    fiscalYearStart = options.fiscalYearStart;
  const groups: CurrencyReport[] = currencies.map((currency) => {
    const scoped = items.filter((i) => i.currency === currency),
      opened = scoped.filter(open),
      fresh = mappings.renewal ? opened.filter((i) => !renewal(i)) : opened;
    const renewed = opened.filter(renewal),
      forecast: Record<string, number> = Object.create(null);
    for (const item of fresh) {
      const category = String(item.record.ForecastCategoryName ?? 'Unknown');
      forecast[category] = (forecast[category] ?? 0) + item.amount;
    }
    const booked =
      quarterStart && quarterEnd
        ? scoped.filter(
            (i) =>
              i.record.IsWon === true &&
              typeof i.record.CloseDate === 'string' &&
              i.record.CloseDate >= quarterStart &&
              i.record.CloseDate <= quarterEnd,
          )
        : undefined;
    const end = options.fiscalYearEnd;
    const fy =
      fiscalYearStart && end
        ? scoped
            .filter(
              (i) =>
                i.record.IsWon === true &&
                typeof i.record.CloseDate === 'string' &&
                i.record.CloseDate >= fiscalYearStart &&
                i.record.CloseDate <= end,
            )
            .reduce((sum, i) => sum + i.amount, 0)
        : undefined;
    return {
      currency,
      netNew: aggregate(fresh),
      booked: booked ? aggregate(booked) : undefined,
      renewals: mappings.renewal ? aggregate(renewed) : undefined,
      productBreakdown: productsComplete
        ? aggregate(productItems.filter((i) => i.currency === currency && open(i)))
        : undefined,
      forecast,
      topDeals: deals(fresh),
      topRenewals: mappings.renewal ? deals(renewed) : undefined,
      closeDistribution: distribution(fresh),
      renewalDistribution: mappings.renewal ? distribution(renewed) : undefined,
      fyBookedTotal: fy,
    };
  });
  const ownerIds = new Set(owner.map((r) => r.Id)),
    teamIds = new Set(team.map((r) => r.Id));
  return {
    ...(groups.length === 1
      ? groups[0]
      : { netNew: { accounts: [], totals: {} }, forecast: {}, topDeals: [], closeDistribution: [] }),
    currency: groups.length === 1 && groups[0].currency !== 'unverified' ? groups[0].currency : undefined,
    currencyBreakdown: groups,
    sourceQueries,
    generated: new Date().toISOString(),
    quarter: { start: options.quarterStart, end: options.quarterEnd },
    openScopeStart: options.staleCutoff,
    territories: [...new Set(items.map((i) => i.territory).filter(Boolean))],
    teamMembers: options.teamMemberNames ?? [],
    lineItemCount,
    skusFound: [],
    anomalies: items.some((i) => i.category === 'Uncategorized' && i.amount !== 0)
      ? [
          {
            severity: 'info',
            category: 'unverified_product_classification',
            message: 'Uncategorized amounts remain included; quota eligibility is unknown.',
          },
        ]
      : [],
    fyLabel: options.fiscalYearEnd ? `FY${options.fiscalYearEnd.slice(0, 4)}` : undefined,
    unavailable,
    amountField: mappings.opportunityAmount,
    productAmountField: plan.useLineItems ? mappings.lineItemAmount : undefined,
    coverage: {
      scope: teamSupported ? 'owner or team' : 'owner only',
      owner: ownerIds.size,
      team: teamIds.size,
      overlap: [...ownerIds].filter((id) => teamIds.has(id)).length,
      distinct: byId.size,
    },
  };
}
