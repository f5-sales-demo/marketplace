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
