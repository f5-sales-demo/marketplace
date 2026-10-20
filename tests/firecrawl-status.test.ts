import { afterEach, expect, test } from 'bun:test';
import firecrawl from '../plugins/firecrawl/extensions/integration';

const originalFetch = globalThis.fetch;
const originalUrl = process.env.FIRECRAWL_API_URL;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.FIRECRAWL_API_URL;
  else process.env.FIRECRAWL_API_URL = originalUrl;
});

function integration() {
  let definition: any;
  firecrawl({
    integrations: {
      register(value) {
        definition = value;
      },
    },
  });
  return definition;
}

test('Firecrawl readiness verifies identity instead of accepting another HTTP service', async () => {
  globalThis.fetch = (async () => Response.json({ message: 'other service' })) as typeof fetch;
  expect(await integration().probe()).toMatchObject({
    state: 'setup_required',
    reason: 'invalid_response',
  });
});

test('Firecrawl readiness keeps malformed and unavailable evidence distinct', async () => {
  globalThis.fetch = (async () => new Response('{broken')) as typeof fetch;
  expect(await integration().probe()).toMatchObject({
    state: 'setup_required',
    reason: 'invalid_response',
  });
  globalThis.fetch = (async () => {
    throw new Error('unreachable');
  }) as typeof fetch;
  expect(await integration().probe()).toMatchObject({
    state: 'setup_required',
    reason: 'network',
  });
});

test('Firecrawl setup and probe share the configured endpoint and bounded identity check', async () => {
  process.env.FIRECRAWL_API_URL = 'http://127.0.0.1:4567/firecrawl/';
  let requested = '';
  globalThis.fetch = (async (url: any, options: any) => {
    requested = String(url);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.redirect).toBe('error');
    return Response.json({
      message: 'Firecrawl API',
      documentation_url: 'https://docs.firecrawl.dev',
    });
  }) as typeof fetch;
  const current = integration();
  expect(await current.probe()).toEqual({ state: 'ready' });
  expect(requested).toBe('http://127.0.0.1:4567/firecrawl/');
  expect(current.setup.verification[0].argv[0]).toBe('python3');
  expect(current.setup.verification[0].argv).toContain('--check');
});

test('Firecrawl rejects credential-bearing endpoint configuration before fetching', async () => {
  process.env.FIRECRAWL_API_URL = 'https://private:secret@example.invalid/?token=secret';
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    throw new Error('must not fetch');
  }) as typeof fetch;
  expect(await integration().probe()).toEqual({
    state: 'setup_required',
    reason: 'invalid_configuration',
  });
  expect(called).toBe(false);
});
