import { expect, test } from 'bun:test';
import * as terraform from '../src/index';

test('shared Terraform runtime exports concrete captured cleanup transport', () => {
  expect(typeof terraform.createInstalledCleanupExecutor).toBe('function');
});
