import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { canonicalSha256 } from '../../../aws/src/ce/canonical';
import { resolveCeSchemaFixture } from '../fixtures/resolve-schema-fixture';

type Json = Record<string, unknown>;
const prefix = './shared-schema-components.json#/';
test('shared CE fixture schemas expand to exact original canonical source', async () => {
  const root = new URL('../fixtures/', import.meta.url);
  const provenance = JSON.parse(await readFile(new URL('schema-fixture-provenance.json', root), 'utf8'));
  const sharedSchemas: Json = JSON.parse(await readFile(new URL('shared-schema-components.json', root), 'utf8'));
  const shared = Object.keys(sharedSchemas).length;
  for (const receipt of provenance.originalSchemas) {
    const fixture = resolveCeSchemaFixture(
      JSON.parse(await readFile(new URL(receipt.file, root), 'utf8')),
      sharedSchemas,
    );
    const schemas: Json = receipt.group === 'schemas' ? fixture.schemas : fixture.schemas[receipt.group];
    const original = Object.fromEntries(
      Object.entries(schemas)
        .filter(([name]) => !name.startsWith('__fixture_shared_'))
        .map(([name, value]) => [name, resolveCeSchemaFixture(value, sharedSchemas)]),
    );
    expect(canonicalSha256(original)).toBe(receipt.canonicalSha256);
  }
  for (const receipt of provenance.originalDocuments) {
    const fixture = JSON.parse(await readFile(new URL(receipt.file, root), 'utf8'));
    expect(canonicalSha256(resolveCeSchemaFixture(fixture, sharedSchemas))).toBe(receipt.canonicalSha256);
  }
  expect(shared).toBeGreaterThan(0);
});
test('fixture expansion rejects missing and cyclic shared definitions', () => {
  expect(() => resolveCeSchemaFixture({ $ref: prefix + 'absent' }, {})).toThrow('Missing or cyclic');
  const loop = { $ref: prefix + 'loop' };
  expect(() => resolveCeSchemaFixture(loop, { loop: loop })).toThrow('Missing or cyclic');
});

test('fixture expansion rejects sibling overrides and malformed components', () => {
  expect(() =>
    resolveCeSchemaFixture({ $ref: prefix + 'sample', type: 'object' }, { sample: { type: 'string' } }),
  ).toThrow('sibling fields');
  for (const sample of [null, 'string', [], 1]) {
    expect(() => resolveCeSchemaFixture({ $ref: prefix + 'sample' }, { sample })).toThrow('must be an object');
  }
});

test('shared expansion preserves wire references and isolates consumer mutations', () => {
  const component = { type: 'object', properties: { nested: { type: 'string' } } };
  const reference = { $ref: prefix + 'sample' };
  const resolved = resolveCeSchemaFixture(
    { first: reference, second: reference },
    { sample: component },
  ) as unknown as {
    first: typeof component;
    second: typeof component;
  };
  resolved.first.properties.nested.type = 'number';
  expect(resolved.second).toEqual(component);
  expect(component.properties.nested.type).toBe('string');
  expect(resolveCeSchemaFixture({ $ref: '#/components/schemas/vendor', description: 'original' })).toEqual({
    $ref: '#/components/schemas/vendor',
    description: 'original',
  });
});
