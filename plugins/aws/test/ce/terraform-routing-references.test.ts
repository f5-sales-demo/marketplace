import { expect, test } from 'bun:test';
import { ownedRoutingAdditions, routingAttachmentIds } from '../../src/ce/terraform-routing-references';
import type { AwsCeObservation, AwsCePlan, AwsCeResourceObservation } from '../../src/ce/types';

function fixture() {
  const plan = {
    engine: 'terraform',
    deploymentName: 'ce',
    planSha256: 'a'.repeat(64),
    region: 'ca-west-1',
    accountId: '123456789012',
    intent: {
      routing: {
        profile: 'tgw-connect',
        transitGatewayId: 'tgw-12345678',
        associations: ['tgw-rtb-12345678'],
        propagations: ['tgw-rtb-12345678'],
      },
    },
  } as AwsCePlan;
  const edge = {
    TransitGatewayAttachmentId: 'tgw-attach-12345678',
    ResourceId: 'vpc-12345678',
    ResourceType: 'vpc',
    State: 'associated',
  };
  const table = {
    id: 'tgw-rtb-12345678',
    region: plan.region,
    exists: true,
    owned: false,
    tags: {},
    state: { Associations: [], Propagations: [], Other: 'preserved' },
  } as AwsCeResourceObservation;
  const after = {
    ...table,
    state: { ...table.state, Associations: [edge], Propagations: [{ ...edge, State: 'enabled' }] },
  };
  const attachment = {
    id: edge.TransitGatewayAttachmentId,
    region: plan.region,
    exists: true,
    owned: true,
    tags: {
      'xcsh-managed-by': 'aws-ce',
      'xcsh-execution-engine': 'terraform',
      'xcsh-deployment-id': 'ce',
      'xcsh-plan-sha256': plan.planSha256,
    },
    state: {
      TransitGatewayAttachments: [
        {
          ...edge,
          TransitGatewayId: plan.intent.routing.transitGatewayId,
          ResourceOwnerId: plan.accountId,
          TransitGatewayOwnerId: plan.accountId,
        },
      ],
    },
  } as AwsCeResourceObservation;
  return { plan, table, after, attachment, edge };
}
test('removes only planned own additions, retaining original reference configuration', () => {
  const f = fixture();
  expect(ownedRoutingAdditions(f.plan, [f.table], [f.after], [f.attachment])).toEqual([f.table]);
  expect(routingAttachmentIds(f.plan, { resources: [f.after] } as AwsCeObservation)).toEqual([f.attachment.id]);
  const changed = { ...f.after, state: { ...f.after.state, Other: 'changed' } };
  expect(ownedRoutingAdditions(f.plan, [f.table], [changed], [f.attachment])[0].state.Other).toBe('changed');
  const original = { ...f.table, state: { ...f.table.state, Associations: [f.edge] } };
  expect(ownedRoutingAdditions(f.plan, [original], [f.after], [f.attachment])[0].state.Associations).toEqual([f.edge]);
});
test('retains foreign, wrong-plan, cross-scope, missing and conflicting evidence for drift rejection', () => {
  for (const change of [
    (a: AwsCeResourceObservation) => {
      a.owned = false;
    },
    (a: AwsCeResourceObservation) => {
      a.exists = false;
    },
    (a: AwsCeResourceObservation) => {
      a.region = 'us-east-1';
    },
    (a: AwsCeResourceObservation) => {
      a.tags['xcsh-execution-engine'] = 'native';
    },
    (a: AwsCeResourceObservation) => {
      a.tags['xcsh-plan-sha256'] = 'b'.repeat(64);
    },
    (a: AwsCeResourceObservation) => {
      (a.state.TransitGatewayAttachments as Record<string, unknown>[])[0].ResourceId = 'vpc-99999999';
    },
    (a: AwsCeResourceObservation) => {
      (a.state.TransitGatewayAttachments as Record<string, unknown>[])[0].ResourceOwnerId = '000000000000';
    },
  ]) {
    const f = fixture();
    change(f.attachment);
    expect(ownedRoutingAdditions(f.plan, [f.table], [f.after], [f.attachment])).toEqual([f.after]);
  }
  const f = fixture();
  for (const evidence of [[], [f.attachment, f.attachment]])
    expect(ownedRoutingAdditions(f.plan, [f.table], [f.after], evidence)).toEqual([f.after]);
  f.plan.intent.routing.propagations = [];
  expect(ownedRoutingAdditions(f.plan, [f.table], [f.after], [f.attachment])[0].state.Propagations).toEqual(
    f.after.state.Propagations,
  );
});
test('rejects partial, malformed and duplicate edge evidence', () => {
  const f = fixture();
  expect(() =>
    routingAttachmentIds(f.plan, { resources: [{ ...f.after, state: { Associations: [] } }] } as AwsCeObservation),
  ).toThrow('Incomplete');
  f.after.state.Associations.push(f.edge);
  expect(() => ownedRoutingAdditions(f.plan, [f.table], [f.after], [f.attachment])).toThrow('Duplicate');
});
