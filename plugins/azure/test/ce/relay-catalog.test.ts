import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type TObject, Type } from '@sinclair/typebox';
import type { AzExecApi } from '../../src/az/exec';
import type { PluginInterface } from '../../src/az/types';
import { loadPlanArtifact, saveDiscoveryArtifact, savePlanArtifact, verifyAzureCePlan } from '../../src/ce/artifacts';
import { revalidateAzureAuxiliaryCatalogs } from '../../src/ce/auxiliary-catalog';
import { canonicalSha256 } from '../../src/ce/canonical';
import { prepareAzureNativeAdmission } from '../../src/ce/native-workflow';
import { compileAzureCePlan } from '../../src/ce/planner';
import { fingerprintCurrentObservation } from '../../src/ce/recovery';
import { resolveAzureRelayCatalog } from '../../src/ce/relay-catalog';
import { azureRelayPlanForDeployment, compileAzureRelayDeploymentPlan } from '../../src/ce/relay-deployment-plan';
import type { AzureRelaySelection } from '../../src/ce/relay-plan';
import { azureRelayOwnershipTags, compileAzureRelayPlan, verifyAzureRelayPlan } from '../../src/ce/relay-plan';
import { compileAzureRelayReplacementPlan } from '../../src/ce/relay-replacement-plan';
import { configureAzureSelectedRelayRouting, requireAzureCeRoutingContract } from '../../src/ce/relay-routing-dispatch';

// Dispatch-only doubles test evidence persistence; full producer schemas are exercised in their own suites.
type RelayDispatchDrivers = NonNullable<Parameters<typeof configureAzureSelectedRelayRouting>[6]>;

import { renderAzureTerraformFoundation } from '../../src/ce/terraform-foundation';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { runAzureTerraformAdmission } from '../../src/ce/terraform-workflow';
import type { AzureCePlan } from '../../src/ce/types';
import {
  azureWorkloadSelection,
  compileAzureWorkloadDeploymentPlan,
  resolveAzureWorkloadCatalog,
} from '../../src/ce/workload-plan';
import { createAzureCePlanTool } from '../../src/tools/azure-ce-plan';
import { observation as baseObservation, intent } from './fixtures';

// Relay tests need capacity for CE, workload and both relay VMs.
const observation = structuredClone(baseObservation);
observation.regions[0].quotaAvailable = 64;

const source = compileAzureCePlan(
  { ...intent, routing: { mode: 'route-server', destinationCidrs: ['10.250.0.10/32'], localAsn: 65010 } },
  observation,
);
const selected = {
  vmSize: 'Standard_D8s_v5',
  hostImage: { publisher: 'canonical', offer: 'ubuntu-24_04-lts', sku: 'server', version: '24.04.202610010' },
  frr: { version: '10.4.1', image: `quay.io/frrouting/frr@sha256:${'a'.repeat(64)}` },
  relays: [
    { asn: 65001, privateAddress: '10.20.0.20' },
    { asn: 65002, privateAddress: '10.20.0.21' },
  ],
  vipPrefixes: ['10.250.0.10/32'],
  returnPrefixes: ['10.30.0.0/24'],
  docker: { version: '29.9.2', sha256: 'd'.repeat(64) },
};
function fixture() {
  const { publisher, offer, sku, version } = selected.hostImage;
  const image = {
    id: `/subscriptions/${source.subscription.id}/providers/Microsoft.Compute/locations/${source.region}/publishers/${publisher}/artifacttypes/vmimage/offers/${offer}/skus/${sku}/versions/${version}`,
    osDiskImage: { operatingSystem: 'Linux' },
    architecture: 'x64',
  };
  const skus = [
    {
      name: selected.vmSize,
      resourceType: 'virtualMachines',
      locations: [source.region],
      locationInfo: [{ location: source.region, zones: ['1'] }],
      restrictions: [] as Array<{ type: string; values: string[] }>,
      capabilities: [
        { name: 'CpuArchitectureType', value: 'x64' },
        { name: 'MaxNetworkInterfaces', value: '2' },
        { name: 'vCPUs', value: '8' },
        { name: 'MemoryGB', value: '32' },
      ],
    },
  ];
  const account = { id: source.subscription.id, tenantId: source.subscription.tenantId, environmentName: 'AzureCloud' };
  const calls: string[][] = [];
  const api: AzExecApi = {
    async exec(command, args) {
      expect(command).toBe('az');
      expect(args).toContain('--subscription');
      expect(args[args.indexOf('--subscription') + 1]).toBe(source.subscription.id);
      calls.push(args);
      return {
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify(args[0] === 'account' ? account : args.includes('image') ? image : skus),
      };
    },
  };
  return { image, skus, account, api, calls };
}

test('resolves the exact existing Linux host image and eligible regional size via three scoped Azure reads', async () => {
  const f = fixture();
  const catalog = await resolveAzureRelayCatalog(source, selected, f.api);
  expect(catalog.region).toBe(source.region);
  expect(catalog.image.id).toBe(f.image.id);
  expect(catalog.image.urn).toBe(Object.values(selected.hostImage).join(':'));
  expect(catalog.vmSizes).toHaveLength(1);
  expect(catalog.vmSizes[0]).toMatchObject({
    name: selected.vmSize,
    maxNics: 2,
    vCpus: 8,
    memoryGb: 32,
    restricted: false,
  });
  expect(catalog.provenance.sourcePlanSha256).toBe(source.planSha256);
  expect(catalog.provenance.method).toBe('azure-cli-live');
  expect(catalog.provenance.reads).toHaveLength(3);
  expect(f.calls.every((args) => !args.includes('create') && !args.includes('update') && !args.includes('terms'))).toBe(
    true,
  );
  expect(compileAzureRelayPlan(source, selected, catalog).hostImage.urn).toBe(catalog.image.urn);
});

test('rejects mismatched account, image, region, ambiguous SKU and malformed/partial observations', async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => {
      f.account.id = 'foreign';
    },
    (f: ReturnType<typeof fixture>) => {
      f.account.tenantId = 'example-foreign';
    },
    (f: ReturnType<typeof fixture>) => {
      f.account.environmentName = 'AzureChinaCloud';
    },
    (f: ReturnType<typeof fixture>) => {
      f.image.id += '-foreign';
    },
    (f: ReturnType<typeof fixture>) => {
      f.image.osDiskImage.operatingSystem = 'Windows';
    },
    (f: ReturnType<typeof fixture>) => {
      f.skus.push(structuredClone(f.skus[0]));
    },
    (f: ReturnType<typeof fixture>) => {
      f.skus[0].locationInfo[0].location = 'foreign-region';
    },
    (f: ReturnType<typeof fixture>) => {
      f.skus[0].capabilities = [];
    },
  ]) {
    const f = fixture();
    mutate(f);
    await expect(resolveAzureRelayCatalog(source, selected, f.api)).rejects.toThrow();
  }
  for (const stdout of ['null', '{}', 'malformed'])
    await expect(
      resolveAzureRelayCatalog(source, selected, {
        async exec() {
          return { exitCode: 0, stderr: '', stdout };
        },
      }),
    ).rejects.toThrow();
  await expect(
    resolveAzureRelayCatalog(source, selected, {
      async exec() {
        return { exitCode: 1, stderr: 'unavailable', stdout: '{}' };
      },
    }),
  ).rejects.toThrow();
});

test('unresolved selection and cancellation reject without starting a cloud read', async () => {
  const f = fixture();
  await expect(
    resolveAzureRelayCatalog(source, { ...selected, hostImage: { ...selected.hostImage, version: 'latest' } }, f.api),
  ).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
  const abort = new AbortController();
  abort.abort();
  await expect(resolveAzureRelayCatalog(source, selected, f.api, abort.signal)).rejects.toThrow();
  expect(f.calls).toHaveLength(0);
});

test('catalog rejects regional restrictions, ambiguous capabilities, duplicate regions and partial lists', async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => {
      f.skus[0].locations = ['foreign'];
    },
    (f: ReturnType<typeof fixture>) => {
      f.skus[0].locationInfo.push(structuredClone(f.skus[0].locationInfo[0]));
    },
    (f: ReturnType<typeof fixture>) => {
      f.skus[0].capabilities.push(structuredClone(f.skus[0].capabilities[0]));
    },
    (f: ReturnType<typeof fixture>) => {
      f.skus[0].capabilities[1].value = 'NaN';
    },
    (f: ReturnType<typeof fixture>) => {
      f.skus[0].capabilities[1].value = '0';
    },
    (f: ReturnType<typeof fixture>) => {
      f.skus[0].locationInfo[0].zones = ['1', '1'];
    },
  ]) {
    const f = fixture();
    mutate(f);
    await expect(resolveAzureRelayCatalog(source, selected, f.api)).rejects.toThrow();
  }
  for (const restrictions of [
    [{ type: 'Location', values: [source.region] }],
    [{ type: 'Location', restrictionInfo: { locations: [source.region] } }],
    [{ type: 'Location' }],
    [{ type: 'unknown' }],
  ]) {
    const f = fixture();
    const api: AzExecApi = {
      async exec(command, args, options) {
        const raw = await f.api.exec(command, args, options);
        if (args.includes('list-skus')) raw.stdout = JSON.stringify([{ ...f.skus[0], restrictions }]);
        return raw;
      },
    };
    await expect(resolveAzureRelayCatalog(source, selected, api)).rejects.toThrow();
  }
  const f = fixture();
  await expect(
    resolveAzureRelayCatalog(source, selected, {
      async exec(command, args, options) {
        const raw = await f.api.exec(command, args, options);
        if (args.includes('list-skus')) raw.stdout = JSON.stringify({ value: f.skus, nextLink: 'next' });
        return raw;
      },
    }),
  ).rejects.toThrow();
});

test('catalog receipts bind each exact query and response while caller cancellation bounds an uncooperative API', async () => {
  const f = fixture();
  const catalog = await resolveAzureRelayCatalog(source, selected, f.api);
  for (const [index, receipt] of catalog.provenance.reads.entries()) {
    expect(receipt.args).toEqual(f.calls[index]);
    expect(receipt.responseSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Number.isFinite(Date.parse(receipt.observedAt))).toBe(true);
  }
  const controller = new AbortController();
  let calls = 0;
  const pending = resolveAzureRelayCatalog(
    source,
    selected,
    {
      async exec() {
        calls++;
        return new Promise(() => {});
      },
    },
    controller.signal,
  );
  controller.abort(new Error('catalog caller cancelled'));
  await expect(pending).rejects.toThrow('catalog caller cancelled');
  expect(calls).toBe(1);
});

test('missing or mismatched image/SKU architecture rejects before a container can be paired with a host', async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => {
      f.image.architecture = 'Arm64';
    },
    (f: ReturnType<typeof fixture>) => {
      f.skus[0].capabilities[0].value = 'Arm64';
    },
    (f: ReturnType<typeof fixture>) => {
      f.skus[0].capabilities = f.skus[0].capabilities.filter((capability) => capability.name !== 'CpuArchitectureType');
    },
  ]) {
    const f = fixture();
    mutate(f);
    await expect(resolveAzureRelayCatalog(source, selected, f.api)).rejects.toThrow();
  }
});

async function publicPlanningSession() {
  const root = await mkdtemp(join(tmpdir(), 'relay-public-plan-'));
  const paths = new Map<string, string>();
  const saved: string[] = [];
  const session = {
    getSessionId: () => root,
    getArtifactsDir: () => root,
    async saveArtifact(content: string, kind: string) {
      const id = String(paths.size + 1);
      const path = join(root, `${id}.${kind}.log`);
      await writeFile(path, content, { mode: 0o600 });
      paths.set(id, path);
      saved.push(kind);
      return id;
    },
    async getArtifactPath(id: string) {
      return paths.get(id) ?? null;
    },
  };
  return { root, paths, saved, session };
}

test('public relay planning collects scoped catalog receipts and persists the exact final plan for both engines/topologies', async () => {
  for (const engine of ['native', 'terraform'] as const)
    for (const ha of [false, true]) {
      const f = fixture();
      const state = await publicPlanningSession();
      try {
        const observed = structuredClone(observation);
        observed.regions[0].quotaAvailable = 64;
        const discoveryArtifactId = await saveDiscoveryArtifact(state.session, observed);
        if (!discoveryArtifactId) throw Error('discovery not saved');
        const tool = createAzureCePlanTool({ typebox: { Type } } as unknown as PluginInterface, (cwd) => {
          expect(cwd).toBe(state.root);
          return f.api;
        });
        expect((tool.parameters as TObject).properties.relay.additionalProperties).toBe(false);
        expect((tool.parameters as TObject).properties.relay.properties).not.toHaveProperty('catalog');
        const result = await tool.execute(
          'plan',
          {
            discoveryArtifactId,
            intent: { ...intent, engine, topology: { ha }, routing: source.intent.routing },
            relay: structuredClone(selected),
          },
          undefined,
          undefined,
          { cwd: state.root, sessionManager: state.session },
        );
        expect(result.isError).not.toBe(true);
        if (!('plan' in result.details) || !result.details.plan || !result.details.artifactId)
          throw Error('plan missing');
        const plan = result.details.plan;
        expect(f.calls).toHaveLength(3);
        expect(plan.engine).toBe(engine);
        expect(plan.topology.nodeCount).toBe(ha ? 3 : 1);
        expect(plan.relayProfile?.catalog.provenance.reads).toHaveLength(3);
        expect(plan.relayProfile?.catalog.provenance.sourcePlanSha256).toBe(
          plan.relayProfile?.foundationPlan.planSha256,
        );
        expect(plan.actions.filter((row) => row.kind === 'relay-provision')).toHaveLength(1);
        expect(plan.actions.some((row) => row.kind === 'route-server-peer-create')).toBe(false);
        expect(azureRelayPlanForDeployment(plan).relays).toHaveLength(2);
        const loaded = await loadPlanArtifact(state.session, plan.planId, plan.planSha256);
        expect(loaded.plan).toEqual(plan);
        const path = await state.session.getArtifactPath(result.details.artifactId);
        if (!path) throw Error('saved plan unavailable');
        expect(JSON.parse(await readFile(path, 'utf8')).plan).toEqual(plan);
        expect(state.saved).toEqual(['azure-ce-discovery', 'azure-ce-plan']);
      } finally {
        await rm(state.root, { recursive: true, force: true });
      }
    }
});

test('public relay planner refuses supplied catalog receipts, failed catalog identities and cancellation before saving a plan', async () => {
  for (const mode of ['forged-catalog', 'foreign-image', 'cancelled', 'unresolved-image']) {
    const f = fixture();
    const state = await publicPlanningSession();
    try {
      const discoveryArtifactId = await saveDiscoveryArtifact(state.session, observation);
      if (!discoveryArtifactId) throw Error('discovery not saved');
      const selection = structuredClone(selected);
      if (mode === 'foreign-image') f.image.id += '-foreign';
      if (mode === 'unresolved-image') selection.hostImage.version = 'latest';
      if (mode === 'forged-catalog')
        Object.assign(selection, { catalog: { provenance: { method: 'azure-cli-live' } } });
      const abort = new AbortController();
      if (mode === 'cancelled') abort.abort(Error('cancel public plan'));
      const tool = createAzureCePlanTool({ typebox: { Type } } as unknown as PluginInterface, () => f.api);
      const result = await tool.execute(
        'plan',
        { discoveryArtifactId, intent: source.intent, relay: selection as AzureRelaySelection },
        abort.signal,
        undefined,
        { cwd: state.root, sessionManager: state.session },
      );
      expect(result.isError).toBe(true);
      expect(state.saved).toEqual(['azure-ce-discovery']);
      if (mode !== 'foreign-image') expect(f.calls).toHaveLength(0);
    } finally {
      await rm(state.root, { recursive: true, force: true });
    }
  }
});

test('public non-relay planning preserves its discovery-only plan without extra catalog reads', async () => {
  const state = await publicPlanningSession();
  try {
    const discoveryArtifactId = await saveDiscoveryArtifact(state.session, observation);
    if (!discoveryArtifactId) throw Error('discovery not saved');
    const tool = createAzureCePlanTool({ typebox: { Type } } as unknown as PluginInterface, () => {
      throw Error('unexpected catalog');
    });
    const result = await tool.execute('plan', { discoveryArtifactId, intent }, undefined, undefined, {
      sessionManager: state.session,
    });
    expect(result.isError).not.toBe(true);
    if (!('plan' in result.details) || !result.details.plan) throw Error('plan missing');
    expect(result.details.plan.relayProfile).toBeUndefined();
    expect(result.details.plan).toEqual(compileAzureCePlan(intent, observation));
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

function workloadFixture() {
  const observed = structuredClone(observation);
  observed.regions[0].quotaAvailable = 64;
  const input = {
    ...intent,
    engine: 'terraform' as const,
    routing: { mode: 'route-server' as const, destinationCidrs: ['10.253.0.0/24'], localAsn: 65010 },
    workloadFixture: {
      imageVersion: '22.04.202610010',
      subnetName: 'workload',
      cidr: '10.253.0.0/24',
      privateIp: '10.253.0.4',
      port: 8080,
    },
  };
  const source = compileAzureCePlan(input, observed);
  const f = fixture();
  const selection = azureWorkloadSelection(source);
  const image = selection.hostImage;
  f.image.id = `/subscriptions/${source.subscription.id}/providers/Microsoft.Compute/locations/${source.region}/publishers/${image.publisher}/artifacttypes/vmimage/offers/${image.offer}/skus/${image.sku}/versions/${image.version}`;
  f.skus[0].name = selection.vmSize;
  f.skus[0].capabilities[2].value = '1';
  f.skus[0].capabilities[3].value = '1';
  return { ...f, source, input, observed };
}

test('workload execution binds an exact Ubuntu image and eligible Standard_B1s SKU rather than latest', async () => {
  const f = workloadFixture();
  expect(() => renderAzureTerraformFoundation(f.source)).toThrow('collected exact image');
  const catalog = await resolveAzureWorkloadCatalog(f.source, f.api);
  const plan = compileAzureWorkloadDeploymentPlan(f.source, catalog);
  verifyAzureCePlan(plan);
  expect(f.calls).toHaveLength(3);
  expect(plan.workloadProfile?.catalog.provenance.sourcePlanSha256).toBe(f.source.planSha256);
  const config = JSON.parse(renderAzureTerraformFoundation(plan));
  expect(config.resource.azurerm_linux_virtual_machine.workload.source_image_reference).toEqual(
    azureWorkloadSelection(plan).hostImage,
  );
  expect(config.resource.azurerm_linux_virtual_machine.workload.size).toBe('Standard_B1s');
  expect(JSON.stringify(config.resource.azurerm_linux_virtual_machine.workload)).not.toContain('latest');
  for (const mutate of [
    (value: typeof catalog) => {
      value.image.id += '-foreign';
    },
    (value: typeof catalog) => {
      value.provenance.reads[1].args[3] = 'foreign:latest';
    },
    (value: typeof catalog) => {
      value.vmSizes[0].restricted = true;
    },
    (value: typeof catalog) => {
      value.vmSizes[0].vCpus = 8;
    },
    (value: typeof catalog) => {
      value.provenance.sourcePlanSha256 = 'a'.repeat(64);
    },
  ]) {
    const edited = structuredClone(catalog);
    mutate(edited);
    expect(() => compileAzureWorkloadDeploymentPlan(f.source, edited)).toThrow();
  }
  const foreign = structuredClone(plan);
  if (!foreign.intent.workloadFixture) throw Error('workload fixture missing');
  foreign.intent.workloadFixture.imageVersion = '22.04.202611010';
  const { planId: _id, planSha256: _sha, ...draft } = foreign;
  foreign.planSha256 = canonicalSha256(draft);
  foreign.planId = `azure-ce-${foreign.planSha256.slice(0, 24)}`;
  expect(() => verifyAzureCePlan(foreign)).toThrow('execution graph');
  for (const imageVersion of ['latest', 'unresolved', '22.04'])
    expect(() =>
      compileAzureCePlan({ ...f.input, workloadFixture: { ...f.input.workloadFixture, imageVersion } }, f.observed),
    ).toThrow('exact Ubuntu');
});

test('public workload planning collects and persists exact image/SKU receipts and rejects unavailable catalogs before saving', async () => {
  for (const mode of ['complete', 'wrong-image', 'restricted', 'unavailable'] as const) {
    const f = workloadFixture();
    const state = await publicPlanningSession();
    try {
      if (mode === 'wrong-image') f.image.id += '-foreign';
      if (mode === 'restricted') f.skus[0].restrictions = [{ type: 'Location', values: [f.source.region] }];
      const api: AzExecApi =
        mode === 'unavailable'
          ? {
              async exec() {
                return { exitCode: 1, stdout: '', stderr: 'unavailable' };
              },
            }
          : f.api;
      const tool = createAzureCePlanTool({ typebox: { Type } } as unknown as PluginInterface, () => api);
      const discoveryArtifactId = await saveDiscoveryArtifact(state.session, f.observed);
      if (!discoveryArtifactId) throw Error('discovery missing');
      const result = await tool.execute('plan', { discoveryArtifactId, intent: f.input }, undefined, undefined, {
        cwd: state.root,
        sessionManager: state.session,
      });
      if (mode === 'complete') {
        expect(result.isError).not.toBe(true);
        if (!('plan' in result.details) || !result.details.plan) throw Error('plan missing');
        const persisted = await loadPlanArtifact(
          state.session,
          result.details.plan.planId,
          result.details.plan.planSha256,
        );
        expect(persisted.plan).toEqual(result.details.plan);
        expect(f.calls).toHaveLength(3);
        expect(persisted.plan.workloadProfile?.catalog.image.urn).toContain('22.04.202610010');
      } else {
        expect(result.isError).toBe(true);
        expect(state.saved).toEqual(['azure-ce-discovery']);
      }
    } finally {
      await rm(state.root, { recursive: true, force: true });
    }
  }
});

test('combined public workload and relay planning preserves both catalog bindings through saved-plan execution', async () => {
  const workload = workloadFixture();
  const relay = fixture();
  const calls: string[][] = [];
  const api: AzExecApi = {
    async exec(command, args, options) {
      calls.push(args);
      const isWorkload =
        args.includes(azureWorkloadSelection(workload.source).vmSize) ||
        args.includes(Object.values(azureWorkloadSelection(workload.source).hostImage).join(':'));
      return (isWorkload ? workload.api : relay.api).exec(command, args, options);
    },
  };
  const state = await publicPlanningSession();
  try {
    const discoveryArtifactId = await saveDiscoveryArtifact(state.session, workload.observed);
    if (!discoveryArtifactId) throw Error('discovery missing');
    const tool = createAzureCePlanTool({ typebox: { Type } } as unknown as PluginInterface, () => api);
    const result = await tool.execute(
      'plan',
      { discoveryArtifactId, intent: workload.input, relay: selected },
      undefined,
      undefined,
      { cwd: state.root, sessionManager: state.session },
    );
    expect(result.isError).not.toBe(true);
    if (!('plan' in result.details) || !result.details.plan) throw Error('plan missing');
    const plan = result.details.plan;
    verifyAzureCePlan(plan);
    const foundation = plan.relayProfile?.foundationPlan;
    expect(foundation?.workloadProfile).toEqual(plan.workloadProfile);
    expect(plan.relayProfile?.catalog.provenance.sourcePlanSha256).toBe(foundation?.planSha256);
    expect(plan.workloadProfile?.catalog.provenance.sourcePlanSha256).toBe(workload.source.planSha256);
    expect(calls).toHaveLength(6);
    const persisted = await loadPlanArtifact(state.session, plan.planId, plan.planSha256);
    const config = JSON.parse(renderAzureTerraformFoundation(persisted.plan));
    expect(config.resource.azurerm_linux_virtual_machine.workload.source_image_reference).toEqual(
      azureWorkloadSelection(workload.source).hostImage,
    );
    expect(azureRelayPlanForDeployment(persisted.plan).hostImage.urn).toBe(Object.values(selected.hostImage).join(':'));
    const foreign = structuredClone(plan);
    if (!foreign.workloadProfile) throw Error('workload profile missing');
    foreign.workloadProfile.catalog.image.id += '-foreign';
    const { planId: _id, planSha256: _sha, ...draft } = foreign;
    foreign.planSha256 = canonicalSha256(draft);
    foreign.planId = `azure-ce-${foreign.planSha256.slice(0, 24)}`;
    expect(() => verifyAzureCePlan(foreign)).toThrow('execution graph');
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

test('workload cancellation and incomplete provenance reject without saving an executable public plan', async () => {
  const f = workloadFixture();
  const controller = new AbortController();
  controller.abort(Error('workload plan cancelled'));
  await expect(resolveAzureWorkloadCatalog(f.source, f.api, controller.signal)).rejects.toThrow(
    'workload plan cancelled',
  );
  expect(f.calls).toHaveLength(0);
  const state = await publicPlanningSession();
  try {
    const discoveryArtifactId = await saveDiscoveryArtifact(state.session, f.observed);
    if (!discoveryArtifactId) throw Error('discovery missing');
    let calls = 0;
    const pendingController = new AbortController();
    const tool = createAzureCePlanTool({ typebox: { Type } } as unknown as PluginInterface, () => ({
      async exec() {
        calls++;
        pendingController.abort(Error('cancel pending workload read'));
        return new Promise(() => {});
      },
    }));
    const result = await tool.execute(
      'plan',
      { discoveryArtifactId, intent: f.input },
      pendingController.signal,
      undefined,
      { cwd: state.root, sessionManager: state.session },
    );
    expect(result.isError).toBe(true);
    expect(calls).toBe(1);
    expect(state.saved).toEqual(['azure-ce-discovery']);
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
  const catalog = await resolveAzureWorkloadCatalog(f.source, f.api);
  for (const mutate of [
    (value: typeof catalog) => {
      value.provenance.reads.pop();
    },
    (value: typeof catalog) => {
      value.provenance.reads[0].responseSha256 = 'malformed';
    },
    (value: typeof catalog) => {
      value.provenance.observedAt = 'malformed';
    },
    (value: typeof catalog) => {
      value.provenance.reads[0].observedAt = '2999-01-01T00:00:00Z';
    },
  ]) {
    const invalid = structuredClone(catalog);
    mutate(invalid);
    expect(() => compileAzureWorkloadDeploymentPlan(f.source, invalid)).toThrow('provenance');
  }
  const profiled = compileAzureWorkloadDeploymentPlan(f.source, catalog);
  expect(() => compileAzureWorkloadDeploymentPlan(profiled, catalog)).toThrow('unprofiled');
  const relayCatalog = await resolveAzureRelayCatalog(profiled, selected, fixture().api);
  const combined = compileAzureRelayDeploymentPlan(profiled, selected, relayCatalog);
  expect(() => compileAzureWorkloadDeploymentPlan(combined, catalog)).toThrow('unprofiled');
});

test('validated relay admission selects the ordinary contract for each engine and preserves the direct guard', async () => {
  for (const engine of ['native', 'terraform'] as const) {
    const foundation = compileAzureCePlan({ ...source.intent, engine }, observation);
    const catalog = await resolveAzureRelayCatalog(foundation, selected, fixture().api);
    const plan = compileAzureRelayDeploymentPlan(foundation, selected, catalog);
    const calls: string[] = [];
    const runtime = {
      engine,
      requireRoutingContract() {
        calls.push('direct');
        throw Error('direct multihop unqualified');
      },
      requireAzureRelayRoutingContract() {
        calls.push('relay');
      },
      requireBootstrapContract() {
        calls.push('bootstrap');
      },
      async reserveSite() {
        calls.push('reserve');
      },
    };
    requireAzureCeRoutingContract(plan, runtime);
    expect(calls).toEqual(['relay']);
    expect(() => requireAzureCeRoutingContract(foundation, runtime)).toThrow('direct multihop');
    const foreign = structuredClone(plan);
    if (!foreign.relayProfile) throw Error('relay missing');
    foreign.relayProfile.catalog.provenance.sourcePlanSha256 = 'f'.repeat(64);
    const { planId: _id, planSha256: _sha, ...draft } = foreign;
    foreign.planSha256 = canonicalSha256(draft);
    foreign.planId = `azure-ce-${foreign.planSha256.slice(0, 24)}`;
    const before = calls.length;
    expect(() => requireAzureCeRoutingContract(foreign, runtime)).toThrow('provenance');
    expect(calls).toHaveLength(before);
    if (engine === 'native') {
      const storage = {
        async verify() {
          calls.push('verify');
        },
        async read() {
          throw Object.assign(Error('absent'), { code: 'ENOENT' });
        },
        async write() {
          calls.push('write');
        },
      };
      await prepareAzureNativeAdmission(plan, runtime, storage);
      expect(calls.filter((call) => call === 'direct')).toHaveLength(1);
      expect(calls).toContain('reserve');
    }
  }
});

test('selected relay dispatch persists configuration and current observations without promoting unknown routing', async () => {
  const catalog = await resolveAzureRelayCatalog(source, selected, fixture().api);
  const plan = compileAzureRelayDeploymentPlan(source, selected, catalog);
  const calls: string[] = [];
  const configuration = {
    status: 'configured',
    routing: 'unknown',
    traffic: 'unknown',
    ceSampleFreshnessQualified: false,
  };
  const observed = {
    status: 'observed',
    routing: 'unknown',
    ceRouteScope: 'unqualified',
    freshness: 'unqualified',
    traffic: 'unknown',
    ceSampleFreshnessQualified: false,
  };
  const drivers = {
    async configure(actual: unknown) {
      expect(actual).toEqual(plan);
      calls.push('configure');
      return configuration;
    },
    async observe(actual: unknown) {
      expect(actual).toEqual(plan);
      calls.push('observe');
      return observed;
    },
  } as unknown as RelayDispatchDrivers;
  const runtime = {
    engine: plan.engine,
    requireAzureRelayRoutingContract() {
      calls.push('contract');
    },
    async observeOwnedSite() {
      throw Error('injected driver must handle observation');
    },
    async observeAzureInterfaces() {
      throw Error('injected driver must handle interfaces');
    },
    async observeBgpSessions() {
      throw Error('unexpected default driver');
    },
    async observeBgpRoutes() {
      throw Error('unexpected default driver');
    },
    async ensureAzureRelayRouting() {
      throw Error('injected driver must handle routing');
    },
  };
  const stored: Array<{ name: string; record: unknown }> = [];
  const storage = {
    owner: azureUpgradeBinding(plan).owner,
    async read() {
      throw Error('injected driver must handle reads');
    },
    async verify() {
      calls.push('verify');
    },
    async write(name: string, record: unknown) {
      stored.push({ name, record });
    },
  };
  const evidence = await configureAzureSelectedRelayRouting(
    plan,
    [],
    runtime,
    storage,
    fixture().api,
    undefined,
    drivers,
  );
  expect(calls).toEqual(['contract', 'verify', 'configure', 'observe', 'verify']);
  expect(stored.map((item) => item.name)).toEqual([
    'relay-routing-configuration.json',
    'relay-routing-observation.json',
  ]);
  expect(evidence).toMatchObject({
    status: 'unknown',
    configuration,
    observation: observed,
    routing: 'unknown',
    traffic: 'unknown',
    ceSampleFreshnessQualified: false,
  });
  calls.length = 0;
  const cancellation = new AbortController();
  cancellation.abort(Error('cancel relay dispatch'));
  await expect(
    configureAzureSelectedRelayRouting(plan, [], runtime, storage, fixture().api, cancellation.signal, drivers),
  ).rejects.toThrow('cancel relay dispatch');
  expect(calls).toHaveLength(0);
  await expect(
    configureAzureSelectedRelayRouting(source, [], runtime, storage, fixture().api, undefined, drivers),
  ).rejects.toThrow('not selected');
  expect(calls).toHaveLength(0);
});

test('relay dispatch refuses foreign engines and retains configured evidence when readback fails', async () => {
  const catalog = await resolveAzureRelayCatalog(source, selected, fixture().api);
  const plan = compileAzureRelayDeploymentPlan(source, selected, catalog);
  const stored: string[] = [];
  let configurations = 0;
  const runtime = {
    engine: plan.engine,
    requireAzureRelayRoutingContract() {},
    async observeOwnedSite() {
      throw Error('unexpected default driver');
    },
    async observeAzureInterfaces() {
      throw Error('unexpected default driver');
    },
    async observeBgpSessions() {
      throw Error('unexpected default driver');
    },
    async observeBgpRoutes() {
      throw Error('unexpected default driver');
    },
    async ensureAzureRelayRouting() {
      throw Error('unexpected default driver');
    },
  };
  const storage = {
    owner: azureUpgradeBinding(plan).owner,
    async read() {
      throw Error('injected driver must handle reads');
    },
    async verify() {},
    async write(name: string) {
      stored.push(name);
    },
  };
  const drivers = {
    async configure() {
      configurations++;
      return { status: 'configured', routing: 'unknown', traffic: 'unknown', ceSampleFreshnessQualified: false };
    },
    async observe() {
      throw Error('current CE route observation unavailable');
    },
  } as unknown as RelayDispatchDrivers;
  await expect(
    configureAzureSelectedRelayRouting(
      plan,
      [],
      { ...runtime, engine: 'terraform' },
      storage,
      fixture().api,
      undefined,
      drivers,
    ),
  ).rejects.toThrow('engine differs');
  expect(configurations).toBe(0);
  expect(stored).toHaveLength(0);
  await expect(
    configureAzureSelectedRelayRouting(plan, [], runtime, storage, fixture().api, undefined, drivers),
  ).rejects.toThrow('observation unavailable');
  expect(configurations).toBe(1);
  expect(stored).toEqual(['relay-routing-configuration.json']);
});

test('execution revalidates the saved workload and relay catalog through fresh scoped reads', async () => {
  const workload = workloadFixture();
  const relay = fixture();
  const workloadCatalog = await resolveAzureWorkloadCatalog(workload.source, workload.api);
  const workloadPlan = compileAzureWorkloadDeploymentPlan(workload.source, workloadCatalog);
  const relayCatalog = await resolveAzureRelayCatalog(workloadPlan, selected, relay.api);
  const combined = compileAzureRelayDeploymentPlan(workloadPlan, selected, relayCatalog);
  let reads = 0;
  const api: AzExecApi = {
    async exec(command, args, options) {
      reads++;
      const workloadRead =
        args.includes('Standard_B1s') ||
        args.includes(Object.values(azureWorkloadSelection(combined).hostImage).join(':'));
      return (workloadRead ? workload.api : relay.api).exec(command, args, options);
    },
  };
  const evidence = await revalidateAzureAuxiliaryCatalogs(combined, api);
  expect(reads).toBe(6);
  expect(evidence.map((row) => row.kind)).toEqual(['workload', 'relay']);
  expect(evidence.every((row) => row.catalog.provenance.sourcePlanSha256 === combined.planSha256)).toBe(true);
  expect(evidence.every((row) => row.catalog.provenance.reads.length === 3)).toBe(true);
  workload.skus[0].capabilities[3].value = '2';
  await expect(revalidateAzureAuxiliaryCatalogs(combined, api)).rejects.toThrow('saved workload catalog');
  workload.skus[0].capabilities[3].value = '1';
  relay.skus[0].restrictions = [{ type: 'Location', values: [combined.region] }];
  await expect(revalidateAzureAuxiliaryCatalogs(combined, api)).rejects.toThrow();
  const abort = new AbortController();
  abort.abort(Error('cancel auxiliary preflight'));
  const before = reads;
  await expect(revalidateAzureAuxiliaryCatalogs(combined, api, abort.signal)).rejects.toThrow(
    'cancel auxiliary preflight',
  );
  expect(reads).toBe(before);
  expect(await revalidateAzureAuxiliaryCatalogs(source, api)).toEqual([]);
  expect(reads).toBe(before);
});

test('Terraform admission rejects changed auxiliary catalogs before reservation, bootstrap or runner access', async () => {
  const workload = workloadFixture();
  const profiled = compileAzureWorkloadDeploymentPlan(
    workload.source,
    await resolveAzureWorkloadCatalog(workload.source, workload.api),
  );
  const relay = fixture();
  const plan = compileAzureRelayDeploymentPlan(
    profiled,
    selected,
    await resolveAzureRelayCatalog(profiled, selected, relay.api),
  );
  workload.skus[0].capabilities[3].value = '2';
  let runnerCalls = 0;
  let reservations = 0;
  let bootstrap = 0;
  let writes = 0;
  const runtime = {
    engine: 'terraform',
    requireBootstrapContract() {},
    requireAzureRelayRoutingContract() {},
    requireRoutingContract() {
      throw Error('unexpected direct contract');
    },
    async reserveSite() {
      reservations++;
    },
    async bootstrap() {
      bootstrap++;
    },
  };
  const storage = {
    async verify() {},
    async write() {
      writes++;
    },
  };
  const terraform = {
    async open() {
      runnerCalls++;
      throw Error('runner must not open');
    },
  };
  await expect(
    runAzureTerraformAdmission(
      plan,
      terraform,
      runtime as unknown as Parameters<typeof runAzureTerraformAdmission>[2],
      storage as unknown as Parameters<typeof runAzureTerraformAdmission>[3],
      workload.api,
      async () => {},
      {},
    ),
  ).rejects.toThrow('saved workload catalog');
  expect({ runnerCalls, reservations, bootstrap, writes }).toEqual({
    runnerCalls: 0,
    reservations: 0,
    bootstrap: 0,
    writes: 0,
  });
});

test('final relay planning requires quota for the entire CE and relay cohort', async () => {
  const observed = structuredClone(observation);
  observed.regions[0].quotaAvailable = 32;
  const foundation = compileAzureCePlan({ ...source.intent, topology: { ha: true } }, observed);
  const catalog = await resolveAzureRelayCatalog(foundation, selected, fixture().api);
  expect(() => compileAzureRelayDeploymentPlan(foundation, selected, catalog)).toThrow('relay quota');
  observed.regions[0].quotaAvailable = 40;
  const qualified = compileAzureCePlan({ ...source.intent, topology: { ha: true } }, observed);
  expect(() =>
    compileAzureRelayDeploymentPlan(qualified, selected, {
      ...catalog,
      provenance: { ...catalog.provenance, sourcePlanSha256: qualified.planSha256 },
    }),
  ).not.toThrow();
});

test('execution quota recovery credits only exact current owned relay VMs once', async () => {
  const f = fixture();
  const catalog = await resolveAzureRelayCatalog(source, selected, f.api);
  const plan = compileAzureRelayDeploymentPlan(source, selected, catalog);
  const relayPlan = azureRelayPlanForDeployment(plan);
  const current = structuredClone(observation);
  const tags = {
    'xcsh-managed-by': 'azure-ce',
    'xcsh-execution-engine': plan.engine,
    'xcsh-deployment-id': plan.deploymentName,
    'xcsh-plan-sha256': plan.planSha256,
  };
  const vm = plan.actions.find((action) => action.kind === 'vm-create');
  if (!vm?.resourceId) throw Error('CE VM missing');
  current.resources = [
    { id: vm.resourceId, exists: true, owned: true, tags, state: {} },
    ...relayPlan.relays.map((relay) => ({
      id: relay.vmId,
      exists: true,
      owned: true,
      tags: { ...tags, 'xcsh-relay-plan-sha256': relayPlan.planSha256 },
      state: {},
    })),
  ];
  current.regions[0].quotaAvailable -= 24;
  current.regions[0].eligible = false;
  current.regions[0].reasons = ['quota'];
  expect(fingerprintCurrentObservation(plan, current)).toBe(plan.observationFingerprint);
  for (const mutate of [
    (value: typeof current) => {
      value.resources[1].tags['xcsh-relay-plan-sha256'] = 'f'.repeat(64);
    },
    (value: typeof current) => {
      value.resources[1].tags['xcsh-plan-sha256'] = 'f'.repeat(64);
    },
    (value: typeof current) => {
      value.resources[1].tags['xcsh-execution-engine'] = 'terraform';
    },
    (value: typeof current) => {
      value.resources[1].id += '-foreign';
    },
    (value: typeof current) => {
      value.resources.push(structuredClone(value.resources[1]));
    },
    (value: typeof current) => {
      value.resources[1].owned = false;
    },
    (value: typeof current) => {
      value.resources[1].exists = false;
    },
  ]) {
    const invalid = structuredClone(current);
    mutate(invalid);
    expect(fingerprintCurrentObservation(plan, invalid)).not.toBe(plan.observationFingerprint);
  }
});

test('combined workload and relay plans include the pinned workload vCPU at the exact quota boundary', async () => {
  const f = workloadFixture();
  const observed = structuredClone(observation);
  observed.regions[0].quotaAvailable = 24;
  const source = compileAzureCePlan(f.source.intent, observed);
  expect(source.computeCapacity).toEqual({ ceVcpus: 8, workloadVcpus: 1, quotaAvailable: 24 });
  const workload = compileAzureWorkloadDeploymentPlan(source, await resolveAzureWorkloadCatalog(source, f.api));
  const catalog = await resolveAzureRelayCatalog(workload, selected, fixture().api);
  expect(() => compileAzureRelayDeploymentPlan(workload, selected, catalog)).toThrow('25 total vCPUs required');
  observed.regions[0].quotaAvailable = 25;
  const sufficient = compileAzureCePlan(f.source.intent, observed);
  const profiled = compileAzureWorkloadDeploymentPlan(sufficient, await resolveAzureWorkloadCatalog(sufficient, f.api));
  const relayCatalog = await resolveAzureRelayCatalog(profiled, selected, fixture().api);
  expect(() => compileAzureRelayDeploymentPlan(profiled, selected, relayCatalog)).not.toThrow();
});

function mustReplacementFixture<T>(value: T | undefined): T {
  if (value === undefined) throw Error('Required replacement fixture value is missing');
  return value;
}

async function replacementPlanningFixture(engine: 'native' | 'terraform', ha: boolean) {
  const f = fixture();
  const foundation = compileAzureCePlan(
    { ...intent, engine, topology: { ha }, routing: source.intent.routing },
    observation,
  );
  const catalog = await resolveAzureRelayCatalog(foundation, selected, f.api);
  const retained = compileAzureRelayDeploymentPlan(foundation, selected, catalog);
  const observed = structuredClone(observation);
  observed.resources = retained.ownershipInventory
    .filter((row) => row.owned)
    .map((row) => ({
      id: row.resourceId,
      location: retained.region,
      exists: true,
      owned: true,
      tags: {
        'xcsh-managed-by': 'azure-ce',
        'xcsh-execution-engine': engine,
        'xcsh-deployment-id': retained.deploymentName,
        'xcsh-plan-sha256': retained.planSha256,
      },
      state: {},
    }));
  const replacementIntent = { ...retained.intent, operation: 'replace-node' as const, replacementNode: ha ? 2 : 1 };
  return { retained, observed, replacementIntent, foundation: compileAzureCePlan(replacementIntent, observed) };
}

test('public relay replacement preserves exact creation graph and owners for both engines and topologies', async () => {
  for (const engine of ['native', 'terraform'] as const)
    for (const ha of [false, true]) {
      const f = await replacementPlanningFixture(engine, ha);
      const state = await publicPlanningSession();
      try {
        await savePlanArtifact(state.session, f.retained, observation);
        const discoveryArtifactId = await saveDiscoveryArtifact(state.session, f.observed);
        if (!discoveryArtifactId) throw Error('discovery missing');
        let cloudCalls = 0;
        const tool = createAzureCePlanTool({ typebox: { Type } } as unknown as PluginInterface, () => {
          cloudCalls++;
          throw Error('retained relay replacement must not recollect creation selectors');
        });
        const result = await tool.execute(
          'replace',
          {
            discoveryArtifactId,
            intent: f.replacementIntent,
            retainedDeployment: { planId: f.retained.planId, planSha256: f.retained.planSha256 },
          },
          undefined,
          undefined,
          { cwd: state.root, sessionManager: state.session },
        );
        expect(result.isError).not.toBe(true);
        if (!('plan' in result.details) || !result.details.plan) throw Error('replacement plan missing');
        const plan = result.details.plan;
        expect(cloudCalls).toBe(0);
        expect(plan.relayProfile?.schemaVersion).toBe(2);
        verifyAzureCePlan(plan);
        expect((await loadPlanArtifact(state.session, plan.planId, plan.planSha256)).plan).toEqual(plan);
        expect(azureRelayPlanForDeployment(plan)).toEqual(azureRelayPlanForDeployment(f.retained));
        verifyAzureRelayPlan(plan, azureRelayPlanForDeployment(plan));
        expect(azureRelayOwnershipTags(plan, azureRelayPlanForDeployment(plan))['xcsh-plan-sha256']).toBe(
          f.retained.planSha256,
        );
        expect(plan.actions.filter((row) => row.mutates).map((row) => row.kind)).toEqual(['vm-delete', 'vm-create']);
        expect(plan.actions.some((row) => row.kind.startsWith('relay-') || row.kind.startsWith('route-server-'))).toBe(
          false,
        );
        expect(plan.ownershipInventory.every((row) => row.action === 'reference')).toBe(true);
        expect(plan.billableResources).toEqual(f.retained.billableResources);
      } finally {
        await rm(state.root, { recursive: true, force: true });
      }
    }
});

test('relay replacement rejects missing, duplicate and foreign retained CE ownership before mutation', async () => {
  for (const mutate of [
    (o: typeof observation) => {
      o.resources = o.resources.filter((row) => !row.id.includes('virtualMachines/ce-demo-1'));
    },
    (o: typeof observation) => {
      o.resources.push(
        structuredClone(
          mustReplacementFixture(o.resources.find((row) => row.id.includes('virtualMachines/ce-demo-1'))),
        ),
      );
    },
    (o: typeof observation) => {
      mustReplacementFixture(o.resources.find((row) => row.id.includes('networkInterfaces/ce-demo-1'))).tags[
        'xcsh-plan-sha256'
      ] = 'f'.repeat(64);
    },
    (o: typeof observation) => {
      mustReplacementFixture(o.resources.find((row) => row.id.includes('virtualMachines/ce-demo-1'))).tags[
        'xcsh-execution-engine'
      ] = 'terraform';
    },
  ]) {
    const f = await replacementPlanningFixture('native', true);
    mutate(f.observed);
    expect(() => compileAzureRelayReplacementPlan(f.foundation, f.retained, f.observed)).toThrow();
  }
});

test('internally rehashed relay replacement cannot mutate selectors, owners, source or execution boundaries', async () => {
  const f = await replacementPlanningFixture('native', true);
  const plan = compileAzureRelayReplacementPlan(f.foundation, f.retained, f.observed);
  for (const mutate of [
    (p: typeof plan) => {
      mustReplacementFixture(p.relayProfile).selection.relays[0].asn++;
    },
    (p: typeof plan) => {
      if (p.relayProfile?.schemaVersion === 2)
        p.relayProfile.retainedResourceOwners[0].ownerPlanSha256 = 'f'.repeat(64);
    },
    (p: typeof plan) => {
      p.actions[0].node = 3;
    },
    (p: typeof plan) => {
      p.actions[0].resourceId += '-foreign';
    },
    (p: typeof plan) => {
      p.intent.engine = 'terraform';
      p.engine = 'terraform';
    },
    (p: typeof plan) => {
      p.ownershipInventory.pop();
    },
    (p: typeof plan) => {
      p.actions.push({ ...p.actions[0], id: '999', kind: 'relay-provision' });
    },
  ]) {
    const bad = structuredClone(plan);
    mutate(bad);
    const { planId: _id, planSha256: _sha, ...draft } = bad;
    bad.planSha256 = canonicalSha256(draft);
    bad.planId = `azure-ce-${bad.planSha256.slice(0, 24)}`;
    expect(() => verifyAzureCePlan(bad)).toThrow();
  }
});

test('public relay replacement rejects reselection and wrong retained plans without storing a candidate', async () => {
  const f = await replacementPlanningFixture('native', true);
  for (const bad of [
    {
      relay: structuredClone(selected),
      retainedDeployment: { planId: f.retained.planId, planSha256: f.retained.planSha256 },
    },
    { retainedDeployment: { planId: f.retained.planId, planSha256: 'f'.repeat(64) } },
    { retainedDeployment: { planId: f.retained.planId, planSha256: f.retained.planSha256, catalog: {} } },
  ]) {
    const state = await publicPlanningSession();
    try {
      await savePlanArtifact(state.session, f.retained, observation);
      const discoveryArtifactId = await saveDiscoveryArtifact(state.session, f.observed);
      if (!discoveryArtifactId) throw Error('discovery missing');
      const tool = createAzureCePlanTool({ typebox: { Type } } as unknown as PluginInterface, () => {
        throw Error('invalid replacement must not execute Azure');
      });
      const before = state.saved.length;
      const result = await tool.execute(
        'replace',
        { discoveryArtifactId, intent: f.replacementIntent, ...bad },
        undefined,
        undefined,
        { cwd: state.root, sessionManager: state.session },
      );
      expect(result.isError).toBe(true);
      expect(state.saved).toHaveLength(before);
    } finally {
      await rm(state.root, { recursive: true, force: true });
    }
  }
});

test('retained relay replacement rejects changed site, engine, network, image and fractional node identity', async () => {
  for (const mutate of [
    (p: typeof intent) => {
      p.siteName += '-foreign';
    },
    (p: typeof intent) => {
      p.engine = 'terraform';
    },
    (p: typeof intent) => {
      p.nics[0].subnet.cidr = '10.21.0.0/24';
    },
    (p: typeof intent) => {
      p.replacementNode = 1.5;
    },
  ]) {
    const f = await replacementPlanningFixture('native', true);
    mutate(f.replacementIntent);
    expect(() =>
      compileAzureRelayReplacementPlan(compileAzureCePlan(f.replacementIntent, f.observed), f.retained, f.observed),
    ).toThrow();
  }
  const f = await replacementPlanningFixture('native', true);
  f.observed.image.version = '2.0.0';
  f.observed.image.urn = 'f5-networks:f5xc-customer-edge:f5xc-ce:2.0.0';
  expect(() =>
    compileAzureRelayReplacementPlan(compileAzureCePlan(f.replacementIntent, f.observed), f.retained, f.observed),
  ).toThrow('pinned CE image');
});

test('public relay replacement chains preserve per-resource owners across selected nodes and repeated replacement', async () => {
  for (const engine of ['native', 'terraform'] as const) {
    const f = await replacementPlanningFixture(engine, true);
    const state = await publicPlanningSession();
    try {
      const original = f.retained;
      let retained: AzureCePlan = original;
      const observed = structuredClone(f.observed);
      await savePlanArtifact(state.session, original, observation);
      const tool = createAzureCePlanTool({ typebox: { Type } } as unknown as PluginInterface, () => {
        throw Error('retained replacement must not execute creation catalog requests');
      });
      for (const node of [2, 1, 2]) {
        const discoveryArtifactId = await saveDiscoveryArtifact(state.session, observed);
        if (!discoveryArtifactId) throw Error('discovery missing');
        const selectedVm = mustReplacementFixture(
          original.actions.find((action) => action.kind === 'vm-create' && action.node === node),
        );
        const selectedResource = mustReplacementFixture(
          observed.resources.find((row) => row.id === selectedVm.resourceId),
        );
        const beforeOwner = selectedResource.tags['xcsh-plan-sha256'];
        const result = await tool.execute(
          'replace',
          {
            discoveryArtifactId,
            intent: { ...retained.intent, operation: 'replace-node', replacementNode: node },
            retainedDeployment: { planId: retained.planId, planSha256: retained.planSha256 },
          },
          undefined,
          undefined,
          { cwd: state.root, sessionManager: state.session },
        );
        expect(result.isError).not.toBe(true);
        if (!('plan' in result.details) || !result.details.plan) throw Error('chained replacement plan missing');
        const plan = result.details.plan;
        verifyAzureCePlan(plan);
        expect(azureRelayPlanForDeployment(plan)).toEqual(azureRelayPlanForDeployment(original));
        expect(plan.actions.find((row) => row.kind === 'vm-delete')?.expectedOwnerPlanSha256).toBe(beforeOwner);
        if (plan.relayProfile?.schemaVersion !== 2) throw Error('replacement profile missing');
        for (const resource of observed.resources)
          expect(
            plan.relayProfile.retainedResourceOwners.find((row) => row.resourceId === resource.id)?.ownerPlanSha256,
          ).toBe(resource.tags['xcsh-plan-sha256']);
        selectedResource.tags['xcsh-plan-sha256'] = plan.planSha256;
        retained = plan;
      }
    } finally {
      await rm(state.root, { recursive: true, force: true });
    }
  }
});

test('relay catalog preserves architecture and canonical Hyper-V generations', async () => {
  const f = fixture();
  f.skus[0].capabilities.push({ name: 'HyperVGenerations', value: 'V2, V1' });
  const catalog = await resolveAzureRelayCatalog(source, selected, f.api);
  expect(catalog.vmSizes[0].architecture).toBe('x64');
  expect(catalog.vmSizes[0].hyperVGenerations).toEqual(['V1', 'V2']);
  expect(
    azureRelayPlanForDeployment(compileAzureRelayDeploymentPlan(source, selected, catalog)).catalog.vmSizes[0]
      .hyperVGenerations,
  ).toEqual(['V1', 'V2']);
});

test('relay catalog does not invent unknown or ambiguous Hyper-V support', async () => {
  for (const value of ['', 'V3', 'V1,V1']) {
    const f = fixture();
    f.skus[0].capabilities.push({ name: 'HyperVGenerations', value });
    const catalog = await resolveAzureRelayCatalog(source, selected, f.api);
    expect(catalog.vmSizes[0].architecture).toBe('x64');
    expect(catalog.vmSizes[0].hyperVGenerations).toBeUndefined();
  }
  const missing = await resolveAzureRelayCatalog(source, selected, fixture().api);
  expect(missing.vmSizes[0].hyperVGenerations).toBeUndefined();
  const duplicate = fixture();
  duplicate.skus[0].capabilities.push(
    { name: 'HyperVGenerations', value: 'V1' },
    { name: 'HyperVGenerations', value: 'V2' },
  );
  expect(
    (await resolveAzureRelayCatalog(source, selected, duplicate.api)).vmSizes[0].hyperVGenerations,
  ).toBeUndefined();
});
