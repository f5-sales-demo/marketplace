import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { AzExecApi } from '../../src/az/exec';
import { type SessionManagerLike, saveCheckpoint, savePlanArtifact } from '../../src/ce/artifacts';
import { canonicalSha256 } from '../../src/ce/canonical';
import { buildAzureNativePendingAction } from '../../src/ce/native-action-recovery';
import { compileAzureCePlan } from '../../src/ce/planner';
import { fingerprintCheckpointObservation } from '../../src/ce/recovery';
import type { AzureCeObservation, AzureCePlan } from '../../src/ce/types';
import { AZURE_CE_CHECKPOINT_SCHEMA_VERSION, AZURE_CE_SCHEMA_VERSION } from '../../src/ce/types';
import { executeAzureCeNativeApply } from '../../src/tools/azure-ce-apply';
import { intent, observation } from '../ce/fixtures';

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true });
});

function withOnlyAction(plan: AzureCePlan, actionIndex: number): AzureCePlan {
  const { planId: _planId, planSha256: _planSha256, ...draft } = structuredClone(plan);
  draft.actions = [draft.actions[actionIndex]];
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `azure-ce-${planSha256.slice(0, 24)}`, planSha256 };
}

async function session(directory: string, events: string[]): Promise<SessionManagerLike> {
  let sequence = 0;
  return {
    getSessionId: () => directory,
    getArtifactsDir: () => directory,
    getArtifactPath: async () => null,
    async saveArtifact(content, toolType) {
      sequence++;
      if (toolType === 'azure-ce-checkpoint') {
        const parsed = JSON.parse(content) as {
          checkpoint: { completedActionIds: string[]; pendingAction?: { actionId: string } };
        };
        events.push(
          `save:${parsed.checkpoint.completedActionIds.length}:${parsed.checkpoint.pendingAction?.actionId ?? 'none'}`,
        );
      }
      await writeFile(join(directory, `${String(sequence).padStart(3, '0')}.${toolType}.log`), content);
      return String(sequence);
    },
  };
}

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

describe('Azure CE native mutation recovery', () => {
  it('persists immutable mutation intent before create and verifies its postcondition before completion', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'azure-ce-apply-create-order-'));
    directories.push(directory);
    const events: string[] = [];
    const sessionManager = await session(directory, events);
    const compiled = compileAzureCePlan(intent, observation);
    const index = compiled.actions.findIndex((action) => action.kind === 'resource-group-create');
    if (index < 0) throw new Error('fixture has no resource-group create action');
    const plan = withOnlyAction(compiled, index);
    const action = plan.actions[0];
    let current = structuredClone(observation);
    await savePlanArtifact(sessionManager, plan, observation);
    await saveCheckpoint(sessionManager, plan, {
      schemaVersion: AZURE_CE_CHECKPOINT_SCHEMA_VERSION,
      engine: 'native',
      authorization: { apply: true, terms: false, destroy: false },
      planId: plan.planId,
      planSha256: plan.planSha256,
      completedActionIds: [],
      state: 'running',
    });
    events.length = 0;
    let groupShowCalls = 0;
    const result = await executeAzureCeNativeApply(
      { planId: plan.planId, planSha256: plan.planSha256 },
      { cwd: '/tmp', hasUI: false, ui: { confirm: async () => false }, sessionManager },
      {
        async exec(_command, args) {
          if (args[0] === 'group' && args[1] === 'show') {
            groupShowCalls++;
            events.push(groupShowCalls === 1 ? 'ownership' : 'postcondition');
            if (groupShowCalls === 1) return { exitCode: 1, stdout: '', stderr: '(ResourceGroupNotFound) absent' };
            return {
              exitCode: 0,
              stderr: '',
              stdout: JSON.stringify({
                id: action.resourceId,
                location: plan.region,
                tags: current.resources[0].tags,
                properties: { provisioningState: 'Succeeded' },
              }),
            };
          }
          if (args[0] === 'group' && args[1] === 'create') {
            events.push('mutation');
            current = structuredClone(current);
            current.resources = [
              {
                id: action.resourceId as string,
                location: plan.region,
                exists: true,
                owned: true,
                tags: {
                  'xcsh-managed-by': 'azure-ce',
                  'xcsh-execution-engine': 'native',
                  'xcsh-deployment-id': plan.deploymentName,
                  'xcsh-plan-sha256': plan.planSha256,
                },
                state: { provisioningState: 'Succeeded' },
              },
            ];
            return { exitCode: 0, stdout: '{}', stderr: '' };
          }
          throw new Error(`unexpected Azure call: ${args.join(' ')}`);
        },
      },
      async () =>
        ({
          runtime: async () => ({
            engine: 'native',
            requireBootstrapContract() {},
            async reserveSite() {
              events.push('reserve-site');
            },
          }),
          storage: async () => ({
            async read() {
              const error = new Error('missing') as NodeJS.ErrnoException;
              error.code = 'ENOENT';
              throw error;
            },
            async write() {},
            async verify() {},
          }),
        }) as unknown as CePlatformService,
      undefined,
      { observe: async () => structuredClone(current) },
    );
    expect(result.checkpoint.state).toBe('complete');
    const pendingSave = events.indexOf(`save:0:${action.id}`);
    expect(pendingSave).toBeGreaterThan(events.indexOf('ownership'));
    expect(events.indexOf('mutation')).toBeGreaterThan(pendingSave);
    expect(events.indexOf('postcondition')).toBeGreaterThan(events.indexOf('mutation'));
    expect(events.indexOf('save:1:none')).toBeGreaterThan(events.indexOf('postcondition'));
  });

  it('reconciles an exact completed create before platform initialization without replay', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'azure-ce-apply-create-recovery-'));
    directories.push(directory);
    const events: string[] = [];
    const sessionManager = await session(directory, events);
    const compiled = compileAzureCePlan(intent, observation);
    const index = compiled.actions.findIndex((action) => action.kind === 'resource-group-create');
    if (index < 0) throw new Error('fixture has no resource-group create action');
    const plan = withOnlyAction(compiled, index);
    const action = plan.actions[0];
    const current = structuredClone(observation);
    current.resources = [
      {
        id: action.resourceId as string,
        location: plan.region,
        exists: true,
        owned: true,
        tags: {
          'xcsh-managed-by': 'azure-ce',
          'xcsh-execution-engine': 'native',
          'xcsh-deployment-id': plan.deploymentName,
          'xcsh-plan-sha256': plan.planSha256,
        },
        state: { provisioningState: 'Succeeded' },
      },
    ];
    await savePlanArtifact(sessionManager, plan, observation);
    await saveCheckpoint(sessionManager, plan, {
      schemaVersion: AZURE_CE_CHECKPOINT_SCHEMA_VERSION,
      engine: 'native',
      authorization: { apply: true, terms: false, destroy: false },
      planId: plan.planId,
      planSha256: plan.planSha256,
      completedActionIds: [],
      failedActionId: action.id,
      pendingAction: buildAzureNativePendingAction(plan, action),
      observationFingerprint: fingerprintCheckpointObservation(observation),
      observationSnapshot: observation,
      state: 'partial',
    });
    events.length = 0;
    const result = await executeAzureCeNativeApply(
      { planId: plan.planId, planSha256: plan.planSha256 },
      { cwd: '/tmp', hasUI: false, ui: { confirm: async () => false }, sessionManager },
      {
        async exec(_command, args) {
          if (args[0] !== 'group' || args[1] !== 'show') throw new Error(`unexpected replay: ${args.join(' ')}`);
          events.push('probe');
          return {
            exitCode: 0,
            stderr: '',
            stdout: JSON.stringify({
              id: action.resourceId,
              location: plan.region,
              tags: current.resources[0].tags,
              properties: { provisioningState: 'Succeeded' },
            }),
          };
        },
      },
      async () => {
        events.push('platform');
        throw new Error('platform must not initialize');
      },
      undefined,
      { observe: async () => structuredClone(current) },
    );
    expect(result.checkpoint.state).toBe('complete');
    expect(result.checkpoint.pendingAction).toBeUndefined();
    expect(events[0]).toBe('probe');
    expect(events[1]).toBe('save:1:none');
    expect(events).not.toContain('platform');
  });

  it('reconciles an exact VM lifecycle postcondition and rejects a forged pending request', async () => {
    const owned = structuredClone(observation);
    const originalOwnerPlan = '9'.repeat(64);
    const vmId = `/subscriptions/${intent.subscriptionId}/resourceGroups/${intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${intent.deploymentName}-1`;
    owned.resources = [
      {
        id: vmId,
        location: 'eastus',
        exists: true,
        owned: true,
        tags: {
          'xcsh-managed-by': 'azure-ce',
          'xcsh-execution-engine': 'native',
          'xcsh-deployment-id': intent.deploymentName,
          'xcsh-plan-sha256': originalOwnerPlan,
        },
        state: { provisioningState: 'Succeeded' },
      },
    ];
    const compiled = compileAzureCePlan({ ...intent, operation: 'start' }, owned);
    const plan = withOnlyAction(compiled, 0);
    const action = plan.actions[0];
    const pending = buildAzureNativePendingAction(plan, action);
    const directory = await mkdtemp(join(tmpdir(), 'azure-ce-apply-lifecycle-recovery-'));
    directories.push(directory);
    const events: string[] = [];
    const sessionManager = await session(directory, events);
    await savePlanArtifact(sessionManager, plan, owned);
    await expect(
      saveCheckpoint(sessionManager, plan, {
        schemaVersion: AZURE_CE_CHECKPOINT_SCHEMA_VERSION,
        engine: 'native',
        authorization: { apply: true, terms: false, destroy: false },
        planId: plan.planId,
        planSha256: plan.planSha256,
        completedActionIds: [],
        pendingAction: { ...pending, requestSha256: '0'.repeat(64) },
        observationFingerprint: fingerprintCheckpointObservation(owned),
        observationSnapshot: owned,
        state: 'running',
      }),
    ).rejects.toThrow(/differs from the immutable request/);
    await saveCheckpoint(sessionManager, plan, {
      schemaVersion: AZURE_CE_CHECKPOINT_SCHEMA_VERSION,
      engine: 'native',
      authorization: { apply: true, terms: false, destroy: false },
      planId: plan.planId,
      planSha256: plan.planSha256,
      completedActionIds: [],
      pendingAction: pending,
      observationFingerprint: fingerprintCheckpointObservation(owned),
      observationSnapshot: owned,
      state: 'running',
    });
    events.length = 0;
    const result = await executeAzureCeNativeApply(
      { planId: plan.planId, planSha256: plan.planSha256 },
      { cwd: '/tmp', hasUI: false, ui: { confirm: async () => false }, sessionManager },
      {
        async exec(_command, args) {
          if (args[0] !== 'vm' || args[1] !== 'show') throw new Error(`unexpected replay: ${args.join(' ')}`);
          events.push('probe');
          return {
            exitCode: 0,
            stderr: '',
            stdout: JSON.stringify({
              id: vmId,
              location: plan.region,
              provisioningState: 'Succeeded',
              powerState: 'VM running',
              tags: owned.resources[0].tags,
            }),
          };
        },
      },
      async () => {
        events.push('platform');
        throw new Error('platform must not initialize');
      },
      undefined,
      { observe: async () => structuredClone(owned) },
    );
    expect(result.checkpoint.state).toBe('complete');
    expect(events).toEqual(['probe', 'save:1:none']);
  });
  it('reconciles a completed Route Server peer update without replaying its mutation', async () => {
    const owner = 'a'.repeat(64);
    const selected = {
      ...intent,
      operation: 'update-network' as const,
      routing: { mode: 'route-server' as const, destinationCidrs: ['10.250.0.10/32'], localAsn: 64512 },
    };
    const groupId = `/subscriptions/${selected.subscriptionId}/resourceGroups/${selected.resourceGroup}`;
    const vmId = `${groupId}/providers/Microsoft.Compute/virtualMachines/${selected.deploymentName}-1`;
    const nicId = `${groupId}/providers/Microsoft.Network/networkInterfaces/${selected.deploymentName}-1-nic0`;
    const routeServerId = `${groupId}/providers/Microsoft.Network/virtualHubs/${selected.deploymentName}-rs`;
    const tags = {
      'xcsh-managed-by': 'azure-ce',
      'xcsh-execution-engine': 'native',
      'xcsh-deployment-id': selected.deploymentName,
      'xcsh-plan-sha256': owner,
    };
    const owned = {
      ...structuredClone(observation),
      resources: [
        { id: vmId, location: selected.region, exists: true, owned: true, tags, state: {} },
        { id: nicId, location: selected.region, exists: true, owned: true, tags, state: {} },
        { id: routeServerId, location: selected.region, exists: true, owned: true, tags, state: {} },
      ],
    };
    const compiled = compileAzureCePlan(selected, owned);
    const nic = compiled.actions.find((action) => action.kind === 'nic-update');
    const vm = compiled.actions.find((action) => action.kind === 'vm-start');
    const peer = compiled.actions.find((action) => action.kind === 'route-server-peer-update');
    if (!nic || !vm || !peer?.resourceId) throw new Error('network-update recovery fixture is incomplete');
    const { planId: _planId, planSha256: _planSha256, ...draft } = structuredClone(compiled);
    draft.actions = [nic, vm, peer];
    const planSha256 = canonicalSha256(draft);
    const plan: AzureCePlan = { ...draft, planId: `azure-ce-${planSha256.slice(0, 24)}`, planSha256 };
    const directory = await mkdtemp(join(tmpdir(), 'azure-ce-apply-peer-recovery-'));
    directories.push(directory);
    const events: string[] = [];
    const sessionManager = await session(directory, events);
    await savePlanArtifact(sessionManager, plan, owned);
    await saveCheckpoint(sessionManager, plan, {
      schemaVersion: AZURE_CE_CHECKPOINT_SCHEMA_VERSION,
      engine: 'native',
      authorization: { apply: true, terms: false, destroy: false },
      planId: plan.planId,
      planSha256: plan.planSha256,
      completedActionIds: [nic.id, vm.id],
      pendingAction: buildAzureNativePendingAction(plan, peer),
      observationFingerprint: fingerprintCheckpointObservation(owned),
      observationSnapshot: owned,
      state: 'running',
    });
    events.length = 0;
    const result = await executeAzureCeNativeApply(
      { planId: plan.planId, planSha256: plan.planSha256 },
      { cwd: '/tmp', hasUI: false, ui: { confirm: async () => false }, sessionManager },
      {
        async exec(_command, args) {
          if (args.includes('update')) throw new Error(`unexpected replay: ${args.join(' ')}`);
          if (args[0] === 'network' && args[1] === 'nic')
            return {
              exitCode: 0,
              stderr: '',
              stdout: JSON.stringify({
                id: nicId,
                provisioningState: 'Succeeded',
                tags,
                virtualMachine: { id: vmId },
                macAddress: '00-11-22-33-44-55',
                ipConfigurations: [
                  {
                    primary: true,
                    privateIPAddressVersion: 'IPv4',
                    privateIPAddress: '10.20.0.4',
                    subnet: { id: plan.nics[0].subnet.resourceId },
                  },
                ],
              }),
            };
          if (args[0] === 'vm')
            return {
              exitCode: 0,
              stderr: '',
              stdout: JSON.stringify({
                id: vmId,
                provisioningState: 'Succeeded',
                tags,
                networkProfile: { networkInterfaces: [{ id: nicId }] },
              }),
            };
          if (args[0] === 'resource' && args[3] === peer.resourceId)
            return {
              exitCode: 0,
              stderr: '',
              stdout: JSON.stringify({
                id: peer.resourceId,
                properties: { provisioningState: 'Succeeded', peerIp: '10.20.0.4', peerAsn: 64512 },
              }),
            };
          if (args[0] === 'resource' && args[3] === routeServerId)
            return { exitCode: 0, stderr: '', stdout: JSON.stringify({ id: routeServerId, tags }) };
          throw new Error(`unexpected command: ${args.join(' ')}`);
        },
      },
      async () => {
        events.push('platform');
        throw new Error('platform must not initialize');
      },
      undefined,
      { observe: async () => structuredClone(owned) },
    );
    expect(result.checkpoint.state).toBe('complete');
    expect(events).toEqual(['save:3:none']);
  });
});

it('checkpoints native platform ingress before collecting content-bound traffic evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'azure-ce-apply-ingress-'));
  directories.push(directory);
  const sourceVmResourceId =
    `/subscriptions/${intent.subscriptionId}/resourceGroups/rg-app/providers/Microsoft.Compute/virtualMachines/probe`.toLowerCase();
  const selected = structuredClone(intent);
  selected.nics = [
    { name: 'slo', role: 'slo', subnet: { mode: 'greenfield', cidr: '10.20.0.0/24', name: 'slo' } },
    { name: 'sli', role: 'sli', subnet: { mode: 'greenfield', cidr: '10.20.1.0/24', name: 'sli' } },
  ];
  selected.ingress = {
    mode: 'platform-http',
    port: 8080,
    listener: {
      name: 'ce-listener',
      namespace: 'system',
      domain: 'ce.example.invalid',
      privateAddress: '10.20.1.10',
      originPool: { name: 'ce-origin', namespace: 'system' },
    },
    probe: {
      sourceVmResourceId,
      path: '/healthz',
      expectedStatus: 200,
      expectedBodySha256: '4'.repeat(64),
    },
  };
  selected.brownfield.resourceIds = [sourceVmResourceId];
  const observed = structuredClone(observation);
  observed.resources = [{ id: sourceVmResourceId, exists: true, owned: false, tags: {}, state: {} }];
  const plan = compileAzureCePlan(selected, observed);
  const ingressAction = plan.actions.find((action) => action.kind === 'f5-ingress-configure');
  const trafficAction = plan.actions.find((action) => action.kind === 'traffic-gate');
  if (!ingressAction || !trafficAction) throw new Error('ingress fixture actions are missing');
  const events: string[] = [];
  let sequence = 0;
  const sessionManager: SessionManagerLike = {
    getSessionId: () => directory,
    getArtifactsDir: () => directory,
    getArtifactPath: async () => null,
    async saveArtifact(content, toolType) {
      sequence++;
      if (toolType === 'azure-ce-checkpoint') {
        const value = JSON.parse(content) as { checkpoint: { completedActionIds: string[] } };
        events.push(`save:${value.checkpoint.completedActionIds.at(-1) ?? 'seed'}`);
      }
      await writeFile(join(directory, `${String(sequence).padStart(3, '0')}.${toolType}.log`), content);
      return String(sequence);
    },
  };
  await savePlanArtifact(sessionManager, plan, observed);
  await saveCheckpoint(sessionManager, plan, {
    schemaVersion: AZURE_CE_CHECKPOINT_SCHEMA_VERSION,
    engine: 'native',
    authorization: { apply: true, terms: false, destroy: false },
    planId: plan.planId,
    planSha256: plan.planSha256,
    completedActionIds: plan.actions.slice(0, -2).map((action) => action.id),
    observationFingerprint: fingerprintCheckpointObservation(observed),
    observationSnapshot: observed,
    state: 'running',
  });
  events.length = 0;
  const store = await CeDeploymentStore.open(directory, {
    deploymentId: plan.deploymentName,
    engine: 'native',
    provider: 'azure',
    account: plan.subscription.id,
    region: plan.region,
  });
  const runtime = {
    engine: 'native',
    requireBootstrapContract() {},
    async reserveSite(_binding: unknown, checkpoint: (value: unknown) => Promise<void>) {
      await checkpoint({ reserved: true });
    },
  };
  const platform = async () =>
    ({ runtime: async () => runtime, storage: async () => store }) as unknown as CePlatformService;
  const result = await executeAzureCeNativeApply(
    { planId: plan.planId, planSha256: plan.planSha256 },
    { cwd: '/tmp', hasUI: false, ui: { confirm: async () => false }, sessionManager },
    {
      async exec() {
        throw new Error('unexpected Azure call');
      },
    },
    platform,
    undefined,
    {
      observe: async () => structuredClone(observed),
      ingressContract: async () => ({ fingerprint: 'sha256:ingress' }) as VerifiedIngressContract,
      ensureIngress: async () => {
        events.push('ingress');
        return {
          ingressPlanId: 'a'.repeat(24),
          contractFingerprint: 'sha256:ingress',
          uid: 'listener-uid',
          listener: 'configured',
          routes: 'unknown',
          traffic: 'unknown',
          observedAt: new Date().toISOString(),
        };
      },
      collectTraffic: async () => {
        events.push('traffic');
        return { status: 'healthy' };
      },
    },
  );
  expect(result.checkpoint.state).toBe('complete');
  expect(events[0]).toBe(`save:${plan.actions.at(-3)?.id}`);
  expect(events.slice(1)).toEqual([
    'ingress',
    `save:${ingressAction.id}`,
    'ingress',
    'traffic',
    `save:${trafficAction.id}`,
  ]);
});
