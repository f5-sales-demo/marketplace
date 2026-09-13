import type { CePlatformService } from '../../../platform/src/ce/service';
import type { AwsExecApi } from '../aws/exec';
import { verifyAwsCePlan } from './artifacts';
import { canonicalSha256, resourceConfiguration } from './canonical';
import { discoverAwsCompute, observeAwsResources } from './discovery';
import { scopedAwsApi } from './scoped-exec';
import { ownedRoutingAdditions, routingAttachmentIds } from './terraform-routing-references';
import type { AwsCeObservation, AwsCePlan } from './types';

/** Recheck immutable inputs and remaining capacity, allowing this deployment's already allocated EIPs. */
export async function revalidateAwsTerraformPlan(
  plan: AwsCePlan,
  baseline: AwsCeObservation,
  platform: CePlatformService,
  rawApi: AwsExecApi,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
) {
  verifyAwsCePlan(plan);
  if (plan.engine !== 'terraform' || plan.intent.operation !== 'deploy' || plan.intent.vpc.mode !== 'greenfield')
    throw new Error('Terraform deployment preflight requires a greenfield owning plan');
  const api = scopedAwsApi(rawApi, plan.intent.awsProfile, signal);
  const result = await api.exec('aws', [
    'ec2',
    'describe-addresses',
    '--region',
    plan.region,
    '--output',
    'json',
    '--filters',
    `Name=tag:xcsh-deployment-id,Values=${plan.deploymentName}`,
  ]);
  if (result.exitCode !== 0) throw new Error('Terraform deployment EIP ownership is unavailable');
  const addresses = JSON.parse(result.stdout) as {
    Addresses?: Array<{ AllocationId?: string; Tags?: Array<{ Key: string; Value: string }> }>;
    NextToken?: string;
  };
  if (!Array.isArray(addresses.Addresses) || addresses.NextToken) throw new Error('Incomplete Terraform EIP inventory');
  const ids = addresses.Addresses.map((address) => {
    const tags = Object.fromEntries((address.Tags ?? []).map((tag) => [tag.Key, tag.Value]));
    if (
      !/^eipalloc-[0-9a-f]{8,21}$/.test(address.AllocationId ?? '') ||
      tags['xcsh-managed-by'] !== 'aws-ce' ||
      tags['xcsh-execution-engine'] !== 'terraform' ||
      tags['xcsh-deployment-id'] !== plan.deploymentName ||
      tags['xcsh-plan-sha256'] !== plan.planSha256
    )
      throw new Error('Terraform EIP belongs to a different plan or engine');
    return address.AllocationId as string;
  });
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate Terraform EIP identity');
  const f5Capabilities = await platform.capabilities(plan.intent.platformContext);
  const current = await discoverAwsCompute(
    {
      awsProfile: plan.intent.awsProfile,
      accountId: plan.accountId,
      partition: plan.partition,
      deploymentName: plan.deploymentName,
      requiredEnis: plan.interfaces.length,
      nodeCount: plan.topology.nodeCount,
      instanceTypes: [plan.instance.type],
      brownfieldResourceIds: terraformRoutingReferences(plan),
      observedOwnedResourceIds: ids,
      ownedPlanSha256s: [plan.planSha256],
      resourceRegion: plan.region,
      egressMode: plan.egress.mode,
      routingProfile: plan.routing.profile,
      f5Capabilities,
    },
    api,
    fetcher,
  );
  const attachmentIds = routingAttachmentIds(plan, current);
  if (attachmentIds.length)
    current.resources.push(
      ...(await observeAwsResources(api, attachmentIds, plan.region, {
        deploymentName: plan.deploymentName,
        planSha256s: [plan.planSha256],
      })),
    );
  assertAwsTerraformPreflight(plan, baseline, current);
  return current;
}

export function assertAwsTerraformPreflight(
  plan: AwsCePlan,
  baseline: AwsCeObservation,
  current: AwsCeObservation,
): void {
  const region = current.regions.filter((item) => item.name === plan.region);
  if (
    current.identity.accountId !== plan.accountId ||
    current.identity.partition !== plan.partition ||
    current.identity.awsProfile !== plan.intent.awsProfile ||
    !current.agreement.active ||
    current.agreement.productId !== baseline.agreement.productId ||
    current.f5CapabilitiesSha256 !== plan.f5CapabilitiesSha256 ||
    canonicalSha256(current.research.sourceReceipts) !== canonicalSha256(baseline.research.sourceReceipts) ||
    region.length !== 1 ||
    !region[0].enabled ||
    !region[0].eligible ||
    canonicalSha256(region[0].ami) !== canonicalSha256(plan.image)
  )
    throw new Error('Terraform preflight identity, image, agreement, contract or capacity changed');
  const types = region[0].instanceTypes.filter((item) => item.name === plan.instance.type);
  if (
    types.length !== 1 ||
    !types[0].supported ||
    plan.topology.availabilityZones.some((zone) => !types[0].availabilityZones.includes(zone))
  )
    throw new Error('Terraform instance offering no longer supports the planned topology');
  const references = terraformRoutingReferences(plan);
  if (references.length) {
    const select = (observation: AwsCeObservation) =>
      observation.resources.filter((item) => references.includes(item.id));
    const before = select(baseline);
    const after = select(current);
    if (
      before.length !== references.length ||
      after.length !== references.length ||
      after.some((item) => !item.exists || item.region !== plan.region) ||
      canonicalSha256(resourceConfiguration(before)) !==
        canonicalSha256(resourceConfiguration(ownedRoutingAdditions(plan, before, after, current.resources)))
    )
      throw new Error('Terraform routing reference configuration changed');
  }
}

function terraformRoutingReferences(plan: AwsCePlan): string[] {
  const routing = plan.intent.routing;
  return routing?.profile === 'tgw-connect'
    ? [
        ...new Set(
          [routing.transitGatewayId, ...routing.associations, ...routing.propagations].filter((id): id is string =>
            Boolean(id),
          ),
        ),
      ]
    : [];
}
