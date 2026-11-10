import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCheckpoint, type SessionManagerLike } from '../../src/ce/artifacts';
import { compileAzureCePlan } from '../../src/ce/planner';
import {
  fingerprintCheckpointObservation,
  fingerprintCurrentObservation,
  upgradeAzureCeCheckpoint,
  validateAzureCeCheckpoint,
} from '../../src/ce/recovery';
import type { AzureCeCheckpoint, AzureCeLegacyCheckpoint } from '../../src/ce/types';
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

  it('upgrades empty or matching legacy checkpoints and rejects stale incomplete teardown state', () => {
    const empty: AzureCeLegacyCheckpoint = {
      schemaVersion: AZURE_CE_SCHEMA_VERSION,
      engine: plan.engine,
      planId: plan.planId,
      planSha256: plan.planSha256,
      completedActionIds: [],
      authorization,
      state: 'running',
    };
    const upgraded = upgradeAzureCeCheckpoint(plan, empty, observation);
    expect(upgraded.schemaVersion).toBe(AZURE_CE_CHECKPOINT_SCHEMA_VERSION);
    expect(upgraded.observationSnapshot).toEqual(observation);

    const teardownObservation = structuredClone(observation);
    const groupId = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}`;
    teardownObservation.resources = [
      {
        id: groupId,
        exists: true,
        owned: true,
        tags: {
          'xcsh-managed-by': 'azure-ce',
          'xcsh-execution-engine': 'native',
          'xcsh-deployment-id': plan.deploymentName,
        },
        state: {},
      },
    ];
    const teardown = compileAzureCePlan({ ...intent, operation: 'teardown' }, teardownObservation);
    const legacy: AzureCeLegacyCheckpoint = {
      ...empty,
      authorization: { apply: true, terms: false, destroy: true },
      planId: teardown.planId,
      planSha256: teardown.planSha256,
      completedActionIds: [teardown.actions[0].id],
      observationFingerprint: fingerprintCurrentObservation(teardown, teardownObservation),
    };
    expect(upgradeAzureCeCheckpoint(teardown, legacy, teardownObservation).schemaVersion).toBe(
      AZURE_CE_CHECKPOINT_SCHEMA_VERSION,
    );
    const changed = structuredClone(teardownObservation);
    changed.image.version = '1.0.1';
    expect(() => upgradeAzureCeCheckpoint(teardown, legacy, changed)).toThrow(/Stale incomplete legacy/);
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
