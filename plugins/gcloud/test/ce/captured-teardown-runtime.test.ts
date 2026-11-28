import { expect, test } from 'bun:test';
import * as gcloud from '../../src/index';

test('normal GCloud runtime exports source provenance and reviewed cleanup reader without activating creation', () => {
  expect(typeof gcloud.openGcpCapturedTeardownOrigin).toBe('function');
  expect(typeof gcloud.readGcpCapturedTeardownOrigin).toBe('function');
  expect(typeof gcloud.readPublicTerraformCleanupOwnership).toBe('function');
});
