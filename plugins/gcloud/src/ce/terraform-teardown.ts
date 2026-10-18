import { join } from 'node:path';
import type { GcpPlatformObservations } from '../../../platform/src/ce/gcp-observation';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
import type { GcloudExecApi } from '../gcloud/exec';
import type { GcpCeContractBoundary } from './contract';
import {
  assertGcpTeardownPolicyFresh,
  assertGcpTeardownProfile,
  assertGcpTeardownTopology,
  observeGcpTeardownResource,
} from './deployment-teardown';
import { fingerprint } from './discovery';
import type { GcpOperationStore } from './native-operation';
import { assertGcpResourceOwnership, readGcpResourceInventory } from './ownership';
import type { GcpPolicyReceipt } from './policy';
import { admitGcpTerraformTransition } from './terraform-admission';
import type { GcpCeIntent } from './types';

type Observation = Awaited<ReturnType<NonNullable<GcpPlatformObservations['teardown']>>>;
export interface GcpTerraformTeardownRuntime {
  store: GcpOperationStore & { directory: string };
  session: TerraformSession;
  api: GcloudExecApi;
  observePlatform: NonNullable<GcpPlatformObservations['teardown']>;
  environment: Record<string, string | undefined>;
}
function addresses(intent: GcpCeIntent) {
  const site = intent.sites[0],
    node = site.nodes[0];
  return [
    `google_compute_instance.${node.name.replaceAll('-', '_')}`,
    ...node.interfaces.flatMap((nic) => [
      `google_compute_network.${nic.network.replaceAll('-', '_')}`,
      `google_compute_subnetwork.${nic.subnet.replaceAll('-', '_')}`,
    ]),
    `xcsh_securemesh_site_v2.${site.name.replaceAll('-', '_')}`,
    `xcsh_token.${node.name.replaceAll('-', '_')}`,
  ];
}
function transition(intent: GcpCeIntent, receipt: PlanReceipt, operation: 'deploy' | 'teardown', expected: string[]) {
  if (receipt.noChanges || receipt.changes.length !== expected.length)
    throw new Error('Complete Terraform transition inventory required');
  const action = operation === 'deploy' ? 'create' : 'delete';
  return admitGcpTerraformTransition(
    {
      operation,
      deploymentName: intent.deploymentName,
      addresses: expected,
      expectedActions: Object.fromEntries(expected.map((address) => [address, [action]])),
      savedPlanSha256: receipt.planSha256,
      configurationSha256: receipt.configurationSha256,
      providerLockSha256: receipt.providerLockSha256,
      backendIdentity: `local:${intent.deploymentName}`,
    },
    receipt,
  );
}
async function savedIntent(store: GcpOperationStore, intent: GcpCeIntent) {
  const saved = (await store.read('gcp-terraform-input-identity.json')) as {
    intent?: GcpCeIntent;
    intentFingerprint?: string;
    platformContext?: string;
  };
  if (
    !saved.intent ||
    fingerprint(saved.intent) !== fingerprint(intent) ||
    saved.intentFingerprint !== fingerprint(intent) ||
    saved.platformContext !== intent.platformContext
  )
    throw new Error('Persisted Terraform teardown context differs');
}
function platformNames(intent: GcpCeIntent, observation: Observation) {
  if (
    Object.keys(observation).some(
      (key) => !['siteName', 'siteUid', 'tokenName', 'tokenIdentityHash', 'siteAbsent', 'tokenAbsent'].includes(key),
    ) ||
    typeof observation.siteAbsent !== 'boolean' ||
    typeof observation.tokenAbsent !== 'boolean' ||
    (!observation.siteAbsent &&
      (typeof observation.siteUid !== 'string' || !observation.siteUid || observation.siteUid.includes('.'))) ||
    (!observation.tokenAbsent && !/^sha256:[a-f0-9]{64}$/.test(observation.tokenIdentityHash ?? '')) ||
    observation.siteName !== intent.sites[0].name ||
    observation.tokenName !== `${intent.sites[0].nodes[0].name}-token`
  )
    throw new Error('Terraform platform observation escaped intent');
}
/** Record original immutable Platform identities only after a completed, exact site/token creation. */
export async function recordGcpTerraformPlatformIdentity(
  runtime: GcpTerraformTeardownRuntime,
  intent: GcpCeIntent,
  contract: GcpCeContractBoundary,
  creation: PlanReceipt,
) {
  assertGcpTeardownProfile(intent, contract, 'terraform');
  await savedIntent(runtime.store, intent);
  if (!runtime.session.assertApplied) throw new Error('Shared applied-plan attestation unavailable');
  const expected = addresses(intent),
    platformAddresses = expected.slice(-2);
  if (
    creation.changes.some((change) => !expected.includes(change.address)) ||
    platformAddresses.some((address) => !creation.changes.some((change) => change.address === address))
  )
    throw new Error('Exact owned site/token creation receipt required');
  transition(
    intent,
    creation,
    'deploy',
    creation.changes.map((change) => change.address),
  );
  await runtime.session.assertApplied(creation);
  const observation = await runtime.observePlatform(intent.sites[0].name, `${intent.sites[0].nodes[0].name}-token`);
  platformNames(intent, observation);
  if (observation.siteAbsent || observation.tokenAbsent || !observation.siteUid || !observation.tokenIdentityHash)
    throw new Error('Complete newly created Platform identities required');
  const body = {
    schemaVersion: 1,
    engine: 'terraform',
    intentFingerprint: fingerprint(intent),
    apiRelease: contract.release,
    creationPlanSha256: creation.planSha256,
    observation,
  };
  const identity = { ...body, identityHash: fingerprint(body) };
  let prior: unknown;
  try {
    prior = await runtime.store.read('gcp-terraform-platform-identity.json');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (prior && fingerprint(prior) !== fingerprint(identity))
    throw new Error('Original Terraform Platform identity changed');
  if (!prior) await runtime.store.write('gcp-terraform-platform-identity.json', identity);
  return { recorded: true, identityHash: identity.identityHash };
}
async function platformIdentity(
  runtime: GcpTerraformTeardownRuntime,
  intent: GcpCeIntent,
  contract: GcpCeContractBoundary,
) {
  const saved = (await runtime.store.read('gcp-terraform-platform-identity.json')) as {
    schemaVersion: number;
    engine: string;
    intentFingerprint: string;
    apiRelease: unknown;
    creationPlanSha256: string;
    observation: Observation;
    identityHash: string;
  };
  const { identityHash, ...body } = saved;
  if (
    saved.schemaVersion !== 1 ||
    saved.engine !== 'terraform' ||
    saved.intentFingerprint !== fingerprint(intent) ||
    fingerprint(saved.apiRelease) !== fingerprint(contract.release) ||
    !/^[a-f0-9]{64}$/.test(saved.creationPlanSha256) ||
    identityHash !== fingerprint(body) ||
    !saved.observation.siteUid ||
    !saved.observation.tokenIdentityHash ||
    saved.observation.siteAbsent ||
    saved.observation.tokenAbsent
  )
    throw new Error('Original Terraform Platform ledger required');
  platformNames(intent, saved.observation);
  return saved;
}
async function observe(
  runtime: GcpTerraformTeardownRuntime,
  intent: GcpCeIntent,
  resources: Awaited<ReturnType<typeof readGcpResourceInventory>>,
  original: Observation,
  signal?: AbortSignal,
) {
  let cloudAbsent = 0;
  for (const resource of resources) {
    const live = await observeGcpTeardownResource(runtime.api, resource, signal);
    if (live) await assertGcpResourceOwnership(runtime.store, resource, live);
    else cloudAbsent++;
  }
  const platform = await runtime.observePlatform(original.siteName, original.tokenName, signal);
  platformNames(intent, platform);
  if (
    (!platform.siteAbsent && platform.siteUid !== original.siteUid) ||
    (!platform.tokenAbsent && platform.tokenIdentityHash !== original.tokenIdentityHash)
  )
    throw new Error('Original Terraform Platform object was replaced');
  return { cloudAbsent, siteAbsent: platform.siteAbsent, tokenAbsent: platform.tokenAbsent };
}
async function projectSavedPlan(
  runtime: GcpTerraformTeardownRuntime,
  intent: GcpCeIntent,
  receipt: PlanReceipt,
  resources: Awaited<ReturnType<typeof readGcpResourceInventory>>,
  signal?: AbortSignal,
) {
  const expected = addresses(intent),
    selections: Record<string, string[]> = {};
  for (const address of expected) {
    if (address.startsWith('google_compute_instance.'))
      selections[address] = ['name', 'project', 'zone', 'self_link', 'instance_id', 'boot_disk', 'network_interface'];
    else if (address.startsWith('google_compute_network.'))
      selections[address] = ['name', 'project', 'self_link', 'numeric_id'];
    else if (address.startsWith('google_compute_subnetwork.'))
      selections[address] = ['name', 'project', 'region', 'self_link'];
    else
      selections[address] = [
        'id',
        'name',
        'namespace',
        'labels',
        ...(address.startsWith('xcsh_token.') ? ['site_name'] : []),
      ];
  }
  const fields = await runtime.session.readPlannedResourceFields(receipt, selections, runtime.environment, signal);
  if (fingerprint(Object.keys(fields).sort()) !== fingerprint(expected.slice().sort()))
    throw new Error('Saved destroy projection resource inventory differs');
  const node = intent.sites[0].nodes[0],
    disk = resources.find((resource) => resource.kind === 'disk');
  for (const address of expected) {
    const value = fields[address];
    if (!value) throw new Error('Complete saved destroy ownership projection required');
    if (fingerprint(Object.keys(value).sort()) !== fingerprint(selections[address].slice().sort()))
      throw new Error('Saved destroy projection contains unexpected fields');
    if (address.startsWith('xcsh_')) {
      const name = address.startsWith('xcsh_token.') ? `${node.name}-token` : intent.sites[0].name;
      const labels = value.labels as Record<string, unknown> | undefined;
      if (
        value.id !== name ||
        value.name !== name ||
        value.namespace !== 'system' ||
        labels?.['xcsh-deployment'] !== intent.deploymentName ||
        labels['xcsh-engine'] !== 'terraform' ||
        (address.startsWith('xcsh_token.') &&
          (value.site_name !== intent.sites[0].name || labels['xcsh-node'] !== node.name))
      )
        throw new Error('Saved destroy Platform ownership differs');
    } else {
      const resource = resources.find((resource) => resource.selfLink === value.self_link);
      if (!resource || value.project !== intent.project || value.name !== resource.selfLink.split('/').at(-1))
        throw new Error('Saved destroy cloud identity differs');
      if (address.startsWith('google_compute_instance.')) {
        const disks = value.boot_disk as Array<{ source?: string; auto_delete?: boolean }>;
        const nics = value.network_interface as Array<{ network?: string; subnetwork?: string }>;
        if (
          resource.kind !== 'instance' ||
          String(value.instance_id) !== resource.id ||
          value.zone !== node.zone ||
          !disk ||
          !Array.isArray(disks) ||
          disks.length !== 1 ||
          disks[0].source !== disk.selfLink ||
          disks[0].auto_delete !== true ||
          !Array.isArray(nics) ||
          nics.length !== node.interfaces.length ||
          nics.some(
            (nic, index) =>
              nic.network !==
                `https://www.googleapis.com/compute/v1/projects/${intent.project}/global/networks/${node.interfaces[index].network}` ||
              nic.subnetwork !==
                `https://www.googleapis.com/compute/v1/projects/${intent.project}/regions/${intent.region}/subnetworks/${node.interfaces[index].subnet}`,
          )
        )
          throw new Error('Saved destroy VM/disk identity differs');
      } else if (address.startsWith('google_compute_network.')) {
        if (resource.kind !== 'network' || String(value.numeric_id) !== resource.id)
          throw new Error('Saved destroy VPC identity differs');
      } else if (resource.kind !== 'subnetwork' || value.region !== intent.region)
        throw new Error('Saved destroy subnet identity differs');
    }
  }
  return fingerprint(fields);
}
export async function planGcpTerraformTeardown(
  runtime: GcpTerraformTeardownRuntime,
  intent: GcpCeIntent,
  contract: GcpCeContractBoundary,
  policy: GcpPolicyReceipt,
  signal?: AbortSignal,
) {
  assertGcpTeardownProfile(intent, contract, 'terraform');
  assertGcpTeardownPolicyFresh(policy);
  await savedIntent(runtime.store, intent);
  const release = await acquireProcessLock(join(runtime.store.directory, '.gcp-deployment-lock'));
  try {
    const resources = await readGcpResourceInventory(runtime.store, intent);
    assertGcpTeardownTopology(intent, resources);
    const original = await platformIdentity(runtime, intent, contract);
    const current = await observe(runtime, intent, resources, original.observation, signal);
    if (current.cloudAbsent || current.siteAbsent || current.tokenAbsent)
      throw new Error('Initial Terraform teardown review requires complete live inventory');
    const receipt = await runtime.session.planDestroy(runtime.environment, signal);
    transition(intent, receipt, 'teardown', addresses(intent));
    const projectionHash = await projectSavedPlan(runtime, intent, receipt, resources, signal);
    const body = {
      schemaVersion: 1,
      operation: 'teardown',
      engine: 'terraform',
      intentFingerprint: fingerprint(intent),
      apiRelease: contract.release,
      policyReceipt: policy,
      createdAt: new Date().toISOString(),
      resources,
      platform: original.observation,
      savedPlan: receipt,
      projectionHash,
    };
    const plan = { ...body, planHash: fingerprint(body) };
    await runtime.store.write(`gcp-tf-reviewed-${plan.planHash.slice(7)}.json`, plan);
    return plan;
  } finally {
    await release();
  }
}
export type GcpTerraformTeardownPlan = Awaited<ReturnType<typeof planGcpTerraformTeardown>>;
export async function applyGcpTerraformTeardown(
  runtime: GcpTerraformTeardownRuntime,
  intent: GcpCeIntent,
  contract: GcpCeContractBoundary,
  policy: GcpPolicyReceipt,
  approvedHash: string,
  signal?: AbortSignal,
  onMutation?: () => void,
) {
  assertGcpTeardownProfile(intent, contract, 'terraform');
  assertGcpTeardownPolicyFresh(policy);
  if (!/^sha256:[a-f0-9]{64}$/.test(approvedHash)) throw new Error('Exact Terraform teardown review required');
  await savedIntent(runtime.store, intent);
  const release = await acquireProcessLock(join(runtime.store.directory, '.gcp-deployment-lock'));
  try {
    const plan = (await runtime.store.read(
      `gcp-tf-reviewed-${approvedHash.slice(7)}.json`,
    )) as GcpTerraformTeardownPlan;
    const { planHash, ...body } = plan;
    if (
      plan.schemaVersion !== 1 ||
      plan.operation !== 'teardown' ||
      plan.engine !== 'terraform' ||
      planHash !== approvedHash ||
      fingerprint(body) !== approvedHash ||
      plan.intentFingerprint !== fingerprint(intent) ||
      fingerprint(plan.apiRelease) !== fingerprint(contract.release) ||
      plan.policyReceipt.normalizedSha256 !== policy.normalizedSha256
    )
      throw new Error('Reviewed Terraform teardown binding differs');
    const resources = await readGcpResourceInventory(runtime.store, intent);
    assertGcpTeardownTopology(intent, resources);
    if (fingerprint(resources) !== fingerprint(plan.resources))
      throw new Error('Reviewed Terraform teardown ledger changed');
    const original = await platformIdentity(runtime, intent, contract);
    if (fingerprint(original.observation) !== fingerprint(plan.platform))
      throw new Error('Reviewed Terraform Platform ledger changed');
    const checkpointName = `gcp-tf-authorized-${approvedHash.slice(7)}.json`;
    let checkpoint: { planHash: string; state: 'submitting' | 'applied' | 'absent' } | undefined;
    try {
      checkpoint = (await runtime.store.read(checkpointName)) as typeof checkpoint;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const age = Date.now() - Date.parse(plan.createdAt);
    if (
      checkpoint
        ? checkpoint.planHash !== approvedHash || !['submitting', 'applied', 'absent'].includes(checkpoint.state)
        : !Number.isFinite(age) || age < 0 || age > 5 * 60_000
    )
      throw new Error('Terraform teardown authorization differs or review stale');
    let absence = await observe(runtime, intent, resources, plan.platform, signal);
    const allAbsent = () => absence.cloudAbsent === resources.length && absence.siteAbsent && absence.tokenAbsent;
    if (!checkpoint) {
      if (absence.cloudAbsent || absence.siteAbsent || absence.tokenAbsent)
        throw new Error('Initial approved destroy requires complete live inventory');
      transition(intent, plan.savedPlan, 'teardown', addresses(intent));
      if ((await projectSavedPlan(runtime, intent, plan.savedPlan, resources, signal)) !== plan.projectionHash)
        throw new Error('Saved destroy ownership projection changed');
      checkpoint = { planHash: approvedHash, state: 'submitting' };
      await runtime.store.write(checkpointName, checkpoint);
      onMutation?.();
      await runtime.session.apply(plan.savedPlan, runtime.environment, signal);
      checkpoint.state = 'applied';
      await runtime.store.write(checkpointName, checkpoint);
      absence = await observe(runtime, intent, resources, plan.platform, signal);
    } else if (checkpoint.state === 'absent' && !allAbsent()) throw new Error('Deleted Terraform resources reappeared');
    if (!allAbsent()) return { state: 'pending', planHash: approvedHash, phase: 'independent-absence' };
    const evidenceHash = fingerprint({ planHash: approvedHash, absence });
    await runtime.store.write(`gcp-tf-outcome-${approvedHash.slice(7)}.json`, {
      planHash: approvedHash,
      evidenceHash,
      absence,
    });
    if (checkpoint.state === 'submitting')
      await runtime.session.reconcileApplyFromEvidence(plan.savedPlan, evidenceHash.slice(7));
    checkpoint.state = 'absent';
    await runtime.store.write(checkpointName, checkpoint);
    const finalPlan = await runtime.session.planDestroy(runtime.environment, signal);
    if (
      !finalPlan.noChanges ||
      finalPlan.changes.length ||
      finalPlan.operation !== 'destroy' ||
      finalPlan.actionInvocations?.length ||
      finalPlan.engine !== 'terraform' ||
      finalPlan.deploymentId !== intent.deploymentName ||
      finalPlan.backendIdentity !== plan.savedPlan.backendIdentity ||
      finalPlan.configurationSha256 !== plan.savedPlan.configurationSha256 ||
      finalPlan.providerLockSha256 !== plan.savedPlan.providerLockSha256
    )
      throw new Error('Final Terraform destroy reconciliation is not empty/current');
    absence = await observe(runtime, intent, resources, plan.platform, signal);
    if (!allAbsent()) throw new Error('Independent Terraform absence changed during final reconciliation');
    const evidence = {
      schemaVersion: 1,
      engine: 'terraform',
      state: 'done',
      planHash: approvedHash,
      absence,
      finalPlanSha256: finalPlan.planSha256,
      observedAt: new Date().toISOString(),
    };
    await runtime.store.write(`gcp-tf-evidence-${approvedHash.slice(7)}.json`, evidence);
    return evidence;
  } finally {
    await release();
  }
}
