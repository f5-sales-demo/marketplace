import { expect, test } from 'bun:test';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import { canonicalSha256 } from '../../src/ce/canonical';
import { collectAwsPowerServiceInventory } from '../../src/ce/whole-site-power-service-inventory';
import { bgpPowerFixture } from './whole-site-power-bgp-fixtures';
import { nlbPowerFixture } from './whole-site-power-nlb-fixtures';

for (const engine of ['native', 'terraform'] as const)
  test(`composed ${engine} BGP service inventory retains identity across withdrawal`, async () => {
    const f = bgpPowerFixture(engine);
    const up = await collectAwsPowerServiceInventory(f.base, f.values, f.api, f.runtime);
    expect(up.status).toBe('active');
    expect(up.components.map((row) => row.kind)).toEqual(['bgp']);
    expect(up.freshness).toBe('unqualified');
    expect(up.traffic).toBe('unknown');
    f.withdraw();
    const retained = up.bgpBindings;
    const snapshot = f.snapshot(f.wire.bgp.name);
    snapshot.spec = retained?.[0].revision.bgpSpec;
    const down = await collectAwsPowerServiceInventory(f.base, f.values, f.api, f.runtime, undefined, retained);
    expect(down.status).toBe('withdrawn');
    expect(down.servicesSha256).toBe(up.servicesSha256);
  });
test('service composition rejects an unobserved requested routing profile', async () => {
  const f = bgpPowerFixture(),
    { planId: _id, planSha256: _sha, ...body } = f.base;
  body.intent = {
    ...body.intent,
    routing: { ...body.intent.routing, profile: 'unqualified' as typeof body.intent.routing.profile },
  };
  const sha = canonicalSha256(body),
    base = { ...body, planSha256: sha, planId: `aws-ce-${sha.slice(0, 24)}` };
  await expect(collectAwsPowerServiceInventory(base, f.values, f.api, f.runtime)).rejects.toThrow('profile');
});
test('service composition rejects missing generated execution identifiers', async () => {
  const f = bgpPowerFixture();
  delete f.values[`__XC_ROUTING_${f.wire.bgp.name}__`];
  await expect(collectAwsPowerServiceInventory(f.base, f.values, f.api, f.runtime)).rejects.toThrow();
});

for (const engine of ['native', 'terraform'] as const)
  test(`composed ${engine} NLB membership keeps traffic unknown`, async () => {
    const f = await nlbPowerFixture(engine),
      runtime = {} as CeRuntime;
    const active = await collectAwsPowerServiceInventory(f.base, f.values, f.api, runtime);
    expect(active.status).toBe('active');
    expect(active.components.map((row) => row.kind)).toEqual(['nlb']);
    f.membership([]);
    const withdrawn = await collectAwsPowerServiceInventory(f.base, f.values, f.api, runtime);
    expect(withdrawn.status).toBe('withdrawn');
    expect(withdrawn.servicesSha256).toBe(active.servicesSha256);
    expect(withdrawn.traffic).toBe('unknown');
  });
test('combined BGP and NLB services cannot pass a partial withdrawal', async () => {
  const bgp = bgpPowerFixture(),
    nlb = await nlbPowerFixture();
  const { planId: _id, planSha256: _sha, ...body } = bgp.base;
  body.intent = { ...body.intent, ingress: nlb.base.intent.ingress };
  const sha = canonicalSha256(body),
    base = { ...body, planSha256: sha, planId: `aws-ce-${sha.slice(0, 24)}` };
  const values = { ...bgp.values, ...nlb.values };
  const api = {
    exec: async (command: string, args: string[]) => {
      const result = await (args[0] === 'elbv2' ? nlb.api : bgp.api).exec(command, args);
      return {
        ...result,
        stdout: result.stdout.replaceAll(bgp.base.planSha256, sha).replaceAll(nlb.base.planSha256, sha),
      };
    },
  };
  const active = await collectAwsPowerServiceInventory(base, values, api, bgp.runtime);
  expect(active.components.map((row) => row.kind)).toEqual(['bgp', 'nlb']);
  expect(active.status).toBe('active');
  bgp.withdraw();
  bgp.snapshot(bgp.wire.bgp.name).spec = active.bgpBindings?.[0].revision.bgpSpec;
  const partial = await collectAwsPowerServiceInventory(base, values, api, bgp.runtime, undefined, active.bgpBindings);
  expect(partial.status).toBe('pending');
  nlb.membership([]);
  const complete = await collectAwsPowerServiceInventory(base, values, api, bgp.runtime, undefined, active.bgpBindings);
  expect(complete.status).toBe('withdrawn');
  expect(complete.servicesSha256).toBe(active.servicesSha256);
});
