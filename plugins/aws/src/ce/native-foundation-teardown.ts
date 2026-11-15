import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CePlatformDrainPlan } from '../../../platform/src/ce/platform-drain';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import { canonicalSha256 } from './canonical';
import { retireAwsNativeBootstrapCredentials } from './native-bootstrap-retirement';
import { withAwsNativeOperation } from './native-operation';
import {
  type AwsNativeObservedInventory,
  assertAwsNativeInventoryFresh,
  assertAwsNativePreRegistrationInventory,
} from './native-reservation-teardown';
import { validateAwsNativeCloudTeardown } from './native-teardown';
import type { AwsCePlan } from './types';

export interface AwsNativeFoundationTeardownPlan {
  schemaVersion: 1;
  kind: 'aws-ce-native-foundation-teardown';
  engine: 'native';
  sourcePlanSha256: string;
  cloudPlanId: string;
  cloudPlanSha256: string;
  drain: CePlatformDrainPlan;
  retirement: [];
  platformAbsence: AwsNativeObservedInventory;
  planId: string;
  planSha256: string;
}
const pointer = 'aws-native-foundation-teardown.json';
async function optional(storage: CeDeploymentStore, name: string) {
  try {
    return await storage.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
function binding(base: AwsCePlan, cloud: AwsCePlan) {
  const selected = validateAwsNativeCloudTeardown(base, cloud);
  const targets = cloud.ownershipInventory.filter((r) => r.owned && r.action === 'delete');
  const deletes = cloud.actions.filter((a) => a.kind === 'resource-delete');
  if (
    selected.length !== 1 ||
    selected[0].binding.nodes.length !== 1 ||
    cloud.ownershipInventory.some((r) => r.owned && r.resourceId.startsWith('i-')) ||
    new Set(targets.map((r) => r.resourceId)).size !== targets.length ||
    deletes.some((a) => targets.filter((r) => r.resourceId === a.resourceId).length !== 1) ||
    targets.some((r) => deletes.filter((a) => a.resourceId === r.resourceId).length !== 1)
  )
    throw Error('Native pre-logical foundation cloud inventory or single-node scope differs');
  return selected[0].binding;
}
function absent(inventory: AwsNativeObservedInventory) {
  return (
    inventory.sites.every((s) => s.siteUid === null && s.physicalSiteUid === null) && inventory.resources.length === 0
  );
}
export function compileAwsNativeFoundationTeardown(
  base: AwsCePlan,
  cloud: AwsCePlan,
  inventory: AwsNativeObservedInventory,
): AwsNativeFoundationTeardownPlan {
  const selected = binding(base, cloud);
  assertAwsNativePreRegistrationInventory(inventory, selected, {
    site: inventory.siteContractFingerprint,
    ingress: inventory.ingressContractFingerprint,
  });
  if (!absent(inventory)) throw Error('Native pre-logical platform absence is unverified');
  const draft = {
    schemaVersion: 1 as const,
    kind: 'aws-ce-native-foundation-teardown' as const,
    engine: 'native' as const,
    sourcePlanSha256: base.planSha256,
    cloudPlanId: cloud.planId,
    cloudPlanSha256: cloud.planSha256,
    drain: {
      schemaVersion: 1 as const,
      owner: selected.owner,
      sourcePlanSha256: base.planSha256,
      siteContractFingerprint: inventory.siteContractFingerprint,
      ingressContractFingerprint: inventory.ingressContractFingerprint,
      listeners: [],
      origins: [],
      sites: [],
    },
    retirement: [] as [],
    platformAbsence: structuredClone(inventory),
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `aws-ce-native-foundation-teardown-${planSha256.slice(0, 24)}`, planSha256 };
}
export async function prepareAwsNativeFoundationTeardown(
  base: AwsCePlan,
  cloud: AwsCePlan,
  runtime: CeRuntime,
  contract: VerifiedIngressContract,
  storage: CeDeploymentStore,
  signal?: AbortSignal,
): Promise<AwsNativeFoundationTeardownPlan | undefined> {
  const old = await optional(storage, pointer);
  if (old !== undefined) {
    const plan = old as AwsNativeFoundationTeardownPlan;
    const expected = compileAwsNativeFoundationTeardown(base, cloud, plan.platformAbsence);
    if (
      canonicalSha256(plan) !== canonicalSha256(expected) ||
      plan.drain.siteContractFingerprint !== runtime.contract.fingerprint ||
      plan.drain.ingressContractFingerprint !== contract.fingerprint ||
      canonicalSha256(storage.owner) !== canonicalSha256(plan.drain.owner)
    )
      throw Error('Persisted native foundation identity differs');
    return plan;
  }
  if (
    (await optional(storage, 'aws-native-reservation-teardown.json')) !== undefined ||
    (await optional(storage, 'aws-native-teardown-material.json')) !== undefined ||
    (await optional(storage, 'aws-native-teardown-source.json')) !== undefined ||
    (await optional(storage, 'aws-native-lifecycle-retirement.json')) !== undefined
  )
    return undefined;
  const selected = validateAwsNativeCloudTeardown(base, cloud);
  if (selected.length !== 1 || selected[0].binding.nodes.length !== 1) return undefined;
  const scope = selected[0].binding;
  await storage.verify();
  if (runtime.engine !== 'native' || canonicalSha256(scope.owner) !== canonicalSha256(storage.owner))
    throw Error('Native foundation owner differs');
  const first = await runtime.preRegistrationInventory([scope], ['default'], contract, signal);
  if (first.status !== 'observed') return undefined;
  assertAwsNativePreRegistrationInventory(first, scope, {
    site: runtime.contract.fingerprint,
    ingress: contract.fingerprint,
  });
  assertAwsNativeInventoryFresh(first);
  if (!absent(first)) return undefined;
  const second = await runtime.preRegistrationInventory([scope], ['default'], contract, signal);
  assertAwsNativePreRegistrationInventory(second, scope, {
    site: runtime.contract.fingerprint,
    ingress: contract.fingerprint,
  });
  assertAwsNativeInventoryFresh(second);
  if (
    !absent(second) ||
    canonicalSha256({ sites: first.sites, resources: first.resources }) !==
      canonicalSha256({ sites: second.sites, resources: second.resources })
  )
    throw Error('Native foundation absence changed during preparation');
  const plan = compileAwsNativeFoundationTeardown(base, cloud, second);
  await storage.write(`${plan.planId}.json`, plan, signal);
  await storage.write(pointer, plan, signal);
  return plan;
}
export async function runAwsNativeFoundationTeardown(
  base: AwsCePlan,
  cloud: AwsCePlan,
  input: AwsNativeFoundationTeardownPlan,
  authorized: string,
  runtime: CeRuntime,
  contract: VerifiedIngressContract,
  storage: CeDeploymentStore,
  retireCloud: (
    reference: Pick<AwsNativeFoundationTeardownPlan, 'cloudPlanId' | 'cloudPlanSha256'>,
    signal?: AbortSignal,
  ) => Promise<{ status: 'native-cloud-retired'; cloudPlanId: string; cloudPlanSha256: string; absence: 'absent' }>,
  signal?: AbortSignal,
) {
  const plan = structuredClone(input),
    scope = binding(base, cloud),
    expected = compileAwsNativeFoundationTeardown(base, cloud, plan.platformAbsence);
  const validate = async () => {
    signal?.throwIfAborted();
    await storage.verify();
    if (
      canonicalSha256(plan) !== canonicalSha256(expected) ||
      authorized !== plan.planSha256 ||
      runtime.engine !== 'native' ||
      canonicalSha256(scope.owner) !== canonicalSha256(storage.owner) ||
      plan.drain.siteContractFingerprint !== runtime.contract.fingerprint ||
      plan.drain.ingressContractFingerprint !== contract.fingerprint
    )
      throw Error('Native foundation authorization or source differs');
  };
  const observe = async () => {
    await validate();
    const current = await runtime.preRegistrationInventory([scope], ['default'], contract, signal);
    assertAwsNativePreRegistrationInventory(current, scope, {
      site: runtime.contract.fingerprint,
      ingress: contract.fingerprint,
    });
    assertAwsNativeInventoryFresh(current);
    if (!absent(current)) throw Error('Native foundation platform absence is unverified');
  };
  await validate();
  return withAwsNativeOperation(storage, { kind: 'retire', cloudPlanSha256: plan.cloudPlanSha256 }, async () => {
    await observe();
    const marker = {
      schemaVersion: 1,
      engine: 'native',
      owner: scope.owner,
      sourcePlanSha256: base.planSha256,
      teardownPlanSha256: plan.planSha256,
    };
    const prior = await optional(storage, 'aws-native-lifecycle-retirement.json');
    if (prior !== undefined && canonicalSha256(prior) !== canonicalSha256(marker))
      throw Error('Native foundation retirement belongs to another immutable plan');
    if (prior === undefined) await storage.write('aws-native-lifecycle-retirement.json', marker, signal);
    await observe();
    const cloudReceipt = await retireCloud(plan, signal);
    if (
      cloudReceipt.status !== 'native-cloud-retired' ||
      cloudReceipt.cloudPlanId !== plan.cloudPlanId ||
      cloudReceipt.cloudPlanSha256 !== plan.cloudPlanSha256 ||
      cloudReceipt.absence !== 'absent'
    )
      throw Error('Native foundation exact cloud absence is unverified');
    await observe();
    const credentials = await retireAwsNativeBootstrapCredentials(base, plan, storage, signal);
    await observe();
    const receipt = {
      status: 'ce-retired-supporting-infrastructure-unverified' as const,
      owner: scope.owner,
      planSha256: plan.planSha256,
      sourcePlanSha256: base.planSha256,
      cloudPlanSha256: plan.cloudPlanSha256,
      completed: ['platform-drained', 'native-cloud-retired'],
      platformDrainEvidence: 'verified-absent-native-foundation' as const,
      cloudInventory: 'absent' as const,
      credentialStaging: credentials.status,
      credentialRetirementEvidenceSha256: credentials.evidenceSha256,
      observedAt: new Date().toISOString(),
    };
    await storage.write(`${plan.planId}-receipt.json`, receipt, signal);
    await storage.write('aws-native-teardown-receipt.json', receipt, signal);
    return receipt;
  });
}
