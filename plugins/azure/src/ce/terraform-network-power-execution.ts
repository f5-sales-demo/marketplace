import { createHash } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import type { AzExecApi } from '../az/exec';
import { canonicalSha256 } from './canonical';
import {
  type AzureNetworkUpdateInventory,
  validateAzureNetworkUpdateInventory,
  verifyAzureNetworkUpdateProgress,
} from './network-update';
import {
  azureTerraformNetworkPowerDeployment,
  azureTerraformNetworkPowerSelections,
  observeAzureTerraformNetworkPower,
  validateAzureTerraformNetworkPowerPlan,
  validateAzureTerraformNetworkPowerProjection,
} from './terraform-network-power';
import { withAzureTerraformPowerLifecycle } from './terraform-network-power-lifecycle';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const address = 'azapi_resource_action.ce_network';
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network power execution: ${message}`);
}
async function optional(store: CeDeploymentStore, name: string): Promise<unknown | undefined> {
  try {
    return await store.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

/** Internal selected-node power stage. The public serial driver separately qualifies source history, NIC journals and CE health. */
export async function runAzureTerraformNetworkPowerStage(
  plan: AzureCePlan,
  before: AzureNetworkUpdateInventory,
  node: number,
  operation: 'deallocate' | 'start',
  appliedNics: string[],
  terraform: CeTerraformService,
  store: CeDeploymentStore,
  api: AzExecApi,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
  polling = {
    attempts: 90,
    intervalMs: 10_000,
    wait: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  },
) {
  const requestPlan = plan,
    requestBefore = before,
    requestEnvironment = env,
    requestNics = appliedNics,
    requestPolling = polling,
    rawStore = store,
    rawTerraform = terraform,
    rawApi = api;
  plan = structuredClone(plan);
  before = structuredClone(before);
  env = { ...env };
  appliedNics = [...appliedNics];
  const snapshots = {
    plan: canonicalSha256(plan),
    before: canonicalSha256(before),
    env: canonicalSha256(env),
    nics: canonicalSha256(appliedNics),
    owner: canonicalSha256(store.owner),
    directory: store.directory,
    attempts: polling.attempts,
    intervalMs: polling.intervalMs,
    wait: polling.wait,
  };
  const bindings: Array<{ object: object; key: PropertyKey; value: unknown }> = [];
  const seal = () => {
    signal?.throwIfAborted();
    require(canonicalSha256(requestPlan) === snapshots.plan &&
      canonicalSha256(requestBefore) === snapshots.before &&
      canonicalSha256(requestEnvironment) === snapshots.env &&
      canonicalSha256(requestNics) === snapshots.nics &&
      canonicalSha256(rawStore.owner) === snapshots.owner &&
      rawStore.directory === snapshots.directory &&
      requestPolling.attempts === snapshots.attempts &&
      requestPolling.intervalMs === snapshots.intervalMs &&
      requestPolling.wait === snapshots.wait &&
      bindings.every(
        ({ object, key, value }) => Reflect.get(object, key) === value,
      ), 'request or owning dependency changed');
  };
  signal = AbortSignal.any([AbortSignal.timeout(720000), ...(signal ? [signal] : [])]);
  seal();
  require(Number.isInteger(polling.attempts) &&
    polling.attempts > 0 &&
    Number.isFinite(polling.intervalMs) &&
    polling.intervalMs >= 0, 'invalid convergence bounds');
  require(canonicalSha256(store.owner) === canonicalSha256(azureUpgradeBinding(plan).owner), 'storage owner differs');
  return withAzureTerraformPowerLifecycle(
    store.directory,
    signal,
    seal,
    async (step) => {
      const guard = <T extends object>(target: T, keys: string[], mutations: string[] = []): T => {
        const functions = new Map<PropertyKey, unknown>();
        for (const key of keys) {
          const value = Reflect.get(target, key);
          bindings.push({ object: target, key, value });
          if (typeof value === 'function')
            functions.set(key, (...args: unknown[]) =>
              step(async () => await Reflect.apply(value, target, args), mutations.includes(key)),
            );
        }
        return new Proxy(target, {
          get: (object, key) => (functions.has(key) ? functions.get(key) : Reflect.get(object, key)),
        });
      };
      store = guard(rawStore, ['read', 'write', 'verify'], ['write']);
      terraform = guard(rawTerraform, ['open'], ['open']);
      api = guard(rawApi, ['exec']);
      polling = { ...requestPolling, wait: (ms: number) => step(() => snapshots.wait(ms)) };
      const mutation = await step(() => azureTerraformNetworkPowerDeployment(plan, before, node, operation));
      const release = await step(() => azureTerraformNetworkPowerDeployment(plan, before, node, operation, true));
      signal?.throwIfAborted();
      await store.verify();
      const prefix = `${plan.planId}-terraform-network-node-${node}-${operation}`;
      const observe = () => observeAzureTerraformNetworkPower(plan, before, node, operation, appliedNics, api, signal);
      const poll = async () => {
        for (let i = 0; i < polling.attempts; i++) {
          signal?.throwIfAborted();
          const observed = await observe();
          if (observed.converged) return observed;
          if (i + 1 < polling.attempts) await polling.wait(polling.intervalMs);
        }
        throw Error('Azure Terraform network power execution: observed power has not converged');
      };
      // Verify current immutable cloud identity before opening or changing private stage state.
      await observe();
      let session: TerraformSession;
      try {
        session = await terraform.open(store.owner, mutation, false);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        session = await terraform.open(store.owner, mutation, 'current');
      }
      session = guard(
        session,
        [
          'readConfigurationSha256',
          'readCurrentPlanJournal',
          'readPlanApplicationHistory',
          'readPlannedResourceFields',
          'readProposedResourceFields',
          'readAppliedResourceFields',
          'readPlanApplicationState',
          'plan',
          'apply',
          'reviseConfiguration',
          'reconcileApplyFromEvidence',
        ],
        ['plan', 'apply', 'reviseConfiguration', 'reconcileApplyFromEvidence'],
      );
      const configuration = async () => {
        const current = await session.readConfigurationSha256?.();
        require(current === hash(mutation.configuration) ||
          current === hash(release.configuration), 'private configuration differs');
        return current;
      };
      const validate = (receipt: unknown, phase: 'mutation' | 'release' | 'final') =>
        validateAzureTerraformNetworkPowerPlan(plan, before, node, operation, receipt, phase);
      // Publication may fail after Terraform durably saves a plan. Recover its exact private
      // receipt instead of replacing that journal with another plan. Submitted orphan journals
      // need independently authenticated bindings/outcomes and cannot be reconstructed here.
      const unpublishedPlan = async (phase: 'mutation' | 'release') => {
        require(session.readCurrentPlanJournal, 'current saved-plan journal inspection unavailable');
        const current = await configuration();
        const journal = await session.readCurrentPlanJournal(current, signal);
        require(journal.schemaVersion === 1 &&
          journal.scope === 'current-saved-plan-byte-and-journal-binding' &&
          journal.planSemanticsQualified === false, 'current saved-plan journal contract differs');
        if (journal.state === 'absent') {
          require(journal.receipt === undefined &&
            journal.savedPlanSha256 === null &&
            journal.journalSha256 === null, 'absent journal contains an unbound plan');
          return session.plan(env, signal);
        }
        require(journal.state === 'planned' &&
          journal.receipt &&
          journal.savedPlanSha256 ===
            journal.receipt.planSha256, 'unpublished submitted plan requires independently qualified history');
        return validate(journal.receipt, phase);
      };
      const projection = async (receipt: PlanReceipt, phase: 'mutation' | 'release' | 'final') => {
        const name = `${prefix}-${phase}-binding.json`;
        let binding = phase === 'final' ? undefined : await optional(store, name);
        if (binding === undefined) {
          binding = {
            schemaVersion: 1,
            receiptSha256: canonicalSha256(receipt),
            prior: await session.readPlannedResourceFields(receipt, azureTerraformNetworkPowerSelections, env, signal),
            proposed: await session.readProposedResourceFields(
              receipt,
              azureTerraformNetworkPowerSelections,
              env,
              signal,
            ),
          };
          await validateBinding(binding, receipt, phase);
          if (phase !== 'final') await store.write(name, binding);
        } else await validateBinding(binding, receipt, phase);
      };
      const validateBinding = async (input: unknown, receipt: PlanReceipt, phase: 'mutation' | 'release' | 'final') => {
        const value = input as Record<string, unknown>;
        require(value &&
          canonicalSha256(Object.keys(value).sort()) ===
            canonicalSha256(['prior', 'proposed', 'receiptSha256', 'schemaVersion']) &&
          value.schemaVersion === 1 &&
          value.receiptSha256 === canonicalSha256(receipt), 'saved state binding differs');
        await validateAzureTerraformNetworkPowerProjection(
          plan,
          before,
          node,
          operation,
          receipt,
          phase,
          value.prior,
          value.proposed,
        );
      };
      const validateCloud = (input: unknown) => {
        const cloud = input as Awaited<ReturnType<typeof observeAzureTerraformNetworkPower>>;
        require(cloud &&
          cloud.engine === 'terraform' &&
          cloud.planSha256 === plan.planSha256 &&
          cloud.node === node &&
          cloud.operation === operation &&
          cloud.resourceId === before.nodes[String(node)].resourceId &&
          cloud.vmId === before.nodes[String(node)].vmId &&
          cloud.ownerPlanSha256 === before.nodes[String(node)].ownerPlanSha256 &&
          cloud.converged === true &&
          cloud.powerState ===
            (operation === 'start' ? 'running' : 'deallocated'), 'saved completion cloud identity differs');
        validateAzureNetworkUpdateInventory(plan, cloud.inventory);
        verifyAzureNetworkUpdateProgress(plan, before, cloud.inventory, appliedNics);
      };
      const completed = async (phase: 'mutation' | 'release', receipt: PlanReceipt, outcome?: unknown) => {
        const name = `${prefix}-${phase}-complete.json`;
        const saved =
          outcome === undefined
            ? await optional(store, name)
            : { schemaVersion: 1, receiptSha256: canonicalSha256(receipt), outcome };
        if (saved === undefined) return false;
        const value = saved as Record<string, unknown>;
        require(value &&
          canonicalSha256(Object.keys(value).sort()) ===
            canonicalSha256(['outcome', 'receiptSha256', 'schemaVersion']) &&
          value.schemaVersion === 1 &&
          value.receiptSha256 === canonicalSha256(receipt), 'saved phase completion differs');
        if (phase === 'mutation') validateCloud(value.outcome);
        else {
          const releaseOutcome = value.outcome as Record<string, unknown>;
          require(releaseOutcome &&
            canonicalSha256(Object.keys(releaseOutcome).sort()) === canonicalSha256(['cloud', 'state']) &&
            canonicalSha256(releaseOutcome.state) ===
              canonicalSha256({ [address]: null }), 'saved control absence differs');
          validateCloud(releaseOutcome.cloud);
        }
        if (outcome !== undefined) await store.write(name, saved);
        return true;
      };
      let current = await configuration();
      let mutationReceipt = await optional(store, `${prefix}-mutation-plan.json`);
      if (current === hash(mutation.configuration)) {
        if (mutationReceipt === undefined) {
          const baseline = await observe();
          require(baseline.powerState ===
            (operation === 'start' ? 'deallocated' : 'running'), 'unsubmitted action baseline differs');
          mutationReceipt = await unpublishedPlan('mutation');
          await validate(mutationReceipt, 'mutation');
          await store.write(`${prefix}-mutation-plan.json`, mutationReceipt);
        }
        const receipt = await validate(mutationReceipt, 'mutation');
        await projection(receipt, 'mutation');
        let state = await session.readPlanApplicationState(receipt);
        require(['planned', 'applying', 'applied'].includes(state), 'mutation application state unavailable');
        if (!receipt.noChanges && state === 'planned') {
          const baseline = await observe();
          require(baseline.powerState ===
            (operation === 'start' ? 'deallocated' : 'running'), 'planned action baseline changed');
          try {
            await session.apply(receipt, env, signal);
          } catch (error) {
            signal?.throwIfAborted();
            state = await session.readPlanApplicationState(receipt);
            if (state !== 'applying' && state !== 'applied') throw error;
          }
          state = await session.readPlanApplicationState(receipt);
        }
        const outcome = await poll();
        await store.write(`${prefix}-mutation-outcome.json`, outcome);
        if (state === 'applying') await session.reconcileApplyFromEvidence(receipt, canonicalSha256(outcome));
        else require(receipt.noChanges || state === 'applied', 'mutation has no authoritative submitted outcome');
        await completed('mutation', receipt, outcome);
        current = await configuration();
        require(current === hash(mutation.configuration), 'configuration changed before release');
        await session.reviseConfiguration(current, release.configuration);
      } else {
        require(mutationReceipt !== undefined, 'empty stage lacks immutable mutation history');
        const receipt = await validate(mutationReceipt, 'mutation');
        require(await completed('mutation', receipt), 'empty stage lacks completed mutation history');
        await projection(receipt, 'mutation');
        require((await observe()).converged, 'released mutation power regressed');
      }
      require((await configuration()) === hash(release.configuration), 'release revision differs');
      let releaseReceipt = await optional(store, `${prefix}-release-plan.json`);
      if (releaseReceipt === undefined) {
        releaseReceipt = await unpublishedPlan('release');
        await validate(releaseReceipt, 'release');
        await store.write(`${prefix}-release-plan.json`, releaseReceipt);
      }
      const released = await validate(releaseReceipt, 'release');
      await projection(released, 'release');
      const releaseAlreadyComplete = await completed('release', released);
      if (!releaseAlreadyComplete) {
        let releaseState = await session.readPlanApplicationState(released);
        require(['planned', 'applying', 'applied'].includes(releaseState), 'release application state unavailable');
        if (!released.noChanges && releaseState === 'planned') {
          require((await observe()).converged, 'power changed before state-only release');
          try {
            await session.apply(released, env, signal);
          } catch (error) {
            signal?.throwIfAborted();
            releaseState = await session.readPlanApplicationState(released);
            if (releaseState !== 'applying' && releaseState !== 'applied') throw error;
          }
          releaseState = await session.readPlanApplicationState(released);
        }
        const fields = await session.readAppliedResourceFields(
          released,
          azureTerraformNetworkPowerSelections,
          env,
          signal,
        );
        require(canonicalSha256(Object.keys(fields)) === canonicalSha256([address]) &&
          fields[address] === null, 'temporary control state remains');
        const cloud = await observe();
        require(cloud.converged, 'selected power changed during control release');
        const releaseOutcome = { cloud, state: fields };
        await store.write(`${prefix}-release-outcome.json`, releaseOutcome);
        if (releaseState === 'applying')
          await session.reconcileApplyFromEvidence(released, canonicalSha256(releaseOutcome));
        else require(released.noChanges || releaseState === 'applied', 'release lacks authoritative submitted outcome');
        await completed('release', released, releaseOutcome);
      }
      require((await observe()).converged, 'completed release power regressed');
      // Freeze authorization before the final refresh call. A saved plan may outlive its
      // response or public packet write; recover those exact bytes instead of replacing them.
      // This internal packet stays outside the execution graph namespace until terminal schema qualification.
      const finalizingName = `azure-power-finalize-${canonicalSha256({ planSha256: plan.planSha256, node, operation }).slice(0, 24)}.json`;
      const { configuration: source, providerLock, ...identity } = release;
      const manifestSha256 = canonicalSha256({
        ...identity,
        configurationSha256: hash(source),
        providerLockSha256: hash(providerLock),
      });
      const bound = {
        schemaVersion: 1,
        sourcePlanSha256: plan.planSha256,
        ownerSha256: canonicalSha256(store.owner),
        beforeSha256: canonicalSha256(before),
        node,
        operation,
        deploymentSha256: canonicalSha256(release),
        mutationReceiptSha256: canonicalSha256(mutationReceipt),
        releaseReceiptSha256: canonicalSha256(released),
      };
      require(session.readCurrentPlanJournal &&
        session.readPlanApplicationHistory, 'final saved journal/history inspection unavailable');
      const readJournal = session.readCurrentPlanJournal,
        readHistory = session.readPlanApplicationHistory;
      const journal = async () => {
        signal?.throwIfAborted();
        require(session.readCurrentPlanJournal === readJournal &&
          session.readPlanApplicationHistory === readHistory, 'final owning inspection changed');
        const value = await readJournal.call(session, hash(release.configuration), signal);
        require(value.schemaVersion === 1 &&
          value.scope === 'current-saved-plan-byte-and-journal-binding' &&
          value.planSemanticsQualified === false &&
          value.manifestSha256 === manifestSha256 &&
          value.receipt &&
          value.journalSha256 &&
          /^[a-f0-9]{64}$/.test(value.journalSha256) &&
          value.savedPlanSha256 === value.receipt.planSha256, 'final current saved journal identity differs');
        signal?.throwIfAborted();
        return value;
      };
      let finalizing = (await optional(store, finalizingName)) as Record<string, unknown> | undefined;
      if (finalizing === undefined) {
        require((await optional(store, `${prefix}-final-plan.json`)) === undefined &&
          (await optional(store, `${prefix}-current-no-change-plan.json`)) ===
            undefined, 'published final lacks original finalizing authorization');
        const inspected = await journal();
        require(canonicalSha256(inspected.receipt) === canonicalSha256(released) &&
          (released.noChanges
            ? inspected.state === 'planned'
            : inspected.state === 'applied'), 'final refresh lacks exact completed release journal');
        finalizing = {
          ...bound,
          status: 'finalizing',
          originalJournalSha256: inspected.journalSha256,
          originalState: inspected.state,
        };
        signal?.throwIfAborted();
        await store.write(finalizingName, finalizing);
        signal?.throwIfAborted();
      }
      require(finalizing &&
        canonicalSha256(Object.keys(finalizing).sort()) ===
          canonicalSha256([...Object.keys(bound), 'status', 'originalJournalSha256', 'originalState'].sort()) &&
        Object.entries(bound).every(([key, value]) => canonicalSha256(finalizing?.[key]) === canonicalSha256(value)) &&
        finalizing.status === 'finalizing' &&
        typeof finalizing.originalJournalSha256 === 'string' &&
        /^[a-f0-9]{64}$/.test(finalizing.originalJournalSha256) &&
        finalizing.originalState === (released.noChanges ? 'planned' : 'applied'), 'finalizing source/schema differs');
      const finalizingSha256 = canonicalSha256(finalizing);
      const history = async () => {
        signal?.throwIfAborted();
        require(session.readPlanApplicationHistory === readHistory, 'final owning history changed');
        const original = await readHistory.call(session, released, signal);
        require(original.schemaVersion === 1 &&
          original.scope === 'exact-saved-plan-journal-history' &&
          original.receiptSha256 === canonicalSha256(released) &&
          original.incompleteArchives === 0 &&
          original.applicationOutcomeQualified === false &&
          original.retirementQualified === false &&
          original.matches.some(
            (entry) =>
              entry.journalSha256 === finalizing?.originalJournalSha256 &&
              entry.state === finalizing?.originalState &&
              entry.savedPlanSha256 === released.planSha256 &&
              entry.manifestSha256 === manifestSha256,
          ), 'finalizing original release journal unavailable');
        require(canonicalSha256(await optional(store, finalizingName)) === finalizingSha256 &&
          (await configuration()) === hash(release.configuration), 'finalizing packet/configuration changed');
        return original;
      };
      await history();
      const inspected = await journal();
      let final: PlanReceipt;
      if (canonicalSha256(inspected.receipt) === canonicalSha256(released)) {
        require(inspected.journalSha256 === finalizing.originalJournalSha256 &&
          inspected.state === finalizing.originalState, 'original release changed before final refresh');
        require((await optional(store, `${prefix}-final-plan.json`)) === undefined &&
          (await optional(store, `${prefix}-current-no-change-plan.json`)) ===
            undefined, 'published final differs from current release');
        signal?.throwIfAborted();
        final = await session.plan(env, signal);
        signal?.throwIfAborted();
      } else {
        require(inspected.state === 'planned', 'submitted final journal requires owner recovery');
        final = inspected.receipt as PlanReceipt;
      }
      await validate(final, 'final');
      const finalJournal = await journal();
      require(finalJournal.state === 'planned' &&
        canonicalSha256(finalJournal.receipt) === canonicalSha256(final) &&
        finalJournal.ordinaryRefreshEnabled === true &&
        typeof finalJournal.executionSha256 === 'string' &&
        /^[a-f0-9]{64}$/.test(finalJournal.executionSha256), 'final ordinary refresh-enabled execution unavailable');
      await projection(final, 'final');
      const emptyState = await session.readAppliedResourceFields(
        final,
        azureTerraformNetworkPowerSelections,
        env,
        signal,
      );
      require(canonicalSha256(emptyState) ===
        canonicalSha256({ [address]: null }), 'final applied control state remains');
      await history();
      require(canonicalSha256(await journal()) === canonicalSha256(finalJournal), 'final saved evidence changed');
      for (const suffix of ['final-plan', 'current-no-change-plan']) {
        const name = `${prefix}-${suffix}.json`,
          saved = await optional(store, name);
        if (saved !== undefined) {
          await validate(saved, 'final');
          require(canonicalSha256(saved) ===
            canonicalSha256(final), 'published final plan differs from exact saved bytes');
        }
      }
      for (const suffix of ['final-plan', 'current-no-change-plan']) {
        signal?.throwIfAborted();
        const name = `${prefix}-${suffix}.json`;
        if ((await optional(store, name)) === undefined) await store.write(name, final);
        signal?.throwIfAborted();
      }
      await history();
      require(canonicalSha256(await journal()) === canonicalSha256(finalJournal), 'final publication journal changed');
      const finalCloud = await observe();
      require(finalCloud.converged, 'terminal power evidence regressed');
      signal?.throwIfAborted();
      return {
        status: 'power-stage-complete' as const,
        engine: 'terraform' as const,
        planSha256: plan.planSha256,
        node,
        operation,
        resourceId: finalCloud.resourceId,
        vmId: finalCloud.vmId,
        mutationPlanSha256: (mutationReceipt as PlanReceipt).planSha256,
        releasePlanSha256: released.planSha256,
        currentNoChangePlanSha256: final.planSha256,
        cloudEvidenceSha256: canonicalSha256(finalCloud),
      };
    },
    { lockDriver: false },
  );
}
