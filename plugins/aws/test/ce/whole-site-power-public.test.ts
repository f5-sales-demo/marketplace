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
async function fixture(
  engine: 'native' | 'terraform' = 'native',
  routingState: 'running' | 'partial' | 'complete' | 'missing' = 'complete',
  validOutput = true,
  interfaceDrift = false,
) {
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
    if (routingState !== 'missing')
      await store.write('terraform-routing-checkpoint.json', {
        schemaVersion: 2,
        engine,
        planId: nlb.base.planId,
        planSha256: nlb.base.planSha256,
        state: routingState,
        completedActionIds: [],
        resolvedValues: hardware.resolved,
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
      if (args[1] === 'describe-network-interfaces') {
        const body = JSON.parse(result.stdout);
        body.NetworkInterfaces = body.NetworkInterfaces.map((eni: Record<string, unknown>, index: number) => ({
          ...eni,
          VpcId: 'vpc-0123456789abcdef0',
          SubnetId: `subnet-0123456789abcdef${index}`,
          AvailabilityZone: 'us-east-1a',
          SourceDestCheck: false,
          PrivateIpAddress: `10.0.${index + 1}.10`,
        }));
        result.stdout = JSON.stringify(body);
      }
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
            ce_vpc_id: 'vpc-0123456789abcdef0',
            ce_interfaces: Object.fromEntries(
              hardware.enis.map((eni, index) => [
                `1:${index}`,
                {
                  node: 1,
                  index,
                  role: index ? 'sli' : 'slo',
                  site_name: nlb.base.topology.sites[0].name,
                  id: eni.NetworkInterfaceId,
                  mac: interfaceDrift && index === 1 ? '02:00:00:00:ff:01' : eni.MacAddress,
                  subnet_id: `subnet-0123456789abcdef${index}`,
                  private_ip: `10.0.${index + 1}.10`,
                },
              ]),
            ),
            ce_ingress: {
              load_balancer_arn: nlb.values.__NLB_ARN__,
              target_group_arn: nlb.values.__NLB_TARGET_GROUP_ARN__,
              listener_arn: nlb.values.__NLB_LISTENER_ARN__,
              port: validOutput ? nlb.base.intent.ingress?.port : 1,
              scheme: nlb.base.intent.ingress?.scheme,
            },
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
  if (prepared.isError) throw Error(prepared.content[0].text);
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

test('public Terraform power resolves current NLB outputs with retained running routing progress', async () => {
  const f = await fixture('terraform', 'running');
  const prepared = await f.run({ ...f.base, operation: 'prepare-stop' });
  if (prepared.isError) throw Error(prepared.content[0].text);
  expect(prepared.isError).toBe(false);
  const ref = (prepared.details as { power: { planId: string } }).power;
  const saved = (await f.store.read(`${ref.planId}.json`)) as {
    bindings: { servicesInventory: { components: Array<{ kind: string }> } };
  };
  expect(saved.bindings.servicesInventory.components.some((row) => row.kind === 'nlb')).toBe(true);
  expect(f.nlb.calls.some((args) => args[1] === 'deregister-targets')).toBe(false);
});

test('public Terraform power rejects partial routing and current output drift before mutation', async () => {
  for (const f of [await fixture('terraform', 'partial'), await fixture('terraform', 'running', false)]) {
    const result = await f.run({ ...f.base, operation: 'prepare-stop' });
    expect(result.isError).toBe(true);
    expect(f.nlb.calls.some((args) => args[1] === 'deregister-targets')).toBe(false);
  }
});

test('public Terraform NLB-only power resolves owned execution without a routing checkpoint', async () => {
  const f = await fixture('terraform', 'missing');
  const prepared = await f.run({ ...f.base, operation: 'prepare-stop' });
  if (prepared.isError) throw Error(prepared.content[0].text);
  expect(prepared.isError).toBe(false);
  expect(f.nlb.calls.some((args) => args[1] === 'deregister-targets')).toBe(false);
});

for (const state of ['running', 'complete'] as const)
  test(`public Terraform power rejects current interface output drift with ${state} checkpoint`, async () => {
    const f = await fixture('terraform', state, true, true);
    const result = await f.run({ ...f.base, operation: 'prepare-stop' });
    expect(result.isError).toBe(true);
    expect(f.nlb.calls.some((args) => args[1] === 'deregister-targets')).toBe(false);
  });

test('public Terraform power rejects retained interface binding drift despite matching current cloud outputs', async () => {
  const f = await fixture('terraform');
  const name = 'terraform-routing-checkpoint.json';
  const checkpoint = (await f.store.read(name)) as { resolvedValues: Record<string, string> };
  checkpoint.resolvedValues.__ENI_1_1_MAC__ = '02:00:00:00:ff:01';
  await f.store.write(name, checkpoint);
  const result = await f.run({ ...f.base, operation: 'prepare-stop' });
  expect(result.isError).toBe(true);
  expect(result.content[0].text).toContain('retained routing bindings');
  expect(f.nlb.calls.some((args) => args[1] === 'deregister-targets')).toBe(false);
});
