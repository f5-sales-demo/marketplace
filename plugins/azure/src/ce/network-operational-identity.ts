import { isIP } from 'node:net';
import { requireQualifiedUpInterfaceEvidence } from '../../../platform/src/ce/interface-admission';
import type { ExpectedCeInterface, ObservedCeInterface } from '../../../platform/src/ce/interface-evidence';
import type { CeRuntime } from '../../../platform/src/ce/runtime';
import type { AzExecApi } from '../az/exec';
import { verifyAzureCePlan } from './artifacts';
import { canonicalEqual, canonicalSha256 } from './canonical';
import { captureAzureNetworkUpdateInventory, validateAzureNetworkUpdateInventory } from './network-update';
import type { AzureTerraformNetworkAcceptanceIdentity } from './terraform-network-checkpoint';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

type Runtime = Pick<
  CeRuntime,
  'engine' | 'observeOwnedSite' | 'ownedSiteConfiguration' | 'observeRegistrations' | 'observeAzureInterfaces'
>;
type Json = Record<string, unknown>;
const same = canonicalEqual;
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure network operational identity: ${message}`);
}
function object(value: unknown): Json {
  require(value && typeof value === 'object' && !Array.isArray(value), 'malformed evidence');
  return value as Json;
}
const sha = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);

/** Read-only cloud/configuration/registration/physical-interface joins for the serial observer.
 * This component preserves explicit interface state. Registration and observed link publication
 * alone do not establish per-node operational health, original sample freshness, routing or traffic.
 */
export async function collectAzureNetworkOperationalIdentity(
  source: AzureCePlan,
  expected: AzureTerraformNetworkAcceptanceIdentity,
  runtime: Runtime,
  api: AzExecApi,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const plan = structuredClone(source),
    identity = structuredClone(expected);
  verifyAzureCePlan(plan);
  validateAzureNetworkUpdateInventory(plan, identity.inventory);
  const binding = azureUpgradeBinding(plan);
  require(plan.engine === 'terraform' &&
    plan.intent.operation === 'update-network' &&
    runtime.engine === plan.engine &&
    same(identity.owner, binding.owner) &&
    identity.planSha256 === plan.planSha256 &&
    identity.siteName === plan.siteName &&
    typeof identity.siteUid === 'string' &&
    identity.siteUid.trim() &&
    Number.isInteger(identity.node) &&
    identity.node >= 1 &&
    identity.node <= plan.topology.nodeCount &&
    sha(identity.configurationSha256) &&
    sha(identity.siteConfigurationSha256), 'owning resolved node/site identity required');
  const instances: Record<string, string> = {},
    interfaces: ExpectedCeInterface[] = [];
  for (const [node, vm] of Object.entries(identity.inventory.nodes)) {
    const name = `${plan.deploymentName}-${node}`;
    instances[name] = vm.vmId;
    for (const [index, nic] of Object.entries(vm.nics)) {
      const role = plan.nics.find((n) => n.index === Number(index))?.role;
      require(role === 'slo' || role === 'data' || role === 'sli', 'complete configured interface role scope required');
      interfaces.push({ node: name, role, mac: nic.mac });
    }
  }
  const base = {
    schemaVersion: 1,
    scope: 'node-registration-interface-identity' as const,
    owner: identity.owner,
    planSha256: identity.planSha256,
    node: identity.node,
    siteName: identity.siteName,
    siteUid: identity.siteUid,
    siteConfigurationSha256: identity.siteConfigurationSha256,
    configurationSha256: identity.configurationSha256,
    expectedInventorySha256: canonicalSha256(identity.inventory.nodes),
    collectedAt: new Date().toISOString(),
    operationalAcceptance: 'unknown' as const,
    nodeHealth: 'unknown' as const,
    freshness: 'unqualified' as const,
    routing: 'unknown' as const,
    traffic: 'unknown' as const,
  };
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
  let phase = 'cloud-identity';
  try {
    const cloud = async () => {
      const inventory = await bounded(() => captureAzureNetworkUpdateInventory(plan, api, deadline));
      require(same(inventory.nodes, identity.inventory.nodes), 'current cloud identity differs');
      return canonicalSha256(inventory.nodes);
    };
    const site = async () => {
      const value = object(await bounded(() => runtime.observeOwnedSite(binding, deadline)));
      const metadata = object(value.metadata),
        system = object(value.system_metadata);
      require(metadata.name === plan.siteName &&
        metadata.namespace === 'system' &&
        system.uid === identity.siteUid &&
        canonicalSha256(runtime.ownedSiteConfiguration(binding, value)) ===
          identity.siteConfigurationSha256, 'current owned site differs');
      return {
        siteUid: system.uid,
        siteConfigurationSha256: canonicalSha256(runtime.ownedSiteConfiguration(binding, value)),
      };
    };
    const links = async () => {
      const value = await bounded(() => runtime.observeAzureInterfaces(binding, structuredClone(interfaces), deadline));
      require(['observed', 'down', 'unknown'].includes(value.status) &&
        Array.isArray(value.interfaces), 'malformed interface observation');
      if (value.status === 'unknown')
        return {
          status: 'unknown' as const,
          interfaces: [] as ObservedCeInterface[],
          freshness: 'unqualified' as const,
          canSatisfyInterfaceMutationGate: false,
        };
      require(value.interfaces.length === interfaces.length, 'partial interface observation');
      const devices = new Set<string>(),
        objects = new Set<string>();
      for (const wanted of interfaces) {
        const rows = value.interfaces.filter(
          (row) => row.node === wanted.node && row.role === wanted.role && row.mac === wanted.mac,
        );
        require(rows.length === 1, 'foreign or duplicate interface observation');
        const row = rows[0];
        require(typeof row.device === 'string' &&
          /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(row.device) &&
          typeof row.interfaceName === 'string' &&
          /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(row.interfaceName) &&
          typeof row.linkUp === 'boolean' &&
          Number.isInteger(row.mtu) &&
          (row.mtu === 0 || (row.mtu >= 576 && row.mtu <= 8000)) &&
          !devices.has(`${row.node}/${row.device}`) &&
          !objects.has(row.interfaceName), 'incomplete or duplicate device/object identity');
        require(row.ipv4 === null ||
          (row.ipv4 &&
            isIP(row.ipv4.address) === 4 &&
            Number.isInteger(row.ipv4.prefixLength) &&
            row.ipv4.prefixLength >= 0 &&
            row.ipv4.prefixLength <= 32), 'malformed interface IPv4 observation');
        devices.add(`${row.node}/${row.device}`);
        objects.add(row.interfaceName);
      }
      require(value.status ===
        (value.interfaces.every((row) => row.linkUp)
          ? 'observed'
          : 'down'), 'interface state disagrees with explicit links');
      let canSatisfyInterfaceMutationGate = false;
      try {
        requireQualifiedUpInterfaceEvidence(value, interfaces);
        canSatisfyInterfaceMutationGate = true;
      } catch {
        // Readable interface state alone cannot authorize a mutation or an active probe.
      }
      return {
        status: value.status,
        freshness: value.freshness === 'verified' ? ('verified' as const) : ('unqualified' as const),
        canSatisfyInterfaceMutationGate,
        interfaces: interfaces.map((wanted) => {
          const row = value.interfaces.find(
            (v) => v.node === wanted.node && v.role === wanted.role,
          ) as ObservedCeInterface;
          return {
            ...wanted,
            device: row.device,
            interfaceName: row.interfaceName,
            mtu: row.mtu,
            linkUp: row.linkUp,
            ipv4: row.ipv4 === null ? null : { address: row.ipv4.address, prefixLength: row.ipv4.prefixLength },
          };
        }),
      };
    };
    const registrations = async () => {
      const value = object(await bounded(() => runtime.observeRegistrations(binding, { ...instances }, deadline)));
      if (value.status !== 'healthy') return { status: 'unknown' as const, nodes: [] };
      require(same(value.owner, binding.owner) &&
        value.siteName === binding.siteName &&
        Array.isArray(value.nodes) &&
        value.nodes.length === binding.nodes.length, 'registration owner or cardinality differs');
      for (const node of binding.nodes) {
        const rows = (value.nodes as unknown[]).map(object).filter((row) => row.node === node);
        require(rows.length === 1 &&
          rows[0].instanceId === instances[node] &&
          rows[0].state === 'ONLINE' &&
          rows[0].status === 'healthy' &&
          typeof rows[0].registration === 'string' &&
          rows[0].registration.trim(), 'registration UUID/node/state differs');
      }
      return {
        status: 'observed' as const,
        nodes: (value.nodes as unknown[]).map((raw) => {
          const row = object(raw);
          return { node: row.node, instanceId: row.instanceId, state: row.state, registration: row.registration };
        }),
      };
    };
    const cloudSha256 = await cloud();
    phase = 'site-identity';
    const initialSite = await site();
    phase = 'registrations';
    const registered = await registrations();
    phase = 'interfaces';
    const initialLinks = await links();
    phase = 'final-registrations';
    const finalRegistrations = await registrations();
    phase = 'final-interfaces';
    const finalLinks = await links();
    require(same(registered, finalRegistrations) &&
      same(initialLinks, finalLinks), 'CE identities or state changed during observation');
    phase = 'final-site-identity';
    require(same(initialSite, await site()), 'site identity changed during observation');
    phase = 'final-cloud-identity';
    require(cloudSha256 === (await cloud()), 'cloud identity changed during observation');
    deadline.throwIfAborted();
    return {
      ...base,
      status: registered.status === 'observed' ? finalLinks.status : ('unknown' as const),
      interfaceState: finalLinks.status,
      freshness: finalLinks.freshness,
      canSatisfyInterfaceMutationGate: registered.status === 'observed' && finalLinks.canSatisfyInterfaceMutationGate,
      cloudEvidenceSha256: cloudSha256,
      registrations: registered,
      interfaces: finalLinks.interfaces,
      reason:
        registered.status !== 'observed'
          ? 'registrations-unverified'
          : finalLinks.status === 'unknown'
            ? 'interfaces-unverified'
            : finalLinks.freshness === 'verified'
              ? 'node-health-routing-and-traffic-unqualified'
              : 'operational-health-and-publication-freshness-unqualified',
    };
  } catch {
    deadline.throwIfAborted();
    return {
      ...base,
      status: 'unknown' as const,
      interfaceState: 'unknown' as const,
      canSatisfyInterfaceMutationGate: false,
      interfaces: [] as ObservedCeInterface[],
      reason: `${phase}-unverified`,
    };
  }
}
