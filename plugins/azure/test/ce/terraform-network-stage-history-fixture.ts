import { expect } from 'bun:test';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import { canonicalSha256 } from '../../src/ce/canonical';
import { captureAzureNetworkUpdateInventory } from '../../src/ce/network-update';
import { runAzureTerraformNetworkNicStage } from '../../src/ce/terraform-network-nic-execution';
import { azureTerraformNetworkPowerDeployment } from '../../src/ce/terraform-network-power';
import { runAzureTerraformNetworkPowerStage } from '../../src/ce/terraform-network-power-execution';
import { runAzureTerraformNetworkRoutingStage } from '../../src/ce/terraform-network-routing-execution';
import { readAzureTerraformNetworkNodeHistory } from '../../src/ce/terraform-network-stage-history';
import type { AzureCeIntent } from '../../src/ce/types';
import { nicExecutionFixture, type TerraformNetworkFixtureSeed } from './terraform-network-nic-execution-fixture';

export async function networkStageHistoryFixture(
  node = 1,
  move = true,
  ha = true,
  execute = true,
  sourceOverride?: string,
  seed?: TerraformNetworkFixtureSeed,
  routing?: AzureCeIntent['routing'],
  moveSlo = false,
) {
  const f = await nicExecutionFixture(node, move, ha, moveSlo, false, seed, routing);
  const source = sourceOverride ?? f.source;
  f.state.configuration = source;
  f.state.power = 'VM running';
  const runNic = (signal?: AbortSignal) =>
    runAzureTerraformNetworkNicStage(
      f.plan,
      source,
      f.before,
      node,
      f.appliedNics,
      f.session,
      f.store,
      f.api,
      {},
      signal,
      { attempts: 2, intervalMs: 0, wait: async () => {} },
    );
  const powerCalls: string[] = [];
  async function power(operation: 'deallocate' | 'start') {
    const deployment = await azureTerraformNetworkPowerDeployment(f.plan, f.before, node, operation);
    const appliedNics =
      operation === 'start' ? [...f.appliedNics, ...f.plan.nics.map((n) => `${node}:${n.index}`)] : f.appliedNics;
    const address = 'azapi_resource_action.ce_network';
    let configuration = deployment.configuration,
      control: Record<string, unknown> | null = null;
    let counter = 0,
      latest: PlanReceipt | undefined;
    const receipts = new Map<string, PlanReceipt>();
    const manifestHash = () => {
      const { configuration: source, providerLock, ...identity } = deployment;
      return canonicalSha256({
        ...identity,
        configurationSha256: f.hash(configuration),
        providerLockSha256: f.hash(providerLock),
      });
    };
    const states = new Map<string, string>(),
      projections = new Map<string, { prior: unknown; proposed: unknown }>();
    const current = (receipt: PlanReceipt, planned = false) => {
      if (
        latest?.planSha256 !== receipt.planSha256 ||
        receipt.configurationSha256 !== f.hash(configuration) ||
        (planned && states.get(receipt.planSha256) !== 'planned')
      )
        throw Error('exact current unconsumed journal required');
    };
    const session = {
      async readConfigurationSha256() {
        return f.hash(configuration);
      },
      async readCurrentPlanJournal(expected: string) {
        expect(expected).toBe(f.hash(configuration));
        const receipt = latest?.configurationSha256 === expected ? latest : undefined;
        return {
          schemaVersion: 1,
          scope: 'current-saved-plan-byte-and-journal-binding',
          state: receipt ? states.get(receipt.planSha256) : 'absent',
          receipt: structuredClone(receipt),
          manifestSha256: manifestHash(),
          ...(receipt ? { ordinaryRefreshEnabled: true, executionSha256: 'a'.repeat(64) } : {}),
          journalSha256: receipt ? f.hash(JSON.stringify(receipt)) : null,
          savedPlanSha256: receipt?.planSha256 ?? null,
          planSemanticsQualified: false,
        };
      },
      // Synthetic journal/history for source graph tests; actual-runner cases use real archives separately.
      async readPlanApplicationHistory(receipt: PlanReceipt) {
        const original = receipts.get(receipt.planSha256);
        if (!original || canonicalSha256(original) !== canonicalSha256(receipt))
          throw Error('fixture original receipt differs');
        return {
          schemaVersion: 1,
          scope: 'exact-saved-plan-journal-history',
          receiptSha256: canonicalSha256(receipt),
          incompleteArchives: 0,
          applicationOutcomeQualified: false,
          retirementQualified: false,
          matches: [
            {
              location: latest?.planSha256 === receipt.planSha256 ? 'current' : 'plan-history',
              journalSha256: f.hash(JSON.stringify(receipt)),
              savedPlanSha256: receipt.planSha256,
              manifestSha256: manifestHash(),
              state: states.get(receipt.planSha256),
            },
          ],
        };
      },
      async reviseConfiguration(expected: string, next: string) {
        expect(expected).toBe(f.hash(configuration));
        configuration = next;
        return f.hash(next);
      },
      async plan() {
        const proposed = JSON.parse(configuration).resource?.azapi_resource_action?.ce_network ?? null;
        const effect = proposed ? (control ? 'no-op' : 'create') : control ? 'delete' : undefined;
        const receipt: PlanReceipt = {
          schemaVersion: 1,
          deploymentId: deployment.deploymentId,
          engine: 'terraform',
          backendIdentity: deployment.backendIdentity,
          configurationSha256: f.hash(configuration),
          providerLockSha256: f.hash(deployment.providerLock),
          planSha256: f.hash(`${operation}:${++counter}`),
          noChanges: !effect || effect === 'no-op',
          changes: effect ? [{ address, type: 'azapi_resource_action', actions: [effect] }] : [],
        };
        states.set(receipt.planSha256, 'planned');
        projections.set(receipt.planSha256, { prior: structuredClone(control), proposed });
        latest = receipt;
        receipts.set(receipt.planSha256, structuredClone(receipt));
        return receipt;
      },
      async readPlannedResourceFields(receipt: PlanReceipt) {
        current(receipt, true);
        return { [address]: projections.get(receipt.planSha256)?.prior ?? null };
      },
      async readProposedResourceFields(receipt: PlanReceipt) {
        current(receipt, true);
        return { [address]: projections.get(receipt.planSha256)?.proposed ?? null };
      },
      async readAppliedResourceFields(receipt: PlanReceipt) {
        current(receipt);
        return { [address]: control };
      },
      async readPlanApplicationState(receipt: PlanReceipt) {
        current(receipt);
        return states.get(receipt.planSha256);
      },
      async apply(receipt: PlanReceipt) {
        current(receipt, true);
        powerCalls.push(`${operation}:apply`);
        states.set(receipt.planSha256, 'applied');
        control = structuredClone(projections.get(receipt.planSha256)?.proposed as Record<string, unknown> | null);
        if (control) f.state.power = operation === 'start' ? 'VM running' : 'VM deallocated';
      },
      async reconcileApplyFromEvidence() {
        throw Error('unexpected reconciliation');
      },
    } as unknown as TerraformSession;
    const terraform: CeTerraformService = {
      async open(owner, selected) {
        expect(owner).toEqual(f.store.owner);
        expect(selected).toEqual(deployment);
        return session;
      },
    };
    return runAzureTerraformNetworkPowerStage(
      f.plan,
      f.before,
      node,
      operation,
      appliedNics,
      terraform,
      f.store,
      f.api,
      {},
      undefined,
      { attempts: 2, intervalMs: 0, wait: async () => {} },
    );
  }
  const runRouting = async (
    signal?: AbortSignal,
    retainedCurrent?: Parameters<typeof runAzureTerraformNetworkRoutingStage>[3],
  ) =>
    runAzureTerraformNetworkRoutingStage(
      f.plan,
      source,
      f.before,
      retainedCurrent ?? (await captureAzureNetworkUpdateInventory(f.plan, f.api, signal)),
      node,
      f.session,
      f.store,
      f.api,
      {},
      signal,
      { attempts: 2, intervalMs: 0, wait: async () => {} },
    );
  const runStages = async () => {
    f.state.power = 'VM running';
    await power('deallocate');
    await runNic();
    await power('start');
    await runRouting();
  };
  if (execute) await runStages();
  const run = (
    phase: 'deallocated' | 'nic-complete' | 'restarted' | 'routing-complete' = 'restarted',
    signal?: AbortSignal,
  ) => readAzureTerraformNetworkNodeHistory(f.plan, source, f.before, node, phase, f.store, signal);
  return { ...f, source, node, powerCalls, run, power, runStages, runNic, runRouting };
}
