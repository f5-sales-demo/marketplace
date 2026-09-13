import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { VerifiedRoutingContract } from '../../../platform/src/ce/routing-contract';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { AwsExecApi } from '../aws/exec';
import { verifyAwsCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { observeAwsResources } from './discovery';
import { associateAwsCeEip } from './eip-association';
import { collectAwsNetworkHealth } from './network-health';
import { configureAwsRouting, validateAwsRoutingRebind } from './routing-apply';
import { scopedAwsApi } from './scoped-exec';
import type { AwsSiteReplacementDriver, AwsSiteReplacementPlan } from './site-replacement';
import { siteBindings } from './topology';
import type { AwsCeCheckpoint, AwsCePlan } from './types';

type Json = Record<string, unknown>;
type Storage = Pick<CeDeploymentStore, 'owner' | 'verify' | 'read' | 'write' | 'directory'>;
const object = (value: unknown): Json => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Malformed AWS replacement observation');
  return value as Json;
};
const list = (value: unknown): Json[] => {
  if (!Array.isArray(value)) throw new Error('Incomplete AWS replacement observation');
  return value.map(object);
};
const instanceRows = (value: Json) => list(value.Reservations).flatMap((row) => list(row.Instances));

/** Native cloud half of coupled replacement. The shared coordinator owns site and token mutations. */
export function createNativeAwsSiteReplacementDriver(
  source: AwsCePlan,
  raw: AwsExecApi,
  storage: Storage,
  routing?: { runtime: CeRuntime; contract: VerifiedRoutingContract; checkpoint: AwsCeCheckpoint },
): AwsSiteReplacementDriver {
  verifyAwsCePlan(source);
  if (source.engine !== 'native') throw new Error('Replacement requires a native source plan');
  const base = structuredClone(source);
  const routingSource = routing ? structuredClone(routing.checkpoint) : undefined;
  if (routing && routing.runtime.engine !== 'native')
    throw new Error('Connect replacement requires automatic routing recovery');
  const token = (plan: AwsSiteReplacementPlan, node: string) => canonicalSha256({ replacement: plan.planSha256, node });
  const nodeIndex = (node: string) => {
    const index = Number(node.slice(base.deploymentName.length + 1));
    if (
      node !== `${base.deploymentName}-${index}` ||
      !Number.isInteger(index) ||
      index < 1 ||
      index > base.intent.topology.nodeCount
    )
      throw new Error('Replacement node is outside the source plan');
    return index;
  };
  const validate = async (plan: AwsSiteReplacementPlan) => {
    const { planId, planSha256, ...draft } = plan;
    const selected = siteBindings(base).find(({ binding }) => binding.siteName === plan.binding.siteName);
    if (
      plan.schemaVersion !== 2 ||
      plan.kind !== 'aws-ce-site-replacement' ||
      plan.engine !== 'native' ||
      plan.sourcePlanSha256 !== base.planSha256 ||
      canonicalSha256(draft) !== planSha256 ||
      planId !== `aws-ce-replace-${planSha256.slice(0, 24)}` ||
      !selected ||
      canonicalSha256(selected.binding) !== canonicalSha256(plan.binding) ||
      canonicalSha256(storage.owner) !== canonicalSha256(plan.binding.owner)
    )
      throw new Error('Native replacement ownership or plan integrity differs');
    if (base.routing?.profile === 'tgw-connect') {
      if (!routing || !routingSource) {
        if (plan.preparation.evidenceKind !== 'preboot-interface-configuration-required')
          throw new Error('Replacement routing runtime is unavailable');
      } else {
        validateAwsRoutingRebind(base, {
          siteName: plan.binding.siteName,
          siteUid: String(plan.preparation.uid),
          contract: routing.contract,
          checkpoint: routingSource,
        });
        const name = `${plan.planId}-routing-source.json`;
        const expected = { replacementPlanSha256: plan.planSha256, checkpoint: routingSource };
        try {
          if (canonicalSha256(await storage.read(name)) !== canonicalSha256(expected))
            throw new Error('Replacement routing source changed');
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          await storage.write(name, expected);
        }
      }
    }
    for (const node of plan.binding.nodes) launchArgs(plan, node);
    await storage.verify();
  };
  const request = async (api: AwsExecApi, args: string[]): Promise<Json> => {
    const result = await api.exec('aws', [...args, '--region', base.region, '--output', 'json']);
    // Do not expose raw errors from a request carrying bootstrap material.
    if (result.exitCode) throw new Error(`AWS replacement ${args[1]} failed; reconcile before retrying`);
    const response = object(JSON.parse(result.stdout));
    if (response.NextToken || response.nextToken) throw new Error('Partial AWS replacement observation');
    return response;
  };
  const identity = async (api: AwsExecApi) => {
    const found = await request(api, ['sts', 'get-caller-identity']);
    if (found.Account !== base.accountId || !String(found.Arn).startsWith(`arn:${base.partition}:`))
      throw new Error('AWS replacement account or partition differs');
  };
  const resource = async (api: AwsExecApi, id: string, hash: string) => {
    const [found] = await observeAwsResources(api, [id], base.region, {
      deploymentName: base.deploymentName,
      planSha256s: [hash],
    });
    if (!found.exists || !found.owned || found.tags['xcsh-execution-engine'] !== 'native')
      throw new Error('AWS replacement resource ownership is unavailable or differs');
    if (found.state.NextToken || found.state.nextToken) throw new Error('Partial AWS replacement observation');
    return found;
  };
  const instance = async (api: AwsExecApi, plan: AwsSiteReplacementPlan, node: string, id: string, fresh: boolean) => {
    const found = await resource(api, id, fresh ? plan.planSha256 : base.planSha256);
    const rows = instanceRows(found.state);
    if (rows.length !== 1 || rows[0].InstanceId !== id) throw new Error('Ambiguous replacement instance observation');
    const row = rows[0];
    const index = nodeIndex(node);
    if (
      found.tags['xcsh-node-index'] !== String(index) ||
      found.tags['ves-io-site-name'] !== plan.binding.siteName ||
      row.ImageId !== base.intent.image.amiId ||
      row.InstanceType !== base.intent.instance.type ||
      object(row.Placement).AvailabilityZone !== base.intent.interfaces[0].subnets[index - 1].availabilityZone ||
      (fresh && row.ClientToken !== token(plan, node))
    )
      throw new Error('Replacement instance identity differs');
    const state = String(object(row.State).Name);
    if (!['pending', 'running', 'stopping', 'stopped', 'shutting-down', 'terminated'].includes(state))
      throw new Error('Replacement instance state is unknown');
    if (fresh && ['shutting-down', 'terminated'].includes(state))
      throw new Error('Replacement instance has been terminated');
    if (!['shutting-down', 'terminated'].includes(state)) {
      const enis = list(row.NetworkInterfaces);
      if (
        enis.length !== base.intent.interfaces.length ||
        base.intent.interfaces.some(
          (iface) =>
            !enis.some(
              (eni) =>
                eni.NetworkInterfaceId === plan.interfaceIds[`${node}/${iface.role}`] &&
                object(eni.Attachment).DeviceIndex === iface.index,
            ),
        )
      )
        throw new Error('Replacement instance ENI binding differs');
    }
    return row;
  };
  const discover = async (api: AwsExecApi, plan: AwsSiteReplacementPlan, node: string) => {
    const found = await request(api, [
      'ec2',
      'describe-instances',
      '--filters',
      `Name=client-token,Values=${token(plan, node)}`,
    ]);
    const rows = instanceRows(found);
    if (rows.length > 1) throw new Error('Replacement client token matches multiple instances');
    if (!rows.length) return undefined;
    const id = String(rows[0].InstanceId);
    if (!/^i-[a-f0-9]{8,17}$/.test(id) || rows[0].ClientToken !== token(plan, node))
      throw new Error('Replacement client token identity differs');
    await instance(api, plan, node, id, true);
    return id;
  };
  const inspect = async (plan: AwsSiteReplacementPlan, signal?: AbortSignal, expected: Record<string, string> = {}) => {
    await validate(plan);
    const api = scopedAwsApi(raw, base.intent.awsProfile, signal);
    await identity(api);
    const current: Record<string, string> = {};
    const old: Record<string, Json> = {};
    const enis: Record<string, Json> = {};
    for (const node of plan.binding.nodes) {
      const discovered = await discover(api, plan, node);
      if (expected[node] && expected[node] !== discovered) throw new Error('Replacement checkpoint instance differs');
      if (discovered) current[node] = discovered;
      old[node] = await instance(api, plan, node, String(object(plan.preparation.instances)[node]), false);
      for (const iface of base.intent.interfaces) {
        const key = `${node}/${iface.role}`;
        const found = await resource(api, plan.interfaceIds[key], base.planSha256);
        const rows = list(found.state.NetworkInterfaces);
        if (rows.length !== 1 || rows[0].NetworkInterfaceId !== plan.interfaceIds[key])
          throw new Error('Ambiguous retained ENI observation');
        const eni = rows[0];
        const evidence = list(plan.preparation.interfaces).find(
          (item) => item.node === node && item.role === iface.role,
        );
        if (
          eni.OwnerId !== base.accountId ||
          eni.MacAddress !== evidence?.mac ||
          eni.AvailabilityZone !== iface.subnets[nodeIndex(node) - 1].availabilityZone ||
          found.tags['xcsh-node-index'] !== String(nodeIndex(node)) ||
          found.tags['xcsh-interface-index'] !== String(iface.index)
        )
          throw new Error('Retained ENI identity differs');
        if (eni.Attachment) {
          const attachment = object(eni.Attachment);
          if (
            ![old[node].InstanceId, current[node]].filter(Boolean).includes(String(attachment.InstanceId)) ||
            attachment.DeviceIndex !== iface.index ||
            attachment.DeleteOnTermination !== false
          )
            throw new Error('Retained ENI attachment differs');
        }
        enis[key] = eni;
      }
      if (new Set(base.intent.interfaces.map((iface) => enis[`${node}/${iface.role}`].VpcId)).size !== 1)
        throw new Error('Retained ENIs belong to different VPCs');
      const allocation = plan.elasticIpAllocationIds[node];
      if (allocation) {
        const found = await resource(api, allocation, base.planSha256);
        const rows = list(found.state.Addresses);
        if (
          rows.length !== 1 ||
          rows[0].AllocationId !== allocation ||
          found.tags['xcsh-node-index'] !== String(nodeIndex(node)) ||
          (rows[0].AssociationId && rows[0].NetworkInterfaceId !== plan.interfaceIds[`${node}/slo`])
        )
          throw new Error('Retained EIP identity or association differs');
      }
    }
    return { api, current, old, enis };
  };
  const launchArgs = (plan: AwsSiteReplacementPlan, node: string) => {
    const index = nodeIndex(node);
    const actions = base.actions.filter((action) => action.kind === 'instance-run' && action.node === index);
    if (actions.length !== 1 || actions[0].command !== 'aws' || !actions[0].args)
      throw new Error('Exact source launch action is required');
    const substitutions: Record<string, string> = { __PLAN_SHA256__: plan.planSha256 };
    for (const iface of base.intent.interfaces)
      substitutions[`__ENI_${index}_${iface.index}__`] = plan.interfaceIds[`${node}/${iface.role}`];
    const args = actions[0].args.map((arg) => arg.replace(/__[A-Z0-9_]+__/g, (key) => substitutions[key] ?? key));
    if (
      args[0] !== 'ec2' ||
      args[1] !== 'run-instances' ||
      args.includes('--client-token') ||
      args.some(
        (arg) =>
          Array.from(arg).some((character) => character.charCodeAt(0) < 32) ||
          /__[A-Z0-9_]+__/.test(arg.replace('__BOOTSTRAP_FILE__', '')),
      )
    )
      throw new Error('Unresolved or invalid native replacement launch action');
    if (args[args.indexOf('--user-data') + 1] !== 'file://__BOOTSTRAP_FILE__')
      throw new Error('Private bootstrap file is required');
    return [...args, '--client-token', token(plan, node)];
  };
  return {
    quiescenceAdmissionVersion: 1,
    engine: 'native',
    async restoreRouting(plan, siteUid, signal) {
      await validate(plan);
      if (base.routing?.profile !== 'tgw-connect') return;
      if (!routing || !routingSource) {
        if (plan.preparation.evidenceKind === 'preboot-interface-configuration-required') return;
        throw new Error('Replacement routing runtime is unavailable');
      }
      const checkpoint = structuredClone(routingSource);
      const scoped = scopedAwsApi(raw, base.intent.awsProfile, signal);
      await configureAwsRouting(
        routing.runtime,
        base,
        checkpoint,
        scoped,
        () => storage.write(`${plan.planId}-routing-restored.json`, checkpoint),
        signal,
        { siteName: plan.binding.siteName, siteUid, contract: routing.contract, checkpoint: routingSource },
      );
      return (await collectAwsNetworkHealth('bgp', base, checkpoint, scoped, signal)).status === 'healthy';
    },
    async assertOwnership(plan, _phase, instances, signal) {
      await inspect(plan, signal, instances);
    },
    async quiesce(plan, signal, admission) {
      for (const node of plan.binding.nodes) {
        const { api, old, enis } = await inspect(plan, signal);
        const states = Object.values(old).map((row) => object(row.State).Name);
        const complete =
          states.every((state) => state === 'terminated') &&
          Object.values(enis).every((eni) => !eni.Attachment && eni.Status === 'available');
        await admission?.(
          complete
            ? 'complete'
            : states.some((state) => ['shutting-down', 'terminated'].includes(String(state)))
              ? 'partial'
              : 'intact',
        );
        const id = String(old[node].InstanceId);
        const state = object(old[node].State).Name;
        if (state !== 'terminated' && state !== 'shutting-down') {
          try {
            await request(api, ['ec2', 'terminate-instances', '--instance-ids', id]);
          } catch {
            signal?.throwIfAborted();
          }
          const observed = await instance(api, plan, node, id, false);
          if (!['terminated', 'shutting-down'].includes(String(object(observed.State).Name)))
            throw new Error('Original VM termination has not converged');
        }
        if (state !== 'terminated') {
          const result = await api.exec('aws', [
            'ec2',
            'wait',
            'instance-terminated',
            '--instance-ids',
            id,
            '--region',
            base.region,
          ]);
          if (result.exitCode) throw new Error('Original VM termination is pending');
        }
      }
      const final = await inspect(plan, signal);
      if (
        Object.values(final.old).some((row) => object(row.State).Name !== 'terminated') ||
        Object.values(final.enis).some((eni) => eni.Attachment || eni.Status !== 'available')
      )
        throw new Error('Original VMs and retained ENIs have not quiesced');
    },
    async launch(plan, bootstrap, signal) {
      await validate(plan);
      const launched: Record<string, string> = {};
      for (const node of plan.binding.nodes) {
        const args = launchArgs(plan, node);
        if (typeof bootstrap[node] !== 'string' || !bootstrap[node].startsWith('#cloud-config\n'))
          throw new Error('Verified replacement bootstrap is required');
        const requestSha256 = canonicalSha256({ args, bootstrap: bootstrap[node] });
        const name = `${plan.planId}-${nodeIndex(node)}-launch.json`;
        let record: Json | undefined;
        try {
          record = object(await storage.read(name));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
        if (
          record &&
          (record.schemaVersion !== 1 ||
            record.planSha256 !== plan.planSha256 ||
            record.requestSha256 !== requestSha256 ||
            record.clientToken !== token(plan, node))
        )
          throw new Error('Durable replacement launch request differs');
        let observed = await inspect(plan, signal);
        if (Object.values(observed.old).some((row) => object(row.State).Name !== 'terminated'))
          throw new Error('Original VMs must terminate before replacement launch');
        let id: string | undefined = observed.current[node];
        if (record?.instanceId && record.instanceId !== id)
          throw new Error('Durable replacement launch identity is unavailable or differs');
        if (!id) {
          if (record) throw new Error('Prior replacement launch outcome is unknown; observation is required');
          if (
            base.intent.interfaces.some(
              (iface) =>
                observed.enis[`${node}/${iface.role}`].Attachment ||
                observed.enis[`${node}/${iface.role}`].Status !== 'available',
            )
          )
            throw new Error('Retained ENIs are not available for launch');
          record = {
            schemaVersion: 1,
            planSha256: plan.planSha256,
            requestSha256,
            clientToken: token(plan, node),
            observedAt: new Date().toISOString(),
          };
          await storage.write(name, record);
          const directory = await mkdtemp(join(storage.directory, 'replacement-bootstrap-'));
          try {
            const path = join(directory, 'cloud-init');
            await writeFile(path, bootstrap[node], { mode: 0o600, flag: 'wx' });
            try {
              const result = await observed.api.exec(
                'aws',
                args.map((arg) => arg.replace('__BOOTSTRAP_FILE__', path)),
              );
              if (!result.exitCode) {
                const rows = list(object(JSON.parse(result.stdout)).Instances);
                if (rows.length === 1 && /^i-[a-f0-9]{8,17}$/.test(String(rows[0].InstanceId))) {
                  record.instanceId = rows[0].InstanceId;
                  await storage.write(name, record);
                }
              }
            } catch {
              signal?.throwIfAborted();
            }
          } finally {
            await rm(directory, { recursive: true, force: true });
          }
          id = await discover(observed.api, plan, node);
          if (!id) throw new Error('Replacement launch outcome is unknown; reconcile the client token');
          if (record.instanceId && record.instanceId !== id)
            throw new Error('Replacement launch response differs from observation');
        }
        await storage.write(name, {
          ...record,
          schemaVersion: 1,
          planSha256: plan.planSha256,
          requestSha256,
          clientToken: token(plan, node),
          instanceId: id,
        });
        for (const iface of base.intent.interfaces) {
          observed = await inspect(plan, signal, { [node]: id });
          const key = `${node}/${iface.role}`;
          if (observed.enis[key].SourceDestCheck !== false) {
            const result = await observed.api.exec('aws', [
              'ec2',
              'modify-network-interface-attribute',
              '--network-interface-id',
              plan.interfaceIds[key],
              '--source-dest-check',
              'Value=false',
              '--region',
              base.region,
            ]);
            if (result.exitCode) throw new Error('Replacement source/destination check update failed');
          }
        }
        if (plan.elasticIpAllocationIds[node]) {
          observed = await inspect(plan, signal, { [node]: id });
          await associateAwsCeEip(
            observed.api,
            base,
            [
              'ec2',
              'associate-address',
              '--allocation-id',
              plan.elasticIpAllocationIds[node],
              '--network-interface-id',
              plan.interfaceIds[`${node}/slo`],
              '--region',
              base.region,
              '--output',
              'json',
            ],
            signal,
          );
        }
        const final = await inspect(plan, signal, { [node]: id });
        if (base.intent.interfaces.some((iface) => final.enis[`${node}/${iface.role}`].SourceDestCheck !== false))
          throw new Error('Replacement source/destination checks have not converged');
        launched[node] = id;
      }
      return launched;
    },
  };
}
