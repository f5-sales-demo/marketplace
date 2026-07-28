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

  test('when both names are present the current one wins and the legacy one is dropped', () => {
    // Leaving the legacy key would keep the file legacy forever, so every read would go on
    // refusing it — the migration has to terminate.
    const legacy = asLegacyDeal();
    legacy.stakeholders[0].sentiment = 'Negative';
    const result = migrateDeal(legacy);
    expect(shape(result.deal).stakeholders[0].sentiment).toBe('Negative');
    expect(shape(result.deal).stakeholders[0].viewOfF5).toBeUndefined();
    expect(result.changes.some((c) => c.includes('dropped') && c.includes('viewOfF5'))).toBe(true);
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
