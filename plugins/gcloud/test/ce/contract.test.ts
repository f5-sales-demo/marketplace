import { expect, it } from 'bun:test';
import { GCP_CE_API_RELEASE, resolveGcpContract } from '../../src/ce/contract';
import { resolveGcpOperationalRelease } from '../../src/ce/operational-release';

function release(overrides: Record<string, unknown> = {}) {
  return {
    tag_name: GCP_CE_API_RELEASE.tag,
    immutable: true,
    draft: false,
    prerelease: false,
    assets: [
      {
        name: 'smsv2-contract.json',
        digest: GCP_CE_API_RELEASE.contractDigest,
        browser_download_url: `https://github.com/${GCP_CE_API_RELEASE.repository}/releases/download/${GCP_CE_API_RELEASE.tag}/smsv2-contract.json`,
      },
    ],
    ...overrides,
  };
}
it('rejects mutable releases and spoofed assets before downloading', async () => {
  for (const body of [
    release({ immutable: false }),
    release({ draft: true }),
    release({ assets: [] }),
    release({
      assets: [
        {
          name: 'smsv2-contract.json',
          digest: GCP_CE_API_RELEASE.contractDigest,
          browser_download_url: 'https://example.com/private',
        },
      ],
    }),
  ]) {
    let calls = 0;
    const fetcher = (async () => {
      calls++;
      return Response.json(body);
    }) as unknown as typeof fetch;
    await expect(resolveGcpContract(fetcher)).rejects.toThrow();
    expect(calls).toBe(1);
  }
});
it('rejects altered bytes even with matching release metadata', async () => {
  let calls = 0;
  const fetcher = (async () =>
    ++calls === 1
      ? Response.json(release())
      : Response.json({ providers: { gcp: { availability: 'available' } } })) as unknown as typeof fetch;
  await expect(resolveGcpContract(fetcher)).rejects.toThrow('digest mismatch');
});
it('does not conceal contract transport failure', async () => {
  const fetcher = (async () => new Response('', { status: 503 })) as unknown as typeof fetch;
  await expect(resolveGcpContract(fetcher)).rejects.toThrow('HTTP 503');
});

it('uses scoped authentication on both public default resolvers without a global fetch preload', async () => {
  const original = globalThis.fetch;
  const credential = process.env.GH_TOKEN;
  const fixtureCredential = 'fixture_contract_read_credential';
  const calls: RequestInit[] = [];
  try {
    process.env.GH_TOKEN = fixtureCredential;
    globalThis.fetch = (async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      calls.push(init ?? {});
      return new Response('', { status: 401 });
    }) as unknown as typeof fetch;
    await expect(resolveGcpContract()).rejects.toThrow('HTTP 401');
    await expect(resolveGcpOperationalRelease()).rejects.toThrow('unavailable');
    expect(calls).toHaveLength(2);
    for (const init of calls) {
      expect(new Headers(init.headers).get('Authorization')).toBe(`Bearer ${fixtureCredential}`);
      expect(init.redirect).toBe('error');
    }
  } finally {
    globalThis.fetch = original;
    if (credential === undefined) delete process.env.GH_TOKEN;
    else process.env.GH_TOKEN = credential;
  }
});

it('rejects cancellation before fetching a release', async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await expect(
    resolveGcpContract(
      (async () => {
        calls++;
        return Response.json(release());
      }) as unknown as typeof fetch,
      controller.signal,
    ),
  ).rejects.toThrow();
  expect(calls).toBe(0);
});

it('bounds streamed contract responses before parsing or downloading assets', async () => {
  let cancelled = false;
  let calls = 0;
  const fetcher = (async () => {
    calls++;
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(1024 * 1024 + 1));
        },
        cancel() {
          cancelled = true;
        },
      }),
    );
  }) as unknown as typeof fetch;
  await expect(resolveGcpContract(fetcher)).rejects.toThrow('size limit');
  expect(calls).toBe(1);
  expect(cancelled).toBe(true);
});
