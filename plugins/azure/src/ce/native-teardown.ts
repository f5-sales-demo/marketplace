import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CePlatformDrainPlan } from '../../../platform/src/ce/platform-drain';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { AzExecApi } from '../az/exec';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { type AzureTeardownRetirement, collectAzureTeardownMaterial } from './terraform-teardown';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

export interface AzureNativeTeardownPlan {
  schemaVersion: 1;
  kind: 'azure-ce-native-teardown';
  engine: 'native';
  sourcePlanSha256: string;
  cloudPlanId: string;
  cloudPlanSha256: string;
  drain: CePlatformDrainPlan;
  retirement: AzureTeardownRetirement[];
  planId: string;
  planSha256: string;
}

function validateCloudPlan(base: AzureCePlan, cloud: AzureCePlan) {
  verifyAzureCePlan(base);
  verifyAzureCePlan(cloud);
  const groupId = `/subscriptions/${base.subscription.id}/resourceGroups/${base.intent.resourceGroup}`;
  const groupDeletes = cloud.actions.filter(
    (action) => action.kind === 'resource-delete' && action.resourceId?.toLowerCase() === groupId.toLowerCase(),
  );
  if (
    base.engine !== 'native' ||
    base.intent.operation !== 'deploy' ||
    cloud.engine !== 'native' ||
    cloud.intent.operation !== 'teardown' ||
    cloud.deploymentName !== base.deploymentName ||
    cloud.subscription.id !== base.subscription.id ||
    cloud.region !== base.region ||
    cloud.siteName !== base.siteName ||
    cloud.actions.some((action) => action.phase !== 'teardown' || !action.mutates) ||
    groupDeletes.length !== 1 ||
    cloud.actions.at(-1)?.id !== groupDeletes[0].id
  )
    throw new Error('Azure native cloud teardown plan differs from the original deployment');
}

export function compileAzureNativeTeardown(
  base: AzureCePlan,
  cloud: AzureCePlan,
  drain: CePlatformDrainPlan,
  retirement: AzureTeardownRetirement[],
): AzureNativeTeardownPlan {
  validateCloudPlan(base, cloud);
  const binding = azureUpgradeBinding(base);
  if (
    drain.sourcePlanSha256 !== base.planSha256 ||
    canonicalSha256(drain.owner) !== canonicalSha256(binding.owner) ||
    drain.sites.length !== 1 ||
    canonicalSha256(drain.sites[0].binding) !== canonicalSha256(binding) ||
    retirement.length !== 1 ||
    retirement[0].siteName !== binding.siteName ||
    retirement[0].siteUid !== drain.sites[0].siteUid ||
    !retirement[0].physicalSiteUid ||
    binding.nodes.some((node) => !retirement[0].tokens.some((token) => token.node === node))
  )
    throw new Error('Azure native teardown source or site inventory differs');
  const draft = {
    schemaVersion: 1 as const,
    kind: 'azure-ce-native-teardown' as const,
    engine: 'native' as const,
    sourcePlanSha256: base.planSha256,
    cloudPlanId: cloud.planId,
    cloudPlanSha256: cloud.planSha256,
    drain: structuredClone(drain),
    retirement: structuredClone(retirement),
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `azure-ce-teardown-${planSha256.slice(0, 24)}`, planSha256 };
}

export async function prepareAzureNativeTeardown(
  base: AzureCePlan,
  cloud: AzureCePlan,
  runtime: CeRuntime,
  contract: VerifiedIngressContract,
  storage: CeDeploymentStore,
  signal?: AbortSignal,
) {
  validateCloudPlan(base, cloud);
  const { drain, retirement } = await collectAzureTeardownMaterial(base, runtime, contract, storage, signal);
  const plan = compileAzureNativeTeardown(base, cloud, drain, retirement);
  await storage.write(`${plan.planId}.json`, plan);
  return plan;
}

export async function runAzureNativeTeardown(
  base: AzureCePlan,
  cloud: AzureCePlan,
  input: AzureNativeTeardownPlan,
  authorizedPlanSha256: string,
  runtime: CeRuntime,
  contract: VerifiedIngressContract,
  storage: CeDeploymentStore,
  applyCloud: (signal?: AbortSignal) => Promise<{ status: 'retired'; absence: 'absent' }>,
  signal?: AbortSignal,
) {
  const expected = compileAzureNativeTeardown(base, cloud, input.drain, input.retirement);
  const binding = azureUpgradeBinding(base);
  const validate = async () => {
    signal?.throwIfAborted();
    await storage.verify();
    if (
      canonicalSha256(expected) !== canonicalSha256(input) ||
      authorizedPlanSha256 !== input.planSha256 ||
      runtime.engine !== 'native' ||
      runtime.contract.fingerprint !== input.drain.siteContractFingerprint ||
      contract.fingerprint !== input.drain.ingressContractFingerprint ||
      canonicalSha256(storage.owner) !== canonicalSha256(input.drain.owner)
    )
      throw new Error('Azure native teardown authorization, ownership or contract differs');
  };
  await validate();
  const drained = await runtime.drainPlatform(input.drain, contract, storage, signal);
  if (drained.status !== 'platform-drained') return { status: 'pending-platform-drain' as const };
  await validate();
  const retired = await applyCloud(signal);
  if (retired.status !== 'retired' || retired.absence !== 'absent')
    throw new Error('Azure native cloud retirement absence is unavailable');
  for (const site of input.retirement) {
    await validate();
    const current = await runtime.observeSiteDeletion(binding, site, signal);
    if (!['pending', 'deleted'].includes(current.status))
      throw new Error('Azure native site retirement evidence is unknown');
    for (const token of site.tokens) {
      await validate();
      await runtime.deleteBootstrapToken(binding, token.node, token.name, signal);
    }
    await validate();
    await runtime.deleteSiteExact(binding, site.siteUid, signal);
    if ((await runtime.observeSiteDeletion(binding, site, signal)).status !== 'deleted')
      return { status: 'pending-site-retirement' as const };
  }
  const receipt = {
    status: 'retired' as const,
    sourcePlanSha256: base.planSha256,
    teardownPlanSha256: input.planSha256,
    cloudPlanSha256: cloud.planSha256,
    cloud: 'absent' as const,
    sites: 'deleted' as const,
    observedAt: new Date().toISOString(),
  };
  await storage.write('azure-native-teardown-receipt.json', receipt);
  return receipt;
}

export async function observeAzureNativeGroupAbsence(base: AzureCePlan, api: AzExecApi, signal?: AbortSignal) {
  verifyAzureCePlan(base);
  signal?.throwIfAborted();
  const account = await api.exec(
    'az',
    ['account', 'show', '--subscription', base.subscription.id, '--output', 'json'],
    signal ? { signal } : undefined,
  );
  if (account.exitCode !== 0) throw new Error('Azure native teardown account evidence is unavailable');
  let identity: Record<string, unknown>;
  try {
    identity = JSON.parse(account.stdout);
  } catch {
    throw new Error('Malformed Azure native teardown account evidence');
  }
  if (
    String(identity.id).toLowerCase() !== base.subscription.id.toLowerCase() ||
    String(identity.tenantId).toLowerCase() !== base.subscription.tenantId.toLowerCase() ||
    identity.environmentName !== base.subscription.cloud ||
    identity.state !== 'Enabled'
  )
    throw new Error('Azure native teardown account differs from deployment');
  const result = await api.exec(
    'az',
    [
      'group',
      'exists',
      '--name',
      base.intent.resourceGroup,
      '--subscription',
      base.subscription.id,
      '--output',
      'json',
    ],
    signal ? { signal } : undefined,
  );
  signal?.throwIfAborted();
  if (result.exitCode !== 0) throw new Error('Azure native teardown absence evidence is unavailable');
  let exists: unknown;
  try {
    exists = JSON.parse(result.stdout);
  } catch {
    throw new Error('Malformed Azure native teardown absence evidence');
  }
  if (exists !== false) throw new Error('Azure native resource group retirement has not converged');
  return { status: 'retired' as const, absence: 'absent' as const };
}
