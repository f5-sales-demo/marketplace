import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { QUALIFICATION_ELEMENTS } from './sections';
import {
  checkWorkbookSpec,
  expandJsonPath,
  findMalformedReferences,
  parseReferences,
  type SpecSheet,
  VALUE_TYPE_STYLE,
  type WorkbookSpec,
} from './workbook-spec';

const schema = JSON.parse(fs.readFileSync(path.join(import.meta.dir, '..', 'schema', 'meddpicc-schema.json'), 'utf8'));

/**
 * A minimal but structurally complete spec: one form sheet, one fixed-row table over the
 * eight elements, one list table. Each test clones and breaks exactly one thing, so a
 * failure names the rule that caught it.
 */
function baseSpec(): WorkbookSpec {
  return {
    version: 1,
    sheets: [
      {
        name: 'Deal',
        kind: 'form',
        blocks: [
          { kind: 'title', text: 'MEDDPICC Deal Review' },
          { kind: 'field', id: 'acv', label: 'ACV', jsonPath: 'metadata.revenue.acv', valueType: 'currency' },
          {
            kind: 'field',
            id: 'winProbability',
            label: 'Win probability',
            jsonPath: 'metadata.winProbability',
            valueType: 'percent',
          },
          {
            kind: 'computed',
            id: 'factoredPipe',
            label: 'Factored pipeline',
            formula: '{{ref:acv}}*{{ref:winProbability}}',
            valueType: 'currency',
          },
        ],
      },
      {
        name: 'Qualification',
        kind: 'table',
        tables: [
          {
            id: 'elements',
            source: { kind: 'elements' },
            anchorColumn: 1,
            headerRow: 1,
            // A `{{row:…}}` reference below needs a column to match the key against.
            keyColumn: 'element',
            columns: [
              { id: 'element', header: 'Element', role: 'derived', valueType: 'string' },
              { id: 'score', header: 'Score', role: 'input', jsonPath: 'qualification.*.score', valueType: 'score' },
              {
                id: 'prevScore',
                header: 'Previous',
                role: 'input',
                jsonPath: 'scoring.previousElementScores.*',
                valueType: 'score',
              },
              {
                id: 'delta',
                header: 'Delta',
                role: 'computed',
                formula: '{{this:score}}-{{this:prevScore}}',
                valueType: 'number',
              },
            ],
          },
        ],
      },
      {
        name: 'Stakeholders',
        kind: 'table',
        tables: [
          {
            id: 'stakeholders',
            source: { kind: 'list', jsonPath: 'stakeholders' },
            anchorColumn: 1,
            headerRow: 1,
            columns: [
              { id: 'name', header: 'Name', role: 'input', jsonPath: 'name', valueType: 'string' },
              { id: 'mustSayYes', header: 'Must say yes', role: 'input', jsonPath: 'mustSayYes', valueType: 'boolean' },
            ],
          },
        ],
      },
      {
        name: 'Scorecard',
        kind: 'form',
        blocks: [
          {
            kind: 'computed',
            id: 'scoreTotal',
            label: 'Total',
            formula: 'SUM({{col:elements.score}})',
            valueType: 'number',
          },
          {
            kind: 'computed',
            id: 'metricsScore',
            label: 'Metrics',
            formula: '{{row:elements.score@metrics}}',
            valueType: 'score',
          },
        ],
      },
    ],
  };
}

/** Deep clone so a mutation in one test cannot leak into the next. */
const clone = (s: WorkbookSpec): WorkbookSpec => JSON.parse(JSON.stringify(s));

const sheet = (s: WorkbookSpec, name: string): SpecSheet => {
  const found = s.sheets.find((x) => x.name === name);
  if (!found) throw new Error(`fixture has no sheet ${name}`);
  return found;
};

describe('expandJsonPath', () => {
  test('leaves a plain path alone', () => {
    expect(expandJsonPath('metadata.accountName', QUALIFICATION_ELEMENTS)).toEqual(['metadata.accountName']);
  });

  test('expands a wildcard once per key', () => {
    expect(expandJsonPath('qualification.*.score', ['metrics', 'champion'])).toEqual([
      'qualification.metrics.score',
      'qualification.champion.score',
    ]);
  });

  test('resolves an open array index to the first element', () => {
    // `responses[]` means "one cell per response"; for schema resolution any index does.
    expect(expandJsonPath('qualification.metrics.responses[]', [])).toEqual(['qualification.metrics.responses[0]']);
  });

  test('refuses more than one wildcard rather than guessing which to expand', () => {
    expect(() => expandJsonPath('a.*.b.*', ['x'])).toThrow(/one wildcard/);
  });
});

describe('parseReferences', () => {
  test('finds every reference kind in a formula', () => {
    const refs = parseReferences(
      'IF({{ref:acv}}>0,SUM({{col:elements.score}})-{{this:prev}},{{row:elements.score@metrics}})',
    );
    expect(refs).toEqual([
      { kind: 'ref', target: 'acv', raw: '{{ref:acv}}' },
      { kind: 'col', target: 'elements.score', raw: '{{col:elements.score}}' },
      { kind: 'this', target: 'prev', raw: '{{this:prev}}' },
      { kind: 'row', target: 'elements.score@metrics', raw: '{{row:elements.score@metrics}}' },
    ]);
  });

  test('returns nothing for a formula with no references', () => {
    expect(parseReferences('TODAY()')).toEqual([]);
  });
});

describe('findMalformedReferences', () => {
  // A placeholder the parser does not recognise is invisible to it, so without this the
  // guard would pass a formula that reaches Excel with `{{reff:…}}` still in it.
  test('catches a misspelled reference kind', () => {
    expect(findMalformedReferences('{{reff:scoreTotal}}')).toEqual(['{{reff:scoreTotal}}']);
  });

  test('catches a placeholder with no kind at all', () => {
    expect(findMalformedReferences('SUM({{elements.score}})')).toEqual(['{{elements.score}}']);
  });

  test('catches an unclosed placeholder', () => {
    expect(findMalformedReferences('SUM({{col:elements.score)').join()).toMatch(/unbalanced/);
  });

  test('passes a formula whose placeholders are all well formed', () => {
    expect(findMalformedReferences('{{ref:acv}}*{{col:elements.score}}')).toEqual([]);
  });
});

describe('checkWorkbookSpec — the good spec', () => {
  test('passes every rule', () => {
    const result = checkWorkbookSpec(schema, baseSpec());
    expect(result).toMatchObject({ ok: true });
    expect(result.schemaPaths.checked).toBeGreaterThan(0);
    expect(result.references.checked).toBeGreaterThan(0);
  });
});

describe('checkWorkbookSpec — schema paths', () => {
  test('rejects an input whose jsonPath is not in the schema', () => {
    const spec = clone(baseSpec());
    const deal = sheet(spec, 'Deal');
    if (deal.kind !== 'form') throw new Error('fixture drift');
    const field = deal.blocks[1];
    if (field.kind !== 'field') throw new Error('fixture drift');
    field.jsonPath = 'metadata.revenue.acvTYPO';

    const result = checkWorkbookSpec(schema, spec);
    expect(result.ok).toBe(false);
    expect(result.schemaPaths.failures.join()).toContain('acvTYPO');
  });

  test('resolves a list column against its item schema, not the root', () => {
    // `name` alone is meaningless at the root; it only resolves under `stakeholders`.
    const spec = clone(baseSpec());
    const sh = sheet(spec, 'Stakeholders');
    if (sh.kind !== 'table') throw new Error('fixture drift');
    sh.tables[0].columns[0].jsonPath = 'nameTYPO';

    const result = checkWorkbookSpec(schema, spec);
    expect(result.ok).toBe(false);
    expect(result.schemaPaths.failures.join()).toContain('stakeholders.nameTYPO');
  });

  test('rejects a wildcard in a list column, where it would expand to nothing', () => {
    // The failure this closes: a list source has no key axis, so a wildcard expanded to an
    // empty set of paths and the column dropped out of the check entirely — ok, and
    // writing nowhere.
    const spec = clone(baseSpec());
    const sh = sheet(spec, 'Stakeholders');
    if (sh.kind !== 'table') throw new Error('fixture drift');
    sh.tables[0].columns[0].jsonPath = '*.nameTYPO';

    const result = checkWorkbookSpec(schema, spec);
    expect(result.ok).toBe(false);
    expect(result.schemaPaths.failures.join()).toContain('stakeholders.name');
  });

  test('rejects an input that expands to no path at all', () => {
    const spec = clone(baseSpec());
    const q = sheet(spec, 'Qualification');
    if (q.kind !== 'table') throw new Error('fixture drift');
    q.tables[0].source = { kind: 'fixed', keys: [] };

    const result = checkWorkbookSpec(schema, spec);
    expect(result.ok).toBe(false);
    expect(result.schemaPaths.failures.join()).toMatch(/no path/);
  });

  test('rejects a wildcard in a form field, where there is nothing to expand it over', () => {
    const spec = clone(baseSpec());
    const deal = sheet(spec, 'Deal');
    if (deal.kind !== 'form') throw new Error('fixture drift');
    const field = deal.blocks[1];
    if (field.kind !== 'field') throw new Error('fixture drift');
    field.jsonPath = 'qualification.*.score';

    expect(checkWorkbookSpec(schema, spec).ok).toBe(false);
  });
});

describe('checkWorkbookSpec — the eight scored elements', () => {
  test('rejects a spec that captures only some element scores', () => {
    // The bug this guards: replacing the wildcard with explicit rows and dropping one.
    const spec = clone(baseSpec());
    const q = sheet(spec, 'Qualification');
    if (q.kind !== 'table') throw new Error('fixture drift');
    q.tables[0].source = { kind: 'fixed', keys: ['metrics', 'champion'] };

    const result = checkWorkbookSpec(schema, spec);
    expect(result.ok).toBe(false);
    expect(result.elements.failures.join()).toMatch(/economicBuyer/);
  });

  test('rejects a spec that captures an element score twice', () => {
    const spec = clone(baseSpec());
    const q = sheet(spec, 'Qualification');
    if (q.kind !== 'table') throw new Error('fixture drift');
    q.tables[0].columns.push({
      id: 'scoreAgain',
      header: 'Score (again)',
      role: 'input',
      jsonPath: 'qualification.*.score',
      valueType: 'score',
    });

    const result = checkWorkbookSpec(schema, spec);
    expect(result.ok).toBe(false);
    // Two cells writing one value make the round-trip ambiguous, so it is a duplicate
    // failure as well as an element-count one.
    expect(result.duplicates.failures.join()).toContain('qualification.metrics.score');
  });
});

describe('checkWorkbookSpec — roles', () => {
  test('rejects an input with no jsonPath', () => {
    const spec = clone(baseSpec());
    const sh = sheet(spec, 'Stakeholders');
    if (sh.kind !== 'table') throw new Error('fixture drift');
    sh.tables[0].columns[0].jsonPath = undefined;
    expect(checkWorkbookSpec(schema, spec).roles.failures.join()).toContain('stakeholders.name');
  });

  test('rejects a computed column that also claims a jsonPath', () => {
    // A derived number must never flow back into the deal JSON as if a human typed it.
    const spec = clone(baseSpec());
    const q = sheet(spec, 'Qualification');
    if (q.kind !== 'table') throw new Error('fixture drift');
    const delta = q.tables[0].columns.find((c) => c.id === 'delta');
    if (!delta) throw new Error('fixture drift');
    delta.jsonPath = 'qualification.*.score';

    expect(checkWorkbookSpec(schema, spec).roles.failures.join()).toContain('delta');
  });

  test('rejects an unknown valueType, which would have no style to render with', () => {
    const spec = clone(baseSpec());
    const sh = sheet(spec, 'Stakeholders');
    if (sh.kind !== 'table') throw new Error('fixture drift');
    sh.tables[0].columns[0].valueType = 'colour' as never;
    expect(checkWorkbookSpec(schema, spec).roles.failures.join()).toContain('colour');
  });

  test('every declared valueType has a style in the palette', () => {
    for (const [type, style] of Object.entries(VALUE_TYPE_STYLE)) {
      expect(typeof style, `${type} maps to a style name`).toBe('string');
    }
  });
});

describe('checkWorkbookSpec — references', () => {
  test('rejects a formula naming a cell that does not exist', () => {
    const spec = clone(baseSpec());
    const sc = sheet(spec, 'Scorecard');
    if (sc.kind !== 'form') throw new Error('fixture drift');
    const block = sc.blocks[0];
    if (block.kind !== 'computed') throw new Error('fixture drift');
    block.formula = 'SUM({{col:elements.scoreTYPO}})';

    const result = checkWorkbookSpec(schema, spec);
    expect(result.ok).toBe(false);
    expect(result.references.failures.join()).toContain('elements.scoreTYPO');
  });

  test('rejects a row reference whose key is not one of the table rows', () => {
    const spec = clone(baseSpec());
    const sc = sheet(spec, 'Scorecard');
    if (sc.kind !== 'form') throw new Error('fixture drift');
    const block = sc.blocks[1];
    if (block.kind !== 'computed') throw new Error('fixture drift');
    block.formula = '{{row:elements.score@notAnElement}}';

    expect(checkWorkbookSpec(schema, spec).references.failures.join()).toContain('notAnElement');
  });

  test('rejects a row reference into a table whose rows depend on the deal', () => {
    // `stakeholders` has no fixed row for a formula to point at.
    const spec = clone(baseSpec());
    const sc = sheet(spec, 'Scorecard');
    if (sc.kind !== 'form') throw new Error('fixture drift');
    const block = sc.blocks[1];
    if (block.kind !== 'computed') throw new Error('fixture drift');
    block.formula = '{{row:stakeholders.name@0}}';

    expect(checkWorkbookSpec(schema, spec).references.failures.join()).toContain('stakeholders');
  });

  test('rejects a formula with a placeholder the parser does not recognise', () => {
    const spec = clone(baseSpec());
    const sc = sheet(spec, 'Scorecard');
    if (sc.kind !== 'form') throw new Error('fixture drift');
    const block = sc.blocks[0];
    if (block.kind !== 'computed') throw new Error('fixture drift');
    block.formula = 'SUM({{colm:elements.score}})';

    const result = checkWorkbookSpec(schema, spec);
    expect(result.ok).toBe(false);
    expect(result.references.failures.join()).toContain('{{colm:elements.score}}');
  });

  test('rejects {{this:…}} outside a table column', () => {
    const spec = clone(baseSpec());
    const sc = sheet(spec, 'Scorecard');
    if (sc.kind !== 'form') throw new Error('fixture drift');
    const block = sc.blocks[0];
    if (block.kind !== 'computed') throw new Error('fixture drift');
    block.formula = '{{this:score}}';

    expect(checkWorkbookSpec(schema, spec).references.failures.join()).toContain('this:score');
  });
});

describe('checkWorkbookSpec — identity and layout', () => {
  test('rejects two cells sharing an id, because a reference would be ambiguous', () => {
    const spec = clone(baseSpec());
    const sc = sheet(spec, 'Scorecard');
    if (sc.kind !== 'form') throw new Error('fixture drift');
    const block = sc.blocks[0];
    if (block.kind !== 'computed') throw new Error('fixture drift');
    block.id = 'acv';

    expect(checkWorkbookSpec(schema, spec).ids.failures.join()).toContain('acv');
  });

  test('rejects a sheet name Excel will not accept', () => {
    const spec = clone(baseSpec());
    spec.sheets[0].name = 'Deal/Review';
    expect(checkWorkbookSpec(schema, spec).layout.failures.join()).toContain('Deal/Review');
  });

  test('rejects two tables on one sheet whose columns overlap', () => {
    // Side-by-side tables are how two collections share a sheet and still grow downward;
    // an overlap means one would overwrite the other as rows are added.
    const spec = clone(baseSpec());
    const sh = sheet(spec, 'Stakeholders');
    if (sh.kind !== 'table') throw new Error('fixture drift');
    sh.tables.push({
      id: 'second',
      source: { kind: 'list', jsonPath: 'team.internal' },
      anchorColumn: 2,
      headerRow: 1,
      columns: [{ id: 'teamName', header: 'Name', role: 'input', jsonPath: 'name', valueType: 'string' }],
    });

    expect(checkWorkbookSpec(schema, spec).layout.failures.join()).toMatch(/overlap/i);
  });

  test('accepts two tables on one sheet that are clear of each other', () => {
    const spec = clone(baseSpec());
    const sh = sheet(spec, 'Stakeholders');
    if (sh.kind !== 'table') throw new Error('fixture drift');
    sh.tables.push({
      id: 'second',
      source: { kind: 'list', jsonPath: 'team.internal' },
      anchorColumn: 4,
      headerRow: 1,
      columns: [{ id: 'teamName', header: 'Name', role: 'input', jsonPath: 'name', valueType: 'string' }],
    });

    expect(checkWorkbookSpec(schema, spec).layout.failures).toEqual([]);
  });
});

describe('the shipped workbook-spec.json', () => {
  const shipped = JSON.parse(fs.readFileSync(path.join(import.meta.dir, 'workbook-spec.json'), 'utf8')) as WorkbookSpec;

  test('passes every rule against the shipped schema', () => {
    const result = checkWorkbookSpec(schema, shipped);
    expect(result).toMatchObject({ ok: true });
  });

  test('captures all eight element scores', () => {
    expect(checkWorkbookSpec(schema, shipped).elements.failures).toEqual([]);
  });

  test('is formula-driven — the Scorecard is entirely computed', () => {
    // The whole point of the rebuild: the legacy template carried exactly one formula.
    const scorecard = shipped.sheets.find((s) => s.name === 'Scorecard');
    if (scorecard?.kind !== 'form') throw new Error('Scorecard must be a form sheet');
    const valueBlocks = scorecard.blocks.filter((b) => b.kind === 'field' || b.kind === 'computed');
    expect(valueBlocks.length).toBeGreaterThan(10);
    expect(valueBlocks.every((b) => b.kind === 'computed')).toBe(true);
  });

  test('gives every deal collection a table, so nothing is capped', () => {
    // Visa has 14 team members against the legacy sheet's 8 formatted rows.
    const tableSources = shipped.sheets
      .filter((s) => s.kind === 'table')
      .flatMap((s) => (s.kind === 'table' ? s.tables : []))
      .map((t) => (t.source.kind === 'list' ? t.source.jsonPath : t.source.kind));
    for (const collection of [
      'stakeholders',
      'closePlan.milestones',
      'closePlan.criticalActions',
      'team.internal',
      'team.partner',
    ]) {
      expect(tableSources).toContain(collection);
    }
  });
});
