import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { validateAzureTrafficSourceIdentity } from './traffic-source';
import type { AzureCePlan } from './types';

type Json = Record<string, unknown>;
function require(condition: unknown) {
  if (!condition) throw new Error('Persisted Azure traffic evidence checkpoint differs from the owning plan');
}
function object(value: unknown): Json {
  require(value && typeof value === 'object' && !Array.isArray(value));
  return value as Json;
}
function keys(value: Json, required: string[], optional: string[] = []) {
  require(
    required.every((key) => key in value) &&
      Object.keys(value).every((key) => required.includes(key) || optional.includes(key)),
  );
}
function time(value: unknown) {
  require(typeof value === 'string' && Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now());
  return Date.parse(String(value));
}
const digest = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const status = (value: unknown) => Number.isInteger(value) && Number(value) >= 100 && Number(value) <= 599;

/** Historical provenance only; never promotes a stored receipt to current live traffic evidence. */
export function validateAzureTrafficCheckpoint(plan: AzureCePlan, input: unknown) {
  verifyAzureCePlan(plan);
  require(plan.intent.ingress?.mode === 'platform-http');
  const probe = plan.intent.ingress?.mode === 'platform-http' ? plan.intent.ingress.probe : undefined;
  const state = object(input);
  keys(
    state,
    [
      'schemaVersion',
      'engine',
      'planSha256',
      'sourceVmResourceId',
      'sourceVmId',
      'sourceNicResourceId',
      'sourcePrivateAddress',
      'sourceIdentity',
      'sourceObservedAt',
      'phase',
    ],
    ['attempts', 'evidence'],
  );
  require(
    state.schemaVersion === 2 &&
      state.engine === plan.engine &&
      state.planSha256 === plan.planSha256 &&
      ['ready', 'complete'].includes(String(state.phase)),
  );
  const source = validateAzureTrafficSourceIdentity(plan, state.sourceIdentity);
  require(
    state.sourceVmResourceId === source.resourceId &&
      state.sourceVmId === source.vmId &&
      state.sourceNicResourceId === source.nicResourceId &&
      state.sourcePrivateAddress === source.privateAddress,
  );
  let previous = time(state.sourceObservedAt);
  if (state.attempts !== undefined) {
    require(Array.isArray(state.attempts) && state.attempts.length > 0 && state.attempts.length <= 40);
    for (const raw of state.attempts as unknown[]) {
      const attempt = object(raw);
      keys(attempt, ['stderrPresent', 'observedAt'], ['httpStatus', 'bodySha256']);
      require(
        typeof attempt.stderrPresent === 'boolean' &&
          ((attempt.httpStatus === undefined && attempt.bodySha256 === undefined) ||
            ((attempt.httpStatus === 0 || status(attempt.httpStatus)) && digest(attempt.bodySha256))),
      );
      require(
        attempt.stderrPresent ||
          attempt.httpStatus !== probe?.expectedStatus ||
          attempt.bodySha256 !== probe?.expectedBodySha256,
      );
      const collected = time(attempt.observedAt);
      require(collected >= previous);
      previous = collected;
    }
  }
  if (state.phase === 'ready') {
    require(state.evidence === undefined);
    return undefined;
  }
  const evidence = object(state.evidence);
  keys(evidence, [
    'status',
    'source',
    'sourceVmResourceId',
    'sourceVmId',
    'sourcePrivateAddress',
    'httpStatus',
    'bodySha256',
    'expectedStatus',
    'expectedBodySha256',
    'observedAt',
  ]);
  require(
    probe &&
      evidence.status === 'healthy' &&
      evidence.source === 'azure:vm-run-command' &&
      evidence.sourceVmResourceId === source.resourceId &&
      evidence.sourceVmId === source.vmId &&
      evidence.sourcePrivateAddress === source.privateAddress &&
      evidence.httpStatus === probe.expectedStatus &&
      evidence.bodySha256 === probe.expectedBodySha256 &&
      evidence.expectedStatus === probe.expectedStatus &&
      evidence.expectedBodySha256 === probe.expectedBodySha256 &&
      time(evidence.observedAt) >= previous,
  );
  return evidence;
}

const currentName =
  /^traffic-([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})(-current-sample)?\.json$/;
export function azureCurrentTrafficArtifactIdentity(name: string) {
  const match = currentName.exec(name);
  return match ? { sampleId: match[1], checkpointKey: `traffic-${match[1]}`, receipt: !!match[2] } : undefined;
}

/** Validates retained sample provenance for retirement only, never current traffic or CE heartbeat. */
export function validateAzureCurrentTrafficHistory(
  plan: AzureCePlan,
  checkpointKey: string,
  checkpoint: unknown,
  input: unknown,
) {
  const name = azureCurrentTrafficArtifactIdentity(`${checkpointKey}-current-sample.json`);
  require(name?.receipt);
  const evidence = validateAzureTrafficCheckpoint(plan, checkpoint),
    state = object(checkpoint),
    receipt = object(input);
  keys(receipt, [
    'schemaVersion',
    'status',
    'scope',
    'sampleId',
    'planSha256',
    'owner',
    'checkpointKey',
    'checkpointSha256',
    'sourceIdentitySha256',
    'startedAt',
    'completedAt',
    'evidence',
  ]);
  require(
    evidence &&
      receipt.schemaVersion === 1 &&
      receipt.status === 'healthy' &&
      receipt.scope === 'reviewed-vm-http-content-probe' &&
      receipt.sampleId === name?.sampleId &&
      receipt.checkpointKey === checkpointKey &&
      receipt.planSha256 === plan.planSha256 &&
      canonicalSha256(receipt.owner) ===
        canonicalSha256({
          deploymentId: plan.deploymentName,
          engine: plan.engine,
          provider: 'azure',
          account: plan.subscription.id,
          region: plan.region,
        }) &&
      receipt.checkpointSha256 === canonicalSha256(checkpoint) &&
      receipt.sourceIdentitySha256 === canonicalSha256(state.sourceIdentity) &&
      canonicalSha256(receipt.evidence) === canonicalSha256(evidence),
  );
  const started = time(receipt.startedAt),
    completed = time(receipt.completedAt),
    source = time(state.sourceObservedAt),
    observed = time(evidence?.observedAt);
  require(
    new Date(started).toISOString() === receipt.startedAt &&
      new Date(completed).toISOString() === receipt.completedAt &&
      completed >= started &&
      completed - started <= 180000 &&
      source >= started &&
      source <= observed &&
      observed <= completed,
  );
  return receipt;
}
