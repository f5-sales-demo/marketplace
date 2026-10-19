import { join } from 'node:path';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { GcloudExecApi } from '../gcloud/exec';
import { assertGcpByolAuthorization, fetchGcpByolDocument } from './byol-terms';
import { translateGcpNativeCompute } from './compute-plan';
import { type GcpCeContractBoundary, resolveGcpContract } from './contract';
import {
  assertGcpCorporateFundingCurrent,
  collectCurrentGcpCorporateFunding,
  type GcpCorporateFundingReceipt,
} from './corporate-funding';
import { assertGcpTeardownPolicyFresh, assertGcpTeardownProfile } from './deployment-teardown';
import { discoverGcp, fingerprint } from './discovery';
import { createGcpNativeCreationDriver } from './native-create-driver';
import { applyGcpNativeDeployment } from './native-deploy';
import { planGcpCe } from './planner';
import { type GcpPolicyReceipt, readGcpCePolicy } from './policy';
import { collectGcpLaunchPreflight, type GcpLaunchPreflight } from './preflight';
import { createGcpPreflightPort } from './preflight-port';
import type { GcpQualificationGates } from './qualification-gates';
import type { GcpCeDiscovery, GcpCeIntent } from './types';

/** Dependencies are implementation ports. They are never exposed as tool arguments. */
export interface GcpDeploymentSources {
  contract(signal?: AbortSignal): Promise<GcpCeContractBoundary>;
  policy(): Promise<GcpPolicyReceipt>;
  discovery(intent: GcpCeIntent, signal?: AbortSignal): Promise<GcpCeDiscovery>;
  preflight(intent: GcpCeIntent, signal?: AbortSignal): Promise<GcpLaunchPreflight>;
  funding(intent: GcpCeIntent, signal?: AbortSignal): Promise<GcpCorporateFundingReceipt>;
  byol(
    intent: GcpCeIntent,
    funding: GcpCorporateFundingReceipt,
    signal?: AbortSignal,
  ): Promise<{ authorizationHash: string }>;
}
export function createGcpDeploymentSources(platform: CePlatformService, api: GcloudExecApi): GcpDeploymentSources {
  return {
    contract: (signal) => resolveGcpContract(undefined, signal),
    policy: readGcpCePolicy,
    discovery: (intent, signal) => discoverGcp(api, intent.project, intent.region, signal),
    preflight: (intent, signal) =>
      collectGcpLaunchPreflight(intent, createGcpPreflightPort(api, intent.project), signal),
    funding: (intent, signal) => collectCurrentGcpCorporateFunding(api, intent.project, signal),
    byol: async (intent, funding, signal) =>
      assertGcpByolAuthorization(
        intent,
        { query: createGcpPreflightPort(api, intent.project).query, document: fetchGcpByolDocument },
        funding,
        await storage(platform, intent),
        signal,
      ),
  };
}
function storage(platform: CePlatformService, intent: GcpCeIntent) {
  return platform.storage({
    deploymentId: intent.deploymentName,
    provider: 'gcp',
    engine: intent.engine,
    account: intent.project,
    region: intent.region,
  });
}
function profile(intent: GcpCeIntent, boundary: GcpCeContractBoundary, platform: CePlatformService) {
  assertGcpTeardownProfile(intent, boundary);
  if (intent.operation !== 'deploy' || intent.machineType !== 'n2-standard-8' || !intent.image.name.endsWith('-byol'))
    throw new Error('Qualified native single-node BYOL deployment profile required');
  if (!platform.gcpLifecycle) throw new Error('Qualified native shared deployment runtime unavailable');
}
export function fundingBinding(funding: GcpCorporateFundingReceipt) {
  return {
    project: funding.project,
    billingAccountName: funding.billingAccountName,
    policySha256: funding.policySha256,
    accountDomain: funding.accountDomain,
    organizationDomain: funding.organizationDomain,
  };
}
export async function collectGcpDeploymentPrerequisites(
  platform: CePlatformService,
  intent: GcpCeIntent,
  sources: GcpDeploymentSources,
  signal?: AbortSignal,
  resume = false,
  engine: 'native' | 'terraform' = 'native',
) {
  signal?.throwIfAborted();
  const boundary = await sources.contract(signal);
  if (engine === 'native') profile(intent, boundary, platform);
  else {
    assertGcpTeardownProfile(intent, boundary, 'terraform');
    if (
      intent.operation !== 'deploy' ||
      intent.machineType !== 'n2-standard-8' ||
      !intent.image.name.endsWith('-byol') ||
      !platform.gcpObservations
    )
      throw new Error('Qualified Terraform single-node BYOL profile required');
  }
  const policy = await sources.policy();
  assertGcpTeardownPolicyFresh(policy);
  const discovery = await sources.discovery(intent, signal);
  const preflight = await sources.preflight(intent, signal);
  const funding = await sources.funding(intent, signal);
  // Reuse scope, image, minimum sizing and source freshness validation.
  planGcpCe(intent, discovery, Date.now(), policy, preflight, funding);
  if (
    discovery.billingEnabled !== true ||
    !['compute.googleapis.com', 'serviceusage.googleapis.com'].every((api) => discovery.enabledApis.includes(api))
  )
    throw new Error('Deployment billing/APIs unavailable');
  if (
    ['iam', ...(resume ? [] : ['quota']), 'organizationPolicy', 'image', 'machineNicLimit', 'zone'].some(
      (key) => preflight.checks[key as keyof typeof preflight.checks] !== 'verified',
    ) ||
    preflight.checks.licenseUseFee !== 'none'
  )
    throw new Error('Current deployment prerequisites unavailable');
  const byol = await sources.byol(intent, funding, signal);
  if (!/^sha256:[a-f0-9]{64}$/.test(byol.authorizationHash)) throw new Error('Exact BYOL authorization required');
  return { boundary, policy, discovery, preflight, funding, byol };
}

/** Public review authorizes cloud creation only; observational health and traffic stay separate. */
export async function planGcpDeploymentReview(
  platform: CePlatformService,
  api: GcloudExecApi,
  intent: GcpCeIntent,
  sources = createGcpDeploymentSources(platform, api),
  signal?: AbortSignal,
) {
  intent = structuredClone(intent);
  const current = await collectGcpDeploymentPrerequisites(platform, intent, sources, signal);
  const cloud = translateGcpNativeCompute(intent);
  const store = await storage(platform, intent);
  const release = await acquireProcessLock(join(store.directory, '.gcp-review-lock'));
  try {
    const identity = { intent, intentFingerprint: fingerprint(intent), platformContext: intent.platformContext };
    let prior: unknown;
    try {
      prior = await store.read('gcp-deployment-intent.json');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (prior && fingerprint(prior) !== fingerprint(identity)) throw new Error('Persisted native intent differs');
    if (!prior) await store.write('gcp-deployment-intent.json', identity);
    // Constructing the scoped lifecycle verifies context and executable mappings without mutation.
    const lifecycle = await platform.gcpLifecycle?.(
      {
        deploymentId: intent.deploymentName,
        provider: 'gcp',
        engine: 'native',
        account: intent.project,
        region: intent.region,
      },
      intent.platformContext,
      signal,
    );
    if (!lifecycle) throw new Error('Scoped native lifecycle unavailable');
    // An empty observation is valid before the first creation. Existing objects still
    // require the original ownership checkpoint and cannot be adopted by name or label.
    const objects = await lifecycle.observeTeardown(`${intent.sites[0].nodes[0].name}-token`, signal);
    if (!objects.siteAbsent || !objects.tokenAbsent) throw new Error('Deployment site/token already exists');
    const driver = createGcpNativeCreationDriver(
      api,
      {
        read: (name) => store.read(name),
        write: (name, value) => store.write(name, value),
        exclusive: async (fn) => fn(),
      },
      store.directory,
      intent,
    );
    for (const action of cloud.actions)
      if (await driver.observe(action, signal)) throw new Error('Deployment cloud resource already exists');
    const body = {
      schemaVersion: 1 as const,
      operation: 'deploy' as const,
      engine: 'native' as const,
      intent,
      intentFingerprint: fingerprint(intent),
      platformContext: intent.platformContext,
      apiRelease: current.boundary.release,
      contractFingerprint: current.boundary.fingerprint,
      lifecycleFingerprint: fingerprint(current.boundary.singleNodeLifecycle),
      policyReceipt: current.policy,
      funding: fundingBinding(current.funding),
      byolAuthorizationHash: current.byol.authorizationHash,
      discoveryFingerprint: fingerprint(current.discovery),
      preflight: current.preflight,
      cloud,
      createdAt: new Date().toISOString(),
      approval: 'required' as const,
      capacity: 'not-reserved' as const,
      routing: 'unknown' as const,
      applicationTraffic: 'unknown' as const,
    };
    const plan = { ...body, planHash: fingerprint(body) };
    await store.write(`gcp-deploy-reviewed-${plan.planHash.slice(7)}.json`, plan);
    return plan;
  } finally {
    await release();
  }
}
export type GcpDeploymentReview = Awaited<ReturnType<typeof planGcpDeploymentReview>>;

export async function applyGcpDeploymentReview(
  platform: CePlatformService,
  api: GcloudExecApi,
  intent: GcpCeIntent,
  approvedHash: string,
  sources = createGcpDeploymentSources(platform, api),
  signal?: AbortSignal,
  onMutation?: () => void,
  execute = applyGcpNativeDeployment,
) {
  intent = structuredClone(intent);
  signal?.throwIfAborted();
  if (!/^sha256:[a-f0-9]{64}$/.test(approvedHash)) throw new Error('Exact deployment review hash required');
  const boundary = await sources.contract(signal);
  profile(intent, boundary, platform);
  const store = await storage(platform, intent);
  const release = await acquireProcessLock(join(store.directory, '.gcp-review-lock'));
  try {
    const plan = (await store.read(`gcp-deploy-reviewed-${approvedHash.slice(7)}.json`)) as GcpDeploymentReview;
    const { planHash, ...body } = plan;
    if (
      planHash !== approvedHash ||
      fingerprint(body) !== approvedHash ||
      plan.schemaVersion !== 1 ||
      plan.operation !== 'deploy' ||
      plan.engine !== 'native' ||
      plan.intentFingerprint !== fingerprint(intent) ||
      fingerprint(plan.intent) !== fingerprint(intent) ||
      plan.platformContext !== intent.platformContext ||
      fingerprint(plan.apiRelease) !== fingerprint(boundary.release) ||
      plan.contractFingerprint !== boundary.fingerprint ||
      plan.lifecycleFingerprint !== fingerprint(boundary.singleNodeLifecycle) ||
      fingerprint(plan.cloud) !== fingerprint(translateGcpNativeCompute(intent))
    )
      throw new Error('Reviewed deployment intent/contract/translation differs');
    const name = `gcp-deploy-authorized-${approvedHash.slice(7)}.json`;
    let authorization: { planHash?: string; intentFingerprint?: string } | undefined;
    try {
      authorization = (await store.read(name)) as typeof authorization;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const age = Date.now() - Date.parse(plan.createdAt);
    let original: { planHash?: string; intentFingerprint?: string } | undefined;
    try {
      original = (await store.read('gcp-deploy-original-authorization.json')) as typeof original;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (original && (original.planHash !== approvedHash || original.intentFingerprint !== fingerprint(intent)))
      throw new Error('Deployment must resume original overall authorization');
    if (authorization && !original) throw new Error('Deployment original authorization unavailable');
    if (
      authorization
        ? authorization.planHash !== approvedHash || authorization.intentFingerprint !== fingerprint(intent)
        : !Number.isFinite(age) || age < 0 || age > 5 * 60_000
    )
      throw new Error('Deployment authorization differs or review stale');
    const policy = await sources.policy();
    assertGcpTeardownPolicyFresh(policy);
    if (policy.normalizedSha256 !== plan.policyReceipt.normalizedSha256) throw new Error('Reviewed policy changed');
    const funding = await sources.funding(intent, signal);
    assertGcpCorporateFundingCurrent(funding, intent.project, plan.funding.billingAccountName);
    if (fingerprint(fundingBinding(funding)) !== fingerprint(plan.funding))
      throw new Error('Reviewed corporate funding changed');
    const byol = await sources.byol(intent, funding, signal);
    if (byol.authorizationHash !== plan.byolAuthorizationHash) throw new Error('Reviewed BYOL authorization changed');
    {
      // Revalidate image, APIs, IAM, policy and zone on every invocation. Only initial launch
      // repeats free-quota checks; resume reconciles resources already admitted by the journal.
      const launch = await collectGcpDeploymentPrerequisites(platform, intent, sources, signal, !!authorization);
      if (
        fingerprint(fundingBinding(launch.funding)) !== fingerprint(plan.funding) ||
        launch.byol.authorizationHash !== plan.byolAuthorizationHash ||
        launch.policy.normalizedSha256 !== plan.policyReceipt.normalizedSha256 ||
        launch.boundary.fingerprint !== plan.contractFingerprint
      )
        throw new Error('Launch binding changed during qualification');
      signal?.throwIfAborted();
      if (!authorization) {
        const launchAge = Date.now() - Date.parse(plan.createdAt);
        if (!Number.isFinite(launchAge) || launchAge < 0 || launchAge > 5 * 60_000)
          throw new Error('Deployment review expired during qualification');
        const binding = { planHash: approvedHash, intentFingerprint: fingerprint(intent) };
        if (!original) await store.write('gcp-deploy-original-authorization.json', binding);
        await store.write(name, binding);
      }
    }
    const gates: GcpQualificationGates = {
      schemaVersion: 1,
      project: intent.project,
      region: intent.region,
      engine: 'native',
      approvalPlanHash: plan.cloud.sha256,
      apiContract: {
        publication: 'immutable-release',
        gcpMapping: 'available',
        sha256: boundary.release.contractDigest,
      },
      policy: { identity: policy.identity, sha256: policy.normalizedSha256, verified: true },
      fundingReceipt: funding,
      sharedRuntime: true,
      exactImageVerified: true,
      legalAcceptance: 'authorized-for-access-or-use',
      iamVerified: true,
      quotaVerified: true,
      organizationPolicyVerified: true,
      providerLocksVerified: false,
    };
    const outcome = await execute(
      platform,
      api,
      intent,
      plan.cloud.sha256,
      gates,
      signal,
      async () => funding,
      onMutation,
    );
    return {
      ...outcome,
      planHash: approvedHash,
      engine: 'native' as const,
      cloudProvisioning: outcome.state === 'done' ? 'created' : 'pending',
      registration: 'unknown',
      physicalInterfaceIdentity: 'unknown',
      platformHealth: 'unknown',
      routing: 'unknown',
      applicationTraffic: 'unknown',
    };
  } finally {
    await release();
  }
}
