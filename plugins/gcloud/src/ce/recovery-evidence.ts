export interface GcpRecoverySample {
  observedAtMs: number;
  routeHealthy: boolean;
  applicationHealthy: boolean;
  requests: number;
  failedRequests: number;
  contentVerified: boolean;
}
export interface GcpRecoveryWindow {
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
  if (!Array.isArray(window.samples) || !window.samples.length) throw new Error('Fresh recovery observations required');
  let last = window.disruptionAtMs - 1,
    routeAt: number | undefined,
    applicationAt: number | undefined;
  let requests = 0,
    failures = 0;
  for (const [index, sample] of window.samples.entries()) {
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
    if (sample.observedAtMs >= window.restoredAtMs) {
      // Require two consecutive healthy observations; a transient success is
      // not recovery, and the first sample's timestamp is the convergence time.
      const previous = window.samples[index - 1];
      if (previous && previous.observedAtMs >= window.restoredAtMs) {
        if (routeAt === undefined && previous.routeHealthy && sample.routeHealthy) routeAt = previous.observedAtMs;
        if (
          applicationAt === undefined &&
          previous.applicationHealthy &&
          previous.contentVerified &&
          previous.requests > 0 &&
          previous.failedRequests === 0 &&
          sample.applicationHealthy &&
          sample.contentVerified &&
          sample.requests > 0 &&
          sample.failedRequests === 0
        )
          applicationAt = previous.observedAtMs;
      }
    }
  }
  const routeRecoverySeconds = routeAt === undefined ? null : (routeAt - window.restoredAtMs) / 1000;
  const applicationRecoverySeconds = applicationAt === undefined ? null : (applicationAt - window.restoredAtMs) / 1000;
  const routePassed = routeRecoverySeconds !== null && routeRecoverySeconds <= 120;
  const applicationPassed = applicationRecoverySeconds !== null && applicationRecoverySeconds <= 120;
  return {
    routeRecoverySeconds,
    applicationRecoverySeconds,
    routePassed,
    applicationPassed,
    requests,
    failedRequests: failures,
    lossFraction: requests ? failures / requests : null,
    passed: routePassed && applicationPassed,
    thresholdSeconds: 120,
    disruptionDurationSeconds: (window.restoredAtMs - window.disruptionAtMs) / 1000,
  };
}
