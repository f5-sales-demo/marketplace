import { logger } from '@f5xc-salesdemos/pi-utils';
import { $ } from 'bun';
import type {
  AccountRow,
  CloseMonthBucket,
  DataAnomaly,
  DealSummary,
  ForecastSummary,
  LineItemRecord,
  PipelineChange,
  PipelineReportData,
  PipelineReportOptions,
  SectionData,
  SectionTotals,
  SkuClassification,
} from './types';
import { DEFAULT_SKU_CLASSIFICATION, DEFAULT_SKU_PREFIXES } from './types';

// ---------------------------------------------------------------------------
// SOQL helper
// ---------------------------------------------------------------------------

async function runSfQuery(soql: string, orgAlias?: string): Promise<Record<string, unknown>[]> {
  try {
    const cmd = orgAlias
      ? $`sf data query --query ${soql} --json --target-org ${orgAlias}`
      : $`sf data query --query ${soql} --json`;
    const result = await cmd.quiet().nothrow();
    if (result.exitCode !== 0) return [];
    const parsed = JSON.parse(result.stdout.toString()) as {
      result?: { records?: Record<string, unknown>[] };
    };
    return parsed.result?.records ?? [];
  } catch (err) {
    logger.debug('Pipeline SOQL query failed', { error: err });
    return [];
  }
}

// ---------------------------------------------------------------------------
// SKU classification
// ---------------------------------------------------------------------------

function classifySku(skuName: string, rules: SkuClassification): 'platform' | 'shape' | 'other' {
  const upper = skuName.toUpperCase();
  for (const prefix of rules.shape) {
    if (upper.startsWith(prefix.toUpperCase())) return 'shape';
  }
  for (const prefix of rules.platform) {
    if (upper.startsWith(prefix.toUpperCase())) return 'platform';
  }
  return 'other';
}

// ---------------------------------------------------------------------------
// Record parsing
// ---------------------------------------------------------------------------

function parseLineItem(record: Record<string, unknown>, rules: SkuClassification): LineItemRecord {
  const opp = (record.Opportunity ?? {}) as Record<string, unknown>;
  const acct = (opp.Account ?? {}) as Record<string, unknown>;
  const product = (record.Product2 ?? {}) as Record<string, unknown>;
  const skuName = (product.Name ?? '') as string;

  return {
    opportunityId: (opp.Id ?? '') as string,
    accountName: (acct.Name ?? '') as string,
    territory: (opp.Territory_Credited_District_del__c ?? '') as string,
    forecast: (opp.ForecastCategoryName ?? '') as string,
    skuName,
    fyb: (record.FYB_Total_Price__c as number) ?? 0,
    category: classifySku(skuName, rules),
    closeDate: (opp.CloseDate as string) ?? undefined,
    oppName: (opp.Name as string) ?? undefined,
    stage: (opp.StageName as string) ?? undefined,
    lastActivityDate: (opp.LastActivityDate as string) ?? undefined,
    ownerName: ((opp.Owner as Record<string, unknown> | undefined)?.Name as string) ?? undefined,
    nextStep: (opp.NextStep as string) ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Query builder
// ---------------------------------------------------------------------------

function buildSkuFilter(prefixes: string[]): string {
  return prefixes.map((p) => `Product2.Name LIKE '${p}%'`).join(' OR ');
}

function buildUserFilter(userIds: string[]): string {
  return userIds.length === 1 ? `UserId = '${userIds[0]}'` : `UserId IN (${userIds.map((id) => `'${id}'`).join(',')})`;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function emptyTotals(): SectionTotals {
  return { platform: 0, shape: 0, other: 0 };
}

function aggregateLineItems(items: LineItemRecord[]): SectionData {
  const accountMap = new Map<string, { totals: SectionTotals; territory: string }>();

  for (const item of items) {
    if (item.fyb <= 0) continue;
    const existing = accountMap.get(item.accountName) ?? {
      totals: emptyTotals(),
      territory: item.territory,
    };
    existing.totals[item.category] += item.fyb;
    if (!accountMap.has(item.accountName)) existing.territory = item.territory;
    accountMap.set(item.accountName, existing);
  }

  // Only include accounts with quota-eligible value (platform or shape > 0)
  const filtered = [...accountMap]
    .filter(([, v]) => v.totals.platform + v.totals.shape > 0)
    .map(
      ([name, v]): AccountRow => ({
        name,
        territory: v.territory,
        ...v.totals,
      }),
    )
    .sort((a, b) => b.platform + b.shape - (a.platform + a.shape));

  const totals = emptyTotals();
  for (const row of filtered) {
    totals.platform += row.platform;
    totals.shape += row.shape;
    totals.other += row.other;
  }

  return {
    accounts: filtered,
    totals,
    quotaTotal: totals.platform + totals.shape,
  };
}

function buildForecast(items: LineItemRecord[]): ForecastSummary {
  const buckets: Record<string, number> = { Commit: 0, 'Best Case': 0, Pipeline: 0 };
  for (const item of items) {
    if (item.category === 'other' || item.fyb <= 0) continue;
    if (item.forecast in buckets) buckets[item.forecast] += item.fyb;
  }
  return { commit: buckets.Commit, bestCase: buckets['Best Case'], pipeline: buckets.Pipeline };
}

/** Aggregate net new line items by opportunity and return the top N by quota-eligible amount. */
function buildTopDeals(items: LineItemRecord[], limit = 5): DealSummary[] {
  const oppMap = new Map<
    string,
    {
      name: string;
      accountName: string;
      stage: string;
      closeDate: string;
      forecast: string;
      amount: number;
      ownerName: string;
      nextStep: string;
    }
  >();
  for (const item of items) {
    if (item.category === 'other' || item.fyb <= 0) continue;
    const existing = oppMap.get(item.opportunityId);
    if (existing) {
      existing.amount += item.fyb;
    } else {
      oppMap.set(item.opportunityId, {
        name: item.oppName ?? item.accountName,
        accountName: item.accountName,
        stage: item.stage ?? '',
        closeDate: item.closeDate ?? '',
        forecast: item.forecast,
        amount: item.fyb,
        ownerName: item.ownerName ?? '',
        nextStep: item.nextStep ?? '',
      });
    }
  }
  return [...oppMap.entries()]
    .sort(([, a], [, b]) => b.amount - a.amount)
    .slice(0, limit)
    .map(([id, d]) => ({
      oppId: id,
      name: d.name,
      accountName: d.accountName,
      stage: d.stage,
      closeDate: d.closeDate,
      forecast: d.forecast,
      amount: d.amount,
      ownerName: d.ownerName,
      nextStep: d.nextStep || undefined,
    }));
}

/** Build close-date distribution buckets from net new line items (quota-eligible only). */
function buildCloseDistribution(items: LineItemRecord[]): CloseMonthBucket[] {
  const buckets = new Map<
    string,
    { amount: number; commit: number; bestCase: number; pipeline: number; oppIds: Set<string> }
  >();
  for (const item of items) {
    if (item.category === 'other' || item.fyb <= 0 || !item.closeDate) continue;
    const ym = item.closeDate.slice(0, 7); // YYYY-MM
    const existing = buckets.get(ym) ?? {
      amount: 0,
      commit: 0,
      bestCase: 0,
      pipeline: 0,
      oppIds: new Set<string>(),
    };
    existing.amount += item.fyb;
    existing.oppIds.add(item.opportunityId);
    if (item.forecast === 'Commit') existing.commit += item.fyb;
    else if (item.forecast === 'Best Case') existing.bestCase += item.fyb;
    else if (item.forecast === 'Pipeline') existing.pipeline += item.fyb;
    buckets.set(ym, existing);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ym, data]) => {
      const d = new Date(`${ym}-01T00:00:00`);
      const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      return {
        label,
        yearMonth: ym,
        amount: data.amount,
        commit: data.commit,
        bestCase: data.bestCase,
        pipeline: data.pipeline,
        oppCount: data.oppIds.size,
      };
    });
}

/** Parse OpportunityFieldHistory records into PipelineChange entries. */
function parseHistoryRecords(records: Record<string, unknown>[]): PipelineChange[] {
  return records
    .map((r): PipelineChange | null => {
      const opp = (r.Opportunity ?? {}) as Record<string, unknown>;
      const acct = (opp.Account ?? {}) as Record<string, unknown>;
      const field = r.Field as string;
      if (field !== 'Amount' && field !== 'ForecastCategoryName' && field !== 'StageName') return null;
      return {
        oppId: (r.OpportunityId as string) ?? '',
        dealName: ((opp.Name as string) ?? '').trim(),
        accountName: ((acct.Name as string) ?? '').trim(),
        field,
        oldValue: String(r.OldValue ?? '\u2014'),
        newValue: String(r.NewValue ?? '\u2014'),
        date: ((r.CreatedDate as string) ?? '').slice(0, 10),
      };
    })
    .filter((c): c is PipelineChange => c !== null);
}

// ---------------------------------------------------------------------------
// Anomaly detection
// ---------------------------------------------------------------------------

function detectAnomalies(
  netNew: LineItemRecord[],
  booked: LineItemRecord[],
  renewals: LineItemRecord[],
  classification: SkuClassification,
): DataAnomaly[] {
  const anomalies: DataAnomaly[] = [];
  const all = [...netNew, ...booked];

  // 1. SKUs classified as 'other' — may be missing from classification rules
  const otherSkus = new Set<string>();
  for (const item of all) {
    if (item.category === 'other') otherSkus.add(item.skuName);
  }
  if (otherSkus.size > 0) {
    anomalies.push({
      severity: 'info',
      category: 'sku-classification',
      message: `${otherSkus.size} SKU(s) are not classified as Platform or Shape/DI`,
      details: [...otherSkus].sort().join(', '),
    });
  }

  // 2. Opportunities with no territory assigned
  const noTerritory = new Set<string>();
  for (const item of netNew) {
    if (!item.territory) noTerritory.add(item.accountName);
  }
  if (noTerritory.size > 0) {
    anomalies.push({
      severity: 'warning',
      category: 'missing-territory',
      message: `${noTerritory.size} account(s) have open pipeline with no territory assigned`,
      details: [...noTerritory].sort().join(', '),
    });
  }

  // 3. Accounts with all pipeline in 'Pipeline' forecast only (no Commit or Best Case)
  // This may indicate deals that haven't been qualified or forecasted properly
  const acctForecasts = new Map<string, Set<string>>();
  for (const item of netNew) {
    if (!acctForecasts.has(item.accountName)) acctForecasts.set(item.accountName, new Set());
    acctForecasts.get(item.accountName)?.add(item.forecast);
  }
  const pipelineOnly = [...acctForecasts]
    .filter(([, fcs]) => fcs.size === 1 && fcs.has('Pipeline'))
    .map(([name]) => name);
  if (pipelineOnly.length > 3) {
    anomalies.push({
      severity: 'info',
      category: 'forecast-hygiene',
      message: `${pipelineOnly.length} account(s) have all open pipeline in 'Pipeline' stage only (no Commit or Best Case)`,
      details: pipelineOnly.sort().join(', '),
    });
  }

  // 4. Detect $0 FYB line items that were filtered out — indicates formula problems
  // We can't see them in this dataset, but note the classification in the report
  const classifiedSkus = [...classification.platform, ...classification.shape];
  if (classifiedSkus.length < 3) {
    anomalies.push({
      severity: 'warning',
      category: 'sku-config',
      message: 'Very few SKU classification rules defined — may miss products',
      details: 'Run xcsh://salesforce?refresh=true to rediscover from pipeline data',
    });
  }

  // 5. Open deals with close dates that have slipped past TODAY (requires CloseDate in data)
  const today = new Date().toISOString().split('T')[0]!;
  const slippedAccounts = new Map<string, string>(); // accountName → earliest slipped closeDate
  for (const item of netNew) {
    if (item.closeDate && item.closeDate < today) {
      const existing = slippedAccounts.get(item.accountName);
      if (!existing || item.closeDate < existing) {
        slippedAccounts.set(item.accountName, item.closeDate);
      }
    }
  }
  if (slippedAccounts.size > 0) {
    const details = [...slippedAccounts.entries()]
      .sort(([, a], [, b]) => a.localeCompare(b))
      .map(([name, date]) => `${name} (${date})`)
      .join(', ');
    anomalies.push({
      severity: 'warning',
      category: 'slipped-close-date',
      message: `${slippedAccounts.size} account(s) have open pipeline with close dates in the past`,
      details,
    });
  }

  // 6. Stalled deals — open pipeline with no activity in >30 days
  // Use the MOST RECENT activity date per account — if any deal has recent activity,
  // the account is not stalled.
  const staleThreshold = new Date();
  staleThreshold.setDate(staleThreshold.getDate() - 30);
  const staleStr = staleThreshold.toISOString().split('T')[0]!;
  const acctLastActivity = new Map<string, string | null>(); // accountName → best lastActivityDate
  for (const item of netNew) {
    const existing = acctLastActivity.get(item.accountName);
    const lad = item.lastActivityDate ?? null;
    if (existing === undefined) {
      acctLastActivity.set(item.accountName, lad);
    } else if (lad && (!existing || lad > existing)) {
      acctLastActivity.set(item.accountName, lad);
    }
  }
  const stalledAccounts = new Map<string, string>();
  for (const [name, lad] of acctLastActivity) {
    if (!lad) {
      stalledAccounts.set(name, '(no activity recorded)');
    } else if (lad < staleStr) {
      stalledAccounts.set(name, lad);
    }
  }
  if (stalledAccounts.size > 0) {
    const details = [...stalledAccounts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, date]) => `${name} (${date})`)
      .join(', ');
    anomalies.push({
      severity: 'warning',
      category: 'stalled-deals',
      message: `${stalledAccounts.size} account(s) have open pipeline with no activity in >30 days`,
      details,
    });
  }

  // 7. Urgent renewals — closing within 30 days
  const urgentThreshold = new Date();
  urgentThreshold.setDate(urgentThreshold.getDate() + 30);
  const urgentStr = urgentThreshold.toISOString().split('T')[0]!;
  const urgentRenewals = new Map<string, string>(); // accountName → closeDate
  for (const item of renewals) {
    if (item.closeDate && item.closeDate <= urgentStr) {
      const existing = urgentRenewals.get(item.accountName);
      if (!existing || item.closeDate < existing) {
        urgentRenewals.set(item.accountName, item.closeDate);
      }
    }
  }
  if (urgentRenewals.size > 0) {
    const details = [...urgentRenewals.entries()]
      .sort(([, a], [, b]) => a.localeCompare(b))
      .map(([name, date]) => `${name} (${date})`)
      .join(', ');
    anomalies.push({
      severity: 'warning',
      category: 'urgent-renewals',
      message: `${urgentRenewals.size} account(s) have renewals closing within 30 days`,
      details,
    });
  }

  return anomalies;
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

export type SfQueryFn = (soql: string, orgAlias?: string) => Promise<Record<string, unknown>[]>;

export async function generatePipelineReport(
  options: PipelineReportOptions,
  queryFn?: SfQueryFn,
): Promise<PipelineReportData> {
  const query: SfQueryFn = queryFn ?? runSfQuery;
  const {
    userIds,
    orgAlias,
    quarterStart,
    quarterEnd,
    skuPrefixes = DEFAULT_SKU_PREFIXES,
    skuClassification = DEFAULT_SKU_CLASSIFICATION,
  } = options;
  // staleCutoff: if set, in-play shows all non-stale pipeline regardless of close quarter
  // if not set, in-play is scoped to current quarter close dates
  const staleCutoff = options.staleCutoff;

  const userFilter = buildUserFilter(userIds);
  // SOQL does not allow OR between a semi-join subselect and other fields inside
  // parentheses ("Semi join sub-selects are only allowed at the top level").
  // The OpportunityTeamMember subselect already covers both SE and AE via userIds.
  const skuFilter = buildSkuFilter(skuPrefixes);

  const fields = [
    'Product2.Name',
    'FYB_Total_Price__c',
    'Opportunity.Id',
    'Opportunity.Name',
    'Opportunity.Account.Name',
    'Opportunity.Territory_Credited_District_del__c',
    'Opportunity.ForecastCategoryName',
    'Opportunity.StageName',
    'Opportunity.IsClosed',
    'Opportunity.IsWon',
    'Opportunity.CloseDate',
    'Opportunity.LastActivityDate',
    'Opportunity.Owner.Name',
    'Opportunity.NextStep',
  ].join(', ');
  const commonFilters = `Subscription_Renewal__c = false AND Opportunity.ForecastCategoryName != 'Omitted' AND FYB_Total_Price__c > 0 AND (${skuFilter})`;
  const quarterDateFilter = `Opportunity.CloseDate >= ${quarterStart} AND Opportunity.CloseDate <= ${quarterEnd}`;
  const inPlayDateFilter = staleCutoff ? `Opportunity.CloseDate >= ${staleCutoff}` : quarterDateFilter;

  const oliTeamScope = `OpportunityId IN (SELECT OpportunityId FROM OpportunityTeamMember WHERE ${userFilter})`;

  // Combined OLI query: net new (open, in-play dates) + booked (won, quarter dates) in one SOQL.
  // The OR between regular conditions is allowed (SOQL only restricts OR with semi-join subselects).
  const combinedDateFilter = `((Opportunity.IsClosed = false AND ${inPlayDateFilter}) OR (Opportunity.IsWon = true AND ${quarterDateFilter}))`;

  // Build renewals query alongside OLI query (no dependency between them)
  const renewalFields = [
    'Id',
    'Account.Name',
    'True_ACV__c',
    'Upsell_ACV__c',
    'Amount',
    'Product_Segmentation__c',
    'Use_Case_Category__c',
    'ForecastCategoryName',
    'Territory_Credited_District_del__c',
    'CloseDate',
    'Name',
  ].join(', ');
  const renewalDateFilter = staleCutoff
    ? `CloseDate >= ${staleCutoff}`
    : `CloseDate >= ${quarterStart} AND CloseDate <= ${quarterEnd}`;
  const renewalWhere = `Id IN (SELECT OpportunityId FROM OpportunityTeamMember WHERE ${userFilter}) AND IsClosed = false AND Renewal__c = true AND ${renewalDateFilter} AND ForecastCategoryName != 'Omitted' AND (True_ACV__c > 1 OR Upsell_ACV__c > 1 OR Amount > 1)`;
  // F5 fiscal year starts November 1. Derive from the report's quarter dates, not wall-clock,
  // so the FY context matches the requested report period.
  const qStartDate = new Date(`${quarterStart}T00:00:00`);
  const qMonth = qStartDate.getMonth();
  const qYear = qStartDate.getFullYear();
  const fyStartYear = qMonth >= 10 ? qYear : qYear - 1;
  const fyStart = `${fyStartYear}-11-01`;
  const fyLabel = `FY${(fyStartYear + 1) % 100}`;
  const todayStr = new Date().toISOString().split('T')[0]!;
  const oppTeamScope = `Id IN (SELECT OpportunityId FROM OpportunityTeamMember WHERE ${userFilter})`;
  const fyBookedQuery = `SELECT SUM(Amount) total FROM Opportunity WHERE ${oppTeamScope} AND IsWon = true AND CloseDate >= ${fyStart} AND CloseDate <= ${todayStr}`;

  // Three parallel queries first: combined OLI + renewals + FY booked
  const [oliRecords, renewalRecords, fyBookedResult] = await Promise.all([
    query(
      `SELECT ${fields} FROM OpportunityLineItem WHERE ${oliTeamScope} AND ${combinedDateFilter} AND ${commonFilters}`,
      orgAlias,
    ),
    query(
      `SELECT ${renewalFields} FROM Opportunity WHERE ${renewalWhere} ORDER BY True_ACV__c DESC NULLS LAST`,
      orgAlias,
    ),
    query(fyBookedQuery, orgAlias),
  ]);
  const fyBookedTotal = (fyBookedResult[0]?.total as number) ?? 0;

  // --- Split combined OLI records + fallback when empty ---
  let netNewItems: LineItemRecord[];
  let bookedItems: LineItemRecord[];

  if (oliRecords.length > 0) {
    netNewItems = [];
    bookedItems = [];
    for (const r of oliRecords) {
      const item = parseLineItem(r, skuClassification);
      const opp = (r.Opportunity ?? {}) as Record<string, unknown>;
      if (opp.IsWon as boolean) {
        bookedItems.push(item);
      } else if (!(opp.IsClosed as boolean)) {
        netNewItems.push(item);
      }
    }
  } else {
    // Opportunity-level fallback when OLI queries return no data.
    // Collects renewal IDs first so we can exclude them — renewals have their own query
    // and would double-count if included in net new/booked.
    const renewalIds = new Set<string>();
    for (const r of renewalRecords) {
      const id = (r.Id ?? '') as string;
      if (id) renewalIds.add(id);
    }
    const oppFields =
      'Id, Name, Account.Name, Amount, ForecastCategoryName, StageName, CloseDate, LastActivityDate, Owner.Name, IsClosed, IsWon';
    const oppTeamScope = `Id IN (SELECT OpportunityId FROM OpportunityTeamMember WHERE ${userFilter})`;
    const oppDateFilter = staleCutoff
      ? `CloseDate >= ${staleCutoff}`
      : `CloseDate >= ${quarterStart} AND CloseDate <= ${quarterEnd}`;
    const oppWhere = `${oppTeamScope} AND ForecastCategoryName != 'Omitted' AND Amount > 0 AND IsClosed = false AND ${oppDateFilter}`;
    const bookedWhere = `${oppTeamScope} AND ForecastCategoryName != 'Omitted' AND Amount > 0 AND IsWon = true AND CloseDate >= ${quarterStart} AND CloseDate <= ${quarterEnd}`;

    const [fallbackNetNew, fallbackBooked] = await Promise.all([
      query(`SELECT ${oppFields} FROM Opportunity WHERE ${oppWhere} ORDER BY Amount DESC NULLS LAST`, orgAlias),
      query(`SELECT ${oppFields} FROM Opportunity WHERE ${bookedWhere} ORDER BY Amount DESC NULLS LAST`, orgAlias),
    ]);

    function parseOppFallback(records: Record<string, unknown>[]): LineItemRecord[] {
      const items: LineItemRecord[] = [];
      const seen = new Set<string>();
      for (const r of records) {
        const id = (r.Id ?? '') as string;
        if (seen.has(id) || renewalIds.has(id)) continue;
        seen.add(id);
        const acct = ((r.Account as Record<string, unknown> | undefined)?.Name ?? '') as string;
        const fc = (r.ForecastCategoryName ?? '') as string;
        const amt = (r.Amount as number) ?? 0;
        if (amt <= 0) continue;
        const owner = (r.Owner as Record<string, unknown> | undefined)?.Name;
        items.push({
          opportunityId: id,
          accountName: acct,
          territory: '',
          forecast: fc,
          skuName: 'Opportunity-level',
          fyb: amt,
          category: 'platform',
          closeDate: (r.CloseDate as string) ?? undefined,
          oppName: (r.Name as string) ?? undefined,
          stage: (r.StageName as string) ?? undefined,
          lastActivityDate: (r.LastActivityDate as string) ?? undefined,
          ownerName: (owner as string) ?? undefined,
        });
      }
      return items;
    }

    netNewItems = parseOppFallback(fallbackNetNew);
    bookedItems = parseOppFallback(fallbackBooked);
  }

  // History query: run AFTER OLI to use specific opp IDs (avoids slow semi-join on FieldHistory).
  // Only runs in the normal OLI path — in the fallback path we've already spent 5 queries
  // (3 parallel + 2 fallback) and would exceed the 5-query constraint.
  const allOppIds = new Set<string>();
  for (const item of [...netNewItems, ...bookedItems]) {
    if (item.opportunityId) allOppIds.add(item.opportunityId);
  }
  let historyRecords: Record<string, unknown>[] = [];
  if (oliRecords.length > 0 && allOppIds.size > 0) {
    const idList = [...allOppIds].map((id) => `'${id}'`).join(',');
    const historyFields =
      'OpportunityId, Opportunity.Name, Opportunity.Account.Name, Field, OldValue, NewValue, CreatedDate';
    const historyWhere = `OpportunityId IN (${idList}) AND Field IN ('Amount','ForecastCategoryName','StageName') AND CreatedDate = LAST_N_DAYS:7`;
    historyRecords = await query(
      `SELECT ${historyFields} FROM OpportunityFieldHistory WHERE ${historyWhere} ORDER BY CreatedDate DESC LIMIT 50`,
      orgAlias,
    );
  }

  // Parse and classify renewal opps, dedup by Id
  const seenIds = new Set<string>();
  const renewalItems: LineItemRecord[] = [];
  for (const r of renewalRecords) {
    const id = (r.Id ?? '') as string;
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    const acct = ((r.Account as Record<string, unknown> | undefined)?.Name ?? '') as string;
    const terr = (r.Territory_Credited_District_del__c ?? '') as string;
    const fc = (r.ForecastCategoryName ?? '') as string;
    const upsell = (r.Upsell_ACV__c as number) ?? 0;
    const acv = (r.True_ACV__c as number) ?? 0;
    const amt = (r.Amount as number) ?? 0;
    const val = upsell > 0 ? upsell : acv > 0 ? acv : amt;
    if (val <= 0) continue;

    // Classify by Product_Segmentation__c
    const seg = ((r.Product_Segmentation__c as string) ?? '').toLowerCase();
    const uc = ((r.Use_Case_Category__c as string) ?? '').toLowerCase();
    let category: 'platform' | 'shape' | 'other' = 'other';
    if (seg.includes('xc') || seg.includes('cspp') || uc.includes('distributed cloud')) {
      category = 'platform';
    } else if (seg.includes('point')) {
      category = seg.includes('xc') ? 'platform' : 'shape';
    } else if (seg.includes('ela')) {
      // ELA renewals: classify as platform if use case is XC-related
      category = uc.includes('distributed cloud') ? 'platform' : 'other';
    }

    renewalItems.push({
      opportunityId: id,
      accountName: acct,
      territory: terr,
      forecast: fc,
      skuName: (r.Product_Segmentation__c ?? '') as string,
      fyb: val,
      category,
      closeDate: (r.CloseDate as string) ?? undefined,
      oppName: (r.Name as string) ?? undefined,
    });
  }

  // Collect distinct SKUs
  const allSkus = new Set<string>();
  for (const item of [...netNewItems, ...bookedItems]) {
    if (item.skuName) allSkus.add(item.skuName);
  }
  // Detect anomalies
  const anomalies = detectAnomalies(netNewItems, bookedItems, renewalItems, skuClassification);

  return {
    generated: new Date().toISOString(),
    quarter: { start: quarterStart, end: quarterEnd },
    territories: options.confirmedTerritories ?? [],
    teamMembers: options.teamMemberNames ?? [],
    netNew: aggregateLineItems(netNewItems),
    booked: aggregateLineItems(bookedItems),
    renewals: aggregateLineItems(renewalItems),
    forecast: buildForecast(netNewItems),
    lineItemCount: netNewItems.length + bookedItems.length + renewalItems.length,
    skusFound: [...allSkus].sort(),
    anomalies,
    topDeals: buildTopDeals(netNewItems),
    topRenewals: renewalItems.length > 0 ? buildTopDeals(renewalItems) : undefined,
    closeDistribution: buildCloseDistribution(netNewItems),
    renewalDistribution: renewalItems.length > 0 ? buildCloseDistribution(renewalItems) : undefined,
    fyBookedTotal: fyBookedTotal > 0 ? fyBookedTotal : undefined,
    fyLabel,
    recentChanges: parseHistoryRecords(historyRecords),
  };
}
