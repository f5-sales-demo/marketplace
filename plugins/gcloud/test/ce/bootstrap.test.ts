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
