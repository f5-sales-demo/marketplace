import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { TerraformSession } from '../../../terraform/src/service';
import type { AzExecApi } from '../../src/az/exec';
import { compileAzureCePlan } from '../../src/ce/planner';
import { reconcileAzurePendingVm } from '../../src/ce/terraform-pending-import';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { intent, observation } from './fixtures';

const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true });
});
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
for (const fault of [
  'none',
  'foreign-owner',
  'changed-vm',
  'wrong-nic',
  'healthy',
  'mutating-plan',
  'after-import',
  'after-restore',
] as const) {
  test(`failed Azure VM exact no-op import ${fault}`, async () => {
    const base = compileAzureCePlan({ ...intent, engine: 'terraform' }, observation);
    const binding = azureUpgradeBinding(base),
      root = await mkdtemp(join(tmpdir(), 'azure-orphan-test-'));
    dirs.push(root);
    const storage = await CeDeploymentStore.open(root, binding.owner);
    const group = `/subscriptions/${base.subscription.id}/resourceGroups/${base.intent.resourceGroup}`;
    const id = `${group}/providers/Microsoft.Compute/virtualMachines/${base.deploymentName}-1`;
    const tags = {
      'xcsh-managed-by': 'azure-ce',
      'xcsh-execution-engine': 'terraform',
      'xcsh-deployment-id': base.deploymentName,
      'xcsh-plan-sha256': base.planSha256,
      'xcsh-node-index': '1',
      'ves-io-site-name': base.siteName,
    };
    const vm = {
      id,
      name: `${base.deploymentName}-1`,
      location: base.region,
      vmId: 'vm-uid',
      provisioningState: 'Failed',
      tags,
      hardwareProfile: { vmSize: base.vm.size },
      networkProfile: {
        networkInterfaces: base.nics.map((n) => ({
          id: `${group}/providers/Microsoft.Network/networkInterfaces/${base.deploymentName}-1-nic${n.index}`,
        })),
      },
      osProfile: {
        adminUsername: 'azureuser',
        linuxConfiguration: { ssh: { publicKeys: [{ keyData: 'ssh-rsa fixture' }] } },
      },
    };
    if (fault === 'foreign-owner') vm.tags['xcsh-plan-sha256'] = 'foreign';
    if (fault === 'wrong-nic') vm.networkProfile.networkInterfaces[0].id = 'foreign';
    if (fault === 'healthy') vm.provisioningState = 'Succeeded';
    let vmReads = 0;
    const api: AzExecApi = {
      async exec(_cmd, args) {
        let value: unknown;
        if (args[0] === 'account')
          value = {
            id: base.subscription.id,
            tenantId: base.subscription.tenantId,
            environmentName: base.subscription.cloud,
            state: 'Enabled',
          };
        else if (args[0] === 'group') value = args[1] === 'exists' ? true : { id: group, location: base.region, tags };
        else {
          vmReads++;
          value = { ...vm, vmId: fault === 'changed-vm' && vmReads > 1 ? 'foreign' : vm.vmId };
        }
        return { exitCode: 0, stderr: '', stdout: JSON.stringify(value) };
      },
    };
    const original = JSON.stringify({
      terraform: {},
      provider: {},
      resource: {
        azurerm_linux_virtual_machine: { node_1: { admin_ssh_key: [{ public_key: 'reference' }] } },
        tls_private_key: { node_1: {} },
      },
      output: { key: { value: 'reference' } },
    });
    let config = original,
      imported = false,
      applied = 0,
      interrupted = false;
    const session = {
      async readOutputs() {
        return {};
      },
      async readResourceIdentities() {
        return imported
          ? [{ address: 'azurerm_linux_virtual_machine.node_1', type: 'azurerm_linux_virtual_machine', id }]
          : [];
      },
      async readConfigurationSha256() {
        return hash(config);
      },
      async readConfiguration(sha: string) {
        expect(sha).toBe(hash(config));
        return config;
      },
      async reviseConfiguration(sha: string, next: string) {
        expect(sha).toBe(hash(config));
        config = next;
        if (fault === 'after-restore' && next === original && !interrupted) {
          interrupted = true;
          throw Error('interrupted restore');
        }
        return hash(next);
      },
      async planImports(imports: unknown) {
        expect(JSON.parse(config).import).toEqual([{ to: 'azurerm_linux_virtual_machine.node_1', id }]);
        return {
          schemaVersion: 1,
          engine: 'terraform',
          deploymentId: base.deploymentName,
          backendIdentity: `local:${base.deploymentName}`,
          configurationSha256: hash(config),
          providerLockSha256: 'a'.repeat(64),
          planSha256: 'b'.repeat(64),
          noChanges: false,
          imports,
          changes: [
            {
              address: 'azurerm_linux_virtual_machine.node_1',
              type: 'azurerm_linux_virtual_machine',
              actions: [fault === 'mutating-plan' ? 'update' : 'no-op'],
            },
          ],
        };
      },
      async readPlanApplicationState() {
        return imported ? 'applied' : 'planned';
      },
      async apply() {
        applied++;
        imported = true;
        if (fault === 'after-import' && !interrupted) {
          interrupted = true;
          throw Error('interrupted import');
        }
      },
      async reconcileApplyFromEvidence() {},
    } as unknown as TerraformSession;
    const run = () => reconcileAzurePendingVm(base, session, storage, api, {});
    if (['foreign-owner', 'changed-vm', 'wrong-nic', 'healthy', 'mutating-plan'].includes(fault)) {
      await expect(run()).rejects.toThrow();
      expect(applied).toBe(0);
      return;
    }
    if (fault !== 'none') await expect(run()).rejects.toThrow('interrupted');
    await run();
    expect(imported).toBe(true);
    expect(config).toBe(original);
    expect(applied).toBe(1);
    await run();
    expect(applied).toBe(1);
  });
}
