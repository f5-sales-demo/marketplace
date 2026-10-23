import { expect, test } from 'bun:test';
import { readAwsTerraformInstanceBindings, readAwsTerraformWorkflowStatus } from '../../src/ce/terraform-status';
import type { AwsCePlan } from '../../src/ce/types';

const plan = { engine: 'terraform', schemaVersion: 2, planId: 'aws-ce-test', planSha256: 'a'.repeat(64) } as AwsCePlan;
const workflow = { schemaVersion: 1, engine: 'terraform', planSha256: plan.planSha256, stage: 'network-pending' };
const missing = () => Object.assign(new Error('missing'), { code: 'ENOENT' });
const storage = (values: Record<string, unknown>) => ({
  verify: async () => {},
  read: async (name: string) => {
    if (!(name in values)) throw missing();
    return values[name];
  },
});

test('reports each exact workflow stage without exporting extra bootstrap fields', async () => {
  for (const stage of ['network-pending', 'registration-pending', 'registered']) {
    const result = await readAwsTerraformWorkflowStatus(
      plan,
      storage({
        'terraform-workflow.json': { ...workflow, stage, bootstrapByNode: { '1': 'secret' } },
      }),
    );
    expect(result.progress.state).toBe(stage);
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(result.routing).toBeUndefined();
  }
});

test('missing journal differs from invalid or unavailable evidence', async () => {
  expect((await readAwsTerraformWorkflowStatus(plan, storage({}))).progress.state).toBe('not-started');
  for (const value of [
    null,
    [],
    { ...workflow, engine: 'native' },
    { ...workflow, planSha256: 'b'.repeat(64) },
    { ...workflow, stage: 'future' },
  ]) {
    await expect(readAwsTerraformWorkflowStatus(plan, storage({ 'terraform-workflow.json': value }))).rejects.toThrow();
  }
  await expect(
    readAwsTerraformWorkflowStatus(plan, {
      verify: async () => {
        throw Error('owner differs');
      },
      read: async () => workflow,
    }),
  ).rejects.toThrow('owner differs');
  await expect(
    readAwsTerraformWorkflowStatus(plan, {
      verify: async () => {},
      read: async () => {
        throw Error('unavailable');
      },
    }),
  ).rejects.toThrow('unavailable');
  await expect(readAwsTerraformWorkflowStatus({ ...plan, engine: 'native' }, storage({}))).rejects.toThrow(
    'owning engine',
  );
});

test('passes only exact routing checkpoint bindings and keeps workflow progress separate', async () => {
  const routing = {
    schemaVersion: 2,
    engine: 'terraform',
    planId: plan.planId,
    planSha256: plan.planSha256,
    state: 'running',
    completedActionIds: [],
    resolvedValues: { __TGW_CONNECT_PEER_1__: 'tgw-connect-peer-12345678' },
  };
  const result = await readAwsTerraformWorkflowStatus(
    plan,
    storage({
      'terraform-workflow.json': { ...workflow, stage: 'registered' },
      'terraform-routing-checkpoint.json': routing,
    }),
  );
  expect(result.routing).toEqual(routing);
  expect(result.progress.state).toBe('registered');
  for (const value of [
    { ...routing, engine: 'native' },
    { ...routing, planId: 'foreign' },
    { ...routing, resolvedValues: [] },
    { ...routing, resolvedValues: { bad: 42 } },
    { ...routing, state: 'future' },
  ]) {
    await expect(
      readAwsTerraformWorkflowStatus(
        plan,
        storage({
          'terraform-workflow.json': workflow,
          'terraform-routing-checkpoint.json': value,
        }),
      ),
    ).rejects.toThrow('routing checkpoint');
  }
});

test('reads exact current Terraform instances independently of routing checkpoints', async () => {
  const source = {
    ...plan,
    deploymentName: 'demo',
    topology: { nodeCount: 1 },
    intent: { siteName: 'site-a', topology: { nodeCount: 1 } },
  } as AwsCePlan;
  const id = 'i-0123456789abcdef0';
  const outputs = { ce_instances: { '1': { id, site_name: 'site-a', hostname: 'demo-1' } } };
  const identities = [{ address: 'aws_instance.node_1', type: 'aws_instance', id }];
  const session = { readOutputs: async () => outputs, readResourceIdentities: async () => identities };
  expect(await readAwsTerraformInstanceBindings(source, session, {})).toEqual({ __INSTANCE_1__: id });
  for (const invalid of [
    [],
    [...identities, ...identities],
    [{ ...identities[0], id: 'i-11111111111111111' }],
    [{ ...identities[0], address: 'aws_instance.foreign' }],
  ]) {
    await expect(
      readAwsTerraformInstanceBindings(source, { ...session, readResourceIdentities: async () => invalid }, {}),
    ).rejects.toThrow();
  }
  for (const value of [
    {},
    { '1': { id, site_name: 'foreign', hostname: 'demo-1' } },
    { '1': { id: '__INSTANCE__', site_name: 'site-a', hostname: 'demo-1' } },
    { ...outputs.ce_instances, '2': outputs.ce_instances['1'] },
  ]) {
    await expect(
      readAwsTerraformInstanceBindings(source, { ...session, readOutputs: async () => ({ ce_instances: value }) }, {}),
    ).rejects.toThrow();
  }
  await expect(readAwsTerraformInstanceBindings({ ...source, engine: 'native' }, session, {})).rejects.toThrow();
  await expect(readAwsTerraformInstanceBindings(source, { readOutputs: async () => outputs }, {})).rejects.toThrow();
  await expect(
    readAwsTerraformInstanceBindings(
      source,
      {
        ...session,
        readOutputs: async () => {
          throw Error('unavailable');
        },
      },
      {},
    ),
  ).rejects.toThrow('unavailable');
});
