import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CePlatformDrainPlan } from '../../../platform/src/ce/platform-drain';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import { verifyAwsCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { collectAwsTeardownMaterial } from './terraform-teardown-plan';
import { siteBindings, siteTopology } from './topology';
import type { AwsCePlan } from './types';

interface Retirement {
  siteName: string;
  siteUid: string;
  physicalSiteUid: string;
  tokens: Array<{ node: string; name: string }>;
}

export interface AwsNativeTeardownPlan {
  schemaVersion: 1;
  kind: 'aws-ce-native-teardown';
  engine: 'native';
  sourcePlanSha256: string;
  cloudPlanId: string;
  cloudPlanSha256: string;
  drain: CePlatformDrainPlan;
  retirement: Retirement[];
  planId: string;
  planSha256: string;
}

const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const name = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value);
const intentScope = (plan: AwsCePlan) => {
  const intent = structuredClone(plan.intent);
  intent.operation = 'teardown';
  delete intent.replacementNode;
  return intent;
};

export function compileAwsNativeTeardown(
  base: AwsCePlan,
  cloud: AwsCePlan,
  drain: CePlatformDrainPlan,
  retirement: Retirement[],
): AwsNativeTeardownPlan {
  verifyAwsCePlan(base);
  verifyAwsCePlan(cloud);
  const selected = siteBindings(base);
  if (
    base.engine !== 'native' ||
    base.intent.operation === 'teardown' ||
    cloud.engine !== 'native' ||
    cloud.intent.operation !== 'teardown' ||
    canonicalSha256(intentScope(base)) !== canonicalSha256(intentScope(cloud)) ||
    canonicalSha256(siteTopology(base.intent)) !== canonicalSha256(siteTopology(cloud.intent)) ||
    canonicalSha256(base.rollback.resources) !== canonicalSha256(cloud.rollback.resources) ||
    drain.schemaVersion !== 1 ||
    drain.sourcePlanSha256 !== base.planSha256 ||
    canonicalSha256(drain.owner) !== canonicalSha256(selected[0].binding.owner) ||
    drain.sites.length !== selected.length ||
    retirement.length !== selected.length ||
    !cloud.actions.length ||
    cloud.actions.some(
      (action) =>
        action.phase !== 'teardown' ||
        (action.kind === 'brownfield-restore' &&
          !cloud.rollback.resources.some((resource) => resource.id === action.resourceId)),
    )
  )
    throw new Error('Native teardown source, cloud plan, topology, or restoration support differs');
  const cloudDeletes = cloud.ownershipInventory.filter((row) => row.owned && row.action === 'delete');
  if (
    !cloudDeletes.length ||
    cloud.actions.filter((action) => action.kind === 'resource-delete').length !== cloudDeletes.length
  )
    throw new Error('Native teardown cloud deletion inventory is incomplete');
  const peers = base.actions.filter((action) => action.kind === 'tgw-connect-peer-create');
  const seen = new Set<string>();
  const unique = (value: string) => {
    if (seen.has(value)) throw new Error('Duplicate native teardown identity');
    seen.add(value);
  };
  for (const { site, binding } of selected) {
    const planned = drain.sites.filter((row) => row.binding.siteName === site.name);
    const retired = retirement.filter((row) => row.siteName === site.name);
    if (
      planned.length !== 1 ||
      retired.length !== 1 ||
      canonicalSha256(planned[0].binding) !== canonicalSha256(binding)
    )
      throw new Error('Native teardown site inventory is incomplete');
    if (!text(planned[0].siteUid) || retired[0].siteUid !== planned[0].siteUid || !text(retired[0].physicalSiteUid))
      throw new Error('Native teardown site identity differs');
    unique(`site:${retired[0].siteUid}`);
    unique(`physical:${retired[0].physicalSiteUid}`);
    const expected = peers
      .filter((action) => site.nodeIndexes.includes(action.node ?? 0))
      .map((action) => ({
        kind: 'external_connector',
        name: `${base.deploymentName.slice(0, 24)}-gre-${peers.indexOf(action) + 1}`,
      }));
    if (expected.length) expected.push({ kind: 'bgp', name: `${site.name.slice(0, 55)}-tgw-bgp` });
    if (
      planned[0].routing.length !== expected.length ||
      expected.some(
        (resource) =>
          planned[0].routing.filter((row) => row.kind === resource.kind && row.name === resource.name).length !== 1,
      )
    )
      throw new Error('Native teardown routing inventory is incomplete');
    for (const resource of planned[0].routing) {
      if (!text(resource.uid)) throw new Error('Native teardown routing UID is missing');
      unique(`routing:${resource.uid}`);
    }
    if (
      retired[0].tokens.length > 128 ||
      binding.nodes.some((node) => !retired[0].tokens.some((token) => token.node === node))
    )
      throw new Error('Native teardown bootstrap token inventory is incomplete');
    for (const token of retired[0].tokens) {
      if (!binding.nodes.includes(token.node) || !name(token.name))
        throw new Error('Native teardown bootstrap token scope differs');
      unique(`token:${token.name}`);
    }
  }
  const draft = {
    schemaVersion: 1 as const,
    kind: 'aws-ce-native-teardown' as const,
    engine: 'native' as const,
    sourcePlanSha256: base.planSha256,
    cloudPlanId: cloud.planId,
    cloudPlanSha256: cloud.planSha256,
    drain: structuredClone(drain),
    retirement: structuredClone(retirement),
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `aws-ce-native-teardown-${planSha256.slice(0, 24)}`, planSha256 };
}

export async function prepareAwsNativeTeardown(
  base: AwsCePlan,
  cloud: AwsCePlan,
  runtime: CeRuntime,
  contract: VerifiedIngressContract,
  storage: CeDeploymentStore,
  signal?: AbortSignal,
) {
  if (base.engine !== 'native' || cloud.engine !== 'native')
    throw new Error('Native teardown preparation requires native ownership');
  const materialName = 'aws-native-teardown-material.json';
  const persisted =
    (await optional(storage, materialName)) ?? (await optional(storage, 'aws-native-teardown-source.json'));
  let material: Pick<AwsNativeTeardownPlan, 'sourcePlanSha256' | 'drain' | 'retirement'>;
  if (persisted === undefined) {
    const collected = await collectAwsTeardownMaterial(base, runtime, contract, storage, signal);
    material = { sourcePlanSha256: base.planSha256, ...collected };
    await storage.write(materialName, material);
  } else {
    const candidate = persisted as Partial<AwsNativeTeardownPlan>;
    if (candidate.sourcePlanSha256 !== base.planSha256 || !candidate.drain || !Array.isArray(candidate.retirement))
      throw new Error('Persisted native teardown material differs');
    material = {
      sourcePlanSha256: candidate.sourcePlanSha256,
      drain: candidate.drain,
      retirement: candidate.retirement,
    };
    if ((await optional(storage, materialName)) === undefined) await storage.write(materialName, material);
  }
  const { drain, retirement } = material;
  const plan = compileAwsNativeTeardown(base, cloud, drain, retirement);
  await storage.write(`${plan.planId}.json`, plan);
  return plan;
}

interface NativeTeardownDriver {
  engine: 'native';
  siteContractFingerprint: string;
  ingressContractFingerprint: string;
  drain(signal?: AbortSignal): Promise<{ status: 'platform-drained' | 'pending-origin' }>;
  retireCloud(
    plan: Pick<AwsNativeTeardownPlan, 'cloudPlanId' | 'cloudPlanSha256'>,
    signal?: AbortSignal,
  ): Promise<{ status: 'native-cloud-retired'; cloudPlanId: string; cloudPlanSha256: string; absence: 'absent' }>;
  observeSite(site: Retirement, signal?: AbortSignal): Promise<{ status: 'deleted' | 'pending' | 'unknown' }>;
  revokeToken(site: Retirement, token: Retirement['tokens'][number], signal?: AbortSignal): Promise<void>;
  deleteSite(site: Retirement, signal?: AbortSignal): Promise<unknown>;
}

async function optional(storage: CeDeploymentStore, key: string): Promise<unknown> {
  try {
    return await storage.read(key);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export async function coordinateAwsNativeTeardown(
  base: AwsCePlan,
  cloud: AwsCePlan,
  input: AwsNativeTeardownPlan,
  authorizedPlanSha256: string,
  storage: CeDeploymentStore,
  driver: NativeTeardownDriver,
  signal?: AbortSignal,
) {
  const plan = structuredClone(input);
  const expected = compileAwsNativeTeardown(base, cloud, plan.drain, plan.retirement);
  const validate = async () => {
    signal?.throwIfAborted();
    await storage.verify();
    if (
      canonicalSha256(plan) !== canonicalSha256(expected) ||
      authorizedPlanSha256 !== plan.planSha256 ||
      canonicalSha256(storage.owner) !== canonicalSha256(plan.drain.owner) ||
      driver.engine !== 'native' ||
      driver.siteContractFingerprint !== plan.drain.siteContractFingerprint ||
      driver.ingressContractFingerprint !== plan.drain.ingressContractFingerprint
    )
      throw new Error('Native teardown ownership, authorization, or contract differs');
  };
  await validate();
  const release = await acquireProcessLock(join(storage.directory, '.aws-native-teardown-lock'));
  try {
    const sourceName = `${plan.planId}-source.json`;
    const saved = await optional(storage, sourceName);
    if (saved === undefined) await storage.write(sourceName, plan);
    else if (canonicalSha256(saved) !== canonicalSha256(plan))
      throw new Error('Persisted native teardown source differs');
    const completed: string[] = [];
    const checkpoint = () =>
      storage.write(`${plan.planId}-progress.json`, {
        schemaVersion: 1,
        planSha256: plan.planSha256,
        completed: [...completed],
        observedAt: new Date().toISOString(),
      });
    const drained = await driver.drain(signal);
    if (drained.status !== 'platform-drained')
      return { status: 'pending-platform-drain' as const, cloudInventory: 'unknown' as const };
    completed.push('platform-drained');
    await checkpoint();
    await validate();
    const cloudReceipt = await driver.retireCloud(plan, signal);
    if (
      cloudReceipt.status !== 'native-cloud-retired' ||
      cloudReceipt.cloudPlanId !== plan.cloudPlanId ||
      cloudReceipt.cloudPlanSha256 !== plan.cloudPlanSha256 ||
      cloudReceipt.absence !== 'absent'
    )
      throw new Error('Native cloud retirement did not produce exact absence evidence');
    completed.push('native-cloud-retired');
    await checkpoint();
    for (const site of plan.retirement) {
      await validate();
      if (!['pending', 'deleted'].includes((await driver.observeSite(site, signal)).status))
        throw new Error('Native site retirement identity evidence is unknown');
      for (const token of site.tokens) {
        await validate();
        await driver.revokeToken(site, token, signal);
        completed.push(`token:${token.name}`);
        await checkpoint();
      }
      await validate();
      await driver.deleteSite(site, signal);
      if ((await driver.observeSite(site, signal)).status !== 'deleted')
        return {
          status: 'pending-site-retirement' as const,
          siteName: site.siteName,
          cloudInventory: 'absent' as const,
        };
      completed.push(`site:${site.siteName}`);
      await checkpoint();
    }
    await validate();
    const finalCloud = await driver.retireCloud(plan, signal);
    if (
      finalCloud.status !== 'native-cloud-retired' ||
      finalCloud.cloudPlanId !== plan.cloudPlanId ||
      finalCloud.cloudPlanSha256 !== plan.cloudPlanSha256 ||
      finalCloud.absence !== 'absent'
    )
      throw new Error('Final native cloud absence did not converge');
    const receipt = {
      status: 'ce-retired-supporting-infrastructure-unverified' as const,
      owner: storage.owner,
      planSha256: plan.planSha256,
      sourcePlanSha256: base.planSha256,
      cloudPlanSha256: plan.cloudPlanSha256,
      completed,
      cloudInventory: 'absent' as const,
      observedAt: new Date().toISOString(),
    };
    await storage.write(`${plan.planId}-receipt.json`, receipt);
    await storage.write('aws-native-teardown-receipt.json', receipt);
    return receipt;
  } finally {
    await release();
  }
}

export async function runAwsNativeTeardown(
  base: AwsCePlan,
  cloud: AwsCePlan,
  plan: AwsNativeTeardownPlan,
  authorizedPlanSha256: string,
  runtime: CeRuntime,
  contract: VerifiedIngressContract,
  storage: CeDeploymentStore,
  retireCloud: NativeTeardownDriver['retireCloud'],
  signal?: AbortSignal,
) {
  const bindings = siteBindings(base);
  const binding = (site: Retirement) => {
    const selected = bindings.find((row) => row.site.name === site.siteName);
    if (!selected) throw new Error('Native teardown site is outside deployment');
    return selected.binding;
  };
  if (runtime.engine !== 'native') throw new Error('Native engine required for teardown');
  return coordinateAwsNativeTeardown(
    base,
    cloud,
    plan,
    authorizedPlanSha256,
    storage,
    {
      engine: 'native',
      siteContractFingerprint: runtime.contract.fingerprint,
      ingressContractFingerprint: contract.fingerprint,
      drain: (signal) => runtime.drainPlatform(plan.drain, contract, storage, signal),
      retireCloud,
      observeSite: (site, signal) =>
        runtime.observeSiteDeletion(
          binding(site),
          { siteUid: site.siteUid, physicalSiteUid: site.physicalSiteUid },
          signal,
        ),
      revokeToken: (site, token, signal) => runtime.deleteBootstrapToken(binding(site), token.node, token.name, signal),
      deleteSite: (site, signal) => runtime.deleteSiteExact(binding(site), site.siteUid, signal),
    },
    signal,
  );
}
