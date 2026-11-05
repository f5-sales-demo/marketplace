import { fingerprint } from '../../../gcloud/src/ce/discovery';
import type { OperationalBinding } from '../../../gcloud/src/ce/operational-health';
import { type GcpRuntimeListing, gcpRuntimeCommand } from './gcp-runtime-diagnostics';

type Node = OperationalBinding['nodes'][number];
export type OperationalCommandSelection =
  | { kind: 'list' }
  | { kind: 'inspect'; containerId: string; listing: GcpRuntimeListing }
  | { kind: 'diagnosis' }
  | { kind: 'health' };
export interface OperationalCommandCapture {
  nodeName: string;
  command: string[];
  startedAt: string;
  finishedAt: string;
  httpStatus?: number;
  body: string;
  truncated: boolean;
  errorCode?: 'transport' | 'http' | 'malformed' | 'command-failed' | 'ownership-changed';
}
/** Private, fixed read-only Site CLI transport. Credentials and response bodies never enter public results. */
export function createGcpOperationalCommandPort(
  expected: OperationalBinding,
  apiUrl: string,
  credential: string,
  binding: (signal?: AbortSignal) => Promise<OperationalBinding>,
  capture: (entry: OperationalCommandCapture) => Promise<void>,
  fetcher: typeof fetch = fetch,
) {
  expected = structuredClone(expected);
  const base = new URL(apiUrl);
  if (
    base.protocol !== 'https:' ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    !['', '/'].includes(base.pathname) ||
    !credential ||
    !/^[a-z][a-z0-9-]{0,62}$/.test(expected.siteName)
  )
    throw new Error('Explicit original Site CLI context required');
  const expectedFingerprint = fingerprint(expected);
  return {
    async execute(node: Node, selection: OperationalCommandSelection, signal?: AbortSignal): Promise<string> {
      node = structuredClone(node);
      selection = structuredClone(selection);
      if (expected.nodes.filter((original) => fingerprint(original) === fingerprint(node)).length !== 1)
        throw new Error('Original Site CLI node required');
      const command =
        (selection.kind === 'health' || selection.kind === 'diagnosis') && Object.keys(selection).length === 1
          ? [selection.kind]
          : gcpRuntimeCommand(
              node,
              expected.ownershipFingerprint,
              selection as Parameters<typeof gcpRuntimeCommand>[2],
            );
      const bounded = signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000);
      const attempt: OperationalCommandCapture = {
        nodeName: node.nodeName,
        command,
        startedAt: new Date().toISOString(),
        finishedAt: '',
        body: '',
        truncated: false,
      };
      let output: string | undefined;
      const chunks: Uint8Array[] = [];
      let size = 0;
      const checkedBinding = async () => {
        if (fingerprint(await binding(bounded)) !== expectedFingerprint) {
          attempt.errorCode = 'ownership-changed';
          throw new Error('Original Site CLI ownership changed');
        }
      };
      let abort: (() => void) | undefined;
      try {
        const operation = async () => {
          await checkedBinding();
          bounded.throwIfAborted();
          const response = await fetcher(
            new URL(
              `/api/operate/namespaces/system/sites/${expected.siteName}/vpm/debug/${node.nodeName}/exec-user`,
              base,
            ),
            {
              method: 'POST',
              redirect: 'error',
              signal: bounded,
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: `APIToken ${credential}`,
              },
              body: JSON.stringify({ command }),
            },
          );
          attempt.httpStatus = response.status;
          if (!response.body) {
            attempt.errorCode = 'malformed';
            throw new Error('Site CLI body unavailable');
          }
          const reader = response.body.getReader();
          try {
            for (;;) {
              bounded.throwIfAborted();
              const { done, value } = await reader.read();
              bounded.throwIfAborted();
              if (done) break;
              chunks.push(value.subarray(0, 4 * 1024 * 1024 - size));
              size += value.byteLength;
              if (size > 4 * 1024 * 1024) {
                attempt.truncated = true;
                attempt.errorCode = 'malformed';
                throw new Error('Site CLI capture exceeds bound');
              }
            }
          } finally {
            await reader.cancel();
            reader.releaseLock();
          }
          if (!response.ok) {
            attempt.errorCode = 'http';
            throw new Error('Site CLI unavailable');
          }
          attempt.errorCode = 'malformed';
          const body = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
          const value = JSON.parse(body);
          if (
            !value ||
            typeof value !== 'object' ||
            Array.isArray(value) ||
            typeof value.output !== 'string' ||
            !Number.isSafeInteger(value.return_code)
          )
            throw new Error('Site CLI response malformed');
          if (value.return_code !== 0) {
            attempt.errorCode = 'command-failed';
            throw new Error('Site CLI command failed');
          }
          delete attempt.errorCode;
          await checkedBinding();
          bounded.throwIfAborted();
          return value.output as string;
        };
        const interrupted = new Promise<never>((_resolve, reject) => {
          abort = () => reject(new Error('Site CLI transport interrupted'));
          bounded.addEventListener('abort', abort, { once: true });
          if (bounded.aborted) abort();
        });
        output = await Promise.race([operation(), interrupted]);
      } catch {
        attempt.errorCode ??= 'transport';
      } finally {
        if (abort) bounded.removeEventListener('abort', abort);
        attempt.body = Buffer.concat(chunks).toString('utf8');
        attempt.finishedAt = new Date().toISOString();
        await capture(structuredClone(attempt));
      }
      if (attempt.errorCode || output === undefined) throw new Error('Required Site CLI evidence unavailable');
      return output;
    },
  };
}
