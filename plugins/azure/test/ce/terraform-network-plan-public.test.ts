import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PluginInterface } from '../../src/az/types';
import {
  loadPlanArtifact,
  type SessionManagerLike,
  saveDiscoveryArtifact,
  savePlanArtifact,
} from '../../src/ce/artifacts';
import { compileAzureCePlan } from '../../src/ce/planner';
import type { AzureCePlan } from '../../src/ce/types';
import { createAzureCePlanTool } from '../../src/tools/azure-ce-plan';
import { networkUpdateFixture } from './network-update-fixture';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true });
});
async function fixture(ha = false) {
  const f = networkUpdateFixture(ha, 'terraform', true, false),
    root = await mkdtemp(join(tmpdir(), 'ce-tf-network-plan-'));
  roots.push(root);
  let seq = 0,
    cloudCalls = 0;
  const paths = new Map<string, string>();
  const session: SessionManagerLike = {
    getSessionId: () => root,
    getArtifactsDir: () => root,
    getArtifactPath: async (id) => paths.get(id) ?? null,
    saveArtifact: async (content, type) => {
      const id = String(++seq),
        p = join(root, `${id.padStart(6, '0')}.${type}.log`);
      await writeFile(p, content);
      paths.set(id, p);
      return id;
    },
  };
  const type = new Proxy({}, { get: () => () => ({}) });
  const tool = createAzureCePlanTool({ typebox: { Type: type } } as unknown as PluginInterface, () => {
    cloudCalls++;
    throw Error('planning cannot query provider');
  });
  const discoveryArtifactId = await saveDiscoveryArtifact(session, f.current);
  if (!discoveryArtifactId) throw Error('missing discovery');
  await savePlanArtifact(session, f.original, f.current);
  const run = (intent = f.plan.intent, retained?: AzureCePlan, extra = {}) =>
    tool.execute(
      'test',
      {
        discoveryArtifactId,
        intent,
        ...(retained ? { retainedDeployment: { planId: retained.planId, planSha256: retained.planSha256 } } : {}),
        ...extra,
      },
      undefined,
      undefined,
      { cwd: root, sessionManager: session },
    );
  return { ...f, root, session, run, cloudCalls: () => cloudCalls };
}
for (const ha of [false, true])
  test(`actual public Terraform network planner persists first and A-B-A-B predecessors HA=${ha}`, async () => {
    const f = await fixture(ha);
    const first = await f.run(f.plan.intent, f.original);
    expect(first.isError).toBeUndefined();
    const b = first.details.plan;
    if (!b) throw Error('missing public Terraform plan');
    expect(b.terraformNetworkProfile?.retainedPlanSha256).toBe(f.original.planSha256);
    expect((await loadPlanArtifact(f.session, b.planId, b.planSha256)).plan).toEqual(b);
    const restore = { ...structuredClone(f.original.intent), operation: 'update-network' as const };
    const restored = await f.run(restore, b);
    expect(restored.isError).toBeUndefined();
    const a = restored.details.plan;
    if (!a) throw Error('missing restored plan');
    const repeated = await f.run(f.plan.intent, a);
    expect(repeated.isError).toBeUndefined();
    const again = repeated.details.plan;
    if (!again) throw Error('missing repeated plan');
    expect(new Set([b.planSha256, a.planSha256, again.planSha256]).size).toBe(3);
    expect(a.terraformNetworkProfile?.retainedPlanSha256).toBe(b.planSha256);
    expect(again.terraformNetworkProfile?.retainedPlanSha256).toBe(a.planSha256);
    expect(again.terraformNetworkProfile?.originalPlanSha256).toBe(f.original.planSha256);
    expect(f.cloudCalls()).toBe(0);
  });
test('public Terraform network planning requires exact retained plan identity', async () => {
  const f = await fixture();
  const r = await f.run();
  expect(r.isError).toBe(true);
  expect(r.details.plan).toBeUndefined();
  expect(f.cloudCalls()).toBe(0);
});
test('public Terraform network planning rejects unavailable retained artifact without provider calls', async () => {
  const f = await fixture();
  const r = await f.run(f.plan.intent, undefined, {
    retainedDeployment: { planId: `azure-ce-${'a'.repeat(24)}`, planSha256: 'a'.repeat(64) },
  });
  expect(r.isError).toBe(true);
  expect(f.cloudCalls()).toBe(0);
});
test('public Terraform network planning rejects a retained native creation', async () => {
  const f = await fixture();
  const native = networkUpdateFixture(false, 'native', true, false).original;
  await savePlanArtifact(f.session, native, f.current);
  const r = await f.run(f.plan.intent, native);
  expect(r.isError).toBe(true);
  expect(f.cloudCalls()).toBe(0);
});
test('public Terraform network planning rejects extra retained selector fields', async () => {
  const f = await fixture();
  const r = await f.run(f.plan.intent, undefined, {
    retainedDeployment: { planId: f.original.planId, planSha256: f.original.planSha256, extra: true },
  });
  expect(r.isError).toBe(true);
  expect(f.cloudCalls()).toBe(0);
});

for (const ha of [false, true])
  test(`public Terraform network planning after initial replacement binds explicit original HA=${ha}`, async () => {
    const f = await fixture(ha);
    const r = compileAzureCePlan(
      { ...f.original.intent, operation: 'replace-node', replacementNode: ha ? 2 : 1 },
      f.current,
    );
    await savePlanArtifact(f.session, r, f.current);
    const result = await f.run(f.plan.intent, r, {
      originalDeployment: { planId: f.original.planId, planSha256: f.original.planSha256 },
    });
    expect(result.isError).toBeUndefined();
    expect(result.details.plan?.terraformNetworkProfile).toMatchObject({
      originalPlanSha256: f.original.planSha256,
      retainedPlanSha256: r.planSha256,
    });
    expect(f.cloudCalls()).toBe(0);
  });
test('public Terraform network planning after initial replacement requires explicit original', async () => {
  const f = await fixture();
  const r = compileAzureCePlan({ ...f.original.intent, operation: 'replace-node', replacementNode: 1 }, f.current);
  await savePlanArtifact(f.session, r, f.current);
  const result = await f.run(f.plan.intent, r);
  expect(result.isError).toBe(true);
  expect(f.cloudCalls()).toBe(0);
});
for (const mode of ['unavailable', 'extra-field', 'wrong-operation', 'wrong-engine'])
  test(`public Terraform original selector rejects ${mode}`, async () => {
    const f = await fixture();
    let original: Record<string, unknown> = { planId: f.original.planId, planSha256: f.original.planSha256 };
    let intent = f.plan.intent;
    if (mode === 'unavailable') original = { planId: `azure-ce-${'a'.repeat(24)}`, planSha256: 'a'.repeat(64) };
    if (mode === 'extra-field') original.extra = true;
    if (mode === 'wrong-operation') intent = f.original.intent;
    if (mode === 'wrong-engine') {
      const native = networkUpdateFixture(false, 'native', true, false).original;
      await savePlanArtifact(f.session, native, f.current);
      original = { planId: native.planId, planSha256: native.planSha256 };
    }
    const result = await f.run(intent, f.original, { originalDeployment: original });
    expect(result.isError).toBe(true);
    expect(f.cloudCalls()).toBe(0);
  });

for (const ha of [false, true])
  test(`public Terraform network-bound replacement planning resolves explicit original HA=${ha}`, async () => {
    const f = await fixture(ha);
    const planned = await f.run(f.plan.intent, f.original);
    if (!planned.details.plan) throw Error('missing public predecessor network plan');
    const retained = planned.details.plan;
    const intent = { ...retained.intent, operation: 'replace-node' as const, replacementNode: ha ? 2 : 1 };
    const result = await f.run(intent, retained, {
      originalDeployment: { planId: f.original.planId, planSha256: f.original.planSha256 },
    });
    expect(result.isError).toBeUndefined();
    const replacement = result.details.plan;
    if (!replacement) throw Error('missing public network-bound replacement plan');
    expect(replacement.terraformNetworkReplacementProfile).toMatchObject({
      originalPlanSha256: f.original.planSha256,
      retainedPlanSha256: retained.planSha256,
    });
    expect(replacement.relayProfile).toBeUndefined();
    expect((await loadPlanArtifact(f.session, replacement.planId, replacement.planSha256)).plan).toEqual(replacement);
    expect(f.cloudCalls()).toBe(0);
  });
for (const ha of [false, true])
  test(`public Terraform network-bound replacement planning derives owning original HA=${ha}`, async () => {
    const f = await fixture(ha);
    const planned = await f.run(f.plan.intent, f.original);
    if (!planned.details.plan) throw Error('missing public predecessor network plan');
    const retained = planned.details.plan;
    const result = await f.run(
      { ...retained.intent, operation: 'replace-node', replacementNode: ha ? 2 : 1 },
      retained,
    );
    expect(result.isError).toBeUndefined();
    expect(result.details.plan?.terraformNetworkReplacementProfile).toMatchObject({
      originalPlanSha256: f.original.planSha256,
      retainedPlanSha256: retained.planSha256,
    });
    expect(f.cloudCalls()).toBe(0);
  });

for (const ha of [false, true])
  test(`round-trip public Terraform replacement/network planning retains immutable ancestry HA=${ha}`, async () => {
    const f = await fixture(ha);
    const first = await f.run(f.plan.intent, f.original);
    if (!first.details.plan) throw Error('missing first public network generation');
    const network = first.details.plan;
    const r1 = await f.run({ ...network.intent, operation: 'replace-node', replacementNode: ha ? 2 : 1 }, network);
    expect(r1.isError).toBeUndefined();
    if (!r1.details.plan) throw Error('missing first public replacement generation');
    const replacement = r1.details.plan;
    const immutable = structuredClone(replacement);
    const restored = await f.run({ ...structuredClone(f.original.intent), operation: 'update-network' }, replacement);
    expect(restored.isError).toBeUndefined();
    if (!restored.details.plan) throw Error('missing restored public network generation');
    const r2 = await f.run(
      { ...restored.details.plan.intent, operation: 'replace-node', replacementNode: 1 },
      restored.details.plan,
    );
    expect(r2.isError).toBeUndefined();
    if (!r2.details.plan) throw Error('missing second public replacement generation');
    expect(
      new Set([
        network.planSha256,
        replacement.planSha256,
        restored.details.plan.planSha256,
        r2.details.plan.planSha256,
      ]).size,
    ).toBe(4);
    expect(restored.details.plan.terraformNetworkProfile).toMatchObject({
      originalPlanSha256: f.original.planSha256,
      retainedPlanSha256: replacement.planSha256,
    });
    expect(r2.details.plan.terraformNetworkReplacementProfile).toMatchObject({
      originalPlanSha256: f.original.planSha256,
      retainedPlanSha256: restored.details.plan.planSha256,
    });
    expect((await loadPlanArtifact(f.session, replacement.planId, replacement.planSha256)).plan).toEqual(immutable);
    for (const result of [first, r1, restored, r2]) {
      if (!result.details.artifactId) throw Error('public persisted artifact required');
      const path = await f.session.getArtifactPath(result.details.artifactId);
      if (!path) throw Error('missing exact public persisted path');
      const packet = JSON.parse(await Bun.file(path).text());
      expect(packet.kind).toBe('azure-ce-plan');
      expect(packet.plan).toEqual(result.details.plan);
      expect(packet.observation).toEqual(f.current);
    }
    expect(f.cloudCalls()).toBe(0);
  });

test('public persisted plan retains sealed input bytes after caller mutation', async () => {
  const f = await fixture();
  const plan = structuredClone(f.plan);
  const expected = structuredClone(plan);
  await savePlanArtifact(f.session, plan, f.current);
  plan.image.version = 'changed-after-publication';
  expect((await loadPlanArtifact(f.session, expected.planId, expected.planSha256)).plan).toEqual(expected);
});
test('public persisted plan reader returns independent records', async () => {
  const f = await fixture();
  await savePlanArtifact(f.session, f.plan, f.current);
  const loaded = await loadPlanArtifact(f.session, f.plan.planId, f.plan.planSha256);
  loaded.plan.image.version = 'changed-returned-alias';
  expect((await loadPlanArtifact(f.session, f.plan.planId, f.plan.planSha256)).plan).toEqual(f.plan);
});
test('failed public plan writer cannot create a usable cached plan', async () => {
  const f = await fixture();
  f.session.saveArtifact = async () => {
    throw Error('public writer unavailable');
  };
  await expect(savePlanArtifact(f.session, f.plan, f.current)).rejects.toThrow('unavailable');
  await expect(loadPlanArtifact(f.session, f.plan.planId, f.plan.planSha256)).rejects.toThrow();
});
test('public persistent writer missing acknowledgement cannot substitute cached success', async () => {
  const f = await fixture();
  f.session.saveArtifact = async () => undefined;
  await expect(savePlanArtifact(f.session, f.plan, f.current)).rejects.toThrow();
  await expect(loadPlanArtifact(f.session, f.plan.planId, f.plan.planSha256)).rejects.toThrow();
});
test('public persistent writer acknowledgement requires exact persisted bytes', async () => {
  const f = await fixture();
  const writer = f.session.saveArtifact;
  f.session.saveArtifact = async (_content, type) => writer('{"kind":"azure-ce-plan","plan":{}}', type);
  await expect(savePlanArtifact(f.session, f.plan, f.current)).rejects.toThrow();
  await expect(loadPlanArtifact(f.session, f.plan.planId, f.plan.planSha256)).rejects.toThrow();
});
test('public persistent plan deletion cannot be hidden by memory cache', async () => {
  const f = await fixture();
  const id = await savePlanArtifact(f.session, f.plan, f.current);
  if (!id) throw Error('missing real writer acknowledgement');
  const path = await f.session.getArtifactPath(id);
  if (!path) throw Error('missing real persisted artifact');
  await rm(path);
  await expect(loadPlanArtifact(f.session, f.plan.planId, f.plan.planSha256)).rejects.toThrow();
});
test('public memory-only planning retains immutable independent plan bytes', async () => {
  const f = await fixture();
  const session: SessionManagerLike = {
    getSessionId: () => `${f.root}-memory-only`,
    getArtifactsDir: () => null,
    saveArtifact: async () => undefined,
    getArtifactPath: async () => null,
  };
  const plan = structuredClone(f.plan),
    expected = structuredClone(plan);
  expect(await savePlanArtifact(session, plan, f.current)).toBeUndefined();
  plan.image.version = 'changed-memory-input';
  const loaded = await loadPlanArtifact(session, expected.planId, expected.planSha256);
  expect(loaded.plan).toEqual(expected);
  loaded.plan.image.version = 'changed-memory-return';
  expect((await loadPlanArtifact(session, expected.planId, expected.planSha256)).plan).toEqual(expected);
});

test('public planner rejects caller intent mutation during discovery lookup', async () => {
  const f = await fixture();
  const intent = structuredClone(f.original.intent);
  const lookup = f.session.getArtifactPath;
  f.session.getArtifactPath = async (id) => {
    const path = await lookup(id);
    intent.deploymentName = 'ce-mutated-request';
    return path;
  };
  const result = await f.run(intent);
  expect(result.isError).toBe(true);
  expect(result.details.plan).toBeUndefined();
  expect(f.cloudCalls()).toBe(0);
});
test('public planner rejects caller intent mutation during plan publication', async () => {
  const f = await fixture();
  const intent = structuredClone(f.original.intent);
  const writer = f.session.saveArtifact;
  f.session.saveArtifact = async (content, type) => {
    const id = await writer(content, type);
    if (type === 'azure-ce-plan') intent.siteName = 'changed-during-publication';
    return id;
  };
  const result = await f.run(intent);
  expect(result.isError).toBe(true);
  expect(result.details.plan).toBeUndefined();
  expect(f.cloudCalls()).toBe(0);
});
test('public planner rejects changed session owner at publication', async () => {
  const f = await fixture();
  const writer = f.session.saveArtifact;
  f.session.saveArtifact = async (content, type) => {
    const id = await writer(content, type);
    if (type === 'azure-ce-plan') f.session.getSessionId = () => 'foreign-session';
    return id;
  };
  const result = await f.run(f.original.intent);
  expect(result.isError).toBe(true);
  expect(result.details.plan).toBeUndefined();
  expect(f.cloudCalls()).toBe(0);
});

test('memory-only planning permits transient transcript IDs without claiming persistence', async () => {
  const f = await fixture();
  const session: SessionManagerLike = {
    getSessionId: () => `${f.root}-transient`,
    getArtifactsDir: () => null,
    saveArtifact: async () => '1',
    getArtifactPath: async () => null,
  };
  expect(await savePlanArtifact(session, f.plan, f.current)).toBeUndefined();
  expect((await loadPlanArtifact(session, f.plan.planId, f.plan.planSha256)).plan).toEqual(f.plan);
});

test('persistent plan writer accepts opaque artifact IDs with verified byte-bound lookup', async () => {
  const f = await fixture();
  const writer = f.session.saveArtifact,
    lookup = f.session.getArtifactPath;
  f.session.saveArtifact = async (content, type) => `plan-artifact-${await writer(content, type)}`;
  f.session.getArtifactPath = async (id) => lookup(id.replace(/^plan-artifact-/, ''));
  expect(await savePlanArtifact(f.session, f.plan, f.current)).toMatch(/^plan-artifact-/);
  expect((await loadPlanArtifact(f.session, f.plan.planId, f.plan.planSha256)).plan).toEqual(f.plan);
});

test('persistent plan resolves unique numbered receipt when direct lookup is unavailable', async () => {
  const f = await fixture();
  f.session.getArtifactPath = async () => null;
  expect(await savePlanArtifact(f.session, f.plan, f.current)).toBeDefined();
  expect((await loadPlanArtifact(f.session, f.plan.planId, f.plan.planSha256)).plan).toEqual(f.plan);
});
