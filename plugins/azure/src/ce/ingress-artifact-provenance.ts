import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import { validateCeIngressHistoricalPlan } from '../../../platform/src/ce/ingress-lifecycle';
import { canonicalEqual, canonicalSha256 } from './canonical';
import { validateAzureIngressSource } from './ingress-source';
import { azureUpgradeBinding } from './terraform-upgrade';
import {
  azureCurrentTrafficArtifactIdentity,
  validateAzureCurrentTrafficHistory,
  validateAzureTrafficCheckpoint,
} from './traffic-artifact-provenance';
import type { AzureCePlan } from './types';

type Json = Record<string, unknown>;
const require = (value: unknown, message: string) => {
  if (!value) throw new Error(`Azure ingress history: ${message}`);
};
const same = canonicalEqual;
const object = (value: unknown): Json => {
  require(value && typeof value === 'object' && !Array.isArray(value), 'malformed record');
  return value as Json;
};
const keys = (value: Json, expected: string[]) =>
  require(Object.keys(value).sort().join(',') === expected.toSorted().join(','), 'record fields differ');
const identity = (value: unknown) => typeof value === 'string' && value.length > 0;
const sha = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const time = (value: unknown) => {
  require(typeof value === 'string' &&
    Number.isFinite(Date.parse(value)) &&
    Date.parse(value) <= Date.now(), 'historical collection time differs');
  return Date.parse(String(value));
};
export const isAzureIngressHistoricalArtifact = (name: string) =>
  !!azureCurrentTrafficArtifactIdentity(name) ||
  name === 'azure-platform-ingress.json' ||
  name === 'azure-traffic-probe.json' ||
  /^azure-ingress-source-[a-f0-9]{64}\.json$/.test(name) ||
  /^ingress-(?:plan|checkpoint|origin-checkpoint)-[a-f0-9]{24}\.json$/.test(name) ||
  /^azure-ce-[a-f0-9]{24}-[a-zA-Z0-9._-]+-traffic-probe\.json$/.test(name);

/** Called only before atomic retirement and after independent full platform/cloud absence. No history establishes live acceptance. */
export function verifyAzureIngressHistoricalArtifacts(
  base: AzureCePlan,
  rawDrain: unknown,
  contract: VerifiedIngressContract,
  records: Map<string, unknown>,
) {
  const selectedRecords = [...records].filter(([name]) => isAzureIngressHistoricalArtifact(name));
  if (!selectedRecords.length) return;
  const binding = azureUpgradeBinding(base),
    owner = binding.owner,
    drain = object(rawDrain);
  require(same(drain.owner, owner) &&
    drain.ingressContractFingerprint === contract.fingerprint &&
    identity(drain.siteContractFingerprint) &&
    Array.isArray(drain.listeners) &&
    Array.isArray(drain.origins) &&
    Array.isArray(drain.sites), 'drain provenance missing');
  const journals = new Map<string, ReturnType<typeof validateAzureIngressSource>>();
  for (const [name, raw] of selectedRecords)
    if (name.startsWith('azure-ingress-source-')) {
      const source = validateAzureIngressSource(raw, owner, contract.fingerprint);
      require(source.plan.siteName === base.siteName &&
        name === `azure-ingress-source-${source.plan.planSha256}.json`, 'source site or filename differs');
      journals.set(source.plan.planSha256, source);
    }
  const plans = new Map<string, ReturnType<typeof validateCeIngressHistoricalPlan>>();
  for (const [name, raw] of selectedRecords)
    if (name.startsWith('ingress-plan-')) {
      const plan = validateCeIngressHistoricalPlan(raw, owner, contract, String(drain.siteContractFingerprint));
      const source = plan.source;
      require(source, 'exact source binding missing');
      const journal = journals.get(String(source?.sourcePlanSha256));
      require(journal &&
        source?.sourceArtifactSha256 === canonicalSha256(journal.record) &&
        same(plan.material.intent, journal.intent) &&
        same(plan.material.selections, journal.selections) &&
        time(journal.record.observedAt) <= time(plan.observedAt) &&
        name === `ingress-plan-${plan.id}.json`, 'plan/source identity join differs');
      plans.set(plan.id, plan);
    }
  function checkpoint(name: string, id: string, origin: boolean) {
    const raw = records.get(name);
    if (raw === undefined) return undefined;
    const record = object(raw),
      plan = plans.get(id);
    require(plan &&
      record.planSha256 === plan.sha256 &&
      ['creating', 'created', 'deleted'].includes(String(record.phase)), 'checkpoint plan differs');
    if (record.phase === 'creating') keys(record, ['phase', 'planSha256']);
    else {
      keys(record, ['phase', 'planSha256', 'uid', 'observedAt', ...(origin ? [] : ['listener', 'routes', 'traffic'])]);
      require(identity(record.uid) &&
        time(record.observedAt) >= time(plan?.observedAt), 'checkpoint resource identity differs');
      if (!origin)
        require(record.listener === 'configured' &&
          record.routes === 'unknown' &&
          record.traffic === 'unknown', 'configuration checkpoint state differs');
    }
    return record;
  }
  const checkpoints = new Map<string, { listener?: Json; origin?: Json }>();
  for (const [id, plan] of plans) {
    const listener = checkpoint(`ingress-checkpoint-${id}.json`, id, false);
    const origin = checkpoint(`ingress-origin-checkpoint-${id}.json`, id, true);
    require(!listener || origin, 'listener checkpoint has no preceding origin');
    require(!listener || origin?.phase !== 'creating', 'listener preceded origin completion');
    const corrected = listener?.phase === 'deleted' && origin?.phase === 'deleted';
    const matchingListeners = (drain.listeners as unknown[]).map(object).filter((row) => row.id === id);
    require(matchingListeners.length <= 1, 'duplicate drain listener');
    if (listener && listener.phase !== 'creating' && !corrected) {
      require(matchingListeners.length === 1 &&
        matchingListeners[0].name === plan.request.metadata.name &&
        matchingListeners[0].namespace === plan.request.metadata.namespace, 'listener not bound to completed drain');
    } else require(matchingListeners.length === 0, 'incomplete or corrected listener entered current drain');
    if (origin && origin.phase !== 'creating' && !corrected) {
      const origins = (drain.origins as unknown[]).map(object).filter((row) => {
        const ref = object(row.origin);
        return (
          ref.name === plan.material.intent.originPool.name &&
          ref.namespace === plan.material.intent.originPool.namespace
        );
      });
      require(origins.length === 1, 'origin not bound to completed drain');
      const snapshot = origins[0],
        ref = object(snapshot.origin);
      require(snapshot.schemaVersion === 1 &&
        same(snapshot.owner, owner) &&
        ref.uid === origin.uid &&
        snapshot.contractFingerprint === contract.fingerprint &&
        identity(snapshot.resourceVersion) &&
        sha(snapshot.specSha256), 'origin drain UID or provenance differs');
      time(snapshot.observedAt);
    }
    if (!corrected) {
      const site = (drain.sites as unknown[])
        .map(object)
        .filter((row) => object(row.binding).siteName === base.siteName);
      require(site.length === 1 &&
        same(site[0].binding, plan.material.selections[0].binding) &&
        site[0].siteUid === plan.material.placements[0].siteUid, 'logical site UID/drain join differs');
    }
    checkpoints.set(id, { listener, origin });
  }
  for (const [name] of selectedRecords)
    if (/^ingress-(?:checkpoint|origin-checkpoint)-/.test(name))
      require(plans.has(String(name.match(/([a-f0-9]{24})\.json$/)?.[1])), 'orphan checkpoint has no compiled plan');
  const marker = records.get('azure-platform-ingress.json');
  if (marker !== undefined) {
    const value = object(marker);
    keys(value, [
      'schemaVersion',
      'engine',
      'sourcePlanSha256',
      'sourceArtifactSha256',
      'configurationSha256',
      'ingressPlanId',
      'contractFingerprint',
    ]);
    const plan = plans.get(String(value.ingressPlanId)),
      journal = journals.get(String(value.sourcePlanSha256));
    require(value.schemaVersion === 2 &&
      value.engine === base.engine &&
      value.contractFingerprint === contract.fingerprint &&
      plan &&
      journal &&
      value.sourceArtifactSha256 === canonicalSha256(journal.record) &&
      value.configurationSha256 === journal.configurationSha256 &&
      same(plan.source, {
        schemaVersion: 1,
        kind: 'azure-ce-source',
        sourcePlanSha256: value.sourcePlanSha256,
        sourceArtifactSha256: value.sourceArtifactSha256,
      }), 'active marker source/plan differs');
  }
  const traffic = new Map<string, Json>();
  for (const [name, raw] of selectedRecords)
    if (name === 'azure-traffic-probe.json' || name.endsWith('-traffic-probe.json')) {
      const state = object(raw),
        journal = journals.get(String(state.planSha256));
      require(journal, 'traffic source journal missing');
      const sourcePlan = journal?.plan as AzureCePlan;
      if (name !== 'azure-traffic-probe.json') {
        const actions = sourcePlan.actions.filter(
          (row) => row.kind === 'traffic-gate' && name === `${sourcePlan.planId}-${row.id}-traffic-probe.json`,
        );
        require(sourcePlan.engine === 'native' && actions.length === 1, 'traffic execution filename differs');
      } else require(sourcePlan.engine === 'terraform', 'default traffic checkpoint is not Terraform-owned');
      require(same(state.sourceIdentity, journal?.record.sourceIdentity), 'traffic/ingress source attachment differs');
      const evidence = validateAzureTrafficCheckpoint(sourcePlan, state);
      if (evidence) traffic.set(`${sourcePlan.planSha256}/${name}`, evidence);
    }
  // Each current sample is a separate immutable historical pair. An interrupted
  // checkpoint without a receipt is retained as unaccepted history, even if complete.
  for (const [name, raw] of selectedRecords) {
    const current = azureCurrentTrafficArtifactIdentity(name);
    if (!current) continue;
    const checkpointName = `${current.checkpointKey}.json`;
    const checkpoint = current.receipt ? records.get(checkpointName) : raw;
    require(checkpoint !== undefined, 'current sample receipt has no checkpoint');
    const state = object(checkpoint),
      journal = journals.get(String(state.planSha256));
    require(journal, 'current sample source journal missing');
    require(same(state.sourceIdentity, journal?.record.sourceIdentity), 'current sample source attachment differs');
    const sourcePlan = journal?.plan as AzureCePlan;
    validateAzureTrafficCheckpoint(sourcePlan, checkpoint);
    if (current.receipt) validateAzureCurrentTrafficHistory(sourcePlan, current.checkpointKey, checkpoint, raw);
  }
  // Public native action receipts must agree with their owning lifecycle/checkpoint records.
  for (const [name, raw] of records)
    if (name.startsWith('native-action-')) {
      const action = object(raw),
        evidence = object(action.evidence);
      if (evidence.ingressPlanId !== undefined) {
        const plan = plans.get(String(evidence.ingressPlanId)),
          checkpoint = checkpoints.get(String(evidence.ingressPlanId))?.listener;
        require(plan &&
          checkpoint &&
          evidence.uid === checkpoint.uid &&
          evidence.contractFingerprint === contract.fingerprint &&
          evidence.listener === 'configured', 'public ingress action/lifecycle receipt differs');
      }
      if (evidence.source === 'azure:vm-run-command') {
        const journal = journals.get(String(action.sourcePlanSha256));
        require(journal, 'public traffic source missing');
        const file = `${journal?.plan.planId}-${String(action.actionId)}-traffic-probe.json`;
        require(same(
          evidence,
          traffic.get(`${journal?.plan.planSha256}/${file}`),
        ), 'public traffic action/checkpoint receipt differs');
      }
    }
}
