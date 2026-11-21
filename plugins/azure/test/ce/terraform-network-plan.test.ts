import { expect, test } from 'bun:test';
import { verifyAzureCePlan } from '../../src/ce/artifacts';
import { canonicalSha256 } from '../../src/ce/canonical';
import { compileAzureNativeNetworkUpdatePlan } from '../../src/ce/native-network-plan';
import { compileAzureCePlan } from '../../src/ce/planner';
import {
  compileAzureTerraformNetworkUpdatePlan,
  verifyAzureTerraformNetworkProfile,
} from '../../src/ce/terraform-network-plan';
import type { AzureCePlan } from '../../src/ce/types';
import { networkUpdateFixture } from './network-update-fixture';

function rehash(plan: AzureCePlan): AzureCePlan {
  const { planId: _id, planSha256: _sha, ...draft } = structuredClone(plan);
  const digest = canonicalSha256(draft);
  return { ...draft, planId: `azure-ce-${digest.slice(0, 24)}`, planSha256: digest };
}
function fixture(ha = false) {
  return networkUpdateFixture(ha, 'terraform', true, false);
}
for (const ha of [false, true]) {
  test(`Terraform network generation plan binds exact first predecessor for HA=${ha}`, () => {
    const f = fixture(ha),
      before = { plan: structuredClone(f.plan), original: structuredClone(f.original) };
    const p = compileAzureTerraformNetworkUpdatePlan(f.plan, f.original);
    verifyAzureCePlan(p);
    expect(verifyAzureTerraformNetworkProfile(p)).toEqual({
      schemaVersion: 1,
      kind: 'azure-terraform-network-generation',
      originalPlanSha256: f.original.planSha256,
      retainedPlanSha256: f.original.planSha256,
    });
    expect(p.planSha256).not.toBe(f.plan.planSha256);
    expect(p.networkProfile).toBeUndefined();
    expect(p.topology.nodeCount).toBe(ha ? 3 : 1);
    expect(f.plan).toEqual(before.plan);
    expect(f.original).toEqual(before.original);
  });
  test(`Terraform network A-B-A-B plans retain ordered distinct identities for HA=${ha}`, () => {
    const f = fixture(ha);
    const b1 = compileAzureTerraformNetworkUpdatePlan(f.plan, f.original);
    const restoreIntent = { ...structuredClone(f.original.intent), operation: 'update-network' as const };
    const a2 = compileAzureTerraformNetworkUpdatePlan(compileAzureCePlan(restoreIntent, f.current), b1, f.original);
    const b3 = compileAzureTerraformNetworkUpdatePlan(f.plan, a2, f.original);
    expect(new Set([b1.planSha256, a2.planSha256, b3.planSha256]).size).toBe(3);
    expect(a2.terraformNetworkProfile?.retainedPlanSha256).toBe(b1.planSha256);
    expect(b3.terraformNetworkProfile?.retainedPlanSha256).toBe(a2.planSha256);
    expect(b3.terraformNetworkProfile?.originalPlanSha256).toBe(f.original.planSha256);
    expect(a2.nics).toEqual(f.original.nics);
    expect(b3.nics).toEqual(b1.nics);
    expect(compileAzureTerraformNetworkUpdatePlan(f.plan, a2, f.original)).toEqual(b3);
  });
}
test('Terraform first network generation can structurally bind an original-scope replacement predecessor', () => {
  const f = fixture(true);
  const r = compileAzureCePlan({ ...f.original.intent, operation: 'replace-node', replacementNode: 2 }, f.current);
  const p = compileAzureTerraformNetworkUpdatePlan(f.plan, r, f.original);
  expect(p.terraformNetworkProfile?.retainedPlanSha256).toBe(r.planSha256);
  expect(p.terraformNetworkProfile?.originalPlanSha256).toBe(f.original.planSha256);
});
test('Terraform network plan permits Marketplace terms acknowledgement without changing its image', () => {
  const f = fixture();
  const p = structuredClone(f.plan);
  p.image.termsAccepted = !p.image.termsAccepted;
  expect(compileAzureTerraformNetworkUpdatePlan(rehash(p), f.original).terraformNetworkProfile).toBeDefined();
});
for (const [name, mutate] of [
  [
    'namespace',
    (p: AzureCePlan) => {
      p.namespace = 'example-foreign';
    },
  ],
  [
    'security-rules',
    (p: AzureCePlan) => {
      p.securityRules.push({
        name: 'foreign',
        purpose: 'management',
        direction: 'Inbound',
        protocol: 'Tcp',
        sourceCidrs: ['10.0.0.0/8'],
        destinationCidrs: ['10.0.0.0/8'],
        destinationPorts: ['22'],
      });
    },
  ],
  [
    'tenant',
    (p: AzureCePlan) => {
      p.subscription.tenantId = 'example-foreign';
    },
  ],
  [
    'subscription',
    (p: AzureCePlan) => {
      p.subscription.id = 'foreign';
    },
  ],
  [
    'image',
    (p: AzureCePlan) => {
      p.image.version = 'foreign';
    },
  ],
  [
    'vm',
    (p: AzureCePlan) => {
      p.vm.size = 'foreign';
    },
  ],
  [
    'routing',
    (p: AzureCePlan) => {
      p.routing.mode = 'route-server';
    },
  ],
  [
    'egress',
    (p: AzureCePlan) => {
      p.egress.mode = 'nat-gateway';
    },
  ],
  [
    'nic-role',
    (p: AzureCePlan) => {
      p.nics[1].role = 'slo';
    },
  ],
  [
    'intent',
    (p: AzureCePlan) => {
      p.intent.resourceGroup = 'foreign';
    },
  ],
  [
    'topology',
    (p: AzureCePlan) => {
      p.topology.nodeCount = 3;
    },
  ],
] as const)
  test(`Terraform network plan rejects non-subnet scope change ${name}`, () => {
    const f = fixture(),
      p = structuredClone(f.plan);
    mutate(p);
    expect(() => compileAzureTerraformNetworkUpdatePlan(rehash(p), f.original)).toThrow();
  });
for (const name of [
  'schema',
  'kind',
  'extra',
  'missing',
  'original-self',
  'retained-self',
  'original-malformed',
  'retained-malformed',
  'native-engine',
  'native-profile',
  'replacement-profile',
  'relay-profile',
  'deploy-operation',
]) {
  test(`Terraform network profile integrity rejects ${name}`, () => {
    const f = fixture();
    const p = compileAzureTerraformNetworkUpdatePlan(f.plan, f.original);
    const row = p.terraformNetworkProfile as unknown as Record<string, unknown>;
    if (name === 'schema') row.schemaVersion = 2;
    if (name === 'kind') row.kind = 'foreign';
    if (name === 'extra') row.extra = true;
    if (name === 'missing') delete row.retainedPlanSha256;
    if (name === 'original-self') row.originalPlanSha256 = p.planSha256;
    if (name === 'retained-self') row.retainedPlanSha256 = p.planSha256;
    if (name === 'original-malformed') row.originalPlanSha256 = 'runtime-pending';
    if (name === 'retained-malformed') row.retainedPlanSha256 = 'A'.repeat(64);
    if (name === 'native-engine') {
      p.engine = 'native';
      p.intent.engine = 'native';
    }
    if (name === 'native-profile') (p as unknown as Record<string, unknown>).networkProfile = { schemaVersion: 1 };
    if (name === 'replacement-profile')
      (p as unknown as Record<string, unknown>).networkReplacementProfile = { schemaVersion: 1 };
    if (name === 'relay-profile') (p as unknown as Record<string, unknown>).relayProfile = { schemaVersion: 1 };
    if (name === 'deploy-operation') p.intent.operation = 'deploy';
    // Self references are tested directly since rehash necessarily changes the referenced digest.
    if (name.endsWith('-self')) expect(() => verifyAzureTerraformNetworkProfile(p)).toThrow();
    else expect(() => verifyAzureCePlan(rehash(p))).toThrow();
  });
}
test('Terraform generation compiler rejects unbound network predecessor', () => {
  const f = fixture();
  expect(() => compileAzureTerraformNetworkUpdatePlan(f.plan, f.plan, f.original)).toThrow();
});
test('Terraform generation compiler rejects wrong original generation', () => {
  const f = fixture();
  const b = compileAzureTerraformNetworkUpdatePlan(f.plan, f.original);
  const original = structuredClone(f.original);
  original.warnings.push('distinct source');
  expect(() => compileAzureTerraformNetworkUpdatePlan(f.plan, b, rehash(original))).toThrow();
});
test('Terraform generation compiler rejects original alias with different whole-plan metadata', () => {
  const f = fixture();
  const retained = structuredClone(f.original);
  retained.warnings.push('distinct source');
  expect(() => compileAzureTerraformNetworkUpdatePlan(f.plan, rehash(retained), f.original)).toThrow();
});
test('Terraform generation compiler rejects recompiled profiled base', () => {
  const f = fixture();
  const b = compileAzureTerraformNetworkUpdatePlan(f.plan, f.original);
  expect(() => compileAzureTerraformNetworkUpdatePlan(b, f.original)).toThrow();
});
test('Terraform generation compiler rejects replacing beyond original subnet scope without dedicated history', () => {
  const f = fixture();
  const r = compileAzureCePlan({ ...f.plan.intent, operation: 'replace-node', replacementNode: 1 }, f.current);
  expect(() => compileAzureTerraformNetworkUpdatePlan(f.plan, r, f.original)).toThrow();
});
test('native network contract remains separate from Terraform generation contract', () => {
  const f = networkUpdateFixture(false, 'native', true, false);
  const p = compileAzureNativeNetworkUpdatePlan(f.plan, f.original);
  verifyAzureCePlan(p);
  expect(p.terraformNetworkProfile).toBeUndefined();
  expect(() => compileAzureTerraformNetworkUpdatePlan(f.plan, f.original)).toThrow();
  const t = fixture();
  expect(() => compileAzureNativeNetworkUpdatePlan(t.plan, t.original)).toThrow();
});

for (const name of ['projected-subnet', 'intent-subnet', 'ordered-index'])
  test(`Terraform network profile rejects inconsistent intent and projection ${name}`, () => {
    const f = fixture();
    const p = compileAzureTerraformNetworkUpdatePlan(f.plan, f.original);
    if (name === 'projected-subnet') p.nics[1].subnet = { mode: 'greenfield', name: 'wrong', cidr: '10.20.4.0/24' };
    if (name === 'intent-subnet') p.intent.nics[1].subnet = { mode: 'greenfield', name: 'wrong', cidr: '10.20.4.0/24' };
    if (name === 'ordered-index') p.nics[1].index = 4;
    expect(() => verifyAzureCePlan(rehash(p))).toThrow();
  });
