import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Type } from '@sinclair/typebox';
import { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { CePlatformService } from '../../../platform/src/ce/service';
import { saveAwsCheckpoint, saveAwsPlan } from '../../src/ce/artifacts';
import { createAwsCePowerTool } from '../../src/tools/aws-ce-power';
import { powerIdentityFixture } from './whole-site-power-fixtures';
import { nlbPowerFixture } from './whole-site-power-nlb-fixtures';

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true });
});
async function fixture(engine: 'native' | 'terraform' = 'native') {
  const nlb = await nlbPowerFixture(engine),
    hardware = powerIdentityFixture(engine);
  const dir = await mkdtemp(join(tmpdir(), 'public-ce-power-'));
  dirs.push(dir);
  const identity = await hardware.read();
  const store = await CeDeploymentStore.open(dir, identity.owner);
  const artifacts = join(dir, 'artifacts');
  await import('node:fs/promises').then((fs) => fs.mkdir(artifacts));
  const session = {
    getSessionId: () => dir,
    getArtifactsDir: () => artifacts,
    getArtifactPath: async () => null,
    saveArtifact: async (content: string, kind: string) => {
      const file = join(artifacts, `${Date.now()}.${kind}.log`);
      await Bun.write(file, content);
      return file;
    },
  };
  await saveAwsPlan(session, nlb.base, {} as never);
  await saveAwsCheckpoint(session, {
    schemaVersion: 2,
    engine,
    planId: nlb.base.planId,
    planSha256: nlb.base.planSha256,
    state: 'complete',
    completedActionIds: [],
    resolvedValues: { ...nlb.values, ...hardware.resolved },
  } as never);
  if (engine === 'terraform') {
    await store.write('terraform-workflow.json', {
      schemaVersion: 1,
      engine,
      planSha256: nlb.base.planSha256,
      stage: 'registered',
    });
    await store.write('terraform-routing-checkpoint.json', {
      schemaVersion: 2,
      engine,
      planId: nlb.base.planId,
      planSha256: nlb.base.planSha256,
      state: 'complete',
      completedActionIds: [],
      resolvedValues: { ...nlb.values, ...hardware.resolved },
    });
  }
  const runtime = {
    ...hardware.runtime,
    contract: { fingerprint: 'fixture-contract' },
    observeOwnedSite: async () => ({ system_metadata: { uid: 'one' }, spec: { unchanged: true } }),
    observeHealth: async () => ({ status: 'healthy', siteUid: 'one' }),
    observeRegistrations: async () => ({ status: 'healthy' }),
    observeAwsRegisteredConfiguration: async () => ({ status: 'unknown' }),
    observePowerVersions: async () => ({ status: 'observed', siteUid: 'one', stable: true }),
    observeAwsInterfaces: async () => ({ status: 'unknown', interfaces: [] }),
  } as unknown as CeRuntime;
  const api = {
    exec: async (command: string, args: string[]) => {
      const result = await (args[0] === 'elbv2' ? nlb.api : hardware.api).exec(command, args);
      return { ...result, stdout: result.stdout.replaceAll(hardware.base.planSha256, nlb.base.planSha256) };
    },
  };
  const platform = { storage: async () => store, runtime: async () => runtime } as unknown as CePlatformService;
  const tool = createAwsCePowerTool({ typebox: { Type } } as never, {
    platform: async () => platform,
    makeApi: () => api,
    terraform: async () => {
      if (engine !== 'terraform') throw Error('wrong engine');
      return {
        open: async () => ({
          readOutputs: async () => ({
            ce_instances: {
              '1': {
                id: hardware.instance.InstanceId,
                site_name: nlb.base.topology.sites[0].name,
                hostname: `${nlb.base.deploymentName}-1`,
              },
            },
          }),
          readResourceIdentities: async () => [
            { type: 'aws_instance', address: 'aws_instance.node_1', id: hardware.instance.InstanceId },
          ],
        }),
      } as never;
    },
  });
  const ctx = {
    cwd: dir,
    hasUI: false,
    ui: {
      confirm: async () => {
        throw Error('headless');
      },
    },
    sessionManager: session,
  };
  const base = { basePlanId: nlb.base.planId, basePlanSha256: nlb.base.planSha256 };
  return {
    tool,
    ctx,
    base,
    nlb,
    store,
    run: (params: Parameters<typeof tool.execute>[1]) => tool.execute('call', params, undefined, undefined, ctx),
  };
}
test('public native power prepares exact private plan then applies truthful pending gates', async () => {
  const f = await fixture();
  const prepared = await f.run({ ...f.base, operation: 'prepare-stop' });
  expect(prepared.isError).not.toBe(true);
  const details = prepared.details as { power: { planId: string; planSha256: string; operation: string } };
  expect(details.power.operation).toBe('stop');
  const saved = (await f.store.read(`${details.power.planId}.json`)) as { planSha256: string };
  expect(saved.planSha256).toBe(details.power.planSha256);
  const result = await f.run({
    ...f.base,
    operation: 'apply',
    powerPlanId: details.power.planId,
    powerPlanSha256: details.power.planSha256,
  });
  expect(result.isError).not.toBe(true);
  expect((result.details as { power: { status: string } }).power.status).toBe('power-pending');
  expect(f.nlb.calls.some((args) => args[1] === 'deregister-targets')).toBe(false);
});
test('public power rejects caller evidence, missing hashes and absent stopped maintenance', async () => {
  const f = await fixture();
  for (const params of [
    { ...f.base, operation: 'prepare-stop', evidence: {} },
    { ...f.base, operation: 'apply' },
    { ...f.base, operation: 'prepare-start', stopPlanId: 'missing', stopPlanSha256: 'a'.repeat(64) },
  ])
    expect((await f.run(params as never)).isError).toBe(true);
});

test('public Terraform power preserves provider ownership and pending qualification', async () => {
  const f = await fixture('terraform');
  const prepared = await f.run({ ...f.base, operation: 'prepare-stop' });
  expect(prepared.isError).toBe(false);
  const ref = (prepared.details as { power: { planId: string; planSha256: string; engine: string } }).power;
  expect(ref.engine).toBe('terraform');
  const result = await f.run({
    ...f.base,
    operation: 'apply',
    powerPlanId: ref.planId,
    powerPlanSha256: ref.planSha256,
  });
  expect(result.isError).toBe(false);
  expect((result.details as { power: { status: string } }).power.status).toBe('power-pending');
  expect(f.nlb.calls.some((args) => args[1] === 'deregister-targets')).toBe(false);
});
