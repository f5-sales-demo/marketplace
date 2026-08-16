import { afterEach, describe, expect, it } from 'bun:test';
import { HttpCeV2Driver } from '../../src/ce/driver';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('HttpCeV2Driver capability contract', () => {
  it('checks out through only the capability-advertised v2 API', async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith('/api/web/capabilities/secure-mesh-site-v2'))
        return new Response(
          JSON.stringify({
            smsv2ContractVersion: 'v2',
            supportedProviders: ['azure', 'aws'],
            bootstrapDrivers: ['api'],
            providerNetworkingProfiles: {
              azure: ['route-server-bgp', 'direct-nic'],
              aws: ['tgw-static', 'direct-eni'],
            },
            awsSmsv2TgwConnect: { supported: false, schemaVersion: null },
            endpoints: {
              siteCollection: '/api/v2/namespaces/{namespace}/secure-mesh-sites',
              siteItem: '/api/v2/namespaces/{namespace}/secure-mesh-sites/{site}',
              bootstrapCheckout: '/api/v2/namespaces/{namespace}/secure-mesh-sites/{site}/bootstrap:checkout',
              status: '/api/v2/namespaces/{namespace}/secure-mesh-sites/{site}/status',
            },
          }),
          { status: 200 },
        );
      return new Response(JSON.stringify({ token: 'fixture-secret-value' }), { status: 200 });
    }) as unknown as typeof fetch;
    const driver = new HttpCeV2Driver({
      F5XC_API_URL: 'https://tenant.example.test',
      F5XC_API_TOKEN: 'fixture-api-credential',
    });
    const result = await driver.checkoutBootstrap(
      { namespace: 'system', siteName: 'ce-demo', nodeName: 'ce-1', expiresInSeconds: 60 },
      false,
    );
    expect(result).toEqual({ token: 'fixture-secret-value', driver: 'api' });
    expect(calls).toEqual([
      'https://tenant.example.test/api/web/capabilities/secure-mesh-site-v2',
      'https://tenant.example.test/api/v2/namespaces/system/secure-mesh-sites/ce-demo/bootstrap:checkout',
    ]);
    expect(await driver.capabilities()).toEqual({
      smsv2ContractVersion: 'v2',
      supportedProviders: ['aws', 'azure'],
      bootstrapDrivers: ['api'],
      providerNetworkingProfiles: {
        aws: ['direct-eni', 'tgw-static'],
        azure: ['direct-nic', 'route-server-bgp'],
      },
      awsSmsv2TgwConnect: { supported: false, schemaVersion: null },
    });
  });

  it('rejects a capability document that points at a removed legacy token route', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          smsv2ContractVersion: 'v2',
          supportedProviders: ['azure'],
          bootstrapDrivers: ['api'],
          providerNetworkingProfiles: { azure: ['direct-nic'] },
          awsSmsv2TgwConnect: { supported: false, schemaVersion: null },
          endpoints: {
            siteCollection: '/api/v2/sites',
            siteItem: '/api/v2/sites/{site}',
            bootstrapCheckout: '/api/register/site-token',
            status: '/api/v2/sites/{site}/status',
          },
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const driver = new HttpCeV2Driver({ F5XC_API_URL: 'https://tenant.example.test' });
    await expect(driver.capabilities()).rejects.toThrow(/legacy/i);
  });

  it('rejects TGW Connect without a schema version and unknown providers', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          smsv2ContractVersion: 'v2',
          supportedProviders: ['aws', 'gcp'],
          bootstrapDrivers: ['api'],
          providerNetworkingProfiles: { aws: ['tgw-connect'], gcp: [] },
          awsSmsv2TgwConnect: { supported: true, schemaVersion: null },
          endpoints: {
            siteCollection: '/api/v2/sites',
            siteItem: '/api/v2/sites/{site}',
            bootstrapCheckout: '/api/v2/sites/{site}/bootstrap:checkout',
            status: '/api/v2/sites/{site}/status',
          },
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const driver = new HttpCeV2Driver({ F5XC_API_URL: 'https://tenant.example.test' });
    await expect(driver.capabilities()).rejects.toThrow(/capability contract/i);
  });
});
