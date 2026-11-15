// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun

// plugins/aws/src/ce/apply.ts
import { chmod, mkdir, mkdtemp as mkdtemp2, rm as rm2, writeFile as writeFile2 } from 'node:fs/promises';
// plugins/platform/src/ce/wire-ingress.ts
import { isIP } from 'node:net';
import { join as join3 } from 'node:path';
import {
  AWS_CE_PROVIDER_LOCK_SHA256,
  AWS_CE_TERRAFORM_PROVIDER_VERSION,
  AWS_CE_TERRAFORM_VERSION,
  assertAwsDeploymentCompilerOperation,
  awsCeInterfacePrivateAddresses,
  awsCeNlbIngress,
  awsCeStaticIp,
  executeRecoverableCreate,
  hasCreateRecovery,
  interfaceSecurityGroups,
  nlbSettings,
  observedConnectCidrs,
  siteBindings,
  siteForNode,
  siteTopology,
  staticAzRoutes,
  validateAwsCeAddressing,
} from './runtime-3pc51xt0.js';
import { AwsNotFoundError, detectAwsError } from './runtime-30f0rzjf.js';
import { scopedAwsApi } from './runtime-fex55vat.js';
import { renderAwsCeCloudInit } from './runtime-k1rqsw4z.js';
import {
  AWS_CE_DEFAULT_INTERFACE_MTU,
  AWS_CE_SCHEMA_VERSION,
  acquireProcessLock,
  assertAwsAdminPrebootDevices,
  assertAwsBootstrapKeyPair,
  assertAwsEbsTeardown,
  assertAwsEbsVolumeAvailable,
  awsEbsInstanceVolumeIds,
  awsInitialAdminSettings,
  initialSoftwareSettings,
  loadAwsCheckpoint,
  loadAwsPlan,
  revalidateAwsBootstrapKeyPair,
  saveAwsCheckpoint,
  verifyAwsCePlan,
} from './runtime-np6pq61g.js';
import {
  CE_API_RELEASE,
  CeApiError,
  createWireValidator,
  discoverAwsCompute,
  loadPublishedCeApi,
  observeAwsResources,
  parseSoftwareTargets,
  parseUpgradePrechecks,
  projectReplaceSnapshot,
} from './runtime-pv55z3nj.js';
import {
  awsCeObservationRegion,
  canonicalSha256,
  fingerprintObservation,
  fingerprintOwnedResources,
  matchesObservationFingerprint,
  matchesOwnedResourceFingerprint,
  resourceConfiguration,
  safeHexEqual,
} from './runtime-x2h4t614.js';

function projectInsideHttpListener(spec, schemas, validate) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error('Malformed HTTP listener response');
  const source = structuredClone(spec);
  for (const key of ['api_rate_limit_legacy', 'malicious_user_mitigation'])
    if (source[key] === null) delete source[key];
  for (const key of [
    'downstream_tls_certificate_expiration_timestamps',
    'waf_exclusion_rules',
    'dns_info',
    'internet_vip_info',
  ])
    if (Array.isArray(source[key]) && source[key].length === 0) delete source[key];
  if (source.host_name === '') delete source.host_name;
  const placements = source.advertise_custom?.advertise_where;
  if (Array.isArray(placements))
    for (const placement of placements) {
      const site = placement?.site;
      if (site?.ipv6 === '') delete site.ipv6;
    }
  const result = projectReplaceSnapshot(source, schemas, 'viewshttp_loadbalancerCreateSpecType', [
    'state',
    'auto_cert_info',
    'cert_state',
  ]);
  validate(result);
  const omitEmpty = (value, keys) => {
    for (const key of keys) {
      const item = value[key];
      if (item && typeof item === 'object' && !Array.isArray(item) && Object.keys(item).length === 0) delete value[key];
    }
  };
  omitEmpty(result, [
    'service_policies_from_namespace',
    'disable_trust_client_ip_headers',
    'disable_malicious_user_detection',
    'default_sensitive_data_policy',
    'disable_threat_mesh',
    'disable_malware_protection',
  ]);
  if (result.l7_ddos_protection)
    omitEmpty(result.l7_ddos_protection, [
      'mitigation_block',
      'default_rps_threshold',
      'clientside_action_none',
      'ddos_policy_none',
    ]);
  if (Array.isArray(result.default_route_pools))
    for (const pool of result.default_route_pools) omitEmpty(pool, ['endpoint_subsets']);
  return result;
}
function buildInsideHttpListener(input, validate) {
  const name = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  const domain = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  if (
    !input ||
    ![input.name, input.namespace, input.originPool?.name, input.originPool?.namespace].every(
      (value) => typeof value === 'string' && name.test(value),
    ) ||
    typeof input.domain !== 'string' ||
    input.domain.length > 253 ||
    !domain.test(input.domain) ||
    !Number.isInteger(input.port) ||
    input.port < 1 ||
    input.port > 65535 ||
    !Array.isArray(input.sites) ||
    input.sites.length < 1 ||
    input.sites.length > 32
  )
    throw new Error('Invalid inside HTTP listener identity or topology');
  const names = new Set();
  const addresses = new Set();
  const advertiseWhere = input.sites.map((site) => {
    if (
      !site ||
      typeof site.name !== 'string' ||
      !name.test(site.name) ||
      names.has(site.name) ||
      (site.usePrimaryInterfaceAddress === true
        ? site.insideAddress !== undefined
        : site.usePrimaryInterfaceAddress !== undefined ||
          typeof site.insideAddress !== 'string' ||
          isIP(site.insideAddress) !== 4 ||
          addresses.has(site.insideAddress))
    )
      throw new Error('Invalid or ambiguous inside HTTP listener placement');
    names.add(site.name);
    if (site.insideAddress !== undefined) addresses.add(site.insideAddress);
    return {
      site: {
        site: { name: site.name, namespace: 'system' },
        ...(site.usePrimaryInterfaceAddress === true ? {} : { ip: site.insideAddress }),
        network: 'SITE_NETWORK_INSIDE',
      },
      use_default_port: {},
    };
  });
  const spec = {
    domains: [input.domain],
    http: { port: input.port },
    advertise_custom: { advertise_where: advertiseWhere },
    default_route_pools: [
      {
        pool: { name: input.originPool.name, namespace: input.originPool.namespace },
        weight: 1,
        priority: 1,
      },
    ],
    round_robin: {},
    no_challenge: {},
    user_id_client_ip: {},
    disable_waf: {},
    disable_rate_limit: {},
    disable_api_discovery: {},
    disable_api_testing: {},
    disable_api_definition: {},
    l7_ddos_protection: {},
  };
  validate(spec);
  return {
    metadata: { name: input.name, namespace: input.namespace },
    spec,
    evidence: { listener: 'unknown', routes: 'unknown', traffic: 'unknown' },
  };
}

// plugins/platform/src/ce/wire-origin.ts
import { isIP as isIP2 } from 'node:net';

function projectSiteLocalHttpOrigin(spec, schemas, validate) {
  const result = projectReplaceSnapshot(spec, schemas, 'viewsorigin_poolCreateSpecType');
  for (const key of ['advanced_options', 'upstream_conn_pool_reuse_type']) {
    const value = result[key];
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)
      delete result[key];
  }
  if (Array.isArray(result.healthcheck) && result.healthcheck.length === 0) delete result.healthcheck;
  if (Array.isArray(result.origin_servers))
    for (const server of result.origin_servers) {
      if (!server || typeof server !== 'object' || Array.isArray(server)) continue;
      const privateIp = server.private_ip;
      if (!privateIp || typeof privateIp !== 'object' || Array.isArray(privateIp)) continue;
      const snat = privateIp.snat_pool;
      if (snat && typeof snat === 'object' && !Array.isArray(snat) && Object.keys(snat).length === 0)
        delete privateIp.snat_pool;
    }
  validate(result);
  return result;
}
function buildSiteLocalHttpOrigin(input, validate) {
  const name = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  if (
    !input ||
    Object.keys(input).sort().join(',') !== 'name,namespace,originAddress,port,siteNames' ||
    ![input.name, input.namespace].every((value) => typeof value === 'string' && name.test(value)) ||
    typeof input.originAddress !== 'string' ||
    isIP2(input.originAddress) !== 4 ||
    !Number.isInteger(input.port) ||
    input.port < 1 ||
    input.port > 65535 ||
    !Array.isArray(input.siteNames) ||
    input.siteNames.length < 1 ||
    input.siteNames.length > 32 ||
    new Set(input.siteNames).size !== input.siteNames.length ||
    input.siteNames.some((value) => typeof value !== 'string' || !name.test(value))
  )
    throw new Error('Explicit HTTP origin and distinct site identities are required');
  const spec = {
    port: input.port,
    origin_servers: input.siteNames.map((siteName) => ({
      labels: {},
      private_ip: {
        ip: input.originAddress,
        inside_network: {},
        site_locator: { site: { name: siteName, namespace: 'system' } },
      },
    })),
    no_tls: {},
    loadbalancer_algorithm: 'ROUND_ROBIN',
    endpoint_selection: 'LOCAL_PREFERRED',
  };
  validate(spec);
  return {
    metadata: { name: input.name, namespace: input.namespace },
    spec,
    evidence: { origin: 'unknown', traffic: 'unknown' },
  };
}

// plugins/platform/src/ce/ingress-contract.ts
function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed ingress contract');
  return value;
}

class VerifiedIngressContract {
  identity = 'f5xc-ce-http-ingress-api/v1';
  publication = 'immutable-release';
  releaseTag = CE_API_RELEASE.tag;
  commit = CE_API_RELEASE.commit;
  fingerprint = CE_API_RELEASE.fingerprint;
  #validate;
  #validateOrigin;
  #schemas;
  constructor(schemas) {
    this.#schemas = schemas;
    this.#validate = createWireValidator(schemas, 'viewshttp_loadbalancerCreateSpecType');
    this.#validateOrigin = createWireValidator(schemas, 'viewsorigin_poolCreateSpecType');
  }
  static async release(fetcher = fetch, signal) {
    const api = await loadPublishedCeApi(fetcher, signal);
    const path = object(object(api.paths)['/api/config/namespaces/{metadata.namespace}/http_loadbalancers']);
    const schema = object(object(object(object(object(path.post).requestBody).content)['application/json']).schema);
    if (schema.$ref !== '#/components/schemas/http_loadbalancerCreateRequest')
      throw new Error('Unsupported ingress request path');
    const origin = object(object(api.paths)['/api/config/namespaces/{metadata.namespace}/origin_pools']);
    const originSchema = object(
      object(object(object(object(origin.post).requestBody).content)['application/json']).schema,
    );
    if (originSchema.$ref !== '#/components/schemas/origin_poolCreateRequest')
      throw new Error('Unsupported origin request path');
    return new VerifiedIngressContract(object(object(api.components).schemas));
  }
  build(input) {
    return buildInsideHttpListener(input, this.#validate);
  }
  buildOrigin(input) {
    return buildSiteLocalHttpOrigin(input, this.#validateOrigin);
  }
  projectObserved(spec) {
    return projectInsideHttpListener(spec, this.#schemas, this.#validate);
  }
  projectOriginObserved(spec) {
    return projectSiteLocalHttpOrigin(spec, this.#schemas, this.#validateOrigin);
  }
}

// plugins/platform/src/ce/wire-upgrade.ts
function buildSiteUpgradeRequest(input, validate) {
  if (
    !input ||
    Object.keys(input).some((key) => !['siteName', 'kind', 'version'].includes(key)) ||
    typeof input.siteName !== 'string' ||
    !/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(input.siteName) ||
    !['software', 'os'].includes(input.kind) ||
    typeof input.version !== 'string' ||
    !(input.kind === 'software' ? /^crt-\d{8}-\d{4}$/ : /^\d+\.\d{4}\.\d+$/).test(input.version)
  )
    throw new Error('An upgrade requires an exact site, operation and version');
  const body = { namespace: 'system', name: input.siteName, version: input.version, force: false };
  validate(body);
  return {
    method: 'POST',
    path: `/api/config/namespaces/system/sites/${input.siteName}/upgrade_${input.kind === 'software' ? 'sw' : 'os'}`,
    body,
  };
}

// plugins/platform/src/ce/upgrade-transition.ts
var same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
function matchesVersionIdentity(expected, observation) {
  if (observation.status !== 'observed') return false;
  const { binding } = expected;
  if (
    typeof expected.siteUid !== 'string' ||
    !expected.siteUid.trim() ||
    typeof expected.physicalSiteUid !== 'string' ||
    !expected.physicalSiteUid.trim() ||
    observation.siteUid !== expected.siteUid ||
    observation.physicalSiteUid !== expected.physicalSiteUid ||
    observation.siteName !== binding.siteName ||
    observation.source !== `/api/config/namespaces/system/sites/${binding.siteName}` ||
    !Array.isArray(binding.nodes) ||
    !binding.nodes.length ||
    binding.nodes.some((node) => typeof node !== 'string' || !node.trim()) ||
    !['native', 'terraform'].includes(binding.owner.engine) ||
    !['aws', 'azure'].includes(binding.owner.provider) ||
    new Set(binding.nodes).size !== binding.nodes.length ||
    !same(observation.nodes, binding.nodes) ||
    ['deploymentId', 'engine', 'provider', 'account', 'region'].some(
      (key) =>
        typeof binding.owner[key] !== 'string' ||
        !binding.owner[key].trim() ||
        observation.owner[key] !== binding.owner[key],
    ) ||
    !['contractFingerprint', 'siteContractFingerprint'].every(
      (key) => /^sha256:[a-f0-9]{64}$/.test(expected[key]) && observation[key] === expected[key],
    )
  )
    return false;
  const start = Date.parse(observation.startedAt),
    end = Date.parse(observation.observedAt),
    now = Date.now();
  if (![start, end].every(Number.isFinite) || start > end || end > now || now - start > 60000) return false;
  if (new Date(start).toISOString() !== observation.startedAt || new Date(end).toISOString() !== observation.observedAt)
    return false;
  if (observation.online !== (observation.siteState === 'ONLINE')) return false;
  initialSoftwareSettings({ software: observation.software.installed, os: observation.os.installed });
  return true;
}
function stableCeSiteVersions(expected, observation) {
  try {
    if (
      !matchesVersionIdentity(expected, observation) ||
      !observation.online ||
      observation.software.phase !== 'UPGRADE_COMPLETED' ||
      observation.os.phase !== 'UPGRADE_COMPLETED' ||
      observation.progress.status !== 'COMPLETED' ||
      observation.progress.version !== observation.software.installed ||
      observation.targetSoftware !== observation.software.installed
    )
      return;
    return { software: observation.software.installed, os: observation.os.installed };
  } catch {
    return;
  }
}
function assessCeUpgradeTransition(expected, observation) {
  try {
    initialSoftwareSettings(expected.before);
    if (Object.keys(expected.target).sort().join(',') !== 'kind,version') return 'unknown';
    buildSiteUpgradeRequest({ siteName: expected.binding.siteName, ...expected.target }, () => {});
    const kind = expected.target.kind,
      other = kind === 'software' ? 'os' : 'software';
    if (expected.target.version === expected.before[kind]) return 'unknown';
    if (!matchesVersionIdentity(expected, observation)) return 'unknown';
    const targetSoftware = kind === 'software' ? expected.target.version : expected.before.software;
    if (observation.targetSoftware !== targetSoftware) return 'unknown';
    const selected = observation[kind],
      unchanged = observation[other];
    if (unchanged.installed !== expected.before[other] || unchanged.phase !== 'UPGRADE_COMPLETED') return 'unknown';
    if (![expected.before[kind], expected.target.version].includes(selected.installed)) return 'unknown';
    if (observation.siteState === 'FAILED' || selected.phase === 'UPGRADE_FAILED') return 'failed';
    if (
      kind === 'software' &&
      observation.progress.version === expected.target.version &&
      observation.progress.status === 'FAILED'
    )
      return 'failed';
    if (
      selected.installed === expected.target.version &&
      selected.phase === 'UPGRADE_COMPLETED' &&
      observation.online
    ) {
      if (
        kind === 'software' &&
        (observation.progress.version !== expected.target.version || observation.progress.status !== 'COMPLETED')
      )
        return 'unknown';
      return 'versions-complete';
    }
    if (
      ['UPGRADE_TRIGGERED', 'UPGRADE_IN_PROGRESS'].includes(selected.phase) &&
      ['ONLINE', 'UPGRADING'].includes(observation.siteState)
    ) {
      if (
        kind === 'software' &&
        (observation.progress.version !== expected.target.version ||
          !['SCHEDULED', 'IN_PROGRESS'].includes(observation.progress.status))
      )
        return 'unknown';
      return 'converging';
    }
    if (selected.installed !== expected.before[kind] || selected.phase !== 'UPGRADE_COMPLETED' || !observation.online)
      return 'unknown';
    if (observation.progress.version !== expected.before.software || observation.progress.status !== 'COMPLETED')
      return 'unknown';
    const prechecks = parseUpgradePrechecks({
      checklist: observation.prechecks.checks.map((check) => ({ item: check.name, status: check.status })),
    });
    if (!prechecks.passing) return 'unknown';
    const targets = parseSoftwareTargets({ sw_versions: observation.targets });
    if (
      kind === 'software' ? !targets.includes(expected.target.version) : selected.available !== expected.target.version
    )
      return 'unknown';
    return 'ready';
  } catch {
    return 'unknown';
  }
}

// plugins/platform/src/ce/version-observation-diagnostic.ts
var CE_UPGRADE_OBSERVATION_STAGES = [
  'logical-site',
  'physical-site',
  'site-versions',
  'upgrade-paths',
  'targets',
  'prechecks',
  'progress',
  'logical-site-recheck',
  'physical-site-recheck',
  'stability-recheck',
];
var reasons = [
  'authorization',
  'expired',
  'throttled',
  'not-found',
  'conflict',
  'invalid-request',
  'transient',
  'malformed',
  'cancelled',
  'deadline',
  'ownership-or-response-invalid',
  'identity-or-versions-not-stable',
];
var stages = [...CE_UPGRADE_OBSERVATION_STAGES, 'replacement-version-stability'];
function safeCeVersionObservationDiagnostic(value) {
  const row = value && typeof value === 'object' ? value : {};
  return {
    status: row.status === 'unstable' ? 'unstable' : 'unknown',
    reason: reasons.includes(row.reason) ? row.reason : 'not-established',
    failedStage: stages.includes(row.failedStage) ? row.failedStage : 'not-established',
  };
}

// plugins/platform/src/ce/replacement-versions.ts
class CeReplacementVersionEvidenceError extends Error {
  diagnostic;
  constructor(kind, observation) {
    super(
      kind === 'unavailable'
        ? 'Replacement version evidence is unavailable'
        : 'Replacement site identity or effective versions are not stable',
    );
    this.diagnostic = safeCeVersionObservationDiagnostic(
      kind === 'unavailable'
        ? observation
        : {
            status: 'unstable',
            reason: 'identity-or-versions-not-stable',
            failedStage: 'replacement-version-stability',
          },
    );
  }
}
async function captureCeReplacementVersions(binding, siteUid, siteContractFingerprint, runtime, contract, signal) {
  binding = structuredClone(binding);
  const observation = await runtime.observeUpgrade(binding, contract, undefined, signal);
  if (observation.status !== 'observed') throw new CeReplacementVersionEvidenceError('unavailable', observation);
  const identity = {
    binding,
    siteUid,
    physicalSiteUid: observation.physicalSiteUid,
    siteContractFingerprint,
    contractFingerprint: contract.fingerprint,
  };
  const versions = stableCeSiteVersions(identity, observation);
  if (!versions) throw new CeReplacementVersionEvidenceError('unstable');
  return { schemaVersion: 1, identity, versions };
}
async function verifyCeReplacementVersions(snapshot, runtime, contract, signal) {
  snapshot = structuredClone(snapshot);
  if (snapshot.schemaVersion !== 1 || snapshot.identity.contractFingerprint !== contract.fingerprint)
    throw new Error('Replacement version snapshot or published contract differs');
  initialSoftwareSettings(snapshot.versions);
  const observation = await runtime.observeUpgrade(snapshot.identity.binding, contract, undefined, signal);
  const current = stableCeSiteVersions(snapshot.identity, observation);
  if (!current || current.software !== snapshot.versions.software || current.os !== snapshot.versions.os)
    throw new Error('Replacement site identity or effective versions changed before mutation');
}

// plugins/platform/src/ce/upgrade-contract.ts
function object2(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed upgrade contract');
  return value;
}
var routes = {
  software: ['/api/config/namespaces/{namespace}/sites/{name}/upgrade_sw', 'post', 'siteUpgradeSWRequest'],
  os: ['/api/config/namespaces/{namespace}/sites/{name}/upgrade_os', 'post', 'siteUpgradeOSRequest'],
  site: ['/api/config/namespaces/{namespace}/sites/{name}', 'get', 'siteGetResponse'],
  targets: ['/api/maurice/upgradable_sw_versions', 'get', 'upgrade_statusGetUpgradableSWVersionsResponse'],
  precheck: [
    '/api/maurice/namespaces/{namespace}/sites/{name}/pre_upgrade_check',
    'get',
    'upgrade_statusPreUpgradeCheckResponse',
  ],
  progress: [
    '/api/maurice/namespaces/{namespace}/sites/{name}/upgrade_status',
    'get',
    'upgrade_statusGetUpgradeStatusResponse',
  ],
};

class VerifiedUpgradeContract {
  identity = 'f5xc-ce-upgrade-api/v1';
  publication = 'immutable-release';
  releaseTag = CE_API_RELEASE.tag;
  commit = CE_API_RELEASE.commit;
  fingerprint = CE_API_RELEASE.fingerprint;
  #software;
  #os;
  constructor(schemas) {
    this.#software = createWireValidator(schemas, 'siteUpgradeSWRequest');
    this.#os = createWireValidator(schemas, 'siteUpgradeOSRequest');
  }
  static async release(fetcher = fetch, signal) {
    const api = await loadPublishedCeApi(fetcher, signal);
    const paths = object2(api.paths);
    for (const [path, method, schemaName] of Object.values(routes)) {
      const operation = object2(object2(paths[path])[method]);
      const container =
        method === 'post' ? object2(operation.requestBody) : object2(object2(operation.responses)['200']);
      const schema = object2(object2(object2(container.content)['application/json']).schema);
      if (schema.$ref !== `#/components/schemas/${schemaName}`) throw new Error('Upgrade API path or schema differs');
    }
    return new VerifiedUpgradeContract(object2(object2(api.components).schemas));
  }
  observationPaths(siteName, current, targetSoftware) {
    initialSoftwareSettings(current);
    this.build({ siteName, kind: 'software', version: targetSoftware });
    return {
      site: `/api/config/namespaces/system/sites/${siteName}`,
      targets: `/api/maurice/upgradable_sw_versions?${new URLSearchParams({ current_os_version: current.os, current_sw_version: current.software })}`,
      precheck: `/api/maurice/namespaces/system/sites/${siteName}/pre_upgrade_check?${new URLSearchParams({ sw_version: targetSoftware })}`,
      progress: `/api/maurice/namespaces/system/sites/${siteName}/upgrade_status`,
    };
  }
  build(input) {
    return buildSiteUpgradeRequest(input, input.kind === 'software' ? this.#software : this.#os);
  }
}

// plugins/aws/src/ce/action-args.ts
function resolveAwsCeActionArgs(args, values, bootstrapKeyPairName, allowedUnresolved = []) {
  return args.map((arg) => {
    const literalKey = bootstrapKeyPairName !== undefined && arg === `--key-name=${bootstrapKeyPairName}`;
    const result = literalKey ? arg : arg.replace(/__[A-Z0-9_]+__/g, (key) => values[key] ?? key);
    if (Array.from(result).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))
      throw new Error('AWS action argv contains a control character');
    if (!literalKey && [...result.matchAll(/__[A-Z0-9_]+__/g)].some(([key]) => !allowedUnresolved.includes(key)))
      throw new Error('AWS action has an unresolved runtime identity');
    return result;
  });
}

// plugins/aws/src/ce/attachment-gate.ts
async function assertAttachmentAvailable(action, plan, checkpoint, api) {
  const reference = action.resourceId ?? '';
  const id = checkpoint.resolvedValues[reference] ?? reference;
  if (!/^tgw-attach-[0-9a-f]{8,21}$/.test(id)) throw new Error('Attachment identity is unresolved');
  const connect = reference.startsWith('__TGW_CONNECT_ATTACHMENT_');
  const result = await api.exec('aws', [
    'ec2',
    connect ? 'describe-transit-gateway-connects' : 'describe-transit-gateway-vpc-attachments',
    '--transit-gateway-attachment-ids',
    id,
    '--region',
    plan.region,
    '--output',
    'json',
  ]);
  if (result.exitCode !== 0) throw new Error('Attachment observation unavailable');
  let raw;
  try {
    raw = JSON.parse(result.stdout);
  } catch {
    throw new Error('Malformed attachment observation');
  }
  if (!raw || raw.NextToken) throw new Error('Incomplete attachment observation');
  const entries = raw[connect ? 'TransitGatewayConnects' : 'TransitGatewayVpcAttachments'];
  if (!Array.isArray(entries) || entries.length !== 1)
    throw new Error('Attachment observation is missing or ambiguous');
  const item = entries[0];
  if (!item || item.TransitGatewayAttachmentId !== id || item.TransitGatewayId !== plan.intent.routing.transitGatewayId)
    throw new Error('Attachment scope does not match the deployment');
  if (connect) {
    const transport =
      plan.intent.routing.transportAttachmentId ?? checkpoint.resolvedValues.__TGW_TRANSPORT_ATTACHMENT__;
    if (!transport || item.TransportTransitGatewayAttachmentId !== transport || item.Options?.Protocol !== 'gre')
      throw new Error('Connect transport identity or protocol does not match');
  } else if (
    !(plan.intent.vpc.vpcId ?? checkpoint.resolvedValues.__VPC_ID__) ||
    item.VpcId !== (plan.intent.vpc.vpcId ?? checkpoint.resolvedValues.__VPC_ID__) ||
    item.VpcOwnerId !== plan.accountId
  )
    throw new Error('Transport VPC identity or owner does not match');
  if (id !== plan.intent.routing.transportAttachmentId) {
    if (!Array.isArray(item.Tags)) throw new Error('Attachment ownership evidence unavailable');
    const tags = new Map();
    for (const tag of item.Tags) {
      if (!tag || typeof tag.Key !== 'string' || typeof tag.Value !== 'string' || tags.has(tag.Key))
        throw new Error('Malformed attachment ownership evidence');
      tags.set(tag.Key, tag.Value);
    }
    if (
      tags.get('xcsh-managed-by') !== 'aws-ce' ||
      tags.get('xcsh-deployment-id') !== plan.deploymentName ||
      tags.get('xcsh-execution-engine') !== plan.engine
    )
      throw new Error('Attachment belongs to another deployment or engine');
  }
  if (item.State === 'available') return;
  if (['pending', 'modifying', 'initiating'].includes(item.State)) throw new Error('Attachment has not converged');
  throw new Error('Attachment is in an unsupported or terminal state');
}

// plugins/aws/src/ce/native-empty-inventory.ts
var object3 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Native owner inventory is malformed');
  return value;
};
async function collectAwsNativeEmptyCloudInventory(api, plan, planDigests) {
  if (
    !['aws', 'aws-us-gov', 'aws-cn'].includes(plan.partition) ||
    plan.engine !== 'native' ||
    plan.intent.operation !== 'teardown' ||
    !/^\d{12}$/.test(plan.accountId) ||
    !/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(plan.region) ||
    !/^[a-z][a-z0-9-]{0,62}$/.test(plan.deploymentName) ||
    !planDigests.length ||
    planDigests.some((value) => !/^[a-f0-9]{64}$/.test(value))
  )
    throw Error('Native inventory scope is invalid');
  const read = async (args) => {
    const result = await api.exec('aws', [...args, '--region', plan.region, '--output', 'json', '--no-paginate']);
    if (result.exitCode !== 0) throw Error('Native owner inventory query is unavailable');
    try {
      return object3(JSON.parse(result.stdout));
    } catch {
      throw Error('Native owner inventory response is malformed');
    }
  };
  const identity = await read(['sts', 'get-caller-identity']);
  if (
    identity.Account !== plan.accountId ||
    typeof identity.Arn !== 'string' ||
    !identity.Arn.startsWith(`arn:${plan.partition}:`) ||
    identity.Arn.split(':')[1] !== plan.partition ||
    identity.Arn.split(':')[4] !== plan.accountId
  )
    throw Error('Native inventory authenticated account or partition differs');
  const pages = async (args, field, tokenField, tokenArg, blankEnds = false) => {
    const rows = [],
      tokens = new Set();
    let token;
    for (let page = 0; page < 100; page++) {
      const data = await read([...args, ...(token ? [tokenArg, token] : [])]);
      if (!Array.isArray(data[field])) throw Error('Native owner inventory list is unavailable');
      rows.push(...data[field]);
      const next = data[tokenField];
      if (next === undefined || (blankEnds && next === '')) return rows;
      if (typeof next !== 'string' || !next || next.length > 4096 || tokens.has(next))
        throw Error('Native owner inventory pagination is malformed');
      tokens.add(next);
      token = next;
    }
    throw Error('Native owner inventory pagination is incomplete');
  };
  const filters = [
    { Name: 'key', Values: ['xcsh-deployment-id'] },
    { Name: 'value', Values: [plan.deploymentName] },
  ];
  const selected = await pages(
    ['ec2', 'describe-tags', '--filters', JSON.stringify(filters)],
    'Tags',
    'NextToken',
    '--next-token',
  );
  const ids = new Map();
  for (const raw of selected) {
    const tag = object3(raw);
    if (
      typeof tag.ResourceId !== 'string' ||
      !/^[a-z][a-z-]{0,31}-[0-9a-f]{8,21}$/.test(tag.ResourceId) ||
      typeof tag.ResourceType !== 'string' ||
      !/^[a-z][a-z-]{0,62}$/.test(tag.ResourceType) ||
      tag.Key !== 'xcsh-deployment-id' ||
      tag.Value !== plan.deploymentName ||
      ids.has(tag.ResourceId)
    )
      throw Error('Native EC2 owner inventory identity differs');
    ids.set(tag.ResourceId, tag.ResourceType);
  }
  const tags = (values) => {
    if (!Array.isArray(values)) throw Error('Native owner tags are unavailable');
    const map = new Map();
    for (const raw of values) {
      const row = object3(raw);
      if (typeof row.Key !== 'string' || !row.Key || typeof row.Value !== 'string' || map.has(row.Key))
        throw Error('Native owner tags are malformed');
      map.set(row.Key, row.Value);
    }
    if (
      map.get('xcsh-managed-by') !== 'aws-ce' ||
      map.get('xcsh-deployment-id') !== plan.deploymentName ||
      map.get('xcsh-execution-engine') !== 'native' ||
      !planDigests.includes(map.get('xcsh-plan-sha256') ?? '')
    )
      throw Error('Native inventory owner differs');
    return map;
  };
  const resources = new Set();
  const list = [...ids.keys()];
  for (let index = 0; index < list.length; index += 100) {
    const chunk = list.slice(index, index + 100),
      grouped = new Map(chunk.map((id) => [id, []]));
    const complete = await pages(
      ['ec2', 'describe-tags', '--filters', JSON.stringify([{ Name: 'resource-id', Values: chunk }])],
      'Tags',
      'NextToken',
      '--next-token',
    );
    for (const raw of complete) {
      const row = object3(raw);
      if (
        typeof row.ResourceId !== 'string' ||
        !grouped.has(row.ResourceId) ||
        row.ResourceType !== ids.get(row.ResourceId)
      )
        throw Error('Native EC2 inventory join differs');
      const group = grouped.get(row.ResourceId);
      if (!group) throw Error('Native EC2 inventory join is missing');
      group.push(row);
    }
    for (const [id, rows] of grouped) {
      tags(rows);
      resources.add(id);
    }
  }
  const mappings = await pages(
    [
      'resourcegroupstaggingapi',
      'get-resources',
      '--tag-filters',
      JSON.stringify([{ Key: 'xcsh-deployment-id', Values: [plan.deploymentName] }]),
    ],
    'ResourceTagMappingList',
    'PaginationToken',
    '--pagination-token',
    true,
  );
  const seen = new Set();
  for (const raw of mappings) {
    const row = object3(raw);
    if (typeof row.ResourceARN !== 'string' || seen.has(row.ResourceARN))
      throw Error('Native tagged resource identity is duplicated or malformed');
    const fields = row.ResourceARN.split(':');
    if (
      fields.length < 6 ||
      fields[0] !== 'arn' ||
      fields[1] !== plan.partition ||
      fields[3] !== plan.region ||
      fields[4] !== plan.accountId ||
      !fields.slice(5).join(':')
    )
      throw Error('Native tagged resource account or region differs');
    seen.add(row.ResourceARN);
    tags(row.Tags);
    const resource = fields.slice(5).join(':').split('/').at(-1);
    if (!resource) throw Error('Native tagged resource suffix is missing');
    resources.add(fields[2] === 'ec2' && ids.has(resource) ? resource : row.ResourceARN);
  }
  return {
    status: resources.size ? 'pending' : 'absent',
    expected: resources.size,
    retired: 0,
    remainingResourceIds: [...resources].sort(),
    observedAt: new Date().toISOString(),
    source: 'authenticated-complete-regional-owner-inventory',
  };
}

// plugins/aws/src/ce/delete-recovery.ts
function hasDeleteRecovery(action) {
  return (
    ['resource-delete', 'route-table-disassociate', 'internet-gateway-detach'].includes(action.kind) &&
    action.command === 'aws' &&
    !!action.resourceId
  );
}
function instanceTerminated(state) {
  const reservations = Array.isArray(state.Reservations) ? state.Reservations : [];
  const instances = reservations.flatMap((row) =>
    row && typeof row === 'object' && Array.isArray(row.Instances) ? row.Instances : [],
  );
  return (
    instances.length === 1 &&
    instances[0] !== null &&
    typeof instances[0] === 'object' &&
    instances[0].State?.Name === 'terminated'
  );
}
function mutationConverged(action, state) {
  if (action.kind === 'resource-delete') return false;
  const args = action.args ?? [];
  if (action.kind === 'route-table-disassociate') {
    const associationId = args[args.indexOf('--association-id') + 1];
    const tables = Array.isArray(state.RouteTables) ? state.RouteTables : [];
    const associations = Array.isArray(tables[0]?.Associations) ? tables[0].Associations : [];
    return (
      /^rtbassoc-[0-9a-f]{8,21}$/.test(associationId ?? '') &&
      !associations.some((row) => row.RouteTableAssociationId === associationId)
    );
  }
  const vpcId = args[args.indexOf('--vpc-id') + 1];
  const gateways = Array.isArray(state.InternetGateways) ? state.InternetGateways : [];
  const attachments = Array.isArray(gateways[0]?.Attachments) ? gateways[0].Attachments : [];
  return /^vpc-[0-9a-f]{8,21}$/.test(vpcId ?? '') && !attachments.some((row) => row.VpcId === vpcId);
}
function awsDeleteRequestSha256(plan, action, args) {
  return canonicalSha256({ plan: plan.planSha256, action: action.id, resourceId: action.resourceId, args });
}
function assertAwsPendingDeleteBinding(plan, action, args, checkpoint, ownerDigests) {
  const pending = checkpoint.pendingDelete;
  if (
    !pending ||
    !hasDeleteRecovery(action) ||
    pending.actionId !== action.id ||
    pending.resourceId !== action.resourceId ||
    pending.requestSha256 !== awsDeleteRequestSha256(plan, action, args)
  )
    throw Error('Pending AWS deletion differs from the immutable request');
  const before = pending.before;
  if (
    !before ||
    before.id !== pending.resourceId ||
    before.region !== plan.region ||
    !before.exists ||
    !before.owned ||
    pending.beforeSha256 !== canonicalSha256(before) ||
    before.tags['xcsh-managed-by'] !== 'aws-ce' ||
    before.tags['xcsh-execution-engine'] !== plan.engine ||
    before.tags['xcsh-deployment-id'] !== plan.deploymentName ||
    !ownerDigests.includes(before.tags['xcsh-plan-sha256'])
  )
    throw Error('Pending AWS deletion original observation is unavailable or foreign');
  return before;
}
function provenRequestRejection(result) {
  return (
    [252, 253].includes(result.exitCode) ||
    /^An error occurred \((?:UnauthorizedOperation|AccessDenied|AccessDeniedException|AuthFailure|InvalidClientTokenId|ExpiredToken|UnrecognizedClientException)\) when calling /m.test(
      result.stderr,
    )
  );
}
async function executeRecoverableDelete(api, plan, action, args, checkpoint, persist, ownershipPlanSha256s, signal) {
  if (!hasDeleteRecovery(action) || !action.resourceId) throw new Error('AWS delete recovery driver is unavailable');
  const requestSha256 = awsDeleteRequestSha256(plan, action, args);
  const pending = checkpoint.pendingDelete;
  if (pending) assertAwsPendingDeleteBinding(plan, action, args, checkpoint, ownershipPlanSha256s);
  let rejectedResult;
  let submitted = false;
  if (!pending) {
    const before = (
      await observeAwsResources(api, [action.resourceId], plan.region, {
        deploymentName: plan.deploymentName,
        planSha256s: [...new Set(ownershipPlanSha256s)].sort(),
      })
    )[0];
    if (!before) throw Error('AWS deletion original observation is unavailable');
    if (!before.exists) return { exitCode: 0, stdout: '{}', stderr: '' };
    if (!before.owned || before.tags['xcsh-execution-engine'] !== plan.engine)
      throw Error('AWS deletion original target ownership differs');
    if (action.resourceId.startsWith('i-')) {
      const ids = awsEbsInstanceVolumeIds(before);
      if (ids.length) {
        const disks = await observeAwsResources(api, ids, plan.region, {
          deploymentName: plan.deploymentName,
          planSha256s: ownershipPlanSha256s,
        });
        assertAwsEbsTeardown({ accountId: plan.accountId }, { resources: [before, ...disks] });
      }
    }
    if (action.resourceId.startsWith('vol-')) assertAwsEbsVolumeAvailable(before);
    checkpoint.pendingDelete = {
      actionId: action.id,
      resourceId: action.resourceId,
      requestSha256,
      before,
      beforeSha256: canonicalSha256(before),
    };
    try {
      await persist();
    } catch (error) {
      checkpoint.pendingDelete = undefined;
      throw error;
    }
    try {
      const result = await api.exec('aws', args, { signal });
      if (result.exitCode !== 0) rejectedResult = result;
      else submitted = true;
    } catch {
      signal?.throwIfAborted();
    }
  }
  const deadline = Date.now() + 15 * 60000;
  while (true) {
    signal?.throwIfAborted();
    const observations = await observeAwsResources(api, [action.resourceId], plan.region, {
      deploymentName: plan.deploymentName,
      planSha256s: [...new Set(ownershipPlanSha256s)].sort(),
    });
    const observation = observations[0];
    if (!observation) throw new Error('AWS deletion observation is unavailable');
    if (
      !observation.exists ||
      (action.kind === 'resource-delete' &&
        action.resourceId.startsWith('i-') &&
        instanceTerminated(observation.state)) ||
      mutationConverged(action, observation.state)
    )
      return { exitCode: 0, stdout: '{}', stderr: '' };
    if (!observation.owned || observation.tags['xcsh-execution-engine'] !== plan.engine)
      throw new Error('AWS deletion target ownership changed during reconciliation');
    if (rejectedResult && provenRequestRejection(rejectedResult)) {
      const before = assertAwsPendingDeleteBinding(plan, action, args, checkpoint, ownershipPlanSha256s);
      if (fingerprintOwnedResources([before]) !== fingerprintOwnedResources([observation]))
        throw Error('Rejected AWS deletion target changed; intent is retained');
      checkpoint.pendingDelete = undefined;
      await persist();
      return rejectedResult;
    }
    if (!submitted || Date.now() >= deadline)
      throw new Error('AWS deletion has not converged; resume with the same plan');
    await new Promise((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(new Error('AWS deletion convergence cancelled'));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', abort);
        resolve();
      }, 1e4);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });
  }
}
async function collectAwsNativeCloudRetirement(api, plan, ownershipPlanSha256s) {
  const ids = plan.ownershipInventory
    .filter((row) => row.owned && row.action === 'delete')
    .map((row) => row.resourceId);
  if (!ids.length) return collectAwsNativeEmptyCloudInventory(api, plan, ownershipPlanSha256s);
  const observations = await observeAwsResources(api, ids, plan.region, {
    deploymentName: plan.deploymentName,
    planSha256s: ownershipPlanSha256s,
  });
  const remaining = observations.filter(
    (row) => row.exists && !(row.id.startsWith('i-') && instanceTerminated(row.state)),
  );
  return {
    status: remaining.length ? 'pending' : 'absent',
    expected: ids.length,
    retired: ids.length - remaining.length,
    observedAt: new Date().toISOString(),
  };
}

// plugins/aws/src/ce/delete-revalidation.ts
function projectAwsPendingDeleteObservation(plan, current, checkpoint, args, ownerDigests) {
  const index = checkpoint.completedActionIds.length,
    action = plan.actions[index];
  if (!action || checkpoint.completedActionIds.some((id, i) => plan.actions[i]?.id !== id))
    throw Error('Pending AWS deletion is not the next ordered action');
  const before = assertAwsPendingDeleteBinding(plan, action, args, checkpoint, ownerDigests);
  const selected = current.resources.filter((r) => r.id === before.id);
  if (selected.length !== 1 || selected[0].region !== before.region)
    throw Error('Pending AWS deletion current observation is incomplete');
  const actual = selected[0];
  if (actual.exists && fingerprintOwnedResources([actual]) !== fingerprintOwnedResources([before])) {
    const expected = structuredClone(before);
    if (action.kind === 'route-table-disassociate') {
      const id = args[args.indexOf('--association-id') + 1],
        tables = expected.state.RouteTables;
      if (
        !/^rtbassoc-[a-f0-9]{8,21}$/.test(id ?? '') ||
        !Array.isArray(tables) ||
        tables.length !== 1 ||
        !Array.isArray(tables[0].Associations) ||
        tables[0].Associations.filter((a) => a.RouteTableAssociationId === id).length !== 1
      )
        throw Error('Pending AWS route association binding is incomplete');
      tables[0].Associations = tables[0].Associations.filter((a) => a.RouteTableAssociationId !== id);
    } else if (action.kind === 'internet-gateway-detach') {
      const id = args[args.indexOf('--vpc-id') + 1],
        gateways = expected.state.InternetGateways;
      if (
        !/^vpc-[a-f0-9]{8,21}$/.test(id ?? '') ||
        !Array.isArray(gateways) ||
        gateways.length !== 1 ||
        !Array.isArray(gateways[0].Attachments) ||
        gateways[0].Attachments.filter((a) => a.VpcId === id).length !== 1
      )
        throw Error('Pending AWS gateway attachment binding is incomplete');
      gateways[0].Attachments = gateways[0].Attachments.filter((a) => a.VpcId !== id);
    } else throw Error('Pending AWS deletion target changed outside its authorized transition');
    if (fingerprintOwnedResources([actual]) !== fingerprintOwnedResources([expected]))
      throw Error('Pending AWS deletion contains unrelated target drift');
  }
  return { ...current, resources: current.resources.map((r) => (r.id === before.id ? structuredClone(before) : r)) };
}

// plugins/aws/src/ce/eip-association.ts
async function associateAwsCeEip(api, plan, args, signal) {
  const allocation = args[args.indexOf('--allocation-id') + 1];
  const eni = args[args.indexOf('--network-interface-id') + 1];
  if (
    !/^eipalloc-[0-9a-f]{8,17}$/.test(allocation) ||
    !/^eni-[0-9a-f]{8,17}$/.test(eni) ||
    args[1] !== 'associate-address' ||
    args.includes('--allow-reassociation')
  )
    throw new Error('Explicit non-remapping CE association is required');
  const observe = async () => {
    const result = await api.exec(
      'aws',
      ['ec2', 'describe-addresses', '--allocation-ids', allocation, '--region', plan.region, '--output', 'json'],
      { signal },
    );
    if (result.exitCode) throw new Error('CE EIP association observation is unavailable');
    const data = JSON.parse(result.stdout);
    if (data.NextToken || !Array.isArray(data.Addresses) || data.Addresses.length !== 1)
      throw new Error('Incomplete CE EIP observation');
    const address = data.Addresses[0];
    const tags = Object.fromEntries((address.Tags ?? []).map((tag) => [tag.Key, tag.Value]));
    if (
      address.AllocationId !== allocation ||
      tags['xcsh-managed-by'] !== 'aws-ce' ||
      tags['xcsh-deployment-id'] !== plan.deploymentName ||
      tags['xcsh-execution-engine'] !== plan.engine ||
      tags['xcsh-plan-sha256'] !== plan.planSha256
    )
      throw new Error('CE EIP ownership differs from the deployment');
    if (
      address.AssociationId &&
      (!/^eipassoc-[0-9a-f]{8,17}$/.test(address.AssociationId) || address.NetworkInterfaceId !== eni)
    )
      throw new Error('CE EIP is associated with another target');
    return address.AssociationId;
  };
  let association = await observe();
  if (!association) {
    try {
      await api.exec('aws', [...args, '--no-allow-reassociation'], { signal });
    } catch {
      signal?.throwIfAborted();
    }
    association = await observe();
    if (!association) throw new Error('CE EIP association has not converged; reconcile before retrying');
  }
  return { exitCode: 0, stdout: JSON.stringify({ AssociationId: association }), stderr: '' };
}

// plugins/aws/src/ce/native-operation.ts
import { AsyncLocalStorage } from 'node:async_hooks';
import { join } from 'node:path';

var leases = new AsyncLocalStorage();
async function withAwsNativeOperation(storage, operation, execute) {
  await storage.verify();
  if (
    storage.owner.engine !== 'native' ||
    storage.owner.provider !== 'aws' ||
    !/^[a-f0-9]{64}$/.test(operation.kind === 'apply' ? operation.planSha256 : operation.cloudPlanSha256)
  )
    throw Error('Native operation owner or plan identity differs');
  const ownerSha256 = canonicalSha256(storage.owner),
    current = leases.getStore();
  if (
    current?.active &&
    current.directory === storage.directory &&
    current.ownerSha256 === ownerSha256 &&
    operation.kind === 'apply' &&
    operation.operation === 'teardown' &&
    current.cloudPlanSha256 === operation.planSha256
  )
    return execute();
  const release = await acquireProcessLock(join(storage.directory, '.aws-native-operation-lock'));
  const lease = {
    directory: storage.directory,
    ownerSha256,
    cloudPlanSha256: operation.kind === 'retire' ? operation.cloudPlanSha256 : undefined,
    active: true,
  };
  try {
    if (operation.kind === 'apply' && operation.operation !== 'teardown') {
      try {
        await storage.read('aws-native-lifecycle-retirement.json');
      } catch (error) {
        if (error.code === 'ENOENT') return await leases.run(lease, execute);
        throw Error('Native retirement evidence is unavailable or malformed');
      }
      throw Error('The native deployment is retiring or retired; application cannot resume');
    }
    return await leases.run(lease, execute);
  } finally {
    lease.active = false;
    await release();
  }
}

// plugins/aws/src/ce/native-routing-checkpoint.ts
function compileAwsNativeRoutingCheckpoint(plan, checkpoint, owner) {
  verifyAwsCePlan(plan);
  if (
    plan.engine !== 'native' ||
    plan.routing.profile !== 'tgw-connect' ||
    checkpoint.schemaVersion !== 2 ||
    checkpoint.engine !== 'native' ||
    checkpoint.planId !== plan.planId ||
    checkpoint.planSha256 !== plan.planSha256 ||
    owner.engine !== 'native' ||
    owner.provider !== 'aws' ||
    owner.deploymentId !== plan.deploymentName ||
    owner.account !== plan.accountId ||
    owner.region !== plan.region
  )
    throw new Error('Native routing checkpoint source or ownership differs');
  const actions = plan.actions.filter((action) => action.kind === 'tgw-connect-peer-create');
  if (!actions.length) throw new Error('Native routing checkpoint has no Connect topology');
  const resources = siteBindings(plan)
    .flatMap(({ site }) => {
      const connectors = actions
        .filter((action) => site.nodeIndexes.includes(action.node ?? 0))
        .map((action) => ({
          siteName: site.name,
          kind: 'external_connector',
          name: `${plan.deploymentName.slice(0, 24)}-gre-${actions.indexOf(action) + 1}`,
        }));
      if (!connectors.length) throw new Error('Native routing checkpoint site has no Connect peers');
      return [
        ...connectors,
        {
          siteName: site.name,
          kind: 'bgp_routing_policy',
          name: `${site.name.slice(0, 43)}-tgw-export-policy`,
        },
        { siteName: site.name, kind: 'bgp', name: `${site.name.slice(0, 55)}-tgw-bgp` },
      ];
    })
    .map((resource) => {
      const uid = checkpoint.resolvedValues[`__XC_ROUTING_${resource.name}__`];
      if (typeof uid !== 'string' || !uid.trim()) throw new Error('Native routing checkpoint UID is missing');
      return { ...resource, uid };
    });
  if (new Set(resources.map((resource) => resource.uid)).size !== resources.length)
    throw new Error('Native routing checkpoint UIDs are duplicated');
  return {
    schemaVersion: 2,
    engine: 'native',
    planId: plan.planId,
    planSha256: plan.planSha256,
    ownerSha256: canonicalSha256(owner),
    resources,
  };
}
async function persistAwsNativeRoutingCheckpoint(plan, checkpoint, storage) {
  await storage.verify();
  const result = compileAwsNativeRoutingCheckpoint(plan, checkpoint, storage.owner);
  await storage.write('native-routing-checkpoint.json', result);
  return result;
}

// plugins/aws/src/ce/native-site-replacement.ts
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
// plugins/aws/src/ce/network-health.ts
import { isIP as isIP3 } from 'node:net';
import { join as join2 } from 'node:path';

function object4(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed network evidence');
  return value;
}
async function read(api, args, region) {
  const result = await api.exec('aws', [...args, '--region', region, '--output', 'json']);
  if (result.exitCode !== 0) throw new Error('Network observation unavailable');
  const raw = object4(JSON.parse(result.stdout));
  if (['NextToken', 'NextMarker'].some((key) => Object.hasOwn(raw, key)))
    throw new Error('Incomplete network evidence');
  return raw;
}
async function collectPlannedVpcRoutes(plan, checkpoint, api) {
  const values = checkpoint?.resolvedValues ?? {};
  const resolve = (value) => (value?.startsWith('__') ? values[value] : value);
  const arg = (args, flag) => {
    const index = args?.indexOf(flag) ?? -1;
    return index < 0 ? undefined : resolve(args?.[index + 1]);
  };
  const actions = plan.actions.filter(
    (action) => action.command === 'aws' && ['route-create', 'route-replace'].includes(action.kind),
  );
  const targetFlags = {
    '--network-interface-id': 'NetworkInterfaceId',
    '--transit-gateway-id': 'TransitGatewayId',
    '--gateway-id': 'GatewayId',
    '--nat-gateway-id': 'NatGatewayId',
  };
  const expected = actions.map((action) => {
    const flags = Object.entries(targetFlags).filter(([flag]) => action.args?.includes(flag));
    const tableId = arg(action.args, '--route-table-id');
    const destination = arg(action.args, '--destination-cidr-block');
    if (
      flags.length !== 1 ||
      !/^rtb-[0-9a-f]{8,21}$/.test(tableId ?? '') ||
      !destination ||
      !arg(action.args, flags[0][0])
    )
      throw new Error('Planned VPC route identity is incomplete');
    return {
      tableId,
      destination,
      field: flags[0][1],
      target: arg(action.args, flags[0][0]),
    };
  });
  const observations = [];
  for (const tableId of [...new Set(expected.map((route) => route.tableId))]) {
    const response = await read(api, ['ec2', 'describe-route-tables', '--route-table-ids', tableId], plan.region);
    if (!Array.isArray(response.RouteTables) || response.RouteTables.length !== 1)
      throw new Error('Missing VPC route table evidence');
    const table = object4(response.RouteTables[0]);
    const vpcId = plan.intent.vpc.vpcId ?? values.__VPC_ID__;
    if (table.RouteTableId !== tableId || !vpcId || table.VpcId !== vpcId || !Array.isArray(table.Routes))
      throw new Error('VPC route table scope or response is incomplete');
    for (const route of expected.filter((route) => route.tableId === tableId)) {
      const matches = table.Routes.map(object4).filter((row) => row.DestinationCidrBlock === route.destination);
      if (matches.length > 1) throw new Error('Ambiguous VPC route evidence');
      observations.push({
        tableId,
        destination: route.destination,
        targetField: route.field,
        expectedTarget: route.target,
        observedTarget: matches[0]?.[route.field] ?? null,
        state: matches[0]?.State ?? 'missing',
        status: matches[0]?.[route.field] === route.target && matches[0]?.State === 'active' ? 'healthy' : 'degraded',
      });
    }
    for (const association of plan.actions.filter(
      (action) => action.kind === 'route-table-associate' && arg(action.args, '--route-table-id') === tableId,
    )) {
      if (!Array.isArray(table.Associations)) throw new Error('Missing subnet route association evidence');
      const subnet = arg(association.args, '--subnet-id');
      const matches = table.Associations.map(object4).filter((row) => row.SubnetId === subnet);
      if (!subnet || matches.length > 1) throw new Error('Ambiguous subnet route association evidence');
      const state = matches.length ? object4(matches[0].AssociationState).State : 'missing';
      observations.push({ tableId, subnetId: subnet, state, status: state === 'associated' ? 'healthy' : 'degraded' });
    }
  }
  return {
    source: 'aws:describe-route-tables',
    observedAt: new Date().toISOString(),
    observations,
    status: !expected.length
      ? 'not-requested'
      : observations.every((row) => row.status === 'healthy')
        ? 'healthy'
        : 'degraded',
    traffic: 'unknown',
  };
}
function owned(value, plan) {
  if (!Array.isArray(value)) return false;
  const tags = new Map();
  for (const item of value) {
    const tag = object4(item);
    if (typeof tag.Key !== 'string' || typeof tag.Value !== 'string' || tags.has(tag.Key)) return false;
    tags.set(tag.Key, tag.Value);
  }
  return (
    tags.get('xcsh-managed-by') === 'aws-ce' &&
    tags.get('xcsh-deployment-id') === plan.deploymentName &&
    tags.get('xcsh-execution-engine') === plan.engine
  );
}
async function collectAwsNetworkHealth(kind, plan, checkpoint, api, signal) {
  const binding = {
    deploymentId: plan.deploymentName,
    siteName: plan.siteName,
    engine: plan.engine,
    accountId: plan.accountId,
    region: plan.region,
    observedAt: new Date().toISOString(),
    source: 'aws-cli-live',
  };
  try {
    signal?.throwIfAborted();
    const identity = await read(api, ['sts', 'get-caller-identity'], plan.region);
    if (identity.Account !== plan.accountId) throw new Error('Network observation account differs');
    const values = checkpoint?.resolvedValues ?? {};
    if (kind === 'bgp') {
      if (!Number.isInteger(plan.routing.customerAsn) || !Number.isInteger(plan.routing.transitGatewayAsn))
        throw new Error('Missing expected ASNs');
      const actions = plan.actions.filter((action) => action.kind === 'tgw-connect-peer-create');
      const ids = actions.map((action) => values[action.capture?.placeholder ?? '']);
      if (
        !ids.length ||
        ids.some((id) => !/^tgw-connect-peer-[0-9a-f]{8,21}$/.test(id ?? '')) ||
        new Set(ids).size !== ids.length
      )
        throw new Error('Missing peer identities');
      const raw = await read(
        api,
        ['ec2', 'describe-transit-gateway-connect-peers', '--transit-gateway-connect-peer-ids', ...ids],
        plan.region,
      );
      if (!Array.isArray(raw.TransitGatewayConnectPeers) || raw.TransitGatewayConnectPeers.length !== ids.length)
        throw new Error('Missing peer evidence');
      const seen = new Set();
      const sessions = [];
      const transports = [];
      let available = true;
      for (const value of raw.TransitGatewayConnectPeers) {
        const peer = object4(value);
        const id = String(peer.TransitGatewayConnectPeerId);
        const action = actions[ids.indexOf(id)];
        const attachmentArgument = action?.args?.includes('--transit-gateway-attachment-id')
          ? action.args[action.args.indexOf('--transit-gateway-attachment-id') + 1]
          : undefined;
        const expectedAttachment = attachmentArgument?.startsWith('__')
          ? values[attachmentArgument]
          : (attachmentArgument ?? values.__TGW_CONNECT_ATTACHMENT__);
        if (
          !ids.includes(id) ||
          seen.has(id) ||
          !owned(peer.Tags, plan) ||
          peer.TransitGatewayAttachmentId !== expectedAttachment
        )
          throw new Error('Foreign peer evidence');
        seen.add(id);
        const config = object4(peer.ConnectPeerConfiguration);
        const transportIndex = action.args?.indexOf('--peer-address') ?? -1;
        const transportArgument = transportIndex >= 0 ? action.args?.[transportIndex + 1] : undefined;
        const transportAddress = transportArgument?.startsWith('__') ? values[transportArgument] : transportArgument;
        const expectedGatewayAddress = action.args?.includes('--transit-gateway-address')
          ? action.args[action.args.indexOf('--transit-gateway-address') + 1]
          : undefined;
        if (
          config.PeerAddress !== (transportAddress ?? values[`__NODE_${action.node}_SLI_IP__`]) ||
          (expectedGatewayAddress !== undefined && config.TransitGatewayAddress !== expectedGatewayAddress) ||
          config.Protocol !== 'gre' ||
          !Array.isArray(config.BgpConfigurations) ||
          config.BgpConfigurations.length !== 2
        )
          throw new Error('Peer topology differs');
        if (
          isIP3(String(config.TransitGatewayAddress)) !== 4 ||
          !Array.isArray(config.InsideCidrBlocks) ||
          config.InsideCidrBlocks.length !== 1 ||
          typeof config.InsideCidrBlocks[0] !== 'string'
        )
          throw new Error('Missing GRE endpoint facts');
        const cidrIndex = action.args?.indexOf('--inside-cidr-blocks') ?? -1;
        const plannedCidr = cidrIndex >= 0 ? action.args?.[cidrIndex + 1] : undefined;
        const [insideAddress, insidePrefix] = String(config.InsideCidrBlocks[0]).split('/');
        const ipv4 = (address) => address.split('.').reduce((value, octet) => value * 256 + Number(octet), 0);
        if (
          config.InsideCidrBlocks[0] !== plannedCidr ||
          isIP3(insideAddress) !== 4 ||
          insidePrefix !== '29' ||
          ipv4(insideAddress) % 8 !== 0
        )
          throw new Error('GRE inside CIDR differs from plan');
        const insideNetwork = ipv4(insideAddress);
        let ceEndpoint;
        transports.push({
          peerId: id,
          awsGreAddress: config.TransitGatewayAddress,
          ceGreAddress: config.PeerAddress,
          insideCidr: config.InsideCidrBlocks[0],
        });
        available &&= peer.State === 'available';
        const addresses = new Set();
        for (const item of config.BgpConfigurations) {
          const session = object4(item);
          const endpoint = String(session.TransitGatewayAddress);
          if (
            isIP3(endpoint) !== 4 ||
            isIP3(String(session.PeerAddress)) !== 4 ||
            addresses.has(endpoint) ||
            session.TransitGatewayAsn !== plan.routing.transitGatewayAsn ||
            session.PeerAsn !== plan.routing.customerAsn ||
            !['up', 'down'].includes(String(session.BgpStatus))
          )
            throw new Error('Invalid BGP session evidence');
          const local = String(session.PeerAddress);
          if (
            [endpoint, local].some((address) => ipv4(address) <= insideNetwork || ipv4(address) >= insideNetwork + 7) ||
            endpoint === local ||
            (ceEndpoint !== undefined && ceEndpoint !== local)
          )
            throw new Error('BGP endpoint is outside its planned tunnel');
          ceEndpoint = local;
          addresses.add(endpoint);
          sessions.push({
            peerId: id,
            awsEndpoint: endpoint,
            ceEndpoint: session.PeerAddress,
            status: session.BgpStatus,
          });
        }
      }
      const established = sessions.filter((session) => session.status === 'up').length;
      return {
        ...binding,
        status: available && established === sessions.length ? 'healthy' : 'degraded',
        expectedPeers: ids.length,
        expectedSessions: ids.length * 2,
        establishedSessions: established,
        sessions,
        transports,
        packetTtlEvidence: 'unknown',
        routes: 'unknown',
        traffic: 'unknown',
      };
    }
    if (kind === 'routes') {
      const vpcRoutes = await collectPlannedVpcRoutes(plan, checkpoint, api);
      const expected = (actionKind) =>
        plan.actions
          .filter((action) => action.kind === actionKind)
          .map((action) => {
            const arg = (flag) => {
              const index = action.args?.indexOf(flag) ?? -1;
              const value = index >= 0 ? action.args?.[index + 1] : undefined;
              return value?.startsWith('__') ? values[value] : value;
            };
            return {
              tableId: arg('--transit-gateway-route-table-id'),
              attachmentId: arg('--transit-gateway-attachment-id'),
              destination: arg('--destination-cidr-block'),
            };
          });
      const associations = expected('tgw-associate');
      const propagations = expected('tgw-propagate');
      const routes = expected('tgw-route-create');
      const pairs = [...associations, ...propagations, ...routes];
      if (
        !pairs.length ||
        pairs.some(
          ({ tableId, attachmentId }) =>
            !/^tgw-rtb-[0-9a-f]{8,21}$/.test(tableId ?? '') || !/^tgw-attach-[0-9a-f]{8,21}$/.test(attachmentId ?? ''),
        ) ||
        routes.some(
          ({ destination }) => !destination || (isIP3(destination.split('/')[0]) === 0 && destination !== '0.0.0.0/0'),
        )
      )
        throw new Error('Missing planned TGW route identities');
      const tableIds = [...new Set(pairs.map(({ tableId }) => tableId))].sort();
      const observedAssociations = [];
      const observedPropagations = [];
      for (const tableId of tableIds) {
        const associationRows = await read(
          api,
          ['ec2', 'get-transit-gateway-route-table-associations', '--transit-gateway-route-table-id', tableId],
          plan.region,
        );
        if (!Array.isArray(associationRows.Associations)) throw new Error('Missing TGW association evidence');
        for (const item of associationRows.Associations) {
          const row = object4(item);
          if (
            typeof row.TransitGatewayAttachmentId !== 'string' ||
            typeof row.State !== 'string' ||
            !['associating', 'associated', 'disassociating', 'disassociated'].includes(row.State)
          )
            throw new Error('Invalid TGW association evidence');
          observedAssociations.push({
            tableId,
            attachmentId: row.TransitGatewayAttachmentId,
            state: row.State,
          });
        }
        const propagationRows = await read(
          api,
          ['ec2', 'get-transit-gateway-route-table-propagations', '--transit-gateway-route-table-id', tableId],
          plan.region,
        );
        if (!Array.isArray(propagationRows.TransitGatewayRouteTablePropagations))
          throw new Error('Missing TGW propagation evidence');
        for (const item of propagationRows.TransitGatewayRouteTablePropagations) {
          const row = object4(item);
          if (
            typeof row.TransitGatewayAttachmentId !== 'string' ||
            typeof row.State !== 'string' ||
            !['enabling', 'enabled', 'disabling', 'disabled'].includes(row.State)
          )
            throw new Error('Invalid TGW propagation evidence');
          observedPropagations.push({
            tableId,
            attachmentId: row.TransitGatewayAttachmentId,
            state: row.State,
          });
        }
      }
      const observedRoutes = [];
      for (const route of routes) {
        const raw = await read(
          api,
          [
            'ec2',
            'search-transit-gateway-routes',
            '--transit-gateway-route-table-id',
            route.tableId,
            '--filters',
            `Name=route-search.exact-match,Values=${route.destination}`,
          ],
          plan.region,
        );
        if (
          raw.AdditionalRoutesAvailable === true ||
          (raw.AdditionalRoutesAvailable !== undefined && typeof raw.AdditionalRoutesAvailable !== 'boolean') ||
          !Array.isArray(raw.Routes) ||
          raw.Routes.length !== 1
        )
          throw new Error('Incomplete TGW route evidence');
        const row = object4(raw.Routes[0]);
        if (!Array.isArray(row.TransitGatewayAttachments) || row.TransitGatewayAttachments.length !== 1)
          throw new Error('Ambiguous TGW route attachment evidence');
        const attachment = object4(row.TransitGatewayAttachments[0]);
        if (
          row.DestinationCidrBlock !== route.destination ||
          typeof row.State !== 'string' ||
          typeof row.Type !== 'string' ||
          attachment.TransitGatewayAttachmentId !== route.attachmentId
        )
          throw new Error('TGW route differs from plan');
        observedRoutes.push({
          tableId: route.tableId,
          destination: route.destination,
          attachmentId: route.attachmentId,
          state: row.State,
          type: row.Type,
        });
      }
      const pair = (rows, tableId, attachmentId) =>
        rows.filter((row) => row.tableId === tableId && row.attachmentId === attachmentId);
      const healthy =
        associations.every(
          ({ tableId, attachmentId }) =>
            pair(observedAssociations, tableId, attachmentId).length === 1 &&
            pair(observedAssociations, tableId, attachmentId)[0].state === 'associated',
        ) &&
        propagations.every(
          ({ tableId, attachmentId }) =>
            pair(observedPropagations, tableId, attachmentId).length === 1 &&
            pair(observedPropagations, tableId, attachmentId)[0].state === 'enabled',
        ) &&
        observedRoutes.every((route) => route.state === 'active' && route.type === 'static') &&
        ['healthy', 'not-requested'].includes(vpcRoutes.status);
      return {
        ...binding,
        status: healthy ? 'healthy' : 'degraded',
        expectedAssociations: associations.length,
        expectedPropagations: propagations.length,
        expectedRoutes: routes.length,
        associations: observedAssociations.filter((row) =>
          associations.some(
            ({ tableId, attachmentId }) => tableId === row.tableId && attachmentId === row.attachmentId,
          ),
        ),
        propagations: observedPropagations.filter((row) =>
          propagations.some(
            ({ tableId, attachmentId }) => tableId === row.tableId && attachmentId === row.attachmentId,
          ),
        ),
        routes: observedRoutes,
        vpcRoutes,
        traffic: 'unknown',
      };
    }
    const arn = values.__NLB_TARGET_GROUP_ARN__;
    if (
      typeof arn !== 'string' ||
      !arn.startsWith(`arn:${plan.intent.partition}:elasticloadbalancing:${plan.region}:${plan.accountId}:targetgroup/`)
    )
      throw new Error('Missing scoped target group');
    const rawTags = await read(api, ['elbv2', 'describe-tags', '--resource-arns', arn], plan.region);
    if (!Array.isArray(rawTags.TagDescriptions) || rawTags.TagDescriptions.length !== 1)
      throw new Error('Missing target group ownership');
    const description = object4(rawTags.TagDescriptions[0]);
    if (description.ResourceArn !== arn || !owned(description.Tags, plan)) throw new Error('Foreign target group');
    const expected =
      plan.intent.ingress?.mode === 'nlb'
        ? (plan.intent.ingress.listener.privateAddresses ??
          Array.from({ length: plan.topology.nodeCount }, (_, index) => values[`__NODE_${index + 1}_SLI_IP__`]))
        : Array.from({ length: plan.topology.nodeCount }, (_, index) => values[`__NODE_${index + 1}_SLI_IP__`]);
    if (expected.some((address) => isIP3(address ?? '') !== 4) || new Set(expected).size !== expected.length)
      throw new Error('Missing target identities');
    const raw = await read(api, ['elbv2', 'describe-target-health', '--target-group-arn', arn], plan.region);
    if (!Array.isArray(raw.TargetHealthDescriptions) || raw.TargetHealthDescriptions.length !== expected.length)
      throw new Error('Incomplete target membership');
    const seen = new Set();
    const targets = raw.TargetHealthDescriptions.map((value) => {
      const row = object4(value);
      const target = object4(row.Target);
      const health = object4(row.TargetHealth);
      if (
        typeof target.Id !== 'string' ||
        !expected.includes(target.Id) ||
        seen.has(target.Id) ||
        target.Port !== (plan.intent.ingress?.mode === 'nlb' ? plan.intent.ingress.port : 443) ||
        !['healthy', 'initial', 'unhealthy', 'unused', 'draining', 'unavailable', 'unhealthy.draining'].includes(
          String(health.State),
        )
      )
        throw new Error('Invalid target evidence');
      seen.add(target.Id);
      return { address: target.Id, port: target.Port, state: health.State };
    });
    return {
      ...binding,
      status: targets.every((target) => target.state === 'healthy') ? 'healthy' : 'degraded',
      targetGroupArn: arn,
      targets,
      traffic: 'unknown',
    };
  } catch {
    signal?.throwIfAborted();
    return { ...binding, status: 'unknown', reason: 'network-evidence-unavailable-or-invalid' };
  }
}

// plugins/platform/src/ce/interface-admission.ts
var name = (v) => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(v);
var mac = (v) =>
  typeof v === 'string' &&
  /^(?:[a-fA-F0-9]{2}:){5}[a-fA-F0-9]{2}$/.test(v) &&
  v !== '00:00:00:00:00:00' &&
  (Number.parseInt(v.slice(0, 2), 16) & 1) === 0
    ? v.toLowerCase()
    : undefined;
function requireCompleteInterfaceEvidence(observation, expected) {
  const fail = () => {
    throw Error('Complete identity-verified interface evidence is required');
  };
  if (
    !observation ||
    !['observed', 'down'].includes(observation.status) ||
    !Array.isArray(observation.interfaces) ||
    !Array.isArray(expected) ||
    expected.length === 0 ||
    observation.interfaces.length !== expected.length
  )
    fail();
  const expectedIds = new Set(),
    physicalMacs = new Set(),
    devices = new Set(),
    objects = new Set();
  for (const wanted of expected) {
    const address = mac(wanted.mac),
      key = `${wanted.node}/${wanted.role}`;
    if (
      !name(wanted.node) ||
      !['slo', 'data', 'sli'].includes(wanted.role) ||
      !address ||
      physicalMacs.has(address) ||
      expectedIds.has(key)
    )
      fail();
    expectedIds.add(key);
    physicalMacs.add(address);
    const matches = observation.interfaces.filter(
      (row) => row && row.node === wanted.node && row.role === wanted.role && mac(row.mac) === address,
    );
    if (matches.length !== 1) fail();
    const row = matches[0],
      deviceKey = `${row.node}/${row.device}`;
    if (
      typeof row.linkUp !== 'boolean' ||
      !name(row.device) ||
      !name(row.interfaceName) ||
      (wanted.device !== undefined && row.device !== wanted.device) ||
      !Number.isInteger(row.mtu) ||
      (row.mtu !== 0 && (row.mtu < 576 || row.mtu > 8000)) ||
      devices.has(deviceKey) ||
      objects.has(row.interfaceName)
    )
      fail();
    devices.add(deviceKey);
    objects.add(row.interfaceName);
  }
  if (observation.status !== (observation.interfaces.every((row) => row.linkUp) ? 'observed' : 'down')) fail();
}
function requireQualifiedUpInterfaceEvidence(observation, expected) {
  const fail = () => {
    throw Error('Qualified current up interface evidence is required before routing mutation');
  };
  if (
    observation?.status !== 'observed' ||
    observation.freshness !== 'verified' ||
    observation.canSatisfyInterfaceMutationGate !== true
  )
    fail();
  try {
    requireCompleteInterfaceEvidence(observation, expected);
  } catch {
    fail();
  }
}

// plugins/aws/src/ce/routing-apply.ts
function validateAwsRoutingRebind(plan, rebind) {
  const selected = siteBindings(plan).find(({ site }) => site.name === rebind.siteName);
  const cp = rebind.checkpoint;
  if (
    !selected ||
    !rebind.siteUid ||
    cp.schemaVersion !== 2 ||
    cp.engine !== plan.engine ||
    cp.planSha256 !== plan.planSha256 ||
    cp.planId !== plan.planId ||
    !cp.resolvedValues ||
    typeof cp.resolvedValues !== 'object' ||
    Array.isArray(cp.resolvedValues)
  )
    throw new Error('Replacement routing checkpoint differs from deployment');
  const actions = plan.actions.filter((action) => action.kind === 'tgw-connect-peer-create');
  const names = actions
    .filter((action) => selected.site.nodeIndexes.includes(action.node ?? 0))
    .map((action) => `${plan.deploymentName.slice(0, 24)}-gre-${actions.indexOf(action) + 1}`);
  if (!names.length) throw new Error('Replacement site has no Connect routing inventory');
  names.push(`${rebind.siteName.slice(0, 55)}-tgw-bgp`);
  names.push(`${rebind.siteName.slice(0, 43)}-tgw-export-policy`);
  const uids = names.map((name) => cp.resolvedValues[`__XC_ROUTING_${name}__`]);
  if (uids.some((uid) => typeof uid !== 'string' || !uid.trim()) || new Set(uids).size !== uids.length)
    throw new Error('Replacement routing UIDs are missing or duplicated');
}
async function configureAwsRouting(runtime, plan, checkpoint, api, persist, signal, rebind) {
  if (rebind) validateAwsRoutingRebind(plan, rebind);
  const facts = await collectAwsNetworkHealth('bgp', plan, checkpoint, api, signal);
  if (facts.status === 'unknown' || !Array.isArray(facts.sessions) || !Array.isArray(facts.transports))
    throw new Error('AWS GRE endpoint evidence has not converged');
  const actions = plan.actions.filter((action) => action.kind === 'tgw-connect-peer-create');
  for (const { site, binding } of siteBindings(plan)) {
    if (rebind && site.name !== rebind.siteName) continue;
    const peers = actions.filter((action) => site.nodeIndexes.includes(action.node ?? 0));
    const expected = peers.map((action) => {
      const argument = action.args?.[action.args.indexOf('--peer-address') + 1];
      const role = argument?.includes('_SLO_IP__') ? 'slo' : 'sli';
      const node = `${plan.deploymentName}-${action.node}`;
      const mac = checkpoint.resolvedValues[`__ENI_${action.node}_${role === 'slo' ? 0 : 1}_MAC__`];
      if (!mac) throw new Error('AWS GRE transport MAC is unavailable');
      return { node, role, mac };
    });
    const unique = expected.filter(
      (item, index) => expected.findIndex((other) => other.node === item.node && other.mac === item.mac) === index,
    );
    const observed = await runtime.observeAwsInterfaces(binding, unique, signal);
    if (observed.status !== 'observed') throw new Error('XC GRE interface evidence has not converged');
    requireQualifiedUpInterfaceEvidence(observed, unique);
    const interfaces = peers.map((action, index) => {
      const peerId = checkpoint.resolvedValues[action.capture?.placeholder ?? ''];
      const transport = facts.transports.find((item) => item.peerId === peerId);
      const sessions = facts.sessions.filter((item) => item.peerId === peerId);
      const iface = observed.interfaces.find(
        (item) =>
          item.node === expected[index].node &&
          item.mac === expected[index].mac.toLowerCase() &&
          item.role === expected[index].role,
      );
      if (!transport || sessions.length !== 2 || sessions[0].ceEndpoint !== sessions[1].ceEndpoint || !iface)
        throw new Error('GRE endpoint binding is incomplete');
      return {
        name: `${plan.deploymentName.slice(0, 24)}-gre-${actions.indexOf(action) + 1}`,
        node: iface.node,
        interfaceName: iface.interfaceName,
        interfaceMtu: iface.mtu,
        awsGreAddress: String(transport.awsGreAddress),
        ceInsideAddress: String(sessions[0].ceEndpoint),
        awsBgpAddresses: sessions.map((item) => String(item.awsEndpoint)).sort(),
      };
    });
    await runtime.ensureAwsRouting(
      binding,
      plan.routing.customerAsn ?? 0,
      plan.routing.transitGatewayAsn ?? 0,
      interfaces,
      plan.routing.destinationCidrs,
      async (resource) => {
        checkpoint.resolvedValues[`__XC_ROUTING_${String(resource.name)}__`] = String(resource.uid);
        await persist();
      },
      signal,
      rebind
        ? {
            contract: rebind.contract,
            siteUid: rebind.siteUid,
            resources: [
              ...interfaces.map((item) => ({ kind: 'external_connector', name: item.name })),
              {
                kind: 'bgp_routing_policy',
                name: `${binding.siteName.slice(0, 43)}-tgw-export-policy`,
              },
              { kind: 'bgp', name: `${binding.siteName.slice(0, 55)}-tgw-bgp` },
            ].map((item) => ({ ...item, uid: rebind.checkpoint.resolvedValues[`__XC_ROUTING_${item.name}__`] ?? '' })),
          }
        : undefined,
    );
  }
}

// plugins/aws/src/ce/native-site-replacement.ts
var object5 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Malformed AWS replacement observation');
  return value;
};
var list = (value) => {
  if (!Array.isArray(value)) throw new Error('Incomplete AWS replacement observation');
  return value.map(object5);
};
var instanceRows = (value) => list(value.Reservations).flatMap((row) => list(row.Instances));
function createNativeAwsSiteReplacementDriver(source, raw, storage, routing) {
  verifyAwsCePlan(source);
  if (source.engine !== 'native') throw new Error('Replacement requires a native source plan');
  const base = structuredClone(source);
  const routingSource = routing ? structuredClone(routing.checkpoint) : undefined;
  if (routing && routing.runtime.engine !== 'native')
    throw new Error('Connect replacement requires automatic routing recovery');
  const token = (plan, node) => canonicalSha256({ replacement: plan.planSha256, node });
  const nodeIndex = (node) => {
    const index = Number(node.slice(base.deploymentName.length + 1));
    if (
      node !== `${base.deploymentName}-${index}` ||
      !Number.isInteger(index) ||
      index < 1 ||
      index > base.intent.topology.nodeCount
    )
      throw new Error('Replacement node is outside the source plan');
    return index;
  };
  const validate = async (plan) => {
    const { planId, planSha256, ...draft } = plan;
    const selected = siteBindings(base).find(({ binding }) => binding.siteName === plan.binding.siteName);
    if (
      plan.schemaVersion !== 2 ||
      plan.kind !== 'aws-ce-site-replacement' ||
      plan.engine !== 'native' ||
      plan.sourcePlanSha256 !== base.planSha256 ||
      canonicalSha256(draft) !== planSha256 ||
      planId !== `aws-ce-replace-${planSha256.slice(0, 24)}` ||
      !selected ||
      canonicalSha256(selected.binding) !== canonicalSha256(plan.binding) ||
      canonicalSha256(storage.owner) !== canonicalSha256(plan.binding.owner)
    )
      throw new Error('Native replacement ownership or plan integrity differs');
    if (base.routing?.profile === 'tgw-connect') {
      if (!routing || !routingSource) {
        if (plan.preparation.evidenceKind !== 'preboot-interface-configuration-required')
          throw new Error('Replacement routing runtime is unavailable');
      } else {
        validateAwsRoutingRebind(base, {
          siteName: plan.binding.siteName,
          siteUid: String(plan.preparation.uid),
          contract: routing.contract,
          checkpoint: routingSource,
        });
        const name = `${plan.planId}-routing-source.json`;
        const expected = { replacementPlanSha256: plan.planSha256, checkpoint: routingSource };
        try {
          if (canonicalSha256(await storage.read(name)) !== canonicalSha256(expected))
            throw new Error('Replacement routing source changed');
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          await storage.write(name, expected);
        }
      }
    }
    for (const node of plan.binding.nodes) launchArgs(plan, node);
    await storage.verify();
  };
  const request = async (api, args) => {
    const result = await api.exec('aws', [...args, '--region', base.region, '--output', 'json']);
    if (result.exitCode) throw new Error(`AWS replacement ${args[1]} failed; reconcile before retrying`);
    const response = object5(JSON.parse(result.stdout));
    if (response.NextToken || response.nextToken) throw new Error('Partial AWS replacement observation');
    return response;
  };
  const identity = async (api) => {
    const found = await request(api, ['sts', 'get-caller-identity']);
    if (found.Account !== base.accountId || !String(found.Arn).startsWith(`arn:${base.partition}:`))
      throw new Error('AWS replacement account or partition differs');
  };
  const resource = async (api, id, hash) => {
    const [found] = await observeAwsResources(api, [id], base.region, {
      deploymentName: base.deploymentName,
      planSha256s: [hash],
    });
    if (!found.exists || !found.owned || found.tags['xcsh-execution-engine'] !== 'native')
      throw new Error('AWS replacement resource ownership is unavailable or differs');
    if (found.state.NextToken || found.state.nextToken) throw new Error('Partial AWS replacement observation');
    return found;
  };
  const instance = async (api, plan, node, id, fresh) => {
    const found = await resource(api, id, fresh ? plan.planSha256 : base.planSha256);
    const rows = instanceRows(found.state);
    if (rows.length !== 1 || rows[0].InstanceId !== id) throw new Error('Ambiguous replacement instance observation');
    const row = rows[0];
    const index = nodeIndex(node);
    if (
      found.tags['xcsh-node-index'] !== String(index) ||
      found.tags['ves-io-site-name'] !== plan.binding.siteName ||
      row.ImageId !== base.intent.image.amiId ||
      row.InstanceType !== base.intent.instance.type ||
      object5(row.Placement).AvailabilityZone !== base.intent.interfaces[0].subnets[index - 1].availabilityZone ||
      (fresh && row.ClientToken !== token(plan, node))
    )
      throw new Error('Replacement instance identity differs');
    const state = String(object5(row.State).Name);
    if (!['pending', 'running', 'stopping', 'stopped', 'shutting-down', 'terminated'].includes(state))
      throw new Error('Replacement instance state is unknown');
    if (fresh && ['shutting-down', 'terminated'].includes(state))
      throw new Error('Replacement instance has been terminated');
    if (!['shutting-down', 'terminated'].includes(state)) {
      const enis = list(row.NetworkInterfaces);
      if (
        enis.length !== base.intent.interfaces.length ||
        base.intent.interfaces.some(
          (iface) =>
            !enis.some(
              (eni) =>
                eni.NetworkInterfaceId === plan.interfaceIds[`${node}/${iface.role}`] &&
                object5(eni.Attachment).DeviceIndex === iface.index,
            ),
        )
      )
        throw new Error('Replacement instance ENI binding differs');
    }
    return row;
  };
  const discover = async (api, plan, node) => {
    const found = await request(api, [
      'ec2',
      'describe-instances',
      '--filters',
      `Name=client-token,Values=${token(plan, node)}`,
    ]);
    const rows = instanceRows(found);
    if (rows.length > 1) throw new Error('Replacement client token matches multiple instances');
    if (!rows.length) return;
    const id = String(rows[0].InstanceId);
    if (!/^i-[a-f0-9]{8,17}$/.test(id) || rows[0].ClientToken !== token(plan, node))
      throw new Error('Replacement client token identity differs');
    await instance(api, plan, node, id, true);
    return id;
  };
  const inspect = async (plan, signal, expected = {}) => {
    await validate(plan);
    const api = scopedAwsApi(raw, base.intent.awsProfile, signal);
    await identity(api);
    const current = {};
    const old = {};
    const enis = {};
    for (const node of plan.binding.nodes) {
      const discovered = await discover(api, plan, node);
      if (expected[node] && expected[node] !== discovered) throw new Error('Replacement checkpoint instance differs');
      if (discovered) current[node] = discovered;
      old[node] = await instance(api, plan, node, String(object5(plan.preparation.instances)[node]), false);
      for (const iface of base.intent.interfaces) {
        const key = `${node}/${iface.role}`;
        const found = await resource(api, plan.interfaceIds[key], base.planSha256);
        const rows = list(found.state.NetworkInterfaces);
        if (rows.length !== 1 || rows[0].NetworkInterfaceId !== plan.interfaceIds[key])
          throw new Error('Ambiguous retained ENI observation');
        const eni = rows[0];
        const evidence = list(plan.preparation.interfaces).find(
          (item) => item.node === node && item.role === iface.role,
        );
        if (
          eni.OwnerId !== base.accountId ||
          eni.MacAddress !== evidence?.mac ||
          eni.AvailabilityZone !== iface.subnets[nodeIndex(node) - 1].availabilityZone ||
          found.tags['xcsh-node-index'] !== String(nodeIndex(node)) ||
          found.tags['xcsh-interface-index'] !== String(iface.index)
        )
          throw new Error('Retained ENI identity differs');
        if (eni.Attachment) {
          const attachment = object5(eni.Attachment);
          if (
            ![old[node].InstanceId, current[node]].filter(Boolean).includes(String(attachment.InstanceId)) ||
            attachment.DeviceIndex !== iface.index ||
            attachment.DeleteOnTermination !== false
          )
            throw new Error('Retained ENI attachment differs');
        }
        enis[key] = eni;
      }
      if (new Set(base.intent.interfaces.map((iface) => enis[`${node}/${iface.role}`].VpcId)).size !== 1)
        throw new Error('Retained ENIs belong to different VPCs');
      const allocation = plan.elasticIpAllocationIds[node];
      if (allocation) {
        const found = await resource(api, allocation, base.planSha256);
        const rows = list(found.state.Addresses);
        if (
          rows.length !== 1 ||
          rows[0].AllocationId !== allocation ||
          found.tags['xcsh-node-index'] !== String(nodeIndex(node)) ||
          (rows[0].AssociationId && rows[0].NetworkInterfaceId !== plan.interfaceIds[`${node}/slo`])
        )
          throw new Error('Retained EIP identity or association differs');
      }
    }
    return { api, current, old, enis };
  };
  const launchArgs = (plan, node) => {
    const index = nodeIndex(node);
    const actions = base.actions.filter((action) => action.kind === 'instance-run' && action.node === index);
    if (actions.length !== 1 || actions[0].command !== 'aws' || !actions[0].args)
      throw new Error('Exact source launch action is required');
    const substitutions = { __PLAN_SHA256__: plan.planSha256 };
    for (const iface of base.intent.interfaces)
      substitutions[`__ENI_${index}_${iface.index}__`] = plan.interfaceIds[`${node}/${iface.role}`];
    const args = resolveAwsCeActionArgs(actions[0].args, substitutions, base.bootstrapKeyPair?.name, [
      '__BOOTSTRAP_FILE__',
    ]);
    if (args[0] !== 'ec2' || args[1] !== 'run-instances' || args.includes('--client-token'))
      throw new Error('Unresolved or invalid native replacement launch action');
    if (args[args.indexOf('--user-data') + 1] !== 'file://__BOOTSTRAP_FILE__')
      throw new Error('Private bootstrap file is required');
    return [...args, '--client-token', token(plan, node)];
  };
  return {
    quiescenceAdmissionVersion: 1,
    engine: 'native',
    async restoreRouting(plan, siteUid, signal) {
      await validate(plan);
      if (base.routing?.profile !== 'tgw-connect') return;
      if (!routing || !routingSource) {
        if (plan.preparation.evidenceKind === 'preboot-interface-configuration-required') return;
        throw new Error('Replacement routing runtime is unavailable');
      }
      const checkpoint = structuredClone(routingSource);
      const scoped = scopedAwsApi(raw, base.intent.awsProfile, signal);
      await configureAwsRouting(
        routing.runtime,
        base,
        checkpoint,
        scoped,
        () => storage.write(`${plan.planId}-routing-restored.json`, checkpoint),
        signal,
        { siteName: plan.binding.siteName, siteUid, contract: routing.contract, checkpoint: routingSource },
      );
      return (await collectAwsNetworkHealth('bgp', base, checkpoint, scoped, signal)).status === 'healthy';
    },
    async assertOwnership(plan, _phase, instances, signal) {
      await inspect(plan, signal, instances);
    },
    async quiesce(plan, signal, admission) {
      for (const node of plan.binding.nodes) {
        const { api, old, enis } = await inspect(plan, signal);
        const states = Object.values(old).map((row) => object5(row.State).Name);
        const complete =
          states.every((state) => state === 'terminated') &&
          Object.values(enis).every((eni) => !eni.Attachment && eni.Status === 'available');
        await admission?.(
          complete
            ? 'complete'
            : states.some((state) => ['shutting-down', 'terminated'].includes(String(state)))
              ? 'partial'
              : 'intact',
        );
        const id = String(old[node].InstanceId);
        const state = object5(old[node].State).Name;
        if (state !== 'terminated' && state !== 'shutting-down') {
          try {
            await request(api, ['ec2', 'terminate-instances', '--instance-ids', id]);
          } catch {
            signal?.throwIfAborted();
          }
          const observed = await instance(api, plan, node, id, false);
          if (!['terminated', 'shutting-down'].includes(String(object5(observed.State).Name)))
            throw new Error('Original VM termination has not converged');
        }
        if (state !== 'terminated') {
          const result = await api.exec('aws', [
            'ec2',
            'wait',
            'instance-terminated',
            '--instance-ids',
            id,
            '--region',
            base.region,
          ]);
          if (result.exitCode) throw new Error('Original VM termination is pending');
        }
      }
      const final = await inspect(plan, signal);
      if (
        Object.values(final.old).some((row) => object5(row.State).Name !== 'terminated') ||
        Object.values(final.enis).some((eni) => eni.Attachment || eni.Status !== 'available')
      )
        throw new Error('Original VMs and retained ENIs have not quiesced');
    },
    async launch(plan, bootstrap, signal) {
      await validate(plan);
      const launched = {};
      for (const node of plan.binding.nodes) {
        const args = launchArgs(plan, node);
        if (
          typeof bootstrap[node] !== 'string' ||
          !bootstrap[node].startsWith(`#cloud-config
`)
        )
          throw new Error('Verified replacement bootstrap is required');
        const requestSha256 = canonicalSha256({ args, bootstrap: bootstrap[node] });
        const name = `${plan.planId}-${nodeIndex(node)}-launch.json`;
        let record;
        try {
          record = object5(await storage.read(name));
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
        if (
          record &&
          (record.schemaVersion !== 1 ||
            record.planSha256 !== plan.planSha256 ||
            record.requestSha256 !== requestSha256 ||
            record.clientToken !== token(plan, node))
        )
          throw new Error('Durable replacement launch request differs');
        let observed = await inspect(plan, signal);
        if (Object.values(observed.old).some((row) => object5(row.State).Name !== 'terminated'))
          throw new Error('Original VMs must terminate before replacement launch');
        let id = observed.current[node];
        if (record?.instanceId && record.instanceId !== id)
          throw new Error('Durable replacement launch identity is unavailable or differs');
        if (!id) {
          if (record) throw new Error('Prior replacement launch outcome is unknown; observation is required');
          if (
            base.intent.interfaces.some(
              (iface) =>
                observed.enis[`${node}/${iface.role}`].Attachment ||
                observed.enis[`${node}/${iface.role}`].Status !== 'available',
            )
          )
            throw new Error('Retained ENIs are not available for launch');
          await revalidateAwsBootstrapKeyPair(base, observed.api);
          record = {
            schemaVersion: 1,
            planSha256: plan.planSha256,
            requestSha256,
            clientToken: token(plan, node),
            observedAt: new Date().toISOString(),
          };
          await storage.write(name, record);
          const directory = await mkdtemp(join2(storage.directory, 'replacement-bootstrap-'));
          try {
            const path = join2(directory, 'cloud-init');
            await writeFile(path, bootstrap[node], { mode: 384, flag: 'wx' });
            try {
              const result = await observed.api.exec(
                'aws',
                resolveAwsCeActionArgs(args, { __BOOTSTRAP_FILE__: path }, base.bootstrapKeyPair?.name),
              );
              if (!result.exitCode) {
                const rows = list(object5(JSON.parse(result.stdout)).Instances);
                if (rows.length === 1 && /^i-[a-f0-9]{8,17}$/.test(String(rows[0].InstanceId))) {
                  record.instanceId = rows[0].InstanceId;
                  await storage.write(name, record);
                }
              }
            } catch {
              signal?.throwIfAborted();
            }
          } finally {
            await rm(directory, { recursive: true, force: true });
          }
          id = await discover(observed.api, plan, node);
          if (!id) throw new Error('Replacement launch outcome is unknown; reconcile the client token');
          if (record.instanceId && record.instanceId !== id)
            throw new Error('Replacement launch response differs from observation');
        }
        await storage.write(name, {
          ...record,
          schemaVersion: 1,
          planSha256: plan.planSha256,
          requestSha256,
          clientToken: token(plan, node),
          instanceId: id,
        });
        for (const iface of base.intent.interfaces) {
          observed = await inspect(plan, signal, { [node]: id });
          const key = `${node}/${iface.role}`;
          if (observed.enis[key].SourceDestCheck !== false) {
            const result = await observed.api.exec('aws', [
              'ec2',
              'modify-network-interface-attribute',
              '--network-interface-id',
              plan.interfaceIds[key],
              '--source-dest-check',
              'Value=false',
              '--region',
              base.region,
            ]);
            if (result.exitCode) throw new Error('Replacement source/destination check update failed');
          }
        }
        if (plan.elasticIpAllocationIds[node]) {
          observed = await inspect(plan, signal, { [node]: id });
          await associateAwsCeEip(
            observed.api,
            base,
            [
              'ec2',
              'associate-address',
              '--allocation-id',
              plan.elasticIpAllocationIds[node],
              '--network-interface-id',
              plan.interfaceIds[`${node}/slo`],
              '--region',
              base.region,
              '--output',
              'json',
            ],
            signal,
          );
        }
        const final = await inspect(plan, signal, { [node]: id });
        if (base.intent.interfaces.some((iface) => final.enis[`${node}/${iface.role}`].SourceDestCheck !== false))
          throw new Error('Replacement source/destination checks have not converged');
        launched[node] = id;
      }
      return launched;
    },
  };
}

// plugins/aws/src/ce/observation-rejection.ts
import { randomUUID } from 'node:crypto';

class AwsCeRevalidationError extends Error {
  diagnostic;
  constructor(diagnostic) {
    super(
      `Stale AWS CE plan: revalidation rejected; private observation capture ${diagnostic.capture}` +
        (diagnostic.receiptReference ? ` (${diagnostic.receiptReference})` : ''),
    );
    this.diagnostic = diagnostic;
    this.name = 'AwsCeRevalidationError';
  }
}
function awsCeRevalidationDiagnostic(plan, baseline, current, expectedFingerprint, relevantResourceIds, comparison) {
  const executionRegion = comparison === 'terraform-preflight' ? plan.region : awsCeObservationRegion(plan);
  const fingerprint = (value) => {
    try {
      return fingerprintObservation(value, relevantResourceIds, executionRegion);
    } catch {
      return null;
    }
  };
  const selectRegions = (value) =>
    executionRegion === undefined
      ? value.regions
      : Array.isArray(value.regions)
        ? value.regions.filter((region) => region.name === executionRegion)
        : null;
  const ids = new Set(relevantResourceIds);
  const values = (value) => ({
    identity: value.identity ?? null,
    agreement: value.agreement ?? null,
    regions: selectRegions(value) ?? null,
    resources: Array.isArray(value.resources) ? value.resources.filter((resource) => ids.has(resource.id)) : null,
    research: value.research ?? null,
    capabilities: { value: value.f5Capabilities ?? null, sha256: value.f5CapabilitiesSha256 ?? null },
  });
  const before = values(baseline);
  const after = values(current);
  const changedCategories = Object.keys(before).filter(
    (key) => canonicalSha256(before[key]) !== canonicalSha256(after[key]),
  );
  const diagnostic = {
    code: 'aws-ce-revalidation-rejected',
    comparison,
    scope:
      comparison === 'terraform-preflight'
        ? 'terraform-selected-region'
        : executionRegion === undefined
          ? 'legacy-all-regions'
          : 'execution-region-v1',
    region: /^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(plan.region) ? plan.region : null,
    expectedFingerprint: /^[a-f0-9]{64}$/.test(expectedFingerprint) ? expectedFingerprint : null,
    currentFingerprint: fingerprint(current),
    comparisonBaseline: 'original-planning-observation',
    baselineMatchesExpected: fingerprint(baseline) === expectedFingerprint,
    changedCategories,
    capture: 'unavailable',
  };
  return diagnostic;
}
async function captureAwsRevalidationRejection(
  plan,
  baseline,
  current,
  expectedFingerprint,
  relevantResourceIds,
  comparison,
  storage,
) {
  const diagnostic = awsCeRevalidationDiagnostic(
    plan,
    baseline,
    current,
    expectedFingerprint,
    relevantResourceIds,
    comparison,
  );
  const reference = `observation-rejection-${randomUUID()}`;
  const receipt = {
    schemaVersion: 1,
    kind: 'aws-ce-revalidation-rejection',
    capturedAt: new Date().toISOString(),
    planId: plan.planId,
    planSha256: plan.planSha256,
    owner: {
      deploymentId: plan.deploymentName,
      engine: plan.engine,
      provider: 'aws',
      account: plan.accountId,
      region: plan.region,
    },
    diagnostic: { ...diagnostic, capture: 'saved', receiptReference: reference },
    relevantResourceIds: [...relevantResourceIds],
    baseline: structuredClone(baseline),
    current: structuredClone(current),
    baselineObservationSha256: canonicalSha256(baseline),
    currentObservationSha256: canonicalSha256(current),
  };
  try {
    if (
      !storage ||
      !['deploymentId', 'engine', 'provider', 'account', 'region'].every(
        (key) => storage.owner[key] === receipt.owner[key],
      )
    )
      throw new Error('Private receipt ownership unavailable');
    await storage.verify();
    await storage.write(`${reference}.json`, receipt);
    diagnostic.capture = 'saved';
    diagnostic.receiptReference = reference;
    diagnostic.receiptSha256 = canonicalSha256(receipt);
    diagnostic.receiptDigestFormat = 'canonical-json-sha256';
  } catch {}
  return new AwsCeRevalidationError(diagnostic);
}

// plugins/aws/src/ce/platform-ingress.ts
async function optional(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
}
async function originAddress(plan, api, signal) {
  if (plan.intent.ingress?.mode !== 'nlb') throw new Error('AWS origin discovery requires NLB ingress');
  const source = plan.intent.ingress.probe.sourceInstanceId;
  const result = await api.exec(
    'aws',
    ['ec2', 'describe-instances', '--instance-ids', source, '--region', plan.region, '--output', 'json'],
    { signal },
  );
  if (result.exitCode !== 0) throw detectAwsError(result.stderr, result.exitCode);
  const response = JSON.parse(result.stdout);
  const reservations = Array.isArray(response.Reservations) ? response.Reservations : [];
  const instances = reservations.flatMap((reservation) => {
    if (!reservation || typeof reservation !== 'object' || Array.isArray(reservation)) return [];
    const rows = reservation.Instances;
    return Array.isArray(rows) ? rows : [];
  });
  const instance = instances[0];
  const address = instance?.PrivateIpAddress;
  const state = instance?.State;
  if (
    instances.length !== 1 ||
    instance?.InstanceId !== source ||
    state?.Name !== 'running' ||
    typeof address !== 'string' ||
    !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address) ||
    address.split('.').some((octet) => Number(octet) > 255)
  )
    throw new Error('Fresh AWS origin address evidence is unavailable');
  return address;
}
async function ensureAwsPlatformIngress(plan, runtime, storage, contract, resolved, api, signal) {
  if (plan.intent.ingress?.mode !== 'nlb') return;
  const ingress = plan.intent.ingress;
  await storage.verify();
  const sli = plan.interfaces.find((item) => item.role === 'sli');
  if (!sli) throw new Error('AWS NLB ingress requires an SLI interface');
  const primary = ingress.listener.usePrimaryInterfaceAddress === true;
  const selections = siteBindings(plan).flatMap(({ site, binding }, siteIndex) => {
    if (!primary && site.nodeIndexes.length !== 1)
      throw new Error('AWS NLB ingress requires independent one-node sites');
    return site.nodeIndexes.map((nodeIndex) => {
      const mac = resolved[`__ENI_${nodeIndex}_${sli.index}_MAC__`];
      if (!mac) throw new Error('Observed SLI MAC identity is unavailable for platform ingress');
      if (
        primary &&
        (!/^eni-[0-9a-f]{8,17}$/.test(resolved[`__ENI_${nodeIndex}_${sli.index}__`] ?? '') ||
          !sli.guestDevice ||
          resolved[`__NODE_${nodeIndex}_SLI_IP__`] !==
            awsCeInterfacePrivateAddresses(plan.intent, nodeIndex, sli.index)[0])
      )
        throw new Error('Primary SLI cloud address, ENI or device binding is unavailable');
      return {
        binding,
        node: `${plan.deploymentName}-${nodeIndex}`,
        mac,
        ...(primary ? {} : { insideAddress: ingress.listener.privateAddresses?.[siteIndex] }),
      };
    });
  });
  if (
    primary &&
    (new Set(selections.map((row) => row.mac.toLowerCase())).size !== selections.length ||
      new Set(
        siteBindings(plan).flatMap(({ site }) =>
          site.nodeIndexes.map((node) => resolved[`__ENI_${node}_${sli.index}__`]),
        ),
      ).size !== selections.length)
  )
    throw new Error('Primary SLI MAC or ENI bindings are duplicated');
  async function verifyPrimaryPlacement(id) {
    if (!primary) return;
    const savedPlan = await storage.read(`ingress-plan-${id}.json`);
    const placements = savedPlan?.material?.placements;
    if (
      savedPlan?.material?.intent?.usePrimaryInterfaceAddress !== true ||
      !Array.isArray(placements) ||
      placements.length !== selections.length
    )
      throw new Error('Primary SLI platform placement is incomplete');
    for (const selected of selections) {
      const nodeIndex = selected.binding.nodes.indexOf(selected.node);
      const node = siteBindings(plan).find((row) => row.binding.siteName === selected.binding.siteName)?.site
        .nodeIndexes[nodeIndex];
      const matches = placements.filter((row) => row.interface?.node === selected.node);
      if (
        matches.length !== 1 ||
        matches[0].siteName !== selected.binding.siteName ||
        matches[0].interface.role !== 'sli' ||
        matches[0].interface.mac !== selected.mac.toLowerCase() ||
        matches[0].interface.device !== sli?.guestDevice ||
        !matches[0].interface.linkUp ||
        matches[0].interface.ipv4?.address !== resolved[`__NODE_${node}_SLI_IP__`] ||
        matches[0].insideAddress !== resolved[`__NODE_${node}_SLI_IP__`]
      )
        throw new Error('Primary SLI CE observation differs from the cloud node, MAC, device or address binding');
    }
  }
  const lifecycle = runtime.ingress(contract, storage);
  const saved = await optional(storage, 'aws-platform-ingress.json');
  let marker;
  if (saved !== undefined) {
    const candidate = saved;
    if (
      ![1, 2, 3, 4, 5, 6, 7, 8].includes(candidate.schemaVersion) ||
      candidate.engine !== plan.engine ||
      candidate.planSha256 !== plan.planSha256 ||
      candidate.contractFingerprint !== contract.fingerprint ||
      !/^[a-f0-9]{24}$/.test(candidate.ingressPlanId)
    )
      throw new Error('Platform ingress checkpoint differs from the owning AWS plan');
    if (candidate.schemaVersion < 8) {
      await lifecycle.retire(candidate.ingressPlanId, signal);
      const listener = ingress.listener;
      const corrected = await lifecycle.planAws(
        { ...listener, port: ingress.port, originAddress: await originAddress(plan, api, signal) },
        selections,
        signal,
      );
      marker = {
        schemaVersion: 8,
        engine: plan.engine,
        planSha256: plan.planSha256,
        ingressPlanId: corrected.id,
        contractFingerprint: contract.fingerprint,
      };
      await storage.write('aws-platform-ingress.json', marker);
    } else marker = candidate;
  } else {
    const listener = ingress.listener;
    const ingressPlan = await lifecycle.planAws(
      { ...listener, port: ingress.port, originAddress: await originAddress(plan, api, signal) },
      selections,
      signal,
    );
    marker = {
      schemaVersion: 8,
      engine: plan.engine,
      planSha256: plan.planSha256,
      ingressPlanId: ingressPlan.id,
      contractFingerprint: contract.fingerprint,
    };
    await storage.write('aws-platform-ingress.json', marker);
  }
  await verifyPrimaryPlacement(marker.ingressPlanId);
  const receipt = await lifecycle.apply(marker.ingressPlanId, signal);
  return {
    ingressPlanId: marker.ingressPlanId,
    contractFingerprint: marker.contractFingerprint,
    uid: receipt.uid,
    listener: receipt.listener,
    routes: receipt.routes,
    traffic: receipt.traffic,
    observedAt: receipt.observedAt,
  };
}

// plugins/aws/src/ce/security-group-defaults.ts
async function resetAwsSecurityGroupEgress(action, plan, checkpoint, api) {
  const id = checkpoint.resolvedValues[action.resourceId ?? ''];
  if (!/^sg-[0-9a-f]{8,17}$/.test(id ?? '')) throw new Error('Security group identity is unresolved');
  const observe = async () => {
    const result = await api.exec('aws', [
      'ec2',
      'describe-security-groups',
      '--group-ids',
      id,
      '--region',
      plan.region,
      '--output',
      'json',
    ]);
    if (result.exitCode) throw new Error('Security group ownership is unavailable');
    const data = JSON.parse(result.stdout);
    if (data.NextToken || !Array.isArray(data.SecurityGroups) || data.SecurityGroups.length !== 1)
      throw new Error('Security group observation is incomplete');
    const group = data.SecurityGroups[0];
    const tags = Object.fromEntries((group.Tags ?? []).map((tag) => [tag.Key, tag.Value]));
    if (
      group.GroupId !== id ||
      group.VpcId !== (plan.intent.vpc.vpcId ?? checkpoint.resolvedValues.__VPC_ID__) ||
      tags['xcsh-managed-by'] !== 'aws-ce' ||
      tags['xcsh-deployment-id'] !== plan.deploymentName ||
      tags['xcsh-plan-sha256'] !== plan.planSha256 ||
      tags['xcsh-execution-engine'] !== plan.engine ||
      !Array.isArray(group.IpPermissionsEgress)
    )
      throw new Error('Security group ownership or scope changed');
    return group.IpPermissionsEgress;
  };
  const rules = await observe();
  if (!rules.length) return;
  for (const rule of rules) {
    const ipv4 = rule.IpRanges;
    const ipv6 = rule.Ipv6Ranges;
    if (
      rule.IpProtocol !== '-1' ||
      !Array.isArray(ipv4) ||
      !Array.isArray(ipv6) ||
      ipv4.some((range) => range.CidrIp !== '0.0.0.0/0') ||
      ipv6.some((range) => range.CidrIpv6 !== '::/0') ||
      !Array.isArray(rule.UserIdGroupPairs) ||
      rule.UserIdGroupPairs.length ||
      !Array.isArray(rule.PrefixListIds) ||
      rule.PrefixListIds.length
    )
      throw new Error('Security group contains unexpected egress rules; replan required');
  }
  await api.exec('aws', [
    'ec2',
    'revoke-security-group-egress',
    '--group-id',
    id,
    '--ip-permissions',
    JSON.stringify(rules),
    '--region',
    plan.region,
    '--output',
    'json',
  ]);
  if ((await observe()).length) throw new Error('Security group default egress removal has not converged');
}

// plugins/aws/src/ce/site-replacement.ts
var phases = [
  'quiesce',
  'remove-tokens',
  'remove-site',
  'create-site',
  'bootstrap',
  'launch',
  'registration',
  'complete',
];
var object6 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed replacement evidence');
  return value;
};
function compileAwsSiteReplacement(base, siteName, preparation, resources) {
  verifyAwsCePlan(base);
  const { interfaceIds, elasticIpAllocationIds, bootstrapTokenNames } = resources;
  const selected = siteBindings(base).find(({ site }) => site.name === siteName);
  if (!selected) throw new Error('Replacement site is outside the deployment');
  const observed = Date.parse(String(preparation.observedAt));
  if (!Number.isFinite(observed) || Date.now() - observed > 300000 || observed > Date.now() + 5000)
    throw new Error('Fresh replacement evidence is required');
  const { binding } = selected;
  if (
    !['preboot-interface-configuration-required', 'owned-site-replacement'].includes(
      String(preparation.evidenceKind),
    ) ||
    preparation.siteName !== siteName ||
    canonicalSha256(preparation.owner) !== canonicalSha256(binding.owner)
  )
    throw new Error('Replacement evidence ownership differs');
  if (
    typeof preparation.uid !== 'string' ||
    !preparation.uid ||
    typeof preparation.resourceVersion !== 'string' ||
    !preparation.resourceVersion ||
    !/^sha256:[a-f0-9]{64}$/.test(String(preparation.contractFingerprint)) ||
    preparation.source !== `/api/config/namespaces/system/securemesh_site_v2s/${siteName}` ||
    preparation.deviceSource !== `/api/register/namespaces/system/registrations_by_site/${siteName}`
  )
    throw new Error('Replacement evidence provenance is incomplete');
  const instances = object6(preparation.instances);
  if (
    Object.keys(instances).length !== binding.nodes.length ||
    new Set(Object.values(instances)).size !== binding.nodes.length ||
    binding.nodes.some((node) => !/^i-[0-9a-f]{8,17}$/.test(String(instances[node])))
  )
    throw new Error('Replacement instance inventory is incomplete');
  const interfaces = preparation.interfaces;
  if (!Array.isArray(interfaces) || !interfaces.length) throw new Error('Replacement interfaces are missing');
  const keys = interfaces.map((value) => {
    const item = object6(value);
    if (!binding.nodes.includes(String(item.node)) || !['slo', 'sli'].includes(String(item.role)))
      throw new Error('Replacement interface scope differs');
    return `${item.node}/${item.role}`;
  });
  const requiredKeys = binding.nodes.flatMap((node) => base.intent.interfaces.map((item) => `${node}/${item.role}`));
  if (canonicalSha256([...keys].sort()) !== canonicalSha256(requiredKeys.sort()))
    throw new Error('Replacement layout differs from plan');
  const macs = new Set();
  const devices = new Set();
  for (const value of interfaces) {
    const item = object6(value);
    const desired = base.intent.interfaces.find((entry) => entry.role === item.role);
    if (
      !/^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(String(item.mac)) ||
      macs.has(String(item.mac)) ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/.test(String(item.device)) ||
      devices.has(`${item.node}/${item.device}`) ||
      item.mtu !== (desired?.mtu ?? AWS_CE_DEFAULT_INTERFACE_MTU)
    )
      throw new Error('Replacement MAC, device or MTU differs from plan');
    macs.add(String(item.mac));
    devices.add(`${item.node}/${item.device}`);
  }
  if (
    new Set(keys).size !== keys.length ||
    keys.length !== Object.keys(interfaceIds).length ||
    keys.some((key) => !/^eni-[0-9a-f]{8,17}$/.test(interfaceIds[key] ?? '')) ||
    new Set(Object.values(interfaceIds)).size !== keys.length
  )
    throw new Error('Replacement ENI inventory is incomplete or duplicated');
  if (
    Object.keys(bootstrapTokenNames).length !== binding.nodes.length ||
    binding.nodes.some((node) => !/^[a-z][a-z0-9-]{0,62}$/.test(bootstrapTokenNames[node] ?? ''))
  )
    throw new Error('Observed bootstrap token inventory is incomplete');
  if (
    base.intent.egress.mode === 'elastic-ip' &&
    (Object.keys(elasticIpAllocationIds).length !== binding.nodes.length ||
      binding.nodes.some((node) => !/^eipalloc-[0-9a-f]{8,17}$/.test(elasticIpAllocationIds[node] ?? '')) ||
      new Set(Object.values(elasticIpAllocationIds)).size !== binding.nodes.length)
  )
    throw new Error('Replacement EIP inventory is incomplete or duplicated');
  const versions = structuredClone(resources.versions);
  if (
    versions?.schemaVersion !== 1 ||
    canonicalSha256(versions.identity.binding) !== canonicalSha256(binding) ||
    versions.identity.siteUid !== preparation.uid ||
    versions.identity.siteContractFingerprint !== preparation.contractFingerprint ||
    !versions.identity.physicalSiteUid ||
    !/^sha256:[a-f0-9]{64}$/.test(versions.identity.contractFingerprint)
  )
    throw new Error('Replacement version identity differs from the selected site');
  const request = structuredClone(object6(preparation.request));
  request.spec = { ...object6(request.spec), software_settings: initialSoftwareSettings(versions.versions) };
  const draft = {
    schemaVersion: 2,
    kind: 'aws-ce-site-replacement',
    engine: base.engine,
    sourcePlanSha256: base.planSha256,
    binding,
    preparation: { ...structuredClone(preparation), request },
    versions,
    interfaceIds: { ...interfaceIds },
    elasticIpAllocationIds: { ...elasticIpAllocationIds },
    oldTokenNames: { ...bootstrapTokenNames },
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `aws-ce-replace-${planSha256.slice(0, 24)}`, planSha256 };
}
async function runAwsSiteReplacement(plan, authorizedPlanSha256, driver, runtime, storage, contract, signal) {
  plan = structuredClone(plan);
  const { planId, planSha256, ...draft } = plan;
  if (
    plan.schemaVersion !== 2 ||
    plan.kind !== 'aws-ce-site-replacement' ||
    !safeHexEqual(canonicalSha256(draft), planSha256) ||
    planId !== `aws-ce-replace-${planSha256.slice(0, 24)}`
  )
    throw new Error('Replacement plan integrity differs or schema is obsolete; prepare a new v2 plan');
  if (!safeHexEqual(planSha256, authorizedPlanSha256)) throw new Error('Exact replacement authorization is required');
  if (driver.engine !== plan.engine || runtime.engine !== plan.engine || storage.owner.engine !== plan.engine)
    throw new Error('Only the owning engine may replace this site');
  if (driver.quiescenceAdmissionVersion !== 1)
    throw new Error('Replacement driver requires shutdown admission support');
  if (
    plan.versions?.schemaVersion !== 1 ||
    canonicalSha256(plan.versions.identity.binding) !== canonicalSha256(plan.binding) ||
    plan.versions.identity.siteUid !== plan.preparation.uid ||
    plan.versions.identity.siteContractFingerprint !== plan.preparation.contractFingerprint ||
    plan.versions.identity.contractFingerprint !== contract.fingerprint ||
    canonicalSha256(object6(object6(plan.preparation.request).spec).software_settings) !==
      canonicalSha256(initialSoftwareSettings(plan.versions.versions))
  )
    throw new Error('Replacement version snapshot differs from plan or contract');
  if (typeof runtime.ownedSiteConfiguration !== 'function' || typeof runtime.observeUpgrade !== 'function')
    throw new Error('AWS site replacement requires an updated platform runtime with owned configuration projection');
  if (canonicalSha256(storage.owner) !== canonicalSha256(plan.binding.owner))
    throw new Error('Replacement storage ownership differs');
  await storage.verify();
  const path = `${planId}.json`;
  let checkpoint;
  try {
    checkpoint = await storage.read(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    checkpoint = { schemaVersion: 2, planSha256, phase: 'quiesce', bootstrap: {}, bootstrapSha256: {}, instances: {} };
  }
  if (checkpoint.schemaVersion !== 2 || checkpoint.planSha256 !== planSha256 || !phases.includes(checkpoint.phase))
    throw new Error('Replacement checkpoint differs from plan');
  if (
    checkpoint.quiesceConfigurationSha256 !== undefined &&
    !/^[a-f0-9]{64}$/.test(checkpoint.quiesceConfigurationSha256)
  )
    throw new Error('Replacement configuration checkpoint is malformed');
  const admissionSha256 = canonicalSha256(plan.versions);
  if (checkpoint.versionAdmissionSha256 !== undefined && checkpoint.versionAdmissionSha256 !== admissionSha256)
    throw new Error('Replacement version admission differs from plan');
  if (checkpoint.phase !== 'quiesce' && checkpoint.versionAdmissionSha256 !== admissionSha256)
    throw new Error('Replacement version admission is missing');
  if (
    checkpoint.physicalSiteUid !== undefined &&
    (typeof checkpoint.physicalSiteUid !== 'string' ||
      !checkpoint.physicalSiteUid ||
      checkpoint.physicalSiteUid === plan.versions.identity.physicalSiteUid)
  )
    throw new Error('Replacement physical site checkpoint differs');
  if (checkpoint.versionAdmissionSha256 && !checkpoint.quiesceConfigurationSha256)
    throw new Error('Replacement configuration admission is missing');
  object6(checkpoint.bootstrap);
  object6(checkpoint.bootstrapSha256);
  object6(checkpoint.instances);
  const nodes = plan.binding.nodes;
  if (
    Object.entries(checkpoint.bootstrap).some(
      ([node, material]) =>
        !nodes.includes(node) ||
        typeof material !== 'string' ||
        !safeHexEqual(canonicalSha256(material), checkpoint.bootstrapSha256[node] ?? ''),
    )
  )
    throw new Error('Replacement bootstrap checkpoint integrity differs');
  if (
    phases.indexOf(checkpoint.phase) >= phases.indexOf('bootstrap') &&
    (!checkpoint.siteUid || checkpoint.siteUid === plan.preparation.uid)
  )
    throw new Error('Replacement site checkpoint identity is missing');
  if (phases.indexOf(checkpoint.phase) >= phases.indexOf('launch') && nodes.some((node) => !checkpoint.bootstrap[node]))
    throw new Error('Replacement bootstrap checkpoint is incomplete');
  if (
    phases.indexOf(checkpoint.phase) >= phases.indexOf('registration') &&
    (Object.keys(checkpoint.instances).length !== nodes.length ||
      nodes.some(
        (node) =>
          !/^i-[0-9a-f]{8,17}$/.test(checkpoint.instances[node] ?? '') ||
          checkpoint.instances[node] === object6(plan.preparation.instances)[node],
      ) ||
      new Set(Object.values(checkpoint.instances)).size !== nodes.length)
  )
    throw new Error('Replacement instance checkpoint identity is invalid');
  const save = () => storage.write(path, checkpoint);
  await save();
  if (checkpoint.phase === 'complete' && !checkpoint.physicalSiteUid)
    throw new Error('Replacement physical site checkpoint is missing');
  const binding = plan.binding;
  for (let index = phases.indexOf(checkpoint.phase); index < phases.length; index++) {
    const phase = phases[index];
    signal?.throwIfAborted();
    await storage.verify();
    await driver.assertOwnership(plan, phase, checkpoint.instances, signal);
    if (['quiesce', 'remove-tokens', 'bootstrap', 'launch', 'registration', 'complete'].includes(phase)) {
      const currentSite = await runtime.observeOwnedSite(binding, signal);
      const expectedUid = ['quiesce', 'remove-tokens'].includes(phase) ? plan.preparation.uid : checkpoint.siteUid;
      if (!expectedUid || object6(currentSite.system_metadata).uid !== expectedUid)
        throw new Error('Site UID changed at a replacement boundary');
      if (phase === 'quiesce' || (phase === 'remove-tokens' && checkpoint.quiesceConfigurationSha256)) {
        const configurationSha256 = canonicalSha256(runtime.ownedSiteConfiguration(binding, currentSite));
        if (checkpoint.quiesceConfigurationSha256) {
          if (!safeHexEqual(configurationSha256, checkpoint.quiesceConfigurationSha256))
            throw new Error('Site configuration changed during replacement');
        } else {
          if (currentSite.resource_version !== plan.preparation.resourceVersion)
            throw new Error('Site configuration changed before replacement');
          checkpoint.quiesceConfigurationSha256 = configurationSha256;
          await save();
        }
      }
    }
    if (phase === 'quiesce') {
      let admitted = false;
      await driver.quiesce(plan, signal, async (state) => {
        signal?.throwIfAborted();
        await storage.verify();
        const current = await runtime.observeOwnedSite(binding, signal);
        if (
          object6(current.system_metadata).uid !== plan.preparation.uid ||
          canonicalSha256(runtime.ownedSiteConfiguration(binding, current)) !== checkpoint.quiesceConfigurationSha256
        )
          throw new Error('Site identity or configuration changed before shutdown admission');
        if (state === 'intact') {
          await verifyCeReplacementVersions(plan.versions, runtime, contract, signal);
          checkpoint.versionAdmissionSha256 = admissionSha256;
          await save();
        } else if (!['partial', 'complete'].includes(state) || checkpoint.versionAdmissionSha256 !== admissionSha256) {
          throw new Error('Partial shutdown requires recorded version admission');
        }
        admitted = true;
      });
      if (!admitted) throw new Error('Replacement driver did not perform shutdown admission');
    }
    if (phase === 'remove-tokens') {
      for (const node of binding.nodes)
        await runtime.deleteBootstrapToken(binding, node, plan.oldTokenNames[node], signal);
    }
    if (phase === 'remove-site') {
      let existing;
      try {
        existing = await runtime.observeOwnedSite(binding, signal);
      } catch (error) {
        if (error.category !== 'not-found') throw error;
      }
      if (existing) {
        if (object6(existing.system_metadata).uid !== plan.preparation.uid)
          throw new Error('Original site UID changed before deletion');
        if (
          checkpoint.quiesceConfigurationSha256 &&
          !safeHexEqual(
            canonicalSha256(runtime.ownedSiteConfiguration(binding, existing)),
            checkpoint.quiesceConfigurationSha256,
          )
        )
          throw new Error('Site configuration changed before deletion');
        await runtime.deleteSite(binding, signal);
      }
    }
    if (phase === 'create-site') {
      await runtime.ensureAwsPreparedSite(
        { ...binding, initialVersions: structuredClone(plan.versions.versions) },
        plan.preparation,
        async (record) => {
          if (typeof record.uid !== 'string' || !record.uid || record.uid === plan.preparation.uid)
            throw new Error('Replacement site UID is invalid');
          if (checkpoint.siteUid && checkpoint.siteUid !== record.uid)
            throw new Error('Replacement site UID changed during recovery');
          checkpoint.siteUid = record.uid;
          await save();
        },
        signal,
      );
    }
    if (phase === 'bootstrap') {
      for (const [index, node] of binding.nodes.entries()) {
        if (checkpoint.bootstrap[node]) continue;
        const token = `${binding.siteName.slice(0, 36)}-${index + 1}-r-${planSha256.slice(0, 12)}`;
        const material = await runtime.bootstrap(
          binding,
          node,
          token,
          (secret) => storage.write(`${token}.json`, secret),
          signal,
        );
        checkpoint.bootstrap[node] = renderAwsCeCloudInit({ nodeName: node, material });
        checkpoint.bootstrapSha256[node] = canonicalSha256(checkpoint.bootstrap[node]);
        await save();
      }
    }
    if (phase === 'launch') {
      if (binding.nodes.some((node) => typeof checkpoint.bootstrap[node] !== 'string'))
        throw new Error('Replacement bootstrap is incomplete');
      checkpoint.instances = await driver.launch(plan, checkpoint.bootstrap, signal);
      if (
        Object.keys(checkpoint.instances).length !== binding.nodes.length ||
        binding.nodes.some(
          (node) =>
            !/^i-[0-9a-f]{8,17}$/.test(checkpoint.instances[node] ?? '') ||
            checkpoint.instances[node] === object6(plan.preparation.instances)[node],
        ) ||
        new Set(Object.values(checkpoint.instances)).size !== binding.nodes.length
      )
        throw new Error('Replacement launch identities are incomplete or unchanged');
      await driver.assertOwnership(plan, phase, checkpoint.instances, signal);
    }
    if (phase === 'registration' || phase === 'complete') {
      const expected = plan.preparation.interfaces;
      const registration = await runtime.approveRegistrations(
        binding,
        checkpoint.instances,
        (record) => storage.write(`${planId}-registration.json`, record),
        signal,
      );
      const configuration = await runtime.observeAwsRegisteredConfiguration(
        binding,
        checkpoint.instances,
        expected,
        signal,
      );
      if (registration.status !== 'healthy' || configuration.status !== 'configured')
        return { status: 'pending-registration', registration, configuration, routing: 'unknown', traffic: 'unknown' };
      await runtime.ensureAwsInterfaceMtu(
        binding,
        checkpoint.instances,
        expected,
        (record) => storage.write(`${planId}-mtu.json`, { ...record, planSha256 }),
        signal,
      );
      if ((await runtime.observeRegistrations(binding, checkpoint.instances, signal)).status !== 'healthy')
        return { status: 'pending-registration', routing: 'unknown', traffic: 'unknown' };
      if (!checkpoint.siteUid) throw new Error('Replacement logical identity is missing');
      const observation = await runtime.observeUpgrade(binding, contract, undefined, signal);
      if (observation.status !== 'observed')
        return { status: 'pending-versions', versions: 'unknown', routing: 'unknown', traffic: 'unknown' };
      if (
        observation.physicalSiteUid === plan.versions.identity.physicalSiteUid ||
        (checkpoint.physicalSiteUid && checkpoint.physicalSiteUid !== observation.physicalSiteUid)
      )
        throw new Error('Replacement physical identity or effective versions differ');
      const effective = stableCeSiteVersions(
        {
          binding,
          siteUid: checkpoint.siteUid,
          physicalSiteUid: observation.physicalSiteUid,
          contractFingerprint: contract.fingerprint,
          siteContractFingerprint: plan.versions.identity.siteContractFingerprint,
        },
        observation,
      );
      if (!effective)
        return { status: 'pending-versions', versions: 'unknown', routing: 'unknown', traffic: 'unknown' };
      if (canonicalSha256(effective) !== canonicalSha256(plan.versions.versions))
        throw new Error('Replacement physical identity or effective versions differ');
      checkpoint.physicalSiteUid = observation.physicalSiteUid;
      await save();
      if ((await driver.restoreRouting?.(plan, checkpoint.siteUid, signal)) === false)
        return {
          status: 'pending-routing',
          versions: structuredClone(effective),
          routing: 'unknown',
          traffic: 'unknown',
        };
      await driver.finalize?.(plan, checkpoint.instances, signal);
      checkpoint.phase = 'complete';
      await save();
      return {
        status: 'registered-with-configured-interfaces',
        instances: checkpoint.instances,
        siteUid: checkpoint.siteUid,
        physicalSiteUid: checkpoint.physicalSiteUid,
        versions: structuredClone(effective),
        routing: 'unknown',
        traffic: 'unknown',
      };
    }
    checkpoint.phase = phases[index + 1];
    await save();
  }
  throw new Error('Invalid replacement phase');
}

// plugins/aws/src/ce/traffic-probe.ts
import { isIP as isIP4 } from 'node:net';

var COMMAND_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
var object7 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed AWS traffic evidence');
  return value;
};
function validSampleTimes(evidence, now, current) {
  const start = Date.parse(String(evidence.startedAt)),
    end = Date.parse(String(evidence.executedAt)),
    collected = Date.parse(String(evidence.observedAt));
  return (
    ['startedAt', 'executedAt', 'observedAt'].every((key) => typeof evidence[key] === 'string') &&
    [start, end, collected].every(Number.isFinite) &&
    start <= end &&
    end <= collected &&
    collected <= now &&
    (!current || (now - end <= 30000 && now - collected <= 30000))
  );
}
function verifiedPeer(plan, address) {
  return (
    plan.intent.ingress?.mode === 'nlb' &&
    typeof address === 'string' &&
    isIP4(address) === 4 &&
    plan.intent.ingress.loadBalancer.privateAddresses.includes(address)
  );
}
function storeOwnedByPlan(plan, storage) {
  const expected = {
    deploymentId: plan.deploymentName,
    engine: plan.engine,
    provider: 'aws',
    account: plan.accountId,
    region: plan.region,
  };
  return Object.entries(expected).every(([key, value]) => storage.owner?.[key] === value);
}
async function run(api, plan, args) {
  const result = await api.exec('aws', [...args, '--region', plan.region, '--output', 'json']);
  if (result.exitCode !== 0) throw detectAwsError(result.stderr, result.exitCode);
  return object7(JSON.parse(result.stdout));
}
async function optional2(storage, name) {
  try {
    return object7(await storage.read(name));
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
}
async function collectAwsTrafficProbe(plan, checkpoint, storage, rawApi, signal) {
  if (plan.intent.ingress?.mode !== 'nlb') throw new Error('AWS traffic probe requires explicit NLB ingress');
  await storage.verify();
  if (!storeOwnedByPlan(plan, storage)) throw new Error('Traffic deployment store owner differs');
  const api = scopedAwsApi(rawApi, plan.intent.awsProfile, signal);
  const probe = plan.intent.ingress.probe;
  if (
    !plan.intent.brownfield.resourceIds.includes(probe.sourceInstanceId) ||
    !plan.ownershipInventory.some(
      (row) => row.resourceId === probe.sourceInstanceId && !row.owned && row.action === 'modify-approved',
    )
  )
    throw new Error('Traffic probe source is outside the reviewed AWS inventory');
  if ((await run(api, plan, ['sts', 'get-caller-identity'])).Account !== plan.accountId)
    throw new Error('Traffic probe account differs');
  const instance = await run(api, plan, ['ec2', 'describe-instances', '--instance-ids', probe.sourceInstanceId]);
  const instances = Array.isArray(instance.Reservations)
    ? instance.Reservations.flatMap((value) => {
        const reservation = object7(value);
        return Array.isArray(reservation.Instances) ? reservation.Instances.map(object7) : [];
      })
    : [];
  if (
    instances.length !== 1 ||
    instances[0].InstanceId !== probe.sourceInstanceId ||
    object7(instances[0].State).Name !== 'running'
  )
    throw new Error('Traffic probe source instance is unavailable');
  const managed = await run(api, plan, [
    'ssm',
    'describe-instance-information',
    '--filters',
    `Key=InstanceIds,Values=${probe.sourceInstanceId}`,
  ]);
  const managedRows = Array.isArray(managed.InstanceInformationList)
    ? managed.InstanceInformationList.map(object7)
    : [];
  if (
    managedRows.length !== 1 ||
    managedRows[0].InstanceId !== probe.sourceInstanceId ||
    managedRows[0].PingStatus !== 'Online' ||
    managedRows[0].PlatformType !== 'Linux'
  )
    throw new Error('Traffic probe source is not an online Linux SSM managed instance');
  const arn = checkpoint.resolvedValues.__NLB_ARN__;
  if (!arn?.startsWith(`arn:${plan.partition}:elasticloadbalancing:${plan.region}:${plan.accountId}:loadbalancer/net/`))
    throw new Error('Traffic probe NLB identity is unavailable');
  const loadBalancers = await run(api, plan, ['elbv2', 'describe-load-balancers', '--load-balancer-arns', arn]);
  const rows = Array.isArray(loadBalancers.LoadBalancers) ? loadBalancers.LoadBalancers.map(object7) : [];
  const dns = rows[0]?.DNSName;
  if (
    rows.length !== 1 ||
    rows[0].LoadBalancerArn !== arn ||
    rows[0].Scheme !== 'internal' ||
    typeof dns !== 'string' ||
    !/^[A-Za-z0-9.-]{1,253}$/.test(dns)
  )
    throw new Error('Traffic probe NLB endpoint differs from the reviewed deployment');
  const file = 'aws-traffic-probe.json';
  let state = await optional2(storage, file);
  if (state) {
    const attempts = state.attempts;
    if (
      state.schemaVersion !== 1 ||
      state.engine !== plan.engine ||
      state.planSha256 !== plan.planSha256 ||
      state.sourceInstanceId !== probe.sourceInstanceId ||
      !['ready', 'submitted', 'complete'].includes(String(state.phase)) ||
      (state.phase !== 'ready' && (typeof state.commandId !== 'string' || !COMMAND_ID.test(state.commandId))) ||
      (attempts !== undefined &&
        (!Array.isArray(attempts) ||
          attempts.some(
            (attempt) =>
              !attempt ||
              typeof attempt !== 'object' ||
              !COMMAND_ID.test(String(attempt.commandId)) ||
              typeof attempt.observedAt !== 'string' ||
              !Number.isFinite(Date.parse(String(attempt.observedAt))),
          )))
    )
      throw new Error('Traffic probe checkpoint differs from the owning plan');
    if (state.phase === 'complete') {
      const evidence = object7(state.evidence);
      if (
        evidence.status !== 'healthy' ||
        evidence.source !== 'aws:ssm:get-command-invocation' ||
        evidence.sourceInstanceId !== probe.sourceInstanceId ||
        evidence.commandId !== state.commandId ||
        evidence.httpStatus !== probe.expectedStatus ||
        evidence.bodySha256 !== probe.expectedBodySha256 ||
        evidence.expectedStatus !== probe.expectedStatus ||
        evidence.expectedBodySha256 !== probe.expectedBodySha256 ||
        typeof evidence.observedAt !== 'string' ||
        !Number.isFinite(Date.parse(evidence.observedAt)) ||
        !verifiedPeer(plan, evidence.remoteAddress) ||
        !validSampleTimes(evidence, Date.now(), false)
      )
        throw new Error('Persisted traffic evidence differs from the owning plan');
      if (evidence.loadBalancerArn !== arn || evidence.endpointDns !== dns)
        throw new Error('Persisted traffic endpoint differs from the current deployment');
      const receipts = Array.isArray(state.receipts) ? state.receipts.map(object7) : [];
      state = {
        ...state,
        phase: 'ready',
        commandId: undefined,
        evidence: undefined,
        receipts: [...receipts, evidence].slice(-40),
      };
      await storage.write(file, state);
    }
  } else {
    state = {
      schemaVersion: 1,
      engine: plan.engine,
      planSha256: plan.planSha256,
      sourceInstanceId: probe.sourceInstanceId,
      phase: 'ready',
    };
    await storage.write(file, state);
  }
  let commandId = state.commandId;
  if (state.phase === 'ready') {
    const body = `${probe.expectedBodySha256}`;
    const command =
      `body=$(mktemp); trap 'rm -f "$body"' EXIT; ` +
      `code=$(curl --noproxy '*' --silent --show-error --max-time 15 --output "$body" --write-out '%{http_code} %{remote_ip}' ` +
      `--header 'Host: ${plan.intent.ingress.listener.domain}' ` +
      `'http://${dns}:${plan.intent.ingress.port}${probe.path}'); ` +
      `digest=$(sha256sum "$body" | awk '{print $1}'); printf '%s %s
' "$code" "$digest"; ` +
      `[ "\${code%% *}" = "${probe.expectedStatus}" ] && [ "$digest" = "${body}" ]`;
    const submitted = await run(api, plan, [
      'ssm',
      'send-command',
      '--instance-ids',
      probe.sourceInstanceId,
      '--document-name',
      'AWS-RunShellScript',
      '--document-version',
      '1',
      '--timeout-seconds',
      '30',
      '--comment',
      `xcsh-ce-${plan.planId}`,
      '--parameters',
      JSON.stringify({ commands: [command], executionTimeout: ['30'] }),
    ]);
    commandId = object7(submitted.Command).CommandId;
    if (typeof commandId !== 'string' || !COMMAND_ID.test(commandId))
      throw new Error('Traffic probe command identity is unavailable');
    const previousCommands = [
      ...(Array.isArray(state.receipts) ? state.receipts.map(object7) : []),
      ...(Array.isArray(state.attempts) ? state.attempts.map(object7) : []),
    ];
    if (previousCommands.some((receipt) => receipt.commandId === commandId))
      throw new Error('Traffic probe command identity was reused');
    state = { ...state, phase: 'submitted', commandId };
    await storage.write(file, state);
  }
  if (typeof commandId !== 'string') throw new Error('Traffic probe command identity is unavailable');
  const deadline = Date.now() + 45000;
  while (true) {
    signal?.throwIfAborted();
    let invocation;
    try {
      invocation = await run(api, plan, [
        'ssm',
        'get-command-invocation',
        '--command-id',
        commandId,
        '--instance-id',
        probe.sourceInstanceId,
      ]);
    } catch (error) {
      if (!(error instanceof AwsNotFoundError) || Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000));
      continue;
    }
    if (['Pending', 'InProgress', 'Delayed'].includes(String(invocation.Status))) {
      if (Date.now() >= deadline) throw new Error('Traffic probe has not converged; resume the saved checkpoint');
      await new Promise((resolve) => setTimeout(resolve, 2000));
      continue;
    }
    const output = invocation.StandardOutputContent;
    const errorOutput = invocation.StandardErrorContent;
    if (
      invocation.CommandId !== commandId ||
      invocation.InstanceId !== probe.sourceInstanceId ||
      invocation.DocumentName !== 'AWS-RunShellScript' ||
      invocation.DocumentVersion !== '1' ||
      typeof output !== 'string' ||
      typeof errorOutput !== 'string' ||
      typeof invocation.Status !== 'string' ||
      typeof invocation.ResponseCode !== 'number'
    )
      throw new Error('Traffic probe response is malformed');
    const match = /^(\d{3}) ([0-9.]+) ([a-f0-9]{64})\n?$/.exec(output);
    const evidence = {
      status:
        invocation.Status === 'Success' && invocation.ResponseCode === 0 && errorOutput === '' && match
          ? 'healthy'
          : 'degraded',
      source: 'aws:ssm:get-command-invocation',
      loadBalancerArn: arn,
      endpointDns: dns,
      sourceInstanceId: probe.sourceInstanceId,
      commandId,
      httpStatus: match ? Number(match[1]) : undefined,
      remoteAddress: match?.[2],
      bodySha256: match?.[3],
      expectedStatus: probe.expectedStatus,
      expectedBodySha256: probe.expectedBodySha256,
      startedAt: invocation.ExecutionStartDateTime,
      executedAt: invocation.ExecutionEndDateTime,
      observedAt: new Date().toISOString(),
    };
    if (
      !verifiedPeer(plan, evidence.remoteAddress) ||
      !validSampleTimes(evidence, Date.now(), true) ||
      evidence.status !== 'healthy' ||
      evidence.httpStatus !== probe.expectedStatus ||
      evidence.bodySha256 !== probe.expectedBodySha256
    ) {
      const attempts = Array.isArray(state.attempts) ? state.attempts.map(object7) : [];
      if (!attempts.some((attempt) => attempt.commandId === commandId))
        attempts.push({
          commandId,
          status: invocation.Status,
          responseCode: invocation.ResponseCode,
          httpStatus: evidence.httpStatus,
          bodySha256: evidence.bodySha256,
          stderrPresent: errorOutput.length > 0,
          observedAt: evidence.observedAt,
        });
      state = { ...state, phase: 'ready', commandId: undefined, attempts: attempts.slice(-40) };
      await storage.write(file, state);
      throw new Error('Traffic probe has not converged; retry the saved checkpoint');
    }
    await storage.write(file, { ...state, phase: 'complete', evidence });
    return evidence;
  }
}
async function readAwsTrafficProbeEvidence(plan, storage, values) {
  const unknown = (reason) => ({ status: 'unknown', reason, observedAt: new Date().toISOString() });
  if (plan.intent.ingress?.mode !== 'nlb') return unknown('traffic-probe-not-configured');
  const probe = plan.intent.ingress.probe;
  try {
    await storage.verify();
    if (!storeOwnedByPlan(plan, storage)) return unknown('traffic-store-owner-unverified');
    const state = await optional2(storage, 'aws-traffic-probe.json');
    if (state?.phase !== 'complete') return unknown('traffic-receipt-unavailable');
    const evidence = object7(state.evidence),
      at = Date.parse(String(evidence.observedAt));
    if (
      !verifiedPeer(plan, evidence.remoteAddress) ||
      !validSampleTimes(evidence, Date.now(), true) ||
      typeof evidence.loadBalancerArn !== 'string' ||
      !evidence.loadBalancerArn.startsWith(
        `arn:${plan.partition ?? 'aws'}:elasticloadbalancing:${plan.region}:${plan.accountId}:loadbalancer/net/`,
      ) ||
      evidence.loadBalancerArn !== values?.__NLB_ARN__ ||
      typeof evidence.endpointDns !== 'string' ||
      !/^[A-Za-z0-9.-]{1,253}$/.test(evidence.endpointDns) ||
      state.schemaVersion !== 1 ||
      state.engine !== plan.engine ||
      state.planSha256 !== plan.planSha256 ||
      state.sourceInstanceId !== probe.sourceInstanceId ||
      !COMMAND_ID.test(String(state.commandId)) ||
      evidence.status !== 'healthy' ||
      evidence.source !== 'aws:ssm:get-command-invocation' ||
      evidence.sourceInstanceId !== probe.sourceInstanceId ||
      evidence.commandId !== state.commandId ||
      evidence.httpStatus !== probe.expectedStatus ||
      evidence.expectedStatus !== probe.expectedStatus ||
      evidence.bodySha256 !== probe.expectedBodySha256 ||
      evidence.expectedBodySha256 !== probe.expectedBodySha256 ||
      typeof evidence.observedAt !== 'string' ||
      !Number.isFinite(at) ||
      at > Date.now() ||
      Date.now() - at > 30000 ||
      !plan.intent.brownfield.resourceIds.includes(probe.sourceInstanceId) ||
      !plan.ownershipInventory.some(
        (row) => row.resourceId === probe.sourceInstanceId && !row.owned && row.action === 'modify-approved',
      )
    )
      return unknown('traffic-receipt-unverified');
    return { ...evidence, status: 'healthy', receiptOnly: true };
  } catch {
    return unknown('traffic-receipt-unavailable');
  }
}

// plugins/aws/src/ce/apply.ts
function observedInstanceTypeNames(observation) {
  return [
    ...new Set(observation.regions.flatMap((region) => region.instanceTypes.map((instance) => instance.name))),
  ].sort();
}
var waitUntil = async (notBefore, signal) => {
  const remaining = notBefore - Date.now();
  if (remaining <= 0) return;
  await new Promise((resolve, reject) => {
    const aborted = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error('AWS CE HA admission cancelled'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', aborted);
      resolve();
    }, remaining);
    signal?.addEventListener('abort', aborted, { once: true });
    if (signal?.aborted) aborted();
  });
};
function assertAwsObservationFresh(
  plan,
  current,
  expected = plan.observationFingerprint,
  relevantResourceIds = [
    ...plan.intent.brownfield.resourceIds,
    ...plan.ownershipInventory
      .filter((item) => item.owned && !item.resourceId.startsWith('aws://'))
      .map((item) => item.resourceId),
  ],
) {
  assertAwsBootstrapKeyPair(plan, current);
  const region = awsCeObservationRegion(plan);
  const actual = fingerprintObservation(current, relevantResourceIds, region);
  if (!matchesObservationFingerprint(expected, current, relevantResourceIds, region))
    throw new Error(`Stale AWS CE plan: observations changed (expected ${expected}, current ${actual})`);
}
function resumeObservationInputs(plan, planned, expected, relevantResourceIds, completedActionCount) {
  if (plan.intent.operation === 'teardown' && completedActionCount > 0) {
    return { expected: fingerprintObservation(planned, [], awsCeObservationRegion(plan)), ids: [] };
  }
  return { expected, ids: relevantResourceIds };
}
function assertAwsApplyAllowed(plan, request) {
  if (plan.schemaVersion !== AWS_CE_SCHEMA_VERSION) throw new Error('AWS CE plan schema is unsupported');
  if (plan.engine !== (request.executionEngine ?? 'native'))
    throw new Error('Terraform-owned deployments require the Terraform lifecycle adapter');
  if (request.planId !== plan.planId) throw new Error('The requested AWS CE plan ID does not match the persisted plan');
  if (!safeHexEqual(request.planSha256, plan.planSha256))
    throw new Error('The requested AWS CE plan hash does not match');
  assertAwsDeploymentCompilerOperation(plan.intent);
  if (!request.hasUI && !request.authorized && request.env.XCSH_CE_HEADLESS_MUTATIONS !== '1')
    throw new Error('Headless AWS CE mutations require XCSH_CE_HEADLESS_MUTATIONS=1');
  if (
    plan.intent.operation === 'teardown' &&
    !request.hasUI &&
    !request.destructionAuthorized &&
    request.env.XCSH_CE_ALLOW_DESTROY !== '1'
  )
    throw new Error('Headless AWS CE teardown requires XCSH_CE_ALLOW_DESTROY=1');
}
function executableAwsActionArgs(action, args) {
  return action.kind === 'nlb-cross-zone-enable' && args[0] === 'modify-load-balancer-attributes'
    ? ['elbv2', ...args]
    : args;
}
function valueAtPath(raw, path) {
  let value = raw;
  for (const segment of path.split('.')) {
    if (Array.isArray(value) && /^\d+$/.test(segment)) value = value[Number(segment)];
    else if (value && typeof value === 'object') value = value[segment];
    else return;
  }
  return typeof value === 'string' && value ? value : undefined;
}
async function assertAwsActionOwnership(plan, action, api, resolved = {}) {
  if (!action.mutates) return;
  const rollbackTargets = new Set();
  if (action.kind === 'brownfield-restore') {
    const source = plan.rollback.resources.find((resource) => resource.id === action.resourceId);
    if (!source) throw new Error('AWS brownfield restoration is not backed by the immutable rollback snapshot');
    const collect = (value) => {
      if (typeof value === 'string') {
        for (const match of value.matchAll(
          /arn:(?:aws|aws-us-gov|aws-cn):elasticloadbalancing:[^,\s]+|(?:vol|i|eni|sg|vpc|subnet|rtb|igw|tgw|tgw-rtb|tgw-attach|tgw-connect-peer|eipalloc|eipassoc)-[0-9a-f]{8,21}/g,
        ))
          rollbackTargets.add(match[0]);
      } else if (Array.isArray(value)) {
        for (const item of value) collect(item);
      } else if (value && typeof value === 'object') {
        for (const item of Object.values(value)) collect(item);
      }
    };
    rollbackTargets.add(source.id);
    collect(source.before);
  }
  const ids = new Set();
  if (action.resourceId && !action.resourceId.startsWith('aws://') && !action.resourceId.includes('__'))
    ids.add(action.resourceId);
  const targetFlags = new Set([
    '--volume-id',
    '--volume-ids',
    '--instance-id',
    '--instance-ids',
    '--network-interface-id',
    '--network-interface-ids',
    '--network-interfaces',
    '--allocation-id',
    '--association-id',
    '--group-id',
    '--group-ids',
    '--vpc-id',
    '--internet-gateway-id',
    '--gateway-id',
    '--subnet-id',
    '--subnet-ids',
    '--route-table-id',
    '--transit-gateway-id',
    '--transit-gateway-route-table-id',
    '--transit-gateway-attachment-id',
    '--transit-gateway-connect-peer-id',
    '--target-group-arn',
    '--load-balancer-arn',
    '--listener-arn',
  ]);
  const args = action.args ?? [];
  for (let index = 0; index < args.length; index++) {
    if (!targetFlags.has(args[index])) continue;
    for (let position = index + 1; position < args.length && !args[position].startsWith('--'); position++) {
      let value = args[position];
      for (const [placeholder, replacement] of Object.entries(resolved))
        value = value.replaceAll(placeholder, replacement);
      if (/__[A-Z0-9_]+__/.test(value)) throw new Error('AWS ownership target is unresolved');
      for (const match of value.matchAll(
        /arn:(?:aws|aws-us-gov|aws-cn):elasticloadbalancing:[^,\s]+|(?:vol|i|eni|sg|vpc|subnet|rtb|igw|tgw|tgw-rtb|tgw-attach|tgw-connect-peer|eipalloc|eipassoc)-[0-9a-f]{8,21}/g,
      ))
        ids.add(match[0]);
    }
  }
  const known = new Set(Object.values(resolved));
  for (const id of ids)
    if (!known.has(id) && !rollbackTargets.has(id) && !plan.ownershipInventory.some((item) => item.resourceId === id))
      throw new Error('AWS mutation target is outside the deployment inventory');
  if (!ids.size) return;
  const observed = await observeAwsResources(api, [...ids], plan.region, {
    deploymentName: plan.deploymentName,
    planSha256s: [
      plan.planSha256,
      ...plan.rollback.resources
        .map((resource) => String(resource.before.tags?.['xcsh-plan-sha256'] ?? ''))
        .filter((digest) => /^[a-f0-9]{64}$/.test(digest)),
    ],
  });
  for (const resource of observed) {
    if (!resource.exists) {
      if (
        plan.intent.operation === 'teardown' &&
        action.kind === 'resource-delete' &&
        hasDeleteRecovery(action) &&
        resource.id === action.resourceId &&
        plan.ownershipInventory.some((row) => row.resourceId === resource.id && row.owned && row.action === 'delete')
      )
        continue;
      throw new Error('AWS mutation target no longer exists');
    }
    const brownfield =
      rollbackTargets.has(resource.id) ||
      plan.ownershipInventory.some(
        (item) => item.resourceId === resource.id && item.action === 'modify-approved' && !item.owned,
      );
    if (
      !brownfield &&
      (resource.tags['xcsh-managed-by'] !== 'aws-ce' ||
        resource.tags['xcsh-deployment-id'] !== plan.deploymentName ||
        resource.tags['xcsh-execution-engine'] !== plan.engine)
    )
      throw new Error('Live AWS resource belongs to another owner or engine');
  }
}
function flagValue(args, flag) {
  const indexes = args.flatMap((value, index) => (value === flag ? [index] : []));
  if (indexes.length !== 1) return;
  const value = args[indexes[0] + 1];
  return value && !value.startsWith('--') ? value : undefined;
}
async function isAwsBrownfieldRestoreConverged(plan, action, api) {
  if (action.kind !== 'brownfield-restore' || action.args?.[0] !== 'ec2') return false;
  const operation = action.args[1];
  if (
    ![
      'associate-transit-gateway-route-table',
      'disassociate-transit-gateway-route-table',
      'enable-transit-gateway-route-table-propagation',
      'disable-transit-gateway-route-table-propagation',
    ].includes(operation)
  )
    return false;
  const routeTableId = flagValue(action.args, '--transit-gateway-route-table-id');
  const attachmentId = flagValue(action.args, '--transit-gateway-attachment-id');
  const source = plan.rollback.resources.find((resource) => resource.id === routeTableId);
  if (!routeTableId || !source || action.resourceId !== routeTableId || !attachmentId)
    throw new Error('AWS TGW restoration is not bound to the immutable rollback snapshot');
  const key = operation.includes('propagation') ? 'Propagations' : 'Associations';
  const before = Array.isArray(source.before[key]) ? source.before[key] : [];
  const expected = before.filter((item) => item.TransitGatewayAttachmentId === attachmentId);
  if (expected.length > 1) throw new Error('AWS TGW rollback relationship is ambiguous');
  const desired = operation.startsWith('associate-') || operation.startsWith('enable-');
  if (desired !== (expected.length === 1)) throw new Error('AWS TGW restoration differs from the rollback snapshot');
  const [observed] = await observeAwsResources(api, [routeTableId], plan.region, {
    deploymentName: plan.deploymentName,
    planSha256s: [plan.planSha256],
  });
  if (!observed?.exists) throw new Error('AWS TGW restoration target no longer exists');
  const current = Array.isArray(observed.state[key])
    ? observed.state[key].filter((item) => item.TransitGatewayAttachmentId === attachmentId)
    : [];
  if (current.length > 1) throw new Error('AWS TGW live relationship is ambiguous');
  const state = String(current[0]?.State ?? '').toLowerCase();
  return desired
    ? current.length === 1 && ['associated', 'enabled'].includes(state)
    : current.length === 0 || ['disassociated', 'disabled'].includes(state);
}
async function assertGate(action, runtime, plan, checkpoint, persist, storage, ingressContract, api, fetcher, signal) {
  let replacementMutation = false;
  if (action.kind === 'security-group-egress-reset') {
    await resetAwsSecurityGroupEgress(action, plan, checkpoint, api);
    return;
  }
  if (action.kind === 'tgw-attachment-gate') {
    await assertAttachmentAvailable(action, plan, checkpoint, api);
    return;
  }
  for (const { site, binding } of siteBindings(plan).filter(
    ({ site }) => !action.node || site.nodeIndexes.includes(action.node),
  )) {
    if (action.kind === 'registration-gate' || action.kind === 'registration-approve') {
      let instances = Object.fromEntries(
        binding.nodes.map((node, index) => [
          node,
          checkpoint.resolvedValues[`__INSTANCE_${site.nodeIndexes[index]}__`],
        ]),
      );
      const replacementArtifact = `${action.id}-initial-mtu-replacement.json`;
      let replacement;
      if (action.kind === 'registration-gate') {
        try {
          const saved = await storage.read(replacementArtifact);
          if (saved.sourcePlanSha256 !== plan.planSha256 || !saved.plan)
            throw new Error('Initial MTU replacement binding differs');
          replacement = saved.plan;
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      }
      const driveReplacement = async (child) => {
        replacementMutation = true;
        checkpoint.childPlanSha256s = [...new Set([...(checkpoint.childPlanSha256s ?? []), child.planSha256])].sort();
        await persist();
        let upgrade;
        try {
          upgrade = await VerifiedUpgradeContract.release(fetcher, signal);
        } catch (error) {
          if (error instanceof Error && error.message.includes('contract download failed'))
            throw new Error('Replacement contract download has not converged');
          throw error;
        }
        const driver = createNativeAwsSiteReplacementDriver(plan, api, storage);
        const result = await runAwsSiteReplacement(child, child.planSha256, driver, runtime, storage, upgrade, signal);
        const childCheckpoint = await storage.read(`${child.planId}.json`);
        for (const [nodeOffset, node] of binding.nodes.entries()) {
          const instance = childCheckpoint.instances?.[node];
          if (typeof instance === 'string' && /^i-[0-9a-f]{8,17}$/.test(instance))
            checkpoint.resolvedValues[`__INSTANCE_${site.nodeIndexes[nodeOffset]}__`] = instance;
        }
        const scoped = scopedAwsApi(api, plan.intent.awsProfile, signal);
        for (const node of site.nodeIndexes) {
          const allocation = checkpoint.resolvedValues[`__EIP_${node}__`];
          if (!allocation) continue;
          const response = await scoped.exec('aws', [
            'ec2',
            'describe-addresses',
            '--allocation-ids',
            allocation,
            '--region',
            plan.region,
            '--output',
            'json',
          ]);
          if (response.exitCode) throw new Error('Replacement EIP observation failed');
          const addresses = JSON.parse(response.stdout).Addresses;
          const association = addresses?.length === 1 ? addresses[0].AssociationId : undefined;
          if (!association || !/^eipassoc-[0-9a-f]{8,17}$/.test(association))
            throw new Error('Replacement EIP association identity is unavailable');
          checkpoint.resolvedValues[`__EIP_ASSOC_${node}__`] = association;
        }
        instances = Object.fromEntries(
          binding.nodes.map((node, index) => [
            node,
            checkpoint.resolvedValues[`__INSTANCE_${site.nodeIndexes[index]}__`],
          ]),
        );
        await persist({
          evidenceKind: 'automatic-preboot-mtu-replacement',
          childPlanId: child.planId,
          childPlanSha256: child.planSha256,
          status: result.status,
          registrationStatus: 'registration' in result && result.registration ? result.registration.status : undefined,
          configurationStatus:
            'configuration' in result && result.configuration ? result.configuration.status : undefined,
          versions: 'versions' in result ? result.versions : undefined,
          observedAt: new Date().toISOString(),
        });
        return result.status === 'registered-with-configured-interfaces';
      };
      if (replacement) {
        const complete = await driveReplacement(replacement);
        if (!complete) return { mutated: true, pending: true };
      }
      const evidence =
        action.kind === 'registration-approve'
          ? await runtime.approveRegistrations(
              binding,
              instances,
              async (record) => {
                checkpoint.resolvedValues[`__REGISTRATION_${String(record.node)}__`] = String(record.registration);
                checkpoint.resolvedValues[`__REGISTRATION_STATE_${String(record.node)}__`] = String(record.state);
                await persist();
              },
              signal,
            )
          : await runtime.observeRegistrations(binding, instances, signal);
      if (['authorization', 'expired', 'malformed', 'ownership-or-response-invalid'].includes(String(evidence.reason)))
        throw new Error(`F5 registration evidence is unavailable: ${String(evidence.reason)}`);
      if (action.kind === 'registration-approve') {
        if (
          !Array.isArray(evidence.nodes) ||
          evidence.nodes.some(
            (node) =>
              !node ||
              typeof node !== 'object' ||
              !['APPROVED', 'ADMITTED', 'ONLINE', 'UPGRADING', 'MAINTENANCE'].includes(String(node.state)),
          )
        )
          throw new Error('Observed F5 registration approval has not converged');
      } else if (evidence.status !== 'healthy') throw new Error('Observed F5 registration has not converged');
      if (action.kind === 'registration-gate') {
        const configuration = await runtime.observeAwsRegisteredConfiguration(
          binding,
          instances,
          site.nodeIndexes.flatMap((node) =>
            plan.interfaces.map((item) => ({
              node: `${plan.deploymentName}-${node}`,
              role: item.role,
              mac: checkpoint.resolvedValues[`__ENI_${node}_${item.index}_MAC__`],
              ...(awsCeStaticIp(plan.intent, node, item.index)
                ? { staticIp: awsCeStaticIp(plan.intent, node, item.index) }
                : {}),
            })),
          ),
          signal,
        );
        if (configuration.status !== 'configured')
          throw new Error('Observed F5 interface configuration has not converged');
        const expected = site.nodeIndexes.flatMap((node) =>
          plan.interfaces.map((item) => ({
            node: `${plan.deploymentName}-${node}`,
            role: item.role,
            mac: checkpoint.resolvedValues[`__ENI_${node}_${item.index}_MAC__`],
            ...(awsCeStaticIp(plan.intent, node, item.index)
              ? { staticIp: awsCeStaticIp(plan.intent, node, item.index) }
              : {}),
            mtu: item.mtu ?? AWS_CE_DEFAULT_INTERFACE_MTU,
          })),
        );
        let preparation;
        try {
          await runtime.ensureAwsInterfaceMtu(
            binding,
            instances,
            expected,
            async (record) => {
              preparation = record;
              await persist(record);
            },
            signal,
          );
        } catch (error) {
          if (
            plan.engine !== 'native' ||
            !(error instanceof Error) ||
            !error.message.includes('coupled VM/site replacement') ||
            !preparation
          )
            throw error;
          let upgrade;
          let versions;
          try {
            upgrade = await VerifiedUpgradeContract.release(fetcher, signal);
            versions = await captureCeReplacementVersions(
              binding,
              String(preparation.uid),
              String(preparation.contractFingerprint),
              runtime,
              upgrade,
              signal,
            );
          } catch (error) {
            if (
              error instanceof Error &&
              (error.message.includes('contract download failed') ||
                error.message.includes('version evidence is unavailable') ||
                error.message.includes('versions are not stable'))
            )
              throw new Error('Replacement contract or version evidence has not converged');
            throw error;
          }
          replacement = compileAwsSiteReplacement(plan, binding.siteName, preparation, {
            versions,
            interfaceIds: Object.fromEntries(
              site.nodeIndexes.flatMap((node) =>
                plan.interfaces.map((item) => [
                  `${plan.deploymentName}-${node}/${item.role}`,
                  checkpoint.resolvedValues[`__ENI_${node}_${item.index}__`],
                ]),
              ),
            ),
            elasticIpAllocationIds: Object.fromEntries(
              site.nodeIndexes.map((node) => [
                `${plan.deploymentName}-${node}`,
                checkpoint.resolvedValues[`__EIP_${node}__`],
              ]),
            ),
            bootstrapTokenNames: Object.fromEntries(
              site.nodeIndexes.map((node) => [
                `${plan.deploymentName}-${node}`,
                checkpoint.resolvedValues[`__F5_TOKEN_${node}__`],
              ]),
            ),
          });
          await storage.write(replacementArtifact, { sourcePlanSha256: plan.planSha256, plan: replacement });
          const complete = await driveReplacement(replacement);
          if (!complete) return { mutated: true, pending: true };
        }
        if ((await runtime.observeRegistrations(binding, instances, signal)).status !== 'healthy')
          throw new Error('Observed F5 registration after interface update has not converged');
      }
    }
    if (action.kind === 'health-gate') {
      const evidence = await runtime.observeHealth(binding, signal);
      if (
        [
          'authorization',
          'expired',
          'malformed',
          'ownership-or-response-invalid',
          'provider-health-contract-unavailable',
        ].includes(String(evidence.reason))
      )
        throw new Error(`F5 health evidence is unavailable: ${String(evidence.reason)}`);
      if (evidence.status !== 'healthy') throw new Error('Observed F5 site health has not converged');
    }
  }
  if (action.kind === 'f5-routing-configure')
    await configureAwsRouting(runtime, plan, checkpoint, api, persist, signal);
  if (action.kind === 'f5-ingress-configure') {
    if (!ingressContract) throw new Error('Verified ingress contract is unavailable');
    const evidence = await ensureAwsPlatformIngress(
      plan,
      runtime,
      storage,
      ingressContract,
      checkpoint.resolvedValues,
      api,
      signal,
    );
    if (evidence?.listener !== 'configured') throw new Error('Observed F5 ingress listener has not converged');
    await persist(evidence);
  }
  if (action.kind === 'bgp-gate' || action.kind === 'nlb-gate') {
    const evidence = await collectAwsNetworkHealth(
      action.kind === 'bgp-gate' ? 'bgp' : 'nlb',
      plan,
      checkpoint,
      api,
      signal,
    );
    if (evidence.status !== 'healthy') throw new Error('Observed AWS network health has not converged');
  }
  if (action.kind === 'tgw-route-gate') {
    const evidence = await collectAwsNetworkHealth('routes', plan, checkpoint, api, signal);
    await persist(evidence);
    if (evidence.status === 'unknown') throw new Error('AWS TGW route evidence is unavailable');
    if (evidence.status !== 'healthy') throw new Error('Observed AWS TGW routes have not converged');
  }
  if (action.kind === 'traffic-gate') {
    if (plan.intent.ingress?.mode !== 'nlb')
      throw new Error('Collected traffic-gate evidence is unavailable for this profile');
    if (!ingressContract) throw new Error('Verified ingress contract is unavailable');
    const ingress = await ensureAwsPlatformIngress(
      plan,
      runtime,
      storage,
      ingressContract,
      checkpoint.resolvedValues,
      api,
      signal,
    );
    if (ingress?.listener !== 'configured') throw new Error('Observed F5 ingress listener has not converged');
    const evidence = await collectAwsTrafficProbe(plan, checkpoint, storage, api, signal);
    await persist(evidence);
    if (evidence.status !== 'healthy') throw new Error('Observed end-to-end AWS traffic has not converged');
  }
  return replacementMutation ? { mutated: true, pending: false } : undefined;
}
function completeAwsGuestDevices(plan) {
  return (
    plan.interfaces.length > 0 &&
    plan.interfaces.every(
      (item) => typeof item.guestDevice === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/.test(item.guestDevice),
    ) &&
    new Set(plan.interfaces.map((item) => item.guestDevice)).size === plan.interfaces.length
  );
}
function awsNativePrebootSiteRequired(plan, siteNodeCount) {
  return (
    siteNodeCount === 3 ||
    plan.interfaces.some((item) => item.addressing.mode === 'static') ||
    completeAwsGuestDevices(plan)
  );
}
function buildAwsNativePrebootSiteIntent(plan, nodeIndexes, resolvedValues) {
  if (!completeAwsGuestDevices(plan))
    throw new Error('Complete, distinct AWS guest device identities are required before site configuration');
  const macs = new Set();
  return {
    schemaVersion: 2,
    provider: 'aws',
    haMode: nodeIndexes.length === 3 ? 'three-node' : 'one-node',
    nodes: nodeIndexes.map((node) => ({
      hostname: `${plan.deploymentName}-${node}`,
      interfaces: plan.interfaces.map((item) => {
        const mac = resolvedValues[`__ENI_${node}_${item.index}_MAC__`];
        if (!mac || !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(mac) || macs.has(mac))
          throw new Error('Captured AWS ENI MAC is missing, malformed or duplicated');
        macs.add(mac);
        return {
          name: item.role,
          mtu: item.mtu ?? AWS_CE_DEFAULT_INTERFACE_MTU,
          ethernet_interface: { device: item.guestDevice, mac },
          network_option: item.role === 'slo' ? { site_local_network: {} } : { site_local_inside_network: {} },
          ...(awsCeStaticIp(plan.intent, node, item.index)
            ? { static_ip: awsCeStaticIp(plan.intent, node, item.index) }
            : { dhcp_client: {} }),
        };
      }),
    })),
    settings: awsInitialAdminSettings(plan.intent),
  };
}
async function executeAwsCeApply(input, ctx, api, platform, fetcher = fetch, signal) {
  if (
    Object.hasOwn(input, 'f5Capabilities') ||
    Object.hasOwn(input, 'f5Evidence') ||
    Object.hasOwn(input, 'bootstrapRefs')
  )
    throw new Error('Caller-supplied capability or health assertions are unsupported');
  const { plan, observation } = await loadAwsPlan(ctx.sessionManager, input.planId, input.planSha256);
  assertAwsAdminPrebootDevices(plan.intent);
  api = scopedAwsApi(api, plan.intent.awsProfile, signal);
  if (plan.intent.operation === 'deploy' && plan.interfaces.some((item) => !['slo', 'sli'].includes(item.role)))
    throw new Error('The requested interface configuration needs an explicit supported F5 wire mapping');
  if (plan.intent.operation === 'deploy') validateAwsCeAddressing(plan.intent);
  const f5Capabilities = await platform.capabilities(plan.intent.platformContext);
  const runtime = await platform.runtime(plan.engine, plan.intent.platformContext);
  if (siteBindings(plan).some(({ site }) => site.nodeIndexes.length === 3)) runtime.requireAwsHaContract();
  if (plan.routing.profile === 'tgw-connect') runtime.requireAwsRoutingContract();
  const storage = await platform.storage({
    deploymentId: plan.deploymentName,
    engine: plan.engine,
    provider: 'aws',
    account: plan.accountId,
    region: plan.region,
  });
  const execute = async () => {
    const existing = await loadAwsCheckpoint(ctx.sessionManager, plan.planId, plan.planSha256);
    const authorized =
      existing?.authorization?.planSha256 === plan.planSha256 && existing.authorization.mutations === true;
    assertAwsApplyAllowed(plan, {
      planId: input.planId,
      planSha256: input.planSha256,
      hasUI: ctx.hasUI,
      env: process.env,
      authorized,
      destructionAuthorized: authorized && existing?.authorization?.destruction,
    });
    const ingressContract =
      plan.intent.ingress?.mode === 'nlb' ? await VerifiedIngressContract.release(fetcher, signal) : undefined;
    if (existing && existing.engine !== plan.engine)
      throw new Error('Checkpoint execution engine differs from deployment');
    const completedRoutingAction = plan.actions.find((action) => action.kind === 'f5-routing-configure');
    if (
      plan.intent.operation === 'deploy' &&
      existing &&
      completedRoutingAction &&
      existing.completedActionIds.includes(completedRoutingAction.id)
    )
      await configureAwsRouting(
        runtime,
        plan,
        existing,
        api,
        () => saveAwsCheckpoint(ctx.sessionManager, existing),
        signal,
      );
    const brownfieldIds = [
      ...new Set([
        ...plan.intent.brownfield.resourceIds,
        ...plan.intent.brownfield.routeTableIds,
        ...plan.intent.brownfield.transitGatewayRouteTableIds,
      ]),
    ].sort();
    const resourceIdPattern =
      /^(?:arn:(?:aws|aws-us-gov|aws-cn):[a-z0-9-]+:[a-z0-9-]*:\d{12}:[A-Za-z0-9_+=,.@:/-]+|(?:vol-[0-9a-f]{8}(?:[0-9a-f]{9})?|(?:i|vpc|subnet|rtb|igw|tgw|tgw-attach|tgw-connect-peer|tgw-rtb|eni|sg|eipalloc|eipassoc|nat|vpce)-[0-9a-f]{8,21}))$/;
    const observedOwnedIds = () =>
      [
        ...new Set([
          ...observation.resources.filter((resource) => resource.owned).map((resource) => resource.id),
          ...Object.values(existing?.resolvedValues ?? {}).filter((value) => resourceIdPattern.test(value)),
        ]),
      ].sort();
    const ownershipPlanSha256s = [
      ...new Set([
        ...observation.ownershipPlanSha256s,
        ...(existing?.childPlanSha256s ?? []),
        ...observation.resources
          .filter((resource) => resource.owned)
          .map((resource) => resource.tags['xcsh-plan-sha256'])
          .filter((digest) => /^[a-f0-9]{64}$/.test(digest ?? '')),
        plan.planSha256,
      ]),
    ].sort();
    const current = await discoverAwsCompute(
      {
        awsProfile: plan.intent.awsProfile,
        vpcMode: plan.intent.vpc.mode,
        accountId: plan.accountId,
        partition: plan.partition,
        deploymentName: plan.deploymentName,
        requiredEnis: plan.interfaces.length,
        nodeCount: plan.topology.nodeCount,
        instanceTypes: observedInstanceTypeNames(observation),
        brownfieldResourceIds: brownfieldIds,
        observedOwnedResourceIds: observedOwnedIds(),
        ownedPlanSha256s: ownershipPlanSha256s,
        resourceRegion: plan.region,
        regionQualificationScope: 'resource-region',
        ...(plan.bootstrapKeyPair ? { bootstrapKeyPairNames: [plan.bootstrapKeyPair.name] } : {}),
        egressMode: plan.egress.mode,
        routingProfile: plan.routing.profile,
        f5Capabilities,
      },
      api,
      fetcher,
    );
    const pendingAction = existing?.pendingDelete ? plan.actions[existing.completedActionIds.length] : undefined;
    const currentForRevalidation = existing?.pendingDelete
      ? projectAwsPendingDeleteObservation(
          plan,
          current,
          existing,
          pendingAction
            ? executableAwsActionArgs(
                pendingAction,
                resolveAwsCeActionArgs(
                  pendingAction.args ?? [],
                  { ...existing.resolvedValues, __PLAN_SHA256__: plan.planSha256 },
                  plan.bootstrapKeyPair?.name,
                ),
              )
            : [],
          ownershipPlanSha256s,
        )
      : current;
    const childReplacementActive =
      Boolean(existing?.childPlanSha256s?.length) &&
      plan.actions.some((action) => action.id === existing?.failedActionId && action.kind === 'registration-gate');
    const revalidation = resumeObservationInputs(
      plan,
      observation,
      childReplacementActive
        ? plan.observationFingerprint
        : (existing?.observationFingerprint ?? plan.observationFingerprint),
      childReplacementActive ? brownfieldIds : [...brownfieldIds, ...observedOwnedIds()],
      existing?.completedActionIds.length ?? 0,
    );
    try {
      assertAwsObservationFresh(plan, currentForRevalidation, revalidation.expected, revalidation.ids);
    } catch {
      throw await captureAwsRevalidationRejection(
        plan,
        observation,
        current,
        revalidation.expected,
        revalidation.ids,
        'native-fingerprint',
        storage,
      );
    }
    if (existing?.ownedStateFingerprint && !childReplacementActive) {
      if (
        !matchesOwnedResourceFingerprint(
          existing.ownedStateFingerprint,
          currentForRevalidation.resources.filter((resource) => observedOwnedIds().includes(resource.id)),
        )
      )
        throw new Error('Stale AWS CE plan: owned resource tags, targets, attachments, peers, or state changed');
    }
    const expectedPrefix = plan.actions.slice(0, existing?.completedActionIds.length ?? 0).map((action) => action.id);
    if (existing && JSON.stringify(existing.completedActionIds) !== JSON.stringify(expectedPrefix))
      throw new Error('AWS CE checkpoint is not an ordered prefix of the immutable plan');
    if (ctx.hasUI) {
      if (
        !authorized &&
        !(await ctx.ui.confirm(
          'Apply immutable AWS CE plan',
          `${plan.planId}
${plan.planSha256}`,
        ))
      )
        throw new Error('AWS CE apply was not approved');
      if (
        plan.intent.operation === 'teardown' &&
        !(authorized && existing?.authorization?.destruction) &&
        !(await ctx.ui.confirm(
          'Tear down AWS Customer Edge',
          'Restore approved brownfield state and delete only owned resources?',
        ))
      )
        throw new Error('AWS CE teardown was not approved');
    }
    const completed = new Set(existing?.completedActionIds ?? []);
    const checkpoint = {
      schemaVersion: AWS_CE_SCHEMA_VERSION,
      engine: plan.engine,
      authorization: {
        planSha256: plan.planSha256,
        mutations: true,
        destruction: plan.intent.operation === 'teardown',
      },
      planId: plan.planId,
      planSha256: plan.planSha256,
      completedActionIds: [...completed],
      childPlanSha256s: existing?.childPlanSha256s ? [...existing.childPlanSha256s] : undefined,
      observationFingerprint: existing?.observationFingerprint,
      resolvedValues: { ...(existing?.resolvedValues ?? {}) },
      state: 'running',
      pendingCreate: existing?.pendingCreate,
      pendingDelete: existing?.pendingDelete,
    };
    for (const action of plan.actions) {
      if (completed.has(action.id)) continue;
      let launchDirectory;
      let gateMutation = false;
      const previousObservationFingerprint = checkpoint.observationFingerprint;
      const previousOwnedStateFingerprint = checkpoint.ownedStateFingerprint;
      const previousCaptures = new Map(
        [...(action.capture ? [action.capture] : []), ...(action.captures ?? [])].map((capture) => [
          capture.placeholder,
          checkpoint.resolvedValues[capture.placeholder],
        ]),
      );
      try {
        if (!(hasDeleteRecovery(action) && checkpoint.pendingDelete?.actionId === action.id))
          await assertAwsActionOwnership(plan, action, api, checkpoint.resolvedValues);
        const convergenceDeadline = Date.now() + 15 * 60000;
        while (true) {
          try {
            const gate = await assertGate(
              action,
              runtime,
              plan,
              checkpoint,
              async (evidence) => {
                if (evidence)
                  await storage.write(`${action.id}-evidence.json`, {
                    ...evidence,
                    planId: plan.planId,
                    planSha256: plan.planSha256,
                  });
                return saveAwsCheckpoint(ctx.sessionManager, checkpoint);
              },
              storage,
              ingressContract,
              api,
              fetcher,
              signal,
            );
            gateMutation = gate?.mutated === true;
            if (gate?.pending) break;
            if (action.kind === 'f5-routing-configure')
              await persistAwsNativeRoutingCheckpoint(plan, checkpoint, storage);
            break;
          } catch (error) {
            if (
              signal?.aborted ||
              !(error instanceof Error) ||
              !error.message.includes('has not converged') ||
              Date.now() >= convergenceDeadline
            )
              throw error;
            await new Promise((resolve, reject) => {
              const abort = () => {
                clearTimeout(timer);
                reject(new Error('AWS CE convergence cancelled'));
              };
              const timer = setTimeout(() => {
                signal?.removeEventListener('abort', abort);
                resolve();
              }, 1e4);
              signal?.addEventListener('abort', abort, { once: true });
              if (signal?.aborted) abort();
            });
          }
        }
        if (action.command && action.args) {
          if (action.requiresBootstrap && action.node) {
            const selected = siteBindings(plan).find(({ site }) => site.nodeIndexes.includes(action.node ?? 0));
            if (!selected) throw new Error('Bootstrap node has no site binding');
            const { site, binding } = selected;
            const hostname = `${plan.deploymentName}-${action.node}`;
            if (plan.interfaces.some((item) => !['slo', 'sli'].includes(item.role)))
              throw new Error('This interface configuration requires an explicit supported F5 wire mapping');
            const siteCheckpoint = async (record) => {
              checkpoint.resolvedValues[`__F5_SITE_${site.nodeIndexes[0]}_UID__`] = String(record.uid);
              await saveAwsCheckpoint(ctx.sessionManager, checkpoint);
            };
            if (awsNativePrebootSiteRequired(plan, site.nodeIndexes.length)) {
              const position = site.nodeIndexes.indexOf(action.node);
              const previous = site.nodeIndexes[position - 1];
              if (previous !== undefined) {
                const launchedAt = checkpoint.resolvedValues[`__HA_LAUNCHED_AT_${previous}__`];
                if (!launchedAt || Number.isNaN(Date.parse(launchedAt)))
                  throw new Error('Prior HA node launch boundary is unavailable');
                await waitUntil(Date.parse(launchedAt) + 180000, signal);
              }
              await runtime.ensureSite(
                binding,
                buildAwsNativePrebootSiteIntent(plan, site.nodeIndexes, checkpoint.resolvedValues),
                siteCheckpoint,
                signal,
              );
            } else await runtime.reserveSite(binding, siteCheckpoint, signal);
            const root = storage.directory;
            await mkdir(root, { recursive: true, mode: 448 });
            await chmod(root, 448);
            launchDirectory = await mkdtemp2(join3(root, 'node-'));
            await chmod(launchDirectory, 448);
            const path = join3(launchDirectory, 'cloud-init.yaml');
            const tokenName = `${plan.deploymentName.slice(0, 40)}-${action.node}-${plan.planSha256.slice(0, 12)}`;
            const material = await runtime.bootstrap(
              binding,
              hostname,
              tokenName,
              async (secret) => {
                await storage.write(`${tokenName}.json`, secret);
                checkpoint.resolvedValues[`__F5_TOKEN_${action.node}__`] = tokenName;
                await saveAwsCheckpoint(ctx.sessionManager, checkpoint);
              },
              signal,
            );
            await writeFile2(path, renderAwsCeCloudInit({ nodeName: hostname, material }), { mode: 384 });
            checkpoint.resolvedValues.__BOOTSTRAP_FILE__ = path;
          }
          const args = executableAwsActionArgs(
            action,
            resolveAwsCeActionArgs(
              action.args,
              { ...checkpoint.resolvedValues, __PLAN_SHA256__: plan.planSha256 },
              plan.bootstrapKeyPair?.name,
            ),
          );
          if (action.kind === 'instance-run') await revalidateAwsBootstrapKeyPair(plan, api);
          const result =
            action.kind === 'elastic-ip-associate'
              ? await associateAwsCeEip(api, plan, args, signal)
              : hasCreateRecovery(action)
                ? await executeRecoverableCreate(
                    api,
                    plan,
                    action,
                    args,
                    checkpoint,
                    () => saveAwsCheckpoint(ctx.sessionManager, checkpoint),
                    signal,
                  )
                : hasDeleteRecovery(action)
                  ? await executeRecoverableDelete(
                      api,
                      plan,
                      action,
                      args,
                      checkpoint,
                      () => saveAwsCheckpoint(ctx.sessionManager, checkpoint),
                      ownershipPlanSha256s,
                      signal,
                    )
                  : action.kind === 'brownfield-restore' &&
                      (await isAwsBrownfieldRestoreConverged(plan, { ...action, args }, api))
                    ? { exitCode: 0, stdout: '{}', stderr: '' }
                    : await api.exec(action.command, args);
          if (launchDirectory) {
            delete checkpoint.resolvedValues.__BOOTSTRAP_FILE__;
            await rm2(launchDirectory, { recursive: true, force: true });
            launchDirectory = undefined;
          }
          if (result.exitCode !== 0)
            throw new Error(`AWS action ${action.id} failed with exit code ${result.exitCode}`);
          if (action.capture || action.captures) {
            let raw;
            try {
              raw = JSON.parse(result.stdout);
            } catch {
              throw new Error(`AWS action ${action.id} returned invalid capture JSON`);
            }
            if (action.kind === 'eni-create' && action.node) {
              const item = plan.interfaces.find((item) =>
                action.captures?.some((capture) => capture.placeholder === `__ENI_${action.node}_${item.index}_MAC__`),
              );
              if (!item) throw new Error('ENI response has no planned interface binding');
              const selected = awsCeStaticIp(plan.intent, action.node, item.index);
              const eni = raw.NetworkInterface;
              if (selected && eni?.PrivateIpAddress !== selected.ip_address.split('/')[0])
                throw new Error('Allocated static primary address differs from the plan');
            }
            for (const capture of [...(action.capture ? [action.capture] : []), ...(action.captures ?? [])]) {
              const value = valueAtPath(raw, capture.path);
              if (!value) throw new Error(`AWS action ${action.id} did not return ${capture.path}`);
              checkpoint.resolvedValues[capture.placeholder] = value;
            }
            if (
              action.kind === 'instance-run' &&
              action.node &&
              siteBindings(plan).some(
                ({ site }) => site.nodeIndexes.length === 3 && site.nodeIndexes.includes(action.node ?? 0),
              )
            )
              checkpoint.resolvedValues[`__HA_LAUNCHED_AT_${action.node}__`] ??= new Date().toISOString();
          }
        }
        if (action.mutates || gateMutation) {
          const ids = [
            ...new Set([
              ...brownfieldIds,
              ...observation.resources.filter((resource) => resource.owned).map((resource) => resource.id),
              ...Object.values(checkpoint.resolvedValues).filter((value) => resourceIdPattern.test(value)),
            ]),
          ].sort();
          if (ids.length) {
            const resources = await observeAwsResources(api, ids, plan.region, {
              deploymentName: plan.deploymentName,
              planSha256s: ownershipPlanSha256s,
            });
            const ownedIds = ids.filter((id) => !brownfieldIds.includes(id));
            checkpoint.ownedStateFingerprint = fingerprintOwnedResources(
              resources.filter((resource) => ownedIds.includes(resource.id)),
            );
            checkpoint.observationFingerprint = fingerprintObservation(
              { ...current, resources },
              ids,
              awsCeObservationRegion(plan),
            );
          }
        }
        if (gateMutation) {
          const saved = await storage.read(`${action.id}-initial-mtu-replacement.json`);
          const child = saved.plan;
          const childCheckpoint = child ? await storage.read(`${child.planId}.json`) : undefined;
          if (childCheckpoint?.phase !== 'complete')
            throw new Error('Automatic preboot MTU replacement has not converged');
        }
        completed.add(action.id);
        checkpoint.completedActionIds = [...completed];
        checkpoint.failedActionId = undefined;
        const pendingCreate = checkpoint.pendingCreate;
        const pendingDelete = checkpoint.pendingDelete;
        checkpoint.pendingCreate = undefined;
        checkpoint.pendingDelete = undefined;
        try {
          await saveAwsCheckpoint(ctx.sessionManager, checkpoint);
        } catch (error) {
          checkpoint.pendingCreate = pendingCreate;
          checkpoint.pendingDelete = pendingDelete;
          completed.delete(action.id);
          checkpoint.completedActionIds = [...completed];
          throw error;
        }
      } catch (error) {
        if (!gateMutation) {
          checkpoint.observationFingerprint = previousObservationFingerprint;
          checkpoint.ownedStateFingerprint = previousOwnedStateFingerprint;
        }
        if (checkpoint.pendingCreate?.actionId === action.id) {
          for (const [placeholder, value] of previousCaptures) {
            if (value === undefined) delete checkpoint.resolvedValues[placeholder];
            else checkpoint.resolvedValues[placeholder] = value;
          }
        }
        if (launchDirectory) await rm2(launchDirectory, { recursive: true, force: true });
        delete checkpoint.resolvedValues.__BOOTSTRAP_FILE__;
        checkpoint.state = 'partial';
        checkpoint.failedActionId = action.id;
        await saveAwsCheckpoint(ctx.sessionManager, checkpoint);
        throw new Error(
          `${error instanceof Error ? error.message : String(error)}. Resume with the same plan ID and SHA-256; ${completed.size}/${plan.actions.length} actions are checkpointed.`,
        );
      }
    }
    checkpoint.state = 'complete';
    await saveAwsCheckpoint(ctx.sessionManager, checkpoint);
    return { plan, checkpoint };
  };
  return plan.engine === 'native'
    ? withAwsNativeOperation(
        storage,
        { kind: 'apply', planSha256: plan.planSha256, operation: plan.intent.operation },
        execute,
      )
    : execute();
}

// plugins/aws/src/ce/terraform-brownfield-placement.ts
var object8 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Malformed brownfield placement evidence');
  return value;
};
var rows = (value) => {
  if (!Array.isArray(value)) throw Error('Incomplete brownfield placement evidence');
  return value.map(object8);
};
function placementPlan(plan) {
  verifyAwsCePlan(plan);
  const intent = plan.intent;
  if (
    plan.engine !== 'terraform' ||
    intent.operation !== 'deploy' ||
    intent.vpc.mode !== 'brownfield' ||
    intent.routing.profile !== 'direct-eni' ||
    intent.topology.nodeCount !== 1 ||
    intent.interfaces.length !== 2 ||
    intent.interfaces[0].index !== 0 ||
    intent.interfaces[1].index !== 1 ||
    intent.interfaces[0].role !== 'slo' ||
    intent.interfaces[1].role !== 'sli' ||
    intent.interfaces.some((i) => i.subnets.length !== 1) ||
    intent.egress.mode !== 'elastic-ip'
  )
    throw Error('Brownfield placement requires exact single-node Terraform direct routing');
  validateAwsCeAddressing(intent);
  const ids = [intent.vpc.vpcId, ...intent.interfaces.map((i) => i.subnets[0]?.subnetId)];
  if (
    !/^vpc-[a-f0-9]{8,17}$/.test(ids[0] ?? '') ||
    ids.slice(1).some((id) => !/^subnet-[a-f0-9]{8,17}$/.test(id ?? '')) ||
    new Set(ids).size !== 3 ||
    ids.some((id) => !intent.brownfield.resourceIds.includes(id ?? ''))
  )
    throw Error('Brownfield placement identifiers are unresolved or outside the allowlist');
  return ids;
}
function qualifyAwsTerraformBrownfieldPlacement(plan, observation) {
  const [vpcId, sloSubnetId, sliSubnetId] = placementPlan(plan);
  const intent = plan.intent;
  if (
    observation.identity.accountId !== intent.accountId ||
    observation.identity.partition !== intent.partition ||
    observation.identity.awsProfile !== intent.awsProfile
  )
    throw Error('Brownfield placement observer identity differs');
  const references = [];
  const read = (id, key, field) => {
    const patterns = {
      Vpcs: /^vpc-[a-f0-9]{8,17}$/,
      Subnets: /^subnet-[a-f0-9]{8,17}$/,
      RouteTables: /^rtb-[a-f0-9]{8,17}$/,
      InternetGateways: /^igw-[a-f0-9]{8,17}$/,
    };
    if (!patterns[key]?.test(id)) throw Error('Brownfield placement reference identity is unresolved');
    if (!intent.brownfield.resourceIds.includes(id) && !intent.brownfield.routeTableIds.includes(id))
      throw Error('Brownfield placement reference is outside the allowlist');
    const found = observation.resources.filter((r) => r.id === id);
    const before = plan.rollback.resources.filter((r) => r.id === id);
    if (found.length !== 1 || before.length !== 1 || !found[0].exists || found[0].region !== intent.region)
      throw Error('Brownfield placement resource is unavailable or ambiguous');
    if (['NextToken', 'nextToken', 'NextMarker', 'Marker'].some((key) => Object.hasOwn(found[0].state, key)))
      throw Error('Partial brownfield placement evidence');
    const actual = rows(found[0].state[key]);
    if (actual.length !== 1 || actual[0][field] !== id || actual[0].OwnerId !== intent.accountId)
      throw Error('Brownfield placement physical ownership differs');
    const original = { ...found[0], state: before[0].before };
    if (canonicalSha256(resourceConfiguration([found[0]])) !== canonicalSha256(resourceConfiguration([original])))
      throw Error('Brownfield placement immutable snapshot drift');
    references.push(id);
    return actual[0];
  };
  const vpc = read(vpcId, 'Vpcs', 'VpcId');
  if (vpc.State !== 'available' || vpc.CidrBlock !== intent.vpc.cidr) throw Error('Brownfield placement VPC differs');
  for (const [index, id] of [sloSubnetId, sliSubnetId].entries()) {
    const subnet = read(id, 'Subnets', 'SubnetId');
    const requested = intent.interfaces[index].subnets[0];
    if (
      subnet.State !== 'available' ||
      subnet.VpcId !== vpcId ||
      subnet.AvailabilityZone !== requested.availabilityZone ||
      (requested.cidr && subnet.CidrBlock !== requested.cidr)
    )
      throw Error('Brownfield placement subnet differs');
  }
  const tables = observation.resources.filter((r) => intent.brownfield.routeTableIds.includes(r.id));
  const effective = (subnetId) => {
    const matches = tables.flatMap((r) =>
      rows(r.state.RouteTables)
        .filter((t) => rows(t.Associations).some((a) => a.SubnetId === subnetId))
        .map((t) => ({ id: r.id, table: t })),
    );
    if (matches.length !== 1) throw Error('Brownfield placement requires one explicit verified subnet association');
    const table = read(matches[0].id, 'RouteTables', 'RouteTableId');
    const associations = rows(table.Associations).filter((a) => a.SubnetId === subnetId);
    if (
      table.VpcId !== vpcId ||
      associations.length !== 1 ||
      associations[0].Main !== false ||
      object8(associations[0].AssociationState).State !== 'associated'
    )
      throw Error('Brownfield placement route association differs');
    const routes = rows(table.Routes);
    const destinations = routes.map(
      (r) => r.DestinationCidrBlock ?? r.DestinationIpv6CidrBlock ?? r.DestinationPrefixListId,
    );
    if (
      destinations.some((d) => typeof d !== 'string') ||
      new Set(destinations).size !== destinations.length ||
      routes.filter((r) => r.DestinationCidrBlock === vpc.CidrBlock && r.GatewayId === 'local' && r.State === 'active')
        .length !== 1
    )
      throw Error('Brownfield placement local routing is unavailable or ambiguous');
    return { id: matches[0].id, routes };
  };
  const slo = effective(sloSubnetId),
    sli = effective(sliSubnetId);
  if (slo.id === sli.id || intent.routes?.some((r) => [slo.id, sli.id].includes(r.routeTableId)))
    throw Error('Brownfield placement overlaps workload route ownership');
  const defaults = slo.routes.filter((r) => r.DestinationCidrBlock === '0.0.0.0/0');
  if (
    defaults.length !== 1 ||
    defaults[0].State !== 'active' ||
    defaults[0].Origin !== 'CreateRoute' ||
    [
      'NatGatewayId',
      'NetworkInterfaceId',
      'TransitGatewayId',
      'VpcPeeringConnectionId',
      'EgressOnlyInternetGatewayId',
      'CarrierGatewayId',
      'LocalGatewayId',
      'CoreNetworkArn',
    ].some((key) => Object.hasOwn(defaults[0], key)) ||
    typeof defaults[0].GatewayId !== 'string' ||
    !/^igw-[a-f0-9]{8,17}$/.test(defaults[0].GatewayId)
  )
    throw Error('Brownfield placement management egress is unavailable');
  const internetGatewayId = defaults[0].GatewayId;
  const gateway = read(internetGatewayId, 'InternetGateways', 'InternetGatewayId');
  const attachments = rows(gateway.Attachments);
  if (attachments.length !== 1 || attachments[0].VpcId !== vpcId || attachments[0].State !== 'available')
    throw Error('Brownfield placement internet gateway attachment differs');
  const snapshot = {
    schemaVersion: 1,
    kind: 'aws-ce-terraform-brownfield-placement',
    sourcePlanSha256: plan.planSha256,
    vpcId,
    subnets: { '1:0': sloSubnetId, '1:1': sliSubnetId },
    managementRouteTableId: slo.id,
    insideRouteTableId: sli.id,
    internetGatewayId,
    referenceIds: [...new Set(references)].sort(),
  };
  return { ...snapshot, snapshotSha256: canonicalSha256(snapshot) };
}
function assertAwsTerraformBrownfieldPlacement(plan, binding) {
  const [vpcId, slo, sli] = placementPlan(plan);
  if (!binding) throw Error('Qualified brownfield placement is required');
  const { snapshotSha256, ...snapshot } = binding;
  const expectedReferences = [
    vpcId,
    slo,
    sli,
    binding.managementRouteTableId,
    binding.insideRouteTableId,
    binding.internetGatewayId,
  ].sort();
  if (
    !/^rtb-[a-f0-9]{8,17}$/.test(binding.managementRouteTableId) ||
    !/^rtb-[a-f0-9]{8,17}$/.test(binding.insideRouteTableId) ||
    binding.managementRouteTableId === binding.insideRouteTableId ||
    !/^igw-[a-f0-9]{8,17}$/.test(binding.internetGatewayId) ||
    canonicalSha256(binding.referenceIds) !== canonicalSha256(expectedReferences) ||
    expectedReferences.some(
      (id) => !plan.intent.brownfield.resourceIds.includes(id) && !plan.intent.brownfield.routeTableIds.includes(id),
    )
  )
    throw Error('Brownfield placement reference binding differs');
  if (
    binding.schemaVersion !== 1 ||
    binding.kind !== 'aws-ce-terraform-brownfield-placement' ||
    binding.sourcePlanSha256 !== plan.planSha256 ||
    binding.vpcId !== vpcId ||
    binding.subnets['1:0'] !== slo ||
    binding.subnets['1:1'] !== sli ||
    Object.keys(binding.subnets).length !== 2 ||
    canonicalSha256(snapshot) !== snapshotSha256
  )
    throw Error('Brownfield placement binding differs');
}

// plugins/aws/src/ce/terraform-brownfield-binding.ts
var file = 'terraform-brownfield-placement.json';
function original(plan) {
  return {
    identity: {
      accountId: plan.intent.accountId,
      partition: plan.intent.partition,
      awsProfile: plan.intent.awsProfile,
      arn: '',
    },
    resources: plan.rollback.resources.map((r) => ({
      id: r.id,
      region: plan.intent.region,
      exists: true,
      owned: false,
      tags: {},
      state: structuredClone(r.before),
    })),
  };
}
function awsTerraformBrownfieldPlacementBaseline(plan) {
  verifyAwsCePlan(plan);
  return qualifyAwsTerraformBrownfieldPlacement(plan, original(plan));
}
async function observe(plan, binding, raw, signal) {
  const api = scopedAwsApi(raw, plan.intent.awsProfile, signal);
  const read = async (args) => {
    const result = await api.exec('aws', [...args, '--region', plan.intent.region, '--output', 'json']);
    if (result.exitCode) throw Error('Brownfield placement cloud observation unavailable');
    const value = JSON.parse(result.stdout);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw Error('Malformed brownfield placement cloud observation');
    if (['NextToken', 'nextToken', 'NextMarker', 'Marker'].some((k) => Object.hasOwn(value, k)))
      throw Error('Partial brownfield placement cloud observation');
    return value;
  };
  const identity = await read(['sts', 'get-caller-identity']);
  if (
    identity.Account !== plan.intent.accountId ||
    typeof identity.Arn !== 'string' ||
    !identity.Arn.startsWith(`arn:${plan.intent.partition}:`) ||
    identity.Arn.split(':')[4] !== plan.intent.accountId
  )
    throw Error('Brownfield placement cloud account or partition differs');
  const take = async () => {
    const resources = [];
    for (const id of binding.referenceIds) {
      const command = id.startsWith('vpc-')
        ? 'describe-vpcs'
        : id.startsWith('subnet-')
          ? 'describe-subnets'
          : id.startsWith('rtb-')
            ? 'describe-route-tables'
            : 'describe-internet-gateways';
      const selector = id.startsWith('vpc-')
        ? '--vpc-ids'
        : id.startsWith('subnet-')
          ? '--subnet-ids'
          : id.startsWith('rtb-')
            ? '--route-table-ids'
            : '--internet-gateway-ids';
      resources.push({
        id,
        region: plan.intent.region,
        exists: true,
        owned: false,
        tags: {},
        state: await read(['ec2', command, selector, id]),
      });
    }
    return {
      identity: {
        accountId: plan.intent.accountId,
        partition: plan.intent.partition,
        awsProfile: plan.intent.awsProfile,
        arn: identity.Arn,
      },
      resources,
    };
  };
  const first = await take(),
    second = await take();
  if (canonicalSha256(first) !== canonicalSha256(second))
    throw Error('Brownfield placement changed during observation');
  const qualified = qualifyAwsTerraformBrownfieldPlacement(plan, second);
  if (canonicalSha256(qualified) !== canonicalSha256(binding))
    throw Error('Brownfield placement observed binding differs');
  return { binding: qualified, evidenceSha256: canonicalSha256(second), observedAt: new Date().toISOString() };
}
async function scope(plan, storage) {
  verifyAwsCePlan(plan);
  const owner = storage.owner;
  if (
    plan.engine !== 'terraform' ||
    owner.engine !== 'terraform' ||
    owner.provider !== 'aws' ||
    owner.account !== plan.intent.accountId ||
    owner.region !== plan.intent.region ||
    owner.deploymentId !== plan.intent.deploymentName
  )
    throw Error('Brownfield placement durable owner differs');
  await storage.verify();
}
async function prepareAwsTerraformBrownfieldBinding(plan, storage, api, signal) {
  await scope(plan, storage);
  signal?.throwIfAborted();
  const baseline = awsTerraformBrownfieldPlacementBaseline(plan);
  let prior;
  try {
    prior = await storage.read(file);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (prior !== undefined && canonicalSha256(prior) !== canonicalSha256(baseline))
    throw Error('Persisted brownfield placement differs');
  const observation = await observe(plan, baseline, api, signal);
  await storage.verify();
  if (prior === undefined) await storage.write(file, baseline);
  await storage.write('terraform-brownfield-placement-preparation-observation.json', observation);
  return baseline;
}
async function loadAwsTerraformBrownfieldBinding(plan, storage, api, signal) {
  await scope(plan, storage);
  signal?.throwIfAborted();
  const binding = await storage.read(file);
  assertAwsTerraformBrownfieldPlacement(plan, binding);
  const baseline = awsTerraformBrownfieldPlacementBaseline(plan);
  if (canonicalSha256(binding) !== canonicalSha256(baseline))
    throw Error('Persisted brownfield placement original snapshot differs');
  const observation = await observe(plan, binding, api, signal);
  await storage.verify();
  let terminal = false;
  try {
    await storage.read('aws-terraform-terminal-cleanup.json');
    terminal = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (!terminal) await storage.write('terraform-brownfield-placement-opening-observation.json', observation);
  return binding;
}

// plugins/aws/src/ce/terraform-connect-stage.ts
// plugins/aws/src/ce/terraform-foundation.ts
import { createHash, createHash as createHash2 } from 'node:crypto';

// plugins/terraform/src/literal.ts
var terraformLiteral = (value) => value.replaceAll('${', () => '$${').replaceAll('%{', () => '%%{');

// plugins/aws/src/ce/terraform-foundation.ts
import { readFile } from 'node:fs/promises';

var ref = (address) => `\${${address}}`;
var literal = terraformLiteral;
function renderAwsTerraformFoundation(plan, bootstrapByNode = {}, placement) {
  verifyAwsCePlan(plan);
  assertAwsDeploymentCompilerOperation(plan.intent);
  if (plan.engine !== 'terraform' || plan.intent.operation !== 'deploy')
    throw new Error('Terraform foundation requires a Terraform deployment plan');
  const intent = plan.intent;
  if (intent.egress.mode !== 'elastic-ip') throw new Error('Terraform foundation requires Elastic IP egress');
  if (!['greenfield', 'brownfield'].includes(intent.vpc.mode))
    throw new Error('Terraform foundation VPC mode is unknown');
  const brownfield = intent.vpc.mode === 'brownfield';
  if (brownfield) assertAwsTerraformBrownfieldPlacement(plan, placement);
  else if (placement) throw new Error('Greenfield foundation cannot consume brownfield placement');
  const vpcId = placement ? placement.vpcId : ref('aws_vpc.ce.id');
  const subnetId = (node, index) =>
    placement ? placement.subnets[`${node}:${index}`] : ref(`aws_subnet.node_${node}_nic_${index}.id`);
  validateAwsCeAddressing(intent);
  const keys = Object.keys(bootstrapByNode);
  if (keys.some((key) => !/^[1-3]$/.test(key) || Number(key) > intent.topology.nodeCount))
    throw new Error('Invalid Terraform node admission');
  const admitted = keys.map(Number);
  const hasHaSite = siteTopology(intent).some((site) => site.nodeIndexes.length === 3);
  const resource = {};
  const add = (type, name, value) => {
    resource[type] ??= {};
    resource[type][name] = value;
  };
  const tags = (node, index) => ({
    'xcsh-managed-by': 'aws-ce',
    'xcsh-execution-engine': 'terraform',
    'xcsh-deployment-id': intent.deploymentName,
    'xcsh-plan-sha256': plan.planSha256,
    'ves-io-site-name': node ? siteForNode(intent, node).name : intent.siteName,
    ...(node ? { 'xcsh-node-index': String(node) } : {}),
    ...(index !== undefined ? { 'xcsh-interface-index': String(index) } : {}),
  });
  const staticRoutes = staticAzRoutes(intent);
  if (!brownfield) {
    add('aws_vpc', 'ce', {
      cidr_block: intent.vpc.cidr,
      enable_dns_support: true,
      enable_dns_hostnames: true,
      tags: tags(),
    });
    add('aws_internet_gateway', 'ce', { vpc_id: vpcId, tags: tags() });
    for (const role of new Set(intent.interfaces.map((item) => item.role)))
      if (role !== 'sli' || !staticRoutes.length) add('aws_route_table', role, { vpc_id: vpcId, tags: tags() });
    for (const az of staticRoutes) add('aws_route_table', `static_${az.node}`, { vpc_id: vpcId, tags: tags(az.node) });
    add('aws_route', 'internet', {
      route_table_id: ref('aws_route_table.slo.id'),
      destination_cidr_block: '0.0.0.0/0',
      gateway_id: ref('aws_internet_gateway.ce.id'),
    });
  }
  for (const [index, group] of intent.securityGroups.entries()) {
    const rules = (direction) => {
      const configured = group[direction].map((rule) => ({
        protocol: rule.protocol,
        from_port: rule.fromPort ?? 0,
        to_port: rule.toPort ?? 0,
        cidr_blocks: rule.cidrs,
        ipv6_cidr_blocks: [],
        prefix_list_ids: [],
        security_groups: [],
        self: rule.self ?? false,
        description: '',
      }));
      if (direction === 'ingress' && hasHaSite && !configured.some((rule) => rule.self))
        configured.push({
          protocol: '-1',
          from_port: 0,
          to_port: 0,
          cidr_blocks: [],
          ipv6_cidr_blocks: [],
          prefix_list_ids: [],
          security_groups: [],
          self: true,
          description: 'F5 CE HA intra-cluster communication',
        });
      return configured;
    };
    add('aws_security_group', `group_${index}`, {
      name: literal(`${intent.deploymentName}-${group.name}`),
      description: 'Customer Edge deployment security group',
      vpc_id: vpcId,
      ingress: rules('ingress'),
      egress: rules('egress'),
      tags: tags(),
    });
  }
  const interfaceOutputs = {};
  const instanceOutputs = {};
  for (let node = 1; node <= intent.topology.nodeCount; node++) {
    for (const item of intent.interfaces) {
      const name = `node_${node}_nic_${item.index}`;
      const subnet = item.subnets[node - 1];
      if (!brownfield && !subnet?.cidr) throw new Error('Terraform foundation subnet CIDR is missing');
      if (!brownfield)
        add('aws_subnet', name, {
          vpc_id: vpcId,
          availability_zone: subnet.availabilityZone,
          cidr_block: subnet.cidr,
          tags: tags(node, item.index),
        });
      const privateAddresses = awsCeInterfacePrivateAddresses(intent, node, item.index);
      add('aws_network_interface', name, {
        subnet_id: subnetId(node, item.index),
        security_groups: interfaceSecurityGroups(intent, item.index).map((name) =>
          ref(`aws_security_group.group_${intent.securityGroups.findIndex((group) => group.name === name)}.id`),
        ),
        source_dest_check: false,
        ...(privateAddresses.length ? { private_ip_list_enabled: true, private_ip_list: privateAddresses } : {}),
        tags: tags(node, item.index),
      });
      if (!brownfield)
        add('aws_route_table_association', name, {
          subnet_id: subnetId(node, item.index),
          route_table_id: ref(
            `aws_route_table.${item.role === 'sli' && staticRoutes.length ? `static_${node}` : item.role}.id`,
          ),
        });
      interfaceOutputs[`${node}:${item.index}`] = {
        id: ref(`aws_network_interface.${name}.id`),
        subnet_id: subnetId(node, item.index),
        mac: ref(`aws_network_interface.${name}.mac_address`),
        private_ip: ref(`aws_network_interface.${name}.private_ip`),
        site_name: siteForNode(intent, node).name,
        node,
        index: item.index,
        role: item.role,
      };
    }
    add('aws_eip', `node_${node}`, { domain: 'vpc', tags: tags(node) });
    if (!admitted.includes(node)) continue;
    const bootstrap = bootstrapByNode[String(node)];
    if (
      !bootstrap.startsWith('#cloud-config') ||
      !bootstrap.includes('/etc/vpm/user_data') ||
      /__\w+__/.test(bootstrap)
    )
      throw new Error('Terraform node admission requires resolved platform cloud-init');
    add('aws_instance', `node_${node}`, {
      ami: intent.image.amiId,
      instance_type: intent.instance.type,
      user_data_base64: Buffer.from(bootstrap).toString('base64'),
      user_data_replace_on_change: true,
      ...(intent.instance.bootstrapKeyPairName ? { key_name: literal(intent.instance.bootstrapKeyPairName) } : {}),
      ...(intent.instance.instanceProfileArn
        ? { iam_instance_profile: intent.instance.instanceProfileArn.split('/').at(-1) }
        : {}),
      network_interface: intent.interfaces.map((item) => ({
        device_index: item.index,
        network_interface_id: ref(`aws_network_interface.node_${node}_nic_${item.index}.id`),
        delete_on_termination: false,
      })),
      root_block_device: [
        { volume_size: intent.instance.diskGiB, volume_type: 'gp3', delete_on_termination: true, encrypted: true },
      ],
      tags: tags(node),
      volume_tags: tags(node),
      depends_on: brownfield
        ? intent.interfaces.map((item) => `aws_network_interface.node_${node}_nic_${item.index}`)
        : ['aws_route.internet', `aws_route_table_association.node_${node}_nic_0`],
    });
    add('aws_eip_association', `node_${node}`, {
      allocation_id: ref(`aws_eip.node_${node}.id`),
      network_interface_id: ref(`aws_network_interface.node_${node}_nic_0.id`),
      depends_on: [`aws_instance.node_${node}`],
    });
    instanceOutputs[String(node)] = {
      id: ref(`aws_instance.node_${node}.id`),
      site_name: siteForNode(intent, node).name,
      hostname: `${intent.deploymentName}-${node}`,
    };
  }
  const ingress = awsCeNlbIngress(intent);
  if (ingress) {
    const check = nlbSettings(intent).healthCheck;
    const inside = intent.interfaces.find((item) => item.role === 'sli');
    if (!inside) throw new Error('NLB ingress requires an explicit SLI interface');
    add('aws_lb', 'ce', {
      name: literal(`${intent.deploymentName}-nlb`),
      internal: ingress.scheme === 'internal',
      load_balancer_type: 'network',
      ...(intent.ingress?.mode === 'nlb'
        ? {
            subnet_mapping: intent.ingress.loadBalancer.subnetIds.map((subnet_id, index) => ({
              subnet_id,
              private_ipv4_address:
                intent.ingress?.mode === 'nlb' ? intent.ingress.loadBalancer.privateAddresses[index] : '',
            })),
          }
        : {
            subnets: intent.interfaces[0].subnets.map((_subnet, index) => subnetId(index + 1, 0)),
          }),
      enable_cross_zone_load_balancing: true,
      tags: tags(),
    });
    add('aws_lb_target_group', 'ce', {
      name: literal(`${intent.deploymentName}-ce`),
      port: ingress.port,
      protocol: 'TCP',
      target_type: 'ip',
      vpc_id: intent.ingress?.mode === 'nlb' ? intent.ingress.loadBalancer.vpcId : vpcId,
      health_check: [
        {
          protocol: check.protocol,
          port: String(check.port),
          interval: check.intervalSeconds,
          timeout: check.timeoutSeconds,
          healthy_threshold: check.healthyThreshold,
          unhealthy_threshold: check.unhealthyThreshold,
          ...(check.path ? { path: check.path } : {}),
        },
      ],
      tags: tags(),
    });
    add('aws_lb_listener', 'ce', {
      load_balancer_arn: ref('aws_lb.ce.arn'),
      port: ingress.port,
      protocol: 'TCP',
      default_action: [{ type: 'forward', target_group_arn: ref('aws_lb_target_group.ce.arn') }],
      tags: tags(),
    });
    for (const node of admitted)
      add('aws_lb_target_group_attachment', `node_${node}`, {
        target_group_arn: ref('aws_lb_target_group.ce.arn'),
        target_id:
          intent.ingress?.mode === 'nlb' && intent.ingress.listener.usePrimaryInterfaceAddress !== true
            ? intent.ingress.listener.privateAddresses?.[node - 1]
            : ref(`aws_network_interface.node_${node}_nic_${inside.index}.private_ip`),
        port: ingress.port,
        ...(intent.ingress?.mode === 'nlb' ? { availability_zone: 'all' } : {}),
        depends_on: [`aws_instance.node_${node}`],
      });
  }
  return JSON.stringify({
    terraform: {
      required_version: `= ${AWS_CE_TERRAFORM_VERSION}`,
      required_providers: { aws: { source: 'hashicorp/aws', version: `= ${AWS_CE_TERRAFORM_PROVIDER_VERSION}` } },
    },
    provider: {
      aws: {
        region: intent.region,
        allowed_account_ids: [intent.accountId],
        ...(intent.awsProfile ? { profile: literal(intent.awsProfile) } : {}),
      },
    },
    resource,
    output: {
      ce_vpc_id: { value: vpcId },
      ce_interfaces: { value: interfaceOutputs },
      ce_instances: { value: instanceOutputs },
      ...(ingress
        ? {
            ce_ingress: {
              value: {
                load_balancer_arn: ref('aws_lb.ce.arn'),
                dns_name: ref('aws_lb.ce.dns_name'),
                target_group_arn: ref('aws_lb_target_group.ce.arn'),
                listener_arn: ref('aws_lb_listener.ce.arn'),
                port: ingress.port,
                scheme: ingress.scheme,
              },
            },
          }
        : {}),
    },
  });
}
async function awsTerraformFoundationDeployment(plan, bootstrapByNode = {}, placement) {
  const configuration = renderAwsTerraformFoundation(plan, bootstrapByNode, placement);
  const providerLock = await readFile(
    new URL('./assets/plugins/aws/terraform/provider-lock.hcl', import.meta.url),
    'utf8',
  );
  if (createHash('sha256').update(providerLock).digest('hex') !== AWS_CE_PROVIDER_LOCK_SHA256)
    throw new Error('AWS provider lock changed');
  return {
    schemaVersion: 1,
    deploymentId: plan.intent.deploymentName,
    engine: 'terraform',
    scope: { cloud: 'aws', account: plan.intent.accountId, region: plan.intent.region },
    terraformVersion: AWS_CE_TERRAFORM_VERSION,
    configuration,
    providerLock,
    backendIdentity: `local:${plan.intent.deploymentName}`,
  };
}

// plugins/aws/src/ce/terraform-connect.ts
var ref2 = (address) => `\${${address}}`;
function renderAwsTerraformConnect(plan, observation, bootstrapByNode) {
  const config = JSON.parse(renderAwsTerraformFoundation(plan, bootstrapByNode));
  const intent = plan.intent;
  if (intent.routing.profile !== 'tgw-connect')
    throw new Error('Terraform Connect rendering requires the TGW Connect profile');
  if (Object.keys(bootstrapByNode).length !== intent.topology.nodeCount)
    throw new Error('Admit every selected node before creating Connect peers');
  if (intent.routing.transportAttachmentId || (intent.routes ?? []).length)
    throw new Error('Terraform brownfield transport and route restoration require explicit lifecycle translation');
  if (
    !intent.routing.transitGatewayId ||
    !/^tgw-[0-9a-f]{8,17}$/.test(intent.routing.transitGatewayId) ||
    (intent.routing.associations ?? []).length > 1
  )
    throw new Error('Terraform Connect requires one gateway and at most one association per attachment');
  if (
    !Number.isInteger(intent.routing.customerAsn) ||
    (intent.routing.customerAsn ?? 0) < 1 ||
    (intent.routing.customerAsn ?? 0) > 4294967295 ||
    intent.routing.customerAsn === intent.routing.transitGatewayAsn
  )
    throw new Error('Terraform Connect customer ASN is invalid');
  const cidrs = observedConnectCidrs(intent, observation);
  const peers =
    intent.routing.connectPeers ??
    (intent.routing.insideCidrs ?? []).map((insideCidr, index) => ({
      node: index + 1,
      insideCidr,
      transportInterfaceIndex: 0,
      transitGatewayAddress: undefined,
    }));
  if (!peers.length) throw new Error('Terraform Connect peer topology is missing');
  const resource = config.resource;
  const add = (type, name, value) => {
    resource[type] ??= {};
    resource[type][name] = value;
  };
  const tags = resource.aws_vpc.ce.tags;
  add('aws_ec2_transit_gateway_vpc_attachment', 'transport', {
    vpc_id: ref2('aws_vpc.ce.id'),
    transit_gateway_id: intent.routing.transitGatewayId,
    subnet_ids: [
      ...new Map(
        intent.interfaces[1].subnets.map((subnet, index) => [
          subnet.availabilityZone,
          ref2(`aws_subnet.node_${index + 1}_nic_1.id`),
        ]),
      ).values(),
    ],
    appliance_mode_support: 'enable',
    transit_gateway_default_route_table_association: false,
    transit_gateway_default_route_table_propagation: false,
    tags,
  });
  const tables = (attachment, name) => {
    for (const [index, table] of (intent.routing.associations ?? []).entries())
      add('aws_ec2_transit_gateway_route_table_association', `${name}_${index}`, {
        transit_gateway_attachment_id: attachment,
        transit_gateway_route_table_id: table,
      });
    for (const [index, table] of (intent.routing.propagations ?? []).entries())
      add('aws_ec2_transit_gateway_route_table_propagation', `${name}_${index}`, {
        transit_gateway_attachment_id: attachment,
        transit_gateway_route_table_id: table,
      });
  };
  tables(ref2('aws_ec2_transit_gateway_vpc_attachment.transport.id'), 'transport');
  for (const role of [...new Set(peers.map((peer) => peer.transportInterfaceIndex))]) {
    const interfaceRole = intent.interfaces.find((item) => item.index === role)?.role;
    if (interfaceRole !== 'slo' && interfaceRole !== 'sli')
      throw new Error('Terraform GRE transport requires an SLO or SLI interface');
    const routeTable = interfaceRole;
    for (const [index, cidr] of cidrs.entries())
      add('aws_route', `gre_${role}_${index}`, {
        route_table_id: ref2(`aws_route_table.${routeTable}.id`),
        destination_cidr_block: cidr,
        transit_gateway_id: intent.routing.transitGatewayId,
        depends_on: ['aws_ec2_transit_gateway_vpc_attachment.transport'],
      });
  }
  const counts = new Map();
  const groups = peers.map((peer) => {
    const index = counts.get(peer.transportInterfaceIndex) ?? 0;
    counts.set(peer.transportInterfaceIndex, index + 1);
    return `role_${peer.transportInterfaceIndex}_${Math.floor(index / 4) + 1}`;
  });
  for (const group of new Set(groups)) {
    add('aws_ec2_transit_gateway_connect', group, {
      protocol: 'gre',
      transit_gateway_id: intent.routing.transitGatewayId,
      transport_attachment_id: ref2('aws_ec2_transit_gateway_vpc_attachment.transport.id'),
      transit_gateway_default_route_table_association: false,
      transit_gateway_default_route_table_propagation: false,
      tags,
    });
    tables(ref2(`aws_ec2_transit_gateway_connect.${group}.id`), group);
  }
  const peerOutputs = {};
  for (const [index, peer] of peers.entries()) {
    const name = `peer_${index + 1}`;
    add('aws_ec2_transit_gateway_connect_peer', name, {
      transit_gateway_attachment_id: ref2(`aws_ec2_transit_gateway_connect.${groups[index]}.id`),
      peer_address: ref2(`aws_network_interface.node_${peer.node}_nic_${peer.transportInterfaceIndex}.private_ip`),
      bgp_asn: String(intent.routing.customerAsn),
      inside_cidr_blocks: [peer.insideCidr],
      ...(peer.transitGatewayAddress ? { transit_gateway_address: peer.transitGatewayAddress } : {}),
      tags: {
        ...tags,
        'ves-io-site-name': siteForNode(intent, peer.node).name,
        'xcsh-node-index': String(peer.node),
        'xcsh-connect-peer-index': String(index + 1),
      },
    });
    peerOutputs[String(index + 1)] = {
      id: ref2(`aws_ec2_transit_gateway_connect_peer.${name}.id`),
      attachment_id: ref2(`aws_ec2_transit_gateway_connect.${groups[index]}.id`),
      node: peer.node,
      transport_interface_index: peer.transportInterfaceIndex,
      transit_gateway_address: ref2(`aws_ec2_transit_gateway_connect_peer.${name}.transit_gateway_address`),
      bgp_peer_address: ref2(`aws_ec2_transit_gateway_connect_peer.${name}.bgp_peer_address`),
      bgp_transit_gateway_addresses: ref2(`aws_ec2_transit_gateway_connect_peer.${name}.bgp_transit_gateway_addresses`),
    };
  }
  config.output.ce_connect_peers = { value: peerOutputs };
  config.output.ce_transport_attachment = { value: ref2('aws_ec2_transit_gateway_vpc_attachment.transport.id') };
  return JSON.stringify(config);
}

// plugins/aws/src/ce/terraform-static.ts
var ref3 = (value) => `\${${value}}`;
function renderAwsTerraformStatic(plan, bootstrapByNode = {}) {
  const config = JSON.parse(renderAwsTerraformFoundation(plan, bootstrapByNode));
  const intent = plan.intent;
  const routes = staticAzRoutes(intent);
  if (
    intent.routing.profile !== 'tgw-static' ||
    !routes.length ||
    !intent.routing.transitGatewayId ||
    intent.routing.transportAttachmentId ||
    intent.routes.length ||
    intent.routing.associations.length > 1
  )
    throw new Error(
      'Terraform static TGW requires dedicated per-AZ route tables and one owned attachment; brownfield route replacement is unavailable',
    );
  const resource = config.resource;
  const add = (type, name, value) => {
    resource[type] ??= {};
    resource[type][name] = value;
  };
  const tags = resource.aws_vpc.ce.tags;
  add('aws_ec2_transit_gateway_vpc_attachment', 'transport', {
    vpc_id: ref3('aws_vpc.ce.id'),
    transit_gateway_id: intent.routing.transitGatewayId,
    subnet_ids: routes.map((route) => ref3(`aws_subnet.node_${route.node}_nic_1.id`)),
    appliance_mode_support: 'enable',
    transit_gateway_default_route_table_association: false,
    transit_gateway_default_route_table_propagation: false,
    tags,
  });
  for (const [index, table] of intent.routing.associations.entries())
    add('aws_ec2_transit_gateway_route_table_association', `static_${index}`, {
      transit_gateway_attachment_id: ref3('aws_ec2_transit_gateway_vpc_attachment.transport.id'),
      transit_gateway_route_table_id: table,
    });
  for (const [index, table] of intent.routing.propagations.entries())
    add('aws_ec2_transit_gateway_route_table_propagation', `static_${index}`, {
      transit_gateway_attachment_id: ref3('aws_ec2_transit_gateway_vpc_attachment.transport.id'),
      transit_gateway_route_table_id: table,
    });
  if (!intent.routing.transitGatewayRouteTableId || !intent.routing.destinationCidrs.length)
    throw new Error('Terraform static TGW requires an exact service route table and destinations');
  for (const [index, prefix] of intent.routing.destinationCidrs.entries())
    add('aws_ec2_transit_gateway_route', `static_${index}`, {
      destination_cidr_block: prefix,
      transit_gateway_attachment_id: ref3('aws_ec2_transit_gateway_vpc_attachment.transport.id'),
      transit_gateway_route_table_id: intent.routing.transitGatewayRouteTableId,
    });
  for (const route of routes) {
    for (const [index, prefix] of route.forwardCidrs.entries())
      add('aws_route', `static_forward_${route.node}_${index}`, {
        route_table_id: ref3(`aws_route_table.static_${route.node}.id`),
        destination_cidr_block: prefix,
        network_interface_id: ref3(`aws_network_interface.node_${route.node}_nic_1.id`),
        depends_on: ['aws_ec2_transit_gateway_vpc_attachment.transport'],
      });
    for (const [index, prefix] of route.returnCidrs.entries())
      add('aws_route', `static_return_${route.node}_${index}`, {
        route_table_id: ref3(`aws_route_table.static_${route.node}.id`),
        destination_cidr_block: prefix,
        transit_gateway_id: intent.routing.transitGatewayId,
        depends_on: ['aws_ec2_transit_gateway_vpc_attachment.transport'],
      });
  }
  config.output.ce_transport_attachment = { value: ref3('aws_ec2_transit_gateway_vpc_attachment.transport.id') };
  config.output.ce_static_route_tables = {
    value: Object.fromEntries(
      routes.map((route) => [String(route.node), ref3(`aws_route_table.static_${route.node}.id`)]),
    ),
  };
  return JSON.stringify(config);
}
function bindTerraformStaticRouting(plan, outputs) {
  const tables = outputs.ce_static_route_tables;
  if (
    !tables ||
    typeof tables !== 'object' ||
    Array.isArray(tables) ||
    !/^tgw-attach-[0-9a-f]{8,21}$/.test(String(outputs.ce_transport_attachment)) ||
    Object.keys(tables).length !== plan.topology.nodeCount ||
    !/^vpc-[0-9a-f]{8,21}$/.test(String(outputs.ce_vpc_id))
  )
    throw new Error('Terraform static routing output is incomplete');
  const values = {
    __TGW_TRANSPORT_ATTACHMENT__: String(outputs.ce_transport_attachment),
    __VPC_ID__: String(outputs.ce_vpc_id),
  };
  for (const route of staticAzRoutes(plan.intent)) {
    const table = tables[String(route.node)];
    if (typeof table !== 'string' || !/^rtb-[0-9a-f]{8,21}$/.test(table) || Object.values(values).includes(table))
      throw new Error('Terraform static routing table identity is missing or duplicated');
    values[`__STATIC_ROUTE_TABLE_${route.node}__`] = table;
  }
  return values;
}

// plugins/aws/src/ce/terraform-routing-renderer.ts
function renderAwsTerraformRouting(plan, observation, bootstrap) {
  return plan.intent.routing.profile === 'tgw-static'
    ? renderAwsTerraformStatic(plan, bootstrap)
    : renderAwsTerraformConnect(plan, observation, bootstrap);
}

// plugins/aws/src/ce/terraform-connect-stage.ts
var hash = (value) => createHash2('sha256').update(value).digest('hex');
async function applyAwsTerraformConnectStage(plan, observation, session, storage, revalidate, env, signal) {
  await storage.verify();
  const admission = await storage.read('terraform-admission.json');
  if (
    admission.schemaVersion !== 1 ||
    admission.planSha256 !== plan.planSha256 ||
    !/^[0-9a-f]{64}$/.test(admission.configurationSha256) ||
    JSON.stringify(admission.admittedSites) !== JSON.stringify(siteBindings(plan).map(({ site }) => site.name))
  )
    throw new Error('Terraform Connect requires complete owned site admission');
  const configuration = renderAwsTerraformRouting(plan, observation, admission.bootstrapByNode);
  const desired = hash(configuration);
  const addresses = (value) =>
    new Map(
      Object.entries(JSON.parse(value).resource).flatMap(([type, resources]) =>
        Object.keys(resources).map((name) => [`${type}.${name}`, type]),
      ),
    );
  const foundation = addresses(renderAwsTerraformFoundation(plan, admission.bootstrapByNode));
  const expected = addresses(configuration);
  const isDesiredSubset = (current) => {
    const source = JSON.parse(current).resource;
    const target = JSON.parse(configuration).resource;
    return Object.entries(source).every(([type, resources]) =>
      Object.entries(resources).every(
        ([name, value]) =>
          target[type]?.[name] !== undefined && JSON.stringify(target[type][name]) === JSON.stringify(value),
      ),
    );
  };
  let previousPending;
  try {
    previousPending = await storage.read('terraform-connect-stage.json');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const pendingConfigurationSha256 =
    previousPending?.stage === 'pending' &&
    previousPending.planSha256 === plan.planSha256 &&
    typeof previousPending.configurationSha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(previousPending.configurationSha256)
      ? previousPending.configurationSha256
      : undefined;
  const apply = async (receipt) => {
    if (
      receipt.configurationSha256 !== desired ||
      receipt.changes.some(
        (change) =>
          expected.get(change.address) !== change.type ||
          change.actions.length !== 1 ||
          !['create', 'read', 'no-op'].includes(change.actions[0]) ||
          (change.actions[0] === 'create' && foundation.has(change.address)),
      )
    )
      throw new Error(
        'Terraform Connect would change, recreate an existing resource, or create an unexpected resource',
      );
    await storage.write('terraform-connect-plan.json', receipt);
    await storage.verify();
    await revalidate();
    await session.apply(receipt, env, signal);
  };
  let reconciled = false;
  try {
    const revisions = [admission.configurationSha256, desired, pendingConfigurationSha256].filter(
      (value, index, values) => typeof value === 'string' && values.indexOf(value) === index,
    );
    let revised = false;
    let stale;
    for (const revision of revisions) {
      try {
        await session.reviseConfiguration(revision, configuration);
        revised = true;
        break;
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('revision is stale')) throw error;
        stale = error;
      }
    }
    if (!revised) {
      if (!session.readConfigurationSha256) throw stale;
      const currentSha256 = await session.readConfigurationSha256();
      const current = await session.readConfiguration(currentSha256);
      if (!isDesiredSubset(current))
        throw new Error('Pending Terraform Connect configuration is not owned by this plan');
      await session.reviseConfiguration(currentSha256, configuration);
    }
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('Reconcile interrupted')) throw error;
    await apply(await session.plan(env, signal));
    reconciled = true;
  }
  await storage.write('terraform-connect-stage.json', {
    schemaVersion: 1,
    engine: 'terraform',
    planSha256: plan.planSha256,
    configurationSha256: desired,
    stage: 'pending',
  });
  if (!reconciled) await apply(await session.plan(env, signal));
  await storage.write('terraform-connect-stage.json', {
    schemaVersion: 1,
    engine: 'terraform',
    planSha256: plan.planSha256,
    configurationSha256: desired,
    stage: 'applied',
    observedAt: new Date().toISOString(),
  });
  return { configurationSha256: desired };
}

// plugins/aws/src/ce/terraform-direct-activation.ts
// plugins/aws/src/ce/terraform-direct-import.ts
import { createHash as createHash3, createHash as createHash5 } from 'node:crypto';

function renderAwsTerraformDirectImport(plan, ownership, currentConfiguration) {
  verifyAwsCePlan(plan);
  const { snapshotSha256, ...snapshot } = ownership;
  if (
    canonicalSha256(snapshot) !== snapshotSha256 ||
    snapshot.schemaVersion !== 1 ||
    snapshot.kind !== 'aws-ce-terraform-original-direct-routes' ||
    snapshot.sourcePlanSha256 !== plan.planSha256 ||
    snapshot.accountId !== plan.accountId ||
    snapshot.region !== plan.region ||
    plan.engine !== 'terraform' ||
    plan.routing.profile !== 'direct-eni' ||
    plan.topology.nodeCount !== 1 ||
    snapshot.routes.length !== plan.intent.routes.length ||
    !snapshot.routes.length
  )
    throw Error('Direct import requires exact immutable original route ownership');
  const config = JSON.parse(currentConfiguration);
  if (
    !config ||
    typeof config !== 'object' ||
    Array.isArray(config) ||
    !config.resource ||
    typeof config.resource !== 'object' ||
    Array.isArray(config.resource) ||
    Object.hasOwn(config, 'import') ||
    config.output?.ce_vpc_id?.value !== snapshot.vpcId
  )
    throw Error('Direct import requires an exact existing VPC configuration without imports');
  const routes = config.resource.aws_route ?? {};
  if (!routes || typeof routes !== 'object' || Array.isArray(routes))
    throw Error('Direct import route configuration is malformed');
  const intents = [];
  const imports = [];
  const names = new Set();
  const ordered = [...plan.intent.routes].sort(
    (a, b) => a.routeTableId.localeCompare(b.routeTableId) || a.destinationCidr.localeCompare(b.destinationCidr),
  );
  for (const [index, selected] of ordered.entries()) {
    const address = `aws_route.direct_${index}`;
    const matches = snapshot.routes.filter((route) => route.address === address);
    if (matches.length !== 1) throw Error('Direct import route address is ambiguous');
    const route = matches[0];
    const name = `direct_${index}`;
    const patterns = {
      gateway_id: /^igw-[a-f0-9]{8,17}$/,
      nat_gateway_id: /^nat-[a-f0-9]{8,17}$/,
      network_interface_id: /^eni-[a-f0-9]{8,17}$/,
      transit_gateway_id: /^tgw-[a-f0-9]{8,17}$/,
      vpc_peering_connection_id: /^pcx-[a-f0-9]{8,17}$/,
    };
    if (
      selected.node !== 1 ||
      route.routeTableId !== selected.routeTableId ||
      route.destinationCidr !== selected.destinationCidr ||
      !/^rtb-[a-f0-9]{8,17}$/.test(route.routeTableId) ||
      !patterns[route.originalTarget.field]?.test(route.originalTarget.id) ||
      snapshot.interfaces.some((item) => item.id === route.originalTarget.id) ||
      Object.hasOwn(routes, name) ||
      names.has(name)
    )
      throw Error('Direct import route identity or original target differs');
    names.add(name);
    routes[name] = {
      route_table_id: route.routeTableId,
      destination_cidr_block: route.destinationCidr,
      [route.originalTarget.field]: route.originalTarget.id,
    };
    const id = `${route.routeTableId}_${route.destinationCidr}`;
    imports.push({ to: address, id });
    intents.push({
      address,
      type: 'aws_route',
      providerName: 'registry.terraform.io/hashicorp/aws',
      idSha256: createHash3('sha256').update(id).digest('hex'),
    });
  }
  config.resource.aws_route = routes;
  config.import = imports;
  return { configuration: JSON.stringify(config), intents };
}

// plugins/aws/src/ce/terraform-direct-transition.ts
import { createHash as createHash4 } from 'node:crypto';

var object9 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Malformed direct transition evidence');
  return value;
};
var rows2 = (value) => {
  if (!Array.isArray(value)) throw Error('Incomplete direct transition evidence');
  return value.map(object9);
};
function validate(plan, ownership) {
  const imported = renderAwsTerraformDirectImport(
    plan,
    ownership,
    JSON.stringify({ resource: {}, output: { ce_vpc_id: { value: ownership.vpcId } } }),
  );
  if (
    plan.interfaces.length !== 2 ||
    plan.interfaces[0].index !== 0 ||
    plan.interfaces[1].index !== 1 ||
    plan.interfaces[0].role !== 'slo' ||
    plan.interfaces[1].role !== 'sli' ||
    ownership.interfaces.length !== 2 ||
    ownership.interfaces.some(
      (i, index) =>
        i.index !== index ||
        !/^eni-[a-f0-9]{8,17}$/.test(i.id) ||
        !/^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(i.mac) ||
        i.vpcId !== ownership.vpcId ||
        i.subnetId !== (index ? ownership.sliSubnetId : ownership.sloSubnetId),
    ) ||
    ownership.interfaces[0].id === ownership.interfaces[1].id ||
    ownership.interfaces[0].mac === ownership.interfaces[1].mac ||
    ownership.sloSubnetId === ownership.sliSubnetId ||
    !/^i-[a-f0-9]{8,17}$/.test(ownership.instanceId) ||
    ownership.routes.some((r) => r.networkInterfaceId !== ownership.interfaces[1].id)
  )
    throw Error('Direct transition interface identity differs or is unresolved');
  const ids = [...new Set(ownership.routes.map((r) => r.routeTableId))].sort();
  if (
    ownership.tables.length !== ids.length ||
    new Set(ownership.tables.map((t) => t.RouteTableId)).size !== ids.length
  )
    throw Error('Direct transition original table inventory incomplete');
  for (const table of ownership.tables) {
    const id = String(table.RouteTableId),
      before = plan.rollback?.resources.filter((r) => r.id === id);
    if (
      !ids.includes(id) ||
      table.OwnerId !== plan.accountId ||
      table.VpcId !== ownership.vpcId ||
      before?.length !== 1 ||
      rows2(before[0].before.RouteTables).length !== 1 ||
      canonicalSha256(
        resourceConfiguration([
          { id, region: plan.region, exists: true, owned: false, tags: {}, state: { RouteTables: [table] } },
        ]),
      ) !==
        canonicalSha256(
          resourceConfiguration([
            { id, region: plan.region, exists: true, owned: false, tags: {}, state: before[0].before },
          ]),
        )
    )
      throw Error('Direct transition original table is not bound to immutable plan');
    const associations = rows2(table.Associations),
      routes = rows2(table.Routes);
    if (
      !associations.length ||
      associations.some(
        (a) =>
          a.Main !== false ||
          [ownership.sloSubnetId, ownership.sliSubnetId].includes(String(a.SubnetId)) ||
          object9(a.AssociationState).State !== 'associated',
      ) ||
      routes.some((r) => r.State !== 'active')
    )
      throw Error('Direct transition original network state unavailable or overlaps CE');
  }
  return imported;
}
function routeConfiguration(route, phase) {
  if (!['ce', 'original'].includes(phase)) throw Error('Direct transition phase unsupported');
  return {
    route_table_id: route.routeTableId,
    destination_cidr_block: route.destinationCidr,
    ...(phase === 'ce'
      ? { network_interface_id: route.networkInterfaceId }
      : { [route.originalTarget.field]: route.originalTarget.id }),
  };
}
function renderAwsTerraformDirectTransition(plan, ownership, currentConfiguration, from, to, stateIds) {
  const imported = validate(plan, ownership);
  if (
    !['original', 'ce'].includes(from) ||
    !['original', 'ce', 'relinquished'].includes(to) ||
    (to === 'relinquished' && from !== 'original')
  )
    throw Error('Direct transition must restore originals before relinquishment');
  const config = object9(JSON.parse(currentConfiguration));
  const resources = object9(config.resource);
  const configured = object9(resources.aws_route);
  const output = object9(config.output);
  if (object9(output.ce_vpc_id).value !== ownership.vpcId || Object.hasOwn(config, 'removed'))
    throw Error('Direct transition configuration ownership differs');
  if (Object.hasOwn(config, 'import')) {
    if (
      from !== 'original' ||
      canonicalSha256(config.import) !== canonicalSha256(JSON.parse(imported.configuration).import)
    )
      throw Error('Direct transition import ownership differs');
    delete config.import;
  }
  for (const route of ownership.routes) {
    const name = route.address.slice('aws_route.'.length);
    if (canonicalSha256(configured[name]) !== canonicalSha256(routeConfiguration(route, from)))
      throw Error('Direct transition source route target or configuration differs');
    if (to === 'relinquished') delete configured[name];
    else configured[name] = routeConfiguration(route, to);
  }
  if (!Object.keys(configured).length) delete resources.aws_route;
  if (!Object.keys(resources).length) delete config.resource;
  if (to === 'relinquished')
    config.removed = ownership.routes.map((r) => ({ from: r.address, lifecycle: { destroy: false } }));
  let intents = [];
  if (to === 'relinquished') {
    if (
      !stateIds ||
      canonicalSha256(Object.keys(stateIds).sort()) !== canonicalSha256(ownership.routes.map((r) => r.address).sort())
    )
      throw Error('Direct relinquishment requires exact state identities');
    intents = imported.intents.map((intent) => {
      const route = ownership.routes.find((r) => r.address === intent.address);
      if (!route) throw Error('Direct relinquishment route missing');
      let crc = 4294967295;
      for (const byte of Buffer.from(route.destinationCidr)) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 3988292384 : 0);
      }
      const expectedId = `r-${route.routeTableId}${(crc ^ 4294967295) >>> 0}`;
      if (stateIds[intent.address] !== expectedId)
        throw Error('Direct relinquishment state ID differs from provider route identity');
      return { ...intent, idSha256: createHash4('sha256').update(expectedId).digest('hex') };
    });
  }
  return { configuration: JSON.stringify(config), intents };
}
async function observeAwsTerraformDirectPhase(plan, ownership, phase, raw, signal) {
  validate(plan, ownership);
  if (!['original', 'ce'].includes(phase)) throw Error('Direct transition phase unsupported');
  const api = scopedAwsApi(raw, plan.intent.awsProfile, signal);
  const read = async (args) => {
    const result = await api.exec('aws', [...args, '--region', plan.region, '--output', 'json']);
    if (result.exitCode) throw Error('Direct transition observation unavailable');
    const data = object9(JSON.parse(result.stdout));
    if (['NextToken', 'nextToken', 'NextMarker', 'Marker'].some((k) => Object.hasOwn(data, k)))
      throw Error('Partial direct transition observation');
    return data;
  };
  if ((await read(['sts', 'get-caller-identity'])).Account !== ownership.accountId)
    throw Error('Direct transition cloud account differs');
  const tableIds = [...new Set(ownership.routes.map((r) => r.routeTableId))].sort();
  const expected = structuredClone(ownership.tables);
  for (const table of expected) {
    for (const route of ownership.routes.filter((r) => r.routeTableId === table.RouteTableId)) {
      const matches = rows2(table.Routes).filter((r) => r.DestinationCidrBlock === route.destinationCidr);
      if (matches.length !== 1) throw Error('Direct transition original table route ambiguous');
      if (phase === 'ce') {
        const target = {
          gateway_id: 'GatewayId',
          nat_gateway_id: 'NatGatewayId',
          network_interface_id: 'NetworkInterfaceId',
          transit_gateway_id: 'TransitGatewayId',
          vpc_peering_connection_id: 'VpcPeeringConnectionId',
        }[route.originalTarget.field];
        if (!target || matches[0][target] !== route.originalTarget.id)
          throw Error('Direct transition original table target differs');
        delete matches[0][target];
        matches[0].NetworkInterfaceId = route.networkInterfaceId;
      }
    }
  }
  const tableDigest = (tables) =>
    canonicalSha256(
      resourceConfiguration(
        tables.map((t) => ({
          id: String(t.RouteTableId),
          region: plan.region,
          exists: true,
          owned: false,
          tags: {},
          state: { RouteTables: [t] },
        })),
      ),
    );
  const observe = async () => {
    const enis = rows2(
      (
        await read([
          'ec2',
          'describe-network-interfaces',
          '--network-interface-ids',
          ...ownership.interfaces.map((i) => i.id),
        ])
      ).NetworkInterfaces,
    );
    if (enis.length !== 2 || new Set(enis.map((e) => e.NetworkInterfaceId)).size !== 2)
      throw Error('Direct transition interface inventory incomplete');
    for (const i of ownership.interfaces) {
      const e = enis.find((e) => e.NetworkInterfaceId === i.id);
      if (!e) throw Error('Direct transition interface missing');
      const attachment = object9(e.Attachment),
        tags = rows2(e.TagSet);
      const expectedTags = {
        'xcsh-managed-by': 'aws-ce',
        'xcsh-execution-engine': 'terraform',
        'xcsh-deployment-id': plan.deploymentName,
        'xcsh-plan-sha256': plan.planSha256,
        'xcsh-node-index': '1',
        'xcsh-interface-index': String(i.index),
      };
      if (
        e.OwnerId !== ownership.accountId ||
        e.Status !== 'in-use' ||
        e.SourceDestCheck !== false ||
        e.VpcId !== i.vpcId ||
        e.SubnetId !== i.subnetId ||
        e.MacAddress !== i.mac ||
        attachment.InstanceId !== ownership.instanceId ||
        attachment.DeviceIndex !== i.index ||
        Object.entries(expectedTags).some(
          ([key, value]) =>
            tags.filter((t) => t.Key === key).length !== 1 || tags.find((t) => t.Key === key)?.Value !== value,
        )
      )
        throw Error('Direct transition cloud interface ownership differs');
    }
    const tables = rows2((await read(['ec2', 'describe-route-tables', '--route-table-ids', ...tableIds])).RouteTables);
    if (
      tables.some(
        (t) =>
          rows2(t.Routes).some((r) => r.State !== 'active') ||
          rows2(t.Associations).some((a) => object9(a.AssociationState).State !== 'associated'),
      )
    )
      throw Error('Direct transition route or association operational state unavailable');
    if (
      tables.length !== tableIds.length ||
      new Set(tables.map((t) => t.RouteTableId)).size !== tableIds.length ||
      tables.some((t) => !tableIds.includes(String(t.RouteTableId))) ||
      tableDigest(tables) !== tableDigest(expected)
    )
      throw Error('Direct transition full route table evidence differs');
    return {
      enis: enis.sort((a, b) => String(a.NetworkInterfaceId).localeCompare(String(b.NetworkInterfaceId))),
      tables: tables.sort((a, b) => String(a.RouteTableId).localeCompare(String(b.RouteTableId))),
    };
  };
  const first = await observe(),
    second = await observe();
  if (canonicalSha256(first) !== canonicalSha256(second)) throw Error('Direct transition changed during observation');
  return {
    schemaVersion: 1,
    kind: 'aws-ce-terraform-direct-cloud-observation',
    phase,
    sourcePlanSha256: plan.planSha256,
    ownershipSha256: ownership.snapshotSha256,
    evidenceSha256: canonicalSha256(second),
    observedAt: new Date().toISOString(),
  };
}

// plugins/aws/src/ce/terraform-direct-activation.ts
var hash2 = (s) => createHash5('sha256').update(s).digest('hex');
var sourceFile = 'terraform-direct-activation-source.json';
var marker = 'terraform-direct-activation-stage.json';
var optional3 = async (storage, name) => {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
};
var targetFields = [
  'gateway_id',
  'nat_gateway_id',
  'network_interface_id',
  'transit_gateway_id',
  'vpc_peering_connection_id',
];
async function activateAwsTerraformDirectRoutes(
  plan,
  ownership,
  session,
  storage,
  api,
  observeUp,
  revalidate,
  env,
  signal,
) {
  const owner = storage.owner;
  if (
    owner.engine !== 'terraform' ||
    owner.provider !== 'aws' ||
    owner.deploymentId !== plan.deploymentName ||
    owner.account !== plan.accountId ||
    owner.region !== plan.region ||
    !session.readConfigurationSha256 ||
    !session.readResourceIdentities
  )
    throw Error('Direct activation requires exact durable owner and owning runner capabilities');
  const readIdentities = session.readResourceIdentities.bind(session);
  const readConfigurationSha256 = session.readConfigurationSha256.bind(session);
  signal?.throwIfAborted();
  await storage.verify();
  if (canonicalSha256(await storage.read('terraform-direct-ownership.json')) !== canonicalSha256(ownership))
    throw Error('Direct activation durable original ownership differs');
  const imported = await storage.read('terraform-direct-import-source.json');
  const importCheckpoint = await storage.read('terraform-direct-import-stage.json');
  if (
    imported.schemaVersion !== 1 ||
    imported.sourcePlanSha256 !== plan.planSha256 ||
    canonicalSha256(imported.ownership) !== canonicalSha256(ownership) ||
    renderAwsTerraformDirectImport(plan, ownership, imported.initialConfiguration).configuration !==
      imported.importedConfiguration ||
    importCheckpoint.schemaVersion !== 1 ||
    importCheckpoint.engine !== 'terraform' ||
    importCheckpoint.sourceSha256 !== canonicalSha256(imported) ||
    importCheckpoint.phase !== 'imported'
  )
    throw Error('Direct activation requires exact completed original import');
  const translated = renderAwsTerraformDirectTransition(
    plan,
    ownership,
    imported.importedConfiguration,
    'original',
    'ce',
  );
  const expectedSource = {
    schemaVersion: 1,
    sourcePlanSha256: plan.planSha256,
    ownershipSha256: ownership.snapshotSha256,
    initialConfiguration: imported.importedConfiguration,
    activatedConfiguration: translated.configuration,
    importSourceSha256: canonicalSha256(imported),
  };
  const sourceSha256 = canonicalSha256(expectedSource);
  const checkpointFor = (phase) => ({ schemaVersion: 1, engine: 'terraform', sourceSha256, phase });
  let source = await optional3(storage, sourceFile);
  let checkpoint = await optional3(storage, marker);
  let receipt = await optional3(storage, 'terraform-direct-activation-plan.json');
  const names = ownership.routes.map((r) => r.address);
  const fields = Object.fromEntries(
    names.map((name) => [name, ['id', 'route_table_id', 'destination_cidr_block', ...targetFields]]),
  );
  const checkFields = (values, phase) => {
    if (canonicalSha256(Object.keys(values).sort()) !== canonicalSha256([...names].sort()))
      throw Error('Direct activation route field inventory differs');
    for (const route of ownership.routes) {
      const value = values[route.address];
      let crc = 4294967295;
      for (const byte of Buffer.from(route.destinationCidr)) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 3988292384 : 0);
      }
      const target = phase === 'ce' ? 'network_interface_id' : route.originalTarget.field;
      const id = phase === 'ce' ? route.networkInterfaceId : route.originalTarget.id;
      if (
        !value ||
        value.id !== `r-${route.routeTableId}${(crc ^ 4294967295) >>> 0}` ||
        value.route_table_id !== route.routeTableId ||
        value.destination_cidr_block !== route.destinationCidr ||
        targetFields.some(
          (field) =>
            !Object.hasOwn(value, field) ||
            (field === target ? value[field] !== id : ![null, ''].includes(value[field])),
        )
      )
        throw Error('Direct activation route identity or target differs');
    }
  };
  const verifyIds = async () => {
    const rows = (await readIdentities(env, signal)).filter((row) => names.includes(row.address));
    if (
      rows.length !== names.length ||
      new Set(rows.map((r) => r.address)).size !== names.length ||
      rows.some((r) => r.type !== 'aws_route')
    )
      throw Error('Direct activation route state inventory differs');
    const configured = JSON.parse(expectedSource.initialConfiguration).resource.aws_route;
    checkFields(
      Object.fromEntries(
        rows.map((r) => [
          r.address,
          {
            ...Object.fromEntries(targetFields.map((f) => [f, null])),
            ...configured[r.address.slice('aws_route.'.length)],
            id: r.id,
          },
        ]),
      ),
      'original',
    );
  };
  const up = async () => {
    signal?.throwIfAborted();
    const observed = await observeUp();
    if (
      observed.status !== 'observed' ||
      observed.interfaces.length !== 2 ||
      observed.interfaces.some((row) => typeof row.interfaceName !== 'string' || !row.interfaceName.trim()) ||
      new Set(observed.interfaces.map((row) => row.interfaceName)).size !== observed.interfaces.length
    )
      throw Error('Direct activation requires complete verified up CE interface evidence');
    for (const [index, i] of ownership.interfaces.entries()) {
      const matches = observed.interfaces.filter(
        (row) =>
          row.node === `${plan.deploymentName}-1` &&
          row.role === (index ? 'sli' : 'slo') &&
          row.mac === i.mac &&
          row.device === plan.interfaces[index].guestDevice,
      );
      if (matches.length !== 1 || matches[0].linkUp !== true || !matches[0].interfaceName)
        throw Error('Direct activation CE interface identity or link differs');
    }
    await storage.write('terraform-direct-activation-interface-observation.json', observed);
    return observed;
  };
  const checkReceipt = (r, refresh = false) => {
    if (
      r.engine !== 'terraform' ||
      r.deploymentId !== plan.deploymentName ||
      r.configurationSha256 !== hash2(expectedSource.activatedConfiguration) ||
      r.operation ||
      r.imports?.length ||
      r.relinquishments?.length ||
      r.actionInvocations?.length ||
      new Set(r.changes.map((c) => c.address)).size !== r.changes.length ||
      (!refresh &&
        names.some((n) => r.changes.filter((c) => c.address === n && c.type === 'aws_route').length !== 1)) ||
      r.changes.some(
        (c) =>
          c.actions.length !== 1 ||
          (refresh || !names.includes(c.address)
            ? c.actions[0] !== 'no-op'
            : c.type !== 'aws_route' || c.actions[0] !== 'update'),
      ) ||
      (refresh && !r.noChanges)
    )
      throw Error('Direct activation saved plan would change unexpected resources');
  };
  const configuration = async () => {
    const sha = await readConfigurationSha256();
    const current = await session.readConfiguration(sha);
    if (hash2(current) !== sha) throw Error('Direct activation configuration digest differs');
    return current;
  };
  if (!source) {
    if (checkpoint || receipt || (await configuration()) !== expectedSource.initialConfiguration)
      throw Error('Direct activation cannot adopt orphan revised configuration or plan');
    await verifyIds();
    await revalidate();
    await observeAwsTerraformDirectPhase(plan, ownership, 'original', api, signal);
    await up();
    source = expectedSource;
    await storage.write(sourceFile, source);
  }
  if (canonicalSha256(source) !== sourceSha256) throw Error('Direct activation source differs');
  if (!checkpoint) {
    if (receipt || (await configuration()) !== source.initialConfiguration)
      throw Error('Direct activation source cannot adopt orphan plan or revision');
    await verifyIds();
    await observeAwsTerraformDirectPhase(plan, ownership, 'original', api, signal);
    await up();
    checkpoint = checkpointFor('preparing');
    await storage.write(marker, checkpoint);
  }
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.engine !== 'terraform' ||
    checkpoint.sourceSha256 !== sourceSha256 ||
    !['preparing', 'submission-pending', 'refresh-pending', 'activated'].includes(String(checkpoint.phase))
  )
    throw Error('Direct activation checkpoint differs');
  if (checkpoint.phase === 'preparing') {
    if (receipt && (await session.readPlanApplicationState(receipt)) !== 'planned')
      throw Error('Direct activation preparation cannot adopt submitted plan');
    await revalidate();
    await verifyIds();
    await observeAwsTerraformDirectPhase(plan, ownership, 'original', api, signal);
    await up();
    const current = await configuration();
    if (current === source.initialConfiguration) {
      if (receipt) throw Error('Activation plan cannot belong to original configuration');
      await session.reviseConfiguration(hash2(current), source.activatedConfiguration);
    } else if (current !== source.activatedConfiguration)
      throw Error('Direct activation current configuration differs');
    receipt ??= await session.plan(env, signal);
    checkReceipt(receipt);
    checkFields(await session.readPlannedResourceFields(receipt, fields, env, signal), 'original');
    checkFields(await session.readProposedResourceFields(receipt, fields, env, signal), 'ce');
    await storage.write('terraform-direct-activation-plan.json', receipt);
    await storage.verify();
    await storage.write(marker, checkpointFor('submission-pending'));
    checkpoint = checkpointFor('submission-pending');
  }
  if ((await configuration()) !== source.activatedConfiguration)
    throw Error('Direct activation submitted configuration differs');
  if (checkpoint.phase === 'submission-pending') {
    if (!receipt) throw Error('Direct activation submitted receipt missing');
    checkReceipt(receipt);
    let state = await session.readPlanApplicationState(receipt);
    if (state === 'planned') {
      await revalidate();
      await verifyIds();
      await observeAwsTerraformDirectPhase(plan, ownership, 'original', api, signal);
      await up();
      checkFields(await session.readPlannedResourceFields(receipt, fields, env, signal), 'original');
      checkFields(await session.readProposedResourceFields(receipt, fields, env, signal), 'ce');
      await storage.verify();
      if (canonicalSha256(await storage.read('terraform-direct-ownership.json')) !== canonicalSha256(ownership))
        throw Error('Direct activation durable ownership changed before submission');
      signal?.throwIfAborted();
      await session.apply(receipt, env, signal);
      state = await session.readPlanApplicationState(receipt);
    }
    if (!['applying', 'applied'].includes(state)) throw Error('Direct activation requires submitted exact plan');
    const first = await session.readAppliedResourceFields(receipt, fields, env, signal);
    checkFields(first, 'ce');
    const cloud = await observeAwsTerraformDirectPhase(plan, ownership, 'ce', api, signal);
    const second = await session.readAppliedResourceFields(receipt, fields, env, signal);
    checkFields(second, 'ce');
    if (canonicalSha256(first) !== canonicalSha256(second)) throw Error('Direct activation applied evidence changed');
    const evidence = { sourceSha256, receipt, first, cloud, second };
    await storage.verify();
    await storage.write('terraform-direct-activation-reconciliation.json', evidence);
    if (state === 'applying') await session.reconcileApplyFromEvidence(receipt, canonicalSha256(evidence));
    await storage.write(marker, checkpointFor('refresh-pending'));
  }
  await verifyIds();
  await observeAwsTerraformDirectPhase(plan, ownership, 'ce', api, signal);
  await up();
  const refresh = await session.plan(env, signal);
  checkReceipt(refresh, true);
  checkFields(await session.readPlannedResourceFields(refresh, fields, env, signal), 'ce');
  await observeAwsTerraformDirectPhase(plan, ownership, 'ce', api, signal);
  await storage.verify();
  await storage.write('terraform-direct-activation-refresh.json', refresh);
  await storage.write(marker, checkpointFor('activated'));
  return {
    status: 'pending-route-and-traffic-acceptance',
    directRoutesActivated: true,
    terraformNoChanges: true,
    traffic: 'unknown',
  };
}
async function normalizeAwsTerraformDirectPreflight(plan, current, storage, api, signal) {
  const source = await optional3(storage, sourceFile);
  if (!source) return current;
  await storage.verify();
  const owner = storage.owner;
  if (
    owner.engine !== 'terraform' ||
    owner.provider !== 'aws' ||
    owner.deploymentId !== plan.deploymentName ||
    owner.account !== plan.accountId ||
    owner.region !== plan.region
  )
    throw Error('Direct preflight owner differs');
  const ownership = await storage.read('terraform-direct-ownership.json');
  const imported = await storage.read('terraform-direct-import-source.json');
  if (
    imported.schemaVersion !== 1 ||
    imported.sourcePlanSha256 !== plan.planSha256 ||
    canonicalSha256(imported.ownership) !== canonicalSha256(ownership) ||
    renderAwsTerraformDirectImport(plan, ownership, imported.initialConfiguration).configuration !==
      imported.importedConfiguration ||
    canonicalSha256(source) !==
      canonicalSha256({
        schemaVersion: 1,
        sourcePlanSha256: plan.planSha256,
        ownershipSha256: ownership.snapshotSha256,
        initialConfiguration: imported.importedConfiguration,
        activatedConfiguration: renderAwsTerraformDirectTransition(
          plan,
          ownership,
          imported.importedConfiguration,
          'original',
          'ce',
        ).configuration,
        importSourceSha256: canonicalSha256(imported),
      })
  )
    throw Error('Direct preflight source differs');
  const checkpoint = await optional3(storage, marker);
  if (!checkpoint) return current;
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.engine !== 'terraform' ||
    checkpoint.sourceSha256 !== canonicalSha256(source) ||
    !['preparing', 'submission-pending', 'refresh-pending', 'activated'].includes(String(checkpoint.phase))
  )
    throw Error('Direct preflight checkpoint differs');
  if (checkpoint.phase === 'preparing') return current;
  const receipt = await storage.read('terraform-direct-activation-plan.json');
  if (
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== plan.deploymentName ||
    receipt.configurationSha256 !== hash2(source.activatedConfiguration) ||
    receipt.operation ||
    receipt.imports?.length ||
    receipt.relinquishments?.length ||
    receipt.actionInvocations?.length ||
    new Set(receipt.changes.map((c) => c.address)).size !== receipt.changes.length ||
    ownership.routes.some(
      (r) =>
        receipt.changes.filter(
          (c) => c.address === r.address && c.type === 'aws_route' && c.actions.join(',') === 'update',
        ).length !== 1,
    ) ||
    receipt.changes.some(
      (c) => !ownership.routes.some((r) => r.address === c.address) && c.actions.join(',') !== 'no-op',
    )
  )
    throw Error('Direct preflight activation receipt differs');
  const normalized = structuredClone(current);
  let ceTargets = 0;
  for (const route of ownership.routes) {
    const resources = normalized.resources.filter((r) => r.id === route.routeTableId);
    if (resources.length !== 1) throw Error('Direct preflight table inventory differs');
    const tables = resources[0].state.RouteTables;
    if (!Array.isArray(tables) || tables.length !== 1) throw Error('Direct preflight table unavailable');
    const routes = tables[0].Routes;
    if (!Array.isArray(routes)) throw Error('Direct preflight routes unavailable');
    const matches = routes.filter((r) => r.DestinationCidrBlock === route.destinationCidr);
    if (matches.length !== 1) throw Error('Direct preflight selected destination differs');
    const row = matches[0];
    const target = {
      gateway_id: 'GatewayId',
      nat_gateway_id: 'NatGatewayId',
      network_interface_id: 'NetworkInterfaceId',
      transit_gateway_id: 'TransitGatewayId',
      vpc_peering_connection_id: 'VpcPeeringConnectionId',
    }[route.originalTarget.field];
    if (!target) throw Error('Direct preflight original target unavailable');
    if (row.NetworkInterfaceId === route.networkInterfaceId) {
      if (
        [
          'GatewayId',
          'NatGatewayId',
          'TransitGatewayId',
          'VpcPeeringConnectionId',
          'InstanceId',
          'EgressOnlyInternetGatewayId',
          'CarrierGatewayId',
          'LocalGatewayId',
        ].some((k) => Object.hasOwn(row, k))
      )
        throw Error('Direct preflight selected target ambiguous');
      ceTargets++;
      delete row.NetworkInterfaceId;
      row[target] = route.originalTarget.id;
    }
  }
  if (ceTargets && ceTargets !== ownership.routes.length) throw Error('Direct preflight partial route transition');
  if (ceTargets) await observeAwsTerraformDirectPhase(plan, ownership, 'ce', api, signal);
  else {
    if (checkpoint.phase !== 'submission-pending') throw Error('Direct preflight activated routes reverted');
    await observeAwsTerraformDirectPhase(plan, ownership, 'original', api, signal);
  }
  return normalized;
}

// plugins/aws/src/ce/terraform-direct-stage.ts
import { createHash as createHash6 } from 'node:crypto';

// plugins/aws/src/ce/terraform-direct-ownership.ts
import { isIP as isIP5 } from 'node:net';

var object10 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Malformed original direct route evidence');
  return value;
};
var rows3 = (value) => {
  if (!Array.isArray(value)) throw Error('Incomplete original direct route evidence');
  return value.map(object10);
};
var targets = {
  GatewayId: ['gateway_id', /^igw-[a-f0-9]{8,17}$/],
  NatGatewayId: ['nat_gateway_id', /^nat-[a-f0-9]{8,17}$/],
  NetworkInterfaceId: ['network_interface_id', /^eni-[a-f0-9]{8,17}$/],
  TransitGatewayId: ['transit_gateway_id', /^tgw-[a-f0-9]{8,17}$/],
  VpcPeeringConnectionId: ['vpc_peering_connection_id', /^pcx-[a-f0-9]{8,17}$/],
};
function destination(cidr) {
  const [ip, bits, ...extra] = cidr.split('/');
  const prefix = Number(bits);
  if (extra.length || isIP5(ip) !== 4 || !/^\d{1,2}$/.test(bits) || prefix < 1 || prefix > 32)
    throw Error('Original direct route destination unresolved');
  const address = ip.split('.').reduce((value, octet) => value * 256 + Number(octet), 0);
  if (address % 2 ** (32 - prefix)) throw Error('Original direct route destination unaligned');
}
async function collectAwsTerraformDirectRouteOwnership(base, values, raw, signal) {
  verifyAwsCePlan(base);
  if (
    base.engine !== 'terraform' ||
    base.intent.routing.profile !== 'direct-eni' ||
    base.topology.nodeCount !== 1 ||
    base.interfaces.length !== 2 ||
    base.interfaces[0].role !== 'slo' ||
    base.interfaces[1].role !== 'sli' ||
    !base.intent.routes.length
  )
    throw Error('Original direct route requires exact Terraform single-node dual-interface plan');
  const { __INSTANCE_1__: instance, __ENI_1_0__: slo, __ENI_1_1__: sli } = values;
  if (
    !/^i-[a-f0-9]{8,17}$/.test(instance ?? '') ||
    ![slo, sli].every((id) => /^eni-[a-f0-9]{8,17}$/.test(id ?? '')) ||
    slo === sli
  )
    throw Error('Original direct route execution identifiers unresolved');
  const requested = [...base.intent.routes].sort(
    (a, b) => a.routeTableId.localeCompare(b.routeTableId) || a.destinationCidr.localeCompare(b.destinationCidr),
  );
  const ids = [...new Set(requested.map((r) => r.routeTableId))].sort();
  if (
    requested.some(
      (r) =>
        r.node !== 1 ||
        !/^rtb-[a-f0-9]{8,17}$/.test(r.routeTableId) ||
        !base.intent.brownfield.routeTableIds.includes(r.routeTableId),
    ) ||
    new Set(requested.map((r) => `${r.routeTableId}/${r.destinationCidr}`)).size !== requested.length
  )
    throw Error('Original direct route selected identity differs');
  for (const route of requested) destination(route.destinationCidr);
  const api = scopedAwsApi(raw, base.intent.awsProfile ?? 'default', signal);
  const read = async (args) => {
    const result = await api.exec('aws', [...args, '--region', base.region, '--output', 'json']);
    if (result.exitCode) throw Error('Original direct route observation unavailable');
    const data = object10(JSON.parse(result.stdout));
    if (['NextToken', 'nextToken', 'NextMarker', 'Marker'].some((k) => Object.hasOwn(data, k)))
      throw Error('Partial original direct route evidence');
    return data;
  };
  if ((await read(['sts', 'get-caller-identity'])).Account !== base.accountId)
    throw Error('Original direct route account differs');
  const readEnis = async () =>
    rows3((await read(['ec2', 'describe-network-interfaces', '--network-interface-ids', slo, sli])).NetworkInterfaces);
  const readTables = async () =>
    rows3((await read(['ec2', 'describe-route-tables', '--route-table-ids', ...ids])).RouteTables);
  const enis = await readEnis();
  if (enis.length !== 2 || new Set(enis.map((e) => e.NetworkInterfaceId)).size !== 2)
    throw Error('Original direct route ENI inventory incomplete');
  const interfaces = [slo, sli].map((id, index) => {
    const matches = enis.filter((e) => e.NetworkInterfaceId === id);
    if (matches.length !== 1) throw Error('Original direct route ENI ambiguous');
    const e = matches[0],
      attachment = object10(e.Attachment),
      tags = rows3(e.TagSet);
    const expected = {
      'xcsh-managed-by': 'aws-ce',
      'xcsh-execution-engine': 'terraform',
      'xcsh-deployment-id': base.deploymentName,
      'xcsh-plan-sha256': base.planSha256,
      'xcsh-node-index': '1',
      'xcsh-interface-index': String(index),
    };
    if (
      e.OwnerId !== base.accountId ||
      e.Status !== 'in-use' ||
      e.SourceDestCheck !== false ||
      attachment.InstanceId !== instance ||
      attachment.DeviceIndex !== index ||
      !/^vpc-[a-f0-9]{8,17}$/.test(String(e.VpcId)) ||
      !/^subnet-[a-f0-9]{8,17}$/.test(String(e.SubnetId)) ||
      typeof e.MacAddress !== 'string' ||
      e.MacAddress.toLowerCase() !== values[`__ENI_1_${index}_MAC__`]?.toLowerCase() ||
      Object.entries(expected).some(
        ([k, v]) => tags.filter((t) => t.Key === k).length !== 1 || tags.find((t) => t.Key === k)?.Value !== v,
      )
    )
      throw Error('Original direct route ENI ownership differs');
    return { id, mac: e.MacAddress.toLowerCase(), vpcId: String(e.VpcId), subnetId: String(e.SubnetId), index };
  });
  if (interfaces[0].vpcId !== interfaces[1].vpcId || interfaces[0].subnetId === interfaces[1].subnetId)
    throw Error('Original direct route physical VPC or subnet differs');
  const tables = await readTables();
  if (
    tables.length !== ids.length ||
    new Set(tables.map((t) => t.RouteTableId)).size !== ids.length ||
    tables.some((t) => !ids.includes(String(t.RouteTableId)))
  )
    throw Error('Original direct route table inventory incomplete');
  const routes = [];
  for (const table of tables) {
    const id = String(table.RouteTableId),
      associations = rows3(table.Associations),
      all = rows3(table.Routes);
    if (
      table.OwnerId !== base.accountId ||
      table.VpcId !== interfaces[0].vpcId ||
      !associations.length ||
      associations.some(
        (a) =>
          a.Main === true ||
          interfaces.some((i) => i.subnetId === a.SubnetId) ||
          !/^subnet-[a-f0-9]{8,17}$/.test(String(a.SubnetId)) ||
          object10(a.AssociationState).State !== 'associated',
      ) ||
      new Set(associations.map((a) => a.SubnetId)).size !== associations.length
    )
      throw Error('Original direct route table overlaps CE management or differs in ownership');
    const before = base.rollback?.resources.filter((r) => r.id === id);
    if (
      before?.length !== 1 ||
      rows3(before[0].before.RouteTables).length !== 1 ||
      canonicalSha256(
        resourceConfiguration([
          { id, region: base.region, exists: true, owned: false, tags: {}, state: { RouteTables: [table] } },
        ]),
      ) !==
        canonicalSha256(
          resourceConfiguration([
            { id, region: base.region, exists: true, owned: false, tags: {}, state: before[0].before },
          ]),
        )
    )
      throw Error('Original direct route immutable snapshot drift');
    const destinations = all.map(
      (r) => r.DestinationCidrBlock ?? r.DestinationIpv6CidrBlock ?? r.DestinationPrefixListId,
    );
    if (destinations.some((d) => typeof d !== 'string') || new Set(destinations).size !== all.length)
      throw Error('Original direct route duplicate destination');
    for (const route of requested.filter((r) => r.routeTableId === id)) {
      const matches = all.filter((r) => r.DestinationCidrBlock === route.destinationCidr);
      if (matches.length !== 1) throw Error('Original direct route import requires existing route');
      const actual = matches[0],
        keys = Object.keys(targets).filter((k) => Object.hasOwn(actual, k));
      if (
        keys.length !== 1 ||
        actual.State !== 'active' ||
        actual.Origin !== 'CreateRoute' ||
        [
          'EgressOnlyInternetGatewayId',
          'CarrierGatewayId',
          'LocalGatewayId',
          'CoreNetworkArn',
          'VpcEndpointId',
          'OdbNetworkArn',
        ].some((k) => Object.hasOwn(actual, k))
      )
        throw Error('Original direct route target unsupported or unavailable');
      const [field, pattern] = targets[keys[0]];
      const target = actual[keys[0]];
      if (typeof target !== 'string' || !pattern.test(target) || [slo, sli].includes(target))
        throw Error('Original direct route target unresolved');
      routes.push({
        address: `aws_route.direct_${requested.indexOf(route)}`,
        routeTableId: id,
        destinationCidr: route.destinationCidr,
        networkInterfaceId: sli,
        originalTarget: { field, id: target },
      });
    }
  }
  const finalEnis = await readEnis(),
    finalTables = await readTables();
  const normalize = (entries, key) => [...entries].sort((a, b) => String(a[key]).localeCompare(String(b[key])));
  if (
    canonicalSha256(normalize(enis, 'NetworkInterfaceId')) !==
      canonicalSha256(normalize(finalEnis, 'NetworkInterfaceId')) ||
    canonicalSha256(normalize(tables, 'RouteTableId')) !== canonicalSha256(normalize(finalTables, 'RouteTableId'))
  )
    throw Error('Original direct route identity changed during discovery');
  const snapshot = {
    schemaVersion: 1,
    kind: 'aws-ce-terraform-original-direct-routes',
    sourcePlanSha256: base.planSha256,
    accountId: base.accountId,
    region: base.region,
    instanceId: instance,
    vpcId: interfaces[0].vpcId,
    sloSubnetId: interfaces[0].subnetId,
    sliSubnetId: interfaces[1].subnetId,
    interfaces,
    routes: routes.sort((a, b) => a.address.localeCompare(b.address)),
    tables: normalize(tables, 'RouteTableId'),
  };
  return { ...snapshot, snapshotSha256: canonicalSha256(snapshot) };
}

// plugins/aws/src/ce/terraform-direct-stage.ts
var hash3 = (s) => createHash6('sha256').update(s).digest('hex');
var marker2 = 'terraform-direct-import-stage.json';
var sourceFile2 = 'terraform-direct-import-source.json';
var optional4 = async (storage, name) => {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
};
async function importAwsTerraformDirectRoutes(plan, values, session, storage, api, revalidate, env, signal) {
  const owner = storage.owner;
  if (
    owner.engine !== 'terraform' ||
    owner.provider !== 'aws' ||
    owner.deploymentId !== plan.deploymentName ||
    owner.account !== plan.accountId ||
    owner.region !== plan.region ||
    !session.readConfigurationSha256 ||
    !session.readResourceIdentities ||
    !session.planImports
  )
    throw Error('Direct import requires exact durable owner and owning runner capabilities');
  signal?.throwIfAborted();
  await storage.verify();
  let source = await optional4(storage, sourceFile2);
  let checkpoint = await optional4(storage, marker2);
  if (!source) {
    if (checkpoint) throw Error('Direct import source missing');
    const ownership = await collectAwsTerraformDirectRouteOwnership(plan, values, api, signal);
    const initialConfiguration = await session.readConfiguration(await session.readConfigurationSha256());
    const translated = renderAwsTerraformDirectImport(plan, ownership, initialConfiguration);
    const identities = await session.readResourceIdentities(env, signal);
    if (identities.some((r) => ownership.routes.some((route) => route.address === r.address)))
      throw Error('Direct import route already exists in state without a bound source');
    source = {
      schemaVersion: 1,
      sourcePlanSha256: plan.planSha256,
      ownership,
      initialConfiguration,
      importedConfiguration: translated.configuration,
    };
    await storage.write(sourceFile2, source);
  }
  const translated = renderAwsTerraformDirectImport(plan, source.ownership, source.initialConfiguration);
  if (
    source.schemaVersion !== 1 ||
    source.sourcePlanSha256 !== plan.planSha256 ||
    translated.configuration !== source.importedConfiguration ||
    canonicalSha256(source.ownership.interfaces.map((i) => i.id)) !==
      canonicalSha256([values.__ENI_1_0__, values.__ENI_1_1__]) ||
    source.ownership.instanceId !== values.__INSTANCE_1__
  )
    throw Error('Direct import source differs from owning plan or interface bindings');
  const sourceSha256 = canonicalSha256(source);
  const checkpointFor = (phase) => ({ schemaVersion: 1, engine: 'terraform', sourceSha256, phase });
  const saved = await optional4(storage, 'terraform-direct-import-plan.json');
  if (!checkpoint) {
    if (saved || (await session.readConfigurationSha256()) !== hash3(source.initialConfiguration))
      throw Error('Orphan direct import source cannot adopt revised configuration or a plan');
    if (
      (await session.readResourceIdentities(env, signal)).some((r) =>
        source.ownership.routes.some((route) => route.address === r.address),
      )
    )
      throw Error('Orphan direct import source cannot adopt existing route state');
    await observeAwsTerraformDirectPhase(plan, source.ownership, 'original', api, signal);
    checkpoint = checkpointFor('preparing');
    await storage.write(marker2, checkpoint);
  }
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.engine !== 'terraform' ||
    checkpoint.sourceSha256 !== sourceSha256 ||
    !['preparing', 'submission-pending', 'imported'].includes(String(checkpoint.phase))
  )
    throw Error('Direct import checkpoint differs');
  const names = source.ownership.routes.map((r) => r.address);
  const fields = Object.fromEntries(
    source.ownership.routes.map((r) => [
      r.address,
      [
        'id',
        'route_table_id',
        'destination_cidr_block',
        'gateway_id',
        'nat_gateway_id',
        'network_interface_id',
        'transit_gateway_id',
        'vpc_peering_connection_id',
      ],
    ]),
  );
  const checkFields = (projected) => {
    if (canonicalSha256(Object.keys(projected).sort()) !== canonicalSha256([...names].sort()))
      throw Error('Direct import applied state inventory differs');
    for (const route of source.ownership.routes) {
      const row = projected[route.address];
      let crc = 4294967295;
      for (const byte of Buffer.from(route.destinationCidr)) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 3988292384 : 0);
      }
      const id = `r-${route.routeTableId}${(crc ^ 4294967295) >>> 0}`;
      if (
        !row ||
        row.id !== id ||
        row.route_table_id !== route.routeTableId ||
        row.destination_cidr_block !== route.destinationCidr ||
        fields[route.address]
          .slice(3)
          .some(
            (field) =>
              !Object.hasOwn(row, field) ||
              (field === route.originalTarget.field
                ? row[field] !== route.originalTarget.id
                : ![null, ''].includes(row[field])),
          )
      )
        throw Error('Direct import applied route identity or target differs');
    }
  };
  const validateReceipt = (receipt) => {
    if (
      receipt.engine !== 'terraform' ||
      receipt.deploymentId !== plan.deploymentName ||
      receipt.configurationSha256 !== hash3(source.importedConfiguration) ||
      receipt.operation ||
      receipt.actionInvocations?.length ||
      receipt.relinquishments?.length ||
      canonicalSha256(receipt.imports) !== canonicalSha256(translated.intents) ||
      new Set(receipt.changes.map((c) => c.address)).size !== receipt.changes.length ||
      names.some((name) => receipt.changes.filter((c) => c.address === name && c.type === 'aws_route').length !== 1) ||
      receipt.changes.some((c) => c.actions.length !== 1 || c.actions[0] !== 'no-op')
    )
      throw Error('Direct import saved plan would mutate resources or import foreign identities');
  };
  let receipt = saved;
  if (checkpoint.phase === 'preparing') {
    if (receipt && (await session.readPlanApplicationState(receipt)) !== 'planned')
      throw Error('Direct import preparation cannot adopt a submitted plan');
    await revalidate();
    await observeAwsTerraformDirectPhase(plan, source.ownership, 'original', api, signal);
    const currentSha = await session.readConfigurationSha256();
    const current = await session.readConfiguration(currentSha);
    if (current === source.initialConfiguration && currentSha === hash3(current)) {
      if (receipt) throw Error('Direct import saved plan cannot belong to initial configuration');
      await session.reviseConfiguration(currentSha, source.importedConfiguration);
    } else if (current !== source.importedConfiguration || currentSha !== hash3(current))
      throw Error('Direct import current configuration differs');
    receipt ??= await session.planImports(translated.intents, env, signal);
    validateReceipt(receipt);
    await storage.write('terraform-direct-import-plan.json', receipt);
    await storage.write('terraform-direct-ownership.json', source.ownership);
    await storage.verify();
    await revalidate();
    await observeAwsTerraformDirectPhase(plan, source.ownership, 'original', api, signal);
    await storage.write(marker2, checkpointFor('submission-pending'));
    await session.apply(receipt, env, signal);
  }
  if (!receipt) throw Error('Direct import submitted plan receipt missing');
  validateReceipt(receipt);
  if ((await session.readConfigurationSha256()) !== hash3(source.importedConfiguration))
    throw Error('Direct import submitted configuration differs');
  if (canonicalSha256(await storage.read('terraform-direct-ownership.json')) !== canonicalSha256(source.ownership))
    throw Error('Direct import durable original ownership differs');
  let state = await session.readPlanApplicationState(receipt);
  if (state === 'planned' && checkpoint.phase === 'submission-pending') {
    await revalidate();
    await observeAwsTerraformDirectPhase(plan, source.ownership, 'original', api, signal);
    await session.apply(receipt, env, signal);
    state = await session.readPlanApplicationState(receipt);
  }
  if (!['applying', 'applied'].includes(state)) throw Error('Direct import requires submitted exact plan');
  const first = await session.readAppliedResourceFields(receipt, fields, env, signal);
  checkFields(first);
  const cloud = await observeAwsTerraformDirectPhase(plan, source.ownership, 'original', api, signal);
  const second = await session.readAppliedResourceFields(receipt, fields, env, signal);
  checkFields(second);
  if (canonicalSha256(first) !== canonicalSha256(second)) throw Error('Direct import applied evidence changed');
  const evidence = { sourceSha256, receipt, first, cloud, second };
  await storage.verify();
  await storage.write('terraform-direct-import-reconciliation.json', evidence);
  if (state === 'applying') await session.reconcileApplyFromEvidence(receipt, canonicalSha256(evidence));
  await storage.write(marker2, checkpointFor('imported'));
  return {
    status: 'pending-direct-route-transition',
    originalRoutesImported: true,
    routing: 'unknown',
    traffic: 'unknown',
  };
}

// plugins/aws/src/ce/terraform-identities.ts
import { isIP as isIP6 } from 'node:net';

var object11 = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
async function discoverAwsTerraformInterfaces(plan, outputs, rawApi, signal) {
  if (plan.engine !== 'terraform') throw new Error('Terraform interface discovery requires Terraform ownership');
  const api = scopedAwsApi(rawApi, plan.intent.awsProfile, signal);
  const run = async (args) => {
    const result = await api.exec('aws', [...args, '--region', plan.region, '--output', 'json']);
    if (result.exitCode !== 0) throw new Error('Terraform interface discovery is unavailable');
    return object11(JSON.parse(result.stdout));
  };
  if ((await run(['sts', 'get-caller-identity'])).Account !== plan.accountId)
    throw new Error('Terraform interface discovery account differs');
  const candidates = object11(outputs.ce_interfaces);
  const expected = Array.from({ length: plan.intent.topology.nodeCount }, (_, index) => index + 1).flatMap((node) =>
    plan.intent.interfaces.map((item) => ({ node, item, key: `${node}:${item.index}` })),
  );
  if (Object.keys(candidates).length !== expected.length || !/^vpc-[0-9a-f]{8,17}$/.test(String(outputs.ce_vpc_id)))
    throw new Error('Terraform network output is incomplete');
  const ids = [];
  for (const { node, item, key } of expected) {
    const value = object11(candidates[key]);
    if (
      value.node !== node ||
      value.index !== item.index ||
      value.role !== item.role ||
      value.site_name !== siteForNode(plan.intent, node).name ||
      typeof value.subnet_id !== 'string' ||
      !/^subnet-[0-9a-f]{8,17}$/.test(value.subnet_id) ||
      typeof value.id !== 'string' ||
      !/^eni-[0-9a-f]{8,17}$/.test(value.id) ||
      ids.includes(value.id)
    )
      throw new Error('Terraform interface output identity is malformed');
    ids.push(value.id);
  }
  const observed = await run(['ec2', 'describe-network-interfaces', '--network-interface-ids', ...ids]);
  if (
    observed.NextToken ||
    !Array.isArray(observed.NetworkInterfaces) ||
    observed.NetworkInterfaces.length !== expected.length
  )
    throw new Error('AWS interface discovery response is incomplete');
  const bindings = {};
  const macs = new Set();
  for (const { node, item, key } of expected) {
    const candidate = object11(candidates[key]);
    const matches = observed.NetworkInterfaces.map(object11).filter((eni) => eni.NetworkInterfaceId === candidate.id);
    if (matches.length !== 1) throw new Error('AWS interface identity is ambiguous');
    const eni = matches[0];
    const instance = object11(object11(outputs.ce_instances)[String(node)]);
    if (eni.Status === 'in-use') {
      if (
        typeof instance.id !== 'string' ||
        !/^i-[0-9a-f]{8,17}$/.test(instance.id) ||
        instance.site_name !== siteForNode(plan.intent, node).name ||
        instance.hostname !== `${plan.deploymentName}-${node}` ||
        object11(eni.Attachment).InstanceId !== instance.id ||
        object11(eni.Attachment).DeviceIndex !== item.index
      )
        throw new Error('Terraform interface attachment identity differs');
    } else if (eni.Attachment || Object.keys(instance).length)
      throw new Error('Terraform interface attachment is incomplete');
    const tags = Array.isArray(eni.TagSet) ? eni.TagSet.map(object11) : [];
    const expectedTags = {
      'xcsh-managed-by': 'aws-ce',
      'xcsh-execution-engine': 'terraform',
      'xcsh-deployment-id': plan.deploymentName,
      'xcsh-plan-sha256': plan.planSha256,
      'ves-io-site-name': siteForNode(plan.intent, node).name,
      'xcsh-node-index': String(node),
      'xcsh-interface-index': String(item.index),
    };
    const mac = typeof eni.MacAddress === 'string' ? eni.MacAddress.toLowerCase() : '';
    const staticIp = awsCeStaticIp(plan.intent, node, item.index)?.ip_address.split('/')[0];
    if (
      eni.OwnerId !== plan.accountId ||
      eni.VpcId !== outputs.ce_vpc_id ||
      eni.SubnetId !== candidate.subnet_id ||
      eni.AvailabilityZone !== item.subnets[node - 1].availabilityZone ||
      eni.SourceDestCheck !== false ||
      !['available', 'in-use'].includes(String(eni.Status)) ||
      !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(mac) ||
      macs.has(mac) ||
      typeof candidate.mac !== 'string' ||
      mac !== candidate.mac.toLowerCase() ||
      typeof eni.PrivateIpAddress !== 'string' ||
      isIP6(eni.PrivateIpAddress) !== 4 ||
      eni.PrivateIpAddress !== candidate.private_ip ||
      (staticIp !== undefined && eni.PrivateIpAddress !== staticIp) ||
      Object.entries(expectedTags).some(
        ([key, value]) =>
          tags.filter((tag) => tag.Key === key && tag.Value === value).length !== 1 ||
          tags.filter((tag) => tag.Key === key).length !== 1,
      )
    )
      throw new Error('AWS interface resource binding differs from Terraform deployment');
    macs.add(mac);
    bindings[`__ENI_${node}_${item.index}__`] = String(eni.NetworkInterfaceId);
    bindings[`__ENI_${node}_${item.index}_MAC__`] = mac;
    bindings[`__NODE_${node}_${item.role.toUpperCase()}_IP__`] = eni.PrivateIpAddress;
  }
  return {
    source: 'aws:ec2:describe-network-interfaces',
    observedAt: new Date().toISOString(),
    accountId: plan.accountId,
    region: plan.region,
    bindings,
  };
}

// plugins/aws/src/ce/terraform-site-replacement.ts
// plugins/aws/src/ce/terraform-replacement-stages.ts
import { createHash as createHash7, createHash as createHash8 } from 'node:crypto';

var object12 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Malformed replacement configuration');
  return value;
};
var digest = (value) => createHash7('sha256').update(value).digest('hex');
function awsTerraformReplacementStages(base, replacement, configuration, expectedConfigurationSha256) {
  verifyAwsCePlan(base);
  const { planId, planSha256, ...draft } = replacement;
  const selected = siteBindings(base).find(({ binding }) => binding.siteName === replacement.binding.siteName);
  if (
    base.engine !== 'terraform' ||
    replacement.engine !== 'terraform' ||
    replacement.kind !== 'aws-ce-site-replacement' ||
    replacement.schemaVersion !== 2 ||
    replacement.sourcePlanSha256 !== base.planSha256 ||
    canonicalSha256(draft) !== planSha256 ||
    planId !== `aws-ce-replace-${planSha256.slice(0, 24)}` ||
    !selected ||
    canonicalSha256(selected.binding) !== canonicalSha256(replacement.binding)
  )
    throw new Error('Terraform replacement engine, identity or plan integrity differs');
  if (digest(configuration) !== expectedConfigurationSha256)
    throw new Error('Current Terraform configuration hash differs');
  const original = object12(JSON.parse(configuration));
  const resources = object12(original.resource);
  const instances = object12(resources.aws_instance);
  const associations = object12(resources.aws_eip_association);
  const outputs = object12(object12(object12(original.output).ce_instances).value);
  const addresses = [];
  for (const node of selected.site.nodeIndexes) {
    const name = `node_${node}`;
    const instance = object12(instances[name]);
    const association = object12(associations[name]);
    const tags = object12(instance.tags);
    if (
      tags['xcsh-execution-engine'] !== 'terraform' ||
      tags['xcsh-managed-by'] !== 'aws-ce' ||
      tags['xcsh-deployment-id'] !== base.deploymentName ||
      tags['xcsh-plan-sha256'] !== base.planSha256 ||
      tags['xcsh-node-index'] !== String(node) ||
      tags['ves-io-site-name'] !== selected.site.name ||
      instance.count !== undefined ||
      instance.for_each !== undefined ||
      instance.ami !== base.intent.image.amiId ||
      instance.instance_type !== base.intent.instance.type ||
      instance.user_data_replace_on_change !== true ||
      typeof instance.user_data_base64 !== 'string'
    )
      throw new Error('Terraform replacement instance configuration differs');
    const expected = base.intent.interfaces.map((iface) => ({
      device_index: iface.index,
      network_interface_id: `\${aws_network_interface.node_${node}_nic_${iface.index}.id}`,
      delete_on_termination: false,
    }));
    if (
      canonicalSha256(instance.network_interface) !== canonicalSha256(expected) ||
      association.allocation_id !== `\${aws_eip.node_${node}.id}` ||
      association.network_interface_id !== `\${aws_network_interface.node_${node}_nic_0.id}` ||
      association.count !== undefined ||
      association.for_each !== undefined ||
      object12(outputs[String(node)]).id !== `\${aws_instance.node_${node}.id}`
    )
      throw new Error('Terraform replacement retained network or output binding differs');
    addresses.push(`aws_instance.${name}`, `aws_eip_association.${name}`);
  }
  const quiesced = structuredClone(original);
  const quiescedResources = object12(quiesced.resource);
  for (const node of selected.site.nodeIndexes) {
    delete object12(quiescedResources.aws_instance)[`node_${node}`];
    delete object12(quiescedResources.aws_eip_association)[`node_${node}`];
    delete object12(object12(object12(quiesced.output).ce_instances).value)[String(node)];
  }
  for (const type of ['aws_instance', 'aws_eip_association'])
    if (!Object.keys(object12(quiescedResources[type])).length) delete quiescedResources[type];
  const quiesceConfiguration = JSON.stringify(quiesced);
  const make = (phase, text, previous) => ({
    phase,
    replacementPlanSha256: planSha256,
    deploymentId: base.deploymentName,
    previousConfigurationSha256: previous,
    configurationSha256: digest(text),
    configuration: text,
    addresses: [...addresses],
  });
  return {
    quiesce: make('quiesce', quiesceConfiguration, expectedConfigurationSha256),
    launch(bootstrapByHostname) {
      if (Object.keys(bootstrapByHostname).length !== selected.binding.nodes.length)
        throw new Error('Complete replacement bootstrap inventory is required');
      const resumed = structuredClone(original);
      for (const node of selected.site.nodeIndexes) {
        const material = bootstrapByHostname[`${base.deploymentName}-${node}`];
        if (
          typeof material !== 'string' ||
          !material.startsWith(`#cloud-config
`) ||
          !material.includes('/etc/vpm/user_data') ||
          /__\w+__/.test(material)
        )
          throw new Error('Resolved replacement cloud-init is required');
        object12(object12(object12(resumed.resource).aws_instance)[`node_${node}`]).user_data_base64 =
          Buffer.from(material).toString('base64');
      }
      return make('launch', JSON.stringify(resumed), digest(quiesceConfiguration));
    },
  };
}
function inspectAwsTerraformReplacementStage(stage, receipt) {
  if (
    receipt.schemaVersion !== 1 ||
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== stage.deploymentId ||
    receipt.configurationSha256 !== stage.configurationSha256 ||
    digest(stage.configuration) !== stage.configurationSha256 ||
    !['quiesce', 'launch'].includes(stage.phase) ||
    !Array.isArray(receipt.changes)
  )
    throw new Error('Terraform replacement saved plan binding differs');
  const seen = new Set();
  for (const change of receipt.changes) {
    if (seen.has(change.address) || !Array.isArray(change.actions) || change.actions.length !== 1)
      throw new Error('Ambiguous or combined Terraform replacement actions');
    seen.add(change.address);
    const action = change.actions[0];
    if (action === 'no-op') continue;
    if (
      !stage.addresses.includes(change.address) ||
      change.type !== change.address.split('.')[0] ||
      action !== (stage.phase === 'quiesce' ? 'delete' : 'create') ||
      receipt.noChanges
    )
      throw new Error('Terraform replacement would mutate outside the selected stage');
  }
}
async function applyAwsTerraformReplacementStage(session, stage, persist, env, signal) {
  signal?.throwIfAborted();
  if (digest(stage.configuration) !== stage.configurationSha256)
    throw new Error('Replacement configuration integrity differs');
  try {
    await session.reviseConfiguration(stage.previousConfigurationSha256, stage.configuration);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('revision is stale')) throw error;
    await session.reviseConfiguration(stage.configurationSha256, stage.configuration);
  }
  const receipt = await session.plan(env, signal);
  inspectAwsTerraformReplacementStage(stage, receipt);
  await persist(receipt);
  await session.apply(receipt, env, signal);
  return receipt;
}

// plugins/aws/src/ce/terraform-routing.ts
var object13 = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
function bindTerraformConnectPeers(plan, outputs, interfaceBindings) {
  verifyAwsCePlan(plan);
  if (plan.engine !== 'terraform' || plan.routing.profile !== 'tgw-connect')
    throw new Error('Terraform Connect ownership and profile are required');
  const peers = object13(outputs.ce_connect_peers);
  const actions = plan.actions.filter((action) => action.kind === 'tgw-connect-peer-create');
  if (!actions.length || Object.keys(peers).length !== actions.length)
    throw new Error('Terraform Connect peer output is incomplete');
  if (
    typeof outputs.ce_vpc_id !== 'string' ||
    !/^vpc-[0-9a-f]{8,17}$/.test(outputs.ce_vpc_id) ||
    typeof outputs.ce_transport_attachment !== 'string' ||
    !/^tgw-attach-[0-9a-f]{8,17}$/.test(outputs.ce_transport_attachment)
  )
    throw new Error('Terraform transport output is incomplete');
  const values = {
    ...interfaceBindings,
    __VPC_ID__: outputs.ce_vpc_id,
    __TGW_TRANSPORT_ATTACHMENT__: outputs.ce_transport_attachment,
  };
  const ids = new Set();
  for (const [index, action] of actions.entries()) {
    const peer = object13(peers[String(index + 1)]);
    const attachmentIndex = action.args?.indexOf('--transit-gateway-attachment-id') ?? -1;
    const attachment = attachmentIndex >= 0 ? action.args?.[attachmentIndex + 1] : undefined;
    const addressIndex = action.args?.indexOf('--peer-address') ?? -1;
    const address = addressIndex >= 0 ? action.args?.[addressIndex + 1] : undefined;
    const role =
      address === `__NODE_${action.node}_SLO_IP__` ? 0 : address === `__NODE_${action.node}_SLI_IP__` ? 1 : undefined;
    if (
      !action.capture?.placeholder ||
      !attachment ||
      !/^__TGW_CONNECT_ATTACHMENT_[01]_\d+__$/.test(attachment) ||
      role === undefined ||
      peer.node !== action.node ||
      peer.transport_interface_index !== role ||
      typeof peer.id !== 'string' ||
      !/^tgw-connect-peer-[0-9a-f]{8,21}$/.test(peer.id) ||
      ids.has(peer.id) ||
      typeof peer.attachment_id !== 'string' ||
      !/^tgw-attach-[0-9a-f]{8,17}$/.test(peer.attachment_id) ||
      (values[attachment] !== undefined && values[attachment] !== peer.attachment_id)
    )
      throw new Error('Terraform Connect output differs from the planned peer topology');
    if (
      Object.entries(values).some(
        ([key, value]) =>
          key.startsWith('__TGW_CONNECT_ATTACHMENT_') && key !== attachment && value === peer.attachment_id,
      )
    )
      throw new Error('Terraform Connect attachment roles are ambiguous');
    ids.add(peer.id);
    values[action.capture.placeholder] = peer.id;
    values[attachment] = peer.attachment_id;
  }
  return values;
}
function bindTerraformIngress(plan, outputs) {
  if (plan.intent.ingress?.mode !== 'nlb') return {};
  const ingress = object13(outputs.ce_ingress);
  const prefix = `arn:${plan.intent.partition}:elasticloadbalancing:${plan.region}:${plan.accountId}`;
  if (
    typeof ingress.load_balancer_arn !== 'string' ||
    !ingress.load_balancer_arn.startsWith(`${prefix}:loadbalancer/net/`) ||
    typeof ingress.target_group_arn !== 'string' ||
    !ingress.target_group_arn.startsWith(`${prefix}:targetgroup/`) ||
    typeof ingress.listener_arn !== 'string' ||
    !ingress.listener_arn.startsWith(`${prefix}:listener/net/`) ||
    ingress.port !== plan.intent.ingress.port ||
    ingress.scheme !== plan.intent.ingress.scheme
  )
    throw new Error('Terraform NLB output differs from the ingress intent');
  return {
    __NLB_ARN__: ingress.load_balancer_arn,
    __NLB_TARGET_GROUP_ARN__: ingress.target_group_arn,
    __NLB_LISTENER_ARN__: ingress.listener_arn,
  };
}
async function configureAwsTerraformRouting(plan, session, runtime, storage, api, env, signal, rebind) {
  await storage.verify();
  if (rebind) validateAwsRoutingRebind(plan, rebind);
  const outputs = await session.readOutputs(
    [
      'ce_vpc_id',
      'ce_interfaces',
      'ce_instances',
      'ce_connect_peers',
      'ce_transport_attachment',
      ...(plan.intent.ingress?.mode === 'nlb' ? ['ce_ingress'] : []),
    ],
    env,
    signal,
  );
  const discovered = await discoverAwsTerraformInterfaces(plan, outputs, api, signal);
  const checkpoint = {
    schemaVersion: 2,
    engine: 'terraform',
    planId: plan.planId,
    planSha256: plan.planSha256,
    completedActionIds: [],
    state: 'running',
    resolvedValues: {
      ...Object.fromEntries(
        Object.entries(rebind?.checkpoint.resolvedValues ?? {}).filter(([key]) => key.startsWith('__XC_ROUTING_')),
      ),
      ...bindTerraformConnectPeers(plan, outputs, discovered.bindings),
      ...bindTerraformIngress(plan, outputs),
    },
  };
  const persist = () => storage.write('terraform-routing-checkpoint.json', checkpoint);
  await persist();
  const scoped = scopedAwsApi(api, plan.intent.awsProfile, signal);
  for (const action of plan.actions.filter((action) => action.kind === 'tgw-attachment-gate'))
    await assertAttachmentAvailable(action, plan, checkpoint, scoped);
  await configureAwsRouting(runtime, plan, checkpoint, scoped, persist, signal, rebind);
  return collectAwsNetworkHealth('bgp', plan, checkpoint, scoped, signal);
}

// plugins/aws/src/ce/terraform-site-replacement.ts
var object14 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Malformed Terraform replacement evidence');
  return value;
};
var list2 = (value) => {
  if (!Array.isArray(value)) throw new Error('Incomplete Terraform replacement observation');
  return value.map(object14);
};
var hash4 = (value) => createHash8('sha256').update(value).digest('hex');
async function createTerraformAwsSiteReplacementDriver(
  source,
  replacement,
  expectedConfigurationSha256,
  session,
  storage,
  raw,
  env,
  routing,
) {
  const base = structuredClone(source);
  const plan = structuredClone(replacement);
  const validate = async (candidate) => {
    if (
      base.engine !== 'terraform' ||
      plan.engine !== 'terraform' ||
      canonicalSha256(candidate) !== canonicalSha256(plan) ||
      canonicalSha256(storage.owner) !== canonicalSha256(plan.binding.owner)
    )
      throw new Error('Terraform replacement ownership differs');
    await storage.verify();
  };
  await validate(plan);
  let routingCheckpoint;
  if (base.routing?.profile === 'tgw-connect') {
    let currentRouting;
    try {
      currentRouting = await storage.read('terraform-routing-checkpoint.json');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (currentRouting === undefined) {
      routingCheckpoint = undefined;
    } else {
      if (!routing || routing.runtime.engine !== base.engine)
        throw new Error('Connect replacement requires automatic routing recovery');
      const name = `${plan.planId}-routing-source.json`;
      let saved;
      try {
        saved = object14(await storage.read(name));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        saved = {
          replacementPlanSha256: plan.planSha256,
          checkpoint: currentRouting,
        };
        const cp = object14(saved.checkpoint);
        if (
          cp.schemaVersion !== 2 ||
          cp.engine !== base.engine ||
          cp.planId !== base.planId ||
          cp.planSha256 !== base.planSha256
        )
          throw new Error('Replacement routing source differs from deployment');
        validateAwsRoutingRebind(base, {
          siteName: plan.binding.siteName,
          siteUid: String(plan.preparation.uid),
          contract: routing.contract,
          checkpoint: cp,
        });
        await storage.write(name, saved);
      }
      const cp = object14(saved.checkpoint);
      if (
        saved.replacementPlanSha256 !== plan.planSha256 ||
        cp.schemaVersion !== 2 ||
        cp.engine !== base.engine ||
        cp.planId !== base.planId ||
        cp.planSha256 !== base.planSha256
      )
        throw new Error('Replacement routing source differs from deployment');
      routingCheckpoint = structuredClone(cp);
      validateAwsRoutingRebind(base, {
        siteName: plan.binding.siteName,
        siteUid: String(plan.preparation.uid),
        contract: routing.contract,
        checkpoint: routingCheckpoint,
      });
    }
  }
  const snapshotName = `${plan.planId}-terraform-source.json`;
  let snapshot;
  try {
    snapshot = object14(await storage.read(snapshotName));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const configuration = await session.readConfiguration(expectedConfigurationSha256);
    awsTerraformReplacementStages(base, plan, configuration, expectedConfigurationSha256);
    let admissionSha256 = null;
    try {
      const admission = object14(await storage.read('terraform-admission.json'));
      const configured = object14(object14(object14(JSON.parse(configuration)).resource).aws_instance);
      const bootstrapByNode = Object.fromEntries(
        Object.entries(configured).map(([name, value]) => {
          const encoded = object14(value).user_data_base64;
          if (!/^node_[1-3]$/.test(name) || typeof encoded !== 'string')
            throw new Error('Terraform source bootstrap admission is incomplete');
          return [name.slice(5), Buffer.from(encoded, 'base64').toString('utf8')];
        }),
      );
      if (
        admission.schemaVersion !== 1 ||
        admission.planSha256 !== base.planSha256 ||
        typeof admission.configurationSha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(admission.configurationSha256) ||
        !Array.isArray(admission.admittedSites) ||
        !admission.admittedSites.includes(plan.binding.siteName) ||
        canonicalSha256(admission.admittedSites) !==
          canonicalSha256(
            siteBindings(base)
              .map(({ site }) => site.name)
              .slice(0, admission.admittedSites.length),
          ) ||
        canonicalSha256(admission.bootstrapByNode) !== canonicalSha256(bootstrapByNode)
      )
        throw new Error('Terraform source admission differs from deployment and bootstrap');
      admissionSha256 = canonicalSha256(admission);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    snapshot = {
      schemaVersion: 1,
      admissionSha256,
      routingSourceSha256: routingCheckpoint ? canonicalSha256(routingCheckpoint) : null,
      replacementPlanSha256: plan.planSha256,
      configurationSha256: expectedConfigurationSha256,
      configuration,
    };
    await storage.write(snapshotName, snapshot);
  }
  if (
    snapshot.schemaVersion !== 1 ||
    (routingCheckpoint && snapshot.routingSourceSha256 !== canonicalSha256(routingCheckpoint)) ||
    !Object.hasOwn(snapshot, 'admissionSha256') ||
    (snapshot.admissionSha256 !== null &&
      (typeof snapshot.admissionSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(snapshot.admissionSha256))) ||
    snapshot.replacementPlanSha256 !== plan.planSha256 ||
    snapshot.configurationSha256 !== expectedConfigurationSha256 ||
    typeof snapshot.configuration !== 'string' ||
    hash4(snapshot.configuration) !== expectedConfigurationSha256
  )
    throw new Error('Terraform replacement source snapshot differs');
  const stages = awsTerraformReplacementStages(base, plan, snapshot.configuration, expectedConfigurationSha256);
  const nodeIndex = (node) => Number(node.slice(base.deploymentName.length + 1));
  const launchMarkerName = `${plan.planId}-terraform-launch.json`;
  const readLaunch = async () => {
    try {
      const marker = object14(await storage.read(launchMarkerName));
      if (
        marker.schemaVersion !== 1 ||
        marker.replacementPlanSha256 !== plan.planSha256 ||
        typeof marker.configurationSha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(marker.configurationSha256)
      )
        throw new Error('Terraform replacement launch marker differs');
      return marker;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return;
    }
  };
  const observe = async (candidate, allowNew, signal) => {
    await validate(candidate);
    const api = scopedAwsApi(raw, base.intent.awsProfile, signal);
    const identity = await api.exec('aws', ['sts', 'get-caller-identity', '--region', base.region, '--output', 'json']);
    if (identity.exitCode) throw new Error('Terraform replacement AWS identity unavailable');
    const caller = object14(JSON.parse(identity.stdout));
    if (caller.Account !== base.accountId || !String(caller.Arn).startsWith(`arn:${base.partition}:`))
      throw new Error('Terraform replacement AWS account or partition differs');
    const old = object14(plan.preparation.instances);
    const ids = [
      ...Object.values(old).map(String),
      ...Object.values(plan.interfaceIds),
      ...Object.values(plan.elasticIpAllocationIds),
    ];
    const observed = await observeAwsResources(api, ids, base.region, {
      deploymentName: base.deploymentName,
      planSha256s: [base.planSha256],
    });
    const checked = (id) => {
      const found = observed.find((row) => row.id === id);
      if (
        !found?.exists ||
        !found.owned ||
        found.tags['xcsh-execution-engine'] !== 'terraform' ||
        found.state.NextToken
      )
        throw new Error('Terraform replacement cloud resource ownership is unavailable or differs');
      return found;
    };
    const current = {};
    const associations = {};
    let terminated = true;
    let quiescenceStarted = false;
    let detached = true;
    for (const node of plan.binding.nodes) {
      const index = nodeIndex(node);
      const original = checked(String(old[node]));
      const oldRows = list2(original.state.Reservations).flatMap((row) => list2(row.Instances));
      if (
        oldRows.length !== 1 ||
        oldRows[0].InstanceId !== old[node] ||
        original.tags['xcsh-node-index'] !== String(index) ||
        original.tags['ves-io-site-name'] !== plan.binding.siteName ||
        oldRows[0].ImageId !== base.intent.image.amiId
      )
        throw new Error('Original Terraform instance identity differs');
      const state = object14(oldRows[0].State).Name;
      if (!['pending', 'running', 'stopping', 'stopped', 'shutting-down', 'terminated'].includes(String(state)))
        throw new Error('Original Terraform instance state is unknown');
      terminated &&= state === 'terminated';
      quiescenceStarted ||= state === 'terminated' || state === 'shutting-down';
      const vpcs = new Set();
      for (const iface of base.intent.interfaces) {
        const key = `${node}/${iface.role}`;
        const found = checked(plan.interfaceIds[key]);
        const rows = list2(found.state.NetworkInterfaces);
        const expected = list2(plan.preparation.interfaces).find((row) => row.node === node && row.role === iface.role);
        if (rows.length !== 1 || rows[0].NetworkInterfaceId !== plan.interfaceIds[key])
          throw new Error('Ambiguous retained Terraform ENI');
        const eni = rows[0];
        vpcs.add(String(eni.VpcId));
        if (
          eni.OwnerId !== base.accountId ||
          eni.MacAddress !== expected?.mac ||
          eni.AvailabilityZone !== iface.subnets[index - 1].availabilityZone ||
          found.tags['xcsh-node-index'] !== String(index) ||
          found.tags['xcsh-interface-index'] !== String(iface.index) ||
          found.tags['ves-io-site-name'] !== plan.binding.siteName
        )
          throw new Error('Retained Terraform ENI identity differs');
        if (eni.Attachment) {
          detached = false;
          const attachment = object14(eni.Attachment);
          const id = String(attachment.InstanceId);
          if (
            attachment.DeviceIndex !== iface.index ||
            attachment.DeleteOnTermination !== false ||
            !/^i-[a-f0-9]{8,17}$/.test(id)
          )
            throw new Error('Retained Terraform ENI attachment differs');
          if (id !== old[node]) {
            if (!allowNew || state !== 'terminated' || (current[node] && current[node] !== id))
              throw new Error('Unexpected replacement Terraform instance attachment');
            current[node] = id;
          }
        } else if (eni.Status !== 'available') throw new Error('Retained Terraform ENI state is unavailable');
      }
      if (vpcs.size !== 1) throw new Error('Retained Terraform ENI VPC differs');
      const eip = checked(plan.elasticIpAllocationIds[node]);
      const addresses = list2(eip.state.Addresses);
      if (
        addresses.length !== 1 ||
        addresses[0].AllocationId !== plan.elasticIpAllocationIds[node] ||
        eip.tags['xcsh-node-index'] !== String(index) ||
        (addresses[0].AssociationId && addresses[0].NetworkInterfaceId !== plan.interfaceIds[`${node}/slo`])
      )
        throw new Error('Retained Terraform EIP association differs');
      if (addresses[0].AssociationId) {
        if (!/^eipassoc-[a-f0-9]{8,17}$/.test(String(addresses[0].AssociationId)))
          throw new Error('Malformed retained EIP association');
        associations[node] = String(addresses[0].AssociationId);
      }
    }
    for (const [node, id] of Object.entries(current)) {
      const [found] = await observeAwsResources(api, [id], base.region, {
        deploymentName: base.deploymentName,
        planSha256s: [base.planSha256],
      });
      const rows = list2(found.state.Reservations).flatMap((row) => list2(row.Instances));
      if (
        !found.exists ||
        !found.owned ||
        found.tags['xcsh-execution-engine'] !== 'terraform' ||
        found.state.NextToken ||
        found.tags['xcsh-node-index'] !== String(nodeIndex(node)) ||
        found.tags['ves-io-site-name'] !== plan.binding.siteName ||
        rows.length !== 1 ||
        rows[0].InstanceId !== id ||
        rows[0].ImageId !== base.intent.image.amiId ||
        rows[0].InstanceType !== base.intent.instance.type ||
        !['pending', 'running', 'stopping', 'stopped'].includes(String(object14(rows[0].State).Name))
      )
        throw new Error('New Terraform instance ownership differs');
    }
    const missingAssociations = Object.keys(associations).length < Object.keys(plan.elasticIpAllocationIds).length;
    const quiescence =
      terminated && detached && !Object.keys(associations).length
        ? 'complete'
        : quiescenceStarted || missingAssociations
          ? 'partial'
          : 'intact';
    return { current, associations, terminated, detached, quiescence };
  };
  const outputs = async (signal) => {
    const values = await session.readOutputs(['ce_vpc_id', 'ce_interfaces', 'ce_instances'], env, signal);
    const evidence = await discoverAwsTerraformInterfaces(base, values, raw, signal);
    for (const node of plan.binding.nodes)
      for (const iface of base.intent.interfaces) {
        if (
          evidence.bindings[`__ENI_${nodeIndex(node)}_${iface.index}__`] !== plan.interfaceIds[`${node}/${iface.role}`]
        )
          throw new Error('Terraform state changed a retained ENI identity');
      }
    return object14(values.ce_instances);
  };
  const authorizeReceipt = async (receipt, phase, signal, admission) => {
    const identities = await session.readPlannedResourceIds(receipt, stages.quiesce.addresses, env, signal);
    const live = await observe(plan, phase === 'launch', signal);
    for (const change of receipt.changes.filter((change) => stages.quiesce.addresses.includes(change.address))) {
      const node = `${base.deploymentName}-${Number(change.address.split('node_')[1])}`;
      const expected =
        change.type === 'aws_instance'
          ? phase === 'quiesce'
            ? object14(plan.preparation.instances)[node]
            : live.current[node]
          : live.associations[node];
      if (change.actions[0] === 'create') {
        if (identities[change.address] !== null || expected)
          throw new Error(
            'Terraform replacement creation has an existing resource identity; reconcile state before retrying',
          );
      } else if (!expected || identities[change.address] !== expected) {
        throw new Error('Terraform saved plan targets a different cloud resource');
      }
    }
    await storage.write(`${plan.planId}-terraform-${phase}-plan.json`, { receipt, identities });
    if (phase === 'quiesce') await admission?.(live.quiescence);
    if (
      phase === 'launch' &&
      receipt.changes.some((change) => change.type === 'aws_instance' && change.actions.includes('create'))
    )
      await revalidateAwsBootstrapKeyPair(base, scopedAwsApi(raw, base.intent.awsProfile, signal));
  };
  return {
    quiescenceAdmissionVersion: 1,
    engine: 'terraform',
    async restoreRouting(candidate, siteUid, signal) {
      await validate(candidate);
      if (!routingCheckpoint) return;
      if (!routing) throw new Error('Replacement routing runtime is unavailable');
      const observed = await configureAwsTerraformRouting(base, session, routing.runtime, storage, raw, env, signal, {
        siteName: plan.binding.siteName,
        siteUid,
        contract: routing.contract,
        checkpoint: routingCheckpoint,
      });
      return observed.status === 'healthy';
    },
    async finalize(candidate, expected, signal) {
      await validate(candidate);
      const live = await observe(candidate, true, signal);
      if (plan.binding.nodes.some((node) => !expected[node] || live.current[node] !== expected[node]))
        throw new Error('Terraform replacement completion identity differs');
      const marker = await readLaunch();
      if (!marker) throw new Error('Terraform replacement launch marker is unavailable');
      const configuration = await session.readConfiguration(String(marker.configurationSha256));
      const bootstraps = (configuration) => {
        const instances = object14(object14(object14(JSON.parse(configuration)).resource).aws_instance);
        return Object.fromEntries(
          Object.entries(instances)
            .filter(([name]) => /^node_[1-3]$/.test(name))
            .map(([name, value]) => {
              const encoded = object14(value).user_data_base64;
              if (typeof encoded !== 'string') throw new Error('Terraform admission bootstrap snapshot is incomplete');
              return [name.slice(5), Buffer.from(encoded, 'base64').toString('utf8')];
            }),
        );
      };
      const oldBootstrap = bootstraps(String(snapshot.configuration));
      const nextBootstrap = bootstraps(configuration);
      const material = Object.fromEntries(
        plan.binding.nodes.map((node) => [node, nextBootstrap[String(nodeIndex(node))]]),
      );
      if (stages.launch(material).configurationSha256 !== marker.configurationSha256)
        throw new Error('Terraform replacement completion configuration differs');
      const refresh = await session.plan(env, signal);
      if (refresh.configurationSha256 !== marker.configurationSha256 || !refresh.noChanges)
        throw new Error('Replacement completion requires a final refresh-enabled no-change plan');
      await storage.write(`${plan.planId}-terraform-final-refresh.json`, refresh);
      let admission;
      try {
        admission = object14(await storage.read('terraform-admission.json'));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        if (snapshot.admissionSha256 !== null) throw new Error('Terraform admission disappeared during replacement');
        return;
      }
      if (
        admission.schemaVersion !== 1 ||
        admission.planSha256 !== base.planSha256 ||
        !Array.isArray(admission.admittedSites) ||
        !admission.admittedSites.includes(plan.binding.siteName) ||
        canonicalSha256(admission.admittedSites) !==
          canonicalSha256(
            siteBindings(base)
              .map(({ site }) => site.name)
              .slice(0, admission.admittedSites.length),
          )
      )
        throw new Error('Terraform admission ownership or selected site differs');
      const isOriginal =
        snapshot.admissionSha256 !== null &&
        canonicalSha256(admission) === snapshot.admissionSha256 &&
        canonicalSha256(admission.bootstrapByNode) === canonicalSha256(oldBootstrap);
      const isCompleted =
        admission.configurationSha256 === marker.configurationSha256 &&
        canonicalSha256(admission.bootstrapByNode) === canonicalSha256(nextBootstrap);
      if (!isOriginal && !isCompleted) throw new Error('Terraform admission changed during replacement');
      if (!isCompleted)
        await storage.write('terraform-admission.json', {
          ...admission,
          configurationSha256: marker.configurationSha256,
          bootstrapByNode: nextBootstrap,
        });
    },
    async assertOwnership(candidate, phase, expected = {}, signal) {
      const marker = await readLaunch();
      const live = await observe(candidate, !!marker && ['launch', 'registration', 'complete'].includes(phase), signal);
      if (['registration', 'complete'].includes(phase) || Object.keys(expected).length) {
        const instances = await outputs(signal);
        for (const node of plan.binding.nodes)
          if (
            !expected[node] ||
            live.current[node] !== expected[node] ||
            object14(instances[String(nodeIndex(node))]).id !== expected[node]
          )
            throw new Error('Terraform output and replacement instance checkpoint differ');
      }
    },
    async quiesce(candidate, signal, admission) {
      await observe(candidate, false, signal);
      await applyAwsTerraformReplacementStage(
        session,
        stages.quiesce,
        (receipt) => authorizeReceipt(receipt, 'quiesce', signal, admission),
        env,
        signal,
      );
      const live = await observe(candidate, false, signal);
      if (!live.terminated || !live.detached) throw new Error('Terraform replacement quiescence has not converged');
      const instances = await outputs(signal);
      if (plan.binding.nodes.some((node) => Object.hasOwn(instances, String(nodeIndex(node)))))
        throw new Error('Terraform state still contains a quiesced node');
    },
    async launch(candidate, bootstrap, signal) {
      const stage = stages.launch(bootstrap);
      const previous = await readLaunch();
      if (previous && previous.configurationSha256 !== stage.configurationSha256)
        throw new Error('Terraform replacement bootstrap changed on resume');
      const live = await observe(candidate, !!previous, signal);
      if (!live.terminated) throw new Error('Original VMs must terminate before Terraform replacement launch');
      await storage.write(launchMarkerName, {
        schemaVersion: 1,
        replacementPlanSha256: plan.planSha256,
        configurationSha256: stage.configurationSha256,
      });
      await applyAwsTerraformReplacementStage(
        session,
        stage,
        (receipt) => authorizeReceipt(receipt, 'launch', signal),
        env,
        signal,
      );
      const after = await observe(candidate, true, signal);
      const instances = await outputs(signal);
      const result = {};
      for (const node of plan.binding.nodes) {
        const id = object14(instances[String(nodeIndex(node))]).id;
        if (
          typeof id !== 'string' ||
          !after.current[node] ||
          id !== after.current[node] ||
          id === object14(plan.preparation.instances)[node]
        )
          throw new Error('Terraform replacement instance state has not converged');
        result[node] = id;
      }
      const refresh = await session.plan(env, signal);
      if (refresh.configurationSha256 !== stage.configurationSha256 || !refresh.noChanges)
        throw new Error('Terraform replacement requires a refresh-enabled no-change plan');
      await storage.write(`${plan.planId}-terraform-refresh.json`, refresh);
      return result;
    },
  };
}

// plugins/aws/src/ce/terraform-initial-replacement.ts
var object15 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid initial replacement source');
  return value;
};
async function optional5(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return;
  }
}
async function runAwsTerraformInitialReplacement(
  base,
  terraform,
  runtime,
  storage,
  api,
  fetcher,
  signal,
  loadContract = () => VerifiedUpgradeContract.release(fetcher, signal),
) {
  if (base.engine !== 'terraform') throw new Error('Initial replacement requires Terraform ownership');
  let handled = false;
  for (const { site, binding } of siteBindings(base)) {
    const name = `terraform-initial-replacement-${site.name}.json`;
    let frozen = await optional5(storage, name);
    const preparation = await optional5(storage, `terraform-interface-mtu-${site.name}.json`);
    if (!frozen && (!preparation || object15(preparation).evidenceKind !== 'preboot-interface-configuration-required'))
      continue;
    if (runtime.engine !== 'terraform') throw new Error('Initial replacement runtime ownership differs');
    handled = true;
    const contract = await loadContract();
    const placement =
      base.intent.vpc.mode === 'brownfield'
        ? await loadAwsTerraformBrownfieldBinding(base, storage, api, signal)
        : undefined;
    const session = await terraform.open(
      binding.owner,
      await awsTerraformFoundationDeployment(base, {}, placement),
      'current',
    );
    if (!frozen) {
      let record = object15(preparation);
      if (record.planId !== base.planId || record.planSha256 !== base.planSha256)
        throw new Error('Initial replacement preparation differs from the owning plan');
      let versions;
      try {
        versions = await captureCeReplacementVersions(
          binding,
          String(record.uid),
          String(record.contractFingerprint),
          runtime,
          contract,
          signal,
        );
      } catch (error) {
        if (error instanceof CeReplacementVersionEvidenceError)
          return { handled: true, status: 'pending-replacement-versions', versionEvidence: error.diagnostic };
        throw error;
      }
      if (!session.readResourceIdentities || !session.readConfigurationSha256)
        throw new Error('Terraform replacement identity reader unavailable');
      const identities = await session.readResourceIdentities(process.env, signal);
      const find = (address, type, pattern) => {
        const rows = identities.filter((row) => row.address === address && row.type === type);
        if (rows.length !== 1 || !pattern.test(rows[0].id))
          throw new Error('Initial replacement resource identity differs');
        return rows[0].id;
      };
      const interfaceIds = {};
      const elasticIpAllocationIds = {};
      const bootstrapTokenNames = {};
      for (const node of site.nodeIndexes) {
        const hostname = `${base.deploymentName}-${node}`;
        for (const iface of base.intent.interfaces)
          interfaceIds[`${hostname}/${iface.role}`] = find(
            `aws_network_interface.node_${node}_nic_${iface.index}`,
            'aws_network_interface',
            /^eni-[a-f0-9]{8,17}$/,
          );
        if (base.egress.mode === 'elastic-ip')
          elasticIpAllocationIds[hostname] = find(`aws_eip.node_${node}`, 'aws_eip', /^eipalloc-[a-f0-9]{8,17}$/);
        const token = `${base.deploymentName.slice(0, 40)}-${node}-${base.planSha256.slice(0, 12)}`;
        const saved = object15(await storage.read(`${token}.json`));
        if (saved.tokenName !== token || saved.siteName !== site.name || saved.node !== hostname)
          throw new Error('Initial replacement bootstrap ownership differs');
        bootstrapTokenNames[hostname] = token;
      }
      const refreshed = await runtime.prepareAwsSiteReplacement(binding, record.instances, record.interfaces, signal);
      if (refreshed.uid !== record.uid) throw new Error('Initial replacement site identity changed');
      record = { ...refreshed, planId: base.planId, planSha256: base.planSha256 };
      const plan = compileAwsSiteReplacement(base, site.name, record, {
        versions,
        interfaceIds,
        elasticIpAllocationIds,
        bootstrapTokenNames,
      });
      frozen = {
        sourcePlanSha256: base.planSha256,
        configurationSha256: await session.readConfigurationSha256(),
        plan,
      };
      await storage.write(name, frozen);
    }
    const record = object15(frozen);
    if (
      record.sourcePlanSha256 !== base.planSha256 ||
      typeof record.configurationSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(record.configurationSha256)
    )
      throw new Error('Frozen initial replacement source differs');
    const plan = record.plan;
    if (plan?.sourcePlanSha256 !== base.planSha256 || plan.binding?.siteName !== site.name)
      throw new Error('Frozen initial replacement plan differs');
    const driver = await createTerraformAwsSiteReplacementDriver(
      base,
      plan,
      record.configurationSha256,
      session,
      storage,
      api,
      process.env,
    );
    const result = await runAwsSiteReplacement(plan, plan.planSha256, driver, runtime, storage, contract, signal);
    if (result.status !== 'registered-with-configured-interfaces') return { handled: true, ...result };
  }
  return { handled, status: handled ? 'registered' : 'not-required' };
}

// plugins/aws/src/ce/terraform-lifecycle.ts
import { join as join4 } from 'node:path';

var markerFile = 'aws-terraform-lifecycle-retirement.json';
async function optional6(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function assertAwsTerraformDeploymentActive(storage) {
  await storage.verify();
  for (const name of [
    markerFile,
    'terraform-f5-cancellation-pending.json',
    'aws-terraform-teardown-source.json',
    'terraform-cloud-teardown-source.json',
    'terraform-cloud-teardown.json',
    'aws-terraform-foundation-teardown-receipt.json',
    'aws-terraform-pending-teardown-receipt.json',
    'aws-terraform-teardown-receipt.json',
  ])
    if ((await optional6(storage, name)) !== undefined)
      throw new Error('AWS Terraform retirement or cancellation has started; resume teardown instead of deployment');
}
async function beginAwsTerraformRetirement(base, plan, storage) {
  await storage.verify();
  if (
    base.engine !== 'terraform' ||
    plan.sourcePlanSha256 !== base.planSha256 ||
    !/^[a-f0-9]{64}$/.test(plan.planSha256) ||
    canonicalSha256(storage.owner) !== canonicalSha256(siteBindings(base)[0].binding.owner)
  )
    throw new Error('AWS Terraform retirement owner or source plan differs');
  const marker = {
    schemaVersion: 1,
    engine: 'terraform',
    status: 'retiring',
    owner: storage.owner,
    sourcePlanSha256: base.planSha256,
    teardownPlanSha256: plan.planSha256,
    kind: plan.kind,
  };
  const existing = await optional6(storage, markerFile);
  if (existing !== undefined && canonicalSha256(existing) !== canonicalSha256(marker))
    throw new Error('AWS Terraform retirement belongs to another immutable teardown');
  if (existing === undefined) await storage.write(markerFile, marker);
}
async function withAwsTerraformLifecycle(storage, signal, action) {
  signal?.throwIfAborted();
  await storage.verify();
  const release = await acquireProcessLock(join4(storage.directory, '.aws-terraform-lifecycle-lock'));
  try {
    signal?.throwIfAborted();
    await storage.verify();
    return await action();
  } finally {
    await release();
  }
}

// plugins/aws/src/ce/terraform-routing-references.ts
var object16 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Malformed routing reference evidence');
  return value;
};
var rows4 = (value) => {
  if (!Array.isArray(value)) throw new Error('Incomplete routing reference evidence');
  return value.map(object16);
};
var tables = (plan) => new Set([...plan.intent.routing.associations, ...plan.intent.routing.propagations]);
function routingAttachmentIds(plan, observation) {
  if (plan.intent.routing.profile !== 'tgw-connect') return [];
  const selected = tables(plan);
  const ids = observation.resources
    .filter((resource) => selected.has(resource.id))
    .flatMap((resource) =>
      ['Associations', 'Propagations'].flatMap((key) =>
        rows4(resource.state[key]).map((row) => row.TransitGatewayAttachmentId),
      ),
    );
  if (ids.some((id) => typeof id !== 'string' || !/^tgw-attach-[0-9a-f]{8,17}$/.test(id)))
    throw new Error('Malformed routing attachment identity');
  return [...new Set(ids)];
}
function ownedRoutingAdditions(plan, before, after, evidence) {
  return after.map((resource) => {
    const baseline = before.find((item) => item.id === resource.id);
    if (!baseline || !tables(plan).has(resource.id)) return resource;
    const state = { ...resource.state };
    for (const [key, selected] of [
      ['Associations', plan.intent.routing.associations],
      ['Propagations', plan.intent.routing.propagations],
    ]) {
      const original = rows4(baseline.state[key]);
      const current = rows4(state[key]);
      const ids = current.map((row) => row.TransitGatewayAttachmentId);
      if (new Set(ids).size !== ids.length) throw new Error('Duplicate routing reference edge');
      state[key] = current.filter((row) => {
        if (
          !selected.includes(resource.id) ||
          original.some((old) => old.TransitGatewayAttachmentId === row.TransitGatewayAttachmentId)
        )
          return true;
        const matches = evidence.filter((item) => item.id === row.TransitGatewayAttachmentId);
        if (matches.length !== 1) return true;
        const attachment = matches[0];
        const records = rows4(attachment.state.TransitGatewayAttachments);
        if (records.length !== 1) return true;
        const actual = records[0];
        const tags = attachment.tags;
        const expectedRow = {
          TransitGatewayAttachmentId: attachment.id,
          ResourceId: actual.ResourceId,
          ResourceType: actual.ResourceType,
        };
        const { State: _state, ...configuration } = row;
        return !(
          plan.engine === 'terraform' &&
          attachment.exists &&
          attachment.owned &&
          attachment.region === plan.region &&
          tags['xcsh-managed-by'] === 'aws-ce' &&
          tags['xcsh-execution-engine'] === 'terraform' &&
          tags['xcsh-deployment-id'] === plan.deploymentName &&
          tags['xcsh-plan-sha256'] === plan.planSha256 &&
          actual.TransitGatewayAttachmentId === attachment.id &&
          actual.TransitGatewayId === plan.intent.routing.transitGatewayId &&
          actual.ResourceOwnerId === plan.accountId &&
          actual.TransitGatewayOwnerId === plan.accountId &&
          typeof actual.ResourceId === 'string' &&
          ((actual.ResourceType === 'vpc' && /^vpc-[0-9a-f]{8,17}$/.test(actual.ResourceId)) ||
            (actual.ResourceType === 'connect' && /^tgw-attach-[0-9a-f]{8,17}$/.test(actual.ResourceId))) &&
          canonicalSha256(configuration) === canonicalSha256(expectedRow)
        );
      });
    }
    return { ...resource, state };
  });
}

// plugins/aws/src/ce/terraform-preflight.ts
async function revalidateAwsTerraformPlan(plan, baseline, platform, rawApi, fetcher = fetch, signal) {
  verifyAwsCePlan(plan);
  if (
    plan.engine !== 'terraform' ||
    plan.intent.operation !== 'deploy' ||
    !['greenfield', 'brownfield'].includes(plan.intent.vpc.mode)
  )
    throw new Error('Terraform deployment preflight requires a supported owning plan');
  if (plan.intent.vpc.mode === 'brownfield') awsTerraformBrownfieldPlacementBaseline(plan);
  const api = scopedAwsApi(rawApi, plan.intent.awsProfile, signal);
  const result = await api.exec('aws', [
    'ec2',
    'describe-addresses',
    '--region',
    plan.region,
    '--output',
    'json',
    '--filters',
    `Name=tag:xcsh-deployment-id,Values=${plan.deploymentName}`,
  ]);
  if (result.exitCode !== 0) throw new Error('Terraform deployment EIP ownership is unavailable');
  const addresses = JSON.parse(result.stdout);
  if (!Array.isArray(addresses.Addresses) || addresses.NextToken) throw new Error('Incomplete Terraform EIP inventory');
  const ids = addresses.Addresses.map((address) => {
    const tags = Object.fromEntries((address.Tags ?? []).map((tag) => [tag.Key, tag.Value]));
    if (
      !/^eipalloc-[0-9a-f]{8,21}$/.test(address.AllocationId ?? '') ||
      tags['xcsh-managed-by'] !== 'aws-ce' ||
      tags['xcsh-execution-engine'] !== 'terraform' ||
      tags['xcsh-deployment-id'] !== plan.deploymentName ||
      tags['xcsh-plan-sha256'] !== plan.planSha256
    )
      throw new Error('Terraform EIP belongs to a different plan or engine');
    return address.AllocationId;
  });
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate Terraform EIP identity');
  const f5Capabilities = await platform.capabilities(plan.intent.platformContext);
  const current = await discoverAwsCompute(
    {
      awsProfile: plan.intent.awsProfile,
      vpcMode: plan.intent.vpc.mode,
      accountId: plan.accountId,
      partition: plan.partition,
      deploymentName: plan.deploymentName,
      requiredEnis: plan.interfaces.length,
      nodeCount: plan.topology.nodeCount,
      instanceTypes: [plan.instance.type],
      brownfieldResourceIds: terraformPreflightReferences(plan),
      observedOwnedResourceIds: ids,
      ownedPlanSha256s: [plan.planSha256],
      resourceRegion: plan.region,
      regionQualificationScope: 'resource-region',
      ...(plan.bootstrapKeyPair ? { bootstrapKeyPairNames: [plan.bootstrapKeyPair.name] } : {}),
      egressMode: plan.egress.mode,
      routingProfile: plan.routing.profile,
      f5Capabilities,
    },
    api,
    fetcher,
  );
  const attachmentIds = routingAttachmentIds(plan, current);
  if (attachmentIds.length)
    current.resources.push(
      ...(await observeAwsResources(api, attachmentIds, plan.region, {
        deploymentName: plan.deploymentName,
        planSha256s: [plan.planSha256],
      })),
    );
  try {
    const checked =
      plan.intent.vpc.mode === 'brownfield' && plan.intent.routing.profile === 'direct-eni' && plan.intent.routes.length
        ? await normalizeAwsTerraformDirectPreflight(
            plan,
            current,
            await platform.storage({
              deploymentId: plan.deploymentName,
              engine: 'terraform',
              provider: 'aws',
              account: plan.accountId,
              region: plan.region,
            }),
            rawApi,
            signal,
          )
        : current;
    assertAwsTerraformPreflight(plan, baseline, checked);
  } catch {
    let storage;
    try {
      storage = await platform.storage({
        deploymentId: plan.deploymentName,
        engine: 'terraform',
        provider: 'aws',
        account: plan.accountId,
        region: plan.region,
      });
    } catch {}
    throw await captureAwsRevalidationRejection(
      plan,
      baseline,
      current,
      plan.observationFingerprint,
      terraformPreflightReferences(plan),
      'terraform-preflight',
      storage,
    );
  }
  return current;
}
function assertAwsTerraformPreflight(plan, baseline, current) {
  assertAwsBootstrapKeyPair(plan, current);
  const region = current.regions.filter((item) => item.name === plan.region);
  if (
    current.identity.accountId !== plan.accountId ||
    current.identity.partition !== plan.partition ||
    current.identity.awsProfile !== plan.intent.awsProfile ||
    !current.agreement.active ||
    current.agreement.productId !== baseline.agreement.productId ||
    current.f5CapabilitiesSha256 !== plan.f5CapabilitiesSha256 ||
    canonicalSha256(current.research.sourceReceipts) !== canonicalSha256(baseline.research.sourceReceipts) ||
    region.length !== 1 ||
    !region[0].enabled ||
    !region[0].eligible ||
    canonicalSha256(region[0].ami) !== canonicalSha256(plan.image)
  )
    throw new Error('Terraform preflight identity, image, agreement, contract or capacity changed');
  const types = region[0].instanceTypes.filter((item) => item.name === plan.instance.type);
  if (
    types.length !== 1 ||
    !types[0].supported ||
    plan.topology.availabilityZones.some((zone) => !types[0].availabilityZones.includes(zone))
  )
    throw new Error('Terraform instance offering no longer supports the planned topology');
  const references = terraformPreflightReferences(plan);
  if (references.length) {
    const select = (observation) => observation.resources.filter((item) => references.includes(item.id));
    const before = select(baseline);
    const after = select(current);
    if (
      before.length !== references.length ||
      after.length !== references.length ||
      after.some((item) => !item.exists || item.region !== plan.region) ||
      canonicalSha256(resourceConfiguration(before)) !==
        canonicalSha256(
          resourceConfiguration(
            plan.intent.routing.profile === 'tgw-connect'
              ? ownedRoutingAdditions(plan, before, after, current.resources)
              : after,
          ),
        )
    )
      throw new Error('Terraform routing reference configuration changed');
  }
}
function terraformPreflightReferences(plan) {
  return [
    ...new Set([
      ...terraformRoutingReferences(plan),
      ...(plan.intent.vpc?.mode === 'brownfield' ? plan.intent.brownfield.resourceIds : []),
    ]),
  ].sort();
}
function terraformRoutingReferences(plan) {
  const routing = plan.intent.routing;
  if (routing?.profile === 'direct-eni') {
    const routes = plan.intent.routes;
    const selected = plan.intent.brownfield?.routeTableIds;
    if (
      !Array.isArray(routes) ||
      !Array.isArray(selected) ||
      routes.some((route) => !/^rtb-[a-f0-9]{8,17}$/.test(route.routeTableId) || !selected.includes(route.routeTableId))
    )
      throw new Error('Terraform direct route reference identity is unresolved');
    return [...new Set(routes.map((route) => route.routeTableId))].sort();
  }
  return ['tgw-connect', 'tgw-static'].includes(routing?.profile)
    ? [
        ...new Set(
          [routing.transitGatewayId, ...routing.associations, ...routing.propagations].filter((id) => Boolean(id)),
        ),
      ]
    : [];
}

// plugins/aws/src/ce/terraform-admission.ts
import { createHash as createHash9 } from 'node:crypto';

var hash5 = (value) => createHash9('sha256').update(value).digest('hex');
var waitUntil2 = async (notBefore, signal) => {
  const remaining = notBefore - Date.now();
  if (remaining <= 0) return;
  await new Promise((resolve, reject) => {
    const aborted = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error('Terraform HA admission cancelled'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', aborted);
      resolve();
    }, remaining);
    signal?.addEventListener('abort', aborted, { once: true });
    if (signal?.aborted) aborted();
  });
};
async function admitAwsTerraformSites(plan, session, runtime, storage, api, env, signal, haSerialDelayMs = 180000) {
  verifyAwsCePlan(plan);
  assertAwsAdminPrebootDevices(plan.intent);
  const placement =
    plan.intent.vpc.mode === 'brownfield'
      ? await loadAwsTerraformBrownfieldBinding(plan, storage, api, signal)
      : undefined;
  const verifyPlacement = async (receipt) => {
    await storage.verify();
    if (placement) await loadAwsTerraformBrownfieldBinding(plan, storage, api, signal);
    if (receipt.changes.some((change) => change.type === 'aws_instance' && change.actions.includes('create')))
      await revalidateAwsBootstrapKeyPair(plan, scopedAwsApi(api, plan.intent.awsProfile, signal));
  };
  const initial = renderAwsTerraformFoundation(plan, {}, placement);
  if (plan.intent.interfaces.some((item) => !['slo', 'sli'].includes(item.role)))
    throw new Error('Terraform admission requires supported SLO/SLI mapping');
  validateAwsCeAddressing(plan.intent);
  let checkpoint;
  try {
    checkpoint = await storage.read('terraform-admission.json');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    checkpoint = {
      schemaVersion: 1,
      planSha256: plan.planSha256,
      configurationSha256: hash5(initial),
      bootstrapByNode: {},
      launchedAtByNode: {},
      admittedSites: [],
    };
  }
  checkpoint.launchedAtByNode ??= {};
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.planSha256 !== plan.planSha256 ||
    !Array.isArray(checkpoint.admittedSites) ||
    !checkpoint.bootstrapByNode ||
    typeof checkpoint.bootstrapByNode !== 'object' ||
    !checkpoint.launchedAtByNode ||
    typeof checkpoint.launchedAtByNode !== 'object' ||
    Object.entries(checkpoint.launchedAtByNode).some(
      ([node, observedAt]) => !/^[1-3]$/.test(node) || Number.isNaN(Date.parse(observedAt)),
    )
  )
    throw new Error('Terraform admission checkpoint differs from plan');
  const siteNames = siteBindings(plan).map(({ site }) => site.name);
  if (
    !/^[0-9a-f]{64}$/.test(checkpoint.configurationSha256) ||
    JSON.stringify(checkpoint.admittedSites) !== JSON.stringify(siteNames.slice(0, checkpoint.admittedSites.length))
  )
    throw new Error('Terraform admission checkpoint is not an ordered site prefix');
  const save = () => storage.write('terraform-admission.json', checkpoint);
  await save();
  const readOutputs = async () => {
    try {
      return await session.readOutputs(['ce_vpc_id', 'ce_interfaces', 'ce_instances'], env, signal);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('applied or converged current configuration'))
        throw error;
      const receipt = await session.plan(env, signal);
      const desiredHash = hash5(renderAwsTerraformFoundation(plan, checkpoint.bootstrapByNode, placement));
      if (
        ![checkpoint.configurationSha256, desiredHash].includes(receipt.configurationSha256) ||
        receipt.changes.some((change) => change.actions.some((action) => !['create', 'read', 'no-op'].includes(action)))
      )
        throw new Error('Interrupted Terraform admission requires lifecycle reconciliation');
      await storage.write('terraform-admission-plan.json', receipt);
      await verifyPlacement(receipt);
      await session.apply(receipt, env, signal);
      checkpoint.configurationSha256 = receipt.configurationSha256;
      await save();
      return session.readOutputs(['ce_vpc_id', 'ce_interfaces', 'ce_instances'], env, signal);
    }
  };
  const explicitDevices = plan.intent.interfaces.flatMap((item) => (item.guestDevice ? [item.guestDevice] : []));
  if (new Set(explicitDevices).size !== explicitDevices.length)
    throw new Error('Explicit planned guest devices must be distinct');
  const observations = [];
  for (const { site, binding } of siteBindings(plan)) {
    signal?.throwIfAborted();
    await storage.verify();
    const outputs = await readOutputs();
    const discoveredBeforeLaunch = await discoverAwsTerraformInterfaces(plan, outputs, api, signal);
    if (!checkpoint.admittedSites.includes(site.name)) {
      if (
        site.nodeIndexes.length === 3 ||
        plan.intent.interfaces.some((item) => item.addressing.mode === 'static') ||
        plan.intent.interfaces.every((item) => item.guestDevice !== undefined)
      )
        await runtime.ensureSite(
          binding,
          {
            schemaVersion: 2,
            provider: 'aws',
            haMode: site.nodeIndexes.length === 3 ? 'three-node' : 'one-node',
            nodes: site.nodeIndexes.map((node) => ({
              hostname: `${plan.deploymentName}-${node}`,
              interfaces: plan.intent.interfaces.map((item) => ({
                name: item.role,
                mtu: item.mtu ?? AWS_CE_DEFAULT_INTERFACE_MTU,
                ethernet_interface: {
                  device: item.guestDevice,
                  mac: discoveredBeforeLaunch.bindings[`__ENI_${node}_${item.index}_MAC__`],
                },
                network_option: item.role === 'slo' ? { site_local_network: {} } : { site_local_inside_network: {} },
                ...(awsCeStaticIp(plan.intent, node, item.index)
                  ? { static_ip: awsCeStaticIp(plan.intent, node, item.index) }
                  : { dhcp_client: {} }),
              })),
            })),
            settings: awsInitialAdminSettings(plan.intent),
          },
          (record) => storage.write(`terraform-site-${site.name}.json`, record),
          signal,
        );
      else
        await runtime.reserveSite(
          binding,
          (record) => storage.write(`terraform-site-${site.name}.json`, record),
          signal,
        );
      for (const [position, node] of site.nodeIndexes.entries()) {
        const previous = site.nodeIndexes[position - 1];
        if (previous !== undefined && site.nodeIndexes.length === 3) {
          const launchedAt = checkpoint.launchedAtByNode[String(previous)];
          if (!launchedAt) throw new Error('Prior HA node launch boundary is unavailable');
          await waitUntil2(Date.parse(launchedAt) + haSerialDelayMs, signal);
        }
        if (!checkpoint.bootstrapByNode[String(node)]) {
          const tokenName = `${plan.deploymentName.slice(0, 40)}-${node}-${plan.planSha256.slice(0, 12)}`;
          const material = await runtime.bootstrap(
            binding,
            `${plan.deploymentName}-${node}`,
            tokenName,
            (secret) => storage.write(`${tokenName}.json`, secret),
            signal,
          );
          checkpoint.bootstrapByNode[String(node)] = renderAwsCeCloudInit({
            nodeName: `${plan.deploymentName}-${node}`,
            material,
          });
          await save();
        }
        const configuration = renderAwsTerraformFoundation(plan, checkpoint.bootstrapByNode, placement);
        const nextHash = hash5(configuration);
        if (checkpoint.configurationSha256 !== nextHash) {
          try {
            await session.reviseConfiguration(checkpoint.configurationSha256, configuration);
          } catch (error) {
            if (!(error instanceof Error) || !error.message.includes('revision is stale')) throw error;
            await session.reviseConfiguration(nextHash, configuration);
          }
          checkpoint.configurationSha256 = nextHash;
          await save();
        }
        const receipt = await session.plan(env, signal);
        if (
          receipt.changes.some((change) =>
            change.actions.some((action) => !['create', 'read', 'no-op'].includes(action)),
          )
        )
          throw new Error(
            'Terraform admission would alter or replace an existing resource; reconcile the reviewed lifecycle plan',
          );
        await storage.write('terraform-admission-plan.json', receipt);
        if (!receipt.noChanges) {
          await verifyPlacement(receipt);
          await session.apply(receipt, env, signal);
        }
        checkpoint.launchedAtByNode[String(node)] ??= new Date().toISOString();
        await save();
      }
      checkpoint.admittedSites.push(site.name);
      await save();
    }
    const current = await readOutputs();
    const discovered = await discoverAwsTerraformInterfaces(plan, current, api, signal);
    const instances = current.ce_instances;
    const expected = Object.fromEntries(
      site.nodeIndexes.map((node) => [`${plan.deploymentName}-${node}`, instances[String(node)]?.id]),
    );
    if (Object.values(expected).some((id) => !/^i-[0-9a-f]{8,17}$/.test(id ?? '')))
      throw new Error('Terraform admitted instance identities are unavailable');
    const registrations = await runtime.approveRegistrations(
      binding,
      expected,
      (record) => storage.write(`terraform-registration-${site.name}.json`, record),
      signal,
    );
    const configuration = await runtime.observeAwsRegisteredConfiguration(
      binding,
      expected,
      site.nodeIndexes.flatMap((node) =>
        plan.intent.interfaces.map((item) => ({
          node: `${plan.deploymentName}-${node}`,
          role: item.role,
          mac: discovered.bindings[`__ENI_${node}_${item.index}_MAC__`],
          ...(item.guestDevice ? { device: item.guestDevice } : {}),
          ...(awsCeStaticIp(plan.intent, node, item.index)
            ? { staticIp: awsCeStaticIp(plan.intent, node, item.index) }
            : {}),
        })),
      ),
      signal,
    );
    if (configuration.status === 'configured' && registrations.status === 'healthy') {
      await runtime.ensureAwsInterfaceMtu(
        binding,
        expected,
        site.nodeIndexes.flatMap((node) =>
          plan.intent.interfaces.map((item) => ({
            node: `${plan.deploymentName}-${node}`,
            role: item.role,
            mac: discovered.bindings[`__ENI_${node}_${item.index}_MAC__`],
            ...(item.guestDevice ? { device: item.guestDevice } : {}),
            ...(awsCeStaticIp(plan.intent, node, item.index)
              ? { staticIp: awsCeStaticIp(plan.intent, node, item.index) }
              : {}),
            mtu: item.mtu ?? AWS_CE_DEFAULT_INTERFACE_MTU,
          })),
        ),
        (record) =>
          storage.write(`terraform-interface-mtu-${site.name}.json`, {
            ...record,
            planId: plan.planId,
            planSha256: plan.planSha256,
          }),
        signal,
      );
      Object.assign(registrations, await runtime.observeRegistrations(binding, expected, signal));
    }
    observations.push({ siteName: site.name, registrations, configuration });
    if (configuration.status !== 'configured')
      return { status: 'pending-interface-configuration', sites: observations, routing: 'unknown', traffic: 'unknown' };
    if (registrations.status !== 'healthy')
      return { status: 'pending-registration', sites: observations, routing: 'unknown', traffic: 'unknown' };
  }
  return {
    status: 'registered',
    sites: observations,
    routing: 'unknown',
    traffic: 'unknown',
  };
}

// plugins/aws/src/ce/terraform-workflow.ts
async function runAwsTerraformAdmission(plan, terraform, runtime, storage, api, revalidate, env, signal) {
  verifyAwsCePlan(plan);
  assertAwsAdminPrebootDevices(plan.intent);
  const owner = {
    deploymentId: plan.deploymentName,
    engine: 'terraform',
    provider: 'aws',
    account: plan.accountId,
    region: plan.region,
  };
  await assertAwsTerraformDeploymentActive(storage);
  let checkpoint;
  let fresh = false;
  try {
    checkpoint = await storage.read('terraform-workflow.json');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    checkpoint = { schemaVersion: 1, engine: 'terraform', planSha256: plan.planSha256, stage: 'network-pending' };
    fresh = true;
  }
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.engine !== 'terraform' ||
    checkpoint.planSha256 !== plan.planSha256 ||
    !['network-pending', 'registration-pending', 'registered'].includes(checkpoint.stage)
  )
    throw new Error('Terraform workflow checkpoint differs from the owning plan');
  signal?.throwIfAborted();
  const placement =
    plan.intent.vpc.mode === 'brownfield'
      ? await (fresh ? prepareAwsTerraformBrownfieldBinding : loadAwsTerraformBrownfieldBinding)(
          plan,
          storage,
          api,
          signal,
        )
      : undefined;
  const deployment = await awsTerraformFoundationDeployment(plan, {}, placement);
  if (fresh) await storage.write('terraform-workflow.json', checkpoint);
  const verifyCurrent = async () => {
    await revalidate();
    if (placement) await loadAwsTerraformBrownfieldBinding(plan, storage, api, signal);
  };
  let session;
  if (checkpoint.stage === 'network-pending') {
    try {
      session = await terraform.open(owner, deployment, false);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      session = await terraform.open(owner, deployment, 'current');
    }
    await verifyCurrent();
    const receipt = await session.plan(env, signal);
    if (
      receipt.changes.some((change) => change.actions.some((action) => !['create', 'read', 'no-op'].includes(action)))
    )
      throw new Error('Terraform foundation would mutate existing resources; lifecycle reconciliation required');
    await storage.write('terraform-foundation-plan.json', receipt);
    await storage.verify();
    await verifyCurrent();
    await session.apply(receipt, env, signal);
    checkpoint.stage = 'registration-pending';
    await storage.write('terraform-workflow.json', checkpoint);
  } else session = await terraform.open(owner, deployment, 'current');
  await verifyCurrent();
  const admission = await admitAwsTerraformSites(plan, session, runtime, storage, api, env, signal);
  checkpoint.stage = admission.status === 'registered' ? 'registered' : 'registration-pending';
  await storage.write('terraform-workflow.json', checkpoint);
  return { planId: plan.planId, planSha256: plan.planSha256, engine: 'terraform', ...admission };
}

// plugins/aws/src/ce/terraform-apply.ts
async function executeAwsCeTerraformApply(...args) {
  const [input, ctx, , platform, , , signal] = args;
  if (Object.keys(input).some((key) => !['planId', 'planSha256'].includes(key)))
    throw new Error('Terraform apply accepts only the persisted plan identity');
  const { plan } = await loadAwsPlan(ctx.sessionManager, input.planId, input.planSha256);
  const storage = await platform.storage({
    deploymentId: plan.deploymentName,
    engine: 'terraform',
    provider: 'aws',
    account: plan.accountId,
    region: plan.region,
  });
  return withAwsTerraformLifecycle(storage, signal, async () => {
    await assertAwsTerraformDeploymentActive(storage);
    return executeAwsCeTerraformApplyUnlocked(...args);
  });
}
async function executeAwsCeTerraformApplyUnlocked(
  input,
  ctx,
  api,
  platform,
  terraform,
  fetcher = fetch,
  signal,
  preflight = revalidateAwsTerraformPlan,
) {
  if (Object.keys(input).some((key) => !['planId', 'planSha256'].includes(key)))
    throw new Error('Terraform apply accepts only the persisted plan identity');
  const { plan, observation } = await loadAwsPlan(ctx.sessionManager, input.planId, input.planSha256);
  await awsTerraformFoundationDeployment(
    plan,
    {},
    plan.intent.vpc.mode === 'brownfield' ? awsTerraformBrownfieldPlacementBaseline(plan) : undefined,
  );
  const runtime = await platform.runtime('terraform', plan.intent.platformContext);
  if (typeof runtime.resourceMutation !== 'function')
    throw new Error('Terraform F5 resource-state service is required before deployment');
  if (
    plan.intent.topology.nodeCount === 3 &&
    (!plan.intent.topology.sites || plan.intent.topology.sites.some((site) => site.nodeIndexes.length === 3))
  )
    runtime.requireAwsHaContract();
  const storage = await platform.storage({
    deploymentId: plan.deploymentName,
    engine: 'terraform',
    provider: 'aws',
    account: plan.accountId,
    region: plan.region,
  });
  await runtime.reconcileTerraformResources(
    {
      deploymentId: plan.deploymentName,
      engine: 'terraform',
      provider: 'aws',
      account: plan.accountId,
      region: plan.region,
    },
    signal,
  );
  let authorization;
  try {
    authorization = await storage.read('terraform-authorization.json');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const authorized = Boolean(
    authorization &&
      typeof authorization === 'object' &&
      authorization.schemaVersion === 1 &&
      authorization.engine === 'terraform' &&
      authorization.planSha256 === plan.planSha256 &&
      authorization.mutations === true,
  );
  if (authorization && authorization.f5StateOwner !== 'terraform')
    throw new Error('Legacy mixed-engine Terraform deployment is inspection-only; automatic F5 adoption is prohibited');
  if (authorization !== undefined && !authorized)
    throw new Error('Terraform authorization checkpoint differs from this plan or engine');
  if (!authorization) {
    for (const { binding } of siteBindings(plan)) {
      try {
        await runtime.observeOwnedSite(binding, signal);
        throw new Error('Existing F5 site cannot be adopted by a fresh Terraform deployment');
      } catch (error) {
        if (!(error instanceof CeApiError && error.category === 'not-found')) throw error;
      }
    }
  }
  assertAwsApplyAllowed(plan, {
    ...input,
    hasUI: ctx.hasUI,
    env: process.env,
    authorized,
    executionEngine: 'terraform',
  });
  let current = observation;
  const revalidate = async () => {
    current = await preflight(plan, observation, platform, api, fetcher, signal);
  };
  await revalidate();
  if (
    !authorized &&
    ctx.hasUI &&
    !(await ctx.ui.confirm(
      'Apply immutable AWS CE Terraform plan',
      `${plan.planId}
${plan.planSha256}`,
    ))
  )
    throw new Error('AWS CE Terraform apply was not approved');
  await storage.write('terraform-authorization.json', {
    schemaVersion: 1,
    engine: 'terraform',
    planSha256: plan.planSha256,
    mutations: true,
    f5StateOwner: 'terraform',
  });
  if (plan.routing?.profile === 'tgw-connect') runtime.requireAwsRoutingContract();
  let connectStarted = false;
  try {
    const marker = await storage.read('terraform-connect-stage.json');
    if (
      marker.schemaVersion !== 1 ||
      marker.engine !== 'terraform' ||
      marker.planSha256 !== plan.planSha256 ||
      !['pending', 'applied'].includes(String(marker.stage)) ||
      !['tgw-connect', 'tgw-static'].includes(plan.routing?.profile)
    )
      throw new Error('Terraform Connect checkpoint differs from the plan');
    connectStarted = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  let directStarted = false;
  try {
    await storage.read('terraform-direct-import-source.json');
    if (
      plan.intent.vpc.mode !== 'brownfield' ||
      plan.intent.routing.profile !== 'direct-eni' ||
      !plan.intent.routes.length
    )
      throw new Error('Direct import source belongs to a different deployment profile');
    directStarted = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  let result =
    connectStarted || directStarted
      ? {
          planId: plan.planId,
          planSha256: plan.planSha256,
          engine: 'terraform',
          status: 'routing-in-progress',
          routing: 'unknown',
          traffic: 'unknown',
        }
      : await (async () => {
          const pending = await runAwsTerraformInitialReplacement(
            plan,
            terraform,
            runtime,
            storage,
            api,
            fetcher,
            signal,
          );
          if (pending.handled && pending.status !== 'registered') return pending;
          try {
            return await runAwsTerraformAdmission(
              plan,
              terraform,
              runtime,
              storage,
              api,
              revalidate,
              process.env,
              signal,
            );
          } catch (error) {
            if (!(error instanceof Error) || !error.message.includes('coupled VM/site replacement')) throw error;
            const replacement = await runAwsTerraformInitialReplacement(
              plan,
              terraform,
              runtime,
              storage,
              api,
              fetcher,
              signal,
            );
            if (!replacement.handled) throw error;
            if (replacement.status === 'registered')
              await storage.write('terraform-workflow.json', {
                schemaVersion: 1,
                engine: 'terraform',
                planSha256: plan.planSha256,
                stage: 'registered',
              });
            return replacement;
          }
        })();
  if (
    ['tgw-connect', 'tgw-static'].includes(plan.routing?.profile) &&
    (connectStarted || result.status === 'registered')
  ) {
    const owner = {
      deploymentId: plan.deploymentName,
      engine: 'terraform',
      provider: 'aws',
      account: plan.accountId,
      region: plan.region,
    };
    const placement =
      plan.intent.vpc.mode === 'brownfield'
        ? await loadAwsTerraformBrownfieldBinding(plan, storage, api, signal)
        : undefined;
    const session = await terraform.open(owner, await awsTerraformFoundationDeployment(plan, {}, placement), 'current');
    await applyAwsTerraformConnectStage(plan, current, session, storage, revalidate, process.env, signal);
    try {
      let bgp;
      let routingCheckpoint;
      if (plan.routing.profile === 'tgw-connect') {
        bgp = await configureAwsTerraformRouting(plan, session, runtime, storage, api, process.env, signal);
        if (bgp.status !== 'healthy') throw new Error('Observed AWS BGP sessions have not converged');
        routingCheckpoint = await storage.read('terraform-routing-checkpoint.json');
      } else {
        const outputs = await session.readOutputs(
          ['ce_vpc_id', 'ce_interfaces', 'ce_instances', 'ce_transport_attachment', 'ce_static_route_tables'],
          process.env,
          signal,
        );
        const identities = await discoverAwsTerraformInterfaces(plan, outputs, api, signal);
        routingCheckpoint = {
          schemaVersion: 2,
          engine: 'terraform',
          planId: plan.planId,
          planSha256: plan.planSha256,
          completedActionIds: [],
          state: 'running',
          resolvedValues: { ...identities.bindings, ...bindTerraformStaticRouting(plan, outputs) },
        };
        await storage.write('terraform-routing-checkpoint.json', routingCheckpoint);
      }
      const routes = await collectAwsNetworkHealth(
        'routes',
        plan,
        routingCheckpoint,
        scopedAwsApi(api, plan.intent.awsProfile, signal),
        signal,
      );
      if (routes.status === 'unknown') throw new Error('AWS TGW route evidence is unavailable');
      if (routes.status !== 'healthy') throw new Error('Observed AWS TGW routes have not converged');
      const refresh = await session.plan(process.env, signal);
      if (!refresh.noChanges) throw new Error('Terraform changed after routing convergence');
      result = {
        ...result,
        status: 'pending-route-and-traffic-acceptance',
        bgp,
        routes,
        terraformNoChanges: true,
      };
    } catch (error) {
      if (signal?.aborted || !(error instanceof Error) || !error.message.includes('has not converged')) throw error;
      result = { ...result, status: 'pending-routing-convergence', reason: error.message };
    }
  }
  if (
    plan.intent.vpc.mode === 'brownfield' &&
    plan.intent.routing.profile === 'direct-eni' &&
    plan.intent.routes.length &&
    (directStarted || result.status === 'registered')
  ) {
    const placement = await loadAwsTerraformBrownfieldBinding(plan, storage, api, signal);
    const owner = {
      deploymentId: plan.deploymentName,
      engine: 'terraform',
      provider: 'aws',
      account: plan.accountId,
      region: plan.region,
    };
    const session = await terraform.open(owner, await awsTerraformFoundationDeployment(plan, {}, placement), 'current');
    const outputs = await session.readOutputs(['ce_vpc_id', 'ce_interfaces', 'ce_instances'], process.env, signal);
    const discovered = await discoverAwsTerraformInterfaces(plan, outputs, api, signal);
    let activationStarted = false;
    try {
      await storage.read('terraform-direct-activation-source.json');
      activationStarted = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (!activationStarted)
      await importAwsTerraformDirectRoutes(
        plan,
        {
          ...discovered.bindings,
          __INSTANCE_1__: String(outputs.ce_instances['1']?.id ?? ''),
        },
        session,
        storage,
        api,
        revalidate,
        process.env,
        signal,
      );
    const ownership = await storage.read('terraform-direct-ownership.json');
    const { binding } = siteBindings(plan)[0];
    result = {
      ...result,
      ...(await activateAwsTerraformDirectRoutes(
        plan,
        ownership,
        session,
        storage,
        api,
        () =>
          runtime.observeAwsInterfaces(
            binding,
            plan.interfaces.map((_i, index) => ({
              node: `${plan.deploymentName}-1`,
              role: index === 0 ? 'slo' : 'sli',
              mac: discovered.bindings[`__ENI_1_${index}_MAC__`],
            })),
            signal,
          ),
        revalidate,
        process.env,
        signal,
      )),
    };
  }
  const routingReady = ['tgw-connect', 'tgw-static'].includes(plan.routing?.profile)
    ? result.status === 'pending-route-and-traffic-acceptance'
    : plan.intent.vpc.mode === 'brownfield' && plan.intent.routing.profile === 'direct-eni' && plan.intent.routes.length
      ? result.status === 'pending-route-and-traffic-acceptance'
      : result.status === 'registered';
  if (plan.intent.ingress?.mode === 'nlb' && routingReady) {
    const owner = {
      deploymentId: plan.deploymentName,
      engine: 'terraform',
      provider: 'aws',
      account: plan.accountId,
      region: plan.region,
    };
    const placement =
      plan.intent.vpc.mode === 'brownfield'
        ? await loadAwsTerraformBrownfieldBinding(plan, storage, api, signal)
        : undefined;
    const session = await terraform.open(owner, await awsTerraformFoundationDeployment(plan, {}, placement), 'current');
    const outputs = await session.readOutputs(
      ['ce_vpc_id', 'ce_interfaces', 'ce_instances', 'ce_ingress'],
      process.env,
      signal,
    );
    const discovered = await discoverAwsTerraformInterfaces(plan, outputs, api, signal);
    const resolvedValues = { ...discovered.bindings, ...bindTerraformIngress(plan, outputs) };
    const ingress = await ensureAwsPlatformIngress(
      plan,
      runtime,
      storage,
      await VerifiedIngressContract.release(fetcher, signal),
      resolvedValues,
      scopedAwsApi(api, plan.intent.awsProfile, signal),
      signal,
    );
    const nlb = await collectAwsNetworkHealth(
      'nlb',
      plan,
      {
        schemaVersion: plan.schemaVersion,
        engine: 'terraform',
        planId: plan.planId,
        planSha256: plan.planSha256,
        completedActionIds: [],
        resolvedValues,
        state: 'running',
      },
      scopedAwsApi(api, plan.intent.awsProfile, signal),
      signal,
    );
    if (nlb.status !== 'healthy') {
      result = { ...result, status: 'pending-ingress-convergence', ingress, nlb, traffic: 'unknown' };
    } else {
      const traffic = await collectAwsTrafficProbe(plan, { resolvedValues }, storage, api, signal);
      const refresh = await session.plan(process.env, signal);
      if (!refresh.noChanges) throw new Error('Terraform changed after platform ingress convergence');
      result = {
        ...result,
        status: 'accepted',
        ingress,
        nlb,
        terraformNoChanges: true,
        traffic,
      };
    }
  }
  for (const [key, expected] of Object.entries({
    planId: plan.planId,
    planSha256: plan.planSha256,
    engine: 'terraform',
  }))
    if (result[key] !== undefined && result[key] !== expected)
      throw new Error('Terraform outcome identity differs from the owning plan');
  result = { ...result, planId: plan.planId, planSha256: plan.planSha256, engine: 'terraform' };
  const artifactId = await ctx.sessionManager.saveArtifact(JSON.stringify(result), 'aws-ce-terraform-checkpoint');
  if (!artifactId) throw new Error('Terraform outcome artifact persistence failed; deployment checkpoint is retained');
  const outcome = {
    ...result,
    status: String(result.status),
    artifactId,
  };
  return outcome;
}
function awsTerraformService(pi, signal) {
  const bus = pi.events;
  return new Promise((resolve, reject) => {
    const fail = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', fail);
      reject(new Error('Terraform CE service unavailable or cancelled'));
    };
    const timer = setTimeout(fail, 5000);
    signal?.addEventListener('abort', fail, { once: true });
    if (signal?.aborted || typeof bus?.emit !== 'function') return fail();
    try {
      bus.emit('xcsh:ce-terraform:v1:service', {
        version: 1,
        resolve: (service) => {
          clearTimeout(timer);
          signal?.removeEventListener('abort', fail);
          resolve(service);
        },
      });
    } catch {
      fail();
    }
  });
}

export {
  AwsCeRevalidationError,
  assertAwsTerraformDeploymentActive,
  assessCeUpgradeTransition,
  awsCeRevalidationDiagnostic,
  awsTerraformFoundationDeployment,
  awsTerraformService,
  beginAwsTerraformRetirement,
  bindTerraformIngress,
  bindTerraformStaticRouting,
  collectAwsNativeCloudRetirement,
  collectAwsNetworkHealth,
  collectAwsTrafficProbe,
  discoverAwsTerraformInterfaces,
  executeAwsCeApply,
  executeAwsCeTerraformApply,
  loadAwsTerraformBrownfieldBinding,
  observeAwsTerraformDirectPhase,
  prepareAwsTerraformBrownfieldBinding,
  readAwsTrafficProbeEvidence,
  renderAwsTerraformDirectTransition,
  terraformPreflightReferences,
  VerifiedIngressContract,
  VerifiedUpgradeContract,
  withAwsNativeOperation,
  withAwsTerraformLifecycle,
};
