import { createHash } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { PlanReceipt } from '../../../terraform/src/runner';
import type { TerraformSession } from '../../../terraform/src/service';
import type { AwsExecApi } from '../aws/exec';
import { canonicalSha256 } from './canonical';
import { observeAwsResources } from './discovery';
import { scopedAwsApi } from './scoped-exec';
import type {
  AwsQuiescenceAdmission,
  AwsQuiescenceState,
  AwsSiteReplacementDriver,
  AwsSiteReplacementPlan,
} from './site-replacement';
import { discoverAwsTerraformInterfaces } from './terraform-identities';
import { applyAwsTerraformReplacementStage, awsTerraformReplacementStages } from './terraform-replacement-stages';
import { siteBindings } from './topology';
import type { AwsCePlan } from './types';

type Json = Record<string, unknown>;
type Storage = Pick<CeDeploymentStore, 'owner' | 'verify' | 'read' | 'write'>;
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Malformed Terraform replacement evidence');
  return value as Json;
};
const list = (value: unknown): Json[] => {
  if (!Array.isArray(value)) throw new Error('Incomplete Terraform replacement observation');
  return value.map(object);
};
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

/** Cloud driver for the shared F5 replacement coordinator. All cloud mutations belong to Terraform. */
export async function createTerraformAwsSiteReplacementDriver(
  source: AwsCePlan,
  replacement: AwsSiteReplacementPlan,
  expectedConfigurationSha256: string,
  session: TerraformSession,
  storage: Storage,
  raw: AwsExecApi,
  env: Record<string, string | undefined>,
): Promise<AwsSiteReplacementDriver> {
  const base = structuredClone(source);
  const plan = structuredClone(replacement);
  const validate = async (candidate: AwsSiteReplacementPlan) => {
    if (
      base.engine !== 'terraform' ||
      plan.engine !== 'terraform' ||
      canonicalSha256(candidate) !== canonicalSha256(plan) ||
      canonicalSha256(storage.owner) !== canonicalSha256(plan.binding.owner)
    )
      throw new Error('Terraform replacement ownership differs');
    await storage.verify();
  };
  await validate(plan);
  const snapshotName = `${plan.planId}-terraform-source.json`;
  let snapshot: Json;
  try {
    snapshot = object(await storage.read(snapshotName));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const configuration = await session.readConfiguration(expectedConfigurationSha256);
    // Validate engine, source plan, site topology and the exact configuration before persisting it.
    awsTerraformReplacementStages(base, plan, configuration, expectedConfigurationSha256);
    snapshot = {
      schemaVersion: 1,
      replacementPlanSha256: plan.planSha256,
      configurationSha256: expectedConfigurationSha256,
      configuration,
    };
    await storage.write(snapshotName, snapshot);
  }
  if (
    snapshot.schemaVersion !== 1 ||
    snapshot.replacementPlanSha256 !== plan.planSha256 ||
    snapshot.configurationSha256 !== expectedConfigurationSha256 ||
    typeof snapshot.configuration !== 'string' ||
    hash(snapshot.configuration) !== expectedConfigurationSha256
  )
    throw new Error('Terraform replacement source snapshot differs');
  const stages = awsTerraformReplacementStages(base, plan, snapshot.configuration, expectedConfigurationSha256);
  const nodeIndex = (node: string) => Number(node.slice(base.deploymentName.length + 1));
  const launchMarkerName = `${plan.planId}-terraform-launch.json`;
  const readLaunch = async () => {
    try {
      const marker = object(await storage.read(launchMarkerName));
      if (
        marker.schemaVersion !== 1 ||
        marker.replacementPlanSha256 !== plan.planSha256 ||
        typeof marker.configurationSha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(marker.configurationSha256)
      )
        throw new Error('Terraform replacement launch marker differs');
      return marker;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return undefined;
    }
  };
  const observe = async (candidate: AwsSiteReplacementPlan, allowNew: boolean, signal?: AbortSignal) => {
    await validate(candidate);
    const api = scopedAwsApi(raw, base.intent.awsProfile, signal);
    const identity = await api.exec('aws', ['sts', 'get-caller-identity', '--region', base.region, '--output', 'json']);
    if (identity.exitCode) throw new Error('Terraform replacement AWS identity unavailable');
    const caller = object(JSON.parse(identity.stdout));
    if (caller.Account !== base.accountId || !String(caller.Arn).startsWith(`arn:${base.partition}:`))
      throw new Error('Terraform replacement AWS account or partition differs');
    const old = object(plan.preparation.instances);
    const ids = [
      ...Object.values(old).map(String),
      ...Object.values(plan.interfaceIds),
      ...Object.values(plan.elasticIpAllocationIds),
    ];
    const observed = await observeAwsResources(api, ids, base.region, {
      deploymentName: base.deploymentName,
      planSha256s: [base.planSha256],
    });
    const checked = (id: string) => {
      const found = observed.find((row) => row.id === id);
      if (
        !found?.exists ||
        !found.owned ||
        found.tags['xcsh-execution-engine'] !== 'terraform' ||
        found.state.NextToken
      )
        throw new Error('Terraform replacement cloud resource ownership is unavailable or differs');
      return found;
    };
    const current: Record<string, string> = {};
    const associations: Record<string, string> = {};
    let terminated = true;
    let quiescenceStarted = false;
    let detached = true;
    for (const node of plan.binding.nodes) {
      const index = nodeIndex(node);
      const original = checked(String(old[node]));
      const oldRows = list(original.state.Reservations).flatMap((row) => list(row.Instances));
      if (
        oldRows.length !== 1 ||
        oldRows[0].InstanceId !== old[node] ||
        original.tags['xcsh-node-index'] !== String(index) ||
        original.tags['ves-io-site-name'] !== plan.binding.siteName ||
        oldRows[0].ImageId !== base.intent.image.amiId
      )
        throw new Error('Original Terraform instance identity differs');
      const state = object(oldRows[0].State).Name;
      if (!['pending', 'running', 'stopping', 'stopped', 'shutting-down', 'terminated'].includes(String(state)))
        throw new Error('Original Terraform instance state is unknown');
      terminated &&= state === 'terminated';
      quiescenceStarted ||= state === 'terminated' || state === 'shutting-down';
      const vpcs = new Set<string>();
      for (const iface of base.intent.interfaces) {
        const key = `${node}/${iface.role}`;
        const found = checked(plan.interfaceIds[key]);
        const rows = list(found.state.NetworkInterfaces);
        const expected = list(plan.preparation.interfaces).find((row) => row.node === node && row.role === iface.role);
        if (rows.length !== 1 || rows[0].NetworkInterfaceId !== plan.interfaceIds[key])
          throw new Error('Ambiguous retained Terraform ENI');
        const eni = rows[0];
        vpcs.add(String(eni.VpcId));
        if (
          eni.OwnerId !== base.accountId ||
          eni.MacAddress !== expected?.mac ||
          eni.AvailabilityZone !== iface.subnets[index - 1].availabilityZone ||
          found.tags['xcsh-node-index'] !== String(index) ||
          found.tags['xcsh-interface-index'] !== String(iface.index) ||
          found.tags['ves-io-site-name'] !== plan.binding.siteName
        )
          throw new Error('Retained Terraform ENI identity differs');
        if (eni.Attachment) {
          detached = false;
          const attachment = object(eni.Attachment);
          const id = String(attachment.InstanceId);
          if (
            attachment.DeviceIndex !== iface.index ||
            attachment.DeleteOnTermination !== false ||
            !/^i-[a-f0-9]{8,17}$/.test(id)
          )
            throw new Error('Retained Terraform ENI attachment differs');
          if (id !== old[node]) {
            if (!allowNew || state !== 'terminated' || (current[node] && current[node] !== id))
              throw new Error('Unexpected replacement Terraform instance attachment');
            current[node] = id;
          }
        } else if (eni.Status !== 'available') throw new Error('Retained Terraform ENI state is unavailable');
      }
      if (vpcs.size !== 1) throw new Error('Retained Terraform ENI VPC differs');
      const eip = checked(plan.elasticIpAllocationIds[node]);
      const addresses = list(eip.state.Addresses);
      if (
        addresses.length !== 1 ||
        addresses[0].AllocationId !== plan.elasticIpAllocationIds[node] ||
        eip.tags['xcsh-node-index'] !== String(index) ||
        (addresses[0].AssociationId && addresses[0].NetworkInterfaceId !== plan.interfaceIds[`${node}/slo`])
      )
        throw new Error('Retained Terraform EIP association differs');
      if (addresses[0].AssociationId) {
        if (!/^eipassoc-[a-f0-9]{8,17}$/.test(String(addresses[0].AssociationId)))
          throw new Error('Malformed retained EIP association');
        associations[node] = String(addresses[0].AssociationId);
      }
    }
    for (const [node, id] of Object.entries(current)) {
      const [found] = await observeAwsResources(api, [id], base.region, {
        deploymentName: base.deploymentName,
        planSha256s: [base.planSha256],
      });
      const rows = list(found.state.Reservations).flatMap((row) => list(row.Instances));
      if (
        !found.exists ||
        !found.owned ||
        found.tags['xcsh-execution-engine'] !== 'terraform' ||
        found.state.NextToken ||
        found.tags['xcsh-node-index'] !== String(nodeIndex(node)) ||
        found.tags['ves-io-site-name'] !== plan.binding.siteName ||
        rows.length !== 1 ||
        rows[0].InstanceId !== id ||
        rows[0].ImageId !== base.intent.image.amiId ||
        rows[0].InstanceType !== base.intent.instance.type ||
        !['pending', 'running', 'stopping', 'stopped'].includes(String(object(rows[0].State).Name))
      )
        throw new Error('New Terraform instance ownership differs');
    }
    const missingAssociations = Object.keys(associations).length < Object.keys(plan.elasticIpAllocationIds).length;
    const quiescence: AwsQuiescenceState =
      terminated && detached && !Object.keys(associations).length
        ? 'complete'
        : quiescenceStarted || missingAssociations
          ? 'partial'
          : 'intact';
    return { current, associations, terminated, detached, quiescence };
  };
  const outputs = async (signal?: AbortSignal) => {
    const values = await session.readOutputs(['ce_vpc_id', 'ce_interfaces', 'ce_instances'], env, signal);
    const evidence = await discoverAwsTerraformInterfaces(base, values, raw, signal);
    for (const node of plan.binding.nodes)
      for (const iface of base.intent.interfaces) {
        if (
          evidence.bindings[`__ENI_${nodeIndex(node)}_${iface.index}__`] !== plan.interfaceIds[`${node}/${iface.role}`]
        )
          throw new Error('Terraform state changed a retained ENI identity');
      }
    return object(values.ce_instances);
  };
  const authorizeReceipt = async (
    receipt: PlanReceipt,
    phase: 'quiesce' | 'launch',
    signal?: AbortSignal,
    admission?: AwsQuiescenceAdmission,
  ) => {
    const identities = await session.readPlannedResourceIds(receipt, stages.quiesce.addresses, env, signal);
    const live = await observe(plan, phase === 'launch', signal);
    for (const change of receipt.changes.filter((change) => stages.quiesce.addresses.includes(change.address))) {
      const node = `${base.deploymentName}-${Number(change.address.split('node_')[1])}`;
      const expected =
        change.type === 'aws_instance'
          ? phase === 'quiesce'
            ? object(plan.preparation.instances)[node]
            : live.current[node]
          : live.associations[node];
      if (change.actions[0] === 'create') {
        if (identities[change.address] !== null || expected)
          throw new Error(
            'Terraform replacement creation has an existing resource identity; reconcile state before retrying',
          );
      } else if (!expected || identities[change.address] !== expected) {
        throw new Error('Terraform saved plan targets a different cloud resource');
      }
    }
    await storage.write(`${plan.planId}-terraform-${phase}-plan.json`, { receipt, identities });
    if (phase === 'quiesce') await admission?.(live.quiescence);
  };
  return {
    quiescenceAdmissionVersion: 1,
    engine: 'terraform',
    async finalize(candidate, expected, signal) {
      await validate(candidate);
      const live = await observe(candidate, true, signal);
      if (plan.binding.nodes.some((node) => !expected[node] || live.current[node] !== expected[node]))
        throw new Error('Terraform replacement completion identity differs');
      const marker = await readLaunch();
      if (!marker) throw new Error('Terraform replacement launch marker is unavailable');
      const configuration = await session.readConfiguration(String(marker.configurationSha256));
      const bootstraps = (configuration: string): Record<string, string> => {
        const instances = object(object(object(JSON.parse(configuration)).resource).aws_instance);
        return Object.fromEntries(
          Object.entries(instances)
            .filter(([name]) => /^node_[1-3]$/.test(name))
            .map(([name, value]) => {
              const encoded = object(value).user_data_base64;
              if (typeof encoded !== 'string') throw new Error('Terraform admission bootstrap snapshot is incomplete');
              return [name.slice(5), Buffer.from(encoded, 'base64').toString('utf8')];
            }),
        );
      };
      const oldBootstrap = bootstraps(String(snapshot.configuration));
      const nextBootstrap = bootstraps(configuration);
      const material = Object.fromEntries(
        plan.binding.nodes.map((node) => [node, nextBootstrap[String(nodeIndex(node))]]),
      );
      if (stages.launch(material).configurationSha256 !== marker.configurationSha256)
        throw new Error('Terraform replacement completion configuration differs');
      let admission: Json;
      try {
        admission = object(await storage.read('terraform-admission.json'));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        return;
      }
      if (
        admission.schemaVersion !== 1 ||
        admission.planSha256 !== base.planSha256 ||
        !Array.isArray(admission.admittedSites) ||
        !admission.admittedSites.includes(plan.binding.siteName) ||
        canonicalSha256(admission.admittedSites) !==
          canonicalSha256(
            siteBindings(base)
              .map(({ site }) => site.name)
              .slice(0, admission.admittedSites.length),
          )
      )
        throw new Error('Terraform admission ownership or selected site differs');
      const isOriginal =
        admission.configurationSha256 === expectedConfigurationSha256 &&
        canonicalSha256(admission.bootstrapByNode) === canonicalSha256(oldBootstrap);
      const isCompleted =
        admission.configurationSha256 === marker.configurationSha256 &&
        canonicalSha256(admission.bootstrapByNode) === canonicalSha256(nextBootstrap);
      if (!isOriginal && !isCompleted) throw new Error('Terraform admission changed during replacement');
      if (!isCompleted)
        await storage.write('terraform-admission.json', {
          ...admission,
          configurationSha256: marker.configurationSha256,
          bootstrapByNode: nextBootstrap,
        });
    },
    async assertOwnership(candidate, phase, expected = {}, signal) {
      const marker = await readLaunch();
      const live = await observe(candidate, !!marker && ['launch', 'registration', 'complete'].includes(phase), signal);
      if (['registration', 'complete'].includes(phase) || Object.keys(expected).length) {
        const instances = await outputs(signal);
        for (const node of plan.binding.nodes)
          if (
            !expected[node] ||
            live.current[node] !== expected[node] ||
            object(instances[String(nodeIndex(node))]).id !== expected[node]
          )
            throw new Error('Terraform output and replacement instance checkpoint differ');
      }
    },
    async quiesce(candidate, signal, admission) {
      await observe(candidate, false, signal);
      await applyAwsTerraformReplacementStage(
        session,
        stages.quiesce,
        (receipt) => authorizeReceipt(receipt, 'quiesce', signal, admission),
        env,
        signal,
      );
      const live = await observe(candidate, false, signal);
      if (!live.terminated || !live.detached) throw new Error('Terraform replacement quiescence has not converged');
      const instances = await outputs(signal);
      if (plan.binding.nodes.some((node) => Object.hasOwn(instances, String(nodeIndex(node)))))
        throw new Error('Terraform state still contains a quiesced node');
    },
    async launch(candidate, bootstrap, signal) {
      const stage = stages.launch(bootstrap);
      const previous = await readLaunch();
      if (previous && previous.configurationSha256 !== stage.configurationSha256)
        throw new Error('Terraform replacement bootstrap changed on resume');
      const live = await observe(candidate, !!previous, signal);
      if (!live.terminated) throw new Error('Original VMs must terminate before Terraform replacement launch');
      await storage.write(launchMarkerName, {
        schemaVersion: 1,
        replacementPlanSha256: plan.planSha256,
        configurationSha256: stage.configurationSha256,
      });
      await applyAwsTerraformReplacementStage(
        session,
        stage,
        (receipt) => authorizeReceipt(receipt, 'launch', signal),
        env,
        signal,
      );
      const after = await observe(candidate, true, signal);
      const instances = await outputs(signal);
      const result: Record<string, string> = {};
      for (const node of plan.binding.nodes) {
        const id = object(instances[String(nodeIndex(node))]).id;
        if (
          typeof id !== 'string' ||
          !after.current[node] ||
          id !== after.current[node] ||
          id === object(plan.preparation.instances)[node]
        )
          throw new Error('Terraform replacement instance state has not converged');
        result[node] = id;
      }
      const refresh = await session.plan(env, signal);
      if (refresh.configurationSha256 !== stage.configurationSha256 || !refresh.noChanges)
        throw new Error('Terraform replacement requires a refresh-enabled no-change plan');
      await storage.write(`${plan.planId}-terraform-refresh.json`, refresh);
      return result;
    },
  };
}
