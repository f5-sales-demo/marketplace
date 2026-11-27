import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCheckpoint, type SessionManagerLike } from '../../src/ce/artifacts';
import { compileAzureCePlan } from '../../src/ce/planner';
import { fingerprintCheckpointObservation, validateAzureCeCheckpoint } from '../../src/ce/recovery';
import type { AzureCeCheckpoint } from '../../src/ce/types';
import { AZURE_CE_CHECKPOINT_SCHEMA_VERSION, AZURE_CE_SCHEMA_VERSION } from '../../src/ce/types';
import { intent, observation } from './fixtures';

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true });
});

const plan = compileAzureCePlan(intent, observation);
const authorization = { apply: true, terms: false, destroy: false };

function checkpoint(overrides: Partial<AzureCeCheckpoint> = {}): AzureCeCheckpoint {
  return {
    schemaVersion: AZURE_CE_CHECKPOINT_SCHEMA_VERSION,
    engine: plan.engine,
    planId: plan.planId,
    planSha256: plan.planSha256,
    completedActionIds: [],
    observationFingerprint: fingerprintCheckpointObservation(observation),
    observationSnapshot: structuredClone(observation),
    authorization,
    state: 'running',
    ...overrides,
  };
}

describe('Azure CE checkpoint artifacts', () => {
  it('strictly validates identity, engine, state, prefix, authorization, and snapshot binding', () => {
    expect(validateAzureCeCheckpoint(checkpoint(), plan).schemaVersion).toBe(AZURE_CE_CHECKPOINT_SCHEMA_VERSION);
    for (const malformed of [
      checkpoint({ planId: `${plan.planId}-other` }),
      checkpoint({ engine: 'terraform' }),
      checkpoint({ state: 'complete' }),
      checkpoint({ completedActionIds: ['not-an-action'] }),
      checkpoint({ authorization: { apply: true, terms: false, destroy: 'yes' } as unknown as typeof authorization }),
      checkpoint({ observationFingerprint: '0'.repeat(64) }),
      checkpoint({ observationSnapshot: { ...observation, regions: 'invalid' } as unknown as typeof observation }),
    ]) {
      expect(() => validateAzureCeCheckpoint(malformed, plan)).toThrow();
    }
  });

  it('permits only an empty authorization seed without a version-4 snapshot pair', () => {
    const seed = checkpoint({ observationFingerprint: undefined, observationSnapshot: undefined });
    expect(validateAzureCeCheckpoint(seed, plan)).toEqual(seed);
    expect(() => validateAzureCeCheckpoint({ ...seed, authorization: undefined }, plan)).toThrow(
      /snapshot and fingerprint/,
    );
    expect(() => validateAzureCeCheckpoint({ ...seed, completedActionIds: [plan.actions[0].id] }, plan)).toThrow(
      /snapshot and fingerprint/,
    );
    expect(() => validateAzureCeCheckpoint({ ...seed, observationFingerprint: '0'.repeat(64) }, plan)).toThrow(
      /snapshot and fingerprint/,
    );
  });

  it('rejects older native checkpoint schemas without synthesizing observation evidence', () => {
    const older = {
      schemaVersion: AZURE_CE_SCHEMA_VERSION,
      engine: plan.engine,
      planId: plan.planId,
      planSha256: plan.planSha256,
      authorization,
      completedActionIds: [],
      state: 'running',
    };
    for (const record of [
      older,
      { ...older, observationFingerprint: plan.observationFingerprint },
      { ...older, completedActionIds: [plan.actions[0].id], observationFingerprint: plan.observationFingerprint },
    ])
      expect(() => validateAzureCeCheckpoint(record, plan)).toThrow(/unsupported schema version/);
  });

  it('fails closed on the newest malformed checkpoint for the requested plan', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'azure-ce-checkpoints-'));
    directories.push(directory);
    const manager: SessionManagerLike = {
      getSessionId: () => 'checkpoint-test',
      getArtifactsDir: () => directory,
      getArtifactPath: async () => null,
      saveArtifact: async () => 'saved',
    };
    await writeFile(
      join(directory, '001.azure-ce-checkpoint.log'),
      JSON.stringify({ kind: 'azure-ce-checkpoint', checkpoint: checkpoint() }),
    );
    await writeFile(
      join(directory, '002.azure-ce-checkpoint.log'),
      JSON.stringify({
        kind: 'azure-ce-checkpoint',
        checkpoint: { ...checkpoint(), authorization: { apply: true, terms: false, destroy: 'yes' } },
      }),
    );
    await expect(loadCheckpoint(manager, plan)).rejects.toThrow(/authorization/);
  });
});

it.each(['malformed', 'unavailable'] as const)(
  'rejects %s checkpoint evidence instead of falling back to older success or absence',
  async (mode) => {
    const directory = await mkdtemp(join(tmpdir(), 'azure-checkpoint-evidence-'));
    directories.push(directory);
    await writeFile(
      join(directory, '001.azure-ce-checkpoint.log'),
      JSON.stringify({ kind: 'azure-ce-checkpoint', checkpoint: checkpoint() }),
    );
    await writeFile(join(directory, '999.azure-ce-checkpoint.log'), 'synthetic-private-marker');
    const manager: SessionManagerLike = {
      getSessionId: () => 'checkpoint-evidence',
      getArtifactsDir: () => (mode === 'unavailable' ? join(directory, '999.azure-ce-checkpoint.log') : directory),
      getArtifactPath: async () => null,
      saveArtifact: async () => 'saved',
    };
    await expect(loadCheckpoint(manager, plan)).rejects.toThrow(
      mode === 'malformed' ? 'Persisted Azure CE checkpoint JSON is malformed' : /not a directory/,
    );
  },
);

it.each([null, [], {}, { kind: 'azure-ce-checkpoint', checkpoint: [] }].map((envelope) => [envelope]))(
  'rejects malformed checkpoint envelopes before older success',
  async (envelope) => {
    const directory = await mkdtemp(join(tmpdir(), 'azure-checkpoint-envelope-'));
    directories.push(directory);
    await writeFile(
      join(directory, '001.azure-ce-checkpoint.log'),
      JSON.stringify({ kind: 'azure-ce-checkpoint', checkpoint: checkpoint() }),
    );
    await writeFile(join(directory, '999.azure-ce-checkpoint.log'), JSON.stringify(envelope));
    const manager: SessionManagerLike = {
      getSessionId: () => 'checkpoint-envelope',
      getArtifactsDir: () => directory,
      getArtifactPath: async () => null,
      saveArtifact: async () => 'saved',
    };
    await expect(loadCheckpoint(manager, plan)).rejects.toThrow(/malformed/);
  },
);
