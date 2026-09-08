import { bindAwsCloudInit } from './bootstrap';
import type { VerifiedCeContract } from './verified-contract';
import type { WireSiteIntent } from './wire-site';

type Json = Record<string, unknown>;
type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;
export interface CeOwner {
  deploymentId: string;
  engine: 'native' | 'terraform';
  provider: 'aws' | 'azure';
  account: string;
  region: string;
}
export interface SiteBinding {
  owner: CeOwner;
  siteName: string;
  nodes: string[];
}
export class CeApiError extends Error {
  constructor(
    readonly category:
      | 'authorization'
      | 'expired'
      | 'throttled'
      | 'not-found'
      | 'conflict'
      | 'invalid-request'
      | 'transient'
      | 'malformed'
      | 'cancelled'
      | 'deadline',
    readonly status?: number,
  ) {
    super(`F5 CE API ${category}${status ? ` (HTTP ${status})` : ''}`);
  }
}
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CeApiError('malformed');
  return value as Json;
}
const safeName = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
function subset(actual: unknown, desired: unknown): boolean {
  if (Array.isArray(desired))
    return (
      Array.isArray(actual) &&
      actual.length === desired.length &&
      desired.every((value, index) => subset(actual[index], value))
    );
  if (desired && typeof desired === 'object')
    return Boolean(
      actual &&
        typeof actual === 'object' &&
        !Array.isArray(actual) &&
        Object.entries(desired).every(([key, value]) => subset((actual as Json)[key], value)),
    );
  return actual === desired;
}

/** Shared F5 operations. A cloud adapter supplies explicit scope and durable checkpoints. */
export class CeRuntime {
  readonly #base: URL;
  readonly #credential: string;
  constructor(
    readonly contract: VerifiedCeContract,
    readonly engine: 'native' | 'terraform',
    apiUrl: string,
    credential: string,
    readonly fetcher: Fetcher = fetch,
  ) {
    this.#base = new URL(apiUrl);
    if (
      this.#base.protocol !== 'https:' ||
      this.#base.username ||
      this.#base.password ||
      this.#base.search ||
      this.#base.hash ||
      !credential
    )
      throw new Error('Explicit HTTPS tenant and credential required');
    this.#credential = credential;
  }
  async #request(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<Json> {
    const url = new URL(path, this.#base);
    if (!path.startsWith('/api/') || url.origin !== this.#base.origin)
      throw new Error('F5 request escaped tenant scope');
    const deadline = AbortSignal.timeout(60_000);
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
    try {
      const response = await this.fetcher(url, {
        ...init,
        redirect: 'error',
        signal: combined,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `APIToken ${this.#credential}`,
        },
      });
      if (!response.ok) {
        const status = response.status;
        throw new CeApiError(
          status === 401
            ? 'expired'
            : status === 403
              ? 'authorization'
              : status === 404
                ? 'not-found'
                : status === 409
                  ? 'conflict'
                  : status === 429
                    ? 'throttled'
                    : status >= 500
                      ? 'transient'
                      : 'invalid-request',
          status,
        );
      }
      if (!response.body) return {};
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 16 * 1024 * 1024) {
            await reader.cancel();
            throw new CeApiError('malformed');
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return {};
      try {
        return object(JSON.parse(text));
      } catch {
        throw new CeApiError('malformed');
      }
    } catch (error) {
      if (signal?.aborted) throw new CeApiError('cancelled');
      if (deadline.aborted) throw new CeApiError('deadline');
      if (error instanceof CeApiError) throw error;
      throw new CeApiError('transient');
    }
  }
  #binding(binding: SiteBinding, mutation = false): void {
    if (
      !safeName.test(binding.siteName) ||
      !safeName.test(binding.owner.deploymentId) ||
      !['aws', 'azure'].includes(binding.owner.provider) ||
      !['native', 'terraform'].includes(binding.owner.engine) ||
      !binding.owner.account ||
      !binding.owner.region ||
      !Array.isArray(binding.nodes) ||
      !binding.nodes.length ||
      binding.nodes.some((node) => !safeName.test(node)) ||
      new Set(binding.nodes).size !== binding.nodes.length
    )
      throw new Error('Invalid CE deployment binding');
    if (mutation && binding.owner.engine !== this.engine)
      throw new Error('Only the owning execution engine may mutate the site');
  }
  #labels(binding: SiteBinding): Json {
    return {
      'xcsh-ce-deployment': binding.owner.deploymentId,
      'xcsh-ce-engine': binding.owner.engine,
      'xcsh-ce-provider': binding.owner.provider,
      'xcsh-ce-account': binding.owner.account,
      'xcsh-ce-region': binding.owner.region,
    };
  }
  #owned(site: Json, binding: SiteBinding): void {
    const metadata = object(site.metadata);
    if (
      metadata.name !== binding.siteName ||
      metadata.namespace !== 'system' ||
      !subset(metadata.labels, this.#labels(binding))
    )
      throw new Error('Live site ownership or scope does not match deployment');
  }
  #sitePath(binding: SiteBinding): string {
    return `/api/config/namespaces/system/securemesh_site_v2s/${binding.siteName}`;
  }
  async observeSite(binding: SiteBinding, signal?: AbortSignal): Promise<Json> {
    this.#binding(binding);
    return this.#request(this.#sitePath(binding), {}, signal);
  }
  async ensureSite(
    binding: SiteBinding,
    intent: WireSiteIntent,
    checkpoint: (site: Json) => Promise<void>,
    signal?: AbortSignal,
  ): Promise<void> {
    this.#binding(binding, true);
    if (
      intent.provider !== binding.owner.provider ||
      !subset(
        intent.nodes.map((node) => node.hostname),
        binding.nodes,
      )
    )
      throw new Error('Site intent and deployment binding disagree');
    const spec = this.contract.buildSite(intent);
    await this.#ensureSpec(binding, spec, checkpoint, signal);
  }
  /** Reserve a site before provider-assigned NIC identities exist. No node is claimed registered. */
  async reserveSite(
    binding: SiteBinding,
    checkpoint: (site: Json) => Promise<void>,
    signal?: AbortSignal,
  ): Promise<void> {
    this.#binding(binding, true);
    if (![1, 3].includes(binding.nodes.length)) throw new Error('A site reservation needs one or three intended nodes');
    const spec = {
      [binding.owner.provider]: { not_managed: {} },
      [binding.nodes.length === 3 ? 'enable_ha' : 'disable_ha']: {},
      disable_management_network: {},
      block_all_services: {},
      no_network_policy: {},
      no_forward_proxy: {},
      logs_streaming_disabled: {},
    };
    this.contract.validateSite(spec);
    await this.#ensureSpec(binding, spec, checkpoint, signal);
  }
  async #ensureSpec(
    binding: SiteBinding,
    spec: Json,
    checkpoint: (site: Json) => Promise<void>,
    signal?: AbortSignal,
  ): Promise<void> {
    let existing: Json | undefined;
    try {
      existing = await this.observeSite(binding, signal);
    } catch (error) {
      if (!(error instanceof CeApiError && error.category === 'not-found')) throw error;
    }
    if (!existing) {
      try {
        await this.#request(
          '/api/config/namespaces/system/securemesh_site_v2s',
          {
            method: 'POST',
            body: JSON.stringify({
              metadata: { name: binding.siteName, namespace: 'system', labels: this.#labels(binding) },
              spec,
            }),
          },
          signal,
        );
      } catch (error) {
        // A dropped response may follow a successful create. Read before any future create retry.
        if (!(error instanceof CeApiError && ['transient', 'conflict'].includes(error.category))) throw error;
      }
      existing = await this.observeSite(binding, signal);
    }
    this.#owned(existing, binding);
    if (!subset(existing.spec, spec)) throw new Error('Existing site configuration differs; replan required');
    const uid = object(existing.system_metadata).uid;
    if (typeof uid !== 'string' || !uid) throw new CeApiError('malformed');
    await checkpoint({
      siteName: binding.siteName,
      uid,
      owner: binding.owner,
      contractFingerprint: this.contract.fingerprint,
    });
  }
  async deleteSite(binding: SiteBinding, signal?: AbortSignal): Promise<void> {
    this.#binding(binding, true);
    let site: Json;
    try {
      site = await this.observeSite(binding, signal);
    } catch (error) {
      if (error instanceof CeApiError && error.category === 'not-found') return;
      throw error;
    }
    this.#owned(site, binding);
    await this.#request(this.#sitePath(binding), { method: 'DELETE' }, signal);
  }
  async bootstrap(
    binding: SiteBinding,
    node: string,
    tokenName: string,
    persistIssuedToken: (secret: { tokenName: string; siteName: string; node: string; jwt: string }) => Promise<void>,
    signal?: AbortSignal,
  ): Promise<string> {
    this.#binding(binding, true);
    if (!binding.nodes.includes(node) || !safeName.test(tokenName))
      throw new Error('Bootstrap node is not in this site');
    const policy = object(this.contract.provider(binding.owner.provider).bootstrap);
    if (
      binding.owner.provider !== 'aws' ||
      policy.mode !== 'site_bound_jwt_cloud_init' ||
      policy.headless_checkout !== 'available'
    )
      throw new Error('Cloud bootstrap has not been verified for this provider');
    this.#owned(await this.observeSite(binding, signal), binding);
    const path = `/api/register/namespaces/system/tokens/${tokenName}`;
    let token: Json | undefined;
    try {
      token = await this.#request(path, {}, signal);
    } catch (error) {
      if (!(error instanceof CeApiError && error.category === 'not-found')) throw error;
    }
    if (!token) {
      try {
        await this.#request(
          '/api/register/namespaces/system/tokens',
          {
            method: 'POST',
            body: JSON.stringify({
              metadata: {
                name: tokenName,
                namespace: 'system',
                labels: { ...this.#labels(binding), 'xcsh-ce-node': node },
              },
              spec: { type: 1, site_name: binding.siteName },
            }),
          },
          signal,
        );
      } catch (error) {
        if (!(error instanceof CeApiError && ['transient', 'conflict'].includes(error.category))) throw error;
      }
      token = await this.#request(path, {}, signal);
    }
    const metadata = object(token.metadata);
    if (
      metadata.name !== tokenName ||
      metadata.namespace !== 'system' ||
      !subset(metadata.labels, { ...this.#labels(binding), 'xcsh-ce-node': node })
    )
      throw new Error('Registration token ownership does not match node');
    const spec = object(token.spec);
    if (
      spec.site_name !== binding.siteName ||
      ![1, 'JWT'].includes(spec.type as string | number) ||
      typeof spec.content !== 'string'
    )
      throw new Error('Registration JWT is not bound to the site');
    try {
      const claims = object(JSON.parse(Buffer.from(spec.content.split('.')[1], 'base64url').toString('utf8')));
      if (typeof claims.exp !== 'number' || !Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now() + 60_000)
        throw new Error();
    } catch {
      throw new Error('Registration JWT expiry is missing or too near');
    }
    // The checkpoint is restricted secret storage, never a public plan or evidence artifact.
    await persistIssuedToken({ tokenName, siteName: binding.siteName, node, jwt: spec.content });
    const query = new URLSearchParams({
      provider: 'aws',
      site_name: binding.siteName,
      enable_management_network: 'false',
    });
    return bindAwsCloudInit(
      await this.#request(`/api/register/namespaces/system/get-cloud-init-config?${query}`, {}, signal),
      spec.content,
    );
  }
  async deleteBootstrapToken(
    binding: SiteBinding,
    node: string,
    tokenName: string,
    signal?: AbortSignal,
  ): Promise<void> {
    this.#binding(binding, true);
    if (!binding.nodes.includes(node) || !safeName.test(tokenName)) throw new Error('Bootstrap identity mismatch');
    const path = `/api/register/namespaces/system/tokens/${tokenName}`;
    let token: Json;
    try {
      token = await this.#request(path, {}, signal);
    } catch (error) {
      if (error instanceof CeApiError && error.category === 'not-found') return;
      throw error;
    }
    const metadata = object(token.metadata);
    if (
      metadata.name !== tokenName ||
      metadata.namespace !== 'system' ||
      object(token.spec).site_name !== binding.siteName ||
      !subset(metadata.labels, { ...this.#labels(binding), 'xcsh-ce-node': node })
    )
      throw new Error('Registration token ownership mismatch');
    await this.#request(path, { method: 'DELETE' }, signal);
  }
  async observeHealth(binding: SiteBinding, signal?: AbortSignal): Promise<Json> {
    this.#binding(binding);
    const source = `/api/operate/namespaces/system/sites/${binding.siteName}/vpm/debug/global/health`;
    const base = {
      owner: binding.owner,
      siteName: binding.siteName,
      nodes: binding.nodes,
      contractFingerprint: this.contract.fingerprint,
      source,
      observedAt: new Date().toISOString(),
    };
    const profile = this.contract.provider(binding.owner.provider);
    if (
      !profile.runtime ||
      object(object(profile.runtime).health).path !==
        '/api/operate/namespaces/system/sites/{site}/vpm/debug/global/health'
    )
      return { ...base, status: 'unknown', reason: 'provider-health-contract-unavailable' };
    try {
      const site = await this.observeSite(binding, signal);
      this.#owned(site, binding);
      const health = await this.#request(source, {}, signal);
      const matches = binding.nodes.filter(
        (node) =>
          health.hostname === node || (typeof health.hostname === 'string' && health.hostname.startsWith(`${node}.`)),
      );
      if (
        matches.length !== 1 ||
        typeof health.state !== 'string' ||
        !['PROVISIONED', 'PROVISIONING', 'INITIALIZING', 'FAILED', 'DEGRADED', 'NOT_PROVISIONED'].includes(health.state)
      )
        return { ...base, status: 'unknown', reason: 'health-identity-or-state-missing' };
      return {
        ...base,
        status: health.state === 'PROVISIONED' ? 'healthy' : 'degraded',
        representativeNode: matches[0],
        state: health.state,
        scope: 'site-global-only',
        nodeHealth: 'unknown',
        siteUid: object(site.system_metadata).uid,
      };
    } catch (error) {
      if (signal?.aborted) throw error;
      return {
        ...base,
        status: 'unknown',
        reason: error instanceof CeApiError ? error.category : 'ownership-or-response-invalid',
      };
    }
  }
  async observeRegistrations(
    binding: SiteBinding,
    expectedInstances: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<Json> {
    this.#binding(binding);
    const source = `/api/register/namespaces/system/registrations_by_site/${binding.siteName}`;
    const base = {
      owner: binding.owner,
      siteName: binding.siteName,
      contractFingerprint: this.contract.fingerprint,
      source,
      observedAt: new Date().toISOString(),
    };
    try {
      this.#owned(await this.observeSite(binding, signal), binding);
      const response = await this.#request(source, {}, signal);
      if (
        !Array.isArray(response.items) ||
        (response.errors !== undefined && (!Array.isArray(response.errors) || response.errors.length > 0)) ||
        response.next_page_token ||
        response.continue
      )
        return { ...base, status: 'unknown', reason: 'registration-list-incomplete' };
      const nodes = binding.nodes.map((node) => {
        const matches = (response.items as unknown[]).map(object).filter((item) => {
          const spec = object(item.get_spec);
          const state = object(object(item.object).status).current_state;
          return (
            object(spec.passport).cluster_name === binding.siteName &&
            object(spec.infra).hostname === node &&
            !['RETIRED', 'FAILED', 'DONE', 'FAILED_INACTIVE'].includes(String(state))
          );
        });
        if (matches.length !== 1)
          return {
            node,
            status: 'unknown',
            reason: matches.length ? 'ambiguous-registration' : 'registration-not-found',
          };
        const item = matches[0];
        const spec = object(item.get_spec);
        const infra = object(spec.infra);
        const state = object(object(item.object).status).current_state;
        if (
          !expectedInstances[node] ||
          infra.instance_id !== expectedInstances[node] ||
          typeof item.name !== 'string' ||
          !/^r-[a-z0-9-]+$/.test(item.name) ||
          typeof state !== 'string' ||
          !['NOTSET', 'NEW', 'APPROVED', 'ADMITTED', 'PENDING', 'ONLINE', 'UPGRADING', 'MAINTENANCE'].includes(state) ||
          object(spec.passport).cluster_size !== binding.nodes.length
        )
          return { node, status: 'unknown', reason: 'registration-resource-binding-incomplete' };
        return {
          node,
          registration: item.name,
          instanceId: infra.instance_id,
          state,
          status: state === 'ONLINE' ? 'healthy' : 'degraded',
        };
      });
      return {
        ...base,
        nodes,
        status: nodes.every((node) => node.status === 'healthy')
          ? 'healthy'
          : nodes.some((node) => node.status === 'unknown')
            ? 'unknown'
            : 'degraded',
      };
    } catch (error) {
      if (signal?.aborted) throw error;
      return {
        ...base,
        status: 'unknown',
        reason: error instanceof CeApiError ? error.category : 'ownership-or-response-invalid',
      };
    }
  }
}
