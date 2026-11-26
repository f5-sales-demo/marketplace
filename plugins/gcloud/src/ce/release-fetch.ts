/** Credentials stay in memory and are sent only to pinned, nonredirecting metadata GETs.
 * Asset downloads remain anonymous; each consumer still verifies immutable identity and bytes.
 */
export function createGcpReleaseFetch(
  fetcher: typeof fetch = fetch,
  env: Record<string, string | undefined> = process.env,
): typeof fetch {
  return (async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const metadata =
      url.protocol === 'https:' &&
      url.hostname === 'api.github.com' &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /^\/repos\/f5-sales-demo\/api-specs-enriched\/(?:releases\/tags\/v12\.(?:1\.3|3\.1)|git\/ref\/tags\/v12\.3\.1|git\/tags\/[a-f0-9]{40})$/.test(
        url.pathname,
      );
    if (!metadata) return fetcher(input, init);
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (
      method !== 'GET' ||
      init?.body != null ||
      (input instanceof Request && input.body !== null) ||
      headers.has('Authorization')
    )
      throw new Error('Exact unauthenticated metadata GET required');
    const token = env.GH_TOKEN ?? env.GITHUB_TOKEN;
    if (token !== undefined) {
      if (!/^[A-Za-z0-9_]{16,8192}$/.test(token)) throw new Error('Invalid GitHub read credential');
      headers.set('Authorization', `Bearer ${token}`);
    }
    const caller = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const timeout = AbortSignal.timeout(60_000);
    const signal = caller ? AbortSignal.any([caller, timeout]) : timeout;
    signal.throwIfAborted();
    // A 401/403 is returned once. Do not fall back anonymously or cache credentials/results.
    return fetcher(input, { ...init, headers, redirect: 'error', signal });
  }) as typeof fetch;
}

export const fetchGcpRelease: typeof fetch = (async (input, init) =>
  createGcpReleaseFetch()(input, init)) as typeof fetch;
