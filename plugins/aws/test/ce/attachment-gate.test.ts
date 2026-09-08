import { expect, it } from 'bun:test';
import type { AwsExecApi } from '../../src/aws/exec';
import { assertAttachmentAvailable } from '../../src/ce/attachment-gate';
import type { AwsCeAction, AwsCeCheckpoint, AwsCePlan } from '../../src/ce/types';

const id = 'tgw-attach-0123456789abcdef0';
const plan = {
  region: 'us-east-1',
  accountId: '123456789012',
  deploymentName: 'ce-test',
  engine: 'native',
  intent: { routing: { transitGatewayId: 'tgw-0123456789abcdef0' }, vpc: { vpcId: 'vpc-0123456789abcdef0' } },
} as AwsCePlan;
const checkpoint = { resolvedValues: { __TGW_TRANSPORT_ATTACHMENT__: id } } as AwsCeCheckpoint;
const action = { kind: 'tgw-attachment-gate', resourceId: '__TGW_TRANSPORT_ATTACHMENT__' } as AwsCeAction;
const item = {
  TransitGatewayAttachmentId: id,
  TransitGatewayId: plan.intent.routing.transitGatewayId,
  VpcId: plan.intent.vpc.vpcId,
  VpcOwnerId: plan.accountId,
  State: 'available',
  Tags: [
    { Key: 'xcsh-managed-by', Value: 'aws-ce' },
    { Key: 'xcsh-deployment-id', Value: 'ce-test' },
    { Key: 'xcsh-execution-engine', Value: 'native' },
  ],
};
const api = (raw: unknown): AwsExecApi => ({
  exec: async (_command, args) => {
    expect(args).toContain('--transit-gateway-attachment-ids');
    expect(args).toContain(id);
    expect(args).toContain(plan.region);
    return { stdout: JSON.stringify(raw), stderr: '', exitCode: 0 };
  },
});

it('waits only for valid pending attachment evidence and accepts available', async () => {
  await assertAttachmentAvailable(action, plan, checkpoint, api({ TransitGatewayVpcAttachments: [item] }));
  await expect(
    assertAttachmentAvailable(
      action,
      plan,
      checkpoint,
      api({ TransitGatewayVpcAttachments: [{ ...item, State: 'pending' }] }),
    ),
  ).rejects.toThrow('has not converged');
  for (const change of [
    { State: 'failed' },
    { VpcOwnerId: '999999999999' },
    { Tags: [] },
    { TransitGatewayId: 'tgw-fffffffffffffffff' },
  ]) {
    await expect(
      assertAttachmentAvailable(
        action,
        plan,
        checkpoint,
        api({ TransitGatewayVpcAttachments: [{ ...item, ...change }] }),
      ),
    ).rejects.not.toThrow('has not converged');
  }
  await expect(
    assertAttachmentAvailable(
      action,
      plan,
      checkpoint,
      api({ TransitGatewayVpcAttachments: [item], NextToken: 'more' }),
    ),
  ).rejects.toThrow('Incomplete');
});

it('binds Connect availability to the exact GRE transport and owner', async () => {
  const connectAction = { ...action, resourceId: '__TGW_CONNECT_ATTACHMENT_0_1__' };
  const connectCheckpoint = {
    ...checkpoint,
    resolvedValues: { ...checkpoint.resolvedValues, __TGW_CONNECT_ATTACHMENT_0_1__: id },
  };
  const connect = { ...item, TransportTransitGatewayAttachmentId: id, Options: { Protocol: 'gre' } };
  await assertAttachmentAvailable(connectAction, plan, connectCheckpoint, api({ TransitGatewayConnects: [connect] }));
  await expect(
    assertAttachmentAvailable(
      connectAction,
      plan,
      connectCheckpoint,
      api({
        TransitGatewayConnects: [{ ...connect, TransportTransitGatewayAttachmentId: 'tgw-attach-fffffffffffffffff' }],
      }),
    ),
  ).rejects.toThrow('transport identity');
});
