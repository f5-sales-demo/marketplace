import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { canonicalSha256, safeHexEqual } from './canonical';
import type { AwsCeCheckpoint, AwsCeObservation, AwsCePlan } from './types';
import { AWS_CE_SCHEMA_VERSION } from './types';

export interface AwsCeSessionManager {
  getSessionId(): string;
  getArtifactsDir(): string | null;
  saveArtifact(content: string, toolType: string): Promise<string | undefined>;
  getArtifactPath(id: string): Promise<string | null>;
}

export interface AwsCeToolContext {
  cwd: string;
  hasUI: boolean;
  ui: { confirm(title: string, message: string): Promise<boolean> };
  sessionManager: AwsCeSessionManager;
}

export interface AwsCePlanEnvelope {
  kind: 'aws-ce-plan';
  plan: AwsCePlan;
  observation: AwsCeObservation;
}

const memoryPlans = new Map<string, AwsCePlanEnvelope[]>();

export function verifyAwsCePlan(plan: AwsCePlan): void {
  if (plan.schemaVersion !== AWS_CE_SCHEMA_VERSION || plan.intent.schemaVersion !== AWS_CE_SCHEMA_VERSION)
    throw new Error('Persisted AWS CE plan uses an unsupported schema version');
  const { planId, planSha256, ...draft } = plan;
  if (!safeHexEqual(canonicalSha256(draft), planSha256) || planId !== `aws-ce-${planSha256.slice(0, 24)}`)
    throw new Error('Persisted AWS CE plan failed integrity validation');
}

export async function saveAwsDiscovery(session: AwsCeSessionManager, observation: AwsCeObservation) {
  if (observation.schemaVersion !== AWS_CE_SCHEMA_VERSION)
    throw new Error('AWS CE discovery uses an unsupported schema version');
  return session.saveArtifact(JSON.stringify({ kind: 'aws-ce-discovery', observation }), 'aws-ce-discovery');
}

export async function loadAwsDiscovery(session: AwsCeSessionManager, id: string): Promise<AwsCeObservation> {
  if (!/^\d+$/.test(id)) throw new Error('Invalid AWS CE discovery artifact ID');
  const path = await session.getArtifactPath(id);
  if (!path) throw new Error(`AWS CE discovery artifact ${id} was not found in this session`);
  const envelope = JSON.parse(await Bun.file(path).text()) as { kind?: string; observation?: AwsCeObservation };
  if (envelope.kind !== 'aws-ce-discovery' || envelope.observation?.schemaVersion !== AWS_CE_SCHEMA_VERSION)
    throw new Error('Artifact is not an AWS CE schema-v1 discovery observation');
  return envelope.observation;
}

export async function saveAwsPlan(session: AwsCeSessionManager, plan: AwsCePlan, observation: AwsCeObservation) {
  verifyAwsCePlan(plan);
  const envelope: AwsCePlanEnvelope = { kind: 'aws-ce-plan', plan, observation };
  const plans = memoryPlans.get(session.getSessionId()) ?? [];
  plans.push(envelope);
  memoryPlans.set(session.getSessionId(), plans);
  return session.saveArtifact(JSON.stringify(envelope), 'aws-ce-plan');
}

export async function loadAwsPlan(
  session: AwsCeSessionManager,
  planId: string,
  planSha256: string,
): Promise<AwsCePlanEnvelope> {
  const memory = memoryPlans
    .get(session.getSessionId())
    ?.find((item) => item.plan.planId === planId && item.plan.planSha256 === planSha256);
  if (memory) {
    verifyAwsCePlan(memory.plan);
    return memory;
  }
  const directory = session.getArtifactsDir();
  if (!directory) throw new Error('The exact AWS CE plan is unavailable in this session');
  let files: string[] = [];
  try {
    files = (await readdir(directory)).filter((file) => file.endsWith('.aws-ce-plan.log')).sort();
  } catch {
    // The exact persisted plan remains mandatory.
  }
  for (const file of files) {
    try {
      const envelope = JSON.parse(await Bun.file(join(directory, file)).text()) as AwsCePlanEnvelope;
      if (envelope.kind !== 'aws-ce-plan' || envelope.plan.planId !== planId || envelope.plan.planSha256 !== planSha256)
        continue;
      verifyAwsCePlan(envelope.plan);
      return envelope;
    } catch {
      // Continue to the next exact candidate.
    }
  }
  throw new Error('No exact, integrity-valid AWS CE plan was found in this session');
}

export async function saveAwsCheckpoint(session: AwsCeSessionManager, checkpoint: AwsCeCheckpoint) {
  return session.saveArtifact(JSON.stringify({ kind: 'aws-ce-checkpoint', checkpoint }), 'aws-ce-checkpoint');
}

export async function loadAwsCheckpoint(
  session: AwsCeSessionManager,
  planId: string,
  planSha256: string,
): Promise<AwsCeCheckpoint | undefined> {
  const directory = session.getArtifactsDir();
  if (!directory) return undefined;
  let files: string[] = [];
  try {
    files = (await readdir(directory))
      .filter((file) => file.endsWith('.aws-ce-checkpoint.log'))
      .sort()
      .reverse();
  } catch {
    return undefined;
  }
  for (const file of files) {
    try {
      const envelope = JSON.parse(await Bun.file(join(directory, file)).text()) as {
        kind: string;
        checkpoint: AwsCeCheckpoint;
      };
      if (
        envelope.kind === 'aws-ce-checkpoint' &&
        envelope.checkpoint.schemaVersion === AWS_CE_SCHEMA_VERSION &&
        envelope.checkpoint.planId === planId &&
        envelope.checkpoint.planSha256 === planSha256
      )
        return envelope.checkpoint;
    } catch {
      // Continue to an older checkpoint.
    }
  }
  return undefined;
}
