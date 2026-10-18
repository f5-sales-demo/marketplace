import { expect, it } from 'bun:test';
import { GCP_CE_API_RELEASE, resolveGcpContract } from '../../src/ce/contract';

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
    }) as typeof fetch;
    await expect(resolveGcpContract(fetcher)).rejects.toThrow();
    expect(calls).toBe(1);
  }
});
it('rejects altered bytes even with matching release metadata', async () => {
  let calls = 0;
  const fetcher = (async () =>
    ++calls === 1
      ? Response.json(release())
      : Response.json({ providers: { gcp: { availability: 'available' } } })) as typeof fetch;
  await expect(resolveGcpContract(fetcher)).rejects.toThrow('digest mismatch');
});
it('does not conceal contract transport failure', async () => {
  const fetcher = (async () => new Response('', { status: 503 })) as typeof fetch;
  await expect(resolveGcpContract(fetcher)).rejects.toThrow('HTTP 503');
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
      }) as typeof fetch,
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
  }) as typeof fetch;
  await expect(resolveGcpContract(fetcher)).rejects.toThrow('size limit');
  expect(calls).toBe(1);
  expect(cancelled).toBe(true);
});
