import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { CeTerraformService } from '../../../terraform/src/service';
import type { AzExecApi } from '../../src/az/exec';
import type { SessionManagerLike } from '../../src/ce/artifacts';
import { savePlanArtifact } from '../../src/ce/artifacts';
import { canonicalSha256 } from '../../src/ce/canonical';
import { executeAzureCeTerraformApply } from '../../src/ce/terraform-apply';
import { azureTerraformCurrentDeployment, renderAzureTerraformFoundation } from '../../src/ce/terraform-foundation';
import { loadAzureTerraformOutcome, saveAzureTerraformOutcome } from '../../src/ce/terraform-outcome';
import { qualifyAzureTerraformReplacementPublicSource } from '../../src/ce/terraform-replacement-public-source';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { historicalFixture } from './terraform-generation-fixture';

for (const ha of [false, true])
  for (const mode of [
    'complete',
    'missing-original-outcome',
    'pending-original',
    'missing-predecessor-outcome',
    'incomplete-predecessor',
    'foreign-outcome',
    'changed-source',
    'malformed-source',
  ] as const)
    test(`public source ${ha ? 'three-node' : 'single'} qualification ${mode}`, async () => {
      const f = historicalFixture(ha);
      const firstSnapshot = f.records.get(`${f.first.plan.planId}-terraform-replacement-source.json`) as {
        source: string;
      };
      const originalVms = JSON.parse(firstSnapshot.source).resource.azurerm_linux_virtual_machine;
      const workflow = {
        schemaVersion: 1,
        engine: 'terraform',
        planSha256: f.base.planSha256,
        stage: 'registered',
        bootstrapByNode: Object.fromEntries(
          f.nodes.map((_, i) => [
            String(i + 1),
            Buffer.from(originalVms[`node_${i + 1}`].custom_data, 'base64').toString('utf8'),
          ]),
        ),
        launchedAtByNode: Object.fromEntries(f.nodes.map((_, i) => [String(i + 1), '2020-01-01T00:00:00Z'])),
      };
      Object.assign(workflow, {
        configurationSha256: createHash('sha256')
          .update(renderAzureTerraformFoundation(f.base, workflow.bootstrapByNode))
          .digest('hex'),
      });
      f.records.set('terraform-workflow.json', workflow);
      const outcomes = new Map<string, Record<string, unknown>>([
        [
          f.base.planSha256,
          {
            planId: f.base.planId,
            planSha256: f.base.planSha256,
            engine: 'terraform',
            status: 'registered',
            configuration: { status: 'configured' },
            registrations: { status: 'healthy' },
          },
        ],
      ]);
      for (const g of [f.first, f.second])
        outcomes.set(g.plan.planSha256, {
          planId: g.plan.planId,
          planSha256: g.plan.planSha256,
          engine: 'terraform',
          status: 'complete',
          configuration: { status: 'configured' },
          health: { status: 'healthy' },
          replacedNode: g.checkpoint.node,
          oldVmId: g.checkpoint.oldVmIds[f.nodes[g.checkpoint.node - 1]],
          newVmId: g.checkpoint.newVmId,
          siteUid: 'site-uid',
          terraformNoChanges: true,
        });
      if (mode === 'missing-original-outcome') outcomes.delete(f.base.planSha256);
      if (mode === 'pending-original')
        (outcomes.get(f.base.planSha256) as Record<string, unknown>).status = 'pending-registration';
      if (mode === 'missing-predecessor-outcome') outcomes.delete(f.second.plan.planSha256);
      if (mode === 'incomplete-predecessor') f.second.checkpoint.phase = 'launched';
      if (mode === 'foreign-outcome')
        (outcomes.get(f.second.plan.planSha256) as Record<string, unknown>).engine = 'native';
      const snapshot = f.records.get(`${f.third.plan.planId}-terraform-replacement-source.json`) as { source: string };
      let source = snapshot.source;
      if (mode === 'changed-source') {
        const json = JSON.parse(source);
        json.resource.azurerm_virtual_network.foreign = { name: 'foreign' };
        source = JSON.stringify(json);
      }
      if (mode === 'malformed-source') source = 'synthetic-secret-marker';
      const run = () =>
        qualifyAzureTerraformReplacementPublicSource(
          f.third.plan,
          source,
          f.third.checkpoint,
          {
            verify: async () => {},
            read: async (name) => {
              if (!f.records.has(name)) throw Error('missing owned record');
              return structuredClone(f.records.get(name));
            },
          },
          async (digest) => {
            const plan = f.sources.get(digest);
            if (!plan) throw Error('missing source');
            return plan;
          },
          async (plan) => {
            const row = outcomes.get(plan.planSha256);
            if (!row) throw Error('missing public outcome');
            return row;
          },
          'f'.repeat(64),
        );
      if (mode === 'complete') await expect(run()).resolves.toBeUndefined();
      else if (mode === 'malformed-source')
        await expect(run()).rejects.toThrow('Azure Terraform retained source is malformed');
      else await expect(run()).rejects.toThrow();
    });

test('public outcomes persist, reload and choose the latest matching result', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'azure-public-outcome-'));
  try {
    const f = historicalFixture(false);
    let sequence = 0;
    const session: SessionManagerLike = {
      getSessionId: () => 'synthetic-outcomes',
      getArtifactsDir: () => dir,
      getArtifactPath: async () => null,
      saveArtifact: async (content, type) => {
        const name = `${String(++sequence).padStart(3, '0')}.${type}.log`;
        await writeFile(join(dir, name), content);
        return name;
      },
    };
    await saveAzureTerraformOutcome(session, {
      planId: f.base.planId,
      planSha256: f.base.planSha256,
      status: 'registered',
    });
    expect((await loadAzureTerraformOutcome(session, f.base)).status).toBe('registered');
    await saveAzureTerraformOutcome(session, {
      planId: f.base.planId,
      planSha256: f.base.planSha256,
      status: 'pending-registration',
    });
    expect((await loadAzureTerraformOutcome(session, f.base)).status).toBe('pending-registration');
    await writeFile(join(dir, '999.azure-ce-terraform-checkpoint.log'), 'malformed');
    await expect(loadAzureTerraformOutcome(session, f.base)).rejects.toThrow(
      'Azure Terraform public outcome is malformed',
    );
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('failed public outcome persistence cannot authorize an in-memory predecessor', async () => {
  const f = historicalFixture(false);
  const session: SessionManagerLike = {
    getSessionId: () => 'synthetic-failed',
    getArtifactsDir: () => null,
    getArtifactPath: async () => null,
    saveArtifact: async () => undefined,
  };
  await expect(
    saveAzureTerraformOutcome(session, { planId: f.base.planId, planSha256: f.base.planSha256, status: 'registered' }),
  ).rejects.toThrow();
  await expect(loadAzureTerraformOutcome(session, f.base)).rejects.toThrow();
});

for (const ha of [false, true])
  for (const mode of ['missing', 'complete', 'quiesced', 'launched'] as const)
    test(`actual public Terraform ${ha ? 'three-node' : 'single'} apply ${mode} through retained generations`, async () => {
      const root = await mkdtemp(join(tmpdir(), 'azure-public-generation-'));
      try {
        const f = historicalFixture(ha),
          plan = f.third.plan;
        const store = await CeDeploymentStore.open(join(root, 'owned'), azureUpgradeBinding(plan).owner);
        const hash = (s: string) => createHash('sha256').update(s).digest('hex');
        const providerLockSha256 = hash((await azureTerraformCurrentDeployment(plan)).providerLock);
        for (const checkpoint of f.checkpoints.values())
          checkpoint.siteConfigurationSha256 = canonicalSha256({ spec: {} });
        for (const [name, record] of f.records) {
          const row = record as Record<string, unknown>;
          if (row.preparedCheckpoint)
            (row.preparedCheckpoint as Record<string, unknown>).siteConfigurationSha256 = canonicalSha256({ spec: {} });
          if (row.providerLockSha256) row.providerLockSha256 = providerLockSha256;
          if (row.receipt) (row.receipt as Record<string, unknown>).providerLockSha256 = providerLockSha256;
          if (!name.startsWith(plan.planId)) await store.write(name, record);
        }
        const first = f.records.get(`${f.first.plan.planId}-terraform-replacement-source.json`) as { source: string };
        const vms = JSON.parse(first.source).resource.azurerm_linux_virtual_machine;
        const originalBootstraps = Object.fromEntries(
          f.nodes.map((_, i) => [
            String(i + 1),
            Buffer.from(vms[`node_${i + 1}`].custom_data, 'base64').toString('utf8'),
          ]),
        );
        await store.write('terraform-workflow.json', {
          schemaVersion: 1,
          engine: 'terraform',
          planSha256: f.base.planSha256,
          stage: 'registered',
          configurationSha256: createHash('sha256')
            .update(renderAzureTerraformFoundation(f.base, originalBootstraps))
            .digest('hex'),
          bootstrapByNode: Object.fromEntries(
            f.nodes.map((_, i) => [
              String(i + 1),
              Buffer.from(vms[`node_${i + 1}`].custom_data, 'base64').toString('utf8'),
            ]),
          ),
          launchedAtByNode: Object.fromEntries(f.nodes.map((_, i) => [String(i + 1), '2020-01-01T00:00:00Z'])),
        });
        await store.write(`terraform-authorization-${plan.planSha256}.json`, {
          schemaVersion: 1,
          engine: 'terraform',
          planSha256: plan.planSha256,
          mutations: true,
        });
        const artifacts = join(root, 'artifacts');
        const { mkdir } = await import('node:fs/promises');
        await mkdir(artifacts);
        let serial = 0,
          bootstraps = 0,
          mutations = 0;
        const session: SessionManagerLike = {
          getSessionId: () => root,
          getArtifactsDir: () => artifacts,
          getArtifactPath: async () => null,
          saveArtifact: async (content, type) => {
            const name = `${String(++serial).padStart(3, '0')}.${type}.log`;
            await writeFile(join(artifacts, name), content);
            return name;
          },
        };
        for (const source of f.sources.values()) await savePlanArtifact(session, source, f.third.observation);
        if (mode !== 'missing') {
          await saveAzureTerraformOutcome(session, {
            planId: f.base.planId,
            planSha256: f.base.planSha256,
            engine: 'terraform',
            status: 'registered',
            configuration: { status: 'configured' },
            registrations: { status: 'healthy' },
          });
          for (const g of [f.first, f.second])
            await saveAzureTerraformOutcome(session, {
              planId: g.plan.planId,
              planSha256: g.plan.planSha256,
              engine: 'terraform',
              status: 'complete',
              configuration: { status: 'configured' },
              health: { status: 'healthy' },
              replacedNode: g.checkpoint.node,
              oldVmId: g.checkpoint.oldVmIds[f.nodes[g.checkpoint.node - 1]],
              newVmId: g.checkpoint.newVmId,
              siteUid: 'site-uid',
              terraformNoChanges: true,
            });
        }
        const current = f.third.checkpoint;
        const selected = `${plan.deploymentName}-${plan.intent.replacementNode}`;
        const vmIds = { ...current.oldVmIds },
          owners = { ...current.ownerPlanSha256ByNode };
        const newVmId = '00000000-0000-4000-8000-000000000103';
        const snapshot = f.records.get(`${plan.planId}-terraform-replacement-source.json`) as {
          source: string;
          bootstrap: string;
        };
        let configuration = snapshot.source,
          applyCount = 0,
          reconcileCount = 0;
        let planned: PlanReceipt | undefined;
        const api: AzExecApi = {
          exec: async (_command, args) => {
            const reply = (value: unknown) => ({ exitCode: 0, stderr: '', stdout: JSON.stringify(value) });
            if (args[0] === 'account')
              return reply({
                id: plan.subscription.id,
                tenantId: plan.subscription.tenantId,
                environmentName: plan.subscription.cloud,
                state: 'Enabled',
              });
            const vmResource = (node: string) =>
              `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${node}`;
            const tags = (owner: string) => ({
              'xcsh-managed-by': 'azure-ce',
              'xcsh-execution-engine': 'terraform',
              'xcsh-deployment-id': plan.deploymentName,
              'xcsh-plan-sha256': owner,
            });
            if (args[0] === 'vm' && args[1] === 'list')
              return reply(
                f.nodes.flatMap((node, i) =>
                  vmIds[node]
                    ? [
                        {
                          id: vmResource(node),
                          name: node,
                          vmId: vmIds[node],
                          location: plan.region,
                          provisioningState: 'Succeeded',
                          powerState: 'VM running',
                          hardwareProfile: { vmSize: plan.vm.size },
                          tags: tags(owners[node]),
                          networkProfile: {
                            networkInterfaces: plan.nics.map((nic) => ({
                              id: current.retainedNics[`${i + 1}:${nic.index}`].resourceId,
                            })),
                          },
                        },
                      ]
                    : [],
                ),
              );
            if (args[0] === 'network' && args[1] === 'nic') {
              const id = args[args.indexOf('--ids') + 1];
              const entry = Object.entries(current.retainedNics).find(([, nic]) => nic.resourceId === id);
              if (!entry) throw Error('unknown test NIC');
              const [key, nic] = entry;
              return reply({
                id,
                location: plan.region,
                provisioningState: 'Succeeded',
                ...(vmIds[f.nodes[Number(key.split(':')[0]) - 1]]
                  ? { virtualMachine: { id: vmResource(f.nodes[Number(key.split(':')[0]) - 1]) } }
                  : {}),
                macAddress: nic.mac,
                tags: tags(nic.ownerPlanSha256),
                ipConfigurations: [
                  {
                    primary: true,
                    privateIPAddress: nic.privateIp,
                    privateIPAddressVersion: 'IPv4',
                    subnet: { id: nic.subnetId },
                  },
                ],
              });
            }
            mutations++;
            throw Error('unexpected cloud mutation');
          },
        };
        const vmResource = (node: string) =>
          `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${node}`;
        const terraform = {
          open: async () => ({
            readConfigurationSha256: async () => hash(configuration),
            readConfiguration: async (expected: string) => {
              expect(expected).toBe(hash(configuration));
              return configuration;
            },
            reviseConfiguration: async (expected: string, next: string) => {
              expect(expected).toBe(hash(configuration));
              configuration = next;
              return hash(next);
            },
            plan: async () => {
              const desired = JSON.parse(configuration).resource.azurerm_linux_virtual_machine;
              const wants = Boolean(desired[`node_${current.node}`]);
              planned = {
                schemaVersion: 1,
                deploymentId: plan.deploymentName,
                engine: 'terraform',
                backendIdentity: `local:${plan.deploymentName}`,
                configurationSha256: hash(configuration),
                providerLockSha256,
                planSha256: hash(configuration + Boolean(vmIds[selected])),
                noChanges: wants === Boolean(vmIds[selected]),
                changes:
                  wants === Boolean(vmIds[selected])
                    ? []
                    : [
                        {
                          address: `azurerm_linux_virtual_machine.node_${current.node}`,
                          type: 'azurerm_linux_virtual_machine',
                          actions: [wants ? 'create' : 'delete'],
                        },
                      ],
              };
              return planned;
            },
            readPlannedResourceIds: async (_receipt: PlanReceipt, addresses: string[]) =>
              Object.fromEntries(addresses.map((address) => [address, vmIds[selected] ? vmResource(selected) : null])),
            apply: async (receipt: PlanReceipt) => {
              expect(planned?.planSha256).toBe(receipt.planSha256);
              applyCount++;
              const desired = JSON.parse(configuration).resource.azurerm_linux_virtual_machine[`node_${current.node}`];
              if (desired) {
                vmIds[selected] = newVmId;
                owners[selected] = desired.tags['xcsh-plan-sha256'];
              } else delete vmIds[selected];
            },
            reconcileApplyFromEvidence: async (_receipt: PlanReceipt, evidence: string) => {
              expect(evidence).toMatch(/^[a-f0-9]{64}$/);
              reconcileCount++;
            },
            readOutputs: async () => ({
              ce_instances: Object.fromEntries(
                f.nodes.flatMap((node, i) =>
                  vmIds[node]
                    ? [
                        [
                          String(i + 1),
                          { id: vmResource(node), vm_id: vmIds[node], site_name: plan.siteName, hostname: node },
                        ],
                      ]
                    : [],
                ),
              ),
              ce_interfaces: Object.fromEntries(
                Object.entries(current.retainedNics).map(([key, nic]) => {
                  const [node, index] = key.split(':').map(Number);
                  return [
                    key,
                    {
                      id: nic.resourceId,
                      subnet_id: nic.subnetId,
                      site_name: plan.siteName,
                      node,
                      index,
                      role: plan.nics.find((nic) => nic.index === index)?.role,
                    },
                  ];
                }),
              ),
            }),
          }),
        } as unknown as CeTerraformService;
        const platform = {
          storage: async () => store,
          runtime: async () => ({
            engine: 'terraform',
            requireBootstrapContract() {},
            requireRoutingContract() {},
            observeOwnedSite: async () => ({ system_metadata: { uid: 'site-uid' }, spec: {} }),
            ownedSiteConfiguration: () => ({ spec: {} }),
            bootstrap: async (
              _binding: unknown,
              node: string,
              tokenName: string,
              saveSecret: (value: unknown) => Promise<void>,
            ) => {
              bootstraps++;
              if (mode === 'missing') throw Error('unexpected bootstrap');
              expect(node).toBe(selected);
              await saveSecret(f.records.get(`${tokenName}.json`));
              return snapshot.bootstrap;
            },
            approveRegistrations: async (_binding: unknown, instances: Record<string, string>) => {
              expect(instances).toEqual(vmIds);
              return { status: 'healthy' };
            },
            observeHealth: async () => ({ status: 'healthy' }),
            observeRegistrations: async () => ({ status: 'healthy' }),
            observeRegisteredConfiguration: async (
              _binding: unknown,
              instances: Record<string, string>,
              interfaces: Array<{ node: string; mac: string }>,
            ) => {
              expect(instances).toEqual(vmIds);
              expect(interfaces).toHaveLength(f.nodes.length * 2);
              return { status: 'configured', interfaces };
            },
          }),
        } as unknown as CePlatformService;
        let activeSession = session;
        const run = () =>
          executeAzureCeTerraformApply(
            { planId: plan.planId, planSha256: plan.planSha256 },
            { cwd: root, hasUI: false, ui: { confirm: async () => false }, sessionManager: activeSession },
            api,
            platform,
            terraform,
            undefined,
            { observe: async () => f.third.observation },
          );
        if (mode === 'missing') {
          await expect(run()).rejects.toThrow(/prior public execution outcome is unavailable/);
          expect(bootstraps).toBe(0);
          expect(applyCount).toBe(0);
        } else {
          if (mode !== 'complete') {
            const write = store.write.bind(store);
            let interrupted = false;
            store.write = async (name, value) => {
              if (
                !interrupted &&
                name === `${plan.planId}-terraform-replacement.json` &&
                (value as Record<string, unknown>).phase === mode
              ) {
                interrupted = true;
                throw Error(`lost ${mode} checkpoint`);
              }
              return write(name, value);
            };
            await expect(run()).rejects.toThrow(`lost ${mode} checkpoint`);
            store.write = write;
            activeSession = { ...session };
            const before = { applyCount, bootstraps, reconcileCount };
            await saveAzureTerraformOutcome(session, {
              planId: f.second.plan.planId,
              planSha256: f.second.plan.planSha256,
              engine: 'terraform',
              status: 'pending-registration',
            });
            await expect(run()).rejects.toThrow();
            expect({ applyCount, bootstraps, reconcileCount }).toEqual(before);
            await saveAzureTerraformOutcome(session, {
              planId: f.second.plan.planId,
              planSha256: f.second.plan.planSha256,
              engine: 'terraform',
              status: 'complete',
              configuration: { status: 'configured' },
              health: { status: 'healthy' },
              replacedNode: f.second.checkpoint.node,
              oldVmId: f.second.checkpoint.oldVmIds[f.nodes[f.second.checkpoint.node - 1]],
              newVmId: f.second.checkpoint.newVmId,
              siteUid: 'site-uid',
              terraformNoChanges: true,
            });
          }
          const result = await run();
          expect(result).toMatchObject({
            status: 'complete',
            oldVmId: current.oldVmIds[selected],
            newVmId,
            siteUid: 'site-uid',
            terraformNoChanges: true,
          });
          expect(applyCount).toBe(2);
          expect(bootstraps).toBe(1);
          expect(reconcileCount).toBe(mode === 'complete' ? 0 : 1);
          expect((await loadAzureTerraformOutcome(session, plan)).status).toBe('complete');
          activeSession = { ...session };
          expect((await run()).status).toBe('complete');
          expect(applyCount).toBe(2);
          expect(bootstraps).toBe(1);
          for (const node of f.nodes.filter((node) => node !== selected)) {
            expect(vmIds[node]).toBe(current.oldVmIds[node]);
            expect(owners[node]).toBe(current.ownerPlanSha256ByNode[node]);
          }
        }
        expect(mutations).toBe(0);
      } finally {
        await rm(root, { recursive: true });
      }
    });
