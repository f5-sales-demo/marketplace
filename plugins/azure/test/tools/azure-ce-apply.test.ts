import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { AzExecApi } from '../../src/az/exec';
import { type SessionManagerLike, saveCheckpoint, savePlanArtifact } from '../../src/ce/artifacts';
import { compileAzureCePlan } from '../../src/ce/planner';
import { fingerprintCheckpointObservation } from '../../src/ce/recovery';
import type { AzureCeObservation } from '../../src/ce/types';
import { AZURE_CE_CHECKPOINT_SCHEMA_VERSION, AZURE_CE_SCHEMA_VERSION } from '../../src/ce/types';
import { executeAzureCeNativeApply } from '../../src/tools/azure-ce-apply';
import { intent, observation } from '../ce/fixtures';

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true });
});

async function fixture(resourceKinds: Array<'vm' | 'vnet'>, missing: Array<'vm' | 'vnet'> = ['vm']) {
  const directory = await mkdtemp(join(tmpdir(), 'azure-ce-apply-recovery-'));
  directories.push(directory);
  const events: string[] = [];
  let sequence = 0;
  const sessionManager: SessionManagerLike = {
    getSessionId: () => directory,
    getArtifactsDir: () => directory,
    getArtifactPath: async () => null,
    async saveArtifact(content, toolType) {
      sequence++;
      await writeFile(join(directory, `${String(sequence).padStart(3, '0')}.${toolType}.log`), content);
      if (toolType === 'azure-ce-checkpoint') {
        const parsed = JSON.parse(content) as { checkpoint: { completedActionIds: string[]; state: string } };
        events.push(`save:${parsed.checkpoint.completedActionIds.length}:${parsed.checkpoint.state}`);
      }
      return String(sequence);
    },
  };
  const groupId = `/subscriptions/${intent.subscriptionId}/resourceGroups/${intent.resourceGroup}`;
  const ids = {
    vm: `${groupId}/providers/Microsoft.Compute/virtualMachines/${intent.deploymentName}-1`,
    vnet: `${groupId}/providers/Microsoft.Network/virtualNetworks/${intent.deploymentName}-vnet`,
  };
  const tags = {
    'xcsh-managed-by': 'azure-ce',
    'xcsh-execution-engine': 'native',
    'xcsh-deployment-id': intent.deploymentName,
  };
  const previous = structuredClone(observation);
  previous.resources = resourceKinds.map((kind) => ({
    id: ids[kind],
    exists: true,
    owned: true,
    tags,
    state: {},
  }));
  const plan = compileAzureCePlan({ ...intent, operation: 'teardown' }, previous);
  await savePlanArtifact(sessionManager, plan, previous);
  await saveCheckpoint(sessionManager, plan, {
    schemaVersion: AZURE_CE_CHECKPOINT_SCHEMA_VERSION,
    engine: 'native',
    authorization: { apply: true, terms: false, destroy: true },
    planId: plan.planId,
    planSha256: plan.planSha256,
    completedActionIds: [],
    failedActionId: plan.actions[0].id,
    observationFingerprint: fingerprintCheckpointObservation(previous),
    observationSnapshot: previous,
    state: 'partial',
  });
  events.length = 0;
  let current = structuredClone(previous);
  if (missing.length > 0) {
    const missingIds = new Set(missing.map((kind) => ids[kind].toLowerCase()));
    current.resources = current.resources.filter((resource) => !missingIds.has(resource.id.toLowerCase()));
  }
  const api: AzExecApi = {
    async exec(_command, args) {
      if (args[0] !== 'resource') throw new Error(`unexpected command: ${args.join(' ')}`);
      const resourceId = String(args[3]);
      const selected = current.resources.find((resource) => resource.id.toLowerCase() === resourceId.toLowerCase());
      if (args[1] === 'show') {
        events.push(`probe:${resourceId.toLowerCase()}`);
        return selected
          ? { exitCode: 0, stdout: JSON.stringify(selected), stderr: '' }
          : { exitCode: 1, stdout: '', stderr: '(ResourceNotFound) absent\nCode: ResourceNotFound' };
      }
      if (args[1] === 'delete') {
        events.push(`mutate:${resourceId.toLowerCase()}`);
        current = structuredClone(current);
        current.resources = current.resources.filter(
          (resource) => resource.id.toLowerCase() !== resourceId.toLowerCase(),
        );
        return { exitCode: 0, stdout: '', stderr: '' };
      }
      throw new Error(`unexpected command: ${args.join(' ')}`);
    },
  };
  const platform = async () => {
    events.push('platform');
    return {
      runtime: async () => ({ engine: 'native' }),
      storage: async () => ({
        async read() {
          const error = new Error('missing') as NodeJS.ErrnoException;
          error.code = 'ENOENT';
          throw error;
        },
        async write() {},
        async verify() {},
      }),
    } as unknown as CePlatformService;
  };
  return {
    plan,
    previous,
    current: () => structuredClone(current) as AzureCeObservation,
    ids,
    events,
    sessionManager,
    api,
    platform,
  };
}

describe('Azure CE native apply deletion recovery', () => {
  it('orders probe, repaired checkpoint persistence, and the next mutation without replay', async () => {
    const f = await fixture(['vm', 'vnet']);
    const result = await executeAzureCeNativeApply(
      { planId: f.plan.planId, planSha256: f.plan.planSha256 },
      { cwd: '/tmp', hasUI: false, ui: { confirm: async () => false }, sessionManager: f.sessionManager },
      f.api,
      f.platform,
      undefined,
      { observe: async () => f.current() },
    );
    expect(result.checkpoint.state).toBe('complete');
    expect(result.checkpoint.authorization).toEqual({ apply: true, terms: false, destroy: true });
    expect(f.events.filter((event) => event.startsWith('mutate:'))).toEqual([`mutate:${f.ids.vnet.toLowerCase()}`]);
    const recoveredSave = f.events.indexOf('save:1:running');
    const platform = f.events.indexOf('platform');
    const mutation = f.events.indexOf(`mutate:${f.ids.vnet.toLowerCase()}`);
    expect(recoveredSave).toBeGreaterThan(f.events.indexOf(`probe:${f.ids.vm.toLowerCase()}`));
    expect(platform).toBeGreaterThan(recoveredSave);
    expect(mutation).toBeGreaterThan(recoveredSave);
  });

  it('persists completion and returns before platform initialization when the whole tail is absent', async () => {
    const f = await fixture(['vm']);
    const result = await executeAzureCeNativeApply(
      { planId: f.plan.planId, planSha256: f.plan.planSha256 },
      { cwd: '/tmp', hasUI: false, ui: { confirm: async () => false }, sessionManager: f.sessionManager },
      f.api,
      f.platform,
      undefined,
      { observe: async () => f.current() },
    );
    expect(result.checkpoint.state).toBe('complete');
    expect(result.checkpoint.completedActionIds).toEqual(f.plan.actions.map((action) => action.id));
    expect(f.events).toContain('save:1:complete');
    expect(f.events).not.toContain('platform');
    expect(f.events.some((event) => event.startsWith('mutate:'))).toBe(false);
  });

  it('persists a legacy checkpoint upgrade before platform initialization and mutation', async () => {
    const f = await fixture(['vm'], []);
    await f.sessionManager.saveArtifact(
      JSON.stringify({
        kind: 'azure-ce-checkpoint',
        checkpoint: {
          schemaVersion: AZURE_CE_SCHEMA_VERSION,
          engine: 'native',
          authorization: { apply: true, terms: false, destroy: true },
          planId: f.plan.planId,
          planSha256: f.plan.planSha256,
          completedActionIds: [],
          state: 'running',
        },
      }),
      'azure-ce-checkpoint',
    );
    f.events.length = 0;
    const result = await executeAzureCeNativeApply(
      { planId: f.plan.planId, planSha256: f.plan.planSha256 },
      { cwd: '/tmp', hasUI: false, ui: { confirm: async () => false }, sessionManager: f.sessionManager },
      f.api,
      f.platform,
      undefined,
      { observe: async () => f.current() },
    );
    expect(result.checkpoint.schemaVersion).toBe(AZURE_CE_CHECKPOINT_SCHEMA_VERSION);
    const upgradeSave = f.events.indexOf('save:0:running');
    expect(upgradeSave).toBeGreaterThanOrEqual(0);
    expect(f.events.indexOf('platform')).toBeGreaterThan(upgradeSave);
    expect(f.events.indexOf(`mutate:${f.ids.vm.toLowerCase()}`)).toBeGreaterThan(upgradeSave);
  });

  it('rejects a stale incomplete legacy teardown without platform initialization or replay', async () => {
    const f = await fixture(['vm', 'vnet'], ['vm', 'vnet']);
    await f.sessionManager.saveArtifact(
      JSON.stringify({
        kind: 'azure-ce-checkpoint',
        checkpoint: {
          schemaVersion: AZURE_CE_SCHEMA_VERSION,
          engine: 'native',
          authorization: { apply: true, terms: false, destroy: true },
          planId: f.plan.planId,
          planSha256: f.plan.planSha256,
          completedActionIds: [f.plan.actions[0].id],
          failedActionId: f.plan.actions[1].id,
          observationFingerprint: f.plan.observationFingerprint,
          state: 'partial',
        },
      }),
      'azure-ce-checkpoint',
    );
    f.events.length = 0;
    await expect(
      executeAzureCeNativeApply(
        { planId: f.plan.planId, planSha256: f.plan.planSha256 },
        { cwd: '/tmp', hasUI: false, ui: { confirm: async () => false }, sessionManager: f.sessionManager },
        f.api,
        f.platform,
        undefined,
        { observe: async () => f.current() },
      ),
    ).rejects.toThrow(/Stale incomplete legacy Azure teardown checkpoint/);
    expect(f.events).not.toContain('platform');
    expect(f.events.some((event) => event.startsWith('mutate:'))).toBe(false);
  });
});
