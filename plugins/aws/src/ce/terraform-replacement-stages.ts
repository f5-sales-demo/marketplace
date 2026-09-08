import { createHash } from 'node:crypto';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
import { verifyAwsCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import type { AwsSiteReplacementPlan } from './site-replacement';
import { siteBindings } from './topology';
import type { AwsCePlan } from './types';

type Json = Record<string, unknown>;
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Malformed replacement configuration');
  return value as Json;
};
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export interface AwsTerraformReplacementStage {
  phase: 'quiesce' | 'launch';
  replacementPlanSha256: string;
  deploymentId: string;
  previousConfigurationSha256: string;
  configurationSha256: string;
  /** Potentially sensitive; keep in the deployment store, never a conversational plan summary. */
  configuration: string;
  addresses: string[];
}

/** Translate the exact current deployment, including cumulative admission and routing resources. */
export function awsTerraformReplacementStages(
  base: AwsCePlan,
  replacement: AwsSiteReplacementPlan,
  configuration: string,
  expectedConfigurationSha256: string,
) {
  verifyAwsCePlan(base);
  const { planId, planSha256, ...draft } = replacement;
  const selected = siteBindings(base).find(({ binding }) => binding.siteName === replacement.binding.siteName);
  if (
    base.engine !== 'terraform' ||
    replacement.engine !== 'terraform' ||
    replacement.kind !== 'aws-ce-site-replacement' ||
    replacement.schemaVersion !== 1 ||
    replacement.sourcePlanSha256 !== base.planSha256 ||
    canonicalSha256(draft) !== planSha256 ||
    planId !== `aws-ce-replace-${planSha256.slice(0, 24)}` ||
    !selected ||
    canonicalSha256(selected.binding) !== canonicalSha256(replacement.binding)
  )
    throw new Error('Terraform replacement engine, identity or plan integrity differs');
  if (digest(configuration) !== expectedConfigurationSha256)
    throw new Error('Current Terraform configuration hash differs');
  const original = object(JSON.parse(configuration));
  const resources = object(original.resource);
  const instances = object(resources.aws_instance);
  const associations = object(resources.aws_eip_association);
  const outputs = object(object(object(original.output).ce_instances).value);
  const addresses: string[] = [];
  for (const node of selected.site.nodeIndexes) {
    const name = `node_${node}`;
    const instance = object(instances[name]);
    const association = object(associations[name]);
    const tags = object(instance.tags);
    if (
      tags['xcsh-execution-engine'] !== 'terraform' ||
      tags['xcsh-managed-by'] !== 'aws-ce' ||
      tags['xcsh-deployment-id'] !== base.deploymentName ||
      tags['xcsh-plan-sha256'] !== base.planSha256 ||
      tags['xcsh-node-index'] !== String(node) ||
      tags['ves-io-site-name'] !== selected.site.name ||
      instance.count !== undefined ||
      instance.for_each !== undefined ||
      instance.ami !== base.intent.image.amiId ||
      instance.instance_type !== base.intent.instance.type ||
      instance.user_data_replace_on_change !== true ||
      typeof instance.user_data_base64 !== 'string'
    )
      throw new Error('Terraform replacement instance configuration differs');
    const expected = base.intent.interfaces.map((iface) => ({
      device_index: iface.index,
      network_interface_id: `\${aws_network_interface.node_${node}_nic_${iface.index}.id}`,
      delete_on_termination: false,
    }));
    if (
      canonicalSha256(instance.network_interface) !== canonicalSha256(expected) ||
      association.allocation_id !== `\${aws_eip.node_${node}.id}` ||
      association.network_interface_id !== `\${aws_network_interface.node_${node}_nic_0.id}` ||
      association.count !== undefined ||
      association.for_each !== undefined ||
      object(outputs[String(node)]).id !== `\${aws_instance.node_${node}.id}`
    )
      throw new Error('Terraform replacement retained network or output binding differs');
    addresses.push(`aws_instance.${name}`, `aws_eip_association.${name}`);
  }
  const quiesced = structuredClone(original);
  const quiescedResources = object(quiesced.resource);
  for (const node of selected.site.nodeIndexes) {
    delete object(quiescedResources.aws_instance)[`node_${node}`];
    delete object(quiescedResources.aws_eip_association)[`node_${node}`];
    delete object(object(object(quiesced.output).ce_instances).value)[String(node)];
  }
  const quiesceConfiguration = JSON.stringify(quiesced);
  const make = (
    phase: AwsTerraformReplacementStage['phase'],
    text: string,
    previous: string,
  ): AwsTerraformReplacementStage => ({
    phase,
    replacementPlanSha256: planSha256,
    deploymentId: base.deploymentName,
    previousConfigurationSha256: previous,
    configurationSha256: digest(text),
    configuration: text,
    addresses: [...addresses],
  });
  return {
    quiesce: make('quiesce', quiesceConfiguration, expectedConfigurationSha256),
    launch(bootstrapByHostname: Record<string, string>): AwsTerraformReplacementStage {
      if (Object.keys(bootstrapByHostname).length !== selected.binding.nodes.length)
        throw new Error('Complete replacement bootstrap inventory is required');
      const resumed = structuredClone(original);
      for (const node of selected.site.nodeIndexes) {
        const material = bootstrapByHostname[`${base.deploymentName}-${node}`];
        if (
          typeof material !== 'string' ||
          !material.startsWith('#cloud-config\n') ||
          !material.includes('/etc/vpm/user_data') ||
          /__\w+__/.test(material)
        )
          throw new Error('Resolved replacement cloud-init is required');
        object(object(object(resumed.resource).aws_instance)[`node_${node}`]).user_data_base64 =
          Buffer.from(material).toString('base64');
      }
      return make('launch', JSON.stringify(resumed), digest(quiesceConfiguration));
    },
  };
}

/** Additional lifecycle gate; the runner still verifies and applies the exact private binary plan. */
export function inspectAwsTerraformReplacementStage(stage: AwsTerraformReplacementStage, receipt: PlanReceipt): void {
  if (
    receipt.schemaVersion !== 1 ||
    receipt.engine !== 'terraform' ||
    receipt.deploymentId !== stage.deploymentId ||
    receipt.configurationSha256 !== stage.configurationSha256 ||
    digest(stage.configuration) !== stage.configurationSha256 ||
    !['quiesce', 'launch'].includes(stage.phase) ||
    !Array.isArray(receipt.changes)
  )
    throw new Error('Terraform replacement saved plan binding differs');
  const seen = new Set<string>();
  for (const change of receipt.changes) {
    if (seen.has(change.address) || !Array.isArray(change.actions) || change.actions.length !== 1)
      throw new Error('Ambiguous or combined Terraform replacement actions');
    seen.add(change.address);
    const action = change.actions[0];
    if (action === 'no-op') continue;
    if (
      !stage.addresses.includes(change.address) ||
      change.type !== change.address.split('.')[0] ||
      action !== (stage.phase === 'quiesce' ? 'delete' : 'create') ||
      receipt.noChanges
    )
      throw new Error('Terraform replacement would mutate outside the selected stage');
  }
}

/** Internal executable stage. The outer coordinator must establish live ownership before calling it. */
export async function applyAwsTerraformReplacementStage(
  session: TerraformSession,
  stage: AwsTerraformReplacementStage,
  persist: (receipt: PlanReceipt) => Promise<void>,
  env: Record<string, string | undefined>,
  signal?: AbortSignal,
): Promise<PlanReceipt> {
  signal?.throwIfAborted();
  if (digest(stage.configuration) !== stage.configurationSha256)
    throw new Error('Replacement configuration integrity differs');
  try {
    await session.reviseConfiguration(stage.previousConfigurationSha256, stage.configuration);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('revision is stale')) throw error;
    await session.reviseConfiguration(stage.configurationSha256, stage.configuration);
  }
  const receipt = await session.plan(env, signal);
  inspectAwsTerraformReplacementStage(stage, receipt);
  await persist(receipt);
  await session.apply(receipt, env, signal);
  return receipt;
}
