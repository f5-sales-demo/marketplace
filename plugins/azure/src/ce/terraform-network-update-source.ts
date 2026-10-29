import { createHash } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { type AzureNetworkUpdateInventory, validateAzureNetworkUpdateInventory } from './network-update';
import { validAzureRetainedNicsForSource } from './relay-replacement-identity';
import { azureTerraformCurrentDeployment, renderAzureTerraformFoundation } from './terraform-foundation';
import { verifyAzureTerraformNetworkProfile } from './terraform-network-plan';
import {
  type ReplacementCheckpoint,
  validateAzureTerraformReplacementCheckpoint,
  validateAzureTerraformReplacementStageHistory,
} from './terraform-replacement';
import { verifyAzureTerraformNonRelayConfiguration } from './terraform-replacement-artifact-provenance';
import { verifyAzureTerraformReplacementGenerationOwners } from './terraform-replacement-generations';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const same = (a: unknown, b: unknown) => canonicalSha256(a) === canonicalSha256(b);
const lower = (value: unknown) => (typeof value === 'string' ? value.toLowerCase() : '');
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure Terraform network source: ${message}`);
}
const object = (value: unknown): Record<string, unknown> => {
  require(value && typeof value === 'object' && !Array.isArray(value), 'malformed record');
  return value as Record<string, unknown>;
};
const keys = (value: unknown, expected: string[]) => same(Object.keys(object(value)).sort(), expected.toSorted());
const scope = (plan: AzureCePlan, allowSubnet: boolean) => {
  const { operation: _operation, replacementNode: _node, nics, ...intent } = plan.intent;
  const { termsAccepted: _terms, ...image } = plan.image;
  const nic = (value: Record<string, unknown>) => {
    const { subnet: _subnet, ...rest } = value;
    return allowSubnet ? rest : value;
  };
  return {
    intent: { ...intent, nics: nics.map((n) => nic(n as unknown as Record<string, unknown>)) },
    image,
    subscription: plan.subscription,
    topology: plan.topology,
    nics: plan.nics.map((n) => nic(n as unknown as Record<string, unknown>)),
    vm: plan.vm,
    routing: plan.routing,
    egress: plan.egress,
    workloadProfile: plan.workloadProfile ?? null,
  };
};

/** Join resolved owning Terraform outputs to independently captured cloud UUID/NIC identities.
 * Output values are locators, never CE link health or publication freshness.
 */
export function verifyAzureTerraformNetworkUpdateState(
  plan: AzureCePlan,
  inventory: AzureNetworkUpdateInventory,
  outputs: Record<string, unknown>,
): void {
  validateAzureNetworkUpdateInventory(plan, inventory);
  verifyAzureTerraformNetworkPhysicalState(plan, inventory, outputs);
}

/** Private output/physical-vector join. Callers authenticate the owning generation and full
 * inventory separately. This helper does not grant network mutation or operational acceptance. */
export function verifyAzureTerraformNetworkPhysicalState(
  plan: AzureCePlan,
  inventory: AzureNetworkUpdateInventory,
  outputs: Record<string, unknown>,
): void {
  verifyAzureCePlan(plan);
  require(plan.engine === 'terraform' &&
    keys(inventory, ['schemaVersion', 'engine', 'planSha256', 'collectedAt', 'nodes']) &&
    inventory.schemaVersion === 1 &&
    inventory.engine === 'terraform' &&
    inventory.planSha256 === plan.planSha256 &&
    typeof inventory.collectedAt === 'string' &&
    Number.isFinite(Date.parse(inventory.collectedAt)) &&
    Date.parse(inventory.collectedAt) <= Date.now() + 60000, 'owning Terraform inventory schema required');
  const nodes = Object.keys(inventory.nodes),
    instances = object(outputs.ce_instances),
    interfaces = object(outputs.ce_interfaces);
  require(keys(instances, nodes) &&
    keys(
      interfaces,
      nodes.flatMap((n) => Object.keys(inventory.nodes[n].nics).map((i) => `${n}:${i}`)),
    ), 'complete exact Terraform output inventory required');
  for (const [node, vm] of Object.entries(inventory.nodes)) {
    const instance = object(instances[node]);
    require(keys(instance, ['id', 'vm_id', 'site_name', 'hostname']) &&
      lower(instance.id) === lower(vm.resourceId) &&
      lower(instance.vm_id) === lower(vm.vmId) &&
      instance.site_name === plan.siteName &&
      instance.hostname === `${plan.deploymentName}-${node}`, 'Terraform VM UUID, resource or site differs');
    for (const [index, nic] of Object.entries(vm.nics)) {
      const row = object(interfaces[`${node}:${index}`]);
      require(keys(row, ['id', 'node', 'index', 'role', 'site_name', 'subnet_id']) &&
        lower(row.id) === lower(nic.resourceId) &&
        row.node === Number(node) &&
        row.index === Number(index) &&
        row.role === plan.nics.find((n) => n.index === Number(index))?.role &&
        row.site_name === plan.siteName &&
        lower(row.subnet_id) === lower(nic.subnetId), 'Terraform NIC resource, node, role or subnet differs');
    }
  }
}

/** First network-update source qualification through actual completed creation/replacement history.
 * Network transitions need their separate completed network history contract; no source reconstruction or secret substitution is permitted here.
 */
export async function qualifyAzureTerraformNetworkUpdateSource(
  plan: AzureCePlan,
  source: string,
  inventory: AzureNetworkUpdateInventory,
  store: Pick<CeDeploymentStore, 'owner' | 'read' | 'verify'>,
  loadSource: (digest: string) => Promise<AzureCePlan>,
  loadOutcome: (source: AzureCePlan) => Promise<Record<string, unknown>>,
  providerLockSha256: string,
  site: { siteUid: string; siteConfigurationSha256: string },
) {
  verifyAzureCePlan(plan);
  validateAzureNetworkUpdateInventory(plan, inventory);
  require(plan.engine === 'terraform' &&
    !plan.relayProfile &&
    plan.intent.operation === 'update-network' &&
    same(store.owner, azureUpgradeBinding(plan).owner), 'owned Terraform network intent required');
  require(providerLockSha256 === hash((await azureTerraformCurrentDeployment(plan)).providerLock) &&
    /^[a-f0-9]{64}$/.test(site.siteConfigurationSha256) &&
    typeof site.siteUid === 'string' &&
    site.siteUid, 'resolved provider lock and owned site identity required');
  await store.verify();
  const workflow = object(await store.read('terraform-workflow.json'));
  require(workflow.schemaVersion === 1 &&
    workflow.engine === 'terraform' &&
    workflow.stage === 'registered' &&
    typeof workflow.planSha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(workflow.planSha256), 'completed original admission required');
  const original = await loadSource(workflow.planSha256);
  verifyAzureCePlan(original);
  require(original.planSha256 === workflow.planSha256 &&
    original.engine === 'terraform' &&
    !original.relayProfile &&
    original.intent.operation === 'deploy' &&
    same(azureUpgradeBinding(original), azureUpgradeBinding(plan)) &&
    same(scope(original, true), scope(plan, true)), 'original creation scope differs beyond permitted subnet changes');
  const networkProfile = plan.terraformNetworkProfile ? verifyAzureTerraformNetworkProfile(plan) : undefined;
  require(!networkProfile ||
    networkProfile.originalPlanSha256 === original.planSha256, 'explicit original differs from completed admission');
  const binding = azureUpgradeBinding(original),
    nodes = binding.nodes,
    indices = nodes.map((_, i) => String(i + 1));
  const bootstrap = object(workflow.bootstrapByNode),
    launches = object(workflow.launchedAtByNode);
  require(keys(bootstrap, indices) &&
    keys(launches, indices) &&
    indices.every(
      (n) =>
        typeof bootstrap[n] === 'string' &&
        (bootstrap[n] as string).length > 0 &&
        typeof launches[n] === 'string' &&
        Number.isFinite(Date.parse(launches[n] as string)) &&
        Date.parse(launches[n] as string) <= Date.now(),
    ) &&
    workflow.configurationSha256 ===
      hash(
        renderAzureTerraformFoundation(original, bootstrap as Record<string, string>),
      ), 'original admitted bootstrap, launch or configuration differs');
  const reservation = object(await store.read('terraform-site.json'));
  require(same(reservation.owner, binding.owner) &&
    reservation.siteName === original.siteName &&
    reservation.uid === site.siteUid &&
    typeof reservation.contractFingerprint === 'string' &&
    /^sha256:[a-f0-9]{64}$/.test(reservation.contractFingerprint), 'original logical-site reservation differs');
  const originalOutcome = await loadOutcome(original);
  const qualifyOutcome = (owner: AzureCePlan, row: Record<string, unknown>, cp?: ReplacementCheckpoint) => {
    const configuration = object(row.configuration);
    require(same(configuration.owner, binding.owner) &&
      configuration.siteName === original.siteName &&
      configuration.evidenceKind === 'registration-hardware-inventory' &&
      configuration.source === `/api/register/namespaces/system/registrations_by_site/${original.siteName}` &&
      Array.isArray(configuration.interfaces) &&
      configuration.interfaces.length ===
        original.topology.nodeCount * original.nics.length, 'complete registered hardware owner and source required');
    const devices = new Set<string>();
    for (const [index, node] of nodes.entries())
      for (const nic of original.nics) {
        const matches = (configuration.interfaces as unknown[])
          .map(object)
          .filter((row) => row.node === node && row.role === nic.role);
        const observed = inventory.nodes[String(index + 1)].nics[String(nic.index)];
        require(matches.length === 1 &&
          lower(matches[0].mac) === lower(observed.mac) &&
          typeof matches[0].device === 'string' &&
          /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/.test(matches[0].device), 'registered MAC, node, role or device differs');
        const key = `${node}:${matches[0].device}`;
        require(!devices.has(key), 'duplicate registered device');
        devices.add(key);
      }
    require(row.planSha256 === owner.planSha256 &&
      row.planId === owner.planId &&
      row.engine === 'terraform' &&
      configuration.status === 'configured' &&
      configuration.siteUid === site.siteUid &&
      (cp
        ? row.status === 'complete' &&
          object(row.health).status === 'healthy' &&
          row.replacedNode === cp.node &&
          lower(row.oldVmId) === lower(cp.oldVmIds[`${owner.deploymentName}-${cp.node}`]) &&
          lower(row.newVmId) === lower(cp.newVmId) &&
          row.siteUid === site.siteUid &&
          row.terraformNoChanges === true
        : ['registered', 'accepted'].includes(String(row.status)) && object(row.registrations).status === 'healthy') &&
      (owner.routing.mode !== 'route-server' || row.routing === 'healthy') &&
      (owner.intent.ingress?.mode !== 'platform-http' ||
        (object(row.traffic).status === 'healthy' &&
          row.terraformNoChanges === true)), 'prior public execution, site or acceptance differs');
  };
  qualifyOutcome(original, originalOutcome);
  const registration = object(originalOutcome.registrations);
  require(same(registration.owner, binding.owner) &&
    registration.siteName === original.siteName &&
    Array.isArray(registration.nodes) &&
    registration.nodes.length === nodes.length, 'complete original registered UUID inventory required');
  const originalIds = new Map<string, string>();
  for (const node of nodes) {
    const rows = (registration.nodes as unknown[]).map(object).filter((row) => row.node === node);
    require(rows.length === 1 &&
      rows[0].status === 'healthy' &&
      rows[0].state === 'ONLINE' &&
      typeof rows[0].instanceId === 'string' &&
      /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(rows[0].instanceId) &&
      typeof rows[0].registration === 'string' &&
      /^r-[a-z0-9-]+$/.test(rows[0].registration), 'original registered node UUID differs');
    originalIds.set(node, rows[0].instanceId);
  }
  require(new Set([...originalIds.values()].map(lower)).size === nodes.length, 'duplicate original UUID');
  const retainedNics = Object.fromEntries(
    Object.entries(inventory.nodes).flatMap(([node, vm]) =>
      Object.entries(vm.nics).map(([index, nic]) => [
        `${node}:${index}`,
        {
          resourceId: nic.resourceId,
          subnetId: nic.subnetId,
          mac: nic.mac,
          privateIp: nic.privateIp,
          ownerPlanSha256: nic.ownerPlanSha256,
        },
      ]),
    ),
  );
  require(validAzureRetainedNicsForSource(original, retainedNics), 'original retained NIC/subnet identity differs');
  const current = {
    oldVmIds: Object.fromEntries(
      Object.entries(inventory.nodes).map(([n, vm]) => [`${plan.deploymentName}-${n}`, vm.vmId]),
    ),
    ownerPlanSha256ByNode: Object.fromEntries(
      Object.entries(inventory.nodes).map(([n, vm]) => [`${plan.deploymentName}-${n}`, vm.ownerPlanSha256]),
    ),
    retainedNics,
    ...site,
  };
  const sources = new Map<string, AzureCePlan>([[original.planSha256, original]]),
    checkpoints = new Map<string, ReplacementCheckpoint>();
  const materials = new Map<string, string>(
    Object.entries(bootstrap).map(([n, b]) => [`${original.planSha256}:${n}`, b as string]),
  );
  const seen = new Set<string>();
  const load = async (digest: string, path: Set<string>) => {
    require(/^[a-f0-9]{64}$/.test(digest) &&
      !path.has(digest) &&
      digest !== plan.planSha256, 'cyclic or unresolved generation');
    if (digest === original.planSha256 || seen.has(digest)) return;
    const owner = await loadSource(digest);
    verifyAzureCePlan(owner);
    require(owner.planSha256 === digest &&
      owner.engine === 'terraform' &&
      !owner.relayProfile &&
      !owner.terraformNetworkReplacementProfile &&
      owner.intent.operation === 'replace-node' &&
      same(azureUpgradeBinding(owner), binding) &&
      same(scope(owner, false), scope(original, false)), 'completed replacement source scope differs');
    const cp = validateAzureTerraformReplacementCheckpoint(
      owner,
      await store.read(`${owner.planId}-terraform-replacement.json`),
    );
    require(cp.phase === 'complete' &&
      cp.siteUid === site.siteUid &&
      cp.siteConfigurationSha256 === site.siteConfigurationSha256 &&
      same(cp.retainedNics, retainedNics), 'completed replacement identity differs');
    const snapshot = object(await store.read(`${owner.planId}-terraform-replacement-source.json`)),
      history = new Map<string, unknown>();
    for (const suffix of ['quiesce-plan', 'launch-plan', 'replacement-final-plan']) {
      const name = `${owner.planId}-terraform-${suffix}.json`;
      history.set(name, await store.read(name));
    }
    validateAzureTerraformReplacementStageHistory(owner, cp, snapshot, history, providerLockSha256);
    qualifyOutcome(owner, await loadOutcome(owner), cp);
    sources.set(digest, owner);
    checkpoints.set(digest, cp);
    materials.set(`${digest}:${cp.node}`, snapshot.bootstrap as string);
    for (const prior of new Set(Object.values(cp.ownerPlanSha256ByNode))) await load(prior, new Set([...path, digest]));
    seen.add(digest);
  };
  for (const digest of new Set(Object.values(current.ownerPlanSha256ByNode))) await load(digest, new Set());
  for (const [digest, cp] of checkpoints)
    verifyAzureTerraformReplacementGenerationOwners(
      sources.get(digest) as AzureCePlan,
      cp,
      original,
      sources,
      checkpoints,
    );
  const boundaries = new Map<string, string>();
  const visit = (owner: string, node: string, vmId: string, path: Set<string>) => {
    require(!path.has(owner), 'recursive VM generation');
    const key = `${owner}:${node}`;
    require(!boundaries.has(key) || boundaries.get(key) === lower(vmId), 'inconsistent predecessor UUID');
    boundaries.set(key, lower(vmId));
    if (owner === original.planSha256) {
      require(lower(originalIds.get(node)) === lower(vmId), 'original registered UUID differs from cloud generation');
      return;
    }
    const cp = checkpoints.get(owner),
      prior = sources.get(owner);
    require(cp &&
      prior?.intent.replacementNode === nodes.indexOf(node) + 1 &&
      lower(cp.newVmId) === lower(vmId), 'replacement selected UUID differs');
    for (const name of nodes) visit(cp.ownerPlanSha256ByNode[name], name, cp.oldVmIds[name], new Set([...path, owner]));
  };
  for (const node of nodes) visit(current.ownerPlanSha256ByNode[node], node, current.oldVmIds[node], new Set());
  if (networkProfile) {
    const retained = networkProfile.retainedPlanSha256;
    if (retained === original.planSha256) {
      require(Object.values(current.ownerPlanSha256ByNode).every(
        (owner) => owner === retained,
      ), 'explicit creation predecessor skips completed replacements');
    } else {
      const cp = checkpoints.get(retained);
      require(cp && sources.has(retained), 'explicit predecessor requires completed owning history');
      for (const [index, node] of nodes.entries()) {
        const selected = cp.node === index + 1;
        require(current.ownerPlanSha256ByNode[node] === (selected ? retained : cp.ownerPlanSha256ByNode[node]) &&
          lower(current.oldVmIds[node]) ===
            lower(
              selected ? cp.newVmId : cp.oldVmIds[node],
            ), 'explicit replacement predecessor is not the final current generation');
      }
    }
  }
  let configuration: Record<string, unknown>;
  try {
    configuration = object(JSON.parse(source));
  } catch {
    throw Error('Azure Terraform network source: retained configuration is malformed');
  }
  verifyAzureTerraformNonRelayConfiguration(original, current, configuration);
  const vms = object(object(configuration.resource).azurerm_linux_virtual_machine);
  for (const [index, node] of nodes.entries())
    require(Buffer.from(String(object(vms[`node_${index + 1}`]).custom_data), 'base64').toString('utf8') ===
      materials.get(
        `${current.ownerPlanSha256ByNode[node]}:${index + 1}`,
      ), 'retained bootstrap differs from completed owning generation');
  return {
    schemaVersion: 1 as const,
    engine: 'terraform' as const,
    originalPlanSha256: original.planSha256,
    sourceConfigurationSha256: hash(source),
    providerLockSha256,
    siteUid: site.siteUid,
    siteConfigurationSha256: site.siteConfigurationSha256,
    generationPlanSha256s: [...sources.keys()].sort(),
    originalOutcomeSha256: canonicalSha256(originalOutcome),
  };
}
