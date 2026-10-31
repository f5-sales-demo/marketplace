import { expect, it } from 'bun:test';
import { fingerprint } from '../../src/ce/discovery';
import { advanceGcpOperationalRounds, evaluateGcpOperationalHealth } from '../../src/ce/operational-health';
import { operationalFixture } from './operational-health.test';

it('resets consecutive healthy rounds on failure, repeated samples, gaps and fingerprint drift', () => {
  const f = operationalFixture();
  const first = evaluateGcpOperationalHealth(
    f.collection,
    f.binding,
    f.profile,
    fingerprint(f.profile),
    Date.parse('2026-10-19T18:00:10Z'),
  );
  const one = advanceGcpOperationalRounds({ consecutiveHealthy: 0 }, first, Date.parse('2026-10-19T18:00:10Z'));
  expect(one.consecutiveHealthy).toBe(1);
  expect(advanceGcpOperationalRounds(one, first, Date.parse('2026-10-19T18:00:10Z')).consecutiveHealthy).toBe(0);
  f.collection.startedAt = '2026-10-19T18:01:00Z';
  f.collection.finishedAt = '2026-10-19T18:01:01Z';
  for (const node of f.collection.nodes)
    for (const [key, read] of Object.entries(node))
      if (key !== 'nodeName' && typeof read === 'object') read.observedAt = '2026-10-19T18:01:00.500Z';
  const second = evaluateGcpOperationalHealth(
    f.collection,
    f.binding,
    f.profile,
    fingerprint(f.profile),
    Date.parse('2026-10-19T18:01:10Z'),
  );
  expect(advanceGcpOperationalRounds(one, second, Date.parse('2026-10-19T18:01:10Z')).consecutiveHealthy).toBe(2);
  expect(
    advanceGcpOperationalRounds(
      { ...one, contractFingerprint: fingerprint({ changed: true }) },
      second,
      Date.parse('2026-10-19T18:01:10Z'),
    ).consecutiveHealthy,
  ).toBe(1);
  expect(
    advanceGcpOperationalRounds(one, { ...second, status: 'unknown' }, Date.parse('2026-10-19T18:01:10Z'))
      .consecutiveHealthy,
  ).toBe(0);
  expect(advanceGcpOperationalRounds(one, second, Date.parse('2026-10-19T18:10:00Z')).consecutiveHealthy).toBe(0);
});
