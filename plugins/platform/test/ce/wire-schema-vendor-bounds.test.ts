import { expect, test } from 'bun:test';
import { createWireValidator } from '../../src/ce/wire-schema';

const schema = (properties: Record<string, unknown>) => ({ Root: { type: 'object', properties } });
const port = {
  type: 'integer',
  'x-ves-validation-rules': { 'ves.io.schema.rules.uint32.gte': '1', 'ves.io.schema.rules.uint32.lte': '65535' },
};

test('enforces published uint32 port bounds carried by F5 annotations', () => {
  const validate = createWireValidator(schema({ port }), 'Root');
  for (const value of [1, 179, 65535]) expect(() => validate({ port: value })).not.toThrow();
  for (const value of [0, -1, 65536]) expect(() => validate({ port: value })).toThrow();
});
test('annotated bounds intersect standard JSON Schema bounds', () => {
  const validate = createWireValidator(schema({ port: { ...port, minimum: 10, maximum: 100 } }), 'Root');
  expect(() => validate({ port: 99 })).not.toThrow();
  for (const value of [1, 101]) expect(() => validate({ port: value })).toThrow();
});
test('malformed or contradictory annotated uint32 bounds refuse contract construction', () => {
  for (const rules of [
    { 'ves.io.schema.rules.uint32.gte': 'one' },
    { 'ves.io.schema.rules.uint32.gte': '-1' },
    { 'ves.io.schema.rules.uint32.lte': '4294967296' },
    { 'ves.io.schema.rules.uint32.gte': '10', 'ves.io.schema.rules.uint32.lte': '9' },
  ])
    expect(() =>
      createWireValidator(schema({ port: { type: 'integer', 'x-ves-validation-rules': rules } }), 'Root'),
    ).toThrow();
});
test('unsigned bounds retain valid zero and full uint32 values when declared', () => {
  const validate = createWireValidator(
    schema({
      count: {
        type: 'integer',
        'x-ves-validation-rules': {
          'ves.io.schema.rules.uint32.gte': '0',
          'ves.io.schema.rules.uint32.lte': '4294967295',
        },
      },
    }),
    'Root',
  );
  expect(() => validate({ count: 0 })).not.toThrow();
  expect(() => validate({ count: 4294967295 })).not.toThrow();
  expect(() => validate({ count: 4294967296 })).toThrow();
});
