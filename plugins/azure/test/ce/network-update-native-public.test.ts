import { expect, test } from 'bun:test';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { AzExecApi } from '../../src/az/exec';
import type { PluginInterface } from '../../src/az/types';
import {
  loadCheckpoint,
  type SessionManagerLike,
  saveCheckpoint,
  saveDiscoveryArtifact,
  savePlanArtifact,
} from '../../src/ce/artifacts';
import { canonicalSha256 } from '../../src/ce/canonical';
import { persistAzureNativeActionEvidence, persistAzureNativeSource } from '../../src/ce/native-action-evidence';
import { type AzureNativeNetworkHistory, azureNativeNetworkHistoryName } from '../../src/ce/native-network-history';
import { compileAzureNativeNetworkUpdatePlan } from '../../src/ce/native-network-plan';
import {
  azureNativeBootstrapForAction,
  collectAzureNativeAdmissionHealth,
  prepareAzureNativeAdmission,
  prepareAzureNativeReplacement,
  recordAzureNativeLaunch,
} from '../../src/ce/native-workflow';
import { compileAzureCePlan } from '../../src/ce/planner';
import { fingerprintCheckpointObservation } from '../../src/ce/recovery';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { AZURE_CE_CHECKPOINT_SCHEMA_VERSION } from '../../src/ce/types';
import { executeAzureCeNativeApply } from '../../src/tools/azure-ce-apply';
import { createAzureCePlanTool } from '../../src/tools/azure-ce-plan';
import { networkUpdateFixture } from './network-update-fixture';

async function storeSnapshot(store: CeDeploymentStore) {
  return Promise.all(
    (await readdir(store.directory))
      .toSorted()
      .map(async (name) => ({ name, bytes: (await readFile(join(store.directory, name))).toString('base64') })),
  );
}

async function publicFixture(ha: boolean) {
  const f = networkUpdateFixture(ha, 'native', true, false);
  f.plan = compileAzureNativeNetworkUpdatePlan(f.plan, f.original);
  const root = await mkdtemp(join(tmpdir(), 'ce-network-public-'));
  const store = await CeDeploymentStore.open(join(root, 'storage'), azureUpgradeBinding(f.plan).owner);
  let sequence = 0,
    loseCheckpointAfterAction: string | undefined,
    losePendingAction: string | undefined;
  const session = (): SessionManagerLike => ({
    getSessionId: () => root,
    getArtifactsDir: () => root,
    getArtifactPath: async (id) => {
      const { readdir } = await import('node:fs/promises');
      const matches = (await readdir(root)).filter((name) => name.startsWith(`${id.padStart(6, '0')}.`));
      return matches.length === 1 ? join(root, matches[0]) : null;
    },
    async saveArtifact(content, type) {
      if (type === 'azure-ce-checkpoint' && losePendingAction) {
        const { checkpoint } = JSON.parse(content);
        if (checkpoint.pendingAction?.actionId === losePendingAction) {
          losePendingAction = undefined;
          throw Error('synthetic lost pending checkpoint write');
        }
      }
      if (type === 'azure-ce-checkpoint' && loseCheckpointAfterAction) {
        const { checkpoint } = JSON.parse(content);
        if (!checkpoint.pendingAction && checkpoint.completedActionIds.includes(loseCheckpointAfterAction)) {
          loseCheckpointAfterAction = undefined;
          throw Error('synthetic lost completed checkpoint write');
        }
      }
      const file = `${String(++sequence).padStart(6, '0')}.${type}.log`;
      await writeFile(join(root, file), content);
      return String(sequence);
    },
  });
  const events: string[] = [];
  const powers = new Map(f.nodes.map((node) => [node, 'running']));
  const birthVms = new Map(f.vms.map((vm) => [vm.name, structuredClone(vm)]));
  let vmGeneration = 200;
  const result = (value: unknown) => ({ exitCode: 0, stderr: '', stdout: JSON.stringify(value) });
  const api: AzExecApi = {
    async exec(command, args, options) {
      if (args[0] === 'vm' && args[1] === 'show') {
        const row = args.includes('--ids')
          ? f.vms.find((vm) => vm.id === args[args.indexOf('--ids') + 1])
          : f.vms.find((vm) => vm.name === args[args.indexOf('--name') + 1]);
        if (!row)
          return {
            exitCode: 1,
            stdout: '',
            stderr: JSON.stringify({
              error: { code: 'ResourceNotFound', message: 'The Resource could not be found.' },
            }),
          };
        return result({ ...row, powerState: `VM ${powers.get(row.name)}` });
      }
      if (args[0] === 'resource' && args[1] === 'show') {
        const id = args[args.indexOf('--ids') + 1],
          nic = f.nics.get(id);
        if (nic)
          return result({
            ...nic,
            properties: {
              provisioningState: 'Succeeded',
              ipConfigurations: (nic.ipConfigurations as Record<string, unknown>[]).map((config) => ({
                id: config.id,
                name: config.name,
                properties: { ...config },
              })),
            },
          });
        const vm = f.vms.find((row) => row.id === id);
        if (!vm && [...birthVms.values()].some((row) => row.id === id))
          return {
            exitCode: 1,
            stdout: '',
            stderr: JSON.stringify({
              error: { code: 'ResourceNotFound', message: 'The Resource could not be found.' },
            }),
          };
        if (!vm) throw Error('missing simulated resource');
        return result(vm);
      }
      if (args[0] === 'vm' && ['delete', 'create'].includes(args[1])) {
        const name = args[args.indexOf('--name') + 1],
          template = birthVms.get(name);
        if (!template) throw Error('missing synthetic VM birth template');
        const index = f.vms.findIndex((vm) => vm.name === name);
        if (args[1] === 'delete') {
          if (index < 0) throw Error('duplicate synthetic VM delete');
          f.vms.splice(index, 1);
          const resource = f.current.resources.findIndex((row) => row.id === template.id);
          if (resource < 0) throw Error('missing synthetic VM discovery resource');
          f.current.resources.splice(resource, 1);
          for (const nic of f.nics.values()) if (String(nic.id).includes(`/${name}-nic`)) nic.virtualMachine = null;
        } else {
          if (index >= 0) throw Error('duplicate synthetic VM create');
          expect(args.includes('__BOOTSTRAP_FILE__')).toBe(false);
          expect(await Bun.file(args[args.indexOf('--custom-data') + 1]).text()).toContain(
            'synthetic.payload.signature',
          );
          const vm = structuredClone(template);
          vm.vmId = `00000000-0000-4000-8000-${String(++vmGeneration).padStart(12, '0')}`;
          vm.tags['xcsh-plan-sha256'] = f.plan.planSha256;
          Object.assign(vm, {
            storageProfile: {
              imageReference: {
                publisher: f.plan.image.publisher,
                offer: f.plan.image.offer,
                sku: f.plan.image.plan,
                version: f.plan.image.version,
              },
            },
            plan: { publisher: f.plan.image.publisher, product: f.plan.image.offer, name: f.plan.image.plan },
          });
          f.vms.push(vm);
          f.current.resources.push({
            id: vm.id,
            exists: true,
            owned: true,
            location: f.original.region,
            tags: structuredClone(vm.tags),
            state: { provisioningState: 'Succeeded' },
          });
          for (const nic of f.nics.values())
            if (String(nic.id).includes(`/${name}-nic`)) nic.virtualMachine = { id: vm.id };
        }
        events.push(`mutation:${args[1]}:${name}`);
        return result({});
      }
      if (args[0] === 'vm' && ['deallocate', 'start'].includes(args[1])) {
        const node = args[args.indexOf('--name') + 1];
        if (args[1] === 'deallocate')
          expect(
            [...powers.entries()].filter(([name]) => name !== node).every(([, power]) => power === 'running'),
          ).toBe(true);
        events.push(`${args[1]}:${node}`);
        powers.set(node, args[1] === 'start' ? 'running' : 'deallocated');
        return result({});
      }
      if (args.slice(0, 4).join(' ') === 'network nic ip-config update') {
        const name = args[args.indexOf('--nic-name') + 1],
          nic = [...f.nics.values()].find((row) => String(row.id).endsWith(`/${name}`));
        if (!nic) throw Error('missing simulated NIC');
        const config = f.config(nic),
          node = name.replace(/-nic\d+$/, '');
        expect(powers.get(node)).toBe('deallocated');
        if (typeof config.name !== 'string') throw Error('missing simulated IP configuration name');
        expect(args[args.indexOf('--name') + 1]).toBe(config.name);
        expect(args.some((arg) => /^__.*__$/.test(arg))).toBe(false);
        const target = args[args.indexOf('--subnet') + 1];
        config.subnet = { id: target };
        const subnet = f.subnets.get(target);
        if (!subnet || typeof subnet.addressPrefix !== 'string') throw Error('missing simulated target subnet');
        config.privateIPAddress = `${subnet.addressPrefix.split('/')[0].split('.').slice(0, 3).join('.')}.${f.nodes.indexOf(node) + 5}`;
        events.push(`nic:${name}`);
        return result(nic);
      }
      if (args.slice(0, 3).join(' ') === 'network nic show' && !args.includes('--ids')) {
        const name = args[args.indexOf('--name') + 1];
        return result([...f.nics.values()].find((row) => String(row.id).endsWith(`/${name}`)));
      }
      return f.api.exec(command, args, options);
    },
  };
  const binding = azureUpgradeBinding(f.original),
    fingerprint = `sha256:${'b'.repeat(64)}`;
  const logicalSite = {
    system_metadata: { uid: 'site-uid' },
    metadata: { name: f.original.siteName, namespace: 'system' },
    spec: { synthetic: 'owned-original-configuration' },
  };
  const runtime = {
    engine: 'native',
    requireRoutingContract() {},
    requireBootstrapContract() {
      throw Error('network update must not issue bootstrap');
    },
    async bootstrap() {
      throw Error('network update must not issue bootstrap');
    },
    async approveRegistrations() {
      events.push('registration');
      return { status: 'healthy' };
    },
    async observeHealth() {
      return { status: 'healthy' };
    },
    async observeRegistrations(_binding: unknown, instances: Record<string, string>) {
      return {
        owner: binding.owner,
        siteName: binding.siteName,
        contractFingerprint: fingerprint,
        status: 'healthy',
        nodes: Object.entries(instances).map(([node, instanceId], index) => ({
          node,
          instanceId,
          registration: `r-node-${index + 1}`,
          status: 'healthy',
          state: 'ONLINE',
        })),
      };
    },
    async observeOwnedSite() {
      return structuredClone(logicalSite);
    },
    ownedSiteConfiguration(_binding: unknown, site: typeof logicalSite) {
      return { metadata: site.metadata, spec: site.spec };
    },
    async observeRegisteredConfiguration(_binding: unknown, _instances: unknown, interfaces: unknown[]) {
      expect(interfaces).toHaveLength(f.plan.topology.nodeCount * f.plan.nics.length);
      events.push('configuration');
      return {
        owner: binding.owner,
        siteName: binding.siteName,
        contractFingerprint: fingerprint,
        siteUid: logicalSite.system_metadata.uid,
        status: 'configured',
        interfaces: (interfaces as Array<{ node: string; role: string; mac: string }>).map((iface) => ({
          ...iface,
          device: iface.role === 'slo' ? 'eth0' : 'eth1',
        })),
      };
    },
  };
  const platform = {
    async storage() {
      return store;
    },
    async runtime() {
      return f.plan.networkReplacementProfile ? historyRuntime : runtime;
    },
  } as unknown as CePlatformService;
  const apply = () =>
    executeAzureCeNativeApply(
      { planId: f.plan.planId, planSha256: f.plan.planSha256 },
      { cwd: root, hasUI: false, ui: { confirm: async () => false }, sessionManager: session() },
      api,
      async () => platform,
      undefined,
      { observe: async () => structuredClone(f.current) },
    );
  await persistAzureNativeSource(f.original, store);
  const historyRuntime = {
    ...runtime,
    requireBootstrapContract() {},
    async reserveSite(_binding: unknown, save: (row: unknown) => Promise<void>) {
      await save({
        siteName: binding.siteName,
        uid: logicalSite.system_metadata.uid,
        owner: binding.owner,
        contractFingerprint: fingerprint,
      });
    },
    async bootstrap(_binding: unknown, node: string, tokenName: string, save: (row: unknown) => Promise<void>) {
      events.push(`bootstrap:${node}`);
      await save({ node, tokenName, siteName: binding.siteName, jwt: 'synthetic.payload.signature' });
      return '#cloud-config\nwrite_files:\n- path: /etc/vpm/user_data\n  content: |\n    token: synthetic.payload.signature\n';
    },
  } as unknown as CeRuntime;
  const admission = await prepareAzureNativeAdmission(f.original, historyRuntime, store);
  for (let node = 1; node <= f.original.topology.nodeCount; node++) {
    const action = f.original.actions.find((row) => row.node === node && row.requiresBootstrap);
    if (!action) throw Error('missing original fixture launch action');
    await azureNativeBootstrapForAction(f.original, action, admission, historyRuntime, store, undefined, 0);
    await recordAzureNativeLaunch(f.original, node, admission, store);
  }
  const finalAction = f.original.actions.filter((row) => row.kind === 'health-gate').at(-1);
  if (!finalAction) throw Error('missing original fixture final health action');
  const health = await collectAzureNativeAdmissionHealth(
    f.original,
    f.original.topology.nodeCount,
    api,
    historyRuntime,
    store,
    undefined,
    admission,
  );
  await persistAzureNativeActionEvidence(
    f.original,
    finalAction,
    { ...health, planId: f.original.planId, planSha256: f.original.planSha256 },
    store,
  );
  const originalCheckpoint = {
    schemaVersion: AZURE_CE_CHECKPOINT_SCHEMA_VERSION,
    engine: 'native' as const,
    authorization: { apply: true, terms: true, destroy: false },
    planId: f.original.planId,
    planSha256: f.original.planSha256,
    state: 'complete' as const,
    completedActionIds: f.original.actions.map((row) => row.id),
    observationSnapshot: structuredClone(f.current),
    observationFingerprint: fingerprintCheckpointObservation(f.current),
  };
  await saveCheckpoint(session(), f.original, originalCheckpoint);
  const seedReplacement = async (node: number) => {
    const source = compileAzureCePlan(
      { ...f.original.intent, operation: 'replace-node', replacementNode: node },
      f.current,
    );
    await persistAzureNativeSource(source, store);
    const checkpoint = await prepareAzureNativeAdmission(source, historyRuntime, store);
    await prepareAzureNativeReplacement(source, checkpoint, api, historyRuntime, store);
    const action = source.actions.find((row) => row.requiresBootstrap && row.node === node);
    if (!action) throw Error('missing replacement launch action');
    await azureNativeBootstrapForAction(source, action, checkpoint, historyRuntime, store, undefined, 0);
    const vm = f.vms[node - 1];
    vm.vmId = `00000000-0000-4000-8000-${String(node + 100).padStart(12, '0')}`;
    vm.tags['xcsh-plan-sha256'] = source.planSha256;
    const resource = f.current.resources.find((row) => row.id === vm.id);
    if (!resource) throw Error('missing replacement discovery resource');
    resource.tags = structuredClone(vm.tags);
    await recordAzureNativeLaunch(source, node, checkpoint, store);
    const actionHealth = source.actions.filter((row) => row.kind === 'health-gate').at(-1);
    if (!actionHealth) throw Error('missing replacement health action');
    const evidence = await collectAzureNativeAdmissionHealth(
      source,
      source.topology.nodeCount,
      api,
      historyRuntime,
      store,
      undefined,
      checkpoint,
    );
    await persistAzureNativeActionEvidence(
      source,
      actionHealth,
      { ...evidence, planId: source.planId, planSha256: source.planSha256 },
      store,
    );
    const publicCheckpoint = {
      ...originalCheckpoint,
      planId: source.planId,
      planSha256: source.planSha256,
      completedActionIds: source.actions.map((row) => row.id),
      observationSnapshot: structuredClone(f.current),
      observationFingerprint: fingerprintCheckpointObservation(f.current),
    };
    await saveCheckpoint(session(), source, publicCheckpoint);
    f.plan = compileAzureNativeNetworkUpdatePlan(compileAzureCePlan(f.plan.intent, f.current), f.original);
    await savePlanArtifact(session(), f.plan, f.current);
    events.length = 0;
    return { source, checkpoint, publicCheckpoint };
  };
  const publicPlan = async (intent: typeof f.plan.intent, retained: typeof f.plan) => {
    const type = new Proxy({}, { get: () => () => ({}) });
    const tool = createAzureCePlanTool({ typebox: { Type: type } } as unknown as PluginInterface);
    const discoveryArtifactId = await saveDiscoveryArtifact(session(), f.current);
    if (!discoveryArtifactId) throw Error('missing current public discovery artifact');
    const result = await tool.execute(
      'test',
      {
        discoveryArtifactId,
        intent,
        retainedDeployment: { planId: retained.planId, planSha256: retained.planSha256 },
      },
      undefined,
      undefined,
      { cwd: root, sessionManager: session() },
    );
    expect(result.isError).toBeUndefined();
    if (!result.details.plan) throw Error('public native generation planner did not return its saved plan');
    return result.details.plan;
  };
  const replan = async (retained = f.plan, restore = false, throughPublicPlanner = false) => {
    const intent = structuredClone(f.original.intent);
    intent.operation = 'update-network';
    if (!restore) intent.nics[1].subnet = { mode: 'greenfield', name: 'updated-sli', cidr: '10.20.2.0/24' };
    f.plan = throughPublicPlanner
      ? await publicPlan(intent, retained)
      : compileAzureNativeNetworkUpdatePlan(compileAzureCePlan(intent, f.current), retained, f.original);
    await savePlanArtifact(session(), f.plan, f.current);
    return f.plan;
  };
  const planNetworkReplacement = async (node = 1, throughPublicPlanner = false) => {
    const network = f.plan;
    const { compileAzureNativeNetworkReplacementPlan } = await import('../../src/ce/native-network-replacement');
    f.plan = throughPublicPlanner
      ? await publicPlan({ ...network.intent, operation: 'replace-node', replacementNode: node }, network)
      : compileAzureNativeNetworkReplacementPlan(
          compileAzureCePlan({ ...network.intent, operation: 'replace-node', replacementNode: node }, f.current),
          network,
          f.original,
        );
    await savePlanArtifact(session(), f.plan, f.current);
    return f.plan;
  };
  events.length = 0;
  await savePlanArtifact(session(), f.original, f.current);
  await savePlanArtifact(session(), f.plan, f.current);
  return {
    ...f,
    get plan() {
      return f.plan;
    },
    replan,
    planNetworkReplacement,
    root,
    store,
    logicalSite,
    originalCheckpoint,
    historyRuntime,
    networkApi: api,
    seedReplacement,
    originalHealthName: `native-action-${f.original.planSha256}-${finalAction.id}.json`,
    session,
    apply,
    events,
    powers,
    loseAfter: (id: string) => {
      loseCheckpointAfterAction = id;
    },
    losePending: (id: string) => {
      losePendingAction = id;
    },
    close: () => rm(root, { recursive: true, force: true }),
  };
}

for (const ha of [false, true])
  test(`public native ${ha ? 'three-node' : 'single'} network update resolves real names and preserves VM/NIC generations`, async () => {
    const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
    process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
    const f = await publicFixture(ha);
    try {
      const result = await f.apply();
      expect(result.checkpoint.state).toBe('complete');
      expect(result.checkpoint.networkUpdate).toBeDefined();
      const network = result.checkpoint.networkUpdate;
      if (!network) throw Error('missing network checkpoint');
      expect(Object.keys(network.before.nodes)).toHaveLength(ha ? 3 : 1);
      for (const [node, before] of Object.entries(network.before.nodes)) {
        expect(network.current.nodes[node].vmId).toBe(before.vmId);
        expect(network.current.nodes[node].ownerPlanSha256).toBe(before.ownerPlanSha256);
        for (const [index, nic] of Object.entries(before.nics)) {
          expect(network.current.nodes[node].nics[index].mac).toBe(nic.mac);
          expect(network.current.nodes[node].nics[index].ipConfigurationId).toBe(nic.ipConfigurationId);
          expect(network.current.nodes[node].nics[index].subnetId).toBe(nic.targetSubnetId);
        }
      }
      const mutations = f.events.filter((event) => /^(?:start|deallocate|nic):/.test(event));
      expect(mutations).toHaveLength((ha ? 3 : 1) * 4);
      expect(f.events.filter((event) => event === 'configuration')).toHaveLength(ha ? 3 : 1);
      for (let node = 2; node <= f.plan.topology.nodeCount; node++) {
        const stop = f.events.indexOf(`deallocate:${f.plan.deploymentName}-${node}`),
          previousStart = f.events.indexOf(`start:${f.plan.deploymentName}-${node - 1}`);
        expect(f.events.slice(previousStart + 1, stop)).toContain('configuration');
      }
      const before = f.events.length;
      expect((await f.apply()).checkpoint.state).toBe('complete');
      expect(f.events).toHaveLength(before);
    } finally {
      if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
      else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
      await f.close();
    }
  });

for (const ha of [false, true])
  test(`public native ${ha ? 'three-node' : 'single'} resumes a lost NIC checkpoint without duplicate mutation`, async () => {
    const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
    process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
    const f = await publicFixture(ha);
    try {
      const selected = f.plan.actions.find(
        (action) => action.kind === 'nic-update' && action.resourceId?.endsWith('-1-nic1'),
      );
      if (!selected) throw Error('missing selected NIC action');
      f.loseAfter(selected.id);
      await expect(f.apply()).rejects.toThrow(/lost completed checkpoint/);
      const interrupted = await loadCheckpoint(f.session(), f.plan);
      expect(interrupted?.pendingAction?.actionId).toBe(selected.id);
      expect(interrupted?.networkUpdate?.current.nodes['1'].nics['1'].subnetId).toBe(f.target);
      expect((await f.apply()).checkpoint.state).toBe('complete');
      expect(f.events.filter((event) => event === `nic:${f.plan.deploymentName}-1-nic1`)).toHaveLength(1);
      expect(f.events.filter((event) => event === `deallocate:${f.plan.deploymentName}-1`)).toHaveLength(1);
    } finally {
      if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
      else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
      await f.close();
    }
  });

test('public native network preflight rejects a foreign last-node NIC before interrupting any VM', async () => {
  const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
  process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
  const f = await publicFixture(true);
  try {
    const nic = [...f.nics.values()].find((row) => String(row.id).endsWith('-3-nic1'));
    if (!nic) throw Error('missing last NIC');
    (nic.tags as Record<string, string>)['xcsh-plan-sha256'] = 'f'.repeat(64);
    await expect(f.apply()).rejects.toThrow(/foreign cloud owner/);
    expect(f.events).toHaveLength(0);
    expect(await loadCheckpoint(f.session(), f.plan)).toBeUndefined();
  } finally {
    if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
    else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
    await f.close();
  }
});

for (const kind of ['vm-deallocate', 'nic-update'] as const)
  test(`public native recovers lost ${kind} intent persistence without skipping the unexecuted mutation`, async () => {
    const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
    process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
    const f = await publicFixture(false);
    try {
      const selected = f.plan.actions.find(
        (action) => action.kind === kind && (kind !== 'nic-update' || action.resourceId?.endsWith('-1-nic1')),
      );
      if (!selected) throw Error('missing selected action');
      f.losePending(selected.id);
      await expect(f.apply()).rejects.toThrow(/lost pending checkpoint/);
      const marker =
        kind === 'vm-deallocate' ? `deallocate:${f.plan.deploymentName}-1` : `nic:${f.plan.deploymentName}-1-nic1`;
      expect(f.events.filter((event) => event === marker)).toHaveLength(0);
      expect((await f.apply()).checkpoint.state).toBe('complete');
      expect(f.events.filter((event) => event === marker)).toHaveLength(1);
    } finally {
      if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
      else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
      await f.close();
    }
  });

test('public native recovery rejects changed retained MAC identity after a lost completed NIC write', async () => {
  const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
  process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
  const f = await publicFixture(true);
  try {
    const selected = f.plan.actions.find(
      (action) => action.kind === 'nic-update' && action.resourceId?.endsWith('-1-nic1'),
    );
    if (!selected) throw Error('missing selected action');
    f.loseAfter(selected.id);
    await expect(f.apply()).rejects.toThrow(/lost completed checkpoint/);
    const before = f.events.length;
    f.sliNic.macAddress = '02:00:00:aa:bb:cc';
    await expect(f.apply()).rejects.toThrow(/retained NIC\/configuration identity/);
    expect(f.events).toHaveLength(before);
  } finally {
    if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
    else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
    await f.close();
  }
});

for (const kind of [
  'missing-admission',
  'incomplete-public',
  'foreign-publisher',
  'wrong-birth-uuid',
  'duplicate-interface',
  'changed-site',
  'changed-configuration',
  'wrong-original-snapshot',
] as const)
  test(`public native network rejects ${kind} provenance before the first VM interruption`, async () => {
    const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
    process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
    const f = await publicFixture(true);
    try {
      if (kind === 'missing-admission') await f.store.remove(`native-admission-${f.original.planSha256}.json`);
      else if (kind === 'incomplete-public')
        await saveCheckpoint(f.session(), f.original, {
          ...f.originalCheckpoint,
          state: 'running',
          completedActionIds: [],
        });
      else if (kind === 'changed-site') f.logicalSite.system_metadata.uid = 'another-site';
      else if (kind === 'changed-configuration') f.logicalSite.spec.synthetic = 'changed';
      else {
        const record = (await f.store.read(f.originalHealthName)) as {
          evidence: {
            siteConfigurationSha256: string;
            registrations: { owner: { account: string }; nodes: Array<{ instanceId: string }> };
            configuration: { interfaces: unknown[] };
          };
        };
        if (kind === 'foreign-publisher') record.evidence.registrations.owner.account = 'example-foreign';
        if (kind === 'wrong-birth-uuid')
          record.evidence.registrations.nodes[2].instanceId = '00000000-0000-4000-8000-000000000099';
        if (kind === 'duplicate-interface')
          record.evidence.configuration.interfaces[5] = record.evidence.configuration.interfaces[0];
        if (kind === 'wrong-original-snapshot')
          record.evidence.siteConfigurationSha256 = canonicalSha256({ wrong: true });
        await f.store.write(f.originalHealthName, record);
      }
      const reason =
        kind === 'missing-admission'
          ? /ENOENT/
          : kind === 'incomplete-public'
            ? /public execution is incomplete/
            : kind === 'wrong-birth-uuid'
              ? /historical UUID/
              : kind === 'duplicate-interface'
                ? /MAC\/role\/device/
                : ['changed-site', 'changed-configuration'].includes(kind)
                  ? /logical-site identity or configuration/
                  : /registered configuration or logical-site binding/;
      await expect(f.apply()).rejects.toThrow(reason);
      expect(f.events).toHaveLength(0);
      expect(await loadCheckpoint(f.session(), f.plan)).toBeUndefined();
    } finally {
      if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
      else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
      await f.close();
    }
  });

test('public native network checks frozen site configuration on interrupted resume and completed replay', async () => {
  const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
  process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
  const f = await publicFixture(false);
  try {
    const action = f.plan.actions.find((row) => row.kind === 'nic-update' && row.resourceId?.endsWith('-1-nic1'));
    if (!action) throw Error('missing selected NIC');
    f.loseAfter(action.id);
    await expect(f.apply()).rejects.toThrow(/lost completed checkpoint/);
    const count = f.events.length;
    f.logicalSite.spec.synthetic = 'foreign-change';
    await expect(f.apply()).rejects.toThrow(/logical-site identity or configuration/);
    expect(f.events).toHaveLength(count);
    f.logicalSite.spec.synthetic = 'owned-original-configuration';
    expect((await f.apply()).checkpoint.state).toBe('complete');
    const completedCount = f.events.length;
    f.logicalSite.system_metadata.uid = 'another-site';
    await expect(f.apply()).rejects.toThrow(/logical-site identity or configuration/);
    expect(f.events).toHaveLength(completedCount);
  } finally {
    if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
    else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
    await f.close();
  }
});

for (const failedPrior of [false, true])
  test(`public native network resolves original and recursive prior replacements${failedPrior ? ' and rejects unfinished public predecessor' : ''}`, async () => {
    const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
    process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
    const f = await publicFixture(true);
    try {
      const first = await f.seedReplacement(1),
        second = await f.seedReplacement(2);
      if (failedPrior) {
        await saveCheckpoint(f.session(), first.source, {
          ...first.publicCheckpoint,
          state: 'running',
          completedActionIds: [],
        });
        await expect(f.apply()).rejects.toThrow(/prior generation public execution is incomplete/);
        expect(f.events).toHaveLength(0);
        expect(await loadCheckpoint(f.session(), f.plan)).toBeUndefined();
      } else {
        const result = await f.apply();
        expect(result.checkpoint.state).toBe('complete');
        expect(result.checkpoint.networkUpdate?.source?.generationPlanSha256s).toEqual(
          [f.original.planSha256, first.source.planSha256, second.source.planSha256].sort(),
        );
        expect(result.checkpoint.networkUpdate?.before.nodes['1'].vmId).toBe(first.checkpoint.replacement?.newVmId);
        expect(result.checkpoint.networkUpdate?.before.nodes['2'].vmId).toBe(second.checkpoint.replacement?.newVmId);
      }
    } finally {
      if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
      else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
      await f.close();
    }
  });

for (const ha of [false, true])
  test(`public native ${ha ? 'HA' : 'single'} network A-B-A-B lineage has distinct immutable plans and completed receipts`, async () => {
    const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
    process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
    const f = await publicFixture(ha);
    try {
      const ids: string[] = [],
        histories: string[] = [];
      let beforeMacs: string[][] | undefined;
      for (const restore of [false, true, false]) {
        if (ids.length) await f.replan(f.plan, restore);
        const result = await f.apply(),
          network = result.checkpoint.networkUpdate;
        if (!network) throw Error('completed network checkpoint missing');
        expect(result.checkpoint.state).toBe('complete');
        expect(network?.source?.networkHistoryPlanSha256s).toEqual(ids);
        ids.push(f.plan.planSha256);
        const name = azureNativeNetworkHistoryName(f.plan);
        const historySha256 = canonicalSha256(await f.store.read(name));
        histories.push(historySha256);
        const macs = Object.values(network.current.nodes).map((node) => Object.values(node.nics).map((nic) => nic.mac));
        if (beforeMacs) expect(macs).toEqual(beforeMacs);
        else beforeMacs = macs;
        expect((await f.apply()).checkpoint.state).toBe('complete');
        expect(canonicalSha256(await f.store.read(name))).toBe(historySha256);
      }
      expect(new Set(ids).size).toBe(3);
    } finally {
      if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
      else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
      await f.close();
    }
  });

for (const kind of [
  'missing-history',
  'unfinished-public',
  'rewritten-final',
  'foreign-owner',
  'partial-nics',
  'wrong-lineage',
] as const)
  test(`public native repeated network rejects ${kind} before another VM interruption`, async () => {
    const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
    process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
    const f = await publicFixture(true);
    try {
      const completed = await f.apply(),
        source = f.plan,
        historyName = azureNativeNetworkHistoryName(source);
      await f.replan(source, true);
      if (kind === 'missing-history') await f.store.remove(historyName);
      else if (kind === 'unfinished-public')
        await saveCheckpoint(f.session(), source, {
          ...completed.checkpoint,
          state: 'running',
          completedActionIds: [],
          networkUpdate: undefined,
        });
      else if (kind === 'rewritten-final') {
        const action = source.actions.filter((row) => row.kind === 'health-gate').at(-1);
        const name = `native-action-${source.planSha256}-${action?.id}.json`;
        const record = (await f.store.read(name)) as { evidence: { observedAt: string } };
        record.evidence.observedAt = '2020-01-01T00:00:00Z';
        await f.store.write(name, record);
      } else {
        const record = (await f.store.read(historyName)) as {
          owner: { account: string };
          networkUpdate: {
            current: { nodes: Record<string, { nics: Record<string, unknown> }> };
            source: { networkHistoryPlanSha256s: string[] };
          };
        };
        if (kind === 'foreign-owner') record.owner.account = 'example-foreign';
        if (kind === 'partial-nics') delete record.networkUpdate.current.nodes['3'].nics['1'];
        if (kind === 'wrong-lineage') record.networkUpdate.source.networkHistoryPlanSha256s = ['f'.repeat(64)];
        await f.store.write(historyName, record);
      }
      const count = f.events.length;
      const reason =
        kind === 'missing-history'
          ? /ENOENT/
          : kind === 'unfinished-public'
            ? /prior network public execution/
            : kind === 'rewritten-final'
              ? /final configuration receipt changed/
              : kind === 'foreign-owner'
                ? /owned source or receipt schema/
                : kind === 'partial-nics'
                  ? /complete ordered NIC/
                  : /completed network predecessor/;
      await expect(f.apply()).rejects.toThrow(reason);
      expect(f.events).toHaveLength(count);
      expect(await loadCheckpoint(f.session(), f.plan)).toBeUndefined();
    } finally {
      if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
      else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
      await f.close();
    }
  });

test('public native network resumes lost history persistence after completed public execution without repeating mutations', async () => {
  const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
  process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
  const f = await publicFixture(false);
  try {
    const write = f.store.write.bind(f.store);
    let fail = true;
    f.store.write = async (name, value) => {
      if (name.startsWith('native-network-history-') && fail) {
        fail = false;
        throw Error('synthetic lost network history write');
      }
      return write(name, value);
    };
    await expect(f.apply()).rejects.toThrow(/lost network history write/);
    expect((await loadCheckpoint(f.session(), f.plan))?.state).toBe('complete');
    const count = f.events.length;
    expect((await f.apply()).checkpoint.state).toBe('complete');
    expect(f.events).toHaveLength(count);
    expect(await f.store.read(azureNativeNetworkHistoryName(f.plan))).toBeDefined();
  } finally {
    if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
    else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
    await f.close();
  }
});

test('actual public native network planning binds retained creation and completed network artifacts', async () => {
  const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
  process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
  const f = await publicFixture(false);
  try {
    const type = new Proxy({}, { get: () => () => ({}) });
    const tool = createAzureCePlanTool({ typebox: { Type: type } } as unknown as PluginInterface);
    const discovery = await saveDiscoveryArtifact(f.session(), f.current);
    if (!discovery) throw Error('missing synthetic discovery artifact');
    const result = await tool.execute(
      'test',
      {
        discoveryArtifactId: discovery,
        intent: f.plan.intent,
        retainedDeployment: { planId: f.original.planId, planSha256: f.original.planSha256 },
      },
      undefined,
      undefined,
      { cwd: f.root, sessionManager: f.session() },
    );
    expect(result.isError).toBeUndefined();
    expect(result.details.plan?.networkProfile?.retainedPlanSha256).toBe(f.original.planSha256);
    await f.apply();
    const next = await tool.execute(
      'test',
      {
        discoveryArtifactId: discovery,
        intent: f.plan.intent,
        retainedDeployment: { planId: f.plan.planId, planSha256: f.plan.planSha256 },
      },
      undefined,
      undefined,
      { cwd: f.root, sessionManager: f.session() },
    );
    expect(next.isError).toBeUndefined();
    expect(next.details.plan?.planSha256).not.toBe(f.plan.planSha256);
    expect(next.details.plan?.networkProfile?.retainedPlanSha256).toBe(f.plan.planSha256);
  } finally {
    if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
    else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
    await f.close();
  }
});

const networkRetirementPrepared = new WeakSet<object>();
const networkRetirementTokens = new WeakMap<object, { node: string; name: string }[]>();
async function retireNetworkFixture(
  f: Awaited<ReturnType<typeof publicFixture>>,
  signal?: AbortSignal,
  onAbsence?: () => Promise<void>,
) {
  const { compileAzureNativeTeardown, runAzureNativeTeardown } = await import('../../src/ce/native-teardown');
  const binding = azureUpgradeBinding(f.original),
    siteFingerprint = `sha256:${'b'.repeat(64)}`;
  const contract = {
    fingerprint: `sha256:${'c'.repeat(64)}`,
  } as import('../../../platform/src/ce/ingress-contract').VerifiedIngressContract;
  const discovered = structuredClone(f.current),
    groupId = `/subscriptions/${f.original.subscription.id}/resourceGroups/${f.original.intent.resourceGroup}`;
  discovered.resources.push({
    id: groupId,
    location: f.original.region,
    exists: true,
    owned: true,
    state: {},
    tags: {
      'xcsh-managed-by': 'azure-ce',
      'xcsh-execution-engine': 'native',
      'xcsh-deployment-id': f.original.deploymentName,
      'xcsh-plan-sha256': f.original.planSha256,
    },
  });
  const cloud = compileAzureCePlan({ ...f.original.intent, operation: 'teardown' }, discovered);
  if (!networkRetirementPrepared.has(f)) await persistAzureNativeSource(cloud, f.store);
  const drain = {
    schemaVersion: 1 as const,
    owner: binding.owner,
    sourcePlanSha256: f.original.planSha256,
    siteContractFingerprint: siteFingerprint,
    ingressContractFingerprint: contract.fingerprint,
    listeners: [],
    origins: [],
    sites: [{ binding, siteUid: 'site-uid', routing: [] }],
  };
  const tokens =
    networkRetirementTokens.get(f) ??
    binding.nodes.map((node, index) => ({
      node,
      name: `${f.original.deploymentName.slice(0, 40)}-${index + 1}-${f.original.planSha256.slice(0, 12)}`,
    }));
  for (const name of await readdir(f.store.directory)) {
    if (!/^ce-demo-[1-3]-[a-f0-9]{12}\.json$/.test(name)) continue;
    const value = (await f.store.read(name)) as { node: string; tokenName: string };
    if (!tokens.some((token) => token.name === value.tokenName))
      tokens.push({ node: value.node, name: value.tokenName });
  }
  networkRetirementTokens.set(f, tokens);
  const teardown = compileAzureNativeTeardown(f.original, cloud, drain, [
    { siteName: f.original.siteName, siteUid: 'site-uid', physicalSiteUid: 'physical-uid', tokens },
  ]);
  if (!networkRetirementPrepared.has(f)) {
    await f.store.write(`${teardown.planId}.json`, teardown);
    networkRetirementPrepared.add(f);
  }
  const runtime = {
    ...f.historyRuntime,
    contract: { fingerprint: siteFingerprint },
    async drainPlatform() {
      return { status: 'platform-drained' };
    },
    async observeSiteDeletion() {
      return { status: 'deleted' };
    },
    async deleteBootstrapToken() {
      f.events.push('retire:token');
    },
    async deleteSiteExact() {
      f.events.push('retire:site');
    },
    async unregisteredAbsence() {
      await onAbsence?.();
      return {
        status: 'absent',
        owner: binding.owner,
        siteContractFingerprint: siteFingerprint,
        ingressContractFingerprint: contract.fingerprint,
        startedAt: new Date().toISOString(),
        observedAt: new Date().toISOString(),
        sources: ['/api/test/absence'],
      };
    },
  } as unknown as CeRuntime;
  const api: AzExecApi = {
    async exec(_command, args) {
      return {
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify(
          args[0] === 'account'
            ? {
                id: f.original.subscription.id,
                tenantId: f.original.subscription.tenantId,
                environmentName: f.original.subscription.cloud,
                state: 'Enabled',
              }
            : args[0] === 'group'
              ? false
              : [],
        ),
      };
    },
  };
  return runAzureNativeTeardown(
    f.original,
    cloud,
    teardown,
    teardown.planSha256,
    runtime,
    contract,
    f.store,
    async () => ({ status: 'retired', absence: 'absent' }),
    signal,
    api,
  );
}

for (const ha of [false, true])
  test(`public native ${ha ? 'HA' : 'single'} repeated network histories retire through actual enrollment and parent cleanup`, async () => {
    const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
    process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
    const f = await publicFixture(ha);
    try {
      for (let index = 0; index < 3; index++) {
        if (index) await f.replan(f.plan, index === 1);
        expect((await f.apply()).checkpoint.state).toBe('complete');
      }
      expect(await retireNetworkFixture(f)).toMatchObject({
        completeCleanup: true,
        parent: { status: 'native-deployment-artifacts-retired' },
      });
      const { readdir } = await import('node:fs/promises');
      expect(
        (await readdir(f.store.directory)).some((name) =>
          /^native-(?:network-history|source|action|admission)-/.test(name),
        ),
      ).toBe(false);
      expect(await retireNetworkFixture(f)).toMatchObject({ completeCleanup: true });
    } finally {
      if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
      else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
      await f.close();
    }
  });

for (const fault of [
  'missing-history',
  'foreign-owner',
  'rewritten-final',
  'wrong-lineage',
  'partial-nics',
  'foreign-site',
  'generation-uuid',
] as const)
  test(`native network parent retirement rejects ${fault} before removing historical artifacts`, async () => {
    const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
    process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
    const f = await publicFixture(false);
    try {
      await f.apply();
      const first = f.plan;
      await f.replan(first, true);
      await f.apply();
      const name = azureNativeNetworkHistoryName(first);
      if (fault === 'missing-history') await f.store.remove(name);
      else if (fault === 'rewritten-final') {
        const action = first.actions.filter((row) => row.kind === 'health-gate').at(-1);
        if (!action) throw Error('missing fixture final health gate');
        const receiptName = `native-action-${first.planSha256}-${action.id}.json`;
        const receipt = (await f.store.read(receiptName)) as { evidence: { observedAt: string } };
        receipt.evidence.observedAt = '2020-01-01T00:00:00Z';
        await f.store.write(receiptName, receipt);
      } else {
        const record = (await f.store.read(name)) as AzureNativeNetworkHistory;
        if (!record.networkUpdate.source) throw Error('missing fixture original network source');
        if (fault === 'foreign-owner') record.owner.deploymentId = 'foreign';
        if (fault === 'wrong-lineage') record.networkUpdate.source.networkHistoryPlanSha256s = ['a'.repeat(64)];
        if (fault === 'partial-nics') delete record.networkUpdate.current.nodes['1'].nics['1'];
        if (fault === 'foreign-site') record.networkUpdate.source.siteUid = 'foreign';
        if (fault === 'generation-uuid') {
          record.networkUpdate.before.nodes['1'].vmId = '11111111-1111-4111-8111-111111111111';
          record.networkUpdate.current.nodes['1'].vmId = '11111111-1111-4111-8111-111111111111';
        }
        await f.store.write(name, record);
      }
      await expect(retireNetworkFixture(f)).rejects.toThrow(/network|original VM UUID/);
      expect(await f.store.read(`native-source-${first.planSha256}.json`)).toBeDefined();
      expect(await f.store.read(azureNativeNetworkHistoryName(f.plan))).toBeDefined();
    } finally {
      if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
      else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
      await f.close();
    }
  });

test('native completed network history retirement resumes after the first exact history removal', async () => {
  const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
  process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
  const f = await publicFixture(false);
  try {
    await f.apply();
    const name = azureNativeNetworkHistoryName(f.plan);
    await f.replan(f.plan, true);
    await f.apply();
    const controller = new AbortController();
    let interrupted = false;
    const { readdir } = await import('node:fs/promises');
    await expect(
      retireNetworkFixture(f, controller.signal, async () => {
        if (!interrupted && !(await readdir(f.store.directory)).includes(name)) {
          interrupted = true;
          controller.abort(Error('synthetic interruption after history removal'));
        }
      }),
    ).rejects.toThrow('synthetic interruption');
    expect(interrupted).toBe(true);
    const before = [...f.events];
    expect(await retireNetworkFixture(f)).toMatchObject({ completeCleanup: true });
    expect(f.events).toEqual(before);
    expect((await readdir(f.store.directory)).some((row) => row.startsWith('native-network-history-'))).toBe(false);
  } finally {
    if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
    else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
    await f.close();
  }
});

for (const ha of [false, true])
  test(`native network replacement contract qualifies completed ${ha ? 'HA' : 'single'} repeated network lineage without relaxing the original guard`, async () => {
    const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
    process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
    const f = await publicFixture(ha);
    try {
      for (const restore of [false, true, false]) {
        if (f.events.length) await f.replan(f.plan, restore);
        await f.apply();
      }
      const { compileAzureNativeNetworkReplacementPlan, qualifyAzureNativeNetworkReplacementSource } = await import(
        '../../src/ce/native-network-replacement'
      );
      const { verifyAzureNativeReplacementOriginalSource } = await import('../../src/ce/native-replacement-source');
      const base = compileAzureCePlan({ ...f.plan.intent, operation: 'replace-node', replacementNode: 1 }, f.current);
      expect(() => verifyAzureNativeReplacementOriginalSource(base, f.original)).toThrow(
        'original creation scope differs',
      );
      const replacement = compileAzureNativeNetworkReplacementPlan(base, f.plan, f.original);
      expect(() => verifyAzureNativeReplacementOriginalSource(replacement, f.original)).toThrow(
        'original creation scope differs',
      );
      const before = [...f.events];
      const receipt = await qualifyAzureNativeNetworkReplacementSource(
        replacement,
        f.store,
        (source) => loadCheckpoint(f.session(), source),
        f.networkApi,
        f.historyRuntime,
      );
      expect(receipt.original).toEqual(f.original);
      expect(receipt.networkSource).toEqual(f.plan);
      expect(receipt.source.networkHistoryPlanSha256s).toHaveLength(2);
      expect(receipt.networkInventory.nodes).toHaveProperty('1');
      expect(Object.values(receipt.networkInventory.nodes).flatMap((node) => Object.values(node.nics))).toHaveLength(
        ha ? 6 : 2,
      );
      expect(f.events).toEqual(before);
    } finally {
      if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
      else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
      await f.close();
    }
  });

for (const fault of [
  'missing-history',
  'incomplete-network',
  'incomplete-original',
  'rewritten-final',
  'foreign-publisher',
  'changed-vm',
  'changed-mac',
  'changed-subnet',
  'missing-config',
  'changed-site',
] as const)
  test(`native network replacement contract rejects ${fault} before replacement admission`, async () => {
    const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
    process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
    const f = await publicFixture(false);
    try {
      const completed = await f.apply(),
        network = f.plan;
      const { compileAzureNativeNetworkReplacementPlan, qualifyAzureNativeNetworkReplacementSource } = await import(
        '../../src/ce/native-network-replacement'
      );
      const replacement = compileAzureNativeNetworkReplacementPlan(
        compileAzureCePlan({ ...network.intent, operation: 'replace-node', replacementNode: 1 }, f.current),
        network,
        f.original,
      );
      if (fault === 'missing-history') await f.store.remove(azureNativeNetworkHistoryName(network));
      if (fault === 'incomplete-network')
        await saveCheckpoint(f.session(), network, {
          ...completed.checkpoint,
          state: 'running',
          completedActionIds: completed.checkpoint.completedActionIds.slice(0, -1),
        });
      if (fault === 'incomplete-original')
        await saveCheckpoint(f.session(), f.original, {
          ...f.originalCheckpoint,
          state: 'running',
          completedActionIds: [],
        });
      if (fault === 'rewritten-final' || fault === 'foreign-publisher') {
        const action = network.actions.filter((row) => row.kind === 'health-gate').at(-1);
        if (!action) throw Error('fixture lacks final health action');
        const name = `native-action-${network.planSha256}-${action.id}.json`;
        const row = (await f.store.read(name)) as {
          evidence: { observedAt: string; configuration: { owner: { deploymentId: string } } };
        };
        if (fault === 'rewritten-final') row.evidence.observedAt = '2020-01-01T00:00:00Z';
        else row.evidence.configuration.owner.deploymentId = 'foreign';
        await f.store.write(name, row);
      }
      if (fault === 'changed-vm') f.vms[0].vmId = '11111111-1111-4111-8111-111111111111';
      const nic = [...f.nics.values()][0];
      if (fault === 'changed-mac') nic.macAddress = '02:ff:ff:ff:ff:fe';
      if (fault === 'changed-subnet') f.config(nic).subnet = { id: 'foreign-subnet' };
      if (fault === 'missing-config') nic.ipConfigurations = [];
      if (fault === 'changed-site') f.logicalSite.spec = { synthetic: 'foreign-configuration' };
      const before = [...f.events];
      await expect(
        qualifyAzureNativeNetworkReplacementSource(
          replacement,
          f.store,
          (source) => loadCheckpoint(f.session(), source),
          f.networkApi,
          f.historyRuntime,
        ),
      ).rejects.toThrow();
      expect(f.events).toEqual(before);
      await expect(f.store.read(`native-admission-${replacement.planSha256}.json`)).rejects.toThrow('ENOENT');
    } finally {
      if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
      else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
      await f.close();
    }
  });

for (const fault of [
  'foreign-original',
  'foreign-network',
  'unknown-profile-field',
  'different-subnet',
  'wrong-engine',
] as const)
  test(`native network replacement contract planning rejects ${fault} binding`, async () => {
    const f = await publicFixture(false);
    try {
      const { compileAzureNativeNetworkReplacementPlan, verifyAzureNativeNetworkReplacementOriginalSource } =
        await import('../../src/ce/native-network-replacement');
      const { verifyAzureCePlan } = await import('../../src/ce/artifacts');
      const base = compileAzureCePlan({ ...f.plan.intent, operation: 'replace-node', replacementNode: 1 }, f.current);
      if (fault === 'different-subnet') {
        const changed = structuredClone(base.intent);
        changed.nics[1].subnet = structuredClone(f.original.intent.nics[1].subnet);
        expect(() =>
          compileAzureNativeNetworkReplacementPlan(compileAzureCePlan(changed, f.current), f.plan, f.original),
        ).toThrow('exact retained network configuration differs');
      } else if (fault === 'wrong-engine') {
        expect(() =>
          compileAzureNativeNetworkReplacementPlan(
            compileAzureCePlan({ ...base.intent, engine: 'terraform' }, f.current),
            f.plan,
            f.original,
          ),
        ).toThrow('deployment resources belong to another or unknown execution engine');
      } else {
        const plan = compileAzureNativeNetworkReplacementPlan(base, f.plan, f.original);
        if (!plan.networkReplacementProfile) throw Error('missing fixture network replacement profile');
        if (fault === 'foreign-original') plan.networkReplacementProfile.originalPlanSha256 = 'a'.repeat(64);
        if (fault === 'foreign-network') plan.networkReplacementProfile.retainedNetworkPlanSha256 = 'b'.repeat(64);
        if (fault === 'unknown-profile-field') Object.assign(plan.networkReplacementProfile, { foreign: true });
        const { planId: _id, planSha256: _sha, ...draft } = plan;
        plan.planSha256 = canonicalSha256(draft);
        plan.planId = `azure-ce-${plan.planSha256.slice(0, 24)}`;
        if (fault === 'unknown-profile-field')
          expect(() => verifyAzureCePlan(plan)).toThrow('exact original and retained network source identities');
        else
          expect(() => verifyAzureNativeNetworkReplacementOriginalSource(plan, f.original, f.plan)).toThrow(
            'original scope or exact retained network configuration differs',
          );
      }
    } finally {
      await f.close();
    }
  });

for (const ha of [false, true])
  test(`public native network replacement ${ha ? 'HA' : 'single'} preserves completed network identities and accepts registration`, async () => {
    const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
    process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
    const f = await publicFixture(ha);
    try {
      await f.apply();
      const before = f.vms.map((vm) => vm.vmId),
        nics = structuredClone([...f.nics.values()]);
      const plan = await f.planNetworkReplacement();
      const result = await f.apply();
      expect(result.checkpoint.state).toBe('complete');
      expect(f.vms.find((vm) => vm.name === f.nodes[0])?.vmId).not.toBe(before[0]);
      for (let index = 1; index < f.nodes.length; index++)
        expect(f.vms.find((vm) => vm.name === f.nodes[index])?.vmId).toBe(before[index]);
      expect([...f.nics.values()]).toEqual(nics);
      const native = (await f.store.read(`native-admission-${plan.planSha256}.json`)) as {
        replacement: { status: string; networkSourcePlan: { planSha256: string } };
      };
      expect(native.replacement.status).toBe('registered');
      if (!plan.networkReplacementProfile) throw Error('network replacement profile missing');
      expect(native.replacement.networkSourcePlan.planSha256).toBe(
        plan.networkReplacementProfile.retainedNetworkPlanSha256,
      );
      const count = f.events.length;
      expect((await f.apply()).checkpoint.state).toBe('complete');
      expect(f.events).toHaveLength(count);
    } finally {
      if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
      else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
      await f.close();
    }
  });

for (const kind of ['vm-delete', 'vm-create'] as const)
  for (const pending of [false, true])
    test(`public native network replacement resumes lost ${pending ? 'pending' : 'completed'} ${kind} write without repeated mutation`, async () => {
      const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
      process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
      const f = await publicFixture(false);
      try {
        await f.apply();
        const plan = await f.planNetworkReplacement();
        const action = plan.actions.find((row) => row.kind === kind);
        if (!action) throw Error('missing replacement mutation');
        if (pending) f.losePending(action.id);
        else f.loseAfter(action.id);
        await expect(f.apply()).rejects.toThrow(/lost.*checkpoint/);
        expect((await f.apply()).checkpoint.state).toBe('complete');
        expect(f.events.filter((event) => event === `mutation:delete:${f.nodes[0]}`)).toHaveLength(1);
        expect(f.events.filter((event) => event === `mutation:create:${f.nodes[0]}`)).toHaveLength(1);
        expect(f.events.filter((event) => event === `bootstrap:${f.nodes[0]}`)).toHaveLength(1);
      } finally {
        if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
        else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
        await f.close();
      }
    });

test('actual public planner selects separate network-bound replacement contract', async () => {
  const f = await publicFixture(false);
  try {
    const type = new Proxy({}, { get: () => () => ({}) });
    const tool = createAzureCePlanTool({ typebox: { Type: type } } as unknown as PluginInterface);
    const discoveryArtifactId = await saveDiscoveryArtifact(f.session(), f.current);
    if (!discoveryArtifactId) throw Error('missing synthetic discovery');
    const result = await tool.execute(
      'test',
      {
        discoveryArtifactId,
        intent: { ...f.plan.intent, operation: 'replace-node', replacementNode: 1 },
        retainedDeployment: { planId: f.plan.planId, planSha256: f.plan.planSha256 },
      },
      undefined,
      undefined,
      { cwd: f.root, sessionManager: f.session() },
    );
    expect(result.isError).toBeUndefined();
    expect(result.details.plan?.networkReplacementProfile).toEqual({
      schemaVersion: 1,
      originalPlanSha256: f.original.planSha256,
      retainedNetworkPlanSha256: f.plan.planSha256,
    });
    expect(f.events).toEqual([]);
    expect(
      (await storeSnapshot(f.store)).some(
        (file) => file.name === `native-admission-${result.details.plan?.planSha256}.json`,
      ),
    ).toBe(false);
  } finally {
    await f.close();
  }
});

for (const phase of ['resume', 'complete'] as const)
  for (const fault of [
    'changed-site',
    'changed-mac',
    'foreign-nic',
    'incomplete-network',
    'changed-vm',
    'foreign-vm',
    'wrong-image',
    'missing-vm',
    'unavailable-vm',
    'malformed-vm',
    'rewritten-inventory',
    'unknown-admission-field',
  ] as const)
    test(`public native network replacement ${phase} rejects ${fault} before further writes or mutations`, async () => {
      const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
      process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
      const f = await publicFixture(false);
      try {
        await f.apply();
        const network = f.plan,
          plan = await f.planNetworkReplacement();
        if (phase === 'resume') {
          const create = plan.actions.find((row) => row.kind === 'vm-create');
          if (!create) throw Error('missing fixture create');
          f.loseAfter(create.id);
          await expect(f.apply()).rejects.toThrow(/lost.*checkpoint/);
        } else await f.apply();
        const selected = f.vms.find((row) => row.name === f.nodes[0]);
        const nic = [...f.nics.values()][0];
        if (!selected || !nic) throw Error('missing fixture identity');
        if (fault === 'changed-site') f.logicalSite.system_metadata.uid = 'foreign-site';
        if (fault === 'changed-mac') nic.macAddress = '02:ff:00:00:00:01';
        if (fault === 'foreign-nic') (nic.tags as Record<string, string>)['xcsh-plan-sha256'] = 'f'.repeat(64);
        if (fault === 'incomplete-network') {
          const checkpoint = await loadCheckpoint(f.session(), network);
          if (!checkpoint) throw Error('missing network execution');
          checkpoint.state = 'running';
          checkpoint.completedActionIds.pop();
          await saveCheckpoint(f.session(), network, checkpoint);
        }
        if (fault === 'changed-vm') {
          const admission = (await f.store.read(
            `native-admission-${plan.planSha256}.json`,
          )) as import('../../src/ce/native-workflow').NativeWorkflowCheckpoint;
          selected.vmId =
            phase === 'resume'
              ? (admission.replacement?.oldVmIds[f.nodes[0]] as string)
              : '00000000-0000-4000-8000-000000000998';
        }
        if (fault === 'foreign-vm') selected.tags['xcsh-plan-sha256'] = 'f'.repeat(64);
        if (fault === 'wrong-image')
          (
            selected as unknown as { storageProfile: { imageReference: { version: string } } }
          ).storageProfile.imageReference.version = 'foreign';
        if (fault === 'rewritten-inventory' || fault === 'unknown-admission-field') {
          const name = `native-admission-${plan.planSha256}.json`;
          const admission = (await f.store.read(
            name,
          )) as import('../../src/ce/native-workflow').NativeWorkflowCheckpoint;
          if (!admission.replacement?.networkInventory) throw Error('missing frozen inventory');
          if (fault === 'rewritten-inventory')
            admission.replacement.networkInventory.nodes['1'].nics['0'].privateIp = '10.0.2.98';
          else Object.assign(admission.replacement, { unauthorized: true });
          await f.store.write(name, admission);
        }
        if (['missing-vm', 'unavailable-vm', 'malformed-vm'].includes(fault)) {
          const originalExec = f.networkApi.exec;
          f.networkApi.exec = async (command, args, options) => {
            if (args[0] === 'vm' && args[1] === 'show' && args.includes(selected.id))
              return fault === 'malformed-vm'
                ? { exitCode: 0, stdout: '{broken', stderr: '' }
                : {
                    exitCode: 1,
                    stdout: '',
                    stderr: JSON.stringify({
                      error: { code: fault === 'missing-vm' ? 'ResourceNotFound' : 'AuthorizationFailed' },
                    }),
                  };
            return originalExec(command, args, options);
          };
        }
        const events = [...f.events],
          before = await storeSnapshot(f.store);
        await expect(f.apply()).rejects.toThrow();
        expect(f.events).toEqual(events);
        expect(await storeSnapshot(f.store)).toEqual(before);
      } finally {
        if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
        else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
        await f.close();
      }
    });

for (const fault of ['unjournaled-absence', 'unavailable-absence', 'malformed-absence'] as const)
  test(`public native network replacement rejects ${fault} at deletion recovery`, async () => {
    const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
    process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
    const f = await publicFixture(false);
    try {
      await f.apply();
      const plan = await f.planNetworkReplacement(),
        remove = plan.actions.find((row) => row.kind === 'vm-delete');
      if (!remove) throw Error('missing delete');
      if (fault === 'unjournaled-absence') f.losePending(remove.id);
      else f.loseAfter(remove.id);
      await expect(f.apply()).rejects.toThrow(/lost.*checkpoint/);
      const selectedId = remove.resourceId,
        originalExec = f.networkApi.exec;
      if (fault === 'unjournaled-absence') {
        const checkpoint = await loadCheckpoint(f.session(), plan);
        if (!checkpoint) throw Error('missing replacement checkpoint');
        checkpoint.pendingAction = undefined;
        await saveCheckpoint(f.session(), plan, checkpoint);
        await originalExec('az', remove.args as string[]);
      } else
        f.networkApi.exec = async (command, args, options) => {
          if (args[0] === 'vm' && args[1] === 'show' && args.includes(selectedId as string))
            return {
              exitCode: 1,
              stdout: '',
              stderr:
                fault === 'malformed-absence' ? '{broken' : JSON.stringify({ error: { code: 'ServiceUnavailable' } }),
            };
          return originalExec(command, args, options);
        };
      const events = [...f.events];
      await expect(f.apply()).rejects.toThrow(/unqualified absence/);
      expect(f.events).toEqual(events);
    } finally {
      if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
      else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
      await f.close();
    }
  });

for (const ha of [false, true])
  test(`public native network replacement ${ha ? 'HA' : 'single'} retires exact network and replacement history`, async () => {
    const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
    process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
    const f = await publicFixture(ha);
    try {
      await f.apply();
      await f.planNetworkReplacement();
      await f.apply();
      expect(await retireNetworkFixture(f)).toMatchObject({
        completeCleanup: true,
        parent: { status: 'native-deployment-artifacts-retired' },
      });
      expect(
        (await readdir(f.store.directory)).some((name) =>
          /^native-(?:network-history|replacement-history|source|action|admission)-/.test(name),
        ),
      ).toBe(false);
      expect(await retireNetworkFixture(f)).toMatchObject({ completeCleanup: true });
    } finally {
      if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
      else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
      await f.close();
    }
  });

for (const fault of [
  'missing-network',
  'history-digest',
  'frozen-inventory',
  'registered-uuid',
  'rewritten-network-final',
  'rewritten-replacement-final',
  'rewritten-source',
] as const)
  test(`public native network replacement retirement rejects ${fault} before historical artifact removal`, async () => {
    const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
    process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
    const f = await publicFixture(false);
    try {
      await f.apply();
      const network = f.plan,
        plan = await f.planNetworkReplacement();
      await f.apply();
      const admissionName = `native-admission-${plan.planSha256}.json`;
      const admission = (await f.store.read(
        admissionName,
      )) as import('../../src/ce/native-workflow').NativeWorkflowCheckpoint;
      if (!admission.replacement?.networkInventory) throw Error('missing frozen replacement metadata');
      if (fault === 'missing-network') await f.store.remove(azureNativeNetworkHistoryName(network));
      if (fault === 'history-digest') admission.replacement.networkHistorySha256 = 'a'.repeat(64);
      if (fault === 'frozen-inventory')
        admission.replacement.networkInventory.nodes['1'].nics['0'].privateIp = '10.0.2.98';
      if (fault === 'registered-uuid') admission.replacement.newVmId = '00000000-0000-4000-8000-000000000998';
      if (['history-digest', 'frozen-inventory', 'registered-uuid'].includes(fault))
        await f.store.write(admissionName, admission);
      if (fault === 'rewritten-network-final' || fault === 'rewritten-replacement-final') {
        const source = fault === 'rewritten-network-final' ? network : plan,
          action = source.actions.filter((row) => row.kind === 'health-gate').at(-1);
        if (!action) throw Error('missing source final health action');
        const name = `native-action-${source.planSha256}-${action.id}.json`,
          row = (await f.store.read(name)) as { evidence: { siteUid: string } };
        row.evidence.siteUid = 'foreign';
        await f.store.write(name, row);
      }
      if (fault === 'rewritten-source') {
        const altered = structuredClone(network);
        altered.siteName = 'foreign';
        await f.store.write(`native-source-${network.planSha256}.json`, altered);
      }
      const before = (await storeSnapshot(f.store)).filter((row) =>
        /^native-(?:source|action|network-history|replacement-history)-/.test(row.name),
      );
      await expect(retireNetworkFixture(f)).rejects.toThrow();
      const after = await storeSnapshot(f.store);
      for (const row of before) expect(after.find((value) => value.name === row.name)).toEqual(row);
    } finally {
      if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
      else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
      await f.close();
    }
  });

test('public native repeated network replacement retirement resumes after exact history removal', async () => {
  const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
  process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
  const f = await publicFixture(false);
  try {
    await f.apply();
    await f.replan(f.plan, true);
    await f.apply();
    await f.replan(f.plan, false);
    await f.apply();
    const name = azureNativeNetworkHistoryName(f.plan);
    await f.planNetworkReplacement();
    await f.apply();
    const controller = new AbortController();
    let interrupted = false;
    await expect(
      retireNetworkFixture(f, controller.signal, async () => {
        if (!interrupted && !(await readdir(f.store.directory)).includes(name)) {
          interrupted = true;
          controller.abort(Error('synthetic network replacement retirement interruption'));
        }
      }),
    ).rejects.toThrow('synthetic network replacement retirement interruption');
    expect(interrupted).toBe(true);
    const events = [...f.events];
    expect(await retireNetworkFixture(f)).toMatchObject({ completeCleanup: true });
    expect(f.events).toEqual(events);
    expect(
      (await readdir(f.store.directory)).some((row) =>
        /^native-(?:source|action|network-history|replacement-history)-/.test(row),
      ),
    ).toBe(false);
  } finally {
    if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
    else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
    await f.close();
  }
});

for (const ha of [false, true])
  test(`public native older replacement then network then ${ha ? 'HA' : 'single'} replacement retires qualified NIC bridge`, async () => {
    const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
    process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
    const f = await publicFixture(ha);
    try {
      await f.seedReplacement(ha ? 2 : 1);
      await f.apply();
      await f.replan(f.plan, true);
      await f.apply();
      await f.replan(f.plan, false);
      await f.apply();
      await f.planNetworkReplacement();
      await f.apply();
      expect(await retireNetworkFixture(f)).toMatchObject({ completeCleanup: true });
    } finally {
      if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
      else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
      await f.close();
    }
  });

for (const fault of ['prior-interface', 'missing-bridge', 'bridge-owner', 'bridge-uuid', 'bridge-lineage'] as const)
  test(`public native mixed replacement retirement rejects ${fault} before historical removal`, async () => {
    const priorEnv = process.env.XCSH_CE_HEADLESS_MUTATIONS;
    process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
    const f = await publicFixture(false);
    try {
      const older = await f.seedReplacement(1);
      await f.apply();
      const first = f.plan;
      await f.replan(f.plan, true);
      await f.apply();
      await f.replan(f.plan, false);
      await f.apply();
      await f.planNetworkReplacement();
      await f.apply();
      if (fault === 'prior-interface') {
        const name = `native-admission-${older.source.planSha256}.json`,
          admission = (await f.store.read(name)) as import('../../src/ce/native-workflow').NativeWorkflowCheckpoint;
        if (!admission.replacement?.retainedNics) throw Error('missing older generation NIC snapshot');
        const nic = admission.replacement.retainedNics['1:0'];
        nic.privateIp = `${nic.privateIp.split('.').slice(0, 3).join('.')}.99`;
        await f.store.write(name, admission);
      } else if (fault === 'missing-bridge') await f.store.remove(azureNativeNetworkHistoryName(first));
      else {
        const name = azureNativeNetworkHistoryName(first),
          history = (await f.store.read(name)) as AzureNativeNetworkHistory;
        if (!history.networkUpdate.source) throw Error('missing bridge source');
        if (fault === 'bridge-owner') history.networkUpdate.before.nodes['1'].ownerPlanSha256 = f.original.planSha256;
        if (fault === 'bridge-uuid')
          history.networkUpdate.before.nodes['1'].vmId = '00000000-0000-4000-8000-000000000998';
        if (fault === 'bridge-lineage') history.networkUpdate.source.generationPlanSha256s = [f.original.planSha256];
        await f.store.write(name, history);
      }
      const before = (await storeSnapshot(f.store)).filter((row) =>
        /^native-(?:source|action|network-history)-/.test(row.name),
      );
      await expect(retireNetworkFixture(f)).rejects.toThrow();
      const after = await storeSnapshot(f.store);
      for (const row of before) expect(after.find((value) => value.name === row.name)).toEqual(row);
    } finally {
      if (priorEnv === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
      else process.env.XCSH_CE_HEADLESS_MUTATIONS = priorEnv;
      await f.close();
    }
  });

for (const phase of ['single-nic', 'ha-second-node-nic', 'final-health'] as const)
  test(`public native incomplete network ${phase} cleanup preserves partial execution and retires exact owned staging`, async () => {
    const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
    process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
    const f = await publicFixture(phase === 'ha-second-node-nic');
    try {
      const action =
        phase === 'final-health'
          ? f.plan.actions.filter((row) => row.kind === 'health-gate').at(-1)
          : f.plan.actions.find((row) => row.kind === 'nic-update' && row.node === (phase === 'single-nic' ? 1 : 2));
      if (!action) throw Error('missing partial network boundary');
      f.loseAfter(action.id);
      await expect(f.apply()).rejects.toThrow(/lost completed checkpoint/);
      const checkpoint = await loadCheckpoint(f.session(), f.plan);
      expect(checkpoint?.state).toBe('partial');
      expect(checkpoint?.completedActionIds).not.toContain(action.id);
      await expect(f.store.read(azureNativeNetworkHistoryName(f.plan))).rejects.toMatchObject({ code: 'ENOENT' });
      const events = [...f.events];
      expect(await retireNetworkFixture(f)).toMatchObject({
        completeCleanup: true,
        parent: { status: 'native-deployment-artifacts-retired' },
      });
      expect(f.events.filter((event) => /^(?:start|deallocate|nic|mutation):/.test(event))).toEqual(
        events.filter((event) => /^(?:start|deallocate|nic|mutation):/.test(event)),
      );
      expect(
        (await readdir(f.store.directory)).some((name) =>
          /^native-(?:source|action|admission|network-history|network-checkpoint)-/.test(name),
        ),
      ).toBe(false);
      expect((await loadCheckpoint(f.session(), f.plan))?.state).toBe('partial');
      const retiredEvents = [...f.events];
      expect(await retireNetworkFixture(f)).toMatchObject({ completeCleanup: true });
      expect(f.events).toEqual(retiredEvents);
    } finally {
      if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
      else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
      await f.close();
    }
  });

for (const fault of [
  'missing-public-history',
  'foreign-owner',
  'checkpoint-digest',
  'missing-source',
  'foreign-site',
  'foreign-mac',
  'unbound-action-digest',
  'rewritten-action',
  'forged-completion',
  'filename-alias',
] as const)
  test(`public native interrupted network retirement rejects ${fault} before historical removal`, async () => {
    const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
    process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
    const f = await publicFixture(false);
    try {
      const { azureNativeNetworkCheckpointHistoryName } = await import(
        '../../src/ce/native-network-checkpoint-history'
      );
      const final = f.plan.actions.filter((row) => row.kind === 'health-gate').at(-1);
      if (!final) throw Error('missing final public action');
      f.loseAfter(final.id);
      await expect(f.apply()).rejects.toThrow(/lost completed checkpoint/);
      const names = (await readdir(f.store.directory)).filter((name) => name.startsWith('native-network-checkpoint-'));
      const rows = await Promise.all(
        names.map(async (name) => ({
          name,
          row: (await f.store.read(
            name,
          )) as import('../../src/ce/native-network-checkpoint-history').AzureNativeNetworkCheckpointHistory,
        })),
      );
      const partial = rows.find(({ row }) => row.checkpoint.state === 'partial');
      if (!partial) throw Error('missing actual interrupted public receipt');
      if (fault === 'missing-public-history') for (const name of names) await f.store.remove(name);
      else if (fault === 'rewritten-action') {
        const name = `native-action-${f.plan.planSha256}-${final.id}.json`,
          action = (await f.store.read(name)) as { evidence: { observedAt: string } };
        action.evidence.observedAt = '2020-01-01T00:00:00Z';
        await f.store.write(name, action);
      } else if (fault === 'filename-alias') {
        await f.store.remove(partial.name);
        await f.store.write(`native-network-checkpoint-${f.plan.planSha256}-${'f'.repeat(24)}.json`, partial.row);
      } else {
        const row = partial.row,
          network = row.checkpoint.networkUpdate;
        if (!network?.source) throw Error('missing original source');
        if (fault === 'foreign-owner') row.owner.account = 'example-foreign';
        if (fault === 'checkpoint-digest') row.checkpointSha256 = 'f'.repeat(64);
        if (fault === 'missing-source') delete network.source;
        else if (fault === 'foreign-site') network.source.siteUid = 'foreign';
        if (fault === 'foreign-mac') {
          network.before.nodes['1'].nics['0'].mac = '02:ff:00:00:00:01';
          network.current.nodes['1'].nics['0'].mac = '02:ff:00:00:00:01';
        }
        if (fault === 'unbound-action-digest') row.actionReceiptSha256ById[final.id] = 'f'.repeat(64);
        if (fault === 'forged-completion') {
          row.checkpoint.state = 'complete';
          row.checkpoint.completedActionIds = f.plan.actions.map((action) => action.id);
          delete row.checkpoint.failedActionId;
          delete row.checkpoint.pendingAction;
        }
        if (fault !== 'checkpoint-digest') row.checkpointSha256 = canonicalSha256(row.checkpoint);
        await f.store.remove(partial.name);
        await f.store.write(azureNativeNetworkCheckpointHistoryName(row), row);
      }
      const before = (await storeSnapshot(f.store)).filter((row) =>
        /^native-(?:source|action|network-history|network-checkpoint)-/.test(row.name),
      );
      await expect(retireNetworkFixture(f)).rejects.toThrow();
      const after = await storeSnapshot(f.store);
      for (const row of before) expect(after.find((value) => value.name === row.name)).toEqual(row);
    } finally {
      if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
      else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
      await f.close();
    }
  });

for (const phase of ['prior-network', 'prior-replacement', 'resumed-completion'] as const)
  test(`public native interrupted network ${phase} retains qualified lineage through cleanup`, async () => {
    const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
    process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
    const f = await publicFixture(false);
    try {
      if (phase === 'prior-network') {
        await f.apply();
        await f.replan(f.plan, true);
      }
      if (phase === 'prior-replacement') await f.seedReplacement(1);
      const final = f.plan.actions.filter((row) => row.kind === 'health-gate').at(-1);
      if (!final) throw Error('missing final public action');
      f.loseAfter(final.id);
      await expect(f.apply()).rejects.toThrow(/lost completed checkpoint/);
      if (phase === 'resumed-completion') expect((await f.apply()).checkpoint.state).toBe('complete');
      expect(await retireNetworkFixture(f)).toMatchObject({ completeCleanup: true });
      expect((await readdir(f.store.directory)).some((name) => name.startsWith('native-network-checkpoint-'))).toBe(
        false,
      );
    } finally {
      if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
      else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
      await f.close();
    }
  });

test('public native completed checkpoint forbids fallback to earlier interruption after complete history removal', async () => {
  const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
  process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
  const f = await publicFixture(false);
  try {
    const final = f.plan.actions.filter((row) => row.kind === 'health-gate').at(-1);
    if (!final) throw Error('missing final action');
    f.loseAfter(final.id);
    await expect(f.apply()).rejects.toThrow(/lost completed checkpoint/);
    expect((await f.apply()).checkpoint.state).toBe('complete');
    await f.store.remove(azureNativeNetworkHistoryName(f.plan));
    const before = (await storeSnapshot(f.store)).filter((row) =>
      /^native-(?:source|action|network-checkpoint)-/.test(row.name),
    );
    await expect(retireNetworkFixture(f)).rejects.toThrow('completed public execution lacks complete network history');
    const after = await storeSnapshot(f.store);
    for (const row of before) expect(after.find((value) => value.name === row.name)).toEqual(row);
  } finally {
    if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
    else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
    await f.close();
  }
});

test('public native interrupted network retirement resumes after exact public checkpoint removal', async () => {
  const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
  process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
  const f = await publicFixture(false);
  try {
    const final = f.plan.actions.filter((row) => row.kind === 'health-gate').at(-1);
    if (!final) throw Error('missing final action');
    f.loseAfter(final.id);
    await expect(f.apply()).rejects.toThrow(/lost completed checkpoint/);
    const name = (await readdir(f.store.directory)).find((name) => name.startsWith('native-network-checkpoint-'));
    if (!name) throw Error('missing public checkpoint history');
    const controller = new AbortController();
    let interrupted = false;
    await expect(
      retireNetworkFixture(f, controller.signal, async () => {
        if (!interrupted && !(await readdir(f.store.directory)).includes(name)) {
          interrupted = true;
          controller.abort(Error('synthetic interruption after public checkpoint removal'));
        }
      }),
    ).rejects.toThrow('synthetic interruption after public checkpoint removal');
    expect(interrupted).toBe(true);
    const events = [...f.events];
    expect(await retireNetworkFixture(f)).toMatchObject({ completeCleanup: true });
    expect(f.events).toEqual(events);
    expect((await readdir(f.store.directory)).some((name) => name.startsWith('native-network-checkpoint-'))).toBe(
      false,
    );
  } finally {
    if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
    else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
    await f.close();
  }
});

for (const ha of [false, true])
  test(`public native post-network successive ${ha ? 'HA' : 'single'} replacements retain completed generation identity`, async () => {
    const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
    process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
    const f = await publicFixture(ha);
    try {
      await f.apply();
      await f.planNetworkReplacement(1, true);
      expect((await f.apply()).checkpoint.state).toBe('complete');
      const first = f.plan;
      const firstAdmission = (await f.store.read(
        `native-admission-${first.planSha256}.json`,
      )) as import('../../src/ce/native-workflow').NativeWorkflowCheckpoint;
      if (!firstAdmission.replacement?.newVmId) throw Error('missing completed first replacement');
      await f.planNetworkReplacement(ha ? 2 : 1, true);
      expect(f.plan.planSha256).not.toBe(first.planSha256);
      expect((await f.apply()).checkpoint.state).toBe('complete');
      const secondAdmission = (await f.store.read(
        `native-admission-${f.plan.planSha256}.json`,
      )) as import('../../src/ce/native-workflow').NativeWorkflowCheckpoint;
      if (!secondAdmission.replacement) throw Error('missing second generation');
      expect(secondAdmission.replacement.oldVmIds[`${f.plan.deploymentName}-1`]).toBe(
        firstAdmission.replacement.newVmId,
      );
      expect(secondAdmission.replacement.ownerPlanSha256ByNode[`${f.plan.deploymentName}-1`]).toBe(first.planSha256);
      expect(secondAdmission.replacement.retainedNics).toEqual(firstAdmission.replacement.retainedNics);
      expect(f.events.filter((event) => event.startsWith('mutation:delete:'))).toHaveLength(2);
      expect(f.events.filter((event) => event.startsWith('mutation:create:'))).toHaveLength(2);
      expect(await retireNetworkFixture(f)).toMatchObject({ completeCleanup: true });
    } finally {
      if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
      else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
      await f.close();
    }
  });

for (const ha of [false, true])
  test(`public native post-network ${ha ? 'HA' : 'single'} replacement then network update joins current generation`, async () => {
    const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
    process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
    const f = await publicFixture(ha);
    try {
      await f.apply();
      await f.planNetworkReplacement(ha ? 2 : 1, true);
      expect((await f.apply()).checkpoint.state).toBe('complete');
      const replacement = f.plan;
      const admission = (await f.store.read(
        `native-admission-${replacement.planSha256}.json`,
      )) as import('../../src/ce/native-workflow').NativeWorkflowCheckpoint;
      if (!admission.replacement?.newVmId) throw Error('missing registered replacement UUID');
      await f.replan(replacement, true, true);
      const result = await f.apply();
      expect(result.checkpoint.state).toBe('complete');
      const before = result.checkpoint.networkUpdate?.before.nodes[String(replacement.intent.replacementNode)];
      expect(before?.vmId).toBe(admission.replacement.newVmId);
      expect(before?.ownerPlanSha256).toBe(replacement.planSha256);
      expect(await retireNetworkFixture(f)).toMatchObject({ completeCleanup: true });
    } finally {
      if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
      else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
      await f.close();
    }
  });

for (const fault of ['live-admission', 'orphan-completion'] as const)
  test(`public native completed network generation rejects ${fault} before further mutation or historical removal`, async () => {
    const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
    process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
    const f = await publicFixture(false);
    try {
      await f.apply();
      await f.planNetworkReplacement(1, true);
      await f.apply();
      const first = f.plan;
      if (fault === 'live-admission') {
        const name = `native-admission-${first.planSha256}.json`;
        const admission = (await f.store.read(name)) as import('../../src/ce/native-workflow').NativeWorkflowCheckpoint;
        if (!admission.replacement) throw Error('missing registered generation');
        admission.replacement.networkHistorySha256 = 'f'.repeat(64);
        await f.store.write(name, admission);
        await f.planNetworkReplacement(1, true);
        const before = await storeSnapshot(f.store),
          events = [...f.events];
        await expect(f.apply()).rejects.toThrow();
        expect(await storeSnapshot(f.store)).toEqual(before);
        expect(f.events).toEqual(events);
      } else {
        const receipt = await f.store.read(`native-network-generation-${first.planSha256}.json`);
        await f.store.write(`native-network-generation-${'f'.repeat(64)}.json`, receipt);
        const before = (await storeSnapshot(f.store)).filter((row) =>
          /native-(?:source|action|network|replacement-history)-/.test(row.name),
        );
        await expect(retireNetworkFixture(f)).rejects.toThrow();
        const after = await storeSnapshot(f.store);
        for (const row of before) expect(after.find((value) => value.name === row.name)).toEqual(row);
      }
    } finally {
      if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
      else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
      await f.close();
    }
  });

for (const phase of ['successor-replacement', 'network-after-generation'] as const)
  for (const fault of [
    'missing-completion',
    'foreign-owner',
    'checkpoint-digest',
    'missing-history',
    'history-digest',
    'health-digest',
    'partial-public',
    'wrong-uuid',
    'changed-nic',
    'missing-source',
    'foreign-live-vm',
    'unavailable-live-vm',
  ] as const)
    test(`public native generation ${phase} rejects ${fault} without staging or mutation`, async () => {
      const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
      process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
      const f = await publicFixture(false);
      try {
        await f.apply();
        await f.planNetworkReplacement(1, true);
        await f.apply();
        const first = f.plan;
        const completionName = `native-network-generation-${first.planSha256}.json`;
        const historyName = `native-replacement-history-${first.planSha256}.json`;
        if (phase === 'successor-replacement') await f.planNetworkReplacement(1, true);
        else await f.replan(first, true, true);
        if (fault === 'missing-completion') await f.store.remove(completionName);
        else if (fault === 'missing-history') await f.store.remove(historyName);
        else if (fault === 'missing-source') await f.store.remove(`native-source-${first.planSha256}.json`);
        else if (fault === 'partial-public') {
          const checkpoint = await loadCheckpoint(f.session(), first);
          if (!checkpoint) throw Error('missing saved completion');
          await saveCheckpoint(f.session(), first, {
            ...checkpoint,
            state: 'partial',
            completedActionIds: checkpoint.completedActionIds.slice(0, -1),
            failedActionId: checkpoint.completedActionIds.at(-1),
          });
        } else if (fault === 'foreign-live-vm') f.vms[0].tags['xcsh-plan-sha256'] = 'f'.repeat(64);
        else if (fault === 'unavailable-live-vm') {
          const exec = f.networkApi.exec.bind(f.networkApi);
          f.networkApi.exec = async (command, args, options) =>
            args[0] === 'vm' && ['show', 'list'].includes(args[1])
              ? { exitCode: 1, stdout: '', stderr: JSON.stringify({ error: { code: 'AuthorizationFailed' } }) }
              : exec(command, args, options);
        } else {
          const completion = (await f.store.read(completionName)) as {
            owner: { account: string };
            checkpointSha256: string;
            replacementHistorySha256: string;
            finalConfigurationSha256: string;
          };
          if (fault === 'foreign-owner') completion.owner.account = 'example-foreign';
          if (fault === 'checkpoint-digest') completion.checkpointSha256 = 'f'.repeat(64);
          if (fault === 'history-digest') completion.replacementHistorySha256 = 'f'.repeat(64);
          if (fault === 'health-digest') completion.finalConfigurationSha256 = 'f'.repeat(64);
          if (fault === 'wrong-uuid' || fault === 'changed-nic') {
            const history = (await f.store.read(historyName)) as {
              replacement: NonNullable<import('../../src/ce/native-workflow').NativeWorkflowCheckpoint['replacement']>;
            };
            if (fault === 'wrong-uuid') history.replacement.newVmId = '00000000-0000-4000-8000-000000000999';
            else {
              if (!history.replacement.retainedNics || !history.replacement.networkInventory)
                throw Error('missing exact NIC boundary');
              history.replacement.retainedNics['1:1'].mac = '02:ff:00:00:00:01';
              history.replacement.networkInventory.nodes['1'].nics['1'].mac = '02:ff:00:00:00:01';
            }
            completion.replacementHistorySha256 = canonicalSha256(history);
            await f.store.write(historyName, history);
          }
          await f.store.write(completionName, completion);
        }
        const before = await storeSnapshot(f.store),
          events = [...f.events];
        await expect(f.apply()).rejects.toThrow();
        expect(await storeSnapshot(f.store)).toEqual(before);
        expect(f.events).toEqual(events);
      } finally {
        if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
        else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
        await f.close();
      }
    });

for (const kind of ['vm-delete', 'vm-create'] as const)
  for (const pending of [false, true])
    test(`public native successor network generation resumes lost ${pending ? 'pending' : 'completed'} ${kind} write exactly once`, async () => {
      const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
      process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
      const f = await publicFixture(false);
      try {
        await f.apply();
        await f.planNetworkReplacement(1, true);
        await f.apply();
        const first = f.plan;
        await f.planNetworkReplacement(1, true);
        const selected = f.plan.actions.find((action) => action.kind === kind);
        if (!selected) throw Error('missing selected generation action');
        if (pending) f.losePending(selected.id);
        else f.loseAfter(selected.id);
        await expect(f.apply()).rejects.toThrow(/lost (pending|completed) checkpoint/);
        expect((await f.apply()).checkpoint.state).toBe('complete');
        expect(f.events.filter((event) => event.startsWith('mutation:delete:'))).toHaveLength(2);
        expect(f.events.filter((event) => event.startsWith('mutation:create:'))).toHaveLength(2);
        const firstAdmission = (await f.store.read(
          `native-admission-${first.planSha256}.json`,
        )) as import('../../src/ce/native-workflow').NativeWorkflowCheckpoint;
        const current = (await f.store.read(
          `native-admission-${f.plan.planSha256}.json`,
        )) as import('../../src/ce/native-workflow').NativeWorkflowCheckpoint;
        expect(current.replacement?.newVmId).not.toBe(firstAdmission.replacement?.newVmId);
        expect(current.replacement?.oldVmIds[f.nodes[0]]).toBe(firstAdmission.replacement?.newVmId);
        const events = [...f.events];
        expect((await f.apply()).checkpoint.state).toBe('complete');
        expect(f.events).toEqual(events);
        expect(await retireNetworkFixture(f)).toMatchObject({ completeCleanup: true });
      } finally {
        if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
        else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
        await f.close();
      }
    });

test('public native generation completion persistence resumes without repeating cloud or bootstrap work', async () => {
  const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
  process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
  const f = await publicFixture(false);
  try {
    await f.apply();
    await f.planNetworkReplacement(1, true);
    const write = f.store.write.bind(f.store);
    let lost = false;
    f.store.write = async (name, value) => {
      if (!lost && name.startsWith('native-network-generation-')) {
        lost = true;
        throw Error('synthetic lost generation completion persistence');
      }
      await write(name, value);
    };
    await expect(f.apply()).rejects.toThrow(/lost generation completion persistence/);
    expect((await loadCheckpoint(f.session(), f.plan))?.state).toBe('complete');
    const events = [...f.events];
    expect((await f.apply()).checkpoint.state).toBe('complete');
    expect(f.events).toEqual(events);
    const completion = await f.store.read(`native-network-generation-${f.plan.planSha256}.json`);
    expect(JSON.stringify(completion)).not.toContain('synthetic.payload.signature');
    expect(JSON.stringify(completion)).not.toContain('#cloud-config');
    expect(await retireNetworkFixture(f)).toMatchObject({ completeCleanup: true });
  } finally {
    if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
    else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
    await f.close();
  }
});

for (const phase of ['nic-update', 'health-gate'] as const)
  test(`public native network after completed generation retires interrupted ${phase} while preserving its partial checkpoint`, async () => {
    const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
    process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
    const f = await publicFixture(false);
    try {
      await f.apply();
      await f.planNetworkReplacement(1, true);
      await f.apply();
      await f.replan(f.plan, true, true);
      const action = f.plan.actions.filter((row) => row.kind === phase).at(-1);
      if (!action) throw Error('missing interrupted network boundary');
      f.loseAfter(action.id);
      await expect(f.apply()).rejects.toThrow(/lost completed checkpoint/);
      expect((await loadCheckpoint(f.session(), f.plan))?.state).toBe('partial');
      const events = [...f.events];
      expect(await retireNetworkFixture(f)).toMatchObject({ completeCleanup: true });
      expect(f.events.filter((event) => /^(?:mutation|nic|start|deallocate):/.test(event))).toEqual(
        events.filter((event) => /^(?:mutation|nic|start|deallocate):/.test(event)),
      );
      expect((await loadCheckpoint(f.session(), f.plan))?.state).toBe('partial');
    } finally {
      if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
      else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
      await f.close();
    }
  });

for (const ha of [false, true])
  test(`public native ${ha ? 'HA' : 'single'} multiple post-network generations and restored networks retire exact interleaved lineage`, async () => {
    const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
    process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
    const f = await publicFixture(ha);
    try {
      await f.apply();
      await f.planNetworkReplacement(1, true);
      await f.apply();
      await f.planNetworkReplacement(ha ? 2 : 1, true);
      await f.apply();
      await f.replan(f.plan, true, true);
      await f.apply();
      await f.planNetworkReplacement(ha ? 3 : 1, true);
      expect((await f.apply()).checkpoint.state).toBe('complete');
      expect(f.events.filter((event) => event.startsWith('mutation:create:'))).toHaveLength(3);
      expect(await retireNetworkFixture(f)).toMatchObject({ completeCleanup: true });
    } finally {
      if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
      else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
      await f.close();
    }
  });

test('public native registered successor with lost final checkpoint retires without fabricating public completion', async () => {
  const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
  process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
  const f = await publicFixture(false);
  try {
    await f.apply();
    await f.planNetworkReplacement(1, true);
    await f.apply();
    await f.planNetworkReplacement(1, true);
    const interruptedPlan = f.plan;
    const final = f.plan.actions.filter((row) => row.kind === 'health-gate').at(-1);
    if (!final) throw Error('missing final generation acceptance action');
    f.loseAfter(final.id);
    await expect(f.apply()).rejects.toThrow(/lost completed checkpoint/);
    expect((await loadCheckpoint(f.session(), interruptedPlan))?.state).toBe('partial');
    await expect(f.store.read(`native-network-generation-${interruptedPlan.planSha256}.json`)).rejects.toMatchObject({
      code: 'ENOENT',
    });
    const events = [...f.events];
    expect(await retireNetworkFixture(f)).toMatchObject({ completeCleanup: true });
    expect(f.events.filter((event) => /^(?:mutation|nic|start|deallocate):/.test(event))).toEqual(
      events.filter((event) => /^(?:mutation|nic|start|deallocate):/.test(event)),
    );
    expect((await loadCheckpoint(f.session(), interruptedPlan))?.state).toBe('partial');
  } finally {
    if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
    else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
    await f.close();
  }
});

test('public native interleaved generation retirement resumes after exact completion receipt removal', async () => {
  const prior = process.env.XCSH_CE_HEADLESS_MUTATIONS;
  process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
  const f = await publicFixture(false);
  try {
    await f.apply();
    await f.planNetworkReplacement(1, true);
    await f.apply();
    await f.replan(f.plan, true, true);
    await f.apply();
    await f.planNetworkReplacement(1, true);
    await f.apply();
    const name = `native-network-generation-${f.plan.planSha256}.json`;
    expect((await readdir(f.store.directory)).includes(name)).toBe(true);
    const controller = new AbortController();
    let interrupted = false;
    await expect(
      retireNetworkFixture(f, controller.signal, async () => {
        if (!interrupted && !(await readdir(f.store.directory)).includes(name)) {
          interrupted = true;
          controller.abort(Error('synthetic exact generation completion cleanup interruption'));
        }
      }),
    ).rejects.toThrow(/cleanup interruption/);
    expect(interrupted).toBe(true);
    const events = [...f.events];
    expect(await retireNetworkFixture(f)).toMatchObject({ completeCleanup: true });
    expect(f.events).toEqual(events);
    expect(
      (await readdir(f.store.directory)).some((name) =>
        /^native-(?:network|replacement-history|source|action|admission)-/.test(name),
      ),
    ).toBe(false);
  } finally {
    if (prior === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
    else process.env.XCSH_CE_HEADLESS_MUTATIONS = prior;
    await f.close();
  }
});
