import { expect, test } from 'bun:test';
import { nativeAwsApplyQualification } from '../../src/ce/native-apply-qualification';
import type { AwsCeCheckpoint, AwsCePlan } from '../../src/ce/types';
import { powerIdentityFixture } from './whole-site-power-fixtures';
import { nlbPowerFixture } from './whole-site-power-nlb-fixtures';

function installationPlan(plan: AwsCePlan): AwsCePlan {
  plan.actions = [
    {
      id: 'registration',
      phase: 'verify',
      kind: 'registration-gate',
      description: 'Registration',
      mutates: false,
      destructive: false,
    },
    {
      id: 'health',
      phase: 'verify',
      kind: 'health-gate',
      description: 'Global health',
      mutates: false,
      destructive: false,
    },
  ];
  return plan;
}

function checkpoint(plan: AwsCePlan): AwsCeCheckpoint {
  return {
    schemaVersion: 2,
    engine: 'native',
    planId: plan.planId,
    planSha256: plan.planSha256,
    completedActionIds: plan.actions.map((action) => action.id),
    resolvedValues: {},
    state: 'complete',
  };
}

test('completed Mesh installation cannot imply node health or unconfigured traffic qualification', () => {
  const base = installationPlan(powerIdentityFixture().base);
  const result = nativeAwsApplyQualification(base, checkpoint(base));
  expect(result.installation.status).toBe('complete');
  expect(result.healthScope).toBe('site-global-only');
  expect(result.nodeHealth).toBe('unknown');
  expect(result.traffic).toEqual({ status: 'unknown', gateCompleted: false, reason: 'no-ingress-probe-configured' });
});

test('a foreign or incomplete completed checkpoint cannot report installation completion', () => {
  const base = installationPlan(powerIdentityFixture().base);
  for (const change of [
    { engine: 'terraform' as const },
    { planId: 'another-plan' },
    { planSha256: 'f'.repeat(64) },
    { completedActionIds: [] },
    { completedActionIds: [...base.actions.map((action) => action.id), 'duplicate'] },
    { state: 'partial' as const },
  ]) {
    const result = nativeAwsApplyQualification(base, { ...checkpoint(base), ...change });
    expect(result.installation.status).toBe('incomplete');
    expect(result.traffic.status).toBe('unknown');
  }
});

test('a completed configured probe is retained as checkpoint evidence rather than a current live observation', async () => {
  const base = installationPlan((await nlbPowerFixture()).base);
  base.actions = [
    ...base.actions,
    {
      id: 'traffic',
      phase: 'verify',
      kind: 'traffic-gate',
      description: 'Traffic probe',
      mutates: false,
      destructive: false,
    },
  ];
  const completed = checkpoint(base);
  const result = nativeAwsApplyQualification(base, completed);
  expect(result.traffic.gateCompleted).toBe(true);
  expect(result.traffic.status).toBe('unknown');
  expect(result.traffic.reason).toBe('checkpointed-probe-is-not-current-live-evidence');
  completed.completedActionIds.pop();
  const pending = nativeAwsApplyQualification(base, completed);
  expect(pending.installation.status).toBe('incomplete');
  expect(pending.traffic.gateCompleted).toBe(false);
  expect(pending.traffic.reason).toBe('traffic-gate-not-complete');
});
