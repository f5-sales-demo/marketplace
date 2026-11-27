import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { canonicalSha256, canonicalStringify, safeHexEqual, sha256Hex } from './canonical';
import { verifyAzureNativeNetworkProfile } from './native-network-plan';
import { verifyAzureNativeNetworkReplacementProfile } from './native-network-replacement';
import { validateAzureCeCheckpoint } from './recovery';
import { verifyAzureRelayDeploymentProfile } from './relay-deployment-plan';
import { verifyAzureRelayReplacementProfile } from './relay-replacement-plan';
import { verifyAzureTerraformNetworkProfile } from './terraform-network-plan';
import { verifyAzureTerraformNetworkReplacementProfile } from './terraform-network-replacement-plan';
import type { AzureCeCheckpoint, AzureCeObservation, AzureCePlan } from './types';
import { AZURE_CE_SCHEMA_VERSION } from './types';
import { verifyAzureWorkloadDeploymentProfile } from './workload-plan';

export interface SessionManagerLike {
  getSessionId(): string;
  getArtifactsDir(): string | null;
  saveArtifact(content: string, toolType: string): Promise<string | undefined>;
  getArtifactPath(id: string): Promise<string | null>;
}

export interface AzureCeToolContext {
  cwd: string;
  hasUI: boolean;
  ui: { confirm(title: string, message: string): Promise<boolean> };
  sessionManager: SessionManagerLike;
}

interface PlanEnvelope {
  kind: 'azure-ce-plan';
  plan: AzureCePlan;
  observation: AzureCeObservation;
}

interface DiscoveryEnvelope {
  kind: 'azure-ce-discovery';
  observation: AzureCeObservation;
}

const memoryPlans = new Map<string, PlanEnvelope[]>();
const persistedPlans = new WeakMap<SessionManagerLike, Map<string, { path: string; sha256: string }>>();
function planSession(session: SessionManagerLike) {
  const id = session.getSessionId(),
    directory = session.getArtifactsDir();
  const callbacks = [session.getSessionId, session.getArtifactsDir, session.getArtifactPath, session.saveArtifact];
  return {
    id,
    directory,
    seal: () => {
      if (
        session.getSessionId() !== id ||
        session.getArtifactsDir() !== directory ||
        callbacks.some(
          (callback, index) =>
            callback !==
            [session.getSessionId, session.getArtifactsDir, session.getArtifactPath, session.saveArtifact][index],
        )
      )
        throw Error('Azure CE plan session changed during artifact access');
    },
  };
}
async function readPlanPacket(path: string, directory: string): Promise<string> {
  if (resolve(dirname(path)) !== resolve(directory) || !path.endsWith('.azure-ce-plan.log'))
    throw Error('Azure CE plan artifact path differs from its session');
  const info = await lstat(path);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.size > 32 * 1024 * 1024 ||
    (await realpath(path)) !== join(await realpath(directory), basename(path))
  )
    throw Error('Azure CE plan artifact identity is invalid');
  const directoryIdentity = await realpath(directory);
  const bytes = await readFile(path, 'utf8');
  const final = await lstat(path);
  if (
    (await realpath(directory)) !== directoryIdentity ||
    !final.isFile() ||
    final.isSymbolicLink() ||
    final.dev !== info.dev ||
    final.ino !== info.ino ||
    final.size !== info.size ||
    final.mtimeMs !== info.mtimeMs
  )
    throw Error('Azure CE plan artifact changed during read');
  return bytes;
}
function verifyPlanEnvelope(value: unknown, planId: string, planSha256: string): PlanEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Azure CE plan envelope is malformed');
  const row = value as PlanEnvelope;
  if (
    row.kind !== 'azure-ce-plan' ||
    row.plan?.planId !== planId ||
    row.plan?.planSha256 !== planSha256 ||
    row.observation?.schemaVersion !== AZURE_CE_SCHEMA_VERSION
  )
    throw Error('Azure CE plan envelope identity differs');
  verifyAzureCePlan(row.plan);
  return structuredClone(row);
}

export function verifyAzureCePlan(plan: AzureCePlan): void {
  if (plan.schemaVersion !== AZURE_CE_SCHEMA_VERSION || plan.intent.schemaVersion !== AZURE_CE_SCHEMA_VERSION)
    throw new Error('Persisted Azure CE plan uses an unsupported schema version');
  if (!['native', 'terraform'].includes(plan.engine) || plan.intent.engine !== plan.engine)
    throw new Error('Persisted Azure CE plan has invalid execution ownership');
  const { planId, planSha256, ...draft } = plan;
  const actual = canonicalSha256(draft);
  if (!safeHexEqual(actual, planSha256) || planId !== `azure-ce-${planSha256.slice(0, 24)}`) {
    throw new Error('Persisted Azure CE plan failed integrity validation');
  }
  if (plan.networkReplacementProfile !== undefined) verifyAzureNativeNetworkReplacementProfile(plan);
  if (plan.networkProfile !== undefined) verifyAzureNativeNetworkProfile(plan);
  if (plan.terraformNetworkProfile !== undefined) verifyAzureTerraformNetworkProfile(plan);
  if (plan.terraformNetworkReplacementProfile !== undefined) verifyAzureTerraformNetworkReplacementProfile(plan);
  if (plan.relayProfile?.schemaVersion === 2) verifyAzureRelayReplacementProfile(plan);
  else if (plan.relayProfile) verifyAzureRelayDeploymentProfile(plan);
  else if (plan.workloadProfile) verifyAzureWorkloadDeploymentProfile(plan);
}

export async function saveDiscoveryArtifact(
  session: SessionManagerLike,
  observation: AzureCeObservation,
): Promise<string | undefined> {
  if (observation.schemaVersion !== AZURE_CE_SCHEMA_VERSION)
    throw new Error('Azure CE discovery observation uses an unsupported schema version');
  return session.saveArtifact(
    JSON.stringify({ kind: 'azure-ce-discovery', observation } satisfies DiscoveryEnvelope),
    'azure-ce-discovery',
  );
}

export async function loadDiscoveryArtifact(session: SessionManagerLike, id: string): Promise<AzureCeObservation> {
  if (!/^\d+$/.test(id)) throw new Error('Invalid discovery artifact ID');
  const path = await session.getArtifactPath(id);
  if (!path) throw new Error(`Discovery artifact ${id} was not found in this session`);
  const envelope = JSON.parse(await Bun.file(path).text()) as DiscoveryEnvelope;
  if (envelope.kind !== 'azure-ce-discovery' || envelope.observation?.schemaVersion !== AZURE_CE_SCHEMA_VERSION)
    throw new Error('Artifact is not an Azure CE discovery observation');
  return envelope.observation;
}

export async function savePlanArtifact(
  session: SessionManagerLike,
  plan: AzureCePlan,
  observation: AzureCeObservation,
): Promise<string | undefined> {
  verifyAzureCePlan(plan);
  const scope = planSession(session);
  const inputSha256 = canonicalSha256({ plan, observation });
  const envelope: PlanEnvelope = structuredClone({ kind: 'azure-ce-plan', plan, observation });
  const bytes = canonicalStringify(envelope);
  const id = await session.saveArtifact(bytes, 'azure-ce-plan');
  scope.seal();
  if (canonicalSha256({ plan, observation }) !== inputSha256)
    throw Error('Azure CE plan input changed during publication');
  if (scope.directory !== null) {
    if (typeof id !== 'string' || !id) throw Error('Azure CE plan persistence acknowledgement is missing');
    let path = await session.getArtifactPath(id);
    scope.seal();
    if (!path) {
      const suffix = '.azure-ce-plan.log';
      const names = (await readdir(scope.directory)).filter(
        (name) =>
          name.endsWith(suffix) &&
          (name === id ||
            (/^\d+$/.test(id) &&
              /^\d+$/.test(name.slice(0, -suffix.length)) &&
              BigInt(name.slice(0, -suffix.length)) === BigInt(id))),
      );
      scope.seal();
      const selected = names.length === 1 ? names[0] : undefined;
      if (selected === undefined) throw Error('Azure CE plan persisted receipt path is missing or ambiguous');
      path = join(scope.directory, selected);
    }
    const actual = await readPlanPacket(path, scope.directory);
    scope.seal();
    if (actual !== bytes || canonicalSha256({ plan, observation }) !== inputSha256)
      throw Error('Azure CE plan persisted bytes or input changed during publication');
    const records = persistedPlans.get(session) ?? new Map<string, { path: string; sha256: string }>();
    records.set(`${scope.id}:${scope.directory}:${planIdKey(plan.planId, plan.planSha256)}`, {
      path,
      sha256: sha256Hex(bytes),
    });
    persistedPlans.set(session, records);
  } else {
    const plans = memoryPlans.get(scope.id) ?? [];
    plans.push(envelope);
    memoryPlans.set(scope.id, plans);
    return undefined;
  }
  return id;
}
function planIdKey(planId: string, planSha256: string) {
  return `${planId}:${planSha256}`;
}

export async function loadPlanArtifact(
  session: SessionManagerLike,
  planId: string,
  planSha256: string,
): Promise<PlanEnvelope> {
  if (!/^[a-f0-9]{64}$/.test(planSha256) || planId !== `azure-ce-${planSha256.slice(0, 24)}`)
    throw Error('Invalid exact Azure CE plan identity');
  const scope = planSession(session);
  if (scope.directory === null) {
    const memory = memoryPlans
      .get(scope.id)
      ?.find((row) => row.plan.planId === planId && row.plan.planSha256 === planSha256);
    scope.seal();
    if (!memory) throw Error('The exact plan is unavailable in this non-persistent session');
    return verifyPlanEnvelope(memory, planId, planSha256);
  }
  const known = persistedPlans.get(session)?.get(`${scope.id}:${scope.directory}:${planIdKey(planId, planSha256)}`);
  if (known) {
    const bytes = await readPlanPacket(known.path, scope.directory);
    scope.seal();
    if (sha256Hex(bytes) !== known.sha256) throw Error('Azure CE plan persisted bytes changed after publication');
    return verifyPlanEnvelope(JSON.parse(bytes), planId, planSha256);
  }
  let files: string[];
  try {
    files = (await readdir(scope.directory)).filter((file) => file.endsWith('.azure-ce-plan.log')).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    files = [];
  }
  scope.seal();
  let selected: PlanEnvelope | undefined;
  for (const file of files) {
    const bytes = await readPlanPacket(join(scope.directory, file), scope.directory);
    scope.seal();
    let value: unknown;
    try {
      value = JSON.parse(bytes);
    } catch {
      continue;
    }
    const row = value as PlanEnvelope | null;
    if (!row || (row.plan?.planId !== planId && row.plan?.planSha256 !== planSha256)) continue;
    const current = verifyPlanEnvelope(row, planId, planSha256);
    if (selected && canonicalSha256(selected) !== canonicalSha256(current))
      throw Error('Ambiguous exact Azure CE plan artifacts');
    selected = current;
  }
  scope.seal();
  if (selected) return selected;
  throw new Error('No exact, integrity-valid Azure CE plan was found in this session');
}

export async function saveCheckpoint(
  session: SessionManagerLike,
  plan: AzureCePlan,
  checkpoint: AzureCeCheckpoint,
): Promise<string | undefined> {
  validateAzureCeCheckpoint(checkpoint, plan);
  const artifactId = await session.saveArtifact(
    JSON.stringify({ kind: 'azure-ce-checkpoint', checkpoint }),
    'azure-ce-checkpoint',
  );
  if (!artifactId) throw new Error('Azure CE checkpoint persistence failed');
  return artifactId;
}

export async function loadCheckpoint(
  session: SessionManagerLike,
  plan: AzureCePlan,
): Promise<AzureCeCheckpoint | undefined> {
  const artifactsDir = session.getArtifactsDir();
  if (!artifactsDir) return undefined;
  let files: string[];
  try {
    files = (await readdir(artifactsDir))
      .filter((file) => file.endsWith('.azure-ce-checkpoint.log'))
      .sort()
      .reverse();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return undefined;
  }
  for (const file of files) {
    let envelope: unknown;
    const content = await Bun.file(join(artifactsDir, file)).text();
    try {
      envelope = JSON.parse(content) as unknown;
    } catch {
      throw new Error('Persisted Azure CE checkpoint JSON is malformed');
    }
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope))
      throw new Error('Persisted Azure CE checkpoint envelope is malformed');
    const record = envelope as Record<string, unknown>;
    const checkpoint = record.checkpoint;
    if (!checkpoint || typeof checkpoint !== 'object' || Array.isArray(checkpoint))
      throw new Error('Persisted Azure CE checkpoint is malformed');
    const identity = checkpoint as Record<string, unknown>;
    if (identity.planId !== plan.planId && identity.planSha256 !== plan.planSha256) continue;
    if (record.kind !== 'azure-ce-checkpoint') {
      throw new Error('Persisted Azure CE checkpoint envelope is malformed');
    }
    return validateAzureCeCheckpoint(checkpoint, plan);
  }
  return undefined;
}

/** Complete session inventory for lifecycle custody. Invalid or unavailable plan packets cannot
 * be silently skipped. Retain this private witness and recheck it at action boundaries; the plans
 * contain private source material and must never be copied into public qualification receipts.
 */
export async function readAzureCePlanInventory(session: SessionManagerLike, signal?: AbortSignal) {
  const scope = planSession(session);
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const seal = () => {
    deadline.throwIfAborted();
    scope.seal();
  };
  const step = async <T>(work: () => Promise<T>) => {
    seal();
    const abort = Promise.withResolvers<never>(),
      onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([work(), abort.promise]);
      seal();
      return result;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const envelope = (value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw Error('Azure CE plan inventory envelope is malformed');
    const row = value as PlanEnvelope;
    return verifyPlanEnvelope(row, row.plan?.planId, row.plan?.planSha256);
  };
  const inspect = async () => {
    seal();
    const rows: PlanEnvelope[] = [];
    const packets: Array<{ name: string; sha256: string; identity?: string }> = [];
    let directoryIdentity: string | null = null;
    if (scope.directory === null) {
      const memory = structuredClone(memoryPlans.get(scope.id) ?? []);
      for (const [index, value] of memory.entries()) {
        rows.push(envelope(value));
        packets.push({ name: String(index), sha256: canonicalSha256(value) });
      }
      seal();
      if (canonicalSha256(memoryPlans.get(scope.id) ?? []) !== canonicalSha256(memory))
        throw Error('Azure CE memory plan inventory changed during inspection');
    } else {
      const directory = scope.directory;
      const identity = async () => {
        const stat = await step(() => lstat(directory));
        if (
          !stat.isDirectory() ||
          stat.isSymbolicLink() ||
          (await step(() => realpath(directory))) !== resolve(directory)
        )
          throw Error('Azure CE plan inventory directory identity is invalid');
        return `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
      };
      directoryIdentity = await identity();
      const names = async () =>
        (await step(() => readdir(directory))).filter((name) => name.endsWith('.azure-ce-plan.log')).sort();
      const files = await names();
      const pinned = [...(persistedPlans.get(session)?.entries() ?? [])].filter(([key]) =>
        key.startsWith(`${scope.id}:${directory}:`),
      );
      for (const [, record] of pinned)
        if (!files.includes(basename(record.path))) throw Error('Azure CE plan inventory lost a published packet');
      for (const name of files) {
        const path = join(directory, name),
          stat = await step(() => lstat(path));
        const bytes = await step(() => readPlanPacket(path, directory));
        const final = await step(() => lstat(path));
        const packetIdentity = (value: typeof stat) =>
          `${value.dev}:${value.ino}:${value.size}:${value.mtimeMs}:${value.ctimeMs}`;
        if (packetIdentity(stat) !== packetIdentity(final))
          throw Error('Azure CE plan inventory packet changed during inspection');
        const sha256 = sha256Hex(bytes);
        if (pinned.some(([, record]) => record.path === path && record.sha256 !== sha256))
          throw Error('Azure CE plan inventory published packet changed');
        rows.push(envelope(JSON.parse(bytes)));
        packets.push({ name, sha256, identity: packetIdentity(final) });
      }
      if (canonicalSha256(await names()) !== canonicalSha256(files) || (await identity()) !== directoryIdentity)
        throw Error('Azure CE plan inventory changed during inspection');
      if (
        canonicalSha256(
          [...(persistedPlans.get(session)?.entries() ?? [])].filter(([key]) =>
            key.startsWith(`${scope.id}:${directory}:`),
          ),
        ) !== canonicalSha256(pinned)
      )
        throw Error('Azure CE plan inventory publications changed during inspection');
    }
    const unique = new Map<string, PlanEnvelope>();
    for (const row of rows) {
      const key = planIdKey(row.plan.planId, row.plan.planSha256),
        previous = unique.get(key);
      if (previous && canonicalSha256(previous) !== canonicalSha256(row))
        throw Error('Ambiguous exact Azure CE plan inventory');
      unique.set(key, row);
    }
    seal();
    return {
      plans: [...unique.values()].sort((a, b) => a.plan.planSha256.localeCompare(b.plan.planSha256)),
      sourceSha256: canonicalSha256({ sessionId: scope.id, directory: scope.directory, directoryIdentity, packets }),
    };
  };
  const snapshot = await inspect();
  const recheck = async () => {
    const current = await inspect();
    if (
      current.sourceSha256 !== snapshot.sourceSha256 ||
      canonicalSha256(current.plans) !== canonicalSha256(snapshot.plans)
    )
      throw Error('Azure CE plan inventory changed after inspection');
  };
  await recheck();
  return { ...structuredClone(snapshot), recheck };
}
