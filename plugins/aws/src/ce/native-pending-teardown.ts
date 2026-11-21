import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import {
  type InitialRegistrationRetirement,
  validateInitialRegistrationRetirement,
} from '../../../platform/src/ce/initial-registration-retirement';
import type { CePlatformDrainPlan } from '../../../platform/src/ce/platform-drain';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { CeRuntime, SiteBinding } from '../../../platform/src/ce/runtime';
import { canonicalSha256 } from './canonical';
import { retireAwsNativeBootstrapCredentials } from './native-bootstrap-retirement';
import type { AwsNativeInitialCreationProjection } from './native-creation-projection';
import { withAwsNativeOperation } from './native-operation';
import {
  type AwsNativeObservedInventory,
  assertAwsNativeInventoryFresh,
  assertAwsNativePreRegistrationInventory,
} from './native-reservation-teardown';
import { validateAwsNativeCloudTeardown } from './native-teardown';
import type { AwsCePlan } from './types';

type Inventory = Awaited<ReturnType<CeRuntime['preRegistrationInventory']>>;
export type NativeCreationReader = (signal?: AbortSignal) => Promise<AwsNativeInitialCreationProjection>;
export interface AwsNativePendingTeardownPlan {
  schemaVersion: 1;
  kind: 'aws-ce-native-pending-teardown';
  engine: 'native';
  sourcePlanSha256: string;
  cloudPlanId: string;
  cloudPlanSha256: string;
  creation: AwsNativeInitialCreationProjection;
  pendingInventory: AwsNativeObservedInventory;
  drain: CePlatformDrainPlan;
  retirement: Array<{
    siteName: string;
    siteUid: string;
    physicalSiteUid: string;
    tokens: Array<{ node: string; name: string }>;
  }>;
  registrations: InitialRegistrationRetirement[];
  planId: string;
  planSha256: string;
}
const pointer = 'aws-native-pending-teardown.json';
async function optional(storage: CeDeploymentStore, path: string) {
  try {
    return await storage.read(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
function scope(base: AwsCePlan, cloud: AwsCePlan, creation: AwsNativeInitialCreationProjection) {
  const selected = validateAwsNativeCloudTeardown(base, cloud);
  if (
    base.intent.operation !== 'deploy' ||
    selected.length !== 1 ||
    selected[0].site.nodeIndexes.join(',') !== '1' ||
    selected[0].binding.nodes.length !== 1 ||
    creation.schemaVersion !== 1 ||
    creation.engine !== 'native' ||
    creation.sourcePlanId !== base.planId ||
    creation.sourcePlanSha256 !== base.planSha256 ||
    creation.ownerSha256 !== canonicalSha256(selected[0].binding.owner) ||
    creation.node !== selected[0].binding.nodes[0] ||
    !/^i-[0-9a-f]{8,17}$/.test(creation.instanceId) ||
    creation.imageId !== base.image.id ||
    !base.actions.some((a) => a.kind === 'instance-run' && a.node === 1 && a.id === creation.instanceActionId)
  )
    throw Error('Native pending retirement original single-node creation differs');
  if (
    !cloud.actions.some((a) => a.kind === 'resource-delete' && a.resourceId === creation.instanceId) ||
    !cloud.ownershipInventory.some((r) => r.owned && r.action === 'delete' && r.resourceId === creation.instanceId)
  )
    throw Error('Native pending retirement cloud plan lacks the original instance');
  if (
    creation.interfaces.length !== base.interfaces.length ||
    creation.interfaces.some(
      (i, n) =>
        i.index !== n ||
        i.role !== base.interfaces[n].role ||
        i.device !== base.interfaces[n].guestDevice ||
        !/^eni-[0-9a-f]{8,17}$/.test(i.id) ||
        !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(i.mac),
    ) ||
    new Set(creation.interfaces.map((i) => i.id)).size !== creation.interfaces.length ||
    new Set(creation.interfaces.map((i) => i.mac)).size !== creation.interfaces.length
  )
    throw Error('Native pending retirement original interface coverage differs');
  return selected[0].binding;
}
function inventory(
  value: Inventory,
  binding: SiteBinding,
  fingerprints: { site: string; ingress: string },
): asserts value is AwsNativeObservedInventory & { registrations: InitialRegistrationRetirement[] } {
  assertAwsNativePreRegistrationInventory(value, binding, fingerprints);
  if (!Array.isArray(value.registrations)) throw Error('Native pending registration inventory is incomplete');
  const uids = new Set(value.resources.map((r) => r.uid));
  for (const site of value.sites)
    for (const uid of [site.siteUid, site.physicalSiteUid]) if (uid !== null) uids.add(uid);
  for (const r of value.registrations) {
    validateInitialRegistrationRetirement(binding, r);
    if (uids.has(r.uid)) throw Error('Native pending registration UID duplicates another resource');
    uids.add(r.uid);
  }
}

export function compileAwsNativePendingTeardown(
  base: AwsCePlan,
  cloud: AwsCePlan,
  creation: AwsNativeInitialCreationProjection,
  observed: AwsNativeObservedInventory,
): AwsNativePendingTeardownPlan {
  const binding = scope(base, cloud, creation);
  const value = observed;
  inventory(value, binding, { site: observed.siteContractFingerprint, ingress: observed.ingressContractFingerprint });
  const site = value.sites[0];
  if (
    !site.siteUid ||
    !site.physicalSiteUid ||
    value.registrations.length !== 1 ||
    value.registrations[0].instanceId !== creation.instanceId
  )
    throw Error('Native pending retirement requires original logical/physical/registration identities');
  const draft = {
    schemaVersion: 1 as const,
    kind: 'aws-ce-native-pending-teardown' as const,
    engine: 'native' as const,
    sourcePlanSha256: base.planSha256,
    cloudPlanId: cloud.planId,
    cloudPlanSha256: cloud.planSha256,
    creation: structuredClone(creation),
    pendingInventory: structuredClone(value),
    drain: {
      schemaVersion: 1 as const,
      owner: binding.owner,
      sourcePlanSha256: base.planSha256,
      siteContractFingerprint: value.siteContractFingerprint,
      ingressContractFingerprint: value.ingressContractFingerprint,
      listeners: [],
      origins: [],
      sites: [],
    },
    retirement: [
      {
        siteName: site.siteName,
        siteUid: site.siteUid,
        physicalSiteUid: site.physicalSiteUid,
        tokens: value.resources.map((r) => ({ node: r.node as string, name: r.name })),
      },
    ],
    registrations: structuredClone(value.registrations),
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `aws-ce-native-pending-teardown-${planSha256.slice(0, 24)}`, planSha256 };
}
export async function prepareAwsNativePendingTeardown(
  base: AwsCePlan,
  cloud: AwsCePlan,
  runtime: CeRuntime,
  contract: VerifiedIngressContract,
  storage: CeDeploymentStore,
  signal?: AbortSignal,
  readCreation?: NativeCreationReader,
): Promise<AwsNativePendingTeardownPlan | undefined> {
  await storage.verify();
  const owned = validateAwsNativeCloudTeardown(base, cloud);
  if (runtime.engine !== 'native' || canonicalSha256(storage.owner) !== canonicalSha256(owned[0].binding.owner))
    throw Error('Native pending preparation runtime or storage owner differs');
  const old = await optional(storage, pointer);
  if (old !== undefined) {
    const p = old as AwsNativePendingTeardownPlan;
    const expected = compileAwsNativePendingTeardown(base, cloud, p.creation, p.pendingInventory);
    if (
      canonicalSha256(p) !== canonicalSha256(expected) ||
      p.drain.siteContractFingerprint !== runtime.contract.fingerprint ||
      p.drain.ingressContractFingerprint !== contract.fingerprint ||
      canonicalSha256(p.drain.owner) !== canonicalSha256(storage.owner)
    )
      throw Error('Persisted native pending retirement identity differs');
    return p;
  }
  if (!readCreation) return;
  const selected = validateAwsNativeCloudTeardown(base, cloud);
  if (selected.length !== 1 || selected[0].binding.nodes.length !== 1 || base.intent.operation !== 'deploy') return;
  const binding = selected[0].binding;
  const first = await runtime.preRegistrationInventory([binding], ['default'], contract, signal);
  if (first.status !== 'unknown' || first.reason !== 'initial-registration-cloud-binding-required') return;
  if (!readCreation) throw Error('Original native public creation reader is unavailable');
  const before = await readCreation(signal);
  scope(base, cloud, before);
  const instances = { [before.node]: before.instanceId };
  const current = await runtime.preRegistrationInventory([binding], ['default'], contract, signal, instances);
  inventory(current, binding, { site: runtime.contract.fingerprint, ingress: contract.fingerprint });
  assertAwsNativeInventoryFresh(current);
  const again = await runtime.preRegistrationInventory([binding], ['default'], contract, signal, instances);
  inventory(again, binding, { site: runtime.contract.fingerprint, ingress: contract.fingerprint });
  assertAwsNativeInventoryFresh(again);
  if (
    canonicalSha256({ sites: current.sites, resources: current.resources, registrations: current.registrations }) !==
      canonicalSha256({ sites: again.sites, resources: again.resources, registrations: again.registrations }) ||
    canonicalSha256(before) !== canonicalSha256(await readCreation(signal))
  )
    throw Error('Native pending source changed during preparation');
  const plan = compileAwsNativePendingTeardown(base, cloud, before, again as AwsNativeObservedInventory);
  await storage.verify();
  await storage.write(`${plan.planId}.json`, plan, signal);
  await storage.write(pointer, plan, signal);
  return plan;
}
export async function runAwsNativePendingTeardown(
  base: AwsCePlan,
  cloud: AwsCePlan,
  input: AwsNativePendingTeardownPlan,
  authorized: string,
  runtime: CeRuntime,
  contract: VerifiedIngressContract,
  storage: CeDeploymentStore,
  retireCloud: (
    reference: { cloudPlanId: string; cloudPlanSha256: string },
    signal?: AbortSignal,
  ) => Promise<{ status: 'native-cloud-retired'; cloudPlanId: string; cloudPlanSha256: string; absence: 'absent' }>,
  signal?: AbortSignal,
) {
  const plan = structuredClone(input),
    binding = scope(base, cloud, plan.creation),
    expected = compileAwsNativePendingTeardown(base, cloud, plan.creation, plan.pendingInventory);
  const validate = async () => {
    signal?.throwIfAborted();
    await storage.verify();
    if (
      canonicalSha256(plan) !== canonicalSha256(expected) ||
      authorized !== plan.planSha256 ||
      runtime.engine !== 'native' ||
      canonicalSha256(storage.owner) !== canonicalSha256(binding.owner) ||
      runtime.contract.fingerprint !== plan.drain.siteContractFingerprint ||
      contract.fingerprint !== plan.drain.ingressContractFingerprint
    )
      throw Error('Native pending authorization/source/contract differs');
  };
  const observe = async () => {
    await validate();
    const current = await runtime.preRegistrationInventory([binding], ['default'], contract, signal, {
      [plan.creation.node]: plan.creation.instanceId,
    });
    inventory(current, binding, { site: runtime.contract.fingerprint, ingress: contract.fingerprint });
    assertAwsNativeInventoryFresh(current);
    const original = plan.pendingInventory.sites[0],
      site = current.sites[0];
    if (
      (site.siteUid !== null && site.siteUid !== original.siteUid) ||
      (site.physicalSiteUid !== null && site.physicalSiteUid !== original.physicalSiteUid) ||
      current.resources.some(
        (r) => !plan.pendingInventory.resources.some((e) => canonicalSha256(e) === canonicalSha256(r)),
      ) ||
      current.registrations.some((r) => !plan.registrations.some((e) => canonicalSha256(e) === canonicalSha256(r)))
    )
      throw Error('Native pending identity has advanced or changed');
    return current;
  };
  const cloudAbsent = async () => {
    await validate();
    const r = await retireCloud(plan, signal);
    if (
      r.status !== 'native-cloud-retired' ||
      r.absence !== 'absent' ||
      r.cloudPlanId !== plan.cloudPlanId ||
      r.cloudPlanSha256 !== plan.cloudPlanSha256
    )
      throw Error('Native pending exact cloud retirement is unverified');
  };
  await validate();
  return withAwsNativeOperation(storage, { kind: 'retire', cloudPlanSha256: plan.cloudPlanSha256 }, async () => {
    const release = await acquireProcessLock(join(storage.directory, '.aws-native-teardown-lock'));
    try {
      await observe();
      const marker = {
        schemaVersion: 1,
        engine: 'native',
        owner: binding.owner,
        sourcePlanSha256: base.planSha256,
        teardownPlanSha256: plan.planSha256,
      };
      const old = await optional(storage, 'aws-native-lifecycle-retirement.json');
      if (old !== undefined && canonicalSha256(old) !== canonicalSha256(marker))
        throw Error('Native pending retirement belongs to another immutable plan');
      if (old === undefined) await storage.write('aws-native-lifecycle-retirement.json', marker, signal);
      const completed: string[] = [];
      const persist = (record?: Record<string, unknown>) =>
        storage.write(
          `${plan.planId}-progress.json`,
          {
            schemaVersion: 1,
            planSha256: plan.planSha256,
            completed: [...completed],
            registrationRequest: record,
            observedAt: new Date().toISOString(),
          },
          signal,
        );
      for (const token of plan.retirement[0].tokens) {
        const c = await observe();
        const exact = plan.pendingInventory.resources.find((r) => r.name === token.name);
        if (!exact) throw Error('Native pending token original UID is unavailable');
        if (c.resources.some((r) => r.name === token.name))
          await runtime.deleteBootstrapTokenExact(binding, token.node, token.name, exact.uid, signal);
        if ((await observe()).resources.some((r) => r.name === token.name))
          throw Error('Native pending token retirement is pending');
        completed.push(`token:${token.name}`);
        await persist();
      }
      await observe();
      await cloudAbsent();
      completed.push('native-cloud-retired');
      await persist();
      for (const registration of plan.registrations) {
        await observe();
        const r = await runtime.deleteInitialRegistration(
          binding,
          registration,
          persist,
          signal,
          plan.retirement[0].siteUid,
        );
        if (r.status !== 'absent')
          return { status: 'pending-registration-retirement' as const, cloudInventory: 'absent' as const };
        if ((await observe()).registrations.some((r) => r.uid === registration.uid))
          throw Error('Native pending exact registration absence is unverified');
        completed.push(`registration:${registration.name}`);
        await persist();
      }
      await observe();
      await runtime.deleteSiteExact(binding, plan.retirement[0].siteUid, signal);
      const after = await observe();
      if (
        after.sites[0].siteUid !== null ||
        after.sites[0].physicalSiteUid !== null ||
        after.resources.length ||
        after.registrations.length
      )
        return { status: 'pending-site-retirement' as const, cloudInventory: 'absent' as const };
      await cloudAbsent();
      await observe();
      const credentials = await retireAwsNativeBootstrapCredentials(base, plan, storage, signal);
      completed.push('platform-drained');
      const receipt = {
        status: 'ce-retired-supporting-infrastructure-unverified' as const,
        owner: binding.owner,
        planSha256: plan.planSha256,
        sourcePlanSha256: base.planSha256,
        cloudPlanSha256: plan.cloudPlanSha256,
        completed,
        platformDrainEvidence: 'verified-empty-native-initial-registration' as const,
        cloudInventory: 'absent' as const,
        credentialStaging: credentials.status,
        credentialRetirementEvidenceSha256: credentials.evidenceSha256,
        observedAt: new Date().toISOString(),
      };
      await storage.write(`${plan.planId}-receipt.json`, receipt, signal);
      await storage.write('aws-native-teardown-receipt.json', receipt, signal);
      return receipt;
    } finally {
      await release();
    }
  });
}
