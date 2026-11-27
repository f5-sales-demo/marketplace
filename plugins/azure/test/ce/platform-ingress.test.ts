import { expect, test } from 'bun:test';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import { compileAzureCePlan } from '../../src/ce/planner';
import { ensureAzurePlatformIngress } from '../../src/ce/platform-ingress';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { intent as baseIntent, observation as baseObservation, subscriptionId } from './fixtures';

function fixture() {
  const sourceVmResourceId =
    `/subscriptions/${subscriptionId}/resourceGroups/rg-app/providers/Microsoft.Compute/virtualMachines/probe`.toLowerCase();
  const sourceNicResourceId =
    `/subscriptions/${subscriptionId}/resourceGroups/rg-app/providers/Microsoft.Network/networkInterfaces/probe-nic`.toLowerCase();
  const intent = structuredClone(baseIntent);
  intent.nics = [
    { name: 'slo', role: 'slo', subnet: { mode: 'greenfield', cidr: '10.20.0.0/24', name: 'slo' } },
    { name: 'sli', role: 'sli', subnet: { mode: 'greenfield', cidr: '10.20.1.0/24', name: 'sli' } },
  ];
  intent.ingress = {
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
      sourceVmResourceId,
      path: '/healthz',
      expectedStatus: 200,
      expectedBodySha256: '4'.repeat(64),
    },
  };
  intent.brownfield.resourceIds = [sourceVmResourceId];
  const observation = structuredClone(baseObservation);
  observation.resources = [{ id: sourceVmResourceId, exists: true, owned: false, tags: {}, state: {} }];
  const plan = compileAzureCePlan(intent, observation);
  const ceVmResourceId = plan.actions.find((action) => action.kind === 'vm-create')?.resourceId ?? '';
  const ceNicResourceId =
    plan.actions.find((action) => action.kind === 'nic-create' && action.description.includes('(sli)'))?.resourceId ??
    '';
  const values = new Map<string, unknown>();
  const calls = { plans: 0, applies: 0 };
  const storage = {
    owner: azureUpgradeBinding(plan).owner,
    async verify() {},
    async read(name: string) {
      if (!values.has(name)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return structuredClone(values.get(name));
    },
    async write(name: string, value: unknown) {
      values.set(name, structuredClone(value));
    },
  } as unknown as CeDeploymentStore;
  const runtime = {
    ingress() {
      return {
        async planAzure(receivedIntent: unknown, selections: Array<Record<string, unknown>>) {
          calls.plans++;
          expect(receivedIntent).toEqual({
            ...(intent.ingress?.mode === 'platform-http' ? intent.ingress.listener : {}),
            port: 8080,
            originAddress: '10.30.0.4',
          });
          expect(selections).toHaveLength(1);
          expect(selections[0]).toMatchObject({
            node: 'ce-demo-1',
            mac: '02:00:00:00:00:02',
            insideAddress: '10.20.1.10',
          });
          return { id: 'a'.repeat(24) };
        },
        async matchesAzure() {
          return true;
        },
        async apply(id: string) {
          calls.applies++;
          expect(id).toBe('a'.repeat(24));
          return {
            uid: 'listener-uid',
            listener: 'configured',
            routes: 'unknown',
            traffic: 'unknown',
            observedAt: '2026-09-10T00:00:00.000Z',
          };
        },
      };
    },
  } as unknown as CeRuntime;
  const ownerTags = {
    'xcsh-managed-by': 'azure-ce',
    'xcsh-deployment-id': plan.deploymentName,
    'xcsh-execution-engine': plan.engine,
    'xcsh-plan-sha256': plan.planSha256,
  };
  const api = {
    async exec(_command: string, args: string[]) {
      let response: unknown;
      if (args[0] === 'account')
        response = {
          id: subscriptionId,
          tenantId: observation.subscription.tenantId,
          environmentName: 'AzureCloud',
          state: 'Enabled',
        };
      else if (args[0] === 'vm' && args.includes(sourceVmResourceId))
        response = {
          id: sourceVmResourceId,
          vmId: '33333333-3333-4333-8333-333333333333',
          location: plan.region,
          provisioningState: 'Succeeded',
          powerState: 'VM running',
          networkProfile: { networkInterfaces: [{ id: sourceNicResourceId, primary: true }] },
        };
      else if (args[0] === 'network' && args.includes(sourceNicResourceId))
        response = {
          id: sourceNicResourceId,
          provisioningState: 'Succeeded',
          virtualMachine: { id: sourceVmResourceId },
          ipConfigurations: [{ primary: true, privateIPAddressVersion: 'IPv4', privateIPAddress: '10.30.0.4' }],
        };
      else if (args[0] === 'vm')
        response = {
          id: ceVmResourceId,
          provisioningState: 'Succeeded',
          tags: ownerTags,
          networkProfile: { networkInterfaces: [{ id: ceNicResourceId }] },
        };
      else
        response = {
          id: ceNicResourceId,
          provisioningState: 'Succeeded',
          tags: ownerTags,
          macAddress: '02-00-00-00-00-02',
          virtualMachine: { id: ceVmResourceId },
        };
      return { exitCode: 0, stderr: '', stdout: JSON.stringify(response) };
    },
  };
  return {
    plan,
    storage,
    runtime,
    contract: { fingerprint: 'sha256:ingress' } as unknown as VerifiedIngressContract,
    api,
    calls,
    values,
  };
}

test('persists and resumes one Azure platform ingress plan with exact source and SLI identities', async () => {
  const f = fixture();
  const first = await ensureAzurePlatformIngress(f.plan, f.runtime, f.storage, f.contract, f.api);
  const second = await ensureAzurePlatformIngress(f.plan, f.runtime, f.storage, f.contract, f.api);
  expect(first).toEqual(second);
  expect(f.calls).toEqual({ plans: 1, applies: 2 });
  expect(f.values.get('azure-platform-ingress.json')).toMatchObject({
    schemaVersion: 2,
    engine: 'native',
    ingressPlanId: 'a'.repeat(24),
    contractFingerprint: 'sha256:ingress',
  });
});

test('rejects a foreign marker before planning or applying ingress', async () => {
  const f = fixture();
  f.values.set('azure-platform-ingress.json', {
    schemaVersion: 2,
    engine: 'terraform',
    configurationSha256: 'f'.repeat(64),
    ingressPlanId: 'a'.repeat(24),
    contractFingerprint: 'sha256:ingress',
  });
  await expect(ensureAzurePlatformIngress(f.plan, f.runtime, f.storage, f.contract, f.api)).rejects.toThrow(
    /checkpoint differs/i,
  );
  expect(f.calls).toEqual({ plans: 0, applies: 0 });
});

test('retains sanitized source and cloud-interface joins before lifecycle planning', async () => {
  const f = fixture();
  const ingress = f.runtime.ingress.bind(f.runtime);
  f.runtime.ingress = (...args) => {
    const lifecycle = ingress(...args);
    const planAzure = lifecycle.planAzure.bind(lifecycle);
    lifecycle.planAzure = async (...params) => {
      const source = f.values.get(`azure-ingress-source-${f.plan.planSha256}.json`) as Record<string, unknown>;
      expect(source).toBeDefined();
      expect(source.sourcePlanSha256).toBe(f.plan.planSha256);
      expect(source.plan).toEqual(f.plan);
      expect(source.sourceIdentity).toBeDefined();
      expect(source.selectedIdentity).toBeDefined();
      return planAzure(...params);
    };
    return lifecycle;
  };
  await ensureAzurePlatformIngress(f.plan, f.runtime, f.storage, f.contract, f.api);
  expect(f.values.get('azure-platform-ingress.json')).toMatchObject({
    schemaVersion: 2,
    sourcePlanSha256: f.plan.planSha256,
  });
});

test('public ingress resume rejects extra marker fields and changed retained source identity', async () => {
  const f = fixture();
  await ensureAzurePlatformIngress(f.plan, f.runtime, f.storage, f.contract, f.api);
  const marker = f.values.get('azure-platform-ingress.json') as Record<string, unknown>;
  f.values.set('azure-platform-ingress.json', { ...marker, unknownRuntimeIdentifier: 'unresolved' });
  await expect(ensureAzurePlatformIngress(f.plan, f.runtime, f.storage, f.contract, f.api)).rejects.toThrow(
    /checkpoint differs/,
  );
  expect(f.calls.applies).toBe(1);
  f.values.set('azure-platform-ingress.json', marker);
  const source = f.values.get(`azure-ingress-source-${f.plan.planSha256}.json`) as Record<string, unknown>;
  const selected = source.selectedIdentity as { nic: Record<string, unknown> };
  selected.nic.macAddress = '02:00:00:00:00:99';
  await expect(ensureAzurePlatformIngress(f.plan, f.runtime, f.storage, f.contract, f.api)).rejects.toThrow(
    /attachment changed/,
  );
  expect(f.calls.applies).toBe(1);
});
