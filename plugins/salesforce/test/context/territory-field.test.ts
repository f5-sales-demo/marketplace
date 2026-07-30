import { describe, expect, it } from 'bun:test';
import { pickBestTerritoryField, rankTerritoryFieldCandidates } from '../../src/context/salesforce-context';
import type { SfFieldDescription } from '../../src/sf/describe';

function field(partial: Partial<SfFieldDescription> & { name: string }): SfFieldDescription {
  return {
    label: partial.name,
    type: 'string',
    custom: partial.name.endsWith('__c'),
    filterable: true,
    groupable: true,
    ...partial,
  } as SfFieldDescription;
}

// Every territory-ish field on a real, heavily customised Opportunity. Twenty-one candidates is
// why the old hardcoded pick was wrong twice over: it named one org's field, and that field
// (Territory_Credited_District_del__c) is not even groupable, so it could not back a GROUP BY.
const REAL_TERRITORY_FIELDS: SfFieldDescription[] = [
  field({ name: 'Territory2Id', label: 'Territory ID', type: 'reference', custom: false }),
  field({
    name: 'IsExcludedFromTerritory2Filter',
    label: 'Exclude from the territory assignment filter logic',
    type: 'boolean',
    custom: false,
  }),
  field({ name: 'Territory__c', label: 'Territory', type: 'picklist' }),
  field({ name: 'Territory_Credited__c', label: 'Territory Credited', type: 'reference' }),
  field({ name: 'Territory_Grouping__c', label: 'Territory Grouping' }),
  field({ name: 'Owner_PS_Sales__c', label: 'PS Sales Territory Owner', groupable: false }),
  field({ name: 'Territory_Name__c', label: 'Territory Name' }),
  field({ name: 'Territory_Grouping_SVC__c', label: 'Territory Grouping (SVC)', type: 'picklist' }),
  field({ name: 'Territory_Credited_Category__c', label: 'Territory Credited Category', groupable: false }),
  field({ name: 'ETM_Core_Territory_Code__c', label: 'ETM Core Territory Code' }),
  field({ name: 'ETM_Core_Territory__c', label: 'ETM Core Territory' }),
  field({ name: 'ETM_PS_Territory_Code__c', label: 'ETM PS Territory Code' }),
  field({ name: 'ETM_PS_Territory__c', label: 'ETM PS Territory' }),
  field({ name: 'Opportunity_Territory_Type__c', label: 'Opportunity Territory Type', type: 'picklist' }),
  field({ name: 'Old_Territory_Credited__c', label: 'Old Territory Credited', type: 'reference' }),
  field({ name: 'Territory_Assignment_Error__c', label: 'Territory Assignment Error' }),
  field({
    name: 'Exclude_From_Territory_Assignment__c',
    label: 'Exclude Opp From Territory Assignment',
    type: 'boolean',
  }),
  field({ name: 'Territory_Credited_Region__c', label: 'Territory Credited Region', groupable: false }),
  field({ name: 'Territory_Credited_District_del__c', label: 'Territory Credited District', groupable: false }),
  field({ name: 'Amount', label: 'Amount', type: 'currency', custom: false }),
  field({ name: 'StageName', label: 'Stage', type: 'picklist', custom: false }),
];

describe('rankTerritoryFieldCandidates', () => {
  const ranked = rankTerritoryFieldCandidates(REAL_TERRITORY_FIELDS);

  it('returns only territory-related fields', () => {
    for (const name of ranked) expect(name.toLowerCase()).toContain('territor');
  });

  it('excludes fields that cannot back a GROUP BY', () => {
    expect(ranked).not.toContain('Territory_Credited_District_del__c');
    expect(ranked).not.toContain('Territory_Credited_Region__c');
    expect(ranked).not.toContain('Territory_Credited_Category__c');
  });

  it('excludes booleans, codes, error and legacy fields', () => {
    expect(ranked).not.toContain('Old_Territory_Credited__c');
    expect(ranked).not.toContain('Exclude_From_Territory_Assignment__c');
    expect(ranked).not.toContain('IsExcludedFromTerritory2Filter');
    expect(ranked).not.toContain('ETM_Core_Territory_Code__c');
    expect(ranked).not.toContain('Territory_Assignment_Error__c');
    expect(ranked).not.toContain('Opportunity_Territory_Type__c');
  });

  it('excludes a reference that does not point at a territory object', () => {
    // Territory_Credited__c is a lookup to a User in this org; its raw id says nothing.
    expect(ranked).not.toContain('Territory_Credited__c');
    expect(ranked).not.toContain('Territory_Credited__r.Name');
  });

  it('keeps the plausible groupable name fields', () => {
    expect(ranked).toContain('Territory__c');
    expect(ranked).toContain('ETM_Core_Territory__c');
    expect(ranked).toContain('Territory_Grouping__c');
  });

  it('is deterministic', () => {
    expect(rankTerritoryFieldCandidates(REAL_TERRITORY_FIELDS)).toEqual(ranked);
    expect(rankTerritoryFieldCandidates([...REAL_TERRITORY_FIELDS].reverse())).toEqual(ranked);
  });

  it('returns nothing for an org with no territory field', () => {
    expect(rankTerritoryFieldCandidates([field({ name: 'Amount', type: 'currency', custom: false })])).toEqual([]);
  });

  // Enterprise Territory Management is the STANDARD Salesforce territory model. An org using it
  // with no custom territory field got no territory context at all, because the filter dropped
  // every reference type. Territory2 is a standard object, so supporting it is not org-specific.
  it('supports standard Enterprise Territory Management via the Territory2 relationship', () => {
    const etmOnly = [
      field({
        name: 'Territory2Id',
        label: 'Territory ID',
        type: 'reference',
        custom: false,
        referenceTo: ['Territory2'],
      }),
      field({ name: 'Amount', label: 'Amount', type: 'currency', custom: false }),
    ];
    // Grouping by the raw id yields opaque 18-character keys, so the traversal is what is probed.
    expect(rankTerritoryFieldCandidates(etmOnly)).toEqual(['Territory2.Name']);
  });

  it('offers ETM alongside custom fields rather than instead of them', () => {
    const withEtm = [
      ...REAL_TERRITORY_FIELDS,
      field({
        name: 'Territory2Id',
        label: 'Territory ID',
        type: 'reference',
        custom: false,
        referenceTo: ['Territory2'],
      }),
    ];
    const out = rankTerritoryFieldCandidates(withEtm);
    expect(out).toContain('Territory2.Name');
    expect(out).toContain('ETM_Core_Territory__c');
  });

  // Ranking by API-name length then truncating discarded a populated authoritative field in
  // favour of shorter empty ones. Nothing in a name predicts which field holds the data — that
  // is what probing is for — so the list is only bounded, never reordered by a guess.
  it('does not drop plausible candidates behind a name-length heuristic', () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      field({ name: `Territory_${'x'.repeat(i)}_Field__c`, label: `Territory ${i}` }),
    );
    const out = rankTerritoryFieldCandidates(many);
    expect(out).toHaveLength(9);
    expect(out).toEqual([...out].sort());
  });

  it('still bounds the probe count for a pathological org', () => {
    const many = Array.from({ length: 40 }, (_, i) => field({ name: `Territory_${i}__c`, label: `Territory ${i}` }));
    expect(rankTerritoryFieldCandidates(many).length).toBeLessThanOrEqual(12);
  });
});

describe('pickBestTerritoryField', () => {
  it('picks the field that actually covers the most opportunities', () => {
    const best = pickBestTerritoryField([
      { field: 'Territory__c', counts: new Map([['A', 2]]) },
      {
        field: 'ETM_Core_Territory__c',
        counts: new Map([
          ['AMER Red 9', 40],
          ['EMEA Blue 2', 35],
        ]),
      },
      { field: 'Territory_Grouping__c', counts: new Map([['USA', 10]]) },
    ]);
    expect(best?.field).toBe('ETM_Core_Territory__c');
  });

  // Observed against a real org: ETM_PS_Territory__c and ETM_Core_Territory__c both cover 48
  // opportunities, but the first is a professional-services rollup. The finer partition is the
  // more informative territory; the degenerate case — one value covering everything — separates
  // nothing at all.
  it('prefers the finer partition when coverage ties', () => {
    const best = pickBestTerritoryField([
      {
        field: 'Region__c',
        counts: new Map([
          ['USA', 12],
          ['Canada', 8],
        ]),
      },
      {
        field: 'Territory__c',
        counts: new Map([
          ['a', 5],
          ['b', 5],
          ['c', 5],
          ['d', 5],
        ]),
      },
    ]);
    expect(best?.field).toBe('Territory__c');
  });

  it('rejects a single-value field in favour of one that actually partitions', () => {
    const best = pickBestTerritoryField([
      { field: 'AlwaysSame__c', counts: new Map([['GLOBAL', 20]]) },
      {
        field: 'Real_Territory__c',
        counts: new Map([
          ['East', 10],
          ['West', 10],
        ]),
      },
    ]);
    expect(best?.field).toBe('Real_Territory__c');
  });

  it('breaks a full tie by name so the choice is stable across runs', () => {
    const best = pickBestTerritoryField([
      { field: 'B__c', counts: new Map([['x', 5]]) },
      { field: 'A__c', counts: new Map([['y', 5]]) },
    ]);
    expect(best?.field).toBe('A__c');
  });

  it('ignores candidates with no data at all', () => {
    const best = pickBestTerritoryField([
      { field: 'Empty__c', counts: new Map() },
      { field: 'Used__c', counts: new Map([['x', 1]]) },
    ]);
    expect(best?.field).toBe('Used__c');
  });

  it('returns undefined when nothing has data', () => {
    expect(pickBestTerritoryField([{ field: 'Empty__c', counts: new Map() }])).toBeUndefined();
    expect(pickBestTerritoryField([])).toBeUndefined();
  });
});
