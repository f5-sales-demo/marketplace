import { expect, test } from 'bun:test';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import { ensureAwsPlatformIngress } from '../../src/ce/platform-ingress';
import type { AwsCePlan } from '../../src/ce/types';
import { foundationPlan } from './terraform-fixtures';

function fixture() {
  const plan = foundationPlan();
  plan.intent.namespace = 'default';
  plan.deploymentName = plan.intent.deploymentName;
  plan.interfaces = plan.intent.interfaces;
  plan.intent.ingress = {
    mode: 'nlb',
    port: 8443,
    scheme: 'internal',
    loadBalancer: {
      vpcId: 'vpc-0bbbbbbbbbbbbbbbb',
      subnetIds: ['subnet-0cccccccccccccccc'],
      privateAddresses: ['10.9.0.10'],
    },
    listener: {
      name: 'ce-listener',
      namespace: 'default',
      domain: 'ce.example.invalid',
      privateAddresses: ['10.0.4.10', '10.0.5.10', '10.0.6.10'],
      originPool: { name: 'ce-origin', namespace: 'default' },
    },
    probe: {
      sourceInstanceId: 'i-0feedface12345678',
      path: '/healthz',
      expectedStatus: 200,
      expectedBodySha256: '4'.repeat(64),
    },
  };
  const values = new Map<string, unknown>();
  const calls = { plans: 0, applies: 0, retires: 0 };
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
        async planAws(intent: unknown, selections: Array<Record<string, unknown>>) {
          calls.plans++;
          expect(intent).toEqual({
            ...(plan.intent.ingress?.mode === 'nlb' ? plan.intent.ingress.listener : {}),
            port: 8443,
            originAddress: '192.0.2.10',
          });
          expect(selections.map((row) => row.node)).toEqual(['ce-1', 'ce-2', 'ce-3']);
          expect(selections.map((row) => row.mac)).toEqual([
            '02:00:00:00:00:01',
            '02:00:00:00:00:02',
            '02:00:00:00:00:03',
          ]);
          return { id: 'a'.repeat(24) };
        },
        async apply(id: string) {
          calls.applies++;
          expect(id).toBe('a'.repeat(24));
          return {
            uid: 'listener-uid',
            listener: 'configured',
            routes: 'unknown',
            traffic: 'unknown',
            observedAt: '2026-09-09T00:00:00.000Z',
          };
        },
        async retire(id: string) {
          calls.retires++;
          expect(id).toBe('a'.repeat(24));
        },
      };
    },
  } as unknown as CeRuntime;
  const resolved = Object.fromEntries([1, 2, 3].map((node) => [`__ENI_${node}_1_MAC__`, `02:00:00:00:00:0${node}`]));
  const api = {
    async exec() {
      return {
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify({
          Reservations: [
            {
              Instances: [
                {
                  InstanceId: 'i-0feedface12345678',
                  PrivateIpAddress: '192.0.2.10',
                  State: { Name: 'running' },
                },
              ],
            },
          ],
        }),
      };
    },
  };
  return {
    plan: plan as AwsCePlan,
    storage,
    runtime,
    contract: { fingerprint: 'sha256:ingress' } as VerifiedIngressContract,
    resolved,
    calls,
    values,
    api,
  };
}

test('persists one platform plan and resumes the exact listener without replanning', async () => {
  const f = fixture();
  const first = await ensureAwsPlatformIngress(f.plan, f.runtime, f.storage, f.contract, f.resolved, f.api);
  const second = await ensureAwsPlatformIngress(f.plan, f.runtime, f.storage, f.contract, f.resolved, f.api);
  expect(first).toEqual(second);
  expect(f.calls).toEqual({ plans: 1, applies: 2, retires: 0 });
  expect(f.values.get('aws-platform-ingress.json')).toEqual({
    schemaVersion: 8,
    engine: 'terraform',
    planSha256: f.plan.planSha256,
    ingressPlanId: 'a'.repeat(24),
    contractFingerprint: 'sha256:ingress',
  });
});

test('automatically retires owned legacy ingress markers before applying their corrected successor', async () => {
  for (const schemaVersion of [1, 2, 3, 4, 5, 6, 7]) {
    const f = fixture();
    f.values.set('aws-platform-ingress.json', {
      schemaVersion,
      engine: 'terraform',
      planSha256: f.plan.planSha256,
      ingressPlanId: 'a'.repeat(24),
      contractFingerprint: 'sha256:ingress',
    });
    await ensureAwsPlatformIngress(f.plan, f.runtime, f.storage, f.contract, f.resolved, f.api);
    expect(f.calls).toEqual({ plans: 1, applies: 1, retires: 1 });
    expect((f.values.get('aws-platform-ingress.json') as { schemaVersion: number }).schemaVersion).toBe(8);
  }
});

test('rejects a foreign checkpoint or missing observed SLI MAC before platform mutation', async () => {
  const f = fixture();
  f.values.set('aws-platform-ingress.json', {
    schemaVersion: 1,
    engine: 'native',
    planSha256: f.plan.planSha256,
    ingressPlanId: 'a'.repeat(24),
    contractFingerprint: 'sha256:ingress',
  });
  await expect(ensureAwsPlatformIngress(f.plan, f.runtime, f.storage, f.contract, f.resolved, f.api)).rejects.toThrow(
    'checkpoint differs',
  );
  f.values.clear();
  delete f.resolved.__ENI_2_1_MAC__;
  await expect(ensureAwsPlatformIngress(f.plan, f.runtime, f.storage, f.contract, f.resolved, f.api)).rejects.toThrow(
    'SLI MAC',
  );
  expect(f.calls.plans).toBe(0);
});
