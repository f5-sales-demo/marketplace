import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { requireQualifiedUpInterfaceEvidence } from '../../../platform/src/ce/interface-admission';
import type { ExpectedCeInterface, ObservedCeInterface } from '../../../platform/src/ce/interface-evidence';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { AzExecApi } from '../az/exec';
import { canonicalSha256 } from './canonical';
import { verifyAzureRelayHistoricalArtifacts } from './relay-artifact-provenance';
import { azureRelayPlanForDeployment } from './relay-deployment-plan';
import { azureRelayResourceSource } from './relay-replacement-plan';
import { observeAzureRelayRouteServerIdentity } from './relay-route-server';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

type Json = Record<string, unknown>;
const require = (condition: unknown, message: string): void => {
  if (!condition) throw Error(`Azure relay workflow: ${message}`);
};
const object = (value: unknown): Json => {
  require(value && typeof value === 'object' && !Array.isArray(value), 'malformed current identity');
  return value as Json;
};
const sameId = (value: unknown, expected: string) =>
  typeof value === 'string' && value.toLowerCase() === expected.toLowerCase();
const mac = (value: unknown) => {
  const normalized = typeof value === 'string' ? value.toLowerCase().replaceAll('-', ':') : '';
  require(/^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(normalized) &&
    (Number.parseInt(normalized.slice(0, 2), 16) & 1) === 0 &&
    normalized !== '00:00:00:00:00:00', 'distinct unicast MAC required');
  return normalized;
};

/** Current cloud joins and verified up CE evidence; outage scope retains historical stopped-node identity explicitly. */
export async function azureRelayCurrentIdentityContext(
  source: AzureCePlan,
  expected: ExpectedCeInterface[],
  runtime: Pick<CeRuntime, 'engine' | 'observeOwnedSite' | 'observeAzureInterfaces'> &
    Partial<Pick<CeRuntime, 'observeAzureInterfacesForNodes'>>,
  storage: Pick<CeDeploymentStore, 'owner' | 'verify'>,
  api: AzExecApi,
  signal?: AbortSignal,
  outage?: { nodeIndex: number; baselineRecords: Map<string, unknown> },
) {
  source = structuredClone(source);
  expected = structuredClone(expected);
  const plan = azureRelayPlanForDeployment(source);
  const resourceSource = azureRelayResourceSource(source);
  const retainedOwners = new Map(
    source.relayProfile?.schemaVersion === 2
      ? source.relayProfile.retainedResourceOwners.map((row) => [row.resourceId.toLowerCase(), row.ownerPlanSha256])
      : [],
  );
  const selectedVm =
    source.relayProfile?.schemaVersion === 2
      ? source.actions.find((action) => action.kind === 'vm-create' && action.node === source.intent.replacementNode)
          ?.resourceId
      : undefined;
  require(runtime.engine === source.engine, 'runtime engine differs');
  await storage.verify();
  const binding = azureUpgradeBinding(source);
  require(canonicalSha256(storage.owner) === canonicalSha256(binding.owner), 'storage owner differs');
  signal?.throwIfAborted();
  let baseline: { siteUid: string; bindingSha256: string; identity: { stable: { cloud: Json[] } } } | undefined;
  if (outage) {
    require(Object.keys(outage).sort().join(',') === 'baselineRecords,nodeIndex' &&
      source.topology.ha &&
      source.topology.nodeCount === 3 &&
      source.nics.length === 2 &&
      Number.isInteger(outage.nodeIndex) &&
      outage.nodeIndex >= 1 &&
      outage.nodeIndex <= 3 &&
      outage.baselineRecords instanceof Map &&
      runtime.observeAzureInterfacesForNodes, 'outage requires one exact HA node and read-only surviving interface observer');
    outage = structuredClone(outage);
    require(outage.baselineRecords.has(
      'relay-routing-configuration.json',
    ), 'completed baseline configuration required');
    const journal = object(outage.baselineRecords.get('relay-routing-workflow.json'));
    verifyAzureRelayHistoricalArtifacts(source, String(journal.siteUid), outage.baselineRecords);
    baseline = journal as unknown as NonNullable<typeof baseline>;
  }
  const deadline = AbortSignal.any([AbortSignal.timeout(180000), ...(signal ? [signal] : [])]);
  const bounded = async <T>(task: () => Promise<T>): Promise<T> => {
    deadline.throwIfAborted();
    const abort = Promise.withResolvers<never>();
    const onAbort = () => abort.reject(deadline.reason);
    deadline.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await Promise.race([task(), abort.promise]);
      deadline.throwIfAborted();
      return result;
    } finally {
      deadline.removeEventListener('abort', onAbort);
    }
  };
  const read = async (args: string[], id: string, details = false) => {
    const raw = await bounded(() =>
      api.exec(
        'az',
        [
          ...args,
          'show',
          '--ids',
          id,
          ...(details ? ['--show-details'] : []),
          '--subscription',
          source.subscription.id,
          '--output',
          'json',
        ],
        {
          signal: deadline,
        },
      ),
    );
    require(raw.exitCode === 0, 'cloud identity read unavailable');
    const value = object(JSON.parse(raw.stdout));
    require(sameId(value.id, id) &&
      value.provisioningState === 'Succeeded' &&
      value.location === source.region &&
      !['nextLink', 'nextPageToken', 'errors', 'error'].some(
        (key) => value[key],
      ), 'incomplete or foreign cloud identity');
    const tags = object(value.tags);
    for (const [key, wanted] of Object.entries({
      'xcsh-managed-by': 'azure-ce',
      'xcsh-execution-engine': source.engine,
      'xcsh-deployment-id': source.deploymentName,
      'xcsh-plan-sha256':
        id.toLowerCase() === selectedVm?.toLowerCase()
          ? source.planSha256
          : (retainedOwners.get(id.toLowerCase()) ?? resourceSource.planSha256),
    }))
      require(tags[key] === wanted, 'CE cloud owner differs');
    return value;
  };
  const observe = async () => {
    await storage.verify();
    if (outage) {
      const raw = await bounded(() =>
        api.exec('az', ['account', 'show', '--subscription', source.subscription.id, '--output', 'json'], {
          signal: deadline,
        }),
      );
      require(raw.exitCode === 0, 'outage account read unavailable');
      const account = object(JSON.parse(raw.stdout));
      require(sameId(account.id, source.subscription.id) &&
        sameId(account.tenantId, source.subscription.tenantId) &&
        account.environmentName === source.subscription.cloud &&
        account.state === 'Enabled' &&
        !['nextLink', 'errors', 'error'].some((key) => account[key]), 'outage account identity differs');
    }
    const site = await bounded(() => runtime.observeOwnedSite(binding, deadline));
    const siteUid = object(site.system_metadata).uid;
    require(typeof siteUid === 'string' && siteUid.trim(), 'logical site UID unavailable');
    require(expected.length === binding.nodes.length * source.nics.length &&
      new Set(expected.map((row) => `${row.node}/${row.role}`)).size === expected.length &&
      expected.every(
        (row) => binding.nodes.includes(row.node) && source.nics.some((nic) => nic.role === row.role),
      ), 'complete expected CE interface scope required');
    if (baseline) require(siteUid === baseline.siteUid, 'outage logical site differs from baseline');
    const selectedNode = outage ? binding.nodes[outage.nodeIndex - 1] : undefined;
    const currentExpected = expected.filter((row) => row.node !== selectedNode);
    const platform = await bounded(() => {
      if (!outage) return runtime.observeAzureInterfaces(binding, expected, deadline);
      if (!runtime.observeAzureInterfacesForNodes) throw Error('Azure relay workflow: surviving observer unavailable');
      return runtime.observeAzureInterfacesForNodes(
        binding,
        expected,
        binding.nodes.filter((node) => node !== selectedNode),
        deadline,
      );
    });
    require(platform.status === 'observed' &&
      platform.interfaces.length === currentExpected.length &&
      platform.interfaces.every(
        (row) =>
          row.linkUp === true && currentExpected.some((wanted) => wanted.node === row.node && wanted.role === row.role),
      ), 'complete verified up CE evidence required');
    requireQualifiedUpInterfaceEvidence(platform, currentExpected);
    const cloud = [];
    const slo: ObservedCeInterface[] = [];
    const endpoints: Array<{ node: number; address: string }> = [];
    const usedMacs = new Set<string>();
    const usedVms = new Set<string>();
    for (let node = 1; node <= source.topology.nodeCount; node++) {
      const nodeName = `${source.deploymentName}-${node}`;
      const vms = resourceSource.actions.filter((action) => action.kind === 'vm-create' && action.node === node);
      require(vms.length === 1 && vms[0].resourceId, 'one saved CE VM required');
      const vmId = vms[0].resourceId as string;
      const stopped = nodeName === selectedNode;
      const vm = await read(['vm'], vmId, stopped);
      if (stopped) require(vm.powerState === 'VM deallocated', 'selected VM must explicitly be deallocated');
      require(typeof vm.vmId === 'string' &&
        /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(vm.vmId) &&
        !usedVms.has(vm.vmId.toLowerCase()), 'distinct CE VM UUID required');
      usedVms.add((vm.vmId as string).toLowerCase());
      const references = object(vm.networkProfile).networkInterfaces;
      require(Array.isArray(references) &&
        references.length === source.nics.length, 'complete CE VM NIC references required');
      for (const selected of source.nics) {
        const actions = resourceSource.actions.filter(
          (action) =>
            action.kind === 'nic-create' &&
            action.node === node &&
            action.resourceId?.endsWith(`-nic${selected.index}`),
        );
        require(actions.length === 1 && actions[0].resourceId, 'one saved CE NIC required');
        const nicId = actions[0].resourceId as string;
        require((references as unknown[]).filter((ref) => sameId(object(ref).id, nicId)).length ===
          1, 'CE VM NIC join differs');
        const nic = await read(['network', 'nic'], nicId);
        require(sameId(object(nic.virtualMachine).id, vmId), 'CE NIC VM attachment differs');
        const normalized = mac(nic.macAddress);
        require(!usedMacs.has(normalized), 'CE MAC duplicated');
        usedMacs.add(normalized);
        const requested = expected.filter((row) => row.node === nodeName && row.role === selected.role);
        const observed: Array<
          Pick<ObservedCeInterface, 'node' | 'role' | 'mac' | 'device' | 'interfaceName' | 'ipv4'>
        > = stopped
          ? ((baseline?.identity.stable.cloud ?? []).filter(
              (row) => row.node === nodeName && row.role === selected.role,
            ) as unknown as Array<
              Pick<ObservedCeInterface, 'node' | 'role' | 'mac' | 'device' | 'interfaceName' | 'ipv4'>
            >)
          : platform.interfaces.filter((row) => row.node === nodeName && row.role === selected.role);
        require(requested.length === 1 &&
          observed.length === 1 &&
          mac(requested[0].mac) === normalized &&
          mac(observed[0].mac) === normalized &&
          /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(observed[0].device) &&
          /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(
            observed[0].interfaceName,
          ), 'authoritative CE/cloud MAC/device join differs');
        const configs = nic.ipConfigurations;
        require(Array.isArray(configs) && configs.length === 1, 'one complete CE NIC IP configuration required');
        const config = object((configs as unknown[])[0]);
        require(typeof config.name === 'string' &&
          /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(config.name) &&
          sameId(config.id, `${nicId}/ipConfigurations/${config.name}`), 'CE IP configuration identity differs');
        const subnets = resourceSource.actions.filter(
          (action) =>
            action.kind === 'subnet-create' &&
            action.args?.[action.args.indexOf('--name') + 1] === selected.subnet.name,
        );
        require(subnets.length === 1 &&
          subnets[0].resourceId &&
          sameId(object(config.subnet).id, subnets[0].resourceId), 'CE subnet join differs');
        if (selected.role === 'slo') {
          const ip = observed[0].ipv4;
          require(config.privateIPAddressVersion === 'IPv4' &&
            (config.primary === true || config.primary === undefined) &&
            ip &&
            ip.address === config.privateIPAddress &&
            ip.prefixLength === Number(plan.sloCidr.split('/')[1]), 'authoritative CE/cloud SLO IP differs');
          if (!stopped) slo.push(observed[0] as ObservedCeInterface);
          endpoints.push({ node, address: ip?.address as string });
        }
        cloud.push({
          node: nodeName,
          role: selected.role,
          vmId,
          vmUuid: vm.vmId,
          nicId,
          ipConfigurationId: config.id,
          mac: normalized,
          subnetId: subnets[0].resourceId,
          device: observed[0].device,
          interfaceName: observed[0].interfaceName,
          ipv4: observed[0].ipv4,
        });
      }
    }
    const server = await observeAzureRelayRouteServerIdentity(source, plan, api, deadline);
    const finalSite = await bounded(() => runtime.observeOwnedSite(binding, deadline));
    require(object(finalSite.system_metadata).uid === siteUid, 'logical site changed during identity collection');
    const stable = {
      siteUid,
      cloud,
      relays: server.relays,
      serviceAddresses: server.serviceAddresses,
      peers: server.peers,
    };
    if (baseline) {
      require(canonicalSha256(stable) ===
        baseline.bindingSha256, 'outage current cloud/CE binding differs from baseline');
      const selected = cloud.find((row) => row.node === selectedNode);
      if (!selected) throw Error('Azure relay workflow: selected cloud identity unavailable');
      const finalVm = await read(['vm'], selected.vmId, true);
      require(finalVm.powerState === 'VM deallocated' &&
        sameId(
          finalVm.vmId,
          selected.vmUuid as string,
        ), 'selected VM must remain identity-bound and deallocated during collection');
    }
    deadline.throwIfAborted();
    return {
      ...(outage
        ? {
            outage: {
              nodeIndex: outage.nodeIndex,
              powerState: 'deallocated' as const,
              currentInterfaces: platform.interfaces.length,
              retainedInterfaceIdentity: 'historical' as const,
              ceSampleFreshnessQualified: false as const,
            },
          }
        : {}),
      siteUid: siteUid as string,
      server,
      slo,
      endpoints,
      bindingSha256: canonicalSha256(stable),
      identity: { stable, server, slo, endpoints },
    };
  };
  return { source, expected, plan, binding, deadline, bounded, observe };
}
