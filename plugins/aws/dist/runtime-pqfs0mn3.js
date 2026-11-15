// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun
import { saveAwsDiscovery } from './runtime-np6pq61g.js';
import { awsPlatformService, discoverAwsCompute } from './runtime-pv55z3nj.js';
import './runtime-fex55vat.js';
import { makeExecApi } from './runtime-30f0rzjf.js';

// plugins/aws/src/tools/aws-compute-discover.ts
function createAwsComputeDiscoverTool(pi, makeApi = makeExecApi) {
  const { Type } = pi.typebox;
  return {
    name: 'aws_compute_discover',
    label: 'Discover AWS CE Compute',
    description:
      'Mandatory read-only AWS Customer Edge research gate. Retrieves the canonical MCN contract and current F5/AWS sources, verifies STS identity and Marketplace agreement, enumerates the authoritative region catalog, qualifies all regions or the explicitly selected resourceRegion, pins the regional SSM AMI, and ranks instance, ENI, AZ, quota, policy, TGW, and brownfield evidence deterministically.',
    parameters: Type.Object({
      awsProfile: Type.Optional(Type.String()),
      vpcMode: Type.Optional(Type.Union([Type.Literal('greenfield'), Type.Literal('brownfield')])),
      accountId: Type.String(),
      partition: Type.Union([Type.Literal('aws'), Type.Literal('aws-us-gov'), Type.Literal('aws-cn')]),
      deploymentName: Type.String(),
      requiredEnis: Type.Number({
        minimum: 1,
        maximum: 8,
        description: 'Required physical ENIs per instance, not the deployment total.',
      }),
      nodeCount: Type.Union([Type.Literal(1), Type.Literal(3)]),
      instanceTypes: Type.Optional(Type.Array(Type.String())),
      brownfieldResourceIds: Type.Array(Type.String()),
      observedOwnedResourceIds: Type.Optional(Type.Array(Type.String())),
      ownedPlanSha256s: Type.Optional(Type.Array(Type.String())),
      resourceRegion: Type.Optional(Type.String()),
      regionQualificationScope: Type.Optional(
        Type.Union([Type.Literal('all-regions'), Type.Literal('resource-region')], {
          description:
            'Qualify all regions by default, or only the explicit resourceRegion for an already selected deployment.',
        }),
      ),
      bootstrapKeyPairNames: Type.Optional(
        Type.Array(Type.String(), {
          minItems: 1,
          maxItems: 1,
          description:
            'One existing EC2 boot key-pair name; requires explicit resourceRegion and DescribeKeyPairs permission. The caller retains key custody.',
        }),
      ),
      egressMode: Type.Optional(
        Type.Union(['elastic-ip', 'nat-gateway', 'firewall', 'proxy'].map((value) => Type.Literal(value))),
      ),
      routingProfile: Type.Optional(
        Type.Union(['direct-eni', 'nlb-ingress', 'tgw-static', 'tgw-connect'].map((value) => Type.Literal(value))),
      ),
      platformContext: Type.Optional(Type.String()),
    }),
    async execute(_id, params, signal, _update, ctx) {
      try {
        if (Object.hasOwn(params, 'f5Capabilities')) throw new Error('Caller-supplied F5 capabilities are unsupported');
        const platform = await awsPlatformService(pi, signal);
        const f5Capabilities = await platform.capabilities(params.platformContext);
        const observation = await discoverAwsCompute({ ...params, f5Capabilities }, makeApi(ctx.cwd));
        const artifactId = await saveAwsDiscovery(ctx.sessionManager, observation);
        const regions = observation.regions
          .map(
            (region) =>
              `${region.rank}. ${region.name}: ${region.eligible ? 'eligible' : `ineligible (${region.reasons.join(', ')})`}`,
          )
          .join(`
`);
        const leading = observation.regions.find((region) => region.eligible);
        return {
          content: [
            {
              type: 'text',
              text: `AWS identity: ${observation.identity.accountId} (${observation.identity.partition})
Shared contract: ${observation.research.sharedContract.contractId}/${observation.research.sharedContract.contractVersion} (${observation.research.sharedContract.normalizedSha256})
Marketplace agreement: ${observation.agreement.active ? 'active' : 'not active; subscribe in the AWS Marketplace console and rediscover'}
Leading eligible region: ${leading?.name ?? 'none'}
Pinned AMI: ${leading?.ami?.id ?? 'none'}
${regions}
Discovery artifact: ${artifactId ? `artifact://${artifactId}` : 'session memory only'}`,
            },
          ],
          details: { tool: 'aws_compute_discover', artifactId, observation },
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
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

export { createAwsComputeDiscoverTool };
