import { describe, expect, it } from 'bun:test';
import { AzureSmsv2Contract, bindIssuedCloudInit, observeAzureRegistration } from '../../src/ce/native-azure';
import provider from './fixtures/azure-provider.json';
import schemas from './fixtures/azure-request-schemas.json';

const config = {
  provider: 'azure',
  haMode: 'one-node',
  vrfs: [{ index: 0, name: 'site-local-outside' }],
  interfaces: [{ index: 0, role: 'slo', vrf: 'site-local-outside', addressing: { mode: 'dhcp', addresses: [] } }],
  bgpPeers: [],
  providerNetwork: { profile: 'direct-nic', metadata: {} },
  nodes: [{ hostname: 'test-ce-1', interfaces: [{ name: 'slo', mac: '02:00:00:00:00:01', device: 'eth0' }] }],
} as const;
const contract = () => new AzureSmsv2Contract(provider, schemas);

describe('verified Azure SMSv2', () => {
  it('translates explicit single-node SLO identity into a schema-valid API request', () => {
    const body = contract().createRequest('test-ce', structuredClone(config) as any);
    expect(body.spec.azure.not_managed.node_list[0].interface_list[0].ethernet_interface.mac).toBe('02:00:00:00:00:01');
    expect(body.spec.disable_ha).toEqual({});
    expect(body.spec.provider).toBeUndefined();
  });
  it('rejects missing MAC, unsupported role, provider, HA and networking before a write', () => {
    for (const change of [
      { nodes: [] },
      { provider: 'aws' },
      { haMode: 'three-node' },
      { providerNetwork: { profile: 'route-server-bgp', metadata: {} } },
      { interfaces: [{ ...config.interfaces[0], role: 'sli' }] },
      { nodes: [{ hostname: 'test-ce-1', interfaces: [{ name: 'slo', mac: '', device: 'eth0' }] }] },
    ])
      expect(() => contract().createRequest('test-ce', { ...structuredClone(config), ...change } as any)).toThrow();
  });
  it('rejects changed published bootstrap mappings', () => {
    const changed = structuredClone(provider);
    changed.bootstrap.cloud_init.query_fields.provider = 'aws' as any;
    expect(() => new AzureSmsv2Contract(changed, schemas)).toThrow();
  });
  it('binds only issued user data and preserves certified image configuration', () => {
    const jwt = ['e30', 'e30', 'c2ln'].join('.');
    const material =
      '#cloud-config\nwrite_files:\n  - path: /etc/vpm/user_data\n    permissions: "0600"\n    content: |\n      token: {{ .Token }}\n';
    expect(bindIssuedCloudInit({ cloud_init_config: material }, jwt)).toContain(jwt);
    expect(() =>
      bindIssuedCloudInit({ cloud_init_config: material.replace('/etc/vpm/user_data', '/etc/vpm/config.yaml') }, jwt),
    ).toThrow();
    expect(() => bindIssuedCloudInit({ cloud_init_config: material + 'unknown: "{{ .Other }}"\n' }, jwt)).toThrow();
  });
  it('requires actual instance, hostname, cluster and complete inventory for registration', () => {
    const item = {
      name: 'r-test-1',
      get_spec: {
        passport: { cluster_name: 'test-ce', cluster_size: 1 },
        infra: { hostname: 'test-ce-1', instance_id: 'vm-test-id' },
      },
      object: { status: { current_state: 'ONLINE' } },
    };
    expect(observeAzureRegistration({ items: [item] }, 'test-ce', 'test-ce-1', 'vm-test-id').status).toBe('healthy');
    expect(observeAzureRegistration({ items: [item] }, 'test-ce', 'test-ce-1', 'different').status).toBe('unknown');
    expect(observeAzureRegistration({ items: [item, item] }, 'test-ce', 'test-ce-1', 'vm-test-id').status).toBe(
      'unknown',
    );
    expect(
      observeAzureRegistration({ items: [item], next_page_token: 'next' }, 'test-ce', 'test-ce-1', 'vm-test-id').status,
    ).toBe('unknown');
  });
});
