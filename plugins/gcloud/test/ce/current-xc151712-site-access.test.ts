import { expect, test } from 'bun:test';
import * as access from '../../src/ce/site-access';

test('current signed15.17.12 schema maps exact SLI admin access without claiming guest health', () => {
  const mapping = access.resolveGcpSiteAccessMapping('15.17.12');
  expect(mapping.version).toBe('15.17.12');
  if (!('sourceSchemaSha256' in mapping)) throw new Error('Current mapping requires its verified schema');
  expect(mapping.sourceSchemaSha256).toBe('0ec08dc6886cf059a75db7462d33286ed24963536f09a96cde7d224ca28f2c30');
  expect(mapping.user).toBe('admin');
  expect(mapping.credentials).toBe('admin_user_credentials.ssh_key');
  expect(mapping.sshNetwork).toBe('VIRTUAL_NETWORK_SITE_LOCAL_INSIDE');
});

test('historical Site SSH mappings remain explicit and unqualified new versions refuse', () => {
  expect(access.resolveGcpSiteAccessMapping('15.17.9').version).toBe('15.17.9');
  expect(() => access.resolveGcpSiteAccessMapping('15.17.13')).toThrow();
});
