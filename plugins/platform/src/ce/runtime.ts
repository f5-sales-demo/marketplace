import { bindAwsCloudInit } from './bootstrap';
import type { CeDeploymentStore } from './deployment-store';
import type { VerifiedIngressContract } from './ingress-contract';
import { CeIngressLifecycle } from './ingress-lifecycle';
import { type InitialSiteVersions, initialSoftwareSettings } from './initial-versions';
import { correlateCeInterfaces, type ExpectedCeInterface, type ObservedCeInterface } from './interface-evidence';
import { CeOriginTeardown } from './origin-teardown';
import { type CePlatformDrainPlan, drainCePlatform } from './platform-drain';
import { correlateRegistrationDevices, verifyRegisteredInterfaceConfiguration } from './registration-devices';
import type { RoutingKind, VerifiedRoutingContract } from './routing-contract';
import type { VerifiedUpgradeContract } from './upgrade-contract';
import {
  parseSiteUpgradeState,
  parseSoftwareTargets,
  parseUpgradePrechecks,
  parseUpgradeProgress,
} from './upgrade-evidence';
import type { VerifiedCeContract } from './verified-contract';
import type { AwsGreBinding } from './wire-routing';
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
  initialVersions?: InitialSiteVersions;
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
  async observeOwnedSite(binding: SiteBinding, signal?: AbortSignal): Promise<Json> {
    const site = await this.observeSite(binding, signal);
    this.#owned(site, binding);
    return site;
  }
  /** Read-only, freshly collected version evidence; this does not authorize an upgrade. */
  async observeUpgrade(
    binding: SiteBinding,
    contract: VerifiedUpgradeContract,
    targetSoftware?: string,
    signal?: AbortSignal,
  ) {
    binding = structuredClone(binding);
    this.#binding(binding);
    if (targetSoftware !== undefined)
      contract.build({ siteName: binding.siteName, kind: 'software', version: targetSoftware });
    const source = `/api/config/namespaces/system/sites/${binding.siteName}`;
    const base = {
      owner: structuredClone(binding.owner),
      siteName: binding.siteName,
      nodes: [...binding.nodes],
      contractFingerprint: contract.fingerprint,
      siteContractFingerprint: this.contract.fingerprint,
      source,
      startedAt: new Date().toISOString(),
      targetSoftware,
    };
    try {
      const logical = await this.observeOwnedSite(binding, signal);
      const siteUid = object(logical.system_metadata).uid;
      if (typeof siteUid !== 'string' || !siteUid.trim()) throw new CeApiError('malformed');
      const physical = await this.#request(source, {}, signal);
      this.#owned(physical, binding);
      const state = parseSiteUpgradeState(physical, binding);
      // OS eligibility must use the installed software, including a preceding software upgrade.
      const selectedSoftware = targetSoftware ?? state.software.installed;
      const paths = contract.observationPaths(
        binding.siteName,
        { software: state.software.installed, os: state.os.installed },
        selectedSoftware,
      );
      const targets = parseSoftwareTargets(await this.#request(paths.targets, {}, signal));
      const prechecks = parseUpgradePrechecks(await this.#request(paths.precheck, {}, signal));
      const progress = parseUpgradeProgress(await this.#request(paths.progress, {}, signal), binding.siteName);
      // Re-read identity and state: a replacement or upgrade during collection invalidates the snapshot.
      const finalLogical = await this.observeOwnedSite(binding, signal);
      const finalPhysical = await this.#request(source, {}, signal);
      this.#owned(finalPhysical, binding);
      if (
        object(finalLogical.system_metadata).uid !== siteUid ||
        JSON.stringify(parseSiteUpgradeState(finalPhysical, binding)) !== JSON.stringify(state)
      )
        throw new CeApiError('conflict');
      return {
        ...base,
        targetSoftware: selectedSoftware,
        status: 'observed' as const,
        observedAt: new Date().toISOString(),
        sources: paths,
        siteUid,
        ...state,
        targets,
        prechecks,
        progress,
        targetSoftwareListed: targets.includes(selectedSoftware),
        nodeHealth: 'unknown' as const,
        routing: 'unknown' as const,
        traffic: 'unknown' as const,
      };
    } catch (error) {
      if (signal?.aborted) throw error;
      return {
        ...base,
        status: 'unknown' as const,
        observedAt: new Date().toISOString(),
        reason: error instanceof CeApiError ? error.category : 'ownership-or-response-invalid',
      };
    }
  }
  drainPlatform(
    plan: CePlatformDrainPlan,
    contract: VerifiedIngressContract,
    storage: CeDeploymentStore,
    signal?: AbortSignal,
  ) {
    const ingress = this.ingress(contract, storage),
      origins = this.originTeardown(contract);
    return drainCePlatform(
      plan,
      storage,
      {
        engine: this.engine,
        siteContractFingerprint: this.contract.fingerprint,
        ingressContractFingerprint: contract.fingerprint,
        observeOwnedSite: (binding, signal) => this.observeOwnedSite(binding, signal),
        deleteListener: async (listener, signal) => {
          const saved = (await storage.read(`ingress-plan-${listener.id}.json`)) as {
            request?: { metadata?: { name?: string; namespace?: string } };
          };
          if (
            saved?.request?.metadata?.name !== listener.name ||
            saved.request.metadata.namespace !== listener.namespace
          )
            throw new Error('Drain listener differs from persisted ingress plan');
          await ingress.delete(listener.id, signal);
        },
        deleteOrigin: (snapshot, listeners, signal) => origins.delete(snapshot, listeners, signal),
        deleteRouting: (binding, resource, signal) => this.deleteRouting(binding, resource, signal),
      },
      signal,
    );
  }
  originTeardown(contract: VerifiedIngressContract): CeOriginTeardown {
    return new CeOriginTeardown(
      { engine: this.engine, request: (path, init, signal) => this.#request(path, init, signal) },
      contract.fingerprint,
    );
  }
  ingress(contract: VerifiedIngressContract, storage: CeDeploymentStore): CeIngressLifecycle {
    return new CeIngressLifecycle(
      {
        engine: this.engine,
        siteFingerprint: this.contract.fingerprint,
        observeOwnedSite: (binding, signal) => this.observeOwnedSite(binding, signal),
        observeAwsInterfaces: (binding, expected, signal) => this.observeAwsInterfaces(binding, expected, signal),
        request: (path, init, signal) => this.#request(path, init, signal),
      },
      contract,
      storage,
    );
  }
  /** Schema-projected writable configuration, excluding runtime status and resource versions. */
  ownedSiteConfiguration(binding: SiteBinding, site: Json): Json {
    this.#binding(binding);
    this.#owned(site, binding);
    return this.contract.siteCreateRequest(site);
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
    if (binding.initialVersions) {
      const software = initialSoftwareSettings(binding.initialVersions);
      if (intent.settings.software_settings && !subset(intent.settings.software_settings, software))
        throw new Error('Initial versions differ from the owning site binding');
      intent = { ...intent, settings: { ...intent.settings, software_settings: software } };
    }
    const spec = this.contract.buildSite(intent);
    await this.#ensureSpec(binding, spec, checkpoint, signal);
  }
  /** Explicit owned-site replacement, including sites whose interfaces already match the plan. */
  async prepareAwsSiteReplacement(
    binding: SiteBinding,
    instances: Record<string, string>,
    expected: Array<ExpectedCeInterface & { mtu: number }>,
    signal?: AbortSignal,
  ): Promise<Json> {
    this.#binding(binding, true);
    const devices = await this.observeAwsGuestDevices(binding, instances, expected, signal);
    if (devices.status !== 'observed') throw new Error('Replacement guest interface inventory is unavailable');
    const before = await this.observeOwnedSite(binding, signal);
    verifyRegisteredInterfaceConfiguration(object(before.spec), devices.interfaces);
    const uid = object(before.system_metadata).uid;
    if (typeof uid !== 'string' || !uid || typeof before.resource_version !== 'string' || !before.resource_version)
      throw new Error('Replacement site identity and resource version are required');
    const request = this.ownedSiteConfiguration(binding, before);
    const interfaces = devices.interfaces.map((device) => {
      const desired = expected.find((item) => item.node === device.node && item.mac.toLowerCase() === device.mac);
      if (!desired || !Number.isInteger(desired.mtu) || desired.mtu < 576 || desired.mtu > 9000)
        throw new Error('Replacement interface MTU is invalid');
      return { ...device, mtu: desired.mtu };
    });
    const nodes = object(object(object(request.spec).aws).not_managed).node_list as Json[];
    for (const node of nodes)
      for (const iface of node.interface_list as Json[]) {
        const expected = interfaces.find(
          (item) => item.node === node.hostname && item.mac === object(iface.ethernet_interface).mac,
        );
        if (!expected) throw new Error('Replacement interface identity differs');
        iface.mtu = expected.mtu;
      }
    this.contract.validateSiteCreate(request);
    return {
      owner: structuredClone(binding.owner),
      siteName: binding.siteName,
      uid,
      resourceVersion: before.resource_version,
      contractFingerprint: this.contract.fingerprint,
      instances: { ...instances },
      interfaces,
      request,
      source: this.#sitePath(binding),
      deviceSource: devices.source,
      evidenceKind: 'owned-site-replacement',
      observedAt: new Date().toISOString(),
    };
  }
  /** Recreate only after the owning cloud adapter has quiesced the recorded nodes and removed the old site. */
  async ensureAwsPreparedSite(
    binding: SiteBinding,
    preparation: Json,
    checkpoint: (site: Json) => Promise<void>,
    signal?: AbortSignal,
  ): Promise<void> {
    this.#binding(binding, true);
    const request = object(preparation.request);
    if (
      binding.owner.provider !== 'aws' ||
      !subset(preparation.owner, binding.owner) ||
      preparation.contractFingerprint !== this.contract.fingerprint ||
      preparation.siteName !== binding.siteName ||
      !['preboot-interface-configuration-required', 'owned-site-replacement'].includes(
        String(preparation.evidenceKind),
      ) ||
      typeof preparation.uid !== 'string' ||
      !preparation.uid
    )
      throw new Error('Prepared site ownership, contract or identity differs');
    this.#owned(request, binding);
    this.contract.validateSiteCreate(request);
    if (
      binding.initialVersions &&
      !subset(object(request.spec).software_settings, initialSoftwareSettings(binding.initialVersions))
    )
      throw new Error('Prepared site initial versions differ from the owning binding');
    const interfaces = preparation.interfaces as Array<ExpectedCeInterface & { device: string; mtu: number }>;
    if (
      !Array.isArray(interfaces) ||
      interfaces.some((item) => !binding.nodes.includes(item.node)) ||
      new Set(interfaces.map((item) => item.node)).size !== binding.nodes.length
    )
      throw new Error('Prepared site nodes differ from deployment');
    verifyRegisteredInterfaceConfiguration(object(request.spec), interfaces);
    const nodes = object(object(object(request.spec).aws).not_managed).node_list as Json[];
    for (const node of nodes)
      for (const iface of node.interface_list as Json[]) {
        const expected = interfaces.find(
          (item) => item.node === node.hostname && item.mac === object(iface.ethernet_interface).mac,
        );
        if (
          !expected ||
          !Number.isInteger(expected.mtu) ||
          expected.mtu < 576 ||
          expected.mtu > 9000 ||
          iface.mtu !== expected.mtu
        )
          throw new Error('Prepared MTU differs from the replacement requirement');
      }
    let existing: Json | undefined;
    try {
      existing = await this.observeSite(binding, signal);
    } catch (error) {
      if (!(error instanceof CeApiError && error.category === 'not-found')) throw error;
    }
    if (existing && object(existing.system_metadata).uid === preparation.uid)
      throw new Error('Original site still exists; coupled replacement has not removed it');
    await this.#ensureSpec(binding, object(request.spec), checkpoint, signal, object(request.metadata));
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
      ...(binding.initialVersions ? { software_settings: initialSoftwareSettings(binding.initialVersions) } : {}),
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
    metadata?: Json,
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
              metadata: metadata ?? { name: binding.siteName, namespace: 'system', labels: this.#labels(binding) },
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
    if (metadata && !subset(existing.metadata, metadata))
      throw new Error('Existing site metadata differs; replan required');
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
  requireAwsRoutingContract(): void {
    if (!this.contract.awsRoutingAvailable)
      throw new Error('Pinned AWS routing schemas are required before deployment');
  }
  async observeAwsGuestDevices(
    binding: SiteBinding,
    expectedInstances: Record<string, string>,
    expected: ExpectedCeInterface[],
    signal?: AbortSignal,
  ) {
    this.#binding(binding);
    const source = `/api/register/namespaces/system/registrations_by_site/${binding.siteName}`;
    const base = {
      owner: binding.owner,
      siteName: binding.siteName,
      source,
      observedAt: new Date().toISOString(),
      evidenceKind: 'registration-hardware-inventory' as const,
    };
    try {
      if (
        binding.owner.provider !== 'aws' ||
        Object.keys(expectedInstances).length !== binding.nodes.length ||
        binding.nodes.some((node) => !Object.hasOwn(expectedInstances, node))
      )
        throw new Error('Registration inventory scope differs');
      this.#owned(await this.observeSite(binding, signal), binding);
      const response = await this.#request(source, {}, signal);
      const interfaces = correlateRegistrationDevices(response, binding.siteName, expectedInstances, expected);
      return { ...base, status: 'observed' as const, interfaces };
    } catch (error) {
      if (signal?.aborted) throw error;
      return { ...base, status: 'unknown' as const, interfaces: [] };
    }
  }
  async observeAwsRegisteredConfiguration(
    binding: SiteBinding,
    expectedInstances: Record<string, string>,
    expected: ExpectedCeInterface[],
    signal?: AbortSignal,
  ) {
    const evidence = await this.observeAwsGuestDevices(binding, expectedInstances, expected, signal);
    if (evidence.status !== 'observed') return { ...evidence, status: 'unknown' as const };
    try {
      const configuration = await this.observeSite(binding, signal);
      this.#owned(configuration, binding);
      verifyRegisteredInterfaceConfiguration(object(configuration.spec), evidence.interfaces);
      const uid = object(configuration.system_metadata).uid;
      if (typeof uid !== 'string' || !uid) throw new CeApiError('malformed');
      return {
        ...evidence,
        configurationSource: this.#sitePath(binding),
        siteUid: uid,
        observedAt: new Date().toISOString(),
        status: 'configured' as const,
      };
    } catch (error) {
      if (signal?.aborted) throw error;
      return { ...evidence, status: 'unknown' as const };
    }
  }
  async ensureAwsInterfaceMtu(
    binding: SiteBinding,
    instances: Record<string, string>,
    expected: Array<ExpectedCeInterface & { mtu: number }>,
    checkpoint: (record: Json) => Promise<void>,
    signal?: AbortSignal,
  ): Promise<void> {
    this.#binding(binding, true);
    if (expected.some((item) => !Number.isInteger(item.mtu) || item.mtu < 576 || item.mtu > 9000))
      throw new Error('Explicit supported interface MTU is required');
    const devices = await this.observeAwsGuestDevices(binding, instances, expected, signal);
    if (devices.status !== 'observed') throw new Error('Guest interface inventory has not converged');
    const before = await this.observeSite(binding, signal);
    this.#owned(before, binding);
    verifyRegisteredInterfaceConfiguration(object(before.spec), devices.interfaces);
    const uid = object(before.system_metadata).uid;
    if (typeof uid !== 'string' || !uid) throw new CeApiError('malformed');
    const nodes = object(object(object(before.spec).aws).not_managed).node_list as Json[];
    const matches = (node: Json, iface: Json) => {
      const ethernet = object(iface.ethernet_interface);
      return expected.find((item) => item.node === node.hostname && item.mac.toLowerCase() === ethernet.mac);
    };
    const changed = nodes.some((node) =>
      (node.interface_list as Json[]).some((iface) => iface.mtu !== matches(node, iface)?.mtu),
    );
    if (changed) {
      if (typeof before.resource_version !== 'string' || !before.resource_version)
        throw new Error('Site resource version is required for an interface update');
      const request = this.contract.siteCreateRequest(before);
      const desiredNodes = object(object(object(request.spec).aws).not_managed).node_list as Json[];
      for (const node of desiredNodes)
        for (const iface of node.interface_list as Json[]) {
          const desired = matches(node, iface);
          if (!desired) throw new Error('Preboot interface identity differs from observed inventory');
          iface.mtu = desired.mtu;
        }
      this.contract.validateSiteCreate(request);
      await checkpoint({
        owner: binding.owner,
        siteName: binding.siteName,
        uid,
        contractFingerprint: this.contract.fingerprint,
        resourceVersion: before.resource_version,
        instances: { ...instances },
        interfaces: devices.interfaces.map((device) => ({
          ...device,
          mtu: expected.find((item) => item.node === device.node && item.mac.toLowerCase() === device.mac)?.mtu,
        })),
        source: this.#sitePath(binding),
        deviceSource: `/api/register/namespaces/system/registrations_by_site/${binding.siteName}`,
        request,
        evidenceKind: 'preboot-interface-configuration-required',
        observedAt: new Date().toISOString(),
        packetMtu: 'unknown',
      });
      throw new Error('AWS interface MTU requires coupled VM/site replacement with configuration before registration');
    }
    await checkpoint({
      owner: binding.owner,
      siteName: binding.siteName,
      uid,
      contractFingerprint: this.contract.fingerprint,
      interfaces: expected,
      source: this.#sitePath(binding),
      evidenceKind: 'configured-mtu',
      observedAt: new Date().toISOString(),
      packetMtu: 'unknown',
    });
  }
  async observeAwsInterfaces(
    binding: SiteBinding,
    expected: ExpectedCeInterface[],
    signal?: AbortSignal,
  ): Promise<{ status: 'observed' | 'unknown'; interfaces: ObservedCeInterface[]; observedAt: string }> {
    this.#binding(binding);
    const observedAt = new Date().toISOString();
    try {
      if (binding.owner.provider !== 'aws' || expected.some((item) => !binding.nodes.includes(item.node)))
        throw new Error('Interface binding differs from site');
      const configuration = await this.observeSite(binding, signal);
      this.#owned(configuration, binding);
      const objects = await this.#request(
        '/api/config/namespaces/system/network_interfaces?report_fields=get_spec&report_fields=system_metadata',
        {},
        signal,
      );
      const physical = await this.#request(`/api/config/namespaces/system/sites/${binding.siteName}`, {}, signal);
      return {
        status: 'observed',
        interfaces: correlateCeInterfaces(configuration, objects, physical, expected),
        observedAt,
      };
    } catch (error) {
      if (signal?.aborted) throw error;
      return { status: 'unknown', interfaces: [], observedAt };
    }
  }
  async ensureAwsRouting(
    binding: SiteBinding,
    localAsn: number,
    remoteAsn: number,
    interfaces: AwsGreBinding[],
    checkpoint: (resource: Json) => Promise<void>,
    signal?: AbortSignal,
    rebind?: {
      contract: VerifiedRoutingContract;
      siteUid: string;
      resources: { kind: RoutingKind; name: string; uid: string }[];
    },
  ): Promise<void> {
    this.#binding(binding, true);
    if (binding.owner.provider !== 'aws' || interfaces.some((item) => !binding.nodes.includes(item.node)))
      throw new Error('AWS routing interface and site ownership differ');
    this.#owned(await this.observeSite(binding, signal), binding);
    const routing = this.contract.buildAwsRouting(binding.siteName, localAsn, remoteAsn, interfaces);
    if (rebind) {
      const expected = [...routing.connectors.map((r) => `external_connector/${r.name}`), `bgp/${routing.bgp.name}`];
      const recorded = rebind.resources.map((r) => `${r.kind}/${r.name}`);
      if (
        !rebind.siteUid.trim() ||
        recorded.length !== expected.length ||
        new Set(recorded).size !== recorded.length ||
        expected.some((key) => !recorded.includes(key)) ||
        rebind.resources.some((r) => !r.uid.trim())
      )
        throw new Error('Exact replacement routing inventory required');
    }

    for (const [kind, resources] of [
      ['external_connector', routing.connectors],
      ['bgp', [routing.bgp]],
    ] as const)
      for (const resource of resources) {
        const path = `/api/config/namespaces/system/${kind}s/${resource.name}`;
        const observe = () => this.#request(path, {}, signal);
        let existing: Json | undefined;
        try {
          existing = await observe();
        } catch (error) {
          if (!(error instanceof CeApiError && error.category === 'not-found')) throw error;
        }
        if (!existing && rebind) throw new Error('Recorded replacement routing object is missing');
        if (!existing) {
          // Revalidate site ownership at each child-object mutation boundary.
          this.#owned(await this.observeSite(binding, signal), binding);
          this.contract.validateRouting(kind, resource.spec);
          try {
            await this.#request(
              `/api/config/namespaces/system/${kind}s`,
              {
                method: 'POST',
                body: JSON.stringify({
                  metadata: {
                    name: resource.name,
                    namespace: 'system',
                    labels: { ...this.#labels(binding), 'xcsh-ce-site': binding.siteName },
                  },
                  spec: resource.spec,
                }),
              },
              signal,
            );
          } catch (error) {
            if (!(error instanceof CeApiError && ['transient', 'conflict'].includes(error.category))) throw error;
          }
          existing = await observe();
        }
        this.#owned(existing, { ...binding, siteName: resource.name });
        if (
          object(object(existing.metadata).labels)['xcsh-ce-site'] !== binding.siteName ||
          !subset(existing.spec, resource.spec)
        )
          throw new Error('Existing routing object differs from site-bound intent; replan required');
        const uid = object(existing.system_metadata).uid;
        if (typeof uid !== 'string' || !uid) throw new CeApiError('malformed');
        if (rebind) {
          const recorded = rebind.resources.find((r) => r.kind === kind && r.name === resource.name);
          if (uid !== recorded?.uid) throw new Error('Replacement routing object UID changed');
          const site = await this.observeSite(binding, signal);
          this.#owned(site, binding);
          if (object(site.system_metadata).uid !== rebind.siteUid) throw new Error('Replacement site UID changed');
          if (object(object(existing.metadata).labels)['xcsh-ce-site-uid'] !== rebind.siteUid) {
            const body = rebind.contract.build(kind, existing, resource.spec, rebind.siteUid);
            // Durable intent precedes the mutation. A lost response is reconciled by exact UID and label.
            await checkpoint({
              kind,
              name: resource.name,
              uid,
              siteName: binding.siteName,
              owner: binding.owner,
              siteUid: rebind.siteUid,
              phase: 'rebind-pending',
              contractFingerprint: rebind.contract.fingerprint,
            });
            const freshSite = await this.observeSite(binding, signal);
            this.#owned(freshSite, binding);
            if (object(freshSite.system_metadata).uid !== rebind.siteUid)
              throw new Error('Replacement site UID changed');
            const fresh = await observe();
            this.#owned(fresh, { ...binding, siteName: resource.name });
            if (
              object(fresh.system_metadata).uid !== uid ||
              fresh.resource_version !== existing.resource_version ||
              !subset(fresh.metadata, existing.metadata) ||
              !subset(existing.metadata, fresh.metadata) ||
              !subset(fresh.spec, existing.spec) ||
              !subset(existing.spec, fresh.spec)
            )
              throw new Error('Routing changed before replacement rebind');
            try {
              await this.#request(path, { method: 'PUT', body: JSON.stringify(body) }, signal);
            } catch (error) {
              if (!(error instanceof CeApiError && ['transient', 'conflict'].includes(error.category))) throw error;
            }
            existing = await observe();
            this.#owned(existing, { ...binding, siteName: resource.name });
            if (
              object(existing.system_metadata).uid !== uid ||
              object(object(existing.metadata).labels)['xcsh-ce-site-uid'] !== rebind.siteUid ||
              !subset(existing.spec, resource.spec)
            )
              throw new Error('Routing replacement readback differs');
          }
        }
        await checkpoint({
          kind,
          name: resource.name,
          siteName: binding.siteName,
          uid,
          owner: binding.owner,
          contractFingerprint: this.contract.fingerprint,
        });
      }
  }
  /** Remove only a routing object recorded for this exact owned site. */
  async deleteRouting(
    binding: SiteBinding,
    resource: { kind: 'bgp' | 'external_connector'; name: string; uid: string },
    signal?: AbortSignal,
  ): Promise<void> {
    this.#binding(binding, true);
    if (
      !['bgp', 'external_connector'].includes(resource.kind) ||
      !safeName.test(resource.name) ||
      typeof resource.uid !== 'string' ||
      !resource.uid.trim()
    )
      throw new Error('Exact routing kind, name and checkpoint UID required');
    const path = `/api/config/namespaces/system/${resource.kind}s/${resource.name}`;
    let existing: Json;
    try {
      existing = await this.#request(path, {}, signal);
    } catch (error) {
      if (error instanceof CeApiError && error.category === 'not-found') return;
      throw error;
    }
    this.#owned(existing, { ...binding, siteName: resource.name });
    if (
      object(existing.system_metadata).uid !== resource.uid ||
      object(object(existing.metadata).labels)['xcsh-ce-site'] !== binding.siteName
    )
      throw new Error('Routing checkpoint UID or site ownership differs');
    await this.observeOwnedSite(binding, signal);
    await this.#request(path, { method: 'DELETE' }, signal);
    try {
      await this.#request(path, {}, signal);
    } catch (error) {
      if (error instanceof CeApiError && error.category === 'not-found') return;
      throw error;
    }
    throw new Error('Routing deletion is still converging; resume teardown');
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
  /** Teardown mutation bound to the recorded logical UID, with ambiguous-response readback. */
  async deleteSiteExact(binding: SiteBinding, expectedUid: string, signal?: AbortSignal) {
    this.#binding(binding, true);
    signal?.throwIfAborted();
    if (typeof expectedUid !== 'string' || !expectedUid.trim()) throw new Error('Exact site UID required for deletion');
    const source = this.#sitePath(binding);
    const read = async () => {
      try {
        return await this.#request(source, {}, signal);
      } catch (error) {
        if (error instanceof CeApiError && error.category === 'not-found') return undefined;
        throw error;
      }
    };
    const check = (site: Json) => {
      this.#owned(site, binding);
      if (object(site.system_metadata).uid !== expectedUid)
        throw new Error('Site UID changed before or during deletion');
    };
    let current = await read();
    if (current) {
      check(current);
      try {
        await this.#request(source, { method: 'DELETE' }, signal);
      } catch (error) {
        if (!(error instanceof CeApiError) || !['not-found', 'transient', 'deadline'].includes(error.category))
          throw error;
      }
      current = await read();
      if (current) check(current);
    }
    return {
      status: current ? ('pending' as const) : ('deleted' as const),
      owner: binding.owner,
      siteName: binding.siteName,
      siteUid: expectedUid,
      source,
      contractFingerprint: this.contract.fingerprint,
      observedAt: new Date().toISOString(),
    };
  }
  /** Logical deletion alone does not prove physical-site and registration retirement. */
  async observeSiteDeletion(
    binding: SiteBinding,
    expected: { siteUid: string; physicalSiteUid: string },
    signal?: AbortSignal,
  ) {
    this.#binding(binding);
    signal?.throwIfAborted();
    if (![expected.siteUid, expected.physicalSiteUid].every((uid) => typeof uid === 'string' && uid.trim()))
      throw new Error('Logical and physical site UIDs are required for deletion observation');
    const sources = {
      logical: this.#sitePath(binding),
      physical: `/api/config/namespaces/system/sites/${binding.siteName}`,
      registrations: `/api/register/namespaces/system/registrations_by_site/${binding.siteName}`,
    };
    const base = {
      owner: binding.owner,
      siteName: binding.siteName,
      ...expected,
      sources,
      contractFingerprint: this.contract.fingerprint,
    };
    const read = async (path: string) => {
      try {
        return await this.#request(path, {}, signal);
      } catch (error) {
        if (error instanceof CeApiError && error.category === 'not-found') return undefined;
        throw error;
      }
    };
    try {
      const logical = await read(sources.logical);
      if (logical) {
        this.#owned(logical, binding);
        if (object(logical.system_metadata).uid !== expected.siteUid) throw new Error('Logical site identity changed');
      }
      const physical = await read(sources.physical);
      if (
        physical &&
        (object(physical.metadata).name !== binding.siteName ||
          object(physical.metadata).namespace !== 'system' ||
          object(physical.system_metadata).uid !== expected.physicalSiteUid)
      )
        throw new Error('Physical site identity changed');
      const registrations = await read(sources.registrations);
      let activeRegistrations = 0;
      if (registrations) {
        if (
          !Array.isArray(registrations.items) ||
          registrations.next_page_token ||
          registrations.next_token ||
          registrations.continuation_token ||
          registrations.continue ||
          registrations.nextLink ||
          (registrations.errors !== undefined && (!Array.isArray(registrations.errors) || registrations.errors.length))
        )
          throw new Error('Incomplete registration retirement evidence');
        const seen = new Set<string>();
        const inactive = ['RETIRED', 'FAILED', 'DONE', 'FAILED_INACTIVE'];
        const active = ['NOTSET', 'NEW', 'APPROVED', 'ADMITTED', 'PENDING', 'ONLINE', 'UPGRADING', 'MAINTENANCE'];
        for (const raw of registrations.items) {
          const item = object(raw),
            spec = object(item.get_spec),
            state = object(object(item.object).status).current_state;
          if (
            typeof item.name !== 'string' ||
            !/^r-[a-z0-9-]+$/.test(item.name) ||
            seen.has(item.name) ||
            object(spec.passport).cluster_name !== binding.siteName ||
            !binding.nodes.includes(String(object(spec.infra).hostname)) ||
            typeof state !== 'string' ||
            ![...inactive, ...active].includes(state)
          )
            throw new Error('Registration retirement identity is malformed or foreign');
          seen.add(item.name);
          if (active.includes(state)) activeRegistrations++;
        }
      }
      return {
        ...base,
        status: !logical && !physical && activeRegistrations === 0 ? ('deleted' as const) : ('pending' as const),
        logicalAbsent: !logical,
        physicalAbsent: !physical,
        activeRegistrations,
        observedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (signal?.aborted) throw error;
      return {
        ...base,
        status: 'unknown' as const,
        reason: error instanceof CeApiError ? error.category : 'identity-or-response-invalid',
        observedAt: new Date().toISOString(),
      };
    }
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
    signal?.throwIfAborted();
    try {
      await this.#request(path, { method: 'DELETE' }, signal);
    } catch (error) {
      if (!(error instanceof CeApiError) || !['not-found', 'transient', 'deadline'].includes(error.category))
        throw error;
    }
    try {
      await this.#request(path, {}, signal);
    } catch (error) {
      if (error instanceof CeApiError && error.category === 'not-found') return;
      throw error;
    }
    throw new Error('Registration token deletion is still converging; resume revocation');
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
          (state !== 'NEW' && object(spec.passport).cluster_size !== binding.nodes.length)
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
  async approveRegistrations(
    binding: SiteBinding,
    expectedInstances: Record<string, string>,
    checkpoint: (record: Json) => Promise<void>,
    signal?: AbortSignal,
  ): Promise<Json> {
    this.#binding(binding, true);
    const observation = await this.observeRegistrations(binding, expectedInstances, signal);
    if (!Array.isArray(observation.nodes)) return observation;
    for (const value of observation.nodes) {
      const node = object(value);
      if (node.state !== 'NEW' || typeof node.registration !== 'string' || typeof node.node !== 'string') continue;
      this.#owned(await this.observeSite(binding, signal), binding);
      const path = `/api/register/namespaces/system/registrations/${node.registration}`;
      const source = await this.#request(path, {}, signal);
      const nested = (...paths: string[]): unknown => {
        for (const candidate of paths) {
          let current: unknown = source;
          for (const segment of candidate.split('.'))
            current = current && typeof current === 'object' ? (current as Json)[segment] : undefined;
          if (current !== undefined) return current;
        }
        return undefined;
      };
      const passport = object(nested('object.spec.gc_spec.passport', 'spec.gc_spec.passport', 'spec.passport'));
      const state = nested(
        'object.status.current_state',
        'object.status.state',
        'status.current_state',
        'status.state',
        'state',
      );
      if (passport.cluster_name !== binding.siteName) throw new Error('Registration passport belongs to another site');
      if (state !== 'NEW') continue;
      const record = {
        siteName: binding.siteName,
        node: node.node,
        registration: node.registration,
        instanceId: node.instanceId,
        action: 'approve-registration',
      };
      await checkpoint({ ...record, state: 'requested' });
      await this.#request(
        `/api/register/namespaces/system/registration/${node.registration}/approve`,
        {
          method: 'POST',
          body: JSON.stringify({
            namespace: 'system',
            name: node.registration,
            state: 'APPROVED',
            passport: { ...passport, cluster_size: binding.nodes.length },
          }),
        },
        signal,
      );
      await checkpoint({ ...record, state: 'submitted' });
    }
    return this.observeRegistrations(binding, expectedInstances, signal);
  }
}
