import { randomUUID } from 'node:crypto';
import type { CeDeploymentStore } from '../../../platform/src/ce/deployment-store';
import { awsCeObservationRegion, canonicalSha256, fingerprintObservation } from './canonical';
import type { AwsCeObservation, AwsCePlan } from './types';

type Comparison = 'native-fingerprint' | 'terraform-preflight';
type Category = 'identity' | 'agreement' | 'regions' | 'resources' | 'research' | 'capabilities';

export interface AwsCeRevalidationDiagnostic {
  code: 'aws-ce-revalidation-rejected';
  comparison: Comparison;
  scope: 'execution-region-v1' | 'legacy-all-regions' | 'terraform-selected-region';
  region: string | null;
  expectedFingerprint: string | null;
  currentFingerprint: string | null;
  comparisonBaseline: 'original-planning-observation';
  baselineMatchesExpected: boolean;
  changedCategories: Category[];
  capture: 'saved' | 'unavailable';
  receiptReference?: string;
  receiptSha256?: string;
  receiptDigestFormat?: 'canonical-json-sha256';
}

export class AwsCeRevalidationError extends Error {
  constructor(readonly diagnostic: AwsCeRevalidationDiagnostic) {
    super(
      `Stale AWS CE plan: revalidation rejected; private observation capture ${diagnostic.capture}` +
        (diagnostic.receiptReference ? ` (${diagnostic.receiptReference})` : ''),
    );
    this.name = 'AwsCeRevalidationError';
  }
}

/** Captured-at is a workstation receipt time, never a CE sample/heartbeat time. */
export async function captureAwsRevalidationRejection(
  plan: AwsCePlan,
  baseline: AwsCeObservation,
  current: AwsCeObservation,
  expectedFingerprint: string,
  relevantResourceIds: string[],
  comparison: Comparison,
  storage: Pick<CeDeploymentStore, 'write' | 'verify' | 'owner'> | undefined,
): Promise<AwsCeRevalidationError> {
  const executionRegion = comparison === 'terraform-preflight' ? plan.region : awsCeObservationRegion(plan);
  const fingerprint = (value: AwsCeObservation): string | null => {
    try {
      return fingerprintObservation(value, relevantResourceIds, executionRegion);
    } catch {
      return null;
    }
  };
  const selectRegions = (value: AwsCeObservation) =>
    executionRegion === undefined
      ? value.regions
      : Array.isArray(value.regions)
        ? value.regions.filter((region) => region.name === executionRegion)
        : null;
  const ids = new Set(relevantResourceIds);
  const values = (value: AwsCeObservation) => ({
    identity: value.identity ?? null,
    agreement: value.agreement ?? null,
    regions: selectRegions(value) ?? null,
    resources: Array.isArray(value.resources) ? value.resources.filter((resource) => ids.has(resource.id)) : null,
    research: value.research ?? null,
    capabilities: { value: value.f5Capabilities ?? null, sha256: value.f5CapabilitiesSha256 ?? null },
  });
  const before = values(baseline);
  const after = values(current);
  const changedCategories = (Object.keys(before) as Category[]).filter(
    (key) => canonicalSha256(before[key]) !== canonicalSha256(after[key]),
  );
  const diagnostic: AwsCeRevalidationDiagnostic = {
    code: 'aws-ce-revalidation-rejected',
    comparison,
    scope:
      comparison === 'terraform-preflight'
        ? 'terraform-selected-region'
        : executionRegion === undefined
          ? 'legacy-all-regions'
          : 'execution-region-v1',
    region: /^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(plan.region) ? plan.region : null,
    expectedFingerprint: /^[a-f0-9]{64}$/.test(expectedFingerprint) ? expectedFingerprint : null,
    currentFingerprint: fingerprint(current),
    comparisonBaseline: 'original-planning-observation',
    baselineMatchesExpected: fingerprint(baseline) === expectedFingerprint,
    changedCategories,
    capture: 'unavailable',
  };
  const reference = `observation-rejection-${randomUUID()}`;
  const receipt = {
    schemaVersion: 1,
    kind: 'aws-ce-revalidation-rejection',
    capturedAt: new Date().toISOString(),
    planId: plan.planId,
    planSha256: plan.planSha256,
    owner: {
      deploymentId: plan.deploymentName,
      engine: plan.engine,
      provider: 'aws',
      account: plan.accountId,
      region: plan.region,
    },
    diagnostic: { ...diagnostic, capture: 'saved', receiptReference: reference },
    relevantResourceIds: [...relevantResourceIds],
    baseline: structuredClone(baseline),
    current: structuredClone(current),
    baselineObservationSha256: canonicalSha256(baseline),
    currentObservationSha256: canonicalSha256(current),
  };
  try {
    if (
      !storage ||
      !(['deploymentId', 'engine', 'provider', 'account', 'region'] as const).every(
        (key) => storage.owner[key] === receipt.owner[key],
      )
    )
      throw new Error('Private receipt ownership unavailable');
    await storage.verify();
    await storage.write(`${reference}.json`, receipt);
    diagnostic.capture = 'saved';
    diagnostic.receiptReference = reference;
    diagnostic.receiptSha256 = canonicalSha256(receipt);
    diagnostic.receiptDigestFormat = 'canonical-json-sha256';
  } catch {
    // Capture failure never approves execution or exposes a storage path/error payload.
  }
  return new AwsCeRevalidationError(diagnostic);
}
