import { expect, test } from 'bun:test';
import { parseTerraformFieldPath, projectTerraformFieldPath } from '../src/field-paths';

const values = {
  id: '/synthetic/nic',
  ip_configuration: [{ name: 'internal', subnet_id: '/synthetic/subnet', private_ip_address: '10.20.2.5' }],
  secret: 'synthetic-private-marker',
};
const masks = { secret: true, ip_configuration: [{ private_ip_address: true }] };

test('private Terraform field paths select resolved subnet and name while omitting unrelated sensitive or unknown results', () => {
  expect(projectTerraformFieldPath(values, masks, masks, 'ip_configuration.0.subnet_id')).toBe('/synthetic/subnet');
  expect(projectTerraformFieldPath(values, masks, masks, 'ip_configuration.0.name')).toBe('internal');
  expect(projectTerraformFieldPath(values, masks, masks, 'id')).toBe('/synthetic/nic');
  expect(values.secret).toBe('synthetic-private-marker');
});

for (const path of [
  '',
  'ip_configuration.*.subnet_id',
  'ip_configuration.-1.name',
  'ip_configuration.01.name',
  'ip_configuration[0].name',
  '.id',
  'id.',
  '__proto__.id',
  'id..name',
  'id.1e3',
  'ip_configuration.9007199254740992.name',
])
  test(`private Terraform field path rejects invalid syntax ${path}`, () => {
    expect(() => parseTerraformFieldPath(path)).toThrow('Explicit Terraform field path required');
  });

for (const mode of [
  'sensitive-leaf',
  'unknown-leaf',
  'sensitive-parent',
  'unknown-parent',
  'sensitive-root',
  'unknown-root',
  'missing-field',
  'missing-index',
  'inherited-field',
  'malformed-sensitive',
  'malformed-unknown',
  'null-mask',
  'container-unknown',
] as const)
  test(`private Terraform field path rejects ${mode} with a fixed diagnostic`, () => {
    let sensitive: unknown = false;
    let unknown: unknown = false;
    let path = 'ip_configuration.0.subnet_id';
    let selected: unknown = structuredClone(values);
    if (mode === 'sensitive-leaf') sensitive = { ip_configuration: [{ subnet_id: true }] };
    if (mode === 'unknown-leaf') unknown = { ip_configuration: [{ subnet_id: true }] };
    if (mode === 'sensitive-parent') sensitive = { ip_configuration: true };
    if (mode === 'unknown-parent') unknown = { ip_configuration: [true] };
    if (mode === 'sensitive-root') sensitive = true;
    if (mode === 'unknown-root') unknown = true;
    if (mode === 'missing-field') path = 'ip_configuration.0.absent';
    if (mode === 'missing-index') path = 'ip_configuration.1.subnet_id';
    if (mode === 'inherited-field') {
      selected = Object.create({ id: 'synthetic-inherited' });
      path = 'id';
    }
    if (mode === 'malformed-sensitive') sensitive = { ip_configuration: 'synthetic-invalid-mask' };
    if (mode === 'malformed-unknown') unknown = { ip_configuration: 17 };
    if (mode === 'null-mask') unknown = { ip_configuration: null };
    if (mode === 'container-unknown') {
      unknown = masks;
      path = 'ip_configuration';
    }
    expect(() => projectTerraformFieldPath(selected, sensitive, unknown, path)).toThrow(
      'Terraform resource path is unavailable, sensitive or unresolved',
    );
  });

test('private Terraform field paths retain nonsensitive whole objects and scalar types', () => {
  expect(projectTerraformFieldPath(values, false, undefined, 'ip_configuration')).toEqual(values.ip_configuration);
  expect(projectTerraformFieldPath({ enabled: false, count: 0, value: null }, false, false, 'enabled')).toBe(false);
  expect(projectTerraformFieldPath({ enabled: false, count: 0, value: null }, false, false, 'count')).toBe(0);
  expect(projectTerraformFieldPath({ enabled: false, count: 0, value: null }, false, false, 'value')).toBeNull();
  expect(parseTerraformFieldPath('ip_configuration.0.subnet_id')).toEqual(['ip_configuration', '0', 'subnet_id']);
});

test('private field paths expose known list cardinality even when individual result fields are unresolved', () => {
  expect(projectTerraformFieldPath(values, masks, masks, 'ip_configuration.length')).toBe(1);
  expect(
    projectTerraformFieldPath(
      { ip_configuration: [{}, {}] },
      false,
      { ip_configuration: [true, true] },
      'ip_configuration.length',
    ),
  ).toBe(2);
  expect(projectTerraformFieldPath({ metadata: { length: 2 } }, false, false, 'metadata.length')).toBe(2);
  expect(() =>
    projectTerraformFieldPath({ metadata: { length: 2 } }, { metadata: { length: true } }, false, 'metadata.length'),
  ).toThrow('sensitive');
});
for (const mode of ['unknown-list', 'sensitive-list', 'malformed-shape-mask', 'length-child'] as const)
  test(`private list cardinality rejects ${mode}`, () => {
    const sensitive = mode === 'sensitive-list' ? { ip_configuration: true } : false;
    const unknown =
      mode === 'unknown-list'
        ? { ip_configuration: true }
        : mode === 'malformed-shape-mask'
          ? { ip_configuration: { length: 17 } }
          : false;
    const path = mode === 'length-child' ? 'ip_configuration.length.0' : 'ip_configuration.length';
    expect(() => projectTerraformFieldPath(values, sensitive, unknown, path)).toThrow(
      'Terraform resource path is unavailable, sensitive or unresolved',
    );
  });
