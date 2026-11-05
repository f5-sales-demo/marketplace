import type { GcpLifecyclePort } from './gcp-lifecycle';
import { CeApiError } from './runtime';

/** Private GCP lifecycle port restricted to the reviewed site/token API families. */
export function createGcpLifecycleHttpPort(
  apiUrl: string,
  credential: string,
  fetcher: typeof fetch = fetch,
): GcpLifecyclePort {
  const base = new URL(apiUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || !credential)
    throw new Error('Explicit HTTPS GCP context required');
  const request = async (
    path: string,
    method: 'GET' | 'POST' | 'DELETE',
    body?: Record<string, unknown>,
    signal?: AbortSignal,
  ) => {
    if (
      !/^\/api\/(?:config|register)\/namespaces\/system\/(?:securemesh_site_v2s|tokens)(?:\/[a-z][a-z0-9-]{0,62})?$/.test(
        path,
      )
    )
      throw new Error('GCP lifecycle path escaped scope');
    const combined = signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000);
    combined.throwIfAborted();
    const response = await fetcher(new URL(path, base), {
      method,
      redirect: 'error',
      signal: combined,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `APIToken ${credential}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (response.status === 404 && method === 'GET') return null;
    if (!response.ok)
      throw new CeApiError(
        response.status === 401
          ? 'expired'
          : response.status === 403
            ? 'authorization'
            : response.status === 409
              ? 'conflict'
              : 'transient',
        response.status,
      );
    if (!response.body) return {};
    const reader = response.body.getReader(),
      chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        combined.throwIfAborted();
        const { done, value } = await reader.read();
        combined.throwIfAborted();
        if (done) break;
        size += value.length;
        if (size > 16 * 1024 * 1024) throw new CeApiError('malformed');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    const bytes = Buffer.concat(chunks);
    if (!bytes.length) return {};
    let value: unknown;
    try {
      value = JSON.parse(bytes.toString('utf8'));
    } catch {
      throw new CeApiError('malformed');
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CeApiError('malformed');
    return value as Record<string, unknown>;
  };
  return {
    read: (path, signal) => request(path, 'GET', undefined, signal),
    mutate: async (path, method, body, signal) => {
      const value = await request(path, method, body, signal);
      if (!value) throw new CeApiError('malformed');
      return value;
    },
  };
}
