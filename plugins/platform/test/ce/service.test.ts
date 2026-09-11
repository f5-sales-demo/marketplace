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

  it('recognizes the XCSH environment namespace before loading the pinned contract', async () => {
    const service = createCePlatformService({
      XCSH_API_URL: 'https://tenant.example.test',
      XCSH_API_TOKEN: 'test-token',
    });

    await expect(service.runtime('native')).rejects.toThrow(
      'Corrected CE contract publication is pending; local acceptance requires a pinned candidate',
    );
  });
});
