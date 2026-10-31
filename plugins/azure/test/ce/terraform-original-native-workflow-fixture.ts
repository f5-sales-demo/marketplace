import { expect } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import {
  type IndependentCleanupEvidence,
  encode as nativeEncode,
  hash as nativeHash,
} from '../../../terraform/src/cleanup-verifier-worker';
import { type PlanReceipt, TerraformRunner } from '../../../terraform/src/runner';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import type { AzExecApi } from '../../src/az/exec';
import { canonicalSha256 } from '../../src/ce/canonical';
import { compileAzureCePlan } from '../../src/ce/planner';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { runAzureTerraformAdmission } from '../../src/ce/terraform-workflow';
import { intent, observation } from './fixtures';

type Json = Record<string, unknown>;
const terraformType = (value: unknown): unknown => {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return typeof value;
  if (Array.isArray(value)) return ['tuple', value.map(terraformType)];
  if (value && typeof value === 'object')
    return ['object', Object.fromEntries(Object.entries(value).map(([key, value]) => [key, terraformType(value)]))];
  throw Error('Synthetic output type must be explicit');
};

/** Production workflow + real native journals; provider/cloud state and CE health are synthetic.
 * Resource proposals reflect prior applied configuration, including destructive deletion attempts.
 * No installed execution, cloud acceptance, or HA performance claim.
 */
export async function originalNativeWorkflowFixture(
  ha = false,
  ingress = false,
  selectedNics?: typeof intent.nics,
  selectedQuota?: number,
  retirementReady = false,
  ingressPrivateAddress = '10.20.1.10',
) {
  const selected = structuredClone(intent);
  selected.engine = 'terraform';
  if (ha) {
    selected.topology.ha = true;
    selected.routing = { mode: 'udr', destinationCidrs: [] };
    selected.nics = ['slo', 'sli'].map((role, index) => ({
      name: ['mgmt', 'internal'][index],
      role: role as 'slo' | 'sli',
      subnet: { mode: 'greenfield' as const, name: `nic${index}`, cidr: `10.20.${index}.0/24` },
    }));
  }
  const selectedObservation = structuredClone(observation);
  if (ha) for (const region of selectedObservation.regions) region.quotaAvailable = 24;
  if (ingress) {
    selected.routing = { mode: 'udr', destinationCidrs: [] };
    if (!ha)
      selected.nics = ['slo', 'sli'].map((role, index) => ({
        name: ['mgmt', 'internal'][index],
        role: role as 'slo' | 'sli',
        subnet: { mode: 'greenfield' as const, name: `nic${index}`, cidr: `10.20.${index}.0/24` },
      }));
    const sourceVmResourceId =
      `/subscriptions/${selected.subscriptionId}/resourceGroups/rg-app/providers/Microsoft.Compute/virtualMachines/probe`.toLowerCase();
    selected.ingress = {
      mode: 'platform-http',
      port: 8080,
      listener: {
        name: 'ce-listener',
        namespace: 'system',
        domain: 'ce.example.invalid',
        privateAddress: ingressPrivateAddress,
        originPool: { name: 'ce-origin', namespace: 'system' },
      },
      probe: { sourceVmResourceId, path: '/healthz', expectedStatus: 200, expectedBodySha256: '4'.repeat(64) },
    };
    selected.brownfield.resourceIds = [sourceVmResourceId];
    selectedObservation.resources = [{ id: sourceVmResourceId, exists: true, owned: false, tags: {}, state: {} }];
  }
  if (selectedNics) selected.nics = structuredClone(selectedNics);
  if (selectedQuota !== undefined)
    for (const region of selectedObservation.regions) region.quotaAvailable = selectedQuota;
  const plan = compileAzureCePlan(selected, selectedObservation),
    binding = azureUpgradeBinding(plan),
    directory = await mkdtemp(join(tmpdir(), 'azure-native-original-workflow-')),
    storage = await CeDeploymentStore.open(directory, binding.owner),
    commands: string[] = [];
  let applies = 0,
    revisions = 0,
    bootstrap = 0,
    reservations = 0,
    revalidations = 0,
    planCount = 0,
    version = '',
    runner: TerraformRunner | undefined,
    applied: Json = { resource: {} },
    noChangesSeen = 0,
    deletionAttempts = 0,
    interruptApplyAt: number | undefined;
  let pendingAllocation = false;
  let replayReceipt: PlanReceipt | undefined;
  const saved = new Map<string, { source: Json; raw: Json }>();
  const tags = {
    'xcsh-managed-by': 'azure-ce',
    'xcsh-execution-engine': 'terraform',
    'xcsh-deployment-id': plan.deploymentName,
    'xcsh-plan-sha256': plan.planSha256,
  };
  const instances: Json = {},
    interfaces: Json = {},
    live = new Map<string, { node: number; kind: 'vm' | 'nic'; value: Json }>();
  for (let node = 1; node <= plan.topology.nodeCount; node++) {
    const vm = plan.actions.find((action) => action.kind === 'vm-create' && action.node === node);
    if (!vm?.resourceId) throw Error('Synthetic original VM identity required');
    const vmId = `00000000-0000-4000-8000-${String(node).padStart(12, '0')}`,
      attachments: Array<{ id: string }> = [];
    instances[String(node)] = {
      id: vm.resourceId,
      vm_id: vmId,
      site_name: plan.siteName,
      hostname: `${plan.deploymentName}-${node}`,
    };
    for (const nic of plan.nics) {
      const action = plan.actions.find(
          (action) =>
            action.kind === 'nic-create' && action.node === node && action.resourceId?.endsWith(`-nic${nic.index}`),
        ),
        subnetId =
          nic.subnet.resourceId ??
          plan.actions.find(
            (action) => action.kind === 'subnet-create' && action.resourceId?.endsWith(`/${nic.subnet.name}`),
          )?.resourceId;
      if (!action?.resourceId || !subnetId) throw Error('Synthetic original interface identity required');
      attachments.push({ id: action.resourceId });
      interfaces[`${node}:${nic.index}`] = {
        id: action.resourceId,
        subnet_id: subnetId,
        site_name: plan.siteName,
        node,
        index: nic.index,
        role: nic.role,
      };
      live.set(action.resourceId.toLowerCase(), {
        node,
        kind: 'nic',
        value: {
          id: action.resourceId,
          location: plan.region,
          tags,
          provisioningState: 'Succeeded',
          virtualMachine: { id: vm.resourceId },
          macAddress: `00-11-22-33-${node.toString(16).padStart(2, '0')}-${nic.index.toString(16).padStart(2, '0')}`,
          ipConfigurations: [
            {
              id: `${action.resourceId}/ipConfigurations/primary`,
              name: 'primary',
              provisioningState: 'Succeeded',
              privateIPAllocationMethod: 'Dynamic',
              primary: true,
              privateIPAddressVersion: 'IPv4',
              privateIPAddress: `10.20.${nic.index}.${node + 3}`,
              subnet: { id: subnetId },
            },
          ],
        },
      });
    }
    live.set(vm.resourceId.toLowerCase(), {
      node,
      kind: 'vm',
      value: {
        id: vm.resourceId,
        name: `${plan.deploymentName}-${node}`,
        hardwareProfile: { vmSize: plan.vm.size },
        vmId,
        location: plan.region,
        tags,
        provisioningState: 'Succeeded',
        networkProfile: { networkInterfaces: attachments },
      },
    });
  }
  const present = (node: number) =>
    !!((applied.resource as Json).azurerm_linux_virtual_machine as Json | undefined)?.[`node_${node}`];
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
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify(
            [...live.values()].filter((row) => row.kind === 'vm' && present(row.node)).map((row) => row.value),
          ),
        };
      const row = live.get((args[args.indexOf('--ids') + 1] ?? '').toLowerCase());
      if (!row || (!present(row.node) && !(pendingAllocation && row.node === 1)))
        return { exitCode: 1, stderr: '', stdout: '' };
      return { exitCode: 0, stderr: '', stdout: JSON.stringify(row.value) };
    },
  };
  const createRunner = () =>
    new TerraformRunner(
      storage.directory,
      async (request) => {
        commands.push(request.args[0]);
        let stdout = '{}';
        // Source-fixture receipt reproduction for subsequent network composition only.
        // Original admission above executes and publishes its own genuine native history first.
        if (replayReceipt && ['plan', 'show', 'apply'].includes(request.args[0])) {
          const receipt = replayReceipt;
          const source = await readFile(join(request.cwd, 'main.tf.json'), 'utf8');
          expect(require('node:crypto').createHash('sha256').update(source).digest('hex')).toBe(
            receipt.configurationSha256,
          );
          if (request.args[0] === 'plan') {
            const bytes = Array.from({ length: 500 }, (_, index) => String(index + 1)).find(
              (value) => require('node:crypto').createHash('sha256').update(value).digest('hex') === receipt.planSha256,
            );
            if (!bytes) throw Error('Exact synthetic network saved bytes unavailable');
            await writeFile(join(request.cwd, 'saved.tfplan'), bytes, { mode: 0o600 });
          }
          if (request.args[0] === 'apply') {
            applied = JSON.parse(source);
            applies++;
          }
          const raw = {
            format_version: '1.2',
            terraform_version: version,
            errored: false,
            complete: true,
            applyable: true,
            output_changes: {},
            resource_changes: receipt.changes.map((change) => ({
              ...change,
              mode: 'managed',
              provider_name: change.type.startsWith('azapi_')
                ? 'registry.terraform.io/azure/azapi'
                : 'registry.terraform.io/hashicorp/azurerm',
              change: {
                actions: change.actions,
                before: null,
                after: null,
                before_sensitive: false,
                after_sensitive: false,
                after_unknown: false,
              },
            })),
          };
          return {
            code: 0,
            stdout: request.args[0] === 'show' ? JSON.stringify(raw) : '{}',
            executable: { path: '/synthetic/terraform', sha256: 'a'.repeat(64) },
          };
        }

        if (request.args[0] === 'version') stdout = JSON.stringify({ terraform_version: version });
        if (request.args[0] === 'plan') {
          const configuration = JSON.parse(await readFile(join(request.cwd, 'main.tf.json'), 'utf8')) as Json;
          if (Array.isArray(configuration.import)) {
            const imports = configuration.import as Array<{ to: string; id: string }>;
            expect(imports).toHaveLength(1);
            const entry = imports[0];
            expect(entry.to).toBe('azurerm_linux_virtual_machine.node_1');
            const bytes = String(++planCount);
            saved.set(bytes, {
              source: configuration,
              raw: {
                format_version: '1.2',
                terraform_version: version,
                errored: false,
                complete: true,
                applyable: true,
                output_changes: {},
                resource_changes: [
                  {
                    address: entry.to,
                    type: 'azurerm_linux_virtual_machine',
                    mode: 'managed',
                    provider_name: 'registry.terraform.io/hashicorp/azurerm',
                    change: { actions: ['no-op'], importing: { id: entry.id } },
                  },
                ],
                planned_values: { root_module: {} },
              },
            });
            await writeFile(join(request.cwd, 'saved.tfplan'), bytes, { mode: 0o600 });
            return { code: 0, stdout: '{}', executable: { path: '/synthetic/terraform', sha256: 'a'.repeat(64) } };
          }

          const source = JSON.parse(await readFile(join(request.cwd, 'main.tf.json'), 'utf8')) as Json,
            before = applied.resource as Record<string, Json>,
            after = (request.args.includes('-destroy') ? {} : (source.resource ?? {})) as Record<string, Json>,
            changes: Json[] = [];
          for (const type of new Set([...Object.keys(before), ...Object.keys(after)]))
            for (const name of new Set([...Object.keys(before[type] ?? {}), ...Object.keys(after[type] ?? {})])) {
              const prior = before[type]?.[name] ?? null,
                next = after[type]?.[name] ?? null,
                action =
                  prior === null
                    ? 'create'
                    : next === null
                      ? 'delete'
                      : canonicalSha256(prior) === canonicalSha256(next)
                        ? 'no-op'
                        : 'update';
              changes.push({
                address: `${type}.${name}`,
                type,
                mode: 'managed',
                provider_name: type.startsWith('azapi_')
                  ? 'registry.terraform.io/azure/azapi'
                  : 'registry.terraform.io/hashicorp/azurerm',
                change: {
                  actions: [action],
                  before: prior,
                  after: next,
                  before_sensitive: false,
                  after_sensitive: false,
                  after_unknown: false,
                },
              });
            }
          deletionAttempts += changes.filter((row) =>
            (row.change as { actions: string[] }).actions.includes('delete'),
          ).length;
          const applyable = changes.some((row) => (row.change as { actions: string[] }).actions[0] !== 'no-op');
          if (!applyable) noChangesSeen++;
          const raw = {
              format_version: '1.2',
              terraform_version: version,
              errored: false,
              complete: true,
              applyable,
              output_changes: {},
              resource_changes: changes,
              ...(retirementReady && Object.keys(source.resource ?? {}).length === 0
                ? { planned_values: { outputs: {}, root_module: { resources: [] } } }
                : {}),
            },
            bytes = String(++planCount);
          saved.set(bytes, { source: request.args.includes('-destroy') ? { ...source, resource: {} } : source, raw });
          await writeFile(join(request.cwd, 'saved.tfplan'), bytes, { mode: 0o600 });
        }
        if (retirementReady && request.args[0] === 'show' && request.args.length === 2) {
          const resources = Object.entries((applied.resource ?? {}) as Json).flatMap(([type, rows]) =>
            Object.keys(rows as Json).map((name) => ({
              address: `${type}.${name}`,
              type,
              mode: 'managed',
              values: {
                id:
                  type === 'azurerm_linux_virtual_machine'
                    ? (instances[name.replace('node_', '')] as Json).id
                    : `synthetic:${type}.${name}`,
              },
            })),
          );
          return {
            code: 0,
            stdout: JSON.stringify({
              format_version: '1.2',
              terraform_version: version,
              values: { outputs: {}, root_module: { resources } },
            }),
            executable: { path: '/synthetic/terraform', sha256: 'a'.repeat(64) },
          };
        }
        if (request.args[0] === 'show') {
          const value = saved.get(await readFile(join(request.cwd, 'saved.tfplan'), 'utf8'));
          if (!value) throw Error('Exact synthetic saved proposal required');
          stdout = JSON.stringify(value.raw);
        }
        if (request.args[0] === 'apply') {
          const value = saved.get(await readFile(join(request.cwd, 'saved.tfplan'), 'utf8'));
          if (!value) throw Error('Exact synthetic submitted proposal required');
          applied = structuredClone(value.source);
          applies++;
          if (applies === interruptApplyAt) {
            interruptApplyAt = undefined;
            throw Error('Synthetic provider apply response lost');
          }
        }
        if (request.args[0] === 'output') {
          const outputs = {
            ce_instances: Object.fromEntries(Object.entries(instances).filter(([node]) => present(Number(node)))),
            ce_interfaces: Object.fromEntries(
              Object.entries(interfaces).filter(([key]) => present(Number(key.split(':')[0]))),
            ),
          };
          stdout = JSON.stringify(
            Object.fromEntries(
              Object.entries(outputs).map(([name, value]) => [
                name,
                { sensitive: false, type: terraformType(value), value },
              ]),
            ),
          );
        }
        return { code: 0, stdout, executable: { path: '/synthetic/terraform', sha256: 'a'.repeat(64) } };
      },
      retirementReady
        ? async (request) => {
            // Synthetic independent-provider evidence is a source fixture only. It proves no
            // real sibling process, installed worker, cloud state or live cleanup acceptance.
            return {
              schemaVersion: 1,
              status: 'independently-verified',
              nonce: request.nonce,
              requestSha256: nativeHash(nativeEncode(request)),
              startedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
              executorPid: process.pid + 1,
              parentPid: process.pid,
              manifestSha256: request.manifestSha256,
              evidenceSha256: request.evidenceSha256,
              finalPlanSha256: request.finalPlanSha256,
              planReceiptSha256: request.planReceiptSha256,
              inputInventorySha256: nativeHash(nativeEncode(request.inputs)),
              terraformExecutableSha256: request.terraform.sha256,
              terraformExecutablePathSha256: nativeHash(request.terraform.path),
              interpreterSha256: request.interpreter.sha256,
              workerSha256: request.workerSha256,
              terraformVersion: version,
              stateJsonSha256: 'd'.repeat(64),
              originalPlanJsonSha256: 'e'.repeat(64),
              refreshedPlanSha256: 'f'.repeat(64),
              refreshedPlanJsonSha256: 'a'.repeat(64),
              commands: [
                ['version', '-json'],
                ['show', '-json', 'saved.tfplan'],
                ['show', '-json'],
                [
                  'plan',
                  '-input=false',
                  '-lock=true',
                  '-lock-timeout=60s',
                  '-refresh=true',
                  `-out=independent-cleanup-${request.nonce}.tfplan`,
                ],
                ['show', '-json', `independent-cleanup-${request.nonce}.tfplan`],
              ],
            } satisfies IndependentCleanupEvidence;
          }
        : undefined,
    );
  const terraform = {
    async open(owner, deployment, resume) {
      expect(owner).toEqual(storage.owner);
      await storage.verify();
      version = deployment.terraformVersion;
      if (!runner) {
        runner = createRunner();
        await runner.prepare(deployment);
        const revise = runner.reviseConfiguration.bind(runner);
        runner.reviseConfiguration = async (...args) => {
          revisions++;
          return revise(...args);
        };
      } else if (!resume) await runner.prepare(deployment);
      else await runner.resume(deployment.deploymentId, deployment, resume === 'current' ? 'current' : 'exact');
      return runner as unknown as TerraformSession;
    },
  } satisfies Pick<CeTerraformService, 'open'>;
  const unexpected = () => {
      throw Error('Unexpected operational routing in original registration fixture');
    },
    healthy = { status: 'healthy', nodes: binding.nodes.map((node) => ({ node, status: 'healthy' })) };
  const runtime = {
    engine: 'terraform' as const,
    requireRoutingContract: unexpected,
    requireAzureRelayRoutingContract: unexpected,
    ensureAzureRelayRouting: unexpected,
    observeOwnedSite: unexpected,
    observeAzureInterfaces: unexpected,
    ensureAzureRouting: unexpected,
    observeBgpSessions: unexpected,
    observeBgpRoutes: unexpected,
    requireBootstrapContract(provider: string) {
      expect(provider).toBe('azure');
    },
    async reserveSite() {
      reservations++;
    },
    async bootstrap(_binding: unknown, node: string) {
      bootstrap++;
      expect(binding.nodes).toContain(node);
      return `#cloud-config\nwrite_files:\n- path: /etc/vpm/user_data\n  content: fixture-material-${node}\n`;
    },
    async approveRegistrations() {
      return healthy;
    },
    async observeRegistrations() {
      return healthy;
    },
    async observeRegisteredConfiguration(
      _binding: unknown,
      _instances: unknown,
      observed: Array<{ node: string; role: string }>,
    ) {
      expect(observed.map((value) => `${value.node}/${value.role}`).sort()).toEqual(
        binding.nodes.flatMap((node) => plan.nics.map((nic) => `${node}/${nic.role}`)).sort(),
      );
      return { status: 'configured' };
    },
  } as unknown as Parameters<typeof runAzureTerraformAdmission>[2];
  const run = (acceptIngress?: Parameters<typeof runAzureTerraformAdmission>[9]) =>
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
      undefined,
      0,
      acceptIngress,
    );
  return {
    plan,
    binding,
    storage,
    runtime,
    api,
    terraform,
    run,
    commands,
    get runner() {
      if (!runner) throw Error('Original native runner not initialized');
      return runner;
    },
    archiveReceipt: async (receipt: PlanReceipt, source: string) => {
      if (!runner) throw Error('Original native admission must execute before network receipt reproduction');
      const current = await runner.readConfigurationSha256();
      if (current !== receipt.configurationSha256) await runner.reviseConfiguration(current, source);
      replayReceipt = receipt;
      try {
        const observed = await runner.plan({}, undefined, receipt.refreshOriginSha256);
        expect(observed).toEqual(receipt);
        if (!receipt.noChanges) await runner.apply(observed, {});
      } finally {
        replayReceipt = undefined;
      }
    },
    counts: () => ({ applies, revisions, bootstrap, reservations }),
    revalidations: () => revalidations,
    noChangesSeen: () => noChangesSeen,
    deletionAttempts: () => deletionAttempts,
    interruptNextApply: () => {
      interruptApplyAt = applies + 1;
    },
    simulatePendingAllocation: () => {
      delete ((applied.resource as Json).azurerm_linux_virtual_machine as Json).node_1;
      pendingAllocation = true;
      const row = [...live.values()].find((row) => row.kind === 'vm' && row.node === 1);
      if (!row) throw Error('Owning VM fixture required');
      row.value.provisioningState = 'Failed';
      row.value.tags = { ...tags, 'xcsh-node-index': '1', 'ves-io-site-name': plan.siteName };
      row.value.osProfile = {
        adminUsername: 'fixture',
        linuxConfiguration: {
          ssh: { publicKeys: [{ keyData: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFixture' }] },
        },
      };
    },
    restorePendingAllocationHealth: () => {
      pendingAllocation = false;
      const row = [...live.values()].find((row) => row.kind === 'vm' && row.node === 1);
      if (!row) throw Error('Owning VM fixture required');
      row.value.provisioningState = 'Succeeded';
      row.value.tags = tags;
      delete row.value.osProfile;
    },
    simulateExternalVmLoss: (node: number) => {
      delete ((applied.resource as Json).azurerm_linux_virtual_machine as Json)[`node_${node}`];
    },
    close: () => rm(directory, { recursive: true }),
  };
}
