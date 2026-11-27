import { expect, test } from 'bun:test';
import { createWireValidator } from '../../src/ce/wire-schema';
import { resolveCeSchemaFixture } from '../fixtures/resolve-schema-fixture';

const schemas = {
  root: {
    type: 'object',
    properties: {
      aws: { allOf: [{ $ref: '#/components/schemas/provider' }] },
      azure: { allOf: [{ $ref: '#/components/schemas/provider' }] },
      status: { type: 'string', readOnly: true },
    },
    'x-ves-oneof-field-provider': '["aws","azure"]',
  },
  provider: {
    type: 'object',
    properties: { names: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } } },
    required: ['names'],
  },
};
test('validates nested wire constraints without coercion or mutation', () => {
  const validate = createWireValidator(schemas, 'root');
  const spec = { aws: { names: ['demo'] } };
  validate(spec);
  expect(spec).toEqual({ aws: { names: ['demo'] } });
  for (const bad of [
    { aws: { names: [] } },
    { aws: { names: [1] } },
    { aws: {} },
    { unsupported: true },
    { status: 'healthy' },
    { aws: { names: ['a'] }, azure: { names: ['b'] } },
  ])
    expect(() => validate(bad)).toThrow('verified schema');
});
test('schema failures do not expose submitted values', () => {
  const validate = createWireValidator(schemas, 'root');
  try {
    validate({ SENSITIVE_BOOTSTRAP: true });
  } catch (error) {
    expect(String(error)).not.toContain('SENSITIVE_BOOTSTRAP');
  }
});
test('rejects missing or external schema references', () => {
  for (const ref of ['https://example.invalid/schema', '#/components/schemas/absent'])
    expect(() => createWireValidator({ root: { $ref: ref } }, 'root')).toThrow('reference');
});

test('preserves scalar, collection, composition and network format constraints without runtime packages', () => {
  const validate = createWireValidator(
    {
      root: {
        type: 'object',
        required: ['address', 'id', 'labels', 'weight', 'mode'],
        properties: {
          address: { type: 'string', format: 'cidr' },
          id: { type: 'string', format: 'uuid' },
          labels: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', pattern: '^[a-z]+$' } },
          weight: { type: 'integer', minimum: 2, exclusiveMaximum: 10, multipleOf: 2 },
          mode: { oneOf: [{ const: 'native' }, { const: 'terraform' }] },
          note: { type: 'string', nullable: true },
        },
        additionalProperties: false,
      },
    },
    'root',
  );
  validate({
    address: '10.0.0.0/24',
    id: '123e4567-e89b-42d3-a456-426614174000',
    labels: ['edge', 'prod'],
    weight: 8,
    mode: 'terraform',
    note: null,
  });
  for (const bad of [
    { address: '10.0.0.0/33', id: '123e4567-e89b-42d3-a456-426614174000', labels: ['edge'], weight: 8, mode: 'native' },
    { address: '10.0.0.0/24', id: 'not-a-uuid', labels: ['edge'], weight: 8, mode: 'native' },
    {
      address: '10.0.0.0/24',
      id: '123e4567-e89b-42d3-a456-426614174000',
      labels: ['edge', 'edge'],
      weight: 8,
      mode: 'native',
    },
    { address: '10.0.0.0/24', id: '123e4567-e89b-42d3-a456-426614174000', labels: ['edge'], weight: 9, mode: 'native' },
    {
      address: '10.0.0.0/24',
      id: '123e4567-e89b-42d3-a456-426614174000',
      labels: ['edge'],
      weight: 8,
      mode: 'unknown',
    },
  ])
    expect(() => validate(bad)).toThrow('verified schema');
});

test('validates actual AWS and Azure request schemas while rejecting wire errors', async () => {
  const fixture = resolveCeSchemaFixture(
    await Bun.file(new URL('../fixtures/smsv2-create-schema.json', import.meta.url)).json(),
  );
  const validate = createWireValidator(fixture.schemas);
  for (const provider of ['aws', 'azure']) {
    const node = {
      hostname: 'ce-demo',
      type: 'Control',
      interface_list: [
        {
          name: 'slo',
          mtu: 1500,
          ethernet_interface: { mac: '02:00:00:00:00:01' },
          network_option: { site_local_network: {} },
          dhcp_client: {},
        },
      ],
    };
    const spec = { [provider]: { not_managed: { node_list: [node] } }, disable_ha: {}, disable_management_network: {} };
    validate(spec);
    expect(() => validate({ ...spec, enable_ha: {} })).toThrow();
    expect(() => validate({ ...spec, provider: 'aws' })).toThrow();
    node.interface_list[0].network_option = { site_local_network: {}, segment_network: {} } as never;
    expect(() => validate(spec)).toThrow();
  }
});

test('preserves published site and generated-interface MTU ranges independently', () => {
  const publishedMtu = {
    securemesh_site_v2Interface: {
      type: 'integer',
      description:
        'Maximum packet size (Maximum Transfer Unit) of the interface\nWhen configured, MTU must be between 512 and 8000.',
      title: 'Maximum Packet Size (MTU)',
      format: 'int64',
      'x-displayname': 'Maximum Packet Size (MTU)',
      'x-ves-example': '1450',
      'x-ves-validation-rules': { 'ves.io.schema.rules.uint32.ranges': '0,512-8000' },
      'x-f5xc-example': '1450',
      'x-validation-rules': { 'ves.io.schema.rules.uint32.ranges': '0,512-8000' },
      'x-f5xc-description-short':
        'Maximum packet size (Maximum Transfer Unit) of the interface When configured, MTU must be between 512 and 8000.',
      'x-f5xc-description-medium':
        'Maximum packet size (Maximum Transfer Unit) of the interface When configured, MTU must be between 512 and 8000.',
      'x-f5xc-constraints': {
        constraintType: 'number',
        category: 'discovery',
        maximum: 8000,
        deterministic: true,
        metadata: { source: 'api-probed', confidence: 0.99, validatedAt: '2026-10-22T11:01:39+00:00' },
      },
      'x-f5xc-required-for': { minimum_config: false, create: false, update: false, read: false },
    },
    network_interfaceEthernetInterfaceType: {
      type: 'integer',
      description:
        'Maximum packet size (Maximum Transfer Unit) of the interface\nWhen configured, MTU must be between 512 and 9000.',
      title: 'Maximum Packet Size (MTU)',
      format: 'int64',
      'x-displayname': 'Maximum Packet Size (MTU)',
      'x-ves-example': '1450',
      'x-ves-validation-rules': { 'ves.io.schema.rules.uint32.ranges': '0,512-9000' },
      'x-f5xc-example': '1450',
      'x-validation-rules': { 'ves.io.schema.rules.uint32.ranges': '0,512-9000' },
      'x-f5xc-description-short':
        'Maximum packet size (Maximum Transfer Unit) of the interface When configured, MTU must be between 512 and 9000.',
      'x-f5xc-description-medium':
        'Maximum packet size (Maximum Transfer Unit) of the interface When configured, MTU must be between 512 and 9000.',
      'x-f5xc-constraints': {
        constraintType: 'number',
        category: 'discovery',
        maximum: 9000,
        deterministic: true,
        metadata: { source: 'api-probed', confidence: 0.99, validatedAt: '2026-10-22T11:01:39+00:00' },
      },
      'x-f5xc-required-for': { minimum_config: false, create: false, update: false, read: false },
    },
  };
  const validate = (name: keyof typeof publishedMtu) => createWireValidator({ root: publishedMtu[name] }, 'root');
  const site = validate('securemesh_site_v2Interface');
  const generated = validate('network_interfaceEthernetInterfaceType');
  for (const mtu of [0, 512, 576, 1500, 8000]) {
    site(mtu);
    generated(mtu);
  }
  for (const mtu of [-1, 1, 511, 8001, 9000, 9001, 1500.5]) expect(() => site(mtu)).toThrow('verified schema');
  generated(8001);
  generated(9000);
  for (const mtu of [-1, 1, 511, 9001, 1500.5]) expect(() => generated(mtu)).toThrow('verified schema');
});

test('rejects malformed or conflicting vendor integer range annotations', () => {
  for (const ranges of ['', '0,', '8000-512', 'NaN', '512--8000', '0;512-8000', '9007199254740992'])
    expect(() =>
      createWireValidator(
        { root: { type: 'integer', 'x-ves-validation-rules': { 'ves.io.schema.rules.uint32.ranges': ranges } } },
        'root',
      ),
    ).toThrow('range');
  expect(() =>
    createWireValidator(
      {
        root: {
          type: 'integer',
          'x-ves-validation-rules': { 'ves.io.schema.rules.uint32.ranges': '0,512-8000' },
          'x-validation-rules': { 'ves.io.schema.rules.uint32.ranges': '0,512-9000' },
        },
      },
      'root',
    ),
  ).toThrow('range');
  const validate = createWireValidator(
    {
      root: {
        type: 'integer',
        maximum: 7000,
        'x-validation-rules': { 'ves.io.schema.rules.uint32.ranges': '0,512-8000' },
      },
    },
    'root',
  );
  validate(7000);
  expect(() => validate(7001)).toThrow();
  expect(() => validate(1)).toThrow();
});

test('retains disjoint ASN ranges, unsigned bounds and annotated integer type', () => {
  const rule = (ranges: string) => ({ 'ves.io.schema.rules.uint32.ranges': ranges });
  const validate = createWireValidator(
    { root: { type: 'integer', 'x-ves-validation-rules': rule('64512-65534, 4200000000-4294967294') } },
    'root',
  );
  for (const value of [64512, 65534, 4200000000, 4294967294]) validate(value);
  for (const value of [0, 64511, 65535, 4199999999, 4294967295, 64512.5, '64512'])
    expect(() => validate(value)).toThrow();
  for (const ranges of ['-1', '4294967296'])
    expect(() =>
      createWireValidator({ root: { type: 'integer', 'x-validation-rules': rule(ranges) } }, 'root'),
    ).toThrow('range');
  expect(() =>
    createWireValidator({ root: { type: 'number', 'x-validation-rules': rule('0,512-8000') } }, 'root'),
  ).toThrow('range');
});
