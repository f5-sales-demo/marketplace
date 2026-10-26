import { expect, it } from 'bun:test';
import { createGcpReleaseFetch } from '../../src/ce/release-fetch';

const token = 'fixture_credential_not_a_real_secret';
const base = 'https://api.github.com/repos/f5-sales-demo/api-specs-enriched';
function fixture(env: Record<string, string | undefined> = { GH_TOKEN: token }) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = (async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response('', { status: 401 });
  }) as typeof fetch;
  return { calls, read: createGcpReleaseFetch(fetcher, env) };
}
it('authenticates only original pinned metadata GETs and forbids redirects', async () => {
  const f = fixture();
  for (const path of [
    'releases/tags/v12.1.3',
    'releases/tags/v12.3.1',
    'git/ref/tags/v12.3.1',
    `git/tags/${'a'.repeat(40)}`,
  ]) {
    await f.read(`${base}/${path}`, { headers: { Accept: 'application/vnd.github+json' } });
    const init = f.calls.at(-1)?.init;
    if (!init) throw new Error('Expected a retained metadata request');
    expect(new Headers(init.headers).get('Authorization')).toBe(`Bearer ${token}`);
    expect(new Headers(init.headers).get('Accept')).toBe('application/vnd.github+json');
    expect(init.redirect).toBe('error');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  }
});
it('never attaches its credential to assets, redirects, foreign repositories or unpinned URLs', async () => {
  const f = fixture();
  const userInfoUrl = new URL(`${base}/releases/tags/v12.3.1`);
  userInfoUrl.username = 'fixture';
  for (const url of [
    'https://github.com/f5-sales-demo/api-specs-enriched/releases/download/v12.3.1/gcp-operational-health-v2.json',
    'https://release-assets.githubusercontent.com/file',
    `${base}/releases/tags/v999.0.0`,
    `${base}/releases/tags/v12.3.1?other=1`,
    `${base}/releases/tags/v12.3.1#other`,
    `${base.replace('api-specs-enriched', 'foreign')}/releases/tags/v12.3.1`,
    `${base.replace('https:', 'http:')}/releases/tags/v12.3.1`,
    `${base.replace('api.github.com', 'api.github.com.evil.example')}/releases/tags/v12.3.1`,
    userInfoUrl.href,
    `${base.replace('api.github.com', 'api.github.com:444')}/releases/tags/v12.3.1`,
  ]) {
    await f.read(url);
    expect(new Headers(f.calls.at(-1)?.init?.headers).has('Authorization')).toBe(false);
  }
});
it('rejects writes, body payloads and conflicting authorization before submission', async () => {
  for (const init of [{ method: 'POST' }, { body: 'payload' }, { headers: { Authorization: 'existing' } }]) {
    const f = fixture();
    await expect(f.read(`${base}/releases/tags/v12.3.1`, init)).rejects.toThrow();
    expect(f.calls).toHaveLength(0);
  }
  const f = fixture();
  await expect(f.read(new Request(`${base}/releases/tags/v12.3.1`, { method: 'DELETE' }))).rejects.toThrow();
  await expect(
    f.read(new Request(`${base}/releases/tags/v12.3.1`, { method: 'POST', body: 'payload' }), { method: 'GET' }),
  ).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
});
it('uses standard GH_TOKEN precedence, supports GITHUB_TOKEN, and leaves missing credentials anonymous', async () => {
  for (const [env, expected] of [
    [{ GH_TOKEN: token, GITHUB_TOKEN: 'secondary_fixture_token' }, token],
    [{ GITHUB_TOKEN: token }, token],
    [{}, null],
  ] as const) {
    const f = fixture(env);
    await f.read(`${base}/releases/tags/v12.3.1`);
    expect(new Headers(f.calls[0].init?.headers).get('Authorization')).toBe(expected ? `Bearer ${expected}` : null);
  }
});
it('rejects malformed credentials without retaining or exposing their value', async () => {
  for (const credential of ['short', 'fixture\r\nsecret', 'x'.repeat(8193)]) {
    const f = fixture({ GH_TOKEN: credential });
    await expect(f.read(`${base}/releases/tags/v12.3.1`)).rejects.toThrow('Invalid GitHub read credential');
    expect(f.calls).toHaveLength(0);
  }
});
it('preserves caller cancellation and never retries an expired credential anonymously', async () => {
  const f = fixture();
  const controller = new AbortController();
  controller.abort();
  await expect(f.read(`${base}/releases/tags/v12.3.1`, { signal: controller.signal })).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
  expect((await f.read(`${base}/releases/tags/v12.3.1`)).status).toBe(401);
  expect(f.calls).toHaveLength(1);
});
