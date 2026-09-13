import { describe, expect, it } from 'bun:test';
import { createCePlatformService } from '../../src/ce/service';

describe('CE platform service environment', () => {
  it('rejects unscoped credential variables', async () => {
    const service = createCePlatformService({
      API_URL: 'https://tenant.example.test',
      API_TOKEN: 'test-token',
    });

    await expect(service.runtime('native')).rejects.toThrow(
      'Select an F5 context or provide its scoped API environment',
    );
  });

  it('uses the published contract loader without a local contract environment', async () => {
    const service = createCePlatformService(
      {
        XCSH_API_URL: 'https://tenant.example.test',
        XCSH_API_TOKEN: 'test-token',
        LEGACY_LOCAL_CONTRACT_DIR: '/must-not-be-read',
        LEGACY_LOCAL_CONTRACT_SHA256: 'sha256:must-not-be-read',
      },
      async () => {
        throw new Error('published release loader called');
      },
    );

    await expect(service.runtime('native')).rejects.toThrow('published release loader called');
  });
});
