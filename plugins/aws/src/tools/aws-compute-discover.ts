import type { AwsExecApi } from '../aws/exec';
import type { PluginInterface } from '../aws/types';
import { saveAwsDiscovery } from '../ce/artifacts';
import type { AwsComputeDiscoveryInput } from '../ce/discovery';
import { discoverAwsCompute } from '../ce/discovery';
import { makeExecApi } from './shared';

export function createAwsComputeDiscoverTool(pi: PluginInterface, makeApi: (cwd: string) => AwsExecApi = makeExecApi) {
  const { Type } = pi.typebox;
  const capabilitySchema = Type.Object({
    smsv2ContractVersion: Type.Literal('v2'),
    supportedProviders: Type.Array(Type.Union([Type.Literal('aws'), Type.Literal('azure')])),
    bootstrapDrivers: Type.Array(Type.Union([Type.Literal('api'), Type.Literal('console')])),
    providerNetworkingProfiles: Type.Object({
      aws: Type.Optional(Type.Array(Type.String())),
      azure: Type.Optional(Type.Array(Type.String())),
    }),
    awsSmsv2TgwConnect: Type.Object({
      supported: Type.Boolean(),
      schemaVersion: Type.Union([Type.String(), Type.Null()]),
    }),
  });
  return {
    name: 'aws_compute_discover',
    label: 'Discover AWS CE Compute',
    description:
      'Mandatory read-only AWS Customer Edge research gate. Retrieves the canonical MCN contract and current F5/AWS sources, verifies STS identity and Marketplace agreement, enumerates all regions, pins the regional SSM AMI, and ranks instance, ENI, AZ, quota, policy, TGW, and brownfield evidence deterministically.',
    parameters: Type.Object({
      accountId: Type.String(),
      partition: Type.Union([Type.Literal('aws'), Type.Literal('aws-us-gov'), Type.Literal('aws-cn')]),
      deploymentName: Type.String(),
      requiredEnis: Type.Number({ minimum: 1, maximum: 8 }),
      nodeCount: Type.Union([Type.Literal(1), Type.Literal(3)]),
      instanceTypes: Type.Optional(Type.Array(Type.String())),
      brownfieldResourceIds: Type.Array(Type.String()),
      observedOwnedResourceIds: Type.Optional(Type.Array(Type.String())),
      ownedPlanSha256s: Type.Optional(Type.Array(Type.String())),
      resourceRegion: Type.Optional(Type.String()),
      egressMode: Type.Optional(
        Type.Union(['elastic-ip', 'nat-gateway', 'firewall', 'proxy'].map((value) => Type.Literal(value))),
      ),
      routingProfile: Type.Optional(
        Type.Union(['direct-eni', 'nlb-ingress', 'tgw-static', 'tgw-connect'].map((value) => Type.Literal(value))),
      ),
      f5Capabilities: capabilitySchema,
    }),
    async execute(
      _id: string,
      params: AwsComputeDiscoveryInput,
      _signal: AbortSignal | undefined,
      _update: unknown,
      ctx: { cwd: string; sessionManager: Parameters<typeof saveAwsDiscovery>[0] },
    ) {
      try {
        const observation = await discoverAwsCompute(params, makeApi(ctx.cwd));
        const artifactId = await saveAwsDiscovery(ctx.sessionManager, observation);
        const regions = observation.regions
          .map(
            (region) =>
              `${region.rank}. ${region.name}: ${region.eligible ? 'eligible' : `ineligible (${region.reasons.join(', ')})`}`,
          )
          .join('\n');
        const leading = observation.regions.find((region) => region.eligible);
        return {
          content: [
            {
              type: 'text' as const,
              text: `AWS identity: ${observation.identity.accountId} (${observation.identity.partition})\nShared contract: ${observation.research.sharedContract.contractId}/${observation.research.sharedContract.contractVersion} (${observation.research.sharedContract.normalizedSha256})\nMarketplace agreement: ${observation.agreement.active ? 'active' : 'not active; subscribe in the AWS Marketplace console and rediscover'}\nLeading eligible region: ${leading?.name ?? 'none'}\nPinned AMI: ${leading?.ami?.id ?? 'none'}\n${regions}\nDiscovery artifact: ${artifactId ? `artifact://${artifactId}` : 'session memory only'}`,
            },
          ],
          details: { tool: 'aws_compute_discover', artifactId, observation },
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `AWS CE discovery failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'aws_compute_discover' },
        };
      }
    },
  };
}
