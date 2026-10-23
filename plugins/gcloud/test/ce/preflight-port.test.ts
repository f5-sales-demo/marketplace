import { expect, it } from 'bun:test';
import { createGcpPreflightPort } from '../../src/ce/preflight-port';

it('rejects foreign project paths and arbitrary methods before retrieving credentials', async () => {
  let calls = 0;
  const port = createGcpPreflightPort(
    {
      exec: async () => {
        calls++;
        throw new Error('must not run');
      },
    },
    'test-project',
  );
  for (const path of [
    '/compute/v1/projects/foreign',
    '/compute/v1/projects/test-project/global/instances/vm',
    'https://other.test/compute/v1/projects/test-project',
  ])
    await expect(port.query(path)).rejects.toThrow('scope');
  await expect(port.query('/compute/v1/projects/test-project', { mutate: true })).rejects.toThrow('method');
  expect(calls).toBe(0);
});
it('uses one private credential for scoped Google reads and IAM test POST', async () => {
  let auth = 0;
  const calls: Array<{ url: string; method?: string }> = [];
  const port = createGcpPreflightPort(
    {
      exec: async () => {
        auth++;
        return { stdout: 'fixture-token\n', stderr: '', exitCode: 0 };
      },
    },
    'test-project',
    (async (url, init) => {
      calls.push({ url: String(url), method: init?.method });
      expect(init?.redirect).toBe('error');
      return Response.json({ observed: true });
    }) as typeof fetch,
  );
  await port.query('/compute/v1/projects/test-project');
  await port.query('/cloudresourcemanager/v1/projects/test-project:testIamPermissions', {
    permissions: ['compute.instances.create'],
  });
  expect(auth).toBe(1);
  expect(calls).toEqual([
    { url: 'https://compute.googleapis.com/compute/v1/projects/test-project', method: 'GET' },
    { url: 'https://cloudresourcemanager.googleapis.com/v1/projects/test-project:testIamPermissions', method: 'POST' },
  ]);
});
it('cancellation and authentication errors prevent HTTP requests', async () => {
  let requests = 0;
  const port = createGcpPreflightPort(
    { exec: async () => ({ stdout: '', stderr: 'PRIVATE', exitCode: 1 }) },
    'test-project',
    (async () => {
      requests++;
      return Response.json({});
    }) as typeof fetch,
  );
  await expect(port.query('/compute/v1/projects/test-project')).rejects.toThrow('authentication unavailable');
  const controller = new AbortController();
  controller.abort();
  await expect(port.query('/compute/v1/projects/test-project', undefined, controller.signal)).rejects.toThrow();
  expect(requests).toBe(0);
});

it('bounds responses and honors cancellation that arrives while obtaining the credential', async () => {
  let cancelled = false;
  const api = { exec: async () => ({ stdout: 'fixture', stderr: '', exitCode: 0 }) };
  const oversized = createGcpPreflightPort(
    api,
    'test-project',
    (async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(4 * 1024 * 1024 + 1));
          },
          cancel() {
            cancelled = true;
          },
        }),
      )) as typeof fetch,
  );
  await expect(oversized.query('/compute/v1/projects/test-project')).rejects.toThrow('size limit');
  expect(cancelled).toBe(true);
  let calls = 0;
  const controller = new AbortController();
  const port = createGcpPreflightPort(
    {
      exec: async () => {
        controller.abort();
        return { stdout: 'fixture', stderr: '', exitCode: 0 };
      },
    },
    'test-project',
    (async () => {
      calls++;
      return Response.json({});
    }) as typeof fetch,
  );
  await expect(port.query('/compute/v1/projects/test-project', undefined, controller.signal)).rejects.toThrow();
  expect(calls).toBe(0);
});
