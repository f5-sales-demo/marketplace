import type { CeV2SiteConfig } from './driver';
import { createWireValidator } from './wire-schema';
import { buildWireSite } from './wire-site';

type Json = Record<string, any>;
const namePattern = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed Azure SMSv2 response');
  return value as Json;
};

/** Available only after the release resolver verifies the complete immutable publication. */
export class AzureSmsv2Contract {
  constructor(
    readonly provider: Json,
    readonly schemas: Json,
  ) {
    const bootstrap = object(provider.bootstrap),
      cloud = object(bootstrap.cloud_init),
      token = object(bootstrap.token);
    if (
      provider.availability !== 'evidence_backed' ||
      bootstrap.mode !== 'site_bound_jwt_cloud_init' ||
      bootstrap.schema_support !== 'available' ||
      bootstrap.headless_checkout !== 'available' ||
      cloud.method !== 'GET' ||
      cloud.path !== '/api/register/namespaces/system/get-cloud-init-config' ||
      cloud.query_fields?.provider !== 'azure' ||
      cloud.query_fields?.site_name !== 'site_name' ||
      cloud.query_fields?.enable_management_network !== false ||
      cloud.response_path !== 'cloud_init_config' ||
      token.method !== 'POST' ||
      token.path !== '/api/register/namespaces/system/tokens' ||
      token.request_fields?.['spec.type'] !== 1 ||
      token.request_fields?.['spec.site_name'] !== 'site_name' ||
      token.site_binding_required !== true ||
      token.credential_response_path !== 'spec.content'
    )
      throw new Error('Published Azure bootstrap mapping is unsupported');
    createWireValidator(schemas, 'securemesh_site_v2CreateRequest');
    createWireValidator(schemas, 'tokenCreateRequest');
  }

  createRequest(siteName: string, config: CeV2SiteConfig): Json {
    if (
      !namePattern.test(siteName) ||
      config.provider !== 'azure' ||
      config.haMode !== 'one-node' ||
      config.providerNetwork.profile !== 'direct-nic' ||
      config.bgpPeers.length ||
      config.vrfs.length !== 1 ||
      config.interfaces.length !== 1 ||
      config.interfaces[0].role !== 'slo' ||
      config.interfaces[0].index !== 0 ||
      config.interfaces[0].vrf !== config.vrfs[0].name ||
      config.interfaces[0].addressing.mode !== 'dhcp' ||
      config.interfaces[0].addressing.addresses.length ||
      config.nodes?.length !== 1 ||
      config.nodes[0].interfaces.length !== 1
    )
      throw new Error('Native Azure currently supports one explicit DHCP SLO node on direct-nic only');
    const node = config.nodes[0],
      iface = node.interfaces[0];
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/.test(iface.device))
      throw new Error('Explicit Azure guest interface identity is required');
    const spec = buildWireSite(
      {
        schemaVersion: 2,
        provider: 'azure',
        haMode: 'one-node',
        settings: {},
        nodes: [
          {
            hostname: node.hostname,
            interfaces: [
              {
                name: iface.name,
                ethernet_interface: { mac: iface.mac, device: iface.device },
                network_option: { site_local_network: {} },
                dhcp_client: {},
              },
            ],
          },
        ],
      },
      this.schemas,
    );
    const request = { metadata: { name: siteName, namespace: 'system' }, spec };
    createWireValidator(this.schemas, 'securemesh_site_v2CreateRequest')(request);
    return request;
  }

  tokenRequest(siteName: string, tokenName: string): Json {
    if (!namePattern.test(siteName) || !namePattern.test(tokenName)) throw new Error('Invalid bootstrap identity');
    const request = { metadata: { name: tokenName, namespace: 'system' }, spec: { type: 1, site_name: siteName } };
    createWireValidator(this.schemas, 'tokenCreateRequest')(request);
    return request;
  }
}

/** Internal secret material. Never include parser diagnostics or this result in tool output. */
export function bindIssuedCloudInit(response: unknown, jwt: string): string {
  const material = object(response).cloud_init_config;
  if (
    typeof material !== 'string' ||
    material.length > 1024 * 1024 ||
    !material.startsWith('#cloud-config') ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(jwt)
  )
    throw new Error('Unsupported issued cloud-init');
  const bound = material.replaceAll('{{ .Token }}', jwt).replaceAll('{{ .token }}', jwt);
  if (/\{\{|\}\}/.test(bound)) throw new Error('Unresolved cloud-init placeholder');
  let parsed: Json;
  try {
    parsed = object(Bun.YAML.parse(bound));
  } catch {
    throw new Error('Malformed issued cloud-init');
  }
  if (!Array.isArray(parsed.write_files)) throw new Error('Issued cloud-init has no user data');
  const files = parsed.write_files.map(object);
  if (files.some((file: Json) => file.path === '/etc/vpm/config.yaml'))
    throw new Error('Cloud-init overwrites certified configuration');
  const data = files.filter((file: Json) => file.path === '/etc/vpm/user_data');
  if (
    data.length !== 1 ||
    typeof data[0].content !== 'string' ||
    data[0].encoding ||
    !['0600', '600'].includes(String(data[0].permissions))
  )
    throw new Error('Invalid issued user data');
  const tokens = data[0].content.split(/\r?\n/).filter((line: string) => line.startsWith('token:'));
  if (tokens.length !== 1 || tokens[0].slice(6).trim() !== jwt) throw new Error('Issued JWT binding differs');
  return bound;
}

/** Registration ONLINE is separate from operational health and workload acceptance. */
export function observeAzureRegistration(response: Json, site: string, hostname: string, instanceId: string): Json {
  if (
    !Array.isArray(response.items) ||
    ['next_page_token', 'next_token', 'continuation_token', 'continue', 'nextLink'].some((field) => response[field]) ||
    (response.errors && (!Array.isArray(response.errors) || response.errors.length))
  )
    return { status: 'unknown', reason: 'registration-inventory-incomplete' };
  const matches = response.items.filter(
    (item: Json) =>
      item.get_spec?.passport?.cluster_name === site &&
      item.get_spec?.infra?.hostname === hostname &&
      !['RETIRED', 'FAILED_INACTIVE', 'DONE'].includes(item.object?.status?.current_state),
  );
  if (matches.length !== 1) return { status: 'unknown', reason: 'registration-identity-ambiguous-or-missing' };
  const item = matches[0],
    state = item.object?.status?.current_state;
  if (
    !instanceId ||
    item.get_spec?.infra?.instance_id !== instanceId ||
    item.get_spec?.passport?.cluster_size !== 1 ||
    typeof item.name !== 'string' ||
    !/^r-[a-z0-9-]+$/.test(item.name)
  )
    return { status: 'unknown', reason: 'registration-cloud-identity-mismatch' };
  return { status: state === 'ONLINE' ? 'healthy' : 'degraded', state, hostname, instanceId, registration: item.name };
}
