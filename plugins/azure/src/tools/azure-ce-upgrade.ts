import type { CePlatformService } from '../../../platform/src/ce/service';
import { VerifiedUpgradeContract } from '../../../platform/src/ce/upgrade-contract';
import type { CeTerraformService } from '../../../terraform/src/service';
import type { PluginInterface } from '../az/types';
import { type AzureCeToolContext, loadPlanArtifact } from '../ce/artifacts';
import { canonicalSha256, safeHexEqual } from '../ce/canonical';
import {
  type AzureNativeUpgrade,
  prepareAzureNativeUpgrade,
  runAzureNativeUpgrade,
  verifyAzureNativeUpgrade,
} from '../ce/native-upgrade';
import { azurePlatformService, azureTerraformService } from '../ce/platform';
import {
  type AzureTerraformUpgrade,
  azureUpgradeBinding,
  prepareAzureTerraformUpgrade,
  runAzureTerraformUpgrade,
  verifyAzureTerraformUpgrade,
} from '../ce/terraform-upgrade';

interface Dependencies {
  platform(pi: PluginInterface, signal?: AbortSignal): Promise<CePlatformService>;
  terraform(pi: PluginInterface, signal?: AbortSignal): Promise<CeTerraformService>;
  contract(signal?: AbortSignal): Promise<VerifiedUpgradeContract>;
}

const defaults: Dependencies = {
  platform: azurePlatformService,
  terraform: azureTerraformService,
  contract: (signal) => VerifiedUpgradeContract.release(fetch, signal),
};

async function optional(storage: Awaited<ReturnType<CePlatformService['storage']>>, name: string) {
  try {
    return await storage.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export function createAzureCeUpgradeTool(pi: PluginInterface, dependencies: Dependencies = defaults) {
  const { Type } = pi.typebox;
  return {
    name: 'azure_ce_upgrade',
    label: 'Upgrade Azure Customer Edge',
    description:
      'Prepare or apply an immutable serial software/OS upgrade for a native- or Terraform-owned Azure Customer Edge site. Apply resumes from persisted platform evidence without replaying ambiguous actions. Node, routing and traffic health remain separate evidence.',
    parameters: Type.Object({
      operation: Type.Union([Type.Literal('prepare'), Type.Literal('apply')]),
      basePlanId: Type.String(),
      basePlanSha256: Type.String(),
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
        kind?: 'software' | 'os';
        version?: string;
        upgradePlanId?: string;
        upgradePlanSha256?: string;
      },
      signal: AbortSignal | undefined,
      _update: unknown,
      ctx: AzureCeToolContext,
    ) {
      try {
        const allowed =
          params.operation === 'prepare'
            ? ['basePlanId', 'basePlanSha256', 'kind', 'operation', 'version']
            : ['basePlanId', 'basePlanSha256', 'operation', 'upgradePlanId', 'upgradePlanSha256'];
        if (Object.keys(params).some((key) => !allowed.includes(key)))
          throw new Error(`Azure CE upgrade ${params.operation} parameters differ`);
        const { plan } = await loadPlanArtifact(ctx.sessionManager, params.basePlanId, params.basePlanSha256);
        const platform = await dependencies.platform(pi, signal);
        const storage = await platform.storage(azureUpgradeBinding(plan).owner);
        const runtime = await platform.runtime(plan.engine, plan.intent.platformContext);
        const contract = await dependencies.contract(signal);
        if (params.operation === 'prepare') {
          if (!params.kind || !params.version) throw new Error('Upgrade preparation requires kind and version');
          const upgrade =
            plan.engine === 'terraform'
              ? await prepareAzureTerraformUpgrade(
                  plan,
                  { kind: params.kind, version: params.version },
                  runtime,
                  contract,
                  signal,
                )
              : await prepareAzureNativeUpgrade(
                  plan,
                  { kind: params.kind, version: params.version },
                  runtime,
                  contract,
                  signal,
                );
          const existing = await optional(storage, `${upgrade.planId}.json`);
          if (existing === undefined) await storage.write(`${upgrade.planId}.json`, upgrade);
          else if (canonicalSha256(existing) !== canonicalSha256(upgrade))
            throw new Error('Persisted Azure CE upgrade plan differs');
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
            'azure-ce-upgrade-plan',
          );
          if (!artifactId) throw new Error('Azure CE upgrade plan artifact persistence failed');
          return {
            content: [
              {
                type: 'text' as const,
                text: `Upgrade plan ID: ${upgrade.planId}\nSHA-256: ${upgrade.planSha256}\nSite: ${upgrade.expectation.binding.siteName}\nTarget: ${upgrade.expectation.target.kind} ${upgrade.expectation.target.version}\nArtifact: artifact://${artifactId}`,
              },
            ],
            details: {
              tool: 'azure_ce_upgrade',
              operation: 'prepare',
              artifactId,
              planId: upgrade.planId,
              planSha256: upgrade.planSha256,
            },
          };
        }
        if (!params.upgradePlanId || !params.upgradePlanSha256)
          throw new Error('Upgrade apply requires the exact upgrade plan ID and SHA-256');
        const upgrade = (await storage.read(`${params.upgradePlanId}.json`)) as
          | AzureTerraformUpgrade
          | AzureNativeUpgrade;
        if (plan.engine === 'terraform')
          await verifyAzureTerraformUpgrade(plan, upgrade as AzureTerraformUpgrade, contract);
        else verifyAzureNativeUpgrade(plan, upgrade as AzureNativeUpgrade, contract);
        if (upgrade.planId !== params.upgradePlanId || !safeHexEqual(upgrade.planSha256, params.upgradePlanSha256))
          throw new Error('Persisted Azure CE upgrade plan identity differs');
        const authorizationName = `${upgrade.planId}-authorization.json`;
        const authorization = await optional(storage, authorizationName);
        if (authorization !== undefined) {
          if (
            !authorization ||
            typeof authorization !== 'object' ||
            (authorization as Record<string, unknown>).schemaVersion !== 2 ||
            (authorization as Record<string, unknown>).engine !== plan.engine ||
            (authorization as Record<string, unknown>).sourcePlanSha256 !== plan.planSha256 ||
            (authorization as Record<string, unknown>).upgradePlanSha256 !== upgrade.planSha256 ||
            (authorization as Record<string, unknown>).mutations !== true
          )
            throw new Error('Persisted Azure CE upgrade authorization differs');
        } else {
          if (
            ctx.hasUI &&
            !(await ctx.ui.confirm(
              'Apply immutable Azure CE upgrade plan',
              `${upgrade.planId}\n${upgrade.planSha256}\n${upgrade.expectation.binding.siteName}: ${upgrade.expectation.target.kind} ${upgrade.expectation.target.version}`,
            ))
          )
            throw new Error('Azure CE upgrade was not approved');
          await storage.write(authorizationName, {
            schemaVersion: 2,
            engine: plan.engine,
            sourcePlanSha256: plan.planSha256,
            upgradePlanSha256: upgrade.planSha256,
            mutations: true,
          });
        }
        const result =
          plan.engine === 'terraform'
            ? await runAzureTerraformUpgrade(
                plan,
                upgrade as AzureTerraformUpgrade,
                params.upgradePlanSha256,
                runtime,
                contract,
                await dependencies.terraform(pi, signal),
                storage,
                process.env,
                signal,
              )
            : await runAzureNativeUpgrade(
                plan,
                upgrade as AzureNativeUpgrade,
                params.upgradePlanSha256,
                runtime,
                contract,
                storage,
                signal,
              );
        const artifactId = await ctx.sessionManager.saveArtifact(JSON.stringify(result), 'azure-ce-upgrade-checkpoint');
        if (!artifactId) throw new Error('Azure CE upgrade checkpoint artifact persistence failed');
        return {
          content: [
            {
              type: 'text' as const,
              text: `Azure CE upgrade ${upgrade.expectation.binding.siteName}: ${String(result.status)}. Node, routing and traffic health require separate collected evidence.`,
            },
          ],
          details: { tool: 'azure_ce_upgrade', operation: 'apply', artifactId, ...result },
        };
      } catch (error) {
        signal?.throwIfAborted();
        return {
          content: [
            {
              type: 'text' as const,
              text: `Azure CE upgrade failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: { tool: 'azure_ce_upgrade', operation: params.operation },
        };
      }
    },
  };
}
