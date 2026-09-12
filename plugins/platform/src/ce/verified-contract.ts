import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { loadPublishedCeApi, type PublishedApiFetcher } from './verified-api-release';
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
const files = ['smsv2-contract.json', 'smsv2-contract-manifest.json', 'smsv2-evidence-receipt.json', 'sites.json'];
const publishedAssets = Object.freeze({
  'smsv2-contract.json': 'sha256:3602ecd09b744449f1bf036c42e10e8be7133f6073e5d1553edb49e46cd2429c',
  'smsv2-contract-manifest.json': 'sha256:75899912ef4c0d243caca5b466d2e8a467d541e7721c8abefd19c890d88d9a07',
  'smsv2-evidence-receipt.json': 'sha256:4e90ee602aa6b00c78f7034691b36ef3d439d5f6ee12bf321c29dca6b0d53a8c',
});
const publishedBase = 'https://github.com/f5-sales-demo/api-specs-enriched/releases/download/v7.0.1';

/** Candidate admission is for local acceptance only. It does not assert public release or live parity. */
export class VerifiedCeContract {
  readonly publication: 'local-candidate' | 'published-release';
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
    networking?: { network: Json; marketplace: Json },
    publication: 'local-candidate' | 'published-release' = 'local-candidate',
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
  static async candidate(directory: string, expectedReceiptSha256: string): Promise<VerifiedCeContract> {
    if (!isAbsolute(directory) || !digestPattern.test(expectedReceiptSha256))
      throw new Error('Candidate path and pinned receipt digest required');
    const receiptBytes = await readFile(join(directory, 'candidate-receipt.json'));
    if (hash(receiptBytes) !== expectedReceiptSha256) throw new Error('CE candidate receipt checksum mismatch');
    const receipt = parse(receiptBytes);
    if (
      receipt.kind !== 'local-candidate' ||
      receipt.repository !== 'f5-sales-demo/api-specs-enriched' ||
      receipt.publication !== 'held' ||
      typeof receipt.commit !== 'string' ||
      !commitPattern.test(receipt.commit)
    )
      throw new Error('Invalid CE candidate provenance');
    const declared = object(receipt.assets);
    const selectedFiles =
      Object.hasOwn(declared, 'network.json') || Object.hasOwn(declared, 'marketplace.json')
        ? [...files, 'network.json', 'marketplace.json']
        : files;
    if (
      Object.keys(declared).length !== selectedFiles.length ||
      selectedFiles.some((file) => typeof declared[file] !== 'string' || !digestPattern.test(declared[file] as string))
    )
      throw new Error('CE candidate asset inventory is incomplete');
    const assets: Record<string, Json> = {};
    for (const file of selectedFiles) {
      const bytes = await readFile(join(directory, file));
      if (hash(bytes) !== declared[file]) throw new Error('CE candidate asset checksum mismatch');
      assets[file] = parse(bytes);
    }
    const manifest = assets['smsv2-contract-manifest.json'];
    const contract = assets['smsv2-contract.json'];
    const evidence = assets['smsv2-evidence-receipt.json'];
    if (
      manifest.schema_version !== 1 ||
      object(manifest.release).commit !== receipt.commit ||
      contract.contract_id !== 'f5xc-smsv2-api/v1' ||
      contract.version !== '7.0.0' ||
      manifest.contract_id !== contract.contract_id ||
      manifest.contract_version !== contract.version ||
      evidence.contract_id !== contract.contract_id
    )
      throw new Error('CE candidate contract identity mismatch');
    const bindings = object(manifest.assets);
    if (
      bindings['smsv2-contract.json'] !== declared['smsv2-contract.json'] ||
      bindings['smsv2-evidence-receipt.json'] !== declared['smsv2-evidence-receipt.json']
    )
      throw new Error('CE candidate manifest checksum mismatch');
    const api = object(contract.api);
    if (
      api.namespace !== 'system' ||
      api.collection_path !== '/api/config/namespaces/{namespace}/securemesh_site_v2s' ||
      api.item_path !== '/api/config/namespaces/{namespace}/securemesh_site_v2s/{name}'
    )
      throw new Error('Unsupported CE API paths');
    const schemas = object(object(assets['sites.json'].components).schemas);
    let networking: { network: Json; marketplace: Json } | undefined;
    if (assets['network.json'] && assets['marketplace.json']) {
      for (const [file, kind] of [
        ['network.json', 'bgp'],
        ['network.json', 'bgp_routing_policy'],
        ['marketplace.json', 'external_connector'],
      ] as const) {
        const path = object(object(assets[file].paths)[`/api/config/namespaces/{metadata.namespace}/${kind}s`]);
        const schema = object(object(object(object(object(path.post).requestBody).content)['application/json']).schema);
        if (schema.$ref !== `#/components/schemas/${kind}CreateRequest`)
          throw new Error('Unsupported routing API request contract');
      }
      networking = {
        network: object(object(assets['network.json'].components).schemas),
        marketplace: object(object(assets['marketplace.json'].components).schemas),
      };
    }
    return new VerifiedCeContract(receipt.commit, expectedReceiptSha256, contract, schemas, networking);
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
      release.commit !== '2513fe498149c98fb737ff2ab207704b8a86fec6' ||
      contract.contract_id !== 'f5xc-smsv2-api/v1' ||
      contract.version !== '7.0.0' ||
      evidence.contract_id !== contract.contract_id ||
      bindings['smsv2-contract.json'] !== publishedAssets['smsv2-contract.json'] ||
      bindings['smsv2-evidence-receipt.json'] !== publishedAssets['smsv2-evidence-receipt.json']
    )
      throw new Error('Published SMSv2 contract binding is invalid');
    const schemas = object(object(api.components).schemas);
    return new VerifiedCeContract(
      '2513fe498149c98fb737ff2ab207704b8a86fec6',
      publishedAssets['smsv2-contract-manifest.json'],
      contract,
      schemas,
      { network: schemas, marketplace: schemas },
      'published-release',
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
    return buildWireSite(intent, this.#schemas);
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
    this.validateSiteReplace(request);
    return request;
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
