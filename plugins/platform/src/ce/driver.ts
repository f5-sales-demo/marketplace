import { isAbsolute } from 'node:path';

export interface CeV2Capabilities {
  smsv2ContractVersion: 'v2';
  supportedProviders: Array<'aws' | 'azure'>;
  bootstrapDrivers: Array<'api' | 'console'>;
  providerNetworkingProfiles: Partial<Record<'aws' | 'azure', string[]>>;
  awsSmsv2TgwConnect: { supported: boolean; schemaVersion: string | null };
}

export interface CeV2InterfaceAddressing {
  mode: 'dhcp' | 'static';
  addresses: string[];
  gateway?: string;
}

export interface CeV2Interface {
  index: number;
  role: 'slo' | 'sli' | 'management' | 'service' | 'workload';
  vrf: string;
  addressing: CeV2InterfaceAddressing;
}

export interface CeV2Vrf {
  index: number;
  name: string;
}

export interface CeV2BgpPeer {
  index: number;
  vrf: string;
  interfaceIndex: number;
  peerAddress: string;
  localAsn: number;
  peerAsn: number;
}

export interface CeV2SiteConfig {
  provider: 'aws' | 'azure';
  haMode: 'one-node' | 'three-node';
  interfaces: CeV2Interface[];
  vrfs: CeV2Vrf[];
  bgpPeers: CeV2BgpPeer[];
  providerNetwork: {
    profile: string;
    metadata: Record<string, string | number | boolean | string[]>;
  };
}

export interface CeV2SiteRequest {
  namespace: string;
  siteName: string;
  config?: CeV2SiteConfig;
  expectedEtag?: string;
}

export interface CeV2Driver {
  capabilities(): Promise<CeV2Capabilities>;
  site(action: 'create' | 'read' | 'update' | 'delete', request: CeV2SiteRequest): Promise<Record<string, unknown>>;
  checkoutBootstrap(
    request: CeV2SiteRequest & { nodeName: string; expiresInSeconds: number },
    allowConsole: boolean,
  ): Promise<{ token: string; driver: 'api' | 'console' }>;
  status(request: CeV2SiteRequest): Promise<Record<string, unknown>>;
}

interface CapabilityDocument extends CeV2Capabilities {
  endpoints: {
    siteCollection: string;
    siteItem: string;
    bootstrapCheckout?: string;
    status: string;
  };
  consoleFallback?: boolean;
}

const SAFE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$/;
const SAFE_SCHEMA = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,127}$/;
const LEGACY_CE_ROUTE = /(?:azure.?vnet|fleet|registration.?token|site.?token|shared.?token)/i;
const PROVIDERS = new Set(['aws', 'azure']);
const BOOTSTRAP_DRIVERS = new Set(['api', 'console']);
const NETWORKING_PROFILES = {
  aws: new Set(['direct-eni', 'nlb-ingress', 'tgw-static', 'tgw-connect']),
  azure: new Set(['direct-nic', 'load-balancer-ingress', 'route-server-bgp']),
} as const;

export class HttpCeV2Driver implements CeV2Driver {
  readonly #base: URL;
  readonly #apiToken: string | undefined;
  readonly #capabilityUrl: URL;
  readonly #consoleHelper: string | undefined;
  #document?: CapabilityDocument;

  constructor(env: Record<string, string | undefined> = process.env) {
    if (!env.F5XC_API_URL) throw new Error('F5XC_API_URL is required');
    this.#base = new URL(env.F5XC_API_URL);
    if (this.#base.protocol !== 'https:' && this.#base.hostname !== 'localhost' && this.#base.hostname !== '127.0.0.1')
      throw new Error('F5XC_API_URL must use HTTPS');
    this.#apiToken = env.F5XC_API_TOKEN;
    this.#capabilityUrl = new URL(
      env.F5XC_CE_V2_CAPABILITIES_URL ?? '/api/web/capabilities/secure-mesh-site-v2',
      this.#base,
    );
    if (this.#capabilityUrl.origin !== this.#base.origin)
      throw new Error('CE v2 capability URL must use the tenant origin');
    this.#consoleHelper = env.XCSH_F5XC_CE_CONSOLE_HELPER;
  }

  async #request(url: URL, init: RequestInit = {}): Promise<Record<string, unknown>> {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (init.body) headers.set('Content-Type', 'application/json');
    if (this.#apiToken) headers.set('Authorization', `APIToken ${this.#apiToken}`);
    const response = await fetch(url, { ...init, headers });
    if (!response.ok) throw new Error(`F5 CE v2 API request failed with HTTP ${response.status}`);
    const text = await response.text();
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  }

  async #capabilityDocument(): Promise<CapabilityDocument> {
    if (this.#document) return this.#document;
    const raw = await this.#request(this.#capabilityUrl);
    const endpoints = raw.endpoints as CapabilityDocument['endpoints'] | undefined;
    const providers = raw.supportedProviders;
    const bootstrapDrivers = raw.bootstrapDrivers;
    const profiles = raw.providerNetworkingProfiles;
    const tgwConnect = raw.awsSmsv2TgwConnect;
    if (
      raw.smsv2ContractVersion !== 'v2' ||
      !Array.isArray(providers) ||
      providers.length < 1 ||
      providers.some((provider) => typeof provider !== 'string' || !PROVIDERS.has(provider)) ||
      new Set(providers).size !== providers.length ||
      !Array.isArray(bootstrapDrivers) ||
      bootstrapDrivers.length < 1 ||
      bootstrapDrivers.some((driver) => typeof driver !== 'string' || !BOOTSTRAP_DRIVERS.has(driver)) ||
      new Set(bootstrapDrivers).size !== bootstrapDrivers.length ||
      !profiles ||
      typeof profiles !== 'object' ||
      !tgwConnect ||
      typeof tgwConnect !== 'object' ||
      typeof (tgwConnect as Record<string, unknown>).supported !== 'boolean' ||
      !endpoints?.siteCollection ||
      !endpoints.siteItem ||
      !endpoints.status
    )
      throw new Error('Tenant does not advertise the required Secure Mesh Site v2 capability contract');
    const canonicalProfiles: Partial<Record<'aws' | 'azure', string[]>> = {};
    for (const provider of providers as Array<'aws' | 'azure'>) {
      const providerProfiles = (profiles as Record<string, unknown>)[provider];
      if (
        !Array.isArray(providerProfiles) ||
        providerProfiles.length < 1 ||
        providerProfiles.some(
          (profile) => typeof profile !== 'string' || !NETWORKING_PROFILES[provider].has(profile as never),
        ) ||
        new Set(providerProfiles).size !== providerProfiles.length
      )
        throw new Error('Tenant does not advertise the required Secure Mesh Site v2 capability contract');
      canonicalProfiles[provider] = [...providerProfiles].sort() as string[];
    }
    const supported = (tgwConnect as Record<string, unknown>).supported as boolean;
    const schemaVersion = (tgwConnect as Record<string, unknown>).schemaVersion;
    const awsProfiles = canonicalProfiles.aws ?? [];
    if (
      (supported &&
        (!providers.includes('aws') ||
          !awsProfiles.includes('tgw-connect') ||
          typeof schemaVersion !== 'string' ||
          !SAFE_SCHEMA.test(schemaVersion))) ||
      (!supported && schemaVersion !== null) ||
      (awsProfiles.includes('tgw-connect') && !supported) ||
      (bootstrapDrivers.includes('api') && !endpoints.bootstrapCheckout)
    )
      throw new Error('Tenant does not advertise the required Secure Mesh Site v2 capability contract');
    for (const endpoint of Object.values(endpoints))
      if (endpoint) this.#endpoint(endpoint, { namespace: 'system', site: 'capability-check' });
    this.#document = {
      smsv2ContractVersion: 'v2',
      supportedProviders: [...(providers as Array<'aws' | 'azure'>)].sort(),
      bootstrapDrivers: [...(bootstrapDrivers as Array<'api' | 'console'>)].sort(),
      providerNetworkingProfiles: canonicalProfiles,
      awsSmsv2TgwConnect: { supported, schemaVersion: supported ? (schemaVersion as string) : null },
      endpoints,
      consoleFallback: Boolean(raw.consoleFallback),
    };
    return this.#document;
  }

  #endpoint(template: string, values: { namespace: string; site: string }): URL {
    if (!SAFE_NAME.test(values.namespace) || !SAFE_NAME.test(values.site))
      throw new Error('Invalid namespace or site name');
    const path = template
      .replaceAll('{namespace}', encodeURIComponent(values.namespace))
      .replaceAll('{site}', encodeURIComponent(values.site));
    const url = new URL(path, this.#base);
    if (url.origin !== this.#base.origin) throw new Error('CE v2 endpoint substitution changed tenant origin');
    if (LEGACY_CE_ROUTE.test(url.pathname))
      throw new Error('Tenant capability document advertised a removed legacy CE endpoint');
    return url;
  }

  async capabilities(): Promise<CeV2Capabilities> {
    const document = await this.#capabilityDocument();
    return {
      smsv2ContractVersion: document.smsv2ContractVersion,
      supportedProviders: document.supportedProviders,
      bootstrapDrivers: document.bootstrapDrivers.filter(
        (driver) => driver !== 'console' || Boolean(document.consoleFallback && this.#consoleHelper),
      ),
      providerNetworkingProfiles: document.providerNetworkingProfiles,
      awsSmsv2TgwConnect: document.awsSmsv2TgwConnect,
    };
  }

  async site(
    action: 'create' | 'read' | 'update' | 'delete',
    request: CeV2SiteRequest,
  ): Promise<Record<string, unknown>> {
    const document = await this.#capabilityDocument();
    const values = { namespace: request.namespace, site: request.siteName };
    const collection = this.#endpoint(document.endpoints.siteCollection, values);
    const item = this.#endpoint(document.endpoints.siteItem, values);
    if (action === 'read') return this.#request(item);
    if (action === 'delete')
      return this.#request(item, {
        method: 'DELETE',
        headers: request.expectedEtag ? { 'If-Match': request.expectedEtag } : undefined,
      });
    return this.#request(action === 'create' ? collection : item, {
      method: action === 'create' ? 'POST' : 'PUT',
      headers: request.expectedEtag ? { 'If-Match': request.expectedEtag } : undefined,
      body: JSON.stringify({
        metadata: { name: request.siteName, namespace: request.namespace },
        spec: request.config ?? {},
      }),
    });
  }

  async checkoutBootstrap(
    request: CeV2SiteRequest & { nodeName: string; expiresInSeconds: number },
    allowConsole: boolean,
  ): Promise<{ token: string; driver: 'api' | 'console' }> {
    const document = await this.#capabilityDocument();
    if (document.bootstrapDrivers.includes('api') && document.endpoints.bootstrapCheckout) {
      const response = await this.#request(
        this.#endpoint(document.endpoints.bootstrapCheckout, { namespace: request.namespace, site: request.siteName }),
        {
          method: 'POST',
          body: JSON.stringify({ node_name: request.nodeName, expires_in_seconds: request.expiresInSeconds }),
        },
      );
      const token = response.token ?? response.bootstrap_token;
      if (typeof token !== 'string' || !token) throw new Error('CE v2 bootstrap API returned no one-use token');
      return { token, driver: 'api' };
    }
    if (!allowConsole) throw new Error('Headless bootstrap checkout cannot use interactive console fallback');
    if (!document.consoleFallback || !this.#consoleHelper)
      throw new Error('Tenant has no supported CE v2 bootstrap checkout capability');
    if (!isAbsolute(this.#consoleHelper)) throw new Error('Console bootstrap helper path must be absolute');
    const proc = Bun.spawn([this.#consoleHelper], { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe', env: process.env });
    proc.stdin.write(
      JSON.stringify({
        action: 'secure-mesh-site-v2-bootstrap',
        namespace: request.namespace,
        siteName: request.siteName,
        nodeName: request.nodeName,
        expiresInSeconds: request.expiresInSeconds,
      }),
    );
    proc.stdin.end();
    const stdout = await new Response(proc.stdout).text();
    await new Response(proc.stderr).text();
    if ((await proc.exited) !== 0) throw new Error('Authenticated console bootstrap automation failed');
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(stdout) as Record<string, unknown>;
    } catch {
      throw new Error('Console bootstrap automation returned an invalid response');
    }
    if (typeof parsed.token !== 'string' || !parsed.token)
      throw new Error('Console bootstrap automation returned no one-use token');
    return { token: parsed.token, driver: 'console' };
  }

  async status(request: CeV2SiteRequest): Promise<Record<string, unknown>> {
    const document = await this.#capabilityDocument();
    return this.#request(
      this.#endpoint(document.endpoints.status, { namespace: request.namespace, site: request.siteName }),
    );
  }
}

export function createDefaultCeV2Driver(): CeV2Driver {
  return new HttpCeV2Driver();
}
