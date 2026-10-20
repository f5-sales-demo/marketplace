import { randomUUID } from 'node:crypto';
import type { CePlatformService } from '../../../platform/src/ce/service';
import type { CeTerraformService } from '../../../terraform/src/service';
import type { AwsExecApi } from '../aws/exec';
import type { PluginInterface } from '../aws/types';
import { type AwsCeToolContext, loadAwsCheckpoint, loadAwsPlan } from '../ce/artifacts';
import { canonicalSha256 } from '../ce/canonical';
import { awsPlatformService } from '../ce/platform';
import { awsTerraformService } from '../ce/terraform-apply';
import { awsTerraformFoundationDeployment } from '../ce/terraform-foundation';
import { bindTerraformIngress } from '../ce/terraform-routing';
import { bindTerraformStaticRouting } from '../ce/terraform-static';
import { readAwsTerraformInstanceBindings, readAwsTerraformWorkflowStatus } from '../ce/terraform-status';
import {
  type AwsWholeSitePowerPlan,
  buildAwsWholeSitePowerPlan,
  runAwsWholeSitePower,
  verifyAwsWholeSitePowerPlan,
} from '../ce/whole-site-power';
import type { AwsBgpPowerSiteBinding } from '../ce/whole-site-power-bgp-services';
import { collectAwsPowerBindings } from '../ce/whole-site-power-bindings';
import { createAwsWholeSitePowerDriver } from '../ce/whole-site-power-driver';
import { makeExecApi } from './shared';

interface Dependencies {
  platform(pi: PluginInterface, signal?: AbortSignal): Promise<CePlatformService>;
  terraform(pi: PluginInterface, signal?: AbortSignal): Promise<CeTerraformService>;
  makeApi(cwd: string): AwsExecApi;
}
const defaults: Dependencies = { platform: awsPlatformService, terraform: awsTerraformService, makeApi: makeExecApi };
export function createAwsCePowerTool(pi: PluginInterface, dependencies: Dependencies = defaults) {
  const { Type } = pi.typebox;
  return {
    name: 'aws_ce_power',
    label: 'AWS Customer Edge Power',
    description:
      'Prepare an immutable owning-engine whole-site stop/start plan, apply its exact saved digest, or observe its gates. Missing interface freshness or traffic proof remains pending. Single-node lifecycle only.',
    parameters: Type.Object({
      operation: Type.Union(['prepare-stop', 'prepare-start', 'apply', 'status'].map((value) => Type.Literal(value))),
      basePlanId: Type.String(),
      basePlanSha256: Type.String(),
      powerPlanId: Type.Optional(Type.String()),
      powerPlanSha256: Type.Optional(Type.String()),
      stopPlanId: Type.Optional(Type.String()),
      stopPlanSha256: Type.Optional(Type.String()),
    }),
    async execute(
      _id: string,
      params: {
        operation: 'prepare-stop' | 'prepare-start' | 'apply' | 'status';
        basePlanId: string;
        basePlanSha256: string;
        powerPlanId?: string;
        powerPlanSha256?: string;
        stopPlanId?: string;
        stopPlanSha256?: string;
      },
      signal: AbortSignal | undefined,
      _update: unknown,
      ctx: AwsCeToolContext,
    ) {
      try {
        const allowed = [
          'operation',
          'basePlanId',
          'basePlanSha256',
          ...(params.operation === 'prepare-start' ? ['stopPlanId', 'stopPlanSha256'] : []),
          ...(['apply', 'status'].includes(params.operation) ? ['powerPlanId', 'powerPlanSha256'] : []),
        ];
        if (
          !['prepare-stop', 'prepare-start', 'apply', 'status'].includes(params.operation) ||
          Object.keys(params).some((key) => !allowed.includes(key))
        )
          throw Error('AWS power parameters differ');
        const { plan: base } = await loadAwsPlan(ctx.sessionManager, params.basePlanId, params.basePlanSha256);
        if (base.intent.operation !== 'deploy' || base.topology.nodeCount !== 1)
          throw Error('AWS power requires original single-node deployment; multi-node lifecycle unqualified');
        const platform = await dependencies.platform(pi, signal),
          runtime = await platform.runtime(base.engine, base.intent.platformContext);
        const owner = {
          deploymentId: base.deploymentName,
          engine: base.engine,
          provider: 'aws' as const,
          account: base.accountId,
          region: base.region,
        };
        const storage = await platform.storage(owner),
          api = dependencies.makeApi(ctx.cwd);
        await storage.verify();
        const terraform = base.engine === 'terraform' ? await dependencies.terraform(pi, signal) : undefined;
        let values: Record<string, string>;
        if (terraform) {
          const workflow = await readAwsTerraformWorkflowStatus(base, storage);
          if (workflow.progress.state !== 'registered' || !workflow.routing || workflow.routing.state === 'partial')
            throw Error('Current Terraform registered routing execution bindings unavailable');
          const session = await terraform.open(owner, await awsTerraformFoundationDeployment(base), 'current');
          const instances = await readAwsTerraformInstanceBindings(base, session, process.env, signal);
          const outputs = await session.readOutputs(
            [
              ...(base.intent.ingress?.mode === 'nlb' ? ['ce_ingress'] : []),
              ...(base.intent.routing.profile === 'tgw-static'
                ? ['ce_vpc_id', 'ce_transport_attachment', 'ce_static_route_tables']
                : []),
            ],
            process.env,
            signal,
          );
          values = {
            ...workflow.routing.resolvedValues,
            ...instances,
            ...bindTerraformIngress(base, outputs),
            ...(base.intent.routing.profile === 'tgw-static' ? bindTerraformStaticRouting(base, outputs) : {}),
          };
        } else {
          const checkpoint = await loadAwsCheckpoint(ctx.sessionManager, base.planId, base.planSha256);
          if (!checkpoint || checkpoint.engine !== base.engine || checkpoint.state !== 'complete')
            throw Error('Exact completed native execution bindings unavailable');
          values = checkpoint.resolvedValues;
        }
        const loadPower = async (id: string | undefined, digest: string | undefined) => {
          if (!id || !digest || !/^[a-f0-9]{64}$/.test(digest) || id !== `aws-ce-power-${digest.slice(0, 24)}`)
            throw Error('Exact saved power plan ID and digest required');
          const power = (await storage.read(`${id}.json`)) as AwsWholeSitePowerPlan;
          verifyAwsWholeSitePowerPlan(base, power);
          if (power.planId !== id || power.planSha256 !== digest) throw Error('Saved power identity differs');
          return power;
        };
        let power: AwsWholeSitePowerPlan;
        if (params.operation === 'prepare-stop') {
          const current = await collectAwsPowerBindings(base, values, api, runtime, signal);
          power = buildAwsWholeSitePowerPlan(base, 'stop', current.bindings, randomUUID());
          await storage.write(`${power.planId}.json`, power);
        } else if (params.operation === 'prepare-start') {
          const stop = await loadPower(params.stopPlanId, params.stopPlanSha256);
          if (stop.operation !== 'stop') throw Error('Stopped maintenance plan required');
          const maintenance = (await storage.read(`${stop.planId}-maintenance.json`)) as NonNullable<
            AwsWholeSitePowerPlan['maintenance']
          >;
          const bgp = stop.bindings.servicesInventory?.components.find((row) => row.kind === 'bgp');
          const retained = bgp ? (bgp.services as { platform: AwsBgpPowerSiteBinding[] }).platform : undefined;
          const current = await collectAwsPowerBindings(base, values, api, runtime, signal, retained);
          if (
            current.cloud !== 'stopped' ||
            current.status !== 'withdrawn' ||
            canonicalSha256(current.bindings) !== stop.bindingsSha256
          )
            throw Error('Current stopped identities or service withdrawal unavailable');
          power = buildAwsWholeSitePowerPlan(base, 'start', stop.bindings, stop.transitionId, maintenance);
          const existing = await storage.read(`${power.planId}.json`).catch((error) => {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          });
          if (existing && canonicalSha256(existing) !== canonicalSha256(power)) throw Error('Saved power plan differs');
          if (!existing) await storage.write(`${power.planId}.json`, power);
        } else power = await loadPower(params.powerPlanId, params.powerPlanSha256);
        const driver = createAwsWholeSitePowerDriver(base, power, values, storage, api, runtime, terraform);
        let result: unknown;
        if (params.operation === 'apply')
          result = await runAwsWholeSitePower(base, power, power.planSha256, storage, driver, signal);
        else if (params.operation === 'status')
          result = await driver.observe(power, power.operation === 'stop' ? 'stopped' : 'restored', signal);
        else {
          const artifactId = await ctx.sessionManager.saveArtifact(
            JSON.stringify({
              kind: power.kind,
              engine: power.engine,
              operation: power.operation,
              planId: power.planId,
              planSha256: power.planSha256,
              fullCeAcceptance: false,
            }),
            'aws-ce-power',
          );
          if (!artifactId) throw Error('Power plan reference persistence failed');
          result = {
            operation: power.operation,
            engine: power.engine,
            planId: power.planId,
            planSha256: power.planSha256,
            artifactId,
            fullCeAcceptance: false,
          };
        }
        return {
          content: [
            {
              type: 'text' as const,
              text: `AWS CE power ${params.operation}: exact owning plan ${power.planId}. Qualification gates remain explicit.`,
            },
          ],
          details: { tool: 'aws_ce_power', power: result },
          isError: false,
        };
      } catch (error) {
        signal?.throwIfAborted();
        return {
          content: [{ type: 'text' as const, text: (error as Error).message }],
          isError: true,
          details: { tool: 'aws_ce_power' },
        };
      }
    },
  };
}
