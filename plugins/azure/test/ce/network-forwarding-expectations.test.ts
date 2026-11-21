import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadPlanArtifact,
  type SessionManagerLike,
  saveDiscoveryArtifact,
  savePlanArtifact,
} from '../../src/ce/artifacts';
import { captureAzureNetworkUpdateInventory } from '../../src/ce/network-update';
import { compileAzureCePlan } from '../../src/ce/planner';
import { azureUpgradeBinding } from '../../src/ce/terraform-upgrade';
import { createAzureCePlanTool } from '../../src/tools/azure-ce-plan';
import { networkUpdateFixture } from './network-update-fixture';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
function setup(ha = false, engine: 'native' | 'terraform' = 'terraform') {
  const f = networkUpdateFixture(ha, engine, true, false);
  const routes = (after: boolean) =>
    f.nodes.flatMap((_node, i) => [
      { node: i + 1, role: 'slo' as const, prefix: '10.20.0.0/24', routeType: 'LOCAL_ROUTE' as const },
      {
        node: i + 1,
        role: 'sli' as const,
        prefix: after ? '10.20.2.0/24' : '10.20.1.0/24',
        routeType: 'LOCAL_ROUTE' as const,
      },
    ]);
  const expected = { before: routes(false), after: routes(true) };
  const input = { ...f.plan.intent, routing: { ...f.plan.intent.routing, forwardingRoutes: expected } };
  return { ...f, expected, input };
}
test('public forwarding intent is canonical and present in both immutable plan projections', () => {
  const f = setup(true),
    plan = compileAzureCePlan(f.input, f.current);
  const reverse = structuredClone(f.input);
  reverse.routing.forwardingRoutes.before.reverse();
  reverse.routing.forwardingRoutes.after.reverse();
  expect(compileAzureCePlan(reverse, f.current).planSha256).toBe(plan.planSha256);
  expect(plan.routing).toMatchObject({ forwardingRoutes: f.expected });
  expect(plan.intent.routing).toMatchObject({ forwardingRoutes: f.expected });
  expect(plan.planSha256).not.toBe(f.plan.planSha256);
});
for (const invalid of ['duplicate', 'foreign-node', 'missing-role', 'host-prefix', 'type', 'extra-field'] as const)
  test(`public forwarding intent rejects ${invalid} before execution`, () => {
    const f = setup(),
      input = structuredClone(f.input);
    const rows = input.routing.forwardingRoutes.before;
    if (invalid === 'duplicate') rows.push(structuredClone(rows[0]));
    if (invalid === 'foreign-node') rows[0].node = 2;
    if (invalid === 'missing-role') rows.pop();
    if (invalid === 'host-prefix') rows[0].prefix = '10.20.0.1/24';
    if (invalid === 'type') Object.assign(rows[0], { routeType: 'invented' });
    if (invalid === 'extra-field') Object.assign(rows[0], { observed: true });
    expect(() => compileAzureCePlan(input, f.current)).toThrow(/forwarding/i);
  });
for (const engine of ['native', 'terraform'] as const)
  test(`actual public ${engine} plan tool persists forwarding expectations through its owning saved artifact`, async () => {
    const f = setup(false, engine),
      root = await mkdtemp(join(tmpdir(), 'azure-forwarding-plan-'));
    roots.push(root);
    let sequence = 0;
    const paths = new Map<string, string>();
    const session: SessionManagerLike = {
      getSessionId: () => root,
      getArtifactsDir: () => root,
      getArtifactPath: async (id) => paths.get(id) ?? null,
      saveArtifact: async (content, type) => {
        const id = String(++sequence),
          path = join(root, `${id}.${type}.log`);
        await writeFile(path, content, { mode: 0o600 });
        paths.set(id, path);
        return id;
      },
    };
    const discoveryArtifactId = await saveDiscoveryArtifact(session, f.current);
    if (!discoveryArtifactId) throw Error('Missing synthetic discovery');
    await savePlanArtifact(session, f.original, f.current);
    const tool = createAzureCePlanTool({ typebox: { Type: new Proxy({}, { get: () => () => ({}) }) } });
    const result = await tool.execute(
      'forwarding-public-plan',
      {
        discoveryArtifactId,
        intent: f.input,
        retainedDeployment: { planId: f.original.planId, planSha256: f.original.planSha256 },
      },
      undefined,
      undefined,
      { cwd: root, sessionManager: session },
    );
    if (result.isError) throw Error(JSON.stringify(result.content));
    expect(result.isError).not.toBe(true);
    const plan = result.details.plan;
    if (!plan) throw Error('Public plan not returned');
    const saved = await loadPlanArtifact(session, plan.planId, plan.planSha256);
    expect(saved.plan.routing).toMatchObject({ forwardingRoutes: f.expected });
  });
test('forwarding phase resolves the serial before/after boundary against exact current MAC identities', async () => {
  const f = setup(true),
    plan = compileAzureCePlan(f.input, f.current),
    binding = azureUpgradeBinding(plan);
  const inventory = await captureAzureNetworkUpdateInventory(plan, f.api);
  const identity = {
    owner: binding.owner,
    planSha256: plan.planSha256,
    node: 2,
    siteName: plan.siteName,
    siteUid: 'site-uid',
    siteConfigurationSha256: 'a'.repeat(64),
    configurationSha256: 'b'.repeat(64),
    inventory,
  };
  const physical = binding.nodes.flatMap((node, i) =>
    plan.nics.map((nic) => {
      if (nic.role !== 'slo' && nic.role !== 'sli') throw Error('Synthetic forwarding fixture role is invalid');
      return {
        node,
        role: nic.role,
        mac: inventory.nodes[String(i + 1)].nics[String(nic.index)].mac,
        device: `eth${nic.index}`,
        interfaceName: `${node}-${nic.role}`,
        linkUp: true,
        mtu: 1500,
        ipv4: null,
      };
    }),
  );
  const { resolveAzureForwardingExpectations } = await import('../../src/ce/network-forwarding-expectations');
  const preflight = resolveAzureForwardingExpectations(plan, identity, physical, 'preflight');
  expect(preflight?.routes.filter((row) => row.role === 'sli').map((row) => row.prefix)).toEqual([
    '10.20.2.0/24',
    '10.20.1.0/24',
    '10.20.1.0/24',
  ]);
  const restored = resolveAzureForwardingExpectations(plan, identity, physical, 'restored');
  expect(restored?.routes.filter((row) => row.role === 'sli').map((row) => row.prefix)).toEqual([
    '10.20.2.0/24',
    '10.20.2.0/24',
    '10.20.1.0/24',
  ]);
  expect(resolveAzureForwardingExpectations(plan, identity, physical, 'final')).toEqual(restored);
  const foreign = structuredClone(physical);
  foreign[0].mac = '02:00:00:ff:00:99';
  expect(() => resolveAzureForwardingExpectations(plan, identity, foreign, 'preflight')).toThrow();
  expect(() => resolveAzureForwardingExpectations(plan, identity, physical.slice(1), 'preflight')).toThrow();
});

for (const engine of ['native', 'terraform'] as const)
  test(`${engine} forwarding expectation changes preserve configuration scope and predecessor intent`, async () => {
    const f = setup(false, engine),
      base = compileAzureCePlan(f.input, f.current);
    const compile =
      engine === 'terraform'
        ? (await import('../../src/ce/terraform-network-plan')).compileAzureTerraformNetworkUpdatePlan
        : (await import('../../src/ce/native-network-plan')).compileAzureNativeNetworkUpdatePlan;
    const first = compile(base, f.original);
    const next = structuredClone(f.input);
    next.routing.forwardingRoutes.before = structuredClone(f.expected.after);
    next.routing.forwardingRoutes.after = structuredClone(f.expected.before);
    expect(compile(compileAzureCePlan(next, f.current), first, f.original).planSha256).not.toBe(first.planSha256);
    expect(() => compile(base, first, f.original)).toThrow(/forwarding/i);
    const changed = structuredClone(next);
    changed.routing.destinationCidrs = ['192.0.2.0/24'];
    expect(() => compile(compileAzureCePlan(changed, f.current), first, f.original)).toThrow();
    const removed = structuredClone(f.plan.intent);
    expect(() => compile(compileAzureCePlan(removed, f.current), first, f.original)).toThrow(/forwarding/i);
  });

test('planning rejects an oversized mixed serial route boundary before execution', () => {
  const f = setup(true),
    input = structuredClone(f.input);
  for (let i = 0; i < 510; i++) {
    const row = {
      node: 3,
      role: 'sli' as const,
      prefix: `10.99.${Math.floor(i / 256)}.${i % 256}/32`,
      routeType: 'LOCAL_ROUTE' as const,
    };
    input.routing.forwardingRoutes.before.push(row);
    input.routing.forwardingRoutes.after.push({ ...row, node: 1 });
  }
  expect(input.routing.forwardingRoutes.before).toHaveLength(516);
  expect(input.routing.forwardingRoutes.after).toHaveLength(516);
  expect(() => compileAzureCePlan(input, f.current)).toThrow(/forwarding/i);
});
