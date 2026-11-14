import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { AzExecApi } from '../az/exec';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import type { AzureNativeTeardownPlan } from './native-teardown';
import { azureRelayPlanForDeployment } from './relay-deployment-plan';
import { compileAzureRelayNativeRequests } from './relay-native';
import { azureRelaySshPublicKey } from './relay-ssh-key';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const markerName = 'azure-native-relay-key-retirement.json';
const journalName = 'relay-native-execution.json';
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Malformed Azure relay retirement evidence');
  return value as Record<string, unknown>;
};
const optional = async (store: Pick<CeDeploymentStore, 'read'>, name: string) => {
  try {
    return await store.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
};

/** A durable barrier precedes key deletion, including interrupted deletion. */
export async function assertAzureNativeActive(store: Pick<CeDeploymentStore, 'verify' | 'read'>) {
  await store.verify();
  if (
    (await optional(store, markerName)) !== undefined ||
    (await optional(store, 'azure-native-lifecycle-retirement.json')) !== undefined ||
    (await optional(store, 'azure-native-bootstrap-retirement.json')) !== undefined
  )
    throw Error(
      'Azure native deployment is retiring or retired; execution cannot recreate enrollment, keys or resources',
    );
}

/** Relay callers retain the same lifecycle barrier. */
export const assertAzureNativeRelayActive = assertAzureNativeActive;

/** Group absence plus an unfiltered subscription inventory; no tag filtering can hide residual ownership. */
export async function observeAzureRelayRetirementAbsence(source: AzureCePlan, api: AzExecApi, signal?: AbortSignal) {
  const relay = azureRelayPlanForDeployment(source);
  return { ...(await observeAzureCeRetirementAbsence(source, api, signal)), relayPlanSha256: relay.planSha256 };
}

/** Complete subscription inventory for every CE profile. */
export async function observeAzureCeRetirementAbsence(source: AzureCePlan, api: AzExecApi, signal?: AbortSignal) {
  verifyAzureCePlan(source);
  const deadline = AbortSignal.any([AbortSignal.timeout(30_000), ...(signal ? [signal] : [])]);
  const reads: Array<{ args: string[]; responseSha256: string }> = [];
  const read = async (args: string[]) => {
    deadline.throwIfAborted();
    const selected = [...args, '--subscription', source.subscription.id, '--output', 'json'];
    const aborted = Promise.withResolvers<never>();
    const abort = () => aborted.reject(deadline.reason);
    deadline.addEventListener('abort', abort, { once: true });
    try {
      const result = await Promise.race([api.exec('az', selected, { signal: deadline }), aborted.promise]);
      deadline.throwIfAborted();
      if (result.exitCode !== 0) throw Error('Azure CE retirement cloud evidence is unavailable');
      let value: unknown;
      try {
        value = JSON.parse(result.stdout);
      } catch {
        throw Error('Malformed Azure CE retirement cloud evidence');
      }
      reads.push({ args: selected, responseSha256: canonicalSha256(value) });
      return value;
    } finally {
      deadline.removeEventListener('abort', abort);
    }
  };
  const account = object(await read(['account', 'show']));
  if (
    String(account.id).toLowerCase() !== source.subscription.id.toLowerCase() ||
    String(account.tenantId).toLowerCase() !== source.subscription.tenantId.toLowerCase() ||
    account.environmentName !== source.subscription.cloud ||
    account.state !== 'Enabled'
  )
    throw Error('Azure CE retirement account identity differs');
  if ((await read(['group', 'exists', '--name', source.intent.resourceGroup])) !== false)
    throw Error('Azure CE retirement resource group absence is unverified');
  const inventory = await read(['resource', 'list']);
  if (!Array.isArray(inventory)) throw Error('Complete unfiltered Azure CE retirement inventory is unavailable');
  const ids = new Set<string>();
  const planned = new Set(
    source.ownershipInventory.filter((row) => row.action === 'create').map((row) => row.resourceId.toLowerCase()),
  );
  for (const row of inventory) {
    const resource = object(row);
    const id = typeof resource.id === 'string' ? resource.id.toLowerCase() : '';
    if (
      !id.startsWith(`/subscriptions/${source.subscription.id.toLowerCase()}/`) ||
      ids.has(id) ||
      ['error', 'errors', 'nextLink', 'nextPageToken'].some((key) => resource[key])
    )
      throw Error('Malformed, foreign or duplicate Azure CE retirement inventory');
    ids.add(id);
    const tags = resource.tags === undefined || resource.tags === null ? {} : object(resource.tags);
    if (Object.values(tags).some((value) => typeof value !== 'string'))
      throw Error('Malformed Azure CE retirement ownership tags');
    if (
      planned.has(id) ||
      id.startsWith(
        `/subscriptions/${source.subscription.id}/resourceGroups/${source.intent.resourceGroup}/`.toLowerCase(),
      ) ||
      tags['xcsh-deployment-id'] === source.deploymentName
    )
      throw Error('Azure CE retirement inventory retains exact resources or deployment ownership');
  }
  deadline.throwIfAborted();
  return {
    status: 'absent' as const,
    engine: source.engine,
    sourcePlanSha256: source.planSha256,
    resourceIds: [...planned].sort(),
    inventoryCount: inventory.length,
    reads,
    observedAt: new Date().toISOString(),
  };
}

/** Retire only the native relay SSH journal after independently collected cloud and platform absence. */
async function runAzureNativeRelayKeyRetirement(
  source: AzureCePlan,
  teardown: AzureNativeTeardownPlan,
  runtime: Pick<CeRuntime, 'engine' | 'contract' | 'unregisteredAbsence'>,
  contract: VerifiedIngressContract,
  store: CeDeploymentStore,
  api: AzExecApi,
  signal?: AbortSignal,
) {
  signal = AbortSignal.any([AbortSignal.timeout(30_000), ...(signal ? [signal] : [])]);
  signal.throwIfAborted();
  const relay = azureRelayPlanForDeployment(source);
  const binding = azureUpgradeBinding(source);
  await store.verify();
  if (
    source.engine !== 'native' ||
    runtime.engine !== 'native' ||
    teardown.sourcePlanSha256 !== source.planSha256 ||
    canonicalSha256(store.owner) !== canonicalSha256(binding.owner) ||
    teardown.drain.siteContractFingerprint !== runtime.contract.fingerprint ||
    teardown.drain.ingressContractFingerprint !== contract.fingerprint ||
    canonicalSha256(await store.read(`${teardown.planId}.json`)) !== canonicalSha256(teardown)
  )
    throw Error('Azure native relay key retirement owner, teardown or contract differs');
  const { planId, planSha256, ...teardownDraft } = teardown;
  if (canonicalSha256(teardownDraft) !== planSha256 || planId !== `azure-ce-teardown-${planSha256.slice(0, 24)}`)
    throw Error('Azure native relay teardown integrity differs');
  const receipt = object(await store.read('azure-native-teardown-receipt.json'));
  if (
    receipt.status !== 'retired' ||
    receipt.sourcePlanSha256 !== source.planSha256 ||
    receipt.teardownPlanSha256 !== teardown.planSha256 ||
    receipt.cloudPlanSha256 !== teardown.cloudPlanSha256 ||
    receipt.cloud !== 'absent' ||
    receipt.sites !== 'deleted'
  )
    throw Error('Azure native relay key retirement lacks the exact completed teardown receipt');
  const fresh = () => observeAzureNativeRelayRetirementAbsence(source, teardown, runtime, contract, api, signal);
  const absenceSha256 = await fresh();
  let marker = await optional(store, markerName);
  const journal = await optional(store, journalName);
  if (journal !== undefined) {
    const value = object(journal);
    if (
      Object.keys(value).sort().join(',') !==
        [
          'schemaVersion',
          'engine',
          'sourcePlanSha256',
          'relayPlanSha256',
          'privateKey',
          'publicKey',
          'requestsSha256',
          'completed',
          ...(value.pending !== undefined ? ['pending'] : []),
        ]
          .sort()
          .join(',') ||
      value.schemaVersion !== 1 ||
      value.engine !== 'native' ||
      value.sourcePlanSha256 !== source.planSha256 ||
      value.relayPlanSha256 !== relay.planSha256 ||
      typeof value.privateKey !== 'string' ||
      typeof value.publicKey !== 'string' ||
      !/^[a-f0-9]{64}$/.test(String(value.requestsSha256))
    )
      throw Error('Azure relay key journal belongs to a different source or owner');
    if (azureRelaySshPublicKey(String(value.privateKey)) !== value.publicKey)
      throw Error('Azure relay key journal private/public identity differs');
    const requests = compileAzureRelayNativeRequests(source, relay, String(value.publicKey));
    if (
      canonicalSha256(requests) !== value.requestsSha256 ||
      !Array.isArray(value.completed) ||
      value.completed.length > requests.length ||
      value.completed.some((id, index) => id !== requests[index].resourceId)
    )
      throw Error('Azure relay key journal request binding differs');
    if (value.pending !== undefined) {
      const pending = object(value.pending);
      const next = requests[value.completed.length];
      if (
        !next ||
        Object.keys(pending).sort().join(',') !== 'requestSha256,resourceId,submitted' ||
        pending.submitted !== true ||
        pending.resourceId !== next.resourceId ||
        pending.requestSha256 !== canonicalSha256(next)
      )
        throw Error('Azure relay key journal submitted request differs');
    }
  }
  if (marker === undefined) {
    const draft = {
      schemaVersion: 1,
      engine: 'native',
      owner: binding.owner,
      sourcePlanSha256: source.planSha256,
      relayPlanSha256: relay.planSha256,
      teardownPlanSha256: teardown.planSha256,
      journalSha256: journal === undefined ? null : canonicalSha256(journal),
      absenceSha256,
    };
    marker = { ...draft, checkpointSha256: canonicalSha256(draft), phase: 'retiring' };
    signal.throwIfAborted();
    await store.write(markerName, marker);
  }
  const value = object(marker);
  const { phase, checkpointSha256, ...draft } = value;
  if (
    Object.keys(value).sort().join(',') !==
      'absenceSha256,checkpointSha256,engine,journalSha256,owner,phase,relayPlanSha256,schemaVersion,sourcePlanSha256,teardownPlanSha256' ||
    value.schemaVersion !== 1 ||
    value.engine !== 'native' ||
    value.sourcePlanSha256 !== source.planSha256 ||
    value.relayPlanSha256 !== relay.planSha256 ||
    value.teardownPlanSha256 !== teardown.planSha256 ||
    canonicalSha256(value.owner) !== canonicalSha256(binding.owner) ||
    checkpointSha256 !== canonicalSha256(draft) ||
    !['retiring', 'retired'].includes(String(phase)) ||
    !/^[a-f0-9]{64}$/.test(String(value.absenceSha256)) ||
    (value.journalSha256 !== null && !/^[a-f0-9]{64}$/.test(String(value.journalSha256))) ||
    (journal !== undefined && canonicalSha256(journal) !== value.journalSha256) ||
    (phase === 'retired' && journal !== undefined)
  )
    throw Error('Azure native relay key retirement marker or journal changed');
  if (phase === 'retiring') {
    await fresh();
    signal.throwIfAborted();
    if (journal !== undefined) await store.remove(journalName);
    if ((await optional(store, journalName)) !== undefined)
      throw Error('Azure native relay key retirement is incomplete');
    signal.throwIfAborted();
    await store.write(markerName, { ...value, phase: 'retired' });
  }
  await fresh();
  return {
    status: 'relay-key-retired' as const,
    sourcePlanSha256: source.planSha256,
    relayPlanSha256: relay.planSha256,
    teardownPlanSha256: teardown.planSha256,
    checkpointSha256,
    completeCleanup: false as const,
  };
}

export async function retireAzureNativeRelayKey(
  source: AzureCePlan,
  teardown: AzureNativeTeardownPlan,
  runtime: Pick<CeRuntime, 'engine' | 'contract' | 'unregisteredAbsence'>,
  contract: VerifiedIngressContract,
  store: CeDeploymentStore,
  api: AzExecApi,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  await store.verify();
  const release = await acquireProcessLock(join(store.directory, '.azure-relay-native-mutation-lock'));
  try {
    return await runAzureNativeRelayKeyRetirement(source, teardown, runtime, contract, store, api, signal);
  } finally {
    await release();
  }
}

/** Current independent absence, shared by terminal native key and bootstrap retirement. */
export async function observeAzureNativeRelayRetirementAbsence(
  source: AzureCePlan,
  teardown: AzureNativeTeardownPlan,
  runtime: Pick<CeRuntime, 'engine' | 'contract' | 'unregisteredAbsence'>,
  contract: VerifiedIngressContract,
  api: AzExecApi,
  signal: AbortSignal,
) {
  azureRelayPlanForDeployment(source);
  return observeAzureNativeRetirementAbsence(source, teardown, runtime, contract, api, signal);
}

export async function observeAzureNativeRetirementAbsence(
  source: AzureCePlan,
  teardown: AzureNativeTeardownPlan,
  runtime: Pick<CeRuntime, 'engine' | 'contract' | 'unregisteredAbsence'>,
  contract: VerifiedIngressContract,
  api: AzExecApi,
  signal: AbortSignal,
) {
  const binding = azureUpgradeBinding(source);
  if (
    source.engine !== 'native' ||
    runtime.engine !== 'native' ||
    teardown.sourcePlanSha256 !== source.planSha256 ||
    teardown.drain.siteContractFingerprint !== runtime.contract.fingerprint ||
    teardown.drain.ingressContractFingerprint !== contract.fingerprint
  )
    throw Error('Azure native absence context differs');
  const namespaces = [
    ...new Set([
      'default',
      ...teardown.drain.listeners.map((row) => row.namespace),
      ...teardown.drain.origins.map((row) => row.origin.namespace),
    ]),
  ].sort();
  if (namespaces.some((namespace) => !/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(namespace)))
    throw Error('Azure native relay retirement namespace differs');
  const collect = async () => {
    signal?.throwIfAborted();
    const started = Date.now();
    const aborted = Promise.withResolvers<never>();
    const abort = () => aborted.reject(signal?.reason);
    signal?.addEventListener('abort', abort, { once: true });
    let platform: Awaited<ReturnType<CeRuntime['unregisteredAbsence']>>;
    try {
      signal?.throwIfAborted();
      platform = await Promise.race([
        runtime.unregisteredAbsence([binding], namespaces, contract, signal),
        aborted.promise,
      ]);
      signal?.throwIfAborted();
    } finally {
      signal?.removeEventListener('abort', abort);
    }
    const at = Date.parse(platform.observedAt),
      began = Date.parse(platform.startedAt);
    if (
      platform.status !== 'absent' ||
      canonicalSha256(platform.owner) !== canonicalSha256(binding.owner) ||
      platform.siteContractFingerprint !== runtime.contract.fingerprint ||
      platform.ingressContractFingerprint !== contract.fingerprint ||
      !Number.isFinite(at) ||
      !Number.isFinite(began) ||
      began < started ||
      at < began ||
      at > Date.now() ||
      Date.now() - at > 60_000 ||
      !Array.isArray(platform.sources) ||
      !platform.sources.length
    )
      throw Error('Fresh complete Azure native platform absence is unavailable');
    const cloud = source.relayProfile
      ? await observeAzureRelayRetirementAbsence(source, api, signal)
      : await observeAzureCeRetirementAbsence(source, api, signal);
    return canonicalSha256({ platform, cloud });
  };
  return collect();
}
