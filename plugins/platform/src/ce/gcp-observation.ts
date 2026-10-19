import { createHash } from 'node:crypto';
import type { GcpCeContractBoundary } from '../../../gcloud/src/ce/contract';
import { fingerprint } from '../../../gcloud/src/ce/discovery';
import type { GcpHaCollection, GcpHaRead } from '../../../gcloud/src/ce/health';
import { readGcpResourceInventory } from '../../../gcloud/src/ce/ownership';
import type { CeDeploymentStore } from './deployment-store';
import { createGcpLifecycleHttpPort } from './gcp-http';
import { CeApiError } from './runtime';

export interface GcpPlatformObservations {
  /** Private execution channel; never return these credentials from a conversational tool. */
  terraformEnvironment?(): Promise<{ XCSH_API_URL: string; XCSH_API_TOKEN: string }>;
  configuration(site: string, signal?: AbortSignal): Promise<unknown>;
  registrations(site: string, signal?: AbortSignal): Promise<unknown>;
  health(site: string, signal?: AbortSignal): Promise<unknown>;
  haHealth?(site: string, signal?: AbortSignal): Promise<GcpHaCollection>;
  haHealthContract?: Record<string, unknown>;
  contractFingerprint?: string;
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
  contract = structuredClone(contract);
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
        sites: Array<{ name: string; nodes?: Array<{ name: string; zone?: string }> }>;
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
  const request = async (path: string, signal?: AbortSignal, responseStatus?: (status: number) => void) => {
    const combined = signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000);
    combined.throwIfAborted();
    const response = await fetcher(new URL(path, base), {
      method: 'GET',
      redirect: 'error',
      signal: combined,
      headers: { Accept: 'application/json', Authorization: `APIToken ${credential}` },
    });
    responseStatus?.(response.status);
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
    contractFingerprint: contract.fingerprint,
    haHealthContract: contract.haHealthContract ? structuredClone(contract.haHealthContract) : undefined,
    ...(contract.haObservations
      ? {
          async haHealth(site: string, signal?: AbortSignal): Promise<GcpHaCollection> {
            if (!contract.haObservations) throw new Error('HA observation mappings unavailable');
            const paths = structuredClone(contract.haObservations);
            if (
              paths.componentStatus !==
                '/api/operate/namespaces/system/sites/{site}/vpm/debug/global/ves-system/status?cached=false' ||
              paths.serviceInventory !== '/api/operate/namespaces/system/sites/{site}/vpm/debug/global/list-service'
            )
              throw new Error('HA observation mappings differ');
            const current = await loadIntent();
            const selected = current.sites.filter((s) => s.name === site);
            if (
              fingerprint(current) !== fingerprint(original) ||
              !/^[a-z][a-z0-9-]{0,62}$/.test(site) ||
              selected.length !== 1 ||
              selected[0].nodes?.length !== 3 ||
              store.owner.engine !== 'terraform'
            )
              throw new Error('HA observation site/intent differs');
            const resources = await readGcpResourceInventory(store, {
              project: current.project,
              deploymentName: current.deploymentName,
              engine: 'terraform',
            });
            const ownedNodes = selected[0].nodes.map((node) => {
              const matches = resources.filter(
                (r) => r.kind === 'instance' && r.nodeName === node.name && r.siteName === site,
              );
              const expectedLink = `https://www.googleapis.com/compute/v1/projects/${current.project}/zones/${node.zone}/instances/${node.name}`;
              if (matches.length !== 1 || matches[0].selfLink !== expectedLink)
                throw new Error('HA original node ownership unavailable');
              return { nodeName: node.name, instanceId: matches[0].id };
            });
            if (
              new Set(ownedNodes.map((n) => n.nodeName)).size !== 3 ||
              new Set(ownedNodes.map((n) => n.instanceId)).size !== 3
            )
              throw new Error('HA duplicate original node ownership');
            const ownership = (await store.read('gcp-tf-public-ownership.json')) as {
              schemaVersion?: number;
              intentFingerprint?: string;
              complete?: boolean;
              platform?: Record<string, string>;
              resources?: unknown;
            };
            if (
              ownership?.schemaVersion !== 2 ||
              ownership.intentFingerprint !== fingerprint(current) ||
              ownership.complete !== true
            )
              throw new Error('HA original ownership receipt unavailable');
            const capturedResources = ownership.resources;
            if (
              !Array.isArray(capturedResources) ||
              ownedNodes.some((node) => {
                const captured = capturedResources.filter((raw: unknown) => {
                  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
                  const r = raw as Record<string, unknown>;
                  return r.kind === 'instance' && r.nodeName === node.nodeName && r.siteName === site;
                });
                return captured.length !== 1 || captured[0].id !== node.instanceId;
              })
            )
              throw new Error('HA original VM identity differs from ownership receipt');
            const siteIdentitySha256 = ownership?.platform?.[`xcsh_securemesh_site_v2.${site.replaceAll('-', '_')}`];
            if (!siteIdentitySha256 || !/^sha256:[a-f0-9]{64}$/.test(siteIdentitySha256))
              throw new Error('HA original site identity unavailable');
            const checkSite = async () => {
              const configuration = await read(site, 'configuration', signal);
              const uid = (configuration.system_metadata as { uid?: unknown } | undefined)?.uid;
              if (
                typeof uid !== 'string' ||
                `sha256:${createHash('sha256').update(uid).digest('hex')}` !== siteIdentitySha256
              )
                throw new Error('HA original site identity differs');
            };
            const startedAt = new Date().toISOString();
            await checkSite();
            const collect = async (path: string): Promise<GcpHaRead> => {
              const start = performance.now();
              let httpStatus: number | undefined;
              try {
                const value = await request(path.replace('{site}', site), signal, (status) => {
                  httpStatus = status;
                });
                return {
                  available: true,
                  httpStatus,
                  value,
                  observedAt: new Date().toISOString(),
                  receiptHash: fingerprint(value),
                  durationMs: Math.round(performance.now() - start),
                };
              } catch (error) {
                signal?.throwIfAborted();
                const name = error instanceof Error ? error.name : '';
                return {
                  available: false,
                  observedAt: new Date().toISOString(),
                  durationMs: Math.round(performance.now() - start),
                  errorClass:
                    error instanceof CeApiError
                      ? error.category === 'malformed'
                        ? 'malformed'
                        : 'http'
                      : name === 'TimeoutError'
                        ? 'timeout'
                        : 'transport',
                  ...(httpStatus !== undefined ? { httpStatus } : {}),
                };
              }
            };
            const componentStatus = await collect(paths.componentStatus);
            const serviceInventory = await collect(paths.serviceInventory);
            const globalHealth = await collect(mappings.health);
            await checkSite();
            if (
              fingerprint(await loadIntent()) !== fingerprint(original) ||
              fingerprint(
                await readGcpResourceInventory(store, {
                  project: current.project,
                  deploymentName: current.deploymentName,
                  engine: 'terraform',
                }),
              ) !== fingerprint(resources) ||
              fingerprint(await store.read('gcp-tf-public-ownership.json')) !== fingerprint(ownership)
            )
              throw new Error('HA ownership changed during collection');
            return {
              schemaVersion: 1,
              siteName: site,
              siteIdentitySha256,
              ownedNodes,
              ownershipFingerprint: fingerprint(ownedNodes),
              contractFingerprint: contract.fingerprint,
              startedAt,
              finishedAt: new Date().toISOString(),
              componentStatus,
              serviceInventory,
              globalHealth,
            };
          },
        }
      : {}),
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
