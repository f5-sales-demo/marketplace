import { expect, it } from 'bun:test';
import { createGcpLifecycleHttpPort } from '../../src/ce/gcp-http';

it('GCP HTTP lifecycle rejects paths outside exact site/token scope before requests', async () => {
  let calls = 0;
  const port = createGcpLifecycleHttpPort('https://tenant.example.test', 'fixture', async () => {
    calls++;
    return Response.json({});
  });
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
  const port = createGcpLifecycleHttpPort(
    'https://tenant.example.test',
    'fixture',
    async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push(init ?? {});
      return new Response('', { status: 404 });
    },
  );
  expect(await port.read('/api/register/namespaces/system/tokens/node')).toBeNull();
  await expect(port.mutate('/api/register/namespaces/system/tokens/node', 'DELETE')).rejects.toThrow('404');
  expect(calls[0].redirect).toBe('error');
  expect(calls[1].method).toBe('DELETE');
});

it('GCP HTTP JSON rejects malformed UTF8 rather than replacing token bytes', async () => {
  const raw = Buffer.concat([Buffer.from('{"value":"'), Buffer.from([255]), Buffer.from('"}')]);
  const port = createGcpLifecycleHttpPort('https://tenant.example.test', 'fixture', async () => new Response(raw));
  await expect(port.read('/api/register/namespaces/system/tokens/node')).rejects.toThrow('malformed');
});

it('GCP HTTP rejects duplicate and escaped nested identity fields', async () => {
  for (const raw of [
    '{"system_metadata":{"uid":"foreign","uid":"expected"}}',
    '{"system_metadata":{"uid":"foreign","\\u0075id":"expected"}}',
  ]) {
    const port = createGcpLifecycleHttpPort('https://tenant.example.test', 'fixture', async () => new Response(raw));
    await expect(port.read('/api/register/namespaces/system/tokens/node')).rejects.toThrow('malformed');
  }
});
