import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { TerraformSession } from '../../../terraform/src/service';
import type { AzExecApi } from '../az/exec';
import { verifyAzureCePlan } from './artifacts';
import { canonicalEqual, canonicalSha256, canonicalSnapshot } from './canonical';
import type { AzureReplacementOperationalIdentityDependencies } from './network-replacement-operational-identity';
import { collectAzureReplacementOperationalReadings } from './network-replacement-operational-readings';
import {
  type AzureAcquisitionReference,
  createAzureOperationalAcquisitionCustody,
} from './operational-acquisition-custody';
import type { AzureTerraformNetworkReplacementOperationalIdentity } from './terraform-network-replacement-execution';
import { verifyAzureTerraformNetworkReplacementProfile } from './terraform-network-replacement-plan';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

type Identity = AzureTerraformNetworkReplacementOperationalIdentity;
type Readings = Awaited<ReturnType<typeof collectAzureReplacementOperationalReadings>>;
type Runtime = Parameters<typeof collectAzureReplacementOperationalReadings>[2];
type Json = Record<string, unknown>;
export type AzureReplacementReadingsAcquisitionPurpose = 'preflight' | 'final';
export type AzureReplacementReadingsAcquisitionReference = AzureAcquisitionReference<
  'replacement-readings',
  AzureReplacementReadingsAcquisitionPurpose
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

/** Separate richer replacement acquisition provenance. The actual collector authenticates full
 * replacement identity around requested, admitted current traffic before anything is signed.
 * Historical authentication preserves original facts; it supplies no current invocation,
 * vendor heartbeat, routing/traffic qualification or full operational acceptance. */
export function createAzureReplacementReadingsAcquisitionCollector(
  request: AzureCePlan,
  transport: Runtime,
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
  const collaborators = [
    [
      transport,
      [
        'observeOwnedSite',
        'ownedSiteConfiguration',
        'observeRegistrations',
        'observeAzureInterfaces',
        'observeNodeReadiness',
        'observeForwardingRoutes',
        'observeBgpSessions',
        'observeBgpRoutes',
      ],
    ],
    [cloud, ['exec']],
    [storage, ['verify', 'read', 'write']],
    [terraform, ['readConfiguration', 'readConfigurationSha256']],
    [originalLoaders, ['loadSource']],
  ] as const;
  const callbacks = collaborators.flatMap(([target, names]) =>
    names.map((name) => {
      const object = target as unknown as Record<string, unknown>;
      return { object, name, callback: object[name] };
    }),
  );
  const seal = () =>
    require(requestMatches(request) &&
      requestMatches(plan) &&
      storage.directory === directory &&
      same(storage.owner, owner) &&
      transport.engine === 'terraform' &&
      dependencies.loaders === originalLoaders &&
      dependencies.qualifyHistorical === historical &&
      dependencies.qualifyReplacementCompleted === completed &&
      callbacks.every(
        (row) => row.object[row.name] === row.callback,
      ), 'owning replacement readings collector context changed');
  return createAzureOperationalAcquisitionCustody<
    'replacement-readings',
    Identity,
    AzureReplacementReadingsAcquisitionPurpose,
    Readings
  >(
    request,
    storage,
    {
      family: 'replacement-readings',
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
          expectedIdentity = object(expected),
          physical = object(readings.identity);
        require(same(
          Object.keys(readings).sort(),
          [
            'schemaVersion',
            'scope',
            'status',
            'owner',
            'planSha256',
            'purpose',
            'identity',
            'nodeReadiness',
            'forwarding',
            'bgp',
            'traffic',
            'operationalAcceptance',
            'startedAt',
            'completedAt',
          ].sort(),
        ) &&
          readings.schemaVersion === 1 &&
          readings.scope === 'current-replacement-operational-readings' &&
          (readings.status === 'observed' || readings.status === 'unknown') &&
          readings.operationalAcceptance === 'unknown' &&
          same(readings.owner, expectedOwner) &&
          readings.planSha256 === source.planSha256 &&
          readings.purpose === (expectedIdentity.phase === 'intact' ? 'preflight' : 'final') &&
          physical.scope === 'replacement-registration-interface-identity' &&
          same(physical.owner, expectedOwner) &&
          physical.planSha256 === source.planSha256 &&
          physical.journalSha256 === expectedIdentity.journalSha256 &&
          physical.sourceBindingSha256 === expectedIdentity.sourceBindingSha256 &&
          physical.configurationSha256 === expectedIdentity.configurationSha256 &&
          same(physical.site, expectedIdentity.site) &&
          physical.phase === expectedIdentity.phase &&
          physical.purpose === readings.purpose &&
          physical.expectedIdentitySha256 === canonicalSha256(expected) &&
          physical.expectedInventorySha256 === canonicalSha256(expectedIdentity.nodes) &&
          typeof readings.startedAt === 'string' &&
          typeof readings.completedAt === 'string' &&
          Number.isFinite(Date.parse(readings.startedAt)) &&
          Number.isFinite(Date.parse(readings.completedAt)) &&
          Date.parse(readings.completedAt) >= Date.parse(readings.startedAt) &&
          Date.parse(readings.completedAt) - Date.parse(readings.startedAt) <=
            180000, 'signed current replacement readings scope or identity differs');
      },
      collectReadings(identity, purpose, signal, collectTraffic) {
        return collectAzureReplacementOperationalReadings(
          plan,
          identity,
          transport,
          cloud,
          storage,
          terraform,
          dependencies,
          purpose,
          signal,
          collectTraffic,
        );
      },
    },
    trustedIssuerSha256,
    originalIssuerPublication,
    loadOriginalSource,
  );
}
