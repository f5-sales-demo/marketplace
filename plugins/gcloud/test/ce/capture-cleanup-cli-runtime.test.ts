import { expect, test } from 'bun:test';
import * as gcloud from '../../src/index';

test('installed GCloud runtime exports compiled captured-cleanup CLI transport without activating a tool', () => {
  expect(typeof gcloud.createGcpCaptureCleanupCli).toBe('function');
});
