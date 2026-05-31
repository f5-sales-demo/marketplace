import * as os from 'node:os';
import * as path from 'node:path';
import { $ } from 'bun';

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

  // Org capabilities
  customFields?: {
    trueAcv: boolean;
    upsellAcv: boolean;
    productSegmentation: boolean;
    useCaseCategory: boolean;
    territory: boolean;
    renewal: boolean;
  };

  // Pipeline summary
  pipelineSummary?: {
    byForecast: Record<string, { amount: number; count: number }>;
    total: number;
    dealCount: number;
  };
  // Team member roles on opps
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

async function detectCustomFields(): Promise<SalesforceContext['customFields']> {
  const defaults = {
    trueAcv: false,
    upsellAcv: false,
    productSegmentation: false,
    useCaseCategory: false,
    territory: false,
    renewal: false,
  };
  try {
    const result = await $`sf sobject describe --sobject Opportunity --json`.quiet().nothrow();
    if (result.exitCode !== 0) return defaults;
    const parsed = JSON.parse(result.stdout.toString()) as {
      result?: { fields?: Array<{ name: string }> };
    };
    const fieldNames = new Set((parsed.result?.fields ?? []).map((f) => f.name));
    return {
      trueAcv: fieldNames.has('True_ACV__c'),
      upsellAcv: fieldNames.has('Upsell_ACV__c'),
      productSegmentation: fieldNames.has('Product_Segmentation__c'),
      useCaseCategory: fieldNames.has('Use_Case_Category__c'),
      territory: fieldNames.has('Territory_Credited_District_del__c'),
      renewal: fieldNames.has('Renewal__c'),
    };
  } catch {
    return defaults;
  }
}

// ---------------------------------------------------------------------------
// Discovery probes
// ---------------------------------------------------------------------------

async function discoverTerritories(
  userId: string,
  customFields: SalesforceContext['customFields'],
): Promise<Partial<SalesforceContext>> {
  if (!customFields?.territory) return {};

  const teamRecords = await runSfQuery(
    `SELECT Opportunity.Territory_Credited_District_del__c FROM OpportunityTeamMember WHERE UserId = '${userId}' AND Opportunity.IsClosed = false AND Opportunity.Territory_Credited_District_del__c != null`,
  );
  const teamCounts = new Map<string, number>();
  for (const r of teamRecords) {
    const opp = r.Opportunity as Record<string, unknown> | undefined;
    const t = opp?.Territory_Credited_District_del__c as string | undefined;
    if (t) teamCounts.set(t, (teamCounts.get(t) ?? 0) + 1);
  }
  const territories = [...teamCounts.keys()].sort();
  if (territories.length === 0) return { territories: [] };

  const totalCounts = new Map<string, number>();
  const countPromises = territories.map(async (t) => {
    const escaped = t.replace(/'/g, "''");
    const recs = await runSfQuery(
      `SELECT COUNT(Id) FROM Opportunity WHERE Territory_Credited_District_del__c = '${escaped}' AND IsClosed = false`,
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

  return { territories, territoryDetails };
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

async function discoverSegmentations(
  userId: string,
  customFields: SalesforceContext['customFields'],
): Promise<Partial<SalesforceContext>> {
  if (!customFields?.productSegmentation) return {};
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

  const [orgInfo, customFields] = await Promise.all([getOrgInfo(), detectCustomFields()]);
  if (!orgInfo) return null;

  const profile = await loadProfileSafe();
  const userId = profile.identifiers?.salesforceId;
  if (!userId) return null;

  const results = await Promise.all([
    discoverTerritories(userId, customFields).catch(() => ({})),
    discoverAccounts(userId).catch(() => ({})),
    discoverSegmentations(userId, customFields).catch(() => ({})),
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
    customFields,
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
/** Format territory list with a character budget. If joined string exceeds budget, truncate with +N more. */
function formatTerritoryDisplay(territories: string[] | undefined, budget: number): string | undefined {
  if (!territories?.length) return undefined;
  const joined = territories.join(', ');
  if (joined.length <= budget) return joined;
  let result = territories[0];
  let included = 1;
  for (let i = 1; i < territories.length; i++) {
    const candidate = `${result}, ${territories[i]}`;
    if (candidate.length > budget - 10) break;
    result = candidate;
    included++;
  }
  const remaining = territories.length - included;
  if (remaining > 0) result += `, +${remaining} more`;
  return result;
}

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
  const topTerritories = formatTerritoryDisplay(territorySource, TERRITORY_CHAR_BUDGET);

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
      sections.push(`- **${acct.name}** (${acct.oppCount} opps)`);
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
    sections.push('| Territory | Your Opps | Total | Coverage | Status |');
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
  if (ctx.customFields) {
    sections.push('\n## Org Capabilities');
    const fields = ctx.customFields;
    const enabled = Object.entries(fields)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (enabled.length > 0) {
      sections.push(`Custom fields detected: ${enabled.join(', ')}`);
    } else {
      sections.push('No custom opportunity fields detected.');
    }
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
