import type { PluginInterface } from '../aws/types';
import { loadAwsDiscovery, loadAwsPlan, saveAwsPlan } from '../ce/artifacts';
import { compileAwsCePlan } from '../ce/planner';
import type { AwsCeIntent } from '../ce/types';
import { AWS_CE_MARKETPLACE_PRODUCT_ID, AWS_CE_SCHEMA_VERSION } from '../ce/types';

export function createAwsCePlanTool(pi: PluginInterface) {
  const { Type } = pi.typebox;
  const stringArray = Type.Array(Type.String());
  const subnet = Type.Object({
    availabilityZone: Type.String(),
    subnetId: Type.Optional(Type.String()),
    cidr: Type.Optional(Type.String()),
  });
  const networkInterface = Type.Object({
    index: Type.Number(),
    role: Type.Union(['slo', 'sli', 'management', 'service', 'workload'].map((value) => Type.Literal(value))),
    vrf: Type.String(),
    subnets: Type.Array(subnet),
    addressing: Type.Object({
      mode: Type.Union([Type.Literal('dhcp'), Type.Literal('static')]),
      addresses: Type.Optional(stringArray),
    }),
  });
  const rule = Type.Object({
    protocol: Type.String(),
    fromPort: Type.Optional(Type.Number()),
    toPort: Type.Optional(Type.Number()),
    cidrs: stringArray,
  });
  return {
    name: 'aws_ce_plan',
    label: 'Plan AWS Customer Edge',
    description:
      'Compile a live AWS discovery receipt and normalized SMSv2 intent into a deterministic, immutable, secret-free plan containing exact argv arrays, ownership, rollback, billable resources, and lifecycle gates.',
    parameters: Type.Object({
      discoveryArtifactId: Type.String(),
      restorationPlanId: Type.Optional(Type.String()),
      restorationPlanSha256: Type.Optional(Type.String()),
      intent: Type.Object({
        schemaVersion: Type.Literal(AWS_CE_SCHEMA_VERSION),
        operation: Type.Union(
          [
            'deploy',
            'reconcile',
            'start',
            'stop',
            'resize',
            'update-network',
            'replace-node',
            'repair',
            'teardown',
          ].map((value) => Type.Literal(value)),
        ),
        accountId: Type.String(),
        partition: Type.Union([Type.Literal('aws'), Type.Literal('aws-us-gov'), Type.Literal('aws-cn')]),
        region: Type.String(),
        deploymentName: Type.String(),
        siteName: Type.String(),
        namespace: Type.String(),
        topology: Type.Object({ nodeCount: Type.Union([Type.Literal(1), Type.Literal(3)]) }),
        vpc: Type.Object({
          mode: Type.Union([Type.Literal('greenfield'), Type.Literal('brownfield')]),
          vpcId: Type.Optional(Type.String()),
          cidr: Type.Optional(Type.String()),
        }),
        interfaces: Type.Array(networkInterface, { minItems: 1, maxItems: 8 }),
        egress: Type.Object({
          mode: Type.Union(['elastic-ip', 'nat-gateway', 'firewall', 'proxy'].map((value) => Type.Literal(value))),
          resourceId: Type.Optional(Type.String()),
        }),
        routing: Type.Object({
          profile: Type.Union(
            ['direct-eni', 'nlb-ingress', 'tgw-static', 'tgw-connect'].map((value) => Type.Literal(value)),
          ),
          destinationCidrs: stringArray,
          transitGatewayId: Type.Optional(Type.String()),
          transportAttachmentId: Type.Optional(Type.String()),
          transitGatewayRouteTableId: Type.Optional(Type.String()),
          customerAsn: Type.Optional(Type.Number()),
          transitGatewayAsn: Type.Optional(Type.Number()),
          insideCidrs: Type.Optional(stringArray),
          associations: stringArray,
          propagations: stringArray,
        }),
        image: Type.Object({ productId: Type.Literal(AWS_CE_MARKETPLACE_PRODUCT_ID), amiId: Type.String() }),
        instance: Type.Object({
          type: Type.String(),
          diskGiB: Type.Number(),
          instanceProfileArn: Type.Optional(Type.String()),
        }),
        securityGroups: Type.Array(
          Type.Object({ name: Type.String(), ingress: Type.Array(rule), egress: Type.Array(rule) }),
        ),
        routes: Type.Array(Type.Object({ routeTableId: Type.String(), destinationCidr: Type.String() })),
        brownfield: Type.Object({
          resourceIds: stringArray,
          routeTableIds: stringArray,
          transitGatewayRouteTableIds: stringArray,
        }),
        replacementNode: Type.Optional(Type.Number()),
      }),
    }),
    async execute(
      _id: string,
      params: {
        discoveryArtifactId: string;
        restorationPlanId?: string;
        restorationPlanSha256?: string;
        intent: AwsCeIntent;
      },
      _signal: AbortSignal | undefined,
      _update: unknown,
      ctx: { sessionManager: Parameters<typeof loadAwsDiscovery>[0] },
    ) {
      try {
        const observation = await loadAwsDiscovery(ctx.sessionManager, params.discoveryArtifactId);
        let restorationState: Array<{ id: string; before: Record<string, unknown> }> = [];
        if (params.intent.operation === 'teardown') {
          if (!params.restorationPlanId || !params.restorationPlanSha256)
            throw new Error('Teardown requires the exact original deployment plan ID and SHA-256 for restoration');
          const original = (
            await loadAwsPlan(ctx.sessionManager, params.restorationPlanId, params.restorationPlanSha256)
          ).plan;
          if (
            original.accountId !== params.intent.accountId ||
            original.partition !== params.intent.partition ||
            original.region !== params.intent.region ||
            original.deploymentName !== params.intent.deploymentName ||
            original.siteName !== params.intent.siteName
          )
            throw new Error('Original restoration plan scope does not match teardown intent');
          restorationState = original.rollback.resources;
        } else if (params.restorationPlanId || params.restorationPlanSha256) {
          throw new Error('Restoration plan coordinates are valid only for teardown');
        }
        const plan = compileAwsCePlan(params.intent, observation, restorationState);
        const artifactId = await saveAwsPlan(ctx.sessionManager, plan, observation);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Plan ID: ${plan.planId}\nSHA-256: ${plan.planSha256}\nRegion: ${plan.region}\nTopology: ${plan.topology.nodeCount} node(s), ${plan.interfaces.length} ENI(s) each\nPinned AMI/SSM version: ${plan.image.id}/${plan.image.ssmVersion}\nBillable resources: ${plan.billableResources.map((item) => `${item.count} ${item.type}`).join(', ')}\nOrdered actions: ${plan.actions.length}\nPlan artifact: ${artifactId ? `artifact://${artifactId}` : 'session memory only'}`,
            },
          ],
          details: { tool: 'aws_ce_plan', artifactId, plan },
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `AWS CE planning failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'aws_ce_plan' },
        };
      }
    },
  };
}
