import type { GcpCeContractBoundary } from '../../../gcloud/src/ce/contract';
import { fingerprint } from '../../../gcloud/src/ce/discovery';
import type { CeDeploymentStore } from './deployment-store';
import { CeApiError } from './runtime';

export interface GcpPlatformObservations {
  configuration(site: string, signal?: AbortSignal): Promise<unknown>;
  registrations(site: string, signal?: AbortSignal): Promise<unknown>;
  health(site: string, signal?: AbortSignal): Promise<unknown>;
}

/** Private read channel for cloud collectors; never exposes arbitrary paths or mutations. */
export async function createGcpPlatformObservations(
  store: CeDeploymentStore,
  contextName: string,
  apiUrl: string,
  credential: string,
  contract: GcpCeContractBoundary,
  fetcher: typeof fetch = fetch,
): Promise<GcpPlatformObservations> {
  const base = new URL(apiUrl);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || !credential)
    throw new Error('Explicit HTTPS GCP platform context required');
  if (store.owner.provider !== 'gcp' || !contract.observations)
    throw new Error('Verified GCP observations unavailable');
  const mappings = structuredClone(contract.observations);
  const journalName =
    store.owner.engine === 'terraform' ? 'gcp-terraform-input-identity.json' : 'gcp-deployment-intent.json';
  const loadIntent = async () => {
    await store.verify();
    const saved = (await store.read(journalName)) as {
      intent?: {
        project: string;
        region: string;
        deploymentName: string;
        engine: string;
        platformContext: string;
        sites: Array<{ name: string }>;
      };
      intentFingerprint: string;
      platformContext: string;
    };
    const intent = saved?.intent;
    if (
      !intent ||
      saved.intentFingerprint !== fingerprint(intent) ||
      saved.platformContext !== contextName ||
      intent.platformContext !== contextName ||
      intent.project !== store.owner.account ||
      intent.region !== store.owner.region ||
      intent.engine !== store.owner.engine ||
      intent.deploymentName !== store.owner.deploymentId ||
      !Array.isArray(intent.sites)
    )
      throw new Error('GCP observation context/ownership differs');
    return intent;
  };
  const original = await loadIntent();
  const request = async (path: string, signal?: AbortSignal) => {
    const combined = signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000);
    combined.throwIfAborted();
    const response = await fetcher(new URL(path, base), {
      method: 'GET',
      redirect: 'error',
      signal: combined,
      headers: { Accept: 'application/json', Authorization: `APIToken ${credential}` },
    });
    if (!response.ok)
      throw new CeApiError(
        response.status === 404
          ? 'not-found'
          : response.status === 401
            ? 'expired'
            : response.status === 403
              ? 'authorization'
              : 'transient',
        response.status,
      );
    if (!response.body) throw new CeApiError('malformed');
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
    let result: Record<string, unknown>;
    try {
      result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new CeApiError('malformed');
    }
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new CeApiError('malformed');
    return result;
  };
  const configPath = (site: string) => mappings.configuration.replace('{site}', site);
  const read = async (site: string, kind: 'configuration' | 'registrations' | 'health', signal?: AbortSignal) => {
    signal?.throwIfAborted();
    const current = await loadIntent();
    if (
      fingerprint(current) !== fingerprint(original) ||
      !/^[a-z][a-z0-9-]{0,62}$/.test(site) ||
      current.sites.filter((s) => s.name === site).length !== 1
    )
      throw new Error('GCP observation site/intent differs');
    const configuration = await request(configPath(site), signal);
    const metadata = configuration.metadata as
      | { name?: string; namespace?: string; labels?: Record<string, string> }
      | undefined;
    if (
      metadata?.name !== site ||
      metadata.namespace !== 'system' ||
      metadata.labels?.['xcsh-deployment'] !== store.owner.deploymentId ||
      metadata.labels['xcsh-engine'] !== store.owner.engine
    )
      throw new Error('Live GCP site ownership differs');
    if (kind === 'configuration') return configuration;
    return request(mappings[kind].replace('{site}', site), signal);
  };
  return {
    configuration: (site, signal) => read(site, 'configuration', signal),
    registrations: (site, signal) => read(site, 'registrations', signal),
    health: (site, signal) => read(site, 'health', signal),
  };
}
