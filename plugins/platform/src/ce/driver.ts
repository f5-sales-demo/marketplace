import { isAbsolute } from 'node:path';
import { resolveSmsv2AwsReleaseContract } from './release-contract';

export interface CeV2Capabilities {
  smsv2ContractVersion: 'v2';
  supportedProviders: Array<'aws' | 'azure'>;
  bootstrapDrivers: Array<'console'>;
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
  ): Promise<{ token: string; driver: 'console' }>;
  status(request: CeV2SiteRequest): Promise<Record<string, unknown>>;
}

interface CapabilityDocument extends CeV2Capabilities {
  namespace: 'system';
  endpoints: {
    siteCollection: string;
    siteItem: string;
    bootstrapCheckout?: string;
    status: string;
  };
  consoleFallback?: boolean;
}

const SAFE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$/;
const LEGACY_CE_ROUTE = /(?:azure.?vnet|fleet|registration.?token|site.?token|shared.?token)/i;

export class HttpCeV2Driver implements CeV2Driver {
  readonly #base: URL;
  readonly #apiToken: string | undefined;
  readonly #consoleHelper: string | undefined;
  readonly #resolveContract: typeof resolveSmsv2AwsReleaseContract;
  #document?: CapabilityDocument;

  constructor(
    env: Record<string, string | undefined> = process.env,
    resolveContract: typeof resolveSmsv2AwsReleaseContract = resolveSmsv2AwsReleaseContract,
  ) {
    if (!env.F5XC_API_URL) throw new Error('F5XC_API_URL is required');
    this.#base = new URL(env.F5XC_API_URL);
    if (this.#base.protocol !== 'https:' && this.#base.hostname !== 'localhost' && this.#base.hostname !== '127.0.0.1')
      throw new Error('F5XC_API_URL must use HTTPS');
    this.#apiToken = env.F5XC_API_TOKEN;
    this.#consoleHelper = env.XCSH_F5XC_CE_CONSOLE_HELPER;
    this.#resolveContract = resolveContract;
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
    const release = await this.#resolveContract();
    this.#document = {
      smsv2ContractVersion: 'v2',
      supportedProviders: ['aws'],
      bootstrapDrivers: ['console'],
      providerNetworkingProfiles: {},
      awsSmsv2TgwConnect: { supported: false, schemaVersion: null },
      namespace: release.namespace,
      endpoints: { siteCollection: release.collectionPath, siteItem: release.itemPath, status: '' },
      consoleFallback: true,
    };
    return this.#document;
  }

  #endpoint(template: string, values: { namespace: string; site: string }): URL {
    if (!SAFE_NAME.test(values.namespace) || !SAFE_NAME.test(values.site))
      throw new Error('Invalid namespace or site name');
    const path = template
      .replaceAll('{namespace}', encodeURIComponent(values.namespace))
      .replaceAll('{site}', encodeURIComponent(values.site))
      .replaceAll('{name}', encodeURIComponent(values.site));
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
    if (request.namespace !== document.namespace)
      throw new Error('Verified SMSv2 AWS CE creation requires namespace system');
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
  ): Promise<{ token: string; driver: 'console' }> {
    const document = await this.#capabilityDocument();
    if (!allowConsole) throw new Error('Headless bootstrap checkout is unavailable until F5 publishes a supported API');
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

  async status(_request: CeV2SiteRequest): Promise<Record<string, unknown>> {
    throw new Error(
      'Secure Mesh Site v2 runtime status is unavailable until the separate F5 telemetry contract is published',
    );
  }
}

export function createDefaultCeV2Driver(): CeV2Driver {
  return new HttpCeV2Driver();
}
