import { readdir } from 'node:fs/promises';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CePlatformDrainPlan } from '../../../platform/src/ce/platform-drain';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { TerraformSession } from '../../../terraform/src/service';
import type { AzExecApi } from '../az/exec';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { runAzureTerraformCloudTeardown } from './terraform-cloud-teardown';
import { observeAzureTerraformDestroyBoundary } from './terraform-destroy-ownership';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

type Json = Record<string, unknown>;
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed Azure teardown material');
  return value as Json;
};
const safeName = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value);
interface Retirement {
  siteName: string;
  siteUid: string;
  physicalSiteUid: string;
  tokens: Array<{ node: string; name: string }>;
}
export interface AzureTerraformTeardownPlan {
  schemaVersion: 1;
  kind: 'azure-ce-terraform-teardown';
  engine: 'terraform';
  sourcePlanSha256: string;
  drain: CePlatformDrainPlan;
  retirement: Retirement[];
  planId: string;
  planSha256: string;
}

export function compileAzureTerraformTeardown(base: AzureCePlan, drain: CePlatformDrainPlan, retirement: Retirement[]) {
  verifyAzureCePlan(base);
  const binding = azureUpgradeBinding(base);
  if (
    base.engine !== 'terraform' ||
    drain.schemaVersion !== 1 ||
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
    throw new Error('Azure Terraform teardown source or site inventory differs');
  const identities = new Set<string>();
  for (const token of retirement[0].tokens) {
    if (!binding.nodes.includes(token.node) || !safeName(token.name) || identities.has(token.name))
      throw new Error('Azure Terraform teardown token identity differs');
    identities.add(token.name);
  }
  const draft = {
    schemaVersion: 1 as const,
    kind: 'azure-ce-terraform-teardown' as const,
    engine: 'terraform' as const,
    sourcePlanSha256: base.planSha256,
    drain: structuredClone(drain),
    retirement: structuredClone(retirement),
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `azure-ce-teardown-${planSha256.slice(0, 24)}`, planSha256 };
}

/** Collect platform and enrollment identities twice so teardown never trusts caller-built inventories. */
export async function prepareAzureTerraformTeardown(
  base: AzureCePlan,
  runtime: CeRuntime,
  contract: VerifiedIngressContract,
  storage: CeDeploymentStore,
  signal?: AbortSignal,
): Promise<AzureTerraformTeardownPlan> {
  verifyAzureCePlan(base);
  const binding = azureUpgradeBinding(base);
  if (
    base.engine !== 'terraform' ||
    runtime.engine !== 'terraform' ||
    canonicalSha256(storage.owner) !== canonicalSha256(binding.owner)
  )
    throw new Error('Azure Terraform teardown preparation requires Terraform ownership');
  await storage.verify();
  const entries = await readdir(storage.directory, { withFileTypes: true });
  const ingressFiles = entries.filter((entry) => /^ingress-plan-[a-f0-9]{24}\.json$/.test(entry.name));
  const namespaces = new Set(['default']);
  for (const entry of ingressFiles) {
    if (!entry.isFile()) throw new Error('Azure teardown ingress artifact is not a regular file');
    const saved = object(await storage.read(entry.name));
    const namespace = object(object(saved.request).metadata).namespace;
    const originNamespace = object(object(object(saved.material).intent).originPool).namespace;
    if (!safeName(namespace) || !safeName(originNamespace)) throw new Error('Azure teardown namespace is invalid');
    namespaces.add(namespace);
    namespaces.add(originNamespace);
  }
  const observe = async () => {
    const value = await runtime.teardownInventory([binding], [...namespaces].sort(), contract, signal);
    const observedAt = Date.parse(value.observedAt);
    if (
      value.status !== 'observed' ||
      canonicalSha256(value.owner) !== canonicalSha256(binding.owner) ||
      value.siteContractFingerprint !== runtime.contract.fingerprint ||
      value.ingressContractFingerprint !== contract.fingerprint ||
      !Number.isFinite(observedAt) ||
      observedAt > Date.now() ||
      Date.now() - observedAt > 60_000
    )
      throw new Error('Fresh Azure platform teardown inventory is unavailable');
    return value;
  };
  const before = await observe();
  const ingress = runtime.ingress(contract, storage);
  const listeners = [];
  for (const live of before.resources.filter((row) => row.kind === 'http_loadbalancers')) {
    if (!live.ingressPlanId) throw new Error('Azure listener has no persisted plan identity');
    const reference = await ingress.teardownReference(live.ingressPlanId);
    if (reference.name !== live.name || reference.namespace !== live.namespace || reference.uid !== live.uid)
      throw new Error('Azure listener checkpoint differs from platform inventory');
    listeners.push({ id: reference.id, name: reference.name, namespace: reference.namespace });
  }
  const origins = [];
  const originTeardown = runtime.originTeardown(contract);
  for (const live of before.resources.filter((row) => row.kind === 'origin_pools'))
    origins.push(
      await originTeardown.observe(
        binding.owner,
        { name: live.name, namespace: live.namespace, uid: live.uid },
        signal,
      ),
    );
  const site = before.sites.filter((row) => row.siteName === binding.siteName);
  if (site.length !== 1) throw new Error('Azure teardown site inventory is missing or ambiguous');
  const routing = before.resources
    .filter(
      (row) =>
        row.siteName === binding.siteName &&
        (row.kind === 'bgps' || row.kind === 'bgp_routing_policys' || row.kind === 'external_connectors'),
    )
    .map((row) => ({
      kind:
        row.kind === 'bgps'
          ? ('bgp' as const)
          : row.kind === 'bgp_routing_policys'
            ? ('bgp_routing_policy' as const)
            : ('external_connector' as const),
      name: row.name,
      uid: row.uid,
    }));
  const tokenRows = new Map<string, { node: string; name: string }>();
  for (const [index, node] of binding.nodes.entries()) {
    const prefixes = [
      `${base.deploymentName.slice(0, 40)}-${index + 1}-`,
      `${base.siteName.slice(0, 36)}-${index + 1}-r-`,
    ];
    for (const entry of entries) {
      const prefix = prefixes.find((candidate) => entry.name.startsWith(candidate));
      if (!prefix || !/^[a-f0-9]{12}\.json$/.test(entry.name.slice(prefix.length))) continue;
      if (!entry.isFile()) throw new Error('Azure teardown enrollment artifact is not a regular file');
      const record = object(await storage.read(entry.name));
      if (record.tokenName !== entry.name.slice(0, -5) || record.siteName !== binding.siteName || record.node !== node)
        throw new Error('Azure teardown historical enrollment identity differs');
      tokenRows.set(String(record.tokenName), { node, name: String(record.tokenName) });
    }
  }
  for (const row of before.resources.filter((row) => row.kind === 'tokens' && row.siteName === binding.siteName)) {
    if (!row.node) throw new Error('Azure teardown token node identity is unavailable');
    const existing = tokenRows.get(row.name);
    if (existing && existing.node !== row.node) throw new Error('Azure teardown enrollment identities conflict');
    tokenRows.set(row.name, { node: row.node, name: row.name });
  }
  const drain: CePlatformDrainPlan = {
    schemaVersion: 1,
    owner: binding.owner,
    sourcePlanSha256: base.planSha256,
    siteContractFingerprint: runtime.contract.fingerprint,
    ingressContractFingerprint: contract.fingerprint,
    listeners,
    origins,
    sites: [{ binding, siteUid: site[0].siteUid, routing }],
  };
  const retirement = [
    {
      siteName: site[0].siteName,
      siteUid: site[0].siteUid,
      physicalSiteUid: site[0].physicalSiteUid,
      tokens: [...tokenRows.values()].sort((a, b) => a.name.localeCompare(b.name)),
    },
  ];
  const after = await observe();
  if (
    canonicalSha256({ sites: before.sites, resources: before.resources }) !==
    canonicalSha256({ sites: after.sites, resources: after.resources })
  )
    throw new Error('Azure teardown source changed during preparation');
  const plan = compileAzureTerraformTeardown(base, drain, retirement);
  await storage.write(`${plan.planId}.json`, plan);
  return plan;
}

export async function runAzureTerraformTeardown(
  base: AzureCePlan,
  input: AzureTerraformTeardownPlan,
  authorizedPlanSha256: string,
  runtime: CeRuntime,
  contract: VerifiedIngressContract,
  session: TerraformSession,
  storage: CeDeploymentStore,
  api: AzExecApi,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
) {
  const expected = compileAzureTerraformTeardown(base, input.drain, input.retirement);
  const validate = async () => {
    signal?.throwIfAborted();
    await storage.verify();
    if (
      canonicalSha256(expected) !== canonicalSha256(input) ||
      authorizedPlanSha256 !== input.planSha256 ||
      runtime.engine !== 'terraform' ||
      runtime.contract.fingerprint !== input.drain.siteContractFingerprint ||
      contract.fingerprint !== input.drain.ingressContractFingerprint ||
      canonicalSha256(storage.owner) !== canonicalSha256(input.drain.owner)
    )
      throw new Error('Azure Terraform teardown authorization, ownership or contract differs');
  };
  await validate();
  const drained = await runtime.drainPlatform(input.drain, contract, storage, signal);
  if (drained.status !== 'platform-drained') return { status: 'pending-platform-drain' as const };
  await validate();
  const cloud = await runAzureTerraformCloudTeardown(base, session, storage, api, env, signal);
  for (const site of input.retirement) {
    await validate();
    const current = await runtime.observeSiteDeletion(azureUpgradeBinding(base), site, signal);
    if (!['pending', 'deleted'].includes(current.status)) throw new Error('Azure site retirement evidence is unknown');
    for (const token of site.tokens) {
      await validate();
      await runtime.deleteBootstrapToken(azureUpgradeBinding(base), token.node, token.name, signal);
    }
    await validate();
    await runtime.deleteSiteExact(azureUpgradeBinding(base), site.siteUid, signal);
    if ((await runtime.observeSiteDeletion(azureUpgradeBinding(base), site, signal)).status !== 'deleted')
      return { status: 'pending-site-retirement' as const, cloud };
  }
  await validate();
  const boundary = await observeAzureTerraformDestroyBoundary(base, api, signal);
  if (boundary.status !== 'absent') throw new Error('Azure cloud retirement absence has not converged');
  const receipt = {
    status: 'retired' as const,
    sourcePlanSha256: base.planSha256,
    teardownPlanSha256: input.planSha256,
    finalPlanSha256: cloud.finalPlanSha256,
    cloud: boundary.status,
    sites: 'deleted' as const,
    observedAt: new Date().toISOString(),
  };
  await storage.write('azure-terraform-teardown-receipt.json', receipt);
  return receipt;
}
