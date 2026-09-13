import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import type { PlanReceipt } from '../../../terraform/src/runner';
import {
  applyAwsTerraformReplacementStage,
  awsTerraformReplacementStages,
  inspectAwsTerraformReplacementStage,
} from '../../src/ce/terraform-replacement-stages';

import { terraformReplacementFixture as fixture } from './terraform-replacement-fixtures';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

for (const ha of [false, true])
  test(`Terraform replacement preserves retained infrastructure for ${ha ? 'HA' : 'independent'} sites`, () => {
    const f = fixture(ha);
    const quiesced = JSON.parse(f.stages.quiesce.configuration);
    const launched = JSON.parse(f.stages.launch(f.material).configuration);
    expect(Object.keys(quiesced.resource.aws_instance ?? {})).toHaveLength(ha ? 0 : 2);
    if (ha) {
      expect(quiesced.resource).not.toHaveProperty('aws_instance');
      expect(quiesced.resource).not.toHaveProperty('aws_eip_association');
    }
    expect(Object.keys(quiesced.output.ce_instances.value)).toHaveLength(ha ? 0 : 2);
    for (const type of [
      'aws_network_interface',
      'aws_eip',
      'aws_subnet',
      'aws_security_group',
      'aws_ec2_transit_gateway_connect_peer',
    ]) {
      expect(quiesced.resource[type]).toEqual(f.original.resource[type]);
      expect(launched.resource[type]).toEqual(f.original.resource[type]);
    }
    expect(launched.provider).toEqual(f.original.provider);
    expect(launched.terraform).toEqual(f.original.terraform);
    expect(Object.keys(launched.resource.aws_instance)).toHaveLength(3);
    if (!ha) expect(launched.resource.aws_instance.node_2).toEqual(f.original.resource.aws_instance.node_2);
    expect(launched.resource.aws_instance.node_1.user_data_base64).toBe(
      Buffer.from(f.material['ce-1']).toString('base64'),
    );
    inspectAwsTerraformReplacementStage(f.stages.quiesce, f.receipt('quiesce'));
    inspectAwsTerraformReplacementStage(f.stages.launch(f.material), f.receipt('launch'));
  });

test('quiescing the only admitted independent site omits empty resource type labels', () => {
  const f = fixture();
  for (const node of [2, 3]) {
    delete f.original.resource.aws_instance[`node_${node}`];
    delete f.original.resource.aws_eip_association[`node_${node}`];
    delete f.original.output.ce_instances.value[String(node)];
  }
  const configuration = JSON.stringify(f.original);
  const stages = awsTerraformReplacementStages(f.base, f.replacement, configuration, hash(configuration));
  const quiesced = JSON.parse(stages.quiesce.configuration);
  expect(quiesced.resource).not.toHaveProperty('aws_instance');
  expect(quiesced.resource).not.toHaveProperty('aws_eip_association');
  expect(quiesced.resource.aws_network_interface).toEqual(f.original.resource.aws_network_interface);
  expect(quiesced.output.ce_instances.value).toEqual({});
  const launch = JSON.parse(stages.launch(f.material).configuration);
  expect(Object.keys(launch.resource.aws_instance)).toEqual(['node_1']);
  expect(Object.keys(launch.resource.aws_eip_association)).toEqual(['node_1']);
});

test('Terraform stage rejects retained-resource deletion, other-site mutation and combined replacement', () => {
  const f = fixture();
  for (const change of [
    { address: 'aws_network_interface.node_1_nic_0', type: 'aws_network_interface', actions: ['delete'] },
    { address: 'aws_instance.node_2', type: 'aws_instance', actions: ['delete'] },
    { address: 'aws_instance.node_1', type: 'aws_instance', actions: ['delete', 'create'] },
    { address: 'aws_instance.node_1', type: 'aws_instance', actions: ['update'] },
  ]) {
    const receipt = f.receipt('quiesce');
    receipt.changes = [change];
    expect(() => inspectAwsTerraformReplacementStage(f.stages.quiesce, receipt)).toThrow();
  }
});
test('Terraform stage rejects stale configuration, foreign engine and incomplete bootstrap', () => {
  const f = fixture();
  expect(() => awsTerraformReplacementStages(f.base, f.replacement, f.configuration, '0'.repeat(64))).toThrow('hash');
  expect(() =>
    awsTerraformReplacementStages(
      f.base,
      { ...f.replacement, engine: 'native' },
      f.configuration,
      hash(f.configuration),
    ),
  ).toThrow('engine');
  expect(() => f.stages.launch({})).toThrow('inventory');
  expect(() => f.stages.launch({ 'ce-1': '#cloud-config\nsecret: __UNRESOLVED__' })).toThrow('cloud-init');
});
test('Terraform stage refuses a primary ENI configured for deletion with its VM', () => {
  const f = fixture();
  f.original.resource.aws_instance.node_1.network_interface[0].delete_on_termination = true;
  const altered = JSON.stringify(f.original);
  expect(() => awsTerraformReplacementStages(f.base, f.replacement, altered, hash(altered))).toThrow(
    'retained network',
  );
});
test('Terraform stage persists and applies the exact saved receipt, including interrupted revision recovery', async () => {
  const f = fixture();
  const events: string[] = [];
  const receipt = f.receipt('quiesce');
  let revision = f.stages.quiesce.configurationSha256;
  const session = {
    readPlannedResourceIds: async () => ({}),
    readConfiguration: async () => f.configuration,
    readOutputs: async () => ({}),
    reviseConfiguration: async (expected: string, configuration: string) => {
      events.push('revision');
      if (expected !== revision) throw new Error('Terraform configuration revision is stale');
      revision = hash(configuration);
      return revision;
    },
    plan: async () => {
      events.push('plan');
      return receipt;
    },
    apply: async (value: PlanReceipt) => {
      events.push('apply');
      expect(value).toBe(receipt);
    },
  };
  expect(
    await applyAwsTerraformReplacementStage(
      session,
      f.stages.quiesce,
      async (value) => {
        events.push('persist');
        expect(value).toBe(receipt);
      },
      {},
    ),
  ).toBe(receipt);
  expect(events).toEqual(['revision', 'revision', 'plan', 'persist', 'apply']);
  receipt.changes = [{ address: 'aws_eip.node_1', type: 'aws_eip', actions: ['delete'] }];
  events.length = 0;
  await expect(
    applyAwsTerraformReplacementStage(
      session,
      f.stages.quiesce,
      async () => {
        events.push('persist');
      },
      {},
    ),
  ).rejects.toThrow('outside');
  expect(events).not.toContain('persist');
  expect(events).not.toContain('apply');
});

test('Terraform launch stage reconciles an applied plan after a lost response', async () => {
  const f = fixture();
  const stage = f.stages.launch(f.material);
  let current = stage.previousConfigurationSha256;
  let created = false;
  let creates = 0;
  const receipts: PlanReceipt[] = [];
  const session = {
    readPlannedResourceIds: async () => ({}),
    readConfiguration: async () => stage.configuration,
    readOutputs: async () => ({}),
    reviseConfiguration: async (expected: string, configuration: string) => {
      if (expected !== current) throw new Error('Terraform configuration revision is stale');
      current = hash(configuration);
      return current;
    },
    plan: async () => ({
      ...f.receipt('launch'),
      noChanges: created,
      changes: created ? [] : f.receipt('launch').changes,
    }),
    apply: async (receipt: PlanReceipt) => {
      expect(receipts.at(-1)).toBe(receipt);
      if (!created) {
        created = true;
        creates++;
        throw new Error('lost apply response');
      }
      expect(receipt.noChanges).toBe(true);
    },
  };
  const run = () =>
    applyAwsTerraformReplacementStage(
      session,
      stage,
      async (receipt) => {
        receipts.push(receipt);
      },
      {},
    );
  await expect(run()).rejects.toThrow('lost apply');
  expect((await run()).noChanges).toBe(true);
  expect(creates).toBe(1);
});

test('Terraform replacement refuses to apply when the saved-plan receipt cannot be persisted', async () => {
  const f = fixture();
  let applies = 0;
  const session = {
    readPlannedResourceIds: async () => ({}),
    readConfiguration: async () => f.configuration,
    readOutputs: async () => ({}),
    reviseConfiguration: async () => f.stages.quiesce.configurationSha256,
    plan: async () => f.receipt('quiesce'),
    apply: async () => {
      applies++;
    },
  };
  await expect(
    applyAwsTerraformReplacementStage(
      session,
      f.stages.quiesce,
      async () => {
        throw new Error('storage unavailable');
      },
      {},
    ),
  ).rejects.toThrow('storage unavailable');
  expect(applies).toBe(0);
});
