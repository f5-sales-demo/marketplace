import type { CePlatformService } from '../../../platform/src/ce/service';
import { VerifiedUpgradeContract } from '../../../platform/src/ce/upgrade-contract';
import type { CeTerraformService } from '../../../terraform/src/service';
import type { PluginInterface } from '../aws/types';
import { type AwsCeToolContext, loadAwsPlan } from '../ce/artifacts';
import { canonicalSha256, safeHexEqual } from '../ce/canonical';
import {
  type AwsNativeUpgrade,
  prepareAwsNativeUpgrade,
  runAwsNativeUpgrade,
  verifyAwsNativeUpgrade,
} from '../ce/native-upgrade';
import { awsPlatformService } from '../ce/platform';
import { awsTerraformService } from '../ce/terraform-apply';
import {
  type AwsTerraformUpgrade,
  prepareAwsTerraformUpgrade,
  runAwsTerraformUpgrade,
  verifyAwsTerraformUpgrade,
} from '../ce/terraform-upgrade';

interface Dependencies {
  platform(pi: PluginInterface, signal?: AbortSignal): Promise<CePlatformService>;
  terraform(pi: PluginInterface, signal?: AbortSignal): Promise<CeTerraformService>;
  contract(signal?: AbortSignal): Promise<VerifiedUpgradeContract>;
}

const defaults: Dependencies = {
  platform: awsPlatformService,
  terraform: awsTerraformService,
  contract: (signal) => VerifiedUpgradeContract.release(fetch, signal),
};

async function optional(storage: Awaited<ReturnType<CePlatformService['storage']>>, name: string) {
  try {
    return await storage.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export function createAwsCeUpgradeTool(pi: PluginInterface, dependencies: Dependencies = defaults) {
  const { Type } = pi.typebox;
  return {
    name: 'aws_ce_upgrade',
    label: 'Upgrade AWS Customer Edge',
    description:
      'Prepare or apply an immutable serial software/OS upgrade for a native- or Terraform-owned AWS Customer Edge site. Apply resumes from persisted platform evidence without replaying ambiguous actions. Node, routing and traffic health remain separate evidence.',
    parameters: Type.Object({
      operation: Type.Union([Type.Literal('prepare'), Type.Literal('apply')]),
      basePlanId: Type.String(),
      basePlanSha256: Type.String(),
      siteName: Type.Optional(Type.String()),
      kind: Type.Optional(Type.Union([Type.Literal('software'), Type.Literal('os')])),
      version: Type.Optional(Type.String()),
      upgradePlanId: Type.Optional(Type.String()),
      upgradePlanSha256: Type.Optional(Type.String()),
    }),
    async execute(
      _id: string,
      params: {
        operation: 'prepare' | 'apply';
        basePlanId: string;
        basePlanSha256: string;
        siteName?: string;
        kind?: 'software' | 'os';
        version?: string;
        upgradePlanId?: string;
        upgradePlanSha256?: string;
      },
      signal: AbortSignal | undefined,
      _update: unknown,
      ctx: AwsCeToolContext,
    ) {
      try {
        const allowed =
          params.operation === 'prepare'
            ? ['basePlanId', 'basePlanSha256', 'kind', 'operation', 'siteName', 'version']
            : ['basePlanId', 'basePlanSha256', 'operation', 'upgradePlanId', 'upgradePlanSha256'];
        if (Object.keys(params).some((key) => !allowed.includes(key)))
          throw new Error(`AWS CE upgrade ${params.operation} parameters differ`);
        const { plan } = await loadAwsPlan(ctx.sessionManager, params.basePlanId, params.basePlanSha256);
        const platform = await dependencies.platform(pi, signal);
        const owner = {
          deploymentId: plan.deploymentName,
          engine: plan.engine,
          provider: 'aws' as const,
          account: plan.accountId,
          region: plan.region,
        };
        const storage = await platform.storage(owner);
        const runtime = await platform.runtime(plan.engine, plan.intent.platformContext);
        const contract = await dependencies.contract(signal);
        if (params.operation === 'prepare') {
          if (!params.siteName || !params.kind || !params.version)
            throw new Error('Upgrade preparation requires siteName, kind and version');
          const upgrade =
            plan.engine === 'terraform'
              ? await prepareAwsTerraformUpgrade(
                  plan,
                  params.siteName,
                  { kind: params.kind, version: params.version },
                  runtime,
                  contract,
                  signal,
                )
              : await prepareAwsNativeUpgrade(
                  plan,
                  params.siteName,
                  { kind: params.kind, version: params.version },
                  runtime,
                  contract,
                  signal,
                );
          const existing = await optional(storage, `${upgrade.planId}.json`);
          if (existing === undefined) await storage.write(`${upgrade.planId}.json`, upgrade);
          else if (canonicalSha256(existing) !== canonicalSha256(upgrade))
            throw new Error('Persisted AWS CE upgrade plan differs');
          const artifactId = await ctx.sessionManager.saveArtifact(
            JSON.stringify({
              kind: upgrade.kind,
              engine: upgrade.engine,
              planId: upgrade.planId,
              planSha256: upgrade.planSha256,
              sourcePlanSha256: upgrade.sourcePlanSha256,
              siteName: upgrade.expectation.binding.siteName,
              target: upgrade.expectation.target,
            }),
            'aws-ce-upgrade-plan',
          );
          if (!artifactId) throw new Error('AWS CE upgrade plan artifact persistence failed');
          return {
            content: [
              {
                type: 'text' as const,
                text: `Upgrade plan ID: ${upgrade.planId}\nSHA-256: ${upgrade.planSha256}\nSite: ${upgrade.expectation.binding.siteName}\nTarget: ${upgrade.expectation.target.kind} ${upgrade.expectation.target.version}\nArtifact: artifact://${artifactId}`,
              },
            ],
            details: {
              tool: 'aws_ce_upgrade',
              operation: 'prepare',
              artifactId,
              planId: upgrade.planId,
              planSha256: upgrade.planSha256,
            },
          };
        }
        if (!params.upgradePlanId || !params.upgradePlanSha256)
          throw new Error('Upgrade apply requires the exact upgrade plan ID and SHA-256');
        const upgrade = (await storage.read(`${params.upgradePlanId}.json`)) as AwsTerraformUpgrade | AwsNativeUpgrade;
        if (plan.engine === 'terraform')
          await verifyAwsTerraformUpgrade(plan, upgrade as AwsTerraformUpgrade, contract);
        else verifyAwsNativeUpgrade(plan, upgrade as AwsNativeUpgrade, contract);
        if (upgrade.planId !== params.upgradePlanId || !safeHexEqual(upgrade.planSha256, params.upgradePlanSha256))
          throw new Error('Persisted AWS CE upgrade plan identity differs');
        const authorizationName = `${upgrade.planId}-authorization.json`;
        const authorization = await optional(storage, authorizationName);
        if (authorization !== undefined) {
          if (
            !authorization ||
            typeof authorization !== 'object' ||
            (authorization as Record<string, unknown>).schemaVersion !== 1 ||
            (authorization as Record<string, unknown>).engine !== plan.engine ||
            (authorization as Record<string, unknown>).sourcePlanSha256 !== plan.planSha256 ||
            (authorization as Record<string, unknown>).upgradePlanSha256 !== upgrade.planSha256 ||
            (authorization as Record<string, unknown>).mutations !== true
          )
            throw new Error('Persisted AWS CE upgrade authorization differs');
        } else {
          if (
            ctx.hasUI &&
            !(await ctx.ui.confirm(
              'Apply immutable AWS CE upgrade plan',
              `${upgrade.planId}\n${upgrade.planSha256}\n${upgrade.expectation.binding.siteName}: ${upgrade.expectation.target.kind} ${upgrade.expectation.target.version}`,
            ))
          )
            throw new Error('AWS CE upgrade was not approved');
          await storage.write(authorizationName, {
            schemaVersion: 1,
            engine: plan.engine,
            sourcePlanSha256: plan.planSha256,
            upgradePlanSha256: upgrade.planSha256,
            mutations: true,
          });
        }
        const result =
          plan.engine === 'terraform'
            ? await runAwsTerraformUpgrade(
                plan,
                upgrade as AwsTerraformUpgrade,
                params.upgradePlanSha256,
                runtime,
                contract,
                await dependencies.terraform(pi, signal),
                storage,
                process.env,
                signal,
              )
            : await runAwsNativeUpgrade(
                plan,
                upgrade as AwsNativeUpgrade,
                params.upgradePlanSha256,
                runtime,
                contract,
                storage,
                signal,
              );
        const artifactId = await ctx.sessionManager.saveArtifact(JSON.stringify(result), 'aws-ce-upgrade-checkpoint');
        if (!artifactId) throw new Error('AWS CE upgrade checkpoint artifact persistence failed');
        return {
          content: [
            {
              type: 'text' as const,
              text: `AWS CE upgrade ${upgrade.expectation.binding.siteName}: ${String(result.status)}. Node, routing and traffic health require separate collected evidence.`,
            },
          ],
          details: { tool: 'aws_ce_upgrade', operation: 'apply', artifactId, ...result },
        };
      } catch (error) {
        signal?.throwIfAborted();
        return {
          content: [
            {
              type: 'text' as const,
              text: `AWS CE upgrade failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'aws_ce_upgrade', operation: params.operation },
        };
      }
    },
  };
}
