import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { captureCeReplacementVersions } from '../../../platform/src/ce/replacement-versions';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import { VerifiedUpgradeContract } from '../../../platform/src/ce/upgrade-contract';
import type { CeTerraformService } from '../../../terraform/src/service';
import type { AwsExecApi } from '../aws/exec';
import { type AwsSiteReplacementPlan, compileAwsSiteReplacement, runAwsSiteReplacement } from './site-replacement';
import { awsTerraformFoundationDeployment } from './terraform-foundation';
import { createTerraformAwsSiteReplacementDriver } from './terraform-site-replacement';
import { siteBindings } from './topology';
import type { AwsCePlan } from './types';

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid initial replacement source');
  return value as Record<string, unknown>;
};
async function optional(storage: CeDeploymentStore, name: string) {
  try {
    return await storage.read(name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return undefined;
  }
}

/** Resume the frozen initial MTU repair before admission can reuse its old bootstrap configuration. */
export async function runAwsTerraformInitialReplacement(
  base: AwsCePlan,
  terraform: CeTerraformService,
  runtime: CeRuntime,
  storage: CeDeploymentStore,
  api: AwsExecApi,
  fetcher: typeof fetch,
  signal?: AbortSignal,
  loadContract = () => VerifiedUpgradeContract.release(fetcher, signal),
) {
  if (base.engine !== 'terraform') throw new Error('Initial replacement requires Terraform ownership');
  let handled = false;
  for (const { site, binding } of siteBindings(base)) {
    const name = `terraform-initial-replacement-${site.name}.json`;
    let frozen = await optional(storage, name);
    const preparation = await optional(storage, `terraform-interface-mtu-${site.name}.json`);
    if (!frozen && (!preparation || object(preparation).evidenceKind !== 'preboot-interface-configuration-required'))
      continue;
    if (runtime.engine !== 'terraform') throw new Error('Initial replacement runtime ownership differs');
    handled = true;
    const contract = await loadContract();
    const session = await terraform.open(binding.owner, await awsTerraformFoundationDeployment(base), 'current');
    if (!frozen) {
      let record = object(preparation);
      if (record.planId !== base.planId || record.planSha256 !== base.planSha256)
        throw new Error('Initial replacement preparation differs from the owning plan');
      let versions: Awaited<ReturnType<typeof captureCeReplacementVersions>>;
      try {
        versions = await captureCeReplacementVersions(
          binding,
          String(record.uid),
          String(record.contractFingerprint),
          runtime,
          contract,
          signal,
        );
      } catch (error) {
        if (
          error instanceof Error &&
          (error.message.includes('version evidence is unavailable') ||
            error.message.includes('versions are not stable'))
        )
          return { handled: true, status: 'pending-replacement-versions' };
        throw error;
      }
      if (!session.readResourceIdentities || !session.readConfigurationSha256)
        throw new Error('Terraform replacement identity reader unavailable');
      const identities = await session.readResourceIdentities(process.env, signal);
      const find = (address: string, type: string, pattern: RegExp) => {
        const rows = identities.filter((row) => row.address === address && row.type === type);
        if (rows.length !== 1 || !pattern.test(rows[0].id))
          throw new Error('Initial replacement resource identity differs');
        return rows[0].id;
      };
      const interfaceIds: Record<string, string> = {};
      const elasticIpAllocationIds: Record<string, string> = {};
      const bootstrapTokenNames: Record<string, string> = {};
      for (const node of site.nodeIndexes) {
        const hostname = `${base.deploymentName}-${node}`;
        for (const iface of base.intent.interfaces)
          interfaceIds[`${hostname}/${iface.role}`] = find(
            `aws_network_interface.node_${node}_nic_${iface.index}`,
            'aws_network_interface',
            /^eni-[a-f0-9]{8,17}$/,
          );
        if (base.egress.mode === 'elastic-ip')
          elasticIpAllocationIds[hostname] = find(`aws_eip.node_${node}`, 'aws_eip', /^eipalloc-[a-f0-9]{8,17}$/);
        const token = `${base.deploymentName.slice(0, 40)}-${node}-${base.planSha256.slice(0, 12)}`;
        const saved = object(await storage.read(`${token}.json`));
        if (saved.tokenName !== token || saved.siteName !== site.name || saved.node !== hostname)
          throw new Error('Initial replacement bootstrap ownership differs');
        bootstrapTokenNames[hostname] = token;
      }
      const refreshed = await runtime.prepareAwsSiteReplacement(
        binding,
        record.instances as Record<string, string>,
        record.interfaces as Parameters<CeRuntime['prepareAwsSiteReplacement']>[2],
        signal,
      );
      if (refreshed.uid !== record.uid) throw new Error('Initial replacement site identity changed');
      record = { ...refreshed, planId: base.planId, planSha256: base.planSha256 };
      const plan = compileAwsSiteReplacement(base, site.name, record, {
        versions,
        interfaceIds,
        elasticIpAllocationIds,
        bootstrapTokenNames,
      });
      frozen = {
        sourcePlanSha256: base.planSha256,
        configurationSha256: await session.readConfigurationSha256(),
        plan,
      };
      await storage.write(name, frozen);
    }
    const record = object(frozen);
    if (
      record.sourcePlanSha256 !== base.planSha256 ||
      typeof record.configurationSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(record.configurationSha256)
    )
      throw new Error('Frozen initial replacement source differs');
    const plan = record.plan as AwsSiteReplacementPlan;
    if (plan?.sourcePlanSha256 !== base.planSha256 || plan.binding?.siteName !== site.name)
      throw new Error('Frozen initial replacement plan differs');
    const driver = await createTerraformAwsSiteReplacementDriver(
      base,
      plan,
      record.configurationSha256,
      session,
      storage,
      api,
      process.env,
    );
    const result = await runAwsSiteReplacement(plan, plan.planSha256, driver, runtime, storage, contract, signal);
    if (result.status !== 'registered-with-configured-interfaces') return { handled: true, ...result };
  }
  return { handled, status: handled ? 'registered' : 'not-required' };
}
