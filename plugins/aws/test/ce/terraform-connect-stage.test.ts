import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import type { TerraformSession } from '../../../terraform/src/service';
import { applyAwsTerraformConnectStage } from '../../src/ce/terraform-connect-stage';
import { renderAwsTerraformFoundation } from '../../src/ce/terraform-foundation';
import { connectFixture } from './terraform-connect-fixture';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function fixture() {
  const f = connectFixture();
  let configuration = renderAwsTerraformFoundation(f.plan, f.bootstrap);
  const original = configuration;
  const records = new Map<string, unknown>([
    [
      'terraform-admission.json',
      {
        schemaVersion: 1,
        planSha256: f.plan.planSha256,
        configurationSha256: hash(configuration),
        admittedSites: ['site-1', 'site-2', 'site-3'],
        bootstrapByNode: f.bootstrap,
      },
    ],
  ]);
  let fail = false;
  let interrupted = false;
  let applies = 0;
  const storage = {
    async verify() {},
    async read(name: string) {
      return structuredClone(records.get(name));
    },
    async write(name: string, value: unknown) {
      records.set(name, structuredClone(value));
    },
  };
  const session: TerraformSession = {
    async readOutputs() {
      return {};
    },
    async reviseConfiguration(expected, next) {
      if (interrupted) throw new Error('Reconcile interrupted Terraform apply before revising configuration');
      if (expected !== hash(configuration)) throw new Error('Terraform configuration revision is stale');
      configuration = next;
      return hash(next);
    },
    async plan() {
      return {
        schemaVersion: 1,
        engine: 'terraform',
        deploymentId: 'ce',
        backendIdentity: 'local:ce',
        configurationSha256: hash(configuration),
        providerLockSha256: 'lock',
        planSha256: 'binary',
        changes: [
          {
            address: 'aws_ec2_transit_gateway_connect.peer',
            type: 'aws_ec2_transit_gateway_connect',
            actions: ['create'],
          },
        ],
        noChanges: false,
      };
    },
    async apply() {
      applies++;
      if (fail) {
        fail = false;
        interrupted = true;
        throw new Error('response lost');
      }
      interrupted = false;
    },
  };
  const run = () => applyAwsTerraformConnectStage(f.plan, f.observation, session, storage, async () => {}, {});
  return {
    ...f,
    storage,
    session,
    run,
    original,
    configuration: () => configuration,
    applies: () => applies,
    interrupt: () => {
      fail = true;
    },
  };
}
test('Connect stage preserves admitted nodes and checkpoints exact desired configuration', async () => {
  const f = fixture();
  await f.run();
  expect(JSON.parse(f.configuration()).resource.aws_instance).toEqual(JSON.parse(f.original).resource.aws_instance);
  expect(await f.storage.read('terraform-connect-stage.json')).toHaveProperty('stage', 'applied');
  await f.run();
  expect(f.applies()).toBe(2);
});
test('Connect stage reconciles interrupted apply without reverting to foundation configuration', async () => {
  const f = fixture();
  f.interrupt();
  await expect(f.run()).rejects.toThrow('response lost');
  const desired = f.configuration();
  expect(await f.storage.read('terraform-connect-stage.json')).toHaveProperty('stage', 'pending');
  await f.run();
  expect(f.configuration()).toBe(desired);
  expect(await f.storage.read('terraform-connect-stage.json')).toHaveProperty('stage', 'applied');
});
test('Connect stage refuses existing-resource replacement', async () => {
  const f = fixture();
  const plan = f.session.plan;
  f.session.plan = async (...args) => ({
    ...(await plan(...args)),
    changes: [{ address: 'aws_instance.node_1', type: 'aws_instance', actions: ['delete', 'create'] }],
  });
  await expect(f.run()).rejects.toThrow('existing resource');
  expect(f.applies()).toBe(0);
});
