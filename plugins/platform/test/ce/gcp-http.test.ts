import { expect, it } from 'bun:test';
import { createGcpLifecycleHttpPort } from '../../src/ce/gcp-http';

it('GCP HTTP lifecycle rejects paths outside exact site/token scope before requests', async () => {
  let calls = 0;
  const port = createGcpLifecycleHttpPort('https://tenant.example.test', 'fixture', (async () => {
    calls++;
    return Response.json({});
  }) as typeof fetch);
  for (const path of [
    '/api/config/namespaces/customer/securemesh_site_v2s/site-a',
    'https://other.test/api/config/namespaces/system/securemesh_site_v2s',
    '/api/register/namespaces/system/tokens/node?secret=value',
  ])
    await expect(port.read(path)).rejects.toThrow('scope');
  expect(calls).toBe(0);
});
it('GCP HTTP lifecycle treats only GET404 as absence and preserves scoped mutation', async () => {
  const calls: RequestInit[] = [];
  const port = createGcpLifecycleHttpPort('https://tenant.example.test', 'fixture', (async (_url, init) => {
    calls.push(init ?? {});
    return new Response('', { status: 404 });
  }) as typeof fetch);
  expect(await port.read('/api/register/namespaces/system/tokens/node')).toBeNull();
  await expect(port.mutate('/api/register/namespaces/system/tokens/node', 'DELETE')).rejects.toThrow('404');
  expect(calls[0].redirect).toBe('error');
  expect(calls[1].method).toBe('DELETE');
});
