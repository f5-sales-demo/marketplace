import { canonicalSha256 } from './canonical';
import { awsCeRevalidationDiagnostic } from './observation-rejection';
import { terraformPreflightReferences } from './terraform-preflight';
import type { AwsCeObservation, AwsCePlan } from './types';

/** Qualify a private failure capture; it supplies no live health or admission evidence. */
export function qualifyAwsTerraformRevalidationCapture(plan: AwsCePlan, name: string, input: unknown): void {
  const fail = (): never => {
    throw Error('AWS revalidation capture provenance differs');
  };
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail();
  const value = input as Record<string, unknown>;
  const fields = [
    'schemaVersion',
    'kind',
    'capturedAt',
    'planId',
    'planSha256',
    'owner',
    'diagnostic',
    'relevantResourceIds',
    'baseline',
    'current',
    'baselineObservationSha256',
    'currentObservationSha256',
  ];
  const reference = name.slice(0, -5);
  if (
    plan.engine !== 'terraform' ||
    !/^observation-rejection-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.json$/.test(name) ||
    canonicalSha256(Object.keys(value).sort()) !== canonicalSha256(fields.sort()) ||
    value.schemaVersion !== 1 ||
    value.kind !== 'aws-ce-revalidation-rejection' ||
    value.planId !== plan.planId ||
    value.planSha256 !== plan.planSha256 ||
    canonicalSha256(value.owner) !==
      canonicalSha256({
        deploymentId: plan.deploymentName,
        engine: plan.engine,
        provider: 'aws',
        account: plan.accountId,
        region: plan.region,
      }) ||
    typeof value.capturedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.capturedAt)) ||
    new Date(value.capturedAt).toISOString() !== value.capturedAt ||
    !Array.isArray(value.relevantResourceIds) ||
    canonicalSha256(value.relevantResourceIds) !== canonicalSha256(terraformPreflightReferences(plan))
  )
    fail();
  const baseline = value.baseline as AwsCeObservation;
  const current = value.current as AwsCeObservation;
  if (
    !baseline ||
    !current ||
    typeof baseline !== 'object' ||
    typeof current !== 'object' ||
    canonicalSha256(baseline) !== value.baselineObservationSha256 ||
    canonicalSha256(current) !== value.currentObservationSha256
  )
    fail();
  let expected: ReturnType<typeof awsCeRevalidationDiagnostic>;
  try {
    expected = awsCeRevalidationDiagnostic(
      plan,
      baseline,
      current,
      plan.observationFingerprint,
      terraformPreflightReferences(plan),
      'terraform-preflight',
    );
  } catch {
    throw Error('AWS revalidation capture provenance differs');
  }
  if (
    !expected.baselineMatchesExpected ||
    expected.expectedFingerprint !== plan.observationFingerprint ||
    canonicalSha256(value.diagnostic) !==
      canonicalSha256({ ...expected, capture: 'saved', receiptReference: reference })
  )
    fail();
}
