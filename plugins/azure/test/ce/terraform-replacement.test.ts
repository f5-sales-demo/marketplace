import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { Deployment, PlanReceipt } from '../../../terraform/src/runner';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import type { AzExecApi } from '../../src/az/exec';
import { compileAzureCePlan } from '../../src/ce/planner';
import { azureTerraformCurrentDeployment, renderAzureTerraformFoundation } from '../../src/ce/terraform-foundation';
import { retireAzureTerraformParentArtifacts } from '../../src/ce/terraform-parent-retirement';
import { runAzureTerraformReplacement } from '../../src/ce/terraform-replacement';
import { isAzureTerraformReplacementHistoricalArtifact } from '../../src/ce/terraform-replacement-artifact-provenance';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { intent, observation } from './fixtures';
import { prepareRelayParentRetirement } from './relay-parent-retirement-fixture';

type Json = Record<string, unknown>;
const directories: string[] = [];
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true });
});

async function fixture(lost: 'none' | 'quiesce' | 'launch' = 'none', twoNics = false) {
  const deployIntent = structuredClone(intent);
  deployIntent.engine = 'terraform';
  if (twoNics)
    deployIntent.nics.push({
      name: 'sli',
      role: 'sli',
      subnet: { mode: 'greenfield', cidr: '10.20.1.0/24', name: 'sli' },
    });
  const deploy = compileAzureCePlan(deployIntent, observation);
  const originalJwt = 'e30.eyJzdWIiOiJvcmlnaW5hbCJ9.c2lnbmF0dXJl';
  const replacementJwt = 'e30.eyJzdWIiOiJyZXBsYWNlbWVudCJ9.c2lnbmF0dXJl';
  const cloudInit = (jwt: string) =>
    `#cloud-config\nwrite_files:\n- path: /etc/vpm/user_data\n  content: |\n    token: ${jwt}\n`;
  const bootstrap = cloudInit(originalJwt);
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
  const providerLockSha256 = hash((await azureTerraformCurrentDeployment(plan)).providerLock);
  const receipt = (actions: string[]): PlanReceipt => ({
    schemaVersion: 1,
    deploymentId: plan.deploymentName,
    engine: 'terraform',
    backendIdentity: `local:${plan.deploymentName}`,
    configurationSha256: hash(state.configuration),
    providerLockSha256,
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
      const id = state.vm?.id;
      if (id !== undefined && typeof id !== 'string') throw Error('Synthetic replacement VM identity malformed');
      return Object.fromEntries(addresses.map((address) => [address, id ?? null]));
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
    readProposedResourceFields: async () => {
      throw Error('Unexpected proposed fields in standard replacement fixture');
    },
    readAppliedResourceFields: async () => {
      throw Error('Unexpected applied fields in standard replacement fixture');
    },
    readPlanApplicationState: async () => {
      throw Error('Unexpected application-state read in standard replacement fixture');
    },
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
    async bootstrap(_binding: unknown, node: string, tokenName: string, saveSecret: (value: unknown) => Promise<void>) {
      expect(node).toBe(`${plan.deploymentName}-1`);
      await saveSecret({ jwt: replacementJwt, tokenName, node, siteName: plan.siteName });
      return cloudInit(replacementJwt);
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
  const tokens = [deploy, plan].map((source) => ({
    node: `${source.deploymentName}-1`,
    name: `${source.deploymentName.slice(0, 40)}-1-${source.planSha256.slice(0, 12)}`,
  }));
  await storage.write(`${tokens[0].name}.json`, {
    jwt: originalJwt,
    tokenName: tokens[0].name,
    node: tokens[0].node,
    siteName: deploy.siteName,
  });
  return { deploy, plan, terraform, runtime, storage, api, state, oldVmId, newVmId, nics, providerLockSha256, tokens };
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
    const replay = await runAzureTerraformReplacement(f.plan, f.terraform, f.runtime, f.storage, f.api, {});
    if (!('newVmId' in replay)) throw Error('Synthetic replacement replay did not return VM identity');
    expect(replay.newVmId).toBe(f.newVmId);
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

for (const mode of [
  'complete',
  'lost-quiesce',
  'lost-launch',
  'missing-source',
  'missing-token',
  'foreign-token',
  'foreign-lock',
  'foreign-nic-owner',
  'foreign-source-graph',
  'foreign-vm-owner',
] as const)
  test(`non-relay Terraform replacement parent provenance ${mode}`, async () => {
    const f = await fixture(mode === 'lost-quiesce' ? 'quiesce' : mode === 'lost-launch' ? 'launch' : 'none');
    await runAzureTerraformReplacement(f.plan, f.terraform, f.runtime, f.storage, f.api, {});
    const records = new Map<string, unknown>();
    for (const name of await readdir(f.storage.directory))
      if (
        isAzureTerraformReplacementHistoricalArtifact(name) ||
        f.tokens.some((token) => `${token.name}.json` === name)
      )
        records.set(name, await f.storage.read(name));
    const retired = await prepareRelayParentRetirement(f.deploy, 'site-uid', records, f.tokens);
    try {
      const sourceName = `${f.plan.planId}-terraform-replacement-source.json`;
      const checkpointName = `${f.plan.planId}-terraform-replacement.json`;
      if (mode === 'missing-source') await retired.store.remove(sourceName);
      if (mode === 'missing-token') await retired.store.remove(`${f.tokens[1].name}.json`);
      if (mode === 'foreign-token') {
        const name = `${f.tokens[1].name}.json`;
        await retired.store.write(name, { ...object(await retired.store.read(name)), jwt: 'e30.e30.Zm9yZWlnbg' });
      }
      if (mode === 'foreign-lock') {
        const name = `${f.plan.planId}-terraform-launch-plan.json`;
        const record = object(await retired.store.read(name));
        object(record.receipt).providerLockSha256 = 'f'.repeat(64);
        await retired.store.write(name, record);
      }
      if (mode === 'foreign-nic-owner') {
        const checkpoint = object(await retired.store.read(checkpointName));
        const snapshot = object(await retired.store.read(sourceName));
        object(object(checkpoint.retainedNics)['1:0']).ownerPlanSha256 = 'f'.repeat(64);
        object(object(object(snapshot.preparedCheckpoint).retainedNics)['1:0']).ownerPlanSha256 = 'f'.repeat(64);
        await retired.store.write(checkpointName, checkpoint);
        await retired.store.write(sourceName, snapshot);
      }
      if (mode === 'foreign-vm-owner') {
        const checkpoint = object(await retired.store.read(checkpointName));
        const snapshot = object(await retired.store.read(sourceName));
        object(checkpoint.ownerPlanSha256ByNode)[`${f.plan.deploymentName}-1`] = f.plan.planSha256;
        object(object(snapshot.preparedCheckpoint).ownerPlanSha256ByNode)[`${f.plan.deploymentName}-1`] =
          f.plan.planSha256;
        await retired.store.write(checkpointName, checkpoint);
        await retired.store.write(sourceName, snapshot);
      }
      if (mode === 'foreign-source-graph') {
        // Rehash every source/stage field so rejection must verify original graph provenance.
        const checkpoint = object(await retired.store.read(checkpointName));
        const snapshot = object(await retired.store.read(sourceName));
        const configuration = object(JSON.parse(String(snapshot.source)));
        object(object(configuration.resource).azurerm_virtual_network).foreign_network = { name: 'foreign' };
        snapshot.source = `${JSON.stringify(configuration, null, 2)}\n`;
        checkpoint.sourceConfigurationSha256 = hash(String(snapshot.source));
        const { azureTerraformReplacementStages } = await import('../../src/ce/terraform-replacement');
        const stages = azureTerraformReplacementStages(
          f.plan,
          String(snapshot.source),
          String(checkpoint.sourceConfigurationSha256),
          String(snapshot.bootstrap),
        );
        checkpoint.quiesceConfigurationSha256 = stages.quiesce.configurationSha256;
        checkpoint.launchConfigurationSha256 = stages.launch.configurationSha256;
        snapshot.preparedCheckpoint = { ...checkpoint, phase: 'prepared' };
        delete object(snapshot.preparedCheckpoint).newVmId;
        for (const phase of ['quiesce', 'launch'] as const) {
          const name = `${f.plan.planId}-terraform-${phase}-plan.json`;
          const record = object(await retired.store.read(name));
          object(record.receipt).configurationSha256 = stages[phase].configurationSha256;
          await retired.store.write(name, record);
        }
        const finalName = `${f.plan.planId}-terraform-replacement-final-plan.json`;
        await retired.store.write(finalName, {
          ...object(await retired.store.read(finalName)),
          configurationSha256: stages.launch.configurationSha256,
        });
        await retired.store.write(checkpointName, checkpoint);
        await retired.store.write(sourceName, snapshot);
      }
      const run = () =>
        retireAzureTerraformParentArtifacts(f.deploy, retired.teardown, retired.evidence, retired.store);
      if (['complete', 'lost-quiesce', 'lost-launch'].includes(mode)) {
        expect((await run()).status).toBe('deployment-artifacts-retired');
        for (const name of records.keys()) expect(await readdir(retired.store.directory)).not.toContain(name);
      } else {
        await expect(run()).rejects.toThrow();
        expect(await readdir(retired.store.directory)).not.toContain('azure-terraform-parent-artifact-retirement.json');
        expect(await readdir(retired.store.directory)).toContain(checkpointName);
      }
    } finally {
      await retired.cleanup();
    }
  });

for (const mode of ['foreign-nic-owner', 'duplicate-mac', 'foreign-config-vm-owner'] as const)
  test(`standard Terraform replacement rejects ${mode} before bootstrap`, async () => {
    const f = await fixture('none', true);
    let bootstraps = 0;
    const bootstrap = f.runtime.bootstrap.bind(f.runtime);
    f.runtime.bootstrap = async (...args) => {
      bootstraps++;
      return bootstrap(...args);
    };
    const nics = Object.values(f.nics);
    if (mode === 'foreign-nic-owner') object(nics[0].tags)['xcsh-plan-sha256'] = 'f'.repeat(64);
    if (mode === 'duplicate-mac') nics[1].macAddress = nics[0].macAddress;
    if (mode === 'foreign-config-vm-owner') {
      const source = object(JSON.parse(f.state.configuration));
      object(object(object(source.resource).azurerm_linux_virtual_machine).node_1).tags = {
        ...object(object(object(object(source.resource).azurerm_linux_virtual_machine).node_1).tags),
        'xcsh-plan-sha256': 'f'.repeat(64),
      };
      f.state.configuration = JSON.stringify(source);
    }
    await expect(runAzureTerraformReplacement(f.plan, f.terraform, f.runtime, f.storage, f.api, {})).rejects.toThrow(
      /retained configuration identity|source VM or output binding/,
    );
    expect(bootstraps).toBe(0);
    expect(f.state.applyCount).toBe(0);
  });
