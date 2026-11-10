import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalSha256, safeHexEqual } from './canonical';
import { validateAzureCeCheckpoint } from './recovery';
import type { AzureCeCheckpoint, AzureCeObservation, AzureCePlan, AzureCeStoredCheckpoint } from './types';
import { AZURE_CE_SCHEMA_VERSION } from './types';

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
  const envelope: PlanEnvelope = { kind: 'azure-ce-plan', plan, observation };
  const sessionPlans = memoryPlans.get(session.getSessionId()) ?? [];
  sessionPlans.push(envelope);
  memoryPlans.set(session.getSessionId(), sessionPlans);
  return session.saveArtifact(JSON.stringify(envelope), 'azure-ce-plan');
}

export async function loadPlanArtifact(
  session: SessionManagerLike,
  planId: string,
  planSha256: string,
): Promise<PlanEnvelope> {
  const memory = memoryPlans
    .get(session.getSessionId())
    ?.find((item) => item.plan.planId === planId && item.plan.planSha256 === planSha256);
  if (memory) {
    verifyAzureCePlan(memory.plan);
    return memory;
  }
  const artifactsDir = session.getArtifactsDir();
  if (!artifactsDir) throw new Error('The exact plan is unavailable in this non-persistent session');
  let files: string[];
  try {
    files = (await readdir(artifactsDir)).filter((file) => file.endsWith('.azure-ce-plan.log')).sort();
  } catch {
    files = [];
  }
  for (const file of files) {
    try {
      const envelope = JSON.parse(await Bun.file(join(artifactsDir, file)).text()) as PlanEnvelope;
      if (envelope.kind !== 'azure-ce-plan') continue;
      if (envelope.plan.planId !== planId || envelope.plan.planSha256 !== planSha256) continue;
      verifyAzureCePlan(envelope.plan);
      return envelope;
    } catch {
      // Ignore unrelated or damaged artifacts; an exact valid plan is still required below.
    }
  }
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
): Promise<AzureCeStoredCheckpoint | undefined> {
  const artifactsDir = session.getArtifactsDir();
  if (!artifactsDir) return undefined;
  let files: string[];
  try {
    files = (await readdir(artifactsDir))
      .filter((file) => file.endsWith('.azure-ce-checkpoint.log'))
      .sort()
      .reverse();
  } catch {
    return undefined;
  }
  for (const file of files) {
    let envelope: unknown;
    try {
      envelope = JSON.parse(await Bun.file(join(artifactsDir, file)).text()) as unknown;
    } catch {
      continue;
    }
    if (!envelope || typeof envelope !== 'object') continue;
    const record = envelope as Record<string, unknown>;
    const checkpoint = record.checkpoint;
    if (!checkpoint || typeof checkpoint !== 'object') continue;
    const identity = checkpoint as Record<string, unknown>;
    if (identity.planId !== plan.planId && identity.planSha256 !== plan.planSha256) continue;
    if (record.kind !== 'azure-ce-checkpoint') {
      throw new Error('Persisted Azure CE checkpoint envelope is malformed');
    }
    return validateAzureCeCheckpoint(checkpoint, plan);
  }
  return undefined;
}
