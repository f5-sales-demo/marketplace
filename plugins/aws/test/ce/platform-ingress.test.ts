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
    listener: {
      name: 'ce-listener',
      namespace: 'default',
      domain: 'ce.example.invalid',
      originPool: { name: 'ce-origin', namespace: 'default' },
    },
  };
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
        async planAws(intent: unknown, selections: Array<Record<string, unknown>>) {
          calls.plans++;
          expect(intent).toEqual({
            ...(plan.intent.ingress?.mode === 'nlb' ? plan.intent.ingress.listener : {}),
            port: 8443,
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
      };
    },
  } as unknown as CeRuntime;
  const resolved = Object.fromEntries([1, 2, 3].map((node) => [`__ENI_${node}_1_MAC__`, `02:00:00:00:00:0${node}`]));
  return {
    plan: plan as AwsCePlan,
    storage,
    runtime,
    contract: { fingerprint: 'sha256:ingress' } as VerifiedIngressContract,
    resolved,
    calls,
    values,
  };
}

test('persists one platform plan and resumes the exact listener without replanning', async () => {
  const f = fixture();
  const first = await ensureAwsPlatformIngress(f.plan, f.runtime, f.storage, f.contract, f.resolved);
  const second = await ensureAwsPlatformIngress(f.plan, f.runtime, f.storage, f.contract, f.resolved);
  expect(first).toEqual(second);
  expect(f.calls).toEqual({ plans: 1, applies: 2 });
  expect(f.values.get('aws-platform-ingress.json')).toEqual({
    schemaVersion: 1,
    engine: 'terraform',
    planSha256: f.plan.planSha256,
    ingressPlanId: 'a'.repeat(24),
    contractFingerprint: 'sha256:ingress',
  });
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
  await expect(ensureAwsPlatformIngress(f.plan, f.runtime, f.storage, f.contract, f.resolved)).rejects.toThrow(
    'checkpoint differs',
  );
  f.values.clear();
  delete f.resolved.__ENI_2_1_MAC__;
  await expect(ensureAwsPlatformIngress(f.plan, f.runtime, f.storage, f.contract, f.resolved)).rejects.toThrow(
    'SLI MAC',
  );
  expect(f.calls.plans).toBe(0);
});
