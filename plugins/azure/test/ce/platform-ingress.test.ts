import { expect, test } from 'bun:test';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import { compileAzureCePlan } from '../../src/ce/planner';
import { ensureAzurePlatformIngress } from '../../src/ce/platform-ingress';
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
            ...intent.ingress?.listener,
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
    contract: { fingerprint: 'sha256:ingress' } as VerifiedIngressContract,
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
    schemaVersion: 1,
    engine: 'native',
    ingressPlanId: 'a'.repeat(24),
    contractFingerprint: 'sha256:ingress',
  });
});

test('rejects a foreign marker before planning or applying ingress', async () => {
  const f = fixture();
  f.values.set('azure-platform-ingress.json', {
    schemaVersion: 1,
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
