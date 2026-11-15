// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun

// plugins/platform/src/ce/wire-ingress.ts
import { isIP } from 'node:net';
import {
  canonicalEqual,
  canonicalSha256,
  canonicalSnapshot,
  canonicalStringify,
  safeHexEqual,
} from './runtime-6j4b2rhv.js';
import { detectAzError, makeExecApi } from './runtime-2139fbqg.js';
import {
  AZURE_CE_CHECKPOINT_SCHEMA_VERSION,
  AZURE_CE_TERRAFORM_VERSION,
  acquireProcessLock,
  assertActionOwnership,
  assertApplyAllowed,
  assertAzureCeRoutingExecutable,
  assertObservationFresh,
  azureNativeBootstrapForAction,
  azureNativePendingActionConverged,
  azureNetworkUpdateAppliedNics,
  azureRelayHistoricalArtifacts,
  azureRelayOwnershipTags,
  azureRelayPlanForDeployment,
  azureRelayReplacementRetainedOwner,
  azureRelayResourceSource,
  azureTerraformCurrentDeployment,
  azureTerraformFoundationDeployment,
  azureTerraformNetworkScope,
  azureUpgradeBinding,
  buildAzureNativePendingAction,
  captureAzureNetworkUpdateInventory,
  captureAzureReplacementRouteServerOwnership,
  collectAzureAbsentDeletionTail,
  collectAzureNativeAdmissionHealth,
  collectAzureNativeVmState,
  collectAzurePlatformHealth,
  collectAzureRouteServerHealth,
  configureAzureSelectedRelayRouting,
  createWireValidator,
  discoverAzureRouteServerIdentity,
  fingerprintCheckpointObservation,
  fingerprintCurrentObservation,
  isAzureRelayReplacementHistoricalArtifact,
  loadCheckpoint,
  loadPlanArtifact,
  normalizeAzureDeploymentCapacity,
  normalizeAzureForwardingExpectations,
  parseBgpRoutes,
  persistAzureNativeNetworkCheckpointHistory,
  persistAzureNativeNetworkGenerationCompletion,
  persistAzureNativeNetworkHistory,
  prepareAzureNativeAdmission,
  prepareAzureNativeReplacement,
  qualifyAzureNativeNetworkUpdateSource,
  readAzureCePlanInventory,
  reconcileAzureNativeDeletionPrefix,
  recordAzureNativeLaunch,
  renderAzureTerraformFoundation,
  requireAzureCeRoutingContract,
  requireAzureNativePriorGenerationExecution,
  requireAzureRelayHistoricalAcceptance,
  requireQualifiedUpInterfaceEvidence,
  resolveActionArgs,
  resolveAzureForwardingExpectations,
  resolveAzureNicAddress,
  resolveAzureRelayCatalog,
  resolveAzureWorkloadCatalog,
  resolveInterfaceAddress,
  saveCheckpoint,
  usableAzureNetworkAddress,
  validAzureRelayRetainedNics,
  validAzureReplacementRouteServerOwnership,
  validAzureRetainedNicsForSource,
  validateAzureDeletionTail,
  validateAzureNativeAdmissionCheckpoint,
  validateAzureNativeNetworkUpdateCheckpoint,
  validateAzureNativePendingAction,
  validateAzureNetworkUpdateInventory,
  validateExpectedForwardingRoutes,
  verifyAzureCePlan,
  verifyAzureNativeNetworkReplacementExecution2,
  verifyAzureNativeNetworkUpdateSite,
  verifyAzureNetworkUpdateProgress,
  verifyAzureRelayPlan,
  verifyAzureRelayReplacementHistories,
  verifyAzureTerraformNetworkProfile,
  verifyAzureTerraformNetworkReplacementProfile,
  withAzureNativeBootstrapFile,
} from './runtime-34064jyj.js';
import { CE_API_RELEASE, loadPublishedCeApi } from './runtime-cfmmcdyk.js';
import { discoverAzureCompute } from './runtime-fcqr1ksb.js';
import { azurePlatformService, azureTerraformService } from './runtime-hxhs7mq0.js';
import { withAzureCeExecution } from './runtime-tdt4p3w8.js';
import {
  AZURE_CE_AZAPI_PROVIDER_VERSION,
  assertAzureNativeActive,
  assertAzureNativeRelayActive,
  azureRelaySshPublicKey,
  azureTerraformLifecycleDeployment,
  captureAzureCeApplyCallbacks,
  captureAzureCeApplyRequest,
  collectAzureCurrentTrafficProbe,
  collectAzureTrafficProbe,
  compileAzureRelayNativeRequests,
  guardAzureCeApplyObject,
  guardAzureCeApplyServices,
  observeAzureTrafficSource,
  renderTerraformConfigurationJson,
  runAzureTerraformLifecycle,
  validateAzureTrafficSourceIdentity,
} from './runtime-xnt6xzs2.js';

// plugins/platform/src/ce/wire-replace.ts
var object = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed replacement schema');
  return value;
};
function projectReplaceSnapshot(value, schemas, root, ignoredRootFields = []) {
  function shape(value, depth = 0) {
    if (depth > 50) throw new Error('Replacement schema nesting exceeds limit');
    const schema = object(value);
    let resolved = {};
    if (schema.$ref) {
      if (typeof schema.$ref !== 'string' || !schema.$ref.startsWith('#/components/schemas/'))
        throw new Error('Unsupported replacement reference');
      resolved = shape(schemas[schema.$ref.slice('#/components/schemas/'.length)], depth + 1);
    }
    if (schema.allOf)
      for (const item of schema.allOf) {
        const part = shape(item, depth + 1);
        resolved = {
          ...resolved,
          ...part,
          ...(resolved.properties || part.properties
            ? { properties: { ...resolved.properties, ...part.properties } }
            : {}),
        };
      }
    return {
      ...resolved,
      ...schema,
      ...(schema.properties ? { properties: { ...resolved.properties, ...object(schema.properties) } } : {}),
    };
  }
  function project(value, schemaValue, top = false) {
    const schema = shape(schemaValue);
    if (schema.readOnly === true || value === null || (value === '' && Number(schema.minLength) > 0)) return;
    if (Array.isArray(value)) {
      if (!schema.items) throw new Error('Replacement array schema missing');
      return value.map((item) => {
        const projected = project(item, schema.items);
        if (projected === undefined) throw new Error('Replacement array contains an unset item');
        return projected;
      });
    }
    if (value && typeof value === 'object') {
      if (schema.properties === undefined && schema.additionalProperties === undefined) return structuredClone(value);
      const properties = object(schema.properties ?? {});
      const result = {};
      for (const [key, item] of Object.entries(value)) {
        const canonicalKey = Object.hasOwn(properties, key)
          ? key
          : Object.keys(properties).find((name) => object(properties[name])['x-f5xc-wire-name'] === key);
        if (canonicalKey === undefined) {
          if (top && ignoredRootFields.includes(key)) continue;
          if (schema.additionalProperties === true) {
            result[key] = structuredClone(item);
            continue;
          }
          if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
            const projected = project(item, schema.additionalProperties);
            if (projected !== undefined) result[key] = projected;
            continue;
          }
          throw new Error('GET snapshot contains an unsupported replacement field');
        }
        const wireName = object(properties[canonicalKey])['x-f5xc-wire-name'];
        const outputKey = typeof wireName === 'string' ? wireName : canonicalKey;
        if (Object.hasOwn(result, outputKey)) throw new Error('Duplicate canonical and wire field aliases');
        const projected = project(item, properties[canonicalKey]);
        if (projected !== undefined) result[outputKey] = projected;
      }
      return result;
    }
    return structuredClone(value);
  }
  return object(project(value, schemas[root], true));
}

// plugins/platform/src/ce/wire-ingress.ts
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
function object2(value) {
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
    const path = object2(object2(api.paths)['/api/config/namespaces/{metadata.namespace}/http_loadbalancers']);
    const schema = object2(
      object2(object2(object2(object2(path.post).requestBody).content)['application/json']).schema,
    );
    if (schema.$ref !== '#/components/schemas/http_loadbalancerCreateRequest')
      throw new Error('Unsupported ingress request path');
    const origin = object2(object2(api.paths)['/api/config/namespaces/{metadata.namespace}/origin_pools']);
    const originSchema = object2(
      object2(object2(object2(object2(origin.post).requestBody).content)['application/json']).schema,
    );
    if (originSchema.$ref !== '#/components/schemas/origin_poolCreateRequest')
      throw new Error('Unsupported origin request path');
    return new VerifiedIngressContract(object2(object2(api.components).schemas));
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

// plugins/azure/src/ce/native-action-evidence.ts
async function persistAzureNativeSource(plan, store) {
  verifyAzureCePlan(plan);
  await store.verify();
  if (plan.engine !== 'native' || canonicalSha256(store.owner) !== canonicalSha256(azureUpgradeBinding(plan).owner))
    throw Error('Azure native evidence owner differs');
  const name = `native-source-${plan.planSha256}.json`;
  let saved;
  try {
    saved = await store.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (saved !== undefined && canonicalSha256(saved) !== canonicalSha256(plan))
    throw Error('Azure native source registry differs');
  if (saved === undefined) await store.write(name, plan);
}
async function persistAzureNativeActionEvidence(plan, action, evidence, store) {
  verifyAzureCePlan(plan);
  const expected = plan.actions.filter((row) => row.id === action.id);
  if (expected.length !== 1 || canonicalSha256(expected[0]) !== canonicalSha256(action))
    throw Error('Azure native evidence action differs');
  await persistAzureNativeSource(plan, store);
  await store.write(`native-action-${plan.planSha256}-${action.id}.json`, {
    schemaVersion: 1,
    engine: 'native',
    owner: store.owner,
    sourcePlanSha256: plan.planSha256,
    actionId: action.id,
    actionSha256: canonicalSha256(action),
    evidence,
  });
}

// plugins/azure/src/ce/ingress-interface-identity.ts
function object3(value, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value;
}
function fields(value, required, optional = []) {
  if (
    required.some((key) => !(key in value)) ||
    Object.keys(value).some((key) => !required.includes(key) && !optional.includes(key))
  )
    throw new Error('Azure ingress identity fields differ');
}
async function read(api, args, signal) {
  signal?.throwIfAborted();
  const result = await api.exec('az', [...args, '--output', 'json'], signal ? { signal } : undefined);
  signal?.throwIfAborted();
  if (result.exitCode !== 0) throw detectAzError(result.stderr, result.exitCode);
  try {
    return object3(JSON.parse(result.stdout), 'Malformed Azure CE ingress identity observation');
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Malformed Azure CE ingress identity observation');
    throw error;
  }
}
function validateAzureIngressInterfaceIdentity(plan, value) {
  const identity = object3(value, 'Malformed Azure ingress identity');
  fields(identity, ['vm', 'nic']);
  const vm = object3(identity.vm, 'Malformed Azure ingress VM');
  const nic = object3(identity.nic, 'Malformed Azure ingress NIC');
  fields(vm, ['id', 'provisioningState', 'tags', 'networkProfile']);
  fields(nic, ['id', 'provisioningState', 'tags', 'macAddress', 'virtualMachine']);
  for (const tags of [vm.tags, nic.tags])
    fields(object3(tags, 'Malformed Azure ingress owner'), [
      'xcsh-plan-sha256',
      'xcsh-managed-by',
      'xcsh-deployment-id',
      'xcsh-execution-engine',
    ]);
  const profile = object3(vm.networkProfile, 'Malformed Azure ingress attachments');
  fields(profile, ['networkInterfaces']);
  if (!Array.isArray(profile.networkInterfaces)) throw new Error('Malformed Azure ingress attachments');
  const seen = new Set();
  for (const raw of profile.networkInterfaces) {
    const row = object3(raw, 'Malformed Azure ingress attachment');
    fields(row, ['id'], ['primary']);
    if (
      typeof row.id !== 'string' ||
      seen.has(row.id.toLowerCase()) ||
      (row.primary !== undefined && typeof row.primary !== 'boolean')
    )
      throw new Error('Duplicate or malformed Azure ingress attachment');
    seen.add(row.id.toLowerCase());
  }
  fields(object3(nic.virtualMachine, 'Malformed Azure ingress back reference'), ['id']);
  const sli = plan.nics.filter((nic) => nic.role === 'sli');
  if (sli.length !== 1) throw new Error('Azure platform ingress requires exactly one SLI interface');
  const node = `${plan.deploymentName}-1`;
  const scope = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/`;
  const vmResourceId = `${scope}Microsoft.Compute/virtualMachines/${node}`;
  const nicResourceId = `${scope}Microsoft.Network/networkInterfaces/${node}-nic${sli[0].index}`;
  for (const id of [vmResourceId, nicResourceId])
    if (
      !plan.ownershipInventory.some(
        (row) => row.resourceId.toLowerCase() === id.toLowerCase() && row.owned && row.action !== 'delete',
      )
    )
      throw new Error('Azure platform ingress interface is outside the owned inventory');
  const vmTags = object3(vm.tags, 'Azure platform ingress VM ownership is unavailable');
  const nicTags = object3(nic.tags, 'Azure platform ingress NIC ownership is unavailable');
  const ownerPlanSha256 = vmTags['xcsh-plan-sha256'];
  const attachments = object3(
    vm.networkProfile,
    'Azure platform ingress VM network profile is unavailable',
  ).networkInterfaces;
  const attached =
    Array.isArray(attachments) &&
    attachments.filter(
      (value) =>
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        typeof value.id === 'string' &&
        String(value.id).toLowerCase() === nicResourceId.toLowerCase(),
    );
  const mac = typeof nic.macAddress === 'string' ? nic.macAddress.replaceAll('-', ':').toLowerCase() : '';
  if (
    typeof vm.id !== 'string' ||
    vm.id.toLowerCase() !== vmResourceId.toLowerCase() ||
    vm.provisioningState !== 'Succeeded' ||
    !Array.isArray(attached) ||
    attached.length !== 1 ||
    typeof nic.id !== 'string' ||
    nic.id.toLowerCase() !== nicResourceId.toLowerCase() ||
    nic.provisioningState !== 'Succeeded' ||
    typeof object3(nic.virtualMachine, 'Azure platform ingress NIC attachment is unavailable').id !== 'string' ||
    String(object3(nic.virtualMachine, 'Azure platform ingress NIC attachment is unavailable').id).toLowerCase() !==
      vmResourceId.toLowerCase() ||
    !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(mac) ||
    typeof ownerPlanSha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(ownerPlanSha256) ||
    nicTags['xcsh-plan-sha256'] !== ownerPlanSha256 ||
    [vmTags, nicTags].some(
      (tags) =>
        tags['xcsh-managed-by'] !== 'azure-ce' ||
        tags['xcsh-deployment-id'] !== plan.deploymentName ||
        tags['xcsh-execution-engine'] !== plan.engine,
    )
  )
    throw new Error('Azure platform ingress VM, NIC, or ownership identity differs');
  return { node, mac, vmResourceId, nicResourceId, ownerPlanSha256 };
}
function project(value, names) {
  return Object.fromEntries(names.filter((name) => value[name] !== undefined).map((name) => [name, value[name]]));
}
async function observeAzureIngressInterface(plan, api, signal) {
  const sli = plan.nics.filter((nic) => nic.role === 'sli');
  if (sli.length !== 1) throw new Error('Azure platform ingress requires exactly one SLI interface');
  const node = `${plan.deploymentName}-1`;
  const scope = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/`;
  const vmResourceId = `${scope}Microsoft.Compute/virtualMachines/${node}`;
  const nicResourceId = `${scope}Microsoft.Network/networkInterfaces/${node}-nic${sli[0].index}`;
  for (const id of [vmResourceId, nicResourceId])
    if (
      !plan.ownershipInventory.some(
        (row) => row.resourceId.toLowerCase() === id.toLowerCase() && row.owned && row.action !== 'delete',
      )
    )
      throw new Error('Azure platform ingress interface is outside the owned inventory');
  const vm = await read(api, ['vm', 'show', '--ids', vmResourceId, '--subscription', plan.subscription.id], signal);
  const nic = await read(
    api,
    ['network', 'nic', 'show', '--ids', nicResourceId, '--subscription', plan.subscription.id],
    signal,
  );
  const ownerFields = ['xcsh-plan-sha256', 'xcsh-managed-by', 'xcsh-deployment-id', 'xcsh-execution-engine'];
  const profile = object3(vm.networkProfile, 'Azure ingress attachments unavailable');
  const identity = {
    vm: {
      ...project(vm, ['id', 'provisioningState']),
      tags: project(object3(vm.tags, 'Azure ingress owner unavailable'), ownerFields),
      networkProfile: {
        networkInterfaces: Array.isArray(profile.networkInterfaces)
          ? profile.networkInterfaces.map((row) =>
              project(object3(row, 'Malformed Azure ingress attachment'), ['id', 'primary']),
            )
          : [],
      },
    },
    nic: {
      ...project(nic, ['id', 'provisioningState', 'macAddress']),
      tags: project(object3(nic.tags, 'Azure ingress owner unavailable'), ownerFields),
      virtualMachine: project(object3(nic.virtualMachine, 'Azure ingress back reference unavailable'), ['id']),
    },
  };
  return { ...validateAzureIngressInterfaceIdentity(plan, identity), identity };
}

// plugins/azure/src/ce/ingress-source.ts
var same = canonicalEqual;
function validateAzureIngressSource(value, owner, contractFingerprint) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed Azure ingress source');
  const record = value;
  const expected = [
    'schemaVersion',
    'engine',
    'owner',
    'sourcePlanSha256',
    'plan',
    'sourceIdentity',
    'selectedIdentity',
    'contractFingerprint',
    'configurationSha256',
    'observedAt',
  ];
  if (Object.keys(record).sort().join(',') !== expected.sort().join(','))
    throw new Error('Azure ingress source fields differ');
  const plan = record.plan;
  verifyAzureCePlan(plan);
  if (
    record.schemaVersion !== 1 ||
    record.engine !== owner.engine ||
    record.engine !== plan.engine ||
    !same(record.owner, owner) ||
    !same(azureUpgradeBinding(plan).owner, owner) ||
    record.sourcePlanSha256 !== plan.planSha256 ||
    record.contractFingerprint !== contractFingerprint ||
    plan.intent.ingress?.mode !== 'platform-http' ||
    typeof record.observedAt !== 'string' ||
    !Number.isFinite(Date.parse(record.observedAt)) ||
    Date.parse(record.observedAt) > Date.now()
  )
    throw new Error('Azure ingress source owner, plan or provenance differs');
  const source = validateAzureTrafficSourceIdentity(plan, record.sourceIdentity);
  const selected = validateAzureIngressInterfaceIdentity(plan, record.selectedIdentity);
  const binding = azureUpgradeBinding(plan);
  const intent = {
    ...plan.intent.ingress.listener,
    port: plan.intent.ingress.port,
    originAddress: source.privateAddress,
  };
  const selections = [
    { binding, node: selected.node, mac: selected.mac, insideAddress: plan.intent.ingress.listener.privateAddress },
  ];
  const configurationSha256 = canonicalSha256({ owner, intent });
  if (record.configurationSha256 !== configurationSha256) throw new Error('Azure ingress source configuration differs');
  return { record, plan, source, selected, intent, selections, configurationSha256 };
}
async function persistAzureIngressSource(plan, sourceIdentity, selectedIdentity, contractFingerprint, store, signal) {
  signal?.throwIfAborted();
  await store.verify();
  if (plan.intent.ingress?.mode !== 'platform-http')
    throw new Error('Azure ingress source requires platform HTTP intent');
  const owner = azureUpgradeBinding(plan).owner;
  if (!same(store.owner, owner)) throw new Error('Azure ingress source store owner differs');
  const source = validateAzureTrafficSourceIdentity(plan, sourceIdentity);
  const draft = {
    schemaVersion: 1,
    engine: plan.engine,
    owner,
    sourcePlanSha256: plan.planSha256,
    plan,
    sourceIdentity,
    selectedIdentity,
    contractFingerprint,
    configurationSha256: canonicalSha256({
      owner,
      intent: { ...plan.intent.ingress.listener, port: plan.intent.ingress.port, originAddress: source.privateAddress },
    }),
  };
  const next = { ...draft, observedAt: new Date().toISOString() };
  validateAzureIngressSource(next, owner, contractFingerprint);
  const name = `azure-ingress-source-${plan.planSha256}.json`;
  let saved;
  try {
    saved = await store.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (saved !== undefined) {
    const checked = validateAzureIngressSource(saved, owner, contractFingerprint);
    const { observedAt: _time, ...prior } = checked.record;
    if (!same(prior, draft)) throw new Error('Azure ingress source attachment changed for the same plan');
    return checked.record;
  }
  signal?.throwIfAborted();
  await store.write(name, next);
  signal?.throwIfAborted();
  return next;
}

// plugins/azure/src/ce/platform-ingress.ts
function object4(value, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value;
}
async function optional(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
}
async function ensureAzurePlatformIngress(plan, runtime, storage, contract, api, signal) {
  verifyAzureCePlan(plan);
  if (plan.intent.ingress?.mode !== 'platform-http') return;
  await storage.verify();
  const ingress = plan.intent.ingress;
  const source = await observeAzureTrafficSource(plan, api, signal);
  const selected = await observeAzureIngressInterface(plan, api, signal);
  const binding = azureUpgradeBinding(plan);
  const selections = [
    {
      binding,
      node: selected.node,
      mac: selected.mac,
      insideAddress: ingress.listener.privateAddress,
    },
  ];
  const intent = { ...ingress.listener, port: ingress.port, originAddress: source.privateAddress };
  const configurationSha256 = canonicalSha256({ owner: binding.owner, intent });
  const journal = await persistAzureIngressSource(
    plan,
    source.identity,
    selected.identity,
    contract.fingerprint,
    storage,
    signal,
  );
  const provenance = {
    schemaVersion: 1,
    kind: 'azure-ce-source',
    sourcePlanSha256: plan.planSha256,
    sourceArtifactSha256: canonicalSha256(journal),
  };
  const lifecycle = runtime.ingress(contract, storage);
  const saved = await optional(storage, 'azure-platform-ingress.json');
  let marker;
  if (saved !== undefined) {
    const candidate = object4(saved, 'Malformed Azure platform ingress checkpoint');
    if (
      Object.keys(candidate).sort().join(',') !==
        [
          'schemaVersion',
          'engine',
          'sourcePlanSha256',
          'sourceArtifactSha256',
          'configurationSha256',
          'ingressPlanId',
          'contractFingerprint',
        ]
          .sort()
          .join(',') ||
      candidate.schemaVersion !== 2 ||
      !/^[a-f0-9]{64}$/.test(candidate.sourcePlanSha256) ||
      !/^[a-f0-9]{64}$/.test(candidate.sourceArtifactSha256) ||
      candidate.engine !== plan.engine ||
      candidate.configurationSha256 !== configurationSha256 ||
      candidate.contractFingerprint !== contract.fingerprint ||
      !/^[a-f0-9]{24}$/.test(candidate.ingressPlanId)
    )
      throw new Error('Platform ingress checkpoint differs from the owning Azure configuration');
    const prior = await storage.read(`azure-ingress-source-${candidate.sourcePlanSha256}.json`);
    const priorSource = validateAzureIngressSource(prior, binding.owner, contract.fingerprint);
    if (
      candidate.sourceArtifactSha256 !== canonicalSha256(prior) ||
      priorSource.configurationSha256 !== configurationSha256 ||
      priorSource.plan.planSha256 !== candidate.sourcePlanSha256
    )
      throw new Error('Platform ingress checkpoint source provenance differs');
    marker = candidate;
    if (!(await lifecycle.matchesAzure(marker.ingressPlanId, intent, selections, signal))) {
      if (!['replace-node', 'update-network'].includes(plan.intent.operation))
        throw new Error('Azure platform ingress identities changed outside an approved replacement operation');
      await lifecycle.retire(marker.ingressPlanId, signal);
      const replacement = await lifecycle.planAzure(intent, selections, signal, provenance);
      marker = {
        ...marker,
        ingressPlanId: replacement.id,
        sourcePlanSha256: plan.planSha256,
        sourceArtifactSha256: canonicalSha256(journal),
      };
      await storage.write('azure-platform-ingress.json', marker);
    }
  } else {
    const ingressPlan = await lifecycle.planAzure(intent, selections, signal, provenance);
    marker = {
      schemaVersion: 2,
      sourcePlanSha256: plan.planSha256,
      sourceArtifactSha256: canonicalSha256(journal),
      engine: plan.engine,
      configurationSha256,
      ingressPlanId: ingressPlan.id,
      contractFingerprint: contract.fingerprint,
    };
    await storage.write('azure-platform-ingress.json', marker);
  }
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

// plugins/azure/src/ce/relay-native-execution.ts
import { generateKeyPairSync } from 'node:crypto';
import { join } from 'node:path';

var name = 'relay-native-execution.json';
var require2 = (condition, message) => {
  if (!condition) throw Error(`Azure relay native execution: ${message}`);
};
var object5 = (value) => {
  require2(value && typeof value === 'object' && !Array.isArray(value), 'malformed resource or checkpoint');
  return value;
};
var sameId = (value, expected) => typeof value === 'string' && value.toLowerCase() === expected.toLowerCase();
function match(actual, expected, path = '') {
  if (path === 'properties.osProfile.customData' && actual === undefined) return;
  if (Array.isArray(expected)) {
    require2(Array.isArray(actual) && actual.length === expected.length, `resource graph differs at ${path}`);
    expected.forEach((value, index) => {
      match(actual[index], value, `${path}.${index}`);
    });
  } else if (expected && typeof expected === 'object') {
    const value = object5(actual);
    for (const [key, item] of Object.entries(expected)) match(value[key], item, path ? `${path}.${key}` : key);
  } else {
    require2(
      path.endsWith('.id') && typeof expected === 'string' ? sameId(actual, expected) : actual === expected,
      `resource graph differs at ${path}`,
    );
  }
}
async function runAzureRelayNativeResources(source, plan, storage, api, signal, inspectOnly = false) {
  source = structuredClone(source);
  plan = structuredClone(plan);
  verifyAzureRelayPlan(source, plan);
  require2(plan.engine === 'native', 'native engine required');
  signal?.throwIfAborted();
  await storage.verify();
  await assertAzureNativeRelayActive(storage);
  require2(
    storage.owner.provider === 'azure' &&
      storage.owner.engine === 'native' &&
      storage.owner.account === source.subscription.id &&
      storage.owner.region === source.region &&
      storage.owner.deploymentId === source.deploymentName,
    'storage owner differs from saved plan',
  );
  const deadline = AbortSignal.any([AbortSignal.timeout(30000), ...(signal ? [signal] : [])]);
  const exec = async (args) => {
    deadline.throwIfAborted();
    const abort = Promise.withResolvers();
    const onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([api.exec('az', args, { signal: deadline }), abort.promise]);
      deadline.throwIfAborted();
      return result;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const read = async (id, version) => {
    const raw = await exec([
      'rest',
      '--method',
      'get',
      '--url',
      `https://management.azure.com${id}?api-version=${version}`,
      '--subscription',
      plan.subscriptionId,
      '--output',
      'json',
    ]);
    if (raw.exitCode !== 0) {
      if (/^(?:ResourceNotFound|\(ResourceNotFound\))(?::|\s|$)/.test(raw.stderr.trim())) return;
      throw Error('Azure relay native execution: cloud read unavailable');
    }
    const value = object5(JSON.parse(raw.stdout));
    require2(
      sameId(value.id, id) && !['nextLink', 'nextPageToken', 'error', 'errors'].some((key) => value[key]),
      'resource identity incomplete or substituted',
    );
    return value;
  };
  let journal;
  try {
    journal = await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (journal) {
    require2(
      journal.schemaVersion === 1 &&
        journal.engine === 'native' &&
        journal.sourcePlanSha256 === source.planSha256 &&
        journal.relayPlanSha256 === plan.planSha256 &&
        typeof journal.privateKey === 'string' &&
        typeof journal.publicKey === 'string' &&
        Array.isArray(journal.completed),
      'checkpoint owner or shape differs',
    );
    require2(
      Object.keys(journal).sort().join(',') ===
        [
          'schemaVersion',
          'engine',
          'sourcePlanSha256',
          'relayPlanSha256',
          'privateKey',
          'publicKey',
          'requestsSha256',
          'completed',
          ...(journal.pending ? ['pending'] : []),
        ]
          .sort()
          .join(',') && /^[a-f0-9]{64}$/.test(journal.requestsSha256),
      'checkpoint request binding or fields differ',
    );
    require2(azureRelaySshPublicKey(journal.privateKey) === journal.publicKey, 'checkpoint SSH key differs');
  } else {
    if (inspectOnly)
      return {
        status: 'inspected',
        complete: false,
        resources: [],
        sourcePlanSha256: source.planSha256,
        relayPlanSha256: plan.planSha256,
      };
    const privateKey = generateKeyPairSync('ed25519').privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    journal = {
      schemaVersion: 1,
      engine: 'native',
      sourcePlanSha256: source.planSha256,
      relayPlanSha256: plan.planSha256,
      privateKey,
      publicKey: azureRelaySshPublicKey(privateKey),
      requestsSha256: '',
      completed: [],
    };
  }
  const requests = compileAzureRelayNativeRequests(source, plan, journal.publicKey);
  const requestsSha256 = canonicalSha256(requests);
  require2(!journal.requestsSha256 || journal.requestsSha256 === requestsSha256, 'checkpoint requests differ');
  require2(
    journal.completed.length <= requests.length &&
      journal.completed.every((id, index) => id === requests[index].resourceId),
    'checkpoint completion order differs',
  );
  const pending = journal.pending;
  if (pending) {
    const next = requests[journal.completed.length];
    require2(
      Object.keys(pending).sort().join(',') === 'requestSha256,resourceId,submitted',
      'checkpoint pending fields differ',
    );
    require2(
      next &&
        pending.submitted === true &&
        pending.resourceId === next.resourceId &&
        pending.requestSha256 === canonicalSha256(next),
      'checkpoint submission differs',
    );
  }
  journal.requestsSha256 = requestsSha256;
  const catalog = await resolveAzureRelayCatalog(
    source,
    {
      vmSize: plan.vmSize,
      hostImage: plan.hostImage,
      frr: plan.frr,
      relays: plan.relays,
      vipPrefixes: plan.vipPrefixes,
      returnPrefixes: plan.returnPrefixes,
      docker: plan.docker,
    },
    api,
    deadline,
  );
  require2(
    canonicalSha256({ region: catalog.region, image: catalog.image, vmSizes: catalog.vmSizes }) ===
      canonicalSha256(plan.catalog),
    'current catalog differs',
  );
  const tags = azureRelayOwnershipTags(source, plan);
  const parents = async () => {
    for (const id of [plan.vnetId, plan.sloSubnetId, plan.routeServerId]) {
      const value = await read(id, '2024-05-01');
      require2(value && object5(value.properties).provisioningState === 'Succeeded', 'owned foundation unavailable');
      if (id === plan.sloSubnetId) {
        const properties = object5(value?.properties);
        const prefixes =
          typeof properties.addressPrefix === 'string' ? [properties.addressPrefix] : properties.addressPrefixes;
        require2(
          Array.isArray(prefixes) && prefixes.length === 1 && prefixes[0] === plan.sloCidr,
          'foundation SLO subnet prefix differs',
        );
      }
      if (id !== plan.sloSubnetId) {
        require2(value?.location === plan.region, 'foundation region differs');
        const observedTags = object5(value?.tags);
        for (const [key, expected] of Object.entries(tags))
          if (key !== 'xcsh-relay-plan-sha256') require2(observedTags[key] === expected, 'foundation owner differs');
      }
    }
  };
  const verify = (value, request) => {
    require2(object5(value.properties).provisioningState === 'Succeeded', 'resource provisioning is incomplete');
    match(value, request.body);
    if (request.kind === 'relay-vm-create') {
      const relay = plan.relays.find((item) => item.vmId === request.resourceId);
      const disk = object5(object5(object5(value.properties).storageProfile).osDisk);
      require2(relay && sameId(object5(disk.managedDisk).id, relay.osDiskId), 'OS disk identity differs');
    }
  };
  await parents();
  const inspectedResources = new Map();
  for (const request of requests) {
    const value = await read(request.resourceId, request.apiVersion);
    if (value) {
      verify(value, request);
      inspectedResources.set(request.resourceId, value);
    } else require2(!journal.completed.includes(request.resourceId), 'completed resource disappeared');
  }
  if (inspectOnly) {
    if (journal.pending)
      require2(
        inspectedResources.has(journal.pending.resourceId),
        'submitted outcome is unknown; refusing duplicate submission',
      );
    const authorized = new Set([...journal.completed, ...(journal.pending ? [journal.pending.resourceId] : [])]);
    const resources = requests
      .filter((request) => authorized.has(request.resourceId))
      .map((request) => inspectedResources.get(request.resourceId));
    for (const request of requests.filter(
      (item) => authorized.has(item.resourceId) && item.kind === 'relay-vm-create',
    )) {
      const relay = plan.relays.find((item) => item.vmId === request.resourceId);
      require2(relay, 'generated disk VM binding unavailable');
      const disk = await read(relay.osDiskId, '2024-03-02');
      require2(
        disk &&
          sameId(disk.managedBy, request.resourceId) &&
          disk.location === plan.region &&
          object5(disk.properties).provisioningState === 'Succeeded',
        'generated disk identity or attachment differs',
      );
      if (disk?.tags) {
        const diskTags = object5(disk.tags);
        require2(
          Object.entries(diskTags).every(([key, value]) => tags[key] === value),
          'generated disk owner differs',
        );
      }
      resources.push(disk);
    }
    await parents();
    for (const request of requests) {
      const final = await read(request.resourceId, request.apiVersion);
      require2(
        canonicalSha256(final ?? null) === canonicalSha256(inspectedResources.get(request.resourceId) ?? null),
        'target changed during read-only recovery inspection',
      );
    }
    for (const disk of resources.filter((resource) => typeof resource.managedBy === 'string')) {
      require2(
        canonicalSha256(await read(String(disk.id), '2024-03-02')) === canonicalSha256(disk),
        'generated disk changed during read-only recovery inspection',
      );
    }
    deadline.throwIfAborted();
    return {
      status: 'inspected',
      complete: authorized.size === requests.length,
      resources,
      sourcePlanSha256: source.planSha256,
      relayPlanSha256: plan.planSha256,
    };
  }
  await storage.write(name, journal);
  for (const [index, request] of requests.entries()) {
    await parents();
    for (const id of request.dependsOn) {
      const dependency = requests.find((item) => item.resourceId === id);
      if (dependency) {
        const value = await read(id, dependency.apiVersion);
        require2(value, 'current resource dependency unavailable');
        verify(value, dependency);
      }
    }
    const existing = await read(request.resourceId, request.apiVersion);
    if (existing) verify(existing, request);
    else {
      require2(
        !journal.pending && index >= journal.completed.length,
        'submitted outcome is unknown; refusing duplicate submission',
      );
      journal.pending = { resourceId: request.resourceId, requestSha256: canonicalSha256(request), submitted: true };
      await storage.write(name, journal);
      const response = await exec(request.args);
      require2(response.exitCode === 0, 'ARM submission failed; outcome requires readback');
      const current = await read(request.resourceId, request.apiVersion);
      require2(current, 'ARM acknowledgment has no current resource evidence');
      verify(current, request);
    }
    if (index >= journal.completed.length) {
      journal.completed.push(request.resourceId);
      delete journal.pending;
      await storage.write(name, journal);
    }
  }
  await parents();
  for (const request of requests) {
    const value = await read(request.resourceId, request.apiVersion);
    require2(value, 'final resource observation unavailable');
    verify(value, request);
  }
  deadline.throwIfAborted();
  return {
    status: 'provisioned',
    sourcePlanSha256: source.planSha256,
    relayPlanSha256: plan.planSha256,
    resourceIds: [...journal.completed],
    observedAt: new Date().toISOString(),
    software: 'unknown',
    routing: 'unknown',
    traffic: 'unknown',
  };
}
async function inspectAzureRelayNativeResources(source, plan, storage, api, signal) {
  const result = await runAzureRelayNativeResources(
    source,
    plan,
    {
      ...storage,
      owner: storage.owner,
      verify: () => storage.verify(),
      read: (name) => storage.read(name),
      async write() {
        throw Error('Read-only Azure relay inspection attempted a storage write');
      },
    },
    api,
    signal,
    true,
  );
  if (result.status !== 'inspected') throw Error('Azure relay inspection returned a mutation receipt');
  return result;
}
async function ensureAzureRelayNativeResources(source, plan, storage, api, signal) {
  const directory = storage.directory;
  const release = directory
    ? await acquireProcessLock(join(directory, '.azure-relay-native-mutation-lock'))
    : undefined;
  try {
    const result = await runAzureRelayNativeResources(source, plan, storage, api, signal);
    if (result.status !== 'provisioned') throw Error('Azure relay execution returned an inspection receipt');
    return result;
  } finally {
    await release?.();
  }
}
async function executeAzureRelayProvisionAction(source, action, storage, api, signal) {
  const plan = azureRelayPlanForDeployment(source);
  const expected = source.actions.find((item) => item.id === action.id);
  require2(
    action.kind === 'relay-provision' &&
      expected &&
      canonicalSha256(expected) === canonicalSha256(action) &&
      action.resourceId === plan.routeServerId,
    'relay action differs from final saved plan',
  );
  return ensureAzureRelayNativeResources(source, plan, storage, api, signal);
}

// plugins/azure/src/ce/relay-native-recovery.ts
async function reconcileAzureNativeRelayProvision(source, checkpoint, current, storage, api, signal) {
  signal?.throwIfAborted();
  validateAzureNativePendingAction(source, checkpoint.completedActionIds, checkpoint.pendingAction);
  const action = source.actions[checkpoint.completedActionIds.length];
  if (
    action?.kind !== 'relay-provision' ||
    !checkpoint.observationSnapshot ||
    checkpoint.engine !== 'native' ||
    source.engine !== 'native' ||
    checkpoint.planSha256 !== source.planSha256 ||
    checkpoint.planId !== source.planId ||
    checkpoint.state === 'complete' ||
    checkpoint.authorization?.apply !== true ||
    checkpoint.observationFingerprint !== fingerprintCheckpointObservation(checkpoint.observationSnapshot)
  )
    throw Error('Azure relay recovery requires the exact authorized partial native checkpoint');
  const previous = checkpoint.observationSnapshot;
  for (const observation of [previous, current]) {
    const ids = observation.resources.map((resource) => resource.id.toLowerCase());
    if (new Set(ids).size !== ids.length) throw Error('Azure relay recovery discovery contains duplicate resource IDs');
  }
  const relay = azureRelayPlanForDeployment(source);
  const inspected = await inspectAzureRelayNativeResources(source, relay, storage, api, signal);
  const authorized = new Map(inspected.resources.map((resource) => [String(resource.id).toLowerCase(), resource]));
  const newlyObserved = new Set();
  for (const resource of current.resources) {
    const id = resource.id.toLowerCase();
    const prior = previous.resources.find((item) => item.id.toLowerCase() === id);
    if (prior?.exists || !resource.exists) continue;
    const raw = authorized.get(id);
    if (!raw) continue;
    const properties = raw.properties;
    const tags = raw.tags ?? {};
    if (
      resource.location !== raw.location ||
      canonicalSha256(resource.tags) !== canonicalSha256(tags) ||
      resource.owned !==
        (tags['xcsh-managed-by'] === 'azure-ce' && tags['xcsh-deployment-id'] === source.deploymentName) ||
      canonicalSha256(resource.state) !== canonicalSha256({ provisioningState: properties.provisioningState }) ||
      (resource.etag !== undefined && resource.etag !== raw.etag)
    )
      throw Error('Azure relay recovery discovery differs from current exact cloud readback');
    newlyObserved.add(id);
  }
  const stable = (observation) => {
    const normalized = normalizeAzureDeploymentCapacity(source, observation);
    normalized.resources = normalized.resources.filter((resource) => !newlyObserved.has(resource.id.toLowerCase()));
    return fingerprintCheckpointObservation(normalized);
  };
  if (stable(previous) !== stable(current))
    throw Error('Stale Azure CE checkpoint: observations changed outside the submitted relay recovery boundary');
  signal?.throwIfAborted();
  return {
    ...checkpoint,
    completedActionIds: inspected.complete
      ? [...checkpoint.completedActionIds, action.id]
      : checkpoint.completedActionIds,
    pendingAction: inspected.complete ? undefined : checkpoint.pendingAction,
    failedActionId:
      inspected.complete && checkpoint.failedActionId === action.id ? undefined : checkpoint.failedActionId,
    observationFingerprint: fingerprintCheckpointObservation(current),
    observationSnapshot: structuredClone(current),
    state: inspected.complete
      ? checkpoint.completedActionIds.length + 1 === source.actions.length
        ? 'complete'
        : 'running'
      : checkpoint.state,
  };
}

// plugins/azure/src/ce/routing-workflow.ts
async function configureAzureRouteServerRouting(plan, expectedInterfaces, runtime, storage, api, signal, retained) {
  verifyAzureCePlan(plan);
  if (plan.routing.mode !== 'route-server') throw new Error('Azure Route Server routing is not selected');
  const binding = azureUpgradeBinding(plan);
  await storage.verify();
  const observed = await runtime.observeAzureInterfaces(binding, expectedInterfaces, signal);
  if (observed.status !== 'observed') throw new Error('Authoritative Azure platform interface evidence is unavailable');
  requireQualifiedUpInterfaceEvidence(observed, expectedInterfaces);
  const slo = observed.interfaces.filter((item) => item.role === 'slo');
  if (
    slo.length !== binding.nodes.length ||
    binding.nodes.some((node) => slo.filter((item) => item.node === node).length !== 1)
  )
    throw new Error('Exactly one authoritative SLO interface per Azure CE node is required');
  const routeServer = await discoverAzureRouteServerIdentity(plan, api, signal, retained);
  const interfaces = slo.map(({ node, interfaceName }) => ({ node, interfaceName }));
  await runtime.ensureAzureRouting(
    binding,
    plan.routing.localAsn,
    routeServer.asn,
    interfaces,
    routeServer.serviceAddresses,
    (record) => storage.write('platform-routing.json', record),
    signal,
  );
  const expectedSessions = interfaces.flatMap((item) =>
    routeServer.serviceAddresses.map((peerAddress) => ({ ...item, peerAddress })),
  );
  const sessions = await runtime.observeBgpSessions(binding, expectedSessions, signal);
  const effectiveRoutes = await runtime.observeBgpRoutes(binding, signal);
  const cloud = await collectAzureRouteServerHealth(plan, api, signal, retained);
  const routeExchange = cloud.status === 'healthy' ? 'healthy' : 'unknown';
  const evidence = {
    planId: plan.planId,
    planSha256: plan.planSha256,
    engine: plan.engine,
    siteName: plan.siteName,
    routeServerId: routeServer.routeServerId,
    serviceAddresses: routeServer.serviceAddresses,
    status:
      sessions.status === 'healthy' && effectiveRoutes.status === 'observed' && routeExchange === 'healthy'
        ? 'healthy'
        : 'unknown',
    sessions,
    routeExchange,
    effectiveRoutes,
    traffic: cloud.traffic,
    observedAt: new Date().toISOString(),
  };
  await storage.write('route-server-health.json', evidence);
  return evidence;
}

// plugins/azure/src/ce/terraform-apply.ts
import { createHash as createHash33 } from 'node:crypto';
import { join as join11 } from 'node:path';

// plugins/azure/src/ce/network-operational-acceptance.ts
function object6(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Malformed operational acceptance evidence');
  return value;
}

class AzureNetworkOperationalAcceptanceUnavailable extends Error {
  evidence;
  constructor(evidence) {
    super(`Operational evidence remains unqualified: ${evidence.missing.join(', ')}`);
    this.evidence = evidence;
  }
}
function createAzureNetworkOperationalAcceptance(session) {
  const { collect, authenticate } = session;
  const seal = () => {
    if (session.collect !== collect || session.authenticate !== authenticate)
      throw Error('Operational acceptance session changed');
  };
  const inspect = async (receipt, identity, mode, signal) => {
    signal?.throwIfAborted();
    seal();
    const reference = object6(receipt),
      purpose = reference.purpose;
    if (!['preflight', 'restored', 'final'].includes(String(purpose)))
      throw Error('Operational acquisition purpose differs');
    const expected = structuredClone(identity),
      referenceSha256 = canonicalSha256(receipt),
      identitySha256 = canonicalSha256(identity);
    const acquired = await authenticate.call(session, structuredClone(receipt), expected, purpose, mode, signal);
    seal();
    signal?.throwIfAborted();
    if (
      canonicalSha256(receipt) !== referenceSha256 ||
      canonicalSha256(identity) !== identitySha256 ||
      acquired.status !== 'authenticated' ||
      acquired.mode !== mode ||
      acquired.purpose !== purpose
    )
      throw Error('Operational acquisition identity changed');
    const readings = object6(acquired.readings),
      physical = object6(readings.identity),
      readiness = object6(readings.nodeReadiness),
      forwarding = object6(readings.forwarding),
      sessions = object6(readings.sessions),
      traffic = object6(readings.traffic);
    if (
      !canonicalEqual(readings.owner, expected.owner) ||
      readings.planSha256 !== expected.planSha256 ||
      readings.node !== expected.node ||
      readings.siteUid !== expected.siteUid ||
      physical.siteName !== expected.siteName ||
      physical.siteUid !== expected.siteUid ||
      physical.siteConfigurationSha256 !== expected.siteConfigurationSha256 ||
      physical.configurationSha256 !== expected.configurationSha256 ||
      physical.expectedInventorySha256 !== canonicalSha256(expected.inventory.nodes)
    )
      throw Error('Operational reading ownership or inventory differs');
    const registrations = object6(physical.registrations),
      registered = Array.isArray(registrations.nodes) ? registrations.nodes.map(object6) : [],
      instance = expected.inventory.nodes[String(expected.node)]?.vmId;
    const selected = registered.filter((row) => row.instanceId === instance);
    const missing = [];
    if (physical.status !== 'observed' || physical.canSatisfyInterfaceMutationGate !== true)
      missing.push('complete-current-up-interfaces');
    if (String(acquired.originalSampleFreshness) !== 'verified' || physical.freshness !== 'verified')
      missing.push('original-sample-freshness');
    if (
      selected.length !== 1 ||
      readiness.status !== 'observed' ||
      readiness.readiness !== 'ready' ||
      readiness.scope !== 'selected-node-vpm-readiness' ||
      readiness.node !== selected[0]?.node ||
      readiness.instanceId !== instance ||
      readiness.registration !== selected[0]?.registration ||
      readiness.siteUid !== expected.siteUid
    )
      missing.push('selected-node-readiness');
    if (
      object6(readings.routeExchange).status !== 'healthy' ||
      sessions.status !== 'healthy' ||
      sessions.establishedSessions !== sessions.expectedSessions ||
      typeof sessions.expectedSessions !== 'number' ||
      sessions.expectedSessions < 1
    )
      missing.push('complete-bgp-route-exchange');
    if (
      sessions.originalSampleFreshness !== 'verified' ||
      forwarding.freshness !== 'verified' ||
      forwarding.interfaceNamespace !== 'verified' ||
      forwarding.operationalAcceptance !== 'verified'
    )
      missing.push('qualified-forwarding-scope-and-freshness');
    if (
      traffic.status !== 'healthy' ||
      traffic.scope !== 'reviewed-vm-http-content-probe' ||
      traffic.planSha256 !== expected.planSha256
    )
      missing.push('current-reviewed-traffic');
    return {
      status: missing.length ? 'unknown' : 'verified',
      interfaceState: String(physical.interfaceState ?? 'unknown'),
      evidenceSha256: acquired.evidenceSha256,
      missing,
    };
  };
  const qualifyAcceptance = async (receipt, identity, mode, signal) => {
    const evidence = await inspect(receipt, identity, mode, signal);
    if (evidence.status !== 'verified')
      throw new AzureNetworkOperationalAcceptanceUnavailable({ ...evidence, status: 'unknown' });
    return { status: 'verified', scope: 'node-interfaces-routing-traffic', evidenceSha256: evidence.evidenceSha256 };
  };
  return Object.freeze({
    collectAcceptance: async (identity, purpose, signal) => {
      seal();
      signal?.throwIfAborted();
      const reference = await collect.call(session, identity, purpose, signal, true);
      seal();
      signal?.throwIfAborted();
      return reference;
    },
    inspect,
    qualifyAcceptance,
  });
}

// plugins/azure/src/ce/network-replacement-readings-session.ts
import { constants as constants3 } from 'node:fs';
import { lstat as lstat4, open as open3, readdir as readdir4, realpath as realpath3 } from 'node:fs/promises';
import { dirname as dirname2, join as join4 } from 'node:path';

// plugins/platform/src/ce/node-health.ts
function require3(value) {
  if (!value) throw Error('Node health schema, identity or evidence is unqualified');
}
function object7(value) {
  require3(value && typeof value === 'object' && !Array.isArray(value));
  return value;
}
var text = (v) =>
  typeof v === 'string' &&
  v.length > 0 &&
  v.length <= 256 &&
  v.trim() === v &&
  [...v].every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127) &&
  !['undefined', 'null'].includes(v);
var name2 = (v) =>
  typeof v === 'string' &&
  /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(v) &&
  !['global', 'all', 'undefined', 'null'].includes(v);
function parseNodeHealthJson(raw) {
  require3(typeof raw === 'string' && raw.length > 0 && raw.length <= 131072);
  let parsed;
  try {
    parsed = object7(JSON.parse(raw));
  } catch {
    throw Error('Node health JSON is malformed or ambiguous');
  }
  let offset = 0;
  const whitespace = () => {
    while (/\s/u.test(raw[offset] ?? '') && offset < raw.length) offset++;
  };
  const string = () => {
    const token = /"(?:\\.|[^"\\])*"/y;
    token.lastIndex = offset;
    const match = token.exec(raw);
    require3(match);
    offset = token.lastIndex;
    return JSON.parse(match[0]);
  };
  const value = (depth) => {
    require3(depth <= 64);
    whitespace();
    if (raw[offset] === '{') {
      offset++;
      whitespace();
      const keys = new Set();
      if (raw[offset] !== '}')
        while (true) {
          whitespace();
          const key = string();
          require3(!keys.has(key));
          keys.add(key);
          whitespace();
          require3(raw[offset++] === ':');
          value(depth + 1);
          whitespace();
          if (raw[offset] !== ',') break;
          offset++;
        }
      require3(raw[offset++] === '}');
    } else if (raw[offset] === '[') {
      offset++;
      whitespace();
      if (raw[offset] !== ']')
        while (true) {
          value(depth + 1);
          whitespace();
          if (raw[offset] !== ',') break;
          offset++;
        }
      require3(raw[offset++] === ']');
    } else if (raw[offset] === '"') string();
    else {
      const token = /(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/y;
      token.lastIndex = offset;
      const match = token.exec(raw);
      require3(match);
      if (/^-?[0-9]/u.test(match[0])) require3(Number.isFinite(Number(match[0])));
      offset = token.lastIndex;
    }
  };
  value(0);
  whitespace();
  require3(offset === raw.length);
  return parsed;
}
function validateExpectedNodeHealthIdentity(expected, nodes) {
  require3(
    text(expected.siteUid) &&
      name2(expected.node) &&
      nodes.includes(expected.node) &&
      [1, 3].includes(nodes.length) &&
      new Set(nodes).size === nodes.length,
  );
  const instances = object7(expected.instances);
  require3(
    Object.keys(instances).length === nodes.length &&
      nodes.every((node) => text(instances[node])) &&
      new Set(Object.values(instances)).size === nodes.length,
  );
}
function validateExpectedNodeHealth(expected, nodes) {
  validateExpectedNodeHealthIdentity(expected, nodes);
  require3(
    text(expected.expectedFqdn) &&
      expected.expectedFqdn.length <= 253 &&
      expected.expectedFqdn.startsWith(`${expected.node}.`) &&
      expected.expectedFqdn.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)),
  );
}

// plugins/azure/src/ce/network-replacement-operational-identity.ts
// plugins/azure/src/ce/network-replacement-bgp.ts
import { createHash, createHash as createHash20 } from 'node:crypto';
import { isIP as isIP3 } from 'node:net';

function require4(value) {
  if (!value) throw Error('Replacement BGP owner, identity or complete scope differs');
}
function object8(value) {
  require4(value && typeof value === 'object' && !Array.isArray(value));
  return value;
}
var lower = (value) => (typeof value === 'string' ? value.toLowerCase() : '');
var sha = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
async function collectAzureReplacementBgp(request, expected, retainedSource, physical, cloud, runtime, signal) {
  signal?.throwIfAborted();
  const plan = structuredClone(request),
    identity = structuredClone(expected),
    source = structuredClone(retainedSource),
    interfaces = structuredClone(physical),
    binding = azureUpgradeBinding(plan);
  const profile = verifyAzureTerraformNetworkReplacementProfile(plan);
  const refs = [cloud.exec, runtime.observeBgpSessions, runtime.observeBgpRoutes];
  const snapshots = [request, expected, retainedSource, physical].map(canonicalSha256);
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    require4(
      refs.every((fn, index) => fn === [cloud.exec, runtime.observeBgpSessions, runtime.observeBgpRoutes][index]) &&
        canonicalEqual(snapshots, [request, expected, retainedSource, physical].map(canonicalSha256)),
    );
  };
  const step = async (work) => {
    seal();
    const aborted = Promise.withResolvers(),
      abort = () => aborted.reject(deadline.reason);
    deadline.addEventListener('abort', abort, { once: true });
    try {
      const value = await Promise.race([Promise.resolve().then(work), aborted.promise]);
      seal();
      return value;
    } finally {
      deadline.removeEventListener('abort', abort);
    }
  };
  require4(
    identity.planSha256 === plan.planSha256 &&
      canonicalEqual(identity.owner, binding.owner) &&
      source.planSha256 === plan.planSha256 &&
      source.originalPlanSha256 === profile.originalPlanSha256 &&
      source.retainedPlanSha256 === profile.retainedPlanSha256 &&
      canonicalEqual(source.owner, identity.owner) &&
      canonicalEqual(source.site, identity.site) &&
      canonicalSha256(source) === identity.sourceBindingSha256 &&
      createHash('sha256').update(source.source).digest('hex') === source.sourceConfigurationSha256,
  );
  require4(
    canonicalEqual(
      Object.keys(identity.nodes).sort(),
      Array.from({ length: plan.topology.nodeCount }, (_, i) => String(i + 1)).sort(),
    ) &&
      interfaces.length === plan.topology.nodeCount * plan.nics.length &&
      new Set(interfaces.map((row) => row.mac)).size === interfaces.length,
  );
  for (const [index, node] of binding.nodes.entries()) {
    const rows = interfaces.filter((row) => row.node === node);
    require4(
      rows.length === plan.nics.length &&
        new Set(rows.map((row) => row.device)).size === rows.length &&
        new Set(rows.map((row) => row.interfaceName)).size === rows.length,
    );
    for (const nic of plan.nics) {
      const current = identity.nodes[String(index + 1)]?.nics[String(nic.index)],
        matches = rows.filter((row) => row.role === nic.role);
      require4(
        current &&
          matches.length === 1 &&
          matches[0].mac === current.mac &&
          typeof matches[0].device === 'string' &&
          /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(matches[0].device) &&
          typeof matches[0].interfaceName === 'string' &&
          /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(matches[0].interfaceName) &&
          !matches[0].interfaceName.includes('__'),
      );
    }
  }
  const base = {
    scope: 'replacement-bgp-route-observations',
    owner: structuredClone(identity.owner),
    planSha256: plan.planSha256,
    expectedIdentitySha256: canonicalSha256(identity),
    originalSampleFreshness: 'unqualified',
    forwarding: 'unknown',
    traffic: 'unknown',
    operationalAcceptance: 'unknown',
  };
  if (plan.routing.mode !== 'route-server')
    return { ...base, status: 'not-applicable', reason: 'route-server-unconfigured' };
  const unknown = (reason) => ({ status: 'unknown', reason });
  let routeExchange = unknown('retained-route-server-unavailable'),
    sessions = unknown('complete-ce-bgp-sessions-unavailable'),
    routes = unknown('complete-ce-bgp-routes-unavailable');
  const read = async (args) => {
    const result = await step(() =>
      cloud.exec('az', [...args, '--subscription', plan.subscription.id, '--output', 'json'], { signal: deadline }),
    );
    require4(result.exitCode === 0);
    return object8(JSON.parse(result.stdout));
  };
  let serviceAddresses = [];
  const serverArgs = [
    'network',
    'routeserver',
    'show',
    '--resource-group',
    plan.intent.resourceGroup,
    '--name',
    plan.deploymentName + '-rs',
  ];
  const serverIdentity = (row) => ({
    id: lower(row.id),
    location: lower(row.location),
    state: row.provisioningState,
    asn: row.virtualRouterAsn,
    ips: Array.isArray(row.virtualRouterIps) ? [...row.virtualRouterIps].sort() : row.virtualRouterIps,
    tags: row.tags,
  });
  const peerIdentity = (row) => ({
    id: lower(row.id),
    name: row.name,
    state: row.provisioningState,
    asn: row.peerAsn,
    ip: row.peerIp,
  });
  let retainedServer;
  const retainedPeers = [];
  const serverId =
    '/subscriptions/' +
    plan.subscription.id +
    '/resourceGroups/' +
    plan.intent.resourceGroup +
    '/providers/Microsoft.Network/virtualHubs/' +
    plan.deploymentName +
    '-rs';
  const peers = [];
  try {
    const configuration = object8(JSON.parse(source.source)),
      resources = object8(configuration.resource),
      serverConfig = object8(object8(resources.azurerm_route_server).ce);
    const expectedTags = object8(serverConfig.tags),
      ownerPlan = expectedTags['xcsh-plan-sha256'];
    require4(
      sha(ownerPlan) &&
        expectedTags['xcsh-managed-by'] === 'azure-ce' &&
        expectedTags['xcsh-execution-engine'] === 'terraform' &&
        expectedTags['xcsh-deployment-id'] === plan.deploymentName,
    );
    const server = await read(serverArgs),
      tags = object8(server.tags),
      ips = server.virtualRouterIps;
    require4(
      lower(server.id) === lower(serverId) &&
        lower(server.location) === lower(plan.region) &&
        server.provisioningState === 'Succeeded' &&
        server.virtualRouterAsn === 65515 &&
        canonicalEqual(tags, expectedTags) &&
        Array.isArray(ips) &&
        ips.length === 2 &&
        new Set(ips).size === 2 &&
        ips.every((ip) => typeof ip === 'string' && isIP3(ip) === 4),
    );
    retainedServer = serverIdentity(server);
    serviceAddresses = [...ips].sort();
    const sloIndices = plan.nics.filter((nic) => nic.role === 'slo');
    require4(sloIndices.length === 1);
    for (let node = 1; node <= plan.topology.nodeCount; node++) {
      const name = plan.deploymentName + '-' + node,
        nic = identity.nodes[String(node)]?.nics[String(sloIndices[0].index)];
      const observed = interfaces.filter((row) => row.node === name && row.role === 'slo');
      require4(nic && isIP3(nic.privateIp) === 4 && observed.length === 1 && observed[0].mac === nic.mac);
      const common = [
        '--resource-group',
        plan.intent.resourceGroup,
        '--routeserver',
        plan.deploymentName + '-rs',
        '--name',
        name,
      ];
      const peerArgs = ['network', 'routeserver', 'peering', 'show', ...common],
        peer = await read(peerArgs);
      retainedPeers.push({ args: peerArgs, identity: peerIdentity(peer) });
      require4(
        lower(peer.id) === lower(serverId + '/bgpConnections/' + name) &&
          peer.name === name &&
          peer.provisioningState === 'Succeeded' &&
          peer.peerAsn === plan.routing.localAsn &&
          peer.peerIp === nic.privateIp,
      );
      const learned = await read(['network', 'routeserver', 'peering', 'list-learned-routes', ...common]);
      require4(!learned.nextLink && !learned.nextPageToken && !learned.error);
      const roles = Object.keys(learned)
        .filter((key) => /^RouteServiceRole_IN_[01]$/.test(key))
        .sort();
      require4(roles.length === 2);
      const observations = roles.map((role) => {
        const rows = learned[role];
        require4(Array.isArray(rows));
        const values = rows.map(object8);
        require4(
          values.every((row) => {
            if (typeof row.network !== 'string' || typeof row.nextHop !== 'string' || isIP3(row.nextHop) !== 4)
              return false;
            const [address, prefix, extra] = row.network.split('/');
            return extra === undefined && isIP3(address) === 4 && /^(?:[0-9]|[12][0-9]|3[0-2])$/.test(prefix);
          }),
        );
        require4(
          new Set(values.map((row) => canonicalSha256({ network: row.network, nextHop: row.nextHop }))).size ===
            values.length,
        );
        const matchedPrefixes = plan.routing.destinationCidrs.filter(
          (prefix) => values.filter((row) => row.network === prefix && row.nextHop === nic.privateIp).length === 1,
        );
        return { role, routeCount: values.length, matchedPrefixes };
      });
      require4(
        plan.routing.destinationCidrs.length > 0 &&
          observations.every((row) => row.matchedPrefixes.length === plan.routing.destinationCidrs.length),
      );
      peers.push({ node: name, peerIp: nic.privateIp, mac: nic.mac, roles: observations });
    }
    routeExchange = {
      status: 'healthy',
      scope: 'retained-route-server-control-plane',
      routeServerId: serverId,
      ownerPlanSha256: ownerPlan,
      serviceAddresses,
      peers,
    };
  } catch {
    seal();
  }
  if (routeExchange.status === 'healthy') {
    const wanted = binding.nodes.flatMap((node) => {
      const matches = interfaces.filter((row) => row.node === node && row.role === 'slo');
      require4(matches.length === 1);
      return serviceAddresses.map((peerAddress) => ({ node, interfaceName: matches[0].interfaceName, peerAddress }));
    });
    try {
      const reader = runtime.observeBgpSessions;
      require4(typeof reader === 'function');
      const value = await step(() => reader.call(runtime, structuredClone(binding), structuredClone(wanted), deadline));
      require4(
        canonicalEqual(value.owner, binding.owner) &&
          value.siteName === binding.siteName &&
          value.expectedSessions === wanted.length &&
          value.sessions.length === wanted.length,
      );
      const observations = wanted.map((target) => {
        const matches = value.sessions.filter(
          (row) =>
            row.node === target.node &&
            row.interfaceName === target.interfaceName &&
            row.peerAddress === target.peerAddress,
        );
        require4(matches.length === 1);
        const row = matches[0];
        require4(
          [
            'Unknown',
            'Idle',
            'Connect',
            'Active',
            'OpenSent',
            'OpenConfirm',
            'Established',
            'Clearing',
            'Deleted',
          ].includes(row.state) &&
            Number.isSafeInteger(row.receivedPrefixCount) &&
            row.receivedPrefixCount >= 0 &&
            Number.isSafeInteger(row.advertisedPrefixCount) &&
            row.advertisedPrefixCount >= 0 &&
            typeof row.stateChangedAt === 'string' &&
            Number.isFinite(Date.parse(row.stateChangedAt)),
        );
        return {
          ...target,
          state: row.state,
          receivedPrefixCount: row.receivedPrefixCount,
          advertisedPrefixCount: row.advertisedPrefixCount,
          stateChangedAt: row.stateChangedAt,
        };
      });
      const established = observations.filter((row) => row.state === 'Established').length;
      require4(
        value.establishedSessions === established &&
          value.status === (established === wanted.length ? 'healthy' : 'degraded'),
      );
      sessions = {
        status: observations.some((row) => row.state === 'Unknown') ? 'unknown' : value.status,
        expectedSessions: wanted.length,
        establishedSessions: established,
        sessions: observations,
        originalSampleFreshness: 'unqualified',
      };
    } catch {
      seal();
    }
    try {
      const reader = runtime.observeBgpRoutes;
      require4(typeof reader === 'function');
      const value = await step(() => reader.call(runtime, structuredClone(binding), deadline));
      require4(
        canonicalEqual(value.owner, binding.owner) &&
          value.siteName === binding.siteName &&
          value.status === 'observed' &&
          value.nodes.length === binding.nodes.length &&
          binding.nodes.every((node) => value.nodes.filter((row) => row.node === node).length === 1),
      );
      const inventory = parseBgpRoutes(
        {
          ver: value.nodes.map((node) => ({
            name: node.node,
            ri_table: node.routingInstances.map((instance) => ({
              routing_instance: instance.name,
              rt_table: instance.tables.map((table) => ({
                name: table.name,
                imported: table.imported.map((subnet) => ({ subnet })),
                exported: table.exported.map((subnet) => ({ subnet })),
              })),
            })),
          })),
        },
        binding.nodes,
      );
      require4(canonicalEqual(inventory.nodes, value.nodes));
      routes = {
        status: 'observed',
        scope: 'all-node-bgp-route-inventory',
        evidenceSha256: canonicalSha256(value.nodes),
        originalSampleFreshness: 'unqualified',
      };
    } catch {
      seal();
    }
  }
  if (routeExchange.status === 'healthy') {
    try {
      require4(retainedServer && canonicalEqual(retainedServer, serverIdentity(await read(serverArgs))));
      for (const peer of retainedPeers) require4(canonicalEqual(peer.identity, peerIdentity(await read(peer.args))));
    } catch {
      seal();
      routeExchange = unknown('retained-route-server-identity-unavailable-or-changed');
    }
  }
  seal();
  return {
    ...base,
    status:
      routeExchange.status === 'healthy' && sessions.status === 'healthy' && routes.status === 'observed'
        ? 'observed'
        : 'unknown',
    routeExchange,
    sessions,
    routes,
  };
}

// plugins/azure/src/ce/network-forwarding-readings.ts
var same2 = canonicalEqual;
function require5(value) {
  if (!value) throw Error('Forwarding reading identity differs');
}
function object9(value) {
  require5(value && typeof value === 'object' && !Array.isArray(value));
  return value;
}
function rows(value) {
  require5(Array.isArray(value));
  return value.map(object9);
}
var stable = (values) => values.map(canonicalSha256).toSorted();
async function collectAzureNetworkForwardingReading(binding, expected, runtime, signal) {
  const identity = structuredClone(binding),
    wanted = structuredClone(expected);
  validateExpectedForwardingRoutes(wanted, identity.nodes);
  const expectedReads = wanted.interfaces.map((row) => ({
    method: 'POST',
    path: `/api/operate/namespaces/system/sites/${identity.siteName}/ver/simplified_routes`,
    body: { namespace: 'system', site: identity.siteName, node: row.node, family: 'INET4', [row.role]: {} },
  }));
  const read = async () => {
    signal?.throwIfAborted();
    const value = object9(
      await runtime.observeForwardingRoutes(structuredClone(identity), structuredClone(wanted), signal),
    );
    signal?.throwIfAborted();
    require5(
      value.status === 'observed' &&
        same2(value.owner, identity.owner) &&
        value.siteName === identity.siteName &&
        value.siteUid === wanted.siteUid &&
        value.scope === 'reported-forwarding-interface' &&
        value.interfaceNamespace === 'unqualified' &&
        value.freshness === 'unqualified' &&
        value.operationalAcceptance === 'unknown' &&
        typeof value.contractFingerprint === 'string' &&
        /^sha256:[a-f0-9]{64}$/.test(value.contractFingerprint) &&
        same2(value.reads, expectedReads),
    );
    const observed = rows(value.routes);
    require5(observed.length === wanted.routes.length);
    const routes = wanted.routes.map((route) => {
      const matches = observed.filter(
        (row) =>
          row.node === route.node &&
          row.role === route.role &&
          row.prefix === route.prefix &&
          row.routeType === route.routeType,
      );
      require5(matches.length === 1);
      const row = matches[0];
      require5(
        Array.isArray(row.flags) &&
          row.flags.every(
            (flag) =>
              typeof flag === 'string' &&
              flag.length > 0 &&
              flag.length <= 1024 &&
              [...flag].every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127),
          ) &&
          new Set(row.flags).size === row.flags.length,
      );
      const hops = rows(row.interfaces),
        seen = new Set();
      require5(hops.length > 0 && hops.length <= wanted.interfaces.length);
      const interfaces = hops.map((hop) => {
        const matches = wanted.interfaces.filter(
          (iface) =>
            iface.node === route.node &&
            iface.role === route.role &&
            iface.node === hop.node &&
            iface.role === hop.role &&
            iface.mac === hop.mac &&
            iface.device === hop.device &&
            iface.interfaceName === hop.interfaceName,
        );
        require5(matches.length === 1 && !seen.has(matches[0].mac));
        const iface = matches[0];
        seen.add(iface.mac);
        require5(
          (hop.kind === 'local' || hop.kind === 'subnet') &&
            (hop.reportedInterface === iface.device || hop.reportedInterface === iface.interfaceName) &&
            same2(
              hop.matchedFields,
              ['device', 'interfaceName'].filter((field) => iface[field] === hop.reportedInterface),
            ),
        );
        return {
          ...iface,
          kind: hop.kind,
          reportedInterface: hop.reportedInterface,
          matchedFields: [...hop.matchedFields],
        };
      });
      return {
        ...route,
        flags: [...row.flags].toSorted(),
        interfaces: interfaces.toSorted((a, b) => a.mac.localeCompare(b.mac)),
      };
    });
    return { contractFingerprint: value.contractFingerprint, routes };
  };
  const first = await read(),
    second = await read();
  require5(
    first.contractFingerprint === second.contractFingerprint && same2(stable(first.routes), stable(second.routes)),
  );
  return {
    status: 'observed',
    scope: 'reported-forwarding-interface',
    interfaceNamespace: 'unqualified',
    freshness: 'unqualified',
    operationalAcceptance: 'unknown',
    contractFingerprint: second.contractFingerprint,
    evidenceSha256: canonicalSha256(stable(second.routes)),
    routeCount: second.routes.length,
    observationRequests: expectedReads.length * 2,
  };
}

// plugins/azure/src/ce/network-replacement-forwarding.ts
function require6(value) {
  if (!value) throw Error('Replacement forwarding source or physical identity differs');
}
function resolveAzureReplacementForwardingExpectations(plan, retained, identity, interfaces) {
  const profile = verifyAzureTerraformNetworkReplacementProfile(plan);
  verifyAzureCePlan(retained);
  const retainedOriginal =
    retained.intent.operation === 'update-network'
      ? verifyAzureTerraformNetworkProfile(retained).originalPlanSha256
      : verifyAzureTerraformNetworkReplacementProfile(retained).originalPlanSha256;
  const binding = azureUpgradeBinding(plan);
  require6(
    profile.retainedPlanSha256 === retained.planSha256 &&
      retainedOriginal === profile.originalPlanSha256 &&
      canonicalEqual(azureUpgradeBinding(retained), binding) &&
      canonicalEqual(azureTerraformNetworkScope(plan, false), azureTerraformNetworkScope(retained, false)) &&
      identity.planSha256 === plan.planSha256 &&
      canonicalEqual(identity.owner, binding.owner) &&
      typeof identity.site.siteUid === 'string' &&
      identity.site.siteUid.trim(),
  );
  const desired = retained.routing.forwardingRoutes;
  if (desired === undefined) {
    require6(plan.routing.forwardingRoutes === undefined && plan.intent.routing.forwardingRoutes === undefined);
    return;
  }
  const normalized = normalizeAzureForwardingExpectations(
    desired,
    plan.topology.nodeCount,
    plan.nics.map((row) => row.role),
  );
  require6(
    canonicalEqual(desired, normalized) &&
      canonicalEqual(retained.intent.routing.forwardingRoutes, normalized) &&
      canonicalEqual(plan.routing.forwardingRoutes, normalized) &&
      canonicalEqual(plan.intent.routing.forwardingRoutes, normalized),
  );
  const physical = binding.nodes.flatMap((node, index) =>
    ['slo', 'sli'].map((role) => {
      const nics = plan.nics.filter((row) => row.role === role);
      require6(nics.length === 1);
      const expected = identity.nodes[String(index + 1)]?.nics[String(nics[0].index)];
      const matches = interfaces.filter((row) => row.node === node && row.role === role);
      require6(
        expected &&
          matches.length === 1 &&
          matches[0].mac === expected.mac &&
          typeof matches[0].device === 'string' &&
          matches[0].device.trim() &&
          typeof matches[0].interfaceName === 'string' &&
          matches[0].interfaceName.trim(),
      );
      const row = matches[0];
      return { node, role, mac: row.mac, device: row.device, interfaceName: row.interfaceName };
    }),
  );
  require6(interfaces.filter((row) => row.role === 'slo' || row.role === 'sli').length === physical.length);
  const routes = binding.nodes.flatMap((node, index) =>
    normalized.after.filter((row) => row.node === index + 1).map((row) => ({ ...row, node })),
  );
  const result = { siteUid: identity.site.siteUid, interfaces: physical, routes };
  validateExpectedForwardingRoutes(result, binding.nodes);
  return result;
}
async function collectAzureReplacementForwarding(request, predecessor, expected, physical, runtime, signal) {
  const plan = structuredClone(request),
    retained = structuredClone(predecessor),
    identity = structuredClone(expected),
    interfaces = structuredClone(physical),
    reader = runtime.observeForwardingRoutes;
  const snapshots = [
    canonicalSha256(request),
    canonicalSha256(predecessor),
    canonicalSha256(expected),
    canonicalSha256(physical),
  ];
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    require6(
      runtime.observeForwardingRoutes === reader &&
        canonicalEqual(snapshots, [
          canonicalSha256(request),
          canonicalSha256(predecessor),
          canonicalSha256(expected),
          canonicalSha256(physical),
        ]),
    );
  };
  seal();
  const wanted = resolveAzureReplacementForwardingExpectations(plan, retained, identity, interfaces);
  const base = {
    scope: 'replacement-reviewed-forwarding',
    owner: structuredClone(identity.owner),
    planSha256: identity.planSha256,
    retainedPlanSha256: retained.planSha256,
    expectedIdentitySha256: canonicalSha256(identity),
    interfaceNamespace: 'unqualified',
    freshness: 'unqualified',
    operationalAcceptance: 'unknown',
  };
  if (!wanted) return { ...base, status: 'unknown', reason: 'reviewed-forwarding-unconfigured' };
  if (typeof reader !== 'function') return { ...base, status: 'unknown', reason: 'forwarding-observer-unavailable' };
  const aborted = Promise.withResolvers(),
    abort = () => aborted.reject(deadline.reason);
  deadline.addEventListener('abort', abort, { once: true });
  try {
    const observations = await Promise.race([
      collectAzureNetworkForwardingReading(
        azureUpgradeBinding(plan),
        wanted,
        { observeForwardingRoutes: reader.bind(runtime) },
        deadline,
      ),
      aborted.promise,
    ]);
    seal();
    return {
      ...base,
      status: 'observed',
      observations,
      expectedRoutesSha256: canonicalSha256(wanted),
      reason: 'reported-forwarding-only-not-operational-acceptance',
    };
  } catch {
    seal();
    return { ...base, status: 'unknown', reason: 'reviewed-forwarding-evidence-unverified' };
  } finally {
    deadline.removeEventListener('abort', abort);
  }
}

// plugins/azure/src/ce/network-replacement-node-readiness.ts
function object10(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Malformed replacement readiness');
  return value;
}
function require7(value) {
  if (!value) throw Error('Replacement readiness identity or scope differs');
}
var sha2 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
async function collectAzureReplacementNodeReadiness(request, expected, registrations, runtime, signal) {
  const plan = structuredClone(request),
    identity = structuredClone(expected),
    registered = structuredClone(registrations ?? null);
  verifyAzureTerraformNetworkReplacementProfile(plan);
  const binding = azureUpgradeBinding(plan),
    reader = runtime.observeNodeReadiness;
  const planSha = canonicalSha256(request),
    identitySha = canonicalSha256(expected),
    registeredSha = canonicalSha256(registrations ?? null);
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    require7(
      runtime.engine === 'terraform' &&
        runtime.observeNodeReadiness === reader &&
        canonicalSha256(request) === planSha &&
        canonicalSha256(expected) === identitySha &&
        canonicalSha256(registrations ?? null) === registeredSha &&
        canonicalEqual(identity.owner, binding.owner) &&
        identity.planSha256 === plan.planSha256,
    );
  };
  const bounded = async (work) => {
    seal();
    const aborted = Promise.withResolvers(),
      abort = () => aborted.reject(deadline.reason);
    deadline.addEventListener('abort', abort, { once: true });
    try {
      const value = await Promise.race([Promise.resolve().then(work), aborted.promise]);
      seal();
      return value;
    } finally {
      deadline.removeEventListener('abort', abort);
    }
  };
  seal();
  const base = {
    schemaVersion: 1,
    scope: 'all-replacement-node-vpm-readiness',
    owner: structuredClone(binding.owner),
    planSha256: plan.planSha256,
    siteUid: identity.site.siteUid,
    expectedIdentitySha256: identitySha,
    originalSampleFreshness: 'unqualified',
    nodeHealth: 'unknown',
    routingTrafficQualified: false,
    canSatisfyInterfaceMutationGate: false,
  };
  let rows;
  try {
    const value = object10(registered);
    require7(value.status === 'observed' && Array.isArray(value.nodes) && value.nodes.length === binding.nodes.length);
    rows = value.nodes.map(object10);
    const instances = binding.nodes.map((node, index) => ({
      node,
      instanceId: identity.nodes[String(index + 1)]?.vmId,
    }));
    require7(
      new Set(instances.map((row) => row.instanceId)).size === binding.nodes.length &&
        instances.every(
          (wanted) =>
            typeof wanted.instanceId === 'string' &&
            /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(wanted.instanceId) &&
            rows.filter(
              (row) =>
                row.node === wanted.node &&
                row.instanceId === wanted.instanceId &&
                row.state === 'ONLINE' &&
                typeof row.registration === 'string' &&
                row.registration.trim(),
            ).length === 1,
        ),
    );
  } catch {
    seal();
    return {
      ...base,
      status: 'unknown',
      readiness: 'unknown',
      nodes: [],
      reason: 'complete-registrations-unavailable',
    };
  }
  const instances = Object.fromEntries(
    binding.nodes.map((node, index) => [node, identity.nodes[String(index + 1)].vmId]),
  );
  const nodes = [];
  for (const node of binding.nodes) {
    let result = {
      node,
      instanceId: instances[node],
      status: 'unknown',
      readiness: 'unknown',
      reason: 'node-readiness-unavailable',
    };
    try {
      require7(typeof reader === 'function');
      const registration = rows.find((row) => row.node === node);
      const value = object10(
        await bounded(() =>
          reader.call(
            runtime,
            structuredClone(binding),
            { siteUid: identity.site.siteUid, node, instances: { ...instances } },
            deadline,
          ),
        ),
      );
      require7(
        value.status === 'observed' &&
          canonicalEqual(value.owner, binding.owner) &&
          value.siteName === binding.siteName &&
          value.siteUid === identity.site.siteUid &&
          value.node === node &&
          value.instanceId === instances[node] &&
          value.registration === registration?.registration &&
          value.scope === 'selected-node-vpm-readiness' &&
          value.originalSampleFreshness === 'unqualified' &&
          value.canSatisfyInterfaceMutationGate === false &&
          value.allNodeHealthQualified === false &&
          value.routingTrafficQualified === false &&
          value.source ===
            '/api/operate/namespaces/system/sites/' + binding.siteName + '/vpm/debug/' + node + '/exec-user' &&
          sha2(value.outputSha256) &&
          sha2(value.bindingOutputSha256) &&
          ['WAITING_FOR_CONFIG', 'WAITING_FOR_APPROVAL', 'PROVISIONING', 'PROVISIONED', 'FAILED', 'RESETTING'].includes(
            String(value.state),
          ) &&
          value.readiness === (value.state === 'PROVISIONED' ? 'ready' : 'not-ready') &&
          Array.isArray(value.roles) &&
          value.roles.length > 0 &&
          value.roles.length <= 32 &&
          new Set(value.roles).size === value.roles.length &&
          [value.softwareVersion, value.osVersion, value.vpmVersion, ...value.roles].every(
            (text) => typeof text === 'string' && text.trim() && text.length <= 256,
          ),
      );
      validateExpectedNodeHealth(
        { siteUid: identity.site.siteUid, node, instances, expectedFqdn: value.fqdn },
        binding.nodes,
      );
      result = {
        node,
        instanceId: instances[node],
        registration: value.registration,
        status: 'observed',
        readiness: value.readiness,
        state: value.state,
        fqdn: value.fqdn,
        softwareVersion: value.softwareVersion,
        osVersion: value.osVersion,
        vpmVersion: value.vpmVersion,
        roles: [...value.roles],
        source: value.source,
        outputSha256: value.outputSha256,
        bindingOutputSha256: value.bindingOutputSha256,
      };
    } catch {
      seal();
    }
    nodes.push(result);
  }
  seal();
  const complete = nodes.every((row) => row.status === 'observed');
  return {
    ...base,
    status: complete ? 'observed' : 'unknown',
    readiness: !complete ? 'unknown' : nodes.every((row) => row.readiness === 'ready') ? 'ready' : 'not-ready',
    nodes,
    reason: complete ? 'readiness-only-not-operational-acceptance' : 'node-readiness-unavailable',
  };
}

// plugins/azure/src/ce/operational-identity-joins.ts
import { isIP as isIP4 } from 'node:net';

var same3 = canonicalEqual;
function require8(value, message) {
  if (!value) throw Error(`Azure network operational identity: ${message}`);
}
function object11(value) {
  require8(value && typeof value === 'object' && !Array.isArray(value), 'malformed evidence');
  return value;
}
async function collectAzureOperationalIdentityJoins(
  base,
  binding,
  identity,
  instances,
  interfaces,
  runtime,
  observeCloud,
  signal,
) {
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const bounded = async (task) => {
    deadline.throwIfAborted();
    const abort = Promise.withResolvers();
    const onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([task(), abort.promise]);
      deadline.throwIfAborted();
      return result;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  let phase = 'cloud-identity';
  try {
    const cloud = () => bounded(() => observeCloud(deadline));
    const site = async () => {
      const value = object11(await bounded(() => runtime.observeOwnedSite(binding, deadline)));
      const metadata = object11(value.metadata),
        system = object11(value.system_metadata);
      require8(
        metadata.name === binding.siteName &&
          metadata.namespace === 'system' &&
          system.uid === identity.siteUid &&
          canonicalSha256(runtime.ownedSiteConfiguration(binding, value)) === identity.siteConfigurationSha256,
        'current owned site differs',
      );
      return {
        siteUid: system.uid,
        siteConfigurationSha256: canonicalSha256(runtime.ownedSiteConfiguration(binding, value)),
      };
    };
    const links = async () => {
      const value = await bounded(() => runtime.observeAzureInterfaces(binding, structuredClone(interfaces), deadline));
      require8(
        ['observed', 'down', 'unknown'].includes(value.status) && Array.isArray(value.interfaces),
        'malformed interface observation',
      );
      if (value.status === 'unknown')
        return {
          status: 'unknown',
          interfaces: [],
          freshness: 'unqualified',
          canSatisfyInterfaceMutationGate: false,
        };
      require8(value.interfaces.length === interfaces.length, 'partial interface observation');
      const devices = new Set(),
        objects = new Set();
      for (const wanted of interfaces) {
        const rows = value.interfaces.filter(
          (row) => row.node === wanted.node && row.role === wanted.role && row.mac === wanted.mac,
        );
        require8(rows.length === 1, 'foreign or duplicate interface observation');
        const row = rows[0];
        require8(
          typeof row.device === 'string' &&
            /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(row.device) &&
            typeof row.interfaceName === 'string' &&
            /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(row.interfaceName) &&
            typeof row.linkUp === 'boolean' &&
            Number.isInteger(row.mtu) &&
            (row.mtu === 0 || (row.mtu >= 576 && row.mtu <= 8000)) &&
            !devices.has(`${row.node}/${row.device}`) &&
            !objects.has(row.interfaceName),
          'incomplete or duplicate device/object identity',
        );
        require8(
          row.ipv4 === null ||
            (row.ipv4 &&
              isIP4(row.ipv4.address) === 4 &&
              Number.isInteger(row.ipv4.prefixLength) &&
              row.ipv4.prefixLength >= 0 &&
              row.ipv4.prefixLength <= 32),
          'malformed interface IPv4 observation',
        );
        devices.add(`${row.node}/${row.device}`);
        objects.add(row.interfaceName);
      }
      require8(
        value.status === (value.interfaces.every((row) => row.linkUp) ? 'observed' : 'down'),
        'interface state disagrees with explicit links',
      );
      let canSatisfyInterfaceMutationGate = false;
      try {
        requireQualifiedUpInterfaceEvidence(value, interfaces);
        canSatisfyInterfaceMutationGate = true;
      } catch {}
      return {
        status: value.status,
        freshness: value.freshness === 'verified' ? 'verified' : 'unqualified',
        canSatisfyInterfaceMutationGate,
        interfaces: interfaces.map((wanted) => {
          const row = value.interfaces.find((v) => v.node === wanted.node && v.role === wanted.role);
          return {
            ...wanted,
            device: row.device,
            interfaceName: row.interfaceName,
            mtu: row.mtu,
            linkUp: row.linkUp,
            ipv4: row.ipv4 === null ? null : { address: row.ipv4.address, prefixLength: row.ipv4.prefixLength },
          };
        }),
      };
    };
    const registrations = async () => {
      const value = object11(await bounded(() => runtime.observeRegistrations(binding, { ...instances }, deadline)));
      if (value.status !== 'healthy') return { status: 'unknown', nodes: [] };
      require8(
        same3(value.owner, binding.owner) &&
          value.siteName === binding.siteName &&
          Array.isArray(value.nodes) &&
          value.nodes.length === binding.nodes.length,
        'registration owner or cardinality differs',
      );
      for (const node of binding.nodes) {
        const rows = value.nodes.map(object11).filter((row) => row.node === node);
        require8(
          rows.length === 1 &&
            rows[0].instanceId === instances[node] &&
            rows[0].state === 'ONLINE' &&
            rows[0].status === 'healthy' &&
            typeof rows[0].registration === 'string' &&
            rows[0].registration.trim(),
          'registration UUID/node/state differs',
        );
      }
      return {
        status: 'observed',
        nodes: value.nodes.map((raw) => {
          const row = object11(raw);
          return { node: row.node, instanceId: row.instanceId, state: row.state, registration: row.registration };
        }),
      };
    };
    const cloudSha256 = await cloud();
    phase = 'site-identity';
    const initialSite = await site();
    phase = 'registrations';
    const registered = await registrations();
    phase = 'interfaces';
    const initialLinks = await links();
    phase = 'final-registrations';
    const finalRegistrations = await registrations();
    phase = 'final-interfaces';
    const finalLinks = await links();
    require8(
      same3(registered, finalRegistrations) && same3(initialLinks, finalLinks),
      'CE identities or state changed during observation',
    );
    phase = 'final-site-identity';
    require8(same3(initialSite, await site()), 'site identity changed during observation');
    phase = 'final-cloud-identity';
    require8(cloudSha256 === (await cloud()), 'cloud identity changed during observation');
    deadline.throwIfAborted();
    return {
      ...base,
      status: registered.status === 'observed' ? finalLinks.status : 'unknown',
      interfaceState: finalLinks.status,
      freshness: finalLinks.freshness,
      canSatisfyInterfaceMutationGate: registered.status === 'observed' && finalLinks.canSatisfyInterfaceMutationGate,
      cloudEvidenceSha256: cloudSha256,
      registrations: registered,
      interfaces: finalLinks.interfaces,
      reason:
        registered.status !== 'observed'
          ? 'registrations-unverified'
          : finalLinks.status === 'unknown'
            ? 'interfaces-unverified'
            : finalLinks.freshness === 'verified'
              ? 'node-health-routing-and-traffic-unqualified'
              : 'operational-health-and-publication-freshness-unqualified',
    };
  } catch {
    deadline.throwIfAborted();
    return {
      ...base,
      status: 'unknown',
      interfaceState: 'unknown',
      canSatisfyInterfaceMutationGate: false,
      interfaces: [],
      reason: `${phase}-unverified`,
    };
  }
}

// plugins/azure/src/ce/terraform-network-replacement-source-binding.ts
// plugins/azure/src/ce/terraform-network-bound-replacement-source.ts
// plugins/azure/src/ce/terraform-network-completion-history.ts
// plugins/azure/src/ce/network-update-terraform.ts
import {
  createHash as createHash2,
  createHash as createHash17,
  createHash as createHash18,
  createHash as createHash19,
} from 'node:crypto';

var hash = (value) => createHash2('sha256').update(value).digest('hex');
var require9 = (condition, message) => {
  if (!condition) throw Error(`Azure Terraform network update: ${message}`);
};
var object12 = (value) => {
  require9(value && typeof value === 'object' && !Array.isArray(value), 'malformed retained configuration');
  return value;
};
var lower2 = (value) => (typeof value === 'string' ? value.toLowerCase() : '');
var same4 = canonicalEqual;
function buildAzureNetworkUpdateTerraformStage(plan, source, inventory, node) {
  validateAzureNetworkUpdateInventory(plan, inventory);
  require9(
    plan.engine === 'terraform' && Number.isInteger(node) && node >= 1 && node <= plan.topology.nodeCount,
    'exact Terraform node required',
  );
  let original;
  try {
    original = object12(JSON.parse(source));
  } catch {
    throw Error('Azure Terraform network update: malformed retained source JSON');
  }
  const next = structuredClone(original),
    resources = object12(next.resource),
    providers = object12(next.provider),
    provider = object12(providers.azurerm);
  require9(
    lower2(provider.subscription_id) === lower2(plan.subscription.id) &&
      lower2(provider.tenant_id) === lower2(plan.subscription.tenantId),
    'retained provider account differs',
  );
  const named = (value, type) => {
    require9(typeof value === 'string', 'resource name is unresolved');
    const match = /^\$\{([a-z0-9_]+)\.([a-z0-9_]+)\.name\}$/.exec(value);
    if (!match) {
      require9(!value.includes('${'), 'resource name expression is unresolved');
      return value;
    }
    require9(match[1] === type, 'resource name references another type');
    const name = object12(object12(resources[type])[match[2]]).name;
    require9(typeof name === 'string' && !name.includes('${'), 'resource name reference is unresolved');
    return name;
  };
  const subnet = (value) => {
    require9(typeof value === 'string', 'NIC subnet reference is unavailable');
    const match = /^\$\{azurerm_subnet\.([a-z0-9_]+)\.id\}$/.exec(value);
    if (!match) {
      require9(!value.includes('${'), 'NIC subnet expression is unresolved');
      return { id: value };
    }
    const row = object12(object12(resources.azurerm_subnet)[match[1]]);
    require9(
      Array.isArray(row.address_prefixes) &&
        row.address_prefixes.length === 1 &&
        typeof row.address_prefixes[0] === 'string',
      'retained subnet address is unresolved',
    );
    const group = named(row.resource_group_name, 'azurerm_resource_group'),
      vnet = named(row.virtual_network_name, 'azurerm_virtual_network');
    require9(typeof row.name === 'string' && !row.name.includes('${'), 'retained subnet name is unresolved');
    return {
      id: `/subscriptions/${plan.subscription.id}/resourceGroups/${group}/providers/Microsoft.Network/virtualNetworks/${vnet}/subnets/${row.name}`,
      cidr: row.address_prefixes[0],
    };
  };
  const tags = (value, owner) => {
    const row = object12(value);
    require9(
      row['xcsh-managed-by'] === 'azure-ce' &&
        row['xcsh-execution-engine'] === 'terraform' &&
        row['xcsh-deployment-id'] === plan.deploymentName &&
        row['xcsh-plan-sha256'] === owner,
      'retained resource owner differs',
    );
  };
  const interfaces = object12(resources.azurerm_network_interface),
    vms = object12(resources.azurerm_linux_virtual_machine);
  const output = object12(object12(object12(next.output).ce_interfaces).value),
    addresses = [];
  for (const [key, owner] of Object.entries(inventory.nodes)) {
    const vm = object12(vms[`node_${key}`]);
    require9(
      named(vm.name, 'azurerm_linux_virtual_machine') === `${plan.deploymentName}-${key}` &&
        named(vm.resource_group_name, 'azurerm_resource_group') === plan.intent.resourceGroup &&
        lower2(vm.location) === lower2(plan.region),
      'retained VM scope differs',
    );
    tags(vm.tags, owner.ownerPlanSha256);
    const attached = plan.nics.map((nic) => `\${azurerm_network_interface.node_${key}_nic_${nic.index}.id}`);
    require9(same4(vm.network_interface_ids, attached), 'retained VM NIC graph differs');
    for (const [index, identity] of Object.entries(owner.nics)) {
      const address = `node_${key}_nic_${index}`,
        nic = object12(interfaces[address]);
      require9(
        named(nic.name, 'azurerm_network_interface') === `${plan.deploymentName}-${key}-nic${index}` &&
          named(nic.resource_group_name, 'azurerm_resource_group') === plan.intent.resourceGroup &&
          lower2(nic.location) === lower2(plan.region),
        'retained NIC resource differs',
      );
      tags(nic.tags, identity.ownerPlanSha256);
      require9(
        Array.isArray(nic.ip_configuration) && nic.ip_configuration.length === 1,
        'retained single IP configuration required',
      );
      const config = object12(nic.ip_configuration[0]),
        beforeSubnet = subnet(config.subnet_id);
      require9(
        config.name === identity.ipConfigurationName &&
          config.primary === true &&
          config.private_ip_address_allocation === identity.allocation &&
          lower2(beforeSubnet.id) === lower2(identity.subnetId) &&
          (!beforeSubnet.cidr || beforeSubnet.cidr === identity.subnetCidr) &&
          (identity.allocation !== 'Static' || config.private_ip_address === identity.privateIp),
        'retained IP configuration differs',
      );
      const exported = object12(output[`${key}:${index}`]);
      require9(
        exported.node === Number(key) &&
          exported.index === Number(index) &&
          exported.role === plan.nics.find((nic) => nic.index === Number(index))?.role &&
          exported.site_name === plan.siteName &&
          exported.id === `\${azurerm_network_interface.${address}.id}` &&
          same4(exported.subnet_id, config.subnet_id),
        'retained interface output identity differs',
      );
      if (Number(key) === node) {
        config.subnet_id = identity.targetSubnetId;
        exported.subnet_id = identity.targetSubnetId;
        addresses.push(`azurerm_network_interface.${address}`);
      }
    }
  }
  const configuration = JSON.stringify(next);
  return {
    node,
    previousConfigurationSha256: hash(source),
    configurationSha256: hash(configuration),
    configuration,
    addresses,
  };
}
function validateAzureNetworkUpdateTerraformReceipt(plan, stage, receipt, providerLockSha256) {
  verifyAzureCePlan(plan);
  require9(
    stage &&
      typeof stage === 'object' &&
      !Array.isArray(stage) &&
      same4(Object.keys(stage).sort(), [
        'addresses',
        'configuration',
        'configurationSha256',
        'node',
        'previousConfigurationSha256',
      ]) &&
      typeof stage.configuration === 'string' &&
      Array.isArray(stage.addresses),
    'malformed stage schema',
  );
  require9(
    receipt &&
      typeof receipt === 'object' &&
      !Array.isArray(receipt) &&
      Object.keys(receipt).every((key) =>
        [
          'schemaVersion',
          'deploymentId',
          'engine',
          'backendIdentity',
          'configurationSha256',
          'providerLockSha256',
          'planSha256',
          'changes',
          'noChanges',
          'actionInvocations',
          'imports',
          'relinquishments',
        ].includes(key),
      ),
    'malformed receipt schema',
  );
  require9(
    plan.engine === 'terraform' &&
      plan.intent.operation === 'update-network' &&
      stage.configurationSha256 === hash(stage.configuration) &&
      /^[a-f0-9]{64}$/.test(stage.previousConfigurationSha256) &&
      Number.isInteger(stage.node) &&
      stage.node >= 1 &&
      stage.node <= plan.topology.nodeCount &&
      same4(
        stage.addresses.toSorted(),
        plan.nics.map((nic) => `azurerm_network_interface.node_${stage.node}_nic_${nic.index}`).toSorted(),
      ),
    'immutable stage identity differs',
  );
  require9(
    receipt.schemaVersion === 1 &&
      receipt.deploymentId === plan.deploymentName &&
      receipt.engine === 'terraform' &&
      receipt.backendIdentity === `local:${plan.deploymentName}` &&
      receipt.configurationSha256 === stage.configurationSha256 &&
      /^[a-f0-9]{64}$/.test(providerLockSha256) &&
      receipt.providerLockSha256 === providerLockSha256 &&
      /^[a-f0-9]{64}$/.test(receipt.planSha256) &&
      receipt.operation === undefined &&
      [receipt.actionInvocations, receipt.imports, receipt.relinquishments].every(
        (value) => value === undefined || (Array.isArray(value) && value.length === 0),
      ) &&
      Array.isArray(receipt.changes) &&
      typeof receipt.noChanges === 'boolean',
    'saved Terraform scope or provider lock differs',
  );
  let configuration;
  try {
    configuration = object12(JSON.parse(stage.configuration));
  } catch {
    throw Error('Azure Terraform network update: malformed stage JSON');
  }
  const resources = object12(configuration.resource);
  const interfaces = object12(resources.azurerm_network_interface);
  const output = object12(object12(object12(configuration.output).ce_interfaces).value);
  for (const nic of plan.nics) {
    const key = `node_${stage.node}_nic_${nic.index}`;
    const selected = object12(interfaces[key]);
    const changes = plan.actions.filter(
      (action) =>
        action.kind === 'nic-update' &&
        action.node === stage.node &&
        lower2(action.resourceId).endsWith(
          `/networkinterfaces/${plan.deploymentName}-${stage.node}-nic${nic.index}`.toLowerCase(),
        ),
    );
    require9(changes.length === 1, 'selected public NIC identity differs');
    const args = changes[0].args ?? [];
    const target = args[args.indexOf('--subnet') + 1];
    require9(
      typeof target === 'string' &&
        /^\/subscriptions\/[^/]+\/resourceGroups\/[^/]+\/providers\/Microsoft\.Network\/virtualNetworks\/[^/]+\/subnets\/[^/]+$/i.test(
          target,
        ),
      'resolved selected subnet required',
    );
    require9(
      Array.isArray(selected.ip_configuration) && selected.ip_configuration.length === 1,
      'single selected NIC IP configuration required',
    );
    const ip = object12(selected.ip_configuration[0]);
    const row = object12(output[`${stage.node}:${nic.index}`]);
    require9(
      lower2(ip.subnet_id) === lower2(target) &&
        row.node === stage.node &&
        row.index === nic.index &&
        row.role === nic.role &&
        row.site_name === plan.siteName &&
        row.id === `\${azurerm_network_interface.${key}.id}` &&
        same4(row.subnet_id, ip.subnet_id),
      'selected subnet or output identity differs',
    );
  }
  const seen = new Set();
  for (const change of receipt.changes) {
    require9(change && typeof change === 'object' && !Array.isArray(change), 'malformed planned resource change');
    const match =
      typeof change.address === 'string' ? /^([a-z][a-z0-9_]*)\.([a-z][a-z0-9_]*)$/.exec(change.address) : null;
    require9(
      match && change.type === match[1] && object12(resources[match[1]])[match[2]] !== undefined,
      'planned resource is outside retained configuration',
    );
    require9(
      typeof change.address === 'string' &&
        !seen.has(change.address) &&
        typeof change.type === 'string' &&
        Array.isArray(change.actions) &&
        change.actions.length === 1 &&
        (change.actions[0] === 'no-op' ||
          (stage.addresses.includes(change.address) &&
            change.type === 'azurerm_network_interface' &&
            change.actions[0] === 'update')),
      'saved plan changes an unauthorized resource',
    );
    const row = change;
    require9(
      same4(Object.keys(row).sort(), ['actions', 'address', 'type']),
      'saved plan contains unresolved import/replacement metadata',
    );
    seen.add(change.address);
  }
  require9(
    receipt.noChanges === receipt.changes.every((change) => change.actions[0] === 'no-op'),
    'no-change claim differs from planned effects',
  );
}

// plugins/azure/src/ce/terraform-network-checkpoint.ts
// plugins/azure/src/ce/terraform-network-routing.ts
import { createHash as createHash3, createHash as createHash6 } from 'node:crypto';
import { readdir } from 'node:fs/promises';

// plugins/azure/src/ce/terraform-network-nic-projection.ts
var AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256 = '901676ec098461ba0766d62124a4b011ae29e8554dda8c5be71371b1a0684b1b';
var roots = [
  'accelerated_networking_enabled',
  'auxiliary_mode',
  'auxiliary_sku',
  'dns_servers',
  'edge_zone',
  'id',
  'internal_dns_name_label',
  'ip_forwarding_enabled',
  'location',
  'name',
  'resource_group_name',
  'tags',
  'timeouts',
];
var ipFields = [
  'gateway_load_balancer_frontend_ip_configuration_id',
  'name',
  'primary',
  'private_ip_address',
  'private_ip_address_allocation',
  'private_ip_address_version',
  'public_ip_address_id',
  'subnet_id',
];
var ip = (field) => `ip_configuration.0.${field}`;
var same5 = canonicalEqual;
var lower3 = (value) => (typeof value === 'string' ? value.toLowerCase() : '');
function require10(value, message) {
  if (!value) throw Error(`Azure Terraform network NIC projection: ${message}`);
}
function object13(value) {
  require10(value && typeof value === 'object' && !Array.isArray(value), 'complete object required');
  return value;
}
function resolved(value) {
  if (value === undefined) return false;
  if (typeof value === 'string') return !value.includes('${') && !/^__/.test(value);
  if (value && typeof value === 'object') return Object.values(value).every(resolved);
  return value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
}
var resourceId = (value) =>
  typeof value === 'string' &&
  /^\/subscriptions\/[^/]+\/resourceGroups\/[^/]+\/providers\/[^/]+\/.+/i.test(value) &&
  resolved(value);
function azureTerraformNetworkNicSelections(plan, stage, inventory) {
  validateAzureNetworkUpdateInventory(plan, inventory);
  require10(
    plan.engine === 'terraform' && Number.isInteger(stage.node) && inventory.nodes[String(stage.node)],
    'exact Terraform node required',
  );
  const prior = {},
    proposed = {};
  for (const nic of plan.nics) {
    const address = `azurerm_network_interface.node_${stage.node}_nic_${nic.index}`;
    const identity = inventory.nodes[String(stage.node)].nics[String(nic.index)];
    const fields = [...roots, 'mac_address', 'virtual_machine_id', 'ip_configuration.length', ...ipFields.map(ip)];
    prior[address] = fields;
    proposed[address] =
      identity.allocation === 'Dynamic' && lower3(identity.subnetId) !== lower3(identity.targetSubnetId)
        ? fields.filter((path) => path !== ip('private_ip_address'))
        : [...fields];
  }
  return { prior, proposed };
}
function validateAzureTerraformNetworkNicProjection(
  plan,
  stage,
  inventory,
  receipt,
  providerLockSha256,
  priorInput,
  proposedInput,
) {
  validateAzureNetworkUpdateTerraformReceipt(plan, stage, receipt, providerLockSha256);
  require10(providerLockSha256 === AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256, 'unqualified provider lock');
  const selections = azureTerraformNetworkNicSelections(plan, stage, inventory);
  const prior = object13(priorInput),
    proposed = object13(proposedInput);
  require10(
    same5(Object.keys(prior).sort(), Object.keys(selections.prior).sort()) &&
      same5(Object.keys(proposed).sort(), Object.keys(selections.proposed).sort()),
    'complete selected resource set required',
  );
  const configuration = object13(JSON.parse(stage.configuration));
  const resources = object13(configuration.resource);
  const interfaces = object13(resources.azurerm_network_interface);
  const name = (value) => {
    if (typeof value !== 'string' || !value.includes('${')) return value;
    const match = /^\$\{azurerm_resource_group\.([a-z0-9_]+)\.name\}$/.exec(value);
    require10(match, 'unqualified resource group expression');
    const group = object13(object13(resources.azurerm_resource_group)[match[1]]);
    require10(group.name === plan.intent.resourceGroup, 'referenced group differs');
    return group.name;
  };
  const reference = (value) => {
    if (typeof value !== 'string' || !value.includes('${')) return value;
    const match = /^\$\{azurerm_public_ip\.([a-z0-9_]+)\.id\}$/.exec(value);
    require10(match, 'unqualified requested resource expression');
    const target = object13(object13(resources.azurerm_public_ip)[match[1]]);
    require10(
      typeof target.name === 'string' &&
        resolved(target.name) &&
        name(target.resource_group_name) === plan.intent.resourceGroup &&
        lower3(target.location) === lower3(plan.region),
      'referenced public IP identity differs',
    );
    return `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Network/publicIPAddresses/${target.name}`;
  };
  const vm = inventory.nodes[String(stage.node)];
  for (const nic of plan.nics) {
    const address = `azurerm_network_interface.node_${stage.node}_nic_${nic.index}`;
    const identity = vm.nics[String(nic.index)],
      before = object13(prior[address]),
      after = object13(proposed[address]);
    for (const [value, fields] of [
      [before, selections.prior[address]],
      [after, selections.proposed[address]],
    ])
      require10(
        same5(Object.keys(value).sort(), fields.toSorted()) && Object.values(value).every(resolved),
        'missing, extra or unresolved selected field',
      );
    const configured = object13(interfaces[address.split('.')[1]]);
    require10(
      Object.keys(configured).every((key) => [...roots, 'ip_configuration'].includes(key)),
      'unqualified NIC configuration field',
    );
    const ipConfig = object13(configured.ip_configuration[0]);
    const effects = receipt.changes.filter((change) => change.address === address);
    require10(
      effects.length === 1 &&
        effects[0].actions[0] === (lower3(identity.subnetId) === lower3(identity.targetSubnetId) ? 'no-op' : 'update'),
      'saved effect differs from observed subnet boundary',
    );
    require10(
      identity.allocation !== 'Dynamic' ||
        ipConfig.private_ip_address === undefined ||
        ipConfig.private_ip_address === null ||
        ipConfig.private_ip_address === '',
      'dynamic private IP cannot be an execution input',
    );
    require10(
      configured.name === `${plan.deploymentName}-${stage.node}-nic${nic.index}` &&
        name(configured.resource_group_name) === plan.intent.resourceGroup &&
        lower3(configured.location) === lower3(plan.region) &&
        (configured.id === undefined ||
          configured.id === null ||
          lower3(configured.id) === lower3(identity.resourceId)),
      'configured NIC identity differs',
    );
    require10(
      Object.keys(ipConfig).every((key) => ipFields.includes(key)),
      'unqualified IP configuration field',
    );
    for (const side of [before, after]) {
      require10(
        lower3(side.id) === lower3(identity.resourceId) &&
          side.name === `${plan.deploymentName}-${stage.node}-nic${nic.index}` &&
          side.resource_group_name === plan.intent.resourceGroup &&
          lower3(side.location) === lower3(plan.region) &&
          lower3(side.mac_address).replaceAll('-', ':') === identity.mac &&
          lower3(side.virtual_machine_id) === lower3(vm.resourceId),
        'NIC, MAC or attachment identity differs',
      );
      const tags = object13(side.tags);
      require10(
        tags['xcsh-managed-by'] === 'azure-ce' &&
          tags['xcsh-execution-engine'] === 'terraform' &&
          tags['xcsh-deployment-id'] === plan.deploymentName &&
          tags['xcsh-plan-sha256'] === identity.ownerPlanSha256 &&
          same5(tags, configured.tags),
        'NIC owner differs',
      );
      require10(
        side['ip_configuration.length'] === 1 &&
          side[ip('name')] === identity.ipConfigurationName &&
          side[ip('primary')] === true &&
          side[ip('private_ip_address_allocation')] === identity.allocation &&
          side[ip('private_ip_address_version')] === 'IPv4',
        'single IPv4 IP configuration identity differs',
      );
      require10(
        typeof side.accelerated_networking_enabled === 'boolean' &&
          typeof side.ip_forwarding_enabled === 'boolean' &&
          Array.isArray(side.dns_servers) &&
          side.dns_servers.every((value) => typeof value === 'string') &&
          ['auxiliary_mode', 'auxiliary_sku', 'edge_zone', 'internal_dns_name_label'].every(
            (key) => side[key] === null || typeof side[key] === 'string',
          ),
        'malformed configurable NIC fields',
      );
      const timeouts = side.timeouts;
      require10(
        timeouts === null ||
          Object.keys(object13(timeouts)).every(
            (key) =>
              ['create', 'delete', 'read', 'update'].includes(key) &&
              (object13(timeouts)[key] === null || typeof object13(timeouts)[key] === 'string'),
          ),
        'unqualified timeouts',
      );
      for (const key of ['gateway_load_balancer_frontend_ip_configuration_id', 'public_ip_address_id'])
        require10(
          side[ip(key)] === null || side[ip(key)] === '' || resourceId(side[ip(key)]),
          'unresolved configured resource reference',
        );
    }
    require10(
      lower3(before[ip('subnet_id')]) === lower3(identity.subnetId) &&
        lower3(after[ip('subnet_id')]) === lower3(identity.targetSubnetId),
      'approved subnet transition differs',
    );
    require10(before[ip('private_ip_address')] === identity.privateIp, 'prior private IP differs');
    if (Object.hasOwn(after, ip('private_ip_address')))
      require10(after[ip('private_ip_address')] === identity.privateIp, 'retained private IP differs');
    else
      require10(
        identity.allocation === 'Dynamic' &&
          (ipConfig.private_ip_address === undefined ||
            ipConfig.private_ip_address === null ||
            ipConfig.private_ip_address === ''),
        'moving dynamic IP cannot be an execution input',
      );
    for (const path of selections.proposed[address])
      if (path !== ip('subnet_id'))
        require10(same5(before[path], after[path]), 'unauthorized configurable or identity delta');
    for (const key of roots.filter((key) => !['id', 'name', 'resource_group_name', 'location'].includes(key)))
      if (configured[key] !== undefined && configured[key] !== null)
        require10(
          resolved(configured[key]) && same5(after[key], configured[key]),
          'configured root value differs or is unresolved',
        );
    for (const key of ipFields)
      if (
        ipConfig[key] !== undefined &&
        ipConfig[key] !== null &&
        !(key === 'private_ip_address' && identity.allocation === 'Dynamic')
      )
        require10(
          resolved(reference(ipConfig[key])) && same5(after[ip(key)], reference(ipConfig[key])),
          'configured IP value differs or is unresolved',
        );
  }
}

// plugins/azure/src/ce/terraform-network-routing.ts
var hash2 = (value) => createHash3('sha256').update(value).digest('hex');
var same6 = canonicalEqual;
var lower4 = (value) => (typeof value === 'string' ? value.toLowerCase() : '');
function require11(value, message) {
  if (!value) throw Error(`Azure Terraform network dependent routing: ${message}`);
}
function object14(value) {
  require11(value && typeof value === 'object' && !Array.isArray(value), 'complete object required');
  return value;
}
function parse(value) {
  try {
    return object14(JSON.parse(value));
  } catch {
    throw Error('Azure Terraform network dependent routing: malformed configuration');
  }
}
var expression = (node, index) => `\${azurerm_network_interface.node_${node}_nic_${index}.private_ip_address}`;
function prepareAzureTerraformNetworkRouting(plan, source, before, node) {
  const nicStage = buildAzureNetworkUpdateTerraformStage(plan, source, before, node);
  const graph = parse(nicStage.configuration),
    resources = object14(graph.resource);
  const dependencies = [];
  const base = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Network`;
  const parent = (type, name, expectedName, owner) => {
    const row = object14(object14(resources[type])[name]),
      tags = object14(row.tags);
    require11(
      row.name === expectedName &&
        lower4(row.location) === lower4(plan.region) &&
        (row.resource_group_name === plan.intent.resourceGroup ||
          (row.resource_group_name === `\${azurerm_resource_group.ce.name}` &&
            object14(object14(resources.azurerm_resource_group).ce).name === plan.intent.resourceGroup)) &&
        tags['xcsh-managed-by'] === 'azure-ce' &&
        tags['xcsh-execution-engine'] === 'terraform' &&
        tags['xcsh-deployment-id'] === plan.deploymentName &&
        tags['xcsh-plan-sha256'] === owner,
      'retained routing parent identity differs',
    );
  };
  const add = (kind, address, field, index, resourceId) => {
    const row = object14(object14(resources[address.split('.')[0]])[address.split('.')[1]]);
    const ref = expression(node, index),
      identity = before.nodes[String(node)].nics[String(index)];
    require11(identity && row[field] === ref, 'exact retained dependent NIC expression required');
    dependencies.push({
      kind,
      address,
      field,
      nicIndex: index,
      resourceId,
      expression: ref,
      previousIp: identity.privateIp,
      currentIp: identity.privateIp,
    });
    row[field] = identity.privateIp;
  };
  const routes = resources.azurerm_route === undefined ? {} : object14(resources.azurerm_route);
  if (plan.routing.udr) {
    require11(
      plan.routing.mode === 'udr' && plan.routing.destinationCidrs.length > 0,
      'explicit UDR destinations required',
    );
    const selected = plan.routing.udr.nextHop;
    require11(
      same6(Object.keys(routes).sort(), plan.routing.destinationCidrs.map((_, i) => `route_${i}`).sort()),
      'complete retained UDR route set required',
    );
    const owner = before.nodes[String(selected.node)].nics[String(selected.nicIndex)].ownerPlanSha256;
    parent('azurerm_route_table', 'ce', `${plan.deploymentName}-rt`, owner);
    for (const [index, prefix] of plan.routing.destinationCidrs.entries()) {
      const row = object14(routes[`route_${index}`]);
      require11(
        same6(
          Object.keys(row).sort(),
          [
            'address_prefix',
            'name',
            'next_hop_in_ip_address',
            'next_hop_type',
            'resource_group_name',
            'route_table_name',
          ].sort(),
        ) &&
          row.name === `ce-route-${index + 1}` &&
          row.address_prefix === prefix &&
          row.next_hop_type === 'VirtualAppliance' &&
          row.route_table_name === `\${azurerm_route_table.ce.name}` &&
          row.resource_group_name === `\${azurerm_resource_group.ce.name}` &&
          row.next_hop_in_ip_address === expression(selected.node, selected.nicIndex),
        'retained UDR intent differs',
      );
      if (selected.node === node)
        add(
          'udr-next-hop',
          `azurerm_route.route_${index}`,
          'next_hop_in_ip_address',
          selected.nicIndex,
          `${base}/routeTables/${plan.deploymentName}-rt/routes/ce-route-${index + 1}`,
        );
    }
  } else require11(Object.keys(routes).length === 0, 'UDR resources lack explicit owning profile');
  const peers =
    resources.azurerm_route_server_bgp_connection === undefined
      ? {}
      : object14(resources.azurerm_route_server_bgp_connection);
  if (plan.routing.mode === 'route-server' && !plan.relayProfile)
    require11(Object.keys(peers).length > 0, 'complete retained CE peer set required');
  require11(
    !plan.relayProfile || Object.keys(peers).length === 0,
    'relay and direct CE peer contracts cannot be mixed',
  );
  if (Object.keys(peers).length) {
    require11(plan.routing.mode === 'route-server' && !plan.routing.udr, 'peer resources lack Route Server intent');
    const slo = plan.nics.find((nic) => nic.role === 'slo');
    require11(slo, 'explicit SLO required');
    require11(
      same6(
        Object.keys(peers).sort(),
        Object.keys(before.nodes)
          .map((key) => `node_${key}`)
          .sort(),
      ),
      'complete independent CE peer set required',
    );
    parent(
      'azurerm_route_server',
      'ce',
      `${plan.deploymentName}-rs`,
      before.nodes[String(node)].nics[String(slo.index)].ownerPlanSha256,
    );
    const output = object14(object14(object14(graph.output).ce_route_server_peers).value);
    require11(same6(Object.keys(output).sort(), Object.keys(before.nodes).sort()), 'complete peer output set required');
    for (const key of Object.keys(before.nodes)) {
      const row = object14(peers[`node_${key}`]),
        exported = object14(output[key]);
      require11(
        same6(Object.keys(row).sort(), ['name', 'peer_asn', 'peer_ip', 'route_server_id'].sort()) &&
          row.name === `${plan.deploymentName}-${key}` &&
          row.peer_asn === plan.routing.localAsn &&
          row.route_server_id === `\${azurerm_route_server.ce.id}` &&
          row.peer_ip === expression(Number(key), slo.index) &&
          same6(exported, {
            id: `\${azurerm_route_server_bgp_connection.node_${key}.id}`,
            peer_ip: row.peer_ip,
            peer_asn: row.peer_asn,
          }),
        'retained peer intent/output differs',
      );
    }
    add(
      'route-server-peer',
      `azurerm_route_server_bgp_connection.node_${node}`,
      'peer_ip',
      slo.index,
      `${base}/virtualHubs/${plan.deploymentName}-rs/bgpConnections/${plan.deploymentName}-${node}`,
    );
    object14(output[String(node)]).peer_ip = before.nodes[String(node)].nics[String(slo.index)].privateIp;
  }
  const mentionsSelectedIp = (value) => {
    if (typeof value === 'string')
      return plan.nics.some((nic) =>
        value.includes(`azurerm_network_interface.node_${node}_nic_${nic.index}.private_ip_address`),
      );
    return !!value && typeof value === 'object' && Object.values(value).some(mentionsSelectedIp);
  };
  for (const group of Object.values(resources))
    for (const row of Object.values(object14(group)))
      require11(!mentionsSelectedIp(row), 'unqualified resource depends on selected NIC address');
  const configuration = JSON.stringify(graph);
  return { ...nicStage, configuration, configurationSha256: hash2(configuration), dependencies };
}
function buildAzureTerraformNetworkPinnedNicStage(plan, source, before, node) {
  const prepared = prepareAzureTerraformNetworkRouting(plan, source, before, node);
  return {
    node: prepared.node,
    previousConfigurationSha256: prepared.previousConfigurationSha256,
    configurationSha256: prepared.configurationSha256,
    configuration: prepared.configuration,
    addresses: prepared.addresses,
  };
}
function buildAzureTerraformNetworkRoutingStage(plan, source, before, current, node) {
  const prepared = prepareAzureTerraformNetworkRouting(plan, source, before, node);
  validateAzureNetworkUpdateInventory(plan, current);
  const reached = Array.from({ length: node }, (_, i) => plan.nics.map((nic) => `${i + 1}:${nic.index}`)).flat();
  verifyAzureNetworkUpdateProgress(plan, before, current, reached);
  for (const [key, vm] of Object.entries(before.nodes))
    for (const [index, identity] of Object.entries(vm.nics))
      require11(
        Number(key) === node || current.nodes[key].nics[index].privateIp === identity.privateIp,
        'unselected NIC address changed',
      );
  const graph = parse(prepared.configuration),
    released = parse(prepared.configuration);
  const dependencies = prepared.dependencies.map((dependency) => {
    const currentIp = current.nodes[String(node)].nics[String(dependency.nicIndex)].privateIp;
    const [type, name] = dependency.address.split('.');
    object14(object14(object14(graph.resource)[type])[name])[dependency.field] = currentIp;
    object14(object14(object14(released.resource)[type])[name])[dependency.field] = dependency.expression;
    if (dependency.kind === 'route-server-peer') {
      object14(object14(object14(object14(graph.output).ce_route_server_peers).value)[String(node)]).peer_ip =
        currentIp;
      object14(object14(object14(object14(released.output).ce_route_server_peers).value)[String(node)]).peer_ip =
        dependency.expression;
    }
    return { ...dependency, currentIp };
  });
  const configuration = JSON.stringify(graph),
    releasedConfiguration = JSON.stringify(released);
  return {
    schemaVersion: 1,
    kind: 'dependent-routing',
    node,
    planSha256: plan.planSha256,
    beforeSha256: canonicalSha256(before),
    currentSha256: canonicalSha256(current),
    sourceSha256: hash2(source),
    nicConfiguration: prepared.configuration,
    nicConfigurationSha256: prepared.configurationSha256,
    configuration,
    configurationSha256: hash2(configuration),
    releasedConfiguration,
    releasedConfigurationSha256: hash2(releasedConfiguration),
    dependencies,
  };
}
function validateAzureTerraformNetworkRoutingPrepared(plan, source, before, expected, node, input) {
  const saved = object14(input);
  require11(
    same6(Object.keys(saved).sort(), ['schemaVersion', 'kind', 'stage', 'before', 'current', 'appliedNics'].sort()) &&
      saved.schemaVersion === 2 &&
      saved.kind === 'dependent-routing' &&
      same6(saved.before, before),
    'complete original routing input required',
  );
  const current = validateAzureNetworkUpdateInventory(plan, saved.current);
  validateAzureNetworkUpdateInventory(plan, expected);
  require11(
    same6(current.nodes, expected.nodes),
    'retained routing input differs from independently observed identities',
  );
  const stage = buildAzureTerraformNetworkRoutingStage(plan, source, before, current, node);
  require11(
    same6(saved.stage, stage) &&
      same6(
        saved.appliedNics,
        Array.from({ length: node }, (_, i) => plan.nics.map((nic) => `${i + 1}:${nic.index}`)).flat(),
      ),
    'prepared source and full serial NIC boundary differ',
  );
  return { current: structuredClone(current), stage };
}
function validateAzureTerraformNetworkRoutingReceipt(plan, source, before, current, stage, receipt, phase) {
  require11(phase === 'mutation' || phase === 'release', 'known routing phase required');
  require11(
    same6(stage, buildAzureTerraformNetworkRoutingStage(plan, source, before, current, stage.node)),
    'immutable routing stage differs',
  );
  const configuration = phase === 'mutation' ? stage.configuration : stage.releasedConfiguration;
  require11(
    receipt &&
      receipt.schemaVersion === 1 &&
      receipt.engine === 'terraform' &&
      receipt.deploymentId === plan.deploymentName &&
      receipt.backendIdentity === `local:${plan.deploymentName}` &&
      receipt.configurationSha256 === hash2(configuration) &&
      receipt.providerLockSha256 === AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256 &&
      /^[a-f0-9]{64}$/.test(receipt.planSha256) &&
      Object.keys(receipt).every((key) =>
        [
          'schemaVersion',
          'engine',
          'deploymentId',
          'backendIdentity',
          'configurationSha256',
          'providerLockSha256',
          'planSha256',
          'changes',
          'noChanges',
          'actionInvocations',
          'imports',
          'relinquishments',
        ].includes(key),
      ) &&
      [receipt.actionInvocations, receipt.imports, receipt.relinquishments].every(
        (value) => value === undefined || (Array.isArray(value) && value.length === 0),
      ) &&
      Array.isArray(receipt.changes),
    'exact saved scope and qualified lock required',
  );
  const resources = object14(parse(configuration).resource),
    seen = new Set();
  for (const change of receipt.changes) {
    require11(
      change && same6(Object.keys(change).sort(), ['address', 'type', 'actions'].sort()),
      'unqualified saved change metadata',
    );
    const match = /^([a-z][a-z0-9_]*)\.([a-z][a-z0-9_]*)$/.exec(change.address);
    require11(
      match && change.type === match[1] && object14(resources[match[1]])[match[2]] && !seen.has(change.address),
      'unknown or duplicate saved resource',
    );
    seen.add(change.address);
    const dependency = stage.dependencies.find((row) => row.address === change.address);
    const action =
      phase === 'mutation' && dependency && dependency.previousIp !== dependency.currentIp ? 'update' : 'no-op';
    require11(same6(change.actions, [action]), 'saved plan changes an unauthorized resource or effect');
  }
  require11(
    stage.dependencies.every((row) => seen.has(row.address)),
    'complete dependent effects required',
  );
  require11(
    typeof receipt.noChanges === 'boolean' &&
      receipt.noChanges === receipt.changes.every((row) => row.actions[0] === 'no-op'),
    'no-change claim differs',
  );
}
var fields2 = {
  'udr-next-hop': [
    'id',
    'name',
    'resource_group_name',
    'route_table_name',
    'address_prefix',
    'next_hop_type',
    'next_hop_in_ip_address',
    'timeouts',
  ],
  'route-server-peer': ['id', 'name', 'route_server_id', 'peer_asn', 'peer_ip', 'timeouts'],
};
function azureTerraformNetworkRoutingSelections(stage) {
  return Object.fromEntries(stage.dependencies.map((row) => [row.address, [...fields2[row.kind]]]));
}
function resolved2(value) {
  if (typeof value === 'string') return !value.includes('${') && !value.includes('__');
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  return !!value && typeof value === 'object' && Object.values(value).every(resolved2);
}
function validateAzureTerraformNetworkRoutingProjection(
  plan,
  source,
  before,
  current,
  stage,
  receipt,
  phase,
  priorInput,
  proposedInput,
) {
  validateAzureTerraformNetworkRoutingReceipt(plan, source, before, current, stage, receipt, phase);
  const prior = object14(priorInput),
    proposed = object14(proposedInput),
    selections = azureTerraformNetworkRoutingSelections(stage);
  require11(
    same6(Object.keys(prior).sort(), Object.keys(selections).sort()) &&
      same6(Object.keys(proposed).sort(), Object.keys(selections).sort()),
    'complete projection resource set required',
  );
  for (const dependency of stage.dependencies) {
    const beforeRow = object14(prior[dependency.address]),
      afterRow = object14(proposed[dependency.address]);
    for (const row of [beforeRow, afterRow]) {
      require11(
        same6(Object.keys(row).sort(), selections[dependency.address].toSorted()) &&
          Object.values(row).every(resolved2) &&
          lower4(row.id) === lower4(dependency.resourceId),
        'missing, extra, unresolved or foreign projected identity',
      );
      const allowed =
        dependency.kind === 'udr-next-hop' ? ['create', 'delete', 'read', 'update'] : ['create', 'delete', 'read'];
      require11(
        row.timeouts === null ||
          Object.entries(object14(row.timeouts)).every(
            ([key, value]) => allowed.includes(key) && (value === null || typeof value === 'string'),
          ),
        'unqualified timeout fields',
      );
      if (dependency.kind === 'udr-next-hop') {
        const index = Number(dependency.address.split('_').at(-1));
        require11(
          row.name === `ce-route-${index + 1}` &&
            row.resource_group_name === plan.intent.resourceGroup &&
            row.route_table_name === `${plan.deploymentName}-rt` &&
            row.address_prefix === plan.routing.destinationCidrs[index] &&
            row.next_hop_type === 'VirtualAppliance',
          'route identity/prefix/type differs',
        );
      } else
        require11(
          row.name === `${plan.deploymentName}-${stage.node}` &&
            row.peer_asn === plan.routing.localAsn &&
            lower4(row.route_server_id) ===
              lower4(dependency.resourceId.slice(0, dependency.resourceId.lastIndexOf('/bgpConnections/'))),
          'Route Server peer identity/ASN differs',
        );
    }
    require11(
      beforeRow[dependency.field] === (phase === 'mutation' ? dependency.previousIp : dependency.currentIp) &&
        afterRow[dependency.field] === dependency.currentIp,
      'dependent address transition differs',
    );
    for (const field of selections[dependency.address])
      if (field !== dependency.field)
        require11(same6(beforeRow[field], afterRow[field]), 'unauthorized projected delta');
  }
}

// plugins/azure/src/ce/terraform-network-stage-history.ts
// plugins/azure/src/ce/terraform-network-power.ts
import { createHash as createHash4, createHash as createHash5 } from 'node:crypto';
import { readFile } from 'node:fs/promises';

var address = 'azapi_resource_action.ce_network';
var hash3 = (value) => createHash4('sha256').update(value).digest('hex');
var same7 = canonicalEqual;
function require12(value, message) {
  if (!value) throw Error(`Azure Terraform network power: ${message}`);
}
var object15 = (value) => {
  require12(value && typeof value === 'object' && !Array.isArray(value), 'malformed record');
  return value;
};
function action(plan, inventory, node, operation) {
  validateAzureNetworkUpdateInventory(plan, inventory);
  require12(
    plan.engine === 'terraform' &&
      plan.intent.operation === 'update-network' &&
      ['deallocate', 'start'].includes(operation) &&
      Number.isInteger(node) &&
      node >= 1 &&
      node <= plan.topology.nodeCount,
    'exact owning network node and operation required',
  );
  const vm = inventory.nodes[String(node)];
  const matches = plan.actions.filter(
    (a) => a.node === node && a.kind === (operation === 'start' ? 'vm-start' : 'vm-deallocate'),
  );
  require12(
    matches.length === 1 &&
      matches[0].resourceId === vm.resourceId &&
      matches[0].expectedOwnerPlanSha256 === vm.ownerPlanSha256,
    'saved selected VM action differs',
  );
  return {
    type: 'Microsoft.Compute/virtualMachines@2024-07-01',
    resource_id: vm.resourceId,
    action: operation,
    method: 'POST',
    when: 'apply',
    locks: [vm.resourceId],
  };
}
async function azureTerraformNetworkPowerDeployment(plan, inventory, node, operation, release = false) {
  const selected = action(plan, inventory, node, operation);
  require12(typeof release === 'boolean', 'exact release selection required');
  return powerDeployment(plan, node, operation, release ? undefined : selected);
}
async function azureTerraformNetworkRetiredPowerDeployment(plan, node, operation) {
  require12(
    plan.engine === 'terraform' &&
      plan.intent.operation === 'update-network' &&
      /^[a-f0-9]{64}$/.test(plan.planSha256) &&
      Number.isInteger(node) &&
      node >= 1 &&
      node <= plan.topology.nodeCount &&
      ['deallocate', 'start'].includes(operation),
    'exact retired network node and operation required',
  );
  return powerDeployment(plan, node, operation);
}
async function powerDeployment(plan, node, operation, selected) {
  const stage = `network-${plan.planSha256.slice(0, 24)}-node-${node}-${operation}`;
  return {
    schemaVersion: 1,
    deploymentId: plan.deploymentName,
    stage,
    engine: 'terraform',
    scope: { cloud: 'azure', account: plan.subscription.id, region: plan.region },
    terraformVersion: AZURE_CE_TERRAFORM_VERSION,
    providerLock: await readFile(
      new URL('./assets/plugins/azure/terraform/azapi-provider-lock.hcl', import.meta.url),
      'utf8',
    ),
    backendIdentity: `local:${plan.deploymentName}:stage:${stage}`,
    configuration: renderTerraformConfigurationJson({
      terraform: {
        required_version: `= ${AZURE_CE_TERRAFORM_VERSION}`,
        required_providers: { azapi: { source: 'Azure/azapi', version: `= ${AZURE_CE_AZAPI_PROVIDER_VERSION}` } },
      },
      provider: { azapi: { subscription_id: plan.subscription.id, tenant_id: plan.subscription.tenantId } },
      resource: selected ? { azapi_resource_action: { ce_network: selected } } : {},
    }),
  };
}
async function validateAzureTerraformNetworkPowerPlan(plan, inventory, node, operation, input, phase) {
  require12(['mutation', 'release', 'final'].includes(phase), 'exact plan phase required');
  const deployment = await azureTerraformNetworkPowerDeployment(plan, inventory, node, operation, phase !== 'mutation');
  const row = object15(input);
  const required = [
    'schemaVersion',
    'deploymentId',
    'engine',
    'backendIdentity',
    'configurationSha256',
    'providerLockSha256',
    'planSha256',
    'changes',
    'noChanges',
  ];
  const optional = ['actionInvocations', 'imports', 'relinquishments'];
  require12(
    required.every((key) => key in row) &&
      Object.keys(row).every((key) => [...required, ...optional].includes(key)) &&
      row.schemaVersion === 1 &&
      row.deploymentId === deployment.deploymentId &&
      row.engine === 'terraform' &&
      row.backendIdentity === deployment.backendIdentity &&
      row.configurationSha256 === hash3(deployment.configuration) &&
      row.providerLockSha256 === hash3(deployment.providerLock) &&
      typeof row.planSha256 === 'string' &&
      /^[a-f0-9]{64}$/.test(row.planSha256) &&
      typeof row.noChanges === 'boolean' &&
      Array.isArray(row.changes) &&
      optional.every((key) => row[key] === undefined || (Array.isArray(row[key]) && row[key].length === 0)),
    'saved plan identity or metadata differs',
  );
  const changes = row.changes.map(object15);
  const allowed = phase === 'mutation' ? ['create', 'update', 'no-op'] : ['delete', 'no-op'];
  require12(
    changes.every(
      (change) =>
        same7(Object.keys(change).sort(), ['actions', 'address', 'type']) &&
        change.address === address &&
        change.type === 'azapi_resource_action' &&
        Array.isArray(change.actions) &&
        change.actions.length === 1 &&
        allowed.includes(String(change.actions[0])),
    ) &&
      row.noChanges === changes.every((change) => change.actions[0] === 'no-op') &&
      (phase === 'final'
        ? changes.length === 0 && row.noChanges === true
        : changes.length === 1 || (phase === 'release' && changes.length === 0 && row.noChanges === true)),
    'saved plan effects differ from isolated control',
  );
  return structuredClone(input);
}
var azureTerraformNetworkPowerSelections = {
  [address]: ['type', 'resource_id', 'action', 'method', 'when', 'locks'],
};
async function validateAzureTerraformNetworkPowerProjection(
  plan,
  inventory,
  node,
  operation,
  input,
  phase,
  priorInput,
  proposedInput,
) {
  const receipt = await validateAzureTerraformNetworkPowerPlan(plan, inventory, node, operation, input, phase);
  const expected = action(plan, inventory, node, operation);
  const prior = object15(priorInput),
    proposed = object15(proposedInput);
  require12(
    same7(Object.keys(prior), [address]) && same7(Object.keys(proposed), [address]),
    'complete exact state projection required',
  );
  const effects = receipt.changes[0]?.actions[0];
  if (phase === 'final') {
    require12(prior[address] === null && proposed[address] === null, 'final stage retains an isolated control');
  } else if (phase === 'mutation') {
    require12(
      same7(proposed[address], expected) &&
        (effects === 'create' ? prior[address] === null : same7(prior[address], expected)),
      'selected action prior/proposed fields differ',
    );
  } else {
    require12(
      proposed[address] === null && (effects === 'delete' ? same7(prior[address], expected) : prior[address] === null),
      'release removes another control or retains state',
    );
  }
}
async function observeAzureTerraformNetworkPower(plan, before, node, operation, appliedNics, api, signal) {
  action(plan, before, node, operation);
  const deadline = AbortSignal.any([AbortSignal.timeout(30000), ...(signal ? [signal] : [])]);
  const bounded = {
    async exec(command, args) {
      deadline.throwIfAborted();
      let rejectAbort;
      const aborted = new Promise((_, reject) => {
        rejectAbort = reject;
      });
      const onAbort = () => rejectAbort?.(deadline.reason);
      deadline.addEventListener('abort', onAbort, { once: true });
      try {
        const result = await Promise.race([api.exec(command, args, { signal: deadline }), aborted]);
        deadline.throwIfAborted();
        return result;
      } finally {
        deadline.removeEventListener('abort', onAbort);
      }
    },
  };
  const inventory = await captureAzureNetworkUpdateInventory(plan, bounded, deadline);
  verifyAzureNetworkUpdateProgress(plan, before, inventory, appliedNics);
  const selected = inventory.nodes[String(node)];
  const response = await bounded.exec('az', [
    'vm',
    'show',
    '--ids',
    selected.resourceId,
    '--subscription',
    plan.subscription.id,
    '--show-details',
    '--output',
    'json',
  ]);
  require12(response.exitCode === 0, 'selected VM power observation unavailable');
  let vm;
  try {
    vm = object15(JSON.parse(response.stdout));
  } catch {
    throw Error('Azure Terraform network power: malformed VM observation');
  }
  require12(!['nextLink', 'error', 'errors'].some((key) => vm[key]), 'partial or failed selected VM observation');
  const tags = object15(vm.tags);
  require12(
    vm.id === selected.resourceId &&
      typeof vm.vmId === 'string' &&
      vm.vmId.toLowerCase() === selected.vmId.toLowerCase() &&
      vm.name === `${plan.deploymentName}-${node}` &&
      typeof vm.location === 'string' &&
      vm.location.toLowerCase() === plan.region.toLowerCase() &&
      vm.provisioningState === 'Succeeded' &&
      tags['xcsh-managed-by'] === 'azure-ce' &&
      tags['xcsh-execution-engine'] === 'terraform' &&
      tags['xcsh-deployment-id'] === plan.deploymentName &&
      tags['xcsh-plan-sha256'] === selected.ownerPlanSha256 &&
      object15(vm.hardwareProfile).vmSize === plan.vm.size,
    'selected VM identity changed between inventory and power reads',
  );
  const attachments = object15(vm.networkProfile).networkInterfaces;
  require12(
    Array.isArray(attachments) &&
      same7(
        attachments.map((value) => object15(value).id).sort(),
        Object.values(selected.nics)
          .map((nic) => nic.resourceId)
          .sort(),
      ),
    'selected VM NIC attachment changed',
  );
  require12(
    ['VM running', 'VM deallocated', 'VM stopped', 'VM starting', 'VM stopping', 'VM deallocating'].includes(
      String(vm.powerState),
    ),
    'actual selected VM power state unavailable',
  );
  const powerState = String(vm.powerState).slice(3);
  return {
    engine: 'terraform',
    planSha256: plan.planSha256,
    node,
    operation,
    resourceId: selected.resourceId,
    vmId: selected.vmId,
    ownerPlanSha256: selected.ownerPlanSha256,
    powerState,
    converged: powerState === (operation === 'start' ? 'running' : 'deallocated'),
    inventory,
    observedAt: new Date().toISOString(),
  };
}

// plugins/azure/src/ce/terraform-network-routing-observation-validation.ts
var same8 = canonicalEqual;
function require13(value, message) {
  if (!value) throw Error(`Azure Terraform network routing observation validation: ${message}`);
}
function object16(value) {
  require13(value && typeof value === 'object' && !Array.isArray(value), 'complete saved record required');
  return value;
}
function keys(value, expected) {
  const row = object16(value);
  require13(same8(Object.keys(row).sort(), expected.toSorted()), 'saved packet schema differs');
  return row;
}
function validateAzureTerraformNetworkRoutingObservation(plan, source, before, current, node, input, target = true) {
  const stage = buildAzureTerraformNetworkRoutingStage(plan, source, before, current, node),
    stageSha256 = canonicalSha256(stage),
    preparationSha256 = canonicalSha256(prepareAzureTerraformNetworkRouting(plan, source, before, node));
  const value = keys(input, ['schemaVersion', 'stageSha256', 'routing', 'power']);
  require13(value.schemaVersion === 1 && value.stageSha256 === stageSha256, 'saved cloud stage identity differs');
  const routing = keys(value.routing, [
    'schemaVersion',
    'scope',
    'planSha256',
    'node',
    'beforeSha256',
    'expectedSha256',
    'preparationSha256',
    'collectedAt',
    'freshness',
    'forwarding',
    'bgpExchange',
    'interfaceState',
    'nodeHealth',
    'status',
    'configurationState',
    'rows',
    'reason',
  ]);
  const power = keys(value.power, [
    'engine',
    'planSha256',
    'node',
    'operation',
    'resourceId',
    'vmId',
    'ownerPlanSha256',
    'powerState',
    'converged',
    'inventory',
    'observedAt',
  ]);
  require13(
    routing.schemaVersion === 1 &&
      routing.scope === 'azure-dependent-routing-configuration' &&
      routing.planSha256 === plan.planSha256 &&
      routing.node === node &&
      routing.beforeSha256 === stage.beforeSha256 &&
      routing.expectedSha256 === stage.currentSha256 &&
      routing.preparationSha256 === preparationSha256 &&
      routing.status === (stage.dependencies.length ? 'observed' : 'not-required') &&
      Array.isArray(routing.rows) &&
      routing.rows.length === stage.dependencies.length &&
      typeof routing.collectedAt === 'string' &&
      Number.isFinite(Date.parse(routing.collectedAt)) &&
      ['forwarding', 'bgpExchange', 'interfaceState', 'nodeHealth'].every((key) => routing[key] === 'unknown') &&
      routing.freshness === 'unqualified',
    'saved routing scope or evidence differs',
  );
  require13(
    routing.reason ===
      (stage.dependencies.length ? 'configuration-installation-only' : 'no-selected-dependent-routing'),
    'saved evidence reason differs',
  );
  const resources = object16(object16(JSON.parse(stage.configuration)).resource);
  for (const [index, dependency] of stage.dependencies.entries()) {
    const row = keys(routing.rows[index], [
        'kind',
        'resourceId',
        'parentId',
        'parentOwnerPlanSha256',
        'node',
        'nicIndex',
        'nic',
        'name',
        'previousIp',
        'currentIp',
        'installedIp',
        'state',
        'provisioningState',
        ...(dependency.kind === 'udr-next-hop' ? ['prefix', 'nextHopType'] : ['peerAsn']),
      ]),
      config = object16(object16(resources[dependency.address.split('.')[0]])[dependency.address.split('.')[1]]);
    const udr = dependency.kind === 'udr-next-hop',
      parentId = dependency.resourceId.slice(
        0,
        dependency.resourceId.lastIndexOf(udr ? '/routes/' : '/bgpConnections/'),
      );
    const owner = object16(object16(object16(resources[udr ? 'azurerm_route_table' : 'azurerm_route_server']).ce).tags)[
      'xcsh-plan-sha256'
    ];
    require13(
      row.kind === dependency.kind &&
        row.resourceId === dependency.resourceId &&
        row.parentId === parentId &&
        row.parentOwnerPlanSha256 === owner &&
        row.node === node &&
        row.nicIndex === dependency.nicIndex &&
        same8(row.nic, current.nodes[String(node)].nics[String(dependency.nicIndex)]) &&
        row.name === config.name &&
        row.previousIp === dependency.previousIp &&
        row.currentIp === dependency.currentIp &&
        row.provisioningState === 'Succeeded' &&
        (row.installedIp === dependency.currentIp || (!target && row.installedIp === dependency.previousIp)) &&
        row.state === (row.installedIp === dependency.currentIp ? 'current' : 'prior') &&
        (udr
          ? row.prefix === config.address_prefix && row.nextHopType === 'VirtualAppliance'
          : row.peerAsn === config.peer_asn),
      'saved routing resource, parent or installed identity differs',
    );
  }
  const states = new Set(routing.rows.map((row) => row.state));
  require13(
    routing.configurationState ===
      (stage.dependencies.length ? (states.size === 1 ? routing.rows[0].state : 'mixed') : 'not-required'),
    'saved configuration state differs',
  );
  validateAzureNetworkUpdateInventory(plan, power.inventory);
  require13(
    power.engine === 'terraform' &&
      power.planSha256 === plan.planSha256 &&
      power.node === node &&
      power.operation === 'start' &&
      power.converged === true &&
      power.powerState === 'running' &&
      power.resourceId === current.nodes[String(node)].resourceId &&
      power.vmId === current.nodes[String(node)].vmId &&
      power.ownerPlanSha256 === current.nodes[String(node)].ownerPlanSha256 &&
      same8(object16(power.inventory).nodes, current.nodes) &&
      typeof power.observedAt === 'string' &&
      Number.isFinite(Date.parse(power.observedAt)),
    'saved current power/cloud identity differs',
  );
  return input;
}

// plugins/azure/src/ce/terraform-network-routing-history.ts
var same9 = (a, b) => canonicalEqual(a, b);
function require14(value, message) {
  if (!value) throw Error(`Azure Terraform network routing history: ${message}`);
}
function keys2(value, names) {
  require14(value && typeof value === 'object' && !Array.isArray(value), 'complete saved record required');
  const row = value;
  require14(same9(Object.keys(row).sort(), names.toSorted()), 'saved packet schema differs');
  return row;
}
async function readAzureTerraformNetworkRoutingHistory(plan, source, before, current, node, store, signal) {
  const data = structuredClone({ plan, before, current, node }),
    inputSha256 = canonicalSha256(data),
    original = { read: store.read, verify: store.verify },
    ownerSha256 = canonicalSha256(store.owner);
  require14(ownerSha256 === canonicalSha256(azureUpgradeBinding(data.plan).owner), 'storage owner differs');
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    require14(
      canonicalSha256({ plan, before, current, node }) === inputSha256 &&
        canonicalSha256(data) === inputSha256 &&
        canonicalSha256(store.owner) === ownerSha256 &&
        store.read === original.read &&
        store.verify === original.verify,
      'input or owning reader changed',
    );
  };
  const step = async (action) => {
    seal();
    const abort = Promise.withResolvers(),
      onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([action(), abort.promise]);
      seal();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const prefix = `${data.plan.planId}-terraform-network-node-${node}-routing`,
    packetSha256ByName = {};
  const read = async (name) => {
    const value = structuredClone(await step(() => original.read.call(store, name))),
      digest = canonicalSha256(value);
    require14(
      packetSha256ByName[name] === undefined || packetSha256ByName[name] === digest,
      'packet changed during history read',
    );
    packetSha256ByName[name] = digest;
    return value;
  };
  await step(() => original.verify.call(store));
  const prepared = await read(`${prefix}-prepared.json`);
  const { current: retainedCurrent, stage } = validateAzureTerraformNetworkRoutingPrepared(
    data.plan,
    source,
    data.before,
    data.current,
    node,
    prepared,
  );
  const observation = (value) =>
    validateAzureTerraformNetworkRoutingObservation(data.plan, source, data.before, retainedCurrent, node, value);
  const receipt = (value, phase) => {
    validateAzureTerraformNetworkRoutingReceipt(data.plan, source, data.before, retainedCurrent, stage, value, phase);
    return value;
  };
  for (const phase of ['mutation', 'release']) {
    const saved = receipt(await read(`${prefix}-${phase}-plan.json`), phase),
      binding = keys2(await read(`${prefix}-${phase}-binding.json`), [
        'schemaVersion',
        'kind',
        'phase',
        'planSha256',
        'stageSha256',
        'beforeSha256',
        'currentSha256',
        'receiptSha256',
        'providerLockSha256',
        'prior',
        'proposed',
      ]);
    require14(
      same9(
        { ...binding, prior: undefined, proposed: undefined },
        {
          schemaVersion: 1,
          kind: 'dependent-routing',
          phase,
          planSha256: data.plan.planSha256,
          stageSha256: canonicalSha256(stage),
          beforeSha256: canonicalSha256(data.before),
          currentSha256: canonicalSha256(retainedCurrent),
          receiptSha256: canonicalSha256(saved),
          providerLockSha256: saved.providerLockSha256,
          prior: undefined,
          proposed: undefined,
        },
      ),
      'saved binding identity differs',
    );
    validateAzureTerraformNetworkRoutingProjection(
      data.plan,
      source,
      data.before,
      retainedCurrent,
      stage,
      saved,
      phase,
      binding.prior,
      binding.proposed,
    );
    const outcome = await read(`${prefix}-${phase}-outcome.json`),
      complete = keys2(await read(`${prefix}-${phase}-complete.json`), ['schemaVersion', 'receiptSha256', 'outcome']);
    require14(
      complete.schemaVersion === 1 &&
        complete.receiptSha256 === canonicalSha256(saved) &&
        same9(complete.outcome, outcome),
      'saved completion receipt and immutable outcome differ',
    );
    observation(outcome);
  }
  const terminal = keys2(await read(`${prefix}-final-plan.json`), [
    'schemaVersion',
    'receipt',
    'prior',
    'proposed',
    'cloud',
  ]);
  require14(terminal.schemaVersion === 1, 'saved final schema differs');
  const final = receipt(terminal.receipt, 'release');
  require14(final.noChanges, 'final refresh changes retained resources');
  validateAzureTerraformNetworkRoutingProjection(
    data.plan,
    source,
    data.before,
    retainedCurrent,
    stage,
    final,
    'release',
    terminal.prior,
    terminal.proposed,
  );
  const cloud = observation(terminal.cloud);
  for (const [name, digest] of Object.entries(packetSha256ByName))
    require14(
      canonicalSha256(await step(() => original.read.call(store, name))) === digest,
      'packet changed during history read',
    );
  await step(() => original.verify.call(store));
  seal();
  return {
    status: 'routing-stage-history-verified',
    engine: 'terraform',
    planSha256: data.plan.planSha256,
    node,
    configurationSha256: stage.releasedConfigurationSha256,
    inventory: structuredClone(cloud.power.inventory),
    packetSha256ByName,
    forwarding: 'unknown',
    bgpExchange: 'unknown',
    freshness: 'unqualified',
  };
}

// plugins/azure/src/ce/terraform-network-stage-history.ts
var same10 = (a, b) => canonicalEqual(a, b);
var hash4 = (value) => createHash5('sha256').update(value).digest('hex');
function require15(value, message) {
  if (!value) throw Error(`Azure Terraform network stage history: ${message}`);
}
function object17(value) {
  require15(value && typeof value === 'object' && !Array.isArray(value), 'complete saved record required');
  return value;
}
function keys3(value, names) {
  const row = object17(value);
  require15(same10(Object.keys(row).sort(), names.toSorted()), 'saved packet schema differs');
  return row;
}
async function readAzureTerraformNetworkNodeHistory(plan, source, before, node, phase, store, signal) {
  signal?.throwIfAborted();
  validateAzureNetworkUpdateInventory(plan, before);
  require15(
    plan.engine === 'terraform' &&
      plan.intent.operation === 'update-network' &&
      Number.isInteger(node) &&
      node >= 1 &&
      node <= plan.topology.nodeCount &&
      ['deallocated', 'nic-complete', 'restarted', 'routing-complete'].includes(phase) &&
      same10(store.owner, azureUpgradeBinding(plan).owner),
    'exact owning node and phase required',
  );
  await store.verify();
  const stage = buildAzureTerraformNetworkPinnedNicStage(plan, source, before, node),
    prefix = `${plan.planId}-terraform-network-node-${node}`,
    priorNics = Array.from({ length: node - 1 }, (_, n) => plan.nics.map((nic) => `${n + 1}:${nic.index}`)).flat(),
    reachedNics = [...priorNics, ...plan.nics.map((nic) => `${node}:${nic.index}`)];
  const packetSha256ByName = {};
  const read = async (name) => {
    signal?.throwIfAborted();
    const value = await store.read(name);
    const digest = canonicalSha256(value);
    require15(
      packetSha256ByName[name] === undefined || packetSha256ByName[name] === digest,
      'packet changed during history read',
    );
    packetSha256ByName[name] = digest;
    return value;
  };
  const cloud = (value, operation, applied, nic = false) => {
    const row = keys3(value, [
      'engine',
      'planSha256',
      'node',
      'operation',
      'resourceId',
      'vmId',
      'ownerPlanSha256',
      'powerState',
      'converged',
      'inventory',
      'observedAt',
      ...(nic ? ['appliedNics', 'baseline', 'nicConverged'] : []),
    ]);
    require15(
      row.engine === 'terraform' &&
        row.planSha256 === plan.planSha256 &&
        row.node === node &&
        row.operation === operation &&
        row.resourceId === before.nodes[String(node)].resourceId &&
        row.vmId === before.nodes[String(node)].vmId &&
        row.ownerPlanSha256 === before.nodes[String(node)].ownerPlanSha256 &&
        row.powerState === (operation === 'start' ? 'running' : 'deallocated') &&
        row.converged === true &&
        typeof row.observedAt === 'string' &&
        Number.isFinite(Date.parse(row.observedAt)),
      'saved cloud completion identity differs',
    );
    const inventory = validateAzureNetworkUpdateInventory(plan, row.inventory);
    verifyAzureNetworkUpdateProgress(plan, before, inventory, applied);
    for (const [owner, vm] of Object.entries(before.nodes))
      for (const [index, identity] of Object.entries(vm.nics))
        if (!applied.includes(`${owner}:${index}`))
          require15(
            inventory.nodes[owner].nics[index].privateIp === identity.privateIp,
            'unsubmitted historical private IP changed',
          );
    if (nic) {
      const baseline = Object.entries(before.nodes[String(node)].nics).every(([index, identity]) => {
        const observed = inventory.nodes[String(node)].nics[index];
        return (
          observed.subnetId.toLowerCase() === identity.subnetId.toLowerCase() &&
          observed.privateIp === identity.privateIp
        );
      });
      require15(
        same10(row.appliedNics, reachedNics) && row.nicConverged === true && row.baseline === baseline,
        'complete selected NIC boundary required',
      );
    }
    return inventory;
  };
  const completed = async (name, receipt, expectedOutcomeName) => {
    const row = keys3(await read(name), ['schemaVersion', 'receiptSha256', 'outcome']);
    require15(
      row.schemaVersion === 1 &&
        row.receiptSha256 === canonicalSha256(receipt) &&
        same10(row.outcome, await read(expectedOutcomeName)),
      'saved completion differs from exact receipt/outcome',
    );
    return row.outcome;
  };
  const power = async (operation, applied) => {
    const powerPrefix = `${prefix}-${operation}`;
    const mutation = await validateAzureTerraformNetworkPowerPlan(
      plan,
      before,
      node,
      operation,
      await read(`${powerPrefix}-mutation-plan.json`),
      'mutation',
    );
    const projection = async (receipt, selected) => {
      const row = keys3(await read(`${powerPrefix}-${selected}-binding.json`), [
        'schemaVersion',
        'receiptSha256',
        'prior',
        'proposed',
      ]);
      require15(
        row.schemaVersion === 1 && row.receiptSha256 === canonicalSha256(receipt),
        'power projection receipt differs',
      );
      await validateAzureTerraformNetworkPowerProjection(
        plan,
        before,
        node,
        operation,
        receipt,
        selected,
        row.prior,
        row.proposed,
      );
    };
    await projection(mutation, 'mutation');
    cloud(
      await completed(`${powerPrefix}-mutation-complete.json`, mutation, `${powerPrefix}-mutation-outcome.json`),
      operation,
      applied,
    );
    const release = await validateAzureTerraformNetworkPowerPlan(
      plan,
      before,
      node,
      operation,
      await read(`${powerPrefix}-release-plan.json`),
      'release',
    );
    await projection(release, 'release');
    const outcome = keys3(
      await completed(`${powerPrefix}-release-complete.json`, release, `${powerPrefix}-release-outcome.json`),
      ['cloud', 'state'],
    );
    require15(
      same10(outcome.state, {
        'azapi_resource_action.ce_network': null,
      }),
      'temporary control remains in completed release',
    );
    const inventory = cloud(outcome.cloud, operation, applied);
    await validateAzureTerraformNetworkPowerPlan(
      plan,
      before,
      node,
      operation,
      await read(`${powerPrefix}-final-plan.json`),
      'final',
    );
    return inventory;
  };
  let inventory = await power('deallocate', priorNics),
    configurationSha256 = hash4(source);
  if (phase !== 'deallocated') {
    const prepared = keys3(await read(`${prefix}-prepared.json`), [
      'schemaVersion',
      'planSha256',
      'inventorySha256',
      'appliedNics',
      'stage',
    ]);
    require15(
      prepared.schemaVersion === 1 &&
        prepared.planSha256 === plan.planSha256 &&
        prepared.inventorySha256 === canonicalSha256(before) &&
        same10(prepared.appliedNics, priorNics) &&
        same10(prepared.stage, stage),
      'original prepared source/inventory/stage differs',
    );
    const receipt = await read(`${prefix}-mutation-plan.json`);
    validateAzureNetworkUpdateTerraformReceipt(plan, stage, receipt, AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256);
    const binding = keys3(await read(`${prefix}-nic-binding.json`), [
      'schemaVersion',
      'planSha256',
      'stageSha256',
      'inventorySha256',
      'receiptSha256',
      'providerLockSha256',
      'prior',
      'proposed',
    ]);
    require15(
      binding.schemaVersion === 1 &&
        binding.planSha256 === plan.planSha256 &&
        binding.stageSha256 === canonicalSha256(stage) &&
        binding.inventorySha256 === canonicalSha256(before) &&
        binding.receiptSha256 === canonicalSha256(receipt) &&
        binding.providerLockSha256 === AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256,
      'NIC projection binding differs',
    );
    validateAzureTerraformNetworkNicProjection(
      plan,
      stage,
      before,
      receipt,
      AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256,
      binding.prior,
      binding.proposed,
    );
    cloud(
      await completed(`${prefix}-mutation-complete.json`, receipt, `${prefix}-mutation-outcome.json`),
      'deallocate',
      reachedNics,
      true,
    );
    const final = keys3(await read(`${prefix}-final-plan.json`), [
      'schemaVersion',
      'receipt',
      'cloud',
      'prior',
      'proposed',
    ]);
    require15(final.schemaVersion === 1, 'final NIC packet version differs');
    inventory = cloud(final.cloud, 'deallocate', reachedNics, true);
    const finalReceipt = final.receipt;
    validateAzureNetworkUpdateTerraformReceipt(plan, stage, finalReceipt, AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256);
    require15(finalReceipt.noChanges, 'historical final NIC plan changes resources');
    validateAzureTerraformNetworkNicProjection(
      plan,
      stage,
      inventory,
      finalReceipt,
      AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256,
      final.prior,
      final.proposed,
    );
    configurationSha256 = stage.configurationSha256;
  }
  if (phase === 'restarted' || phase === 'routing-complete') inventory = await power('start', reachedNics);
  if (phase === 'routing-complete') {
    const routing = await readAzureTerraformNetworkRoutingHistory(
      plan,
      source,
      before,
      inventory,
      node,
      { owner: store.owner, verify: () => store.verify(), read },
      signal,
    );
    inventory = routing.inventory;
    configurationSha256 = routing.configurationSha256;
    Object.assign(packetSha256ByName, routing.packetSha256ByName);
  }
  for (const [name, digest] of Object.entries(packetSha256ByName)) {
    signal?.throwIfAborted();
    require15(canonicalSha256(await store.read(name)) === digest, 'packet changed during history read');
  }
  signal?.throwIfAborted();
  await store.verify();
  return {
    status: 'node-stage-history-verified',
    engine: 'terraform',
    planSha256: plan.planSha256,
    node,
    phase,
    configurationSha256,
    inventory: structuredClone(inventory),
    packetSha256ByName,
  };
}

// plugins/azure/src/ce/terraform-network-checkpoint.ts
var hash5 = (text) => createHash6('sha256').update(text).digest('hex');
var same11 = canonicalEqual;
var sha3 = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function require16(value, message) {
  if (!value) throw Error(`Azure Terraform network checkpoint: ${message}`);
}
function keys4(value, expected) {
  require16(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      same11(Object.keys(value).sort(), expected.toSorted()),
    'saved schema differs',
  );
}
async function optional2(store, name) {
  try {
    return await store.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

class AzureTerraformNetworkCheckpoint {
  plan;
  binding;
  store;
  qualifyAcceptance;
  constructor(plan, binding, store, qualifyAcceptance) {
    this.plan = plan;
    this.binding = binding;
    this.store = store;
    this.qualifyAcceptance = qualifyAcceptance;
  }
  get name() {
    return `${this.plan.planId}-terraform-network-driver-checkpoint.json`;
  }
  get rootName() {
    return `${this.plan.planId}-terraform-network-driver-root.json`;
  }
  revisionName(revision) {
    return `${this.plan.planId}-terraform-network-driver-revision-${revision}.json`;
  }
  async publishRevision(value, signal) {
    signal?.throwIfAborted();
    const name = this.revisionName(value.revision),
      saved = await optional2(this.store, name);
    if (saved !== undefined) require16(same11(saved, value), 'immutable revision differs from proposed transition');
    else await this.store.write(name, value);
    signal?.throwIfAborted();
  }
  async verifyRevisions(value, signal) {
    let previous = this.initial();
    const hashes = {};
    for (let revision = 0; revision <= value.revision; revision++) {
      signal?.throwIfAborted();
      const name = this.revisionName(revision),
        input = await this.store.read(name);
      hashes[name] = canonicalSha256(input);
      if (revision === 0) require16(same11(input, previous), 'original revision differs');
      else {
        keys4(input, Object.keys(previous));
        const next = input,
          transition = next.lastTransition;
        require16(
          next.revision === revision && next.previousCheckpointSha256 === canonicalSha256(previous) && transition,
          'immutable revision chain differs',
        );
        keys4(transition, ['kind', 'node', 'payloadSha256']);
        const expected = structuredClone(previous),
          last = expected.nodes.at(-1);
        const proposed = next.nodes?.at(-1);
        require16(proposed && transition.node === proposed.node, 'revision selected node differs');
        if (transition.kind === 'prepare') {
          require16(
            last.phase === 'accepted' &&
              proposed.node === last.node + 1 &&
              proposed.phase === 'prepared' &&
              proposed.history === undefined &&
              proposed.acceptance === undefined,
            'revision predecessor is not accepted',
          );
          expected.nodes.push(structuredClone(proposed));
        } else {
          require16(
            proposed.node === last.node && same11(proposed.before, last.before),
            'revision changed original node boundary',
          );
          if (transition.kind === 'stage') {
            require16(
              ['prepared', 'deallocated', 'nic-complete', 'restarted'].indexOf(last.phase) ===
                ['deallocated', 'nic-complete', 'restarted', 'routing-complete'].indexOf(proposed.phase) &&
                proposed.history &&
                proposed.acceptance === undefined,
              'revision skipped a stage',
            );
            last.phase = proposed.phase;
            last.history = structuredClone(proposed.history);
          } else {
            require16(
              transition.kind === 'accept' &&
                last.phase === 'routing-complete' &&
                proposed.phase === 'accepted' &&
                same11(proposed.history, last.history) &&
                proposed.acceptance,
              'revision acceptance boundary differs',
            );
            last.phase = 'accepted';
            last.acceptance = structuredClone(proposed.acceptance);
          }
        }
        expected.revision++;
        expected.previousCheckpointSha256 = canonicalSha256(previous);
        expected.lastTransition = structuredClone(transition);
        require16(same11(next, expected), 'revision changed an unrelated serial boundary');
        previous = structuredClone(next);
      }
    }
    require16(same11(previous, value), 'checkpoint differs from immutable revision');
    for (const [name, digest] of Object.entries(hashes)) {
      signal?.throwIfAborted();
      require16(canonicalSha256(await this.store.read(name)) === digest, 'revision changed during validation');
    }
  }
  initial() {
    return {
      schemaVersion: 1,
      kind: 'azure-terraform-network-serial-checkpoint',
      engine: 'terraform',
      owner: structuredClone(this.store.owner),
      planSha256: this.plan.planSha256,
      sourceBindingSha256: canonicalSha256(this.binding),
      nodes: [{ node: 1, before: structuredClone(this.binding.before), phase: 'prepared' }],
      revision: 0,
      previousCheckpointSha256: null,
      lastTransition: null,
    };
  }
  async verifyBinding(signal) {
    signal?.throwIfAborted();
    await this.store.verify();
    require16(
      same11(this.store.owner, azureUpgradeBinding(this.plan).owner) &&
        same11(this.binding.owner, this.store.owner) &&
        this.binding.planSha256 === this.plan.planSha256 &&
        this.binding.kind === 'azure-terraform-network-original-source' &&
        this.binding.engine === 'terraform' &&
        this.binding.schemaVersion === 1 &&
        hash5(this.binding.source) === this.binding.sourceConfigurationSha256 &&
        same11(await this.store.read(`${this.plan.planId}-terraform-network-source.json`), this.binding),
      'frozen original source binding differs',
    );
    validateAzureNetworkUpdateInventory(this.plan, this.binding.before);
  }
  async noStagePublication(signal) {
    signal?.throwIfAborted();
    const names = await readdir(this.store.directory);
    require16(
      !names.some((name) => name.startsWith(`${this.plan.planId}-terraform-network-node-`)),
      'missing root checkpoint after stage publication',
    );
  }
  static async inspect(plan, binding, store, qualifyAcceptance, signal) {
    signal?.throwIfAborted();
    verifyAzureCePlan(plan);
    require16(
      plan.engine === 'terraform' &&
        plan.intent.operation === 'update-network' &&
        typeof qualifyAcceptance === 'function',
      'owning existing network history and operational verifier required',
    );
    return new AzureTerraformNetworkCheckpoint(
      structuredClone(plan),
      structuredClone(binding),
      store,
      qualifyAcceptance,
    ).load(signal);
  }
  static async open(plan, binding, store, qualifyAcceptance, signal) {
    signal?.throwIfAborted();
    verifyAzureCePlan(plan);
    require16(
      plan.engine === 'terraform' &&
        plan.intent.operation === 'update-network' &&
        typeof qualifyAcceptance === 'function',
      'owning network plan and operational verifier required',
    );
    const instance = new AzureTerraformNetworkCheckpoint(
      structuredClone(plan),
      structuredClone(binding),
      store,
      qualifyAcceptance,
    );
    const unlock = await acquireProcessLock(`${store.directory}/.terraform-network-checkpoint-lock`);
    try {
      await instance.verifyBinding(signal);
      const initial = instance.initial(),
        root = { schemaVersion: 1, initialCheckpointSha256: canonicalSha256(initial) };
      const savedRoot = await optional2(store, instance.rootName),
        saved = await optional2(store, instance.name);
      if (savedRoot === undefined) {
        require16(saved === undefined, 'root marker missing after checkpoint publication');
        await instance.noStagePublication(signal);
        signal?.throwIfAborted();
        await store.write(instance.rootName, root);
      } else require16(same11(savedRoot, root), 'root marker differs');
      if (saved === undefined) {
        await instance.noStagePublication(signal);
        signal?.throwIfAborted();
        await instance.publishRevision(initial, signal);
        await store.write(instance.name, initial);
      }
      await instance.load(signal);
      return instance;
    } finally {
      await unlock();
    }
  }
  appliedBefore(node) {
    return Array.from({ length: node - 1 }, (_, i) => this.plan.nics.map((nic) => `${i + 1}:${nic.index}`)).flat();
  }
  before(value, node) {
    const applied = this.appliedBefore(node);
    verifyAzureNetworkUpdateProgress(this.plan, this.binding.before, value, applied);
    for (const [owner, vm] of Object.entries(this.binding.before.nodes))
      for (const [index, nic] of Object.entries(vm.nics))
        if (!applied.includes(`${owner}:${index}`))
          require16(value.nodes[owner].nics[index].privateIp === nic.privateIp, 'unsubmitted private IP changed');
  }
  identity(row) {
    require16(
      row.history?.phase === 'routing-complete',
      'routing completion history required for operational acceptance',
    );
    return {
      owner: structuredClone(this.store.owner),
      planSha256: this.plan.planSha256,
      node: row.node,
      siteName: this.plan.siteName,
      siteUid: this.binding.qualification.siteUid,
      siteConfigurationSha256: this.binding.qualification.siteConfigurationSha256,
      configurationSha256: row.history.configurationSha256,
      inventory: structuredClone(row.history.inventory),
    };
  }
  async verification(receipt, row, mode, signal) {
    signal?.throwIfAborted();
    const verification = await this.qualifyAcceptance(structuredClone(receipt), this.identity(row), mode, signal);
    signal?.throwIfAborted();
    keys4(verification, ['status', 'scope', 'evidenceSha256']);
    require16(
      verification.status === 'verified' &&
        verification.scope === 'node-interfaces-routing-traffic' &&
        sha3(verification.evidenceSha256),
      'complete verified operational scope required',
    );
    return structuredClone(verification);
  }
  async validate(input, signal) {
    keys4(input, [
      'schemaVersion',
      'kind',
      'engine',
      'owner',
      'planSha256',
      'sourceBindingSha256',
      'nodes',
      'revision',
      'previousCheckpointSha256',
      'lastTransition',
    ]);
    const value = input;
    require16(
      value.schemaVersion === 1 &&
        value.kind === 'azure-terraform-network-serial-checkpoint' &&
        value.engine === 'terraform' &&
        same11(value.owner, this.store.owner) &&
        value.planSha256 === this.plan.planSha256 &&
        value.sourceBindingSha256 === canonicalSha256(this.binding) &&
        Array.isArray(value.nodes) &&
        value.nodes.length >= 1 &&
        value.nodes.length <= this.plan.topology.nodeCount &&
        Number.isInteger(value.revision) &&
        value.revision >= 0,
      'checkpoint owner/order identity differs',
    );
    let revision = value.nodes.length - 1,
      source = this.binding.source;
    for (const [i, row] of value.nodes.entries()) {
      signal?.throwIfAborted();
      keys4(row, [
        'node',
        'before',
        'phase',
        ...(row.history !== undefined ? ['history'] : []),
        ...(row.acceptance !== undefined ? ['acceptance'] : []),
      ]);
      require16(
        row.node === i + 1 &&
          ['prepared', 'deallocated', 'nic-complete', 'restarted', 'routing-complete', 'accepted'].includes(
            row.phase,
          ) &&
          (i === value.nodes.length - 1 || row.phase === 'accepted'),
        'complete accepted serial prefix required',
      );
      this.before(row.before, row.node);
      if (i === 0)
        require16(same11(row.before, this.binding.before), 'node one differs from original source inventory');
      const stage = buildAzureTerraformNetworkPinnedNicStage(this.plan, source, row.before, row.node);
      if (row.phase === 'prepared')
        require16(row.history === undefined && row.acceptance === undefined, 'prepared node contains completion');
      else {
        const phase = row.phase === 'accepted' ? 'routing-complete' : row.phase;
        const history = await readAzureTerraformNetworkNodeHistory(
          this.plan,
          source,
          row.before,
          row.node,
          phase,
          this.store,
          signal,
        );
        require16(same11(row.history, history), 'persisted stage history differs');
        if (row.phase === 'accepted') {
          keys4(row.acceptance, ['receipt', 'verification']);
          require16(
            same11(
              row.acceptance?.verification,
              await this.verification(row.acceptance?.receipt, row, 'historical', signal),
            ),
            'operational acceptance provenance differs',
          );
        } else require16(row.acceptance === undefined, 'unaccepted stage contains acceptance');
      }
      revision += ['prepared', 'deallocated', 'nic-complete', 'restarted', 'routing-complete', 'accepted'].indexOf(
        row.phase,
      );
      if (row.phase === 'accepted') {
        require16(row.history, 'accepted routing inventory required');
        source = buildAzureTerraformNetworkRoutingStage(
          this.plan,
          source,
          row.before,
          row.history.inventory,
          row.node,
        ).releasedConfiguration;
      } else source = stage.configuration;
    }
    require16(value.revision === revision, 'checkpoint revision differs from serial progress');
    if (revision === 0) require16(same11(value, this.initial()), 'initial checkpoint differs');
    else {
      keys4(value.lastTransition, ['kind', 'node', 'payloadSha256']);
      const t = value.lastTransition,
        last = value.nodes.at(-1);
      require16(
        sha3(value.previousCheckpointSha256) &&
          sha3(t.payloadSha256) &&
          t.node === last.node &&
          t.kind === (last.phase === 'prepared' ? 'prepare' : last.phase === 'accepted' ? 'accept' : 'stage') &&
          t.payloadSha256 ===
            canonicalSha256(
              last.phase === 'prepared'
                ? last.before
                : last.phase === 'accepted'
                  ? last.acceptance?.receipt
                  : last.phase,
            ),
        'last transition differs',
      );
    }
    return structuredClone(value);
  }
  async load(signal) {
    await this.verifyBinding(signal);
    require16(
      same11(await this.store.read(this.rootName), {
        schemaVersion: 1,
        initialCheckpointSha256: canonicalSha256(this.initial()),
      }),
      'root marker differs',
    );
    const input = await this.store.read(this.name),
      checkpointSha256 = canonicalSha256(input);
    const checkpoint = await this.validate(input, signal);
    await this.verifyRevisions(checkpoint, signal);
    await this.verifyBinding(signal);
    require16(
      canonicalSha256(await this.store.read(this.name)) === checkpointSha256,
      'checkpoint changed during validation',
    );
    return this.snapshot(checkpoint, checkpointSha256);
  }
  snapshot(checkpoint, checkpointSha256) {
    let nodeSource = this.binding.source;
    for (const row of checkpoint.nodes.slice(0, -1)) {
      require16(row.history?.phase === 'routing-complete', 'accepted predecessor routing history required');
      nodeSource = buildAzureTerraformNetworkRoutingStage(
        this.plan,
        nodeSource,
        row.before,
        row.history.inventory,
        row.node,
      ).releasedConfiguration;
    }
    const current = checkpoint.nodes.at(-1);
    const stage = buildAzureTerraformNetworkPinnedNicStage(this.plan, nodeSource, current.before, current.node);
    const routed = ['routing-complete', 'accepted'].includes(current.phase);
    require16(!routed || current.history, 'completed routing identity required');
    const configurationSha256 =
      routed && current.history
        ? buildAzureTerraformNetworkRoutingStage(
            this.plan,
            nodeSource,
            current.before,
            current.history.inventory,
            current.node,
          ).releasedConfigurationSha256
        : ['prepared', 'deallocated'].includes(current.phase)
          ? hash5(nodeSource)
          : stage.configurationSha256;
    return {
      checkpoint,
      checkpointSha256,
      currentNode: current.node,
      phase: current.phase,
      nodeSource,
      configurationSha256,
      allNodesAccepted: current.node === this.plan.topology.nodeCount && current.phase === 'accepted',
    };
  }
  async read(signal) {
    return this.load(signal);
  }
  async change(expectedSha256, transition, mutate, signal) {
    signal?.throwIfAborted();
    require16(sha3(expectedSha256), 'resolved expected checkpoint digest required');
    const unlock = await acquireProcessLock(`${this.store.directory}/.terraform-network-checkpoint-lock`);
    try {
      const current = await this.load(signal);
      if (current.checkpointSha256 !== expectedSha256) {
        require16(
          current.checkpoint.previousCheckpointSha256 === expectedSha256 &&
            same11(current.checkpoint.lastTransition, transition),
          'stale checkpoint comparison',
        );
        return current;
      }
      const pending = await optional2(this.store, this.revisionName(current.checkpoint.revision + 1));
      if (pending !== undefined) {
        const next = await this.validate(pending, signal);
        require16(
          next.previousCheckpointSha256 === expectedSha256 && same11(next.lastTransition, transition),
          'pending immutable revision belongs to another transition',
        );
        await this.verifyRevisions(next, signal);
        await this.verifyBinding(signal);
        require16(
          canonicalSha256(await this.store.read(this.name)) === expectedSha256,
          'checkpoint changed before recovery publication',
        );
        signal?.throwIfAborted();
        await this.store.write(this.name, next);
        signal?.throwIfAborted();
        return this.load(signal);
      }
      const next = structuredClone(current.checkpoint);
      await mutate(next, current.nodeSource);
      next.revision++;
      next.previousCheckpointSha256 = expectedSha256;
      next.lastTransition = transition;
      await this.validate(next, signal);
      await this.verifyBinding(signal);
      require16(
        canonicalSha256(await this.store.read(this.name)) === expectedSha256,
        'checkpoint changed before publication',
      );
      signal?.throwIfAborted();
      await this.publishRevision(next, signal);
      await this.store.write(this.name, next);
      signal?.throwIfAborted();
      return this.load(signal);
    } finally {
      await unlock();
    }
  }
  async recordStage(expectedSha256, node, phase, signal) {
    return this.change(
      expectedSha256,
      { kind: 'stage', node, payloadSha256: canonicalSha256(phase) },
      async (next, source) => {
        const row = next.nodes.at(-1);
        require16(
          row.node === node &&
            ['prepared', 'deallocated', 'nic-complete', 'restarted'].indexOf(row.phase) ===
              ['deallocated', 'nic-complete', 'restarted', 'routing-complete'].indexOf(phase),
          'next selected serial stage required',
        );
        row.history = await readAzureTerraformNetworkNodeHistory(
          this.plan,
          source,
          row.before,
          node,
          phase,
          this.store,
          signal,
        );
        row.phase = phase;
      },
      signal,
    );
  }
  async acceptNode(expectedSha256, node, receipt, signal) {
    return this.change(
      expectedSha256,
      { kind: 'accept', node, payloadSha256: canonicalSha256(receipt) },
      async (next) => {
        const row = next.nodes.at(-1);
        require16(row.node === node && row.phase === 'routing-complete', 'selected routing-complete node required');
        row.acceptance = {
          receipt: structuredClone(receipt),
          verification: await this.verification(receipt, row, 'current', signal),
        };
        row.phase = 'accepted';
      },
      signal,
    );
  }
  async prepareNextNode(expectedSha256, before, signal) {
    const current = await this.read(signal);
    const node =
      current.checkpoint.previousCheckpointSha256 === expectedSha256 &&
      current.checkpoint.lastTransition?.kind === 'prepare'
        ? current.checkpoint.lastTransition.node
        : current.currentNode + 1;
    return this.change(
      expectedSha256,
      { kind: 'prepare', node, payloadSha256: canonicalSha256(before) },
      async (next) => {
        const last = next.nodes.at(-1);
        require16(
          last.phase === 'accepted' && node === last.node + 1 && node <= this.plan.topology.nodeCount,
          'accepted predecessor and next node required',
        );
        this.before(before, node);
        next.nodes.push({ node, before: structuredClone(before), phase: 'prepared' });
      },
      signal,
    );
  }
}

// plugins/azure/src/ce/terraform-network-generation-history.ts
// plugins/azure/src/ce/terraform-network-replacement-completion.ts
// plugins/azure/src/ce/terraform-network-replacement-binding-reader.ts
import { createHash as createHash7, createHash as createHash14, createHash as createHash16 } from 'node:crypto';

var same12 = canonicalEqual;
function require17(value, message) {
  if (!value) throw Error(`Azure Terraform network replacement binding reader: ${message}`);
}
async function readAzureTerraformNetworkReplacementSourceBinding(
  request,
  store,
  loaders,
  siteRequest,
  expectedSourceBindingSha256,
  verifier,
  signal,
  qualifiedPrevious,
  replacementVerifier,
  owningRead,
) {
  signal?.throwIfAborted();
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const plan = structuredClone(request),
    owner = structuredClone(store.owner),
    site = structuredClone(siteRequest);
  verifyAzureCePlan(plan);
  const profile = verifyAzureTerraformNetworkReplacementProfile(plan);
  require17(
    typeof expectedSourceBindingSha256 === 'string' &&
      /^[a-f0-9]{64}$/.test(expectedSourceBindingSha256) &&
      same12(owner, azureUpgradeBinding(plan).owner) &&
      typeof verifier === 'function' &&
      site &&
      Object.keys(site).sort().join(',') === 'siteConfigurationSha256,siteUid' &&
      typeof site.siteUid === 'string' &&
      site.siteUid &&
      typeof site.siteConfigurationSha256 === 'string' &&
      /^[a-f0-9]{64}$/.test(site.siteConfigurationSha256),
    'resolved owning plan, site and source-binding digest required',
  );
  const bounded = async (task) => {
    deadline.throwIfAborted();
    const abort = Promise.withResolvers();
    const onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([task(), abort.promise]);
      deadline.throwIfAborted();
      return result;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const verifyOwner = async () => {
    require17(
      same12(plan, request) && same12(site, siteRequest) && same12(owner, store.owner),
      'requested identity changed during reading',
    );
    await bounded(() => store.verify());
  };
  await verifyOwner();
  const packets = new Map(),
    sources = new Map(),
    outcomes = new Map();
  const remember = (map, name, value) => {
    const digest = canonicalSha256(value);
    require17(!map.has(name) || map.get(name) === digest, 'source or historical packet changed during reading');
    map.set(name, digest);
  };
  const read = async (name) => {
    const value = await bounded(() => store.read(name));
    remember(packets, name, value);
    return structuredClone(value);
  };
  const readonlyStore = new Proxy(store, {
    get(target, key) {
      if (key === 'read') return read;
      if (key === 'verify') return verifyOwner;
      if (['write', 'remove', 'retire'].includes(String(key)))
        return () => {
          throw Error('Binding reader must not mutate storage');
        };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const tracked = {
    async loadSource(digest) {
      const value = await bounded(() => loaders.loadSource(digest));
      verifyAzureCePlan(value);
      require17(value.planSha256 === digest, 'loaded predecessor digest differs');
      remember(sources, digest, value);
      return structuredClone(value);
    },
    async loadOutcome(p) {
      const value = await bounded(() => loaders.loadOutcome(structuredClone(p))),
        digest = canonicalSha256(value);
      require17(
        !outcomes.has(p.planSha256) || outcomes.get(p.planSha256)?.digest === digest,
        'original outcome changed during reading',
      );
      outcomes.set(p.planSha256, { plan: structuredClone(p), digest });
      return structuredClone(value);
    },
  };
  const original = await tracked.loadSource(profile.originalPlanSha256),
    retained = await tracked.loadSource(profile.retainedPlanSha256);
  const deployment = await bounded(() => azureTerraformCurrentDeployment(plan)),
    lock = createHash7('sha256').update(deployment.providerLock).digest('hex');
  const raw = await read(`${plan.planId}-terraform-network-replacement-source.json`);
  require17(canonicalSha256(raw) === expectedSourceBindingSha256, 'saved binding differs from owning journal digest');
  const binding = validateAzureTerraformNetworkReplacementBindingIdentity(plan, owner, retained, lock, site, raw);
  const qualification = await bounded(() =>
    qualifyAzureTerraformNetworkBoundReplacementSource(
      {
        plan,
        originalPlan: original,
        networkPlan: retained,
        source: binding.source,
        inventory: binding.before,
        providerLockSha256: lock,
        site,
      },
      readonlyStore,
      tracked,
      verifier,
      deadline,
      replacementVerifier,
      qualifiedPrevious,
    ),
  );
  require17(same12(binding.qualification, qualification), 'saved source qualification differs');
  if (owningRead) await bounded(() => owningRead(structuredClone(binding), readonlyStore));
  for (const [name, digest] of sources)
    require17(
      canonicalSha256(await bounded(() => loaders.loadSource(name))) === digest,
      'predecessor source changed before returning binding',
    );
  for (const { plan: p, digest } of outcomes.values())
    require17(
      canonicalSha256(await bounded(() => loaders.loadOutcome(structuredClone(p)))) === digest,
      'original outcome changed before returning binding',
    );
  for (const [name, digest] of packets)
    require17(
      canonicalSha256(await bounded(() => store.read(name))) === digest,
      'historical packet changed before returning binding',
    );
  await verifyOwner();
  require17(
    canonicalSha256(await bounded(() => store.read(`${plan.planId}-terraform-network-replacement-source.json`))) ===
      expectedSourceBindingSha256,
    'owning binding changed at final read boundary',
  );
  return {
    schemaVersion: 1,
    kind: 'azure-terraform-network-replacement-binding-read',
    sourceBindingSha256: expectedSourceBindingSha256,
    binding: structuredClone(binding),
    currentOperationalAcceptanceQualified: false,
  };
}

// plugins/azure/src/ce/terraform-network-replacement-execution-journal.ts
var same13 = canonicalEqual;
var sha4 = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function require18(value, message) {
  if (!value) throw Error(`Azure Terraform network replacement execution journal: ${message}`);
}
var journalName = (plan) => `${plan.planId}-terraform-network-replacement-execution.json`;
function fromBinding(plan, binding) {
  const node = plan.intent.replacementNode;
  require18(
    typeof node === 'number' && Number.isSafeInteger(node) && node >= 1 && node <= plan.topology.nodeCount,
    'exact selected node required',
  );
  return {
    schemaVersion: 1,
    kind: 'azure-terraform-network-replacement-execution-binding',
    engine: 'terraform',
    owner: structuredClone(binding.owner),
    planSha256: plan.planSha256,
    originalPlanSha256: binding.originalPlanSha256,
    retainedPlanSha256: binding.retainedPlanSha256,
    node,
    sourceBindingSha256: canonicalSha256(binding),
    sourceConfigurationSha256: binding.sourceConfigurationSha256,
    providerLockSha256: binding.providerLockSha256,
    site: structuredClone(binding.site),
  };
}
function context(request, store, siteRequest, signal) {
  signal?.throwIfAborted();
  const plan = structuredClone(request),
    owner = structuredClone(store.owner),
    site = structuredClone(siteRequest);
  verifyAzureCePlan(plan);
  verifyAzureTerraformNetworkReplacementProfile(plan);
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const bounded = async (task) => {
    deadline.throwIfAborted();
    const abort = Promise.withResolvers(),
      onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([task(), abort.promise]);
      deadline.throwIfAborted();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const verify = async () => {
    const identity = () =>
      require18(
        same13(plan, request) &&
          same13(owner, store.owner) &&
          same13(site, siteRequest) &&
          same13(owner, azureUpgradeBinding(plan).owner),
        'requested owning identity changed',
      );
    identity();
    await bounded(() => store.verify());
    identity();
  };
  const optional = async (name) => {
    try {
      return await bounded(() => store.read(name));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  };
  return { plan, owner, site, deadline, bounded, verify, optional };
}
function validate(plan, owner, site, input) {
  require18(input && typeof input === 'object' && !Array.isArray(input), 'complete owning journal required');
  const row = input,
    profile = verifyAzureTerraformNetworkReplacementProfile(plan);
  require18(
    Object.keys(row).sort().join(',') ===
      'engine,kind,node,originalPlanSha256,owner,planSha256,providerLockSha256,retainedPlanSha256,schemaVersion,site,sourceBindingSha256,sourceConfigurationSha256' &&
      row.schemaVersion === 1 &&
      row.kind === 'azure-terraform-network-replacement-execution-binding' &&
      row.engine === 'terraform' &&
      same13(row.owner, owner) &&
      same13(row.site, site) &&
      row.planSha256 === plan.planSha256 &&
      row.originalPlanSha256 === profile.originalPlanSha256 &&
      row.retainedPlanSha256 === profile.retainedPlanSha256 &&
      row.node === plan.intent.replacementNode &&
      sha4(row.sourceBindingSha256) &&
      sha4(row.sourceConfigurationSha256) &&
      sha4(row.providerLockSha256),
    'journal schema or immutable identity differs',
  );
  return row;
}
var result = (journal) => ({
  schemaVersion: 1,
  kind: 'azure-terraform-network-replacement-execution-journal-read',
  journalSha256: canonicalSha256(journal),
  journal: structuredClone(journal),
  currentOperationalAcceptanceQualified: false,
});
async function readAzureTerraformNetworkReplacementExecutionBinding(
  request,
  store,
  loaders,
  siteRequest,
  expectedJournalSha256,
  verifier,
  signal,
  qualifiedPrevious,
  replacementVerifier,
) {
  require18(sha4(expectedJournalSha256), 'resolved owning journal digest required');
  const c = context(request, store, siteRequest, signal);
  await c.verify();
  const raw = await c.bounded(() => store.read(journalName(c.plan)));
  require18(canonicalSha256(raw) === expectedJournalSha256, 'journal differs from owning expected digest');
  const row = validate(c.plan, c.owner, c.site, raw);
  const source = await readAzureTerraformNetworkReplacementSourceBinding(
    c.plan,
    store,
    loaders,
    c.site,
    row.sourceBindingSha256,
    verifier,
    c.deadline,
    qualifiedPrevious,
    replacementVerifier,
    async (binding, readonlyStore) => {
      require18(same13(row, fromBinding(c.plan, binding)), 'journal differs from authenticated source binding');
      await c.verify();
      require18(
        canonicalSha256(await c.bounded(() => readonlyStore.read(journalName(c.plan)))) === expectedJournalSha256,
        'journal changed at final historical read boundary',
      );
    },
  );
  return { execution: result(row), source };
}
async function readAzureTerraformNetworkReplacementExecutionJournal(
  request,
  store,
  loaders,
  siteRequest,
  expectedJournalSha256,
  verifier,
  signal,
  qualifiedPrevious,
  replacementVerifier,
) {
  return (
    await readAzureTerraformNetworkReplacementExecutionBinding(
      request,
      store,
      loaders,
      siteRequest,
      expectedJournalSha256,
      verifier,
      signal,
      qualifiedPrevious,
      replacementVerifier,
    )
  ).execution;
}
async function bindAzureTerraformNetworkReplacementExecutionJournal(
  request,
  store,
  loaders,
  siteRequest,
  expectedSourceBindingSha256,
  verifier,
  signal,
  replacementVerifier,
) {
  require18(sha4(expectedSourceBindingSha256), 'resolved owning source-binding digest required');
  const c = context(request, store, siteRequest, signal);
  await c.verify();
  const release = await acquireProcessLock(`${store.directory}/.terraform-replacement-lock`);
  try {
    c.deadline.throwIfAborted();
    await c.verify();
    const name = journalName(c.plan),
      saved = await c.optional(name);
    if (saved !== undefined) {
      const row = validate(c.plan, c.owner, c.site, saved);
      require18(row.sourceBindingSha256 === expectedSourceBindingSha256, 'saved journal source-binding digest differs');
      const read = await readAzureTerraformNetworkReplacementExecutionJournal(
        c.plan,
        store,
        loaders,
        c.site,
        canonicalSha256(saved),
        verifier,
        c.deadline,
        undefined,
        replacementVerifier,
      );
      await c.verify();
      require18(
        canonicalSha256(await c.bounded(() => store.read(name))) === read.journalSha256,
        'saved journal changed at final replay boundary',
      );
      return read;
    }
    const p = c.plan,
      token = `${p.deploymentName.slice(0, 40)}-${p.intent.replacementNode}-${p.planSha256.slice(0, 12)}`;
    const later = [
      'replacement',
      'replacement-source',
      'quiesce-plan',
      'launch-plan',
      'quiesce-recovery',
      'launch-recovery',
      'replacement-registration',
      'replacement-final-plan',
      'network-replacement-complete',
    ].map((s) => `${p.planId}-terraform-${s}.json`);
    later.push(`${token}.json`);
    const noLater = async () => {
      for (const name of later)
        require18(
          (await c.optional(name)) === undefined,
          'original journal missing after enrollment or stage publication',
        );
    };
    await noLater();
    const source = await readAzureTerraformNetworkReplacementSourceBinding(
      c.plan,
      store,
      loaders,
      c.site,
      expectedSourceBindingSha256,
      verifier,
      c.deadline,
      undefined,
      replacementVerifier,
    );
    const journal = fromBinding(c.plan, source.binding);
    validate(c.plan, c.owner, c.site, journal);
    await c.verify();
    await noLater();
    require18((await c.optional(name)) === undefined, 'original journal appeared during preparation');
    await c.bounded(() => store.write(name, journal));
    const read = await readAzureTerraformNetworkReplacementExecutionJournal(
      c.plan,
      store,
      loaders,
      c.site,
      canonicalSha256(journal),
      verifier,
      c.deadline,
      undefined,
      replacementVerifier,
    );
    await c.verify();
    require18(
      canonicalSha256(await c.bounded(() => store.read(name))) === read.journalSha256,
      'journal changed at final preparation boundary',
    );
    return read;
  } finally {
    await release();
  }
}

// plugins/azure/src/ce/terraform-replacement.ts
// plugins/azure/src/ce/terraform-network-replacement-enrollment.ts
import { createHash as createHash8, createHash as createHash13 } from 'node:crypto';

// plugins/platform/src/ce/bootstrap.ts
function object18(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed bootstrap response');
  return value;
}
function bindAwsCloudInit(response, jwt) {
  const material = object18(response).cloud_init_config;
  if (typeof material !== 'string' || material.length > 1024 * 1024 || !material.startsWith('#cloud-config'))
    throw new Error('Unsupported cloud-init material');
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(jwt)) throw new Error('Malformed site-bound JWT');
  const bound = material.replaceAll('{{ .Token }}', jwt).replaceAll('{{ .token }}', jwt);
  if (/\{\{|\}\}/.test(bound)) throw new Error('Unresolved cloud-init placeholder');
  let parsed;
  try {
    parsed = object18(Bun.YAML.parse(bound));
  } catch {
    throw new Error('Malformed cloud-init material');
  }
  if (!Array.isArray(parsed.write_files)) throw new Error('Cloud-init has no issued user data');
  const files = parsed.write_files.map(object18);
  if (files.some((file) => file.path === '/etc/vpm/config.yaml'))
    throw new Error('Cloud-init overwrites certified image configuration');
  const userData = files.filter((file) => file.path === '/etc/vpm/user_data');
  if (userData.length !== 1 || typeof userData[0].content !== 'string')
    throw new Error('Cloud-init user data identity is invalid');
  const tokens = userData[0].content.split(/\r?\n/).filter((line) => line.startsWith('token:'));
  if (tokens.length !== 1 || tokens[0].slice('token:'.length).trim() !== jwt)
    throw new Error('Cloud-init does not contain the issued site-bound JWT');
  let vpm;
  try {
    vpm = object18(Bun.YAML.parse(userData[0].content));
  } catch {
    throw new Error('Malformed cloud-init VPM user data');
  }
  if (vpm.token !== jwt) throw new Error('Cloud-init VPM token does not match the issued site-bound JWT');
  return bound;
}

// plugins/azure/src/ce/terraform-network-replacement-enrollment.ts
var digest = (v) => createHash8('sha256').update(v).digest('hex');
var same14 = canonicalEqual;
function require19(v, message) {
  if (!v) throw Error(`Azure Terraform network replacement enrollment: ${message}`);
}
async function observeAzureTerraformNetworkReplacementEnrollment(
  request,
  bootstrap,
  expectedBootstrapSha256,
  store,
  runtime,
  signal,
) {
  signal?.throwIfAborted();
  const plan = structuredClone(request),
    owner = structuredClone(store.owner);
  verifyAzureCePlan(plan);
  verifyAzureTerraformNetworkReplacementProfile(plan);
  const binding = azureUpgradeBinding(plan),
    node = `${plan.deploymentName}-${plan.intent.replacementNode}`,
    tokenName = `${plan.deploymentName.slice(0, 40)}-${plan.intent.replacementNode}-${plan.planSha256.slice(0, 12)}`;
  require19(
    runtime.engine === 'terraform' &&
      same14(owner, binding.owner) &&
      /^[a-f0-9]{64}$/.test(expectedBootstrapSha256) &&
      digest(bootstrap) === expectedBootstrapSha256,
    'resolved owning bootstrap and engine required',
  );
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const bounded = async (task) => {
    deadline.throwIfAborted();
    const abort = Promise.withResolvers(),
      onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([task(), abort.promise]);
      deadline.throwIfAborted();
      return result;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const verify = async () => {
    require19(
      same14(plan, request) && same14(owner, store.owner) && runtime.engine === 'terraform',
      'owning enrollment context changed',
    );
    await bounded(() => store.verify());
    require19(same14(plan, request) && same14(owner, store.owner), 'owning enrollment context changed');
  };
  await verify();
  let raw;
  try {
    raw = await bounded(() => store.read(`${tokenName}.json`));
  } catch (error) {
    if (error.code === 'ENOENT') {
      await verify();
      return;
    }
    throw error;
  }
  require19(raw && typeof raw === 'object' && !Array.isArray(raw), 'complete owning private token required');
  const token = raw;
  require19(
    Object.keys(token).sort().join(',') === 'jwt,node,siteName,tokenName' &&
      token.tokenName === tokenName &&
      token.node === node &&
      token.siteName === plan.siteName &&
      typeof token.jwt === 'string',
    'owning private token identity differs',
  );
  require19(
    bindAwsCloudInit({ cloud_init_config: bootstrap }, token.jwt) === bootstrap,
    'private JWT differs from frozen compiled bootstrap',
  );
  const privateTokenSha256 = canonicalSha256(token),
    tokenSha256 = digest(token.jwt);
  let witness;
  try {
    const current = await bounded(() =>
      runtime.observeIssuedBootstrapToken(binding, node, tokenName, tokenSha256, deadline),
    );
    require19(
      current &&
        Object.keys(current).sort().join(',') ===
          'expiresAt,kind,node,owner,schemaVersion,siteName,tokenName,tokenSha256' &&
        current.schemaVersion === 1 &&
        current.kind === 'ce-issued-bootstrap-current' &&
        same14(current.owner, owner) &&
        current.node === node &&
        current.tokenName === tokenName &&
        current.siteName === plan.siteName &&
        current.tokenSha256 === tokenSha256 &&
        Number.isFinite(current.expiresAt) &&
        current.expiresAt > Date.now() + 60000,
      'complete current enrollment witness required',
    );
    witness = structuredClone(current);
  } catch {
    deadline.throwIfAborted();
  }
  await verify();
  require19(
    canonicalSha256(await bounded(() => store.read(`${tokenName}.json`))) === privateTokenSha256,
    'private token changed during current observation',
  );
  require19(
    same14(plan, request) && same14(owner, store.owner) && runtime.engine === 'terraform',
    'owning enrollment context changed',
  );
  deadline.throwIfAborted();
  if (!witness || witness.expiresAt <= Date.now() + 60000) return;
  return {
    schemaVersion: 1,
    kind: 'azure-terraform-network-replacement-current-enrollment',
    planSha256: plan.planSha256,
    bootstrapSha256: expectedBootstrapSha256,
    privateTokenSha256,
    witness,
  };
}

// plugins/azure/src/ce/terraform-network-replacement-execution.ts
import { createHash as createHash9 } from 'node:crypto';

var same15 = canonicalEqual;
var digest2 = (v) => createHash9('sha256').update(v).digest('hex');
function require20(v, message) {
  if (!v) throw Error(`Azure Terraform network replacement execution: ${message}`);
}
async function openAzureTerraformNetworkReplacementExecution(request, store, session, api, dependencies, signal) {
  signal?.throwIfAborted();
  const plan = structuredClone(request),
    site = structuredClone(dependencies.site),
    { journalSha256, sourceBindingSha256 } = dependencies;
  require20(
    typeof dependencies.collectOperational === 'function' &&
      typeof dependencies.qualifyOperational === 'function' &&
      typeof dependencies.qualifyCompletedOperational === 'function',
    'owning current operational observer and verifier required',
  );
  const deadline = signal ?? new AbortController().signal;
  const bounded = async (task) => {
    const operation = AbortSignal.any([AbortSignal.timeout(180000), deadline]);
    operation.throwIfAborted();
    const abort = Promise.withResolvers(),
      onAbort = () => abort.reject(operation.reason);
    operation.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([task(), abort.promise]);
      operation.throwIfAborted();
      return result;
    } finally {
      operation.removeEventListener('abort', onAbort);
    }
  };
  const unchanged = () =>
    require20(
      same15(request, plan) &&
        same15(dependencies.site, site) &&
        dependencies.journalSha256 === journalSha256 &&
        dependencies.sourceBindingSha256 === sourceBindingSha256,
      'owning execution request changed',
    );
  const authenticate = async () => {
    unchanged();
    const qualified = await readAzureTerraformNetworkReplacementExecutionBinding(
      plan,
      store,
      dependencies.loaders,
      site,
      journalSha256,
      dependencies.qualifyHistorical,
      deadline,
      undefined,
      dependencies.qualifyCompletedOperational,
    );
    require20(
      qualified.execution.journal.sourceBindingSha256 === sourceBindingSha256 &&
        qualified.source.sourceBindingSha256 === sourceBindingSha256,
      'journal source-binding digest differs',
    );
    unchanged();
    return qualified.source.binding;
  };
  const binding = await authenticate(),
    retainedPlan = structuredClone(await bounded(() => dependencies.loaders.loadSource(binding.retainedPlanSha256)));
  await authenticate();
  const verifyConfiguration = async (configurationSha256) => {
    require20(
      (await bounded(() => session.readConfigurationSha256?.() ?? Promise.resolve(undefined))) === configurationSha256,
      'current private configuration revision differs',
    );
    require20(
      digest2(await bounded(() => session.readConfiguration(configurationSha256))) === configurationSha256,
      'current private configuration bytes differ',
    );
  };
  const check = async (configurationSha256, phase, newVmId) => {
    await authenticate();
    await verifyConfiguration(configurationSha256);
    const current = await observeAzureTerraformNetworkReplacementCurrent(
      { plan, retainedPlan, binding, sourceBindingSha256, phase, ...(newVmId !== undefined ? { newVmId } : {}) },
      api,
      deadline,
    );
    await verifyConfiguration(configurationSha256);
    await authenticate();
    await verifyConfiguration(configurationSha256);
    return current;
  };
  const compare = (source, state) => {
    const oldVmIds = {},
      ownerPlanSha256ByNode = {},
      retainedNics = {};
    for (const [node, vm] of Object.entries(binding.before.nodes)) {
      const name = `${plan.deploymentName}-${node}`;
      oldVmIds[name] = vm.vmId;
      ownerPlanSha256ByNode[name] = vm.ownerPlanSha256;
      for (const [index, nic] of Object.entries(vm.nics))
        retainedNics[`${node}:${index}`] = {
          resourceId: nic.resourceId,
          subnetId: nic.subnetId,
          mac: nic.mac,
          privateIp: nic.privateIp,
          ownerPlanSha256: nic.ownerPlanSha256,
        };
    }
    require20(
      source === binding.source &&
        same15(state, {
          oldVmIds,
          ownerPlanSha256ByNode,
          retainedNics,
          ...site,
        }),
      'executor original source or full frozen identity projection differs',
    );
  };
  const operational = async (configurationSha256, phase, purpose, newVmId) => {
    const before = await check(configurationSha256, phase, newVmId);
    const identity = {
      owner: structuredClone(store.owner),
      planSha256: plan.planSha256,
      journalSha256,
      sourceBindingSha256,
      configurationSha256,
      site: structuredClone(site),
      phase,
      nodes: structuredClone(before.nodes),
    };
    let packet;
    try {
      const receipt = await bounded(() =>
        dependencies.collectOperational(structuredClone(identity), purpose, deadline),
      );
      const verification = await bounded(() =>
        dependencies.qualifyOperational(structuredClone(receipt), structuredClone(identity), deadline),
      );
      require20(
        same15(Object.keys(verification).sort(), ['evidenceSha256', 'scope', 'status']) &&
          verification.status === 'verified' &&
          verification.scope === 'node-interfaces-routing-traffic' &&
          typeof verification.evidenceSha256 === 'string' &&
          /^[a-f0-9]{64}$/.test(verification.evidenceSha256),
        'complete current operational scope required',
      );
      packet = { receipt: structuredClone(receipt), verification: structuredClone(verification) };
    } catch {
      deadline.throwIfAborted();
    }
    const after = await check(configurationSha256, phase, newVmId);
    require20(same15(before.nodes, after.nodes), 'current identities changed across operational collection');
    return packet ? { identity, ...packet } : undefined;
  };
  return {
    journalSha256,
    sourceBindingSha256,
    sourceConfigurationSha256: binding.sourceConfigurationSha256,
    check,
    compare,
    operational,
  };
}

// plugins/azure/src/ce/terraform-network-replacement-refresh-inventory.ts
// plugins/azure/src/ce/immutable-receipt-publication.ts
import { createHash as createHash10, createHash as createHash11, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { link, lstat, open, readdir as readdir2, realpath, unlink } from 'node:fs/promises';
import { join as join2 } from 'node:path';

var hash6 = (bytes) => createHash10('sha256').update(bytes).digest('hex');
var sha5 = (value) => /^[a-f0-9]{64}$/.test(value);
function require21(value, reason) {
  if (!value) throw Error(`Immutable CE receipt publication: ${reason}`);
}
async function privateBytes(path, links = 1) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = await file.stat();
    require21(
      before.isFile() && before.uid === process.getuid?.() && before.nlink === links && (before.mode & 63) === 0,
      'file ownership differs',
    );
    const bytes = await file.readFile(),
      after = await file.stat(),
      named = await lstat(path);
    require21(
      after.dev === before.dev &&
        after.ino === before.ino &&
        after.size === before.size &&
        after.mtimeMs === before.mtimeMs &&
        after.ctimeMs === before.ctimeMs &&
        named.isFile() &&
        !named.isSymbolicLink() &&
        named.dev === before.dev &&
        named.ino === before.ino &&
        named.uid === before.uid &&
        named.nlink === links &&
        (named.mode & 63) === 0,
      'named bytes changed during read',
    );
    return bytes;
  } finally {
    await file.close();
  }
}
function context2(store, namespace, request, signal) {
  require21(/^[a-z][a-z0-9-]{0,39}$/.test(namespace), 'namespace differs');
  const { verify: verifier, directory } = store,
    owner = structuredClone(store.owner),
    expected = canonicalSha256(request);
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    require21(
      store.verify === verifier &&
        store.directory === directory &&
        canonicalEqual(store.owner, owner) &&
        canonicalSha256(request) === expected,
      'owning context changed',
    );
  };
  const step = async (work) => {
    seal();
    const aborted = Promise.withResolvers(),
      onAbort = () => aborted.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([Promise.resolve().then(work), aborted.promise]);
      seal();
      return result;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const fileIdentities = new Map();
  const readBytes = async (path, links = 1) => {
    const before = await step(() => lstat(path)),
      bytes = await step(() => privateBytes(path, links)),
      after = await step(() => lstat(path));
    const identity = (stat) => canonicalSha256({ dev: stat.dev, ino: stat.ino, birthtimeMs: stat.birthtimeMs });
    const current = identity(after),
      prior = fileIdentities.get(path);
    require21(
      identity(before) === current && (prior === undefined || prior === current),
      'publication inode changed across callback',
    );
    fileIdentities.set(path, current);
    return bytes;
  };
  let ownerIdentity;
  const inspect = async () => {
    const root = await step(() => lstat(directory));
    require21(
      root.isDirectory() &&
        !root.isSymbolicLink() &&
        root.uid === process.getuid?.() &&
        (root.mode & 63) === 0 &&
        (await step(() => realpath(directory))) === directory,
      'directory ownership differs',
    );
    const path = join2(directory, 'owner.json'),
      before = await step(() => lstat(path)),
      bytes = await step(() => privateBytes(path)),
      after = await step(() => lstat(path));
    require21(
      before.dev === after.dev &&
        before.ino === after.ino &&
        before.mtimeMs === after.mtimeMs &&
        before.ctimeMs === after.ctimeMs,
      'owner manifest changed during inspection',
    );
    let manifest;
    try {
      manifest = JSON.parse(bytes.toString());
    } catch {
      throw Error('Malformed native owner manifest');
    }
    require21(
      manifest &&
        Object.keys(manifest).sort().join(',') === 'owner,schemaVersion' &&
        manifest.schemaVersion === 2 &&
        canonicalEqual(manifest.owner, owner),
      'native owner differs',
    );
    const identity = canonicalSha256({
      root: { dev: root.dev, ino: root.ino },
      owner: { dev: after.dev, ino: after.ino, mtimeMs: after.mtimeMs, ctimeMs: after.ctimeMs, sha256: hash6(bytes) },
    });
    require21(ownerIdentity === undefined || ownerIdentity === identity, 'native owner identity changed');
    ownerIdentity = identity;
  };
  const verify = async () => {
    await inspect();
    await step(() => verifier.call(store));
    await inspect();
  };
  const sync = async () => {
    const handle = await step(() => open(directory, constants.O_RDONLY));
    try {
      await step(() => handle.sync());
    } finally {
      await handle.close();
    }
  };
  return { step, seal, verify, sync, directory, readBytes };
}
async function publishImmutableCeReceipt(store, namespace, request, signal) {
  const c = context2(store, namespace, request, signal),
    record = structuredClone(request),
    digest = canonicalSha256(record),
    content = Buffer.from(JSON.stringify(record)),
    name = `${namespace}-${digest}.json`,
    path = join2(c.directory, name);
  await c.verify();
  const pendingNames = async () =>
    (await c.step(() => readdir2(c.directory)))
      .filter((value) => new RegExp(`^${namespace}-${digest}-[a-f0-9-]{36}\\.pending$`).test(value))
      .sort();
  try {
    const stat = await c.step(() => lstat(path));
    if (stat.nlink === 2) {
      const matches = [];
      for (const candidate of await pendingNames()) {
        const pending = await c.step(() => lstat(join2(c.directory, candidate)));
        if (pending.dev === stat.dev && pending.ino === stat.ino) matches.push(candidate);
      }
      require21(matches.length === 1, 'linked recovery is ambiguous');
      const pending = join2(c.directory, matches[0]);
      require21(
        (await c.readBytes(path, 2)).equals(content) && (await c.readBytes(pending, 2)).equals(content),
        'linked recovery bytes differ',
      );
      await c.verify();
      require21(
        (await c.readBytes(path, 2)).equals(content) && (await c.readBytes(pending, 2)).equals(content),
        'linked recovery bytes changed',
      );
      await c.step(() => unlink(pending));
      await c.sync();
    }
    require21((await c.readBytes(path)).equals(content), 'immutable collision retained');
    await c.verify();
    require21((await c.readBytes(path)).equals(content), 'publication changed');
    require21((await pendingNames()).length === 0, 'published receipt has unresolved pending evidence');
    return { name, publicationSha256: digest, byteSha256: hash6(content) };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const retained = await pendingNames();
  require21(retained.length <= 1, 'pending recovery is ambiguous');
  const pending = join2(c.directory, retained[0] ?? `${namespace}-${digest}-${randomUUID()}.pending`);
  if (retained.length)
    require21((await c.readBytes(pending)).equals(content), 'incomplete or foreign pending retained');
  const file = await c.step(() =>
    open(pending, retained.length ? constants.O_RDONLY | constants.O_NOFOLLOW : 'wx', 384),
  );
  try {
    if (!retained.length) await c.step(() => file.writeFile(content));
    await c.step(() => file.sync());
    await file.close();
    await c.verify();
    require21((await c.readBytes(pending)).equals(content), 'pending bytes changed');
    try {
      await c.step(() => link(pending, path));
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      require21((await c.readBytes(path)).equals(content), 'late immutable collision retained');
    }
    await c.step(() => unlink(pending));
    await c.sync();
    await c.verify();
    require21((await c.readBytes(path)).equals(content), 'publication changed');
    require21((await pendingNames()).length === 0, 'published receipt has unresolved pending evidence');
    c.seal();
    return { name, publicationSha256: digest, byteSha256: hash6(content) };
  } catch (error) {
    await file.close().catch(() => {});
    throw error;
  }
}
async function readImmutableCeReceipt(store, namespace, digest, signal) {
  require21(sha5(digest), 'publication digest differs');
  const c = context2(store, namespace, { digest }, signal),
    name = `${namespace}-${digest}.json`,
    path = join2(c.directory, name);
  await c.verify();
  const bytes = await c.readBytes(path);
  let record;
  try {
    record = JSON.parse(bytes.toString());
  } catch {
    throw Error('Malformed immutable receipt publication');
  }
  require21(
    canonicalSha256(record) === digest && bytes.equals(Buffer.from(JSON.stringify(record))),
    'publication digest or encoding differs',
  );
  await c.verify();
  require21((await c.readBytes(path)).equals(bytes), 'publication changed across verifier callback');
  c.seal();
  return { name, publicationSha256: digest, byteSha256: hash6(bytes), record };
}

// plugins/azure/src/ce/terraform-network-replacement-refresh-inventory.ts
var receiptNamespace = 'replacement-refresh-inventory';
var pointerName = (plan) => `${plan.planId}-terraform-replacement-refresh-inventory.json`;
var sha6 = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function require22(v, reason) {
  if (!v) throw Error(`Azure Terraform replacement refresh inventory: ${reason}`);
}
function keys5(v, names) {
  require22(
    v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join(',') === names.toSorted().join(','),
    'exact schema required',
  );
}
async function binding(c, completion) {
  const packet = validateAzureTerraformNetworkReplacementCompletion(c, completion),
    deployment = await c.bounded(() => azureTerraformCurrentDeployment(c.plan));
  const { configuration: _source, providerLock, ...identity } = deployment;
  const providerLockSha256 = createHash11('sha256').update(providerLock).digest('hex');
  require22(providerLockSha256 === packet.providerLockSha256, 'native provider lock differs from immutable completion');
  c.unchanged();
  return {
    owner: structuredClone(c.owner),
    planSha256: c.plan.planSha256,
    originalPlanSha256: packet.originalPlanSha256,
    retainedPlanSha256: packet.retainedPlanSha256,
    completionSha256: canonicalSha256(packet),
    checkpointSha256: packet.checkpointSha256,
    journalSha256: packet.journalSha256,
    sourceBindingSha256: packet.sourceBindingSha256,
    finalConfigurationSha256: packet.finalConfigurationSha256,
    providerLockSha256: packet.providerLockSha256,
    nativeManifestSha256: canonicalSha256({
      ...identity,
      configurationSha256: packet.finalConfigurationSha256,
      providerLockSha256,
    }),
  };
}
function validate2(c, record, expected) {
  keys5(record, ['schemaVersion', 'kind', 'binding', 'previousInventorySha256', 'receipts']);
  require22(
    record.schemaVersion === 1 &&
      record.kind === 'azure-terraform-network-replacement-refresh-inventory' &&
      canonicalEqual(record.binding, expected) &&
      (record.previousInventorySha256 === null || sha6(record.previousInventorySha256)) &&
      Array.isArray(record.receipts) &&
      record.receipts.length > 0,
    'owning ordered inventory binding differs',
  );
  const inventory = record,
    seen = new Set();
  for (const row of inventory.receipts) {
    keys5(row, ['receiptSha256', 'receipt', 'nativeHistory', 'nativeHistorySha256']);
    require22(
      sha6(row.receiptSha256) &&
        row.receiptSha256 === canonicalSha256(row.receipt) &&
        !seen.has(row.receiptSha256) &&
        sha6(row.nativeHistorySha256) &&
        row.nativeHistorySha256 === canonicalSha256(row.nativeHistory),
      'duplicate or altered refresh descriptor',
    );
    validateAzureTerraformReplacementStageReceipt(
      c.plan,
      c.material.stages.launch,
      row.receipt,
      c.binding.providerLockSha256,
    );
    require22(
      row.receipt.noChanges && row.receipt.changes.every((v) => v.actions.join(',') === 'no-op'),
      'refresh must be a complete no-change receipt',
    );
    const h = row.nativeHistory;
    keys5(h, [
      'schemaVersion',
      'scope',
      'receiptSha256',
      'manifestSha256',
      'matches',
      'incompleteArchives',
      'applicationOutcomeQualified',
      'retirementQualified',
    ]);
    require22(
      h.schemaVersion === 1 &&
        h.scope === 'exact-saved-plan-journal-history' &&
        h.receiptSha256 === row.receiptSha256 &&
        h.manifestSha256 === expected.nativeManifestSha256 &&
        h.incompleteArchives === 0 &&
        h.applicationOutcomeQualified === false &&
        h.retirementQualified === false &&
        Array.isArray(h.matches) &&
        h.matches.length > 0,
      'complete exact native refresh history required',
    );
    const occurrences = new Set();
    for (const match of h.matches) {
      keys5(match, [
        'location',
        'archiveSha256',
        'state',
        'journalSha256',
        'savedPlanSha256',
        'configurationSha256',
        'manifestSha256',
      ]);
      const occurrence = `${match.location}:${match.archiveSha256}`;
      require22(
        ['current', 'revision', 'plan-history'].includes(String(match.location)) &&
          sha6(match.archiveSha256) &&
          sha6(match.journalSha256) &&
          !occurrences.has(occurrence) &&
          ['planned', 'applied'].includes(String(match.state)) &&
          match.savedPlanSha256 === row.receipt.planSha256 &&
          match.configurationSha256 === expected.finalConfigurationSha256 &&
          match.manifestSha256 === h.manifestSha256,
        'native saved receipt identity differs',
      );
      occurrences.add(occurrence);
    }
    seen.add(row.receiptSha256);
  }
  return structuredClone(inventory);
}
async function readChain(c, store, digest, expected) {
  const publications = [];
  const seen = new Set();
  let next = digest,
    descendant;
  while (next !== null) {
    require22(sha6(next) && !seen.has(next), 'inventory prefix digest is cyclic or malformed');
    seen.add(next);
    const publication = await c.bounded(() => readImmutableCeReceipt(store, receiptNamespace, next, c.deadline));
    const record = validate2(c, publication.record, expected);
    if (descendant)
      require22(
        record.receipts.length + 1 === descendant.receipts.length &&
          canonicalEqual(record.receipts, descendant.receipts.slice(0, -1)),
        'inventory prefix is partial or reordered',
      );
    require22(record.previousInventorySha256 !== null || record.receipts.length === 1, 'inventory prefix root differs');
    publications.push({ ...publication, record });
    descendant = record;
    next = record.previousInventorySha256;
  }
  const finish = async () => {
    for (const original of publications) {
      const fresh = await c.bounded(() =>
        readImmutableCeReceipt(store, receiptNamespace, original.publicationSha256, c.deadline),
      );
      require22(
        canonicalEqual(fresh, {
          name: original.name,
          publicationSha256: original.publicationSha256,
          byteSha256: original.byteSha256,
          record: original.record,
        }),
        'inventory prefix changed across callbacks',
      );
    }
    c.unchanged();
  };
  await finish();
  return { publication: publications[0], finish };
}
async function readAzureTerraformReplacementRefreshInventory(c, store, completion, expectedDigest) {
  let pointer;
  try {
    pointer = await c.read(pointerName(c.plan));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    require22(expectedDigest === undefined, 'outcome inventory publication is missing');
    require22(
      canonicalEqual(c.latestFinal, validateAzureTerraformNetworkReplacementCompletion(c, completion).finalReceipt),
      'missing refresh inventory cannot discard a newer final receipt',
    );
    return;
  }
  keys5(pointer, ['schemaVersion', 'inventorySha256']);
  require22(
    pointer.schemaVersion === 1 && sha6(pointer.inventorySha256) && pointer.inventorySha256 === expectedDigest,
    'inventory differs from authenticated owning outcome',
  );
  const chain = await readChain(c, store, pointer.inventorySha256, await binding(c, completion)),
    publication = chain.publication,
    record = publication.record;
  require22(
    canonicalEqual(record.receipts.at(-1)?.receipt, c.latestFinal),
    'latest refresh publication is stale or partial',
  );
  await c.finish();
  await chain.finish();
  const again = await c.bounded(() =>
    readImmutableCeReceipt(store, receiptNamespace, publication.publicationSha256, c.deadline),
  );
  require22(canonicalEqual(again, publication), 'immutable inventory changed across provenance callbacks');
  return { ...publication, record };
}
async function publishAzureTerraformReplacementRefreshInventory(
  request,
  store,
  session,
  dependencies,
  finalRequest,
  signal,
) {
  let completion;
  try {
    completion = await store.read(azureTerraformNetworkReplacementCompletionName(request));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return;
  }
  const final = structuredClone(finalRequest),
    finalDigest = canonicalSha256(final),
    c = await openAzureTerraformNetworkReplacementCompletionArtifacts(request, store, dependencies, signal),
    expected = await binding(c, completion),
    {
      readPlanApplicationHistory: readHistory,
      readPlanApplicationState: readState,
      readConfigurationSha256: readConfig,
      readConfiguration: readSource,
    } = session;
  const seal = () => {
    c.unchanged();
    require22(
      canonicalEqual(finalRequest, final) &&
        session.readPlanApplicationHistory === readHistory &&
        session.readPlanApplicationState === readState &&
        session.readConfigurationSha256 === readConfig &&
        session.readConfiguration === readSource,
      'owning refresh request/readers changed',
    );
  };
  require22(
    typeof readHistory === 'function' &&
      typeof readState === 'function' &&
      typeof readConfig === 'function' &&
      typeof readSource === 'function',
    'native current and historical receipt readers required',
  );
  validateAzureTerraformReplacementStageReceipt(c.plan, c.material.stages.launch, final, expected.providerLockSha256);
  require22(
    final.noChanges && final.changes.every((v) => v.actions.join(',') === 'no-op'),
    'final refresh is not no-change',
  );
  let priorDigest;
  try {
    const pointer = await c.read(pointerName(c.plan));
    keys5(pointer, ['schemaVersion', 'inventorySha256']);
    require22(pointer.schemaVersion === 1 && sha6(pointer.inventorySha256), 'prior inventory pointer differs');
    priorDigest = pointer.inventorySha256;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  let rows = [];
  let finishPrior = async () => {};
  if (priorDigest) {
    const chain = await readChain(c, store, priorDigest, expected);
    rows = structuredClone(chain.publication.record.receipts);
    finishPrior = chain.finish;
    require22(
      rows.some((row) => canonicalEqual(row.receipt, c.latestFinal)) ||
        canonicalEqual(c.latestFinal, validateAzureTerraformNetworkReplacementCompletion(c, completion).finalReceipt),
      'interrupted refresh does not preserve the exact prior publication',
    );
  } else {
    require22(
      canonicalEqual(c.latestFinal, validateAzureTerraformNetworkReplacementCompletion(c, completion).finalReceipt),
      'uninventoried prior refresh cannot be discarded',
    );
  }
  const deployment = await c.bounded(() => azureTerraformCurrentDeployment(c.plan));
  const { configuration: _source, providerLock, ...identity } = deployment;
  const manifestSha256 = canonicalSha256({
    ...identity,
    configurationSha256: expected.finalConfigurationSha256,
    providerLockSha256: createHash11('sha256').update(providerLock).digest('hex'),
  });
  const priorHistories = new Map();
  const native = async () => {
    seal();
    require22(
      (await c.bounded(() => readConfig.call(session))) === expected.finalConfigurationSha256 &&
        (await c.bounded(() => readSource.call(session, expected.finalConfigurationSha256))) ===
          c.material.stages.launch.configuration &&
        ['planned', 'applied'].includes(await c.bounded(() => readState.call(session, final))),
      'owning exact current native final differs',
    );
    for (const row of rows) {
      const actual = await c.bounded(() => readHistory.call(session, structuredClone(row.receipt), c.deadline));
      seal();
      require22(
        actual.manifestSha256 === manifestSha256 && actual.matches.every((m) => m.manifestSha256 === manifestSha256),
        'retained refresh native manifest differs',
      );
      validate2(
        c,
        {
          schemaVersion: 1,
          kind: 'azure-terraform-network-replacement-refresh-inventory',
          binding: expected,
          previousInventorySha256: null,
          receipts: [{ ...row, nativeHistory: actual, nativeHistorySha256: canonicalSha256(actual) }],
        },
        expected,
      );
      const digest = canonicalSha256(actual),
        prior = priorHistories.get(row.receiptSha256);
      require22(prior === undefined || prior === digest, 'retained native refresh changed across callbacks');
      priorHistories.set(row.receiptSha256, digest);
    }
    const history = await c.bounded(() => readHistory.call(session, structuredClone(final), c.deadline));
    seal();
    require22(
      history.manifestSha256 === manifestSha256 && history.matches.every((m) => m.manifestSha256 === manifestSha256),
      'native executor/provider/manifest binding differs',
    );
    return history;
  };
  const history = await native();
  const existing = rows.find((row) => row.receiptSha256 === finalDigest);
  require22(!existing || rows.at(-1) === existing, 'old refresh receipt cannot be reordered');
  if (existing) {
    require22(canonicalEqual(existing.nativeHistory, history), 'interrupted refresh native provenance changed');
    await c.finish();
    await finishPrior();
    seal();
    return priorDigest;
  } else
    rows.push({
      receiptSha256: finalDigest,
      receipt: final,
      nativeHistory: history,
      nativeHistorySha256: canonicalSha256(history),
    });
  const record = validate2(
    c,
    {
      schemaVersion: 1,
      kind: 'azure-terraform-network-replacement-refresh-inventory',
      binding: expected,
      previousInventorySha256: priorDigest ?? null,
      receipts: rows,
    },
    expected,
  );
  require22(canonicalEqual(await native(), history), 'native refresh history changed across callbacks');
  await c.finish();
  await finishPrior();
  seal();
  const publication = await c.bounded(() => publishImmutableCeReceipt(store, receiptNamespace, record, c.deadline));
  require22(canonicalEqual(await native(), history), 'native refresh changed during immutable publication');
  await c.finish();
  await finishPrior();
  seal();
  await c.bounded(() =>
    store.write(pointerName(c.plan), { schemaVersion: 1, inventorySha256: publication.publicationSha256 }),
  );
  require22(
    canonicalEqual(await store.read(pointerName(c.plan)), {
      schemaVersion: 1,
      inventorySha256: publication.publicationSha256,
    }),
    'inventory pointer changed during publication',
  );
  seal();
  return publication.publicationSha256;
}

// plugins/azure/src/ce/terraform-replacement-final-refresh.ts
import { createHash as createHash12 } from 'node:crypto';

async function planAzureTerraformReplacementFinalRefresh(plan, store, session, binding, env, signal) {
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const request = structuredClone({ plan, owner: store.owner, binding }),
    origin = canonicalSha256({ schemaVersion: 1, kind: 'azure-terraform-replacement-final-refresh', ...request }),
    { readCurrentPlanJournal: read, plan: execute } = session;
  if (typeof read !== 'function') throw Error('Native current final-refresh journal reader required');
  const seal = () => {
    deadline.throwIfAborted();
    if (
      !canonicalEqual(request, { plan, owner: store.owner, binding }) ||
      session.readCurrentPlanJournal !== read ||
      session.plan !== execute
    )
      throw Error('Owning final-refresh request or native readers changed');
  };
  const step = async (work) => {
    seal();
    const abort = Promise.withResolvers(),
      onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([work(), abort.promise]);
      seal();
      return result;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const deployment = await step(() => azureTerraformCurrentDeployment(plan)),
    { configuration: _source, providerLock, ...identity } = deployment,
    manifestSha256 = canonicalSha256({
      ...identity,
      configurationSha256: binding.configurationSha256,
      providerLockSha256: createHash12('sha256').update(providerLock).digest('hex'),
    });
  if (createHash12('sha256').update(providerLock).digest('hex') !== binding.providerLockSha256)
    throw Error('Owning final-refresh provider lock differs');
  seal();
  const actual = await step(() => read.call(session, binding.configurationSha256, deadline)),
    observed = structuredClone(actual);
  const sealObserved = () => {
    seal();
    if (!canonicalEqual(actual, observed)) throw Error('Owning final-refresh observation changed across callbacks');
  };
  sealObserved();
  if (observed.receipt?.refreshOriginSha256 === origin) {
    const receipt = observed.receipt;
    if (
      observed.schemaVersion !== 1 ||
      observed.scope !== 'current-saved-plan-byte-and-journal-binding' ||
      observed.planSemanticsQualified !== false ||
      !['planned', 'applied'].includes(observed.state) ||
      observed.manifestSha256 !== manifestSha256 ||
      observed.savedPlanSha256 !== receipt.planSha256 ||
      !/^[a-f0-9]{64}$/.test(observed.journalSha256 ?? '') ||
      !/^[a-f0-9]{64}$/.test(observed.executionSha256 ?? '') ||
      observed.ordinaryRefreshEnabled !== true ||
      receipt.schemaVersion !== 1 ||
      receipt.engine !== 'terraform' ||
      receipt.deploymentId !== plan.deploymentName ||
      receipt.backendIdentity !== `local:${plan.deploymentName}` ||
      receipt.configurationSha256 !== binding.configurationSha256 ||
      receipt.providerLockSha256 !== binding.providerLockSha256 ||
      receipt.noChanges !== true ||
      receipt.changes.some((change) => change.actions.join(',') !== 'no-op') ||
      [receipt.operation, receipt.actionInvocations, receipt.imports, receipt.relinquishments].some(
        (value) => value !== undefined,
      )
    )
      throw Error('Owning lost final-refresh native evidence differs');
    let published;
    try {
      published = await step(() => store.read(`${plan.planId}-terraform-replacement-final-plan.json`));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    sealObserved();
    const fresh = await step(() => read.call(session, binding.configurationSha256, deadline));
    sealObserved();
    if (!canonicalEqual(fresh, observed)) throw Error('Owning lost final-refresh journal changed across callbacks');
    if (published === undefined || !canonicalEqual(published, receipt)) return structuredClone(receipt);
  }
  const reply = await step(() => execute.call(session, env, deadline, origin)),
    receipt = structuredClone(reply);
  seal();
  if (receipt.refreshOriginSha256 !== origin) throw Error('Native final-refresh origin was not persisted');
  const saved = await step(() => read.call(session, binding.configurationSha256, deadline));
  seal();
  if (!canonicalEqual(reply, receipt)) throw Error('Owning final-refresh reply changed during native verification');
  if (
    saved.schemaVersion !== 1 ||
    saved.scope !== 'current-saved-plan-byte-and-journal-binding' ||
    saved.planSemanticsQualified !== false ||
    !canonicalEqual(saved.receipt, receipt) ||
    saved.state !== 'planned' ||
    saved.manifestSha256 !== manifestSha256 ||
    saved.savedPlanSha256 !== receipt.planSha256 ||
    !/^[a-f0-9]{64}$/.test(saved.journalSha256 ?? '') ||
    !/^[a-f0-9]{64}$/.test(saved.executionSha256 ?? '') ||
    saved.ordinaryRefreshEnabled !== true
  )
    throw Error('Native final-refresh journal does not authenticate the owning reply');
  return structuredClone(receipt);
}

// plugins/azure/src/ce/terraform-replacement.ts
class NetworkReplacementOperationalPending extends Error {}

class NetworkReplacementEnrollmentPending extends Error {}
var digest3 = (value) => createHash13('sha256').update(value).digest('hex');
var lower5 = (value) => (typeof value === 'string' ? value.toLowerCase() : '');
var uuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
var object19 = (value, message = 'Malformed Azure Terraform replacement data') => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  return value;
};
var checkpointName = (plan) => `${plan.planId}-terraform-replacement.json`;
var sourceName = (plan) => `${plan.planId}-terraform-replacement-source.json`;
var azureTerraformReplacementPlanName = (plan) => `${plan.planId}-terraform-replacement-plan.json`;
async function persistReplacementPlan(plan, storage) {
  const name = azureTerraformReplacementPlanName(plan);
  let saved;
  try {
    saved = await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await storage.write(name, plan);
    return;
  }
  verifyAzureCePlan(saved);
  if (canonicalSha256(saved) !== canonicalSha256(plan))
    throw Error('Azure Terraform replacement saved public plan differs');
}
function selectedNode(plan) {
  if (plan.engine !== 'terraform' || plan.intent.operation !== 'replace-node' || !plan.intent.replacementNode)
    throw new Error('Azure Terraform replacement requires one exact selected node');
  return plan.intent.replacementNode;
}
function vmResourceId(plan, node) {
  return `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${plan.deploymentName}-${node}`;
}
function nicResourceId(plan, node, index) {
  return `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Network/networkInterfaces/${plan.deploymentName}-${node}-nic${index}`;
}
function validateBootstrap(value) {
  if (!value.startsWith('#cloud-config') || !value.includes('/etc/vpm/user_data') || /__\w+__/.test(value))
    throw new Error('Azure Terraform replacement requires resolved platform cloud-init');
}
function parseReplacementConfiguration(value) {
  try {
    return object19(JSON.parse(value));
  } catch {
    throw Error('Malformed Azure Terraform replacement configuration');
  }
}
function validateReplacementConfiguration(plan, value) {
  if (plan.relayProfile?.schemaVersion !== 2) return;
  const source = parseReplacementConfiguration(value);
  const instances = object19(object19(source.resource).azurerm_linux_virtual_machine);
  const original = azureRelayResourceSource(plan);
  const bootstrapByNode = {};
  for (let node = 1; node <= original.topology.nodeCount; node++) {
    const encoded = object19(instances[`node_${node}`]).custom_data;
    if (typeof encoded !== 'string' || !encoded || Buffer.from(encoded, 'base64').toString('base64') !== encoded)
      throw Error('Azure Terraform replacement retained bootstrap encoding differs');
    const material = Buffer.from(encoded, 'base64').toString('utf8');
    validateBootstrap(material);
    bootstrapByNode[String(node)] = material;
  }
  const expected = object19(JSON.parse(renderAzureTerraformFoundation(original, bootstrapByNode)));
  const expectedVms = object19(object19(expected.resource).azurerm_linux_virtual_machine);
  for (let node = 1; node <= original.topology.nodeCount; node++)
    object19(object19(expectedVms[`node_${node}`]).tags)['xcsh-plan-sha256'] = azureRelayReplacementRetainedOwner(
      plan,
      vmResourceId(plan, node),
    );
  if (canonicalSha256(source) !== canonicalSha256(expected))
    throw Error('Azure Terraform replacement retained configuration provenance differs');
}
function validateRetainedConfigurationIdentity(plan, source, cloud) {
  const resources = object19(parseReplacementConfiguration(source).resource);
  const vms = object19(resources.azurerm_linux_virtual_machine);
  const nics = object19(resources.azurerm_network_interface);
  const macs = new Set();
  const requireOwner = (resource, owner) => {
    const tags = object19(resource.tags);
    if (
      tags['xcsh-managed-by'] !== 'azure-ce' ||
      tags['xcsh-execution-engine'] !== 'terraform' ||
      tags['xcsh-deployment-id'] !== plan.deploymentName ||
      tags['xcsh-plan-sha256'] !== owner
    )
      throw Error('Azure Terraform replacement retained configuration identity differs');
  };
  for (let node = 1; node <= plan.topology.nodeCount; node++) {
    requireOwner(object19(vms[`node_${node}`]), cloud.ownerPlanSha256ByNode[`${plan.deploymentName}-${node}`]);
    for (const nic of plan.nics) {
      const retained = cloud.retainedNics[`${node}:${nic.index}`];
      requireOwner(object19(nics[`node_${node}_nic_${nic.index}`]), retained.ownerPlanSha256);
      if (macs.has(retained.mac.toLowerCase()))
        throw Error('Azure Terraform replacement retained configuration identity has duplicate MACs');
      macs.add(retained.mac.toLowerCase());
    }
  }
}
function azureTerraformReplacementStages(plan, source, sourceSha256, bootstrap) {
  verifyAzureCePlan(plan);
  const node = selectedNode(plan);
  if (digest3(source) !== sourceSha256) throw new Error('Azure Terraform replacement source configuration changed');
  validateBootstrap(bootstrap);
  validateReplacementConfiguration(plan, source);
  const original = parseReplacementConfiguration(source);
  const resources = object19(original.resource);
  const instances = object19(resources.azurerm_linux_virtual_machine);
  const outputs = object19(object19(object19(original.output).ce_instances).value);
  const name = `node_${node}`;
  const instance = object19(instances[name]);
  const tags = object19(instance.tags);
  const deleteAction = plan.actions.find((action) => action.kind === 'vm-delete' && action.node === node);
  const imageRows = instance.source_image_reference;
  const image = Array.isArray(imageRows) && imageRows.length === 1 ? object19(imageRows[0]) : {};
  const expectedNics = plan.nics.map((nic) => `\${azurerm_network_interface.${name}_nic_${nic.index}.id}`);
  if (
    !deleteAction?.resourceId ||
    lower5(deleteAction.resourceId) !== lower5(vmResourceId(plan, node)) ||
    tags['xcsh-managed-by'] !== 'azure-ce' ||
    tags['xcsh-execution-engine'] !== 'terraform' ||
    tags['xcsh-deployment-id'] !== plan.deploymentName ||
    tags['xcsh-plan-sha256'] !== deleteAction.expectedOwnerPlanSha256 ||
    tags['xcsh-node-index'] !== String(node) ||
    tags['ves-io-site-name'] !== plan.siteName ||
    instance.name !== `${plan.deploymentName}-${node}` ||
    instance.computer_name !== `${plan.deploymentName}-${node}` ||
    instance.size !== plan.vm.size ||
    canonicalSha256(instance.network_interface_ids) !== canonicalSha256(expectedNics) ||
    image.publisher !== plan.image.publisher ||
    image.offer !== plan.image.offer ||
    image.sku !== plan.image.plan ||
    image.version !== plan.image.version ||
    object19(outputs[String(node)]).id !== `\${azurerm_linux_virtual_machine.${name}.id}` ||
    object19(outputs[String(node)]).vm_id !== `\${azurerm_linux_virtual_machine.${name}.virtual_machine_id}`
  )
    throw new Error('Azure Terraform replacement source VM or output binding differs');
  const quiesced = structuredClone(original);
  delete object19(object19(quiesced.resource).azurerm_linux_virtual_machine)[name];
  delete object19(object19(object19(quiesced.output).ce_instances).value)[String(node)];
  const quiesceConfiguration = JSON.stringify(quiesced);
  const launched = structuredClone(original);
  const replacement = object19(object19(object19(launched.resource).azurerm_linux_virtual_machine)[name]);
  replacement.custom_data = Buffer.from(bootstrap).toString('base64');
  object19(replacement.tags)['xcsh-plan-sha256'] = plan.planSha256;
  const launchConfiguration = JSON.stringify(launched);
  const address = `azurerm_linux_virtual_machine.${name}`;
  const make = (phase, configuration, previousConfigurationSha256) => ({
    phase,
    configuration,
    previousConfigurationSha256,
    configurationSha256: digest3(configuration),
    address,
  });
  return {
    quiesce: make('quiesce', quiesceConfiguration, sourceSha256),
    launch: make('launch', launchConfiguration, digest3(quiesceConfiguration)),
  };
}
function validateAzureTerraformReplacementStageReceipt(plan, stage, receipt, providerLockSha256) {
  const nonNoop = receipt.changes.filter((change) => change.actions.join(',') !== 'no-op');
  if (
    receipt.schemaVersion !== 1 ||
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== plan.deploymentName ||
    receipt.backendIdentity !== `local:${plan.deploymentName}` ||
    receipt.configurationSha256 !== stage.configurationSha256 ||
    receipt.operation !== undefined ||
    receipt.providerLockSha256 !== providerLockSha256 ||
    [receipt.actionInvocations, receipt.imports, receipt.relinquishments].some(
      (value) => value !== undefined && (!Array.isArray(value) || value.length !== 0),
    ) ||
    typeof receipt.noChanges !== 'boolean' ||
    !/^[a-f0-9]{64}$/.test(receipt.planSha256) ||
    !/^[a-f0-9]{64}$/.test(receipt.providerLockSha256) ||
    nonNoop.some(
      (change) =>
        change.address !== stage.address ||
        change.type !== 'azurerm_linux_virtual_machine' ||
        change.actions.join(',') !== (stage.phase === 'quiesce' ? 'delete' : 'create'),
    ) ||
    nonNoop.length > 1 ||
    (receipt.noChanges ? nonNoop.length !== 0 : nonNoop.length !== 1)
  )
    throw new Error('Azure Terraform replacement saved plan differs from the selected VM stage');
}
async function azJson(api, args, signal) {
  signal?.throwIfAborted();
  const result = await api.exec('az', [...args, '--output', 'json'], signal ? { signal } : undefined);
  if (result.exitCode !== 0) throw new Error('Azure Terraform replacement observation is unavailable');
  try {
    const value = object19(JSON.parse(result.stdout));
    if (value.nextLink !== undefined) throw new Error('Incomplete Azure Terraform replacement observation');
    return value;
  } catch {
    throw new Error('Malformed Azure Terraform replacement observation');
  }
}
async function listVms(plan, api, signal) {
  signal?.throwIfAborted();
  const result = await api.exec(
    'az',
    [
      'vm',
      'list',
      '--resource-group',
      plan.intent.resourceGroup,
      '--show-details',
      '--subscription',
      plan.subscription.id,
      '--output',
      'json',
    ],
    signal ? { signal } : undefined,
  );
  if (result.exitCode !== 0) throw new Error('Azure Terraform replacement VM observation is unavailable');
  try {
    const value = JSON.parse(result.stdout);
    if (!Array.isArray(value)) throw new Error('not an array');
    return value.map((item) => object19(item));
  } catch {
    throw new Error('Malformed Azure Terraform replacement VM observation');
  }
}
async function account(plan, api, signal) {
  signal?.throwIfAborted();
  const result = await api.exec(
    'az',
    ['account', 'show', '--subscription', plan.subscription.id, '--output', 'json'],
    signal ? { signal } : undefined,
  );
  if (result.exitCode !== 0) throw new Error('Azure Terraform replacement account observation is unavailable');
  let value;
  try {
    value = object19(JSON.parse(result.stdout));
  } catch {
    throw new Error('Malformed Azure Terraform replacement account observation');
  }
  if (
    lower5(value.id) !== lower5(plan.subscription.id) ||
    lower5(value.tenantId) !== lower5(plan.subscription.tenantId) ||
    value.environmentName !== plan.subscription.cloud ||
    value.state !== 'Enabled'
  )
    throw new Error('Azure Terraform replacement account differs from the plan');
}
async function initialCloudEvidence(plan, api, signal) {
  await account(plan, api, signal);
  const rows = await listVms(plan, api, signal);
  const oldVmIds = {};
  const ownerPlanSha256ByNode = {};
  const retainedNics = {};
  const selected = selectedNode(plan);
  const deleteAction = plan.actions.find((action) => action.kind === 'vm-delete' && action.node === selected);
  for (let node = 1; node <= plan.topology.nodeCount; node++) {
    const name = `${plan.deploymentName}-${node}`;
    const resourceId = vmResourceId(plan, node);
    const matches = rows.filter((row) => lower5(row.id) === lower5(resourceId));
    const vm = matches.length === 1 ? matches[0] : undefined;
    const tags = vm ? object19(vm.tags) : {};
    const attachments =
      vm && Array.isArray(object19(vm.networkProfile).networkInterfaces)
        ? object19(vm.networkProfile).networkInterfaces.map((item) => lower5(object19(item).id))
        : [];
    const expectedAttachments = plan.nics.map((nic) => lower5(nicResourceId(plan, node, nic.index)));
    const ownerPlanSha256 = tags['xcsh-plan-sha256'];
    if (
      !vm ||
      vm.name !== name ||
      lower5(vm.location) !== lower5(plan.region) ||
      vm.provisioningState !== 'Succeeded' ||
      lower5(object19(vm.hardwareProfile).vmSize) !== lower5(plan.vm.size) ||
      attachments.length !== expectedAttachments.length ||
      expectedAttachments.some((id) => !attachments.includes(id)) ||
      !uuid(vm.vmId) ||
      tags['xcsh-managed-by'] !== 'azure-ce' ||
      tags['xcsh-execution-engine'] !== 'terraform' ||
      tags['xcsh-deployment-id'] !== plan.deploymentName ||
      typeof ownerPlanSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(ownerPlanSha256) ||
      (node === selected && ownerPlanSha256 !== deleteAction?.expectedOwnerPlanSha256) ||
      (plan.relayProfile?.schemaVersion === 2 &&
        ownerPlanSha256 !== azureRelayReplacementRetainedOwner(plan, resourceId))
    )
      throw new Error('Azure Terraform replacement VM identity or ownership is unavailable');
    oldVmIds[name] = vm.vmId;
    ownerPlanSha256ByNode[name] = ownerPlanSha256;
    for (const nic of plan.nics) {
      const id = nicResourceId(plan, node, nic.index);
      const value = await azJson(
        api,
        ['network', 'nic', 'show', '--ids', id, '--subscription', plan.subscription.id],
        signal,
      );
      const nicTags = object19(value.tags);
      const configs = Array.isArray(value.ipConfigurations) ? value.ipConfigurations.map((item) => object19(item)) : [];
      const primary = configs.filter(
        (item) => item.primary === true || (configs.length === 1 && item.primary === undefined),
      );
      const config = primary.length === 1 ? primary[0] : {};
      const mac = lower5(value.macAddress).replaceAll('-', ':');
      const privateIp = config.privateIPAddress;
      const subnetId = object19(config.subnet).id;
      if (
        lower5(value.id) !== lower5(id) ||
        lower5(value.location) !== lower5(plan.region) ||
        value.provisioningState !== 'Succeeded' ||
        lower5(object19(value.virtualMachine).id) !== lower5(resourceId) ||
        nicTags['xcsh-managed-by'] !== 'azure-ce' ||
        nicTags['xcsh-execution-engine'] !== 'terraform' ||
        nicTags['xcsh-deployment-id'] !== plan.deploymentName ||
        typeof nicTags['xcsh-plan-sha256'] !== 'string' ||
        !/^[a-f0-9]{64}$/.test(String(nicTags['xcsh-plan-sha256'])) ||
        (plan.relayProfile?.schemaVersion === 2 &&
          nicTags['xcsh-plan-sha256'] !== azureRelayReplacementRetainedOwner(plan, id)) ||
        !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(mac) ||
        typeof privateIp !== 'string' ||
        (plan.relayProfile?.schemaVersion === 2 && configs.length !== 1) ||
        config.privateIPAddressVersion !== 'IPv4' ||
        typeof subnetId !== 'string'
      )
        throw new Error('Azure Terraform retained NIC identity is unavailable');
      retainedNics[`${node}:${nic.index}`] = {
        resourceId: id,
        subnetId,
        mac,
        privateIp,
        ownerPlanSha256: String(nicTags['xcsh-plan-sha256']),
      };
    }
  }
  if (new Set(Object.values(oldVmIds).map(lower5)).size !== plan.topology.nodeCount)
    throw new Error('Azure Terraform original VM identities are ambiguous');
  if (plan.relayProfile?.schemaVersion === 2 && !validAzureRelayRetainedNics(plan, retainedNics))
    throw Error('Azure Terraform retained NIC identity joins differ');
  const routeServer =
    plan.routing.mode === 'route-server'
      ? await captureAzureReplacementRouteServerOwnership(plan, api, signal)
      : undefined;
  return { oldVmIds, ownerPlanSha256ByNode, retainedNics, ...(routeServer ? { routeServer } : {}) };
}
async function currentCloudEvidence(plan, checkpoint, api, phase, signal) {
  await account(plan, api, signal);
  const rows = await listVms(plan, api, signal);
  const selected = selectedNode(plan);
  const currentVmIds = {};
  const expectedInterfaces = [];
  for (let node = 1; node <= plan.topology.nodeCount; node++) {
    const name = `${plan.deploymentName}-${node}`;
    const resourceId = vmResourceId(plan, node);
    const matches = rows.filter((row) => lower5(row.id) === lower5(resourceId));
    if (node === selected && phase === 'quiesced') {
      if (matches.length) throw new Error('Azure Terraform replacement VM deletion has not converged');
    } else {
      if (node === selected && phase === 'launched' && matches.length === 0)
        throw new Error('Azure Terraform replacement VM launch has not converged');
      const vm = matches.length === 1 ? matches[0] : undefined;
      const tags = vm ? object19(vm.tags) : {};
      const attachments =
        vm && Array.isArray(object19(vm.networkProfile).networkInterfaces)
          ? object19(vm.networkProfile).networkInterfaces.map((item) => lower5(object19(item).id))
          : [];
      const expectedAttachments = plan.nics.map((nic) => lower5(nicResourceId(plan, node, nic.index)));
      const expectedOwner =
        node === selected && phase === 'launched' ? plan.planSha256 : checkpoint.ownerPlanSha256ByNode[name];
      if (
        !vm ||
        vm.name !== name ||
        lower5(vm.location) !== lower5(plan.region) ||
        vm.provisioningState !== 'Succeeded' ||
        lower5(object19(vm.hardwareProfile).vmSize) !== lower5(plan.vm.size) ||
        attachments.length !== expectedAttachments.length ||
        expectedAttachments.some((id) => !attachments.includes(id)) ||
        !uuid(vm.vmId) ||
        tags['xcsh-managed-by'] !== 'azure-ce' ||
        tags['xcsh-execution-engine'] !== 'terraform' ||
        tags['xcsh-deployment-id'] !== plan.deploymentName ||
        tags['xcsh-plan-sha256'] !== expectedOwner ||
        (node !== selected && lower5(vm.vmId) !== lower5(checkpoint.oldVmIds[name])) ||
        (node === selected && phase === 'intact' && lower5(vm.vmId) !== lower5(checkpoint.oldVmIds[name])) ||
        (node === selected && phase === 'launched' && lower5(vm.vmId) === lower5(checkpoint.oldVmIds[name]))
      )
        throw new Error('Azure Terraform replacement VM identity changed outside the selected boundary');
      currentVmIds[name] = vm.vmId;
    }
    for (const nic of plan.nics) {
      const key = `${node}:${nic.index}`;
      const expected = checkpoint.retainedNics[key];
      if (!expected) throw new Error('Azure Terraform retained NIC checkpoint is incomplete');
      const value = await azJson(
        api,
        ['network', 'nic', 'show', '--ids', expected.resourceId, '--subscription', plan.subscription.id],
        signal,
      );
      const tags = object19(value.tags);
      const configs = Array.isArray(value.ipConfigurations) ? value.ipConfigurations.map((item) => object19(item)) : [];
      const primary = configs.filter(
        (item) => item.primary === true || (configs.length === 1 && item.primary === undefined),
      );
      const config = primary.length === 1 ? primary[0] : {};
      const attachment = lower5(
        value.virtualMachine && typeof value.virtualMachine === 'object' && !Array.isArray(value.virtualMachine)
          ? value.virtualMachine.id
          : undefined,
      );
      const expectedAttachment = node === selected && phase === 'quiesced' ? '' : lower5(resourceId);
      if (
        lower5(value.id) !== lower5(expected.resourceId) ||
        lower5(value.location) !== lower5(plan.region) ||
        value.provisioningState !== 'Succeeded' ||
        attachment !== expectedAttachment ||
        (plan.relayProfile?.schemaVersion === 2 && configs.length !== 1) ||
        tags['xcsh-managed-by'] !== 'azure-ce' ||
        tags['xcsh-execution-engine'] !== 'terraform' ||
        tags['xcsh-deployment-id'] !== plan.deploymentName ||
        tags['xcsh-plan-sha256'] !== expected.ownerPlanSha256 ||
        lower5(value.macAddress).replaceAll('-', ':') !== expected.mac ||
        config.privateIPAddress !== expected.privateIp ||
        lower5(object19(config.subnet).id) !== lower5(expected.subnetId)
      )
        throw new Error('Azure Terraform retained NIC identity, attachment, or address changed');
      if (nic.role === 'slo' || nic.role === 'data' || nic.role === 'sli')
        expectedInterfaces.push({ node: name, role: nic.role, mac: expected.mac });
    }
  }
  if (
    plan.relayProfile &&
    canonicalSha256(await captureAzureReplacementRouteServerOwnership(plan, api, signal)) !==
      canonicalSha256(checkpoint.routeServer)
  )
    throw Error('Azure Terraform replacement retained relay ownership changed');
  return { currentVmIds, expectedInterfaces, observedAt: new Date().toISOString() };
}
async function validateOutputs(plan, session, checkpoint, currentVmIds, env, signal) {
  const outputs = await session.readOutputs(['ce_instances', 'ce_interfaces'], env, signal);
  const instances = object19(outputs.ce_instances, 'Azure Terraform replacement instance outputs are unavailable');
  const interfaces = object19(outputs.ce_interfaces, 'Azure Terraform replacement interface outputs are unavailable');
  if (
    Object.keys(instances).sort().join(',') !==
      Array.from({ length: plan.topology.nodeCount }, (_, index) => String(index + 1)).join(',') ||
    Object.keys(interfaces).sort().join(',') !== Object.keys(checkpoint.retainedNics).sort().join(',')
  )
    throw new Error('Azure Terraform replacement output inventory is incomplete');
  for (let node = 1; node <= plan.topology.nodeCount; node++) {
    const name = `${plan.deploymentName}-${node}`;
    const instance = object19(instances[String(node)]);
    if (
      lower5(instance.id) !== lower5(vmResourceId(plan, node)) ||
      lower5(instance.vm_id) !== lower5(currentVmIds[name]) ||
      instance.site_name !== plan.siteName ||
      instance.hostname !== name
    )
      throw new Error('Azure Terraform replacement VM output differs from live identity');
    for (const nic of plan.nics) {
      const key = `${node}:${nic.index}`;
      const expected = checkpoint.retainedNics[key];
      const value = object19(interfaces[key]);
      if (
        lower5(value.id) !== lower5(expected.resourceId) ||
        lower5(value.subnet_id) !== lower5(expected.subnetId) ||
        value.site_name !== plan.siteName ||
        value.node !== node ||
        value.index !== nic.index ||
        value.role !== nic.role
      )
        throw new Error('Azure Terraform replacement retained-interface output differs');
    }
  }
  return outputs;
}
function validateAzureTerraformReplacementCheckpoint(plan, value) {
  verifyAzureCePlan(plan);
  const checkpoint = object19(value);
  const expectedKeys = [
    'schemaVersion',
    'engine',
    'planSha256',
    'node',
    'sourceConfigurationSha256',
    'quiesceConfigurationSha256',
    'launchConfigurationSha256',
    'bootstrapSha256',
    'siteUid',
    'siteConfigurationSha256',
    'oldVmIds',
    'ownerPlanSha256ByNode',
    'retainedNics',
    'phase',
    ...(plan.terraformNetworkReplacementProfile ? ['networkExecutionJournalSha256', 'networkSourceBindingSha256'] : []),
    ...(checkpoint.routeServer !== undefined ? ['routeServer'] : []),
    ...(checkpoint.newVmId !== undefined ? ['newVmId'] : []),
  ];
  const nodes = Array.from({ length: plan.topology.nodeCount }, (_, index) => `${plan.deploymentName}-${index + 1}`);
  const nicKeys = nodes.flatMap((_name, index) => plan.nics.map((nic) => `${index + 1}:${nic.index}`));
  if (
    Object.keys(checkpoint).sort().join(',') !== expectedKeys.sort().join(',') ||
    checkpoint.schemaVersion !== 1 ||
    checkpoint.engine !== 'terraform' ||
    checkpoint.planSha256 !== plan.planSha256 ||
    checkpoint.node !== selectedNode(plan) ||
    (plan.terraformNetworkReplacementProfile &&
      [checkpoint.networkExecutionJournalSha256, checkpoint.networkSourceBindingSha256].some(
        (v) => typeof v !== 'string' || !/^[a-f0-9]{64}$/.test(v),
      )) ||
    !['prepared', 'quiesced', 'launched', 'complete'].includes(checkpoint.phase) ||
    [
      checkpoint.sourceConfigurationSha256,
      checkpoint.quiesceConfigurationSha256,
      checkpoint.launchConfigurationSha256,
      checkpoint.bootstrapSha256,
      checkpoint.siteConfigurationSha256,
    ].some((item) => !/^[a-f0-9]{64}$/.test(item)) ||
    typeof checkpoint.siteUid !== 'string' ||
    !checkpoint.siteUid ||
    Object.keys(checkpoint.oldVmIds).sort().join(',') !== [...nodes].sort().join(',') ||
    Object.keys(checkpoint.ownerPlanSha256ByNode).sort().join(',') !== [...nodes].sort().join(',') ||
    Object.keys(checkpoint.retainedNics).sort().join(',') !== [...nicKeys].sort().join(',') ||
    Object.values(checkpoint.oldVmIds).some((item) => !uuid(item)) ||
    new Set(Object.values(checkpoint.oldVmIds).map(lower5)).size !== nodes.length ||
    new Set(Object.values(checkpoint.retainedNics).map((nic) => lower5(nic.mac))).size !== nicKeys.length ||
    (plan.relayProfile?.schemaVersion === 2 && !validAzureRelayRetainedNics(plan, checkpoint.retainedNics)) ||
    Object.entries(checkpoint.ownerPlanSha256ByNode).some(
      ([name, item]) =>
        !/^[a-f0-9]{64}$/.test(item) ||
        (plan.relayProfile?.schemaVersion === 2 &&
          item !==
            azureRelayReplacementRetainedOwner(
              plan,
              `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${name}`,
            )),
    ) ||
    nicKeys.some((key) => {
      const nic = checkpoint.retainedNics[key];
      const [node, index] = key.split(':').map(Number);
      return (
        !nic ||
        lower5(nic.resourceId) !== lower5(nicResourceId(plan, node, index)) ||
        !lower5(nic.subnetId).startsWith(`/subscriptions/${plan.subscription.id}/`.toLowerCase()) ||
        !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(nic.mac) ||
        typeof nic.privateIp !== 'string' ||
        !/^[a-f0-9]{64}$/.test(nic.ownerPlanSha256) ||
        (plan.relayProfile?.schemaVersion === 2 &&
          nic.ownerPlanSha256 !== azureRelayReplacementRetainedOwner(plan, nic.resourceId))
      );
    }) ||
    (plan.routing.mode === 'route-server') !== Boolean(checkpoint.routeServer) ||
    (checkpoint.routeServer !== undefined &&
      !validAzureReplacementRouteServerOwnership(plan, checkpoint.routeServer)) ||
    (checkpoint.phase === 'prepared' || checkpoint.phase === 'quiesced'
      ? checkpoint.newVmId !== undefined
      : !uuid(checkpoint.newVmId)) ||
    (checkpoint.newVmId !== undefined &&
      Object.values(checkpoint.oldVmIds).some((item) => lower5(checkpoint.newVmId) === lower5(item)))
  )
    throw new Error('Azure Terraform replacement checkpoint differs from the immutable plan');
  return checkpoint;
}
function validateAzureTerraformReplacementSource(plan, checkpoint, value) {
  validateAzureTerraformReplacementCheckpoint(plan, checkpoint);
  const snapshot = object19(value);
  if (
    Object.keys(snapshot).sort().join(',') !==
      [
        'bootstrap',
        'planSha256',
        'preparedCheckpoint',
        'schemaVersion',
        'source',
        ...(plan.terraformNetworkReplacementProfile
          ? ['networkExecutionJournalSha256', 'networkSourceBindingSha256']
          : []),
      ]
        .sort()
        .join(',') ||
    (plan.terraformNetworkReplacementProfile &&
      (snapshot.networkExecutionJournalSha256 !== checkpoint.networkExecutionJournalSha256 ||
        snapshot.networkSourceBindingSha256 !== checkpoint.networkSourceBindingSha256)) ||
    snapshot.schemaVersion !== 1 ||
    snapshot.planSha256 !== plan.planSha256 ||
    typeof snapshot.source !== 'string' ||
    typeof snapshot.bootstrap !== 'string' ||
    digest3(snapshot.source) !== checkpoint.sourceConfigurationSha256 ||
    digest3(snapshot.bootstrap) !== checkpoint.bootstrapSha256
  )
    throw Error('Azure Terraform replacement private source snapshot differs');
  const prepared = validateAzureTerraformReplacementCheckpoint(plan, snapshot.preparedCheckpoint);
  const { newVmId: _newVmId, ...initial } = checkpoint;
  if (prepared.phase !== 'prepared' || canonicalSha256(prepared) !== canonicalSha256({ ...initial, phase: 'prepared' }))
    throw Error('Azure Terraform replacement prepared source identity differs');
  const built = azureTerraformReplacementStages(
    plan,
    snapshot.source,
    checkpoint.sourceConfigurationSha256,
    snapshot.bootstrap,
  );
  if (
    built.quiesce.configurationSha256 !== checkpoint.quiesceConfigurationSha256 ||
    built.launch.configurationSha256 !== checkpoint.launchConfigurationSha256
  )
    throw Error('Azure Terraform replacement stage configuration changed');
  return { source: snapshot.source, bootstrap: snapshot.bootstrap, stages: built };
}
function validateAzureTerraformReplacementStageHistory(plan, checkpoint, snapshot, records, providerLockSha256) {
  const built = validateAzureTerraformReplacementSource(plan, checkpoint, snapshot).stages;
  const vmId = vmResourceId(plan, checkpoint.node);
  for (const phase of ['quiesce', 'launch']) {
    const name = `${plan.planId}-terraform-${phase}-plan.json`;
    const value = records.get(name);
    const required =
      phase === 'quiesce'
        ? checkpoint.phase !== 'prepared'
        : checkpoint.phase === 'launched' || checkpoint.phase === 'complete';
    if (value === undefined) {
      if (required) throw Error('Azure Terraform replacement saved stage history is unavailable');
      continue;
    }
    const stage = built[phase];
    const record = object19(value);
    const receipt = object19(record.receipt);
    validateAzureTerraformReplacementStageReceipt(plan, stage, receipt, providerLockSha256);
    const identities = object19(record.identities);
    const expected = phase === 'quiesce' ? (receipt.noChanges ? null : vmId) : receipt.noChanges ? vmId : null;
    if (
      Object.keys(record).sort().join(',') !==
        [
          'identities',
          'receipt',
          ...(plan.terraformNetworkReplacementProfile
            ? ['networkExecutionJournalSha256', 'networkSourceBindingSha256']
            : []),
        ]
          .sort()
          .join(',') ||
      (plan.terraformNetworkReplacementProfile &&
        (record.networkExecutionJournalSha256 !== checkpoint.networkExecutionJournalSha256 ||
          record.networkSourceBindingSha256 !== checkpoint.networkSourceBindingSha256)) ||
      Object.keys(identities).join(',') !== stage.address ||
      (expected === null ? identities[stage.address] !== null : lower5(identities[stage.address]) !== lower5(expected))
    )
      throw Error('Azure Terraform replacement saved stage VM identity differs');
  }
  const final = records.get(`${plan.planId}-terraform-replacement-final-plan.json`);
  if (final === undefined) {
    if (checkpoint.phase === 'complete')
      throw Error('Azure Terraform replacement final no-change history is unavailable');
  } else {
    const receipt = object19(final);
    validateAzureTerraformReplacementStageReceipt(plan, built.launch, receipt, providerLockSha256);
    if (!receipt.noChanges || !['launched', 'complete'].includes(checkpoint.phase))
      throw Error('Azure Terraform replacement final no-change history differs');
  }
}
async function loadStageHistory(plan, storage) {
  const records = new Map();
  for (const suffix of ['quiesce-plan', 'launch-plan', 'replacement-final-plan']) {
    const name = `${plan.planId}-terraform-${suffix}.json`;
    try {
      records.set(name, await storage.read(name));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return records;
}
async function applyStage(
  plan,
  session,
  stage,
  storage,
  api,
  checkpoint,
  env,
  providerLockSha256,
  signal,
  guard,
  enrollment,
) {
  const evidencePhase = stage.phase === 'quiesce' ? 'quiesced' : 'launched';
  let currentSha256 = await session.readConfigurationSha256?.();
  if (!currentSha256) throw new Error('Terraform replacement configuration identity is unavailable');
  const receiptName = `${plan.planId}-terraform-${stage.phase}-plan.json`;
  const fields = guard
    ? { networkExecutionJournalSha256: guard.journalSha256, networkSourceBindingSha256: guard.sourceBindingSha256 }
    : {};
  const sealExecution = async () => {
    if (!guard) return;
    const saved = validateAzureTerraformReplacementCheckpoint(plan, await storage.read(checkpointName(plan)));
    if (canonicalSha256(saved) !== canonicalSha256(checkpoint))
      throw Error('Azure Terraform network replacement execution checkpoint changed');
    const snapshot = await storage.read(sourceName(plan));
    const material = validateAzureTerraformReplacementSource(plan, saved, snapshot);
    const { oldVmIds, ownerPlanSha256ByNode, retainedNics, siteUid, siteConfigurationSha256 } = saved;
    guard.compare(material.source, { oldVmIds, ownerPlanSha256ByNode, retainedNics, siteUid, siteConfigurationSha256 });
    validateAzureTerraformReplacementStageHistory(
      plan,
      saved,
      snapshot,
      await loadStageHistory(plan, storage),
      providerLockSha256,
    );
  };
  await sealExecution();
  const strictEvidence = async () => {
    const evidence = await currentCloudEvidence(plan, checkpoint, api, evidencePhase, signal);
    const target = `${plan.deploymentName}-${selectedNode(plan)}`;
    await guard?.check(
      stage.configurationSha256,
      evidencePhase,
      evidencePhase === 'launched' ? evidence.currentVmIds[target] : undefined,
    );
    await sealExecution();
    return evidence;
  };
  const seal = async (record) => {
    await sealExecution();
    if (guard && canonicalSha256(await storage.read(receiptName)) !== canonicalSha256(record))
      throw Error('Azure Terraform network replacement saved stage changed at execution boundary');
  };
  let unsubmitted;
  if (currentSha256 === stage.configurationSha256) {
    try {
      const previous = object19(await storage.read(receiptName));
      const receipt = previous.receipt;
      validateAzureTerraformReplacementStageReceipt(plan, stage, receipt, providerLockSha256);
      if (guard) {
        if (
          previous.networkExecutionJournalSha256 !== guard.journalSha256 ||
          previous.networkSourceBindingSha256 !== guard.sourceBindingSha256
        )
          throw Error('Azure Terraform network replacement saved stage owning journal differs');
        const state = await session.readPlanApplicationState?.(receipt);
        if (!['planned', 'applying', 'applied'].includes(String(state)))
          throw Error('Azure Terraform network replacement exact saved application state unavailable');
        if (state !== 'planned') {
          const evidence = await strictEvidence();
          await seal(previous);
          if (state === 'applying') await session.reconcileApplyFromEvidence(receipt, canonicalSha256(evidence));
          return evidence;
        }
        await guard.check(stage.configurationSha256, stage.phase === 'quiesce' ? 'intact' : 'quiesced');
        unsubmitted = { receipt: structuredClone(receipt), record: structuredClone(previous) };
      } else {
        const evidence = await currentCloudEvidence(plan, checkpoint, api, evidencePhase, signal);
        await session.reconcileApplyFromEvidence(receipt, canonicalSha256(evidence));
      }
    } catch (error) {
      if (guard && error.code === 'ENOENT') {
        await guard.check(stage.configurationSha256, stage.phase === 'quiesce' ? 'intact' : 'quiesced');
      }
      if (error.code !== 'ENOENT') {
        if (guard) throw error;
        if (!(error instanceof Error) || !error.message.includes('has not converged')) throw error;
      }
    }
  } else if (currentSha256 === stage.previousConfigurationSha256) {
    await currentCloudEvidence(plan, checkpoint, api, stage.phase === 'quiesce' ? 'intact' : 'quiesced', signal);
    await guard?.check(currentSha256, stage.phase === 'quiesce' ? 'intact' : 'quiesced');
    await sealExecution();
    await session.reviseConfiguration(currentSha256, stage.configuration);
    currentSha256 = stage.configurationSha256;
  } else {
    throw new Error('Terraform replacement configuration differs from the persisted stage');
  }
  const receipt = unsubmitted?.receipt ?? (await session.plan(env, signal));
  validateAzureTerraformReplacementStageReceipt(plan, stage, receipt, providerLockSha256);
  const identities = await session.readPlannedResourceIds(receipt, [stage.address], env, signal);
  const expectedId = vmResourceId(plan, selectedNode(plan));
  if (
    (!receipt.noChanges && stage.phase === 'quiesce' && lower5(identities[stage.address]) !== lower5(expectedId)) ||
    (!receipt.noChanges && stage.phase === 'launch' && identities[stage.address] !== null)
  )
    throw new Error('Azure Terraform replacement saved plan targets a different VM identity');
  const record = { receipt, identities, ...fields };
  if (unsubmitted) {
    if (canonicalSha256(unsubmitted.record) !== canonicalSha256(record))
      throw Error('Azure Terraform network replacement saved unsubmitted target identities differ');
    await seal(record);
  } else {
    await storage.write(receiptName, record);
  }
  if (guard) {
    await guard.check(
      stage.configurationSha256,
      receipt.noChanges ? evidencePhase : stage.phase === 'quiesce' ? 'intact' : 'quiesced',
      receipt.noChanges && evidencePhase === 'launched' ? checkpoint.newVmId : undefined,
    );
    if (
      !receipt.noChanges &&
      stage.phase === 'quiesce' &&
      !(await guard.operational(stage.configurationSha256, 'intact', 'preflight'))
    )
      throw new NetworkReplacementOperationalPending('Current preflight evidence unavailable');
    const currentEnrollment = receipt.noChanges ? undefined : await enrollment?.();
    if (!receipt.noChanges && !currentEnrollment)
      throw new NetworkReplacementEnrollmentPending('Current saved enrollment unavailable');
    await seal(record);
    const state = await session.readPlanApplicationState?.(receipt);
    if (state !== 'planned') throw Error('Azure Terraform network replacement saved plan is not unsubmitted');
    await seal(record);
    if (currentEnrollment) {
      if (
        canonicalSha256(await storage.read(`${currentEnrollment.witness.tokenName}.json`)) !==
        currentEnrollment.privateTokenSha256
      )
        throw Error('Azure Terraform network replacement private token changed at apply boundary');
      if (
        canonicalSha256(storage.owner) !== canonicalSha256(currentEnrollment.witness.owner) ||
        plan.planSha256 !== currentEnrollment.planSha256
      )
        throw Error('Azure Terraform network replacement enrollment context changed at apply boundary');
      verifyAzureCePlan(plan);
      if (
        !Number.isFinite(currentEnrollment.witness.expiresAt) ||
        currentEnrollment.witness.expiresAt <= Date.now() + 60000
      )
        throw new NetworkReplacementEnrollmentPending('Current saved enrollment expired at apply boundary');
    }
  }
  if (!receipt.noChanges) {
    try {
      await session.apply(receipt, env, signal);
    } catch {
      const evidence = await strictEvidence();
      await seal(record);
      await storage.write(`${plan.planId}-terraform-${stage.phase}-recovery.json`, { ...evidence, ...fields });
      await guard?.check(
        stage.configurationSha256,
        evidencePhase,
        evidencePhase === 'launched'
          ? evidence.currentVmIds[`${plan.deploymentName}-${selectedNode(plan)}`]
          : undefined,
      );
      await seal(record);
      await session.reconcileApplyFromEvidence(receipt, canonicalSha256(evidence));
      return evidence;
    }
  }
  return strictEvidence();
}
async function runAzureTerraformReplacement(
  plan,
  terraform,
  runtime,
  storage,
  api,
  env,
  signal,
  acceptIngress,
  qualifySource,
  networkExecution,
) {
  verifyAzureCePlan(plan);
  const node = selectedNode(plan);
  if (Boolean(plan.terraformNetworkReplacementProfile) !== Boolean(networkExecution))
    throw Error('Azure Terraform replacement requires the exact owning network execution binding for its profile');
  if (runtime.engine !== 'terraform' || storage.owner.engine !== 'terraform')
    throw new Error('Only the owning Terraform engine may replace an Azure node');
  if (canonicalSha256(storage.owner) !== canonicalSha256(azureUpgradeBinding(plan).owner))
    throw new Error('Azure Terraform replacement storage ownership differs');
  runtime.requireBootstrapContract('azure');
  requireAzureCeRoutingContract(plan, runtime);
  const release = await acquireProcessLock(`${storage.directory}/.terraform-replacement-lock`);
  try {
    await storage.verify();
    await persistReplacementPlan(plan, storage);
    if (
      plan.relayProfile?.schemaVersion === 2 &&
      plan.relayProfile.retainedDeploymentPlan.relayProfile?.schemaVersion === 2
    ) {
      const predecessor = plan.relayProfile.retainedDeploymentPlan;
      let previous;
      try {
        previous = validateAzureTerraformReplacementCheckpoint(
          predecessor,
          await storage.read(checkpointName(predecessor)),
        );
      } catch (error) {
        if (error.code === 'ENOENT')
          throw Error('Azure relay replacement predecessor execution history is unavailable');
        throw error;
      }
      if (previous.phase !== 'complete')
        throw Error('Azure relay replacement predecessor has not completed its public execution contract');
      const history = new Map();
      for (const name of azureRelayHistoricalArtifacts)
        history.set(name, await storage.read(`${predecessor.planId}-replacement-${name}`));
      requireAzureRelayHistoricalAcceptance(predecessor, previous.siteUid, history);
      validateAzureTerraformReplacementStageHistory(
        predecessor,
        previous,
        await storage.read(sourceName(predecessor)),
        await loadStageHistory(predecessor, storage),
        digest3((await azureTerraformCurrentDeployment(predecessor)).providerLock),
      );
    }
    const deployment = await azureTerraformCurrentDeployment(plan);
    const providerLockSha256 = digest3(deployment.providerLock);
    const session = await terraform.open(azureUpgradeBinding(plan).owner, deployment, 'current');
    const guard = networkExecution
      ? await openAzureTerraformNetworkReplacementExecution(plan, storage, session, api, networkExecution, signal)
      : undefined;
    const networkFields = guard
      ? { networkExecutionJournalSha256: guard.journalSha256, networkSourceBindingSha256: guard.sourceBindingSha256 }
      : {};
    const pending = (purpose) => ({
      engine: 'terraform',
      planId: plan.planId,
      planSha256: plan.planSha256,
      status: 'operational-acceptance-pending',
      purpose,
      reason: 'current-node-interface-routing-traffic-evidence-unverified',
      ...networkFields,
    });
    let checkpoint;
    let source;
    let bootstrap;
    let persistedCheckpoint;
    let snapshot;
    for (const [name, assign] of [
      [
        checkpointName(plan),
        (value) => {
          persistedCheckpoint = value;
        },
      ],
      [
        sourceName(plan),
        (value) => {
          snapshot = value;
        },
      ],
    ]) {
      try {
        assign(await storage.read(name));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    if (guard && persistedCheckpoint === undefined && snapshot === undefined) {
      const token = `${plan.deploymentName.slice(0, 40)}-${node}-${plan.planSha256.slice(0, 12)}`;
      const later = [
        `${token}.json`,
        ...[
          'quiesce-plan',
          'launch-plan',
          'quiesce-recovery',
          'launch-recovery',
          'replacement-registration',
          'replacement-final-plan',
          'network-replacement-complete',
        ].map((s) => `${plan.planId}-terraform-${s}.json`),
      ];
      for (const name of later) {
        try {
          await storage.read(name);
        } catch (error) {
          if (error.code === 'ENOENT') continue;
          throw error;
        }
        throw Error(
          'Azure Terraform network replacement original execution source missing after enrollment or stage publication',
        );
      }
    }
    if (persistedCheckpoint !== undefined || snapshot !== undefined) {
      if (snapshot === undefined) throw Error('Azure Terraform replacement private source snapshot is unavailable');
      checkpoint = validateAzureTerraformReplacementCheckpoint(
        plan,
        persistedCheckpoint === undefined ? object19(snapshot).preparedCheckpoint : persistedCheckpoint,
      );
      if (guard && checkpoint.phase === 'complete') {
        try {
          await storage.read(azureTerraformNetworkReplacementCompletionName(plan));
        } catch (error) {
          if (error.code === 'ENOENT')
            throw Error('Azure Terraform network replacement complete checkpoint lacks immutable completion');
          throw error;
        }
      }
      ({ source, bootstrap } = validateAzureTerraformReplacementSource(plan, checkpoint, snapshot));
      if (guard) {
        if (
          checkpoint.networkExecutionJournalSha256 !== guard.journalSha256 ||
          checkpoint.networkSourceBindingSha256 !== guard.sourceBindingSha256
        )
          throw Error('Azure Terraform replacement checkpoint owning journal differs');
        const { oldVmIds, ownerPlanSha256ByNode, retainedNics, siteUid, siteConfigurationSha256 } = checkpoint;
        guard.compare(source, { oldVmIds, ownerPlanSha256ByNode, retainedNics, siteUid, siteConfigurationSha256 });
      }
      if (persistedCheckpoint === undefined) {
        if (
          checkpoint.phase !== 'prepared' ||
          (await session.readConfigurationSha256?.()) !== checkpoint.sourceConfigurationSha256
        )
          throw Error('Azure Terraform replacement prepared recovery configuration differs');
        await currentCloudEvidence(plan, checkpoint, api, 'intact', signal);
        await guard?.check(checkpoint.sourceConfigurationSha256, 'intact');
        await storage.write(checkpointName(plan), checkpoint);
      }
    } else {
      const sourceConfigurationSha256 = await session.readConfigurationSha256?.();
      if (!sourceConfigurationSha256)
        throw new Error('Terraform replacement source configuration identity is unavailable');
      source = await session.readConfiguration(sourceConfigurationSha256);
      validateReplacementConfiguration(plan, source);
      const cloud = await initialCloudEvidence(plan, api, signal);
      validateRetainedConfigurationIdentity(plan, source, cloud);
      const binding = azureUpgradeBinding(plan);
      const site = await runtime.observeOwnedSite(binding, signal);
      const siteUid = object19(site.system_metadata).uid;
      if (typeof siteUid !== 'string' || !siteUid)
        throw new Error('Azure Terraform replacement site UID is unavailable');
      const siteConfigurationSha256 = canonicalSha256(runtime.ownedSiteConfiguration(binding, site));
      await qualifySource?.(source, { ...cloud, siteUid, siteConfigurationSha256 });
      if (guard) {
        guard.compare(source, { ...cloud, siteUid, siteConfigurationSha256 });
        if (!(await guard.operational(sourceConfigurationSha256, 'intact', 'preflight'))) return pending('preflight');
      }
      const nodeName = `${plan.deploymentName}-${node}`;
      const tokenName = `${plan.deploymentName.slice(0, 40)}-${node}-${plan.planSha256.slice(0, 12)}`;
      bootstrap = await runtime.bootstrap(
        binding,
        nodeName,
        tokenName,
        (secret) => storage.write(`${tokenName}.json`, secret),
        signal,
      );
      await guard?.check(sourceConfigurationSha256, 'intact');
      const built = azureTerraformReplacementStages(plan, source, sourceConfigurationSha256, bootstrap);
      checkpoint = {
        schemaVersion: 1,
        ...networkFields,
        engine: 'terraform',
        planSha256: plan.planSha256,
        node,
        sourceConfigurationSha256,
        quiesceConfigurationSha256: built.quiesce.configurationSha256,
        launchConfigurationSha256: built.launch.configurationSha256,
        bootstrapSha256: digest3(bootstrap),
        siteUid,
        siteConfigurationSha256,
        ...cloud,
        phase: 'prepared',
      };
      validateAzureTerraformReplacementCheckpoint(plan, checkpoint);
      await storage.write(sourceName(plan), {
        schemaVersion: 1,
        ...networkFields,
        planSha256: plan.planSha256,
        source,
        bootstrap,
        preparedCheckpoint: structuredClone(checkpoint),
      });
      await storage.write(checkpointName(plan), checkpoint);
    }
    await qualifySource?.(source, checkpoint);
    validateRetainedConfigurationIdentity(plan, source, checkpoint);
    const built = azureTerraformReplacementStages(plan, source, checkpoint.sourceConfigurationSha256, bootstrap);
    if (
      built.quiesce.configurationSha256 !== checkpoint.quiesceConfigurationSha256 ||
      built.launch.configurationSha256 !== checkpoint.launchConfigurationSha256
    )
      throw new Error('Azure Terraform replacement stage configuration changed');
    validateAzureTerraformReplacementStageHistory(
      plan,
      checkpoint,
      await storage.read(sourceName(plan)),
      await loadStageHistory(plan, storage),
      providerLockSha256,
    );
    const enrollment = guard
      ? () =>
          observeAzureTerraformNetworkReplacementEnrollment(
            plan,
            bootstrap,
            checkpoint.bootstrapSha256,
            storage,
            runtime,
            signal,
          )
      : undefined;
    const sealExecution = async () => {
      if (!guard) return;
      const saved = validateAzureTerraformReplacementCheckpoint(plan, await storage.read(checkpointName(plan)));
      if (canonicalSha256(saved) !== canonicalSha256(checkpoint))
        throw Error('Azure Terraform network replacement execution checkpoint changed');
      const packet = await storage.read(sourceName(plan));
      const material = validateAzureTerraformReplacementSource(plan, saved, packet);
      const { oldVmIds, ownerPlanSha256ByNode, retainedNics, siteUid, siteConfigurationSha256 } = saved;
      guard.compare(material.source, {
        oldVmIds,
        ownerPlanSha256ByNode,
        retainedNics,
        siteUid,
        siteConfigurationSha256,
      });
      validateAzureTerraformReplacementStageHistory(
        plan,
        saved,
        packet,
        await loadStageHistory(plan, storage),
        providerLockSha256,
      );
    };
    if (
      guard &&
      checkpoint.phase === 'prepared' &&
      (await session.readConfigurationSha256?.()) === checkpoint.sourceConfigurationSha256
    ) {
      if (!(await guard.operational(checkpoint.sourceConfigurationSha256, 'intact', 'preflight')))
        return pending('preflight');
    }
    if (checkpoint.phase === 'prepared') {
      await applyStage(
        plan,
        session,
        built.quiesce,
        storage,
        api,
        checkpoint,
        env,
        providerLockSha256,
        signal,
        guard,
        enrollment,
      );
      checkpoint.phase = 'quiesced';
      await storage.write(checkpointName(plan), checkpoint);
    }
    let launchEvidence;
    if (checkpoint.phase === 'quiesced') {
      launchEvidence = await applyStage(
        plan,
        session,
        built.launch,
        storage,
        api,
        checkpoint,
        env,
        providerLockSha256,
        signal,
        guard,
        enrollment,
      );
      const target = `${plan.deploymentName}-${node}`;
      checkpoint.newVmId = launchEvidence.currentVmIds[target];
      if (!uuid(checkpoint.newVmId)) throw new Error('Azure Terraform replacement VM UUID is unavailable');
      checkpoint.phase = 'launched';
      await storage.write(checkpointName(plan), checkpoint);
    } else {
      launchEvidence = await currentCloudEvidence(plan, checkpoint, api, 'launched', signal);
    }
    const target = `${plan.deploymentName}-${node}`;
    if (lower5(launchEvidence.currentVmIds[target]) !== lower5(checkpoint.newVmId))
      throw new Error('Azure Terraform replacement VM UUID changed after launch');
    await guard?.check(checkpoint.launchConfigurationSha256, 'launched', checkpoint.newVmId);
    await sealExecution();
    await validateOutputs(plan, session, checkpoint, launchEvidence.currentVmIds, env, signal);
    const binding = azureUpgradeBinding(plan);
    await guard?.check(checkpoint.launchConfigurationSha256, 'launched', checkpoint.newVmId);
    await sealExecution();
    await runtime.approveRegistrations(
      binding,
      launchEvidence.currentVmIds,
      (record) => storage.write(`${plan.planId}-terraform-replacement-registration.json`, record),
      signal,
      binding.nodes,
    );
    const vms = await listVms(plan, api, signal);
    const expectedOwners = {
      ...checkpoint.ownerPlanSha256ByNode,
      [target]: plan.planSha256,
    };
    const health = await collectAzurePlatformHealth(
      plan,
      vms,
      runtime,
      signal,
      plan.topology.nodeCount,
      expectedOwners,
    );
    const configuration = await runtime.observeRegisteredConfiguration(
      binding,
      launchEvidence.currentVmIds,
      launchEvidence.expectedInterfaces,
      signal,
    );
    if (health.status !== 'healthy' || configuration.status !== 'configured')
      throw new Error('Azure Terraform replacement registration or configuration has not converged');
    const site = await runtime.observeOwnedSite(binding, signal);
    if (
      object19(site.system_metadata).uid !== checkpoint.siteUid ||
      canonicalSha256(runtime.ownedSiteConfiguration(binding, site)) !== checkpoint.siteConfigurationSha256
    )
      throw new Error('Azure Terraform replacement changed the logical site identity or configuration');
    await guard?.check(checkpoint.launchConfigurationSha256, 'launched', checkpoint.newVmId);
    await sealExecution();
    let routing = 'unknown';
    if (plan.routing.mode === 'route-server') {
      const evidence = plan.relayProfile
        ? await configureAzureSelectedRelayRouting(
            plan,
            launchEvidence.expectedInterfaces,
            runtime,
            storage,
            api,
            signal,
          )
        : await configureAzureRouteServerRouting(
            plan,
            launchEvidence.expectedInterfaces,
            runtime,
            storage,
            api,
            signal,
            checkpoint.routeServer,
          );
      if (evidence.status !== 'healthy') throw new Error('Azure replacement Route Server routing has not converged');
      routing = 'healthy';
    }
    let traffic = 'unknown';
    let ingress;
    if (plan.intent.ingress?.mode === 'platform-http') {
      if (!acceptIngress) throw new Error('Azure Terraform replacement ingress acceptance driver is unavailable');
      ({ ingress, traffic } = await acceptIngress());
    }
    const finalOperational = guard
      ? await guard.operational(checkpoint.launchConfigurationSha256, 'launched', 'final', checkpoint.newVmId)
      : undefined;
    if (guard && !finalOperational) return pending('final');
    await sealExecution();
    const final = guard
      ? await planAzureTerraformReplacementFinalRefresh(
          plan,
          storage,
          session,
          {
            journalSha256: guard.journalSha256,
            sourceBindingSha256: guard.sourceBindingSha256,
            checkpointSha256: canonicalSha256({ ...checkpoint, phase: 'complete' }),
            configurationSha256: checkpoint.launchConfigurationSha256,
            providerLockSha256,
          },
          env,
          signal,
        )
      : await session.plan(env, signal);
    validateAzureTerraformReplacementStageReceipt(plan, built.launch, final, providerLockSha256);
    if (!final.noChanges || final.changes.some((change) => change.actions.join(',') !== 'no-op'))
      throw new Error('Azure Terraform replacement requires a final refresh-enabled no-change plan');
    await guard?.check(checkpoint.launchConfigurationSha256, 'launched', checkpoint.newVmId);
    await sealExecution();
    const refreshInventorySha256 =
      guard && networkExecution
        ? await publishAzureTerraformReplacementRefreshInventory(
            plan,
            storage,
            session,
            networkExecution,
            final,
            signal,
          )
        : undefined;
    await storage.write(`${plan.planId}-terraform-replacement-final-plan.json`, final);
    if (
      guard &&
      canonicalSha256(await storage.read(`${plan.planId}-terraform-replacement-final-plan.json`)) !==
        canonicalSha256(final)
    )
      throw Error('Azure Terraform network replacement final plan changed at publication');
    await guard?.check(checkpoint.launchConfigurationSha256, 'launched', checkpoint.newVmId);
    await sealExecution();
    const completion =
      guard && networkExecution && finalOperational
        ? await publishAzureTerraformNetworkReplacementCompletion(
            plan,
            storage,
            session,
            networkExecution,
            finalOperational,
            final,
            signal,
          )
        : undefined;
    if (completion) {
      await guard?.check(checkpoint.launchConfigurationSha256, 'launched', checkpoint.newVmId);
      await sealExecution();
      if (
        canonicalSha256(await storage.read(azureTerraformNetworkReplacementCompletionName(plan))) !==
          completion.completionSha256 ||
        canonicalSha256({ ...checkpoint, phase: 'complete' }) !== completion.checkpointSha256
      )
        throw Error('Azure Terraform network replacement completion changed before final checkpoint');
    }
    checkpoint.phase = 'complete';
    await storage.write(checkpointName(plan), checkpoint);
    if (
      completion &&
      (canonicalSha256(await storage.read(checkpointName(plan))) !== completion.checkpointSha256 ||
        canonicalSha256(await storage.read(azureTerraformNetworkReplacementCompletionName(plan))) !==
          completion.completionSha256)
    )
      throw Error('Azure Terraform network replacement completion changed at checkpoint publication');
    return {
      planId: plan.planId,
      planSha256: plan.planSha256,
      engine: 'terraform',
      status: 'complete',
      replacedNode: node,
      oldVmId: checkpoint.oldVmIds[target],
      newVmId: checkpoint.newVmId,
      retainedInterfaces: Object.values(checkpoint.retainedNics).map(({ resourceId, subnetId, mac, privateIp }) => ({
        resourceId,
        subnetId,
        mac,
        privateIp,
      })),
      siteUid: checkpoint.siteUid,
      health,
      configuration,
      routing,
      traffic,
      ...(ingress ? { ingress } : {}),
      terraformNoChanges: true,
      ...(completion ? { networkReplacementCompletionSha256: completion.completionSha256 } : {}),
      ...(refreshInventorySha256 ? { networkReplacementRefreshInventorySha256: refreshInventorySha256 } : {}),
    };
  } catch (error) {
    if (error instanceof AzureTerraformNetworkReplacementCompletionUnavailable)
      return {
        engine: 'terraform',
        planId: plan.planId,
        planSha256: plan.planSha256,
        status: 'completion-pending',
        reason: 'saved-completion-operational-provenance-unavailable',
        networkExecutionJournalSha256: networkExecution?.journalSha256,
        networkSourceBindingSha256: networkExecution?.sourceBindingSha256,
      };
    if (
      !(error instanceof NetworkReplacementOperationalPending) &&
      !(error instanceof NetworkReplacementEnrollmentPending)
    )
      throw error;
    return {
      engine: 'terraform',
      planId: plan.planId,
      planSha256: plan.planSha256,
      status:
        error instanceof NetworkReplacementEnrollmentPending ? 'enrollment-pending' : 'operational-acceptance-pending',
      purpose: 'preflight',
      reason:
        error instanceof NetworkReplacementEnrollmentPending
          ? 'saved-current-enrollment-unverified'
          : 'current-node-interface-routing-traffic-evidence-unverified',
      networkExecutionJournalSha256: networkExecution?.journalSha256,
      networkSourceBindingSha256: networkExecution?.sourceBindingSha256,
    };
  } finally {
    await release();
  }
}

// plugins/azure/src/ce/terraform-network-replacement-completion.ts
class AzureTerraformNetworkReplacementCompletionUnavailable extends Error {}
var azureTerraformNetworkReplacementCompletionName = (plan) =>
  `${plan.planId}-terraform-network-replacement-complete.json`;
var same16 = (a, b) => (a === undefined || b === undefined ? a === b : canonicalSha256(a) === canonicalSha256(b));
var lower6 = (v) => (typeof v === 'string' ? v.toLowerCase() : '');
var sha7 = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
var uuid2 = (v) => typeof v === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
function require23(v, message) {
  if (!v) throw Error(`Azure Terraform network replacement completion: ${message}`);
}
function object20(v) {
  require23(v && typeof v === 'object' && !Array.isArray(v), 'complete private object required');
  return v;
}
function keys6(v, fields) {
  require23(same16(Object.keys(object20(v)).sort(), fields.toSorted()), 'private completion schema differs');
}
function verification(v) {
  keys6(v, ['status', 'scope', 'evidenceSha256']);
  const row = v;
  require23(
    row.status === 'verified' && row.scope === 'node-interfaces-routing-traffic' && sha7(row.evidenceSha256),
    'complete operational provenance required',
  );
  return row;
}
async function openAzureTerraformNetworkReplacementCompletionArtifacts(request, store, dependencies, signal) {
  const plan = structuredClone(request),
    owner = structuredClone(store.owner),
    site = structuredClone(dependencies.site),
    { journalSha256, sourceBindingSha256, loaders } = dependencies,
    { loadSource, loadOutcome } = loaders,
    { qualifyHistorical: historical, qualifyCompletedOperational: completed } = dependencies,
    qualifiedPrevious = dependencies.qualifiedPrevious ? structuredClone(dependencies.qualifiedPrevious) : undefined;
  verifyAzureCePlan(plan);
  verifyAzureTerraformNetworkReplacementProfile(plan);
  require23(
    same16(owner, azureUpgradeBinding(plan).owner) &&
      sha7(journalSha256) &&
      sha7(sourceBindingSha256) &&
      typeof completed === 'function',
    'resolved owning completion context required',
  );
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const bounded = async (task) => {
    deadline.throwIfAborted();
    const abort = Promise.withResolvers(),
      onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([task(), abort.promise]);
      deadline.throwIfAborted();
      return result;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const unchanged = () =>
    require23(
      same16(plan, request) &&
        same16(owner, store.owner) &&
        same16(site, dependencies.site) &&
        journalSha256 === dependencies.journalSha256 &&
        sourceBindingSha256 === dependencies.sourceBindingSha256 &&
        dependencies.loaders === loaders &&
        loaders.loadSource === loadSource &&
        loaders.loadOutcome === loadOutcome &&
        dependencies.qualifyHistorical === historical &&
        dependencies.qualifyCompletedOperational === completed &&
        same16(qualifiedPrevious, dependencies.qualifiedPrevious),
      'owning completion context changed',
    );
  const verify = async () => {
    unchanged();
    await bounded(() => store.verify());
    unchanged();
  };
  await verify();
  const observed = new Map(),
    sources = new Map(),
    outcomes = new Map();
  const read = async (name) => {
    unchanged();
    const raw = await bounded(() => store.read(name)),
      digest = canonicalSha256(raw);
    require23(!observed.has(name) || observed.get(name) === digest, 'private packet changed across completion reads');
    observed.set(name, digest);
    unchanged();
    return structuredClone(raw);
  };
  const readonly = new Proxy(store, {
    get(target, key) {
      if (key === 'read') return read;
      if (key === 'verify') return verify;
      if (['write', 'remove', 'retire'].includes(String(key)))
        return () => {
          throw Error('Completion history is read-only');
        };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const fixedLoaders = {
    async loadSource(digest) {
      const raw = await bounded(() => loadSource.call(loaders, digest)),
        actual = canonicalSha256(raw);
      require23(!sources.has(digest) || sources.get(digest) === actual, 'predecessor plan changed');
      sources.set(digest, actual);
      unchanged();
      return structuredClone(raw);
    },
    async loadOutcome(source) {
      const raw = await bounded(() => loadOutcome.call(loaders, structuredClone(source))),
        actual = canonicalSha256(raw);
      require23(
        !outcomes.has(source.planSha256) || outcomes.get(source.planSha256)?.sha256 === actual,
        'predecessor outcome changed',
      );
      outcomes.set(source.planSha256, { plan: structuredClone(source), sha256: actual });
      unchanged();
      return structuredClone(raw);
    },
  };
  const historicalVerifier = (receipt, identity, mode) => {
    require23(mode === 'historical', 'completion ancestry requires historical provenance');
    return bounded(() => historical(structuredClone(receipt), structuredClone(identity), 'historical', deadline));
  };
  const qualified = await readAzureTerraformNetworkReplacementExecutionBinding(
    plan,
    readonly,
    fixedLoaders,
    site,
    journalSha256,
    historicalVerifier,
    deadline,
    qualifiedPrevious,
    completed,
  );
  const journal = qualified.execution;
  require23(
    journal.journal.sourceBindingSha256 === sourceBindingSha256 &&
      qualified.source.sourceBindingSha256 === sourceBindingSha256,
    'journal source differs',
  );
  const binding = qualified.source.binding;
  require23(same16(await read(`${plan.planId}-terraform-replacement-plan.json`), plan), 'saved public request differs');
  const checkpoint = validateAzureTerraformReplacementCheckpoint(
    plan,
    await read(`${plan.planId}-terraform-replacement.json`),
  );
  require23(
    ['launched', 'complete'].includes(checkpoint.phase) &&
      uuid2(checkpoint.newVmId) &&
      !Object.values(binding.before.nodes).some((v) => lower6(v.vmId) === lower6(checkpoint.newVmId)) &&
      checkpoint.networkExecutionJournalSha256 === journalSha256 &&
      checkpoint.networkSourceBindingSha256 === sourceBindingSha256,
    'launched owning checkpoint and distinct new UUID required',
  );
  const snapshot = await read(`${plan.planId}-terraform-replacement-source.json`),
    material = validateAzureTerraformReplacementSource(plan, checkpoint, snapshot);
  require23(material.source === binding.source, 'frozen replacement source differs');
  const oldVmIds = {},
    ownerPlanSha256ByNode = {},
    retainedNics = {};
  for (const [node, vm] of Object.entries(binding.before.nodes)) {
    oldVmIds[`${plan.deploymentName}-${node}`] = vm.vmId;
    ownerPlanSha256ByNode[`${plan.deploymentName}-${node}`] = vm.ownerPlanSha256;
    for (const [index, nic] of Object.entries(vm.nics))
      retainedNics[`${node}:${index}`] = {
        resourceId: nic.resourceId,
        subnetId: nic.subnetId,
        mac: nic.mac,
        privateIp: nic.privateIp,
        ownerPlanSha256: nic.ownerPlanSha256,
      };
  }
  require23(
    same16(
      {
        oldVmIds: checkpoint.oldVmIds,
        ownerPlanSha256ByNode: checkpoint.ownerPlanSha256ByNode,
        retainedNics: checkpoint.retainedNics,
        siteUid: checkpoint.siteUid,
        siteConfigurationSha256: checkpoint.siteConfigurationSha256,
      },
      { oldVmIds, ownerPlanSha256ByNode, retainedNics, ...site },
    ),
    'checkpoint full binding projection differs',
  );
  const records = new Map();
  for (const suffix of ['quiesce-plan', 'launch-plan', 'replacement-final-plan']) {
    const name = `${plan.planId}-terraform-${suffix}.json`;
    records.set(name, await read(name));
  }
  validateAzureTerraformReplacementStageHistory(plan, checkpoint, snapshot, records, binding.providerLockSha256);
  const stageRecords = {
    quiesce: records.get(`${plan.planId}-terraform-quiesce-plan.json`),
    launch: records.get(`${plan.planId}-terraform-launch-plan.json`),
  };
  const finish = async () => {
    for (let pass = 0; pass < 2; pass++) {
      for (const [digest, expected] of sources)
        require23(
          canonicalSha256(await bounded(() => loadSource.call(loaders, digest))) === expected,
          'predecessor plan changed during completion',
        );
      for (const { plan: source, sha256 } of outcomes.values())
        require23(
          canonicalSha256(await bounded(() => loadOutcome.call(loaders, structuredClone(source)))) === sha256,
          'predecessor outcome changed during completion',
        );
      await verify();
      for (const [name, expected] of observed)
        require23(
          canonicalSha256(await bounded(() => store.read(name))) === expected,
          'private completion history changed',
        );
    }
    unchanged();
    deadline.throwIfAborted();
  };
  const qualify = async (packet, mode) => {
    let result;
    try {
      result = await bounded(() =>
        completed(structuredClone(packet.receipt), structuredClone(packet.identity), mode, deadline),
      );
    } catch {
      deadline.throwIfAborted();
      await finish();
      unchanged();
      throw new AzureTerraformNetworkReplacementCompletionUnavailable('Completion operational provenance unavailable');
    }
    require23(same16(verification(result), verification(packet.verification)), 'operational provenance changed');
    unchanged();
  };
  return {
    plan,
    owner,
    site,
    binding,
    checkpoint,
    material,
    stageRecords,
    journalSha256,
    sourceBindingSha256,
    read,
    bounded,
    finish,
    qualify,
    unchanged,
    deadline,
    readonly,
    latestFinal: records.get(`${plan.planId}-terraform-replacement-final-plan.json`),
  };
}
function validateAzureTerraformNetworkReplacementCompletion(c, value) {
  keys6(value, [
    'schemaVersion',
    'kind',
    'engine',
    'owner',
    'planSha256',
    'originalPlanSha256',
    'retainedPlanSha256',
    'journalSha256',
    'sourceBindingSha256',
    'checkpointSha256',
    'sourceConfigurationSha256',
    'providerLockSha256',
    'finalConfigurationSha256',
    'selectedNode',
    'newVmId',
    'stageRecordSha256',
    'stageApplications',
    'finalReceipt',
    'operational',
  ]);
  const row = value,
    { plan, binding, checkpoint, material } = c;
  require23(
    row.schemaVersion === 1 &&
      row.kind === 'azure-terraform-network-replacement-completion' &&
      row.engine === 'terraform' &&
      same16(row.owner, c.owner) &&
      row.planSha256 === plan.planSha256 &&
      row.originalPlanSha256 === binding.originalPlanSha256 &&
      row.retainedPlanSha256 === binding.retainedPlanSha256 &&
      row.journalSha256 === c.journalSha256 &&
      row.sourceBindingSha256 === c.sourceBindingSha256 &&
      row.checkpointSha256 === canonicalSha256({ ...checkpoint, phase: 'complete' }) &&
      row.sourceConfigurationSha256 === binding.sourceConfigurationSha256 &&
      row.providerLockSha256 === binding.providerLockSha256 &&
      row.finalConfigurationSha256 === material.stages.launch.configurationSha256 &&
      row.selectedNode === checkpoint.node &&
      row.newVmId === checkpoint.newVmId,
    'immutable completion identity differs',
  );
  keys6(row.stageRecordSha256, ['quiesce', 'launch']);
  keys6(row.stageApplications, ['quiesce', 'launch']);
  for (const phase of ['quiesce', 'launch']) {
    require23(
      row.stageRecordSha256[phase] === canonicalSha256(c.stageRecords[phase]) &&
        row.stageApplications[phase] === (c.stageRecords[phase].receipt.noChanges ? 'no-change' : 'applied'),
      'original consumed stage proof differs',
    );
  }
  validateAzureTerraformReplacementStageReceipt(
    plan,
    material.stages.launch,
    row.finalReceipt,
    binding.providerLockSha256,
  );
  require23(
    row.finalReceipt.noChanges && row.finalReceipt.changes.every((v) => v.actions.join(',') === 'no-op'),
    'original final no-change receipt required',
  );
  keys6(row.operational, ['identity', 'receipt', 'receiptSha256', 'verification']);
  require23(
    row.operational.receipt !== undefined &&
      row.operational.receipt !== null &&
      row.operational.receiptSha256 === canonicalSha256(row.operational.receipt),
    'private operational receipt digest differs',
  );
  verification(row.operational.verification);
  const identity = row.operational.identity;
  keys6(identity, [
    'owner',
    'planSha256',
    'journalSha256',
    'sourceBindingSha256',
    'configurationSha256',
    'site',
    'phase',
    'nodes',
  ]);
  const { nodes: _nodes, ...identityBinding } = identity;
  require23(
    same16(identityBinding, {
      owner: c.owner,
      planSha256: plan.planSha256,
      journalSha256: c.journalSha256,
      sourceBindingSha256: c.sourceBindingSha256,
      configurationSha256: row.finalConfigurationSha256,
      site: c.site,
      phase: 'launched',
    }),
    'operational identity differs',
  );
  keys6(identity.nodes, Object.keys(binding.before.nodes));
  for (const [node, vm] of Object.entries(binding.before.nodes)) {
    const current = identity.nodes[node];
    keys6(current, ['resourceId', 'vmId', 'vmState', 'ownerPlanSha256', 'nics']);
    const selected = Number(node) === row.selectedNode;
    require23(
      current.resourceId === vm.resourceId &&
        current.vmState === 'present' &&
        lower6(current.vmId) === lower6(selected ? row.newVmId : vm.vmId) &&
        current.ownerPlanSha256 === (selected ? plan.planSha256 : vm.ownerPlanSha256),
      'complete VM generation differs',
    );
    keys6(current.nics, Object.keys(vm.nics));
    for (const [index, nic] of Object.entries(vm.nics))
      require23(
        same16(current.nics[index], {
          ...nic,
          attachment: vm.resourceId,
        }),
        'full retained NIC/IP-configuration/subnet differs',
      );
  }
  return structuredClone(row);
}
async function publishAzureTerraformNetworkReplacementCompletion(
  request,
  store,
  session,
  dependencies,
  current,
  final,
  signal,
) {
  const c = await openAzureTerraformNetworkReplacementCompletionArtifacts(request, store, dependencies, signal),
    name = azureTerraformNetworkReplacementCompletionName(c.plan);
  let existing;
  try {
    existing = await c.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const {
    readPlanApplicationHistory: readHistory,
    readPlanApplicationState: readCurrentState,
    readConfigurationSha256: readConfiguration,
    readConfiguration: readSource,
  } = session;
  require23(
    typeof readHistory === 'function' &&
      typeof readCurrentState === 'function' &&
      typeof readConfiguration === 'function' &&
      typeof readSource === 'function',
    'owning native current and historical receipt readers required',
  );
  const readersUnchanged = () => {
    require23(
      session.readPlanApplicationHistory === readHistory &&
        session.readPlanApplicationState === readCurrentState &&
        session.readConfigurationSha256 === readConfiguration &&
        session.readConfiguration === readSource,
      'owning native receipt reader changed',
    );
    c.unchanged();
  };
  const deployment = await c.bounded(() => azureTerraformCurrentDeployment(c.plan));
  const { configuration: _source, providerLock, ...identity } = deployment;
  const manifestOf = (configurationSha256) =>
    canonicalSha256({
      ...identity,
      configurationSha256,
      providerLockSha256: createHash14('sha256').update(providerLock).digest('hex'),
    });
  const histories = new Map();
  const verifySession = async () => {
    readersUnchanged();
    require23(
      (await c.bounded(() => readConfiguration.call(session))) === c.material.stages.launch.configurationSha256 &&
        (await c.bounded(() => readSource.call(session, c.material.stages.launch.configurationSha256))) ===
          c.material.stages.launch.configuration,
      'owning final private configuration differs',
    );
    readersUnchanged();
    for (const phase of ['quiesce', 'launch']) {
      const receipt = structuredClone(c.stageRecords[phase].receipt),
        expectedReceiptSha256 = canonicalSha256(receipt),
        history = await c.bounded(() => readHistory.call(session, receipt, c.deadline));
      readersUnchanged();
      keys6(history, [
        'schemaVersion',
        'scope',
        'receiptSha256',
        'manifestSha256',
        'matches',
        'incompleteArchives',
        'applicationOutcomeQualified',
        'retirementQualified',
      ]);
      require23(
        history.schemaVersion === 1 &&
          history.scope === 'exact-saved-plan-journal-history' &&
          canonicalSha256(receipt) === expectedReceiptSha256 &&
          history.receiptSha256 === expectedReceiptSha256 &&
          history.manifestSha256 === manifestOf(c.material.stages.launch.configurationSha256) &&
          history.incompleteArchives === 0 &&
          history.applicationOutcomeQualified === false &&
          history.retirementQualified === false &&
          Array.isArray(history.matches) &&
          history.matches.length > 0,
        'complete exact native historical stage receipt required',
      );
      const occurrences = new Set();
      for (const match of history.matches) {
        keys6(match, [
          'location',
          'archiveSha256',
          'state',
          'journalSha256',
          'savedPlanSha256',
          'configurationSha256',
          'manifestSha256',
        ]);
        const occurrence = `${match.location}:${match.archiveSha256}`;
        require23(
          ['current', 'revision', 'plan-history'].includes(match.location) &&
            sha7(match.archiveSha256) &&
            sha7(match.journalSha256) &&
            !occurrences.has(occurrence) &&
            match.savedPlanSha256 === receipt.planSha256 &&
            match.configurationSha256 === receipt.configurationSha256 &&
            match.manifestSha256 === manifestOf(receipt.configurationSha256) &&
            (receipt.noChanges ? ['planned', 'applied'].includes(match.state) : match.state === 'applied'),
          'exact consumed historical application state required',
        );
        occurrences.add(occurrence);
      }
      const digest = canonicalSha256(history),
        prior = histories.get(phase);
      require23(prior === undefined || prior === digest, 'native historical stage changed across callbacks');
      histories.set(phase, digest);
    }
    require23(
      same16(final, c.latestFinal) &&
        ['planned', 'applied'].includes(await c.bounded(() => readCurrentState.call(session, final))),
      'exact current final no-change receipt required',
    );
    readersUnchanged();
  };
  await verifySession();
  const qualify = async (operational, mode) => {
    try {
      await c.qualify(operational, mode);
    } catch (error) {
      await verifySession();
      await c.finish();
      throw error;
    }
  };
  let packet;
  if (existing !== undefined) {
    packet = validateAzureTerraformNetworkReplacementCompletion(c, existing);
    await qualify(packet.operational, 'historical');
  } else {
    require23(
      c.checkpoint.phase === 'launched',
      'ordinary complete checkpoint cannot reconstruct missing immutable completion',
    );
    require23(same16(final, c.latestFinal), 'original saved final receipt differs from owning executor');
    const row = {
      schemaVersion: 1,
      kind: 'azure-terraform-network-replacement-completion',
      engine: 'terraform',
      owner: structuredClone(c.owner),
      planSha256: c.plan.planSha256,
      originalPlanSha256: c.binding.originalPlanSha256,
      retainedPlanSha256: c.binding.retainedPlanSha256,
      journalSha256: c.journalSha256,
      sourceBindingSha256: c.sourceBindingSha256,
      checkpointSha256: canonicalSha256({ ...c.checkpoint, phase: 'complete' }),
      sourceConfigurationSha256: c.binding.sourceConfigurationSha256,
      providerLockSha256: c.binding.providerLockSha256,
      finalConfigurationSha256: c.material.stages.launch.configurationSha256,
      selectedNode: c.checkpoint.node,
      newVmId: c.checkpoint.newVmId,
      stageRecordSha256: {
        quiesce: canonicalSha256(c.stageRecords.quiesce),
        launch: canonicalSha256(c.stageRecords.launch),
      },
      stageApplications: {
        quiesce: c.stageRecords.quiesce.receipt.noChanges ? 'no-change' : 'applied',
        launch: c.stageRecords.launch.receipt.noChanges ? 'no-change' : 'applied',
      },
      finalReceipt: structuredClone(final),
      operational: { ...structuredClone(current), receiptSha256: canonicalSha256(current.receipt) },
    };
    packet = validateAzureTerraformNetworkReplacementCompletion(c, row);
    await qualify(packet.operational, 'current');
  }
  await verifySession();
  await c.finish();
  await verifySession();
  await c.finish();
  const expected = canonicalSha256(packet);
  if (existing === undefined) {
    try {
      const later = await c.bounded(() => store.read(name));
      require23(canonicalSha256(later) === expected, 'late foreign immutable completion must be preserved');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      c.unchanged();
      await c.bounded(() => store.write(name, packet));
    }
  }
  require23(
    canonicalSha256(await c.bounded(() => store.read(name))) === expected,
    'completion changed during publication',
  );
  await c.finish();
  require23(
    canonicalSha256(await c.bounded(() => store.read(name))) === expected,
    'completion changed after provenance callbacks',
  );
  await verifySession();
  await c.finish();
  await verifySession();
  c.unchanged();
  c.deadline.throwIfAborted();
  return { completionSha256: expected, checkpointSha256: packet.checkpointSha256 };
}

// plugins/azure/src/ce/terraform-network-replacement-completion-history.ts
async function readAzureTerraformNetworkReplacementCompletionHistory(
  request,
  store,
  dependencies,
  expectedCompletionSha256,
  signal,
) {
  if (!/^[a-f0-9]{64}$/.test(expectedCompletionSha256))
    throw Error('Resolved immutable replacement completion digest required');
  const c = await openAzureTerraformNetworkReplacementCompletionArtifacts(request, store, dependencies, signal);
  if (c.checkpoint.phase !== 'complete') throw Error('Replacement predecessor has no completed owning checkpoint');
  const raw = await c.read(azureTerraformNetworkReplacementCompletionName(c.plan));
  if (canonicalSha256(raw) !== expectedCompletionSha256)
    throw Error('Immutable replacement completion differs from expected digest');
  const packet = validateAzureTerraformNetworkReplacementCompletion(c, raw);
  await c.qualify(packet.operational, 'historical');
  await c.finish();
  if (
    canonicalSha256(await c.read(azureTerraformNetworkReplacementCompletionName(c.plan))) !== expectedCompletionSha256
  )
    throw Error('Immutable replacement completion changed at final boundary');
  c.unchanged();
  c.deadline.throwIfAborted();
  return {
    schemaVersion: 1,
    kind: 'azure-terraform-network-replacement-completion-history',
    engine: 'terraform',
    owner: structuredClone(c.owner),
    sourcePlanSha256: c.plan.planSha256,
    originalPlanSha256: packet.originalPlanSha256,
    retainedPlanSha256: packet.retainedPlanSha256,
    sourceBindingSha256: c.sourceBindingSha256,
    journalSha256: c.journalSha256,
    completionSha256: expectedCompletionSha256,
    checkpointSha256: packet.checkpointSha256,
    finalConfigurationSha256: packet.finalConfigurationSha256,
    providerLockSha256: packet.providerLockSha256,
    site: structuredClone(c.site),
    nodes: structuredClone(packet.operational.identity.nodes),
    finalSource: c.material.stages.launch.configuration,
    currentOperationalAcceptanceQualified: false,
  };
}

// plugins/azure/src/ce/terraform-network-update-source.ts
import { createHash as createHash15 } from 'node:crypto';

// plugins/azure/src/ce/terraform-replacement-generations.ts
var require24 = (condition, message) => {
  if (!condition) throw Error(`Azure Terraform generation provenance: ${message}`);
};
var same17 = canonicalEqual;
var scope = (plan) => {
  const { operation: _operation, replacementNode: _node, ...intent } = plan.intent;
  const { termsAccepted: _terms, ...image } = plan.image;
  return {
    intent,
    image,
    subscription: plan.subscription,
    topology: plan.topology,
    nics: plan.nics,
    vm: plan.vm,
    routing: plan.routing,
    egress: plan.egress,
    workloadProfile: plan.workloadProfile ?? null,
  };
};
function verifyAzureTerraformReplacementGenerationOwners(plan, current, original, sources, checkpoints) {
  verifyAzureCePlan(plan);
  verifyAzureCePlan(original);
  require24(
    plan.engine === 'terraform' &&
      !plan.relayProfile &&
      plan.intent.operation === 'replace-node' &&
      original.engine === 'terraform' &&
      !original.relayProfile &&
      original.intent.operation === 'deploy' &&
      same17(azureUpgradeBinding(plan), azureUpgradeBinding(original)) &&
      same17(scope(plan), scope(original)) &&
      same17(sources.get(original.planSha256), original),
    'exact original creation differs',
  );
  const nodes = azureUpgradeBinding(original).nodes;
  const boundaries = new Map();
  const validateInventory = (state) => {
    require24(
      same17(Object.keys(state.oldVmIds).sort(), nodes.toSorted()) &&
        same17(Object.keys(state.ownerPlanSha256ByNode).sort(), nodes.toSorted()) &&
        Object.values(state.oldVmIds).every((id) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) &&
        new Set(Object.values(state.oldVmIds).map((id) => id.toLowerCase())).size === nodes.length &&
        validAzureRetainedNicsForSource(original, state.retainedNics) &&
        same17(state.retainedNics, current.retainedNics) &&
        state.siteUid === current.siteUid &&
        state.siteConfigurationSha256 === current.siteConfigurationSha256,
      'complete original interface, logical site or UUID inventory differs',
    );
  };
  validateInventory(current);
  const visit = (owner, node, vmId, path) => {
    require24(!path.has(owner), 'recursive generation owner');
    const boundary = `${owner}:${node}`;
    const normalized = vmId.toLowerCase();
    require24(
      !boundaries.has(boundary) || boundaries.get(boundary) === normalized,
      'survivor UUID differs across generation boundaries',
    );
    boundaries.set(boundary, normalized);
    const source = sources.get(owner);
    require24(source, 'generation source is unresolved');
    verifyAzureCePlan(source);
    require24(
      source?.planSha256 === owner &&
        source.engine === 'terraform' &&
        !source.relayProfile &&
        same17(azureUpgradeBinding(source), azureUpgradeBinding(original)) &&
        same17(scope(source), scope(original)),
      'generation source scope differs',
    );
    if (owner === original.planSha256) return;
    require24(
      source?.intent.operation === 'replace-node' && source.intent.replacementNode === nodes.indexOf(node) + 1,
      'generation owns a different selected node',
    );
    const prior = validateAzureTerraformReplacementCheckpoint(source, checkpoints.get(owner));
    require24(
      prior.phase === 'complete' && prior.newVmId?.toLowerCase() === normalized,
      'predecessor completion or selected UUID differs',
    );
    validateInventory(prior);
    const next = new Set([...path, owner]);
    for (const retainedNode of nodes)
      visit(prior.ownerPlanSha256ByNode[retainedNode], retainedNode, prior.oldVmIds[retainedNode], next);
  };
  for (const node of nodes)
    visit(current.ownerPlanSha256ByNode[node], node, current.oldVmIds[node], new Set([plan.planSha256]));
}

// plugins/azure/src/ce/terraform-replacement-artifact-provenance.ts
var require25 = (condition, message) => {
  if (!condition) throw Error(`Azure Terraform replacement artifact provenance: ${message}`);
};
var object21 = (value) => {
  require25(value && typeof value === 'object' && !Array.isArray(value), 'malformed record');
  return value;
};
var same18 = canonicalEqual;
var lower7 = (value) => (typeof value === 'string' ? value.toLowerCase() : '');
var uuid3 = (value) => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
var exact = (value, expected) =>
  require25(Object.keys(value).sort().join(',') === expected.toSorted().join(','), 'record fields differ');
var collectedAt = (value) =>
  require25(
    typeof value === 'string' && Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now(),
    'collection timestamp differs',
  );
function isAzureTerraformReplacementHistoricalArtifact(name) {
  return (
    /^azure-ce-[a-f0-9]{24}-terraform-(?:replacement(?:-plan|-source|-registration|-final-plan)?|quiesce-(?:plan|recovery)|launch-(?:plan|recovery))\.json$/.test(
      name,
    ) || isAzureRelayReplacementHistoricalArtifact(name)
  );
}
function verifyRecovery(plan, checkpoint, phase, value) {
  const record = object21(value);
  exact(record, ['currentVmIds', 'expectedInterfaces', 'observedAt']);
  collectedAt(record.observedAt);
  const selected = `${plan.deploymentName}-${checkpoint.node}`;
  const instances = object21(record.currentVmIds);
  const nodes = Object.keys(checkpoint.oldVmIds).filter((node) => phase !== 'quiesce' || node !== selected);
  require25(same18(Object.keys(instances).sort(), nodes.sort()), 'recovery node inventory differs');
  for (const node of nodes) {
    const id = instances[node];
    require25(
      uuid3(id) &&
        (node === selected
          ? !Object.values(checkpoint.oldVmIds).some((old) => lower7(old) === lower7(id)) &&
            (checkpoint.newVmId === undefined || lower7(id) === lower7(checkpoint.newVmId))
          : lower7(id) === lower7(checkpoint.oldVmIds[node])),
      'recovery VM identity differs',
    );
  }
  const expected = Array.from({ length: plan.topology.nodeCount }, (_, index) =>
    plan.nics
      .filter((nic) => ['slo', 'data', 'sli'].includes(nic.role))
      .map((nic) => ({
        node: `${plan.deploymentName}-${index + 1}`,
        role: nic.role,
        mac: checkpoint.retainedNics[`${index + 1}:${nic.index}`].mac,
      })),
  ).flat();
  require25(same18(record.expectedInterfaces, expected), 'recovery retained interface inventory differs');
}
function nonRelayScope(plan) {
  const { operation: _operation, replacementNode: _node, ...intent } = plan.intent;
  const { termsAccepted: _terms, ...image } = plan.image;
  return {
    intent,
    image,
    subscription: plan.subscription,
    topology: plan.topology,
    nics: plan.nics,
    vm: plan.vm,
    routing: plan.routing,
    egress: plan.egress,
    workloadProfile: plan.workloadProfile ?? null,
  };
}
function verifyAzureTerraformNonRelayConfiguration(base, checkpoint, configuration) {
  require25(
    base.intent.operation === 'deploy' &&
      !base.relayProfile &&
      validAzureRetainedNicsForSource(base, checkpoint.retainedNics),
    'original retained non-relay NIC graph differs',
  );
  const instances = object21(object21(configuration.resource).azurerm_linux_virtual_machine);
  const bootstrap = {};
  for (let index = 1; index <= base.topology.nodeCount; index++) {
    const encoded = object21(instances[`node_${index}`]).custom_data;
    require25(
      typeof encoded === 'string' && Buffer.from(encoded, 'base64').toString('base64') === encoded,
      'retained bootstrap encoding differs',
    );
    bootstrap[String(index)] = Buffer.from(encoded, 'base64').toString('utf8');
  }
  const expected = object21(JSON.parse(renderAzureTerraformFoundation(base, bootstrap)));
  const expectedVms = object21(object21(expected.resource).azurerm_linux_virtual_machine);
  for (let index = 1; index <= base.topology.nodeCount; index++)
    object21(object21(expectedVms[`node_${index}`]).tags)['xcsh-plan-sha256'] =
      checkpoint.ownerPlanSha256ByNode[`${base.deploymentName}-${index}`];
  require25(same18(configuration, expected), 'retained non-relay configuration graph differs');
}
function verifyAzureTerraformReplacementHistoricalArtifacts(base, sites, records, providerLockSha256) {
  const generations = new Map();
  for (const [name, value] of records) {
    if (!isAzureTerraformReplacementHistoricalArtifact(name)) continue;
    const id = /^(azure-ce-[a-f0-9]{24})-/.exec(name)?.[1];
    require25(id, 'generation filename differs');
    if (!generations.has(String(id))) generations.set(String(id), new Map());
    generations.get(String(id))?.set(name, value);
  }
  if (!generations.size) return;
  verifyAzureCePlan(base);
  const ownedSites = sites.filter((site) => site.siteName === base.siteName);
  require25(base.engine === 'terraform' && ownedSites.length === 1, 'owning engine or logical site differs');
  const site = ownedSites[0];
  const sources = new Map([[base.planSha256, base]]);
  for (const [id, history] of generations) {
    const source = object21(history.get(`${id}-terraform-replacement-plan.json`));
    verifyAzureCePlan(source);
    require25(
      source.planId === id &&
        source.engine === 'terraform' &&
        source.intent.operation === 'replace-node' &&
        same18(azureUpgradeBinding(source), azureUpgradeBinding(base)) &&
        (source.relayProfile
          ? source.relayProfile.schemaVersion === 2 &&
            same18(azureRelayResourceSource(source), azureRelayResourceSource(base))
          : !base.relayProfile && same18(nonRelayScope(source), nonRelayScope(base))),
      'generation or original resource owner differs',
    );
    require25(!sources.has(source.planSha256), 'duplicate generation source');
    sources.set(source.planSha256, source);
  }
  const checkpoints = new Map();
  for (const [id, history] of generations) {
    const source = sources.get(history.get(`${id}-terraform-replacement-plan.json`).planSha256);
    const value = history.get(`${id}-terraform-replacement.json`);
    const snapshot = history.get(`${id}-terraform-replacement-source.json`);
    if (value !== undefined || snapshot !== undefined)
      checkpoints.set(
        source.planSha256,
        validateAzureTerraformReplacementCheckpoint(
          source,
          value === undefined ? object21(snapshot).preparedCheckpoint : value,
        ),
      );
  }
  const tokens = new Map();
  for (const token of site.tokens) {
    require25(
      azureUpgradeBinding(base).nodes.includes(token.node) &&
        /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(token.name) &&
        !tokens.has(token.name),
      'token inventory differs',
    );
    tokens.set(token.name, token);
  }
  const bind = (source, index, material) => {
    const name = `${source.deploymentName.slice(0, 40)}-${index}-${source.planSha256.slice(0, 12)}`;
    const node = `${source.deploymentName}-${index}`;
    const token = tokens.get(name);
    const record = records.get(`${name}.json`);
    if (material === undefined && record === undefined) return;
    const value = object21(record);
    exact(value, ['jwt', 'node', 'siteName', 'tokenName']);
    require25(
      token?.node === node &&
        value.node === node &&
        value.tokenName === name &&
        value.siteName === site.siteName &&
        typeof value.jwt === 'string' &&
        /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.jwt),
      'bootstrap token binding differs',
    );
    if (material !== undefined) bindAwsCloudInit({ cloud_init_config: material }, value.jwt);
  };
  for (const [id, history] of generations) {
    const source = object21(history.get(`${id}-terraform-replacement-plan.json`));
    const checkpointValue = history.get(`${id}-terraform-replacement.json`);
    const snapshotValue = history.get(`${id}-terraform-replacement-source.json`);
    if (checkpointValue === undefined && snapshotValue === undefined) {
      require25(
        history.size === 1 && history.has(azureTerraformReplacementPlanName(source)),
        'orphan generation execution history',
      );
      bind(source, source.intent.replacementNode);
      continue;
    }
    const snapshot = object21(snapshotValue);
    const checkpoint = validateAzureTerraformReplacementCheckpoint(
      source,
      checkpointValue === undefined ? snapshot.preparedCheckpoint : checkpointValue,
    );
    require25(checkpoint.siteUid === site.siteUid, 'logical site UID differs');
    if (checkpointValue === undefined)
      require25(history.size === 2 && checkpoint.phase === 'prepared', 'orphan stage without initial checkpoint');
    const material = validateAzureTerraformReplacementSource(source, checkpoint, snapshot);
    validateAzureTerraformReplacementStageHistory(source, checkpoint, snapshot, history, providerLockSha256);
    bind(source, checkpoint.node, material.bootstrap);
    const configuration = object21(JSON.parse(material.source));
    if (!source.relayProfile) {
      verifyAzureTerraformNonRelayConfiguration(base, checkpoint, configuration);
      verifyAzureTerraformReplacementGenerationOwners(source, checkpoint, base, sources, checkpoints);
    }
    const instances = object21(object21(configuration.resource).azurerm_linux_virtual_machine);
    for (let index = 1; index <= source.topology.nodeCount; index++) {
      const owner = sources.get(checkpoint.ownerPlanSha256ByNode[`${source.deploymentName}-${index}`]);
      require25(
        owner && (owner.intent.operation === 'deploy' || owner.intent.replacementNode === index),
        'retained bootstrap generation source is unresolved',
      );
      const encoded = object21(instances[`node_${index}`]).custom_data;
      require25(typeof encoded === 'string', 'retained bootstrap is unavailable');
      bind(owner, index, Buffer.from(encoded, 'base64').toString('utf8'));
    }
    const predecessor =
      source.relayProfile?.schemaVersion === 2 ? source.relayProfile.retainedDeploymentPlan : undefined;
    if (predecessor?.relayProfile?.schemaVersion === 2) {
      const previous = generations.get(predecessor.planId);
      require25(
        previous && same18(previous.get(azureTerraformReplacementPlanName(predecessor)), predecessor),
        'predecessor generation execution history is unavailable',
      );
      const previousCheckpoint = validateAzureTerraformReplacementCheckpoint(
        predecessor,
        previous?.get(`${predecessor.planId}-terraform-replacement.json`),
      );
      require25(previousCheckpoint.phase === 'complete', 'predecessor execution is incomplete');
      const relay = new Map();
      for (const name of azureRelayHistoricalArtifacts)
        relay.set(name, previous?.get(`${predecessor.planId}-replacement-${name}`));
      requireAzureRelayHistoricalAcceptance(predecessor, site.siteUid, relay);
    }
    for (const phase of ['quiesce', 'launch']) {
      const recovery = history.get(`${id}-terraform-${phase}-recovery.json`);
      if (recovery !== undefined) {
        require25(history.has(`${id}-terraform-${phase}-plan.json`), 'recovery stage plan is unavailable');
        verifyRecovery(source, checkpoint, phase, recovery);
      }
    }
    const registrationValue = history.get(`${id}-terraform-replacement-registration.json`);
    if (registrationValue !== undefined) {
      const registration = object21(registrationValue);
      exact(registration, ['action', 'instanceId', 'node', 'registration', 'siteName', 'state']);
      const selected = `${source.deploymentName}-${checkpoint.node}`;
      require25(
        ['launched', 'complete'].includes(checkpoint.phase) &&
          registration.action === 'approve-registration' &&
          ['requested', 'submitted'].includes(String(registration.state)) &&
          registration.siteName === site.siteName &&
          typeof registration.registration === 'string' &&
          /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(registration.registration) &&
          typeof registration.node === 'string' &&
          Object.hasOwn(checkpoint.oldVmIds, registration.node) &&
          lower7(registration.instanceId) ===
            lower7(registration.node === selected ? checkpoint.newVmId : checkpoint.oldVmIds[registration.node]),
        'registration request identity differs',
      );
    }
    if (checkpoint.phase === 'complete' && source.relayProfile) {
      const relay = new Map();
      for (const name of azureRelayHistoricalArtifacts) relay.set(name, history.get(`${id}-replacement-${name}`));
      requireAzureRelayHistoricalAcceptance(source, site.siteUid, relay);
    }
  }
  if (base.relayProfile) verifyAzureRelayReplacementHistories(base, site.siteUid, records, sources);
  else
    require25(
      !Array.from(records.keys()).some(isAzureRelayReplacementHistoricalArtifact),
      'relay journal on non-relay source',
    );
}

// plugins/azure/src/ce/terraform-network-update-source.ts
var hash7 = (value) => createHash15('sha256').update(value).digest('hex');
var same19 = canonicalEqual;
var lower8 = (value) => (typeof value === 'string' ? value.toLowerCase() : '');
function require26(value, message) {
  if (!value) throw Error(`Azure Terraform network source: ${message}`);
}
var object22 = (value) => {
  require26(value && typeof value === 'object' && !Array.isArray(value), 'malformed record');
  return value;
};
var keys7 = (value, expected) => same19(Object.keys(object22(value)).sort(), expected.toSorted());
var scope2 = (plan, allowSubnet) => {
  const { operation: _operation, replacementNode: _node, nics, ...intent } = plan.intent;
  const { termsAccepted: _terms, ...image } = plan.image;
  const nic = (value) => {
    const { subnet: _subnet, ...rest } = value;
    return allowSubnet ? rest : value;
  };
  return {
    intent: { ...intent, nics: nics.map((n) => nic(n)) },
    image,
    subscription: plan.subscription,
    topology: plan.topology,
    nics: plan.nics.map((n) => nic(n)),
    vm: plan.vm,
    routing: plan.routing,
    egress: plan.egress,
    workloadProfile: plan.workloadProfile ?? null,
  };
};
function verifyAzureTerraformNetworkUpdateState(plan, inventory, outputs) {
  validateAzureNetworkUpdateInventory(plan, inventory);
  verifyAzureTerraformNetworkPhysicalState(plan, inventory, outputs);
}
function verifyAzureTerraformNetworkPhysicalState(plan, inventory, outputs) {
  verifyAzureCePlan(plan);
  require26(
    plan.engine === 'terraform' &&
      keys7(inventory, ['schemaVersion', 'engine', 'planSha256', 'collectedAt', 'nodes']) &&
      inventory.schemaVersion === 1 &&
      inventory.engine === 'terraform' &&
      inventory.planSha256 === plan.planSha256 &&
      typeof inventory.collectedAt === 'string' &&
      Number.isFinite(Date.parse(inventory.collectedAt)) &&
      Date.parse(inventory.collectedAt) <= Date.now() + 60000,
    'owning Terraform inventory schema required',
  );
  const nodes = Object.keys(inventory.nodes),
    instances = object22(outputs.ce_instances),
    interfaces = object22(outputs.ce_interfaces);
  require26(
    keys7(instances, nodes) &&
      keys7(
        interfaces,
        nodes.flatMap((n) => Object.keys(inventory.nodes[n].nics).map((i) => `${n}:${i}`)),
      ),
    'complete exact Terraform output inventory required',
  );
  for (const [node, vm] of Object.entries(inventory.nodes)) {
    const instance = object22(instances[node]);
    require26(
      keys7(instance, ['id', 'vm_id', 'site_name', 'hostname']) &&
        lower8(instance.id) === lower8(vm.resourceId) &&
        lower8(instance.vm_id) === lower8(vm.vmId) &&
        instance.site_name === plan.siteName &&
        instance.hostname === `${plan.deploymentName}-${node}`,
      'Terraform VM UUID, resource or site differs',
    );
    for (const [index, nic] of Object.entries(vm.nics)) {
      const row = object22(interfaces[`${node}:${index}`]);
      require26(
        keys7(row, ['id', 'node', 'index', 'role', 'site_name', 'subnet_id']) &&
          lower8(row.id) === lower8(nic.resourceId) &&
          row.node === Number(node) &&
          row.index === Number(index) &&
          row.role === plan.nics.find((n) => n.index === Number(index))?.role &&
          row.site_name === plan.siteName &&
          lower8(row.subnet_id) === lower8(nic.subnetId),
        'Terraform NIC resource, node, role or subnet differs',
      );
    }
  }
}
async function qualifyAzureTerraformNetworkUpdateSource(
  plan,
  source,
  inventory,
  store,
  loadSource,
  loadOutcome,
  providerLockSha256,
  site,
) {
  verifyAzureCePlan(plan);
  validateAzureNetworkUpdateInventory(plan, inventory);
  require26(
    plan.engine === 'terraform' &&
      !plan.relayProfile &&
      plan.intent.operation === 'update-network' &&
      same19(store.owner, azureUpgradeBinding(plan).owner),
    'owned Terraform network intent required',
  );
  require26(
    providerLockSha256 === hash7((await azureTerraformCurrentDeployment(plan)).providerLock) &&
      /^[a-f0-9]{64}$/.test(site.siteConfigurationSha256) &&
      typeof site.siteUid === 'string' &&
      site.siteUid,
    'resolved provider lock and owned site identity required',
  );
  await store.verify();
  const workflow = object22(await store.read('terraform-workflow.json'));
  require26(
    workflow.schemaVersion === 1 &&
      workflow.engine === 'terraform' &&
      workflow.stage === 'registered' &&
      typeof workflow.planSha256 === 'string' &&
      /^[a-f0-9]{64}$/.test(workflow.planSha256),
    'completed original admission required',
  );
  const original = await loadSource(workflow.planSha256);
  verifyAzureCePlan(original);
  require26(
    original.planSha256 === workflow.planSha256 &&
      original.engine === 'terraform' &&
      !original.relayProfile &&
      original.intent.operation === 'deploy' &&
      same19(azureUpgradeBinding(original), azureUpgradeBinding(plan)) &&
      same19(scope2(original, true), scope2(plan, true)),
    'original creation scope differs beyond permitted subnet changes',
  );
  const networkProfile = plan.terraformNetworkProfile ? verifyAzureTerraformNetworkProfile(plan) : undefined;
  require26(
    !networkProfile || networkProfile.originalPlanSha256 === original.planSha256,
    'explicit original differs from completed admission',
  );
  const binding = azureUpgradeBinding(original),
    nodes = binding.nodes,
    indices = nodes.map((_, i) => String(i + 1));
  const bootstrap = object22(workflow.bootstrapByNode),
    launches = object22(workflow.launchedAtByNode);
  require26(
    keys7(bootstrap, indices) &&
      keys7(launches, indices) &&
      indices.every(
        (n) =>
          typeof bootstrap[n] === 'string' &&
          bootstrap[n].length > 0 &&
          typeof launches[n] === 'string' &&
          Number.isFinite(Date.parse(launches[n])) &&
          Date.parse(launches[n]) <= Date.now(),
      ) &&
      workflow.configurationSha256 === hash7(renderAzureTerraformFoundation(original, bootstrap)),
    'original admitted bootstrap, launch or configuration differs',
  );
  const reservation = object22(await store.read('terraform-site.json'));
  require26(
    same19(reservation.owner, binding.owner) &&
      reservation.siteName === original.siteName &&
      reservation.uid === site.siteUid &&
      typeof reservation.contractFingerprint === 'string' &&
      /^sha256:[a-f0-9]{64}$/.test(reservation.contractFingerprint),
    'original logical-site reservation differs',
  );
  const originalOutcome = await loadOutcome(original);
  const qualifyOutcome = (owner, row, cp) => {
    const configuration = object22(row.configuration);
    require26(
      same19(configuration.owner, binding.owner) &&
        configuration.siteName === original.siteName &&
        configuration.evidenceKind === 'registration-hardware-inventory' &&
        configuration.source === `/api/register/namespaces/system/registrations_by_site/${original.siteName}` &&
        Array.isArray(configuration.interfaces) &&
        configuration.interfaces.length === original.topology.nodeCount * original.nics.length,
      'complete registered hardware owner and source required',
    );
    const devices = new Set();
    for (const [index, node] of nodes.entries())
      for (const nic of original.nics) {
        const matches = configuration.interfaces
          .map(object22)
          .filter((row) => row.node === node && row.role === nic.role);
        const observed = inventory.nodes[String(index + 1)].nics[String(nic.index)];
        require26(
          matches.length === 1 &&
            lower8(matches[0].mac) === lower8(observed.mac) &&
            typeof matches[0].device === 'string' &&
            /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/.test(matches[0].device),
          'registered MAC, node, role or device differs',
        );
        const key = `${node}:${matches[0].device}`;
        require26(!devices.has(key), 'duplicate registered device');
        devices.add(key);
      }
    require26(
      row.planSha256 === owner.planSha256 &&
        row.planId === owner.planId &&
        row.engine === 'terraform' &&
        configuration.status === 'configured' &&
        configuration.siteUid === site.siteUid &&
        (cp
          ? row.status === 'complete' &&
            object22(row.health).status === 'healthy' &&
            row.replacedNode === cp.node &&
            lower8(row.oldVmId) === lower8(cp.oldVmIds[`${owner.deploymentName}-${cp.node}`]) &&
            lower8(row.newVmId) === lower8(cp.newVmId) &&
            row.siteUid === site.siteUid &&
            row.terraformNoChanges === true
          : ['registered', 'accepted'].includes(String(row.status)) &&
            object22(row.registrations).status === 'healthy') &&
        (owner.routing.mode !== 'route-server' || row.routing === 'healthy') &&
        (owner.intent.ingress?.mode !== 'platform-http' ||
          (object22(row.traffic).status === 'healthy' && row.terraformNoChanges === true)),
      'prior public execution, site or acceptance differs',
    );
  };
  qualifyOutcome(original, originalOutcome);
  const registration = object22(originalOutcome.registrations);
  require26(
    same19(registration.owner, binding.owner) &&
      registration.siteName === original.siteName &&
      Array.isArray(registration.nodes) &&
      registration.nodes.length === nodes.length,
    'complete original registered UUID inventory required',
  );
  const originalIds = new Map();
  for (const node of nodes) {
    const rows = registration.nodes.map(object22).filter((row) => row.node === node);
    require26(
      rows.length === 1 &&
        rows[0].status === 'healthy' &&
        rows[0].state === 'ONLINE' &&
        typeof rows[0].instanceId === 'string' &&
        /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(rows[0].instanceId) &&
        typeof rows[0].registration === 'string' &&
        /^r-[a-z0-9-]+$/.test(rows[0].registration),
      'original registered node UUID differs',
    );
    originalIds.set(node, rows[0].instanceId);
  }
  require26(new Set([...originalIds.values()].map(lower8)).size === nodes.length, 'duplicate original UUID');
  const retainedNics = Object.fromEntries(
    Object.entries(inventory.nodes).flatMap(([node, vm]) =>
      Object.entries(vm.nics).map(([index, nic]) => [
        `${node}:${index}`,
        {
          resourceId: nic.resourceId,
          subnetId: nic.subnetId,
          mac: nic.mac,
          privateIp: nic.privateIp,
          ownerPlanSha256: nic.ownerPlanSha256,
        },
      ]),
    ),
  );
  require26(validAzureRetainedNicsForSource(original, retainedNics), 'original retained NIC/subnet identity differs');
  const current = {
    oldVmIds: Object.fromEntries(
      Object.entries(inventory.nodes).map(([n, vm]) => [`${plan.deploymentName}-${n}`, vm.vmId]),
    ),
    ownerPlanSha256ByNode: Object.fromEntries(
      Object.entries(inventory.nodes).map(([n, vm]) => [`${plan.deploymentName}-${n}`, vm.ownerPlanSha256]),
    ),
    retainedNics,
    ...site,
  };
  const sources = new Map([[original.planSha256, original]]),
    checkpoints = new Map();
  const materials = new Map(Object.entries(bootstrap).map(([n, b]) => [`${original.planSha256}:${n}`, b]));
  const seen = new Set();
  const load = async (digest, path) => {
    require26(
      /^[a-f0-9]{64}$/.test(digest) && !path.has(digest) && digest !== plan.planSha256,
      'cyclic or unresolved generation',
    );
    if (digest === original.planSha256 || seen.has(digest)) return;
    const owner = await loadSource(digest);
    verifyAzureCePlan(owner);
    require26(
      owner.planSha256 === digest &&
        owner.engine === 'terraform' &&
        !owner.relayProfile &&
        !owner.terraformNetworkReplacementProfile &&
        owner.intent.operation === 'replace-node' &&
        same19(azureUpgradeBinding(owner), binding) &&
        same19(scope2(owner, false), scope2(original, false)),
      'completed replacement source scope differs',
    );
    const cp = validateAzureTerraformReplacementCheckpoint(
      owner,
      await store.read(`${owner.planId}-terraform-replacement.json`),
    );
    require26(
      cp.phase === 'complete' &&
        cp.siteUid === site.siteUid &&
        cp.siteConfigurationSha256 === site.siteConfigurationSha256 &&
        same19(cp.retainedNics, retainedNics),
      'completed replacement identity differs',
    );
    const snapshot = object22(await store.read(`${owner.planId}-terraform-replacement-source.json`)),
      history = new Map();
    for (const suffix of ['quiesce-plan', 'launch-plan', 'replacement-final-plan']) {
      const name = `${owner.planId}-terraform-${suffix}.json`;
      history.set(name, await store.read(name));
    }
    validateAzureTerraformReplacementStageHistory(owner, cp, snapshot, history, providerLockSha256);
    qualifyOutcome(owner, await loadOutcome(owner), cp);
    sources.set(digest, owner);
    checkpoints.set(digest, cp);
    materials.set(`${digest}:${cp.node}`, snapshot.bootstrap);
    for (const prior of new Set(Object.values(cp.ownerPlanSha256ByNode))) await load(prior, new Set([...path, digest]));
    seen.add(digest);
  };
  for (const digest of new Set(Object.values(current.ownerPlanSha256ByNode))) await load(digest, new Set());
  for (const [digest, cp] of checkpoints)
    verifyAzureTerraformReplacementGenerationOwners(sources.get(digest), cp, original, sources, checkpoints);
  const boundaries = new Map();
  const visit = (owner, node, vmId, path) => {
    require26(!path.has(owner), 'recursive VM generation');
    const key = `${owner}:${node}`;
    require26(!boundaries.has(key) || boundaries.get(key) === lower8(vmId), 'inconsistent predecessor UUID');
    boundaries.set(key, lower8(vmId));
    if (owner === original.planSha256) {
      require26(
        lower8(originalIds.get(node)) === lower8(vmId),
        'original registered UUID differs from cloud generation',
      );
      return;
    }
    const cp = checkpoints.get(owner),
      prior = sources.get(owner);
    require26(
      cp && prior?.intent.replacementNode === nodes.indexOf(node) + 1 && lower8(cp.newVmId) === lower8(vmId),
      'replacement selected UUID differs',
    );
    for (const name of nodes) visit(cp.ownerPlanSha256ByNode[name], name, cp.oldVmIds[name], new Set([...path, owner]));
  };
  for (const node of nodes) visit(current.ownerPlanSha256ByNode[node], node, current.oldVmIds[node], new Set());
  if (networkProfile) {
    const retained = networkProfile.retainedPlanSha256;
    if (retained === original.planSha256) {
      require26(
        Object.values(current.ownerPlanSha256ByNode).every((owner) => owner === retained),
        'explicit creation predecessor skips completed replacements',
      );
    } else {
      const cp = checkpoints.get(retained);
      require26(cp && sources.has(retained), 'explicit predecessor requires completed owning history');
      for (const [index, node] of nodes.entries()) {
        const selected = cp.node === index + 1;
        require26(
          current.ownerPlanSha256ByNode[node] === (selected ? retained : cp.ownerPlanSha256ByNode[node]) &&
            lower8(current.oldVmIds[node]) === lower8(selected ? cp.newVmId : cp.oldVmIds[node]),
          'explicit replacement predecessor is not the final current generation',
        );
      }
    }
  }
  let configuration;
  try {
    configuration = object22(JSON.parse(source));
  } catch {
    throw Error('Azure Terraform network source: retained configuration is malformed');
  }
  verifyAzureTerraformNonRelayConfiguration(original, current, configuration);
  const vms = object22(object22(configuration.resource).azurerm_linux_virtual_machine);
  for (const [index, node] of nodes.entries())
    require26(
      Buffer.from(String(object22(vms[`node_${index + 1}`]).custom_data), 'base64').toString('utf8') ===
        materials.get(`${current.ownerPlanSha256ByNode[node]}:${index + 1}`),
      'retained bootstrap differs from completed owning generation',
    );
  return {
    schemaVersion: 1,
    engine: 'terraform',
    originalPlanSha256: original.planSha256,
    sourceConfigurationSha256: hash7(source),
    providerLockSha256,
    siteUid: site.siteUid,
    siteConfigurationSha256: site.siteConfigurationSha256,
    generationPlanSha256s: [...sources.keys()].sort(),
    originalOutcomeSha256: canonicalSha256(originalOutcome),
  };
}

// plugins/azure/src/ce/terraform-network-generation-history.ts
function azureTerraformCompletedGenerationNodes(history) {
  if (history.kind === 'azure-terraform-network-completion-history') return history.inventory.nodes;
  return Object.fromEntries(
    Object.entries(history.nodes).map(([key, vm]) => {
      require27(
        vm.vmState === 'present' && vm.vmId && vm.ownerPlanSha256,
        'completed replacement physical identity missing',
      );
      const { vmState: _state, nics, ...identity } = vm;
      return [
        key,
        {
          ...identity,
          nics: Object.fromEntries(
            Object.entries(nics).map(([index, nic]) => {
              const { attachment: _attachment, ...physical } = nic;
              return [index, physical];
            }),
          ),
        },
      ];
    }),
  );
}
function validateAzureTerraformReplacementPredecessorInventory(plan, value, history) {
  verifyAzureCePlan(plan);
  verifyAzureTerraformNetworkReplacementProfile(plan);
  require27(
    history.kind === 'azure-terraform-network-replacement-completion-history' &&
      history.sourcePlanSha256 === plan.planSha256 &&
      value &&
      same20(Object.keys(value).sort(), ['collectedAt', 'engine', 'nodes', 'planSha256', 'schemaVersion']) &&
      value.schemaVersion === 1 &&
      value.engine === 'terraform' &&
      value.planSha256 === plan.planSha256 &&
      typeof value.collectedAt === 'string' &&
      Number.isFinite(Date.parse(value.collectedAt)) &&
      Date.parse(value.collectedAt) <= Date.now() + 60000,
    'exact replacement inventory schema, generation and collection time required',
  );
  const expected = azureTerraformCompletedGenerationNodes(history);
  const normalize = (nodes) =>
    Object.fromEntries(
      Object.entries(nodes).map(([node, vm]) => [
        node,
        {
          ...vm,
          nics: Object.fromEntries(
            Object.entries(vm.nics).map(([index, nic]) => [
              index,
              nic.allocation === 'Dynamic' ? { ...nic, privateIp: null } : nic,
            ]),
          ),
        },
      ]),
    );
  require27(
    same20(normalize(value.nodes), normalize(expected)),
    'replacement predecessor full VM/NIC physical identity differs',
  );
  const addresses = new Set();
  for (const vm of Object.values(value.nodes))
    for (const nic of Object.values(vm.nics)) {
      const address = `${nic.subnetId.toLowerCase()}:${nic.privateIp}`;
      require27(
        usableAzureNetworkAddress(nic.privateIp, nic.subnetCidr) && !addresses.has(address),
        'replacement predecessor address malformed or duplicate',
      );
      addresses.add(address);
    }
  return value;
}
function azureTerraformCompletedGenerationLink(history) {
  const common = {
    planSha256: history.sourcePlanSha256,
    sourceBindingSha256: history.sourceBindingSha256,
    checkpointSha256: history.checkpointSha256,
    completionSha256: history.completionSha256,
    finalConfigurationSha256: history.finalConfigurationSha256,
  };
  return history.kind === 'azure-terraform-network-replacement-completion-history'
    ? { kind: 'node-replacement', journalSha256: history.journalSha256, ...common }
    : { kind: 'network-update', ...common };
}
function azureTerraformCompletedGenerationSite(history) {
  return history.kind === 'azure-terraform-network-completion-history'
    ? { siteUid: history.siteUid, siteConfigurationSha256: history.siteConfigurationSha256 }
    : history.site;
}
var same20 = (a, b) => (a === undefined || b === undefined ? a === b : canonicalEqual(a, b));
var hash8 = (s) => createHash16('sha256').update(s).digest('hex');
function require27(value, message) {
  if (!value) throw Error(`Azure Terraform network generations: ${message}`);
}
function qualifyAzureTerraformAdjacentNetworkSource(plan, input, previous) {
  verifyAzureCePlan(plan);
  validateAzureNetworkUpdateInventory(plan, input.inventory);
  const profile = verifyAzureTerraformNetworkProfile(plan);
  require27(
    profile.retainedPlanSha256 === previous.sourcePlanSha256 &&
      profile.originalPlanSha256 === previous.originalPlanSha256 &&
      input.source === previous.finalSource &&
      hash8(input.source) === previous.finalConfigurationSha256 &&
      input.providerLockSha256 === AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256 &&
      input.providerLockSha256 === previous.sourceQualification.providerLockSha256 &&
      same20(input.site, azureTerraformCompletedGenerationSite(previous)),
    'exact predecessor configuration, provider and owned site required',
  );
  const identities = (nodes) =>
    Object.fromEntries(
      Object.entries(nodes).map(([node, vm]) => [
        node,
        {
          ...vm,
          nics: Object.fromEntries(
            Object.entries(vm.nics).map(([index, nic]) => {
              const { targetSubnetId: _target, targetSubnetCidr: _cidr, ...identity } = nic;
              return [index, nic.allocation === 'Dynamic' ? { ...identity, privateIp: null } : identity];
            }),
          ),
        },
      ]),
    );
  require27(
    same20(identities(input.inventory.nodes), identities(azureTerraformCompletedGenerationNodes(previous))),
    'adjacent VM UUID/owner or NIC/MAC/subnet/IP-configuration identity differs',
  );
  return {
    ...structuredClone(previous.sourceQualification),
    sourceConfigurationSha256: hash8(input.source),
    generationPlanSha256s: [
      ...new Set([...previous.sourceQualification.generationPlanSha256s, previous.sourcePlanSha256]),
    ].sort(),
    networkHistory: [
      ...(previous.sourceQualification.networkHistory ?? []),
      azureTerraformCompletedGenerationLink(previous),
    ],
  };
}
async function runAzureTerraformNetworkGenerationHistory(
  sourcePlan,
  store,
  loaders,
  verifier,
  reader,
  input,
  signal,
  replacementVerifier,
) {
  signal?.throwIfAborted();
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const plan = structuredClone(sourcePlan),
    selected = input ? structuredClone(input) : undefined;
  verifyAzureCePlan(plan);
  const owner = structuredClone(azureUpgradeBinding(plan).owner);
  const { loadSource, loadOutcome } = loaders;
  const planDigest = canonicalSha256(plan),
    selectedDigest = selected ? canonicalSha256(selected) : undefined,
    ownerDigest = canonicalSha256(owner);
  const unchanged = () =>
    require27(
      canonicalSha256(store.owner) === ownerDigest &&
        loaders.loadSource === loadSource &&
        loaders.loadOutcome === loadOutcome,
      'generation dependency context changed during qualification',
    );
  const requestUnchanged = () =>
    require27(
      canonicalSha256(plan) === planDigest &&
        canonicalSha256(sourcePlan) === planDigest &&
        (selected ? canonicalSha256(selected) : undefined) === selectedDigest &&
        (input ? canonicalSha256(input) : undefined) === selectedDigest,
      'generation request changed during qualification',
    );
  requestUnchanged();
  require27(
    plan.engine === 'terraform' &&
      (plan.intent.operation === 'update-network' || plan.terraformNetworkReplacementProfile) &&
      same20(store.owner, owner),
    selected ? 'exact owning Terraform generation required' : 'exact owning completed Terraform generation required',
  );
  const bounded = async (task) => {
    deadline.throwIfAborted();
    unchanged();
    const abort = Promise.withResolvers();
    const listener = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', listener, { once: true });
    try {
      const value = await Promise.race([task(), abort.promise]);
      deadline.throwIfAborted();
      unchanged();
      return value;
    } finally {
      deadline.removeEventListener('abort', listener);
    }
  };
  await bounded(() => store.verify());
  const records = new Map(),
    sources = new Map(),
    outcomes = new Map();
  const read = async (name) => {
    const value = await bounded(() => store.read(name)),
      digest = canonicalSha256(value);
    require27(!records.has(name) || records.get(name) === digest, 'historical packet changed during qualification');
    records.set(name, digest);
    return structuredClone(value);
  };
  const readonlyStore = new Proxy(store, {
    get(target, key) {
      if (key === 'read') return read;
      if (key === 'verify') return () => bounded(() => store.verify());
      if (['write', 'remove', 'retire'].includes(String(key)))
        return () => {
          throw Error('Generation history must not mutate storage');
        };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const tracked = {
    async loadSource(digest) {
      const value = await bounded(() => loaders.loadSource(digest));
      const actual = canonicalSha256(value);
      require27(
        !sources.has(digest) || sources.get(digest) === actual,
        'predecessor source changed during qualification',
      );
      verifyAzureCePlan(value);
      require27(value.planSha256 === digest, 'loaded generation digest differs');
      sources.set(digest, actual);
      return structuredClone(value);
    },
    async loadOutcome(p) {
      const value = await bounded(() => loaders.loadOutcome(structuredClone(p))),
        digest = canonicalSha256(value);
      require27(
        !outcomes.has(p.planSha256) || outcomes.get(p.planSha256)?.digest === digest,
        'original outcome changed during qualification',
      );
      outcomes.set(p.planSha256, { plan: structuredClone(p), digest });
      return structuredClone(value);
    },
  };
  const chain = [plan],
    seen = new Set([plan.planSha256]);
  let current = plan;
  while (current.terraformNetworkProfile || current.terraformNetworkReplacementProfile) {
    const profile = current.terraformNetworkProfile
      ? verifyAzureTerraformNetworkProfile(current)
      : verifyAzureTerraformNetworkReplacementProfile(current);
    require27(chain.length <= 32, 'network generation depth exceeds bounded contract');
    const predecessor = await tracked.loadSource(profile.retainedPlanSha256);
    require27(
      !seen.has(predecessor.planSha256) &&
        predecessor.engine === 'terraform' &&
        !predecessor.relayProfile &&
        same20(azureUpgradeBinding(predecessor), azureUpgradeBinding(plan)) &&
        same20(azureTerraformNetworkScope(predecessor, true), azureTerraformNetworkScope(plan, true)),
      'cyclic or foreign predecessor scope',
    );
    seen.add(predecessor.planSha256);
    if (predecessor.terraformNetworkProfile || predecessor.terraformNetworkReplacementProfile) {
      require27(
        (predecessor.terraformNetworkProfile
          ? verifyAzureTerraformNetworkProfile(predecessor)
          : verifyAzureTerraformNetworkReplacementProfile(predecessor)
        ).originalPlanSha256 === profile.originalPlanSha256,
        'network original identity differs',
      );
      chain.unshift(predecessor);
      current = predecessor;
    } else {
      const original = await tracked.loadSource(profile.originalPlanSha256);
      require27(
        original.intent.operation === 'deploy' &&
          original.engine === 'terraform' &&
          !original.relayProfile &&
          same20(azureUpgradeBinding(original), azureUpgradeBinding(plan)) &&
          same20(azureTerraformNetworkScope(original, true), azureTerraformNetworkScope(plan, true)) &&
          (predecessor.intent.operation === 'deploy'
            ? same20(predecessor, original)
            : predecessor.intent.operation === 'replace-node' &&
              !predecessor.terraformNetworkReplacementProfile &&
              same20(azureTerraformNetworkScope(predecessor, false), azureTerraformNetworkScope(original, false))),
        'original or initial replacement scope differs',
      );
      break;
    }
  }
  let previous;
  const completedPlans = selected ? chain.slice(0, -1) : chain;
  if (completedPlans.length)
    require27(typeof verifier === 'function', 'trusted historical operational verifier required');
  for (const predecessor of completedPlans) {
    if (predecessor.terraformNetworkReplacementProfile) {
      require27(
        typeof replacementVerifier === 'function' && previous,
        'distinct trusted replacement historical verifier and completed predecessor required',
      );
      const outcome = await tracked.loadOutcome(predecessor);
      require27(
        outcome.engine === 'terraform' &&
          outcome.status === 'complete' &&
          outcome.planId === predecessor.planId &&
          outcome.planSha256 === predecessor.planSha256 &&
          outcome.replacedNode === predecessor.intent.replacementNode &&
          outcome.terraformNoChanges === true &&
          typeof outcome.networkReplacementCompletionSha256 === 'string' &&
          /^[a-f0-9]{64}$/.test(outcome.networkReplacementCompletionSha256),
        'exact owning replacement completed outcome and immutable digest required',
      );
      const checkpoint = await read(`${predecessor.planId}-terraform-replacement.json`);
      const inherited = structuredClone(previous.sourceQualification);
      const completed = await bounded(() =>
        readAzureTerraformNetworkReplacementCompletionHistory(
          predecessor,
          readonlyStore,
          {
            loaders: tracked,
            site: azureTerraformCompletedGenerationSite(previous),
            journalSha256: checkpoint.networkExecutionJournalSha256,
            sourceBindingSha256: checkpoint.networkSourceBindingSha256,
            qualifyHistorical: verifier,
            qualifyCompletedOperational: replacementVerifier,
            qualifiedPrevious: previous,
          },
          outcome.networkReplacementCompletionSha256,
          deadline,
        ),
      );
      require27(
        outcome.newVmId === completed.nodes[String(predecessor.intent.replacementNode)]?.vmId &&
          outcome.siteUid === completed.site.siteUid &&
          completed.originalPlanSha256 === previous.originalPlanSha256,
        'owning completed replacement UUID, site or original differs',
      );
      inherited.networkHistory = [...(inherited.networkHistory ?? []), azureTerraformCompletedGenerationLink(previous)];
      inherited.generationPlanSha256s = [
        ...new Set([...inherited.generationPlanSha256s, previous.sourcePlanSha256]),
      ].sort();
      previous = { ...completed, sourceQualification: inherited };
    } else previous = await bounded(() => reader(predecessor, readonlyStore, tracked, verifier, deadline, previous));
  }
  const qualification = selected
    ? previous
      ? qualifyAzureTerraformAdjacentNetworkSource(plan, selected, previous)
      : await bounded(() =>
          qualifyAzureTerraformNetworkUpdateSource(
            plan,
            selected.source,
            selected.inventory,
            readonlyStore,
            tracked.loadSource,
            tracked.loadOutcome,
            selected.providerLockSha256,
            selected.site,
          ),
        )
    : previous?.sourceQualification;
  require27(qualification, 'completed source qualification missing');
  for (const [digest, expected] of sources)
    require27(
      canonicalSha256(await bounded(() => loaders.loadSource(digest))) === expected,
      'generation source changed across chain',
    );
  for (const { plan: p, digest } of outcomes.values())
    require27(
      canonicalSha256(await bounded(() => loaders.loadOutcome(structuredClone(p)))) === digest,
      'public outcome changed across chain',
    );
  for (const [name, expected] of records)
    require27(
      canonicalSha256(await bounded(() => store.read(name))) === expected,
      'historical packet changed across chain',
    );
  await bounded(() => store.verify());
  require27(same20(store.owner, owner), 'owner changed across generation qualification');
  requestUnchanged();
  unchanged();
  deadline.throwIfAborted();
  return { qualification: structuredClone(qualification), ...(selected ? {} : { completion: previous }) };
}

// plugins/azure/src/ce/terraform-network-completion-history.ts
var hash9 = (text) => createHash17('sha256').update(text).digest('hex');
var same21 = (a, b) => canonicalEqual(a, b);
function require28(value, message) {
  if (!value) throw Error(`Azure Terraform network completion history: ${message}`);
}
function object23(value) {
  require28(value && typeof value === 'object' && !Array.isArray(value), 'malformed historical record');
  return value;
}
function keys8(value, fields) {
  require28(same21(Object.keys(object23(value)).sort(), fields.toSorted()), 'historical schema differs');
}
function verification2(value) {
  keys8(value, ['status', 'scope', 'evidenceSha256']);
  const row = value;
  require28(
    row.status === 'verified' &&
      row.scope === 'node-interfaces-routing-traffic' &&
      typeof row.evidenceSha256 === 'string' &&
      /^[a-f0-9]{64}$/.test(row.evidenceSha256),
    'historical operational provenance required',
  );
  return row;
}
async function readAzureTerraformNetworkCompletionOne(source, store, loaders, qualifyAcceptance, signal, previous) {
  signal?.throwIfAborted();
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const plan = structuredClone(source);
  verifyAzureCePlan(plan);
  require28(
    plan.engine === 'terraform' &&
      plan.intent.operation === 'update-network' &&
      same21(store.owner, azureUpgradeBinding(plan).owner) &&
      typeof qualifyAcceptance === 'function',
    'owning completed network scope required',
  );
  await store.verify();
  const observed = new Map();
  const read = async (name) => {
    deadline.throwIfAborted();
    const value = await bounded(() => store.read(name)),
      digest = canonicalSha256(value);
    require28(!observed.has(name) || observed.get(name) === digest, 'historical record changed between reads');
    observed.set(name, digest);
    return structuredClone(value);
  };
  const readonlyStore = new Proxy(store, {
    get(target, key) {
      if (key === 'read') return read;
      if (['write', 'remove', 'retire'].includes(String(key)))
        return () => {
          throw Error('Historical inspection must not mutate storage');
        };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const bounded = async (task) => {
    deadline.throwIfAborted();
    const abort = Promise.withResolvers();
    const onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([task(), abort.promise]);
      deadline.throwIfAborted();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const qualify = (receipt, identity, mode) => {
    require28(mode === 'historical', 'read-only history cannot request current acceptance');
    return bounded(() =>
      qualifyAcceptance(structuredClone(receipt), structuredClone(identity), 'historical', deadline),
    );
  };
  const sourceDigests = new Map();
  const outcomes = new Map();
  const loadSource = async (digest) => {
    const value = await bounded(() => loaders.loadSource(digest)),
      actual = canonicalSha256(value);
    require28(!sourceDigests.has(digest) || sourceDigests.get(digest) === actual, 'loaded predecessor source changed');
    sourceDigests.set(digest, actual);
    return structuredClone(value);
  };
  const loadOutcome = async (owner) => {
    const value = await bounded(() => loaders.loadOutcome(structuredClone(owner))),
      actual = canonicalSha256(value);
    require28(
      !outcomes.has(owner.planSha256) || outcomes.get(owner.planSha256)?.digest === actual,
      'loaded public outcome changed',
    );
    outcomes.set(owner.planSha256, { source: structuredClone(owner), digest: actual });
    return structuredClone(value);
  };
  const prefix = `${plan.planId}-terraform-network`;
  const binding = await read(`${prefix}-source.json`);
  keys8(binding, [
    'schemaVersion',
    'kind',
    'engine',
    'owner',
    'planSha256',
    'source',
    'sourceConfigurationSha256',
    'providerLockSha256',
    'before',
    'outputs',
    'qualification',
  ]);
  require28(
    binding.schemaVersion === 1 &&
      binding.kind === 'azure-terraform-network-original-source' &&
      binding.engine === 'terraform' &&
      same21(binding.owner, store.owner) &&
      binding.planSha256 === plan.planSha256 &&
      typeof binding.source === 'string' &&
      hash9(binding.source) === binding.sourceConfigurationSha256 &&
      binding.providerLockSha256 === AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256,
    'original source identity differs',
  );
  validateAzureNetworkUpdateInventory(plan, binding.before);
  verifyAzureTerraformNetworkUpdateState(plan, binding.before, binding.outputs);
  require28(
    binding.qualification &&
      typeof binding.qualification.siteUid === 'string' &&
      typeof binding.qualification.siteConfigurationSha256 === 'string',
    'original site qualification missing',
  );
  const original = previous
    ? qualifyAzureTerraformAdjacentNetworkSource(
        plan,
        {
          source: binding.source,
          inventory: binding.before,
          providerLockSha256: binding.providerLockSha256,
          site: {
            siteUid: binding.qualification.siteUid,
            siteConfigurationSha256: binding.qualification.siteConfigurationSha256,
          },
        },
        previous,
      )
    : await bounded(() =>
        qualifyAzureTerraformNetworkUpdateSource(
          plan,
          binding.source,
          binding.before,
          readonlyStore,
          loadSource,
          loadOutcome,
          binding.providerLockSha256,
          {
            siteUid: binding.qualification.siteUid,
            siteConfigurationSha256: binding.qualification.siteConfigurationSha256,
          },
        ),
      );
  require28(same21(binding.qualification, original), 'original source qualification changed');
  const snapshot = await AzureTerraformNetworkCheckpoint.inspect(plan, binding, readonlyStore, qualify, deadline);
  require28(
    snapshot.allNodesAccepted && snapshot.checkpoint.nodes.length === plan.topology.nodeCount,
    'complete accepted serial node history required',
  );
  let nodeSource = binding.source;
  for (const row of snapshot.checkpoint.nodes) {
    deadline.throwIfAborted();
    const stage = buildAzureTerraformNetworkPinnedNicStage(plan, nodeSource, row.before, row.node);
    const preflight = object23(await read(`${prefix}-node-${row.node}-preflight.json`));
    keys8(preflight, ['schemaVersion', 'sourceBindingSha256', 'identity', 'receipt', 'verification']);
    require28(
      preflight.schemaVersion === 1 && preflight.sourceBindingSha256 === canonicalSha256(binding),
      'original preflight source differs',
    );
    const expected = preflight.identity;
    keys8(expected, [
      'owner',
      'planSha256',
      'node',
      'siteName',
      'siteUid',
      'siteConfigurationSha256',
      'configurationSha256',
      'inventory',
    ]);
    require28(
      same21(expected.owner, store.owner) &&
        expected.planSha256 === plan.planSha256 &&
        expected.node === row.node &&
        expected.siteName === plan.siteName &&
        expected.siteUid === original.siteUid &&
        expected.siteConfigurationSha256 === original.siteConfigurationSha256 &&
        expected.configurationSha256 === stage.previousConfigurationSha256,
      'original preflight node/site/configuration differs',
    );
    const applied = Array.from({ length: row.node - 1 }, (_, i) =>
      plan.nics.map((nic) => `${i + 1}:${nic.index}`),
    ).flat();
    verifyAzureNetworkUpdateProgress(plan, binding.before, expected.inventory, applied);
    for (const [node, vm] of Object.entries(binding.before.nodes))
      for (const [index, nic] of Object.entries(vm.nics))
        if (!applied.includes(`${node}:${index}`))
          require28(
            expected.inventory.nodes[node].nics[index].privateIp === nic.privateIp,
            'unsubmitted preflight private address differs',
          );
    require28(
      same21(
        verification2(await qualify(preflight.receipt, expected, 'historical', deadline)),
        verification2(preflight.verification),
      ),
      'preflight acceptance provenance changed',
    );
    require28(row.history?.phase === 'routing-complete', 'accepted routing-complete history required');
    nodeSource = buildAzureTerraformNetworkRoutingStage(
      plan,
      nodeSource,
      row.before,
      row.history.inventory,
      row.node,
    ).releasedConfiguration;
  }
  const packet = object23(await read(`${prefix}-driver-complete.json`));
  keys8(packet, [
    'schemaVersion',
    'engine',
    'planSha256',
    'sourceBindingSha256',
    'checkpointSha256',
    'receipt',
    'inventory',
    'outputs',
    'evidenceByNode',
  ]);
  require28(
    packet.schemaVersion === 1 &&
      packet.engine === 'terraform' &&
      packet.planSha256 === plan.planSha256 &&
      packet.sourceBindingSha256 === canonicalSha256(binding) &&
      packet.checkpointSha256 === snapshot.checkpointSha256 &&
      hash9(nodeSource) === snapshot.configurationSha256,
    'immutable completion identity differs',
  );
  const row = snapshot.checkpoint.nodes.at(-1);
  require28(row, 'final selected node history missing');
  const finalStage = {
    ...buildAzureTerraformNetworkPinnedNicStage(plan, snapshot.nodeSource, row.before, row.node),
    configuration: nodeSource,
    configurationSha256: hash9(nodeSource),
  };
  const completed = packet;
  validateAzureNetworkUpdateTerraformReceipt(plan, finalStage, completed.receipt, binding.providerLockSha256);
  require28(
    completed.receipt.noChanges && completed.receipt.configurationSha256 === hash9(nodeSource),
    'original final refresh changes or differs',
  );
  const all = Object.keys(binding.before.nodes).flatMap((node) => plan.nics.map((nic) => `${node}:${nic.index}`));
  verifyAzureNetworkUpdateProgress(plan, binding.before, completed.inventory, all);
  verifyAzureTerraformNetworkUpdateState(plan, completed.inventory, completed.outputs);
  keys8(completed.evidenceByNode, Object.keys(binding.before.nodes));
  for (let node = 1; node <= plan.topology.nodeCount; node++) {
    const evidence = completed.evidenceByNode[String(node)];
    keys8(evidence, ['receipt', 'verification']);
    const expected = {
      owner: structuredClone(store.owner),
      planSha256: plan.planSha256,
      node,
      siteName: plan.siteName,
      siteUid: original.siteUid,
      siteConfigurationSha256: original.siteConfigurationSha256,
      configurationSha256: snapshot.configurationSha256,
      inventory: structuredClone(completed.inventory),
    };
    require28(
      same21(
        verification2(await qualify(evidence.receipt, expected, 'historical', deadline)),
        verification2(evidence.verification),
      ),
      'final node acceptance provenance changed',
    );
  }
  for (const [digest, expected] of sourceDigests)
    require28(
      canonicalSha256(await bounded(() => loaders.loadSource(digest))) === expected,
      'predecessor source changed during qualification',
    );
  for (const { source: owner, digest } of outcomes.values())
    require28(
      canonicalSha256(await bounded(() => loaders.loadOutcome(structuredClone(owner)))) === digest,
      'public outcome changed during qualification',
    );
  await store.verify();
  require28(same21(store.owner, binding.owner), 'owner changed during historical qualification');
  for (const [name, digest] of observed) {
    deadline.throwIfAborted();
    require28(
      canonicalSha256(await bounded(() => store.read(name))) === digest,
      'historical evidence changed during qualification',
    );
  }
  deadline.throwIfAborted();
  return {
    schemaVersion: 1,
    kind: 'azure-terraform-network-completion-history',
    engine: 'terraform',
    sourcePlanSha256: plan.planSha256,
    originalPlanSha256: original.originalPlanSha256,
    sourceBindingSha256: canonicalSha256(binding),
    checkpointSha256: snapshot.checkpointSha256,
    completionSha256: canonicalSha256(packet),
    finalConfigurationSha256: hash9(nodeSource),
    finalSource: nodeSource,
    before: structuredClone(binding.before),
    inventory: structuredClone(completed.inventory),
    outputs: structuredClone(completed.outputs),
    siteUid: original.siteUid,
    siteConfigurationSha256: original.siteConfigurationSha256,
    sourceQualification: structuredClone(original),
    currentOperationalAcceptanceQualified: false,
  };
}
async function readAzureTerraformNetworkCompletionHistory(plan, store, loaders, verifier, signal, replacementVerifier) {
  const result = await runAzureTerraformNetworkGenerationHistory(
    plan,
    store,
    loaders,
    verifier,
    readAzureTerraformNetworkCompletionOne,
    undefined,
    signal,
    replacementVerifier,
  );
  require28(
    result.completion?.kind === 'azure-terraform-network-completion-history',
    'immutable completed network history required',
  );
  return result.completion;
}
async function qualifyAzureTerraformNetworkGenerationSource(
  plan,
  source,
  inventory,
  store,
  loaders,
  providerLockSha256,
  site,
  verifier,
  signal,
  replacementVerifier,
) {
  return (
    await runAzureTerraformNetworkGenerationHistory(
      plan,
      store,
      loaders,
      verifier,
      readAzureTerraformNetworkCompletionOne,
      { source, inventory, providerLockSha256, site },
      signal,
      replacementVerifier,
    )
  ).qualification;
}

// plugins/azure/src/ce/terraform-network-bound-replacement-source.ts
var same22 = canonicalEqual;
function require29(value, message) {
  if (!value) throw Error(`Azure Terraform network-bound replacement source: ${message}`);
}
async function qualifyAzureTerraformNetworkBoundReplacementSource(
  request,
  store,
  loaders,
  verifier,
  signal,
  replacementVerifier,
  qualifiedPrevious,
) {
  signal?.throwIfAborted();
  const input = structuredClone(request);
  const { plan, networkPlan: network, originalPlan: original } = input;
  for (const p of [plan, network, original]) verifyAzureCePlan(p);
  const profile = network.terraformNetworkReplacementProfile
    ? verifyAzureTerraformNetworkReplacementProfile(network)
    : verifyAzureTerraformNetworkProfile(network);
  const replacement = verifyAzureTerraformNetworkReplacementProfile(plan);
  require29(
    replacement.originalPlanSha256 === original.planSha256 && replacement.retainedPlanSha256 === network.planSha256,
    'exact bound original and immediate completed network predecessor required',
  );
  require29(
    plan.engine === 'terraform' &&
      plan.intent.engine === 'terraform' &&
      plan.intent.operation === 'replace-node' &&
      Number.isInteger(plan.intent.replacementNode) &&
      Number(plan.intent.replacementNode) >= 1 &&
      Number(plan.intent.replacementNode) <= plan.topology.nodeCount &&
      !plan.relayProfile &&
      !plan.networkProfile &&
      !plan.networkReplacementProfile &&
      !plan.terraformNetworkProfile &&
      original.engine === 'terraform' &&
      original.intent.operation === 'deploy' &&
      !original.relayProfile &&
      profile.originalPlanSha256 === original.planSha256 &&
      same22(azureUpgradeBinding(plan), azureUpgradeBinding(original)) &&
      same22(azureUpgradeBinding(network), azureUpgradeBinding(original)) &&
      same22(azureTerraformNetworkScope(plan, true), azureTerraformNetworkScope(original, true)) &&
      same22(azureTerraformNetworkScope(network, true), azureTerraformNetworkScope(original, true)) &&
      same22(azureTerraformNetworkScope(plan, false), azureTerraformNetworkScope(network, false)),
    'exact selected Terraform replacement, original and retained network scope required',
  );
  const history =
    qualifiedPrevious ??
    (
      await runAzureTerraformNetworkGenerationHistory(
        network,
        store,
        loaders,
        verifier,
        readAzureTerraformNetworkCompletionOne,
        undefined,
        signal,
        replacementVerifier,
      )
    ).completion;
  require29(
    history && history.sourcePlanSha256 === network.planSha256,
    'exact completed immediate predecessor required',
  );
  const inventory = network.terraformNetworkReplacementProfile
    ? validateAzureTerraformReplacementPredecessorInventory(network, input.inventory, history)
    : validateAzureNetworkUpdateInventory(network, input.inventory);
  require29(
    history.originalPlanSha256 === original.planSha256 &&
      input.source === history.finalSource &&
      createHash18('sha256').update(input.source).digest('hex') === history.finalConfigurationSha256 &&
      input.providerLockSha256 === AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256 &&
      input.providerLockSha256 === history.sourceQualification.providerLockSha256 &&
      same22(input.site, azureTerraformCompletedGenerationSite(history)),
    'exact private network source, provider lock and owned site required',
  );
  const identities = (nodes) =>
    Object.fromEntries(
      Object.entries(nodes).map(([node, vm]) => [
        node,
        {
          ...vm,
          nics: Object.fromEntries(
            Object.entries(vm.nics).map(([index, nic]) => [
              index,
              nic.allocation === 'Dynamic' ? { ...nic, privateIp: null } : nic,
            ]),
          ),
        },
      ]),
    );
  require29(
    same22(identities(inventory.nodes), identities(azureTerraformCompletedGenerationNodes(history))),
    'complete retained VM UUID/owner and NIC/MAC/IP-configuration/subnet identity required',
  );
  const node = String(plan.intent.replacementNode);
  const selected = plan.actions.filter((action) => action.kind === 'vm-delete');
  require29(
    selected.length === 1 &&
      selected[0].node === Number(node) &&
      selected[0].resourceId?.toLowerCase() === inventory.nodes[node].resourceId.toLowerCase() &&
      selected[0].expectedOwnerPlanSha256 === inventory.nodes[node].ownerPlanSha256,
    'one exact retained selected VM delete boundary required',
  );
  signal?.throwIfAborted();
  require29(same22(input, request), 'requested source identity changed during historical qualification');
  return {
    schemaVersion: 1,
    kind: 'azure-terraform-network-bound-replacement-source',
    planSha256: plan.planSha256,
    originalPlanSha256: original.planSha256,
    retainedNetworkPlanSha256: network.planSha256,
    sourceConfigurationSha256: history.finalConfigurationSha256,
    providerLockSha256: input.providerLockSha256,
    ...azureTerraformCompletedGenerationSite(history),
    selectedNode: Number(node),
    retainedInventorySha256: canonicalSha256(inventory),
    networkHistory: [
      ...(history.sourceQualification.networkHistory ?? []),
      azureTerraformCompletedGenerationLink(history),
    ],
    currentOperationalAcceptanceQualified: false,
  };
}

// plugins/azure/src/ce/terraform-network-replacement-source-binding.ts
var hash10 = (value) => createHash19('sha256').update(value).digest('hex');
var same23 = canonicalEqual;
function require30(value, message) {
  if (!value) throw Error(`Azure Terraform network replacement source binding: ${message}`);
}
function validateAzureTerraformNetworkReplacementBindingIdentity(plan, owner, retained, lock, site, input) {
  verifyAzureCePlan(plan);
  verifyAzureCePlan(retained);
  const profile = verifyAzureTerraformNetworkReplacementProfile(plan);
  require30(
    retained.planSha256 === profile.retainedPlanSha256 &&
      same23(owner, azureUpgradeBinding(plan).owner) &&
      same23(owner, azureUpgradeBinding(retained).owner) &&
      lock === AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256,
    'exact owning retained plan and qualified provider required',
  );
  require30(input && typeof input === 'object' && !Array.isArray(input), 'complete immutable source record required');
  const row = input;
  require30(
    same23(Object.keys(row).sort(), [
      'before',
      'engine',
      'kind',
      'originalPlanSha256',
      'outputs',
      'owner',
      'planSha256',
      'providerLockSha256',
      'qualification',
      'retainedPlanSha256',
      'schemaVersion',
      'site',
      'source',
      'sourceConfigurationSha256',
    ]) &&
      row.schemaVersion === 1 &&
      row.kind === 'azure-terraform-network-replacement-original-source' &&
      row.engine === 'terraform' &&
      same23(row.owner, owner) &&
      row.planSha256 === plan.planSha256 &&
      row.originalPlanSha256 === profile.originalPlanSha256 &&
      row.retainedPlanSha256 === profile.retainedPlanSha256 &&
      row.providerLockSha256 === lock &&
      same23(row.site, site) &&
      typeof row.source === 'string' &&
      hash10(row.source) === row.sourceConfigurationSha256,
    'saved source schema or identity differs',
  );
  require30(
    row.outputs &&
      typeof row.outputs === 'object' &&
      !Array.isArray(row.outputs) &&
      same23(Object.keys(row.outputs).sort(), ['ce_instances', 'ce_interfaces']),
    'exact requested Terraform output schema required',
  );
  require30(
    row.qualification && row.qualification.retainedInventorySha256 === canonicalSha256(row.before),
    'saved complete inventory differs from source qualification',
  );
  if (retained.terraformNetworkReplacementProfile)
    verifyAzureTerraformNetworkPhysicalState(retained, row.before, row.outputs);
  else verifyAzureTerraformNetworkUpdateState(retained, row.before, row.outputs);
  return row;
}
async function bindAzureTerraformNetworkReplacementSource(
  request,
  terraform,
  store,
  api,
  env,
  loaders,
  siteRequest,
  qualifyAcceptance,
  signal,
  replacementVerifier,
) {
  signal?.throwIfAborted();
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const plan = structuredClone(request),
    site = structuredClone(siteRequest),
    owner = structuredClone(store.owner);
  verifyAzureCePlan(plan);
  const profile = verifyAzureTerraformNetworkReplacementProfile(plan);
  require30(
    same23(owner, azureUpgradeBinding(plan).owner) &&
      Object.keys(site).sort().join(',') === 'siteConfigurationSha256,siteUid' &&
      typeof site.siteUid === 'string' &&
      site.siteUid &&
      typeof site.siteConfigurationSha256 === 'string' &&
      /^[a-f0-9]{64}$/.test(site.siteConfigurationSha256) &&
      typeof qualifyAcceptance === 'function',
    'exact owning Terraform replacement and resolved site required',
  );
  const bounded = async (task) => {
    deadline.throwIfAborted();
    const abort = Promise.withResolvers();
    const onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([task(), abort.promise]);
      deadline.throwIfAborted();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const optional = async (name) => {
    try {
      return await bounded(() => store.read(name));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  };
  const verifyOwner = async () => {
    require30(
      same23(owner, store.owner) && same23(plan, request) && same23(site, siteRequest),
      'requested identity changed during binding',
    );
    await bounded(() => store.verify());
  };
  await verifyOwner();
  const deployment = await bounded(() => azureTerraformCurrentDeployment(plan)),
    lock = hash10(deployment.providerLock);
  require30(lock === AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256, 'qualified exact provider lock required');
  const unlock = await acquireProcessLock(`${store.directory}/.terraform-replacement-lock`);
  try {
    deadline.throwIfAborted();
    await verifyOwner();
    const packets = new Map(),
      sources = new Map(),
      outcomes = new Map();
    const remember = (records, name, value) => {
      const digest = canonicalSha256(value);
      require30(
        !records.has(name) || records.get(name) === digest,
        'historical packet or source changed during binding',
      );
      records.set(name, digest);
    };
    const readonlyStore = new Proxy(store, {
      get(target, key) {
        if (key === 'read')
          return async (name) => {
            const value = await bounded(() => store.read(name));
            remember(packets, name, value);
            return structuredClone(value);
          };
        if (key === 'verify') return verifyOwner;
        if (['write', 'remove', 'retire'].includes(String(key)))
          return () => {
            throw Error('Source qualification must not mutate storage');
          };
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const tracked = {
      async loadSource(digest) {
        const value = await bounded(() => loaders.loadSource(digest));
        verifyAzureCePlan(value);
        require30(value.planSha256 === digest, 'loaded predecessor digest differs');
        remember(sources, digest, value);
        return structuredClone(value);
      },
      async loadOutcome(p) {
        const value = await bounded(() => loaders.loadOutcome(structuredClone(p))),
          digest = canonicalSha256(value);
        require30(
          !outcomes.has(p.planSha256) || outcomes.get(p.planSha256)?.digest === digest,
          'original outcome changed during binding',
        );
        outcomes.set(p.planSha256, { plan: structuredClone(p), digest });
        return structuredClone(value);
      },
    };
    const original = await tracked.loadSource(profile.originalPlanSha256),
      retained = await tracked.loadSource(profile.retainedPlanSha256);
    const previous = retained.terraformNetworkReplacementProfile
      ? (
          await bounded(() =>
            runAzureTerraformNetworkGenerationHistory(
              retained,
              readonlyStore,
              tracked,
              qualifyAcceptance,
              readAzureTerraformNetworkCompletionOne,
              undefined,
              deadline,
              replacementVerifier,
            ),
          )
        ).completion
      : undefined;
    if (retained.terraformNetworkReplacementProfile) require30(previous, 'owning completed replacement required');
    const qualify = (source, inventory) =>
      bounded(() =>
        qualifyAzureTerraformNetworkBoundReplacementSource(
          {
            plan,
            networkPlan: retained,
            originalPlan: original,
            source,
            inventory,
            providerLockSha256: lock,
            site,
          },
          readonlyStore,
          tracked,
          qualifyAcceptance,
          deadline,
          replacementVerifier,
          previous,
        ),
      );
    const name = `${plan.planId}-terraform-network-replacement-source.json`;
    const recheck = async () => {
      await verifyOwner();
      for (const [name, digest] of sources)
        require30(
          canonicalSha256(await bounded(() => loaders.loadSource(name))) === digest,
          'predecessor source changed before binding',
        );
      for (const { plan: p, digest } of outcomes.values())
        require30(
          canonicalSha256(await bounded(() => loaders.loadOutcome(structuredClone(p)))) === digest,
          'original outcome changed before binding',
        );
      for (const [packetName, digest] of packets)
        require30(
          canonicalSha256(await bounded(() => store.read(packetName))) === digest,
          'historical packet changed before source binding',
        );
      await verifyOwner();
      const bindingDigest = packets.get(name);
      if (bindingDigest !== undefined)
        require30(
          canonicalSha256(await bounded(() => store.read(name))) === bindingDigest,
          'owning binding changed at final preparation boundary',
        );
    };
    const verifyOutputs = (inventory, outputs) => {
      require30(
        outputs &&
          typeof outputs === 'object' &&
          !Array.isArray(outputs) &&
          same23(Object.keys(outputs).sort(), ['ce_instances', 'ce_interfaces']),
        'exact requested Terraform output schema required',
      );
      if (retained.terraformNetworkReplacementProfile)
        verifyAzureTerraformNetworkPhysicalState(retained, inventory, outputs);
      else verifyAzureTerraformNetworkUpdateState(retained, inventory, outputs);
    };
    const validate = async (input) => {
      const row = validateAzureTerraformNetworkReplacementBindingIdentity(plan, owner, retained, lock, site, input);
      require30(
        same23(row.qualification, await qualify(row.source, row.before)),
        'saved predecessor qualification differs',
      );
      return row;
    };
    const saved = await optional(name);
    if (saved !== undefined) {
      remember(packets, name, saved);
      const binding = await validate(saved);
      const session = await bounded(() => terraform.open(owner, deployment, 'current'));
      await recheck();
      return { session, binding };
    }
    const token = `${plan.deploymentName.slice(0, 40)}-${plan.intent.replacementNode}-${plan.planSha256.slice(0, 12)}`;
    const laterNames = [
      `${plan.planId}-terraform-network-replacement-execution.json`,
      `${plan.planId}-terraform-replacement.json`,
      `${plan.planId}-terraform-replacement-source.json`,
      `${plan.planId}-terraform-quiesce-plan.json`,
      `${plan.planId}-terraform-launch-plan.json`,
      `${plan.planId}-terraform-quiesce-recovery.json`,
      `${plan.planId}-terraform-launch-recovery.json`,
      `${plan.planId}-terraform-replacement-final-plan.json`,
      `${plan.planId}-terraform-network-replacement-complete.json`,
      `${plan.planId}-terraform-replacement-registration.json`,
      `${token}.json`,
    ];
    const noLater = async () => {
      for (const later of laterNames)
        require30(
          (await optional(later)) === undefined,
          'original binding missing after enrollment or stage publication',
        );
    };
    await noLater();
    const session = await bounded(() => terraform.open(owner, deployment, 'current'));
    const readRevision = session.readConfigurationSha256?.bind(session);
    require30(readRevision, 'owning current configuration capability required');
    const revision = await bounded(readRevision);
    require30(
      typeof revision === 'string' && /^[a-f0-9]{64}$/.test(revision),
      'resolved current private source revision required',
    );
    const source = await bounded(() => session.readConfiguration(revision));
    require30(typeof source === 'string' && hash10(source) === revision, 'current private source bytes differ');
    const boundedApi = { exec: (...args) => bounded(() => api.exec(...args)) };
    const capture = async () => {
      if (!retained.terraformNetworkReplacementProfile)
        return captureAzureNetworkUpdateInventory(retained, boundedApi, deadline);
      require30(
        previous?.kind === 'azure-terraform-network-replacement-completion-history',
        'distinct completed replacement required',
      );
      const raw = await bounded(() =>
        readonlyStore.read(`${retained.planId}-terraform-network-replacement-source.json`),
      );
      require30(
        canonicalSha256(raw) === previous.sourceBindingSha256,
        'owning predecessor source-binding digest differs',
      );
      const predecessorBinding = raw;
      const predecessorRetained = await tracked.loadSource(
        verifyAzureTerraformNetworkReplacementProfile(retained).retainedPlanSha256,
      );
      const current = await observeAzureTerraformNetworkReplacementCurrent(
        {
          plan: retained,
          retainedPlan: predecessorRetained,
          binding: predecessorBinding,
          sourceBindingSha256: previous.sourceBindingSha256,
          phase: 'launched',
          newVmId: previous.nodes[String(retained.intent.replacementNode)].vmId ?? undefined,
        },
        boundedApi,
        deadline,
      );
      return {
        schemaVersion: 1,
        engine: 'terraform',
        planSha256: retained.planSha256,
        collectedAt: current.collectedAt,
        nodes: Object.fromEntries(
          Object.entries(current.nodes).map(([node, vm]) => {
            require30(
              vm.vmState === 'present' && vm.vmId && vm.ownerPlanSha256,
              'complete current replacement physical vector required',
            );
            const { vmState: _state, nics, ...identity } = vm;
            return [
              node,
              {
                ...identity,
                vmId: vm.vmId,
                ownerPlanSha256: vm.ownerPlanSha256,
                nics: Object.fromEntries(
                  Object.entries(nics).map(([index, nic]) => {
                    const { attachment: _attachment, ...physical } = nic;
                    return [index, physical];
                  }),
                ),
              },
            ];
          }),
        ),
      };
    };
    const before = await capture(),
      outputs = await bounded(() => session.readOutputs(['ce_instances', 'ce_interfaces'], env, deadline));
    verifyOutputs(before, outputs);
    const qualification = await qualify(source, before);
    const binding = {
      schemaVersion: 1,
      kind: 'azure-terraform-network-replacement-original-source',
      engine: 'terraform',
      owner,
      planSha256: plan.planSha256,
      originalPlanSha256: profile.originalPlanSha256,
      retainedPlanSha256: profile.retainedPlanSha256,
      source,
      sourceConfigurationSha256: revision,
      providerLockSha256: lock,
      before,
      outputs,
      site,
      qualification,
    };
    const current = await capture(),
      currentOutputs = await bounded(() => session.readOutputs(['ce_instances', 'ce_interfaces'], env, deadline));
    verifyOutputs(current, currentOutputs);
    require30(
      same23(current.nodes, before.nodes) && same23(currentOutputs, outputs),
      'full current inventory or outputs changed during binding',
    );
    await validate(binding);
    require30(
      (await bounded(readRevision)) === revision &&
        (await bounded(() => session.readConfiguration(revision))) === source,
      'private source changed before publication',
    );
    await noLater();
    require30((await optional(name)) === undefined, 'original source appeared during binding');
    await recheck();
    await noLater();
    require30((await optional(name)) === undefined, 'original source appeared during final binding recheck');
    await bounded(() => store.write(name, binding));
    remember(packets, name, binding);
    await recheck();
    return { session, binding };
  } finally {
    await unlock();
  }
}

// plugins/azure/src/ce/terraform-network-replacement-current.ts
var same24 = canonicalEqual;
var lower9 = (v) => (typeof v === 'string' ? v.toLowerCase() : '');
var uuid4 = (v) => typeof v === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
function require31(value, message) {
  if (!value) throw Error(`Azure Terraform network replacement current identity: ${message}`);
}
function object24(value) {
  require31(value && typeof value === 'object' && !Array.isArray(value), 'complete cloud object required');
  return value;
}
async function observeAzureTerraformNetworkReplacementCurrent(request, api, signal) {
  signal?.throwIfAborted();
  const input = structuredClone(request),
    { plan, retainedPlan, binding, phase } = input;
  verifyAzureCePlan(plan);
  verifyAzureCePlan(retainedPlan);
  const profile = verifyAzureTerraformNetworkReplacementProfile(plan),
    selected = plan.intent.replacementNode;
  require31(
    typeof selected === 'number' &&
      ['intact', 'quiesced', 'launched'].includes(phase) &&
      /^[a-f0-9]{64}$/.test(input.sourceBindingSha256) &&
      canonicalSha256(binding) === input.sourceBindingSha256 &&
      retainedPlan.planSha256 === profile.retainedPlanSha256 &&
      Object.keys(input).sort().join(',') ===
        [
          'binding',
          'phase',
          'plan',
          'retainedPlan',
          'sourceBindingSha256',
          ...(input.newVmId !== undefined ? ['newVmId'] : []),
        ]
          .sort()
          .join(','),
    'resolved exact owning phase and source binding required',
  );
  validateAzureTerraformNetworkReplacementBindingIdentity(
    plan,
    azureUpgradeBinding(plan).owner,
    retainedPlan,
    binding.providerLockSha256,
    binding.site,
    binding,
  );
  require31(
    phase === 'launched'
      ? uuid4(input.newVmId) &&
          !Object.values(binding.before.nodes).some((vm) => lower9(vm.vmId) === lower9(input.newVmId))
      : input.newVmId === undefined,
    'exact distinct launched UUID required only after launch',
  );
  const resources = object24(object24(JSON.parse(binding.source)).resource),
    sourceVms = object24(resources.azurerm_linux_virtual_machine),
    sourceNics = object24(resources.azurerm_network_interface);
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const bounded = async (task) => {
    deadline.throwIfAborted();
    const abort = Promise.withResolvers(),
      onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([task(), abort.promise]);
      deadline.throwIfAborted();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const unchanged = () => require31(same24(input, request), 'requested binding or phase changed during observation');
  const read = async (args) => {
    unchanged();
    const result = await bounded(() => api.exec('az', [...args, '--output', 'json'], { signal: deadline }));
    require31(result.exitCode === 0, 'cloud observation unavailable');
    try {
      return JSON.parse(result.stdout);
    } catch {
      throw Error('Azure Terraform network replacement current identity: malformed cloud JSON');
    }
  };
  const collect = async () => {
    const account = object24(await read(['account', 'show', '--subscription', plan.subscription.id]));
    require31(
      lower9(account.id) === lower9(plan.subscription.id) &&
        lower9(account.tenantId) === lower9(plan.subscription.tenantId) &&
        account.environmentName === plan.subscription.cloud &&
        account.state === 'Enabled',
      'current account identity differs',
    );
    const rows = await read([
      'vm',
      'list',
      '--resource-group',
      plan.intent.resourceGroup,
      '--subscription',
      plan.subscription.id,
      '--show-details',
    ]);
    require31(Array.isArray(rows), 'complete VM discovery required');
    const vms = rows.map(object24);
    const nodes = {},
      seenVm = new Set(),
      seenMac = new Set();
    const subnets = new Map();
    const subnet = async (id, expected) => {
      if (subnets.has(lower9(id))) {
        require31(subnets.get(lower9(id)) === expected, 'conflicting frozen subnet CIDR');
        return;
      }
      const value = object24(
        await read(['network', 'vnet', 'subnet', 'show', '--ids', id, '--subscription', plan.subscription.id]),
      );
      require31(
        value.nextLink === undefined &&
          lower9(value.id) === lower9(id) &&
          value.provisioningState === 'Succeeded' &&
          (value.addressPrefixes === undefined || Array.isArray(value.addressPrefixes)),
        'authoritative subnet identity/state unavailable',
      );
      const prefixes = [
        ...(value.addressPrefix !== undefined ? [value.addressPrefix] : []),
        ...(Array.isArray(value.addressPrefixes) ? value.addressPrefixes : []),
      ];
      require31(
        prefixes.length > 0 && prefixes.every((v) => typeof v === 'string' && v === expected),
        'subnet CIDR missing, changed or ambiguous',
      );
      subnets.set(lower9(id), expected);
    };
    for (let node = 1; node <= plan.topology.nodeCount; node++) {
      const key = String(node),
        old = binding.before.nodes[key],
        absent = node === selected && phase === 'quiesced';
      const owner = node === selected && phase === 'launched' ? plan.planSha256 : old.ownerPlanSha256;
      const matches = vms.filter((vm) => lower9(vm.id) === lower9(old.resourceId));
      let vmId = null;
      if (absent) require31(matches.length === 0, 'selected VM must be independently absent after quiesce');
      else {
        require31(matches.length === 1, 'VM discovery missing or duplicate');
        const vm = matches[0];
        const tags = structuredClone(object24(object24(sourceVms[`node_${node}`]).tags));
        tags['xcsh-plan-sha256'] = owner;
        const attached = object24(vm.networkProfile).networkInterfaces;
        const expectedVmId = node === selected && phase === 'launched' ? input.newVmId : old.vmId;
        require31(
          vm.nextLink === undefined &&
            vm.name === `${plan.deploymentName}-${node}` &&
            lower9(vm.location) === lower9(plan.region) &&
            vm.provisioningState === 'Succeeded' &&
            lower9(object24(vm.hardwareProfile).vmSize) === lower9(plan.vm.size) &&
            uuid4(vm.vmId) &&
            lower9(vm.vmId) === lower9(expectedVmId) &&
            same24(vm.tags, tags) &&
            Array.isArray(attached) &&
            same24(
              attached.map((v) => lower9(object24(v).id)).sort(),
              Object.values(old.nics)
                .map((n) => lower9(n.resourceId))
                .sort(),
            ),
          'VM generation, tags or attachment differs',
        );
        require31(!seenVm.has(lower9(vm.vmId)), 'duplicate VM UUID');
        seenVm.add(lower9(vm.vmId));
        vmId = vm.vmId;
      }
      const nics = {};
      for (const [index, nic] of Object.entries(old.nics)) {
        const value = object24(
          await read(['network', 'nic', 'show', '--ids', nic.resourceId, '--subscription', plan.subscription.id]),
        );
        const tags = object24(object24(sourceNics[`node_${node}_nic_${index}`]).tags);
        require31(
          value.nextLink === undefined &&
            lower9(value.id) === lower9(nic.resourceId) &&
            lower9(value.location) === lower9(plan.region) &&
            value.provisioningState === 'Succeeded' &&
            same24(value.tags, tags) &&
            Array.isArray(value.ipConfigurations) &&
            value.ipConfigurations.length === 1,
          'full current NIC identity or IP configuration missing',
        );
        const attachment =
          value.virtualMachine === undefined || value.virtualMachine === null
            ? null
            : object24(value.virtualMachine).id;
        require31(
          absent
            ? attachment === null
            : typeof attachment === 'string' && lower9(attachment) === lower9(old.resourceId),
          'phase NIC attachment differs',
        );
        const config = object24(value.ipConfigurations[0]),
          mac = lower9(value.macAddress).replaceAll('-', ':');
        require31(
          mac === nic.mac &&
            !seenMac.has(mac) &&
            config.name === nic.ipConfigurationName &&
            lower9(config.id) === lower9(nic.ipConfigurationId) &&
            config.primary === true &&
            config.provisioningState === 'Succeeded' &&
            config.privateIPAddressVersion === 'IPv4' &&
            config.privateIPAllocationMethod === nic.allocation &&
            config.privateIPAddress === nic.privateIp &&
            lower9(object24(config.subnet).id) === lower9(nic.subnetId) &&
            usableAzureNetworkAddress(config.privateIPAddress, nic.subnetCidr),
          'full retained NIC/IP-configuration identity or state differs',
        );
        seenMac.add(mac);
        await subnet(nic.subnetId, nic.subnetCidr);
        nics[index] = { ...structuredClone(nic), attachment: absent ? null : old.resourceId };
      }
      nodes[key] = {
        resourceId: old.resourceId,
        vmId,
        vmState: absent ? 'absent' : 'present',
        ownerPlanSha256: absent ? null : owner,
        nics,
      };
    }
    unchanged();
    return nodes;
  };
  const first = await collect(),
    nodes = await collect();
  require31(same24(first, nodes), 'cloud phase identity changed across collection');
  unchanged();
  deadline.throwIfAborted();
  return {
    schemaVersion: 1,
    kind: 'azure-terraform-network-replacement-current-identity',
    planSha256: plan.planSha256,
    sourceBindingSha256: input.sourceBindingSha256,
    phase,
    collectedAt: new Date().toISOString(),
    nodes,
    currentOperationalAcceptanceQualified: false,
  };
}

// plugins/azure/src/ce/network-replacement-operational-identity.ts
var same25 = canonicalEqual;
var sha8 = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function require32(value, message) {
  if (!value) throw Error(`Azure replacement operational identity: ${message}`);
}
async function collectAzureReplacementOperationalIdentity(
  request,
  expected,
  transport,
  cloud,
  storage,
  terraform,
  dependencies,
  purpose,
  signal,
) {
  signal?.throwIfAborted();
  const {
    observeNodeReadiness: readinessReader,
    observeForwardingRoutes: forwardingReader,
    observeBgpSessions: bgpSessionReader,
    observeBgpRoutes: bgpRouteReader,
  } = transport;
  const plan = structuredClone(request),
    identity = structuredClone(expected),
    requestMatches = canonicalSnapshot(request),
    identityMatches = canonicalSnapshot(expected),
    directory = storage.directory,
    owner = structuredClone(storage.owner),
    binding = azureUpgradeBinding(plan);
  verifyAzureCePlan(plan);
  verifyAzureTerraformNetworkReplacementProfile(plan);
  require32(
    same25(
      Object.keys(identity).sort(),
      [
        'owner',
        'planSha256',
        'journalSha256',
        'sourceBindingSha256',
        'configurationSha256',
        'site',
        'phase',
        'nodes',
      ].sort(),
    ) &&
      plan.engine === 'terraform' &&
      transport.engine === 'terraform' &&
      same25(identity.owner, binding.owner) &&
      same25(identity.owner, owner) &&
      identity.planSha256 === plan.planSha256 &&
      sha8(identity.journalSha256) &&
      sha8(identity.sourceBindingSha256) &&
      sha8(identity.configurationSha256) &&
      identity.site &&
      typeof identity.site.siteUid === 'string' &&
      identity.site.siteUid.trim() &&
      sha8(identity.site.siteConfigurationSha256) &&
      same25(Object.keys(identity.site).sort(), ['siteConfigurationSha256', 'siteUid']) &&
      ((purpose === 'preflight' && identity.phase === 'intact') ||
        (purpose === 'final' && identity.phase === 'launched')) &&
      identity.nodes &&
      same25(
        Object.keys(identity.nodes).sort(),
        Array.from({ length: plan.topology.nodeCount }, (_, i) => String(i + 1)).sort(),
      ) &&
      typeof dependencies.qualifyHistorical === 'function',
    'resolved exact owning replacement identity and purpose required',
  );
  const instances = {},
    interfaces = [];
  for (const [node, vm] of Object.entries(identity.nodes)) {
    require32(
      vm &&
        vm.vmState === 'present' &&
        typeof vm.vmId === 'string' &&
        /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(vm.vmId) &&
        typeof vm.resourceId === 'string' &&
        vm.resourceId.startsWith('/subscriptions/') &&
        sha8(vm.ownerPlanSha256) &&
        vm.nics &&
        same25(Object.keys(vm.nics).sort(), plan.nics.map((nic) => String(nic.index)).sort()),
      'complete present replacement node scope required',
    );
    const name = `${plan.deploymentName}-${node}`;
    instances[name] = vm.vmId;
    for (const nic of plan.nics) {
      const current = vm.nics[String(nic.index)];
      require32(
        nic.role === 'slo' || nic.role === 'data' || nic.role === 'sli',
        'configured replacement interface role required',
      );
      require32(
        current &&
          current.attachment === vm.resourceId &&
          typeof current.mac === 'string' &&
          /^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(current.mac),
        'attached exact replacement interface scope required',
      );
      interfaces.push({ node: name, role: nic.role, mac: current.mac });
    }
  }
  require32(
    new Set(Object.values(instances).map((v) => v.toLowerCase())).size === plan.topology.nodeCount &&
      new Set(interfaces.map((v) => v.mac)).size === interfaces.length,
    'distinct replacement VM and MAC identities required',
  );
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const callbacks = [
    [transport, ['observeOwnedSite', 'ownedSiteConfiguration', 'observeRegistrations', 'observeAzureInterfaces']],
    [cloud, ['exec']],
    [storage, ['verify', 'read']],
    [terraform, ['readConfiguration', 'readConfigurationSha256']],
    [dependencies.loaders, ['loadSource']],
    [
      dependencies,
      ['qualifyHistorical', ...(dependencies.qualifyReplacementCompleted ? ['qualifyReplacementCompleted'] : [])],
    ],
  ];
  const pinned = callbacks.flatMap(([target, names]) =>
    names.map((name) => {
      const object = target,
        callback = object[name];
      require32(typeof callback === 'function', 'owning observation callback required');
      return { object, name, callback };
    }),
  );
  const seal = () => {
    deadline.throwIfAborted();
    require32(
      requestMatches(request) &&
        requestMatches(plan) &&
        identityMatches(expected) &&
        identityMatches(identity) &&
        storage.directory === directory &&
        same25(storage.owner, owner) &&
        transport.engine === 'terraform' &&
        transport.observeNodeReadiness === readinessReader &&
        transport.observeForwardingRoutes === forwardingReader &&
        transport.observeBgpSessions === bgpSessionReader &&
        transport.observeBgpRoutes === bgpRouteReader &&
        pinned.every((v) => v.object[v.name] === v.callback),
      'owning observation context changed',
    );
  };
  seal();
  const runtime = guardAzureCeApplyObject(transport, seal, {}, ['engine']),
    api = guardAzureCeApplyObject(cloud, seal),
    store = guardAzureCeApplyObject(storage, seal, {}, ['directory', 'owner']),
    session = guardAzureCeApplyObject(terraform, seal),
    loaders = guardAzureCeApplyObject(dependencies.loaders, seal),
    { qualifyHistorical: historical, qualifyReplacementCompleted: completed } = dependencies;
  const bounded = async (work) => {
    seal();
    const abort = Promise.withResolvers(),
      onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([Promise.resolve().then(work), abort.promise]);
      seal();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const authenticate = () =>
    bounded(async () => {
      const read = await readAzureTerraformNetworkReplacementExecutionBinding(
        plan,
        store,
        loaders,
        identity.site,
        identity.journalSha256,
        async (...args) => bounded(() => historical(...args)),
        deadline,
        undefined,
        completed ? async (...args) => bounded(() => completed(...args)) : undefined,
      );
      require32(
        read.source.sourceBindingSha256 === identity.sourceBindingSha256 &&
          read.execution.journal.sourceBindingSha256 === identity.sourceBindingSha256,
        'authenticated replacement source differs',
      );
      return read.source.binding;
    });
  const source = await authenticate(),
    retainedPlan = structuredClone(await bounded(() => loaders.loadSource(source.retainedPlanSha256)));
  const configuration = () =>
    bounded(async () => {
      require32(
        (await session.readConfigurationSha256?.()) === identity.configurationSha256 &&
          createHash20('sha256')
            .update(await session.readConfiguration(identity.configurationSha256))
            .digest('hex') === identity.configurationSha256,
        'current private configuration bytes or revision differ',
      );
    });
  await configuration();
  const base = {
    schemaVersion: 1,
    scope: 'replacement-registration-interface-identity',
    owner,
    planSha256: plan.planSha256,
    journalSha256: identity.journalSha256,
    sourceBindingSha256: identity.sourceBindingSha256,
    configurationSha256: identity.configurationSha256,
    site: structuredClone(identity.site),
    phase: identity.phase,
    purpose,
    expectedIdentitySha256: canonicalSha256(identity),
    expectedInventorySha256: canonicalSha256(identity.nodes),
    collectedAt: new Date().toISOString(),
    operationalAcceptance: 'unknown',
    nodeHealth: 'unknown',
    freshness: 'unqualified',
    routing: 'unknown',
    traffic: 'unknown',
  };
  const selected = String(plan.intent.replacementNode);
  const observeCloud = async () => {
    await authenticate();
    await configuration();
    const current = await bounded(() =>
      observeAzureTerraformNetworkReplacementCurrent(
        {
          plan,
          retainedPlan,
          binding: source,
          sourceBindingSha256: identity.sourceBindingSha256,
          phase: identity.phase,
          ...(identity.phase === 'launched' ? { newVmId: identity.nodes[selected].vmId } : {}),
        },
        api,
        deadline,
      ),
    );
    require32(same25(current.nodes, identity.nodes), 'current replacement generation differs');
    await configuration();
    return canonicalSha256(current.nodes);
  };
  const result = await collectAzureOperationalIdentityJoins(
    base,
    binding,
    identity.site,
    instances,
    interfaces,
    runtime,
    observeCloud,
    deadline,
  );
  const nodeReadiness = await collectAzureReplacementNodeReadiness(
    plan,
    identity,
    'registrations' in result ? result.registrations : undefined,
    transport,
    deadline,
  );
  require32(transport.observeNodeReadiness === readinessReader, 'node readiness reader changed');
  const forwarding =
    result.status !== 'unknown'
      ? await collectAzureReplacementForwarding(plan, retainedPlan, identity, result.interfaces, transport, deadline)
      : {
          status: 'unknown',
          operationalAcceptance: 'unknown',
          reason: 'complete-interface-identity-unavailable',
        };
  require32(transport.observeForwardingRoutes === forwardingReader, 'forwarding reader changed');
  const bgp =
    result.status !== 'unknown'
      ? await collectAzureReplacementBgp(plan, identity, source, result.interfaces, api, transport, deadline)
      : {
          status: 'unknown',
          operationalAcceptance: 'unknown',
          reason: 'complete-interface-identity-unavailable',
        };
  seal();
  if (
    typeof readinessReader === 'function' ||
    typeof forwardingReader === 'function' ||
    plan.routing.mode === 'route-server'
  ) {
    const final = await collectAzureOperationalIdentityJoins(
      base,
      binding,
      identity.site,
      instances,
      interfaces,
      runtime,
      observeCloud,
      deadline,
    );
    require32(same25(result, final), 'replacement identities changed across readiness, forwarding or BGP collection');
  }
  await authenticate();
  await configuration();
  seal();
  return { ...result, nodeReadiness, forwarding, bgp };
}

// plugins/azure/src/ce/network-replacement-operational-readings.ts
function require33(value) {
  if (!value) throw Error('Replacement operational readings context or identity changed');
}
async function collectAzureReplacementOperationalReadings(
  request,
  expected,
  transport,
  cloud,
  storage,
  terraform,
  dependencies,
  purpose,
  signal,
  collectTraffic = false,
) {
  signal?.throwIfAborted();
  require33(typeof collectTraffic === 'boolean' && ['preflight', 'final'].includes(purpose));
  const plan = structuredClone(request),
    identity = structuredClone(expected),
    matchesPlan = canonicalSnapshot(request),
    matchesIdentity = canonicalSnapshot(expected),
    owner = structuredClone(storage.owner),
    directory = storage.directory,
    environment = process.env,
    environmentSha256 = canonicalSha256(environment),
    deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]),
    startedAt = new Date().toISOString();
  const collaborators = [
    [
      transport,
      [
        'observeOwnedSite',
        'ownedSiteConfiguration',
        'observeRegistrations',
        'observeAzureInterfaces',
        'observeNodeReadiness',
        'observeForwardingRoutes',
        'observeBgpSessions',
        'observeBgpRoutes',
      ],
    ],
    [cloud, ['exec']],
    [storage, ['verify', 'read', 'write']],
    [terraform, ['readConfiguration', 'readConfigurationSha256']],
    [dependencies, ['qualifyHistorical', 'qualifyReplacementCompleted']],
    [dependencies.loaders, ['loadSource']],
  ];
  const callbacks = collaborators.flatMap(([target, names]) =>
    names.map((name) => {
      const object = target;
      return { object, name, callback: object[name] };
    }),
  );
  const seal = () => {
    deadline.throwIfAborted();
    require33(
      matchesPlan(request) &&
        matchesPlan(plan) &&
        matchesIdentity(expected) &&
        matchesIdentity(identity) &&
        canonicalEqual(storage.owner, owner) &&
        canonicalEqual(owner, identity.owner) &&
        storage.directory === directory &&
        transport.engine === 'terraform' &&
        process.env === environment &&
        canonicalSha256(environment) === environmentSha256 &&
        callbacks.every((row) => row.object[row.name] === row.callback),
    );
  };
  seal();
  const api = guardAzureCeApplyObject(cloud, seal),
    store = guardAzureCeApplyObject(storage, seal, {}, ['owner', 'directory']);
  const bounded = async (work) => {
    seal();
    const aborted = Promise.withResolvers(),
      onAbort = () => aborted.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([Promise.resolve().then(work), aborted.promise]);
      seal();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const acquire = () =>
    bounded(() =>
      collectAzureReplacementOperationalIdentity(
        plan,
        identity,
        transport,
        cloud,
        storage,
        terraform,
        dependencies,
        purpose,
        deadline,
      ),
    );
  const initial = await acquire();
  const unknown = (reason) => ({ status: 'unknown', reason });
  let traffic = unknown(
    !collectTraffic
      ? 'active-probe-not-requested'
      : plan.intent.ingress?.mode !== 'platform-http'
        ? 'reviewed-platform-http-probe-unconfigured'
        : 'qualified-current-up-admission-unavailable',
  );
  if (
    collectTraffic &&
    plan.intent.ingress?.mode === 'platform-http' &&
    initial.canSatisfyInterfaceMutationGate === true
  ) {
    try {
      require33(typeof storage.write === 'function');
      const sample = await bounded(() => collectAzureCurrentTrafficProbe(plan, store, api, deadline));
      traffic = {
        status: sample.status,
        scope: sample.scope,
        sampleId: sample.sampleId,
        planSha256: sample.planSha256,
        checkpointKey: sample.checkpointKey,
        checkpointSha256: sample.checkpointSha256,
        sourceIdentitySha256: sample.sourceIdentitySha256,
        startedAt: sample.startedAt,
        completedAt: sample.completedAt,
        evidenceSha256: canonicalSha256(sample.evidence),
      };
    } catch {
      seal();
      traffic = unknown('current-reviewed-traffic-probe-unverified');
    }
  }
  const final = await acquire();
  if (initial.status !== 'unknown' && final.status !== 'unknown') {
    const identityFacts = (reading) => ({
      site: reading.site,
      registrations: reading.registrations,
      interfaces: reading.interfaces.map(({ linkUp: _link, ...row }) => row),
      sourceBindingSha256: reading.sourceBindingSha256,
      configurationSha256: reading.configurationSha256,
      expectedInventorySha256: reading.expectedInventorySha256,
    });
    require33(canonicalEqual(identityFacts(initial), identityFacts(final)));
  }
  if (traffic.status === 'healthy' && final.canSatisfyInterfaceMutationGate !== true)
    traffic = unknown('post-probe-qualified-current-up-admission-unavailable');
  seal();
  return {
    schemaVersion: 1,
    scope: 'current-replacement-operational-readings',
    status:
      initial.status !== 'unknown' && final.status !== 'unknown' && (!collectTraffic || traffic.status === 'healthy')
        ? 'observed'
        : 'unknown',
    owner,
    planSha256: plan.planSha256,
    purpose,
    identity: final,
    nodeReadiness: final.nodeReadiness,
    forwarding: final.forwarding,
    bgp: final.bgp,
    traffic,
    operationalAcceptance: 'unknown',
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

// plugins/azure/src/ce/operational-acquisition-custody.ts
import {
  createHash as createHash21,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync as generateKeyPairSync2,
  randomUUID as randomUUID2,
  sign,
  verify,
} from 'node:crypto';
// plugins/azure/src/ce/terraform-parent-file-custody.ts
import { constants as constants2 } from 'node:fs';
import {
  lstat as lstat2,
  lstat as lstat3,
  open as open2,
  readdir as readdir3,
  realpath as realpath2,
} from 'node:fs/promises';
import { dirname, isAbsolute, join as join3 } from 'node:path';

var identity = (value) => `${value.dev}:${value.ino}:${value.birthtimeMs}`;
function require34(value, message) {
  if (!value) throw Error(`Azure parent private file: ${message}`);
}
async function readAzureTerraformParentPrivateFile(path, signal) {
  const active = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const step = async (action) => {
    active.throwIfAborted();
    const aborted = Promise.withResolvers(),
      onAbort = () => aborted.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([action(), aborted.promise]);
      active.throwIfAborted();
      return result;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  require34(isAbsolute(path), 'absolute path required');
  const parent = dirname(path),
    directory = await step(() => lstat2(parent));
  require34(
    directory.isDirectory() &&
      !directory.isSymbolicLink() &&
      directory.uid === process.getuid?.() &&
      (directory.mode & 63) === 0 &&
      (await step(() => realpath2(parent))) === parent,
    'private parent directory differs',
  );
  const namedBefore = await step(() => lstat2(path));
  require34(
    namedBefore.isFile() &&
      !namedBefore.isSymbolicLink() &&
      namedBefore.nlink === 1 &&
      namedBefore.uid === process.getuid?.() &&
      (namedBefore.mode & 63) === 0,
    'private regular file required',
  );
  const acquisition = open2(path, constants2.O_RDONLY | constants2.O_NOFOLLOW | constants2.O_NONBLOCK);
  acquisition.then(
    (handle) => {
      if (active.aborted) handle.close().catch(() => {});
    },
    () => {},
  );
  const handle = await step(() => acquisition);
  try {
    const first = await step(() => handle.stat()),
      bytes = await step(() => handle.readFile()),
      after = await step(() => handle.stat()),
      named = await step(() => lstat2(path)),
      parentAfter = await step(() => lstat2(parent));
    require34(
      first.isFile() &&
        first.uid === process.getuid?.() &&
        first.nlink === 1 &&
        (first.mode & 63) === 0 &&
        identity(first) === identity(namedBefore) &&
        identity(first) === identity(after) &&
        first.size === after.size &&
        first.mtimeMs === after.mtimeMs &&
        first.ctimeMs === after.ctimeMs &&
        named.isFile() &&
        !named.isSymbolicLink() &&
        identity(named) === identity(first) &&
        named.nlink === 1 &&
        named.uid === first.uid &&
        (named.mode & 63) === 0 &&
        named.size === after.size &&
        named.mtimeMs === after.mtimeMs &&
        named.ctimeMs === after.ctimeMs &&
        parentAfter.isDirectory() &&
        !parentAfter.isSymbolicLink() &&
        identity(parentAfter) === identity(directory) &&
        parentAfter.uid === directory.uid &&
        (parentAfter.mode & 63) === 0 &&
        (await step(() => realpath2(path))) === path,
      'file bytes, inode or parent custody changed',
    );
    return { bytes, identity: identity(first) };
  } finally {
    await handle.close();
  }
}

// plugins/azure/src/ce/operational-acquisition-custody.ts
var same26 = canonicalEqual;
var digest4 = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function require35(value, reason) {
  if (!value) throw Error(`Azure operational acquisition provenance: ${reason}`);
}
function object25(value) {
  require35(value && typeof value === 'object' && !Array.isArray(value), 'malformed private record');
  return value;
}
function keys9(value, names) {
  require35(same26(Object.keys(object25(value)).sort(), names.toSorted()), 'private schema differs');
}
function bytes(value, size) {
  require35(
    typeof value === 'string' && value.length <= 4096 && /^[A-Za-z0-9_-]+$/.test(value),
    'key or signature encoding differs',
  );
  const raw = Buffer.from(value, 'base64url');
  require35(
    raw.toString('base64url') === value && (size === undefined || raw.length === size),
    'key or signature bytes differ',
  );
  return raw;
}
async function optional3(store, name) {
  try {
    return await store.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
function createAzureOperationalAcquisitionCustody(
  request,
  storage,
  definition,
  trustedIssuerSha256,
  originalIssuerPublication,
  loadOriginalSource,
) {
  const plan = structuredClone(request),
    owner = structuredClone(storage.owner),
    directory = storage.directory,
    family = definition.family,
    requestMatches = canonicalSnapshot(request);
  require35(
    family === 'network' || family === 'replacement' || family === 'replacement-readings',
    'distinct supported acquisition family required',
  );
  const keyName = `azure-${family}-observer-key.json`,
    anchorName = `azure-${family}-observer-issuer.json`,
    retiredName = `azure-${family}-observer-retired.json`,
    publicationPrefix = `azure-${family}-observation`,
    issuerPrefix = `azure-${family}-issuer`,
    lockName =
      family === 'network' ? '.azure-operational-acquisition-lock' : `.azure-${family}-operational-acquisition-lock`;
  require35(trustedIssuerSha256 === undefined || digest4(trustedIssuerSha256), 'retained issuer pin malformed');
  require35(
    originalIssuerPublication === undefined || typeof originalIssuerPublication === 'function',
    'owning issuer publisher malformed',
  );
  verifyAzureCePlan(plan);
  definition.validateSource(plan, owner);
  const methodNames = [
    'verifyContext',
    'validateSource',
    'validateIdentity',
    'validateReadings',
    'validatePurpose',
    'collectReadings',
  ];
  const callbacks = methodNames.map((name) => definition[name]);
  const seal = () => {
    require35(
      requestMatches(request) &&
        requestMatches(plan) &&
        storage.directory === directory &&
        same26(storage.owner, owner) &&
        definition.family === family &&
        methodNames.every((name, i) => definition[name] === callbacks[i]),
      'owning collector context changed',
    );
    definition.verifyContext();
  };
  const contract = guardAzureCeApplyObject(definition, seal, {}, ['family']),
    store = guardAzureCeApplyObject(storage, seal, {}, ['owner', 'directory']);
  const acquired = new Map();
  let anchored = trustedIssuerSha256;
  const operation = async (signal, work, exclusive = true) => {
    const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
    const step = async (task) => {
      seal();
      deadline.throwIfAborted();
      const abort = Promise.withResolvers(),
        onAbort = () => abort.reject(deadline.reason);
      deadline.addEventListener('abort', onAbort, { once: true });
      try {
        const result = await Promise.race([Promise.resolve().then(task), abort.promise]);
        seal();
        deadline.throwIfAborted();
        return result;
      } finally {
        deadline.removeEventListener('abort', onAbort);
      }
    };
    await step(() => store.verify());
    if (!exclusive) return step(() => work(deadline));
    const claiming = acquireProcessLock(`${directory}/${lockName}`);
    let unlock;
    try {
      unlock = await step(() => claiming);
    } catch (error) {
      await claiming.then(
        (release) => release(),
        () => {},
      );
      throw error;
    }
    try {
      return await step(() => work(deadline));
    } finally {
      await unlock();
    }
  };
  const issuer = async (signal, create) => {
    let pointer = await optional3(store, anchorName);
    signal.throwIfAborted();
    const initializing = pointer === undefined && create && anchored === undefined;
    if (pointer === undefined && !create && anchored !== undefined)
      pointer = { schemaVersion: 1, owner, issuerSha256: anchored };
    if (pointer === undefined && create) {
      let secret = await optional3(store, keyName);
      if (secret === undefined) {
        require35(anchored === undefined, 'original retained signing material missing');
        signal.throwIfAborted();
        const pair = generateKeyPairSync2('ed25519', {
          publicKeyEncoding: { type: 'spki', format: 'der' },
          privateKeyEncoding: { type: 'pkcs8', format: 'der' },
        });
        secret = {
          schemaVersion: 1,
          owner,
          publicKey: pair.publicKey.toString('base64url'),
          signingMaterial: pair.privateKey.toString('base64url'),
        };
        await store.write(keyName, secret, signal);
      }
      keys9(secret, ['schemaVersion', 'owner', 'publicKey', 'signingMaterial']);
      const value = object25(secret);
      require35(value.schemaVersion === 1 && same26(value.owner, owner), 'private signing owner differs');
      const privateKey = createPrivateKey({ key: bytes(value.signingMaterial), type: 'pkcs8', format: 'der' });
      require35(
        privateKey.asymmetricKeyType === 'ed25519' &&
          createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).equals(bytes(value.publicKey)),
        'private signing key differs',
      );
      const record = {
        schemaVersion: 1,
        kind: `azure-${family}-operational-issuer`,
        owner,
        publicKey: value.publicKey,
      };
      require35(anchored === undefined || canonicalSha256(record) === anchored, 'retained issuer private key differs');
      if (anchored !== undefined) await readImmutableCeReceipt(store, issuerPrefix, anchored, signal);
      const publication = await publishImmutableCeReceipt(store, issuerPrefix, record, signal);
      if (originalIssuerPublication) {
        await originalIssuerPublication(publication.publicationSha256, signal);
        signal.throwIfAborted();
      }
      pointer = { schemaVersion: 1, owner, issuerSha256: publication.publicationSha256 };
      await store.write(anchorName, pointer, signal);
    }
    keys9(pointer, ['schemaVersion', 'owner', 'issuerSha256']);
    const anchor = object25(pointer);
    require35(
      anchor.schemaVersion === 1 &&
        same26(anchor.owner, owner) &&
        digest4(anchor.issuerSha256) &&
        (initializing || (anchored !== undefined && anchored === anchor.issuerSha256)),
      'pinned issuer differs',
    );
    const publication = await readImmutableCeReceipt(store, issuerPrefix, anchor.issuerSha256, signal);
    const record = object25(publication.record);
    keys9(record, ['schemaVersion', 'kind', 'owner', 'publicKey']);
    require35(
      record.schemaVersion === 1 && record.kind === `azure-${family}-operational-issuer` && same26(record.owner, owner),
      'issuer ownership differs',
    );
    const publicKey = createPublicKey({ key: bytes(record.publicKey), type: 'spki', format: 'der' });
    require35(publicKey.asymmetricKeyType === 'ed25519', 'issuer algorithm differs');
    anchored = anchor.issuerSha256;
    return { digest: anchored, publicKey, record };
  };
  const signingKey = async (record) => {
    const raw = object25(await store.read(keyName));
    keys9(raw, ['schemaVersion', 'owner', 'publicKey', 'signingMaterial']);
    require35(
      raw.schemaVersion === 1 && same26(raw.owner, owner) && raw.publicKey === record.publicKey,
      'signing owner or issuer differs',
    );
    const key = createPrivateKey({ key: bytes(raw.signingMaterial), type: 'pkcs8', format: 'der' });
    require35(
      key.asymmetricKeyType === 'ed25519' &&
        createPublicKey(key).export({ type: 'spki', format: 'der' }).equals(bytes(record.publicKey)),
      'signing material differs',
    );
    return key;
  };
  const authenticateObservation = (original, published, source) => {
    verifyAzureCePlan(source);
    contract.validateSource(source, owner);
    const record = object25(published.record);
    keys9(record, ['payload', 'signature']);
    const payload = object25(record.payload);
    keys9(payload, ['schemaVersion', 'kind', 'issuerSha256', 'invocationId', 'purpose', 'identity', 'readings']);
    const identity = object25(payload.identity),
      readings = object25(payload.readings);
    contract.validateIdentity(identity, source, owner);
    contract.validatePurpose(payload.purpose);
    require35(
      payload.schemaVersion === 1 &&
        payload.kind === `azure-${family}-operational-acquisition` &&
        payload.issuerSha256 === original.digest &&
        typeof payload.invocationId === 'string' &&
        /^[a-f0-9-]{36}$/.test(payload.invocationId) &&
        verify(null, Buffer.from(canonicalStringify(payload)), original.publicKey, bytes(record.signature, 64)),
      'original execution signature differs from source',
    );
    contract.validateReadings(readings, identity, source, owner);
    return { payload, identity, readings };
  };
  const retirementMarker = (marker, original) => {
    keys9(marker, ['payload', 'signature']);
    const value = object25(marker),
      expected = {
        schemaVersion: 1,
        kind: `azure-${family}-observer-key-retired`,
        owner,
        issuerSha256: original.digest,
      };
    require35(
      same26(value.payload, expected) &&
        verify(null, Buffer.from(canonicalStringify(expected)), original.publicKey, bytes(value.signature, 64)),
      'key retirement provenance differs',
    );
  };
  const inspectRetirementInventory = async (deadline) => {
    const names = async () =>
      (await readdir3(directory))
        .filter((name) =>
          [`azure-${family}-observer-`, `azure-${family}-issuer-`, `azure-${family}-observation-`].some((prefix) =>
            name.startsWith(prefix),
          ),
        )
        .sort();
    const root = await lstat3(directory);
    const rootIdentity = `${root.dev}:${root.ino}:${root.birthtimeMs}`;
    const before = await names(),
      original = await issuer(deadline, false);
    const artifacts = [];
    const invocations = new Set();
    for (const path of before) {
      deadline.throwIfAborted();
      seal();
      const native = await readAzureTerraformParentPrivateFile(join3(directory, path), deadline);
      let record,
        schema,
        provenance,
        action = 'preserve';
      if (path === keyName) {
        await signingKey(original.record);
        record = await store.read(path);
        schema = `azure-${family}-observer-signing-key-v1`;
        action = 'delete';
        provenance = { owner, issuerSha256: original.digest };
      } else if (path === anchorName) {
        record = await store.read(path);
        require35(same26(record, { schemaVersion: 1, owner, issuerSha256: original.digest }), 'issuer pointer differs');
        schema = `azure-${family}-observer-issuer-pointer-v1`;
        provenance = { owner, issuerSha256: original.digest };
      } else if (path === retiredName) {
        record = await store.read(path);
        retirementMarker(record, original);
        schema = `azure-${family}-observer-retirement-v1`;
        provenance = record;
      } else if (path === `${issuerPrefix}-${original.digest}.json`) {
        record = (await readImmutableCeReceipt(store, issuerPrefix, original.digest, deadline)).record;
        require35(same26(record, original.record), 'original issuer record changed');
        schema = `azure-${family}-operational-issuer-v1`;
        provenance = { owner, issuerSha256: original.digest };
      } else {
        const match = new RegExp(`^${publicationPrefix}-([a-f0-9]{64})\\.json$`).exec(path);
        require35(match, 'unclassified or incomplete observer artifact');
        const published = await readImmutableCeReceipt(store, publicationPrefix, match[1], deadline);
        const sourceSha = object25(object25(object25(published.record).payload).identity).planSha256;
        require35(digest4(sourceSha), 'observation source digest malformed');
        const source = loadOriginalSource ? await loadOriginalSource(sourceSha, deadline) : plan;
        deadline.throwIfAborted();
        seal();
        require35(source.planSha256 === sourceSha, 'original observation source unavailable');
        const authenticated = authenticateObservation(original, published, source);
        require35(!invocations.has(authenticated.payload.invocationId), 'duplicate acquisition invocation');
        invocations.add(authenticated.payload.invocationId);
        record = published.record;
        schema = `azure-${family}-operational-acquisition-v1`;
        provenance = {
          owner,
          sourcePlanSha256: sourceSha,
          issuerSha256: original.digest,
          identitySha256: canonicalSha256(authenticated.identity),
          invocationId: authenticated.payload.invocationId,
          purpose: authenticated.payload.purpose,
        };
      }
      require35(
        same26(parseNodeHealthJson(native.bytes.toString('utf8')), record),
        'native observer packet differs from semantic record',
      );
      artifacts.push({
        path,
        identity: native.identity,
        sha256: createHash21('sha256').update(native.bytes).digest('hex'),
        action,
        schema,
        packetSha256: canonicalSha256(record),
        semanticProvenanceSha256: canonicalSha256(provenance),
      });
    }
    require35(same26(before, await names()), 'observer namespace changed during authentication');
    for (const file of artifacts) {
      deadline.throwIfAborted();
      const native = await readAzureTerraformParentPrivateFile(join3(directory, file.path), deadline);
      require35(
        native.identity === file.identity &&
          createHash21('sha256').update(native.bytes).digest('hex') === file.sha256 &&
          canonicalSha256(await store.read(file.path)) === file.packetSha256,
        'authenticated observer record changed',
      );
    }
    require35(
      (await issuer(deadline, false)).digest === original.digest && same26(before, await names()),
      'observer inventory changed',
    );
    const finalRoot = await lstat3(directory);
    require35(
      `${finalRoot.dev}:${finalRoot.ino}:${finalRoot.birthtimeMs}` === rootIdentity,
      'observer directory changed',
    );
    return {
      status: 'authenticated',
      scope: 'owning-observer-artifact-disposition',
      owner: structuredClone(owner),
      issuerSha256: original.digest,
      artifacts,
      signingMaterialPresent: before.includes(keyName),
      operationalAcceptance: 'unknown',
      canSatisfyInterfaceMutationGate: false,
    };
  };
  const unchangedProof = (before, after) => {
    const proof = (inventory) =>
      inventory.artifacts.filter((file) => file.path !== keyName && file.path !== retiredName);
    require35(same26(proof(before), proof(after)), 'historical observer proof changed during retirement');
  };
  return {
    authenticateRetirementInventory(signal) {
      return operation(signal, inspectRetirementInventory);
    },
    async collect(identity, purpose, signal, collectTraffic = false) {
      const expected = structuredClone(identity),
        expectedSha = canonicalSha256(identity),
        started = performance.now();
      const active = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
      const readings = await operation(
        active,
        async (deadline) => {
          contract.validatePurpose(purpose);
          contract.validateIdentity(expected, plan, owner);
          require35(canonicalSha256(identity) === expectedSha, 'requested acquisition identity changed');
          require35((await optional3(store, retiredName)) === undefined, 'signing key retired');
          return contract.collectReadings(expected, purpose, deadline, collectTraffic);
        },
        false,
      );
      return operation(active, async (deadline) => {
        contract.validatePurpose(purpose);
        contract.validateIdentity(expected, plan, owner);
        require35(
          same26(expected.owner, owner) &&
            expected.planSha256 === plan.planSha256 &&
            canonicalSha256(identity) === expectedSha,
          'requested acquisition identity differs',
        );
        require35((await optional3(store, retiredName)) === undefined, 'signing key retired');
        contract.validateReadings(readings, expected, plan, owner);
        require35(canonicalSha256(identity) === expectedSha, 'acquired identity changed');
        const original = await issuer(deadline, true),
          key = await signingKey(original.record),
          invocationId = randomUUID2();
        const payload = {
          schemaVersion: 1,
          kind: `azure-${family}-operational-acquisition`,
          issuerSha256: original.digest,
          invocationId,
          purpose,
          identity: expected,
          readings,
        };
        const signature = sign(null, Buffer.from(canonicalStringify(payload)), key).toString('base64url');
        const publication = await publishImmutableCeReceipt(store, publicationPrefix, { payload, signature }, deadline);
        require35(
          canonicalSha256(identity) === expectedSha &&
            (await issuer(deadline, false)).digest === original.digest &&
            verify(null, Buffer.from(canonicalStringify(payload)), original.publicKey, bytes(signature, 64)),
          'execution publication changed',
        );
        acquired.set(invocationId, {
          publicationSha256: publication.publicationSha256,
          identitySha256: expectedSha,
          started,
        });
        return {
          schemaVersion: 1,
          kind: `azure-${family}-operational-acquisition-reference`,
          owner: structuredClone(owner),
          planSha256: plan.planSha256,
          identitySha256: expectedSha,
          invocationId,
          purpose,
          issuerSha256: original.digest,
          publicationSha256: publication.publicationSha256,
        };
      });
    },
    async authenticate(reference, identity, purpose, mode, signal) {
      const receipt = structuredClone(reference),
        expected = structuredClone(identity),
        referenceSha = canonicalSha256(reference),
        identitySha = canonicalSha256(identity);
      return operation(signal, async (deadline) => {
        keys9(receipt, [
          'schemaVersion',
          'kind',
          'owner',
          'planSha256',
          'identitySha256',
          'invocationId',
          'purpose',
          'issuerSha256',
          'publicationSha256',
        ]);
        contract.validatePurpose(purpose);
        contract.validateIdentity(expected, plan, owner);
        require35(
          ['current', 'historical'].includes(mode) &&
            receipt.purpose === purpose &&
            receipt.schemaVersion === 1 &&
            receipt.kind === `azure-${family}-operational-acquisition-reference` &&
            same26(receipt.owner, owner) &&
            same26(expected.owner, owner) &&
            receipt.planSha256 === plan.planSha256 &&
            expected.planSha256 === plan.planSha256 &&
            receipt.identitySha256 === identitySha &&
            digest4(receipt.issuerSha256) &&
            digest4(receipt.publicationSha256) &&
            /^[a-f0-9-]{36}$/.test(receipt.invocationId),
          'receipt reference identity differs',
        );
        const original = await issuer(deadline, false);
        require35(receipt.issuerSha256 === original.digest, 'receipt issuer differs');
        const published = await readImmutableCeReceipt(store, publicationPrefix, receipt.publicationSha256, deadline);
        const { payload, readings } = authenticateObservation(original, published, plan);
        require35(
          payload.invocationId === receipt.invocationId &&
            payload.purpose === purpose &&
            same26(payload.identity, expected),
          'original execution signature differs',
        );
        if (mode === 'current') {
          const invocation = acquired.get(receipt.invocationId);
          require35(
            invocation &&
              invocation.publicationSha256 === receipt.publicationSha256 &&
              invocation.identitySha256 === identitySha &&
              performance.now() - invocation.started <= 180000 &&
              (await optional3(store, retiredName)) === undefined,
            'current acquisition unavailable',
          );
        }
        require35(
          canonicalSha256(reference) === referenceSha &&
            canonicalSha256(identity) === identitySha &&
            (await issuer(deadline, false)).digest === original.digest,
          'authentication context changed',
        );
        return {
          status: 'authenticated',
          scope: `owning-${family}-operational-acquisition`,
          mode,
          purpose,
          readings: structuredClone(readings),
          evidenceSha256: receipt.publicationSha256,
          originalSampleFreshness: 'unqualified',
          operationalAcceptance: 'unknown',
          canSatisfyInterfaceMutationGate: false,
        };
      });
    },
    async retireSigningMaterial(signal) {
      return operation(signal, async (deadline) => {
        const before = await inspectRetirementInventory(deadline),
          original = await issuer(deadline, false);
        let marker = await optional3(store, retiredName);
        if (marker === undefined) {
          const key = await signingKey(original.record),
            payload = {
              schemaVersion: 1,
              kind: `azure-${family}-observer-key-retired`,
              owner,
              issuerSha256: original.digest,
            };
          marker = {
            payload,
            signature: sign(null, Buffer.from(canonicalStringify(payload)), key).toString('base64url'),
          };
          await store.write(retiredName, marker, deadline);
        }
        retirementMarker(marker, original);
        unchangedProof(before, await inspectRetirementInventory(deadline));
        const key = await optional3(store, keyName);
        if (key !== undefined) {
          await signingKey(original.record);
          deadline.throwIfAborted();
          await store.remove(keyName);
        }
        require35(
          (await optional3(store, keyName)) === undefined &&
            same26(await store.read(retiredName), marker) &&
            (await issuer(deadline, false)).digest === original.digest,
          'signing material retirement incomplete',
        );
        const artifactInventory = await inspectRetirementInventory(deadline);
        unchangedProof(before, artifactInventory);
        acquired.clear();
        return {
          status: 'retired',
          scope: 'operational-observer-signing-material',
          issuerSha256: original.digest,
          historicalPublicProofRetained: true,
          artifactInventory,
        };
      });
    },
  };
}

// plugins/azure/src/ce/network-replacement-readings-provenance.ts
var same27 = canonicalEqual;
var sha9 = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function require36(value, message) {
  if (!value) throw Error(`Azure replacement acquisition provenance: ${message}`);
}
function object26(value) {
  require36(value && typeof value === 'object' && !Array.isArray(value), 'complete replacement record required');
  return value;
}
function createAzureReplacementReadingsAcquisitionCollector(
  request,
  transport,
  cloud,
  storage,
  terraform,
  dependencies,
  trustedIssuerSha256,
  originalIssuerPublication,
  loadOriginalSource,
) {
  const plan = structuredClone(request),
    owner = structuredClone(storage.owner),
    directory = storage.directory,
    requestMatches = canonicalSnapshot(request);
  const validateSource = (source, expectedOwner) => {
    verifyAzureCePlan(source);
    verifyAzureTerraformNetworkReplacementProfile(source);
    require36(
      source.engine === 'terraform' && same27(azureUpgradeBinding(source).owner, expectedOwner),
      'owning Terraform replacement plan required',
    );
  };
  validateSource(plan, owner);
  const {
    loaders: originalLoaders,
    qualifyHistorical: historical,
    qualifyReplacementCompleted: completed,
  } = dependencies;
  const collaborators = [
    [
      transport,
      [
        'observeOwnedSite',
        'ownedSiteConfiguration',
        'observeRegistrations',
        'observeAzureInterfaces',
        'observeNodeReadiness',
        'observeForwardingRoutes',
        'observeBgpSessions',
        'observeBgpRoutes',
      ],
    ],
    [cloud, ['exec']],
    [storage, ['verify', 'read', 'write']],
    [terraform, ['readConfiguration', 'readConfigurationSha256']],
    [originalLoaders, ['loadSource']],
  ];
  const callbacks = collaborators.flatMap(([target, names]) =>
    names.map((name) => {
      const object = target;
      return { object, name, callback: object[name] };
    }),
  );
  const seal = () =>
    require36(
      requestMatches(request) &&
        requestMatches(plan) &&
        storage.directory === directory &&
        same27(storage.owner, owner) &&
        transport.engine === 'terraform' &&
        dependencies.loaders === originalLoaders &&
        dependencies.qualifyHistorical === historical &&
        dependencies.qualifyReplacementCompleted === completed &&
        callbacks.every((row) => row.object[row.name] === row.callback),
      'owning replacement readings collector context changed',
    );
  return createAzureOperationalAcquisitionCustody(
    request,
    storage,
    {
      family: 'replacement-readings',
      verifyContext: seal,
      validateSource,
      validatePurpose(purpose) {
        require36(purpose === 'preflight' || purpose === 'final', 'replacement purpose differs');
      },
      validateIdentity(raw, source, expectedOwner) {
        const identity = object26(raw),
          site = object26(identity.site),
          nodes = object26(identity.nodes);
        require36(
          same27(
            Object.keys(identity).sort(),
            [
              'owner',
              'planSha256',
              'journalSha256',
              'sourceBindingSha256',
              'configurationSha256',
              'site',
              'phase',
              'nodes',
            ].sort(),
          ) &&
            identity.planSha256 === source.planSha256 &&
            same27(identity.owner, expectedOwner) &&
            sha9(identity.journalSha256) &&
            sha9(identity.sourceBindingSha256) &&
            sha9(identity.configurationSha256) &&
            same27(Object.keys(site).sort(), ['siteConfigurationSha256', 'siteUid']) &&
            sha9(site.siteConfigurationSha256) &&
            typeof site.siteUid === 'string' &&
            site.siteUid.trim() &&
            (identity.phase === 'intact' || identity.phase === 'launched') &&
            same27(
              Object.keys(nodes).sort(),
              Array.from({ length: source.topology.nodeCount }, (_, i) => String(i + 1)).sort(),
            ),
          'entire resolved replacement identity required',
        );
      },
      validateReadings(raw, expected, source, expectedOwner) {
        const readings = object26(raw),
          expectedIdentity = object26(expected),
          physical = object26(readings.identity);
        require36(
          same27(
            Object.keys(readings).sort(),
            [
              'schemaVersion',
              'scope',
              'status',
              'owner',
              'planSha256',
              'purpose',
              'identity',
              'nodeReadiness',
              'forwarding',
              'bgp',
              'traffic',
              'operationalAcceptance',
              'startedAt',
              'completedAt',
            ].sort(),
          ) &&
            readings.schemaVersion === 1 &&
            readings.scope === 'current-replacement-operational-readings' &&
            (readings.status === 'observed' || readings.status === 'unknown') &&
            readings.operationalAcceptance === 'unknown' &&
            same27(readings.owner, expectedOwner) &&
            readings.planSha256 === source.planSha256 &&
            readings.purpose === (expectedIdentity.phase === 'intact' ? 'preflight' : 'final') &&
            physical.scope === 'replacement-registration-interface-identity' &&
            same27(physical.owner, expectedOwner) &&
            physical.planSha256 === source.planSha256 &&
            physical.journalSha256 === expectedIdentity.journalSha256 &&
            physical.sourceBindingSha256 === expectedIdentity.sourceBindingSha256 &&
            physical.configurationSha256 === expectedIdentity.configurationSha256 &&
            same27(physical.site, expectedIdentity.site) &&
            physical.phase === expectedIdentity.phase &&
            physical.purpose === readings.purpose &&
            physical.expectedIdentitySha256 === canonicalSha256(expected) &&
            physical.expectedInventorySha256 === canonicalSha256(expectedIdentity.nodes) &&
            typeof readings.startedAt === 'string' &&
            typeof readings.completedAt === 'string' &&
            Number.isFinite(Date.parse(readings.startedAt)) &&
            Number.isFinite(Date.parse(readings.completedAt)) &&
            Date.parse(readings.completedAt) >= Date.parse(readings.startedAt) &&
            Date.parse(readings.completedAt) - Date.parse(readings.startedAt) <= 180000,
          'signed current replacement readings scope or identity differs',
        );
      },
      collectReadings(identity, purpose, signal, collectTraffic) {
        return collectAzureReplacementOperationalReadings(
          plan,
          identity,
          transport,
          cloud,
          storage,
          terraform,
          dependencies,
          purpose,
          signal,
          collectTraffic,
        );
      },
    },
    trustedIssuerSha256,
    originalIssuerPublication,
    loadOriginalSource,
  );
}

// plugins/azure/src/ce/network-replacement-readings-session.ts
var toolType = 'azure-ce-replacement-readings-operational-issuer';
var suffix = `.${toolType}.log`;
var same28 = canonicalEqual;
var sha10 = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function require37(value, reason) {
  if (!value) throw Error(`Azure replacement readings issuer session: ${reason}`);
}
var nativeSessions = new WeakMap();
function assertAzureReplacementReadingsAcquisitionSession(session) {
  const authority = session && typeof session === 'object' ? nativeSessions.get(session) : undefined;
  require37(authority, 'genuine native acquisition session required');
  authority.seal();
  return structuredClone(authority.plan);
}
async function createAzureReplacementReadingsAcquisitionSession(
  request,
  runtime,
  api,
  store,
  terraform,
  dependencies,
  session,
  signal,
) {
  const plan = structuredClone(request),
    owner = structuredClone(store.owner),
    directory = session.getArtifactsDir(),
    sessionId = session.getSessionId(),
    privateDirectory = store.directory;
  require37(typeof directory === 'string' && directory.startsWith('/'), 'persistent native session required');
  verifyAzureTerraformNetworkReplacementProfile(plan);
  require37(
    plan.engine === 'terraform' &&
      plan.intent.operation === 'replace-node' &&
      same28(owner, azureUpgradeBinding(plan).owner),
    'owning network-bound replacement plan required',
  );
  const callbacks = [
    session.getSessionId,
    session.getArtifactsDir,
    session.getArtifactPath,
    session.saveArtifact,
    store.verify,
    store.read,
  ];
  const seal = () => {
    signal?.throwIfAborted();
    require37(
      same28(request, plan) &&
        same28(store.owner, owner) &&
        store.directory === privateDirectory &&
        session.getSessionId() === sessionId &&
        session.getArtifactsDir() === directory &&
        same28(owner, azureUpgradeBinding(plan).owner) &&
        callbacks.every(
          (fn, i) =>
            fn ===
            [
              session.getSessionId,
              session.getArtifactsDir,
              session.getArtifactPath,
              session.saveArtifact,
              store.verify,
              store.read,
            ][i],
        ),
      'owning session changed',
    );
  };
  const identities = new Map();
  let rootIdentity, privateIdentity, retained;
  const bounded = async (work, parent) => {
    const active = AbortSignal.any([
      AbortSignal.timeout(180000),
      ...(signal ? [signal] : []),
      ...(parent ? [parent] : []),
    ]);
    const step = async (task) => {
      seal();
      active.throwIfAborted();
      const aborted = Promise.withResolvers(),
        onAbort = () => aborted.reject(active.reason);
      active.addEventListener('abort', onAbort, { once: true });
      try {
        const value = await Promise.race([Promise.resolve().then(task), aborted.promise]);
        seal();
        active.throwIfAborted();
        return value;
      } finally {
        active.removeEventListener('abort', onAbort);
      }
    };
    return step(() => work(active));
  };
  const verifyPrivateDirectory = async () => {
    const root = await lstat4(privateDirectory);
    require37(
      root.isDirectory() &&
        !root.isSymbolicLink() &&
        root.uid === process.getuid?.() &&
        (root.mode & 63) === 0 &&
        (await realpath3(privateDirectory)) === privateDirectory,
      'private signing directory custody differs',
    );
    const identity = `${root.dev}:${root.ino}:${root.birthtimeMs}`;
    require37(privateIdentity === undefined || privateIdentity === identity, 'private signing directory replaced');
    privateIdentity = identity;
  };
  const readPins = async (active) => {
    active.throwIfAborted();
    seal();
    await verifyPrivateDirectory();
    await store.verify();
    const root = await lstat4(directory);
    require37(
      root.isDirectory() &&
        !root.isSymbolicLink() &&
        root.uid === process.getuid?.() &&
        (root.mode & 18) === 0 &&
        (await realpath3(directory)) === directory,
      'native session directory custody differs',
    );
    const identity = `${root.dev}:${root.ino}:${root.birthtimeMs}`;
    require37(rootIdentity === undefined || rootIdentity === identity, 'native session directory replaced');
    rootIdentity = identity;
    const original = await loadPlanArtifact(session, plan.planId, plan.planSha256);
    require37(same28(original.plan, plan), 'owning public source differs');
    const names = (await readdir4(directory)).filter((n) => n.endsWith(suffix)).sort();
    const observed = [];
    for (const name of names) {
      active.throwIfAborted();
      seal();
      const path = join4(directory, name),
        file = await open3(path, constants3.O_RDONLY | constants3.O_NOFOLLOW);
      let raw;
      try {
        const before = await file.stat();
        require37(
          before.isFile() &&
            before.uid === process.getuid?.() &&
            before.nlink === 1 &&
            (before.mode & 18) === 0 &&
            before.size <= 131072,
          'issuer artifact custody differs',
        );
        raw = await file.readFile('utf8');
        const after = await file.stat(),
          named = await lstat4(path);
        const fileIdentity = (v) =>
          `${v.dev}:${v.ino}:${v.size}:${v.mtimeMs}:${v.ctimeMs}:${v.birthtimeMs}:${v.uid}:${v.nlink}:${v.mode}`;
        require37(
          named.isFile() &&
            !named.isSymbolicLink() &&
            fileIdentity(before) === fileIdentity(after) &&
            fileIdentity(after) === fileIdentity(named),
          'issuer artifact changed while read',
        );
        const custody = canonicalSha256({ identity: fileIdentity(after), raw });
        require37(!identities.has(path) || identities.get(path) === custody, 'original issuer artifact changed');
        identities.set(path, custody);
      } finally {
        await file.close();
      }
      const row = parseNodeHealthJson(raw);
      require37(
        same28(
          Object.keys(row).sort(),
          ['engine', 'issuerSha256', 'kind', 'owner', 'planId', 'planSha256', 'schemaVersion'].sort(),
        ) &&
          row.schemaVersion === 1 &&
          row.engine === 'terraform' &&
          row.kind === 'azure-replacement-readings-operational-issuer-binding' &&
          sha10(row.issuerSha256) &&
          sha10(row.planSha256) &&
          typeof row.planId === 'string',
        'issuer binding schema differs',
      );
      if (!same28(row.owner, owner)) continue;
      const source = await loadPlanArtifact(session, row.planId, row.planSha256);
      verifyAzureTerraformNetworkReplacementProfile(source.plan);
      require37(
        source.plan.engine === 'terraform' &&
          source.plan.intent.operation === 'replace-node' &&
          same28(azureUpgradeBinding(source.plan).owner, owner),
        'issuer source ownership differs',
      );
      observed.push(row.issuerSha256);
    }
    require37(
      same28(names, (await readdir4(directory)).filter((n) => n.endsWith(suffix)).sort()),
      'issuer namespace changed while read',
    );
    const final = await lstat4(directory);
    require37(
      final.isDirectory() &&
        !final.isSymbolicLink() &&
        final.uid === process.getuid?.() &&
        (final.mode & 18) === 0 &&
        `${final.dev}:${final.ino}:${final.birthtimeMs}` === rootIdentity &&
        (await realpath3(directory)) === directory,
      'native session directory changed',
    );
    active.throwIfAborted();
    seal();
    await verifyPrivateDirectory();
    const pins = [...new Set(observed)];
    require37(pins.length <= 1, 'conflicting original issuer pins');
    return pins[0];
  };
  retained = await bounded(readPins);
  let pointer;
  try {
    pointer = await store.read('azure-replacement-readings-observer-issuer.json');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  require37(pointer === undefined || retained !== undefined, 'original public issuer pin unavailable');
  const originalIssuerPublication = async (issuerSha256, active) => {
    require37(sha10(issuerSha256) && (retained === undefined || retained === issuerSha256), 'original issuer changed');
    const before = await readPins(active);
    require37(before === undefined || before === issuerSha256, 'published issuer changed');
    if (before === undefined) {
      const record = {
        schemaVersion: 1,
        kind: 'azure-replacement-readings-operational-issuer-binding',
        engine: 'terraform',
        owner,
        planId: plan.planId,
        planSha256: plan.planSha256,
        issuerSha256,
      };
      const id = await session.saveArtifact(JSON.stringify(record), toolType);
      require37(typeof id === 'string' && id.length > 0, 'original issuer publication not acknowledged');
      const path = await session.getArtifactPath(id);
      require37(
        typeof path === 'string' && dirname2(path) === directory && path.endsWith(suffix),
        'original issuer publication path differs',
      );
    }
    require37((await readPins(active)) === issuerSha256, 'original issuer publication unavailable');
    retained = issuerSha256;
  };
  const collector = createAzureReplacementReadingsAcquisitionCollector(
    request,
    runtime,
    api,
    store,
    terraform,
    dependencies,
    retained,
    originalIssuerPublication,
    async (planSha256, active) => {
      active.throwIfAborted();
      seal();
      const source = await loadPlanArtifact(session, `azure-ce-${planSha256.slice(0, 24)}`, planSha256);
      verifyAzureTerraformNetworkReplacementProfile(source.plan);
      active.throwIfAborted();
      seal();
      require37(
        source.plan.engine === 'terraform' &&
          source.plan.intent.operation === 'replace-node' &&
          same28(azureUpgradeBinding(source.plan).owner, owner),
        'original observation source ownership differs',
      );
      return source.plan;
    },
  );
  if (pointer !== undefined) {
    await bounded(async (active) => {
      const original = await collector.authenticateRetirementInventory(active);
      require37(
        original.issuerSha256 === retained && (await readPins(active)) === retained,
        'original public issuer does not match authenticated private custody',
      );
    });
  }
  const check = async (active) => {
    require37((await readPins(active)) === retained, 'original public issuer binding changed');
  };
  const facade = Object.freeze({
    authenticateRetirementInventory(parent) {
      return bounded(async (active) => {
        require37(retained !== undefined, 'original public issuer pin unavailable');
        await check(active);
        const result = await collector.authenticateRetirementInventory(active);
        await check(active);
        return result;
      }, parent);
    },
    collect(...args) {
      return bounded(async (active) => {
        await check(active);
        const result = await collector.collect(args[0], args[1], active, args[3]);
        await check(active);
        require37(retained === result.issuerSha256, 'acquisition issuer was not published');
        return result;
      }, args[2]);
    },
    authenticate(...args) {
      return bounded(async (active) => {
        require37(retained !== undefined, 'original public issuer pin unavailable');
        await check(active);
        const result = await collector.authenticate(args[0], args[1], args[2], args[3], active);
        await check(active);
        return result;
      }, args[4]);
    },
    retireSigningMaterial(parent) {
      return bounded(async (active) => {
        require37(retained !== undefined, 'original public issuer pin unavailable');
        await check(active);
        const result = await collector.retireSigningMaterial(active);
        await check(active);
        return result;
      }, parent);
    },
  });
  nativeSessions.set(facade, { plan, seal });
  return facade;
}

// plugins/azure/src/ce/network-replacement-readings-acceptance.ts
var object27 = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
var rows2 = (value) => (Array.isArray(value) ? value.map(object27) : []);
var sha11 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
var text2 = (value) => typeof value === 'string' && value.trim().length > 0;
function require38(value, message) {
  if (!value) throw Error(`Replacement readings acceptance: ${message}`);
}

class AzureReplacementReadingsAcceptanceUnavailable extends Error {
  evidence;
  constructor(evidence) {
    super(`Replacement operational evidence remains unqualified: ${evidence.missing.join(', ')}`);
    this.evidence = evidence;
  }
}
function createAzureReplacementReadingsAcceptance(session) {
  const plan = assertAzureReplacementReadingsAcquisitionSession(session),
    binding = azureUpgradeBinding(plan),
    profile = verifyAzureTerraformNetworkReplacementProfile(plan),
    { collect, authenticate } = session;
  const seal = () =>
    require38(
      canonicalEqual(assertAzureReplacementReadingsAcquisitionSession(session), plan) &&
        session.collect === collect &&
        session.authenticate === authenticate,
      'native session changed',
    );
  const inspect = async (receipt, identity, mode, signal) => {
    signal?.throwIfAborted();
    seal();
    require38(mode === 'current' || mode === 'historical', 'exact authentication mode required');
    const purpose = object27(receipt).purpose;
    require38(
      (purpose === 'preflight' && identity.phase === 'intact') ||
        (purpose === 'final' && identity.phase === 'launched'),
      'exact acquisition purpose and phase required',
    );
    const expected = structuredClone(identity),
      referenceSha256 = canonicalSha256(receipt),
      identitySha256 = canonicalSha256(identity);
    const acquired = await authenticate.call(session, structuredClone(receipt), expected, purpose, mode, signal);
    seal();
    signal?.throwIfAborted();
    require38(
      canonicalSha256(receipt) === referenceSha256 &&
        canonicalSha256(identity) === identitySha256 &&
        canonicalSha256(expected) === identitySha256 &&
        acquired.status === 'authenticated' &&
        acquired.scope === 'owning-replacement-readings-operational-acquisition' &&
        acquired.mode === mode &&
        acquired.purpose === purpose &&
        sha11(acquired.evidenceSha256),
      'authenticated acquisition changed',
    );
    const readings = object27(acquired.readings),
      physical = object27(readings.identity),
      readiness = object27(readings.nodeReadiness),
      forwarding = object27(readings.forwarding),
      bgp = object27(readings.bgp),
      traffic = object27(readings.traffic);
    require38(
      canonicalEqual(expected.owner, binding.owner) &&
        expected.planSha256 === plan.planSha256 &&
        canonicalEqual(readings.owner, expected.owner) &&
        readings.planSha256 === expected.planSha256 &&
        readings.purpose === purpose &&
        readings.scope === 'current-replacement-operational-readings' &&
        canonicalEqual(physical.owner, expected.owner) &&
        physical.planSha256 === expected.planSha256 &&
        physical.journalSha256 === expected.journalSha256 &&
        physical.sourceBindingSha256 === expected.sourceBindingSha256 &&
        physical.configurationSha256 === expected.configurationSha256 &&
        canonicalEqual(physical.site, expected.site) &&
        physical.phase === expected.phase &&
        physical.purpose === purpose &&
        physical.expectedIdentitySha256 === identitySha256 &&
        physical.expectedInventorySha256 === canonicalSha256(expected.nodes),
      'reading source or inventory differs',
    );
    const interfaces = rows2(physical.interfaces),
      registrations = rows2(object27(physical.registrations).nodes),
      nodes = rows2(readiness.nodes),
      missing = [];
    const completeInterfaces =
      interfaces.length === binding.nodes.length * plan.nics.length &&
      new Set(interfaces.map((row) => row.mac)).size === interfaces.length &&
      new Set(interfaces.map((row) => row.interfaceName)).size === interfaces.length &&
      new Set(interfaces.map((row) => `${row.node}/${row.device}`)).size === interfaces.length &&
      binding.nodes.every((node, i) =>
        plan.nics.every((nic) => {
          const wanted = expected.nodes[String(i + 1)]?.nics[String(nic.index)],
            matched = interfaces.filter((row) => row.node === node && row.role === nic.role && row.mac === wanted?.mac);
          return (
            wanted &&
            wanted.attachment === expected.nodes[String(i + 1)].resourceId &&
            matched.length === 1 &&
            matched[0].linkUp === true &&
            text2(matched[0].device) &&
            text2(matched[0].interfaceName)
          );
        }),
      );
    if (
      physical.status !== 'observed' ||
      physical.interfaceState !== 'observed' ||
      physical.canSatisfyInterfaceMutationGate !== true ||
      !completeInterfaces
    )
      missing.push('complete-current-up-interfaces');
    if (String(acquired.originalSampleFreshness) !== 'verified' || physical.freshness !== 'verified')
      missing.push('original-sample-freshness');
    if (
      readiness.status !== 'observed' ||
      readiness.readiness !== 'ready' ||
      readiness.scope !== 'all-replacement-node-vpm-readiness' ||
      !canonicalEqual(readiness.owner, expected.owner) ||
      readiness.planSha256 !== plan.planSha256 ||
      readiness.siteUid !== expected.site.siteUid ||
      readiness.expectedIdentitySha256 !== identitySha256 ||
      object27(physical.registrations).status !== 'observed' ||
      registrations.length !== binding.nodes.length ||
      nodes.length !== binding.nodes.length ||
      !binding.nodes.every((node, i) => {
        const vm = expected.nodes[String(i + 1)],
          registered = registrations.filter(
            (row) => row.node === node && row.instanceId === vm?.vmId && row.state === 'ONLINE',
          ),
          observed = nodes.filter((row) => row.node === node && row.instanceId === vm?.vmId);
        return (
          registered.length === 1 &&
          observed.length === 1 &&
          text2(registered[0].registration) &&
          observed[0].registration === registered[0].registration &&
          observed[0].status === 'observed' &&
          observed[0].state === 'PROVISIONED' &&
          observed[0].readiness === 'ready' &&
          sha11(observed[0].outputSha256) &&
          sha11(observed[0].bindingOutputSha256)
        );
      })
    )
      missing.push('all-replacement-node-readiness');
    if (readiness.nodeHealth !== 'healthy' || physical.nodeHealth !== 'healthy')
      missing.push('all-node-operational-health');
    if (
      forwarding.status !== 'observed' ||
      forwarding.scope !== 'replacement-reviewed-forwarding' ||
      !canonicalEqual(forwarding.owner, expected.owner) ||
      forwarding.planSha256 !== plan.planSha256 ||
      forwarding.retainedPlanSha256 !== profile.retainedPlanSha256 ||
      forwarding.expectedIdentitySha256 !== identitySha256 ||
      !sha11(forwarding.expectedRoutesSha256) ||
      forwarding.freshness !== 'verified' ||
      forwarding.interfaceNamespace !== 'verified' ||
      forwarding.operationalAcceptance !== 'verified'
    )
      missing.push('qualified-forwarding-scope-and-freshness');
    if (plan.routing.mode === 'route-server') {
      const exchange = object27(bgp.routeExchange),
        sessions = object27(bgp.sessions),
        routes = object27(bgp.routes);
      if (
        bgp.status !== 'observed' ||
        bgp.scope !== 'replacement-bgp-route-observations' ||
        !canonicalEqual(bgp.owner, expected.owner) ||
        bgp.planSha256 !== plan.planSha256 ||
        bgp.expectedIdentitySha256 !== identitySha256 ||
        exchange.status !== 'healthy' ||
        sessions.status !== 'healthy' ||
        sessions.expectedSessions !== binding.nodes.length * 2 ||
        sessions.establishedSessions !== sessions.expectedSessions ||
        rows2(sessions.sessions).length !== sessions.expectedSessions ||
        routes.status !== 'observed' ||
        routes.scope !== 'all-node-bgp-route-inventory' ||
        !sha11(routes.evidenceSha256)
      )
        missing.push('complete-bgp-route-exchange');
      if (
        bgp.originalSampleFreshness !== 'verified' ||
        sessions.originalSampleFreshness !== 'verified' ||
        routes.originalSampleFreshness !== 'verified'
      )
        missing.push('original-bgp-sample-freshness');
    } else if (bgp.status !== 'not-applicable' || bgp.reason !== 'route-server-unconfigured')
      missing.push('routing-applicability');
    if (
      plan.intent.ingress?.mode !== 'platform-http' ||
      traffic.status !== 'healthy' ||
      traffic.scope !== 'reviewed-vm-http-content-probe' ||
      traffic.planSha256 !== plan.planSha256 ||
      !text2(traffic.sampleId) ||
      !text2(traffic.checkpointKey) ||
      !sha11(traffic.checkpointSha256) ||
      !sha11(traffic.sourceIdentitySha256) ||
      !sha11(traffic.evidenceSha256)
    )
      missing.push('current-reviewed-traffic');
    return {
      status: missing.length ? 'unknown' : 'verified',
      interfaceState: String(physical.interfaceState ?? 'unknown'),
      evidenceSha256: acquired.evidenceSha256,
      missing,
    };
  };
  const qualifyCompletedOperational = async (receipt, identity, mode, signal) => {
    const evidence = await inspect(receipt, identity, mode, signal);
    if (evidence.status !== 'verified')
      throw new AzureReplacementReadingsAcceptanceUnavailable({ ...evidence, status: 'unknown' });
    return { status: 'verified', scope: 'node-interfaces-routing-traffic', evidenceSha256: evidence.evidenceSha256 };
  };
  const qualifyOperational = (receipt, identity, signal) =>
    qualifyCompletedOperational(receipt, identity, 'current', signal);
  return Object.freeze({
    collectOperational: async (identity, purpose, signal) => {
      signal?.throwIfAborted();
      seal();
      const reference = await collect.call(session, identity, purpose, signal, true);
      signal?.throwIfAborted();
      seal();
      return reference;
    },
    inspect,
    qualifyOperational,
    qualifyCompletedOperational,
  });
}

// plugins/azure/src/ce/terraform-outcome.ts
import { createHash as createHash22 } from 'node:crypto';
import { constants as constants4 } from 'node:fs';
import { lstat as lstat5, open as open4, readdir as readdir5, realpath as realpath4 } from 'node:fs/promises';
import { join as join5, resolve } from 'node:path';

var memory = new WeakMap();
async function saveAzureTerraformOutcome(session, result) {
  const id = await session.saveArtifact(JSON.stringify(result), 'azure-ce-terraform-checkpoint');
  if (!id) throw Error('Azure Terraform outcome artifact persistence failed; checkpoint is retained');
  const rows = memory.get(session) ?? [];
  rows.push(structuredClone(result));
  memory.set(session, rows);
  return id;
}

class AzureTerraformOutcomeAbsent extends Error {
  code = 'ENOENT';
  constructor() {
    super('Azure Terraform prior public execution outcome is absent');
  }
}
async function loadAzureTerraformOutcome(session, source, signal) {
  const original = structuredClone(source);
  verifyAzureCePlan(original);
  if (original.engine !== 'terraform') throw Error('Azure Terraform outcome requires its owning engine');
  const callbacks = [session.getSessionId, session.getArtifactsDir, session.getArtifactPath, session.saveArtifact];
  const sessionId = session.getSessionId(),
    directory = session.getArtifactsDir();
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    if (
      canonicalSha256(source) !== canonicalSha256(original) ||
      session.getSessionId() !== sessionId ||
      session.getArtifactsDir() !== directory ||
      callbacks.some(
        (callback, index) =>
          callback !==
          [session.getSessionId, session.getArtifactsDir, session.getArtifactPath, session.saveArtifact][index],
      )
    )
      throw Error('Azure Terraform public outcome context changed during inspection');
  };
  const step = async (task) => {
    seal();
    const canceled = Promise.withResolvers(),
      onAbort = () => canceled.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([task(), canceled.promise]);
      seal();
      return result;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const matches = (row) => row.planSha256 === original.planSha256 && row.planId === original.planId;
  seal();
  if (directory === null) {
    const snapshot = structuredClone(memory.get(session) ?? []);
    const outcome = snapshot.findLast(matches);
    seal();
    if (canonicalSha256(memory.get(session) ?? []) !== canonicalSha256(snapshot))
      throw Error('Azure Terraform memory outcome inventory changed');
    if (outcome) return structuredClone(outcome);
    throw Error('Azure Terraform prior public execution outcome is unavailable');
  }
  try {
    const rootIdentity = async () => {
      const stat = await step(() => lstat5(directory));
      if (
        !stat.isDirectory() ||
        stat.isSymbolicLink() ||
        stat.uid !== process.getuid?.() ||
        (await step(() => realpath4(directory))) !== resolve(directory)
      )
        throw Error('Azure Terraform public outcome directory identity differs');
      return `${stat.dev}:${stat.ino}:${stat.birthtimeMs}:${stat.uid}`;
    };
    const root = await rootIdentity();
    const names = async () =>
      (await step(() => readdir5(directory)))
        .filter((name) => name.endsWith('.azure-ce-terraform-checkpoint.log'))
        .sort()
        .reverse();
    const files = await names();
    const inspect = async (name) =>
      step(async () => {
        const path = join5(directory, name),
          file = await open4(path, constants4.O_RDONLY | constants4.O_NOFOLLOW);
        try {
          const before = await file.stat();
          if (
            !before.isFile() ||
            before.nlink !== 1 ||
            before.uid !== process.getuid?.() ||
            before.size > 32 * 1024 * 1024
          )
            throw Error('Azure Terraform public outcome packet identity differs');
          const bytes = await file.readFile(),
            after = await file.stat(),
            named = await lstat5(path);
          const identity = (stat) =>
            `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.birthtimeMs}:${stat.uid}:${stat.nlink}`;
          if (
            !named.isFile() ||
            named.isSymbolicLink() ||
            identity(before) !== identity(after) ||
            identity(before) !== identity(named) ||
            bytes.length !== before.size
          )
            throw Error('Azure Terraform public outcome packet changed during native read');
          let value;
          try {
            value = JSON.parse(bytes.toString());
          } catch {
            throw Error('Azure Terraform public outcome is malformed');
          }
          if (!value || typeof value !== 'object' || Array.isArray(value))
            throw Error('Azure Terraform public outcome is malformed');
          return {
            row: value,
            identity: identity(before),
            sha256: createHash22('sha256').update(bytes).digest('hex'),
          };
        } finally {
          await file.close();
        }
      });
    const packets = [];
    for (const name of files) packets.push({ name, ...(await inspect(name)) });
    for (const packet of packets) {
      const current = await inspect(packet.name);
      if (current.identity !== packet.identity || current.sha256 !== packet.sha256)
        throw Error('Azure Terraform public outcome inventory changed during inspection');
    }
    if (canonicalSha256(await names()) !== canonicalSha256(files) || (await rootIdentity()) !== root)
      throw Error('Azure Terraform public outcome namespace changed during inspection');
    seal();
    const outcome = packets.find((packet) => matches(packet.row));
    if (outcome) return structuredClone(outcome.row);
    throw new AzureTerraformOutcomeAbsent();
  } catch (error) {
    deadline.throwIfAborted();
    if (error instanceof AzureTerraformOutcomeAbsent) throw error;
    if (error.code === 'ENOENT')
      throw Error('Azure Terraform public outcome evidence is unavailable', { cause: error });
    throw error;
  }
}

// plugins/azure/src/ce/terraform-public-history-loaders.ts
async function createAzureTerraformPublicHistoryLoaders(original, session, store, signal) {
  const source = structuredClone(original),
    owner = structuredClone(store.owner),
    { directory, verify: verifyStore } = store;
  const callbacks = [session.getSessionId, session.getArtifactsDir, session.getArtifactPath, session.saveArtifact],
    sessionId = session.getSessionId(),
    publicDirectory = session.getArtifactsDir();
  const same = canonicalEqual;
  verifyAzureCePlan(source);
  if (
    source.engine !== 'terraform' ||
    source.intent.operation !== 'deploy' ||
    !same(azureUpgradeBinding(source).owner, owner)
  )
    throw Error('Azure public history requires its original owning Terraform deployment');
  const seal = () => {
    signal?.throwIfAborted();
    if (
      !same(original, source) ||
      !same(store.owner, owner) ||
      store.directory !== directory ||
      store.verify !== verifyStore ||
      session.getSessionId() !== sessionId ||
      session.getArtifactsDir() !== publicDirectory ||
      callbacks.some(
        (callback, index) =>
          callback !==
          [session.getSessionId, session.getArtifactsDir, session.getArtifactPath, session.saveArtifact][index],
      )
    )
      throw Error('Azure public history owning context changed');
  };
  const bounded = async (work) => {
    seal();
    const active = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
    const aborted = Promise.withResolvers(),
      onAbort = () => aborted.reject(active.reason);
    active.addEventListener('abort', onAbort, { once: true });
    try {
      active.throwIfAborted();
      const result = await Promise.race([work(active), aborted.promise]);
      active.throwIfAborted();
      seal();
      return result;
    } finally {
      active.removeEventListener('abort', onAbort);
    }
  };
  await bounded(() => verifyStore.call(store));
  const inventory = await bounded((active) => readAzureCePlanInventory(session, active));
  const plans = new Map(inventory.plans.map((envelope) => [envelope.plan.planSha256, structuredClone(envelope.plan)]));
  if (!plans.has(source.planSha256) || !same(plans.get(source.planSha256), source))
    throw Error('Azure public history original source is unresolved');
  const selected = (digest) => {
    seal();
    if (!/^[a-f0-9]{64}$/.test(digest)) throw Error('Azure public history execution identifier is unresolved');
    const plan = plans.get(digest);
    if (!plan) throw Error('Azure public history execution source is unresolved');
    verifyAzureCePlan(plan);
    if (plan.engine !== 'terraform' || !same(azureUpgradeBinding(plan), azureUpgradeBinding(source)))
      throw Error('Azure public history execution source belongs to a different deployment');
    return plan;
  };
  const inspect = async (active) => {
    await verifyStore.call(store);
    seal();
    const current = await readAzureCePlanInventory(session, active);
    if (current.sourceSha256 !== inventory.sourceSha256 || !same(current.plans, inventory.plans))
      throw Error('Azure public history frozen source inventory changed');
    seal();
  };
  return Object.freeze({
    async loadSource(digest) {
      const plan = selected(digest);
      await bounded(inspect);
      return structuredClone(plan);
    },
    async loadOutcome(request) {
      const plan = selected(request.planSha256);
      if (!same(request, plan)) throw Error('Azure public history requested outcome source differs');
      const requested = structuredClone(request);
      return bounded(async (active) => {
        await inspect(active);
        let outcome;
        try {
          outcome = await loadAzureTerraformOutcome(session, plan, active);
        } catch (error) {
          if (error instanceof AzureTerraformOutcomeAbsent) {
            await inspect(active);
            if (!same(request, requested))
              throw Error('Azure public history outcome request changed during inspection');
          }
          throw error;
        }
        await inspect(active);
        if (!same(request, requested)) throw Error('Azure public history outcome request changed during inspection');
        return structuredClone(outcome);
      });
    },
  });
}

// plugins/azure/src/ce/network-operational-session.ts
import { constants as constants5 } from 'node:fs';
import { lstat as lstat6, open as open5, readdir as readdir6, realpath as realpath5 } from 'node:fs/promises';
// plugins/azure/src/ce/effective-route.ts
import { isIP as isIP5 } from 'node:net';
import { dirname as dirname3, join as join6 } from 'node:path';

function require39(value, message) {
  if (!value) throw Error(`Azure effective route evidence: ${message}`);
}
function object28(value) {
  require39(value && typeof value === 'object' && !Array.isArray(value), 'malformed record');
  return value;
}
function cidr(value) {
  if (typeof value !== 'string') return false;
  const [address, prefix, extra] = value.split('/'),
    family = isIP5(address);
  return (
    !!family &&
    extra === undefined &&
    /^(?:0|[1-9][0-9]{0,2})$/.test(prefix ?? '') &&
    Number(prefix) <= (family === 4 ? 32 : 128)
  );
}
function strings(value, valid) {
  require39(
    Array.isArray(value) &&
      value.every((item) => typeof item === 'string' && valid(item)) &&
      new Set(value).size === value.length,
    'missing, malformed or duplicate array',
  );
  return [...value];
}
function parseAzureEffectiveRoutes(raw) {
  const response = object28(raw);
  require39(
    (response.nextLink === undefined || response.nextLink === null || response.nextLink === '') &&
      !['error', 'errors', 'nextPageToken'].some((key) => response[key] !== undefined && response[key] !== null) &&
      Array.isArray(response.value),
    'incomplete terminal route inventory',
  );
  const routes = response.value.map((rawRoute) => {
    const row = object28(rawRoute);
    require39(
      typeof row.source === 'string' &&
        typeof row.state === 'string' &&
        typeof row.nextHopType === 'string' &&
        ['Unknown', 'User', 'VirtualNetworkGateway', 'Default'].includes(row.source) &&
        ['Active', 'Invalid'].includes(row.state) &&
        ['VirtualNetworkGateway', 'VnetLocal', 'Internet', 'VirtualAppliance', 'None'].includes(row.nextHopType),
      'unsupported route source, activity or next hop',
    );
    require39(
      row.name === undefined ||
        (typeof row.name === 'string' &&
          row.name.trim() &&
          ![...row.name].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)),
      'malformed route name',
    );
    require39(
      row.disableBgpRoutePropagation === undefined || typeof row.disableBgpRoutePropagation === 'boolean',
      'malformed propagation flag',
    );
    const addressPrefix = strings(row.addressPrefix, cidr),
      nextHopIpAddress = strings(row.nextHopIpAddress, (value) => typeof value === 'string' && isIP5(value) !== 0);
    require39(
      addressPrefix.length > 0 && (row.nextHopType !== 'VirtualAppliance' || nextHopIpAddress.length > 0),
      'incomplete route destination or appliance',
    );
    return {
      ...(row.name !== undefined ? { name: row.name } : {}),
      source: row.source,
      state: row.state,
      addressPrefix,
      nextHopIpAddress,
      nextHopType: row.nextHopType,
      ...(row.disableBgpRoutePropagation !== undefined
        ? { disableBgpRoutePropagation: row.disableBgpRoutePropagation }
        : {}),
    };
  });
  const keys = routes.map((row) =>
    canonicalSha256({
      ...row,
      name: undefined,
      addressPrefix: row.addressPrefix.toSorted(),
      nextHopIpAddress: row.nextHopIpAddress.toSorted(),
    }),
  );
  require39(new Set(keys).size === routes.length, 'duplicate route observation');
  return routes;
}
async function collectAzureNetworkEffectiveRoutes(source, expected, selection, api, signal) {
  signal?.throwIfAborted();
  const plan = structuredClone(source),
    inventory = structuredClone(expected),
    selector = structuredClone(selection);
  verifyAzureCePlan(plan);
  validateAzureNetworkUpdateInventory(plan, inventory);
  require39(
    Number.isInteger(selector.node) &&
      Number.isInteger(selector.index) &&
      Object.keys(selector).sort().join(',') === 'index,node',
    'resolved node/NIC selector required',
  );
  const nic = inventory.nodes[String(selector.node)]?.nics[String(selector.index)];
  require39(nic && plan.nics.some((row) => row.index === selector.index), 'selected owned NIC unavailable');
  const base = {
    schemaVersion: 1,
    scope: 'azure-nic-effective-route-inventory',
    planSha256: plan.planSha256,
    node: selector.node,
    index: selector.index,
    nic,
    collectedAt: new Date().toISOString(),
    freshness: 'unqualified',
    forwarding: 'unknown',
    interfaceState: 'unknown',
  };
  const execute = api.exec;
  require39(typeof execute === 'function', 'Azure executor unavailable');
  const transport = {
    async exec(command, args, options) {
      require39(api.exec === execute, 'Azure executor changed');
      const result = await execute.call(api, command, args, options);
      require39(api.exec === execute, 'Azure executor changed');
      return result;
    },
  };
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const bounded = async (task) => {
    deadline.throwIfAborted();
    const abort = Promise.withResolvers(),
      onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([task(), abort.promise]);
      deadline.throwIfAborted();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  let phase = 'initial-cloud-identity';
  try {
    const cloud = async () => {
      const current = await bounded(() => captureAzureNetworkUpdateInventory(plan, transport, deadline));
      require39(canonicalSha256(current.nodes) === canonicalSha256(inventory.nodes), 'current NIC/cloud owner changed');
    };
    const read = async () => {
      const result = await bounded(() =>
        transport.exec(
          'az',
          [
            'network',
            'nic',
            'show-effective-route-table',
            '--ids',
            nic.resourceId,
            '--subscription',
            plan.subscription.id,
            '--output',
            'json',
          ],
          { signal: deadline },
        ),
      );
      require39(result.exitCode === 0, 'route observation unavailable');
      return parseAzureEffectiveRoutes(JSON.parse(result.stdout));
    };
    await cloud();
    phase = 'effective-routes';
    const first = await read(),
      second = await read();
    const stable = (rows) =>
      rows
        .map((row) =>
          canonicalSha256({
            ...row,
            addressPrefix: row.addressPrefix.toSorted(),
            nextHopIpAddress: row.nextHopIpAddress.toSorted(),
          }),
        )
        .toSorted();
    require39(canonicalSha256(stable(first)) === canonicalSha256(stable(second)), 'route inventory changed');
    phase = 'final-cloud-identity';
    await cloud();
    deadline.throwIfAborted();
    return { ...base, status: 'observed', routes: second, reason: 'route-inventory-only' };
  } catch {
    deadline.throwIfAborted();
    return { ...base, status: 'unknown', routes: [], reason: `${phase}-unverified` };
  }
}

// plugins/azure/src/ce/network-operational-identity.ts
var same29 = canonicalEqual;
function require40(value, message) {
  if (!value) throw Error(`Azure network operational identity: ${message}`);
}
var sha12 = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
async function collectAzureNetworkOperationalIdentity(source, expected, runtime, api, signal) {
  signal?.throwIfAborted();
  const plan = structuredClone(source),
    identity = structuredClone(expected);
  verifyAzureCePlan(plan);
  validateAzureNetworkUpdateInventory(plan, identity.inventory);
  const binding = azureUpgradeBinding(plan);
  require40(
    plan.engine === 'terraform' &&
      plan.intent.operation === 'update-network' &&
      runtime.engine === plan.engine &&
      same29(identity.owner, binding.owner) &&
      identity.planSha256 === plan.planSha256 &&
      identity.siteName === plan.siteName &&
      typeof identity.siteUid === 'string' &&
      identity.siteUid.trim() &&
      Number.isInteger(identity.node) &&
      identity.node >= 1 &&
      identity.node <= plan.topology.nodeCount &&
      sha12(identity.configurationSha256) &&
      sha12(identity.siteConfigurationSha256),
    'owning resolved node/site identity required',
  );
  const instances = {},
    interfaces = [];
  for (const [node, vm] of Object.entries(identity.inventory.nodes)) {
    const name = `${plan.deploymentName}-${node}`;
    instances[name] = vm.vmId;
    for (const [index, nic] of Object.entries(vm.nics)) {
      const role = plan.nics.find((n) => n.index === Number(index))?.role;
      require40(
        role === 'slo' || role === 'data' || role === 'sli',
        'complete configured interface role scope required',
      );
      interfaces.push({ node: name, role, mac: nic.mac });
    }
  }
  const base = {
    schemaVersion: 1,
    scope: 'node-registration-interface-identity',
    owner: identity.owner,
    planSha256: identity.planSha256,
    node: identity.node,
    siteName: identity.siteName,
    siteUid: identity.siteUid,
    siteConfigurationSha256: identity.siteConfigurationSha256,
    configurationSha256: identity.configurationSha256,
    expectedInventorySha256: canonicalSha256(identity.inventory.nodes),
    collectedAt: new Date().toISOString(),
    operationalAcceptance: 'unknown',
    nodeHealth: 'unknown',
    freshness: 'unqualified',
    routing: 'unknown',
    traffic: 'unknown',
  };
  return collectAzureOperationalIdentityJoins(
    base,
    binding,
    identity,
    instances,
    interfaces,
    runtime,
    async (deadline) => {
      const inventory = await captureAzureNetworkUpdateInventory(plan, api, deadline);
      require40(same29(inventory.nodes, identity.inventory.nodes), 'current cloud identity differs');
      return canonicalSha256(inventory.nodes);
    },
    signal,
  );
}

// plugins/azure/src/ce/network-operational-readings.ts
var same30 = canonicalEqual;
function object29(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Malformed operational reading');
  return value;
}
function require41(value) {
  if (!value) throw Error('Operational reading identity differs');
}
async function collectAzureNetworkOperationalReadings(
  request,
  expected,
  transport,
  cloud,
  storage,
  signal,
  collectTraffic = false,
  reviewedForwarding,
  purpose = 'preflight',
) {
  const plan = structuredClone(request),
    identity = structuredClone(expected),
    requestSha256 = canonicalSha256(request),
    identitySha256 = canonicalSha256(expected),
    binding = azureUpgradeBinding(plan),
    deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]),
    startedAt = new Date().toISOString(),
    reviewed = reviewedForwarding === undefined ? undefined : structuredClone(reviewedForwarding),
    reviewedSha256 = reviewedForwarding === undefined ? undefined : canonicalSha256(reviewedForwarding);
  const collaborators = [
    [
      transport,
      [
        'observeOwnedSite',
        'ownedSiteConfiguration',
        'observeRegistrations',
        'observeAzureInterfaces',
        'observeHealth',
        'observeNodeReadiness',
        'observeBgpSessions',
        'observeBgpRoutes',
        'observeForwardingRoutes',
      ],
    ],
    [cloud, ['exec']],
    [storage, ['verify', 'read', 'write']],
  ];
  const callbacks = collaborators.flatMap(([target, names]) =>
    names.map((name) => {
      const object = target;
      const callback = object[name];
      require41(typeof callback === 'function');
      return { object, name, callback };
    }),
  );
  const directory = storage.directory;
  const seal = () => {
    deadline.throwIfAborted();
    require41(
      same30(storage.owner, identity.owner) &&
        same30(storage.owner, binding.owner) &&
        transport.engine === 'terraform' &&
        canonicalSha256(request) === requestSha256 &&
        canonicalSha256(expected) === identitySha256 &&
        canonicalSha256(plan) === requestSha256 &&
        canonicalSha256(identity) === identitySha256 &&
        (reviewedForwarding === undefined
          ? reviewed === undefined
          : canonicalSha256(reviewedForwarding) === reviewedSha256 && canonicalSha256(reviewed) === reviewedSha256) &&
        storage.directory === directory &&
        callbacks.every(({ object, name, callback }) => object[name] === callback),
    );
  };
  seal();
  const runtime = guardAzureCeApplyObject(transport, seal, {}, ['engine']),
    api = guardAzureCeApplyObject(cloud, seal),
    store = guardAzureCeApplyObject(storage, seal, {}, ['owner', 'directory']);
  const bounded = async (task) => {
    seal();
    const aborted = Promise.withResolvers(),
      onAbort = () => aborted.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([task(), aborted.promise]);
      seal();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  await bounded(() => store.verify());
  const initial = await bounded(() => collectAzureNetworkOperationalIdentity(plan, identity, runtime, api, deadline));
  const unknown = (reason) => ({ status: 'unknown', reason });
  let siteHealth = unknown('site-global-health-unavailable');
  try {
    const health = object29(await bounded(() => runtime.observeHealth(binding, deadline)));
    require41(
      same30(health.owner, binding.owner) &&
        health.siteName === binding.siteName &&
        health.siteUid === identity.siteUid &&
        health.scope === 'site-global-only' &&
        health.nodeHealth === 'unknown' &&
        typeof health.representativeNode === 'string' &&
        binding.nodes.includes(health.representativeNode) &&
        ['healthy', 'degraded'].includes(String(health.status)) &&
        ['WAITING_FOR_CONFIG', 'WAITING_FOR_APPROVAL', 'PROVISIONING', 'PROVISIONED', 'FAILED', 'RESETTING'].includes(
          String(health.state),
        ) &&
        (health.status === 'healthy') === (health.state === 'PROVISIONED'),
    );
    siteHealth = {
      status: health.status,
      scope: 'site-global-only',
      nodeHealth: 'unknown',
      siteUid: health.siteUid,
      representativeNode: health.representativeNode,
      state: health.state,
    };
  } catch {
    seal();
  }
  let nodeReadiness = unknown('selected-node-readiness-unavailable');
  try {
    const node = `${plan.deploymentName}-${identity.node}`;
    const instances = Object.fromEntries(
      Object.entries(identity.inventory.nodes).map(([index, vm]) => [`${plan.deploymentName}-${index}`, vm.vmId]),
    );
    require41('registrations' in initial && initial.registrations.status === 'observed');
    const selectedRegistrations = initial.registrations.nodes.filter((row) => row.node === node);
    require41(selectedRegistrations.length === 1);
    const selected = selectedRegistrations[0];
    const value = object29(
      await bounded(() =>
        runtime.observeNodeReadiness(binding, { siteUid: identity.siteUid, node, instances }, deadline),
      ),
    );
    require41(
      value.status === 'observed' &&
        same30(value.owner, binding.owner) &&
        value.siteName === binding.siteName &&
        value.siteUid === identity.siteUid &&
        value.node === node &&
        value.instanceId === instances[node] &&
        value.instanceId === selected.instanceId &&
        value.registration === selected.registration &&
        value.scope === 'selected-node-vpm-readiness' &&
        value.originalSampleFreshness === 'unqualified' &&
        value.canSatisfyInterfaceMutationGate === false &&
        value.allNodeHealthQualified === false &&
        value.routingTrafficQualified === false &&
        value.source === `/api/operate/namespaces/system/sites/${binding.siteName}/vpm/debug/${node}/exec-user` &&
        typeof value.outputSha256 === 'string' &&
        /^[a-f0-9]{64}$/.test(value.outputSha256) &&
        typeof value.bindingOutputSha256 === 'string' &&
        /^[a-f0-9]{64}$/.test(value.bindingOutputSha256) &&
        ['WAITING_FOR_CONFIG', 'WAITING_FOR_APPROVAL', 'PROVISIONING', 'PROVISIONED', 'FAILED', 'RESETTING'].includes(
          String(value.state),
        ) &&
        value.readiness === (value.state === 'PROVISIONED' ? 'ready' : 'not-ready') &&
        Array.isArray(value.roles) &&
        value.roles.length > 0 &&
        value.roles.length <= 32 &&
        new Set(value.roles).size === value.roles.length &&
        [value.softwareVersion, value.osVersion, value.vpmVersion, ...value.roles].every(
          (text) => typeof text === 'string' && text.trim() && text.length <= 256,
        ),
    );
    validateExpectedNodeHealth({ siteUid: identity.siteUid, node, instances, expectedFqdn: value.fqdn }, binding.nodes);
    nodeReadiness = {
      status: 'observed',
      readiness: value.readiness,
      state: value.state,
      scope: 'selected-node-vpm-readiness',
      node,
      siteUid: identity.siteUid,
      instanceId: instances[node],
      registration: selected.registration,
      fqdn: value.fqdn,
      softwareVersion: value.softwareVersion,
      osVersion: value.osVersion,
      vpmVersion: value.vpmVersion,
      roles: [...value.roles],
      source: value.source,
      outputSha256: value.outputSha256,
      bindingOutputSha256: value.bindingOutputSha256,
      originalSampleFreshness: 'unqualified',
      canSatisfyInterfaceMutationGate: false,
      allNodeHealthQualified: false,
      routingTrafficQualified: false,
    };
  } catch {
    seal();
  }
  const routeExchange = await bounded(() => collectAzureRouteServerHealth(plan, api, deadline));
  let sessions = unknown('complete-platform-bgp-session-evidence-unavailable'),
    routes = unknown('complete-platform-bgp-route-evidence-unavailable');
  if (routeExchange.status === 'healthy' && initial.status !== 'unknown') {
    const slo = initial.interfaces.filter((row) => row.role === 'slo'),
      serviceAddresses = routeExchange.serviceAddresses;
    require41(
      slo.length === binding.nodes.length &&
        binding.nodes.every((node) => slo.filter((row) => row.node === node).length === 1),
    );
    const expectedSessions = slo.flatMap(({ node, interfaceName }) =>
      serviceAddresses.map((peerAddress) => ({ node, interfaceName, peerAddress })),
    );
    try {
      const value = await bounded(() => runtime.observeBgpSessions(binding, expectedSessions, deadline));
      require41(
        same30(value.owner, binding.owner) &&
          value.siteName === binding.siteName &&
          value.expectedSessions === expectedSessions.length &&
          value.sessions.length === expectedSessions.length,
      );
      const rows = expectedSessions.map((wanted) => {
        const matches = value.sessions.filter(
          (row) =>
            row.node === wanted.node &&
            row.interfaceName === wanted.interfaceName &&
            row.peerAddress === wanted.peerAddress,
        );
        require41(matches.length === 1);
        const row = matches[0];
        require41(
          [
            'Unknown',
            'Idle',
            'Connect',
            'Active',
            'OpenSent',
            'OpenConfirm',
            'Established',
            'Clearing',
            'Deleted',
          ].includes(row.state) &&
            Number.isSafeInteger(row.receivedPrefixCount) &&
            row.receivedPrefixCount >= 0 &&
            Number.isSafeInteger(row.advertisedPrefixCount) &&
            row.advertisedPrefixCount >= 0 &&
            typeof row.stateChangedAt === 'string' &&
            Number.isFinite(Date.parse(row.stateChangedAt)),
        );
        return {
          ...wanted,
          state: row.state,
          receivedPrefixCount: row.receivedPrefixCount,
          advertisedPrefixCount: row.advertisedPrefixCount,
          stateChangedAt: row.stateChangedAt,
        };
      });
      const establishedSessions = rows.filter((row) => row.state === 'Established').length;
      require41(
        value.establishedSessions === establishedSessions &&
          value.status === (establishedSessions === expectedSessions.length ? 'healthy' : 'degraded'),
      );
      sessions = {
        status: value.status,
        establishedSessions,
        expectedSessions: expectedSessions.length,
        sessions: rows,
        originalSampleFreshness: 'unqualified',
      };
    } catch {
      seal();
    }
    try {
      const value = await bounded(() => runtime.observeBgpRoutes(binding, deadline));
      require41(
        same30(value.owner, binding.owner) && value.siteName === binding.siteName && value.status === 'observed',
      );
      require41(
        Array.isArray(value.nodes) &&
          value.nodes.length === binding.nodes.length &&
          binding.nodes.every((node) => value.nodes.filter((row) => row.node === node).length === 1),
      );
      routes = {
        status: 'observed',
        scope: 'bgp-route-inventory',
        evidenceSha256: canonicalSha256(value.nodes),
        forwardingAcceptance: 'unknown',
        originalSampleFreshness: 'unqualified',
      };
    } catch {
      seal();
    }
  }
  let forwarding = unknown('reviewed-forwarding-expectations-unavailable');
  let expectedForwarding = reviewed;
  try {
    expectedForwarding ??= resolveAzureForwardingExpectations(plan, identity, initial.interfaces, purpose);
  } catch {
    seal();
    forwarding = unknown('plan-forwarding-identity-unverified');
  }
  if (expectedForwarding !== undefined) {
    const reviewed = expectedForwarding;
    try {
      require41(initial.status !== 'unknown' && reviewed.siteUid === identity.siteUid);
      validateExpectedForwardingRoutes(reviewed, binding.nodes);
      const physical = initial.interfaces.filter((row) => row.role === 'slo' || row.role === 'sli');
      require41(
        physical.length === reviewed.interfaces.length &&
          reviewed.interfaces.every(
            (wanted) =>
              physical.filter(
                (row) =>
                  row.node === wanted.node &&
                  row.role === wanted.role &&
                  row.mac === wanted.mac &&
                  row.device === wanted.device &&
                  row.interfaceName === wanted.interfaceName,
              ).length === 1,
          ),
      );
      forwarding = await bounded(() => collectAzureNetworkForwardingReading(binding, reviewed, runtime, deadline));
    } catch {
      seal();
      forwarding = unknown('reviewed-forwarding-evidence-unverified');
    }
  }
  const effectiveNics = [];
  for (const nic of plan.nics) {
    const reading = await bounded(() =>
      collectAzureNetworkEffectiveRoutes(
        plan,
        identity.inventory,
        { node: identity.node, index: nic.index },
        api,
        deadline,
      ),
    );
    effectiveNics.push({
      index: nic.index,
      role: nic.role,
      status: reading.status,
      resourceId: reading.nic.resourceId,
      mac: reading.nic.mac,
      ownerPlanSha256: reading.nic.ownerPlanSha256,
      ...(reading.status === 'observed'
        ? {
            evidenceSha256: canonicalSha256(reading.routes),
            routeCount: reading.routes.length,
            activeRoutes: reading.routes.filter((row) => row.state === 'Active').length,
            invalidRoutes: reading.routes.filter((row) => row.state === 'Invalid').length,
          }
        : { reason: reading.reason }),
    });
  }
  const effectiveRoutes = {
    status: effectiveNics.every((row) => row.status === 'observed') ? 'observed' : 'unknown',
    scope: 'selected-node-azure-effective-route-inventories',
    node: identity.node,
    instanceId: identity.inventory.nodes[String(identity.node)].vmId,
    nics: effectiveNics,
    forwarding: 'unknown',
    freshness: 'unqualified',
    interfaceState: 'unknown',
  };
  let traffic = unknown(
    !collectTraffic
      ? 'active-probe-not-requested'
      : plan.intent.ingress?.mode !== 'platform-http'
        ? 'reviewed-platform-http-probe-unconfigured'
        : 'interface-up-admission-unverified',
  );
  if (
    collectTraffic &&
    plan.intent.ingress?.mode === 'platform-http' &&
    initial.canSatisfyInterfaceMutationGate === true
  ) {
    try {
      const sample = await bounded(() => collectAzureCurrentTrafficProbe(plan, store, api, deadline));
      traffic = {
        status: sample.status,
        scope: sample.scope,
        sampleId: sample.sampleId,
        planSha256: sample.planSha256,
        checkpointKey: sample.checkpointKey,
        checkpointSha256: sample.checkpointSha256,
        sourceIdentitySha256: sample.sourceIdentitySha256,
        startedAt: sample.startedAt,
        completedAt: sample.completedAt,
        evidenceSha256: canonicalSha256(sample.evidence),
      };
    } catch {
      seal();
      traffic = unknown('current-traffic-probe-unverified');
    }
  }
  const final = await bounded(() => collectAzureNetworkOperationalIdentity(plan, identity, runtime, api, deadline)),
    boundary = (reading) => {
      const { collectedAt: _collectedAt, ...facts } = reading;
      return facts;
    };
  require41(same30(boundary(initial), boundary(final)));
  seal();
  return {
    schemaVersion: 1,
    scope: 'current-network-operational-readings',
    owner: structuredClone(binding.owner),
    planSha256: plan.planSha256,
    node: identity.node,
    siteUid: identity.siteUid,
    identity: final,
    siteHealth,
    nodeHealth: 'unknown',
    nodeReadiness,
    routeExchange,
    sessions,
    routes,
    forwarding,
    effectiveRoutes,
    traffic,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

// plugins/azure/src/ce/network-operational-provenance.ts
var same31 = canonicalEqual;
function require42(value, reason) {
  if (!value) throw Error(`Azure operational acquisition provenance: ${reason}`);
}
function object30(value) {
  require42(value && typeof value === 'object' && !Array.isArray(value), 'malformed private record');
  return value;
}
function createAzureOperationalAcquisitionCollector(
  request,
  transport,
  cloud,
  storage,
  forwarding,
  trustedIssuerSha256,
  originalIssuerPublication,
  loadOriginalSource,
) {
  const plan = structuredClone(request),
    owner = structuredClone(storage.owner),
    directory = storage.directory,
    reviewed = forwarding === undefined ? undefined : structuredClone(forwarding),
    requestMatches = canonicalSnapshot(request),
    reviewedMatches = forwarding === undefined ? undefined : canonicalSnapshot(forwarding);
  const validateSource = (source, expectedOwner) => {
    verifyAzureCePlan(source);
    require42(
      source.engine === 'terraform' &&
        source.intent.operation === 'update-network' &&
        same31(azureUpgradeBinding(source).owner, expectedOwner),
      'owning Terraform network plan required',
    );
  };
  validateSource(plan, owner);
  const seal = () =>
    require42(
      requestMatches(request) &&
        requestMatches(plan) &&
        storage.directory === directory &&
        same31(storage.owner, owner) &&
        transport.engine === 'terraform' &&
        (forwarding === undefined
          ? reviewed === undefined
          : reviewedMatches?.(forwarding) && reviewedMatches?.(reviewed)),
      'owning collector context changed',
    );
  const runtime = guardAzureCeApplyObject(transport, seal, {}, ['engine']),
    api = guardAzureCeApplyObject(cloud, seal);
  return createAzureOperationalAcquisitionCustody(
    request,
    storage,
    {
      family: 'network',
      verifyContext: seal,
      validateSource,
      validatePurpose(purpose) {
        require42(
          purpose === 'preflight' || purpose === 'restored' || purpose === 'final',
          'requested acquisition purpose differs',
        );
      },
      validateIdentity(raw, source, expectedOwner) {
        const identity = object30(raw);
        require42(
          identity.planSha256 === source.planSha256 &&
            same31(identity.owner, expectedOwner) &&
            identity.siteName === source.siteName &&
            typeof identity.node === 'number' &&
            Number.isInteger(identity.node) &&
            identity.node >= 1 &&
            identity.node <= source.topology.nodeCount,
          'original execution identity differs from source',
        );
      },
      validateReadings(raw, expected, source, expectedOwner) {
        const readings = object30(raw),
          identity = object30(expected);
        require42(
          readings.schemaVersion === 1 &&
            readings.scope === 'current-network-operational-readings' &&
            same31(readings.owner, expectedOwner) &&
            readings.planSha256 === source.planSha256 &&
            readings.node === identity.node &&
            readings.siteUid === identity.siteUid,
          'signed acquisition scope differs',
        );
      },
      collectReadings(identity, purpose, signal, collectTraffic) {
        return collectAzureNetworkOperationalReadings(
          plan,
          identity,
          runtime,
          api,
          storage,
          signal,
          collectTraffic,
          reviewed,
          purpose,
        );
      },
    },
    trustedIssuerSha256,
    originalIssuerPublication,
    loadOriginalSource,
  );
}

// plugins/azure/src/ce/network-operational-session.ts
var toolType2 = 'azure-ce-network-operational-issuer';
var suffix2 = `.${toolType2}.log`;
var same32 = canonicalEqual;
var sha13 = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function require43(value, reason) {
  if (!value) throw Error(`Azure operational issuer session: ${reason}`);
}
async function createAzureOperationalAcquisitionSession(request, runtime, api, store, session, forwarding, signal) {
  const plan = structuredClone(request),
    owner = structuredClone(store.owner),
    directory = session.getArtifactsDir(),
    sessionId = session.getSessionId(),
    privateDirectory = store.directory;
  require43(typeof directory === 'string' && directory.startsWith('/'), 'persistent native session required');
  require43(
    plan.engine === 'terraform' &&
      plan.intent.operation === 'update-network' &&
      same32(owner, azureUpgradeBinding(plan).owner),
    'owning network plan required',
  );
  const callbacks = [
    session.getSessionId,
    session.getArtifactsDir,
    session.getArtifactPath,
    session.saveArtifact,
    store.verify,
    store.read,
  ];
  const seal = () => {
    signal?.throwIfAborted();
    require43(
      same32(request, plan) &&
        same32(store.owner, owner) &&
        store.directory === privateDirectory &&
        session.getSessionId() === sessionId &&
        session.getArtifactsDir() === directory &&
        same32(owner, azureUpgradeBinding(plan).owner) &&
        callbacks.every(
          (fn, i) =>
            fn ===
            [
              session.getSessionId,
              session.getArtifactsDir,
              session.getArtifactPath,
              session.saveArtifact,
              store.verify,
              store.read,
            ][i],
        ),
      'owning session changed',
    );
  };
  const identities = new Map();
  let rootIdentity, privateIdentity, retained;
  const bounded = async (work, parent) => {
    const active = AbortSignal.any([
      AbortSignal.timeout(180000),
      ...(signal ? [signal] : []),
      ...(parent ? [parent] : []),
    ]);
    const step = async (task) => {
      seal();
      active.throwIfAborted();
      const aborted = Promise.withResolvers(),
        onAbort = () => aborted.reject(active.reason);
      active.addEventListener('abort', onAbort, { once: true });
      try {
        const value = await Promise.race([Promise.resolve().then(task), aborted.promise]);
        seal();
        active.throwIfAborted();
        return value;
      } finally {
        active.removeEventListener('abort', onAbort);
      }
    };
    return step(() => work(active));
  };
  const verifyPrivateDirectory = async () => {
    const root = await lstat6(privateDirectory);
    require43(
      root.isDirectory() &&
        !root.isSymbolicLink() &&
        root.uid === process.getuid?.() &&
        (root.mode & 63) === 0 &&
        (await realpath5(privateDirectory)) === privateDirectory,
      'private signing directory custody differs',
    );
    const identity = `${root.dev}:${root.ino}:${root.birthtimeMs}`;
    require43(privateIdentity === undefined || privateIdentity === identity, 'private signing directory replaced');
    privateIdentity = identity;
  };
  const readPins = async (active) => {
    active.throwIfAborted();
    seal();
    await verifyPrivateDirectory();
    await store.verify();
    const root = await lstat6(directory);
    require43(
      root.isDirectory() &&
        !root.isSymbolicLink() &&
        root.uid === process.getuid?.() &&
        (root.mode & 18) === 0 &&
        (await realpath5(directory)) === directory,
      'native session directory custody differs',
    );
    const identity = `${root.dev}:${root.ino}:${root.birthtimeMs}`;
    require43(rootIdentity === undefined || rootIdentity === identity, 'native session directory replaced');
    rootIdentity = identity;
    const original = await loadPlanArtifact(session, plan.planId, plan.planSha256);
    require43(same32(original.plan, plan), 'owning public source differs');
    const names = (await readdir6(directory)).filter((n) => n.endsWith(suffix2)).sort();
    const observed = [];
    for (const name of names) {
      active.throwIfAborted();
      seal();
      const path = join6(directory, name),
        file = await open5(path, constants5.O_RDONLY | constants5.O_NOFOLLOW);
      let raw;
      try {
        const before = await file.stat();
        require43(
          before.isFile() &&
            before.uid === process.getuid?.() &&
            before.nlink === 1 &&
            (before.mode & 18) === 0 &&
            before.size <= 131072,
          'issuer artifact custody differs',
        );
        raw = await file.readFile('utf8');
        const after = await file.stat(),
          named = await lstat6(path);
        const fileIdentity = (v) =>
          `${v.dev}:${v.ino}:${v.size}:${v.mtimeMs}:${v.ctimeMs}:${v.birthtimeMs}:${v.uid}:${v.nlink}:${v.mode}`;
        require43(
          named.isFile() &&
            !named.isSymbolicLink() &&
            fileIdentity(before) === fileIdentity(after) &&
            fileIdentity(after) === fileIdentity(named),
          'issuer artifact changed while read',
        );
        const custody = canonicalSha256({ identity: fileIdentity(after), raw });
        require43(!identities.has(path) || identities.get(path) === custody, 'original issuer artifact changed');
        identities.set(path, custody);
      } finally {
        await file.close();
      }
      const row = parseNodeHealthJson(raw);
      require43(
        same32(
          Object.keys(row).sort(),
          ['engine', 'issuerSha256', 'kind', 'owner', 'planId', 'planSha256', 'schemaVersion'].sort(),
        ) &&
          row.schemaVersion === 1 &&
          row.engine === 'terraform' &&
          row.kind === 'azure-network-operational-issuer-binding' &&
          sha13(row.issuerSha256) &&
          sha13(row.planSha256) &&
          typeof row.planId === 'string',
        'issuer binding schema differs',
      );
      if (!same32(row.owner, owner)) continue;
      const source = await loadPlanArtifact(session, row.planId, row.planSha256);
      require43(
        source.plan.engine === 'terraform' &&
          source.plan.intent.operation === 'update-network' &&
          same32(azureUpgradeBinding(source.plan).owner, owner),
        'issuer source ownership differs',
      );
      observed.push(row.issuerSha256);
    }
    require43(
      same32(names, (await readdir6(directory)).filter((n) => n.endsWith(suffix2)).sort()),
      'issuer namespace changed while read',
    );
    const final = await lstat6(directory);
    require43(
      final.isDirectory() &&
        !final.isSymbolicLink() &&
        final.uid === process.getuid?.() &&
        (final.mode & 18) === 0 &&
        `${final.dev}:${final.ino}:${final.birthtimeMs}` === rootIdentity &&
        (await realpath5(directory)) === directory,
      'native session directory changed',
    );
    active.throwIfAborted();
    seal();
    await verifyPrivateDirectory();
    const pins = [...new Set(observed)];
    require43(pins.length <= 1, 'conflicting original issuer pins');
    return pins[0];
  };
  retained = await bounded(readPins);
  let pointer;
  try {
    pointer = await store.read('azure-network-observer-issuer.json');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  require43(pointer === undefined || retained !== undefined, 'original public issuer pin unavailable');
  const originalIssuerPublication = async (issuerSha256, active) => {
    require43(sha13(issuerSha256) && (retained === undefined || retained === issuerSha256), 'original issuer changed');
    const before = await readPins(active);
    require43(before === undefined || before === issuerSha256, 'published issuer changed');
    if (before === undefined) {
      const record = {
        schemaVersion: 1,
        kind: 'azure-network-operational-issuer-binding',
        engine: 'terraform',
        owner,
        planId: plan.planId,
        planSha256: plan.planSha256,
        issuerSha256,
      };
      const id = await session.saveArtifact(JSON.stringify(record), toolType2);
      require43(typeof id === 'string' && id.length > 0, 'original issuer publication not acknowledged');
      const path = await session.getArtifactPath(id);
      require43(
        typeof path === 'string' && dirname3(path) === directory && path.endsWith(suffix2),
        'original issuer publication path differs',
      );
    }
    require43((await readPins(active)) === issuerSha256, 'original issuer publication unavailable');
    retained = issuerSha256;
  };
  const collector = createAzureOperationalAcquisitionCollector(
    request,
    runtime,
    api,
    store,
    forwarding,
    retained,
    originalIssuerPublication,
    async (planSha256, active) => {
      active.throwIfAborted();
      seal();
      const source = await loadPlanArtifact(session, `azure-ce-${planSha256.slice(0, 24)}`, planSha256);
      active.throwIfAborted();
      seal();
      require43(
        source.plan.engine === 'terraform' &&
          source.plan.intent.operation === 'update-network' &&
          same32(azureUpgradeBinding(source.plan).owner, owner),
        'original observation source ownership differs',
      );
      return source.plan;
    },
  );
  const check = async (active) => {
    require43((await readPins(active)) === retained, 'original public issuer binding changed');
  };
  return Object.freeze({
    authenticateRetirementInventory(parent) {
      return bounded(async (active) => {
        require43(retained !== undefined, 'original public issuer pin unavailable');
        await check(active);
        const result = await collector.authenticateRetirementInventory(active);
        await check(active);
        return result;
      }, parent);
    },
    collect(...args) {
      return bounded(async (active) => {
        await check(active);
        const result = await collector.collect(args[0], args[1], active, args[3]);
        await check(active);
        require43(retained === result.issuerSha256, 'acquisition issuer was not published');
        return result;
      }, args[2]);
    },
    authenticate(...args) {
      return bounded(async (active) => {
        require43(retained !== undefined, 'original public issuer pin unavailable');
        await check(active);
        const result = await collector.authenticate(args[0], args[1], args[2], args[3], active);
        await check(active);
        return result;
      }, args[4]);
    },
    retireSigningMaterial(parent) {
      return bounded(async (active) => {
        require43(retained !== undefined, 'original public issuer pin unavailable');
        await check(active);
        const result = await collector.retireSigningMaterial(active);
        await check(active);
        return result;
      }, parent);
    },
  });
}

// plugins/azure/src/ce/terraform-public-operational-verifiers.ts
function createAzureTerraformPublicOperationalVerifiers(
  request,
  native,
  terraform,
  runtime,
  api,
  store,
  loaders,
  signal,
) {
  const original = structuredClone(request),
    matches = canonicalSnapshot(request),
    binding = azureUpgradeBinding(original),
    directory = store.directory,
    nativeDirectory = native.getArtifactsDir(),
    sessionId = native.getSessionId();
  verifyAzureCePlan(original);
  const refs = [
    terraform.open,
    api.exec,
    store.verify,
    store.read,
    store.write,
    loaders.loadSource,
    native.getSessionId,
    native.getArtifactsDir,
    native.getArtifactPath,
    native.saveArtifact,
  ];
  const runtimeRefs = [
    runtime.observeOwnedSite,
    runtime.ownedSiteConfiguration,
    runtime.observeRegistrations,
    runtime.observeAzureInterfaces,
    runtime.observeNodeReadiness,
    runtime.observeForwardingRoutes,
    runtime.observeBgpSessions,
    runtime.observeBgpRoutes,
  ];
  const seal = () => {
    signal?.throwIfAborted();
    if (
      !matches(request) ||
      !matches(original) ||
      original.engine !== 'terraform' ||
      original.intent.operation !== 'deploy' ||
      runtime.engine !== 'terraform' ||
      !canonicalEqual(store.owner, binding.owner) ||
      store.directory !== directory ||
      native.getArtifactsDir() !== nativeDirectory ||
      native.getSessionId() !== sessionId ||
      refs.some(
        (fn, i) =>
          fn !==
          [
            terraform.open,
            api.exec,
            store.verify,
            store.read,
            store.write,
            loaders.loadSource,
            native.getSessionId,
            native.getArtifactsDir,
            native.getArtifactPath,
            native.saveArtifact,
          ][i],
      ) ||
      runtimeRefs.some(
        (fn, i) =>
          fn !==
          [
            runtime.observeOwnedSite,
            runtime.ownedSiteConfiguration,
            runtime.observeRegistrations,
            runtime.observeAzureInterfaces,
            runtime.observeNodeReadiness,
            runtime.observeForwardingRoutes,
            runtime.observeBgpSessions,
            runtime.observeBgpRoutes,
          ][i],
      )
    )
      throw Error('Public operational verifier owning context changed');
  };
  seal();
  const source = async (sha, active) => {
    seal();
    active?.throwIfAborted();
    const plan = await loaders.loadSource(sha);
    seal();
    active?.throwIfAborted();
    verifyAzureCePlan(plan);
    if (plan.planSha256 !== sha || plan.engine !== 'terraform' || !canonicalEqual(azureUpgradeBinding(plan), binding))
      throw Error('Public operational source differs');
    return plan;
  };
  const networks = new Map(),
    replacements = new Map();
  const replacementSessions = new Map();
  const network = async (sha, active) => {
    const plan = await source(sha, active);
    if (plan.intent.operation !== 'update-network') throw Error('Public network observation source differs');
    let opening = networks.get(sha);
    if (!opening) {
      opening = createAzureOperationalAcquisitionSession(
        plan,
        runtime,
        api,
        store,
        native,
        undefined,
        AbortSignal.any([...(signal ? [signal] : []), ...(active ? [active] : [])]),
      ).then(createAzureNetworkOperationalAcceptance);
      networks.set(sha, opening);
    }
    const acquired = await opening;
    seal();
    active?.throwIfAborted();
    return acquired;
  };
  const replacement = async (sha, current, active) => {
    const plan = await source(sha, active);
    if (plan.intent.operation !== 'replace-node' || !plan.terraformNetworkReplacementProfile)
      throw Error('Public replacement observation source differs');
    if (current && replacementSessions.has(sha) && replacementSessions.get(sha) !== current)
      throw Error('Public replacement acquisition session differs');
    let opening = replacements.get(sha);
    if (!opening) {
      opening = (async () => {
        const owning =
          current ?? (await terraform.open(binding.owner, await azureTerraformCurrentDeployment(plan), 'current'));
        seal();
        active?.throwIfAborted();
        replacementSessions.set(sha, owning);
        return createAzureReplacementReadingsAcceptance(
          await createAzureReplacementReadingsAcquisitionSession(
            plan,
            runtime,
            api,
            store,
            owning,
            { loaders, qualifyHistorical: qualifyNetwork, qualifyReplacementCompleted: qualifyReplacement },
            native,
            AbortSignal.any([...(signal ? [signal] : []), ...(active ? [active] : [])]),
          ),
        );
      })();
      replacements.set(sha, opening);
    }
    const acquired = await opening;
    seal();
    active?.throwIfAborted();
    if (current && replacementSessions.get(sha) !== current)
      throw Error('Public replacement acquisition session differs');
    return acquired;
  };
  const qualifyNetwork = async (receipt, identity, mode, active) =>
    (await network(identity.planSha256, active)).qualifyAcceptance(receipt, identity, mode, active);
  const qualifyReplacement = async (receipt, identity, mode, active) =>
    (await replacement(identity.planSha256, undefined, active)).qualifyCompletedOperational(
      receipt,
      identity,
      mode,
      active,
    );
  return Object.freeze({ network, replacement, qualifyNetwork, qualifyReplacement });
}

// plugins/azure/src/ce/terraform-network-public-replacement.ts
function object31(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Current owned replacement site unavailable');
  return value;
}
async function runAzureTerraformNetworkPublicReplacement(
  request,
  ctx,
  terraform,
  runtime,
  store,
  api,
  signal,
  acceptIngress,
) {
  signal?.throwIfAborted();
  verifyAzureCePlan(request);
  const plan = structuredClone(request),
    matches = canonicalSnapshot(request),
    binding = azureUpgradeBinding(plan),
    profile = verifyAzureTerraformNetworkReplacementProfile(plan),
    { observeOwnedSite: siteReader, ownedSiteConfiguration: configurationReader } = runtime;
  const seal = () => {
    signal?.throwIfAborted();
    if (
      !matches(request) ||
      !matches(plan) ||
      plan.engine !== 'terraform' ||
      runtime.engine !== 'terraform' ||
      !canonicalEqual(store.owner, binding.owner) ||
      runtime.observeOwnedSite !== siteReader ||
      runtime.ownedSiteConfiguration !== configurationReader
    )
      throw Error('Owning Terraform public replacement required');
  };
  seal();
  const inventory = await readAzureCePlanInventory(ctx.sessionManager, signal);
  seal();
  const originals = inventory.plans
    .map((row) => row.plan)
    .filter((source) => source.planSha256 === profile.originalPlanSha256);
  if (
    originals.length !== 1 ||
    originals[0].intent.operation !== 'deploy' ||
    !canonicalEqual(azureUpgradeBinding(originals[0]), binding)
  )
    throw Error('Original public replacement source unresolved');
  const loaders = await createAzureTerraformPublicHistoryLoaders(originals[0], ctx.sessionManager, store, signal);
  const retained = await loaders.loadSource(profile.retainedPlanSha256);
  if (
    !canonicalEqual(azureUpgradeBinding(retained), binding) ||
    (!retained.terraformNetworkProfile && !retained.terraformNetworkReplacementProfile)
  )
    throw Error('Immediate public replacement predecessor unresolved');
  const observeSite = async () => {
    seal();
    const current = await runtime.observeOwnedSite(binding, signal),
      metadata = object31(current.metadata),
      system = object31(current.system_metadata);
    seal();
    if (
      metadata?.name !== binding.siteName ||
      metadata.namespace !== 'system' ||
      typeof system?.uid !== 'string' ||
      !system.uid
    )
      throw Error('Current owned replacement site unavailable');
    return {
      siteUid: system.uid,
      siteConfigurationSha256: canonicalSha256(runtime.ownedSiteConfiguration(binding, current)),
    };
  };
  const site = await observeSite(),
    verifiers = createAzureTerraformPublicOperationalVerifiers(
      originals[0],
      ctx.sessionManager,
      terraform,
      runtime,
      api,
      store,
      loaders,
      signal,
    );
  let prepared;
  try {
    prepared = await bindAzureTerraformNetworkReplacementSource(
      plan,
      terraform,
      store,
      api,
      process.env,
      loaders,
      site,
      verifiers.qualifyNetwork,
      signal,
      verifiers.qualifyReplacement,
    );
  } catch (error) {
    seal();
    if (
      !(error instanceof AzureNetworkOperationalAcceptanceUnavailable) &&
      !(error instanceof AzureReplacementReadingsAcceptanceUnavailable)
    )
      throw error;
    return {
      engine: 'terraform',
      planId: plan.planId,
      planSha256: plan.planSha256,
      status: 'operational-acceptance-pending',
      purpose: 'historical',
      reason: 'authenticated-predecessor-operational-evidence-unqualified',
      evidence: structuredClone(error.evidence),
    };
  }
  seal();
  if (!canonicalEqual(await observeSite(), site))
    throw Error('Current replacement site changed before journal binding');
  const sourceBindingSha256 = canonicalSha256(prepared.binding),
    journal = await bindAzureTerraformNetworkReplacementExecutionJournal(
      plan,
      store,
      loaders,
      site,
      sourceBindingSha256,
      verifiers.qualifyNetwork,
      signal,
      verifiers.qualifyReplacement,
    ),
    acquisition = await verifiers.replacement(plan.planSha256, prepared.session, signal);
  seal();
  if (!canonicalEqual(await observeSite(), site))
    throw Error('Current replacement site changed before owning execution');
  const result = await runAzureTerraformReplacement(
    plan,
    terraform,
    runtime,
    store,
    api,
    process.env,
    signal,
    acceptIngress,
    undefined,
    {
      loaders,
      site,
      journalSha256: journal.journalSha256,
      sourceBindingSha256,
      qualifyHistorical: verifiers.qualifyNetwork,
      collectOperational: acquisition.collectOperational,
      qualifyOperational: acquisition.qualifyOperational,
      qualifyCompletedOperational: verifiers.qualifyReplacement,
    },
  );
  seal();
  return result;
}

// plugins/azure/src/ce/terraform-network-driver-lease.ts
import { createHash as createHash23 } from 'node:crypto';
import { lstat as lstat7, readFile as readFile2, realpath as realpath6 } from 'node:fs/promises';
import { join as join7 } from 'node:path';

var ownership = new WeakMap();
var hash11 = (value) => createHash23('sha256').update(value).digest('hex');
function require44(value, message) {
  if (!value) throw Error(`Azure Terraform network driver lease: ${message}`);
}
function held(lease, directory) {
  const current = ownership.get(lease);
  require44(current?.active && current.directory === directory, 'active exact owning lease required');
  return current;
}
function assertAzureTerraformNetworkDriverLease(lease, directory) {
  held(lease, directory);
}
async function claimBytes(directory) {
  const path = join7(directory, '.terraform-network-driver-lock'),
    claim = join7(path, 'claim.json'),
    stat = await lstat7(path);
  require44(
    stat.isDirectory() &&
      !stat.isSymbolicLink() &&
      stat.uid === process.getuid?.() &&
      (stat.mode & 63) === 0 &&
      (await realpath6(path)) === path,
    'driver lock private directory differs',
  );
  const file = await lstat7(claim);
  require44(
    file.isFile() &&
      !file.isSymbolicLink() &&
      file.nlink === 1 &&
      file.uid === process.getuid?.() &&
      (file.mode & 63) === 0,
    'driver lock private claim differs',
  );
  return readFile2(claim);
}
async function acquireAzureTerraformNetworkDriverLease(directory) {
  const unlock = await acquireProcessLock(join7(directory, '.terraform-network-driver-lock'));
  try {
    const claimSha256 = hash11(await claimBytes(directory)),
      lease = Object.freeze({}),
      current = { directory, claimSha256, active: true };
    ownership.set(lease, current);
    return {
      lease,
      async release() {
        held(lease, directory);
        current.active = false;
        await unlock();
      },
    };
  } catch (error) {
    await unlock();
    throw error;
  }
}
async function verifyAzureTerraformNetworkDriverLease(lease, directory) {
  const current = held(lease, directory),
    expected = current.claimSha256;
  require44(hash11(await claimBytes(directory)) === expected, 'original owning driver claim changed');
  require44(
    held(lease, directory) === current && current.claimSha256 === expected,
    'driver ownership changed during verification',
  );
}

// plugins/azure/src/ce/terraform-network-nic-binding.ts
function require45(value, message) {
  if (!value) throw Error(`Azure Terraform network NIC binding: ${message}`);
}
async function bindAzureTerraformNetworkNicPlan(
  plan,
  stage,
  inventory,
  receipt,
  providerLockSha256,
  session,
  store,
  env,
  signal,
) {
  require45(canonicalSha256(store.owner) === canonicalSha256(azureUpgradeBinding(plan).owner), 'storage owner differs');
  require45(
    session.readPlannedResourcePaths && session.readProposedResourcePaths,
    'owning private paths capability required',
  );
  validateAzureNetworkUpdateTerraformReceipt(plan, stage, receipt, providerLockSha256);
  require45(providerLockSha256 === AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256, 'unqualified provider lock');
  const selections = azureTerraformNetworkNicSelections(plan, stage, inventory);
  signal?.throwIfAborted();
  await store.verify();
  const unlock = await acquireProcessLock(`${store.directory}/.terraform-network-nic-binding-lock`);
  try {
    signal?.throwIfAborted();
    await store.verify();
    const name = `${plan.planId}-terraform-network-node-${stage.node}-nic-binding.json`;
    const identity = {
      schemaVersion: 1,
      planSha256: plan.planSha256,
      stageSha256: canonicalSha256(stage),
      inventorySha256: canonicalSha256(inventory),
      receiptSha256: canonicalSha256(receipt),
      providerLockSha256,
    };
    const validate = (input) => {
      const value = input;
      require45(
        value &&
          typeof value === 'object' &&
          !Array.isArray(value) &&
          canonicalSha256(Object.keys(value).sort()) ===
            canonicalSha256([...Object.keys(identity), 'prior', 'proposed'].sort()),
        'saved binding schema differs',
      );
      for (const [key, expected] of Object.entries(identity))
        require45(value[key] === expected, 'saved binding identity differs');
      validateAzureTerraformNetworkNicProjection(
        plan,
        stage,
        inventory,
        receipt,
        providerLockSha256,
        value.prior,
        value.proposed,
      );
      return value;
    };
    let saved;
    try {
      saved = await store.read(name);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (saved !== undefined) return validate(saved);
    require45(
      (await session.readPlanApplicationState(receipt)) === 'planned',
      'unsubmitted saved plan required for new binding',
    );
    const prior = await session.readPlannedResourcePaths(receipt, selections.prior, env, signal);
    const proposed = await session.readProposedResourcePaths(receipt, selections.proposed, env, signal);
    signal?.throwIfAborted();
    require45((await session.readPlanApplicationState(receipt)) === 'planned', 'plan submitted during projection');
    const binding = validate({ ...identity, prior, proposed });
    await store.write(name, binding);
    return binding;
  } finally {
    await unlock();
  }
}

// plugins/azure/src/ce/terraform-network-nic-execution.ts
var same33 = canonicalEqual;
var lower10 = (value) => value.toLowerCase();
function require46(value, message) {
  if (!value) throw Error(`Azure Terraform network NIC execution: ${message}`);
}
function object32(value) {
  require46(value && typeof value === 'object' && !Array.isArray(value), 'complete object required');
  return value;
}
async function optional4(store, name) {
  try {
    return await store.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function runAzureTerraformNetworkNicStage(
  plan,
  source,
  before,
  node,
  appliedNics,
  session,
  store,
  api,
  env,
  signal,
  polling = {
    attempts: 90,
    intervalMs: 1e4,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  },
) {
  const stage = buildAzureTerraformNetworkPinnedNicStage(plan, source, before, node);
  require46(same33(store.owner, azureUpgradeBinding(plan).owner), 'storage owner differs');
  const priorKeys = Array.from({ length: node - 1 }, (_, i) => plan.nics.map((nic) => `${i + 1}:${nic.index}`)).flat();
  require46(same33(appliedNics, priorKeys), 'complete serial predecessor NIC boundary required');
  require46(
    Number.isInteger(polling.attempts) &&
      polling.attempts > 0 &&
      Number.isFinite(polling.intervalMs) &&
      polling.intervalMs >= 0,
    'invalid convergence bounds',
  );
  require46(
    session.readPlannedResourcePaths && session.readProposedResourcePaths,
    'owning private paths capability required',
  );
  const selectedKeys = plan.nics.map((nic) => `${node}:${nic.index}`),
    targetKeys = [...appliedNics, ...selectedKeys];
  const baseline = (inventory) =>
    Object.entries(before.nodes[String(node)].nics).every(([index, nic]) => {
      const current = inventory.nodes[String(node)].nics[index];
      return lower10(current.subnetId) === lower10(nic.subnetId) && current.privateIp === nic.privateIp;
    });
  const observe = async () => {
    signal?.throwIfAborted();
    const deadline = AbortSignal.any([AbortSignal.timeout(30000), ...(signal ? [signal] : [])]);
    const bounded = {
      async exec(command, args) {
        deadline.throwIfAborted();
        let rejectAbort;
        const aborted = new Promise((_, reject) => {
          rejectAbort = reject;
        });
        const onAbort = () => rejectAbort?.(deadline.reason);
        deadline.addEventListener('abort', onAbort, { once: true });
        try {
          const response = await Promise.race([api.exec(command, args, { signal: deadline }), aborted]);
          deadline.throwIfAborted();
          return response;
        } finally {
          deadline.removeEventListener('abort', onAbort);
        }
      },
    };
    const inventory = await captureAzureNetworkUpdateInventory(plan, bounded, deadline);
    const reached = selectedKeys.filter((key) => {
      const index = key.split(':')[1];
      return (
        lower10(inventory.nodes[String(node)].nics[index].subnetId) ===
        lower10(before.nodes[String(node)].nics[index].targetSubnetId)
      );
    });
    const progress = [...appliedNics, ...reached];
    verifyAzureNetworkUpdateProgress(plan, before, inventory, progress);
    for (const [owner, vm] of Object.entries(before.nodes))
      for (const [index, nic] of Object.entries(vm.nics))
        if (!progress.includes(`${owner}:${index}`))
          require46(
            inventory.nodes[owner].nics[index].privateIp === nic.privateIp,
            'unsubmitted NIC private IP changed',
          );
    const power = await observeAzureTerraformNetworkPower(
      plan,
      before,
      node,
      'deallocate',
      progress,
      bounded,
      deadline,
    );
    require46(
      same33(power.inventory.nodes, inventory.nodes),
      'cloud identity changed between NIC and power observations',
    );
    require46(power.converged && power.powerState === 'deallocated', 'selected VM is not deallocated');
    return {
      ...power,
      appliedNics: progress,
      nicConverged: reached.length === selectedKeys.length,
      baseline: baseline(power.inventory),
    };
  };
  const poll = async () => {
    for (let i = 0; i < polling.attempts; i++) {
      signal?.throwIfAborted();
      const cloud = await observe();
      if (cloud.nicConverged) return cloud;
      if (i + 1 < polling.attempts) await polling.wait(polling.intervalMs);
    }
    throw Error('Azure Terraform network NIC execution: selected NIC subnets have not converged');
  };
  const validateCloud = (input) => {
    const value = object32(input);
    require46(
      same33(
        Object.keys(value).sort(),
        [
          'appliedNics',
          'baseline',
          'converged',
          'engine',
          'inventory',
          'nicConverged',
          'node',
          'observedAt',
          'operation',
          'ownerPlanSha256',
          'planSha256',
          'powerState',
          'resourceId',
          'vmId',
        ].sort(),
      ),
      'saved cloud schema differs',
    );
    const cloud = input;
    require46(
      cloud.engine === 'terraform' &&
        cloud.planSha256 === plan.planSha256 &&
        cloud.node === node &&
        cloud.operation === 'deallocate' &&
        cloud.resourceId === before.nodes[String(node)].resourceId &&
        cloud.vmId === before.nodes[String(node)].vmId &&
        cloud.ownerPlanSha256 === before.nodes[String(node)].ownerPlanSha256 &&
        cloud.powerState === 'deallocated' &&
        cloud.converged === true &&
        cloud.nicConverged === true &&
        same33(cloud.appliedNics, targetKeys) &&
        typeof cloud.observedAt === 'string' &&
        Number.isFinite(Date.parse(cloud.observedAt)),
      'saved convergence identity differs',
    );
    verifyAzureNetworkUpdateProgress(plan, before, cloud.inventory, targetKeys);
    require46(cloud.baseline === baseline(cloud.inventory), 'saved baseline differs');
    return cloud;
  };
  signal?.throwIfAborted();
  await store.verify();
  const unlock = await acquireProcessLock(`${store.directory}/.terraform-network-nic-lock`);
  try {
    signal?.throwIfAborted();
    await store.verify();
    const prefix = `${plan.planId}-terraform-network-node-${node}`;
    const configuration = async () => {
      const current = await session.readConfigurationSha256?.();
      require46(
        current === stage.previousConfigurationSha256 || current === stage.configurationSha256,
        'private configuration differs',
      );
      return current;
    };
    await configuration();
    const prepared = {
      schemaVersion: 1,
      planSha256: plan.planSha256,
      inventorySha256: canonicalSha256(before),
      appliedNics,
      stage,
    };
    const savedPrepared = await optional4(store, `${prefix}-prepared.json`);
    if (savedPrepared === undefined) {
      for (const suffix of [
        'mutation-plan',
        'mutation-outcome',
        'mutation-complete',
        'final-plan',
        'current-no-change-plan',
        'nic-binding',
      ])
        require46(
          (await optional4(store, `${prefix}-${suffix}.json`)) === undefined,
          'prepared history missing after later stage publication',
        );
      require46(
        (await configuration()) === stage.previousConfigurationSha256,
        'target revision lacks original prepared history',
      );
      require46((await observe()).baseline, 'unsubmitted cloud baseline differs');
      require46(
        (await session.readConfiguration(stage.previousConfigurationSha256)) === source,
        'retained source bytes differ',
      );
      await store.write(`${prefix}-prepared.json`, prepared);
    } else require46(same33(savedPrepared, prepared), 'saved prepared stage differs');
    if ((await configuration()) !== stage.configurationSha256) {
      require46((await observe()).baseline, 'cloud changed before configuration revision');
      await session.reviseConfiguration(stage.previousConfigurationSha256, stage.configuration);
    }
    require46((await configuration()) === stage.configurationSha256, 'NIC revision differs');
    let mutation = await optional4(store, `${prefix}-mutation-plan.json`);
    if (mutation === undefined) {
      require46((await observe()).baseline, 'unsubmitted NIC baseline differs');
      mutation = await session.plan(env, signal);
      validateAzureNetworkUpdateTerraformReceipt(plan, stage, mutation, AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256);
      await store.write(`${prefix}-mutation-plan.json`, mutation);
    }
    const receipt = mutation;
    validateAzureNetworkUpdateTerraformReceipt(plan, stage, receipt, AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256);
    await bindAzureTerraformNetworkNicPlan(
      plan,
      stage,
      before,
      receipt,
      AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256,
      session,
      store,
      env,
      signal,
    );
    const validateCompletion = (input) => {
      const value = object32(input);
      require46(
        same33(Object.keys(value).sort(), ['outcome', 'receiptSha256', 'schemaVersion']) &&
          value.schemaVersion === 1 &&
          value.receiptSha256 === canonicalSha256(receipt),
        'saved mutation completion differs',
      );
      return validateCloud(value.outcome);
    };
    const completion = await optional4(store, `${prefix}-mutation-complete.json`);
    if (completion === undefined) {
      let state = await session.readPlanApplicationState(receipt);
      require46(['planned', 'applying', 'applied'].includes(state), 'mutation application state unavailable');
      if (state === 'planned') {
        require46((await observe()).baseline, 'planned NIC baseline changed');
        if (!receipt.noChanges) {
          require46((await configuration()) === stage.configurationSha256, 'configuration changed before apply');
          try {
            await session.apply(receipt, env, signal);
          } catch (error) {
            signal?.throwIfAborted();
            state = await session.readPlanApplicationState(receipt);
            if (state !== 'applying' && state !== 'applied') throw error;
          }
          state = await session.readPlanApplicationState(receipt);
        }
      }
      const outcome = await poll();
      validateCloud(outcome);
      await store.write(`${prefix}-mutation-outcome.json`, outcome);
      if (state === 'applying') await session.reconcileApplyFromEvidence(receipt, canonicalSha256(outcome));
      else require46(receipt.noChanges || state === 'applied', 'mutation has no authoritative submitted outcome');
      const completed = { schemaVersion: 1, receiptSha256: canonicalSha256(receipt), outcome };
      validateCompletion(completed);
      await store.write(`${prefix}-mutation-complete.json`, completed);
    } else validateCompletion(completion);
    const cloud = await poll();
    require46((await configuration()) === stage.configurationSha256, 'completed NIC configuration changed');
    const final = await session.plan(env, signal);
    validateAzureNetworkUpdateTerraformReceipt(plan, stage, final, AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256);
    require46(final.noChanges, 'final refresh plan changes retained resources');
    const selections = azureTerraformNetworkNicSelections(plan, stage, cloud.inventory);
    const prior = await session.readPlannedResourcePaths(final, selections.prior, env, signal),
      proposed = await session.readProposedResourcePaths(final, selections.proposed, env, signal);
    validateAzureTerraformNetworkNicProjection(
      plan,
      stage,
      cloud.inventory,
      final,
      AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256,
      prior,
      proposed,
    );
    const terminalCloud = await poll();
    require46(
      same33(terminalCloud.inventory.nodes, cloud.inventory.nodes),
      'final NIC identity changed during plan projection',
    );
    const terminal = { schemaVersion: 1, receipt: final, cloud: terminalCloud, prior, proposed };
    const validateTerminal = (input) => {
      const value = object32(input);
      require46(
        same33(Object.keys(value).sort(), ['cloud', 'prior', 'proposed', 'receipt', 'schemaVersion']) &&
          value.schemaVersion === 1,
        'saved final schema differs',
      );
      const observed = validateCloud(value.cloud),
        finalReceipt = value.receipt;
      validateAzureNetworkUpdateTerraformReceipt(plan, stage, finalReceipt, AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256);
      require46(finalReceipt.noChanges, 'saved final plan changes retained resources');
      validateAzureTerraformNetworkNicProjection(
        plan,
        stage,
        observed.inventory,
        finalReceipt,
        AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256,
        value.prior,
        value.proposed,
      );
    };
    validateTerminal(terminal);
    const savedFinal = await optional4(store, `${prefix}-final-plan.json`);
    if (savedFinal === undefined) await store.write(`${prefix}-final-plan.json`, terminal);
    else validateTerminal(savedFinal);
    await store.write(`${prefix}-current-no-change-plan.json`, terminal);
    return {
      status: 'nic-stage-complete',
      engine: 'terraform',
      planSha256: plan.planSha256,
      node,
      resourceId: terminalCloud.resourceId,
      vmId: terminalCloud.vmId,
      mutationPlanSha256: receipt.planSha256,
      currentNoChangePlanSha256: final.planSha256,
      cloudEvidenceSha256: canonicalSha256(terminalCloud),
    };
  } finally {
    await unlock();
  }
}

// plugins/azure/src/ce/terraform-network-power-completed-retirement.ts
import { createHash as createHash27 } from 'node:crypto';
import { lstat as lstat8, readdir as readdir8, realpath as realpath7 } from 'node:fs/promises';
// plugins/azure/src/ce/terraform-network-power-lifecycle.ts
import { join as join8, join as join9 } from 'node:path';

class AzureTerraformPowerLifecycleInterrupted extends Error {
  completion;
  constructor(completion) {
    super('Azure Terraform network power lifecycle: interrupted mutation retains owning locks until settlement');
    this.completion = completion;
  }
}
async function withAzureTerraformPowerLifecycle(directory, deadline, seal, run, options = {}) {
  const pending = new Set();
  const step = async (action, mutation = false) => {
    deadline.throwIfAborted();
    seal();
    const aborted = Promise.withResolvers(),
      onAbort = () => aborted.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const promise = action();
      if (mutation) {
        pending.add(promise);
        promise.then(
          () => pending.delete(promise),
          () => pending.delete(promise),
        );
      }
      const result = await Promise.race([promise, aborted.promise]);
      deadline.throwIfAborted();
      seal();
      return result;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  deadline.throwIfAborted();
  seal();
  await options.beforeLock?.(step);
  let unlockDriver,
    unlockPower,
    deferredRelease = false;
  const releaseLocks = async () => {
    const failures = [];
    if (unlockPower) {
      try {
        await unlockPower();
      } catch {
        failures.push('power-lock-release-failed');
      }
    }
    if (unlockDriver) {
      try {
        await unlockDriver();
      } catch {
        failures.push('driver-lock-release-failed');
      }
    }
    return { locksReleased: failures.length === 0, failures };
  };
  const failRelease = () => {
    if (options.releaseFailure) return options.releaseFailure();
    throw Error('Azure Terraform network power lifecycle: owning locks could not be released');
  };
  try {
    if (options.lockDriver !== false)
      unlockDriver = await acquireProcessLock(join8(directory, '.terraform-network-driver-lock'));
    deadline.throwIfAborted();
    seal();
    unlockPower = await acquireProcessLock(join8(directory, '.terraform-network-power-lock'));
    deadline.throwIfAborted();
    seal();
    const value = await run(step);
    deadline.throwIfAborted();
    seal();
    return value;
  } catch (error) {
    if (pending.size) {
      deferredRelease = true;
      const completion = Promise.allSettled([...pending]).then(async (results) => ({
        mutationSettlements: results.map((result) => result.status),
        ...(await releaseLocks()),
      }));
      throw options.interrupted?.(completion) ?? new AzureTerraformPowerLifecycleInterrupted(completion);
    }
    throw error;
  } finally {
    if (!deferredRelease && !(await releaseLocks()).locksReleased) failRelease();
  }
}

// plugins/azure/src/ce/terraform-network-retirement-graph.ts
import { createHash as createHash26 } from 'node:crypto';
import { readdir as readdir7 } from 'node:fs/promises';

// plugins/azure/src/ce/terraform-network-nic-history.ts
var same34 = canonicalEqual;
function require47(value, message) {
  if (!value) throw Error(`Azure Terraform network NIC history: ${message}`);
}
function keys10(value, expected) {
  require47(value && typeof value === 'object' && !Array.isArray(value), 'saved object required');
  const row = value;
  require47(same34(Object.keys(row).sort(), expected.toSorted()), 'saved schema differs');
  return row;
}
async function readAzureTerraformNetworkNicHistory(request, sourceRequest, original, node, store, signal) {
  const plan = structuredClone(request),
    before = structuredClone(original),
    source = sourceRequest,
    owner = structuredClone(store.owner),
    { read, verify } = store;
  verifyAzureCePlan(plan);
  validateAzureNetworkUpdateInventory(plan, before);
  require47(
    plan.engine === 'terraform' &&
      plan.intent.operation === 'update-network' &&
      Number.isInteger(node) &&
      node >= 1 &&
      node <= plan.topology.nodeCount &&
      same34(owner, azureUpgradeBinding(plan).owner),
    'exact owning serial NIC boundary required',
  );
  const stage = buildAzureTerraformNetworkPinnedNicStage(plan, source, before, node),
    previous = Array.from({ length: node - 1 }, (_, i) => plan.nics.map((nic) => `${i + 1}:${nic.index}`)).flat(),
    reached = [...previous, ...plan.nics.map((nic) => `${node}:${nic.index}`)];
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const unchanged = () =>
    require47(
      same34(request, plan) &&
        same34(original, before) &&
        same34(store.owner, owner) &&
        store.read === read &&
        store.verify === verify,
      'request or storage changed during NIC history read',
    );
  const bounded = async (task) => {
    deadline.throwIfAborted();
    unchanged();
    const abort = Promise.withResolvers(),
      onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([task(), abort.promise]);
      deadline.throwIfAborted();
      unchanged();
      return result;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  await bounded(() => verify.call(store));
  const prefix = `${plan.planId}-terraform-network-node-${node}`;
  const suffixes = [
    'prepared',
    'mutation-plan',
    'nic-binding',
    'mutation-outcome',
    'mutation-complete',
    'final-plan',
    'current-no-change-plan',
  ];
  const records = new Map(),
    packetSha256ByName = {};
  for (const suffix of suffixes) {
    const name = `${prefix}-${suffix}.json`;
    try {
      const value = await bounded(() => read.call(store, name));
      records.set(suffix, structuredClone(value));
      packetSha256ByName[name] = canonicalSha256(value);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  for (let i = 1; i < suffixes.length; i++)
    require47(!records.has(suffixes[i]) || records.has(suffixes[i - 1]), 'orphan later NIC packet');
  if (records.has('prepared')) {
    const prepared = keys10(records.get('prepared'), [
      'schemaVersion',
      'planSha256',
      'inventorySha256',
      'appliedNics',
      'stage',
    ]);
    require47(
      prepared.schemaVersion === 1 &&
        prepared.planSha256 === plan.planSha256 &&
        prepared.inventorySha256 === canonicalSha256(before) &&
        same34(prepared.appliedNics, previous) &&
        same34(prepared.stage, stage),
      'prepared source or serial NIC boundary differs',
    );
  }
  const receipts = {};
  if (records.has('mutation-plan')) {
    const receipt = records.get('mutation-plan');
    validateAzureNetworkUpdateTerraformReceipt(plan, stage, receipt, AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256);
    receipts.mutation = structuredClone(receipt);
    if (records.has('nic-binding')) {
      const binding = keys10(records.get('nic-binding'), [
        'schemaVersion',
        'planSha256',
        'stageSha256',
        'inventorySha256',
        'receiptSha256',
        'providerLockSha256',
        'prior',
        'proposed',
      ]);
      require47(
        binding.schemaVersion === 1 &&
          binding.planSha256 === plan.planSha256 &&
          binding.stageSha256 === canonicalSha256(stage) &&
          binding.inventorySha256 === canonicalSha256(before) &&
          binding.receiptSha256 === canonicalSha256(receipt) &&
          binding.providerLockSha256 === AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256,
        'NIC projection binding differs',
      );
      validateAzureTerraformNetworkNicProjection(
        plan,
        stage,
        before,
        receipt,
        AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256,
        binding.prior,
        binding.proposed,
      );
    }
  }
  const cloud = (value) => {
    const row = keys10(value, [
      'engine',
      'planSha256',
      'node',
      'operation',
      'resourceId',
      'vmId',
      'ownerPlanSha256',
      'powerState',
      'converged',
      'inventory',
      'observedAt',
      'appliedNics',
      'baseline',
      'nicConverged',
    ]);
    const vm = before.nodes[String(node)];
    require47(
      row.engine === 'terraform' &&
        row.planSha256 === plan.planSha256 &&
        row.node === node &&
        row.operation === 'deallocate' &&
        row.resourceId === vm.resourceId &&
        row.vmId === vm.vmId &&
        row.ownerPlanSha256 === vm.ownerPlanSha256 &&
        row.powerState === 'deallocated' &&
        row.converged === true &&
        row.nicConverged === true &&
        same34(row.appliedNics, reached) &&
        typeof row.observedAt === 'string' &&
        Number.isFinite(Date.parse(row.observedAt)),
      'saved NIC cloud identity or completion differs',
    );
    const inventory = validateAzureNetworkUpdateInventory(plan, row.inventory);
    verifyAzureNetworkUpdateProgress(plan, before, inventory, reached);
    for (const [ownerNode, instance] of Object.entries(before.nodes))
      for (const [index, nic] of Object.entries(instance.nics))
        if (!reached.includes(`${ownerNode}:${index}`))
          require47(
            inventory.nodes[ownerNode].nics[index].privateIp === nic.privateIp,
            'unsubmitted historical NIC address differs',
          );
    const baseline = Object.entries(vm.nics).every(([index, nic]) => {
      const observed = inventory.nodes[String(node)].nics[index];
      return observed.subnetId.toLowerCase() === nic.subnetId.toLowerCase() && observed.privateIp === nic.privateIp;
    });
    require47(row.baseline === baseline, 'saved NIC baseline differs');
    return inventory;
  };
  if (records.has('mutation-outcome')) cloud(records.get('mutation-outcome'));
  if (records.has('mutation-complete')) {
    const complete = keys10(records.get('mutation-complete'), ['schemaVersion', 'receiptSha256', 'outcome']);
    require47(
      complete.schemaVersion === 1 &&
        complete.receiptSha256 === canonicalSha256(receipts.mutation) &&
        same34(complete.outcome, records.get('mutation-outcome')),
      'completion differs from exact receipt/outcome',
    );
  }
  for (const [suffix, phase] of [
    ['final-plan', 'final'],
    ['current-no-change-plan', 'current'],
  ])
    if (records.has(suffix)) {
      const packet = keys10(records.get(suffix), ['schemaVersion', 'receipt', 'cloud', 'prior', 'proposed']);
      require47(packet.schemaVersion === 1, 'final NIC packet version differs');
      const inventory = cloud(packet.cloud),
        receipt = packet.receipt;
      validateAzureNetworkUpdateTerraformReceipt(plan, stage, receipt, AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256);
      require47(receipt.noChanges, 'historical final NIC plan changes resources');
      validateAzureTerraformNetworkNicProjection(
        plan,
        stage,
        inventory,
        receipt,
        AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256,
        packet.prior,
        packet.proposed,
      );
      receipts[phase] = structuredClone(receipt);
    }
  await bounded(() => verify.call(store));
  for (const suffix of suffixes) {
    const name = `${prefix}-${suffix}.json`;
    try {
      const value = await bounded(() => read.call(store, name));
      require47(
        records.has(suffix) && canonicalSha256(value) === packetSha256ByName[name],
        'packet changed or appeared',
      );
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      require47(!records.has(suffix), 'packet disappeared');
    }
  }
  return {
    schemaVersion: 1,
    scope: 'network-nic-packet-history',
    planSha256: plan.planSha256,
    sourceConfigurationSha256: stage.previousConfigurationSha256,
    node,
    lastPacket: suffixes.findLast((suffix) => records.has(suffix)) ?? null,
    allPacketsPresent: records.size === suffixes.length,
    receipts,
    packetSha256ByName,
    currentOperationalAcceptanceQualified: false,
    retirementQualified: false,
  };
}

// plugins/azure/src/ce/terraform-network-power-history.ts
var same35 = canonicalEqual;
function require48(value, message) {
  if (!value) throw Error(`Azure Terraform network power history: ${message}`);
}
function keys11(value, expected) {
  require48(value && typeof value === 'object' && !Array.isArray(value), 'saved object required');
  const row = value;
  require48(same35(Object.keys(row).sort(), expected.toSorted()), 'saved schema differs');
  return row;
}
async function readAzureTerraformNetworkPowerHistory(
  request,
  original,
  node,
  operation,
  appliedNicsRequest,
  store,
  signal,
) {
  const plan = structuredClone(request),
    before = structuredClone(original),
    appliedNics = [...appliedNicsRequest],
    owner = structuredClone(store.owner),
    { read, verify } = store;
  verifyAzureCePlan(plan);
  validateAzureNetworkUpdateInventory(plan, before);
  const expected = Array.from({ length: operation === 'start' ? node : node - 1 }, (_, i) =>
    plan.nics.map((nic) => `${i + 1}:${nic.index}`),
  ).flat();
  require48(
    plan.engine === 'terraform' &&
      plan.intent.operation === 'update-network' &&
      Number.isInteger(node) &&
      node >= 1 &&
      node <= plan.topology.nodeCount &&
      ['deallocate', 'start'].includes(operation) &&
      same35(owner, azureUpgradeBinding(plan).owner) &&
      same35(appliedNics, expected),
    'exact owning serial power boundary required',
  );
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const unchanged = () =>
    require48(
      same35(request, plan) &&
        same35(original, before) &&
        same35(appliedNicsRequest, appliedNics) &&
        same35(store.owner, owner) &&
        store.read === read &&
        store.verify === verify,
      'request or storage changed during history read',
    );
  const bounded = async (task) => {
    deadline.throwIfAborted();
    unchanged();
    const abort = Promise.withResolvers();
    const onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([task(), abort.promise]);
      deadline.throwIfAborted();
      unchanged();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  await bounded(() => verify.call(store));
  const prefix = `${plan.planId}-terraform-network-node-${node}-${operation}`;
  const suffixes = [
    'mutation-plan',
    'mutation-binding',
    'mutation-outcome',
    'mutation-complete',
    'release-plan',
    'release-binding',
    'release-outcome',
    'release-complete',
    'final-plan',
    'current-no-change-plan',
  ];
  const records = new Map(),
    packetSha256ByName = {};
  for (const suffix of suffixes) {
    const name = `${prefix}-${suffix}.json`;
    try {
      const value = await bounded(() => read.call(store, name));
      records.set(suffix, structuredClone(value));
      packetSha256ByName[name] = canonicalSha256(value);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  for (let i = 1; i < suffixes.length; i++)
    require48(!records.has(suffixes[i]) || records.has(suffixes[i - 1]), 'orphan later packet');
  const cloud = (value) => {
    const row = keys11(value, [
      'engine',
      'planSha256',
      'node',
      'operation',
      'resourceId',
      'vmId',
      'ownerPlanSha256',
      'powerState',
      'converged',
      'inventory',
      'observedAt',
    ]);
    const vm = before.nodes[String(node)];
    require48(
      row.engine === 'terraform' &&
        row.planSha256 === plan.planSha256 &&
        row.node === node &&
        row.operation === operation &&
        row.resourceId === vm.resourceId &&
        row.vmId === vm.vmId &&
        row.ownerPlanSha256 === vm.ownerPlanSha256 &&
        row.converged === true &&
        row.powerState === (operation === 'start' ? 'running' : 'deallocated') &&
        typeof row.observedAt === 'string' &&
        Number.isFinite(Date.parse(row.observedAt)),
      'historical cloud identity or outcome differs',
    );
    const inventory = validateAzureNetworkUpdateInventory(plan, row.inventory);
    verifyAzureNetworkUpdateProgress(plan, before, inventory, appliedNics);
    for (const [key, instance] of Object.entries(before.nodes))
      for (const [index, nic] of Object.entries(instance.nics))
        if (!appliedNics.includes(`${key}:${index}`))
          require48(
            inventory.nodes[key].nics[index].privateIp === nic.privateIp,
            'unsubmitted historical NIC address differs',
          );
  };
  const receipts = {};
  for (const phase of ['mutation', 'release']) {
    if (!records.has(`${phase}-plan`)) continue;
    const receipt = await bounded(() =>
      validateAzureTerraformNetworkPowerPlan(plan, before, node, operation, records.get(`${phase}-plan`), phase),
    );
    receipts[phase] = receipt;
    if (records.has(`${phase}-binding`)) {
      const binding = keys11(records.get(`${phase}-binding`), ['schemaVersion', 'receiptSha256', 'prior', 'proposed']);
      require48(
        binding.schemaVersion === 1 && binding.receiptSha256 === canonicalSha256(receipt),
        'projection receipt differs',
      );
      await bounded(() =>
        validateAzureTerraformNetworkPowerProjection(
          plan,
          before,
          node,
          operation,
          receipt,
          phase,
          binding.prior,
          binding.proposed,
        ),
      );
    }
    if (records.has(`${phase}-outcome`)) {
      const outcome = records.get(`${phase}-outcome`);
      if (phase === 'mutation') cloud(outcome);
      else {
        const released = keys11(outcome, ['cloud', 'state']);
        require48(same35(released.state, { 'azapi_resource_action.ce_network': null }), 'released control remains');
        cloud(released.cloud);
      }
    }
    if (records.has(`${phase}-complete`)) {
      const complete = keys11(records.get(`${phase}-complete`), ['schemaVersion', 'receiptSha256', 'outcome']);
      require48(
        complete.schemaVersion === 1 &&
          complete.receiptSha256 === canonicalSha256(receipt) &&
          same35(complete.outcome, records.get(`${phase}-outcome`)),
        'completion differs from exact receipt/outcome',
      );
    }
  }
  for (const [suffix, key] of [
    ['final-plan', 'final'],
    ['current-no-change-plan', 'current'],
  ])
    if (records.has(suffix))
      receipts[key] = await bounded(() =>
        validateAzureTerraformNetworkPowerPlan(plan, before, node, operation, records.get(suffix), 'final'),
      );
  for (const suffix of suffixes) {
    const name = `${prefix}-${suffix}.json`;
    try {
      const value = await bounded(() => read.call(store, name));
      require48(
        records.has(suffix) && canonicalSha256(value) === packetSha256ByName[name],
        'packet changed or appeared during history read',
      );
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      require48(!records.has(suffix), 'packet disappeared during history read');
    }
  }
  await bounded(() => verify.call(store));
  return {
    schemaVersion: 1,
    scope: 'network-power-packet-history',
    planSha256: plan.planSha256,
    node,
    operation,
    lastPacket: suffixes.findLast((suffix) => records.has(suffix)) ?? null,
    allPacketsPresent: records.size === suffixes.length,
    receipts,
    packetSha256ByName,
    currentOperationalAcceptanceQualified: false,
    retirementQualified: false,
  };
}

// plugins/azure/src/ce/terraform-network-source-history.ts
import { createHash as createHash24 } from 'node:crypto';

var same36 = (a, b) => canonicalEqual(a, b);
var hash12 = (s) => createHash24('sha256').update(s).digest('hex');
function require49(value, message) {
  if (!value) throw Error(`Azure Terraform network source history: ${message}`);
}
async function readAzureTerraformNetworkSourceHistory(
  request,
  store,
  loaders,
  siteRequest,
  verifier,
  signal,
  replacementVerifier,
) {
  const plan = structuredClone(request),
    site = structuredClone(siteRequest),
    owner = structuredClone(store.owner),
    { directory, read, verify } = store,
    { loadSource, loadOutcome } = loaders;
  verifyAzureCePlan(plan);
  require49(
    plan.engine === 'terraform' &&
      plan.intent.operation === 'update-network' &&
      same36(owner, azureUpgradeBinding(plan).owner) &&
      typeof verifier === 'function' &&
      same36(Object.keys(site).sort(), ['siteConfigurationSha256', 'siteUid']) &&
      typeof site.siteUid === 'string' &&
      !!site.siteUid &&
      /^[a-f0-9]{64}$/.test(site.siteConfigurationSha256),
    'exact original owning network and site binding required',
  );
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const unchanged = () =>
    require49(
      same36(request, plan) &&
        same36(siteRequest, site) &&
        same36(store.owner, owner) &&
        store.directory === directory &&
        store.read === read &&
        store.verify === verify &&
        loaders.loadSource === loadSource &&
        loaders.loadOutcome === loadOutcome,
      'request, owner, storage or loaders changed during historical qualification',
    );
  const bounded = async (task) => {
    deadline.throwIfAborted();
    unchanged();
    const abort = Promise.withResolvers();
    const onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([task(), abort.promise]);
      deadline.throwIfAborted();
      unchanged();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  await bounded(() => verify.call(store));
  const packetSha256ByName = {},
    sources = new Map(),
    outcomes = new Map();
  const trackedRead = async (name) => {
    const value = await bounded(() => read.call(store, name)),
      digest = canonicalSha256(value);
    require49(
      packetSha256ByName[name] === undefined || packetSha256ByName[name] === digest,
      'packet changed between history reads',
    );
    packetSha256ByName[name] = digest;
    return structuredClone(value);
  };
  const trackedVerify = () => bounded(() => verify.call(store));
  const readonlyStore = new Proxy(store, {
    get(target, key) {
      if (key === 'read') return trackedRead;
      if (key === 'verify') return trackedVerify;
      if (['write', 'remove', 'retire'].includes(String(key)))
        return () => {
          throw Error('Historical source qualification must not mutate storage');
        };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const trackedLoaders = {
    async loadSource(digest) {
      const value = await bounded(() => loadSource.call(loaders, digest));
      verifyAzureCePlan(value);
      const actual = canonicalSha256(value);
      require49(
        value.planSha256 === digest && (!sources.has(digest) || sources.get(digest) === actual),
        'predecessor source changed or declared digest differs',
      );
      sources.set(digest, actual);
      return structuredClone(value);
    },
    async loadOutcome(source) {
      const value = await bounded(() => loadOutcome.call(loaders, structuredClone(source))),
        digest = canonicalSha256(value);
      require49(
        !outcomes.has(source.planSha256) || outcomes.get(source.planSha256)?.digest === digest,
        'predecessor outcome changed between reads',
      );
      outcomes.set(source.planSha256, { plan: structuredClone(source), digest });
      return structuredClone(value);
    },
  };
  const name = `${plan.planId}-terraform-network-source.json`;
  const input = await trackedRead(name);
  require49(input && typeof input === 'object' && !Array.isArray(input), 'original source packet unavailable');
  const binding = input;
  require49(
    same36(Object.keys(binding).sort(), [
      'before',
      'engine',
      'kind',
      'outputs',
      'owner',
      'planSha256',
      'providerLockSha256',
      'qualification',
      'schemaVersion',
      'source',
      'sourceConfigurationSha256',
    ]) &&
      binding.schemaVersion === 1 &&
      binding.engine === 'terraform' &&
      binding.kind === 'azure-terraform-network-original-source' &&
      same36(binding.owner, owner) &&
      binding.planSha256 === plan.planSha256 &&
      binding.providerLockSha256 === AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256 &&
      typeof binding.source === 'string' &&
      hash12(binding.source) === binding.sourceConfigurationSha256,
    'original source packet identity, schema or bytes differ',
  );
  validateAzureNetworkUpdateInventory(plan, binding.before);
  verifyAzureTerraformNetworkUpdateState(plan, binding.before, binding.outputs);
  const historical = (receipt, identity, mode) => {
    require49(mode === 'historical', 'original-source history cannot request current acceptance');
    return bounded(() => verifier(structuredClone(receipt), structuredClone(identity), mode, deadline));
  };
  const qualification = await bounded(() =>
    qualifyAzureTerraformNetworkGenerationSource(
      plan,
      binding.source,
      binding.before,
      readonlyStore,
      trackedLoaders,
      binding.providerLockSha256,
      site,
      historical,
      deadline,
      replacementVerifier,
    ),
  );
  require49(
    same36(binding.qualification, qualification),
    'original source qualification differs from owning generation history',
  );
  for (const [digest, expected] of sources)
    require49(
      canonicalSha256(await bounded(() => loadSource.call(loaders, digest))) === expected,
      'predecessor source changed before final history boundary',
    );
  for (const { plan: source, digest } of outcomes.values())
    require49(
      canonicalSha256(await bounded(() => loadOutcome.call(loaders, structuredClone(source)))) === digest,
      'predecessor outcome changed before final history boundary',
    );
  for (const [packet, digest] of Object.entries(packetSha256ByName))
    require49(
      canonicalSha256(await bounded(() => read.call(store, packet))) === digest,
      'packet changed before final history boundary',
    );
  await bounded(() => verify.call(store));
  require49(
    canonicalSha256(await bounded(() => read.call(store, name))) === packetSha256ByName[name],
    'original source root changed at final boundary',
  );
  return {
    schemaVersion: 1,
    scope: 'original-network-source-history',
    binding: structuredClone(binding),
    packetSha256ByName,
    currentOperationalAcceptanceQualified: false,
    retirementQualified: false,
  };
}

// plugins/azure/src/ce/terraform-network-retirement-checkpoint.ts
var same37 = (a, b) => canonicalEqual(a, b);
function require50(value, message) {
  if (!value) throw Error(`Azure Terraform network retirement checkpoint: ${message}`);
}
async function readAzureTerraformNetworkRetirementCheckpoint(
  request,
  store,
  loaders,
  siteRequest,
  verifier,
  signal,
  replacementVerifier,
) {
  const plan = structuredClone(request),
    site = structuredClone(siteRequest),
    owner = structuredClone(store.owner),
    { directory, read, verify } = store,
    { loadSource, loadOutcome } = loaders;
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const requestMatches = canonicalSnapshot(plan),
    siteMatches = canonicalSnapshot(site),
    ownerMatches = canonicalSnapshot(owner);
  const unchanged = () =>
    require50(
      requestMatches(request) &&
        siteMatches(siteRequest) &&
        ownerMatches(store.owner) &&
        store.directory === directory &&
        store.read === read &&
        store.verify === verify &&
        loaders.loadSource === loadSource &&
        loaders.loadOutcome === loadOutcome,
      'request or dependency identity changed during inspection',
    );
  const bounded = async (task) => {
    deadline.throwIfAborted();
    unchanged();
    const abort = Promise.withResolvers(),
      onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([task(), abort.promise]);
      deadline.throwIfAborted();
      unchanged();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const packetSha256ByName = {},
    absentPackets = new Set();
  const trackedRead = async (name) => {
    let value;
    try {
      value = await bounded(() => read.call(store, name));
    } catch (error) {
      if (error.code === 'ENOENT') {
        require50(packetSha256ByName[name] === undefined, 'present packet disappeared');
        absentPackets.add(name);
      }
      throw error;
    }
    require50(!absentPackets.has(name), 'absent packet appeared');
    const digest = canonicalSha256(value);
    require50(
      packetSha256ByName[name] === undefined || packetSha256ByName[name] === digest,
      'packet changed between checkpoint reads',
    );
    packetSha256ByName[name] = digest;
    return structuredClone(value);
  };
  const trackedVerify = () => bounded(() => verify.call(store));
  const readonlyStore = new Proxy(store, {
    get(target, key) {
      if (key === 'read') return trackedRead;
      if (key === 'verify') return trackedVerify;
      if (['write', 'remove', 'retire'].includes(String(key)))
        return () => {
          throw Error('Checkpoint history inspection must not mutate storage');
        };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const historical = (receipt, identity, mode) => {
    require50(mode === 'historical', 'retirement checkpoint cannot request current acceptance');
    return bounded(() => verifier(structuredClone(receipt), structuredClone(identity), mode, deadline));
  };
  const sources = new Map(),
    outcomes = new Map();
  const trackedLoaders = {
    async loadSource(digest) {
      const value = await bounded(() => loadSource.call(loaders, digest)),
        actual = canonicalSha256(value);
      require50(!sources.has(digest) || sources.get(digest) === actual, 'original source loader result changed');
      sources.set(digest, actual);
      return structuredClone(value);
    },
    async loadOutcome(input) {
      const value = await bounded(() => loadOutcome.call(loaders, structuredClone(input))),
        digest = canonicalSha256(value);
      require50(
        !outcomes.has(input.planSha256) || outcomes.get(input.planSha256)?.digest === digest,
        'original outcome loader result changed',
      );
      outcomes.set(input.planSha256, { plan: structuredClone(input), digest });
      return structuredClone(value);
    },
  };
  const source = await bounded(() =>
    readAzureTerraformNetworkSourceHistory(
      plan,
      readonlyStore,
      trackedLoaders,
      site,
      historical,
      deadline,
      replacementVerifier,
    ),
  );
  const prefix = `${plan.planId}-terraform-network-driver-`,
    pointer = `${prefix}checkpoint.json`;
  const inventory = () => bounded(async () => readAzureTerraformNetworkPacketNames(store, plan));
  const names = await inventory();
  const optional = async (name) => {
    try {
      return await trackedRead(name);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  };
  const rootName = `${prefix}root.json`,
    completeName = `${prefix}complete.json`,
    currentFinalName = `${prefix}current-final.json`,
    root = await optional(rootName),
    originalPointer = await optional(pointer),
    complete = await optional(completeName),
    currentFinal = await optional(currentFinalName);
  const revisions = names.filter((name) => name.startsWith(`${prefix}revision-`));
  require50(
    names
      .filter((name) => name.startsWith(prefix))
      .every(
        (name) =>
          name === pointer ||
          name === rootName ||
          name === completeName ||
          name === currentFinalName ||
          revisions.includes(name),
      ),
    'unrecognized driver packet',
  );
  const initial = {
    schemaVersion: 1,
    kind: 'azure-terraform-network-serial-checkpoint',
    engine: 'terraform',
    owner,
    planSha256: plan.planSha256,
    sourceBindingSha256: canonicalSha256(source.binding),
    nodes: [{ node: 1, before: source.binding.before, phase: 'prepared' }],
    revision: 0,
    previousCheckpointSha256: null,
    lastTransition: null,
  };
  if (root !== undefined)
    require50(
      same37(root, {
        schemaVersion: 1,
        initialCheckpointSha256: canonicalSha256(initial),
      }),
      'original root marker differs',
    );
  const inspect = (override) => {
    const selectedStore =
      override === undefined
        ? readonlyStore
        : new Proxy(readonlyStore, {
            get(target, key) {
              if (key === 'read')
                return async (name) => {
                  const value = await optional(name);
                  return name === pointer ? structuredClone(override) : value;
                };
              return Reflect.get(target, key, target);
            },
          });
    return bounded(() =>
      AzureTerraformNetworkCheckpoint.inspect(plan, source.binding, selectedStore, historical, deadline),
    );
  };
  let snapshot;
  let pointerPublication;
  if (originalPointer === undefined) {
    require50(
      complete === undefined && currentFinal === undefined,
      'terminal publication without original checkpoint pointer',
    );
    require50(
      !names.some((name) => name.startsWith(`${plan.planId}-terraform-network-node-`)),
      'stage publication without original checkpoint pointer',
    );
    require50(
      revisions.length === 0 || same37(revisions, [`${prefix}revision-0.json`]),
      'later or malformed revision without original checkpoint pointer',
    );
    require50(root !== undefined || names.every((name) => !name.startsWith(prefix)), 'driver packets without root');
    if (revisions.length) {
      snapshot = await inspect(await trackedRead(revisions[0]));
      pointerPublication = 'pending-initial';
    } else pointerPublication = root === undefined ? 'source-only' : 'root-only';
  } else {
    const current = await inspect();
    const nextName = `${prefix}revision-${current.checkpoint.revision + 1}.json`;
    require50(
      revisions.every((name) => {
        const suffix = name.slice(`${prefix}revision-`.length),
          match = /^(0|[1-9][0-9]*)\.json$/.exec(suffix);
        return !!match && Number.isSafeInteger(Number(match[1])) && Number(match[1]) <= current.checkpoint.revision + 1;
      }),
      'unexplained later or malformed immutable revision',
    );
    snapshot = current;
    pointerPublication = 'current';
    if (names.includes(nextName)) {
      const next = await trackedRead(nextName);
      require50(
        next &&
          next.revision === current.checkpoint.revision + 1 &&
          next.previousCheckpointSha256 === current.checkpointSha256,
        'pending revision does not follow original pointer',
      );
      snapshot = await inspect(next);
      pointerPublication = 'pending-revision';
    }
  }
  const completionSha256ByName = {};
  require50(complete !== undefined || currentFinal === undefined, 'current final without original completion');
  if (complete !== undefined) {
    require50(
      pointerPublication === 'current' && snapshot?.allNodesAccepted,
      'terminal publication without complete published serial history',
    );
    const history = await bounded(() =>
      readAzureTerraformNetworkCompletionHistory(
        plan,
        readonlyStore,
        trackedLoaders,
        historical,
        deadline,
        replacementVerifier,
      ),
    );
    require50(
      history.checkpointSha256 === snapshot.checkpointSha256 &&
        history.sourceBindingSha256 === canonicalSha256(source.binding),
      'terminal history differs from original checkpoint',
    );
    completionSha256ByName[completeName] = history.completionSha256;
    if (currentFinal !== undefined) {
      const currentStore = new Proxy(readonlyStore, {
        get(target, key) {
          if (key === 'read') return (name) => trackedRead(name === completeName ? currentFinalName : name);
          return Reflect.get(target, key, target);
        },
      });
      const currentHistory = await bounded(() =>
        readAzureTerraformNetworkCompletionHistory(
          plan,
          currentStore,
          trackedLoaders,
          historical,
          deadline,
          replacementVerifier,
        ),
      );
      require50(
        currentHistory.checkpointSha256 === snapshot.checkpointSha256 &&
          currentHistory.sourceBindingSha256 === canonicalSha256(source.binding),
        'current-final provenance differs',
      );
      completionSha256ByName[currentFinalName] = currentHistory.completionSha256;
    }
  }
  require50(same37(await inventory(), names), 'checkpoint directory changed during inspection');
  for (const [digest, expected] of sources)
    require50(
      canonicalSha256(await bounded(() => loadSource.call(loaders, digest))) === expected,
      'original source loader result changed before final boundary',
    );
  for (const { plan: original, digest } of outcomes.values())
    require50(
      canonicalSha256(await bounded(() => loadOutcome.call(loaders, structuredClone(original)))) === digest,
      'original outcome loader result changed before final boundary',
    );
  await trackedVerify();
  for (const [name, digest] of Object.entries(packetSha256ByName))
    require50(
      canonicalSha256(await bounded(() => read.call(store, name))) === digest,
      'checkpoint or original source history changed before final boundary',
    );
  for (const name of absentPackets)
    require50((await optional(name)) === undefined, 'absent checkpoint packet appeared');
  require50(same37(await inventory(), names), 'checkpoint directory changed before final boundary');
  return {
    schemaVersion: 1,
    scope: 'network-retirement-checkpoint-history',
    snapshot,
    pointerPublication,
    originalSourceBindingSha256: canonicalSha256(source.binding),
    packetSha256ByName,
    completionSha256ByName,
    absentPackets: [...absentPackets].sort(),
    unverifiedNetworkPacketNames: names.filter((name) => packetSha256ByName[name] === undefined),
    currentOperationalAcceptanceQualified: false,
    retirementQualified: false,
  };
}

// plugins/azure/src/ce/terraform-network-routing-prefix-history.ts
import { createHash as createHash25 } from 'node:crypto';

var same38 = canonicalEqual;
function require51(value, message) {
  if (!value) throw Error(`Azure Terraform network routing prefix history: ${message}`);
}
function keys12(value, names) {
  require51(value && typeof value === 'object' && !Array.isArray(value), 'saved object required');
  const row = value;
  require51(same38(Object.keys(row).sort(), names.toSorted()), 'saved packet schema differs');
  return row;
}
async function readAzureTerraformNetworkRoutingPrefixHistory(plan, source, before, current, node, store, signal) {
  const data = structuredClone({ plan, before, current, node }),
    inputSha256 = canonicalSha256(data),
    original = { read: store.read, verify: store.verify },
    ownerSha256 = canonicalSha256(store.owner);
  verifyAzureCePlan(data.plan);
  require51(ownerSha256 === canonicalSha256(azureUpgradeBinding(data.plan).owner), 'storage owner differs');
  let retainedCurrent = data.current,
    stage = buildAzureTerraformNetworkRoutingStage(data.plan, source, data.before, retainedCurrent, node);
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    require51(
      canonicalSha256({ plan, before, current, node }) === inputSha256 &&
        canonicalSha256(data) === inputSha256 &&
        canonicalSha256(store.owner) === ownerSha256 &&
        store.read === original.read &&
        store.verify === original.verify,
      'input or owning reader changed',
    );
  };
  const step = async (action) => {
    seal();
    const abort = Promise.withResolvers(),
      onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([action(), abort.promise]);
      seal();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  await step(() => original.verify.call(store));
  const prefix = `${data.plan.planId}-terraform-network-node-${node}-routing`,
    suffixes = [
      'prepared',
      'mutation-plan',
      'mutation-binding',
      'mutation-outcome',
      'mutation-complete',
      'release-plan',
      'release-binding',
      'release-outcome',
      'release-complete',
      'final-plan',
      'current-no-change-plan',
    ],
    records = new Map(),
    packetSha256ByName = {};
  for (const suffix of suffixes) {
    const name = `${prefix}-${suffix}.json`;
    try {
      const value = await step(() => original.read.call(store, name));
      records.set(suffix, structuredClone(value));
      packetSha256ByName[name] = canonicalSha256(value);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  for (let i = 1; i < suffixes.length; i++)
    require51(!records.has(suffixes[i]) || records.has(suffixes[i - 1]), 'orphan later routing packet');
  if (records.has('prepared')) {
    const qualified = validateAzureTerraformNetworkRoutingPrepared(
      data.plan,
      source,
      data.before,
      data.current,
      node,
      records.get('prepared'),
    );
    retainedCurrent = qualified.current;
    stage = qualified.stage;
  }
  const receipt = (value, phase) => {
    validateAzureTerraformNetworkRoutingReceipt(data.plan, source, data.before, retainedCurrent, stage, value, phase);
    return structuredClone(value);
  };
  const observation = (value) =>
    validateAzureTerraformNetworkRoutingObservation(data.plan, source, data.before, retainedCurrent, node, value);
  const receipts = {};
  for (const phase of ['mutation', 'release']) {
    if (!records.has(`${phase}-plan`)) continue;
    const saved = receipt(records.get(`${phase}-plan`), phase);
    receipts[phase] = saved;
    if (records.has(`${phase}-binding`)) {
      const binding = keys12(records.get(`${phase}-binding`), [
        'schemaVersion',
        'kind',
        'phase',
        'planSha256',
        'stageSha256',
        'beforeSha256',
        'currentSha256',
        'receiptSha256',
        'providerLockSha256',
        'prior',
        'proposed',
      ]);
      require51(
        same38(
          { ...binding, prior: undefined, proposed: undefined },
          {
            schemaVersion: 1,
            kind: 'dependent-routing',
            phase,
            planSha256: data.plan.planSha256,
            stageSha256: canonicalSha256(stage),
            beforeSha256: canonicalSha256(data.before),
            currentSha256: canonicalSha256(retainedCurrent),
            receiptSha256: canonicalSha256(saved),
            providerLockSha256: saved.providerLockSha256,
            prior: undefined,
            proposed: undefined,
          },
        ),
        'saved binding identity differs',
      );
      validateAzureTerraformNetworkRoutingProjection(
        data.plan,
        source,
        data.before,
        retainedCurrent,
        stage,
        saved,
        phase,
        binding.prior,
        binding.proposed,
      );
    }
    if (records.has(`${phase}-outcome`)) observation(records.get(`${phase}-outcome`));
    if (records.has(`${phase}-complete`)) {
      const complete = keys12(records.get(`${phase}-complete`), ['schemaVersion', 'receiptSha256', 'outcome']);
      require51(
        complete.schemaVersion === 1 &&
          complete.receiptSha256 === canonicalSha256(saved) &&
          same38(complete.outcome, records.get(`${phase}-outcome`)),
        'saved completion differs from exact receipt/outcome',
      );
    }
  }
  for (const [suffix, phase] of [
    ['final-plan', 'final'],
    ['current-no-change-plan', 'current'],
  ])
    if (records.has(suffix)) {
      const terminal = keys12(records.get(suffix), ['schemaVersion', 'receipt', 'prior', 'proposed', 'cloud']);
      require51(terminal.schemaVersion === 1, 'saved final schema differs');
      const final = receipt(terminal.receipt, 'release');
      require51(final.noChanges, 'final refresh changes retained resources');
      validateAzureTerraformNetworkRoutingProjection(
        data.plan,
        source,
        data.before,
        retainedCurrent,
        stage,
        final,
        'release',
        terminal.prior,
        terminal.proposed,
      );
      observation(terminal.cloud);
      receipts[phase] = final;
    }
  await step(() => original.verify.call(store));
  for (const suffix of suffixes) {
    const name = `${prefix}-${suffix}.json`;
    try {
      const value = await step(() => original.read.call(store, name));
      require51(
        records.has(suffix) && canonicalSha256(value) === packetSha256ByName[name],
        'packet changed or appeared',
      );
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      require51(!records.has(suffix), 'packet disappeared');
    }
  }
  seal();
  return {
    schemaVersion: 1,
    scope: 'network-routing-packet-prefix-history',
    planSha256: data.plan.planSha256,
    node,
    sourceConfigurationSha256: createHash25('sha256').update(source).digest('hex'),
    lastPacket: suffixes.findLast((suffix) => records.has(suffix)) ?? null,
    allPacketsPresent: records.size === suffixes.length,
    receipts,
    packetSha256ByName,
    forwarding: 'unknown',
    bgpExchange: 'unknown',
    freshness: 'unqualified',
    currentOperationalAcceptanceQualified: false,
    retirementQualified: false,
  };
}

// plugins/azure/src/ce/terraform-network-retirement-graph.ts
var same39 = (a, b) => canonicalEqual(a, b);
function require52(value, message) {
  if (!value) throw Error(`Azure Terraform network retirement graph: ${message}`);
}
function keys13(value, fields) {
  require52(value && typeof value === 'object' && !Array.isArray(value), 'saved object required');
  const row = value;
  require52(same39(Object.keys(row).sort(), fields.toSorted()), 'saved graph schema differs');
  return row;
}
var authenticatedGraphWitnesses = new WeakMap();
async function recheckAzureTerraformNetworkRetirementGraph(
  witness,
  request,
  store,
  loaders,
  site,
  verifier,
  signal,
  replacementVerifier,
) {
  signal?.throwIfAborted();
  const qualified = witness && typeof witness === 'object' ? authenticatedGraphWitnesses.get(witness) : undefined;
  require52(qualified, 'owning authenticated graph witness required');
  const context = () =>
    require52(
      qualified.requestSha256 === canonicalSha256(request) &&
        qualified.siteSha256 === canonicalSha256(site) &&
        qualified.store === store &&
        qualified.loaders === loaders &&
        qualified.verifier === verifier &&
        qualified.replacementVerifier === replacementVerifier,
      'owning authenticated graph witness required',
    );
  context();
  const result = await qualified.recheck(signal);
  signal?.throwIfAborted();
  context();
  return result;
}
var phases = ['prepared', 'deallocated', 'nic-complete', 'restarted', 'routing-complete', 'accepted'];
var historicalInventories = new WeakMap();
async function readAzureTerraformNetworkPacketNames(store, plan) {
  const names = (await readdir7(store.directory))
    .filter((name) => name.startsWith(`${plan.planId}-terraform-network-`))
    .sort();
  const historical = historicalInventories.get(store);
  if (!historical) return names;
  require52(
    historical.planSha256 === plan.planSha256 && same39(names, historical.currentNames),
    'current network namespace changed during original prefix inspection',
  );
  return [...historical.originalNames];
}
function immutableGraph(value) {
  const snapshot = structuredClone(value);
  const freeze = (entry) => {
    if (entry === null || typeof entry !== 'object') return;
    const prototype = Object.getPrototypeOf(entry);
    require52(
      Array.isArray(entry) || prototype === Object.prototype || prototype === null,
      'immutable graph requires plain JSON values',
    );
    for (const nested of Object.values(entry)) freeze(nested);
    Object.freeze(entry);
  };
  freeze(snapshot);
  return snapshot;
}
async function readAzureTerraformNetworkRetirementGraph(
  request,
  store,
  loaders,
  siteRequest,
  verifier,
  signal,
  replacementVerifier,
) {
  const plan = structuredClone(request),
    site = structuredClone(siteRequest),
    owner = structuredClone(store.owner),
    { directory, read, verify } = store,
    { loadSource, loadOutcome } = loaders;
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const requestMatches = canonicalSnapshot(plan),
    siteMatches = canonicalSnapshot(site);
  const seal = () => {
    deadline.throwIfAborted();
    require52(
      requestMatches(request) &&
        siteMatches(siteRequest) &&
        same39(store.owner, owner) &&
        store.directory === directory &&
        store.read === read &&
        store.verify === verify &&
        loaders.loadSource === loadSource &&
        loaders.loadOutcome === loadOutcome,
      'request or graph dependency changed',
    );
  };
  const step = async (action) => {
    seal();
    const abort = Promise.withResolvers(),
      onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([action(), abort.promise]);
      seal();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const packets = {},
    absent = new Set(),
    packetSnapshots = new Map();
  const trackedRead = async (name) => {
    seal();
    if (packetSnapshots.has(name)) return structuredClone(packetSnapshots.get(name));
    if (absent.has(name)) throw Object.assign(Error('Previously observed graph packet absence'), { code: 'ENOENT' });
    let value;
    try {
      value = await step(() => read.call(store, name));
    } catch (error) {
      if (error.code === 'ENOENT') {
        require52(packets[name] === undefined, 'present graph packet disappeared');
        absent.add(name);
      }
      throw error;
    }
    const digest = canonicalSha256(value);
    require52(
      !absent.has(name) && (packets[name] === undefined || packets[name] === digest),
      'graph packet appeared or changed',
    );
    packets[name] = digest;
    packetSnapshots.set(name, structuredClone(value));
    return structuredClone(value);
  };
  const optional = async (name) => {
    try {
      return await trackedRead(name);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  };
  const optionalFresh = async (name) => {
    try {
      return await step(() => read.call(store, name));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  };
  const trackedVerify = () => step(() => verify.call(store));
  const readonlyStore = new Proxy(store, {
    get(target, key) {
      if (key === 'read') return trackedRead;
      if (key === 'verify') return trackedVerify;
      if (['write', 'remove', 'retire'].includes(String(key)))
        return () => {
          throw Error('Graph inspection must not mutate storage');
        };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const historicalInventory = historicalInventories.get(store);
  if (historicalInventory) historicalInventories.set(readonlyStore, historicalInventory);
  const sources = new Map(),
    outcomes = new Map();
  const trackedLoaders = {
    async loadSource(digest) {
      const value = await step(() => loadSource.call(loaders, digest)),
        actual = canonicalSha256(value);
      require52(!sources.has(digest) || sources.get(digest) === actual, 'original source changed across graph');
      sources.set(digest, actual);
      return structuredClone(value);
    },
    async loadOutcome(original) {
      const value = await step(() => loadOutcome.call(loaders, structuredClone(original))),
        digest = canonicalSha256(value);
      require52(
        !outcomes.has(original.planSha256) || outcomes.get(original.planSha256)?.digest === digest,
        'original outcome changed across graph',
      );
      outcomes.set(original.planSha256, { plan: structuredClone(original), digest });
      return structuredClone(value);
    },
  };
  const historicalChecks = new Map();
  const retainVerification = (key, result, replay) => {
    const digest = canonicalSha256(result);
    require52(
      !historicalChecks.has(key) || historicalChecks.get(key)?.digest === digest,
      'historical verifier result changed across graph',
    );
    historicalChecks.set(key, { digest, replay });
    return result;
  };
  const historical = async (receipt, identity, mode) => {
    require52(mode === 'historical', 'graph cannot request current acceptance');
    const frozenReceipt = structuredClone(receipt),
      frozenIdentity = structuredClone(identity);
    const replay = (active) =>
      verifier(structuredClone(frozenReceipt), structuredClone(frozenIdentity), 'historical', active);
    return retainVerification(
      `network:${canonicalSha256({ receipt, identity })}`,
      await step(() => replay(deadline)),
      replay,
    );
  };
  const historicalReplacement = replacementVerifier
    ? async (receipt, identity, mode) => {
        require52(mode === 'historical', 'graph cannot request current replacement acceptance');
        const frozenReceipt = structuredClone(receipt),
          frozenIdentity = structuredClone(identity);
        const replay = (active) =>
          replacementVerifier(structuredClone(frozenReceipt), structuredClone(frozenIdentity), 'historical', active);
        return retainVerification(
          `replacement:${canonicalSha256({ receipt, identity })}`,
          await step(() => replay(deadline)),
          replay,
        );
      }
    : undefined;
  const inventory = () => step(async () => readAzureTerraformNetworkPacketNames(store, plan));
  const names = await inventory();
  const original = await step(() =>
    readAzureTerraformNetworkSourceHistory(
      plan,
      readonlyStore,
      trackedLoaders,
      site,
      historical,
      deadline,
      historicalReplacement,
    ),
  );
  const checkpoint = await step(() =>
    readAzureTerraformNetworkRetirementCheckpoint(
      plan,
      readonlyStore,
      trackedLoaders,
      site,
      historical,
      deadline,
      historicalReplacement,
    ),
  );
  require52(
    checkpoint.originalSourceBindingSha256 === canonicalSha256(original.binding),
    'original and serial source bindings differ',
  );
  const nodes = [];
  const powerDeployments = [];
  let source = original.binding.source;
  for (const row of checkpoint.snapshot?.checkpoint.nodes ?? []) {
    const node = row.node,
      prefix = `${plan.planId}-terraform-network-node-${node}`,
      rank = phases.indexOf(row.phase),
      prior = Array.from({ length: node - 1 }, (_, i) => plan.nics.map((nic) => `${i + 1}:${nic.index}`)).flat(),
      reached = [...prior, ...plan.nics.map((nic) => `${node}:${nic.index}`)];
    const preflight = await optional(`${prefix}-preflight.json`);
    if (preflight !== undefined) {
      const packet = keys13(preflight, ['schemaVersion', 'sourceBindingSha256', 'identity', 'receipt', 'verification']);
      require52(
        packet.schemaVersion === 1 && packet.sourceBindingSha256 === canonicalSha256(original.binding),
        'preflight original source differs',
      );
      const identity = keys13(packet.identity, [
        'owner',
        'planSha256',
        'node',
        'siteName',
        'siteUid',
        'siteConfigurationSha256',
        'configurationSha256',
        'inventory',
      ]);
      require52(
        same39(identity.owner, owner) &&
          identity.planSha256 === plan.planSha256 &&
          identity.node === node &&
          identity.siteName === plan.siteName &&
          identity.siteUid === site.siteUid &&
          identity.siteConfigurationSha256 === site.siteConfigurationSha256 &&
          identity.configurationSha256 === createHash26('sha256').update(source).digest('hex') &&
          same39(validateAzureNetworkUpdateInventory(plan, identity.inventory).nodes, row.before.nodes),
        'preflight serial/node/site identity differs',
      );
      const qualified = await historical(packet.receipt, packet.identity, 'historical', deadline);
      keys13(qualified, ['status', 'scope', 'evidenceSha256']);
      require52(
        qualified.status === 'verified' &&
          qualified.scope === 'node-interfaces-routing-traffic' &&
          /^[a-f0-9]{64}$/.test(qualified.evidenceSha256) &&
          same39(qualified, packet.verification),
        'preflight historical acceptance differs',
      );
    }
    const deallocate = await step(() =>
      readAzureTerraformNetworkPowerHistory(plan, row.before, node, 'deallocate', prior, readonlyStore, deadline),
    );
    const nic = await step(() =>
      readAzureTerraformNetworkNicHistory(plan, source, row.before, node, readonlyStore, deadline),
    );
    const start = await step(() =>
      readAzureTerraformNetworkPowerHistory(plan, row.before, node, 'start', reached, readonlyStore, deadline),
    );
    require52(
      preflight !== undefined || (!deallocate.lastPacket && !nic.lastPacket && !start.lastPacket && rank === 0),
      'stage publication without original qualified preflight',
    );
    require52(
      !nic.lastPacket || (rank >= 1 && deallocate.receipts.final),
      'NIC prefix lacks published serial deallocate prerequisite',
    );
    require52(
      !start.lastPacket || (rank >= 2 && nic.receipts.final),
      'start prefix lacks published serial NIC prerequisite',
    );
    require52(rank < 1 || deallocate.receipts.final, 'checkpoint exceeds immutable deallocate completion');
    require52(rank < 2 || nic.receipts.final, 'checkpoint exceeds immutable NIC completion');
    require52(rank < 3 || start.receipts.final, 'checkpoint exceeds immutable start completion');
    let routing;
    if (start.receipts.final) {
      const released = keys13(await trackedRead(`${prefix}-start-release-outcome.json`), ['cloud', 'state']);
      const cloud = released.cloud;
      routing = await step(() =>
        readAzureTerraformNetworkRoutingPrefixHistory(
          plan,
          source,
          row.before,
          validateAzureNetworkUpdateInventory(plan, cloud.inventory),
          node,
          readonlyStore,
          deadline,
        ),
      );
      require52(!routing.lastPacket || rank >= 3, 'routing prefix lacks published serial restart prerequisite');
    } else {
      for (const suffix of [
        'prepared',
        'mutation-plan',
        'mutation-binding',
        'mutation-outcome',
        'mutation-complete',
        'release-plan',
        'release-binding',
        'release-outcome',
        'release-complete',
        'final-plan',
        'current-no-change-plan',
      ])
        require52(
          (await optional(`${prefix}-routing-${suffix}.json`)) === undefined,
          'routing packets before immutable restart completion',
        );
    }
    require52(rank < 4 || routing?.receipts.final, 'checkpoint exceeds immutable routing completion');
    if (preflight !== undefined)
      powerDeployments.push(
        await step(() => azureTerraformNetworkPowerDeployment(plan, row.before, node, 'deallocate')),
      );
    if (rank >= 2)
      powerDeployments.push(await step(() => azureTerraformNetworkPowerDeployment(plan, row.before, node, 'start')));
    nodes.push({ node, phase: row.phase, preflightPresent: preflight !== undefined, deallocate, nic, start, routing });
    if (row.phase === 'accepted') {
      require52(row.history?.phase === 'routing-complete', 'accepted predecessor lacks routing completion');
      source = buildAzureTerraformNetworkRoutingStage(
        plan,
        source,
        row.before,
        row.history.inventory,
        node,
      ).releasedConfiguration;
    }
  }
  require52(
    names.every((name) => packets[name] !== undefined),
    'unrecognized or future-node network packet',
  );
  await step(() => verify.call(store));
  for (const [digest, expected] of sources)
    require52(
      canonicalSha256(await step(() => loadSource.call(loaders, digest))) === expected,
      'original source changed before graph boundary',
    );
  for (const { plan: input, digest } of outcomes.values())
    require52(
      canonicalSha256(await step(() => loadOutcome.call(loaders, structuredClone(input)))) === digest,
      'original outcome changed before graph boundary',
    );
  for (const [name, digest] of Object.entries(packets))
    require52(
      canonicalSha256(await step(() => read.call(store, name))) === digest,
      'graph packet changed before final boundary',
    );
  for (const name of absent) require52((await optionalFresh(name)) === undefined, 'absent graph packet appeared');
  require52(same39(await inventory(), names), 'network directory changed across graph');
  seal();
  const result = immutableGraph({
    schemaVersion: 1,
    scope: 'network-retirement-packet-graph',
    original,
    checkpoint,
    nodes,
    powerDeployments,
    packetSha256ByName: packets,
    absentPackets: [...absent].sort(),
    submittedRunnerJournalsQualified: false,
    currentOperationalAcceptanceQualified: false,
    runnerRetirementQualified: false,
    parentRetirementQualified: false,
    retirementQualified: false,
  });
  const resultSha256 = canonicalSha256(result);
  authenticatedGraphWitnesses.set(result, {
    requestSha256: canonicalSha256(plan),
    siteSha256: canonicalSha256(site),
    store,
    loaders,
    verifier,
    replacementVerifier,
    async recheck(parentSignal) {
      const active = AbortSignal.any([deadline, ...(parentSignal ? [parentSignal] : [])]);
      const boundary = () => {
        active.throwIfAborted();
        seal();
        require52(Object.isFrozen(result), 'authenticated graph witness must remain immutable');
      };
      const bounded = async (action) => {
        boundary();
        const aborted = Promise.withResolvers(),
          onAbort = () => aborted.reject(active.reason);
        active.addEventListener('abort', onAbort, { once: true });
        try {
          const value = await Promise.race([action(), aborted.promise]);
          boundary();
          return value;
        } finally {
          active.removeEventListener('abort', onAbort);
        }
      };
      await bounded(() => verify.call(store));
      require52(same39(await bounded(inventory), names), 'authenticated graph namespace changed');
      for (const [digest, expected] of sources)
        require52(
          canonicalSha256(await bounded(() => loadSource.call(loaders, digest))) === expected,
          'authenticated graph source loader changed',
        );
      for (const { plan: original, digest } of outcomes.values())
        require52(
          canonicalSha256(await bounded(() => loadOutcome.call(loaders, structuredClone(original)))) === digest,
          'authenticated graph outcome loader changed',
        );
      for (const { replay, digest } of historicalChecks.values())
        require52(
          canonicalSha256(await bounded(() => replay(active))) === digest,
          'authenticated graph historical verifier changed',
        );
      for (const [name, digest] of Object.entries(packets))
        require52(
          canonicalSha256(await bounded(() => read.call(store, name))) === digest,
          'authenticated graph packet changed',
        );
      for (const name of absent)
        require52((await bounded(() => optionalFresh(name))) === undefined, 'authenticated graph absence changed');
      require52(same39(await bounded(inventory), names), 'authenticated graph namespace changed at final boundary');
      await bounded(() => verify.call(store));
      boundary();
      require52(canonicalSha256(result) === resultSha256, 'immutable graph final digest differs');
      return structuredClone(result);
    },
  });
  return result;
}
async function readAzureTerraformNetworkRetirementGraphPrefix(
  originalRequest,
  request,
  store,
  loaders,
  site,
  verifier,
  signal,
  replacementVerifier,
  currentWitness,
) {
  require52(
    originalRequest && typeof originalRequest === 'object' && !Array.isArray(originalRequest),
    'original graph witness required',
  );
  const original = structuredClone(originalRequest),
    originalSha256 = canonicalSha256(original),
    originalMatches = canonicalSnapshot(original),
    plan = structuredClone(request),
    ownedSite = structuredClone(site),
    owner = structuredClone(store.owner),
    { directory, read, verify } = store,
    { loadSource, loadOutcome } = loaders;
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    require52(
      originalMatches(originalRequest) &&
        same39(request, plan) &&
        same39(site, ownedSite) &&
        same39(store.owner, owner) &&
        store.directory === directory &&
        store.read === read &&
        store.verify === verify &&
        loaders.loadSource === loadSource &&
        loaders.loadOutcome === loadOutcome,
      'original prefix request or dependency changed',
    );
  };
  const step = async (action) => {
    seal();
    const abort = Promise.withResolvers(),
      onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([action(), abort.promise]);
      seal();
      return result;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const currentRead = () =>
    step(() =>
      currentWitness === undefined
        ? readAzureTerraformNetworkRetirementGraph(
            plan,
            store,
            loaders,
            ownedSite,
            verifier,
            deadline,
            replacementVerifier,
          )
        : recheckAzureTerraformNetworkRetirementGraph(
            currentWitness,
            plan,
            store,
            loaders,
            ownedSite,
            verifier,
            deadline,
            replacementVerifier,
          ),
    );
  const current = await currentRead(),
    currentSha256 = canonicalSha256(current);
  keys13(original, Object.keys(current));
  if (originalSha256 === currentSha256) {
    seal();
    return structuredClone(current);
  }
  const frozen = original,
    originalSnapshot = frozen.checkpoint?.snapshot,
    currentSnapshot = current.checkpoint.snapshot;
  require52(
    originalSnapshot &&
      currentSnapshot &&
      Number.isSafeInteger(originalSnapshot.checkpoint.revision) &&
      originalSnapshot.checkpoint.revision >= 0 &&
      originalSnapshot.checkpoint.revision <= currentSnapshot.checkpoint.revision &&
      same39(frozen.original, current.original),
    'original source or checkpoint ancestry differs',
  );
  require52(
    frozen.packetSha256ByName &&
      typeof frozen.packetSha256ByName === 'object' &&
      !Array.isArray(frozen.packetSha256ByName) &&
      Array.isArray(frozen.absentPackets) &&
      frozen.absentPackets.every((name) => typeof name === 'string') &&
      new Set(frozen.absentPackets).size === frozen.absentPackets.length,
    'original packet inventory schema differs',
  );
  const pointer = `${plan.planId}-terraform-network-driver-checkpoint.json`,
    revisionPrefix = `${plan.planId}-terraform-network-driver-revision-`,
    originalRevision = `${revisionPrefix}${originalSnapshot.checkpoint.revision}.json`,
    originalPackets = frozen.packetSha256ByName,
    currentPackets = current.packetSha256ByName,
    originalAbsent = new Set(frozen.absentPackets),
    currentAbsent = new Set(current.absentPackets);
  const safeName = (name) => /^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.json$/.test(name);
  for (const [name, digest] of Object.entries(originalPackets)) {
    require52(
      safeName(name) &&
        /^[a-f0-9]{64}$/.test(digest) &&
        !originalAbsent.has(name) &&
        (name === pointer || currentPackets[name] === digest),
      'original immutable graph packet changed or disappeared',
    );
  }
  require52(
    originalPackets[originalRevision] === originalSnapshot.checkpointSha256 &&
      currentPackets[originalRevision] === originalSnapshot.checkpointSha256 &&
      originalPackets[originalRevision] === canonicalSha256(originalSnapshot.checkpoint),
    'original immutable checkpoint is not retained in current ancestry',
  );
  for (const name of originalAbsent)
    require52(
      safeName(name) && (currentPackets[name] !== undefined || currentAbsent.has(name)),
      'original absence has no independently qualified current publication or absence',
    );
  const pointerDigest = originalPackets[pointer],
    pointerRevisions = Object.keys(originalPackets).filter((name) => {
      if (!name.startsWith(revisionPrefix) || !name.endsWith('.json')) return false;
      const revision = Number(name.slice(revisionPrefix.length, -5));
      return (
        Number.isSafeInteger(revision) &&
        revision >= 0 &&
        name === `${revisionPrefix}${revision}.json` &&
        revision <= originalSnapshot.checkpoint.revision &&
        originalPackets[name] === pointerDigest
      );
    });
  require52(
    pointerDigest && pointerRevisions.length === 1,
    'original moving pointer lacks its exact retained immutable revision',
  );
  const observe = async (name) => {
    let value;
    try {
      value = await step(() => read.call(store, name));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      require52(
        currentPackets[name] === undefined && currentAbsent.has(name),
        'current verified packet disappeared during prefix read',
      );
      return;
    }
    require52(
      currentPackets[name] !== undefined && canonicalSha256(value) === currentPackets[name],
      'current publication changed during original prefix read',
    );
    return structuredClone(value);
  };
  const projectedRead = async (name) => {
    require52(originalPackets[name] !== undefined || originalAbsent.has(name), 'undeclared original prefix read');
    const observed = await observe(name);
    if (originalAbsent.has(name))
      throw Object.assign(Error('Absent in authenticated original graph prefix'), { code: 'ENOENT' });
    if (name === pointer) {
      const revision = await observe(pointerRevisions[0]);
      require52(
        revision !== undefined && canonicalSha256(revision) === pointerDigest,
        'original retained pointer revision changed',
      );
      return revision;
    }
    require52(
      observed !== undefined && canonicalSha256(observed) === originalPackets[name],
      'original prefix packet changed',
    );
    return observed;
  };
  const projectedVerify = () => step(() => verify.call(store));
  const projected = new Proxy(store, {
    get(target, key) {
      if (key === 'read') return projectedRead;
      if (key === 'verify') return projectedVerify;
      if (['write', 'remove', 'retire'].includes(String(key)))
        return () => {
          throw Error('Original graph prefix inspection must not mutate storage');
        };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  historicalInventories.set(projected, {
    planSha256: plan.planSha256,
    currentNames: Object.keys(currentPackets)
      .filter((name) => name.startsWith(`${plan.planId}-terraform-network-`))
      .sort(),
    originalNames: Object.keys(originalPackets)
      .filter((name) => name.startsWith(`${plan.planId}-terraform-network-`))
      .sort(),
  });
  try {
    const reconstructed = await step(() =>
      readAzureTerraformNetworkRetirementGraph(
        plan,
        projected,
        loaders,
        ownedSite,
        verifier,
        deadline,
        replacementVerifier,
      ),
    );
    require52(canonicalSha256(reconstructed) === originalSha256, 'reconstructed original graph witness differs');
    require52(
      canonicalSha256(await currentRead()) === currentSha256,
      'current graph changed across original prefix inspection',
    );
    seal();
    return reconstructed;
  } finally {
    historicalInventories.delete(projected);
  }
}

// plugins/azure/src/ce/terraform-network-power-completed-retirement.ts
var hash13 = (value) => createHash27('sha256').update(value).digest('hex');
var same40 = (a, b) => canonicalEqual({ value: a }, { value: b });
function require53(value, message) {
  if (!value) throw Error(`Azure Terraform completed power retirement: ${message}`);
}
function object33(input) {
  require53(input && typeof input === 'object' && !Array.isArray(input), 'malformed retirement packet');
  return input;
}
var sha14 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
async function retireAzureTerraformNetworkCompletedPowerStageInDriver(
  lease,
  request,
  node,
  operation,
  terraform,
  store,
  loaders,
  site,
  verifier,
  api,
  environment,
  signal,
  replacementVerifier,
) {
  assertAzureTerraformNetworkDriverLease(lease, store.directory);
  const result = await run(
    [request, node, operation, terraform, store, loaders, site, verifier, signal, replacementVerifier],
    api,
    environment,
    lease,
  );
  require53(
    result.scope === 'selected-completed-network-power-runner-retirement',
    'unexpected serial inspection result',
  );
  return result;
}
async function readAzureTerraformNetworkCompletedPowerRetirement(...args) {
  const result = await run(args);
  require53(result.scope === 'selected-completed-network-power-retirement-history', 'unexpected mutation result');
  return result;
}
async function run(args, rawApi, environment = {}, driverLease) {
  const [
    request,
    node,
    operation,
    rawTerraform,
    rawStore,
    loaders,
    siteRequest,
    verifier,
    signal,
    replacementVerifier,
    readOnlyGraphWitness,
  ] = args;
  const readOnly = rawApi === undefined,
    plan = structuredClone(request),
    site = structuredClone(siteRequest),
    owner = structuredClone(rawStore.owner),
    directory = rawStore.directory,
    env = { ...environment };
  require53(readOnly || readOnlyGraphWitness === undefined, 'borrowed graph cannot authorize mutation');
  const graphWitnessSha256 = readOnlyGraphWitness === undefined ? undefined : canonicalSha256(readOnlyGraphWitness);
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const bindings = [];
  const bind = (target, keys) => {
    for (const key of keys) bindings.push({ target, key, value: Reflect.get(target, key) });
  };
  bind(rawTerraform, ['open']);
  bind(rawStore, ['read', 'write', 'verify']);
  bind(loaders, ['loadSource', 'loadOutcome']);
  if (rawApi) bind(rawApi, ['exec']);
  const requestSnapshotSha256 = canonicalSha256({ value: plan }),
    siteSnapshotSha256 = canonicalSha256({ value: site });
  const seal = () => {
    deadline.throwIfAborted();
    if (driverLease) assertAzureTerraformNetworkDriverLease(driverLease, directory);
    require53(
      (readOnlyGraphWitness === undefined || canonicalSha256(readOnlyGraphWitness) === graphWitnessSha256) &&
        canonicalSha256({ value: request }) === requestSnapshotSha256 &&
        canonicalSha256({ value: siteRequest }) === siteSnapshotSha256 &&
        same40(rawStore.owner, owner) &&
        same40(environment, env) &&
        rawStore.directory === directory &&
        bindings.every(({ target, key, value }) => Reflect.get(target, key) === value),
      'request or owning dependency changed',
    );
  };
  seal();
  require53(
    Number.isInteger(node) &&
      node >= 1 &&
      node <= plan.topology.nodeCount &&
      ['start', 'deallocate'].includes(operation),
    'selected boundary differs',
  );
  const execute = readOnly
    ? async (_directory, _signal, _seal, action, _options) =>
        action(async (work, mutation) => {
          seal();
          require53(!mutation, 'inspection cannot execute a mutation');
          const aborted = Promise.withResolvers(),
            onAbort = () => aborted.reject(deadline.reason);
          deadline.addEventListener('abort', onAbort, { once: true });
          try {
            const value = await Promise.race([work(), aborted.promise]);
            seal();
            return value;
          } finally {
            deadline.removeEventListener('abort', onAbort);
          }
        })
    : withAzureTerraformPowerLifecycle;
  const options = driverLease
    ? {
        lockDriver: false,
        beforeLock: (step) => step(() => verifyAzureTerraformNetworkDriverLease(driverLease, directory)),
      }
    : {};
  return execute(
    directory,
    deadline,
    seal,
    async (rawStep) => {
      const step = driverLease
        ? async (work, mutation) => {
            await rawStep(() => verifyAzureTerraformNetworkDriverLease(driverLease, directory));
            seal();
            const value = await rawStep(work, mutation);
            await rawStep(() => verifyAzureTerraformNetworkDriverLease(driverLease, directory));
            seal();
            return value;
          }
        : rawStep;
      const guard = (target, keys, mutations = []) => {
        bind(target, keys);
        const methods = new Map();
        for (const key of keys) {
          const method = Reflect.get(target, key);
          if (typeof method === 'function')
            methods.set(key, (...input) =>
              step(async () => await Reflect.apply(method, target, input), mutations.includes(key)),
            );
        }
        return new Proxy(target, {
          get: (target, key) => (methods.has(key) ? methods.get(key) : Reflect.get(target, key)),
        });
      };
      const store = guard(rawStore, ['read', 'write', 'verify'], ['write']),
        terraform = guard(rawTerraform, ['open'], readOnly ? [] : ['open']),
        api = rawApi ? guard(rawApi, ['exec']) : undefined;
      const optional = async (name) => {
        try {
          return await store.read(name);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      };
      const graphStore = readOnlyGraphWitness === undefined ? store : rawStore;
      let currentGraphWitness = readOnlyGraphWitness;
      const graphRead = () =>
        step(() =>
          currentGraphWitness === undefined
            ? readAzureTerraformNetworkRetirementGraph(
                plan,
                graphStore,
                loaders,
                site,
                verifier,
                deadline,
                replacementVerifier,
              )
            : recheckAzureTerraformNetworkRetirementGraph(
                currentGraphWitness,
                plan,
                graphStore,
                loaders,
                site,
                verifier,
                deadline,
                replacementVerifier,
              ),
        );
      const graph = await graphRead(),
        currentGraphSha256 = canonicalSha256(graph),
        checkpoint = graph.checkpoint.snapshot?.checkpoint.nodes.find((row) => row.node === node),
        historyNode = graph.nodes.find((row) => row.node === node);
      if (readOnly && readOnlyGraphWitness === undefined) currentGraphWitness = graph;
      require53(checkpoint && historyNode?.preflightPresent, 'original selected serial preflight missing');
      const before = checkpoint.before,
        history = operation === 'start' ? historyNode.start : historyNode.deallocate;
      require53(
        history.allPacketsPresent &&
          history.receipts.mutation &&
          history.receipts.release &&
          history.receipts.final &&
          history.receipts.current &&
          same40(history.receipts.final, history.receipts.current),
        'complete original submitted power history required',
      );
      const mutation = await step(() => azureTerraformNetworkPowerDeployment(plan, before, node, operation)),
        release = await step(() => azureTerraformNetworkPowerDeployment(plan, before, node, operation, true));
      require53(
        mutation.stage && graph.powerDeployments.some((value) => same40(value, mutation)),
        'original selected stage differs',
      );
      const final = await step(() =>
        validateAzureTerraformNetworkPowerPlan(plan, before, node, operation, history.receipts.final, 'final'),
      );
      const manifest = (deployment) => {
        const { configuration, providerLock, ...identity } = deployment;
        return canonicalSha256({
          ...identity,
          configurationSha256: hash13(configuration),
          providerLockSha256: hash13(providerLock),
        });
      };
      const manifestSha256 = manifest(release),
        identity = canonicalSha256({ planSha256: plan.planSha256, node, operation }).slice(0, 24),
        finalizingName = `azure-power-finalize-${identity}.json`,
        retirementPrefix = `azure-power-completed-retirement-${identity}`,
        cancellationName = `azure-power-cancel-${canonicalSha256({ planSha256: plan.planSha256, selectedNode: node, selectedOperation: operation }).slice(0, 24)}.json`;
      const preparingName = `${retirementPrefix}-preparing.json`,
        retiringName = `${retirementPrefix}-retiring.json`,
        retiredName = `${retirementPrefix}-retired.json`;
      let preparing = await optional(preparingName);
      const originalGraph =
          preparing === undefined
            ? graph
            : await step(() =>
                readAzureTerraformNetworkRetirementGraphPrefix(
                  object33(preparing).originalGraph,
                  plan,
                  graphStore,
                  loaders,
                  site,
                  verifier,
                  deadline,
                  replacementVerifier,
                  currentGraphWitness,
                ),
              ),
        graphSha256 = canonicalSha256(originalGraph);
      require53(
        (await optional(cancellationName)) === undefined,
        'cancelled stage requires its separate retirement contract',
      );
      const finalized = object33(await store.read(finalizingName));
      const finalizingBound = {
        schemaVersion: 1,
        sourcePlanSha256: plan.planSha256,
        ownerSha256: canonicalSha256(owner),
        beforeSha256: canonicalSha256(before),
        node,
        operation,
        deploymentSha256: canonicalSha256(release),
        mutationReceiptSha256: canonicalSha256(history.receipts.mutation),
        releaseReceiptSha256: canonicalSha256(history.receipts.release),
      };
      require53(
        same40(
          Object.keys(finalized).sort(),
          [...Object.keys(finalizingBound), 'status', 'originalJournalSha256', 'originalState'].sort(),
        ) &&
          Object.entries(finalizingBound).every(([key, value]) => same40(finalized[key], value)) &&
          finalized.status === 'finalizing' &&
          sha14(finalized.originalJournalSha256) &&
          finalized.originalState === (history.receipts.release.noChanges ? 'planned' : 'applied'),
        'original finalizing authorization differs',
      );
      const packetSha256ByName = { ...history.packetSha256ByName, [finalizingName]: canonicalSha256(finalized) };
      const root = join9(directory, 'terraform-stages'),
        stageDirectory = join9(root, mutation.stage),
        runnerDirectory = join9(stageDirectory, mutation.deploymentId);
      const inventory = (path) =>
        step(async () => {
          const stat = await lstat8(path);
          require53(
            stat.isDirectory() &&
              !stat.isSymbolicLink() &&
              stat.uid === process.getuid?.() &&
              (stat.mode & 63) === 0 &&
              (await realpath7(path)) === path,
            'stage directory ownership differs',
          );
          return (await readdir8(path)).sort();
        });
      const names = await inventory(root),
        stageNames = await inventory(stageDirectory),
        runnerNames = await inventory(runnerDirectory);
      require53(
        names
          .filter((name) => name.startsWith(`network-${plan.planSha256.slice(0, 24)}-`))
          .every((stage) => graph.powerDeployments.some((value) => value.stage === stage)) &&
          same40(stageNames, [mutation.deploymentId]) &&
          !runnerNames.includes('configuration-transition.json'),
        'foreign/orphan stage or pending revision',
      );
      const barrierPresent = runnerNames.includes('artifact-retirement.json');
      const session = guard(
        await terraform.open(owner, mutation, 'current'),
        [
          'readConfigurationSha256',
          'readCurrentPlanJournal',
          'readPlanApplicationHistory',
          'readArtifactRetirement',
          'retireArtifacts',
        ],
        ['retireArtifacts'],
      );
      require53(session.readArtifactRetirement, 'authenticated retirement reader unavailable');
      const bound = {
        schemaVersion: 1,
        owner,
        sourcePlanSha256: plan.planSha256,
        graphSha256,
        node,
        operation,
        stage: mutation.stage,
        mutationDeploymentSha256: canonicalSha256(mutation),
        releaseDeploymentSha256: canonicalSha256(release),
        manifestSha256,
        finalReceiptSha256: canonicalSha256(final),
        finalizingSha256: canonicalSha256(finalized),
      };
      const packet = (input, fields) => {
        const value = object33(input);
        require53(
          same40(Object.keys(value).sort(), [...Object.keys(bound), ...fields].sort()) &&
            Object.entries(bound).every(([key, expected]) => same40(value[key], expected)),
          'retirement packet source or schema differs',
        );
        return value;
      };
      const persist = async (name, value) => {
        const prior = await optional(name);
        require53(prior === undefined || same40(prior, value), 'immutable retirement publication differs');
        if (prior === undefined) await store.write(name, value);
        require53(same40(await store.read(name), value), 'retirement publication changed');
      };
      const unchanged = async () => {
        require53(
          canonicalSha256(await graphRead()) === currentGraphSha256 &&
            same40(await inventory(root), names) &&
            same40(await inventory(stageDirectory), stageNames) &&
            (await optional(cancellationName)) === undefined,
          'source graph, selected inventory or cancellation changed',
        );
        for (const [name, digest] of Object.entries(packetSha256ByName))
          require53(canonicalSha256(await store.read(name)) === digest, 'original submitted packet changed');
      };
      const appliedNics = Array.from({ length: operation === 'start' ? node : node - 1 }, (_, index) =>
        plan.nics.map((nic) => `${index + 1}:${nic.index}`),
      ).flat();
      const observe = async () => {
        require53(api && !readOnly, 'inspection cannot request current cloud acceptance');
        const observed = await step(() =>
          observeAzureTerraformNetworkPower(plan, before, node, operation, appliedNics, api, deadline),
        );
        require53(
          ['running', 'deallocated', 'stopped'].includes(observed.powerState),
          'stable selected cloud identity required',
        );
        const { observedAt: _observedAt, inventory, ...power } = observed,
          { collectedAt: _collectedAt, ...network } = inventory;
        return { ...power, inventory: network };
      };
      const validateOriginal = (input) => {
        const value = object33(input);
        require53(same40(Object.keys(value).sort(), ['current', 'phases']), 'frozen original schema differs');
        const current = object33(value.current);
        require53(
          same40(
            Object.keys(current).sort(),
            [
              'schemaVersion',
              'scope',
              'state',
              'receipt',
              'manifestSha256',
              'journalSha256',
              'savedPlanSha256',
              'planSemanticsQualified',
              'executionSha256',
              'ordinaryRefreshEnabled',
            ].sort(),
          ) &&
            current.schemaVersion === 1 &&
            current.scope === 'current-saved-plan-byte-and-journal-binding' &&
            current.state === 'planned' &&
            same40(current.receipt, final) &&
            current.manifestSha256 === manifestSha256 &&
            current.savedPlanSha256 === final.planSha256 &&
            sha14(current.journalSha256) &&
            sha14(current.executionSha256) &&
            current.planSemanticsQualified === false &&
            current.ordinaryRefreshEnabled === true,
          'frozen ordinary final journal differs',
        );
        require53(Array.isArray(value.phases) && value.phases.length === 2, 'frozen original phases differ');
        for (const [index, phase] of ['mutation', 'release'].entries()) {
          const row = object33(value.phases[index]),
            actual = object33(row.history),
            receipt = history.receipts[phase];
          require53(
            receipt &&
              same40(Object.keys(row).sort(), ['history', 'phase']) &&
              row.phase === phase &&
              same40(
                Object.keys(actual).sort(),
                [
                  'schemaVersion',
                  'scope',
                  'receiptSha256',
                  'manifestSha256',
                  'incompleteArchives',
                  'applicationOutcomeQualified',
                  'retirementQualified',
                  'matches',
                ].sort(),
              ) &&
              actual.schemaVersion === 1 &&
              actual.scope === 'exact-saved-plan-journal-history' &&
              actual.receiptSha256 === canonicalSha256(receipt) &&
              actual.manifestSha256 === manifestSha256 &&
              actual.incompleteArchives === 0 &&
              actual.applicationOutcomeQualified === false &&
              actual.retirementQualified === false &&
              Array.isArray(actual.matches) &&
              actual.matches.length > 0,
            'frozen original phase contract differs',
          );
          require53(
            new Set(actual.matches.map((entry) => canonicalSha256(entry))).size === actual.matches.length &&
              actual.matches.every((input) => {
                const entry = object33(input);
                return (
                  same40(
                    Object.keys(entry).sort(),
                    [
                      'location',
                      'archiveSha256',
                      'state',
                      'journalSha256',
                      'savedPlanSha256',
                      'configurationSha256',
                      'manifestSha256',
                    ].sort(),
                  ) &&
                  typeof entry.location === 'string' &&
                  ['current', 'revision', 'plan-history'].includes(entry.location) &&
                  entry.state === (receipt.noChanges ? 'planned' : 'applied') &&
                  entry.savedPlanSha256 === receipt.planSha256 &&
                  entry.configurationSha256 === receipt.configurationSha256 &&
                  entry.manifestSha256 === manifest(phase === 'mutation' ? mutation : release) &&
                  sha14(entry.archiveSha256) &&
                  sha14(entry.journalSha256)
                );
              }) &&
              (phase !== 'release' ||
                actual.matches.some((input) => object33(input).journalSha256 === finalized.originalJournalSha256)),
            'frozen original submitted journal custody differs',
          );
        }
      };
      const readOriginal = async () => {
        require53(
          session.readConfigurationSha256 && session.readCurrentPlanJournal && session.readPlanApplicationHistory,
          'original journal inspection unavailable',
        );
        require53(
          (await session.readConfigurationSha256()) === hash13(release.configuration),
          'original release configuration differs',
        );
        const current = await session.readCurrentPlanJournal(hash13(release.configuration), deadline);
        require53(
          current.schemaVersion === 1 &&
            current.scope === 'current-saved-plan-byte-and-journal-binding' &&
            current.planSemanticsQualified === false &&
            current.state === 'planned' &&
            current.manifestSha256 === manifestSha256 &&
            same40(current.receipt, final) &&
            current.savedPlanSha256 === final.planSha256 &&
            sha14(current.journalSha256) &&
            sha14(current.executionSha256) &&
            current.ordinaryRefreshEnabled === true,
          'exact original ordinary final journal required',
        );
        const phases = [];
        for (const phase of ['mutation', 'release']) {
          const receipt = history.receipts[phase];
          require53(receipt, 'original phase receipt missing');
          const actual = await session.readPlanApplicationHistory(receipt, deadline);
          const expectedState = receipt.noChanges ? 'planned' : 'applied';
          require53(
            actual.schemaVersion === 1 &&
              actual.scope === 'exact-saved-plan-journal-history' &&
              actual.receiptSha256 === canonicalSha256(receipt) &&
              actual.manifestSha256 === manifestSha256 &&
              actual.incompleteArchives === 0 &&
              actual.applicationOutcomeQualified === false &&
              actual.retirementQualified === false &&
              actual.matches.length > 0 &&
              actual.matches.every(
                (entry) =>
                  entry.state === expectedState &&
                  entry.savedPlanSha256 === receipt.planSha256 &&
                  entry.configurationSha256 === receipt.configurationSha256 &&
                  entry.manifestSha256 === manifest(phase === 'mutation' ? mutation : release) &&
                  sha14(entry.archiveSha256) &&
                  sha14(entry.journalSha256),
              ) &&
              (phase !== 'release' ||
                actual.matches.some((entry) => entry.journalSha256 === finalized.originalJournalSha256)),
            'original submitted phase journal or finalizing custody differs',
          );
          phases.push({ phase, history: actual });
        }
        const original = { current, phases };
        validateOriginal(original);
        return original;
      };
      const inspection = (status, proof) => ({
        schemaVersion: 1,
        scope: 'selected-completed-network-power-retirement-history',
        sourcePlanSha256: plan.planSha256,
        graphSha256,
        node,
        operation,
        stage: mutation.stage,
        status,
        proof,
        runnerRetirementQualified: status === 'retired',
        currentOperationalAcceptanceQualified: false,
        parentRetirementQualified: false,
        retirementQualified: false,
      });
      if (preparing === undefined) {
        require53(
          !barrierPresent &&
            (await optional(retiringName)) === undefined &&
            (await optional(retiredName)) === undefined,
          'missing original preparing authorization',
        );
        if (readOnly) {
          await unchanged();
          require53(
            same40(await inventory(runnerDirectory), runnerNames) &&
              (await optional(preparingName)) === undefined &&
              (await optional(retiringName)) === undefined &&
              (await optional(retiredName)) === undefined,
            'absent retirement changed across inspection',
          );
          return inspection('absent');
        }
        const original = await readOriginal(),
          baseline = await observe();
        await unchanged();
        require53(
          same40(await readOriginal(), original) && same40(await observe(), baseline),
          'original selected evidence changed before preparation',
        );
        preparing = { ...bound, status: 'preparing', packetSha256ByName, originalGraph, original, baseline };
        await persist(preparingName, preparing);
      }
      const prepared = packet(preparing, ['status', 'packetSha256ByName', 'originalGraph', 'original', 'baseline']);
      require53(
        prepared.status === 'preparing' &&
          same40(prepared.originalGraph, originalGraph) &&
          same40(prepared.packetSha256ByName, packetSha256ByName),
        'original packet custody differs',
      );
      validateOriginal(prepared.original);
      const preparingSha256 = canonicalSha256(prepared),
        retiring = { ...bound, status: 'retiring', preparingSha256 };
      const stable = async () => {
        await unchanged();
        require53(same40(await store.read(preparingName), prepared), 'preparation changed');
        if (!readOnly) require53(same40(await observe(), prepared.baseline), 'selected current cloud identity changed');
        else require53(same40(await inventory(runnerDirectory), runnerNames), 'retained runner inventory changed');
      };
      await stable();
      let observed = await session.readArtifactRetirement(final, preparingSha256, deadline);
      require53(
        ['absent', 'retiring', 'runner-artifacts-retired'].includes(observed.status),
        'retirement reader status differs',
      );
      const savedRetiring = await optional(retiringName),
        savedRetired = await optional(retiredName);
      if (savedRetiring !== undefined) require53(same40(savedRetiring, retiring), 'retiring authorization differs');
      require53(
        observed.status === 'absent' || savedRetiring !== undefined,
        'barrier lacks original retiring authorization',
      );
      require53(
        observed.status === 'runner-artifacts-retired' || savedRetired === undefined,
        'incomplete cleanup has retired publication',
      );
      if (!readOnly && observed.status !== 'runner-artifacts-retired') {
        require53(session.retireArtifacts, 'owning retirement mutation unavailable');
        if (observed.status === 'absent')
          require53(
            !barrierPresent && same40(await readOriginal(), prepared.original),
            'original journals changed before first barrier',
          );
        await persist(retiringName, retiring);
        await stable();
        await session.retireArtifacts(final, preparingSha256, env, deadline);
        observed = await session.readArtifactRetirement(final, preparingSha256, deadline);
        require53(observed.status === 'runner-artifacts-retired', 'selected runner retirement remains incomplete');
      }
      let retired;
      if (observed.status === 'runner-artifacts-retired') {
        require53(
          observed.receipt.manifestSha256 === manifestSha256 &&
            observed.receipt.evidenceSha256 === preparingSha256 &&
            observed.receipt.finalPlanSha256 === final.planSha256 &&
            sha14(observed.markerSha256),
          'original retained retirement receipt differs',
        );
        retired = {
          ...bound,
          status: 'retired',
          preparingSha256,
          retiringSha256: canonicalSha256(retiring),
          markerSha256: observed.markerSha256,
          receipt: observed.receipt,
        };
        require53(savedRetired === undefined || same40(savedRetired, retired), 'retired publication differs');
      }
      await stable();
      if (readOnly) {
        require53(
          same40(await optional(retiringName), savedRetiring) &&
            same40(await optional(retiredName), savedRetired) &&
            same40(await session.readArtifactRetirement(final, preparingSha256, deadline), observed),
          'retained cleanup changed across inspection',
        );
        await stable();
        require53(
          same40(await optional(retiringName), savedRetiring) && same40(await optional(retiredName), savedRetired),
          'publication changed at final boundary',
        );
        return inspection(
          observed.status === 'absent'
            ? 'preparing'
            : observed.status === 'retiring'
              ? 'retiring'
              : savedRetired === undefined
                ? 'retired-unpublished'
                : 'retired',
          { preparingSha256, finalReceiptSha256: canonicalSha256(final), observed },
        );
      }
      require53(
        retired && observed.status === 'runner-artifacts-retired' && same40(await optional(retiringName), retiring),
        'complete selected cleanup required',
      );
      await persist(retiredName, retired);
      require53(
        same40(await session.readArtifactRetirement(final, preparingSha256, deadline), observed),
        'retained cleanup changed before final publication boundary',
      );
      await stable();
      require53(
        same40(await optional(retiredName), retired) && same40(await optional(retiringName), retiring),
        'retired publication or retiring authorization changed at final boundary',
      );
      return {
        schemaVersion: 1,
        scope: 'selected-completed-network-power-runner-retirement',
        sourcePlanSha256: plan.planSha256,
        node,
        operation,
        stage: mutation.stage,
        graphSha256,
        preparingSha256,
        finalReceiptSha256: canonicalSha256(final),
        markerSha256: observed.markerSha256,
        artifactRetirementReceiptSha256: canonicalSha256(observed.receipt),
        wholeAppliedStateEmptyQualified: true,
        independentCleanupQualified: true,
        runnerRetirementQualified: true,
        currentOperationalAcceptanceQualified: false,
        parentRetirementQualified: false,
        retirementQualified: false,
      };
    },
    options,
  );
}

// plugins/azure/src/ce/terraform-network-power-execution.ts
import { createHash as createHash28 } from 'node:crypto';

var hash14 = (value) => createHash28('sha256').update(value).digest('hex');
var address2 = 'azapi_resource_action.ce_network';
function require54(value, message) {
  if (!value) throw Error(`Azure Terraform network power execution: ${message}`);
}
async function optional5(store, name) {
  try {
    return await store.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function runAzureTerraformNetworkPowerStage(
  plan,
  before,
  node,
  operation,
  appliedNics,
  terraform,
  store,
  api,
  env,
  signal,
  polling = {
    attempts: 90,
    intervalMs: 1e4,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  },
) {
  const requestPlan = plan,
    requestBefore = before,
    requestEnvironment = env,
    requestNics = appliedNics,
    requestPolling = polling,
    rawStore = store,
    rawTerraform = terraform,
    rawApi = api;
  plan = structuredClone(plan);
  before = structuredClone(before);
  env = { ...env };
  appliedNics = [...appliedNics];
  const snapshots = {
    plan: canonicalSha256(plan),
    before: canonicalSha256(before),
    env: canonicalSha256(env),
    nics: canonicalSha256(appliedNics),
    owner: canonicalSha256(store.owner),
    directory: store.directory,
    attempts: polling.attempts,
    intervalMs: polling.intervalMs,
    wait: polling.wait,
  };
  const bindings = [];
  const seal = () => {
    signal?.throwIfAborted();
    require54(
      canonicalSha256(requestPlan) === snapshots.plan &&
        canonicalSha256(requestBefore) === snapshots.before &&
        canonicalSha256(requestEnvironment) === snapshots.env &&
        canonicalSha256(requestNics) === snapshots.nics &&
        canonicalSha256(rawStore.owner) === snapshots.owner &&
        rawStore.directory === snapshots.directory &&
        requestPolling.attempts === snapshots.attempts &&
        requestPolling.intervalMs === snapshots.intervalMs &&
        requestPolling.wait === snapshots.wait &&
        bindings.every(({ object, key, value }) => Reflect.get(object, key) === value),
      'request or owning dependency changed',
    );
  };
  signal = AbortSignal.any([AbortSignal.timeout(720000), ...(signal ? [signal] : [])]);
  seal();
  require54(
    Number.isInteger(polling.attempts) &&
      polling.attempts > 0 &&
      Number.isFinite(polling.intervalMs) &&
      polling.intervalMs >= 0,
    'invalid convergence bounds',
  );
  require54(canonicalSha256(store.owner) === canonicalSha256(azureUpgradeBinding(plan).owner), 'storage owner differs');
  return withAzureTerraformPowerLifecycle(
    store.directory,
    signal,
    seal,
    async (step) => {
      const guard = (target, keys, mutations = []) => {
        const functions = new Map();
        for (const key of keys) {
          const value = Reflect.get(target, key);
          bindings.push({ object: target, key, value });
          if (typeof value === 'function')
            functions.set(key, (...args) =>
              step(async () => await Reflect.apply(value, target, args), mutations.includes(key)),
            );
        }
        return new Proxy(target, {
          get: (object, key) => (functions.has(key) ? functions.get(key) : Reflect.get(object, key)),
        });
      };
      store = guard(rawStore, ['read', 'write', 'verify'], ['write']);
      terraform = guard(rawTerraform, ['open'], ['open']);
      api = guard(rawApi, ['exec']);
      polling = { ...requestPolling, wait: (ms) => step(() => snapshots.wait(ms)) };
      const mutation = await step(() => azureTerraformNetworkPowerDeployment(plan, before, node, operation));
      const release = await step(() => azureTerraformNetworkPowerDeployment(plan, before, node, operation, true));
      signal?.throwIfAborted();
      await store.verify();
      const prefix = `${plan.planId}-terraform-network-node-${node}-${operation}`;
      const observe = () => observeAzureTerraformNetworkPower(plan, before, node, operation, appliedNics, api, signal);
      const poll = async () => {
        for (let i = 0; i < polling.attempts; i++) {
          signal?.throwIfAborted();
          const observed = await observe();
          if (observed.converged) return observed;
          if (i + 1 < polling.attempts) await polling.wait(polling.intervalMs);
        }
        throw Error('Azure Terraform network power execution: observed power has not converged');
      };
      await observe();
      let session;
      try {
        session = await terraform.open(store.owner, mutation, false);
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        session = await terraform.open(store.owner, mutation, 'current');
      }
      session = guard(
        session,
        [
          'readConfigurationSha256',
          'readCurrentPlanJournal',
          'readPlanApplicationHistory',
          'readPlannedResourceFields',
          'readProposedResourceFields',
          'readAppliedResourceFields',
          'readPlanApplicationState',
          'plan',
          'apply',
          'reviseConfiguration',
          'reconcileApplyFromEvidence',
        ],
        ['plan', 'apply', 'reviseConfiguration', 'reconcileApplyFromEvidence'],
      );
      const configuration = async () => {
        const current = await session.readConfigurationSha256?.();
        require54(
          current === hash14(mutation.configuration) || current === hash14(release.configuration),
          'private configuration differs',
        );
        return current;
      };
      const validate = (receipt, phase) =>
        validateAzureTerraformNetworkPowerPlan(plan, before, node, operation, receipt, phase);
      const unpublishedPlan = async (phase) => {
        require54(session.readCurrentPlanJournal, 'current saved-plan journal inspection unavailable');
        const current = await configuration();
        const journal = await session.readCurrentPlanJournal(current, signal);
        require54(
          journal.schemaVersion === 1 &&
            journal.scope === 'current-saved-plan-byte-and-journal-binding' &&
            journal.planSemanticsQualified === false,
          'current saved-plan journal contract differs',
        );
        if (journal.state === 'absent') {
          require54(
            journal.receipt === undefined && journal.savedPlanSha256 === null && journal.journalSha256 === null,
            'absent journal contains an unbound plan',
          );
          return session.plan(env, signal);
        }
        require54(
          journal.state === 'planned' && journal.receipt && journal.savedPlanSha256 === journal.receipt.planSha256,
          'unpublished submitted plan requires independently qualified history',
        );
        return validate(journal.receipt, phase);
      };
      const projection = async (receipt, phase) => {
        const name = `${prefix}-${phase}-binding.json`;
        let binding = phase === 'final' ? undefined : await optional5(store, name);
        if (binding === undefined) {
          binding = {
            schemaVersion: 1,
            receiptSha256: canonicalSha256(receipt),
            prior: await session.readPlannedResourceFields(receipt, azureTerraformNetworkPowerSelections, env, signal),
            proposed: await session.readProposedResourceFields(
              receipt,
              azureTerraformNetworkPowerSelections,
              env,
              signal,
            ),
          };
          await validateBinding(binding, receipt, phase);
          if (phase !== 'final') await store.write(name, binding);
        } else await validateBinding(binding, receipt, phase);
      };
      const validateBinding = async (input, receipt, phase) => {
        const value = input;
        require54(
          value &&
            canonicalSha256(Object.keys(value).sort()) ===
              canonicalSha256(['prior', 'proposed', 'receiptSha256', 'schemaVersion']) &&
            value.schemaVersion === 1 &&
            value.receiptSha256 === canonicalSha256(receipt),
          'saved state binding differs',
        );
        await validateAzureTerraformNetworkPowerProjection(
          plan,
          before,
          node,
          operation,
          receipt,
          phase,
          value.prior,
          value.proposed,
        );
      };
      const validateCloud = (input) => {
        const cloud = input;
        require54(
          cloud &&
            cloud.engine === 'terraform' &&
            cloud.planSha256 === plan.planSha256 &&
            cloud.node === node &&
            cloud.operation === operation &&
            cloud.resourceId === before.nodes[String(node)].resourceId &&
            cloud.vmId === before.nodes[String(node)].vmId &&
            cloud.ownerPlanSha256 === before.nodes[String(node)].ownerPlanSha256 &&
            cloud.converged === true &&
            cloud.powerState === (operation === 'start' ? 'running' : 'deallocated'),
          'saved completion cloud identity differs',
        );
        validateAzureNetworkUpdateInventory(plan, cloud.inventory);
        verifyAzureNetworkUpdateProgress(plan, before, cloud.inventory, appliedNics);
      };
      const completed = async (phase, receipt, outcome) => {
        const name = `${prefix}-${phase}-complete.json`;
        const saved =
          outcome === undefined
            ? await optional5(store, name)
            : { schemaVersion: 1, receiptSha256: canonicalSha256(receipt), outcome };
        if (saved === undefined) return false;
        const value = saved;
        require54(
          value &&
            canonicalSha256(Object.keys(value).sort()) ===
              canonicalSha256(['outcome', 'receiptSha256', 'schemaVersion']) &&
            value.schemaVersion === 1 &&
            value.receiptSha256 === canonicalSha256(receipt),
          'saved phase completion differs',
        );
        if (phase === 'mutation') validateCloud(value.outcome);
        else {
          const releaseOutcome = value.outcome;
          require54(
            releaseOutcome &&
              canonicalSha256(Object.keys(releaseOutcome).sort()) === canonicalSha256(['cloud', 'state']) &&
              canonicalSha256(releaseOutcome.state) === canonicalSha256({ [address2]: null }),
            'saved control absence differs',
          );
          validateCloud(releaseOutcome.cloud);
        }
        if (outcome !== undefined) await store.write(name, saved);
        return true;
      };
      let current = await configuration();
      let mutationReceipt = await optional5(store, `${prefix}-mutation-plan.json`);
      if (current === hash14(mutation.configuration)) {
        if (mutationReceipt === undefined) {
          const baseline = await observe();
          require54(
            baseline.powerState === (operation === 'start' ? 'deallocated' : 'running'),
            'unsubmitted action baseline differs',
          );
          mutationReceipt = await unpublishedPlan('mutation');
          await validate(mutationReceipt, 'mutation');
          await store.write(`${prefix}-mutation-plan.json`, mutationReceipt);
        }
        const receipt = await validate(mutationReceipt, 'mutation');
        await projection(receipt, 'mutation');
        let state = await session.readPlanApplicationState(receipt);
        require54(['planned', 'applying', 'applied'].includes(state), 'mutation application state unavailable');
        if (!receipt.noChanges && state === 'planned') {
          const baseline = await observe();
          require54(
            baseline.powerState === (operation === 'start' ? 'deallocated' : 'running'),
            'planned action baseline changed',
          );
          try {
            await session.apply(receipt, env, signal);
          } catch (error) {
            signal?.throwIfAborted();
            state = await session.readPlanApplicationState(receipt);
            if (state !== 'applying' && state !== 'applied') throw error;
          }
          state = await session.readPlanApplicationState(receipt);
        }
        const outcome = await poll();
        await store.write(`${prefix}-mutation-outcome.json`, outcome);
        if (state === 'applying') await session.reconcileApplyFromEvidence(receipt, canonicalSha256(outcome));
        else require54(receipt.noChanges || state === 'applied', 'mutation has no authoritative submitted outcome');
        await completed('mutation', receipt, outcome);
        current = await configuration();
        require54(current === hash14(mutation.configuration), 'configuration changed before release');
        await session.reviseConfiguration(current, release.configuration);
      } else {
        require54(mutationReceipt !== undefined, 'empty stage lacks immutable mutation history');
        const receipt = await validate(mutationReceipt, 'mutation');
        require54(await completed('mutation', receipt), 'empty stage lacks completed mutation history');
        await projection(receipt, 'mutation');
        require54((await observe()).converged, 'released mutation power regressed');
      }
      require54((await configuration()) === hash14(release.configuration), 'release revision differs');
      let releaseReceipt = await optional5(store, `${prefix}-release-plan.json`);
      if (releaseReceipt === undefined) {
        releaseReceipt = await unpublishedPlan('release');
        await validate(releaseReceipt, 'release');
        await store.write(`${prefix}-release-plan.json`, releaseReceipt);
      }
      const released = await validate(releaseReceipt, 'release');
      await projection(released, 'release');
      const releaseAlreadyComplete = await completed('release', released);
      if (!releaseAlreadyComplete) {
        let releaseState = await session.readPlanApplicationState(released);
        require54(['planned', 'applying', 'applied'].includes(releaseState), 'release application state unavailable');
        if (!released.noChanges && releaseState === 'planned') {
          require54((await observe()).converged, 'power changed before state-only release');
          try {
            await session.apply(released, env, signal);
          } catch (error) {
            signal?.throwIfAborted();
            releaseState = await session.readPlanApplicationState(released);
            if (releaseState !== 'applying' && releaseState !== 'applied') throw error;
          }
          releaseState = await session.readPlanApplicationState(released);
        }
        const fields = await session.readAppliedResourceFields(
          released,
          azureTerraformNetworkPowerSelections,
          env,
          signal,
        );
        require54(
          canonicalSha256(Object.keys(fields)) === canonicalSha256([address2]) && fields[address2] === null,
          'temporary control state remains',
        );
        const cloud = await observe();
        require54(cloud.converged, 'selected power changed during control release');
        const releaseOutcome = { cloud, state: fields };
        await store.write(`${prefix}-release-outcome.json`, releaseOutcome);
        if (releaseState === 'applying')
          await session.reconcileApplyFromEvidence(released, canonicalSha256(releaseOutcome));
        else
          require54(released.noChanges || releaseState === 'applied', 'release lacks authoritative submitted outcome');
        await completed('release', released, releaseOutcome);
      }
      require54((await observe()).converged, 'completed release power regressed');
      const finalizingName = `azure-power-finalize-${canonicalSha256({ planSha256: plan.planSha256, node, operation }).slice(0, 24)}.json`;
      const { configuration: source, providerLock, ...identity } = release;
      const manifestSha256 = canonicalSha256({
        ...identity,
        configurationSha256: hash14(source),
        providerLockSha256: hash14(providerLock),
      });
      const bound = {
        schemaVersion: 1,
        sourcePlanSha256: plan.planSha256,
        ownerSha256: canonicalSha256(store.owner),
        beforeSha256: canonicalSha256(before),
        node,
        operation,
        deploymentSha256: canonicalSha256(release),
        mutationReceiptSha256: canonicalSha256(mutationReceipt),
        releaseReceiptSha256: canonicalSha256(released),
      };
      require54(
        session.readCurrentPlanJournal && session.readPlanApplicationHistory,
        'final saved journal/history inspection unavailable',
      );
      const readJournal = session.readCurrentPlanJournal,
        readHistory = session.readPlanApplicationHistory;
      const journal = async () => {
        signal?.throwIfAborted();
        require54(
          session.readCurrentPlanJournal === readJournal && session.readPlanApplicationHistory === readHistory,
          'final owning inspection changed',
        );
        const value = await readJournal.call(session, hash14(release.configuration), signal);
        require54(
          value.schemaVersion === 1 &&
            value.scope === 'current-saved-plan-byte-and-journal-binding' &&
            value.planSemanticsQualified === false &&
            value.manifestSha256 === manifestSha256 &&
            value.receipt &&
            value.journalSha256 &&
            /^[a-f0-9]{64}$/.test(value.journalSha256) &&
            value.savedPlanSha256 === value.receipt.planSha256,
          'final current saved journal identity differs',
        );
        signal?.throwIfAborted();
        return value;
      };
      let finalizing = await optional5(store, finalizingName);
      if (finalizing === undefined) {
        require54(
          (await optional5(store, `${prefix}-final-plan.json`)) === undefined &&
            (await optional5(store, `${prefix}-current-no-change-plan.json`)) === undefined,
          'published final lacks original finalizing authorization',
        );
        const inspected = await journal();
        require54(
          canonicalSha256(inspected.receipt) === canonicalSha256(released) &&
            (released.noChanges ? inspected.state === 'planned' : inspected.state === 'applied'),
          'final refresh lacks exact completed release journal',
        );
        finalizing = {
          ...bound,
          status: 'finalizing',
          originalJournalSha256: inspected.journalSha256,
          originalState: inspected.state,
        };
        signal?.throwIfAborted();
        await store.write(finalizingName, finalizing);
        signal?.throwIfAborted();
      }
      require54(
        finalizing &&
          canonicalSha256(Object.keys(finalizing).sort()) ===
            canonicalSha256([...Object.keys(bound), 'status', 'originalJournalSha256', 'originalState'].sort()) &&
          Object.entries(bound).every(
            ([key, value]) => canonicalSha256(finalizing?.[key]) === canonicalSha256(value),
          ) &&
          finalizing.status === 'finalizing' &&
          typeof finalizing.originalJournalSha256 === 'string' &&
          /^[a-f0-9]{64}$/.test(finalizing.originalJournalSha256) &&
          finalizing.originalState === (released.noChanges ? 'planned' : 'applied'),
        'finalizing source/schema differs',
      );
      const finalizingSha256 = canonicalSha256(finalizing);
      const history = async () => {
        signal?.throwIfAborted();
        require54(session.readPlanApplicationHistory === readHistory, 'final owning history changed');
        const original = await readHistory.call(session, released, signal);
        require54(
          original.schemaVersion === 1 &&
            original.scope === 'exact-saved-plan-journal-history' &&
            original.receiptSha256 === canonicalSha256(released) &&
            original.incompleteArchives === 0 &&
            original.applicationOutcomeQualified === false &&
            original.retirementQualified === false &&
            original.matches.some(
              (entry) =>
                entry.journalSha256 === finalizing?.originalJournalSha256 &&
                entry.state === finalizing?.originalState &&
                entry.savedPlanSha256 === released.planSha256 &&
                entry.manifestSha256 === manifestSha256,
            ),
          'finalizing original release journal unavailable',
        );
        require54(
          canonicalSha256(await optional5(store, finalizingName)) === finalizingSha256 &&
            (await configuration()) === hash14(release.configuration),
          'finalizing packet/configuration changed',
        );
        return original;
      };
      await history();
      const inspected = await journal();
      let final;
      if (canonicalSha256(inspected.receipt) === canonicalSha256(released)) {
        require54(
          inspected.journalSha256 === finalizing.originalJournalSha256 && inspected.state === finalizing.originalState,
          'original release changed before final refresh',
        );
        require54(
          (await optional5(store, `${prefix}-final-plan.json`)) === undefined &&
            (await optional5(store, `${prefix}-current-no-change-plan.json`)) === undefined,
          'published final differs from current release',
        );
        signal?.throwIfAborted();
        final = await session.plan(env, signal);
        signal?.throwIfAborted();
      } else {
        require54(inspected.state === 'planned', 'submitted final journal requires owner recovery');
        final = inspected.receipt;
      }
      await validate(final, 'final');
      const finalJournal = await journal();
      require54(
        finalJournal.state === 'planned' &&
          canonicalSha256(finalJournal.receipt) === canonicalSha256(final) &&
          finalJournal.ordinaryRefreshEnabled === true &&
          typeof finalJournal.executionSha256 === 'string' &&
          /^[a-f0-9]{64}$/.test(finalJournal.executionSha256),
        'final ordinary refresh-enabled execution unavailable',
      );
      await projection(final, 'final');
      const emptyState = await session.readAppliedResourceFields(
        final,
        azureTerraformNetworkPowerSelections,
        env,
        signal,
      );
      require54(
        canonicalSha256(emptyState) === canonicalSha256({ [address2]: null }),
        'final applied control state remains',
      );
      await history();
      require54(canonicalSha256(await journal()) === canonicalSha256(finalJournal), 'final saved evidence changed');
      for (const suffix of ['final-plan', 'current-no-change-plan']) {
        const name = `${prefix}-${suffix}.json`,
          saved = await optional5(store, name);
        if (saved !== undefined) {
          await validate(saved, 'final');
          require54(
            canonicalSha256(saved) === canonicalSha256(final),
            'published final plan differs from exact saved bytes',
          );
        }
      }
      for (const suffix of ['final-plan', 'current-no-change-plan']) {
        signal?.throwIfAborted();
        const name = `${prefix}-${suffix}.json`;
        if ((await optional5(store, name)) === undefined) await store.write(name, final);
        signal?.throwIfAborted();
      }
      await history();
      require54(
        canonicalSha256(await journal()) === canonicalSha256(finalJournal),
        'final publication journal changed',
      );
      const finalCloud = await observe();
      require54(finalCloud.converged, 'terminal power evidence regressed');
      signal?.throwIfAborted();
      return {
        status: 'power-stage-complete',
        engine: 'terraform',
        planSha256: plan.planSha256,
        node,
        operation,
        resourceId: finalCloud.resourceId,
        vmId: finalCloud.vmId,
        mutationPlanSha256: mutationReceipt.planSha256,
        releasePlanSha256: released.planSha256,
        currentNoChangePlanSha256: final.planSha256,
        cloudEvidenceSha256: canonicalSha256(finalCloud),
      };
    },
    { lockDriver: false },
  );
}

// plugins/azure/src/ce/terraform-network-routing-binding.ts
function require55(value, message) {
  if (!value) throw Error(`Azure Terraform network routing binding: ${message}`);
}
async function bindAzureTerraformNetworkRoutingPlan(
  plan,
  source,
  before,
  current,
  stage,
  receipt,
  phase,
  session,
  store,
  env,
  signal,
) {
  const data = structuredClone({ plan, before, current, stage, receipt, env });
  const inputSha256 = canonicalSha256(data);
  const selections = azureTerraformNetworkRoutingSelections(data.stage);
  const selectionsSha256 = canonicalSha256(selections);
  require55(
    session.readPlannedResourcePaths && session.readProposedResourcePaths,
    'owning private paths capability required',
  );
  const original = {
    state: session.readPlanApplicationState,
    prior: session.readPlannedResourcePaths,
    proposed: session.readProposedResourcePaths,
    read: store.read,
    write: store.write,
    verify: store.verify,
  };
  const directory = store.directory,
    ownerSha256 = canonicalSha256(store.owner);
  require55(ownerSha256 === canonicalSha256(azureUpgradeBinding(data.plan).owner), 'storage owner differs');
  const bounded = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    bounded.throwIfAborted();
    require55(
      canonicalSha256({ plan, before, current, stage, receipt, env }) === inputSha256 &&
        canonicalSha256(data) === inputSha256 &&
        canonicalSha256(selections) === selectionsSha256 &&
        canonicalSha256(store.owner) === ownerSha256 &&
        store.directory === directory &&
        session.readPlanApplicationState === original.state &&
        session.readPlannedResourcePaths === original.prior &&
        session.readProposedResourcePaths === original.proposed &&
        store.read === original.read &&
        store.write === original.write &&
        store.verify === original.verify,
      'input, storage or owning runner changed during binding',
    );
  };
  const step = async (action) => {
    seal();
    let onAbort = () => {};
    const aborted = new Promise((_, reject) => {
      onAbort = () => reject(bounded.reason);
      bounded.addEventListener('abort', onAbort, { once: true });
    });
    try {
      const value = await Promise.race([action(), aborted]);
      seal();
      return value;
    } finally {
      bounded.removeEventListener('abort', onAbort);
    }
  };
  validateAzureTerraformNetworkRoutingReceipt(
    data.plan,
    source,
    data.before,
    data.current,
    data.stage,
    data.receipt,
    phase,
  );
  seal();
  await step(() => original.verify.call(store));
  const unlock = await acquireProcessLock(`${directory}/.terraform-network-routing-binding-lock`);
  try {
    seal();
    await step(() => original.verify.call(store));
    const name = `${data.plan.planId}-terraform-network-node-${data.stage.node}-routing-${phase}-binding.json`;
    const identity = {
      schemaVersion: 1,
      kind: 'dependent-routing',
      phase,
      planSha256: data.plan.planSha256,
      stageSha256: canonicalSha256(data.stage),
      beforeSha256: canonicalSha256(data.before),
      currentSha256: canonicalSha256(data.current),
      receiptSha256: canonicalSha256(data.receipt),
      providerLockSha256: data.receipt.providerLockSha256,
    };
    const validate = (input) => {
      require55(input && typeof input === 'object' && !Array.isArray(input), 'complete binding required');
      const value = input;
      require55(
        canonicalSha256(Object.keys(value).sort()) ===
          canonicalSha256([...Object.keys(identity), 'prior', 'proposed'].sort()),
        'saved binding schema differs',
      );
      for (const [key, expected] of Object.entries(identity))
        require55(value[key] === expected, 'saved binding identity differs');
      validateAzureTerraformNetworkRoutingProjection(
        data.plan,
        source,
        data.before,
        data.current,
        data.stage,
        data.receipt,
        phase,
        value.prior,
        value.proposed,
      );
      return value;
    };
    let saved;
    try {
      saved = await step(() => original.read.call(store, name));
    } catch (error) {
      seal();
      if (error.code !== 'ENOENT') throw error;
    }
    if (saved !== undefined) {
      const value = validate(saved);
      seal();
      return value;
    }
    require55(
      (await step(() => original.state.call(session, data.receipt))) === 'planned',
      'unsubmitted saved plan required for new binding',
    );
    const prior = await step(() => original.prior.call(session, data.receipt, selections, data.env, bounded));
    const proposed = await step(() => original.proposed.call(session, data.receipt, selections, data.env, bounded));
    require55(
      (await step(() => original.state.call(session, data.receipt))) === 'planned',
      'plan submitted during projection',
    );
    const binding = validate({ ...identity, prior, proposed });
    await step(() => original.write.call(store, name, binding));
    seal();
    return binding;
  } finally {
    await unlock();
  }
}

// plugins/azure/src/ce/terraform-network-routing-observation.ts
import { isIP as isIP6 } from 'node:net';

var same41 = canonicalEqual;
var lower11 = (value) => (typeof value === 'string' ? value.toLowerCase() : '');
function require56(value, message) {
  if (!value) throw Error(`Azure Terraform routing configuration: ${message}`);
}
function object34(value) {
  require56(value && typeof value === 'object' && !Array.isArray(value), 'complete record required');
  return value;
}
async function collectAzureTerraformNetworkRoutingConfiguration(
  plan,
  source,
  before,
  expected,
  node,
  appliedNics,
  api,
  signal,
) {
  signal?.throwIfAborted();
  const snapshot = structuredClone({ plan, before, expected, node, appliedNics });
  const inputSha256 = canonicalSha256(snapshot);
  const prepared = prepareAzureTerraformNetworkRouting(snapshot.plan, source, snapshot.before, node);
  validateAzureNetworkUpdateInventory(snapshot.plan, snapshot.expected);
  verifyAzureNetworkUpdateProgress(snapshot.plan, snapshot.before, snapshot.expected, snapshot.appliedNics);
  for (const [owner, vm] of Object.entries(snapshot.before.nodes))
    for (const [index, nic] of Object.entries(vm.nics))
      require56(
        snapshot.appliedNics.includes(`${owner}:${index}`) ||
          snapshot.expected.nodes[owner].nics[index].privateIp === nic.privateIp,
        'unsubmitted private address changed',
      );
  const graph = object34(JSON.parse(source)),
    resources = object34(graph.resource);
  const execute = api.exec;
  require56(typeof execute === 'function', 'Azure executor unavailable');
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    require56(
      api.exec === execute &&
        canonicalSha256(snapshot) === inputSha256 &&
        canonicalSha256({ plan, before, expected, node, appliedNics }) === inputSha256,
      'input or Azure executor changed',
    );
  };
  const bounded = async (action) => {
    seal();
    const aborted = Promise.withResolvers(),
      onAbort = () => aborted.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([action(), aborted.promise]);
      seal();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const transport = {
    async exec(command, args, options) {
      return await bounded(() => execute.call(api, command, args, options));
    },
  };
  const base = {
    schemaVersion: 1,
    scope: 'azure-dependent-routing-configuration',
    planSha256: snapshot.plan.planSha256,
    node,
    beforeSha256: canonicalSha256(snapshot.before),
    expectedSha256: canonicalSha256(snapshot.expected),
    preparationSha256: canonicalSha256(prepared),
    collectedAt: new Date().toISOString(),
    freshness: 'unqualified',
    forwarding: 'unknown',
    bgpExchange: 'unknown',
    interfaceState: 'unknown',
    nodeHealth: 'unknown',
  };
  let phase = 'initial-cloud-identity';
  try {
    const cloud = async () => {
      const observed = await bounded(() => captureAzureNetworkUpdateInventory(snapshot.plan, transport, deadline));
      require56(same41(observed.nodes, snapshot.expected.nodes), 'complete current cloud identity differs');
    };
    const read = async (args) => {
      const response = await transport.exec(
        'az',
        [...args, '--subscription', snapshot.plan.subscription.id, '--output', 'json'],
        { signal: deadline },
      );
      require56(response.exitCode === 0, 'configuration observation unavailable');
      const value = object34(JSON.parse(response.stdout));
      require56(
        value.error === undefined &&
          value.errors === undefined &&
          (value.nextLink === undefined || value.nextLink === null || value.nextLink === '') &&
          value.provisioningState === 'Succeeded',
        'incomplete terminal configuration',
      );
      return value;
    };
    const collect = async () => {
      const parents = new Map(),
        rows = [];
      for (const dependency of prepared.dependencies) {
        const isUdr = dependency.kind === 'udr-next-hop';
        const parentId = dependency.resourceId.slice(
          0,
          dependency.resourceId.lastIndexOf(isUdr ? '/routes/' : '/bgpConnections/'),
        );
        const configuredParent = object34(
          object34(resources[isUdr ? 'azurerm_route_table' : 'azurerm_route_server']).ce,
        );
        const tags = object34(configuredParent.tags),
          owner = tags['xcsh-plan-sha256'];
        require56(typeof owner === 'string' && /^[a-f0-9]{64}$/.test(owner), 'resolved parent owner required');
        if (!isUdr) {
          const actions = snapshot.plan.actions.filter(
            (action) => action.kind === 'route-server-peer-update' && action.node === node,
          );
          require56(
            actions.length === 1 &&
              lower11(actions[0].resourceId) === lower11(dependency.resourceId) &&
              actions[0].expectedOwnerPlanSha256 === owner,
            'independent planned Route Server parent owner differs',
          );
        }
        if (!parents.has(parentId)) {
          const parent = await read(['network', isUdr ? 'route-table' : 'routeserver', 'show', '--ids', parentId]);
          const actualTags = object34(parent.tags);
          require56(
            lower11(parent.id) === lower11(parentId) &&
              parent.name === configuredParent.name &&
              lower11(parent.location) === lower11(snapshot.plan.region) &&
              actualTags['xcsh-managed-by'] === 'azure-ce' &&
              actualTags['xcsh-execution-engine'] === 'terraform' &&
              actualTags['xcsh-deployment-id'] === snapshot.plan.deploymentName &&
              actualTags['xcsh-plan-sha256'] === owner,
            'current routing parent identity/owner differs',
          );
          parents.set(parentId, owner);
        }
        const row = await read([
          'network',
          isUdr ? 'route-table' : 'routeserver',
          isUdr ? 'route' : 'peering',
          'show',
          '--ids',
          dependency.resourceId,
        ]);
        const configured = object34(
          object34(resources[dependency.address.split('.')[0]])[dependency.address.split('.')[1]],
        );
        const installedIp = row[isUdr ? 'nextHopIpAddress' : 'peerIp'];
        const nic = snapshot.expected.nodes[String(node)].nics[String(dependency.nicIndex)];
        require56(
          lower11(row.id) === lower11(dependency.resourceId) &&
            row.name === configured.name &&
            typeof installedIp === 'string' &&
            isIP6(installedIp) === 4 &&
            (installedIp === dependency.previousIp || installedIp === nic.privateIp),
          'route/peer identity or installed address differs',
        );
        if (isUdr)
          require56(
            row.addressPrefix === configured.address_prefix && row.nextHopType === 'VirtualAppliance',
            'current route destination/type differs',
          );
        else
          require56(row.peerAsn === configured.peer_asn && Number.isInteger(row.peerAsn), 'current peer ASN differs');
        rows.push({
          kind: dependency.kind,
          resourceId: dependency.resourceId,
          parentId,
          parentOwnerPlanSha256: parents.get(parentId),
          node,
          nicIndex: dependency.nicIndex,
          nic: structuredClone(nic),
          name: row.name,
          previousIp: dependency.previousIp,
          currentIp: nic.privateIp,
          installedIp,
          state: installedIp === nic.privateIp ? 'current' : 'prior',
          provisioningState: 'Succeeded',
          ...(isUdr ? { prefix: row.addressPrefix, nextHopType: 'VirtualAppliance' } : { peerAsn: row.peerAsn }),
        });
      }
      return rows;
    };
    await cloud();
    phase = 'routing-configuration';
    const first = await collect(),
      second = await collect();
    require56(same41(first, second), 'routing parent or configuration changed');
    phase = 'final-cloud-identity';
    await cloud();
    seal();
    if (!prepared.dependencies.length)
      return {
        ...base,
        status: 'not-required',
        configurationState: 'not-required',
        rows: second,
        reason: 'no-selected-dependent-routing',
      };
    const states = new Set(second.map((row) => row.state));
    const configurationState = states.size === 1 ? second[0].state : 'mixed';
    return {
      ...base,
      status: 'observed',
      configurationState,
      rows: second,
      reason: 'configuration-installation-only',
    };
  } catch {
    deadline.throwIfAborted();
    return {
      ...base,
      status: 'unknown',
      configurationState: 'unknown',
      rows: [],
      reason: `${phase}-unverified`,
    };
  }
}

// plugins/azure/src/ce/terraform-network-routing-execution.ts
var same42 = canonicalEqual;
function require57(value, message) {
  if (!value) throw Error(`Azure Terraform network routing execution: ${message}`);
}
function object35(value) {
  require57(value && typeof value === 'object' && !Array.isArray(value), 'complete saved record required');
  return value;
}
function keys14(value, expected) {
  const row = object35(value);
  require57(same42(Object.keys(row).sort(), expected.toSorted()), 'saved packet schema differs');
  return row;
}
async function runAzureTerraformNetworkRoutingStage(
  plan,
  source,
  before,
  current,
  node,
  session,
  store,
  api,
  env,
  signal,
  polling = {
    attempts: 90,
    intervalMs: 1e4,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  },
) {
  const data = structuredClone({ plan, before, current, node, env });
  const inputSha256 = canonicalSha256(data);
  const stage = buildAzureTerraformNetworkRoutingStage(data.plan, source, data.before, data.current, node);
  const stageSha256 = canonicalSha256(stage);
  require57(
    Number.isInteger(polling.attempts) &&
      polling.attempts > 0 &&
      Number.isFinite(polling.intervalMs) &&
      polling.intervalMs >= 0,
    'bounded polling required',
  );
  require57(
    session.readConfigurationSha256 && session.readPlannedResourcePaths && session.readProposedResourcePaths,
    'owning configuration and private paths capabilities required',
  );
  const original = {
    configurationHash: session.readConfigurationSha256,
    configuration: session.readConfiguration,
    revise: session.reviseConfiguration,
    plan: session.plan,
    state: session.readPlanApplicationState,
    prior: session.readPlannedResourcePaths,
    proposed: session.readProposedResourcePaths,
    apply: session.apply,
    reconcile: session.reconcileApplyFromEvidence,
    read: store.read,
    write: store.write,
    verify: store.verify,
    exec: api.exec,
    wait: polling.wait,
  };
  const settings = { attempts: polling.attempts, intervalMs: polling.intervalMs },
    directory = store.directory,
    ownerSha256 = canonicalSha256(store.owner);
  require57(ownerSha256 === canonicalSha256(azureUpgradeBinding(data.plan).owner), 'storage owner differs');
  const leased = [];
  const track = (value) => {
    const snapshot = structuredClone(value);
    leased.push({ value: snapshot, sha256: canonicalSha256(snapshot) });
    return snapshot;
  };
  const deadline = AbortSignal.any([AbortSignal.timeout(900000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    require57(
      same42({ plan, before, current, node, env }, data) &&
        canonicalSha256(data) === inputSha256 &&
        canonicalSha256(stage) === stageSha256 &&
        leased.every((record) => canonicalSha256(record.value) === record.sha256) &&
        store.directory === directory &&
        canonicalSha256(store.owner) === ownerSha256 &&
        session.readConfigurationSha256 === original.configurationHash &&
        session.readConfiguration === original.configuration &&
        session.reviseConfiguration === original.revise &&
        session.plan === original.plan &&
        session.readPlanApplicationState === original.state &&
        session.readPlannedResourcePaths === original.prior &&
        session.readProposedResourcePaths === original.proposed &&
        session.apply === original.apply &&
        session.reconcileApplyFromEvidence === original.reconcile &&
        store.read === original.read &&
        store.write === original.write &&
        store.verify === original.verify &&
        api.exec === original.exec &&
        polling.wait === original.wait &&
        same42({ attempts: polling.attempts, intervalMs: polling.intervalMs }, settings),
      'input or owning collaborator changed',
    );
  };
  const step = async (action) => {
    seal();
    const aborted = Promise.withResolvers(),
      onAbort = () => aborted.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([action(), aborted.promise]);
      seal();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const transport = {
    async exec(command, args, options) {
      return await step(() => original.exec.call(api, command, args, options));
    },
  };
  const applied = Array.from({ length: node }, (_, i) => data.plan.nics.map((nic) => `${i + 1}:${nic.index}`)).flat();
  const observe = async () => {
    const power = await step(() =>
      observeAzureTerraformNetworkPower(data.plan, data.before, node, 'start', applied, transport, deadline),
    );
    require57(
      power.converged && power.powerState === 'running' && same42(power.inventory.nodes, data.current.nodes),
      'selected node is not running with exact current NIC identity',
    );
    const routing = await step(() =>
      collectAzureTerraformNetworkRoutingConfiguration(
        data.plan,
        source,
        data.before,
        data.current,
        node,
        applied,
        transport,
        deadline,
      ),
    );
    require57(
      routing.status === (stage.dependencies.length ? 'observed' : 'not-required'),
      'current routing ownership/configuration unavailable',
    );
    const finalPower = await step(() =>
      observeAzureTerraformNetworkPower(data.plan, data.before, node, 'start', applied, transport, deadline),
    );
    require57(
      finalPower.converged &&
        finalPower.powerState === 'running' &&
        same42(finalPower.inventory.nodes, power.inventory.nodes),
      'current node/NIC identity changed during routing observation',
    );
    return { schemaVersion: 1, stageSha256, routing, power: finalPower };
  };
  const validateObservation = (input, target = true) =>
    validateAzureTerraformNetworkRoutingObservation(data.plan, source, data.before, data.current, node, input, target);
  const prior = (value) => value.routing.rows.every((row) => row.installedIp === row.previousIp);
  const target = (value) => value.routing.rows.every((row) => row.installedIp === row.currentIp);
  const poll = async () => {
    for (let attempt = 0; attempt < settings.attempts; attempt++) {
      const value = await observe();
      validateObservation(value, false);
      if (target(value)) return validateObservation(value);
      if (attempt + 1 < settings.attempts) await step(() => original.wait(settings.intervalMs));
    }
    throw Error('Azure Terraform network routing execution: selected routing addresses have not converged');
  };
  const prefix = `${data.plan.planId}-terraform-network-node-${node}-routing`;
  const read = async (name) => {
    try {
      return track(await step(() => original.read.call(store, name)));
    } catch (error) {
      seal();
      if (error.code !== 'ENOENT') throw error;
    }
  };
  const write = (name, value) => {
    const snapshot = track(value);
    return step(() => original.write.call(store, name, snapshot));
  };
  const configuration = async () => {
    const hash = await step(() => original.configurationHash.call(session));
    require57(
      [stage.nicConfigurationSha256, stage.configurationSha256, stage.releasedConfigurationSha256].includes(hash),
      'private configuration differs',
    );
    return hash;
  };
  const validateReceipt = (receipt, phase) =>
    validateAzureTerraformNetworkRoutingReceipt(data.plan, source, data.before, data.current, stage, receipt, phase);
  seal();
  await step(() => original.verify.call(store));
  const unlock = await acquireProcessLock(`${directory}/.terraform-network-routing-execution-lock`);
  try {
    seal();
    await step(() => original.verify.call(store));
    const prepared = {
      schemaVersion: 2,
      kind: 'dependent-routing',
      stage,
      before: data.before,
      current: data.current,
      appliedNics: applied,
    };
    const saved = await read(`${prefix}-prepared.json`);
    if (saved === undefined) {
      for (const suffix of [
        'mutation-plan',
        'mutation-binding',
        'mutation-outcome',
        'mutation-complete',
        'release-plan',
        'release-binding',
        'release-outcome',
        'release-complete',
        'final-plan',
        'current-no-change-plan',
      ])
        require57(
          (await read(`${prefix}-${suffix}.json`)) === undefined,
          'prepared history missing after later publication',
        );
      require57((await configuration()) === stage.nicConfigurationSha256, 'pinned NIC source revision required');
      require57(
        (await step(() => original.configuration.call(session, stage.nicConfigurationSha256))) ===
          stage.nicConfiguration,
        'pinned source bytes differ',
      );
      require57(prior(validateObservation(await observe(), false)), 'unsubmitted routing baseline changed');
      await write(`${prefix}-prepared.json`, prepared);
    } else require57(same42(saved, prepared), 'saved routing preparation differs');
    const published = new Map();
    for (const suffix of [
      'mutation-plan',
      'mutation-binding',
      'mutation-outcome',
      'mutation-complete',
      'release-plan',
      'release-binding',
      'release-outcome',
      'release-complete',
      'final-plan',
      'current-no-change-plan',
    ])
      published.set(suffix, await read(`${prefix}-${suffix}.json`));
    const historyRequired = (suffixes) => {
      for (const suffix of suffixes)
        require57(published.get(suffix) !== undefined, 'published prerequisite history missing');
    };
    for (const phase of ['mutation', 'release']) {
      if (published.get(`${phase}-outcome`) !== undefined || published.get(`${phase}-complete`) !== undefined)
        historyRequired([`${phase}-plan`, `${phase}-binding`]);
      if (published.get(`${phase}-complete`) !== undefined) historyRequired([`${phase}-outcome`]);
    }
    if (
      [
        'release-plan',
        'release-binding',
        'release-outcome',
        'release-complete',
        'final-plan',
        'current-no-change-plan',
      ].some((suffix) => published.get(suffix) !== undefined)
    )
      historyRequired(['mutation-plan', 'mutation-binding', 'mutation-outcome', 'mutation-complete']);
    if (['final-plan', 'current-no-change-plan'].some((suffix) => published.get(suffix) !== undefined))
      historyRequired(['release-plan', 'release-binding', 'release-outcome', 'release-complete']);
    for (const phase of ['mutation', 'release']) {
      const phasePrefix = `${prefix}-${phase}`,
        next = phase === 'mutation' ? stage.configuration : stage.releasedConfiguration,
        nextSha256 = phase === 'mutation' ? stage.configurationSha256 : stage.releasedConfigurationSha256;
      let completion = await read(`${phasePrefix}-complete.json`);
      let retainedOutcome = await read(`${phasePrefix}-outcome.json`);
      if (completion === undefined && (await configuration()) !== nextSha256) {
        const actual = await configuration(),
          baseline = validateObservation(await observe(), phase === 'release');
        require57(
          phase === 'mutation'
            ? actual === stage.nicConfigurationSha256 && prior(baseline)
            : actual === stage.configurationSha256 && target(baseline),
          'cloud or configuration changed before routing revision',
        );
        await step(() => original.revise.call(session, actual, next));
      }
      let input = await read(`${phasePrefix}-plan.json`);
      if (input === undefined) {
        require57(
          completion === undefined &&
            retainedOutcome === undefined &&
            (await read(`${phasePrefix}-binding.json`)) === undefined &&
            (await configuration()) === nextSha256,
          'plan history missing after later publication',
        );
        const cloud = validateObservation(await observe(), phase === 'release');
        require57(phase === 'release' ? target(cloud) : prior(cloud), 'unsubmitted routing baseline differs');
        input = await step(() => original.plan.call(session, data.env, deadline));
        validateReceipt(input, phase);
        await write(`${phasePrefix}-plan.json`, input);
      }
      const receipt = track(input);
      validateReceipt(receipt, phase);
      await step(() =>
        bindAzureTerraformNetworkRoutingPlan(
          data.plan,
          source,
          data.before,
          data.current,
          stage,
          receipt,
          phase,
          session,
          store,
          data.env,
          deadline,
        ),
      );
      const validateCompletion = (value) => {
        const record = keys14(value, ['schemaVersion', 'receiptSha256', 'outcome']);
        require57(
          record.schemaVersion === 1 && record.receiptSha256 === canonicalSha256(receipt),
          'saved completion receipt differs',
        );
        require57(
          retainedOutcome !== undefined && same42(record.outcome, retainedOutcome),
          'saved completion and immutable outcome differ',
        );
        return validateObservation(record.outcome);
      };
      if (completion === undefined) {
        require57((await configuration()) === nextSha256, 'routing revision differs before submission');
        let state = await step(() => original.state.call(session, receipt));
        require57(['planned', 'applying', 'applied'].includes(state), 'authoritative plan application state required');
        if (phase === 'release')
          require57(
            receipt.noChanges && state === 'planned',
            'reference release must be an unsubmitted no-change plan',
          );
        if (state === 'planned') {
          const cloud = validateObservation(await observe(), phase === 'release');
          require57(phase === 'release' ? target(cloud) : prior(cloud), 'planned cloud baseline changed');
          if (!receipt.noChanges) {
            try {
              await step(() => original.apply.call(session, receipt, data.env, deadline));
            } catch (error) {
              seal();
              state = await step(() => original.state.call(session, receipt));
              if (state === 'planned') throw error;
            }
            state = await step(() => original.state.call(session, receipt));
          }
        }
        const freshOutcome = await poll();
        if (retainedOutcome === undefined) {
          retainedOutcome = freshOutcome;
          await write(`${phasePrefix}-outcome.json`, retainedOutcome);
        }
        const outcome = validateObservation(retainedOutcome);
        state = await step(() => original.state.call(session, receipt));
        if (receipt.noChanges) require57(state === 'planned', 'no-change routing plan is no longer unsubmitted');
        else if (state === 'applying') {
          await step(() => original.reconcile.call(session, receipt, canonicalSha256(outcome)));
          require57(
            (await step(() => original.state.call(session, receipt))) === 'applied',
            'reconciliation did not establish applied state',
          );
        } else require57(state === 'applied', 'mutation lacks an authoritative applied outcome');
        completion = { schemaVersion: 1, receiptSha256: canonicalSha256(receipt), outcome };
        validateCompletion(completion);
        await write(`${phasePrefix}-complete.json`, completion);
      } else validateCompletion(completion);
      await poll();
    }
    require57(
      (await configuration()) === stage.releasedConfigurationSha256,
      'restored computed reference revision differs',
    );
    const final = track(await step(() => original.plan.call(session, data.env, deadline)));
    validateReceipt(final, 'release');
    require57(final.noChanges, 'final refresh plan changes retained resources');
    const finalUnsubmitted = async () =>
      require57(
        (await step(() => original.state.call(session, final))) === 'planned',
        'final no-change plan is no longer unsubmitted',
      );
    await finalUnsubmitted();
    const selections = azureTerraformNetworkRoutingSelections(stage),
      selectionsSha256 = canonicalSha256(selections);
    const priorFields = await step(() => original.prior.call(session, final, selections, data.env, deadline));
    require57(canonicalSha256(selections) === selectionsSha256, 'selected paths changed');
    const proposedFields = await step(() => original.proposed.call(session, final, selections, data.env, deadline));
    require57(canonicalSha256(selections) === selectionsSha256, 'selected paths changed');
    validateAzureTerraformNetworkRoutingProjection(
      data.plan,
      source,
      data.before,
      data.current,
      stage,
      final,
      'release',
      priorFields,
      proposedFields,
    );
    await finalUnsubmitted();
    const cloud = await poll();
    await finalUnsubmitted();
    const terminal = { schemaVersion: 1, receipt: final, prior: priorFields, proposed: proposedFields, cloud };
    const validateTerminal = (input) => {
      const record = keys14(input, ['schemaVersion', 'receipt', 'prior', 'proposed', 'cloud']);
      require57(record.schemaVersion === 1, 'saved final schema differs');
      const receipt = record.receipt;
      validateReceipt(receipt, 'release');
      require57(receipt.noChanges, 'saved final plan changes retained resources');
      validateAzureTerraformNetworkRoutingProjection(
        data.plan,
        source,
        data.before,
        data.current,
        stage,
        receipt,
        'release',
        record.prior,
        record.proposed,
      );
      validateObservation(record.cloud);
    };
    validateTerminal(terminal);
    const savedFinal = await read(`${prefix}-final-plan.json`);
    if (savedFinal === undefined) {
      require57(
        (await read(`${prefix}-current-no-change-plan.json`)) === undefined,
        'immutable final history missing after current publication',
      );
      await write(`${prefix}-final-plan.json`, terminal);
    } else validateTerminal(savedFinal);
    await finalUnsubmitted();
    await write(`${prefix}-current-no-change-plan.json`, terminal);
    seal();
    return {
      status: 'routing-stage-complete',
      engine: 'terraform',
      node,
      planSha256: data.plan.planSha256,
      configurationSha256: stage.releasedConfigurationSha256,
      currentNoChangePlanSha256: final.planSha256,
      currentEvidenceSha256: canonicalSha256(cloud),
      forwarding: 'unknown',
      bgpExchange: 'unknown',
      freshness: 'unqualified',
    };
  } finally {
    await unlock();
  }
}

// plugins/azure/src/ce/terraform-network-source-binding.ts
import { createHash as createHash29 } from 'node:crypto';

var hash15 = (value) => createHash29('sha256').update(value).digest('hex');
var same43 = canonicalEqual;
function require58(value, message) {
  if (!value) throw Error(`Azure Terraform network source binding: ${message}`);
}
async function bindAzureTerraformNetworkUpdateSource(
  request,
  terraform,
  store,
  api,
  env,
  loaders,
  siteRequest,
  signal,
  qualifyAcceptance,
  replacementVerifier,
) {
  signal?.throwIfAborted();
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  signal = deadline;
  const plan = structuredClone(request),
    site = structuredClone(siteRequest),
    owner = structuredClone(store.owner);
  const { loadSource: sourceLoader, loadOutcome: outcomeLoader } = loaders;
  const open = terraform.open,
    execute = api.exec;
  const bounded = async (task) => {
    deadline.throwIfAborted();
    const abort = Promise.withResolvers();
    const onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([task(), abort.promise]);
      deadline.throwIfAborted();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const context = () =>
    require58(
      same43(plan, request) &&
        same43(site, siteRequest) &&
        same43(owner, store.owner) &&
        loaders.loadSource === sourceLoader &&
        loaders.loadOutcome === outcomeLoader &&
        terraform.open === open &&
        api.exec === execute,
      'requested identity or loader changed during binding',
    );
  const verifyOwner = async () => {
    context();
    await bounded(() => store.verify());
    context();
  };
  verifyAzureCePlan(plan);
  require58(
    plan.engine === 'terraform' &&
      plan.intent.operation === 'update-network' &&
      same43(owner, azureUpgradeBinding(plan).owner),
    'exact owning Terraform network intent required',
  );
  await verifyOwner();
  const deployment = await bounded(() => azureTerraformCurrentDeployment(plan)),
    lock = hash15(deployment.providerLock);
  require58(lock === AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256, 'qualified provider lock required');
  const unlock = await acquireProcessLock(`${store.directory}/.terraform-network-source-lock`);
  try {
    signal?.throwIfAborted();
    await verifyOwner();
    const name = `${plan.planId}-terraform-network-source.json`;
    const packets = new Map(),
      sources = new Map(),
      outcomes = new Map(),
      absent = new Set();
    const remember = (records, name, value) => {
      const digest = canonicalSha256(value);
      require58(
        !records.has(name) || records.get(name) === digest,
        'historical source or packet changed during binding',
      );
      records.set(name, digest);
    };
    const optional = async (_store, item) => {
      try {
        const value = await bounded(() => store.read(item));
        require58(!absent.has(item), 'missing artifact appeared during source binding');
        remember(packets, item, value);
        return structuredClone(value);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        require58(!packets.has(item), 'historical artifact disappeared during binding');
        absent.add(item);
      }
    };
    const readonlyStore = new Proxy(store, {
      get(target, key) {
        if (key === 'verify') return verifyOwner;
        if (key === 'read')
          return async (item) => {
            const value = await bounded(() => store.read(item));
            remember(packets, item, value);
            return structuredClone(value);
          };
        if (['write', 'remove', 'retire'].includes(String(key)))
          return () => {
            throw Error('Source qualification must not mutate storage');
          };
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const tracked = {
      async loadSource(digest) {
        context();
        const value = await bounded(() => sourceLoader.call(loaders, digest));
        verifyAzureCePlan(value);
        require58(value.planSha256 === digest, 'predecessor source digest differs');
        remember(sources, digest, value);
        return structuredClone(value);
      },
      async loadOutcome(p) {
        context();
        const value = await bounded(() => outcomeLoader.call(loaders, structuredClone(p))),
          digest = canonicalSha256(value);
        require58(
          !outcomes.has(p.planSha256) || outcomes.get(p.planSha256)?.digest === digest,
          'predecessor outcome changed during binding',
        );
        outcomes.set(p.planSha256, { plan: structuredClone(p), digest });
        return structuredClone(value);
      },
    };
    const recheck = async () => {
      await verifyOwner();
      for (const [digest, expected] of sources)
        require58(
          canonicalSha256(await bounded(() => sourceLoader.call(loaders, digest))) === expected,
          'predecessor source changed before binding',
        );
      for (const { plan: p, digest } of outcomes.values())
        require58(
          canonicalSha256(await bounded(() => outcomeLoader.call(loaders, structuredClone(p)))) === digest,
          'predecessor outcome changed before binding',
        );
      for (const [item, digest] of packets)
        require58(
          canonicalSha256(await bounded(() => store.read(item))) === digest,
          'historical packet changed before binding',
        );
      for (const item of absent) {
        try {
          await bounded(() => store.read(item));
        } catch (error) {
          if (error.code === 'ENOENT') continue;
          throw error;
        }
        throw Error('Azure Terraform network source binding: missing artifact appeared during source binding');
      }
      await verifyOwner();
      if (packets.has(name))
        require58(
          canonicalSha256(await bounded(() => store.read(name))) === packets.get(name),
          'owning source root changed at final boundary',
        );
      context();
    };
    const qualify = (source, before) =>
      qualifyAzureTerraformNetworkGenerationSource(
        plan,
        source,
        before,
        readonlyStore,
        tracked,
        lock,
        site,
        qualifyAcceptance,
        signal,
        replacementVerifier,
      );
    const validate = async (input) => {
      require58(input && typeof input === 'object' && !Array.isArray(input), 'complete saved binding required');
      const row = input;
      require58(
        same43(Object.keys(row).sort(), [
          'before',
          'engine',
          'kind',
          'outputs',
          'owner',
          'planSha256',
          'providerLockSha256',
          'qualification',
          'schemaVersion',
          'source',
          'sourceConfigurationSha256',
        ]) &&
          row.schemaVersion === 1 &&
          row.kind === 'azure-terraform-network-original-source' &&
          row.engine === 'terraform' &&
          same43(row.owner, store.owner) &&
          row.planSha256 === plan.planSha256 &&
          row.providerLockSha256 === lock &&
          typeof row.source === 'string' &&
          hash15(row.source) === row.sourceConfigurationSha256,
        'saved source identity or schema differs',
      );
      validateAzureNetworkUpdateInventory(plan, row.before);
      verifyAzureTerraformNetworkUpdateState(plan, row.before, row.outputs);
      require58(same43(row.qualification, await qualify(row.source, row.before)), 'saved source qualification changed');
      signal?.throwIfAborted();
      await verifyOwner();
      return structuredClone(row);
    };
    const saved = await optional(store, name);
    if (saved !== undefined) {
      const binding = await validate(saved);
      signal?.throwIfAborted();
      const session = await bounded(() => open.call(terraform, owner, deployment, 'current'));
      signal?.throwIfAborted();
      await recheck();
      return { session, binding };
    }
    const laterNames = [
      `${plan.planId}-terraform-network-driver-checkpoint.json`,
      `${plan.planId}-terraform-network-driver-root.json`,
      `${plan.planId}-terraform-network-driver-current-final.json`,
      `${plan.planId}-terraform-network-driver-complete.json`,
    ];
    for (let node = 1; node <= plan.topology.nodeCount; node++) {
      const prefix = `${plan.planId}-terraform-network-node-${node}`;
      for (const suffix of [
        'preflight',
        'prepared',
        'nic-binding',
        'mutation-plan',
        'mutation-outcome',
        'mutation-complete',
        'final-plan',
        'current-no-change-plan',
      ])
        laterNames.push(`${prefix}-${suffix}.json`);
      laterNames.push(`${prefix}-routing-prepared.json`);
      for (const operation of ['deallocate', 'start', 'routing'])
        for (const suffix of [
          'mutation-plan',
          'mutation-binding',
          'mutation-outcome',
          'mutation-complete',
          'release-plan',
          'release-binding',
          'release-outcome',
          'release-complete',
          'final-plan',
          'current-no-change-plan',
        ])
          laterNames.push(`${prefix}-${operation}-${suffix}.json`);
    }
    for (const later of laterNames)
      require58((await optional(store, later)) === undefined, 'original source missing after stage publication');
    signal?.throwIfAborted();
    const session = await bounded(() => open.call(terraform, owner, deployment, 'current'));
    const readRevision = session.readConfigurationSha256?.bind(session);
    require58(readRevision, 'current private configuration capability required');
    const sourceConfigurationSha256 = await bounded(readRevision);
    require58(
      typeof sourceConfigurationSha256 === 'string' && /^[a-f0-9]{64}$/.test(sourceConfigurationSha256),
      'resolved private source revision required',
    );
    const source = await bounded(() => session.readConfiguration(sourceConfigurationSha256));
    require58(
      typeof source === 'string' && hash15(source) === sourceConfigurationSha256,
      'private source bytes differ',
    );
    const before = await captureAzureNetworkUpdateInventory(
        plan,
        { exec: (...args) => bounded(() => execute.call(api, ...args)) },
        signal,
      ),
      outputs = await bounded(() => session.readOutputs(['ce_instances', 'ce_interfaces'], env, signal));
    verifyAzureTerraformNetworkUpdateState(plan, before, outputs);
    const qualification = await qualify(source, before);
    const binding = {
      schemaVersion: 1,
      kind: 'azure-terraform-network-original-source',
      engine: 'terraform',
      owner,
      planSha256: plan.planSha256,
      source,
      sourceConfigurationSha256,
      providerLockSha256: lock,
      before,
      outputs,
      qualification,
    };
    const current = await captureAzureNetworkUpdateInventory(
        plan,
        { exec: (...args) => bounded(() => execute.call(api, ...args)) },
        signal,
      ),
      currentOutputs = await bounded(() => session.readOutputs(['ce_instances', 'ce_interfaces'], env, signal));
    verifyAzureTerraformNetworkUpdateState(plan, current, currentOutputs);
    require58(
      same43(current.nodes, before.nodes) &&
        same43(currentOutputs, outputs) &&
        (await bounded(readRevision)) === sourceConfigurationSha256,
      'source boundary changed during qualification',
    );
    await validate(binding);
    signal?.throwIfAborted();
    require58((await bounded(readRevision)) === sourceConfigurationSha256, 'source changed before publication');
    const privateUnchanged = async () => {
      require58(
        (await bounded(readRevision)) === sourceConfigurationSha256 &&
          (await bounded(() => session.readConfiguration(sourceConfigurationSha256))) === source,
        'private source bytes changed at final publication boundary',
      );
      await verifyOwner();
      if (packets.has(name))
        require58(
          canonicalSha256(await bounded(() => store.read(name))) === packets.get(name),
          'owning source root changed after private read',
        );
      context();
    };
    await recheck();
    await privateUnchanged();
    await bounded(() => store.write(name, structuredClone(binding)));
    absent.delete(name);
    remember(packets, name, binding);
    await recheck();
    await privateUnchanged();
    signal?.throwIfAborted();
    return { session, binding };
  } finally {
    await unlock();
  }
}

// plugins/azure/src/ce/terraform-network-driver.ts
var same44 = (a, b) => canonicalEqual(a, b);
function require59(condition, message) {
  if (!condition) throw Error(`Azure Terraform network driver: ${message}`);
}
async function optional6(store, name) {
  try {
    return await store.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
function verifyResult(value) {
  require59(value && typeof value === 'object' && !Array.isArray(value), 'complete operational verification required');
  const row = value;
  require59(
    same44(Object.keys(row).sort(), ['evidenceSha256', 'scope', 'status']) &&
      row.status === 'verified' &&
      row.scope === 'node-interfaces-routing-traffic' &&
      typeof row.evidenceSha256 === 'string' &&
      /^[a-f0-9]{64}$/.test(row.evidenceSha256),
    'current node/interface/routing/traffic acceptance required',
  );
  return row;
}
async function runAzureTerraformNetworkUpdate(plan, terraform, store, api, env, loaders, site, dependencies, signal) {
  signal?.throwIfAborted();
  require59(
    typeof dependencies.collectAcceptance === 'function' && typeof dependencies.qualifyAcceptance === 'function',
    'trusted operational collector and verifier required',
  );
  const driver = await acquireAzureTerraformNetworkDriverLease(store.directory);
  const unlock = driver.release;
  let deferredRelease = false;
  try {
    const { binding, session } = await bindAzureTerraformNetworkUpdateSource(
      plan,
      terraform,
      store,
      api,
      env,
      loaders,
      site,
      signal,
      dependencies.qualifyAcceptance,
      dependencies.qualifyReplacementCompleted,
    );
    const checkpoint = await AzureTerraformNetworkCheckpoint.open(
      plan,
      binding,
      store,
      dependencies.qualifyAcceptance,
      signal,
    );
    const applied = (node) =>
      Array.from({ length: node - 1 }, (_, i) => plan.nics.map((nic) => `${i + 1}:${nic.index}`)).flat();
    const selected = (node) => plan.nics.map((nic) => `${node}:${nic.index}`);
    const identity = (node, inventory, configurationSha256) => ({
      owner: structuredClone(store.owner),
      planSha256: plan.planSha256,
      node,
      siteName: plan.siteName,
      siteUid: binding.qualification.siteUid,
      siteConfigurationSha256: binding.qualification.siteConfigurationSha256,
      configurationSha256,
      inventory: structuredClone(inventory),
    });
    const boundary = async (snapshot) => {
      signal?.throwIfAborted();
      require59(session.readConfigurationSha256, 'owning current private revision capability required');
      const row = snapshot.checkpoint.nodes.at(-1);
      require59(row, 'current serial node required');
      const nicStage = buildAzureTerraformNetworkPinnedNicStage(plan, snapshot.nodeSource, row.before, row.node);
      const routed = ['routing-complete', 'accepted'].includes(snapshot.phase);
      const routing =
        ['restarted', 'routing-complete', 'accepted'].includes(snapshot.phase) && row.history
          ? buildAzureTerraformNetworkRoutingStage(
              plan,
              snapshot.nodeSource,
              row.before,
              row.history.inventory,
              row.node,
            )
          : undefined;
      require59(!routed || routing, 'completed routing history required');
      const stage =
        routed && routing
          ? {
              ...nicStage,
              configuration: routing.releasedConfiguration,
              configurationSha256: routing.releasedConfigurationSha256,
            }
          : nicStage;
      const revision = await session.readConfigurationSha256();
      const allowed =
        snapshot.phase === 'deallocated'
          ? [stage.previousConfigurationSha256, stage.configurationSha256]
          : snapshot.phase === 'restarted' && routing
            ? [nicStage.configurationSha256, routing.configurationSha256, routing.releasedConfigurationSha256]
            : [snapshot.configurationSha256];
      require59(
        typeof revision === 'string' && allowed.includes(revision),
        'current private configuration differs from serial boundary',
      );
      const inventory = await captureAzureNetworkUpdateInventory(plan, api, signal),
        progressed = applied(row.node);
      if (snapshot.phase === 'deallocated') {
        for (const [index, nic] of Object.entries(inventory.nodes[String(row.node)].nics)) {
          const before = row.before.nodes[String(row.node)].nics[index];
          if (
            nic.subnetId.toLowerCase() === before.targetSubnetId.toLowerCase() &&
            revision === stage.configurationSha256
          )
            progressed.push(`${row.node}:${index}`);
        }
      } else if (!['prepared'].includes(snapshot.phase)) progressed.push(...selected(row.node));
      verifyAzureNetworkUpdateProgress(plan, binding.before, inventory, progressed);
      for (const [node, vm] of Object.entries(binding.before.nodes))
        for (const [index, nic] of Object.entries(vm.nics))
          if (!progressed.includes(`${node}:${index}`))
            require59(
              inventory.nodes[node].nics[index].privateIp === nic.privateIp,
              'unsubmitted current private address changed',
            );
      const outputs = await session.readOutputs(['ce_instances', 'ce_interfaces'], env, signal);
      verifyAzureTerraformNetworkUpdateState(plan, inventory, outputs);
      const again = await captureAzureNetworkUpdateInventory(plan, api, signal);
      require59(
        same44(again.nodes, inventory.nodes) && (await session.readConfigurationSha256()) === revision,
        'cloud/private boundary changed during observation',
      );
      return { inventory, outputs, configurationSha256: revision, progressed, stage };
    };
    const pending = (snapshot, purpose) => ({
      status: 'operational-acceptance-pending',
      engine: 'terraform',
      planId: plan.planId,
      planSha256: plan.planSha256,
      node: snapshot.currentNode,
      phase: snapshot.phase,
      purpose,
      reason: 'node-operational-evidence-unverified',
      checkpointSha256: snapshot.checkpointSha256,
    });
    const collect = async (expected, purpose) => {
      signal?.throwIfAborted();
      try {
        const receipt = await dependencies.collectAcceptance(structuredClone(expected), purpose, signal);
        const verification = verifyResult(
          await dependencies.qualifyAcceptance(structuredClone(receipt), structuredClone(expected), 'current', signal),
        );
        signal?.throwIfAborted();
        return { receipt, verification };
      } catch {
        signal?.throwIfAborted();
        return;
      }
    };
    const preflight = async (snapshot, current) => {
      const name = `${plan.planId}-terraform-network-node-${snapshot.currentNode}-preflight.json`;
      const saved = await optional6(store, name);
      if (saved !== undefined) {
        const row = saved;
        require59(
          row &&
            same44(Object.keys(row).sort(), [
              'identity',
              'receipt',
              'schemaVersion',
              'sourceBindingSha256',
              'verification',
            ]) &&
            row.schemaVersion === 1 &&
            row.sourceBindingSha256 === canonicalSha256(binding) &&
            row.identity &&
            row.identity.node === snapshot.currentNode &&
            row.identity.configurationSha256 === snapshot.configurationSha256 &&
            same44(
              { ...row.identity, inventory: undefined },
              {
                ...identity(snapshot.currentNode, current.inventory, current.configurationSha256),
                inventory: undefined,
              },
            ),
          'saved operational preflight identity differs',
        );
        verifyAzureNetworkUpdateProgress(plan, binding.before, row.identity.inventory, applied(snapshot.currentNode));
        try {
          const verification = verifyResult(
            await dependencies.qualifyAcceptance(
              structuredClone(row.receipt),
              structuredClone(row.identity),
              'historical',
              signal,
            ),
          );
          require59(same44(row.verification, verification), 'saved preflight provenance differs');
          signal?.throwIfAborted();
          require59(same44(await store.read(name), saved), 'preflight changed during qualification');
          return true;
        } catch {
          signal?.throwIfAborted();
          return false;
        }
      }
      const names = [
        'mutation-plan',
        'mutation-binding',
        'mutation-outcome',
        'mutation-complete',
        'release-plan',
        'release-binding',
        'release-outcome',
        'release-complete',
        'final-plan',
        'current-no-change-plan',
      ];
      for (const suffix of names)
        require59(
          (await optional6(
            store,
            `${plan.planId}-terraform-network-node-${snapshot.currentNode}-deallocate-${suffix}.json`,
          )) === undefined,
          'preflight missing after node interruption publication',
        );
      const expected = identity(snapshot.currentNode, current.inventory, current.configurationSha256);
      const evidence = await collect(expected, 'preflight');
      if (!evidence) return false;
      const now = await boundary(snapshot);
      require59(same44(now.inventory.nodes, current.inventory.nodes), 'current preflight cloud identity changed');
      signal?.throwIfAborted();
      await store.write(name, {
        schemaVersion: 1,
        sourceBindingSha256: canonicalSha256(binding),
        identity: expected,
        ...evidence,
      });
      signal?.throwIfAborted();
      return true;
    };
    const retirePower = async (node, operation) => {
      await verifyAzureTerraformNetworkDriverLease(driver.lease, store.directory);
      const result = await (dependencies.retirePower ?? retireAzureTerraformNetworkCompletedPowerStageInDriver)(
        driver.lease,
        plan,
        node,
        operation,
        terraform,
        store,
        loaders,
        site,
        dependencies.qualifyAcceptance,
        api,
        env,
        signal,
        dependencies.qualifyReplacementCompleted,
      );
      require59(
        result &&
          typeof result === 'object' &&
          !Array.isArray(result) &&
          same44(
            Object.keys(result).sort(),
            [
              'schemaVersion',
              'scope',
              'sourcePlanSha256',
              'node',
              'operation',
              'stage',
              'graphSha256',
              'preparingSha256',
              'finalReceiptSha256',
              'markerSha256',
              'artifactRetirementReceiptSha256',
              'wholeAppliedStateEmptyQualified',
              'independentCleanupQualified',
              'runnerRetirementQualified',
              'currentOperationalAcceptanceQualified',
              'parentRetirementQualified',
              'retirementQualified',
            ].sort(),
          ) &&
          result.schemaVersion === 1 &&
          result.scope === 'selected-completed-network-power-runner-retirement' &&
          result.sourcePlanSha256 === plan.planSha256 &&
          result.node === node &&
          result.operation === operation &&
          result.stage === `network-${plan.planSha256.slice(0, 24)}-node-${node}-${operation}` &&
          result.wholeAppliedStateEmptyQualified === true &&
          result.independentCleanupQualified === true &&
          result.runnerRetirementQualified === true &&
          result.currentOperationalAcceptanceQualified === false &&
          result.parentRetirementQualified === false &&
          result.retirementQualified === false &&
          [
            result.graphSha256,
            result.preparingSha256,
            result.finalReceiptSha256,
            result.markerSha256,
            result.artifactRetirementReceiptSha256,
          ].every((value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)),
        'complete exact selected power runner retirement required before serial advancement',
      );
      await verifyAzureTerraformNetworkDriverLease(driver.lease, store.directory);
      signal?.throwIfAborted();
    };
    const existingStage = async (snapshot, phase) => {
      const prefix = `${plan.planId}-terraform-network-node-${snapshot.currentNode}`;
      const name =
        phase === 'routing-complete'
          ? `${prefix}-routing-final-plan.json`
          : phase === 'nic-complete'
            ? `${prefix}-final-plan.json`
            : `${prefix}-${phase === 'deallocated' ? 'deallocate' : 'start'}-final-plan.json`;
      if ((await optional6(store, name)) === undefined) return false;
      const row = snapshot.checkpoint.nodes.at(-1);
      require59(row, 'selected node history boundary required');
      await readAzureTerraformNetworkNodeHistory(plan, snapshot.nodeSource, row.before, row.node, phase, store, signal);
      const progressed = [...applied(row.node), ...(phase === 'deallocated' ? [] : selected(row.node))];
      const power = await observeAzureTerraformNetworkPower(
        plan,
        row.before,
        row.node,
        ['restarted', 'routing-complete'].includes(phase) ? 'start' : 'deallocate',
        progressed,
        api,
        signal,
      );
      require59(power.converged, 'completed historical stage lacks current matching power');
      return true;
    };
    let snapshot = await checkpoint.read(signal);
    while (!snapshot.allNodesAccepted) {
      signal?.throwIfAborted();
      const current = await boundary(snapshot),
        row = snapshot.checkpoint.nodes.at(-1);
      require59(row, 'complete current serial node required');
      if (snapshot.phase === 'prepared') {
        if (!(await preflight(snapshot, current))) return pending(snapshot, 'preflight');
        if (!(await existingStage(snapshot, 'deallocated')))
          await (dependencies.runPower ?? runAzureTerraformNetworkPowerStage)(
            plan,
            row.before,
            row.node,
            'deallocate',
            applied(row.node),
            terraform,
            store,
            api,
            env,
            signal,
          );
        await retirePower(row.node, 'deallocate');
        snapshot = await checkpoint.recordStage(snapshot.checkpointSha256, row.node, 'deallocated', signal);
      } else if (snapshot.phase === 'deallocated') {
        if (!(await existingStage(snapshot, 'nic-complete')))
          await (dependencies.runNic ?? runAzureTerraformNetworkNicStage)(
            plan,
            snapshot.nodeSource,
            row.before,
            row.node,
            applied(row.node),
            session,
            store,
            api,
            env,
            signal,
          );
        snapshot = await checkpoint.recordStage(snapshot.checkpointSha256, row.node, 'nic-complete', signal);
      } else if (snapshot.phase === 'nic-complete') {
        if (!(await existingStage(snapshot, 'restarted')))
          await (dependencies.runPower ?? runAzureTerraformNetworkPowerStage)(
            plan,
            row.before,
            row.node,
            'start',
            [...applied(row.node), ...selected(row.node)],
            terraform,
            store,
            api,
            env,
            signal,
          );
        await retirePower(row.node, 'start');
        snapshot = await checkpoint.recordStage(snapshot.checkpointSha256, row.node, 'restarted', signal);
      } else if (snapshot.phase === 'restarted') {
        require59(
          row.history?.phase === 'restarted' && same44(current.inventory.nodes, row.history.inventory.nodes),
          'current NIC identity differs from authenticated restart boundary',
        );
        const preparedRouting = await optional6(
          store,
          `${plan.planId}-terraform-network-node-${row.node}-routing-prepared.json`,
        );
        const routingInput =
          preparedRouting === undefined
            ? current.inventory
            : validateAzureTerraformNetworkRoutingPrepared(
                plan,
                snapshot.nodeSource,
                row.before,
                current.inventory,
                row.node,
                preparedRouting,
              ).current;
        if (!(await existingStage(snapshot, 'routing-complete')))
          await (dependencies.runRouting ?? runAzureTerraformNetworkRoutingStage)(
            plan,
            snapshot.nodeSource,
            row.before,
            routingInput,
            row.node,
            session,
            store,
            api,
            env,
            signal,
          );
        snapshot = await checkpoint.recordStage(snapshot.checkpointSha256, row.node, 'routing-complete', signal);
      } else if (snapshot.phase === 'routing-complete') {
        const power = await observeAzureTerraformNetworkPower(
          plan,
          row.before,
          row.node,
          'start',
          current.progressed,
          api,
          signal,
        );
        require59(power.converged, 'restored selected node is not currently running');
        const durable = await optional6(
          store,
          `${plan.planId}-terraform-network-driver-revision-${snapshot.checkpoint.revision + 1}.json`,
        );
        if (durable !== undefined) {
          const saved = durable;
          require59(
            saved &&
              saved.previousCheckpointSha256 === snapshot.checkpointSha256 &&
              saved.lastTransition?.kind === 'accept' &&
              saved.lastTransition.node === row.node &&
              saved.nodes?.at(-1)?.acceptance,
            'pending immutable acceptance boundary differs',
          );
          snapshot = await checkpoint.acceptNode(
            snapshot.checkpointSha256,
            row.node,
            saved.nodes.at(-1)?.acceptance?.receipt,
            signal,
          );
          continue;
        }
        const evidence = await collect(identity(row.node, current.inventory, current.configurationSha256), 'restored');
        if (!evidence) return pending(snapshot, 'restored');
        if (!same44(current.inventory.nodes, row.history?.inventory.nodes))
          return pending(snapshot, 'restored-identity');
        snapshot = await checkpoint.acceptNode(snapshot.checkpointSha256, row.node, evidence.receipt, signal);
      } else {
        require59(snapshot.phase === 'accepted', 'known serial phase required');
        snapshot = await checkpoint.prepareNextNode(snapshot.checkpointSha256, current.inventory, signal);
      }
    }
    const current = await boundary(snapshot),
      evidenceByNode = {};
    for (let node = 1; node <= plan.topology.nodeCount; node++) {
      const power = await observeAzureTerraformNetworkPower(
        plan,
        current.inventory,
        node,
        'start',
        current.progressed,
        api,
        signal,
      );
      require59(power.converged, 'terminal node is not currently running');
      const evidence = await collect(identity(node, current.inventory, current.configurationSha256), 'final');
      if (!evidence) return pending(snapshot, `final-node-${node}`);
      evidenceByNode[String(node)] = evidence;
    }
    const receipt = await session.plan(env, signal);
    validateAzureNetworkUpdateTerraformReceipt(plan, current.stage, receipt, AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256);
    require59(receipt.noChanges, 'final owning refresh plan changes resources');
    const final = await boundary(snapshot);
    require59(
      same44(final.inventory.nodes, current.inventory.nodes) && same44(final.outputs, current.outputs),
      'terminal identities changed during final operational/refresh qualification',
    );
    signal?.throwIfAborted();
    const packet = {
      schemaVersion: 1,
      engine: 'terraform',
      planSha256: plan.planSha256,
      sourceBindingSha256: canonicalSha256(binding),
      checkpointSha256: snapshot.checkpointSha256,
      receipt,
      inventory: final.inventory,
      outputs: final.outputs,
      evidenceByNode,
    };
    const completeName = `${plan.planId}-terraform-network-driver-complete.json`;
    const currentFinalName = `${plan.planId}-terraform-network-driver-current-final.json`;
    let completed = await optional6(store, completeName);
    if (completed === undefined) {
      require59(
        (await optional6(store, currentFinalName)) === undefined,
        'original completion missing after current final publication',
      );
      await store.write(completeName, packet);
      completed = packet;
    } else {
      const historical = completed;
      require59(
        historical &&
          same44(Object.keys(historical).sort(), Object.keys(packet).sort()) &&
          historical.schemaVersion === 1 &&
          historical.engine === 'terraform' &&
          historical.planSha256 === plan.planSha256 &&
          historical.sourceBindingSha256 === packet.sourceBindingSha256 &&
          historical.checkpointSha256 === snapshot.checkpointSha256,
        'immutable completion identity differs',
      );
      validateAzureNetworkUpdateTerraformReceipt(
        plan,
        current.stage,
        historical.receipt,
        AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256,
      );
      require59(historical.receipt.noChanges, 'original completion refresh changes resources');
      verifyAzureNetworkUpdateProgress(plan, binding.before, historical.inventory, current.progressed);
      verifyAzureTerraformNetworkUpdateState(plan, historical.inventory, historical.outputs);
      require59(
        same44(
          Object.keys(historical.evidenceByNode).sort(),
          Array.from({ length: plan.topology.nodeCount }, (_, i) => String(i + 1)),
        ),
        'complete historical operational node inventory required',
      );
      for (let node = 1; node <= plan.topology.nodeCount; node++) {
        const evidence = historical.evidenceByNode[String(node)];
        require59(
          evidence && same44(Object.keys(evidence).sort(), ['receipt', 'verification']),
          'historical operational packet differs',
        );
        const qualified = verifyResult(
          await dependencies.qualifyAcceptance(
            structuredClone(evidence.receipt),
            identity(node, historical.inventory, historical.receipt.configurationSha256),
            'historical',
            signal,
          ),
        );
        require59(same44(evidence.verification, qualified), 'historical terminal operational provenance differs');
      }
      signal?.throwIfAborted();
      require59(same44(await store.read(completeName), completed), 'original completion changed during qualification');
    }
    signal?.throwIfAborted();
    await store.write(currentFinalName, packet);
    signal?.throwIfAborted();
    return {
      status: 'complete',
      engine: 'terraform',
      planId: plan.planId,
      planSha256: plan.planSha256,
      siteUid: binding.qualification.siteUid,
      nodeCount: plan.topology.nodeCount,
      checkpointSha256: snapshot.checkpointSha256,
      terraformNoChanges: true,
      finalPlanSha256: receipt.planSha256,
      cloudEvidenceSha256: canonicalSha256(final.inventory),
      completionSha256: canonicalSha256(completed),
    };
  } catch (error) {
    if (error instanceof AzureTerraformPowerLifecycleInterrupted) {
      deferredRelease = true;
      const completion = (async () => {
        let settled;
        try {
          settled = await error.completion;
        } catch {
          settled = { mutationSettlements: [], locksReleased: false, failures: ['power-settlement-unavailable'] };
        }
        const failures = [...settled.failures];
        try {
          await unlock();
        } catch {
          failures.push('driver-lock-release-failed');
        }
        return {
          mutationSettlements: settled.mutationSettlements,
          locksReleased: settled.locksReleased && failures.length === 0,
          failures,
        };
      })();
      throw new AzureTerraformPowerLifecycleInterrupted(completion);
    }
    throw error;
  } finally {
    if (!deferredRelease) await unlock();
  }
}

// plugins/azure/src/ce/terraform-network-public-update.ts
function siteObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Current owned network site identity is unavailable');
  return value;
}
async function runAzureTerraformNetworkPublicUpdate(plan, ctx, terraform, runtime, store, api, signal) {
  verifyAzureCePlan(plan);
  signal?.throwIfAborted();
  const binding = azureUpgradeBinding(plan);
  if (
    plan.engine !== 'terraform' ||
    plan.intent.operation !== 'update-network' ||
    !canonicalEqual(store.owner, binding.owner) ||
    runtime.engine !== 'terraform'
  )
    throw Error('Owning Terraform network update required');
  const inventory = await readAzureCePlanInventory(ctx.sessionManager, signal);
  const originals = inventory.plans
    .map((row) => row.plan)
    .filter(
      (source) =>
        source.engine === 'terraform' &&
        source.intent.operation === 'deploy' &&
        canonicalEqual(azureUpgradeBinding(source), binding),
    );
  if (originals.length !== 1) throw Error('Original public network deployment is missing or ambiguous');
  const loaders = await createAzureTerraformPublicHistoryLoaders(originals[0], ctx.sessionManager, store, signal);
  const current = await runtime.observeOwnedSite(binding, signal);
  const metadata = siteObject(current.metadata),
    system = siteObject(current.system_metadata);
  if (
    metadata.name !== binding.siteName ||
    metadata.namespace !== 'system' ||
    typeof system.uid !== 'string' ||
    !system.uid
  )
    throw Error('Current owned network site identity is unavailable');
  const site = {
    siteUid: system.uid,
    siteConfigurationSha256: canonicalSha256(runtime.ownedSiteConfiguration(binding, current)),
  };
  const verifiers = createAzureTerraformPublicOperationalVerifiers(
    originals[0],
    ctx.sessionManager,
    terraform,
    runtime,
    api,
    store,
    loaders,
    signal,
  );
  const acceptance = await verifiers.network(plan.planSha256, signal);
  return runAzureTerraformNetworkUpdate(
    plan,
    terraform,
    store,
    api,
    process.env,
    loaders,
    site,
    {
      collectAcceptance: acceptance.collectAcceptance,
      qualifyAcceptance: verifiers.qualifyNetwork,
      qualifyReplacementCompleted: verifiers.qualifyReplacement,
    },
    signal,
  );
}

// plugins/azure/src/ce/terraform-replacement-public-source.ts
import { createHash as createHash30 } from 'node:crypto';

var object36 = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Azure Terraform public source record is malformed');
  return value;
};
var require60 = (condition, message) => {
  if (!condition) throw Error(`Azure Terraform public source: ${message}`);
};
async function qualifyAzureTerraformReplacementPublicSource(
  plan,
  source,
  current,
  store,
  loadSource,
  loadOutcome,
  providerLockSha256,
) {
  require60(
    !plan.terraformNetworkReplacementProfile,
    'network-bound replacement requires its dedicated owning source contract',
  );
  await store.verify();
  const workflow = object36(await store.read('terraform-workflow.json'));
  require60(
    workflow.schemaVersion === 1 &&
      workflow.engine === 'terraform' &&
      workflow.stage === 'registered' &&
      typeof workflow.planSha256 === 'string' &&
      /^[a-f0-9]{64}$/.test(workflow.planSha256),
    'original creation admission is incomplete',
  );
  const original = await loadSource(workflow.planSha256);
  verifyAzureCePlan(original);
  require60(original.planSha256 === workflow.planSha256, 'original creation digest differs');
  const bootstraps = object36(workflow.bootstrapByNode),
    launches = object36(workflow.launchedAtByNode);
  require60(
    azureUpgradeBinding(original).nodes.every(
      (_, i) =>
        typeof bootstraps[String(i + 1)] === 'string' &&
        typeof launches[String(i + 1)] === 'string' &&
        Number.isFinite(Date.parse(launches[String(i + 1)])),
    ),
    'original bootstrap or launch boundaries are incomplete',
  );
  require60(
    workflow.configurationSha256 ===
      createHash30('sha256').update(renderAzureTerraformFoundation(original, bootstraps)).digest('hex'),
    'original admitted configuration digest differs',
  );
  const sources = new Map([[original.planSha256, original]]);
  const checkpoints = new Map();
  const bootstrapMaterials = new Map(
    Object.entries(bootstraps).map(([node, material]) => [`${original.planSha256}:${node}`, material]),
  );
  const outcome = async (owner, cp) => {
    const row = await loadOutcome(owner);
    require60(
      row.planSha256 === owner.planSha256 &&
        row.planId === owner.planId &&
        row.engine === 'terraform' &&
        object36(row.configuration).status === 'configured' &&
        (cp
          ? row.status === 'complete' &&
            object36(row.health).status === 'healthy' &&
            row.replacedNode === cp.node &&
            row.oldVmId === cp.oldVmIds[`${owner.deploymentName}-${cp.node}`] &&
            row.newVmId === cp.newVmId &&
            row.siteUid === cp.siteUid &&
            row.terraformNoChanges === true
          : ['registered', 'accepted'].includes(String(row.status)) &&
            object36(row.registrations).status === 'healthy') &&
        (owner.routing.mode !== 'route-server' || row.routing === 'healthy') &&
        (owner.intent.ingress?.mode !== 'platform-http' ||
          (object36(row.traffic).status === 'healthy' && row.terraformNoChanges === true)),
      'prior generation public execution is incomplete',
    );
  };
  await outcome(original);
  const visit = async (digest) => {
    if (sources.has(digest)) return;
    const owner = await loadSource(digest);
    verifyAzureCePlan(owner);
    require60(owner.planSha256 === digest, 'generation source digest differs');
    sources.set(digest, owner);
    const cp = validateAzureTerraformReplacementCheckpoint(
      owner,
      await store.read(`${owner.planId}-terraform-replacement.json`),
    );
    require60(cp.phase === 'complete', 'predecessor execution is incomplete');
    checkpoints.set(digest, cp);
    const history = new Map();
    for (const suffix of ['quiesce-plan', 'launch-plan', 'replacement-final-plan']) {
      const name = `${owner.planId}-terraform-${suffix}.json`;
      history.set(name, await store.read(name));
    }
    const snapshot = object36(await store.read(`${owner.planId}-terraform-replacement-source.json`));
    validateAzureTerraformReplacementStageHistory(owner, cp, snapshot, history, providerLockSha256);
    bootstrapMaterials.set(`${digest}:${cp.node}`, snapshot.bootstrap);
    await outcome(owner, cp);
    for (const prior of new Set(Object.values(cp.ownerPlanSha256ByNode))) await visit(prior);
  };
  for (const digest of new Set(Object.values(current.ownerPlanSha256ByNode))) await visit(digest);
  verifyAzureTerraformReplacementGenerationOwners(plan, current, original, sources, checkpoints);
  let configuration;
  try {
    configuration = object36(JSON.parse(source));
  } catch {
    throw Error('Azure Terraform retained source is malformed');
  }
  verifyAzureTerraformNonRelayConfiguration(original, current, configuration);
  const instances = object36(object36(configuration.resource).azurerm_linux_virtual_machine);
  for (const [index, node] of azureUpgradeBinding(original).nodes.entries()) {
    const encoded = object36(instances[`node_${index + 1}`]).custom_data;
    require60(
      typeof encoded === 'string' &&
        Buffer.from(encoded, 'base64').toString('utf8') ===
          bootstrapMaterials.get(`${current.ownerPlanSha256ByNode[node]}:${index + 1}`),
      'retained bootstrap differs from its owning generation',
    );
  }
}

// plugins/azure/src/ce/terraform-retirement.ts
var marker = 'azure-terraform-lifecycle-retirement.json';
async function assertAzureTerraformDeploymentActive(store) {
  await store.verify();
  for (const name of [
    marker,
    'azure-terraform-foundation-teardown-checkpoint.json',
    'azure-terraform-teardown-receipt.json',
  ]) {
    try {
      await store.read(name);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    throw Error('Azure Terraform retirement has started; resume teardown instead of deployment');
  }
}
async function beginAzureTerraformRetirement(base, teardown, store) {
  await store.verify();
  if (
    base.engine !== 'terraform' ||
    teardown.sourcePlanSha256 !== base.planSha256 ||
    !/^[a-f0-9]{64}$/.test(teardown.planSha256) ||
    canonicalSha256(store.owner) !== canonicalSha256(azureUpgradeBinding(base).owner)
  )
    throw Error('Azure Terraform retirement owner or source differs');
  const value = {
    schemaVersion: 1,
    engine: 'terraform',
    owner: store.owner,
    sourcePlanSha256: base.planSha256,
    teardownPlanSha256: teardown.planSha256,
    kind: teardown.kind,
  };
  let existing;
  try {
    existing = await store.read(marker);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (existing !== undefined && canonicalSha256(existing) !== canonicalSha256(value))
    throw Error('Azure Terraform retirement belongs to another immutable teardown');
  if (existing === undefined) await store.write(marker, value);
}

// plugins/azure/src/ce/terraform-workflow.ts
import { createHash as createHash32 } from 'node:crypto';

// plugins/azure/src/ce/auxiliary-catalog.ts
var identity2 = (catalog) => ({
  region: catalog.region,
  image: catalog.image,
  vmSizes: catalog.vmSizes,
});
async function revalidateAzureAuxiliaryCatalogs(plan, api, signal) {
  signal?.throwIfAborted();
  verifyAzureCePlan(plan);
  const evidence = [];
  const compare = (kind, saved, current) => {
    if (canonicalSha256(identity2(saved)) !== canonicalSha256(identity2(current)))
      throw Error(`Azure auxiliary preflight: saved ${kind} catalog identity or eligibility changed; replan required`);
    evidence.push({ kind, catalog: current });
  };
  if (plan.workloadProfile)
    compare('workload', plan.workloadProfile.catalog, await resolveAzureWorkloadCatalog(plan, api, signal));
  if (plan.relayProfile)
    compare(
      'relay',
      plan.relayProfile.catalog,
      await resolveAzureRelayCatalog(plan, plan.relayProfile.selection, api, signal),
    );
  signal?.throwIfAborted();
  return evidence;
}

// plugins/azure/src/ce/terraform-identities.ts
import { isIP as isIP7 } from 'node:net';

var object37 = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
var lower12 = (value) => (typeof value === 'string' ? value.toLowerCase() : '');
var uuid5 = (value) => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
async function discoverAzureTerraformInterfaces(plan, outputs, api, signal) {
  if (plan.engine !== 'terraform') throw new Error('Azure interface discovery requires Terraform ownership');
  const observedAt = new Date().toISOString();
  const run = async (args) => {
    signal?.throwIfAborted();
    const result = await api.exec('az', [...args, '--subscription', plan.subscription.id, '--output', 'json'], {
      signal,
    });
    signal?.throwIfAborted();
    if (result.exitCode !== 0) throw new Error('Azure Terraform interface observation unavailable');
    let value;
    try {
      value = object37(JSON.parse(result.stdout));
    } catch {
      throw new Error('Malformed Azure Terraform interface observation');
    }
    if (!Object.keys(value).length || value.nextLink)
      throw new Error('Incomplete Azure Terraform interface observation');
    return value;
  };
  const account = await run(['account', 'show']);
  if (
    lower12(account.id) !== lower12(plan.subscription.id) ||
    lower12(account.tenantId) !== lower12(plan.subscription.tenantId) ||
    account.environmentName !== plan.subscription.cloud ||
    account.state !== 'Enabled'
  )
    throw new Error('Azure Terraform observation account differs from deployment');
  const scope = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/`;
  const instances = object37(outputs.ce_instances);
  const candidates = object37(outputs.ce_interfaces);
  if (
    ![1, 3].includes(plan.topology.nodeCount) ||
    plan.nics.length < 1 ||
    plan.nics.some((nic, index) => nic.index !== index) ||
    Object.keys(instances).length !== plan.topology.nodeCount ||
    Object.keys(candidates).length !== plan.topology.nodeCount * plan.nics.length
  )
    throw new Error('Terraform Azure node/interface inventory is incomplete');
  const owned = async (kind, id) => {
    if (!lower12(id).startsWith(lower12(scope)))
      throw new Error('Terraform Azure resource is outside deployment scope');
    const value = await run([...(kind === 'nic' ? ['network', 'nic'] : ['vm']), 'show', '--ids', id]);
    const tags = object37(value.tags);
    if (
      lower12(value.id) !== lower12(id) ||
      lower12(value.location) !== lower12(plan.region) ||
      value.provisioningState !== 'Succeeded' ||
      tags['xcsh-managed-by'] !== 'azure-ce' ||
      tags['xcsh-execution-engine'] !== 'terraform' ||
      tags['xcsh-deployment-id'] !== plan.deploymentName ||
      tags['xcsh-plan-sha256'] !== plan.planSha256
    )
      throw new Error('Azure Terraform resource identity, readiness, or ownership differs');
    return value;
  };
  const interfaces = [];
  const macs = new Set();
  const vmIds = new Set();
  for (let node = 1; node <= plan.topology.nodeCount; node++) {
    const instance = object37(instances[String(node)]);
    const plannedVms = plan.actions.filter((action) => action.kind === 'vm-create' && action.node === node);
    if (
      plannedVms.length !== 1 ||
      !plannedVms[0].resourceId ||
      lower12(instance.id) !== lower12(plannedVms[0].resourceId) ||
      !uuid5(instance.vm_id) ||
      instance.site_name !== plan.siteName ||
      instance.hostname !== `${plan.deploymentName}-${node}`
    )
      throw new Error('Terraform Azure VM locator differs from planned identity');
    const vmResourceId = plannedVms[0].resourceId;
    const vm = await owned('vm', vmResourceId);
    if (!uuid5(vm.vmId) || lower12(vm.vmId) !== lower12(instance.vm_id) || vmIds.has(lower12(vm.vmId)))
      throw new Error('Terraform Azure VM instance identity is stale or ambiguous');
    vmIds.add(lower12(vm.vmId));
    const attachments = object37(vm.networkProfile).networkInterfaces;
    if (!Array.isArray(attachments) || attachments.length !== plan.nics.length)
      throw new Error('Azure VM NIC attachment inventory is incomplete');
    const attachedIds = attachments.map((entry) => lower12(object37(entry).id));
    if (attachedIds.some((id) => !id) || new Set(attachedIds).size !== attachedIds.length)
      throw new Error('Azure VM NIC attachment inventory is ambiguous');
    for (const nic of plan.nics) {
      const candidate = object37(candidates[`${node}:${nic.index}`]);
      const plannedSubnets = plan.actions.filter(
        (action) =>
          action.kind === 'subnet-create' &&
          nic.subnet.name &&
          action.args?.includes('--name') &&
          action.args[action.args.indexOf('--name') + 1] === nic.subnet.name,
      );
      const subnetId =
        nic.subnet.resourceId ?? (plannedSubnets.length === 1 ? plannedSubnets[0].resourceId : undefined);
      const plannedNics = plan.actions.filter(
        (action) =>
          action.kind === 'nic-create' &&
          action.node === node &&
          action.args?.[action.args.indexOf('--name') + 1] === `${plan.deploymentName}-${node}-nic${nic.index}`,
      );
      if (
        plannedNics.length !== 1 ||
        !plannedNics[0].resourceId ||
        lower12(candidate.id) !== lower12(plannedNics[0].resourceId) ||
        candidate.node !== node ||
        candidate.index !== nic.index ||
        candidate.role !== nic.role ||
        candidate.site_name !== plan.siteName ||
        typeof candidate.subnet_id !== 'string' ||
        !subnetId ||
        lower12(candidate.subnet_id) !== lower12(subnetId) ||
        !lower12(subnetId).startsWith(`/subscriptions/${plan.subscription.id}/`.toLowerCase()) ||
        !attachedIds.includes(lower12(candidate.id))
      )
        throw new Error('Terraform Azure interface locator differs from planned identity');
      const resourceId = plannedNics[0].resourceId;
      const current = await owned('nic', resourceId);
      const mac = lower12(current.macAddress).replaceAll('-', ':');
      if (
        lower12(object37(current.virtualMachine).id) !== lower12(vmResourceId) ||
        !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(mac) ||
        macs.has(mac)
      )
        throw new Error('Azure NIC attachment or MAC is missing or ambiguous');
      const configs = current.ipConfigurations;
      if (!Array.isArray(configs)) throw new Error('Azure NIC IP configurations unavailable');
      const primary = configs
        .map(object37)
        .filter((config) => config.primary === true || (configs.length === 1 && config.primary === undefined));
      const config = primary[0] ?? {};
      if (
        primary.length !== 1 ||
        config.privateIPAddressVersion !== 'IPv4' ||
        typeof config.privateIPAddress !== 'string' ||
        isIP7(config.privateIPAddress) !== 4 ||
        lower12(object37(config.subnet).id) !== lower12(candidate.subnet_id) ||
        (nic.subnet.resourceId && lower12(candidate.subnet_id) !== lower12(nic.subnet.resourceId))
      )
        throw new Error('Azure NIC primary address or subnet binding differs');
      macs.add(mac);
      interfaces.push({
        resourceId,
        subnetId: candidate.subnet_id,
        vmResourceId,
        vmId: String(vm.vmId),
        siteName: plan.siteName,
        node,
        index: nic.index,
        role: nic.role,
        mac,
        privateIp: config.privateIPAddress,
      });
    }
  }
  return {
    source: 'azure:account-show+vm-show+network-nic-show',
    observedAt,
    planId: plan.planId,
    planSha256: plan.planSha256,
    engine: plan.engine,
    subscriptionId: plan.subscription.id,
    tenantId: plan.subscription.tenantId,
    cloud: plan.subscription.cloud,
    region: plan.region,
    interfaces,
  };
}

// plugins/azure/src/ce/terraform-original-receipt-inventory.ts
import { createHash as createHash31, randomUUID as randomUUID3 } from 'node:crypto';
import { constants as constants6 } from 'node:fs';
import {
  link as link2,
  lstat as lstat9,
  mkdir,
  open as open6,
  readdir as readdir9,
  realpath as realpath8,
  unlink as unlink2,
} from 'node:fs/promises';
import { join as join10 } from 'node:path';

var hash16 = (value) => createHash31('sha256').update(value).digest('hex');
var sha15 = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
var same45 = canonicalEqual;
function require61(value, message) {
  if (!value) throw Error(`Azure Terraform original receipt inventory: ${message}`);
}
function exact2(value, keys) {
  require61(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).sort().join(',') === keys.sort().join(','),
    'artifact schema differs',
  );
}
async function buildAzureTerraformOriginalReceiptRecord(input) {
  const context = structuredClone(input),
    contextSha256 = canonicalSha256(context);
  const { plan, bootstrapByNode, stage, receipt } = context;
  verifyAzureCePlan(plan);
  require61(plan.engine === 'terraform' && plan.intent.operation === 'deploy', 'original Terraform deploy required');
  const count = Object.keys(bootstrapByNode).length;
  require61(
    count <= plan.topology.nodeCount &&
      Object.keys(bootstrapByNode).every(
        (node, index) =>
          node === String(index + 1) &&
          typeof bootstrapByNode[node] === 'string' &&
          bootstrapByNode[node].startsWith('#cloud-config') &&
          bootstrapByNode[node].includes('/etc/vpm/user_data') &&
          !/__\w+__/.test(bootstrapByNode[node]),
      ),
    'complete ordered resolved bootstrap prefix required',
  );
  if (stage.kind === 'node-admission') {
    exact2(stage, ['kind', 'node']);
    require61(
      Number.isInteger(stage.node) && stage.node >= 1 && stage.node <= plan.topology.nodeCount && count === stage.node,
      'node admission requires its exact bootstrap prefix',
    );
  } else {
    exact2(stage, ['kind']);
    require61(stage.kind === 'foundation' || stage.kind === 'ingress-final', 'original stage unsupported');
    if (stage.kind === 'ingress-final')
      require61(
        count === plan.topology.nodeCount && plan.intent.ingress?.mode === 'platform-http',
        'ingress final requires all nodes and owning ingress intent',
      );
  }
  exact2(receipt, [
    'schemaVersion',
    'deploymentId',
    'engine',
    'backendIdentity',
    'configurationSha256',
    'providerLockSha256',
    'planSha256',
    'changes',
    'noChanges',
    ...(receipt.actionInvocations === undefined ? [] : ['actionInvocations']),
  ]);
  const source = renderAzureTerraformFoundation(plan, bootstrapByNode);
  const deployment = await azureTerraformFoundationDeployment(plan, bootstrapByNode);
  require61(
    same45(input, context) && canonicalSha256(context) === contextSha256,
    'caller changed original receipt request',
  );
  require61(
    receipt.schemaVersion === 1 &&
      receipt.engine === 'terraform' &&
      receipt.deploymentId === deployment.deploymentId &&
      receipt.backendIdentity === deployment.backendIdentity &&
      receipt.configurationSha256 === hash16(source) &&
      receipt.providerLockSha256 === hash16(deployment.providerLock) &&
      sha15(receipt.planSha256) &&
      Array.isArray(receipt.changes) &&
      typeof receipt.noChanges === 'boolean',
    'receipt configuration/provider/engine/owner differs',
  );
  const addresses = new Set();
  for (const change of receipt.changes) {
    exact2(change, ['address', 'type', 'actions']);
    require61(
      typeof change.address === 'string' &&
        !!change.address &&
        typeof change.type === 'string' &&
        !!change.type &&
        !addresses.has(change.address) &&
        Array.isArray(change.actions) &&
        change.actions.length > 0 &&
        change.actions.every(
          (action) =>
            ['create', 'read', 'no-op'].includes(action) ||
            (change.address === 'azapi_resource_action.marketplace_terms' && action === 'update'),
        ),
      'original receipt contains destructive, duplicate or malformed changes',
    );
    addresses.add(change.address);
  }
  if (receipt.actionInvocations !== undefined) {
    require61(
      Array.isArray(receipt.actionInvocations) && receipt.actionInvocations.length === 0,
      'original resource admission cannot authorize Terraform action invocations',
    );
  }
  require61(
    receipt.noChanges ===
      receipt.changes.every((change) => change.actions.every((action) => action === 'no-op' || action === 'read')),
    'receipt no-change state differs',
  );
  if (stage.kind === 'ingress-final')
    require61(receipt.noChanges, 'ingress final must be an ordinary no-change receipt');
  return {
    schemaVersion: 1,
    engine: 'terraform',
    scope: 'original-deployment-plan-receipt-provenance',
    originalPlanSha256: plan.planSha256,
    ownerSha256: canonicalSha256(azureUpgradeBinding(plan).owner),
    stage,
    bootstrapSha256ByNode: Object.fromEntries(
      Object.entries(bootstrapByNode).map(([node, value]) => [node, hash16(value)]),
    ),
    receiptSha256: canonicalSha256(receipt),
    receipt,
  };
}
var recordName = (record) => `${canonicalSha256(record)}.json`;
var directoryName = 'terraform-original-deployment-receipts';
async function privateDirectory(path, create = false) {
  if (create) await mkdir(path, { mode: 448 });
  const stat = await lstat9(path);
  require61(
    stat.isDirectory() &&
      !stat.isSymbolicLink() &&
      stat.uid === process.getuid?.() &&
      (stat.mode & 63) === 0 &&
      (await realpath8(path)) === path,
    'receipt directory ownership differs',
  );
  return stat;
}
async function bytes2(path, links = 1) {
  const file = await open6(path, constants6.O_RDONLY | constants6.O_NOFOLLOW);
  try {
    const before = await file.stat();
    require61(
      before.isFile() && before.uid === process.getuid?.() && before.nlink === links && (before.mode & 63) === 0,
      'receipt file ownership differs',
    );
    const value = await file.readFile(),
      after = await file.stat(),
      named = await lstat9(path);
    require61(
      before.dev === after.dev &&
        before.ino === after.ino &&
        before.size === after.size &&
        before.mtimeMs === after.mtimeMs &&
        before.ctimeMs === after.ctimeMs &&
        named.dev === before.dev &&
        named.ino === before.ino &&
        named.nlink === links &&
        !named.isSymbolicLink() &&
        (named.mode & 63) === 0,
      'receipt file changed during read',
    );
    return value;
  } finally {
    await file.close();
  }
}
function checkedContext(store, input, signal) {
  const expected = canonicalSha256({ input, owner: store.owner, directory: store.directory }),
    verifier = store.verify;
  const boundary = () => {
    signal?.throwIfAborted();
    require61(store.verify === verifier, 'owning storage verifier changed');
    require61(
      canonicalSha256({ input, owner: store.owner, directory: store.directory }) === expected,
      'owning original receipt context changed',
    );
  };
  const step = async (work) => {
    boundary();
    let abort = () => {};
    const aborted = new Promise((_, reject) => {
      abort = () => reject(signal?.reason ?? Error('original receipt operation canceled'));
      signal?.addEventListener('abort', abort, { once: true });
    });
    try {
      const result = await Promise.race([Promise.resolve().then(work), aborted]);
      boundary();
      return result;
    } finally {
      signal?.removeEventListener('abort', abort);
    }
  };
  let nativeOwner;
  const inspectNativeOwner = async () => {
    const root = await privateDirectory(store.directory),
      path = join10(store.directory, 'owner.json'),
      stat = await lstat9(path),
      content = await bytes2(path);
    let value;
    try {
      value = JSON.parse(content.toString());
    } catch {
      throw Error('Malformed native owning manifest');
    }
    exact2(value, ['schemaVersion', 'owner']);
    require61(value.schemaVersion === 2 && same45(value.owner, store.owner), 'native owner manifest differs');
    const observed = canonicalSha256({
      directory: { dev: root.dev, ino: root.ino },
      owner: { dev: stat.dev, ino: stat.ino, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs, sha256: hash16(content) },
    });
    require61(nativeOwner === undefined || nativeOwner === observed, 'native owner manifest changed');
    nativeOwner = observed;
  };
  const verifiedStore = async () => {
    await step(inspectNativeOwner);
    await step(() => verifier.call(store));
    await step(inspectNativeOwner);
  };
  return { boundary, step, verifiedStore };
}
async function publishAzureTerraformOriginalReceipt(input, store, signal) {
  signal = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(180000)]);
  const { boundary, step, verifiedStore } = checkedContext(store, input, signal);
  const record = await step(() => buildAzureTerraformOriginalReceiptRecord(input));
  require61(record.ownerSha256 === canonicalSha256(store.owner), 'receipt publisher owner differs');
  await verifiedStore();
  const directory = join10(store.directory, directoryName);
  try {
    await step(() => privateDirectory(directory, true));
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    await step(() => privateDirectory(directory));
  }
  const name = recordName(record),
    path = join10(directory, name),
    content = Buffer.from(JSON.stringify(record));
  const pendingNames = async () =>
    (await step(() => readdir9(directory)))
      .filter((candidate) => new RegExp(`^${canonicalSha256(record)}-[a-f0-9-]{36}\\.pending$`).test(candidate))
      .sort();
  try {
    const publishedStat = await step(() => lstat9(path));
    if (publishedStat.nlink === 2) {
      const matches = [];
      for (const candidate of await pendingNames()) {
        const stat = await step(() => lstat9(join10(directory, candidate)));
        if (stat.dev === publishedStat.dev && stat.ino === publishedStat.ino) matches.push(candidate);
      }
      require61(matches.length === 1, 'linked publication recovery identity is ambiguous');
      const pendingPath = join10(directory, matches[0]);
      require61(
        (await step(() => bytes2(path, 2))).equals(content) &&
          (await step(() => bytes2(pendingPath, 2))).equals(content),
        'linked pending receipt provenance differs',
      );
      await verifiedStore();
      require61(
        (await step(() => bytes2(path, 2))).equals(content) &&
          (await step(() => bytes2(pendingPath, 2))).equals(content),
        'linked pending receipt changed at recovery',
      );
      await step(() => unlink2(pendingPath));
    }
    const existing = await step(() => bytes2(path));
    require61(existing.equals(content), 'foreign immutable receipt collision retained');
    await verifiedStore();
    require61((await step(() => bytes2(path))).equals(content), 'published receipt changed');
    return { name, publicationSha256: canonicalSha256(record), receiptSha256: record.receiptSha256 };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const retained = await pendingNames();
  require61(retained.length <= 1, 'pending publication recovery identity is ambiguous');
  const pending = join10(directory, retained[0] ?? `${canonicalSha256(record)}-${randomUUID3()}.pending`);
  if (retained.length)
    require61((await step(() => bytes2(pending))).equals(content), 'incomplete or foreign pending receipt retained');
  const file = await step(() =>
    open6(pending, retained.length ? constants6.O_RDONLY | constants6.O_NOFOLLOW : 'wx', 384),
  );
  try {
    if (!retained.length) await step(() => file.writeFile(content));
    await step(() => file.sync());
    await file.close();
    await verifiedStore();
    require61((await step(() => bytes2(pending))).equals(content), 'pending receipt changed');
    try {
      await step(() => link2(pending, path));
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      require61((await step(() => bytes2(path))).equals(content), 'late foreign immutable receipt collision retained');
    }
    await step(() => unlink2(pending));
    const handle = await step(() => open6(directory, constants6.O_RDONLY));
    try {
      await step(() => handle.sync());
    } finally {
      await handle.close();
    }
    await verifiedStore();
    require61((await step(() => bytes2(path))).equals(content), 'published receipt changed');
    boundary();
    return { name, publicationSha256: canonicalSha256(record), receiptSha256: record.receiptSha256 };
  } catch (error) {
    await file.close().catch(() => {});
    throw error;
  }
}
async function readAzureTerraformOriginalReceiptInventory(plan, bootstrapByNode, store, signal) {
  const input = {
    plan,
    bootstrapByNode,
    stage: { kind: 'foundation' },
    receipt: {},
  };
  signal = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(180000)]);
  const { boundary, step, verifiedStore } = checkedContext(store, input, signal);
  verifyAzureCePlan(plan);
  require61(
    plan.engine === 'terraform' &&
      plan.intent.operation === 'deploy' &&
      same45(azureUpgradeBinding(plan).owner, store.owner),
    'inventory original owner differs',
  );
  await verifiedStore();
  const directory = join10(store.directory, directoryName);
  try {
    await step(() => privateDirectory(directory));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await verifiedStore();
    try {
      await step(() => lstat9(directory));
      throw Error('original receipt directory appeared during absence');
    } catch (later) {
      if (later.code !== 'ENOENT') throw later;
    }
    return {
      schemaVersion: 1,
      status: 'absent',
      records: [],
      incompleteEntrySha256s: [],
      nativeJournalsQualified: false,
      originalDeploymentQualified: false,
    };
  }
  const names = (await step(() => readdir9(directory))).sort(),
    inventory = new Map(),
    records = [],
    incompleteEntrySha256s = [];
  for (const name of names) {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) {
      incompleteEntrySha256s.push(hash16(name));
      continue;
    }
    const content = await step(() => bytes2(join10(directory, name)));
    inventory.set(name, content);
    let value;
    try {
      value = JSON.parse(content.toString());
    } catch {
      throw Error('Malformed original receipt descriptor');
    }
    exact2(value, [
      'schemaVersion',
      'engine',
      'scope',
      'originalPlanSha256',
      'ownerSha256',
      'stage',
      'bootstrapSha256ByNode',
      'receiptSha256',
      'receipt',
    ]);
    const prefix = Object.fromEntries(
      Object.keys(value.bootstrapSha256ByNode).map((node) => [node, bootstrapByNode[node]]),
    );
    const expected = await step(() =>
      buildAzureTerraformOriginalReceiptRecord({
        plan,
        bootstrapByNode: prefix,
        stage: value.stage,
        receipt: value.receipt,
      }),
    );
    require61(
      same45(value, expected) && recordName(value) === name && content.equals(Buffer.from(JSON.stringify(expected))),
      'original receipt descriptor provenance differs',
    );
    records.push({ name, publicationSha256: canonicalSha256(value), record: value });
  }
  await verifiedStore();
  await step(() => privateDirectory(directory));
  require61(
    same45(await step(() => readdir9(directory).then((names) => names.sort())), names),
    'receipt namespace changed',
  );
  for (const [name, content] of inventory)
    require61(
      (await step(() => bytes2(join10(directory, name)))).equals(content),
      'receipt inventory changed at final boundary',
    );
  boundary();
  return {
    schemaVersion: 1,
    status: incompleteEntrySha256s.length ? 'partial' : 'complete',
    records,
    incompleteEntrySha256s,
    nativeJournalsQualified: false,
    originalDeploymentQualified: false,
  };
}
async function recoverAzureTerraformOriginalReceiptPublications(plan, bootstrapByNode, store, signal, nativeCurrent) {
  signal = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(180000)]);
  const input = {
    plan,
    bootstrapByNode,
    stage: { kind: 'foundation' },
    receipt: {},
  };
  const { step, boundary, verifiedStore } = checkedContext(store, input, signal);
  verifyAzureCePlan(plan);
  require61(
    plan.engine === 'terraform' &&
      plan.intent.operation === 'deploy' &&
      same45(azureUpgradeBinding(plan).owner, store.owner),
    'recovery original owner differs',
  );
  await verifiedStore();
  const directory = join10(store.directory, directoryName);
  try {
    await step(() => privateDirectory(directory));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    boundary();
    return [];
  }
  await restoreOriginalPublicationFragments(
    plan,
    bootstrapByNode,
    store,
    { step, boundary, verifiedStore },
    nativeCurrent,
  );
  const pending = (await step(() => readdir9(directory))).filter((name) => name.endsWith('.pending')).sort(),
    publications = [];
  for (const name of pending) {
    require61(/^[a-f0-9]{64}-[a-f0-9-]{36}\.pending$/.test(name), 'unrecognized pending original receipt retained');
    const stat = await step(() => lstat9(join10(directory, name)));
    require61(stat.nlink === 1 || stat.nlink === 2, 'pending original receipt has foreign link ownership');
    const content = await step(() => bytes2(join10(directory, name), stat.nlink));
    let value;
    try {
      value = JSON.parse(content.toString());
    } catch {
      publications.push(
        await recoverOriginalPublicationFragment(
          plan,
          bootstrapByNode,
          store,
          name,
          content,
          { step, boundary, verifiedStore },
          nativeCurrent,
          signal,
        ),
      );
      continue;
    }
    exact2(value, [
      'schemaVersion',
      'engine',
      'scope',
      'originalPlanSha256',
      'ownerSha256',
      'stage',
      'bootstrapSha256ByNode',
      'receiptSha256',
      'receipt',
    ]);
    const prefix = Object.fromEntries(
      Object.keys(value.bootstrapSha256ByNode).map((node) => [node, bootstrapByNode[node]]),
    );
    const record = await step(() =>
      buildAzureTerraformOriginalReceiptRecord({
        plan,
        bootstrapByNode: prefix,
        stage: value.stage,
        receipt: value.receipt,
      }),
    );
    require61(
      same45(record, value) &&
        name.startsWith(`${canonicalSha256(record)}-`) &&
        content.equals(Buffer.from(JSON.stringify(record))),
      'pending original receipt provenance differs',
    );
    publications.push(
      await step(() =>
        publishAzureTerraformOriginalReceipt(
          { plan, bootstrapByNode: prefix, stage: value.stage, receipt: value.receipt },
          store,
          signal,
        ),
      ),
    );
  }
  await verifiedStore();
  boundary();
  return publications;
}
var fragmentsName = 'terraform-original-deployment-publication-fragments';
var pendingPattern = /^([a-f0-9]{64})-([a-f0-9-]{36})\.pending$/;
async function syncDirectory(path, context) {
  const handle = await context.step(() => open6(path, constants6.O_RDONLY));
  try {
    await context.step(() => handle.sync());
  } finally {
    await handle.close();
  }
}
async function originalFragmentRecord(plan, bootstrapByNode, name, fragment, context, nativeCurrent) {
  require61(nativeCurrent, 'Partial pending original receipt retained: native owner reader unavailable');
  const native = structuredClone(await context.step(nativeCurrent));
  require61(
    native.schemaVersion === 1 &&
      native.scope === 'current-saved-plan-byte-and-journal-binding' &&
      native.state === 'planned' &&
      native.receipt &&
      sha15(native.manifestSha256) &&
      sha15(native.journalSha256) &&
      native.savedPlanSha256 === native.receipt.planSha256 &&
      native.ordinaryRefreshEnabled === true,
    'Partial pending original receipt retained: native journal is unavailable or requires reconciliation',
  );
  const candidates = [{ plan, bootstrapByNode: {}, stage: { kind: 'foundation' }, receipt: native.receipt }];
  for (let node = 1; node <= Object.keys(bootstrapByNode).length; node++)
    candidates.push({
      plan,
      bootstrapByNode: Object.fromEntries(
        Array.from({ length: node }, (_, i) => [String(i + 1), bootstrapByNode[String(i + 1)]]),
      ),
      stage: { kind: 'node-admission', node },
      receipt: native.receipt,
    });
  if (plan.intent.ingress?.mode === 'platform-http' && Object.keys(bootstrapByNode).length === plan.topology.nodeCount)
    candidates.push({ plan, bootstrapByNode, stage: { kind: 'ingress-final' }, receipt: native.receipt });
  const matches = [];
  for (const input of candidates) {
    if (hash16(renderAzureTerraformFoundation(plan, input.bootstrapByNode)) !== native.receipt.configurationSha256)
      continue;
    const record = await context.step(() => buildAzureTerraformOriginalReceiptRecord(input));
    if (!name.startsWith(`${canonicalSha256(record)}-`)) continue;
    const {
      configuration: _source,
      providerLock,
      ...identity
    } = await context.step(() => azureTerraformFoundationDeployment(plan, input.bootstrapByNode));
    require61(
      native.manifestSha256 ===
        canonicalSha256({
          ...identity,
          configurationSha256: record.receipt.configurationSha256,
          providerLockSha256: hash16(providerLock),
        }),
      'Partial pending original receipt retained: native manifest differs',
    );
    const expected = Buffer.from(JSON.stringify(record));
    require61(
      fragment.length < expected.length && expected.subarray(0, fragment.length).equals(fragment),
      'Partial pending original receipt retained: fragment is not an exact prefix of native publication',
    );
    matches.push({ input, record });
  }
  require61(
    matches.length === 1,
    'Partial pending original receipt retained: native receipt does not resolve a unique original publication',
  );
  require61(
    same45(await context.step(nativeCurrent), native),
    'Partial pending original receipt retained: native journal changed',
  );
  return { native, ...matches[0] };
}
async function recoverOriginalPublicationFragment(
  plan,
  bootstrapByNode,
  store,
  name,
  fragment,
  context,
  nativeCurrent,
  signal,
) {
  require61(pendingPattern.test(name), 'Partial pending original receipt retained: pending name differs');
  const bound = await originalFragmentRecord(plan, bootstrapByNode, name, fragment, context, nativeCurrent),
    directory = join10(store.directory, directoryName),
    pending = join10(directory, name),
    published = join10(directory, recordName(bound.record)),
    audit = join10(store.directory, fragmentsName),
    archived = join10(audit, `${name}.${hash16(fragment)}.fragment`);
  const final = await context.step(() =>
    lstat9(published).catch((error) => {
      if (error.code === 'ENOENT') return;
      throw error;
    }),
  );
  require61(!final, 'Partial pending original receipt retained: immutable publication already exists');
  try {
    await context.step(() => privateDirectory(audit, true));
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    await context.step(() => privateDirectory(audit));
  }
  let stat = await context.step(() => lstat9(pending));
  require61(stat.nlink === 1 || stat.nlink === 2, 'Partial pending original receipt retained: link ownership differs');
  require61(
    (await context.step(() => bytes2(pending, stat.nlink))).equals(fragment),
    'Partial pending original receipt changed during recovery',
  );
  try {
    await context.step(() => link2(pending, archived));
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  stat = await context.step(() => lstat9(pending));
  const retained = await context.step(() => lstat9(archived));
  require61(
    stat.nlink === 2 &&
      retained.nlink === 2 &&
      retained.dev === stat.dev &&
      retained.ino === stat.ino &&
      (await context.step(() => bytes2(pending, 2))).equals(fragment) &&
      (await context.step(() => bytes2(archived, 2))).equals(fragment),
    'Partial pending original receipt retained: archive collision or ownership differs',
  );
  await syncDirectory(audit, context);
  await context.verifiedStore();
  require61(
    same45(await context.step(nativeCurrent), bound.native),
    'Partial pending original receipt retained: native binding changed before rebuild',
  );
  require61(
    (await context.step(() => bytes2(pending, 2))).equals(fragment) &&
      (await context.step(() => bytes2(archived, 2))).equals(fragment),
    'Partial pending original receipt changed before preserving',
  );
  await context.step(() => unlink2(pending));
  await syncDirectory(directory, context);
  await context.verifiedStore();
  const result = await context.step(() => publishAzureTerraformOriginalReceipt(bound.input, store, signal));
  require61(
    same45(await context.step(nativeCurrent), bound.native),
    'Original native publication binding changed during recovery completion',
  );
  require61(
    (await context.step(() => bytes2(published))).equals(Buffer.from(JSON.stringify(bound.record))),
    'Recovered immutable original publication changed',
  );
  require61(
    (await context.step(() => bytes2(archived))).equals(fragment),
    'Original preserved publication fragment changed',
  );
  context.boundary();
  return result;
}
async function restoreOriginalPublicationFragments(plan, bootstrapByNode, store, context, nativeCurrent) {
  const audit = join10(store.directory, fragmentsName),
    directory = join10(store.directory, directoryName);
  try {
    await context.step(() => privateDirectory(audit));
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  for (const name of (await context.step(() => readdir9(audit))).sort()) {
    const match = /^([a-f0-9]{64}-[a-f0-9-]{36}\.pending)\.([a-f0-9]{64})\.fragment$/.exec(name);
    require61(match, 'Original publication fragment namespace differs');
    const path = join10(audit, name),
      stat = await context.step(() => lstat9(path));
    require61(stat.nlink === 1 || stat.nlink === 2, 'Original publication fragment link ownership differs');
    const fragment = await context.step(() => bytes2(path, stat.nlink));
    require61(hash16(fragment) === match[2], 'Original publication fragment digest differs');
    const published = join10(directory, `${match[1].slice(0, 64)}.json`),
      final = await context.step(() =>
        lstat9(published).catch((error) => {
          if (error.code === 'ENOENT') return;
          throw error;
        }),
      );
    if (final) {
      require61(stat.nlink === 1, 'Completed original fragment has an unresolved extra link');
      const content = await context.step(() => bytes2(published));
      require61(
        fragment.length < content.length &&
          content.subarray(0, fragment.length).equals(fragment) &&
          canonicalSha256(JSON.parse(content.toString())) === match[1].slice(0, 64),
        'Preserved original fragment differs from immutable publication',
      );
      continue;
    }
    const pending = join10(directory, match[1]),
      pendingStat = await context.step(() =>
        lstat9(pending).catch((error) => {
          if (error.code === 'ENOENT') return;
          throw error;
        }),
      );
    if (!pendingStat) {
      await originalFragmentRecord(plan, bootstrapByNode, match[1], fragment, context, nativeCurrent);
      await context.step(() => link2(path, pending));
      await syncDirectory(directory, context);
    }
    const linked = await context.step(() => lstat9(pending));
    require61(
      linked.dev === stat.dev &&
        linked.ino === stat.ino &&
        linked.nlink === 2 &&
        (await context.step(() => bytes2(pending, 2))).equals(fragment),
      'Preserved original fragment continuation differs',
    );
  }
  context.boundary();
}

// plugins/azure/src/ce/terraform-workflow.ts
var hash17 = (value) => createHash32('sha256').update(value).digest('hex');
var waitUntil = async (notBefore, signal) => {
  const remaining = notBefore - Date.now();
  if (remaining <= 0) return;
  await new Promise((resolve, reject) => {
    const aborted = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error('Azure Terraform HA admission cancelled'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', aborted);
      resolve();
    }, remaining);
    signal?.addEventListener('abort', aborted, { once: true });
    if (signal?.aborted) aborted();
  });
};
async function runAzureTerraformAdmission(
  plan,
  terraform,
  runtime,
  storage,
  api,
  revalidate,
  env,
  signal,
  haSerialDelayMs = 180000,
  acceptIngress,
) {
  verifyAzureCePlan(plan);
  if (plan.engine !== 'terraform' || runtime.engine !== 'terraform')
    throw new Error('Azure Terraform workflow requires Terraform ownership');
  assertAzureCeRoutingExecutable(plan);
  runtime.requireBootstrapContract('azure');
  requireAzureCeRoutingContract(plan, runtime);
  const binding = azureUpgradeBinding(plan);
  const initial = renderAzureTerraformFoundation(plan);
  await storage.verify();
  const auxiliaryCatalogs = await revalidateAzureAuxiliaryCatalogs(plan, api, signal);
  if (auxiliaryCatalogs.length)
    await storage.write('azure-auxiliary-catalog-preflight.json', {
      sourcePlanSha256: plan.planSha256,
      catalogs: auxiliaryCatalogs,
      ceSampleFreshnessQualified: false,
    });
  let checkpoint;
  try {
    checkpoint = await storage.read('terraform-workflow.json');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    checkpoint = {
      schemaVersion: 1,
      engine: 'terraform',
      planSha256: plan.planSha256,
      configurationSha256: hash17(initial),
      bootstrapByNode: {},
      launchedAtByNode: {},
      stage: 'network-pending',
      admissionReceiptSha256ByNode: {},
    };
    await storage.write('terraform-workflow.json', checkpoint);
  }
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.engine !== 'terraform' ||
    checkpoint.planSha256 !== plan.planSha256 ||
    !/^[a-f0-9]{64}$/.test(checkpoint.configurationSha256) ||
    !checkpoint.bootstrapByNode ||
    typeof checkpoint.bootstrapByNode !== 'object' ||
    Object.keys(checkpoint.bootstrapByNode).some(
      (node, index) => !/^[1-3]$/.test(node) || Number(node) > plan.topology.nodeCount || Number(node) !== index + 1,
    ) ||
    !checkpoint.launchedAtByNode ||
    typeof checkpoint.launchedAtByNode !== 'object' ||
    Object.entries(checkpoint.launchedAtByNode).some(
      ([node, launchedAt]) =>
        !/^[1-3]$/.test(node) ||
        Number(node) > plan.topology.nodeCount ||
        !checkpoint.bootstrapByNode[node] ||
        Number.isNaN(Date.parse(launchedAt)),
    ) ||
    !['network-pending', 'registration-pending', 'registered'].includes(checkpoint.stage) ||
    (checkpoint.admissionReceiptSha256ByNode !== undefined &&
      (!checkpoint.admissionReceiptSha256ByNode ||
        typeof checkpoint.admissionReceiptSha256ByNode !== 'object' ||
        Array.isArray(checkpoint.admissionReceiptSha256ByNode) ||
        Object.entries(checkpoint.admissionReceiptSha256ByNode).some(
          ([node, bound], index) =>
            node !== String(index + 1) ||
            Number(node) > plan.topology.nodeCount ||
            typeof bound !== 'string' ||
            !/^[a-f0-9]{64}$/.test(bound) ||
            !checkpoint.launchedAtByNode[node],
        ))) ||
    Object.keys(checkpoint.launchedAtByNode).some((node) => !checkpoint.admissionReceiptSha256ByNode?.[node])
  )
    throw new Error('Azure Terraform workflow checkpoint differs from the owning plan');
  const save = () => storage.write('terraform-workflow.json', checkpoint);
  await recoverAzureTerraformOriginalReceiptPublications(
    plan,
    checkpoint.bootstrapByNode,
    storage,
    signal,
    async () => {
      const open = terraform.open,
        session = await open.call(terraform, binding.owner, await azureTerraformFoundationDeployment(plan), 'current'),
        { readConfigurationSha256: readConfiguration, readCurrentPlanJournal: readJournal } = session;
      if (!readConfiguration || !readJournal) throw Error('Native original publication recovery readers unavailable');
      const configurationSha256 = await readConfiguration.call(session),
        journal = await readJournal.call(session, configurationSha256, signal);
      if (
        terraform.open !== open ||
        session.readConfigurationSha256 !== readConfiguration ||
        session.readCurrentPlanJournal !== readJournal
      )
        throw Error('Native original publication recovery dependency changed');
      return journal;
    },
  );
  signal?.throwIfAborted();
  let session;
  if (checkpoint.stage === 'network-pending') {
    const deployment = await azureTerraformFoundationDeployment(plan);
    try {
      session = await terraform.open(binding.owner, deployment, false);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      session = await terraform.open(binding.owner, deployment, 'current');
    }
    const reviseConfiguration = async (configuration) => {
      const nextHash = hash17(configuration);
      if (checkpoint.configurationSha256 === nextHash) return;
      try {
        await session.reviseConfiguration(checkpoint.configurationSha256, configuration);
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('revision is stale')) throw error;
        await session.reviseConfiguration(nextHash, configuration);
      }
      checkpoint.configurationSha256 = nextHash;
      await save();
    };
    const readHistory = session.readPlanApplicationHistory;
    if (!readHistory) throw Error('Azure Terraform original admission requires native receipt history');
    const completedStages = async () => {
      const inventory = await readAzureTerraformOriginalReceiptInventory(
        plan,
        checkpoint.bootstrapByNode,
        storage,
        signal,
      );
      if (inventory.status === 'partial') throw Error('Azure Terraform original receipt history is partial');
      const completed = new Map();
      let foundation = false;
      for (const row of inventory.records) {
        if (session.readPlanApplicationHistory !== readHistory)
          throw Error('Azure Terraform native receipt reader changed');
        const record = structuredClone(row.record),
          history = await readHistory.call(session, record.receipt, signal);
        if (session.readPlanApplicationHistory !== readHistory)
          throw Error('Azure Terraform native receipt reader changed');
        if (
          history.receiptSha256 !== record.receiptSha256 ||
          history.incompleteArchives ||
          !history.matches.length ||
          history.matches.some(
            (match) =>
              match.savedPlanSha256 !== record.receipt.planSha256 ||
              match.configurationSha256 !== record.receipt.configurationSha256 ||
              match.state === 'applying',
          )
        )
          throw Error('Azure Terraform original receipt native history is unavailable or requires reconciliation');
        const done =
          history.matches.some((match) => match.state === 'applied') ||
          (record.receipt.noChanges && history.matches.every((match) => match.state === 'planned'));
        if (done && record.stage.kind === 'foundation' && Object.keys(record.bootstrapSha256ByNode).length === 0)
          foundation = true;
        if (done && record.stage.kind === 'node-admission') {
          const node = record.stage.node,
            prior = completed.get(node),
            bound = checkpoint.admissionReceiptSha256ByNode?.[String(node)];
          if (bound && bound !== record.receiptSha256 && prior !== bound)
            throw Error('Azure Terraform original admission receipt binding differs');
          if (!prior || bound === record.receiptSha256) completed.set(node, record.receiptSha256);
        }
      }
      if (
        canonicalSha256(
          await readAzureTerraformOriginalReceiptInventory(plan, checkpoint.bootstrapByNode, storage, signal),
        ) !== canonicalSha256(inventory)
      )
        throw Error('Azure Terraform original receipts changed during native verification');
      for (const node of completed.keys())
        if (node > 1 && !completed.has(node - 1))
          throw Error('Azure Terraform original admission completion is not serial');
      for (const [node, bound] of Object.entries(checkpoint.admissionReceiptSha256ByNode ?? {}))
        if (completed.get(Number(node)) !== bound)
          throw Error('Azure Terraform original admission receipt binding is unverified');
      return { foundation, completed };
    };
    const progress = await completedStages();
    checkpoint.admissionReceiptSha256ByNode ??= {};
    for (const [node, receiptSha256] of progress.completed) {
      checkpoint.admissionReceiptSha256ByNode[String(node)] = receiptSha256;
      checkpoint.launchedAtByNode[String(node)] ??= new Date().toISOString();
    }
    await save();
    if (!progress.foundation) {
      if (progress.completed.size) throw Error('Azure Terraform original foundation completion is unavailable');
      await reviseConfiguration(renderAzureTerraformFoundation(plan, {}));
      await revalidate();
      const receipt = await session.plan(env, signal);
      if (
        receipt.changes.some((change) =>
          change.actions.some(
            (action) =>
              !['create', 'read', 'no-op'].includes(action) &&
              !(change.address === 'azapi_resource_action.marketplace_terms' && action === 'update'),
          ),
        )
      )
        throw new Error('Azure Terraform foundation would mutate existing resources');
      await publishAzureTerraformOriginalReceipt(
        { plan, bootstrapByNode: {}, stage: { kind: 'foundation' }, receipt },
        storage,
        signal,
      );
      await storage.write('terraform-foundation-plan.json', receipt);
      await storage.verify();
      await revalidate();
      if (!receipt.noChanges) await session.apply(receipt, env, signal);
      if (!(await completedStages()).foundation)
        throw Error('Azure Terraform original foundation native completion is unavailable');
    }
    await storage.verify();
    await revalidate();
    await runtime.reserveSite(
      binding,
      (record) => storage.write('terraform-site.json', record),
      signal,
      plan.intent.workloadFixture ? [plan.intent.workloadFixture.cidr] : [],
    );
    for (let node = 1; node <= plan.topology.nodeCount; node++) {
      signal?.throwIfAborted();
      await storage.verify();
      await revalidate();
      if (progress.completed.has(node)) continue;
      const previous = node - 1;
      if (plan.topology.ha && previous > 0) {
        const launchedAt = checkpoint.launchedAtByNode[String(previous)];
        if (!launchedAt) throw new Error('Prior Azure HA node launch boundary is unavailable');
        await waitUntil(Date.parse(launchedAt) + haSerialDelayMs, signal);
      }
      if (!checkpoint.bootstrapByNode[String(node)]) {
        const nodeName = `${plan.deploymentName}-${node}`;
        const tokenName = `${plan.deploymentName.slice(0, 40)}-${node}-${plan.planSha256.slice(0, 12)}`;
        checkpoint.bootstrapByNode[String(node)] = await runtime.bootstrap(
          binding,
          nodeName,
          tokenName,
          (secret) => storage.write(`${tokenName}.json`, secret),
          signal,
        );
        await save();
      }
      const admittedBootstrap = Object.fromEntries(
        Array.from({ length: node }, (_, index) => {
          const current = String(index + 1);
          return [current, checkpoint.bootstrapByNode[current]];
        }),
      );
      const configuration = renderAzureTerraformFoundation(plan, admittedBootstrap);
      const nextHash = hash17(configuration);
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
      const admission = await session.plan(env, signal);
      if (
        admission.changes.some((change) =>
          change.actions.some(
            (action) =>
              !['create', 'read', 'no-op'].includes(action) &&
              !(change.address === 'azapi_resource_action.marketplace_terms' && action === 'update'),
          ),
        )
      )
        throw new Error('Azure Terraform admission would alter or replace an existing resource');
      await publishAzureTerraformOriginalReceipt(
        { plan, bootstrapByNode: admittedBootstrap, stage: { kind: 'node-admission', node }, receipt: admission },
        storage,
        signal,
      );
      await storage.write(`terraform-admission-plan-node-${node}.json`, admission);
      await storage.verify();
      await revalidate();
      if (!admission.noChanges) await session.apply(admission, env, signal);
      const completed = (await completedStages()).completed.get(node);
      if (completed !== canonicalSha256(admission))
        throw Error('Azure Terraform original admission native completion is unavailable');
      checkpoint.admissionReceiptSha256ByNode[String(node)] = completed;
      checkpoint.launchedAtByNode[String(node)] ??= new Date().toISOString();
      await save();
    }
    checkpoint.stage = 'registration-pending';
    await save();
  } else {
    session = await terraform.open(
      binding.owner,
      await azureTerraformFoundationDeployment(plan, checkpoint.bootstrapByNode),
      'current',
    );
  }
  await revalidate();
  const outputs = await session.readOutputs(['ce_interfaces', 'ce_instances'], env, signal);
  const discovered = await discoverAzureTerraformInterfaces(plan, outputs, api, signal);
  const instances = outputs.ce_instances;
  const expectedInstances = Object.fromEntries(
    binding.nodes.map((node, index) => [node, instances[String(index + 1)]?.vm_id]),
  );
  if (Object.values(expectedInstances).some((id) => !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id ?? '')))
    throw new Error('Azure Terraform admitted VM identities are unavailable');
  const expectedInterfaces = discovered.interfaces
    .filter((item) => item.role === 'slo' || item.role === 'data' || item.role === 'sli')
    .map((item) => ({
      node: `${plan.deploymentName}-${item.node}`,
      role: item.role,
      mac: item.mac,
    }));
  const registrations = await runtime.approveRegistrations(
    binding,
    expectedInstances,
    (record) => storage.write('terraform-registration.json', record),
    signal,
  );
  const configuration = await runtime.observeRegisteredConfiguration(
    binding,
    expectedInstances,
    expectedInterfaces,
    signal,
  );
  await storage.write('terraform-registration-configuration.json', configuration);
  const current = await runtime.observeRegistrations(binding, expectedInstances, signal);
  await storage.write('terraform-registration-observation.json', current);
  checkpoint.stage =
    configuration.status === 'configured' && current.status === 'healthy' ? 'registered' : 'registration-pending';
  await save();
  let routing = 'unknown';
  if (plan.routing.mode === 'route-server' && checkpoint.stage === 'registered') {
    const evidence = plan.relayProfile
      ? await configureAzureSelectedRelayRouting(plan, expectedInterfaces, runtime, storage, api, signal)
      : await configureAzureRouteServerRouting(plan, expectedInterfaces, runtime, storage, api, signal);
    if (
      'observation' in evidence &&
      (evidence.observation.ceRouteScope === 'unqualified' || evidence.observation.freshness === 'unqualified')
    )
      throw Error('Azure relay evidence was collected; CE route scope and publication freshness remain unqualified');
    if (evidence.status !== 'healthy') throw new Error('Azure Route Server BGP and learned routes have not converged');
    routing = 'healthy';
  }
  let traffic = 'unknown';
  let terraformNoChanges;
  if (
    plan.intent.ingress?.mode === 'platform-http' &&
    checkpoint.stage === 'registered' &&
    (plan.routing.mode !== 'route-server' || routing === 'healthy')
  ) {
    if (!acceptIngress) throw new Error('Azure Terraform ingress acceptance driver is unavailable');
    traffic = (await acceptIngress(session)).traffic;
    const refresh = await session.plan(env, signal);
    await publishAzureTerraformOriginalReceipt(
      { plan, bootstrapByNode: checkpoint.bootstrapByNode, stage: { kind: 'ingress-final' }, receipt: refresh },
      storage,
      signal,
    );
    if (!refresh.noChanges) throw new Error('Terraform changed after Azure platform ingress convergence');
    terraformNoChanges = true;
  }
  const originalReceiptInventory = await readAzureTerraformOriginalReceiptInventory(
    plan,
    checkpoint.bootstrapByNode,
    storage,
    signal,
  );
  const originalRecords = originalReceiptInventory.records.map((row) => row.record);
  if (
    originalReceiptInventory.status !== 'complete' ||
    !originalRecords.some(
      (row) => row.stage.kind === 'foundation' && Object.keys(row.bootstrapSha256ByNode).length === 0,
    ) ||
    Array.from({ length: plan.topology.nodeCount }, (_, index) => index + 1).some(
      (node) => !originalRecords.some((row) => row.stage.kind === 'node-admission' && row.stage.node === node),
    ) ||
    (terraformNoChanges && !originalRecords.some((row) => row.stage.kind === 'ingress-final'))
  )
    throw Error('Azure Terraform original deployment receipt inventory is incomplete');
  const receiptInventorySha256 = canonicalSha256(originalReceiptInventory);
  checkpoint.originalReceiptInventorySha256 = receiptInventorySha256;
  await save();
  const finalReceiptInventory = await readAzureTerraformOriginalReceiptInventory(
    plan,
    checkpoint.bootstrapByNode,
    storage,
    signal,
  );
  if (
    canonicalSha256(finalReceiptInventory) !== receiptInventorySha256 ||
    checkpoint.originalReceiptInventorySha256 !== receiptInventorySha256
  )
    throw Error('Azure Terraform original receipt inventory changed during completion publication');
  return {
    originalReceiptInventorySha256: checkpoint.originalReceiptInventorySha256,
    planId: plan.planId,
    planSha256: plan.planSha256,
    engine: 'terraform',
    status:
      checkpoint.stage !== 'registered'
        ? 'pending-registration'
        : plan.intent.ingress?.mode === 'platform-http'
          ? 'accepted'
          : 'registered',
    registrations: current.status === 'healthy' ? current : registrations,
    configuration,
    routing,
    traffic,
    ...(terraformNoChanges ? { terraformNoChanges } : {}),
  };
}

// plugins/azure/src/ce/terraform-apply.ts
function reconcileAzureTerraformMarketplaceTermsAcceptance(plan, current) {
  if (
    plan.engine !== 'terraform' ||
    plan.intent.operation !== 'deploy' ||
    plan.image.termsAccepted ||
    current.image.termsAccepted !== true
  )
    throw new Error('Stale Azure CE plan: Marketplace terms changed outside the initial Terraform deployment contract');
  const beforeAcceptance = structuredClone(current);
  beforeAcceptance.image.termsAccepted = false;
  assertObservationFresh(plan, beforeAcceptance);
  return fingerprintCurrentObservation(plan, current);
}
function assertAzureTerraformApplyOperation(plan) {
  if (
    !['deploy', 'start', 'stop', 'resize', 'replace-node', 'update-network', 'reconcile', 'repair'].includes(
      plan.intent.operation,
    )
  )
    throw new Error(`Terraform ${plan.intent.operation} is not executable through Azure CE apply`);
}
async function acceptAzureTerraformLifecycleTraffic(
  plan,
  terraform,
  runtime,
  storage,
  api,
  contract,
  signal,
  dependencies = {},
) {
  if (
    !['start', 'resize', 'reconcile', 'repair'].includes(plan.intent.operation) ||
    plan.intent.ingress?.mode !== 'platform-http'
  )
    throw new Error(
      'Azure Terraform lifecycle traffic acceptance requires a running-state lifecycle plan with platform ingress',
    );
  const ingress = await (dependencies.ensureIngress ?? ensureAzurePlatformIngress)(
    plan,
    runtime,
    storage,
    contract,
    api,
    signal,
  );
  if (ingress?.listener !== 'configured') throw new Error('Observed Azure platform ingress has not converged');
  const traffic = await (dependencies.collectTraffic ?? collectAzureTrafficProbe)(
    plan,
    storage,
    api,
    signal,
    `${plan.planId}-traffic-probe`,
  );
  if (traffic.status !== 'healthy') throw new Error('Observed end-to-end Azure traffic has not converged');
  const finalNode = plan.topology.nodeCount;
  const finalSession = await terraform.open(
    azureUpgradeBinding(plan).owner,
    await azureTerraformLifecycleDeployment(plan, finalNode, false),
    'current',
  );
  const refresh = await finalSession.plan(process.env, signal);
  if (!refresh.noChanges || refresh.changes.length !== 0)
    throw new Error('Terraform changed after Azure lifecycle traffic convergence');
  return { ingress, traffic: { ...traffic, status: 'healthy' }, terraformNoChanges: true };
}
async function readAzureTerraformAuthorization(storage, planSha256) {
  const name = `terraform-authorization-${planSha256}.json`;
  let authorization;
  try {
    authorization = await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const authorized = Boolean(
    authorization &&
      typeof authorization === 'object' &&
      authorization.schemaVersion === 1 &&
      authorization.engine === 'terraform' &&
      authorization.planSha256 === planSha256 &&
      authorization.mutations === true,
  );
  if (authorization !== undefined && !authorized)
    throw new Error('Azure Terraform authorization checkpoint differs from this plan or engine');
  return { authorized, name };
}
async function executeAzureCeTerraformApply(
  requestInput,
  requestContext,
  requestApi,
  requestPlatform,
  requestTerraform,
  signal,
  dependencies = {},
) {
  const request = captureAzureCeApplyRequest(requestInput, requestContext),
    seal = () => {
      signal?.throwIfAborted();
      request.assertUnchanged();
    },
    services = guardAzureCeApplyServices(seal, requestApi, requestPlatform, requestTerraform),
    { input, context: ctx } = request,
    { api, platform } = services;
  if (!services.terraform) throw Error('Azure CE Terraform service was not acquired');
  const terraform = services.terraform;
  seal();
  if (Object.keys(input).some((key) => !['planId', 'planSha256'].includes(key)))
    throw new Error('Azure Terraform apply accepts only the persisted plan identity');
  const { plan } = await loadPlanArtifact(ctx.sessionManager, input.planId, input.planSha256);
  request.bindPlatformContext(plan.intent.platformContext);
  seal();
  if (plan.engine !== 'terraform') throw new Error('Azure Terraform apply requires Terraform ownership');
  assertAzureTerraformApplyOperation(plan);
  const storage = await platform.storage(azureUpgradeBinding(plan).owner);
  const release = await acquireProcessLock(join11(storage.directory, '.azure-terraform-lifecycle-lock'));
  try {
    await assertAzureTerraformDeploymentActive(storage);
    const { authorized, name: authorizationName } = await readAzureTerraformAuthorization(storage, plan.planSha256);
    assertApplyAllowed(plan, {
      ...input,
      hasUI: ctx.hasUI,
      env: process.env,
      authorization: authorized ? { apply: true, terms: false, destroy: false } : undefined,
      executionEngine: 'terraform',
    });
    const observe =
      dependencies.observe ??
      (() =>
        discoverAzureCompute(
          {
            subscriptionId: plan.subscription.id,
            publisher: plan.image.publisher,
            offer: plan.image.offer,
            plan: plan.image.plan,
            version: plan.image.version,
            vmSize: plan.vm.size,
            requiredNics: plan.nics.length,
            nodeCount: plan.topology.nodeCount,
            requireRouteServer: plan.routing.mode === 'route-server',
            brownfieldResourceIds: plan.intent.brownfield.resourceIds,
            deploymentName: plan.deploymentName,
            resourceGroup: plan.intent.resourceGroup,
          },
          api,
        ));
    let acceptedTermsFingerprint;
    const revalidate = async () => {
      const current = await observe();
      if (acceptedTermsFingerprint) return assertObservationFresh(plan, current, acceptedTermsFingerprint);
      if (current.image.termsAccepted === true && plan.image.termsAccepted === false) {
        acceptedTermsFingerprint = reconcileAzureTerraformMarketplaceTermsAcceptance(plan, current);
        await storage.write('terraform-marketplace-terms-observation.json', {
          schemaVersion: 1,
          engine: 'terraform',
          planSha256: plan.planSha256,
          observationFingerprint: acceptedTermsFingerprint,
          image: {
            publisher: current.image.publisher,
            offer: current.image.offer,
            plan: current.image.plan,
            version: current.image.version,
            termsAccepted: true,
          },
        });
        return;
      }
      assertObservationFresh(plan, current);
    };
    await revalidate();
    if (
      !authorized &&
      ctx.hasUI &&
      !(await ctx.ui.confirm(
        'Apply immutable Azure CE Terraform plan',
        `${plan.planId}
${plan.planSha256}`,
      ))
    )
      throw new Error('Azure CE Terraform apply was not approved');
    await storage.write(authorizationName, {
      schemaVersion: 1,
      engine: 'terraform',
      planSha256: plan.planSha256,
      mutations: true,
    });
    const runtime = await platform.runtime('terraform', plan.intent.platformContext);
    const ingressContract =
      plan.intent.ingress?.mode === 'platform-http'
        ? await (dependencies.ingressContract?.() ?? VerifiedIngressContract.release(undefined, signal))
        : undefined;
    const acceptIngress = ingressContract
      ? async () => {
          const ingress = await ensureAzurePlatformIngress(plan, runtime, storage, ingressContract, api, signal);
          if (ingress?.listener !== 'configured') throw new Error('Observed Azure platform ingress has not converged');
          const traffic = await collectAzureTrafficProbe(plan, storage, api, signal);
          if (traffic.status !== 'healthy') throw new Error('Observed end-to-end Azure traffic has not converged');
          return { ingress, traffic: { ...traffic, status: 'healthy' } };
        }
      : undefined;
    const qualifySource =
      !plan.relayProfile && !plan.terraformNetworkReplacementProfile && plan.intent.operation === 'replace-node'
        ? async (source, state) =>
            qualifyAzureTerraformReplacementPublicSource(
              plan,
              source,
              state,
              storage,
              async (digest) =>
                (await loadPlanArtifact(ctx.sessionManager, `azure-ce-${digest.slice(0, 24)}`, digest)).plan,
              (owner) => loadAzureTerraformOutcome(ctx.sessionManager, owner),
              createHash33('sha256')
                .update((await azureTerraformCurrentDeployment(plan)).providerLock)
                .digest('hex'),
            )
        : undefined;
    let result =
      plan.intent.operation === 'update-network'
        ? await runAzureTerraformNetworkPublicUpdate(plan, ctx, terraform, runtime, storage, api, signal)
        : ['start', 'stop', 'resize', 'reconcile', 'repair'].includes(plan.intent.operation)
          ? await runAzureTerraformLifecycle(plan, terraform, runtime, storage, api, process.env, signal)
          : plan.intent.operation === 'replace-node'
            ? plan.terraformNetworkReplacementProfile
              ? await runAzureTerraformNetworkPublicReplacement(
                  plan,
                  ctx,
                  terraform,
                  runtime,
                  storage,
                  api,
                  signal,
                  acceptIngress,
                )
              : await runAzureTerraformReplacement(
                  plan,
                  terraform,
                  runtime,
                  storage,
                  api,
                  process.env,
                  signal,
                  acceptIngress,
                  qualifySource,
                )
            : await runAzureTerraformAdmission(
                plan,
                terraform,
                runtime,
                storage,
                api,
                revalidate,
                process.env,
                signal,
                undefined,
                acceptIngress,
              );
    if (
      ['start', 'resize', 'reconcile', 'repair'].includes(plan.intent.operation) &&
      ingressContract &&
      plan.intent.ingress?.mode === 'platform-http'
    ) {
      result = {
        ...result,
        ...(await acceptAzureTerraformLifecycleTraffic(
          plan,
          terraform,
          runtime,
          storage,
          api,
          ingressContract,
          signal,
        )),
      };
    }
    const artifactId = await saveAzureTerraformOutcome(ctx.sessionManager, result);
    return { ...result, status: String(result.status), artifactId };
  } finally {
    await release();
  }
}

// plugins/azure/src/tools/azure-ce-apply.ts
var terraformDefaults = {
  platform: azurePlatformService,
  terraform: azureTerraformService,
};
async function resolveAzureCeActionReferences(
  args,
  api,
  plan,
  ownerPlanSha256 = plan.planSha256,
  networkUpdate,
  signal,
) {
  const replacements = {};
  for (const arg of args) {
    const configuration = /^__NODE_(\d+)_NIC_(\d+)_IPCONFIG_NAME__$/.exec(arg);
    if (configuration) {
      const nic = networkUpdate?.before.nodes[configuration[1]]?.nics[configuration[2]];
      if (!nic) throw Error('Azure network update execution configuration identity is unresolved');
      replacements[arg] = nic.ipConfigurationName;
      continue;
    }
    const exactNic = /^__NODE_(\d+)_NIC_(\d+)_PRIVATE_IP__$/.exec(arg);
    if (exactNic) {
      replacements[arg] = await resolveAzureNicAddress(
        api,
        plan,
        Number(exactNic[1]),
        Number(exactNic[2]),
        ownerPlanSha256,
        signal,
      );
      continue;
    }
    const match = /^__NODE_(\d+)_(SLO|SLI|DATA)_PRIVATE_IP__$/.exec(arg);
    if (!match || replacements[arg]) continue;
    const role =
      match[2] === 'DATA' && plan.nics.some((nic) => nic.role === 'data')
        ? 'data'
        : match[2] === 'SLO' || (match[2] === 'DATA' && plan.nics.length === 1)
          ? 'slo'
          : 'sli';
    replacements[arg] = await resolveInterfaceAddress(api, plan, Number(match[1]), role, ownerPlanSha256, signal);
  }
  return replacements;
}
async function executeAzureCeNativeApply2(
  requestParams,
  requestContext,
  requestApi,
  requestPlatformFactory,
  signal,
  requestDependencies = {},
) {
  const request = captureAzureCeApplyRequest(requestParams, requestContext),
    seal = () => {
      signal?.throwIfAborted();
      request.assertUnchanged();
    },
    { input: params, context: ctx } = request,
    api = guardAzureCeApplyObject(requestApi, seal),
    dependencies = guardAzureCeApplyObject(requestDependencies, seal),
    platformFactory = async () => {
      seal();
      const platform = await requestPlatformFactory();
      seal();
      return guardAzureCeApplyServices(seal, api, platform).platform;
    };
  seal();
  const { plan, observation } = await loadPlanArtifact(ctx.sessionManager, params.planId, params.planSha256);
  request.bindPlatformContext(plan.intent.platformContext);
  seal();
  if (Object.keys(params).some((key) => !['planId', 'planSha256'].includes(key)))
    throw new Error('Azure apply accepts only the persisted plan identity; caller evidence is unsupported');
  let existing = await loadCheckpoint(ctx.sessionManager, plan);
  let recoveredNativeLaunchNode;
  assertApplyAllowed(plan, {
    planId: params.planId,
    planSha256: params.planSha256,
    hasUI: ctx.hasUI,
    env: process.env,
    authorization: existing?.authorization,
  });
  if (
    plan.relayProfile?.schemaVersion === 2 &&
    plan.relayProfile.retainedDeploymentPlan.relayProfile?.schemaVersion === 2
  ) {
    const predecessor = await loadCheckpoint(ctx.sessionManager, plan.relayProfile.retainedDeploymentPlan);
    if (predecessor?.state !== 'complete')
      throw Error('Azure relay replacement predecessor has not completed its public execution contract');
  }
  let relayRecoveryPlatform;
  if (plan.intent.operation !== 'teardown' && (plan.relayProfile || !existing)) {
    relayRecoveryPlatform = await platformFactory();
    const relayStore = await relayRecoveryPlatform.storage({
      deploymentId: plan.deploymentName,
      engine: 'native',
      provider: 'azure',
      account: plan.subscription.id,
      region: plan.region,
    });
    await assertAzureNativeActive(relayStore);
  }
  let qualifiedNetworkReplacement;
  const verifyNetworkReplacement = async (checkpoint) => {
    if (!plan.networkReplacementProfile) return;
    relayRecoveryPlatform ??= await platformFactory();
    const store = await relayRecoveryPlatform.storage(azureUpgradeBinding(plan).owner);
    await assertAzureNativeActive(store);
    let admission;
    try {
      admission = await store.read(`native-admission-${plan.planSha256}.json`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (admission) validateAzureNativeAdmissionCheckpoint(plan, admission);
    qualifiedNetworkReplacement = await verifyAzureNativeNetworkReplacementExecution2(
      plan,
      admission,
      store,
      (source) => loadCheckpoint(ctx.sessionManager, source),
      api,
      await relayRecoveryPlatform.runtime('native', plan.intent.platformContext),
      checkpoint,
      signal,
    );
  };
  await verifyNetworkReplacement(existing);
  const observe =
    dependencies.observe ??
    (() =>
      discoverAzureCompute(
        {
          subscriptionId: plan.subscription.id,
          publisher: plan.image.publisher,
          offer: plan.image.offer,
          plan: plan.image.plan,
          version: plan.image.version,
          vmSize: plan.vm.size,
          requiredNics: plan.nics.length,
          nodeCount: plan.topology.nodeCount,
          requireRouteServer: plan.routing.mode === 'route-server',
          brownfieldResourceIds: plan.intent.brownfield.resourceIds,
          deploymentName: plan.deploymentName,
          resourceGroup: plan.intent.resourceGroup,
        },
        api,
      ));
  const remainingActions = plan.actions.slice(existing?.completedActionIds.length ?? 0);
  const hasImmutableDeleteTail =
    remainingActions.length > 0 && remainingActions.every((action) => action.kind === 'resource-delete');
  if (existing && plan.intent.operation === 'teardown' && hasImmutableDeleteTail) {
    validateAzureDeletionTail(plan, existing.completedActionIds);
  }
  let current = await observe();
  let networkUpdate;
  let networkHistoryStore;
  if (plan.intent.operation === 'update-network') {
    if (existing && (existing.completedActionIds.length || existing.pendingAction) && !existing.networkUpdate)
      throw Error('Azure network update recovery requires its original complete interface inventory');
    const inventory = await captureAzureNetworkUpdateInventory(plan, api, signal);
    networkUpdate = existing?.networkUpdate
      ? { ...existing.networkUpdate, current: inventory }
      : { before: inventory, current: inventory };
    validateAzureNativeNetworkUpdateCheckpoint(
      plan,
      networkUpdate,
      existing?.completedActionIds ?? [],
      existing?.pendingAction?.actionId,
    );
    relayRecoveryPlatform ??= await platformFactory();
    const networkStore = await relayRecoveryPlatform.storage(azureUpgradeBinding(plan).owner);
    networkHistoryStore = networkStore;
    const networkRuntime = await relayRecoveryPlatform.runtime('native', plan.intent.platformContext);
    const source = await qualifyAzureNativeNetworkUpdateSource(plan, networkUpdate.before, networkStore, (prior) =>
      loadCheckpoint(ctx.sessionManager, prior),
    );
    if (existing && (existing.completedActionIds.length || existing.pendingAction) && !existing.networkUpdate?.source)
      throw Error('Azure network update recovery requires completed original source provenance');
    if (networkUpdate.source && canonicalSha256(networkUpdate.source) !== canonicalSha256(source))
      throw Error('Azure network update original source binding changed');
    networkUpdate.source = source;
    await verifyAzureNativeNetworkUpdateSite(plan, source, networkRuntime, signal);
  }
  const finalize = async (checkpoint) => {
    if (plan.networkReplacementProfile) {
      const producer = relayRecoveryPlatform ?? (await platformFactory());
      await persistAzureNativeNetworkGenerationCompletion(
        plan,
        checkpoint,
        await producer.storage(azureUpgradeBinding(plan).owner),
      );
    }
    if (networkUpdate && networkHistoryStore) {
      await persistAzureNativeNetworkCheckpointHistory(plan, checkpoint, networkHistoryStore);
      await persistAzureNativeNetworkHistory(plan, checkpoint, networkHistoryStore);
    }
    return { plan, checkpoint };
  };
  let currentFingerprint = fingerprintCheckpointObservation(current);
  const existingSnapshot =
    existing?.schemaVersion === AZURE_CE_CHECKPOINT_SCHEMA_VERSION ? existing.observationSnapshot : undefined;
  if (
    plan.intent.operation === 'teardown' &&
    hasImmutableDeleteTail &&
    !existingSnapshot &&
    (!existing || existing.completedActionIds.length === 0)
  ) {
    reconcileAzureNativeDeletionPrefix(plan, existing?.completedActionIds ?? [], observation, current, []);
  }
  const mayRecoverDeletion = existingSnapshot !== undefined;
  if (
    mayRecoverDeletion &&
    existing?.observationSnapshot &&
    plan.intent.operation === 'teardown' &&
    existing.state !== 'complete'
  ) {
    const priorFingerprint = existing.observationFingerprint;
    if (!priorFingerprint) throw new Error('Azure teardown checkpoint has no observation fingerprint');
    const previousCompletedCount = existing.completedActionIds.length;
    const completedActionIds = reconcileAzureNativeDeletionPrefix(
      plan,
      existing.completedActionIds,
      existing.observationSnapshot,
      current,
      await collectAzureAbsentDeletionTail(plan, existing.completedActionIds, api, signal),
    );
    const recoveredActions = completedActionIds.length > previousCompletedCount;
    if (recoveredActions || !safeHexEqual(priorFingerprint, currentFingerprint)) {
      const newlyRecovered = new Set(completedActionIds.slice(previousCompletedCount));
      existing = {
        ...existing,
        completedActionIds,
        failedActionId:
          existing.failedActionId && newlyRecovered.has(existing.failedActionId) ? undefined : existing.failedActionId,
        observationFingerprint: currentFingerprint,
        observationSnapshot: structuredClone(current),
        state: recoveredActions
          ? completedActionIds.length === plan.actions.length
            ? 'complete'
            : existing.failedActionId && !newlyRecovered.has(existing.failedActionId)
              ? 'partial'
              : 'running'
          : existing.state,
      };
      await saveCheckpoint(ctx.sessionManager, plan, existing);
      if (existing.state === 'complete') return finalize(existing);
    }
  }
  if (
    existing?.schemaVersion === AZURE_CE_CHECKPOINT_SCHEMA_VERSION &&
    existing.pendingAction?.kind === 'relay-provision'
  ) {
    validateAzureNativePendingAction(plan, existing.completedActionIds, existing.pendingAction);
    relayRecoveryPlatform ??= await platformFactory();
    const relayStorage = await relayRecoveryPlatform.storage({
      deploymentId: plan.deploymentName,
      engine: 'native',
      provider: 'azure',
      account: plan.subscription.id,
      region: plan.region,
    });
    existing = await reconcileAzureNativeRelayProvision(plan, existing, current, relayStorage, api, signal);
    currentFingerprint = fingerprintCheckpointObservation(current);
    await saveCheckpoint(ctx.sessionManager, plan, existing);
    if (existing.state === 'complete') return finalize(existing);
  }
  if (
    existing?.schemaVersion === AZURE_CE_CHECKPOINT_SCHEMA_VERSION &&
    existing.pendingAction &&
    existing.pendingAction.kind !== 'relay-provision'
  ) {
    const action = plan.actions[existing.completedActionIds.length];
    if (!action) throw new Error('Pending Azure native mutation has no next immutable action');
    validateAzureNativePendingAction(plan, existing.completedActionIds, existing.pendingAction);
    const replacements = await resolveAzureCeActionReferences(
      action.args ?? [],
      api,
      plan,
      action.expectedOwnerPlanSha256,
      networkUpdate,
      signal,
    );
    const resolvedAction = {
      ...action,
      args: resolveActionArgs(action.args ?? [], plan.planSha256, replacements),
    };
    if (await azureNativePendingActionConverged(plan, resolvedAction, api, signal)) {
      if (action.kind === 'vm-create') recoveredNativeLaunchNode = action.node;
      current = await observe();
      currentFingerprint = fingerprintCheckpointObservation(current);
      existing = {
        ...existing,
        completedActionIds: [...existing.completedActionIds, action.id],
        failedActionId: existing.failedActionId === action.id ? undefined : existing.failedActionId,
        pendingAction: undefined,
        networkUpdate,
        observationFingerprint: currentFingerprint,
        observationSnapshot: structuredClone(current),
        state: existing.completedActionIds.length + 1 === plan.actions.length ? 'complete' : 'running',
      };
      await saveCheckpoint(ctx.sessionManager, plan, existing);
      if (existing.state === 'complete') return finalize(existing);
    }
  }
  if (existing?.observationFingerprint) {
    if (!safeHexEqual(existing.observationFingerprint, currentFingerprint)) {
      throw new Error('Stale Azure CE checkpoint: observations changed outside an allowed recovery boundary');
    }
  } else {
    assertObservationFresh(plan, current);
  }
  if (existing?.state === 'complete') return finalize(existing);
  const completed = new Set(existing?.completedActionIds ?? []);
  const authorization = {
    apply: existing?.authorization?.apply === true,
    terms: existing?.authorization?.terms === true,
    destroy: existing?.authorization?.destroy === true,
  };
  if (ctx.hasUI) {
    if (!authorization.apply) {
      const confirmed = await ctx.ui.confirm(
        'Apply immutable Azure CE plan',
        `${plan.planId}
${plan.planSha256}
${plan.actions.length - completed.size} action(s) remain.`,
      );
      if (!confirmed) throw new Error('Apply was not approved');
      authorization.apply = true;
    }
    if (plan.intent.operation === 'teardown' && !authorization.destroy) {
      const destroy = await ctx.ui.confirm(
        'Tear down Customer Edge',
        `Drain routing, restore approved brownfield state, and delete only resources owned by ${plan.deploymentName}?`,
      );
      if (!destroy) throw new Error('Teardown was not approved');
      authorization.destroy = true;
    }
  }
  if (!ctx.hasUI) {
    authorization.apply ||= process.env.XCSH_CE_HEADLESS_MUTATIONS === '1';
    authorization.destroy ||= process.env.XCSH_CE_ALLOW_DESTROY === '1';
  }
  const checkpoint = {
    authorization,
    engine: plan.engine,
    schemaVersion: AZURE_CE_CHECKPOINT_SCHEMA_VERSION,
    planId: plan.planId,
    planSha256: plan.planSha256,
    completedActionIds: [...completed],
    observationFingerprint: existing?.observationFingerprint ?? currentFingerprint,
    observationSnapshot: structuredClone(current),
    pendingAction: existing?.schemaVersion === AZURE_CE_CHECKPOINT_SCHEMA_VERSION ? existing.pendingAction : undefined,
    networkUpdate,
    state: 'running',
  };
  await saveCheckpoint(ctx.sessionManager, plan, checkpoint);
  const platform = relayRecoveryPlatform ?? (await platformFactory());
  const storage = await platform.storage({
    deploymentId: plan.deploymentName,
    engine: 'native',
    provider: 'azure',
    account: plan.subscription.id,
    region: plan.region,
  });
  if (plan.intent.operation !== 'teardown') await assertAzureNativeActive(storage);
  const runtime = await platform.runtime('native', plan.intent.platformContext);
  if (
    plan.relayProfile?.schemaVersion === 2 &&
    plan.relayProfile.retainedDeploymentPlan.relayProfile?.schemaVersion === 2
  ) {
    const predecessor = plan.relayProfile.retainedDeploymentPlan;
    const admission = await storage.read(`native-admission-${predecessor.planSha256}.json`);
    validateAzureNativeAdmissionCheckpoint(predecessor, admission);
    if (admission.replacement?.status !== 'registered')
      throw Error('Azure relay replacement predecessor registration history is unavailable');
    const history = new Map();
    for (const name of azureRelayHistoricalArtifacts)
      history.set(name, await storage.read(`${predecessor.planId}-replacement-${name}`));
    requireAzureRelayHistoricalAcceptance(predecessor, admission.replacement.siteUid, history);
  }
  const ingressContract =
    plan.intent.ingress?.mode === 'platform-http'
      ? await (dependencies.ingressContract?.() ?? VerifiedIngressContract.release(undefined, signal))
      : undefined;
  await persistAzureNativeSource(plan, storage);
  const native = await prepareAzureNativeAdmission(plan, runtime, storage, signal);
  if (recoveredNativeLaunchNode) await recordAzureNativeLaunch(plan, recoveredNativeLaunchNode, native, storage);
  if (plan.intent.operation === 'replace-node') {
    await prepareAzureNativeReplacement(plan, native, api, runtime, storage, signal, qualifiedNetworkReplacement);
    if (!plan.relayProfile && !plan.networkReplacementProfile)
      await requireAzureNativePriorGenerationExecution(native, storage, (source) =>
        loadCheckpoint(ctx.sessionManager, source),
      );
  }
  for (const action of plan.actions) {
    if (completed.has(action.id)) continue;
    await verifyNetworkReplacement(checkpoint);
    const preActionFingerprint = checkpoint.observationFingerprint;
    const preActionSnapshot = checkpoint.observationSnapshot;
    let durableActionPending = checkpoint.pendingAction;
    try {
      let postMutationObservation;
      if (networkUpdate && action.mutates) {
        if (!networkUpdate.source) throw Error('Azure network update source binding is missing');
        await verifyAzureNativeNetworkUpdateSite(plan, networkUpdate.source, runtime, signal);
        networkUpdate.current = await captureAzureNetworkUpdateInventory(plan, api, signal);
        validateAzureNativeNetworkUpdateCheckpoint(
          plan,
          networkUpdate,
          [...completed],
          checkpoint.pendingAction?.actionId,
        );
      }
      await assertActionOwnership(plan, action, api, signal);
      if (action.kind === 'relay-provision') {
        if (checkpoint.pendingAction) {
          validateAzureNativePendingAction(plan, checkpoint.completedActionIds, checkpoint.pendingAction);
        } else {
          checkpoint.pendingAction = buildAzureNativePendingAction(plan, action);
          await saveCheckpoint(ctx.sessionManager, plan, checkpoint);
        }
        const evidence = await executeAzureRelayProvisionAction(plan, action, storage, api, signal);
        await persistAzureNativeActionEvidence(plan, action, evidence, storage);
      }
      if (action.kind === 'vm-state-gate') {
        const deadline = Date.now() + 15 * 60000;
        while (true) {
          const evidence = await collectAzureNativeVmState(plan, action, api, signal);
          await persistAzureNativeActionEvidence(plan, action, evidence, storage);
          if (evidence.status === 'healthy') break;
          if (Date.now() >= deadline) throw new Error('Observed Azure VM power state has not converged');
          await new Promise((resolve, reject) => {
            const abort = () => {
              clearTimeout(timer);
              reject(signal?.reason ?? new Error('Azure VM convergence cancelled'));
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
      if (action.kind === 'health-gate') {
        const deadline = Date.now() + 15 * 60000;
        let evidence;
        while (true) {
          evidence = await collectAzureNativeAdmissionHealth(
            plan,
            ['replace-node', 'update-network'].includes(plan.intent.operation)
              ? plan.topology.nodeCount
              : (action.node ?? plan.topology.nodeCount),
            api,
            runtime,
            storage,
            signal,
            native,
          );
          await persistAzureNativeActionEvidence(
            plan,
            action,
            { ...evidence, planId: plan.planId, planSha256: plan.planSha256 },
            storage,
          );
          if (evidence.status === 'healthy') break;
          if (Date.now() >= deadline)
            throw new Error(
              evidence.status === 'unknown'
                ? 'Collected Azure platform health evidence is unavailable'
                : 'Observed Azure platform health has not converged',
            );
          await new Promise((resolve, reject) => {
            const abort = () => {
              clearTimeout(timer);
              reject(signal?.reason ?? new Error('Azure health convergence cancelled'));
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
      if (action.kind === 'bgp-gate') {
        const admission = await collectAzureNativeAdmissionHealth(
          plan,
          plan.topology.nodeCount,
          api,
          runtime,
          storage,
          signal,
          native,
        );
        if (!('configuration' in admission) || admission.configuration.status !== 'configured')
          throw new Error('Authoritative Azure registered interface configuration is unavailable');
        const expectedInterfaces = admission.configuration.interfaces.map(({ node, role, mac }) => ({
          node,
          role,
          mac,
        }));
        const deadline = Date.now() + 15 * 60000;
        while (true) {
          const evidence = plan.relayProfile
            ? await configureAzureSelectedRelayRouting(plan, expectedInterfaces, runtime, storage, api, signal)
            : await configureAzureRouteServerRouting(
                plan,
                expectedInterfaces,
                runtime,
                storage,
                api,
                signal,
                native.replacement?.routeServer,
              );
          await persistAzureNativeActionEvidence(plan, action, evidence, storage);
          if (
            'observation' in evidence &&
            (evidence.observation.ceRouteScope === 'unqualified' || evidence.observation.freshness === 'unqualified')
          )
            throw Error(
              'Azure relay evidence was collected; CE route scope and publication freshness remain unqualified',
            );
          if (evidence.status === 'healthy') break;
          if (Date.now() >= deadline) throw new Error('Azure Route Server BGP and learned routes have not converged');
          await new Promise((resolve, reject) => {
            const abort = () => {
              clearTimeout(timer);
              reject(signal?.reason ?? new Error('Azure Route Server convergence cancelled'));
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
      if (action.kind === 'f5-ingress-configure') {
        if (!ingressContract) throw new Error('Verified ingress contract is unavailable');
        const evidence = await (dependencies.ensureIngress ?? ensureAzurePlatformIngress)(
          plan,
          runtime,
          storage,
          ingressContract,
          api,
          signal,
        );
        if (evidence?.listener !== 'configured') throw new Error('Observed Azure platform ingress has not converged');
        await persistAzureNativeActionEvidence(plan, action, evidence, storage);
      }
      if (action.kind === 'traffic-gate') {
        if (!ingressContract) throw new Error('Verified ingress contract is unavailable');
        const ingress = await (dependencies.ensureIngress ?? ensureAzurePlatformIngress)(
          plan,
          runtime,
          storage,
          ingressContract,
          api,
          signal,
        );
        if (ingress?.listener !== 'configured') throw new Error('Observed Azure platform ingress has not converged');
        const evidence = await (dependencies.collectTraffic ?? collectAzureTrafficProbe)(
          plan,
          storage,
          api,
          signal,
          `${plan.planId}-${action.id}-traffic-probe`,
        );
        await persistAzureNativeActionEvidence(plan, action, evidence, storage);
        if (evidence.status !== 'healthy') throw new Error('Observed end-to-end Azure traffic has not converged');
      }
      if (action.command && action.args) {
        const replacements = await resolveAzureCeActionReferences(
          action.args,
          api,
          plan,
          action.expectedOwnerPlanSha256,
          networkUpdate,
          signal,
        );
        const execute = (bootstrapFile) =>
          api.exec(
            action.command,
            resolveActionArgs(action.args ?? [], plan.planSha256, {
              ...replacements,
              ...(bootstrapFile ? { __BOOTSTRAP_FILE__: bootstrapFile } : {}),
            }),
          );
        const bootstrap = action.requiresBootstrap
          ? await azureNativeBootstrapForAction(plan, action, native, runtime, storage, signal)
          : undefined;
        if (action.mutates && action.kind !== 'resource-delete') {
          const pending = buildAzureNativePendingAction(plan, action);
          if (checkpoint.pendingAction) {
            validateAzureNativePendingAction(plan, checkpoint.completedActionIds, checkpoint.pendingAction);
          } else {
            checkpoint.pendingAction = pending;
            await saveCheckpoint(ctx.sessionManager, plan, checkpoint);
          }
        }
        const result = bootstrap ? await withAzureNativeBootstrapFile(bootstrap, execute) : await execute();
        if (result.exitCode !== 0)
          throw new Error(`Azure action ${action.id} failed with exit code ${result.exitCode}`);
        if (checkpoint.pendingAction) {
          const deadline = Date.now() + 15 * 60000;
          const resolvedAction = {
            ...action,
            args: resolveActionArgs(action.args, plan.planSha256, replacements),
          };
          while (!(await azureNativePendingActionConverged(plan, resolvedAction, api, signal))) {
            if (Date.now() >= deadline) throw new Error('Azure native mutation postcondition has not converged');
            await new Promise((resolve, reject) => {
              const abort = () => {
                clearTimeout(timer);
                reject(signal?.reason ?? new Error('Azure native mutation convergence cancelled'));
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
        if (action.kind === 'resource-delete' && action.resourceId) {
          const deadline = Date.now() + 15 * 60000;
          while (true) {
            postMutationObservation = await observe();
            const resource = postMutationObservation.resources.find(
              (candidate) => candidate.id.toLowerCase() === action.resourceId?.toLowerCase(),
            );
            if (!resource?.exists) break;
            if (Date.now() >= deadline) throw new Error('Azure resource deletion has not converged');
            await new Promise((resolve, reject) => {
              const abort = () => {
                clearTimeout(timer);
                reject(signal?.reason ?? new Error('Azure deletion convergence cancelled'));
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
        if (action.kind === 'vm-create' && action.node)
          await recordAzureNativeLaunch(plan, action.node, native, storage);
      }
      if (networkUpdate && action.mutates) {
        const observed = await captureAzureNetworkUpdateInventory(plan, api, signal);
        verifyAzureNetworkUpdateProgress(
          plan,
          networkUpdate.before,
          observed,
          azureNetworkUpdateAppliedNics(plan, [...completed, action.id], observed),
        );
        networkUpdate.current = observed;
        checkpoint.networkUpdate = networkUpdate;
      }
      completed.add(action.id);
      checkpoint.completedActionIds = [...completed];
      checkpoint.failedActionId = undefined;
      durableActionPending = checkpoint.pendingAction;
      checkpoint.pendingAction = undefined;
      checkpoint.state = completed.size === plan.actions.length ? 'complete' : 'running';
      const changesFingerprint = action.mutates;
      if (changesFingerprint) {
        const checkpointObservation = postMutationObservation ?? (await observe());
        checkpoint.observationFingerprint = fingerprintCheckpointObservation(checkpointObservation);
        checkpoint.observationSnapshot = structuredClone(checkpointObservation);
      }
      await saveCheckpoint(ctx.sessionManager, plan, checkpoint);
      if (networkUpdate && checkpoint.state !== 'complete')
        await persistAzureNativeNetworkCheckpointHistory(plan, checkpoint, storage);
    } catch (error) {
      completed.delete(action.id);
      checkpoint.completedActionIds = [...completed];
      checkpoint.observationFingerprint = preActionFingerprint;
      checkpoint.observationSnapshot = preActionSnapshot;
      checkpoint.pendingAction = durableActionPending ?? checkpoint.pendingAction;
      checkpoint.state = 'partial';
      checkpoint.failedActionId = action.id;
      await saveCheckpoint(ctx.sessionManager, plan, checkpoint);
      if (networkUpdate) await persistAzureNativeNetworkCheckpointHistory(plan, checkpoint, storage);
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}. Resume with the same plan ID and SHA-256; ${completed.size}/${plan.actions.length} actions are checkpointed.`,
      );
    }
  }
  return finalize(checkpoint);
}
function createAzureCeApplyTool2(pi, makeApi = makeExecApi, terraformDependencies = terraformDefaults) {
  const { Type } = pi.typebox;
  return {
    name: 'azure_ce_apply',
    label: 'Apply Azure Customer Edge Plan',
    description:
      'Apply or resume only an exact persisted Azure CE plan ID and SHA-256 after stale-state, ownership, image, networking, quota, terms, and security-gate revalidation.',
    parameters: Type.Object({ planId: Type.String(), planSha256: Type.String() }),
    async execute(_id, params, signal, _update, ctx) {
      const originalPlanId = params?.planId;
      try {
        const request = captureAzureCeApplyRequest(params, ctx),
          serviceCallbacks = captureAzureCeApplyCallbacks(terraformDependencies, ['platform', 'terraform']),
          bus = pi.events,
          busCallbacks = bus && typeof bus === 'object' ? captureAzureCeApplyCallbacks(bus, ['emit']) : undefined;
        const seal = () => {
          signal?.throwIfAborted();
          request.assertUnchanged();
          serviceCallbacks();
          if (pi.events !== bus) throw Error('Azure CE apply event bus changed during execution');
          busCallbacks?.();
        };
        seal();
        const envelope = await loadPlanArtifact(
          request.context.sessionManager,
          request.input.planId,
          request.input.planSha256,
        );
        seal();
        request.bindPlatformContext(envelope.plan.intent.platformContext);
        if (envelope.plan.engine === 'terraform') {
          const platform = await terraformDependencies.platform(pi, signal);
          seal();
          const platformCallbacks = captureAzureCeApplyCallbacks(platform, [
            'storage',
            'runtime',
            'providerEnvironment',
            'siteBinding',
            'capabilities',
          ]);
          const terraform = await terraformDependencies.terraform(pi, signal);
          seal();
          platformCallbacks();
          const terraformCallbacks = captureAzureCeApplyCallbacks(terraform, ['open']);
          const api = withAzureCeExecution(makeApi(request.context.cwd), signal);
          seal();
          platformCallbacks();
          const guarded = guardAzureCeApplyServices(seal, api, platform, terraform);
          if (!guarded.terraform) throw Error('Azure CE Terraform service was not acquired');
          const result = await executeAzureCeTerraformApply(
            request.input,
            request.context,
            guarded.api,
            guarded.platform,
            guarded.terraform,
            signal,
          );
          seal();
          platformCallbacks();
          terraformCallbacks();
          const returned = result;
          if (
            returned.engine !== 'terraform' ||
            returned.planId !== request.input.planId ||
            returned.planSha256 !== request.input.planSha256
          )
            throw Error('Azure CE Terraform result differs from the original persisted plan identity');
          return {
            content: [
              {
                type: 'text',
                text: `Azure CE Terraform plan ${request.input.planId}: ${result.status}. Routing and traffic remain separate collected evidence.`,
              },
            ],
            details: { tool: 'azure_ce_apply', ...result, engine: 'terraform', ...request.input },
          };
        }
        const api = withAzureCeExecution(makeApi(request.context.cwd), signal);
        seal();
        const { plan, checkpoint } = await executeAzureCeNativeApply2(
          request.input,
          request.context,
          api,
          async () => {
            seal();
            const platform = await terraformDependencies.platform(pi, signal);
            seal();
            return guardAzureCeApplyServices(seal, api, platform).platform;
          },
          signal,
        );
        seal();
        if (
          plan.engine !== 'native' ||
          plan.planId !== request.input.planId ||
          plan.planSha256 !== request.input.planSha256 ||
          checkpoint.planId !== request.input.planId ||
          checkpoint.planSha256 !== request.input.planSha256
        )
          throw Error('Azure CE native result differs from the original persisted plan identity');
        return {
          content: [
            {
              type: 'text',
              text: `Azure CE plan ${plan.planId} applied successfully. ${checkpoint.completedActionIds.length} ordered actions are checkpointed and verified.`,
            },
          ],
          details: { tool: 'azure_ce_apply', planId: plan.planId, checkpoint },
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Azure CE apply stopped safely: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'azure_ce_apply', planId: originalPlanId },
        };
      }
    },
  };
}

export {
  AzureTerraformOutcomeAbsent,
  azureTerraformNetworkPowerDeployment,
  azureTerraformNetworkPowerSelections,
  azureTerraformNetworkReplacementCompletionName,
  azureTerraformNetworkRetiredPowerDeployment,
  beginAzureTerraformRetirement,
  bindAwsCloudInit,
  collectAzureReplacementOperationalIdentity,
  createAzureCeApplyTool2,
  createAzureOperationalAcquisitionCustody,
  createAzureOperationalAcquisitionSession,
  createAzureReplacementReadingsAcquisitionSession,
  executeAzureCeNativeApply2,
  isAzureTerraformReplacementHistoricalArtifact,
  loadAzureTerraformOutcome,
  observeAzureTerraformNetworkPower,
  openAzureTerraformNetworkReplacementCompletionArtifacts,
  parseNodeHealthJson,
  persistAzureNativeSource,
  readAzureTerraformNetworkCompletedPowerRetirement,
  readAzureTerraformNetworkCompletionOne,
  readAzureTerraformNetworkRetirementGraph,
  readAzureTerraformOriginalReceiptInventory,
  readAzureTerraformParentPrivateFile,
  readAzureTerraformReplacementRefreshInventory,
  recheckAzureTerraformNetworkRetirementGraph,
  runAzureTerraformNetworkGenerationHistory,
  VerifiedIngressContract,
  validateAzureIngressSource,
  validateAzureTerraformNetworkPowerPlan,
  validateAzureTerraformNetworkPowerProjection,
  validateAzureTerraformNetworkReplacementCompletion,
  verifyAzureTerraformReplacementHistoricalArtifacts,
  withAzureTerraformPowerLifecycle,
};
