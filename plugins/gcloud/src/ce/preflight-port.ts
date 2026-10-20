import type { GcloudExecApi } from '../gcloud/exec';
import type { GcpPreflightPort } from './preflight';
import { validateScope } from './validation';

/** Authenticated read-only Google transport; access tokens stay inside the request closure. */
export function createGcpPreflightPort(
  api: GcloudExecApi,
  project: string,
  fetcher: typeof fetch = fetch,
): GcpPreflightPort {
  validateScope(project);
  let credential: string | undefined;
  const request = async (path: string, body?: Record<string, unknown>, signal?: AbortSignal) => {
    const compute = `/compute/v1/projects/${project}`;
    const publisher = '/compute/v1/projects/f5-7626-networks-public/global';
    const iam = `/cloudresourcemanager/v1/projects/${project}:testIamPermissions`;
    const suffix = path.startsWith(compute) ? path.slice(compute.length) : undefined;
    const allowedCompute =
      suffix !== undefined &&
      /^(?:|\/regions\/[a-z]+(?:-[a-z]+)+\d|\/zones\/[a-z]+(?:-[a-z]+)+\d-[a-z](?:\/machineTypes\/[a-z][a-z0-9-]{0,62})?)$/.test(
        suffix,
      );
    const allowedPublisher =
      path.startsWith(publisher) && /^\/(?:images|licenses)\/[a-z][a-z0-9-]{0,62}$/.test(path.slice(publisher.length));
    if (!allowedCompute && !allowedPublisher && path !== iam)
      throw new Error('Preflight request escaped explicit project scope');
    if ((path === iam) !== (body !== undefined)) throw new Error('Preflight request method differs');
    const combined = signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000);
    combined.throwIfAborted();
    if (!credential) {
      const result = await api.exec('gcloud', ['auth', 'print-access-token', `--project=${project}`, '--quiet'], {
        signal: combined,
      });
      if (result.exitCode !== 0 || !result.stdout.trim() || /\s/.test(result.stdout.trim()))
        throw new Error('GCP preflight authentication unavailable');
      credential = result.stdout.trim();
    }
    combined.throwIfAborted();
    const url =
      path === iam
        ? `https://cloudresourcemanager.googleapis.com/v1/projects/${project}:testIamPermissions`
        : `https://compute.googleapis.com${path}`;
    const response = await fetcher(url, {
      method: body ? 'POST' : 'GET',
      redirect: 'error',
      signal: combined,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${credential}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok || !response.body) throw new Error('GCP preflight source unavailable');
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
        if (size > 4 * 1024 * 1024) throw new Error('GCP preflight response exceeds size limit');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    try {
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
    } catch {
      throw new Error('GCP preflight response malformed');
    }
  };
  return {
    query: request,
    async policy(requestedProject, constraint, signal) {
      if (
        requestedProject !== project ||
        ![
          'compute.vmExternalIpAccess',
          'compute.trustedImageProjects',
          'compute.requireShieldedVm',
          'compute.restrictNonConfidentialComputing',
          'compute.disableSerialPortAccess',
        ].includes(constraint)
      )
        throw new Error('Preflight policy escaped explicit scope');
      signal?.throwIfAborted();
      const result = await api.exec(
        'gcloud',
        [
          'org-policies',
          'describe',
          `constraints/${constraint}`,
          `--project=${project}`,
          '--effective',
          '--format=json',
        ],
        { signal },
      );
      signal?.throwIfAborted();
      if (result.exitCode !== 0) throw new Error('GCP effective policy unavailable');
      try {
        return JSON.parse(result.stdout);
      } catch {
        throw new Error('GCP effective policy malformed');
      }
    },
  };
}
