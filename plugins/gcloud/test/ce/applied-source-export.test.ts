import { expect, test } from 'bun:test';
import * as gcloud from '../../src/index';

test('normal GCloud exports original applied-source cleanup capability', () => {
  expect(typeof gcloud.openGcpAppliedSourceTeardownOrigin).toBe('function');
  expect(typeof gcloud.readGcpAppliedSourceTeardownOrigin).toBe('function');
});
