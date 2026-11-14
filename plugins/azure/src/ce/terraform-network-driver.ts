import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import type { AzExecApi } from '../az/exec';
import { canonicalEqual, canonicalSha256 } from './canonical';
import { captureAzureNetworkUpdateInventory, verifyAzureNetworkUpdateProgress } from './network-update';
import { validateAzureNetworkUpdateTerraformReceipt } from './network-update-terraform';
import {
  type AzureTerraformNetworkAcceptanceIdentity,
  type AzureTerraformNetworkAcceptanceVerifier,
  AzureTerraformNetworkCheckpoint,
} from './terraform-network-checkpoint';
import {
  acquireAzureTerraformNetworkDriverLease,
  verifyAzureTerraformNetworkDriverLease,
} from './terraform-network-driver-lease';
import { runAzureTerraformNetworkNicStage } from './terraform-network-nic-execution';
import { AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256 } from './terraform-network-nic-projection';
import { observeAzureTerraformNetworkPower } from './terraform-network-power';
import { retireAzureTerraformNetworkCompletedPowerStageInDriver } from './terraform-network-power-completed-retirement';
import { runAzureTerraformNetworkPowerStage } from './terraform-network-power-execution';
import {
  AzureTerraformPowerLifecycleInterrupted,
  type AzureTerraformPowerSettlement,
} from './terraform-network-power-lifecycle';
import type { AzureTerraformNetworkReplacementCompletedVerifier } from './terraform-network-replacement-completion';
import {
  buildAzureTerraformNetworkPinnedNicStage,
  buildAzureTerraformNetworkRoutingStage,
  validateAzureTerraformNetworkRoutingPrepared,
} from './terraform-network-routing';
import { runAzureTerraformNetworkRoutingStage } from './terraform-network-routing-execution';
import { bindAzureTerraformNetworkUpdateSource } from './terraform-network-source-binding';
import {
  type AzureTerraformNetworkNodeHistoryPhase,
  readAzureTerraformNetworkNodeHistory,
} from './terraform-network-stage-history';
import { verifyAzureTerraformNetworkUpdateState } from './terraform-network-update-source';
import type { AzureCePlan } from './types';

type Snapshot = Awaited<ReturnType<AzureTerraformNetworkCheckpoint['read']>>;
type Loaders = Parameters<typeof bindAzureTerraformNetworkUpdateSource>[5];
type Site = Parameters<typeof bindAzureTerraformNetworkUpdateSource>[6];
export interface AzureTerraformNetworkDriverDependencies {
  collectAcceptance(
    identity: AzureTerraformNetworkAcceptanceIdentity,
    purpose: 'preflight' | 'restored' | 'final',
    signal?: AbortSignal,
  ): Promise<unknown>;
  qualifyAcceptance: AzureTerraformNetworkAcceptanceVerifier;
  qualifyReplacementCompleted?: AzureTerraformNetworkReplacementCompletedVerifier;
  runPower?: typeof runAzureTerraformNetworkPowerStage;
  retirePower?: typeof retireAzureTerraformNetworkCompletedPowerStageInDriver;
  runNic?: typeof runAzureTerraformNetworkNicStage;
  runRouting?: typeof runAzureTerraformNetworkRoutingStage;
}
const same = (a: unknown, b: unknown) => canonicalEqual(a, b);
function require(condition: unknown, message: string): asserts condition {
  if (!condition) throw Error(`Azure Terraform network driver: ${message}`);
}
async function optional(store: CeDeploymentStore, name: string): Promise<unknown | undefined> {
  try {
    return await store.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
function verifyResult(value: unknown) {
  require(value && typeof value === 'object' && !Array.isArray(value), 'complete operational verification required');
  const row = value as { status: string; scope: string; evidenceSha256: string };
  require(same(Object.keys(row).sort(), ['evidenceSha256', 'scope', 'status']) &&
    row.status === 'verified' &&
    row.scope === 'node-interfaces-routing-traffic' &&
    typeof row.evidenceSha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(row.evidenceSha256), 'current node/interface/routing/traffic acceptance required');
  return row;
}

/** Owning serial source implementation. Operational evidence comes from a trusted observer dependency;
 * unknown/unavailable evidence leaves an explicit resumable pending result, never successful completion.
 * Public dispatch additionally needs the qualified observer and complete network-generation contracts.
 */
export async function runAzureTerraformNetworkUpdate(
  plan: AzureCePlan,
  terraform: CeTerraformService,
  store: CeDeploymentStore,
  api: AzExecApi,
  env: Record<string, string | undefined>,
  loaders: Loaders,
  site: Site,
  dependencies: AzureTerraformNetworkDriverDependencies,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  require(typeof dependencies.collectAcceptance === 'function' &&
    typeof dependencies.qualifyAcceptance === 'function', 'trusted operational collector and verifier required');
  const driver = await acquireAzureTerraformNetworkDriverLease(store.directory);
  const unlock = driver.release;
  let deferredRelease = false;
  try {
    const { binding, session } = await bindAzureTerraformNetworkUpdateSource(
      plan,
      terraform,
      store,
      api,
      env,
      loaders,
      site,
      signal,
      dependencies.qualifyAcceptance,
      dependencies.qualifyReplacementCompleted,
    );
    const checkpoint = await AzureTerraformNetworkCheckpoint.open(
      plan,
      binding,
      store,
      dependencies.qualifyAcceptance,
      signal,
    );
    const applied = (node: number) =>
      Array.from({ length: node - 1 }, (_, i) => plan.nics.map((nic) => `${i + 1}:${nic.index}`)).flat();
    const selected = (node: number) => plan.nics.map((nic) => `${node}:${nic.index}`);
    const identity = (
      node: number,
      inventory: Awaited<ReturnType<typeof captureAzureNetworkUpdateInventory>>,
      configurationSha256: string,
    ): AzureTerraformNetworkAcceptanceIdentity => ({
      owner: structuredClone(store.owner),
      planSha256: plan.planSha256,
      node,
      siteName: plan.siteName,
      siteUid: binding.qualification.siteUid,
      siteConfigurationSha256: binding.qualification.siteConfigurationSha256,
      configurationSha256,
      inventory: structuredClone(inventory),
    });
    const boundary = async (snapshot: Snapshot) => {
      signal?.throwIfAborted();
      require(session.readConfigurationSha256, 'owning current private revision capability required');
      const row = snapshot.checkpoint.nodes.at(-1);
      require(row, 'current serial node required');
      const nicStage = buildAzureTerraformNetworkPinnedNicStage(plan, snapshot.nodeSource, row.before, row.node);
      const routed = ['routing-complete', 'accepted'].includes(snapshot.phase);
      const routing =
        ['restarted', 'routing-complete', 'accepted'].includes(snapshot.phase) && row.history
          ? buildAzureTerraformNetworkRoutingStage(
              plan,
              snapshot.nodeSource,
              row.before,
              row.history.inventory,
              row.node,
            )
          : undefined;
      require(!routed || routing, 'completed routing history required');
      const stage =
        routed && routing
          ? {
              ...nicStage,
              configuration: routing.releasedConfiguration,
              configurationSha256: routing.releasedConfigurationSha256,
            }
          : nicStage;
      const revision = await session.readConfigurationSha256();
      const allowed =
        snapshot.phase === 'deallocated'
          ? [stage.previousConfigurationSha256, stage.configurationSha256]
          : snapshot.phase === 'restarted' && routing
            ? [nicStage.configurationSha256, routing.configurationSha256, routing.releasedConfigurationSha256]
            : [snapshot.configurationSha256];
      require(typeof revision === 'string' &&
        allowed.includes(revision), 'current private configuration differs from serial boundary');
      const inventory = await captureAzureNetworkUpdateInventory(plan, api, signal),
        progressed = applied(row.node);
      if (snapshot.phase === 'deallocated') {
        for (const [index, nic] of Object.entries(inventory.nodes[String(row.node)].nics)) {
          const before = row.before.nodes[String(row.node)].nics[index];
          if (
            nic.subnetId.toLowerCase() === before.targetSubnetId.toLowerCase() &&
            revision === stage.configurationSha256
          )
            progressed.push(`${row.node}:${index}`);
        }
      } else if (!['prepared'].includes(snapshot.phase)) progressed.push(...selected(row.node));
      verifyAzureNetworkUpdateProgress(plan, binding.before, inventory, progressed);
      for (const [node, vm] of Object.entries(binding.before.nodes))
        for (const [index, nic] of Object.entries(vm.nics))
          if (!progressed.includes(`${node}:${index}`))
            require(inventory.nodes[node].nics[index].privateIp ===
              nic.privateIp, 'unsubmitted current private address changed');
      const outputs = await session.readOutputs(['ce_instances', 'ce_interfaces'], env, signal);
      verifyAzureTerraformNetworkUpdateState(plan, inventory, outputs);
      const again = await captureAzureNetworkUpdateInventory(plan, api, signal);
      require(same(again.nodes, inventory.nodes) &&
        (await session.readConfigurationSha256()) === revision, 'cloud/private boundary changed during observation');
      return { inventory, outputs, configurationSha256: revision, progressed, stage };
    };
    const pending = (snapshot: Snapshot, purpose: string) => ({
      status: 'operational-acceptance-pending' as const,
      engine: 'terraform' as const,
      planId: plan.planId,
      planSha256: plan.planSha256,
      node: snapshot.currentNode,
      phase: snapshot.phase,
      purpose,
      reason: 'node-operational-evidence-unverified',
      checkpointSha256: snapshot.checkpointSha256,
    });
    const collect = async (
      expected: AzureTerraformNetworkAcceptanceIdentity,
      purpose: 'preflight' | 'restored' | 'final',
    ) => {
      signal?.throwIfAborted();
      try {
        const receipt = await dependencies.collectAcceptance(structuredClone(expected), purpose, signal);
        const verification = verifyResult(
          await dependencies.qualifyAcceptance(structuredClone(receipt), structuredClone(expected), 'current', signal),
        );
        signal?.throwIfAborted();
        return { receipt, verification };
      } catch {
        signal?.throwIfAborted();
        return undefined;
      }
    };
    const preflight = async (snapshot: Snapshot, current: Awaited<ReturnType<typeof boundary>>) => {
      const name = `${plan.planId}-terraform-network-node-${snapshot.currentNode}-preflight.json`;
      const saved = await optional(store, name);
      if (saved !== undefined) {
        const row = saved as {
          schemaVersion: number;
          sourceBindingSha256: string;
          identity: AzureTerraformNetworkAcceptanceIdentity;
          receipt: unknown;
          verification: unknown;
        };
        require(row &&
          same(Object.keys(row).sort(), [
            'identity',
            'receipt',
            'schemaVersion',
            'sourceBindingSha256',
            'verification',
          ]) &&
          row.schemaVersion === 1 &&
          row.sourceBindingSha256 === canonicalSha256(binding) &&
          row.identity &&
          row.identity.node === snapshot.currentNode &&
          row.identity.configurationSha256 === snapshot.configurationSha256 &&
          same(
            { ...row.identity, inventory: undefined },
            { ...identity(snapshot.currentNode, current.inventory, current.configurationSha256), inventory: undefined },
          ), 'saved operational preflight identity differs');
        verifyAzureNetworkUpdateProgress(plan, binding.before, row.identity.inventory, applied(snapshot.currentNode));
        try {
          const verification = verifyResult(
            await dependencies.qualifyAcceptance(
              structuredClone(row.receipt),
              structuredClone(row.identity),
              'historical',
              signal,
            ),
          );
          require(same(row.verification, verification), 'saved preflight provenance differs');
          signal?.throwIfAborted();
          require(same(await store.read(name), saved), 'preflight changed during qualification');
          return true;
        } catch {
          signal?.throwIfAborted();
          return false;
        }
      }
      const names = [
        'mutation-plan',
        'mutation-binding',
        'mutation-outcome',
        'mutation-complete',
        'release-plan',
        'release-binding',
        'release-outcome',
        'release-complete',
        'final-plan',
        'current-no-change-plan',
      ];
      for (const suffix of names)
        require((await optional(
          store,
          `${plan.planId}-terraform-network-node-${snapshot.currentNode}-deallocate-${suffix}.json`,
        )) === undefined, 'preflight missing after node interruption publication');
      const expected = identity(snapshot.currentNode, current.inventory, current.configurationSha256);
      const evidence = await collect(expected, 'preflight');
      if (!evidence) return false;
      const now = await boundary(snapshot);
      require(same(now.inventory.nodes, current.inventory.nodes), 'current preflight cloud identity changed');
      signal?.throwIfAborted();
      await store.write(name, {
        schemaVersion: 1,
        sourceBindingSha256: canonicalSha256(binding),
        identity: expected,
        ...evidence,
      });
      signal?.throwIfAborted();
      return true;
    };
    const retirePower = async (node: number, operation: 'start' | 'deallocate') => {
      await verifyAzureTerraformNetworkDriverLease(driver.lease, store.directory);
      const result = await (dependencies.retirePower ?? retireAzureTerraformNetworkCompletedPowerStageInDriver)(
        driver.lease,
        plan,
        node,
        operation,
        terraform,
        store,
        loaders,
        site,
        dependencies.qualifyAcceptance,
        api,
        env,
        signal,
        dependencies.qualifyReplacementCompleted,
      );
      require(result &&
        typeof result === 'object' &&
        !Array.isArray(result) &&
        same(
          Object.keys(result).sort(),
          [
            'schemaVersion',
            'scope',
            'sourcePlanSha256',
            'node',
            'operation',
            'stage',
            'graphSha256',
            'preparingSha256',
            'finalReceiptSha256',
            'markerSha256',
            'artifactRetirementReceiptSha256',
            'wholeAppliedStateEmptyQualified',
            'independentCleanupQualified',
            'runnerRetirementQualified',
            'currentOperationalAcceptanceQualified',
            'parentRetirementQualified',
            'retirementQualified',
          ].sort(),
        ) &&
        result.schemaVersion === 1 &&
        result.scope === 'selected-completed-network-power-runner-retirement' &&
        result.sourcePlanSha256 === plan.planSha256 &&
        result.node === node &&
        result.operation === operation &&
        result.stage === `network-${plan.planSha256.slice(0, 24)}-node-${node}-${operation}` &&
        result.wholeAppliedStateEmptyQualified === true &&
        result.independentCleanupQualified === true &&
        result.runnerRetirementQualified === true &&
        result.currentOperationalAcceptanceQualified === false &&
        result.parentRetirementQualified === false &&
        result.retirementQualified === false &&
        [
          result.graphSha256,
          result.preparingSha256,
          result.finalReceiptSha256,
          result.markerSha256,
          result.artifactRetirementReceiptSha256,
        ].every(
          (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value),
        ), 'complete exact selected power runner retirement required before serial advancement');
      await verifyAzureTerraformNetworkDriverLease(driver.lease, store.directory);
      signal?.throwIfAborted();
    };
    const existingStage = async (snapshot: Snapshot, phase: AzureTerraformNetworkNodeHistoryPhase) => {
      const prefix = `${plan.planId}-terraform-network-node-${snapshot.currentNode}`;
      const name =
        phase === 'routing-complete'
          ? `${prefix}-routing-final-plan.json`
          : phase === 'nic-complete'
            ? `${prefix}-final-plan.json`
            : `${prefix}-${phase === 'deallocated' ? 'deallocate' : 'start'}-final-plan.json`;
      if ((await optional(store, name)) === undefined) return false;
      const row = snapshot.checkpoint.nodes.at(-1);
      require(row, 'selected node history boundary required');
      await readAzureTerraformNetworkNodeHistory(plan, snapshot.nodeSource, row.before, row.node, phase, store, signal);
      const progressed = [...applied(row.node), ...(phase === 'deallocated' ? [] : selected(row.node))];
      const power = await observeAzureTerraformNetworkPower(
        plan,
        row.before,
        row.node,
        ['restarted', 'routing-complete'].includes(phase) ? 'start' : 'deallocate',
        progressed,
        api,
        signal,
      );
      require(power.converged, 'completed historical stage lacks current matching power');
      return true;
    };
    let snapshot = await checkpoint.read(signal);
    while (!snapshot.allNodesAccepted) {
      signal?.throwIfAborted();
      const current = await boundary(snapshot),
        row = snapshot.checkpoint.nodes.at(-1);
      require(row, 'complete current serial node required');
      if (snapshot.phase === 'prepared') {
        if (!(await preflight(snapshot, current))) return pending(snapshot, 'preflight');
        if (!(await existingStage(snapshot, 'deallocated')))
          await (dependencies.runPower ?? runAzureTerraformNetworkPowerStage)(
            plan,
            row.before,
            row.node,
            'deallocate',
            applied(row.node),
            terraform,
            store,
            api,
            env,
            signal,
          );
        await retirePower(row.node, 'deallocate');
        snapshot = await checkpoint.recordStage(snapshot.checkpointSha256, row.node, 'deallocated', signal);
      } else if (snapshot.phase === 'deallocated') {
        if (!(await existingStage(snapshot, 'nic-complete')))
          await (dependencies.runNic ?? runAzureTerraformNetworkNicStage)(
            plan,
            snapshot.nodeSource,
            row.before,
            row.node,
            applied(row.node),
            session,
            store,
            api,
            env,
            signal,
          );
        snapshot = await checkpoint.recordStage(snapshot.checkpointSha256, row.node, 'nic-complete', signal);
      } else if (snapshot.phase === 'nic-complete') {
        if (!(await existingStage(snapshot, 'restarted')))
          await (dependencies.runPower ?? runAzureTerraformNetworkPowerStage)(
            plan,
            row.before,
            row.node,
            'start',
            [...applied(row.node), ...selected(row.node)],
            terraform,
            store,
            api,
            env,
            signal,
          );
        await retirePower(row.node, 'start');
        snapshot = await checkpoint.recordStage(snapshot.checkpointSha256, row.node, 'restarted', signal);
      } else if (snapshot.phase === 'restarted') {
        require(row.history?.phase === 'restarted' &&
          same(
            current.inventory.nodes,
            row.history.inventory.nodes,
          ), 'current NIC identity differs from authenticated restart boundary');
        const preparedRouting = await optional(
          store,
          `${plan.planId}-terraform-network-node-${row.node}-routing-prepared.json`,
        );
        const routingInput =
          preparedRouting === undefined
            ? current.inventory
            : validateAzureTerraformNetworkRoutingPrepared(
                plan,
                snapshot.nodeSource,
                row.before,
                current.inventory,
                row.node,
                preparedRouting,
              ).current;
        if (!(await existingStage(snapshot, 'routing-complete')))
          await (dependencies.runRouting ?? runAzureTerraformNetworkRoutingStage)(
            plan,
            snapshot.nodeSource,
            row.before,
            routingInput,
            row.node,
            session,
            store,
            api,
            env,
            signal,
          );
        snapshot = await checkpoint.recordStage(snapshot.checkpointSha256, row.node, 'routing-complete', signal);
      } else if (snapshot.phase === 'routing-complete') {
        const power = await observeAzureTerraformNetworkPower(
          plan,
          row.before,
          row.node,
          'start',
          current.progressed,
          api,
          signal,
        );
        require(power.converged, 'restored selected node is not currently running');
        const durable = await optional(
          store,
          `${plan.planId}-terraform-network-driver-revision-${snapshot.checkpoint.revision + 1}.json`,
        );
        if (durable !== undefined) {
          const saved = durable as {
            previousCheckpointSha256: string;
            lastTransition?: { kind: string; node: number };
            nodes?: { acceptance?: { receipt: unknown } }[];
          };
          require(saved &&
            saved.previousCheckpointSha256 === snapshot.checkpointSha256 &&
            saved.lastTransition?.kind === 'accept' &&
            saved.lastTransition.node === row.node &&
            saved.nodes?.at(-1)?.acceptance, 'pending immutable acceptance boundary differs');
          snapshot = await checkpoint.acceptNode(
            snapshot.checkpointSha256,
            row.node,
            saved.nodes.at(-1)?.acceptance?.receipt,
            signal,
          );
          continue;
        }
        const evidence = await collect(identity(row.node, current.inventory, current.configurationSha256), 'restored');
        if (!evidence) return pending(snapshot, 'restored');
        // Checkpoint acceptance authenticates the exact immutable routing inventory. A newer dynamic
        // address requires a fresh owning-stage completion; it cannot silently replace that identity.
        if (!same(current.inventory.nodes, row.history?.inventory.nodes)) return pending(snapshot, 'restored-identity');
        snapshot = await checkpoint.acceptNode(snapshot.checkpointSha256, row.node, evidence.receipt, signal);
      } else {
        require(snapshot.phase === 'accepted', 'known serial phase required');
        snapshot = await checkpoint.prepareNextNode(snapshot.checkpointSha256, current.inventory, signal);
      }
    }
    const current = await boundary(snapshot),
      evidenceByNode: Record<string, unknown> = {};
    for (let node = 1; node <= plan.topology.nodeCount; node++) {
      const power = await observeAzureTerraformNetworkPower(
        plan,
        current.inventory,
        node,
        'start',
        current.progressed,
        api,
        signal,
      );
      require(power.converged, 'terminal node is not currently running');
      const evidence = await collect(identity(node, current.inventory, current.configurationSha256), 'final');
      if (!evidence) return pending(snapshot, `final-node-${node}`);
      evidenceByNode[String(node)] = evidence;
    }
    const receipt = await (session as TerraformSession).plan(env, signal);
    validateAzureNetworkUpdateTerraformReceipt(plan, current.stage, receipt, AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256);
    require(receipt.noChanges, 'final owning refresh plan changes resources');
    const final = await boundary(snapshot);
    require(same(final.inventory.nodes, current.inventory.nodes) &&
      same(
        final.outputs,
        current.outputs,
      ), 'terminal identities changed during final operational/refresh qualification');
    signal?.throwIfAborted();
    const packet = {
      schemaVersion: 1,
      engine: 'terraform',
      planSha256: plan.planSha256,
      sourceBindingSha256: canonicalSha256(binding),
      checkpointSha256: snapshot.checkpointSha256,
      receipt,
      inventory: final.inventory,
      outputs: final.outputs,
      evidenceByNode,
    };
    const completeName = `${plan.planId}-terraform-network-driver-complete.json`;
    const currentFinalName = `${plan.planId}-terraform-network-driver-current-final.json`;
    let completed = await optional(store, completeName);
    if (completed === undefined) {
      require((await optional(store, currentFinalName)) ===
        undefined, 'original completion missing after current final publication');
      await store.write(completeName, packet);
      completed = packet;
    } else {
      const historical = completed as typeof packet;
      require(historical &&
        same(Object.keys(historical).sort(), Object.keys(packet).sort()) &&
        historical.schemaVersion === 1 &&
        historical.engine === 'terraform' &&
        historical.planSha256 === plan.planSha256 &&
        historical.sourceBindingSha256 === packet.sourceBindingSha256 &&
        historical.checkpointSha256 === snapshot.checkpointSha256, 'immutable completion identity differs');
      validateAzureNetworkUpdateTerraformReceipt(
        plan,
        current.stage,
        historical.receipt,
        AZURE_TERRAFORM_NETWORK_NIC_LOCK_SHA256,
      );
      require(historical.receipt.noChanges, 'original completion refresh changes resources');
      verifyAzureNetworkUpdateProgress(plan, binding.before, historical.inventory, current.progressed);
      verifyAzureTerraformNetworkUpdateState(plan, historical.inventory, historical.outputs);
      require(same(
        Object.keys(historical.evidenceByNode).sort(),
        Array.from({ length: plan.topology.nodeCount }, (_, i) => String(i + 1)),
      ), 'complete historical operational node inventory required');
      for (let node = 1; node <= plan.topology.nodeCount; node++) {
        const evidence = historical.evidenceByNode[String(node)] as { receipt: unknown; verification: unknown };
        require(evidence &&
          same(Object.keys(evidence).sort(), ['receipt', 'verification']), 'historical operational packet differs');
        const qualified = verifyResult(
          await dependencies.qualifyAcceptance(
            structuredClone(evidence.receipt),
            identity(node, historical.inventory, historical.receipt.configurationSha256),
            'historical',
            signal,
          ),
        );
        require(same(evidence.verification, qualified), 'historical terminal operational provenance differs');
      }
      signal?.throwIfAborted();
      require(same(await store.read(completeName), completed), 'original completion changed during qualification');
    }
    signal?.throwIfAborted();
    await store.write(currentFinalName, packet);
    signal?.throwIfAborted();
    return {
      status: 'complete' as const,
      engine: 'terraform' as const,
      planId: plan.planId,
      planSha256: plan.planSha256,
      siteUid: binding.qualification.siteUid,
      nodeCount: plan.topology.nodeCount,
      checkpointSha256: snapshot.checkpointSha256,
      terraformNoChanges: true as const,
      finalPlanSha256: receipt.planSha256,
      cloudEvidenceSha256: canonicalSha256(final.inventory),
      completionSha256: canonicalSha256(completed),
    };
  } catch (error) {
    if (error instanceof AzureTerraformPowerLifecycleInterrupted) {
      deferredRelease = true;
      const completion = (async () => {
        let settled: AzureTerraformPowerSettlement;
        try {
          settled = await error.completion;
        } catch {
          settled = { mutationSettlements: [], locksReleased: false, failures: ['power-settlement-unavailable'] };
        }
        const failures = [...settled.failures];
        try {
          await unlock();
        } catch {
          failures.push('driver-lock-release-failed');
        }
        return {
          mutationSettlements: settled.mutationSettlements,
          locksReleased: settled.locksReleased && failures.length === 0,
          failures,
        };
      })();
      throw new AzureTerraformPowerLifecycleInterrupted(completion);
    }
    throw error;
  } finally {
    if (!deferredRelease) await unlock();
  }
}
