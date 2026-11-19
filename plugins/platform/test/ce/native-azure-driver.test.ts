import { afterEach, describe, expect, it } from 'bun:test';
import { HttpCeV2Driver } from '../../src/ce/driver';
import { AzureSmsv2Contract } from '../../src/ce/native-azure';
import provider from './fixtures/azure-provider.json';
import schemas from './fixtures/azure-request-schemas.json';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const uid = 'test-configuration-uid';
const site = {
  metadata: { uid },
  spec: {
    azure: {
      not_managed: {
        node_list: [{ hostname: 'test-ce-1', interface_list: [{ ethernet_interface: { mac: '02:00:00:00:00:01' } }] }],
      },
    },
  },
};
const jwt = ['e30', 'e30', 'c2ln'].join('.');
function driver() {
  return new HttpCeV2Driver(
    { XCSH_API_URL: 'https://tenant.example.test' },
    async () =>
      ({
        namespace: 'system',
        collectionPath: '/api/config/namespaces/{namespace}/securemesh_site_v2s',
        itemPath: '/api/config/namespaces/{namespace}/securemesh_site_v2s/{name}',
        azure: new AzureSmsv2Contract(provider, schemas),
        kvmImageResolution: {},
      }) as any,
  );
}
const request = {
  namespace: 'system',
  provider: 'azure' as const,
  siteName: 'test-ce',
  nodeName: 'test-ce-1',
  expiresInSeconds: 60,
};
describe('native Azure API boundaries', () => {
  it('exposes only implemented Azure networking and API bootstrap', async () => {
    const capabilities = await driver().capabilities();
    expect(capabilities.providerNetworkingProfiles.azure).toEqual(['direct-nic']);
    expect(capabilities.bootstrapDrivers).toEqual(['api']);
  });
  it('issues a site-bound JWT, checks issued material and rechecks the site', async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: any, init: any) => {
      const url = String(input);
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      let body: any = site;
      if (url.endsWith('/tokens')) body = { spec: { type: 1, site_name: 'test-ce', content: jwt } };
      if (url.includes('get-cloud-init-config'))
        body = {
          cloud_init_config:
            '#cloud-config\nwrite_files:\n  - path: /etc/vpm/user_data\n    permissions: "0600"\n    content: |\n      token: {{ .Token }}\n',
        };
      return Response.json(body);
    }) as typeof fetch;
    const result = await driver().checkoutBootstrap(request, false);
    const envelope = JSON.parse(result.token);
    expect(envelope.configurationUid).toBe(uid);
    expect(envelope.cloudInit).toContain(jwt);
    expect(calls.filter((call) => call.includes('/securemesh_site_v2s/'))).toHaveLength(2);
    expect(calls.some((call) => call.includes('provider=azure'))).toBe(true);
  });
  it('does not issue a JWT for a mismatched node', async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: any) => {
      calls.push(String(input));
      return Response.json(site);
    }) as typeof fetch;
    await expect(driver().checkoutBootstrap({ ...request, nodeName: 'other-node' }, false)).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });
  it('rejects revocation of a token bound to another site', async () => {
    const methods: string[] = [];
    globalThis.fetch = (async (_input: any, init: any) => {
      methods.push(init?.method ?? 'GET');
      return Response.json({ spec: { site_name: 'other-site', type: 1 } });
    }) as typeof fetch;
    await expect(driver().revokeBootstrap({ ...request, tokenName: 'test-token' })).rejects.toThrow();
    expect(methods).toEqual(['GET']);
  });
  it('verifies upstream absence after revocation', async () => {
    let removed = false;
    globalThis.fetch = (async (_input: any, init: any) => {
      if (init?.method === 'DELETE') {
        removed = true;
        return Response.json({});
      }
      return removed ? new Response('', { status: 404 }) : Response.json({ spec: { site_name: 'test-ce', type: 1 } });
    }) as typeof fetch;
    await expect(driver().revokeBootstrap({ ...request, tokenName: 'test-token' })).resolves.toBeUndefined();
  });
});
