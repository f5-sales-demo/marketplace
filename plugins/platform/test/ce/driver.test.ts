import { afterEach, describe, expect, it } from 'bun:test';
import { HttpCeV2Driver } from '../../src/ce/driver';

const originalFetch = globalThis.fetch;
const contract = {
  release: 'v6.1.2' as const,
  identity: 'f5xc-published-api-schema/v6.1.2' as const,
  createPath: '/api/config/namespaces/{metadata.namespace}/securemesh_site_v2s' as const,
  replacePath: '/api/config/namespaces/{metadata.namespace}/securemesh_site_v2s/{metadata.name}' as const,
  readPath: '/api/config/namespaces/{namespace}/securemesh_site_v2s/{name}' as const,
  deletePath: '/api/config/namespaces/{namespace}/securemesh_site_v2s/{name}' as const,
  bootstrapPath: '/api/register/namespaces/system/get-cloud-init-config' as const,
  namespace: 'system' as const,
  schemaSupport: ['create', 'read', 'replace', 'delete', 'cloud-init'] as const,
  executableCapabilities: {
    awsCreate: 'unavailable' as const,
    azureCreate: 'unavailable' as const,
    headlessBootstrap: 'unavailable' as const,
    runtimeStatus: 'unavailable' as const,
    routing: 'unavailable' as const,
  },
};

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function driver() {
  return new HttpCeV2Driver({ F5XC_API_URL: 'https://tenant.example.test' }, async () => contract);
}

describe('SMSv2 published-schema driver', () => {
  it('uses verified read/delete paths and refuses placeholder create/replace serialization', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method ?? 'GET' });
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const ce = driver();
    const request = { namespace: 'system', siteName: 'ce-demo' };
    await expect(ce.capabilities()).resolves.toEqual({
      contractIdentity: 'f5xc-published-api-schema/v6.1.2',
      smsv2ContractVersion: 'unpublished',
      supportedProviders: [],
      bootstrapDrivers: [],
      providerNetworkingProfiles: {},
      awsSmsv2TgwConnect: { supported: false, schemaVersion: null },
    });
    await expect(ce.site('create', request)).rejects.toThrow(/configuration mapping/);
    await ce.site('read', request);
    await expect(ce.site('update', request)).rejects.toThrow(/configuration mapping/);
    await ce.site('delete', request);
    expect(calls).toEqual([
      { url: 'https://tenant.example.test/api/config/namespaces/system/securemesh_site_v2s/ce-demo', method: 'GET' },
      { url: 'https://tenant.example.test/api/config/namespaces/system/securemesh_site_v2s/ce-demo', method: 'DELETE' },
    ]);
  });

  it('rejects non-system AWS CE requests before any tenant request', async () => {
    globalThis.fetch = (async () => {
      throw new Error('tenant request must not occur');
    }) as unknown as typeof fetch;
    const outsideSystemNamespace = ['not', 'system'].join('-');
    await expect(driver().site('create', { namespace: outsideSystemNamespace, siteName: 'ce-demo' })).rejects.toThrow(
      /namespace system/,
    );
  });

  it('rejects headless bootstrap and runtime status without a tenant endpoint', async () => {
    globalThis.fetch = (async () => {
      throw new Error('tenant request must not occur');
    }) as unknown as typeof fetch;
    await expect(
      driver().checkoutBootstrap(
        { namespace: 'system', siteName: 'ce-demo', nodeName: 'ce-1', expiresInSeconds: 60 },
        false,
      ),
    ).rejects.toThrow(/schema support/);
    await expect(driver().status({ namespace: 'system', siteName: 'ce-demo' })).rejects.toThrow(
      /runtime status is unavailable/,
    );
  });
});
