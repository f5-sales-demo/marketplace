// biome-ignore-all lint: Generated Bun bundle; lint the source modules instead.
// @bun
import './runtime-cfmmcdyk.js';
import { canonicalSha256, safeHexEqual } from './runtime-6j4b2rhv.js';
import {
  azureUpgradeBinding,
  loadPlanArtifact,
  prepareAzureTerraformUpgrade,
  runAzureTerraformUpgrade,
  verifyAzureTerraformUpgrade,
} from './runtime-34064jyj.js';
import { azurePlatformService, azureTerraformService } from './runtime-hxhs7mq0.js';
import {
  prepareAzureNativeUpgrade,
  runAzureNativeUpgrade,
  VerifiedUpgradeContract,
  verifyAzureNativeUpgrade,
} from './runtime-zs0qw1gt.js';

// plugins/azure/src/tools/azure-ce-upgrade.ts
var defaults = {
  platform: azurePlatformService,
  terraform: azureTerraformService,
  contract: (signal) => VerifiedUpgradeContract.release(fetch, signal),
};
async function optional(storage, name) {
  try {
    return await storage.read(name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
function createAzureCeUpgradeTool(pi, dependencies = defaults) {
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
    async execute(_id, params, signal, _update, ctx) {
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
        if (
          plan.engine === 'native' &&
          (await optional(storage, 'azure-native-lifecycle-retirement.json')) !== undefined
        )
          throw Error('Azure native lifecycle is retired; upgrade cannot prepare or execute');
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
                type: 'text',
                text: `Upgrade plan ID: ${upgrade.planId}
SHA-256: ${upgrade.planSha256}
Site: ${upgrade.expectation.binding.siteName}
Target: ${upgrade.expectation.target.kind} ${upgrade.expectation.target.version}
Artifact: artifact://${artifactId}`,
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
        const upgrade = await storage.read(`${params.upgradePlanId}.json`);
        if (plan.engine === 'terraform') await verifyAzureTerraformUpgrade(plan, upgrade, contract);
        else verifyAzureNativeUpgrade(plan, upgrade, contract);
        if (upgrade.planId !== params.upgradePlanId || !safeHexEqual(upgrade.planSha256, params.upgradePlanSha256))
          throw new Error('Persisted Azure CE upgrade plan identity differs');
        const authorizationName = `${upgrade.planId}-authorization.json`;
        const authorization = await optional(storage, authorizationName);
        if (authorization !== undefined) {
          if (
            !authorization ||
            typeof authorization !== 'object' ||
            authorization.schemaVersion !== 2 ||
            authorization.engine !== plan.engine ||
            authorization.sourcePlanSha256 !== plan.planSha256 ||
            authorization.upgradePlanSha256 !== upgrade.planSha256 ||
            authorization.mutations !== true
          )
            throw new Error('Persisted Azure CE upgrade authorization differs');
        } else {
          if (
            ctx.hasUI &&
            !(await ctx.ui.confirm(
              'Apply immutable Azure CE upgrade plan',
              `${upgrade.planId}
${upgrade.planSha256}
${upgrade.expectation.binding.siteName}: ${upgrade.expectation.target.kind} ${upgrade.expectation.target.version}`,
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
                upgrade,
                params.upgradePlanSha256,
                runtime,
                contract,
                await dependencies.terraform(pi, signal),
                storage,
                process.env,
                signal,
              )
            : await runAzureNativeUpgrade(plan, upgrade, params.upgradePlanSha256, runtime, contract, storage, signal);
        const artifactId = await ctx.sessionManager.saveArtifact(JSON.stringify(result), 'azure-ce-upgrade-checkpoint');
        if (!artifactId) throw new Error('Azure CE upgrade checkpoint artifact persistence failed');
        return {
          content: [
            {
              type: 'text',
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
              type: 'text',
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

export { createAzureCeUpgradeTool };
