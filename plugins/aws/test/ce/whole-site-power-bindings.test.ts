import { expect, test } from 'bun:test';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import { buildAwsWholeSitePowerPlan } from '../../src/ce/whole-site-power';
import { collectAwsPowerBindings } from '../../src/ce/whole-site-power-bindings';
import { powerIdentityFixture } from './whole-site-power-fixtures';
import { nlbPowerFixture } from './whole-site-power-nlb-fixtures';

async function fixture(engine: 'native' | 'terraform' = 'native') {
  const f = await nlbPowerFixture(engine);
  const identity = powerIdentityFixture(engine);
  let afterServices = false,
    drift = false;
  const api = {
    exec: async (command: string, args: string[]) => {
      if (args[0] === 'elbv2') afterServices = true;
      if (afterServices && drift) identity.enis[0].MacAddress = '02:11:22:33:44:55';
      const result = await (args[0] === 'elbv2' ? f.api : identity.api).exec(command, args);
      return { ...result, stdout: result.stdout.replaceAll(identity.base.planSha256, f.base.planSha256) };
    },
  };
  return {
    ...f,
    api,
    values: { ...f.values, ...identity.resolved },
    runtime: identity.runtime as CeRuntime,
    drift: () => {
      drift = true;
    },
    foreign: identity.identity,
  };
}
for (const engine of ['native', 'terraform'] as const)
  test(`${engine} complete bindings retain all service and node identities`, async () => {
    const f = await fixture(engine);
    const value = await collectAwsPowerBindings(f.base, f.values, f.api, f.runtime);
    const plan = buildAwsWholeSitePowerPlan(f.base, 'stop', value.bindings, '11111111-1111-4111-8111-111111111111');
    expect(plan.bindings.servicesInventory?.components.map((row) => row.kind)).toEqual(['nlb']);
    expect(value.status).toBe('active');
    expect(value.cloud).toBe('running');
    expect(value.freshness).toBe('unqualified');
    expect(value.traffic).toBe('unknown');
    f.membership([]);
    const stoppedMembership = await collectAwsPowerBindings(f.base, f.values, f.api, f.runtime);
    expect(stoppedMembership.bindings).toEqual(value.bindings);
    expect(stoppedMembership.status).toBe('withdrawn');
  });
test('complete bindings reject identity changed during service collection', async () => {
  const f = await fixture();
  f.drift();
  await expect(collectAwsPowerBindings(f.base, f.values, f.api, f.runtime)).rejects.toThrow();
});
test('complete bindings reject foreign owner before service discovery', async () => {
  const f = await fixture();
  f.foreign();
  await expect(collectAwsPowerBindings(f.base, f.values, f.api, f.runtime)).rejects.toThrow();
  expect(f.calls).toEqual([]);
});
