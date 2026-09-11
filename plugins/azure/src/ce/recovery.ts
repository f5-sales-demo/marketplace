import type { AzExecApi } from '../az/exec';
import { canonicalSha256, fingerprintObservation, safeHexEqual } from './canonical';
import type {
  AzureCeCheckpoint,
  AzureCeLegacyCheckpoint,
  AzureCeObservation,
  AzureCePlan,
  AzureCeStoredCheckpoint,
} from './types';
import { AZURE_CE_CHECKPOINT_SCHEMA_VERSION, AZURE_CE_SCHEMA_VERSION } from './types';

const CHECKPOINT_STATES = new Set(['running', 'partial', 'complete']);
const QUOTA_BLOCKERS = new Set([
  'image-unavailable',
  'image-observation-failed',
  'vm-size-unavailable',
  'sku-restricted',
  'nic-limit',
  'ce-minimum-size',
  'no-compatible-vm-size',
  'quota-observation-failed',
  'quota',
  'policy-deny',
  'route-server-unavailable',
]);
const CHECKPOINT_KEYS = new Set([
  'authorization',
  'engine',
  'schemaVersion',
  'planId',
  'planSha256',
  'completedActionIds',
  'failedActionId',
  'observationFingerprint',
  'observationSnapshot',
  'state',
]);
const LEGACY_CHECKPOINT_KEYS = new Set([...CHECKPOINT_KEYS].filter((key) => key !== 'observationSnapshot'));

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => keys.has(key));
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');
}

function assertObservationShape(value: unknown): asserts value is AzureCeObservation {
  if (!isRecord(value) || value.schemaVersion !== AZURE_CE_SCHEMA_VERSION) {
    throw new Error('Persisted Azure CE checkpoint has an invalid observation snapshot');
  }
  const subscription = value.subscription;
  const image = value.image;
  const research = value.research;
  if (
    !isRecord(subscription) ||
    !['id', 'tenantId', 'cloud'].every((key) => typeof subscription[key] === 'string') ||
    !isRecord(image) ||
    !['publisher', 'offer', 'plan', 'version', 'urn'].every((key) => typeof image[key] === 'string') ||
    typeof image.termsAccepted !== 'boolean' ||
    !Array.isArray(value.regions) ||
    !Array.isArray(value.resources) ||
    !isRecord(research) ||
    research.method !== 'azure-cli-live' ||
    research.officialSourceRetrieval !== 'live' ||
    typeof research.catalogRegion !== 'string' ||
    !Array.isArray(research.commands) ||
    !research.commands.every((entry) => typeof entry === 'string') ||
    !Array.isArray(research.officialSources) ||
    !research.officialSources.every((entry) => typeof entry === 'string') ||
    !Array.isArray(research.sourceReceipts) ||
    !research.sourceReceipts.every(
      (entry) =>
        isRecord(entry) && typeof entry.url === 'string' && /^[a-f0-9]{64}$/.test(String(entry.normalizedSha256)),
    ) ||
    !isRecord(research.sharedContract) ||
    typeof research.sharedContract.url !== 'string' ||
    typeof research.sharedContract.contractId !== 'string' ||
    typeof research.sharedContract.contractVersion !== 'string' ||
    !/^[a-f0-9]{64}$/.test(String(research.sharedContract.normalizedSha256))
  ) {
    throw new Error('Persisted Azure CE checkpoint has an invalid observation snapshot');
  }
  for (const region of value.regions) {
    if (
      !isRecord(region) ||
      typeof region.name !== 'string' ||
      typeof region.rank !== 'number' ||
      typeof region.eligible !== 'boolean' ||
      !Array.isArray(region.reasons) ||
      !region.reasons.every((entry) => typeof entry === 'string') ||
      !Array.isArray(region.zones) ||
      !region.zones.every((entry) => typeof entry === 'string') ||
      typeof region.routeServerSupported !== 'boolean' ||
      typeof region.quotaAvailable !== 'number' ||
      typeof region.policyAllowed !== 'boolean' ||
      (region.proximity !== undefined && typeof region.proximity !== 'number') ||
      !Array.isArray(region.vmSizes) ||
      !region.vmSizes.every(
        (size) =>
          isRecord(size) &&
          typeof size.name === 'string' &&
          typeof size.maxNics === 'number' &&
          typeof size.vCpus === 'number' &&
          typeof size.memoryGb === 'number' &&
          Array.isArray(size.zones) &&
          size.zones.every((entry) => typeof entry === 'string') &&
          typeof size.restricted === 'boolean',
      )
    ) {
      throw new Error('Persisted Azure CE checkpoint has an invalid observation snapshot');
    }
  }
  for (const resource of value.resources) {
    if (
      !isRecord(resource) ||
      typeof resource.id !== 'string' ||
      typeof resource.exists !== 'boolean' ||
      typeof resource.owned !== 'boolean' ||
      !isStringRecord(resource.tags) ||
      !isRecord(resource.state)
    ) {
      throw new Error('Persisted Azure CE checkpoint has an invalid observation snapshot');
    }
  }
}

/** Remove only the capacity consumed by VMs created by this exact immutable deploy plan. */
export function fingerprintCurrentObservation(plan: AzureCePlan, current: AzureCeObservation): string {
  if (plan.intent.operation !== 'deploy') return fingerprintObservation(current, plan.intent.brownfield.resourceIds);
  const normalized = structuredClone(current);
  const vmScope =
    `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${plan.deploymentName}-`.toLowerCase();
  const ownedVmCount = normalized.resources.filter((resource) => {
    const resourceId = resource.id.toLowerCase();
    const suffix = resourceId.slice(vmScope.length);
    return (
      resource.exists &&
      resource.owned &&
      resourceId.startsWith(vmScope) &&
      /^\d+$/.test(suffix) &&
      Number(suffix) >= 1 &&
      Number(suffix) <= plan.topology.nodeCount &&
      resource.tags['xcsh-managed-by'] === 'azure-ce' &&
      resource.tags['xcsh-deployment-id'] === plan.deploymentName &&
      resource.tags['xcsh-execution-engine'] === plan.engine &&
      resource.tags['xcsh-plan-sha256'] === plan.planSha256
    );
  }).length;
  if (ownedVmCount > 0) {
    const region = normalized.regions.find((candidate) => candidate.name === plan.region);
    const size = region?.vmSizes.find((candidate) => candidate.name === plan.vm.size);
    if (region && size && Number.isFinite(size.vCpus) && size.vCpus > 0) {
      region.quotaAvailable += ownedVmCount * size.vCpus;
      if (region.quotaAvailable >= size.vCpus * plan.topology.nodeCount) {
        region.reasons = region.reasons.filter((reason) => reason !== 'quota');
        region.eligible = !region.reasons.some((reason) => QUOTA_BLOCKERS.has(reason));
      }
      normalized.regions.sort(
        (left, right) =>
          Number(right.eligible) - Number(left.eligible) ||
          (right.proximity ?? 0) - (left.proximity ?? 0) ||
          left.reasons.length - right.reasons.length ||
          left.name.localeCompare(right.name),
      );
      normalized.regions.forEach((candidate, index) => {
        candidate.rank = index + 1;
      });
    }
  }
  return fingerprintObservation(normalized, plan.intent.brownfield.resourceIds);
}

export function fingerprintCheckpointObservation(observation: AzureCeObservation): string {
  const normalized = structuredClone(observation);
  normalized.subscription.id = normalized.subscription.id.toLowerCase();
  normalized.resources = normalized.resources
    .map((resource) => ({ ...resource, id: resource.id.toLowerCase() }))
    .sort((left, right) => left.id.localeCompare(right.id));
  normalized.regions = normalized.regions
    .map((region) => ({
      ...region,
      zones: [...region.zones].sort(),
      vmSizes: region.vmSizes
        .map((size) => ({ ...size, zones: [...size.zones].sort() }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  return canonicalSha256(normalized);
}

function assertAuthorizationShape(value: unknown): void {
  if (value === undefined) return;
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, new Set(['apply', 'terms', 'destroy'])) ||
    typeof value.apply !== 'boolean' ||
    typeof value.terms !== 'boolean' ||
    typeof value.destroy !== 'boolean'
  ) {
    throw new Error('Persisted Azure CE checkpoint has invalid authorization');
  }
}

function assertCheckpointProgress(
  checkpoint: Record<string, unknown>,
  plan: AzureCePlan,
): asserts checkpoint is Record<string, unknown> & {
  completedActionIds: string[];
  state: AzureCeCheckpoint['state'];
} {
  if (
    checkpoint.engine !== plan.engine ||
    checkpoint.planId !== plan.planId ||
    checkpoint.planSha256 !== plan.planSha256
  ) {
    throw new Error('Persisted Azure CE checkpoint identity or execution engine differs from the immutable plan');
  }
  if (
    !Array.isArray(checkpoint.completedActionIds) ||
    !checkpoint.completedActionIds.every((id) => typeof id === 'string') ||
    !CHECKPOINT_STATES.has(String(checkpoint.state))
  ) {
    throw new Error('Persisted Azure CE checkpoint progress is malformed');
  }
  const completedActionIds = checkpoint.completedActionIds as string[];
  const unique = new Set(completedActionIds);
  const expected = plan.actions.slice(0, completedActionIds.length).map((action) => action.id);
  if (unique.size !== completedActionIds.length || JSON.stringify(completedActionIds) !== JSON.stringify(expected)) {
    throw new Error('Persisted checkpoint is not an ordered unique prefix of the immutable plan');
  }
  const failedActionId = checkpoint.failedActionId;
  const nextActionId = plan.actions[completedActionIds.length]?.id;
  if (
    (failedActionId !== undefined && typeof failedActionId !== 'string') ||
    (checkpoint.state === 'partial' && failedActionId !== nextActionId) ||
    (checkpoint.state !== 'partial' && failedActionId !== undefined) ||
    (checkpoint.state === 'complete' && completedActionIds.length !== plan.actions.length) ||
    (checkpoint.state !== 'complete' && completedActionIds.length === plan.actions.length)
  ) {
    throw new Error('Persisted Azure CE checkpoint state is inconsistent with its action prefix');
  }
  assertAuthorizationShape(checkpoint.authorization);
}

export function validateAzureCeCheckpoint(value: unknown, plan: AzureCePlan): AzureCeStoredCheckpoint {
  if (!isRecord(value)) throw new Error('Persisted Azure CE checkpoint is malformed');
  const version = value.schemaVersion;
  const allowedKeys = version === AZURE_CE_SCHEMA_VERSION ? LEGACY_CHECKPOINT_KEYS : CHECKPOINT_KEYS;
  if (!hasOnlyKeys(value, allowedKeys)) throw new Error('Persisted Azure CE checkpoint has unexpected fields');
  if (version !== AZURE_CE_SCHEMA_VERSION && version !== AZURE_CE_CHECKPOINT_SCHEMA_VERSION) {
    throw new Error('Persisted Azure CE checkpoint uses an unsupported schema version');
  }
  assertCheckpointProgress(value, plan);
  const fingerprint = value.observationFingerprint;
  if (fingerprint !== undefined && (typeof fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(fingerprint))) {
    throw new Error('Persisted Azure CE checkpoint has an invalid observation fingerprint');
  }
  const authorization = value.authorization as AzureCeCheckpoint['authorization'];
  const executionStarted =
    value.completedActionIds.length > 0 || fingerprint !== undefined || value.state !== 'running';
  if (
    executionStarted &&
    (authorization?.apply !== true || (plan.intent.operation === 'teardown' && authorization.destroy !== true))
  ) {
    throw new Error('Persisted Azure CE checkpoint execution has invalid authorization');
  }
  if (version === AZURE_CE_SCHEMA_VERSION) {
    if (value.completedActionIds.length > 0 && fingerprint === undefined) {
      throw new Error('Persisted legacy Azure CE checkpoint has no observation fingerprint');
    }
    return value as unknown as AzureCeLegacyCheckpoint;
  }
  const snapshot = value.observationSnapshot;
  const isEmptySeed =
    value.completedActionIds.length === 0 &&
    value.state === 'running' &&
    value.failedActionId === undefined &&
    fingerprint === undefined &&
    snapshot === undefined &&
    authorization?.apply === true &&
    (plan.intent.operation !== 'teardown' || authorization.destroy === true);
  if (!isEmptySeed) {
    if (typeof fingerprint !== 'string' || snapshot === undefined) {
      throw new Error('Persisted Azure CE checkpoint requires a bound observation snapshot and fingerprint');
    }
    assertObservationShape(snapshot);
    if (
      snapshot.subscription.id.toLowerCase() !== plan.subscription.id.toLowerCase() ||
      snapshot.subscription.tenantId.toLowerCase() !== plan.subscription.tenantId.toLowerCase() ||
      snapshot.subscription.cloud !== plan.subscription.cloud ||
      snapshot.image.publisher.toLowerCase() !== plan.image.publisher.toLowerCase() ||
      snapshot.image.offer.toLowerCase() !== plan.image.offer.toLowerCase() ||
      snapshot.image.plan.toLowerCase() !== plan.image.plan.toLowerCase() ||
      snapshot.image.version !== plan.image.version ||
      snapshot.image.urn.toLowerCase() !== plan.image.urn.toLowerCase()
    ) {
      throw new Error('Persisted Azure CE checkpoint observation identity differs from the immutable plan');
    }
    if (!safeHexEqual(fingerprint, fingerprintCheckpointObservation(snapshot))) {
      throw new Error('Persisted Azure CE checkpoint observation differs from its fingerprint');
    }
  }
  return value as unknown as AzureCeCheckpoint;
}

export function upgradeAzureCeCheckpoint(
  plan: AzureCePlan,
  checkpoint: AzureCeLegacyCheckpoint,
  current: AzureCeObservation,
): AzureCeCheckpoint {
  const currentFingerprint = fingerprintCurrentObservation(plan, current);
  if (
    checkpoint.completedActionIds.length > 0 &&
    (!checkpoint.observationFingerprint || !safeHexEqual(checkpoint.observationFingerprint, currentFingerprint))
  ) {
    throw new Error(
      plan.intent.operation === 'teardown'
        ? 'Stale incomplete legacy Azure teardown checkpoint cannot be recovered safely'
        : 'Legacy Azure CE checkpoint observation is stale',
    );
  }
  return {
    ...checkpoint,
    schemaVersion: AZURE_CE_CHECKPOINT_SCHEMA_VERSION,
    observationFingerprint: fingerprintCheckpointObservation(current),
    observationSnapshot: structuredClone(current),
  };
}

interface DeleteTarget {
  actionId: string;
  resourceId: string;
  normalizedResourceId: string;
  resourceGroup: boolean;
}

function normalizeDeleteResourceId(plan: AzureCePlan, resourceId: string): { id: string; resourceGroup: boolean } {
  if (resourceId.trim() !== resourceId || !resourceId.startsWith('/') || resourceId.endsWith('/')) {
    throw new Error('Azure deletion recovery action has a non-canonical resource ID');
  }
  const segments = resourceId.slice(1).split('/');
  if (segments.some((segment) => segment.length === 0)) {
    throw new Error('Azure deletion recovery action has a non-canonical resource ID');
  }
  const expectedGroup = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}`;
  const normalized = resourceId.toLowerCase();
  const normalizedGroup = expectedGroup.toLowerCase();
  if (normalized === normalizedGroup) return { id: normalized, resourceGroup: true };
  if (
    segments.length < 8 ||
    segments.length % 2 !== 0 ||
    segments[0].toLowerCase() !== 'subscriptions' ||
    segments[1].toLowerCase() !== plan.subscription.id.toLowerCase() ||
    segments[2].toLowerCase() !== 'resourcegroups' ||
    segments[3].toLowerCase() !== plan.intent.resourceGroup.toLowerCase() ||
    segments[4].toLowerCase() !== 'providers'
  ) {
    throw new Error('Azure deletion recovery target differs from the immutable subscription and resource-group scope');
  }
  return { id: normalized, resourceGroup: false };
}

export function validateAzureDeletionTail(plan: AzureCePlan, completedActionIds: string[]): DeleteTarget[] {
  const expectedPrefix = plan.actions.slice(0, completedActionIds.length).map((action) => action.id);
  if (
    new Set(completedActionIds).size !== completedActionIds.length ||
    JSON.stringify(completedActionIds) !== JSON.stringify(expectedPrefix)
  ) {
    throw new Error('Persisted checkpoint is not an ordered unique prefix of the immutable plan');
  }
  if (plan.intent.operation !== 'teardown') return [];
  const tail = plan.actions.slice(completedActionIds.length);
  if (tail.length === 0) return [];
  if (tail.some((action) => action.kind !== 'resource-delete')) {
    throw new Error('Azure deletion recovery requires an uninterrupted immutable resource-delete tail');
  }
  const ownership = new Map<string, (typeof plan.ownershipInventory)[number]>();
  for (const item of plan.ownershipInventory) {
    const normalized = item.resourceId.toLowerCase();
    if (ownership.has(normalized)) {
      throw new Error('Azure deletion recovery ownership inventory contains duplicate resource IDs');
    }
    ownership.set(normalized, item);
  }
  const seen = new Set<string>();
  return tail.map((action) => {
    if (!action.resourceId) throw new Error('Azure deletion recovery action has no canonical resource ID');
    const normalized = normalizeDeleteResourceId(plan, action.resourceId);
    if (seen.has(normalized.id)) throw new Error('Azure deletion recovery tail contains duplicate resource IDs');
    seen.add(normalized.id);
    const owner = ownership.get(normalized.id);
    if (owner?.action !== 'delete' || owner.owned !== true) {
      throw new Error('Azure deletion recovery target differs from the immutable ownership inventory');
    }
    return {
      actionId: action.id,
      resourceId: action.resourceId,
      normalizedResourceId: normalized.id,
      resourceGroup: normalized.resourceGroup,
    };
  });
}

function azureErrorCode(stdout: string, stderr: string): string | undefined {
  for (const raw of [stderr, stdout]) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (isRecord(parsed) && typeof parsed.code === 'string') return parsed.code;
      if (isRecord(parsed) && isRecord(parsed.error) && typeof parsed.error.code === 'string') return parsed.error.code;
    } catch {
      // Azure CLI commonly emits a human-readable error rather than JSON.
    }
  }
  const text = stderr.trim();
  const leading = /^(?:ERROR:\s*)?\(([A-Za-z][A-Za-z0-9]+)\)/.exec(text)?.[1];
  if (leading) return leading;
  return /^Code:\s*([A-Za-z][A-Za-z0-9]+)\s*$/m.exec(text)?.[1];
}

export async function collectAzureAbsentDeletionTail(
  plan: AzureCePlan,
  completedActionIds: string[],
  api: AzExecApi,
  signal?: AbortSignal,
): Promise<string[]> {
  const absent: string[] = [];
  const targets = validateAzureDeletionTail(plan, completedActionIds);
  for (const target of targets) {
    const result = await api.exec(
      'az',
      target.resourceGroup
        ? [
            'group',
            'exists',
            '--name',
            plan.intent.resourceGroup,
            '--subscription',
            plan.subscription.id,
            '--output',
            'json',
          ]
        : ['resource', 'show', '--ids', target.resourceId, '--subscription', plan.subscription.id, '--output', 'json'],
      signal ? { signal } : undefined,
    );
    if (target.resourceGroup) {
      if (result.exitCode !== 0) throw new Error('Azure deletion recovery group evidence is unavailable');
      let exists: unknown;
      try {
        exists = JSON.parse(result.stdout);
      } catch {
        throw new Error('Malformed Azure deletion recovery group evidence');
      }
      if (exists === false) absent.push(target.resourceId);
      else if (exists !== true) throw new Error('Malformed Azure deletion recovery group evidence');
      if (exists === true) break;
      continue;
    }
    if (result.exitCode === 0) {
      let resource: unknown;
      try {
        resource = JSON.parse(result.stdout);
      } catch {
        throw new Error('Malformed Azure deletion recovery resource evidence');
      }
      if (!isRecord(resource) || typeof resource.id !== 'string') {
        throw new Error('Malformed Azure deletion recovery resource evidence');
      }
      if (resource.id.toLowerCase() !== target.normalizedResourceId) {
        throw new Error('Azure deletion recovery returned a different resource identity');
      }
      break;
    }
    const code = azureErrorCode(result.stdout, result.stderr);
    if (code !== 'ResourceNotFound' && code !== 'ResourceGroupNotFound') {
      throw new Error('Azure deletion recovery resource evidence is unavailable');
    }
    absent.push(target.resourceId);
  }
  return absent;
}

function stableDeletionObservation(
  plan: AzureCePlan,
  observation: AzureCeObservation,
  recoveredResourceIds: ReadonlySet<string>,
): string {
  const allResources = observation.resources.map((resource) => ({ ...resource, id: resource.id.toLowerCase() }));
  if (new Set(allResources.map((resource) => resource.id)).size !== allResources.length) {
    throw new Error('Azure deletion recovery observation contains duplicate resource IDs');
  }
  const resources = allResources
    .filter((resource) => {
      const id = resource.id;
      return ![...recoveredResourceIds].some((recovered) => id === recovered || id.startsWith(`${recovered}/`));
    })
    .map((resource) => {
      const ancestor = [...recoveredResourceIds].some((recovered) => recovered.startsWith(`${resource.id}/`));
      if (!ancestor) return resource;
      const { etag: _etag, state, ...stable } = resource;
      const { provisioningState: _provisioningState, ...stableState } = state;
      return { ...stable, state: stableState };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  return canonicalSha256({
    schemaVersion: observation.schemaVersion,
    subscription: observation.subscription,
    image: observation.image,
    research: observation.research,
    regions: observation.regions
      .map(({ eligible: _eligible, quotaAvailable: _quota, rank: _rank, reasons: _reasons, ...stable }) => stable)
      .sort((left, right) => left.name.localeCompare(right.name)),
    resources,
    brownfieldResourceIds: [...plan.intent.brownfield.resourceIds].map((id) => id.toLowerCase()).sort(),
  });
}

export function reconcileAzureNativeDeletionPrefix(
  plan: AzureCePlan,
  completedActionIds: string[],
  previous: AzureCeObservation,
  current: AzureCeObservation,
  absentResourceIds: Iterable<string>,
): string[] {
  if (plan.intent.operation !== 'teardown') return completedActionIds;
  const targets = validateAzureDeletionTail(plan, completedActionIds);
  const absent = [...absentResourceIds].map((id) => normalizeDeleteResourceId(plan, id).id);
  if (new Set(absent).size !== absent.length) {
    throw new Error('Azure deletion recovery evidence contains duplicate resource IDs');
  }
  const targetIds = new Set(targets.map((target) => target.normalizedResourceId));
  if (absent.some((id) => !targetIds.has(id))) {
    throw new Error('Azure deletion recovery evidence is outside the immutable delete tail');
  }
  let recoveredCount = 0;
  while (recoveredCount < targets.length && absent.includes(targets[recoveredCount].normalizedResourceId)) {
    recoveredCount++;
  }
  if (absent.slice(recoveredCount).length > 0) {
    throw new Error('Azure deletion recovery evidence is out of action order');
  }
  const recoveredTargets = targets.slice(0, recoveredCount);
  const recoveredResourceIds = new Set(recoveredTargets.map((target) => target.normalizedResourceId));
  const previousIds = new Set(previous.resources.map((resource) => resource.id.toLowerCase()));
  if (current.resources.some((resource) => !previousIds.has(resource.id.toLowerCase()))) {
    throw new Error('Azure deletion recovery observation contains an unexpected resource');
  }
  if (
    stableDeletionObservation(plan, previous, recoveredResourceIds) !==
    stableDeletionObservation(plan, current, recoveredResourceIds)
  ) {
    throw new Error('Azure deletion recovery observation changed outside the immutable delete tail');
  }
  if (recoveredCount === 0) return completedActionIds;
  return [...completedActionIds, ...recoveredTargets.map((target) => target.actionId)];
}
