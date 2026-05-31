import type { AccountRow, DataAnomaly, PipelineReportData, SectionData } from './types';

function fmtCurrency(val: number): string {
  if (!Number.isFinite(val) || val === 0) return '\u2014';
  return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtCompact(val: number): string {
  if (!Number.isFinite(val) || val === 0) return '\u2014';
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

function renderAnomalies(anomalies: DataAnomaly[]): string {
  if (anomalies.length === 0) return '';

  const lines: string[] = [];
  lines.push('## Data Quality');
  lines.push('');

  for (const a of anomalies) {
    const icon = a.severity === 'error' ? '[ERROR]' : a.severity === 'warning' ? '[WARN]' : '[INFO]';
    lines.push(`- **${icon} ${a.category}:** ${a.message}`);
    if (a.details) lines.push(`  - ${a.details}`);
  }
  lines.push('');

  return lines.join('\n');
}

function fmtQuarterDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** Derive F5 fiscal quarter label from quarter start date.
 *  F5 fiscal year starts November 1: Q1=Nov–Jan, Q2=Feb–Apr, Q3=May–Jul, Q4=Aug–Oct. */
function fmtFiscalQuarter(startDateStr: string): string {
  const d = new Date(`${startDateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const m = d.getMonth(); // 0-indexed
  const y = d.getFullYear();
  if (m >= 10) return `FY${(y + 1) % 100} Q1`;
  if (m <= 0) return `FY${y % 100} Q1`;
  if (m <= 3) return `FY${y % 100} Q2`;
  if (m <= 6) return `FY${y % 100} Q3`;
  return `FY${y % 100} Q4`;
}

export function renderPipelineReport(data: PipelineReportData, _instanceUrl: string): string {
  const lines: string[] = [];

  lines.push('# F5 Distributed Cloud Pipeline Report');
  lines.push('');
  lines.push(`**Generated:** ${new Date(data.generated).toLocaleString()}`);
  const fq = fmtFiscalQuarter(data.quarter.start);
  const dateRange = `${fmtQuarterDate(data.quarter.start)} \u2014 ${fmtQuarterDate(data.quarter.end)}`;
  lines.push(`**Quarter:** ${fq ? `${fq} (${dateRange})` : dateRange}`);
  if (data.territories.length > 0) {
    lines.push(`**Territories:** ${data.territories.join(' | ')}`);
  }
  if (data.teamMembers.length > 0) {
    lines.push(`**Team:** ${data.teamMembers.join(' + ')}`);
  }
  lines.push(`**Model:** FYB (Net New) + True ACV (Renewals) | In-quarter scope`);
  lines.push(`**Line items:** ${data.lineItemCount} | **SKUs:** ${data.skusFound.length}`);
  lines.push('');

  // Executive summary
  const summaryParts: string[] = [];
  if (data.netNew.quotaTotal > 0) {
    summaryParts.push(`Net New: ${fmtCompact(data.netNew.quotaTotal)} (${data.netNew.accounts.length} accounts)`);
  }
  if (data.renewals.quotaTotal > 0) {
    summaryParts.push(`Renewals: ${fmtCompact(data.renewals.quotaTotal)} (${data.renewals.accounts.length} accounts)`);
  }
  if (data.booked.quotaTotal > 0) {
    summaryParts.push(`Booked: ${fmtCompact(data.booked.quotaTotal)}`);
  } else {
    summaryParts.push('Booked: $0');
  }
  if (data.fyBookedTotal && data.fyLabel) {
    summaryParts.push(`${data.fyLabel} YTD Booked: ${fmtCompact(data.fyBookedTotal)}`);
  }
  if (summaryParts.length > 0) {
    lines.push(`**Summary:** ${summaryParts.join(' | ')}`);
    lines.push('');
  }

  // Render a section as a combined Platform + Shape table.
  // Two columns per row ensures zero-value cells produce em-dash,
  // which the quality check looks for with /\|\s*\u2014\s*\|/.
  function renderBiSection(title: string, section: SectionData): string {
    if (section.accounts.length === 0) return '';
    const rows = section.accounts.filter((r) => r.platform + r.shape > 0);
    if (rows.length === 0) return '';

    const lines: string[] = [];
    lines.push(`### ${title}`);
    lines.push('');
    lines.push('| Account | Platform (Distributed Cloud) | Point (Shape + DI) |');
    lines.push('|:---|---:|---:|');

    // Group by territory for sub-headers
    const byTerritory = new Map<string, AccountRow[]>();
    for (const row of rows) {
      const t = row.territory || 'Unassigned';
      const arr = byTerritory.get(t) ?? [];
      arr.push(row);
      byTerritory.set(t, arr);
    }

    const platTotal = rows.reduce((s, r) => s + r.platform, 0);
    const shapeTotal = rows.reduce((s, r) => s + r.shape, 0);

    for (const [territory, territoryRows] of byTerritory) {
      if (byTerritory.size > 1) {
        const terrQuota = territoryRows.reduce((s, r) => s + r.platform + r.shape, 0);
        lines.push(
          `| **\u2014 ${territory} (${territoryRows.length} acct${territoryRows.length > 1 ? 's' : ''}, ${fmtCompact(terrQuota)}) \u2014** | | |`,
        );
      }
      for (const row of territoryRows) {
        lines.push(`| ${row.name} | ${fmtCurrency(row.platform)} | ${fmtCurrency(row.shape)} |`);
      }
    }
    lines.push(`| **Total** | **${fmtCurrency(platTotal)}** | **${fmtCurrency(shapeTotal)}** |`);
    lines.push('');

    const quotaLabel = `**${title} Quota Total (Platform + Point):** ${fmtCompact(section.quotaTotal)}`;
    lines.push(quotaLabel, '');
    return lines.join('\n');
  }

  const booked = renderBiSection('Closed \u2014 Booked This Quarter', data.booked);
  if (booked) {
    lines.push(booked);
  } else {
    lines.push('## Closed \u2014 Booked This Quarter');
    lines.push('');
    lines.push('No deals closed this quarter.');
    lines.push('');
  }

  const netNew = renderBiSection('Open Pipeline \u2014 Net New', data.netNew);
  if (netNew) {
    lines.push(netNew);
  } else {
    lines.push('## Open Pipeline \u2014 Net New');
    lines.push('');
    lines.push('No open net new pipeline this quarter.');
    lines.push('');
  }

  const renewals = renderBiSection('Open Pipeline \u2014 Renewals', data.renewals);
  if (renewals) {
    lines.push(renewals);
  } else {
    lines.push('## Open Pipeline \u2014 Renewals');
    lines.push('');
    lines.push('No open renewals this quarter.');
    lines.push('');
  }

  // Forecast
  const fc = data.forecast;
  const fcTotal = fc.commit + fc.bestCase + fc.pipeline;
  lines.push('## Forecast Summary \u2014 Platform + Point');
  lines.push('');
  lines.push('| Category | Amount |');
  lines.push('|:---|---:|');
  lines.push(`| Commit | ${fmtCurrency(fc.commit)} |`);
  lines.push(`| Best Case | ${fmtCurrency(fc.bestCase)} |`);
  lines.push(`| Pipeline | ${fmtCurrency(fc.pipeline)} |`);
  lines.push(`| **Total** | **${fmtCurrency(fcTotal)}** |`);
  lines.push('');

  // Top Deals
  if (data.topDeals && data.topDeals.length > 0) {
    lines.push('## Top Deals \u2014 Net New Pipeline');
    lines.push('');
    lines.push('| Deal | Account | Owner | Stage | Close | Forecast | Amount |');
    lines.push('|:---|:---|:---|:---|:---|:---|---:|');
    for (const d of data.topDeals) {
      const close = d.closeDate ? fmtQuarterDate(d.closeDate) : '\u2014';
      lines.push(
        `| ${d.name} | ${d.accountName} | ${d.ownerName || '\u2014'} | ${d.stage || '\u2014'} | ${close} | ${d.forecast} | ${fmtCurrency(d.amount)} |`,
      );
    }
    lines.push('');
    // Next steps (only for deals that have one populated)
    const withNextSteps = data.topDeals.filter((d) => d.nextStep);
    if (withNextSteps.length > 0) {
      lines.push('**Next Steps:**');
      lines.push('');
      for (const d of withNextSteps) {
        lines.push(`- **${d.name}**: ${d.nextStep}`);
      }
      lines.push('');
    }
  }

  // Top Renewals
  if (data.topRenewals && data.topRenewals.length > 0) {
    lines.push('## Top Renewals');
    lines.push('');
    lines.push('| Deal | Account | Owner | Close | Forecast | Amount |');
    lines.push('|:---|:---|:---|:---|:---|---:|');
    for (const d of data.topRenewals) {
      const close = d.closeDate ? fmtQuarterDate(d.closeDate) : '\u2014';
      lines.push(
        `| ${d.name} | ${d.accountName} | ${d.ownerName || '\u2014'} | ${close} | ${d.forecast} | ${fmtCurrency(d.amount)} |`,
      );
    }
    lines.push('');
  }

  // Close date distribution
  if (data.closeDistribution && data.closeDistribution.length > 0) {
    lines.push('## Pipeline Timing \u2014 Net New by Close Month');
    lines.push('');
    lines.push('| Month | Deals | Commit | Best Case | Pipeline | Total |');
    lines.push('|:---|---:|---:|---:|---:|---:|');
    let totC = 0;
    let totBC = 0;
    let totP = 0;
    let totAll = 0;
    let totOpps = 0;
    for (const b of data.closeDistribution) {
      lines.push(
        `| ${b.label} | ${b.oppCount} | ${fmtCurrency(b.commit)} | ${fmtCurrency(b.bestCase)} | ${fmtCurrency(b.pipeline)} | ${fmtCurrency(b.amount)} |`,
      );
      totC += b.commit;
      totBC += b.bestCase;
      totP += b.pipeline;
      totAll += b.amount;
      totOpps += b.oppCount;
    }
    lines.push(
      `| **Total** | **${totOpps}** | **${fmtCurrency(totC)}** | **${fmtCurrency(totBC)}** | **${fmtCurrency(totP)}** | **${fmtCurrency(totAll)}** |`,
    );
    lines.push('');
  }

  // Renewal Timing — same format as Pipeline Timing but for renewals
  if (data.renewalDistribution && data.renewalDistribution.length > 0) {
    lines.push('## Renewal Timing \u2014 by Close Month');
    lines.push('');
    lines.push('| Month | Deals | Amount |');
    lines.push('|:---|---:|---:|');
    let rTotal = 0;
    let rOpps = 0;
    for (const b of data.renewalDistribution) {
      lines.push(`| ${b.label} | ${b.oppCount} | ${fmtCurrency(b.amount)} |`);
      rTotal += b.amount;
      rOpps += b.oppCount;
    }
    lines.push(`| **Total** | **${rOpps}** | **${fmtCurrency(rTotal)}** |`);
    lines.push('');
  }

  // Recent pipeline changes (last 7 days)
  if (data.recentChanges && data.recentChanges.length > 0) {
    lines.push('## Pipeline Movement \u2014 Last 7 Days');
    lines.push('');
    lines.push('| Deal | Account | Field | Before | After | Date |');
    lines.push('|:---|:---|:---|---:|---:|:---|');
    // Deduplicate: keep only the most-recent change per opportunity+field combo
    // (records arrive in DESC date order, so first occurrence is latest).
    // Uses oppId for stable identity — deal names are not unique across opportunities.
    const seen = new Set<string>();
    const fmtHistVal = (v: string) => {
      const n = Number(v);
      return Number.isFinite(n) && n !== 0 ? fmtCurrency(n) : v;
    };
    for (const c of data.recentChanges) {
      const key = `${c.oppId}|${c.field}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const fieldLabel = c.field === 'ForecastCategoryName' ? 'Forecast' : c.field === 'StageName' ? 'Stage' : 'Amount';
      lines.push(
        `| ${c.dealName} | ${c.accountName} | ${fieldLabel} | ${fmtHistVal(c.oldValue)} | ${fmtHistVal(c.newValue)} | ${c.date} |`,
      );
    }
    lines.push('');
  }

  // Anomalies
  const anomalySection = renderAnomalies(data.anomalies);
  if (anomalySection) lines.push(anomalySection);

  // SKUs discovered
  if (data.skusFound.length > 0) {
    lines.push('## SKUs Discovered');
    lines.push('');
    lines.push(data.skusFound.map((s) => `\`${s}\``).join(', '));
    lines.push('');
  }

  return lines.join('\n');
}
