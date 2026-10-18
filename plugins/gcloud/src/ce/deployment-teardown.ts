import { join } from 'node:path';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { GcloudExecApi } from '../gcloud/exec';
import { GCP_CE_API_RELEASE, type GcpCeContractBoundary } from './contract';
import { fingerprint } from './discovery';
import { applyGcpNativeTeardown } from './native-teardown';
import { assertGcpResourceOwnership, type GcpResourceIdentity, readGcpResourceInventory } from './ownership';
import type { GcpPolicyReceipt } from './policy';
import { planGcpOwnedTeardown } from './teardown-plan';
import type { GcpCeIntent } from './types';
import { validateIntent } from './validation';

function profile(intent: GcpCeIntent, contract: GcpCeContractBoundary) {
  validateIntent(intent);
  if (intent.engine !== 'native') throw new Error('Teardown requires owning engine native');
  if (!contract.singleNodeLifecycle || fingerprint(contract.release) !== fingerprint(GCP_CE_API_RELEASE))
    throw new Error('Qualified immutable teardown contract required');
  if (
    intent.sites.length !== 1 ||
    intent.sites[0].nodes.length !== 1 ||
    intent.sites[0].nodes[0].interfaces.length !== 2 ||
    intent.sites[0].nodes[0].interfaces[1].role !== 'sli' ||
    intent.egress.mode !== 'external-ip' ||
    intent.ingress.profile !== 'none' ||
    intent.routing.profile !== 'static-insertion' ||
    intent.routing.destinationCidrs.length !== 0
  )
    throw new Error('Qualified disposable single-node teardown profile required');
}
async function storage(platform: CePlatformService, intent: GcpCeIntent) {
  const store = await platform.storage({
    deploymentId: intent.deploymentName,
    provider: 'gcp',
    engine: 'native',
    account: intent.project,
    region: intent.region,
  });
  const saved = (await store.read('gcp-deployment-intent.json')) as {
    intent?: GcpCeIntent;
    intentFingerprint?: string;
    platformContext?: string;
  };
  if (
    !saved.intent ||
    saved.intentFingerprint !== fingerprint(intent) ||
    fingerprint(saved.intent) !== fingerprint(intent) ||
    saved.platformContext !== intent.platformContext
  )
    throw new Error('Persisted teardown deployment context differs');
  return store;
}
function topology(intent: GcpCeIntent, resources: GcpResourceIdentity[]) {
  const node = intent.sites[0].nodes[0],
    site = intent.sites[0].name;
  const prefix = `https://www.googleapis.com/compute/v1/projects/${intent.project}`;
  const required = [
    `${prefix}/zones/${node.zone}/instances/${node.name}`,
    ...node.interfaces.flatMap((nic) => [
      `${prefix}/global/networks/${nic.network}`,
      `${prefix}/regions/${intent.region}/subnetworks/${nic.subnet}`,
    ]),
  ];
  const disks = resources.filter((resource) => resource.kind === 'disk');
  if (
    resources.length !== 6 ||
    disks.length !== 1 ||
    disks[0].nodeName !== node.name ||
    disks[0].siteName !== site ||
    !disks[0].selfLink.startsWith(`${prefix}/zones/${node.zone}/disks/`) ||
    required.some((link) => resources.filter((r) => r.selfLink === link).length !== 1)
  )
    throw new Error('Complete disposable teardown topology required');
}
async function observe(api: GcloudExecApi, resource: GcpResourceIdentity, signal?: AbortSignal) {
  const parts = resource.selfLink.split('/'),
    scope = parts[7],
    location = parts[8],
    name = parts.at(-1) as string;
  const base =
    resource.kind === 'subnetwork'
      ? ['compute', 'networks', 'subnets']
      : ['compute', resource.kind === 'instance' ? 'instances' : resource.kind === 'disk' ? 'disks' : 'networks'];
  const response = await api.exec(
    'gcloud',
    [
      ...base,
      'describe',
      name,
      `--project=${resource.project}`,
      ...(scope === 'zones' ? [`--zone=${location}`] : scope === 'regions' ? [`--region=${location}`] : []),
      '--format=json(id,selfLink)',
    ],
    { signal },
  );
  signal?.throwIfAborted();
  if (response.exitCode !== 0) {
    if (/\b404\b|was not found|not found/i.test(response.stderr)) return null;
    throw new Error('Teardown ownership observation unavailable');
  }
  const result = JSON.parse(response.stdout) as { id: string; selfLink: string };
  return { id: String(result.id), selfLink: result.selfLink };
}
function policyFresh(policy: GcpPolicyReceipt) {
  const age = Date.now() - Date.parse(policy.observedAt);
  if (
    policy.identity !== 'f5xc-ce-automation-policy/v2' ||
    !/^sha256:[a-f0-9]{64}$/.test(policy.normalizedSha256) ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > 5 * 60_000
  )
    throw new Error('Current teardown policy required');
}
export async function planGcpDeploymentTeardown(
  platform: CePlatformService,
  api: GcloudExecApi,
  intent: GcpCeIntent,
  contract: GcpCeContractBoundary,
  policy: GcpPolicyReceipt,
  signal?: AbortSignal,
) {
  profile(intent, contract);
  policyFresh(policy);
  signal?.throwIfAborted();
  if (!platform.gcpLifecycle) throw new Error('Qualified shared teardown lifecycle unavailable');
  const store = await storage(platform, intent),
    resources = await readGcpResourceInventory(store, intent);
  topology(intent, resources);
  const cloud = planGcpOwnedTeardown(resources, {
    project: intent.project,
    region: intent.region,
    deploymentName: intent.deploymentName,
    engine: 'native',
  });
  const sources = [];
  for (const resource of resources) {
    const live = await observe(api, resource, signal);
    if (!live) throw new Error('Initial teardown planning requires complete live inventory');
    await assertGcpResourceOwnership(store, resource, live);
    sources.push({ source: resource.selfLink, sha256: fingerprint(live) });
  }
  const lifecycle = await platform.gcpLifecycle(
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
  const node = intent.sites[0].nodes[0],
    tokenName = `${node.name}-token`;
  const binding = await lifecycle.observeTeardown(tokenName, signal);
  const body = {
    schemaVersion: 1 as const,
    operation: 'teardown' as const,
    engine: 'native' as const,
    intentFingerprint: fingerprint(intent),
    deploymentName: intent.deploymentName,
    project: intent.project,
    region: intent.region,
    platformContext: intent.platformContext,
    apiRelease: contract.release,
    policyReceipt: policy,
    createdAt: new Date().toISOString(),
    cloud,
    platform: binding,
    sourceReceipts: sources,
    approval: 'required' as const,
    independentAbsence: 'required' as const,
  };
  const plan = { ...body, planHash: fingerprint(body) };
  await store.write(`gcp-reviewed-${plan.planHash.slice(7)}.json`, plan);
  return plan;
}
export type GcpDeploymentTeardownPlan = Awaited<ReturnType<typeof planGcpDeploymentTeardown>>;
export async function applyGcpDeploymentTeardown(
  platform: CePlatformService,
  api: GcloudExecApi,
  intent: GcpCeIntent,
  approvedHash: string,
  contract: GcpCeContractBoundary,
  policy: GcpPolicyReceipt,
  signal?: AbortSignal,
  onMutation?: () => void,
) {
  profile(intent, contract);
  policyFresh(policy);
  signal?.throwIfAborted();
  if (!/^sha256:[a-f0-9]{64}$/.test(approvedHash) || !platform.gcpLifecycle)
    throw new Error('Exact reviewed teardown authorization required');
  const store = await storage(platform, intent);
  const plan = (await store.read(`gcp-reviewed-${approvedHash.slice(7)}.json`)) as GcpDeploymentTeardownPlan;
  const { planHash, ...body } = plan;
  if (
    planHash !== approvedHash ||
    fingerprint(body) !== approvedHash ||
    plan.intentFingerprint !== fingerprint(intent) ||
    fingerprint(plan.apiRelease) !== fingerprint(contract.release) ||
    plan.policyReceipt.normalizedSha256 !== policy.normalizedSha256
  )
    throw new Error('Reviewed teardown plan/contract differs');
  const authorizationName = `gcp-authorized-${approvedHash.slice(7)}.json`;
  let authorization: { planHash?: string } | undefined;
  try {
    authorization = (await store.read(authorizationName)) as typeof authorization;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const age = Date.now() - Date.parse(plan.createdAt);
  if (authorization ? authorization.planHash !== approvedHash : !Number.isFinite(age) || age < 0 || age > 5 * 60_000)
    throw new Error('Teardown authorization missing or review stale');
  const release = await acquireProcessLock(join(store.directory, '.gcp-deployment-lock'));
  try {
    const resources = await readGcpResourceInventory(store, intent);
    topology(intent, resources);
    if (
      fingerprint(plan.cloud.resources.slice().sort((a, b) => a.selfLink.localeCompare(b.selfLink))) !==
      fingerprint(resources.slice().sort((a, b) => a.selfLink.localeCompare(b.selfLink)))
    )
      throw new Error('Reviewed teardown inventory differs');
    // Validate all resources before the first deletion, including later dependency targets.
    for (const resource of resources) {
      const live = await observe(api, resource, signal);
      if (live) await assertGcpResourceOwnership(store, resource, live);
    }
    const lifecycle = await platform.gcpLifecycle(
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
    const current = await lifecycle.observeTeardown(plan.platform.tokenName, signal);
    if (
      current.siteUid !== plan.platform.siteUid ||
      (plan.platform.siteAbsent && !current.siteAbsent) ||
      (!current.tokenAbsent && current.tokenIdentityHash !== plan.platform.tokenIdentityHash)
    )
      throw new Error('Reviewed teardown platform identity differs');
    await store.write(authorizationName, { planHash: approvedHash });
    const mutatingApi: GcloudExecApi = {
      exec: async (command, args, options) => {
        if (args.includes('delete')) onMutation?.();
        return api.exec(command, args, options);
      },
    };
    const shared = {
      read: (name: string) => store.read(name),
      write: (name: string, value: unknown) => store.write(name, value),
      exclusive: async <T>(fn: () => Promise<T>) => fn(),
    };
    const outcome = await applyGcpNativeTeardown(shared, mutatingApi, plan.cloud, plan.cloud.sha256, signal);
    if (outcome.state !== 'done') return { state: 'pending', phase: 'cloud', planHash: approvedHash };
    const token = current.tokenAbsent
      ? { absent: true }
      : await (async () => {
          onMutation?.();
          return lifecycle.revokeToken(plan.platform.tokenName, signal, plan.platform.tokenIdentityHash);
        })();
    if (!token.absent) return { state: 'pending', phase: 'token-revocation', planHash: approvedHash };
    const site = current.siteAbsent
      ? { absent: true }
      : await (async () => {
          onMutation?.();
          return lifecycle.deleteSite(signal);
        })();
    if (!site.absent) return { state: 'pending', phase: 'site-deletion', planHash: approvedHash };
    // Fresh absence reads after cloud and platform teardown; no label-based deletion.
    for (const resource of resources)
      if (await observe(api, resource, signal)) throw new Error('Independent cloud absence check failed');
    const absence = await lifecycle.observeTeardown(plan.platform.tokenName, signal);
    if (!absence.siteAbsent || !absence.tokenAbsent) throw new Error('Independent platform absence check failed');
    const evidence = {
      schemaVersion: 1,
      engine: 'native',
      deploymentName: intent.deploymentName,
      planHash: approvedHash,
      observedAt: new Date().toISOString(),
      cloudAbsent: resources.length,
      siteAbsent: true,
      tokenAbsent: true,
      state: 'done' as const,
    };
    await store.write(`gcp-evidence-${approvedHash.slice(7)}.json`, evidence);
    return evidence;
  } finally {
    await release();
  }
}
