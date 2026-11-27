import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
import type { AzExecApi } from '../az/exec';
import { canonicalEqual, canonicalSha256 } from './canonical';
import type { AzureNetworkUpdateInventory } from './network-update';
import { observeAzureTerraformNetworkPower } from './terraform-network-power';
import {
  azureTerraformNetworkRoutingSelections,
  buildAzureTerraformNetworkRoutingStage,
  validateAzureTerraformNetworkRoutingProjection,
  validateAzureTerraformNetworkRoutingReceipt,
} from './terraform-network-routing';
import { bindAzureTerraformNetworkRoutingPlan } from './terraform-network-routing-binding';
import { collectAzureTerraformNetworkRoutingConfiguration } from './terraform-network-routing-observation';
import { validateAzureTerraformNetworkRoutingObservation } from './terraform-network-routing-observation-validation';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const same = canonicalEqual;
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network routing execution: ${message}`);
}
function object(value: unknown): Record<string, unknown> {
  require(value && typeof value === 'object' && !Array.isArray(value), 'complete saved record required');
  return value as Record<string, unknown>;
}
function keys(value: unknown, expected: string[]) {
  const row = object(value);
  require(same(Object.keys(row).sort(), expected.toSorted()), 'saved packet schema differs');
  return row;
}
/** Internal routing owner. The serial public driver must separately authenticate full source/NIC/restart
 * history and complete operational acceptance. No CE freshness, forwarding or BGP exchange is inferred.
 */
export async function runAzureTerraformNetworkRoutingStage(
  plan: AzureCePlan,
  source: string,
  before: AzureNetworkUpdateInventory,
  current: AzureNetworkUpdateInventory,
  node: number,
  session: TerraformSession,
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
  const data = structuredClone({ plan, before, current, node, env });
  const inputSha256 = canonicalSha256(data);
  const stage = buildAzureTerraformNetworkRoutingStage(data.plan, source, data.before, data.current, node);
  const stageSha256 = canonicalSha256(stage);
  require(Number.isInteger(polling.attempts) &&
    polling.attempts > 0 &&
    Number.isFinite(polling.intervalMs) &&
    polling.intervalMs >= 0, 'bounded polling required');
  require(session.readConfigurationSha256 &&
    session.readPlannedResourcePaths &&
    session.readProposedResourcePaths, 'owning configuration and private paths capabilities required');
  const original = {
    configurationHash: session.readConfigurationSha256,
    configuration: session.readConfiguration,
    revise: session.reviseConfiguration,
    plan: session.plan,
    state: session.readPlanApplicationState,
    prior: session.readPlannedResourcePaths,
    proposed: session.readProposedResourcePaths,
    apply: session.apply,
    reconcile: session.reconcileApplyFromEvidence,
    read: store.read,
    write: store.write,
    verify: store.verify,
    exec: api.exec,
    wait: polling.wait,
  };
  const settings = { attempts: polling.attempts, intervalMs: polling.intervalMs },
    directory = store.directory,
    ownerSha256 = canonicalSha256(store.owner);
  require(ownerSha256 === canonicalSha256(azureUpgradeBinding(data.plan).owner), 'storage owner differs');
  const leased: { value: unknown; sha256: string }[] = [];
  const track = <T>(value: T): T => {
    const snapshot = structuredClone(value);
    leased.push({ value: snapshot, sha256: canonicalSha256(snapshot) });
    return snapshot;
  };
  const deadline = AbortSignal.any([AbortSignal.timeout(900_000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    require(same({ plan, before, current, node, env }, data) &&
      canonicalSha256(data) === inputSha256 &&
      canonicalSha256(stage) === stageSha256 &&
      leased.every((record) => canonicalSha256(record.value) === record.sha256) &&
      store.directory === directory &&
      canonicalSha256(store.owner) === ownerSha256 &&
      session.readConfigurationSha256 === original.configurationHash &&
      session.readConfiguration === original.configuration &&
      session.reviseConfiguration === original.revise &&
      session.plan === original.plan &&
      session.readPlanApplicationState === original.state &&
      session.readPlannedResourcePaths === original.prior &&
      session.readProposedResourcePaths === original.proposed &&
      session.apply === original.apply &&
      session.reconcileApplyFromEvidence === original.reconcile &&
      store.read === original.read &&
      store.write === original.write &&
      store.verify === original.verify &&
      api.exec === original.exec &&
      polling.wait === original.wait &&
      same(
        { attempts: polling.attempts, intervalMs: polling.intervalMs },
        settings,
      ), 'input or owning collaborator changed');
  };
  const step = async <T>(action: () => Promise<T>) => {
    seal();
    const aborted = Promise.withResolvers<never>(),
      onAbort = () => aborted.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([action(), aborted.promise]);
      seal();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const transport: AzExecApi = {
    async exec(command, args, options) {
      return await step(() => original.exec.call(api, command, args, options));
    },
  };
  const applied = Array.from({ length: node }, (_, i) => data.plan.nics.map((nic) => `${i + 1}:${nic.index}`)).flat();
  const observe = async () => {
    const power = await step(() =>
      observeAzureTerraformNetworkPower(data.plan, data.before, node, 'start', applied, transport, deadline),
    );
    require(power.converged &&
      power.powerState === 'running' &&
      same(power.inventory.nodes, data.current.nodes), 'selected node is not running with exact current NIC identity');
    const routing = await step(() =>
      collectAzureTerraformNetworkRoutingConfiguration(
        data.plan,
        source,
        data.before,
        data.current,
        node,
        applied,
        transport,
        deadline,
      ),
    );
    require(routing.status ===
      (stage.dependencies.length ? 'observed' : 'not-required'), 'current routing ownership/configuration unavailable');
    const finalPower = await step(() =>
      observeAzureTerraformNetworkPower(data.plan, data.before, node, 'start', applied, transport, deadline),
    );
    require(finalPower.converged &&
      finalPower.powerState === 'running' &&
      same(
        finalPower.inventory.nodes,
        power.inventory.nodes,
      ), 'current node/NIC identity changed during routing observation');
    return { schemaVersion: 1, stageSha256, routing, power: finalPower };
  };
  type Observation = Awaited<ReturnType<typeof observe>>;
  const validateObservation = (input: unknown, target = true): Observation =>
    validateAzureTerraformNetworkRoutingObservation(data.plan, source, data.before, data.current, node, input, target);
  const prior = (value: Observation) => value.routing.rows.every((row) => row.installedIp === row.previousIp);
  const target = (value: Observation) => value.routing.rows.every((row) => row.installedIp === row.currentIp);
  const poll = async () => {
    for (let attempt = 0; attempt < settings.attempts; attempt++) {
      const value = await observe();
      validateObservation(value, false);
      if (target(value)) return validateObservation(value);
      if (attempt + 1 < settings.attempts) await step(() => original.wait(settings.intervalMs));
    }
    throw Error('Azure Terraform network routing execution: selected routing addresses have not converged');
  };
  const prefix = `${data.plan.planId}-terraform-network-node-${node}-routing`;
  const read = async (name: string) => {
    try {
      return track(await step(() => original.read.call(store, name)));
    } catch (error) {
      seal();
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  };
  const write = (name: string, value: unknown) => {
    const snapshot = track(value);
    return step(() => original.write.call(store, name, snapshot));
  };
  const configuration = async () => {
    const hash = await step(() => original.configurationHash.call(session));
    require([stage.nicConfigurationSha256, stage.configurationSha256, stage.releasedConfigurationSha256].includes(
      hash,
    ), 'private configuration differs');
    return hash;
  };
  const validateReceipt = (receipt: PlanReceipt, phase: 'mutation' | 'release') =>
    validateAzureTerraformNetworkRoutingReceipt(data.plan, source, data.before, data.current, stage, receipt, phase);
  seal();
  await step(() => original.verify.call(store));
  const unlock = await acquireProcessLock(`${directory}/.terraform-network-routing-execution-lock`);
  try {
    seal();
    await step(() => original.verify.call(store));
    const prepared = {
      schemaVersion: 2,
      kind: 'dependent-routing',
      stage,
      before: data.before,
      current: data.current,
      appliedNics: applied,
    };
    const saved = await read(`${prefix}-prepared.json`);
    if (saved === undefined) {
      for (const suffix of [
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
      ])
        require((await read(`${prefix}-${suffix}.json`)) ===
          undefined, 'prepared history missing after later publication');
      require((await configuration()) === stage.nicConfigurationSha256, 'pinned NIC source revision required');
      require((await step(() => original.configuration.call(session, stage.nicConfigurationSha256))) ===
        stage.nicConfiguration, 'pinned source bytes differ');
      require(prior(validateObservation(await observe(), false)), 'unsubmitted routing baseline changed');
      await write(`${prefix}-prepared.json`, prepared);
    } else require(same(saved, prepared), 'saved routing preparation differs');
    // Later publications authenticate their complete prerequisite history. A lost response
    // may leave the next packet absent; it cannot erase an already published prerequisite.
    const published = new Map<string, unknown>();
    for (const suffix of [
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
    ])
      published.set(suffix, await read(`${prefix}-${suffix}.json`));
    const historyRequired = (suffixes: string[]) => {
      for (const suffix of suffixes)
        require(published.get(suffix) !== undefined, 'published prerequisite history missing');
    };
    for (const phase of ['mutation', 'release']) {
      if (published.get(`${phase}-outcome`) !== undefined || published.get(`${phase}-complete`) !== undefined)
        historyRequired([`${phase}-plan`, `${phase}-binding`]);
      if (published.get(`${phase}-complete`) !== undefined) historyRequired([`${phase}-outcome`]);
    }
    if (
      [
        'release-plan',
        'release-binding',
        'release-outcome',
        'release-complete',
        'final-plan',
        'current-no-change-plan',
      ].some((suffix) => published.get(suffix) !== undefined)
    )
      historyRequired(['mutation-plan', 'mutation-binding', 'mutation-outcome', 'mutation-complete']);
    if (['final-plan', 'current-no-change-plan'].some((suffix) => published.get(suffix) !== undefined))
      historyRequired(['release-plan', 'release-binding', 'release-outcome', 'release-complete']);
    for (const phase of ['mutation', 'release'] as const) {
      const phasePrefix = `${prefix}-${phase}`,
        next = phase === 'mutation' ? stage.configuration : stage.releasedConfiguration,
        nextSha256 = phase === 'mutation' ? stage.configurationSha256 : stage.releasedConfigurationSha256;
      let completion = await read(`${phasePrefix}-complete.json`);
      let retainedOutcome = await read(`${phasePrefix}-outcome.json`);
      if (completion === undefined && (await configuration()) !== nextSha256) {
        const actual = await configuration(),
          baseline = validateObservation(await observe(), phase === 'release');
        require(phase === 'mutation'
          ? actual === stage.nicConfigurationSha256 && prior(baseline)
          : actual === stage.configurationSha256 &&
              target(baseline), 'cloud or configuration changed before routing revision');
        await step(() => original.revise.call(session, actual, next));
      }
      let input = await read(`${phasePrefix}-plan.json`);
      if (input === undefined) {
        require(completion === undefined &&
          retainedOutcome === undefined &&
          (await read(`${phasePrefix}-binding.json`)) === undefined &&
          (await configuration()) === nextSha256, 'plan history missing after later publication');
        const cloud = validateObservation(await observe(), phase === 'release');
        require(phase === 'release' ? target(cloud) : prior(cloud), 'unsubmitted routing baseline differs');
        input = await step(() => original.plan.call(session, data.env, deadline));
        validateReceipt(input as PlanReceipt, phase);
        await write(`${phasePrefix}-plan.json`, input);
      }
      const receipt = track(input as PlanReceipt);
      validateReceipt(receipt, phase);
      await step(() =>
        bindAzureTerraformNetworkRoutingPlan(
          data.plan,
          source,
          data.before,
          data.current,
          stage,
          receipt,
          phase,
          session,
          store,
          data.env,
          deadline,
        ),
      );
      const validateCompletion = (value: unknown) => {
        const record = keys(value, ['schemaVersion', 'receiptSha256', 'outcome']);
        require(record.schemaVersion === 1 &&
          record.receiptSha256 === canonicalSha256(receipt), 'saved completion receipt differs');
        require(retainedOutcome !== undefined &&
          same(record.outcome, retainedOutcome), 'saved completion and immutable outcome differ');
        return validateObservation(record.outcome);
      };
      if (completion === undefined) {
        require((await configuration()) === nextSha256, 'routing revision differs before submission');
        let state = await step(() => original.state.call(session, receipt));
        require(['planned', 'applying', 'applied'].includes(state), 'authoritative plan application state required');
        if (phase === 'release')
          require(receipt.noChanges && state === 'planned', 'reference release must be an unsubmitted no-change plan');
        if (state === 'planned') {
          const cloud = validateObservation(await observe(), phase === 'release');
          require(phase === 'release' ? target(cloud) : prior(cloud), 'planned cloud baseline changed');
          if (!receipt.noChanges) {
            try {
              await step(() => original.apply.call(session, receipt, data.env, deadline));
            } catch (error) {
              seal();
              state = await step(() => original.state.call(session, receipt));
              if (state === 'planned') throw error;
            }
            state = await step(() => original.state.call(session, receipt));
          }
        }
        const freshOutcome = await poll();
        if (retainedOutcome === undefined) {
          retainedOutcome = freshOutcome;
          await write(`${phasePrefix}-outcome.json`, retainedOutcome);
        }
        const outcome = validateObservation(retainedOutcome);
        state = await step(() => original.state.call(session, receipt));
        if (receipt.noChanges) require(state === 'planned', 'no-change routing plan is no longer unsubmitted');
        else if (state === 'applying') {
          await step(() => original.reconcile.call(session, receipt, canonicalSha256(outcome)));
          require((await step(() => original.state.call(session, receipt))) ===
            'applied', 'reconciliation did not establish applied state');
        } else require(state === 'applied', 'mutation lacks an authoritative applied outcome');
        completion = { schemaVersion: 1, receiptSha256: canonicalSha256(receipt), outcome };
        validateCompletion(completion);
        await write(`${phasePrefix}-complete.json`, completion);
      } else validateCompletion(completion);
      await poll();
    }
    require((await configuration()) ===
      stage.releasedConfigurationSha256, 'restored computed reference revision differs');
    const final = track(await step(() => original.plan.call(session, data.env, deadline)));
    validateReceipt(final, 'release');
    require(final.noChanges, 'final refresh plan changes retained resources');
    const finalUnsubmitted = async () =>
      require((await step(() => original.state.call(session, final))) ===
        'planned', 'final no-change plan is no longer unsubmitted');
    await finalUnsubmitted();
    const selections = azureTerraformNetworkRoutingSelections(stage),
      selectionsSha256 = canonicalSha256(selections);
    const priorFields = await step(() => original.prior.call(session, final, selections, data.env, deadline));
    require(canonicalSha256(selections) === selectionsSha256, 'selected paths changed');
    const proposedFields = await step(() => original.proposed.call(session, final, selections, data.env, deadline));
    require(canonicalSha256(selections) === selectionsSha256, 'selected paths changed');
    validateAzureTerraformNetworkRoutingProjection(
      data.plan,
      source,
      data.before,
      data.current,
      stage,
      final,
      'release',
      priorFields,
      proposedFields,
    );
    await finalUnsubmitted();
    const cloud = await poll();
    await finalUnsubmitted();
    const terminal = { schemaVersion: 1, receipt: final, prior: priorFields, proposed: proposedFields, cloud };
    const validateTerminal = (input: unknown) => {
      const record = keys(input, ['schemaVersion', 'receipt', 'prior', 'proposed', 'cloud']);
      require(record.schemaVersion === 1, 'saved final schema differs');
      const receipt = record.receipt as PlanReceipt;
      validateReceipt(receipt, 'release');
      require(receipt.noChanges, 'saved final plan changes retained resources');
      validateAzureTerraformNetworkRoutingProjection(
        data.plan,
        source,
        data.before,
        data.current,
        stage,
        receipt,
        'release',
        record.prior,
        record.proposed,
      );
      validateObservation(record.cloud);
    };
    validateTerminal(terminal);
    const savedFinal = await read(`${prefix}-final-plan.json`);
    if (savedFinal === undefined) {
      require((await read(`${prefix}-current-no-change-plan.json`)) ===
        undefined, 'immutable final history missing after current publication');
      await write(`${prefix}-final-plan.json`, terminal);
    } else validateTerminal(savedFinal);
    await finalUnsubmitted();
    await write(`${prefix}-current-no-change-plan.json`, terminal);
    seal();
    return {
      status: 'routing-stage-complete' as const,
      engine: 'terraform' as const,
      node,
      planSha256: data.plan.planSha256,
      configurationSha256: stage.releasedConfigurationSha256,
      currentNoChangePlanSha256: final.planSha256,
      currentEvidenceSha256: canonicalSha256(cloud),
      forwarding: 'unknown' as const,
      bgpExchange: 'unknown' as const,
      freshness: 'unqualified' as const,
    };
  } finally {
    await unlock();
  }
}
