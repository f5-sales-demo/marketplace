import { generateKeyPairSync } from 'node:crypto';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { AzExecApi } from '../az/exec';
import { canonicalSha256 } from './canonical';
import { resolveAzureRelayCatalog } from './relay-catalog';
import { azureRelayPlanForDeployment } from './relay-deployment-plan';
import { type AzureRelayNativeRequest, compileAzureRelayNativeRequests } from './relay-native';
import { type AzureRelayPlan, azureRelayOwnershipTags, verifyAzureRelayPlan } from './relay-plan';
import { assertAzureNativeRelayActive } from './relay-retirement';
import { azureRelaySshPublicKey as publicKey } from './relay-ssh-key';
import type { AzureCeAction, AzureCePlan } from './types';

type Json = Record<string, unknown>;
interface Journal {
  schemaVersion: 1;
  engine: 'native';
  sourcePlanSha256: string;
  relayPlanSha256: string;
  privateKey: string;
  publicKey: string;
  requestsSha256: string;
  completed: string[];
  pending?: { resourceId: string; requestSha256: string; submitted: true };
}
const name = 'relay-native-execution.json';
const require = (condition: unknown, message: string): void => {
  if (!condition) throw Error(`Azure relay native execution: ${message}`);
};
const object = (value: unknown): Json => {
  require(value && typeof value === 'object' && !Array.isArray(value), 'malformed resource or checkpoint');
  return value as Json;
};
const sameId = (value: unknown, expected: string) =>
  typeof value === 'string' && value.toLowerCase() === expected.toLowerCase();
/** Match writable request fields, allowing ARM generated fields. customData is write-only on VM GET. */
function match(actual: unknown, expected: unknown, path = ''): void {
  if (path === 'properties.osProfile.customData' && actual === undefined) return;
  if (Array.isArray(expected)) {
    require(Array.isArray(actual) && actual.length === expected.length, `resource graph differs at ${path}`);
    expected.forEach((value, index) => {
      match((actual as unknown[])[index], value, `${path}.${index}`);
    });
  } else if (expected && typeof expected === 'object') {
    const value = object(actual);
    for (const [key, item] of Object.entries(expected)) match(value[key], item, path ? `${path}.${key}` : key);
  } else {
    require(path.endsWith('.id') && typeof expected === 'string'
      ? sameId(actual, expected)
      : actual === expected, `resource graph differs at ${path}`);
  }
}

/** Durable native ARM provisioning only. Guest software, sessions, traffic and CE freshness remain separately gated. */
async function runAzureRelayNativeResources(
  source: AzureCePlan,
  plan: AzureRelayPlan,
  storage: Pick<CeDeploymentStore, 'owner' | 'verify' | 'read' | 'write'>,
  api: AzExecApi,
  signal?: AbortSignal,
  inspectOnly = false,
) {
  source = structuredClone(source);
  plan = structuredClone(plan);
  verifyAzureRelayPlan(source, plan);
  require(plan.engine === 'native', 'native engine required');
  signal?.throwIfAborted();
  await storage.verify();
  await assertAzureNativeRelayActive(storage);
  require(storage.owner.provider === 'azure' &&
    storage.owner.engine === 'native' &&
    storage.owner.account === source.subscription.id &&
    storage.owner.region === source.region &&
    storage.owner.deploymentId === source.deploymentName, 'storage owner differs from saved plan');
  const deadline = AbortSignal.any([AbortSignal.timeout(30000), ...(signal ? [signal] : [])]);
  const exec = async (args: string[]) => {
    deadline.throwIfAborted();
    const abort = Promise.withResolvers<never>();
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
  const read = async (id: string, version: string): Promise<Json | undefined> => {
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
      // Only an exact ARM not-found code is absence; permission/service failures never permit creation.
      if (/^(?:ResourceNotFound|\(ResourceNotFound\))(?::|\s|$)/.test(raw.stderr.trim())) return undefined;
      throw Error('Azure relay native execution: cloud read unavailable');
    }
    const value = object(JSON.parse(raw.stdout));
    require(sameId(value.id, id) &&
      !['nextLink', 'nextPageToken', 'error', 'errors'].some(
        (key) => value[key],
      ), 'resource identity incomplete or substituted');
    return value;
  };
  let journal: Journal | undefined;
  try {
    journal = (await storage.read(name)) as Journal;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (journal) {
    require(journal.schemaVersion === 1 &&
      journal.engine === 'native' &&
      journal.sourcePlanSha256 === source.planSha256 &&
      journal.relayPlanSha256 === plan.planSha256 &&
      typeof journal.privateKey === 'string' &&
      typeof journal.publicKey === 'string' &&
      Array.isArray(journal.completed), 'checkpoint owner or shape differs');
    require(Object.keys(journal).sort().join(',') ===
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
        .join(',') && /^[a-f0-9]{64}$/.test(journal.requestsSha256), 'checkpoint request binding or fields differ');
    require(publicKey(journal.privateKey) === journal.publicKey, 'checkpoint SSH key differs');
  } else {
    if (inspectOnly)
      return {
        status: 'inspected' as const,
        complete: false,
        resources: [] as Json[],
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
      publicKey: publicKey(privateKey),
      requestsSha256: '',
      completed: [],
    };
  }
  const requests = compileAzureRelayNativeRequests(source, plan, journal.publicKey);
  const requestsSha256 = canonicalSha256(requests);
  require(!journal.requestsSha256 || journal.requestsSha256 === requestsSha256, 'checkpoint requests differ');
  require(journal.completed.length <= requests.length &&
    journal.completed.every((id, index) => id === requests[index].resourceId), 'checkpoint completion order differs');
  const pending = journal.pending;
  if (pending) {
    const next = requests[journal.completed.length];
    require(Object.keys(pending).sort().join(',') ===
      'requestSha256,resourceId,submitted', 'checkpoint pending fields differ');
    require(next &&
      pending.submitted === true &&
      pending.resourceId === next.resourceId &&
      pending.requestSha256 === canonicalSha256(next), 'checkpoint submission differs');
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
  require(canonicalSha256({ region: catalog.region, image: catalog.image, vmSizes: catalog.vmSizes }) ===
    canonicalSha256(plan.catalog), 'current catalog differs');
  const tags = azureRelayOwnershipTags(source, plan);
  const parents = async () => {
    for (const id of [plan.vnetId, plan.sloSubnetId, plan.routeServerId]) {
      const value = await read(id, '2024-05-01');
      require(value && object(value.properties).provisioningState === 'Succeeded', 'owned foundation unavailable');
      if (id === plan.sloSubnetId) {
        const properties = object(value?.properties);
        const prefixes =
          typeof properties.addressPrefix === 'string' ? [properties.addressPrefix] : properties.addressPrefixes;
        require(Array.isArray(prefixes) &&
          prefixes.length === 1 &&
          prefixes[0] === plan.sloCidr, 'foundation SLO subnet prefix differs');
      }
      // Subnets inherit their VNet owner and do not support ARM tags.
      if (id !== plan.sloSubnetId) {
        require(value?.location === plan.region, 'foundation region differs');
        const observedTags = object(value?.tags);
        for (const [key, expected] of Object.entries(tags))
          if (key !== 'xcsh-relay-plan-sha256') require(observedTags[key] === expected, 'foundation owner differs');
      }
    }
  };
  const verify = (value: Json, request: AzureRelayNativeRequest) => {
    require(object(value.properties).provisioningState === 'Succeeded', 'resource provisioning is incomplete');
    match(value, request.body);
    if (request.kind === 'relay-vm-create') {
      const relay = plan.relays.find((item) => item.vmId === request.resourceId);
      const disk = object(object(object(value.properties).storageProfile).osDisk);
      require(relay && sameId(object(disk.managedDisk).id, relay.osDiskId), 'OS disk identity differs');
    }
  };
  await parents();
  // Preflight the whole target set before submitting anything, including later foreign targets.
  const inspectedResources = new Map<string, Json>();
  for (const request of requests) {
    const value = await read(request.resourceId, request.apiVersion);
    if (value) {
      verify(value, request);
      inspectedResources.set(request.resourceId, value);
    } else require(!journal.completed.includes(request.resourceId), 'completed resource disappeared');
  }
  if (inspectOnly) {
    if (journal.pending)
      require(inspectedResources.has(
        journal.pending.resourceId,
      ), 'submitted outcome is unknown; refusing duplicate submission');
    const authorized = new Set([...journal.completed, ...(journal.pending ? [journal.pending.resourceId] : [])]);
    const resources = requests
      .filter((request) => authorized.has(request.resourceId))
      .map((request) => inspectedResources.get(request.resourceId) as Json);
    // Generated disks are owned through the exact verified VM attachment and managedBy relation.
    for (const request of requests.filter(
      (item) => authorized.has(item.resourceId) && item.kind === 'relay-vm-create',
    )) {
      const relay = plan.relays.find((item) => item.vmId === request.resourceId);
      require(relay, 'generated disk VM binding unavailable');
      const disk = await read((relay as AzureRelayPlan['relays'][number]).osDiskId, '2024-03-02');
      require(disk &&
        sameId(disk.managedBy, request.resourceId) &&
        disk.location === plan.region &&
        object(disk.properties).provisioningState === 'Succeeded', 'generated disk identity or attachment differs');
      if (disk?.tags) {
        const diskTags = object(disk.tags);
        require(Object.entries(diskTags).every(
          ([key, value]) => tags[key as keyof typeof tags] === value,
        ), 'generated disk owner differs');
      }
      resources.push(disk as Json);
    }
    await parents();
    for (const request of requests) {
      const final = await read(request.resourceId, request.apiVersion);
      require(canonicalSha256(final ?? null) ===
        canonicalSha256(
          inspectedResources.get(request.resourceId) ?? null,
        ), 'target changed during read-only recovery inspection');
    }
    for (const disk of resources.filter((resource) => typeof resource.managedBy === 'string')) {
      require(canonicalSha256(await read(String(disk.id), '2024-03-02')) ===
        canonicalSha256(disk), 'generated disk changed during read-only recovery inspection');
    }
    deadline.throwIfAborted();
    return {
      status: 'inspected' as const,
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
        require(value, 'current resource dependency unavailable');
        verify(value as Json, dependency);
      }
    }
    const existing = await read(request.resourceId, request.apiVersion);
    if (existing) verify(existing, request);
    else {
      require(!journal.pending &&
        index >= journal.completed.length, 'submitted outcome is unknown; refusing duplicate submission');
      journal.pending = { resourceId: request.resourceId, requestSha256: canonicalSha256(request), submitted: true };
      await storage.write(name, journal);
      const response = await exec(request.args);
      require(response.exitCode === 0, 'ARM submission failed; outcome requires readback');
      const current = await read(request.resourceId, request.apiVersion);
      require(current, 'ARM acknowledgment has no current resource evidence');
      verify(current as Json, request);
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
    require(value, 'final resource observation unavailable');
    verify(value as Json, request);
  }
  deadline.throwIfAborted();
  return {
    status: 'provisioned' as const,
    sourcePlanSha256: source.planSha256,
    relayPlanSha256: plan.planSha256,
    resourceIds: [...journal.completed],
    observedAt: new Date().toISOString(),
    software: 'unknown' as const,
    routing: 'unknown' as const,
    traffic: 'unknown' as const,
  };
}

/** Read-only journal and current-resource recovery inspection; never creates keys or writes storage/cloud state. */
export async function inspectAzureRelayNativeResources(
  source: AzureCePlan,
  plan: AzureRelayPlan,
  storage: Pick<CeDeploymentStore, 'owner' | 'verify' | 'read'>,
  api: AzExecApi,
  signal?: AbortSignal,
) {
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

export async function ensureAzureRelayNativeResources(
  source: AzureCePlan,
  plan: AzureRelayPlan,
  storage: Pick<CeDeploymentStore, 'owner' | 'verify' | 'read' | 'write'>,
  api: AzExecApi,
  signal?: AbortSignal,
) {
  const directory = (storage as Partial<CeDeploymentStore>).directory;
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

/** Dispatch only the exact relay boundary in the persisted final plan. */
export async function executeAzureRelayProvisionAction(
  source: AzureCePlan,
  action: AzureCeAction,
  storage: Pick<CeDeploymentStore, 'owner' | 'verify' | 'read' | 'write'>,
  api: AzExecApi,
  signal?: AbortSignal,
) {
  const plan = azureRelayPlanForDeployment(source);
  const expected = source.actions.find((item) => item.id === action.id);
  require(action.kind === 'relay-provision' &&
    expected &&
    canonicalSha256(expected) === canonicalSha256(action) &&
    action.resourceId === plan.routeServerId, 'relay action differs from final saved plan');
  return ensureAzureRelayNativeResources(source, plan, storage, api, signal);
}
