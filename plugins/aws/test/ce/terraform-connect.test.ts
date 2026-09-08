import { expect, it } from 'bun:test';
import { canonicalSha256 } from '../../src/ce/canonical';
import { renderAwsTerraformConnect } from '../../src/ce/terraform-connect';
import { renderAwsTerraformFoundation } from '../../src/ce/terraform-foundation';
import type { AwsCeObservation } from '../../src/ce/types';
import { foundationPlan } from './terraform-fixtures';

function fixture() {
  const { planId: _id, planSha256: _sha, ...draft } = foundationPlan();
  draft.intent.routing = {
    profile: 'tgw-connect',
    transitGatewayId: 'tgw-12345678',
    customerAsn: 65010,
    transitGatewayAsn: 64512,
    destinationCidrs: [],
    associations: ['tgw-rtb-12345678'],
    propagations: ['tgw-rtb-12345678'],
    connectPeers: [1, 2, 3].flatMap((node) =>
      [0, 1].map((transportInterfaceIndex) => ({
        node,
        transportInterfaceIndex,
        insideCidr: `169.254.10.${((node - 1) * 2 + transportInterfaceIndex) * 8}/29`,
      })),
    ),
  };
  const planSha256 = canonicalSha256(draft);
  const plan = { ...draft, planSha256, planId: `aws-ce-${planSha256.slice(0, 24)}` };
  const observation = {
    resources: [
      {
        id: 'tgw-12345678',
        exists: true,
        region: 'us-east-1',
        state: {
          TransitGateways: [
            {
              TransitGatewayId: 'tgw-12345678',
              State: 'available',
              Options: { AmazonSideAsn: 64512, TransitGatewayCidrBlocks: ['172.31.255.0/24'] },
            },
          ],
        },
      },
    ],
  } as unknown as AwsCeObservation;
  const bootstrap = Object.fromEntries(
    [1, 2, 3].map((node) => [
      String(node),
      '#cloud-config\nwrite_files:\n- path: /etc/vpm/user_data\n  content: fixture\n',
    ]),
  );
  return { plan, observation, bootstrap };
}
it('renders six Connect peers in two role attachments and preserves admitted compute', () => {
  const f = fixture();
  const foundation = JSON.parse(renderAwsTerraformFoundation(f.plan, f.bootstrap));
  const config = JSON.parse(renderAwsTerraformConnect(f.plan, f.observation, f.bootstrap));
  expect(Object.keys(config.resource.aws_ec2_transit_gateway_connect)).toHaveLength(2);
  expect(Object.keys(config.resource.aws_ec2_transit_gateway_connect_peer)).toHaveLength(6);
  expect(config.resource.aws_instance).toEqual(foundation.resource.aws_instance);
  expect(config.resource.aws_ec2_transit_gateway_connect_peer.peer_1.peer_address).toBe(
    `\${aws_network_interface.node_1_nic_0.private_ip}`,
  );
  expect(config.resource.aws_ec2_transit_gateway_connect_peer.peer_2.peer_address).toBe(
    `\${aws_network_interface.node_1_nic_1.private_ip}`,
  );
  expect(config.resource.aws_route.gre_0_0.destination_cidr_block).toBe('172.31.255.0/24');
  expect(config.resource.aws_route.gre_1_0.destination_cidr_block).toBe('172.31.255.0/24');
  expect(Object.keys(config.resource.aws_ec2_transit_gateway_route_table_association)).toHaveLength(3);
  expect(Object.keys(config.output.ce_connect_peers.value)).toHaveLength(6);
});
it('requires complete node admission and current gateway CIDR evidence', () => {
  const f = fixture();
  expect(() => renderAwsTerraformConnect(f.plan, f.observation, { 1: f.bootstrap['1'] })).toThrow('every selected');
  expect(() => renderAwsTerraformConnect(f.plan, { ...f.observation, resources: [] }, f.bootstrap)).toThrow('scoped');
});

it('limits each Connect attachment to four peers', () => {
  const f = fixture();
  const { planId: _id, planSha256: _sha, ...draft } = f.plan;
  draft.intent.routing.connectPeers = draft.intent.routing.connectPeers?.map((peer) => ({
    ...peer,
    transportInterfaceIndex: 1,
  }));
  const planSha256 = canonicalSha256(draft);
  const plan = { ...draft, planSha256, planId: `aws-ce-${planSha256.slice(0, 24)}` };
  const config = JSON.parse(renderAwsTerraformConnect(plan, f.observation, f.bootstrap));
  const counts = new Map<string, number>();
  for (const peer of Object.values(config.resource.aws_ec2_transit_gateway_connect_peer) as Array<{
    transit_gateway_attachment_id: string;
  }>)
    counts.set(peer.transit_gateway_attachment_id, (counts.get(peer.transit_gateway_attachment_id) ?? 0) + 1);
  expect([...counts.values()]).toEqual([4, 2]);
});
