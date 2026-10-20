import { expect, test } from 'bun:test';
import { azureSummary, summarizeF5Evidence } from '../../src/tools/azure-ce-status';

test('missing F5 evidence stays unknown while observed false and zero remain literal', () => {
  expect(summarizeF5Evidence(undefined)).toMatchObject({
    siteState: 'UNKNOWN',
    bgpEstablished: 'UNKNOWN',
    learnedRouteCount: 'UNKNOWN',
  });
  expect(summarizeF5Evidence({ bgpEstablished: false, learnedRouteCount: 0 })).toMatchObject({
    bgpEstablished: false,
    learnedRouteCount: 0,
  });
  expect(summarizeF5Evidence({ bgpEstablished: 'false', learnedRouteCount: 'invalid' })).toMatchObject({
    bgpEstablished: 'UNKNOWN',
    learnedRouteCount: 'UNKNOWN',
  });
});
test('failed Azure reads retain unavailable coverage rather than imply an empty inventory', () => {
  const value = azureSummary({ error: true, digest: 'synthetic' }, [], { error: 'invalid JSON' });
  expect(value.coverage).toEqual({ resources: 'unavailable', vms: 'available', routeServerPeers: 'unavailable' });
  expect(value.resources).toEqual([]);
});
