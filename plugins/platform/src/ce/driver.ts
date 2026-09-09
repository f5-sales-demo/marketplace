import { resolveSmsv2PublishedSchemaContract } from './release-contract';

export interface CeV2Capabilities {
  contractIdentity: string;
  smsv2ContractVersion: 'v2' | 'unpublished';
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
    siteCreate: string;
    siteReplace: string;
    siteRead: string;
    siteDelete: string;
    bootstrapSchema: string;
    status: string;
  };
}

const SAFE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,62}$/;
const LEGACY_CE_ROUTE = /(?:azure.?vnet|fleet|registration.?token|site.?token|shared.?token)/i;

export class HttpCeV2Driver implements CeV2Driver {
  readonly #base: URL;
  readonly #apiToken: string | undefined;
  readonly #resolveContract: typeof resolveSmsv2PublishedSchemaContract;
  #document?: CapabilityDocument;

  constructor(
    env: Record<string, string | undefined> = process.env,
    resolveContract: typeof resolveSmsv2PublishedSchemaContract = resolveSmsv2PublishedSchemaContract,
  ) {
    if (!env.F5XC_API_URL) throw new Error('F5XC_API_URL is required');
    this.#base = new URL(env.F5XC_API_URL);
    if (this.#base.protocol !== 'https:' && this.#base.hostname !== 'localhost' && this.#base.hostname !== '127.0.0.1')
      throw new Error('F5XC_API_URL must use HTTPS');
    this.#apiToken = env.F5XC_API_TOKEN;
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
      contractIdentity: release.identity,
      smsv2ContractVersion: 'unpublished',
      supportedProviders: [],
      bootstrapDrivers: [],
      providerNetworkingProfiles: {},
      awsSmsv2TgwConnect: { supported: false, schemaVersion: null },
      namespace: release.namespace,
      endpoints: {
        siteCreate: release.createPath,
        siteReplace: release.replacePath,
        siteRead: release.readPath,
        siteDelete: release.deletePath,
        bootstrapSchema: release.bootstrapPath,
        status: '',
      },
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
      contractIdentity: document.contractIdentity,
      smsv2ContractVersion: document.smsv2ContractVersion,
      supportedProviders: document.supportedProviders,
      bootstrapDrivers: document.bootstrapDrivers,
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
    if (action === 'create' || action === 'update')
      throw new Error(
        'Published CE API schema support does not establish an executable provider configuration mapping',
      );
    if (action === 'read') return this.#request(this.#endpoint(document.endpoints.siteRead, values));
    if (action === 'delete')
      return this.#request(this.#endpoint(document.endpoints.siteDelete, values), {
        method: 'DELETE',
        headers: request.expectedEtag ? { 'If-Match': request.expectedEtag } : undefined,
      });
    throw new Error('Unsupported CE v2 site action');
  }

  async checkoutBootstrap(
    request: CeV2SiteRequest & { nodeName: string; expiresInSeconds: number },
    allowConsole: boolean,
  ): Promise<{ token: string; driver: 'console' }> {
    void request;
    void allowConsole;
    await this.#capabilityDocument();
    throw new Error('Bootstrap schema support does not establish an executable checkout capability');
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
