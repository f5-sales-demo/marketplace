import { join } from 'node:path';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { GcpCeContractBoundary } from './contract';
import { assertGcpTeardownProfile, assertGcpTeardownTopology, observeGcpTeardownResource } from './deployment-teardown';
import { fingerprint } from './discovery';
import { type GcpResourceIdentity, readGcpResourceInventory, recordGcpResource } from './ownership';
import {
  assertGcpTerraformOwnedTransition,
  assertGcpTerraformProjectedIdentities,
  type GcpTerraformTeardownRuntime,
  gcpTerraformIdentitySelections,
  gcpTerraformResourceAddresses,
  recordGcpTerraformPlatformIdentity,
} from './terraform-teardown';
import type { GcpCeIntent } from './types';

/** Private adapter: an applied binary and state snapshot authorize identity capture, never name-only adoption. */
export async function captureGcpTerraformCreationOwnership(
  runtime: GcpTerraformTeardownRuntime,
  intent: GcpCeIntent,
  contract: GcpCeContractBoundary,
  receipt: PlanReceipt,
  signal?: AbortSignal,
) {
  intent = structuredClone(intent);
  receipt = structuredClone(receipt);
  assertGcpTeardownProfile(intent, contract, 'terraform');
  if (intent.operation !== 'deploy') throw new Error('Terraform creation ownership requires deployment intent');
  assertGcpTerraformOwnedTransition(intent, receipt, 'deploy', gcpTerraformResourceAddresses(intent));
  if (!runtime.session.assertApplied || !runtime.session.readAppliedResourceFields)
    throw new Error('Restricted shared applied-state projection unavailable');
  const release = await acquireProcessLock(join(runtime.store.directory, '.gcp-tf-ownership-lock'));
  try {
    const saved = (await runtime.store.read('gcp-terraform-input-identity.json')) as {
      intent?: GcpCeIntent;
      intentFingerprint?: string;
      platformContext?: string;
    };
    if (
      fingerprint(saved.intent) !== fingerprint(intent) ||
      saved.intentFingerprint !== fingerprint(intent) ||
      saved.platformContext !== intent.platformContext
    )
      throw new Error('Persisted Terraform creation intent differs');
    await runtime.session.assertApplied(receipt);
    const projected = await runtime.session.readAppliedResourceFields(
      receipt,
      gcpTerraformIdentitySelections(intent),
      runtime.environment,
      signal,
    );
    if (
      projected.schemaVersion !== 1 ||
      projected.planSha256 !== receipt.planSha256 ||
      !/^[a-f0-9]{64}$/.test(projected.stateSha256) ||
      typeof projected.lineage !== 'string' ||
      !projected.lineage.trim() ||
      !Number.isSafeInteger(projected.serial) ||
      projected.serial < 0
    )
      throw new Error('Applied Terraform state snapshot differs');
    const node = intent.sites[0].nodes[0];
    const prefix = `https://www.googleapis.com/compute/v1/projects/${intent.project}`;
    const requested = [
      { kind: 'instance' as const, selfLink: `${prefix}/zones/${node.zone}/instances/${node.name}` },
      { kind: 'disk' as const, selfLink: `${prefix}/zones/${node.zone}/disks/${node.name}` },
      ...node.interfaces.flatMap((nic) => [
        { kind: 'network' as const, selfLink: `${prefix}/global/networks/${nic.network}` },
        { kind: 'subnetwork' as const, selfLink: `${prefix}/regions/${intent.region}/subnetworks/${nic.subnet}` },
      ]),
    ];
    const resources: GcpResourceIdentity[] = [];
    for (const resource of requested) {
      const scoped = {
        ...resource,
        id: '0',
        project: intent.project,
        deploymentName: intent.deploymentName,
        engine: 'terraform' as const,
        ...(['instance', 'disk'].includes(resource.kind)
          ? { siteName: intent.sites[0].name, nodeName: node.name }
          : {}),
      };
      const observed = await observeGcpTeardownResource(runtime.api, scoped, signal);
      if (!observed || observed.selfLink !== resource.selfLink || !/^\d+$/.test(observed.id))
        throw new Error('Complete applied Terraform cloud identity required');
      resources.push({ ...scoped, id: observed.id });
    }
    assertGcpTeardownTopology(intent, resources);
    const projectionHash = assertGcpTerraformProjectedIdentities(intent, projected.resources, resources);
    // Inspect the whole original ledger before extending it, including resumed partial capture.
    let priorResources: GcpResourceIdentity[] = [];
    try {
      priorResources = await readGcpResourceInventory(runtime.store, intent);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (priorResources.some((prior) => !resources.some((resource) => fingerprint(prior) === fingerprint(resource))))
      throw new Error('Original Terraform cloud identity changed');
    const body = {
      schemaVersion: 1,
      engine: 'terraform',
      intentFingerprint: fingerprint(intent),
      creationReceipt: receipt,
      apiRelease: contract.release,
      state: { sha256: projected.stateSha256, lineage: projected.lineage, serial: projected.serial },
      projectionHash,
      resources,
    };
    const evidence = { ...body, ownershipHash: fingerprint(body) };
    let prior: unknown;
    try {
      prior = await runtime.store.read('gcp-terraform-creation-ownership.json');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (prior && fingerprint(prior) !== fingerprint(evidence))
      throw new Error('Original applied Terraform ownership evidence changed');
    signal?.throwIfAborted();
    if (!prior) await runtime.store.write('gcp-terraform-creation-ownership.json', evidence);
    for (const resource of resources) await recordGcpResource(runtime.store, resource);
    await recordGcpTerraformPlatformIdentity(runtime, intent, contract, receipt);
    return { recorded: true, ownershipHash: evidence.ownershipHash, resources: resources.length };
  } finally {
    await release();
  }
}
