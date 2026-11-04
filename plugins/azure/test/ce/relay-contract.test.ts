import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { chmod, mkdtemp, readdir, readFile, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import { acquireProcessLock } from '../../../platform/src/ce/process-lock';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { CePlatformService } from '../../../platform/src/ce/service';
import { storeBootstrapToken } from '../../../platform/src/ce/token-store';
import { buildAzureRelayRouting } from '../../../platform/src/ce/wire-routing';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import type { AzExecApi } from '../../src/az/exec';
import { loadCheckpoint, saveCheckpoint, savePlanArtifact, verifyAzureCePlan } from '../../src/ce/artifacts';
import { canonicalSha256 } from '../../src/ce/canonical';
import { azureFailoverOwner, buildAzureCeFailoverPlan } from '../../src/ce/failover';
import { persistAzureNativeActionEvidence, persistAzureNativeSource } from '../../src/ce/native-action-evidence';
import { buildAzureNativePendingAction, validateAzureNativePendingAction } from '../../src/ce/native-action-recovery';
import { retireAzureNativeBootstrapArtifacts } from '../../src/ce/native-bootstrap-retirement';
import { retireAzureNativeParentArtifacts } from '../../src/ce/native-parent-retirement';
import { compileAzureNativeTeardown, runAzureNativeTeardown } from '../../src/ce/native-teardown';
import { prepareAzureNativeUpgrade, runAzureNativeUpgrade } from '../../src/ce/native-upgrade';
import {
  type NativeWorkflowCheckpoint,
  prepareAzureNativeReplacement,
  validateAzureNativeAdmissionCheckpoint,
} from '../../src/ce/native-workflow';
import { compileAzureCePlan } from '../../src/ce/planner';
import { fingerprintCheckpointObservation } from '../../src/ce/recovery';
import {
  azureRelayHistoricalArtifacts,
  verifyAzureRelayHistoricalArtifacts,
} from '../../src/ce/relay-artifact-provenance';
import { renderAzureRelayCloudInit } from '../../src/ce/relay-cloud-init';
import { compileAzureRelayFrrConfig } from '../../src/ce/relay-config';
import { azureRelayCurrentIdentityContext } from '../../src/ce/relay-current-identity';
import { azureRelayPlanForDeployment, compileAzureRelayDeploymentPlan } from '../../src/ce/relay-deployment-plan';
import { collectAzureRelayFailoverAcceptance, requireAzureRelayFailoverScope } from '../../src/ce/relay-failover';
import {
  compileAzureRelayGuestActivation,
  compileAzureRelayGuestObservation,
  parseAzureRelayGuestReceipt,
} from '../../src/ce/relay-guest';
import { compileAzureRelayGuestFib, parseAzureRelayGuestFib } from '../../src/ce/relay-guest-fib';
import { compileAzureRelayGuestRoute, parseAzureRelayGuestRoute } from '../../src/ce/relay-guest-routes';
import { compileAzureRelayGuestSessions, parseAzureRelayGuestSessions } from '../../src/ce/relay-guest-sessions';
import { observeAzureRelayIdentity } from '../../src/ce/relay-identity';
import { compileAzureRelayNativeRequests } from '../../src/ce/relay-native';
import {
  ensureAzureRelayNativeResources,
  executeAzureRelayProvisionAction,
  inspectAzureRelayNativeResources,
} from '../../src/ce/relay-native-execution';
import { reconcileAzureNativeRelayProvision } from '../../src/ce/relay-native-recovery';
import { observeAzureRelayRoutingWorkflow } from '../../src/ce/relay-observation';
import { compileAzureRelayPlan, verifyAzureRelayPlan } from '../../src/ce/relay-plan';
import { captureAzureRelayRetainedNics, validAzureRelayRetainedNics } from '../../src/ce/relay-replacement-identity';
import {
  captureAzureReplacementRouteServerOwnership,
  compileAzureRelayReplacementPlan,
  validAzureReplacementRouteServerOwnership,
} from '../../src/ce/relay-replacement-plan';
import {
  assertAzureNativeRelayActive,
  observeAzureRelayRetirementAbsence,
  retireAzureNativeRelayKey,
} from '../../src/ce/relay-retirement';
import { observeAzureRelayRouteExchange, parseAzureRelayRouteExchange } from '../../src/ce/relay-route-evidence';
import { observeAzureRelayRouteServerIdentity } from '../../src/ce/relay-route-server';
import { configureAzureSelectedRelayRouting } from '../../src/ce/relay-routing-dispatch';
import { ensureAzureRelayRoutingWorkflow } from '../../src/ce/relay-workflow';
import { azureTerraformCurrentDeployment, renderAzureTerraformFoundation } from '../../src/ce/terraform-foundation';
import { retireAzureTerraformParentArtifacts } from '../../src/ce/terraform-parent-retirement';
import {
  azureTerraformReplacementPlanName,
  azureTerraformReplacementStages,
  runAzureTerraformReplacement,
  validateAzureTerraformReplacementCheckpoint,
  validateAzureTerraformReplacementSource,
  validateAzureTerraformReplacementStageHistory,
} from '../../src/ce/terraform-replacement';
import {
  isAzureTerraformReplacementHistoricalArtifact,
  verifyAzureTerraformReplacementHistoricalArtifacts,
} from '../../src/ce/terraform-replacement-artifact-provenance';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import {
  AZURE_CE_CHECKPOINT_SCHEMA_VERSION,
  type AzureCeCheckpoint,
  type AzureCeObservation,
  type AzureCePlan,
} from '../../src/ce/types';
import { executeAzureCeNativeApply } from '../../src/tools/azure-ce-apply';
import { createAzureCeFailoverTool } from '../../src/tools/azure-ce-failover';
import { intent, observation } from './fixtures';
import { createIngressHistoryFixture, ingressIntent } from './ingress-history-fixture';
import { nativeUpgradeTestContract, nativeUpgradeTestObservation } from './native-upgrade-fixture';
import { prepareRelayParentRetirement } from './relay-parent-retirement-fixture';

const unresolved = (name: string) => ['$', '{', name, '}'].join('');
const hostImage = { publisher: 'canonical', offer: 'ubuntu-24_04-lts', sku: 'server', version: '24.04.202610010' };
function fixture(engine: 'native' | 'terraform' = 'native', ha = false, dual = false, traffic = false) {
  const observed = structuredClone(observation);
  observed.regions[0].quotaAvailable = 64;
  const trafficIntent = structuredClone(intent);
  if (traffic) {
    const sourceVmResourceId =
      `/subscriptions/${intent.subscriptionId}/resourceGroups/rg-app/providers/Microsoft.Compute/virtualMachines/probe`.toLowerCase();
    trafficIntent.ingress = {
      mode: 'platform-http',
      port: 8080,
      listener: {
        name: 'ce-listener',
        namespace: 'system',
        domain: 'ce.example.invalid',
        privateAddress: '10.21.0.10',
        originPool: { name: 'ce-origin', namespace: 'system' },
      },
      probe: { sourceVmResourceId, path: '/healthz', expectedStatus: 200, expectedBodySha256: '4'.repeat(64) },
    };
    trafficIntent.brownfield.resourceIds = [sourceVmResourceId];
    observed.resources = [{ id: sourceVmResourceId, exists: true, owned: false, tags: {}, state: {} }];
  }
  const source = compileAzureCePlan(
    {
      ...trafficIntent,
      engine,
      topology: { ha },
      nics: dual
        ? [
            ...intent.nics,
            { name: 'sli', role: 'sli', subnet: { mode: 'greenfield', cidr: '10.21.0.0/24', name: 'sli' } },
          ]
        : intent.nics,
      routing: { mode: 'route-server', destinationCidrs: ['10.250.0.10/32'], localAsn: 65010 },
    },
    observed,
  );
  const selection = {
    vmSize: 'Standard_D8s_v5',
    hostImage,
    frr: { version: '10.4.1', image: `quay.io/frrouting/frr@sha256:${'a'.repeat(64)}` },
    relays: [
      { asn: 65001, privateAddress: '10.20.0.20' },
      { asn: 65002, privateAddress: '10.20.0.21' },
    ],
    vipPrefixes: ['10.250.0.10/32'],
    returnPrefixes: ['10.30.0.0/24'],
    docker: { version: '29.9.2', sha256: 'd'.repeat(64) },
  };
  const image = {
    id: `/subscriptions/${source.subscription.id}/providers/Microsoft.Compute/locations/${source.region}/publishers/${hostImage.publisher}/artifacttypes/vmimage/offers/${hostImage.offer}/skus/${hostImage.sku}/versions/${hostImage.version}`,
    urn: Object.values(hostImage).join(':'),
    osType: 'Linux' as const,
    architecture: 'amd64' as const,
  };
  const plan = compileAzureRelayPlan(source, selection, {
    region: source.region,
    image,
    vmSizes: observed.regions[0].vmSizes,
  });
  return { source, selection, image, observed, plan };
}

test('compiles deterministic two-relay plans with exact cloud identities, software and cost for both engines/topologies', () => {
  for (const engine of ['native', 'terraform'] as const)
    for (const ha of [false, true]) {
      const { source, selection, image, observed, plan } = fixture(engine, ha);
      expect(
        compileAzureRelayPlan(source, selection, {
          region: source.region,
          image,
          vmSizes: observed.regions[0].vmSizes,
        }),
      ).toEqual(plan);
      verifyAzureRelayPlan(source, plan);
      expect(plan.sourcePlanSha256).toBe(source.planSha256);
      expect(plan.engine).toBe(engine);
      expect(plan.relays).toHaveLength(2);
      expect(plan.expectedSessions).toBe((ha ? 3 : 1) * 2);
      expect(plan.payloadNetwork).toBe('slo');
      expect(new Set(plan.relays.map((r) => r.vmId)).size).toBe(2);
      for (const relay of plan.relays) {
        expect(relay.nicId).toContain('/providers/Microsoft.Network/networkInterfaces/');
        expect(relay.ipConfigurationId).toBe(`${relay.nicId}/ipConfigurations/ipconfig1`);
        expect(relay.subnetId).toBe(plan.sloSubnetId);
      }
      expect(plan.billableResources).toEqual([
        { type: 'relay-virtual-machine', count: 2 },
        { type: 'relay-os-disk', count: 2 },
        { type: 'relay-network-interface', count: 2 },
        { type: 'relay-public-ip', count: 2 },
      ]);
      expect(plan.hostImage.urn).toBe(image.urn);
      expect(plan.frr.image).toContain('@sha256:');
      expect(source.image).toEqual(observation.image);
    }
});

test('rejects missing, mutable or unresolved software/image/size inputs and foreign image observations', () => {
  const { source, selection, image, observed } = fixture();
  for (const changed of [
    { ...selection, vmSize: unresolved('size') },
    { ...selection, hostImage: { ...hostImage, version: 'latest' } },
    { ...selection, frr: { ...selection.frr, image: 'quay.io/frrouting/frr:latest' } },
    { ...selection, frr: { ...selection.frr, version: unresolved('version') } },
  ])
    expect(() =>
      compileAzureRelayPlan(source, changed, { region: source.region, image, vmSizes: observed.regions[0].vmSizes }),
    ).toThrow();
  for (const badImage of [
    { ...image, osType: 'Windows' },
    { ...image, id: image.id.replace(source.subscription.id, 'foreign') },
    { ...image, urn: image.urn.replace(hostImage.version, 'latest') },
  ])
    expect(() =>
      compileAzureRelayPlan(source, selection, {
        region: source.region,
        image: badImage as typeof image,
        vmSizes: observed.regions[0].vmSizes,
      }),
    ).toThrow();
  expect(() => compileAzureRelayPlan(source, selection, { region: source.region, image, vmSizes: [] })).toThrow();
});

test('rejects reserved/out-of-subnet/duplicate relay endpoints and implicit or broad VIP export policy', () => {
  const { source, selection, image, observed } = fixture();
  for (const address of ['10.20.0.0', '10.20.0.3', '10.20.0.255', '10.21.0.20', '127.0.0.1', unresolved('address')])
    expect(() =>
      compileAzureRelayPlan(
        source,
        { ...selection, relays: [{ ...selection.relays[0], privateAddress: address }, selection.relays[1]] },
        { region: source.region, image, vmSizes: observed.regions[0].vmSizes },
      ),
    ).toThrow();
  for (const asn of [0, 65515, 65535, 23456, 65010])
    expect(() =>
      compileAzureRelayPlan(
        source,
        { ...selection, relays: [{ ...selection.relays[0], asn }, selection.relays[1]] },
        { region: source.region, image, vmSizes: observed.regions[0].vmSizes },
      ),
    ).toThrow();
  expect(() =>
    compileAzureRelayPlan(
      source,
      { ...selection, relays: [selection.relays[0], selection.relays[0]] },
      { region: source.region, image, vmSizes: observed.regions[0].vmSizes },
    ),
  ).toThrow();
  for (const vipPrefixes of [[], ['0.0.0.0/0'], ['10.250.0.10/32', '10.250.0.10/32'], [unresolved('vip')]])
    expect(() =>
      compileAzureRelayPlan(
        source,
        { ...selection, vipPrefixes },
        { region: source.region, image, vmSizes: observed.regions[0].vmSizes },
      ),
    ).toThrow();
});

test('saved relay plan integrity and source binding reject edits before any cloud read', async () => {
  const { source, plan } = fixture();
  let calls = 0;
  const api: AzExecApi = {
    async exec() {
      calls++;
      throw Error('must not execute');
    },
  };
  for (const mutate of [
    (p: typeof plan) => {
      p.relays[0].nicId += '-foreign';
    },
    (p: typeof plan) => {
      p.engine = 'terraform';
    },
    (p: typeof plan) => {
      p.sourcePlanSha256 = 'f'.repeat(64);
    },
    (p: typeof plan) => {
      p.frr.image += 'bad';
    },
  ]) {
    const bad = structuredClone(plan);
    mutate(bad);
    await expect(observeAzureRelayIdentity(source, bad, api)).rejects.toThrow();
  }
  expect(calls).toBe(0);
});

interface RelayFixtureCloudResource {
  id: string;
  name?: string;
  location?: string;
  provisioningState?: string;
  tags?: Record<string, string>;
  addressPrefix?: string;
  nextLink?: string;
  vmId?: string;
  powerState?: string;
  plan?: { publisher: string; product: string; name: string };
  hardwareProfile?: { vmSize: string };
  storageProfile?: {
    imageReference: { publisher: string; offer: string; sku: string; version: string };
    osDisk?: { name: string; managedDisk: { id: string } };
  };
  networkProfile?: { networkInterfaces: { id: string; primary?: boolean }[] };
  virtualMachine?: { id: string };
  enableIPForwarding?: boolean;
  macAddress?: string;
  ipConfigurations?: {
    id: string;
    name: string;
    primary: boolean;
    privateIPAddressVersion: string;
    privateIPAllocationMethod?: string;
    privateIPAddress: string;
    subnet: { id: string };
  }[];
}
function relayFixtureField<T extends object, K extends keyof T & string>(resource: T, key: K) {
  const value = resource[key];
  if (value === undefined) throw Error(`Missing relay fixture field: ${key}`);
  return value as Exclude<T[K], undefined>;
}

function cloudFixture(engine: 'native' | 'terraform' = 'native', ha = false, dual = false, traffic = false) {
  const f = fixture(engine, ha, dual, traffic);
  const tags = {
    'xcsh-managed-by': 'azure-ce',
    'xcsh-execution-engine': f.plan.engine,
    'xcsh-deployment-id': f.source.deploymentName,
    'xcsh-plan-sha256': f.source.planSha256,
  };
  const relayTags = { ...tags, 'xcsh-relay-plan-sha256': f.plan.planSha256 };
  const objects: Record<string, RelayFixtureCloudResource> = {
    [f.plan.vnetId]: { id: f.plan.vnetId, location: f.source.region, provisioningState: 'Succeeded', tags },
    [f.plan.sloSubnetId]: { id: f.plan.sloSubnetId, provisioningState: 'Succeeded', addressPrefix: '10.20.0.0/24' },
  };
  for (const [i, r] of f.plan.relays.entries()) {
    objects[r.vmId] = {
      id: r.vmId,
      location: f.source.region,
      provisioningState: 'Succeeded',
      tags: relayTags,
      hardwareProfile: { vmSize: f.plan.vmSize },
      storageProfile: {
        imageReference: { ...hostImage },
        osDisk: { name: r.osDiskName, managedDisk: { id: r.osDiskId } },
      },
      networkProfile: { networkInterfaces: [{ id: r.nicId, primary: true }] },
    };
    objects[r.nicId] = {
      id: r.nicId,
      location: f.source.region,
      provisioningState: 'Succeeded',
      tags: relayTags,
      virtualMachine: { id: r.vmId },
      enableIPForwarding: true,
      macAddress: `02-11-22-33-44-0${i + 1}`,
      ipConfigurations: [
        {
          id: r.ipConfigurationId,
          name: 'ipconfig1',
          primary: true,
          privateIPAddressVersion: 'IPv4',
          privateIPAllocationMethod: 'Static',
          privateIPAddress: r.privateAddress,
          subnet: { id: r.subnetId },
        },
      ],
    };
  }
  const calls: string[][] = [];
  const api: AzExecApi = {
    async exec(command, args) {
      expect(command).toBe('az');
      expect(args).toContain('show');
      expect(args).toContain('--subscription');
      calls.push(args);
      return { exitCode: 0, stderr: '', stdout: JSON.stringify(objects[args[args.indexOf('--ids') + 1]]) };
    },
  };
  return { ...f, objects, api, calls };
}

test('fresh complete VM/NIC/IP/subnet/VNet joins return identity only and execute read-only scoped commands', async () => {
  const { source, plan, api, calls } = cloudFixture();
  const result = await observeAzureRelayIdentity(source, plan, api);
  expect(result.status).toBe('observed');
  expect(result.relays).toHaveLength(2);
  expect(result.routing).toBe('unknown');
  expect(result.software).toBe('unknown');
  expect(result.traffic).toBe('unknown');
  expect(result.ceSampleFreshnessQualified).toBe(false);
  expect(result.relays[0]).toMatchObject({
    vmId: plan.relays[0].vmId,
    nicId: plan.relays[0].nicId,
    address: plan.relays[0].privateAddress,
    asn: 65001,
    mac: '02:11:22:33:44:01',
  });
  expect(calls).toHaveLength(6);
  expect(calls.every((args) => !args.includes('create') && !args.includes('update') && !args.includes('delete'))).toBe(
    true,
  );
});

test('foreign owners, engines, addresses, images, attachments, IP configs, MACs and incomplete evidence reject', async () => {
  const mutations = [
    (f: ReturnType<typeof cloudFixture>) => {
      relayFixtureField(f.objects[f.plan.vnetId], 'tags')['xcsh-plan-sha256'] = 'f'.repeat(64);
    },
    (f: ReturnType<typeof cloudFixture>) => {
      f.objects[f.plan.relays[0].vmId].tags = {};
    },
    (f: ReturnType<typeof cloudFixture>) => {
      relayFixtureField(f.objects[f.plan.relays[0].nicId], 'tags')['xcsh-execution-engine'] = 'terraform';
    },
    (f: ReturnType<typeof cloudFixture>) => {
      relayFixtureField(f.objects[f.plan.relays[0].nicId], 'ipConfigurations')[0].privateIPAddress = '10.20.0.30';
    },
    (f: ReturnType<typeof cloudFixture>) => {
      relayFixtureField(f.objects[f.plan.relays[0].vmId], 'storageProfile').imageReference.version = 'latest';
    },
    (f: ReturnType<typeof cloudFixture>) => {
      relayFixtureField(f.objects[f.plan.relays[0].vmId], 'networkProfile').networkInterfaces.push({
        id: f.plan.relays[0].nicId,
      });
    },
    (f: ReturnType<typeof cloudFixture>) => {
      relayFixtureField(f.objects[f.plan.relays[0].nicId], 'virtualMachine').id = f.plan.relays[1].vmId;
    },
    (f: ReturnType<typeof cloudFixture>) => {
      relayFixtureField(f.objects[f.plan.relays[0].nicId], 'ipConfigurations').push(
        relayFixtureField(f.objects[f.plan.relays[0].nicId], 'ipConfigurations')[0],
      );
    },
    (f: ReturnType<typeof cloudFixture>) => {
      f.objects[f.plan.relays[0].nicId].macAddress = '01-11-22-33-44-01';
    },
    (f: ReturnType<typeof cloudFixture>) => {
      f.objects[f.plan.relays[1].nicId].macAddress = f.objects[f.plan.relays[0].nicId].macAddress;
    },
    (f: ReturnType<typeof cloudFixture>) => {
      f.objects[f.plan.sloSubnetId].addressPrefix = '10.21.0.0/24';
    },
    (f: ReturnType<typeof cloudFixture>) => {
      relayFixtureField(f.objects[f.plan.relays[0].nicId], 'ipConfigurations')[0].subnet.id += '-foreign';
    },
    (f: ReturnType<typeof cloudFixture>) => {
      f.objects[f.plan.relays[0].nicId].enableIPForwarding = false;
    },
    (f: ReturnType<typeof cloudFixture>) => {
      f.objects[f.plan.vnetId].nextLink = 'https://example.invalid/next';
    },
    (f: ReturnType<typeof cloudFixture>) => {
      f.objects[f.plan.relays[0].vmId].provisioningState = 'Updating';
    },
  ];
  for (const mutate of mutations) {
    const f = cloudFixture();
    mutate(f);
    await expect(observeAzureRelayIdentity(f.source, f.plan, f.api)).rejects.toThrow();
  }
});

test('authorization/service/malformed responses and aborts do not yield successful identity', async () => {
  const { source, plan } = fixture();
  for (const reply of [
    { exitCode: 1, stderr: 'authorization denied', stdout: '{}' },
    { exitCode: 0, stderr: '', stdout: 'malformed' },
    { exitCode: 0, stderr: '', stdout: 'null' },
    { exitCode: 0, stderr: '', stdout: '{}' },
  ]) {
    await expect(
      observeAzureRelayIdentity(source, plan, {
        async exec() {
          return reply;
        },
      }),
    ).rejects.toThrow();
  }
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await expect(
    observeAzureRelayIdentity(
      source,
      plan,
      {
        async exec() {
          calls++;
          throw Error('no');
        },
      },
      controller.signal,
    ),
  ).rejects.toThrow();
  expect(calls).toBe(0);
});

test('rehashed foreign resource graph still rejects before cloud access', async () => {
  const { source, plan } = fixture();
  const bad = structuredClone(plan);
  bad.relays[0].vmId = bad.relays[1].vmId;
  const { planId: _id, planSha256: _sha, ...draft } = bad;
  bad.planSha256 = canonicalSha256(draft);
  bad.planId = `azure-relay-${bad.planSha256.slice(0, 24)}`;
  let calls = 0;
  await expect(
    observeAzureRelayIdentity(source, bad, {
      async exec() {
        calls++;
        throw Error('no');
      },
    }),
  ).rejects.toThrow();
  expect(calls).toBe(0);
});

test('caller cancellation bounds a cloud API that ignores its abort signal', async () => {
  const { source, plan } = fixture();
  let calls = 0;
  const result = observeAzureRelayIdentity(
    source,
    plan,
    {
      async exec() {
        calls++;
        return new Promise<never>(() => {});
      },
    },
    AbortSignal.timeout(20),
  );
  await expect(result).rejects.toThrow();
  expect(calls).toBe(1);
});

function routeServerFixture(engine: 'native' | 'terraform' = 'native', ha = false, dual = false, traffic = false) {
  const f = cloudFixture(engine, ha, dual, traffic);
  const serverAction = f.source.actions.find((action) => action.kind === 'route-server-create');
  if (!serverAction?.args) throw Error('missing Route Server fixture');
  const hostedSubnet = serverAction.args[serverAction.args.indexOf('--hosted-subnet') + 1];
  const subnetAction = f.source.actions.find((action) => action.resourceId === hostedSubnet);
  if (!subnetAction?.args) throw Error('missing Route Server subnet fixture');
  const subnetCidr = subnetAction.args[subnetAction.args.indexOf('--address-prefixes') + 1];
  const server = {
    id: f.plan.routeServerId,
    location: f.plan.region,
    provisioningState: 'Succeeded',
    virtualRouterAsn: 65515,
    virtualRouterIps: ['10.255.0.4', '10.255.0.5'],
    tags: relayFixtureField(f.objects[f.plan.vnetId], 'tags'),
    bgpConnections: f.plan.relays.map((relay) => ({ id: `${f.plan.routeServerId}/bgpConnections/${relay.name}` })),
    ipConfigurations: [{ id: `${f.plan.routeServerId}/ipConfigurations/route-server-ip` }],
  };
  const ipConfigurations: {
    nextLink?: string;
    value: {
      id: string;
      properties: { privateIPAddress: string; subnet: { id: string }; provisioningState: string };
    }[];
  } = {
    value: [
      {
        id: server.ipConfigurations[0].id,
        properties: { privateIPAddress: '10.255.0.4', subnet: { id: hostedSubnet }, provisioningState: 'Succeeded' },
      },
    ],
  };
  const peers = f.plan.relays.map((relay) => ({
    id: `${f.plan.routeServerId}/bgpConnections/${relay.name}`,
    name: relay.name,
    peerAsn: relay.asn,
    peerIp: relay.privateAddress,
    provisioningState: 'Succeeded',
    connectionState: 'Connected',
  }));
  f.objects[hostedSubnet] = { id: hostedSubnet, provisioningState: 'Succeeded', addressPrefix: subnetCidr };
  const calls: string[][] = [];
  const api: AzExecApi = {
    async exec(command, args, options) {
      calls.push(args);
      expect(command).toBe('az');
      expect(args[args.indexOf('--subscription') + 1]).toBe(f.source.subscription.id);
      if (args[0] === 'rest') return { exitCode: 0, stderr: '', stdout: JSON.stringify(ipConfigurations) };
      if (args.includes('routeserver')) {
        const value = args.includes('peering')
          ? peers.find((peer) => peer.name === args[args.indexOf('--name') + 1])
          : server;
        return { exitCode: 0, stderr: '', stdout: JSON.stringify(value) };
      }
      return f.api.exec(command, args, options);
    },
  };
  return { ...f, api, calls, server, ipConfigurations, peers, hostedSubnet };
}

test('joins current two-relay identities to exact Route Server hub, hosted subnet, IP configurations and peers', async () => {
  const f = routeServerFixture();
  const result = await observeAzureRelayRouteServerIdentity(f.source, f.plan, f.api);
  expect(result.status).toBe('observed');
  expect(result.routeServerId).toBe(f.plan.routeServerId);
  expect(result.serviceAddresses).toEqual(['10.255.0.4', '10.255.0.5']);
  expect(result.hostedSubnetId).toBe(f.hostedSubnet);
  expect(result.peers.map((peer) => peer.peerAsn)).toEqual([65001, 65002]);
  expect(result.relays.map((relay) => relay.mac)).toEqual(['02:11:22:33:44:01', '02:11:22:33:44:02']);
  expect(result.sessions).toBe('unknown');
  expect(result.traffic).toBe('unknown');
  expect(result.ceSampleFreshnessQualified).toBe(false);
  expect(f.calls).toHaveLength(11);
  expect(
    f.calls.every((args) => !args.includes('create') && !args.includes('update') && !args.includes('delete')),
  ).toBe(true);
});

test('Route Server relay join rejects foreign, duplicate, partial, unresolved and unavailable evidence', async () => {
  for (const mutate of [
    (f: ReturnType<typeof routeServerFixture>) => {
      f.server.tags = {};
    },
    (f: ReturnType<typeof routeServerFixture>) => {
      f.server.virtualRouterAsn = 65010;
    },
    (f: ReturnType<typeof routeServerFixture>) => {
      f.server.virtualRouterIps = ['10.255.0.4', '10.255.0.4'];
    },
    (f: ReturnType<typeof routeServerFixture>) => {
      f.server.virtualRouterIps[1] = '10.254.0.4';
    },
    (f: ReturnType<typeof routeServerFixture>) => {
      f.server.bgpConnections.push(f.server.bgpConnections[0]);
    },
    (f: ReturnType<typeof routeServerFixture>) => {
      f.server.bgpConnections[0].id += '-foreign';
    },
    (f: ReturnType<typeof routeServerFixture>) => {
      f.ipConfigurations.nextLink = 'next';
    },
    (f: ReturnType<typeof routeServerFixture>) => {
      f.ipConfigurations.value[0].properties.subnet.id += '-foreign';
    },
    (f: ReturnType<typeof routeServerFixture>) => {
      f.ipConfigurations.value[0].id += '-foreign';
    },
    (f: ReturnType<typeof routeServerFixture>) => {
      f.ipConfigurations.value[0].properties.provisioningState = 'Updating';
    },
    (f: ReturnType<typeof routeServerFixture>) => {
      f.peers[0].peerIp = f.peers[1].peerIp;
    },
    (f: ReturnType<typeof routeServerFixture>) => {
      f.peers[0].peerAsn = 65515;
    },
    (f: ReturnType<typeof routeServerFixture>) => {
      f.peers[0].id += '-foreign';
    },
    (f: ReturnType<typeof routeServerFixture>) => {
      f.objects[f.plan.relays[0].nicId].tags = {};
    },
  ]) {
    const f = routeServerFixture();
    mutate(f);
    await expect(observeAzureRelayRouteServerIdentity(f.source, f.plan, f.api)).rejects.toThrow();
  }
  const f = routeServerFixture();
  await expect(
    observeAzureRelayRouteServerIdentity(f.source, f.plan, {
      async exec() {
        return { exitCode: 1, stdout: '', stderr: 'unavailable' };
      },
    }),
  ).rejects.toThrow();
});

test('FRR config binds ordinary CE peers and both multihop Route Server services to explicit VIP and return policies', async () => {
  const f = routeServerFixture();
  const server = await observeAzureRelayRouteServerIdentity(f.source, f.plan, f.api);
  const endpoints = [{ node: 1, address: '10.20.0.4' }];
  const result = compileAzureRelayFrrConfig(f.source, f.plan, f.plan.relays[0].name, server, endpoints, [
    '10.30.0.0/24',
  ]);
  expect(result.relayName).toBe(f.plan.relays[0].name);
  expect(result.configSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(result.config).toContain('neighbor XCSH-RS ebgp-multihop 2');
  expect(result.config).toContain('neighbor XCSH-CE remote-as 65010');
  expect(result.config).toContain('neighbor XCSH-RS remote-as 65515');
  expect(result.config).toContain('permit 10.250.0.10/32');
  expect(result.config).toContain('permit 10.30.0.0/24');
  expect(result.config).toContain('neighbor XCSH-RS route-map XCSH-VIP out');
  expect(result.config).toContain('neighbor XCSH-CE route-map XCSH-RETURN out');
  expect(result.config).not.toContain('no bgp ebgp-requires-policy');
  expect(result.config).not.toContain('redistribute connected');
  expect(result.config).toContain('table-map XCSH-FIB');
  expect(result.config).toContain(
    'route-map XCSH-FIB permit 20\n match ip address prefix-list XCSH-RETURN\n set ip next-hop 10.20.0.1',
  );
  expect(result.config).toContain(`ip route ${result.forwarding.controlCidr} 10.20.0.1`);
  expect(result.forwarding.qualified).toBe(false);
});

test('FRR config rejects foreign hub binding, missing/duplicate CE endpoints and implicit return policy', async () => {
  const f = routeServerFixture();
  const server = await observeAzureRelayRouteServerIdentity(f.source, f.plan, f.api);
  for (const peers of [
    [],
    [{ node: 1, address: '10.20.0.20' }],
    [{ node: 2, address: '10.20.0.4' }],
    [{ node: 1, address: '10.21.0.4' }],
    [
      { node: 1, address: '10.20.0.4' },
      { node: 1, address: '10.20.0.5' },
    ],
  ])
    expect(() =>
      compileAzureRelayFrrConfig(f.source, f.plan, f.plan.relays[0].name, server, peers, ['10.30.0.0/24']),
    ).toThrow();
  for (const prefixes of [[], ['0.0.0.0/0'], ['10.30.0.1/24'], ['10.30.0.0/24', '10.30.0.0/24']])
    expect(() =>
      compileAzureRelayFrrConfig(
        f.source,
        f.plan,
        f.plan.relays[0].name,
        server,
        [{ node: 1, address: '10.20.0.4' }],
        prefixes,
      ),
    ).toThrow();
  expect(() =>
    compileAzureRelayFrrConfig(
      f.source,
      f.plan,
      'foreign',
      server,
      [{ node: 1, address: '10.20.0.4' }],
      ['10.30.0.0/24'],
    ),
  ).toThrow();
  expect(() =>
    compileAzureRelayFrrConfig(
      f.source,
      f.plan,
      f.plan.relays[0].name,
      { ...server, planSha256: 'f'.repeat(64) },
      [{ node: 1, address: '10.20.0.4' }],
      ['10.30.0.0/24'],
    ),
  ).toThrow();
});

test('relay cold bootstrap binds immutable toolchain, image and ownership without starting unconfigured BGP', () => {
  const f = fixture();
  const bootstrap = renderAzureRelayCloudInit(f.source, f.plan, f.plan.relays[0].name);
  expect(bootstrap.startsWith('#cloud-config\n')).toBe(true);
  const config = JSON.parse(bootstrap.slice('#cloud-config\n'.length));
  const files = config.write_files as Array<{ path: string; content: string; permissions: string }>;
  const owner = JSON.parse(files.find((file) => file.path === '/etc/xcsh-relay/plan.json')?.content ?? '{}');
  expect(owner.sourcePlanSha256).toBe(f.source.planSha256);
  expect(owner.relayPlanSha256).toBe(f.plan.planSha256);
  expect(owner.engine).toBe('native');
  expect(owner.relayName).toBe(f.plan.relays[0].name);
  expect(owner.frrImage).toBe(f.plan.frr.image);
  expect(files.some((file) => file.path === '/etc/xcsh-relay/frr/frr.conf')).toBe(false);
  expect(files.find((file) => file.path === '/etc/systemd/system/xcsh-relay.service')?.content).toContain(
    'ConditionPathExists=/etc/xcsh-relay/frr/frr.conf',
  );
  expect(files.find((file) => file.path === '/usr/local/lib/xcsh-relay-bootstrap.py')?.content).toContain(
    'hashlib.sha256',
  );
  expect(config.runcmd).toEqual([['python3', '/usr/local/lib/xcsh-relay-bootstrap.py']]);
  expect(bootstrap).not.toContain('latest');
  expect(bootstrap).not.toContain('--privileged');
  expect(() => renderAzureRelayCloudInit(f.source, f.plan, 'foreign')).toThrow();
});

test('native relay requests preserve exact graph, software and parent ownership without direct CE peers', () => {
  for (const ha of [false, true]) {
    const f = fixture('native', ha);
    const key = `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI${'A'.repeat(43)}`;
    const actions = compileAzureRelayNativeRequests(f.source, f.plan, key);
    expect(actions).toHaveLength(8);
    for (const relay of f.plan.relays) {
      expect(relay.osDiskId).toBe(relay.vmId.replace('/virtualMachines/', '/disks/') + '-osdisk');
      const vm = actions.find((action) => action.resourceId === relay.vmId);
      if (!vm) throw Error('VM request missing');
      const properties = vm.body.properties as {
        storageProfile: { osDisk: { name: string; deleteOption: string }; imageReference: { version: string } };
        networkProfile: { networkInterfaces: unknown[] };
        osProfile: { customData: string; linuxConfiguration: { disablePasswordAuthentication: boolean } };
      };
      expect(properties.storageProfile.osDisk.name).toBe(relay.osDiskName);
      expect(properties.storageProfile.osDisk.deleteOption).toBe('Delete');
      expect(properties.storageProfile.imageReference.version).toBe(f.plan.hostImage.version);
      expect(properties.networkProfile.networkInterfaces).toEqual([
        { id: relay.nicId, properties: { primary: true, deleteOption: 'Detach' } },
      ]);
      expect(properties.osProfile.linuxConfiguration.disablePasswordAuthentication).toBe(true);
      expect(Buffer.from(properties.osProfile.customData, 'base64').toString()).toBe(
        renderAzureRelayCloudInit(f.source, f.plan, relay.name),
      );
      expect(vm.body.tags).toMatchObject({
        'xcsh-plan-sha256': f.source.planSha256,
        'xcsh-relay-plan-sha256': f.plan.planSha256,
      });
      expect(vm.args[vm.args.indexOf('--body') + 1]).toBe(JSON.stringify(vm.body));
      const peer = actions.find(
        (action) => action.resourceId === `${f.plan.routeServerId}/bgpConnections/${relay.name}`,
      );
      expect(peer?.body.properties).toEqual({ peerAsn: relay.asn, peerIp: relay.privateAddress });
    }
    expect(actions.every((action) => action.args.includes('--subscription') && action.args.includes('put'))).toBe(true);
    expect(actions.filter((action) => action.kind === 'relay-peer-create')).toHaveLength(2);
  }
});

test('native relay request compiler rejects wrong engine, tampered disk graph and invalid SSH keys', () => {
  const f = fixture();
  const key = `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI${'A'.repeat(43)}`;
  for (const bad of [
    '',
    'ssh-ed25519 invalid',
    '-----BEGIN PRIVATE KEY-----',
    `${key}\n${key}`,
    `ssh-rsa AAAAC3NzaC1lZDI1NTE5AAAAI${'A'.repeat(43)}`,
  ])
    expect(() => compileAzureRelayNativeRequests(f.source, f.plan, bad)).toThrow();
  const tf = fixture('terraform');
  expect(() => compileAzureRelayNativeRequests(tf.source, tf.plan, key)).toThrow();
  const changed = structuredClone(f.plan);
  changed.relays[0].osDiskId += '-foreign';
  expect(() => compileAzureRelayNativeRequests(f.source, changed, key)).toThrow();
});

test('Terraform relay foundation keeps CE admission and two relay peers with no direct CE Route Server peers', () => {
  for (const ha of [false, true]) {
    const f = fixture('terraform', ha);
    const bootstrap = Object.fromEntries(
      Array.from({ length: f.source.topology.nodeCount }, (_, index) => [
        String(index + 1),
        '#cloud-config\nwrite_files:\n  - path: /etc/vpm/user_data\n    content: synthetic-source-fixture\n',
      ]),
    );
    const config = JSON.parse(renderAzureTerraformFoundation(f.source, bootstrap, f.plan));
    expect(Object.keys(config.resource.azurerm_route_server_bgp_connection)).toEqual(['relay_1', 'relay_2']);
    expect(
      Object.keys(config.resource.azurerm_linux_virtual_machine).filter((name) => name.startsWith('node_')),
    ).toHaveLength(f.source.topology.nodeCount);
    for (const [index, relay] of f.plan.relays.entries()) {
      const key = `relay_${index + 1}`;
      const vm = config.resource.azurerm_linux_virtual_machine[key];
      const nic = config.resource.azurerm_network_interface[key];
      const peer = config.resource.azurerm_route_server_bgp_connection[key];
      expect(vm.name).toBe(relay.name);
      expect(vm.os_disk[0].name).toBe(relay.osDiskName);
      expect(vm.source_image_reference).toEqual([
        {
          publisher: f.plan.hostImage.publisher,
          offer: f.plan.hostImage.offer,
          sku: f.plan.hostImage.sku,
          version: f.plan.hostImage.version,
        },
      ]);
      expect(Buffer.from(vm.custom_data, 'base64').toString()).toBe(
        renderAzureRelayCloudInit(f.source, f.plan, relay.name),
      );
      expect(nic.ip_configuration[0]).toMatchObject({
        name: 'ipconfig1',
        private_ip_address_allocation: 'Static',
        private_ip_address: relay.privateAddress,
      });
      expect(nic.ip_forwarding_enabled).toBe(true);
      expect(peer.peer_asn).toBe(relay.asn);
      expect(peer.peer_ip).toBe(relay.privateAddress);
      expect(config.output.ce_relay_instances.value[key].os_disk_id).toBe(relay.osDiskId);
    }
    expect(config.output.ce_route_server_peers.value).toEqual({});
    expect(config.terraform.required_version).toBe('= 1.16.5');
  }
});

test('current relay identity rejects missing and foreign OS disk attachments', async () => {
  for (const mutate of [
    (f: ReturnType<typeof cloudFixture>) => {
      delete relayFixtureField(f.objects[f.plan.relays[0].vmId], 'storageProfile').osDisk;
    },
    (f: ReturnType<typeof cloudFixture>) => {
      mustReplacementFixture(
        relayFixtureField(f.objects[f.plan.relays[0].vmId], 'storageProfile').osDisk,
      ).managedDisk.id += '-foreign';
    },
    (f: ReturnType<typeof cloudFixture>) => {
      mustReplacementFixture(relayFixtureField(f.objects[f.plan.relays[0].vmId], 'storageProfile').osDisk).name +=
        '-foreign';
    },
  ]) {
    const f = cloudFixture();
    mutate(f);
    await expect(observeAzureRelayIdentity(f.source, f.plan, f.api)).rejects.toThrow();
  }
});

function deploymentFixture(engine: 'native' | 'terraform' = 'native', ha = false, dual = false, traffic = false) {
  const f = fixture(engine, ha, dual, traffic);
  const stamp = new Date().toISOString();
  const query = (args: string[]) => ({
    command: 'az' as const,
    args: [...args, '--subscription', f.source.subscription.id, '--output', 'json'],
    responseSha256: 'a'.repeat(64),
    observedAt: stamp,
  });
  const catalog = {
    region: f.source.region,
    image: f.image,
    vmSizes: f.observed.regions[0].vmSizes.filter((size) => size.name === f.selection.vmSize),
    provenance: {
      method: 'azure-cli-live' as const,
      sourcePlanSha256: f.source.planSha256,
      observedAt: stamp,
      reads: [
        query(['account', 'show']),
        query(['vm', 'image', 'show', '--urn', f.plan.hostImage.urn, '--location', f.source.region]),
        query(['vm', 'list-skus', '--size', f.selection.vmSize, '--location', f.source.region, '--all']),
      ],
    },
  };
  return { ...f, catalog };
}

test('final relay deployment plan freezes catalog/source provenance without circular hashes', () => {
  for (const engine of ['native', 'terraform'] as const)
    for (const ha of [false, true]) {
      const f = deploymentFixture(engine, ha);
      const final = compileAzureRelayDeploymentPlan(f.source, f.selection, f.catalog);
      verifyAzureCePlan(final);
      const relay = azureRelayPlanForDeployment(final);
      expect(relay.sourcePlanSha256).toBe(final.planSha256);
      expect(final.planSha256).not.toBe(f.source.planSha256);
      expect(final.relayProfile?.foundationPlan.planSha256).toBe(f.source.planSha256);
      expect(final.actions.filter((action) => action.kind === 'relay-provision')).toHaveLength(1);
      expect(final.actions.some((action) => action.kind === 'route-server-peer-create')).toBe(false);
      const provisionIndex = final.actions.findIndex((action) => action.kind === 'relay-provision');
      expect(provisionIndex).toBe(final.actions.findIndex((action) => action.kind === 'route-server-create') + 1);
      expect(
        final.ownershipInventory.some(
          (item) => item.resourceId === relay.relays[0].osDiskId && item.action === 'create',
        ),
      ).toBe(true);
      expect(final.billableResources.find((item) => item.type === 'virtual-machine')?.count).toBe(
        final.topology.nodeCount + 2,
      );
      expect(final.billableResources.find((item) => item.type === 'managed-disk')?.count).toBe(
        final.topology.nodeCount + 2,
      );
      expect(compileAzureRelayDeploymentPlan(f.source, f.selection, f.catalog)).toEqual(final);
      expect(JSON.parse(JSON.stringify(final))).toEqual(final);
    }
});

test('relay deployment binding rejects foreign query provenance and rehashed graph changes', () => {
  const f = deploymentFixture();
  for (const mutate of [
    (catalog: typeof f.catalog) => {
      catalog.provenance.sourcePlanSha256 = 'f'.repeat(64);
    },
    (catalog: typeof f.catalog) => {
      catalog.provenance.reads[1].args[3] = 'foreign:latest';
    },
    (catalog: typeof f.catalog) => {
      catalog.provenance.reads.pop();
    },
    (catalog: typeof f.catalog) => {
      catalog.provenance.reads[0].responseSha256 = 'invalid';
    },
    (catalog: typeof f.catalog) => {
      catalog.provenance.observedAt = 'invalid';
    },
  ]) {
    const bad = structuredClone(f.catalog);
    mutate(bad);
    expect(() => compileAzureRelayDeploymentPlan(f.source, f.selection, bad)).toThrow();
  }
  for (const mutate of [
    (plan: ReturnType<typeof compileAzureRelayDeploymentPlan>) => {
      plan.actions = plan.actions.filter((action) => action.kind !== 'relay-provision');
    },
    (plan: ReturnType<typeof compileAzureRelayDeploymentPlan>) => {
      plan.ownershipInventory.pop();
    },
    (plan: ReturnType<typeof compileAzureRelayDeploymentPlan>) => {
      plan.relayProfile.foundationPlan.actions[0].description += '-foreign';
    },
  ]) {
    const bad = compileAzureRelayDeploymentPlan(f.source, f.selection, f.catalog);
    mutate(bad);
    const { planSha256: _sha, planId: _id, ...draft } = bad;
    bad.planSha256 = canonicalSha256(draft);
    bad.planId = `azure-ce-${bad.planSha256.slice(0, 24)}`;
    expect(() => verifyAzureCePlan(bad)).toThrow();
  }
});

function nativeExecutionFixture(sourceOverride?: AzureCePlan) {
  const f = deploymentFixture();
  const source = sourceOverride ?? compileAzureRelayDeploymentPlan(f.source, f.selection, f.catalog);
  const plan = azureRelayPlanForDeployment(source);
  const tags = {
    'xcsh-managed-by': 'azure-ce',
    'xcsh-execution-engine': 'native',
    'xcsh-deployment-id': source.deploymentName,
    'xcsh-plan-sha256': source.planSha256,
  };
  const objects: Record<string, Record<string, unknown>> = Object.fromEntries(
    [plan.vnetId, plan.sloSubnetId, plan.routeServerId].map((id) => [
      id,
      { id, location: source.region, tags, properties: { provisioningState: 'Succeeded' } },
    ]),
  );
  (objects[plan.sloSubnetId].properties as Record<string, unknown>).addressPrefix = plan.sloCidr;
  const saved = new Map<string, unknown>();
  const storage = {
    owner: {
      deploymentId: source.deploymentName,
      engine: source.engine,
      provider: 'azure' as const,
      account: source.subscription.id,
      region: source.region,
    },
    async verify() {},
    async read(name: string) {
      if (!saved.has(name)) throw Object.assign(Error('missing'), { code: 'ENOENT' });
      return structuredClone(saved.get(name));
    },
    async write(name: string, value: unknown) {
      saved.set(name, structuredClone(value));
    },
  };
  let puts = 0;
  let lose = false;
  const api: AzExecApi = {
    async exec(_command, args) {
      if (args[0] === 'account')
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            id: source.subscription.id,
            tenantId: source.subscription.tenantId,
            environmentName: 'AzureCloud',
          }),
        };
      if (args[0] === 'vm' && args[1] === 'image')
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            id: plan.hostImage.id,
            osDiskImage: { operatingSystem: 'Linux' },
            architecture: 'x64',
          }),
        };
      if (args[0] === 'vm' && args[1] === 'list-skus') {
        const size = plan.catalog.vmSizes[0];
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify([
            {
              name: size.name,
              resourceType: 'virtualMachines',
              locations: [source.region],
              locationInfo: [{ location: source.region, zones: size.zones }],
              restrictions: [],
              capabilities: [
                { name: 'CpuArchitectureType', value: 'x64' },
                ...(size.hyperVGenerations
                  ? [{ name: 'HyperVGenerations', value: size.hyperVGenerations.join(',') }]
                  : []),
                { name: 'MaxNetworkInterfaces', value: String(size.maxNics) },
                { name: 'vCPUs', value: String(size.vCpus) },
                { name: 'MemoryGB', value: String(size.memoryGb) },
              ],
            },
          ]),
        };
      }
      const url = new URL(args[args.indexOf('--url') + 1]);
      const id = url.pathname;
      if (args[args.indexOf('--method') + 1] === 'put') {
        puts++;
        const body = JSON.parse(args[args.indexOf('--body') + 1]);
        objects[id] = { ...body, id, properties: { ...body.properties, provisioningState: 'Succeeded' } };
        if (id.includes('/virtualMachines/')) {
          const props = objects[id].properties as {
            storageProfile: { osDisk: { managedDisk: Record<string, unknown> } };
          };
          props.storageProfile.osDisk.managedDisk.id = plan.relays.find((relay) => relay.vmId === id)?.osDiskId;
          const diskId = props.storageProfile.osDisk.managedDisk.id;
          if (typeof diskId === 'string')
            objects[diskId] = {
              id: diskId,
              location: source.region,
              managedBy: id,
              properties: { provisioningState: 'Succeeded' },
            };
        }
        if (lose) {
          lose = false;
          throw Error('interrupted after submission');
        }
        return { exitCode: 0, stderr: '', stdout: JSON.stringify(objects[id]) };
      }
      return objects[id]
        ? { exitCode: 0, stderr: '', stdout: JSON.stringify(objects[id]) }
        : { exitCode: 1, stderr: 'ResourceNotFound', stdout: '' };
    },
  };
  return {
    source,
    plan,
    objects,
    saved,
    storage,
    api,
    get puts() {
      return puts;
    },
    get lose() {
      return lose;
    },
    set lose(value: boolean) {
      lose = value;
    },
  };
}

test('native relay executor checkpoints submissions, verifies current identities and resumes response loss without duplicate creates', async () => {
  const f = nativeExecutionFixture();
  f.lose = true;
  await expect(ensureAzureRelayNativeResources(f.source, f.plan, f.storage, f.api)).rejects.toThrow('interrupted');
  expect(f.puts).toBe(1);
  expect(f.saved.get('relay-native-execution.json')).toMatchObject({ pending: { submitted: true } });
  const receipt = await ensureAzureRelayNativeResources(f.source, f.plan, f.storage, f.api);
  expect(receipt.status).toBe('provisioned');
  expect(receipt.software).toBe('unknown');
  expect(receipt.routing).toBe('unknown');
  expect(f.puts).toBe(8);
  await ensureAzureRelayNativeResources(f.source, f.plan, f.storage, f.api);
  expect(f.puts).toBe(8);
});

test('native relay executor rejects foreign parent/target ownership, changed NIC graph and forged checkpoint', async () => {
  for (const kind of ['parent', 'target', 'nic', 'checkpoint'] as const) {
    const f = nativeExecutionFixture();
    if (kind === 'parent')
      (f.objects[f.plan.vnetId].tags as Record<string, string>)['xcsh-plan-sha256'] = 'f'.repeat(64);
    if (kind === 'target')
      f.objects[f.plan.relays[0].publicIpId as string] = {
        id: f.plan.relays[0].publicIpId,
        tags: {},
        properties: { provisioningState: 'Succeeded' },
      };
    if (kind === 'nic') {
      await ensureAzureRelayNativeResources(f.source, f.plan, f.storage, f.api);
      const nic = f.objects[f.plan.relays[0].nicId].properties as {
        ipConfigurations: Array<{ properties: { privateIPAddress: string } }>;
      };
      relayFixtureField(nic, 'ipConfigurations')[0].properties.privateIPAddress = '10.20.0.30';
    }
    if (kind === 'checkpoint')
      f.saved.set('relay-native-execution.json', {
        schemaVersion: 1,
        engine: 'native',
        sourcePlanSha256: 'f'.repeat(64),
        relayPlanSha256: f.plan.planSha256,
        completed: [],
      });
    const before = f.puts;
    await expect(ensureAzureRelayNativeResources(f.source, f.plan, f.storage, f.api)).rejects.toThrow();
    expect(f.puts).toBe(before);
  }
});

test('native relay executor rejects changed subnet, missing request binding and later foreign targets before mutation', async () => {
  for (const kind of ['subnet', 'journal', 'later-target'] as const) {
    const f = nativeExecutionFixture();
    if (kind === 'subnet')
      (f.objects[f.plan.sloSubnetId].properties as Record<string, unknown>).addressPrefix = '10.250.0.0/24';
    if (kind === 'journal') {
      await ensureAzureRelayNativeResources(f.source, f.plan, f.storage, f.api);
      (f.saved.get('relay-native-execution.json') as Record<string, unknown>).requestsSha256 = '';
    }
    if (kind === 'later-target')
      f.objects[f.plan.relays[1].nicId] = {
        id: f.plan.relays[1].nicId,
        tags: {},
        properties: { provisioningState: 'Succeeded' },
      };
    const before = f.puts;
    await expect(ensureAzureRelayNativeResources(f.source, f.plan, f.storage, f.api)).rejects.toThrow();
    expect(f.puts).toBe(before);
  }
});

test('native relay executor keeps unavailable, absent submitted and acknowledgment-only outcomes unknown', async () => {
  for (const kind of ['permission', 'ack-only', 'submitted-absent'] as const) {
    const f = nativeExecutionFixture();
    const base = f.api.exec;
    if (kind === 'permission')
      f.api.exec = async (command, args, options) =>
        args[0] === 'rest'
          ? { exitCode: 1, stdout: '', stderr: 'AuthorizationFailed ResourceNotFound' }
          : base(command, args, options);
    if (kind === 'ack-only')
      f.api.exec = async (command, args, options) =>
        args.includes('put') ? { exitCode: 0, stdout: '{}', stderr: '' } : base(command, args, options);
    if (kind === 'submitted-absent') {
      f.lose = true;
      await expect(ensureAzureRelayNativeResources(f.source, f.plan, f.storage, f.api)).rejects.toThrow();
      delete f.objects[f.plan.relays[0].publicIpId as string];
    }
    const before = f.puts;
    await expect(ensureAzureRelayNativeResources(f.source, f.plan, f.storage, f.api)).rejects.toThrow();
    expect(f.puts).toBe(before);
    if (kind !== 'permission')
      expect(f.saved.get('relay-native-execution.json')).toMatchObject({ pending: { submitted: true } });
  }
});

test('native relay executor rejects wrong engine and bounds ignored caller cancellation', async () => {
  const f = nativeExecutionFixture();
  const terraform = deploymentFixture('terraform');
  const source = compileAzureRelayDeploymentPlan(terraform.source, terraform.selection, terraform.catalog);
  let calls = 0;
  const unavailable: AzExecApi = {
    async exec() {
      calls++;
      return new Promise(() => {});
    },
  };
  await expect(
    ensureAzureRelayNativeResources(source, azureRelayPlanForDeployment(source), f.storage, unavailable),
  ).rejects.toThrow('native engine');
  expect(calls).toBe(0);
  const abort = new AbortController();
  setTimeout(() => abort.abort(Error('cancel relay')), 20);
  await expect(ensureAzureRelayNativeResources(f.source, f.plan, f.storage, unavailable, abort.signal)).rejects.toThrow(
    'cancel relay',
  );
  expect(calls).toBe(1);
  expect(f.puts).toBe(0);
});

test('Terraform foundation derives the final saved relay profile during every serial admission', () => {
  const f = deploymentFixture('terraform', true);
  const final = compileAzureRelayDeploymentPlan(f.source, f.selection, f.catalog);
  const relay = azureRelayPlanForDeployment(final);
  for (let count = 0; count <= 3; count++) {
    const bootstrap = Object.fromEntries(
      Array.from({ length: count }, (_, index) => [
        String(index + 1),
        '#cloud-config\nwrite_files:\n- path: /etc/vpm/user_data\n  content: fixture-material\n',
      ]),
    );
    const implicit = JSON.parse(renderAzureTerraformFoundation(final, bootstrap));
    const explicit = JSON.parse(renderAzureTerraformFoundation(final, bootstrap, relay));
    expect(implicit).toEqual(explicit);
    expect(Object.keys(implicit.resource.azurerm_route_server_bgp_connection)).toHaveLength(2);
    expect(Object.keys(implicit.resource.azurerm_linux_virtual_machine ?? {})).toHaveLength(count + 2);
  }
});

test('native relay dispatch executes the exact final-plan action and rejects substituted actions', async () => {
  const f = nativeExecutionFixture();
  const action = f.source.actions.find((item) => item.kind === 'relay-provision');
  if (!action) throw Error('missing fixture action');
  f.lose = true;
  await expect(executeAzureRelayProvisionAction(f.source, action, f.storage, f.api)).rejects.toThrow('interrupted');
  expect(f.saved.get('relay-native-execution.json')).toMatchObject({ pending: { submitted: true } });
  const receipt = await executeAzureRelayProvisionAction(f.source, action, f.storage, f.api);
  expect(receipt.status).toBe('provisioned');
  expect(f.puts).toBe(8);
  for (const changed of [
    { ...action, id: '999' },
    { ...action, resourceId: f.plan.vnetId },
    { ...action, kind: 'vm-create' as const },
  ]) {
    await expect(executeAzureRelayProvisionAction(f.source, changed, f.storage, f.api)).rejects.toThrow('action');
    expect(f.puts).toBe(8);
  }
});

test('native relay executor binds private key storage to the exact owner and keeps key material out of receipts', async () => {
  const f = nativeExecutionFixture();
  const root = await mkdtemp(join(tmpdir(), 'relay-native-store-'));
  try {
    const storage = await CeDeploymentStore.open(root, f.storage.owner);
    const receipt = await ensureAzureRelayNativeResources(f.source, f.plan, storage, f.api);
    const path = join(storage.directory, 'relay-native-execution.json');
    const info = await stat(path);
    const saved = JSON.parse(await readFile(path, 'utf8'));
    expect(info.mode & 0o777).toBe(0o600);
    expect(saved.privateKey).toContain('BEGIN PRIVATE KEY');
    expect(JSON.stringify(receipt)).not.toContain(saved.privateKey);
    expect(JSON.stringify(receipt)).not.toContain('PRIVATE KEY');
    const foreign = await CeDeploymentStore.open(root, { ...f.storage.owner, deploymentId: 'foreign-relay-owner' });
    const before = f.puts;
    await expect(ensureAzureRelayNativeResources(f.source, f.plan, foreign, f.api)).rejects.toThrow('storage owner');
    expect(f.puts).toBe(before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('guest activation binds cloud NIC, immutable software, exact configuration and response nonce', async () => {
  const f = routeServerFixture();
  const server = await observeAzureRelayRouteServerIdentity(f.source, f.plan, f.api);
  const request = compileAzureRelayGuestActivation(
    f.source,
    f.plan,
    f.plan.relays[0].name,
    server,
    [{ node: 1, address: '10.20.0.4' }],
    'a'.repeat(32),
  );
  expect(request.args.slice(0, 3)).toEqual(['vm', 'run-command', 'invoke']);
  expect(request.args[request.args.indexOf('--ids') + 1]).toBe(f.plan.relays[0].vmId);
  expect(request.body.commandId).toBe('RunShellScript');
  expect(request.body.script).toHaveLength(1);
  expect(request.python).toContain('ip');
  expect(request.python).toContain('NET_ADMIN');
  expect(request.python).toContain('is-active');
  const value = {
    ...request.expected,
    status: 'configured',
    imageId: `sha256:${'b'.repeat(64)}`,
    interfaceName: 'eth0',
    containerId: 'c'.repeat(64),
  };
  const response = {
    value: [
      {
        code: 'ComponentStatus/StdOut/succeeded',
        level: 'Info',
        message: `XCSH_RELAY_RECEIPT:${request.expected.nonce}:${JSON.stringify(value)}\n`,
      },
      { code: 'ComponentStatus/StdErr/succeeded', level: 'Info', message: '' },
    ],
  };
  const receipt = parseAzureRelayGuestReceipt(request, response);
  expect(receipt.status).toBe('configured');
  expect(receipt.routing).toBe('unknown');
  expect(receipt.traffic).toBe('unknown');
  for (const mutate of [
    (r: typeof response) => {
      r.value[0].message = 'accepted';
    },
    (r: typeof response) => {
      r.value[0].message += r.value[0].message;
    },
    (r: typeof response) => {
      r.value[1].message = 'vtysh warning';
    },
    (r: typeof response) => {
      r.value[0].code = 'ProvisioningState/succeeded';
    },
    (r: typeof response) => {
      r.value[0].message = r.value[0].message.replace(request.expected.nonce, 'd'.repeat(32));
    },
    (r: typeof response) => {
      r.value[0].message = r.value[0].message.replace(value.mac, '02:00:00:00:00:00');
    },
    (r: typeof response) => {
      r.value.pop();
    },
  ]) {
    const changed = structuredClone(response);
    mutate(changed);
    expect(() => parseAzureRelayGuestReceipt(request, changed)).toThrow();
  }
  expect(() =>
    compileAzureRelayGuestActivation(
      f.source,
      f.plan,
      'foreign',
      server,
      [{ node: 1, address: '10.20.0.4' }],
      'a'.repeat(32),
    ),
  ).toThrow();
  expect(() =>
    compileAzureRelayGuestActivation(
      f.source,
      f.plan,
      f.plan.relays[0].name,
      server,
      [{ node: 1, address: '10.20.0.4' }],
      'unresolved',
    ),
  ).toThrow();
});

test('generated guest activation executes with real files, resumes partial configuration and never repeats service start', async () => {
  const f = routeServerFixture();
  const server = await observeAzureRelayRouteServerIdentity(f.source, f.plan, f.api);
  const request = compileAzureRelayGuestActivation(
    f.source,
    f.plan,
    f.plan.relays[0].name,
    server,
    [{ node: 1, address: '10.20.0.4' }],
    'a'.repeat(32),
  );
  const bootstrap = JSON.parse(
    renderAzureRelayCloudInit(f.source, f.plan, f.plan.relays[0].name).slice('#cloud-config\n'.length),
  );
  const configuration = compileAzureRelayFrrConfig(
    f.source,
    f.plan,
    f.plan.relays[0].name,
    server,
    [{ node: 1, address: '10.20.0.4' }],
    f.plan.returnPrefixes,
  ).config;
  for (const scenario of [
    'normal',
    'partial-config',
    'partial-record',
    'foreign-config',
    'foreign-mac',
    'parser-diagnostics',
    'parser-diagnostics-stdout',
    'foreign-capabilities',
    'missing-capabilities',
    'prefixed-capabilities',
    'duplicate-capabilities',
    'missing-state-directory',
    'missing-groups',
    'foreign-entrypoint',
    'missing-daemons',
    'daemon-diagnostics',
    'foreign-mount',
  ]) {
    const child = Bun.spawn(['python3', new URL('./relay-guest-harness.py', import.meta.url).pathname], {
      stdin: new Blob([
        JSON.stringify({ python: request.python, expected: request.expected, bootstrap, configuration, scenario }),
      ]),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [exit, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    if (['normal', 'partial-config', 'partial-record', 'prefixed-capabilities'].includes(scenario)) {
      expect(stderr).toBe('');
      expect(exit).toBe(0);
      expect(JSON.parse(stdout.trim().split('\n').at(-1) as string)).toMatchObject({
        starts: 1,
        executions: 2,
        configSha256: request.expected.configSha256,
      });
    } else {
      expect(exit).not.toBe(0);
      expect(stderr).toContain('RuntimeError');
      expect(stdout).not.toContain('XCSH_RELAY_RECEIPT');
    }
  }
});

test('guest receipt rejects unexpected payload fields and changed request integrity', async () => {
  const f = routeServerFixture();
  const server = await observeAzureRelayRouteServerIdentity(f.source, f.plan, f.api);
  const request = compileAzureRelayGuestActivation(
    f.source,
    f.plan,
    f.plan.relays[0].name,
    server,
    [{ node: 1, address: '10.20.0.4' }],
    'a'.repeat(32),
  );
  const value = {
    ...request.expected,
    status: 'configured',
    imageId: `sha256:${'b'.repeat(64)}`,
    interfaceName: 'eth0',
    containerId: 'c'.repeat(64),
  };
  const response = (record: unknown) => ({
    value: [
      {
        code: 'ComponentStatus/StdOut/succeeded',
        level: 'Info',
        message: `XCSH_RELAY_RECEIPT:${request.expected.nonce}:${JSON.stringify(record)}`,
      },
      { code: 'ComponentStatus/StdErr/succeeded', level: 'Info', message: '' },
    ],
  });
  expect(() => parseAzureRelayGuestReceipt(request, response({ ...value, untrusted: 'unexpected' }))).toThrow();
  const changed = structuredClone(request);
  changed.requestSha256 = 'f'.repeat(64);
  expect(() => parseAzureRelayGuestReceipt(changed, response(value))).toThrow();
});

test('generated guest scripts execute for both engines, both relay owners and one/three CE nodes', async () => {
  for (const engine of ['native', 'terraform'] as const)
    for (const ha of [false, true]) {
      const f = routeServerFixture(engine, ha);
      const server = await observeAzureRelayRouteServerIdentity(f.source, f.plan, f.api);
      const endpoints = Array.from({ length: f.source.topology.nodeCount }, (_, index) => ({
        node: index + 1,
        address: `10.20.0.${index + 4}`,
      }));
      for (const relay of f.plan.relays) {
        const request = compileAzureRelayGuestActivation(
          f.source,
          f.plan,
          relay.name,
          server,
          endpoints,
          'a'.repeat(32),
        );
        const bootstrap = JSON.parse(
          renderAzureRelayCloudInit(f.source, f.plan, relay.name).slice('#cloud-config\n'.length),
        );
        const configuration = compileAzureRelayFrrConfig(
          f.source,
          f.plan,
          relay.name,
          server,
          endpoints,
          f.plan.returnPrefixes,
        ).config;
        const child = Bun.spawn(['python3', new URL('./relay-guest-harness.py', import.meta.url).pathname], {
          stdin: new Blob([
            JSON.stringify({ python: request.python, expected: request.expected, bootstrap, configuration }),
          ]),
          stdout: 'pipe',
          stderr: 'pipe',
        });
        const [exit, stdout, stderr] = await Promise.all([
          child.exited,
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
        ]);
        expect(stderr).toBe('');
        expect(exit).toBe(0);
        expect(JSON.parse(stdout.trim().split('\n').at(-1) as string)).toMatchObject({
          starts: 1,
          executions: 2,
          configSha256: request.expected.configSha256,
        });
      }
    }
});

test('guest response-loss recovery probes current runtime without publishing config or starting services', async () => {
  const f = routeServerFixture();
  const server = await observeAzureRelayRouteServerIdentity(f.source, f.plan, f.api);
  const activation = compileAzureRelayGuestActivation(
    f.source,
    f.plan,
    f.plan.relays[0].name,
    server,
    [{ node: 1, address: '10.20.0.4' }],
    'a'.repeat(32),
  );
  const request = compileAzureRelayGuestObservation(activation);
  expect(request.mode).toBe('observe');
  expect(request.expected).toEqual(activation.expected);
  expect(request.requestSha256).not.toBe(activation.requestSha256);
  const bootstrap = JSON.parse(
    renderAzureRelayCloudInit(f.source, f.plan, f.plan.relays[0].name).slice('#cloud-config\n'.length),
  );
  const configuration = compileAzureRelayFrrConfig(
    f.source,
    f.plan,
    f.plan.relays[0].name,
    server,
    [{ node: 1, address: '10.20.0.4' }],
    f.plan.returnPrefixes,
  ).config;
  for (const scenario of ['observe-complete', 'observe-absent']) {
    const child = Bun.spawn(['python3', new URL('./relay-guest-harness.py', import.meta.url).pathname], {
      stdin: new Blob([
        JSON.stringify({ python: request.python, expected: request.expected, bootstrap, configuration, scenario }),
      ]),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [exit, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    if (scenario === 'observe-complete') {
      expect(stderr).toBe('');
      expect(exit).toBe(0);
      expect(JSON.parse(stdout.trim().split('\n').at(-1) as string)).toMatchObject({
        starts: 0,
        parserRuns: 0,
        executions: 2,
      });
    } else {
      expect(exit).not.toBe(0);
      expect(stderr).toContain('observation');
      expect(stdout).not.toContain('XCSH_RELAY_RECEIPT');
    }
  }
});

function relayWorkflowFixture(engine: 'native' | 'terraform' = 'native', ha = false, dual = false, traffic = false) {
  const f = routeServerFixture(engine, ha, dual, traffic);
  const d = deploymentFixture(engine, ha, dual, traffic);
  const source = compileAzureRelayDeploymentPlan(d.source, d.selection, d.catalog);
  const plan = azureRelayPlanForDeployment(source);
  for (const value of Object.values(f.objects))
    if (value.tags) {
      value.tags['xcsh-plan-sha256'] = source.planSha256;
      if (value.tags['xcsh-relay-plan-sha256']) value.tags['xcsh-relay-plan-sha256'] = plan.planSha256;
    }
  f.server.tags['xcsh-plan-sha256'] = source.planSha256;
  const expected: Array<{ node: string; role: 'slo' | 'sli'; mac: string }> = [];
  const observed: Array<{
    node: string;
    role: 'slo' | 'sli';
    mac: string;
    device: string;
    interfaceName: string;
    mtu: number;
    linkUp: boolean;
    ipv4: { address: string; prefixLength: number } | null;
  }> = [];
  for (let node = 1; node <= source.topology.nodeCount; node++) {
    const vm = source.actions.find((item) => item.kind === 'vm-create' && item.node === node);
    if (!vm?.resourceId) throw Error('missing VM');
    const nics = source.nics.map((nic) => {
      const action = source.actions.find(
        (item) => item.kind === 'nic-create' && item.node === node && item.resourceId?.endsWith(`-nic${nic.index}`),
      );
      if (!action?.resourceId) throw Error('missing NIC');
      return { nic, action, id: action.resourceId };
    });
    const tags = {
      'xcsh-managed-by': 'azure-ce',
      'xcsh-execution-engine': engine,
      'xcsh-deployment-id': source.deploymentName,
      'xcsh-plan-sha256': source.planSha256,
    };
    f.objects[vm.resourceId] = {
      id: vm.resourceId,
      name: `${source.deploymentName}-${node}`,
      location: source.region,
      provisioningState: 'Succeeded',
      tags,
      vmId: `00000000-0000-4000-8000-${String(node).padStart(12, '0')}`,
      networkProfile: { networkInterfaces: nics.map((item) => ({ id: item.id })) },
    };
    for (const item of nics) {
      if (item.nic.role !== 'slo' && item.nic.role !== 'sli') throw Error('Relay fixture requires SLO/SLI NICs');
      const mac = `02:55:00:00:0${node}:0${item.nic.index}`;
      const address = `10.${item.nic.role === 'slo' ? 20 : 21}.0.${node + 3}`;
      const subnet = source.actions.find(
        (action) =>
          action.kind === 'subnet-create' && action.args?.[action.args.indexOf('--name') + 1] === item.nic.subnet.name,
      );
      if (!subnet?.resourceId) throw Error('missing subnet');
      f.objects[item.id] = {
        id: item.id,
        location: source.region,
        provisioningState: 'Succeeded',
        tags,
        macAddress: mac,
        virtualMachine: { id: vm.resourceId },
        ipConfigurations: [
          {
            id: `${item.id}/ipConfigurations/ipconfig1`,
            name: 'ipconfig1',
            primary: true,
            privateIPAddressVersion: 'IPv4',
            privateIPAddress: address,
            subnet: { id: subnet.resourceId },
          },
        ],
      };
      expected.push({ node: `${source.deploymentName}-${node}`, role: item.nic.role, mac });
      observed.push({
        node: `${source.deploymentName}-${node}`,
        role: item.nic.role,
        mac,
        device: `eth${item.nic.index}`,
        interfaceName: `ce-${node}-${item.nic.role}`,
        mtu: 1500,
        linkUp: true,
        ipv4: item.nic.role === 'slo' ? { address, prefixLength: 24 } : null,
      });
    }
  }
  const saved = new Map<string, unknown>();
  const storage = {
    owner: {
      deploymentId: source.deploymentName,
      engine,
      provider: 'azure' as const,
      account: source.subscription.id,
      region: source.region,
    },
    async verify() {},
    async read(name: string) {
      if (!saved.has(name)) throw Object.assign(Error('missing'), { code: 'ENOENT' });
      return structuredClone(saved.get(name));
    },
    async write(name: string, value: unknown) {
      saved.set(name, structuredClone(value));
    },
  };
  let mutations = 0;
  let probes = 0;
  let lose = false;
  let siteUid = 'owned-site-uid';
  let interfaceStatus: 'observed' | 'down' | 'unknown' = 'observed';
  let routing = 0;
  const runtime = {
    engine,
    async observeOwnedSite() {
      return { system_metadata: { uid: siteUid } };
    },
    async observeAzureInterfaces() {
      return {
        status: interfaceStatus,
        freshness: 'verified' as const,
        canSatisfyInterfaceMutationGate: true,
        interfaces: structuredClone(observed),
        observedAt: new Date().toISOString(),
      };
    },
    async ensureAzureRelayRouting(
      _binding: unknown,
      _asn: unknown,
      _interfaces: unknown,
      _relays: unknown,
      checkpoint: (value: Record<string, unknown>) => Promise<void>,
    ) {
      expect(_interfaces).toEqual(
        observed
          .filter((row) => row.role === 'slo')
          .map((row) => ({ node: row.node, role: 'slo', interfaceName: row.interfaceName })),
      );
      expect(_relays).toEqual(
        plan.relays.map((relay) => ({ name: relay.name, address: relay.privateAddress, asn: relay.asn })),
      );
      routing++;
      const routingSpec = buildAzureRelayRouting(
        source.siteName,
        plan.localAsn,
        _interfaces as Parameters<typeof buildAzureRelayRouting>[2],
        _relays as Parameters<typeof buildAzureRelayRouting>[3],
        () => {},
      );
      await checkpoint({
        kind: 'bgp',
        uid: 'owned-bgp-uid',
        name: routingSpec.bgp.name,
        siteName: source.siteName,
        siteUid,
        owner: storage.owner,
        localAsn: plan.localAsn,
        interfaces: _interfaces,
        relays: _relays,
        expectedSessions: routingSpec.expectedSessions,
        expectedPeers: routingSpec.expectedPeers,
        contractFingerprint: 'synthetic',
      });
    },
  };
  const guests = new Map<string, Record<string, unknown>>();
  const api: AzExecApi = {
    async exec(command, args, options) {
      if (args[0] === 'vm' && args[1] === 'run-command') {
        const script = args[args.indexOf('--scripts') + 1];
        const match = /payload = json.loads\(base64.b64decode\('([A-Za-z0-9+/=]+)'\)\)/.exec(script);
        if (!match) throw Error('invalid guest payload');
        const payload = JSON.parse(Buffer.from(match[1], 'base64').toString());
        if (payload.mode === 'activate') {
          mutations++;
          guests.set(payload.expected.relayName, payload.expected);
          if (lose) {
            lose = false;
            throw Error('guest interrupted after submission');
          }
        } else {
          probes++;
          if (!guests.has(payload.expected.relayName))
            return {
              exitCode: 0,
              stderr: '',
              stdout: JSON.stringify({
                value: [
                  { code: 'ComponentStatus/StdOut/succeeded', level: 'Info', message: '' },
                  {
                    code: 'ComponentStatus/StdErr/succeeded',
                    level: 'Info',
                    message: 'Guest configuration observation unavailable',
                  },
                ],
              }),
            };
        }
        const stored = guests.get(payload.expected.relayName);
        const value = {
          ...stored,
          nonce: payload.expected.nonce,
          status: 'configured',
          imageId: `sha256:${'b'.repeat(64)}`,
          interfaceName: 'eth0',
          containerId: 'c'.repeat(64),
        };
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            value: [
              {
                code: 'ComponentStatus/StdOut/succeeded',
                level: 'Info',
                message: `XCSH_RELAY_RECEIPT:${payload.expected.nonce}:${JSON.stringify(value)}`,
              },
              { code: 'ComponentStatus/StdErr/succeeded', level: 'Info', message: '' },
            ],
          }),
        };
      }
      return f.api.exec(command, args, options);
    },
  };
  return {
    ...f,
    source,
    plan,
    expected,
    observed,
    runtime,
    storage,
    saved,
    api,
    guests,
    get mutations() {
      return mutations;
    },
    get probes() {
      return probes;
    },
    get routing() {
      return routing;
    },
    get lose() {
      return lose;
    },
    set lose(value: boolean) {
      lose = value;
    },
    get siteUid() {
      return siteUid;
    },
    set siteUid(value: string) {
      siteUid = value;
    },
    get interfaceStatus() {
      return interfaceStatus;
    },
    set interfaceStatus(value: 'observed' | 'down' | 'unknown') {
      interfaceStatus = value;
    },
  };
}

test('relay coordinator joins current CE/cloud identities, configures both guests and recovers response loss without resubmission', async () => {
  for (const engine of ['native', 'terraform'] as const)
    for (const ha of [false, true]) {
      const f = relayWorkflowFixture(engine, ha);
      f.lose = true;
      await expect(ensureAzureRelayRoutingWorkflow(f.source, f.expected, f.runtime, f.storage, f.api)).rejects.toThrow(
        'interrupted',
      );
      expect(f.mutations).toBe(1);
      expect(f.saved.get('relay-routing-workflow.json')).toMatchObject({
        relays: { [f.plan.relays[0].name]: { submitted: true } },
      });
      const receipt = await ensureAzureRelayRoutingWorkflow(f.source, f.expected, f.runtime, f.storage, f.api);
      expect(receipt.status).toBe('configured');
      expect(receipt.routing).toBe('unknown');
      expect(receipt.traffic).toBe('unknown');
      expect(f.mutations).toBe(2);
      expect(f.probes).toBeGreaterThan(0);
      await ensureAzureRelayRoutingWorkflow(f.source, f.expected, f.runtime, f.storage, f.api);
      expect(f.mutations).toBe(2);
    }
});

test('relay coordinator rejects foreign identity, down/unavailable CE evidence, changed site and forged journal', async () => {
  for (const kind of ['mac', 'ip', 'owner', 'down', 'unknown', 'duplicate', 'journal', 'site'] as const) {
    const f = relayWorkflowFixture();
    if (kind === 'mac') f.observed[0].mac = '02:00:00:00:00:00';
    if (kind === 'ip' && f.observed[0].ipv4) f.observed[0].ipv4.address = '10.20.0.99';
    if (kind === 'owner') {
      const vm = f.source.actions.find((item) => item.kind === 'vm-create');
      if (!vm?.resourceId) throw Error('missing VM');
      relayFixtureField(f.objects[vm.resourceId], 'tags')['xcsh-plan-sha256'] = 'f'.repeat(64);
    }
    if (kind === 'down') f.interfaceStatus = 'down';
    if (kind === 'unknown') f.interfaceStatus = 'unknown';
    if (kind === 'duplicate') f.observed.push(f.observed[0]);
    if (kind === 'journal')
      f.saved.set('relay-routing-workflow.json', { schemaVersion: 1, sourcePlanSha256: 'f'.repeat(64) });
    if (kind === 'site') {
      await ensureAzureRelayRoutingWorkflow(f.source, f.expected, f.runtime, f.storage, f.api);
      f.siteUid = 'foreign-site-uid';
    }
    const before = f.mutations;
    await expect(ensureAzureRelayRoutingWorkflow(f.source, f.expected, f.runtime, f.storage, f.api)).rejects.toThrow();
    expect(f.mutations).toBe(before);
  }
});

test('relay coordinator rejects forged submission and IP configuration identities before any mutation', async () => {
  for (const kind of ['child-journal', 'extra-journal', 'ip-config'] as const) {
    const f = relayWorkflowFixture();
    if (kind === 'ip-config') {
      const action = f.source.actions.find((item) => item.kind === 'nic-create');
      if (!action?.resourceId) throw Error('missing NIC');
      relayFixtureField(f.objects[action.resourceId], 'ipConfigurations')[0].id = '/foreign/ipconfig';
    } else {
      f.lose = true;
      await expect(
        ensureAzureRelayRoutingWorkflow(f.source, f.expected, f.runtime, f.storage, f.api),
      ).rejects.toThrow();
      const journal = f.saved.get('relay-routing-workflow.json') as {
        relays: Record<string, { nonce: string }>;
        extra?: boolean;
      };
      if (kind === 'child-journal') journal.relays[f.plan.relays[0].name].nonce = 'invalid';
      else journal.extra = true;
    }
    const before = f.mutations;
    const routing = f.routing;
    await expect(ensureAzureRelayRoutingWorkflow(f.source, f.expected, f.runtime, f.storage, f.api)).rejects.toThrow();
    expect(f.mutations).toBe(before);
    expect(f.routing).toBe(routing);
  }
});

test('relay coordinator preserves unknown submitted outcomes and rejects disappearing or changed guests', async () => {
  for (const kind of ['submitted-absent', 'changed-config', 'final-disappearance'] as const) {
    const f = relayWorkflowFixture();
    if (kind === 'final-disappearance') {
      const base = f.api.exec;
      f.api.exec = async (command, args, options) => {
        const result = await base(command, args, options);
        if (args[1] === 'run-command' && f.mutations === 2) f.guests.delete(f.plan.relays[0].name);
        return result;
      };
    } else {
      f.lose = true;
      await expect(ensureAzureRelayRoutingWorkflow(f.source, f.expected, f.runtime, f.storage, f.api)).rejects.toThrow(
        'interrupted',
      );
      if (kind === 'submitted-absent') f.guests.delete(f.plan.relays[0].name);
      else {
        const value = f.guests.get(f.plan.relays[0].name);
        if (!value) throw Error('missing guest');
        value.configSha256 = 'f'.repeat(64);
      }
    }
    const before = f.mutations;
    await expect(ensureAzureRelayRoutingWorkflow(f.source, f.expected, f.runtime, f.storage, f.api)).rejects.toThrow();
    expect(f.mutations).toBe(kind === 'final-disappearance' ? 2 : before);
  }
});

test('relay coordinator rejects wrong engine/storage, unavailable cloud reads and bounds ignored cancellation', async () => {
  for (const kind of ['engine', 'storage', 'permission', 'abort'] as const) {
    const f = relayWorkflowFixture();
    let calls = 0;
    const api: AzExecApi = {
      async exec() {
        calls++;
        if (kind === 'abort') return new Promise(() => {});
        return { exitCode: 1, stdout: '', stderr: 'AuthorizationFailed' };
      },
    };
    if (kind === 'engine') f.runtime.engine = 'terraform';
    if (kind === 'storage') f.storage.owner.deploymentId = 'foreign-owner';
    const abort = new AbortController();
    if (kind === 'abort') setTimeout(() => abort.abort(Error('cancel coordinator')), 20);
    await expect(
      ensureAzureRelayRoutingWorkflow(f.source, f.expected, f.runtime, f.storage, api, abort.signal),
    ).rejects.toThrow();
    expect(f.mutations).toBe(0);
    expect(f.routing).toBe(0);
    if (['engine', 'storage'].includes(kind)) expect(calls).toBe(0);
  }
});

function routeExchangeFixture(engine: 'native' | 'terraform' = 'native', ha = false) {
  const f = routeServerFixture(engine, ha);
  const service = ['10.255.0.4', '10.255.0.5'];
  const routeMaps: Record<string, Record<string, unknown[]>> = {};
  for (const relay of f.plan.relays) {
    for (const direction of ['learned', 'advertised'] as const) {
      routeMaps[`${relay.name}/${direction}`] = Object.fromEntries(
        service.map((localAddress, index) => [
          `RouteServiceRole_IN_${index}`,
          (direction === 'learned' ? f.plan.vipPrefixes : f.plan.returnPrefixes).map((network) => ({
            localAddress,
            network,
            nextHop: direction === 'learned' ? relay.privateAddress : localAddress,
            sourcePeer: direction === 'learned' ? relay.privateAddress : localAddress,
            origin: direction === 'learned' ? 'EBgp' : 'Igp',
            asPath: direction === 'learned' ? `${relay.asn}-${f.plan.localAsn}` : '65515',
            weight: direction === 'learned' ? 32768 : 0,
          })),
        ]),
      );
    }
  }
  const routeCalls: string[][] = [];
  const api: AzExecApi = {
    async exec(command, args, options) {
      const direction = args.includes('list-learned-routes')
        ? 'learned'
        : args.includes('list-advertised-routes')
          ? 'advertised'
          : undefined;
      if (!direction) return f.api.exec(command, args, options);
      routeCalls.push(args);
      expect(command).toBe('az');
      expect(args[args.indexOf('--subscription') + 1]).toBe(f.source.subscription.id);
      return {
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify(routeMaps[`${args[args.indexOf('--name') + 1]}/${direction}`]),
      };
    },
  };
  return { ...f, api, routeCalls, routeMaps };
}

test('relay cloud exchange binds both service roles to exact VIP and Azure return paths for both engines/topologies', async () => {
  for (const engine of ['native', 'terraform'] as const)
    for (const ha of [false, true]) {
      const f = routeExchangeFixture(engine, ha);
      const evidence = await observeAzureRelayRouteExchange(f.source, f.plan, f.api);
      expect(evidence.status).toBe('observed');
      expect(evidence.peers).toHaveLength(2);
      expect(evidence.peers.every((peer) => peer.learned.length === 2 && peer.advertised.length === 2)).toBe(true);
      expect(evidence.sessions).toBe('unknown');
      expect(evidence.freshness).toBe('unqualified');
      expect(evidence.traffic).toBe('unknown');
      expect(evidence.ceSampleFreshnessQualified).toBe(false);
      expect(f.routeCalls).toHaveLength(4);
      expect(
        [...f.calls, ...f.routeCalls].every(
          (args) => !args.some((arg) => ['create', 'update', 'delete', 'invoke'].includes(arg)),
        ),
      ).toBe(true);
    }
});

test('relay route parser rejects partial, duplicate, malformed and foreign routes with no count-only passes', async () => {
  const f = routeExchangeFixture();
  const identity = await observeAzureRelayRouteServerIdentity(f.source, f.plan, f.api);
  const relay = f.plan.relays[0];
  const learned = f.routeMaps[`${relay.name}/learned`];
  const advertised = f.routeMaps[`${relay.name}/advertised`];
  const mutations: Array<(value: Record<string, unknown[]>) => void> = [
    (v) => {
      delete v.RouteServiceRole_IN_1;
    },
    (v) => {
      v.nextLink = [];
    },
    (v) => {
      v.RouteServiceRole_IN_1 = [];
    },
    (v) => {
      v.RouteServiceRole_IN_0.push(v.RouteServiceRole_IN_0[0]);
    },
    (v) => {
      (v.RouteServiceRole_IN_0[0] as Record<string, unknown>).network = '10.250.0.0/24';
    },
    (v) => {
      (v.RouteServiceRole_IN_0[0] as Record<string, unknown>).network = '10.30.0.1/24';
    },
    (v) => {
      (v.RouteServiceRole_IN_0[0] as Record<string, unknown>).localAddress = '10.255.0.6';
    },
    (v) => {
      (v.RouteServiceRole_IN_0[0] as Record<string, unknown>).sourcePeer = relay.privateAddress;
    },
    (v) => {
      (v.RouteServiceRole_IN_0[0] as Record<string, unknown>).nextHop = '10.20.0.99';
    },
    (v) => {
      (v.RouteServiceRole_IN_0[0] as Record<string, unknown>).asPath = '64512-65515';
    },
    (v) => {
      (v.RouteServiceRole_IN_0[0] as Record<string, unknown>).asPath = '4294967295';
    },
    (v) => {
      (v.RouteServiceRole_IN_0[0] as Record<string, unknown>).origin = 'EBgp';
    },
    (v) => {
      (v.RouteServiceRole_IN_0[0] as Record<string, unknown>).weight = -1;
    },
  ];
  for (const mutate of mutations) {
    const raw = structuredClone(advertised);
    mutate(raw);
    expect(() => parseAzureRelayRouteExchange(f.source, f.plan, relay.name, identity, learned, raw)).toThrow();
  }
  for (const changes of [
    { sourcePeer: '10.20.0.99' },
    { nextHop: '10.20.0.99' },
    { asPath: '65001-64512-65010' },
    { asPath: '65010-65001-65010' },
    { asPath: '65001-65010-65001-65010' },
    { origin: 'Igp' },
  ]) {
    const raw = structuredClone(learned);
    Object.assign(raw.RouteServiceRole_IN_0[0] as object, changes);
    expect(() => parseAzureRelayRouteExchange(f.source, f.plan, relay.name, identity, raw, advertised)).toThrow();
  }
  // Public schema permits two distinct local-address paths in a role; only exact duplicates are rejected.
  const raw = structuredClone(learned);
  raw.RouteServiceRole_IN_0.push({ ...(raw.RouteServiceRole_IN_0[0] as object), localAddress: '10.255.0.5' });
  expect(
    parseAzureRelayRouteExchange(f.source, f.plan, relay.name, identity, raw, advertised).learned[0].matches[0].paths,
  ).toHaveLength(2);
});

test('relay route collector rejects request acknowledgements, authorization failures and changing cloud identities', async () => {
  for (const scenario of ['ack', 'auth', 'changed', 'malformed'] as const) {
    const f = routeExchangeFixture();
    const api: AzExecApi = {
      async exec(command, args, options) {
        if (args.includes('list-learned-routes')) {
          if (scenario === 'ack') return { exitCode: 0, stderr: '', stdout: '{}' };
          if (scenario === 'auth') return { exitCode: 1, stderr: 'AuthorizationFailed', stdout: '' };
          if (scenario === 'malformed') return { exitCode: 0, stderr: '', stdout: 'not-json' };
          f.objects[f.plan.relays[0].nicId].macAddress = '02:11:22:33:44:99';
        }
        return f.api.exec(command, args, options);
      },
    };
    await expect(observeAzureRelayRouteExchange(f.source, f.plan, api)).rejects.toThrow();
  }
});

test('relay route collection cancellation bounds an executor that ignores abort without any mutation', async () => {
  const f = routeExchangeFixture();
  let calls = 0;
  const api: AzExecApi = {
    async exec() {
      calls++;
      return new Promise<never>(() => {});
    },
  };
  await expect(observeAzureRelayRouteExchange(f.source, f.plan, api, AbortSignal.timeout(20))).rejects.toThrow();
  expect(calls).toBe(1);
  const forged = structuredClone(f.plan);
  forged.planSha256 = 'a'.repeat(64);
  await expect(observeAzureRelayRouteExchange(f.source, forged, api)).rejects.toThrow();
  expect(calls).toBe(1);
});

test('generated FRR session probe verifies exact neighbors for both engines and topologies without guest mutation', async () => {
  for (const engine of ['native', 'terraform'] as const)
    for (const ha of [false, true]) {
      const f = routeServerFixture(engine, ha);
      const server = await observeAzureRelayRouteServerIdentity(f.source, f.plan, f.api);
      const endpoints = Array.from({ length: f.source.topology.nodeCount }, (_, index) => ({
        node: index + 1,
        address: `10.20.0.${index + 4}`,
      }));
      for (const relay of f.plan.relays) {
        const request = compileAzureRelayGuestSessions(f.source, f.plan, relay.name, server, endpoints, 'a'.repeat(32));
        const bootstrap = JSON.parse(
          renderAzureRelayCloudInit(f.source, f.plan, relay.name).slice('#cloud-config\n'.length),
        );
        const child = Bun.spawn(['python3', new URL('./relay-guest-harness.py', import.meta.url).pathname], {
          stdin: new Blob([
            JSON.stringify({
              ...request,
              bootstrap,
              configuration: request.observation.configuration,
              scenario: 'sessions-complete',
            }),
          ]),
          stdout: 'pipe',
          stderr: 'pipe',
        });
        const [exit, stdout, stderr] = await Promise.all([
          child.exited,
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
        ]);
        expect(exit).toBe(0);
        expect(stderr).toBe('');
        const lines = stdout.trim().split('\n');
        expect(JSON.parse(lines.at(-1) as string)).toMatchObject({ starts: 0, parserRuns: 0, executions: 2 });
        const response = {
          value: [
            { code: 'ComponentStatus/StdOut/succeeded', level: 'Info', message: lines[0] },
            { code: 'ComponentStatus/StdErr/succeeded', level: 'Info', message: '' },
          ],
        };
        const receipt = parseAzureRelayGuestSessions(request, response);
        expect(receipt.status).toBe('observed');
        expect(receipt.sessions).toHaveLength(f.source.topology.nodeCount + 2);
        expect(receipt.freshness).toBe('unqualified');
        expect(receipt.routeExchange).toBe('unknown');
        expect(receipt.traffic).toBe('unknown');
        expect(Buffer.byteLength(lines[0])).toBeLessThan(4096);
        const prefix = `XCSH_RELAY_SESSIONS:${request.expected.nonce}:`;
        const value = JSON.parse(lines[0].slice(prefix.length));
        for (const changed of [
          { ...value, sessions: value.sessions.slice(1) },
          { ...value, sessions: [...value.sessions.slice(0, -1), value.sessions[0]] },
          { ...value, sessions: value.sessions.map((s: object) => ({ ...s, state: 'Idle' })) },
          { ...value, guest: { ...value.guest, containerId: 'bad' } },
        ]) {
          const raw = structuredClone(response);
          raw.value[0].message = prefix + JSON.stringify(changed);
          expect(() => parseAzureRelayGuestSessions(request, raw)).toThrow();
        }
        const forged = structuredClone(request);
        forged.requestSha256 = 'b'.repeat(64);
        expect(() => parseAzureRelayGuestSessions(forged, response)).toThrow();
        const acknowledged = structuredClone(response);
        acknowledged.value[0].code = 'ProvisioningState/succeeded';
        expect(() => parseAzureRelayGuestSessions(request, acknowledged)).toThrow();
      }
    }
});

test('generated FRR session probe rejects unavailable, foreign, missing and non-established neighbors', async () => {
  const f = routeServerFixture();
  const server = await observeAzureRelayRouteServerIdentity(f.source, f.plan, f.api);
  const request = compileAzureRelayGuestSessions(
    f.source,
    f.plan,
    f.plan.relays[0].name,
    server,
    [{ node: 1, address: '10.20.0.4' }],
    'a'.repeat(32),
  );
  const bootstrap = JSON.parse(
    renderAzureRelayCloudInit(f.source, f.plan, f.plan.relays[0].name).slice('#cloud-config\n'.length),
  );
  for (const scenario of [
    'sessions-missing',
    'sessions-foreign',
    'sessions-idle',
    'sessions-foreign-asn',
    'sessions-foreign-host',
    'sessions-admin-down',
    'sessions-missing-state',
    'sessions-diagnostics',
    'sessions-container-changed',
  ]) {
    const child = Bun.spawn(['python3', new URL('./relay-guest-harness.py', import.meta.url).pathname], {
      stdin: new Blob([
        JSON.stringify({ ...request, bootstrap, configuration: request.observation.configuration, scenario }),
      ]),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [exit, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(exit).not.toBe(0);
    expect(stdout).not.toContain('XCSH_RELAY_SESSIONS');
    expect(stderr).toContain(scenario === 'sessions-diagnostics' ? 'diagnostics' : 'RuntimeError');
  }
});

test('FRR received/advertised prefix probes bind current peers and preserve implicit-self encoding for both engines/topologies', async () => {
  for (const engine of ['native', 'terraform'] as const)
    for (const ha of [false, true]) {
      const f = routeServerFixture(engine, ha);
      const server = await observeAzureRelayRouteServerIdentity(f.source, f.plan, f.api);
      const endpoints = Array.from({ length: f.source.topology.nodeCount }, (_, index) => ({
        node: index + 1,
        address: `10.20.0.${index + 4}`,
      }));
      for (const relay of f.plan.relays)
        for (const direction of ['received', 'advertised'] as const)
          for (const vip of [true, false]) {
            const prefix = (vip ? f.plan.vipPrefixes : f.plan.returnPrefixes)[0];
            const peer = direction === 'received' ? undefined : vip ? server.serviceAddresses[0] : endpoints[0].address;
            const request = compileAzureRelayGuestRoute(
              f.source,
              f.plan,
              relay.name,
              server,
              endpoints,
              'a'.repeat(32),
              direction,
              prefix,
              peer,
            );
            const bootstrap = JSON.parse(
              renderAzureRelayCloudInit(f.source, f.plan, relay.name).slice('#cloud-config\n'.length),
            );
            const child = Bun.spawn(['python3', new URL('./relay-guest-harness.py', import.meta.url).pathname], {
              stdin: new Blob([
                JSON.stringify({
                  ...request,
                  expected: request.sessionRequest.expected,
                  sessionBinding: request.sessionRequest.sessionBinding,
                  bootstrap,
                  configuration: request.sessionRequest.observation.configuration,
                  scenario: 'routes-complete',
                }),
              ]),
              stdout: 'pipe',
              stderr: 'pipe',
            });
            const [exit, stdout, stderr] = await Promise.all([
              child.exited,
              new Response(child.stdout).text(),
              new Response(child.stderr).text(),
            ]);
            expect(exit).toBe(0);
            expect(stderr).toBe('');
            const lines = stdout.trim().split('\n');
            expect(JSON.parse(lines.at(-1) as string)).toMatchObject({ starts: 0, parserRuns: 0, executions: 2 });
            const response = {
              value: [
                { code: 'ComponentStatus/StdOut/succeeded', level: 'Info', message: lines[0] },
                { code: 'ComponentStatus/StdErr/succeeded', level: 'Info', message: '' },
              ],
            };
            const receipt = parseAzureRelayGuestRoute(request, response);
            expect(receipt.status).toBe('observed');
            expect(receipt.route.prefix).toBe(prefix);
            expect(receipt.route.nextHopEncoding).toBe(direction === 'received' ? 'explicit' : 'implicit-self');
            expect(receipt.fib).toBe('unknown');
            expect(receipt.traffic).toBe('unknown');
            expect(receipt.freshness).toBe('unqualified');
            expect(Buffer.byteLength(lines[0])).toBeLessThan(4096);
            const marker = `XCSH_RELAY_ROUTE:${request.sessionRequest.expected.nonce}:`;
            const payload = JSON.parse(lines[0].slice(marker.length));
            for (const changes of [
              { prefix: '10.20.0.99/32' },
              { path: '64512' },
              { asn: 64512 },
              { peerAddress: '10.20.0.99' },
              { nextHop: '10.20.0.99' },
              { selected: false },
            ]) {
              const bad = structuredClone(response);
              bad.value[0].message = marker + JSON.stringify({ ...payload, route: { ...payload.route, ...changes } });
              expect(() => parseAzureRelayGuestRoute(request, bad)).toThrow();
            }
            const bad = structuredClone(request);
            bad.requestSha256 = 'b'.repeat(64);
            expect(() => parseAzureRelayGuestRoute(bad, response)).toThrow();
          }
    }
});

test('FRR prefix probes reject missing, stale, duplicate, partial and foreign route evidence', async () => {
  const f = routeServerFixture();
  const server = await observeAzureRelayRouteServerIdentity(f.source, f.plan, f.api);
  const relay = f.plan.relays[0];
  const endpoints = [{ node: 1, address: '10.20.0.4' }];
  const bootstrap = JSON.parse(renderAzureRelayCloudInit(f.source, f.plan, relay.name).slice('#cloud-config\n'.length));
  for (const direction of ['received', 'advertised'] as const) {
    const request = compileAzureRelayGuestRoute(
      f.source,
      f.plan,
      relay.name,
      server,
      endpoints,
      'a'.repeat(32),
      direction,
      f.plan.vipPrefixes[0],
      direction === 'advertised' ? server.serviceAddresses[0] : undefined,
    );
    for (const scenario of [
      'routes-missing-prefix',
      'routes-missing-best',
      'routes-foreign-asn',
      'routes-foreign-path',
      'routes-foreign-nexthop',
      'routes-wrong-count',
      'routes-partial',
      'routes-diagnostics',
      'routes-container-changed',
      ...(direction === 'received'
        ? ['routes-duplicate', 'routes-duplicate-identity', 'routes-stale', 'routes-foreign-source']
        : []),
    ]) {
      const child = Bun.spawn(['python3', new URL('./relay-guest-harness.py', import.meta.url).pathname], {
        stdin: new Blob([
          JSON.stringify({
            ...request,
            expected: request.sessionRequest.expected,
            sessionBinding: request.sessionRequest.sessionBinding,
            bootstrap,
            configuration: request.sessionRequest.observation.configuration,
            scenario,
          }),
        ]),
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const [exit, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      expect(exit).not.toBe(0);
      expect(stdout).not.toContain('XCSH_RELAY_ROUTE');
      expect(stderr).toContain('RuntimeError');
    }
  }
  for (const [direction, prefix, peer] of [
    ['advertised', f.plan.vipPrefixes[0], endpoints[0].address],
    ['advertised', f.plan.returnPrefixes[0], server.serviceAddresses[0]],
    ['advertised', f.plan.vipPrefixes[0], '10.20.0.99'],
    ['received', f.plan.vipPrefixes[0], endpoints[0].address],
    ['received', '10.250.0.99/32', undefined],
  ] as const)
    expect(() =>
      compileAzureRelayGuestRoute(
        f.source,
        f.plan,
        relay.name,
        server,
        endpoints,
        'a'.repeat(32),
        direction,
        prefix,
        peer,
      ),
    ).toThrow();
});

test('generated route probe consumes sanitized actual pinned FRR RIB and advertised JSON', async () => {
  const captured = await Bun.file(new URL('./relay-frr-route-readback.json', import.meta.url)).json();
  expect(captured.provenance.schemaEvidenceOnly).toBe(true);
  expect(captured.provenance.cloudQualified).toBe(false);
  const f = routeServerFixture();
  const server = await observeAzureRelayRouteServerIdentity(f.source, f.plan, f.api);
  const relay = f.plan.relays[0];
  const endpoints = [{ node: 1, address: '10.20.0.4' }];
  const bootstrap = JSON.parse(renderAzureRelayCloudInit(f.source, f.plan, relay.name).slice('#cloud-config\n'.length));
  for (const [direction, prefix, valid] of [
    ['received', f.plan.vipPrefixes[0], true],
    ['advertised', f.plan.vipPrefixes[0], true],
    ['received', f.plan.returnPrefixes[0], false],
  ] as const) {
    const request = compileAzureRelayGuestRoute(
      f.source,
      f.plan,
      relay.name,
      server,
      endpoints,
      'a'.repeat(32),
      direction,
      prefix,
      direction === 'advertised' ? server.serviceAddresses[0] : undefined,
    );
    const child = Bun.spawn(['python3', new URL('./relay-guest-harness.py', import.meta.url).pathname], {
      stdin: new Blob([
        JSON.stringify({
          ...request,
          expected: request.sessionRequest.expected,
          sessionBinding: request.sessionRequest.sessionBinding,
          bootstrap,
          configuration: request.sessionRequest.observation.configuration,
          scenario: 'routes-captured',
          routeTable: captured[direction],
        }),
      ]),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [exit, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    if (valid) {
      expect(exit).toBe(0);
      expect(stderr).toBe('');
      const result = parseAzureRelayGuestRoute(request, {
        value: [
          { code: 'ComponentStatus/StdOut/succeeded', level: 'Info', message: stdout.trim().split('\n')[0] },
          { code: 'ComponentStatus/StdErr/succeeded', level: 'Info', message: '' },
        ],
      });
      expect(result.route.path).toBe('65010');
      expect(result.route.nextHopEncoding).toBe(direction === 'received' ? 'explicit' : 'implicit-self');
    } else {
      expect(exit).not.toBe(0);
      expect(stdout).not.toContain('XCSH_RELAY_ROUTE');
      expect(stderr).toContain('Selected received path source or next hop differs');
    }
  }
});

async function relayOperationalFixture(
  engine: 'native' | 'terraform' = 'native',
  ha = false,
  dual = false,
  traffic = false,
) {
  const f = relayWorkflowFixture(engine, ha, dual, traffic);
  const configured = await ensureAzureRelayRoutingWorkflow(f.source, f.expected, f.runtime, f.storage, f.api);
  f.saved.set('relay-routing-configuration.json', configured);
  const cloud = routeExchangeFixture(engine, ha);
  let sessionReads = 0;
  let mode = 'complete';
  let guestReads = 0;
  const runtime = {
    ...f.runtime,
    requireAzureRelayRoutingContract() {},
    async observeAzureInterfacesForNodes(_binding: unknown, _complete: unknown, nodes: string[]) {
      return {
        status: 'observed' as const,
        freshness: 'verified' as const,
        canSatisfyInterfaceMutationGate: true,
        interfaces: structuredClone(f.observed.filter((row) => nodes.includes(row.node))),
        observedAt: new Date().toISOString(),
      };
    },
    async observeBgpRoutesForNodes(_binding: unknown, nodes: string[]) {
      return {
        pathInventory: {
          status: 'unknown' as const,
          reason: 'synthetic-no-path-inventory',
          scope: 'unqualified' as const,
          freshness: 'unqualified' as const,
          traffic: 'unknown' as const,
        },
        status: 'observed' as const,
        nodes: nodes.map((node) => ({
          node,
          routingInstances: [{ name: 'opaque-ri', tables: [{ name: 'opaque-table', imported: [], exported: [] }] }],
        })),
        owner: f.storage.owner,
        siteName: f.source.siteName,
        source: 'synthetic',
        observedAt: new Date().toISOString(),
        contractFingerprint: 'synthetic',
      };
    },
    async observeBgpSessions(
      _binding: unknown,
      expected: Array<{ node: string; interfaceName: string; peerAddress: string }>,
    ) {
      sessionReads++;
      expect(expected).toEqual(
        f.observed
          .filter((row) => row.role === 'slo' && (mode !== 'outage' || row.node !== `${f.source.deploymentName}-2`))
          .flatMap((row) =>
            f.plan.relays.map((relay) => ({
              node: row.node,
              interfaceName: row.interfaceName,
              peerAddress: relay.privateAddress,
            })),
          ),
      );
      return {
        status:
          mode === 'sessions-down' || (mode === 'final-sessions-down' && sessionReads > 1)
            ? ('degraded' as const)
            : ('healthy' as const),
        establishedSessions: expected.length,
        expectedSessions: expected.length,
        sessions: expected.map((row) => ({
          ...row,
          state: 'Established',
          receivedPrefixCount: 1,
          advertisedPrefixCount: 1,
          stateChangedAt: '2026-01-01T00:00:00Z',
        })),
        owner: f.storage.owner,
        siteName: f.source.siteName,
        source: 'synthetic',
        observedAt: new Date().toISOString(),
        contractFingerprint: 'synthetic',
      };
    },
    async observeBgpRoutes() {
      if (mode === 'ce-routes-unavailable') throw Error('route inventory unavailable');
      return {
        pathInventory: {
          status: 'unknown' as const,
          reason: 'synthetic-no-path-inventory',
          scope: 'unqualified' as const,
          freshness: 'unqualified' as const,
          traffic: 'unknown' as const,
        },
        status: 'observed' as const,
        nodes: f.observed
          .filter((row) => row.role === 'slo')
          .map((row) => ({
            node: row.node,
            routingInstances: [{ name: 'opaque-ri', tables: [{ name: 'opaque-table', imported: [], exported: [] }] }],
          })),
        owner: f.storage.owner,
        siteName: f.source.siteName,
        source: 'synthetic',
        observedAt: new Date().toISOString(),
        contractFingerprint: 'synthetic',
      };
    },
  };
  const api: AzExecApi = {
    async exec(command, args, options) {
      if (mode === 'outage' && args[0] === 'account')
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            id: f.source.subscription.id,
            tenantId: f.source.subscription.tenantId,
            environmentName: f.source.subscription.cloud,
            state: 'Enabled',
          }),
        };
      if (mode === 'outage' && args.includes('--show-details'))
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({ ...f.objects[args[args.indexOf('--ids') + 1]], powerState: 'VM deallocated' }),
        };
      if (args.includes('list-learned-routes') || args.includes('list-advertised-routes')) {
        if (mode === 'cloud-unavailable') return { exitCode: 1, stdout: '', stderr: 'synthetic unavailable' };
        return cloud.api.exec(command, args, options);
      }
      if (args[0] !== 'vm' || args[1] !== 'run-command') return f.api.exec(command, args, options);
      guestReads++;
      const script = args[args.indexOf('--scripts') + 1];
      const encoded = (name: string) => {
        const match = new RegExp(`${name} = json.loads\\(base64.b64decode\\('([A-Za-z0-9+/=]+)'\\)\\)`).exec(script);
        if (!match) throw Error('invalid read-only probe');
        return JSON.parse(Buffer.from(match[1], 'base64').toString());
      };
      const payload = encoded('payload');
      expect(payload.mode).toBe('observe');
      const sessions = encoded('binding');
      const route = encoded('route_binding');
      if (mode === 'guest-unavailable') return { exitCode: 1, stdout: '', stderr: 'synthetic unavailable' };
      const guest = {
        ...payload.expected,
        status: 'configured',
        imageId: `sha256:${'b'.repeat(64)}`,
        containerId: (mode === 'guest-changed' ? 'd' : 'c').repeat(64),
        interfaceName: 'eth0',
      };
      const sender = route.sourcePeers[0];
      const value = {
        session: {
          guest,
          sessions: sessions.peers.map((peer: { address: string; asn: number }) => ({
            address: peer.address,
            remoteAs: peer.asn,
            localAs: sessions.localAsn,
            localRouterId: sessions.localAddress,
            hostLocal: sessions.localAddress,
            hostForeign: peer.address,
            bgpVersion: 4,
            state: sessions.unavailablePeer?.address === peer.address ? 'Idle' : 'Established',
            ...(sessions.unavailablePeer ? { adminShutDown: false } : {}),
          })),
        },
        route: {
          direction: route.direction,
          prefix: route.prefix,
          asn: sender.asn,
          path: String(sender.asn),
          selected: mode !== 'route-unselected',
          peerAddress: route.direction === 'received' ? sender.address : route.peerAddress,
          nextHop: route.direction === 'received' ? sender.address : '0.0.0.0',
          nextHopEncoding: route.direction === 'received' ? 'explicit' : 'implicit-self',
        },
      };
      const isFib = script.includes('fib_binding =');
      const fib = isFib ? encoded('fib_binding') : undefined;
      const result = isFib
        ? {
            membership: value,
            fib: {
              prefix: route.prefix,
              nextHop: mode === 'fib-foreign' ? '10.20.0.99' : fib.returning ? fib.azureGateway : sender.address,
              interfaceName: 'eth0',
              interfaceIndex: 2,
              protocol: 'bgp',
              table: 254,
              installed: mode !== 'fib-uninstalled',
              lookupAddress: route.prefix.split('/')[0],
              sourceAddress: payload.expected.address,
            },
          }
        : value;
      if (mode === 'site-changed') f.siteUid = 'changed-site-uid';
      return {
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify({
          value: [
            {
              code: 'ComponentStatus/StdOut/succeeded',
              level: 'Info',
              message: `${isFib ? 'XCSH_RELAY_FIB' : 'XCSH_RELAY_ROUTE'}:${payload.expected.nonce}:${JSON.stringify(result)}`,
            },
            { code: 'ComponentStatus/StdErr/succeeded', level: 'Info', message: '' },
          ],
        }),
      };
    },
  };
  return {
    f,
    runtime,
    api,
    get guestReads() {
      return guestReads;
    },
    get mode() {
      return mode;
    },
    set mode(value: string) {
      mode = value;
    },
  };
}

test('read-only relay coordinator joins current CE sessions, every guest prefix/target and cloud exchange for both engines/topologies', async () => {
  for (const engine of ['native', 'terraform'] as const)
    for (const ha of [false, true]) {
      const fixture = await relayOperationalFixture(engine, ha);
      const { f, runtime, api } = fixture;
      const mutations = f.mutations;
      const routing = f.routing;
      const saved = structuredClone([...f.saved.entries()]);
      const evidence = await observeAzureRelayRoutingWorkflow(f.source, f.expected, runtime, f.storage, api);
      expect(evidence.status).toBe('observed');
      expect(evidence.sessions.status).toBe('healthy');
      expect(evidence.finalSessions.status).toBe('healthy');
      expect(evidence.guestRoutes).toHaveLength(
        2 * (f.plan.vipPrefixes.length * 3 + f.plan.returnPrefixes.length * (1 + f.source.topology.nodeCount)),
      );
      expect(new Set(evidence.guestRoutes.map((row) => row.session.guest.nonce)).size).toBe(
        evidence.guestRoutes.length,
      );
      expect(evidence.cloudRoutes.peers).toHaveLength(2);
      expect(evidence.routing).toBe('unknown');
      expect(evidence.ceRouteScope).toBe('unqualified');
      expect(evidence.fib).toBe('unknown');
      expect(evidence.traffic).toBe('unknown');
      expect(evidence.freshness).toBe('unqualified');
      expect(f.mutations).toBe(mutations);
      expect(f.routing).toBe(routing);
      expect([...f.saved.entries()]).toEqual(saved);
    }
});

test('read-only relay coordinator rejects incomplete checkpoints, changed bindings and failed current observations', async () => {
  for (const mode of [
    'journal-missing',
    'journal-partial',
    'journal-foreign',
    'journal-receipt',
    'journal-extra',
    'ce-down',
    'sessions-down',
    'final-sessions-down',
    'ce-routes-unavailable',
    'fib-foreign',
    'fib-uninstalled',
    'guest-unavailable',
    'guest-changed',
    'route-unselected',
    'cloud-unavailable',
    'site-changed',
  ]) {
    const fixture = await relayOperationalFixture();
    const { f, runtime, api } = fixture;
    fixture.mode = mode;
    if (mode === 'journal-missing') f.saved.delete('relay-routing-workflow.json');
    if (mode.startsWith('journal-') && mode !== 'journal-missing') {
      const journal = f.saved.get('relay-routing-workflow.json') as {
        sourcePlanSha256: string;
        relays: Record<string, { receipt: Record<string, unknown> }>;
      };
      if (mode === 'journal-partial') delete journal.relays[f.plan.relays[1].name];
      if (mode === 'journal-foreign') journal.sourcePlanSha256 = 'f'.repeat(64);
      if (mode === 'journal-receipt') journal.relays[f.plan.relays[0].name].receipt.mac = '02:00:00:00:00:99';
      if (mode === 'journal-extra') journal.relays[f.plan.relays[0].name].receipt.extra = true;
    }
    if (mode === 'ce-down') f.interfaceStatus = 'down';
    const mutations = f.mutations;
    const routing = f.routing;
    const saved = structuredClone([...f.saved.entries()]);
    await expect(observeAzureRelayRoutingWorkflow(f.source, f.expected, runtime, f.storage, api)).rejects.toThrow();
    expect(f.mutations).toBe(mutations);
    expect(f.routing).toBe(routing);
    expect([...f.saved.entries()]).toEqual(saved);
    if (mode.startsWith('journal-') || mode === 'ce-down' || mode === 'sessions-down')
      expect(fixture.guestReads).toBe(0);
  }
});

test('read-only relay coordinator rejects wrong engine/store/contracts and bounds ignored cloud cancellation', async () => {
  for (const mode of ['engine', 'owner', 'contract', 'abort']) {
    const fixture = await relayOperationalFixture();
    const { f, runtime } = fixture;
    const mutations = f.mutations;
    const routing = f.routing;
    if (mode === 'engine') runtime.engine = 'terraform';
    if (mode === 'owner') f.storage.owner.account = 'example-foreign-account';
    if (mode === 'contract')
      runtime.requireAzureRelayRoutingContract = () => {
        throw Error('mapping unavailable');
      };
    let calls = 0;
    const api: AzExecApi = {
      async exec() {
        calls++;
        return await new Promise<never>(() => {});
      },
    };
    const abort = new AbortController();
    if (mode === 'abort') setTimeout(() => abort.abort(Error('cancel observation')), 20);
    await expect(
      observeAzureRelayRoutingWorkflow(f.source, f.expected, runtime, f.storage, api, abort.signal),
    ).rejects.toThrow();
    expect(f.mutations).toBe(mutations);
    expect(f.routing).toBe(routing);
    if (mode !== 'abort') expect(calls).toBe(0);
  }
});

test('exact guest FIB observer joins Zebra, Linux route and lookup for VIP and return prefixes across both engines/topologies', async () => {
  for (const engine of ['native', 'terraform'] as const) {
    for (const nodes of [1, 3] as const) {
      const f = routeServerFixture(engine, nodes === 3);
      const identity = await observeAzureRelayRouteServerIdentity(f.source, f.plan, f.api);
      const endpoints = Array.from({ length: nodes }, (_, i) => ({ node: i + 1, address: `10.20.0.${i + 4}` }));
      for (const relay of f.plan.relays) {
        for (const prefix of [...f.plan.vipPrefixes, ...f.plan.returnPrefixes]) {
          const request = compileAzureRelayGuestFib(
            f.source,
            f.plan,
            relay.name,
            identity,
            endpoints,
            'a'.repeat(32),
            'received',
            prefix,
          );
          const bootstrap = JSON.parse(
            renderAzureRelayCloudInit(f.source, f.plan, relay.name).slice('#cloud-config\n'.length),
          );
          const child = Bun.spawn(['python3', new URL('./relay-guest-harness.py', import.meta.url).pathname], {
            stdin: new Blob([
              JSON.stringify({
                python: request.python,
                expected: request.routeRequest.sessionRequest.expected,
                bootstrap,
                configuration: request.routeRequest.sessionRequest.observation.configuration,
                scenario: 'fib-normal',
                sessionBinding: request.routeRequest.sessionRequest.sessionBinding,
                routeBinding: request.routeRequest.routeBinding,
                fibBinding: request.fibBinding,
              }),
            ]),
            stdout: 'pipe',
            stderr: 'pipe',
          });
          const [exit, stdout, stderr] = await Promise.all([
            child.exited,
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
          ]);
          expect(stderr).toBe('');
          expect(exit).toBe(0);
          const message = stdout.trim().split('\n')[0];
          const evidence = parseAzureRelayGuestFib(request, {
            value: [
              { code: 'ComponentStatus/StdOut/succeeded', level: 'Info', message },
              { code: 'ComponentStatus/StdErr/succeeded', level: 'Info', message: '' },
            ],
          });
          expect(evidence.status).toBe('observed');
          expect(evidence.fib.installed).toBe(true);
          expect(evidence.fib.nextHop).toBe(request.fibBinding.returning ? '10.20.0.1' : endpoints[0].address);
          expect(evidence.traffic).toBe('unknown');
          expect(evidence.ceSampleFreshnessQualified).toBe(false);
          for (const change of [{ ...request, requestSha256: 'b'.repeat(64) }])
            expect(() => parseAzureRelayGuestFib(change, {})).toThrow();
        }
      }
    }
  }
});

test('FIB observer rejects missing, default, static, duplicate, uninstalled, foreign and changing forwarding evidence', async () => {
  const f = routeServerFixture();
  const identity = await observeAzureRelayRouteServerIdentity(f.source, f.plan, f.api);
  const request = compileAzureRelayGuestFib(
    f.source,
    f.plan,
    f.plan.relays[0].name,
    identity,
    [{ node: 1, address: '10.20.0.4' }],
    'a'.repeat(32),
    'received',
    f.plan.returnPrefixes[0],
  );
  const bootstrap = JSON.parse(
    renderAzureRelayCloudInit(f.source, f.plan, f.plan.relays[0].name).slice('#cloud-config\n'.length),
  );
  for (const scenario of [
    'fib-default-fallback',
    'fib-kernel-missing',
    'fib-duplicate-kernel',
    'fib-static-substitute',
    'fib-kernel-foreign',
    'fib-lookup-foreign',
    'fib-foreign-device',
    'fib-zebra-not-installed',
    'fib-zebra-foreign',
    'fib-index-foreign',
    'fib-zebra-duplicate',
    'fib-dead-route',
    'fib-diagnostics',
    'fib-container-changed',
  ]) {
    const child = Bun.spawn(['python3', new URL('./relay-guest-harness.py', import.meta.url).pathname], {
      stdin: new Blob([
        JSON.stringify({
          python: request.python,
          expected: request.routeRequest.sessionRequest.expected,
          bootstrap,
          configuration: request.routeRequest.sessionRequest.observation.configuration,
          scenario,
          sessionBinding: request.routeRequest.sessionRequest.sessionBinding,
          routeBinding: request.routeRequest.routeBinding,
          fibBinding: request.fibBinding,
        }),
      ]),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [exit, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(exit).not.toBe(0);
    expect(stderr).toContain('RuntimeError');
    expect(stdout).not.toContain('XCSH_RELAY_FIB');
  }
  expect(() =>
    compileAzureRelayGuestFib(
      f.source,
      f.plan,
      f.plan.relays[0].name,
      identity,
      [{ node: 1, address: '10.20.0.4' }],
      'a'.repeat(32),
      'advertised',
      f.plan.vipPrefixes[0],
      identity.serviceAddresses[0],
    ),
  ).toThrow();
  for (const raw of [{}, { value: [] }, { error: {}, value: [] }])
    expect(() => parseAzureRelayGuestFib(request, raw)).toThrow();
});

test('FIB probe consumes actual pinned-image Zebra and Linux kernel schemas with separately simulated guest/session bindings', async () => {
  const captured = await Bun.file(new URL('./relay-frr-fib-readback.json', import.meta.url)).json();
  expect(captured.provenance.cloudQualified).toBe(false);
  const f = routeServerFixture();
  const identity = await observeAzureRelayRouteServerIdentity(f.source, f.plan, f.api);
  const relay = f.plan.relays[0];
  const bootstrap = JSON.parse(renderAzureRelayCloudInit(f.source, f.plan, relay.name).slice('#cloud-config\n'.length));
  for (const prefix of [...f.plan.vipPrefixes, ...f.plan.returnPrefixes]) {
    const request = compileAzureRelayGuestFib(
      f.source,
      f.plan,
      relay.name,
      identity,
      [{ node: 1, address: '10.20.0.4' }],
      'a'.repeat(32),
      'received',
      prefix,
    );
    const child = Bun.spawn(['python3', new URL('./relay-guest-harness.py', import.meta.url).pathname], {
      stdin: new Blob([
        JSON.stringify({
          python: request.python,
          expected: request.routeRequest.sessionRequest.expected,
          bootstrap,
          configuration: request.routeRequest.sessionRequest.observation.configuration,
          scenario: 'fib-captured',
          sessionBinding: request.routeRequest.sessionRequest.sessionBinding,
          routeBinding: request.routeRequest.routeBinding,
          fibBinding: request.fibBinding,
          interfaceName: 'slo',
          fibZebra: captured.zebra[prefix],
          fibKernel: captured.kernel[prefix],
        }),
      ]),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [exit, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(stderr).toBe('');
    expect(exit).toBe(0);
    const evidence = parseAzureRelayGuestFib(request, {
      value: [
        { code: 'ComponentStatus/StdOut/succeeded', level: 'Info', message: stdout.trim().split('\n')[0] },
        { code: 'ComponentStatus/StdErr/succeeded', level: 'Info', message: '' },
      ],
    });
    expect(evidence.fib.interfaceName).toBe('slo');
    expect(evidence.fib.installed).toBe(true);
    expect(evidence.traffic).toBe('unknown');
  }
});

function present<T>(value: T | undefined): T {
  if (value === undefined) throw Error('Required recovery fixture value unavailable');
  return value;
}

function relayDiscovery(f: ReturnType<typeof nativeExecutionFixture>): AzureCeObservation {
  const observed = structuredClone(observation);
  observed.regions[0].quotaAvailable = 64;
  observed.resources = Object.values(f.objects)
    .filter(
      (raw) => (raw.tags as Record<string, string> | undefined)?.['xcsh-deployment-id'] === f.source.deploymentName,
    )
    .map((raw) => ({
      id: String(raw.id),
      location: raw.location as string,
      exists: true,
      owned: true,
      tags: raw.tags as Record<string, string>,
      state: { provisioningState: (raw.properties as Record<string, unknown>).provisioningState },
    }));
  const vms = observed.resources.filter((resource) => resource.id.includes('/virtualMachines/')).length;
  observed.regions[0].quotaAvailable -= vms * 8;
  return observed;
}
function relayOuterCheckpoint(
  f: ReturnType<typeof nativeExecutionFixture>,
  previous: AzureCeObservation,
): AzureCeCheckpoint {
  const index = f.source.actions.findIndex((action) => action.kind === 'relay-provision');
  const action = f.source.actions[index];
  return {
    schemaVersion: 4,
    engine: 'native',
    planId: f.source.planId,
    planSha256: f.source.planSha256,
    authorization: { apply: true, destroy: false, terms: false },
    completedActionIds: f.source.actions.slice(0, index).map((action) => action.id),
    pendingAction: buildAzureNativePendingAction(f.source, action),
    failedActionId: action.id,
    state: 'partial',
    observationSnapshot: structuredClone(previous),
    observationFingerprint: fingerprintCheckpointObservation(previous),
  };
}

test('read-only relay recovery inspection binds real private journal, current submitted resources and generated disk attachments', async () => {
  const f = nativeExecutionFixture();
  const root = await mkdtemp(join(tmpdir(), 'relay-recovery-store-'));
  try {
    const storage = await CeDeploymentStore.open(root, f.storage.owner);
    const empty = await inspectAzureRelayNativeResources(f.source, f.plan, storage, f.api);
    expect(empty).toMatchObject({ status: 'inspected', complete: false, resources: [] });
    await expect(storage.read('relay-native-execution.json')).rejects.toMatchObject({ code: 'ENOENT' });
    f.lose = true;
    await expect(ensureAzureRelayNativeResources(f.source, f.plan, storage, f.api)).rejects.toThrow('interrupted');
    const before = await readFile(join(storage.directory, 'relay-native-execution.json'));
    const inspected = await inspectAzureRelayNativeResources(f.source, f.plan, storage, f.api);
    expect(inspected.complete).toBe(false);
    expect(inspected.resources.map((raw) => raw.id)).toEqual([f.plan.relays[0].publicIpId]);
    expect(await readFile(join(storage.directory, 'relay-native-execution.json'))).toEqual(before);
    expect(f.puts).toBe(1);
    await ensureAzureRelayNativeResources(f.source, f.plan, storage, f.api);
    const completeBytes = await readFile(join(storage.directory, 'relay-native-execution.json'));
    const complete = await inspectAzureRelayNativeResources(f.source, f.plan, storage, f.api);
    expect(complete.complete).toBe(true);
    expect(complete.resources).toHaveLength(10);
    expect(await readFile(join(storage.directory, 'relay-native-execution.json'))).toEqual(completeBytes);
    expect(f.puts).toBe(8);
    f.objects[f.plan.relays[0].osDiskId].managedBy = f.plan.relays[1].vmId;
    await expect(inspectAzureRelayNativeResources(f.source, f.plan, storage, f.api)).rejects.toThrow('disk identity');
    expect(f.puts).toBe(8);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('relay pending recovery permits only the exact submitted prefix and preserves unrelated drift rejection', async () => {
  const f = nativeExecutionFixture();
  const previous = relayDiscovery(f);
  const checkpoint = relayOuterCheckpoint(f, previous);
  f.lose = true;
  await expect(ensureAzureRelayNativeResources(f.source, f.plan, f.storage, f.api)).rejects.toThrow('interrupted');
  const current = relayDiscovery(f);
  const recovered = await reconcileAzureNativeRelayProvision(f.source, checkpoint, current, f.storage, f.api);
  expect(recovered.completedActionIds).toEqual(checkpoint.completedActionIds);
  expect(recovered.pendingAction).toEqual(checkpoint.pendingAction);
  expect(recovered.observationFingerprint).toBe(fingerprintCheckpointObservation(current));
  expect(f.puts).toBe(1);
  for (const mutate of [
    (observed: AzureCeObservation) => {
      observed.regions[0].quotaAvailable--;
    },
    (observed: AzureCeObservation) => {
      observed.image.version += '-foreign';
    },
    (observed: AzureCeObservation) => {
      observed.resources[0].tags['xcsh-plan-sha256'] = 'f'.repeat(64);
    },
    (observed: AzureCeObservation) => {
      observed.resources.push(structuredClone(observed.resources[0]));
    },
    (observed: AzureCeObservation) => {
      present(observed.resources.at(-1)).owned = false;
    },
    (observed: AzureCeObservation) => {
      observed.resources.push({ id: '/foreign', exists: true, owned: false, tags: {}, state: {} });
    },
  ]) {
    const invalid = structuredClone(current);
    mutate(invalid);
    await expect(reconcileAzureNativeRelayProvision(f.source, checkpoint, invalid, f.storage, f.api)).rejects.toThrow();
    expect(f.puts).toBe(1);
  }
  const foreign = structuredClone(checkpoint);
  present(foreign.pendingAction).requestSha256 = 'f'.repeat(64);
  expect(() => validateAzureNativePendingAction(f.source, foreign.completedActionIds, foreign.pendingAction)).toThrow();
  await expect(
    reconcileAzureNativeRelayProvision(f.source, { ...checkpoint, engine: 'terraform' }, current, f.storage, f.api),
  ).rejects.toThrow('native checkpoint');
  await expect(
    reconcileAzureNativeRelayProvision(
      f.source,
      { ...checkpoint, authorization: { apply: false, terms: false, destroy: false } },
      current,
      f.storage,
      f.api,
    ),
  ).rejects.toThrow('authorized');
  delete f.objects[f.plan.relays[0].publicIpId as string];
  await expect(reconcileAzureNativeRelayProvision(f.source, checkpoint, current, f.storage, f.api)).rejects.toThrow(
    'outcome is unknown',
  );
  expect(f.puts).toBe(1);
});

test('complete relay recovery reconciles VM quota from exact current readback and never repeats provision', async () => {
  const f = nativeExecutionFixture();
  const previous = relayDiscovery(f);
  const checkpoint = relayOuterCheckpoint(f, previous);
  await ensureAzureRelayNativeResources(f.source, f.plan, f.storage, f.api);
  const current = relayDiscovery(f);
  const before = canonicalSha256([...f.saved]);
  const recovered = await reconcileAzureNativeRelayProvision(f.source, checkpoint, current, f.storage, f.api);
  expect(recovered.completedActionIds).toEqual([
    ...checkpoint.completedActionIds,
    present(checkpoint.pendingAction).actionId,
  ]);
  expect(recovered.pendingAction).toBeUndefined();
  expect(recovered.failedActionId).toBeUndefined();
  expect(recovered.state).toBe('running');
  expect(f.puts).toBe(8);
  expect(canonicalSha256([...f.saved])).toBe(before);
  const invalid = structuredClone(current);
  invalid.regions[0].quotaAvailable++;
  await expect(reconcileAzureNativeRelayProvision(f.source, checkpoint, invalid, f.storage, f.api)).rejects.toThrow(
    'outside',
  );
  const extra = structuredClone(current);
  extra.resources.push({ ...structuredClone(present(extra.resources.at(-1))), id: `${f.plan.relays[1].vmId}-foreign` });
  await expect(reconcileAzureNativeRelayProvision(f.source, checkpoint, extra, f.storage, f.api)).rejects.toThrow(
    'outside',
  );
});

test('public native apply resumes the exact relay action after partial submission, completed response loss and post-readback failure', async () => {
  for (const mode of ['partial-submission', 'completed-response-loss', 'post-readback-failure'] as const) {
    const f = nativeExecutionFixture();
    const root = await mkdtemp(join(tmpdir(), 'relay-public-resume-'));
    try {
      const storage = await CeDeploymentStore.open(join(root, 'private'), f.storage.owner);
      const previous = relayDiscovery(f);
      const checkpoint = relayOuterCheckpoint(f, previous);
      if (mode === 'partial-submission') {
        f.lose = true;
        await expect(ensureAzureRelayNativeResources(f.source, f.plan, storage, f.api)).rejects.toThrow('interrupted');
      } else if (mode === 'completed-response-loss') {
        await ensureAzureRelayNativeResources(f.source, f.plan, storage, f.api);
      } else checkpoint.pendingAction = undefined;
      let sequence = 0;
      const session = {
        getSessionId: () => root,
        getArtifactsDir: () => root,
        async saveArtifact(content: string, type: string) {
          const id = String(++sequence).padStart(6, '0');
          await Bun.write(join(root, `${id}.${type}.log`), content);
          return id;
        },
        async getArtifactPath() {
          return null;
        },
      };
      const plannedObservation = structuredClone(observation);
      plannedObservation.regions[0].quotaAvailable = 64;
      await savePlanArtifact(session, f.source, plannedObservation);
      await saveCheckpoint(session, f.source, checkpoint);
      let reservations = 0;
      let bootstrapAttempts = 0;
      const platform = {
        async runtime() {
          return {
            engine: 'native',
            requireBootstrapContract() {},
            requireAzureRelayRoutingContract() {},
            requireRoutingContract() {
              throw Error('unexpected direct contract');
            },
            async reserveSite() {
              reservations++;
            },
            async bootstrap() {
              bootstrapAttempts++;
              throw Error('test stop at next CE bootstrap boundary');
            },
          };
        },
        async storage() {
          return storage;
        },
      } as unknown as CePlatformService;
      const api: AzExecApi = {
        async exec(command, args, options) {
          if (args[0] === 'resource' && args[1] === 'show') {
            const id = args[args.indexOf('--ids') + 1];
            return f.objects[id]
              ? { exitCode: 0, stderr: '', stdout: JSON.stringify(f.objects[id]) }
              : { exitCode: 1, stderr: 'not found', stdout: '' };
          }
          if (
            args[0] !== 'rest' &&
            args[0] !== 'account' &&
            !(args[0] === 'vm' && ['image', 'list-skus'].includes(args[1]))
          )
            throw Error('test stop at next CE admission observation');
          return f.api.exec(command, args, options);
        },
      };
      const context = {
        cwd: root,
        sessionManager: session,
        hasUI: false,
        ui: {
          async confirm() {
            throw Error('unexpected UI');
          },
        },
      };
      const params = { planId: f.source.planId, planSha256: f.source.planSha256 };
      if (mode === 'post-readback-failure') {
        let observations = 0;
        await expect(
          executeAzureCeNativeApply(params, context, api, async () => platform, undefined, {
            async observe() {
              if (++observations > 1) throw Error('test post-mutation observation unavailable');
              return relayDiscovery(f);
            },
          }),
        ).rejects.toThrow('post-mutation observation unavailable');
        const failed = await loadCheckpoint(session, f.source);
        expect(failed?.pendingAction).toEqual(
          buildAzureNativePendingAction(
            f.source,
            present(f.source.actions.find((action) => action.kind === 'relay-provision')),
          ),
        );
        expect(failed?.completedActionIds).toEqual(checkpoint.completedActionIds);
        expect(f.puts).toBe(8);
      }
      await expect(
        executeAzureCeNativeApply(params, context, api, async () => platform, undefined, {
          async observe() {
            return relayDiscovery(f);
          },
        }),
      ).rejects.toThrow('next CE admission observation');
      const recovered = await loadCheckpoint(session, f.source);
      const action = present(f.source.actions.find((action) => action.kind === 'relay-provision'));
      expect(recovered?.completedActionIds).toEqual([...checkpoint.completedActionIds, action.id]);
      expect(recovered?.pendingAction).toBeUndefined();
      expect(f.puts).toBe(8);
      expect(bootstrapAttempts).toBe(0);
      expect(reservations).toBe(mode === 'post-readback-failure' ? 2 : 1);
      const journal = (await storage.read('relay-native-execution.json')) as { privateKey: string };
      expect(
        (await Bun.file(join(root, `${String(sequence).padStart(6, '0')}.azure-ce-checkpoint.log`)).text()).includes(
          journal.privateKey,
        ),
      ).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test('relay inspection rejects later foreign targets, failed reads and ignored cancellation without writes or resubmission', async () => {
  for (const mode of ['foreign-later-target', 'authorization', 'cancelled'] as const) {
    const f = nativeExecutionFixture();
    f.lose = true;
    await expect(ensureAzureRelayNativeResources(f.source, f.plan, f.storage, f.api)).rejects.toThrow();
    if (mode === 'foreign-later-target')
      f.objects[f.plan.relays[1].nicId] = {
        id: f.plan.relays[1].nicId,
        location: f.source.region,
        tags: {},
        properties: { provisioningState: 'Succeeded' },
      };
    const before = canonicalSha256([...f.saved]);
    const cancellation = new AbortController();
    const api: AzExecApi =
      mode === 'authorization'
        ? {
            async exec() {
              return { exitCode: 1, stdout: '', stderr: 'AuthorizationFailed' };
            },
          }
        : mode === 'cancelled'
          ? { exec: () => new Promise(() => {}) }
          : f.api;
    const pending = inspectAzureRelayNativeResources(f.source, f.plan, f.storage, api, cancellation.signal);
    if (mode === 'cancelled') setTimeout(() => cancellation.abort(Error('cancel read-only inspection')), 20);
    await expect(pending).rejects.toThrow();
    expect(f.puts).toBe(1);
    expect(canonicalSha256([...f.saved])).toBe(before);
  }
});

test('read-only relay recovery rejects changing readback and unsubmitted owned additions', async () => {
  const f = nativeExecutionFixture();
  const previous = relayDiscovery(f);
  const checkpoint = relayOuterCheckpoint(f, previous);
  f.lose = true;
  await expect(ensureAzureRelayNativeResources(f.source, f.plan, f.storage, f.api)).rejects.toThrow();
  const original = f.api.exec;
  let selectedReads = 0;
  const changed: AzExecApi = {
    async exec(command, args, options) {
      if (
        args.includes('get') &&
        args.some((arg) => arg.includes(f.plan.relays[0].publicIpId as string)) &&
        ++selectedReads === 2
      )
        (f.objects[f.plan.relays[0].publicIpId as string].properties as Record<string, unknown>).generatedField =
          'changed';
      return original(command, args, options);
    },
  };
  const before = canonicalSha256([...f.saved]);
  await expect(inspectAzureRelayNativeResources(f.source, f.plan, f.storage, changed)).rejects.toThrow(
    'target changed',
  );
  expect(canonicalSha256([...f.saved])).toBe(before);
  expect(f.puts).toBe(1);
  delete (f.objects[f.plan.relays[0].publicIpId as string].properties as Record<string, unknown>).generatedField;
  // An exact owned later resource still has no submitted authority in this journal.
  const journal = f.saved.get('relay-native-execution.json') as { publicKey: string };
  const later = compileAzureRelayNativeRequests(f.source, f.plan, journal.publicKey)[1];
  f.objects[later.resourceId] = {
    ...structuredClone(later.body),
    id: later.resourceId,
    properties: { ...(later.body.properties as Record<string, unknown>), provisioningState: 'Succeeded' },
  };
  await expect(
    reconcileAzureNativeRelayProvision(f.source, checkpoint, relayDiscovery(f), f.storage, f.api),
  ).rejects.toThrow('outside');
  expect(f.puts).toBe(1);
});

function retirementCloudApi(source: AzureCePlan) {
  const account = {
    id: source.subscription.id,
    tenantId: source.subscription.tenantId,
    environmentName: source.subscription.cloud,
    state: 'Enabled',
  };
  const state = { account, groupExists: false as unknown, inventory: [] as unknown };
  const calls: string[][] = [];
  const api: AzExecApi = {
    async exec(command, args) {
      expect(command).toBe('az');
      calls.push(args);
      expect(args).toContain('--subscription');
      expect(args[args.indexOf('--subscription') + 1]).toBe(source.subscription.id);
      expect(args.some((arg) => ['--tag', '--query', '--resource-group'].includes(arg))).toBe(false);
      return {
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify(
          args[0] === 'account' ? state.account : args[0] === 'group' ? state.groupExists : state.inventory,
        ),
      };
    },
  };
  return { api, calls, state };
}

test('relay retirement requires exact account, group absence and a complete unfiltered ownership inventory for both engines', async () => {
  for (const engine of ['native', 'terraform'] as const) {
    const f = deploymentFixture(engine);
    const source = compileAzureRelayDeploymentPlan(f.source, f.selection, f.catalog);
    const cloud = retirementCloudApi(source);
    cloud.state.inventory = [
      {
        id: `/subscriptions/${source.subscription.id}/resourceGroups/unrelated/providers/Microsoft.Compute/virtualMachines/other`,
        tags: {},
      },
    ];
    const receipt = await observeAzureRelayRetirementAbsence(source, cloud.api);
    expect(receipt).toMatchObject({ status: 'absent', engine, sourcePlanSha256: source.planSha256, inventoryCount: 1 });
    expect(receipt.reads).toHaveLength(3);
    for (const mutate of [
      (value: typeof cloud.state) => {
        value.account.id = 'foreign';
      },
      (value: typeof cloud.state) => {
        value.account.state = 'Disabled';
      },
      (value: typeof cloud.state) => {
        value.groupExists = 'false';
      },
      (value: typeof cloud.state) => {
        value.groupExists = true;
      },
      (value: typeof cloud.state) => {
        value.inventory = { value: [], nextLink: 'partial' };
      },
      (value: typeof cloud.state) => {
        value.inventory = [{ id: source.ownershipInventory[0].resourceId, tags: {} }];
      },
      (value: typeof cloud.state) => {
        value.inventory = [
          {
            id: `/subscriptions/${source.subscription.id}/resourceGroups/residual/providers/Microsoft.Compute/virtualMachines/remaining`,
            tags: { 'xcsh-deployment-id': source.deploymentName },
          },
        ];
      },
      (value: typeof cloud.state) => {
        value.inventory = [{ id: '/subscriptions/foreign/resourceGroups/other' }];
      },
      (value: typeof cloud.state) => {
        const row = { id: `/subscriptions/${source.subscription.id}/resourceGroups/other` };
        value.inventory = [row, row];
      },
      (value: typeof cloud.state) => {
        value.inventory = [
          { id: `/subscriptions/${source.subscription.id}/resourceGroups/other`, tags: { 'xcsh-managed-by': false } },
        ];
      },
    ]) {
      const saved = structuredClone(cloud.state);
      mutate(cloud.state);
      await expect(observeAzureRelayRetirementAbsence(source, cloud.api)).rejects.toThrow();
      Object.assign(cloud.state, saved);
    }
    const cancellation = new AbortController();
    const pending = observeAzureRelayRetirementAbsence(
      source,
      { exec: () => new Promise(() => {}) },
      cancellation.signal,
    );
    setTimeout(() => cancellation.abort(Error('cancel retirement inventory')), 20);
    await expect(pending).rejects.toThrow('cancel retirement inventory');
  }
});

async function nativeRelayRetirementFixture(sourceOverride?: AzureCePlan, contractOverride?: VerifiedIngressContract) {
  const f = nativeExecutionFixture(sourceOverride);
  const root = await mkdtemp(join(tmpdir(), 'relay-key-retirement-'));
  const storage = await CeDeploymentStore.open(root, f.storage.owner);
  await ensureAzureRelayNativeResources(f.source, f.plan, storage, f.api);
  const binding = azureUpgradeBinding(f.source);
  const cloudObservation = relayDiscovery(f);
  cloudObservation.resources.push({
    id: `/subscriptions/${f.source.subscription.id}/resourceGroups/${f.source.intent.resourceGroup}`,
    location: f.source.region,
    exists: true,
    owned: true,
    state: {},
    tags: {
      'xcsh-managed-by': 'azure-ce',
      'xcsh-deployment-id': f.source.deploymentName,
      'xcsh-execution-engine': 'native',
      'xcsh-plan-sha256': f.source.planSha256,
    },
  });
  if (f.source.intent.ingress?.mode === 'platform-http')
    cloudObservation.resources.push({
      id: f.source.intent.ingress.probe.sourceVmResourceId,
      exists: true,
      owned: false,
      tags: {},
      state: {},
    });
  const cloudPlan = compileAzureCePlan({ ...f.source.intent, operation: 'teardown' }, cloudObservation);
  const contract = contractOverride ?? ({ fingerprint: `sha256:${'b'.repeat(64)}` } as VerifiedIngressContract);
  const drain = {
    schemaVersion: 1 as const,
    owner: binding.owner,
    sourcePlanSha256: f.source.planSha256,
    siteContractFingerprint: `sha256:${'a'.repeat(64)}`,
    ingressContractFingerprint: contract.fingerprint,
    listeners: [],
    origins: [],
    sites: [{ binding, siteUid: 'site-uid', routing: [] }],
  };
  const retirement = [
    {
      siteName: f.source.siteName,
      siteUid: 'site-uid',
      physicalSiteUid: 'physical-uid',
      tokens: binding.nodes.map((node, index) => ({ node, name: index === 0 ? 'ce-token' : `ce-token-${index + 1}` })),
    },
  ];
  const teardown = compileAzureNativeTeardown(f.source, cloudPlan, drain, retirement);
  await storage.write(`${teardown.planId}.json`, teardown);
  const cloud = retirementCloudApi(f.source);
  const state = { platform: 'absent', stale: false, foreign: false };
  const order: string[] = [];
  const runtime = {
    engine: 'native',
    contract: { fingerprint: drain.siteContractFingerprint },
    async drainPlatform() {
      order.push('drain');
      return { status: 'platform-drained' };
    },
    async observeSiteDeletion() {
      return { status: 'deleted' };
    },
    async deleteBootstrapToken() {
      order.push('token');
    },
    async deleteSiteExact() {
      order.push('site');
    },
    async unregisteredAbsence() {
      order.push('absence');
      return {
        status: state.platform,
        owner: state.foreign ? { ...binding.owner, deploymentId: 'foreign' } : binding.owner,
        siteContractFingerprint: drain.siteContractFingerprint,
        ingressContractFingerprint: contract.fingerprint,
        startedAt: new Date().toISOString(),
        observedAt: new Date(Date.now() - (state.stale ? 120_000 : 0)).toISOString(),
        sources: ['/api/test/absence'],
      };
    },
  } as unknown as CeRuntime;
  return { ...f, root, storage, binding, cloudPlan, contract, teardown, cloud, runtime, state, order };
}

test('coordinated native relay teardown retires its key only after fresh cloud and platform absence and blocks public reexecution', async () => {
  const f = await nativeRelayRetirementFixture();
  try {
    const result = await runAzureNativeTeardown(
      f.source,
      f.cloudPlan,
      f.teardown,
      f.teardown.planSha256,
      f.runtime,
      f.contract,
      f.storage,
      async () => {
        f.order.push('cloud');
        return { status: 'retired', absence: 'absent' };
      },
      undefined,
      f.cloud.api,
    );
    expect(result).toMatchObject({
      status: 'retired',
      relayKey: { status: 'relay-key-retired' },
      completeCleanup: true,
    });
    expect(f.order.slice(0, 4)).toEqual(['drain', 'cloud', 'token', 'site']);
    await expect(f.storage.read('relay-native-execution.json')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await f.storage.read('azure-native-relay-key-retirement.json')).toMatchObject({ phase: 'retired' });
    const before = f.puts;
    await expect(ensureAzureRelayNativeResources(f.source, f.plan, f.storage, f.api)).rejects.toThrow(
      'retiring or retired',
    );
    await expect(inspectAzureRelayNativeResources(f.source, f.plan, f.storage, f.api)).rejects.toThrow(
      'retiring or retired',
    );
    await expect(assertAzureNativeRelayActive(f.storage)).rejects.toThrow('retiring or retired');
    expect(f.puts).toBe(before);
    expect(
      await retireAzureNativeRelayKey(f.source, f.teardown, f.runtime, f.contract, f.storage, f.cloud.api),
    ).toMatchObject({ status: 'relay-key-retired' });
    const session = {
      getSessionId: () => f.root,
      getArtifactsDir: () => f.root,
      async saveArtifact(content: string, type: string) {
        await Bun.write(join(f.root, `000001.${type}.log`), content);
        return '000001';
      },
      async getArtifactPath() {
        return null;
      },
    };
    const observed = structuredClone(observation);
    observed.regions[0].quotaAvailable = 64;
    await savePlanArtifact(session, f.source, observed);
    const oldAuthorization = process.env.XCSH_CE_HEADLESS_MUTATIONS;
    process.env.XCSH_CE_HEADLESS_MUTATIONS = '1';
    let cloudReads = 0;
    try {
      await expect(
        executeAzureCeNativeApply(
          { planId: f.source.planId, planSha256: f.source.planSha256 },
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
            }) as unknown as CePlatformService,
          undefined,
          {
            async observe() {
              cloudReads++;
              return observed;
            },
          },
        ),
      ).rejects.toThrow('retiring or retired');
      expect(cloudReads).toBe(0);
    } finally {
      if (oldAuthorization === undefined) delete process.env.XCSH_CE_HEADLESS_MUTATIONS;
      else process.env.XCSH_CE_HEADLESS_MUTATIONS = oldAuthorization;
    }
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('native relay key retirement preserves secrets for stale, unknown, foreign or residual evidence', async () => {
  for (const mode of [
    'stale',
    'unknown',
    'foreign-platform',
    'residual-cloud',
    'foreign-journal',
    'foreign-key',
    'foreign-requests',
    'foreign-fields',
    'forged-marker',
  ] as const) {
    const f = await nativeRelayRetirementFixture();
    try {
      await f.storage.write('azure-native-teardown-receipt.json', {
        status: 'retired',
        sourcePlanSha256: f.source.planSha256,
        teardownPlanSha256: f.teardown.planSha256,
        cloudPlanSha256: f.cloudPlan.planSha256,
        cloud: 'absent',
        sites: 'deleted',
      });
      if (mode === 'stale') f.state.stale = true;
      if (mode === 'unknown') f.state.platform = 'unknown';
      if (mode === 'foreign-platform') f.state.foreign = true;
      if (mode === 'residual-cloud') f.cloud.state.inventory = [{ id: f.plan.relays[0].vmId, tags: {} }];
      if (mode === 'foreign-journal') {
        const journal = (await f.storage.read('relay-native-execution.json')) as Record<string, unknown>;
        await f.storage.write('relay-native-execution.json', { ...journal, sourcePlanSha256: 'f'.repeat(64) });
      }
      if (mode === 'foreign-key' || mode === 'foreign-requests') {
        const journal = (await f.storage.read('relay-native-execution.json')) as Record<string, unknown>;
        await f.storage.write('relay-native-execution.json', {
          ...journal,
          ...(mode === 'foreign-key' ? { privateKey: 'invalid private key' } : { requestsSha256: 'f'.repeat(64) }),
        });
      }
      if (mode === 'foreign-fields') {
        const journal = (await f.storage.read('relay-native-execution.json')) as Record<string, unknown>;
        await f.storage.write('relay-native-execution.json', { ...journal, unrelated: 'preserve unrelated staging' });
      }
      if (mode === 'forged-marker')
        await f.storage.write('azure-native-relay-key-retirement.json', { phase: 'retiring' });
      const before = await readFile(join(f.storage.directory, 'relay-native-execution.json'));
      await expect(
        retireAzureNativeRelayKey(f.source, f.teardown, f.runtime, f.contract, f.storage, f.cloud.api),
      ).rejects.toThrow();
      expect(await readFile(join(f.storage.directory, 'relay-native-execution.json'))).toEqual(before);
      if (mode !== 'forged-marker')
        await expect(f.storage.read('azure-native-relay-key-retirement.json')).rejects.toMatchObject({
          code: 'ENOENT',
        });
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  }
});

test('native relay key deletion resumes safely when final marker persistence is interrupted', async () => {
  const f = await nativeRelayRetirementFixture();
  try {
    await f.storage.write('azure-native-teardown-receipt.json', {
      status: 'retired',
      sourcePlanSha256: f.source.planSha256,
      teardownPlanSha256: f.teardown.planSha256,
      cloudPlanSha256: f.cloudPlan.planSha256,
      cloud: 'absent',
      sites: 'deleted',
    });
    const original = f.storage.write.bind(f.storage);
    let interrupted = false;
    f.storage.write = async (name, value) => {
      if (
        name === 'azure-native-relay-key-retirement.json' &&
        (value as { phase?: string }).phase === 'retired' &&
        !interrupted
      ) {
        interrupted = true;
        throw Error('test interrupted after key removal');
      }
      await original(name, value);
    };
    await expect(
      retireAzureNativeRelayKey(f.source, f.teardown, f.runtime, f.contract, f.storage, f.cloud.api),
    ).rejects.toThrow('after key removal');
    await expect(f.storage.read('relay-native-execution.json')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await f.storage.read('azure-native-relay-key-retirement.json')).toMatchObject({ phase: 'retiring' });
    await expect(ensureAzureRelayNativeResources(f.source, f.plan, f.storage, f.api)).rejects.toThrow(
      'retiring or retired',
    );
    expect(
      await retireAzureNativeRelayKey(f.source, f.teardown, f.runtime, f.contract, f.storage, f.cloud.api),
    ).toMatchObject({ status: 'relay-key-retired' });
    expect(await f.storage.read('azure-native-relay-key-retirement.json')).toMatchObject({ phase: 'retired' });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('native relay teardown refuses missing independent cloud collection before any retirement action', async () => {
  const f = await nativeRelayRetirementFixture();
  try {
    await expect(
      runAzureNativeTeardown(
        f.source,
        f.cloudPlan,
        f.teardown,
        f.teardown.planSha256,
        f.runtime,
        f.contract,
        f.storage,
        async () => {
          f.order.push('cloud');
          return { status: 'retired', absence: 'absent' };
        },
      ),
    ).rejects.toThrow('independent cloud');
    expect(f.order).toEqual([]);
    expect(await f.storage.read('relay-native-execution.json')).toHaveProperty('privateKey');
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('native relay key retirement bounds a platform observer that ignores cancellation without deleting secrets', async () => {
  const f = await nativeRelayRetirementFixture();
  try {
    await f.storage.write('azure-native-teardown-receipt.json', {
      status: 'retired',
      sourcePlanSha256: f.source.planSha256,
      teardownPlanSha256: f.teardown.planSha256,
      cloudPlanSha256: f.cloudPlan.planSha256,
      cloud: 'absent',
      sites: 'deleted',
    });
    f.runtime.unregisteredAbsence = () => new Promise(() => {});
    const cancellation = new AbortController();
    const pending = retireAzureNativeRelayKey(
      f.source,
      f.teardown,
      f.runtime,
      f.contract,
      f.storage,
      f.cloud.api,
      cancellation.signal,
    );
    setTimeout(() => cancellation.abort(Error('cancel platform absence')), 20);
    await expect(pending).rejects.toThrow('cancel platform absence');
    expect(await f.storage.read('relay-native-execution.json')).toHaveProperty('privateKey');
    await expect(f.storage.read('azure-native-relay-key-retirement.json')).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('Terraform parent retirement accepts an owned partial relay workflow without live evidence', async () => {
  const f = relayWorkflowFixture('terraform');
  f.lose = true;
  await expect(ensureAzureRelayRoutingWorkflow(f.source, f.expected, f.runtime, f.storage, f.api)).rejects.toThrow();
  const fixture = await prepareRelayParentRetirement(f.source, 'owned-site-uid', f.saved);
  try {
    const receipt = await retireAzureTerraformParentArtifacts(
      f.source,
      fixture.teardown,
      fixture.evidence,
      fixture.store,
    );
    expect(receipt.status).toBe('deployment-artifacts-retired');
    await expect(fixture.store.read('relay-routing-workflow.json')).rejects.toThrow();
  } finally {
    await fixture.cleanup();
  }
});

for (const mode of [
  'configuration',
  'observation',
  'interrupted',
  'changed-after-checkpoint',
  'foreign-owner',
  'foreign-source',
  'foreign-relay',
  'foreign-site',
  'wrong-engine',
  'missing-identity',
  'foreign-cloud',
  'duplicate-mac',
  'partial-cloud',
  'reordered-submission',
  'duplicate-nonce',
  'forged-request',
  'malformed-receipt',
  'missing-workflow',
  'missing-platform',
  'malformed-configuration',
  'foreign-observation',
  'malformed-route',
  'duplicate-route',
  'partial-route',
  'foreign-cloud-peer',
  'unsupported-freshness',
  'unavailable-read',
] as const) {
  test(`Terraform relay parent artifact provenance ${mode}`, async () => {
    const operational = await relayOperationalFixture('terraform');
    const { f, runtime, api } = operational;
    const configuration = await ensureAzureRelayRoutingWorkflow(f.source, f.expected, f.runtime, f.storage, f.api);
    f.saved.set('relay-routing-configuration.json', configuration);
    if (
      [
        'observation',
        'foreign-observation',
        'malformed-route',
        'duplicate-route',
        'partial-route',
        'foreign-cloud-peer',
        'unsupported-freshness',
      ].includes(mode)
    ) {
      f.saved.set(
        'relay-routing-observation.json',
        await observeAzureRelayRoutingWorkflow(f.source, f.expected, runtime, f.storage, api),
      );
    }
    const records = structuredClone(f.saved);
    const journal = records.get('relay-routing-workflow.json') as {
      engine: string;
      sourcePlanSha256: string;
      relayPlanSha256: string;
      siteUid: string;
      bindingSha256: string;
      identity?: {
        stable: { cloud: Array<{ nicId: string; mac: string }> };
        server: { relays: Array<{ mac: string }> };
      };
      relays: Record<string, { nonce: string; requestSha256: string; receipt: { extra?: boolean } }>;
    };
    const platform = records.get('platform-relay-routing.json') as { owner: { deploymentId: string } };
    const configured = records.get('relay-routing-configuration.json') as { guestReceipts: unknown[] };
    const observed = records.get('relay-routing-observation.json') as {
      sessions: { owner: { deploymentId: string } };
      guestRoutes: Array<{ route: { nextHop: string } }>;
      cloudRoutes: { peers: Array<{ peerId: string }> };
      ceSampleFreshnessQualified: boolean;
    };
    if (mode === 'foreign-owner') platform.owner.deploymentId = 'foreign';
    if (mode === 'foreign-source') journal.sourcePlanSha256 = 'f'.repeat(64);
    if (mode === 'foreign-relay') journal.relayPlanSha256 = 'f'.repeat(64);
    if (mode === 'foreign-site') journal.siteUid = 'foreign-site';
    if (mode === 'wrong-engine') journal.engine = 'native';
    if (mode === 'missing-identity') delete journal.identity;
    if (mode === 'foreign-cloud') present(journal.identity).stable.cloud[0].nicId += '-foreign';
    if (mode === 'duplicate-mac')
      present(journal.identity).stable.cloud[0].mac = present(journal.identity).server.relays[0].mac;
    if (mode === 'partial-cloud') present(journal.identity).stable.cloud.pop();
    if (mode === 'reordered-submission') journal.relays = Object.fromEntries(Object.entries(journal.relays).reverse());
    if (mode === 'duplicate-nonce')
      journal.relays[f.plan.relays[1].name].nonce = journal.relays[f.plan.relays[0].name].nonce;
    if (mode === 'forged-request') journal.relays[f.plan.relays[0].name].requestSha256 = 'f'.repeat(64);
    if (mode === 'malformed-receipt') journal.relays[f.plan.relays[0].name].receipt.extra = true;
    if (mode === 'missing-workflow') records.delete('relay-routing-workflow.json');
    if (mode === 'missing-platform') records.delete('platform-relay-routing.json');
    if (mode === 'malformed-configuration') configured.guestReceipts.pop();
    if (mode === 'foreign-observation') observed.sessions.owner.deploymentId = 'foreign';
    if (mode === 'malformed-route') observed.guestRoutes[0].route.nextHop = '10.20.0.99';
    if (mode === 'duplicate-route') observed.guestRoutes.push(observed.guestRoutes[0]);
    if (mode === 'partial-route') observed.guestRoutes.pop();
    if (mode === 'foreign-cloud-peer') observed.cloudRoutes.peers[0].peerId += '-foreign';
    if (mode === 'unsupported-freshness') observed.ceSampleFreshnessQualified = true;
    // Rehash the snapshot to exercise structural joins, not only its digest.
    if (['foreign-cloud', 'duplicate-mac', 'partial-cloud'].includes(mode))
      journal.bindingSha256 = canonicalSha256(present(journal.identity).stable);
    const fixture = await prepareRelayParentRetirement(f.source, 'owned-site-uid', records);
    const run = (signal?: AbortSignal) =>
      retireAzureTerraformParentArtifacts(f.source, fixture.teardown, fixture.evidence, fixture.store, signal);
    try {
      if (!['configuration', 'observation', 'interrupted', 'changed-after-checkpoint'].includes(mode)) {
        const verify = fixture.store.verify.bind(fixture.store);
        if (mode === 'unavailable-read')
          fixture.store.verify = async () => {
            throw Error('private storage unavailable');
          };
        await expect(run()).rejects.toThrow();
        fixture.store.verify = verify;
        // No valid owned staging may be deleted on any failed atomic preflight.
        expect(await fixture.store.read('terraform-workflow.json')).toBeDefined();
        await expect(fixture.store.read('azure-terraform-parent-artifact-retirement.json')).rejects.toThrow();
        return;
      }
      if (mode === 'interrupted' || mode === 'changed-after-checkpoint') {
        const controller = new AbortController(),
          write = fixture.store.write.bind(fixture.store);
        fixture.store.write = async (name, value) => {
          await write(name, value);
          if (name === 'azure-terraform-parent-artifact-retirement.json') controller.abort();
        };
        await expect(run(controller.signal)).rejects.toThrow();
        fixture.store.write = write;
        if (mode === 'changed-after-checkpoint') {
          await fixture.store.write('relay-routing-workflow.json', { changed: true });
          await expect(run()).rejects.toThrow();
          expect(await fixture.store.read('terraform-workflow.json')).toBeDefined();
          return;
        }
        // Exact hashed deletion already performed before an interrupted process can resume independently.
        await rm(join(fixture.store.directory, 'relay-routing-workflow.json'));
      }
      const receipt = await run();
      expect(receipt.status).toBe('deployment-artifacts-retired');
      for (const name of records.keys()) await expect(fixture.store.read(name)).rejects.toThrow();
      expect(await run()).toEqual(receipt);
    } finally {
      await fixture.cleanup();
    }
  });
}

for (const mode of [
  'complete',
  'stale',
  'foreign-token',
  'missing-token',
  'foreign-checkpoint',
  'unresolved-source',
  'interrupted',
  'changed',
  'reappeared',
  'malformed',
  'foreign-owner',
  'residual-cloud',
] as const) {
  test(`native enrollment retirement ${mode}`, async () => {
    const f = await nativeRelayRetirementFixture();
    const tokenName = `${f.source.deploymentName.slice(0, 40)}-1-${f.source.planSha256.slice(0, 12)}`;
    const retirement = [{ ...f.teardown.retirement[0], tokens: [{ node: f.binding.nodes[0], name: tokenName }] }];
    const teardown = compileAzureNativeTeardown(f.source, f.cloudPlan, f.teardown.drain, retirement);
    const tokenFile = `${tokenName}.json`,
      admissionFile = `native-admission-${f.source.planSha256}.json`;
    const jwt = 'synthetic.payload.signature';
    const material = `#cloud-config\nwrite_files:\n  - path: /etc/vpm/user_data\n    content: |\n      token: ${jwt}\n`;
    try {
      await f.storage.write(`${teardown.planId}.json`, teardown);
      // Complete the existing independently gated key stage before introducing enrollment staging.
      await runAzureNativeTeardown(
        f.source,
        f.cloudPlan,
        teardown,
        teardown.planSha256,
        f.runtime,
        f.contract,
        f.storage,
        async () => ({ status: 'retired', absence: 'absent' }),
        undefined,
        f.cloud.api,
      );
      await persistAzureNativeSource(f.source, f.storage);
      await f.storage.write(tokenFile, { tokenName, siteName: f.source.siteName, node: f.binding.nodes[0], jwt });
      const checkpoint = {
        schemaVersion: 1,
        engine: 'native',
        planSha256: f.source.planSha256,
        siteReserved: true,
        bootstrapByNode: { '1': material },
        launchedAtByNode: { '1': '2026-01-01T00:00:00Z' },
      };
      await f.storage.write(admissionFile, checkpoint);
      // Re-open only the enrollment-stage fixture checkpoint; the lifecycle/key retirement guard remains in place.
      await f.storage.remove('azure-native-bootstrap-retirement.json');
      if (mode === 'stale') f.state.stale = true;
      if (mode === 'foreign-token')
        await f.storage.write(tokenFile, { tokenName, siteName: 'foreign', node: f.binding.nodes[0], jwt });
      if (mode === 'missing-token') await f.storage.remove(tokenFile);
      if (mode === 'foreign-checkpoint')
        await f.storage.write(admissionFile, { ...checkpoint, planSha256: 'f'.repeat(64) });
      if (mode === 'unresolved-source')
        await f.storage.write(`native-admission-${'f'.repeat(64)}.json`, { ...checkpoint, planSha256: 'f'.repeat(64) });
      if (mode === 'malformed')
        await f.storage.write(admissionFile, { ...checkpoint, bootstrapByNode: { '1': '#cloud-config\ninvalid' } });
      if (mode === 'foreign-owner') f.state.foreign = true;
      if (mode === 'residual-cloud') f.cloud.state.inventory = [{ id: f.plan.relays[0].vmId, tags: {} }];
      const run = (signal?: AbortSignal) =>
        retireAzureNativeBootstrapArtifacts(
          f.source,
          f.cloudPlan,
          teardown,
          f.runtime,
          f.contract,
          f.storage,
          f.cloud.api,
          signal,
        );
      if (!['complete', 'interrupted', 'changed', 'reappeared'].includes(mode)) {
        await expect(run()).rejects.toThrow();
        expect(await f.storage.read(admissionFile)).toBeDefined();
        await expect(f.storage.read('azure-native-bootstrap-retirement.json')).rejects.toThrow();
        return;
      }
      if (mode === 'interrupted' || mode === 'changed') {
        const controller = new AbortController(),
          write = f.storage.write.bind(f.storage);
        f.storage.write = async (name, value) => {
          await write(name, value);
          if (name === 'azure-native-bootstrap-retirement.json') controller.abort();
        };
        await expect(run(controller.signal)).rejects.toThrow();
        f.storage.write = write;
        if (mode === 'changed') {
          await f.storage.write(admissionFile, { ...checkpoint, siteReserved: false });
          await expect(run()).rejects.toThrow('changed');
          expect(await f.storage.read(tokenFile)).toBeDefined();
          return;
        }
        await f.storage.remove(tokenFile);
      }
      const result = await run();
      expect(result).toMatchObject({ status: 'native-bootstrap-retired', retiredArtifacts: 2, completeCleanup: false });
      await expect(f.storage.read(admissionFile)).rejects.toThrow();
      await expect(f.storage.read(tokenFile)).rejects.toThrow();
      expect(await run()).toEqual(result);
      if (mode === 'reappeared') {
        await f.storage.write(tokenFile, { tokenName, siteName: f.source.siteName, node: f.binding.nodes[0], jwt });
        await expect(run()).rejects.toThrow('changed');
      }
      const marker = JSON.stringify(await f.storage.read('azure-native-bootstrap-retirement.json'));
      expect(marker).not.toContain(jwt);
      expect(marker).not.toContain('cloud-config');
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
}

test('private native action evidence binds exact source owner and action without resolving executable substitutions', async () => {
  const f = await nativeRelayRetirementFixture();
  try {
    const action = f.source.actions.find((action) => action.kind === 'relay-provision');
    if (!action) throw Error('missing relay action');
    await persistAzureNativeActionEvidence(f.source, action, { status: 'unknown' }, f.storage);
    expect(await f.storage.read(`native-action-${f.source.planSha256}-${action.id}.json`)).toMatchObject({
      engine: 'native',
      owner: f.binding.owner,
      sourcePlanSha256: f.source.planSha256,
      actionId: action.id,
      actionSha256: canonicalSha256(action),
      evidence: { status: 'unknown' },
    });
    await expect(
      persistAzureNativeActionEvidence(f.source, { ...action, id: 'foreign' }, {}, f.storage),
    ).rejects.toThrow();
    await expect(
      persistAzureNativeSource(f.source, {
        ...f.storage,
        owner: { ...f.binding.owner, deploymentId: 'foreign' },
        verify: f.storage.verify.bind(f.storage),
        read: f.storage.read.bind(f.storage),
        write: f.storage.write.bind(f.storage),
      }),
    ).rejects.toThrow();
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

for (const mode of [
  'complete',
  'foreign-checkout-owner',
  'foreign-checkout-digest',
  'unknown-checkout-field',
  'ignored-cancellation',
] as const) {
  test(`coordinated native bootstrap retirement ${mode}`, async () => {
    const f = await nativeRelayRetirementFixture();
    const tokenName = `${f.source.deploymentName.slice(0, 40)}-1-${f.source.planSha256.slice(0, 12)}`;
    const retirement = [{ ...f.teardown.retirement[0], tokens: [{ node: f.binding.nodes[0], name: tokenName }] }];
    const teardown = compileAzureNativeTeardown(f.source, f.cloudPlan, f.teardown.drain, retirement);
    const jwt = 'synthetic.payload.signature';
    let checkoutFile = '';
    const checkoutRoot = join(f.root, 'checkout');
    try {
      await persistAzureNativeSource(f.source, f.storage);
      await f.storage.write(`${teardown.planId}.json`, teardown);
      await f.storage.write(`${tokenName}.json`, {
        tokenName,
        siteName: f.source.siteName,
        node: f.binding.nodes[0],
        jwt,
      });
      await f.storage.write(`native-admission-${f.source.planSha256}.json`, {
        schemaVersion: 1,
        engine: 'native',
        planSha256: f.source.planSha256,
        siteReserved: true,
        bootstrapByNode: {
          '1': `#cloud-config\nwrite_files:\n  - path: /etc/vpm/user_data\n    content: |\n      token: ${jwt}\n`,
        },
        launchedAtByNode: { '1': '2026-01-01T00:00:00Z' },
      });
      const checkout = await storeBootstrapToken({
        sessionId: 'native-cleanup',
        token: jwt,
        expiresInSeconds: 60,
        root: checkoutRoot,
        onPrepared: async (checkout) => {
          checkoutFile = `bootstrap-checkout-${checkout.reference.split('/').at(-1)}.json`;
          await f.storage.write(checkoutFile, {
            schemaVersion: 1,
            owner: f.binding.owner,
            binding: f.binding,
            siteUid: teardown.retirement[0].siteUid,
            contractFingerprint: teardown.drain.siteContractFingerprint,
            tokenName,
            node: f.binding.nodes[0],
            checkout,
          });
        },
      });
      if (mode.startsWith('foreign-checkout') || mode === 'unknown-checkout-field') {
        const saved = (await f.storage.read(checkoutFile)) as {
          owner: { deploymentId: string };
          checkout: { digest: string };
          unexpected?: string;
        };
        if (mode === 'foreign-checkout-owner') saved.owner.deploymentId = 'foreign';
        if (mode === 'foreign-checkout-digest') saved.checkout.digest = 'f'.repeat(64);
        if (mode === 'unknown-checkout-field') saved.unexpected = 'must-retain';
        await f.storage.write(checkoutFile, saved);
        await expect(
          runAzureNativeTeardown(
            f.source,
            f.cloudPlan,
            teardown,
            teardown.planSha256,
            f.runtime,
            f.contract,
            f.storage,
            async () => ({ status: 'retired', absence: 'absent' }),
            undefined,
            f.cloud.api,
          ),
        ).rejects.toThrow();
        expect(await f.storage.read(`native-admission-${f.source.planSha256}.json`)).toBeDefined();
        expect(await f.storage.read(`${tokenName}.json`)).toBeDefined();
        const parts = checkout.reference.split('/');
        expect(
          await readFile(join(checkoutRoot, parts.at(-2) as string, parts.at(-1) as string, 'token'), 'utf8'),
        ).toBe(jwt);
        await expect(f.storage.read('azure-native-bootstrap-retirement.json')).rejects.toThrow();
        return;
      }
      if (mode === 'ignored-cancellation') {
        const controller = new AbortController();
        const original = f.runtime.unregisteredAbsence;
        f.runtime.unregisteredAbsence = async () => {
          controller.abort(Error('bounded cancellation'));
          return new Promise<never>(() => {});
        };
        await expect(
          runAzureNativeTeardown(
            f.source,
            f.cloudPlan,
            teardown,
            teardown.planSha256,
            f.runtime,
            f.contract,
            f.storage,
            async () => ({ status: 'retired', absence: 'absent' }),
            controller.signal,
            f.cloud.api,
          ),
        ).rejects.toThrow('bounded cancellation');
        f.runtime.unregisteredAbsence = original;
        expect(await f.storage.read(`native-admission-${f.source.planSha256}.json`)).toBeDefined();
        expect(await f.storage.read(`${tokenName}.json`)).toBeDefined();
        await expect(f.storage.read('azure-native-bootstrap-retirement.json')).rejects.toThrow();
        return;
      }
      const result = await runAzureNativeTeardown(
        f.source,
        f.cloudPlan,
        teardown,
        teardown.planSha256,
        f.runtime,
        f.contract,
        f.storage,
        async () => ({ status: 'retired', absence: 'absent' }),
        undefined,
        f.cloud.api,
      );
      expect(result).toMatchObject({
        status: 'retired',
        bootstrap: { status: 'native-bootstrap-retired', retiredArtifacts: 2 },
        completeCleanup: true,
      });
      const parts = checkout.reference.split('/');
      const checkoutDir = join(checkoutRoot, parts.at(-2) as string, parts.at(-1) as string);
      await expect(readFile(join(checkoutDir, 'token'))).rejects.toMatchObject({ code: 'ENOENT' });
      expect(JSON.parse(await readFile(join(checkoutDir, 'metadata.json'), 'utf8'))).toMatchObject({
        consumed: true,
        retirement: { status: 'bootstrap-secret-retired' },
      });
      expect(await f.storage.read(checkoutFile)).toBeDefined();
      await expect(f.storage.read(`${tokenName}.json`)).rejects.toThrow();
      await expect(f.storage.read(`native-admission-${f.source.planSha256}.json`)).rejects.toThrow();
      expect(f.order.filter((value) => value === 'absence').length).toBeGreaterThan(6);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
}

for (const mode of [
  'configuration',
  'observation',
  'foreign-engine',
  'foreign-owner',
  'foreign-source',
  'foreign-site',
  'malformed-identity',
  'missing-platform',
] as const) {
  test(`native relay historical artifact provenance ${mode}`, async () => {
    const operational = await relayOperationalFixture('native');
    const { f, runtime, api } = operational;
    const configured = await ensureAzureRelayRoutingWorkflow(f.source, f.expected, f.runtime, f.storage, f.api);
    f.saved.set('relay-routing-configuration.json', configured);
    if (mode === 'observation')
      f.saved.set(
        'relay-routing-observation.json',
        await observeAzureRelayRoutingWorkflow(f.source, f.expected, runtime, f.storage, api),
      );
    const records = structuredClone(f.saved);
    if (!['configuration', 'observation'].includes(mode)) {
      const workflow = records.get('relay-routing-workflow.json') as { engine: string };
      if (mode === 'foreign-engine') workflow.engine = 'terraform';
      if (mode === 'foreign-owner')
        (records.get('platform-relay-routing.json') as { owner: { deploymentId: string } }).owner.deploymentId =
          'foreign';
      if (mode === 'foreign-source')
        (workflow as unknown as { sourcePlanSha256: string }).sourcePlanSha256 = 'f'.repeat(64);
      if (mode === 'foreign-site') (workflow as unknown as { siteUid: string }).siteUid = 'foreign';
      if (mode === 'malformed-identity') (workflow as unknown as { identity: unknown }).identity = {};
      if (mode === 'missing-platform') records.delete('platform-relay-routing.json');
      expect(() => verifyAzureRelayHistoricalArtifacts(f.source, 'owned-site-uid', records)).toThrow();
    } else expect(() => verifyAzureRelayHistoricalArtifacts(f.source, 'owned-site-uid', records)).not.toThrow();
  });
}

test('coordinated native teardown retires plan-bound parent staging with fresh ownership absence', async () => {
  const f = await nativeRelayRetirementFixture();
  try {
    await persistAzureNativeSource(f.source, f.storage);
    const journal = (await f.storage.read('relay-native-execution.json')) as { completed: string[] };
    const action = present(f.source.actions.find((row) => row.kind === 'relay-provision'));
    await persistAzureNativeActionEvidence(
      f.source,
      action,
      {
        status: 'provisioned',
        sourcePlanSha256: f.source.planSha256,
        relayPlanSha256: f.plan.planSha256,
        resourceIds: journal.completed,
        software: 'unknown',
        routing: 'unknown',
        traffic: 'unknown',
        observedAt: new Date().toISOString(),
      },
      f.storage,
    );
    await f.storage.write('native-site.json', {
      siteName: f.source.siteName,
      uid: f.teardown.retirement[0].siteUid,
      owner: f.binding.owner,
      contractFingerprint: f.teardown.drain.siteContractFingerprint,
    });
    const result = await runAzureNativeTeardown(
      f.source,
      f.cloudPlan,
      f.teardown,
      f.teardown.planSha256,
      f.runtime,
      f.contract,
      f.storage,
      async () => ({ status: 'retired', absence: 'absent' }),
      undefined,
      f.cloud.api,
    );
    expect(result).toMatchObject({ completeCleanup: true, parent: { status: 'native-deployment-artifacts-retired' } });
    for (const name of [
      `native-source-${f.source.planSha256}.json`,
      `native-action-${f.source.planSha256}-${action.id}.json`,
      'native-site.json',
    ])
      await expect(f.storage.read(name)).rejects.toThrow();
    expect(await f.storage.read('owner.json')).toBeDefined();
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

for (const mode of [
  'complete',
  'unknown',
  'foreign-source',
  'foreign-action',
  'foreign-payload-owner',
  'malformed-payload',
  'partial-provisioning',
  'foreign-site',
  'foreign-registration',
  'duplicate-interface',
  'foreign-drain',
  'missing-bootstrap',
  'stale',
  'residual',
  'interrupted',
  'changed',
  'reappeared',
  'symlink',
  'wrong-mode',
  'cancelled',
] as const) {
  test(`native parent staging retirement ${mode}`, async () => {
    const f = await nativeRelayRetirementFixture();
    const markerName = 'azure-native-parent-artifact-retirement.json';
    const sourceFile = `native-source-${f.source.planSha256}.json`;
    const action = present(f.source.actions.find((row) => row.kind === 'relay-provision'));
    const actionFile = `native-action-${f.source.planSha256}-${action.id}.json`;
    try {
      const provisionedIds = ((await f.storage.read('relay-native-execution.json')) as { completed: string[] })
        .completed;
      await runAzureNativeTeardown(
        f.source,
        f.cloudPlan,
        f.teardown,
        f.teardown.planSha256,
        f.runtime,
        f.contract,
        f.storage,
        async () => ({ status: 'retired', absence: 'absent' }),
        undefined,
        f.cloud.api,
      );
      // Reopen only the parent-stage test checkpoint. Public lifecycle/key barriers remain terminal.
      await f.storage.remove(markerName);
      await persistAzureNativeSource(f.source, f.storage);
      await persistAzureNativeActionEvidence(
        f.source,
        action,
        {
          status: 'provisioned',
          sourcePlanSha256: f.source.planSha256,
          relayPlanSha256: f.plan.planSha256,
          resourceIds: provisionedIds,
          observedAt: new Date().toISOString(),
          software: 'unknown',
          routing: 'unknown',
          traffic: 'unknown',
        },
        f.storage,
      );
      const site = {
        siteName: f.source.siteName,
        uid: f.teardown.retirement[0].siteUid,
        owner: f.binding.owner,
        contractFingerprint: f.teardown.drain.siteContractFingerprint,
      };
      await f.storage.write('native-site.json', site);
      const registration = {
        siteName: f.source.siteName,
        node: f.binding.nodes[0],
        registration: 'registration-owned',
        instanceId: '11111111-1111-1111-1111-111111111111',
        action: 'approve-registration',
        state: 'submitted',
      };
      await f.storage.write('native-registration-node-1.json', registration);
      const siteBinding = {
        schemaVersion: 1,
        tenantOrigin: 'https://owned.example',
        contractFingerprint: f.teardown.drain.siteContractFingerprint,
        siteUid: f.teardown.retirement[0].siteUid,
        binding: f.binding,
        expectedInterfaces: [
          { node: f.binding.nodes[0], role: 'slo', mac: '02:00:00:00:00:01' },
          { node: f.binding.nodes[0], role: 'sli', mac: '02:00:00:00:00:02' },
        ],
      };
      await f.storage.write(`site-binding-${f.source.siteName}.json`, siteBinding);
      const drainHash = canonicalSha256(f.teardown.drain);
      await f.storage.write('platform-drain-source.json', { sha256: drainHash, plan: f.teardown.drain });
      await f.storage.write('platform-drain-progress.json', {
        schemaVersion: 1,
        planSha256: drainHash,
        completed: [],
        observedAt: new Date().toISOString(),
      });
      await f.storage.write('platform-drain-receipt.json', {
        status: 'platform-drained',
        owner: f.binding.owner,
        sourcePlanSha256: f.source.planSha256,
        planSha256: drainHash,
        completed: [],
        cloud: 'unknown',
        sites: 'not-retired',
        observedAt: new Date().toISOString(),
      });
      if (mode === 'unknown') await f.storage.write('unqualified-upgrade.json', { status: 'unknown' });
      if (mode === 'malformed-payload' || mode === 'partial-provisioning') {
        const value = (await f.storage.read(actionFile)) as { evidence: { status: unknown; resourceIds: string[] } };
        if (mode === 'malformed-payload') value.evidence.status = 0;
        else value.evidence.resourceIds.pop();
        await f.storage.write(actionFile, value);
      }
      if (mode === 'foreign-source') await f.storage.write(sourceFile, { ...f.source, siteName: 'foreign' });
      if (mode === 'foreign-action' || mode === 'foreign-payload-owner') {
        const value = (await f.storage.read(actionFile)) as { actionSha256: string; evidence: unknown };
        if (mode === 'foreign-action') value.actionSha256 = 'f'.repeat(64);
        else value.evidence = { status: 'unknown', owner: { ...f.binding.owner, deploymentId: 'foreign' } };
        await f.storage.write(actionFile, value);
      }
      if (mode === 'foreign-site') await f.storage.write('native-site.json', { ...site, uid: 'foreign' });
      if (mode === 'foreign-registration')
        await f.storage.write('native-registration-node-1.json', { ...registration, node: 'foreign' });
      if (mode === 'duplicate-interface') {
        siteBinding.expectedInterfaces[1].mac = siteBinding.expectedInterfaces[0].mac;
        await f.storage.write(`site-binding-${f.source.siteName}.json`, siteBinding);
      }
      if (mode === 'foreign-drain')
        await f.storage.write('platform-drain-source.json', {
          sha256: drainHash,
          plan: { ...f.teardown.drain, owner: { ...f.binding.owner, deploymentId: 'foreign' } },
        });
      if (mode === 'missing-bootstrap') await f.storage.remove('azure-native-bootstrap-retirement.json');
      if (mode === 'stale') f.state.stale = true;
      if (mode === 'residual') f.cloud.state.inventory = [{ id: f.plan.relays[0].vmId, tags: {} }];
      if (mode === 'symlink') {
        await f.storage.remove('native-site.json');
        await symlink(join(f.storage.directory, sourceFile), join(f.storage.directory, 'native-site.json'));
      }
      if (mode === 'wrong-mode') await chmod(join(f.storage.directory, 'native-site.json'), 0o644);
      const run = (signal?: AbortSignal) =>
        retireAzureNativeParentArtifacts(
          f.source,
          f.cloudPlan,
          f.teardown,
          f.runtime,
          f.contract,
          f.storage,
          f.cloud.api,
          signal,
        );
      if (!['complete', 'interrupted', 'changed', 'reappeared'].includes(mode)) {
        if (mode === 'cancelled') {
          const controller = new AbortController();
          f.runtime.unregisteredAbsence = async () => {
            controller.abort(Error('ignored cancellation'));
            return new Promise<never>(() => {});
          };
          await expect(run(controller.signal)).rejects.toThrow('ignored cancellation');
        } else await expect(run()).rejects.toThrow();
        expect(await f.storage.read(sourceFile)).toBeDefined();
        await expect(f.storage.read(markerName)).rejects.toThrow();
        return;
      }
      if (mode === 'interrupted' || mode === 'changed') {
        const controller = new AbortController(),
          write = f.storage.write.bind(f.storage);
        f.storage.write = async (name, value) => {
          await write(name, value);
          if (name === markerName) controller.abort();
        };
        await expect(run(controller.signal)).rejects.toThrow();
        f.storage.write = write;
        if (mode === 'changed') {
          await f.storage.write('native-site.json', { ...site, uid: 'changed' });
          await expect(run()).rejects.toThrow('changed');
          expect(await f.storage.read(sourceFile)).toBeDefined();
          return;
        }
        // Already-deleted dependencies do not have to be recreated on resume.
        await f.storage.remove(sourceFile);
      }
      const result = await run();
      expect(result).toMatchObject({
        status: 'native-deployment-artifacts-retired',
        completeCleanup: true,
        remainingStaging: 0,
      });
      for (const name of [
        sourceFile,
        actionFile,
        'native-site.json',
        'native-registration-node-1.json',
        `site-binding-${f.source.siteName}.json`,
        'platform-drain-source.json',
        'platform-drain-progress.json',
        'platform-drain-receipt.json',
      ])
        await expect(f.storage.read(name)).rejects.toThrow();
      expect(await run()).toEqual(result);
      if (mode === 'reappeared') {
        await f.storage.write('native-site.json', site);
        await expect(run()).rejects.toThrow('changed');
      }
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
}

for (const mode of ['configuration', 'observation', 'foreign-record', 'interrupted'] as const) {
  test(`native parent relay history retirement ${mode}`, async () => {
    const operational = await relayOperationalFixture('native');
    const { f: routing, runtime, api } = operational;
    const configured = await ensureAzureRelayRoutingWorkflow(
      routing.source,
      routing.expected,
      routing.runtime,
      routing.storage,
      routing.api,
    );
    routing.saved.set('relay-routing-configuration.json', configured);
    if (mode === 'observation')
      routing.saved.set(
        'relay-routing-observation.json',
        await observeAzureRelayRoutingWorkflow(routing.source, routing.expected, runtime, routing.storage, api),
      );
    const f = await nativeRelayRetirementFixture(routing.source);
    try {
      expect(f.source.planSha256).toBe(routing.source.planSha256);
      const siteUid = 'owned-site-uid';
      const drain = { ...f.teardown.drain, sites: [{ ...f.teardown.drain.sites[0], siteUid }] };
      const teardown = compileAzureNativeTeardown(f.source, f.cloudPlan, drain, [
        { ...f.teardown.retirement[0], siteUid },
      ]);
      await f.storage.write(`${teardown.planId}.json`, teardown);
      await runAzureNativeTeardown(
        f.source,
        f.cloudPlan,
        teardown,
        teardown.planSha256,
        f.runtime,
        f.contract,
        f.storage,
        async () => ({ status: 'retired', absence: 'absent' }),
        undefined,
        f.cloud.api,
      );
      await f.storage.remove('azure-native-parent-artifact-retirement.json');
      await persistAzureNativeSource(f.source, f.storage);
      for (const [name, value] of routing.saved) await f.storage.write(name, value);
      if (mode === 'foreign-record') {
        const value = (await f.storage.read('platform-relay-routing.json')) as { owner: { deploymentId: string } };
        value.owner.deploymentId = 'foreign';
        await f.storage.write('platform-relay-routing.json', value);
      }
      const run = (signal?: AbortSignal) =>
        retireAzureNativeParentArtifacts(
          f.source,
          f.cloudPlan,
          teardown,
          f.runtime,
          f.contract,
          f.storage,
          f.cloud.api,
          signal,
        );
      if (mode === 'foreign-record') {
        await expect(run()).rejects.toThrow();
        expect(await f.storage.read(`native-source-${f.source.planSha256}.json`)).toBeDefined();
        await expect(f.storage.read('azure-native-parent-artifact-retirement.json')).rejects.toThrow();
        return;
      }
      if (mode === 'interrupted') {
        const controller = new AbortController(),
          write = f.storage.write.bind(f.storage);
        f.storage.write = async (name, value) => {
          await write(name, value);
          if (name === 'azure-native-parent-artifact-retirement.json') controller.abort();
        };
        await expect(run(controller.signal)).rejects.toThrow();
        f.storage.write = write;
        await f.storage.remove('relay-routing-workflow.json');
      }
      expect(await run()).toMatchObject({ status: 'native-deployment-artifacts-retired', completeCleanup: true });
      for (const name of routing.saved.keys()) await expect(f.storage.read(name)).rejects.toThrow();
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
}

for (const engine of ['native', 'terraform'] as const)
  for (const mode of [
    'complete',
    'failover-prepared',
    'failover-forged',
    'planned',
    'origin',
    'corrected',
    'interrupted',
    'foreign',
    'foreign-action',
    'changed',
    'reappeared',
  ] as const) {
    test(`${engine} ingress parent retirement ${mode}`, async () => {
      const d = deploymentFixture(engine),
        intent = structuredClone(d.source.intent),
        observed = structuredClone(d.observed);
      intent.nics.push({ name: 'sli', role: 'sli', subnet: { mode: 'greenfield', cidr: '10.20.1.0/24', name: 'sli' } });
      intent.ingress = ingressIntent(d.source.subscription.id);
      if (intent.ingress.mode !== 'platform-http') throw Error('HTTP fixture required');
      intent.brownfield.resourceIds.push(intent.ingress.probe.sourceVmResourceId);
      observed.resources.push({
        id: intent.ingress.probe.sourceVmResourceId,
        exists: true,
        owned: false,
        tags: {},
        state: {},
      });
      if (mode.startsWith('failover-')) {
        intent.topology.ha = true;
        observed.regions[0].quotaAvailable = 64;
      }
      const foundation = compileAzureCePlan(intent, observed),
        catalog = structuredClone(d.catalog);
      catalog.provenance.sourcePlanSha256 = foundation.planSha256;
      const source = compileAzureRelayDeploymentPlan(foundation, d.selection, catalog);
      const history = await createIngressHistoryFixture(engine, source);
      let cleanup: (() => Promise<void>) | undefined;
      try {
        const { records, ingressReceipt, trafficEvidence } = await history.run(
          ['planned', 'origin', 'corrected'].includes(mode) ? (mode as 'planned' | 'origin' | 'corrected') : 'complete',
        );
        let store: CeDeploymentStore;
        let run: (signal?: AbortSignal) => Promise<unknown>;
        let markerName: string;
        if (engine === 'native') {
          const f = await nativeRelayRetirementFixture(source, history.contract);
          cleanup = () => rm(f.root, { recursive: true, force: true });
          store = f.storage;
          const teardown = compileAzureNativeTeardown(source, f.cloudPlan, history.drain, f.teardown.retirement);
          await store.write(`${teardown.planId}.json`, teardown);
          for (const [name, value] of records) await store.write(name, value);
          if (ingressReceipt)
            await persistAzureNativeActionEvidence(
              source,
              present(source.actions.find((row) => row.kind === 'f5-ingress-configure')),
              ingressReceipt,
              store,
            );
          if (trafficEvidence)
            await persistAzureNativeActionEvidence(
              source,
              present(source.actions.find((row) => row.kind === 'traffic-gate')),
              trafficEvidence,
              store,
            );

          markerName = 'azure-native-parent-artifact-retirement.json';
          run = (signal) =>
            runAzureNativeTeardown(
              source,
              f.cloudPlan,
              teardown,
              teardown.planSha256,
              f.runtime,
              history.contract,
              store,
              async () => ({ status: 'retired', absence: 'absent' }),
              signal,
              f.cloud.api,
            );
        } else {
          const f = await prepareRelayParentRetirement(source, 'site-uid', records);
          cleanup = f.cleanup;
          store = f.store;
          const teardown = { ...f.teardown, drain: history.drain };
          await store.write(`${teardown.planId}.json`, teardown);
          markerName = 'azure-terraform-parent-artifact-retirement.json';
          run = (signal) =>
            retireAzureTerraformParentArtifacts(source, teardown, f.evidence, store, signal, history.contract);
        }

        if (mode === 'failover-prepared' || mode === 'failover-forged') {
          const vm = present(source.actions.find((row) => row.kind === 'vm-create' && row.node === 2));
          const failover = buildAzureCeFailoverPlan(source, {
            schemaVersion: 1,
            source: 'azure-cli-live',
            subscriptionId: source.subscription.id,
            region: source.region,
            engine,
            deploymentId: source.deploymentName,
            sourcePlanSha256: source.planSha256,
            nodeIndex: 2,
            vmResourceId: present(vm.resourceId),
            vmId: '22222222-2222-4222-8222-222222222222',
            powerState: 'running',
            observedAt: new Date().toISOString(),
          });
          await store.write(`${failover.planId}.json`, failover);
          if (mode === 'failover-forged') {
            await store.write(`${failover.planId}-future-success.json`, { status: 'success' });
            await expect(run()).rejects.toThrow(/unknown or orphan failover/);
            expect(await store.read(`azure-ingress-source-${source.planSha256}.json`)).toBeDefined();
            await expect(store.read(markerName)).rejects.toThrow();
            return;
          }
        }
        if (mode === 'foreign-action') {
          if (engine === 'native') {
            const action = present(source.actions.find((row) => row.kind === 'f5-ingress-configure'));
            const name = `native-action-${source.planSha256}-${action.id}.json`;
            const value = (await store.read(name)) as { evidence: Record<string, unknown> };
            await store.write(name, { ...value, evidence: { ...value.evidence, uid: 'foreign' } });
          } else {
            const value = (await store.read('azure-traffic-probe.json')) as { evidence: Record<string, unknown> };
            await store.write('azure-traffic-probe.json', {
              ...value,
              evidence: { ...value.evidence, bodySha256: 'f'.repeat(64) },
            });
          }
          await expect(run()).rejects.toThrow(/receipt differs|traffic evidence/);
          expect(await store.read(`azure-ingress-source-${source.planSha256}.json`)).toBeDefined();
          await expect(store.read(markerName)).rejects.toThrow();
          return;
        }
        if (mode === 'foreign') {
          const value = (await store.read('azure-platform-ingress.json')) as Record<string, unknown>;
          await store.write('azure-platform-ingress.json', { ...value, sourceArtifactSha256: 'f'.repeat(64) });
          await expect(run()).rejects.toThrow();
          expect(await store.read(`azure-ingress-source-${source.planSha256}.json`)).toBeDefined();
          await expect(store.read(markerName)).rejects.toThrow();
          return;
        }
        if (mode === 'interrupted' || mode === 'changed') {
          const controller = new AbortController(),
            write = store.write.bind(store);
          store.write = async (name, value) => {
            await write(name, value);
            if (name === markerName) controller.abort();
          };
          await expect(run(controller.signal)).rejects.toThrow();
          store.write = write;
          // Partial deletion resumes from hashed inventory; source dependencies need not be reconstructed.
          await store.remove(`azure-ingress-source-${source.planSha256}.json`);
        }
        expect(await run()).toBeDefined();
        for (const name of records.keys()) await expect(store.read(name)).rejects.toThrow();
        expect(await store.read(markerName)).toBeDefined();
        expect(await run()).toBeDefined();
      } finally {
        await cleanup?.();
        await history.cleanup();
      }
    });
  }

for (const mode of [
  'complete',
  'planned',
  'submitted',
  'interrupted',
  'foreign',
  'missing-contract',
  'changed',
  'reappeared',
] as const) {
  test(`native upgrade parent retirement ${mode}`, async () => {
    const f = await nativeRelayRetirementFixture();
    try {
      const target = 'crt-20260201-0179';
      let complete = false;
      const observeUpgrade = async () => ({
        ...nativeUpgradeTestObservation(f.binding, target, complete ? 'complete' : 'ready'),
        siteUid: f.teardown.retirement[0].siteUid,
        physicalSiteUid: f.teardown.retirement[0].physicalSiteUid,
        siteContractFingerprint: f.teardown.drain.siteContractFingerprint,
      });
      const upgrade = await prepareAzureNativeUpgrade(
        f.source,
        { kind: 'software', version: target },
        { observeUpgrade },
        nativeUpgradeTestContract,
      );
      await f.storage.write(`${upgrade.planId}.json`, upgrade);
      if (mode !== 'planned') {
        await f.storage.write(`${upgrade.planId}-authorization.json`, {
          schemaVersion: 2,
          engine: 'native',
          sourcePlanSha256: f.source.planSha256,
          upgradePlanSha256: upgrade.planSha256,
          mutations: true,
        });
        await runAzureNativeUpgrade(
          f.source,
          upgrade,
          upgrade.planSha256,
          {
            engine: 'native',
            observeUpgrade,
            async submitUpgrade(_binding, _contract, _target, _uid, boundary) {
              await boundary();
              complete = mode !== 'submitted';
              return { status: 'submitted' } as never;
            },
          },
          nativeUpgradeTestContract,
          f.storage,
        );
      }
      if (mode === 'foreign') {
        const auth = (await f.storage.read(`${upgrade.planId}-authorization.json`)) as Record<string, unknown>;
        await f.storage.write(`${upgrade.planId}-authorization.json`, { ...auth, sourcePlanSha256: 'f'.repeat(64) });
      }
      const runTeardown = (signal?: AbortSignal) =>
        runAzureNativeTeardown(
          f.source,
          f.cloudPlan,
          f.teardown,
          f.teardown.planSha256,
          f.runtime,
          f.contract,
          f.storage,
          async () => ({ status: 'retired', absence: 'absent' }),
          signal,
          f.cloud.api,
          nativeUpgradeTestContract,
        );
      const marker = 'azure-native-parent-artifact-retirement.json';
      if (mode === 'foreign') {
        await expect(runTeardown()).rejects.toThrow();
        expect(await f.storage.read(`${upgrade.planId}.json`)).toEqual(upgrade);
        await expect(f.storage.read(marker)).rejects.toThrow();
        return;
      }
      if (mode === 'missing-contract') {
        // Build the terminal barriers through the coordinator, then independently test the parent's required contract.
        const controller = new AbortController(),
          write = f.storage.write.bind(f.storage);
        f.storage.write = async (name, value) => {
          await write(name, value);
          if (name === marker) controller.abort();
        };
        await expect(runTeardown(controller.signal)).rejects.toThrow();
        f.storage.write = write;
        await f.storage.remove(marker);
        await expect(
          retireAzureNativeParentArtifacts(
            f.source,
            f.cloudPlan,
            f.teardown,
            f.runtime,
            f.contract,
            f.storage,
            f.cloud.api,
          ),
        ).rejects.toThrow('verified upgrade contract missing');
        expect(await f.storage.read(`${upgrade.planId}.json`)).toEqual(upgrade);
        return;
      }
      if (mode === 'interrupted' || mode === 'changed') {
        const controller = new AbortController(),
          write = f.storage.write.bind(f.storage);
        f.storage.write = async (name, value) => {
          await write(name, value);
          if (name === marker) controller.abort();
        };
        await expect(runTeardown(controller.signal)).rejects.toThrow();
        f.storage.write = write;
        if (mode === 'changed') {
          await f.storage.write(`${upgrade.planId}-receipt.json`, { status: 'changed' });
          await expect(runTeardown()).rejects.toThrow('inventory changed');
          expect(await f.storage.read(`${upgrade.planId}.json`)).toEqual(upgrade);
          return;
        }
      }
      const result = await runTeardown();
      expect('completeCleanup' in result && result.completeCleanup).toBe(true);
      await expect(f.storage.read(`${upgrade.planId}.json`)).rejects.toThrow();
      if (mode === 'reappeared') {
        await f.storage.write(`${upgrade.planId}.json`, upgrade);
        await expect(runTeardown()).rejects.toThrow('inventory changed');
      } else expect('completeCleanup' in (await runTeardown())).toBe(true);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
}

test('read-only relay failover neighbor probe retains all identities and proves selected CE peer non-establishment for both engines', async () => {
  for (const engine of ['native', 'terraform'] as const) {
    const f = routeServerFixture(engine, true);
    const server = await observeAzureRelayRouteServerIdentity(f.source, f.plan, f.api);
    const endpoints = [1, 2, 3].map((node) => ({ node, address: `10.20.0.${node + 3}` }));
    for (const relay of f.plan.relays) {
      const request = compileAzureRelayGuestSessions(f.source, f.plan, relay.name, server, endpoints, 'a'.repeat(32), {
        nodeIndex: 2,
      });
      const normal = compileAzureRelayGuestSessions(f.source, f.plan, relay.name, server, endpoints, 'a'.repeat(32));
      expect(request.observation.configuration).toBe(normal.observation.configuration);
      expect(request.expected.configSha256).toBe(normal.expected.configSha256);
      expect(request.sessionBinding.peers).toEqual(normal.sessionBinding.peers);
      const bootstrap = JSON.parse(
        renderAzureRelayCloudInit(f.source, f.plan, relay.name).slice('#cloud-config\n'.length),
      );
      for (const state of ['Idle', 'Connect', 'Active']) {
        const child = Bun.spawn(['python3', new URL('./relay-guest-harness.py', import.meta.url).pathname], {
          stdin: new Blob([
            JSON.stringify({
              ...request,
              bootstrap,
              configuration: request.observation.configuration,
              scenario: `sessions-outage-${state}`,
            }),
          ]),
          stdout: 'pipe',
          stderr: 'pipe',
        });
        const [exit, stdout, stderr] = await Promise.all([
          child.exited,
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
        ]);
        expect(exit).toBe(0);
        expect(stderr).toBe('');
        const lines = stdout.trim().split('\n');
        expect(JSON.parse(lines.at(-1) as string)).toMatchObject({ starts: 0, parserRuns: 0, executions: 2 });
        const response = {
          value: [
            { code: 'ComponentStatus/StdOut/succeeded', level: 'Info', message: lines[0] },
            { code: 'ComponentStatus/StdErr/succeeded', level: 'Info', message: '' },
          ],
        };
        const evidence = parseAzureRelayGuestSessions(request, response);
        expect(evidence.sessions).toHaveLength(5);
        expect(evidence.outage).toEqual({
          nodeIndex: 2,
          address: endpoints[1].address,
          state,
          ceEstablishedSessions: 2,
          routeServerEstablishedSessions: 2,
        });
        expect(evidence.ceSampleFreshnessQualified).toBe(false);
        const prefix = `XCSH_RELAY_SESSIONS:${request.expected.nonce}:`;
        const payload = JSON.parse(response.value[0].message.slice(prefix.length));
        const selected = payload.sessions.findIndex((row: { address: string }) => row.address === endpoints[1].address);
        for (const corruption of ['state', 'missing', 'admin', 'duplicate'] as const) {
          const changed = structuredClone(payload);
          if (corruption === 'state') changed.sessions[selected].state = 'Established';
          if (corruption === 'missing') changed.sessions.splice(selected, 1);
          if (corruption === 'admin') changed.sessions[selected].adminShutDown = true;
          if (corruption === 'duplicate') changed.sessions[selected] = changed.sessions[0];
          const raw = structuredClone(response);
          raw.value[0].message = prefix + JSON.stringify(changed);
          expect(() => parseAzureRelayGuestSessions(request, raw)).toThrow();
        }
      }
    }
  }
});

test('relay outage neighbor probe rejects unrelated or administrative loss, missing evidence and invalid selection', async () => {
  const f = routeServerFixture('native', true);
  const server = await observeAzureRelayRouteServerIdentity(f.source, f.plan, f.api);
  const endpoints = [1, 2, 3].map((node) => ({ node, address: `10.20.0.${node + 3}` }));
  const request = compileAzureRelayGuestSessions(
    f.source,
    f.plan,
    f.plan.relays[0].name,
    server,
    endpoints,
    'a'.repeat(32),
    { nodeIndex: 2 },
  );
  const bootstrap = JSON.parse(
    renderAzureRelayCloudInit(f.source, f.plan, f.plan.relays[0].name).slice('#cloud-config\n'.length),
  );
  for (const scenario of [
    'sessions-complete',
    'sessions-outage-other-down',
    'sessions-outage-cloud-down',
    'sessions-outage-admin-down',
    'sessions-outage-missing-state',
    'sessions-outage-disappeared',
  ]) {
    const child = Bun.spawn(['python3', new URL('./relay-guest-harness.py', import.meta.url).pathname], {
      stdin: new Blob([
        JSON.stringify({ ...request, bootstrap, configuration: request.observation.configuration, scenario }),
      ]),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [exit, stdout] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(exit).not.toBe(0);
    expect(stdout).not.toContain('XCSH_RELAY_SESSIONS');
  }
  for (const nodeIndex of [0, 4, 1.5])
    expect(() =>
      compileAzureRelayGuestSessions(f.source, f.plan, f.plan.relays[0].name, server, endpoints, 'a'.repeat(32), {
        nodeIndex,
      }),
    ).toThrow();
  const single = routeServerFixture();
  const singleServer = await observeAzureRelayRouteServerIdentity(single.source, single.plan, single.api);
  expect(() =>
    compileAzureRelayGuestSessions(
      single.source,
      single.plan,
      single.plan.relays[0].name,
      singleServer,
      [endpoints[0]],
      'a'.repeat(32),
      { nodeIndex: 1 },
    ),
  ).toThrow();
});

test('relay neighbor probe consumes actual pinned FRR transition fields with explicitly simulated cloud address joins', async () => {
  const fixture = await Bun.file(new URL('./relay-frr-neighbor-readback.json', import.meta.url).pathname).json();
  expect(fixture.qualification.network).toBe('none');
  expect(fixture.qualification.samePeerIdentities).toBe(true);
  const f = routeServerFixture('native', true);
  const server = await observeAzureRelayRouteServerIdentity(f.source, f.plan, f.api);
  const endpoints = [1, 2, 3].map((node) => ({ node, address: `10.20.0.${node + 3}` }));
  const normal = compileAzureRelayGuestSessions(
    f.source,
    f.plan,
    f.plan.relays[0].name,
    server,
    endpoints,
    'a'.repeat(32),
  );
  const original = Object.keys(fixture.peers.baseline).sort();
  const translations = new Map(
    original.map((address: string, index: number) => [address, normal.sessionBinding.peers[index].address]),
  );
  translations.set('127.0.0.2', normal.sessionBinding.localAddress);
  for (const phase of ['baseline', 'outage', 'restored'] as const) {
    const request =
      phase === 'outage'
        ? compileAzureRelayGuestSessions(f.source, f.plan, f.plan.relays[0].name, server, endpoints, 'a'.repeat(32), {
            nodeIndex: 2,
          })
        : normal;
    const neighbors = Object.fromEntries(
      Object.entries(fixture.peers[phase]).map(([address, raw]) => {
        const row = { ...(raw as Record<string, unknown>) };
        for (const key of ['hostLocal', 'hostForeign', 'updateSource']) row[key] = translations.get(String(row[key]));
        return [translations.get(address), row];
      }),
    );
    const bootstrap = JSON.parse(
      renderAzureRelayCloudInit(f.source, f.plan, f.plan.relays[0].name).slice('#cloud-config\n'.length),
    );
    const child = Bun.spawn(['python3', new URL('./relay-guest-harness.py', import.meta.url).pathname], {
      stdin: new Blob([
        JSON.stringify({
          ...request,
          bootstrap,
          neighborReadback: neighbors,
          configuration: request.observation.configuration,
          scenario: 'sessions-complete',
        }),
      ]),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [exit, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(exit).toBe(0);
    expect(stderr).toBe('');
    const response = {
      value: [
        { code: 'ComponentStatus/StdOut/succeeded', level: 'Info', message: stdout.trim().split('\n')[0] },
        { code: 'ComponentStatus/StdErr/succeeded', level: 'Info', message: '' },
      ],
    };
    const result = parseAzureRelayGuestSessions(request, response);
    expect(result.sessions.map((row) => row.state)).toEqual(
      Object.values(fixture.peers[phase]).map((row) => (row as { bgpState: string }).bgpState),
    );
    expect(result.sessions).toHaveLength(5);
    expect(result.ceSampleFreshnessQualified).toBe(false);
    expect(result.outage?.state).toBe(phase === 'outage' ? 'Idle' : undefined);
  }
});

test('relay outage route and FIB probes preserve configuration and use surviving CE next hops for both engines', async () => {
  for (const engine of ['native', 'terraform'] as const) {
    const f = routeServerFixture(engine, true);
    const server = await observeAzureRelayRouteServerIdentity(f.source, f.plan, f.api);
    const endpoints = [1, 2, 3].map((node) => ({ node, address: `10.20.0.${node + 3}` }));
    for (const relay of f.plan.relays) {
      const normal = compileAzureRelayGuestSessions(f.source, f.plan, relay.name, server, endpoints, 'a'.repeat(32));
      const tasks = [
        { direction: 'received' as const, prefix: f.plan.vipPrefixes[0], peer: undefined },
        { direction: 'received' as const, prefix: f.plan.returnPrefixes[0], peer: undefined },
        { direction: 'advertised' as const, prefix: f.plan.vipPrefixes[0], peer: server.serviceAddresses[0] },
        { direction: 'advertised' as const, prefix: f.plan.returnPrefixes[0], peer: endpoints[1].address },
      ];
      for (const task of tasks) {
        const compile = task.direction === 'received' ? compileAzureRelayGuestFib : compileAzureRelayGuestRoute;
        const request = compile(
          f.source,
          f.plan,
          relay.name,
          server,
          endpoints,
          'a'.repeat(32),
          task.direction,
          task.prefix,
          task.peer,
          { nodeIndex: 1 },
        );
        const routeRequest = 'fibBinding' in request ? request.routeRequest : request;
        const session = routeRequest.sessionRequest;
        expect(session.sessionBinding.unavailablePeer?.address).toBe(endpoints[0].address);
        expect(session.observation.configuration).toBe(normal.observation.configuration);
        expect(session.sessionBinding.peers).toEqual(normal.sessionBinding.peers);
        if (task.prefix === f.plan.vipPrefixes[0])
          expect(routeRequest.routeBinding.sourcePeers.map((row) => row.address)).toEqual(
            endpoints.slice(1).map((row) => row.address),
          );
        const bootstrap = JSON.parse(
          renderAzureRelayCloudInit(f.source, f.plan, relay.name).slice('#cloud-config\n'.length),
        );
        const child = Bun.spawn(['python3', new URL('./relay-guest-harness.py', import.meta.url).pathname], {
          stdin: new Blob([
            JSON.stringify({
              ...request,
              expected: session.expected,
              sessionBinding: session.sessionBinding,
              routeBinding: routeRequest.routeBinding,
              bootstrap,
              configuration: session.observation.configuration,
              scenario: `${'fibBinding' in request ? 'fib' : 'routes'}-outage-Idle`,
            }),
          ]),
          stdout: 'pipe',
          stderr: 'pipe',
        });
        const [exit, stdout, stderr] = await Promise.all([
          child.exited,
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
        ]);
        expect(exit).toBe(0);
        expect(stderr).toBe('');
        const lines = stdout.trim().split('\n');
        expect(JSON.parse(lines.at(-1) as string).starts).toBe(0);
        const response = {
          value: [
            { code: 'ComponentStatus/StdOut/succeeded', level: 'Info', message: lines[0] },
            { code: 'ComponentStatus/StdErr/succeeded', level: 'Info', message: '' },
          ],
        };
        const result =
          'fibBinding' in request
            ? parseAzureRelayGuestFib(request, response).membership
            : parseAzureRelayGuestRoute(request, response);
        expect(result.session.outage?.state).toBe('Idle');
        expect(result.ceSampleFreshnessQualified).toBe(false);
        if (task.direction === 'received' && task.prefix === f.plan.vipPrefixes[0] && 'fibBinding' in request) {
          expect(result.route.nextHop).toBe(endpoints[1].address);
          const prefix = `XCSH_RELAY_FIB:${session.expected.nonce}:`;
          const changed = JSON.parse(lines[0].slice(prefix.length));
          changed.membership.route.peerAddress = endpoints[0].address;
          changed.membership.route.nextHop = endpoints[0].address;
          changed.fib.nextHop = endpoints[0].address;
          const raw = structuredClone(response);
          raw.value[0].message = prefix + JSON.stringify(changed);
          expect(() => parseAzureRelayGuestFib(request, raw)).toThrow();
        }
      }
      expect(() =>
        compileAzureRelayGuestRoute(
          f.source,
          f.plan,
          relay.name,
          server,
          endpoints,
          'a'.repeat(32),
          'advertised',
          f.plan.returnPrefixes[0],
          endpoints[0].address,
          { nodeIndex: 1 },
        ),
      ).toThrow();
    }
  }
});

async function relayOutageIdentityFixture(engine: 'native' | 'terraform') {
  const f = relayWorkflowFixture(engine, true, true);
  const configured = await ensureAzureRelayRoutingWorkflow(f.source, f.expected, f.runtime, f.storage, f.api);
  f.saved.set('relay-routing-configuration.json', configured);
  const baselineRecords = structuredClone(f.saved);
  const scopes: string[][] = [];
  let power = 'VM deallocated',
    detailedReads = 0,
    recoverDuringCollection = false;
  const api: AzExecApi = {
    async exec(command, args, options) {
      if (args[0] === 'account')
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            id: f.source.subscription.id,
            tenantId: f.source.subscription.tenantId,
            environmentName: f.source.subscription.cloud,
            state: 'Enabled',
          }),
        };
      if (args.includes('--show-details')) {
        const value = f.objects[args[args.indexOf('--ids') + 1]];
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            ...value,
            powerState: recoverDuringCollection && ++detailedReads > 1 ? 'VM running' : power,
          }),
        };
      }
      return f.api.exec(command, args, options);
    },
  };
  const runtime = {
    ...f.runtime,
    async observeAzureInterfacesForNodes(_binding: unknown, _expected: unknown, nodes: string[]) {
      scopes.push(nodes);
      return {
        status: 'observed' as const,
        freshness: 'verified' as const,
        canSatisfyInterfaceMutationGate: true,
        interfaces: structuredClone(f.observed.filter((row) => nodes.includes(row.node))),
        observedAt: new Date().toISOString(),
      };
    },
  };
  return {
    ...f,
    api,
    runtime,
    baselineRecords,
    scopes,
    get power() {
      return power;
    },
    set power(value: string) {
      power = value;
    },
    get recoverDuringCollection() {
      return recoverDuringCollection;
    },
    set recoverDuringCollection(value: boolean) {
      recoverDuringCollection = value;
    },
  };
}

test('relay outage identity preserves six cloud joins and observes only four surviving interfaces for both engines', async () => {
  for (const engine of ['native', 'terraform'] as const) {
    const f = await relayOutageIdentityFixture(engine);
    const before = canonicalSha256([...f.saved]);
    const context = await azureRelayCurrentIdentityContext(
      f.source,
      f.expected,
      f.runtime,
      f.storage,
      f.api,
      undefined,
      { nodeIndex: 2, baselineRecords: f.baselineRecords },
    );
    const observed = await context.observe();
    expect(observed.identity.stable.cloud).toHaveLength(6);
    expect(observed.slo).toHaveLength(2);
    expect(observed.endpoints).toHaveLength(3);
    expect(observed.outage).toMatchObject({
      nodeIndex: 2,
      powerState: 'deallocated',
      currentInterfaces: 4,
      retainedInterfaceIdentity: 'historical',
      ceSampleFreshnessQualified: false,
    });
    const journal = f.baselineRecords.get('relay-routing-workflow.json') as { bindingSha256: string };
    expect(observed.bindingSha256).toBe(journal.bindingSha256);
    expect(f.scopes).toEqual([[`${f.source.deploymentName}-1`, `${f.source.deploymentName}-3`]]);
    expect(canonicalSha256([...f.saved])).toBe(before);
    f.power = 'VM running';
    await expect(context.observe()).rejects.toThrow('deallocated');
  }
});

for (const mode of [
  'missing-config',
  'foreign-baseline',
  'changed-mac',
  'changed-uuid',
  'changed-device',
  'survivor-down',
  'survivor-partial',
  'selected-reappears',
  'invalid-node',
  'cancelled',
  'recovered-during-collection',
  'ignored-cancellation',
] as const)
  test(`relay outage identity rejects ${mode}`, async () => {
    const f = await relayOutageIdentityFixture('native');
    const journal = f.baselineRecords.get('relay-routing-workflow.json') as { engine: string };
    if (mode === 'missing-config') f.baselineRecords.delete('relay-routing-configuration.json');
    if (mode === 'foreign-baseline') journal.engine = 'terraform';
    const selectedNic = f.source.actions.find((row) => row.kind === 'nic-create' && row.node === 2);
    const selectedVm = f.source.actions.find((row) => row.kind === 'vm-create' && row.node === 2);
    if (!selectedNic?.resourceId || !selectedVm?.resourceId) throw Error('missing selected cloud fixture');
    if (mode === 'changed-mac') f.objects[selectedNic.resourceId].macAddress = '02:aa:bb:cc:dd:ef';
    if (mode === 'changed-uuid') f.objects[selectedVm.resourceId].vmId = '00000000-0000-4000-8000-999999999999';
    if (mode === 'changed-device') f.observed[0].device = 'foreign-device';
    if (mode === 'survivor-down') f.observed[0].linkUp = false;
    if (mode === 'survivor-partial') f.observed.splice(0, 1);
    if (mode === 'selected-reappears')
      f.runtime.observeAzureInterfacesForNodes = async () => ({
        status: 'observed',
        freshness: 'verified',
        canSatisfyInterfaceMutationGate: true,
        interfaces: structuredClone(f.observed),
        observedAt: new Date().toISOString(),
      });
    const abort = new AbortController();
    if (mode === 'cancelled') abort.abort(Error('cancel outage'));
    if (mode === 'recovered-during-collection') f.recoverDuringCollection = true;
    if (mode === 'ignored-cancellation') {
      const original = f.runtime.observeAzureInterfacesForNodes;
      f.runtime.observeAzureInterfacesForNodes = async (...args) => {
        const result = await original(...args);
        abort.abort(Error('ignored cancellation'));
        return result;
      };
    }
    await expect(
      (async () => {
        const context = await azureRelayCurrentIdentityContext(
          f.source,
          f.expected,
          f.runtime,
          f.storage,
          f.api,
          abort.signal,
          { nodeIndex: mode === 'invalid-node' ? 4 : 2, baselineRecords: f.baselineRecords },
        );
        return context.observe();
      })(),
    ).rejects.toThrow();
  });

test('read-only relay outage coordinator joins surviving CE sessions with explicit guest outage and unchanged cloud peers', async () => {
  for (const engine of ['native', 'terraform'] as const) {
    const fixture = await relayOperationalFixture(engine, true, true);
    fixture.mode = 'outage';
    const { f, runtime, api } = fixture;
    const before = canonicalSha256([...f.saved]);
    const evidence = await observeAzureRelayRoutingWorkflow(f.source, f.expected, runtime, f.storage, api, undefined, {
      nodeIndex: 2,
    });
    expect(evidence.sessions.establishedSessions).toBe(4);
    expect(evidence.finalSessions.establishedSessions).toBe(4);
    expect(evidence.ceRoutes.nodes).toHaveLength(2);
    expect(evidence.guestRoutes).toHaveLength(12);
    for (const route of evidence.guestRoutes) {
      expect(route.session.outage).toMatchObject({
        nodeIndex: 2,
        state: 'Idle',
        ceEstablishedSessions: 2,
        routeServerEstablishedSessions: 2,
      });
      expect(route.session.sessions).toHaveLength(5);
    }
    expect(evidence.cloudRoutes.peers).toHaveLength(2);
    expect(evidence.outage).toMatchObject({
      nodeIndex: 2,
      currentInterfaces: 4,
      retainedInterfaceIdentity: 'historical',
    });
    expect(evidence.routing).toBe('unknown');
    expect(evidence.freshness).toBe('unqualified');
    expect(evidence.ceSampleFreshnessQualified).toBe(false);
    expect(canonicalSha256([...f.saved])).toBe(before);
  }
});

for (const mode of ['all-established', 'cloud-unavailable', 'guest-unavailable', 'missing-baseline'] as const)
  test(`read-only relay outage coordinator rejects ${mode} without recording acceptance`, async () => {
    const fixture = await relayOperationalFixture('native', true, true);
    fixture.mode = 'outage';
    const { f, runtime } = fixture;
    if (mode === 'missing-baseline') f.saved.delete('relay-routing-configuration.json');
    const before = canonicalSha256([...f.saved]);
    const api: AzExecApi = {
      async exec(command, args, options) {
        if (
          (mode === 'cloud-unavailable' && args.some((arg) => arg.includes('list-learned-routes'))) ||
          (mode === 'guest-unavailable' && args.includes('run-command'))
        )
          return { exitCode: 1, stdout: '', stderr: 'unavailable' };
        const result = await fixture.api.exec(command, args, options);
        if (mode !== 'all-established' || !args.includes('run-command')) return result;
        const value = JSON.parse(result.stdout);
        const message = value.value[0].message as string;
        const offset = message.indexOf('{');
        const payload = JSON.parse(message.slice(offset));
        const sessions = payload.membership?.session.sessions ?? payload.session.sessions;
        for (const peer of sessions) peer.state = 'Established';
        value.value[0].message = message.slice(0, offset) + JSON.stringify(payload);
        return { ...result, stdout: JSON.stringify(value) };
      },
    };
    await expect(
      observeAzureRelayRoutingWorkflow(f.source, f.expected, runtime, f.storage, api, undefined, { nodeIndex: 2 }),
    ).rejects.toThrow();
    expect(canonicalSha256([...f.saved])).toBe(before);
  });

function relayFailoverScopeFixture(f: Awaited<ReturnType<typeof relayOutageIdentityFixture>>) {
  const fingerprint = `sha256:${'a'.repeat(64)}`;
  const records = structuredClone(f.baselineRecords);
  (records.get('platform-relay-routing.json') as { contractFingerprint: string }).contractFingerprint = fingerprint;
  return {
    records,
    capabilities: { tenantOrigin: 'https://owned.example', contractFingerprint: fingerprint },
    stored: {
      schemaVersion: 1 as const,
      tenantOrigin: 'https://owned.example',
      contractFingerprint: fingerprint,
      siteUid: 'owned-site-uid',
      binding: azureUpgradeBinding(f.source),
      expectedInterfaces: structuredClone(f.expected),
    },
  };
}

test('relay failover scope requires complete context-bound six-interface and historical configuration joins', async () => {
  for (const engine of ['native', 'terraform'] as const) {
    const f = await relayOutageIdentityFixture(engine);
    const s = relayFailoverScopeFixture(f);
    const scope = requireAzureRelayFailoverScope(f.source, s.stored, s.capabilities, s.records);
    expect(scope.expectedInterfaces).toHaveLength(6);
    expect(scope.siteUid).toBe('owned-site-uid');
    expect(scope.topology).toBe('ce-relay-route-server');
    expect(scope.ceSessionSequence).toEqual([6, 4, 6]);
    expect(scope.cloudSessionSequence).toEqual([4, 4, 4]);
    expect(scope.currentTrafficQualified).toBe(false);
    scope.expectedInterfaces[0].mac = '02:aa:bb:cc:dd:ee';
    expect(s.stored.expectedInterfaces[0].mac).not.toBe(scope.expectedInterfaces[0].mac);
  }
});

for (const mode of [
  'foreign-origin',
  'foreign-contract',
  'foreign-site',
  'foreign-owner',
  'foreign-node',
  'partial',
  'duplicate',
  'changed-mac',
  'missing-config',
  'missing-platform',
  'foreign-platform',
  'extra-binding',
  'wrong-schema',
] as const)
  test(`relay failover scope rejects ${mode} before external observation`, async () => {
    const f = await relayOutageIdentityFixture('native');
    const s = relayFailoverScopeFixture(f);
    if (mode === 'foreign-origin') s.capabilities.tenantOrigin = 'https://foreign.example';
    if (mode === 'foreign-contract') s.capabilities.contractFingerprint = `sha256:${'b'.repeat(64)}`;
    if (mode === 'foreign-site') s.stored.siteUid = 'foreign';
    if (mode === 'foreign-owner') s.stored.binding.owner.engine = 'terraform';
    if (mode === 'foreign-node') s.stored.binding.nodes[0] = 'foreign';
    if (mode === 'partial') s.stored.expectedInterfaces.pop();
    if (mode === 'duplicate') s.stored.expectedInterfaces[1] = structuredClone(s.stored.expectedInterfaces[0]);
    if (mode === 'changed-mac') s.stored.expectedInterfaces[0].mac = '02:aa:bb:cc:dd:ee';
    if (mode === 'missing-config') s.records.delete('relay-routing-configuration.json');
    if (mode === 'missing-platform') s.records.delete('platform-relay-routing.json');
    if (mode === 'foreign-platform')
      (s.records.get('platform-relay-routing.json') as { contractFingerprint: string }).contractFingerprint =
        `sha256:${'b'.repeat(64)}`;
    if (mode === 'extra-binding') Object.assign(s.stored, { extra: true });
    if (mode === 'wrong-schema') Object.assign(s.stored, { schemaVersion: 2 });
    expect(() => requireAzureRelayFailoverScope(f.source, s.stored, s.capabilities, s.records)).toThrow();
  });

async function publicRelayFailoverFixture(engine: 'native' | 'terraform') {
  const fixture = await relayOperationalFixture(engine, true, true, true);
  const { f } = fixture;
  const root = await mkdtemp(join(tmpdir(), 'relay-public-failover-'));
  const storage = await CeDeploymentStore.open(root, azureFailoverOwner(f.source));
  const scope = relayFailoverScopeFixture({ ...f, baselineRecords: f.saved } as Awaited<
    ReturnType<typeof relayOutageIdentityFixture>
  >);
  for (const [name, value] of scope.records) await storage.write(name, value);
  const vm = f.source.actions.find((row) => row.kind === 'vm-create' && row.node === 2);
  if (!vm?.resourceId) throw Error('missing CE VM');
  const failover = buildAzureCeFailoverPlan(f.source, {
    schemaVersion: 1,
    source: 'azure-cli-live',
    subscriptionId: f.source.subscription.id,
    region: f.source.region,
    engine,
    deploymentId: f.source.deploymentName,
    sourcePlanSha256: f.source.planSha256,
    nodeIndex: 2,
    vmResourceId: vm.resourceId,
    vmId: String(f.objects[vm.resourceId].vmId),
    powerState: 'running',
    observedAt: new Date().toISOString(),
  });
  await storage.write(`${failover.planId}.json`, failover);
  const ingress = f.source.intent.ingress;
  if (ingress?.mode !== 'platform-http') throw Error('Public relay fixture requires HTTP ingress');
  const sourceId = ingress.probe.sourceVmResourceId;
  const nicId =
    `/subscriptions/${f.source.subscription.id}/resourceGroups/rg-app/providers/Microsoft.Network/networkInterfaces/probe-nic`.toLowerCase();
  const calls: string[][] = [],
    contexts: Array<string | undefined> = [];
  let contractCalls = 0,
    bindingReads = 0;
  const platform = {
    storage: async () => storage,
    runtime: async (_engine: string, context?: string) => {
      contexts.push(context);
      return runtime;
    },
    siteBinding: async (_site: string, context?: string) => {
      contexts.push(context);
      bindingReads++;
      return structuredClone(scope.stored);
    },
    capabilities: async (context?: string) => {
      contexts.push(context);
      return scope.capabilities;
    },
  } as unknown as CePlatformService;
  const runtime = {
    ...fixture.runtime,
    async observeBgpSessions(...args: Parameters<typeof fixture.runtime.observeBgpSessions>) {
      return {
        ...(await fixture.runtime.observeBgpSessions(...args)),
        contractFingerprint: scope.capabilities.contractFingerprint,
      };
    },
    async observeBgpRoutes() {
      return {
        ...(await fixture.runtime.observeBgpRoutes()),
        contractFingerprint: scope.capabilities.contractFingerprint,
      };
    },
    async observeBgpRoutesForNodes(...args: Parameters<typeof fixture.runtime.observeBgpRoutesForNodes>) {
      return {
        ...(await fixture.runtime.observeBgpRoutesForNodes(...args)),
        contractFingerprint: scope.capabilities.contractFingerprint,
      };
    },
    requireRoutingContract() {
      throw Error('relay must not select direct Route Server contract');
    },
    requireAzureRelayRoutingContract() {
      contractCalls++;
    },
  };
  const api: AzExecApi = {
    async exec(command, args, options) {
      calls.push(args);
      if (args[0] === 'account')
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            id: f.source.subscription.id,
            tenantId: f.source.subscription.tenantId,
            environmentName: f.source.subscription.cloud,
            state: 'Enabled',
          }),
        };
      if (args.includes(sourceId as string)) {
        if (args[1] === 'show')
          return {
            exitCode: 0,
            stderr: '',
            stdout: JSON.stringify({
              id: sourceId,
              vmId: '33333333-3333-4333-8333-333333333333',
              location: f.source.region,
              provisioningState: 'Succeeded',
              powerState: 'VM running',
              networkProfile: { networkInterfaces: [{ id: nicId, primary: true }] },
            }),
          };
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            value: [
              { code: 'ComponentStatus/StdOut/succeeded', message: `200 ${'4'.repeat(64)}\n` },
              { code: 'ComponentStatus/StdErr/succeeded', message: '' },
            ],
          }),
        };
      }
      if (args.includes(nicId))
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify({
            id: nicId,
            provisioningState: 'Succeeded',
            virtualMachine: { id: sourceId },
            ipConfigurations: [{ primary: true, privateIPAddressVersion: 'IPv4', privateIPAddress: '10.30.0.4' }],
          }),
        };
      return fixture.api.exec(command, args, options);
    },
  };
  return {
    fixture,
    scope,
    storage,
    platform,
    runtime,
    api,
    root,
    failover,
    calls,
    contexts,
    get contractCalls() {
      return contractCalls;
    },
    get bindingReads() {
      return bindingReads;
    },
  };
}

for (const engine of ['native', 'terraform'] as const) {
  test(`relay failover phase collector executes fresh traffic and preserves unknown acceptance across all phases for ${engine}`, async () => {
    const f = await publicRelayFailoverFixture(engine);
    try {
      const keys = new Set<string>();
      for (const phase of ['baseline', 'outage', 'recovered'] as const) {
        f.fixture.mode = phase === 'outage' ? 'outage' : 'complete';
        const evidence = await collectAzureRelayFailoverAcceptance(
          f.fixture.f.source,
          f.failover,
          phase,
          f.platform,
          f.runtime,
          f.storage,
          f.api,
        );
        expect(evidence.acceptance).toBe('unknown');
        expect(evidence.expectedEstablishedSessions).toBe(phase === 'outage' ? 4 : 6);
        expect(evidence.expectedCloudEstablishedSessions).toBe(4);
        expect(evidence.traffic.status).toBe('healthy');
        expect(evidence.observation.ceSampleFreshnessQualified).toBe(false);
        expect(keys.has(evidence.trafficCheckpointKey)).toBe(false);
        keys.add(evidence.trafficCheckpointKey);
      }
      expect(f.bindingReads).toBe(3);
      expect(
        f.calls.filter(
          (args) =>
            args.includes('run-command') &&
            args.includes(
              f.fixture.f.source.intent.ingress?.mode === 'platform-http'
                ? f.fixture.f.source.intent.ingress.probe.sourceVmResourceId
                : '',
            ),
        ),
      ).toHaveLength(3);
      expect(f.calls.some((args) => args.includes('deallocate') || args.includes('start'))).toBe(false);
    } finally {
      await rm(f.root, { recursive: true });
    }
  });
}

test('public relay failover selects relay contract and stops before authorization on collected unknown qualification', async () => {
  for (const engine of ['native', 'terraform'] as const) {
    const f = await publicRelayFailoverFixture(engine);
    try {
      const artifacts: string[] = [];
      let confirmations = 0,
        terraformLoads = 0;
      const ctx = {
        cwd: '/tmp',
        hasUI: true,
        ui: {
          async confirm() {
            confirmations++;
            return true;
          },
        },
        sessionManager: {
          getSessionId: () => `relay-public-${engine}`,
          getArtifactsDir: () => null,
          getArtifactPath: async () => null,
          async saveArtifact(value: string) {
            artifacts.push(value);
            return String(artifacts.length);
          },
        },
      };
      await savePlanArtifact(ctx.sessionManager, f.fixture.f.source, observation);
      const pi = {
        typebox: {
          Type: {
            Object: (v: unknown) => v,
            String: () => ({}),
            Number: () => ({}),
            Optional: (v: unknown) => v,
            Union: (v: unknown) => v,
            Literal: (v: unknown) => v,
          },
        },
      };
      const tool = createAzureCeFailoverTool(pi as never, {
        platform: async () => f.platform,
        terraform: async () => {
          terraformLoads++;
          return {} as never;
        },
        makeApi: () => f.api,
      });
      const result = await tool.execute(
        'apply',
        {
          operation: 'apply',
          basePlanId: f.fixture.f.source.planId,
          basePlanSha256: f.fixture.f.source.planSha256,
          failoverPlanId: f.failover.planId,
          failoverPlanSha256: f.failover.planSha256,
        },
        undefined,
        undefined,
        ctx,
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('admission remains unknown');
      expect(result.details).toMatchObject({ acceptance: 'unknown', topology: 'ce-relay-route-server' });
      expect(confirmations).toBe(0);
      expect(terraformLoads).toBe(0);
      expect(f.contractCalls).toBeGreaterThan(0);
      expect(f.bindingReads).toBe(1);
      await expect(f.storage.read(`${f.failover.planId}-authorization.json`)).rejects.toThrow();
      expect(f.calls.some((args) => args.includes('deallocate') || args.includes('start'))).toBe(false);
    } finally {
      await rm(f.root, { recursive: true });
    }
  }
});

for (const mode of [
  'missing-binding-service',
  'foreign-context',
  'changed-binding',
  'foreign-observer-contract',
  'ignored-cancellation',
] as const)
  test(`relay failover collector rejects ${mode} without HTTP or cloud mutation`, async () => {
    const f = await publicRelayFailoverFixture('native');
    try {
      const abort = new AbortController();
      if (mode === 'missing-binding-service') f.platform.siteBinding = undefined;
      if (mode === 'foreign-context') f.scope.capabilities.tenantOrigin = 'https://foreign.example';
      if (mode === 'changed-binding') f.scope.stored.expectedInterfaces[0].mac = '02:aa:bb:cc:dd:ee';
      if (mode === 'foreign-observer-contract') {
        const original = f.runtime.observeBgpSessions;
        f.runtime.observeBgpSessions = async (...args) => ({
          ...(await original(...args)),
          contractFingerprint: `sha256:${'b'.repeat(64)}`,
        });
      }
      if (mode === 'ignored-cancellation') {
        const original = f.platform.siteBinding;
        if (!original) throw Error('missing test binding service');
        f.platform.siteBinding = async (...args) => {
          const value = await original(...args);
          abort.abort(Error('ignored binding cancellation'));
          return value;
        };
      }
      await expect(
        collectAzureRelayFailoverAcceptance(
          f.fixture.f.source,
          f.failover,
          'baseline',
          f.platform,
          f.runtime,
          f.storage,
          f.api,
          abort.signal,
        ),
      ).rejects.toThrow();
      expect(
        f.calls.some(
          (args) =>
            args.includes('run-command') &&
            args.includes(
              f.fixture.f.source.intent.ingress?.mode === 'platform-http'
                ? f.fixture.f.source.intent.ingress.probe.sourceVmResourceId
                : '',
            ),
        ),
      ).toBe(false);
      expect(f.calls.some((args) => args.includes('deallocate') || args.includes('start'))).toBe(false);
    } finally {
      await rm(f.root, { recursive: true });
    }
  });

for (const engine of ['native', 'terraform'] as const)
  for (const mode of ['locked', 'retired'] as const)
    test(`public ${engine} relay failover rejects ${mode} lifecycle before observation`, async () => {
      const f = await publicRelayFailoverFixture(engine);
      let release: (() => Promise<void>) | undefined;
      try {
        const lock = engine === 'native' ? '.azure-relay-native-mutation-lock' : '.azure-terraform-lifecycle-lock';
        if (mode === 'locked') release = await acquireProcessLock(join(f.storage.directory, lock));
        else await f.storage.write(`azure-${engine}-lifecycle-retirement.json`, { status: 'retired' });
        const artifacts: string[] = [];
        const ctx = {
          cwd: '/tmp',
          hasUI: true,
          ui: {
            async confirm() {
              throw Error('must not authorize');
            },
          },
          sessionManager: {
            getSessionId: () => `relay-${engine}-${mode}`,
            getArtifactsDir: () => null,
            getArtifactPath: async () => null,
            async saveArtifact(value: string) {
              artifacts.push(value);
              return String(artifacts.length);
            },
          },
        };
        await savePlanArtifact(ctx.sessionManager, f.fixture.f.source, observation);
        const pi = {
          typebox: {
            Type: {
              Object: (v: unknown) => v,
              String: () => ({}),
              Number: () => ({}),
              Optional: (v: unknown) => v,
              Union: (v: unknown) => v,
              Literal: (v: unknown) => v,
            },
          },
        };
        const tool = createAzureCeFailoverTool(pi as never, {
          platform: async () => f.platform,
          terraform: async () => {
            throw Error('must not load Terraform');
          },
          makeApi: () => f.api,
        });
        const result = await tool.execute(
          'apply',
          {
            operation: 'apply',
            basePlanId: f.fixture.f.source.planId,
            basePlanSha256: f.fixture.f.source.planSha256,
            failoverPlanId: f.failover.planId,
            failoverPlanSha256: f.failover.planSha256,
          },
          undefined,
          undefined,
          ctx,
        );
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toMatch(mode === 'locked' ? /lock|active|running/i : /retir/i);
        expect(f.bindingReads).toBe(0);
        expect(f.calls).toHaveLength(0);
      } finally {
        await release?.();
        await rm(f.root, { recursive: true });
      }
    });

test('historical relay outage observations recompile complete guest and surviving CE scope for both engines', async () => {
  for (const engine of ['native', 'terraform'] as const) {
    const fixture = await relayOperationalFixture(engine, true, true);
    fixture.mode = 'outage';
    const { f, runtime, api } = fixture;
    const observation = await observeAzureRelayRoutingWorkflow(
      f.source,
      f.expected,
      runtime,
      f.storage,
      api,
      undefined,
      { nodeIndex: 2 },
    );
    const records = structuredClone(f.saved);
    records.set('relay-routing-observation.json', observation);
    const before = canonicalSha256([...records]);
    expect(() =>
      verifyAzureRelayHistoricalArtifacts(f.source, observation.siteUid, records, { nodeIndex: 2 }),
    ).not.toThrow();
    expect(canonicalSha256([...records])).toBe(before);
    expect(observation.routing).toBe('unknown');
    expect(observation.freshness).toBe('unqualified');
  }
});

for (const mode of [
  'wrong-node',
  'missing-outage',
  'extra-outage-field',
  'forged-freshness',
  'stopped-ce-session',
  'stopped-ce-route',
  'stopped-guest-path',
  'cloud-peer-missing',
  'changed-guest-container',
  'duplicate-guest-probe',
] as const)
  test(`historical relay outage rejects ${mode} without treating it as current evidence`, async () => {
    const fixture = await relayOperationalFixture('native', true, true);
    fixture.mode = 'outage';
    const { f, runtime, api } = fixture;
    const observation = await observeAzureRelayRoutingWorkflow(
      f.source,
      f.expected,
      runtime,
      f.storage,
      api,
      undefined,
      { nodeIndex: 2 },
    );
    const row = structuredClone(observation);
    if (mode === 'missing-outage') delete row.outage;
    if (mode === 'extra-outage-field') Object.assign(row.outage ?? {}, { acknowledged: true });
    if (mode === 'forged-freshness') Object.assign(row, { ceSampleFreshnessQualified: true });
    if (mode === 'stopped-ce-session') row.sessions.sessions[0].node = `${f.source.deploymentName}-2`;
    if (mode === 'stopped-ce-route') row.ceRoutes.nodes[0].node = `${f.source.deploymentName}-2`;
    if (mode === 'stopped-guest-path')
      row.guestRoutes[0].route.nextHop = f.observed.find(
        (item) => item.node === `${f.source.deploymentName}-2` && item.role === 'slo',
      )?.ipv4?.address;
    if (mode === 'cloud-peer-missing') row.cloudRoutes.peers.pop();
    if (mode === 'changed-guest-container') row.guestRoutes[0].session.guest.containerId = 'd'.repeat(64);
    if (mode === 'duplicate-guest-probe') row.guestRoutes.push(structuredClone(row.guestRoutes[0]));
    const records = structuredClone(f.saved);
    records.set('relay-routing-observation.json', row);
    expect(() =>
      verifyAzureRelayHistoricalArtifacts(f.source, observation.siteUid, records, {
        nodeIndex: mode === 'wrong-node' ? 1 : 2,
      }),
    ).toThrow();
  });

function mustReplacementFixture<T>(value: T | undefined): T {
  if (value === undefined) throw Error('Required replacement fixture value is missing');
  return value;
}

function replacementRelayWorkflowFixture(engine: 'native' | 'terraform') {
  return replaceRelayWorkflowFixture(relayWorkflowFixture(engine, true, true));
}
function replaceRelayWorkflowFixture<T extends ReturnType<typeof relayWorkflowFixture>>(f: T) {
  const engine = f.source.engine;
  const discovered = structuredClone(observation);
  discovered.regions[0].quotaAvailable = 64;
  discovered.resources = f.source.ownershipInventory
    .filter((row) => row.owned)
    .map((row) => ({
      id: row.resourceId,
      location: f.source.region,
      exists: true,
      owned: true,
      state: {},
      tags: {
        'xcsh-managed-by': 'azure-ce',
        'xcsh-execution-engine': engine,
        'xcsh-deployment-id': f.source.deploymentName,
        'xcsh-plan-sha256': f.source.planSha256,
      },
    }));
  const foundation = compileAzureCePlan(
    { ...f.source.intent, operation: 'replace-node', replacementNode: 2 },
    discovered,
  );
  const replacement = compileAzureRelayReplacementPlan(foundation, f.source, discovered);
  const vmId = mustReplacementFixture(
    mustReplacementFixture(replacement.actions.find((action) => action.kind === 'vm-create')).resourceId,
  );
  f.objects[vmId].tags = { ...f.objects[vmId].tags, 'xcsh-plan-sha256': replacement.planSha256 };
  f.objects[vmId].vmId = '00000000-0000-4000-8000-000000000102';
  return Object.defineProperties(
    { replacement, selectedVmResourceId: vmId },
    Object.getOwnPropertyDescriptors(f),
  ) as T & { replacement: AzureCePlan; selectedVmResourceId: string };
}

test('relay replacement current identity joins six interfaces with original NIC and relay owners and selected new VM owner', async () => {
  for (const engine of ['native', 'terraform'] as const) {
    const f = replacementRelayWorkflowFixture(engine);
    const context = await azureRelayCurrentIdentityContext(f.replacement, f.expected, f.runtime, f.storage, f.api);
    const current = await context.observe();
    expect(current.identity.stable.cloud).toHaveLength(6);
    expect(current.server.peers.map((peer) => peer.name)).toEqual(f.plan.relays.map((relay) => relay.name));
    expect(current.server.sourcePlanSha256).toBe(f.replacement.planSha256);
    const ownership = await captureAzureReplacementRouteServerOwnership(f.replacement, f.api);
    expect(ownership.ownerPlanSha256).toBe(f.source.planSha256);
    expect(Object.keys(ownership.peerIds)).toEqual(['1', '2']);
    expect(validAzureReplacementRouteServerOwnership(f.replacement, ownership)).toBe(true);
    expect(
      validAzureReplacementRouteServerOwnership(f.replacement, {
        ...ownership,
        peerIds: {
          '1': `${ownership.routeServerId}/bgpConnections/${f.source.deploymentName}-1`,
          '2': `${ownership.routeServerId}/bgpConnections/${f.source.deploymentName}-2`,
        },
      }),
    ).toBe(false);
    const configured = await ensureAzureRelayRoutingWorkflow(f.replacement, f.expected, f.runtime, f.storage, f.api);
    expect(configured.sourcePlanSha256).toBe(f.replacement.planSha256);
    expect(configured.ceSampleFreshnessQualified).toBe(false);
  }
});

for (const invalid of [
  'survivor-owner',
  'selected-owner',
  'nic-owner',
  'relay-owner',
  'hub-owner',
  'peer-identity',
  'duplicate-mac',
] as const)
  test(`relay replacement rejects changed ${invalid} without guest activation`, async () => {
    const f = replacementRelayWorkflowFixture('native');
    if (invalid === 'survivor-owner') {
      const id = mustReplacementFixture(
        mustReplacementFixture(f.source.actions.find((row) => row.kind === 'vm-create' && row.node === 1)).resourceId,
      );
      f.objects[id].tags = { ...f.objects[id].tags, 'xcsh-plan-sha256': f.replacement.planSha256 };
    } else if (invalid === 'selected-owner')
      relayFixtureField(f.objects[f.selectedVmResourceId], 'tags')['xcsh-plan-sha256'] = f.source.planSha256;
    else if (invalid === 'nic-owner') {
      const id = mustReplacementFixture(
        mustReplacementFixture(f.source.actions.find((row) => row.kind === 'nic-create' && row.node === 2)).resourceId,
      );
      f.objects[id].tags = { ...f.objects[id].tags, 'xcsh-plan-sha256': f.replacement.planSha256 };
    } else if (invalid === 'relay-owner')
      relayFixtureField(f.objects[f.plan.relays[0].vmId], 'tags')['xcsh-plan-sha256'] = f.replacement.planSha256;
    else if (invalid === 'hub-owner') f.server.tags['xcsh-plan-sha256'] = f.replacement.planSha256;
    else if (invalid === 'peer-identity') f.peers[0].name += '-foreign';
    else {
      const ids = f.source.actions
        .filter((row) => row.kind === 'nic-create')
        .map((row) => mustReplacementFixture(row.resourceId));
      f.objects[ids[1]].macAddress = f.objects[ids[0]].macAddress;
    }
    await expect(
      ensureAzureRelayRoutingWorkflow(f.replacement, f.expected, f.runtime, f.storage, f.api),
    ).rejects.toThrow();
    expect(f.mutations).toBe(0);
  });

test('relay replacement dispatch keeps creation evidence intact and resumes isolated guest submission journals', async () => {
  for (const engine of ['native', 'terraform'] as const) {
    const operational = await relayOperationalFixture(engine, true, true);
    const f = replaceRelayWorkflowFixture(operational.f);
    const original = new Map([...f.saved].map(([name, value]) => [name, canonicalSha256(value)]));
    const prefix = `${f.replacement.planId}-replacement-`;
    const api: AzExecApi = {
      exec: (command, args, options) => {
        const script = args.includes('--scripts') ? args[args.indexOf('--scripts') + 1] : '';
        return args.includes('run-command') && !script.includes('route_binding =')
          ? f.api.exec(command, args, options)
          : operational.api.exec(command, args, options);
      },
    };
    f.lose = true;
    await expect(
      configureAzureSelectedRelayRouting(f.replacement, f.expected, operational.runtime, f.storage, api),
    ).rejects.toThrow('interrupted');
    expect(f.saved.has(`${prefix}relay-routing-workflow.json`)).toBe(true);
    const submitted = f.mutations;
    const result = await configureAzureSelectedRelayRouting(
      f.replacement,
      f.expected,
      operational.runtime,
      f.storage,
      api,
    );
    expect(f.mutations).toBe(submitted + 1);
    expect(result.routing).toBe('unknown');
    expect(result.ceSampleFreshnessQualified).toBe(false);
    expect(result.observation.ceRouteScope).toBe('unqualified');
    for (const [name, hash] of original) expect(canonicalSha256(f.saved.get(name))).toBe(hash);
    for (const name of [
      'relay-routing-workflow.json',
      'platform-relay-routing.json',
      'relay-routing-configuration.json',
      'relay-routing-observation.json',
    ])
      expect(f.saved.has(`${prefix}${name}`)).toBe(true);
  }
});

test('native relay replacement freezes exact six retained NICs and rejects changed resume owners and checkpoint identities', async () => {
  const f = replacementRelayWorkflowFixture('native');
  relayFixtureField(f.objects[f.selectedVmResourceId], 'tags')['xcsh-plan-sha256'] = f.source.planSha256;
  f.objects[f.selectedVmResourceId].vmId = '00000000-0000-4000-8000-000000000002';
  const api: AzExecApi = {
    async exec(command, args, options) {
      if (args[0] === 'vm' && args[1] === 'list')
        return {
          exitCode: 0,
          stderr: '',
          stdout: JSON.stringify(
            Object.values(f.objects).filter((row) => row.id.includes('/virtualMachines/') && row.vmId),
          ),
        };
      return f.api.exec(command, args, options);
    },
  };
  const runtime = { ...f.runtime, ownedSiteConfiguration: () => ({ spec: 'unchanged-site' }) };
  const checkpoint: NativeWorkflowCheckpoint = {
    schemaVersion: 1,
    engine: 'native',
    planSha256: f.replacement.planSha256,
    siteReserved: true,
    bootstrapByNode: {},
    launchedAtByNode: {},
  };
  await prepareAzureNativeReplacement(f.replacement, checkpoint, api, runtime, f.storage);
  validateAzureNativeAdmissionCheckpoint(f.replacement, checkpoint);
  const retainedNics = mustReplacementFixture(checkpoint.replacement?.retainedNics);
  expect(Object.keys(retainedNics)).toHaveLength(6);
  expect(validAzureRelayRetainedNics(f.replacement, retainedNics)).toBe(true);
  expect(await captureAzureRelayRetainedNics(f.replacement, api)).toEqual(retainedNics);
  const forged = structuredClone(checkpoint);
  mustReplacementFixture(mustReplacementFixture(forged.replacement).retainedNics)['2:0'].ownerPlanSha256 =
    f.replacement.planSha256;
  expect(() => validateAzureNativeAdmissionCheckpoint(f.replacement, forged)).toThrow();
  f.server.tags['xcsh-plan-sha256'] = f.replacement.planSha256;
  await expect(prepareAzureNativeReplacement(f.replacement, checkpoint, api, runtime, f.storage)).rejects.toThrow();
});

test('relay replacement retained NIC capture rejects out-of-subnet, reserved, malformed and duplicate identities', async () => {
  for (const invalid of [
    'outside',
    'reserved',
    'malformed',
    'multicast-mac',
    'extra-config',
    'duplicate-mac',
  ] as const) {
    const f = replacementRelayWorkflowFixture('native');
    const action = mustReplacementFixture(f.source.actions.find((row) => row.kind === 'nic-create' && row.node === 1));
    const id = mustReplacementFixture(action.resourceId);
    const value = f.objects[id];
    if (invalid === 'outside') relayFixtureField(value, 'ipConfigurations')[0].privateIPAddress = '10.22.0.4';
    else if (invalid === 'reserved') relayFixtureField(value, 'ipConfigurations')[0].privateIPAddress = '10.20.0.3';
    else if (invalid === 'malformed') relayFixtureField(value, 'ipConfigurations')[0].privateIPAddress = '10.20.0.999';
    else if (invalid === 'multicast-mac') value.macAddress = '03:55:00:00:01:00';
    else if (invalid === 'extra-config')
      relayFixtureField(value, 'ipConfigurations').push(
        structuredClone(relayFixtureField(value, 'ipConfigurations')[0]),
      );
    else {
      const other = mustReplacementFixture(f.source.actions.find((row) => row.kind === 'nic-create' && row.node === 2));
      value.macAddress = f.objects[mustReplacementFixture(other.resourceId)].macAddress;
    }
    await expect(captureAzureRelayRetainedNics(f.replacement, f.api)).rejects.toThrow();
    expect(f.mutations).toBe(0);
  }
});

test('successive relay replacements retain distinct survivor VM generations and original NIC owners through native preparation and current joins', async () => {
  for (const engine of ['native', 'terraform'] as const) {
    const f = replacementRelayWorkflowFixture(engine);
    const prior = f.replacement;
    if (prior.relayProfile?.schemaVersion !== 2) throw Error('prior profile missing');
    const observed = structuredClone(prior.relayProfile.observation);
    mustReplacementFixture(observed.resources.find((row) => row.id === f.selectedVmResourceId)).tags[
      'xcsh-plan-sha256'
    ] = prior.planSha256;
    const foundation = compileAzureCePlan({ ...prior.intent, replacementNode: 1 }, observed);
    const next = compileAzureRelayReplacementPlan(foundation, prior, observed);
    const selectedId = mustReplacementFixture(
      mustReplacementFixture(next.actions.find((row) => row.kind === 'vm-create')).resourceId,
    );
    if (engine === 'native') {
      const api: AzExecApi = {
        async exec(command, args, options) {
          if (args[0] === 'vm' && args[1] === 'list')
            return {
              exitCode: 0,
              stderr: '',
              stdout: JSON.stringify(
                Object.values(f.objects).filter((row) => row.id.includes('/virtualMachines/') && row.vmId),
              ),
            };
          return f.api.exec(command, args, options);
        },
      };
      const checkpoint: NativeWorkflowCheckpoint = {
        schemaVersion: 1,
        engine: 'native',
        planSha256: next.planSha256,
        siteReserved: true,
        bootstrapByNode: {},
        launchedAtByNode: {},
      };
      await prepareAzureNativeReplacement(
        next,
        checkpoint,
        api,
        { ...f.runtime, ownedSiteConfiguration: () => ({ spec: 'same-site' }) },
        f.storage,
      );
      validateAzureNativeAdmissionCheckpoint(next, checkpoint);
      expect(checkpoint.replacement?.ownerPlanSha256ByNode[`${f.source.deploymentName}-1`]).toBe(f.source.planSha256);
      expect(checkpoint.replacement?.ownerPlanSha256ByNode[`${f.source.deploymentName}-2`]).toBe(prior.planSha256);
      expect(
        Object.values(mustReplacementFixture(checkpoint.replacement?.retainedNics)).every(
          (row) => row.ownerPlanSha256 === f.source.planSha256,
        ),
      ).toBe(true);
    }
    f.objects[selectedId].tags = { ...f.objects[selectedId].tags, 'xcsh-plan-sha256': next.planSha256 };
    f.objects[selectedId].vmId = '00000000-0000-4000-8000-000000000101';
    const context = await azureRelayCurrentIdentityContext(next, f.expected, f.runtime, f.storage, f.api);
    expect((await context.observe()).identity.stable.cloud).toHaveLength(6);
    expect(relayFixtureField(f.objects[f.selectedVmResourceId], 'tags')['xcsh-plan-sha256']).toBe(prior.planSha256);
    const nicId = mustReplacementFixture(
      mustReplacementFixture(f.source.actions.find((row) => row.kind === 'nic-create' && row.node === 2)).resourceId,
    );
    f.objects[nicId].tags = { ...f.objects[nicId].tags, 'xcsh-plan-sha256': prior.planSha256 };
    await expect(context.observe()).rejects.toThrow('owner differs');
  }
});

/** Simulated provider session; actual replacement runner, private store and relay drivers execute. */
async function terraformRelayReplacementRunnerFixture(lost: 'none' | 'quiesce' | 'launch' = 'none') {
  const operational = await relayOperationalFixture('terraform', true, true);
  const f = replaceRelayWorkflowFixture(operational.f);
  const plan = f.replacement;
  const providerLockSha256 = createHash('sha256')
    .update((await azureTerraformCurrentDeployment(f.source)).providerLock)
    .digest('hex');
  const selected = f.objects[f.selectedVmResourceId];
  const oldVmId = '00000000-0000-4000-8000-000000000002';
  const newVmId = '00000000-0000-4000-8000-000000000102';
  selected.vmId = oldVmId;
  relayFixtureField(selected, 'tags')['xcsh-plan-sha256'] = f.source.planSha256;
  const vmActions = f.source.actions.filter((action) => action.kind === 'vm-create');
  for (const action of vmActions) {
    const vm = f.objects[mustReplacementFixture(action.resourceId)];
    vm.hardwareProfile = { vmSize: plan.vm.size };
    vm.powerState = 'VM running';
  }
  const retained = f.source.ownershipInventory.filter((row) => row.owned && row.resourceId !== f.selectedVmResourceId);
  const retainedHashes = new Map(
    retained
      .filter((row) => f.objects[row.resourceId])
      .map((row) => [row.resourceId, canonicalSha256(f.objects[row.resourceId])]),
  );
  const originalPeers = canonicalSha256({ server: f.server, peers: f.peers });
  const originalJwt = 'e30.eyJleHAiOjQxMDI0NDQ4MDB9.b3JpZ2luYWw';
  const replacementJwt = 'e30.eyJleHAiOjQxMDI0NDQ4MDB9.cmVwbGFjZW1lbnQ';
  const bootstrap = `#cloud-config\nwrite_files:\n- path: /etc/vpm/user_data\n  content: |\n    token: ${originalJwt}\n`;
  const tokens = Array.from({ length: plan.topology.nodeCount }, (_, index) => ({
    node: `${plan.deploymentName}-${index + 1}`,
    name: `${plan.deploymentName.slice(0, 40)}-${index + 1}-${f.source.planSha256.slice(0, 12)}`,
  }));
  const replacementToken = {
    node: `${plan.deploymentName}-2`,
    name: `${plan.deploymentName.slice(0, 40)}-2-${plan.planSha256.slice(0, 12)}`,
  };
  const state = {
    configuration: renderAzureTerraformFoundation(f.source, { '1': bootstrap, '2': bootstrap, '3': bootstrap }),
    applies: [] as string[],
    reconciles: [] as string[],
    failed: false,
    revisions: 0,
  };
  const sha = (value: string) => createHash('sha256').update(value).digest('hex');
  let planned: PlanReceipt | undefined;
  const session: TerraformSession = {
    async readConfigurationSha256() {
      return sha(state.configuration);
    },
    async readConfiguration(expected) {
      expect(expected).toBe(sha(state.configuration));
      return state.configuration;
    },
    async reviseConfiguration(expected, next) {
      expect(expected).toBe(sha(state.configuration));
      const before = JSON.parse(state.configuration);
      const after = JSON.parse(next);
      // The only allowed desired-state delta is selected VM and its instance output.
      for (const value of [before, after]) {
        delete value.resource.azurerm_linux_virtual_machine.node_2;
        delete value.output.ce_instances.value['2'];
      }
      expect(after).toEqual(before);
      state.revisions++;
      state.configuration = next;
      return sha(next);
    },
    async plan() {
      const wantsVm = Boolean(JSON.parse(state.configuration).resource.azurerm_linux_virtual_machine.node_2);
      const actions = wantsVm === Boolean(f.objects[f.selectedVmResourceId]) ? [] : [wantsVm ? 'create' : 'delete'];
      planned = {
        schemaVersion: 1,
        deploymentId: plan.deploymentName,
        engine: 'terraform',
        backendIdentity: `local:${plan.deploymentName}`,
        configurationSha256: sha(state.configuration),
        providerLockSha256,
        planSha256: sha(`${state.configuration}:${actions.join(',')}`),
        changes: actions.length
          ? [{ address: 'azurerm_linux_virtual_machine.node_2', type: 'azurerm_linux_virtual_machine', actions }]
          : [],
        noChanges: actions.length === 0,
      };
      return planned;
    },
    async readPlannedResourceIds(value, addresses) {
      expect(planned?.planSha256).toBe(value.planSha256);
      expect(addresses).toEqual(['azurerm_linux_virtual_machine.node_2']);
      return Object.fromEntries(addresses.map((address) => [address, f.objects[f.selectedVmResourceId]?.id ?? null]));
    },
    async apply(value) {
      expect(planned?.planSha256).toBe(value.planSha256);
      const desired = JSON.parse(state.configuration).resource.azurerm_linux_virtual_machine.node_2;
      const phase = desired ? 'launch' : 'quiesce';
      state.applies.push(phase);
      const selectedNics = f.source.actions.filter((action) => action.kind === 'nic-create' && action.node === 2);
      if (desired) {
        f.objects[f.selectedVmResourceId] = { ...structuredClone(selected), vmId: newVmId, tags: desired.tags };
        for (const action of selectedNics)
          f.objects[mustReplacementFixture(action.resourceId)].virtualMachine = { id: f.selectedVmResourceId };
      } else {
        delete f.objects[f.selectedVmResourceId];
        for (const action of selectedNics) delete f.objects[mustReplacementFixture(action.resourceId)].virtualMachine;
      }
      if (!state.failed && lost === phase) {
        state.failed = true;
        throw Error(`lost ${phase} response`);
      }
    },
    async reconcileApplyFromEvidence(value, evidence) {
      expect(planned?.planSha256).toBe(value.planSha256);
      expect(evidence).toMatch(/^[a-f0-9]{64}$/);
      state.reconciles.push(value.changes[0]?.actions.join(',') ?? 'no-op');
    },
    async readOutputs() {
      return {
        ce_instances: Object.fromEntries(
          vmActions
            .filter((action) => f.objects[mustReplacementFixture(action.resourceId)])
            .map((action) => {
              const vm = f.objects[mustReplacementFixture(action.resourceId)];
              return [String(action.node), { id: vm.id, vm_id: vm.vmId, site_name: plan.siteName, hostname: vm.name }];
            }),
        ),
        ce_interfaces: Object.fromEntries(
          f.source.actions
            .filter((action) => action.kind === 'nic-create')
            .map((action) => {
              const nic = f.objects[mustReplacementFixture(action.resourceId)];
              const index = Number(action.resourceId?.match(/-nic(\d+)$/)?.[1]);
              return [
                `${action.node}:${index}`,
                {
                  id: nic.id,
                  subnet_id: relayFixtureField(nic, 'ipConfigurations')[0].subnet.id,
                  site_name: plan.siteName,
                  node: action.node,
                  index,
                  role: plan.nics.find((row) => row.index === index)?.role,
                },
              ];
            }),
        ),
      };
    },
    readPlannedResourceFields: async () => ({}),
    readProposedResourceFields: async () => {
      throw Error('unexpected proposed-field read in ordinary replacement fixture');
    },
    readAppliedResourceFields: async () => {
      throw Error('unexpected applied-field read in ordinary replacement fixture');
    },
    readPlanApplicationState: async () => {
      throw Error('unexpected application-state read in ordinary replacement fixture');
    },
    planDestroy: async () => {
      throw Error('unexpected destroy');
    },
    planAction: async () => {
      throw Error('unexpected action');
    },
  };
  const terraform: CeTerraformService = {
    async open(owner, deployment, resume) {
      expect(owner).toEqual(azureUpgradeBinding(plan).owner);
      expect(deployment.backendIdentity).toBe(`local:${plan.deploymentName}`);
      expect(resume).toBe('current');
      return session;
    },
  };
  const runtime = {
    ...operational.runtime,
    requireBootstrapContract() {},
    requireRoutingContract() {
      throw Error('direct routing contract must not be selected');
    },
    async bootstrap(
      _binding: unknown,
      node: string,
      tokenName: string,
      persist: (secret: { tokenName: string; siteName: string; node: string; jwt: string }) => Promise<void>,
    ) {
      expect(node).toBe(`${plan.deploymentName}-2`);
      expect(tokenName).toBe(replacementToken.name);
      await persist({ tokenName, siteName: plan.siteName, node, jwt: replacementJwt });
      return bootstrap.replace(originalJwt, replacementJwt);
    },
    ownedSiteConfiguration() {
      return { siteName: plan.siteName };
    },
    async approveRegistrations(
      _binding: unknown,
      instances: Record<string, string>,
      persist: (record: Record<string, unknown>) => Promise<void>,
    ) {
      expect(Object.keys(instances)).toHaveLength(3);
      expect(instances[`${plan.deploymentName}-2`]).toBe(newVmId);
      await persist({
        action: 'approve-registration',
        instanceId: newVmId,
        node: `${plan.deploymentName}-2`,
        registration: 'synthetic-replacement-registration',
        siteName: plan.siteName,
        state: 'submitted',
      });
      return { status: 'healthy' as const };
    },
    async observeHealth() {
      return { status: 'healthy' as const };
    },
    async observeRegistrations() {
      return { status: 'healthy' as const };
    },
    async observeRegisteredConfiguration(_binding: unknown, _instances: unknown, interfaces: unknown[]) {
      expect(interfaces).toHaveLength(6);
      return { status: 'configured' as const };
    },
  } as unknown as CeRuntime;
  const api: AzExecApi = {
    async exec(command, args, options) {
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
        return { exitCode: 0, stderr: '', stdout: JSON.stringify(Object.values(f.objects).filter((row) => row.vmId)) };
      const script = args.includes('--scripts') ? args[args.indexOf('--scripts') + 1] : '';
      return args.includes('run-command') && !script.includes('route_binding =')
        ? f.api.exec(command, args, options)
        : operational.api.exec(command, args, options);
    },
  };
  const directory = await mkdtemp(join(tmpdir(), 'azure-relay-replacement-runner-'));
  const storage = await CeDeploymentStore.open(directory, azureUpgradeBinding(plan).owner);
  for (const [name, value] of f.saved) await storage.write(name, value);
  for (const token of tokens)
    await storage.write(`${token.name}.json`, {
      tokenName: token.name,
      node: token.node,
      siteName: plan.siteName,
      jwt: originalJwt,
    });
  return {
    f,
    plan,
    runtime,
    api,
    storage,
    terraform,
    state,
    oldVmId,
    newVmId,
    tokens: [...tokens, replacementToken],
    providerLockSha256,
    async dispose() {
      await rm(directory, { recursive: true, force: true });
    },
    async verifyRetained() {
      for (const [id, expected] of retainedHashes) expect(canonicalSha256(f.objects[id])).toBe(expected);
      expect(canonicalSha256({ server: f.server, peers: f.peers })).toBe(originalPeers);
      for (const [name, value] of f.saved) expect(await storage.read(name)).toEqual(value);
    },
  };
}

for (const lost of ['none', 'quiesce', 'launch'] as const)
  test(`Terraform relay HA replacement runner retains six NICs and resumes at unknown acceptance (${lost})`, async () => {
    const f = await terraformRelayReplacementRunnerFixture(lost);
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        await expect(
          runAzureTerraformReplacement(f.plan, f.terraform, f.runtime, f.storage, f.api, {}),
        ).rejects.toThrow('routing has not converged');
        expect(f.state.applies).toEqual(['quiesce', 'launch']);
        await f.verifyRetained();
        expect(await f.storage.read(`${f.plan.planId}-terraform-replacement.json`)).toMatchObject({
          phase: 'launched',
          newVmId: f.newVmId,
          oldVmIds: { [`${f.plan.deploymentName}-2`]: f.oldVmId },
        });
        const evidence = await f.storage.read(`${f.plan.planId}-replacement-relay-routing-observation.json`);
        expect(evidence).toMatchObject({
          routing: 'unknown',
          ceRouteScope: 'unqualified',
          ceSampleFreshnessQualified: false,
        });
        await expect(f.storage.read(`${f.plan.planId}-terraform-replacement-final-plan.json`)).rejects.toMatchObject({
          code: 'ENOENT',
        });
      }
      expect(f.state.reconciles).toHaveLength(lost === 'none' ? 0 : 1);
      expect(f.state.revisions).toBe(2);
    } finally {
      await f.dispose();
    }
  });

for (const phase of ['quiesced', 'launched'] as const)
  test(`Terraform relay HA replacement runner resumes after lost ${phase} checkpoint without duplicate mutation`, async () => {
    const f = await terraformRelayReplacementRunnerFixture();
    try {
      const write = f.storage.write.bind(f.storage);
      let failed = false;
      f.storage.write = async (name, value) => {
        if (
          !failed &&
          name === `${f.plan.planId}-terraform-replacement.json` &&
          (value as Record<string, unknown>).phase === phase
        ) {
          failed = true;
          throw Error(`lost ${phase} checkpoint`);
        }
        return write(name, value);
      };
      await expect(runAzureTerraformReplacement(f.plan, f.terraform, f.runtime, f.storage, f.api, {})).rejects.toThrow(
        `lost ${phase} checkpoint`,
      );
      f.storage.write = write;
      await expect(runAzureTerraformReplacement(f.plan, f.terraform, f.runtime, f.storage, f.api, {})).rejects.toThrow(
        'routing has not converged',
      );
      expect(f.state.applies).toEqual(['quiesce', 'launch']);
      expect(f.state.reconciles.length).toBeGreaterThan(0);
      await f.verifyRetained();
    } finally {
      await f.dispose();
    }
  });

for (const kind of ['engine', 'plan', 'source', 'owner'] as const)
  test(`Terraform relay HA replacement runner rejects ${kind} before a VM mutation`, async () => {
    const f = await terraformRelayReplacementRunnerFixture();
    try {
      if (kind === 'engine') Object.defineProperty(f.runtime, 'engine', { value: 'native' });
      if (kind === 'plan') f.plan.planSha256 = 'f'.repeat(64);
      if (kind === 'source') {
        const source = JSON.parse(f.state.configuration);
        source.resource.azurerm_linux_virtual_machine.node_2.tags['xcsh-plan-sha256'] = 'f'.repeat(64);
        f.state.configuration = JSON.stringify(source);
      }
      if (kind === 'owner')
        relayFixtureField(f.f.objects[f.f.selectedVmResourceId], 'tags')['xcsh-plan-sha256'] = 'f'.repeat(64);
      await expect(
        runAzureTerraformReplacement(f.plan, f.terraform, f.runtime, f.storage, f.api, {}),
      ).rejects.toThrow();
      expect(f.state.applies).toEqual([]);
      expect(f.state.revisions).toBe(0);
    } finally {
      await f.dispose();
    }
  });

test('Terraform replacement persists its exact public generation before any bootstrap or mutation', async () => {
  const f = await terraformRelayReplacementRunnerFixture();
  try {
    const bootstrap = f.runtime.bootstrap.bind(f.runtime);
    let calls = 0;
    f.runtime.bootstrap = async (...args) => {
      expect(await f.storage.read(azureTerraformReplacementPlanName(f.plan))).toEqual(f.plan);
      calls++;
      return bootstrap(...args);
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(runAzureTerraformReplacement(f.plan, f.terraform, f.runtime, f.storage, f.api, {})).rejects.toThrow(
        'routing has not converged',
      );
      expect(await f.storage.read(azureTerraformReplacementPlanName(f.plan))).toEqual(f.plan);
    }
    expect(calls).toBe(1);
    expect(f.state.applies).toEqual(['quiesce', 'launch']);
  } finally {
    await f.dispose();
  }
});

for (const kind of ['foreign', 'malformed', 'lost-write'] as const)
  test(`Terraform replacement saved public generation rejects ${kind} before bootstrap or mutation`, async () => {
    const f = await terraformRelayReplacementRunnerFixture();
    try {
      let calls = 0;
      f.runtime.bootstrap = async () => {
        calls++;
        throw Error('unexpected bootstrap');
      };
      const name = azureTerraformReplacementPlanName(f.plan);
      if (kind === 'foreign') await f.storage.write(name, f.f.source);
      if (kind === 'malformed') await f.storage.write(name, { planSha256: f.plan.planSha256 });
      const write = f.storage.write.bind(f.storage);
      if (kind === 'lost-write')
        f.storage.write = async (path, value) => {
          if (path === name) throw Error('lost saved generation write');
          return write(path, value);
        };
      await expect(
        runAzureTerraformReplacement(f.plan, f.terraform, f.runtime, f.storage, f.api, {}),
      ).rejects.toThrow();
      expect(calls).toBe(0);
      expect(f.state.applies).toEqual([]);
      expect(f.state.revisions).toBe(0);
    } finally {
      await f.dispose();
    }
  });

for (const kind of [
  'duplicate-vm',
  'duplicate-mac',
  'foreign-subnet',
  'reserved-ip',
  'extra-field',
  'survivor-uuid',
] as const)
  test(`Terraform replacement checkpoint replay rejects ${kind} without another mutation`, async () => {
    const f = await terraformRelayReplacementRunnerFixture();
    try {
      await expect(runAzureTerraformReplacement(f.plan, f.terraform, f.runtime, f.storage, f.api, {})).rejects.toThrow(
        'routing has not converged',
      );
      const name = `${f.plan.planId}-terraform-replacement.json`;
      const checkpoint = (await f.storage.read(name)) as ReturnType<typeof validateAzureTerraformReplacementCheckpoint>;
      const nodes = Object.keys(checkpoint.oldVmIds).sort();
      const keys = Object.keys(checkpoint.retainedNics).sort();
      if (kind === 'duplicate-vm') checkpoint.oldVmIds[nodes[1]] = checkpoint.oldVmIds[nodes[0]];
      if (kind === 'duplicate-mac') checkpoint.retainedNics[keys[1]].mac = checkpoint.retainedNics[keys[0]].mac;
      if (kind === 'foreign-subnet') checkpoint.retainedNics[keys[0]].subnetId += '-foreign';
      if (kind === 'reserved-ip') checkpoint.retainedNics[keys[0]].privateIp = '10.20.0.1';
      if (kind === 'extra-field') Object.assign(checkpoint, { untrustedIdentity: 'foreign' });
      if (kind === 'survivor-uuid') checkpoint.newVmId = checkpoint.oldVmIds[nodes[0]];
      expect(() => validateAzureTerraformReplacementCheckpoint(f.plan, checkpoint)).toThrow('checkpoint differs');
      await f.storage.write(name, checkpoint);
      await expect(runAzureTerraformReplacement(f.plan, f.terraform, f.runtime, f.storage, f.api, {})).rejects.toThrow(
        'checkpoint differs',
      );
      expect(f.state.applies).toEqual(['quiesce', 'launch']);
      expect(f.state.revisions).toBe(2);
    } finally {
      await f.dispose();
    }
  });

test('Terraform relay replacement rejects ambiguous retained IP configurations before bootstrap', async () => {
  const f = await terraformRelayReplacementRunnerFixture();
  try {
    const nic = mustReplacementFixture(f.f.source.actions.find((row) => row.kind === 'nic-create'));
    const value = f.f.objects[mustReplacementFixture(nic.resourceId)];
    relayFixtureField(value, 'ipConfigurations')[0].primary = true;
    relayFixtureField(value, 'ipConfigurations').push({
      ...structuredClone(relayFixtureField(value, 'ipConfigurations')[0]),
      primary: false,
    });
    let calls = 0;
    f.runtime.bootstrap = async () => {
      calls++;
      throw Error('unexpected bootstrap');
    };
    await expect(runAzureTerraformReplacement(f.plan, f.terraform, f.runtime, f.storage, f.api, {})).rejects.toThrow(
      'retained NIC identity',
    );
    expect(calls).toBe(0);
    expect(f.state.applies).toEqual([]);
    expect(f.state.revisions).toBe(0);
  } finally {
    await f.dispose();
  }
});

test('Terraform replacement resumes a lost initial checkpoint from exact durable bootstrap without reissuing it', async () => {
  const f = await terraformRelayReplacementRunnerFixture();
  try {
    const bootstrap = f.runtime.bootstrap.bind(f.runtime);
    let calls = 0;
    f.runtime.bootstrap = async (...args) => {
      calls++;
      return bootstrap(...args);
    };
    const write = f.storage.write.bind(f.storage);
    let lost = false;
    f.storage.write = async (name, value) => {
      if (!lost && name === `${f.plan.planId}-terraform-replacement.json`) {
        lost = true;
        throw Error('lost initial checkpoint');
      }
      return write(name, value);
    };
    await expect(runAzureTerraformReplacement(f.plan, f.terraform, f.runtime, f.storage, f.api, {})).rejects.toThrow(
      'lost initial checkpoint',
    );
    expect(calls).toBe(1);
    expect(f.state.applies).toEqual([]);
    f.storage.write = write;
    // A malformed persisted checkpoint is different from a lost checkpoint write.
    await write(`${f.plan.planId}-terraform-replacement.json`, null);
    await expect(runAzureTerraformReplacement(f.plan, f.terraform, f.runtime, f.storage, f.api, {})).rejects.toThrow(
      'Malformed Azure Terraform replacement data',
    );
    expect(calls).toBe(1);
    expect(f.state.applies).toEqual([]);
    await rm(join(f.storage.directory, `${f.plan.planId}-terraform-replacement.json`));
    await expect(runAzureTerraformReplacement(f.plan, f.terraform, f.runtime, f.storage, f.api, {})).rejects.toThrow(
      'routing has not converged',
    );
    expect(calls).toBe(1);
    expect(f.state.applies).toEqual(['quiesce', 'launch']);
  } finally {
    await f.dispose();
  }
});

for (const kind of ['missing', 'bootstrap', 'prepared-owner', 'prepared-phase', 'extra-field'] as const)
  test(`Terraform replacement source replay rejects ${kind} without bootstrap reissue or mutation`, async () => {
    const f = await terraformRelayReplacementRunnerFixture();
    try {
      await expect(runAzureTerraformReplacement(f.plan, f.terraform, f.runtime, f.storage, f.api, {})).rejects.toThrow(
        'routing has not converged',
      );
      const sourceName = `${f.plan.planId}-terraform-replacement-source.json`;
      const value = (await f.storage.read(sourceName)) as {
        bootstrap: string;
        preparedCheckpoint: ReturnType<typeof validateAzureTerraformReplacementCheckpoint>;
      };
      const checkpoint = validateAzureTerraformReplacementCheckpoint(
        f.plan,
        await f.storage.read(`${f.plan.planId}-terraform-replacement.json`),
      );
      expect(validateAzureTerraformReplacementSource(f.plan, checkpoint, value).bootstrap).toBe(value.bootstrap);
      if (kind === 'missing') await rm(join(f.storage.directory, sourceName));
      else {
        if (kind === 'bootstrap') value.bootstrap += '\n# changed';
        if (kind === 'prepared-owner') {
          value.preparedCheckpoint.oldVmIds[`${f.plan.deploymentName}-1`] = '00000000-0000-4000-8000-000000000999';
        }
        if (kind === 'prepared-phase') value.preparedCheckpoint.phase = 'quiesced';
        if (kind === 'extra-field') Object.assign(value, { untrusted: true });
        await f.storage.write(sourceName, value);
      }
      f.runtime.bootstrap = async () => {
        throw Error('unexpected bootstrap reissue');
      };
      await expect(runAzureTerraformReplacement(f.plan, f.terraform, f.runtime, f.storage, f.api, {})).rejects.toThrow(
        kind === 'missing'
          ? 'snapshot is unavailable'
          : kind.startsWith('prepared')
            ? 'prepared source identity differs'
            : 'source snapshot differs',
      );
      expect(f.state.applies).toEqual(['quiesce', 'launch']);
      expect(f.state.revisions).toBe(2);
    } finally {
      await f.dispose();
    }
  });

for (const kind of ['survivor', 'nic', 'output', 'provider'] as const)
  test(`Terraform replacement rejects foreign retained configuration ${kind} before bootstrap`, async () => {
    const f = await terraformRelayReplacementRunnerFixture();
    try {
      const source = JSON.parse(f.state.configuration);
      if (kind === 'survivor') source.resource.azurerm_linux_virtual_machine.node_1.size = 'Standard_D4s_v5';
      if (kind === 'nic')
        source.resource.azurerm_network_interface.node_1_nic_0.tags['xcsh-plan-sha256'] = 'f'.repeat(64);
      if (kind === 'output') source.output.ce_instances.value['1'].vm_id = 'foreign';
      if (kind === 'provider') source.provider.azurerm.subscription_id = 'example-foreign';
      f.state.configuration = JSON.stringify(source);
      let calls = 0;
      f.runtime.bootstrap = async () => {
        calls++;
        throw Error('unexpected bootstrap');
      };
      await expect(runAzureTerraformReplacement(f.plan, f.terraform, f.runtime, f.storage, f.api, {})).rejects.toThrow(
        'retained configuration provenance differs',
      );
      expect(calls).toBe(0);
      expect(f.state.applies).toEqual([]);
      expect(f.state.revisions).toBe(0);
    } finally {
      await f.dispose();
    }
  });

for (const kind of [
  'missing-quiesce',
  'missing-launch',
  'foreign-stage',
  'foreign-id',
  'import',
  'relinquish',
  'forged-complete',
  'malformed-import',
  'malformed-relinquish',
  'malformed-nochanges',
] as const)
  test(`Terraform replacement resume rejects saved stage history ${kind} before further provider execution`, async () => {
    const f = await terraformRelayReplacementRunnerFixture();
    try {
      await expect(runAzureTerraformReplacement(f.plan, f.terraform, f.runtime, f.storage, f.api, {})).rejects.toThrow(
        'routing has not converged',
      );
      const quiesceName = `${f.plan.planId}-terraform-quiesce-plan.json`;
      const launchName = `${f.plan.planId}-terraform-launch-plan.json`;
      const checkpointName = `${f.plan.planId}-terraform-replacement.json`;
      const checkpoint = validateAzureTerraformReplacementCheckpoint(f.plan, await f.storage.read(checkpointName));
      const snapshot = await f.storage.read(`${f.plan.planId}-terraform-replacement-source.json`);
      const record = (await f.storage.read(launchName)) as {
        receipt: PlanReceipt;
        identities: Record<string, string | null>;
      };
      const records = new Map([
        [quiesceName, await f.storage.read(quiesceName)],
        [launchName, record],
      ]);
      expect(() =>
        validateAzureTerraformReplacementStageHistory(f.plan, checkpoint, snapshot, records, f.providerLockSha256),
      ).not.toThrow();
      if (kind === 'missing-quiesce') await rm(join(f.storage.directory, quiesceName));
      else if (kind === 'missing-launch') await rm(join(f.storage.directory, launchName));
      else if (kind === 'forged-complete') await f.storage.write(checkpointName, { ...checkpoint, phase: 'complete' });
      else {
        if (kind === 'foreign-stage') record.receipt.configurationSha256 = 'f'.repeat(64);
        if (kind === 'foreign-id') record.identities['azurerm_linux_virtual_machine.node_2'] = 'foreign';
        if (kind === 'import') Object.assign(record.receipt, { imports: [{ address: 'foreign', id: 'foreign' }] });
        if (kind === 'malformed-import') Object.assign(record.receipt, { imports: {} });
        if (kind === 'malformed-relinquish') Object.assign(record.receipt, { relinquishments: {} });
        if (kind === 'malformed-nochanges') Object.assign(record.receipt, { noChanges: 'false' });
        if (kind === 'relinquish') Object.assign(record.receipt, { relinquishments: [{ address: 'foreign' }] });
        await f.storage.write(launchName, record);
      }
      let opens = 0;
      const open = f.terraform.open.bind(f.terraform);
      f.terraform.open = async (...args) => {
        opens++;
        return open(...args);
      };
      await expect(runAzureTerraformReplacement(f.plan, f.terraform, f.runtime, f.storage, f.api, {})).rejects.toThrow(
        kind.startsWith('missing')
          ? 'saved stage history is unavailable'
          : kind === 'forged-complete'
            ? 'final no-change history is unavailable'
            : kind === 'foreign-id'
              ? 'saved stage VM identity differs'
              : 'saved plan differs',
      );
      expect(opens).toBe(1);
      expect(f.state.applies).toEqual(['quiesce', 'launch']);
      expect(f.state.revisions).toBe(2);
    } finally {
      await f.dispose();
    }
  });

test('Terraform replacement resume rejects extra retained IP configuration before registration', async () => {
  const f = await terraformRelayReplacementRunnerFixture();
  try {
    await expect(runAzureTerraformReplacement(f.plan, f.terraform, f.runtime, f.storage, f.api, {})).rejects.toThrow(
      'routing has not converged',
    );
    const nic = mustReplacementFixture(f.f.source.actions.find((row) => row.kind === 'nic-create'));
    const value = f.f.objects[mustReplacementFixture(nic.resourceId)];
    relayFixtureField(value, 'ipConfigurations')[0].primary = true;
    relayFixtureField(value, 'ipConfigurations').push({
      ...structuredClone(relayFixtureField(value, 'ipConfigurations')[0]),
      primary: false,
    });
    let registrations = 0;
    f.runtime.approveRegistrations = async () => {
      registrations++;
      throw Error('unexpected registration');
    };
    await expect(runAzureTerraformReplacement(f.plan, f.terraform, f.runtime, f.storage, f.api, {})).rejects.toThrow(
      'retained NIC identity',
    );
    expect(registrations).toBe(0);
    expect(f.state.applies).toEqual(['quiesce', 'launch']);
    expect(f.state.revisions).toBe(2);
  } finally {
    await f.dispose();
  }
});

async function nativeRelayReplacementRunnerFixture(
  mode: 'none' | 'delete-response' | 'create-response' | 'launch-checkpoint' | 'post-readback',
) {
  const operational = await relayOperationalFixture('native', true, true);
  const f = replaceRelayWorkflowFixture(operational.f);
  const plan = f.replacement;
  const oldVmId = '00000000-0000-4000-8000-000000000002';
  const newVmId = '00000000-0000-4000-8000-000000000102';
  const selected = f.objects[f.selectedVmResourceId];
  selected.vmId = oldVmId;
  relayFixtureField(selected, 'tags')['xcsh-plan-sha256'] = f.source.planSha256;
  selected.hardwareProfile = { vmSize: plan.vm.size };
  selected.storageProfile = {
    imageReference: {
      publisher: plan.image.publisher,
      offer: plan.image.offer,
      sku: plan.image.plan,
      version: plan.image.version,
    },
  };
  selected.plan = { publisher: plan.image.publisher, product: plan.image.offer, name: plan.image.plan };
  selected.powerState = 'VM running';
  const selectedNics = f.source.actions.filter((action) => action.kind === 'nic-create' && action.node === 2);
  const retainedHashes = new Map(
    f.source.ownershipInventory
      .filter((row) => row.owned && row.resourceId !== f.selectedVmResourceId && f.objects[row.resourceId])
      .map((row) => [row.resourceId, canonicalSha256(f.objects[row.resourceId])]),
  );
  const peerHash = canonicalSha256({ server: f.server, peers: f.peers });
  const root = await mkdtemp(join(tmpdir(), 'azure-native-relay-replacement-runner-'));
  const storage = await CeDeploymentStore.open(join(root, 'private'), azureUpgradeBinding(plan).owner);
  for (const [name, value] of f.saved) await storage.write(name, value);
  const state = { mutations: [] as string[], failed: false, bootstrap: 0 };
  const observe = async () => {
    if (!state.failed && mode === 'post-readback' && state.mutations.length === 1) {
      state.failed = true;
      throw Error('lost replacement post-readback');
    }
    const result = structuredClone(observation);
    result.regions[0].quotaAvailable = 64;
    result.resources = f.source.ownershipInventory
      .filter((row) => row.owned && (row.resourceId !== f.selectedVmResourceId || f.objects[row.resourceId]))
      .map((row) => ({
        id: row.resourceId,
        location: f.source.region,
        exists: true,
        owned: true,
        state: {},
        tags: {
          'xcsh-managed-by': 'azure-ce',
          'xcsh-execution-engine': 'native',
          'xcsh-deployment-id': f.source.deploymentName,
          'xcsh-plan-sha256':
            row.resourceId === f.selectedVmResourceId
              ? relayFixtureField(f.objects[row.resourceId], 'tags')['xcsh-plan-sha256']
              : f.source.planSha256,
        },
      }));
    return result;
  };
  const artifacts = new Map<string, string>();
  let sequence = 0;
  const session = {
    getSessionId: () => root,
    getArtifactsDir: () => root,
    async saveArtifact(content: string, type: string) {
      const id = String(++sequence).padStart(6, '0');
      const path = join(root, `${id}.${type}.log`);
      await Bun.write(path, content);
      artifacts.set(id, path);
      return id;
    },
    async getArtifactPath(id: string) {
      return artifacts.get(id) ?? null;
    },
  };
  await savePlanArtifact(session, plan, await observe());
  await saveCheckpoint(session, plan, {
    schemaVersion: AZURE_CE_CHECKPOINT_SCHEMA_VERSION,
    engine: 'native',
    planId: plan.planId,
    planSha256: plan.planSha256,
    completedActionIds: [],
    state: 'running',
    authorization: { apply: true, terms: true, destroy: false },
    observationFingerprint: fingerprintCheckpointObservation(await observe()),
    observationSnapshot: await observe(),
  });
  const write = storage.write.bind(storage);
  storage.write = async (name, value) => {
    if (
      !state.failed &&
      mode === 'launch-checkpoint' &&
      name === `native-admission-${plan.planSha256}.json` &&
      Object.keys((value as NativeWorkflowCheckpoint).launchedAtByNode).length
    ) {
      state.failed = true;
      throw Error('lost native launch checkpoint');
    }
    return write(name, value);
  };
  const runtime = {
    ...operational.runtime,
    requireBootstrapContract() {},
    requireRoutingContract() {
      throw Error('unexpected direct routing');
    },
    ownedSiteConfiguration() {
      return { siteName: plan.siteName };
    },
    async bootstrap(
      _binding: unknown,
      node: string,
      tokenName: string,
      persist: (secret: { tokenName: string; siteName: string; node: string; jwt: string }) => Promise<void>,
    ) {
      expect(node).toBe(`${plan.deploymentName}-2`);
      state.bootstrap++;
      const jwt = 'e30.eyJleHAiOjQxMDI0NDQ4MDB9.cmVwbGFjZW1lbnQ';
      await persist({ tokenName, siteName: plan.siteName, node, jwt });
      return `#cloud-config\nwrite_files:\n- path: /etc/vpm/user_data\n  content: |\n    token: ${jwt}\n`;
    },
    async approveRegistrations(_binding: unknown, instances: Record<string, string>) {
      expect(Object.keys(instances)).toHaveLength(3);
      expect(instances[`${plan.deploymentName}-2`]).toBe(newVmId);
      return { status: 'healthy' as const };
    },
    async observeHealth() {
      return { status: 'healthy' as const };
    },
    async observeRegistrations() {
      return { status: 'healthy' as const };
    },
    async observeRegisteredConfiguration(_binding: unknown, _instances: unknown, interfaces: unknown[]) {
      expect(interfaces).toEqual(f.expected);
      return { status: 'configured' as const, siteUid: 'owned-site-uid', interfaces: f.observed };
    },
  } as unknown as CeRuntime;
  const platform = {
    async runtime() {
      return runtime;
    },
    async storage() {
      return storage;
    },
  } as unknown as CePlatformService;
  const api: AzExecApi = {
    async exec(command, args, options) {
      const ok = (value: unknown) => ({ exitCode: 0, stderr: '', stdout: JSON.stringify(value) });
      const absent = () => ({
        exitCode: 1,
        stderr: 'ERROR: (ResourceNotFound) fixture resource was not found',
        stdout: '',
      });
      if (args[0] === 'account')
        return ok({
          id: plan.subscription.id,
          tenantId: plan.subscription.tenantId,
          environmentName: plan.subscription.cloud,
          state: 'Enabled',
        });
      if (args[0] === 'vm' && args[1] === 'list') return ok(Object.values(f.objects).filter((row) => row.vmId));
      if ((args[0] === 'resource' && args[1] === 'show') || (args[0] === 'vm' && args[1] === 'show')) {
        const id = args[args.indexOf('--ids') + 1];
        return f.objects[id] ? ok(f.objects[id]) : absent();
      }
      if (args[0] === 'network' && args[1] === 'nic' && args[2] === 'show' && args.includes('--name')) {
        const name = args[args.indexOf('--name') + 1];
        const nic = Object.values(f.objects).find((row) => row.id.endsWith(`/networkInterfaces/${name}`));
        return nic ? ok(nic) : absent();
      }
      if (args[0] === 'vm' && ['delete', 'create'].includes(args[1])) {
        expect(args[args.indexOf('--name') + 1]).toBe(`${plan.deploymentName}-2`);
        state.mutations.push(args[1]);
        if (args[1] === 'delete') {
          delete f.objects[f.selectedVmResourceId];
          for (const action of selectedNics) delete f.objects[mustReplacementFixture(action.resourceId)].virtualMachine;
        } else {
          const file = args[args.indexOf('--custom-data') + 1];
          expect(await Bun.file(file).text()).toContain('/etc/vpm/user_data');
          f.objects[f.selectedVmResourceId] = {
            ...structuredClone(selected),
            vmId: newVmId,
            tags: { ...selected.tags, 'xcsh-plan-sha256': plan.planSha256 },
          };
          for (const action of selectedNics)
            f.objects[mustReplacementFixture(action.resourceId)].virtualMachine = { id: f.selectedVmResourceId };
        }
        if (!state.failed && mode === `${args[1]}-response`) {
          state.failed = true;
          throw Error(`lost native ${args[1]} response`);
        }
        return ok({ status: 'request-accepted' });
      }
      const script = args.includes('--scripts') ? args[args.indexOf('--scripts') + 1] : '';
      return args.includes('run-command') && !script.includes('route_binding =')
        ? f.api.exec(command, args, options)
        : operational.api.exec(command, args, options);
    },
  };
  const context = {
    cwd: root,
    sessionManager: session,
    hasUI: false,
    ui: {
      async confirm() {
        throw Error('unexpected UI');
      },
    },
  };
  return {
    f,
    plan,
    storage,
    state,
    session,
    run: (candidate = plan) =>
      executeAzureCeNativeApply(
        { planId: candidate.planId, planSha256: candidate.planSha256 },
        context,
        api,
        async () => platform,
        AbortSignal.timeout(15000),
        { observe },
      ),
    async dispose() {
      await rm(root, { recursive: true, force: true });
    },
    async verifyRetained() {
      for (const [id, expected] of retainedHashes) expect(canonicalSha256(f.objects[id])).toBe(expected);
      expect(canonicalSha256({ server: f.server, peers: f.peers })).toBe(peerHash);
      for (const [name, value] of f.saved) expect(await storage.read(name)).toEqual(value);
    },
  };
}

for (const mode of ['none', 'delete-response', 'create-response', 'launch-checkpoint', 'post-readback'] as const)
  test(`public native relay HA replacement runner preserves identities and interruption recovery (${mode})`, async () => {
    const f = await nativeRelayReplacementRunnerFixture(mode);
    try {
      if (mode !== 'none') await expect(f.run()).rejects.toThrow(/lost/);
      for (let attempt = 0; attempt < 2; attempt++) {
        await expect(f.run()).rejects.toThrow('publication freshness remain unqualified');
        expect(f.state.mutations).toEqual(['delete', 'create']);
        expect(f.state.bootstrap).toBe(1);
        await f.verifyRetained();
        const checkpoint = await loadCheckpoint(f.session, f.plan);
        expect(checkpoint?.state).toBe('partial');
        expect(checkpoint?.pendingAction).toBeUndefined();
        expect(checkpoint?.failedActionId).toBe(f.plan.actions.find((action) => action.kind === 'bgp-gate')?.id);
        expect(checkpoint?.completedActionIds).toEqual(
          f.plan.actions
            .filter((action) => ['vm-delete', 'vm-create', 'health-gate'].includes(action.kind))
            .map((action) => action.id),
        );
        expect(await f.storage.read(`${f.plan.planId}-replacement-relay-routing-observation.json`)).toMatchObject({
          routing: 'unknown',
          ceRouteScope: 'unqualified',
          ceSampleFreshnessQualified: false,
        });
      }
    } finally {
      await f.dispose();
    }
  });

for (const engine of ['native', 'terraform'] as const)
  test(`replacement relay history verifies selected and survivor identities for ${engine}`, async () => {
    const f =
      engine === 'native'
        ? await nativeRelayReplacementRunnerFixture('none')
        : await terraformRelayReplacementRunnerFixture();
    try {
      if ('run' in f) await expect(f.run()).rejects.toThrow('publication freshness remain unqualified');
      else
        await expect(
          runAzureTerraformReplacement(f.plan, f.terraform, f.runtime, f.storage, f.api, {}),
        ).rejects.toThrow('routing has not converged');
      const records = new Map<string, unknown>();
      for (const name of azureRelayHistoricalArtifacts)
        records.set(name, await f.storage.read(`${f.plan.planId}-replacement-${name}`));
      expect(() => verifyAzureRelayHistoricalArtifacts(f.plan, 'owned-site-uid', records)).not.toThrow();
      for (const kind of ['source', 'survivor', 'nic', 'device', 'site'] as const) {
        const forged = structuredClone(records);
        const journal = forged.get('relay-routing-workflow.json') as {
          sourcePlanSha256: string;
          siteUid: string;
          identity: { stable: { cloud: Array<{ node: string; vmId: string; nicId: string; device: string }> } };
        };
        if (kind === 'source') journal.sourcePlanSha256 = f.f.source.planSha256;
        if (kind === 'site') journal.siteUid = 'foreign-site';
        const survivor = present(journal.identity.stable.cloud.find((row) => row.node.endsWith('-1')));
        if (kind === 'survivor') survivor.vmId = f.f.selectedVmResourceId;
        if (kind === 'nic') survivor.nicId += '-foreign';
        if (kind === 'device') survivor.device = '';
        expect(() => verifyAzureRelayHistoricalArtifacts(f.plan, 'owned-site-uid', forged)).toThrow();
      }
      await f.verifyRetained();
    } finally {
      await f.dispose();
    }
  });

for (const engine of ['native', 'terraform'] as const)
  test(`public ${engine} replacement runner rejects a new generation while predecessor acceptance is unresolved`, async () => {
    const f =
      engine === 'native'
        ? await nativeRelayReplacementRunnerFixture('none')
        : await terraformRelayReplacementRunnerFixture();
    try {
      if ('run' in f) await expect(f.run()).rejects.toThrow('publication freshness remain unqualified');
      else
        await expect(
          runAzureTerraformReplacement(f.plan, f.terraform, f.runtime, f.storage, f.api, {}),
        ).rejects.toThrow('routing has not converged');
      if (f.plan.relayProfile?.schemaVersion !== 2) throw Error('replacement profile missing');
      const observed = structuredClone(f.plan.relayProfile.observation);
      present(observed.resources.find((row) => row.id === f.f.selectedVmResourceId)).tags['xcsh-plan-sha256'] =
        f.plan.planSha256;
      const next = compileAzureRelayReplacementPlan(
        compileAzureCePlan({ ...f.plan.intent, replacementNode: 1 }, observed),
        f.plan,
        observed,
      );
      if ('run' in f) {
        await savePlanArtifact(f.session, next, observed);
        await saveCheckpoint(f.session, next, {
          schemaVersion: AZURE_CE_CHECKPOINT_SCHEMA_VERSION,
          engine: 'native',
          planId: next.planId,
          planSha256: next.planSha256,
          completedActionIds: [],
          state: 'running',
          authorization: { apply: true, terms: true, destroy: false },
          observationFingerprint: fingerprintCheckpointObservation(observed),
          observationSnapshot: observed,
        });
        await expect(f.run(next)).rejects.toThrow('predecessor has not completed');
        expect(f.state.mutations).toEqual(['delete', 'create']);
        const predecessor = present(await loadCheckpoint(f.session, f.plan));
        await saveCheckpoint(f.session, f.plan, {
          ...predecessor,
          state: 'complete',
          failedActionId: undefined,
          completedActionIds: f.plan.actions.map((action) => action.id),
        });
        await expect(f.run(next)).rejects.toThrow('predecessor operational routing acceptance remains unqualified');
        expect(f.state.mutations).toEqual(['delete', 'create']);
      } else {
        await expect(runAzureTerraformReplacement(next, f.terraform, f.runtime, f.storage, f.api, {})).rejects.toThrow(
          'predecessor has not completed',
        );
        expect(f.state.applies).toEqual(['quiesce', 'launch']);
        const previous = (await f.storage.read(`${f.plan.planId}-terraform-replacement.json`)) as Record<
          string,
          unknown
        >;
        await f.storage.write(`${f.plan.planId}-terraform-replacement.json`, { ...previous, phase: 'complete' });
        await expect(runAzureTerraformReplacement(next, f.terraform, f.runtime, f.storage, f.api, {})).rejects.toThrow(
          'predecessor operational routing acceptance remains unqualified',
        );
        expect(f.state.applies).toEqual(['quiesce', 'launch']);
      }
      await f.verifyRetained();
    } finally {
      await f.dispose();
    }
  });

for (const mode of [
  'complete',
  'foreign-source',
  'foreign-row',
  'missing-source',
  'extra-journal',
  'interrupted',
  'changed',
] as const)
  test(`native parent replacement relay history retirement ${mode}`, async () => {
    const runner = await nativeRelayReplacementRunnerFixture('none');
    let retirement: Awaited<ReturnType<typeof nativeRelayRetirementFixture>> | undefined;
    try {
      await expect(runner.run()).rejects.toThrow('publication freshness remain unqualified');
      retirement = await nativeRelayRetirementFixture(runner.f.source);
      const f = retirement;
      const siteUid = 'owned-site-uid';
      const drain = { ...f.teardown.drain, sites: [{ ...f.teardown.drain.sites[0], siteUid }] };
      const teardown = compileAzureNativeTeardown(f.source, f.cloudPlan, drain, [
        { ...f.teardown.retirement[0], siteUid },
      ]);
      await f.storage.write(`${teardown.planId}.json`, teardown);
      // Prepare the separately verified upstream stage; this test targets only parent history replay.
      await runAzureNativeTeardown(
        f.source,
        f.cloudPlan,
        teardown,
        teardown.planSha256,
        f.runtime,
        f.contract,
        f.storage,
        async () => ({ status: 'retired', absence: 'absent' }),
        undefined,
        f.cloud.api,
      );
      const marker = 'azure-native-parent-artifact-retirement.json';
      await f.storage.remove(marker);
      const copied: string[] = [];
      for (const name of await readdir(runner.storage.directory)) {
        if (
          !(
            name.startsWith('native-source-') ||
            name.startsWith('native-action-') ||
            name.startsWith(`${runner.plan.planId}-replacement-`) ||
            azureRelayHistoricalArtifacts.has(name)
          )
        )
          continue;
        copied.push(name);
        await f.storage.write(name, await runner.storage.read(name));
      }
      const sourceFile = `native-source-${runner.plan.planSha256}.json`;
      const journalFile = `${runner.plan.planId}-replacement-relay-routing-workflow.json`;
      if (mode === 'missing-source') await f.storage.remove(sourceFile);
      if (mode === 'foreign-source' || mode === 'foreign-row') {
        const journal = (await f.storage.read(journalFile)) as {
          sourcePlanSha256: string;
          identity: { stable: { cloud: Array<{ vmId: string }> } };
        };
        if (mode === 'foreign-source') journal.sourcePlanSha256 = runner.f.source.planSha256;
        else journal.identity.stable.cloud[0].vmId = '/foreign';
        await f.storage.write(journalFile, journal);
      }
      if (mode === 'extra-journal')
        await f.storage.write(`${runner.plan.planId}-replacement-future-success.json`, { status: 'success' });
      const run = (signal?: AbortSignal) =>
        retireAzureNativeParentArtifacts(
          f.source,
          f.cloudPlan,
          teardown,
          f.runtime,
          f.contract,
          f.storage,
          f.cloud.api,
          signal,
        );
      if (['foreign-source', 'foreign-row', 'missing-source', 'extra-journal'].includes(mode)) {
        await expect(run()).rejects.toThrow();
        expect(await f.storage.read(journalFile)).toBeDefined();
        await expect(f.storage.read(marker)).rejects.toMatchObject({ code: 'ENOENT' });
        return;
      }
      if (mode === 'interrupted' || mode === 'changed') {
        const controller = new AbortController(),
          write = f.storage.write.bind(f.storage);
        f.storage.write = async (name, value) => {
          await write(name, value);
          if (name === marker) controller.abort();
        };
        await expect(run(controller.signal)).rejects.toThrow();
        f.storage.write = write;
        if (mode === 'changed') {
          await f.storage.write(journalFile, { changed: true });
          await expect(run()).rejects.toThrow();
          expect(await f.storage.read(sourceFile)).toBeDefined();
          return;
        }
        await f.storage.remove(journalFile);
      }
      expect(await run()).toMatchObject({ status: 'native-deployment-artifacts-retired', completeCleanup: true });
      for (const name of copied) await expect(f.storage.read(name)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await run()).toMatchObject({ status: 'native-deployment-artifacts-retired' });
    } finally {
      await runner.dispose();
      if (retirement) await rm(retirement.root, { recursive: true, force: true });
    }
  });

for (const mode of [
  'complete',
  'lost-quiesce',
  'lost-launch',
  'missing-plan',
  'missing-source',
  'foreign-token',
  'missing-token',
  'foreign-registration',
  'foreign-recovery',
  'foreign-lock',
  'orphan-journal',
  'interrupted',
  'changed',
] as const)
  test(`Terraform parent replacement history retirement ${mode}`, async () => {
    const runner = await terraformRelayReplacementRunnerFixture(
      mode === 'lost-quiesce' ? 'quiesce' : mode === 'lost-launch' || mode === 'foreign-recovery' ? 'launch' : 'none',
    );
    let retirement: Awaited<ReturnType<typeof prepareRelayParentRetirement>> | undefined;
    try {
      await expect(
        runAzureTerraformReplacement(runner.plan, runner.terraform, runner.runtime, runner.storage, runner.api, {}),
      ).rejects.toThrow('routing has not converged');
      const records = new Map<string, unknown>();
      for (const name of await readdir(runner.storage.directory))
        if (
          isAzureTerraformReplacementHistoricalArtifact(name) ||
          azureRelayHistoricalArtifacts.has(name) ||
          runner.tokens.some((token) => `${token.name}.json` === name)
        )
          records.set(name, await runner.storage.read(name));
      const sites = [{ siteName: runner.plan.siteName, siteUid: 'owned-site-uid', tokens: runner.tokens }];
      expect(() =>
        verifyAzureTerraformReplacementHistoricalArtifacts(runner.f.source, sites, records, runner.providerLockSha256),
      ).not.toThrow();
      retirement = await prepareRelayParentRetirement(runner.f.source, 'owned-site-uid', records, runner.tokens);
      const f = retirement;
      const marker = 'azure-terraform-parent-artifact-retirement.json';
      const planName = `${runner.plan.planId}-terraform-replacement-plan.json`;
      const sourceName = `${runner.plan.planId}-terraform-replacement-source.json`;
      const tokenName = `${runner.tokens.at(-1)?.name}.json`;
      if (mode === 'missing-plan') await f.store.remove(planName);
      if (mode === 'missing-source') await f.store.remove(sourceName);
      if (mode === 'missing-token') await f.store.remove(tokenName);
      if (mode === 'foreign-token') {
        const token = (await f.store.read(tokenName)) as Record<string, unknown>;
        await f.store.write(tokenName, { ...token, jwt: 'e30.e30.Zm9yZWlnbg' });
      }
      if (mode === 'foreign-lock') {
        const name = `${runner.plan.planId}-terraform-launch-plan.json`;
        const record = (await f.store.read(name)) as { receipt: PlanReceipt };
        record.receipt.providerLockSha256 = 'f'.repeat(64);
        await f.store.write(name, record);
      }
      if (mode === 'foreign-registration') {
        const name = `${runner.plan.planId}-terraform-replacement-registration.json`;
        const record = (await f.store.read(name)) as Record<string, unknown>;
        await f.store.write(name, { ...record, instanceId: runner.oldVmId });
      }
      if (mode === 'foreign-recovery') {
        const name = `${runner.plan.planId}-terraform-launch-recovery.json`;
        const record = (await f.store.read(name)) as { currentVmIds: Record<string, string> };
        record.currentVmIds[`${runner.plan.deploymentName}-1`] = runner.newVmId;
        await f.store.write(name, record);
      }
      if (mode === 'orphan-journal')
        await f.store.write('azure-ce-ffffffffffffffffffffffff-terraform-launch-plan.json', {
          receipt: 'foreign',
        });
      const run = (signal?: AbortSignal) =>
        retireAzureTerraformParentArtifacts(runner.f.source, f.teardown, f.evidence, f.store, signal);
      if (
        [
          'missing-plan',
          'missing-source',
          'foreign-token',
          'missing-token',
          'foreign-registration',
          'foreign-recovery',
          'foreign-lock',
          'orphan-journal',
        ].includes(mode)
      ) {
        await expect(run()).rejects.toThrow();
        await expect(f.store.read(marker)).rejects.toMatchObject({ code: 'ENOENT' });
        expect(await f.store.read('terraform-workflow.json')).toBeDefined();
        return;
      }
      if (mode === 'interrupted' || mode === 'changed') {
        const controller = new AbortController(),
          write = f.store.write.bind(f.store);
        f.store.write = async (name, value) => {
          await write(name, value);
          if (name === marker) controller.abort();
        };
        await expect(run(controller.signal)).rejects.toThrow();
        f.store.write = write;
        if (mode === 'changed') {
          await f.store.write(sourceName, { changed: true });
          await expect(run()).rejects.toThrow('inventory changed');
          expect(await f.store.read(planName)).toBeDefined();
          return;
        }
        // A resumed inventory uses its already-qualified hashes after sensitive source deletion.
        await f.store.remove(sourceName);
      }
      expect(await run()).toMatchObject({ status: 'deployment-artifacts-retired' });
      for (const name of records.keys()) await expect(f.store.read(name)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await run()).toMatchObject({ status: 'deployment-artifacts-retired' });
    } finally {
      await runner.dispose();
      if (retirement) await retirement.cleanup();
    }
  });

for (const mode of [
  'complete',
  'missing-source',
  'foreign-source',
  'missing-token',
  'foreign-token',
  'extra-admission',
  'interrupted',
  'changed',
  'foreign-original',
] as const)
  test(`coordinated native replacement enrollment retirement ${mode}`, async () => {
    const runner = await nativeRelayReplacementRunnerFixture('none');
    let retirement: Awaited<ReturnType<typeof nativeRelayRetirementFixture>> | undefined;
    try {
      await expect(runner.run()).rejects.toThrow('publication freshness remain unqualified');
      retirement = await nativeRelayRetirementFixture(runner.f.source);
      const f = retirement;
      const token = {
        node: `${runner.plan.deploymentName}-2`,
        name: `${runner.plan.deploymentName.slice(0, 40)}-2-${runner.plan.planSha256.slice(0, 12)}`,
      };
      const drain = { ...f.teardown.drain, sites: [{ ...f.teardown.drain.sites[0], siteUid: 'owned-site-uid' }] };
      const teardown = compileAzureNativeTeardown(f.source, f.cloudPlan, drain, [
        { ...f.teardown.retirement[0], siteUid: 'owned-site-uid', tokens: [...f.teardown.retirement[0].tokens, token] },
      ]);
      await f.storage.write(`${teardown.planId}.json`, teardown);
      const copied: string[] = [];
      for (const name of await readdir(runner.storage.directory)) {
        if (
          !(
            name.startsWith('native-source-') ||
            name.startsWith('native-action-') ||
            name.startsWith('native-admission-') ||
            name === `${token.name}.json` ||
            name.startsWith(`${runner.plan.planId}-replacement-`) ||
            azureRelayHistoricalArtifacts.has(name)
          )
        )
          continue;
        copied.push(name);
        await f.storage.write(name, await runner.storage.read(name));
      }
      const sourceName = `native-source-${runner.plan.planSha256}.json`;
      const admissionName = `native-admission-${runner.plan.planSha256}.json`;
      const tokenName = `${token.name}.json`;
      if (mode === 'missing-source') await f.storage.remove(sourceName);
      if (mode === 'foreign-source') await f.storage.write(sourceName, runner.f.source);
      if (mode === 'foreign-original') {
        const d = deploymentFixture('native', true, true);
        const intent = structuredClone(d.source.intent);
        intent.nics[0].name = 'foreign-slo';
        const foundation = compileAzureCePlan(intent, d.observed);
        const catalog = structuredClone(d.catalog);
        catalog.provenance.sourcePlanSha256 = foundation.planSha256;
        const alternate = compileAzureRelayDeploymentPlan(foundation, d.selection, catalog);
        expect(azureUpgradeBinding(alternate)).toEqual(f.binding);
        expect(alternate.planSha256).not.toBe(runner.f.source.planSha256);
        await persistAzureNativeSource(alternate, f.storage);
        await f.storage.write(`native-admission-${alternate.planSha256}.json`, {
          schemaVersion: 1,
          engine: 'native',
          planSha256: alternate.planSha256,
          siteReserved: true,
          bootstrapByNode: {},
          launchedAtByNode: {},
        });
      }
      if (mode === 'missing-token') await f.storage.remove(tokenName);
      if (mode === 'foreign-token') {
        const record = (await f.storage.read(tokenName)) as Record<string, unknown>;
        await f.storage.write(tokenName, { ...record, jwt: 'e30.e30.Zm9yZWlnbg' });
      }
      if (mode === 'extra-admission') {
        const record = (await f.storage.read(admissionName)) as Record<string, unknown>;
        await f.storage.write(admissionName, { ...record, futureSuccess: true });
      }
      const run = (signal?: AbortSignal) =>
        runAzureNativeTeardown(
          f.source,
          f.cloudPlan,
          teardown,
          teardown.planSha256,
          f.runtime,
          f.contract,
          f.storage,
          async () => ({ status: 'retired', absence: 'absent' }),
          signal,
          f.cloud.api,
        );
      if (
        [
          'missing-source',
          'foreign-source',
          'missing-token',
          'foreign-token',
          'extra-admission',
          'foreign-original',
        ].includes(mode)
      ) {
        if (mode === 'foreign-original')
          await expect(run()).rejects.toThrow('Native admission original resource owner differs');
        else await expect(run()).rejects.toThrow();
        expect(await f.storage.read(admissionName)).toBeDefined();
        await expect(f.storage.read('azure-native-bootstrap-retirement.json')).rejects.toMatchObject({
          code: 'ENOENT',
        });
        return;
      }
      if (mode === 'interrupted' || mode === 'changed') {
        const controller = new AbortController(),
          write = f.storage.write.bind(f.storage);
        f.storage.write = async (name, value) => {
          await write(name, value);
          if (name === 'azure-native-bootstrap-retirement.json') controller.abort();
        };
        await expect(run(controller.signal)).rejects.toThrow();
        f.storage.write = write;
        const marker = JSON.stringify(await f.storage.read('azure-native-bootstrap-retirement.json'));
        expect(marker).not.toContain('cloud-config');
        expect(marker).not.toContain('cmVwbGFjZW1lbnQ');
        if (mode === 'changed') {
          await f.storage.write(tokenName, { changed: true });
          await expect(run()).rejects.toThrow('changed');
          expect(await f.storage.read(admissionName)).toBeDefined();
          return;
        }
        await f.storage.remove(admissionName);
      }
      expect(await run()).toMatchObject({
        status: 'retired',
        bootstrap: { status: 'native-bootstrap-retired' },
        completeCleanup: true,
      });
      for (const name of copied) await expect(f.storage.read(name)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await run()).toMatchObject({ status: 'retired', completeCleanup: true });
    } finally {
      await runner.dispose();
      if (retirement) await rm(retirement.root, { recursive: true, force: true });
    }
  });

for (const mode of [
  'unexecuted',
  'lost-initial-checkpoint',
  'lost-quiesced-checkpoint',
  'missing-checkpoint-after-stage',
] as const)
  test(`Terraform parent partial replacement history retirement ${mode}`, async () => {
    const runner = await terraformRelayReplacementRunnerFixture();
    let retirement: Awaited<ReturnType<typeof prepareRelayParentRetirement>> | undefined;
    try {
      const write = runner.storage.write.bind(runner.storage);
      if (mode === 'unexecuted')
        runner.runtime.bootstrap = async () => {
          throw Error('stop before token issuance');
        };
      else
        runner.storage.write = async (name, value) => {
          if (
            name === `${runner.plan.planId}-terraform-replacement.json` &&
            (value as { phase: string }).phase === (mode === 'lost-initial-checkpoint' ? 'prepared' : 'quiesced')
          )
            throw Error('lost phase checkpoint');
          return write(name, value);
        };
      await expect(
        runAzureTerraformReplacement(runner.plan, runner.terraform, runner.runtime, runner.storage, runner.api, {}),
      ).rejects.toThrow(mode === 'unexecuted' ? 'stop before token issuance' : 'lost phase checkpoint');
      runner.storage.write = write;
      const records = new Map<string, unknown>();
      for (const name of await readdir(runner.storage.directory))
        if (
          isAzureTerraformReplacementHistoricalArtifact(name) ||
          azureRelayHistoricalArtifacts.has(name) ||
          runner.tokens.some((token) => `${token.name}.json` === name)
        )
          records.set(name, await runner.storage.read(name));
      retirement = await prepareRelayParentRetirement(runner.f.source, 'owned-site-uid', records, runner.tokens);
      const f = retirement;
      if (mode === 'missing-checkpoint-after-stage') {
        await f.store.remove(`${runner.plan.planId}-terraform-replacement.json`);
        await expect(
          retireAzureTerraformParentArtifacts(runner.f.source, f.teardown, f.evidence, f.store),
        ).rejects.toThrow('orphan stage without initial checkpoint');
        await expect(f.store.read('azure-terraform-parent-artifact-retirement.json')).rejects.toMatchObject({
          code: 'ENOENT',
        });
        expect(await f.store.read(`${runner.plan.planId}-terraform-replacement-source.json`)).toBeDefined();
      } else {
        expect(
          await retireAzureTerraformParentArtifacts(runner.f.source, f.teardown, f.evidence, f.store),
        ).toMatchObject({ status: 'deployment-artifacts-retired' });
        for (const name of records.keys()) await expect(f.store.read(name)).rejects.toMatchObject({ code: 'ENOENT' });
      }
      expect(runner.state.applies).toEqual(
        mode === 'lost-quiesced-checkpoint' || mode === 'missing-checkpoint-after-stage' ? ['quiesce'] : [],
      );
    } finally {
      await runner.dispose();
      if (retirement) await retirement.cleanup();
    }
  });

test('private replacement configuration diagnostics do not expose malformed enrollment material', async () => {
  const f = await terraformRelayReplacementRunnerFixture();
  try {
    const secret = 'opaque-ce-private-material';
    const value = `{"private":"${secret}", broken-json}`;
    const sha = createHash('sha256').update(value).digest('hex');
    const bootstrap = '#cloud-config\nwrite_files:\n- path: /etc/vpm/user_data\n  content: original\n';
    expect(() => azureTerraformReplacementStages(f.plan, value, sha, bootstrap)).toThrow(
      'Malformed Azure Terraform replacement configuration',
    );
    try {
      azureTerraformReplacementStages(f.plan, value, sha, bootstrap);
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  } finally {
    await f.dispose();
  }
});

for (const engine of ['native', 'terraform'] as const)
  for (const ha of [false, true])
    for (const kind of [
      'unqualified',
      'missing-freshness',
      'missing-eligibility',
      'closed-eligibility',
      'forged-eligibility',
    ] as const)
      test(`relay interface eligibility gate rejects ${engine}/${ha}/${kind} before routing or guest mutation`, async () => {
        const f = relayWorkflowFixture(engine, ha),
          original = f.runtime.observeAzureInterfaces;
        f.runtime.observeAzureInterfaces = async () => {
          const observed = await original();
          const result: Omit<Awaited<ReturnType<typeof original>>, 'freshness' | 'canSatisfyInterfaceMutationGate'> & {
            freshness?: 'verified' | 'unqualified';
            canSatisfyInterfaceMutationGate?: boolean;
          } = { ...observed, freshness: 'verified', canSatisfyInterfaceMutationGate: true };
          if (kind === 'unqualified') {
            result.freshness = 'unqualified';
            result.canSatisfyInterfaceMutationGate = false;
          }
          if (kind === 'missing-freshness') delete result.freshness;
          if (kind === 'missing-eligibility') delete result.canSatisfyInterfaceMutationGate;
          if (kind === 'closed-eligibility') result.canSatisfyInterfaceMutationGate = false;
          if (kind === 'forged-eligibility') result.freshness = 'unqualified';
          return result as Awaited<ReturnType<typeof original>>;
        };
        await expect(
          ensureAzureRelayRoutingWorkflow(f.source, f.expected, f.runtime, f.storage, f.api),
        ).rejects.toThrow();
        expect(f.routing).toBe(0);
        expect(f.mutations).toBe(0);
        expect(f.saved.has('relay-routing-workflow.json')).toBe(false);
      });

test('changed relay SKU generations reject before native resource submission', async () => {
  const f = nativeExecutionFixture();
  const original = f.api.exec;
  f.api.exec = async (command, args, options) => {
    const result = await original(command, args, options);
    if (args[0] === 'vm' && args[1] === 'list-skus') {
      const skus = JSON.parse(result.stdout);
      skus[0].capabilities.find((value: { name: string }) => value.name === 'HyperVGenerations').value = 'V1';
      return { ...result, stdout: JSON.stringify(skus) };
    }
    return result;
  };
  await expect(ensureAzureRelayNativeResources(f.source, f.plan, f.storage, f.api)).rejects.toThrow(
    'current catalog differs',
  );
  expect(f.puts).toBe(0);
});
