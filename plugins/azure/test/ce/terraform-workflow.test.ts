import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import type { AzExecApi } from '../../src/az/exec';
import { compileAzureCePlan } from '../../src/ce/planner';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { runAzureTerraformAdmission } from '../../src/ce/terraform-workflow';
import { intent, observation } from './fixtures';

const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true });
});

test('applies foundation and admission exactly once and resumes from collected Azure identities', async () => {
  const plan = compileAzureCePlan({ ...intent, engine: 'terraform' }, observation);
  const binding = azureUpgradeBinding(plan);
  const vm = plan.actions.find((action) => action.kind === 'vm-create');
  const nic = plan.actions.find((action) => action.kind === 'nic-create');
  if (!vm?.resourceId || !nic?.resourceId) throw new Error('fixture resource identities are missing');
  const vmId = '00000000-0000-4000-8000-000000000003';
  const mac = '00:11:22:33:44:01';
  const subnetId =
    plan.nics[0].subnet.resourceId ?? plan.actions.find((action) => action.kind === 'subnet-create')?.resourceId;
  if (!subnetId) throw new Error('fixture subnet identity is missing');
  const tags = {
    'xcsh-managed-by': 'azure-ce',
    'xcsh-execution-engine': 'terraform',
    'xcsh-deployment-id': plan.deploymentName,
    'xcsh-plan-sha256': plan.planSha256,
  };
  const outputs = {
    ce_instances: {
      '1': {
        id: vm.resourceId,
        vm_id: vmId,
        site_name: plan.siteName,
        hostname: `${plan.deploymentName}-1`,
      },
    },
    ce_interfaces: {
      '1:0': {
        id: nic.resourceId,
        subnet_id: subnetId,
        site_name: plan.siteName,
        node: 1,
        index: 0,
        role: 'slo',
      },
    },
  };
  const live: Record<string, unknown> = {
    [vm.resourceId]: {
      id: vm.resourceId,
      vmId,
      location: plan.region,
      tags,
      provisioningState: 'Succeeded',
      networkProfile: { networkInterfaces: [{ id: nic.resourceId }] },
    },
    [nic.resourceId]: {
      id: nic.resourceId,
      location: plan.region,
      tags,
      provisioningState: 'Succeeded',
      virtualMachine: { id: vm.resourceId },
      macAddress: mac.replaceAll(':', '-'),
      ipConfigurations: [
        {
          primary: true,
          privateIPAddressVersion: 'IPv4',
          privateIPAddress: '10.20.0.4',
          subnet: { id: subnetId },
        },
      ],
    },
  };
  const api: AzExecApi = {
    async exec(_command, args) {
      const value =
        args[0] === 'account'
          ? {
              id: plan.subscription.id,
              tenantId: plan.subscription.tenantId,
              environmentName: plan.subscription.cloud,
              state: 'Enabled',
            }
          : live[args[args.indexOf('--ids') + 1]];
      return { exitCode: 0, stderr: '', stdout: JSON.stringify(value) };
    },
  };
  const path = await mkdtemp(join(tmpdir(), 'azure-tf-workflow-'));
  directories.push(path);
  const storage = await CeDeploymentStore.open(path, binding.owner);
  let applies = 0;
  let revisions = 0;
  let bootstrap = 0;
  let reservations = 0;
  const session = {
    async plan() {
      return { changes: [], configurationSha256: 'c'.repeat(64) };
    },
    async apply() {
      applies++;
    },
    async reviseConfiguration() {
      revisions++;
      return 'd'.repeat(64);
    },
    async readOutputs() {
      return outputs;
    },
  } as unknown as TerraformSession;
  const terraform = {
    open: async () => session,
  } as unknown as CeTerraformService;
  const healthy = {
    status: 'healthy',
    nodes: [{ node: binding.nodes[0], status: 'healthy' }],
  };
  const runtime = {
    engine: 'terraform' as const,
    requireBootstrapContract(provider: string) {
      expect(provider).toBe('azure');
    },
    async reserveSite() {
      reservations++;
    },
    async bootstrap(_binding: unknown, node: string) {
      bootstrap++;
      expect(node).toBe(binding.nodes[0]);
      return '#cloud-config\nwrite_files:\n- path: /etc/vpm/user_data\n  content: fixture-material\n';
    },
    async approveRegistrations() {
      return healthy;
    },
    async observeRegistrations() {
      return healthy;
    },
    async observeRegisteredConfiguration() {
      return { status: 'configured' };
    },
  } as unknown as Pick<
    CeRuntime,
    | 'engine'
    | 'requireBootstrapContract'
    | 'reserveSite'
    | 'bootstrap'
    | 'approveRegistrations'
    | 'observeRegistrations'
    | 'observeRegisteredConfiguration'
  >;
  let revalidations = 0;
  const run = () =>
    runAzureTerraformAdmission(
      plan,
      terraform,
      runtime,
      storage,
      api,
      async () => {
        revalidations++;
      },
      {},
    );
  expect((await run()).status).toBe('registered');
  expect((await run()).status).toBe('registered');
  expect({ applies, revisions, bootstrap, reservations }).toEqual({
    applies: 2,
    revisions: 1,
    bootstrap: 1,
    reservations: 1,
  });
  expect(revalidations).toBe(7);
  const checkpoint = (await storage.read('terraform-workflow.json')) as Record<string, unknown>;
  expect(checkpoint.stage).toBe('registered');
  expect(JSON.stringify(checkpoint)).toContain('/etc/vpm/user_data');
  expect(await storage.read('terraform-registration-observation.json')).toEqual(healthy);
  expect(await storage.read('terraform-registration-configuration.json')).toEqual({ status: 'configured' });
});

test('resumes interrupted three-node Azure HA admission through durable serial boundaries', async () => {
  const selected = structuredClone(intent);
  selected.engine = 'terraform';
  selected.topology.ha = true;
  selected.routing = { mode: 'udr', destinationCidrs: [] };
  selected.nics = ['slo', 'data', 'sli'].map((role, index) => ({
    name: ['mgmt', 'external', 'internal'][index],
    role: role as 'slo' | 'data' | 'sli',
    subnet: {
      mode: 'greenfield',
      name: `nic${index}`,
      cidr: `10.20.${index}.0/24`,
    },
  }));
  const observed = structuredClone(observation);
  observed.regions[0].quotaAvailable = 24;
  const plan = compileAzureCePlan(selected, observed);
  const binding = azureUpgradeBinding(plan);
  const tags = {
    'xcsh-managed-by': 'azure-ce',
    'xcsh-execution-engine': 'terraform',
    'xcsh-deployment-id': plan.deploymentName,
    'xcsh-plan-sha256': plan.planSha256,
  };
  const ce_instances: Record<string, unknown> = {};
  const ce_interfaces: Record<string, unknown> = {};
  const live: Record<string, unknown> = {};
  for (let node = 1; node <= 3; node++) {
    const vm = plan.actions.find((action) => action.kind === 'vm-create' && action.node === node);
    if (!vm?.resourceId) throw new Error('HA fixture VM identity is missing');
    const vmId = `00000000-0000-4000-8000-${String(node).padStart(12, '0')}`;
    const attachments: Array<{ id: string }> = [];
    ce_instances[String(node)] = {
      id: vm.resourceId,
      vm_id: vmId,
      site_name: plan.siteName,
      hostname: `${plan.deploymentName}-${node}`,
    };
    for (const nic of plan.nics) {
      const action = plan.actions.find(
        (item) =>
          item.kind === 'nic-create' &&
          item.node === node &&
          item.args?.[item.args.indexOf('--name') + 1] === `${plan.deploymentName}-${node}-nic${nic.index}`,
      );
      const subnet = plan.actions.find(
        (item) =>
          item.kind === 'subnet-create' &&
          item.args?.includes('--name') &&
          item.args[item.args.indexOf('--name') + 1] === nic.subnet.name,
      );
      if (!action?.resourceId || !subnet?.resourceId) throw new Error('HA fixture NIC identity is missing');
      attachments.push({ id: action.resourceId });
      ce_interfaces[`${node}:${nic.index}`] = {
        id: action.resourceId,
        subnet_id: subnet.resourceId,
        site_name: plan.siteName,
        node,
        index: nic.index,
        role: nic.role,
      };
      live[action.resourceId] = {
        id: action.resourceId,
        location: plan.region,
        tags,
        provisioningState: 'Succeeded',
        virtualMachine: { id: vm.resourceId },
        macAddress: `00-11-22-33-${String(node).padStart(2, '0')}-${String(nic.index).padStart(2, '0')}`,
        ipConfigurations: [
          {
            primary: true,
            privateIPAddressVersion: 'IPv4',
            privateIPAddress: `10.20.${nic.index}.${node + 3}`,
            subnet: { id: subnet.resourceId },
          },
        ],
      };
    }
    live[vm.resourceId] = {
      id: vm.resourceId,
      vmId,
      location: plan.region,
      tags,
      provisioningState: 'Succeeded',
      networkProfile: { networkInterfaces: attachments },
    };
  }
  const api: AzExecApi = {
    async exec(_command, args) {
      const value =
        args[0] === 'account'
          ? {
              id: plan.subscription.id,
              tenantId: plan.subscription.tenantId,
              environmentName: plan.subscription.cloud,
              state: 'Enabled',
            }
          : live[args[args.indexOf('--ids') + 1]];
      return { exitCode: 0, stderr: '', stdout: JSON.stringify(value) };
    },
  };
  const path = await mkdtemp(join(tmpdir(), 'azure-tf-ha-workflow-'));
  directories.push(path);
  const storage = await CeDeploymentStore.open(path, binding.owner);
  let applies = 0;
  let foundationApplied = false;
  let desiredNodes = 0;
  let appliedNodes = 0;
  let interruptAfterNodeOne = true;
  const admittedCounts: number[] = [];
  const session = {
    async plan() {
      return {
        changes: [],
        configurationSha256: 'c'.repeat(64),
        noChanges: foundationApplied && desiredNodes === appliedNodes,
      };
    },
    async apply() {
      applies++;
      foundationApplied = true;
      appliedNodes = desiredNodes;
      if (desiredNodes === 1 && interruptAfterNodeOne) {
        interruptAfterNodeOne = false;
        throw new Error('simulated interruption after Azure VM creation');
      }
    },
    async reviseConfiguration(_expected: string, configuration: string) {
      const parsed = JSON.parse(configuration);
      desiredNodes = Object.keys(parsed.resource.azurerm_linux_virtual_machine ?? {}).length;
      admittedCounts.push(desiredNodes);
    },
    async readOutputs() {
      return { ce_instances, ce_interfaces };
    },
  } as unknown as TerraformSession;
  const bootstrapped: string[] = [];
  const healthy = {
    status: 'healthy',
    nodes: binding.nodes.map((node) => ({ node, status: 'healthy' })),
  };
  const runtime = {
    engine: 'terraform' as const,
    requireBootstrapContract() {},
    async reserveSite() {},
    async bootstrap(_binding: unknown, node: string) {
      bootstrapped.push(node);
      return '#cloud-config\nwrite_files:\n- path: /etc/vpm/user_data\n  content: fixture-material\n';
    },
    async approveRegistrations() {
      return healthy;
    },
    async observeRegistrations() {
      return healthy;
    },
    async observeRegisteredConfiguration() {
      return { status: 'configured' };
    },
  } as unknown as Pick<
    CeRuntime,
    | 'engine'
    | 'requireBootstrapContract'
    | 'reserveSite'
    | 'bootstrap'
    | 'approveRegistrations'
    | 'observeRegistrations'
    | 'observeRegisteredConfiguration'
  >;
  const terraform = {
    open: async () => session,
  } as unknown as CeTerraformService;
  await expect(
    runAzureTerraformAdmission(plan, terraform, runtime, storage, api, async () => {}, {}, undefined, 0),
  ).rejects.toThrow('simulated interruption');
  expect(
    (await runAzureTerraformAdmission(plan, terraform, runtime, storage, api, async () => {}, {}, undefined, 0)).status,
  ).toBe('registered');
  expect({ applies, admittedCounts, bootstrapped }).toEqual({
    applies: 4,
    admittedCounts: [1, 2, 3],
    bootstrapped: ['ce-demo-1', 'ce-demo-2', 'ce-demo-3'],
  });
  const checkpoint = (await storage.read('terraform-workflow.json')) as {
    launchedAtByNode: Record<string, string>;
  };
  expect(Object.keys(checkpoint.launchedAtByNode)).toEqual(['1', '2', '3']);
});

test('rejects unavailable Azure bootstrap before opening Terraform or calling Azure', async () => {
  const plan = compileAzureCePlan({ ...intent, engine: 'terraform' }, observation);
  const binding = azureUpgradeBinding(plan);
  const path = await mkdtemp(join(tmpdir(), 'azure-tf-bootstrap-gate-'));
  directories.push(path);
  const storage = await CeDeploymentStore.open(path, binding.owner);
  let opens = 0;
  let cloudCalls = 0;
  await expect(
    runAzureTerraformAdmission(
      plan,
      {
        open: async () => {
          opens++;
          return {} as TerraformSession;
        },
      },
      {
        engine: 'terraform',
        requireBootstrapContract() {
          throw new Error('Verified azure headless bootstrap capability is unavailable');
        },
      } as never,
      storage,
      {
        exec: async () => {
          cloudCalls++;
          return { exitCode: 0, stdout: '{}', stderr: '' };
        },
      },
      async () => {},
      {},
    ),
  ).rejects.toThrow('unavailable');
  expect({ opens, cloudCalls }).toEqual({ opens: 0, cloudCalls: 0 });
});

test('rejects Route Server admission without an expected route before Terraform, Azure, or bootstrap access', async () => {
  const selected = structuredClone(intent);
  selected.engine = 'terraform';
  selected.routing = {
    mode: 'route-server',
    destinationCidrs: [],
    localAsn: 64512,
  };
  const plan = compileAzureCePlan(selected, observation);
  const binding = azureUpgradeBinding(plan);
  const path = await mkdtemp(join(tmpdir(), 'azure-tf-routing-gate-'));
  directories.push(path);
  const storage = await CeDeploymentStore.open(path, binding.owner);
  let opens = 0;
  let cloudCalls = 0;
  let bootstrapChecks = 0;
  await expect(
    runAzureTerraformAdmission(
      plan,
      {
        open: async () => {
          opens++;
          return {} as TerraformSession;
        },
      },
      {
        engine: 'terraform',
        requireBootstrapContract() {
          bootstrapChecks++;
        },
      } as never,
      storage,
      {
        exec: async () => {
          cloudCalls++;
          return { exitCode: 0, stdout: '{}', stderr: '' };
        },
      },
      async () => {},
      {},
    ),
  ).rejects.toThrow(/expected learned prefix/);
  expect({ opens, cloudCalls, bootstrapChecks }).toEqual({
    opens: 0,
    cloudCalls: 0,
    bootstrapChecks: 0,
  });
});

test('accepts platform ingress and traffic before the final refresh no-change plan', async () => {
  const sourceVmResourceId =
    `/subscriptions/${intent.subscriptionId}/resourceGroups/rg-app/providers/Microsoft.Compute/virtualMachines/probe`.toLowerCase();
  const selected = structuredClone(intent);
  selected.engine = 'terraform';
  selected.routing = { mode: 'udr', destinationCidrs: [] };
  selected.nics = ['slo', 'data', 'sli'].map((role, index) => ({
    name: ['mgmt', 'external', 'internal'][index],
    role: role as 'slo' | 'data' | 'sli',
    subnet: { mode: 'greenfield', name: `nic${index}`, cidr: `10.20.${index}.0/24` },
  }));
  selected.ingress = {
    mode: 'platform-http',
    port: 8080,
    listener: {
      name: 'ce-listener',
      namespace: 'system',
      domain: 'ce.example.invalid',
      privateAddress: '10.20.2.10',
      originPool: { name: 'ce-origin', namespace: 'system' },
    },
    probe: { sourceVmResourceId, path: '/healthz', expectedStatus: 200, expectedBodySha256: '4'.repeat(64) },
  };
  selected.brownfield.resourceIds = [sourceVmResourceId];
  const observed = structuredClone(observation);
  observed.resources = [{ id: sourceVmResourceId, exists: true, owned: false, tags: {}, state: {} }];
  const plan = compileAzureCePlan(selected, observed);
  const binding = azureUpgradeBinding(plan);
  const vm = plan.actions.find((action) => action.kind === 'vm-create');
  if (!vm?.resourceId) throw new Error('fixture VM identity is missing');
  const tags = {
    'xcsh-managed-by': 'azure-ce',
    'xcsh-execution-engine': 'terraform',
    'xcsh-deployment-id': plan.deploymentName,
    'xcsh-plan-sha256': plan.planSha256,
  };
  const ce_interfaces: Record<string, unknown> = {};
  const live: Record<string, unknown> = {};
  const attachments: Array<{ id: string }> = [];
  for (const nic of plan.nics) {
    const action = plan.actions.find(
      (item) => item.kind === 'nic-create' && item.node === 1 && item.resourceId?.endsWith(`-nic${nic.index}`),
    );
    const subnet = plan.actions.find(
      (item) => item.kind === 'subnet-create' && item.resourceId?.endsWith(`/subnets/${nic.subnet.name}`),
    );
    if (!action?.resourceId || !subnet?.resourceId) throw new Error('fixture NIC identity is missing');
    attachments.push({ id: action.resourceId });
    ce_interfaces[`1:${nic.index}`] = {
      id: action.resourceId,
      subnet_id: subnet.resourceId,
      site_name: plan.siteName,
      node: 1,
      index: nic.index,
      role: nic.role,
    };
    live[action.resourceId] = {
      id: action.resourceId,
      location: plan.region,
      tags,
      provisioningState: 'Succeeded',
      virtualMachine: { id: vm.resourceId },
      macAddress: `00-11-22-33-44-0${nic.index}`,
      ipConfigurations: [
        {
          primary: true,
          privateIPAddressVersion: 'IPv4',
          privateIPAddress: `10.20.${nic.index}.4`,
          subnet: { id: subnet.resourceId },
        },
      ],
    };
  }
  live[vm.resourceId] = {
    id: vm.resourceId,
    vmId: '00000000-0000-4000-8000-000000000003',
    location: plan.region,
    tags,
    provisioningState: 'Succeeded',
    networkProfile: { networkInterfaces: attachments },
  };
  const api: AzExecApi = {
    async exec(_command, args) {
      const value =
        args[0] === 'account'
          ? {
              id: plan.subscription.id,
              tenantId: plan.subscription.tenantId,
              environmentName: plan.subscription.cloud,
              state: 'Enabled',
            }
          : live[args[args.indexOf('--ids') + 1]];
      return { exitCode: 0, stderr: '', stdout: JSON.stringify(value) };
    },
  };
  const path = await mkdtemp(join(tmpdir(), 'azure-tf-ingress-order-'));
  directories.push(path);
  const storage = await CeDeploymentStore.open(path, binding.owner);
  await storage.write('terraform-workflow.json', {
    schemaVersion: 1,
    engine: 'terraform',
    planSha256: plan.planSha256,
    configurationSha256: 'a'.repeat(64),
    bootstrapByNode: { '1': '#cloud-config\nwrite_files:\n- path: /etc/vpm/user_data\n  content: fixture-material\n' },
    launchedAtByNode: { '1': '2026-09-10T12:00:00Z' },
    stage: 'registered',
  });
  const events: string[] = [];
  const session = {
    async readOutputs() {
      return {
        ce_instances: {
          '1': {
            id: vm.resourceId,
            vm_id: '00000000-0000-4000-8000-000000000003',
            site_name: plan.siteName,
            hostname: `${plan.deploymentName}-1`,
          },
        },
        ce_interfaces,
      };
    },
    async plan() {
      events.push('final-plan');
      return { noChanges: true, changes: [] };
    },
  } as unknown as TerraformSession;
  const healthy = { status: 'healthy', nodes: [{ node: binding.nodes[0], status: 'healthy' }] };
  const runtime = {
    engine: 'terraform' as const,
    requireBootstrapContract() {},
    async approveRegistrations() {
      return healthy;
    },
    async observeRegistrations() {
      return healthy;
    },
    async observeRegisteredConfiguration() {
      return { status: 'configured' };
    },
  } as never;
  const result = await runAzureTerraformAdmission(
    plan,
    { open: async () => session } as unknown as CeTerraformService,
    runtime,
    storage,
    api,
    async () => {},
    {},
    undefined,
    0,
    async () => {
      events.push('ingress-traffic');
      return { ingress: { listener: 'configured' }, traffic: { status: 'healthy' } };
    },
  );
  expect(result).toMatchObject({ status: 'accepted', traffic: { status: 'healthy' }, terraformNoChanges: true });
  expect(events).toEqual(['ingress-traffic', 'final-plan']);
});
