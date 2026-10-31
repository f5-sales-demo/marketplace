import { bindAwsCloudInit } from '../../../platform/src/ce/bootstrap';
import { verifyAzureCePlan } from './artifacts';
import { canonicalEqual } from './canonical';
import {
  azureRelayHistoricalArtifacts,
  isAzureRelayReplacementHistoricalArtifact,
  requireAzureRelayHistoricalAcceptance,
  verifyAzureRelayReplacementHistories,
} from './relay-artifact-provenance';
import { validAzureRetainedNicsForSource } from './relay-replacement-identity';
import { azureRelayResourceSource } from './relay-replacement-plan';
import { renderAzureTerraformFoundation } from './terraform-foundation';
import {
  azureTerraformReplacementPlanName,
  type ReplacementCheckpoint,
  validateAzureTerraformReplacementCheckpoint,
  validateAzureTerraformReplacementSource,
  validateAzureTerraformReplacementStageHistory,
} from './terraform-replacement';
import { verifyAzureTerraformReplacementGenerationOwners } from './terraform-replacement-generations';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

type Json = Record<string, unknown>;
interface Site {
  siteName: string;
  siteUid: string;
  tokens: Array<{ node: string; name: string }>;
}
const require = (condition: unknown, message: string): void => {
  if (!condition) throw Error(`Azure Terraform replacement artifact provenance: ${message}`);
};
const object = (value: unknown): Json => {
  require(value && typeof value === 'object' && !Array.isArray(value), 'malformed record');
  return value as Json;
};
const same = canonicalEqual;
const lower = (value: unknown) => (typeof value === 'string' ? value.toLowerCase() : '');
const uuid = (value: unknown) =>
  typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const exact = (value: Json, expected: string[]) =>
  require(Object.keys(value).sort().join(',') === expected.toSorted().join(','), 'record fields differ');
const collectedAt = (value: unknown) =>
  require(typeof value === 'string' &&
    Number.isFinite(Date.parse(value)) &&
    Date.parse(value) <= Date.now(), 'collection timestamp differs');

export function isAzureTerraformReplacementHistoricalArtifact(name: string): boolean {
  return (
    /^azure-ce-[a-f0-9]{24}-terraform-(?:replacement(?:-plan|-source|-registration|-final-plan)?|quiesce-(?:plan|recovery)|launch-(?:plan|recovery))\.json$/.test(
      name,
    ) || isAzureRelayReplacementHistoricalArtifact(name)
  );
}

function verifyRecovery(
  plan: AzureCePlan,
  checkpoint: ReplacementCheckpoint,
  phase: 'quiesce' | 'launch',
  value: unknown,
) {
  const record = object(value);
  exact(record, ['currentVmIds', 'expectedInterfaces', 'observedAt']);
  collectedAt(record.observedAt); // Collection time is historical provenance, not CE heartbeat freshness.
  const selected = `${plan.deploymentName}-${checkpoint.node}`;
  const instances = object(record.currentVmIds);
  const nodes = Object.keys(checkpoint.oldVmIds).filter((node) => phase !== 'quiesce' || node !== selected);
  require(same(Object.keys(instances).sort(), nodes.sort()), 'recovery node inventory differs');
  for (const node of nodes) {
    const id = instances[node];
    require(uuid(id) &&
      (node === selected
        ? !Object.values(checkpoint.oldVmIds).some((old) => lower(old) === lower(id)) &&
          (checkpoint.newVmId === undefined || lower(id) === lower(checkpoint.newVmId))
        : lower(id) === lower(checkpoint.oldVmIds[node])), 'recovery VM identity differs');
  }
  const expected = Array.from({ length: plan.topology.nodeCount }, (_, index) =>
    plan.nics
      .filter((nic) => ['slo', 'data', 'sli'].includes(nic.role))
      .map((nic) => ({
        node: `${plan.deploymentName}-${index + 1}`,
        role: nic.role,
        mac: checkpoint.retainedNics[`${index + 1}:${nic.index}`].mac,
      })),
  ).flat();
  require(same(record.expectedInterfaces, expected), 'recovery retained interface inventory differs');
}

function nonRelayScope(plan: AzureCePlan) {
  const { operation: _operation, replacementNode: _node, ...intent } = plan.intent;
  const { termsAccepted: _terms, ...image } = plan.image;
  return {
    intent,
    image,
    subscription: plan.subscription,
    topology: plan.topology,
    nics: plan.nics,
    vm: plan.vm,
    routing: plan.routing,
    egress: plan.egress,
    workloadProfile: plan.workloadProfile ?? null,
  };
}

export function verifyAzureTerraformNonRelayConfiguration(
  base: AzureCePlan,
  checkpoint: Pick<ReplacementCheckpoint, 'retainedNics' | 'ownerPlanSha256ByNode'>,
  configuration: Json,
) {
  require(base.intent.operation === 'deploy' &&
    !base.relayProfile &&
    validAzureRetainedNicsForSource(base, checkpoint.retainedNics), 'original retained non-relay NIC graph differs');
  const instances = object(object(configuration.resource).azurerm_linux_virtual_machine);
  const bootstrap: Record<string, string> = {};
  for (let index = 1; index <= base.topology.nodeCount; index++) {
    const encoded = object(instances[`node_${index}`]).custom_data;
    require(typeof encoded === 'string' &&
      Buffer.from(encoded as string, 'base64').toString('base64') === encoded, 'retained bootstrap encoding differs');
    bootstrap[String(index)] = Buffer.from(encoded as string, 'base64').toString('utf8');
  }
  const expected = object(JSON.parse(renderAzureTerraformFoundation(base, bootstrap)));
  const expectedVms = object(object(expected.resource).azurerm_linux_virtual_machine);
  for (let index = 1; index <= base.topology.nodeCount; index++)
    object(object(expectedVms[`node_${index}`]).tags)['xcsh-plan-sha256'] =
      checkpoint.ownerPlanSha256ByNode[`${base.deploymentName}-${index}`];
  require(same(configuration, expected), 'retained non-relay configuration graph differs');
}

/** Offline preflight only; fresh cloud/site/token absence and runner retirement remain separate gates. */
export function verifyAzureTerraformReplacementHistoricalArtifacts(
  base: AzureCePlan,
  sites: Site[],
  records: Map<string, unknown>,
  providerLockSha256: string,
): void {
  const generations = new Map<string, Map<string, unknown>>();
  for (const [name, value] of records) {
    if (!isAzureTerraformReplacementHistoricalArtifact(name)) continue;
    const id = /^(azure-ce-[a-f0-9]{24})-/.exec(name)?.[1];
    require(id, 'generation filename differs');
    if (!generations.has(String(id))) generations.set(String(id), new Map());
    generations.get(String(id))?.set(name, value);
  }
  if (!generations.size) return;
  verifyAzureCePlan(base);
  const ownedSites = sites.filter((site) => site.siteName === base.siteName);
  require(base.engine === 'terraform' && ownedSites.length === 1, 'owning engine or logical site differs');
  const site = ownedSites[0];
  const sources = new Map<string, AzureCePlan>([[base.planSha256, base]]);
  for (const [id, history] of generations) {
    const source = object(history.get(`${id}-terraform-replacement-plan.json`)) as unknown as AzureCePlan;
    verifyAzureCePlan(source);
    require(source.planId === id &&
      source.engine === 'terraform' &&
      source.intent.operation === 'replace-node' &&
      same(azureUpgradeBinding(source), azureUpgradeBinding(base)) &&
      (source.relayProfile
        ? source.relayProfile.schemaVersion === 2 &&
          same(azureRelayResourceSource(source), azureRelayResourceSource(base))
        : !base.relayProfile &&
          same(nonRelayScope(source), nonRelayScope(base))), 'generation or original resource owner differs');
    require(!sources.has(source.planSha256), 'duplicate generation source');
    sources.set(source.planSha256, source);
  }
  const checkpoints = new Map<string, ReplacementCheckpoint>();
  for (const [id, history] of generations) {
    const source = sources.get(
      (history.get(`${id}-terraform-replacement-plan.json`) as AzureCePlan).planSha256,
    ) as AzureCePlan;
    const value = history.get(`${id}-terraform-replacement.json`);
    const snapshot = history.get(`${id}-terraform-replacement-source.json`);
    if (value !== undefined || snapshot !== undefined)
      checkpoints.set(
        source.planSha256,
        validateAzureTerraformReplacementCheckpoint(
          source,
          value === undefined ? object(snapshot).preparedCheckpoint : value,
        ),
      );
  }
  const tokens = new Map<string, { node: string; name: string }>();
  for (const token of site.tokens) {
    require(azureUpgradeBinding(base).nodes.includes(token.node) &&
      /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(token.name) &&
      !tokens.has(token.name), 'token inventory differs');
    tokens.set(token.name, token);
  }
  const bind = (source: AzureCePlan, index: number, material?: string) => {
    const name = `${source.deploymentName.slice(0, 40)}-${index}-${source.planSha256.slice(0, 12)}`;
    const node = `${source.deploymentName}-${index}`;
    const token = tokens.get(name);
    const record = records.get(`${name}.json`);
    if (material === undefined && record === undefined) return;
    const value = object(record);
    exact(value, ['jwt', 'node', 'siteName', 'tokenName']);
    require(token?.node === node &&
      value.node === node &&
      value.tokenName === name &&
      value.siteName === site.siteName &&
      typeof value.jwt === 'string' &&
      /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.jwt), 'bootstrap token binding differs');
    if (material !== undefined) bindAwsCloudInit({ cloud_init_config: material }, value.jwt as string);
  };
  for (const [id, history] of generations) {
    const source = object(history.get(`${id}-terraform-replacement-plan.json`)) as unknown as AzureCePlan;
    const checkpointValue = history.get(`${id}-terraform-replacement.json`);
    const snapshotValue = history.get(`${id}-terraform-replacement-source.json`);
    if (checkpointValue === undefined && snapshotValue === undefined) {
      require(history.size === 1 &&
        history.has(azureTerraformReplacementPlanName(source)), 'orphan generation execution history');
      bind(source, source.intent.replacementNode as number);
      continue;
    }
    const snapshot = object(snapshotValue);
    const checkpoint = validateAzureTerraformReplacementCheckpoint(
      source,
      checkpointValue === undefined ? snapshot.preparedCheckpoint : checkpointValue,
    );
    require(checkpoint.siteUid === site.siteUid, 'logical site UID differs');
    if (checkpointValue === undefined)
      require(history.size === 2 && checkpoint.phase === 'prepared', 'orphan stage without initial checkpoint');
    const material = validateAzureTerraformReplacementSource(source, checkpoint, snapshot);
    validateAzureTerraformReplacementStageHistory(source, checkpoint, snapshot, history, providerLockSha256);
    bind(source, checkpoint.node, material.bootstrap);
    const configuration = object(JSON.parse(material.source));
    if (!source.relayProfile) {
      verifyAzureTerraformNonRelayConfiguration(base, checkpoint, configuration);
      verifyAzureTerraformReplacementGenerationOwners(source, checkpoint, base, sources, checkpoints);
    }
    const instances = object(object(configuration.resource).azurerm_linux_virtual_machine);
    for (let index = 1; index <= source.topology.nodeCount; index++) {
      const owner = sources.get(checkpoint.ownerPlanSha256ByNode[`${source.deploymentName}-${index}`]);
      require(owner &&
        (owner.intent.operation === 'deploy' ||
          owner.intent.replacementNode === index), 'retained bootstrap generation source is unresolved');
      const encoded = object(instances[`node_${index}`]).custom_data;
      require(typeof encoded === 'string', 'retained bootstrap is unavailable');
      bind(owner as AzureCePlan, index, Buffer.from(encoded as string, 'base64').toString('utf8'));
    }
    const predecessor =
      source.relayProfile?.schemaVersion === 2 ? source.relayProfile.retainedDeploymentPlan : undefined;
    if (predecessor?.relayProfile?.schemaVersion === 2) {
      const previous = generations.get(predecessor.planId);
      require(previous &&
        same(
          previous.get(azureTerraformReplacementPlanName(predecessor)),
          predecessor,
        ), 'predecessor generation execution history is unavailable');
      const previousCheckpoint = validateAzureTerraformReplacementCheckpoint(
        predecessor,
        previous?.get(`${predecessor.planId}-terraform-replacement.json`),
      );
      require(previousCheckpoint.phase === 'complete', 'predecessor execution is incomplete');
      const relay = new Map<string, unknown>();
      for (const name of azureRelayHistoricalArtifacts)
        relay.set(name, previous?.get(`${predecessor.planId}-replacement-${name}`));
      requireAzureRelayHistoricalAcceptance(predecessor, site.siteUid, relay);
    }
    for (const phase of ['quiesce', 'launch'] as const) {
      const recovery = history.get(`${id}-terraform-${phase}-recovery.json`);
      if (recovery !== undefined) {
        require(history.has(`${id}-terraform-${phase}-plan.json`), 'recovery stage plan is unavailable');
        verifyRecovery(source, checkpoint, phase, recovery);
      }
    }
    const registrationValue = history.get(`${id}-terraform-replacement-registration.json`);
    if (registrationValue !== undefined) {
      const registration = object(registrationValue);
      exact(registration, ['action', 'instanceId', 'node', 'registration', 'siteName', 'state']);
      const selected = `${source.deploymentName}-${checkpoint.node}`;
      require(['launched', 'complete'].includes(checkpoint.phase) &&
        registration.action === 'approve-registration' &&
        ['requested', 'submitted'].includes(String(registration.state)) &&
        registration.siteName === site.siteName &&
        typeof registration.registration === 'string' &&
        /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(registration.registration) &&
        typeof registration.node === 'string' &&
        Object.hasOwn(checkpoint.oldVmIds, registration.node) &&
        lower(registration.instanceId) ===
          lower(
            registration.node === selected ? checkpoint.newVmId : checkpoint.oldVmIds[registration.node],
          ), 'registration request identity differs');
    }
    if (checkpoint.phase === 'complete' && source.relayProfile) {
      const relay = new Map<string, unknown>();
      for (const name of azureRelayHistoricalArtifacts) relay.set(name, history.get(`${id}-replacement-${name}`));
      requireAzureRelayHistoricalAcceptance(source, site.siteUid, relay);
    }
  }
  if (base.relayProfile) verifyAzureRelayReplacementHistories(base, site.siteUid, records, sources);
  else
    require(!Array.from(records.keys()).some(
      isAzureRelayReplacementHistoricalArtifact,
    ), 'relay journal on non-relay source');
}
