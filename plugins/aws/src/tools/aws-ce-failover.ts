import type { CePlatformService } from '../../../platform/src/ce/service';
import type { CeTerraformService } from '../../../terraform/src/service';
import type { AwsExecApi } from '../aws/exec';
import type { PluginInterface } from '../aws/types';
import { type AwsCeToolContext, loadAwsPlan } from '../ce/artifacts';
import { canonicalSha256 } from '../ce/canonical';
import { collectAwsFailoverBgpHealth } from '../ce/failover-health';
import { awsPlatformService } from '../ce/platform';
import { scopedAwsApi } from '../ce/scoped-exec';
import { awsTerraformService } from '../ce/terraform-apply';
import {
  type AwsTerraformFailover,
  buildAwsTerraformFailover,
  runAwsTerraformFailover,
  verifyAwsTerraformFailover,
} from '../ce/terraform-failover';
import { awsTerraformFoundationDeployment } from '../ce/terraform-foundation';
import { siteForNode } from '../ce/topology';
import type { AwsCeCheckpoint } from '../ce/types';
import { makeExecApi } from './shared';

interface Dependencies {
  platform(pi: PluginInterface, signal?: AbortSignal): Promise<CePlatformService>;
  terraform(pi: PluginInterface, signal?: AbortSignal): Promise<CeTerraformService>;
  makeApi(cwd: string): AwsExecApi;
  run: typeof runAwsTerraformFailover;
  collect: typeof collectAwsFailoverBgpHealth;
}
const defaults: Dependencies = {
  platform: awsPlatformService,
  terraform: awsTerraformService,
  makeApi: makeExecApi,
  run: runAwsTerraformFailover,
  collect: collectAwsFailoverBgpHealth,
};
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed failover identity');
  return value as Record<string, unknown>;
};
async function optional(storage: Awaited<ReturnType<CePlatformService['storage']>>, name: string) {
  try {
    return await storage.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export function createAwsCeFailoverTool(pi: PluginInterface, dependencies: Dependencies = defaults) {
  const { Type } = pi.typebox;
  return {
    name: 'aws_ce_failover',
    label: 'Validate AWS Customer Edge Failover',
    description:
      'Prepare or execute a Terraform-owned planned CE outage. Apply resumes exact saved plans, proves the selected BGP withdrawal and restoration from live AWS evidence, releases the power control, and requires a final no-change plan.',
    parameters: Type.Object({
      operation: Type.Union([Type.Literal('prepare'), Type.Literal('apply')]),
      basePlanId: Type.String(),
      basePlanSha256: Type.String(),
      nodeIndex: Type.Optional(Type.Number()),
      failoverPlanId: Type.Optional(Type.String()),
      failoverPlanSha256: Type.Optional(Type.String()),
    }),
    async execute(
      _id: string,
      params: {
        operation: 'prepare' | 'apply';
        basePlanId: string;
        basePlanSha256: string;
        nodeIndex?: number;
        failoverPlanId?: string;
        failoverPlanSha256?: string;
      },
      signal: AbortSignal | undefined,
      _update: unknown,
      ctx: AwsCeToolContext,
    ) {
      try {
        const allowed =
          params.operation === 'prepare'
            ? ['basePlanId', 'basePlanSha256', 'nodeIndex', 'operation']
            : ['basePlanId', 'basePlanSha256', 'failoverPlanId', 'failoverPlanSha256', 'operation'];
        if (Object.keys(params).some((key) => !allowed.includes(key)))
          throw new Error(`AWS CE failover ${params.operation} parameters differ`);
        const { plan } = await loadAwsPlan(ctx.sessionManager, params.basePlanId, params.basePlanSha256);
        if (plan.engine !== 'terraform' || plan.routing.profile !== 'tgw-connect')
          throw new Error('This failover executor requires a Terraform-owned TGW Connect deployment');
        const platform = await dependencies.platform(pi, signal);
        const owner = {
          deploymentId: plan.deploymentName,
          engine: 'terraform' as const,
          provider: 'aws' as const,
          account: plan.accountId,
          region: plan.region,
        };
        const storage = await platform.storage(owner);
        const terraform = await dependencies.terraform(pi, signal);
        const session = await terraform.open(owner, await awsTerraformFoundationDeployment(plan), 'current');
        if (params.operation === 'prepare') {
          if (!Number.isInteger(params.nodeIndex)) throw new Error('Failover preparation requires an exact nodeIndex');
          const marker = object(await storage.read('terraform-connect-stage.json'));
          if (
            marker.schemaVersion !== 1 ||
            marker.engine !== 'terraform' ||
            marker.planSha256 !== plan.planSha256 ||
            marker.stage !== 'applied' ||
            typeof marker.configurationSha256 !== 'string'
          )
            throw new Error('Terraform Connect deployment has not completed');
          const configuration = await session.readConfiguration(marker.configurationSha256);
          const outputs = await session.readOutputs(['ce_instances'], process.env, signal);
          const instances = object(outputs.ce_instances);
          const identities = Object.entries(instances).map(([node, value]) => ({ node, value: object(value) }));
          if (
            identities.length !== plan.intent.topology.nodeCount ||
            new Set(identities.map(({ value }) => value.id)).size !== identities.length ||
            identities.some(
              ({ node, value }) =>
                !/^i-[0-9a-f]{8,17}$/.test(String(value.id)) ||
                value.hostname !== `${plan.deploymentName}-${node}` ||
                value.site_name !== siteForNode(plan.intent, Number(node)).name,
            )
          )
            throw new Error('Terraform instance output is incomplete');
          const selected = object(instances[String(params.nodeIndex)]);
          if (typeof selected.id !== 'string') throw new Error('Selected Terraform instance identity is unavailable');
          const failover = buildAwsTerraformFailover(
            plan,
            params.nodeIndex as number,
            selected.id,
            configuration,
            marker.configurationSha256,
          );
          const existing = await optional(storage, `${failover.planId}.json`);
          if (existing === undefined) await storage.write(`${failover.planId}.json`, failover);
          else if (canonicalSha256(existing) !== canonicalSha256(failover))
            throw new Error('Persisted AWS CE failover plan differs');
          const artifactId = await ctx.sessionManager.saveArtifact(
            JSON.stringify({
              kind: failover.kind,
              engine: failover.engine,
              planId: failover.planId,
              planSha256: failover.planSha256,
              sourcePlanSha256: failover.sourcePlanSha256,
              nodeIndex: failover.nodeIndex,
            }),
            'aws-ce-failover-plan',
          );
          if (!artifactId) throw new Error('AWS CE failover plan artifact persistence failed');
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failover plan ID: ${failover.planId}\nSHA-256: ${failover.planSha256}\nNode: ${failover.nodeIndex}\nArtifact: artifact://${artifactId}`,
              },
            ],
            details: {
              tool: 'aws_ce_failover',
              operation: 'prepare',
              artifactId,
              planId: failover.planId,
              planSha256: failover.planSha256,
            },
          };
        }
        if (!params.failoverPlanId || !params.failoverPlanSha256)
          throw new Error('Failover apply requires the exact failover plan identity');
        const failover = (await storage.read(`${params.failoverPlanId}.json`)) as AwsTerraformFailover;
        verifyAwsTerraformFailover(plan, failover);
        if (failover.planId !== params.failoverPlanId || failover.planSha256 !== params.failoverPlanSha256)
          throw new Error('Persisted AWS CE failover plan identity differs');
        const authorizationName = `${failover.planId}-authorization.json`;
        const authorization = await optional(storage, authorizationName);
        if (authorization === undefined) {
          if (
            ctx.hasUI &&
            !(await ctx.ui.confirm(
              'Execute planned AWS CE failover',
              `${failover.planId}\n${failover.planSha256}\nNode ${failover.nodeIndex}`,
            ))
          )
            throw new Error('AWS CE failover was not approved');
          await storage.write(authorizationName, {
            schemaVersion: 1,
            engine: 'terraform',
            sourcePlanSha256: plan.planSha256,
            failoverPlanSha256: failover.planSha256,
            mutations: true,
          });
        } else if (
          canonicalSha256(authorization) !==
          canonicalSha256({
            schemaVersion: 1,
            engine: 'terraform',
            sourcePlanSha256: plan.planSha256,
            failoverPlanSha256: failover.planSha256,
            mutations: true,
          })
        )
          throw new Error('Persisted AWS CE failover authorization differs');
        const routing = (await storage.read('terraform-routing-checkpoint.json')) as AwsCeCheckpoint;
        const api = scopedAwsApi(dependencies.makeApi(ctx.cwd), plan.intent.awsProfile, signal);
        const result = await dependencies.run(
          plan,
          failover,
          params.failoverPlanSha256,
          session,
          storage,
          (phase, currentSignal) => dependencies.collect(plan, routing, failover.nodeIndex, phase, api, currentSignal),
          process.env,
          signal,
        );
        const artifactId = await ctx.sessionManager.saveArtifact(JSON.stringify(result), 'aws-ce-failover-receipt');
        if (!artifactId) throw new Error('AWS CE failover receipt persistence failed');
        return {
          content: [
            {
              type: 'text' as const,
              text: `AWS CE node ${failover.nodeIndex}: ${result.status}. BGP withdrawal and restoration passed; traffic and origin-control evidence remain separate.`,
            },
          ],
          details: { tool: 'aws_ce_failover', operation: 'apply', artifactId, ...result },
        };
      } catch (error) {
        signal?.throwIfAborted();
        return {
          content: [
            {
              type: 'text' as const,
              text: `AWS CE failover failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'aws_ce_failover', operation: params.operation },
        };
      }
    },
  };
}
