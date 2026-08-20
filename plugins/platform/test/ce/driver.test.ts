import { afterEach, describe, expect, it } from 'bun:test';
import { HttpCeV2Driver } from '../../src/ce/driver';

const originalFetch = globalThis.fetch;
const contract = {
  collectionPath: '/api/config/namespaces/{namespace}/securemesh_site_v2s',
  itemPath: '/api/config/namespaces/{namespace}/securemesh_site_v2s/{name}',
  namespace: 'system' as const,
  operations: ['create', 'read', 'replace', 'delete'] as Array<'create' | 'read' | 'replace' | 'delete'>,
  capabilities: {
    awsCeCreate: 'available' as const,
    runtimeStatus: 'unavailable' as const,
    tgwConnect: 'unavailable' as const,
  },
};

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function driver() {
  return new HttpCeV2Driver({ F5XC_API_URL: 'https://tenant.example.test' }, async () => contract);
}

describe('SMSv2 AWS CE driver', () => {
  it('uses only the verified typed system-namespace CRUD paths', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method ?? 'GET' });
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    const ce = driver();
    const request = { namespace: 'system', siteName: 'ce-demo' };
    await ce.site('create', request);
    await ce.site('read', request);
    await ce.site('update', request);
    await ce.site('delete', request);
    expect(calls).toEqual([
      { url: 'https://tenant.example.test/api/config/namespaces/system/securemesh_site_v2s', method: 'POST' },
      { url: 'https://tenant.example.test/api/config/namespaces/system/securemesh_site_v2s/ce-demo', method: 'GET' },
      { url: 'https://tenant.example.test/api/config/namespaces/system/securemesh_site_v2s/ce-demo', method: 'PUT' },
      { url: 'https://tenant.example.test/api/config/namespaces/system/securemesh_site_v2s/ce-demo', method: 'DELETE' },
    ]);
  });

  it('rejects non-system AWS CE requests before any tenant request', async () => {
    globalThis.fetch = (async () => {
      throw new Error('tenant request must not occur');
    }) as typeof fetch;
    const outsideSystemNamespace = ['not', 'system'].join('-');
    await expect(driver().site('create', { namespace: outsideSystemNamespace, siteName: 'ce-demo' })).rejects.toThrow(
      /namespace system/,
    );
  });

  it('rejects headless bootstrap and runtime status without a tenant endpoint', async () => {
    globalThis.fetch = (async () => {
      throw new Error('tenant request must not occur');
    }) as typeof fetch;
    await expect(
      driver().checkoutBootstrap(
        { namespace: 'system', siteName: 'ce-demo', nodeName: 'ce-1', expiresInSeconds: 60 },
        false,
      ),
    ).rejects.toThrow(/Headless bootstrap/);
    await expect(driver().status({ namespace: 'system', siteName: 'ce-demo' })).rejects.toThrow(
      /runtime status is unavailable/,
    );
  });
});
