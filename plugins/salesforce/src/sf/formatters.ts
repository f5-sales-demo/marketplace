import type { SfOrg, SfQueryResult } from './types';

const OBJECT_LABELS: Record<string, string> = {
  opportunity: 'opportunities',
  account: 'accounts',
  contact: 'contacts',
  case: 'cases',
  lead: 'leads',
  task: 'tasks',
  opportunitylineitem: 'line items',
  opportunityteammember: 'team members',
  product2: 'products',
  user: 'users',
};

export function deriveQueryLabel(soql: string): string {
  if (!soql) return 'query';
  const upper = soql.toUpperCase();

  // Detect forecast breakdown: GROUP BY ForecastCategoryName
  if (upper.includes('FORECASTCATEGORYNAME') && upper.includes('GROUP BY')) return 'forecast breakdown';

  // Extract FROM object
  const fromMatch = soql.match(/\bFROM\s+(\w+)/i);
  const fromObject = fromMatch?.[1]?.toLowerCase() ?? '';
  const baseLabel = OBJECT_LABELS[fromObject] ?? fromObject.toLowerCase();

  // Build qualifiers
  const parts: string[] = [];

  if (upper.includes('ISWON = TRUE') || upper.includes('ISWON=TRUE')) parts.push('closed-won');
  else if (upper.includes('ISCLOSED = FALSE') || upper.includes('ISCLOSED=FALSE')) parts.push('open');
  else if (upper.includes('ISCLOSED = TRUE') || upper.includes('ISCLOSED=TRUE')) parts.push('closed');

  if (upper.includes("TYPE = 'RENEWAL'") || upper.includes('TYPE = "RENEWAL"')) parts.push('renewals');

  const label = parts.length > 0 ? `${parts.join(' ')} ${baseLabel}` : baseLabel;

  // Append time scope
  if (upper.includes('THIS_FISCAL_QUARTER')) return `${label} (this quarter)`;
  if (upper.includes('LAST_FISCAL_QUARTER')) return `${label} (last quarter)`;
  if (upper.includes('NEXT_FISCAL_QUARTER')) return `${label} (next quarter)`;
  if (upper.includes('THIS_FISCAL_YEAR')) return `${label} (this year)`;
  if (upper.includes('LAST_FISCAL_YEAR')) return `${label} (last year)`;

  if (upper.includes('GROUP BY')) return `${label} summary`;

  return label || 'query';
}

export function formatOrgTable(orgs: SfOrg[]): string {
  if (orgs.length === 0) {
    return 'No authenticated orgs found.';
  }

  const header = '| Alias | Username | Org ID | Instance | Status |';
  const divider = '|-------|----------|--------|----------|--------|';

  const rows = orgs.map((org) => {
    const alias = org.alias
      ? org.isDefault
        ? `${org.alias} (default)`
        : org.alias
      : org.isDefault
        ? '(none) (default)'
        : '(none)';
    return `| ${alias} | ${org.username} | ${org.orgId} | ${org.instanceUrl} | ${org.connectedStatus} |`;
  });

  return [header, divider, ...rows].join('\n');
}

export function formatOrgDetail(org: SfOrg): string {
  const lines: string[] = [];

  lines.push(`**${org.alias || org.username}**`);
  lines.push(`Username: ${org.username}`);
  lines.push(`Org ID: ${org.orgId}`);
  lines.push(`Instance: ${org.instanceUrl}`);
  lines.push(`Status: ${org.connectedStatus}`);

  if (org.isDefault) {
    lines.push('Default: yes');
  }

  if (org.isSandbox) {
    lines.push('Type: Sandbox');
  }

  return lines.join('\n');
}

export function flattenRecord(record: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (key === 'attributes') {
      continue;
    }

    if (value === null) {
      continue;
    }

    if (typeof value === 'object' && !Array.isArray(value)) {
      const nested = value as Record<string, unknown>;
      for (const [nestedKey, nestedValue] of Object.entries(nested)) {
        if (nestedKey === 'attributes') {
          continue;
        }
        result[`${key}.${nestedKey}`] = nestedValue;
      }
      continue;
    }

    result[key] = value;
  }

  return result;
}

export function formatQueryResults(result: SfQueryResult): string {
  if (result.records.length === 0) {
    return 'No records found.';
  }

  const flatRecords = result.records.map((r) => flattenRecord(r as Record<string, unknown>));

  const allColumns = Array.from(
    flatRecords.reduce((cols, record) => {
      for (const key of Object.keys(record)) {
        cols.add(key);
      }
      return cols;
    }, new Set<string>()),
  );

  const header = `| ${allColumns.join(' | ')} |`;
  const divider = `| ${allColumns.map(() => '---').join(' | ')} |`;

  const rows = flatRecords.map((record) => {
    const cells = allColumns.map((col) => {
      const val = record[col];
      return val === null || val === undefined ? '' : String(val);
    });
    return `| ${cells.join(' | ')} |`;
  });

  return `${result.totalSize} records returned.\n\n${[header, divider, ...rows].join('\n')}`;
}
