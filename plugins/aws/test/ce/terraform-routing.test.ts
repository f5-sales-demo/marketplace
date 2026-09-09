import { expect, it } from 'bun:test';
import { canonicalSha256 } from '../../src/ce/canonical';
import { bindTerraformConnectPeers, bindTerraformIngress } from '../../src/ce/terraform-routing';
import { foundationPlan } from './terraform-fixtures';

function fixture() {
  const { planId: _id, planSha256: _sha, ...draft } = foundationPlan();
  const expanded = {
    ...draft,
    routing: draft.intent.routing,
    actions: [0, 1].map((role) => ({
      kind: 'tgw-connect-peer-create',
      node: 1,
      capture: { placeholder: `__TGW_CONNECT_PEER_${role + 1}__`, path: 'id' },
      args: [
        '--peer-address',
        `__NODE_1_${role === 0 ? 'SLO' : 'SLI'}_IP__`,
        '--transit-gateway-attachment-id',
        `__TGW_CONNECT_ATTACHMENT_${role}_1__`,
      ],
    })),
  };
  const planSha256 = canonicalSha256(expanded);
  const plan = { ...expanded, planSha256, planId: `aws-ce-${planSha256.slice(0, 24)}` } as typeof draft;
  const outputs = {
    ce_vpc_id: 'vpc-12345678',
    ce_transport_attachment: 'tgw-attach-12345678',
    ce_connect_peers: Object.fromEntries(
      [0, 1].map((role) => [
        String(role + 1),
        {
          id: `tgw-connect-peer-${String(role + 1).repeat(8)}`,
          node: 1,
          transport_interface_index: role,
          attachment_id: `tgw-attach-${String(role + 1).repeat(8)}`,
        },
      ]),
    ),
  };
  return { plan: plan as ReturnType<typeof foundationPlan>, outputs };
}
it('maps exact Terraform locators to planned captures without importing claimed session health', () => {
  const f = fixture();
  const result = bindTerraformConnectPeers(
    f.plan,
    { ...f.outputs, health: 'healthy' },
    { __ENI_1_0_MAC__: '00:11:22:33:44:55' },
  );
  expect(result.__TGW_CONNECT_PEER_1__).toBe('tgw-connect-peer-11111111');
  expect(result.__TGW_CONNECT_ATTACHMENT_1_1__).toBe('tgw-attach-22222222');
  expect(result.health).toBeUndefined();
});
it('rejects duplicate peer identities, wrong physical roles and collapsed attachment groups', () => {
  for (const mutation of [
    { id: 'tgw-connect-peer-11111111' },
    { transport_interface_index: 0 },
    { attachment_id: 'tgw-attach-11111111' },
  ]) {
    const f = fixture();
    f.outputs.ce_connect_peers['2'] = { ...f.outputs.ce_connect_peers['2'], ...mutation };
    expect(() => bindTerraformConnectPeers(f.plan, f.outputs, {})).toThrow();
  }
});

it('binds only scoped Terraform NLB outputs for the explicit ingress intent', () => {
  const f = fixture();
  f.plan.intent.ingress = { mode: 'nlb', port: 8443, scheme: 'internal' };
  f.plan.intent.partition = 'aws';
  Object.assign(f.plan, {
    partition: 'aws',
    accountId: f.plan.intent.accountId,
    region: f.plan.intent.region,
  });
  const prefix = `arn:aws:elasticloadbalancing:${f.plan.region}:${f.plan.accountId}`;
  const output = {
    load_balancer_arn: `${prefix}:loadbalancer/net/ce/abcdef12`,
    target_group_arn: `${prefix}:targetgroup/ce/abcdef12`,
    listener_arn: `${prefix}:listener/net/ce/abcdef12/abcdef12`,
    port: 8443,
    scheme: 'internal',
  };
  expect(bindTerraformIngress(f.plan, { ce_ingress: output })).toEqual({
    __NLB_ARN__: output.load_balancer_arn,
    __NLB_TARGET_GROUP_ARN__: output.target_group_arn,
    __NLB_LISTENER_ARN__: output.listener_arn,
  });
  expect(() => bindTerraformIngress(f.plan, { ce_ingress: { ...output, port: 443 } })).toThrow();
  expect(() => bindTerraformIngress(f.plan, { ce_ingress: { ...output, target_group_arn: 'foreign' } })).toThrow();
});

it('rejects incomplete, duplicated and cross-deployment replacement routing locators before observation', async () => {
  const { validateAwsRoutingRebind } = await import('../../src/ce/routing-apply');
  const { plan } = fixture();
  plan.deploymentName = 'ce';
  const checkpoint = {
    schemaVersion: 2,
    engine: plan.engine,
    planId: plan.planId,
    planSha256: plan.planSha256,
    resolvedValues: {
      '__XC_ROUTING_ce-gre-1__': 'one',
      '__XC_ROUTING_ce-gre-2__': 'two',
      '__XC_ROUTING_site-1-tgw-bgp__': 'three',
    },
  };
  const rebind = {
    siteName: 'site-1',
    siteUid: 'new-site',
    checkpoint,
    contract: {},
  } as unknown as import('../../src/ce/routing-apply').AwsRoutingRebind;
  expect(() => validateAwsRoutingRebind(plan, rebind)).not.toThrow();
  for (const change of [
    { planSha256: 'foreign' },
    { engine: 'native' },
    { resolvedValues: {} },
    { resolvedValues: { ...checkpoint.resolvedValues, '__XC_ROUTING_ce-gre-2__': 'one' } },
  ])
    expect(() =>
      validateAwsRoutingRebind(plan, { ...rebind, checkpoint: { ...checkpoint, ...change } as never }),
    ).toThrow();
  expect(() => validateAwsRoutingRebind(plan, { ...rebind, siteName: 'foreign' })).toThrow();
});
