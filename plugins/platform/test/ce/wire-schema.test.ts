import { expect, test } from 'bun:test';
import { createWireValidator } from '../../src/ce/wire-schema';

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
    { address: '10.0.0.0/24', id: '123e4567-e89b-42d3-a456-426614174000', labels: ['edge', 'edge'], weight: 8, mode: 'native' },
    { address: '10.0.0.0/24', id: '123e4567-e89b-42d3-a456-426614174000', labels: ['edge'], weight: 9, mode: 'native' },
    { address: '10.0.0.0/24', id: '123e4567-e89b-42d3-a456-426614174000', labels: ['edge'], weight: 8, mode: 'unknown' },
  ])
    expect(() => validate(bad)).toThrow('verified schema');
});

test('validates actual AWS and Azure request schemas while rejecting wire errors', async () => {
  const fixture = await Bun.file(new URL('../fixtures/smsv2-create-schema.json', import.meta.url)).json();
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
