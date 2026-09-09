import { expect, it } from 'bun:test';
import { renderAwsTerraformConnect } from '../../src/ce/terraform-connect';
import { renderAwsTerraformFoundation } from '../../src/ce/terraform-foundation';

import { connectFixture as fixture } from './terraform-connect-fixture';

it('renders six Connect peers in two bounded SLO attachments and preserves admitted compute', () => {
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
    `\${aws_network_interface.node_1_nic_0.private_ip}`,
  );
  expect(config.resource.aws_route.gre_0_0.destination_cidr_block).toBe('172.31.255.0/24');
  expect(config.resource.aws_route.gre_1_0).toBeUndefined();
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
  const config = JSON.parse(renderAwsTerraformConnect(f.plan, f.observation, f.bootstrap));
  const counts = new Map<string, number>();
  for (const peer of Object.values(config.resource.aws_ec2_transit_gateway_connect_peer) as Array<{
    transit_gateway_attachment_id: string;
  }>)
    counts.set(peer.transit_gateway_attachment_id, (counts.get(peer.transit_gateway_attachment_id) ?? 0) + 1);
  expect([...counts.values()]).toEqual([4, 2]);
});
