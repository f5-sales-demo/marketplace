import { createHash } from 'node:crypto';
import { decodeEvidenceObject } from './evidence-json';
import type { GcpLifecycleHttpCapture, GcpPlatformHttpCaptureSession } from './gcp-http-capture';
import type { GcpLifecyclePort } from './gcp-lifecycle';
import { CeApiError } from './runtime';

export type GcpLifecycleFetcher = (url: URL, init: RequestInit) => Promise<Response>;

/** Private GCP lifecycle port restricted to the reviewed site/token API families. */
export function createGcpLifecycleHttpPort(
  apiUrl: string,
  credential: string,
  fetcher: GcpLifecycleFetcher = fetch,
  capture?: GcpLifecycleHttpCapture,
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
    const requestBody = body ? JSON.stringify(body) : undefined;
    let session: GcpPlatformHttpCaptureSession | undefined,
      reference: Awaited<ReturnType<GcpPlatformHttpCaptureSession['finish']>> | undefined;
    let status: number | null = null,
      responseComplete = false,
      truncated = false;
    let captureSealed = false;
    try {
      session = await capture?.begin(
        {
          origin: base.origin,
          path,
          method,
          credentialSha256: createHash('sha256').update(credential).digest('hex'),
          requestBodySha256: requestBody ? createHash('sha256').update(requestBody).digest('hex') : null,
        },
        requestBody,
      );
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
        ...(requestBody ? { body: requestBody } : {}),
      });
      status = response.status;
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (response.body) {
        const reader = response.body.getReader();
        let originalError: unknown, cancelError: unknown;
        let readFailed = false,
          cancelFailed = false;
        const cancelOnAbort = () => {
          void reader.cancel().catch((error) => {
            cancelError = error;
            cancelFailed = true;
          });
        };
        combined.addEventListener('abort', cancelOnAbort, { once: true });
        try {
          for (;;) {
            combined.throwIfAborted();
            const { done, value } = await reader.read();
            combined.throwIfAborted();
            if (done) {
              responseComplete = true;
              break;
            }
            const retained = Buffer.from(value.subarray(0, Math.max(0, 16 * 1024 * 1024 - size)));
            if (retained.length) {
              chunks.push(retained);
              size += retained.length;
              await session?.append(retained);
            }
            if (retained.length !== value.length) {
              truncated = true;
              throw new CeApiError('malformed');
            }
            await capture?.assertOriginal();
          }
        } catch (error) {
          originalError = error;
          readFailed = true;
        } finally {
          combined.removeEventListener('abort', cancelOnAbort);
          try {
            await reader.cancel();
          } catch (error) {
            cancelError = error;
            cancelFailed = true;
          }
          reader.releaseLock();
        }
        if (readFailed && cancelFailed && originalError !== cancelError)
          throw new AggregateError([originalError, cancelError], 'Original Platform body and reader closure failed');
        if (readFailed) throw originalError;
        if (cancelFailed) throw cancelError;
      } else responseComplete = true;
      combined.throwIfAborted();
      await capture?.assertOriginal();
      const bytes = Buffer.concat(chunks);
      let value: Record<string, unknown> | null;
      if (response.status === 404 && method === 'GET') value = null;
      else {
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
        if (!bytes.length) value = {};
        else {
          try {
            value = decodeEvidenceObject(bytes);
          } catch {
            throw new CeApiError('malformed');
          }
          if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CeApiError('malformed');
        }
      }
      if (session) {
        captureSealed = true;
        reference = await session.finish({ status, responseComplete, accepted: true, truncated });
      }
      if (value && reference) await capture?.bindResponse(value, reference);
      return value;
    } catch (error) {
      if (session && !captureSealed) {
        captureSealed = true;
        try {
          await session.finish({ status, responseComplete, accepted: false, truncated, error });
        } catch (persistenceError) {
          throw new AggregateError(
            [error, persistenceError],
            'Original Platform HTTP failure and capture persistence failed',
          );
        }
      }
      throw error;
    }
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
