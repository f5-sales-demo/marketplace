import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import type { ExpectedCeForwardingRoutes } from '../../../platform/src/ce/forwarding-route';
import { guardAzureCeApplyObject } from './apply-request';
import { verifyAzureCePlan } from './artifacts';
import { canonicalEqual, canonicalSnapshot } from './canonical';
import { collectAzureNetworkOperationalReadings } from './network-operational-readings';
import {
  type AzureAcquisitionReference,
  createAzureOperationalAcquisitionCustody,
} from './operational-acquisition-custody';
import type { AzureTerraformNetworkAcceptanceIdentity } from './terraform-network-checkpoint';
import { azureUpgradeBinding } from './terraform-upgrade';
import type { AzureCePlan } from './types';

type Runtime = Parameters<typeof collectAzureNetworkOperationalReadings>[2];
type Cloud = Parameters<typeof collectAzureNetworkOperationalReadings>[3];
type Identity = AzureTerraformNetworkAcceptanceIdentity;
type Readings = Awaited<ReturnType<typeof collectAzureNetworkOperationalReadings>>;
type Json = Record<string, unknown>;
const same = canonicalEqual;
function require(value: unknown, reason: string): asserts value {
  if (!value) throw Error(`Azure operational acquisition provenance: ${reason}`);
}
function object(value: unknown): Json {
  require(value && typeof value === 'object' && !Array.isArray(value), 'malformed private record');
  return value as Json;
}
export type AzureOperationalAcquisitionPurpose = 'preflight' | 'restored' | 'final';
export type AzureOperationalAcquisitionReference = AzureAcquisitionReference<
  'network',
  AzureOperationalAcquisitionPurpose
>;

/** The fixed update-network contract retains its own guard and namespace. Shared custody signs
 * only facts obtained from this actual collector; signatures do not qualify vendor freshness. */
export function createAzureOperationalAcquisitionCollector(
  request: AzureCePlan,
  transport: Runtime,
  cloud: Cloud,
  storage: CeDeploymentStore,
  forwarding?: ExpectedCeForwardingRoutes,
  trustedIssuerSha256?: string,
  originalIssuerPublication?: (issuerSha256: string, signal: AbortSignal) => Promise<void>,
  loadOriginalSource?: (planSha256: string, signal: AbortSignal) => Promise<AzureCePlan>,
) {
  const plan = structuredClone(request),
    owner = structuredClone(storage.owner),
    directory = storage.directory,
    reviewed = forwarding === undefined ? undefined : structuredClone(forwarding),
    requestMatches = canonicalSnapshot(request),
    reviewedMatches = forwarding === undefined ? undefined : canonicalSnapshot(forwarding);
  const validateSource = (source: AzureCePlan, expectedOwner: CeDeploymentStore['owner']) => {
    verifyAzureCePlan(source);
    require(source.engine === 'terraform' &&
      source.intent.operation === 'update-network' &&
      same(azureUpgradeBinding(source).owner, expectedOwner), 'owning Terraform network plan required');
  };
  validateSource(plan, owner);
  const seal = () =>
    require(requestMatches(request) &&
      requestMatches(plan) &&
      storage.directory === directory &&
      same(storage.owner, owner) &&
      transport.engine === 'terraform' &&
      (forwarding === undefined
        ? reviewed === undefined
        : reviewedMatches?.(forwarding) && reviewedMatches?.(reviewed)), 'owning collector context changed');
  const runtime = guardAzureCeApplyObject(transport, seal, {}, ['engine']),
    api = guardAzureCeApplyObject(cloud, seal);
  return createAzureOperationalAcquisitionCustody<'network', Identity, AzureOperationalAcquisitionPurpose, Readings>(
    request,
    storage,
    {
      family: 'network',
      verifyContext: seal,
      validateSource,
      validatePurpose(purpose) {
        require(purpose === 'preflight' ||
          purpose === 'restored' ||
          purpose === 'final', 'requested acquisition purpose differs');
      },
      validateIdentity(raw, source, expectedOwner) {
        const identity = object(raw);
        require(identity.planSha256 === source.planSha256 &&
          same(identity.owner, expectedOwner) &&
          identity.siteName === source.siteName &&
          typeof identity.node === 'number' &&
          Number.isInteger(identity.node) &&
          identity.node >= 1 &&
          identity.node <= source.topology.nodeCount, 'original execution identity differs from source');
      },
      validateReadings(raw, expected, source, expectedOwner) {
        const readings = object(raw),
          identity = object(expected);
        require(readings.schemaVersion === 1 &&
          readings.scope === 'current-network-operational-readings' &&
          same(readings.owner, expectedOwner) &&
          readings.planSha256 === source.planSha256 &&
          readings.node === identity.node &&
          readings.siteUid === identity.siteUid, 'signed acquisition scope differs');
      },
      collectReadings(identity, purpose, signal, collectTraffic) {
        return collectAzureNetworkOperationalReadings(
          plan,
          identity,
          runtime,
          api,
          storage,
          signal,
          collectTraffic,
          reviewed,
          purpose,
        );
      },
    },
    trustedIssuerSha256,
    originalIssuerPublication,
    loadOriginalSource,
  );
}
