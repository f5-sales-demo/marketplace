import { expect, test } from 'bun:test';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { compileAzureCePlan } from '../../src/ce/planner';
import { collectAzureTrafficProbe } from '../../src/ce/traffic-probe';
import { intent as baseIntent, observation as baseObservation, subscriptionId } from './fixtures';

function fixture() {
  const sourceVmResourceId =
    `/subscriptions/${subscriptionId}/resourceGroups/rg-app/providers/Microsoft.Compute/virtualMachines/probe`.toLowerCase();
  const nicResourceId =
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
  const values = new Map<string, unknown>();
  const calls: string[][] = [];
  let probeOutput = `200 ${'4'.repeat(64)}\n`;
  let probeError = '';
  const api = {
    async exec(_command: string, args: string[]) {
      calls.push(args);
      const response =
        args[0] === 'account'
          ? {
              id: subscriptionId,
              tenantId: observation.subscription.tenantId,
              environmentName: 'AzureCloud',
              state: 'Enabled',
            }
          : args[0] === 'vm' && args[1] === 'show'
            ? {
                id: sourceVmResourceId,
                vmId: '33333333-3333-4333-8333-333333333333',
                location: plan.region,
                provisioningState: 'Succeeded',
                powerState: 'VM running',
                networkProfile: { networkInterfaces: [{ id: nicResourceId, primary: true }] },
              }
            : args[0] === 'network'
              ? {
                  id: nicResourceId,
                  provisioningState: 'Succeeded',
                  virtualMachine: { id: sourceVmResourceId },
                  ipConfigurations: [{ primary: true, privateIPAddressVersion: 'IPv4', privateIPAddress: '10.30.0.4' }],
                }
              : {
                  value: [
                    { code: 'ComponentStatus/StdOut/succeeded', message: probeOutput },
                    { code: 'ComponentStatus/StdErr/succeeded', message: probeError },
                  ],
                };
      return { exitCode: 0, stderr: '', stdout: JSON.stringify(response) };
    },
  };
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
  return {
    plan,
    values,
    calls,
    api,
    storage,
    setProbe(output: string, error = '') {
      probeOutput = output;
      probeError = error;
    },
  };
}

test('collects sanitized content-bound Azure Run Command evidence and resumes without another probe', async () => {
  const f = fixture();
  const first = await collectAzureTrafficProbe(f.plan, f.storage, f.api);
  const second = await collectAzureTrafficProbe(f.plan, f.storage, f.api);
  expect(first).toEqual(second);
  expect(first.status).toBe('healthy');
  const invokes = f.calls.filter((args) => args[0] === 'vm' && args[1] === 'run-command');
  expect(invokes).toHaveLength(1);
  expect(invokes[0]).toContain('RunShellScript');
  const saved = JSON.stringify(f.values.get('azure-traffic-probe.json'));
  expect(saved).not.toContain('curl');
  expect(saved).not.toContain('ComponentStatus');
});

test('retains only sanitized failed-attempt evidence and retries without manual repair', async () => {
  const f = fixture();
  f.setProbe(`503 ${'5'.repeat(64)}\n`, 'upstream unavailable');
  await expect(collectAzureTrafficProbe(f.plan, f.storage, f.api)).rejects.toThrow(/has not converged/i);
  const pending = f.values.get('azure-traffic-probe.json') as Record<string, unknown>;
  expect(pending.phase).toBe('ready');
  expect(JSON.stringify(pending)).not.toContain('upstream unavailable');
  f.setProbe(`200 ${'4'.repeat(64)}\n`);
  expect((await collectAzureTrafficProbe(f.plan, f.storage, f.api)).status).toBe('healthy');
  expect(f.calls.filter((args) => args[0] === 'vm' && args[1] === 'run-command')).toHaveLength(2);
});

test('rejects malformed Run Command output and forged persisted evidence', async () => {
  const malformed = fixture();
  malformed.setProbe('not-a-receipt');
  await expect(collectAzureTrafficProbe(malformed.plan, malformed.storage, malformed.api)).rejects.toThrow(
    /has not converged/i,
  );

  const forged = fixture();
  await collectAzureTrafficProbe(forged.plan, forged.storage, forged.api);
  const state = forged.values.get('azure-traffic-probe.json') as Record<string, unknown>;
  forged.values.set('azure-traffic-probe.json', {
    ...state,
    evidence: { ...(state.evidence as Record<string, unknown>), bodySha256: '5'.repeat(64) },
  });
  await expect(collectAzureTrafficProbe(forged.plan, forged.storage, forged.api)).rejects.toThrow(
    /Persisted Azure traffic evidence/i,
  );
});
