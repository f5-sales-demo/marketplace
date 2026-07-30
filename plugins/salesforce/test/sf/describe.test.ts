import { describe, expect, it } from 'bun:test';
import { DESCRIBE_MAX_ROWS, formatDescribe, normalizeDescribe } from '../../src/sf/describe';

// Shaped after a real `sf sobject describe --sobject Opportunity --json` payload. The field
// names are the ones this org actually has — the bug that motivated this tool was an agent
// querying `Competitor__c`, which does not exist, because nothing let it look them up.
const OPPORTUNITY_RAW = {
  name: 'Opportunity',
  label: 'Opportunity',
  fields: [
    { name: 'Id', label: 'Opportunity ID', type: 'id', custom: false, filterable: true },
    { name: 'Name', label: 'Opportunity Name', type: 'string', custom: false, filterable: true },
    { name: 'Amount', label: 'Amount', type: 'currency', custom: false, filterable: true },
    {
      name: 'StageName',
      label: 'Stage',
      type: 'picklist',
      custom: false,
      filterable: true,
      picklistValues: [
        { value: 'Awareness', active: true },
        { value: 'Negotiation', active: true },
        { value: 'Retired Stage', active: false },
      ],
    },
    { name: 'Competitor_1__c', label: 'Primary Competitor', type: 'picklist', custom: true, filterable: true },
    { name: 'Competition_Notes__c', label: 'Competition Notes', type: 'textarea', custom: true, filterable: false },
    { name: 'Other_Competitor__c', label: 'Other Competitor', type: 'string', custom: true, filterable: true },
    { name: 'LID__MainCompetitors__c', label: 'Main Competitor(s)', type: 'string', custom: true, filterable: true },
    { name: 'ETM_Core_Territory__c', label: 'Core Territory', type: 'string', custom: true, filterable: true },
    {
      name: 'AccountId',
      label: 'Account ID',
      type: 'reference',
      custom: false,
      filterable: true,
      referenceTo: ['Account'],
    },
  ],
  childRelationships: [
    { childSObject: 'OpportunityCompetitor', relationshipName: 'OpportunityCompetitors', field: 'OpportunityId' },
    { childSObject: 'OpportunityLineItem', relationshipName: 'OpportunityLineItems', field: 'OpportunityId' },
    { childSObject: 'Note', relationshipName: null, field: 'ParentId' },
  ],
};

describe('normalizeDescribe', () => {
  it('extracts fields and child relationships', () => {
    const d = normalizeDescribe(OPPORTUNITY_RAW);
    expect(d.name).toBe('Opportunity');
    expect(d.fields).toHaveLength(10);
    expect(d.childRelationships).toHaveLength(3);
  });

  it('keeps only ACTIVE picklist values', () => {
    const d = normalizeDescribe(OPPORTUNITY_RAW);
    const stage = d.fields.find((f) => f.name === 'StageName');
    expect(stage?.picklistValues).toEqual(['Awareness', 'Negotiation']);
  });

  it('tolerates a payload with no fields or relationships', () => {
    const d = normalizeDescribe({ name: 'Empty' });
    expect(d.fields).toEqual([]);
    expect(d.childRelationships).toEqual([]);
  });
});

describe('formatDescribe — match filtering', () => {
  it('finds the org\'s real competitor fields, which are not named "Competitor__c"', () => {
    const out = formatDescribe(normalizeDescribe(OPPORTUNITY_RAW), 'competitor');
    expect(out).toContain('Competitor_1__c');
    expect(out).toContain('Other_Competitor__c');
    expect(out).toContain('LID__MainCompetitors__c');
    expect(out).not.toContain('ETM_Core_Territory__c');
  });

  it('matches on the LABEL as well as the API name', () => {
    // "Competition Notes" is only reachable via its label when searching for "notes".
    const out = formatDescribe(normalizeDescribe(OPPORTUNITY_RAW), 'notes');
    expect(out).toContain('Competition_Notes__c');
  });

  it('is case-insensitive', () => {
    const out = formatDescribe(normalizeDescribe(OPPORTUNITY_RAW), 'COMPETITOR');
    expect(out).toContain('Competitor_1__c');
  });

  it('surfaces matching child relationships', () => {
    const out = formatDescribe(normalizeDescribe(OPPORTUNITY_RAW), 'competitor');
    expect(out).toContain('OpportunityCompetitors');
    expect(out).not.toContain('OpportunityLineItems');
  });

  it('reports no match plainly rather than silently returning an empty table', () => {
    const out = formatDescribe(normalizeDescribe(OPPORTUNITY_RAW), 'zzzznope');
    expect(out).toContain('No field or child relationship');
    expect(out).toContain('zzzznope');
  });

  it('lists active picklist values so stage and category names need not be guessed', () => {
    const out = formatDescribe(normalizeDescribe(OPPORTUNITY_RAW), 'stage');
    expect(out).toContain('Awareness');
    expect(out).toContain('Negotiation');
    expect(out).not.toContain('Retired Stage');
  });
});

describe('formatDescribe — table safety', () => {
  // Real value observed on this org's Competitor_1__c picklist. Unescaped, its pipes split one
  // cell into four and shift every column to the right of it.
  const piped = normalizeDescribe({
    name: 'Opportunity',
    fields: [
      {
        name: 'Competitor_1__c',
        label: 'Primary Competitor',
        type: 'picklist',
        custom: true,
        filterable: true,
        picklistValues: [{ value: 'Broadcom (Symantec | Blue Coat | VMware)', active: true }],
      },
      { name: 'Notes__c', label: 'Line\none\nlabel', type: 'textarea', custom: true, filterable: true },
    ],
    childRelationships: [],
  });

  it('escapes pipes inside a cell so the table keeps its column count', () => {
    const out = formatDescribe(piped, 'competitor');
    const row = out.split('\n').find((l) => l.includes('Competitor_1__c')) ?? '';
    expect(row).toContain('Symantec \\| Blue Coat');
    // 4 columns -> 5 delimiters once the interior pipes are escaped.
    expect(row.split(/(?<!\\)\|/)).toHaveLength(6);
  });

  it('flattens newlines in a label so the row cannot end early', () => {
    const out = formatDescribe(piped, 'notes');
    const row = out.split('\n').find((l) => l.includes('Notes__c')) ?? '';
    expect(row).toContain('Line one label');
  });
});

describe('formatDescribe — unfiltered volume', () => {
  // Opportunity in a mature org has 642 fields / ~14.5 KB of names alone. Returning that
  // wholesale would blow the context window the tool exists to protect.
  const big = normalizeDescribe({
    name: 'Opportunity',
    fields: [
      ...Array.from({ length: 40 }, (_, i) => ({
        name: `Standard${i}`,
        label: `Standard ${i}`,
        type: 'string',
        custom: false,
        filterable: true,
      })),
      ...Array.from({ length: 600 }, (_, i) => ({
        name: `Custom${i}__c`,
        label: `Custom ${i}`,
        type: 'string',
        custom: true,
        filterable: true,
      })),
    ],
    childRelationships: [],
  });

  it('does not dump every field when no match is given', () => {
    const out = formatDescribe(big, undefined);
    const rows = out.split('\n').filter((l) => l.startsWith('| ') && l.includes('__c'));
    expect(rows.length).toBeLessThanOrEqual(DESCRIBE_MAX_ROWS);
    expect(out).not.toContain('Custom599__c');
  });

  it('states the real total and tells the caller how to narrow', () => {
    const out = formatDescribe(big, undefined);
    expect(out).toContain('640');
    expect(out).toContain('match');
  });

  it('caps a broad match and says how many were withheld', () => {
    const out = formatDescribe(big, 'custom');
    const rows = out.split('\n').filter((l) => l.startsWith('| ') && l.includes('__c'));
    expect(rows.length).toBeLessThanOrEqual(DESCRIBE_MAX_ROWS);
    expect(out).toContain('more');
  });
});
