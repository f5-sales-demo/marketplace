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
import { renderAzureTerraformFoundation } from '../../src/ce/terraform-foundation';
import { runAzureTerraformReplacement } from '../../src/ce/terraform-replacement';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { intent, observation } from './fixtures';

type Json = Record<string, unknown>;
const directories: string[] = [];
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true });
});

async function fixture(lost: 'none' | 'quiesce' | 'launch' = 'none') {
  const deployIntent = structuredClone(intent);
  deployIntent.engine = 'terraform';
  const deploy = compileAzureCePlan(deployIntent, observation);
  const bootstrap = '#cloud-config\nwrite_files:\n- path: /etc/vpm/user_data\n  content: original\n';
  const source = renderAzureTerraformFoundation(deploy, { '1': bootstrap });
  const vmResourceId = `/subscriptions/${deploy.subscription.id}/resourceGroups/${deploy.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${deploy.deploymentName}-1`;
  const replacementObservation = structuredClone(observation);
  replacementObservation.resources = [
    {
      id: vmResourceId,
      location: deploy.region,
      exists: true,
      owned: true,
      state: { provisioningState: 'Succeeded' },
      tags: {
        'xcsh-managed-by': 'azure-ce',
        'xcsh-execution-engine': 'terraform',
        'xcsh-deployment-id': deploy.deploymentName,
        'xcsh-plan-sha256': deploy.planSha256,
      },
    },
  ];
  const replacementIntent = structuredClone(deployIntent);
  replacementIntent.operation = 'replace-node';
  replacementIntent.replacementNode = 1;
  const plan = compileAzureCePlan(replacementIntent, replacementObservation);
  const oldVmId = '00000000-0000-4000-8000-000000000001';
  const newVmId = '00000000-0000-4000-8000-000000000101';
  const state = {
    configuration: source,
    vm: {
      id: vmResourceId,
      name: `${plan.deploymentName}-1`,
      vmId: oldVmId,
      location: plan.region,
      provisioningState: 'Succeeded',
      powerState: 'VM running',
      hardwareProfile: { vmSize: plan.vm.size },
      networkProfile: {
        networkInterfaces: plan.nics.map((nic) => ({
          id: `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Network/networkInterfaces/${plan.deploymentName}-1-nic${nic.index}`,
        })),
      },
      tags: {
        'xcsh-managed-by': 'azure-ce',
        'xcsh-execution-engine': 'terraform',
        'xcsh-deployment-id': plan.deploymentName,
        'xcsh-plan-sha256': deploy.planSha256,
      },
    } as Json | undefined,
    applyCount: 0,
    reconcileCount: 0,
    failed: false,
  };
  const nics = Object.fromEntries(
    plan.nics.map((nic) => {
      const id = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Network/networkInterfaces/${plan.deploymentName}-1-nic${nic.index}`;
      const subnetId = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Network/virtualNetworks/${plan.deploymentName}-vnet/subnets/${nic.subnet.name}`;
      return [
        id,
        {
          id,
          location: plan.region,
          provisioningState: 'Succeeded',
          virtualMachine: { id: vmResourceId },
          macAddress: `00-11-22-33-44-0${nic.index + 1}`,
          ipConfigurations: [
            {
              primary: true,
              privateIPAddress: `10.20.${nic.index}.4`,
              privateIPAddressVersion: 'IPv4',
              subnet: { id: subnetId },
            },
          ],
          tags: {
            'xcsh-managed-by': 'azure-ce',
            'xcsh-execution-engine': 'terraform',
            'xcsh-deployment-id': plan.deploymentName,
            'xcsh-plan-sha256': deploy.planSha256,
          },
        } as Json,
      ];
    }),
  );
  const receipt = (actions: string[]): PlanReceipt => ({
    schemaVersion: 1,
    deploymentId: plan.deploymentName,
    engine: 'terraform',
    backendIdentity: `local:${plan.deploymentName}`,
    configurationSha256: hash(state.configuration),
    providerLockSha256: 'a'.repeat(64),
    planSha256: hash(`${state.configuration}:${actions.join(',')}`),
    changes: actions.length
      ? [{ address: 'azurerm_linux_virtual_machine.node_1', type: 'azurerm_linux_virtual_machine', actions }]
      : [],
    noChanges: actions.length === 0,
  });
  let planned: PlanReceipt | undefined;
  const session: TerraformSession = {
    async readConfigurationSha256() {
      return hash(state.configuration);
    },
    async readConfiguration(expected) {
      if (expected !== hash(state.configuration)) throw new Error('stale source');
      return state.configuration;
    },
    async reviseConfiguration(expected, next) {
      if (expected !== hash(state.configuration)) throw new Error('Terraform configuration revision is stale');
      state.configuration = next;
      return hash(next);
    },
    async plan() {
      const desired = object(object(JSON.parse(state.configuration)).resource).azurerm_linux_virtual_machine as Json;
      const wantsVm = Boolean(desired?.node_1);
      planned = receipt(wantsVm === Boolean(state.vm) ? [] : [wantsVm ? 'create' : 'delete']);
      return planned;
    },
    async readPlannedResourceIds(_receipt, addresses) {
      return Object.fromEntries(addresses.map((address) => [address, state.vm?.id ?? null]));
    },
    async apply(value) {
      if (value.planSha256 !== planned?.planSha256) throw new Error('wrong saved plan');
      state.applyCount++;
      const desired = object(object(JSON.parse(state.configuration)).resource).azurerm_linux_virtual_machine as Json;
      const wantsVm = Boolean(desired?.node_1);
      if (!wantsVm) {
        state.vm = undefined;
        for (const nic of Object.values(nics)) delete object(nic).virtualMachine;
      } else {
        const tags = object(object(desired.node_1).tags);
        state.vm = {
          id: vmResourceId,
          name: `${plan.deploymentName}-1`,
          vmId: newVmId,
          location: plan.region,
          provisioningState: 'Succeeded',
          powerState: 'VM running',
          hardwareProfile: { vmSize: plan.vm.size },
          networkProfile: {
            networkInterfaces: plan.nics.map((nic) => ({
              id: `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Network/networkInterfaces/${plan.deploymentName}-1-nic${nic.index}`,
            })),
          },
          tags,
        };
        for (const nic of Object.values(nics)) object(nic).virtualMachine = { id: vmResourceId };
      }
      const phase = wantsVm ? 'launch' : 'quiesce';
      if (!state.failed && lost === phase) {
        state.failed = true;
        throw new Error(`lost ${phase} response`);
      }
    },
    async reconcileApplyFromEvidence(value, evidenceSha256) {
      if (value.planSha256 !== planned?.planSha256 || !/^[a-f0-9]{64}$/.test(evidenceSha256))
        throw new Error('wrong recovery evidence');
      state.reconcileCount++;
    },
    async readOutputs() {
      return {
        ce_instances: state.vm
          ? {
              '1': {
                id: vmResourceId,
                vm_id: state.vm.vmId,
                site_name: plan.siteName,
                hostname: `${plan.deploymentName}-1`,
              },
            }
          : {},
        ce_interfaces: Object.fromEntries(
          plan.nics.map((nic) => {
            const current =
              nics[
                `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Network/networkInterfaces/${plan.deploymentName}-1-nic${nic.index}`
              ];
            return [
              `1:${nic.index}`,
              {
                id: current.id,
                subnet_id: object((current.ipConfigurations as Json[])[0]).subnet
                  ? object(object((current.ipConfigurations as Json[])[0]).subnet).id
                  : '',
                site_name: plan.siteName,
                node: 1,
                index: nic.index,
                role: nic.role,
              },
            ];
          }),
        ),
      };
    },
    readPlannedResourceFields: async () => ({}),
    planDestroy: async () => {
      throw new Error('unexpected destroy');
    },
    planAction: async () => {
      throw new Error('unexpected action');
    },
  };
  const terraform: CeTerraformService = {
    async open(_owner, deployment: Deployment, resume) {
      expect(deployment.backendIdentity).toBe(`local:${plan.deploymentName}`);
      expect(resume).toBe('current');
      return session;
    },
  };
  const api: AzExecApi = {
    async exec(_command, args) {
      if (args[0] === 'account')
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            id: plan.subscription.id,
            tenantId: plan.subscription.tenantId,
            environmentName: plan.subscription.cloud,
            state: 'Enabled',
          }),
        };
      if (args[0] === 'vm' && args[1] === 'list')
        return { exitCode: 0, stderr: '', stdout: JSON.stringify(state.vm ? [state.vm] : []) };
      if (args[0] === 'network' && args[1] === 'nic') {
        const id = args[args.indexOf('--ids') + 1];
        return { exitCode: 0, stderr: '', stdout: JSON.stringify(nics[id]) };
      }
      throw new Error(`unexpected Azure command: ${args.join(' ')}`);
    },
  };
  const site = {
    metadata: { name: plan.siteName, namespace: 'system' },
    system_metadata: { uid: 'site-uid' },
    spec: { azure: { not_managed: {} } },
  };
  const runtime = {
    engine: 'terraform' as const,
    requireBootstrapContract(provider: string) {
      expect(provider).toBe('azure');
    },
    requireRoutingContract() {},
    async bootstrap(_binding: unknown, node: string) {
      expect(node).toBe(`${plan.deploymentName}-1`);
      return '#cloud-config\nwrite_files:\n- path: /etc/vpm/user_data\n  content: replacement\n';
    },
    async observeOwnedSite() {
      return site;
    },
    ownedSiteConfiguration() {
      return { metadata: site.metadata, spec: site.spec };
    },
    async approveRegistrations(_binding: unknown, instances: Record<string, string>) {
      expect(instances).toEqual({ [`${plan.deploymentName}-1`]: newVmId });
      return { status: 'healthy' };
    },
    async observeHealth() {
      return { status: 'healthy' };
    },
    async observeRegistrations() {
      return { status: 'healthy' };
    },
    async observeRegisteredConfiguration(
      _binding: unknown,
      instances: Record<string, string>,
      interfaces: Array<{ node: string; mac: string }>,
    ) {
      expect(instances[`${plan.deploymentName}-1`]).toBe(newVmId);
      expect(interfaces).toHaveLength(plan.nics.filter((nic) => nic.role === 'slo' || nic.role === 'sli').length);
      return { status: 'configured', interfaces };
    },
  } as unknown as CeRuntime;
  const root = await mkdtemp(join(tmpdir(), 'azure-terraform-replacement-'));
  directories.push(root);
  const storage = await CeDeploymentStore.open(root, azureUpgradeBinding(plan).owner);
  return { plan, terraform, runtime, storage, api, state, oldVmId, newVmId, nics };
}

function object(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('fixture object is malformed');
  return value as Json;
}

for (const lost of ['none', 'quiesce', 'launch'] as const)
  test(`replaces one Terraform Azure VM with retained NIC/site identity (${lost})`, async () => {
    const f = await fixture(lost);
    const result = await runAzureTerraformReplacement(f.plan, f.terraform, f.runtime, f.storage, f.api, {});
    expect(result).toMatchObject({
      status: 'complete',
      oldVmId: f.oldVmId,
      newVmId: f.newVmId,
      siteUid: 'site-uid',
      terraformNoChanges: true,
    });
    expect(f.state.applyCount).toBe(2);
    expect(f.state.reconcileCount).toBe(lost === 'none' ? 0 : 1);
    const applies = f.state.applyCount;
    expect((await runAzureTerraformReplacement(f.plan, f.terraform, f.runtime, f.storage, f.api, {})).newVmId).toBe(
      f.newVmId,
    );
    expect(f.state.applyCount).toBe(applies);
    expect(Object.values(f.nics).every((nic) => object(object(nic).virtualMachine).id === f.state.vm?.id)).toBe(true);
  });

test('rejects a forged replacement checkpoint before another Terraform mutation', async () => {
  const f = await fixture();
  await runAzureTerraformReplacement(f.plan, f.terraform, f.runtime, f.storage, f.api, {});
  await f.storage.write(`${f.plan.planId}-terraform-replacement.json`, {
    ...((await f.storage.read(`${f.plan.planId}-terraform-replacement.json`)) as Json),
    newVmId: f.oldVmId,
  });
  const applies = f.state.applyCount;
  await expect(runAzureTerraformReplacement(f.plan, f.terraform, f.runtime, f.storage, f.api, {})).rejects.toThrow(
    /checkpoint differs/,
  );
  expect(f.state.applyCount).toBe(applies);
});

for (const failedPhase of ['quiesced', 'launched'] as const)
  test(`recovers when the ${failedPhase} checkpoint save is lost after the cloud mutation`, async () => {
    const f = await fixture();
    const write = f.storage.write.bind(f.storage);
    let failed = false;
    f.storage.write = async (name, value) => {
      if (!failed && name === `${f.plan.planId}-terraform-replacement.json` && object(value).phase === failedPhase) {
        failed = true;
        throw new Error(`lost ${failedPhase} checkpoint`);
      }
      return write(name, value);
    };
    await expect(runAzureTerraformReplacement(f.plan, f.terraform, f.runtime, f.storage, f.api, {})).rejects.toThrow(
      `lost ${failedPhase} checkpoint`,
    );
    f.storage.write = write;
    const applies = f.state.applyCount;
    const result = await runAzureTerraformReplacement(f.plan, f.terraform, f.runtime, f.storage, f.api, {});
    expect(result.status).toBe('complete');
    expect(f.state.applyCount).toBe(failedPhase === 'quiesced' ? applies + 1 : applies);
    expect(f.state.reconcileCount).toBeGreaterThan(0);
  });
