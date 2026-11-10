import { expect, test } from 'bun:test';
import { renderObservedProviderResource, renderProviderResource } from '../src/resource-renderer';

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
test('site readback projection removes only qualified status and unrequested empty defaults', () => {
  const request = { metadata: { name: 'site', namespace: 'system' }, spec: { aws: { not_managed: {} } } };
  const observed = {
    metadata: request.metadata,
    spec: {
      aws: { not_managed: { node_list: [] } },
      site_state: 'WAITING_FOR_REGISTRATION',
      site_errors: [],
      operating_system_version: '',
      volterra_software_version: '',
      segment_vrf: [],
      tunnel_dead_timeout: 0,
      tunnel_type: 'SITE_TO_SITE_TUNNEL_IPSEC_OR_SSL',
      software_settings: { os: { default_os_version: {} }, sw: { default_sw_version: {} }, waf_signatures: null },
    },
  };
  expect(renderObservedProviderResource(observed, request, schema, 'xcsh_securemesh_site_v2')).toEqual(
    renderProviderResource(request, schema, 'xcsh_securemesh_site_v2'),
  );
  for (const extra of [
    { tunnel_type: 'SITE_TO_SITE_TUNNEL_SSL' },
    { tunnel_dead_timeout: 10000 },
    { segment_vrf: [{ name: 'foreign' }] },
    { software_settings: { os: { operating_system_version: 'explicit' } } },
    { unexpected_policy: {} },
  ])
    expect(() =>
      renderObservedProviderResource(
        { ...observed, spec: { ...observed.spec, ...extra } },
        request,
        schema,
        'xcsh_securemesh_site_v2',
      ),
    ).toThrow();
  expect(() => renderProviderResource(observed, schema, 'xcsh_securemesh_site_v2')).toThrow();
  expect(() => renderObservedProviderResource(observed, request, schema, 'xcsh_bgp')).toThrow();
});
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

test('observed SMSv2 interface flags are excluded only when the installed provider declares them computed-only', () => {
  const nested = structuredClone(schema);
  Object.assign(
    nested.block.block_types.aws.block.block_types.not_managed.block.attributes.node_list.nested_type.attributes,
    {
      interface_list: {
        optional: true,
        nested_type: {
          nesting_mode: 'list',
          attributes: {
            name: { optional: true },
            priority: { optional: true },
            is_primary: { computed: true },
            is_management: { computed: true },
          },
        },
      },
    },
  );
  const request = {
    metadata: { name: 'site', namespace: 'system' },
    spec: {
      aws: { not_managed: { node_list: [{ hostname: 'node', interface_list: [{ name: 'ens5', priority: 7 }] }] } },
    },
  };
  const observed = structuredClone(request);
  Object.assign(observed.spec.aws.not_managed.node_list[0].interface_list[0], {
    is_primary: true,
    is_management: false,
  });
  expect(renderObservedProviderResource(observed, request, nested, 'xcsh_securemesh_site_v2')).toEqual(
    renderProviderResource(request, nested, 'xcsh_securemesh_site_v2'),
  );
  expect(() => renderProviderResource(observed, nested, 'xcsh_securemesh_site_v2')).toThrow('Read-only');
  observed.spec.aws.not_managed.node_list[0].interface_list[0].priority = 8;
  expect(renderObservedProviderResource(observed, request, nested, 'xcsh_securemesh_site_v2')).not.toEqual(
    renderProviderResource(request, nested, 'xcsh_securemesh_site_v2'),
  );
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
