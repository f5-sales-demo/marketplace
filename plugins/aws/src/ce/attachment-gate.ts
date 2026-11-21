import type { AwsExecApi } from '../aws/exec';
import type { AwsCeAction, AwsCeCheckpoint, AwsCePlan } from './types';

export async function assertAttachmentAvailable(
  action: AwsCeAction,
  plan: AwsCePlan,
  checkpoint: AwsCeCheckpoint,
  api: AwsExecApi,
): Promise<void> {
  const reference = action.resourceId ?? '';
  const id = checkpoint.resolvedValues[reference] ?? reference;
  if (!/^tgw-attach-[0-9a-f]{8,21}$/.test(id)) throw new Error('Attachment identity is unresolved');
  const connect = reference.startsWith('__TGW_CONNECT_ATTACHMENT_');
  const result = await api.exec('aws', [
    'ec2',
    connect ? 'describe-transit-gateway-connects' : 'describe-transit-gateway-vpc-attachments',
    '--transit-gateway-attachment-ids',
    id,
    '--region',
    plan.region,
    '--output',
    'json',
  ]);
  if (result.exitCode !== 0) throw new Error('Attachment observation unavailable');
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(result.stdout);
  } catch {
    throw new Error('Malformed attachment observation');
  }
  if (!raw || raw.NextToken) throw new Error('Incomplete attachment observation');
  const entries = raw[connect ? 'TransitGatewayConnects' : 'TransitGatewayVpcAttachments'];
  if (!Array.isArray(entries) || entries.length !== 1)
    throw new Error('Attachment observation is missing or ambiguous');
  const item = entries[0];
  if (!item || item.TransitGatewayAttachmentId !== id || item.TransitGatewayId !== plan.intent.routing.transitGatewayId)
    throw new Error('Attachment scope does not match the deployment');
  if (connect) {
    const transport =
      plan.intent.routing.transportAttachmentId ?? checkpoint.resolvedValues.__TGW_TRANSPORT_ATTACHMENT__;
    if (!transport || item.TransportTransitGatewayAttachmentId !== transport || item.Options?.Protocol !== 'gre')
      throw new Error('Connect transport identity or protocol does not match');
  } else if (
    !(plan.intent.vpc.vpcId ?? checkpoint.resolvedValues.__VPC_ID__) ||
    item.VpcId !== (plan.intent.vpc.vpcId ?? checkpoint.resolvedValues.__VPC_ID__) ||
    item.VpcOwnerId !== plan.accountId
  )
    throw new Error('Transport VPC identity or owner does not match');
  if (id !== plan.intent.routing.transportAttachmentId) {
    if (!Array.isArray(item.Tags)) throw new Error('Attachment ownership evidence unavailable');
    const tags = new Map<string, string>();
    for (const tag of item.Tags) {
      if (!tag || typeof tag.Key !== 'string' || typeof tag.Value !== 'string' || tags.has(tag.Key))
        throw new Error('Malformed attachment ownership evidence');
      tags.set(tag.Key, tag.Value);
    }
    if (
      tags.get('xcsh-managed-by') !== 'aws-ce' ||
      tags.get('xcsh-deployment-id') !== plan.deploymentName ||
      tags.get('xcsh-execution-engine') !== plan.engine
    )
      throw new Error('Attachment belongs to another deployment or engine');
  }
  if (item.State === 'available') return;
  if (['pending', 'modifying', 'initiating'].includes(item.State)) throw new Error('Attachment has not converged');
  throw new Error('Attachment is in an unsupported or terminal state');
}
