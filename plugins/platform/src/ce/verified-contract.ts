import { createHash } from 'node:crypto';
import { parseKvmImageResolution, type Smsv2KvmImageResolution } from './release-contract';
import { CE_API_RELEASE, loadPublishedCeApi, type PublishedApiFetcher } from './verified-api-release';
import { projectReplaceSnapshot } from './wire-replace';
import {
  type AwsGreBinding,
  type AzureSloBinding,
  buildAwsRouting,
  buildAzureRouting,
  routingValidators,
} from './wire-routing';
import { createWireValidator } from './wire-schema';
import { buildWireSite, type WireSiteIntent } from './wire-site';

type Json = Record<string, unknown>;
const hash = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const commitPattern = /^[0-9a-f]{40}$/;
const digestPattern = /^sha256:[0-9a-f]{64}$/;
export interface AzureRouteServerEbgpMultihopCapability {
  availability: 'unavailable';
  enforcement: 'reject_before_mutation';
  reason: 'no_schema_valid_ebgp_multihop_request_control';
  source: {
    repository: 'f5-sales-demo/api-specs-enriched';
    commit: string;
    asset_path: 'docs/specifications/api/network.json';
    asset_sha256: string;
    schema_paths: string[];
  };
}
function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid verified CE contract');
  return value as Json;
}
function parse(bytes: Uint8Array): Json {
  try {
    return object(JSON.parse(Buffer.from(bytes).toString('utf8')));
  } catch {
    throw new Error('Malformed CE contract artifact');
  }
}
const publishedAssets = Object.freeze({
  'smsv2-contract.json': 'sha256:2dd4d33693c9e228bfb304d7558a2f50ca9cc0146407f8fb9b5f0ca7d7c56f3c',
  'smsv2-contract-manifest.json': 'sha256:3adcfb6462a887a0f65198ed392c742fbc2ab9ba9df1cac33f36e5fe54fd6662',
  'smsv2-evidence-receipt.json': 'sha256:e9bd60f46acd2a003010cbf20d0581af364cce0486f8a7eefc9eb85562ab0bff',
});
const publishedBase = 'https://github.com/f5-sales-demo/api-specs-enriched/releases/download/v12.0.9';

export class VerifiedCeContract {
  readonly publication: 'published-release';
  readonly #contract: Json;
  readonly #schemas: Json;
  readonly #validate: (spec: unknown) => void;
  readonly #routing?: ReturnType<typeof routingValidators>;
  readonly #routingSchemas?: { network: Json; marketplace: Json };
  private constructor(
    readonly commit: string,
    readonly fingerprint: string,
    contract: Json,
    schemas: Json,
    networking: { network: Json; marketplace: Json } | undefined,
    publication: 'published-release',
    readonly kvmImageResolution?: Smsv2KvmImageResolution,
  ) {
    this.publication = publication;
    this.#contract = contract;
    this.#schemas = schemas;
    this.#validate = createWireValidator(schemas);
    if (networking) {
      this.#routing = routingValidators(networking.network, networking.marketplace);
      this.#routingSchemas = networking;
    }
  }
  static async published(fetcher: PublishedApiFetcher = fetch, signal?: AbortSignal): Promise<VerifiedCeContract> {
    const api = await loadPublishedCeApi(fetcher, signal);
    const read = async (name: keyof typeof publishedAssets): Promise<Json> => {
      const response = await fetcher(`${publishedBase}/${name}`, { signal });
      if (!response.ok) throw new Error('Published SMSv2 contract asset download failed');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (hash(bytes) !== publishedAssets[name]) throw new Error('Published SMSv2 contract asset checksum mismatch');
      return parse(bytes);
    };
    const [contract, manifest, evidence] = await Promise.all([
      read('smsv2-contract.json'),
      read('smsv2-contract-manifest.json'),
      read('smsv2-evidence-receipt.json'),
    ]);
    const release = object(manifest.release);
    const bindings = object(manifest.assets);
    if (
      manifest.schema_version !== 1 ||
      release.commit !== CE_API_RELEASE.commit ||
      contract.contract_id !== 'f5xc-smsv2-api/v1' ||
      contract.version !== '7.0.0' ||
      evidence.contract_id !== contract.contract_id ||
      bindings['smsv2-contract.json'] !== publishedAssets['smsv2-contract.json'] ||
      bindings['smsv2-evidence-receipt.json'] !== publishedAssets['smsv2-evidence-receipt.json']
    )
      throw new Error('Published SMSv2 contract binding is invalid');
    const schemas = object(object(api.components).schemas);
    return new VerifiedCeContract(
      CE_API_RELEASE.commit,
      publishedAssets['smsv2-contract-manifest.json'],
      contract,
      schemas,
      { network: schemas, marketplace: schemas },
      'published-release',
      {
        ...parseKvmImageResolution(api),
        publication: {
          repository: 'f5-sales-demo/api-specs-enriched',
          tag: 'v12.0.9',
          commit: CE_API_RELEASE.commit,
          asset: 'openapi.json',
          sha256: CE_API_RELEASE.fingerprint,
        },
      },
    );
  }
  get awsRoutingAvailable(): boolean {
    return this.#routing !== undefined;
  }
  buildAwsRouting(
    siteName: string,
    localAsn: number,
    remoteAsn: number,
    bindings: AwsGreBinding[],
    deniedExportPrefixes: string[],
  ) {
    if (!this.#routing) throw new Error('Pinned CE routing schemas are unavailable');
    return buildAwsRouting(siteName, localAsn, remoteAsn, bindings, deniedExportPrefixes, this.#routing);
  }
  buildAzureRouting(
    siteName: string,
    localAsn: number,
    remoteAsn: number,
    bindings: AzureSloBinding[],
    routeServerAddresses: string[],
  ) {
    if (!this.#routing) throw new Error('Pinned CE routing schemas are unavailable');
    return buildAzureRouting(siteName, localAsn, remoteAsn, bindings, routeServerAddresses, this.#routing);
  }
  routingCreateRequest(kind: 'external_connector' | 'bgp_routing_policy' | 'bgp', metadata: Json, spec: Json): Json {
    if (!this.#routingSchemas) throw Error('Pinned routing creation contract is required');
    const schemas = kind === 'external_connector' ? this.#routingSchemas.marketplace : this.#routingSchemas.network;
    const request = { metadata: structuredClone(metadata), spec: structuredClone(spec) };
    createWireValidator(schemas, `${kind}CreateRequest`)(request);
    return request;
  }
  routingReplaceRequest(
    kind: 'external_connector' | 'bgp_routing_policy' | 'bgp',
    snapshot: Json,
    desiredSpec: Json,
    siteUid: string,
  ): Json {
    if (
      !this.#routingSchemas ||
      !siteUid.trim() ||
      typeof snapshot.resource_version !== 'string' ||
      !snapshot.resource_version
    )
      throw new Error('Pinned routing replacement contract and exact identity are required');
    const schemas = kind === 'external_connector' ? this.#routingSchemas.marketplace : this.#routingSchemas.network;
    const metadata = projectReplaceSnapshot(snapshot.metadata, schemas, 'schemaObjectReplaceMetaType');
    metadata.labels = { ...object(metadata.labels), 'xcsh-ce-site-uid': siteUid };
    const request = { metadata, spec: structuredClone(desiredSpec), resource_version: snapshot.resource_version };
    createWireValidator(schemas, `${kind}ReplaceRequest`)(request);
    return request;
  }
  validateRouting(kind: 'external_connector' | 'bgp_routing_policy' | 'bgp', spec: Json): void {
    if (!this.#routing) throw new Error('Pinned CE routing schemas are unavailable');
    this.#routing(kind, spec);
  }
  requireRoutingContract(providerName: 'aws' | 'azure'): void {
    if (providerName === 'azure') this.requireAzureRouteServerEbgpMultihop();
    if (!this.#routing) throw new Error('Pinned CE routing schemas are unavailable');
    this.configurationPath(providerName, 'contract-check');
    this.bgpPeersPath(providerName, 'contract-check');
    this.bgpRoutesPath(providerName, 'contract-check');
  }
  azureRouteServerEbgpMultihop(): AzureRouteServerEbgpMultihopCapability {
    const azure = object(object(this.#contract.providers).azure);
    const capability = object(azure.route_server_ebgp_multihop);
    const source = object(capability.source);
    const schemaPaths = source.schema_paths;
    if (
      capability.availability !== 'unavailable' ||
      capability.enforcement !== 'reject_before_mutation' ||
      capability.reason !== 'no_schema_valid_ebgp_multihop_request_control' ||
      source.repository !== 'f5-sales-demo/api-specs-enriched' ||
      typeof source.commit !== 'string' ||
      !commitPattern.test(source.commit) ||
      source.asset_path !== 'docs/specifications/api/network.json' ||
      typeof source.asset_sha256 !== 'string' ||
      !digestPattern.test(source.asset_sha256) ||
      !Array.isArray(schemaPaths) ||
      !schemaPaths.every((path) => typeof path === 'string')
    )
      throw new Error('Azure Route Server eBGP multihop capability contract is unavailable');
    return {
      availability: 'unavailable',
      enforcement: 'reject_before_mutation',
      reason: 'no_schema_valid_ebgp_multihop_request_control',
      source: {
        repository: 'f5-sales-demo/api-specs-enriched',
        commit: source.commit,
        asset_path: 'docs/specifications/api/network.json',
        asset_sha256: source.asset_sha256,
        schema_paths: [...schemaPaths],
      },
    };
  }
  requireAzureRouteServerEbgpMultihop(): never {
    const capability = this.azureRouteServerEbgpMultihop();
    throw new Error(`Azure Route Server eBGP multihop is ${capability.availability}: ${capability.reason}`);
  }
  configurationPath(providerName: 'aws' | 'azure', siteName: string): string {
    const provider = object(object(this.#contract.providers)[providerName]);
    const observation = object(object(provider.runtime).configuration);
    const mappings = object(observation.response_mappings);
    const normalization = object(observation.normalization);
    const nullability = object(observation.nullability);
    const expectedMappings = {
      interfaces: 'interface_list[]',
      mac: 'ethernet_interface.mac',
      mtu: 'mtu',
      node: 'hostname',
      nodes: `spec.${providerName}.not_managed.node_list[]`,
      public_ip: 'public_ip',
      role: 'network_option',
      ...(providerName === 'azure' ? { device: 'ethernet_interface.device', provider: 'spec.azure.not_managed' } : {}),
    };
    if (
      observation.method !== 'GET' ||
      observation.path !== '/api/config/namespaces/{namespace}/securemesh_site_v2s/{site}' ||
      observation.operation_id !== 'ves.io.schema.views.securemesh_site_v2.API.Get' ||
      observation.response_schema !== 'securemesh_site_v2GetResponse' ||
      observation.authority !== 'f5xc' ||
      observation.semantics !== 'configuration' ||
      JSON.stringify(Object.entries(mappings).toSorted()) !==
        JSON.stringify(Object.entries(expectedMappings).toSorted()) ||
      normalization.node !== 'trim' ||
      normalization.mac !== 'ieee802_lowercase_colon' ||
      normalization.role !== 'slo_or_sli' ||
      nullability.public_ip !== 'nullable' ||
      nullability.all_identity_fields !== 'non_null' ||
      JSON.stringify(observation.correlation) !== JSON.stringify(['node', 'normalized_mac'])
    )
      throw new Error(`Verified ${providerName} configuration observation mapping is unavailable`);
    return `/api/config/namespaces/system/securemesh_site_v2s/${siteName}`;
  }
  bgpPeersPath(providerName: 'aws' | 'azure', siteName: string): string {
    const provider = object(object(this.#contract.providers)[providerName]);
    const runtime = object(provider.runtime);
    const observation = object(runtime.bgp_peers);
    const mappings = object(observation.response_mappings);
    const peerAddress = object(mappings.peer_address);
    if (
      observation.method !== 'GET' ||
      observation.path !== '/api/operate/namespaces/{namespace}/sites/{site}/ver/bgp_peers' ||
      observation.operation_id !== 'ves.io.schema.operate.bgp.CustomPublicAPI.ShowBGPPeers' ||
      observation.response_schema !== 'bgpBGPPeersResponse' ||
      observation.authority !== 'f5xc' ||
      observation.semantics !== 'observational_read_only' ||
      mappings.nodes !== 'ver[]' ||
      mappings.node !== 'ver[].name' ||
      mappings.peers !== 'ver[].peer[]' ||
      mappings.interface_name !== 'ver[].peer[].interface_name' ||
      peerAddress.ipv4 !== 'ver[].peer[].peer_address.ipv4.addr' ||
      peerAddress.ipv6 !== 'ver[].peer[].peer_address.ipv6.addr' ||
      mappings.state !== 'ver[].peer[].protocol_status' ||
      mappings.received_prefix_count !== 'ver[].peer[].received_prefix_count' ||
      mappings.advertised_prefix_count !== 'ver[].peer[].advertised_prefix_count' ||
      mappings.state_changed_at !== 'ver[].peer[].up_down_timestamp' ||
      object(observation.normalization).node !== 'configured_hostname_or_fqdn' ||
      JSON.stringify(observation.correlation) !== JSON.stringify(['canonical_node', 'peer_address'])
    )
      throw new Error(`Verified ${providerName} BGP observation mapping is unavailable`);
    return `/api/operate/namespaces/system/sites/${siteName}/ver/bgp_peers`;
  }
  bgpRoutesPath(providerName: 'aws' | 'azure', siteName: string): string {
    const provider = object(object(this.#contract.providers)[providerName]);
    const observation = object(object(provider.runtime).bgp_routes);
    const mappings = object(observation.response_mappings);
    if (
      observation.method !== 'GET' ||
      observation.path !== '/api/operate/namespaces/{namespace}/sites/{site}/ver/bgp_routes' ||
      observation.operation_id !== 'ves.io.schema.operate.bgp.CustomPublicAPI.ShowBGPRoutes' ||
      observation.response_schema !== 'bgpBGPRoutesResponse' ||
      observation.authority !== 'f5xc' ||
      observation.semantics !== 'observational_read_only' ||
      mappings.nodes !== 'ver[]' ||
      mappings.node !== 'ver[].name' ||
      mappings.routing_instances !== 'ver[].ri_table[]' ||
      mappings.route_tables !== 'ver[].ri_table[].rt_table[]' ||
      mappings.imported_routes !== 'ver[].ri_table[].rt_table[].imported[]' ||
      mappings.exported_routes !== 'ver[].ri_table[].rt_table[].exported[]' ||
      JSON.stringify(mappings.route_prefixes) !==
        JSON.stringify([
          'ver[].ri_table[].rt_table[].imported[].subnet',
          'ver[].ri_table[].rt_table[].exported[].subnet',
        ]) ||
      object(observation.normalization).node !== 'configured_hostname_or_fqdn' ||
      JSON.stringify(observation.correlation) !== JSON.stringify(['canonical_node'])
    )
      throw new Error(`Verified ${providerName} BGP route observation mapping is unavailable`);
    return `/api/operate/namespaces/system/sites/${siteName}/ver/bgp_routes`;
  }
  buildSite(intent: WireSiteIntent): Json {
    if (intent.provider === 'aws' && intent.haMode === 'three-node') this.requireAwsHaNodeConfiguration();
    return buildWireSite(intent, this.#schemas);
  }
  requireAwsHaNodeConfiguration(): void {
    const configuration = object(this.provider('aws').node_configuration);
    const invariants = object(configuration.invariants);
    if (configuration.availability !== 'evidence_backed' || invariants.ha !== 'enabled' || invariants.node_count !== 3)
      throw new Error(
        'Published AWS node configuration requires one non-HA node; qualify and publish three-node support before HA mutation',
      );
  }
  validateSite(spec: unknown): void {
    this.#validate(spec);
  }
  siteCreateRequest(snapshot: Json): Json {
    const request = {
      metadata: projectReplaceSnapshot(snapshot.metadata, this.#schemas, 'schemaObjectCreateMetaType'),
      spec: projectReplaceSnapshot(snapshot.spec, this.#schemas, 'viewssecuremesh_site_v2CreateSpecType', [
        'site_state',
        'site_errors',
        'operating_system_version',
        'volterra_software_version',
      ]),
    };
    this.validateSiteCreate(request);
    return request;
  }
  validateSiteCreate(request: Json): void {
    createWireValidator(this.#schemas, 'securemesh_site_v2CreateRequest')(request);
  }
  siteReplaceRequest(snapshot: Json): Json {
    const request = {
      metadata: projectReplaceSnapshot(snapshot.metadata, this.#schemas, 'schemaObjectReplaceMetaType'),
      spec: projectReplaceSnapshot(snapshot.spec, this.#schemas, 'viewssecuremesh_site_v2ReplaceSpecType', [
        'site_state',
        'site_errors',
        'operating_system_version',
        'volterra_software_version',
        'disable_management_network',
        'enable_management_network',
      ]),
      resource_version: snapshot.resource_version,
    };
    for (const provider of ['aws', 'azure']) {
      const original = object(snapshot.spec)[provider] as Json | undefined;
      const projected = object(request.spec)[provider] as Json | undefined;
      if (!original || !projected) continue;
      const originalNodes = object(original.not_managed ?? {}).node_list as Json[] | undefined;
      const projectedNodes = object(projected.not_managed ?? {}).node_list as Json[] | undefined;
      for (const node of projectedNodes ?? [])
        for (const iface of node.interface_list as Json[]) {
          const ethernet = object(iface.ethernet_interface);
          const observed = (
            originalNodes?.find((item) => item.hostname === node.hostname)?.interface_list as Json[] | undefined
          )?.find(
            (item) =>
              object(item.ethernet_interface).mac === ethernet.mac &&
              object(item.ethernet_interface).device === ethernet.device,
          );
          for (const field of ['is_primary', 'is_management'])
            if (typeof observed?.[field] === 'boolean') iface[field] = observed[field];
        }
    }
    this.validateObservedSiteReplace(snapshot, request);
    return request;
  }
  validateObservedSiteReplace(snapshot: Json, request: Json): void {
    if (
      object(snapshot.metadata).name !== object(request.metadata).name ||
      object(snapshot.metadata).namespace !== object(request.metadata).namespace ||
      !snapshot.resource_version ||
      request.resource_version !== snapshot.resource_version
    )
      throw new Error('Replacement snapshot identity or resource version differs');
    for (const provider of ['aws', 'azure']) {
      const before = object(snapshot.spec)[provider] as Json | undefined;
      const after = object(request.spec)[provider] as Json | undefined;
      if (!before && !after) continue;
      if (!before || !after) throw new Error('Replacement provider identity differs');
      const original = object(before.not_managed ?? {}).node_list as Json[] | undefined;
      const nodes = object(after.not_managed ?? {}).node_list as Json[] | undefined;
      for (const node of nodes ?? [])
        for (const iface of node.interface_list as Json[]) {
          const ethernet = object(iface.ethernet_interface);
          const observed = (
            original?.find((item) => item.hostname === node.hostname)?.interface_list as Json[] | undefined
          )?.find(
            (item) =>
              object(item.ethernet_interface).mac === ethernet.mac &&
              object(item.ethernet_interface).device === ethernet.device,
          );
          if (!observed) throw new Error('Replacement physical interface identity differs');
          for (const field of ['is_primary', 'is_management'])
            if (iface[field] !== observed[field]) throw new Error('Observed interface identity flags changed');
        }
    }
    createWireValidator(
      this.#schemas,
      'securemesh_site_v2ReplaceRequest',
      object(snapshot.spec).aws !== undefined || object(snapshot.spec).azure !== undefined,
    )(request);
  }
  validateSiteReplace(request: Json): void {
    createWireValidator(this.#schemas, 'securemesh_site_v2ReplaceRequest')(request);
  }
  provider(name: 'aws' | 'azure'): Json {
    return structuredClone(object(object(this.#contract.providers)[name]));
  }
  bootstrapQuery(name: 'aws' | 'azure'): { provider: 'aws' | 'azure'; enableManagementNetwork: false } {
    const provider = object(object(this.#contract.providers)[name]);
    const bootstrap = object(provider.bootstrap);
    if (
      bootstrap.mode !== 'site_bound_jwt_cloud_init' ||
      bootstrap.headless_checkout !== 'available' ||
      bootstrap.schema_support !== 'available' ||
      !bootstrap.cloud_init ||
      typeof bootstrap.cloud_init !== 'object' ||
      Array.isArray(bootstrap.cloud_init)
    )
      throw new Error(`Verified ${name} headless bootstrap capability is unavailable`);
    const cloudInit = object(bootstrap.cloud_init);
    const query = object(cloudInit.query_fields);
    if (
      cloudInit.method !== 'GET' ||
      cloudInit.path !== '/api/register/namespaces/system/get-cloud-init-config' ||
      query.provider !== name ||
      query.site_name !== 'site_name' ||
      query.enable_management_network !== false ||
      cloudInit.response_path !== 'cloud_init_config' ||
      cloudInit.sensitive !== true
    )
      throw new Error(`Verified ${name} bootstrap mapping is unsupported`);
    return { provider: name, enableManagementNetwork: false };
  }
  get api(): Json {
    return structuredClone(object(this.#contract.api));
  }
}
