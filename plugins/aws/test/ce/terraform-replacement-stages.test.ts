import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import type { PlanReceipt } from '../../../terraform/src/runner';
import { canonicalSha256 } from '../../src/ce/canonical';
import { compileAwsSiteReplacement } from '../../src/ce/site-replacement';
import { renderAwsTerraformFoundation } from '../../src/ce/terraform-foundation';
import {
  applyAwsTerraformReplacementStage,
  awsTerraformReplacementStages,
  inspectAwsTerraformReplacementStage,
} from '../../src/ce/terraform-replacement-stages';
import { siteBindings } from '../../src/ce/topology';
import { foundationPlan } from './terraform-fixtures';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const bootstrap = (name: string) =>
  `#cloud-config\nhostname: ${name}\nwrite_files:\n- path: /etc/vpm/user_data\n  content: fixture\n`;
function fixture(ha = false) {
  const { planId: _id, planSha256: _sha, ...draft } = foundationPlan(ha);
  const value = { ...draft, deploymentName: 'ce', accountId: '123456789012', region: 'us-east-1' };
  const digest = canonicalSha256(value);
  const base = { ...value, planId: `aws-ce-${digest.slice(0, 24)}`, planSha256: digest };
  const selected = siteBindings(base)[0];
  const preparation = {
    owner: selected.binding.owner,
    siteName: selected.site.name,
    uid: 'old-site',
    resourceVersion: 'one',
    contractFingerprint: `sha256:${'a'.repeat(64)}`,
    observedAt: new Date().toISOString(),
    source: `/api/config/namespaces/system/securemesh_site_v2s/${selected.site.name}`,
    deviceSource: `/api/register/namespaces/system/registrations_by_site/${selected.site.name}`,
    evidenceKind: 'preboot-interface-configuration-required',
    request: { metadata: { name: selected.site.name }, spec: {} },
    instances: Object.fromEntries(selected.binding.nodes.map((node, index) => [node, `i-${12345678 + index}`])),
    interfaces: selected.binding.nodes.flatMap((node, index) =>
      ['slo', 'sli'].map((role, nic) => ({
        node,
        role,
        mac: `02:00:00:00:0${index + 1}:0${nic + 1}`,
        device: `ens${5 + nic}`,
        mtu: 1500,
      })),
    ),
  };
  const replacement = compileAwsSiteReplacement(base, selected.site.name, preparation, {
    interfaceIds: Object.fromEntries(
      preparation.interfaces.map((iface, index) => [`${iface.node}/${iface.role}`, `eni-${12345678 + index}`]),
    ),
    elasticIpAllocationIds: Object.fromEntries(
      selected.binding.nodes.map((node, index) => [node, `eipalloc-${12345678 + index}`]),
    ),
    bootstrapTokenNames: Object.fromEntries(
      selected.binding.nodes.map((node, index) => [node, `observed-token-${index + 1}`]),
    ),
  });
  const original = JSON.parse(
    renderAwsTerraformFoundation(
      base,
      Object.fromEntries([1, 2, 3].map((node) => [String(node), bootstrap(`ce-${node}`)])),
    ),
  );
  // Existing routing configuration must survive both stages unchanged.
  original.resource.aws_ec2_transit_gateway_connect_peer = { existing: { peer_address: '10.0.4.10' } };
  const configuration = JSON.stringify(original);
  const stages = awsTerraformReplacementStages(base, replacement, configuration, hash(configuration));
  const material = Object.fromEntries(
    selected.binding.nodes.map((node) => [node, bootstrap(node).replace('fixture', 'new-fixture')]),
  );
  const receipt = (phase: 'quiesce' | 'launch'): PlanReceipt => ({
    schemaVersion: 1,
    engine: 'terraform',
    deploymentId: 'ce',
    backendIdentity: 'local:ce',
    configurationSha256: (phase === 'quiesce' ? stages.quiesce : stages.launch(material)).configurationSha256,
    providerLockSha256: 'a'.repeat(64),
    planSha256: 'b'.repeat(64),
    noChanges: false,
    changes: stages.quiesce.addresses.map((address) => ({
      address,
      type: address.split('.')[0],
      actions: [phase === 'quiesce' ? 'delete' : 'create'],
    })),
  });
  return { base, replacement, configuration, original, stages, material, receipt };
}

for (const ha of [false, true])
  test(`Terraform replacement preserves retained infrastructure for ${ha ? 'HA' : 'independent'} sites`, () => {
    const f = fixture(ha);
    const quiesced = JSON.parse(f.stages.quiesce.configuration);
    const launched = JSON.parse(f.stages.launch(f.material).configuration);
    expect(Object.keys(quiesced.resource.aws_instance)).toHaveLength(ha ? 0 : 2);
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
