import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { TerraformSession } from '../../../terraform/src/service';
import type { AzExecApi } from '../az/exec';
import { guardAzureCeApplyObject } from './apply-request';
import { verifyAzureCePlan } from './artifacts';
import { canonicalEqual, canonicalSha256, canonicalSnapshot } from './canonical';
import {
  type AzureReplacementOperationalIdentityDependencies,
  collectAzureReplacementOperationalIdentity,
} from './network-replacement-operational-identity';
import {
  type AzureAcquisitionReference,
  createAzureOperationalAcquisitionCustody,
} from './operational-acquisition-custody';
import type { AzureOperationalIdentityRuntime } from './operational-identity-joins';
import type { AzureTerraformNetworkReplacementOperationalIdentity } from './terraform-network-replacement-execution';
import { verifyAzureTerraformNetworkReplacementProfile } from './terraform-network-replacement-plan';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

type Identity = AzureTerraformNetworkReplacementOperationalIdentity;
type Readings = Awaited<ReturnType<typeof collectAzureReplacementOperationalIdentity>>;
type Json = Record<string, unknown>;
export type AzureReplacementAcquisitionPurpose = 'preflight' | 'final';
export type AzureReplacementAcquisitionReference = AzureAcquisitionReference<
  'replacement',
  AzureReplacementAcquisitionPurpose
>;
const same = canonicalEqual;
const sha = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function require(value: unknown, message: string): asserts value {
  if (!value) throw Error(`Azure replacement acquisition provenance: ${message}`);
}
function object(value: unknown): Json {
  require(value && typeof value === 'object' && !Array.isArray(value), 'complete replacement record required');
  return value as Json;
}

/** Separate replacement execution provenance. The actual read-only collector authenticates
 * journal/source/configuration and full current generation before anything is signed. Historical
 * authentication verifies originally signed facts against the entire expected identity; it never
 * reinterprets stale facts as current. This scope does not provide routing/traffic acceptance. */
export function createAzureReplacementAcquisitionCollector(
  request: AzureCePlan,
  transport: AzureOperationalIdentityRuntime,
  cloud: AzExecApi,
  storage: CeDeploymentStore,
  terraform: TerraformSession,
  dependencies: AzureReplacementOperationalIdentityDependencies,
  trustedIssuerSha256?: string,
  originalIssuerPublication?: (issuerSha256: string, signal: AbortSignal) => Promise<void>,
  loadOriginalSource?: (planSha256: string, signal: AbortSignal) => Promise<AzureCePlan>,
) {
  const plan = structuredClone(request),
    owner = structuredClone(storage.owner),
    directory = storage.directory,
    requestMatches = canonicalSnapshot(request);
  const validateSource = (source: AzureCePlan, expectedOwner: CeDeploymentStore['owner']) => {
    verifyAzureCePlan(source);
    verifyAzureTerraformNetworkReplacementProfile(source);
    require(source.engine === 'terraform' &&
      same(azureUpgradeBinding(source).owner, expectedOwner), 'owning Terraform replacement plan required');
  };
  validateSource(plan, owner);
  const originalLoaders = dependencies.loaders,
    historical = dependencies.qualifyHistorical,
    completed = dependencies.qualifyReplacementCompleted;
  const seal = () =>
    require(requestMatches(request) &&
      requestMatches(plan) &&
      storage.directory === directory &&
      same(storage.owner, owner) &&
      transport.engine === 'terraform' &&
      dependencies.loaders === originalLoaders &&
      dependencies.qualifyHistorical === historical &&
      dependencies.qualifyReplacementCompleted === completed, 'owning replacement collector context changed');
  const runtime = guardAzureCeApplyObject(transport, seal, {}, ['engine']),
    api = guardAzureCeApplyObject(cloud, seal),
    session = guardAzureCeApplyObject(terraform, seal),
    loaders = guardAzureCeApplyObject(dependencies.loaders, seal),
    guardedDependencies = guardAzureCeApplyObject(dependencies, seal),
    observer = Object.freeze({
      loaders,
      qualifyHistorical: guardedDependencies.qualifyHistorical,
      ...(completed ? { qualifyReplacementCompleted: guardedDependencies.qualifyReplacementCompleted } : {}),
    });
  return createAzureOperationalAcquisitionCustody<
    'replacement',
    Identity,
    AzureReplacementAcquisitionPurpose,
    Readings
  >(
    request,
    storage,
    {
      family: 'replacement',
      verifyContext: seal,
      validateSource,
      validatePurpose(purpose) {
        require(purpose === 'preflight' || purpose === 'final', 'replacement purpose differs');
      },
      validateIdentity(raw, source, expectedOwner) {
        const identity = object(raw),
          site = object(identity.site),
          nodes = object(identity.nodes);
        require(same(
          Object.keys(identity).sort(),
          [
            'owner',
            'planSha256',
            'journalSha256',
            'sourceBindingSha256',
            'configurationSha256',
            'site',
            'phase',
            'nodes',
          ].sort(),
        ) &&
          identity.planSha256 === source.planSha256 &&
          same(identity.owner, expectedOwner) &&
          sha(identity.journalSha256) &&
          sha(identity.sourceBindingSha256) &&
          sha(identity.configurationSha256) &&
          same(Object.keys(site).sort(), ['siteConfigurationSha256', 'siteUid']) &&
          sha(site.siteConfigurationSha256) &&
          typeof site.siteUid === 'string' &&
          site.siteUid.trim() &&
          (identity.phase === 'intact' || identity.phase === 'launched') &&
          same(
            Object.keys(nodes).sort(),
            Array.from({ length: source.topology.nodeCount }, (_, i) => String(i + 1)).sort(),
          ), 'entire resolved replacement identity required');
      },
      validateReadings(raw, expected, source, expectedOwner) {
        const readings = object(raw),
          identity = object(expected);
        require(readings.schemaVersion === 1 &&
          readings.scope === 'replacement-registration-interface-identity' &&
          same(readings.owner, expectedOwner) &&
          readings.planSha256 === source.planSha256 &&
          readings.journalSha256 === identity.journalSha256 &&
          readings.sourceBindingSha256 === identity.sourceBindingSha256 &&
          readings.configurationSha256 === identity.configurationSha256 &&
          same(readings.site, identity.site) &&
          readings.phase === identity.phase &&
          readings.purpose === (identity.phase === 'intact' ? 'preflight' : 'final') &&
          readings.expectedIdentitySha256 === canonicalSha256(expected) &&
          readings.expectedInventorySha256 ===
            canonicalSha256(identity.nodes), 'signed full replacement scope differs');
      },
      collectReadings(identity, purpose, signal) {
        return collectAzureReplacementOperationalIdentity(
          plan,
          identity,
          runtime,
          api,
          storage,
          session,
          observer,
          purpose,
          signal,
        );
      },
    },
    trustedIssuerSha256,
    originalIssuerPublication,
    loadOriginalSource,
  );
}
