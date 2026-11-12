import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CePlatformDrainPlan } from '../../../platform/src/ce/platform-drain';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { CeRuntime, SiteBinding } from '../../../platform/src/ce/runtime';
import type { CeTeardownResource } from '../../../platform/src/ce/teardown-inventory';
import { verifyAwsCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { retireAwsNativeBootstrapCredentials } from './native-bootstrap-retirement';
import { siteBindings } from './topology';
import type { AwsCePlan } from './types';

type Inventory = Awaited<ReturnType<CeRuntime['preRegistrationInventory']>>;
type ObservedInventory = Extract<Inventory, { status: 'observed' }>;
export interface AwsNativeReservationTeardownPlan {
  schemaVersion: 1;
  kind: 'aws-ce-native-reservation-teardown';
  engine: 'native';
  sourcePlanSha256: string;
  cloudPlanId: string;
  cloudPlanSha256: string;
  drain: CePlatformDrainPlan;
  retirement: Array<{
    siteName: string;
    siteUid: string;
    physicalSiteUid: string | null;
    tokens: Array<{ node: string; name: string }>;
  }>;
  reservationInventory: ObservedInventory;
  planId: string;
  planSha256: string;
}
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const name = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value);
const pointer = 'aws-native-reservation-teardown.json';
async function optional(storage: CeDeploymentStore, path: string) {
  try {
    return await storage.read(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
function scope(base: AwsCePlan, cloud: AwsCePlan) {
  verifyAwsCePlan(base);
  verifyAwsCePlan(cloud);
  const sites = siteBindings(base);
  const intent = { ...base.intent, operation: 'teardown' };
  delete intent.replacementNode;
  if (
    base.engine !== 'native' ||
    base.intent.operation === 'teardown' ||
    cloud.engine !== 'native' ||
    cloud.intent.operation !== 'teardown' ||
    sites.length !== 1 ||
    sites[0].binding.nodes.length !== 1 ||
    canonicalSha256(intent) !== canonicalSha256(cloud.intent) ||
    canonicalSha256(base.rollback.resources) !== canonicalSha256(cloud.rollback.resources) ||
    cloud.actions.length ||
    cloud.ownershipInventory.some((row) => row.owned)
  )
    throw Error('Native reservation requires exact single-node source and empty cloud teardown plans');
  return sites[0].binding;
}
function inventoryShape(
  value: Inventory,
  binding: SiteBinding,
  fingerprints: { site: string; ingress: string },
): asserts value is ObservedInventory {
  if (
    value.status !== 'observed' ||
    canonicalSha256(value.owner) !== canonicalSha256(binding.owner) ||
    value.siteContractFingerprint !== fingerprints.site ||
    value.ingressContractFingerprint !== fingerprints.ingress ||
    !Array.isArray(value.sites) ||
    value.sites.length !== 1 ||
    !Array.isArray(value.resources) ||
    !Array.isArray(value.sources) ||
    !value.sources.length
  )
    throw Error('Native reservation inventory is unavailable or differs from ownership');
  const site = value.sites[0];
  if (
    site.siteName !== binding.siteName ||
    !(site.siteUid === null || text(site.siteUid)) ||
    !(site.physicalSiteUid === null || text(site.physicalSiteUid))
  )
    throw Error('Native reservation site identity is incomplete');
  const uids = new Set<string>();
  for (const uid of [site.siteUid, site.physicalSiteUid])
    if (uid !== null) {
      if (uids.has(uid)) throw Error('Duplicate native reservation UID');
      uids.add(uid);
    }
  const names = new Set<string>();
  for (const resource of value.resources) {
    if (
      resource.kind !== 'tokens' ||
      !name(resource.name) ||
      !text(resource.uid) ||
      resource.namespace !== 'system' ||
      resource.siteName !== binding.siteName ||
      !binding.nodes.includes(String(resource.node)) ||
      names.has(resource.name) ||
      uids.has(resource.uid)
    )
      throw Error('Native reservation token inventory is foreign, duplicate, or post-admission');
    names.add(resource.name);
    uids.add(resource.uid);
  }
}
function fresh(value: Inventory) {
  const observed = Date.parse(value.observedAt),
    started = Date.parse(value.startedAt);
  if (
    !Number.isFinite(observed) ||
    !Number.isFinite(started) ||
    started > observed ||
    observed > Date.now() ||
    Date.now() - started > 60000
  )
    throw Error('Native reservation collection is stale');
}
export function compileAwsNativeReservationTeardown(
  base: AwsCePlan,
  cloud: AwsCePlan,
  inventory: ObservedInventory,
): AwsNativeReservationTeardownPlan {
  const binding = scope(base, cloud);
  inventoryShape(inventory, binding, {
    site: inventory.siteContractFingerprint,
    ingress: inventory.ingressContractFingerprint,
  });
  if (
    !text(inventory.siteContractFingerprint) ||
    !text(inventory.ingressContractFingerprint) ||
    !text(inventory.sites[0].siteUid)
  )
    throw Error('Native reservation original logical UID is required');
  const site = inventory.sites[0];
  const draft = {
    schemaVersion: 1 as const,
    kind: 'aws-ce-native-reservation-teardown' as const,
    engine: 'native' as const,
    sourcePlanSha256: base.planSha256,
    cloudPlanId: cloud.planId,
    cloudPlanSha256: cloud.planSha256,
    drain: {
      schemaVersion: 1 as const,
      owner: binding.owner,
      sourcePlanSha256: base.planSha256,
      siteContractFingerprint: inventory.siteContractFingerprint,
      ingressContractFingerprint: inventory.ingressContractFingerprint,
      listeners: [],
      origins: [],
      sites: [{ binding, siteUid: site.siteUid as string, routing: [] }],
    },
    retirement: [
      {
        siteName: site.siteName,
        siteUid: site.siteUid as string,
        physicalSiteUid: site.physicalSiteUid,
        tokens: inventory.resources.map((r) => ({ node: r.node as string, name: r.name })),
      },
    ],
    reservationInventory: structuredClone(inventory),
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `aws-ce-native-reservation-teardown-${planSha256.slice(0, 24)}`, planSha256 };
}
/** A separate reservation contract; registered identity and token-coverage requirements remain intact. */
export async function prepareAwsNativeReservationTeardown(
  base: AwsCePlan,
  cloud: AwsCePlan,
  runtime: CeRuntime,
  contract: VerifiedIngressContract,
  storage: CeDeploymentStore,
  signal?: AbortSignal,
): Promise<AwsNativeReservationTeardownPlan | undefined> {
  const old = await optional(storage, pointer);
  if (old !== undefined) {
    const plan = old as AwsNativeReservationTeardownPlan;
    const compiled = compileAwsNativeReservationTeardown(base, cloud, plan.reservationInventory);
    if (
      canonicalSha256(plan) !== canonicalSha256(compiled) ||
      plan.drain.siteContractFingerprint !== runtime.contract.fingerprint ||
      plan.drain.ingressContractFingerprint !== contract.fingerprint ||
      canonicalSha256(storage.owner) !== canonicalSha256(plan.drain.owner)
    )
      throw Error('Persisted native reservation retirement differs');
    return plan;
  }
  if (
    cloud.actions.length ||
    cloud.ownershipInventory.some((r) => r.owned) ||
    siteBindings(base).length !== 1 ||
    siteBindings(base)[0].binding.nodes.length !== 1
  )
    return undefined;
  const binding = scope(base, cloud);
  await storage.verify();
  if (runtime.engine !== 'native' || canonicalSha256(storage.owner) !== canonicalSha256(binding.owner))
    throw Error('Native reservation deployment owner differs');
  const inventory = await runtime.preRegistrationInventory([binding], ['default'], contract, signal);
  if (inventory.status !== 'observed') return undefined;
  inventoryShape(inventory, binding, { site: runtime.contract.fingerprint, ingress: contract.fingerprint });
  fresh(inventory);
  if (!text(inventory.sites[0].siteUid)) return undefined;
  // Complete registered-compatible material keeps its existing compiler and lifecycle contract.
  if (
    inventory.sites[0].physicalSiteUid !== null &&
    binding.nodes.every((node) => inventory.resources.some((r) => r.node === node))
  )
    return undefined;
  const second = await runtime.preRegistrationInventory([binding], ['default'], contract, signal);
  inventoryShape(second, binding, { site: runtime.contract.fingerprint, ingress: contract.fingerprint });
  fresh(second);
  if (
    canonicalSha256({ sites: inventory.sites, resources: inventory.resources }) !==
    canonicalSha256({ sites: second.sites, resources: second.resources })
  )
    throw Error('Native reservation inventory changed during preparation');
  const plan = compileAwsNativeReservationTeardown(base, cloud, second);
  await storage.write(`${plan.planId}.json`, plan, signal);
  await storage.write(pointer, plan, signal);
  return plan;
}
export async function runAwsNativeReservationTeardown(
  base: AwsCePlan,
  cloud: AwsCePlan,
  input: AwsNativeReservationTeardownPlan,
  authorized: string,
  runtime: CeRuntime,
  contract: VerifiedIngressContract,
  storage: CeDeploymentStore,
  retireCloud: (
    plan: Pick<AwsNativeReservationTeardownPlan, 'cloudPlanId' | 'cloudPlanSha256'>,
    signal?: AbortSignal,
  ) => Promise<{ status: 'native-cloud-retired'; cloudPlanId: string; cloudPlanSha256: string; absence: 'absent' }>,
  signal?: AbortSignal,
) {
  const plan = structuredClone(input),
    binding = scope(base, cloud);
  const expected = compileAwsNativeReservationTeardown(base, cloud, plan.reservationInventory);
  const validate = async () => {
    signal?.throwIfAborted();
    await storage.verify();
    if (
      canonicalSha256(plan) !== canonicalSha256(expected) ||
      authorized !== plan.planSha256 ||
      runtime.engine !== 'native' ||
      canonicalSha256(storage.owner) !== canonicalSha256(binding.owner) ||
      plan.drain.siteContractFingerprint !== runtime.contract.fingerprint ||
      plan.drain.ingressContractFingerprint !== contract.fingerprint
    )
      throw Error('Native reservation authorization or immutable source differs');
  };
  const observe = async () => {
    await validate();
    const current = await runtime.preRegistrationInventory([binding], ['default'], contract, signal);
    inventoryShape(current, binding, { site: runtime.contract.fingerprint, ingress: contract.fingerprint });
    fresh(current);
    const original = plan.reservationInventory.sites[0],
      site = current.sites[0];
    if (
      (site.siteUid !== null && site.siteUid !== original.siteUid) ||
      (site.physicalSiteUid !== null && site.physicalSiteUid !== original.physicalSiteUid)
    )
      throw Error('Native reservation identity changed; replan required');
    const match = (r: CeTeardownResource) =>
      plan.reservationInventory.resources.some((expected) => canonicalSha256(r) === canonicalSha256(expected));
    if (current.resources.some((r) => !match(r))) throw Error('New native reservation token requires a new plan');
    return current;
  };
  const cloudAbsent = async () => {
    await validate();
    const receipt = await retireCloud(plan, signal);
    if (
      receipt.status !== 'native-cloud-retired' ||
      receipt.cloudPlanId !== plan.cloudPlanId ||
      receipt.cloudPlanSha256 !== plan.cloudPlanSha256 ||
      receipt.absence !== 'absent'
    )
      throw Error('Native reservation owner cloud absence is unverified');
  };
  await validate();
  const release = await acquireProcessLock(join(storage.directory, '.aws-native-teardown-lock'));
  try {
    await observe();
    await cloudAbsent();
    await observe();
    const marker = {
      schemaVersion: 1,
      engine: 'native',
      owner: binding.owner,
      sourcePlanSha256: base.planSha256,
      teardownPlanSha256: plan.planSha256,
    };
    const prior = await optional(storage, 'aws-native-lifecycle-retirement.json');
    if (prior !== undefined && canonicalSha256(prior) !== canonicalSha256(marker))
      throw Error('Native reservation retirement belongs to another immutable teardown');
    if (prior === undefined) await storage.write('aws-native-lifecycle-retirement.json', marker, signal);
    const completed = ['platform-drained', 'native-cloud-retired'];
    for (const token of plan.retirement[0].tokens) {
      const current = await observe();
      if (current.resources.some((r) => r.name === token.name))
        await runtime.deleteBootstrapToken(binding, token.node, token.name, signal);
      if ((await observe()).resources.some((r) => r.name === token.name))
        throw Error('Native reservation token deletion is pending');
      completed.push(`token:${token.name}`);
    }
    const before = await observe();
    if (before.sites[0].siteUid !== null) await runtime.deleteSiteExact(binding, plan.retirement[0].siteUid, signal);
    const after = await observe();
    if (after.sites[0].siteUid !== null || after.sites[0].physicalSiteUid !== null || after.resources.length)
      return {
        status: 'pending-site-retirement' as const,
        siteName: binding.siteName,
        cloudInventory: 'absent' as const,
      };
    completed.push(`site:${binding.siteName}`);
    await cloudAbsent();
    await observe();
    const credentials = await retireAwsNativeBootstrapCredentials(base, plan, storage, signal);
    const receipt = {
      status: 'ce-retired-supporting-infrastructure-unverified' as const,
      owner: binding.owner,
      planSha256: plan.planSha256,
      sourcePlanSha256: base.planSha256,
      cloudPlanSha256: plan.cloudPlanSha256,
      completed,
      platformDrainEvidence: 'verified-empty-native-reservation' as const,
      credentialStaging: credentials.status,
      credentialRetirementEvidenceSha256: credentials.evidenceSha256,
      cloudInventory: 'absent' as const,
      observedAt: new Date().toISOString(),
    };
    await storage.write(`${plan.planId}-receipt.json`, receipt, signal);
    await storage.write('aws-native-teardown-receipt.json', receipt, signal);
    return receipt;
  } finally {
    await release();
  }
}
