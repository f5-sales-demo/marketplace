import * as os from 'node:os';
import * as path from 'node:path';
import { $ } from 'bun';
import type { SfFieldDescription, SfSObjectDescription } from '../sf/describe';
import { normalizeDescribe } from '../sf/describe';

// ---------------------------------------------------------------------------
// Dependency injection for loadProfile (from xcsh user-profile module)
// ---------------------------------------------------------------------------

let _loadProfile: (() => Promise<UserProfile>) | null = null;

export function setLoadProfile(fn: () => Promise<UserProfile>): void {
  _loadProfile = fn;
}

export function getLoadProfile(): (() => Promise<UserProfile>) | null {
  return _loadProfile;
}

async function loadProfileSafe(): Promise<UserProfile> {
  if (_loadProfile) return _loadProfile();
  return {};
}

// ---------------------------------------------------------------------------
// Minimal UserProfile interface (subset of what xcsh provides)
// ---------------------------------------------------------------------------

export interface UserProfile {
  givenName?: string;
  familyName?: string;
  email?: string;
  territories?: string[];
  partner?: { id: string; name: string; role: string };
  identifiers?: { salesforceId?: string };
  quota?: number;
  role?: string;
}

// ---------------------------------------------------------------------------
// Utility inlines (replacing pi-utils imports)
// ---------------------------------------------------------------------------

function $which(cmd: string): boolean {
  try {
    const result = Bun.spawnSync(['which', cmd]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

function isEnoent(err: unknown): boolean {
  if (err && typeof err === 'object' && 'code' in err) {
    return (err as { code: string }).code === 'ENOENT';
  }
  return false;
}

const logger = {
  debug: (..._args: unknown[]) => {},
  warn: (..._args: unknown[]) => {},
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SalesforcePartner {
  id: string;
  name: string;
  title?: string;
  /** Freeform role label. Common: 'AE', 'SE', 'CSM', 'SA'. Defaults to 'Partner' when unknown. */
  role: string;
}

export interface TerritoryDetail {
  name: string;
  teamOpps: number;
  totalOpps: number;
  coverage: number; // teamOpps / totalOpps as percentage
}

export interface PipelineReportConfig {
  reportId: string;
  reportName: string;
  productSkus: string[];
  territoryFilter?: { field: string; operator: string; value: string };
  renewalFilter?: { field: string; value: string };
  groupingsDown: string[];
  groupingsAcross: string[];
  discoveredAt: string;
}

export interface DiscoveredSku {
  sku: string;
  fyb: number;
  count: number;
  inReportFilter: boolean;
}

export interface SalesforceContext {
  // Identity
  userId: string;
  username: string;
  instanceUrl: string;
  orgAlias?: string;

  // Role
  roleName?: string;
  /** Auto-inferred role label from UserRole.Name (e.g. 'SE', 'AE', 'CSM'). */
  discoveredRole?: string;

  /**
   * @deprecated Use UserProfile.partner instead. Kept for backward-compat cache reads.
   */
  confirmedPartner?: SalesforcePartner;
  /** Auto-discovered partner from OpportunityTeamMember co-membership. */
  discoveredPartner?: SalesforcePartner;
  // Manager chain
  managerId?: string;
  managerName?: string;
  team?: Array<{
    id: string;
    name: string;
    title?: string;
  }>;

  // Discovered pipeline universe
  territories?: string[];
  territoryDetails?: TerritoryDetail[];
  /** @deprecated Use UserProfile.territories instead. Kept for backward-compat cache reads. */
  confirmedTerritories?: string[];
  productSegmentations?: string[];
  useCaseCategories?: string[];
  forecastCategories?: string[];
  stages?: string[];

  // Accounts with active pipeline
  activeAccounts?: Array<{
    name: string;
    oppCount: number;
  }>;

  // Org capabilities.
  //
  // Discovered, never assumed. This replaced a fixed struct of booleans named after one org's
  // custom fields, which silently reported "no capabilities" everywhere else. Orgs share almost
  // no custom schema, so the catalog is the source of truth and every consumer feature-detects
  // against it.
  /** Every Opportunity field API name in this org, from the describe the seed already performs. */
  opportunityFields?: string[];
  /** Territory field chosen empirically for grouping; absent when the org has no usable one. */
  territoryField?: string;

  // Pipeline summary
  pipelineSummary?: {
    byForecast: Record<string, { amount: number; count: number }>;
    total: number;
    dealCount: number;
  };
  // Team member roles on opportunities
  teamRoles?: string[];

  // Pipeline report configuration (discovered from saved report)
  pipelineReportConfig?: PipelineReportConfig;

  // Product SKUs discovered from actual line items
  discoveredSkus?: DiscoveredSku[];

  // Meta
  collectedAt: string;
}

export interface SalesforceHint {
  pipelineTotal: string;
  dealCount: number;
  accountCount: number;
  territories?: string;
  /** Forecast breakdown: compact 'Commit $X + Best $Y + Pipe $Z' string */
  forecastBreakdown?: string;
  /** Partner name from user profile or auto-discovery */
  partnerName?: string;
  /** Partner role label, e.g. 'AE', 'SE', 'CSM' */
  partnerRole?: string;
  /** Org alias for SOQL queries, e.g. 'SFDC' */
  orgAlias?: string;
  /** Partner Salesforce UserId for AE-owned deal queries */
  partnerId?: string;
  /** Quarterly quota target for coverage ratio, from user profile */
  quota?: number;
  /**
   * Active StageName values in THIS org. Injected because stage names are org-configured, and a
   * model that assumes Salesforce's defaults writes WHERE clauses that silently match nothing.
   */
  stages?: string;
  /** ForecastCategoryName values in use in this org, for the same reason. */
  forecastCategories?: string;
  /** Territory grouping field resolved for this org, so queries need not guess its name. */
  territoryField?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SF_CONTEXT_PATH = path.join(os.homedir(), '.xcsh', 'salesforce-context.json');
const STALE_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export async function loadSalesforceContext(): Promise<SalesforceContext | null> {
  try {
    return (await Bun.file(SF_CONTEXT_PATH).json()) as SalesforceContext;
  } catch (err: unknown) {
    if (isEnoent(err)) return null;
    logger.warn('Failed to load salesforce context', { error: err });
    return null;
  }
}

export async function saveSalesforceContext(ctx: SalesforceContext): Promise<void> {
  ctx.collectedAt = new Date().toISOString();
  await Bun.write(SF_CONTEXT_PATH, JSON.stringify(ctx, null, 2));
}

export function salesforceContextIsStale(ctx: SalesforceContext): boolean {
  if (!ctx.collectedAt) return true;
  const age = Date.now() - new Date(ctx.collectedAt).getTime();
  return age > STALE_THRESHOLD_MS;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function runSfQuery(soql: string): Promise<Record<string, unknown>[]> {
  try {
    const escaped = soql.replace(/'/g, "'");
    const result = await $`sf data query --query ${escaped} --json`.quiet().nothrow();
    if (result.exitCode !== 0) return [];
    const parsed = JSON.parse(result.stdout.toString()) as {
      result?: { records?: Record<string, unknown>[] };
    };
    return parsed.result?.records ?? [];
  } catch (err: unknown) {
    logger.debug('SOQL query failed', { error: err });
    return [];
  }
}

async function getOrgInfo(): Promise<{ username: string; instanceUrl: string; alias: string } | null> {
  try {
    const result = await $`sf org display --json`.quiet().nothrow();
    if (result.exitCode !== 0) return null;
    const parsed = JSON.parse(result.stdout.toString()) as {
      result?: { username?: string; instanceUrl?: string; alias?: string };
    };
    const r = parsed.result;
    if (!r?.username || !r?.instanceUrl) return null;
    return { username: r.username, instanceUrl: r.instanceUrl, alias: r.alias ?? '' };
  } catch {
    return null;
  }
}

async function describeOpportunity(): Promise<SfSObjectDescription | null> {
  try {
    const result = await $`sf sobject describe --sobject Opportunity --json`.quiet().nothrow();
    if (result.exitCode !== 0) return null;
    const parsed = JSON.parse(result.stdout.toString()) as { result?: unknown };
    if (!parsed.result) return null;
    return normalizeDescribe(parsed.result);
  } catch {
    return null;
  }
}

// Territory field selection.
//
// There is no standard Opportunity territory field, and a real org can carry twenty or more
// territory-ish custom fields at different granularities. Naming a specific one only ever works
// for the org it was copied from. Nor can a name heuristic alone decide: the same org holds
// `ETM_Core_Territory__c`, `Territory_Grouping__c`, `Territory_Name__c` and a dozen more, several
// of which are empty in practice.
//
// So: narrow by schema (below), then choose by DATA (pickBestTerritoryField) — whichever
// candidate actually covers the most of this user's pipeline wins.

/** Territory-ish, but never a usable grouping value. */
const TERRITORY_NAME_EXCLUSIONS = [/code/i, /error/i, /exclude/i, /^old_/i, /_del__c$/i, /type__c$/i, /owner/i];

/** Types that can hold a readable territory value directly. */
const TERRITORY_FIELD_TYPES: ReadonlySet<string> = new Set(['string', 'picklist']);

/**
 * Standard objects that a territory lookup can point at. `Territory2` is Salesforce's own
 * Enterprise Territory Management object — supporting it is not an org customization, and an
 * ETM org with no custom territory field would otherwise get no territory context at all.
 */
const TERRITORY_REFERENCE_TARGETS: ReadonlySet<string> = new Set(['Territory2', 'Territory']);

/**
 * Probing costs one SOQL query each, so the list is bounded — but only bounded. It is
 * deliberately NOT reordered by any name heuristic first: nothing in an API name predicts which
 * field actually holds the data, and ranking by name length then truncating discarded a
 * populated authoritative field in favour of shorter empty ones. Probing is what decides.
 */
const MAX_TERRITORY_CANDIDATES = 12;

/**
 * The SOQL path to read a candidate by. A plain field is its own path; a lookup has to be
 * traversed to a readable name, because grouping by the raw id yields opaque 18-character keys.
 */
function territorySoqlPath(f: SfFieldDescription): string | undefined {
  if (TERRITORY_FIELD_TYPES.has(f.type)) return f.name;
  if (f.type !== 'reference') return undefined;
  if (!f.referenceTo?.some((t) => TERRITORY_REFERENCE_TARGETS.has(t))) return undefined;
  // Salesforce relationship naming: `Territory2Id` -> `Territory2`, `Foo__c` -> `Foo__r`.
  if (f.name.endsWith('__c')) return `${f.name.slice(0, -3)}__r.Name`;
  if (f.name.endsWith('Id')) return `${f.name.slice(0, -2)}.Name`;
  return undefined;
}

export function rankTerritoryFieldCandidates(fields: SfFieldDescription[]): string[] {
  return fields
    .filter((f) => {
      if (!/territor/i.test(f.name) && !/territor/i.test(f.label)) return false;
      // A field that cannot appear in GROUP BY cannot back a territory breakdown at all — which
      // is exactly the flaw in the field this code used to hardcode.
      if (!f.groupable || !f.filterable) return false;
      return !TERRITORY_NAME_EXCLUSIONS.some((re) => re.test(f.name) || re.test(f.label));
    })
    .map(territorySoqlPath)
    .filter((p): p is string => p !== undefined)
    .sort()
    .slice(0, MAX_TERRITORY_CANDIDATES);
}

export interface TerritoryFieldProbe {
  field: string;
  /** Territory value -> opportunity count, from a GROUP BY over the user's open pipeline. */
  counts: Map<string, number>;
}

/**
 * Choose among probed candidates.
 *
 * 1. Most opportunities covered — a field populated on 48 of the user's deals describes their
 *    pipeline; one populated on 7 does not.
 * 2. Then the FINER partition (more distinct values). Among fields annotating the same deals,
 *    the one that separates them more carries more information; at the degenerate end, a field
 *    with a single value covers everything and distinguishes nothing. Measured against a real
 *    org this is what separates a genuine territory (`AMER: Major Accounts ... Red 9`) from a
 *    region rollup (`USA` / `Canada`) that happens to be populated just as widely.
 * 3. Then the lexically first name, purely so a re-run picks the same field.
 */
export function pickBestTerritoryField(probes: TerritoryFieldProbe[]): TerritoryFieldProbe | undefined {
  const covered = (p: TerritoryFieldProbe) => [...p.counts.values()].reduce((a, b) => a + b, 0);
  return probes
    .filter((p) => p.counts.size > 0 && covered(p) > 0)
    .sort((a, b) => covered(b) - covered(a) || b.counts.size - a.counts.size || a.field.localeCompare(b.field))[0];
}

// ---------------------------------------------------------------------------
// Discovery probes
// ---------------------------------------------------------------------------

/** Walk a dotted SOQL path (`Territory2.Name`) through the nested record shape it returns. */
function readPath(root: unknown, path: string): string | undefined {
  let node: unknown = root;
  for (const segment of path.split('.')) {
    if (!node || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return typeof node === 'string' ? node : undefined;
}

/** Group this user's open pipeline by one candidate field. Empty when the field holds no data. */
async function probeTerritoryField(userId: string, field: string): Promise<TerritoryFieldProbe> {
  const records = await runSfQuery(
    `SELECT Opportunity.${field} FROM OpportunityTeamMember WHERE UserId = '${userId}' AND Opportunity.IsClosed = false AND Opportunity.${field} != null`,
  );
  const counts = new Map<string, number>();
  for (const r of records) {
    const value = readPath(r.Opportunity, field);
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return { field, counts };
}

async function discoverTerritories(
  userId: string,
  described: SfSObjectDescription | null,
): Promise<Partial<SalesforceContext>> {
  const candidates = rankTerritoryFieldCandidates(described?.fields ?? []);
  if (candidates.length === 0) return {};

  const probes = await Promise.all(
    candidates.map((field) => probeTerritoryField(userId, field).catch(() => ({ field, counts: new Map() }))),
  );
  const best = pickBestTerritoryField(probes);
  if (!best) return { territories: [] };

  const teamCounts = best.counts;
  const territories = [...teamCounts.keys()].sort();

  const totalCounts = new Map<string, number>();
  const countPromises = territories.map(async (t) => {
    const escaped = t.replace(/'/g, "''");
    const recs = await runSfQuery(
      `SELECT COUNT(Id) FROM Opportunity WHERE ${best.field} = '${escaped}' AND IsClosed = false`,
    );
    const cnt = (recs[0]?.expr0 ?? 0) as number;
    totalCounts.set(t, cnt);
  });
  await Promise.all(countPromises);

  const territoryDetails: TerritoryDetail[] = territories.map((name) => {
    const teamOpps = teamCounts.get(name) ?? 0;
    const totalOpps = totalCounts.get(name) ?? 0;
    const coverage = totalOpps > 0 ? Math.round((teamOpps / totalOpps) * 100) : 0;
    return { name, teamOpps, totalOpps, coverage };
  });

  territoryDetails.sort((a, b) => b.teamOpps - a.teamOpps);

  return { territories, territoryDetails, territoryField: best.field };
}

async function discoverAccounts(userId: string): Promise<Partial<SalesforceContext>> {
  const records = await runSfQuery(
    `SELECT COUNT(Id) cnt, Opportunity.Account.Name FROM OpportunityTeamMember WHERE UserId = '${userId}' AND Opportunity.IsClosed = false GROUP BY Opportunity.Account.Name ORDER BY COUNT(Id) DESC LIMIT 30`,
  );
  const accounts = records
    .map((r) => {
      const name =
        ((r as Record<string, unknown>).Name as string | undefined) ??
        (((r as Record<string, unknown>).Account as Record<string, unknown> | undefined)?.Name as string | undefined);
      const cnt = (r.cnt ?? r.expr0) as number | undefined;
      if (!name || cnt == null) return null;
      return { name, oppCount: cnt };
    })
    .filter(Boolean) as Array<{ name: string; oppCount: number }>;
  return { activeAccounts: accounts };
}

/**
 * Optional named fields this plugin knows how to consume. Feature-detected against the discovered
 * catalog, never assumed: an org without them simply gets no segmentation breakdown, rather than
 * a failed query.
 */
const PRODUCT_SEGMENTATION_FIELD = 'Product_Segmentation__c';

async function discoverSegmentations(
  userId: string,
  described: SfSObjectDescription | null,
): Promise<Partial<SalesforceContext>> {
  if (!described?.fields.some((f) => f.name === PRODUCT_SEGMENTATION_FIELD)) return {};
  const records = await runSfQuery(
    `SELECT Product_Segmentation__c FROM Opportunity WHERE Id IN (SELECT OpportunityId FROM OpportunityTeamMember WHERE UserId = '${userId}') AND IsClosed = false AND Product_Segmentation__c != null`,
  );
  const unique = [...new Set(records.map((r) => r.Product_Segmentation__c as string).filter(Boolean))].sort();
  return { productSegmentations: unique };
}

async function discoverForecasts(userId: string): Promise<Partial<SalesforceContext>> {
  const records = await runSfQuery(
    `SELECT Opportunity.ForecastCategoryName, COUNT(Id) cnt FROM OpportunityTeamMember WHERE UserId = '${userId}' AND Opportunity.IsClosed = false GROUP BY Opportunity.ForecastCategoryName`,
  );
  const unique = [
    ...new Set(
      records
        .map((r) => {
          const opp = r.Opportunity as Record<string, unknown> | undefined;
          return (opp?.ForecastCategoryName ?? r.ForecastCategoryName) as string | undefined;
        })
        .filter(Boolean) as string[],
    ),
  ];
  return { forecastCategories: unique };
}

async function discoverStages(userId: string): Promise<Partial<SalesforceContext>> {
  const records = await runSfQuery(
    `SELECT Opportunity.StageName, COUNT(Id) cnt FROM OpportunityTeamMember WHERE UserId = '${userId}' AND Opportunity.IsClosed = false GROUP BY Opportunity.StageName ORDER BY COUNT(Id) DESC`,
  );
  const unique = [
    ...new Set(
      records
        .map((r) => {
          const opp = r.Opportunity as Record<string, unknown> | undefined;
          return (opp?.StageName ?? r.StageName) as string | undefined;
        })
        .filter(Boolean) as string[],
    ),
  ];
  return { stages: unique };
}

async function discoverPipelineSummary(userId: string): Promise<Partial<SalesforceContext>> {
  const records = await runSfQuery(
    `SELECT ForecastCategoryName, SUM(Amount) total, COUNT(Id) cnt FROM Opportunity WHERE Id IN (SELECT OpportunityId FROM OpportunityTeamMember WHERE UserId = '${userId}') AND IsClosed = false GROUP BY ForecastCategoryName ORDER BY SUM(Amount) DESC`,
  );
  const byForecast: Record<string, { amount: number; count: number }> = {};
  let total = 0;
  let dealCount = 0;
  for (const r of records) {
    const cat = r.ForecastCategoryName as string | undefined;
    if (!cat) continue;
    const amount = (r.total ?? 0) as number;
    const count = (r.cnt ?? r.expr0 ?? 0) as number;
    byForecast[cat] = { amount, count };
    total += amount;
    dealCount += count;
  }
  return { pipelineSummary: { byForecast, total, dealCount } };
}

async function discoverTeamRoles(userId: string): Promise<Partial<SalesforceContext>> {
  const records = await runSfQuery(
    `SELECT TeamMemberRole, COUNT(Id) cnt FROM OpportunityTeamMember WHERE UserId = '${userId}' AND Opportunity.IsClosed = false GROUP BY TeamMemberRole`,
  );
  const unique = [...new Set(records.map((r) => r.TeamMemberRole as string | undefined).filter(Boolean) as string[])];
  return { teamRoles: unique };
}

/** Infer a short role label from a Salesforce User title. Generic -- no company-specific logic. */
function inferRoleFromTitle(title: string): string {
  const t = title.toLowerCase();
  if (t.includes('solution') || t.includes('systems engineer') || t.includes('pre-sales') || t.includes('presales'))
    return 'SE';
  if (t.includes('account') && (t.includes('executive') || t.includes('manager'))) return 'AE';
  if (t.includes('account') && t.includes('mgr')) return 'AE';
  if (t.includes('customer success')) return 'CSM';
  if (t.includes('architect')) return 'SA';
  if (t.includes('sales') && t.includes('engineer')) return 'SE';
  if (t.includes('territory') && (t.includes('manager') || t.includes('mgr'))) return 'AE';
  return 'Partner';
}

async function discoverPartner(userId: string): Promise<Partial<SalesforceContext>> {
  const records = await runSfQuery(
    `SELECT UserId, User.Name, User.Title, COUNT(Id) cnt FROM OpportunityTeamMember WHERE OpportunityId IN (SELECT OpportunityId FROM OpportunityTeamMember WHERE UserId = '${userId}' AND Opportunity.IsClosed = false) AND UserId != '${userId}' GROUP BY UserId, User.Name, User.Title ORDER BY COUNT(Id) DESC LIMIT 3`,
  );
  if (records.length === 0) return {};

  const top = records[0];
  const userObj = top.User as Record<string, unknown> | undefined;
  const name = (userObj?.Name ?? top.Name ?? '') as string;
  const title = (userObj?.Title ?? top.Title ?? '') as string;
  const id = (top.UserId ?? '') as string;
  if (!name || !id) return {};

  const role = inferRoleFromTitle(title);

  return {
    discoveredPartner: { id, name, title: title || undefined, role },
  };
}

async function discoverRoleAndTeam(userId: string): Promise<Partial<SalesforceContext>> {
  const userRecords = await runSfQuery(
    `SELECT UserRole.Name, ManagerId, Manager.Name FROM User WHERE Id = '${userId}'`,
  );
  if (userRecords.length === 0) return {};
  const user = userRecords[0];
  const roleObj = user.UserRole as Record<string, unknown> | undefined;
  const managerObj = user.Manager as Record<string, unknown> | undefined;
  const roleName = (roleObj?.Name as string | undefined) ?? undefined;
  const managerId = (user.ManagerId as string | undefined) ?? undefined;
  const managerName = (managerObj?.Name as string | undefined) ?? undefined;

  const result: Partial<SalesforceContext> = { roleName, managerId, managerName };

  if (roleName) {
    result.discoveredRole = inferRoleFromTitle(roleName);
  }

  if (managerId) {
    const teamRecords = await runSfQuery(
      `SELECT Id, Name, Title FROM User WHERE ManagerId = '${managerId}' AND IsActive = true ORDER BY Name`,
    );
    result.team = teamRecords.map((r) => ({
      id: r.Id as string,
      name: r.Name as string,
      title: (r.Title as string | undefined) ?? undefined,
    }));
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main discovery
// ---------------------------------------------------------------------------

export async function discoverSalesforceContext(): Promise<SalesforceContext | null> {
  if (!$which('sf')) return null;

  const [orgInfo, described] = await Promise.all([getOrgInfo(), describeOpportunity()]);
  if (!orgInfo) return null;

  const profile = await loadProfileSafe();
  const userId = profile.identifiers?.salesforceId;
  if (!userId) return null;

  const results = await Promise.all([
    discoverTerritories(userId, described).catch(() => ({})),
    discoverAccounts(userId).catch(() => ({})),
    discoverSegmentations(userId, described).catch(() => ({})),
    discoverForecasts(userId).catch(() => ({})),
    discoverStages(userId).catch(() => ({})),
    discoverPipelineSummary(userId).catch(() => ({})),
    discoverTeamRoles(userId).catch(() => ({})),
    discoverRoleAndTeam(userId).catch(() => ({})),
    discoverPartner(userId).catch(() => ({})),
  ]);

  const merged: SalesforceContext = {
    userId,
    username: orgInfo.username,
    instanceUrl: orgInfo.instanceUrl,
    orgAlias: orgInfo.alias || undefined,
    opportunityFields: described?.fields.map((f) => f.name),
    collectedAt: new Date().toISOString(),
  };
  for (const partial of results) {
    Object.assign(merged, partial);
  }

  return merged;
}

export async function seedSalesforceContext(): Promise<SalesforceContext | null> {
  const ctx = await discoverSalesforceContext();
  if (ctx) {
    await saveSalesforceContext(ctx);
  }
  return ctx;
}

// ---------------------------------------------------------------------------
/** Join a value list under a character budget, truncating the tail as `+N more`. */
function joinWithBudget(values: string[] | undefined, budget: number): string | undefined {
  if (!values?.length) return undefined;
  const joined = values.join(', ');
  if (joined.length <= budget) return joined;
  let result = values[0];
  let included = 1;
  for (let i = 1; i < values.length; i++) {
    const candidate = `${result}, ${values[i]}`;
    if (candidate.length > budget - 10) break;
    result = candidate;
    included++;
  }
  const remaining = values.length - included;
  if (remaining > 0) result += `, +${remaining} more`;
  return result;
}

/** Budget for a discovered picklist list in the session hint — enough to be usable, not a dump. */
const VALUE_LIST_CHAR_BUDGET = 160;

// ---------------------------------------------------------------------------
// Hint builder
// ---------------------------------------------------------------------------

export function buildSalesforceHint(
  ctx: SalesforceContext | null,
  profile?: { partner?: UserProfile['partner']; territories?: string[]; quota?: number },
): SalesforceHint | undefined {
  if (!ctx?.pipelineSummary) return undefined;
  const total = ctx.pipelineSummary.total;
  const fmtAmount = (n: number) =>
    n >= 1_000_000
      ? `$${(n / 1_000_000).toFixed(1)}M`
      : n >= 1_000
        ? `$${(n / 1_000).toFixed(0)}K`
        : `$${n.toFixed(0)}`;
  const formatted = fmtAmount(total);

  const territorySource = profile?.territories?.length
    ? profile.territories
    : ctx.confirmedTerritories?.length
      ? ctx.confirmedTerritories
      : ctx.territories?.slice(0, 3);
  const TERRITORY_CHAR_BUDGET = 60;
  const topTerritories = joinWithBudget(territorySource, TERRITORY_CHAR_BUDGET);

  const byForecast = ctx.pipelineSummary.byForecast;
  const forecastParts: string[] = [];
  for (const cat of ['Commit', 'Best Case', 'Pipeline']) {
    const entry = byForecast[cat];
    if (entry && entry.amount > 0) {
      const label = cat === 'Best Case' ? 'BC' : cat === 'Pipeline' ? 'Pipe' : cat;
      forecastParts.push(`${label} ${fmtAmount(entry.amount)}`);
    }
  }
  const forecastBreakdown = forecastParts.length > 0 ? forecastParts.join(', ') : undefined;

  const profilePartner = profile?.partner;
  const partner = profilePartner ?? ctx.confirmedPartner ?? ctx.discoveredPartner;
  const isUserAuthored = !!profilePartner || !!ctx.confirmedPartner;
  const partnerName = partner?.name ? (isUserAuthored ? partner.name : `${partner.name} (unconfirmed)`) : undefined;
  const partnerRole = partner?.role;

  return {
    pipelineTotal: formatted,
    dealCount: ctx.pipelineSummary.dealCount,
    accountCount: ctx.activeAccounts?.length ?? 0,
    territories: topTerritories,
    forecastBreakdown,
    partnerName,
    partnerRole,
    orgAlias: ctx.orgAlias,
    partnerId: partner?.id,
    quota: profile?.quota,
    stages: joinWithBudget(ctx.stages, VALUE_LIST_CHAR_BUDGET),
    forecastCategories: joinWithBudget(ctx.forecastCategories, VALUE_LIST_CHAR_BUDGET),
    territoryField: ctx.territoryField,
  };
}

// ---------------------------------------------------------------------------
// Markdown renderer
// ---------------------------------------------------------------------------

export function renderSalesforceContextMarkdown(
  ctx: SalesforceContext | null,
  profile?: { partner?: UserProfile['partner']; territories?: string[]; role?: string },
): string {
  if (!ctx) {
    return 'No Salesforce context available. Ensure sf CLI is authenticated and context has been discovered.';
  }

  const sections: string[] = [];

  sections.push('# Salesforce Context');
  sections.push(`**User:** ${ctx.username}`);
  sections.push(`**Instance:** ${ctx.instanceUrl}`);
  if (ctx.orgAlias) sections.push(`**Org Alias:** ${ctx.orgAlias}`);
  if (ctx.roleName) sections.push(`**Role:** ${ctx.roleName}`);

  // Pipeline Summary
  if (ctx.pipelineSummary) {
    sections.push('\n## Pipeline Summary');
    const hint = buildSalesforceHint(ctx);
    if (hint) {
      sections.push(`**Total Pipeline:** ${hint.pipelineTotal} across ${hint.dealCount} deals`);
    }
    const entries = Object.entries(ctx.pipelineSummary.byForecast);
    if (entries.length > 0) {
      sections.push('\n| Forecast Category | Amount | Deals |');
      sections.push('|---|---|---|');
      for (const [cat, { amount, count }] of entries) {
        const fmt =
          amount >= 1_000_000
            ? `$${(amount / 1_000_000).toFixed(1)}M`
            : amount >= 1_000
              ? `$${(amount / 1_000).toFixed(0)}K`
              : `$${amount.toFixed(0)}`;
        sections.push(`| ${cat} | ${fmt} | ${count} |`);
      }
    }
  }

  // Active Accounts
  if (ctx.activeAccounts && ctx.activeAccounts.length > 0) {
    sections.push('\n## Active Accounts');
    sections.push(`${ctx.activeAccounts.length} accounts with open pipeline:\n`);
    for (const acct of ctx.activeAccounts) {
      sections.push(`- **${acct.name}** (${acct.oppCount} opportunities)`);
    }
  }

  // Territories
  if (ctx.territoryDetails && ctx.territoryDetails.length > 0) {
    const confirmed = new Set(ctx.confirmedTerritories ?? []);
    const hasConfirmed = confirmed.size > 0;
    sections.push('\n## Territories');
    if (!hasConfirmed) {
      sections.push('\n> **Action needed:** Confirm which territories are your primary responsibility.');
      sections.push('> High team-opp coverage suggests primary ownership. Low coverage suggests overlay.\n');
    }
    sections.push('| Territory | Your Opportunities | Total | Coverage | Status |');
    sections.push('|---|---|---|---|---|');
    for (const td of ctx.territoryDetails) {
      const status = hasConfirmed
        ? confirmed.has(td.name)
          ? 'Primary'
          : 'Overlay'
        : td.coverage >= 20
          ? 'Likely primary'
          : 'Likely overlay';
      sections.push(`| ${td.name} | ${td.teamOpps} | ${td.totalOpps} | ${td.coverage}% | ${status} |`);
    }
  } else if (ctx.territories && ctx.territories.length > 0) {
    sections.push('\n## Territories');
    for (const t of ctx.territories) {
      sections.push(`- ${t}`);
    }
  }

  // Product Segmentations
  if (ctx.productSegmentations && ctx.productSegmentations.length > 0) {
    sections.push('\n## Product Segmentations');
    for (const s of ctx.productSegmentations) {
      sections.push(`- ${s}`);
    }
  }

  // Stages
  if (ctx.stages && ctx.stages.length > 0) {
    sections.push('\n## Stages');
    for (const s of ctx.stages) {
      sections.push(`- ${s}`);
    }
  }

  // Team Roles
  if (ctx.teamRoles && ctx.teamRoles.length > 0) {
    sections.push('\n## Team Member Roles');
    for (const r of ctx.teamRoles) {
      sections.push(`- ${r}`);
    }
  }

  // Team
  if (ctx.managerName || (ctx.team && ctx.team.length > 0)) {
    sections.push('\n## Team');
    if (ctx.managerName) {
      sections.push(`**Manager:** ${ctx.managerName}`);
    }
    if (ctx.team && ctx.team.length > 0) {
      sections.push(`\n**Direct Reports** (${ctx.team.length}):\n`);
      for (const member of ctx.team) {
        const title = member.title ? ` — ${member.title}` : '';
        sections.push(`- ${member.name}${title}`);
      }
    }
  }

  // Org Capabilities
  if (ctx.opportunityFields?.length) {
    sections.push('\n## Org Capabilities');
    const custom = ctx.opportunityFields.filter((n) => n.endsWith('__c'));
    sections.push(
      `Opportunity schema: ${ctx.opportunityFields.length} fields (${custom.length} custom). Use \`sf_describe\` to look any of them up — they are not listed here.`,
    );
    sections.push(
      ctx.territoryField
        ? `Territory grouping field: \`${ctx.territoryField}\` (selected by pipeline coverage).`
        : 'No usable territory grouping field found on Opportunity.',
    );
  }

  // Action Needed
  const needsConfirmation: string[] = [];
  const profileHasPartner = !!profile?.partner?.name;
  const profileHasTerritories = !!profile?.territories?.length;
  if (!profileHasPartner && ctx.discoveredPartner) {
    needsConfirmation.push(
      `- **Partner:** Discovered "${ctx.discoveredPartner.name}" (${ctx.discoveredPartner.role}) from opportunity co-membership.`,
    );
    needsConfirmation.push(
      `  To confirm: add \`"partner": { "name": "${ctx.discoveredPartner.name}", "role": "${ctx.discoveredPartner.role}" }\` to \`~/.xcsh/user-profile.json\``,
    );
  }
  if (!profileHasTerritories && ctx.territories?.length) {
    const examples = ctx.territories
      .slice(0, 2)
      .map((t) => `"${t}"`)
      .join(', ');
    needsConfirmation.push(
      `- **Territories:** ${ctx.territories.length} discovered from pipeline. Primary ones are unknown.`,
    );
    needsConfirmation.push(`  To confirm: add \`"territories": [${examples}]\` to \`~/.xcsh/user-profile.json\``);
  }
  if (!profile?.role) {
    needsConfirmation.push(
      `- **Role:** Not set. Add \`"role": "SE"\` (or AE/CSM/SA/etc.) to \`~/.xcsh/user-profile.json\``,
    );
  }
  if (needsConfirmation.length > 0) {
    sections.push('\n## Setup: Identity Facts');
    sections.push(
      '\nThe following are unknown. Set them in `~/.xcsh/user-profile.json` to get accurate partner-scoped pipeline reports.\n',
    );
    for (const line of needsConfirmation) {
      sections.push(line);
    }
  }

  // Footer
  sections.push(`\n---\n*Collected: ${ctx.collectedAt}*`);

  return sections.join('\n');
}
