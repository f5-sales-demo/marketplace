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
