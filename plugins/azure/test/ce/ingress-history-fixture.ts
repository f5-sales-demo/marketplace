import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import { CeIngressLifecycle } from '../../../platform/src/ce/ingress-lifecycle';
import type { CePlatformDrainPlan } from '../../../platform/src/ce/platform-drain';
import { CeApiError, type CeRuntime } from '../../../platform/src/ce/runtime';
import { buildInsideHttpListener, projectInsideHttpListener } from '../../../platform/src/ce/wire-ingress';
import { buildSiteLocalHttpOrigin, projectSiteLocalHttpOrigin } from '../../../platform/src/ce/wire-origin';
import { createWireValidator } from '../../../platform/src/ce/wire-schema';
import listenerCompact from '../../../platform/test/fixtures/inside-listener-schema.json';
import { resolveCeSchemaFixture } from '../../../platform/test/fixtures/resolve-schema-fixture';
import originCompact from '../../../platform/test/fixtures/site-local-origin-schema.json';
import { canonicalSha256 } from '../../src/ce/canonical';
import { isAzureIngressHistoricalArtifact } from '../../src/ce/ingress-artifact-provenance';
import { compileAzureCePlan } from '../../src/ce/planner';
import { ensureAzurePlatformIngress } from '../../src/ce/platform-ingress';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { collectAzureTrafficProbe } from '../../src/ce/traffic-probe';
import type { AzureCeIntent, AzureCePlan } from '../../src/ce/types';
import { intent as baseIntent, observation as baseObservation, subscriptionId } from './fixtures';

type Json = Record<string, unknown>;
export function ingressIntent(subscription: string): NonNullable<AzureCeIntent['ingress']> {
  return {
    mode: 'platform-http',
    port: 8080,
    listener: {
      name: 'ce-listener',
      namespace: 'system',
      domain: 'ce.example.invalid',
      privateAddress: '10.20.1.10',
      originPool: { name: 'ce-origin', namespace: 'system' },
    },
    probe: {
      sourceVmResourceId:
        `/subscriptions/${subscription}/resourceGroups/rg-app/providers/Microsoft.Compute/virtualMachines/probe`.toLowerCase(),
      path: '/healthz',
      expectedStatus: 200,
      expectedBodySha256: '4'.repeat(64),
    },
  };
}
export async function createIngressHistoryFixture(engine: 'native' | 'terraform', sourceOverride?: AzureCePlan) {
  const intent = structuredClone(baseIntent);
  intent.engine = engine;
  intent.nics = [
    { name: 'slo', role: 'slo', subnet: { mode: 'greenfield', cidr: '10.20.0.0/24', name: 'slo' } },
    { name: 'sli', role: 'sli', subnet: { mode: 'greenfield', cidr: '10.20.1.0/24', name: 'sli' } },
  ];
  intent.ingress = ingressIntent(subscriptionId);
  if (intent.ingress.mode !== 'platform-http') throw Error('Fixture HTTP intent required');
  intent.brownfield.resourceIds = [intent.ingress.probe.sourceVmResourceId];
  const observation = structuredClone(baseObservation);
  observation.resources = [
    { id: intent.ingress.probe.sourceVmResourceId, exists: true, owned: false, tags: {}, state: {} },
  ];
  const plan = sourceOverride ?? compileAzureCePlan(intent, observation);
  if (plan.intent.ingress?.mode !== 'platform-http') throw Error('Fixture HTTP plan required');
  const ingress = plan.intent.ingress;
  const binding = azureUpgradeBinding(plan),
    sourceId = plan.intent.ingress.probe.sourceVmResourceId;
  const sourceNic =
    `/subscriptions/${plan.subscription.id}/resourceGroups/rg-app/providers/Microsoft.Network/networkInterfaces/probe-nic`.toLowerCase();
  const scope = `/subscriptions/${plan.subscription.id}/resourceGroups/${plan.intent.resourceGroup}/providers/`;
  const vmId = `${scope}Microsoft.Compute/virtualMachines/${binding.nodes[0]}`;
  const nicId = `${scope}Microsoft.Network/networkInterfaces/${binding.nodes[0]}-nic${plan.nics.find((row) => row.role === 'sli')?.index}`;
  const tags = {
    'xcsh-managed-by': 'azure-ce',
    'xcsh-execution-engine': engine,
    'xcsh-deployment-id': plan.deploymentName,
    'xcsh-plan-sha256': plan.planSha256,
  };
  const root = await mkdtemp(join(tmpdir(), 'azure-ingress-history-')),
    store = await CeDeploymentStore.open(root, binding.owner);
  const listenerSchema = resolveCeSchemaFixture(listenerCompact),
    originSchema = resolveCeSchemaFixture(originCompact);
  const validate = createWireValidator(listenerSchema.schemas, listenerSchema.provenance.root),
    validateOrigin = createWireValidator(originSchema.schemas, originSchema.provenance.root);
  const contract = {
    fingerprint: `sha256:${listenerSchema.provenance.sha256}`,
    build: (input: Parameters<typeof buildInsideHttpListener>[0]) => buildInsideHttpListener(input, validate),
    buildOrigin: (input: Parameters<typeof buildSiteLocalHttpOrigin>[0]) =>
      buildSiteLocalHttpOrigin(input, validateOrigin),
    projectObserved: (spec: unknown) => projectInsideHttpListener(spec, listenerSchema.schemas, validate),
    projectOriginObserved: (spec: unknown) => projectSiteLocalHttpOrigin(spec, originSchema.schemas, validateOrigin),
  } as VerifiedIngressContract;
  const siteFingerprint = `sha256:${'a'.repeat(64)}`;
  const state = {
    listener: undefined as Json | undefined,
    origin: undefined as Json | undefined,
    failListener: false,
    posts: 0,
    deletes: 0,
  };
  const port = {
    engine,
    siteFingerprint,
    async observeOwnedSite() {
      return { system_metadata: { uid: 'site-uid' } };
    },
    async observeAwsInterfaces() {
      throw Error('Wrong engine interface collector');
    },
    async observeAzureInterfaces() {
      return {
        status: 'observed' as const,
        observedAt: new Date().toISOString(),
        interfaces: [
          {
            node: binding.nodes[0],
            role: 'sli' as const,
            mac: '02:00:00:00:00:02',
            device: 'ens6',
            interfaceName: 'owned-generated-sli',
            mtu: 1500,
            linkUp: true,
            ipv4: { address: '10.20.1.10', prefixLength: 24 },
          },
        ],
      };
    },
    async request(path: string, init?: RequestInit) {
      const origin = path.includes('/origin_pools'),
        key = origin ? 'origin' : 'listener';
      if (init?.method === 'POST') {
        state.posts++;
        if (!origin && state.failListener) throw new CeApiError('transient');
        state[key] = {
          ...JSON.parse(String(init.body)),
          system_metadata: { uid: origin ? 'origin-uid' : 'listener-uid' },
        };
        return {};
      }
      if (init?.method === 'DELETE') {
        state.deletes++;
        state[key] = undefined;
        return {};
      }
      if (!state[key]) throw new CeApiError('not-found');
      return structuredClone(state[key]);
    },
  };
  const lifecycle = new CeIngressLifecycle(port, contract, store),
    runtime = { ingress: () => lifecycle } as unknown as CeRuntime;
  const api = {
    async exec(_command: string, args: string[]) {
      let value: unknown;
      if (args[0] === 'account')
        value = {
          id: plan.subscription.id,
          tenantId: plan.subscription.tenantId,
          environmentName: plan.subscription.cloud,
          state: 'Enabled',
        };
      else if (args[0] === 'vm' && args[1] === 'run-command')
        value = {
          value: [
            {
              code: 'ComponentStatus/StdOut/succeeded',
              message: `200 ${'4'.repeat(64)}\n${args[args.indexOf('--scripts') + 1]?.match(/xcsh-current-traffic:[a-f0-9-]+/) ? `\n${args[args.indexOf('--scripts') + 1]?.match(/xcsh-current-traffic:[a-f0-9-]+/)?.[0]}\n` : ''}`,
            },
            { code: 'ComponentStatus/StdErr/succeeded', message: '' },
          ],
        };
      else if (args[0] === 'vm' && args.includes(sourceId))
        value = {
          id: sourceId,
          vmId: '33333333-3333-4333-8333-333333333333',
          location: plan.region,
          powerState: 'VM running',
          provisioningState: 'Succeeded',
          customData: 'never-retain-this-secret',
          networkProfile: { networkInterfaces: [{ id: sourceNic, primary: true }] },
        };
      else if (args.includes(sourceNic))
        value = {
          id: sourceNic,
          provisioningState: 'Succeeded',
          virtualMachine: { id: sourceId },
          ipConfigurations: [{ primary: true, privateIPAddressVersion: 'IPv4', privateIPAddress: '10.30.0.4' }],
        };
      else if (args[0] === 'vm')
        value = {
          id: vmId,
          provisioningState: 'Succeeded',
          tags: { ...tags, arbitrarySecret: 'never-retain-this-tag' },
          customData: 'never-retain-this-secret',
          networkProfile: { networkInterfaces: [{ id: nicId }] },
        };
      else
        value = {
          id: nicId,
          provisioningState: 'Succeeded',
          tags,
          macAddress: '02-00-00-00-00-02',
          virtualMachine: { id: vmId },
        };
      return { exitCode: 0, stderr: '', stdout: JSON.stringify(value) };
    },
  };
  const drain = {
    schemaVersion: 1 as const,
    owner: binding.owner,
    sourcePlanSha256: plan.planSha256,
    siteContractFingerprint: siteFingerprint,
    ingressContractFingerprint: contract.fingerprint,
    listeners: [] as { id: string; name: string; namespace: string }[],
    origins: [] as CePlatformDrainPlan['origins'],
    sites: [{ binding, siteUid: 'site-uid', routing: [] }],
  };
  async function run(mode: 'planned' | 'origin' | 'complete' | 'corrected' = 'complete') {
    let ingressReceipt: Awaited<ReturnType<typeof ensureAzurePlatformIngress>> | undefined;
    let trafficEvidence: Awaited<ReturnType<typeof collectAzureTrafficProbe>> | undefined;
    if (mode === 'planned') {
      const apply = lifecycle.apply.bind(lifecycle);
      lifecycle.apply = async () => {
        throw Error('planning boundary interruption');
      };
      try {
        ingressReceipt = await ensureAzurePlatformIngress(plan, runtime, store, contract, api);
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('planning boundary')) throw error;
      }
      lifecycle.apply = apply;
    } else {
      state.failListener = mode === 'origin';
      try {
        ingressReceipt = await ensureAzurePlatformIngress(plan, runtime, store, contract, api);
      } catch (error) {
        if (mode !== 'origin' || !(error instanceof Error) || !error.message.includes('not yet observable'))
          throw error;
      }
    }
    const marker = (await store.read('azure-platform-ingress.json')) as { ingressPlanId: string };
    if (mode === 'corrected') await lifecycle.retire(marker.ingressPlanId);
    else if (mode === 'complete') {
      const reference = await lifecycle.teardownReference(marker.ingressPlanId);
      drain.listeners.push({ id: reference.id, name: reference.name, namespace: reference.namespace });
      const action = plan.actions.find((row) => row.kind === 'traffic-gate');
      trafficEvidence = await collectAzureTrafficProbe(
        plan,
        store,
        api,
        undefined,
        engine === 'native' ? `${plan.planId}-${action?.id}-traffic-probe` : 'azure-traffic-probe',
      );
      await lifecycle.delete(marker.ingressPlanId);
    }
    if (state.origin) {
      drain.origins.push({
        schemaVersion: 1,
        owner: binding.owner,
        origin: { ...ingress.listener.originPool, uid: 'origin-uid' },
        resourceVersion: 'rv-1',
        specSha256: canonicalSha256(state.origin.spec),
        contractFingerprint: contract.fingerprint,
        observedAt: new Date().toISOString(),
      });
      await port.request('/api/config/namespaces/system/origin_pools/ce-origin', { method: 'DELETE' });
    }
    const records = new Map<string, unknown>();
    for (const name of await readdir(store.directory))
      if (isAzureIngressHistoricalArtifact(name)) records.set(name, await store.read(name));
    return { records, marker, ingressReceipt, trafficEvidence };
  }
  return {
    root,
    store,
    plan,
    binding,
    contract,
    drain,
    runtime,
    api,
    lifecycle,
    state,
    run,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
