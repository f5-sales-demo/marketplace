import type { AwsExecApi } from '../aws/exec';
import type { AwsCeAction, AwsCeCheckpoint, AwsCePlan } from './types';

/** Clear only default outbound rules on a newly created, exactly owned group. */
export async function resetAwsSecurityGroupEgress(
  action: AwsCeAction,
  plan: AwsCePlan,
  checkpoint: AwsCeCheckpoint,
  api: AwsExecApi,
) {
  const id = checkpoint.resolvedValues[action.resourceId ?? ''];
  if (!/^sg-[0-9a-f]{8,17}$/.test(id ?? '')) throw new Error('Security group identity is unresolved');
  const observe = async () => {
    const result = await api.exec('aws', [
      'ec2',
      'describe-security-groups',
      '--group-ids',
      id,
      '--region',
      plan.region,
      '--output',
      'json',
    ]);
    if (result.exitCode) throw new Error('Security group ownership is unavailable');
    const data = JSON.parse(result.stdout);
    if (data.NextToken || !Array.isArray(data.SecurityGroups) || data.SecurityGroups.length !== 1)
      throw new Error('Security group observation is incomplete');
    const group = data.SecurityGroups[0];
    const tags = Object.fromEntries(
      (group.Tags ?? []).map((tag: { Key: string; Value: string }) => [tag.Key, tag.Value]),
    );
    if (
      group.GroupId !== id ||
      group.VpcId !== (plan.intent.vpc.vpcId ?? checkpoint.resolvedValues.__VPC_ID__) ||
      tags['xcsh-managed-by'] !== 'aws-ce' ||
      tags['xcsh-deployment-id'] !== plan.deploymentName ||
      tags['xcsh-plan-sha256'] !== plan.planSha256 ||
      tags['xcsh-execution-engine'] !== plan.engine ||
      !Array.isArray(group.IpPermissionsEgress)
    )
      throw new Error('Security group ownership or scope changed');
    return group.IpPermissionsEgress as Array<Record<string, unknown>>;
  };
  const rules = await observe();
  if (!rules.length) return;
  for (const rule of rules) {
    const ipv4 = rule.IpRanges as Array<{ CidrIp?: string }> | undefined;
    const ipv6 = rule.Ipv6Ranges as Array<{ CidrIpv6?: string }> | undefined;
    if (
      rule.IpProtocol !== '-1' ||
      !Array.isArray(ipv4) ||
      !Array.isArray(ipv6) ||
      ipv4.some((range) => range.CidrIp !== '0.0.0.0/0') ||
      ipv6.some((range) => range.CidrIpv6 !== '::/0') ||
      !Array.isArray(rule.UserIdGroupPairs) ||
      rule.UserIdGroupPairs.length ||
      !Array.isArray(rule.PrefixListIds) ||
      rule.PrefixListIds.length
    )
      throw new Error('Security group contains unexpected egress rules; replan required');
  }
  await api.exec('aws', [
    'ec2',
    'revoke-security-group-egress',
    '--group-id',
    id,
    '--ip-permissions',
    JSON.stringify(rules),
    '--region',
    plan.region,
    '--output',
    'json',
  ]);
  // Reconcile a lost revoke response by observing the exact group, never by blindly revoking again.
  if ((await observe()).length) throw new Error('Security group default egress removal has not converged');
}
