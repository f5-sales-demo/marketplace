import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { Deployment, PlanReceipt } from '../../../terraform/src/runner';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import type { AzExecApi } from '../../src/az/exec';
import { compileAzureCePlan } from '../../src/ce/planner';
import { readAzureTerraformAuthorization } from '../../src/ce/terraform-apply';
import { azureTerraformLifecycleDeployment, runAzureTerraformLifecycle } from '../../src/ce/terraform-lifecycle';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import type { AzureCeIntent } from '../../src/ce/types';
import { intent, observation } from './fixtures';

const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true });
});
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

function lifecyclePlan(operation: 'start' | 'stop' | 'resize', ha = false) {
  const selected = structuredClone(intent);
  selected.engine = 'terraform';
  selected.operation = operation;
  selected.topology.ha = ha;
  if (operation === 'resize') selected.vm.size = 'Standard_D16s_v5';
  const observed = structuredClone(observation);
  observed.regions[0].quotaAvailable = 96;
  observed.regions[0].vmSizes.push({
    name: 'Standard_D16s_v5',
    maxNics: 8,
    vCpus: 16,
    memoryGb: 64,
    zones: ['1'],
    restricted: false,
  });
  const ownerPlanSha256 = 'a'.repeat(64);
  observed.resources = Array.from({ length: ha ? 3 : 1 }, (_, index) => ({
    id: `/subscriptions/${selected.subscriptionId}/resourceGroups/${selected.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${selected.deploymentName}-${index + 1}`,
    location: selected.region,
    exists: true,
    owned: true,
    state: { provisioningState: 'Succeeded' },
    tags: {
      'xcsh-managed-by': 'azure-ce',
      'xcsh-deployment-id': selected.deploymentName,
      'xcsh-execution-engine': 'terraform',
      'xcsh-plan-sha256': ownerPlanSha256,
    },
  }));
  return { plan: compileAzureCePlan(selected as AzureCeIntent, observed), ownerPlanSha256 };
}

function fixture(operation: 'start' | 'stop' | 'resize', ha = false, options: { failAfterMutation?: boolean } = {}) {
  const { plan, ownerPlanSha256 } = lifecyclePlan(operation, ha);
  const power = new Map<number, string>(
    Array.from({ length: plan.topology.nodeCount }, (_, index) => [
      index + 1,
      operation === 'start' ? 'deallocated' : 'running',
    ]),
  );
  const size = new Map<number, string>(
    Array.from({ length: plan.topology.nodeCount }, (_, index) => [index + 1, 'Standard_D8s_v5']),
  );
  const tags = {
    'xcsh-managed-by': 'azure-ce',
    'xcsh-deployment-id': plan.deploymentName,
    'xcsh-execution-engine': 'terraform',
    'xcsh-plan-sha256': ownerPlanSha256,
  };
  const vm = (node: number) => ({
    id: `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${plan.deploymentName}-${node}`,
    name: `${plan.deploymentName}-${node}`,
    location: plan.region,
    provisioningState: 'Succeeded',
    powerState: `VM ${power.get(node)}`,
    hardwareProfile: { vmSize: size.get(node) },
    vmId: `00000000-0000-4000-8000-${String(node).padStart(12, '0')}`,
    tags,
  });
  const api: AzExecApi = {
    async exec(_command, args) {
      if (args[0] === 'resource') {
        const id = args[args.indexOf('--ids') + 1];
        return { exitCode: 0, stderr: '', stdout: JSON.stringify({ id, tags }) };
      }
      if (args[0] === 'vm' && args[1] === 'list')
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify(Array.from({ length: plan.topology.nodeCount }, (_, index) => vm(index + 1))),
        };
      const id = args[args.indexOf('--ids') + 1];
      const node = Number(id.split('-').at(-1));
      return { exitCode: 0, stderr: '', stdout: JSON.stringify(vm(node)) };
    },
  };
  const configurations: string[] = [];
  let mutationCount = 0;
  let reconciliationCount = 0;
  let failAfterMutation = options.failAfterMutation ?? false;
  const sessions = new Map<
    string,
    {
      configuration: string;
      deployment: Deployment;
      inState: boolean;
      journalState: 'absent' | 'planned' | 'applying' | 'applied';
      receipt?: PlanReceipt;
      session: TerraformSession;
    }
  >();
  const terraform: CeTerraformService = {
    async open(_owner, deployment, resume) {
      const existing = sessions.get(deployment.stage ?? '');
      if (!resume) {
        if (existing) throw Object.assign(new Error('exists'), { code: 'EEXIST' });
        const state = {
          configuration: deployment.configuration,
          deployment,
          inState: false,
          journalState: 'absent',
        } as {
          configuration: string;
          deployment: Deployment;
          inState: boolean;
          journalState: 'absent' | 'planned' | 'applying' | 'applied';
          receipt?: PlanReceipt;
          session: TerraformSession;
        };
        const session: TerraformSession = {
          async readConfigurationSha256() {
            return digest(state.configuration);
          },
          async readConfiguration(expected) {
            if (expected !== digest(state.configuration)) throw new Error('stale fixture configuration');
            return state.configuration;
          },
          async reviseConfiguration(expected, next) {
            if (expected !== digest(state.configuration)) throw new Error('stale fixture revision');
            if (state.journalState === 'applying')
              throw new Error('Reconcile interrupted Terraform apply before revising configuration');
            state.configuration = next;
            configurations.push(next);
            return digest(next);
          },
          async plan() {
            const config = JSON.parse(state.configuration);
            const entries = Object.entries(config.resource ?? {}) as Array<[string, Record<string, unknown>]>;
            const present = entries.length === 1;
            const type = entries[0]?.[0];
            const actions = present ? (state.inState ? ['no-op'] : ['create']) : state.inState ? ['delete'] : [];
            const changes = actions.length
              ? [{ address: `${type ?? stateType()}.ce`, type: type ?? stateType(), actions }]
              : [];
            const planned = receipt(
              deployment,
              state.configuration,
              changes,
              changes.length === 0 || actions[0] === 'no-op',
            );
            state.receipt = planned;
            state.journalState = 'planned';
            return planned;
          },
          async apply(applied) {
            if (state.journalState !== 'planned' || state.receipt?.planSha256 !== applied.planSha256)
              throw new Error('Saved plan is consumed or requires reconciliation');
            state.journalState = 'applying';
            const action = applied.changes[0]?.actions[0];
            if (action === 'create' || action === 'update') {
              mutationCount++;
              state.inState = true;
              const node = Number(deployment.stage?.split('-').at(-1));
              if (operation === 'stop') power.set(node, 'deallocated');
              else power.set(node, 'running');
              if (operation === 'resize') size.set(node, plan.vm.size);
            } else if (action === 'delete') state.inState = false;
            if ((action === 'create' || action === 'update') && failAfterMutation) {
              failAfterMutation = false;
              throw new Error('apply response lost');
            }
            state.journalState = 'applied';
          },
          async reconcileApplyFromEvidence(applied, evidenceSha256) {
            if (
              state.journalState !== 'applying' ||
              state.receipt?.planSha256 !== applied.planSha256 ||
              !/^[a-f0-9]{64}$/.test(evidenceSha256)
            )
              throw new Error('fixture reconciliation differs');
            reconciliationCount++;
            state.journalState = 'applied';
          },
          readPlannedResourceFields: async () => ({}),
          readPlannedResourceIds: async () => ({}),
          readOutputs: async () => ({}),
          planDestroy: async () => {
            throw new Error('unexpected destroy');
          },
          planAction: async () => {
            throw new Error('unexpected action');
          },
        };
        state.session = session;
        sessions.set(deployment.stage ?? '', state);
        return session;
      }
      if (!existing) throw new Error('missing fixture stage');
      return existing.session;
    },
  };
  const stateType = () => (operation === 'resize' ? 'azapi_update_resource' : 'azapi_resource_action');
  const receipt = (
    deployment: Deployment,
    configuration: string,
    changes: PlanReceipt['changes'],
    noChanges: boolean,
  ): PlanReceipt => ({
    schemaVersion: 1,
    deploymentId: deployment.deploymentId,
    engine: 'terraform',
    backendIdentity: deployment.backendIdentity,
    configurationSha256: digest(configuration),
    providerLockSha256: digest(deployment.providerLock),
    planSha256: digest(`${configuration}:${JSON.stringify(changes)}`),
    changes,
    noChanges,
  });
  let healthCalls = 0;
  const runtime = {
    engine: 'terraform' as const,
    async observeHealth() {
      healthCalls++;
      return { status: 'healthy' };
    },
    async observeRegistrations() {
      return { status: 'healthy' };
    },
  } as Pick<CeRuntime, 'engine' | 'observeHealth' | 'observeRegistrations'>;
  return {
    plan,
    api,
    terraform,
    runtime,
    power,
    size,
    configurations,
    healthCalls: () => healthCalls,
    mutationCount: () => mutationCount,
    reconciliationCount: () => reconciliationCount,
  };
}

test.each(['start', 'stop', 'resize'] as const)(
  'executes isolated idempotent Terraform %s and releases the action before final no-change',
  async (operation) => {
    const f = fixture(operation);
    const root = await mkdtemp(join(tmpdir(), `azure-terraform-${operation}-`));
    directories.push(root);
    const storage = await CeDeploymentStore.open(root, azureUpgradeBinding(f.plan).owner);
    expect(
      await runAzureTerraformLifecycle(f.plan, f.terraform, f.runtime, storage, f.api, {}, undefined, {
        attempts: 2,
        intervalMs: 0,
        wait: async () => {},
      }),
    ).toMatchObject({ status: 'complete', engine: 'terraform' });
    expect(f.power.get(1)).toBe(operation === 'stop' ? 'deallocated' : 'running');
    if (operation === 'resize') expect(f.size.get(1)).toBe('Standard_D16s_v5');
    expect(f.healthCalls()).toBe(operation === 'stop' ? 0 : 1);
    expect(f.configurations.at(-1)).toContain('"resource":{}');
    expect((await storage.read(`${f.plan.planId}-node-1-final-plan.json`)) as PlanReceipt).toMatchObject({
      noChanges: true,
      changes: [],
    });
  },
);

test('runs three-node power lifecycle serially and resumes a completed exact plan without replay', async () => {
  const f = fixture('start', true);
  const root = await mkdtemp(join(tmpdir(), 'azure-terraform-ha-start-'));
  directories.push(root);
  const storage = await CeDeploymentStore.open(root, azureUpgradeBinding(f.plan).owner);
  const options = { attempts: 2, intervalMs: 0, wait: async () => {} };
  await runAzureTerraformLifecycle(f.plan, f.terraform, f.runtime, storage, f.api, {}, undefined, options);
  const revisions = f.configurations.length;
  expect([...f.power.values()]).toEqual(['running', 'running', 'running']);
  expect(f.healthCalls()).toBe(3);
  await runAzureTerraformLifecycle(f.plan, f.terraform, f.runtime, storage, f.api, {}, undefined, options);
  expect(f.configurations).toHaveLength(revisions);
});

test('reconciles a lost mutation response from observed VM evidence without replaying the action', async () => {
  const f = fixture('start', false, { failAfterMutation: true });
  const root = await mkdtemp(join(tmpdir(), 'azure-terraform-interrupted-start-'));
  directories.push(root);
  const storage = await CeDeploymentStore.open(root, azureUpgradeBinding(f.plan).owner);
  await runAzureTerraformLifecycle(f.plan, f.terraform, f.runtime, storage, f.api, {}, undefined, {
    attempts: 2,
    intervalMs: 0,
    wait: async () => {},
  });
  expect(f.power.get(1)).toBe('running');
  expect(f.mutationCount()).toBe(1);
  expect(f.reconciliationCount()).toBe(1);
  expect((await storage.read(`${f.plan.planId}-node-1-final-plan.json`)) as PlanReceipt).toMatchObject({
    noChanges: true,
    changes: [],
  });
});

test('renders exact scoped AzAPI resources and rejects a foreign engine before opening Terraform', async () => {
  const start = lifecyclePlan('start').plan;
  const power = JSON.parse((await azureTerraformLifecycleDeployment(start, 1)).configuration);
  expect(power.provider.azapi).toEqual({
    subscription_id: start.subscription.id,
    tenant_id: start.subscription.tenantId,
  });
  expect(power.resource.azapi_resource_action.ce).toMatchObject({
    action: 'start',
    method: 'POST',
    type: 'Microsoft.Compute/virtualMachines@2024-07-01',
  });
  const resize = lifecyclePlan('resize').plan;
  const update = JSON.parse((await azureTerraformLifecycleDeployment(resize, 1)).configuration);
  expect(update.resource.azapi_update_resource.ce.body.properties.hardwareProfile.vmSize).toBe('Standard_D16s_v5');
  let calls = 0;
  const root = await mkdtemp(join(tmpdir(), 'azure-terraform-wrong-engine-'));
  directories.push(root);
  const storage = await CeDeploymentStore.open(root, azureUpgradeBinding(start).owner);
  await expect(
    runAzureTerraformLifecycle(
      start,
      {
        open: async () => {
          calls++;
          return {} as TerraformSession;
        },
      },
      { engine: 'native' } as never,
      storage,
      {} as AzExecApi,
      {},
    ),
  ).rejects.toThrow(/owning Terraform engine/);
  expect(calls).toBe(0);
});

test('scopes Terraform authorization per immutable lifecycle plan and safely reads legacy deploy approval', async () => {
  const planSha256 = 'a'.repeat(64);
  const approved = { schemaVersion: 1, engine: 'terraform', planSha256, mutations: true };
  const missing = () => Promise.reject(Object.assign(new Error('missing'), { code: 'ENOENT' }));
  expect(
    await readAzureTerraformAuthorization(
      { read: async (name) => (name === 'terraform-authorization.json' ? approved : missing()) },
      planSha256,
    ),
  ).toEqual({ authorized: true, name: `terraform-authorization-${planSha256}.json` });
  expect(
    await readAzureTerraformAuthorization(
      {
        read: async (name) =>
          name === 'terraform-authorization.json' ? { ...approved, planSha256: 'b'.repeat(64) } : missing(),
      },
      planSha256,
    ),
  ).toEqual({ authorized: false, name: `terraform-authorization-${planSha256}.json` });
  await expect(
    readAzureTerraformAuthorization({ read: async () => ({ ...approved, engine: 'native' }) }, planSha256),
  ).rejects.toThrow(/checkpoint differs/);
});
