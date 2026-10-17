import type { CePlatformService } from '../../../platform/src/ce/service';
import type { CeTerraformService } from '../../../terraform/src/service';
import type { AwsExecApi } from '../aws/exec';
import type { PluginInterface } from '../aws/types';
import { type AwsCeToolContext, loadAwsCheckpoint, loadAwsPlan } from '../ce/artifacts';
import { canonicalSha256 } from '../ce/canonical';
import { collectAwsFailoverBgpHealth } from '../ce/failover-health';
import {
  type AwsNativeFailover,
  buildAwsNativeFailover,
  observeAwsNativeFailoverInstance,
  runAwsNativeFailover,
  verifyAwsNativeFailover,
} from '../ce/native-failover';
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
  runNative: typeof runAwsNativeFailover;
  collect: typeof collectAwsFailoverBgpHealth;
  observeNative: typeof observeAwsNativeFailoverInstance;
}
const defaults: Dependencies = {
  platform: awsPlatformService,
  terraform: awsTerraformService,
  makeApi: makeExecApi,
  run: runAwsTerraformFailover,
  runNative: runAwsNativeFailover,
  collect: collectAwsFailoverBgpHealth,
  observeNative: observeAwsNativeFailoverInstance,
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
      'Prepare or execute an owning-engine planned CE outage. Apply proves the selected BGP withdrawal and restoration from live AWS evidence. Terraform releases its temporary power control and requires a final no-change plan; native execution reconciles ambiguous mutations without replay.',
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
        if (plan.routing.profile !== 'tgw-connect')
          throw new Error('This failover executor requires a TGW Connect deployment');
        const platform = await dependencies.platform(pi, signal);
        const owner = {
          deploymentId: plan.deploymentName,
          engine: plan.engine,
          provider: 'aws' as const,
          account: plan.accountId,
          region: plan.region,
        };
        const storage = await platform.storage(owner);
        if (params.operation === 'prepare') {
          if (!Number.isInteger(params.nodeIndex)) throw new Error('Failover preparation requires an exact nodeIndex');
          let failover: AwsTerraformFailover | AwsNativeFailover;
          if (plan.engine === 'terraform') {
            const terraform = await dependencies.terraform(pi, signal);
            const session = await terraform.open(owner, await awsTerraformFoundationDeployment(plan), 'current');
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
            failover = buildAwsTerraformFailover(
              plan,
              params.nodeIndex as number,
              selected.id,
              configuration,
              marker.configurationSha256,
            );
          } else {
            const checkpoint = await loadAwsCheckpoint(ctx.sessionManager, plan.planId, plan.planSha256);
            const instanceId = checkpoint?.resolvedValues[`__INSTANCE_${params.nodeIndex}__`];
            if (checkpoint?.engine !== 'native' || checkpoint.state !== 'complete' || typeof instanceId !== 'string')
              throw new Error('Completed native deployment identity is unavailable');
            const registration = (plan.actions ?? []).find(
              (action) => action.kind === 'registration-gate' && action.node === params.nodeIndex,
            );
            const replacement = registration
              ? await optional(storage, `${registration.id}-initial-mtu-replacement.json`)
              : undefined;
            let instancePlanSha256 = plan.planSha256;
            if (replacement !== undefined) {
              const envelope = object(replacement);
              const child = object(envelope.plan);
              const binding = object(child.binding);
              const { planId, planSha256, ...draft } = child;
              const expectedSite = siteForNode(plan.intent, params.nodeIndex as number);
              if (
                envelope.sourcePlanSha256 !== plan.planSha256 ||
                typeof planSha256 !== 'string' ||
                planId !== `aws-ce-replace-${planSha256.slice(0, 24)}` ||
                canonicalSha256(draft) !== planSha256 ||
                binding.siteName !== expectedSite.name ||
                !Array.isArray(binding.nodes) ||
                !binding.nodes.includes(`${plan.deploymentName}-${params.nodeIndex}`) ||
                !checkpoint.childPlanSha256s?.includes(planSha256)
              )
                throw new Error('Native replacement instance plan identity differs');
              instancePlanSha256 = planSha256;
            }
            failover = buildAwsNativeFailover(plan, params.nodeIndex as number, instanceId, instancePlanSha256);
          }
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
        const failover = (await storage.read(`${params.failoverPlanId}.json`)) as
          | AwsTerraformFailover
          | AwsNativeFailover;
        if (plan.engine === 'terraform') verifyAwsTerraformFailover(plan, failover as AwsTerraformFailover);
        else verifyAwsNativeFailover(plan, failover as AwsNativeFailover);
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
            engine: plan.engine,
            sourcePlanSha256: plan.planSha256,
            failoverPlanSha256: failover.planSha256,
            mutations: true,
          });
        } else if (
          canonicalSha256(authorization) !==
          canonicalSha256({
            schemaVersion: 1,
            engine: plan.engine,
            sourcePlanSha256: plan.planSha256,
            failoverPlanSha256: failover.planSha256,
            mutations: true,
          })
        )
          throw new Error('Persisted AWS CE failover authorization differs');
        const api = scopedAwsApi(dependencies.makeApi(ctx.cwd), plan.intent.awsProfile, signal);
        const routing =
          plan.engine === 'terraform'
            ? ((await storage.read('terraform-routing-checkpoint.json')) as AwsCeCheckpoint)
            : await loadAwsCheckpoint(ctx.sessionManager, plan.planId, plan.planSha256);
        if (!routing) throw new Error('AWS CE routing checkpoint is unavailable');
        const collect = (phase: 'outage' | 'recovered', currentSignal?: AbortSignal) =>
          dependencies.collect(plan, routing, failover.nodeIndex, phase, api, currentSignal);
        const result =
          plan.engine === 'terraform'
            ? await dependencies.run(
                plan,
                failover as AwsTerraformFailover,
                params.failoverPlanSha256,
                await (await dependencies.terraform(pi, signal)).open(
                  owner,
                  await awsTerraformFoundationDeployment(plan),
                  'current',
                ),
                storage,
                collect,
                process.env,
                signal,
              )
            : await dependencies.runNative(
                plan,
                failover as AwsNativeFailover,
                params.failoverPlanSha256,
                storage,
                (currentSignal) => dependencies.observeNative(plan, failover as AwsNativeFailover, api, currentSignal),
                async (phase, currentSignal) => {
                  const response = await api.exec(
                    'aws',
                    [
                      'ec2',
                      phase === 'stop' ? 'stop-instances' : 'start-instances',
                      '--instance-ids',
                      failover.instanceId,
                      '--region',
                      plan.region,
                      '--output',
                      'json',
                    ],
                    { signal: currentSignal },
                  );
                  if (response.exitCode !== 0) throw new Error(`Native failover ${phase} request failed`);
                },
                collect,
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
