import { expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCheckpoint, type SessionManagerLike } from '../../src/ce/artifacts';

it('resumes the newest valid numeric artifact across the 99/100 boundary', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'azure-checkpoint-'));
  const session: SessionManagerLike = {
    getSessionId: () => 'fixture-session',
    getArtifactsDir: () => directory,
    saveArtifact: async () => undefined,
    getArtifactPath: async () => null,
  };
  const checkpoint = {
    schemaVersion: 2,
    planId: 'fixture-plan',
    planSha256: 'a'.repeat(64),
    state: 'running',
    completedActionIds: ['001'],
  };
  const save = (id: number, value: unknown) =>
    writeFile(join(directory, `${id}.azure-ce-checkpoint.log`), JSON.stringify(value), { mode: 0o600 });
  try {
    await save(99, { kind: 'azure-ce-checkpoint', checkpoint });
    await save(100, {
      kind: 'azure-ce-checkpoint',
      checkpoint: { ...checkpoint, state: 'partial', completedActionIds: ['001', '002'], failedActionId: '003' },
    });
    await save(101, { kind: 'azure-ce-checkpoint', checkpoint: { ...checkpoint, planId: 'other-plan' } });
    await writeFile(join(directory, '102.azure-ce-checkpoint.log'), '{', { mode: 0o600 });
    const current = await loadCheckpoint(session, checkpoint.planId, checkpoint.planSha256);
    expect(current?.completedActionIds).toEqual(['001', '002']);
    expect(current?.state).toBe('partial');
    expect(current?.failedActionId).toBe('003');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
