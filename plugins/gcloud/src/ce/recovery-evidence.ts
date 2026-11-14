export interface GcpRecoverySample {
  observedAtMs: number;
  routeHealthy: boolean;
  applicationHealthy: boolean;
  requests: number;
  failedRequests: number;
  contentVerified: boolean;
}
export interface GcpRecoveryWindow {
  operation?: 'failover' | 'repair';
  restorationCommandAtMs?: number;
  disruptionAtMs: number;
  restoredAtMs: number;
  deadlineSeconds: number;
  samples: GcpRecoverySample[];
}
/** Route convergence, verified application recovery and loss are independent acceptance facts. */
export function evaluateGcpRecovery(window: GcpRecoveryWindow) {
  if (
    !Number.isFinite(window.disruptionAtMs) ||
    !Number.isFinite(window.restoredAtMs) ||
    window.restoredAtMs < window.disruptionAtMs ||
    window.deadlineSeconds !== 120
  )
    throw new Error('Exact disruption/restoration timestamps and 120-second threshold required');
  const operation = window.operation ?? 'failover';
  if (!['failover', 'repair'].includes(operation)) throw new Error('Unknown recovery operation');
  if (
    operation === 'repair' &&
    (!Number.isFinite(window.restorationCommandAtMs) ||
      (window.restorationCommandAtMs as number) < window.disruptionAtMs ||
      (window.restorationCommandAtMs as number) > window.restoredAtMs)
  )
    throw new Error('Exact ordered restoration command timestamp required');
  const clockStartedAtMs = operation === 'repair' ? (window.restorationCommandAtMs as number) : window.disruptionAtMs;
  if (!Array.isArray(window.samples) || !window.samples.length) throw new Error('Fresh recovery observations required');
  let last = window.disruptionAtMs - 1,
    routeAt: number | undefined,
    applicationAt: number | undefined;
  let requests = 0,
    failures = 0,
    routeRun = 0,
    applicationRun = 0;
  let routeRunAt: number | undefined, applicationRunAt: number | undefined;
  for (const sample of window.samples) {
    if (
      !Number.isFinite(sample.observedAtMs) ||
      sample.observedAtMs <= last ||
      sample.observedAtMs < window.disruptionAtMs ||
      !Number.isInteger(sample.requests) ||
      !Number.isInteger(sample.failedRequests) ||
      sample.requests < 0 ||
      sample.failedRequests < 0 ||
      sample.failedRequests > sample.requests ||
      typeof sample.routeHealthy !== 'boolean' ||
      typeof sample.applicationHealthy !== 'boolean' ||
      typeof sample.contentVerified !== 'boolean'
    )
      throw new Error('Malformed or unordered recovery observations');
    last = sample.observedAtMs;
    requests += sample.requests;
    failures += sample.failedRequests;
    if (sample.observedAtMs >= clockStartedAtMs) {
      if (sample.routeHealthy) {
        if (routeRun === 0) routeRunAt = sample.observedAtMs;
        routeRun++;
        if (routeRun >= 2) routeAt = routeRunAt;
      } else {
        routeRun = 0;
        routeAt = undefined;
        routeRunAt = undefined;
      }
      if (sample.applicationHealthy && sample.contentVerified && sample.requests > 0 && sample.failedRequests === 0) {
        if (applicationRun === 0) applicationRunAt = sample.observedAtMs;
        applicationRun++;
        if (applicationRun >= 2) applicationAt = applicationRunAt;
      } else {
        applicationRun = 0;
        applicationAt = undefined;
        applicationRunAt = undefined;
      }
    }
  }
  const routeRecoverySeconds = routeAt === undefined ? null : (routeAt - clockStartedAtMs) / 1000;
  const applicationRecoverySeconds = applicationAt === undefined ? null : (applicationAt - clockStartedAtMs) / 1000;
  const routePassed = routeRecoverySeconds !== null && routeRecoverySeconds <= 120;
  const applicationPassed = applicationRecoverySeconds !== null && applicationRecoverySeconds <= 120;
  return {
    schemaVersion: 2,
    operation,
    clockStartedAtMs,
    routeRecoverySeconds,
    applicationRecoverySeconds,
    routePassed,
    applicationPassed,
    requests,
    failedRequests: failures,
    lossFraction: requests ? failures / requests : null,
    passed: routePassed && applicationPassed,
    thresholdSeconds: 120,
    outageDurationSeconds: applicationAt === undefined ? null : (applicationAt - window.disruptionAtMs) / 1000,
    disruptionDurationSeconds: (window.restoredAtMs - window.disruptionAtMs) / 1000,
  };
}
