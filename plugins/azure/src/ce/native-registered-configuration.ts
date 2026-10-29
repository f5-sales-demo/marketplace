import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { canonicalSha256 } from './canonical';
import type { AzureNetworkUpdateInventory } from './network-update';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const require = (condition: unknown, message: string): void => {
  if (!condition) throw Error(`Azure native registered configuration: ${message}`);
};
const object = (value: unknown): Record<string, unknown> => {
  require(value && typeof value === 'object' && !Array.isArray(value), 'malformed provenance record');
  return value as Record<string, unknown>;
};
const same = (a: unknown, b: unknown) => canonicalSha256(a) === canonicalSha256(b);
const lower = (value: unknown) => (typeof value === 'string' ? value.toLowerCase() : '');

/** Historical final public health evidence binds birth/generation UUIDs and registered MAC/device identities.
 * Collection metadata here never establishes CE heartbeat or operational link freshness.
 */
export async function readAzureNativeFinalConfiguration(
  source: AzureCePlan,
  inventory: AzureNetworkUpdateInventory,
  store: Pick<CeDeploymentStore, 'read'>,
) {
  const action = source.actions.filter((row) => row.kind === 'health-gate').at(-1);
  require(action &&
    (source.intent.operation === 'replace-node' ||
      action.node === source.topology.nodeCount), 'complete final health action is unavailable');
  const row = object(await store.read(`native-action-${source.planSha256}-${action?.id}.json`));
  const binding = azureUpgradeBinding(source);
  require(row.schemaVersion === 1 &&
    row.engine === 'native' &&
    same(row.owner, binding.owner) &&
    row.sourcePlanSha256 === source.planSha256 &&
    row.actionId === action?.id &&
    row.actionSha256 === canonicalSha256(action), 'final public health envelope differs');
  const evidence = object(row.evidence),
    configuration = object(evidence.configuration),
    registrations = object(evidence.registrations);
  require(evidence.planId === source.planId &&
    evidence.planSha256 === source.planSha256 &&
    evidence.engine === 'native' &&
    evidence.subscriptionId === source.subscription.id &&
    evidence.siteName === source.siteName &&
    evidence.status === 'healthy' &&
    object(evidence.health).status === 'healthy' &&
    evidence.scope === 'site-global-and-registration-only' &&
    configuration.status === 'configured' &&
    registrations.status === 'healthy' &&
    same(configuration.owner, binding.owner) &&
    same(registrations.owner, binding.owner) &&
    configuration.siteName === source.siteName &&
    registrations.siteName === source.siteName &&
    typeof evidence.siteUid === 'string' &&
    Boolean(evidence.siteUid.trim()) &&
    configuration.siteUid === evidence.siteUid &&
    typeof configuration.contractFingerprint === 'string' &&
    /^sha256:[a-f0-9]{64}$/.test(configuration.contractFingerprint) &&
    registrations.contractFingerprint === configuration.contractFingerprint &&
    evidence.siteConfigurationSha256 ===
      canonicalSha256(
        object(evidence.siteConfiguration),
      ), 'original registered configuration or logical-site binding differs');
  require(Array.isArray(registrations.nodes) &&
    registrations.nodes.length === binding.nodes.length &&
    Array.isArray(configuration.interfaces) &&
    configuration.interfaces.length ===
      binding.nodes.length * source.nics.length, 'complete historical node/interface joins required');
  const instances: Record<string, string> = {},
    used = new Set<string>(),
    devices = new Set<string>();
  for (const [index, node] of binding.nodes.entries()) {
    const rows = (registrations.nodes as unknown[]).map(object).filter((row) => row.node === node);
    require(rows.length === 1 &&
      rows[0].status === 'healthy' &&
      rows[0].state === 'ONLINE' &&
      typeof rows[0].registration === 'string' &&
      /^r-[a-z0-9-]+$/.test(rows[0].registration) &&
      typeof rows[0].instanceId === 'string' &&
      /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(rows[0].instanceId) &&
      !used.has(lower(rows[0].instanceId)), 'historical registration UUID is missing or duplicate');
    instances[node] = String(rows[0].instanceId);
    used.add(lower(rows[0].instanceId));
    for (const nic of source.nics) {
      const expected = inventory.nodes[String(index + 1)].nics[String(nic.index)];
      const matches = (configuration.interfaces as unknown[])
        .map(object)
        .filter((iface) => iface.node === node && iface.role === nic.role && lower(iface.mac) === expected.mac);
      require(matches.length === 1 &&
        typeof matches[0].device === 'string' &&
        /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/.test(matches[0].device) &&
        !devices.has(`${node}:${matches[0].device}`), 'original MAC/role/device join differs');
      devices.add(`${node}:${matches[0].device}`);
    }
  }
  return {
    instances,
    receiptSha256: canonicalSha256(row),
    siteUid: evidence.siteUid as string,
    siteConfigurationSha256: evidence.siteConfigurationSha256 as string,
    contractFingerprint: configuration.contractFingerprint as string,
  };
}
