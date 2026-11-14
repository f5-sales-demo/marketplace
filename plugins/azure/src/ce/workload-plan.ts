import type { AzExecApi } from '../az/exec';
import { verifyAzureCePlan } from './artifacts';
import { canonicalSha256 } from './canonical';
import { type AzureRelayResolvedCatalog, resolveAzureLinuxHostCatalog } from './relay-catalog';
import type { AzureCePlan } from './types';
import {
  AZURE_CE_WORKLOAD_FIXTURE_IMAGE,
  AZURE_CE_WORKLOAD_FIXTURE_VCPUS,
  AZURE_CE_WORKLOAD_FIXTURE_VM_SIZE,
} from './workload-fixture';

export interface AzureWorkloadDeploymentProfile {
  schemaVersion: 1;
  foundationPlan: AzureCePlan;
  catalog: AzureRelayResolvedCatalog;
}
const require = (value: unknown, message: string): void => {
  if (!value) throw Error(`Azure workload plan: ${message}`);
};
export function azureWorkloadSelection(plan: AzureCePlan) {
  const version = plan.intent.workloadFixture?.imageVersion;
  require(typeof version === 'string' && /^\d+\.\d+\.\d+$/.test(version), 'exact Ubuntu image version required');
  return {
    hostImage: { ...AZURE_CE_WORKLOAD_FIXTURE_IMAGE, version: version as string },
    vmSize: AZURE_CE_WORKLOAD_FIXTURE_VM_SIZE,
  };
}
export async function resolveAzureWorkloadCatalog(plan: AzureCePlan, api: AzExecApi, signal?: AbortSignal) {
  return resolveAzureLinuxHostCatalog(plan, azureWorkloadSelection(plan), api, signal);
}

/** Bind an exact image and regional workload SKU to the saved plan before Terraform execution. */
export function compileAzureWorkloadDeploymentPlan(source: AzureCePlan, catalog: AzureRelayResolvedCatalog) {
  require(!source.workloadProfile && !source.relayProfile, 'unprofiled foundation required');
  verifyAzureCePlan(source);
  require(source.engine === 'terraform' &&
    source.intent.operation === 'deploy' &&
    source.routing.mode === 'route-server' &&
    source.intent.workloadFixture, 'owning Terraform workload deployment required');
  const selection = azureWorkloadSelection(source);
  const urn = Object.values(selection.hostImage).join(':');
  const imageId = `/subscriptions/${source.subscription.id}/providers/Microsoft.Compute/locations/${source.region}/publishers/${selection.hostImage.publisher}/artifacttypes/vmimage/offers/${selection.hostImage.offer}/skus/${selection.hostImage.sku}/versions/${selection.hostImage.version}`;
  require(catalog.region === source.region &&
    catalog.image.urn === urn &&
    catalog.image.id.toLowerCase() === imageId.toLowerCase() &&
    catalog.image.osType === 'Linux' &&
    catalog.image.architecture === 'amd64', 'exact workload image identity differs');
  require(catalog.vmSizes.length === 1 &&
    catalog.vmSizes[0].name === selection.vmSize &&
    !catalog.vmSizes[0].restricted &&
    catalog.vmSizes[0].vCpus === AZURE_CE_WORKLOAD_FIXTURE_VCPUS &&
    catalog.vmSizes[0].maxNics >= 1 &&
    catalog.vmSizes[0].memoryGb >= 1, 'workload SKU capacity or region eligibility differs');
  const queries = [
    ['account', 'show'],
    ['vm', 'image', 'show', '--urn', urn, '--location', source.region],
    ['vm', 'list-skus', '--size', selection.vmSize, '--location', source.region, '--all'],
  ].map((args) => [...args, '--subscription', source.subscription.id, '--output', 'json']);
  const provenance = catalog.provenance;
  require(provenance?.method === 'azure-cli-live' &&
    provenance.sourcePlanSha256 === source.planSha256 &&
    Number.isFinite(Date.parse(provenance.observedAt)) &&
    provenance.reads.length === 3 &&
    provenance.reads.every(
      (read, index) =>
        read.command === 'az' &&
        JSON.stringify(read.args) === JSON.stringify(queries[index]) &&
        /^[a-f0-9]{64}$/.test(read.responseSha256) &&
        Number.isFinite(Date.parse(read.observedAt)) &&
        Date.parse(read.observedAt) <= Date.parse(provenance.observedAt),
    ), 'catalog provenance differs or is incomplete');
  const { planId: _id, planSha256: _sha, ...base } = structuredClone(source);
  const draft = {
    ...base,
    workloadProfile: {
      schemaVersion: 1 as const,
      foundationPlan: structuredClone(source),
      catalog: structuredClone(catalog),
    },
  };
  const planSha256 = canonicalSha256(draft);
  return { ...draft, planId: `azure-ce-${planSha256.slice(0, 24)}`, planSha256 };
}
export function verifyAzureWorkloadDeploymentProfile(plan: AzureCePlan) {
  const profile = plan.workloadProfile;
  require(profile?.schemaVersion === 1 &&
    Object.keys(profile).sort().join(',') === 'catalog,foundationPlan,schemaVersion', 'profile shape differs');
  if (!profile) throw Error('Azure workload plan: profile missing');
  const expected = compileAzureWorkloadDeploymentPlan(profile.foundationPlan, profile.catalog);
  require(canonicalSha256(plan) ===
    canonicalSha256(expected), 'workload execution graph differs from collected catalog');
}
