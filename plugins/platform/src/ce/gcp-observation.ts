import { createHash } from 'node:crypto';
import type { GcpCeContractBoundary } from '../../../gcloud/src/ce/contract';
import { fingerprint } from '../../../gcloud/src/ce/discovery';
import type { CeDeploymentStore } from './deployment-store';
import { createGcpLifecycleHttpPort } from './gcp-http';
import { CeApiError } from './runtime';

export interface GcpPlatformObservations {
  /** Private execution channel; never return these credentials from a conversational tool. */
  terraformEnvironment?(): Promise<{ XCSH_API_URL: string; XCSH_API_TOKEN: string }>;
  configuration(site: string, signal?: AbortSignal): Promise<unknown>;
  registrations(site: string, signal?: AbortSignal): Promise<unknown>;
  health(site: string, signal?: AbortSignal): Promise<unknown>;
  teardown?(
    site: string,
    tokenName: string,
    signal?: AbortSignal,
  ): Promise<{
    siteName: string;
    siteUid?: string;
    tokenName: string;
    tokenIdentityHash?: string;
    siteIdentitySha256?: string;
    tokenIdentitySha256?: string;
    siteAbsent: boolean;
    tokenAbsent: boolean;
  }>;
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
        sites: Array<{ name: string; nodes?: Array<{ name: string }> }>;
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
    async terraformEnvironment() {
      const current = await loadIntent();
      if (store.owner.engine !== 'terraform' || fingerprint(current) !== fingerprint(original))
        throw new Error('Terraform execution context/ownership differs');
      return { XCSH_API_URL: base.origin, XCSH_API_TOKEN: credential };
    },
    configuration: (site, signal) => read(site, 'configuration', signal),
    registrations: (site, signal) => read(site, 'registrations', signal),
    health: (site, signal) => read(site, 'health', signal),
    async teardown(site, tokenName, signal) {
      signal?.throwIfAborted();
      if (!contract.singleNodeLifecycle) throw new Error('Qualified GCP teardown observation unavailable');
      const current = await loadIntent();
      const sites = current.sites.filter((s) => s.name === site);
      const node = sites[0]?.nodes?.[0];
      if (
        fingerprint(current) !== fingerprint(original) ||
        !/^[a-z][a-z0-9-]{0,62}$/.test(site) ||
        sites.length !== 1 ||
        sites[0].nodes?.length !== 1 ||
        !node ||
        tokenName !== `${node.name}-token` ||
        !/^[a-z][a-z0-9-]{0,62}$/.test(tokenName)
      )
        throw new Error('GCP teardown observation site/node binding differs');
      // Expose only bound GET observations; token bootstrap content never leaves this closure.
      const port = createGcpLifecycleHttpPort(apiUrl, credential, fetcher);
      const configuration = await port.read(configPath(site), signal);
      const owned = (value: Record<string, unknown>, name: string) => {
        const metadata = value.metadata as
          | { name?: string; namespace?: string; labels?: Record<string, string> }
          | undefined;
        const uid = (value.system_metadata as { uid?: string } | undefined)?.uid;
        if (
          metadata?.name !== name ||
          metadata.namespace !== 'system' ||
          metadata.labels?.['xcsh-deployment'] !== store.owner.deploymentId ||
          metadata.labels['xcsh-engine'] !== store.owner.engine ||
          typeof uid !== 'string' ||
          !uid
        )
          throw new Error('GCP teardown observation identity/ownership differs');
        return uid;
      };
      const siteUid = configuration ? owned(configuration, site) : undefined;
      const token = await port.read(`/api/register/namespaces/system/tokens/${tokenName}`, signal);
      let tokenIdentityHash: string | undefined;
      let tokenIdentitySha256: string | undefined;
      if (token) {
        const uid = owned(token, tokenName);
        const labels = (token.metadata as { labels: Record<string, string> }).labels;
        if (labels['xcsh-node'] !== node.name || (token.spec as { site_name?: string } | undefined)?.site_name !== site)
          throw new Error('GCP teardown observation token binding differs');
        tokenIdentitySha256 = `sha256:${createHash('sha256').update(uid).digest('hex')}`;
        tokenIdentityHash = fingerprint({ name: tokenName, uid, siteName: site, nodeName: node.name });
      }
      if (fingerprint(await loadIntent()) !== fingerprint(original))
        throw new Error('GCP teardown observation intent changed during reads');
      return {
        siteName: site,
        siteUid,
        tokenName,
        tokenIdentityHash,
        ...(store.owner.engine === 'terraform'
          ? {
              siteIdentitySha256: siteUid ? `sha256:${createHash('sha256').update(siteUid).digest('hex')}` : undefined,
              tokenIdentitySha256,
            }
          : {}),
        siteAbsent: configuration === null,
        tokenAbsent: token === null,
      };
    },
  };
}
