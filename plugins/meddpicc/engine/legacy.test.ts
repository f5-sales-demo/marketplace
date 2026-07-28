import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { migrateDeal, RENAMED_FIELDS } from './legacy';
import { validateDeal } from './validate';

const here = import.meta.dir;
const schema = JSON.parse(fs.readFileSync(path.join(here, '..', 'schema', 'meddpicc-schema.json'), 'utf8'));
const example = JSON.parse(fs.readFileSync(path.join(here, '..', 'schema', 'example-deal.json'), 'utf8'));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/**
 * Just enough shape to assert against. The codebase avoids `any`; these tests reach into a few
 * known branches of the deal, so name those and cast once.
 */
interface DealShape {
  metadata: { revenue: Record<string, number> };
  threeWhys: Record<string, Record<string, string>>;
  stakeholders: Array<Record<string, string>>;
  team: Record<string, Array<Record<string, string>>>;
}
const shape = (deal: unknown) => deal as DealShape;

/**
 * The example deal with every field put back to its old name.
 *
 * Written out by hand rather than derived from `RENAMED_FIELDS`, so the fixture is independent of
 * the table under test — driving both from one list would let a wrong entry agree with itself.
 */
function asLegacyDeal(): DealShape {
  const deal = clone(example);
  deal.metadata.revenue.pAndIplusAcvx = deal.metadata.revenue.subscription;
  delete deal.metadata.revenue.subscription;
  deal.threeWhys.f5 = deal.threeWhys.us;
  delete deal.threeWhys.us;
  deal.threeWhys.f5.whyF5 = deal.threeWhys.f5.whyUs;
  delete deal.threeWhys.f5.whyUs;
  for (const s of deal.stakeholders) {
    s.viewOfF5 = s.sentiment;
    delete s.sentiment;
    s.f5Owner = s.relationshipOwner;
    delete s.relationshipOwner;
  }
  deal.team.f5 = deal.team.internal;
  delete deal.team.internal;
  return deal;
}

describe('migrateDeal', () => {
  test('a deal already using the current names is left exactly alone', () => {
    const before = clone(example);
    const result = migrateDeal(example);
    expect(result.changes).toEqual([]);
    expect(result.deal).toEqual(before);
  });

  test('every legacy field moves, and every value survives the move', () => {
    const legacy = asLegacyDeal();
    const result = migrateDeal(legacy);
    // Values, not just keys: a rename that dropped the value would still change the key names.
    expect(result.deal).toEqual(example);
    expect(result.changes).toHaveLength(RENAMED_FIELDS.length + (example.stakeholders.length - 1) * 2);
  });

  test('the input is not mutated', () => {
    const legacy = asLegacyDeal();
    const untouched = clone(legacy);
    migrateDeal(legacy);
    expect(legacy).toEqual(untouched);
  });

  test('the renamed parent is handled before the child inside it', () => {
    // `whyF5` lives under `threeWhys.f5`, which is itself renamed. Applied in the wrong order the
    // child rename looks for a container that no longer exists and silently does nothing.
    const legacy = asLegacyDeal();
    const result = shape(migrateDeal(legacy).deal);
    expect(result.threeWhys.us.whyUs).toBe(example.threeWhys.us.whyUs);
    expect(result.threeWhys.us.whyF5).toBeUndefined();
    expect(result.threeWhys.f5).toBeUndefined();
  });

  test('every stakeholder is migrated, not just the first', () => {
    const legacy = asLegacyDeal();
    expect(legacy.stakeholders.length).toBeGreaterThan(1);
    const result = shape(migrateDeal(legacy).deal);
    for (const [i, s] of result.stakeholders.entries()) {
      expect(s.sentiment).toBe(example.stakeholders[i].sentiment);
      expect(s.relationshipOwner).toBe(example.stakeholders[i].relationshipOwner);
      expect(s.viewOfF5).toBeUndefined();
      expect(s.f5Owner).toBeUndefined();
    }
  });

  test('each change names the concrete path it moved, including the list index', () => {
    const result = migrateDeal(asLegacyDeal());
    expect(result.changes).toContain('threeWhys.f5 → threeWhys.us');
    expect(result.changes).toContain('stakeholders[1].viewOfF5 → stakeholders[1].sentiment');
    expect(result.changes).toContain('metadata.revenue.pAndIplusAcvx → metadata.revenue.subscription');
  });

  test('a key keeps its position, so the applied file is a readable diff', () => {
    const legacy = asLegacyDeal();
    const before = Object.keys(legacy.stakeholders[0]);
    const result = shape(migrateDeal(legacy).deal);
    const after = Object.keys(result.stakeholders[0]);
    expect(after).toEqual(
      before.map((k) => (k === 'viewOfF5' ? 'sentiment' : k === 'f5Owner' ? 'relationshipOwner' : k)),
    );
  });

  test('identical values on both sides resolve — there is nothing to weigh', () => {
    const legacy = asLegacyDeal();
    legacy.stakeholders[0].sentiment = legacy.stakeholders[0].viewOfF5;
    const result = migrateDeal(legacy);
    expect(result.conflicts).toEqual([]);
    expect(shape(result.deal).stakeholders[0].sentiment).toBe(shape(asLegacyDeal()).stakeholders[0].viewOfF5);
    expect(result.resolved.some((r) => r.includes('stakeholders[0]') && /identical/.test(r))).toBe(true);
  });

  test('an empty value on the current side resolves to the legacy one', () => {
    const legacy = asLegacyDeal();
    legacy.stakeholders[0].sentiment = '   ';
    const result = migrateDeal(legacy);
    expect(result.conflicts).toEqual([]);
    expect(shape(result.deal).stakeholders[0].sentiment).toBe(shape(asLegacyDeal()).stakeholders[0].viewOfF5);
    expect(result.resolved.length).toBeGreaterThan(0);
  });

  test('an empty legacy value resolves to the current one', () => {
    const legacy = asLegacyDeal();
    legacy.stakeholders[0].viewOfF5 = '';
    legacy.stakeholders[0].sentiment = 'Negative';
    const result = migrateDeal(legacy);
    expect(result.conflicts).toEqual([]);
    expect(shape(result.deal).stakeholders[0].sentiment).toBe('Negative');
    expect(shape(result.deal).stakeholders[0].viewOfF5).toBeUndefined();
  });

  test('a partly hand-migrated subtree merges key by key, with nothing left to adjudicate', () => {
    // The realistic case: someone added `threeWhys.us` by hand and left `threeWhys.f5` in place.
    // Two keys exist on one side only and the third is identical, so none of it is ambiguous.
    const legacy = asLegacyDeal();
    const populated = { ...shape(legacy).threeWhys.f5 };
    legacy.threeWhys.us = { whyNow: populated.whyNow };
    const result = migrateDeal(legacy);
    expect(result.conflicts).toEqual([]);
    expect(shape(result.deal).threeWhys.f5).toBeUndefined();
    expect(shape(result.deal).threeWhys.us).toEqual({
      whyNow: populated.whyNow,
      whyAnything: populated.whyAnything,
      whyUs: populated.whyF5,
    });
  });

  test('an object whose every answer is blank counts as empty', () => {
    // A hand-added stub like `{whyNow: ""}` holds no answers, so the populated legacy subtree wins
    // outright rather than being merged key by key against nothing.
    const legacy = asLegacyDeal();
    const populated = { ...shape(legacy).threeWhys.f5 };
    legacy.threeWhys.us = { whyAnything: '', whyNow: '   ' };
    const result = migrateDeal(legacy);
    expect(result.conflicts).toEqual([]);
    expect(shape(result.deal).threeWhys.us.whyAnything).toBe(populated.whyAnything);
    expect(shape(result.deal).threeWhys.us.whyUs).toBe(populated.whyF5);
    expect(shape(result.deal).threeWhys.us.whyNow).toBe(populated.whyNow);
  });

  test('two different non-empty values are still a conflict, and neither is touched', () => {
    const legacy = asLegacyDeal();
    legacy.stakeholders[0].sentiment = 'Negative';
    const result = migrateDeal(legacy);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toContain('stakeholders[0].viewOfF5');
    expect(shape(result.deal).stakeholders[0].sentiment).toBe('Negative');
    expect(shape(result.deal).stakeholders[0].viewOfF5).toBe(shape(asLegacyDeal()).stakeholders[0].viewOfF5);
  });

  test('0 and false are answers, not emptiness', () => {
    // Treating them as empty would silently overwrite a deliberate zero score or a deliberate no.
    const legacy = asLegacyDeal();
    legacy.metadata.revenue.pAndIplusAcvx = 0;
    legacy.metadata.revenue.subscription = 150000;
    const result = migrateDeal(legacy);
    expect(result.conflicts).toHaveLength(1);
    expect(shape(result.deal).metadata.revenue.pAndIplusAcvx).toBe(0);
    expect(shape(result.deal).metadata.revenue.subscription).toBe(150000);
  });

  test('two non-empty lists are never merged — that would invent people', () => {
    // Concatenating would duplicate whoever appears in both, and no order is defensible.
    const legacy = asLegacyDeal();
    legacy.team.internal = [{ name: 'Someone Else', role: 'AE' }];
    const result = migrateDeal(legacy);
    expect(result.conflicts).toHaveLength(1);
    expect(shape(result.deal).team.internal).toEqual([{ name: 'Someone Else', role: 'AE' }]);
    expect(shape(result.deal).team.f5).toEqual(shape(asLegacyDeal()).team.f5);
  });

  test('an empty list on one side does resolve', () => {
    const legacy = asLegacyDeal();
    legacy.team.internal = [];
    const result = migrateDeal(legacy);
    expect(result.conflicts).toEqual([]);
    expect(shape(result.deal).team.internal).toEqual(shape(asLegacyDeal()).team.f5);
  });

  test('a subtree with one conflicting leaf leaves BOTH sides alone', () => {
    // A half-merged object is the worst outcome: it looks migrated, and the disagreement that
    // stopped it is now buried inside instead of being reported.
    const legacy = asLegacyDeal();
    const populated = { ...shape(legacy).threeWhys.f5 };
    legacy.threeWhys.us = { whyNow: 'a different answer entirely' };
    const result = migrateDeal(legacy);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toContain('whyNow');
    expect(shape(result.deal).threeWhys.f5).toEqual(populated);
    expect(shape(result.deal).threeWhys.us).toEqual({ whyNow: 'a different answer entirely' });
  });

  test('every resolution is reported, so nothing is dropped without saying so', () => {
    const legacy = asLegacyDeal();
    legacy.stakeholders[0].sentiment = legacy.stakeholders[0].viewOfF5;
    legacy.stakeholders[1].sentiment = '';
    const result = migrateDeal(legacy);
    expect(result.conflicts).toEqual([]);
    expect(result.resolved).toHaveLength(2);
    for (const line of result.resolved) expect(line).toMatch(/stakeholders\[[01]\]/);
  });

  test('a legacy key present ALWAYS produces a report — that is what makes callers refuse', () => {
    // The invariant the refusal depends on. Merging correctly in memory while reporting nothing
    // makes `refuseLegacyDeal` accept the file, so the workbook goes on ignoring the legacy value:
    // the exact silent loss this module exists to prevent, reached by the code meant to prevent it.
    for (const deal of [
      { threeWhys: { f5: { whyAnything: 'legacy answer' }, us: {} } },
      { threeWhys: { f5: { whyAnything: 'a' }, us: { whyNow: 'b' } } },
      { threeWhys: { f5: {}, us: { whyNow: 'b' } } },
      { team: { f5: [{ name: 'A' }], internal: [] } },
    ]) {
      const result = migrateDeal(deal);
      const reported = result.changes.length + result.resolved.length + result.conflicts.length;
      expect(reported).toBeGreaterThan(0);
    }
  });

  test('each key taken from the legacy side is named', () => {
    const result = migrateDeal({ threeWhys: { f5: { whyAnything: 'a' }, us: { whyNow: 'b' } } });
    expect(result.conflicts).toEqual([]);
    expect(result.resolved.some((r) => r.includes('threeWhys.f5.whyAnything'))).toBe(true);
    expect(shape(result.deal).threeWhys.us).toEqual({ whyNow: 'b', whyAnything: 'a' });
  });

  test('a legacy key that held nothing is still reported before being removed', () => {
    const result = migrateDeal({ threeWhys: { f5: {}, us: { whyNow: 'b' } } });
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0]).toContain('threeWhys.f5');
    expect(shape(result.deal).threeWhys.f5).toBeUndefined();
  });

  test('migrating twice changes nothing the second time', () => {
    const once = migrateDeal(asLegacyDeal());
    const twice = migrateDeal(once.deal);
    expect(twice.changes).toEqual([]);
    expect(twice.deal).toEqual(once.deal);
  });

  test('a migrated deal validates against the current schema', () => {
    expect(validateDeal(migrateDeal(asLegacyDeal()).deal, schema).valid).toBe(true);
  });

  test('a legacy deal is what the current schema silently tolerates — which is why this exists', () => {
    // No `additionalProperties: false` anywhere, so the old file passes validation while its
    // values sit unreachable. Validation alone can never be the guard here.
    expect(validateDeal(asLegacyDeal(), schema).valid).toBe(true);
    expect(migrateDeal(asLegacyDeal()).changes.length).toBeGreaterThan(0);
  });

  test('an empty or partial deal is handled without throwing', () => {
    expect(migrateDeal({}).changes).toEqual([]);
    expect(migrateDeal({ threeWhys: {} }).changes).toEqual([]);
    expect(migrateDeal({ stakeholders: [] }).changes).toEqual([]);
    expect(migrateDeal({ stakeholders: 'not a list' }).changes).toEqual([]);
    expect(migrateDeal(null).changes).toEqual([]);
  });
});
