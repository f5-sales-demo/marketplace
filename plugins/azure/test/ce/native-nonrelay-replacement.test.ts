import { expect, test } from 'bun:test';
import { readdir, rm } from 'node:fs/promises';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { AzExecApi } from '../../src/az/exec';
import { savePlanArtifact } from '../../src/ce/artifacts';
import { persistAzureNativeSource } from '../../src/ce/native-action-evidence';
import { azureNativeReplacementHistoryName } from '../../src/ce/native-replacement-history';
import { requireAzureNativePriorGenerationExecution } from '../../src/ce/native-replacement-source';
import { compileAzureNativeTeardown, runAzureNativeTeardown } from '../../src/ce/native-teardown';
import {
  azureNativeBootstrapForAction,
  collectAzureNativeAdmissionHealth,
  prepareAzureNativeAdmission,
  prepareAzureNativeReplacement,
  recordAzureNativeLaunch,
  validateAzureNativeReplacementState,
} from '../../src/ce/native-workflow';
import { compileAzureCePlan } from '../../src/ce/planner';
import { executeAzureCeNativeApply } from '../../src/tools/azure-ce-apply';
import { observation } from './fixtures';
import { nativeRetirementFixture } from './native-retirement-fixture';

async function generationFixture(ha: boolean) {
  const f = await nativeRetirementFixture(ha);
  const ids = Object.fromEntries(
    f.binding.nodes.map((node, index) => [node, `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`]),
  );
  const owners = Object.fromEntries(f.binding.nodes.map((node) => [node, f.source.planSha256]));
  const tags = (owner: string) => ({
    'xcsh-managed-by': 'azure-ce',
    'xcsh-execution-engine': 'native',
    'xcsh-deployment-id': f.source.deploymentName,
    'xcsh-plan-sha256': owner,
  });
  const vmResource = (node: string) =>
    `/subscriptions/${f.source.subscription.id}/resourceGroups/${f.source.intent.resourceGroup}/providers/Microsoft.Compute/virtualMachines/${node}`;
  const nicState = { corruptOwner: false, duplicate: false, changed: false };
  const api: AzExecApi = {
    async exec(_command, args) {
      const result = (value: unknown) => ({ exitCode: 0, stderr: '', stdout: JSON.stringify(value) });
      if (args[0] === 'vm' && args[1] === 'list')
        return result(
          f.binding.nodes.map((node) => ({
            id: vmResource(node),
            name: node,
            vmId: ids[node],
            location: f.source.region,
            provisioningState: 'Succeeded',
            tags: tags(owners[node]),
          })),
        );
      if (args[0] === 'network' && args[1] === 'routeserver') {
        const id = `/subscriptions/${f.source.subscription.id}/resourceGroups/${f.source.intent.resourceGroup}/providers/Microsoft.Network/virtualHubs/${f.source.deploymentName}-rs`;
        if (args.includes('peering')) {
          const name = args[args.indexOf('--name') + 1];
          return result({
            id: `${id}/bgpConnections/${name}`,
            name,
            provisioningState: 'Succeeded',
            peerAsn: f.source.routing.localAsn,
          });
        }
        return result({
          id,
          location: f.source.region,
          provisioningState: 'Succeeded',
          virtualRouterAsn: 65515,
          tags: tags(f.source.planSha256),
        });
      }
      if (args[0] === 'network' && args[1] === 'nic' && args[2] === 'show') {
        const id = args.includes('--ids')
          ? args[args.indexOf('--ids') + 1]
          : `/subscriptions/${f.source.subscription.id}/resourceGroups/${f.source.intent.resourceGroup}/providers/Microsoft.Network/networkInterfaces/${args[args.indexOf('--name') + 1]}`;
        const match = /-(\d+)-nic(\d+)$/.exec(id);
        if (!match) throw Error('Native generation fixture NIC identity missing');
        const node = Number(match[1]),
          index = Number(match[2]);
        const nic = f.source.nics.find((row) => row.index === index);
        const subnet = f.source.actions.find(
          (row) => row.kind === 'subnet-create' && row.args?.[row.args.indexOf('--name') + 1] === nic?.subnet.name,
        );
        if (!nic || !subnet) throw Error('Native generation fixture subnet missing');
        return result({
          id,
          location: f.source.region,
          provisioningState: 'Succeeded',
          virtualMachine: { id: vmResource(`${f.source.deploymentName}-${node}`) },
          macAddress: `02:00:00:00:00:${(nicState.duplicate ? 1 : node * 2 + index + (nicState.changed ? 20 : 0)).toString(16).padStart(2, '0')}`,
          tags: tags(nicState.corruptOwner ? 'f'.repeat(64) : f.source.planSha256),
          ipConfigurations: [
            {
              privateIPAddressVersion: 'IPv4',
              privateIPAddress: `10.${index === 0 ? 20 : 21}.0.${node + 4}`,
              subnet: { id: subnet.resourceId },
            },
          ],
        });
      }
      throw Error(`Unexpected native generation fixture command ${args.join(' ')}`);
    },
  };
  // Preserve the owning runtime receiver and its enrollment/retirement methods.
  const runtime = f.runtime;
  runtime.observeOwnedSite = async () => ({ system_metadata: { uid: 'site-uid' }, spec: {} });
  runtime.ownedSiteConfiguration = () => ({ spec: {} });
  runtime.approveRegistrations = async () => ({ status: 'healthy' });
  runtime.observeHealth = async () => ({ status: 'healthy' });
  runtime.observeRegistrations = async () => ({ status: 'healthy' });
  runtime.observeRegisteredConfiguration = async (binding, _instances, expected) => ({
    status: 'configured',
    siteUid: 'site-uid',
    configurationSource: `/api/config/namespaces/system/securemesh_site_v2/${binding.siteName}`,
    source: `/api/register/namespaces/system/registrations_by_site/${binding.siteName}`,
    observedAt: new Date().toISOString(),
    owner: binding.owner,
    siteName: binding.siteName,
    evidenceKind: 'registration-hardware-inventory',
    interfaces: expected.map((row) => ({ ...row, device: row.role === 'slo' ? 'eth0' : 'eth1' })),
  });
  const prepare = async (node: number) => {
    const current = structuredClone(observation);
    current.regions[0].quotaAvailable = 24;
    current.resources = f.binding.nodes.map((name) => ({
      id: vmResource(name),
      location: f.source.region,
      exists: true,
      owned: true,
      state: {},
      tags: tags(owners[name]),
    }));
    const plan = compileAzureCePlan({ ...f.source.intent, operation: 'replace-node', replacementNode: node }, current);
    await persistAzureNativeSource(plan, f.storage);
    const checkpoint = await prepareAzureNativeAdmission(plan, runtime, f.storage);
    await prepareAzureNativeReplacement(plan, checkpoint, api, runtime, f.storage);
    return { plan, checkpoint, current };
  };
  const complete = async (node: number, sequence: number) => {
    const g = await prepare(node);
    const action = g.plan.actions.find((row) => row.requiresBootstrap && row.node === node);
    if (!action) throw Error('Native generation fixture bootstrap action missing');
    await azureNativeBootstrapForAction(g.plan, action, g.checkpoint, runtime, f.storage);
    await recordAzureNativeLaunch(g.plan, node, g.checkpoint, f.storage);
    const selected = `${f.source.deploymentName}-${node}`;
    ids[selected] = `00000000-0000-4000-8000-${String(100 + sequence).padStart(12, '0')}`;
    owners[selected] = g.plan.planSha256;
    expect(
      await collectAzureNativeAdmissionHealth(
        g.plan,
        f.source.topology.nodeCount,
        api,
        runtime,
        f.storage,
        undefined,
        g.checkpoint,
      ),
    ).toMatchObject({ status: 'healthy' });
    return g;
  };
  const retire = async (generations: Array<Awaited<ReturnType<typeof prepare>>>, signal?: AbortSignal) => {
    const current = structuredClone(observation);
    current.regions[0].quotaAvailable = 24;
    const group = `/subscriptions/${f.source.subscription.id}/resourceGroups/${f.source.intent.resourceGroup}`;
    current.resources = [
      ...f.binding.nodes.map((node) => ({
        id: vmResource(node),
        location: f.source.region,
        exists: true,
        owned: true,
        state: {},
        tags: tags(owners[node]),
      })),
      { id: group, location: f.source.region, exists: true, owned: true, state: {}, tags: tags(f.source.planSha256) },
    ];
    const cloud = compileAzureCePlan({ ...f.source.intent, operation: 'teardown' }, current);
    let retiring = false;
    try {
      await f.storage.read('azure-native-lifecycle-retirement.json');
      retiring = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (!retiring) await persistAzureNativeSource(cloud, f.storage);
    const tokens = [
      ...f.tokens,
      ...generations
        .filter((g) => Object.keys(g.checkpoint.bootstrapByNode).length)
        .map((g) => ({
          node: `${f.source.deploymentName}-${g.plan.intent.replacementNode}`,
          name: `${g.plan.deploymentName.slice(0, 40)}-${g.plan.intent.replacementNode}-${g.plan.planSha256.slice(0, 12)}`,
        })),
    ];
    const teardown = compileAzureNativeTeardown(f.source, cloud, f.teardown.drain, [
      { ...f.teardown.retirement[0], tokens },
    ]);
    await f.storage.write(`${teardown.planId}.json`, teardown);
    return runAzureNativeTeardown(
      f.source,
      cloud,
      teardown,
      teardown.planSha256,
      runtime,
      f.contract,
      f.storage,
      async () => {
        f.order.push('cloud');
        return { status: 'retired', absence: 'absent' };
      },
      signal,
      f.api,
    );
  };
  return { ...f, ids, owners, nicState, api, runtime, prepare, complete, retire };
}

for (const ha of [false, true])
  test(`non-relay native ${ha ? 'HA' : 'single'} successive replacements retain original NIC owners`, async () => {
    const f = await generationFixture(ha);
    try {
      const first = await f.complete(1, 1);
      const second = await f.complete(ha ? 2 : 1, 2);
      expect(second.checkpoint.replacement?.ownerPlanSha256ByNode[`${f.source.deploymentName}-1`]).toBe(
        first.plan.planSha256,
      );
      expect(second.checkpoint.replacement).toMatchObject({
        originalSourcePlan: { planSha256: f.source.planSha256 },
        status: 'registered',
      });
      expect(Object.values(second.checkpoint.replacement?.retainedNics ?? {})).toHaveLength(
        f.source.topology.nodeCount * 2,
      );
      expect(
        Object.values(second.checkpoint.replacement?.retainedNics ?? {}).every(
          (row) => row.ownerPlanSha256 === f.source.planSha256,
        ),
      ).toBe(true);
      await prepareAzureNativeReplacement(second.plan, second.checkpoint, f.api, f.runtime, f.storage);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });

for (const fault of [
  'missing-source',
  'foreign-source',
  'missing-history',
  'foreign-history',
  'foreign-nic',
  'duplicate-mac',
  'changed-mac',
  'duplicate-uuid',
  'changed-survivor-uuid',
] as const)
  test(`non-relay native generation preparation rejects ${fault} without replacement bootstrap`, async () => {
    const f = await generationFixture(true);
    try {
      const first = await f.complete(1, 1);
      if (fault === 'missing-source') await f.storage.remove(`native-source-${f.source.planSha256}.json`);
      if (fault === 'foreign-source')
        await f.storage.write(`native-source-${f.source.planSha256}.json`, { ...f.source, siteName: 'foreign' });
      if (fault === 'missing-history') await f.storage.remove(`native-admission-${first.plan.planSha256}.json`);
      if (fault === 'foreign-history')
        await f.storage.write(`native-admission-${first.plan.planSha256}.json`, {
          ...first.checkpoint,
          replacement: { ...first.checkpoint.replacement, newVmId: '00000000-0000-4000-8000-000000000999' },
        });
      if (fault === 'foreign-nic') f.nicState.corruptOwner = true;
      if (fault === 'duplicate-mac') f.nicState.duplicate = true;
      if (fault === 'changed-mac') f.nicState.changed = true;
      if (fault === 'duplicate-uuid') f.ids[`${f.source.deploymentName}-3`] = f.ids[`${f.source.deploymentName}-1`];
      if (fault === 'changed-survivor-uuid')
        f.ids[`${f.source.deploymentName}-3`] = '00000000-0000-4000-8000-000000000999';
      await expect(f.prepare(2)).rejects.toThrow();
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });

for (const ha of [false, true])
  for (const partial of [false, true])
    test(`non-relay native ${ha ? 'HA' : 'single'} retires successive ${partial ? 'prepared' : 'registered'} generations`, async () => {
      const f = await generationFixture(ha);
      try {
        const first = await f.complete(1, 1);
        const second = partial ? await f.prepare(ha ? 2 : 1) : await f.complete(ha ? 2 : 1, 2);
        expect(await f.retire([first, second])).toMatchObject({ completeCleanup: true });
        const names = await readdir(f.storage.directory);
        expect(
          names.some(
            (name) =>
              name.startsWith('native-source-') ||
              name.startsWith('native-admission-') ||
              name.startsWith('native-replacement-history-'),
          ),
        ).toBe(false);
        const before = [...f.order];
        expect(await f.retire([first, second])).toMatchObject({ completeCleanup: true });
        expect(f.order).toEqual(before);
      } finally {
        await rm(f.root, { recursive: true, force: true });
      }
    });

for (const fault of [
  'foreign-original',
  'wrong-vm-owner',
  'wrong-predecessor-uuid',
  'missing-predecessor',
  'orphan-history',
] as const)
  test(`non-relay native parent deletion rejects ${fault} before parent inventory publication`, async () => {
    const f = await generationFixture(true);
    try {
      const first = await f.complete(1, 1),
        second = await f.complete(2, 2);
      const write = f.storage.write.bind(f.storage);
      let changed = false;
      f.storage.write = async (name, value) => {
        await write(name, value);
        if (
          !changed &&
          name === 'azure-native-bootstrap-retirement.json' &&
          (value as { phase?: string }).phase === 'retired'
        ) {
          changed = true;
          if (fault === 'missing-predecessor') await f.storage.remove(azureNativeReplacementHistoryName(first.plan));
          else {
            const name = azureNativeReplacementHistoryName(second.plan);
            const record = (await f.storage.read(name)) as {
              sourcePlanSha256: string;
              replacement: NonNullable<typeof second.checkpoint.replacement>;
            };
            if (fault === 'foreign-original')
              record.replacement.originalSourcePlan = { ...f.source, siteName: 'foreign' };
            if (fault === 'wrong-vm-owner')
              record.replacement.ownerPlanSha256ByNode[`${f.source.deploymentName}-3`] = first.plan.planSha256;
            if (fault === 'wrong-predecessor-uuid')
              record.replacement.oldVmIds[`${f.source.deploymentName}-1`] = '00000000-0000-4000-8000-000000000999';
            if (fault === 'orphan-history') record.sourcePlanSha256 = 'f'.repeat(64);
            await write(name, record);
          }
        }
      };
      await expect(f.retire([first, second])).rejects.toThrow();
      expect(changed).toBe(true);
      expect(await f.storage.read(`native-source-${f.source.planSha256}.json`)).toBeDefined();
      await expect(f.storage.read('azure-native-parent-artifact-retirement.json')).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });

test('non-relay native public generation gate rejects missing or pending public execution checkpoints', async () => {
  const f = await generationFixture(true);
  try {
    const first = await f.complete(1, 1),
      next = await f.prepare(2);
    for (const state of [undefined, 'running', 'partial'])
      await expect(
        requireAzureNativePriorGenerationExecution(next.checkpoint, f.storage, async () =>
          state ? { state } : undefined,
        ),
      ).rejects.toThrow('public execution is incomplete');
    await requireAzureNativePriorGenerationExecution(next.checkpoint, f.storage, async (source) => {
      expect([first.plan.planSha256, f.source.planSha256]).toContain(source.planSha256);
      return { state: 'complete' };
    });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('actual public native replacement rejects incomplete predecessor execution before issuing bootstrap', async () => {
  const f = await generationFixture(true);
  const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
  try {
    const prepared = await f.prepare(1);
    let sequence = 0;
    const session = {
      getSessionId: () => f.root,
      getArtifactsDir: () => f.root,
      async saveArtifact(content: string, type: string) {
        const id = String(++sequence).padStart(6, '0');
        await Bun.write(`${f.root}/${id}.${type}.log`, content);
        return id;
      },
      async getArtifactPath() {
        return null;
      },
    };
    await savePlanArtifact(session, prepared.plan, prepared.current);
    process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
    const before = (await readdir(f.storage.directory)).filter(
      (name) => name.startsWith(`${f.source.deploymentName}-`) && name.endsWith('.json'),
    );
    await expect(
      executeAzureCeNativeApply(
        { planId: prepared.plan.planId, planSha256: prepared.plan.planSha256 },
        {
          cwd: f.root,
          hasUI: false,
          ui: {
            async confirm() {
              return false;
            },
          },
          sessionManager: session,
        },
        f.api,
        async () =>
          ({
            async storage() {
              return f.storage;
            },
            async runtime() {
              return f.runtime;
            },
          }) as unknown as CePlatformService,
        undefined,
        {
          async observe() {
            return prepared.current;
          },
        },
      ),
    ).rejects.toThrow('public execution is incomplete');
    expect(
      (await readdir(f.storage.directory)).filter(
        (name) => name.startsWith(`${f.source.deploymentName}-`) && name.endsWith('.json'),
      ),
    ).toEqual(before);
  } finally {
    if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
    else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
    await rm(f.root, { recursive: true, force: true });
  }
});

for (const changed of [false, true])
  test(`native multi-generation parent interruption ${changed ? 'rejects changed history' : 'resumes exact deletion'}`, async () => {
    const f = await generationFixture(true);
    try {
      const first = await f.complete(1, 1),
        second = await f.complete(2, 2);
      const controller = new AbortController();
      const absence = f.runtime.unregisteredAbsence.bind(f.runtime);
      const historyNames = [first, second].map((generation) => azureNativeReplacementHistoryName(generation.plan));
      let seenCompleteHistory = false,
        interrupted = false;
      f.runtime.unregisteredAbsence = async (...args) => {
        const names = await readdir(f.storage.directory);
        const remaining = historyNames.filter((name) => names.includes(name));
        if (remaining.length === 2) seenCompleteHistory = true;
        if (seenCompleteHistory && remaining.length === 1 && !interrupted) {
          interrupted = true;
          controller.abort(new Error('simulated generation artifact deletion interruption'));
        }
        return absence(...args);
      };
      await expect(f.retire([first, second], controller.signal)).rejects.toThrow(
        'simulated generation artifact deletion interruption',
      );
      expect(interrupted).toBe(true);
      f.runtime.unregisteredAbsence = absence;
      const before = [...f.order];
      if (changed) {
        const remaining = (await readdir(f.storage.directory)).filter((name) => historyNames.includes(name));
        expect(remaining).toHaveLength(1);
        const name = remaining[0];
        const record = (await f.storage.read(name)) as Record<string, unknown>;
        await f.storage.write(name, { ...record, kind: 'foreign' });
        await expect(f.retire([first, second])).rejects.toThrow();
      } else expect(await f.retire([first, second])).toMatchObject({ completeCleanup: true });
      expect(f.order).toEqual(before);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });

test('native replacement replay rejects a new VM UUID that belongs to an old survivor', async () => {
  const f = await generationFixture(true);
  try {
    const first = await f.complete(1, 1);
    const replacement = first.checkpoint.replacement;
    if (!replacement) throw Error('Native generation checkpoint missing');
    expect(() =>
      validateAzureNativeReplacementState(first.plan, {
        ...replacement,
        newVmId: replacement.oldVmIds[`${f.source.deploymentName}-2`],
      }),
    ).toThrow();
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
