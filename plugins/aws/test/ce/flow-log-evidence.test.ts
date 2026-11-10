import { expect, test } from 'bun:test';
import { interpretFlowLogEvents } from '../../src/ce/flow-log-evidence';

const scope = { accountId: '123456789012', interfaceIds: ['eni-11111111'], start: 100000, end: 200000 };
function event(action = 'ACCEPT') {
  return {
    timestamp: 150000,
    message: `2 ${scope.accountId} eni-11111111 10.0.0.1 10.0.0.2 80 443 6 1 64 120 130 ${action} OK`,
  };
}
test('Flow Log samples distinguish acceptance and rejection without raw network traces', () => {
  const result = interpretFlowLogEvents({ events: [event(), event('REJECT')] }, scope);
  expect(result.status).toBe('rejections-observed');
  expect(result.accepted).toBe(1);
  expect(result.rejected).toBe(1);
  expect(result.canSatisfyTrafficGate).toBe(false);
  expect(JSON.stringify(result)).not.toContain('10.0.0.1');
});
test('custom Flow Log formats bind account, interface and record timestamps', () => {
  const format = '${interface-id} ${account-id} ${end} ${start} ${log-status} ${action}';
  expect(
    interpretFlowLogEvents(
      { events: [{ timestamp: 150000, message: `eni-11111111 ${scope.accountId} 130 120 OK ACCEPT` }] },
      scope,
      format,
    ).status,
  ).toBe('accepts-observed');
  expect(() => interpretFlowLogEvents({ events: [event()] }, scope, '${action}')).toThrow('identity');
});
test('partial, stale, malformed and wrong-resource log evidence cannot become healthy', () => {
  for (const response of [
    { events: [event()], nextToken: 'more' },
    { events: [{ ...event(), timestamp: 1 }] },
    { events: [{ ...event(), message: event().message.replace('eni-11111111', 'eni-22222222') }] },
    {
      events: [{ ...event(), message: event().message.replace(scope.accountId, String(Number(scope.accountId) + 1)) }],
    },
    { events: [{ ...event(), message: event().message.replace('120 130', '20 30') }] },
    { events: [event('INVALID')] },
    { events: [null] },
  ])
    expect(() => interpretFlowLogEvents(response, scope)).toThrow();
  expect(interpretFlowLogEvents({ events: [] }, scope).status).toBe('unknown');
  expect(
    interpretFlowLogEvents(
      { events: [{ ...event(), message: event().message.replace('ACCEPT OK', '- SKIPDATA') }] },
      scope,
    ).status,
  ).toBe('unknown');
});
