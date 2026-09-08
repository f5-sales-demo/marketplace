import { expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
import { runAwsTerraformCloudTeardown } from '../../src/ce/terraform-cloud-teardown';
import { renderAwsTerraformFoundation } from '../../src/ce/terraform-foundation';
import { foundationPlan } from './terraform-fixtures';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function fixture() {
  const plan = foundationPlan();
  let configuration = renderAwsTerraformFoundation(plan);
  let exists = true;
  let deletes = 0;
  let revisions = 0;
  let failAfterDelete = false;
  let failRetirementCheckpoint = false;
  const files = new Map<string, unknown>();
  const storage = {
    owner: {
      deploymentId: plan.intent.deploymentName,
      engine: 'terraform',
      provider: 'aws',
      account: plan.intent.accountId,
      region: plan.intent.region,
    },
    verify: async () => {},
    read: async (name: string) => {
      if (!files.has(name)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return structuredClone(files.get(name));
    },
    write: async (name: string, value: unknown) => {
      if (
        name === 'terraform-cloud-teardown.json' &&
        (value as { phase?: string }).phase === 'verify-pending' &&
        failRetirementCheckpoint
      ) {
        failRetirementCheckpoint = false;
        throw new Error('interrupted checkpoint write');
      }
      files.set(name, structuredClone(value));
    },
  } as Pick<CeDeploymentStore, 'read' | 'write' | 'verify' | 'owner'>;
  const receipt = (destroy: boolean): PlanReceipt => ({
    schemaVersion: 1,
    engine: 'terraform',
    deploymentId: plan.intent.deploymentName,
    backendIdentity: `local:${plan.intent.deploymentName}`,
    configurationSha256: hash(configuration),
    providerLockSha256: 'b'.repeat(64),
    planSha256: 'c'.repeat(64),
    ...(destroy ? { operation: 'destroy' as const } : {}),
    noChanges: !exists,
    changes: exists ? [{ address: 'aws_vpc.ce', type: 'aws_vpc', actions: ['delete'] }] : [],
  });
  const session = {
    planDestroy: async () => receipt(true),
    plan: async () => receipt(false),
    readConfiguration: async (expected: string) => {
      if (expected !== hash(configuration)) throw new Error('revision is stale');
      return configuration;
    },
    reviseConfiguration: async (expected: string, next: string) => {
      if (expected !== hash(configuration)) throw new Error('revision is stale');
      if (configuration !== next) revisions++;
      configuration = next;
      return hash(next);
    },
    readPlannedResourceFields: async () => ({
      'aws_vpc.ce': exists ? { id: 'vpc-12345678', region: plan.intent.region } : null,
    }),
    apply: async (value: PlanReceipt) => {
      expect(value.configurationSha256).toBe(hash(configuration));
      if (value.operation === 'destroy' && exists) {
        exists = false;
        deletes++;
        if (failAfterDelete) {
          failAfterDelete = false;
          throw new Error('lost apply response');
        }
      }
    },
  } as unknown as TerraformSession;
  const api = {
    exec: async (_command: string, args: string[]) => ({
      exitCode: 0,
      stderr: '',
      stdout: JSON.stringify(
        args[1] === 'get-caller-identity'
          ? { Account: plan.intent.accountId }
          : {
              Vpcs: [
                {
                  VpcId: 'vpc-12345678',
                  Tags: Object.entries({
                    'xcsh-managed-by': 'aws-ce',
                    'xcsh-execution-engine': 'terraform',
                    'xcsh-deployment-id': plan.intent.deploymentName,
                    'xcsh-plan-sha256': plan.planSha256,
                  }).map(([Key, Value]) => ({ Key, Value })),
                },
              ],
            },
      ),
    }),
  };
  return {
    plan,
    session,
    storage,
    api,
    files,
    configuration: () => JSON.parse(configuration),
    deletes: () => deletes,
    revisions: () => revisions,
    failAfterDelete: () => {
      failAfterDelete = true;
    },
    failRetirementCheckpoint: () => {
      failRetirementCheckpoint = true;
    },
  };
}

it('destroys through the owning guard, retires desired resources, and finishes with an ordinary no-change plan', async () => {
  const f = fixture();
  const result = await runAwsTerraformCloudTeardown(f.plan, f.session, f.storage, f.api, {});
  expect(result.status).toBe('terraform-state-retired');
  expect(result.cloudInventory).toBe('unknown');
  expect(f.configuration().resource).toBeUndefined();
  expect(f.configuration().provider.aws.allowed_account_ids).toEqual([f.plan.intent.accountId]);
  expect(f.deletes()).toBe(1);
  expect(f.revisions()).toBe(1);
  expect((f.files.get('terraform-cloud-teardown-final-refresh.json') as PlanReceipt).operation).toBeUndefined();
  await runAwsTerraformCloudTeardown(f.plan, f.session, f.storage, f.api, {});
  expect(f.deletes()).toBe(1);
  expect(f.revisions()).toBe(1);
});

for (const boundary of ['delete', 'retirement'] as const)
  it(`resumes an interruption at ${boundary} without repeating cloud deletion or requiring state edits`, async () => {
    const f = fixture();
    if (boundary === 'delete') f.failAfterDelete();
    else f.failRetirementCheckpoint();
    await expect(runAwsTerraformCloudTeardown(f.plan, f.session, f.storage, f.api, {})).rejects.toThrow();
    const result = await runAwsTerraformCloudTeardown(f.plan, f.session, f.storage, f.api, {});
    expect(result.status).toBe('terraform-state-retired');
    expect(f.deletes()).toBe(1);
    expect(f.revisions()).toBe(1);
  });

it('rejects corrupted retirement evidence and foreign ownership before deleting', async () => {
  const missing = fixture();
  missing.files.set('terraform-cloud-teardown-source.json', null);
  await expect(
    runAwsTerraformCloudTeardown(missing.plan, missing.session, missing.storage, missing.api, {}),
  ).rejects.toThrow(/snapshot/);
  expect(missing.files.get('terraform-cloud-teardown-source.json')).toBeNull();
  expect(missing.deletes()).toBe(0);
  const f = fixture();
  f.files.set('terraform-cloud-teardown-source.json', { schemaVersion: 1, engine: 'native' });
  await expect(runAwsTerraformCloudTeardown(f.plan, f.session, f.storage, f.api, {})).rejects.toThrow(/snapshot/);
  expect(f.deletes()).toBe(0);
  f.storage.owner.engine = 'native';
  await expect(runAwsTerraformCloudTeardown(f.plan, f.session, f.storage, f.api, {})).rejects.toThrow(/ownership/);
  expect(f.deletes()).toBe(0);
});

it('checkpoints successful destruction before honoring cancellation and resumes retirement later', async () => {
  const f = fixture();
  const controller = new AbortController();
  const apply = f.session.apply;
  f.session.apply = async (...args) => {
    await apply(...args);
    controller.abort();
  };
  await expect(
    runAwsTerraformCloudTeardown(f.plan, f.session, f.storage, f.api, {}, controller.signal),
  ).rejects.toThrow();
  expect(f.files.get('terraform-cloud-teardown.json')).toMatchObject({ phase: 'retire-pending' });
  expect(f.deletes()).toBe(1);
  expect(f.revisions()).toBe(0);
  f.session.apply = apply;
  await runAwsTerraformCloudTeardown(f.plan, f.session, f.storage, f.api, {});
  expect(f.deletes()).toBe(1);
  expect(f.revisions()).toBe(1);
});
