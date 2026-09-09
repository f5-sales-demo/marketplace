import { VerifiedIngressContract } from '../../../platform/src/ce/ingress-contract';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { CeTerraformService } from '../../../terraform/src/service';
import type { AwsExecApi } from '../aws/exec';
import type { PluginInterface } from '../aws/types';
import { type AwsCeToolContext, loadAwsPlan } from '../ce/artifacts';
import { safeHexEqual } from '../ce/canonical';
import { awsPlatformService } from '../ce/platform';
import { awsTerraformService } from '../ce/terraform-apply';
import { awsTerraformFoundationDeployment } from '../ce/terraform-foundation';
import { type AwsTerraformTeardownPlan, runAwsTerraformTeardown } from '../ce/terraform-teardown';
import { prepareAwsTerraformTeardown } from '../ce/terraform-teardown-plan';
import { makeExecApi } from './shared';

interface Dependencies {
  platform(pi: PluginInterface, signal?: AbortSignal): Promise<CePlatformService>;
  terraform(pi: PluginInterface, signal?: AbortSignal): Promise<CeTerraformService>;
  contract(signal?: AbortSignal): Promise<VerifiedIngressContract>;
  prepare: typeof prepareAwsTerraformTeardown;
  run: typeof runAwsTerraformTeardown;
}

const defaults: Dependencies = {
  platform: awsPlatformService,
  terraform: awsTerraformService,
  contract: (signal) => VerifiedIngressContract.release(fetch, signal),
  prepare: prepareAwsTerraformTeardown,
  run: runAwsTerraformTeardown,
};

async function optional(storage: Awaited<ReturnType<CePlatformService['storage']>>, name: string) {
  try {
    return await storage.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export function createAwsCeTeardownTool(
  pi: PluginInterface,
  makeApi: (cwd: string) => AwsExecApi = makeExecApi,
  dependencies: Dependencies = defaults,
) {
  const { Type } = pi.typebox;
  return {
    name: 'aws_ce_teardown',
    label: 'Teardown AWS Customer Edge',
    description:
      'Prepare or apply an immutable Terraform-owned AWS Customer Edge teardown. Preparation collects authoritative platform and stored identities; apply drains ingress/routing, destroys the exact saved cloud plan, retires sites, verifies absence, and resumes without manual state edits.',
    parameters: Type.Object({
      operation: Type.Union([Type.Literal('prepare'), Type.Literal('apply')]),
      basePlanId: Type.String(),
      basePlanSha256: Type.String(),
      teardownPlanId: Type.Optional(Type.String()),
      teardownPlanSha256: Type.Optional(Type.String()),
    }),
    async execute(
      _id: string,
      params: {
        operation: 'prepare' | 'apply';
        basePlanId: string;
        basePlanSha256: string;
        teardownPlanId?: string;
        teardownPlanSha256?: string;
      },
      signal: AbortSignal | undefined,
      _update: unknown,
      ctx: AwsCeToolContext,
    ) {
      try {
        const allowed =
          params.operation === 'prepare'
            ? ['basePlanId', 'basePlanSha256', 'operation']
            : ['basePlanId', 'basePlanSha256', 'operation', 'teardownPlanId', 'teardownPlanSha256'];
        if (Object.keys(params).some((key) => !allowed.includes(key)))
          throw new Error(`AWS CE teardown ${params.operation} parameters differ`);
        const { plan } = await loadAwsPlan(ctx.sessionManager, params.basePlanId, params.basePlanSha256);
        if (plan.engine !== 'terraform') throw new Error('AWS CE teardown currently requires a Terraform-owned plan');
        const platform = await dependencies.platform(pi, signal);
        const owner = {
          deploymentId: plan.deploymentName,
          engine: 'terraform' as const,
          provider: 'aws' as const,
          account: plan.accountId,
          region: plan.region,
        };
        const storage = await platform.storage(owner);
        const runtime = await platform.runtime('terraform', plan.intent.platformContext);
        const contract = await dependencies.contract(signal);
        if (params.operation === 'prepare') {
          const teardown = await dependencies.prepare(plan, runtime, contract, storage, signal);
          const artifactId = await ctx.sessionManager.saveArtifact(
            JSON.stringify({
              kind: teardown.kind,
              planId: teardown.planId,
              planSha256: teardown.planSha256,
              sourcePlanSha256: teardown.sourcePlanSha256,
              siteCount: teardown.retirement.length,
              listenerCount: teardown.drain.listeners.length,
              originCount: teardown.drain.origins.length,
              routingCount: teardown.drain.sites.reduce((total, site) => total + site.routing.length, 0),
              tokenLocatorCount: teardown.retirement.reduce((total, site) => total + site.tokens.length, 0),
            }),
            'aws-ce-teardown-plan',
          );
          if (!artifactId) throw new Error('AWS CE teardown plan artifact persistence failed');
          return {
            content: [
              {
                type: 'text' as const,
                text: `Teardown plan ID: ${teardown.planId}\nSHA-256: ${teardown.planSha256}\nSites: ${teardown.retirement.length}\nListeners/origins/routing objects: ${teardown.drain.listeners.length}/${teardown.drain.origins.length}/${teardown.drain.sites.reduce((total, site) => total + site.routing.length, 0)}\nArtifact: artifact://${artifactId}`,
              },
            ],
            details: {
              tool: 'aws_ce_teardown',
              operation: 'prepare',
              artifactId,
              planId: teardown.planId,
              planSha256: teardown.planSha256,
            },
          };
        }
        if (!params.teardownPlanId || !params.teardownPlanSha256)
          throw new Error('Teardown apply requires the exact teardown plan ID and SHA-256');
        const teardown = (await storage.read(`${params.teardownPlanId}.json`)) as AwsTerraformTeardownPlan;
        if (
          teardown.planId !== params.teardownPlanId ||
          !safeHexEqual(teardown.planSha256, params.teardownPlanSha256) ||
          teardown.sourcePlanSha256 !== plan.planSha256
        )
          throw new Error('Persisted AWS CE teardown plan identity differs');
        const authorizationName = `${teardown.planId}-authorization.json`;
        const authorization = await optional(storage, authorizationName);
        if (authorization !== undefined) {
          if (
            !authorization ||
            typeof authorization !== 'object' ||
            (authorization as Record<string, unknown>).schemaVersion !== 1 ||
            (authorization as Record<string, unknown>).engine !== 'terraform' ||
            (authorization as Record<string, unknown>).sourcePlanSha256 !== plan.planSha256 ||
            (authorization as Record<string, unknown>).teardownPlanSha256 !== teardown.planSha256 ||
            (authorization as Record<string, unknown>).mutations !== true
          )
            throw new Error('Persisted AWS CE teardown authorization differs');
        } else {
          if (
            ctx.hasUI &&
            !(await ctx.ui.confirm(
              'Apply immutable AWS CE teardown plan',
              `${teardown.planId}\n${teardown.planSha256}\n${teardown.retirement.length} site(s)`,
            ))
          )
            throw new Error('AWS CE teardown was not approved');
          await storage.write(authorizationName, {
            schemaVersion: 1,
            engine: 'terraform',
            sourcePlanSha256: plan.planSha256,
            teardownPlanSha256: teardown.planSha256,
            mutations: true,
          });
        }
        const session = await (await dependencies.terraform(pi, signal)).open(
          owner,
          await awsTerraformFoundationDeployment(plan),
          'current',
        );
        const result = await dependencies.run(
          plan,
          teardown,
          params.teardownPlanSha256,
          runtime,
          contract,
          session,
          storage,
          makeApi(ctx.cwd),
          process.env,
          signal,
        );
        const artifactId = await ctx.sessionManager.saveArtifact(JSON.stringify(result), 'aws-ce-teardown-checkpoint');
        if (!artifactId) throw new Error('AWS CE teardown checkpoint artifact persistence failed');
        return {
          content: [
            {
              type: 'text' as const,
              text: `AWS CE teardown ${plan.deploymentName}: ${String(result.status)}; cloud inventory ${String(result.cloudInventory)}. Supporting infrastructure outside the CE plan requires separate ownership and absence evidence.`,
            },
          ],
          details: { tool: 'aws_ce_teardown', operation: 'apply', artifactId, ...result },
        };
      } catch (error) {
        signal?.throwIfAborted();
        return {
          content: [
            {
              type: 'text' as const,
              text: `AWS CE teardown failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'aws_ce_teardown', operation: params.operation },
        };
      }
    },
  };
}
