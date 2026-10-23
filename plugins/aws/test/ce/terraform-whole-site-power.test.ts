import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { canonicalSha256 } from '../../src/ce/canonical';
import { AWS_CE_PROVIDER_LOCK_SHA256 } from '../../src/ce/execution-contract';
import {
  reviseAwsTerraformPowerConfiguration,
  validateAwsTerraformPowerReceipt,
} from '../../src/ce/terraform-whole-site-power';
import { buildAwsWholeSitePowerPlan } from '../../src/ce/whole-site-power';
import { powerIdentityFixture } from './whole-site-power-fixtures';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
async function fixture() {
  const f = powerIdentityFixture('terraform');
  const identity = await f.read();
  const bindings = {
    sourcePlanSha256: f.base.planSha256,
    owner: identity.owner,
    nodes: identity.nodes,
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
  const start = buildAwsWholeSitePowerPlan(f.base, 'start', bindings, stop.transitionId, {
    ...body,
    receiptSha256: canonicalSha256(body),
  });
  const source = JSON.stringify({
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
            'ves-io-site-name': bindings.nodes[0].siteName,
          },
        },
      },
      aws_network_interface: { node_1_nic_0: { source_dest_check: false } },
    },
    output: { retained: { value: 'same' } },
  });
  const revise = (configuration: string, plan = stop, effect: 'stop' | 'start' | 'release' = 'stop') =>
    reviseAwsTerraformPowerConfiguration(f.base, plan, configuration, effect);
  return { ...f, stop, start, source, revise };
}
test('power revisions retain private configuration and only add/update/remove the exact control', async () => {
  const f = await fixture();
  const stopped = f.revise(f.source);
  const parsed = JSON.parse(stopped.configuration);
  expect(parsed.resource.aws_ec2_instance_state.ce_power_1).toEqual({
    instance_id: f.instance.InstanceId,
    state: 'stopped',
    force: false,
  });
  const { aws_ec2_instance_state, ...resources } = parsed.resource;
  expect(resources).toEqual(JSON.parse(f.source).resource);
  expect(parsed.output).toEqual(JSON.parse(f.source).output);
  expect(parsed.resource.aws_instance.node_1.user_data_base64).toBe('private-bootstrap');
  const running = f.revise(stopped.configuration, f.start, 'start');
  expect(JSON.parse(running.configuration).resource.aws_ec2_instance_state.ce_power_1.state).toBe('running');
  const released = f.revise(running.configuration, f.start, 'release');
  expect(JSON.parse(released.configuration)).toEqual(JSON.parse(f.source));
  expect(f.revise(stopped.configuration).configuration).toBe(stopped.configuration);
});
for (const drift of [
  'owner',
  'engine',
  'plan',
  'node',
  'site',
  'account',
  'region',
  'provider',
  'foreign-control',
  'force',
  'wrong-instance',
])
  test(`configuration ${drift} rejects`, async () => {
    const f = await fixture();
    const stopped = f.revise(f.source);
    const c = JSON.parse(drift === 'force' || drift === 'wrong-instance' ? stopped.configuration : f.source);
    const tags = c.resource.aws_instance.node_1.tags;
    if (drift === 'owner') tags['xcsh-deployment-id'] = 'foreign';
    else if (drift === 'engine') tags['xcsh-execution-engine'] = 'native';
    else if (drift === 'plan') tags['xcsh-plan-sha256'] = 'f'.repeat(64);
    else if (drift === 'node') tags['xcsh-node-index'] = '2';
    else if (drift === 'site') tags['ves-io-site-name'] = 'foreign';
    else if (drift === 'account') c.provider.aws.allowed_account_ids = ['999999999999'];
    else if (drift === 'region') c.provider.aws.region = 'us-west-2';
    else if (drift === 'provider') c.terraform.required_providers.aws.version = '= 1.0.0';
    else if (drift === 'foreign-control')
      c.resource.aws_ec2_instance_state = { foreign: { instance_id: f.instance.InstanceId, state: 'stopped' } };
    else if (drift === 'force') c.resource.aws_ec2_instance_state.ce_power_1.force = true;
    else c.resource.aws_ec2_instance_state.ce_power_1.instance_id = 'i-11111111111111111';
    expect(() => f.revise(JSON.stringify(c))).toThrow();
    expect(f.calls.every((a) => !a.includes('stop-instances'))).toBe(true);
  });
test('start and release require an existing bound stopped/running power control', async () => {
  const f = await fixture();
  expect(() => f.revise(f.source, f.start, 'start')).toThrow();
  expect(() => f.revise(f.source, f.start, 'release')).toThrow();
  const stopped = f.revise(f.source);
  expect(() => f.revise(stopped.configuration, f.start, 'release')).toThrow();
  expect(() => f.revise(stopped.configuration, f.stop, 'start')).toThrow();
});
async function planFixture() {
  const f = await fixture();
  const revision = f.revise(f.source);
  const receipt = {
    schemaVersion: 1 as const,
    deploymentId: f.base.deploymentName,
    engine: 'terraform' as const,
    backendIdentity: `local:${f.base.deploymentName}`,
    configurationSha256: hash(revision.configuration),
    providerLockSha256: AWS_CE_PROVIDER_LOCK_SHA256,
    planSha256: 'a'.repeat(64),
    changes: [{ address: 'aws_ec2_instance_state.ce_power_1', type: 'aws_ec2_instance_state', actions: ['create'] }],
    noChanges: false,
  };
  const fields = {
    'aws_ec2_instance_state.ce_power_1': { instance_id: f.instance.InstanceId, state: 'stopped', force: false },
  };
  return {
    ...f,
    revision,
    receipt,
    fields,
    validate: () => validateAwsTerraformPowerReceipt(f.base, f.stop, 'stop', revision, receipt, fields),
  };
}
test('exact saved plan control creation is admitted', async () => {
  const f = await planFixture();
  expect(() => f.validate()).not.toThrow();
});
for (const drift of [
  'replacement',
  'extra',
  'no-changes',
  'unknown-instance',
  'force',
  'config',
  'lock',
  'backend',
  'action',
])
  test(`saved power plan ${drift} rejects`, async () => {
    const f = await planFixture();
    if (drift === 'replacement') f.receipt.changes[0].actions = ['delete', 'create'];
    else if (drift === 'extra')
      f.receipt.changes.push({ address: 'aws_instance.node_1', type: 'aws_instance', actions: ['update'] });
    else if (drift === 'no-changes') f.receipt.noChanges = true;
    else if (drift === 'unknown-instance') f.fields['aws_ec2_instance_state.ce_power_1'].instance_id = '__INSTANCE_1__';
    else if (drift === 'force') f.fields['aws_ec2_instance_state.ce_power_1'].force = true;
    else if (drift === 'config') f.receipt.configurationSha256 = 'b'.repeat(64);
    else if (drift === 'lock') f.receipt.providerLockSha256 = 'b'.repeat(64);
    else if (drift === 'backend') f.receipt.backendIdentity = 'local:foreign';
    else Object.assign(f.receipt, { actionInvocations: [{ address: 'action.aws_ec2_stop_instance.foreign' }] });
    expect(() => f.validate()).toThrow();
  });

test('start update and release deletion admit only their exact control and resolved projection', async () => {
  const f = await fixture();
  const stop = f.revise(f.source);
  const start = f.revise(stop.configuration, f.start, 'start');
  const receipt = {
    schemaVersion: 1 as const,
    deploymentId: f.base.deploymentName,
    engine: 'terraform' as const,
    backendIdentity: `local:${f.base.deploymentName}`,
    configurationSha256: start.afterSha256,
    providerLockSha256: AWS_CE_PROVIDER_LOCK_SHA256,
    planSha256: 'a'.repeat(64),
    changes: [{ address: start.address, type: 'aws_ec2_instance_state', actions: ['update'] }],
    noChanges: false,
  };
  const fields = { [start.address]: { instance_id: f.instance.InstanceId, state: 'running', force: false } };
  expect(() => validateAwsTerraformPowerReceipt(f.base, f.start, 'start', start, receipt, fields)).not.toThrow();
  const release = f.revise(start.configuration, f.start, 'release');
  const removal = {
    ...receipt,
    configurationSha256: release.afterSha256,
    changes: [{ address: release.address, type: 'aws_ec2_instance_state', actions: ['delete'] }],
  };
  expect(() =>
    validateAwsTerraformPowerReceipt(f.base, f.start, 'release', release, removal, { [release.address]: null }),
  ).not.toThrow();
  expect(() => validateAwsTerraformPowerReceipt(f.base, f.start, 'release', release, removal, fields)).toThrow();
  expect(() =>
    validateAwsTerraformPowerReceipt(
      f.base,
      f.start,
      'start',
      start,
      { ...receipt, changes: [...receipt.changes, ...receipt.changes] },
      fields,
    ),
  ).toThrow();
});
test('mutation guard rejects native engine and missing VM source before revision', async () => {
  const f = await fixture();
  const native = powerIdentityFixture('native');
  expect(() => reviseAwsTerraformPowerConfiguration(native.base, f.stop, f.source, 'stop')).toThrow();
  const c = JSON.parse(f.source);
  delete c.resource.aws_instance.node_1;
  expect(() => f.revise(JSON.stringify(c))).toThrow();
});

test('saved power plans allow unchanged foundation rows but reject duplicate or changing support rows', async () => {
  const f = await planFixture();
  f.receipt.changes.push({ address: 'aws_instance.node_1', type: 'aws_instance', actions: ['no-op'] });
  expect(() => f.validate()).not.toThrow();
  f.receipt.changes.push({ address: 'aws_instance.node_1', type: 'aws_instance', actions: ['no-op'] });
  expect(() => f.validate()).toThrow();
});
