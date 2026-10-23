import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { CeTerraformService, TerraformSession } from '../../../terraform/src/service';
import { canonicalSha256 } from '../../src/ce/canonical';
import { AWS_CE_PROVIDER_LOCK_SHA256 } from '../../src/ce/execution-contract';
import {
  dispatchAwsTerraformPowerState,
  reconcileAwsTerraformPowerState,
} from '../../src/ce/terraform-power-controller';
import { buildAwsWholeSitePowerPlan } from '../../src/ce/whole-site-power';
import { powerIdentityFixture } from './whole-site-power-fixtures';

const hash = (v: string) => createHash('sha256').update(v).digest('hex');
const directories: string[] = [];
afterEach(async () => {
  for (const d of directories.splice(0)) await rm(d, { recursive: true });
});
async function fixture(operation: 'stop' | 'start' | 'release' = 'stop') {
  const f = powerIdentityFixture('terraform');
  const identities = await f.read();
  const bindings = {
    sourcePlanSha256: f.base.planSha256,
    owner: identities.owner,
    nodes: identities.nodes,
    servicesSha256: canonicalSha256({ services: [] }),
  };
  const stop = buildAwsWholeSitePowerPlan(f.base, 'stop', bindings, '11111111-1111-4111-8111-111111111111');
  const body = {
    schemaVersion: 1 as const,
    kind: 'aws-ce-stopped' as const,
    sourcePlanSha256: f.base.planSha256,
    transitionId: stop.transitionId,
    stopPlanSha256: stop.planSha256,
    bindingsSha256: stop.bindingsSha256,
    stoppedEvidenceSha256: 'a'.repeat(64),
    originalAttemptAt: '2026-10-19T00:00:00Z',
    observedAt: '2026-10-19T00:00:01Z',
  };
  const plan =
    operation === 'stop'
      ? stop
      : buildAwsWholeSitePowerPlan(f.base, 'start', bindings, stop.transitionId, {
          ...body,
          receiptSha256: canonicalSha256(body),
        });
  let source = JSON.stringify({
    terraform: {
      required_version: '= 1.16.5',
      required_providers: { aws: { source: 'hashicorp/aws', version: '= 6.63.0' } },
    },
    provider: { aws: { region: f.base.region, allowed_account_ids: [f.base.accountId], profile: 'ce-profile' } },
    resource: {
      aws_instance: {
        node_1: {
          ami: 'ami-0123456789abcdef0',
          user_data_base64: 'private-bootstrap',
          tags: {
            'xcsh-deployment-id': f.base.deploymentName,
            'xcsh-execution-engine': 'terraform',
            'xcsh-plan-sha256': f.base.planSha256,
            'xcsh-node-index': '1',
            'ves-io-site-name': identities.nodes[0].siteName,
          },
        },
      },
      aws_network_interface: { node_1_nic_0: { source_dest_check: false } },
    },
    output: { retained: { value: 'same' } },
  });

  if (operation !== 'stop') {
    const c = JSON.parse(source);
    c.resource.aws_ec2_instance_state = {
      ce_power_1: {
        instance_id: f.instance.InstanceId,
        state: operation === 'release' ? 'running' : 'stopped',
        force: false,
      },
    };
    source = JSON.stringify(c);
    f.instance.State.Name = operation === 'release' ? 'running' : 'stopped';
  }
  const directory = await mkdtemp(join(tmpdir(), 'terraform-power-'));
  directories.push(directory);
  const storage = await CeDeploymentStore.open(directory, bindings.owner);
  const attempt = {
    effect: operation,
    originalAttemptAt: '2026-10-19T00:00:02.000Z',
    requestSha256: canonicalSha256({ planSha256: plan.planSha256, effect: operation }),
  };
  await storage.write(`${plan.planId}.json`, plan);
  await storage.write(`${plan.planId}-checkpoint.json`, {
    schemaVersion: 1,
    planSha256: plan.planSha256,
    bindingsSha256: plan.bindingsSha256,
    step: operation === 'stop' ? 3 : operation === 'start' ? 1 : 5,
    evidence: {
      restored: {
        source: 'live',
        planSha256: plan.planSha256,
        bindingsSha256: plan.bindingsSha256,
        gate: 'restored',
        collectedAt: new Date().toISOString(),
        identity: 'verified',
        cloud: 'running',
        services: 'active',
        traffic: 'passing',
        registration: 'healthy',
        configuration: 'verified',
        versions: 'stable',
        interfaces: 'up',
        canSatisfyInterfaceMutationGate: true,
      },
    },
    complete: false,
    pending: attempt,
    attempts: { [operation]: attempt },
  });
  let configuration = source;
  let journal: 'planned' | 'applying' | 'applied' = 'planned';
  let count = 0;
  let lose = false;
  let failBefore = false;
  let stateMatches = false;
  let foreign = false;
  let receipt: PlanReceipt;
  let plans = 0;
  let drift = false;
  let retained = false;
  const session = {
    readConfigurationSha256: async () => hash(configuration),
    readConfiguration: async (expected: string) => {
      if (expected !== hash(configuration)) throw Error('configuration differs');
      return configuration;
    },
    reviseConfiguration: async (expected: string, next: string) => {
      if (expected !== hash(configuration)) throw Error('revision differs');
      configuration = next;
      return hash(next);
    },
    plan: async () => {
      plans++;
      journal = 'planned';
      receipt = {
        schemaVersion: 1,
        engine: 'terraform',
        deploymentId: f.base.deploymentName,
        backendIdentity: `local:${f.base.deploymentName}`,
        configurationSha256: hash(configuration),
        providerLockSha256: AWS_CE_PROVIDER_LOCK_SHA256,
        planSha256: 'a'.repeat(64),
        changes: [
          {
            address: 'aws_ec2_instance_state.ce_power_1',
            type: 'aws_ec2_instance_state',
            actions: [operation === 'stop' ? 'create' : operation === 'start' ? 'update' : 'delete'],
          },
        ],
        noChanges: false,
      };
      if (operation === 'release' && plans > 1) {
        receipt = {
          ...receipt,
          noChanges: !drift,
          changes: drift ? [{ address: 'aws_instance.node_1', type: 'aws_instance', actions: ['update'] }] : [],
        };
      }
      return receipt;
    },
    readProposedResourceFields: async () => ({
      'aws_ec2_instance_state.ce_power_1':
        JSON.parse(configuration).resource.aws_ec2_instance_state?.ce_power_1 ?? null,
    }),
    readPlannedResourceFields: async (_r: unknown, selections: Record<string, string[]>) =>
      Object.fromEntries(
        Object.keys(selections).map((a) => {
          if (a === 'aws_ec2_instance_state.ce_power_1')
            return [
              a,
              operation === 'stop' || plans > 1
                ? null
                : {
                    instance_id: f.instance.InstanceId,
                    state: operation === 'release' ? 'running' : 'stopped',
                    force: false,
                  },
            ];
          if (a === 'aws_instance.node_1') return [a, { id: f.instance.InstanceId }];
          const index = Number(a.at(-1));
          return [a, { id: f.enis[index].NetworkInterfaceId, mac_address: f.enis[index].MacAddress }];
        }),
      ),
    readPlanApplicationState: async () => journal,
    apply: async () => {
      if (failBefore) throw Error('before submission');
      if (journal !== 'planned') throw Error('replayed');
      count++;
      journal = 'applying';
      if (lose) throw Error('lost response');
      journal = 'applied';
    },
    readAppliedResourceFields: async (_r: unknown, selections: Record<string, string[]>) =>
      Object.fromEntries(
        Object.keys(selections).map((a) => {
          if (a === 'aws_ec2_instance_state.ce_power_1')
            return [
              a,
              (stateMatches && operation !== 'release') || retained
                ? {
                    id: f.instance.InstanceId,
                    instance_id: foreign ? 'i-11111111111111111' : f.instance.InstanceId,
                    state: operation === 'stop' ? 'stopped' : 'running',
                    force: false,
                  }
                : null,
            ];
          if (a === 'aws_instance.node_1') return [a, { id: f.instance.InstanceId }];
          const index = Number(a.at(-1));
          return [a, { id: f.enis[index].NetworkInterfaceId, mac_address: f.enis[index].MacAddress }];
        }),
      ),
    reconcileApplyFromEvidence: async () => {
      journal = 'applied';
    },
  } as unknown as TerraformSession;
  const terraform = {
    open: async (_owner: unknown, _deployment: unknown, resume: unknown) => {
      expect(resume).toBe('current');
      return session;
    },
  } as CeTerraformService;
  return {
    ...f,
    plan,
    storage,
    session,
    attempt,
    count: () => count,
    journal: () => journal,
    plans: () => plans,
    drift: () => {
      drift = true;
    },
    retain: () => {
      retained = true;
    },
    lose: () => {
      lose = true;
    },
    before: () => {
      failBefore = true;
    },
    resume: () => {
      failBefore = false;
    },
    converge: () => {
      stateMatches = true;
      f.instance.State.Name = operation === 'stop' ? 'stopped' : 'running';
    },
    foreign: () => {
      foreign = true;
    },
    dispatch: () =>
      dispatchAwsTerraformPowerState(f.base, plan, plan.planSha256, operation, storage, terraform, f.api, f.runtime),
    reconcile: () =>
      reconcileAwsTerraformPowerState(
        f.base,
        plan,
        operation,
        attempt.originalAttemptAt,
        storage,
        terraform,
        f.api,
        f.runtime,
      ),
  };
}
test('Terraform power applies owning saved plan once and requires cloud plus applied-state convergence', async () => {
  const f = await fixture();
  await f.dispatch();
  expect(f.count()).toBe(1);
  expect(await f.reconcile()).toBe('pending');
  f.converge();
  expect(await f.reconcile()).toBe('completed');
  await expect(f.dispatch()).rejects.toThrow('submitted');
  expect(f.count()).toBe(1);
});
test('Terraform lost apply response never replays and resolves only from independent exact outcome', async () => {
  const f = await fixture();
  f.lose();
  await expect(f.dispatch()).rejects.toThrow('lost response');
  expect(f.journal()).toBe('applying');
  f.converge();
  expect(await f.reconcile()).toBe('completed');
  expect(f.journal()).toBe('applied');
  expect(f.count()).toBe(1);
});
test('Terraform interruption before runner submission retains exact plan and original timestamp', async () => {
  const f = await fixture();
  f.before();
  await expect(f.dispatch()).rejects.toThrow('before submission');
  expect(await f.reconcile()).toBe('not-submitted');
  f.resume();
  await f.dispatch();
  expect(f.count()).toBe(1);
});
test('Terraform power foreign applied control cannot complete or permit replay', async () => {
  const f = await fixture();
  await f.dispatch();
  f.converge();
  f.foreign();
  await expect(f.reconcile()).rejects.toThrow();
  await expect(f.dispatch()).rejects.toThrow('submitted');
  expect(f.count()).toBe(1);
});
test('Terraform power authorization and original attempt are immutable', async () => {
  const f = await fixture();
  await expect(
    dispatchAwsTerraformPowerState(
      f.base,
      f.plan,
      'f'.repeat(64),
      'stop',
      f.storage,
      { open: async () => f.session },
      f.api,
      f.runtime,
    ),
  ).rejects.toThrow('authorization');
  expect(f.count()).toBe(0);
  await expect(
    reconcileAwsTerraformPowerState(
      f.base,
      f.plan,
      'stop',
      '2026-10-19T00:03:00Z',
      f.storage,
      { open: async () => f.session },
      f.api,
      f.runtime,
    ),
  ).rejects.toThrow('attempt');
});
test('Terraform power concurrent calls cannot double-submit', async () => {
  const f = await fixture();
  const r = await Promise.allSettled([f.dispatch(), f.dispatch()]);
  expect(r.filter((v) => v.status === 'fulfilled')).toHaveLength(1);
  expect(f.count()).toBe(1);
});

test('Terraform start retains stopped control and reconciles running cloud and applied identities', async () => {
  const f = await fixture('start');
  await f.dispatch();
  expect(await f.reconcile()).toBe('pending');
  f.converge();
  expect(await f.reconcile()).toBe('completed');
  expect(f.count()).toBe(1);
});

test('Terraform preparation tampering rejects before replay or reconciliation', async () => {
  const f = await fixture();
  await f.dispatch();
  const name = `${f.plan.planId}-stop-terraform-preparation.json`;
  const prep = (await f.storage.read(name)) as Record<string, unknown>;
  await f.storage.write(name, {
    ...prep,
    revision: { ...(prep.revision as Record<string, unknown>), instanceId: 'i-11111111111111111' },
  });
  await expect(f.reconcile()).rejects.toThrow('revision differs');
  await expect(f.dispatch()).rejects.toThrow('revision differs');
  expect(f.count()).toBe(1);
});
test('Terraform retained source tampering rejects before submission', async () => {
  const f = await fixture();
  f.before();
  await expect(f.dispatch()).rejects.toThrow();
  const name = `${f.plan.planId}-stop-terraform-source.json`;
  const source = (await f.storage.read(name)) as Record<string, unknown>;
  await f.storage.write(name, { ...source, configuration: '{}' });
  f.resume();
  await expect(f.dispatch()).rejects.toThrow();
  expect(f.count()).toBe(0);
});
test('Terraform cloud and applied-state disagreement remains pending', async () => {
  const f = await fixture();
  await f.dispatch();
  f.converge();
  f.instance.State.Name = 'running';
  expect(await f.reconcile()).toBe('pending');
  expect(f.count()).toBe(1);
});
test('Terraform absent preparation proves no submission without provider calls', async () => {
  const f = await fixture();
  expect(await f.reconcile()).toBe('not-submitted');
  expect(f.count()).toBe(0);
});
test('Terraform aborted dispatch cannot submit plan', async () => {
  const f = await fixture();
  const c = new AbortController();
  c.abort();
  await expect(
    dispatchAwsTerraformPowerState(
      f.base,
      f.plan,
      f.plan.planSha256,
      'stop',
      f.storage,
      { open: async () => f.session },
      f.api,
      f.runtime,
      c.signal,
    ),
  ).rejects.toThrow();
  expect(f.count()).toBe(0);
  expect(await f.reconcile()).toBe('not-submitted');
});

test('Terraform release removes only restored control then verifies refresh-enabled no-change and resumes without apply', async () => {
  const f = await fixture('release');
  await f.dispatch();
  f.converge();
  expect(await f.reconcile()).toBe('completed');
  expect(f.count()).toBe(1);
  expect(f.plans()).toBe(2);
  expect(await f.reconcile()).toBe('completed');
  expect(f.count()).toBe(1);
});
test('Terraform release rejects missing restored operational gate before planning', async () => {
  const f = await fixture('release');
  const name = `${f.plan.planId}-checkpoint.json`;
  const cp = (await f.storage.read(name)) as Record<string, unknown>;
  await f.storage.write(name, { ...cp, evidence: {} });
  await expect(f.dispatch()).rejects.toThrow('restored');
  expect(f.count()).toBe(0);
});
test('Terraform release final drift blocks completion without repeated removal', async () => {
  const f = await fixture('release');
  await f.dispatch();
  f.converge();
  f.drift();
  await expect(f.reconcile()).rejects.toThrow('no-change');
  expect(f.count()).toBe(1);
});

test('Terraform release rejects a retained actual control even with a no-change plan', async () => {
  const f = await fixture('release');
  await f.dispatch();
  f.converge();
  f.retain();
  await expect(f.reconcile()).rejects.toThrow('still present');
  expect(f.count()).toBe(1);
});
test('Terraform release stale restored gate cannot permit removal', async () => {
  const f = await fixture('release');
  const name = `${f.plan.planId}-checkpoint.json`;
  const cp = (await f.storage.read(name)) as Record<string, unknown>;
  const e = cp.evidence as Record<string, Record<string, unknown>>;
  e.restored.collectedAt = '2020-01-01T00:00:00Z';
  await f.storage.write(name, cp);
  await expect(f.dispatch()).rejects.toThrow('restored');
  expect(f.count()).toBe(0);
});

test('Terraform release lost apply response reconciles absence without removal replay', async () => {
  const f = await fixture('release');
  f.lose();
  await expect(f.dispatch()).rejects.toThrow('lost response');
  f.converge();
  expect(await f.reconcile()).toBe('completed');
  expect(f.count()).toBe(1);
  expect(f.plans()).toBe(2);
});
test('Terraform release resumes interrupted final state observation using retained no-change plan', async () => {
  const f = await fixture('release');
  await f.dispatch();
  f.converge();
  const original = f.session.readAppliedResourceFields;
  let interrupt = true;
  f.session.readAppliedResourceFields = async (...args) => {
    if (f.plans() > 1 && interrupt) {
      interrupt = false;
      throw Error('state observation unavailable');
    }
    return original(...args);
  };
  await expect(f.reconcile()).rejects.toThrow('unavailable');
  expect(f.plans()).toBe(2);
  expect(await f.reconcile()).toBe('completed');
  expect(f.plans()).toBe(2);
  expect(f.count()).toBe(1);
});

test('submitted Terraform release can reconcile after original restored receipt ages without replay', async () => {
  const f = await fixture('release');
  await f.dispatch();
  f.converge();
  const name = `${f.plan.planId}-checkpoint.json`;
  const cp = (await f.storage.read(name)) as Record<string, unknown>;
  const evidence = cp.evidence as Record<string, Record<string, unknown>>;
  evidence.restored.collectedAt = '2020-01-01T00:00:00Z';
  await f.storage.write(name, cp);
  expect(await f.reconcile()).toBe('completed');
  expect(f.count()).toBe(1);
});
