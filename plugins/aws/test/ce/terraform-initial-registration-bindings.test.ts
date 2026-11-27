import { expect, test } from 'bun:test';
import type { TerraformSession } from '../../../terraform/src/service';
import { canonicalSha256 } from '../../src/ce/canonical';
import { readAwsInitialRegistrationRetirementBindings } from '../../src/ce/terraform-initial-registration-bindings';
import { foundationPlan } from './terraform-fixtures';

function fixture() {
  const plan = foundationPlan();
  plan.intent.topology = { nodeCount: 1, sites: [plan.intent.topology.sites[0]] };
  plan.intent.interfaces = plan.intent.interfaces.map((row) => ({ ...row, subnets: row.subnets.slice(0, 1) }));
  const { planId: _id, planSha256: _sha, ...draft } = plan;
  plan.planSha256 = canonicalSha256(draft);
  plan.planId = `aws-ce-${plan.planSha256.slice(0, 24)}`;
  const id = 'i-0123456789abcdef0';
  const receipt = {
    schemaVersion: 1,
    engine: 'terraform',
    operation: 'destroy',
    deploymentId: plan.intent.deploymentName,
    backendIdentity: `local:${plan.intent.deploymentName}`,
    planSha256: 'a'.repeat(64),
    configurationSha256: 'b'.repeat(64),
    providerLockSha256: 'c'.repeat(64),
    noChanges: false,
    changes: [{ address: 'aws_instance.node_1', type: 'aws_instance', actions: ['delete'] }],
  };
  const fields = { 'aws_instance.node_1': { id, region: plan.intent.region } };
  const tags = Object.entries({
    'xcsh-managed-by': 'aws-ce',
    'xcsh-execution-engine': 'terraform',
    'xcsh-deployment-id': plan.intent.deploymentName,
    'xcsh-plan-sha256': plan.planSha256,
    'xcsh-node-index': '1',
    'ves-io-site-name': plan.intent.topology.sites[0].name,
  }).map(([Key, Value]) => ({ Key, Value }));
  const response = { Reservations: [{ OwnerId: plan.intent.accountId, Instances: [{ InstanceId: id, Tags: tags }] }] };
  let account = plan.intent.accountId,
    malformed = false;
  const calls: string[][] = [];
  const api = {
    exec: async (_command: string, args: string[]) => {
      calls.push(args);
      return {
        exitCode: 0,
        stderr: '',
        stdout: malformed
          ? 'PRIVATE-INVALID-JSON'
          : JSON.stringify(args[1] === 'get-caller-identity' ? { Account: account } : response),
      };
    },
  };
  const session = {
    planDestroy: async () => receipt,
    readPlannedResourceFields: async () => fields,
  } as unknown as TerraformSession;
  return {
    plan,
    id,
    receipt,
    fields,
    response,
    tags,
    calls,
    api,
    session,
    foreignAccount: () => {
      account = '000000000000';
    },
    malformed: () => {
      malformed = true;
    },
  };
}
test('original registration binding requires saved instance projection and exact live owner/node/site tags', async () => {
  const f = fixture();
  expect(await readAwsInitialRegistrationRetirementBindings(f.plan, f.session, f.api, {})).toEqual({ 'ce-1': f.id });
  expect(f.calls).toHaveLength(2);
});
for (const kind of [
  'unresolved',
  'wrong-node',
  'foreign-plan',
  'foreign-account',
  'foreign-reservation',
  'duplicate-instance',
  'duplicate-tag',
  'malformed',
] as const) {
  test(`original registration binding rejects ${kind}`, async () => {
    const f = fixture();
    if (kind === 'unresolved') f.fields['aws_instance.node_1'].id = '__INSTANCE_ID__';
    if (kind === 'wrong-node') {
      const tag = f.tags.find((row) => row.Key === 'xcsh-node-index');
      if (!tag) throw Error('Required fixture tag missing');
      tag.Value = '2';
    }
    if (kind === 'foreign-plan') {
      const tag = f.tags.find((row) => row.Key === 'xcsh-plan-sha256');
      if (!tag) throw Error('Required fixture tag missing');
      tag.Value = 'f'.repeat(64);
    }
    if (kind === 'foreign-account') f.foreignAccount();
    if (kind === 'foreign-reservation') f.response.Reservations[0].OwnerId = '000000000000';
    if (kind === 'duplicate-instance')
      f.response.Reservations[0].Instances.push(f.response.Reservations[0].Instances[0]);
    if (kind === 'duplicate-tag') f.tags.push(f.tags[0]);
    if (kind === 'malformed') f.malformed();
    const failure = readAwsInitialRegistrationRetirementBindings(f.plan, f.session, f.api, {});
    await expect(failure).rejects.toThrow();
    if (kind === 'malformed') {
      try {
        await failure;
      } catch (error) {
        expect(String(error)).not.toContain('PRIVATE-INVALID-JSON');
      }
    }
    if (kind === 'unresolved') expect(f.calls).toHaveLength(0);
  });
}
