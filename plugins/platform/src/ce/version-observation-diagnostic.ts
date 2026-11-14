export const CE_UPGRADE_OBSERVATION_STAGES = [
  'logical-site',
  'physical-site',
  'site-versions',
  'upgrade-paths',
  'targets',
  'prechecks',
  'progress',
  'logical-site-recheck',
  'physical-site-recheck',
  'stability-recheck',
] as const;
export type CeUpgradeObservationStage = (typeof CE_UPGRADE_OBSERVATION_STAGES)[number];
const reasons = [
  'authorization',
  'expired',
  'throttled',
  'not-found',
  'conflict',
  'invalid-request',
  'transient',
  'malformed',
  'cancelled',
  'deadline',
  'ownership-or-response-invalid',
  'identity-or-versions-not-stable',
] as const;
const stages = [...CE_UPGRADE_OBSERVATION_STAGES, 'replacement-version-stability'] as const;
export interface CeVersionObservationDiagnostic {
  status: 'unknown' | 'unstable';
  reason: (typeof reasons)[number] | 'not-established';
  failedStage: (typeof stages)[number] | 'not-established';
}
/** Public pending evidence contains bounded categories, never response bodies or arbitrary errors. */
export function safeCeVersionObservationDiagnostic(value: unknown): CeVersionObservationDiagnostic {
  const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    status: row.status === 'unstable' ? 'unstable' : 'unknown',
    reason: reasons.includes(row.reason as never) ? (row.reason as (typeof reasons)[number]) : 'not-established',
    failedStage: stages.includes(row.failedStage as never)
      ? (row.failedStage as (typeof stages)[number])
      : 'not-established',
  };
}
