import { expect, test } from 'bun:test';
import { verifyAzureCePlan } from '../../src/ce/artifacts';
import { canonicalSha256 } from '../../src/ce/canonical';
import { compileAzureCePlan } from '../../src/ce/planner';
import { compileAzureTerraformNetworkUpdatePlan } from '../../src/ce/terraform-network-plan';
import {
  compileAzureTerraformNetworkReplacementPlan,
  verifyAzureTerraformNetworkReplacementProfile,
} from '../../src/ce/terraform-network-replacement-plan';
import type { AzureCePlan } from '../../src/ce/types';
import { networkUpdateFixture } from './network-update-fixture';

function rehash(p: AzureCePlan): AzureCePlan {
  const { planId: _id, planSha256: _sha, ...draft } = structuredClone(p);
  const hash = canonicalSha256(draft);
  return { ...draft, planId: `azure-ce-${hash.slice(0, 24)}`, planSha256: hash };
}
function fixture(ha = false) {
  const f = networkUpdateFixture(ha, 'terraform', true, false);
  const network = compileAzureTerraformNetworkUpdatePlan(f.plan, f.original);
  const base = compileAzureCePlan(
    { ...network.intent, operation: 'replace-node', replacementNode: ha ? 2 : 1 },
    f.current,
  );
  return { ...f, network, base };
}
for (const ha of [false, true]) {
  test(`network-bound replacement plan authenticates explicit predecessor identity HA=${ha}`, () => {
    const f = fixture(ha);
    const before = structuredClone(f.base);
    const p = compileAzureTerraformNetworkReplacementPlan(f.base, f.network, f.original);
    verifyAzureCePlan(p);
    expect(verifyAzureTerraformNetworkReplacementProfile(p)).toEqual({
      schemaVersion: 1,
      kind: 'azure-terraform-network-bound-replacement',
      originalPlanSha256: f.original.planSha256,
      retainedPlanSha256: f.network.planSha256,
    });
    expect(p.planSha256).not.toBe(f.base.planSha256);
    expect(p.nics).toEqual(f.network.nics);
    expect(f.base).toEqual(before);
    expect(p.terraformNetworkProfile).toBeUndefined();
    expect(p.networkReplacementProfile).toBeUndefined();
  });
  test(`successive replacement plans preserve immediate order HA=${ha}`, () => {
    const f = fixture(ha);
    const first = compileAzureTerraformNetworkReplacementPlan(f.base, f.network, f.original);
    const second = compileAzureTerraformNetworkReplacementPlan(f.base, first, f.original);
    const third = compileAzureTerraformNetworkReplacementPlan(f.base, second, f.original);
    expect(new Set([first.planSha256, second.planSha256, third.planSha256]).size).toBe(3);
    expect(second.terraformNetworkReplacementProfile?.retainedPlanSha256).toBe(first.planSha256);
    expect(third.terraformNetworkReplacementProfile?.retainedPlanSha256).toBe(second.planSha256);
    expect(compileAzureTerraformNetworkReplacementPlan(f.base, second, f.original)).toEqual(third);
  });
}
for (const kind of [
  'namespace',
  'security',
  'subscription',
  'tenant',
  'vm',
  'image',
  'routing',
  'egress',
  'subnet',
  'role',
  'intent',
  'topology',
])
  test(`replacement planning rejects scope change ${kind}`, () => {
    const f = fixture(),
      p = structuredClone(f.base);
    if (kind === 'namespace') p.namespace = 'example-foreign';
    if (kind === 'security')
      p.securityRules.push({
        name: 'foreign',
        purpose: 'management',
        direction: 'Inbound',
        protocol: 'Tcp',
        sourceCidrs: ['10.0.0.0/8'],
        destinationCidrs: ['10.0.0.0/8'],
        destinationPorts: ['22'],
      });
    if (kind === 'subscription') p.subscription.id = 'foreign';
    if (kind === 'tenant') p.subscription.tenantId = 'example-foreign';
    if (kind === 'vm') p.vm.size = 'foreign';
    if (kind === 'image') p.image.version = 'foreign';
    if (kind === 'routing') p.routing.mode = 'route-server';
    if (kind === 'egress') p.egress.mode = 'nat-gateway';
    if (kind === 'subnet') {
      p.nics = f.original.nics;
      p.intent.nics = f.original.intent.nics;
    }
    if (kind === 'role') p.nics[1].role = 'other';
    if (kind === 'intent') p.intent.resourceGroup = 'foreign';
    if (kind === 'topology') p.topology.nodeCount = 3;
    expect(() => compileAzureTerraformNetworkReplacementPlan(rehash(p), f.network, f.original)).toThrow();
  });
for (const kind of [
  'schema',
  'kind',
  'extra',
  'missing',
  'malformed-original',
  'malformed-retained',
  'original-self',
  'retained-self',
  'same-predecessors',
  'native-engine',
  'network-profile',
  'native-profile',
  'native-replacement',
  'relay-profile',
  'deploy-operation',
  'node-zero',
  'node-high',
  'fractional-node',
  'inconsistent-nics',
])
  test(`replacement profile rejects ${kind}`, () => {
    const f = fixture();
    const p = compileAzureTerraformNetworkReplacementPlan(f.base, f.network, f.original);
    const row = p.terraformNetworkReplacementProfile as unknown as Record<string, unknown>;
    if (kind === 'schema') row.schemaVersion = 2;
    if (kind === 'kind') row.kind = 'foreign';
    if (kind === 'extra') row.foreign = true;
    if (kind === 'missing') delete row.retainedPlanSha256;
    if (kind === 'malformed-original') row.originalPlanSha256 = 'pending';
    if (kind === 'malformed-retained') row.retainedPlanSha256 = 'A'.repeat(64);
    if (kind === 'original-self') row.originalPlanSha256 = p.planSha256;
    if (kind === 'retained-self') row.retainedPlanSha256 = p.planSha256;
    if (kind === 'same-predecessors') row.retainedPlanSha256 = row.originalPlanSha256;
    if (kind === 'native-engine') {
      p.engine = 'native';
      p.intent.engine = 'native';
    }
    if (kind === 'network-profile')
      (p as unknown as Record<string, unknown>).terraformNetworkProfile = { schemaVersion: 1 };
    if (kind === 'native-profile') (p as unknown as Record<string, unknown>).networkProfile = { schemaVersion: 1 };
    if (kind === 'native-replacement')
      (p as unknown as Record<string, unknown>).networkReplacementProfile = { schemaVersion: 1 };
    if (kind === 'relay-profile') (p as unknown as Record<string, unknown>).relayProfile = { schemaVersion: 1 };
    if (kind === 'deploy-operation') p.intent.operation = 'deploy';
    if (kind === 'node-zero') p.intent.replacementNode = 0;
    if (kind === 'node-high') p.intent.replacementNode = 4;
    if (kind === 'fractional-node') p.intent.replacementNode = 1.5;
    if (kind === 'inconsistent-nics') p.nics[1].name = 'foreign';
    if (kind.endsWith('-self')) expect(() => verifyAzureTerraformNetworkReplacementProfile(p)).toThrow();
    else expect(() => verifyAzureCePlan(rehash(p))).toThrow();
  });
test('replacement plan rejects altered original identity', () => {
  const f = fixture();
  const original = rehash({ ...f.original, warnings: ['foreign-original'] });
  expect(() => compileAzureTerraformNetworkReplacementPlan(f.base, f.network, original)).toThrow();
});
test('replacement plan rejects an unbound network source', () => {
  const f = fixture();
  expect(() => compileAzureTerraformNetworkReplacementPlan(f.base, f.plan, f.original)).toThrow();
});
test('replacement plan rejects recompiling an already bound base', () => {
  const f = fixture();
  const p = compileAzureTerraformNetworkReplacementPlan(f.base, f.network, f.original);
  expect(() => compileAzureTerraformNetworkReplacementPlan(p, f.network, f.original)).toThrow();
});
test('replacement planning retains Marketplace terms acknowledgement exception', () => {
  const f = fixture();
  const base = rehash({ ...f.base, image: { ...f.base.image, termsAccepted: !f.base.image.termsAccepted } });
  expect(compileAzureTerraformNetworkReplacementPlan(base, f.network, f.original).image.version).toBe(
    f.network.image.version,
  );
});

test('restored original-shaped replacement requires explicit owning ancestry for next network planning', () => {
  const f = fixture();
  const restored = compileAzureTerraformNetworkUpdatePlan(
    compileAzureCePlan({ ...f.original.intent, operation: 'update-network' }, f.current),
    f.network,
    f.original,
  );
  const replacement = compileAzureTerraformNetworkReplacementPlan(
    compileAzureCePlan({ ...restored.intent, operation: 'replace-node', replacementNode: 1 }, f.current),
    restored,
    f.original,
  );
  const next = compileAzureTerraformNetworkUpdatePlan(f.plan, replacement, f.original);
  expect(next.terraformNetworkProfile?.retainedPlanSha256).toBe(replacement.planSha256);
  expect(next.terraformNetworkProfile?.originalPlanSha256).toBe(f.original.planSha256);
  expect(() => compileAzureTerraformNetworkUpdatePlan(f.plan, replacement)).toThrow();
});
