import { afterEach, expect, test } from 'bun:test';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { AzExecApi } from '../../src/az/exec';
import {
  azureNativeBootstrapForAction,
  collectAzureNativeAdmissionHealth,
  collectAzureNativeVmState,
  prepareAzureNativeAdmission,
  recordAzureNativeLaunch,
  withAzureNativeBootstrapFile,
} from '../../src/ce/native-workflow';
import { compileAzureCePlan } from '../../src/ce/planner';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { intent, observation } from './fixtures';

const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true });
});

const lifecyclePlan = (operation: 'start' | 'stop') => {
  const resourceId = `/subscriptions/${intent.subscriptionId}/resourceGroups/${intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${intent.deploymentName}-1`;
  const ownerPlanSha256 = 'a'.repeat(64);
  const observed = structuredClone(observation);
  observed.resources = [
    {
      id: resourceId,
      location: intent.region,
      exists: true,
      owned: true,
      state: {},
      tags: {
        'xcsh-managed-by': 'azure-ce',
        'xcsh-deployment-id': intent.deploymentName,
        'xcsh-execution-engine': 'native',
        'xcsh-plan-sha256': ownerPlanSha256,
      },
    },
  ];
  return { plan: compileAzureCePlan({ ...intent, operation }, observed), resourceId, ownerPlanSha256 };
};

test('binds native VM power-state evidence to the exact plan, node, and Azure resource', async () => {
  for (const [operation, expectedPowerState, observedPowerState] of [
    ['start', 'running', 'VM running'],
    ['stop', 'deallocated', 'VM deallocated'],
  ] as const) {
    const { plan, resourceId, ownerPlanSha256 } = lifecyclePlan(operation);
    const action = plan.actions.find((candidate) => candidate.kind === 'vm-state-gate');
    if (!action?.node) throw new Error('fixture VM state gate is unavailable');
    const api: AzExecApi = {
      async exec(command, args) {
        expect(command).toBe('az');
        expect(args).toEqual([
          'vm',
          'show',
          '--ids',
          resourceId,
          '--show-details',
          '--subscription',
          plan.subscription.id,
          '--output',
          'json',
        ]);
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            id: resourceId,
            name: `${plan.deploymentName}-${action.node}`,
            location: plan.region,
            provisioningState: 'Succeeded',
            powerState: observedPowerState,
            tags: {
              'xcsh-managed-by': 'azure-ce',
              'xcsh-deployment-id': plan.deploymentName,
              'xcsh-execution-engine': plan.engine,
              'xcsh-plan-sha256': ownerPlanSha256,
            },
          }),
        };
      },
    };
    expect(await collectAzureNativeVmState(plan, action, api)).toMatchObject({
      planId: plan.planId,
      planSha256: plan.planSha256,
      node: action.node,
      resourceId,
      expectedPowerState,
      ownerPlanSha256,
      powerState: expectedPowerState,
      status: 'healthy',
      source: 'azure-cli-live',
    });
  }
});

test('keeps nonconverged VM state degraded and rejects foreign or malformed evidence', async () => {
  const { plan, resourceId, ownerPlanSha256 } = lifecyclePlan('start');
  const action = plan.actions.find((candidate) => candidate.kind === 'vm-state-gate');
  if (!action?.node) throw new Error('fixture VM state gate is unavailable');
  const value = {
    id: resourceId,
    name: `${plan.deploymentName}-${action.node}`,
    location: plan.region,
    provisioningState: 'Succeeded',
    powerState: 'VM starting',
    tags: {
      'xcsh-managed-by': 'azure-ce',
      'xcsh-deployment-id': plan.deploymentName,
      'xcsh-execution-engine': plan.engine,
      'xcsh-plan-sha256': ownerPlanSha256,
    },
  };
  const api = (body: unknown): AzExecApi => ({
    async exec() {
      return { exitCode: 0, stderr: '', stdout: typeof body === 'string' ? body : JSON.stringify(body) };
    },
  });
  expect(await collectAzureNativeVmState(plan, action, api(value))).toMatchObject({
    powerState: 'starting',
    status: 'degraded',
  });
  await expect(
    collectAzureNativeVmState(
      plan,
      action,
      api({ ...value, tags: { ...value.tags, 'xcsh-plan-sha256': '0'.repeat(64) } }),
    ),
  ).rejects.toThrow(/identity or ownership/);
  await expect(collectAzureNativeVmState(plan, action, api('{'))).rejects.toThrow(/Malformed/);
});

test('propagates cancellation before native VM state observation', async () => {
  const { plan } = lifecyclePlan('stop');
  const action = plan.actions.find((candidate) => candidate.kind === 'vm-state-gate');
  if (!action) throw new Error('fixture VM state gate is unavailable');
  const controller = new AbortController();
  controller.abort(new Error('cancelled fixture'));
  let calls = 0;
  await expect(
    collectAzureNativeVmState(
      plan,
      action,
      {
        async exec() {
          calls++;
          return { exitCode: 0, stdout: '{}', stderr: '' };
        },
      },
      controller.signal,
    ),
  ).rejects.toThrow('cancelled fixture');
  expect(calls).toBe(0);
});

test('reconciles reservation, checkpoints bootstrap before launch and reuses it after interruption', async () => {
  const plan = compileAzureCePlan(intent, observation);
  const binding = azureUpgradeBinding(plan);
  const root = await mkdtemp(join(tmpdir(), 'azure-native-workflow-'));
  directories.push(root);
  const storage = await CeDeploymentStore.open(root, binding.owner);
  let reservations = 0;
  let bootstraps = 0;
  const runtime = {
    engine: 'native' as const,
    requireBootstrapContract(provider: string) {
      expect(provider).toBe('azure');
    },
    async reserveSite(actual: unknown) {
      expect(actual).toEqual(binding);
      reservations++;
    },
    async bootstrap(_binding: unknown, node: string, _token: string, persist: (value: unknown) => Promise<void>) {
      bootstraps++;
      await persist({ node, jwt: 'restricted-fixture' });
      return '#cloud-config\nwrite_files:\n- path: /etc/vpm/user_data\n  content: fixture-material\n';
    },
  };
  const checkpoint = await prepareAzureNativeAdmission(plan, runtime, storage);
  const action = plan.actions.find((candidate) => candidate.kind === 'vm-create');
  if (!action) throw new Error('fixture VM action is unavailable');
  const first = await azureNativeBootstrapForAction(plan, action, checkpoint, runtime, storage, undefined, 0);
  await recordAzureNativeLaunch(plan, 1, checkpoint, storage);
  const resumed = await prepareAzureNativeAdmission(plan, runtime, storage);
  const second = await azureNativeBootstrapForAction(plan, action, resumed, runtime, storage, undefined, 0);
  expect(second).toBe(first);
  expect(bootstraps).toBe(1);
  expect(reservations).toBe(2);

  let temporaryPath = '';
  await withAzureNativeBootstrapFile(first, async (path) => {
    temporaryPath = path;
    await access(path);
  });
  await expect(access(temporaryPath)).rejects.toThrow();
});

test('rejects replacement before any platform or cloud mutation', async () => {
  const plan = compileAzureCePlan({ ...intent, operation: 'replace-node', replacementNode: 1 }, observation);
  const root = await mkdtemp(join(tmpdir(), 'azure-native-replacement-'));
  directories.push(root);
  const storage = await CeDeploymentStore.open(root, azureUpgradeBinding(plan).owner);
  let calls = 0;
  await expect(
    prepareAzureNativeAdmission(
      plan,
      {
        engine: 'native',
        requireBootstrapContract() {
          calls++;
        },
        async reserveSite() {
          calls++;
        },
      },
      storage,
    ),
  ).rejects.toThrow(/coupled VM and site replacement/);
  expect(calls).toBe(0);
});

test('approves and observes cumulative HA registrations against Azure VM UUIDs', async () => {
  const haObservation = structuredClone(observation);
  for (const region of haObservation.regions) region.quotaAvailable = 100;
  const plan = compileAzureCePlan(
    { ...intent, topology: { ha: true }, vm: { ...intent.vm, zones: [] } },
    haObservation,
  );
  const root = await mkdtemp(join(tmpdir(), 'azure-native-health-'));
  directories.push(root);
  const storage = await CeDeploymentStore.open(root, azureUpgradeBinding(plan).owner);
  const ids = [
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
  ];
  const tags = {
    'xcsh-managed-by': 'azure-ce',
    'xcsh-deployment-id': plan.deploymentName,
    'xcsh-execution-engine': 'native',
    'xcsh-plan-sha256': plan.planSha256,
  };
  const vms = ids.map((vmId, index) => ({
    id: `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${plan.deploymentName}-${index + 1}`,
    name: `${plan.deploymentName}-${index + 1}`,
    location: plan.region,
    vmId,
    tags,
  }));
  const api: AzExecApi = {
    async exec(_command, args) {
      if (args[0] === 'network') {
        const name = args[args.indexOf('--name') + 1];
        const match = new RegExp(`^${plan.deploymentName}-(\\d+)-nic(\\d+)$`).exec(name);
        if (!match) throw new Error('unexpected NIC lookup');
        const node = Number(match[1]);
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            id: `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Network/networkInterfaces/${name}`,
            macAddress: `00-11-22-33-${String(node).padStart(2, '0')}-${String(Number(match[2]) + 1).padStart(2, '0')}`,
            provisioningState: 'Succeeded',
            virtualMachine: { id: vms[node - 1].id },
            tags,
          }),
        };
      }
      return { exitCode: 0, stderr: '', stdout: JSON.stringify(vms) };
    },
  };
  const expectedNodes = [`${plan.deploymentName}-1`, `${plan.deploymentName}-2`, `${plan.deploymentName}-3`];
  const runtime = {
    async approveRegistrations(
      binding: unknown,
      instances: Record<string, string>,
      _persist: unknown,
      _signal: unknown,
      admittedNodes: string[],
    ) {
      expect(binding).toMatchObject({ nodes: expectedNodes });
      const admitted = expectedNodes.slice(0, Object.keys(instances).length);
      expect(instances).toEqual(Object.fromEntries(admitted.map((node, index) => [node, ids[index]])));
      expect(admittedNodes).toEqual(admitted);
      return { status: 'healthy' };
    },
    async observeHealth() {
      return { status: 'healthy' };
    },
    async observeRegistrations(_binding: unknown, _instances: unknown, _signal: unknown, admittedNodes: string[]) {
      expect(admittedNodes).toEqual(expectedNodes.slice(0, admittedNodes.length));
      return { status: 'healthy' };
    },
    async observeRegisteredConfiguration(
      _binding: unknown,
      _instances: unknown,
      interfaces: Array<{ node: string; role: string; mac: string }>,
    ) {
      expect(interfaces.length).toBe(
        plan.topology.nodeCount * plan.nics.filter((nic) => nic.role === 'slo' || nic.role === 'sli').length,
      );
      expect(interfaces.every((item) => expectedNodes.includes(item.node))).toBe(true);
      return { status: 'configured' };
    },
  } as unknown as Pick<
    CeRuntime,
    'approveRegistrations' | 'observeHealth' | 'observeRegistrations' | 'observeRegisteredConfiguration'
  >;
  expect(await collectAzureNativeAdmissionHealth(plan, 2, api, runtime, storage)).toMatchObject({
    status: 'healthy',
    nodeHealth: 'unknown',
    bgp: 'unknown',
    routes: 'unknown',
    traffic: 'unknown',
  });
  expect(await collectAzureNativeAdmissionHealth(plan, 3, api, runtime, storage)).toMatchObject({
    status: 'healthy',
    configuration: { status: 'configured' },
  });
});
