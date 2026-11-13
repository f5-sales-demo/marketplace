import { expect, it } from 'bun:test';
import { operationalFixture } from '../../../gcloud/test/ce/operational-health.test';
import { createGcpOperationalCommandPort, type OperationalCommandCapture } from '../../src/ce/gcp-operational-command';

it('uses the exact original node and fixed lower-privilege command, with private capture and repeated ownership checks', async () => {
  const f = operationalFixture();
  const captures: OperationalCommandCapture[] = [];
  const events: string[] = [];
  const port = createGcpOperationalCommandPort(
    f.binding,
    'https://console.example.test',
    'private-credential',
    async () => {
      events.push('binding');
      return f.binding;
    },
    async (entry) => {
      events.push('capture');
      captures.push(entry);
    },
    (async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
      events.push('request');
      expect(String(url)).toBe(
        'https://console.example.test/api/operate/namespaces/system/sites/site-a/vpm/debug/node-a/exec-user',
      );
      expect(init?.method).toBe('POST');
      expect(init?.redirect).toBe('error');
      expect(JSON.parse(String(init?.body))).toEqual({ command: ['crictl-ps-a'] });
      return Response.json({ output: 'listing', return_code: 0 });
    }) as unknown as typeof fetch,
  );
  expect(await port.execute(f.binding.nodes[0], { kind: 'list' })).toBe('listing');
  expect(events).toEqual(['binding', 'request', 'binding', 'capture']);
  expect(captures[0].httpStatus).toBe(200);
  expect(JSON.stringify(captures)).not.toContain('private-credential');
  await expect(port.execute({ ...f.binding.nodes[0], instanceId: '999' }, { kind: 'list' })).rejects.toThrow();
});

it('captures HTTP failures, malformed and failed commands, and never reuses a successful response', async () => {
  const f = operationalFixture();
  const captures: OperationalCommandCapture[] = [];
  const responses = [
    Response.json({ output: 'fresh', return_code: 0 }),
    new Response('upstream failure', { status: 503 }),
    new Response('invalid JSON'),
    Response.json({ output: 'failed', return_code: 1 }),
    Response.json({ output: 'missing code' }),
  ];
  const port = createGcpOperationalCommandPort(
    f.binding,
    'https://console.example.test',
    'private',
    async () => f.binding,
    async (entry) => {
      captures.push(entry);
    },
    (async () => responses.shift()!) as unknown as typeof fetch,
  );
  expect(await port.execute(f.binding.nodes[0], { kind: 'diagnosis' })).toBe('fresh');
  for (let i = 0; i < 4; i++)
    await expect(port.execute(f.binding.nodes[0], { kind: 'diagnosis' })).rejects.toThrow(
      'Required Site CLI evidence unavailable',
    );
  expect(captures.map((c) => c.errorCode)).toEqual([undefined, 'http', 'malformed', 'command-failed', 'malformed']);
  expect(captures[1].body).toBe('upstream failure');
});

it('rejects drift after a read and unsafe selections before any request', async () => {
  const f = operationalFixture();
  const captures: OperationalCommandCapture[] = [];
  let bindings = 0;
  let requests = 0;
  const port = createGcpOperationalCommandPort(
    f.binding,
    'https://console.example.test',
    'private',
    async () => {
      const b = structuredClone(f.binding);
      if (bindings++) b.nodes[0].instanceId = '999';
      return b;
    },
    async (entry) => {
      captures.push(entry);
    },
    (async () => {
      requests++;
      return Response.json({ output: 'stale', return_code: 0 });
    }) as unknown as typeof fetch,
  );
  await expect(port.execute(f.binding.nodes[0], { kind: 'health' })).rejects.toThrow();
  expect(captures[0].errorCode).toBe('ownership-changed');
  await expect(
    port.execute(f.binding.nodes[0], { kind: 'diagnosis', command: 'arbitrary' } as never),
  ).rejects.toThrow();
  await expect(
    port.execute(f.binding.nodes[0], { kind: 'inspect', containerId: 'arbitrary', listing: {} } as never),
  ).rejects.toThrow();
  expect(requests).toBe(1);
});

it('bounds private bodies, stops when capture fails, and honors cancellation', async () => {
  const f = operationalFixture();
  let captured: OperationalCommandCapture | undefined;
  const port = createGcpOperationalCommandPort(
    f.binding,
    'https://console.example.test',
    'private',
    async () => f.binding,
    async (entry) => {
      captured = entry;
    },
    (async () => new Response('x'.repeat(4 * 1024 * 1024 + 1))) as unknown as typeof fetch,
  );
  await expect(port.execute(f.binding.nodes[0], { kind: 'list' })).rejects.toThrow();
  expect(captured?.truncated).toBe(true);
  expect(Buffer.byteLength(captured!.body)).toBe(4 * 1024 * 1024);
  const failedCapture = createGcpOperationalCommandPort(
    f.binding,
    'https://console.example.test',
    'private',
    async () => f.binding,
    async () => {
      throw new Error('private capture failed');
    },
    (async () => Response.json({ output: 'listing', return_code: 0 })) as unknown as typeof fetch,
  );
  await expect(failedCapture.execute(f.binding.nodes[0], { kind: 'list' })).rejects.toThrow('private capture failed');
  const controller = new AbortController();
  const stalled = createGcpOperationalCommandPort(
    f.binding,
    'https://console.example.test',
    'private',
    async () => f.binding,
    async (entry) => {
      captured = entry;
    },
    (async () => {
      controller.abort();
      return await new Promise<Response>(() => {});
    }) as unknown as typeof fetch,
  );
  await expect(stalled.execute(f.binding.nodes[0], { kind: 'list' }, controller.signal)).rejects.toThrow();
  expect(captured?.errorCode).toBe('transport');
});
