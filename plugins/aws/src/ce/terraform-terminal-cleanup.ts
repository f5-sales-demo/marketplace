import { lstat, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import { VerifiedUpgradeContract } from '../../../platform/src/ce/upgrade-contract';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import type { AwsExecApi } from '../aws/exec';
import { verifyAwsCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { collectAwsTerraformAbsence } from './terraform-absence';
import { retireAwsTerraformParentArtifacts } from './terraform-parent-retirement';
import type { AwsTerraformRetirementInventory } from './terraform-retirement-inventory';
import { qualifiedAwsTerraformUpgradeStages, retireAwsTerraformUpgradeStage } from './terraform-upgrade-retirement';
import { siteBindings } from './topology';
import type { AwsCePlan } from './types';

const checkpointName = 'aws-terraform-terminal-cleanup.json';
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Malformed terminal cleanup evidence');
  return value as Record<string, unknown>;
};
interface Teardown {
  kind: string;
  planId: string;
  planSha256: string;
  sourcePlanSha256: string;
  drain: {
    siteContractFingerprint: string;
    ingressContractFingerprint: string;
    listeners?: unknown[];
    origins?: unknown[];
  };
}
async function optional(store: CeDeploymentStore, name: string) {
  try {
    return await store.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
export async function hasAwsTerraformTerminalCleanup(store: CeDeploymentStore) {
  return (await optional(store, checkpointName)) !== undefined;
}
async function stageInventory(store: CeDeploymentStore) {
  const path = join(store.directory, 'terraform-stages');
  let names: string[];
  try {
    const stat = await lstat(path);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.uid !== process.getuid?.() ||
      (await realpath(path)) !== path
    )
      throw Error('Terminal stage directory ownership differs');
    names = await readdir(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  if (names.some((name) => name !== 'f5-resources' && !/^upgrade-(?:software|os)-[a-f0-9]{24}$/.test(name)))
    throw Error('Unqualified Terraform stage blocks terminal cleanup');
  return names.sort();
}
/** Public teardown terminal boundary. Fresh read-only external evidence is independent of local runner proofs. */
export async function finalizeAwsTerraformCleanup(
  base: AwsCePlan,
  teardown: Teardown,
  authorized: string,
  runtime: CeRuntime,
  contract: VerifiedIngressContract,
  session: TerraformSession,
  store: CeDeploymentStore,
  api: AwsExecApi,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
  terraform?: CeTerraformService,
) {
  base = structuredClone(base);
  teardown = structuredClone(teardown);
  env = { ...env };
  signal?.throwIfAborted();
  verifyAwsCePlan(base);
  await store.verify();
  if (
    base.engine !== 'terraform' ||
    runtime.engine !== 'terraform' ||
    authorized !== teardown.planSha256 ||
    teardown.sourcePlanSha256 !== base.planSha256 ||
    canonicalSha256(store.owner) !== canonicalSha256(siteBindings(base)[0].binding.owner) ||
    teardown.drain.siteContractFingerprint !== runtime.contract.fingerprint ||
    teardown.drain.ingressContractFingerprint !== contract.fingerprint
  )
    throw Error('Terminal cleanup authorization or contracts differ');
  const savedAuthorization = object(await store.read(`${teardown.planId}-authorization.json`)),
    lifecycle = object(await store.read('aws-terraform-lifecycle-retirement.json'));
  if (
    savedAuthorization.schemaVersion !== 1 ||
    savedAuthorization.engine !== 'terraform' ||
    savedAuthorization.mutations !== true ||
    savedAuthorization.sourcePlanSha256 !== base.planSha256 ||
    savedAuthorization.teardownPlanSha256 !== teardown.planSha256 ||
    lifecycle.sourcePlanSha256 !== base.planSha256 ||
    lifecycle.teardownPlanSha256 !== teardown.planSha256 ||
    lifecycle.kind !== teardown.kind ||
    canonicalSha256(lifecycle.owner) !== canonicalSha256(store.owner) ||
    canonicalSha256(await store.read(`${teardown.planId}.json`)) !== canonicalSha256(teardown)
  )
    throw Error('Terminal cleanup persisted authorization differs');
  const inventory = (await store.read('terraform-cloud-teardown-inventory.json')) as AwsTerraformRetirementInventory;
  const namespaces = new Set(['default']);
  const namespace = (value: unknown) => {
    if (typeof value !== 'string' || !/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value))
      throw Error('Terminal ingress namespace is unresolved');
    namespaces.add(value);
  };
  for (const item of teardown.drain.listeners ?? []) namespace(object(item).namespace);
  for (const item of teardown.drain.origins ?? []) namespace(object(object(item).origin).namespace);
  const stages = await stageInventory(store);
  const book = await optional(store, 'terraform-f5-resources.json');
  if ((book !== undefined) !== stages.includes('f5-resources'))
    throw Error('F5 bookkeeping and owning stage inventory differ');
  if (stages.includes('f5-resources') && !terraform?.retireF5Stage)
    throw Error('Owning stage retirement service unavailable');
  const upgradeStages = stages.filter((stage) => stage !== 'f5-resources');
  if (upgradeStages.length) {
    const names = (await readdir(store.directory)).filter((name) => /^aws-ce-upgrade-[a-f0-9]{24}\.json$/.test(name));
    const sources = await Promise.all(names.map((name) => store.read(name)));
    if (upgradeStages.some((stage) => !sources.some((source) => object(object(source).deployment).stage === stage)))
      throw Error('Unqualified Terraform stage blocks terminal cleanup');
  }
  const upgradeContract = upgradeStages.length ? await VerifiedUpgradeContract.release(fetch, signal) : undefined;
  const upgrades = upgradeContract
    ? await qualifiedAwsTerraformUpgradeStages(base, store, stages, upgradeContract)
    : [];
  if (upgrades.length && !terraform) throw Error('Owning upgrade stage retirement service unavailable');
  const fresh = async () => {
    signal?.throwIfAborted();
    const start = Date.now();
    const platform = await runtime.unregisteredAbsence(
      siteBindings(base).map((row) => row.binding),
      [...namespaces].sort(),
      contract,
      signal,
    );
    const at = Date.parse(platform.observedAt),
      began = Date.parse(platform.startedAt);
    if (
      platform.status !== 'absent' ||
      canonicalSha256(platform.owner) !== canonicalSha256(store.owner) ||
      platform.siteContractFingerprint !== runtime.contract.fingerprint ||
      platform.ingressContractFingerprint !== contract.fingerprint ||
      !Number.isFinite(at) ||
      !Number.isFinite(began) ||
      began < start ||
      at < began ||
      at > Date.now() ||
      Date.now() - at > 60000 ||
      !Array.isArray(platform.sources) ||
      !platform.sources.length
    )
      throw Error('Current complete platform absence unavailable');
    const cloud = await collectAwsTerraformAbsence(base, inventory, api, signal);
    if (cloud.status !== 'absent-or-retired') throw Error('Current exact cloud absence unavailable');
    return { platform, cloud };
  };
  let checkpoint = await optional(store, checkpointName);
  let current = await fresh();
  if (checkpoint === undefined) {
    const phase = object(await store.read('terraform-cloud-teardown.json'));
    if (
      phase.schemaVersion !== 1 ||
      phase.engine !== 'terraform' ||
      phase.sourcePlanSha256 !== base.planSha256 ||
      phase.phase !== 'retired'
    )
      throw Error('Cloud teardown has not converged');
    if (!session.retireArtifacts) throw Error('Owning runner retirement unavailable');
    const receipt = await session.plan(env, signal);
    if (
      receipt.schemaVersion !== 1 ||
      receipt.engine !== 'terraform' ||
      receipt.deploymentId !== base.deploymentName ||
      receipt.backendIdentity !== `local:${base.deploymentName}` ||
      receipt.noChanges !== true ||
      !Array.isArray(receipt.changes) ||
      receipt.changes.length ||
      !/^[a-f0-9]{64}$/.test(receipt.planSha256) ||
      receipt.operation ||
      receipt.actionInvocations ||
      receipt.imports ||
      receipt.relinquishments
    )
      throw Error('Terminal runner final plan is not an ordinary no-change plan');
    current = await fresh();
    const evidence = {
      owner: store.owner,
      sourcePlanSha256: base.planSha256,
      teardownPlanSha256: teardown.planSha256,
      contracts: { site: runtime.contract.fingerprint, ingress: contract.fingerprint },
      inventorySha256: inventory.sha256,
      stages,
      observation: current,
    };
    checkpoint = {
      schemaVersion: 1,
      owner: store.owner,
      sourcePlanSha256: base.planSha256,
      teardownPlanSha256: teardown.planSha256,
      evidence,
      evidenceSha256: canonicalSha256(evidence),
      receipt,
      receiptSha256: canonicalSha256(receipt),
    };
    await store.write(checkpointName, checkpoint);
  }
  const bound = object(checkpoint),
    evidence = object(bound.evidence),
    receipt = object(bound.receipt);
  if (
    bound.schemaVersion !== 1 ||
    canonicalSha256(bound.owner) !== canonicalSha256(store.owner) ||
    bound.sourcePlanSha256 !== base.planSha256 ||
    bound.teardownPlanSha256 !== teardown.planSha256 ||
    bound.evidenceSha256 !== canonicalSha256(evidence) ||
    bound.receiptSha256 !== canonicalSha256(receipt) ||
    evidence.inventorySha256 !== inventory.sha256 ||
    canonicalSha256(evidence.stages) !== canonicalSha256(stages) ||
    canonicalSha256(evidence.contracts) !==
      canonicalSha256({ site: runtime.contract.fingerprint, ingress: contract.fingerprint }) ||
    receipt.noChanges !== true ||
    receipt.backendIdentity !== `local:${base.deploymentName}`
  )
    throw Error('Terminal cleanup checkpoint differs');
  for (const upgrade of upgrades) {
    if (!terraform || !upgradeContract) throw Error('Owning upgrade stage retirement service unavailable');
    await retireAwsTerraformUpgradeStage(
      base,
      upgrade,
      upgradeContract,
      terraform,
      store,
      String(bound.evidenceSha256),
      env,
      signal,
    );
    await fresh();
  }
  if (stages.includes('f5-resources')) {
    if (!terraform?.retireF5Stage) throw Error('Owning stage retirement service unavailable');
    await terraform.retireF5Stage(store.owner, base.planSha256, String(bound.evidenceSha256), env, signal);
    await fresh();
  }
  if (!session.retireArtifacts) throw Error('Owning runner retirement unavailable');
  const result = await session.retireArtifacts(
    receipt as unknown as PlanReceipt,
    String(bound.evidenceSha256),
    env,
    signal,
  );
  if (
    result.status !== 'runner-artifacts-retired' ||
    result.evidenceSha256 !== bound.evidenceSha256 ||
    result.finalPlanSha256 !== receipt.planSha256
  )
    throw Error('Terminal runner retirement result differs');
  await fresh();
  return {
    ...(await retireAwsTerraformParentArtifacts(base, teardown, String(bound.evidenceSha256), store, signal)),
    cloudInventory: 'absent-or-retired' as const,
    platformInventory: 'absent' as const,
  };
}
