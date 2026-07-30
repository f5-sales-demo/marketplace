// Schema description: normalizing and rendering `sf sobject describe` payloads.
//
// Kept free of I/O so the filtering and volume rules are trivially testable, mirroring how
// sf-exec-guard.ts keeps its allowlist logic pure.
//
// Why this exists at all: a mature Opportunity carries 642 fields (593 of them custom, ~14.5 KB
// of names). Neither a model nor a prompt can hold that, and no two orgs agree on the custom
// ones — so field names must be LOOKED UP, never guessed or hardcoded. Every consumer therefore
// goes through a match filter, and an unfiltered call deliberately returns a summary rather than
// the whole catalog.

/** Maximum field rows rendered in one response, filtered or not. */
export const DESCRIBE_MAX_ROWS = 60;

/** Maximum active picklist values shown per field before eliding the tail. */
const MAX_PICKLIST_VALUES = 15;

export interface SfFieldDescription {
  name: string;
  label: string;
  type: string;
  custom: boolean;
  filterable: boolean;
  /** Usable in a GROUP BY. Not every filterable field is groupable — long text is not. */
  groupable: boolean;
  /** Active values only; an inactive value cannot appear in live data. */
  picklistValues?: string[];
  referenceTo?: string[];
}

export interface SfChildRelationship {
  childSObject: string;
  /** Absent on relationships that cannot be traversed in SOQL. */
  relationshipName?: string;
  field: string;
}

export interface SfSObjectDescription {
  name: string;
  label?: string;
  fields: SfFieldDescription[];
  childRelationships: SfChildRelationship[];
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value.filter((v) => v && typeof v === 'object') as Record<string, unknown>[]) : [];
}

function normalizeField(raw: Record<string, unknown>): SfFieldDescription {
  const name = String(raw.name ?? '');
  const picklist = asRecordArray(raw.picklistValues)
    .filter((p) => p.active !== false)
    .map((p) => String(p.value ?? ''))
    .filter(Boolean);
  const referenceTo = Array.isArray(raw.referenceTo) ? raw.referenceTo.map(String).filter(Boolean) : [];
  return {
    name,
    label: String(raw.label ?? name),
    type: String(raw.type ?? 'unknown'),
    custom: Boolean(raw.custom),
    filterable: raw.filterable !== false,
    groupable: raw.groupable !== false,
    ...(picklist.length > 0 ? { picklistValues: picklist } : {}),
    ...(referenceTo.length > 0 ? { referenceTo } : {}),
  };
}

export function normalizeDescribe(raw: unknown): SfSObjectDescription {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const name = String(obj.name ?? '');
  return {
    name,
    label: obj.label ? String(obj.label) : undefined,
    fields: asRecordArray(obj.fields).map(normalizeField),
    childRelationships: asRecordArray(obj.childRelationships)
      .map((c) => ({
        childSObject: String(c.childSObject ?? ''),
        relationshipName: c.relationshipName ? String(c.relationshipName) : undefined,
        field: String(c.field ?? ''),
      }))
      .filter((c) => c.childSObject),
  };
}

function fieldMatches(field: SfFieldDescription, needle: string): boolean {
  return field.name.toLowerCase().includes(needle) || field.label.toLowerCase().includes(needle);
}

function relationshipMatches(rel: SfChildRelationship, needle: string): boolean {
  return rel.childSObject.toLowerCase().includes(needle) || (rel.relationshipName ?? '').toLowerCase().includes(needle);
}

/**
 * Make a value safe to place in a markdown table cell.
 *
 * Not hypothetical: this org's `Competitor_1__c` picklist contains the literal value
 * `Broadcom (Symantec | Blue Coat | VMware)`, whose pipes split one cell into four and shift
 * every column after it. Newlines (common in textarea labels) end the row outright.
 */
function cell(value: string): string {
  return value
    .replace(/\|/g, '\\|')
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .trim();
}

function renderFieldRows(fields: SfFieldDescription[]): string[] {
  return fields.map((f) => {
    const detail: string[] = [];
    if (f.picklistValues?.length) {
      const shown = f.picklistValues.slice(0, MAX_PICKLIST_VALUES);
      const elided = f.picklistValues.length - shown.length;
      detail.push(`values: ${shown.join(', ')}${elided > 0 ? ` (+${elided} more)` : ''}`);
    }
    if (f.referenceTo?.length) detail.push(`-> ${f.referenceTo.join(', ')}`);
    if (!f.filterable) detail.push('not filterable');
    // Callers are told to pick grouping fields out of this table, so a field that GROUP BY
    // rejects must not look identical to one it accepts.
    if (!f.groupable) detail.push('not groupable');
    return `| ${cell(f.name)} | ${cell(f.label)} | ${cell(f.type)} | ${cell(detail.join('; '))} |`;
  });
}

function table(fields: SfFieldDescription[]): string[] {
  return ['| Field | Label | Type | Notes |', '|---|---|---|---|', ...renderFieldRows(fields)];
}

export function formatDescribe(desc: SfSObjectDescription, match?: string): string {
  const needle = (match ?? '').trim().toLowerCase();
  const total = desc.fields.length;
  const heading = `**${desc.name}** — ${total} fields`;

  if (!needle) {
    // No filter: standard fields only. The custom ones are where orgs diverge, they vastly
    // outnumber the standard ones, and the caller has given nothing to select them by.
    const standard = desc.fields.filter((f) => !f.custom);
    const shown = standard.slice(0, DESCRIBE_MAX_ROWS);
    const customCount = total - standard.length;
    const lines = [
      heading,
      '',
      `Showing ${shown.length} of ${standard.length} standard fields. ${customCount} custom field(s) are not listed — custom field names differ between orgs, so pass \`match\` to find them (e.g. \`match: "competitor"\`).`,
      '',
      ...table(shown),
    ];
    if (desc.childRelationships.length > 0) {
      lines.push('', `${desc.childRelationships.length} child relationship(s); pass \`match\` to list them.`);
    }
    return lines.join('\n');
  }

  const matched = desc.fields.filter((f) => fieldMatches(f, needle));
  const matchedRels = desc.childRelationships.filter((r) => relationshipMatches(r, needle));

  if (matched.length === 0 && matchedRels.length === 0) {
    return `${heading}\n\nNo field or child relationship on ${desc.name} matches "${match}". Try a shorter or different term, or call again without \`match\` to see the standard fields.`;
  }

  const shown = matched.slice(0, DESCRIBE_MAX_ROWS);
  const withheld = matched.length - shown.length;
  const lines = [heading, '', `${matched.length} field(s) match "${match}".`];
  if (withheld > 0) lines.push(`Showing the first ${shown.length}; ${withheld} more — narrow \`match\` to see them.`);
  if (shown.length > 0) lines.push('', ...table(shown));

  if (matchedRels.length > 0) {
    lines.push('', `**Child relationships matching "${match}"**`, '');
    lines.push('| Child object | Relationship (use in SOQL) | Foreign key |', '|---|---|---|');
    for (const r of matchedRels) {
      lines.push(`| ${cell(r.childSObject)} | ${cell(r.relationshipName ?? '(not traversable)')} | ${cell(r.field)} |`);
    }
  }

  return lines.join('\n');
}
