import { createHash } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { TerraformSession } from '../../../terraform/src/service';
import type { AwsExecApi } from '../aws/exec';
import { verifyAwsCePlan } from './artifacts';
import { renderAwsCeCloudInit } from './cloud-init';
import { renderAwsTerraformFoundation } from './terraform-foundation';
import { discoverAwsTerraformInterfaces } from './terraform-identities';
import { siteBindings } from './topology';
import type { AwsCePlan } from './types';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
interface Admission {
  schemaVersion: 1;
  planSha256: string;
  configurationSha256: string;
  bootstrapByNode: Record<string, string>;
  admittedSites: string[];
}

/** Internal stage after foundation apply. Routing/traffic acceptance is deliberately separate. */
export async function admitAwsTerraformSites(
  plan: AwsCePlan,
  session: TerraformSession,
  runtime: Pick<
    CeRuntime,
    'reserveSite' | 'bootstrap' | 'observeRegistrations' | 'approveRegistrations' | 'observeAwsRegisteredConfiguration'
  >,
  storage: Pick<CeDeploymentStore, 'read' | 'write' | 'verify'>,
  api: AwsExecApi,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
) {
  verifyAwsCePlan(plan);
  const initial = renderAwsTerraformFoundation(plan);
  if (plan.intent.interfaces.some((item) => !['slo', 'sli'].includes(item.role) || item.addressing.mode !== 'dhcp'))
    throw new Error('Terraform admission requires supported SLO/SLI DHCP mapping');
  let checkpoint: Admission;
  try {
    checkpoint = (await storage.read('terraform-admission.json')) as Admission;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    checkpoint = {
      schemaVersion: 1,
      planSha256: plan.planSha256,
      configurationSha256: hash(initial),
      bootstrapByNode: {},
      admittedSites: [],
    };
  }
  if (
    checkpoint.schemaVersion !== 1 ||
    checkpoint.planSha256 !== plan.planSha256 ||
    !Array.isArray(checkpoint.admittedSites) ||
    !checkpoint.bootstrapByNode ||
    typeof checkpoint.bootstrapByNode !== 'object'
  )
    throw new Error('Terraform admission checkpoint differs from plan');
  const siteNames = siteBindings(plan).map(({ site }) => site.name);
  if (
    !/^[0-9a-f]{64}$/.test(checkpoint.configurationSha256) ||
    JSON.stringify(checkpoint.admittedSites) !== JSON.stringify(siteNames.slice(0, checkpoint.admittedSites.length))
  )
    throw new Error('Terraform admission checkpoint is not an ordered site prefix');
  const save = () => storage.write('terraform-admission.json', checkpoint);
  const readOutputs = async () => {
    try {
      return await session.readOutputs(['ce_vpc_id', 'ce_interfaces', 'ce_instances'], env, signal);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('applied or converged current configuration'))
        throw error;
      const receipt = await session.plan(env, signal);
      const desiredHash = hash(renderAwsTerraformFoundation(plan, checkpoint.bootstrapByNode));
      if (
        ![checkpoint.configurationSha256, desiredHash].includes(receipt.configurationSha256) ||
        receipt.changes.some((change) => change.actions.some((action) => !['create', 'read', 'no-op'].includes(action)))
      )
        throw new Error('Interrupted Terraform admission requires lifecycle reconciliation');
      await storage.write('terraform-admission-plan.json', receipt);
      await session.apply(receipt, env, signal);
      checkpoint.configurationSha256 = receipt.configurationSha256;
      await save();
      return session.readOutputs(['ce_vpc_id', 'ce_interfaces', 'ce_instances'], env, signal);
    }
  };

  const observations: Array<Record<string, unknown>> = [];
  for (const { site, binding } of siteBindings(plan)) {
    signal?.throwIfAborted();
    await storage.verify();
    const outputs = await readOutputs();
    await discoverAwsTerraformInterfaces(plan, outputs, api, signal);
    if (!checkpoint.admittedSites.includes(site.name)) {
      await runtime.reserveSite(binding, (record) => storage.write(`terraform-site-${site.name}.json`, record), signal);
      for (const node of site.nodeIndexes) {
        if (checkpoint.bootstrapByNode[String(node)]) continue;
        const tokenName = `${plan.deploymentName.slice(0, 40)}-${node}-${plan.planSha256.slice(0, 12)}`;
        const material = await runtime.bootstrap(
          binding,
          `${plan.deploymentName}-${node}`,
          tokenName,
          (secret) => storage.write(`${tokenName}.json`, secret),
          signal,
        );
        checkpoint.bootstrapByNode[String(node)] = renderAwsCeCloudInit({
          nodeName: `${plan.deploymentName}-${node}`,
          material,
        });
        await save();
      }
      const configuration = renderAwsTerraformFoundation(plan, checkpoint.bootstrapByNode);
      const nextHash = hash(configuration);
      try {
        await session.reviseConfiguration(checkpoint.configurationSha256, configuration);
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('revision is stale')) throw error;
        // A prior run may have committed the exact desired revision before checkpointing.
        await session.reviseConfiguration(nextHash, configuration);
      }
      checkpoint.configurationSha256 = nextHash;
      await save();
      const receipt = await session.plan(env, signal);
      if (
        receipt.changes.some((change) => change.actions.some((action) => !['create', 'read', 'no-op'].includes(action)))
      )
        throw new Error(
          'Terraform admission would alter or replace an existing resource; reconcile the reviewed lifecycle plan',
        );
      await storage.write('terraform-admission-plan.json', receipt);
      await session.apply(receipt, env, signal);
      checkpoint.admittedSites.push(site.name);
      await save();
    }
    const current = await readOutputs();
    const discovered = await discoverAwsTerraformInterfaces(plan, current, api, signal);
    const instances = current.ce_instances as Record<string, { id: string }>;
    const expected = Object.fromEntries(
      site.nodeIndexes.map((node) => [`${plan.deploymentName}-${node}`, instances[String(node)]?.id]),
    );
    if (Object.values(expected).some((id) => !/^i-[0-9a-f]{8,17}$/.test(id ?? '')))
      throw new Error('Terraform admitted instance identities are unavailable');
    const registrations = await runtime.approveRegistrations(
      binding,
      expected,
      (record) => storage.write(`terraform-registration-${site.name}.json`, record),
      signal,
    );
    const configuration = await runtime.observeAwsRegisteredConfiguration(
      binding,
      expected,
      site.nodeIndexes.flatMap((node) =>
        plan.intent.interfaces.map((item) => ({
          node: `${plan.deploymentName}-${node}`,
          role: item.role as 'slo' | 'sli',
          mac: discovered.bindings[`__ENI_${node}_${item.index}_MAC__`],
        })),
      ),
      signal,
    );
    observations.push({ siteName: site.name, registrations, configuration });
    if (configuration.status !== 'configured')
      return { status: 'pending-interface-configuration', sites: observations, routing: 'unknown', traffic: 'unknown' };
    if (registrations.status !== 'healthy')
      return { status: 'pending-registration', sites: observations, routing: 'unknown', traffic: 'unknown' };
  }
  return {
    status: 'registered',
    sites: observations,
    routing: 'unknown',
    traffic: 'unknown',
  };
}
