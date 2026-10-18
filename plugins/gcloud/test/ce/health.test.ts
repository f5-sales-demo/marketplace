import { expect, it } from 'bun:test';
import { parseGcpGlobalHealth } from '../../src/ce/health';

it('requires matching node and exact provisioned state for global health', () => {
  expect(parseGcpGlobalHealth({ hostname: 'node-a.example', state: 'PROVISIONED' }, 'node-a').status).toBe('healthy');
  expect(parseGcpGlobalHealth({ hostname: 'node-a', state: 'PROVISIONING' }, 'node-a').status).toBe('degraded');
  for (const value of [
    { hostname: 'foreign', state: 'PROVISIONED' },
    { hostname: 'node-a', state: 'ONLINE' },
    null,
    {},
  ])
    expect(parseGcpGlobalHealth(value, 'node-a').status).toBe('unknown');
});
it('does not export private runtime fields or treat registration as health', () => {
  const result = parseGcpGlobalHealth({ hostname: 'node-a', state: 'PROVISIONED', token: 'PRIVATE' }, 'node-a');
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
  expect(result.scope).toBe('site-global-only');
  expect(parseGcpGlobalHealth({ current_state: 'ONLINE' }, 'node-a').status).toBe('unknown');
});
