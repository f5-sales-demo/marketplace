import { expect, test } from 'bun:test';
import { renderProviderResource } from '../src/resource-renderer';

const schema = {
  block: {
    attributes: {
      name: {
        required: true,
      },
      namespace: {
        required: true,
      },
      labels: {
        optional: true,
      },
      readback: {
        computed: true,
      },
      optional_note: {
        optional: true,
      },
    },
    block_types: {
      aws: {
        nesting_mode: 'single',
        block: {
          block_types: {
            not_managed: {
              nesting_mode: 'single',
              block: {
                attributes: {
                  node_list: {
                    optional: true,
                    nested_type: {
                      nesting_mode: 'list',
                      attributes: {
                        hostname: {
                          required: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};
test('F5 provider rendering uses verified nesting and escapes Terraform interpolation', () => {
  const value = renderProviderResource(
    {
      metadata: { name: 'site', namespace: 'system', labels: { description: '$' + '{literal}' } },
      spec: { aws: { not_managed: { node_list: [{ hostname: 'node' }] } } },
    },
    schema,
  );
  expect(value.aws).toEqual([{ not_managed: [{ node_list: [{ hostname: 'node' }] }] }]);
  expect(value.labels).toEqual({ description: '$$' + '{literal}' });
});
test('unknown and read-only provider fields cannot enter a saved F5 configuration', () => {
  const request = { metadata: { name: 'site', namespace: 'system' }, spec: { readback: 'untrusted' } };
  expect(() => renderProviderResource(request, schema)).toThrow('Read-only');
  expect(() => renderProviderResource({ ...request, spec: { unsupported: {} } }, schema)).toThrow('does not expose');
});

test('null observed optional blocks mean absent blocks without generating admin credentials', () => {
  const value = renderProviderResource(
    { metadata: { name: 'site', namespace: 'system' }, spec: { aws: null } },
    schema,
  );
  expect(value).toEqual({ name: 'site', namespace: 'system' });
  const required = structuredClone(schema);
  Object.assign(required.block.block_types.aws, { min_items: 1 });
  expect(() =>
    renderProviderResource({ metadata: { name: 'site', namespace: 'system' }, spec: { aws: null } }, required),
  ).toThrow('Required provider input is null');
});

test('null required, unknown and computed-only attributes remain rejected', () => {
  const request = { metadata: { name: 'site', namespace: 'system' }, spec: {} };
  expect(() => renderProviderResource({ ...request, metadata: { name: null, namespace: 'system' } }, schema)).toThrow(
    'Required',
  );
  expect(() => renderProviderResource({ ...request, spec: { unknown: null } }, schema)).toThrow();
  expect(() => renderProviderResource({ ...request, spec: { readback: null } }, schema)).toThrow('Read-only');
  expect(renderProviderResource({ ...request, spec: { optional_note: null } }, schema).optional_note).toBeNull();
});

test('omits only unsupported empty description defaults from nested API readback', () => {
  const request = {
    metadata: { name: 'site', namespace: 'system' },
    spec: { aws: { not_managed: { node_list: [{ hostname: 'node', description: '' }] } } },
  };
  expect(renderProviderResource(request, schema).aws).toEqual([
    { not_managed: [{ node_list: [{ hostname: 'node' }] }] },
  ]);
  request.spec.aws.not_managed.node_list[0].description = 'requested description';
  expect(() => renderProviderResource(request, schema)).toThrow('does not expose request field: description');
  expect(() => renderProviderResource({ ...request, spec: { unsupported: '' } }, schema)).toThrow('does not expose');
});

test('provider site labels exclude discovered hardware while retaining user and deployment ownership', () => {
  const labels = {
    domain: 'discovered',
    'host-os-version': 'old-os',
    'hw-model': 'model',
    'hw-serial-number': 'old-node',
    'hw-vendor': 'vendor',
    'hw-version': '',
    'ves.io/provider': 'aws',
    'internal.ves.io/owner': 'system',
    'xcsh-ce-deployment': 'owned',
    custom: 'value',
  };
  const request = { metadata: { name: 'site', namespace: 'system', labels }, spec: {} };
  const rendered = renderProviderResource(request, schema, 'xcsh_securemesh_site_v2');
  expect(rendered.labels).toEqual({ 'xcsh-ce-deployment': 'owned', custom: 'value' });
  expect(labels['hw-serial-number']).toBe('old-node');
  const other = renderProviderResource(request, schema, 'xcsh_origin_pool');
  expect((other.labels as Record<string, string>).domain).toBe('discovered');
  expect((other.labels as Record<string, string>)['ves.io/provider']).toBeUndefined();
});
