import { createHash } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import type { AzureNetworkUpdateInventory } from './network-update';
import {
  buildAzureTerraformNetworkRoutingStage,
  validateAzureTerraformNetworkRoutingPrepared,
  validateAzureTerraformNetworkRoutingProjection,
  validateAzureTerraformNetworkRoutingReceipt,
} from './terraform-network-routing';
import { validateAzureTerraformNetworkRoutingObservation } from './terraform-network-routing-observation-validation';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const same = (a: unknown, b: unknown) => canonicalSha256(a) === canonicalSha256(b);
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network routing prefix history: ${message}`);
}
function keys(value: unknown, names: string[]): Record<string, unknown> {
  require(value && typeof value === 'object' && !Array.isArray(value), 'saved object required');
  const row = value as Record<string, unknown>;
  require(same(Object.keys(row).sort(), names.toSorted()), 'saved packet schema differs');
  return row;
}

/** Private read-only routing packet prefix, including durable packets before a lost serial update.
 * The caller independently authenticates original source, NIC/start/serial prerequisites and actual
 * runner journals. Historical configuration installation never qualifies current CE traffic or freshness.
 */
export async function readAzureTerraformNetworkRoutingPrefixHistory(
  plan: AzureCePlan,
  source: string,
  before: AzureNetworkUpdateInventory,
  current: AzureNetworkUpdateInventory,
  node: number,
  store: Pick<CeDeploymentStore, 'owner' | 'read' | 'verify'>,
  signal?: AbortSignal,
) {
  const data = structuredClone({ plan, before, current, node }),
    inputSha256 = canonicalSha256(data),
    original = { read: store.read, verify: store.verify },
    ownerSha256 = canonicalSha256(store.owner);
  verifyAzureCePlan(data.plan);
  require(ownerSha256 === canonicalSha256(azureUpgradeBinding(data.plan).owner), 'storage owner differs');
  let retainedCurrent = data.current,
    stage = buildAzureTerraformNetworkRoutingStage(data.plan, source, data.before, retainedCurrent, node);
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    require(canonicalSha256({ plan, before, current, node }) === inputSha256 &&
      canonicalSha256(data) === inputSha256 &&
      canonicalSha256(store.owner) === ownerSha256 &&
      store.read === original.read &&
      store.verify === original.verify, 'input or owning reader changed');
  };
  const step = async <T>(action: () => Promise<T>) => {
    seal();
    const abort = Promise.withResolvers<never>(),
      onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const value = await Promise.race([action(), abort.promise]);
      seal();
      return value;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  await step(() => original.verify.call(store));
  const prefix = `${data.plan.planId}-terraform-network-node-${node}-routing`,
    suffixes = [
      'prepared',
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
    ],
    records = new Map<string, unknown>(),
    packetSha256ByName: Record<string, string> = {};
  for (const suffix of suffixes) {
    const name = `${prefix}-${suffix}.json`;
    try {
      const value = await step(() => original.read.call(store, name));
      records.set(suffix, structuredClone(value));
      packetSha256ByName[name] = canonicalSha256(value);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  for (let i = 1; i < suffixes.length; i++)
    require(!records.has(suffixes[i]) || records.has(suffixes[i - 1]), 'orphan later routing packet');
  if (records.has('prepared')) {
    const qualified = validateAzureTerraformNetworkRoutingPrepared(
      data.plan,
      source,
      data.before,
      data.current,
      node,
      records.get('prepared'),
    );
    retainedCurrent = qualified.current;
    stage = qualified.stage;
  }
  const receipt = (value: unknown, phase: 'mutation' | 'release') => {
    validateAzureTerraformNetworkRoutingReceipt(
      data.plan,
      source,
      data.before,
      retainedCurrent,
      stage,
      value as PlanReceipt,
      phase,
    );
    return structuredClone(value as PlanReceipt);
  };
  const observation = (value: unknown) =>
    validateAzureTerraformNetworkRoutingObservation(data.plan, source, data.before, retainedCurrent, node, value);
  const receipts: Partial<Record<'mutation' | 'release' | 'final' | 'current', PlanReceipt>> = {};
  for (const phase of ['mutation', 'release'] as const) {
    if (!records.has(`${phase}-plan`)) continue;
    const saved = receipt(records.get(`${phase}-plan`), phase);
    receipts[phase] = saved;
    if (records.has(`${phase}-binding`)) {
      const binding = keys(records.get(`${phase}-binding`), [
        'schemaVersion',
        'kind',
        'phase',
        'planSha256',
        'stageSha256',
        'beforeSha256',
        'currentSha256',
        'receiptSha256',
        'providerLockSha256',
        'prior',
        'proposed',
      ]);
      require(same(
        { ...binding, prior: undefined, proposed: undefined },
        {
          schemaVersion: 1,
          kind: 'dependent-routing',
          phase,
          planSha256: data.plan.planSha256,
          stageSha256: canonicalSha256(stage),
          beforeSha256: canonicalSha256(data.before),
          currentSha256: canonicalSha256(retainedCurrent),
          receiptSha256: canonicalSha256(saved),
          providerLockSha256: saved.providerLockSha256,
          prior: undefined,
          proposed: undefined,
        },
      ), 'saved binding identity differs');
      validateAzureTerraformNetworkRoutingProjection(
        data.plan,
        source,
        data.before,
        retainedCurrent,
        stage,
        saved,
        phase,
        binding.prior,
        binding.proposed,
      );
    }
    if (records.has(`${phase}-outcome`)) observation(records.get(`${phase}-outcome`));
    if (records.has(`${phase}-complete`)) {
      const complete = keys(records.get(`${phase}-complete`), ['schemaVersion', 'receiptSha256', 'outcome']);
      require(complete.schemaVersion === 1 &&
        complete.receiptSha256 === canonicalSha256(saved) &&
        same(complete.outcome, records.get(`${phase}-outcome`)), 'saved completion differs from exact receipt/outcome');
    }
  }
  for (const [suffix, phase] of [
    ['final-plan', 'final'],
    ['current-no-change-plan', 'current'],
  ] as const)
    if (records.has(suffix)) {
      const terminal = keys(records.get(suffix), ['schemaVersion', 'receipt', 'prior', 'proposed', 'cloud']);
      require(terminal.schemaVersion === 1, 'saved final schema differs');
      const final = receipt(terminal.receipt, 'release');
      require(final.noChanges, 'final refresh changes retained resources');
      validateAzureTerraformNetworkRoutingProjection(
        data.plan,
        source,
        data.before,
        retainedCurrent,
        stage,
        final,
        'release',
        terminal.prior,
        terminal.proposed,
      );
      observation(terminal.cloud);
      receipts[phase] = final;
    }
  await step(() => original.verify.call(store));
  for (const suffix of suffixes) {
    const name = `${prefix}-${suffix}.json`;
    try {
      const value = await step(() => original.read.call(store, name));
      require(records.has(suffix) && canonicalSha256(value) === packetSha256ByName[name], 'packet changed or appeared');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      require(!records.has(suffix), 'packet disappeared');
    }
  }
  seal();
  return {
    schemaVersion: 1 as const,
    scope: 'network-routing-packet-prefix-history' as const,
    planSha256: data.plan.planSha256,
    node,
    sourceConfigurationSha256: createHash('sha256').update(source).digest('hex'),
    lastPacket: suffixes.findLast((suffix) => records.has(suffix)) ?? null,
    allPacketsPresent: records.size === suffixes.length,
    receipts,
    packetSha256ByName,
    forwarding: 'unknown' as const,
    bgpExchange: 'unknown' as const,
    freshness: 'unqualified' as const,
    currentOperationalAcceptanceQualified: false as const,
    retirementQualified: false as const,
  };
}
