import type { AwsExecApi } from '../aws/exec';
import type { AwsCePlan } from './types';

/** Reconcile association responses without remapping an address or repeating a completed association. */
export async function associateAwsCeEip(api: AwsExecApi, plan: AwsCePlan, args: string[], signal?: AbortSignal) {
  const allocation = args[args.indexOf('--allocation-id') + 1];
  const eni = args[args.indexOf('--network-interface-id') + 1];
  if (
    !/^eipalloc-[0-9a-f]{8,17}$/.test(allocation) ||
    !/^eni-[0-9a-f]{8,17}$/.test(eni) ||
    args[1] !== 'associate-address' ||
    args.includes('--allow-reassociation')
  )
    throw new Error('Explicit non-remapping CE association is required');
  const observe = async () => {
    const result = await api.exec(
      'aws',
      ['ec2', 'describe-addresses', '--allocation-ids', allocation, '--region', plan.region, '--output', 'json'],
      { signal },
    );
    if (result.exitCode) throw new Error('CE EIP association observation is unavailable');
    const data = JSON.parse(result.stdout);
    if (data.NextToken || !Array.isArray(data.Addresses) || data.Addresses.length !== 1)
      throw new Error('Incomplete CE EIP observation');
    const address = data.Addresses[0];
    const tags = Object.fromEntries(
      (address.Tags ?? []).map((tag: { Key: string; Value: string }) => [tag.Key, tag.Value]),
    );
    if (
      address.AllocationId !== allocation ||
      tags['xcsh-managed-by'] !== 'aws-ce' ||
      tags['xcsh-deployment-id'] !== plan.deploymentName ||
      tags['xcsh-execution-engine'] !== plan.engine ||
      tags['xcsh-plan-sha256'] !== plan.planSha256
    )
      throw new Error('CE EIP ownership differs from the deployment');
    if (
      address.AssociationId &&
      (!/^eipassoc-[0-9a-f]{8,17}$/.test(address.AssociationId) || address.NetworkInterfaceId !== eni)
    )
      throw new Error('CE EIP is associated with another target');
    return address.AssociationId as string | undefined;
  };
  let association = await observe();
  if (!association) {
    try {
      await api.exec('aws', [...args, '--no-allow-reassociation'], { signal });
    } catch {
      signal?.throwIfAborted();
    }
    association = await observe();
    if (!association) throw new Error('CE EIP association has not converged; reconcile before retrying');
  }
  return { exitCode: 0, stdout: JSON.stringify({ AssociationId: association }), stderr: '' };
}
