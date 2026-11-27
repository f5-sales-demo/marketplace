import { expect, test } from 'bun:test';
import * as gcloud from '../../src/index';

test('normal GCloud exports compiled original cleanup runtime without replacing deployment tools', () => {
  expect(typeof gcloud.openGcpCapturedCleanupRuntime).toBe('function');
});
