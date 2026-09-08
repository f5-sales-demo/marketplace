import { expect, it } from 'bun:test';
import { canonicalSha256 } from '../../src/ce/canonical';
import { bindTerraformConnectPeers } from '../../src/ce/terraform-routing';
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
