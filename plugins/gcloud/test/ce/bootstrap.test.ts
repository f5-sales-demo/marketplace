import { expect, it } from 'bun:test';
import { validateGcpBootstrapMaterial } from '../../src/ce/bootstrap';

it('rejects placeholder-only GCP bootstrap instead of treating HTTP 200 as boot support', () => {
  expect(() => validateGcpBootstrapMaterial({ cloud_init_config: '{{ .token }}' })).toThrow('only a token placeholder');
  expect(() => validateGcpBootstrapMaterial({ cloud_init_config: '{{ .Token }}' })).toThrow('only a token placeholder');
});
it('does not disclose material in errors or enable unqualified formats', () => {
  for (const value of [null, {}, { cloud_init_config: '#cloud-config\nSECRET' }, { cloud_init_config: 'SECRET' }]) {
    try {
      validateGcpBootstrapMaterial(value);
      throw new Error('accepted');
    } catch (error) {
      expect((error as Error).message).not.toContain('SECRET');
      expect((error as Error).message).not.toBe('accepted');
    }
  }
});

import { formatGcpUserData } from '../../src/ce/bootstrap';

const binding = {
  deploymentName: 'ce-test',
  siteName: 'site-test',
  nodeName: 'node-test',
  jwt: ['fixtureheader', 'fixturepayload', 'fixturesignature'].join('.'),
  expiresAt: '2026-10-18T01:00:00Z',
};
it('formats the documented GCP user-data without overwriting certified config', () => {
  const material = formatGcpUserData(binding, Date.parse('2026-10-18T00:00:00Z'));
  const parsed = Bun.YAML.parse(material) as {
    write_files: Array<{ path: string; permissions: string; content: string }>;
  };
  expect(parsed.write_files).toHaveLength(1);
  expect(parsed.write_files[0].path).toBe('/etc/vpm/user_data');
  expect(parsed.write_files[0].permissions).toBe('0600');
  expect(parsed.write_files[0].content.trim()).toBe(`token: ${binding.jwt}`);
  expect(material).not.toContain('/etc/vpm/config.yaml');
});
it('rejects expiry, unsafe binding and JWT structure injection without disclosing material', () => {
  const now = Date.parse('2026-10-18T00:00:00Z');
  for (const mutation of [
    { expiresAt: '2026-10-17T00:00:00Z' },
    { expiresAt: '2026-10-20T00:00:00Z' },
    { nodeName: 'node\ninject' },
    { jwt: 'SECRET\nwrite_files:' },
  ]) {
    try {
      formatGcpUserData({ ...binding, ...mutation }, now);
      throw new Error('accepted');
    } catch (error) {
      expect((error as Error).message).not.toContain('SECRET');
      expect((error as Error).message).not.toBe('accepted');
    }
  }
});
