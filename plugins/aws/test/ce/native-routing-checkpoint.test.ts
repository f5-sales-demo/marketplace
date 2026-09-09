import { expect, test } from 'bun:test';
import { canonicalSha256 } from '../../src/ce/canonical';
import { compileAwsNativeRoutingCheckpoint } from '../../src/ce/native-routing-checkpoint';
import type { AwsCeCheckpoint, AwsCePlan } from '../../src/ce/types';
import { foundationPlan } from './terraform-fixtures';

test('freezes every native XC routing UID against its site and owning deployment', () => {
  const source = foundationPlan();
  const actions = [1, 2, 3].flatMap((node) =>
    [0, 1].map((role, index) => ({
      kind: 'tgw-connect-peer-create' as const,
      node,
      capture: { placeholder: `__PEER_${node}_${index}__`, path: 'id' },
      args: ['--peer-address', `__NODE_${node}_${role ? 'SLI' : 'SLO'}_IP__`],
    })),
  );
  const draft = {
    ...source,
    engine: 'native' as const,
    intent: { ...source.intent, engine: 'native' as const },
    deploymentName: source.intent.deploymentName,
    accountId: source.intent.accountId,
    region: source.intent.region,
    topology: source.intent.topology,
    routing: { profile: 'tgw-connect' as const },
    actions,
  };
  delete (draft as Partial<AwsCePlan>).planId;
  delete (draft as Partial<AwsCePlan>).planSha256;
  const planSha256 = canonicalSha256(draft);
  const plan = { ...draft, planSha256, planId: `aws-ce-${planSha256.slice(0, 24)}` } as AwsCePlan;
  const resolvedValues = Object.fromEntries(
    actions.flatMap((_action, index) => {
      const connector = `${plan.deploymentName.slice(0, 24)}-gre-${index + 1}`;
      return [[`__XC_ROUTING_${connector}__`, `connector-${index + 1}`]];
    }),
  );
  const sites = plan.intent.topology.sites ?? [];
  for (const site of sites) resolvedValues[`__XC_ROUTING_${site.name.slice(0, 55)}-tgw-bgp__`] = `bgp-${site.name}`;
  const checkpoint = {
    schemaVersion: 2,
    engine: 'native',
    planId: plan.planId,
    planSha256: plan.planSha256,
    resolvedValues,
  } as AwsCeCheckpoint;
  const owner = {
    deploymentId: plan.deploymentName,
    engine: 'native' as const,
    provider: 'aws' as const,
    account: plan.accountId,
    region: plan.region,
  };
  const frozen = compileAwsNativeRoutingCheckpoint(plan, checkpoint, owner);
  expect(frozen.resources).toHaveLength(actions.length + sites.length);
  expect(new Set(frozen.resources.map((resource) => resource.uid)).size).toBe(frozen.resources.length);
  expect(frozen.resources.every((resource) => sites.some((site) => site.name === resource.siteName))).toBe(true);

  delete checkpoint.resolvedValues[`__XC_ROUTING_${frozen.resources[0].name}__`];
  expect(() => compileAwsNativeRoutingCheckpoint(plan, checkpoint, owner)).toThrow('UID is missing');
  checkpoint.resolvedValues[`__XC_ROUTING_${frozen.resources[0].name}__`] = frozen.resources[1].uid;
  expect(() => compileAwsNativeRoutingCheckpoint(plan, checkpoint, owner)).toThrow('duplicated');
  expect(() => compileAwsNativeRoutingCheckpoint(plan, checkpoint, { ...owner, region: 'eu-west-2' })).toThrow(
    'ownership differs',
  );
});
