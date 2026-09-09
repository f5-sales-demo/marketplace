import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CePlatformDrainPlan } from '../../../platform/src/ce/platform-drain';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { TerraformSession } from '../../../terraform/src/service';
import { type AwsExecApi, execAwsJson } from '../aws/exec';
import { verifyAwsCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { scopedAwsApi } from './scoped-exec';
import { collectAwsTerraformAbsence } from './terraform-absence';
import { runAwsTerraformCloudTeardown } from './terraform-cloud-teardown';
import type { AwsTerraformRetirementInventory } from './terraform-retirement-inventory';
import { siteBindings } from './topology';
import type { AwsCePlan } from './types';

interface Retirement {
  siteName: string;
  siteUid: string;
  physicalSiteUid: string;
  tokens: Array<{ node: string; name: string }>;
}
export interface AwsTerraformTeardownPlan {
  schemaVersion: 1;
  kind: 'aws-ce-terraform-teardown';
  engine: 'terraform';
  sourcePlanSha256: string;
  drain: CePlatformDrainPlan;
  retirement: Retirement[];
  planId: string;
  planSha256: string;
}
const name = (value: unknown) => typeof value === 'string' && /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value);
const uid = (value: unknown) => typeof value === 'string' && !!value.trim();
export function compileAwsTerraformTeardown(
  base: AwsCePlan,
  drain: CePlatformDrainPlan,
  retirement: Retirement[],
): AwsTerraformTeardownPlan {
  verifyAwsCePlan(base);
  const selected = siteBindings(base);
  if (
    base.engine !== 'terraform' ||
    drain?.schemaVersion !== 1 ||
    drain.sourcePlanSha256 !== base.planSha256 ||
    canonicalSha256(drain.owner) !== canonicalSha256(selected[0].binding.owner) ||
    !Array.isArray(drain.sites) ||
    drain.sites.length !== selected.length ||
    !Array.isArray(retirement) ||
    retirement.length !== selected.length ||
    !Array.isArray(base.actions)
  )
    throw new Error('Terraform teardown source or topology differs');
  const peers = base.actions.filter((action) => action.kind === 'tgw-connect-peer-create');
  if (
    !['direct-eni', 'nlb-ingress', 'tgw-static', 'tgw-connect'].includes(base.routing?.profile) ||
    (base.routing.profile === 'tgw-connect' ? !peers.length : !!peers.length)
  )
    throw new Error('Terraform teardown routing source is incomplete');
  const exportPolicies = drain.sites.flatMap((row) => row.routing).filter((row) => row.kind === 'bgp_routing_policy');
  if (exportPolicies.length !== 0 && exportPolicies.length !== selected.length)
    throw new Error('Terraform teardown export-policy inventory is incomplete');
  const seen = new Set<string>();
  const unique = (key: string) => {
    if (seen.has(key)) throw new Error('Duplicate teardown resource identity');
    seen.add(key);
  };
  for (const { site, binding } of selected) {
    const matches = drain.sites.filter((row) => row.binding?.siteName === site.name),
      retired = retirement.filter((row) => row.siteName === site.name);
    if (matches.length !== 1 || retired.length !== 1)
      throw new Error('Terraform teardown site inventory is incomplete');
    const planned = matches[0],
      target = retired[0];
    if (
      canonicalSha256(planned.binding) !== canonicalSha256(binding) ||
      !uid(planned.siteUid) ||
      target.siteUid !== planned.siteUid ||
      !uid(target.physicalSiteUid)
    )
      throw new Error('Terraform teardown site identity differs');
    unique(`uid:${target.siteUid}`);
    unique(`uid:${target.physicalSiteUid}`);
    const expected = peers
      .filter((action) => site.nodeIndexes.includes(action.node ?? 0))
      .map((action) => ({
        kind: 'external_connector',
        name: `${base.deploymentName.slice(0, 24)}-gre-${peers.indexOf(action) + 1}`,
      }));
    if (expected.length) {
      if (exportPolicies.length)
        expected.push({ kind: 'bgp_routing_policy', name: `${site.name.slice(0, 43)}-tgw-export-policy` });
      expected.push({ kind: 'bgp', name: `${site.name.slice(0, 55)}-tgw-bgp` });
    }
    if (
      !Array.isArray(planned.routing) ||
      planned.routing.length !== expected.length ||
      expected.some(
        (row) => planned.routing.filter((value) => value.name === row.name && value.kind === row.kind).length !== 1,
      )
    )
      throw new Error('Terraform teardown routing inventory is incomplete');
    for (const resource of planned.routing) {
      if (!uid(resource.uid)) throw new Error('Routing UID missing');
      unique(`uid:${resource.uid}`);
    }
    if (
      !Array.isArray(target.tokens) ||
      target.tokens.length > 128 ||
      binding.nodes.some((node) => !target.tokens.some((token) => token.node === node))
    )
      throw new Error('Bootstrap token inventory is incomplete');
    for (const token of target.tokens) {
      if (!binding.nodes.includes(token.node) || !name(token.name)) throw new Error('Bootstrap token scope differs');
      unique(`token:${token.name}`);
    }
  }
  const draft = {
    schemaVersion: 1 as const,
    kind: 'aws-ce-terraform-teardown' as const,
    engine: 'terraform' as const,
    sourcePlanSha256: base.planSha256,
    drain: structuredClone(drain),
    retirement: structuredClone(retirement),
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `aws-ce-teardown-${planSha256.slice(0, 24)}`, planSha256 };
}
interface Driver {
  readonly engine: 'terraform';
  readonly siteContractFingerprint: string;
  readonly ingressContractFingerprint: string;
  drain(signal?: AbortSignal): Promise<{ status: 'platform-drained' | 'pending-origin' }>;
  retireCloud(
    signal?: AbortSignal,
  ): Promise<{ status: 'terraform-state-retired'; sourcePlanSha256: string; finalPlanSha256: string }>;
  observeSite(site: Retirement, signal?: AbortSignal): Promise<{ status: 'deleted' | 'pending' | 'unknown' }>;
  revokeToken(site: Retirement, token: Retirement['tokens'][number], signal?: AbortSignal): Promise<void>;
  deleteSite(site: Retirement, signal?: AbortSignal): Promise<unknown>;
}
type Storage = Pick<CeDeploymentStore, 'owner' | 'verify' | 'read' | 'write'>;
/** Internal coordinator; cloud absence and supporting workload/transit cleanup remain independent evidence. */
export async function coordinateAwsTerraformTeardown(
  base: AwsCePlan,
  input: AwsTerraformTeardownPlan,
  authorizedPlanSha256: string,
  storage: Storage,
  driver: Driver,
  signal?: AbortSignal,
) {
  base = structuredClone(base);
  const plan = structuredClone(input);
  const compiled = compileAwsTerraformTeardown(base, plan.drain, plan.retirement);
  const validate = async () => {
    signal?.throwIfAborted();
    await storage.verify();
    if (
      canonicalSha256(compiled) !== canonicalSha256(plan) ||
      authorizedPlanSha256 !== plan.planSha256 ||
      canonicalSha256(storage.owner) !== canonicalSha256(plan.drain.owner) ||
      driver.engine !== 'terraform' ||
      driver.siteContractFingerprint !== plan.drain.siteContractFingerprint ||
      driver.ingressContractFingerprint !== plan.drain.ingressContractFingerprint
    )
      throw new Error('Terraform teardown ownership, authorization or contract differs');
  };
  await validate();
  let saved: unknown;
  try {
    saved = await storage.read('aws-terraform-teardown-source.json');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (saved === undefined) await storage.write('aws-terraform-teardown-source.json', plan);
  else if (!saved || canonicalSha256(saved) !== canonicalSha256(plan))
    throw new Error('Persisted Terraform teardown source differs');
  const completed: string[] = [];
  const checkpoint = () =>
    storage.write('aws-terraform-teardown-progress.json', {
      schemaVersion: 1,
      planSha256: plan.planSha256,
      completed: [...completed],
      observedAt: new Date().toISOString(),
    });
  // Always re-observe the idempotent stages; a forged or stale progress row cannot authorize skipping drain.
  const drained = await driver.drain(signal);
  if (drained.status !== 'platform-drained')
    return { status: 'pending-platform-drain' as const, cloudInventory: 'unknown' as const };
  completed.push('platform-drained');
  await checkpoint();
  await validate();
  const cloud = await driver.retireCloud(signal);
  if (
    cloud.status !== 'terraform-state-retired' ||
    cloud.sourcePlanSha256 !== base.planSha256 ||
    !/^[a-f0-9]{64}$/.test(cloud.finalPlanSha256)
  )
    throw new Error('Cloud retirement did not produce a bound no-change receipt');
  completed.push('terraform-state-retired');
  await checkpoint();
  for (const site of plan.retirement) {
    await validate();
    if (!['pending', 'deleted'].includes((await driver.observeSite(site, signal)).status))
      throw new Error('Site retirement identity evidence is unknown');
    for (const token of site.tokens) {
      await validate();
      await driver.revokeToken(site, token, signal);
      completed.push(`token:${token.name}`);
      await checkpoint();
    }
    await validate();
    await driver.deleteSite(site, signal);
    const observation = await driver.observeSite(site, signal);
    if (observation.status !== 'deleted')
      return {
        status: 'pending-site-retirement' as const,
        siteName: site.siteName,
        cloudInventory: 'unknown' as const,
      };
    completed.push(`site:${site.siteName}`);
    await checkpoint();
  }
  await validate();
  // Refresh again after the last F5 mutation; the last receipt belongs to the final workflow state.
  const finalCloud = await driver.retireCloud(signal);
  if (
    finalCloud.status !== 'terraform-state-retired' ||
    finalCloud.sourcePlanSha256 !== base.planSha256 ||
    !/^[a-f0-9]{64}$/.test(finalCloud.finalPlanSha256)
  )
    throw new Error('Final Terraform refresh did not converge');
  const receipt = {
    status: 'resources-retired-awaiting-inventory' as const,
    owner: storage.owner,
    planSha256: plan.planSha256,
    sourcePlanSha256: base.planSha256,
    finalPlanSha256: finalCloud.finalPlanSha256,
    completed,
    cloudInventory: 'unknown' as const,
    observedAt: new Date().toISOString(),
  };
  await storage.write('aws-terraform-teardown-receipt.json', receipt);
  return receipt;
}
/** Verify live scoped credentials before draining platform resources. */
export async function verifyAwsTeardownCredentials(base: AwsCePlan, rawApi: AwsExecApi, signal?: AbortSignal) {
  signal?.throwIfAborted();
  verifyAwsCePlan(base);
  if (base.engine !== 'terraform') throw new Error('Terraform engine required for teardown');
  const api = scopedAwsApi(rawApi, base.intent.awsProfile, signal);
  const identity = await execAwsJson<unknown>(
    api,
    ['sts', 'get-caller-identity', '--region', base.intent.region],
    signal,
  );
  signal?.throwIfAborted();
  if (
    !identity ||
    typeof identity !== 'object' ||
    Array.isArray(identity) ||
    (identity as Record<string, unknown>).Account !== base.intent.accountId
  )
    throw new Error('AWS teardown credential account is missing or differs');
}
/** Concrete production binding: F5 operations stay in platform; cloud mutation uses the owning Terraform session. */
export async function runAwsTerraformTeardown(
  base: AwsCePlan,
  plan: AwsTerraformTeardownPlan,
  authorizedPlanSha256: string,
  runtime: CeRuntime,
  contract: VerifiedIngressContract,
  session: TerraformSession,
  storage: CeDeploymentStore,
  api: AwsExecApi,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
) {
  base = structuredClone(base);
  plan = structuredClone(plan);
  const bindings = siteBindings(base);
  const binding = (site: Retirement) => {
    const found = bindings.find((row) => row.site.name === site.siteName);
    if (!found) throw new Error('Teardown site is outside deployment');
    return found.binding;
  };
  if (runtime.engine !== 'terraform') throw new Error('Terraform engine required for teardown');
  await verifyAwsTeardownCredentials(base, api, signal);
  const retired = await coordinateAwsTerraformTeardown(
    base,
    plan,
    authorizedPlanSha256,
    storage,
    {
      engine: 'terraform',
      siteContractFingerprint: runtime.contract.fingerprint,
      ingressContractFingerprint: contract.fingerprint,
      drain: (signal) => runtime.drainPlatform(plan.drain, contract, storage, signal),
      retireCloud: (signal) => runAwsTerraformCloudTeardown(base, session, storage, api, env, signal),
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
  if (retired.status !== 'resources-retired-awaiting-inventory') return retired;
  const inventory = (await storage.read('terraform-cloud-teardown-inventory.json')) as AwsTerraformRetirementInventory;
  const observation = await collectAwsTerraformAbsence(base, inventory, api, signal);
  await storage.write('aws-terraform-teardown-cloud-absence.json', observation);
  return {
    ...retired,
    status:
      observation.status === 'absent-or-retired'
        ? ('ce-retired-supporting-infrastructure-unverified' as const)
        : ('pending-cloud-inventory' as const),
    cloudInventory: observation.status,
  };
}
