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
      '1': { id: vm.resourceId, vm_id: vmId, site_name: plan.siteName, hostname: `${plan.deploymentName}-1` },
    },
    ce_interfaces: {
      '1:0': { id: nic.resourceId, subnet_id: subnetId, site_name: plan.siteName, node: 1, index: 0, role: 'slo' },
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
        { primary: true, privateIPAddressVersion: 'IPv4', privateIPAddress: '10.20.0.4', subnet: { id: subnetId } },
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
  const terraform = { open: async () => session } as unknown as CeTerraformService;
  const healthy = { status: 'healthy', nodes: [{ node: binding.nodes[0], status: 'healthy' }] };
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
  expect(revalidations).toBe(4);
  const checkpoint = (await storage.read('terraform-workflow.json')) as Record<string, unknown>;
  expect(checkpoint.stage).toBe('registered');
  expect(JSON.stringify(checkpoint)).toContain('/etc/vpm/user_data');
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
