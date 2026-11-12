import { expect, test } from 'bun:test';
import { canonicalSha256, fingerprintObservation } from '../../src/ce/canonical';
import { awsDeleteRequestSha256 } from '../../src/ce/delete-recovery';
import { projectAwsPendingDeleteObservation } from '../../src/ce/delete-revalidation';
import type {
  AwsCeAction,
  AwsCeCheckpoint,
  AwsCeObservation,
  AwsCePlan,
  AwsCeResourceObservation,
} from '../../src/ce/types';

function fixture(kind = 'resource-delete') {
  const tags = {
    'xcsh-managed-by': 'aws-ce',
    'xcsh-execution-engine': 'native',
    'xcsh-deployment-id': 'ce',
    'xcsh-plan-sha256': 'a'.repeat(64),
  };
  const id =
    kind === 'route-table-disassociate'
      ? 'rtb-12345678'
      : kind === 'internet-gateway-detach'
        ? 'igw-12345678'
        : 'vpc-12345678';
  const args =
    kind === 'route-table-disassociate'
      ? ['ec2', 'disassociate-route-table', '--association-id', 'rtbassoc-12345678']
      : kind === 'internet-gateway-detach'
        ? ['ec2', 'detach-internet-gateway', '--internet-gateway-id', id, '--vpc-id', 'vpc-12345678']
        : ['ec2', 'delete-vpc', '--vpc-id', id];
  const action = { id: 'action-1', resourceId: id, command: 'aws', kind, args } as AwsCeAction;
  const plan = {
    engine: 'native',
    planSha256: 'b'.repeat(64),
    deploymentName: 'ce',
    region: 'us-east-1',
    actions: [action],
  } as AwsCePlan;
  const state =
    kind === 'route-table-disassociate'
      ? {
          RouteTables: [
            {
              RouteTableId: id,
              Associations: [
                { RouteTableAssociationId: 'rtbassoc-12345678', SubnetId: 'subnet-12345678' },
                { RouteTableAssociationId: 'rtbassoc-ffffffff', SubnetId: 'subnet-ffffffff' },
              ],
            },
          ],
        }
      : kind === 'internet-gateway-detach'
        ? {
            InternetGateways: [
              { InternetGatewayId: id, Attachments: [{ VpcId: 'vpc-12345678' }, { VpcId: 'vpc-ffffffff' }] },
            ],
          }
        : { Vpcs: [{ VpcId: id, CidrBlock: '10.0.0.0/16' }] };
  const before = { id, region: plan.region, exists: true, owned: true, tags, state } as AwsCeResourceObservation;
  const extra = {
    id: 'sg-12345678',
    region: plan.region,
    exists: true,
    owned: true,
    tags,
    state: { SecurityGroups: [{ GroupId: 'sg-12345678', IpPermissions: [] }] },
  } as AwsCeResourceObservation;
  const baseline = {
    schemaVersion: 2,
    identity: { accountId: '123456789012', partition: 'aws', arn: 'arn:aws:iam::123456789012:role/test' },
    agreement: { active: true },
    regions: [{ name: plan.region, eligible: true }],
    resources: [before, extra],
    research: {},
    f5Capabilities: {},
    f5CapabilitiesSha256: 'c'.repeat(64),
  } as AwsCeObservation;
  const current = structuredClone(baseline);
  if (kind === 'resource-delete')
    current.resources[0] = { id, region: plan.region, exists: false, owned: false, tags: {}, state: { Vpcs: [] } };
  const checkpoint = {
    completedActionIds: [],
    resolvedValues: {},
    pendingDelete: {
      actionId: action.id,
      resourceId: id,
      requestSha256: awsDeleteRequestSha256(plan, action, args),
      before,
      beforeSha256: canonicalSha256(before),
    },
  } as AwsCeCheckpoint;
  return { plan, args, before, baseline, current, checkpoint, ownerDigests: ['a'.repeat(64)] };
}
test('exact pending deletion restores only its recorded target for global drift comparison', () => {
  const f = fixture();
  const projected = projectAwsPendingDeleteObservation(f.plan, f.current, f.checkpoint, f.args, f.ownerDigests);
  expect(
    fingerprintObservation(
      projected,
      f.baseline.resources.map((r) => r.id),
    ),
  ).toBe(
    fingerprintObservation(
      f.baseline,
      f.baseline.resources.map((r) => r.id),
    ),
  );
  expect(f.current.resources[0].exists).toBe(false);
  f.current.resources[1].tags.foreign = 'changed';
  const drift = projectAwsPendingDeleteObservation(f.plan, f.current, f.checkpoint, f.args, f.ownerDigests);
  expect(
    fingerprintObservation(
      drift,
      f.baseline.resources.map((r) => r.id),
    ),
  ).not.toBe(
    fingerprintObservation(
      f.baseline,
      f.baseline.resources.map((r) => r.id),
    ),
  );
  f.current.regions[0].eligible = false;
  expect(
    projectAwsPendingDeleteObservation(f.plan, f.current, f.checkpoint, f.args, f.ownerDigests).regions[0].eligible,
  ).toBe(false);
});
for (const kind of ['route-table-disassociate', 'internet-gateway-detach'])
  test(`only the exact ${kind} relationship change is admitted`, () => {
    const f = fixture(kind);
    const state = f.current.resources[0].state;
    if (kind === 'route-table-disassociate')
      (state.RouteTables as Array<{ Associations: unknown[] }>)[0].Associations.splice(0, 1);
    else (state.InternetGateways as Array<{ Attachments: unknown[] }>)[0].Attachments.splice(0, 1);
    expect(
      projectAwsPendingDeleteObservation(f.plan, f.current, f.checkpoint, f.args, f.ownerDigests).resources[0],
    ).toEqual(f.before);
    f.current.resources[0].tags.foreign = 'changed';
    expect(() => projectAwsPendingDeleteObservation(f.plan, f.current, f.checkpoint, f.args, f.ownerDigests)).toThrow(
      'unrelated target drift',
    );
  });
for (const failure of [
  'request',
  'snapshot',
  'owner',
  'foreign-current',
  'duplicate-current',
  'missing-current',
  'prefix',
])
  test(`pending deletion projection rejects ${failure}`, () => {
    const f = fixture();
    if (failure === 'request') f.args.push('--dry-run');
    if (failure === 'snapshot') f.before.state.malformed = true;
    if (failure === 'owner') {
      f.before.tags['xcsh-deployment-id'] = 'foreign';
      if (!f.checkpoint.pendingDelete) throw Error();
      f.checkpoint.pendingDelete.beforeSha256 = canonicalSha256(f.before);
    }
    if (failure === 'foreign-current') {
      f.current.resources[0] = structuredClone(f.before);
      f.current.resources[0].owned = false;
      f.current.resources[0].tags['xcsh-deployment-id'] = 'foreign';
    }
    if (failure === 'duplicate-current') f.current.resources.push(f.current.resources[0]);
    if (failure === 'missing-current') f.current.resources.shift();
    if (failure === 'prefix') f.checkpoint.completedActionIds = ['foreign'];
    expect(() => projectAwsPendingDeleteObservation(f.plan, f.current, f.checkpoint, f.args, f.ownerDigests)).toThrow();
  });
