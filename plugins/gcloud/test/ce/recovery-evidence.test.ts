import { expect, it } from 'bun:test';
import { evaluateGcpRecovery, type GcpRecoverySample } from '../../src/ce/recovery-evidence';

function sample(seconds: number, route: boolean, app: boolean, failed = 0, content = app): GcpRecoverySample {
  return {
    observedAtMs: seconds * 1000,
    routeHealthy: route,
    applicationHealthy: app,
    requests: 10,
    failedRequests: failed,
    contentVerified: content,
  };
}
it('records route and application recovery separately from outage duration and packet loss', () => {
  const result = evaluateGcpRecovery({
    disruptionAtMs: 0,
    restoredAtMs: 20000,
    deadlineSeconds: 120,
    samples: [
      sample(5, false, false, 10),
      sample(25, true, false, 5),
      sample(30, true, false, 3),
      sample(40, true, true),
      sample(45, true, true),
    ],
  });
  expect(result.routeRecoverySeconds).toBe(5);
  expect(result.applicationRecoverySeconds).toBe(20);
  expect(result.failedRequests).toBe(18);
  expect(result.lossFraction).toBe(18 / 50);
  expect(result.passed).toBe(true);
});
it('healthy routes do not pass content traffic recovery and late recovery fails the threshold', () => {
  const result = evaluateGcpRecovery({
    disruptionAtMs: 0,
    restoredAtMs: 10000,
    deadlineSeconds: 120,
    samples: [
      sample(15, true, true, 0, false),
      sample(20, true, true, 0, false),
      sample(131, true, true),
      sample(136, true, true),
    ],
  });
  expect(result.routePassed).toBe(true);
  expect(result.applicationRecoverySeconds).toBe(121);
  expect(result.applicationPassed).toBe(false);
  expect(result.passed).toBe(false);
});
it('a single success or an unknown/no-request sample cannot establish application recovery', () => {
  const result = evaluateGcpRecovery({
    disruptionAtMs: 0,
    restoredAtMs: 10000,
    deadlineSeconds: 120,
    samples: [sample(15, true, true), { ...sample(20, true, true), requests: 0 }, sample(25, false, false)],
  });
  expect(result.applicationRecoverySeconds).toBeNull();
});
it('rejects caller threshold changes, duplicate timestamps and impossible loss counts', () => {
  expect(() =>
    evaluateGcpRecovery({
      disruptionAtMs: 0,
      restoredAtMs: 1000,
      deadlineSeconds: 121,
      samples: [sample(2, true, true)],
    }),
  ).toThrow('120-second');
  expect(() =>
    evaluateGcpRecovery({
      disruptionAtMs: 0,
      restoredAtMs: 1000,
      deadlineSeconds: 120,
      samples: [sample(2, true, true), sample(2, true, true)],
    }),
  ).toThrow('unordered');
  expect(() =>
    evaluateGcpRecovery({
      disruptionAtMs: 0,
      restoredAtMs: 1000,
      deadlineSeconds: 120,
      samples: [sample(2, false, false, 11)],
    }),
  ).toThrow('Malformed');
});
